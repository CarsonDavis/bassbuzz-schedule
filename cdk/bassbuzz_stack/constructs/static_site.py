from aws_cdk import (
    Duration,
    RemovalPolicy,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_certificatemanager as acm,
    aws_route53 as route53,
    aws_route53_targets as targets,
)
from constructs import Construct


class StaticSiteConstruct(Construct):
    def __init__(
        self, 
        scope: Construct, 
        construct_id: str,
        domain_name: str,
        certificate: acm.Certificate,
        hosted_zone: route53.IHostedZone,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # S3 Bucket for static website hosting
        self.bucket = s3.Bucket(
            self, "StaticSiteBucket",
            bucket_name=f"bass-practice-{self.node.addr}".lower(),
            public_read_access=False,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True
        )

        # Origin Access Identity for CloudFront
        origin_access_identity = cloudfront.OriginAccessIdentity(
            self, "OriginAccessIdentity",
            comment=f"OAI for {domain_name}"
        )

        # Grant CloudFront access to S3 bucket
        self.bucket.grant_read(origin_access_identity)

        # CloudFront distribution
        self.distribution = cloudfront.Distribution(
            self, "Distribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_identity(
                    self.bucket,
                    origin_access_identity=origin_access_identity
                ),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                compress=True
            ),
            domain_names=[domain_name],
            certificate=certificate,
            minimum_protocol_version=cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            default_root_object="index.html",
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(5)
                ),
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(5)
                )
            ],
            comment=f"CloudFront distribution for {domain_name}"
        )

        # Route 53 A record pointing to CloudFront
        route53.ARecord(
            self, "AliasRecord",
            zone=hosted_zone,
            record_name=domain_name.replace(f".{hosted_zone.zone_name}", ""),
            target=route53.RecordTarget.from_alias(
                targets.CloudFrontTarget(self.distribution)
            )
        )