/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AWS Account Registry for Multi-Cloud Infrastructure
 *
 * `AwsAccountRegistry` discovers per-environment AWS accounts from a
 * `SecretManager` (typically Infisical) and merges them with an optional
 * set of "foundation accounts" — long-lived accounts (master, audit,
 * log-archive, etc.) that sit outside the per-environment structure.
 *
 * The class is config-driven; foundation accounts and the workspace-
 * naming prefix are constructor options. AdaptiveWorX-specific defaults
 * are sourced via `loadAdaptiveFoundationAccounts()`.
 */

import { type Environment, SecretManager } from "@adaptiveworx/iac-core";
import * as pulumi from "@pulumi/pulumi";

export interface AwsAccountRecord {
  id?: string;
  profile?: string;
  accountPurpose?: string;
  environment?: string;
  environmentClass?: string;
  [key: string]: unknown;
}

/**
 * Parsed shape of the AWS_ACCOUNTS JSON blob. Keys are
 * `<purpose>` or `<purpose>-<environment>`, values are account records.
 * `parseAwsAccountsJson` flattens nested-by-environment structures
 * automatically.
 */
export type AwsAccountsMap = Partial<Record<string, AwsAccountRecord>>;

/**
 * Parses the AWS_ACCOUNTS JSON blob with environment-aware error
 * severity (dev/test → warn-and-empty; staging/prod → throw) and
 * flattens nested-by-environment structures (e.g. `{ app: { dev: {...},
 * stg: {...} } }` → `{ "app-dev": {...}, "app-stg": {...} }`).
 */
export function parseAwsAccountsJson(rawJson: string, env: string): AwsAccountsMap {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const accounts: AwsAccountsMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      // The `default` field at top level indicates the preferred account
      // purpose (used by getDefaultAccountPurpose) — not an account record.
      if (key === "default") {
        continue;
      }
      if (typeof value === "object" && value !== null) {
        // Detect nested-by-environment: every entry's value is an
        // object with an `id` field
        const entries = Object.entries(value);
        const isNested =
          entries.length > 0 &&
          entries.every(([, v]) => typeof v === "object" && v !== null && "id" in v);
        if (isNested) {
          for (const [envKey, accountRecord] of entries) {
            if (typeof accountRecord === "object" && accountRecord !== null) {
              accounts[`${key}-${envKey}`] = accountRecord as AwsAccountRecord;
            }
          }
        } else {
          accounts[key] = value as AwsAccountRecord;
        }
      }
    }
    return accounts;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const envLower = env.toLowerCase();

    const isDevelopment = ["dev", "development", "local"].includes(envLower);
    const isTesting = ["test", "testing", "ci"].includes(envLower);
    const isStaging = ["stg", "stage", "staging", "preprod"].includes(envLower);
    const isProduction = [
      "prd",
      "prod",
      "production",
      "live",
      "sec",
      "security",
      "ops",
      "dr",
    ].includes(envLower);

    if (isDevelopment || isTesting) {
      void pulumi.log.warn(
        `⚠️ [${env.toUpperCase()}] Failed to parse AWS_ACCOUNTS: ${errorMessage}\n` +
          "💡 This would fail in staging/production. Please fix the JSON configuration."
      );
      return {};
    }
    if (isStaging || isProduction) {
      const tag = isStaging ? "STAGING" : "PRODUCTION";
      void pulumi.log.error(
        `🛑 [${tag}] Critical configuration error in AWS_ACCOUNTS: ${errorMessage}`
      );
      throw new Error(
        `${env} environment requires valid AWS_ACCOUNTS configuration: ${errorMessage}`
      );
    }
    void pulumi.log.warn(
      `⚠️ [${env.toUpperCase()}] Failed to parse AWS_ACCOUNTS: ${errorMessage}\n` +
        `💡 Unknown environment '${env}' - treating as development.`
    );
    return {};
  }
}

