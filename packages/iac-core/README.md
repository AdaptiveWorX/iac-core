# @adaptiveworx/iac-core

Core utilities for [AdaptiveWorX™ Flow](https://adaptiveworx.com) infrastructure-as-code: secret management, stack context detection, region resolution, CIDR allocation, and Zod-validated configuration schemas.

The package is multi-cloud-aware (AWS today; Azure and GCP planned) and is licensed under Apache 2.0 for use in any Pulumi + TypeScript project.

## Install

```bash
pnpm add @adaptiveworx/iac-core
# or
yarn add @adaptiveworx/iac-core
# or
npm install @adaptiveworx/iac-core
```

`zod` is a peer dependency:

```bash
pnpm add zod
```

## Quick start

```ts
import {
  OrganizationConfig,
  loadOrganizationOptionsFromEnv,
  SecretManager,
  detectStackContext,
} from "@adaptiveworx/iac-core";

// 1. Detect Pulumi stack context (cloud, environment, region, purpose)
const ctx = detectStackContext();

// 2. Load organization options from env vars
const orgConfig = new OrganizationConfig(loadOrganizationOptionsFromEnv());

// 3. Fetch secrets via Infisical (or env-var fallback)
const sm = new SecretManager({ environment: ctx.environment });
const dbPassword = await sm.getSecret("DB_PASSWORD");
```

Subpath imports are supported for tree-shaking-sensitive consumers:

```ts
import { SecretManager } from "@adaptiveworx/iac-core/config/secrets";
import { resolveRegion } from "@adaptiveworx/iac-core/utils/region-utils";
```

## Quick-start guides per cloud

- [AWS quick start](./docs/quickstart-aws.md) — full Pulumi + AWS deploy walkthrough; covers OrganizationConfig, AWSAccountRegistry, CIDR, and policy-pack integration
- [Azure quick start](./docs/quickstart-azure.md) — Azure-shaped OrganizationConfig + region resolution + secrets; what works and what doesn't (yet)
- [GCP quick start](./docs/quickstart-gcp.md) — GCP-shaped OrganizationConfig + region resolution; lighter-weight than AWS

## Public API

### `config/`

- **`SecretManager`** — fetches secrets from Infisical (mandatory in production paths) with `.env.{env}` file fallback. Public methods: `getSecret`, `getOptionalSecret`, `getBooleanSecret`, `getDeploymentConfiguration`, `healthCheck`.
- **`OrganizationConfig`** — pure consumer of `OrganizationOptions`. Construct via `new OrganizationConfig(opts)`; load options via `loadOrganizationOptionsFromEnv()` (generic) or `loadAdaptiveOrganizationDefaults()` (AdaptiveWorX-internal).
- **`AWSAccountRegistry`** — discovers per-environment AWS accounts from `SecretManager`, optionally merged with caller-supplied "foundation accounts" (master, audit, log-archive, etc.).

### `utils/`

- **`stack-utils`** — `detectStackContext`, `parseStackName`, `generateStackName`, `validateStackContext`, `getEnvironmentConfig`, `getComplianceRequirements`, `validateCrossAccountOperation`.
- **`region-utils`** — `resolveRegion`, `getRegionAliases`, `isValidRegion`, `validateAvailabilityZones` (loads region aliases from `@adaptiveworx/iac-schemas`).
- **`cidr-allocation`** — `calculateVpcCidr`, `getVpcCidr` for non-overlapping CIDR allocation across environments + regions.
- **`stack-readme`** — `generateStackReadme`, `exportStackReadme` for auto-documenting Pulumi stacks.

### `schemas/`

- **`SCHEMA_CONFIG`, `SCHEMA_BASE_URL`** — canonical metadata for the IaC schema namespace.
- **`schemas/core/core-schemas`** — Zod validators (`StackContextSchema`, `DeploymentConfigSchema`, `AwsRegionSchema`, etc.).

### `validation/`

- **`AgentValidationService`, `ValidationPatterns`** — runtime guardrails for agent-driven IaC operations.
- **`ConfigurationValidator`** — config-shape validators for stack/environment/component constraints.

### `types/`

- All shared infrastructure types: `CloudProvider`, `Environment`, `StackContext`, `DeploymentConfig`, `ComplianceRequirement`, `AccountConfig`, `CidrAllocation`, etc.

## Configuration via environment variables

The package follows a "config-in, behavior-out" pattern. Classes consume validated options; adapter helpers source those options. The library never reads `process.env` from a class constructor — only from the explicit `loadXxxFromEnv()` helpers.

### Required (when calling `loadOrganizationOptionsFromEnv()`)

| Variable | Purpose |
|---|---|
| `ORG_NAME` | Display name of your organization |
| `ORG_TENANT` | Short tenant identifier (kebab-case) |
| `ORG_DOMAIN` | Primary DNS domain (e.g. `example.com`) |

### Optional cloud-provider overrides

| Variable | Purpose | Default |
|---|---|---|
| `IAC_AWS_ORG_ID` | AWS Organization ID | (none) |
| `IAC_AWS_MASTER_ACCOUNT` | Master account name | (none) |
| `IAC_AWS_SECURITY_ACCOUNT` | Security account name | (none) |
| `IAC_AWS_PRIMARY_REGIONS` | Comma-separated primary regions | `[]` |
| `IAC_AWS_DR_REGIONS` | Comma-separated DR regions | `[]` |

### Schema metadata overrides

| Variable | Purpose | Default |
|---|---|---|
| `IAC_SCHEMA_BASE_URL` | Schema publish URL | `https://schemas.adaptiveworx.com/iac` |
| `IAC_SCHEMA_CONTACT_NAME` | Schema contact name | `Adaptive Intelligence, LLC` |
| `IAC_SCHEMA_CONTACT_URL` | Schema contact URL | `https://adaptiveworx.com` |

### SecretManager / Infisical

| Variable | Purpose |
|---|---|
| `INFISICAL_CLIENT_ID` | Infisical Universal Auth client ID |
| `INFISICAL_CLIENT_SECRET` | Infisical Universal Auth client secret |
| `INFISICAL_PROJECT_ID` | Infisical project ID |
| `INFISICAL_SITE_URL` | Self-hosted Infisical URL (defaults to public Infisical) |

When Infisical credentials are absent, `SecretManager` falls back to `.env.{IAC_ENV}` files for local development.

## Multi-tenant override pattern

`OrganizationConfig` is a pure consumer of validated options. Three loading patterns cover the common cases:

### 1. AdaptiveWorX-internal — convenience helper

For deployments inside the AdaptiveWorX AWS organization. Uses canonical defaults (org ID `289507152988`, accounts `adaptive-master` / `worx-secops`, regions `us-east-1` + `us-west-2`) with env-var overrides on top.

```ts
import {
  OrganizationConfig,
  loadAdaptiveOrganizationDefaults,
} from "@adaptiveworx/iac-core";

const orgConfig = new OrganizationConfig(loadAdaptiveOrganizationDefaults());
// orgName: "AdaptiveWorX" (or process.env.ORG_NAME)
// cloudProviders.aws.organizationId: "289507152988"
// cloudProviders.aws.primaryRegions: ["us-east-1", "us-west-2"]
```

### 2. External consumer (Azure) — explicit construction

For an Azure-only consumer. AWS provider stays disabled, no AdaptiveWorX defaults leak in.

```ts
import { OrganizationConfig } from "@adaptiveworx/iac-core";

const orgConfig = new OrganizationConfig({
  orgName: "Acme Health",
  tenant: "care",
  orgDomain: "acme.example",
  cloudProviders: {
    azure: {
      enabled: true,
      primaryRegions: ["eastus2"],
      drRegions: ["westus3"],
    },
  },
});

orgConfig.cloudProviders.azure?.enabled;       // true
orgConfig.cloudProviders.aws?.enabled;         // false (DEFAULT_CLOUD_PROVIDERS)
```

### 3. External consumer (AWS) — env-var-driven

For an external AWS-based consumer. Set `ORG_*` + `IAC_AWS_*` env vars at deploy time; class is constructed with `loadOrganizationOptionsFromEnv()`. No AdaptiveWorX defaults applied — every value comes from the environment.

```ts
import {
  OrganizationConfig,
  loadOrganizationOptionsFromEnv,
} from "@adaptiveworx/iac-core";

// Acme Co's deploy environment:
//   ORG_NAME="Acme Co"
//   ORG_TENANT="acme"
//   ORG_DOMAIN="acme.example"
//   IAC_AWS_ORG_ID="123456789012"
//   IAC_AWS_MASTER_ACCOUNT="acme-master"
//   IAC_AWS_PRIMARY_REGIONS="us-east-2,us-west-1"
//   IAC_AWS_DR_REGIONS="eu-west-1"

const orgConfig = new OrganizationConfig(loadOrganizationOptionsFromEnv());
orgConfig.orgName;                                    // "Acme Co"
orgConfig.cloudProviders.aws?.organizationId;         // "123456789012"
orgConfig.cloudProviders.aws?.primaryRegions;         // ["us-east-2", "us-west-1"]
```

### Picking your loader

| Loader | When to use | Throws if missing |
|---|---|---|
| `loadAdaptiveOrganizationDefaults()` | You're AdaptiveWorX-internal and want canonical defaults | No (defaults applied) |
| `loadOrganizationOptionsFromEnv()` | You manage your own env-var contract, no AdaptiveWorX defaults wanted | Yes, on missing `ORG_NAME` / `ORG_TENANT` / `ORG_DOMAIN` |
| Direct `new OrganizationConfig({...})` | You're constructing options from a config file, secrets manager, or test fixture | Yes, if any of `orgName` / `tenant` / `orgDomain` is empty |

The same pattern applies to `AWSAccountRegistry` — see the `loadAdaptiveFoundationAccounts()` helper for the AdaptiveWorX foundation-account fixture, or pass your own `Map<string, FoundationAccount>` via the `foundationAccounts` constructor option.

## API reference

The most important public classes, with signatures and minimal examples. For the full surface, see [`src/index.ts`](./src/index.ts).

### `SecretManager`

Fetches secrets from Infisical (Universal Auth) with optional fallback to `.env.{IAC_ENV}` files for local development.

```ts
class SecretManager {
  constructor(defaultContext?: SecretContext);

  // Required secret — throws if absent in both Infisical and env vars
  getSecret(key: string, context?: SecretContext): Promise<string>;

  // Optional secret with fallback
  getOptionalSecret(key: string, defaultValue: string, context?: SecretContext): Promise<string>;

  // Boolean parser (truthy: "true" | "1" | "yes")
  getBooleanSecret(key: string, defaultValue?: boolean, context?: SecretContext): Promise<boolean>;

  // Resolves `AWS_ACCOUNTS` JSON from Infisical
  getAwsAccountsJson(): Promise<AwsAccountsMap>;
  getAwsAccountId(purpose: string, environment: string): Promise<string | null>;
  getAwsProfile(purpose: string, environment: string, _org: string): Promise<string | null>;

  // High-level deployment config (combines org config + secrets + accounts)
  getDeploymentConfiguration(): Promise<DeploymentConfig>;

  // Connection check — useful in CI to fail fast before running pulumi
  healthCheck(): Promise<{ infisicalAvailable: boolean; missingSecrets: string[] }>;
}

interface SecretContext {
  environment?: Environment;   // dev | stg | prd | sec
  cloud?: CloudProvider;       // aws | azure | gcp | cloudflare
  region?: string;
  purpose?: string;
}
```

```ts
const sm = new SecretManager({ environment: "dev" });
await sm.getSecret("DB_PASSWORD");
await sm.getOptionalSecret("LOG_LEVEL", "info");
const useFlag = await sm.getBooleanSecret("FEATURE_X_ENABLED", false);
```

> **Roadmap note**: `SecretManager` is welded to Infisical today. A `SecretsBackend` pluggable interface (Azure Key Vault / AWS Secrets Manager / HashiCorp Vault / 1Password Connect / in-memory test) is designed in [`docs/design-secrets-backend.md`](./docs/design-secrets-backend.md) but not yet implemented. The shape stays proposal-only until a concrete second consumer validates the interface against their real auth + secret layout. Existing callers will keep working when it lands — no public-API break.

### `OrganizationConfig`

Pure consumer of `OrganizationOptions`. See the [Multi-tenant override pattern](#multi-tenant-override-pattern) above for how to source options.

```ts
class OrganizationConfig {
  readonly orgName: string;
  readonly tenant: string;
  readonly orgDomain: string;
  readonly cloudProviders: Record<string, CloudProviderConfig>;
  readonly environments: Record<string, EnvironmentConfig>;
  readonly stackNaming: StackNaming;
  readonly network: NetworkConfig;

  constructor(opts: OrganizationOptions);

  getEnvironmentConfig(environment: string): EnvironmentConfig | undefined;
  getCloudConfig(provider: string): CloudProviderConfig | undefined;

  // Compute non-overlapping CIDR for an env+region combo using the
  // network.allocationStrategy + per-region offset table
  getCidrForEnvironment(environment: string, region: string): string | null;

  // Build a stack name from components — applies stackNaming.separator
  // and compresses the region per regionFormat
  formatStackName(org: string, cloud: string, purpose: string, env: string, region: string): string;

  // Strategy lookup (none | single | multi-az | high-availability)
  getNatGatewayCount(environment: string): number;

  // Service feature flags — currently "monitoring", "guardduty"
  shouldEnableService(service: string, environment: string): boolean;

  // "data" | "backup" | "logs" → days
  getRetentionDays(retentionType: "data" | "backup" | "logs", environment: string): number;

  exportAsDict(): Record<string, unknown>;
}
```

The `DEFAULT_ENVIRONMENTS`, `DEFAULT_STACK_NAMING`, `DEFAULT_NETWORK`, and `DEFAULT_CLOUD_PROVIDERS` constants are exported so consumers can compose their own options on top of the canonical layout without restating it:

```ts
import { OrganizationConfig, DEFAULT_ENVIRONMENTS } from "@adaptiveworx/iac-core";

const orgConfig = new OrganizationConfig({
  orgName: "Acme Co", tenant: "acme", orgDomain: "acme.example",
  environments: {
    ...DEFAULT_ENVIRONMENTS,
    qa: { ...DEFAULT_ENVIRONMENTS.dev, name: "QA", shortName: "stg" }, // add a custom env
  },
});
```

### `AWSAccountRegistry`

Discovers per-environment AWS accounts from a `SecretManager` (typically Infisical's `AWS_ACCOUNTS` JSON) and merges them with optional "foundation accounts" — long-lived accounts (master, audit, log-archive, etc.) that sit outside the per-environment structure.

```ts
class AWSAccountRegistry {
  constructor(opts?: AwsAccountRegistryOptions);

  getFoundationAccountByName(accountName: string): FoundationAccount | undefined;
  getFoundationAccountByPurpose(purpose: string): FoundationAccount | undefined;

  getAccountsForEnvironment(environment: Environment): Promise<Map<string, AccountInfo>>;
  getAllAccounts(): Promise<Map<string, AccountInfo>>;
  getAccountById(accountId: string): Promise<AccountInfo | null>;
  getAccountByName(accountName: string): Promise<AccountInfo | null>;
  getAccountsByPurpose(purpose: string): Promise<Map<string, AccountInfo>>;

  // Returns the secops/hub account if exactly one is marked isVpcHub
  getHubAccount(): Promise<[string, AccountInfo] | [null, null]>;
  getSpokeAccounts(): Promise<Map<string, AccountInfo>>;

  clearCache(): void;
}

interface AwsAccountRegistryOptions {
  secretManager?: SecretManager;
  foundationAccounts?: Map<string, FoundationAccount>;
  accountNamingPrefix?: string;   // default "account"
}
```

```ts
import {
  AWSAccountRegistry,
  loadAdaptiveFoundationAccounts,
} from "@adaptiveworx/iac-core";

// AdaptiveWorX-internal — uses canonical foundation accounts + "worx" prefix
const registry = new AWSAccountRegistry({
  foundationAccounts: loadAdaptiveFoundationAccounts(),
  accountNamingPrefix: "worx",
});

const audit = registry.getFoundationAccountByName("adaptive-audit");
const dev = await registry.getAccountsForEnvironment("dev");
```

For external consumers, omit the helpers — the registry will discover accounts dynamically from `SecretManager` only:

```ts
const registry = new AWSAccountRegistry();   // empty foundation map, generic prefix
```

### Utilities — `region-utils`

```ts
function resolveRegion(cloud: CloudProvider, regionAlias: string): string;
function getRegionAliases(cloud: CloudProvider): Record<string, string>;
function getRegions(cloud: CloudProvider): string[];
function isValidRegion(cloud: CloudProvider, region: string): boolean;
function validateAvailabilityZones(region: string, count: number): boolean;
```

```ts
import { resolveRegion } from "@adaptiveworx/iac-core";

resolveRegion("aws", "use1");      // "us-east-1"
resolveRegion("azure", "eus2");    // "eastus2"
resolveRegion("aws", "us-east-1"); // "us-east-1" (already canonical)
```

### Utilities — `stack-utils`

```ts
function detectStackContext(): StackContext;
function validateStackContext(ctx: StackContext): ValidationResult;

// Stack name = "<targetEnv>-<accountPurpose>-<stackPurpose>-<region>"
// e.g. "dev-app-iam-use1" or "stg-ops-vpc-use1"
function parseStackName(stackName: string): StackContext | null;
function generateStackName(ctx: StackContext): string;
function isValidStackName(stackName: string): boolean;

function getEnvironmentConfig(env: Environment): EnvironmentConfig;
function getComplianceRequirements(env: Environment): ComplianceRequirement[];
function validateCrossAccountOperation(source: string, target: string): ValidationResult;
```

> AWS-typed region resolution (`resolveAwsRegion(regionCode): aws.Region`)
> lives in [`@adaptiveworx/iac-aws`](../iac-aws) — `iac-core`'s
> cloud-agnostic boundary forbids `@pulumi/aws` references in its
> emitted types.

### Utilities — `cidr-allocation`

```ts
// Pure CIDR math
function calculateVpcCidr(cidrBase: string, offset: number): string;

// Looks up the cidrBase from SecretManager (`VPC_CIDR_BASE`), then
// resolves an offset from regionsConfig.aws.cidrOffsets[region]
function getVpcCidr(
  environment: string,
  region: string,
  secretManager: SecretManager
): Promise<string>;
```

```ts
calculateVpcCidr("10.224.0.0/11", 0);  // "10.224.0.0/16" — us-east-1
calculateVpcCidr("10.224.0.0/11", 1);  // "10.225.0.0/16" — us-east-2
```

### Schemas — `schemas/core`

Zod validators ready for `safeParse` / `parse`:

```ts
import {
  StackContextSchema,
  DeploymentConfigSchema,
  AwsRegionSchema,
  EnvironmentSchema,
  ComplianceRequirementSchema,
} from "@adaptiveworx/iac-core";

const result = StackContextSchema.safeParse(ctx);
if (!result.success) {
  console.error(result.error.issues);
}
```

## Tested versions

| Dependency | Range |
|---|---|
| Node.js | `>=22.0.0` |
| TypeScript | `^5.9.3` |
| Pulumi | `^3.200.0` |
| Zod | `^3.22.0 \|\| ^4.0.0` (peer) |
| Infisical SDK | `^4.0.6` |

## Stability

This is a `0.x` release. The API may change in backwards-incompatible ways before `1.0`. Once `1.0` ships, the package will follow [Semantic Versioning](https://semver.org/).

## License

[Apache 2.0](./LICENSE). See [NOTICE](./NOTICE) for attribution requirements.

## Repository + contributing

This package is developed in the [AdaptiveWorX/iac-worx](https://github.com/AdaptiveWorX/iac-worx) monorepo at `libs/iac/core/`. See [CONTRIBUTING.md](https://github.com/AdaptiveWorX/iac-worx/blob/main/CONTRIBUTING.md) for setup, workflow conventions, and the release process. File issues at <https://github.com/AdaptiveWorX/iac-worx/issues>.
