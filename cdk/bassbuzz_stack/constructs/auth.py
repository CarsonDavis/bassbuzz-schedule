from aws_cdk import (
    aws_cognito as cognito,
    aws_iam as iam,
)
from constructs import Construct


class AuthConstruct(Construct):
    def __init__(
        self, 
        scope: Construct, 
        construct_id: str,
        identity_pool_name: str,
        table_arn: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Cognito Identity Pool for federated identity
        self.identity_pool = cognito.CfnIdentityPool(
            self, "IdentityPool",
            identity_pool_name=identity_pool_name,
            allow_unauthenticated_identities=False,
            supported_login_providers={
                "accounts.google.com": "GOOGLE_CLIENT_ID_PLACEHOLDER"
            }
        )

        # IAM role for authenticated users
        self.authenticated_role = iam.Role(
            self, "AuthenticatedRole",
            assumed_by=iam.FederatedPrincipal(
                "cognito-identity.amazonaws.com",
                conditions={
                    "StringEquals": {
                        "cognito-identity.amazonaws.com:aud": self.identity_pool.ref
                    },
                    "ForAnyValue:StringLike": {
                        "cognito-identity.amazonaws.com:amr": "authenticated"
                    }
                },
                assume_role_action="sts:AssumeRoleWithWebIdentity"
            ),
            description="Role for authenticated users to access DynamoDB"
        )

        # IAM policy for DynamoDB access (identity-scoped)
        dynamodb_policy = iam.PolicyStatement(
            effect=iam.Effect.ALLOW,
            actions=[
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem"
            ],
            resources=[table_arn],
            conditions={
                "ForAllValues:StringEquals": {
                    "dynamodb:LeadingKeys": ["${cognito-identity.amazonaws.com:sub}"]
                }
            }
        )

        # Add the policy to the authenticated role
        self.authenticated_role.add_to_policy(dynamodb_policy)

        # IAM role for unauthenticated users (minimal permissions)
        unauthenticated_role = iam.Role(
            self, "UnauthenticatedRole",
            assumed_by=iam.FederatedPrincipal(
                "cognito-identity.amazonaws.com",
                conditions={
                    "StringEquals": {
                        "cognito-identity.amazonaws.com:aud": self.identity_pool.ref
                    },
                    "ForAnyValue:StringLike": {
                        "cognito-identity.amazonaws.com:amr": "unauthenticated"
                    }
                },
                assume_role_action="sts:AssumeRoleWithWebIdentity"
            ),
            description="Role for unauthenticated users (no permissions)"
        )

        # Attach roles to identity pool
        cognito.CfnIdentityPoolRoleAttachment(
            self, "IdentityPoolRoleAttachment",
            identity_pool_id=self.identity_pool.ref,
            roles={
                "authenticated": self.authenticated_role.role_arn,
                "unauthenticated": unauthenticated_role.role_arn
            }
        )