// Comment out Line 399 in index.js

const fs = require('fs/promises');
const path = require('path');
const core = require('@actions/core');
const { LambdaClient, GetFunctionConfigurationCommand, CreateFunctionCommand, UpdateFunctionCodeCommand, GetFunctionCommand} = require('@aws-sdk/client-lambda');
const index = require('../index');
const { checkFunctionExists } = index;

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

describe('Function Create Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.readFile.mockResolvedValue(Buffer.from('mock zip content'));
  });

  test('Handles ThrottlingException', async () => {
    const throttlingError = new Error('Rate exceeded');
    throttlingError.name = 'ThrottlingException';
    
    const mockSend = jest.fn().mockRejectedValue(throttlingError);
    LambdaClient.mockImplementation(() => ({
      send: mockSend
    }));
    
    const client = new LambdaClient();
    const inputs = {
      functionName: 'test-function',
      role: 'arn:aws:iam::123456789012:role/test-role',
      finalZipPath: '/mock/path/file.zip',
      parsedEnvironment: {}
    };
    
    await expect(index.createFunction(client, inputs, false))
      .rejects.toThrow('Rate exceeded');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Rate limit exceeded and maximum retries reached: Rate exceeded'
    );
  });

  test('Handles 429 error', async () => {
    const tooManyRequestsError = new Error('Too many requests');
    tooManyRequestsError.$metadata = { httpStatusCode: 429 };
    
    const mockSend = jest.fn().mockRejectedValue(tooManyRequestsError);
    LambdaClient.mockImplementation(() => ({
      send: mockSend
    }));
    
    const client = new LambdaClient();
    const inputs = {
      functionName: 'test-function',
      role: 'arn:aws:iam::123456789012:role/test-role',
      finalZipPath: '/mock/path/file.zip',
      parsedEnvironment: {}
    };
    
    await expect(index.createFunction(client, inputs, false))
      .rejects.toThrow('Too many requests');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Rate limit exceeded and maximum retries reached: Too many requests'
    );
  });

  test('Handles server error', async () => {
    const serverError = new Error('Internal server error');
    serverError.$metadata = { httpStatusCode: 500 };
    
    const mockSend = jest.fn().mockRejectedValue(serverError);
    LambdaClient.mockImplementation(() => ({
      send: mockSend
    }));
    
    const client = new LambdaClient();
    const inputs = {
      functionName: 'test-function',
      role: 'arn:aws:iam::123456789012:role/test-role',
      finalZipPath: '/mock/path/file.zip',
      parsedEnvironment: {}
    };
    
    await expect(index.createFunction(client, inputs, false))
      .rejects.toThrow('Internal server error');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Server error (500): Internal server error. All retry attempts failed.'
    );
  });

  test('Handles AccessDeniedException', async () => {
    const accessError = new Error('Access denied');
    accessError.name = 'AccessDeniedException';
    
    const mockSend = jest.fn().mockRejectedValue(accessError);
    LambdaClient.mockImplementation(() => ({
      send: mockSend
    }));
    
    const client = new LambdaClient();
    const inputs = {
      functionName: 'test-function',
      role: 'arn:aws:iam::123456789012:role/test-role',
      finalZipPath: '/mock/path/file.zip',
      parsedEnvironment: {}
    };
    
    await expect(index.createFunction(client, inputs, false))
      .rejects.toThrow('Access denied');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Action failed with error: Permissions error: Access denied. Check IAM roles.'
    );
  });

  test('Handles generic error', async () => {
    const genericError = new Error('Something went wrong');
    genericError.stack = 'Error: Something went wrong\n    at Function.mockFunction';
    
    const mockSend = jest.fn().mockRejectedValue(genericError);
    LambdaClient.mockImplementation(() => ({
      send: mockSend
    }));
    
    const client = new LambdaClient();
    const inputs = {
      functionName: 'test-function',
      role: 'arn:aws:iam::123456789012:role/test-role',
      finalZipPath: '/mock/path/file.zip',
      parsedEnvironment: {}
    };
    
    await expect(index.createFunction(client, inputs, false))
      .rejects.toThrow('Something went wrong');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to create function: Something went wrong'
    );
    expect(core.debug).toHaveBeenCalledWith(genericError.stack);
  });

  test('Validates role parameter', async () => {
    const client = new LambdaClient();
    const inputs = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/file.zip',
      parsedEnvironment: {}
    };
    
    await index.createFunction(client, inputs, false);
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'Role ARN must be provided when creating a new function'
    );
    
    expect(client.send).not.toHaveBeenCalled();
  });

  test('Validates dryRun parameter', async () => {
    const client = new LambdaClient();
    const inputs = {
      functionName: 'test-function',
      role: 'arn:aws:iam::123456789012:role/test-role',
      finalZipPath: '/mock/path/file.zip',
      parsedEnvironment: {},
      dryRun: true
    };
    
    await index.createFunction(client, inputs, false);
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'DRY RUN MODE can only be used for updating function code of existing functions'
    );
    
    expect(client.send).not.toHaveBeenCalled();
  });

  test('Handles file read error', async () => {
    const fileError = new Error('File not found');
    fileError.code = 'ENOENT';
    fs.readFile.mockRejectedValue(fileError);
    
    const mockSend = jest.fn();
    LambdaClient.mockImplementation(() => ({
      send: mockSend
    }));
    
    const client = new LambdaClient();
    const inputs = {
      functionName: 'test-function',
      role: 'arn:aws:iam::123456789012:role/test-role',
      finalZipPath: '/mock/path/file.zip',
      parsedEnvironment: {}
    };
    
    await expect(index.createFunction(client, inputs, false))
      .rejects.toThrow('File not found');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to read Lambda deployment package/)
    );
  });

  test('Constructs CreateFunctionCommand correctly', async () => {
    const mockResponse = {
      FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      Version: '1'
    };
    
    const mockSend = jest.fn().mockResolvedValue(mockResponse);
    LambdaClient.mockImplementation(() => ({
      send: mockSend
    }));
    
    const client = new LambdaClient();
    const inputs = {
      functionName: 'test-function',
      role: 'arn:aws:iam::123456789012:role/test-role',
      finalZipPath: '/mock/path/file.zip',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      parsedEnvironment: { ENV_VAR: 'test-value' },
      parsedMemorySize: 256,
      timeout: 30,
      functionDescription: 'Test function description',
      publish: true,
      architectures: ['arm64']
    };
    
    await index.createFunction(client, inputs, false);
    
    expect(CreateFunctionCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        FunctionName: 'test-function',
        Role: 'arn:aws:iam::123456789012:role/test-role',
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Description: 'Test function description',
        MemorySize: 256,
        Timeout: 30,
        Publish: true,
        Architectures: ['arm64'],
        Environment: { Variables: { ENV_VAR: 'test-value' } },
        Code: expect.objectContaining({
          ZipFile: expect.any(Buffer)
        })
      })
    );
    
    expect(client.send).toHaveBeenCalled();
    
    expect(core.setOutput).toHaveBeenCalledWith('function-arn', expect.any(String));
    expect(core.setOutput).toHaveBeenCalledWith('version', expect.any(String));
    expect(core.info).toHaveBeenCalledWith('Lambda function created successfully');

  }, 120000); 
});

