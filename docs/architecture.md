# Architecture — AdaptiveWorX `iac-core`

> The OSS infrastructure-as-code library suite for multi-cloud Pulumi
> deployments. This document covers what's in the repo, why it's split
> the way it is, and how it's released.

## Repo at a glance

`iac-core` is a **publish-focused Nx monorepo** for the
`@adaptiveworx/iac-*` family of npm packages. Every directory under
`packages/` is a separately-versioned npm artifact. The repo itself is not
deployable — it's a producer of libraries.

```
iac-core/
├── packages/
│   ├── iac-core/                    # Cross-cloud primitives
│   ├── iac-schemas/                 # Zod-derived JSON schemas
│   ├── iac-policies/                # Pulumi policy packs
│   ├── iac-aws/          # AWS Pulumi components
│   └── iac-azure/        # Azure Pulumi components (skeleton)
├── docs/
│   ├── architecture.md              # ← you are here
│   ├── migration-plan.md            # transient: iac-worx → iac-core migration
│   ├── compliance-framework.md
│   ├── security-implementation.md
│   └── testing-strategy.md
├── scripts/
│   └── compliance-report.ts
├── nx.json                          # Workspace config + release config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
└── vitest.config.ts
```

## Producer / consumer model

`iac-core` is the **producer**. It does not deploy infrastructure itself —
it ships libraries that consumers use to deploy infrastructure.

| Role | Repo(s) | What they do |
|---|---|---|
| **Producer** | `iac-core` (this repo) | Hosts every reusable `@adaptiveworx/iac-*` package as an Nx-managed monorepo. Each package ships independent semver to public npm via Nx Release. Apache 2.0. |
| **Internal consumer** | `iac-worx` | AdaptiveWorX's private deployment monorepo (BUSL-1.1). Pulumi stacks under `apps/aws/{dev,stg,prd,sec}` consume the published packages from npm. |
| **External consumers** | Client repos (Prosilio, future clients) | `pnpm add @adaptiveworx/iac-core …`, write their own stacks in their own repos. |

Separating producer from consumer lets the OSS packages have their own
release cadence, public license, and consumer audience without dragging
private deployment infrastructure along. Internal and external consumers
are treated identically — `iac-worx` is a consumer like any other.

A consumer **does not** add reusable code to its own repo. New reusable
patterns get built inline first, then promoted into the appropriate
`iac-core` package, published, and consumed back. This rule applies
equally to `iac-worx` and to external client repos.

## Why a monorepo

Three forces pushed us out of single-package layout:

1. **Multiple cloud surfaces.** AWS and Azure components have wildly
   different primitive sets and different consumer audiences. Forcing
   them into one package means every Azure user installs `@pulumi/aws`
   and vice versa.
2. **Independent release cadence.** `iac-core` rev-locking the AWS
   components (or Azure components) creates churn for consumers who
   touch only one surface.
3. **Cross-package coordination.** `iac-aws` depends on
   `iac-core`. Workspace path resolution + a single `pnpm install` lets
   us evolve them together while still publishing them apart.

Nx adds three concrete wins on top of plain pnpm workspaces: **affected
graph** (only build/test what changed), **task caching** (skip
already-passing work locally and in CI), and **Nx Release** (orchestrated
independent versioning + npm publish + GitHub releases from conventional
commits).

## The packages

### `@adaptiveworx/iac-core`

**Cross-cloud primitives only.** This is the foundation every other
package and every consumer depends on, so the bar for what gets in is
"used by every cloud." Concretely:

- `OrganizationConfig` — cloud-agnostic identity, environments,
  naming, network defaults
- `SecretManager` — secret retrieval (Infisical today; pluggable in
  roadmap)
- Region utilities — region code ↔ canonical name, region grouping
- CIDR allocation — deterministic address space carving
- Stack utilities — context detection, naming, README generation
- Validation — agent guardrails, configuration patterns, Zod helpers
- Schemas — re-exports of `iac-schemas` constants

The `core` name is deliberate: this is the **core** that everything
builds on, not generic shared utilities. AWS-Org-shaped pieces (account
registry, AWS region CIDR offsets) live in `iac-aws`, not
here. Azure-Tenant-shaped pieces will live in `iac-azure`.

