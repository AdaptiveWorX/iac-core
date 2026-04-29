# Quick start — Azure with `@adaptiveworx/iac-core`

`@adaptiveworx/iac-core` is **AWS-shaped at the framework level** — `OrganizationConfig` knows about AWS organizations, master accounts, security accounts, etc. There's no equivalent abstraction for Azure Management Groups today (that's planned for a future release as a sibling type).

For Azure deployments, the package is still useful as a **secrets + region resolution + Pulumi stack-context** library. You skip the AWS-specific surface and configure Azure-shaped values where it matters.

## Prerequisites

- Node 22+
- Pulumi CLI 3.150+
- `@pulumi/azure-native` installed in your project

```bash
pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-schemas zod
pnpm add @pulumi/pulumi @pulumi/azure-native
```

## 1. Construct your `OrganizationConfig` — Azure shape

Disable AWS, enable Azure. The class doesn't model Management Groups today, but the `cloudProviders.azure` block carries enough for region-aware deploys.

```ts
// libs/orgConfig.ts
import { OrganizationConfig } from "@adaptiveworx/iac-core";

export const orgConfig = new OrganizationConfig({
  orgName: "Prosilio Care",
  tenant: "care",
  orgDomain: "prosilio.care",
  cloudProviders: {
    azure: {
      enabled: true,
      primaryRegions: ["eastus2"],
      drRegions: ["westus3"],
    },
    // aws stays at DEFAULT_CLOUD_PROVIDERS.aws (enabled: false)
  },
});
```

If you don't need a typed organization config at all, skip this — the rest of the package works fine without it.

## 2. Detect the stack context

```ts
import { detectStackContext } from "@adaptiveworx/iac-core";

const ctx = detectStackContext();
// For an Azure stack: { cloud: "azure", environment: "prd", region: "eastus2", purpose: "data", ... }
```

`StackContext` is multi-cloud-aware (`cloud: "aws" | "azure" | "gcp" | "cloudflare"`); the parsing/validation utilities all work for Azure too.

## 3. Read secrets via Infisical (or env-var fallback)

```ts
import { SecretManager } from "@adaptiveworx/iac-core";

const sm = new SecretManager({ environment: ctx.environment });

const dbPassword = await sm.getSecret("DB_PASSWORD");
const tenantId = await sm.getSecret("AZURE_TENANT_ID");
const clientId = await sm.getSecret("AZURE_CLIENT_ID");
```

CI auth: set `INFISICAL_CLIENT_ID` + `INFISICAL_CLIENT_SECRET` (Universal Auth). Local dev: drop `.env.dev` / `.env.prd` files at the project root.

## 4. Resolve Azure region aliases

```ts
import { resolveRegion } from "@adaptiveworx/iac-core";

resolveRegion("azure", "eus2");    // "eastus2"
resolveRegion("azure", "wus3");    // "westus3"
resolveRegion("azure", "eastus2"); // "eastus2"
```

Region aliases come from [`@adaptiveworx/iac-schemas`](https://github.com/AdaptiveWorX/iac-worx/tree/main/libs/iac/schemas) — if you need a region that isn't in the alias map, file an issue.

## 5. Wire the Azure provider

```ts
import * as azure from "@pulumi/azure-native";

const region = resolveRegion("azure", ctx.region);

const rg = new azure.resources.ResourceGroup("rg-prosilio-prd-data-eus2", {
  resourceGroupName: orgConfig.formatStackName(
    orgConfig.orgName.toLowerCase(), "azure", "data", ctx.environment, region
  ),
  location: region,
});
```

`OrganizationConfig.formatStackName` works for any cloud — just pass `"azure"` as the cloud component.

## 6. CIDR allocation for Azure VNets

`getVpcCidr` is technically AWS-named but the math is cloud-agnostic. The CIDR base + region-offset table in [`@adaptiveworx/iac-schemas`](https://github.com/AdaptiveWorX/iac-worx/blob/main/libs/iac/schemas/config/regions.json) currently has AWS-specific offsets. For Azure, supply your own CIDR strategy:

```ts
import { calculateVpcCidr } from "@adaptiveworx/iac-core";

// Pure CIDR math — give it a base + offset, get a /16
const cidr = calculateVpcCidr("10.96.0.0/11", 0);  // "10.96.0.0/16" — eastus2
const drCidr = calculateVpcCidr("10.96.0.0/11", 1); // "10.97.0.0/16" — westus3

const vnet = new azure.network.VirtualNetwork("vnet-prosilio-prd-data-eus2", {
  resourceGroupName: rg.name,
  addressSpace: { addressPrefixes: [cidr] },
});
```

If you want region-aware automatic offsetting (like the AWS version), maintain a small map in your own code:

```ts
const azureCidrOffsets: Record<string, number> = {
  eastus2: 0,
  westus3: 1,
  centralus: 2,
};
const cidr = calculateVpcCidr(cidrBase, azureCidrOffsets[region] ?? 0);
```

## What's NOT covered today

- **`AWSAccountRegistry`** — AWS-only. No Azure equivalent yet (no `AzureSubscriptionRegistry`).
- **`OrganizationConfig.cloudProviders.azure.organizationId` / `masterAccount`** — these fields exist on the type but Azure has different concepts (Management Groups, Tenants, Subscriptions). Treat them as opaque strings if you set them.
- **`@adaptiveworx/iac-policies`** — the CrossGuard pack only enforces rules on `aws:*` resources. Azure resources pass through unchanged. A future Azure-specific policy pack is on the roadmap.

## When to NOT use this package

If your project is Azure-only and never touches AWS, the AWS-specific surface (`AWSAccountRegistry`, AWS-shaped `OrganizationConfig`, the AWS-only policy pack) is dead code. The remaining pieces — `SecretManager`, `resolveRegion`, `calculateVpcCidr`, `detectStackContext`, the Zod schemas — are useful but small enough to inline if you'd rather not pull in the dependency.

For a healthcare client like Prosilio Care that's deploying first to Azure but anticipates an AWS workload later, the package is worth keeping in place.
