const { run } = require('../index');
const core = require('@actions/core');
const validations = require('../validations');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('../validations');
jest.mock('@aws-sdk/client-lambda');
jest.mock('fs/promises');

describe('Error handling tests', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup core mocks
    core.getInput = jest.fn();
    core.getBooleanInput = jest.fn();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.setFailed = jest.fn();
    core.debug = jest.fn();
    
    // Mock validations
    validations.validateAllInputs.mockReturnValue({
      valid: true,
      functionName: 'test-function',
      region: 'us-east-1',
      zipFilePath: './test.zip',
      role: 'arn:aws:iam::123456789012:role/lambda-role',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      ephemeralStorage: 512,
      timeout: 3,
      packageType: 'Zip',
      dryRun: false,
      publish: true,
      architectures: 'x86_64'
    });

    // Mock fs.readFile
    fs.readFile.mockResolvedValue(Buffer.from('mock zip content'));
  });

  test('should handle ThrottlingException', async () => {
    // Setup LambdaClient to throw a ThrottlingException
    const throttlingError = new Error('Rate exceeded');
    throttlingError.name = 'ThrottlingException';
    
    // Mock the LambdaClient constructor and send method
    LambdaClient.prototype.send = jest.fn().mockRejectedValue(throttlingError);
    
    // Execute the run function
    await run();
    
    // Verify the warning was logged
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('AWS throttling detected'));
  });

  test('should handle AccessDeniedException', async () => {
    // Setup LambdaClient to throw an AccessDeniedException
    const accessError = new Error('User is not authorized to perform: lambda:GetFunction');
    accessError.name = 'AccessDeniedException';
    
    // Mock the LambdaClient constructor and send method
    LambdaClient.prototype.send = jest.fn().mockRejectedValue(accessError);
    
    // Execute the run function
    await run();
    
    // Verify the error was logged
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Permissions error:'));
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('User is not authorized'));
  });

  test('should handle other generic errors', async () => {
    // Setup LambdaClient to throw a generic error
    const genericError = new Error('Some unexpected error');
    genericError.name = 'InternalFailure';
    genericError.stack = 'Error stack trace';
    
    // Mock the LambdaClient constructor and send method
    LambdaClient.prototype.send = jest.fn().mockRejectedValue(genericError);
    
    // Execute the run function
    await run();
    
    // Verify the error was logged
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Action failed with error: Some unexpected error'));
    expect(core.debug).toHaveBeenCalledWith('Error stack trace');
  });

  test('should stop execution when inputs are invalid', async () => {
    // Setup validations to return invalid result
    validations.validateAllInputs.mockReturnValue({ valid: false });
    
    // Execute the run function
    await run();
    
    // Verify that no further processing was done
    expect(LambdaClient).not.toHaveBeenCalled();
  });

  test('should handle errors during function creation', async () => {
    // Mock validations
    validations.validateAllInputs.mockReturnValue({
      valid: true,
      functionName: 'test-function',
      region: 'us-east-1',
      zipFilePath: './test.zip',
      role: 'arn:aws:iam::123456789012:role/lambda-role',
      runtime: 'nodejs18.x',
      handler: 'index.handler'
    });
    
    // Setup LambdaClient to throw an error during function creation
    const creationError = new Error('Error during function creation');
    creationError.stack = 'Creation error stack trace';
    
    // Mock the LambdaClient constructor and send methods
    LambdaClient.prototype.send = jest.fn()
      .mockImplementationOnce(() => {
        // First call is to checkFunctionExists, return false (function doesn't exist)
        const error = new Error('Function not found');
        error.name = 'ResourceNotFoundException';
        throw error;
      })
      .mockImplementationOnce(() => {
        // Second call is to create function, throw an error
        throw creationError;
      });
    
    // Execute the run function
    await run();
    
    // Verify the error was logged
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Failed to create function:'));
    expect(core.debug).toHaveBeenCalledWith('Creation error stack trace');
  });

  test('should handle errors during function config update', async () => {
    // Setup LambdaClient mock responses
    const mockFunctionResponse = {
      Configuration: {
        FunctionName: 'test-function',
        Runtime: 'nodejs14.x',  // Different from what we'll update to
        Role: 'arn:aws:iam::123456789012:role/old-role',
        Handler: 'index.oldHandler'
      }
    };
    
    const configUpdateError = new Error('Error updating function configuration');
    configUpdateError.stack = 'Config update error stack trace';
    
    // Mock the LambdaClient constructor and send methods
    LambdaClient.prototype.send = jest.fn()
      .mockImplementationOnce(() => {
        // First call is to checkFunctionExists, return true (function exists)
        return mockFunctionResponse;
      })
      .mockImplementationOnce(() => {
        // Second call is to GetFunctionConfigurationCommand
        return mockFunctionResponse.Configuration;
      })
      .mockImplementationOnce(() => {
        // Third call is to UpdateFunctionConfigurationCommand, throw an error
        throw configUpdateError;
      });
    
    // Execute the run function
    await run();
    
    // Verify the error was logged
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Failed to update function configuration:'));
    expect(core.debug).toHaveBeenCalledWith('Config update error stack trace');
  });

  test('should handle errors during function code update', async () => {
    // Setup LambdaClient mock responses
    const mockFunctionResponse = {
      Configuration: {
        FunctionName: 'test-function',
        Runtime: 'nodejs18.x',  // Same as what we'll update to (no config change)
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler'
      }
    };
    
    const codeUpdateError = new Error('Error updating function code');
    codeUpdateError.stack = 'Code update error stack trace';
    
    // Mock the LambdaClient constructor and send methods
    LambdaClient.prototype.send = jest.fn()
      .mockImplementationOnce(() => {
        // First call is to checkFunctionExists, return true (function exists)
        return mockFunctionResponse;
      })
      .mockImplementationOnce(() => {
        // Second call is to GetFunctionConfigurationCommand
        return mockFunctionResponse.Configuration;
      })
      .mockImplementationOnce(() => {
        // Third call is to UpdateFunctionCodeCommand, throw an error
        throw codeUpdateError;
      });
    
    // Execute the run function
    await run();
    
    // Verify the error was logged
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Failed to update function code:'));
    expect(core.debug).toHaveBeenCalledWith('Code update error stack trace');
  });
});
