# Understanding LambdaGitHubAction

## What LambdaGitHubAction Is:

LambdaGitHubAction is a **GitHub Action** - a self-contained piece of automation code designed to run within GitHub's workflow system.

It is:
- A repository containing code that deploys AWS Lambda functions
- Defined by its `action.yml` file which specifies inputs, outputs, and runtime
- Written in JavaScript (Node.js) with the AWS SDK
- Meant to be referenced in GitHub workflow files

It is NOT:
- An npm package published to the npm registry
- A workspace in the npm/yarn workspace sense
- A standalone application

## How GitHub Actions Work:

GitHub Actions are repositories with specific files:
- `action.yml` - Defines the action's metadata, inputs, outputs, and runtime
- Implementation code (in this case, JavaScript files like `index.js` and `validations.js`)
- Built/bundled code (typically in a `dist/` folder)

## Using a GitHub Action:

GitHub Actions are used by referencing them in workflow files (`.github/workflows/*.yml`):

```yaml
steps:
  - name: Deploy Lambda
    uses: your-org/LambdaGitHubAction@v1
    with:
      function-name: my-function
      region: us-east-1
```

The `uses:` directive tells GitHub where to find the action code.

## To use this LambdaGitHubAction without publishing it:

1. **Repository Reference**:
   ```yaml
   uses: your-org/LambdaGitHubAction@main
   ```
   The repository must be accessible to the workflow.

2. **Local Reference**:
   Copy the action files to `.github/actions/lambda-action` in your repository, then:
   ```yaml
   uses: ./.github/actions/lambda-action
   ```

3. **Checkout Method**:
   ```yaml
   - name: Checkout Private Action
     uses: actions/checkout@v4
     with:
       repository: your-org/LambdaGitHubAction
       path: ./.github/actions/lambda-action
   
   - name: Use the Action
     uses: ./.github/actions/lambda-action
