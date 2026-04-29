/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Organization Configuration — cloud-agnostic shape.
 *
 * `OrganizationConfig` carries org identity, environment classes, stack
 * naming convention, and CIDR allocation strategy. Cloud-specific
 * organization shapes (AWS Organizations, Azure Management Groups, GCP
 * Organizations + Folders) live in their respective sibling packages:
 *
 *   - `@adaptiveworx/iac-aws`   → `AwsOrganizationConfig`
 *   - `@adaptiveworx/iac-azure` → `AzureTenantConfig` (forthcoming)
 *   - `@adaptiveworx/iac-gcp`   → `GcpOrganizationConfig` (forthcoming)
 *
 * This module follows a "config-in, behavior-out" pattern: the class is
 * a pure consumer of validated options, and adapter helpers
 * (`loadOrganizationOptionsFromEnv`, `loadAdaptiveOrganizationDefaults`)
 * source those options from env vars, defaults, or — in the future —
 * other backends (file, SecretManager, etc.).
 */

import type { Environment } from "../types/core.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvironmentConfig {
  name: string;
  shortName: Environment;
  costPriority: "minimize" | "balanced" | "reliability";
  availability: "single-az" | "multi-az" | "multi-az-multi-region";
  dataRetentionDays: number;
  backupRetentionDays: number;
  enableMonitoring: boolean;
  enableGuardduty: boolean;
  natGatewayStrategy: "none" | "single" | "multi-az" | "high-availability";
  flowLogs: "none" | "reject-only" | "all";
}

export interface StackNaming {
  separator: string;
  components: string[];
  regionFormat: "compressed" | "full";
  examples: string[];
}

export interface NetworkConfig {
  globalCidr: string;
  allocationStrategy: Record<string, string>;
  subnetDesign: {
    public: { size: string; offset: number };
    private: { size: string; offset: number };
    database: { size: string; offset: number };
  };
  reservedRanges: Record<string, string>;
}

/**
 * The full set of options accepted by `OrganizationConfig`.
 *
 * Required: orgName, tenant, orgDomain (organization identity).
 * Optional: environments, stackNaming, network — each defaults to the
 * AdaptiveWorX-canonical layout when omitted.
 */
export interface OrganizationOptions {
  orgName: string;
  tenant: string;
  orgDomain: string;
  environments?: Record<string, EnvironmentConfig>;
  stackNaming?: StackNaming;
  network?: NetworkConfig;
}

// ---------------------------------------------------------------------------
// Defaults — the canonical AdaptiveWorX layout. Consumers can override any
// piece via `OrganizationOptions` without restating the rest.
// ---------------------------------------------------------------------------

export const DEFAULT_ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  dev: {
    name: "Development",
    shortName: "dev",
    costPriority: "minimize",
    availability: "single-az",
    dataRetentionDays: 7,
    backupRetentionDays: 7,
    enableMonitoring: true,
    enableGuardduty: false,
    natGatewayStrategy: "none",
    flowLogs: "reject-only",
  },
  stg: {
    name: "Staging",
    shortName: "stg",
    costPriority: "balanced",
    availability: "multi-az",
    dataRetentionDays: 14,
    backupRetentionDays: 14,
    enableMonitoring: true,
    enableGuardduty: true,
    natGatewayStrategy: "multi-az",
    flowLogs: "all",
  },
  prd: {
    name: "Production",
    shortName: "prd",
    costPriority: "reliability",
    availability: "multi-az-multi-region",
    dataRetentionDays: 30,
    backupRetentionDays: 30,
    enableMonitoring: true,
    enableGuardduty: true,
    natGatewayStrategy: "high-availability",
    flowLogs: "all",
  },
  sec: {
    name: "Security Operations",
    shortName: "sec",
    costPriority: "balanced",
    availability: "multi-az",
    dataRetentionDays: 90,
    backupRetentionDays: 30,
    enableMonitoring: true,
    enableGuardduty: true,
    natGatewayStrategy: "single",
    flowLogs: "all",
  },
};

export const DEFAULT_STACK_NAMING: StackNaming = {
  separator: "-",
  components: ["org", "cloud", "purpose", "env", "region"],
  regionFormat: "compressed",
  examples: [
    "myorg-aws-app-dev-use1",
    "myorg-aws-secops-secops-use1",
    "myorg-gcp-data-prod-usc1",
    "myorg-azure-ml-staging-eus",
  ],
};

export const DEFAULT_NETWORK: NetworkConfig = {
  globalCidr: "10.0.0.0/8",
  allocationStrategy: {
    prd: "10.0.0.0/9",
    stg: "10.128.0.0/10",
    dev: "10.192.0.0/10",
    sec: "10.64.0.0/10",
  },
  subnetDesign: {
    public: { size: "/22", offset: 0 },
    private: { size: "/22", offset: 16 },
    database: { size: "/22", offset: 32 },
  },
  reservedRanges: {
    vpn: "172.16.0.0/12",
    docker: "172.17.0.0/16",
    kubernetes: "172.18.0.0/16",
  },
};

