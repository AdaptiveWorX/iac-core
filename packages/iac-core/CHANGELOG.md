# Changelog

All notable changes to `@adaptiveworx/iac-core` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/) once it
reaches `1.0.0`. Until then, breaking changes may land in any `0.x` minor.

## [Unreleased]

## [0.2.0] - 2026-04-25

First externally consumable release. Brings the package to npm-publishable
quality: compiled `dist/` output, full TypeScript declarations, no
auto-loaded singletons, and AdaptiveWorX-specific values isolated behind
adapter helpers.

### Added

- **Public library entry point.** `src/index.ts` now re-exports the full
  public surface (`SecretManager`, `OrganizationConfig`,
  `AWSAccountRegistry`, types, utils, schemas, validation). Subpath
  imports (e.g. `@adaptiveworx/iac-core/utils/stack-utils`) remain
  available for tree-shaking-sensitive consumers.
- **`OrganizationOptions` type + adapter helpers.**
  `loadOrganizationOptionsFromEnv()` (generic, env-var driven) and
  `loadAdaptiveOrganizationDefaults()` (AdaptiveWorX-internal) source
  config; `OrganizationConfig` is a pure consumer.
- **`AwsAccountRegistryOptions`.** `AWSAccountRegistry` accepts
  `{ secretManager?, foundationAccounts?, accountNamingPrefix? }`.
  AdaptiveWorX-internal callers use `loadAdaptiveFoundationAccounts()` to
  preserve historical behaviour.
- **`setAWSAccountRegistry()`** for explicit singleton installation at
  app startup.
- **`DEFAULT_ENVIRONMENTS`, `DEFAULT_STACK_NAMING`, `DEFAULT_NETWORK`,
  `DEFAULT_CLOUD_PROVIDERS`** exported as named constants so consumers
  can compose their own `OrganizationOptions` from the canonical layout.
- **Env-var overrides** for schema metadata: `IAC_SCHEMA_BASE_URL`,
  `IAC_SCHEMA_CONTACT_NAME`, `IAC_SCHEMA_CONTACT_URL`.
- **Env-var overrides** for foundation account emails:
  `AWS_EMAIL_ADAPTIVE_{MASTER,AUDIT,BACKUP_ADMIN,CENTRAL_BACKUP,LOG_ARCHIVE}`.
- **Per-package `tsconfig.lib.json`** isolates the build from the
  workspace-wide root tsconfig and excludes test files from emitted
  output.
- **README.md** with install instructions, public API map, env-var
  reference, multi-tenant override pattern, and tested-versions matrix.
- **CHANGELOG.md** (this file).

### Changed

- **Build target**: `tsc` → `tsc -p tsconfig.lib.json`. Output goes to
  `libs/iac/core/dist/` with `.js` + `.d.ts` + maps for every source file.
- **`package.json`**:
  - `main`: `./src/index.ts` → `./dist/index.js`
  - Added `types: ./dist/index.d.ts`
  - `exports` map rewritten with `types`/`import` conditions pointing at
    `dist/`
  - Added `files: ["dist", "LICENSE", "NOTICE", "README.md", "CHANGELOG.md"]`
  - Added `repository`, `homepage`, `bugs`, `keywords`, `engines.node >=22`,
    `publishConfig.access=public`, `publishConfig.provenance=true`
- **`OrganizationConfig`**: constructor now takes `OrganizationOptions`
  explicitly. Reads from `process.env` are isolated to adapter helpers.
- **`AWSAccountRegistry`**: foundation accounts and account-naming prefix
  are constructor options. Defaults: empty foundation map,
  `accountNamingPrefix: "account"` (was `"worx"`).
- **`zod`** moved from `dependencies` to `peerDependencies` (range:
  `^3.22.0 || ^4.0.0`).

### Removed

- **`organizationConfig` (auto-loaded singleton) and `getOrgConfig()`**.
  Importing the package no longer triggers env-var reads. Callers
  construct `OrganizationConfig` explicitly.
- **`@aws-sdk/client-{ec2,iam,route-53,s3,sts}`** runtime dependencies.
  None were imported in source. Consumers who need AWS SDK install it
  themselves.
- **AdaptiveWorX-specific hardcodes from `OrganizationConfig` constructor**:
  AWS org ID `289507152988`, master account `adaptive-master`, security
  account `worx-secops`, primary regions `["us-east-1", "us-west-2"]`,
  DR regions `["us-east-2", "eu-west-1"]`. These now live in
  `loadAdaptiveOrganizationDefaults()` only and are not the library's
  default behaviour.
- **AdaptiveWorX-specific foundation accounts from `AWSAccountRegistry`
  constructor**. Now in `loadAdaptiveFoundationAccounts()`.

### Fixed

- **Path resolution after the `packages/iac-core` → `libs/iac/core`
  monorepo move**: hardcoded `../../../iac-schemas/config/regions.json`
  paths in `region-utils.ts` and `cidr-allocation.ts` updated to
  `../../../schemas/...`. The schema-output dir constants in
  `schemas/constants.ts` updated from `packages/iac-schemas/generated`
  to `libs/iac/schemas/generated`.

### Migration notes

For AdaptiveWorX-internal callers upgrading from 0.1.x:

```ts
// Before
import { OrganizationConfig, organizationConfig } from "@adaptiveworx/iac-core/config/organization";
const o = new OrganizationConfig();
// or use the singleton: organizationConfig.foo

// After
import {
  OrganizationConfig,
  loadAdaptiveOrganizationDefaults,
} from "@adaptiveworx/iac-core/config/organization";
const o = new OrganizationConfig(loadAdaptiveOrganizationDefaults());
```

```ts
// Before
const registry = new AWSAccountRegistry();

// After (preserve AdaptiveWorX behavior)
import {
  AWSAccountRegistry,
  loadAdaptiveFoundationAccounts,
} from "@adaptiveworx/iac-core/config/aws-accounts";
const registry = new AWSAccountRegistry({
  foundationAccounts: loadAdaptiveFoundationAccounts(),
  accountNamingPrefix: "worx",
});
```

External consumers (no AdaptiveWorX defaults expected): construct directly
or use `loadOrganizationOptionsFromEnv()`.

## [0.1.0] - 2025-10-11

Initial pre-release. Internal AdaptiveWorX use only; not published to
npm. Source available in the [iac-worx monorepo](https://github.com/AdaptiveWorX/iac-worx).
