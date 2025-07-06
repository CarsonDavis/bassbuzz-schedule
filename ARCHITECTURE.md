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
- **OPTIONAL LOGIN**: App works without authentication, syncs when logged in
- **CLIENT-SIDE ONLY**: No server-side session management

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

### SYNC IMPLEMENTATION
```javascript
// Add to existing BassPracticeTracker class
async syncToCloud() {
  if (!this.isAuthenticated) return;
  
  const item = {
    userId: this.user.sub,
    data: JSON.stringify(this.progress),
    lastUpdated: Date.now(),
    version: (this.cloudVersion || 0) + 1
  };
  
  await dynamoClient.putItem({
    TableName: 'bass-practice-data',
    Item: item
  });
}

async syncFromCloud() {
  if (!this.isAuthenticated) return;
  
  const result = await dynamoClient.getItem({
    TableName: 'bass-practice-data',
    Key: { userId: this.user.sub }
  });
  
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
- IAM role for browser-based DynamoDB access
- Route 53 hosted zone (optional)

### SECURITY
- **IAM POLICY**: Restrict DynamoDB access to user's own data
- **CORS**: Configure S3 and DynamoDB for web access
- **HTTPS**: Enforce SSL/TLS via CloudFront
- **NO SECRETS**: All authentication via Google OAuth tokens

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