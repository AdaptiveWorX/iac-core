/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AWS Organization model — the AWS-Org-shaped pieces that used to live
 * inside `@adaptiveworx/iac-core`'s `OrganizationConfig.cloudProviders.aws`
 * field.
 *
 * `iac-core` keeps the cloud-agnostic pieces (orgName, tenant, env config,
 * naming convention, network strategy). This module owns the AWS-Org bits:
 * org ID, master/security accounts, AWS-specific region lists.
 */

/**
 * Inputs for `AwsOrganizationConfig`.
 *
 * Required: AWS Organization ID (the 12-digit numeric ID of the org's
 * management account is the conventional value, though any stable
 * identifier works for routing).
 */
export interface AwsOrganizationOptions {
  /** AWS Organization ID — typically the management account's account ID */
  awsOrganizationId: string;
  /** Display/profile name of the AWS Organization management account */
  masterAccount: string;
  /** Display/profile name of the security/audit account */
  securityAccount: string;
  /** Primary AWS regions where workloads run by default */
  primaryRegions: string[];
  /** AWS regions reserved for disaster recovery */
  drRegions: string[];
}

/**
 * Pure consumer of `AwsOrganizationOptions`. Compose with the
 * cloud-agnostic `OrganizationConfig` from `@adaptiveworx/iac-core` for
 * full deployment context.
 */
export class AwsOrganizationConfig {
  public readonly awsOrganizationId: string;
  public readonly masterAccount: string;
  public readonly securityAccount: string;
  public readonly primaryRegions: string[];
  public readonly drRegions: string[];

  constructor(opts: AwsOrganizationOptions) {
    if (!opts.awsOrganizationId) {
      throw new Error("AwsOrganizationOptions.awsOrganizationId is required.");
    }
    if (!(opts.masterAccount && opts.securityAccount)) {
      throw new Error("AwsOrganizationOptions.masterAccount and .securityAccount are required.");
    }
    this.awsOrganizationId = opts.awsOrganizationId;
    this.masterAccount = opts.masterAccount;
    this.securityAccount = opts.securityAccount;
    this.primaryRegions = opts.primaryRegions;
    this.drRegions = opts.drRegions;
  }

  isPrimaryRegion(region: string): boolean {
    return this.primaryRegions.includes(region);
  }

  isDrRegion(region: string): boolean {
    return this.drRegions.includes(region);
  }
}

// ---------------------------------------------------------------------------
// Adapter helpers — source `AwsOrganizationOptions` from a backend.
// ---------------------------------------------------------------------------

const parseList = (raw: string | undefined): string[] | undefined =>
  typeof raw === "string" && raw.length > 0
    ? raw
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0)
    : undefined;

/**
 * Load `AwsOrganizationOptions` from environment variables.
 *
 * Required env vars:
 *   IAC_AWS_ORG_ID, IAC_AWS_MASTER_ACCOUNT, IAC_AWS_SECURITY_ACCOUNT
 *
 * Optional (default to empty arrays):
 *   IAC_AWS_PRIMARY_REGIONS (comma-separated)
 *   IAC_AWS_DR_REGIONS (comma-separated)
 *
 * Throws if any required var is missing. Does not apply any
 * AdaptiveWorX-specific defaults — see `loadAdaptiveAwsDefaults()`.
 */
export function loadAwsOrganizationOptionsFromEnv(): AwsOrganizationOptions {
  const awsOrganizationId = process.env.IAC_AWS_ORG_ID;
  const masterAccount = process.env.IAC_AWS_MASTER_ACCOUNT;
  const securityAccount = process.env.IAC_AWS_SECURITY_ACCOUNT;

  if (!(awsOrganizationId && masterAccount && securityAccount)) {
    throw new Error(
      "loadAwsOrganizationOptionsFromEnv requires:\n" +
        "  IAC_AWS_ORG_ID\n" +
        "  IAC_AWS_MASTER_ACCOUNT\n" +
        "  IAC_AWS_SECURITY_ACCOUNT\n"
    );
  }

  return {
    awsOrganizationId,
    masterAccount,
    securityAccount,
    primaryRegions: parseList(process.env.IAC_AWS_PRIMARY_REGIONS) ?? [],
    drRegions: parseList(process.env.IAC_AWS_DR_REGIONS) ?? [],
  };
}

/**
 * Returns the AdaptiveWorX-canonical AWS organization defaults, with
 * env-var overrides on top. Intended for AdaptiveWorX-internal deployments.
 *
 * External consumers should NOT call this; use
 * `loadAwsOrganizationOptionsFromEnv()` or construct
 * `AwsOrganizationOptions` directly with their own values.
 */
export function loadAdaptiveAwsDefaults(): AwsOrganizationOptions {
  return {
    awsOrganizationId: process.env.IAC_AWS_ORG_ID ?? "289507152988",
    masterAccount: process.env.IAC_AWS_MASTER_ACCOUNT ?? "adaptive-master",
    securityAccount: process.env.IAC_AWS_SECURITY_ACCOUNT ?? "worx-secops",
    primaryRegions: parseList(process.env.IAC_AWS_PRIMARY_REGIONS) ?? ["us-east-1", "us-west-2"],
    drRegions: parseList(process.env.IAC_AWS_DR_REGIONS) ?? ["us-east-2", "eu-west-1"],
  };
}
