/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The standard tag keys every AdaptiveWorX-managed resource can carry, on any
 * provider. iac-core validates their values (StandardTagsSchema) and
 * iac-policies requires a subset by default (DEFAULT_REQUIRED_TAGS).
 *
 * - Environment: the deploying environment (dev, stg, prd, sec)
 * - Tenant: the tenant / org prefix (worx)
 * - AccountPurpose, StackPurpose: the stack name's segments
 * - TargetEnvironment: the environment a centralized resource serves
 * - Workload: the workload the resource belongs to (flow, ztna, …; "shared"
 *   for shared infrastructure). Permission boundaries and ABAC conditions
 *   scope access by it, so it is the tag a workload role is limited to.
 * - ManagedBy: the tool that owns the resource ("pulumi")
 * - Description: free text
 */
export const STANDARD_TAG_KEYS = [
  "Environment",
  "Tenant",
  "AccountPurpose",
  "StackPurpose",
  "TargetEnvironment",
  "Workload",
  "ManagedBy",
  "Description",
] as const;

/** One of {@link STANDARD_TAG_KEYS}. */
export type StandardTagKey = (typeof STANDARD_TAG_KEYS)[number];