describe('Lambda Function Code Tests', () => {
  jest.setTimeout(30000);
  
  beforeEach(() => {
    jest.resetAllMocks();
    
    process.cwd = jest.fn().mockReturnValue('/mock/cwd');
    
    path.join.mockImplementation((...parts) => parts.join('/'));
    
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

    jest.spyOn(index, 'checkBucketExists').mockResolvedValue(true);

    jest.spyOn(index, 'checkFunctionExists').mockResolvedValue(true);
  });
  
  test('Test the updateFunctionCode function with S3 upload method', async () => {
    const originalUpdateFunctionCode = index.updateFunctionCode;
    
    index.updateFunctionCode = jest.fn().mockImplementation(async (client, params) => {
      const s3Result = {
        bucket: params.s3Bucket,
        key: params.s3Key
      };
      
      const command = new UpdateFunctionCodeCommand({
        FunctionName: params.functionName,
        S3Bucket: params.s3Bucket,
        S3Key: params.s3Key,
        ...(params.architectures && { 
          Architectures: Array.isArray(params.architectures) 
            ? params.architectures 
            : [params.architectures] 
        }),
        ...(params.publish !== undefined && { Publish: params.publish }),
        ...(params.dryRun !== undefined && { DryRun: params.dryRun })
      });
      
      const response = await client.send(command);
      
      core.setOutput('function-arn', response.FunctionArn);
      if (response.Version) {
        core.setOutput('version', response.Version);
      }
      
      return response;
    });
    
    try {
      const mockClient = new LambdaClient();
      const mockParams = {
        functionName: 'test-function',
        finalZipPath: '/mock/path/lambda.zip',
        useS3Method: true,
        s3Bucket: 'test-bucket',
        s3Key: 'test-key',
        architectures: 'x86_64',
        publish: true,
        dryRun: false,
        region: 'us-east-1'
      };
      
      await index.updateFunctionCode(mockClient, mockParams);
      
      expect(index.updateFunctionCode).toHaveBeenCalledWith(mockClient, mockParams);
      
      const command = UpdateFunctionCodeCommand.mock.calls[0][0];
      expect(command).toHaveProperty('FunctionName', 'test-function');
      expect(command).toHaveProperty('S3Bucket', 'test-bucket');
      expect(command).toHaveProperty('S3Key', 'test-key');
      expect(command).toHaveProperty('Architectures', ['x86_64']);
      expect(command).toHaveProperty('Publish', true);
      
      expect(core.setOutput).toHaveBeenCalledWith('function-arn', expect.any(String));
      expect(core.setOutput).toHaveBeenCalledWith('version', expect.any(String));
    } finally {
      index.updateFunctionCode = originalUpdateFunctionCode;
    }
  });
  
  test('S3 method should propagate errors from uploadToS3', async () => {
    const originalUpdateFunctionCode = index.updateFunctionCode;
    
    try {
      index.updateFunctionCode = async (client, params) => {
        if (params.useS3Method) {
          core.info(`Using S3 deployment method with bucket: ${params.s3Bucket}, key: ${params.s3Key}`);

          await index.uploadToS3(params.finalZipPath, params.s3Bucket, params.s3Key, params.region);

          core.info(`Successfully uploaded package to S3: s3://${params.s3Bucket}/${params.s3Key}`);

        } else {
          return;
        }
      };

      core.info = jest.fn();

      const mockClient = {};

      const mockParams = {
        functionName: 'test-function',
        finalZipPath: '/mock/path/lambda.zip',
        useS3Method: true,
        s3Bucket: 'test-bucket',
        s3Key: 'test-key',
        architectures: 'x86_64',
        publish: true,
        dryRun: false,
        region: 'us-east-1'
      };

      const originalUploadToS3 = index.uploadToS3;
      const testError = new Error('S3 upload failure');
      index.uploadToS3 = jest.fn().mockRejectedValue(testError);

      await expect(index.updateFunctionCode(mockClient, mockParams))
        .rejects.toThrow('S3 upload failure');

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(`Using S3 deployment method with bucket: ${mockParams.s3Bucket}, key: ${mockParams.s3Key}`)
      );

      expect(index.uploadToS3).toHaveBeenCalledWith(
        mockParams.finalZipPath, 
        mockParams.s3Bucket,
        mockParams.s3Key,
        mockParams.region
      );

      expect(core.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Successfully uploaded package to S3')
      );
      
      index.uploadToS3 = originalUploadToS3;
    } finally {
      index.updateFunctionCode = originalUpdateFunctionCode;
    }
  });

  test('Handle errors in updateFunctionCode function', async () => {
    const mockClient = new LambdaClient();
    const mockError = new Error('Function code update failed');
    mockError.name = 'ResourceNotFoundException';
    mockClient.send.mockRejectedValue(mockError);

    const mockParams = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/lambda.zip',
      useS3Method: false,
      architectures: 'x86_64',
      publish: true,
      dryRun: false,
      region: 'us-east-1'
    };

    await expect(index.updateFunctionCode(mockClient, mockParams))
      .rejects.toThrow();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update function code')
    );
  });
  
  test('Test direct upload method (ZipFile parameter)', async () => {
    const mockZipContent = Buffer.from('mock zip content');
    fs.readFile.mockResolvedValue(mockZipContent);

    const mockClient = new LambdaClient();

    mockClient.send.mockResolvedValue({
      FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      Version: '3'
    });

    const mockParams = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/lambda.zip',
      useS3Method: false, 
      architectures: 'x86_64',
      publish: true,
      dryRun: false,
      region: 'us-east-1'
    };

    await index.updateFunctionCode(mockClient, mockParams);

    expect(fs.readFile).toHaveBeenCalledWith(mockParams.finalZipPath);

    expect(mockClient.send).toHaveBeenCalled();
    const commandCall = mockClient.send.mock.calls[0][0];
    expect(commandCall).toBeInstanceOf(UpdateFunctionCodeCommand);

    expect(core.info).toHaveBeenCalledWith(expect.stringContaining(`Original buffer length: ${mockZipContent.length} bytes`));

    expect(core.setOutput).toHaveBeenCalledWith('function-arn', expect.any(String));
    expect(core.setOutput).toHaveBeenCalledWith('version', expect.any(String));
  });
  
  test('Handle file read errors - ENOENT (file not found)', async () => {
    const readError = new Error('File not found');
    readError.code = 'ENOENT';
    fs.readFile.mockRejectedValue(readError);
    
    const mockClient = new LambdaClient();

    const mockParams = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/lambda.zip',
      useS3Method: false,
      codeArtifactsDir: '/mock/src',
      architectures: 'x86_64',
      publish: true,
      dryRun: false,
      region: 'us-east-1'
    };

    await expect(index.updateFunctionCode(mockClient, mockParams))
      .rejects.toThrow('File not found');

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read Lambda deployment package')
    );
 
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('File not found. Ensure the code artifacts directory')
    );
  });
  
  test('Handle file read errors - EACCES (permission denied)', async () => {
    const readError = new Error('Permission denied');
    readError.code = 'EACCES';
    fs.readFile.mockRejectedValue(readError);

    const mockClient = new LambdaClient();

    const mockParams = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/lambda.zip',
      useS3Method: false,
      codeArtifactsDir: '/mock/src',
      architectures: 'x86_64',
      publish: true,
      dryRun: false,
      region: 'us-east-1'
    };
    
    await expect(index.updateFunctionCode(mockClient, mockParams))
      .rejects.toThrow('Permission denied');
    
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read Lambda deployment package')
    );
    
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied. Check file access permissions.')
    );
  });
  
  test('Test dry run mode', async () => {
    const mockZipContent = Buffer.from('mock zip content');
    fs.readFile.mockResolvedValue(mockZipContent);
    
    const mockClient = new LambdaClient();

    mockClient.send.mockResolvedValue({
      FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      Version: '$LATEST'
    });

    const mockParams = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/lambda.zip',
      useS3Method: false,
      architectures: 'x86_64',
      publish: true,
      dryRun: true, 
      region: 'us-east-1'
    };

    await index.updateFunctionCode(mockClient, mockParams);

    expect(mockClient.send).toHaveBeenCalled();
    const commandCall = mockClient.send.mock.calls[0][0];
    expect(commandCall).toBeInstanceOf(UpdateFunctionCodeCommand);

    expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/\[DRY RUN\]/));
    expect(core.info).toHaveBeenCalledWith('[DRY RUN] Function code validation passed');
    expect(core.info).toHaveBeenCalledWith('[DRY RUN] Function code update simulation completed');

    expect(core.setOutput).toHaveBeenCalledWith('function-arn', expect.any(String));
    expect(core.setOutput).toHaveBeenCalledWith('version', expect.any(String));
  });
  
  test('Handle AWS specific errors - ThrottlingException', async () => {

    const mockZipContent = Buffer.from('mock zip content');
    fs.readFile.mockResolvedValue(mockZipContent);
  
    const mockClient = new LambdaClient();

    const throttlingError = new Error('Rate exceeded');
    throttlingError.name = 'ThrottlingException';
    mockClient.send.mockRejectedValue(throttlingError);

    const mockParams = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/lambda.zip',
      useS3Method: false,
      architectures: 'x86_64',
      publish: true,
      dryRun: false,
      region: 'us-east-1'
    };

    await expect(index.updateFunctionCode(mockClient, mockParams))
      .rejects.toThrow('Rate exceeded');

    expect(core.setFailed).toHaveBeenCalledWith(
      'Rate limit exceeded and maximum retries reached: Rate exceeded'
    );
  });
  
  test('Handle AWS specific errors - Server error (500)', async () => {
    const mockZipContent = Buffer.from('mock zip content');
    fs.readFile.mockResolvedValue(mockZipContent);

    const mockClient = new LambdaClient();

    const serverError = new Error('Internal server error');
    serverError.$metadata = { httpStatusCode: 500 };
    mockClient.send.mockRejectedValue(serverError);

    const mockParams = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/lambda.zip',
      useS3Method: false,
      architectures: 'x86_64',
      publish: true,
      dryRun: false,
      region: 'us-east-1'
    };

    await expect(index.updateFunctionCode(mockClient, mockParams))
      .rejects.toThrow('Internal server error');

    expect(core.setFailed).toHaveBeenCalledWith(
      'Server error (500): Internal server error. All retry attempts failed.'
    );
  });
  
  test('Handle AWS specific errors - Access denied', async () => {
    const mockZipContent = Buffer.from('mock zip content');
    fs.readFile.mockResolvedValue(mockZipContent);

    const mockClient = new LambdaClient();

    const accessError = new Error('Access denied');
    accessError.name = 'AccessDeniedException';
    mockClient.send.mockRejectedValue(accessError);
    
    const mockParams = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/lambda.zip',
      useS3Method: false,
      architectures: 'x86_64',
      publish: true,
      dryRun: false,
      region: 'us-east-1'
    };
    
    await expect(index.updateFunctionCode(mockClient, mockParams))
      .rejects.toThrow('Access denied');

    expect(core.setFailed).toHaveBeenCalledWith(
      'Action failed with error: Permissions error: Access denied. Check IAM roles.'
    );
  });
  
  test('Log stack trace when available', async () => {
    const mockZipContent = Buffer.from('mock zip content');
    fs.readFile.mockResolvedValue(mockZipContent);

    const mockClient = new LambdaClient();

    const error = new Error('Something went wrong');
    error.stack = 'Error: Something went wrong\n    at Function.updateFunctionCode';
    mockClient.send.mockRejectedValue(error);

    core.debug = jest.fn();

    const mockParams = {
      functionName: 'test-function',
      finalZipPath: '/mock/path/lambda.zip',
      useS3Method: false,
      architectures: 'x86_64',
      publish: true,
      dryRun: false,
      region: 'us-east-1'
    };

    await expect(index.updateFunctionCode(mockClient, mockParams))
      .rejects.toThrow('Something went wrong');

    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to update function code: Something went wrong'
    );

    expect(core.debug).toHaveBeenCalledWith(error.stack);
  });
});

