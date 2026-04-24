#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { BasketballClipperStack } from "../lib/basketball-clipper-stack";

const app = new cdk.App();

new BasketballClipperStack(app, "BasketballClipperStack", {
  env: {
    account: process.env["CDK_DEFAULT_ACCOUNT"],
    region: process.env["CDK_DEFAULT_REGION"] ?? "us-east-1",
  },
  description: "Basketball Clipper platform — Phase 1",
});