### `@adaptiveworx/iac-schemas`

Zod schemas + generated JSON Schemas for all of AdaptiveWorX's
configuration contracts (stack config, account config, environment
config, …). Published so that:

- External tooling (linters, AI agents, IDE assistants) can validate
  YAML/JSON config files against canonical schemas.
- Consumers (Prosilio, iac-worx, others) can use the same Zod runtime
  validators in their TypeScript code.

Has zero runtime deps beyond Zod, which is a peer dependency.

### `@adaptiveworx/iac-policies`

Pulumi policy packs — security/compliance/cost policies that run during
`pulumi preview`/`pulumi up`. Cross-cloud where possible (e.g. tag
enforcement); cloud-specific where needed (e.g. AWS S3 public-access
blocks).

### `@adaptiveworx/iac-aws`

Production-tested Pulumi components for AWS:

| Component | Purpose |
|---|---|
| `SharedVpc` | Multi-tier VPC with NAT, flow logs, RAM sharing, configurable per-tier CIDR, optional VPC endpoints |
| `CrossAccountIAMRoles` | Cross-account Pulumi role + foundation access role (product-line architecture) |
| `GitHubActionsOIDC` | OIDC provider + GitHub Actions deploy role |
| IAM policy helpers | Composable policy document builders |
| AWS-IAM naming helpers | `buildGithubOidcRoleName`, `buildCrossAccountRoleName`, etc. (formerly `src/shared/`) |

**Renamed from `@adaptiveworx/iac-components`** at 0.7.0 as part of the
multi-cloud restructure. The old package is published deprecated with a
rename pointer.

### `@adaptiveworx/iac-azure`

Azure components — currently an empty skeleton. Patterns are being
captured inline in Prosilio's first Azure stacks; stable patterns will
be extracted here once they prove out.

#### Azure component roadmap

When Prosilio's first few stacks have stabilized, extract these into
`packages/iac-azure/src/`:

- **`FabricCapacity`** — F-series capacity, region, admin assignments
- **`FabricWorkspace`** — workspace identity, capacity assignment, role grants
- **`FabricLakehouse`** — Lakehouse + shortcut configuration helpers
- **`OneLakeShortcut`** — generalized shortcut wrapper (cross-region, cross-account)
- **`StorageSecure`** — ADLS Gen2 with private endpoints, public network disabled, hierarchical namespace
- **`KeyVaultSecure`** — KV with private endpoint, RBAC model, soft-delete, purge protection
- **`PrivateEndpointWithDns`** — PE + private DNS zone link + zone group config (the "save 40 lines per service" wrapper)
- **`LogAnalyticsCentral`** — central LAW with retention, Defender linkage
- **`HubVNet` / `SpokeVNet`** — hub-and-spoke networking primitives
- **`DatabricksAppliance`** *(maybe)* — minimal-config workspace + single job for the ModMed snapshot pattern; might stay inline since it's a one-off

`DatabricksSecureWorkspace` as previously sketched is no longer a high
priority — Prosilio uses ADB only as a thin appliance, not a
general-purpose lakehouse.

## Dependency graph

```
                  ┌──────────────┐
                  │ iac-schemas  │  (no internal deps)
                  └──────┬───────┘
                         │
                  ┌──────▼───────┐
                  │   iac-core   │  (depends: iac-schemas)
                  └──┬─────┬─────┘
                     │     │
        ┌────────────┘     └────────────┐
        │                               │
┌───────▼─────────────┐    ┌────────────▼──────────┐
│iac-aws   │    │iac-azure   │
│(deps: iac-core)     │    │(deps: iac-core)       │
└─────────────────────┘    └───────────────────────┘

iac-policies depends on iac-core (and may depend on cloud component
packages depending on what the policy inspects).
```

Nx enforces this via tag-based module-boundary rules in `nx.json`:

| Source tag | May depend on |
|---|---|
| `scope:core` | `scope:core` only |
| `scope:aws` | `scope:core`, `scope:aws` |
| `scope:azure` | `scope:core`, `scope:azure` |
| `scope:policies` | `scope:core`, `scope:policies` |
| `scope:schemas` | `scope:schemas` only (foundation) |

