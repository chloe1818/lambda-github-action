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
});
