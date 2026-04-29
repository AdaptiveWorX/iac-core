/**
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cross-Account IAM Roles for Product Line Architecture
 * TypeScript implementation of IAM roles and policies for cross-account Pulumi operations
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
  buildCrossAccountPolicyName,
  buildCrossAccountRoleName,
  buildFoundationAccessPolicyName,
  buildFoundationAccessRoleName,
  getEnvironmentSegment,
} from "./naming.js";
import type { Environment } from "./types.js";

export interface CrossAccountRoleConfig {
  productLine: string;
  environment: Environment;
  trustedAccountIds?: string[];
  externalId?: string;
}

/**
 * Component that creates IAM roles for cross-account operations
 */
export class CrossAccountIAMRoles extends pulumi.ComponentResource {
  public readonly crossAccountRole: aws.iam.Role;
  public readonly foundationAccessRole: aws.iam.Role | undefined;
  public readonly route53HealthCheckRole: aws.iam.Role;
  private readonly productLine: string;

  constructor(
    name: string,
    config: CrossAccountRoleConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("adaptiveworx:aws:CrossAccountIAMRoles", name, {}, opts);

    this.productLine = config.productLine;

    // Create roles for different access patterns
    this.crossAccountRole = this.createPulumiCrossAccountRole(config);
    this.foundationAccessRole = this.createFoundationAccessRole();
    this.route53HealthCheckRole = this.createRoute53HealthCheckRole();

    // Register outputs
    this.registerOutputs({
      crossAccountRoleArn: this.crossAccountRole.arn,
      foundationAccessRoleArn: this.foundationAccessRole?.arn,
      route53HealthCheckRoleArn: this.route53HealthCheckRole.arn,
    });
  }

  /**
   * Create the main Pulumi cross-account role
   */
  private createPulumiCrossAccountRole(config: CrossAccountRoleConfig): aws.iam.Role {
    // Build list of trusted accounts
    const trustedAccounts = config.trustedAccountIds ?? [];

    // Create assume role policy
    const assumeRolePolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow" as const,
          Principal: {
            AWS: trustedAccounts.map(accountId => `arn:aws:iam::${accountId}:root`),
          },
          Action: "sts:AssumeRole",
          Condition: {
            StringEquals: {
              "sts:ExternalId": config.externalId ?? `pulumi-${this.productLine}-cross-account`,
            },
          },
        },
      ],
    };

    // Create the role
    const environmentSegment = getEnvironmentSegment(config.environment);
    const roleName = buildCrossAccountRoleName(this.productLine, config.environment);

    const role = new aws.iam.Role(
      `${this.productLine}-${config.environment}-pulumi-cross-account-role`,
      {
        name: roleName,
        assumeRolePolicy: JSON.stringify(assumeRolePolicy),
        description: `Allows Pulumi cross-account operations for ${this.productLine} ${environmentSegment}`,
        maxSessionDuration: 3600, // 1 hour
        tags: {
          ProductLine: this.productLine,
          Purpose: "cross-account-automation",
          ManagedBy: "pulumi",
        },
      },
      { parent: this }
    );

    // Create comprehensive policy for Pulumi operations
    const policyName = buildCrossAccountPolicyName(this.productLine, config.environment);

    new aws.iam.RolePolicy(
      `${this.productLine}-${config.environment}-pulumi-cross-account-policy`,
      {
        name: policyName,
        role: role.id,
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            // EC2 and VPC permissions
            {
              Effect: "Allow",
              Action: ["ec2:*"],
              Resource: "*",
            },
            // Load Balancer permissions
            {
              Effect: "Allow",
              Action: ["elasticloadbalancing:*"],
              Resource: "*",
            },
            // Route53 DNS permissions
            {
              Effect: "Allow",
              Action: [
                "route53:GetHostedZone",
                "route53:ListHostedZones",
                "route53:GetChange",
                "route53:ChangeResourceRecordSets",
                "route53:ListResourceRecordSets",
                "route53:CreateHealthCheck",
                "route53:GetHealthCheck",
                "route53:UpdateHealthCheck",
                "route53:DeleteHealthCheck",
                "route53:ListHealthChecks",
              ],
              Resource: "*",
            },
            // RDS permissions
            {
              Effect: "Allow",
              Action: ["rds:*"],
              Resource: "*",
            },
            // Certificate Manager
            {
              Effect: "Allow",
              Action: ["acm:ListCertificates", "acm:GetCertificate", "acm:DescribeCertificate"],
              Resource: "*",
            },
            // IAM permissions (limited)
            {
              Effect: "Allow",
              Action: [
                "iam:GetRole",
                "iam:GetRolePolicy",
                "iam:ListRolePolicies",
                "iam:ListAttachedRolePolicies",
                "iam:GetInstanceProfile",
                "iam:ListInstanceProfiles",
                "iam:PassRole",
              ],
              Resource: "*",
            },
            // CloudWatch permissions
            {
              Effect: "Allow",
              Action: ["cloudwatch:*", "logs:*"],
              Resource: "*",
            },
            // Resource tagging
            {
              Effect: "Allow",
              Action: ["tag:GetResources", "tag:TagResources", "tag:UntagResources"],
              Resource: "*",
            },
          ],
        }),
      },
      { parent: this }
    );

    return role;
  }

  /**
   * Create role for foundation account access (for audit/compliance)
   */
  private createFoundationAccessRole(): aws.iam.Role | undefined {
    try {
      // Foundation account IDs (hardcoded as they're static)
      const foundationAccountIds = [
        "339932683779", // adaptive-master
        "304624012516", // adaptive-audit
        "346692023911", // adaptive-backup-admin
        "743833338893", // adaptive-central-backup
        "539920679260", // adaptive-log-archive
      ];

      const assumeRolePolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow" as const,
            Principal: {
              AWS: foundationAccountIds.map(id => `arn:aws:iam::${id}:root`),
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "sts:ExternalId": `foundation-access-${this.productLine}`,
              },
            },
          },
        ],
      };

      const roleName = buildFoundationAccessRoleName(this.productLine);

      const role = new aws.iam.Role(
        `${this.productLine}-foundation-access-role`,
        {
          name: roleName,
          assumeRolePolicy: JSON.stringify(assumeRolePolicy),
          description: `Allows foundation accounts to access ${this.productLine} resources for audit/compliance`,
          maxSessionDuration: 3600,
          tags: {
            ProductLine: this.productLine,
            Purpose: "foundation-access",
            ManagedBy: "pulumi",
          },
        },
        { parent: this }
      );

      // Limited read-only policy for foundation access
      const policyName = buildFoundationAccessPolicyName(this.productLine);

      new aws.iam.RolePolicy(
        `${this.productLine}-foundation-access-policy`,
        {
          name: policyName,
          role: role.id,
          policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: [
                  "ec2:Describe*",
                  "rds:Describe*",
                  "elasticloadbalancing:Describe*",
                  "route53:Get*",
                  "route53:List*",
                  "cloudwatch:Get*",
                  "cloudwatch:List*",
                  "logs:Describe*",
                  "logs:Get*",
                  "iam:Get*",
                  "iam:List*",
                  "tag:GetResources",
                ],
                Resource: "*",
              },
            ],
          }),
        },
        { parent: this }
      );

      return role;
    } catch (error) {
      const warningMessage = error instanceof Error ? error.message : JSON.stringify(error);
      void pulumi.log.warn(`Foundation access role creation skipped: ${warningMessage}`);
      return undefined;
    }
  }

  /**
   * Create service roles for secops operations
   */
  private createRoute53HealthCheckRole(): aws.iam.Role {
    // Role for Route53 health check service
    const roleName = `${this.productLine}-route53-health-check`;

    const role = new aws.iam.Role(
      `${this.productLine}-route53-health-check-role`,
      {
        name: roleName,
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "route53healthcheck.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            },
          ],
        }),
        description: `Role for Route53 health checks in ${this.productLine} secops`,
        tags: {
          ProductLine: this.productLine,
          Purpose: "route53-health-checks",
          ManagedBy: "pulumi",
        },
      },
      { parent: this }
    );

    // Policy for health check role
    const policyName = `${this.productLine}-route53-health-check-policy`;

    new aws.iam.RolePolicy(
      `${this.productLine}-route53-health-check-policy`,
      {
        name: policyName,
        role: role.id,
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["sns:Publish"],
              Resource: `arn:aws:sns:*:*:${this.productLine}-health-*`,
            },
          ],
        }),
      },
      { parent: this }
    );

    return role;
  }
}

