#!/usr/bin/env bash
# Prepare a release on a release-prep branch.
#
# Sequence:
#   1. Verify we're not on `main` (release commits land on main via PR, not direct push)
#   2. Run `nx release ... --skip-publish` (bumps versions, generates changelogs,
#      creates a chore(release) commit + per-package tags locally)
#   3. Generate `.release/manifest.json` capturing the package@version pairs
#   4. Amend the chore(release) commit to include the manifest
#   5. Re-create tags at the amended commit (amend changed the SHA)
#
# After this script: run `pnpm release:pr` to push the branch + open the
# release PR.
#
# Usage:
#   pnpm release:prepare [-- <nx release args>]
#
# Examples:
#   pnpm release:prepare                                                # auto-mode
#   pnpm release:prepare -- --projects=@adaptiveworx/iac-core --specifier=patch
#   pnpm release:prepare -- --projects=@adaptiveworx/iac-policies --specifier=0.2.0

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# nx's workspace-root detection looks for a `.git` directory and walks
# up otherwise. Inside a git worktree, `.git` is a FILE pointing at the
# main repo's `.git/worktrees/<name>`, which nx doesn't recognize as a
# workspace root marker — so it walks past the worktree's nx.json and
# reads the main repo's nx.json instead. Pin the env var to the
# worktree's tree.
export NX_WORKSPACE_ROOT_PATH="$(pwd)"

# 1. Branch guard.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "main" ]; then
  echo "error: refusing to run release:prepare on main." >&2
  echo >&2
  echo "Release commits land on main via PR. Create a release branch first:" >&2
  echo "  git checkout -b release/\$(date +%Y%m%d-%H%M)" >&2
  echo "Then re-run: pnpm release:prepare" >&2
  exit 1
fi

# Accept release/<id> (manual) and worktree-release+<id> /
# worktree-release/<id> (agent-driven via `claude --worktree`).
case "$BRANCH" in
  release/*) ;;
  worktree-release/*) ;;
  worktree-release+*) ;;
  *)
    echo "warning: branch '$BRANCH' is not a release branch. Continuing anyway." >&2
    ;;
esac

# Resync tags from origin (force-overwrite local). `git fetch` does NOT
# update existing local tags by default — if a previous session created
# a tag locally that later got recreated on origin (e.g. an agent
# prepared a release on a branch, merge produced a different SHA, the
# release-tags workflow created the tag on origin at the new SHA), the
# stale local tag persists. nx resolves "current version" via local
# tags, so a stale tag pointing at an orphan commit makes nx fall back
# to an earlier version and propose backwards bumps. `--force` makes
# local match origin.
echo "→ resyncing tags from origin"
git fetch --tags --force origin >/dev/null 2>&1 || {
  echo "warning: tag resync failed (offline?); continuing with local tag state" >&2
}

# Cleanup-on-failure: nx tags HEAD even if the commit step fails,
# leaving stray local tags pointing at the previous main commit, which
# then poisons the next attempt (nx reads the stray tag as the
# project's "current version" and bumps from there). Track tags before
# the run; on non-zero exit, delete any tag created during the run.
PRE_RUN_TAGS=$(mktemp)
git tag --list >"$PRE_RUN_TAGS"
cleanup_failed_run() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo >&2
    echo "→ release:prepare failed (exit $exit_code). Cleaning up stray tags created during this run." >&2
    local current_tags
    current_tags=$(mktemp)
    git tag --list >"$current_tags"
    while IFS= read -r tag; do
      [ -z "$tag" ] && continue
      git tag -d "$tag" >/dev/null 2>&1 || true
      echo "  deleted local tag: $tag" >&2
    done < <(comm -23 <(sort "$current_tags") <(sort "$PRE_RUN_TAGS"))
    rm -f "$current_tags"
  fi
  rm -f "$PRE_RUN_TAGS"
}
trap cleanup_failed_run EXIT

# 2. Run nx release. Pass through any extra args (after `--`) for manual specifiers.
echo "→ nx release --skip-publish $*"
pnpm exec nx release --skip-publish "$@"

# 3. Generate manifest.
echo "→ generating .release/manifest.json"
pnpm exec tsx scripts/release/generate-release-manifest.ts

# 4. Amend the chore(release) commit to include the manifest.
PRE_AMEND_TAGS=$(git tag --points-at HEAD)
PRE_AMEND_COMMIT=$(git rev-parse HEAD)

git add .release/manifest.json
git commit --amend --no-edit --no-verify >/dev/null

# 5. Re-tag at the amended commit (the SHA changed).
if [ -n "$PRE_AMEND_TAGS" ]; then
  echo "→ re-tagging at amended commit"
  while IFS= read -r tag; do
    [ -z "$tag" ] && continue
    git tag -d "$tag" >/dev/null
    git tag "$tag"
    echo "  $tag"
  done <<< "$PRE_AMEND_TAGS"
fi

echo
echo "✓ Release prepared on '$BRANCH'"
echo "  Pre-amend commit: $PRE_AMEND_COMMIT"
echo "  Post-amend commit: $(git rev-parse HEAD)"
echo "  Manifest: $(jq -r '.releases | length' .release/manifest.json) package(s)"
echo
echo "Next: pnpm release:pr"
