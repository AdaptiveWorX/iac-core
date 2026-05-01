# CLAUDE.md — Claude-specific overlay for `iac-core`

Vendor-agnostic agent rules live in [`AGENTS.md`](./AGENTS.md). **Read
that first.** This file adds the bits that are specific to working in
Claude Code on this repo.

## Doc map (also in AGENTS.md)

| Task | Read |
|---|---|
| Cross-repo coordination (iac-worx, gc-analytics, hot-loop rules) | [`../CLAUDE.md`](../CLAUDE.md) |
| Vendor-agnostic operating rules (start here) | [`AGENTS.md`](./AGENTS.md) |
| Architecture, package boundaries, release model | [`docs/architecture.md`](./docs/architecture.md) |
| Migration sequencing (transient) | [`docs/migration-plan.md`](./docs/migration-plan.md) |
| Conventional commits + Nx Release flow | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |

## Claude-specific conventions

- **Use worktrees for any non-trivial change.** This repo's parent
  ([`../CLAUDE.md`](../CLAUDE.md)) mandates the worktree model for
  agent parallelism — destructive git commands (`checkout`, `stash`,
  `reset`) are restricted for agents because they corrupt parallel
  agent work. Use `EnterWorktree` / `ExitWorktree`.
- **One session = one PR, one repo.** If a task spans iac-core and
  iac-worx (or gc-analytics), that's two PRs in two sessions, sequenced
  per [`../CLAUDE.md`](../CLAUDE.md).
- **Trust the hook layer for fast feedback.** Pre-commit handles
  formatting + version-edit guard; commit-msg validates conventional
  commits; pre-push runs `nx affected`. Don't re-run the same checks
  manually before commit; hooks will surface what they need to.
- **Don't create planning/decision/analysis docs unless asked.** Work
  from conversation context. Architectural decisions go in
  `docs/architecture.md`, transient plans in `docs/migration-plan.md`,
  permanent records in commit messages and CHANGELOG (which Nx Release
  generates).
