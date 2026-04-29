# Changelog

All notable changes to `@adaptiveworx/iac-core` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/) once it
reaches `1.0.0`. Until then, breaking changes may land in any `0.x` minor.

## 0.1.0 (unreleased)

Initial publish from the `flux-core` monorepo. First public version on
npm.

### Surface

- **Cross-cloud primitives.** Cloud-agnostic only — AWS-Org-shaped
  pieces live in `@adaptiveworx/iac-components-aws`, Azure pieces in
  `@adaptiveworx/iac-components-azure`.
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
