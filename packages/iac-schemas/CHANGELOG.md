# Changelog

All notable changes to `@adaptiveworx/iac-schemas` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/) once it
reaches `1.0.0`. Until then, breaking changes may land in any `0.x` minor.

## [Unreleased]

## [0.2.0] - 2026-04-25

First externally consumable release. Brings the package to npm-publishable
quality: a real library entry point, properly typed exports, and a
trimmed dependency surface.

### Added

- **`src/index.ts` library entry** that re-exports `regions` (the data)
  + `Regions` type. Built to `dist/index.js` + `dist/index.d.ts`.
- **`tsconfig.lib.json`** isolates the build from the workspace-wide root
  tsconfig.
- **README.md** with install instructions, usage examples, what-ships
  matrix, and stability notes.
- **CHANGELOG.md** (this file).

### Changed

- **`package.json`**:
  - `main`: `./config/regions.json` → `./dist/index.js`
  - Added `types: ./dist/index.d.ts`
  - `exports` map rewritten:
    - `.`: ESM entry with types/import conditions
    - `./regions`: still resolves to raw `regions.json` for tools that
      prefer the JSON, but now also carries types
    - `./generated/*`: unchanged
    - `./package.json`: exposed
  - Added `files: [dist, config/regions.json, generated, LICENSE, NOTICE,
    README.md, CHANGELOG.md]`
  - Added `repository`, `homepage`, `bugs`, `keywords`, `engines.node>=22`,
    `publishConfig {access: public, provenance: true}`
  - Version: `0.1.0` → `0.2.0`

### Removed

- **Runtime dependencies `zod` and `zod-to-json-schema`**. The package
  itself is data-only; Zod is owned by `@adaptiveworx/iac-core`. Consumers
  who want to revalidate the JSON at runtime install Zod themselves.
- **`./secrets` export and `config/infisical-secrets.json` from
  published files**. That file is AdaptiveWorX-internal Infisical setup
  documentation (not actually valid JSON in places — it uses `{...}` as
  "same as above" placeholder syntax). It stays on disk for monorepo
  scripts but is not part of the published npm package.
- **`schemas:generate` and `schemas:check` scripts from package.json**.
  These belong on the iac-core project (where the generator lives) and
  are wired via the iac-schemas Nx targets `generate` / `check`.

### Fixed

- **Path resolution**: script paths in `package.json` updated from
  `../../scripts/` (correct when this lived at `packages/iac-schemas/`)
  to `../../../scripts/` (correct at `libs/iac/schemas/`).

## [0.1.0] - 2025-10-11

Initial pre-release. Internal AdaptiveWorX use only; not published to
npm. Source available in the [iac-worx monorepo](https://github.com/AdaptiveWorX/iac-worx).
