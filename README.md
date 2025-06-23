# AWS Lambda "Deploy Lambda Function" Action for GitHub Actions

Updates the code and configuration of AWS Lambda functions

## Usage

```yaml
name: Deploy Lambda Function

on:
  push:
    branches: [main, master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # Required for OIDC authentication
      contents: read  # Required to check out the repository
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionRole
          aws-region: us-east-1
      
      - name: Deploy Lambda function
        uses: aws-actions/amazon-lambda-deploy@v1
        with:
          function-name: my-lambda-function
          code-artifacts-dir: ./dist
```

### Using S3 Deployment Method

```yaml
name: Deploy Lambda Function with S3

on:
  push:
    branches: [main, master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # Required for OIDC authentication
      contents: read  # Required to check out the repository
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials with OIDC
        uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionRole
          aws-region: us-east-1
      
      - name: Deploy Lambda function via S3
        uses: aws-actions/amazon-lambda-deploy@v1
        with:
          function-name: my-lambda-function
          code-artifacts-dir: ./dist
          s3-bucket: my-lambda-deployment-bucket
          # s3-key is optional - a key will be auto-generated if not specified
```

### Update Configuration Only

```yaml
name: Update Lambda Configuration

on:
  push:
    branches: [main, master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # Required for OIDC authentication
      contents: read  # Required to check out the repository
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials with OIDC
        uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionRole
          aws-region: us-east-1
      
      - name: Update Lambda configuration
        uses: aws-actions/amazon-lambda-deploy@v1
        with:
          function-name: my-lambda-function
          code-artifacts-dir: ./dist
          memory-size: 512
          timeout: 60
          environment: '{"ENV":"production","DEBUG":"true"}'
```

### Dry Run Mode

```yaml
name: Validate Lambda Deployment

on:
  pull_request:
    branches: [main, master]

jobs:
  validate:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # Required for OIDC authentication
      contents: read  # Required to check out the repository
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials with OIDC
        uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionRole
          aws-region: us-east-1
      
      - name: Validate Lambda deployment (no changes)
        uses: aws-actions/amazon-lambda-deploy@v1
        with:
          function-name: my-lambda-function
          code-artifacts-dir: ./dist
          dry-run: true
```

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `function-name` | Name of the Lambda function | Yes | |
| `region` | AWS region | No | (from AWS config) |
| `code-artifacts-dir` | Path to a directory of code artifacts to zip and deploy | Yes | |
| `s3-bucket` | S3 bucket name for Lambda deployment package. Uses S3 deployment method if provided | No | |
| `s3-key` | S3 key (path) for the Lambda deployment package | No | Auto-generated |
| `publish` | Publish a new version of the function after updating | No | `true` |
| `dry-run` | Validate parameters and permissions without modifications | No | `true` |
| `revision-id` | Update only if the revision ID matches the specified ID | No | |
| `architectures` | Function instruction set architecture | No | `x86_64` |
| `source-kms-key-arn` | ARN of the KMS key for encrypting deployment package | No | |
| `role` | ARN of the function's execution role (required for new functions) | No | |
| `handler` | Name of the function handler method | No | |
| `function-description` | Description of the function | No | |
| `memory-size` | Amount of memory available to the function at runtime | No | |
| `timeout` | Function timeout in seconds | No | `3` |
| `vpc-config` | VPC configuration for network connectivity | No | |
| `environment` | Environment variables as JSON string | No | |
| `runtime` | Function runtime identifier | No | `nodejs22.x` |
| `dead-letter-config` | Dead letter queue or topic for failed events | No | |
| `kms-key-arn` | ARN of KMS customer managed key | No | |
| `tracing-config` | X-Ray tracing configuration | No | |
| `layers` | Function layers to add to execution environment | No | |
| `file-system-configs` | Amazon EFS connection settings | No | |
| `image-config` | Container image configuration | No | |
| `ephemeral-storage` | Size of function's /tmp directory in MB | No | `512` |
| `snap-start` | Function's SnapStart setting | No | |
| `logging-config` | CloudWatch Logs configuration | No | |
| `code-signing-config-arn` | ARN of code-signing configuration | No | |
| `tags` | Tags to apply to the function as JSON string | No | |

## Outputs

| Name | Description |
|------|-------------|
| `function-arn` | The ARN of the updated Lambda function |
| `version` | The function version if a new version was published |

## Credentials and Region

This action relies on the [default behavior of the AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) to determine AWS credentials and region. Use the [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action to configure the GitHub Actions environment for AWS authentication.

### OpenID Connect (OIDC) - Recommended Approach

We **highly recommend** using OpenID Connect (OIDC) to authenticate with AWS. OIDC allows your GitHub Actions workflows to access AWS resources without storing AWS credentials as long-lived GitHub secrets.

Here's an example of using OIDC with the aws-actions/configure-aws-credentials action:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # Required for OIDC authentication
      contents: read  # Required to check out the repository
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials with OIDC
        uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionRole
          aws-region: us-east-1
      
      - name: Deploy Lambda function
        uses: aws-actions/amazon-lambda-deploy@v1
        with:
          function-name: my-lambda-function
          code-artifacts-dir: ./dist
```

To use OIDC authentication, you must configure a trust policy in AWS IAM that allows GitHub Actions to assume an IAM role. Here's an example trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:your-org/your-repo:*"
        }
      }
    }
  ]
}
```

For more information on setting up OIDC with AWS, see [Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services).

## Permissions

This action requires the following minimum set of permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaDeployPermissions",
      "Effect": "Allow",
      "Action": [
        "lambda:GetFunction",
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:PublishVersion"
      ],
      "Resource": "arn:aws:lambda:<region>:<aws_account_id>:function:<function_name>"
    }
  ]
}
```

If you're using the S3 deployment method, ensure your IAM role also has the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Permissions",
      "Effect": "Allow",
      "Action": [
        "s3:HeadBucket",
        "s3:CreateBucket",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::<bucket_name>",
        "arn:aws:s3:::<bucket_name>/*"
      ]
    }
  ]
}
```

We recommend reading [AWS Lambda Security Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/security-best-practices.html) for more information on securing your Lambda functions.

## License


