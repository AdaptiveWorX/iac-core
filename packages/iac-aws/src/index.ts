/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @adaptiveworx/iac-aws — public library entry point.
 *
 * Reusable Pulumi components for AWS:
 *   - SharedVpc                   (VPC with multi-tier subnets, NAT, flow logs, RAM)
 *   - CrossAccountIAMRoles        (cross-account Pulumi roles + foundation access)
 *   - GitHubActionsOIDC           (OIDC provider + deploy role for GitHub Actions)
 *   - iam-policies                (IAM policy helpers)
 *
 * AWS-specific naming helpers and types are also exported from this entry
 * point. Cross-cloud primitives live in @adaptiveworx/iac-core.
 *
 * The `topology/` subtree owns the AWS-Org-shaped configuration surface:
 *   - AwsAccountRegistry          (per-environment account discovery)
 *   - AwsOrganizationConfig       (org ID + master/security accounts + region lists)
 *   - getAwsVpcCidr               (per-environment + region CIDR allocation)
 *   - AWS_REGION_CIDR_OFFSETS     (stable region → /16 slot offsets)
 */

export * from "./cross-account-roles.js";
export * from "./github-actions-oidc.js";
export * from "./iam-policies.js";
export * from "./naming.js";
export * from "./shared-vpc.js";
export * from "./topology/index.js";
export type * from "./types.js";
