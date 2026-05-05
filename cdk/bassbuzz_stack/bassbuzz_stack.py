from aws_cdk import (
    Stack,
    CfnOutput,
    RemovalPolicy,
    Tags,
    aws_iam as iam,
)
from constructs import Construct

from .constructs.static_site import StaticSiteConstruct
from .constructs.database import DatabaseConstruct
from .constructs.auth import AuthConstruct
from .constructs.dns import DnsConstruct

GITHUB_ORG = "CarsonDavis"
GITHUB_REPO = "bassbuzz-schedule"


class BassBuzzStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, environment: str = "prod", **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Apply consistent tags to all resources
        Tags.of(self).add("Project", "BassPracticeTracker")
        Tags.of(self).add("Environment", environment)
        Tags.of(self).add("Owner", "codebycarson")
        Tags.of(self).add("ManagedBy", "CDK")
        Tags.of(self).add("Repository", "bassbuzz-schedule")

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

        # ── GitHub Actions deploy role (OIDC) ─────────────────────────
        # Replaces the long-lived IAM-user access keys this repo used to
        # ship deploys with. Trust is bound to this repo via the
        # OIDC `sub` claim; permissions are tight (only the things the
        # workflow actually does).
        oidc_provider = iam.OpenIdConnectProvider.from_open_id_connect_provider_arn(
            self,
            "GitHubOidc",
            f"arn:aws:iam::{self.account}:oidc-provider/token.actions.githubusercontent.com",
        )
        deploy_role = iam.Role(
            self,
            "GitHubActionsDeployRole",
            assumed_by=iam.FederatedPrincipal(
                oidc_provider.open_id_connect_provider_arn,
                conditions={
                    "StringEquals": {
                        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                    },
                    "StringLike": {
                        "token.actions.githubusercontent.com:sub": f"repo:{GITHUB_ORG}/{GITHUB_REPO}:*",
                    },
                },
                assume_role_action="sts:AssumeRoleWithWebIdentity",
            ),
            description="Role assumed by GitHub Actions for bassbuzz-schedule deploys",
        )

        # Direct grants for the post-CDK steps in deploy.yml
        static_site.bucket.grant_read_write(deploy_role)
        static_site.bucket.grant_delete(deploy_role)
        deploy_role.add_to_policy(
            iam.PolicyStatement(
                actions=["cloudfront:CreateInvalidation"],
                resources=[
                    f"arn:aws:cloudfront::{self.account}:distribution/{static_site.distribution.distribution_id}"
                ],
            )
        )

        # CDK deploy from CI: assume the bootstrap roles. Modern CDK
        # delegates all CloudFormation/IAM/asset-upload work to those.
        cdk_qualifier = "hnb659fds"
        cdk_role_arns = [
            f"arn:aws:iam::{self.account}:role/cdk-{cdk_qualifier}-{purpose}-{self.account}-{self.region}"
            for purpose in (
                "deploy-role",
                "file-publishing-role",
                "lookup-role",
            )
        ]
        deploy_role.add_to_policy(
            iam.PolicyStatement(
                actions=["sts:AssumeRole"],
                resources=cdk_role_arns,
            )
        )
        # `cdk bootstrap || true` runs in the workflow but its failure is
        # tolerated; the bucket is already bootstrapped. We don't grant
        # bootstrap perms to keep the blast radius small.

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

        CfnOutput(
            self, "GitHubActionsDeployRoleArn",
            value=deploy_role.role_arn,
            description="ARN to set as the AWS_DEPLOY_ROLE_ARN repo secret"
        )