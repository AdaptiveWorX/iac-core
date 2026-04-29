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
 */

export * from "./cross-account-roles.js";
export * from "./github-actions-oidc.js";
export * from "./iam-policies.js";
export * from "./naming.js";
export * from "./shared-vpc.js";
export type * from "./types.js";
