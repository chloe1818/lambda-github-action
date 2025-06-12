const core = require('@actions/core');
const { LambdaClient, CreateFunctionCommand, GetFunctionCommand, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand, UpdateFunctionCodeCommand, waitUntilFunctionUpdated } = require('@aws-sdk/client-lambda');
const fs = require('fs/promises'); 
const path = require('path');
const AdmZip = require('adm-zip');
const validations = require('./validations');
const { toBase64 } = require('@smithy/util-base64');

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
        core.info(`Type: ${typeof zipFileContent}, isBuffer: ${Buffer.isBuffer(zipFileContent)}, isUint8Array: ${zipFileContent instanceof Uint8Array}`);
 
        core.info('Creating Lambda function with deployment package');

        let input = {
          FunctionName: functionName,
          Runtime: runtime,
          Role: role,
          Handler: handler,
          Code: {
            ZipFile: zipFileContent
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
    });

    // Update Function Configuration
    if (configChanged) {
      if (dryRun) {
        core.info('[DRY RUN] Configuration updates are not simulated in dry run mode');
        return;
      } 

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
    
      let codeInput = {
        FunctionName: functionName,
        ZipFile: zipFileContent,
        Architectures: architectures ? (Array.isArray(architectures) ? architectures : [architectures]) : undefined,
        Publish: publish,
        RevisionId: revisionId,
        SourceKmsKeyArn: sourceKmsKeyArn,
      };
      
      core.info(`Original buffer length: ${zipFileContent.length} bytes`);
      
      codeInput = cleanNullKeys(codeInput);
      
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

// async function packageCodeArtifacts(artifactsDir) {
//   const tempDir = path.join(process.cwd(), 'lambda-package');
//   const zipPath = path.join(process.cwd(), 'lambda-function.zip');

//   try {
//     // Clean up and recreate temp directory
//     try {
//       await fs.rm(tempDir, { recursive: true, force: true });
//     } catch (error) {
//       // Ignore errors if directory doesn't exist
//     }
    
//     await fs.mkdir(tempDir, { recursive: true });

//     // Resolve the artifacts directory path - handle both absolute and relative paths
//     const resolvedArtifactsDir = path.isAbsolute(artifactsDir) 
//       ? artifactsDir 
//       : path.resolve(process.cwd(), artifactsDir);
    
//     core.info(`Copying artifacts from ${resolvedArtifactsDir} to ${tempDir}`);
    
//     // Check if directory exists before trying to read it
//     try {
//       await fs.access(resolvedArtifactsDir);
//     } catch (error) {
//       throw new Error(`Code artifacts directory '${resolvedArtifactsDir}' does not exist or is not accessible: ${error.message}`);
//     }
    
//     const sourceFiles = await fs.readdir(resolvedArtifactsDir);
    
//     if (sourceFiles.length === 0) {
//       throw new Error(`Code artifacts directory '${resolvedArtifactsDir}' is empty, no files to package`);
//     }
    
//     core.info(`Found ${sourceFiles.length} files/directories to copy`);
    
//     for (const file of sourceFiles) {
//       const sourcePath = path.join(resolvedArtifactsDir, file);
//       const destPath = path.join(tempDir, file);
      
//       core.info(`Copying ${sourcePath} to ${destPath}`);
      
//       await fs.cp(
//         sourcePath,
//         destPath,
//         { recursive: true }
//       );
//     }

//     // Use a completely different approach to create the zip file
//     // We'll use the Node.js child_process to call system zip command
//     // which has better compatibility with AWS Lambda
//     const { execSync } = require('child_process');
    
//     try {
//       core.info('Creating ZIP file using system zip command');
      
//       // First, check if zip command exists
//       try {
//         execSync('which zip', { stdio: 'pipe' });
//         core.info('Zip command found, proceeding with zip creation');
//       } catch (err) {
//         core.info('Zip command not found, falling back to AdmZip');
//         // Fall back to AdmZip if zip command not found
//         const zip = new AdmZip();
//         const tempFiles = await fs.readdir(tempDir, { withFileTypes: true });
        
//         for (const file of tempFiles) {
//           const fullPath = path.join(tempDir, file.name);
          
//           if (file.isDirectory()) {
//             core.info(`Adding directory: ${file.name}`);
//             zip.addLocalFolder(fullPath, file.name);
//           } else {
//             core.info(`Adding file: ${file.name}`);
//             zip.addLocalFile(fullPath);
//           }
//         }
        
//         zip.writeZip(zipPath);
        
//         core.info(`ZIP file created using AdmZip`);
//         return zipPath;
//       }
      
//       // Create the zip file using system zip command
//       // Change to the tempDir first so files are at the root of the zip
//       const zipCommand = `cd "${tempDir}" && zip -r "${zipPath}" ./*`;
//       core.info(`Executing: ${zipCommand}`);
      
//       execSync(zipCommand, { stdio: 'inherit' });
      
//       // Verify the zip file was created
//       const stats = await fs.stat(zipPath);
//       core.info(`ZIP file created using system zip command: ${zipPath} (${stats.size} bytes)`);
//     } catch (error) {
//       core.error(`Error creating zip with system command: ${error.message}`);
      
//       // Fall back to simple approach with AdmZip as last resort
//       core.info('Falling back to simple approach with AdmZip');
//       const fallbackZip = new AdmZip();
      
//       // Just add all files directly with no special options
//       const tempFiles = await fs.readdir(tempDir);
//       for (const file of tempFiles) {
//         const fullPath = path.join(tempDir, file);
//         const stat = await fs.stat(fullPath);
        
//         if (stat.isDirectory()) {
//           core.info(`Adding directory (simple): ${file}`);
//           fallbackZip.addLocalFolder(fullPath, file);
//         } else {
//           core.info(`Adding file (simple): ${file}`);
//           fallbackZip.addLocalFile(fullPath);
//         }
//       }
      
//       fallbackZip.writeZip(zipPath);
//     }
    
//     // Verify the ZIP file is not empty
//     try {
//       const stats = await fs.stat(zipPath);
//       if (stats.size === 0 || stats.size < 100) { // Basic check for very small files
//         throw new Error(`Generated ZIP file is empty or too small (${stats.size} bytes)`);
//       }
      
//       // Check ZIP content
//       const zipCheck = new AdmZip(zipPath);
//       const entries = zipCheck.getEntries();
      
//       if (entries.length === 0) {
//         throw new Error('Generated ZIP file contains no files');
//       }
      
//       core.info(`ZIP file created successfully with ${entries.length} files (${stats.size} bytes)`);
//     } catch (error) {
//       throw new Error(`Failed to verify the created ZIP file: ${error.message}`);
//     }
    
//     return zipPath;
//   } catch (error) {
//     core.error(`Failed to package artifacts: ${error.message}`);
//     throw error;
//   }
// }

async function packageCodeArtifacts(artifactsDir) {
  const tempDir = path.join(process.cwd(), 'lambda-package');
  const zipPath = path.join(process.cwd(), 'lambda-function.zip');
  
  try {
    // Clean up and recreate temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
    
    await fs.mkdir(tempDir, { recursive: true });

    // Resolve the artifacts directory path - handle both absolute and relative paths
    const resolvedArtifactsDir = path.isAbsolute(artifactsDir) 
      ? artifactsDir 
      : path.resolve(process.cwd(), artifactsDir);
    
    core.info(`Copying artifacts from ${resolvedArtifactsDir} to ${tempDir}`);
    
    // Check if directory exists before trying to read it
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

    core.info('Creating ZIP file with careful structure');
    // Create ZIP file with explicit options for AWS compatibility
    const zip = new AdmZip();
    
    // Add files individually to maintain proper structure
    const tempFiles = await fs.readdir(tempDir, { withFileTypes: true });
    
    for (const file of tempFiles) {
      const fullPath = path.join(tempDir, file.name);
      
      if (file.isDirectory()) {
        core.info(`Adding directory: ${file.name}`);
        // Use entryName "" to place contents at root level of ZIP
        zip.addLocalFolder(fullPath, file.name);
      } else {
        core.info(`Adding file: ${file.name}`);
        // Add to root of ZIP
        zip.addLocalFile(fullPath);
      }
    }
    
    // Use a more compatible ZIP format with explicit options
    core.info('Writing ZIP file with standard options');
    zip.writeZip(zipPath);
    
    // Verify the ZIP file
    try {
      const stats = await fs.stat(zipPath);
      core.info(`Generated ZIP file size: ${stats.size} bytes`);
      
      // Verify ZIP content can be read back
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

async function hasConfigurationChanged(currentConfig, updatedConfig) {
  if (!currentConfig || Object.keys(currentConfig).length === 0) {
    return true;
  }
  
  const cleanedCurrent = cleanNullKeys(currentConfig);
  const cleanedUpdated = cleanNullKeys(updatedConfig);
  
  let hasChanged = false;
  
  for (const [key, value] of Object.entries(cleanedUpdated)) {
    if (value !== undefined) {
      // Check if this is a new parameter not in the current config
      if (!(key in cleanedCurrent)) {
        core.info(`Configuration difference detected in ${key}`);
        hasChanged = true;
        continue;
      }
      
      if (typeof value === 'object' && value !== null) {
        if (!deepEqual(cleanedCurrent[key] || {}, value)) {
          core.info(`Configuration difference detected in ${key}`);
          hasChanged = true;
        }
      } else if (cleanedCurrent[key] !== value) {
        core.info(`Configuration difference detected in ${key}: ${cleanedCurrent[key]} -> ${value}`);
        hasChanged = true;
      }
    }
  }

  return hasChanged;
}

function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  
  if (typeof obj1 !== 'object' || obj1 === null ||
      typeof obj2 !== 'object' || obj2 === null) {
    return false;
  }
  
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    
    if (obj1.every(item => typeof item !== 'object' || item === null) &&
        obj2.every(item => typeof item !== 'object' || item === null)) {
      const sorted1 = [...obj1].sort();
      const sorted2 = [...obj2].sort();
      return sorted1.every((val, idx) => val === sorted2[idx]);
    }
    
    return obj1.every((val, idx) => deepEqual(val, obj2[idx]));
  }
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  return keys1.every(key => 
    keys2.includes(key) && deepEqual(obj1[key], obj2[key])
  );
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
    if (value.length === 0) return true;
    
    for (var element of value) {
      if (!isEmptyValue(element)) {
        return false;
      }
    }
    return true;
  }

  if (typeof value === 'object') {
    // An empty object should return true
    if (Object.keys(value).length === 0) return true;
    
    for (var childValue of Object.values(value)) {
      if (!isEmptyValue(childValue)) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function emptyValueReplacer(key, value) {
  if (key === 'VpcConfig' && typeof value === 'object' && value !== null) {
    return value;
  }
  
  if (['SubnetIds', 'SecurityGroupIds'].includes(key) && Array.isArray(value)) {
    return value; 
  }
  
  if (isEmptyValue(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const filtered = value.filter(e => !isEmptyValue(e));
    return filtered.length ? filtered : undefined;
  }

  return value;
}

function cleanNullKeys(obj) {
  if (!obj) return obj;
  
  if (obj.VpcConfig && typeof obj.VpcConfig === 'object') {
    const { VpcConfig, ...rest } = obj;
    
    const cleanedRest = cleanRestOfObject(rest);
    
    const cleanedVpcConfig = {
      SubnetIds: Array.isArray(VpcConfig.SubnetIds) ? VpcConfig.SubnetIds : [],
      SecurityGroupIds: Array.isArray(VpcConfig.SecurityGroupIds) ? VpcConfig.SecurityGroupIds : []
    };
    
    return { ...cleanedRest, VpcConfig: cleanedVpcConfig };
  }
  
  return cleanRestOfObject(obj);
}

function cleanRestOfObject(obj) {
  if (Array.isArray(obj)) {
    const filtered = obj.filter(item => !isEmptyValue(item));
    return filtered.length ? filtered : [];
  }
  
  const stringified = JSON.stringify(obj, emptyValueReplacer);
  
  if (stringified === undefined || stringified === 'undefined' || stringified === 'null') {
    return {};
  }
  
  try {
    return JSON.parse(stringified);
  } catch (error) {
    core.debug(`Error parsing cleaned object: ${error.message}`);
    return {};
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
