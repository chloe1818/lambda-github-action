const core = require('@actions/core');
const path = require('path');

function validateNumericInputs() {
  const ephemeralStorageInput = core.getInput('ephemeral-storage', { required: false });
  const ephemeralStorage = parseInt(ephemeralStorageInput);
  if (ephemeralStorageInput && isNaN(ephemeralStorage)) {
    core.setFailed(`Ephemeral storage must be a number, got: ${ephemeralStorageInput}`);
    return { valid: false };
  }

  const memorySize = core.getInput('memory-size', { required: false });
  let parsedMemorySize;
  if (memorySize !== '') {
    parsedMemorySize = parseInt(memorySize);
    if (isNaN(parsedMemorySize)) {
      core.setFailed(`Memory size must be a number, got: ${memorySize}`);
      return { valid: false };
    }
  }

  const timeoutInput = core.getInput('timeout', { required: false });
  const timeout = parseInt(timeoutInput);
  if (timeoutInput && isNaN(timeout)) {
    core.setFailed(`Timeout must be a number, got: ${timeoutInput}`);
    return { valid: false };
  }

  return { 
    valid: true, 
    ephemeralStorage, 
    parsedMemorySize, 
    timeout 
  };
}

function validateRequiredInputs() {
  const functionName = core.getInput('function-name', { required: true });
  if (!functionName) {
    core.setFailed('Function name must be provided');
    return { valid: false };
  }

  const codeArtifactsDir = core.getInput('code-artifacts-dir');
  if (!codeArtifactsDir) {
    core.setFailed('Code-artifacts-dir must be provided');
    return { valid: false };
  }

  let handler = core.getInput('handler', { required: true });
  handler = handler || 'index.handler'; 
  
  let runtime = core.getInput('runtime', { required: true });
  runtime = runtime || 'node20js.x'; 

  return { 
    valid: true, 
    functionName, 
    codeArtifactsDir,
    handler,
    runtime
  };
}

function validateArnInputs() {
  const role = core.getInput('role', { required: false });
  const codeSigningConfigArn = core.getInput('code-signing-config-arn', { required: false });
  const kmsKeyArn = core.getInput('kms-key-arn', { required: false });
  const sourceKmsKeyArn = core.getInput('source-kms-key-arn', { required: false });
  
  if (role && !validateRoleArn(role)) {
    return { valid: false };
  }
  
  if (codeSigningConfigArn && !validateCodeSigningConfigArn(codeSigningConfigArn)) {
    return { valid: false };
  }
  
  if (kmsKeyArn && !validateKmsKeyArn(kmsKeyArn)) {
    return { valid: false };
  }
  
  if (sourceKmsKeyArn && !validateKmsKeyArn(sourceKmsKeyArn)) {
    return { valid: false };
  }

  return {
    valid: true,
    role,
    codeSigningConfigArn,
    kmsKeyArn,
    sourceKmsKeyArn
  };
}

function validateJsonInputs() {
  const environment = core.getInput('environment', { required: false });
  const vpcConfig = core.getInput('vpc-config', { required: false });
  const deadLetterConfig = core.getInput('dead-letter-config', { required: false });
  const tracingConfig = core.getInput('tracing-config', { required: false });
  const layers = core.getInput('layers', { required: false });
  const fileSystemConfigs = core.getInput('file-system-configs', { required: false });
  const imageConfig = core.getInput('image-config', { required: false });
  const snapStart = core.getInput('snap-start', { required: false });
  const loggingConfig = core.getInput('logging-config', { required: false });
  const tags = core.getInput('tags', { required: false });
  
  let parsedEnvironment, parsedVpcConfig, parsedDeadLetterConfig, parsedTracingConfig,
    parsedLayers, parsedFileSystemConfigs, parsedImageConfig, parsedSnapStart,
    parsedLoggingConfig, parsedTags;

  try {
    if (environment) {
      parsedEnvironment = parseJsonInput(environment, 'environment');
    }
    
    if (vpcConfig) {
      parsedVpcConfig = parseJsonInput(vpcConfig, 'vpc-config');
      if (!parsedVpcConfig.SubnetIds || !Array.isArray(parsedVpcConfig.SubnetIds)) {
        throw new Error("vpc-config must include 'SubnetIds' as an array");
      }
      if (!parsedVpcConfig.SecurityGroupIds || !Array.isArray(parsedVpcConfig.SecurityGroupIds)) {
        throw new Error("vpc-config must include 'SecurityGroupIds' as an array");
      }
    }
    
    if (deadLetterConfig) {
      parsedDeadLetterConfig = parseJsonInput(deadLetterConfig, 'dead-letter-config');
      if (!parsedDeadLetterConfig.TargetArn) {
        throw new Error("dead-letter-config must include 'TargetArn'");
      }
    }
    
    if (tracingConfig) {
      parsedTracingConfig = parseJsonInput(tracingConfig, 'tracing-config');
      if (!parsedTracingConfig.Mode || !['Active', 'PassThrough'].includes(parsedTracingConfig.Mode)) {
        throw new Error("tracing-config Mode must be 'Active' or 'PassThrough'");
      }
    }
    
    if (layers) {
      parsedLayers = parseJsonInput(layers, 'layers');
      if (!Array.isArray(parsedLayers)) {
        throw new Error("layers must be an array of layer ARNs");
      }
    }
    
    if (fileSystemConfigs) {
      parsedFileSystemConfigs = parseJsonInput(fileSystemConfigs, 'file-system-configs');
      if (!Array.isArray(parsedFileSystemConfigs)) {
        throw new Error("file-system-configs must be an array");
      }
      for (const config of parsedFileSystemConfigs) {
        if (!config.Arn || !config.LocalMountPath) {
          throw new Error("Each file-system-config must include 'Arn' and 'LocalMountPath'");
        }
      }
    }
    
    if (imageConfig) {
      parsedImageConfig = parseJsonInput(imageConfig, 'image-config');
    }
    
    if (snapStart) {
      parsedSnapStart = parseJsonInput(snapStart, 'snap-start');
      if (!parsedSnapStart.ApplyOn || !['PublishedVersions', 'None'].includes(parsedSnapStart.ApplyOn)) {
        throw new Error("snap-start ApplyOn must be 'PublishedVersions' or 'None'");
      }
    }
    
    if (loggingConfig) {
      parsedLoggingConfig = parseJsonInput(loggingConfig, 'logging-config');
    }
    
    if (tags) {
      parsedTags = parseJsonInput(tags, 'tags');
      if (typeof parsedTags !== 'object' || Array.isArray(parsedTags)) {
        throw new Error("tags must be an object of key-value pairs");
      }
    }
  } catch (error) {
    core.setFailed(`Input validation error: ${error.message}`);
    return { valid: false };
  }

  return {
    valid: true,
    environment,
    vpcConfig,
    deadLetterConfig,
    tracingConfig,
    layers,
    fileSystemConfigs, 
    imageConfig,
    snapStart,
    loggingConfig,
    tags,
    parsedEnvironment,
    parsedVpcConfig,
    parsedDeadLetterConfig,
    parsedTracingConfig,
    parsedLayers,
    parsedFileSystemConfigs,
    parsedImageConfig, 
    parsedSnapStart,
    parsedLoggingConfig,
    parsedTags
  };
}

