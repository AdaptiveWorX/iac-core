# @adaptiveworx/iac-schemas

Region codes and names per provider, and the standard tag keys, for [AdaptiveWorX™ Flow](https://adaptiveworx.com) infrastructure-as-code.

This package is **pure data + types** — zero runtime dependencies. It's the source-of-truth for region resolution across the `@adaptiveworx/iac-*` packages and is safe to import from any TypeScript project.

## Install

```bash
pnpm add @adaptiveworx/iac-schemas
# or
yarn add @adaptiveworx/iac-schemas
# or
npm install @adaptiveworx/iac-schemas
```

## Usage

### Region resolution

```ts
import { regions } from "@adaptiveworx/iac-schemas";

// AWS region aliases
regions.aws.aliases.use1; // "us-east-1"
regions.aws.aliases.usw2; // "us-west-2"

// Azure region aliases
regions.azure.aliases.eus2; // "eastus2"

// Available canonical regions per provider
regions.aws.regions; // ["us-east-1", "us-west-2", ...]

// Cloudflare (no regions): the single code glb
regions.cloudflare.aliases.glb; // "global"
```

### Typed region data

```ts
import { AWS_REGION_CODES, AWS_REGION_NAMES, REGIONS } from "@adaptiveworx/iac-schemas";
import type { AwsRegionCode, AwsRegionName } from "@adaptiveworx/iac-schemas";

REGIONS.aws.aliases.use1; // "us-east-1", typed as the literal
const code: AwsRegionCode = "usw2";
```

`REGIONS` (`src/regions.ts`) is the single source of region data; iac-core
derives `AwsRegion` and `AwsRegionSchema` from it. `config/regions.json` is
the same data as JSON, kept equal by a unit test.

### Standard tag keys

```ts
import { STANDARD_TAG_KEYS } from "@adaptiveworx/iac-schemas";
// Environment, Tenant, AccountPurpose, StackPurpose, TargetEnvironment,
// Workload, ManagedBy, Description
```

`Workload` names the workload a resource belongs to (`flow`, `ztna`, …;
`shared` for shared infrastructure). Permission boundaries and ABAC
conditions scope access by it.

### Direct JSON import

For tools that prefer raw JSON (e.g. JSON Schema validators, build pipelines):

```ts
import regions from "@adaptiveworx/iac-schemas/regions" with { type: "json" };
```

## What ships

| Path | Contents |
|---|---|
| `dist/index.js` + `dist/index.d.ts` | Library entry: `regions`, `REGIONS`, AWS region code/name lists and types, `STANDARD_TAG_KEYS` |
| `config/regions.json` | Region alias data (also accessible via `./regions` subpath) |

The pre-generated JSON Schemas / OpenAPI / `types.d.ts` under `generated/`
were removed in 0.2: nothing consumed them and they had gone stale. For JSON
Schema, use zod 4's `z.toJSONSchema()` on iac-core's schemas directly.

## Stability

This is a `0.x` release. The shape of `regions.*` may change in backwards-incompatible ways before `1.0`. Once `1.0` ships, the package will follow [Semantic Versioning](https://semver.org/).

Region aliases (`use1`, `usw2`, etc.) are considered stable identifiers and won't be renamed; new ones may be added.

## License

[Apache 2.0](./LICENSE). See [NOTICE](./NOTICE).

## Repository + contributing

This package is developed in the [AdaptiveWorX/iac-worx](https://github.com/AdaptiveWorX/iac-worx) monorepo at `libs/iac/schemas/`. See [CONTRIBUTING.md](https://github.com/AdaptiveWorX/iac-worx/blob/main/CONTRIBUTING.md) for setup, workflow conventions, and the release process. File issues at <https://github.com/AdaptiveWorX/iac-worx/issues>.