export interface AccountInfo {
  id: string;
  profile?: string;
  ou?: string;
  email?: string;
  purpose?: string;
  environment?: string;
  name?: string;
  isVpcHub?: boolean;
}

export interface FoundationAccount {
  id: string;
  email: string;
  ou: string;
  purpose: string;
  profile: string;
}

export interface AwsAccountRegistryOptions {
  /**
   * Optional `SecretManager` instance. Defaults to a freshly constructed
   * one — useful for tests, or when an app wants to share a manager
   * across multiple registries.
   */
  secretManager?: SecretManager;

  /**
   * Long-lived accounts that exist outside the per-environment structure
   * (master, audit, log-archive, etc.). Defaults to an empty map so the
   * library is generic out of the box.
   *
   * AdaptiveWorX-internal callers should pass
   * `loadAdaptiveFoundationAccounts()` to preserve historical behaviour.
   */
  foundationAccounts?: Map<string, FoundationAccount>;

  /**
   * Naming prefix used when constructing fallback account names from
   * `<prefix>-<purpose>-<environment>`. Defaults to `"account"` so the
   * library produces vendor-neutral names. AdaptiveWorX-internal callers
   * pass `"worx"` to match historical naming.
   */
  accountNamingPrefix?: string;
}

const DEFAULT_ACCOUNT_NAMING_PREFIX = "account";

/**
 * Dynamic AWS account registry that discovers accounts from a `SecretManager`.
 */
export class AwsAccountRegistry {
  private readonly secretManager: SecretManager;
  private readonly cache: Map<string, Map<string, AccountInfo>> = new Map();
  private readonly accountsJsonCache: Map<string, AwsAccountsMap> = new Map();
  private readonly foundationAccounts: Map<string, FoundationAccount>;
  private readonly namingPrefix: string;

  constructor(opts: AwsAccountRegistryOptions = {}) {
    this.secretManager = opts.secretManager ?? new SecretManager();
    this.foundationAccounts = opts.foundationAccounts ?? new Map();
    this.namingPrefix = opts.accountNamingPrefix ?? DEFAULT_ACCOUNT_NAMING_PREFIX;
  }

  /**
   * Fetch and parse the AWS_ACCOUNTS JSON blob from the underlying
   * SecretManager. Cached per-environment after first read.
   */
  async getAwsAccountsJson(environment?: Environment): Promise<AwsAccountsMap> {
    const env = environment ?? "dev";
    const cached = this.accountsJsonCache.get(env);
    if (cached !== undefined) {
      return cached;
    }

    const accountsJson = await this.secretManager.getOptionalSecret("AWS_ACCOUNTS", "{}", {
      cloud: "aws",
      environment: env,
    });
    const accounts = parseAwsAccountsJson(accountsJson, env);
    this.accountsJsonCache.set(env, accounts);
    return accounts;
  }

  private resolveAwsAccountRecord(
    accounts: AwsAccountsMap,
    purpose: string,
    environment: string
  ): AwsAccountRecord | undefined {
    // Key format: {accountPurpose}-{environment} (e.g., "ops-sec", "app-dev").
    // Some accounts serve all environments (e.g. "ops" across all envs).
    const primaryKey = `${purpose}-${environment}`;
    const underscoreKey = `${purpose}_${environment}`;
    return accounts[primaryKey] ?? accounts[underscoreKey] ?? accounts[purpose];
  }

  /**
   * Look up the AWS account ID for a given purpose+environment from the
   * AWS_ACCOUNTS configuration.
   */
  async getAwsAccountId(purpose: string, environment: string): Promise<string | null> {
    const accounts = await this.getAwsAccountsJson(environment as Environment);
    const record = this.resolveAwsAccountRecord(accounts, purpose, environment);
    if (record === undefined) {
      return null;
    }
    const accountId = typeof record.id === "string" ? record.id.trim() : "";
    return accountId.length > 0 ? accountId : null;
  }

