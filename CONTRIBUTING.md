# Contributing to AdaptiveWorX `iac-core`

Thanks for your interest in `iac-core`. This document covers
everything you need to land a change: workflow, commit conventions,
testing requirements, and the release process.

## Getting started

### Prerequisites

- **Node.js ≥ 24.0.0** (engine-strict; lower versions will fail
  `pnpm install`)
- **pnpm ≥ 10.0.0** — install via [`corepack`](https://nodejs.org/api/corepack.html)
  (`corepack enable`) so the repo's pinned `packageManager` field is honored
- A POSIX shell (macOS, Linux, WSL2)

### One-time setup

```bash
git clone https://github.com/AdaptiveWorX/iac-core.git
cd iac-core
pnpm install
pnpm build         # Verify everything builds
pnpm test          # Verify the test suite passes
```

That should be a clean run. If anything fails on `main`, please open an
issue.

## Repo orientation

Read these in order on first contribution:

1. [README.md](./README.md) — high-level overview + commands
2. [docs/architecture.md](./docs/architecture.md) — producer/consumer
   model, package boundaries, dependency graph, release model
3. [docs/migration-plan.md](./docs/migration-plan.md) — current
   migration state (transient; only relevant while `iac-worx` libs are
   still being moved into `packages/`)

Then, if your change touches a specific package, read that package's own
README and CHANGELOG.

## Workflow

### Branching

- `main` is always shippable.
- Topic branches: `feat/<short-description>`, `fix/<short-description>`,
  `chore/<short-description>`, `docs/<short-description>`.
- Open a draft PR early if you'd like feedback on direction.

### Making changes

1. Create a topic branch off `main`.
2. Make your changes. Keep commits focused; one logical change per commit.
   Each commit subject lands on `main` as-is (rebase merge — see
   [Merging](#merging) below), so each subject must be a properly-scoped
   conventional commit.
3. Run the local quality gates (see below).
4. Push and open a PR. The PR title is a reviewer summary; the
   release-relevant signal comes from per-commit subjects.

### Local quality gates

Hooks run most of this automatically (installed by `pnpm install` via
the `prepare` script):

| Hook | Tool | Scope |
|---|---|---|
| pre-commit | Biome on staged files; `version` field guard on `packages/*/package.json` | staged-file hygiene |
| commit-msg | commitlint (Conventional Commits + scope allowlist) | message format |
| pre-push | `nx affected -t lint typecheck test build --base=origin/main --head=HEAD` | code-level checks |

Bypass (rare, discouraged): `LEFTHOOK=0 git commit ...`. CI is the
authoritative trust boundary; hooks are local feedback.

To run the gates manually:

```bash
pnpm lint:affected       # Biome
pnpm typecheck           # tsc --noEmit
pnpm test:affected       # vitest
pnpm build:affected      # tsc -p tsconfig.lib.json
```

Or the full suite when you want it:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Nx caches results, so the second run is near-instant.

### Merging

This repo uses **rebase merge** as the default and only-recommended path
to `main`. **Squash merge is disabled.**

The reason is mechanical: Nx Release attributes per-package version
bumps by walking conventional-commit subjects since each package's last
release tag. Squash collapses an entire PR's commits into one subject
(the PR title), erasing scope and bump signals. A PR with a
`feat(iac-aws):` and a `feat(iac-core)!:` commit, squashed under a
`chore: cleanup` title, releases nothing — the bump information is
gone. We've seen this fail in practice (PR #20).

What this means in practice:

- Each commit on your branch will land on `main` exactly as you wrote
  it — same SHA-stable subject, same scope, same body.
- Every commit subject must be a properly-scoped conventional commit
  (e.g. `feat(iac-aws): add SharedVpc endpoint support`). The
  commit-msg hook enforces this locally.
- If a PR has multiple commits across multiple packages, **don't fold
  them**. The split is what gives Nx Release the per-package signal.
- The PR title is a reviewer-facing summary, not a commit subject.

**Merge commit** (with the `Merge pull request #N from …` boilerplate)
is allowed as a fallback for unusual cases. Squash is unavailable in
the GitHub UI by repo policy.

> When the repo opens to external contributor PRs, we may re-enable
> squash, gated by a semantic-pull-request action that validates the
> squash subject before merge is allowed. For now — while contributor
> hygiene is fully under maintainer control — rebase keeps the release
> path clean.

### Branch + tag protection

`main` and the `@adaptiveworx/iac-*@*` tag namespace are protected by
GitHub repository rulesets. Configured out-of-band (not in the repo
source tree); the shape is documented here so PR reviewers and agents
can reason about what they will and won't be allowed to do.

**`main` ruleset:**

- Pull request required (no direct pushes for non-bypass actors)
- All status checks must pass (`validate` from [`ci.yml`](./.github/workflows/ci.yml))
- Linear history required (pairs with the rebase-merge default — no
  merge commits land on `main` unless explicitly authored)
- Force-pushes blocked
- Branch deletion blocked
- Bypass: repository administrators (currently the sole maintainer).
  Used for `chore(release): publish` commits that Nx Release writes
  directly to `main` during the release flow.

**`@adaptiveworx/iac-*@*` tag ruleset:**

- Tag creation blocked for non-bypass actors (only maintainers/release
  automation can create release tags — the workflow trigger surface)
- Tag deletion blocked
- Tag force-update blocked
- Bypass: repository administrators

The tag rules matter because [`release.yml`](./.github/workflows/release.yml)
fires on tag push to `@adaptiveworx/iac-*@*` and grants the
`production` environment + `id-token: write`. A contributor able to
create a matching tag could trigger that workflow; npm Trusted
Publishing rejects the publish at the npm side, but defense-in-depth
keeps the GitHub Actions event from happening at all.

[CODEOWNERS](./.github/CODEOWNERS) tracks ownership for the path map;
`require_code_owner_review` is **not** currently enabled on the main
ruleset (there's only one owner). It becomes load-bearing once the
team-based ownership in CODEOWNERS materializes.

## Conventional commits

Every commit on `main` (and ideally every commit in your branch) follows
[Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/).
Nx Release reads commit history to drive version bumps and CHANGELOG
generation, so commit hygiene directly affects releases.

### Format

```
<type>(<scope>): <short summary>

<optional body>

<optional footers>
```

### Types we use

The bump column reflects what's configured in
[nx.json](./nx.json) under `release.version.conventionalCommitsConfig`.
Only `feat`, `fix`, and `perf` move versions; everything else is
maintenance and never bumps a published artifact.

| Type | Bump | Use for |
|---|---|---|
| `feat` | minor | New feature, new export, new public API |
| `fix` | patch | Bug fix that doesn't change public API |
| `perf` | patch | Performance improvement |
| `refactor` | **none** | Internal restructure, no behavior change |
| `docs` | none | Documentation only |
| `test` | none | Test-only changes |
| `build` | none | Build system, dependencies, tsconfig |
| `ci` | none | CI configuration |
| `chore` | none | Maintenance, repo plumbing, no public effect |
| `style` | none | Formatting only |

Add `!` before the colon (or `BREAKING CHANGE:` in the footer) for a
**major** bump:

```
feat(iac-aws)!: rename SharedVpc.tiers to SharedVpc.subnetTiers
```

### Scopes — the rule that keeps releases sane

Nx Release attributes commits to packages **first by scope match**, then
falls back to file-touch attribution. File-touch attribution is noisy in
a publish-focused monorepo, because cross-cutting changes (adding a
workflow, bumping a tsconfig, editing a README in the docs/ tree) touch
files inside multiple packages and would otherwise bump every package's
version.

To keep version bumps meaningful, follow these rules without exception:

| Rule | Why |
|---|---|
| **`feat:` and `fix:` always carry a single package scope** (e.g. `feat(iac-core):`). | These commits *will* bump a package — the scope tells Nx Release exactly which one. |
| **Cross-cutting work (tooling, monorepo plumbing, repo docs) uses scope `repo` AND a non-bumping type** (`chore(repo):`, `ci(repo):`, `build(repo):`, `docs(repo):`, `refactor(repo):`). | These shouldn't bump anything; the type config makes them no-ops, and `repo` signals "not a package change." |
| **A single commit changes a single package surface.** If you have to touch two packages for one logical change, split it into two commits — one per scope. | Otherwise the second package gets attributed via file-touch and bumps for the wrong reason. |
| **Never use `feat(repo):` or `fix(repo):`.** | These are version-bumping types attached to a non-package scope — they trigger file-touch fallback across every package. If you find yourself wanting to write this, the change either belongs to a specific package (use that scope) or isn't really a feat/fix (use `chore`/`refactor`/`build`). |

### Allowed scopes

- `iac-core`
- `iac-schemas`
- `iac-policies`
- `iac-aws`
- `iac-azure`
- `repo` — **only** with `chore` / `ci` / `build` / `docs` / `refactor` / `test` / `style`

### Good examples

```
feat(iac-aws): add VPC peering support to SharedVpc
fix(iac-core): handle missing AWS_REGION env var in stack-utils
perf(iac-core): cache CIDR allocations across calls
feat(iac-azure)!: rename FabricCapacity.skuTier to skuName

docs(repo): clarify Nx Release flow in CONTRIBUTING.md
chore(repo): upgrade pnpm to 10.30
ci(repo): cache pnpm store in release workflow
refactor(repo): collapse tsconfig.lib.json files into one shared base
build(repo): bump @types/node to 24.x
```

### Bad examples

```
feat(repo): convert to Nx monorepo               # never use feat(repo) — bumps every package
fix(repo): formatting nits                       # not a fix; use chore
feat: add VPC peering                            # missing scope — file-touch fallback
feat(iac-core, iac-aws): touch both              # comma-scopes don't work — split commits
chore(iac-core)!: drop deprecated method         # ! on chore is a contradiction; use feat!: or refactor!:
```

## Code style

- **Formatting + lint:** [Biome](https://biomejs.dev/). Run `pnpm format`
  to auto-fix or `pnpm lint` to check. Config lives in
  [biome.json](./biome.json) and is intentionally strict — please don't
  weaken rules without discussion.
- **TypeScript:** strictest mode via `@tsconfig/strictest`, plus
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. New code
  is expected to compile cleanly under these.
- **Module style:** ESM only. All imports use explicit `.js` extensions
  (NodeNext resolution).
- **Testing:** Vitest. Filename conventions:
  - `*.unit.test.ts` — fast, deterministic, no external IO
  - `*.integration.test.ts` — talks to real services or sandboxes
  - Tests live next to source (`src/foo.ts` → `src/foo.unit.test.ts`)

### What to avoid

- Don't introduce new top-level dependencies without discussion — every
  added dep has a per-package and per-consumer cost.
- Don't widen `iac-core`'s scope to anything cloud-specific. AWS/Azure/GCP
  primitives go in their respective component packages. (See
  [architecture.md § boundary rules](./docs/architecture.md#boundary-rules).)
- Don't import across cloud component boundaries. AWS doesn't import
  from Azure or vice versa. Nx will reject it via tag-based module
  boundaries.
- Don't edit a `version` field in any `package.json` by hand. Nx Release
  owns version state.

## Adding a new package

1. Create `packages/<unscoped-name>/` matching the structure of an
   existing package. Required files: `package.json`, `project.json`,
   `tsconfig.json`, `tsconfig.lib.json`, `src/index.ts`, `README.md`,
   `CHANGELOG.md`, `LICENSE`, `NOTICE`.
2. Set `version` to `0.1.0` (or `0.0.1` for true alpha).
3. In `package.json`:
   - `"name": "@adaptiveworx/<unscoped-name>"`
   - `"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }`
   - Peer dependencies for any cloud SDKs the package wraps
4. In `project.json`: tag with `scope:<area>` (`scope:aws`,
   `scope:azure`, `scope:core`, `scope:policies`, `scope:schemas`)
   to inherit the right module-boundary rules.
5. Add an entry to the README.md package table and to
   [docs/architecture.md](./docs/architecture.md).
6. First commit: `feat(<unscoped-name>): scaffold initial package`.

## Releases

This repo uses [Nx Release](https://nx.dev/features/manage-releases)
with **independent versioning per package**. The configuration lives in
the `release` block of [nx.json](./nx.json).

### How it works

1. Maintainers run `pnpm nx release` on `main` (locally or in CI).
2. Nx Release walks the conventional-commit history since each
   package's last tag.
3. For each package whose graph saw changes, Nx:
   - bumps `package.json` `version` according to commit types,
   - regenerates `packages/<name>/CHANGELOG.md`,
   - creates a git tag `<unscoped-name>@<version>`,
   - commits the version + changelog changes.
4. `nx release publish` runs `pnpm publish` per package against
   `https://registry.npmjs.org/` with [npm
   provenance](https://docs.npmjs.com/generating-provenance-statements)
   enabled.
5. A single GitHub release is created linking the per-package changelog
   entries.

### Try it locally

```bash
pnpm nx release --dry-run
```

This previews exactly what would happen without touching git, npm, or
GitHub. Always dry-run first when you're not sure.

### Manual override (rare)

If you need to force a specific version (e.g. correcting a botched
release), pass `--version` to `nx release`:

```bash
pnpm nx release version --projects=@adaptiveworx/iac-core --specifier=0.3.0
```

Don't do this without a maintainer's blessing.

### Pre-release & alpha tags

For breaking changes that need bake time, tag with `--pre-id`:

```bash
pnpm nx release --pre-id=alpha
# Publishes 1.0.0-alpha.0 etc.
```

These publish under the `alpha` dist-tag on npm, leaving `latest`
pointing at the stable release.

## Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] Conventional commit subject(s) (run `git log` to verify)
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (and new code has tests)
- [ ] `pnpm build` passes
- [ ] CHANGELOG entries are **not** edited by hand (Nx Release owns them)
- [ ] If adding/removing a public export, the package README reflects it
- [ ] If changing cross-cutting docs, links still resolve

## Reporting issues

- **Bugs:** open a [GitHub issue](https://github.com/AdaptiveWorX/iac-core/issues)
  with reproduction steps and the package + version affected.
- **Security:** don't open a public issue. See
  [docs/security-implementation.md](./docs/security-implementation.md)
  for the disclosure process.

## License

By contributing, you agree that your contributions are licensed under
the [Apache 2.0 License](./LICENSE) — the same license that covers the
rest of the repo.
