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

## Working agreement (EA + agents)

- **Branches:** branch from current `main`, and don't stack PRs. If a PR goes stale, merge `main` into it with a normal push. Never force-push a shared branch.
- **PR scope:** one PR per apply unit (one live stack or deployable change).
  - Never mix auto-apply with manual-dispatch stacks, or a library with its consumer.
  - Batch non-deploying changes (CI, scripts, docs, guardrails, tests) into one tooling PR per session.
  - Urgent unblocking fixes stay small.
- **PR body:** *Depends on* / *Followed by* / *Apply steps* / *Expected preview* (infra).
- **Before infra work:** survey live state read-only (`worx-architect-ro*` profiles, the Cloudflare read API) and state which assumptions it confirmed.
- **Decisions:** settle structural questions with the EA before work starts.
- **Roles:** agents draft, test, push branches and open PRs. They never merge, apply, dispatch or force-push; the EA does.
- **No loosening for progress:** never weaken a security control to get something working, not temporarily and not "just to test". Security controls include access policies, network and firewall rules, authentication, TLS, device posture, permissions, CI gates and git hooks. When progress seems to need it, stop and raise it with the EA. The answer is the principled fix or waiting, never the shortcut. Agents and the EA hold each other to this, so flag a loosening when you see one, including one the EA proposes. (`Pl.Architecture.Security.NoLooseningForProgress`)
- **Paths:** agents use absolute paths and `git -C`, never `cd` across repos, and confirm the repo before writing.
- **Worktrees:** agents work in `<repo>/.claude/worktrees/<branch>`, never beside the repo, and remove the worktree and local branch when the PR merges or closes.
- **Reports:** about 300 words at most; details go in the PR body.

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
- **Releases happen only in CI.** Scheduled Release (Monday cron or
  dispatch) → merge the release PR → Release Tags → Release. There is no
  local release path; `pnpm release:dry` previews. A release PR that main
  has moved past is stale: close it and re-dispatch Scheduled Release.
- **Don't create planning/decision/analysis docs unless asked.** Work
  from conversation context. Architectural decisions go in
  `docs/architecture.md`, transient plans in `docs/migration-plan.md`,
  permanent records in commit messages and CHANGELOG (which Nx Release
  generates).
