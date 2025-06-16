const core = require('@actions/core');
const { 
  LambdaClient, 
  UpdateFunctionConfigurationCommand,
  UpdateFunctionCodeCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  CreateFunctionCommand,
  waitUntilFunctionUpdated
} = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');
const path = require('path');
const mainModule = require('../index');
const validations = require('../validations');

// Mock core
jest.mock('@actions/core');

// Mock Lambda client
jest.mock('@aws-sdk/client-lambda');

// Mock fs/promises
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

// Mock AdmZip
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

// Mock path
jest.mock('path');

describe('Error Handling Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock process.cwd()
    process.cwd = jest.fn().mockReturnValue('/mock/cwd');
    
    // Mock path functions
    path.join.mockImplementation((...parts) => parts.join('/'));
    path.resolve.mockImplementation((...parts) => parts.join('/'));
    path.isAbsolute.mockImplementation((p) => p.startsWith('/'));
    
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
    core.debug.mockImplementation(() => {});
    
    // Mock validations
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
    
    // Mock waitForFunctionUpdated
    jest.spyOn(mainModule, 'waitForFunctionUpdated').mockResolvedValue(undefined);
  });

  describe('AWS Service Error Handling', () => {
    test('should handle ThrottlingException during function creation', async () => {
      // Setup - function doesn't exist
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.reject({
            name: 'ResourceNotFoundException',
            message: 'Function not found'
          });
        } else if (command instanceof CreateFunctionCommand) {
          return Promise.reject({
            name: 'ThrottlingException',
            message: 'Rate exceeded',
            $metadata: { httpStatusCode: 429 }
          });
        }
        return Promise.resolve({});
      });

      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded and maximum retries reached')
      );
    });
    
    test('should handle AccessDeniedException during function creation', async () => {
      // Setup - function doesn't exist
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.reject({
            name: 'ResourceNotFoundException',
            message: 'Function not found'
          });
        } else if (command instanceof CreateFunctionCommand) {
          return Promise.reject({
            name: 'AccessDeniedException',
            message: 'User not authorized',
            $metadata: { httpStatusCode: 403 }
          });
        }
        return Promise.resolve({});
      });

      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Permissions error')
      );
    });
    
    test('should handle ServerErrors during function creation', async () => {
      // Setup - function doesn't exist
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.reject({
            name: 'ResourceNotFoundException',
            message: 'Function not found'
          });
        } else if (command instanceof CreateFunctionCommand) {
          return Promise.reject({
            name: 'InternalServerError',
            message: 'Server error occurred',
            $metadata: { httpStatusCode: 500 }
          });
        }
        return Promise.resolve({});
      });

      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Server error (500)')
      );
    });

    test('should handle general error during function creation', async () => {
      // Setup - function doesn't exist
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.reject({
            name: 'ResourceNotFoundException',
            message: 'Function not found'
          });
        } else if (command instanceof CreateFunctionCommand) {
          return Promise.reject({
            name: 'ValidationError',
            message: 'Bad request parameters',
            stack: 'Mock error stack trace'
          });
        }
        return Promise.resolve({});
      });

      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create function')
      );
      expect(core.debug).toHaveBeenCalledWith('Mock error stack trace');
    });
  });
  
  describe('Configuration Update Error Handling', () => {
    test('should handle ThrottlingException during config update', async () => {
      // Setup - function exists
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs14.x', // Different from what we'll update to
            Role: 'old-role',
            Handler: 'old-handler'
          });
        } else if (command instanceof UpdateFunctionConfigurationCommand) {
          return Promise.reject({
            name: 'ThrottlingException',
            message: 'Rate exceeded',
            $metadata: { httpStatusCode: 429 },
            stack: 'Mock error stack trace'
          });
        }
        return Promise.resolve({});
      });

      // Mock hasConfigurationChanged to return true to trigger update
      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(true);
      
      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded and maximum retries reached')
      );
      expect(core.debug).toHaveBeenCalledWith('Mock error stack trace');
    });
    
    test('should handle AccessDeniedException during config update', async () => {
      // Setup - function exists
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs14.x',
            Role: 'old-role'
          });
        } else if (command instanceof UpdateFunctionConfigurationCommand) {
          return Promise.reject({
            name: 'AccessDeniedException',
            message: 'User not authorized',
            stack: 'Mock error stack trace'
          });
        }
        return Promise.resolve({});
      });

      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(true);
      
      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Permissions error')
      );
    });

    test('should handle server errors during config update', async () => {
      // Setup - function exists
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs14.x'
          });
        } else if (command instanceof UpdateFunctionConfigurationCommand) {
          return Promise.reject({
            name: 'InternalError',
            message: 'Server error',
            $metadata: { httpStatusCode: 500 },
            stack: 'Mock error stack trace'
          });
        }
        return Promise.resolve({});
      });

      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(true);
      
      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Server error (500)')
      );
    });
  });
  
  describe('Function Code Update Error Handling', () => {
    test('should handle file read errors during zip file preparation', async () => {
      // Setup - mocking fs.readFile to fail
      fs.readFile.mockRejectedValueOnce({
        code: 'ENOENT',
        message: 'File not found',
        stack: 'Mock error stack trace'
      });
      
      // Function exists to test code update path
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs18.x',
            Role: 'arn:aws:iam::123456789012:role/lambda-role'
          });
        }
        return Promise.resolve({});
      });
      
      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(false);

      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read Lambda deployment package')
      );
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining('File not found')
      );
    });
    
    test('should handle permission errors when reading zip file', async () => {
      // Setup - mocking fs.readFile to fail with permission error
      fs.readFile.mockRejectedValueOnce({
        code: 'EACCES',
        message: 'Permission denied',
        stack: 'Mock error stack trace'
      });
      
      // Function exists
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs18.x'
          });
        }
        return Promise.resolve({});
      });
      
      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(false);

      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read Lambda deployment package')
      );
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );
    });
    
    test('should handle AWS errors during code update', async () => {
      // Setup - function exists
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs18.x'
          });
        } else if (command instanceof UpdateFunctionCodeCommand) {
          return Promise.reject({
            name: 'ServiceException',
            message: 'Code size too large',
            stack: 'Mock error stack trace'
          });
        }
        return Promise.resolve({});
      });
      
      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(false);

      await mainModule.run();
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update function code')
      );
    });
  });
  
  describe('waitForFunctionUpdated error handling', () => {
    test('should handle timeout during function update wait', async () => {
      // Restore the mock to test the actual implementation
      mainModule.waitForFunctionUpdated.mockRestore();
      
      // Mock waitUntilFunctionUpdated to throw a timeout error
      waitUntilFunctionUpdated.mockRejectedValue({
        name: 'TimeoutError',
        message: 'Timed out waiting for function update'
      });
      
      // Function exists 
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs14.x' // Different to trigger update
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
      // Restore the mock
      mainModule.waitForFunctionUpdated.mockRestore();
      
      // Mock waitUntilFunctionUpdated to throw a not found error
      waitUntilFunctionUpdated.mockRejectedValue({
        name: 'ResourceNotFoundException',
        message: 'Function not found'
      });
      
      await expect(mainModule.waitForFunctionUpdated(new LambdaClient(), 'nonexistent-function')).rejects.toThrow(
        'Function nonexistent-function not found'
      );
    });
    
    test('should handle permission error during function update wait', async () => {
      // Restore the mock
      mainModule.waitForFunctionUpdated.mockRestore();
      
      // Mock waitUntilFunctionUpdated to throw a permission error
      waitUntilFunctionUpdated.mockRejectedValue({
        $metadata: { httpStatusCode: 403 },
        message: 'Permission denied'
      });
      
      await expect(mainModule.waitForFunctionUpdated(new LambdaClient(), 'test-function')).rejects.toThrow(
        'Permission denied while checking function test-function status'
      );
    });
    
    test('should handle general errors during function update wait', async () => {
      // Restore the mock
      mainModule.waitForFunctionUpdated.mockRestore();
      
      // Mock waitUntilFunctionUpdated to throw a general error
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
      // Mock fs.readdir to return empty array
      fs.readdir.mockResolvedValueOnce([]);
      
      await expect(mainModule.packageCodeArtifacts('/empty/dir')).rejects.toThrow(
        'Code artifacts directory \'/empty/dir\' is empty, no files to package'
      );
    });
    
    test('should handle directory access errors', async () => {
      // Mock fs.access to fail
      fs.access.mockRejectedValueOnce(new Error('Directory does not exist'));
      
      await expect(mainModule.packageCodeArtifacts('/invalid/dir')).rejects.toThrow(
        'Code artifacts directory \'/invalid/dir\' does not exist or is not accessible'
      );
    });
    
    test('should handle ZIP validation failures', async () => {
      // Mock AdmZip constructor for verification to throw an error
      const AdmZip = require('adm-zip');
      AdmZip.mockImplementationOnce(() => {
        return {
          addLocalFolder: jest.fn(),
          addLocalFile: jest.fn(),
          writeZip: jest.fn()
        };
      }).mockImplementationOnce(() => {
        throw new Error('ZIP file corrupt');
      });
      
      await expect(mainModule.packageCodeArtifacts('/mock/src')).rejects.toThrow(
        'ZIP validation failed: ZIP file corrupt'
      );
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
      // Set dry run mode
      validations.validateAllInputs.mockReturnValue({
        valid: true,
        functionName: 'test-function',
        region: 'us-east-1',
        codeArtifactsDir: '/mock/src',
        dryRun: true
      });
      
      // Function doesn't exist
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
      // Set dry run mode
      validations.validateAllInputs.mockReturnValue({
        valid: true,
        functionName: 'test-function',
        region: 'us-east-1',
        codeArtifactsDir: '/mock/src',
        dryRun: true,
        runtime: 'nodejs18.x',
        handler: 'index.handler'
      });
      
      // Mock specific response for UpdateFunctionCodeCommand with dry run
      const mockUpdateCodeResponse = {
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Version: '$LATEST'
      };
      
      // Function exists
      LambdaClient.prototype.send = jest.fn().mockImplementation((command) => {
        if (command instanceof GetFunctionConfigurationCommand) {
          return Promise.resolve({
            FunctionName: 'test-function',
            Runtime: 'nodejs18.x'
          });
        } else if (command instanceof UpdateFunctionCodeCommand) {
          // Make sure DryRun is true on the command
          expect(command.input).toHaveProperty('DryRun', true);
          return Promise.resolve(mockUpdateCodeResponse);
        }
        return Promise.resolve({});
      });
      
      // Mock the hasConfigurationChanged function to simplify test
      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(false);
      
      // Mock fs.readFile to return a buffer
      fs.readFile.mockResolvedValue(Buffer.from('mock file content'));
      
      // Execute the run function
      await mainModule.run();
      
      // Just check that the test runs without error and dry run mode was enabled
      expect(core.info).toHaveBeenCalledWith('DRY RUN MODE: No AWS resources will be created or modified');
    });
  });
});
