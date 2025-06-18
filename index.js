const core = require('@actions/core');
const { LambdaClient, CreateFunctionCommand, GetFunctionCommand, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand, UpdateFunctionCodeCommand, waitUntilFunctionUpdated } = require('@aws-sdk/client-lambda');
const { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } = require('@aws-sdk/client-s3');
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
    
    const { s3Bucket, createS3Bucket } = inputs;
    let s3Key = inputs.s3Key;
    
    const useS3Method = !!s3Bucket;
    
    if (dryRun) {
      core.info('DRY RUN MODE: No AWS resources will be created or modified');
    }
    
    const enhancedEnvironment = { 
      ...parsedEnvironment,
      'AWS_LAMBDA_GITHUB_ACTION_SOURCE': 'aws-actions/amazon-lambda-deploy'
    };
    
    core.info(`Packaging code artifacts from ${codeArtifactsDir}`);
    let finalZipPath = await packageCodeArtifacts(codeArtifactsDir);

    const client = new LambdaClient({
      region
    });

    if (s3Bucket && !s3Key) {
      s3Key = generateS3Key(functionName);
      core.info(`No S3 key provided. Auto-generated key: ${s3Key}`);
    }

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

      try {
        core.info('Creating Lambda function with deployment package');

        let codeParameter;

        if (s3Bucket) {
          try {
            await uploadToS3(finalZipPath, s3Bucket, s3Key, region);
            core.info(`Successfully uploaded package to S3: s3://${s3Bucket}/${s3Key}`);
            
            codeParameter = {
              S3Bucket: s3Bucket,
              S3Key: s3Key,
              ...(sourceKmsKeyArn && { SourceKmsKeyArn: sourceKmsKeyArn })
            };
          } catch (error) {
            core.setFailed(`Failed to upload package to S3: ${error.message}`);
            if (error.stack) {
              core.debug(error.stack);
            }
            throw error;
          }
        } else {
          const zipFileContent = await fs.readFile(finalZipPath);
          core.info(`Zip file read successfully, size: ${zipFileContent.length} bytes`);
          
          codeParameter = {
            ZipFile: zipFileContent,
            ...(sourceKmsKeyArn && { SourceKmsKeyArn: sourceKmsKeyArn })
          };
        }

        const input = {
          FunctionName: functionName,
          Code: codeParameter,
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
          Environment: { Variables: enhancedEnvironment },
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
      Environment: { Variables: enhancedEnvironment },
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
          Environment: { Variables: enhancedEnvironment },
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
    
    try {
      let codeInput;
      
      if (useS3Method) {
        core.info(`Using S3 deployment method with bucket: ${s3Bucket}, key: ${s3Key}`);
        
        try {
          await uploadToS3(finalZipPath, s3Bucket, s3Key, region);
          core.info(`Successfully uploaded package to S3: s3://${s3Bucket}/${s3Key}`);
          
          codeInput = {
            FunctionName: functionName,
            S3Bucket: s3Bucket,
            S3Key: s3Key,
            ...(architectures && { Architectures: Array.isArray(architectures) ? architectures : [architectures] }),
            ...(publish !== undefined && { Publish: publish }),
            ...(revisionId && { RevisionId: revisionId }),
            ...(sourceKmsKeyArn && { SourceKmsKeyArn: sourceKmsKeyArn })
          };
          
        } catch (error) {
          core.setFailed(`Failed to upload package to S3: ${error.message}`);
          if (error.stack) {
            core.debug(error.stack);
          }
          return;
        }
        
      } else {
        let zipFileContent;
        
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
        
        codeInput = {
          FunctionName: functionName,
          ZipFile: zipFileContent,
          ...(architectures && { Architectures: Array.isArray(architectures) ? architectures : [architectures] }),
          ...(publish !== undefined && { Publish: publish }),
          ...(revisionId && { RevisionId: revisionId }),
          ...(sourceKmsKeyArn && { SourceKmsKeyArn: sourceKmsKeyArn })
        };
        
        core.info(`Original buffer length: ${zipFileContent.length} bytes`);
      }
            
      if (dryRun) {
        core.info(`[DRY RUN] Would update function code with parameters:`);
        // Clone and remove ZipFile for logging to prevent huge output
        const logInput = {...codeInput};
        if (logInput.ZipFile) {
          logInput.ZipFile = `<Binary data of length ${logInput.ZipFile.length} bytes>`;
        }
        core.info(JSON.stringify(logInput, null, 2));
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

function generateS3Key(functionName) {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-').replace('T', '-').split('Z')[0];
  
  let commitHash = '';
  if (process.env.GITHUB_SHA) {
    commitHash = `-${process.env.GITHUB_SHA.substring(0, 7)}`;
  }
  
  return `lambda-deployments/${functionName}/${timestamp}${commitHash}.zip`;
}

async function checkBucketExists(s3Client, bucketName) {
  try {
    const command = new HeadBucketCommand({ Bucket: bucketName });
    await s3Client.send(command);
    core.info(`S3 bucket ${bucketName} exists`);
    return true;
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound') {
      core.info(`S3 bucket ${bucketName} does not exist`);
      return false;
    }

    core.error(`Error checking if bucket exists: ${error.$metadata?.httpStatusCode || error.name} - ${error.message}`);
    core.error(`Error details: ${JSON.stringify({
      code: error.code,
      name: error.name,
      message: error.message,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId
    })}`);
    
    if (error.$metadata?.httpStatusCode === 301) {
      core.error(`REGION MISMATCH ERROR: The bucket "${bucketName}" exists but in a different region than specified (${s3Client.config.region}). S3 buckets are global but region-specific. `);
      throw new Error(`Bucket "${bucketName}" exists in a different region than ${s3Client.config.region}`);
    } else if (error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403) {
      core.error('Access denied.');
    }
    throw error;
  }
}

async function createBucket(s3Client, bucketName, region) {
  core.info(`Creating S3 bucket: ${bucketName}`);
  
  try {
    if (!validateBucketName(bucketName)) {
      throw new Error(`Invalid bucket name: "${bucketName}". Bucket names must be 3-63 characters, lowercase, start/end with a letter/number, and contain only letters, numbers, dots, and hyphens.`);
    }
    
    const input = {
      Bucket: bucketName,
      ...(region !== 'us-east-1' && { 
        CreateBucketConfiguration: { 
          LocationConstraint: region 
        }
      })
    };
    
    core.info(`Sending CreateBucket request for bucket: ${bucketName} in region: ${region}`);
    const command = new CreateBucketCommand(input);
    
    try {
      const response = await s3Client.send(command);
      core.info(`Successfully created S3 bucket: ${bucketName}`);
      core.info(`Bucket location: ${response.Location}`);
      
      return true;
    } catch (sendError) {
      core.error(`Error creating bucket: ${sendError.name} - ${sendError.message}`);
      core.error(`Error details: ${JSON.stringify({
        code: sendError.code,
        name: sendError.name,
        message: sendError.message,
        statusCode: sendError.$metadata?.httpStatusCode,
        requestId: sendError.$metadata?.requestId
      })}`);
      
      if (sendError.name === 'BucketAlreadyExists' || sendError.name === 'BucketAlreadyOwnedByYou') {
        core.warning(`Bucket name ${bucketName} is already taken but may be owned by another account.`);
        throw sendError;
      } else if (sendError.$metadata?.httpStatusCode === 403) {
        core.error('Access denied when creating bucket. Check your IAM permissions for s3:CreateBucket.');
        throw new Error(`Access denied when creating bucket ${bucketName}. Ensure your IAM policy includes s3:CreateBucket permission.`);
      } else if (sendError.name === 'InvalidBucketName') {
        core.error(`The bucket name "${bucketName}" is invalid. See s3-troubleshooting.md for S3 bucket naming rules.`);
      }
      throw sendError;
    }
  } catch (error) {
    core.error(`Failed to create S3 bucket: ${error.name} - ${error.message}`);
    throw error;
  }
}

function validateBucketName(name) {
  if (!name || typeof name !== 'string') return false;
  
  if (name.length < 3 || name.length > 63) return false;
  
  if (!/^[a-z0-9.-]+$/.test(name)) return false;
  
  if (!/^[a-z0-9].*[a-z0-9]$/.test(name)) return false;
  
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(name)) return false;
  
  if (/\.\./.test(name)) return false;
  
  if (/^xn--/.test(name)) return false;
  
  if (/^sthree-/.test(name)) return false;
  
  if (/^sthree-configurator/.test(name)) return false;
  
  if (/^amzn-s3-demo-bucket/.test(name)) return false;
  
  return true;
}

async function uploadToS3(zipFilePath, bucketName, s3Key, region) {
  core.info(`Uploading Lambda deployment package to S3: s3://${bucketName}/${s3Key}`);
  
  try {
    const s3Client = new S3Client({ region });
    let bucketExists = false;
    try {
      bucketExists = await checkBucketExists(s3Client, bucketName);
    } catch (checkError) {
      core.error(`Failed to check if bucket exists: ${checkError.name} - ${checkError.message}`);
      core.error(`Error type: ${checkError.name}, Code: ${checkError.code}`);
      
      if (checkError.$metadata?.httpStatusCode === 403) {
        throw new Error(`Access denied when checking bucket. Ensure your IAM policy includes s3:HeadBucket permission for bucket: ${bucketName}`);
      } else {
        throw checkError;
      }
    }
    
    if (!bucketExists) {
      core.info(`Bucket ${bucketName} does not exist. Attempting to create it...`);
      try {
        await createBucket(s3Client, bucketName, region);
        core.info(`Bucket ${bucketName} created successfully.`);
      } catch (bucketError) {
        core.error(`Failed to create bucket ${bucketName}: ${bucketError.message}`);
        core.error(`Error details: ${JSON.stringify({
          code: bucketError.code,
          name: bucketError.name,
          message: bucketError.message,
          statusCode: bucketError.$metadata?.httpStatusCode
        })}`);
        
        if (bucketError.name === 'BucketAlreadyExists' || bucketError.name === 'BucketAlreadyOwnedByYou') {
          core.info(`Bucket name ${bucketName} is already taken. Please try a different name.`);
        } else if (bucketError.$metadata?.httpStatusCode === 403) {
          throw new Error(`Access denied when creating bucket. Ensure your IAM policy includes s3:CreateBucket permission.`);
        }
        throw bucketError;
      }
    }

    try {
      await fs.access(zipFilePath);
      core.info(`Deployment package verified at ${zipFilePath}`);
    } catch (fileError) {
      throw new Error(`Cannot access deployment package at ${zipFilePath}: ${fileError.message}`);
    }
    
    const fileContent = await fs.readFile(zipFilePath);
    core.info(`Read deployment package, size: ${fileContent.length} bytes`);
    
    try {
      const input = {
        Bucket: bucketName,
        Key: s3Key,
        Body: fileContent
      };
      
      core.info(`Sending PutObject request to S3 (bucket: ${bucketName}, key: ${s3Key})`);
      const command = new PutObjectCommand(input);
      const response = await s3Client.send(command);
      
      core.info(`S3 upload successful, file size: ${fileContent.length} bytes`);
      
      return {
        bucket: bucketName,
        key: s3Key,
        versionId: response.VersionId 
      };
    } catch (uploadError) {
      core.error(`Failed to upload file to S3: ${uploadError.name} - ${uploadError.message}`);
      core.error(`Upload error details: ${JSON.stringify({
        code: uploadError.code,
        name: uploadError.name,
        message: uploadError.message,
        statusCode: uploadError.$metadata?.httpStatusCode,
        requestId: uploadError.$metadata?.requestId
      })}`);
      
      if (uploadError.$metadata?.httpStatusCode === 403) {
        throw new Error('Access denied when uploading to S3. Ensure your IAM policy includes s3:PutObject permission.');
      }
      throw uploadError;
    }
    
  } catch (error) {
    core.error(`S3 upload failed: ${error.name} - ${error.message}`);
    
    if (error.code === 'NoSuchBucket') {
      core.error(`Bucket ${bucketName} does not exist and could not be created automatically. Please create it manually or check your permissions.`);
    } else if (error.code === 'AccessDenied' || error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403) {
      core.error('Access denied. Ensure your AWS credentials have the following permissions:');
      core.error('- s3:HeadBucket (to check if the bucket exists)');
      core.error('- s3:CreateBucket (to create the bucket if it doesn\'t exist)');
      core.error('- s3:PutObject (to upload the file to the bucket)');
      core.error('See s3-troubleshooting.md for a complete IAM policy template.');
    } else if (error.name === 'CredentialsProviderError') {
      core.error('AWS credentials not found or invalid. Check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
    } else if (error.name === 'InvalidBucketName') {
      core.error(`Invalid bucket name: ${bucketName}. Bucket names must follow S3 naming rules.`);
      core.error('See s3-troubleshooting.md for S3 bucket naming rules.');
    }
    
    throw error;
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
  deepEqual,
  generateS3Key,
  uploadToS3,
  checkBucketExists,
  createBucket,
  checkS3Access,
  validateBucketName
};
