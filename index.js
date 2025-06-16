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
      functionName, region, codeArtifactsDir,
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
    
    if (dryRun) {
      core.info('DRY RUN MODE: No AWS resources will be created or modified');
    }
    
    core.info(`Packaging code artifacts from ${codeArtifactsDir}`);
    let finalZipPath = await packageCodeArtifacts(codeArtifactsDir);

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
        const zipFileContent = await fs.readFile(finalZipPath);
        
        core.info(`Zip file read successfully, size: ${zipFileContent.length} bytes`); 
        core.info('Creating Lambda function with deployment package');

        const input = {
          FunctionName: functionName,
          Code: {
            ZipFile: await fs.readFile(finalZipPath)
          },
          ...(runtime && { Runtime: runtime }),
          ...(role && { Role: role }),
          ...(handler && { Handler: handler }),
          ...(functionDescription && { Description: functionDescription }),
          ...(parsedMemorySize && { MemorySize: parsedMemorySize }),
          ...(timeout && { Timeout: timeout }),
          ...(packageType && { PackageType: packageType }),
          ...(publish !== undefined && { Publish: publish }),
          ...(architectures && { Architectures: Array.isArray(architectures) ? architectures : [architectures] }),
          ...(ephemeralStorage && { EphemeralStorage: { Size: ephemeralStorage } }),
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
        if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429) {
          core.setFailed(`Rate limit exceeded and maximum retries reached: ${error.message}`);
        } else if (error.$metadata?.httpStatusCode >= 500) {
          core.setFailed(`Server error (${error.$metadata?.httpStatusCode}): ${error.message}. All retry attempts failed.`);
        } else if (error.name === 'AccessDeniedException') {
          core.setFailed(`Action failed with error: Permissions error: ${error.message}. Check IAM roles.`);
        } else {
          core.setFailed(`Failed to create function: ${error.message}`);
        }
        
        if (error.stack) {
          core.debug(error.stack);
        }
        throw error; 
      }
      core.info('Lambda function created successfully');
      return;
    }

    core.info(`Getting current configuration for function ${functionName}`);
    const configCommand = new GetFunctionConfigurationCommand({FunctionName: functionName});
    let currentConfig = await client.send(configCommand);

    const configChanged = hasConfigurationChanged(currentConfig, {
      ...(role && { Role: role }),
      ...(handler && { Handler: handler }),
      ...(functionDescription && { Description: functionDescription }),
      ...(parsedMemorySize && { MemorySize: parsedMemorySize }),
      ...(timeout && { Timeout: timeout }),
      ...(runtime && { Runtime: runtime }),
      ...(kmsKeyArn && { KMSKeyArn: kmsKeyArn }),
      ...(ephemeralStorage && { EphemeralStorage: { Size: ephemeralStorage } }),
      ...(vpcConfig && { VpcConfig: parsedVpcConfig }),
      ...(environment && { Environment: { Variables: parsedEnvironment } }),
      ...(deadLetterConfig && { DeadLetterConfig: parsedDeadLetterConfig }),
      ...(tracingConfig && { TracingConfig: parsedTracingConfig }),
      ...(layers && { Layers: parsedLayers }),
      ...(fileSystemConfigs && { FileSystemConfigs: parsedFileSystemConfigs }),
      ...(imageConfig && { ImageConfig: parsedImageConfig }),
      ...(snapStart && { SnapStart: parsedSnapStart }),
      ...(loggingConfig && { LoggingConfig: parsedLoggingConfig })
    });

    // Update Function Configuration
    if (configChanged) {
      if (dryRun) {
        core.info('[DRY RUN] Configuration updates are not simulated in dry run mode');
        return;
      } 

      try {
        const input = {
          FunctionName: functionName,
          ...(role && { Role: role }),
          ...(handler && { Handler: handler }),
          ...(functionDescription && { Description: functionDescription }),
          ...(parsedMemorySize && { MemorySize: parsedMemorySize }),
          ...(timeout && { Timeout: timeout }),
          ...(runtime && { Runtime: runtime }),
          ...(kmsKeyArn && { KMSKeyArn: kmsKeyArn }),
          ...(ephemeralStorage && { EphemeralStorage: { Size: ephemeralStorage } }),
          ...(vpcConfig && { VpcConfig: parsedVpcConfig }),
          ...(environment && { Environment: { Variables: parsedEnvironment } }),
          ...(deadLetterConfig && { DeadLetterConfig: parsedDeadLetterConfig }),
          ...(tracingConfig && { TracingConfig: parsedTracingConfig }),
          ...(layers && { Layers: parsedLayers }),
          ...(fileSystemConfigs && { FileSystemConfigs: parsedFileSystemConfigs }),
          ...(imageConfig && { ImageConfig: parsedImageConfig }),
          ...(snapStart && { SnapStart: parsedSnapStart }),
          ...(loggingConfig && { LoggingConfig: parsedLoggingConfig })
        };

        core.info(`Updating function configuration for ${functionName}`);
        const command = new UpdateFunctionConfigurationCommand(input);
        await client.send(command);
        await waitForFunctionUpdated(client, functionName);
      } catch (error) {
        if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429) {
          core.setFailed(`Rate limit exceeded and maximum retries reached: ${error.message}`);
        } else if (error.$metadata?.httpStatusCode >= 500) {
          core.setFailed(`Server error (${error.$metadata?.httpStatusCode}): ${error.message}. All retry attempts failed.`);
        } else if (error.name === 'AccessDeniedException') {
          core.setFailed(`Action failed with error: Permissions error: ${error.message}. Check IAM roles.`);
        } else {
          core.setFailed(`Failed to update function configuration: ${error.message}`);
        }
        
        if (error.stack) {
          core.debug(error.stack);
        }
        throw error; 
      }
    } else {
      core.info('No configuration changes detected');
    }

    // Update Function Code
    core.info(`Updating function code for ${functionName} with ${finalZipPath}`);
    
    let zipFileContent;

    try {
      try {
        zipFileContent = await fs.readFile(finalZipPath);
      } catch (error) {
        core.setFailed(`Failed to read Lambda deployment package at ${finalZipPath}: ${error.message}`);

        if (error.code === 'ENOENT') {
          core.error(`File not found. Ensure the code artifacts directory "${codeArtifactsDir}" contains the required files.`);
        } else if (error.code === 'EACCES') {
          core.error('Permission denied. Check file access permissions.');
        }
        
        if (error.stack) {
          core.debug(error.stack);
        }
        
        return;
      }
    
      const codeInput = {
        FunctionName: functionName,
        ZipFile: zipFileContent,
        ...(architectures && { Architectures: Array.isArray(architectures) ? architectures : [architectures] }),
        ...(publish !== undefined && { Publish: publish }),
        ...(revisionId && { RevisionId: revisionId }),
        ...(sourceKmsKeyArn && { SourceKmsKeyArn: sourceKmsKeyArn })
      };
      
      core.info(`Original buffer length: ${zipFileContent.length} bytes`);
            
      if (dryRun) {
        core.info(`[DRY RUN] Would update function code with parameters:`);
        core.info(JSON.stringify(codeInput, null, 2));
        codeInput.DryRun = true;
        
        const command = new UpdateFunctionCodeCommand(codeInput);
        const response = await client.send(command);
        
        core.info('[DRY RUN] Function code validation passed');
        core.setOutput('function-arn', response.FunctionArn || `arn:aws:lambda:${region}:000000000000:function:${functionName}`);
        core.setOutput('version', response.Version || '$LATEST');
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
      if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429) {
        core.setFailed(`Rate limit exceeded and maximum retries reached: ${error.message}`);
      } else if (error.$metadata?.httpStatusCode >= 500) {
        core.setFailed(`Server error (${error.$metadata?.httpStatusCode}): ${error.message}. All retry attempts failed.`);
      } else if (error.name === 'AccessDeniedException') {
        core.setFailed(`Action failed with error: Permissions error: ${error.message}. Check IAM roles.`);
      } else {
        core.setFailed(`Failed to update function code: ${error.message}`);
      }
      
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

    const resolvedArtifactsDir = path.isAbsolute(artifactsDir) ? artifactsDir : path.resolve(process.cwd(), artifactsDir);
    
    core.info(`Copying artifacts from ${resolvedArtifactsDir} to ${tempDir}`);
    
    try {
      await fs.access(resolvedArtifactsDir);
    } catch (error) {
      throw new Error(`Code artifacts directory '${resolvedArtifactsDir}' does not exist or is not accessible: ${error.message}`);
    }
    
    const sourceFiles = await fs.readdir(resolvedArtifactsDir);
    
    if (sourceFiles.length === 0) {
      throw new Error(`Code artifacts directory '${resolvedArtifactsDir}' is empty, no files to package`);
    }
    
    core.info(`Found ${sourceFiles.length} files/directories to copy`);
    
    for (const file of sourceFiles) {
      const sourcePath = path.join(resolvedArtifactsDir, file);
      const destPath = path.join(tempDir, file);
      
      core.info(`Copying ${sourcePath} to ${destPath}`);
      
      await fs.cp(
        sourcePath,
        destPath,
        { recursive: true }
      );
    }

    core.info('Creating ZIP file with standard options');
    const zip = new AdmZip();
    
    const tempFiles = await fs.readdir(tempDir, { withFileTypes: true });
    
    for (const file of tempFiles) {
      const fullPath = path.join(tempDir, file.name);
      
      if (file.isDirectory()) {
        core.info(`Adding directory: ${file.name}`);
        zip.addLocalFolder(fullPath, file.name);
      } else {
        core.info(`Adding file: ${file.name}`);
        zip.addLocalFile(fullPath);
      }
    }
    
    core.info('Writing ZIP file with standard options');
    zip.writeZip(zipPath);
    
    try {
      const stats = await fs.stat(zipPath);
      core.info(`Generated ZIP file size: ${stats.size} bytes`);
      
      const verifyZip = new AdmZip(zipPath);
      const entries = verifyZip.getEntries();
      
      core.info(`ZIP verification passed - contains ${entries.length} entries:`);
      for (let i = 0; i < entries.length; i++) {
        core.info(`  ${i+1}. ${entries[i].entryName} (${entries[i].header.size} bytes)`);
      }
    } catch (error) {
      throw new Error(`ZIP validation failed: ${error.message}`);
    }

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
    const command = new GetFunctionConfigurationCommand(input);
    await client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

function isEmptyValue(value) {
  if (value === null || value === undefined || value === '') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every(item => isEmptyValue(item));
  }

  if (typeof value === 'object') {
    if ('SubnetIds' in value || 'SecurityGroupIds' in value) {
      return false;
    }
    return Object.keys(value).length === 0 || 
           Object.values(value).every(val => isEmptyValue(val));
  }

  return false; 
}

