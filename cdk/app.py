#!/usr/bin/env python3
import os
import aws_cdk as cdk
from bassbuzz_stack.bassbuzz_stack import BassBuzzStack

app = cdk.App()

# Get environment from context
environment = app.node.try_get_context("environment") or "prod"

# Get environment configuration
env = cdk.Environment(
    account=os.getenv('CDK_DEFAULT_ACCOUNT'),
    region='us-east-1'  # Match the region in our JavaScript code
)

# Create stack name based on environment
stack_name = "BassBuzzStack"
if environment != "prod":
    stack_name = f"BassBuzzStack-{environment}"

# Create the main stack
BassBuzzStack(
    app, 
    stack_name,
    environment=environment,
    env=env,
    description=f"Bass Practice Tracker - {environment.title()} environment"
)

app.synth()