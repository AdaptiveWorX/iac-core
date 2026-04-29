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
│   ├── platform-coordination.md     # Prosilio ↔ OSS coordination
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

Versioning is **independent per package** via `nx release`:

```bash
# Cut versions across packages whose dep graph changed
pnpm nx release

# Dry run to preview what would happen
pnpm nx release --dry-run

# Just publish (after a version was cut by `nx release` already)
pnpm nx release publish
```

Nx Release reads conventional commits and:

1. Bumps each affected package's `version` field according to commit type
   (`fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` →
   major).
2. Generates per-package `CHANGELOG.md` entries.
3. Creates per-package git tags (`{projectName}@{version}`).
4. Creates a single GitHub release linking the changelog entries.
5. Publishes to npm (with provenance, scoped to public access — see each
   package's `publishConfig`).

The `preVersionCommand` in `nx.json` runs `nx run-many -t build` first,
so we never publish a package whose build is broken.

### What this means for contributors

- **Use conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, etc.)
  — they directly drive version bumps and changelog entries.
- **Never edit a `version` field by hand.** `nx release` is the source of
  truth.
- **Breaking changes land at major bumps**, signaled with `!:` or
  `BREAKING CHANGE:` in the commit body.
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
   `@pulumi/azure-native`, it doesn't belong in core.
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

## Status

| Package | Status | Latest published |
|---|---|---|
| `iac-core` | Migration pending from iac-worx | — |
| `iac-schemas` | Migration pending from iac-worx | — |
| `iac-policies` | Migration pending from iac-worx | — |
| `iac-aws` | Restructured + tests passing | `iac-components@0.6.1` (pre-rename) |
| `iac-azure` | Empty skeleton | — |

See [platform-coordination.md](./platform-coordination.md#whats-blocking-prosilio)
for migration sequencing.
