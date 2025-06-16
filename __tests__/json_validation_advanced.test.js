const core = require('@actions/core');
const validations = require('../validations');

// Mock the core module
jest.mock('@actions/core');

describe('JSON Input Validation Advanced Tests', () => {
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

  describe('VPC Configuration Validation', () => {
    it('should validate correct vpc-config JSON', () => {
      const validVpcConfig = JSON.stringify({
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123', 'sg-456']
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'vpc-config') return validVpcConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedVpcConfig).toEqual({
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123', 'sg-456']
      });
    });
    
    it('should reject vpc-config without SubnetIds', () => {
      const invalidVpcConfig = JSON.stringify({
        SecurityGroupIds: ['sg-123', 'sg-456']
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'vpc-config') return invalidVpcConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("vpc-config must include 'SubnetIds'")
      );
    });
    
    it('should reject vpc-config with non-array SubnetIds', () => {
      const invalidVpcConfig = JSON.stringify({
        SubnetIds: 'subnet-123',
        SecurityGroupIds: ['sg-123', 'sg-456']
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'vpc-config') return invalidVpcConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("vpc-config must include 'SubnetIds' as an array")
      );
    });
    
    it('should reject vpc-config without SecurityGroupIds', () => {
      const invalidVpcConfig = JSON.stringify({
        SubnetIds: ['subnet-123', 'subnet-456']
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'vpc-config') return invalidVpcConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("vpc-config must include 'SecurityGroupIds'")
      );
    });
    
    it('should reject vpc-config with non-array SecurityGroupIds', () => {
      const invalidVpcConfig = JSON.stringify({
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: 'sg-123'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'vpc-config') return invalidVpcConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("vpc-config must include 'SecurityGroupIds' as an array")
      );
    });
  });

  describe('Dead Letter Config Validation', () => {
    it('should validate correct dead-letter-config JSON', () => {
      const validDLQConfig = JSON.stringify({
        TargetArn: 'arn:aws:sqs:us-east-1:123456789012:dlq'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'dead-letter-config') return validDLQConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedDeadLetterConfig).toEqual({
        TargetArn: 'arn:aws:sqs:us-east-1:123456789012:dlq'
      });
    });
    
    it('should reject dead-letter-config without TargetArn', () => {
      const invalidDLQConfig = JSON.stringify({
        OtherProperty: 'some-value'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'dead-letter-config') return invalidDLQConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("dead-letter-config must include 'TargetArn'")
      );
    });
  });

  describe('Tracing Config Validation', () => {
    it('should validate correct tracing-config JSON', () => {
      const validTracingConfig = JSON.stringify({
        Mode: 'Active'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'tracing-config') return validTracingConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedTracingConfig).toEqual({
        Mode: 'Active'
      });
    });
    
    it('should validate PassThrough tracing mode', () => {
      const validTracingConfig = JSON.stringify({
        Mode: 'PassThrough'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'tracing-config') return validTracingConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedTracingConfig).toEqual({
        Mode: 'PassThrough'
      });
    });
    
    it('should reject tracing-config with invalid Mode', () => {
      const invalidTracingConfig = JSON.stringify({
        Mode: 'InvalidMode'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'tracing-config') return invalidTracingConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("tracing-config Mode must be 'Active' or 'PassThrough'")
      );
    });
    
    it('should reject tracing-config without Mode', () => {
      const invalidTracingConfig = JSON.stringify({
        OtherProperty: 'some-value'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'tracing-config') return invalidTracingConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("tracing-config Mode must be 'Active' or 'PassThrough'")
      );
    });
  });

  describe('Layers Validation', () => {
    it('should validate correct layers JSON', () => {
      const validLayers = JSON.stringify([
        'arn:aws:lambda:us-east-1:123456789012:layer:layer1:1',
        'arn:aws:lambda:us-east-1:123456789012:layer:layer2:2'
      ]);
      
      core.getInput.mockImplementation((name) => {
        if (name === 'layers') return validLayers;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedLayers).toEqual([
        'arn:aws:lambda:us-east-1:123456789012:layer:layer1:1',
        'arn:aws:lambda:us-east-1:123456789012:layer:layer2:2'
      ]);
    });
    
    it('should reject layers that is not an array', () => {
      const invalidLayers = JSON.stringify({
        layer: 'arn:aws:lambda:us-east-1:123456789012:layer:layer1:1'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'layers') return invalidLayers;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("layers must be an array of layer ARNs")
      );
    });
  });

  describe('File System Configs Validation', () => {
    it('should validate correct file-system-configs JSON', () => {
      const validFSConfig = JSON.stringify([
        {
          Arn: 'arn:aws:efs:us-east-1:123456789012:access-point/fsap-12345',
          LocalMountPath: '/mnt/efs'
        }
      ]);
      
      core.getInput.mockImplementation((name) => {
        if (name === 'file-system-configs') return validFSConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedFileSystemConfigs).toEqual([
        {
          Arn: 'arn:aws:efs:us-east-1:123456789012:access-point/fsap-12345',
          LocalMountPath: '/mnt/efs'
        }
      ]);
    });
    
    it('should reject file-system-configs that is not an array', () => {
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
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("file-system-configs must be an array")
      );
    });
    
    it('should reject file-system-configs without Arn', () => {
      const invalidFSConfig = JSON.stringify([
        {
          LocalMountPath: '/mnt/efs'
        }
      ]);
      
      core.getInput.mockImplementation((name) => {
        if (name === 'file-system-configs') return invalidFSConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Each file-system-config must include 'Arn' and 'LocalMountPath'")
      );
    });
    
    it('should reject file-system-configs without LocalMountPath', () => {
      const invalidFSConfig = JSON.stringify([
        {
          Arn: 'arn:aws:efs:us-east-1:123456789012:access-point/fsap-12345'
        }
      ]);
      
      core.getInput.mockImplementation((name) => {
        if (name === 'file-system-configs') return invalidFSConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Each file-system-config must include 'Arn' and 'LocalMountPath'")
      );
    });
    
    it('should reject file-system-configs with multiple invalid configs', () => {
      const invalidFSConfig = JSON.stringify([
        {
          Arn: 'arn:aws:efs:us-east-1:123456789012:access-point/fsap-12345',
          LocalMountPath: '/mnt/efs1'
        },
        {
          // Missing Arn
          LocalMountPath: '/mnt/efs2'
        },
        {
          Arn: 'arn:aws:efs:us-east-1:123456789012:access-point/fsap-67890'
          // Missing LocalMountPath
        }
      ]);
      
      core.getInput.mockImplementation((name) => {
        if (name === 'file-system-configs') return invalidFSConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Each file-system-config must include 'Arn' and 'LocalMountPath'")
      );
    });
  });

  describe('SnapStart Configuration Validation', () => {
    it('should validate correct snap-start JSON with PublishedVersions', () => {
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
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedSnapStart).toEqual({
        ApplyOn: 'PublishedVersions'
      });
    });
    
    it('should validate correct snap-start JSON with None', () => {
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
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedSnapStart).toEqual({
        ApplyOn: 'None'
      });
    });
    
    it('should reject snap-start with invalid ApplyOn', () => {
      const invalidSnapStart = JSON.stringify({
        ApplyOn: 'InvalidValue'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'snap-start') return invalidSnapStart;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("snap-start ApplyOn must be 'PublishedVersions' or 'None'")
      );
    });
    
    it('should reject snap-start without ApplyOn', () => {
      const invalidSnapStart = JSON.stringify({
        OtherProperty: 'some-value'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'snap-start') return invalidSnapStart;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("snap-start ApplyOn must be 'PublishedVersions' or 'None'")
      );
    });
  });

  describe('Tags Validation', () => {
    it('should validate correct tags JSON', () => {
      const validTags = JSON.stringify({
        Environment: 'Production',
        Team: 'Engineering',
        Project: 'Lambda Action'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'tags') return validTags;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedTags).toEqual({
        Environment: 'Production',
        Team: 'Engineering',
        Project: 'Lambda Action'
      });
    });
    
    it('should reject tags that is not an object', () => {
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
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("tags must be an object of key-value pairs")
      );
    });
  });

  describe('Environment Variables Validation', () => {
    it('should validate correct environment JSON', () => {
      const validEnv = JSON.stringify({
        NODE_ENV: 'production',
        DEBUG: 'false',
        LOG_LEVEL: 'info'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'environment') return validEnv;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedEnvironment).toEqual({
        NODE_ENV: 'production',
        DEBUG: 'false',
        LOG_LEVEL: 'info'
      });
    });
  });

  describe('Image Config Validation', () => {
    it('should validate correct image-config JSON', () => {
      const validImageConfig = JSON.stringify({
        EntryPoint: ['/app/handler.sh'],
        Command: ['arg1', 'arg2'],
        WorkingDirectory: '/app'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'image-config') return validImageConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedImageConfig).toEqual({
        EntryPoint: ['/app/handler.sh'],
        Command: ['arg1', 'arg2'],
        WorkingDirectory: '/app'
      });
    });
  });

  describe('Logging Config Validation', () => {
    it('should validate correct logging-config JSON', () => {
      const validLoggingConfig = JSON.stringify({
        LogFormat: 'JSON',
        LogGroup: '/aws/lambda/test-function'
      });
      
      core.getInput.mockImplementation((name) => {
        if (name === 'logging-config') return validLoggingConfig;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedLoggingConfig).toEqual({
        LogFormat: 'JSON',
        LogGroup: '/aws/lambda/test-function'
      });
    });
  });

  describe('CodeSigningConfigArn Validation', () => {
    it('should validate correct code signing config ARN format', () => {
      const validArn = 'arn:aws:lambda:us-east-1:123456789012:code-signing-config:abc123';
      
      core.getInput.mockImplementation((name) => {
        if (name === 'code-signing-config-arn') return validArn;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateArnInputs();
      expect(result.valid).toBe(true);
      expect(result.codeSigningConfigArn).toBe(validArn);
    });
    
    it('should reject invalid code signing config ARN formats', () => {
      const invalidArn = 'invalid:arn:format';
      
      core.getInput.mockImplementation((name) => {
        if (name === 'code-signing-config-arn') return invalidArn;
        if (name === 'function-name') return 'test-function';
        if (name === 'region') return 'us-east-1';
        if (name === 'code-artifacts-dir') return './artifacts';
        return '';
      });
      
      const result = validations.validateArnInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid code signing config ARN format')
      );
    });
    
    it('should validate code signing config ARN with partition variants', () => {
      const validArns = [
        'arn:aws:lambda:us-east-1:123456789012:code-signing-config:abc123',
        'arn:aws-cn:lambda:cn-north-1:123456789012:code-signing-config:abc123',
        'arn:aws-us-gov:lambda:us-gov-west-1:123456789012:code-signing-config:abc123'
      ];
      
      for (const arn of validArns) {
        core.getInput.mockImplementation((name) => {
          if (name === 'code-signing-config-arn') return arn;
          if (name === 'function-name') return 'test-function';
          if (name === 'region') return 'us-east-1';
          if (name === 'code-artifacts-dir') return './artifacts';
          return '';
        });
        
        const result = validations.validateArnInputs();
        expect(result.valid).toBe(true);
        expect(result.codeSigningConfigArn).toBe(arn);
      }
    });
  });

  describe('Multiple JSON Inputs Validation', () => {
    it('should validate multiple JSON inputs simultaneously', () => {
      const environment = JSON.stringify({ NODE_ENV: 'production' });
      const vpcConfig = JSON.stringify({ 
        SubnetIds: ['subnet-123'], 
        SecurityGroupIds: ['sg-123'] 
      });
      const deadLetterConfig = JSON.stringify({ 
        TargetArn: 'arn:aws:sqs:us-east-1:123456789012:dlq' 
      });
      
      core.getInput.mockImplementation((name) => {
        switch(name) {
          case 'environment': return environment;
          case 'vpc-config': return vpcConfig;
          case 'dead-letter-config': return deadLetterConfig;
          case 'function-name': return 'test-function';
          case 'region': return 'us-east-1';
          case 'code-artifacts-dir': return './artifacts';
          default: return '';
        }
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(true);
      expect(result.parsedEnvironment).toEqual({ NODE_ENV: 'production' });
      expect(result.parsedVpcConfig).toEqual({ 
        SubnetIds: ['subnet-123'], 
        SecurityGroupIds: ['sg-123'] 
      });
      expect(result.parsedDeadLetterConfig).toEqual({ 
        TargetArn: 'arn:aws:sqs:us-east-1:123456789012:dlq' 
      });
    });
    
    it('should fail validation if any JSON input is invalid', () => {
      const environment = JSON.stringify({ NODE_ENV: 'production' });
      const vpcConfig = '{ malformed json }'; // Invalid JSON
      const deadLetterConfig = JSON.stringify({ 
        TargetArn: 'arn:aws:sqs:us-east-1:123456789012:dlq'
      });
      
      core.getInput.mockImplementation((name) => {
        switch(name) {
          case 'environment': return environment;
          case 'vpc-config': return vpcConfig;
          case 'dead-letter-config': return deadLetterConfig;
          case 'function-name': return 'test-function';
          case 'region': return 'us-east-1';
          case 'code-artifacts-dir': return './artifacts';
          default: return '';
        }
      });
      
      const result = validations.validateJsonInputs();
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON in vpc-config input')
      );
    });
  });
});