/**
 * Create IAM roles and policies for cross-account operations
 */
export function createCrossAccountIAMSetup(
  productLine: string,
  environment: Environment,
  trustedAccountIds?: string[]
): CrossAccountIAMRoles {
  // Create the IAM roles component
  const config: CrossAccountRoleConfig = {
    productLine,
    environment,
    externalId: `pulumi-${productLine}-cross-account`,
  };

  if (trustedAccountIds && trustedAccountIds.length > 0) {
    config.trustedAccountIds = trustedAccountIds;
  }

  const iamRoles = new CrossAccountIAMRoles(`${productLine}-cross-account-iam`, config);

  return iamRoles;
}

/**
 * Helper function to construct cross-account role ARN
 */
export function getCrossAccountRoleArn(
  accountId: string,
  productLine: string,
  environment: Environment
): string {
  return `arn:aws:iam::${accountId}:role/${buildCrossAccountRoleName(productLine, environment)}`;
}

/**
 * Helper function to construct foundation access role ARN
 */
export function getFoundationAccessRoleArn(accountId: string, productLine: string): string {
  return `arn:aws:iam::${accountId}:role/${buildFoundationAccessRoleName(productLine)}`;
}

/**
 * Example IAM policy for Pulumi execution role (to be created manually or via CloudFormation)
 */
export const PULUMI_EXECUTION_POLICY_TEMPLATE = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow" as const,
      Action: "sts:AssumeRole",
      Resource: [
        "arn:aws:iam::*:role/*-pulumi-cross-account",
        "arn:aws:iam::*:role/*-foundation-access",
      ],
      Condition: {
        StringEquals: {
          "sts:ExternalId": [
            "pulumi-worx-cross-account",
            "pulumi-care-cross-account",
            "foundation-access-worx",
            "foundation-access-care",
          ],
        },
      },
    },
  ],
};
