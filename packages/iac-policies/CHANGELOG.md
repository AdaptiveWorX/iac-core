# Changelog

All notable changes to `@adaptiveworx/iac-policies` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/) once it
reaches `1.0.0`. Until then, breaking changes may land in any `0.x` minor.

## [Unreleased]

## [0.2.0] - 2026-04-25

First externally consumable release. The package now ships the policy
pack source as a clean tarball with full repository metadata and a clear
peer-dependency declaration.

### Added

- **README.md** with install + usage instructions, per-tenant
  configuration table, full enforced-rules matrix, and stability notes.
- **CHANGELOG.md** (this file).
- **`@pulumi/policy` and `@pulumi/pulumi` as peerDependencies** — the
  policy pack uses both at runtime; consumers manage their own versions.

### Changed

- **`package.json`**:
  - Added `types: ./src/index.ts`
  - `exports` map: `.`, `./src/`, `./package.json`
  - Added `files: [src, LICENSE, NOTICE, README.md, CHANGELOG.md]` —
    only the policy pack source ships
  - Added `repository`, `homepage`, `bugs`, `keywords`, `engines.node>=22`,
    `publishConfig {access: public, provenance: true}`
  - Version: `0.1.0` → `0.2.0`

### Removed

- **`@adaptiveworx/iac-core` runtime dependency**. The policy pack
  source has zero `@adaptiveworx/iac-core` imports; it was a leftover
  from earlier prototyping.
- **`build` Nx target invoking `pulumi policy build`**. That subcommand
  was a no-op; Pulumi's policy CLI doesn't have a `build` action. Policy
  packs ship as TypeScript source and Pulumi compiles them at runtime.
  The `typecheck` Nx target remains and validates the source.

### Fixed

- **Path resolution**: script paths in `package.json` updated from
  `../../scripts/` (correct when this lived at `packages/iac-policies/`)
  to `../../../scripts/` (correct at `libs/iac/policies/`).

## [0.1.0] - 2025-10-11

Initial pre-release. Internal AdaptiveWorX use only; not published to
npm. Source available in the [iac-worx monorepo](https://github.com/AdaptiveWorX/iac-worx).
