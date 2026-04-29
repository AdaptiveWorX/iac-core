# @adaptiveworx/iac-schemas

Region aliases, canonical region names, and Zod-derived schema types for [AdaptiveWorX™ Flow](https://adaptiveworx.com) infrastructure-as-code.

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

// Available canonical regions per cloud
regions.aws.regions; // ["us-east-1", "us-west-2", ...]
```

### Direct JSON import

For tools that prefer raw JSON (e.g. JSON Schema validators, build pipelines):

```ts
import regions from "@adaptiveworx/iac-schemas/regions" with { type: "json" };
```

### Generated Zod schema types

```ts
import type { /* StackContext, DeploymentConfig, etc. */ } from "@adaptiveworx/iac-schemas/generated/schemas/types";
```

The generated `types.d.ts` is produced from the Zod schemas in `@adaptiveworx/iac-core` and shipped pre-generated; consumers don't need a build step.

## What ships

| Path | Contents |
|---|---|
| `dist/index.js` + `dist/index.d.ts` | Library entry exporting `regions` + `Regions` type |
| `config/regions.json` | Region alias data (also accessible via `./regions` subpath) |
| `generated/schemas/types.d.ts` | Pre-generated TypeScript declarations from Zod schemas |
| `generated/schemas/openapi.json` | OpenAPI 3.1 spec for the schemas |
| `generated/schemas/json/*.json` | Per-schema JSON Schema (Draft 2020-12) files |

## Stability

This is a `0.x` release. The shape of `regions.*` and the generated types may change in backwards-incompatible ways before `1.0`. Once `1.0` ships, the package will follow [Semantic Versioning](https://semver.org/).

Region aliases (`use1`, `usw2`, etc.) are considered stable identifiers and won't be renamed; new ones may be added.

## License

[Apache 2.0](./LICENSE). See [NOTICE](./NOTICE).

## Repository + contributing

This package is developed in the [AdaptiveWorX/iac-worx](https://github.com/AdaptiveWorX/iac-worx) monorepo at `libs/iac/schemas/`. See [CONTRIBUTING.md](https://github.com/AdaptiveWorX/iac-worx/blob/main/CONTRIBUTING.md) for setup, workflow conventions, and the release process. File issues at <https://github.com/AdaptiveWorX/iac-worx/issues>.