The AWS package never imports from Azure (or vice versa) — they're
parallel, not stacked.

## How releases work

Versioning is **independent per package** via `nx release`. Releases
land on `main` via PR (not direct push), and tag creation +
publishing are fully automated downstream of the PR merge:

```
release branch
  └─ pnpm release:prepare    nx release + manifest + amend + tags-locally
  └─ pnpm release:pr         push branch + open release PR
       ↓
release PR  →  rebase merge  →  main
       ↓
release-tags.yml     validates .release/manifest.json
                     creates + pushes per-package tags via GitHub App token
       ↓
release.yml          per tag: builds + publishes via npm OIDC
```

Three workflow files cooperate:

| Workflow | Trigger | Role |
|---|---|---|
| `ci.yml` | PR + push to main | Validates the release PR (lint, typecheck, test, build) |
| `release-tags.yml` | push to main with `chore(release): publish` head-commit subject | Validates the manifest + creates/pushes per-package tags via a dedicated GitHub App |
| `release.yml` | tag push matching `@adaptiveworx/iac-*@*` | Builds + publishes the package via npm OIDC Trusted Publishing |

The maintainer never pushes directly to main, never holds publish
authority, never bypasses status checks. The dedicated GitHub App is
the only privileged automation; it's added as a bypass actor on the
tag protection ruleset (it can create release tags) and nothing else.

### What this means for contributors

- **Use conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, etc.)
  — they directly drive version bumps and changelog entries.
- **Never edit a `version` field by hand.** `nx release` is the source
  of truth; the `no-version-hand-edits` pre-commit hook will reject
  attempts.
- **Breaking changes land at major bumps**, signaled with `!:` or
  `BREAKING CHANGE:` in the commit body.
- **Release commits go via PR like every other change.** No bypass
  configured for direct main pushes. If the release PR's CI fails,
  fix the underlying issue and re-push the release branch.
- See [CONTRIBUTING.md](../CONTRIBUTING.md#releases) for the end-to-end
  release walkthrough.

## How consumers consume

```bash
# AWS-only consumer
pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-aws \
  @pulumi/aws @pulumi/pulumi

# Azure-only consumer (Prosilio)
pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-schemas \
  @pulumi/azure-native @pulumi/pulumi

# Both
pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-aws \
  @adaptiveworx/iac-azure @pulumi/aws @pulumi/azure-native \
  @pulumi/pulumi
```

`@pulumi/*` SDKs are peer dependencies on the component packages — bring
your own version. `iac-core` does not pin a Pulumi version because it's
cloud-agnostic.

## Tooling stack

| Tool | Version | Why |
|---|---|---|
| **pnpm** | ≥10.0.0 | Workspace protocol, fast installs, deterministic hoisting |
| **Nx** | ^22.5.1 | Affected graph, caching, release orchestration |
| **TypeScript** | ^5.9.3 (compatible with 6.x) | `@tsconfig/strictest` baseline |
| **Vitest** | ^3.2.4 | Test runner; `*.unit.test.ts` and `*.integration.test.ts` patterns |
| **Biome** | 2.2.5 | Linter + formatter (replaces ESLint + Prettier) |
| **Node** | ≥24.0.0 | Engine constraint enforced via `engine-strict=true` |

All tooling configs live at the repo root; per-package configs only
override what's truly per-package (e.g. `tsconfig.lib.json` for build
output paths).

## Boundary rules

These are the rules that keep the package set coherent:

1. **`iac-core` is cross-cloud only.** If it imports `@pulumi/aws` or
   `@pulumi/azure-native` — even as `import type` — it doesn't belong
   in core. Type-only imports leak into the emitted `.d.ts` and
   require consumers to install the cloud SDK to typecheck, breaking
   any single-cloud consumer that doesn't use that cloud.
2. **`iac-schemas` has no internal deps.** It's the single source of
   truth for configuration contracts; depending on anything else would
   create a cycle.
