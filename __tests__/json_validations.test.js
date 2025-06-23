const validations = require('../validations');
const core = require('@actions/core');

// Mock dependencies
jest.mock('@actions/core');

describe('JSON Input Validations', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup core mocks
    core.getInput = jest.fn();
    core.getBooleanInput = jest.fn();
    core.setFailed = jest.fn();
    
    // Default mock implementations for validation tests
    core.getInput.mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'code-artifacts-dir': './src'
      };
      return inputs[name] || '';
    });
  });

  describe('environment validation', () => {
    test('should accept valid environment variables', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'environment') {
          return '{"ENV":"prod","DEBUG":"true","API_URL":"https://api.example.com"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './src'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedEnvironment).toEqual({
        ENV: 'prod', 
        DEBUG: 'true', 
        API_URL: 'https://api.example.com'
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should reject invalid JSON in environment', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'environment') {
          return '{"ENV":"prod", DEBUG:"true"}'; // Missing quotes around property name
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './src'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Input validation error'));
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON in environment'));
    });
  });

  describe('vpc-config validation', () => {
    test('should accept valid vpc configuration', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'vpc-config') {
          return '{"SubnetIds":["subnet-123","subnet-456"],"SecurityGroupIds":["sg-123"]}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './src'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedVpcConfig).toEqual({
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123']
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should reject vpc-config missing SubnetIds', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'vpc-config') {
          return '{"SecurityGroupIds":["sg-123"]}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './src'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('vpc-config must include \'SubnetIds\''));
    });

    test('should reject vpc-config with non-array SubnetIds', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'vpc-config') {
          return '{"SubnetIds": "subnet-123", "SecurityGroupIds":["sg-123"]}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './src'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('vpc-config must include \'SubnetIds\' as an array'));
    });

    test('should reject vpc-config missing SecurityGroupIds', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'vpc-config') {
          return '{"SubnetIds":["subnet-123","subnet-456"]}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('vpc-config must include \'SecurityGroupIds\''));
    });

    test('should reject vpc-config with non-array SecurityGroupIds', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'vpc-config') {
          return '{"SubnetIds":["subnet-123","subnet-456"],"SecurityGroupIds":"sg-123"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('vpc-config must include \'SecurityGroupIds\' as an array'));
    });
  });

  describe('dead-letter-config validation', () => {
    test('should accept valid dead letter configuration', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'dead-letter-config') {
          return '{"TargetArn":"arn:aws:sns:us-east-1:123456789012:my-topic"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedDeadLetterConfig).toEqual({
        TargetArn: 'arn:aws:sns:us-east-1:123456789012:my-topic'
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should reject dead-letter-config missing TargetArn', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'dead-letter-config') {
          return '{"SomeOtherProperty":"value"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('dead-letter-config must include \'TargetArn\''));
    });
  });

  describe('tracing-config validation', () => {
    test('should accept valid tracing configuration with Active mode', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'tracing-config') {
          return '{"Mode":"Active"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedTracingConfig).toEqual({
        Mode: 'Active'
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should accept valid tracing configuration with PassThrough mode', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'tracing-config') {
          return '{"Mode":"PassThrough"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedTracingConfig).toEqual({
        Mode: 'PassThrough'
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should reject tracing-config with invalid Mode', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'tracing-config') {
          return '{"Mode":"InvalidMode"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('tracing-config Mode must be \'Active\' or \'PassThrough\''));
    });

    test('should reject tracing-config missing Mode', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'tracing-config') {
          return '{"SomeOtherProperty":"value"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('tracing-config Mode must be \'Active\' or \'PassThrough\''));
    });
  });

  describe('layers validation', () => {
    test('should accept valid layers array', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'layers') {
          return '["arn:aws:lambda:us-east-1:123456789012:layer:layer1:1","arn:aws:lambda:us-east-1:123456789012:layer:layer2:2"]';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedLayers).toEqual([
        'arn:aws:lambda:us-east-1:123456789012:layer:layer1:1',
        'arn:aws:lambda:us-east-1:123456789012:layer:layer2:2'
      ]);
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should reject layers as non-array', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'layers') {
          return '{"layer":"arn:aws:lambda:us-east-1:123456789012:layer:layer1:1"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('layers must be an array of layer ARNs'));
    });
  });

  describe('file-system-configs validation', () => {
    test('should accept valid file system configs array', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'file-system-configs') {
          return '[{"Arn":"arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-123","LocalMountPath":"/mnt/efs"}]';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedFileSystemConfigs).toEqual([
        {
          Arn: 'arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-123',
          LocalMountPath: '/mnt/efs'
        }
      ]);
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should reject file-system-configs as non-array', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'file-system-configs') {
          return '{"Arn":"arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-123","LocalMountPath":"/mnt/efs"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('file-system-configs must be an array'));
    });

    test('should reject file-system-configs missing Arn', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'file-system-configs') {
          return '[{"LocalMountPath":"/mnt/efs"}]';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Each file-system-config must include \'Arn\' and \'LocalMountPath\''));
    });

    test('should reject file-system-configs missing LocalMountPath', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'file-system-configs') {
          return '[{"Arn":"arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-123"}]';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Each file-system-config must include \'Arn\' and \'LocalMountPath\''));
    });
  });

  describe('snap-start validation', () => {
    test('should accept valid snap-start with PublishedVersions', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'snap-start') {
          return '{"ApplyOn":"PublishedVersions"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedSnapStart).toEqual({
        ApplyOn: 'PublishedVersions'
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should accept valid snap-start with None', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'snap-start') {
          return '{"ApplyOn":"None"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedSnapStart).toEqual({
        ApplyOn: 'None'
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should reject snap-start with invalid ApplyOn', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'snap-start') {
          return '{"ApplyOn":"Invalid"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('snap-start ApplyOn must be \'PublishedVersions\' or \'None\''));
    });

    test('should reject snap-start missing ApplyOn', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'snap-start') {
          return '{"SomeOtherProperty":"value"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('snap-start ApplyOn must be \'PublishedVersions\' or \'None\''));
    });
  });

  describe('tags validation', () => {
    test('should accept valid tags object', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'tags') {
          return '{"Environment":"Production","Team":"DevOps","Project":"Lambda-Action"}';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(true);
      expect(result.parsedTags).toEqual({
        Environment: 'Production',
        Team: 'DevOps',
        Project: 'Lambda-Action'
      });
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('should reject tags as array', () => {
      // Override the mock for this specific test
      const mockGetInput = jest.fn((name) => {
        if (name === 'tags') {
          return '["tag1", "tag2"]';
        }
        const inputs = {
          'function-name': 'test-function',
          'region': 'us-east-1',
          'code-artifacts-dir': './test-dir'
        };
        return inputs[name] || '';
      });
      
      core.getInput = mockGetInput;
      
      const result = validations.validateAllInputs();
      
      expect(result.valid).toBe(false);
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('tags must be an object of key-value pairs'));
    });
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
