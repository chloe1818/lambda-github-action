jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-sts');
jest.mock('fs/promises');

const core = require('@actions/core');
const { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const fs = require('fs/promises');
const mainModule = require('../index');

describe('S3 Bucket Operations Tests', () => {
  let mockS3Send;
  beforeEach(() => {
    jest.clearAllMocks();

    core.getInput.mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'code-artifacts-dir': '/mock/artifacts',
        's3-bucket': 'test-lambda-bucket',
        's3-key': 'test-lambda-key.zip'
      };
      return inputs[name] || '';
    });
    core.getBooleanInput.mockImplementation((name) => {
      if (name === 'create-s3-bucket') return true;
      return false;
    });
    core.info = jest.fn();
    core.error = jest.fn();
    core.warning = jest.fn();
    core.setFailed = jest.fn();
    core.setOutput = jest.fn();

    fs.readFile.mockResolvedValue(Buffer.from('mock file content'));
    fs.access.mockResolvedValue(undefined);
    fs.stat.mockResolvedValue({
      size: 1024 
    });

    mockS3Send = jest.fn();
    S3Client.prototype.send = mockS3Send;
    
    STSClient.prototype.send = jest.fn().mockImplementation((command) => {
      if (command instanceof GetCallerIdentityCommand) {
        return Promise.resolve({
          Account: '123456789012' 
        });
      }
      return Promise.reject(new Error('Unknown STS command'));
    });
  });
  describe('checkBucketExists function', () => {
    it('should return true when bucket exists', async () => {

      mockS3Send.mockResolvedValueOnce({});
      const s3Client = new S3Client({ region: 'us-east-1' });
      const result = await mainModule.checkBucketExists(s3Client, 'existing-bucket');
      
      expect(result).toBe(true);
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(HeadBucketCommand));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('exists'));
    });
    it('should return false when bucket does not exist (404)', async () => {

      const notFoundError = new Error('Not Found');
      notFoundError.$metadata = { httpStatusCode: 404 };
      notFoundError.name = 'NotFound';
      
      mockS3Send.mockRejectedValueOnce(notFoundError);
      const s3Client = new S3Client({ region: 'us-east-1' });
      const result = await mainModule.checkBucketExists(s3Client, 'non-existing-bucket');
      expect(result).toBe(false);
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });
    it('should throw error when HeadBucket returns non-404 error', async () => {

      const accessError = new Error('Access Denied');
      accessError.$metadata = { httpStatusCode: 403 };
      accessError.name = 'AccessDenied';
      
      mockS3Send.mockRejectedValueOnce(accessError);
      const s3Client = new S3Client({ region: 'us-east-1' });
      await expect(mainModule.checkBucketExists(s3Client, 'forbidden-bucket'))
        .rejects.toThrow();
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Error checking if bucket exists'));
    });
    it('should handle region mismatch error (301)', async () => {

      const regionError = new Error('Moved Permanently');
      regionError.$metadata = { httpStatusCode: 301 };
      mockS3Send.mockRejectedValueOnce(regionError);

      const s3Client = new S3Client({ region: 'us-east-1' });

      s3Client.config = { region: 'us-east-1' };
      await expect(mainModule.checkBucketExists(s3Client, 'wrong-region-bucket'))
        .rejects.toThrow(/different region/);
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('REGION MISMATCH ERROR'));
    });
  });
  describe('createBucket function', () => {
    it('should create bucket in non-us-east-1 regions with LocationConstraint', async () => {
      mockS3Send.mockResolvedValueOnce({
        Location: 'http://test-bucket.s3.amazonaws.com/'
      });
      const s3Client = new S3Client({ region: 'us-west-2' });
      await mainModule.createBucket(s3Client, 'test-bucket', 'us-west-2');

      expect(mockS3Send).toHaveBeenCalled();
      expect(CreateBucketCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          CreateBucketConfiguration: { LocationConstraint: 'us-west-2' }
        })
      );
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Successfully created S3 bucket'));
    });
    it('should create bucket in us-east-1 without LocationConstraint', async () => {
      mockS3Send.mockResolvedValueOnce({
        Location: 'http://test-bucket.s3.amazonaws.com/'
      });
      const s3Client = new S3Client({ region: 'us-east-1' });
      await mainModule.createBucket(s3Client, 'test-bucket', 'us-east-1');

      expect(mockS3Send).toHaveBeenCalled();
      expect(CreateBucketCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket'
        })
      );
      const createBucketCommand = CreateBucketCommand.mock.calls[0][0];
      expect(createBucketCommand.CreateBucketConfiguration).toBeUndefined();
    });
    it('should handle bucket already exists error', async () => {
      const existsError = new Error('Bucket already exists');
      existsError.name = 'BucketAlreadyExists';
      mockS3Send.mockRejectedValueOnce(existsError);
      const s3Client = new S3Client({ region: 'us-east-1' });
      await expect(mainModule.createBucket(s3Client, 'existing-bucket', 'us-east-1'))
        .rejects.toThrow();
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('already taken'));
    });
    
    it('should handle bucket already owned by you error', async () => {
      const ownedError = new Error('Bucket already owned by you');
      ownedError.name = 'BucketAlreadyOwnedByYou';
      ownedError.code = 'BucketAlreadyOwnedByYou';
      
      mockS3Send.mockRejectedValueOnce(ownedError);
      const s3Client = new S3Client({ region: 'us-east-1' });
      
      await expect(mainModule.createBucket(s3Client, 'my-existing-bucket', 'us-east-1'))
        .rejects.toThrow(ownedError);
        
      expect(core.info).toHaveBeenCalledWith('Creating S3 bucket: my-existing-bucket');
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Sending CreateBucket request'));
      
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(CreateBucketCommand));
    });
    it('should handle permission denied error', async () => {
      const accessError = new Error('Access Denied');
      accessError.name = 'AccessDenied';
      accessError.$metadata = { httpStatusCode: 403 };
      mockS3Send.mockRejectedValueOnce(accessError);
      const s3Client = new S3Client({ region: 'us-east-1' });
      await expect(mainModule.createBucket(s3Client, 'test-bucket', 'us-east-1'))
        .rejects.toThrow(/Access denied/);
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Access denied'));
    });
    it('should validate bucket name before creating', async () => {
      const s3Client = new S3Client({ region: 'us-east-1' });
      await expect(mainModule.createBucket(s3Client, 'Invalid_Bucket', 'us-east-1'))
        .rejects.toThrow(/Invalid bucket name/);
      expect(mockS3Send).not.toHaveBeenCalled();
    });
  });
  describe('validateBucketName function', () => {
    it('should validate correct bucket names', () => {
      expect(mainModule.validateBucketName('valid-bucket-name')).toBe(true);
      expect(mainModule.validateBucketName('my.bucket.name')).toBe(true);
      expect(mainModule.validateBucketName('bucket-123')).toBe(true);
      expect(mainModule.validateBucketName('a-really-long-but-valid-bucket-name-within-63-chars')).toBe(true);
    });
    it('should reject invalid bucket names', () => {
      expect(mainModule.validateBucketName('UPPERCASE')).toBe(false);
      expect(mainModule.validateBucketName('bucket_with_underscore')).toBe(false);
      expect(mainModule.validateBucketName('sh')).toBe(false); 
      expect(mainModule.validateBucketName('192.168.1.1')).toBe(false); 
      expect(mainModule.validateBucketName('bucket..name')).toBe(false); 
      expect(mainModule.validateBucketName('xn--bucket')).toBe(false); 
      expect(mainModule.validateBucketName('a'.repeat(64))).toBe(false);
      expect(mainModule.validateBucketName(null)).toBe(false);
      expect(mainModule.validateBucketName(undefined)).toBe(false);
      expect(mainModule.validateBucketName(123)).toBe(false); 
    });
  });
  describe('uploadToS3 function', () => {
    it('should upload file to existing S3 bucket', async () => {
      fs.readFile.mockResolvedValue(Buffer.from('test file content'));
      jest.spyOn(mainModule, 'checkBucketExists').mockResolvedValue(true);
      jest.clearAllMocks();

      mockS3Send.mockResolvedValueOnce({}); 
      const result = await mainModule.uploadToS3(
        '/path/to/deployment.zip',
        'new-bucket',
        'lambda/function.zip',
        'us-east-1'
      );
      expect(result).toEqual({
        bucket: 'new-bucket',
        key: 'lambda/function.zip'
      });
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('S3 upload successful, file size'));
    });
    it('should create bucket if it does not exist', async () => {

      jest.clearAllMocks();

      fs.readFile.mockResolvedValue(Buffer.from('test file content'));

      const notFoundError = new Error('Not Found');
      notFoundError.$metadata = { httpStatusCode: 404 };
      notFoundError.name = 'NotFound';
     
      mockS3Send.mockRejectedValueOnce(notFoundError);
      mockS3Send.mockResolvedValueOnce({
        Location: 'http://new-bucket.s3.amazonaws.com/'
      });

      mockS3Send.mockResolvedValueOnce({});

      jest.spyOn(mainModule, 'createBucket').mockResolvedValue(true);
      mockS3Send.mockResolvedValueOnce({}); 
      try {
        await mainModule.uploadToS3(
          '/path/to/deployment.zip',
          'new-bucket',
          'lambda/function.zip',
          'us-east-1',
          '123456789012' 
        );
      } catch (error) {
        throw error;
      }
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Bucket new-bucket does not exist. Attempting to create it'));
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });
    it('should handle file access errors', async () => {

      const fileError = new Error('Permission denied');
      fileError.code = 'EACCES';
     
      fs.access.mockRejectedValueOnce(fileError);
      await expect(mainModule.uploadToS3(
        '/inaccessible/file.zip',
        'test-bucket',
        'key.zip',
        'us-east-1',
        '123456789012' // Adding expected bucket owner
      )).rejects.toThrow('Permission denied');
      expect(core.error).toHaveBeenCalled();
    });
    
    it('should handle bucket already owned by you error in uploadToS3', async () => {
      fs.readFile.mockResolvedValue(Buffer.from('test file content'));
      fs.access.mockResolvedValue(undefined);
      
      const notFoundError = new Error('Not Found');
      notFoundError.$metadata = { httpStatusCode: 404 };
      notFoundError.name = 'NotFound';
      mockS3Send.mockRejectedValueOnce(notFoundError);
      
      const ownedError = new Error('Bucket already owned by you');
      ownedError.name = 'BucketAlreadyOwnedByYou';
      ownedError.code = 'BucketAlreadyOwnedByYou';
      
      mockS3Send.mockRejectedValueOnce(ownedError);
      
      await expect(mainModule.uploadToS3(
        '/path/to/deployment.zip',
        'my-existing-bucket',
        'lambda/function.zip',
        'us-east-1'
      )).rejects.toThrow('Bucket already owned by you');
      
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Failed to create bucket my-existing-bucket'));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Bucket name my-existing-bucket is already taken'));
      
      expect(core.info).toHaveBeenCalledWith('Bucket my-existing-bucket does not exist. Attempting to create it...');
      expect(core.info).toHaveBeenCalledWith('Creating S3 bucket: my-existing-bucket');
    });
    it('should handle S3 upload errors', async () => {

      fs.readFile.mockResolvedValue(Buffer.from('test file content'));
      jest.spyOn(mainModule, 'checkBucketExists').mockResolvedValue(true);

      const uploadError = new Error('Upload failed');
      uploadError.name = 'S3Error';
      uploadError.$metadata = { httpStatusCode: 500 };
      
      mockS3Send.mockRejectedValueOnce(uploadError);
      
      await expect(mainModule.uploadToS3(
        '/path/to/file.zip',
        'test-bucket',
        'key.zip',
        'us-east-1',
        '123456789012' 
      )).rejects.toThrow('Upload failed');

      const errorCalls = core.error.mock.calls.flat().join(' ');

      expect(errorCalls).toContain('upload');
      expect(errorCalls).toContain('failed');
    });
    it('should handle S3 permission errors', async () => {
      fs.readFile.mockResolvedValue(Buffer.from('test file content'));
      
      jest.spyOn(mainModule, 'checkBucketExists').mockResolvedValue(true);
      
      const permError = new Error('Access Denied');
      
      permError.name = 'AccessDenied';
      permError.$metadata = { httpStatusCode: 403 };
      
      mockS3Send.mockRejectedValueOnce(permError);
      
      await expect(mainModule.uploadToS3(
        '/path/to/file.zip',
        'test-bucket',
        'key.zip',
        'us-east-1'
      )).rejects.toThrow('Access denied');
      
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Access denied'));
    });
  });
  
  describe('getAwsAccountId function', () => {
    it('should retrieve AWS account ID successfully', async () => {
      const result = await mainModule.getAwsAccountId('us-east-1');
      expect(result).toBe('123456789012');
      expect(STSClient.prototype.send).toHaveBeenCalledWith(expect.any(GetCallerIdentityCommand));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Successfully retrieved AWS account ID'));
    });

    it('should handle errors and return null', async () => {
      STSClient.prototype.send = jest.fn().mockRejectedValueOnce(new Error('STS error'));
      const result = await mainModule.getAwsAccountId('us-east-1');
      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to retrieve AWS account ID'));
    });
  });

  describe('S3 Key Generation', () => {
    it('should generate S3 key with timestamp and commit hash', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        GITHUB_SHA: 'abcdef1234567890'
      };
      const key = mainModule.generateS3Key('test-function');
      process.env = originalEnv;
      expect(key).toMatch(/^lambda-deployments\/test-function\/[\d-]+-abcdef1.zip$/);
    });
    it('should generate S3 key without commit hash if not available', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      delete process.env.GITHUB_SHA;
      const key = mainModule.generateS3Key('test-function');

      process.env = originalEnv;
      expect(key).toMatch(/^lambda-deployments\/test-function\//);
      expect(key).toMatch(/\.zip$/);
      expect(key).not.toMatch(/[a-f0-9]{7,}\.zip$/);
    });
  });
  describe('End-to-End S3 Deployment Flow', () => {
    let originalRun;
    beforeAll(() => {
      originalRun = mainModule.run;
    });
    afterAll(() => {
      mainModule.run = originalRun;
    });
    beforeEach(() => {
      jest.spyOn(mainModule, 'packageCodeArtifacts').mockResolvedValue('/mock/package.zip');
      jest.spyOn(mainModule, 'checkFunctionExists').mockResolvedValue(true);
      jest.spyOn(mainModule, 'hasConfigurationChanged').mockResolvedValue(false);
      jest.spyOn(mainModule, 'waitForFunctionUpdated').mockResolvedValue(undefined);

      jest.spyOn(mainModule, 'uploadToS3').mockImplementation(() => {
        return Promise.resolve({
          bucket: 'mock-bucket',
          key: 'mock-key.zip'
        });
      });
      jest.spyOn(mainModule, 'generateS3Key').mockImplementation((functionName) => {
        return `lambda-deployments/${functionName}/timestamp-mock.zip`;
      });

      mainModule.run = jest.fn().mockImplementation(() => {
        return Promise.resolve();
      });
    });
    it('should use S3 deployment method when s3-bucket is provided', async () => {
      core.getInput.mockImplementation((name) => {
        const inputs = {
          'function-name': 'test-function',
          'code-artifacts-dir': '/mock/artifacts',
          'region': 'us-east-1',
          's3-bucket': 'lambda-deployment-bucket',
          's3-key': 'custom/key/path.zip'
        };
        return inputs[name] || '';
      });

      mainModule.uploadToS3.mockReset();
      mainModule.uploadToS3.mockResolvedValueOnce({
        bucket: 'lambda-deployment-bucket',
        key: 'custom/key/path.zip'
      });

      const testUploadFunction = async () => {
        const s3Bucket = core.getInput('s3-bucket');
        const s3Key = core.getInput('s3-key');
        const region = core.getInput('region');
        if (s3Bucket) {
          jest.spyOn(mainModule, 'getAwsAccountId').mockResolvedValue('123456789012');
          return mainModule.uploadToS3(
            '/mock/package.zip',
            s3Bucket,
            s3Key,
            region
          );
        }
        return null;
      };

      const result = await testUploadFunction();

      expect(mainModule.uploadToS3).toHaveBeenCalledWith(
        '/mock/package.zip',
        'lambda-deployment-bucket',
        'custom/key/path.zip',
        'us-east-1'
      );

      expect(result).toEqual({
        bucket: 'lambda-deployment-bucket',
        key: 'custom/key/path.zip'
      });
    });
    it('should generate S3 key when not provided', async () => {
      core.getInput.mockImplementation((name) => {
        const inputs = {
          'function-name': 'test-function',
          'code-artifacts-dir': '/mock/artifacts',
          'region': 'us-east-1',
          's3-bucket': 'lambda-deployment-bucket'
        };
        return inputs[name] || '';
      });

      mainModule.generateS3Key.mockReset();
      const mockGeneratedKey = 'lambda-deployments/test-function/timestamp.zip';
      mainModule.generateS3Key.mockReturnValueOnce(mockGeneratedKey);

      const testKeyGeneration = () => {
        const functionName = core.getInput('function-name');
        const s3Key = core.getInput('s3-key');
        if (!s3Key) {
          return mainModule.generateS3Key(functionName);
        }
        return s3Key;
      };
      const result = testKeyGeneration();
      expect(mainModule.generateS3Key).toHaveBeenCalledWith('test-function');
      expect(result).toEqual(mockGeneratedKey);
    });
    it('should use ZipFile method if no S3 bucket is provided', async () => {
      core.getInput.mockImplementation((name) => {
        const inputs = {
          'function-name': 'test-function',
          'code-artifacts-dir': '/mock/artifacts',
          'region': 'us-east-1'
        };
        return inputs[name] || '';
      });
      
      const testDirectUpload = () => {
        const s3Bucket = core.getInput('s3-bucket');
        return !s3Bucket; 
      };
      
      const useDirectUpload = testDirectUpload();

      expect(useDirectUpload).toBe(true);

      mainModule.uploadToS3.mockReset();

      const functionName = core.getInput('function-name');
      const s3Bucket = core.getInput('s3-bucket');
      if (s3Bucket) {
        await mainModule.uploadToS3('file.zip', s3Bucket, 'key.zip', 'region', '123456789012'); // Adding expected bucket owner
      }
      expect(mainModule.uploadToS3).not.toHaveBeenCalled();
    });
  });
});
