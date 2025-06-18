# S3 Deployment Troubleshooting Guide

This guide helps troubleshoot common issues when using the S3 deployment method with the Lambda GitHub Action.

## Common Error Messages and Solutions

### "Error checking if bucket exists: UnknownError"

**Possible causes:**
1. **Insufficient permissions**: The IAM role/user lacks `s3:HeadBucket` permission
2. **Invalid credentials**: AWS credentials are invalid or expired
3. **Network issues**: Connectivity problems to AWS S3 service

**Solutions:**
1. Add `s3:HeadBucket` permission to your IAM policy
2. Verify your AWS credentials are valid and properly configured
3. Check network connectivity to AWS services

### "S3 upload failed: UnknownError"

**Possible causes:**
1. **Insufficient permissions**: Missing `s3:PutObject` permission
2. **Bucket doesn't exist**: The specified bucket doesn't exist
3. **File access issues**: The ZIP file can't be read

**Solutions:**
1. Add `s3:PutObject` permission to your IAM policy
2. Create the bucket manually before deployment or add `s3:CreateBucket` permission
3. Verify the ZIP file exists and is readable

### "Failed to upload package to S3: UnknownError"

**Possible causes:**
1. **Combination of issues**: Multiple permission or configuration problems
2. **Service limits**: You may have hit S3 service limits
3. **Invalid bucket name**: The bucket name doesn't follow S3 naming rules

**Solutions:**
1. Apply the comprehensive IAM policy from `s3-deployment-policy.json`
2. Check if you've reached your S3 bucket or object limits
3. Ensure bucket name follows [S3 naming rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html)

## Required IAM Permissions

For successful S3 deployment, ensure your IAM policy includes:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:GetBucketLocation",
                "s3:HeadBucket"
            ],
            "Resource": [
                "arn:aws:s3:::YOUR-BUCKET-NAME",
                "arn:aws:s3:::YOUR-BUCKET-NAME/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:CreateBucket"
            ],
            "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
        }
    ]
}
```

## Debugging Steps

1. **Verify bucket existence:**
   ```bash
   aws s3api head-bucket --bucket YOUR-BUCKET-NAME
   ```

2. **Check bucket ownership:**
   ```bash
   aws s3api get-bucket-location --bucket YOUR-BUCKET-NAME
   ```

3. **Test bucket creation permissions:**
   ```bash
   aws s3api create-bucket --bucket test-bucket-name-xyz --region us-east-1
   ```

4. **Test upload permissions:**
   ```bash
   aws s3api put-object --bucket YOUR-BUCKET-NAME --key test.txt --body test.txt
   ```

5. **Check AWS credentials:**
   ```bash
   aws sts get-caller-identity
   ```

## S3 Bucket Naming Rules

- Bucket names must be between 3 and 63 characters long
- Bucket names can consist only of lowercase letters, numbers, dots (.), and hyphens (-)
- Bucket names must begin and end with a letter or number
- Bucket names must not be formatted as an IP address
- Bucket names must be unique across all AWS accounts in all AWS Regions

## Additional Resources

- [AWS S3 Troubleshooting Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshooting.html)
- [AWS IAM Troubleshooting](https://docs.aws.amazon.com/IAM/latest/UserGuide/troubleshoot.html)
- [S3 Error Codes](https://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html)