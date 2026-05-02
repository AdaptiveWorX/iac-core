/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @adaptiveworx/iac-policies — composable Pulumi policy primitives.
 *
 * This package is a LIBRARY of factory functions, not a complete policy
 * pack. Consumers compose primitives into their own `PolicyPack`:
 *
 *     import { PolicyPack } from "@pulumi/policy";
 *     import {
 *       requireTagsPolicy,
 *       regionalCompliancePolicy,
 *       awsSecurityBaselinePolicy,
 *       deploymentProtectionPolicy,
 *     } from "@adaptiveworx/iac-policies";
 *
 *     new PolicyPack("my-pack", {
 *       policies: [
 *         requireTagsPolicy({ requiredTags: ["Environment", "Owner"] }),
 *         regionalCompliancePolicy({ allowedRegions: ["us-east-1"] }),
 *         awsSecurityBaselinePolicy(),
 *         deploymentProtectionPolicy({
 *           productionEnvironments: ["prd"],
 *           environmentResolver: () => process.env.ENV ?? "dev",
 *         }),
 *       ],
 *     });
 *
 * See README for full AWS-consumer and Azure-consumer examples.
 */

export { emitEvidence } from "./evidence.js";
export {
  AWS_NON_TAGGABLE_RESOURCES,
  type AwsSecurityBaselineChecks,
  type AwsSecurityBaselineOptions,
  awsSecurityBaselinePolicy,
  type DeploymentProtectionOptions,
  deploymentProtectionPolicy,
  type RegionalComplianceOptions,
  type RequireTagsOptions,
  regionalCompliancePolicy,
  requireTagsPolicy,
} from "./policies/index.js";
export type { ComplianceEvidence, FrameworkControls } from "./types.js";
