# Bass Practice Tracker - Deployment Guide

## Overview

This project uses Python CDK for Infrastructure as Code and GitHub Actions for automated deployment to AWS. The deployment creates a serverless web application with cloud sync functionality for ~$0.01/month.

## 🚀 Quick Start (Getting It Live)

### 1. **Bootstrap AWS Security**
```bash
# Create minimal IAM user for GitHub Actions
./scripts/setup-iam.sh
```
Save the AWS credentials from the output.

### 2. **Set Up Google OAuth**
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Create OAuth 2.0 Client ID (Web application)
- Add authorized domains:
  - `https://bass-practice.codebycarson.com`
  - `https://bass-practice-dev.codebycarson.com`
  - `http://localhost` (for local dev)
- Copy the Client ID

### 3. **Configure GitHub Secrets**
Go to GitHub repo → Settings → Secrets and variables → Actions:
```
AWS_ACCESS_KEY_ID       - From step 1 output
AWS_SECRET_ACCESS_KEY   - From step 1 output  
GOOGLE_CLIENT_ID        - From step 2
```

### 4. **Bootstrap CDK**
```bash
cd cdk
export AWS_PROFILE=personal
cdk bootstrap
```

### 5. **Deploy**
```bash
# Push to master branch for automatic deployment
git push origin master

# OR manually trigger via GitHub Actions UI
```

🎉 **That's it!** Your app will be live at `https://bass-practice.codebycarson.com`

## Prerequisites

### AWS Requirements
- AWS CLI configured with `personal` profile
- Existing Route 53 hosted zone for `codebycarson.com`
- AWS account with sufficient permissions

### Security Architecture
- **Minimal IAM Permissions**: Custom policy with only required actions
- **Resource Scoping**: Access limited to bass-practice-* resources  
- **Consistent Tagging**: All resources tagged for cost tracking
- **Environment Isolation**: Separate resources for prod/dev

See `aws/README.md` for detailed security implementation.

## Local Development

### 1. Install Dependencies
```bash
# Install CDK CLI
npm install -g aws-cdk@latest

# Install Python dependencies
cd cdk
pip install -r requirements.txt
```

### 2. Bootstrap CDK (first time only)
```bash
cd cdk
export AWS_PROFILE=personal
cdk bootstrap
```

### 3. Deploy Infrastructure
```bash
cd cdk
export AWS_PROFILE=personal

# For production
cdk deploy --context environment=prod

# For development
cdk deploy --context environment=dev
```

### 4. Configure Application
```bash
# Set environment variables
export GOOGLE_CLIENT_ID="your-google-client-id"
export CDK_OUTPUTS_FILE="cdk/outputs.json"

# Run configuration script
python scripts/configure.py
```

## Deployment Architecture

### **Automatic Deployment**
- **Production**: Push to `master` → `bass-practice.codebycarson.com`
- **Development**: Push to `dev` → `bass-practice-dev.codebycarson.com`
- **Manual**: GitHub Actions UI with environment selection

### **Deployment Pipeline**
1. **Infrastructure Job** - Python CDK deploys AWS resources
2. **Frontend Job** - Configures app and uploads to S3
3. **Cache Invalidation** - Clears CloudFront for instant updates

### **What Gets Created**
- **S3 Bucket** - Static website hosting
- **CloudFront Distribution** - Global CDN with SSL
- **DynamoDB Table** - User progress storage (on-demand)
- **Cognito Identity Pool** - Secure authentication
- **Route 53 Record** - Custom domain with SSL certificate

### **Security Features**
- No AWS credentials in browser code
- Temporary credentials via Cognito (1-hour expiry)
- Identity-scoped database access (users can only see their own data)
- Minimal IAM permissions for deployment

## AWS Resources Created

### Core Infrastructure
- **S3 Bucket** - Static website hosting
- **CloudFront Distribution** - CDN with custom domain
- **Route 53 Record** - `bass-practice.codebycarson.com` A record

### Authentication & Data
- **Cognito Identity Pool** - Federated identity with Google
- **DynamoDB Table** - User progress storage (on-demand billing)
- **IAM Roles** - Identity-scoped access control

### Security Features
- **SSL Certificate** - Automatic HTTPS via ACM
- **CORS Policy** - Secure cross-origin requests
- **Identity Scoping** - Users can only access their own data

## Estimated Costs

### Monthly Costs (100 active users)
- **S3 & CloudFront**: $0.00/month (within free tier)
- **DynamoDB**: ~$0.01/month (on-demand pricing)
- **Route 53**: $0.00/month (using existing hosted zone)
- **Cognito**: $0.00/month (within free tier)

**Total: ~$0.01/month ($0.12/year)**

## Monitoring & Troubleshooting

### CloudWatch Logs
- Lambda@Edge logs (if used)
- CloudFront access logs
- DynamoDB metrics

### Common Issues
1. **DNS Propagation** - Allow 24-48 hours for global DNS propagation
2. **Certificate Validation** - Ensure Route 53 hosted zone is active
3. **CORS Errors** - Check CloudFront and S3 CORS configuration
4. **Auth Errors** - Verify Google Client ID and Cognito configuration

## Environment Variables

### Required for Deployment
```bash
GOOGLE_CLIENT_ID          # Google OAuth 2.0 client ID
CDK_OUTPUTS_FILE          # Path to CDK outputs JSON file
```

### Generated by CDK
```bash
IDENTITY_POOL_ID          # Cognito Identity Pool ID
DYNAMODB_TABLE_NAME       # DynamoDB table name
CLOUDFRONT_DISTRIBUTION   # CloudFront distribution ID
S3_BUCKET_NAME           # S3 bucket name
```

## Manual Deployment Steps

If you need to deploy manually:

1. **Deploy CDK Stack**:
   ```bash
   cd cdk
   cdk deploy --profile personal --outputs-file outputs.json
   ```

2. **Configure Application**:
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id"
   python scripts/configure.py
   ```

3. **Upload to S3**:
   ```bash
   aws s3 sync . s3://your-bucket-name --exclude ".*" --exclude "cdk/*"
   ```

4. **Invalidate CloudFront**:
   ```bash
   aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
   ```

## Security Considerations

### **Frontend Security**
- No AWS credentials stored in frontend code
- Temporary credentials via Cognito (1-hour expiry)
- Identity-scoped DynamoDB access
- HTTPS enforced via CloudFront

### **Deployment Security**
- **Minimal IAM Permissions**: Custom policy with only required actions
- **Resource Scoping**: Access limited to bass-practice-* resources
- **No Broad Policies**: Avoids overly-permissive AWS managed policies
- **Consistent Tagging**: All resources tagged for cost tracking
- **Audit Trail**: All deployments logged via CloudTrail

See `aws/README.md` for detailed security architecture.