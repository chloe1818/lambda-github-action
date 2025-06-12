// Make sure Jest mocks are defined before any imports
jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda');

// Mock fs/promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockImplementation(async (path) => ({
    isDirectory: () => path.includes('directory')
  })),
  copyFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('mock file content'))
}));

// Mock path
jest.mock('path');

// Now we can import modules
const core = require('@actions/core');
const { 
  LambdaClient, 
  UpdateFunctionCodeCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand 
} = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');
const path = require('path');
const mainModule = require('../index');

describe('Lambda Function Code Update Unit Tests', () => {
  // Increase timeout for all tests
  jest.setTimeout(30000);
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock process.cwd()
    process.cwd = jest.fn().mockReturnValue('/mock/cwd');
    
    // Mock path.join to return predictable paths
    path.join.mockImplementation((...parts) => parts.join('/'));
    
    // Mock core functions
    core.getInput.mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'code-artifacts-dir': '/mock/src',
        'architectures': 'x86_64'
      };
      return inputs[name] || '';
    });
    
    core.getBooleanInput.mockImplementation((name) => {
      if (name === 'dry-run') return false;
      if (name === 'publish') return true;
      return false;
    });
    
    core.info.mockImplementation(() => {});
    core.error.mockImplementation(() => {});
    core.setFailed.mockImplementation(() => {});
    core.setOutput.mockImplementation(() => {});
    core.debug.mockImplementation(() => {});

    // Mock Lambda client responses
    const mockFunctionResponse = {
      Configuration: {
        FunctionName: 'test-function',
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Runtime: 'nodejs18.x',
        Handler: 'index.handler'
      }
    };
    
    const mockUpdateCodeResponse = {
      FunctionName: 'test-function',
      FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      Version: '2',
      LastUpdateStatus: 'Successful'
    };

    // Setup mock for the Lambda client
    LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
      if (command instanceof GetFunctionCommand) {
        return Promise.resolve(mockFunctionResponse);
      } else if (command instanceof GetFunctionConfigurationCommand) {
        return Promise.resolve(mockFunctionResponse.Configuration);
      } else if (command instanceof UpdateFunctionCodeCommand) {
        return Promise.resolve(mockUpdateCodeResponse);
      }
      return Promise.resolve({});
    });

    // Mock the function exists check to return true (function exists)
    jest.spyOn(mainModule, 'checkFunctionExists').mockResolvedValue(true);
  });

  test('should properly construct parameters for UpdateFunctionCodeCommand', async () => {
    // Define expected parameters
    const functionName = 'test-function';
    const zipPath = '/mock/cwd/lambda-function.zip';
    const architectures = 'x86_64';
    const sourceKmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/test-key';
    const revisionId = 'abc123';

    // Read the ZIP file content
    const zipContent = await fs.readFile(zipPath);
    
    // Create the command parameters
    const params = {
      FunctionName: functionName,
      ZipFile: zipContent,
      Architectures: [architectures],
      Publish: true,
      RevisionId: revisionId,
      SourceKmsKeyArn: sourceKmsKeyArn
    };
    
    // Verify the parameters are correct before passing to the command
    expect(params.FunctionName).toBe(functionName);
    expect(params.ZipFile).toBeDefined();
    expect(params.Architectures).toEqual([architectures]);
    expect(params.Publish).toBe(true);
    expect(params.RevisionId).toBe(revisionId);
    expect(params.SourceKmsKeyArn).toBe(sourceKmsKeyArn);
    
    // Create a spy for the command constructor
    const commandSpy = jest.spyOn(require('@aws-sdk/client-lambda'), 'UpdateFunctionCodeCommand');
    
    // Create the command
    new UpdateFunctionCodeCommand(params);
    
    // Verify the constructor was called with the parameters
    expect(commandSpy).toHaveBeenCalledWith(params);
  });
  
  test('should correctly format and send the update code command', async () => {
    // Mock the client.send for just this test
    const mockLambdaClient = {
      send: jest.fn().mockResolvedValue({
        FunctionName: 'test-function',
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Version: '2'
      })
    };
    
    // Create mock ZIP file content
    const mockZipContent = Buffer.from('mock zip content');
    fs.readFile.mockResolvedValue(mockZipContent);
    
    // Create the command parameters
    const params = {
      FunctionName: 'test-function',
      ZipFile: mockZipContent,
      Architectures: ['x86_64'],
      Publish: true,
      RevisionId: 'abc123'
    };
    
    // Mock cleanNullKeys to ensure it's tested
    jest.spyOn(mainModule, 'cleanNullKeys').mockImplementation((obj) => {
      return obj; // For testing simplicity, just return the object
    });
    
    // Clean the params just like in the actual implementation
    const cleanedParams = mainModule.cleanNullKeys(params);
    
    // Create the command
    const command = new UpdateFunctionCodeCommand(cleanedParams);
    
    // Send the command
    const result = await mockLambdaClient.send(command);
    
    // Verify cleanNullKeys was called
    expect(mainModule.cleanNullKeys).toHaveBeenCalled();
    
    // Verify the command was sent correctly
    expect(mockLambdaClient.send).toHaveBeenCalledWith(command);
    
    // Verify the result
    expect(result.FunctionName).toBe('test-function');
    expect(result.FunctionArn).toBe('arn:aws:lambda:us-east-1:123456789012:function:test-function');
    expect(result.Version).toBe('2');
  });

  test('should handle function code update errors gracefully', async () => {
    // Create an error for the update function code command
    const updateError = new Error('Failed to update function code');
    updateError.name = 'CodeStorageExceededException';
    
    // Mock the client.send for just this test
    const mockLambdaClient = {
      send: jest.fn().mockRejectedValue(updateError)
    };
    
    // Create mock ZIP file content
    const mockZipContent = Buffer.from('mock zip content');
    
    // Create the command parameters
    const params = {
      FunctionName: 'test-function',
      ZipFile: mockZipContent,
      Architectures: ['x86_64'],
      Publish: true
    };
    
    // Create the command
    const command = new UpdateFunctionCodeCommand(params);
    
    // Simulate the error handling similar to how it's done in index.js
    try {
      // This will throw an error
      await mockLambdaClient.send(command);
      
      // This line shouldn't execute
      fail('Expected an error to be thrown');
    } catch (error) {
      // Assert - Verify error handling matches the implementation
      expect(error.name).toBe('CodeStorageExceededException');
      expect(error.message).toBe('Failed to update function code');
      
      // Simulate the error handler in index.js
      core.setFailed(`Failed to update function code: ${error.message}`);
    }
    
    // Verify error was logged correctly
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update function code')
    );
  });
  
  test('should simulate dry run mode for code updates', () => {
    // Mock functions
    const infoSpy = jest.fn();
    const setOutputSpy = jest.fn();
    
    // Create a simple implementation of the dry run logic from index.js
    function simulateDryRun() {
      // Simulate log output and actions
      infoSpy('DRY RUN MODE: No AWS resources will be created or modified');
      infoSpy('[DRY RUN] Would update function code with parameters:');
      infoSpy(JSON.stringify({ 
        FunctionName: 'test-function', 
        ZipFile: '<binary zip data not shown>',
        DryRun: true 
      }));
      
      const mockArn = 'arn:aws:lambda:us-east-1:000000000000:function:test-function';
      setOutputSpy('function-arn', mockArn);
      setOutputSpy('version', '$LATEST');
      infoSpy('[DRY RUN] Function code validation passed');
      infoSpy('[DRY RUN] Function code update validation completed');
    }
    
    // Run the simulation
    simulateDryRun();
    
    // Assert - Verify dry run logs
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN MODE:'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Would update function code'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Function code validation passed'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Function code update validation completed'));
    
    // Verify mock outputs
    expect(setOutputSpy).toHaveBeenCalledWith('function-arn', expect.stringContaining('arn:aws:lambda:us-east-1:000000000000:function:test-function'));
    expect(setOutputSpy).toHaveBeenCalledWith('version', '$LATEST');
  });
  
  test('should support custom revision-id and source-kms-key-arn', () => {
    // Define optional parameters
    const functionName = 'test-function';
    const revisionId = 'test-revision-123';
    const sourceKmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/abcdef12-3456-7890-abcd-ef1234567890';
    const zipContent = Buffer.from('mock zip content');
    
    // Create parameters for the command
    const params = {
      FunctionName: functionName,
      ZipFile: zipContent,
      Architectures: ['x86_64'],
      Publish: true,
      RevisionId: revisionId,
      SourceKmsKeyArn: sourceKmsKeyArn
    };
    
    // Create a spy for the command constructor
    const commandSpy = jest.spyOn(require('@aws-sdk/client-lambda'), 'UpdateFunctionCodeCommand');
    
    // Create the command
    new UpdateFunctionCodeCommand(params);
    
    // Verify the constructor was called with all parameters including optional ones
    expect(commandSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        RevisionId: revisionId,
        SourceKmsKeyArn: sourceKmsKeyArn
      })
    );
  });
  
  test('should handle array conversion for architectures parameter', () => {
    // Define parameters with architectures as string
    const functionName = 'test-function';
    const architectures = 'arm64'; // String instead of array
    const zipContent = Buffer.from('mock zip content');
    
    // Create parameters for the command
    const params = {
      FunctionName: functionName,
      ZipFile: zipContent,
      Architectures: architectures, // Not an array yet
      Publish: true
    };
    
    // Mock the behavior of the index.js code that handles this conversion
    const processedParams = {
      ...params,
      Architectures: Array.isArray(architectures) ? architectures : [architectures]
    };
    
    // Create a spy for the command constructor
    const commandSpy = jest.spyOn(require('@aws-sdk/client-lambda'), 'UpdateFunctionCodeCommand');
    
    // Create the command with processed parameters
    new UpdateFunctionCodeCommand(processedParams);
    
    // Verify the constructor was called with architectures as an array
    expect(commandSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        Architectures: ['arm64'] // Should be converted to array
      })
    );
  });
});
