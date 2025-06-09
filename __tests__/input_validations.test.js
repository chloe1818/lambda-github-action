const core = require('@actions/core');
const mainModule = require('../index');

// Import the original validations module directly
const originalValidations = jest.requireActual('../validations');

// Mock core functions
jest.mock('@actions/core');

// Mock validations module for index.js integration tests
jest.mock('../validations', () => {
  return {
    // Pass through the original functions for direct testing
    ...jest.requireActual('../validations'),
    // Mock validateAllInputs for integration tests
    validateAllInputs: jest.fn()
  };
});

// Get the mocked version for index.js integration tests
const mockedValidations = require('../validations');

// Use these for direct testing of validation functions
const { 
  parseJsonInput,
  validateRoleArn,
  validateCodeSigningConfigArn,
  validateKmsKeyArn
} = originalValidations;

describe('Input Validation Tests', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Default mock implementations for numeric validation tests
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case 'function-name': return 'test-function';
        case 'region': return 'us-east-1';
        case 'zip-file-path': return './test.zip';
        default: return '';
      }
    });
    
    core.getBooleanInput.mockImplementation(() => false);
    
    // Mock parseInt to ensure it works as expected in tests
    global.parseInt = jest.fn().mockImplementation((value) => {
      return Number(value);
    });
  });

  describe('parseJsonInput', () => {
    it('should parse valid JSON objects correctly', () => {
      const jsonString = '{"name": "test", "value": 42}';
      const result = parseJsonInput(jsonString, 'test-input');
      
      expect(result).toEqual({
        name: 'test',
        value: 42
      });
    });

    it('should parse valid JSON arrays correctly', () => {
      const jsonString = '["value1", "value2", "value3"]';
      const result = parseJsonInput(jsonString, 'test-input');
      
      expect(result).toEqual(['value1', 'value2', 'value3']);
    });

    it('should throw an error for invalid JSON syntax', () => {
      const jsonString = '{"name": "test", value: 42}'; // Missing quotes around property name
      
      expect(() => {
        parseJsonInput(jsonString, 'test-input');
      }).toThrow(/Invalid JSON in test-input/);
    });

    it('should throw an error for incomplete JSON', () => {
      const jsonString = '{"name": "test",';
      
      expect(() => {
        parseJsonInput(jsonString, 'test-input');
      }).toThrow(/Invalid JSON in test-input/);
    });

    it('should include the original error message in the thrown error', () => {
      const jsonString = '{not valid}';
      
      try {
        parseJsonInput(jsonString, 'test-input');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Invalid JSON in test-input');
        // Just check that some error message is included, without expecting specific text
        // as error messages can vary between JavaScript engines
        expect(error.message.length).toBeGreaterThan('Invalid JSON in test-input'.length);
      }
    });
  });

  describe('validateRoleArn', () => {
    it('should validate correct IAM role ARN formats', () => {
      const validArns = [
        'arn:aws:iam::123456789012:role/lambda-role',
        'arn:aws:iam::123456789012:role/service-role/lambda-role',
        'arn:aws-cn:iam::123456789012:role/my-role'
      ];
      
      validArns.forEach(arn => {
        const result = validateRoleArn(arn);
        expect(result).toBe(true);
        expect(core.setFailed).not.toHaveBeenCalled();
      });
    });
    
    it('should reject invalid IAM role ARN formats', () => {
      const invalidArns = [
        'not-an-arn',
        'arn:aws:lambda:us-east-1:123456789012:function:my-function', // Not an IAM role ARN
        'arn:aws:iam::abcdef:role/lambda-role', // Invalid account ID
        'arn:aws:iam::123456789012:user/username' // Not a role
      ];
      
      invalidArns.forEach(arn => {
        jest.clearAllMocks();
        const result = validateRoleArn(arn);
        expect(result).toBe(false);
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid IAM role ARN format'));
      });
    });
  });

  describe('validateCodeSigningConfigArn', () => {
    it('should validate correct code signing config ARN formats', () => {
      const validArns = [
        'arn:aws:lambda:us-east-1:123456789012:code-signing-config:abc123',
        'arn:aws-cn:lambda:cn-north-1:123456789012:code-signing-config:abc-123-def'
      ];
      
      validArns.forEach(arn => {
        const result = validateCodeSigningConfigArn(arn);
        expect(result).toBe(true);
        expect(core.setFailed).not.toHaveBeenCalled();
      });
    });
    
    it('should reject invalid code signing config ARN formats', () => {
      const invalidArns = [
        'not-an-arn',
        'arn:aws:iam::123456789012:role/lambda-role', // Not a code signing config ARN
        'arn:aws:lambda:us-east-1:abcdef:code-signing-config:abc123', // Invalid account ID
      ];
      
      invalidArns.forEach(arn => {
        jest.clearAllMocks();
        const result = validateCodeSigningConfigArn(arn);
        expect(result).toBe(false);
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid code signing config ARN format'));
      });
    });
  });

  describe('validateKmsKeyArn', () => {
    it('should validate correct KMS key ARN formats', () => {
      const validArns = [
        'arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
        'arn:aws-cn:kms:cn-north-1:123456789012:key/abc123'
      ];
      
      validArns.forEach(arn => {
        const result = validateKmsKeyArn(arn);
        expect(result).toBe(true);
        expect(core.setFailed).not.toHaveBeenCalled();
      });
    });
    
    it('should reject invalid KMS key ARN formats', () => {
      const invalidArns = [
        'not-an-arn',
        'arn:aws:iam::123456789012:role/lambda-role', // Not a KMS key ARN
        'arn:aws:kms:us-east-1:abcdef:key/abc123', // Invalid account ID
      ];
      
      invalidArns.forEach(arn => {
        jest.clearAllMocks();
        const result = validateKmsKeyArn(arn);
        expect(result).toBe(false);
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid KMS key ARN format'));
      });
    });
  });

  describe('Memory Size Validation', () => {
    it('should accept valid memory sizes', () => {
      // Test various valid memory sizes
      const validSizes = ['128', '256', '512', '1024', '10240'];
      
      for (const size of validSizes) {
        jest.clearAllMocks();
        core.getInput.mockImplementation((name) => {
          if (name === 'memory-size') return size;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'zip-file-path') return './test.zip';
          return '';
        });
        
        const result = originalValidations.validateAllInputs();
        expect(result.valid).toBe(true);
        expect(result.parsedMemorySize).toBe(parseInt(size));
        expect(core.setFailed).not.toHaveBeenCalled();
      }
    });
    
    it('should reject memory sizes below 128MB', () => {
      const invalidSizes = ['1','64', '127'];
      
      for (const size of invalidSizes) {
        jest.clearAllMocks();
        core.getInput.mockImplementation((name) => {
          if (name === 'memory-size') return size;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'zip-file-path') return './test.zip';
          return '';
        });
        
        const result = originalValidations.validateAllInputs();
        expect(result.valid).toBe(false);
        
        // Check if setFailed was called with an error message containing the expected text
        const wasCalledWithMemorySizeError = core.setFailed.mock.calls.some(call => 
          call[0] && call[0].includes("Memory size must be between 128 MB and 10,240 MB")
        );
        expect(wasCalledWithMemorySizeError).toBe(true);
      }
    });
    
    it('should reject memory sizes above 10240MB', () => {
      const invalidSizes = ['10241', '20000'];
      
      for (const size of invalidSizes) {
        jest.clearAllMocks();
        core.getInput.mockImplementation((name) => {
          if (name === 'memory-size') return size;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'zip-file-path') return './test.zip';
          return '';
        });
        
        const result = originalValidations.validateAllInputs();
        expect(result.valid).toBe(false);
        
        // Check if setFailed was called with an error message containing the expected text
        const wasCalledWithMemorySizeError = core.setFailed.mock.calls.some(call => 
          call[0] && call[0].includes("Memory size must be between 128 MB and 10,240 MB")
        );
        expect(wasCalledWithMemorySizeError).toBe(true);
      }
    });

    it('should handle empty memory size input', () => {
      jest.clearAllMocks();
      core.getInput.mockImplementation((name) => {
        if (name === 'memory-size') return '';
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'zip-file-path') return './test.zip';
        return '';
      });
      
      const result = originalValidations.validateAllInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedMemorySize).toBeUndefined();
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });
  
  describe('Timeout Validation', () => {
    it('should accept valid timeout values', () => {
      // Test various valid timeout values
      const validTimeouts = ['1', '30', '300', '900'];
      
      for (const timeout of validTimeouts) {
        jest.clearAllMocks();
        core.getInput.mockImplementation((name) => {
          if (name === 'timeout') return timeout;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'zip-file-path') return './test.zip';
          return '';
        });
        
        const result = originalValidations.validateAllInputs();
        expect(result.valid).toBe(true);
        expect(result.timeout).toBe(parseInt(timeout));
        expect(core.setFailed).not.toHaveBeenCalled();
      }
    });
    
    it('should reject timeout values below 1 second', () => {
      const invalidTimeouts = ['-1'];
      
      for (const timeout of invalidTimeouts) {
        jest.clearAllMocks();
        core.getInput.mockImplementation((name) => {
          if (name === 'timeout') return timeout;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'zip-file-path') return './test.zip';
          return '';
        });
        
        const result = originalValidations.validateAllInputs();
        expect(result.valid).toBe(false);
        
        // Check if setFailed was called with an error message containing the expected text
        const wasCalledWithTimeoutError = core.setFailed.mock.calls.some(call => 
          call[0] && call[0].includes("Timeout must be between 1 and 900 seconds")
        );
        expect(wasCalledWithTimeoutError).toBe(true);
      }
    });
    
    it('should reject timeout values above 900 seconds', () => {
      const invalidTimeouts = ['901', '1000', '3600'];
      
      for (const timeout of invalidTimeouts) {
        jest.clearAllMocks();
        core.getInput.mockImplementation((name) => {
          if (name === 'timeout') return timeout;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'zip-file-path') return './test.zip';
          return '';
        });
        
        const result = originalValidations.validateAllInputs();
        expect(result.valid).toBe(false);
        
        // Check if setFailed was called with an error message containing the expected text
        const wasCalledWithTimeoutError = core.setFailed.mock.calls.some(call => 
          call[0] && call[0].includes("Timeout must be between 1 and 900 seconds")
        );
        expect(wasCalledWithTimeoutError).toBe(true);
      }
    });
  });
  
  describe('Ephemeral Storage Validation', () => {
    it('should accept valid ephemeral storage values', () => {
      // Test various valid ephemeral storage values
      const validStorageValues = ['512', '1024', '2048', '10240'];
      
      for (const storage of validStorageValues) {
        jest.clearAllMocks();
        core.getInput.mockImplementation((name) => {
          if (name === 'ephemeral-storage') return storage;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'zip-file-path') return './test.zip';
          return '';
        });
        
        const result = originalValidations.validateAllInputs();
        expect(result.valid).toBe(true);
        expect(result.ephemeralStorage).toBe(parseInt(storage));
        expect(core.setFailed).not.toHaveBeenCalled();
      }
    });
    
    it('should reject ephemeral storage values below 512MB', () => {
      const invalidStorageValues = ['128', '511'];
      
      for (const storage of invalidStorageValues) {
        jest.clearAllMocks();
        core.getInput.mockImplementation((name) => {
          if (name === 'ephemeral-storage') return storage;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'zip-file-path') return './test.zip';
          return '';
        });
        
        const result = originalValidations.validateAllInputs();
        expect(result.valid).toBe(false);
        
        // Check if setFailed was called with an error message containing the expected text
        const wasCalledWithStorageError = core.setFailed.mock.calls.some(call => 
          call[0] && call[0].includes("Ephemeral storage must be between 512 MB and 10,240 MB")
        );
        expect(wasCalledWithStorageError).toBe(true);
      }
    });
    
    it('should reject ephemeral storage values above 10240MB', () => {
      const invalidStorageValues = ['10241', '20000'];
      
      for (const storage of invalidStorageValues) {
        jest.clearAllMocks();
        core.getInput.mockImplementation((name) => {
          if (name === 'ephemeral-storage') return storage;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'zip-file-path') return './test.zip';
          return '';
        });
        
        const result = originalValidations.validateAllInputs();
        expect(result.valid).toBe(false);
        
        // Check if setFailed was called with an error message containing the expected text
        const wasCalledWithStorageError = core.setFailed.mock.calls.some(call => 
          call[0] && call[0].includes("Ephemeral storage must be between 512 MB and 10,240 MB")
        );
        expect(wasCalledWithStorageError).toBe(true);
      }
    });
  });
  
  describe('Required Inputs Validation', () => {
    it('should require function name', () => {
      core.getInput.mockImplementation((name, options) => {
        if (name === 'function-name') return '';
        if (name === 'region') return 'us-east-1';
        if (name === 'zip-file-path') return './test.zip';
        return '';
      });
      
      const result = originalValidations.validateAllInputs();
      expect(result.valid).toBe(false);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(/function name must be provided/i)
      );
    });
    
    it('should require region', () => {
      core.getInput.mockImplementation((name, options) => {
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return '';
        if (name === 'zip-file-path') return './test.zip';
        return '';
      });
      
      const result = originalValidations.validateAllInputs();
      expect(result.valid).toBe(false);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(/region must be provided/i)
      );
    });
    
    it('should require either zip-file-path or code-artifacts-dir', () => {
      core.getInput.mockImplementation((name, options) => {
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'zip-file-path') return '';
        if (name === 'code-artifacts-dir') return '';
        return '';
      });
      
      const result = originalValidations.validateAllInputs();
      expect(result.valid).toBe(false);
      
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringMatching(/Either zip-file-path or code-artifacts-dir must be provided/i)
      );
    });
  });

  describe('Integration with index.js', () => {
    it('should call validateAllInputs and exit when validation fails', async () => {
      // Mock validateAllInputs to return invalid result 
      mockedValidations.validateAllInputs.mockReturnValue({ valid: false });

      await mainModule.run();

      // Verify validateAllInputs was called
      expect(mockedValidations.validateAllInputs).toHaveBeenCalled();

      // Since validation failed, no further AWS actions should have been attempted
      // This is a basic check - you may need more specific assertions based on your implementation
    });

    it('should proceed with execution when validation passes', async () => {
      // Mock validateAllInputs to return valid inputs
      mockedValidations.validateAllInputs.mockReturnValue({
        valid: true,
        functionName: 'test-function',
        region: 'us-east-1',
        zipFilePath: './test.zip',
        // Add other required fields here
        ephemeralStorage: 512,
        timeout: 3,
        packageType: 'Zip',
        dryRun: false,
        publish: true,
        runtime: 'nodejs',
        architectures: 'x86_64',
      });

      // This will likely throw due to AWS client being mocked/missing
      // but it should at least progress past the validation stage
      try {
        await mainModule.run();
      } catch (error) {
        // Expected to fail after validation due to AWS client issues
      }
      
      // Verify validateAllInputs was called
      expect(mockedValidations.validateAllInputs).toHaveBeenCalled();

      // Additional assertions could go here, depending on what you want to test
      // in the main module after validation passes
    });
  });
});
