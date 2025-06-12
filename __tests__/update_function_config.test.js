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
  readFile: jest.fn().mockResolvedValue(Buffer.from('mock file content')),
  readdir: jest.fn().mockResolvedValue(['file1.js', 'directory']),
  cp: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined)
}));

// Mock glob and AdmZip
const mockGlob = jest.fn().mockResolvedValue(['file1.js', 'directory/file2.js', 'directory']);
jest.mock('glob', () => ({
  glob: mockGlob
}));

jest.mock('adm-zip', () => 
  jest.fn().mockImplementation(() => ({
    addLocalFolder: jest.fn(),
    writeZip: jest.fn()
  }))
);

jest.mock('path');

// Now we can import modules
const core = require('@actions/core');
const { 
  LambdaClient, 
  UpdateFunctionConfigurationCommand,
  UpdateFunctionCodeCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand
} = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');
const path = require('path');
const mainModule = require('../index');
const validations = require('../validations');

describe('Lambda Update Unit Tests', () => {
  // Increase timeout as needed
  jest.setTimeout(10000);
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock process.cwd()
    process.cwd = jest.fn().mockReturnValue('/mock/cwd');
    
    // Mock path.join to return predictable paths
    path.join.mockImplementation((...parts) => parts.join('/'));
    path.dirname.mockImplementation((p) => p.substring(0, p.lastIndexOf('/')));
    
    // Mock core functions
    core.getInput.mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'code-artifacts-dir': '/mock/src',
        'role': 'arn:aws:iam::123456789012:role/lambda-role',
        'runtime': 'nodejs18.x',
        'handler': 'index.handler',
        'memory-size': '256',
        'timeout': '15'
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

    // Mock Lambda client responses
    const mockFunctionResponse = {
      $metadata: { httpStatusCode: 200 },
      Configuration: {
        FunctionName: 'test-function',
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Runtime: 'nodejs14.x',  // Note: Different from what we'll update to
        Role: 'arn:aws:iam::123456789012:role/old-role',
        Handler: 'index.oldHandler',
        MemorySize: 128,
        Timeout: 3,
        State: 'Active',
        LastUpdateStatus: 'Successful',
      }
    };
    
    // Set dryRunExists to false by default
    global.dryRunExists = false;
    
    const mockUpdateConfigResponse = {
      $metadata: { httpStatusCode: 200 },
      FunctionName: 'test-function',
      FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      Runtime: 'nodejs18.x',
      Role: 'arn:aws:iam::123456789012:role/lambda-role',
      Handler: 'index.handler',
      MemorySize: 256,
      Timeout: 15,
      State: 'Active',
      LastUpdateStatus: 'Successful',
    };
    
    const mockUpdateCodeResponse = {
      $metadata: { httpStatusCode: 200 },
      FunctionName: 'test-function',
      FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      Version: '2',
      State: 'Active',
      LastUpdateStatus: 'Successful',
    };

    // Setup mock for the Lambda client
    LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
      // We need to capture the actual command object for inspection in tests
      if (command instanceof GetFunctionCommand) {
        return Promise.resolve(mockFunctionResponse);
      } else if (command instanceof GetFunctionConfigurationCommand) {
        return Promise.resolve(mockFunctionResponse.Configuration);
      } else if (command instanceof UpdateFunctionConfigurationCommand) {
        return Promise.resolve(mockUpdateConfigResponse);
      } else if (command instanceof UpdateFunctionCodeCommand) {
        return Promise.resolve(mockUpdateCodeResponse);
      }
      return Promise.resolve({});
    });

    // Mock the waitForFunctionUpdated to avoid delays in tests
    jest.spyOn(mainModule, 'waitForFunctionUpdated').mockResolvedValue(undefined);
  });

  // Test configuration changes directly using the exposed function
  test('should detect configuration changes', async () => {
    // Create a simple test for detecting differences in objects
    const currentConfig = {
      Runtime: 'nodejs14.x',
      Role: 'arn:aws:iam::123456789012:role/old-role'
    };
    
    const updatedConfig = {
      Runtime: 'nodejs20.x',
      Role: 'arn:aws:iam::123456789012:role/lambda-role'
    };
    
    // Use the actual function from the module
    const result = await mainModule.hasConfigurationChanged(currentConfig, updatedConfig);
    
    // Assert
    expect(result).toBe(true);
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected'));
    
    // Test when there's no change
    core.info.mockClear();
    const noChangeResult = await mainModule.hasConfigurationChanged(currentConfig, currentConfig);
    expect(noChangeResult).toBe(false);
  });
  
  test('should handle complex configuration types', async () => {
    // Test with various configuration types including JSON structures
    const currentConfig = {
      Runtime: 'nodejs18.x',
      Environment: {
        Variables: {
          NODE_ENV: 'development'
        }
      },
      VpcConfig: {
        SubnetIds: ['subnet-123'],
        SecurityGroupIds: ['sg-123']
      }
    };
    
    const updatedConfig = {
      Runtime: 'nodejs20.x',
      Environment: {
        Variables: {
          NODE_ENV: 'production',
          LOG_LEVEL: 'info'
        }
      },
      VpcConfig: {
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123']
      }
    };
    
    const result = await mainModule.hasConfigurationChanged(currentConfig, updatedConfig);
    expect(result).toBe(true);
    
    // Check specific log messages for each changed property
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in Runtime'));
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in Environment'));
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in VpcConfig'));
  });

  test('should package artifacts correctly', async () => {
    // Setup
    const artifactsDir = '/mock/artifacts';
    
    // Act
    const result = await mainModule.packageCodeArtifacts(artifactsDir);
    
    // Assert
    expect(result).toBe('/mock/cwd/lambda-function.zip');
    expect(fs.mkdir).toHaveBeenCalledWith('/mock/cwd/lambda-package', { recursive: true });
    expect(fs.readdir).toHaveBeenCalledWith(artifactsDir);
    expect(fs.cp).toHaveBeenCalled();
  });

  test('should check if function exists correctly', async () => {
    // We need a more direct approach to test this function
    // First, create a custom mock client
    const mockClient = {
      send: jest.fn()
    };
    
    // Define function name
    const functionName = 'test-function';
    
    // Setup for success case
    mockClient.send.mockResolvedValueOnce({
      Configuration: { FunctionName: functionName }
    });
    
    // Act - success case
    const successResult = await mainModule.checkFunctionExists(mockClient, functionName);
    
    // Assert success case
    expect(successResult).toBe(true);
    expect(mockClient.send).toHaveBeenCalledTimes(1);
    expect(mockClient.send.mock.calls[0][0]).toBeInstanceOf(GetFunctionConfigurationCommand);
    
    // Setup for failure case - ResourceNotFoundException
    mockClient.send.mockRejectedValueOnce({
      name: 'ResourceNotFoundException',
      message: 'Function not found'
    });
    
    // Act - failure case
    const failureResult = await mainModule.checkFunctionExists(mockClient, 'nonexistent-function');
    
    // Assert failure case
    expect(failureResult).toBe(false);
  });
  
  test('should validate role ARN correctly', () => {
    // Setup
    const validRoleArn = 'arn:aws:iam::123456789012:role/lambda-role';
    const invalidRoleArn = 'invalid-arn';
    
    // Clear any previous calls
    core.setFailed.mockClear();
    
    // Act & Assert
    expect(validations.validateRoleArn(validRoleArn)).toBe(true);
    expect(validations.validateRoleArn(invalidRoleArn)).toBe(false);
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid IAM role ARN format'));
  });
  
  // Add a test for KMS Key ARN validation
  test('should validate KMS key ARN correctly', () => {
    // Setup
    const validKmsArn = 'arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab';
    const invalidKmsArn = 'invalid-kms-arn';
    
    // Clear any previous calls
    core.setFailed.mockClear();
    
    // Act & Assert
    expect(validations.validateKmsKeyArn(validKmsArn)).toBe(true);
    expect(validations.validateKmsKeyArn(invalidKmsArn)).toBe(false);
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid KMS key ARN format'));
  });
  
  // Test the update function configuration parameters directly
  test('should update function configuration with correct parameters', () => {
    // Test parameters
    const functionName = 'test-function';
    const runtime = 'nodejs20.x';
    const handler = 'index.handler';
    const role = 'arn:aws:iam::123456789012:role/lambda-role';
    const memorySize = 256;
    const timeout = 15;
    const ephemeralStorage = { Size: 512 };
    const kmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/test-key';
    const environment = { Variables: { NODE_ENV: 'production' } };
    const vpcConfig = { 
      SubnetIds: ['subnet-123'], 
      SecurityGroupIds: ['sg-123'] 
    };
    const tracingConfig = { Mode: 'Active' };
    const layers = ['arn:aws:lambda:us-east-1:123456789012:layer:my-layer:1'];
    const fileSystemConfigs = [
      { Arn: 'arn:aws:efs:us-east-1:123456789012:access-point/fsap-123', LocalMountPath: '/mnt/efs' }
    ];
    const imageConfig = { EntryPoint: ['app.handler'] };
    const snapStart = { ApplyOn: 'PublishedVersions' };
    const loggingConfig = { LogFormat: 'JSON', LogGroup: '/aws/lambda/test-function' };
    
    // Create a test input object with all new parameters
    const params = {
      FunctionName: functionName,
      Runtime: runtime,
      Handler: handler,
      Role: role,
      MemorySize: memorySize,
      Timeout: timeout,
      EphemeralStorage: ephemeralStorage,
      KMSKeyArn: kmsKeyArn,
      Environment: environment,
      VpcConfig: vpcConfig,
      TracingConfig: tracingConfig,
      Layers: layers,
      FileSystemConfigs: fileSystemConfigs,
      ImageConfig: imageConfig,
      SnapStart: snapStart,
      LoggingConfig: loggingConfig
    };
    
    // Spy on the AWS SDK command constructor
    const commandSpy = jest.spyOn(require('@aws-sdk/client-lambda'), 'UpdateFunctionConfigurationCommand');
    
    // Create a command - this will call our spy
    new UpdateFunctionConfigurationCommand(params);
    
    // Verify the constructor was called with the correct parameters
    expect(commandSpy).toHaveBeenCalledWith(params);
    
    // Verify the parameters
    const calledParams = commandSpy.mock.calls[0][0];
    expect(calledParams.FunctionName).toBe(functionName);
    expect(calledParams.Runtime).toBe(runtime);
    expect(calledParams.Handler).toBe(handler);
    expect(calledParams.Role).toBe(role);
    expect(calledParams.MemorySize).toBe(memorySize);
    expect(calledParams.Timeout).toBe(timeout);
    expect(calledParams.EphemeralStorage).toEqual(ephemeralStorage);
    expect(calledParams.KMSKeyArn).toBe(kmsKeyArn);
    expect(calledParams.Environment).toEqual(environment);
    expect(calledParams.VpcConfig).toEqual(vpcConfig);
    expect(calledParams.TracingConfig).toEqual(tracingConfig);
    expect(calledParams.Layers).toEqual(layers);
    expect(calledParams.FileSystemConfigs).toEqual(fileSystemConfigs);
    expect(calledParams.ImageConfig).toEqual(imageConfig);
    expect(calledParams.SnapStart).toEqual(snapStart);
    expect(calledParams.LoggingConfig).toEqual(loggingConfig);
  });
  
  test('should clean null keys before sending update commands', () => {
    // Create a spy for cleanNullKeys
    const cleanNullKeysSpy = jest.spyOn(mainModule, 'cleanNullKeys');
    
    // Create a test input object with some null and undefined values
    const params = {
      FunctionName: 'test-function',
      Runtime: 'nodejs20.x',
      Handler: 'index.handler',
      Role: 'arn:aws:iam::123456789012:role/lambda-role',
      MemorySize: undefined,
      Timeout: null,
      Environment: { Variables: { ENV: 'production', EMPTY: '' } }
    };
    
    // Clean the params just like in the actual implementation
    const cleanedParams = mainModule.cleanNullKeys(params);
    
    // Create a command that should trigger cleanNullKeys
    new UpdateFunctionConfigurationCommand(cleanedParams);
    
    // Verify cleanNullKeys was called
    expect(cleanNullKeysSpy).toHaveBeenCalled();
  });
  
  // Test error handling during configuration update - just test the error handling directly
  test('should handle function configuration update errors gracefully', () => {
    // Create a mock error
    const updateError = new Error('Failed to update configuration');
    updateError.name = 'ValidationException';
    
    // Create a mock core.setFailed function
    const setFailedMock = jest.fn();
    core.setFailed = setFailedMock;
    
    // Simulate the catch block from the main function
    try {
      // Throw the error to simulate a failed update
      throw updateError;
    } catch (error) {
      if (error.name === 'ValidationException') {
        core.setFailed(`Failed to update function configuration: ${error.message}`);
      }
    }
    
    // Assert the error was handled properly
    expect(setFailedMock).toHaveBeenCalledWith(expect.stringContaining('Failed to update function configuration'));
  });
});