3. **Component packages depend on `iac-core` but not on each other.**
   AWS doesn't import from Azure; Azure doesn't import from AWS.
4. **No `iac-shared` package.** Anything genuinely cross-cutting goes
   in `iac-core`. Anything that "just happens to be shared between
   components" goes inside the cloud package that owns those components.
5. **Every package is independently publishable.** No package should
   require another to ship in lock-step except the ones in its
   transitive dep tree.

## Dependency classification rules

The package boundary rules above answer "what code goes where." These
rules answer "for any package's `package.json`, where does each
dependency belong?" Apply them on every new `import` and every new
package addition.

| # | Rule | Examples |
|---|---|---|
| **A** | **Pulumi cloud SDKs** (`@pulumi/aws`, `@pulumi/azure-native`, `@pulumi/policy`, `@pulumi/pulumi`) → `peerDependencies` (widest API-compatible range) **+** `devDependencies` (latest minor for our own build/test). **Never** in `dependencies` — that forces the chosen version into every consumer and risks dual-install (broken `instanceof` checks, type incompatibilities). | `iac-aws` declares `@pulumi/aws: ^7.0.0` as peer + `^7.7.0` as dev. |
| **B** | **Cross-cloud `@adaptiveworx/iac-*` deps where types/instances flow through the public API** → `peerDependencies` with concrete range (e.g. `^0.1.0`) + `devDependencies` with `workspace:*`. Avoids dual-tree where consumer has its own iac-core and the component's iac-core would be a second copy. | `iac-aws → iac-core`: peer `^0.1.0` + dev `workspace:*`. |
| **C** | **`@adaptiveworx/iac-*` deps that are pure-data, no class instances or shared types in the API surface** → `dependencies` with `workspace:^` (resolves to `^0.1.x` on publish via `pnpm pack`, picks up patches). | `iac-core → iac-schemas`: dep `workspace:^` (iac-schemas exports data + types only, no classes). |
| **D** | **External libs that are part of the API surface** (consumer creates / passes instances) → `peerDependencies` + `devDependencies`. | `iac-core → zod`: peer `^3.22.0 \|\| ^4.0.0` + dev `^3` — consumers pass zod schemas through iac-core's public API. |
| **E** | **External libs that are pure implementation detail** (consumer never sees them) → `dependencies`. Consider `optionalDependencies` once the implementation is plug-in shaped. | `iac-core → @infisical/sdk`: dep `^4.0.6` — backs `SecretManager`, but consumers only see the `SecretManager` interface. |
| **F** | **Build / test / types tooling** → `devDependencies`. **Each package declares its own** — don't rely on workspace-root hoist. A hermetic build of any single package must not depend on root-level node_modules. | Every package with TypeScript source declares `@types/node` locally if it uses Node built-ins. |

### Workspace protocol

Use `workspace:^` (not `workspace:*`) for internal cross-package
dependencies. `pnpm pack` rewrites:

- `workspace:*` → `<exact-version>` (e.g. `0.1.3`) — consumers can't
  pick up patch updates without a coordinated rebump
- `workspace:^` → `^<version>` (e.g. `^0.1.3`) — consumers float
  within the same minor, the right default for the iac-* family
  where packages are released together but can patch independently

### Type-only imports across the boundary

`import type` does **not** opt the dependency out of the published
`.d.ts`. The emitted declarations preserve the type reference, so
consumers still need the dependency at typecheck time. If a package's
emitted `.d.ts` references a third-party type, that third-party
package must be a `peerDependencies` (Rule A or D) — `devDependencies`
alone is not sufficient. This is the trap that took
`resolveAwsRegion(): aws.Region` out of `iac-core` and into
`iac-aws`.

## Status

| Package | Status | Latest published |
|---|---|---|
| `iac-core` | Migration pending from iac-worx | — |
| `iac-schemas` | Migration pending from iac-worx | — |
| `iac-policies` | Migration pending from iac-worx | — |
| `iac-aws` | Restructured + tests passing | `iac-components@0.6.1` (pre-rename) |
| `iac-azure` | Empty skeleton | — |

See [migration-plan.md](./migration-plan.md) for migration sequencing.
