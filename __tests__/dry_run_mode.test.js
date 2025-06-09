const { run } = require('../index');
const core = require('@actions/core');
const validations = require('../validations');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const fs = require('fs/promises');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('../validations');
jest.mock('@aws-sdk/client-lambda');
jest.mock('fs/promises');

describe('Dry Run Mode Tests', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup core mocks
    core.getInput = jest.fn();
    core.getBooleanInput = jest.fn();
    core.info = jest.fn();
    core.setOutput = jest.fn();
    core.setFailed = jest.fn();
    
    // Mock validations
    validations.validateAllInputs.mockReturnValue({
      valid: true,
      functionName: 'test-function',
      region: 'us-east-1',
      zipFilePath: './test.zip',
      role: 'arn:aws:iam::123456789012:role/lambda-role',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      ephemeralStorage: 512,
      timeout: 3,
      packageType: 'Zip',
      dryRun: true, // Set to true for dry run tests
      publish: true,
      architectures: 'x86_64'
    });

    // Mock fs.readFile
    fs.readFile.mockResolvedValue(Buffer.from('mock zip content'));
  });

  test('should reject function creation in dry run mode', async () => {
    // Create a direct mock implementation for core.setFailed
    core.setFailed.mockImplementation((message) => {
      // We can leave this empty or add logging if needed
      console.log(`core.setFailed called with: ${message}`);
    });
    
    // Set specific validation values for dry run but with no function
    validations.validateAllInputs.mockReturnValue({
      valid: true,
      functionName: 'test-function',
      region: 'us-east-1',
      zipFilePath: './test.zip', 
      dryRun: true,  // Important: dry run is enabled
      architectures: 'x86_64'
    });
    
    // Mock the client in a more direct way
    LambdaClient.prototype.send.mockImplementationOnce((command) => {
      if (command.constructor.name === 'GetFunctionCommand') {
        return Promise.reject({ name: 'ResourceNotFoundException' });
      }
      return Promise.resolve({});
    });
    
    // Run the function
    await run();
    
    // Check error message
    expect(core.setFailed).toHaveBeenCalledWith(
      'DRY RUN MODE can only be used for updating function code of existing functions'
    );
  });

  test('should simulate function code update in dry run mode', async () => {
    // Mock index.checkFunctionExists to return true (function exists)
    jest.spyOn(require('../index'), 'checkFunctionExists').mockResolvedValue(true);
    
    // Mock GetFunctionConfigurationCommand response
    LambdaClient.prototype.send.mockResolvedValue({
      FunctionName: 'test-function',
      Runtime: 'nodejs18.x',
      Handler: 'index.handler',
      Role: 'arn:aws:iam::123456789012:role/lambda-role'
    });
    
    // Execute the run function
    await run();
    
    // Verify dry run message is output
    expect(core.info).toHaveBeenCalledWith('DRY RUN MODE: No AWS resources will be created or modified');
    
    // Verify that code update simulation happens
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Would update function code with parameters:'));
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Function code update simulation completed'));
    
    // Verify mock outputs were set
    expect(core.setOutput).toHaveBeenCalledWith('function-arn', expect.stringContaining('arn:aws:lambda:us-east-1:000000000000:function:test-function'));
    expect(core.setOutput).toHaveBeenCalledWith('version', '$LATEST');
  });

  test('should skip configuration update in dry run mode', async () => {
    // Mock index.checkFunctionExists to return true (function exists)
    jest.spyOn(require('../index'), 'checkFunctionExists').mockResolvedValue(true);
    
    // Mock GetFunctionConfigurationCommand response with different config
    LambdaClient.prototype.send.mockResolvedValue({
      FunctionName: 'test-function',
      Runtime: 'nodejs16.x', // Different from the input
      Handler: 'index.oldHandler', // Different from the input
      Role: 'arn:aws:iam::123456789012:role/old-role' // Different from the input
    });
    
    // Mock hasConfigurationChanged to return true
    jest.spyOn(require('../index'), 'hasConfigurationChanged').mockResolvedValue(true);
    
    // Execute the run function
    await run();
    
    // Verify configuration updates are skipped in dry run mode
    expect(core.info).toHaveBeenCalledWith('[DRY RUN] Configuration updates are not simulated in dry run mode');
    
    // Verify that code update simulation still happens
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Would update function code with parameters:'));
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Function code update simulation completed'));
  });

  test('should handle dry run with json config parameters', async () => {
    // Mock index.checkFunctionExists to return true (function exists)
    jest.spyOn(require('../index'), 'checkFunctionExists').mockResolvedValue(true);
    
    // Setup validations to return complex parameters
    validations.validateAllInputs.mockReturnValue({
      valid: true,
      functionName: 'test-function',
      region: 'us-east-1',
      zipFilePath: './test.zip',
      role: 'arn:aws:iam::123456789012:role/lambda-role',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      dryRun: true,
      environment: '{"ENV":"prod","DEBUG":"true"}',
      parsedEnvironment: { ENV: 'prod', DEBUG: 'true' },
      vpcConfig: '{"SubnetIds":["subnet-123","subnet-456"],"SecurityGroupIds":["sg-123"]}',
      parsedVpcConfig: { SubnetIds: ['subnet-123', 'subnet-456'], SecurityGroupIds: ['sg-123'] },
      tracingConfig: '{"Mode":"Active"}',
      parsedTracingConfig: { Mode: 'Active' },
      architectures: 'x86_64'
    });
    
    // Execute the run function
    await run();
    
    // Verify that code update simulation happens with the complex configuration
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Would update function code with parameters:'));
  });

  test('should handle dry run for code-artifacts-dir', async () => {
    // Skip actually mocking packageCodeArtifacts and just verify the correct log message
    // which indicates the function would have been called
    
    // Mock index.checkFunctionExists to return true (function exists)
    jest.spyOn(require('../index'), 'checkFunctionExists').mockResolvedValue(true);
    
    // Setup validations for code-artifacts-dir case
    validations.validateAllInputs.mockReturnValue({
      valid: true,
      functionName: 'test-function',
      region: 'us-east-1',
      codeArtifactsDir: './src', // This should trigger the log message
      role: 'arn:aws:iam::123456789012:role/lambda-role',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      dryRun: true,
      architectures: 'x86_64'
    });
    
    // Execute the run function
    await run();
    
    // Verify the message about packaging artifacts is logged
    expect(core.info).toHaveBeenCalledWith('Packaging code artifacts from ./src');
    
    // Also verify dry run message
    expect(core.info).toHaveBeenCalledWith('DRY RUN MODE: No AWS resources will be created or modified');
  });
});
