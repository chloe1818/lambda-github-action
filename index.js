const core = require('@actions/core');
const { LambdaClient, CreateFunctionCommand, GetFunctionCommand, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand, UpdateFunctionCodeCommand } = require('@aws-sdk/client-lambda');
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
      region,
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
        const input = {
          FunctionName: functionName,
          Runtime: runtime,
          Role: role,
          Handler: handler,
          Code: {
            ZipFile: await fs.readFile(finalZipPath)
          },
          Description: functionDescription,
          ...(parsedMemorySize && { MemorySize: parsedMemorySize }),
          Timeout: timeout,
          PackageType: packageType,
          Publish: publish,
          Architectures: [architectures],
          EphemeralStorage: { Size: ephemeralStorage },
          ...(revisionId && { RevisionId: revisionId }),
          ...(vpcConfig && { VpcConfig: parsedVpcConfig }),
          ...(environment && { Environment: { Variables: parsedEnvironment } }),
          ...(deadLetterConfig && { DeadLetterConfig: parsedDeadLetterConfig }),
          ...(tracingConfig && { TracingConfig: parsedTracingConfig }),
          ...(layers && { Layers: parsedLayers }),
          ...(fileSystemConfigs && { FileSystemConfigs: parsedFileSystemConfigs }),
          ...(imageConfig && { ImageConfig: parsedImageConfig }),
          ...(snapStart && { SnapStart: parsedSnapStart }),
          ...(loggingConfig && { LoggingConfig: parsedLoggingConfig }),
          ...(tags && { Tags: parsedTags }),
          ...(kmsKeyArn && { KMSKeyArn: kmsKeyArn }),
          ...(codeSigningConfigArn && { CodeSigningConfigArn: codeSigningConfigArn }),
          ...(sourceKmsKeyArn && { SourceKmsKeyArn: sourceKmsKeyArn })
        };

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
          const input = {
            FunctionName: functionName,
            Role: role,
            Handler: handler,
            Description: functionDescription,
            ...(parsedMemorySize && { MemorySize: parsedMemorySize }),
            Timeout: timeout,
            Runtime: runtime,
            KMSKeyArn: kmsKeyArn,
            EphemeralStorage: { Size: ephemeralStorage },
            VpcConfig: vpcConfig ? parsedVpcConfig : undefined,
            Environment: environment ? { Variables: parsedEnvironment } : undefined,
            DeadLetterConfig: deadLetterConfig ? parsedDeadLetterConfig : undefined,
            TracingConfig: tracingConfig ? parsedTracingConfig : undefined,
            Layers: layers ? parsedLayers : undefined,
            FileSystemConfigs: fileSystemConfigs ? parsedFileSystemConfigs : undefined,
            ImageConfig: imageConfig ? parsedImageConfig : undefined,
            SnapStart: snapStart ? parsedSnapStart : undefined,
            LoggingConfig: loggingConfig ? parsedLoggingConfig : undefined
          };

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
      
      const codeInput = {
        FunctionName: functionName,
        ZipFile: zipFileContent, 
        Architectures: [architectures],
        Publish: publish,
        RevisionId: revisionId,
        SourceKmsKeyArn: sourceKmsKeyArn,
      };
      
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
    if (error.name === 'ThrottlingException') {
      core.warning('AWS throttling detected, consider retrying with exponential backoff');
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

  const current = currentConfig;
  
  for (const [key, value] of Object.entries(updatedConfig)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object') {
        if (JSON.stringify(value) !== JSON.stringify(current[key])) {
          core.info(`Configuration difference detected in ${key}`);
          return true;
        }
      } else if (current[key] !== value) {
        core.info(`Configuration difference detected in ${key}: ${current[key]} -> ${value}`);
        return true;
      }
    }
  }

  return false;
}

async function waitForFunctionUpdated(client, functionName) {
  core.info('Waiting for function update to complete');
  
  const maxRetries = 10;
  const retryDelay = 2000; 
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const params = { 
        FunctionName: functionName 
      };
      
      const command = new GetFunctionConfigurationCommand(params);
      const response = await client.send(command);
      
      if (response.State === 'Active' || response.LastUpdateStatus === 'Successful') {
        core.info('Function update completed successfully');
        return;
      }
      
      if (response.State === 'Failed' || response.LastUpdateStatus === 'Failed') {
        throw new Error(`Function update failed: ${response.LastUpdateStatusReason || 'No reason provided'}`);
      }
      
      core.info(`Function update in progress, waiting... (${i+1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        throw error; 
      }
      
      core.warning(`Error checking function status: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new Error('Timed out waiting for function update to complete');
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  packageCodeArtifacts,
  checkFunctionExists,
  hasConfigurationChanged,
  waitForFunctionUpdated
};