  /**
   * Look up the local AWS profile name for a given purpose+environment.
   */
  async getAwsProfile(purpose: string, environment: string): Promise<string | null> {
    try {
      const accounts = await this.getAwsAccountsJson(environment as Environment);
      const record = this.resolveAwsAccountRecord(accounts, purpose, environment);
      if (record !== undefined) {
        const profile = typeof record.profile === "string" ? record.profile.trim() : "";
        if (profile.length > 0) {
          return profile;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      void pulumi.log.warn(
        `Failed to resolve AWS profile for ${purpose}-${environment}: ${errorMessage}`
      );
    }
    return null;
  }

  /**
   * Returns the `default` value at the top level of the AWS_ACCOUNTS
   * JSON if set. Indicates which account purpose to assume when one isn't
   * specified by the caller.
   */
  async getDefaultAccountPurpose(environment?: Environment): Promise<string | null> {
    try {
      // Re-read the raw JSON; the parsed accounts map strips `default`.
      const rawJson = await this.secretManager.getOptionalSecret("AWS_ACCOUNTS", "{}", {
        cloud: "aws",
        environment: environment ?? "dev",
      });
      const parsed = JSON.parse(rawJson) as unknown;
      if (typeof parsed === "object" && parsed !== null && "default" in parsed) {
        const defaultValue = (parsed as { default?: unknown }).default;
        if (typeof defaultValue === "string" && defaultValue.trim().length > 0) {
          return defaultValue.trim();
        }
      }
    } catch {
      // No default configured
    }
    return null;
  }

  /**
   * Bundles AWS-account discovery + organization identity (read from the
   * underlying SecretManager) into a single object for deploy scripts.
   */
  async getAwsDeploymentConfiguration(environment?: Environment): Promise<{
    tenant: string;
    orgName: string;
    orgDomain: string;
    accountPurposes: string[];
    accountEnvironments: string[];
    enableMultiPurpose: boolean;
  }> {
    const accounts = await this.getAwsAccountsJson(environment);
    const accountPurposes = new Set<string>();
    const accountEnvironments = new Set<string>();

    for (const record of Object.values(accounts)) {
      if (record !== undefined) {
        if (typeof record.accountPurpose === "string" && record.accountPurpose.trim() !== "") {
          accountPurposes.add(record.accountPurpose.trim());
        }
        if (typeof record.environment === "string" && record.environment.trim() !== "") {
          accountEnvironments.add(record.environment.trim());
        }
      }
    }

    if (accountPurposes.size === 0) {
      accountPurposes.add("ops");
      accountPurposes.add("app");
    }
    if (accountEnvironments.size === 0) {
      accountEnvironments.add("dev");
      accountEnvironments.add("stg");
      accountEnvironments.add("prd");
      accountEnvironments.add("sec");
    }

    return {
      tenant: await this.secretManager.getSecret("ORG_TENANT"),
      orgName: await this.secretManager.getSecret("ORG_NAME"),
      orgDomain: await this.secretManager.getSecret("ORG_DOMAIN"),
      accountPurposes: Array.from(accountPurposes).sort(),
      accountEnvironments: Array.from(accountEnvironments).sort(),
      enableMultiPurpose: await this.secretManager.getBooleanSecret("ENABLE_MULTI_PURPOSE", false),
    };
  }

  getFoundationAccountByName(accountName: string): FoundationAccount | undefined {
    return this.foundationAccounts.get(accountName);
  }

  getFoundationAccountByPurpose(purpose: string): FoundationAccount | undefined {
    const accountName = purpose.startsWith("adaptive-") ? purpose : `adaptive-${purpose}`;
    return this.foundationAccounts.get(accountName);
  }

  getFoundationAccountsSnapshot(): Map<string, FoundationAccount> {
    return new Map(this.foundationAccounts);
  }

  private isAccountRecord(value: unknown): value is Partial<AccountInfo> {
    return typeof value === "object" && value !== null;
  }

  private normaliseAccount(
    purpose: string,
    environment: Environment,
    account: Partial<AccountInfo>
  ): AccountInfo | null {
    const rawAccountId = typeof account.id === "string" ? account.id.trim() : "";
    if (rawAccountId.length === 0) {
      void pulumi.log.warn(
        `Skipping account '${purpose}' in environment '${environment}' due to missing account id`
      );
      return null;
    }

    const profile =
      typeof account.profile === "string" && account.profile.trim().length > 0
        ? account.profile.trim()
        : `${this.namingPrefix}-${purpose}-${environment}`;

    const normalised: AccountInfo = {
      id: rawAccountId,
      profile,
      purpose,
      environment,
      name: profile,
    };

    if (typeof account.ou === "string" && account.ou.trim().length > 0) {
      normalised.ou = account.ou.trim();
    }

    if (typeof account.email === "string" && account.email.trim().length > 0) {
      normalised.email = account.email.trim();
    }

    if (account.isVpcHub === true) {
      normalised.isVpcHub = true;
    }

    return normalised;
  }

  /**
   * Get all accounts for a specific environment
   */
  async getAccountsForEnvironment(environment: Environment): Promise<Map<string, AccountInfo>> {
    const cached = this.cache.get(environment);
    if (cached) {
      return cached;
    }

    try {
      const accountsJson = await this.getAwsAccountsJson(environment);
      const accounts = new Map<string, AccountInfo>();

      for (const [purpose, rawAccount] of Object.entries(accountsJson) as Array<
        [string, unknown]
      >) {
        if (!this.isAccountRecord(rawAccount)) {
          void pulumi.log.warn(
            `Skipping account '${purpose}' in environment '${environment}' due to invalid structure`
          );
          continue;
        }

        const normalised = this.normaliseAccount(purpose, environment, rawAccount);
        if (!normalised) {
          continue;
        }

        const accountName = normalised.name ?? `${this.namingPrefix}-${purpose}-${environment}`;
        accounts.set(accountName, { ...normalised, name: accountName });
      }

      this.cache.set(environment, accounts);
      return accounts;
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      void pulumi.log.warn(`Could not load accounts for environment ${environment}: ${message}`);
      return new Map();
    }
  }

  /**
   * Get all accounts across all environments including foundation accounts
   */
  async getAllAccounts(): Promise<Map<string, AccountInfo>> {
    const allAccounts = new Map<string, AccountInfo>();

    // Add foundation accounts
    for (const [name, info] of this.foundationAccounts) {
      allAccounts.set(name, info);
    }

    // Add accounts from all environments
    const environments: Environment[] = ["dev", "stg", "prd", "sec"];
    for (const env of environments) {
      const envAccounts = await this.getAccountsForEnvironment(env);
      for (const [name, info] of envAccounts) {
        allAccounts.set(name, info);
      }
    }

    // Mark hub accounts
    for (const [name, info] of allAccounts) {
      if (name.includes("secops") || info.purpose === "secops") {
        info.isVpcHub = true;
      }
    }

    return allAccounts;
  }

  /**
   * Get account information by AWS account ID
   */
  async getAccountById(accountId: string): Promise<AccountInfo | null> {
    const allAccounts = await this.getAllAccounts();
    for (const [name, info] of allAccounts) {
      if (info.id === accountId) {
        return { ...info, name };
      }
    }
    return null;
  }

  /**
   * Get account information by account name
   */
  async getAccountByName(accountName: string): Promise<AccountInfo | null> {
    const allAccounts = await this.getAllAccounts();
    const account = allAccounts.get(accountName);
    return account ? { ...account, name: accountName } : null;
  }

  /**
   * Get all accounts with a specific purpose across all environments
   */
  async getAccountsByPurpose(purpose: string): Promise<Map<string, AccountInfo>> {
    const allAccounts = await this.getAllAccounts();
    const filtered = new Map<string, AccountInfo>();

    for (const [name, info] of allAccounts) {
      if (info.purpose === purpose) {
        filtered.set(name, info);
      }
    }

    return filtered;
  }

  /**
   * Get all accounts in a specific environment
   */
  async getAccountsByEnvironment(environment: Environment): Promise<Map<string, AccountInfo>> {
    const allAccounts = await this.getAllAccounts();
    const filtered = new Map<string, AccountInfo>();

    for (const [name, info] of allAccounts) {
      if (info.environment === environment) {
        filtered.set(name, info);
      }
    }

    return filtered;
  }

  /**
   * Get the VPC hub account (secops account)
   */
  async getHubAccount(): Promise<[string, AccountInfo] | [null, null]> {
    const allAccounts = await this.getAllAccounts();
    for (const [name, info] of allAccounts) {
      if (info.isVpcHub === true) {
        return [name, info];
      }
    }
    return [null, null];
  }

  /**
   * Get all spoke accounts (non-hub accounts that consume shared resources)
   */
  async getSpokeAccounts(): Promise<Map<string, AccountInfo>> {
    const allAccounts = await this.getAllAccounts();
    const spokes = new Map<string, AccountInfo>();

    for (const [name, info] of allAccounts) {
      if (info.isVpcHub === true) {
        continue;
      }

      const purpose = info.purpose ?? "";
      if (["app", "data", "ml"].includes(purpose)) {
        spokes.set(name, info);
      }
    }

    return spokes;
  }

  /**
   * Get account information for the current stack context
   */
  async getCurrentAccount(): Promise<AccountInfo | null> {
    try {
      const currentProfile = await this.getAwsProfile("app", "dev"); // Default context
      if (currentProfile === null) {
        return null;
      }
      return await this.getAccountByName(currentProfile);
    } catch {
      return null;
    }
  }

  /**
   * Validate that account configuration is complete and consistent
   */
  async validateAccountConfiguration(): Promise<string[]> {
    const errors: string[] = [];

    try {
      const allAccounts = await this.getAllAccounts();

      // Check that we have accounts
      if (allAccounts.size === 0) {
        errors.push("No accounts found in registry");
        return errors;
      }

      // Check required fields for each account
      for (const [name, info] of allAccounts) {
        if (typeof info.id !== "string" || info.id.trim().length === 0) {
          errors.push(`Account ${name} missing required field: id`);
        }

        if (typeof info.purpose !== "string" || info.purpose.trim().length === 0) {
          errors.push(`Account ${name} missing required field: purpose`);
        }
      }

      // Check for duplicate account IDs
      const accountIds = new Map<string, string>();
      for (const [name, info] of allAccounts) {
        if (info.id) {
          if (accountIds.has(info.id)) {
            errors.push(
              `Duplicate account ID ${info.id} found in ${name} and ${accountIds.get(info.id)}`
            );
          } else {
            accountIds.set(info.id, name);
          }
        }
      }

      // Check that we have a hub account
      const [hubName] = await this.getHubAccount();
      if (hubName === null) {
        errors.push("No VPC hub account found (should have isVpcHub=true)");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      errors.push(`Failed to validate account configuration: ${message}`);
    }

    return errors;
  }

  /**
   * Clear both the normalised per-environment cache and the raw
   * `AWS_ACCOUNTS` JSON cache. Useful for tests; in long-running
   * processes only call this if the underlying secret has actually
   * changed.
   */
  clearCache(): void {
    this.cache.clear();
    this.accountsJsonCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton accessors
// ---------------------------------------------------------------------------

let globalRegistry: AwsAccountRegistry | null = null;

/**
 * Lazily construct (or fetch) the process-wide singleton registry. The
 * first call's `opts` are honoured; subsequent calls return the same
 * instance regardless of `opts`. Use `setAwsAccountRegistry()` to install
 * a pre-configured registry explicitly at app startup.
 */
export function getAwsAccountRegistry(opts: AwsAccountRegistryOptions = {}): AwsAccountRegistry {
  globalRegistry ??= new AwsAccountRegistry(opts);
  return globalRegistry;
}

/**
 * Install a pre-configured singleton registry. Useful when an app wants
 * to wire a non-default `SecretManager` or set of foundation accounts at
 * startup before any helper-function call.
 */
export function setAwsAccountRegistry(registry: AwsAccountRegistry): void {
  globalRegistry = registry;
}

// ---------------------------------------------------------------------------
// Adapter helpers — source domain-specific fixture data.
// ---------------------------------------------------------------------------

/**
 * Returns the AdaptiveWorX-canonical foundation accounts (master, audit,
 * backup-admin, central-backup, log-archive). Account IDs default to the
 * Adaptive values but can be overridden per-account via env vars listed
 * in each entry's comment. Email + naming prefix are AdaptiveWorX-specific.
 *
 * External consumers should NOT call this; supply your own
 * `AwsAccountRegistryOptions.foundationAccounts` map instead.
 */
export function loadAdaptiveFoundationAccounts(): Map<string, FoundationAccount> {
  const accounts = new Map<string, FoundationAccount>();

  accounts.set("adaptive-master", {
    id: process.env.AWS_ACCOUNT_ID_ADAPTIVE_MASTER ?? "339932683779",
    email: process.env.AWS_EMAIL_ADAPTIVE_MASTER ?? "aws.admin@adaptiveworx.com",
    ou: "Root",
    purpose: "master",
    profile: "adaptive-master",
  });

  accounts.set("adaptive-audit", {
    id: process.env.AWS_ACCOUNT_ID_ADAPTIVE_AUDIT ?? "304624012516",
    email: process.env.AWS_EMAIL_ADAPTIVE_AUDIT ?? "aws.audit@adaptiveworx.com",
    ou: "Foundation",
    purpose: "audit",
    profile: "adaptive-audit",
  });

  accounts.set("adaptive-backup-admin", {
    id: process.env.AWS_ACCOUNT_ID_ADAPTIVE_BACKUP_ADMIN ?? "346692023911",
    email: process.env.AWS_EMAIL_ADAPTIVE_BACKUP_ADMIN ?? "aws.backup.admin@adaptiveworx.com",
    ou: "Foundation",
    purpose: "backup-admin",
    profile: "adaptive-backup-admin",
  });

  accounts.set("adaptive-central-backup", {
    id: process.env.AWS_ACCOUNT_ID_ADAPTIVE_CENTRAL_BACKUP ?? "743833338893",
    email: process.env.AWS_EMAIL_ADAPTIVE_CENTRAL_BACKUP ?? "aws.central.backup@adaptiveworx.com",
    ou: "Foundation",
    purpose: "central-backup",
    profile: "adaptive-central-backup",
  });

  accounts.set("adaptive-log-archive", {
    id: process.env.AWS_ACCOUNT_ID_ADAPTIVE_LOG_ARCHIVE ?? "539920679260",
    email: process.env.AWS_EMAIL_ADAPTIVE_LOG_ARCHIVE ?? "aws.log.archive@adaptiveworx.com",
    ou: "Foundation",
    purpose: "log-archive",
    profile: "adaptive-log-archive",
  });

  return accounts;
}

// Compatibility functions for existing code
export async function getAccountById(accountId: string): Promise<AccountInfo | null> {
  const registry = getAwsAccountRegistry();
  return await registry.getAccountById(accountId);
}

export async function getAccountByName(accountName: string): Promise<AccountInfo | null> {
  const registry = getAwsAccountRegistry();
  return await registry.getAccountByName(accountName);
}

export async function getAccountsByPurpose(purpose: string): Promise<Map<string, AccountInfo>> {
  const registry = getAwsAccountRegistry();
  return await registry.getAccountsByPurpose(purpose);
}

export async function getHubAccount(): Promise<[string, AccountInfo] | [null, null]> {
  const registry = getAwsAccountRegistry();
  return await registry.getHubAccount();
}

export async function getSpokeAccounts(): Promise<Map<string, AccountInfo>> {
  const registry = getAwsAccountRegistry();
  return await registry.getSpokeAccounts();
}
