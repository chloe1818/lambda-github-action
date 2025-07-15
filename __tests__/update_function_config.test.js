const { updateFunctionConfiguration } = require('../index');
const core = require('@actions/core');
const { UpdateFunctionConfigurationCommand, waitUntilFunctionUpdated } = require('@aws-sdk/client-lambda');

jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda', () => {
  return {
    UpdateFunctionConfigurationCommand: jest.fn(),
    waitUntilFunctionUpdated: jest.fn()
  };
});

describe('Update Function Configuration Tests', () => {
  let mockLambdaClient;
  let mockSend;
  beforeEach(() => {
    jest.clearAllMocks();
    
    core.info = jest.fn();
    core.error = jest.fn();
    core.warning = jest.fn();
    core.setFailed = jest.fn();
    
    mockSend = jest.fn();
    mockLambdaClient = {
      send: mockSend
    };
    
    waitUntilFunctionUpdated.mockReset();
    waitUntilFunctionUpdated.mockResolvedValue({});
  });
  test('should update function configuration with correct parameters', async () => {
    
    mockSend.mockResolvedValue({
      FunctionName: 'test-function',
      LastUpdateStatus: 'Successful'
    });
    
    const params = {
      functionName: 'test-function',
      role: 'arn:aws:iam::123456789012:role/test-role',
      handler: 'index.handler',
      functionDescription: 'Test function description',
      parsedMemorySize: 512,
      timeout: 30,
      runtime: 'nodejs18.x',
      kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test-key',
      ephemeralStorage: 2048,
      parsedEnvironment: { TEST_VAR: 'test-value' },
      parsedVpcConfig: {
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123']
      },
      parsedDeadLetterConfig: {
        TargetArn: 'arn:aws:sqs:us-east-1:123456789012:test-queue'
      },
      parsedTracingConfig: {
        Mode: 'Active'
      },
      parsedLayers: [
        'arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1'
      ],
      parsedFileSystemConfigs: [
        {
          Arn: 'arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-123',
          LocalMountPath: '/mnt/efs'
        }
      ],
      parsedImageConfig: {
        Command: ['handler'],
        EntryPoint: ['/bin/sh'],
        WorkingDirectory: '/app'
      },
      parsedSnapStart: {
        ApplyOn: 'PublishedVersions'
      },
      parsedLoggingConfig: {
        LogFormat: 'JSON',
        ApplicationLogLevel: 'INFO',
        SystemLogLevel: 'INFO'
      }
    };
    
    await updateFunctionConfiguration(mockLambdaClient, params);
    
    const actualParams = UpdateFunctionConfigurationCommand.mock.calls[0][0];
    
    expect(actualParams).toHaveProperty('FunctionName', 'test-function');
    expect(actualParams).toHaveProperty('Role', 'arn:aws:iam::123456789012:role/test-role');
    expect(actualParams).toHaveProperty('Handler', 'index.handler');
    expect(actualParams).toHaveProperty('Description', 'Test function description');
    expect(actualParams).toHaveProperty('MemorySize', 512);
    expect(actualParams).toHaveProperty('Timeout', 30);
    expect(actualParams).toHaveProperty('Runtime', 'nodejs18.x');
    expect(actualParams).toHaveProperty('KMSKeyArn', 'arn:aws:kms:us-east-1:123456789012:key/test-key');
    expect(actualParams).toHaveProperty('EphemeralStorage', { Size: 2048 });
    expect(actualParams).toHaveProperty('Environment', { Variables: { TEST_VAR: 'test-value' } });
    
    
    if (actualParams.VpcConfig) {
      expect(actualParams.VpcConfig).toEqual({
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123']
      });
    }
    if (actualParams.DeadLetterConfig) {
      expect(actualParams.DeadLetterConfig).toEqual({
        TargetArn: 'arn:aws:sqs:us-east-1:123456789012:test-queue'
      });
    }
    if (actualParams.TracingConfig) {
      expect(actualParams.TracingConfig).toEqual({
        Mode: 'Active'
      });
    }
    if (actualParams.Layers) {
      expect(actualParams.Layers).toEqual([
        'arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1'
      ]);
    }
    if (actualParams.FileSystemConfigs) {
      expect(actualParams.FileSystemConfigs).toEqual([
        {
          Arn: 'arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-123',
          LocalMountPath: '/mnt/efs'
        }
      ]);
    }
    if (actualParams.ImageConfig) {
      expect(actualParams.ImageConfig).toEqual({
        Command: ['handler'],
        EntryPoint: ['/bin/sh'],
        WorkingDirectory: '/app'
      });
    }
    if (actualParams.SnapStart) {
      expect(actualParams.SnapStart).toEqual({
        ApplyOn: 'PublishedVersions'
      });
    }
    if (actualParams.LoggingConfig) {
      expect(actualParams.LoggingConfig).toEqual({
        LogFormat: 'JSON',
        ApplicationLogLevel: 'INFO',
        SystemLogLevel: 'INFO'
      });
    }
    
    expect(mockSend).toHaveBeenCalled();
    
    expect(waitUntilFunctionUpdated).toHaveBeenCalled();
    
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Updating function configuration for test-function'));
  });
  test('should handle minimal configuration parameters', async () => {
    
    mockSend.mockResolvedValue({
      FunctionName: 'test-function',
      LastUpdateStatus: 'Successful'
    });
    
    const params = {
      functionName: 'test-function',
      parsedEnvironment: {} 
    };
    
    await updateFunctionConfiguration(mockLambdaClient, params);
    
    expect(UpdateFunctionConfigurationCommand).toHaveBeenCalledWith(expect.objectContaining({
      FunctionName: 'test-function',
      Environment: { Variables: {} }
    }));
    
    const command = UpdateFunctionConfigurationCommand.mock.calls[0][0];
    expect(command.Role).toBeUndefined();
    expect(command.Handler).toBeUndefined();
    expect(command.Description).toBeUndefined();
    expect(command.MemorySize).toBeUndefined();
    expect(command.Timeout).toBeUndefined();
    expect(command.Runtime).toBeUndefined();
    expect(command.KMSKeyArn).toBeUndefined();
    expect(command.EphemeralStorage).toBeUndefined();
    expect(command.VpcConfig).toBeUndefined();
    expect(command.DeadLetterConfig).toBeUndefined();
    expect(command.TracingConfig).toBeUndefined();
    expect(command.Layers).toBeUndefined();
    expect(command.FileSystemConfigs).toBeUndefined();
    expect(command.ImageConfig).toBeUndefined();
    expect(command.SnapStart).toBeUndefined();
    expect(command.LoggingConfig).toBeUndefined();
    
    expect(mockSend).toHaveBeenCalled();
    
    expect(waitUntilFunctionUpdated).toHaveBeenCalled();
  });
  test('should handle rate limit errors', async () => {
    
    const throttlingError = new Error('Rate exceeded');
    throttlingError.name = 'ThrottlingException';
    mockSend.mockRejectedValue(throttlingError);
    
    const params = {
      functionName: 'test-function',
      parsedEnvironment: { TEST_VAR: 'test-value' }
    };
    
    await expect(updateFunctionConfiguration(mockLambdaClient, params))
      .rejects.toThrow('Rate exceeded');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Rate limit exceeded and maximum retries reached: Rate exceeded'
    );
  });
  test('should handle server errors', async () => {
    
    const serverError = new Error('Internal server error');
    serverError.$metadata = { httpStatusCode: 500 };
    mockSend.mockRejectedValue(serverError);
    
    const params = {
      functionName: 'test-function',
      parsedEnvironment: { TEST_VAR: 'test-value' }
    };
    
    await expect(updateFunctionConfiguration(mockLambdaClient, params))
      .rejects.toThrow('Internal server error');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Server error (500): Internal server error. All retry attempts failed.'
    );
  });
  test('should handle permission errors', async () => {
    
    const accessError = new Error('Access denied');
    accessError.name = 'AccessDeniedException';
    mockSend.mockRejectedValue(accessError);
    
    const params = {
      functionName: 'test-function',
      parsedEnvironment: { TEST_VAR: 'test-value' }
    };
    
    await expect(updateFunctionConfiguration(mockLambdaClient, params))
      .rejects.toThrow('Access denied');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Action failed with error: Permissions error: Access denied. Check IAM roles.'
    );
  });
  test('should handle general errors', async () => {
    
    const generalError = new Error('Something went wrong');
    mockSend.mockRejectedValue(generalError);
    
    const params = {
      functionName: 'test-function',
      parsedEnvironment: { TEST_VAR: 'test-value' }
    };
    
    await expect(updateFunctionConfiguration(mockLambdaClient, params))
      .rejects.toThrow('Something went wrong');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to update function configuration: Something went wrong'
    );
  });
  test('should log stack trace when available', async () => {
    
    const error = new Error('Something went wrong');
    error.stack = 'Error: Something went wrong\n    at Function.updateFunctionConfiguration';
    mockSend.mockRejectedValue(error);
    
    const params = {
      functionName: 'test-function',
      parsedEnvironment: { TEST_VAR: 'test-value' }
    };
    
    core.debug = jest.fn();
    
    await expect(updateFunctionConfiguration(mockLambdaClient, params))
      .rejects.toThrow('Something went wrong');
    
    expect(core.debug).toHaveBeenCalledWith(error.stack);
  });
  test('should include all configuration options in the command', async () => {
    
    mockSend.mockResolvedValue({
      FunctionName: 'test-function'
    });
    
    const params = {
      functionName: 'test-function',
      role: null,
      handler: undefined,
      functionDescription: 'Test description',
      parsedMemorySize: 0,
      timeout: undefined,
      runtime: null,
      kmsKeyArn: undefined,
      ephemeralStorage: null,
      vpcConfig: undefined,
      parsedEnvironment: { TEST_VAR: 'test-value' },
      deadLetterConfig: null,
      tracingConfig: undefined,
      layers: null,
      fileSystemConfigs: undefined,
      imageConfig: null,
      snapStart: undefined,
      loggingConfig: null,
      
      parsedVpcConfig: null,
      parsedDeadLetterConfig: undefined,
      parsedTracingConfig: null,
      parsedLayers: undefined,
      parsedFileSystemConfigs: null,
      parsedImageConfig: undefined,
      parsedSnapStart: null,
      parsedLoggingConfig: undefined
    };
    
    await updateFunctionConfiguration(mockLambdaClient, params);
    
    expect(UpdateFunctionConfigurationCommand).toHaveBeenCalledWith(expect.objectContaining({
      FunctionName: 'test-function',
      Description: 'Test description', 
      Environment: { Variables: { TEST_VAR: 'test-value' } } 
    }));
    
    const command = UpdateFunctionConfigurationCommand.mock.calls[0][0];
    expect(command.Role).toBeUndefined();
    expect(command.Handler).toBeUndefined();
    expect(command.MemorySize).toBeUndefined(); 
    expect(command.Timeout).toBeUndefined();
    expect(command.Runtime).toBeUndefined();
    expect(command.KMSKeyArn).toBeUndefined();
    expect(command.EphemeralStorage).toBeUndefined();
    expect(command.VpcConfig).toBeUndefined();
    expect(command.DeadLetterConfig).toBeUndefined();
    expect(command.TracingConfig).toBeUndefined();
    expect(command.Layers).toBeUndefined();
    expect(command.FileSystemConfigs).toBeUndefined();
    expect(command.ImageConfig).toBeUndefined();
    expect(command.SnapStart).toBeUndefined();
    expect(command.LoggingConfig).toBeUndefined();
  });
});
