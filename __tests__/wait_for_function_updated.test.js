const { waitForFunctionUpdated } = require('../index');
const core = require('@actions/core');
const { GetFunctionConfigurationCommand, waitUntilFunctionUpdated } = require('@aws-sdk/client-lambda');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda', () => {
  return {
    GetFunctionConfigurationCommand: jest.fn(),
    waitUntilFunctionUpdated: jest.fn()
  };
});

describe('waitForFunctionUpdated function', () => {
  let mockLambdaClient;

  // Using a higher timeout for the entire test suite
  jest.setTimeout(60000);
  
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Don't use fake timers for these tests as they're causing issues with Jest's timeout
    // We'll use the real timer implementation
    jest.useRealTimers();
    
    // Setup core mocks
    core.info = jest.fn();
    core.warning = jest.fn();
    
    // Mock client for passing to waiters
    mockLambdaClient = {};
    
    // Reset mocks for waitUntilFunctionUpdated
    waitUntilFunctionUpdated.mockReset();
  });

  it('should resolve when function update completes successfully', async () => {
    // Mock successful function waiter
    waitUntilFunctionUpdated.mockResolvedValue({});
    
    // Create a promise that will resolve when waitForFunctionUpdated resolves
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function')).resolves.toBeUndefined();
    
    // Check the results
    expect(waitUntilFunctionUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        client: mockLambdaClient,
        minDelay: 2,
        maxWaitTime: 5 * 60 // 5 minutes in seconds
      }),
      expect.objectContaining({
        FunctionName: 'test-function'
      })
    );
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Function update completed successfully'));
  });

  it('should use custom wait time when specified', async () => {
    // Mock successful function waiter
    waitUntilFunctionUpdated.mockResolvedValue({});
    
    const customWaitMinutes = 10;
    
    // Execute the test with custom wait time
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function', customWaitMinutes)).resolves.toBeUndefined();
    
    // Check that the waiter was called with the correct wait time
    expect(waitUntilFunctionUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        client: mockLambdaClient,
        minDelay: 2,
        maxWaitTime: customWaitMinutes * 60 // Convert to seconds
      }),
      expect.objectContaining({
        FunctionName: 'test-function'
      })
    );
  });

  it('should handle waiter TimeoutError', async () => {
    // Mock a timeout error from the waiter
    const timeoutError = new Error('Waiter timed out');
    timeoutError.name = 'TimeoutError';
    waitUntilFunctionUpdated.mockRejectedValue(timeoutError);
    
    // Check that our function correctly handles and transforms the error
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function'))
      .rejects.toThrow('Timed out waiting for function test-function update to complete after 5 minutes');
  });

  it('should handle ResourceNotFoundException error', async () => {
    // Mock a ResourceNotFoundException from the waiter
    const notFoundError = new Error('Function not found');
    notFoundError.name = 'ResourceNotFoundException';
    waitUntilFunctionUpdated.mockRejectedValue(notFoundError);
    
    // Check that our function correctly handles and transforms the error
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function'))
      .rejects.toThrow('Function test-function not found');
  });

  it('should handle permission denied errors', async () => {
    // Mock a permission denied error from the waiter
    const permissionError = new Error('Permission denied');
    permissionError.$metadata = { httpStatusCode: 403 };
    waitUntilFunctionUpdated.mockRejectedValue(permissionError);
    
    // Check that our function correctly handles and transforms the error
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function'))
      .rejects.toThrow('Permission denied while checking function test-function status');
  });

  it('should handle other errors with appropriate message', async () => {
    // Mock a general error from the waiter
    const generalError = new Error('Something went wrong');
    waitUntilFunctionUpdated.mockRejectedValue(generalError);
    
    // Check that our function logs a warning and rethrows with enhanced message
    await expect(waitForFunctionUpdated(mockLambdaClient, 'test-function'))
      .rejects.toThrow('Error waiting for function test-function update: Something went wrong');
    
    expect(core.warning).toHaveBeenCalledWith('Function update check error: Something went wrong');
  });

  it('should cap wait time to maximum allowed', async () => {
    // Mock successful function waiter
    waitUntilFunctionUpdated.mockResolvedValue({});
    
    // Try with a wait time that exceeds the maximum
    const excessiveWaitMinutes = 100; // Much higher than the 30 minute cap
    
    await waitForFunctionUpdated(mockLambdaClient, 'test-function', excessiveWaitMinutes);
    
    // Verify the wait time was capped
    expect(core.info).toHaveBeenCalledWith('Wait time capped to maximum of 30 minutes');
    expect(waitUntilFunctionUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        maxWaitTime: 30 * 60 // 30 minutes in seconds (the cap)
      }),
      expect.any(Object)
    );
  });
});
