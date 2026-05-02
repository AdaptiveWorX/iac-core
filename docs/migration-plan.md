# Migration plan — `iac-worx` libs → `iac-core` packages

> **Lifecycle**: this is a transient plan. Phases 1–3 are complete.
> Delete this file once Phase 4 (hot-loop exit) lands. Permanent
> architecture lives in [architecture.md](./architecture.md).

## Context

`iac-core` (this repo) is the producer monorepo. The reusable
`@adaptiveworx/iac-*` packages were migrated out of `iac-worx/libs/iac/*`
into `packages/*` here and published to npm. `iac-worx` now consumes
them as a normal npm consumer.

Permanent architecture (producer/consumer model, package layout,
boundary rules, release model) is in
[architecture.md](./architecture.md). This doc only covers the migration
sequencing.

## Phases

### Phase 1 — `iac-core` + `iac-schemas` initial publishes ✅

Unblocked external Azure consumer work.

- [x] Migrated `iac-core` source from `iac-worx/libs/iac/core/` into
      `packages/iac-core/`. Internal imports, script paths, peer/dev deps
      adjusted; build/test/typecheck pass under Nx.
- [x] Same for `iac-schemas` (no internal deps; simpler).
- [x] `@adaptiveworx/iac-core@0.2.x` and `@adaptiveworx/iac-schemas@0.1.x`
      published to public npm via Trusted Publishing (OIDC).
- [x] `iac-worx` consumes the published versions instead of the workspace
      path; deploy verified.

### Phase 2 — `iac-policies` migration ✅

- [x] Migrated `iac-policies` source from `iac-worx/libs/iac/policies/`
      into `packages/iac-policies/`.
- [x] Refactored from Pattern-B complete pack to Pattern-A library of
      factory primitives in 0.2.0. Consumers compose their own
      `PolicyPack` from `requireTagsPolicy`, `regionalCompliancePolicy`,
      `awsSecurityBaselinePolicy`, `deploymentProtectionPolicy`. No
      runtime `iac-core` dep.
- [x] `@adaptiveworx/iac-policies@0.2.x` published.
- [x] `iac-worx` consumer updated.

### Phase 3 — `iac-aws` + `iac-azure` ✅

- [x] `@adaptiveworx/iac-aws@0.2.x` published from `packages/iac-aws/`
      with the AWS-Organization sibling type (`AwsOrganizationConfig`)
      now hosting the AWS-org-shaped config that previously lived inside
      `iac-core`.
- [x] `@adaptiveworx/iac-components@0.6.2` deprecated with a rename
      pointer to `iac-aws` in the README.
- [x] `@adaptiveworx/iac-azure@0.1.x` skeleton published. First
      component will be extracted once a pattern stabilizes inline in
      real Azure deployments — see [parent CLAUDE.md](../../CLAUDE.md).

### Phase 4 — Hot-loop exit (in progress)

- [x] `iac-worx` is on registry (npm-pinned `@adaptiveworx/iac-*` deps,
      no workspace-path or `file:` paths).
- [ ] First Azure consumer flips to registry once `iac-azure` has stable
      components and moves back to its home outside this directory tree.
      See [`../../CLAUDE.md`](../../CLAUDE.md) for the full hot-loop exit
      criteria.

## Debt and open questions

Tracked as GitHub issues in `AdaptiveWorX/iac-core` rather than inline
here, so they survive the deletion of this file:

- **`iac-core` debt — open** — `SecretManager` pluggable backend (issue
  #8), hardcoded email domain fallbacks in `aws-accounts.ts` (issue #9),
  hardcoded schema URL in `constants.ts` (issue #10).
- **`iac-core` debt — resolved** — `OrganizationConfig` parameterization
  (issue #7): cloud-agnostic identity stays in `iac-core`,
  AWS-organization specifics moved to `AwsOrganizationConfig` in
  `iac-aws`, `PULUMI_ORG` override landed in 0.2.x. README refresh
  (issue #11): docs updated to match the cloud-agnostic shape.
- **`iac-aws` debt — open** — hardcoded log archive account ID in
  `cross-account-roles.ts` (issue #12), per-component README expansion
  (issue #13).
- **`iac-policies` debt — resolved** — refactored from Pattern-B to
  Pattern-A library of factory primitives in 0.2.0; no `iac-core`
  runtime dep (issue #14). See `packages/iac-policies/README.md` for
  usage examples.
- **CI debt — resolved** — `always-auth` deprecation (issue #6) avoided
  by intentionally not setting `registry-url:` in `setup-node`; each
  package declares `publishConfig.registry` directly to keep OIDC
  working.
- **Open questions** — `SecretManager` pluggable backend interface
  design (issue #8), semver commitment 1.0 vs 0.x (issue #15), `iac-aws`
  version strategy at rename (issue #16), Azure component conventions
  (issue #17).

See the [issue tracker](https://github.com/AdaptiveWorX/iac-core/issues)
for the live list.
