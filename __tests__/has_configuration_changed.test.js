const { hasConfigurationChanged } = require('../index');
const core = require('@actions/core');

// Mock dependencies
jest.mock('@actions/core');

describe('hasConfigurationChanged function', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    core.info = jest.fn();
  });

  test('should return true when current config is empty/null', async () => {
    const result = await hasConfigurationChanged(null, { Runtime: 'nodejs18.x' });
    expect(result).toBe(true);

    const emptyResult = await hasConfigurationChanged({}, { Runtime: 'nodejs18.x' });
    expect(emptyResult).toBe(true);
  });

  test('should return false when configurations are identical', async () => {
    const current = {
      Runtime: 'nodejs18.x',
      MemorySize: 256,
      Timeout: 30
    };
    
    const updated = {
      Runtime: 'nodejs18.x',
      MemorySize: 256,
      Timeout: 30
    };
    
    const result = await hasConfigurationChanged(current, updated);
    expect(result).toBe(false);
    expect(core.info).not.toHaveBeenCalled();
  });

  test('should return true when string values differ', async () => {
    const current = {
      Runtime: 'nodejs16.x',
      Handler: 'index.handler'
    };
    
    const updated = {
      Runtime: 'nodejs18.x',
      Handler: 'index.handler'
    };
    
    const result = await hasConfigurationChanged(current, updated);
    expect(result).toBe(true);
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in Runtime'));
  });

  test('should return true when numeric values differ', async () => {
    const current = {
      MemorySize: 128,
      Timeout: 30
    };
    
    const updated = {
      MemorySize: 256,
      Timeout: 30
    };
    
    const result = await hasConfigurationChanged(current, updated);
    expect(result).toBe(true);
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in MemorySize'));
  });

  test('should return true when object values differ', async () => {
    const current = {
      Environment: {
        Variables: {
          ENV: 'dev',
          DEBUG: 'false'
        }
      }
    };
    
    const updated = {
      Environment: {
        Variables: {
          ENV: 'prod',
          DEBUG: 'false'
        }
      }
    };
    
    const result = await hasConfigurationChanged(current, updated);
    expect(result).toBe(true);
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in Environment'));
  });

  test('should return true when array values differ', async () => {
    const current = {
      Layers: ['arn:aws:lambda:us-east-1:123456789012:layer:layer1:1']
    };
    
    const updated = {
      Layers: [
        'arn:aws:lambda:us-east-1:123456789012:layer:layer1:1',
        'arn:aws:lambda:us-east-1:123456789012:layer:layer2:1'
      ]
    };
    
    const result = await hasConfigurationChanged(current, updated);
    expect(result).toBe(true);
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in Layers'));
  });

  test('should ignore undefined or null values in updated config', async () => {
    const current = {
      Runtime: 'nodejs18.x',
      MemorySize: 256,
      Timeout: 30
    };
    
    const updated = {
      Runtime: 'nodejs18.x',
      MemorySize: undefined,
      Timeout: null,
      Handler: 'index.handler' // New value that should trigger change
    };
    
    const result = await hasConfigurationChanged(current, updated);
    expect(result).toBe(true);
    // Only Handler should be detected as a change
    expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in MemorySize'));
    expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in Timeout'));
  });

  test('should handle complex nested objects', async () => {
    const current = {
      VpcConfig: {
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123']
      },
      Environment: {
        Variables: {
          ENV: 'dev',
          REGION: 'us-east-1',
          DEBUG: 'true'
        }
      }
    };
    
    const updated = {
      VpcConfig: {
        SubnetIds: ['subnet-123', 'subnet-456'],
        SecurityGroupIds: ['sg-123', 'sg-456'] // Added a security group
      },
      Environment: {
        Variables: {
          ENV: 'dev',
          REGION: 'us-east-1',
          DEBUG: 'true'
        }
      }
    };
    
    const result = await hasConfigurationChanged(current, updated);
    expect(result).toBe(true);
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Configuration difference detected in VpcConfig'));
  });

  test('should return false when no meaningful changes exist', async () => {
    const current = {
      Runtime: 'nodejs18.x',
      MemorySize: 256,
      Environment: {
        Variables: {
          ENV: 'production'
        }
      }
    };
    
    const updated = {
      // Only providing a subset of fields shouldn't trigger an update
      // if those fields match the current config
      Runtime: 'nodejs18.x',
      MemorySize: 256,
      Environment: {
        Variables: {
          ENV: 'production'
        }
      },
      // These undefined/null values should be ignored
      NewField1: undefined,
      NewField2: null
    };
    
    const result = await hasConfigurationChanged(current, updated);
    expect(result).toBe(false);
  });
});
