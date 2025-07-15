const { waitForFunctionUpdated } = require('../index');
const core = require('@actions/core');
const { waitUntilFunctionUpdated } = require('@aws-sdk/client-lambda');

jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda', () => {
  return {
    GetFunctionConfigurationCommand: jest.fn(),
    waitUntilFunctionUpdated: jest.fn()
  };
});

describe('waitForFunctionUpdated function', () => {
  let mockLambdaClient;
  
  jest.setTimeout(60000);
  beforeEach(() => {
    jest.resetAllMocks();
    
    
    jest.useRealTimers();
    
    core.info = jest.fn();
    core.warning = jest.fn();
    
    mockLambdaClient = {};
    
    waitUntilFunctionUpdated.mockReset();
  });
  test('should resolve when function update completes successfully', async () => {
    
    waitUntilFunctionUpdated.mockResolvedValue({});
    
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function')).resolves.toBeUndefined();
    
    expect(waitUntilFunctionUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        client: mockLambdaClient,
        minDelay: 2,
        maxWaitTime: 5 * 60 
      }),
      expect.objectContaining({
        FunctionName: 'test-function'
      })
    );
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Function update completed successfully'));
  });
  test('should use custom wait time when specified', async () => {
    
    waitUntilFunctionUpdated.mockResolvedValue({});
    const customWaitMinutes = 10;
    
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function', customWaitMinutes)).resolves.toBeUndefined();
    
    expect(waitUntilFunctionUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        client: mockLambdaClient,
        minDelay: 2,
        maxWaitTime: customWaitMinutes * 60 
      }),
      expect.objectContaining({
        FunctionName: 'test-function'
      })
    );
  });
  test('should handle waiter TimeoutError', async () => {
    
    const timeoutError = new Error('Waiter timed out');
    timeoutError.name = 'TimeoutError';
    waitUntilFunctionUpdated.mockRejectedValue(timeoutError);
    
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function'))
      .rejects.toThrow('Timed out waiting for function test-function update to complete after 5 minutes');
  });
  test('should handle ResourceNotFoundException error', async () => {
    
    const notFoundError = new Error('Function not found');
    notFoundError.name = 'ResourceNotFoundException';
    waitUntilFunctionUpdated.mockRejectedValue(notFoundError);
    
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function'))
      .rejects.toThrow('Function test-function not found');
  });
  test('should handle permission denied errors', async () => {
    
    const permissionError = new Error('Permission denied');
    permissionError.$metadata = { httpStatusCode: 403 };
    waitUntilFunctionUpdated.mockRejectedValue(permissionError);
    
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function'))
      .rejects.toThrow('Permission denied while checking function test-function status');
  });
  test('should handle other errors with appropriate message', async () => {
    
    const generalError = new Error('Something went wrong');
    waitUntilFunctionUpdated.mockRejectedValue(generalError);
    
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function'))
      .rejects.toThrow('Error waiting for function test-function update: Something went wrong');
    expect(core.warning).toHaveBeenCalledWith('Function update check error: Something went wrong');
  });
  test('should cap wait time to maximum allowed', async () => {
    
    waitUntilFunctionUpdated.mockResolvedValue({});
    
    const excessiveWaitMinutes = 100; 
    await waitForFunctionUpdated(mockLambdaClient, 'test-function', excessiveWaitMinutes);
    
    expect(core.info).toHaveBeenCalledWith('Wait time capped to maximum of 30 minutes');
    expect(waitUntilFunctionUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        maxWaitTime: 30 * 60 
      }),
      expect.any(Object)
    );
  });
});
