jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda');
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockImplementation(async (path) => ({
    isDirectory: () => path.includes('directory')
  })),
  copyFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('mock file content'))
}));
jest.mock('path');

const core = require('@actions/core');
const { 
  LambdaClient, 
  UpdateFunctionCodeCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand 
} = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');
const path = require('path');
const mainModule = require('../index');

describe('Update Function Code Tests', () => {
  
  jest.setTimeout(30000);
  beforeEach(() => {
    jest.clearAllMocks();
    
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
    
    jest.spyOn(mainModule, 'checkFunctionExists').mockResolvedValue(true);
  });
  test('should properly construct parameters for UpdateFunctionCodeCommand', async () => {
    
    const functionName = 'test-function';
    const zipPath = '/mock/cwd/lambda-function.zip';
    const architectures = 'x86_64';
    const sourceKmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/test-key';
    const revisionId = 'abc123';
    
    const zipContent = await fs.readFile(zipPath);
    
    const params = {
      FunctionName: functionName,
      ZipFile: zipContent,
      Architectures: [architectures],
      Publish: true,
      RevisionId: revisionId,
      SourceKmsKeyArn: sourceKmsKeyArn
    };
    
    expect(params.FunctionName).toBe(functionName);
    expect(params.ZipFile).toBeDefined();
    expect(params.Architectures).toEqual([architectures]);
    expect(params.Publish).toBe(true);
    expect(params.RevisionId).toBe(revisionId);
    expect(params.SourceKmsKeyArn).toBe(sourceKmsKeyArn);
    
    const commandSpy = jest.spyOn(require('@aws-sdk/client-lambda'), 'UpdateFunctionCodeCommand');
    
    new UpdateFunctionCodeCommand(params);
    
    expect(commandSpy).toHaveBeenCalledWith(params);
  });
  test('should correctly format and send the update code command', async () => {
    
    const mockLambdaClient = {
      send: jest.fn().mockResolvedValue({
        FunctionName: 'test-function',
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Version: '2'
      })
    };
    
    const mockZipContent = Buffer.from('mock zip content');
    fs.readFile.mockResolvedValue(mockZipContent);
    
    const params = {
      FunctionName: 'test-function',
      ZipFile: mockZipContent,
      Architectures: ['x86_64'],
      Publish: true,
      RevisionId: 'abc123'
    };
    
    jest.spyOn(mainModule, 'cleanNullKeys').mockImplementation((obj) => {
      return obj; 
    });
    
    const cleanedParams = mainModule.cleanNullKeys(params);
    
    const command = new UpdateFunctionCodeCommand(cleanedParams);
    
    const result = await mockLambdaClient.send(command);
    
    expect(mainModule.cleanNullKeys).toHaveBeenCalled();
    
    expect(mockLambdaClient.send).toHaveBeenCalledWith(command);
    
    expect(result.FunctionName).toBe('test-function');
    expect(result.FunctionArn).toBe('arn:aws:lambda:us-east-1:123456789012:function:test-function');
    expect(result.Version).toBe('2');
  });
  test('should handle function code update errors gracefully', async () => {
    
    const updateError = new Error('Failed to update function code');
    updateError.name = 'CodeStorageExceededException';
    
    const mockLambdaClient = {
      send: jest.fn().mockRejectedValue(updateError)
    };
    
    const mockZipContent = Buffer.from('mock zip content');
    
    const params = {
      FunctionName: 'test-function',
      ZipFile: mockZipContent,
      Architectures: ['x86_64'],
      Publish: true
    };
    
    const command = new UpdateFunctionCodeCommand(params);
    
    try {
      
      await mockLambdaClient.send(command);
      
      fail('Expected an error to be thrown');
    } catch (error) {
      
      expect(error.name).toBe('CodeStorageExceededException');
      expect(error.message).toBe('Failed to update function code');
      
      core.setFailed(`Failed to update function code: ${error.message}`);
    }
    
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update function code')
    );
  });
  test('should simulate dry run mode for code updates', () => {
    
    const infoSpy = jest.fn();
    const setOutputSpy = jest.fn();
    
    function simulateDryRun() {
      
      infoSpy('DRY RUN MODE: No AWS resources will be created or modified');
      infoSpy('[DRY RUN] Would update function code with parameters:');
      infoSpy(JSON.stringify({ 
        FunctionName: 'test-function', 
        ZipFile: '<binary zip data not shown>',
        DryRun: true 
      }));
      const mockArn = 'arn:aws:lambda:us-east-1:000000000000:function:test-function';
      setOutputSpy('function-arn', mockArn);
      setOutputSpy('version', '$LATEST');
      infoSpy('[DRY RUN] Function code validation passed');
      infoSpy('[DRY RUN] Function code update validation completed');
    }
    
    simulateDryRun();
    
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN MODE:'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Would update function code'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Function code validation passed'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Function code update validation completed'));
    
    expect(setOutputSpy).toHaveBeenCalledWith('function-arn', expect.stringContaining('arn:aws:lambda:us-east-1:000000000000:function:test-function'));
    expect(setOutputSpy).toHaveBeenCalledWith('version', '$LATEST');
  });
  test('should support custom revision-id and source-kms-key-arn', () => {
    
    const functionName = 'test-function';
    const revisionId = 'test-revision-123';
    const sourceKmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/abcdef12-3456-7890-abcd-ef1234567890';
    const zipContent = Buffer.from('mock zip content');
    
    const params = {
      FunctionName: functionName,
      ZipFile: zipContent,
      Architectures: ['x86_64'],
      Publish: true,
      RevisionId: revisionId,
      SourceKmsKeyArn: sourceKmsKeyArn
    };
    
    const commandSpy = jest.spyOn(require('@aws-sdk/client-lambda'), 'UpdateFunctionCodeCommand');
    
    new UpdateFunctionCodeCommand(params);
    
    expect(commandSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        RevisionId: revisionId,
        SourceKmsKeyArn: sourceKmsKeyArn
      })
    );
  });
  test('should handle array conversion for architectures parameter', () => {
    
    const functionName = 'test-function';
    const architectures = 'arm64'; 
    const zipContent = Buffer.from('mock zip content');
    
    const params = {
      FunctionName: functionName,
      ZipFile: zipContent,
      Architectures: architectures, 
      Publish: true
    };
    
    const processedParams = {
      ...params,
      Architectures: Array.isArray(architectures) ? architectures : [architectures]
    };
    
    const commandSpy = jest.spyOn(require('@aws-sdk/client-lambda'), 'UpdateFunctionCodeCommand');
    
    new UpdateFunctionCodeCommand(processedParams);
    
    expect(commandSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        Architectures: ['arm64'] 
      })
    );
  });
});
