from aws_cdk import (
    Stack,
    CfnOutput,
    RemovalPolicy,
)
from constructs import Construct

from .constructs.static_site import StaticSiteConstruct
from .constructs.database import DatabaseConstruct
from .constructs.auth import AuthConstruct
from .constructs.dns import DnsConstruct


class BassBuzzStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, environment: str = "prod", **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Apply consistent tags to all resources
        cdk.Tags.of(self).add("Project", "BassPracticeTracker")
        cdk.Tags.of(self).add("Environment", environment)
        cdk.Tags.of(self).add("Owner", "codebycarson")
        cdk.Tags.of(self).add("ManagedBy", "CDK")
        cdk.Tags.of(self).add("Repository", "bassbuzz-schedule")

        # Configuration based on environment
        if environment == "prod":
            domain_name = "bass-practice.codebycarson.com"
        else:
            domain_name = f"bass-practice-{environment}.codebycarson.com"
        
        hosted_zone_name = "codebycarson.com"
        
        # Create DynamoDB table for user progress
        table_name = f"bass-practice-data-{environment}" if environment != "prod" else "bass-practice-data"
        database = DatabaseConstruct(
            self, "Database",
            table_name=table_name
        )
        
        # Create Cognito Identity Pool for authentication
        pool_name = f"bass-practice-identity-pool-{environment}" if environment != "prod" else "bass-practice-identity-pool"
        auth = AuthConstruct(
            self, "Auth",
            identity_pool_name=pool_name,
            table_arn=database.table.table_arn
        )
        
        # Create DNS record for the domain
        dns = DnsConstruct(
            self, "DNS",
            domain_name=domain_name,
            hosted_zone_name=hosted_zone_name
        )
        
        # Create static site with S3 and CloudFront
        static_site = StaticSiteConstruct(
            self, "StaticSite",
            domain_name=domain_name,
            certificate=dns.certificate,
            hosted_zone=dns.hosted_zone
        )
        
        # Grant the authenticated role access to DynamoDB
        database.table.grant_read_write_data(auth.authenticated_role)
        
        # Outputs for configuration
        CfnOutput(
            self, "IdentityPoolId",
            value=auth.identity_pool.ref,
            description="Cognito Identity Pool ID for frontend configuration"
        )
        
        CfnOutput(
            self, "DynamoDBTableName",
            value=database.table.table_name,
            description="DynamoDB table name for frontend configuration"
        )
        
        CfnOutput(
            self, "CloudFrontDistributionId",
            value=static_site.distribution.distribution_id,
            description="CloudFront distribution ID for cache invalidation"
        )
        
        CfnOutput(
            self, "S3BucketName",
            value=static_site.bucket.bucket_name,
            description="S3 bucket name for static asset deployment"
        )
        
        CfnOutput(
            self, "WebsiteURL",
            value=f"https://{domain_name}",
            description="Website URL"
        )