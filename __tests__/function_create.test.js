const core = require('@actions/core');
const { LambdaClient, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
const { checkFunctionExists } = require('../index');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda');

describe('Lambda Function Existence Check', () => {
  let mockSend;
  
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup core mocks
    core.getInput = jest.fn();
    core.getBooleanInput = jest.fn();
    core.info = jest.fn();
    core.setFailed = jest.fn();
    core.debug = jest.fn();
    
    // Mock Lambda client send method
    mockSend = jest.fn();
    LambdaClient.prototype.send = mockSend;
    
    // Mock command constructor
    GetFunctionConfigurationCommand.mockImplementation((params) => ({
      ...params,
      type: 'GetFunctionConfigurationCommand'
    }));
  });
  
  describe('checkFunctionExists', () => {
    it('should return true when the function exists', async () => {
      // Mock successful response
      mockSend.mockResolvedValueOnce({
        Configuration: { FunctionName: 'test-function' }
      });
      
      const client = new LambdaClient({ region: 'us-east-1' });
      const result = await checkFunctionExists(client, 'test-function');
      
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionConfigurationCommand'
      }));
    });
    
    it('should return false when the function does not exist', async () => {
      // Mock ResourceNotFoundException
      const error = new Error('Function not found');
      error.name = 'ResourceNotFoundException';
      mockSend.mockRejectedValueOnce(error);
      
      const client = new LambdaClient({ region: 'us-east-1' });
      const result = await checkFunctionExists(client, 'test-function');
      
      expect(result).toBe(false);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionConfigurationCommand'
      }));
    });
    
    it('should propagate other errors', async () => {
      // Mock a different error
      const error = new Error('Network error');
      error.name = 'NetworkError';
      mockSend.mockRejectedValueOnce(error);
      
      const client = new LambdaClient({ region: 'us-east-1' });
      
      await expect(checkFunctionExists(client, 'test-function'))
        .rejects.toThrow('Network error');
      
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        FunctionName: 'test-function',
        type: 'GetFunctionConfigurationCommand'
      }));
    });
  });
});