function getAdditionalInputs() {
  const functionDescription = core.getInput('function-description', { required: false });
  const dryRun = core.getBooleanInput('dry-run', { required: false }) || false;
  let publish = false;
  const revisionId = core.getInput('revision-id', { required: false });
  const architectures = core.getInput('architectures', { required: false });
  const s3Bucket = core.getInput('s3-bucket', { required: false });
  let s3Key = core.getInput('s3-key', { required: false });

  try {
    publish = core.getBooleanInput('publish', { required: false });
  } catch (error) {
    publish = false;
  }

  const useS3Method = !!s3Bucket;

  return {
    functionDescription,
    dryRun,
    publish,
    revisionId,
    architectures,
    s3Bucket,
    s3Key,
    useS3Method
  };
}

function parseJsonInput(jsonString, inputName) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON in ${inputName} input: ${error.message}`);
  }
}

function validateRoleArn(arn) {
  const rolePattern = /^arn:aws(-[a-z0-9-]+)?:iam::[0-9]{12}:role\/[a-zA-Z0-9+=,.@_\/-]+$/;
  
  if (!rolePattern.test(arn)) {
    core.setFailed(`Invalid IAM role ARN format: ${arn}`);
    return false;
  }
  return true;
}

function validateCodeSigningConfigArn(arn) {
  const cscPattern = /^arn:aws(-[a-z0-9-]+)?:lambda:[a-z0-9-]+:[0-9]{12}:code-signing-config:[a-zA-Z0-9-]+$/;

  if (!cscPattern.test(arn)) {
    core.setFailed(`Invalid code signing config ARN format: ${arn}`);
    return false;
  }
  return true;
}

function validateKmsKeyArn(arn) {
  const kmsPattern = /^arn:aws(-[a-z0-9-]+)?:kms:[a-z0-9-]+:[0-9]{12}:key\/[a-zA-Z0-9-]+$/;
  
  if (!kmsPattern.test(arn)) {
    core.setFailed(`Invalid KMS key ARN format: ${arn}`);
    return false;
  }
  return true;
}

function validateAndResolvePath(userPath, basePath) {
  const normalizedPath = path.normalize(userPath);
  const resolvedPath = path.isAbsolute(normalizedPath) ? normalizedPath : path.resolve(basePath, normalizedPath);
  const relativePath = path.relative(basePath, resolvedPath);

  if (relativePath && (relativePath.startsWith('..') || path.isAbsolute(relativePath))) {
    throw new Error(
      `Security error: Path traversal attempt detected. ` +
      `The path '${userPath}' resolves to '${resolvedPath}' which is outside the allowed directory '${basePath}'.`
    );
  }
  return resolvedPath;
}

function validateAllInputs() {
  const requiredInputs = validateRequiredInputs();
  if (!requiredInputs.valid) {
    return { valid: false };
  }
  
  const numericInputs = validateNumericInputs();
  if (!numericInputs.valid) {
    return { valid: false };
  }
  
  const arnInputs = validateArnInputs();
  if (!arnInputs.valid) {
    return { valid: false };
  }
  
  const jsonInputs = validateJsonInputs();
  if (!jsonInputs.valid) {
    return { valid: false };
  }
  
  const additionalInputs = getAdditionalInputs();
  
  return {
    valid: true,
    ...requiredInputs,
    ...numericInputs,
    ...arnInputs,
    ...jsonInputs,
    ...additionalInputs
  };
}

module.exports = {
  validateAllInputs,
  parseJsonInput,
  validateRoleArn,
  validateCodeSigningConfigArn,
  validateKmsKeyArn,
  validateAndResolvePath,
  getAdditionalInputs
};
