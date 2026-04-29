/**
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Composable IAM policies for cross-account operations
 * TypeScript implementation providing least-privilege access for specific services
 */

import * as aws from "@pulumi/aws";
import type { ResourceOptions } from "@pulumi/pulumi";

type IamCondition = Record<string, string | string[] | Record<string, string | string[]>>;

export interface PolicyDocument {
  Version: string;
  Statement: Array<{
    Effect: "Allow" | "Deny";
    Action: string[];
    Resource: string | string[];
    Condition?: IamCondition;
  }>;
}

/**
 * Route53 DNS management policy for secops accounts
 */
export function getRoute53PolicyDocument(): PolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "route53:ChangeResourceRecordSets",
          "route53:GetHostedZone",
          "route53:ListResourceRecordSets",
          "route53:GetHealthCheck",
          "route53:CreateHealthCheck",
          "route53:DeleteHealthCheck",
          "route53:UpdateHealthCheck",
        ],
        Resource: "*",
      },
    ],
  };
}

/**
 * Read ALB information for DNS updates and health checks
 */
export function getALBDescribePolicyDocument(): PolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeRules",
          "ec2:DescribeInstances",
          "ec2:DescribeNetworkInterfaces",
        ],
        Resource: "*",
      },
    ],
  };
}

/**
 * Read RDS database information for DNS updates
 */
export function getRDSDescribePolicyDocument(): PolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "rds:DescribeDBInstances",
          "rds:DescribeDBClusters",
          "rds:ListTagsForResource",
          "rds:DescribeDBSubnetGroups",
        ],
        Resource: "*",
      },
    ],
  };
}

/**
 * Read EC2 instance information for DNS updates
 */
export function getEC2DescribePolicyDocument(): PolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "ec2:DescribeInstances",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeVpcs",
          "ec2:DescribeSubnets",
        ],
        Resource: "*",
      },
    ],
  };
}

/**
 * Read CloudWatch metrics for health checks
 */
export function getCloudWatchReadPolicyDocument(): PolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "cloudwatch:DescribeAlarms",
        ],
        Resource: "*",
      },
    ],
  };
}

/**
 * Read S3 bucket information for static website DNS
 */
export function getS3ReadPolicyDocument(): PolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:GetBucketLocation", "s3:GetBucketWebsite", "s3:ListBucket"],
        Resource: "*",
      },
    ],
  };
}

/**
 * Read CloudFront distribution information for DNS
 */
export function getCloudFrontDescribePolicyDocument(): PolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "cloudfront:GetDistribution",
          "cloudfront:ListDistributions",
          "cloudfront:GetDistributionConfig",
        ],
        Resource: "*",
      },
    ],
  };
}

/**
 * Read ACM certificate information for SSL validation
 */
export function getACMDescribePolicyDocument(): PolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["acm:ListCertificates", "acm:DescribeCertificate", "acm:GetCertificate"],
        Resource: "*",
      },
    ],
  };
}

/**
 * Attach multiple policies to a role
 */
export function attachPoliciesToRole(
  roleName: string,
  policies: ReadonlyArray<{ readonly name: string; readonly document: PolicyDocument }>,
  orgPrefix: string,
  environment: string,
  opts?: ResourceOptions
): aws.iam.RolePolicy[] {
  const attachedPolicies: aws.iam.RolePolicy[] = [];

  for (const policy of policies) {
    const policyName = policy.name.toLowerCase();

    const rolePolicy = new aws.iam.RolePolicy(
      `${orgPrefix}-${policyName}-policy-${environment}`,
      {
        role: roleName,
        policy: JSON.stringify(policy.document),
      },
      opts
    );

    attachedPolicies.push(rolePolicy);
  }

  return attachedPolicies;
}

/**
 * Pre-defined combinations of policies for common use cases
 */
export const PolicyCombinations = {
  // ALB + DNS operations (most common)
  ALB_DNS: [
    { name: "route53", document: getRoute53PolicyDocument() },
    { name: "alb-describe", document: getALBDescribePolicyDocument() },
    { name: "ec2-describe", document: getEC2DescribePolicyDocument() },
  ],

  // RDS + DNS operations
  DATABASE_DNS: [
    { name: "route53", document: getRoute53PolicyDocument() },
    { name: "rds-describe", document: getRDSDescribePolicyDocument() },
    { name: "ec2-describe", document: getEC2DescribePolicyDocument() },
  ],

  // Static website + DNS (S3/CloudFront)
  STATIC_WEBSITE_DNS: [
    { name: "route53", document: getRoute53PolicyDocument() },
    { name: "s3-read", document: getS3ReadPolicyDocument() },
    { name: "cloudfront-describe", document: getCloudFrontDescribePolicyDocument() },
    { name: "acm-describe", document: getACMDescribePolicyDocument() },
  ],

  // Health check monitoring
  HEALTH_CHECK_MONITORING: [
    { name: "route53", document: getRoute53PolicyDocument() },
    { name: "cloudwatch-read", document: getCloudWatchReadPolicyDocument() },
    { name: "alb-describe", document: getALBDescribePolicyDocument() },
  ],

  // Full application stack (ALB + RDS + monitoring)
  FULL_APPLICATION_STACK: [
    { name: "route53", document: getRoute53PolicyDocument() },
    { name: "alb-describe", document: getALBDescribePolicyDocument() },
    { name: "rds-describe", document: getRDSDescribePolicyDocument() },
    { name: "ec2-describe", document: getEC2DescribePolicyDocument() },
    { name: "cloudwatch-read", document: getCloudWatchReadPolicyDocument() },
  ],
} as const;

/**
 * Attach a pre-defined combination of policies to a role
 */
export function attachPolicyCombination(
  roleName: string,
  combinationName: keyof typeof PolicyCombinations,
  orgPrefix: string,
  environment: string,
  opts?: ResourceOptions
): aws.iam.RolePolicy[] {
  const combination = PolicyCombinations[combinationName];

  return attachPoliciesToRole(roleName, combination, orgPrefix, environment, opts);
}
