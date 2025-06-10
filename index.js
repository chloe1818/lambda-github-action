const core = require('@actions/core');
const { LambdaClient, CreateFunctionCommand, GetFunctionCommand, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand, UpdateFunctionCodeCommand, waitUntilFunctionUpdated } = require('@aws-sdk/client-lambda');
const fs = require('fs/promises'); 
const path = require('path');
const AdmZip = require('adm-zip');
const validations = require('./validations');

async function run() {
  try {  
    const inputs = validations.validateAllInputs();
    if (!inputs.valid) {
      return;
    }

    const {
      functionName, region, zipFilePath, codeArtifactsDir,
      ephemeralStorage, parsedMemorySize, timeout,
      role, codeSigningConfigArn, kmsKeyArn, sourceKmsKeyArn,
      environment, vpcConfig, deadLetterConfig, tracingConfig, 
      layers, fileSystemConfigs, imageConfig, snapStart, 
      loggingConfig, tags,
      parsedEnvironment, parsedVpcConfig, parsedDeadLetterConfig, 
      parsedTracingConfig, parsedLayers, parsedFileSystemConfigs, 
      parsedImageConfig, parsedSnapStart, parsedLoggingConfig, parsedTags,
      functionDescription, packageType, dryRun, publish, revisionId,
      runtime, handler, architectures
    } = inputs;
    
    let finalZipPath = zipFilePath;
    if(codeArtifactsDir) {
      if(dryRun) {
        core.info('DRY RUN MODE: No AWS resources will be created or modified');
      }
      core.info(`Packaging code artifacts from ${codeArtifactsDir}`);
      finalZipPath = await packageCodeArtifacts(codeArtifactsDir);
    }

    const client = new LambdaClient({
      region
    });

    core.info(`Checking if ${functionName} exists`);
    let functionExists = await checkFunctionExists(client, functionName);

    if (!functionExists) {
      if (dryRun) {
        core.setFailed('DRY RUN MODE can only be used for updating function code of existing functions');
        return;
      }

      core.info(`Function ${functionName} doesn't exist, creating new function`);

      if(!role) {
        core.setFailed('Role ARN must be provided when creating a new function');
        return;
      }

      // Create function
      try {
        let input = {
          FunctionName: functionName,
          Runtime: runtime,
          Role: role,
          Handler: handler,
          Code: {
            ZipFile: await fs.readFile(finalZipPath)
          },
          Description: functionDescription,
          MemorySize: parsedMemorySize,
          Timeout: timeout,
          PackageType: packageType,
          Publish: publish,
          Architectures: architectures ? (Array.isArray(architectures) ? architectures : [architectures]) : undefined,
          EphemeralStorage: { Size: ephemeralStorage },
          RevisionId: revisionId,
          VpcConfig: parsedVpcConfig,
          Environment: environment ? { Variables: parsedEnvironment } : undefined,
          DeadLetterConfig: parsedDeadLetterConfig,
          TracingConfig: parsedTracingConfig,
          Layers: parsedLayers,
          FileSystemConfigs: parsedFileSystemConfigs,
          ImageConfig: parsedImageConfig,
          SnapStart: parsedSnapStart,
          LoggingConfig: parsedLoggingConfig,
          Tags: parsedTags,
          KMSKeyArn: kmsKeyArn,
          CodeSigningConfigArn: codeSigningConfigArn,
          SourceKmsKeyArn: sourceKmsKeyArn
        };
        
        input = cleanNullKeys(input);

        core.info(`Creating new Lambda function: ${functionName}`);
        const command = new CreateFunctionCommand(input);
        const response = await client.send(command);
        
        core.setOutput('function-arn', response.FunctionArn);
        if (response.Version) {
          core.setOutput('version', response.Version);
        }
      } catch (error) {
        core.setFailed(`Failed to create function: ${error.message}`);
        if (error.stack) {
          core.debug(error.stack);
        }
      }
      core.info('Lambda function created successfully');
      return;
    }

    core.info(`Getting current configuration for function ${functionName}`);
    const configCommand = new GetFunctionConfigurationCommand({FunctionName: functionName});
    let currentConfig = await client.send(configCommand);

    const configChanged = hasConfigurationChanged(currentConfig, {
      Role: role,
      Handler: handler,
      Description: functionDescription,
      ...(parsedMemorySize && { MemorySize: parsedMemorySize }),
      Timeout: timeout,
      Runtime: runtime,
      KMSKeyArn: kmsKeyArn,
      EphemeralStorage: { Size: ephemeralStorage },
      VpcConfig: vpcConfig ? parsedVpcConfig : undefined,
      Environment: environment ? parsedEnvironment: undefined,
      DeadLetterConfig: deadLetterConfig ? parsedDeadLetterConfig : undefined,
      TracingConfig: tracingConfig ? parsedTracingConfig : undefined,
      Layers: layers ? parsedLayers : undefined,
      FileSystemConfigs: fileSystemConfigs ? parsedFileSystemConfigs : undefined,
      ImageConfig: imageConfig ? parsedImageConfig : undefined,
      SnapStart: snapStart ? parsedSnapStart : undefined,
      LoggingConfig: loggingConfig ? parsedLoggingConfig : undefined
    });

    if (configChanged) {
      if (dryRun) {
        core.info('[DRY RUN] Configuration updates are not simulated in dry run mode');
      } else {
        try {
          let input = {
            FunctionName: functionName,
            Role: role,
            Handler: handler,
            Description: functionDescription,
            MemorySize: parsedMemorySize,
            Timeout: timeout,
            Runtime: runtime,
            KMSKeyArn: kmsKeyArn,
            EphemeralStorage: { Size: ephemeralStorage },
            VpcConfig: parsedVpcConfig,
            Environment: environment ? { Variables: parsedEnvironment } : undefined,
            DeadLetterConfig: parsedDeadLetterConfig,
            TracingConfig: parsedTracingConfig,
            Layers: parsedLayers,
            FileSystemConfigs: parsedFileSystemConfigs,
            ImageConfig: parsedImageConfig,
            SnapStart: parsedSnapStart,
            LoggingConfig: parsedLoggingConfig
          };
          
          input = cleanNullKeys(input);

          core.info(`Updating function configuration for ${functionName}`);
          const command = new UpdateFunctionConfigurationCommand(input);
          await client.send(command);
          await waitForFunctionUpdated(client, functionName);
        } catch (error) {
          core.setFailed(`Failed to update function configuration: ${error.message}`);
          if (error.stack) {
            core.debug(error.stack);
          }
        }
      }
    } else {
      core.info('No configuration changes detected');
    }

    core.info(`Updating function code for ${functionName} with ${finalZipPath}`);
    
    try {
      if (dryRun) {
        core.info('DRY RUN MODE: No AWS resources will be created or modified');
      }
      
      let zipFileContent;
      try {
        zipFileContent = await fs.readFile(finalZipPath);
      } catch (error) {
        if (dryRun) {
          core.info(`[DRY RUN] Unable to read file ${finalZipPath}, using mock content for simulation`);
          zipFileContent = Buffer.from('mock zip content for dry run');
        } else {
          throw error;
        }
      }
      
      let codeInput = {
        FunctionName: functionName,
        ZipFile: zipFileContent, 
        Architectures: architectures ? (Array.isArray(architectures) ? architectures : [architectures]) : undefined,
        Publish: publish,
        RevisionId: revisionId,
        SourceKmsKeyArn: sourceKmsKeyArn,
      };
      
      codeInput = cleanNullKeys(codeInput);
      
      if (dryRun) {
        const logInput = {...codeInput};
        if (logInput.ZipFile) {
          logInput.ZipFile = '<binary zip data not shown>';
        }
        core.info('[DRY RUN] Would update function code with parameters:');
        core.info(JSON.stringify(logInput, null, 2));
        
        const mockArn = `arn:aws:lambda:${region}:000000000000:function:${functionName}`;
        core.setOutput('function-arn', mockArn);
        core.setOutput('version', '$LATEST');
        core.info('[DRY RUN] Function code update simulation completed');
      } else {
        const command = new UpdateFunctionCodeCommand(codeInput);
        const response = await client.send(command);
        core.setOutput('function-arn', response.FunctionArn);
        if (response.Version) {
          core.setOutput('version', response.Version);
        }
      }
    } catch (error) {
      core.setFailed(`Failed to update function code: ${error.message}`);
      if (error.stack) {
        core.debug(error.stack);
      }
      return;
    }

    core.info('Lambda function deployment completed successfully');
    
  }
  catch (error) {
    if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429) {
      core.setFailed(`Rate limit exceeded and maximum retries reached: ${error.message}`);
    } else if (error.$metadata?.httpStatusCode >= 500) {
      core.setFailed(`Server error (${error.$metadata?.httpStatusCode}): ${error.message}. All retry attempts failed.`);
    } else if (error.name === 'AccessDeniedException') {
      core.setFailed(`Action failed with error: Permissions error: ${error.message}. Check IAM roles.`);
    } else {
      core.setFailed(`Action failed with error: ${error.message}`);
    }
    if (error.stack) {
      core.debug(error.stack);
    }
  }
}

