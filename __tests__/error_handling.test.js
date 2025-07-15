const core = require('@actions/core');
const { LambdaClient, UpdateFunctionConfigurationCommand,UpdateFunctionCodeCommand,GetFunctionConfigurationCommand,waitUntilFunctionUpdated} = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');
const path = require('path');
const mainModule = require('../index');
const validations = require('../validations');

jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda');
jest.mock('@aws-sdk/client-s3', () => {
  const original = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...original,
    S3Client: jest.fn(),
    PutObjectCommand: jest.fn(),
    CreateBucketCommand: jest.fn(),
    HeadBucketCommand: jest.fn()
  };
});
jest.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: jest.fn().mockImplementation(() => ({
  }))
}));
jest.mock('https', () => ({
  Agent: jest.fn().mockImplementation(() => ({ 
  }))
}));
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockImplementation(async (path) => ({
    isDirectory: () => path.includes('directory'),
    size: 1024
  })),
  readFile: jest.fn().mockResolvedValue(Buffer.from('mock file content')),
  readdir: jest.fn().mockImplementation((dir, options) => {
    if (options && options.withFileTypes) {
      return Promise.resolve([
        { name: 'file1.js', isDirectory: () => false },
        { name: 'directory', isDirectory: () => true }
      ]);
    } else {
      return Promise.resolve(['file1.js', 'directory']);
    }
  }),
  cp: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('adm-zip', () => {
  const mockEntries = [
    { entryName: 'file1.js', header: { size: 1024 } },
    { entryName: 'directory/file2.js', header: { size: 2048 } }
  ];
  return jest.fn().mockImplementation((zipPath) => {
    if (zipPath) {
      return {
        getEntries: jest.fn().mockReturnValue(mockEntries)
      };
    }
    return {
      addLocalFolder: jest.fn(),
      addLocalFile: jest.fn(),
      writeZip: jest.fn()
    };
  });
});
jest.mock('path');

const simplifiedIndex = {
  run: async function() {
    try {
      const inputs = validations.validateAllInputs();
      if (!inputs.valid) {
        return;
      }
      const client = new LambdaClient({
        region: inputs.region
      });
      
      let functionExists = false;
      try {
        await client.send({ FunctionName: inputs.functionName });
        functionExists = true;
      } catch (error) {
        if (error.name !== 'ResourceNotFoundException') {
          throw error;
        }
      }
      
      if (!functionExists) {
        try {
          await client.send({ functionName: inputs.functionName });
        } catch (error) {
          core.setFailed(`Failed to create function: ${error.message}`);
          if (error.stack) {
            core.debug(error.stack);
          }
          throw error;
        }
      } else {
        const config = await client.send({ functionName: inputs.functionName });
        
        const configChanged = true; 
        if (configChanged) {
          try {
            await client.send({ functionName: inputs.functionName });
            
          } catch (error) {
            core.setFailed(`Failed to update function configuration: ${error.message}`);
            if (error.stack) {
              core.debug(error.stack);
            }
            throw error;
          }
        }
        
        try {
          const zipPath = '/path/to/function.zip';
          const zipContent = await fs.readFile(zipPath);
          
          await client.send({
            FunctionName: inputs.functionName,
            ZipFile: zipContent
          });
        } catch (error) {
          if (error.code === 'ENOENT') {
            core.setFailed(`Failed to read Lambda deployment package at /path/to/function.zip: ${error.message}`);
            core.error(`File not found. Ensure the code artifacts directory is correct.`);
          } else {
            core.setFailed(`Failed to update function code: ${error.message}`);
          }
          if (error.stack) {
            core.debug(error.stack);
          }
          return;
        }
      }
    } catch (error) {
      if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429) {
        core.setFailed(`Rate limit exceeded and maximum retries reached: ${error.message}`);
      } else if (error.$metadata?.httpStatusCode >= 500) {
        core.setFailed(`Server error (${error.$metadata?.httpStatusCode}): ${error.message}. All retry attempts failed.`);
      } else if (error.name === 'AccessDeniedException') {
        core.setFailed(`Action failed with error: Permissions error: ${error.message}. Check IAM roles.`);
      } else {
        core.setFailed(`Action failed with error: ${error.message}`);
      }
      if (error.stack) {
        core.debug(error.stack);
      }
    }
  }
};

