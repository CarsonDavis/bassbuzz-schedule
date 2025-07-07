from aws_cdk import (
    aws_route53 as route53,
    aws_certificatemanager as acm,
)
from constructs import Construct


class DnsConstruct(Construct):
    def __init__(
        self, 
        scope: Construct, 
        construct_id: str,
        domain_name: str,
        hosted_zone_name: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Look up existing hosted zone
        self.hosted_zone = route53.HostedZone.from_lookup(
            self, "HostedZone",
            domain_name=hosted_zone_name
        )

        # Create SSL certificate for the domain
        self.certificate = acm.Certificate(
            self, "Certificate",
            domain_name=domain_name,
            validation=acm.CertificateValidation.from_dns(self.hosted_zone),
            subject_alternative_names=[f"*.{hosted_zone_name}"]
        )