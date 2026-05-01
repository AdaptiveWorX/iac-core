# Migration plan — `iac-worx` libs → `iac-core` packages

> **Lifecycle**: this is a transient plan. Delete this file once Phase 3
> is complete and `iac-worx` consumes everything from npm. Permanent
> architecture lives in [architecture.md](./architecture.md).

## Context

`iac-core` (this repo) is a new producer monorepo. The reusable
`@adaptiveworx/iac-*` packages are being migrated out of
`iac-worx/libs/iac/*` into `packages/*` here, then published to npm. After
the migration, `iac-worx` consumes them as a normal npm consumer.

Permanent architecture (producer/consumer model, package layout,
boundary rules, release model) is in
[architecture.md](./architecture.md). This doc only covers the migration
sequencing.

## Phases

### Phase 1 — `iac-core` + `iac-schemas` initial publishes

Blocking the first external consumer (Prosilio / `gc-analytics`) from
starting Azure work.

- [ ] Migrate `iac-core` source from `iac-worx/libs/iac/core/` into
      `packages/iac-core/`. Adjust internal imports, scripts paths,
      peer/dev deps. Verify build/test/typecheck pass under Nx.
- [ ] Same for `iac-schemas` (no internal deps; simpler).
- [ ] Run `nx release` to publish `@adaptiveworx/iac-core@0.x` and
      `@adaptiveworx/iac-schemas@0.x` to public npm.
- [ ] Update `iac-worx` to consume the published versions instead of the
      workspace path. Verify `iac-worx` still builds + deploys.

### Phase 2 — `iac-policies` migration

Not blocking external consumers (policies are no-op on Azure resources
today). Land after Phase 1 has settled to keep PRs reviewable.

- [ ] Migrate `iac-policies` source from `iac-worx/libs/iac/policies/`
      into `packages/iac-policies/`.
- [ ] Move `iac-core` dep to `devDep` (unused at runtime — see debt
      issues below).
- [ ] Run `nx release` to publish `@adaptiveworx/iac-policies@0.x`.
- [ ] Update `iac-worx` consumer.

### Phase 3 — Rename publish of components

- [ ] Publish `@adaptiveworx/iac-aws@0.7.0` from `packages/iac-aws/`
      (already restructured).
- [ ] Publish `@adaptiveworx/iac-components@0.6.2` deprecated, with a
      rename pointer to `iac-aws` in the README.
- [ ] Stub `@adaptiveworx/iac-azure@0.1.0` already in place; no first
      publish until first component lands (extracted from `gc-analytics`
      — see [parent CLAUDE.md](../../CLAUDE.md)).

### Phase 4 — Hot-loop exit

After Phase 1 completes, `iac-worx` is on registry. After `iac-azure`
has stable components, `gc-analytics` flips to registry and moves back
to `../prosilio/`. See [`../../CLAUDE.md`](../../CLAUDE.md) for the full
hot-loop exit criteria.

## Debt and open questions

Tracked as GitHub issues in `AdaptiveWorX/iac-core` rather than inline
here, so they survive the deletion of this file:

- **`iac-core` debt** — `OrganizationConfig` parameterization
  (`PULUMI_ORG` env-var override for `detectStackContext` landed in
  0.2.x; remaining: surface `pulumiOrg` as a first-class option on
  `OrganizationConfig` so consumers don't have to set env vars),
  `SecretManager` pluggability, hardcoded email domain fallbacks in
  `aws-accounts.ts`, hardcoded schema URL in `constants.ts`, README
  refresh post-move.
- **`iac-aws` debt** — hardcoded log archive account ID in
  `cross-account-roles.ts`, per-component README expansion.
- **`iac-policies` debt** — move `iac-core` dep to `devDep`.
- **Open questions** — `SecretManager` pluggable backend interface
  design, `OrganizationConfig` parameterization strategy, semver
  commitment (1.0 or stay 0.x), `iac-aws` version strategy at rename,
  Azure component conventions (mirror AWS shapes or different).

See the [issue tracker](https://github.com/AdaptiveWorX/iac-core/issues)
for the live list.