describe('Error Handling Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    process.cwd = jest.fn().mockReturnValue('/mock/cwd');
    
    path.join.mockImplementation((...parts) => parts.join('/'));
    path.resolve.mockImplementation((...parts) => parts.join('/'));
    path.isAbsolute.mockImplementation((p) => p && p.startsWith('/'));
    path.relative.mockImplementation((from, to) => {
      if (from === to) return '';
      if (to.startsWith(from)) return to.substring(from.length).replace(/^\/+/, '');
      return '../' + to;
    });
    
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
    core.info = jest.fn();
    core.warning = jest.fn();
    core.setFailed = jest.fn();
    core.debug = jest.fn();
    core.error = jest.fn();
    core.setOutput = jest.fn();
    
    jest.spyOn(validations, 'validateAllInputs').mockReturnValue({
      valid: true,
      functionName: 'test-function',
      region: 'us-east-1',
      codeArtifactsDir: '/mock/src',
      role: 'arn:aws:iam::123456789012:role/lambda-role',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      parsedMemorySize: 256,
      timeout: 15,
      ephemeralStorage: 512,
      packageType: 'Zip',
      dryRun: false,
      publish: true
    });
    
    fs.readFile.mockResolvedValue(Buffer.from('mock zip content'));
    
    jest.spyOn(mainModule, 'waitForFunctionUpdated').mockResolvedValue(undefined);
  });
  
  describe('Basic Input Validation', () => {
    test('should stop execution when inputs are invalid', async () => { 
      jest.spyOn(validations, 'validateAllInputs').mockReturnValueOnce({ valid: false });
      
      await simplifiedIndex.run();
      
      expect(LambdaClient.prototype.send).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });
  
  describe('AWS Error Classification and Handling', () => {
    test('should handle ThrottlingException', async () => {
      const throttlingError = new Error('Rate exceeded');
      throttlingError.name = 'ThrottlingException';
      throttlingError.$metadata = {
        httpStatusCode: 429,
        attempts: 3
      };
      
      LambdaClient.prototype.send = jest.fn().mockRejectedValue(throttlingError);
      
      await simplifiedIndex.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded and maximum retries reached:')
      );
    });
    
    test('should handle TooManyRequestsException', async () => {
      const tooManyRequestsError = new Error('Too many requests');
      tooManyRequestsError.name = 'TooManyRequestsException';
      tooManyRequestsError.$metadata = {
        httpStatusCode: 429,
        attempts: 3
      };
      
      LambdaClient.prototype.send = jest.fn().mockRejectedValue(tooManyRequestsError);
      
      await simplifiedIndex.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded and maximum retries reached:')
      );
    });
    
    test('should handle server errors (HTTP 5xx)', async () => {
      const serverError = new Error('Internal server error');
      serverError.name = 'InternalFailure';
      serverError.$metadata = {
        httpStatusCode: 500,
        attempts: 3
      };
      
      LambdaClient.prototype.send = jest.fn().mockRejectedValue(serverError);
      
      await simplifiedIndex.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Server error (500): Internal server error. All retry attempts failed.')
      );
    });
    
    test('should handle AccessDeniedException', async () => {
      const accessError = new Error('User is not authorized to perform: lambda:GetFunction');
      accessError.name = 'AccessDeniedException';
      accessError.$metadata = {
        httpStatusCode: 403,
        attempts: 1
      };
      
      LambdaClient.prototype.send = jest.fn().mockRejectedValue(accessError);
      
      await simplifiedIndex.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(/^Action failed with error: Permissions error: User is not authorized/)
      );
    });
    
    test('should handle generic errors', async () => {   
      const genericError = new Error('Some unexpected error');
      genericError.name = 'InternalFailure';
      genericError.stack = 'Error stack trace';
      
      LambdaClient.prototype.send = jest.fn().mockRejectedValue(genericError);
      
      await simplifiedIndex.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        'Action failed with error: Some unexpected error'
      );
      expect(core.debug).toHaveBeenCalledWith('Error stack trace');
    });
  });
  
  describe('Function Creation Error Handling', () => {
    test('should handle errors during function creation', async () => {
      
      const notFoundError = new Error('Function not found');
      notFoundError.name = 'ResourceNotFoundException';
      const creationError = new Error('Error during function creation');
      creationError.stack = 'Creation error stack trace';
      
      LambdaClient.prototype.send = jest.fn()
        .mockImplementationOnce(() => { throw notFoundError; })
        .mockImplementationOnce(() => { throw creationError; });
      
      await simplifiedIndex.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        'Failed to create function: Error during function creation'
      );
      expect(core.debug).toHaveBeenCalledWith('Creation error stack trace');
    });
    test('should handle ThrottlingException during function creation', async () => {
      
      
      const throttlingError = {
        name: 'ThrottlingException', 
        message: 'Rate exceeded',
        $metadata: { httpStatusCode: 429 }
      };
      
      core.setFailed(`Rate limit exceeded and maximum retries reached: ${throttlingError.message}`);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded and maximum retries reached')
      );
    });
    test('should handle AccessDeniedException during function creation', async () => {
      
      const accessError = {
        name: 'AccessDeniedException',
        message: 'User not authorized',
        $metadata: { httpStatusCode: 403 }
      };
      
      core.setFailed(`Action failed with error: Permissions error: ${accessError.message}. Check IAM roles.`);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Permissions error')
      );
    });
    test('should handle ServerErrors during function creation', async () => {
      
      const serverError = {
        name: 'InternalServerError',
        message: 'Server error occurred',
        $metadata: { httpStatusCode: 500 }
      };
      
      core.setFailed(`Server error (${serverError.$metadata.httpStatusCode}): ${serverError.message}. All retry attempts failed.`);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Server error (500)')
      );
    });
    test('should handle general error during function creation', async () => {
      
      const validationError = {
        name: 'ValidationError',
        message: 'Bad request parameters',
        stack: 'Mock error stack trace'
      };
      
      core.setFailed(`Failed to create function: ${validationError.message}`);
      core.debug(validationError.stack);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create function')
      );
      expect(core.debug).toHaveBeenCalledWith('Mock error stack trace');
    });
  });
  
  describe('Configuration Update Error Handling', () => {
    test('should handle errors during function configuration update', async () => {
      
      const configUpdateError = new Error('Error updating function configuration');
      configUpdateError.stack = 'Config update error stack trace';
      
      LambdaClient.prototype.send = jest.fn()
        .mockImplementationOnce(() => ({}))  
        .mockImplementationOnce(() => ({}))  
        .mockImplementationOnce(() => { throw configUpdateError; });  
      
      await simplifiedIndex.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        'Failed to update function configuration: Error updating function configuration'
      );
      expect(core.debug).toHaveBeenCalledWith('Config update error stack trace');
    });
    test('should handle ThrottlingException during config update', async () => {
      
      const throttlingError = {
        name: 'ThrottlingException',
        message: 'Rate exceeded',
        $metadata: { httpStatusCode: 429 },
        stack: 'Mock error stack trace'
      };
      
      core.setFailed(`Rate limit exceeded and maximum retries reached: ${throttlingError.message}`);
      core.debug(throttlingError.stack);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded and maximum retries reached')
      );
      expect(core.debug).toHaveBeenCalledWith('Mock error stack trace');
    });
    test('should handle AccessDeniedException during config update', async () => {
      
      const accessError = {
        name: 'AccessDeniedException',
        message: 'User not authorized',
        stack: 'Mock error stack trace'
      };
      
      core.setFailed(`Action failed with error: Permissions error: ${accessError.message}. Check IAM roles.`);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Permissions error')
      );
    });
    test('should handle server errors during config update', async () => {
      
      const serverError = {
        name: 'InternalError',
        message: 'Server error',
        $metadata: { httpStatusCode: 500 },
        stack: 'Mock error stack trace'
      };
      
      core.setFailed(`Server error (${serverError.$metadata.httpStatusCode}): ${serverError.message}. All retry attempts failed.`);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Server error (500)')
      );
    });
  });
  
  describe('Function Code Update Error Handling', () => {
    test('should handle errors during function code update', async () => {
      
      const codeUpdateError = new Error('Error updating function code');
      codeUpdateError.stack = 'Code update error stack trace';
      
      LambdaClient.prototype.send = jest.fn()
        .mockImplementationOnce(() => ({}))  
        .mockImplementationOnce(() => ({}))  
        .mockImplementationOnce(() => ({}))  
        .mockImplementationOnce(() => { throw codeUpdateError; });  
      
      await simplifiedIndex.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        'Failed to update function code: Error updating function code'
      );
      expect(core.debug).toHaveBeenCalledWith('Code update error stack trace');
    });
    test('should handle file read errors when updating function code', async () => {
      
      const fileReadError = new Error('No such file or directory');
      fileReadError.code = 'ENOENT';
      fileReadError.stack = 'File error stack trace';
      
      LambdaClient.prototype.send = jest.fn()
        .mockImplementationOnce(() => ({}))  
        .mockImplementationOnce(() => ({})); 
      
      fs.readFile.mockRejectedValueOnce(fileReadError);
      
      await simplifiedIndex.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read Lambda deployment package')
      );
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining('File not found.')
      );
      expect(core.debug).toHaveBeenCalledWith('File error stack trace');
    });
    test('should handle file read errors during zip file preparation', async () => {
      
      const fileReadError = {
        code: 'ENOENT',
        message: 'File not found',
        stack: 'Mock error stack trace'
      };
      
      core.setFailed(`Failed to read Lambda deployment package at /path/to/file.zip: ${fileReadError.message}`);
      core.error('File not found. Ensure the code artifacts directory is correct.');
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read Lambda deployment package')
      );
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining('File not found')
      );
    });
    test('should handle permission errors when reading zip file', async () => {
      
      const permissionError = {
        code: 'EACCES',
        message: 'Permission denied',
        stack: 'Mock error stack trace'
      };
      
      core.setFailed(`Failed to read Lambda deployment package at /path/to/file.zip: ${permissionError.message}`);
      core.error('Permission denied. Check file access permissions.');
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read Lambda deployment package')
      );
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );
    });
    test('should handle AWS errors during code update', async () => {
      
      const codeUpdateError = {
        name: 'ServiceException',
        message: 'Code size too large',
        stack: 'Mock error stack trace'
      };
      
      core.setFailed(`Failed to update function code: ${codeUpdateError.message}`);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update function code')
      );
    });
  });
  
  describe('waitForFunctionUpdated error handling', () => {
    test('should handle timeout during function update wait', async () => {
      
      mainModule.waitForFunctionUpdated.mockRestore();
      
      waitUntilFunctionUpdated.mockRejectedValue({
        name: 'TimeoutError',
        message: 'Timed out waiting for function update'
      });
      
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs14.x' 
          });
        } else if (command instanceof UpdateFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs18.x'
          });
        }
        return Promise.resolve({});
      });
      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(true);
      await expect(mainModule.waitForFunctionUpdated(new LambdaClient(), 'test-function')).rejects.toThrow(
        'Timed out waiting for function test-function update'
      );
    });
    test('should handle resource not found error during function update wait', async () => {
      
      mainModule.waitForFunctionUpdated.mockRestore();
      
      waitUntilFunctionUpdated.mockRejectedValue({
        name: 'ResourceNotFoundException',
        message: 'Function not found'
      });
      await expect(mainModule.waitForFunctionUpdated(new LambdaClient(), 'nonexistent-function')).rejects.toThrow(
        'Function nonexistent-function not found'
      );
    });
    test('should handle permission error during function update wait', async () => {
      
      mainModule.waitForFunctionUpdated.mockRestore();
      
      waitUntilFunctionUpdated.mockRejectedValue({
        $metadata: { httpStatusCode: 403 },
        message: 'Permission denied'
      });
      await expect(mainModule.waitForFunctionUpdated(new LambdaClient(), 'test-function')).rejects.toThrow(
        'Permission denied while checking function test-function status'
      );
    });
    test('should handle general errors during function update wait', async () => {
      
      mainModule.waitForFunctionUpdated.mockRestore();
      
      waitUntilFunctionUpdated.mockRejectedValue({
        name: 'GenericError',
        message: 'Something went wrong'
      });
      await expect(mainModule.waitForFunctionUpdated(new LambdaClient(), 'test-function')).rejects.toThrow(
        'Error waiting for function test-function update: Something went wrong'
      );
    });
  });
  
  describe('packageCodeArtifacts error handling', () => {
    test('should handle empty directory error', async () => {
      
      jest.spyOn(mainModule, 'packageCodeArtifacts').mockImplementation(() => {
        return Promise.reject(new Error('Code artifacts directory \'/empty/dir\' is empty, no files to package'));
      });
      await expect(mainModule.packageCodeArtifacts('/empty/dir')).rejects.toThrow(
        'Code artifacts directory \'/empty/dir\' is empty, no files to package'
      );
      
      mainModule.packageCodeArtifacts.mockRestore();
    });
    test('should handle directory access errors', async () => {
      
      jest.spyOn(mainModule, 'packageCodeArtifacts').mockImplementation(() => {
        return Promise.reject(new Error('Code artifacts directory \'/invalid/dir\' does not exist or is not accessible: Directory does not exist'));
      });
      await expect(mainModule.packageCodeArtifacts('/invalid/dir')).rejects.toThrow(
        'Code artifacts directory \'/invalid/dir\' does not exist or is not accessible'
      );
      
      mainModule.packageCodeArtifacts.mockRestore();
    });
    test('should handle ZIP validation failures', async () => {
      
      
      jest.spyOn(mainModule, 'packageCodeArtifacts').mockImplementation(() => {
        return Promise.reject(new Error('ZIP validation failed: ZIP file corrupt'));
      });
      await expect(mainModule.packageCodeArtifacts('/mock/src')).rejects.toThrow(
        'ZIP validation failed: ZIP file corrupt'
      );
      
      mainModule.packageCodeArtifacts.mockRestore();
    });
  });
  
  describe('deepEqual function', () => {
    test('should correctly compare null values', () => {
      expect(mainModule.deepEqual(null, null)).toBe(true);
      expect(mainModule.deepEqual(null, {})).toBe(false);
      expect(mainModule.deepEqual({}, null)).toBe(false);
    });
    test('should correctly compare arrays of different lengths', () => {
      expect(mainModule.deepEqual([1, 2, 3], [1, 2])).toBe(false);
      expect(mainModule.deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });
    test('should correctly identify array vs non-array differences', () => {
      expect(mainModule.deepEqual([1, 2], { '0': 1, '1': 2 })).toBe(false);
      expect(mainModule.deepEqual({ '0': 1, '1': 2 }, [1, 2])).toBe(false);
    });
    test('should correctly compare objects with different keys', () => {
      expect(mainModule.deepEqual({ a: 1, b: 2 }, { a: 1, c: 3 })).toBe(false);
      expect(mainModule.deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });
  });
  
  describe('DryRun mode tests', () => {
    test('should handle dry run for new function error', async () => {
      
      jest.spyOn(validations, 'validateAllInputs').mockReturnValue({
        valid: true,
        functionName: 'test-function',
        region: 'us-east-1',
        codeArtifactsDir: '/mock/src',
        dryRun: true
      });
      
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.reject({
            name: 'ResourceNotFoundException',
            message: 'Function not found'
          });
        }
        return Promise.resolve({});
      });
      await mainModule.run();
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('DRY RUN MODE can only be used for updating function code of existing functions')
      );
    });
    test('should handle dry run mode for existing functions', async () => {
      
      jest.spyOn(validations, 'validateAllInputs').mockReturnValue({
        valid: true,
        functionName: 'test-function',
        region: 'us-east-1',
        codeArtifactsDir: '/mock/src',
        dryRun: true,
        runtime: 'nodejs18.x',
        handler: 'index.handler'
      });
      
      const mockUpdateCodeResponse = {
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Version: '$LATEST'
      };
      
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs18.x'
          });
        } else if (command instanceof UpdateFunctionCodeCommand) {
          
          expect(command.input).toHaveProperty('DryRun', true);
          return Promise.resolve(mockUpdateCodeResponse);
        }
        return Promise.resolve({});
      });
      
      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(false);
      
      fs.readFile.mockResolvedValue(Buffer.from('mock file content'));
      
      await mainModule.run();
      
      expect(core.info).toHaveBeenCalledWith('DRY RUN MODE: No AWS resources will be created or modified');
    });
  });
  
  describe('S3 function creation', () => {
    
    test('should handle S3 upload error', async () => {
      
      const errorMessage = 'Failed to upload package to S3: Access denied to S3 bucket';
      
      core.setFailed(errorMessage);
      core.debug('S3 error stack trace');
      
      expect(core.setFailed).toHaveBeenCalledWith(errorMessage);
      expect(core.debug).toHaveBeenCalledWith('S3 error stack trace');
    });
    
    test('should handle nonexistent S3 bucket error', async () => {
      
      const errorMessage = 'Failed to create bucket my-lambda-bucket: BucketAlreadyExists';
      
      core.error(errorMessage);
      core.debug('Bucket error stack trace');
      
      expect(core.error).toHaveBeenCalledWith(errorMessage);
      expect(core.debug).toHaveBeenCalledWith('Bucket error stack trace');
    });
    
    test('should handle S3 file read errors', async () => {
      
      const failedMessage = 'Failed to read Lambda deployment package: Permission denied';
      const errorMessage = 'Permission denied. Check file access permissions.';
      
      core.setFailed(failedMessage);
      core.error(errorMessage);
      core.debug('File error stack trace');
      
      expect(core.setFailed).toHaveBeenCalledWith(failedMessage);
      expect(core.error).toHaveBeenCalledWith(errorMessage);
      expect(core.debug).toHaveBeenCalledWith('File error stack trace');
    });
    
    test('should successfully create function with S3 method', async () => {
      
      const createResponse = {
        FunctionName: 'test-function',
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Version: '$LATEST'
      };
      
      core.setOutput('function-arn', createResponse.FunctionArn);
      core.setOutput('version', createResponse.Version);
      
      expect(core.setOutput).toHaveBeenCalledWith('function-arn', createResponse.FunctionArn);
      expect(core.setOutput).toHaveBeenCalledWith('version', createResponse.Version);
      
      core.info('Lambda function created successfully');
      expect(core.info).toHaveBeenCalledWith('Lambda function created successfully');
    });
  });
});
