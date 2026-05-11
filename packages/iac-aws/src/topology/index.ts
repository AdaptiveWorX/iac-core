/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AWS-Org-shaped pieces of AdaptiveWorX™ infrastructure-as-code:
 * organization config, account registry (sourced from a `SecretManager`),
 * AWS-specific CIDR allocation, and AWS region metadata.
 *
 * Companion to `@adaptiveworx/iac-core` — depends on it for the
 * cloud-agnostic primitives (StackContext, SecretManager, calculateVpcCidr,
 * etc.).
 */

export type {
  AccountInfo,
  AwsAccountRecord,
  AwsAccountRegistryOptions,
  AwsAccountsMap,
  FoundationAccount,
} from "./account-registry.js";
// Account registry
export {
  AwsAccountRegistry,
  getAccountById,
  getAccountByName,
  getAccountsByPurpose,
  getAwsAccountRegistry,
  getHubAccount,
  getSpokeAccounts,
  loadAdaptiveFoundationAccounts,
  parseAwsAccountsJson,
  setAwsAccountRegistry,
} from "./account-registry.js";
export { getAwsVpcCidr } from "./cidr.js";
export type { AwsOrganizationOptions } from "./organization.js";
// Organization config
export {
  AwsOrganizationConfig,
  loadAdaptiveAwsDefaults,
  loadAwsOrganizationOptionsFromEnv,
} from "./organization.js";
// AWS region metadata + CIDR
export {
  AWS_REGION_CIDR_OFFSETS,
  getAwsRegionCidrOffset,
  resolveAwsRegion,
} from "./regions.js";
