from aws_cdk import (
    RemovalPolicy,
    aws_dynamodb as dynamodb,
)
from constructs import Construct


class DatabaseConstruct(Construct):
    def __init__(
        self, 
        scope: Construct, 
        construct_id: str,
        table_name: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # DynamoDB table for user progress data
        self.table = dynamodb.Table(
            self, "PracticeDataTable",
            table_name=table_name,
            partition_key=dynamodb.Attribute(
                name="userId",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
            point_in_time_recovery=True,
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
            stream=dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
        )

        # Add a Global Secondary Index for potential future queries
        # This could be used for analytics or admin queries
        self.table.add_global_secondary_index(
            index_name="LastUpdatedIndex",
            partition_key=dynamodb.Attribute(
                name="lastUpdated",
                type=dynamodb.AttributeType.NUMBER
            ),
            projection_type=dynamodb.ProjectionType.KEYS_ONLY
        )