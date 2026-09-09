"""Sopkoll AWS infrastructure (CDK).

Two stacks, mirroring snicksnack:
- SopkollCert (us-east-1): the CloudFront certificate.
- Sopkoll (eu-north-1): S3 + CloudFront for the static app at sopkoll.korist.se
  with /api/* proxied to api.sopkoll.korist.se, which is the *existing*
  snicksnack EC2 box (Caddy in front of a third uvicorn on port 8002).

The box itself belongs to the Snicksnack stack. This stack only adds DNS for
it, a deploy bucket its instance role may read, and reads the instance id,
Elastic IP and role name from the Snicksnack stack at synth time.
"""

# pyright: reportArgumentType=false

import os

import boto3
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    aws_certificatemanager as acm,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_iam as iam,
    aws_route53 as route53,
    aws_route53_targets as targets,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
)
from constructs import Construct

ACCOUNT = os.environ.get("CDK_DEFAULT_ACCOUNT")
if not ACCOUNT:
    raise SystemExit("No AWS account: run through the `cdk` CLI with credentials available.")

REGION = "eu-north-1"
ZONE_NAME = "korist.se"
DOMAIN = "sopkoll.korist.se"
API_DOMAIN = "api.sopkoll.korist.se"
SERVER_STACK = "Snicksnack"


def server_facts() -> dict[str, str]:
    """Instance id, public IP and IAM role name of the shared box."""
    cfn = boto3.client("cloudformation", region_name=REGION)
    outputs = {
        o["OutputKey"]: o["OutputValue"]
        for o in cfn.describe_stacks(StackName=SERVER_STACK)["Stacks"][0]["Outputs"]
    }
    ec2 = boto3.client("ec2", region_name=REGION)
    reservation = ec2.describe_instances(InstanceIds=[outputs["OutInstanceId"]])
    profile_arn = reservation["Reservations"][0]["Instances"][0]["IamInstanceProfile"]["Arn"]
    profile_name = profile_arn.rsplit("/", 1)[1]
    role_name = boto3.client("iam").get_instance_profile(InstanceProfileName=profile_name)[
        "InstanceProfile"
    ]["Roles"][0]["RoleName"]
    return {
        "instance_id": outputs["OutInstanceId"],
        "public_ip": outputs["OutServerPublicIp"],
        "role_name": role_name,
    }


class CertStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        zone = route53.HostedZone.from_lookup(self, "Zone", domain_name=ZONE_NAME)
        self.cert = acm.Certificate(
            self,
            "WebCert",
            domain_name=DOMAIN,
            validation=acm.CertificateValidation.from_dns(zone),
        )


class SopkollStack(Stack):
    def __init__(
        self, scope: Construct, construct_id: str, cert: acm.ICertificate, **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        zone = route53.HostedZone.from_lookup(self, "Zone", domain_name=ZONE_NAME)
        server = server_facts()

        # --- Server side: code bucket + DNS for the shared box ---
        deploy_bucket = s3.Bucket(
            self,
            "DeployBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=cdk.RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        # The device database is tiny but irreplaceable (every push subscription).
        backup_bucket = s3.Bucket(
            self,
            "BackupBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=cdk.RemovalPolicy.RETAIN,
            lifecycle_rules=[s3.LifecycleRule(prefix="db/", expiration=cdk.Duration.days(30))],
        )
        # Not "ServerRole": isabelle uses that id on the same role, and CDK names the inline
        # policy after the construct path, so both stacks would fight over one policy.
        role = iam.Role.from_role_name(self, "SopkollServerRole", server["role_name"])
        deploy_bucket.grant_read(role)
        backup_bucket.grant_read_write(role)

        route53.ARecord(
            self,
            "ApiDns",
            zone=zone,
            record_name=API_DOMAIN,
            target=route53.RecordTarget.from_ip_addresses(server["public_ip"]),
            ttl=cdk.Duration.minutes(5),
        )

        # --- Web app: S3 + CloudFront, /api proxied to the server ---
        web_bucket = s3.Bucket(
            self,
            "WebBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=cdk.RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        api_behavior = cloudfront.BehaviorOptions(
            origin=origins.HttpOrigin(
                API_DOMAIN, protocol_policy=cloudfront.OriginProtocolPolicy.HTTPS_ONLY
            ),
            allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
            cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
            origin_request_policy=cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        )
        distribution = cloudfront.Distribution(
            self,
            "Web",
            default_root_object="index.html",
            domain_names=[DOMAIN],
            certificate=cert,
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(web_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
            ),
            additional_behaviors={"/api/*": api_behavior},
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
            # Single-page app: deep links (/app, /items/<id>) are files that do not
            # exist in the bucket, so hand them index.html and let the router decide.
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403, response_http_status=200, response_page_path="/index.html",
                    ttl=cdk.Duration.seconds(0),
                ),
                cloudfront.ErrorResponse(
                    http_status=404, response_http_status=200, response_page_path="/index.html",
                    ttl=cdk.Duration.seconds(0),
                ),
            ],
        )
        s3deploy.BucketDeployment(
            self,
            "WebDeploy",
            # The Vite build output: `npm run build` in apps/web must run first.
            sources=[s3deploy.Source.asset("../apps/web/dist")],
            destination_bucket=web_bucket,
            distribution=distribution,
            # Vite fingerprints assets, so only index.html, sw.js and the manifest ever
            # change in place; a short max-age gets a deploy to users on the next open.
            cache_control=[s3deploy.CacheControl.max_age(cdk.Duration.minutes(5))],
        )
        route53.ARecord(
            self,
            "WebDns",
            zone=zone,
            record_name=DOMAIN,
            target=route53.RecordTarget.from_alias(targets.CloudFrontTarget(distribution)),
        )

        cdk.CfnOutput(self, "OutInstanceId", value=server["instance_id"])
        cdk.CfnOutput(self, "OutDeployBucket", value=deploy_bucket.bucket_name)
        cdk.CfnOutput(self, "OutBackupBucket", value=backup_bucket.bucket_name)
        cdk.CfnOutput(self, "OutWebUrl", value=f"https://{DOMAIN}")


app = cdk.App()
cert_stack = CertStack(
    app,
    "SopkollCert",
    env=cdk.Environment(account=ACCOUNT, region="us-east-1"),
    cross_region_references=True,
)
SopkollStack(
    app,
    "Sopkoll",
    cert=cert_stack.cert,
    env=cdk.Environment(account=ACCOUNT, region=REGION),
    cross_region_references=True,
)
app.synth()