async function packageCodeArtifacts(artifactsDir) {
  const tempDir = path.join(process.cwd(), 'lambda-package');
  const zipPath = path.join(process.cwd(), 'lambda-function.zip');

  try {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
    }
    
    await fs.mkdir(tempDir, { recursive: true });

    core.info(`Copying artifacts from ${artifactsDir} to ${tempDir}`);
    
    const files = await fs.readdir(artifactsDir);
    
    for (const file of files) {
      await fs.cp(
        path.join(artifactsDir, file),
        path.join(tempDir, file),
        { recursive: true }
      );
    }

    core.info('Creating ZIP file');
    const zip = new AdmZip();
    zip.addLocalFolder(tempDir);
    zip.writeZip(zipPath);
    
    return zipPath;
  } catch (error) {
    core.error(`Failed to package artifacts: ${error.message}`);
    throw error;
  }
}

async function checkFunctionExists(client, functionName) {
  try {
    const input = {
      FunctionName: functionName
    };
    const command = new GetFunctionCommand(input);
    const response = await client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function hasConfigurationChanged(currentConfig, updatedConfig) {
  if (!currentConfig || Object.keys(currentConfig).length === 0) {
    return true;
  }
  
  const cleanedCurrent = cleanNullKeys(currentConfig);
  const cleanedUpdated = cleanNullKeys(updatedConfig);
  
  for (const [key, value] of Object.entries(cleanedUpdated)) {
    if (value !== undefined) {
      if (typeof value === 'object') {
        const currentStr = JSON.stringify(cleanedCurrent[key] || {});
        const updatedStr = JSON.stringify(value);
        
        if (currentStr !== updatedStr) {
          core.info(`Configuration difference detected in ${key}`);
          return true;
        }
      } else if (cleanedCurrent[key] !== value) {
        core.info(`Configuration difference detected in ${key}: ${cleanedCurrent[key]} -> ${value}`);
        return true;
      }
    }
  }

  return false;
}

async function waitForFunctionUpdated(client, functionName, waitForMinutes = 5) {
  const MAX_WAIT_MINUTES = 30;
  
  if (waitForMinutes > MAX_WAIT_MINUTES) {
    waitForMinutes = MAX_WAIT_MINUTES;
    core.info(`Wait time capped to maximum of ${MAX_WAIT_MINUTES} minutes`);
  }
  
  core.info(`Waiting for function update to complete. Will wait for ${waitForMinutes} minutes`);
  
  try {
    await waitUntilFunctionUpdated({
      client: client,
      minDelay: 2, 
      maxWaitTime: waitForMinutes * 60, 
    }, {
      FunctionName: functionName
    });
    
    core.info('Function update completed successfully');
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error(`Timed out waiting for function ${functionName} update to complete after ${waitForMinutes} minutes`);
    } else if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Function ${functionName} not found`);
    } else if (error.$metadata && error.$metadata.httpStatusCode === 403) {
      throw new Error(`Permission denied while checking function ${functionName} status`);
    } else {
      core.warning(`Function update check error: ${error.message}`);
      throw new Error(`Error waiting for function ${functionName} update: ${error.message}`);
    }
  }
}

function isEmptyValue(value) {
  if (value === null || value === undefined || value === '') {
    return true;
  }

  if (Array.isArray(value)) {
    for (var element of value) {
      if (!isEmptyValue(element)) {
        return false;
      }
    }
    return true;
  }

  if (typeof value === 'object') {
    for (var childValue of Object.values(value)) {
      if (!isEmptyValue(childValue)) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function emptyValueReplacer(_, value) {
  if (isEmptyValue(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.filter(e => !isEmptyValue(e));
  }

  return value;
}

function cleanNullKeys(obj) {
  if (!obj) return obj;
  
  const stringified = JSON.stringify(obj, emptyValueReplacer);
  
  // Handle the case where everything was removed
  if (stringified === undefined || stringified === 'undefined' || stringified === 'null') {
    return Array.isArray(obj) ? [] : {};
  }
  
  try {
    return JSON.parse(stringified);
  } catch (error) {
    core.debug(`Error parsing cleaned object: ${error.message}`);
    return Array.isArray(obj) ? [] : {};
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  packageCodeArtifacts,
  checkFunctionExists,
  hasConfigurationChanged,
  waitForFunctionUpdated,
  isEmptyValue,
  emptyValueReplacer,
  cleanNullKeys
};
