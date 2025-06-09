const { 
  run,
  checkFunctionExists
} = require('../index');
const core = require('@actions/core');
const { 
  LambdaClient, 
  GetFunctionCommand,
  CreateFunctionCommand
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
    
    // Setup core mocks
    core.getInput.mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'zip-file-path': './test.zip',
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
    
    // Mock Lambda client
    mockSend = jest.fn();
    mockLambdaClient = {
      send: mockSend
    };
    
    // Mock the constructor to return our mockLambdaClient
    LambdaClient.mockImplementation(() => mockLambdaClient);
    
    // Mock command constructors
    GetFunctionCommand.mockImplementation((params) => ({
      ...params,
      type: 'GetFunctionCommand'
    }));
    
    CreateFunctionCommand.mockImplementation((params) => ({
      ...params,
      type: 'CreateFunctionCommand'
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
        type: 'GetFunctionCommand'
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
        type: 'GetFunctionCommand'
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
        type: 'GetFunctionCommand'
      }));
    });
  });

  describe('Create function when it does not exist', () => {
    it('should create a new function when it does not exist', async () => {
      // Mock function check to return false (function doesn't exist)
      mockSend.mockImplementation(async (command) => {
        if (command.type === 'GetFunctionCommand') {
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

      // Run the main function
      await run();

      // Verify GetFunctionCommand was called to check if function exists
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionCommand'
      }));

      // Verify CreateFunctionCommand was called with expected parameters
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        Runtime: 'nodejs18.x',
        Role: 'arn:aws:iam::123456789012:role/lambda-role',
        Handler: 'index.handler',
        Code: expect.objectContaining({
          ZipFile: expect.any(Buffer)
        }),
        type: 'CreateFunctionCommand'
      }));

      // Verify appropriate logs were shown
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Checking if test-function exists'));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Function test-function doesn\'t exist, creating new function'));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Creating new Lambda function'));
      
      // Verify no errors were reported
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should fail if role is not provided when creating a new function', async () => {
      // Override the mock to return no role
      core.getInput.mockImplementation((name) => {
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'zip-file-path': './test.zip',
          'runtime': 'nodejs18.x',
          'handler': 'index.handler'
        };
        return inputs[name] || '';
      });

      // Mock function check to return false (function doesn't exist)
      mockSend.mockImplementation(async (command) => {
        if (command.type === 'GetFunctionCommand') {
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
        type: 'GetFunctionCommand'
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
        if (command.type === 'GetFunctionCommand') {
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
        type: 'GetFunctionCommand'
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
});