function cleanNullKeys(obj) {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (obj === '') {
    return undefined;
  }

  const isVpcConfig = obj && typeof obj === 'object' && ('SubnetIds' in obj || 'SecurityGroupIds' in obj);
  
  if (Array.isArray(obj)) {
    const filtered = obj.filter(item => !isEmptyValue(item));
    return filtered.length > 0 ? filtered : undefined;
  }

  if (typeof obj === 'object') {
    const result = {};
    let hasProperties = false;

    for (const [key, value] of Object.entries(obj)) {
      if (isVpcConfig && (key === 'SubnetIds' || key === 'SecurityGroupIds')) {
        result[key] = Array.isArray(value) ? value : [];
        hasProperties = true;
        continue;
      }

      if (value === null || value === undefined || value === '') {
        continue; 
      }

      const cleaned = cleanNullKeys(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
        hasProperties = true;
      }
    }

    return hasProperties ? result : undefined;
  }

  return obj; 
}

function deepEqual(obj1, obj2) {
  if (obj1 === null || obj2 === null || typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }
  
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      return false;
    }
    
    for (let i = 0; i < obj1.length; i++) {
      if (!deepEqual(obj1[i], obj2[i])) {
        return false;
      }
    }
    
    return true;
  }
  
  if (Array.isArray(obj1) !== Array.isArray(obj2)) {
    return false;
  }
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) {
    return false;
  }
  
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }
  
  return true;
}

async function hasConfigurationChanged(currentConfig, updatedConfig) {
  if (!currentConfig || Object.keys(currentConfig).length === 0) {
    return true;
  }

  const cleanedUpdated = cleanNullKeys(updatedConfig) || {};
  let hasChanged = false;
  
  for (const [key, value] of Object.entries(cleanedUpdated)) {
    if (value !== undefined) {
      if (!(key in currentConfig)) {
        core.info(`Configuration difference detected in ${key}`);
        hasChanged = true;
        continue;
      }
      
      if (typeof value === 'object' && value !== null) {
        if (!deepEqual(currentConfig[key] || {}, value)) {
          core.info(`Configuration difference detected in ${key}`);
          hasChanged = true;
        }
      } else if (currentConfig[key] !== value) {
        core.info(`Configuration difference detected in ${key}: ${currentConfig[key]} -> ${value}`);
        hasChanged = true;
      }
    }
  }

  return hasChanged;
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
  cleanNullKeys,
  deepEqual
};
