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

All three GitHub merge strategies are enabled. The right strategy
depends on the shape of the PR — pick whichever gives `main` a
properly-scoped Conventional Commit subject for every released change.

The hard requirement is that **every commit landing on `main` is a
valid Conventional Commit with a scope from the package allowlist**.
Two gates enforce this:

1. **commitlint** (commit-msg hook) — validates every commit subject
   locally before it's even part of a PR.
2. **`amannn/action-semantic-pull-request`**
   ([`pr-title.yml`](./.github/workflows/pr-title.yml)) — validates the
   PR title before merge is allowed, mirroring the same `types` and
   `scopes` from [`commitlint.config.cjs`](./commitlint.config.cjs).

With both gates wired, the maintainer can pick whichever merge
strategy fits the PR:

| PR shape | Recommended merge | Why |
|---|---|---|
| Single commit, clean conventional subject | **Rebase** or **squash** (rebase = less ceremony) | Either works. PR title and the commit subject usually match anyway. |
| Multiple commits, each scoped/conventional, multi-package | **Rebase** | Preserves per-commit attribution. Nx Release sees each scoped commit and bumps each package correctly. **Don't squash** — collapsing erases the per-package signal (PR #20 hit this). |
| Messy / WIP / non-conventional commits, single logical change | **Squash** | The validated PR title becomes the single Conventional Commit on `main`. PR-title validation guarantees the squash subject is well-formed. |
| External contributor PR with messy history | **Squash** | Same as above. The squash subject is normalised to the validated PR title; contributors don't need to learn conventional-commit hygiene. |
| Unusual cases (dependency mass-merge, vendor sync) | **Merge commit** | Preserves history without forcing rebase resolution. Rare. |

**The PR title MUST be a valid Conventional Commit** with a scope from
the allowlist — even when you intend to rebase merge. The title is the
reviewer-facing summary AND it's what a future "oops, squashed by
mistake" survives. Catching a bad title at PR-open time is much cheaper
than fixing main after a botched merge.

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

**Tag ruleset (`~ALL` — every tag in the repo):**

- Tag creation blocked for non-bypass actors
- Tag deletion blocked
- Tag force-update blocked
- Bypass: repository administrators

We'd ideally narrow this to just `@adaptiveworx/iac-*@*` (the only
tags that exist today and the trigger surface for `release.yml`), but
GitHub's ruleset pattern syntax rejects `@` as a literal character in
fnmatch globs. `~ALL` is strictly safer at the cost of covering tags
we don't actually create — fine because the repo doesn't use other
tag namespaces.

The rule matters because [`release.yml`](./.github/workflows/release.yml)
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
with **independent versioning per package**. Configuration lives in
the `release` block of [nx.json](./nx.json).

Releases land on `main` **via PR**, not via direct push. This keeps
release commits subject to the same governance as every other change
(rebase merge, status checks must pass, no bypass) and avoids relying
on bypass behaviors that vary between GitHub UI and CLI contexts. The
only privileged automation is a dedicated GitHub App that creates the
package tags after the release PR merges.

### Release flow

```
maintainer
  └─ git checkout -b release/<id>
  └─ pnpm release:prepare
        ├─ nx release --skip-publish
        │     ├─ bumps packages/*/package.json versions
        │     ├─ generates packages/*/CHANGELOG.md entries
        │     ├─ creates chore(release) commit (--no-verify)
        │     └─ creates per-package tags locally (not pushed)
        └─ generate .release/manifest.json
        └─ amend chore(release) commit to include manifest
        └─ re-tag at amended commit
  └─ pnpm release:pr
        ├─ git push -u origin <release/<id>>
        └─ gh pr create
                ↓
        REVIEW + REBASE MERGE
                ↓
GitHub Actions (release-tags.yml)
  └─ fires on push to main, head_commit subject startsWith "chore(release): publish"
  └─ mints GitHub App token (RELEASE_APP_*)
  └─ validates .release/manifest.json against repo state
  └─ creates + pushes per-package tags (idempotent)
                ↓
GitHub Actions (release.yml)
  └─ fires on tag push @adaptiveworx/iac-*@*
  └─ builds + publishes via npm OIDC Trusted Publishing
```

### Step 1 — `pnpm release:prepare` (locally, on a release branch)

```bash
git checkout -b release/$(date +%Y%m%d-%H%M)

# Auto-mode (Nx walks conventional commits to choose specifiers):
pnpm release:prepare

# Manual override (forced version for one project):
pnpm release:prepare -- --projects=@adaptiveworx/iac-policies --specifier=0.2.0
```

The script refuses to run on `main`. After it succeeds you'll have a
single `chore(release): publish` commit on the release branch with
package versions bumped, CHANGELOGs generated, `.release/manifest.json`
recording the package@version pairs, and per-package git tags pointing
at HEAD locally (not pushed yet).

To preview without committing:

```bash
pnpm release:dry          # `nx release --dry-run --skip-publish`
```

### Step 2 — `pnpm release:pr`

```bash
pnpm release:pr
```

Pushes the release branch to `origin` and opens a PR with title
`chore(release): publish <pkg>@<ver>, <pkg>@<ver>` and a body listing
the manifest. CI runs the same `validate` + `validate-title` gate as
any other PR.

### Step 3 — Review + rebase merge

The PR title is a properly-scoped conventional commit (`chore(release):
publish ...`); merge it via **rebase**. The chore(release) commit lands
on `main` exactly as written, including `.release/manifest.json`.

### Step 4 — Tags and publish (automated)

`release-tags.yml` fires on the push to main, mints a GitHub App
token, validates the manifest, and creates+pushes per-package git tags
at the merged commit. Each tag push triggers `release.yml`, which
publishes the corresponding npm package via OIDC Trusted Publishing.

### Pre-release & alpha tags

For breaking changes that need bake time, pass `--pre-id` through:

```bash
pnpm release:prepare -- --pre-id=alpha
# Publishes 1.0.0-alpha.0 etc.
```

Pre-release tags publish under the `alpha` dist-tag on npm, leaving
`latest` pointing at the stable release.

### Recovery

If `release-tags.yml` fails partway (e.g. one tag created but workflow
crashed before pushing), the script is idempotent: re-running it (via
`gh workflow run release-tags.yml` or by re-pushing the release commit)
will skip already-correct tags and create the missing ones. If a tag
exists at the WRONG commit, the script fails loudly rather than
silently moving it — investigate manually.

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
