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

## 1. Construct your `OrganizationConfig` + `AwsOrganizationConfig`

`iac-core`'s `OrganizationConfig` is cloud-agnostic — org identity, environments, stack naming, network strategy. AWS-organization specifics (org ID, master/security accounts, primary/DR regions) live in `AwsOrganizationConfig` from [`@adaptiveworx/iac-aws`](https://github.com/AdaptiveWorX/iac-core/tree/main/packages/iac-aws). For an external AWS consumer, env-var-driven is the simplest:

```ts
// Pulumi.<env>.yaml or shell:
//   ORG_NAME="Acme Co"
//   ORG_TENANT="acme"
//   ORG_DOMAIN="acme.example"
//   IAC_AWS_ORG_ID="123456789012"
//   IAC_AWS_MASTER_ACCOUNT="acme-master"
//   IAC_AWS_SECURITY_ACCOUNT="acme-secops"
//   IAC_AWS_PRIMARY_REGIONS="us-east-1,us-west-2"
//   IAC_AWS_DR_REGIONS="us-east-2"

// libs/orgConfig.ts
import {
  OrganizationConfig,
  loadOrganizationOptionsFromEnv,
} from "@adaptiveworx/iac-core";
import {
  AwsOrganizationConfig,
  loadAwsOrganizationOptionsFromEnv,
} from "@adaptiveworx/iac-aws";

export const orgConfig = new OrganizationConfig(loadOrganizationOptionsFromEnv());
export const awsConfig = new AwsOrganizationConfig(loadAwsOrganizationOptionsFromEnv());
```

Both classes are pure containers of validated options — no I/O at construction time, safe to import from any module.

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

`@adaptiveworx/iac-policies@0.2+` is a **library of factory primitives**, not a runnable pack. Each consumer maintains a small policy-pack directory in their repo and composes the primitives:

```
my-repo/
└── policies/
    ├── PulumiPolicy.yaml     # pack manifest
    ├── package.json          # depends on @adaptiveworx/iac-policies + @pulumi/policy
    └── index.ts              # imports primitives + constructs PolicyPack
```

```ts
// policies/index.ts
import { PolicyPack } from "@pulumi/policy";
import {
  requireTagsPolicy,
  regionalCompliancePolicy,
  awsSecurityBaselinePolicy,
  deploymentProtectionPolicy,
  AWS_NON_TAGGABLE_RESOURCES,
} from "@adaptiveworx/iac-policies";

new PolicyPack("my-aws-policies", {
  policies: [
    requireTagsPolicy({
      requiredTags: ["Environment", "AccountPurpose", "StackPurpose"],
      skipResourceTypes: AWS_NON_TAGGABLE_RESOURCES,
    }),
    regionalCompliancePolicy({ allowedRegions: ["us-east-1", "us-west-2"] }),
    awsSecurityBaselinePolicy(),
    deploymentProtectionPolicy({
      productionEnvironments: ["prd"],
      environmentResolver: () => ctx.environment,
    }),
  ],
});
```

Then deploy with the pack:

```bash
pulumi preview --policy-pack ./policies
pulumi up      --policy-pack ./policies
```

See [`@adaptiveworx/iac-policies` README](https://github.com/AdaptiveWorX/iac-core/tree/main/packages/iac-policies#readme) for the full primitive surface and Azure-consumer example.

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
