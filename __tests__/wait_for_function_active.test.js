const { waitForFunctionActive } = require('../index');
const core = require('@actions/core');

jest.mock('fs/promises', () => {
  return {
    readFile: jest.fn().mockResolvedValue(Buffer.from('mock file content')), 
    
    access: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1024 }), 
    
  };
});
jest.mock('glob');
jest.mock('adm-zip');
jest.mock('@actions/core');
jest.mock('path');
jest.mock('os');
jest.mock('../validations');
jest.mock('@aws-sdk/client-lambda', () => {
  const original = jest.requireActual('@aws-sdk/client-lambda');
  return {
    ...original,
    GetFunctionConfigurationCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      type: 'GetFunctionConfigurationCommand'
    })),
    CreateFunctionCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      type: 'CreateFunctionCommand'
    })),
    UpdateFunctionCodeCommand: jest.fn().mockImplementation((params) => ({
      input: params,
      type: 'UpdateFunctionCodeCommand'
    })),
    UpdateFunctionConfigurationCommand: jest.fn().mockImplementation((params) => ({
      input: params,
      type: 'UpdateFunctionConfigurationCommand'
    })),
    GetFunctionCommand: jest.fn().mockImplementation((params) => ({
      input: params,
      type: 'GetFunctionCommand'
    })),
    LambdaClient: jest.fn().mockImplementation(() => ({
      send: jest.fn()
    })),
    waitUntilFunctionUpdated: jest.fn()
  };
});
jest.mock('@aws-sdk/client-s3', () => {
  const original = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...original,
    HeadBucketCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      type: 'HeadBucketCommand'
    })),
    CreateBucketCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      type: 'CreateBucketCommand'
    })),
    PutObjectCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      type: 'PutObjectCommand'
    })),
    PutBucketEncryptionCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      type: 'PutBucketEncryptionCommand'
    })),
    PutPublicAccessBlockCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      type: 'PutPublicAccessBlockCommand'
    })),
    PutBucketVersioningCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      type: 'PutBucketVersioningCommand'
    })),
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({})
    }))
  };
});


describe('Wait For Function Active Test', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    core.info = jest.fn();
    core.warning = jest.fn();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  test('should throw error when function not found', async () => {
    
    const notFoundError = new Error('Function not found');
    notFoundError.name = 'ResourceNotFoundException';
    
    const mockSend = jest.fn().mockRejectedValue(notFoundError);
    const mockClient = { send: mockSend };
    
    const functionPromise = waitForFunctionActive(mockClient, 'test-function');
    
    jest.runOnlyPendingTimers();
    
    await expect(functionPromise).rejects.toThrow('Function test-function not found');
  });
  test('should throw error on permission denied', async () => {
    
    const permissionError = new Error('Access denied');
    permissionError.$metadata = { httpStatusCode: 403 };
    
    const mockSend = jest.fn().mockRejectedValue(permissionError);
    const mockClient = { send: mockSend };
    
    const functionPromise = waitForFunctionActive(mockClient, 'test-function');
    
    jest.runOnlyPendingTimers();
    
    await expect(functionPromise).rejects.toThrow(
      'Permission denied while checking function test-function status'
    );
  });
  test('should log warning and retry on general errors', async () => {
    
    const generalError = new Error('Network issue');
    
    const mockSend = jest.fn()
      .mockRejectedValueOnce(generalError)
      .mockResolvedValueOnce({ State: 'Active' });
    const mockClient = { send: mockSend };
    
    const functionPromise = waitForFunctionActive(mockClient, 'test-function');
    
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    
    await functionPromise;
    
    expect(core.warning).toHaveBeenCalledWith('Function status check error: Network issue');
    expect(core.info).toHaveBeenCalledWith('Function test-function is now active');
  });
  test('should time out if function never becomes active', async () => {
    
    const mockSend = jest.fn().mockResolvedValue({ State: 'Pending' });
    const mockClient = { send: mockSend };
    
    const waitMinutes = 1;
    const functionPromise = waitForFunctionActive(mockClient, 'test-function', waitMinutes);
    
    
    for (let i = 0; i < 13; i++) {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    }
    
    await expect(functionPromise).rejects.toThrow(
      `Timed out waiting for function test-function to become active after ${waitMinutes} minutes`
    );
  });
  test('should cap wait time to maximum allowed', async () => {
    
    const mockSend = jest.fn().mockResolvedValue({ State: 'Active' });
    const mockClient = { send: mockSend };
    
    const excessiveWaitMinutes = 60;
    
    const functionPromise = waitForFunctionActive(mockClient, 'test-function', excessiveWaitMinutes);
    
    jest.runOnlyPendingTimers();
    
    await functionPromise;
    
    expect(core.info).toHaveBeenCalledWith('Wait time capped to maximum of 30 minutes');
  });
});
