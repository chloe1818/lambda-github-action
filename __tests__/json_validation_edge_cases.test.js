const core = require('@actions/core');
const validations = require('../validations');

// Get the original validation functions
const originalValidations = jest.requireActual('../validations');

// Mock core
jest.mock('@actions/core');

describe('JSON Input Validation Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case 'function-name': return 'test-function';
        case 'region': return 'us-east-1';
        case 'code-artifacts-dir': return './artifacts';
        default: return '';
      }
    });
    
    core.getBooleanInput.mockImplementation(() => false);
    core.setFailed.mockImplementation(() => {});
  });

  describe('VPC Configuration Edge Cases', () => {
    it('should reject vpc-config with malformed SubnetIds', () => {
      // Setup a malformed VpcConfig with non-array SubnetIds
      const invalidVpcConfig = JSON.stringify({
        SubnetIds: "subnet-123", // String instead of array
        SecurityGroupIds: ['sg-123']
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'vpc-config') return invalidVpcConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("vpc-config must include 'SubnetIds' as an array")
      );
    });
    
    it('should reject vpc-config with empty SecurityGroupIds array', () => {
      // Empty SecurityGroupIds array - this should still be valid as AWS allows it
      const validVpcConfig = JSON.stringify({
        SubnetIds: ['subnet-123'],
        SecurityGroupIds: []
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'vpc-config') return validVpcConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
  });

  describe('Dead Letter Config Validation', () => {
    it('should validate SQS ARN in dead-letter-config', () => {
      const validDLQConfig = JSON.stringify({
        TargetArn: 'arn:aws:sqs:us-east-1:123456789012:my-queue'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'dead-letter-config') return validDLQConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
    
    it('should validate SNS ARN in dead-letter-config', () => {
      const validDLQConfig = JSON.stringify({
        TargetArn: 'arn:aws:sns:us-east-1:123456789012:my-topic'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'dead-letter-config') return validDLQConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid JSON Handling', () => {
    it('should handle invalid JSON format in vpc-config', () => {
      const invalidJson = '{ this is not valid JSON }';
      
      core.getInput.mockImplementation((name) => {
        if (name === 'vpc-config') return invalidJson;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON in vpc-config')
      );
    });
    
    it('should handle invalid JSON format in environment', () => {
      const invalidJson = '{ ENV: production }'; // Missing quotes
      
      core.getInput.mockImplementation((name) => {
        if (name === 'environment') return invalidJson;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON in environment')
      );
    });
  });

  describe('Tracing Config Validation', () => {
    it('should reject invalid tracing mode values', () => {
      const invalidTracingConfig = JSON.stringify({
        Mode: 'Detailed' // Only Active or PassThrough are valid
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'tracing-config') return invalidTracingConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("tracing-config Mode must be 'Active' or 'PassThrough'")
      );
    });
  });
  
  describe('SnapStart Config Validation', () => {
    it('should validate PublishedVersions for snap-start', () => {
      const validSnapStart = JSON.stringify({
        ApplyOn: 'PublishedVersions'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'snap-start') return validSnapStart;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
    
    it('should validate None for snap-start', () => {
      const validSnapStart = JSON.stringify({
        ApplyOn: 'None'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'snap-start') return validSnapStart;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
    
    it('should reject invalid ApplyOn values', () => {
      const invalidSnapStart = JSON.stringify({
        ApplyOn: 'AllVersions' // Invalid value
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'snap-start') return invalidSnapStart;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("snap-start ApplyOn must be 'PublishedVersions' or 'None'")
      );
    });
  });
  
  describe('File System Configs Validation', () => {
    it('should reject non-array file-system-configs', () => {
      const invalidFSConfig = JSON.stringify({
        Arn: 'arn:aws:efs:us-east-1:123456789012:access-point/fsap-12345',
        LocalMountPath: '/mnt/efs'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'file-system-configs') return invalidFSConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("file-system-configs must be an array")
      );
    });
    
    it('should reject file-system-configs with missing Arn', () => {
      const invalidFSConfig = JSON.stringify([
        {
          LocalMountPath: '/mnt/efs'
          // Missing Arn
        }
      ]);
      
      core.getInput.mockImplementation((name) => {
        if (name === 'file-system-configs') return invalidFSConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Each file-system-config must include 'Arn' and 'LocalMountPath'")
      );
    });
    
    it('should validate multiple file system configs', () => {
      const validFSConfig = JSON.stringify([
        {
          Arn: 'arn:aws:efs:us-east-1:123456789012:access-point/fsap-12345',
          LocalMountPath: '/mnt/efs1'
        },
        {
          Arn: 'arn:aws:efs:us-east-1:123456789012:access-point/fsap-67890',
          LocalMountPath: '/mnt/efs2'
        }
      ]);
      
      core.getInput.mockImplementation((name) => {
        if (name === 'file-system-configs') return validFSConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Tags Validation', () => {
    it('should validate complex tag objects', () => {
      const validTags = JSON.stringify({
        Environment: 'Production',
        Project: 'Lambda-Action',
        Team: 'DevOps',
        Cost: 'Center123',
        'Complex Key': 'Value with spaces'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'tags') return validTags;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
    
    it('should reject tag arrays', () => {
      const invalidTags = JSON.stringify([
        { key: 'Environment', value: 'Production' }
      ]);
      
      core.getInput.mockImplementation((name) => {
        if (name === 'tags') return invalidTags;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("tags must be an object of key-value pairs")
      );
    });
  });
  
  describe('ARN Validation', () => {
    it('should validate role ARN format', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'role') return 'arn:aws:iam::123456789012:role/test-role';
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
    
    it('should reject invalid role ARN format', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'role') return 'invalid:arn:format';
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid IAM role ARN format')
      );
    });
    
    it('should validate KMS key ARN format', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'kms-key-arn') return 'arn:aws:kms:us-east-1:123456789012:key/abcdef12-3456-7890-abcd-ef1234567890';
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
    
    it('should reject invalid KMS key ARN format', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'kms-key-arn') return 'invalid:kms:key:arn';
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid KMS key ARN format')
      );
    });
    
    it('should validate code signing config ARN format', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'code-signing-config-arn') return 'arn:aws:lambda:us-east-1:123456789012:code-signing-config:abc123';
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
    });
    
    it('should reject invalid code signing config ARN format', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'code-signing-config-arn') return 'invalid:code:signing:arn';
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid code signing config ARN format')
      );
    });
  });
  
  describe('Multiple Input Validations', () => {
    it('should validate all inputs together', () => {
      core.getInput.mockImplementation((name) => {
        switch(name) {
          case 'function-name': return 'test-function';
          case 'region': return 'us-east-1';
          case 'code-artifacts-dir': return './artifacts';
          case 'role': return 'arn:aws:iam::123456789012:role/test-role';
          case 'runtime': return 'nodejs18.x';
          case 'handler': return 'index.handler';
          case 'memory-size': return '256';
          case 'timeout': return '15';
          case 'ephemeral-storage': return '512';
          case 'environment': return JSON.stringify({ NODE_ENV: 'production' });
          case 'tags': return JSON.stringify({ Environment: 'Production' });
          case 'vpc-config': return JSON.stringify({
            SubnetIds: ['subnet-123', 'subnet-456'],
            SecurityGroupIds: ['sg-123']
          });
          default: return '';
        }
      });
      
      const result = validations.validateAllInputs();
      expect(result.valid).toBe(true);
      expect(result.functionName).toBe('test-function');
      expect(result.region).toBe('us-east-1');
      expect(result.parsedEnvironment).toEqual({ NODE_ENV: 'production' });
      expect(result.parsedVpcConfig).toEqual({
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123']
      });
      expect(result.parsedTags).toEqual({ Environment: 'Production' });
    });
  });
});
