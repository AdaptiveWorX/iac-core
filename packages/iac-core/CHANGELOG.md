## 0.3.0 (2026-05-06)

### 🚀 Features

- ⚠️  **iac-core:** require PULUMI_ORG in detectStackContext ([#26](https://github.com/AdaptiveWorX/iac-core/issues/26))

### ⚠️  Breaking Changes

- **iac-core:** require PULUMI_ORG in detectStackContext  ([#26](https://github.com/AdaptiveWorX/iac-core/issues/26))
  `detectStackContext()` no longer defaults to
  "adaptiveworx" when PULUMI_ORG is unset — it throws. Consumers must
  export PULUMI_ORG (CI: workflow/job env; locally: shell or .env).

### ❤️ Thank You

- Lloyd Mangnall @lloydmangnall

## 0.2.1 (2026-05-01)

### 🩹 Fixes

- **iac-core:** add default condition to exports for CJS resolution ([1e19af6](https://github.com/AdaptiveWorX/iac-core/commit/1e19af6))
- **iac-core:** make detectStackContext org env-overridable + tighten pr-title workflow ([#24](https://github.com/AdaptiveWorX/iac-core/pull/24), [#23](https://github.com/AdaptiveWorX/iac-core/issues/23))

### 🧱 Updated Dependencies

- Updated @adaptiveworx/iac-schemas to 0.1.3

### ❤️ Thank You

- Claude Opus 4.7 (1M context)
- Lloyd Mangnall @lloydmangnall

## 0.2.0 (2026-05-01)

This was a version bump only for @adaptiveworx/iac-core to align it with other projects, there were no code changes.

## 0.1.2 (2026-04-29)

### 🧱 Updated Dependencies

- Updated @adaptiveworx/iac-schemas to 0.1.2

## 0.1.1 (2026-04-29)

### 🧱 Updated Dependencies

- Updated @adaptiveworx/iac-schemas to 0.1.1

# Changelog

All notable changes to `@adaptiveworx/iac-core` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/) once it
reaches `1.0.0`. Until then, breaking changes may land in any `0.x` minor.

## 0.1.0 (unreleased)

Initial publish from the `iac-core` monorepo. First public version on
npm.

### Surface

- **Cross-cloud primitives.** Cloud-agnostic only — AWS-Org-shaped
  pieces live in `@adaptiveworx/iac-aws`, Azure pieces in
  `@adaptiveworx/iac-azure`.
- **`OrganizationConfig`** + adapter helpers (`loadOrganizationOptionsFromEnv`,
  `loadAdaptiveOrganizationDefaults`). Pure consumer of `OrganizationOptions`;
  reads from `process.env` are isolated to the adapters.
- **`SecretManager`** (Infisical Universal Auth + env-var fallback).
- **Region utilities** sourced from `@adaptiveworx/iac-schemas`.
- **CIDR allocation** — deterministic address-space carving.
- **Stack utilities** — context detection, naming, README generation.
- **Validation** — agent guardrails, configuration patterns, Zod helpers.
- **Schemas re-export** — `SCHEMA_BASE_URL`, `SCHEMA_NAMESPACE`,
  `SCHEMA_VERSION`, plus the canonical core Zod schemas.

### Subpath imports

Tree-shaking-sensitive consumers can import directly from
`@adaptiveworx/iac-core/utils/*`, `/config/*`, `/schemas/*`, `/types/*`,
`/validation/*`.

### Peer dependencies

- `@pulumi/pulumi` (>= 3.0)
- `zod` (^3.22 || ^4)

### Notes

The package was developed inside the private `iac-worx` workspace prior
to this publish. Iterative pre-release internal versions (0.1.x, 0.2.x
inside iac-worx's monorepo) shipped no artifacts to npm; they are not
available as installable versions.
