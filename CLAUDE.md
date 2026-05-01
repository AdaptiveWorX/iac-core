# CLAUDE.md — `iac-core` agent context

Public, Apache 2.0 Nx monorepo that produces the `@adaptiveworx/iac-*` family of npm packages. **Producer** in the iac-* platform; consumers (`iac-worx`, `gc-analytics`, future clients) sit downstream.

## Read first

| Task | Read |
|---|---|
| Anything cross-repo | [`../CLAUDE.md`](../CLAUDE.md) — hot-loop rules, PR sequencing across repos |
| Producer/consumer model, package boundaries, dep graph, release model, tooling | [`docs/architecture.md`](./docs/architecture.md) |
| In-progress `iac-worx` → `iac-core` lib migration sequencing | [`docs/migration-plan.md`](./docs/migration-plan.md) |
| Conventional commits, Nx Release flow, contribution rules | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| Common commands, tooling versions | [`README.md`](./README.md) |

This file owns only the in-repo agent guardrails.

## The rule that overrides everything

`iac-core` (the package) is **cloud-agnostic only.** Full statement of the boundary lives in [`docs/architecture.md#boundary-rules`](./docs/architecture.md#boundary-rules) — read it before adding code to `packages/iac-core/`. Default test: *would an Azure-only consumer use this without contortions?* If no, it belongs in a cloud-specific package.

There is **no `iac-shared` package.** Don't propose one.

## Releases — never hand-edit versions

Versioning is driven by conventional commits via Nx Release. Never edit a package's `version` field by hand. `feat:` → minor, `fix:` → patch, `feat!:` / `BREAKING CHANGE:` → major. Full flow: [`CONTRIBUTING.md#releases`](./CONTRIBUTING.md#releases).

## Agent conventions

- **One PR = one logical change.** Cross-package changes are fine when the logical change requires them (e.g. moving a symbol between packages); split unrelated work into separate PRs.
- **Conventional commits everywhere** — they drive version bumps and changelogs.
- **Verify before claiming done**: `pnpm lint && pnpm typecheck && pnpm test` (or the `:affected` variants for large changes). Per-package: `pnpm nx <target> @adaptiveworx/<package>`.
- **Don't add a new top-level dir or `packages/*` entry** without updating [`docs/architecture.md`](./docs/architecture.md) and the README package table.
- **Don't sweep unrelated cleanup** into the current PR. Flag it in the PR description.

## Public-repo discipline

This repo is published. Apache 2.0, public npm.

- No client-confidential identifiers (account IDs not already public, internal IPs, secrets, internal infra hostnames).
- Prosilio is a named consumer in `migration-plan.md` and `architecture.md` — that's existing precedent and fine. New client names need a separate decision.
- Existing hardcoded values (e.g. AdaptiveWorX-shaped defaults) are tracked as debt issues — see migration-plan.md. Don't add new ones.

## Don't do these

- **Don't modify `iac-worx/libs/iac/*` source from this repo's session.** If migration source needs a fix, do it in `iac-worx` first, then carry the fix into the migrated package here. (Cross-repo PR sequencing in [`../CLAUDE.md`](../CLAUDE.md).)
- **Don't re-implement code that's mid-migration.** If you're about to write something that exists in `iac-worx/libs/iac/<name>/`, you're probably duplicating migration work — pull from there instead.
- **Don't design `iac-azure` components in the abstract.** They get extracted from `gc-analytics` once stable, not designed top-down — see [`../CLAUDE.md`](../CLAUDE.md).
