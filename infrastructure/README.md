# Basketball Clipper — Infrastructure

AWS CDK (TypeScript) stack for the Basketball Clipper platform.

## Services provisioned

| Service | Purpose |
|---|---|
| VPC | Isolated network with public + private subnets |
| S3 | Video uploads and clip storage |
| RDS PostgreSQL 16 | Primary database |
| ElastiCache Redis | Celery broker + WebSocket pub-sub |
| *(planned)* ECS Fargate | FastAPI backend |
| *(planned)* EC2 g4dn | Celery GPU workers |
| *(planned)* SQS | Video processing job queue |
| *(planned)* ALB | HTTPS load balancer |
| *(planned)* CloudFront | CDN for clips |
| *(planned)* Cognito | User auth |

## Setup

```bash
npm install

# Bootstrap CDK in your AWS account (one-time)
npx cdk bootstrap
```

## Commands

```bash
# Preview changes
npm run diff

# Synthesize CloudFormation template
npm run synth

# Deploy to AWS
npm run deploy

# Destroy all resources (careful!)
npm run destroy
```

## Prerequisites

- AWS CLI configured (`aws configure`)
- CDK bootstrapped in the target account/region
