# `@adaptiveworx/iac-policies`

Composable Pulumi CrossGuard policy primitives. **A library, not a complete pack** — consumers compose primitives into their own `PolicyPack` with the configuration that fits their org.

Three cross-cloud policies + one AWS-specific:

| Factory | Cloud | What it does |
|---|---|---|
| [`requireTagsPolicy`](./src/policies/require-tags.ts) | cross-cloud | Reject resources missing required tags (or with mismatched expected values) |
| [`regionalCompliancePolicy`](./src/policies/regional-compliance.ts) | cross-cloud (AWS-default; configurable for Azure/GCP) | Reject resources outside an allowed region list |
| [`deploymentProtectionPolicy`](./src/policies/deployment-protection.ts) | cross-cloud | Block production deploys that aren't running in CI/CD |
| [`awsSecurityBaselinePolicy`](./src/policies/aws-security-baseline.ts) | AWS | S3 public-ACL rejection + S3 encryption-config presence |

Plus type exports for compliance annotation: [`FrameworkControls`](./src/types.ts), [`ComplianceEvidence`](./src/types.ts), and a future-use [`emitEvidence`](./src/evidence.ts) stub.

## Install

```bash
pnpm add @adaptiveworx/iac-policies @pulumi/policy @pulumi/pulumi
```

`@pulumi/policy` and `@pulumi/pulumi` are peer dependencies.

## How a consumer composes a pack

Each consumer maintains their own policy-pack directory in their repo:

```
my-repo/
└── policies/
    ├── PulumiPolicy.yaml     # pack manifest
    ├── package.json          # depends on @adaptiveworx/iac-policies + @pulumi/policy + @pulumi/pulumi
    └── index.ts              # imports primitives + constructs PolicyPack
```

`PulumiPolicy.yaml`:

```yaml
name: my-org-policies
runtime: nodejs
description: My org's policy pack composed from @adaptiveworx/iac-policies primitives
```

`index.ts` examples below.

### Example: AWS consumer

Uses all four primitives. Pulls stack context from
`@adaptiveworx/iac-core` so tag values stay in sync with the Pulumi
stack the pack runs against.

```ts
import { PolicyPack } from "@pulumi/policy";
import { detectStackContext } from "@adaptiveworx/iac-core";
import {
  requireTagsPolicy,
  regionalCompliancePolicy,
  awsSecurityBaselinePolicy,
  deploymentProtectionPolicy,
  AWS_NON_TAGGABLE_RESOURCES,
} from "@adaptiveworx/iac-policies";

const ctx = detectStackContext();

new PolicyPack("my-aws-policies", {
  policies: [
    requireTagsPolicy({
      requiredTags: ["Environment", "AccountPurpose", "StackPurpose"],
      expectedTagValues: () => ({
        Environment: ctx.targetEnvironment ?? ctx.environment,
        AccountPurpose: ctx.accountPurpose,
        StackPurpose: ctx.stackPurpose,
      }),
      skipResourceTypes: AWS_NON_TAGGABLE_RESOURCES,
      skipResourceTypePrefixes: ["pulumi:"],
    }),

    regionalCompliancePolicy({
      allowedRegions:
        ctx.environment === "prd" ? ["us-east-1", "us-west-2"] : ["us-east-1"],
    }),

    awsSecurityBaselinePolicy(),

    deploymentProtectionPolicy({
      productionEnvironments: ["prd", "sec"],
      environmentResolver: () => ctx.targetEnvironment ?? ctx.environment,
    }),
  ],
});
```

Then deploy with the pack:

```bash
pulumi preview --policy-pack ./policies
pulumi up      --policy-pack ./policies
```

### Example: Azure consumer

Cross-cloud primitives only. The consumer adds their own Azure-specific
baseline (storage, key vault, etc.) as additional policies in the same
pack when needed.

```ts
import { PolicyPack } from "@pulumi/policy";
import {
  requireTagsPolicy,
  regionalCompliancePolicy,
  deploymentProtectionPolicy,
} from "@adaptiveworx/iac-policies";

new PolicyPack("my-azure-policies", {
  policies: [
    requireTagsPolicy({
      requiredTags: ["Environment", "Owner"],
    }),

    regionalCompliancePolicy({
      allowedRegions: ["westus3", "eastus2"],
      resourceTypeMatcher: t => t.startsWith("azure-native:"),
      regionExtractor: args => args.props.location as string | undefined,
    }),

    deploymentProtectionPolicy({
      productionEnvironments: ["prod"],
      environmentResolver: () => process.env.PULUMI_STACK ?? "dev",
    }),

    // (No AWS baseline — write Azure-specific baseline policies as
    //  needed and add them to this pack.)
  ],
});
```

## Why no built-in pack?

Most policy concerns are consumer-specific:

- **Required tags vary** — `Environment`, `Owner`, `CostCenter`, `Compliance`, …
- **Allowed regions vary** — by tenant, by data-residency, by environment
- **Compliance frameworks vary** — HIPAA for healthcare; PCI-DSS for payments; ISO27001 baseline for everyone
- **Production gates vary** — `prd`, `prod`, `production`, sometimes also `sec`/`mgmt`
- **Cloud surface varies** — AWS-only consumers don't want Azure-specific checks and vice versa

Shipping a pre-built pack would either be too generic to be useful or too AdaptiveWorX-specific to share. A library of primitives is composable, configurable, and lets each consumer match their own conventions.

## Compliance annotations

Use [`FrameworkControls`](./src/types.ts) to document which compliance framework requirements a given policy satisfies:

```ts
import type { FrameworkControls } from "@adaptiveworx/iac-policies";

const tagControls: FrameworkControls = {
  "NIST-800-53": ["CM-2", "CM-8"],
  ISO27001: ["A.8.1.1"],
};
```

These are annotation types — they don't drive runtime behavior, but they're what compliance reporting and audit-evidence pipelines hook into.

## Stability

`0.x` while the primitive surfaces stabilize. Backwards-incompatible API changes will be major bumps; minor versions add new primitives or non-breaking option fields.

## License

[Apache 2.0](./LICENSE). See [NOTICE](./NOTICE).

## Repository

[github.com/AdaptiveWorX/iac-core/tree/main/packages/iac-policies](https://github.com/AdaptiveWorX/iac-core/tree/main/packages/iac-policies). Issues: [iac-core/issues](https://github.com/AdaptiveWorX/iac-core/issues).
