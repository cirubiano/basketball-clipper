import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import { Construct } from "constructs";

export class BasketballClipperStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC ──────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    // ── S3 — video and clip storage ───────────────────────────────────────
    const videoBucket = new s3.Bucket(this, "VideoBucket", {
      bucketName: `basketball-clipper-videos-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          // Move raw uploads to Infrequent Access after 30 days
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // ── RDS PostgreSQL ────────────────────────────────────────────────────
    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSg", { vpc });

    const database = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      databaseName: "basketball_clipper",
      credentials: rds.Credentials.fromGeneratedSecret("basketball", {
        secretName: "basketball-clipper/db-credentials",
      }),
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
    });

    // ── ElastiCache Redis — Celery broker + WebSocket pub-sub ─────────────
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(
      this,
      "RedisSubnetGroup",
      {
        description: "Subnet group for Basketball Clipper Redis",
        subnetIds: vpc.privateSubnets.map((s) => s.subnetId),
      }
    );

    new elasticache.CfnCacheCluster(this, "Redis", {
      cacheNodeType: "cache.t3.micro",
      engine: "redis",
      numCacheNodes: 1,
      cacheSubnetGroupName: redisSubnetGroup.ref,
    });

    // TODO (Phase 1 completion):
    //   - ECS Fargate cluster + service for FastAPI backend
    //   - EC2 g4dn Auto Scaling group for Celery GPU workers
    //   - SQS queue for video processing jobs
    //   - ALB + HTTPS listener
    //   - CloudFront distribution
    //   - Cognito user pool
    //   - Secrets Manager entries

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "VideoBucketName", {
      value: videoBucket.bucketName,
    });
    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: database.instanceEndpoint.hostname,
    });
  }
}
