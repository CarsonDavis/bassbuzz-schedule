#!/bin/bash

# Script to update the IAM policy with additional permissions
# Run with: ./scripts/update-iam-policy.sh

set -e

AWS_PROFILE="personal"
POLICY_NAME="BassBuzzDeploymentPolicy"
POLICY_FILE="aws/github-actions-policy.json"

echo "🔄 Updating IAM policy with additional permissions..."

# Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --profile $AWS_PROFILE --query Account --output text)
POLICY_ARN="arn:aws:iam::$ACCOUNT_ID:policy/$POLICY_NAME"

echo "Policy ARN: $POLICY_ARN"

# Create new policy version
echo "📋 Creating new policy version..."
NEW_VERSION=$(aws iam create-policy-version \
    --policy-arn "$POLICY_ARN" \
    --policy-document file://"$POLICY_FILE" \
    --set-as-default \
    --profile "$AWS_PROFILE" \
    --query 'PolicyVersion.VersionId' \
    --output text)

echo "✅ Updated to policy version: $NEW_VERSION"
echo ""
echo "🚀 New permissions added:"
echo "  - ssm:GetParameters (for CDK bootstrap)"
echo "  - route53:* with wildcard resource (for DNS lookup)"
echo ""
echo "You can now re-run the deployment!"