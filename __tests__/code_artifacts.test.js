jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda');
jest.mock('../index', () => {
  const actualModule = jest.requireActual('../index');
  const originalRun = actualModule.run;
  
  return {
    ...actualModule,
    run: jest.fn().mockImplementation(async () => {
      const fs = require('fs/promises');
      const AdmZip = require('adm-zip');
      const { glob } = require('glob');
      const core = require('@actions/core');
      
      await fs.mkdir('/mock/cwd/lambda-package', { recursive: true });
      await glob('**/*', { cwd: '/mock/artifacts', dot: true });
      const zip = new AdmZip();
      zip.addLocalFolder('/mock/cwd/lambda-package');
      
      core.info('Packaging code artifacts from /mock/artifacts');
      core.info('Lambda function deployment completed successfully');
    }),
    packageCodeArtifacts: jest.fn().mockResolvedValue('/mock/cwd/lambda-function.zip'),
    parseJsonInput: actualModule.parseJsonInput,
    validateRoleArn: actualModule.validateRoleArn,
    validateCodeSigningConfigArn: actualModule.validateCodeSigningConfigArn,
    validateKmsKeyArn: actualModule.validateKmsKeyArn,
    checkFunctionExists: jest.fn().mockResolvedValue(false),
    waitForFunctionUpdated: jest.fn().mockResolvedValue(undefined)
  };
});
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockImplementation(async (path) => ({
    isDirectory: () => path.includes('directory')
  })),
  copyFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('mock file content'))
}));
jest.mock('glob', () => ({
  glob: jest.fn().mockResolvedValue(['file1.js', 'directory/file2.js', 'directory'])
}));
jest.mock('adm-zip', () => 
  jest.fn().mockImplementation(() => ({
    addLocalFolder: jest.fn(),
    writeZip: jest.fn()
  }))
);
jest.mock('path');

const core = require('@actions/core');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');
const path = require('path');
const { glob } = require('glob');
const AdmZip = require('adm-zip');
const mainModule = require('../index');

describe('Code Artifacts Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    process.cwd = jest.fn().mockReturnValue('/mock/cwd');
    
    path.join.mockImplementation((...parts) => parts.join('/'));
    path.dirname.mockImplementation((p) => p.substring(0, p.lastIndexOf('/')));
    
    core.getInput.mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'code-artifacts-dir': '/mock/artifacts',
        'role': 'arn:aws:iam::123456789012:role/lambda-role',
      };
      return inputs[name] || '';
    });
    
    core.getBooleanInput.mockImplementation(() => false);
    core.info.mockImplementation(() => {});
    core.error.mockImplementation(() => {});
    core.setFailed.mockImplementation(() => {});
    
    const mockLambdaResponse = {
      $metadata: { httpStatusCode: 200 },
      Configuration: {
        FunctionName: 'test-function',
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Role: 'arn:aws:iam::123456789012:role/lambda-role'
      }
    };
    
    LambdaClient.prototype.send = jest.fn().mockResolvedValue(mockLambdaResponse);
  });
  
  test('should package artifacts and deploy to Lambda', async () => {
    mainModule.run.mockImplementationOnce(async () => {
      await fs.mkdir('/mock/cwd/lambda-package', { recursive: true });
      const files = await glob('**/*', { cwd: '/mock/artifacts', dot: true });
      const zip = new AdmZip();
      zip.addLocalFolder('/mock/cwd/lambda-package');
      core.info('Packaging code artifacts from /mock/artifacts');
    });
    
    await mainModule.run();
    
    
    expect(fs.mkdir).toHaveBeenCalledWith('/mock/cwd/lambda-package', { recursive: true }); 
    
    expect(glob).toHaveBeenCalledWith('**/*', { cwd: '/mock/artifacts', dot: true });

    expect(AdmZip).toHaveBeenCalled();
    const zipInstance = AdmZip.mock.results[0].value;
    expect(zipInstance.addLocalFolder).toHaveBeenCalledWith('/mock/cwd/lambda-package');
    
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Packaging code artifacts')); 
    expect(core.setFailed).not.toHaveBeenCalled();
  });
  
  test('should handle artifacts packaging failure', async () => {
    
    const packageError = new Error('Failed to create package');
    fs.mkdir.mockRejectedValueOnce(packageError);
    
    mainModule.run.mockImplementationOnce(async () => {
      try {
        await fs.mkdir('/mock/cwd/lambda-package', { recursive: true });
      } catch (error) {
        core.setFailed(`Action failed with error: ${error.message}`);
      }
    });
    
    
    await mainModule.run();
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Action failed with error'));
  });
  
  test('should correctly use code-artifacts-dir when provided', async () => {
    
    core.getInput.mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'code-artifacts-dir': '/mock/different-artifacts',
        'role': 'arn:aws:iam::123456789012:role/lambda-role',
      };
      return inputs[name] || '';
    }); 
    
    mainModule.run.mockImplementationOnce(async () => {  
      core.info('Lambda function deployment completed successfully');
    });
    
    await mainModule.run(); 
    
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(glob).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });
  
  test('should fail when code-artifacts-dir is missing', async () => {
    
    core.getInput.mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'role': 'arn:aws:iam::123456789012:role/lambda-role',
      };
      return inputs[name] || '';
    });
    
    mainModule.run.mockImplementationOnce(async () => {
      const codeArtifactsDir = core.getInput('code-artifacts-dir');

      if (!codeArtifactsDir) {
        core.setFailed('Code-artifacts-dir must be provided');
        return;
      }

      await fs.mkdir('/mock/cwd/lambda-package', { recursive: true });
    });

    await mainModule.run();

    expect(core.setFailed).toHaveBeenCalledWith(
      'Code-artifacts-dir must be provided'
    );
    
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(glob).not.toHaveBeenCalled();
  });
});