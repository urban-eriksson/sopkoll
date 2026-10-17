"""KoristProd: the production box for korist.se apps that have real users.

The shared snicksnack box stays the dev box (snicksnack, isabelle, the
bike-my-day notify timer, experiments). This stack owns only the machine:
instance, Elastic IP, role, security group. Apps add their own DNS, buckets
and grants in their own stacks and read the outputs below at synth time, the
way they read the Snicksnack stack today. Nothing an app deploys can then
replace the box.

Base software only (Caddy, uv, AWS CLI, sqlite3, swap). Each app's provision
script adds its own user, units and Caddy block over SSM.
"""

# pyright: reportArgumentType=false

from pathlib import Path

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2, aws_iam as iam
from constructs import Construct

# Ubuntu 24.04 amd64, pinned on 2026-10-17. Deliberately not the SSM "current"
# parameter: a new Canonical image would then replace the instance on the next
# deploy. Changing this is a rebuild, done on purpose.
AMI = "ami-0fd9576cca965bd19"


class ProdBoxStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, termination_protection=True, **kwargs)
        vpc = ec2.Vpc.from_lookup(self, "Vpc", is_default=True)

        sg = ec2.SecurityGroup(self, "ServerSg", vpc=vpc, description="korist.se prod box")
        for port, desc in [(80, "ACME http"), (443, "https")]:
            sg.add_ingress_rule(ec2.Peer.any_ipv4(), ec2.Port.tcp(port), desc)

        role = iam.Role(self, "ServerRole", assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"))
        role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonSSMManagedInstanceCore")
        )

        # Runs once, at first boot. Editing it later stops and starts the box on
        # the next deploy, so it stays minimal and setup belongs in provision scripts.
        user_data = Path(__file__).with_name("prod_box_user_data.sh").read_text()

        instance = ec2.Instance(
            self,
            "Server",
            vpc=vpc,
            # Same zone as the dev box: eu-north-1a has had no t3.micro capacity.
            vpc_subnets=ec2.SubnetSelection(
                subnet_type=ec2.SubnetType.PUBLIC, availability_zones=["eu-north-1c"]
            ),
            instance_type=ec2.InstanceType("t3.micro"),
            machine_image=ec2.MachineImage.generic_linux(
                {"eu-north-1": AMI}, user_data=ec2.UserData.custom(user_data)
            ),
            security_group=sg,
            role=role,
            require_imdsv2=True,
            block_devices=[
                ec2.BlockDevice(
                    device_name="/dev/sda1",
                    volume=ec2.BlockDeviceVolume.ebs(
                        10, encrypted=True, volume_type=ec2.EbsDeviceVolumeType.GP3
                    ),
                )
            ],
        )
        # Production data lives on this disk: no API call, stack update or stack
        # delete may take it. Removing the protection is a deliberate, separate step.
        instance.instance.disable_api_termination = True
        instance.apply_removal_policy(cdk.RemovalPolicy.RETAIN)

        # The IP is what DNS points at; keep it even if the stack goes.
        eip = ec2.CfnEIP(self, "ServerIp")
        eip.apply_removal_policy(cdk.RemovalPolicy.RETAIN)
        ec2.CfnEIPAssociation(
            self, "ServerIpAssoc", allocation_id=eip.attr_allocation_id,
            instance_id=instance.instance_id,
        )

        # Same output keys as the Snicksnack stack, so an app moves here by
        # changing only the stack name it reads.
        cdk.CfnOutput(self, "OutInstanceId", value=instance.instance_id)
        cdk.CfnOutput(self, "OutServerPublicIp", value=eip.attr_public_ip)
