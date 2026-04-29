# Contributing to AdaptiveWorX Flux

Thanks for your interest in `flux-core`. This document covers
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
git clone https://github.com/AdaptiveWorX/flux-core.git
cd flux-core
pnpm install
pnpm build         # Verify everything builds
pnpm test          # Verify the test suite passes
```

That should be a clean run. If anything fails on `main`, please open an
issue.

## Repo orientation

Read these in order on first contribution:

1. [README.md](./README.md) — high-level overview + commands
2. [docs/architecture.md](./docs/architecture.md) — package boundaries,
   dependency graph, release model
3. [docs/platform-coordination.md](./docs/platform-coordination.md) —
   why the packages exist in their current shape (Prosilio ↔ OSS
   coordination)

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
2. Make your changes. Keep commits focused; one logical change per commit
   makes review (and conventional-commits-driven releases) cleaner.
3. Run the local quality gates (see below).
4. Push and open a PR. Use a conventional-commits-style PR title — it
   becomes the merge commit subject and feeds Nx Release.

### Local quality gates

Before pushing, run:

```bash
pnpm lint:affected       # Biome
pnpm typecheck           # tsc --noEmit
pnpm test:affected       # vitest
pnpm build:affected      # tsc -p tsconfig.lib.json
```

Or just run the full suite if affected detection feels off:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Nx caches results, so the second run is near-instant.

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

| Type | Bump | Use for |
|---|---|---|
| `feat` | minor | New feature, new export, new public API |
| `fix` | patch | Bug fix that doesn't change public API |
| `perf` | patch | Performance improvement |
| `refactor` | patch | Internal refactor, no behavior change |
| `docs` | (none) | Documentation only |
| `test` | (none) | Test-only changes |
| `build` | (none) | Build system, dependencies |
| `ci` | (none) | CI configuration |
| `chore` | (none) | Maintenance, no public effect |

Add `!` before the colon (or `BREAKING CHANGE:` in the footer) for a
**major** bump:

```
feat(iac-components-aws)!: rename SharedVpc.tiers to SharedVpc.subnetTiers
```

### Scopes

Use the unscoped package name as the scope:

- `iac-core`
- `iac-schemas`
- `iac-policies`
- `iac-components-aws`
- `iac-components-azure`
- `repo` for cross-cutting changes (root tooling, docs that aren't
  package-specific)

Examples:

```
feat(iac-components-aws): add VPC peering support to SharedVpc
fix(iac-core): handle missing AWS_REGION env var in stack-utils
docs(repo): clarify Nx Release flow in CONTRIBUTING.md
chore(iac-schemas): bump zod peer range
feat(iac-components-azure)!: rename FabricCapacity.skuTier to skuName
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

- **Bugs:** open a [GitHub issue](https://github.com/AdaptiveWorX/flux-core/issues)
  with reproduction steps and the package + version affected.
- **Security:** don't open a public issue. See
  [docs/security-implementation.md](./docs/security-implementation.md)
  for the disclosure process.

## License

By contributing, you agree that your contributions are licensed under
the [Apache 2.0 License](./LICENSE) — the same license that covers the
rest of the repo.
