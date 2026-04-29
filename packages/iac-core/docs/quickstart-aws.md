# Quick start — AWS with `@adaptiveworx/iac-core`

This guide walks through using `@adaptiveworx/iac-core` to deploy a typical AWS stack with [Pulumi](https://www.pulumi.com/) + TypeScript. It assumes you have an AWS organization with at least one master account, are comfortable with multi-account deploys via OIDC or assumed roles, and use [Infisical](https://infisical.com/) for secret management (or `.env.{env}` files for local development).

## Prerequisites

- Node 22+
- Pulumi CLI 3.150+
- `@pulumi/aws`, `@pulumi/pulumi` installed in your project
- An Infisical project (or local `.env.{env}` files) holding AWS account IDs and shared config

```bash
pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-schemas zod
pnpm add @pulumi/pulumi @pulumi/aws
```

## 1. Construct your `OrganizationConfig`

Pick a loader that matches how you want to source values. For an external AWS consumer, env-var-driven is the simplest:

```ts
// Pulumi.<env>.yaml or shell:
//   ORG_NAME="Acme Co"
//   ORG_TENANT="acme"
//   ORG_DOMAIN="acme.example"
//   IAC_AWS_ORG_ID="123456789012"
//   IAC_AWS_PRIMARY_REGIONS="us-east-1,us-west-2"
//   IAC_AWS_DR_REGIONS="us-east-2"

// libs/orgConfig.ts
import {
  OrganizationConfig,
  loadOrganizationOptionsFromEnv,
} from "@adaptiveworx/iac-core";

export const orgConfig = new OrganizationConfig(loadOrganizationOptionsFromEnv());
```

The class is purely a container of validated options — no I/O at construction time, safe to import from any module.

## 2. Detect the stack context

```ts
import { detectStackContext, validateStackContext } from "@adaptiveworx/iac-core";

const ctx = detectStackContext();         // reads pulumi.getStack() etc.
const { success, errors } = validateStackContext(ctx);
if (!success) {
  throw new Error("invalid stack context: " + errors.map(e => e.message).join(", "));
}
// ctx: { cloud: "aws", environment: "dev", region: "us-east-1", purpose: "vpc", ... }
```

## 3. Resolve regions + account IDs

```ts
import { resolveRegion, AWSAccountRegistry } from "@adaptiveworx/iac-core";

// Region aliasing — accept either short codes ("use1") or canonical names
const region = resolveRegion("aws", ctx.region);   // "us-east-1"

// Account discovery via Infisical
const registry = new AWSAccountRegistry();
const accountId = await registry.getAccountById(
  // resolve via your SecretManager or hardcoded mapping
  process.env.AWS_TARGET_ACCOUNT_ID!
);
```

If you're an AdaptiveWorX-internal caller, swap in `loadAdaptiveFoundationAccounts()` to get the canonical master/audit/log-archive accounts pre-loaded.

## 4. Wire the AWS provider

```ts
import * as aws from "@pulumi/aws";

const provider = new aws.Provider("aws", {
  region: region as aws.Region,
  // assumeRole.roleArn from SecretManager or env, see step 5
});
```

## 5. Read secrets

```ts
import { SecretManager } from "@adaptiveworx/iac-core";

const sm = new SecretManager({ environment: ctx.environment });
const dbPassword = await sm.getSecret("DB_PASSWORD");
const flowLogsEnabled = await sm.getBooleanSecret("FLOW_LOGS_ENABLED", false);
```

For a CI environment, set `INFISICAL_CLIENT_ID` + `INFISICAL_CLIENT_SECRET` (Universal Auth). Locally, drop a `.env.dev` (or `.env.{IAC_ENV}`) file in the project root and `SecretManager` will fall back to it.

## 6. Compute non-overlapping CIDR

```ts
import { getVpcCidr } from "@adaptiveworx/iac-core";

// Looks up VPC_CIDR_BASE from Infisical, applies the per-region offset
// from @adaptiveworx/iac-schemas → returns e.g. "10.224.0.0/16"
const vpcCidr = await getVpcCidr(ctx.environment, region, sm);

const vpc = new aws.ec2.Vpc("primary", {
  cidrBlock: vpcCidr,
  enableDnsHostnames: true,
  enableDnsSupport: true,
}, { provider });
```

## 7. Add the policy pack (optional)

If you also installed `@adaptiveworx/iac-policies`, point Pulumi at its source directory. The pack enforces required tags, region allowlists, and per-tenant compliance frameworks on AWS resources.

```bash
pulumi preview --policy-pack node_modules/@adaptiveworx/iac-policies/src
pulumi up      --policy-pack node_modules/@adaptiveworx/iac-policies/src
```

Or in `Pulumi.<stack>.yaml`:

```yaml
policyPacks:
  - node_modules/@adaptiveworx/iac-policies/src
```

## What you get

| Concern | Solution |
|---|---|
| Multi-account org structure | `OrganizationConfig` + `AWSAccountRegistry` |
| Secret management | `SecretManager` (Infisical with env-var fallback) |
| Region aliasing | `resolveRegion` + `@adaptiveworx/iac-schemas` |
| Stack naming + parsing | `parseStackName` / `generateStackName` |
| Non-overlapping CIDR allocation | `calculateVpcCidr` / `getVpcCidr` |
| Compliance enforcement | `@adaptiveworx/iac-policies` (CrossGuard pack) |

## Common pitfalls

- **Loading `OrganizationConfig` without the env vars set.** Both `loadOrganizationOptionsFromEnv()` and `loadAdaptiveOrganizationDefaults()` require `ORG_NAME`, `ORG_TENANT`, `ORG_DOMAIN`. The class throws on construction if any are missing — set them before Pulumi spawns your TypeScript.
- **Mixing region aliases and canonical names.** `resolveRegion` is idempotent; always call it before passing a region to AWS APIs.
- **Foundation accounts in non-AdaptiveWorX orgs.** Don't call `loadAdaptiveFoundationAccounts()` unless you're inside the AdaptiveWorX AWS organization — it returns AdaptiveWorX-specific account IDs that won't exist in your org.
