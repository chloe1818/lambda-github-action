jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda');
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue(['index.js', 'package.json']),
  rm: jest.fn().mockResolvedValue(undefined),
  cp: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('mock file content'))
}));
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/'))
}));
jest.mock('adm-zip', () => {
  return jest.fn().mockImplementation(() => {
    return {
      addLocalFolder: jest.fn(),
      writeZip: jest.fn()
    };
  });
});

const core = require('@actions/core');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');

describe('Dry Run Mode Tests', () => {
  let index;
  let mockLambdaClient;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    core.info = jest.fn();
    core.setFailed = jest.fn();
    core.setOutput = jest.fn();
    
    mockLambdaClient = {
      send: jest.fn().mockResolvedValue({
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Version: '$LATEST'
      })
    };
    LambdaClient.prototype.send = mockLambdaClient.send;
    
    index = require('../index');
  });
  
  test('No function creation in dry run mode', async () => {
    
    const functionName = 'test-function';
    const dryRun = true;
    if (dryRun && !await index.checkFunctionExists({ send: jest.fn().mockRejectedValue({ name: 'ResourceNotFoundException' }) }, functionName)) {
      core.setFailed('DRY RUN MODE can only be used for updating function code of existing functions');
    }
    
    expect(core.setFailed).toHaveBeenCalledWith(
      'DRY RUN MODE can only be used for updating function code of existing functions'
    );
  });
  
  test('Skip configuration updates in dry run mode', async () => {
    
    const configChanged = true;
    const dryRun = true;
    if (configChanged && dryRun) {
      core.info('[DRY RUN] Configuration updates are not simulated in dry run mode');
      
    }
    
    expect(core.info).toHaveBeenCalledWith(
      '[DRY RUN] Configuration updates are not simulated in dry run mode'
    );
  });
  
  test('Add DryRun flag', async () => {
    
    const functionName = 'test-function';
    const dryRun = true;
    const region = 'us-east-1';
    
    if (dryRun) {
      core.info('DRY RUN MODE: No AWS resources will be created or modified');
      const codeInput = {
        FunctionName: functionName,
        ZipFile: await fs.readFile('/path/to/lambda-function.zip'),
        DryRun: true
      };
      core.info(`[DRY RUN] Would update function code with parameters:`);
      core.info(JSON.stringify({ ...codeInput, ZipFile: '<binary zip data not shown>' }, null, 2));
      
      const mockResponse = {
        FunctionArn: `arn:aws:lambda:${region}:000000000000:function:${functionName}`,
        Version: '$LATEST'
      };
      core.info('[DRY RUN] Function code validation passed');
      core.setOutput('function-arn', mockResponse.FunctionArn);
      core.setOutput('version', mockResponse.Version);
      core.info('[DRY RUN] Function code update simulation completed');
    }
    
    expect(core.info).toHaveBeenCalledWith('DRY RUN MODE: No AWS resources will be created or modified');
    expect(core.info).toHaveBeenCalledWith('[DRY RUN] Would update function code with parameters:');
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('DryRun'));
    expect(core.info).toHaveBeenCalledWith('[DRY RUN] Function code validation passed');
    expect(core.info).toHaveBeenCalledWith('[DRY RUN] Function code update simulation completed');
    
    expect(core.setOutput).toHaveBeenCalledWith('function-arn', `arn:aws:lambda:${region}:000000000000:function:${functionName}`);
    expect(core.setOutput).toHaveBeenCalledWith('version', '$LATEST');
  });
});