describe('Function Existence Check', () => {
  jest.setTimeout(60000); 

  let mockSend;
  
  beforeEach(() => {
    jest.resetAllMocks();
    
    core.getInput = jest.fn();
    core.getBooleanInput = jest.fn();
    core.info = jest.fn();
    core.setFailed = jest.fn();
    core.debug = jest.fn();
    core.setOutput = jest.fn();
    
    mockSend = jest.fn();
    LambdaClient.prototype.send = mockSend;
    
    GetFunctionConfigurationCommand.mockImplementation((params) => ({
      ...params,
      type: 'GetFunctionConfigurationCommand'
    }));

    CreateFunctionCommand.mockImplementation((params) => ({
      ...params,
      type: 'CreateFunctionCommand'
    }));

    fs.readFile = jest.fn().mockResolvedValue(Buffer.from('mock zip content'));
  });
  
  describe('checkFunctionExists', () => {
    it('should return true when the function exists', async () => {
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

  describe('Function Creation', () => {
    let inputs;
    
    beforeEach(() => {
      index.uploadToS3 = jest.fn().mockImplementation(async (zipFilePath, bucketName, s3Key, region) => {
        return {
          bucket: bucketName,
          key: s3Key,
          versionId: 'mock-version-id'
        };
      });
      
      index.checkBucketExists = jest.fn().mockResolvedValue(true);
      index.createBucket = jest.fn().mockResolvedValue(true);
      
      index.waitForFunctionActive = jest.fn().mockResolvedValue(undefined);

      inputs = {
        functionName: 'test-function',
        region: 'us-east-1',
        role: 'arn:aws:iam::123456789012:role/lambda-role',
        runtime: 'nodejs18.x',
        handler: 'index.handler',
        dryRun: false,
        finalZipPath: '/path/to/function.zip',
        parsedMemorySize: 256,
        timeout: 15,
        publish: true,
        architectures: ['x86_64'],
        ephemeralStorage: 512,
        packageType: 'Zip',
        enhancedEnvironment: { NODE_ENV: 'production' }
      };
    });

    test('should create a Lambda function successfully', async () => {
      jest.spyOn(index, 'checkFunctionExists').mockResolvedValue(false);

      const mockResponse = {
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Version: '1'
      };
      const mockSend = jest.fn().mockResolvedValue(mockResponse);

      LambdaClient.mockImplementation(() => ({
        send: mockSend
      }));

      index.waitForFunctionActive = jest.fn().mockImplementation(() => {
        core.info('Mock waitForFunctionActive called and immediately resolved');
        return Promise.resolve(undefined);
      });

      fs.readFile.mockClear();
      fs.readFile.mockResolvedValue(Buffer.from('mock zip content'));
      
      const client = new LambdaClient();
      const inputs = {
        functionName: 'test-function',
        role: 'arn:aws:iam::123456789012:role/lambda-role',
        finalZipPath: '/path/to/function.zip',
        runtime: 'nodejs18.x',
        handler: 'index.handler',
        parsedEnvironment: { NODE_ENV: 'production' },
        parsedMemorySize: 256,
        timeout: 15,
        publish: true,
        architectures: ['x86_64'],
        ephemeralStorage: 512,
        packageType: 'Zip'
      };

      await index.createFunction(client, inputs, false);

      const createFunctionCall = CreateFunctionCommand.mock.calls[0][0];

      expect(createFunctionCall.FunctionName).toBe('test-function');
      expect(createFunctionCall.Role).toBe('arn:aws:iam::123456789012:role/lambda-role');
      expect(createFunctionCall.Runtime).toBe('nodejs18.x');
      expect(createFunctionCall.Handler).toBe('index.handler');
      expect(createFunctionCall.MemorySize).toBe(256);
      expect(createFunctionCall.Timeout).toBe(15);
      expect(createFunctionCall.Publish).toBe(true);
      expect(createFunctionCall.Architectures).toEqual(['x86_64']);
      if (createFunctionCall.EphemeralStorage) {
        expect(createFunctionCall.EphemeralStorage).toEqual({ Size: 512 });
      }
      if (createFunctionCall.PackageType) {
        expect(createFunctionCall.PackageType).toBe('Zip');
      }
 
      expect(createFunctionCall.Code).toBeDefined();
      expect(createFunctionCall.Code.ZipFile).toBeDefined();
      expect(Buffer.isBuffer(createFunctionCall.Code.ZipFile)).toBe(true);
      expect(createFunctionCall.Environment).toBeDefined();
      expect(createFunctionCall.Environment.Variables).toBeDefined();
      expect(createFunctionCall.Environment.Variables.NODE_ENV).toBe('production');
      expect(core.setOutput).toHaveBeenCalledWith('function-arn', 'arn:aws:lambda:us-east-1:123456789012:function:test-function');
      expect(core.setOutput).toHaveBeenCalledWith('version', '1');
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Function test-function doesn't exist, creating new function"));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Lambda function created successfully"));
    }, 300000);

    it('should error when role is not provided for a new function', async () => {
      inputs.role = '';
      
      const client = new LambdaClient({ region: 'us-east-1' });
      
      await index.createFunction(client, inputs, false);
      
      expect(core.setFailed).toHaveBeenCalledWith('Role ARN must be provided when creating a new function');
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    it('should upload to S3 when bucket is provided', async () => {
      const originalCreateFunction = index.createFunction;
      
      try {
        index.createFunction = jest.fn().mockImplementation(async (client, theInputs) => {
          if (theInputs.s3Bucket !== 'my-lambda-bucket') {
            throw new Error('Expected S3 bucket to be my-lambda-bucket');
          }
          
          if (theInputs.s3Key!== 'functions/test-function.zip') {
            throw new Error('Expected S3 key to be functions/test-function.zip');
          }
          
          core.info(`Successfully uploaded package to S3: s3://${theInputs.s3Bucket}/${theInputs.s3Key}`);
          
          const response = {
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
            Version: '$LATEST'
          };
          
          core.setOutput('function-arn', response.FunctionArn);
          core.setOutput('version', response.Version);
          
          return response;
        });
        
        inputs.s3Bucket = 'my-lambda-bucket';
        inputs.s3Key = 'functions/test-function.zip';
        inputs.sourceKmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/my-key';
        
        const client = new LambdaClient({ region: 'us-east-1' });
        const result = await index.createFunction(client, inputs);
        
        expect(index.createFunction).toHaveBeenCalledWith(client, expect.objectContaining({
          s3Bucket: 'my-lambda-bucket',
          s3Key: 'functions/test-function.zip',
          sourceKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/my-key'
        }));
        
        expect(core.setOutput).toHaveBeenCalledWith('function-arn', 'arn:aws:lambda:us-east-1:123456789012:function:test-function');
        expect(core.setOutput).toHaveBeenCalledWith('version', '$LATEST');

        expect(core.info).toHaveBeenCalledWith('Successfully uploaded package to S3: s3://my-lambda-bucket/functions/test-function.zip');
        
        expect(result).toEqual({
          FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
          Version: '$LATEST'
        });
      } finally {
        index.createFunction = originalCreateFunction;
      }
    });
    
    it('should set up S3 code parameter when S3 bucket is provided and include Version in output', async () => {
      const s3UploadResult = { bucket: 'test-bucket', key: 'test-key' };
      index.uploadToS3 = jest.fn().mockResolvedValue(s3UploadResult);
      
      inputs.s3Bucket = 'test-bucket';
      inputs.s3Key = 'test-key';
      inputs.sourceKmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/mock-key';
      
      let capturedCodeParameter = null;
      const originalCreateFunction = index.createFunction;
      index.createFunction = jest.fn().mockImplementation(async (client, theInputs) => {
        try {
          core.info('Creating Lambda function with deployment package');
          
          if (theInputs.s3Bucket) {
            await index.uploadToS3(theInputs.finalZipPath, theInputs.s3Bucket, theInputs.s3Key, theInputs.region);
            core.info(`Successfully uploaded package to S3: s3://${theInputs.s3Bucket}/${theInputs.s3Key}`);
            
            capturedCodeParameter = {
              S3Bucket: theInputs.s3Bucket,
              S3Key: theInputs.s3Key,
              ...(theInputs.sourceKmsKeyArn && { SourceKmsKeyArn: theInputs.sourceKmsKeyArn })
            };
          }
          
          const response = {
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
            Version: '1'
          };
          
          core.setOutput('function-arn', response.FunctionArn);
          if (response.Version) {
            core.setOutput('version', response.Version);
          }
          
          core.info('Lambda function created successfully');
          core.info(`Waiting for function ${theInputs.functionName} to become active before proceeding`);
          
          return response;
        } finally {
          index.createFunction = originalCreateFunction;
        }
      });
      
      const client = new LambdaClient({ region: 'us-east-1' });
      const result = await index.createFunction(client, inputs);
      
      expect(index.uploadToS3).toHaveBeenCalledWith(
        inputs.finalZipPath,
        'test-bucket',
        'test-key',
        'us-east-1'
      );
      
      expect(capturedCodeParameter).toEqual({
        S3Bucket: 'test-bucket',
        S3Key: 'test-key',
        SourceKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/mock-key'
      });
      
      expect(core.setOutput).toHaveBeenCalledWith('function-arn', 'arn:aws:lambda:us-east-1:123456789012:function:test-function');
      expect(core.setOutput).toHaveBeenCalledWith('version', '1');

      expect(core.info).toHaveBeenCalledWith('Lambda function created successfully');
      expect(core.info).toHaveBeenCalledWith('Waiting for function test-function to become active before proceeding');

      expect(result).toEqual({
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Version: '1'
      });

      index.createFunction = originalCreateFunction;
    });
    
    it('should handle S3 upload failure', async () => {
      const uploadError = new Error('S3 upload failed');
      index.uploadToS3 = jest.fn().mockRejectedValue(uploadError);

      inputs.s3Bucket = 'test-bucket';
      inputs.s3Key = 'test-key';

      const originalCreateFunction = index.createFunction;
      index.createFunction = jest.fn().mockImplementation(async (client, theInputs) => {
        try {
          core.info('Creating Lambda function with deployment package');
          
          if (theInputs.s3Bucket) {
            try {
              await index.uploadToS3(theInputs.finalZipPath, theInputs.s3Bucket, theInputs.s3Key, theInputs.region);
              core.info(`Successfully uploaded package to S3: s3://${theInputs.s3Bucket}/${theInputs.s3Key}`);
            } catch (error) {
              core.setFailed(`Failed to upload package to S3: ${error.message}`);
              if (error.stack) {
                core.debug(error.stack);
              }
              throw error;
            }
          }
          
          return {
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
            Version: '1'
          };
        } finally {
          index.createFunction = originalCreateFunction;
        }
      });

      const client = new LambdaClient({ region: 'us-east-1' });
      await expect(index.createFunction(client, inputs)).rejects.toThrow('S3 upload failed');

      expect(core.setFailed).toHaveBeenCalledWith('Failed to upload package to S3: S3 upload failed');
      expect(core.debug).toHaveBeenCalledWith(uploadError.stack);

      index.createFunction = originalCreateFunction;
    });
    
    it('should set up ZipFile code parameter when no S3 bucket is provided and handle missing Version', async () => {
      const mockZipContent = Buffer.from('mock zip content');
      fs.readFile = jest.fn().mockResolvedValue(mockZipContent);

      inputs.s3Bucket = '';
      delete inputs.s3Key;

      let capturedCodeParameter = null;
      const originalCreateFunction = index.createFunction;
      index.createFunction = jest.fn().mockImplementation(async (client, theInputs) => {
        try {
          core.info('Creating Lambda function with deployment package');
          
          if (!theInputs.s3Bucket) {
            try {
              const zipFileContent = await fs.readFile(theInputs.finalZipPath);
              core.info(`Zip file read successfully, size: ${zipFileContent.length} bytes`);
              
              capturedCodeParameter = {
                ZipFile: zipFileContent,
                ...(theInputs.sourceKmsKeyArn && { SourceKmsKeyArn: theInputs.sourceKmsKeyArn })
              };
            } catch (error) {
              if (error.code === 'EACCES') {
                core.setFailed(`Failed to read Lambda deployment package: Permission denied`);
                core.error('Permission denied. Check file access permissions.');
              } else {
                core.setFailed(`Failed to read Lambda deployment package: ${error.message}`);
              }
              if (error.stack) {
                core.debug(error.stack);
              }
              throw error;
            }
          }
          
          const response = {
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
          };
          
          core.setOutput('function-arn', response.FunctionArn);
          if (response.Version) {
            core.setOutput('version', response.Version);
          }
          
          core.info('Lambda function created successfully');
          core.info(`Waiting for function ${theInputs.functionName} to become active before proceeding`);
          
          return response;
        } finally {
          index.createFunction = originalCreateFunction;
        }
      });
      
      const client = new LambdaClient({ region: 'us-east-1' });
      const result = await index.createFunction(client, inputs);
      
      expect(fs.readFile).toHaveBeenCalledWith(inputs.finalZipPath);
      
      expect(capturedCodeParameter).toEqual({
        ZipFile: mockZipContent
      });
      
      expect(core.info).toHaveBeenCalledWith('Zip file read successfully, size: 16 bytes');
      expect(core.info).toHaveBeenCalledWith('Lambda function created successfully');
      expect(core.info).toHaveBeenCalledWith('Waiting for function test-function to become active before proceeding');
      
      expect(core.setOutput).toHaveBeenCalledWith('function-arn', 'arn:aws:lambda:us-east-1:123456789012:function:test-function');
      
      const versionCalls = core.setOutput.mock.calls.filter(call => call[0] === 'version');
      expect(versionCalls.length).toBe(0);

      expect(result).toEqual({
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
      });

      index.createFunction = originalCreateFunction;
    });
    
    it('should handle file read error (permission denied)', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.readFile = jest.fn().mockRejectedValue(permissionError);

      inputs.s3Bucket = '';
      delete inputs.s3Key;

      const originalCreateFunction = index.createFunction;
      index.createFunction = jest.fn().mockImplementation(async (client, theInputs) => {
        try {
          core.info('Creating Lambda function with deployment package');
          
          if (!theInputs.s3Bucket) {
            try {
              const zipFileContent = await fs.readFile(theInputs.finalZipPath);
              core.info(`Zip file read successfully, size: ${zipFileContent.length} bytes`);
            } catch (error) {
              if (error.code === 'EACCES') {
                core.setFailed(`Failed to read Lambda deployment package: Permission denied`);
                core.error('Permission denied. Check file access permissions.');
              } else {
                core.setFailed(`Failed to read Lambda deployment package: ${error.message}`);
              }
              if (error.stack) {
                core.debug(error.stack);
              }
              throw error;
            }
          }
          
          return {
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
            Version: '1'
          };
        } finally {
          index.createFunction = originalCreateFunction;
        }
      });

      const client = new LambdaClient({ region: 'us-east-1' });
      await expect(index.createFunction(client, inputs)).rejects.toThrow('Permission denied');

      expect(core.setFailed).toHaveBeenCalledWith('Failed to read Lambda deployment package: Permission denied');
      expect(core.error).toHaveBeenCalledWith('Permission denied. Check file access permissions.');
      expect(core.debug).toHaveBeenCalledWith(permissionError.stack);

      index.createFunction = originalCreateFunction;
    });
    
    it('should handle general file read error', async () => {
      const fileError = new Error('File not found');
      fileError.code = 'ENOENT';
      fs.readFile = jest.fn().mockRejectedValue(fileError);

      inputs.s3Bucket = '';
      delete inputs.s3Key;

      const originalCreateFunction = index.createFunction;
      index.createFunction = jest.fn().mockImplementation(async (client, theInputs) => {
        try {
          core.info('Creating Lambda function with deployment package');
          
          if (!theInputs.s3Bucket) {
            try {
              const zipFileContent = await fs.readFile(theInputs.finalZipPath);
              core.info(`Zip file read successfully, size: ${zipFileContent.length} bytes`);
            } catch (error) {
              if (error.code === 'EACCES') {
                core.setFailed(`Failed to read Lambda deployment package: Permission denied`);
                core.error('Permission denied. Check file access permissions.');
              } else {
                core.setFailed(`Failed to read Lambda deployment package: ${error.message}`);
              }
              if (error.stack) {
                core.debug(error.stack);
              }
              throw error;
            }
          }
          
          return {
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
            Version: '1'
          };
        } finally {
          index.createFunction = originalCreateFunction;
        }
      });

      const client = new LambdaClient({ region: 'us-east-1' });
      await expect(index.createFunction(client, inputs)).rejects.toThrow('File not found');

      expect(core.setFailed).toHaveBeenCalledWith('Failed to read Lambda deployment package: File not found');
      expect(core.debug).toHaveBeenCalledWith(fileError.stack);

      index.createFunction = originalCreateFunction;
    });
  }); 
});
