# AWS Security & IAM Setup

## Overview

This directory contains the minimal IAM policy and setup scripts for secure deployment via GitHub Actions.

## Security Approach

### ✅ **Minimal Permissions**
Instead of using broad AWS managed policies, we've created a custom policy that only grants the exact permissions needed for our resources.

### ✅ **Resource-Scoped Access**
Permissions are limited to specific resource patterns where possible:
- S3: Only buckets starting with `bass-practice-*` and `cdk-*`
- DynamoDB: Only tables named `bass-practice-data*`
- IAM: Only roles created by our CDK stacks
- CloudFormation: Only our specific stacks

### ✅ **Consistent Tagging**
All resources are tagged with:
- `Project`: BassPracticeTracker
- `Environment`: prod | dev
- `Owner`: codebycarson
- `ManagedBy`: CDK
- `Repository`: bassbuzz-schedule

## Resources Created by CDK

### **Production Environment**
```
Domain: bass-practice.codebycarson.com
DynamoDB: bass-practice-data
Cognito: bass-practice-identity-pool
S3: bass-practice-{hash}
```

### **Development Environment**
```
Domain: bass-practice-dev.codebycarson.com
DynamoDB: bass-practice-data-dev
Cognito: bass-practice-identity-pool-dev
S3: bass-practice-{hash}-dev
```

### **All Environments**
- CloudFront Distribution (CDK-generated name)
- SSL Certificate (ACM, CDK-managed)
- IAM Roles (CDK-generated with predictable prefixes)
- Route 53 Records (in existing codebycarson.com zone)

## IAM Policy Breakdown

| Service | Permissions | Resource Scope |
|---------|-------------|----------------|
| **CloudFormation** | Full stack management | BassBuzzStack* stacks only |
| **S3** | Bucket creation, object management | bass-practice-* and cdk-* buckets |
| **DynamoDB** | Table management, data access | bass-practice-data* tables |
| **CloudFront** | Distribution management | All (needed for CDK) |
| **Route 53** | DNS record management | Existing hosted zones only |
| **ACM** | Certificate management | All (needed for validation) |
| **Cognito** | Identity pool management | All identity pools |
| **IAM** | Role management | BassBuzzStack* and cdk-* roles |
| **STS** | Get caller identity | Required for CDK |
| **SSM** | CDK bootstrap parameters | cdk-bootstrap/* only |

## Setup Instructions

### 1. **Create IAM User**
```bash
./scripts/setup-iam.sh
```

This creates:
- IAM user: `github-actions-bassbuzz`
- Custom policy: `BassBuzzDeploymentPolicy`
- Access key pair for GitHub Actions

### 2. **Add GitHub Secrets**
```
AWS_ACCESS_KEY_ID: [from setup script output]
AWS_SECRET_ACCESS_KEY: [from setup script output]
GOOGLE_CLIENT_ID: [from Google Cloud Console]
```

### 3. **Bootstrap CDK (One-time)**
```bash
cd cdk
export AWS_PROFILE=personal
cdk bootstrap
```

## Security Benefits

✅ **Principle of Least Privilege** - Only necessary permissions
✅ **Resource Scoping** - Limited to our specific resources  
✅ **No Persistent Credentials** - GitHub Actions only
✅ **Audit Trail** - All actions logged via CloudTrail
✅ **Consistent Tagging** - Easy cost tracking and management

## Cost Monitoring

With consistent tagging, you can:
- Filter AWS Cost Explorer by Project/Environment
- Set up billing alerts for BassPracticeTracker resources
- Track costs per environment (prod vs dev)

## Cleanup

To remove the IAM user and policy:
```bash
aws iam detach-user-policy --user-name github-actions-bassbuzz --policy-arn arn:aws:iam::ACCOUNT:policy/BassBuzzDeploymentPolicy --profile personal
aws iam delete-access-key --user-name github-actions-bassbuzz --access-key-id [KEY_ID] --profile personal
aws iam delete-user --user-name github-actions-bassbuzz --profile personal
aws iam delete-policy --policy-arn arn:aws:iam::ACCOUNT:policy/BassBuzzDeploymentPolicy --profile personal
```