// ---------------------------------------------------------------------------
// OrganizationConfig — pure consumer of validated options.
// ---------------------------------------------------------------------------

export class OrganizationConfig {
  public readonly orgName: string;
  public readonly tenant: string;
  public readonly orgDomain: string;
  public readonly environments: Record<string, EnvironmentConfig>;
  public readonly stackNaming: StackNaming;
  public readonly network: NetworkConfig;

  constructor(opts: OrganizationOptions) {
    if (!(opts.orgName && opts.tenant && opts.orgDomain)) {
      throw new Error(
        "OrganizationOptions.orgName, .tenant, and .orgDomain are required.\n" +
          "Construct directly: new OrganizationConfig({ orgName, tenant, orgDomain, ... })\n" +
          "Or load from env: new OrganizationConfig(loadOrganizationOptionsFromEnv())"
      );
    }

    this.orgName = opts.orgName;
    this.tenant = opts.tenant;
    this.orgDomain = opts.orgDomain;
    this.environments = opts.environments ?? DEFAULT_ENVIRONMENTS;
    this.stackNaming = opts.stackNaming ?? DEFAULT_STACK_NAMING;
    this.network = opts.network ?? DEFAULT_NETWORK;
  }

  getEnvironmentConfig(environment: string): EnvironmentConfig | undefined {
    return this.environments[environment];
  }

  formatStackName(
    org: string,
    cloud: string,
    purpose: string,
    env: string,
    region: string
  ): string {
    const regionCompressed = region.replace("-", "");
    const components = [org, cloud, purpose, env, regionCompressed];
    return components.join(this.stackNaming.separator);
  }

  getNatGatewayCount(environment: string): number {
    const envConfig = this.getEnvironmentConfig(environment);
    const strategy = envConfig?.natGatewayStrategy ?? "none";
    const strategies = {
      none: 0,
      single: 1,
      "multi-az": 2,
      "high-availability": 3,
    };
    return strategies[strategy];
  }

  shouldEnableService(service: string, environment: string): boolean {
    const envConfig = this.getEnvironmentConfig(environment);
    switch (service) {
      case "monitoring":
        return envConfig?.enableMonitoring ?? false;
      case "guardduty":
        return envConfig?.enableGuardduty ?? false;
      default:
        return false;
    }
  }

  getRetentionDays(retentionType: "data" | "backup" | "logs", environment: string): number {
    const envConfig = this.getEnvironmentConfig(environment);
    switch (retentionType) {
      case "logs":
        return environment === "dev" ? 7 : environment === "stg" ? 30 : 90;
      case "backup":
        return envConfig?.backupRetentionDays ?? 7;
      case "data":
        return envConfig?.dataRetentionDays ?? 7;
    }
  }

  exportAsDict(): Record<string, unknown> {
    return {
      organization: {
        name: this.orgName,
        tenant: this.tenant,
        domain: this.orgDomain,
      },
      environments: this.environments,
      stackNaming: this.stackNaming,
      network: this.network,
    };
  }
}

// ---------------------------------------------------------------------------
// Adapter helpers — source `OrganizationOptions` from a backend.
// ---------------------------------------------------------------------------

/**
 * Load `OrganizationOptions` purely from environment variables.
 *
 * Required env vars:
 *   ORG_NAME, ORG_TENANT, ORG_DOMAIN
 *
 * Throws if any required identity var is missing. Does not apply any
 * AdaptiveWorX-specific defaults — use `loadAdaptiveOrganizationDefaults()`
 * for that. Does not set any cloud-specific config — those live in the
 * sibling packages (`iac-aws`, `iac-azure`, etc.) and are constructed
 * separately.
 */
export function loadOrganizationOptionsFromEnv(): OrganizationOptions {
  const orgName = process.env.ORG_NAME;
  const tenant = process.env.ORG_TENANT;
  const orgDomain = process.env.ORG_DOMAIN;

  if (!(orgName && tenant && orgDomain)) {
    throw new Error(
      "Organization identity required. Set environment variables:\n" +
        "  ORG_NAME      — display name of your organization\n" +
        "  ORG_TENANT    — short tenant identifier (kebab-case)\n" +
        "  ORG_DOMAIN    — primary DNS domain (e.g. example.com)\n"
    );
  }

  return { orgName, tenant, orgDomain };
}

/**
 * Load the AdaptiveWorX-canonical defaults, with environment-variable
 * overrides on top. Intended for AdaptiveWorX-internal deployments.
 *
 * External consumers should not call this; use
 * `loadOrganizationOptionsFromEnv()` or construct `OrganizationOptions`
 * directly with their own values.
 */
export function loadAdaptiveOrganizationDefaults(): OrganizationOptions {
  return {
    orgName: process.env.ORG_NAME ?? "AdaptiveWorX",
    tenant: process.env.ORG_TENANT ?? "worx",
    orgDomain: process.env.ORG_DOMAIN ?? "adaptiveworx.com",
  };
}
