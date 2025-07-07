# BASSBUZZ SCHEDULE CLOUD ARCHITECTURE

## OVERVIEW
Lightweight serverless architecture to add optional cloud sync and backup to the existing localStorage-based bass practice tracking application.

## CURRENT STATE
- **CLIENT-SIDE ONLY**: Pure JavaScript application with localStorage persistence
- **SINGLE DEVICE**: Data trapped on individual browsers
- **NO BACKUP**: Data lost if browser storage cleared
- **WORKS OFFLINE**: Full functionality without internet

## PROPOSED ARCHITECTURE

### HOSTING
- **STATIC SITE**: Amazon S3 bucket configured for static website hosting
- **CDN**: CloudFront distribution for global content delivery
- **DOMAIN**: Optional Route 53 hosted zone for custom domain (bass-practice.codebycarson.com)

### AUTHENTICATION
- **GOOGLE OAUTH**: JavaScript SDK integration (no backend required)
- **AWS COGNITO**: Identity Pool for secure credential exchange
- **OPTIONAL LOGIN**: App works without authentication, syncs when logged in
- **CLIENT-SIDE ONLY**: No server-side session management
- **SECURE CREDENTIALS**: Temporary AWS credentials via Cognito federated identity

### DATA STORAGE
- **PRIMARY**: Browser localStorage (unchanged)
- **BACKUP**: Amazon DynamoDB with on-demand pricing
- **SYNC STRATEGY**: 
  - Load from cloud on login
  - Save to cloud on data changes (when authenticated)
  - Merge conflicts favor most recent timestamp

### DATA MODEL
```
DynamoDB Table: bass-practice-data
Partition Key: userId (string) - Google OAuth user ID
Attributes:
- data (string) - JSON stringified progress object
- lastUpdated (number) - Unix timestamp
- version (number) - For conflict resolution
```

### AUTHENTICATION FLOW
```
1. User clicks "Login with Google"
2. Google OAuth provides JWT token
3. AWS Cognito Identity Pool exchanges JWT for temporary AWS credentials
4. Credentials are scoped to user's own DynamoDB data only
5. Credentials auto-expire (1 hour) and refresh automatically
```

### SYNC IMPLEMENTATION
```javascript
// Add to existing BassPracticeTracker class
async initializeAuth() {
  // Configure AWS Cognito Identity Pool
  AWS.config.region = 'us-east-1';
  AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'us-east-1:your-identity-pool-id',
    Logins: {
      'accounts.google.com': this.googleIdToken
    }
  });
}

async syncToCloud() {
  if (!this.isAuthenticated) return;
  
  const dynamoDb = new AWS.DynamoDB.DocumentClient();
  const item = {
    userId: this.user.sub,
    data: JSON.stringify(this.progress),
    lastUpdated: Date.now(),
    version: (this.cloudVersion || 0) + 1
  };
  
  await dynamoDb.put({
    TableName: 'bass-practice-data',
    Item: item
  }).promise();
}

async syncFromCloud() {
  if (!this.isAuthenticated) return;
  
  const dynamoDb = new AWS.DynamoDB.DocumentClient();
  const result = await dynamoDb.get({
    TableName: 'bass-practice-data',
    Key: { userId: this.user.sub }
  }).promise();
  
  if (result.Item && result.Item.lastUpdated > this.lastSync) {
    this.progress = JSON.parse(result.Item.data);
    this.saveProgress(); // Update localStorage
  }
}
```

## COST BREAKDOWN

### MONTHLY COSTS (100 ACTIVE USERS)

#### S3 STATIC HOSTING
- **Storage**: <1MB total = $0.00/month
- **Requests**: ~100 GET requests = $0.00/month (free tier: 20,000)
- **Data Transfer**: Covered by CloudFront

#### CLOUDFRONT CDN
- **Data Transfer**: ~2GB/month = $0.00/month (free tier: 1TB)
- **Requests**: ~1,000/month = $0.00/month (free tier: 10M)
- **Origin Transfer**: S3 to CloudFront = $0.00/month (always free)

#### DYNAMODB ON-DEMAND
- **Storage**: ~100KB total = $0.00/month (negligible)
- **Read Requests**: 1,000/month = $0.00/month ($0.25 per million)
- **Write Requests**: 10,000/month = $0.01/month ($1.25 per million)

#### AWS COGNITO IDENTITY POOL
- **Identity Pool**: $0.00/month (free tier: 50,000 identities)
- **Federated Identities**: $0.00/month (Google OAuth integration)
- **Credential Exchange**: $0.00/month (included in free tier)

#### ROUTE 53 
- **Hosted Zone**: $0.00/month (using existing codebycarson.com zone)
- **DNS Queries**: ~1,000/month = $0.00/month (free tier: 1M)

### TOTAL MONTHLY COST
- **With Subdomain (bass-practice.codebycarson.com)**: $0.01/month ($0.12/year)
- **Without Custom Domain**: $0.01/month ($0.12/year)

### SCALING COSTS (1,000 ACTIVE USERS)
- **DynamoDB**: ~$0.10/month (10× more operations)
- **All Other Services**: Still $0.00/month (within free tiers)
- **Total**: ~$0.11/month with subdomain

## IMPLEMENTATION REQUIREMENTS

### FRONTEND CHANGES
- Add Google OAuth JavaScript SDK
- Add AWS SDK for JavaScript (DynamoDB client)
- Add sync methods to BassPracticeTracker class
- Add optional login/logout UI
- Add sync status indicators

### AWS RESOURCES
- S3 bucket with static website configuration
- CloudFront distribution
- DynamoDB table with on-demand billing
- **Cognito Identity Pool** for secure credential exchange
- **IAM role** with identity-scoped DynamoDB access
- Route 53 hosted zone (optional)

### SECURITY
- **COGNITO IDENTITY POOL**: Secure federated identity with Google
- **IAM POLICY**: Restrict DynamoDB access to user's own data via identity scoping
- **TEMPORARY CREDENTIALS**: Auto-expiring AWS credentials (1-hour TTL)
- **NO PERMANENT SECRETS**: No AWS keys stored in browser
- **CORS**: Configure S3 and DynamoDB for web access
- **HTTPS**: Enforce SSL/TLS via CloudFront
- **PRINCIPLE OF LEAST PRIVILEGE**: Users can only access their own data

#### IDENTITY-SCOPED IAM POLICY
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:region:account:table/bass-practice-data",
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:LeadingKeys": ["${cognito-identity.amazonaws.com:sub}"]
        }
      }
    }
  ]
}
```

## BENEFITS
- **OPTIONAL**: Existing users unaffected
- **MULTI-DEVICE**: Access from any browser
- **BACKUP**: Data preserved in cloud
- **OFFLINE-FIRST**: Works without internet
- **COST-EFFECTIVE**: Under $1/month for hundreds of users
- **MAINTENANCE-FREE**: Fully serverless, no servers to manage

## RISKS
- **GOOGLE DEPENDENCY**: Relies on Google OAuth availability
- **AWS DEPENDENCY**: Relies on AWS service availability
- **SYNC CONFLICTS**: Potential data conflicts between devices
- **PRIVACY**: User data stored in cloud (with consent)

## MIGRATION STRATEGY
- **PHASE 1**: Deploy authentication and sync infrastructure
- **PHASE 2**: Add optional login UI to existing app
- **PHASE 3**: Implement background sync for authenticated users
- **PHASE 4**: Add manual sync controls and conflict resolution