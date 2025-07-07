#!/bin/bash

# Script to set up IAM user for GitHub Actions deployment
# Run with: ./scripts/setup-iam.sh

set -e

# Check dependencies
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required but not installed. Install with:"
    echo "   macOS: brew install jq"
    echo "   Ubuntu: sudo apt-get install jq"
    exit 1
fi

AWS_PROFILE="personal"
USER_NAME="github-actions-bassbuzz"
POLICY_NAME="BassBuzzDeploymentPolicy"
POLICY_FILE="aws/github-actions-policy.json"

echo "🔐 Setting up IAM user for GitHub Actions deployment..."
echo "AWS Profile: $AWS_PROFILE"
echo "User Name: $USER_NAME"
echo ""

# Check if policy file exists
if [ ! -f "$POLICY_FILE" ]; then
    echo "❌ Policy file not found: $POLICY_FILE"
    exit 1
fi

# Create IAM user
echo "📝 Creating IAM user: $USER_NAME"
aws iam create-user \
    --user-name "$USER_NAME" \
    --profile "$AWS_PROFILE" \
    --tags Key=Project,Value=BassPracticeTracker Key=Purpose,Value=GitHubActions \
    || echo "⚠️  User may already exist"

# Create custom policy
echo "📋 Creating custom IAM policy: $POLICY_NAME"
POLICY_ARN=$(aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document file://"$POLICY_FILE" \
    --profile "$AWS_PROFILE" \
    --query 'Policy.Arn' \
    --output text \
    2>/dev/null || \
    aws iam get-policy \
    --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --profile $AWS_PROFILE --query Account --output text):policy/$POLICY_NAME" \
    --profile "$AWS_PROFILE" \
    --query 'Policy.Arn' \
    --output text)

echo "Policy ARN: $POLICY_ARN"

# Update policy if it already exists
echo "🔄 Updating policy with latest permissions..."
if ! aws iam create-policy-version \
    --policy-arn "$POLICY_ARN" \
    --policy-document file://"$POLICY_FILE" \
    --set-as-default \
    --profile "$AWS_PROFILE" 2>/dev/null; then
    echo "⚠️  Using existing policy version (may have older permissions)"
fi

# Attach policy to user
echo "🔗 Attaching policy to user..."
aws iam attach-user-policy \
    --user-name "$USER_NAME" \
    --policy-arn "$POLICY_ARN" \
    --profile "$AWS_PROFILE"

# Check if user already has 2 access keys (AWS limit)
echo "🔍 Checking existing access keys..."
EXISTING_KEYS=$(aws iam list-access-keys \
    --user-name "$USER_NAME" \
    --profile "$AWS_PROFILE" \
    --query 'AccessKeyMetadata | length(@)' \
    --output text 2>/dev/null || echo "0")

if [ "$EXISTING_KEYS" -ge 2 ]; then
    echo "❌ User already has maximum number of access keys (2)"
    echo "   Delete an existing key first with:"
    echo "   aws iam delete-access-key --user-name $USER_NAME --access-key-id KEY_ID --profile $AWS_PROFILE"
    exit 1
fi

# Create access key
echo "🔑 Creating access key..."
ACCESS_KEY_OUTPUT=$(aws iam create-access-key \
    --user-name "$USER_NAME" \
    --profile "$AWS_PROFILE" \
    --output json)

if [ $? -ne 0 ]; then
    echo "❌ Failed to create access key"
    exit 1
fi

ACCESS_KEY_ID=$(echo "$ACCESS_KEY_OUTPUT" | jq -r '.AccessKey.AccessKeyId')
SECRET_ACCESS_KEY=$(echo "$ACCESS_KEY_OUTPUT" | jq -r '.AccessKey.SecretAccessKey')

# Validate we got the credentials
if [ -z "$ACCESS_KEY_ID" ] || [ -z "$SECRET_ACCESS_KEY" ] || [ "$ACCESS_KEY_ID" = "null" ] || [ "$SECRET_ACCESS_KEY" = "null" ]; then
    echo "❌ Failed to extract access key credentials"
    exit 1
fi

echo ""
echo "✅ IAM user setup complete!"
echo ""
echo "🔐 Add these secrets to your GitHub repository:"
echo "   Settings > Secrets and variables > Actions > New repository secret"
echo ""
echo "AWS_ACCESS_KEY_ID:"
echo "$ACCESS_KEY_ID"
echo ""
echo "AWS_SECRET_ACCESS_KEY:"
echo "[REDACTED - shown only once for security]"
echo ""
echo "⚠️  IMPORTANT: The secret access key above is redacted for security."
echo "   Copy it from this secure location:"

# Write to temporary secure file
TEMP_FILE=$(mktemp)
chmod 600 "$TEMP_FILE"
echo "$SECRET_ACCESS_KEY" > "$TEMP_FILE"
echo "   cat $TEMP_FILE"
echo ""
echo "   After copying to GitHub, delete the temp file:"
echo "   rm $TEMP_FILE"
echo ""
echo "📋 Also remember to add:"
echo "   GOOGLE_CLIENT_ID: [Your Google OAuth 2.0 client ID]"
echo ""
echo "🚀 Next steps:"
echo "   1. Add the secrets to GitHub"
echo "   2. Set up Google OAuth credentials"
echo "   3. Push to master branch to trigger deployment"