const { 
  run,
  checkFunctionExists
} = require('../index');
const core = require('@actions/core');
const { 
  LambdaClient, 
  GetFunctionConfigurationCommand,
  CreateFunctionCommand,
  UpdateFunctionConfigurationCommand,
  UpdateFunctionCodeCommand
} = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda');
jest.mock('fs/promises');

describe('Lambda Function Existence Check and Creation', () => {
  let mockLambdaClient;
  let mockSend;
  
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Mock validateAllInputs from validations
    jest.spyOn(require('../validations'), 'validateAllInputs').mockReturnValue({
      valid: true,
      functionName: 'test-function',
      region: 'us-east-1',
      codeArtifactsDir: './src',
      role: 'arn:aws:iam::123456789012:role/lambda-role',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      ephemeralStorage: 512,
      parsedMemorySize: 128,
      timeout: 3,
      packageType: 'Zip',
      dryRun: false,
      publish: true,
      architectures: 'x86_64',
      functionDescription: 'Test function',
      kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test-key',
      codeSigningConfigArn: 'arn:aws:lambda:us-east-1:123456789012:code-signing-config:abc123'
    });
    
    // Setup core mocks
    core.getInput.mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'code-artifacts-dir': './src',
        'role': 'arn:aws:iam::123456789012:role/lambda-role',
        'runtime': 'nodejs18.x',
        'handler': 'index.handler'
      };
      return inputs[name] || '';
    });
    
    core.getBooleanInput.mockReturnValue(false);
    core.info = jest.fn();
    core.setFailed = jest.fn();
    core.setOutput = jest.fn();
    
    // Mock file system operations
    fs.readFile.mockResolvedValue(Buffer.from('mock zip content'));
    fs.readdir.mockResolvedValue(['index.js', 'package.json']);
    fs.mkdir.mockResolvedValue();
    fs.cp.mockResolvedValue();
    fs.rm.mockResolvedValue();
    
    // Mock Lambda client
    mockSend = jest.fn();
    mockLambdaClient = {
      send: mockSend
    };
    
    // Mock the constructor to return our mockLambdaClient
    LambdaClient.mockImplementation(() => mockLambdaClient);
    
    // Mock command constructors
    GetFunctionConfigurationCommand.mockImplementation((params) => ({
      ...params,
      type: 'GetFunctionConfigurationCommand'
    }));
    
    CreateFunctionCommand.mockImplementation((params) => ({
      ...params,
      type: 'CreateFunctionCommand'
    }));
    
    UpdateFunctionConfigurationCommand.mockImplementation((params) => ({
      ...params,
      type: 'UpdateFunctionConfigurationCommand'
    }));
    
    UpdateFunctionCodeCommand.mockImplementation((params) => ({
      ...params,
      type: 'UpdateFunctionCodeCommand'
    }));
  });

  describe('checkFunctionExists', () => {
    it('should return true when the function exists', async () => {
      // Mock successful response for GetFunctionCommand
      mockSend.mockResolvedValueOnce({
        Configuration: {
          FunctionName: 'test-function'
        }
      });
      
      const result = await checkFunctionExists(mockLambdaClient, 'test-function');
      
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionConfigurationCommand'
      }));
    });

    it('should return false when the function does not exist', async () => {
      // Mock ResourceNotFoundException for GetFunctionCommand
      const error = new Error('Function not found');
      error.name = 'ResourceNotFoundException';
      mockSend.mockRejectedValueOnce(error);
      
      const result = await checkFunctionExists(mockLambdaClient, 'test-function');
      
      expect(result).toBe(false);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionConfigurationCommand'
      }));
    });

    it('should propagate other errors', async () => {
      // Mock a different error for GetFunctionCommand
      const error = new Error('Network error');
      error.name = 'NetworkError';
      mockSend.mockRejectedValueOnce(error);
      
      await expect(checkFunctionExists(mockLambdaClient, 'test-function'))
        .rejects.toThrow('Network error');
      
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionConfigurationCommand'
      }));
    });
  });

  describe('Create function when it does not exist', () => {
    it('should create a new function when it does not exist', async () => {
      // Mock the architecture value for test purposes
      core.getInput.mockImplementation((name) => {
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './src',
          'role': 'arn:aws:iam::123456789012:role/lambda-role',
          'runtime': 'nodejs20.x',
          'handler': 'index.handler',
          'architectures': 'x86_64',
          'timeout': '3',
          'publish': 'true',
          'ephemeral-storage': '512',
          'function-description': 'Test function',
          'environment': '{"NODE_ENV":"production"}',
          'vpc-config': '{"SubnetIds":["subnet-123"],"SecurityGroupIds":["sg-123"]}',
          'kms-key-arn': 'arn:aws:kms:us-east-1:123456789012:key/test-key',
          'code-signing-config-arn': 'arn:aws:lambda:us-east-1:123456789012:code-signing-config:abc123'
        };
        return inputs[name] || '';
      });
      
      // Mock getBooleanInput to return true for publish
      core.getBooleanInput.mockImplementation((name) => {
        const inputs = {
          'publish': true,
          'dry-run': false
        };
        return inputs[name] || false;
      });
      
      // Mock validations for JSON inputs
      jest.spyOn(require('../validations'), 'parseJsonInput').mockImplementation((jsonString) => {
        if (jsonString === '{"NODE_ENV":"production"}') {
          return { NODE_ENV: 'production' };
        }
        if (jsonString === '{"SubnetIds":["subnet-123"],"SecurityGroupIds":["sg-123"]}') {
          return { SubnetIds: ['subnet-123'], SecurityGroupIds: ['sg-123'] };
        }
        return JSON.parse(jsonString);
      });
      
      // Mock function check to return false (function doesn't exist)
      mockSend.mockImplementation(async (command) => {
        if (command.type === 'GetFunctionConfigurationCommand') {
          const error = new Error('Function not found');
          error.name = 'ResourceNotFoundException';
          throw error;
        } else if (command.type === 'CreateFunctionCommand') {
          return {
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
            Version: '1'
          };
        }
      });
      
      // Mock cleanNullKeys to ensure it's tested
      jest.spyOn(require('../index'), 'cleanNullKeys').mockImplementation((obj) => {
        return obj; // For testing simplicity, just return the object
      });

      // Run the main function
      await run();

      // Verify GetFunctionCommand was called to check if function exists
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionConfigurationCommand'
      }));

      // Verify CreateFunctionCommand was called 
      expect(mockSend).toHaveBeenCalledTimes(2);
      
      // Get the second call arguments
      const secondCallArg = mockSend.mock.calls[1][0];
      
      // Verify specific fields individually
      expect(secondCallArg.type).toBe('CreateFunctionCommand');
      expect(secondCallArg.FunctionName).toBe('test-function');
      expect(secondCallArg.Runtime).toBe('nodejs20.x');
      expect(secondCallArg.Role).toBe('arn:aws:iam::123456789012:role/lambda-role');
      expect(secondCallArg.Handler).toBe('index.handler');
      expect(secondCallArg.Description).toBe('Test function');
      expect(secondCallArg.Code).toBeDefined();
      expect(secondCallArg.Code.ZipFile).toBeDefined();
      expect(secondCallArg.EphemeralStorage).toEqual({ Size: 512 });
      expect(secondCallArg.KMSKeyArn).toBe('arn:aws:kms:us-east-1:123456789012:key/test-key');
      expect(secondCallArg.CodeSigningConfigArn).toBe('arn:aws:lambda:us-east-1:123456789012:code-signing-config:abc123');

      // Verify appropriate logs were shown
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Checking if test-function exists'));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Function test-function doesn\'t exist, creating new function'));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Creating new Lambda function'));
      
      // Verify no errors were reported
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should fail if role is not provided when creating a new function', async () => {
      // Override validateAllInputs to return valid but without role
      jest.spyOn(require('../validations'), 'validateAllInputs').mockReturnValue({
        valid: true,
        functionName: 'test-function',
        region: 'us-east-1',
        codeArtifactsDir: './src',
        runtime: 'nodejs20.x',
        handler: 'index.handler',
        ephemeralStorage: 512,
        parsedMemorySize: 128,
        timeout: 3,
        packageType: 'Zip',
        dryRun: false,
        publish: true,
        architectures: 'x86_64',
        role: undefined, // No role provided
      });

      // Mock function check to return false (function doesn't exist)
      mockSend.mockImplementation(async (command) => {
        if (command.type === 'GetFunctionConfigurationCommand') {
          const error = new Error('Function not found');
          error.name = 'ResourceNotFoundException';
          throw error;
        }
      });

      // Run the main function
      await run();

      // Verify GetFunctionCommand was called to check if function exists
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionConfigurationCommand'
      }));

      // Verify error was reported
      expect(core.setFailed).toHaveBeenCalledWith('Role ARN must be provided when creating a new function');
      
      // Verify CreateFunctionCommand was NOT called
      expect(mockSend).not.toHaveBeenCalledWith(expect.objectContaining({
        type: 'CreateFunctionCommand'
      }));
    });

    it('should handle errors during function creation', async () => {
      // Mock function check to return false (function doesn't exist)
      mockSend.mockImplementation(async (command) => {
        if (command.type === 'GetFunctionConfigurationCommand') {
          const error = new Error('Function not found');
          error.name = 'ResourceNotFoundException';
          throw error;
        } else if (command.type === 'CreateFunctionCommand') {
          throw new Error('Failed to create function');
        }
      });

      // Run the main function
      await run();

      // Verify GetFunctionCommand was called to check if function exists
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionConfigurationCommand'
      }));

      // Verify CreateFunctionCommand was called
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'CreateFunctionCommand'
      }));

      // Verify error was reported
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Failed to create function'));
    });
  });
  
  describe('Error handling tests', () => {
    it('should handle ThrottlingException errors', async () => {
      // Mock function check to throw a throttling error
      mockSend.mockImplementation(async () => {
        const error = new Error('Rate exceeded');
        error.name = 'ThrottlingException';
        throw error;
      });

      // Run the main function
      await run();

      // Verify error was reported with the correct message
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Rate limit exceeded and maximum retries reached'));
    });

    it('should handle 5xx server errors', async () => {
      // Mock function check to throw a server error
      mockSend.mockImplementation(async () => {
        const error = new Error('Internal server error');
        error.$metadata = { httpStatusCode: 500 };
        throw error;
      });

      // Run the main function
      await run();

      // Verify error was reported with the correct message
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Server error (500)'));
    });

    it('should handle permission errors', async () => {
      // Mock function check to throw a permission error
      mockSend.mockImplementation(async () => {
        const error = new Error('Insufficient permissions');
        error.name = 'AccessDeniedException';
        throw error;
      });

      // Run the main function
      await run();

      // Verify error was reported with the correct message
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Permissions error'));
    });
  });
});
