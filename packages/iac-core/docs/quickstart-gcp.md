# Quick start — GCP with `@adaptiveworx/iac-core`

GCP support in `@adaptiveworx/iac-core` is **type-aware but framework-thin** — same shape as Azure. `StackContext` and `resolveRegion` know about `cloud: "gcp"`, region aliases (`use1` → `us-east1`, etc.) live in [`@adaptiveworx/iac-schemas`](https://github.com/AdaptiveWorX/iac-worx/tree/main/libs/iac/schemas), but there's no `GCPProjectRegistry` (analogous to `AWSAccountRegistry`) yet.

For GCP deployments, use the package for secrets + region resolution + Pulumi stack-context. The AWS-specific surface stays disabled.

## Prerequisites

- Node 22+
- Pulumi CLI 3.150+
- `@pulumi/gcp` installed in your project

```bash
pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-schemas zod
pnpm add @pulumi/pulumi @pulumi/gcp
```

## 1. Construct your `OrganizationConfig`

`OrganizationConfig` is cloud-agnostic. Keep GCP-specific values (organization ID, project IDs, region lists) alongside in your own constants — there's no `GcpOrganizationConfig` sibling type yet.

```ts
// libs/orgConfig.ts
import { OrganizationConfig } from "@adaptiveworx/iac-core";

export const orgConfig = new OrganizationConfig({
  orgName: "Acme Co",
  tenant: "acme",
  orgDomain: "acme.example",
});

export const gcpOrganizationId = "123456789012";
export const gcpPrimaryRegions = ["us-central1", "us-west1"];
export const gcpDrRegions = ["us-east1"];
```

When GCP deployments stabilize a shape, a `GcpOrganizationConfig` will land in `@adaptiveworx/iac-gcp` (analogous to `AwsOrganizationConfig` in [`@adaptiveworx/iac-aws`](https://github.com/AdaptiveWorX/iac-core/tree/main/packages/iac-aws)).

## 2. Detect the stack context

```ts
import { detectStackContext, resolveRegion } from "@adaptiveworx/iac-core";

const ctx = detectStackContext();
const region = resolveRegion("gcp", ctx.region);   // "usc1" → "us-central1"
```

## 3. Read secrets

```ts
import { SecretManager } from "@adaptiveworx/iac-core";

const sm = new SecretManager({ environment: ctx.environment });
const projectId = await sm.getSecret("GCP_PROJECT_ID");
const dbPassword = await sm.getSecret("DB_PASSWORD");
```

## 4. Wire the GCP provider

```ts
import * as gcp from "@pulumi/gcp";

const provider = new gcp.Provider("gcp", {
  project: projectId,
  region,
});
```

## 5. CIDR allocation

`calculateVpcCidr` is cloud-agnostic. Maintain your own GCP region-offset table:

```ts
import { calculateVpcCidr } from "@adaptiveworx/iac-core";

const gcpCidrOffsets: Record<string, number> = {
  "us-central1": 0,
  "us-west1": 1,
  "us-east1": 2,
};
const cidr = calculateVpcCidr("10.128.0.0/11", gcpCidrOffsets[region] ?? 0);
```

## What's NOT covered today

- **`GCPProjectRegistry`** — doesn't exist. Roll your own project mapping if you need multi-project deploys.
- **`@adaptiveworx/iac-policies`** — only enforces `aws:*` resources. GCP resources pass through unchanged.

## Roadmap signal

If your project would benefit from a `GCPProjectRegistry` analog or GCP-specific policy rules, file an issue at <https://github.com/AdaptiveWorX/iac-worx/issues> describing the pattern. Real consumer needs drive what we build out next.
