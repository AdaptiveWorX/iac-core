#!/usr/bin/env bash
# Prepare a release on a release-prep branch. CI only: the Scheduled Release
# workflow (.github/workflows/release-schedule.yml) runs it; there is no local
# release path.
#
# Sequence:
#   1. Verify we're not on `main` (release commits land on main via PR, not direct push)
#   2. Run `nx release ... --skip-publish` (bumps versions, generates changelogs,
#      creates a chore(release) commit + per-package tags locally)
#   3. Generate `.release/manifest.json` capturing the package@version pairs
#   4. Amend the chore(release) commit to include the manifest
#   5. Re-create tags at the amended commit (amend changed the SHA)
#
# The manifest records the main commit the release is computed from
# (`baseSha`); CI and Release Tags refuse the release once main has moved past
# it (scripts/release/release-base.ts).
#
# After this script the workflow runs scripts/release/open-pr.sh.
#
# Usage (from the workflow):
#   bash scripts/release/prepare.sh [<nx release args>]
#   bash scripts/release/prepare.sh --projects=@adaptiveworx/iac-core --specifier=patch

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "error: releases are prepared only by the Scheduled Release workflow (Monday cron or" >&2
  echo "workflow_dispatch). Preview locally with: pnpm release:dry" >&2
  exit 1
fi

# nx's workspace-root detection looks for a `.git` directory and walks
# up otherwise. Inside a git worktree, `.git` is a FILE pointing at the
# main repo's `.git/worktrees/<name>`, which nx doesn't recognize as a
# workspace root marker — so it walks past the worktree's nx.json and
# reads the main repo's nx.json instead. Pin the env var to the
# worktree's tree.
export NX_WORKSPACE_ROOT_PATH="$(pwd)"


# 1. Branch guard: the workflow branches release/<date> from main first.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
case "$BRANCH" in
  release/*) ;;
  *)
    echo "error: prepare.sh runs on a release/* branch (the Scheduled Release workflow creates one); got '$BRANCH'." >&2
    exit 1
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
    echo "→ prepare.sh failed (exit $exit_code). Cleaning up stray tags created during this run." >&2
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
# The release is computed from this commit, which must be main's current tip.
git fetch origin main >/dev/null 2>&1
RELEASE_BASE_SHA=$(git rev-parse HEAD)
if [ "$RELEASE_BASE_SHA" != "$(git rev-parse FETCH_HEAD)" ]; then
  echo "error: HEAD ($RELEASE_BASE_SHA) is not main's tip; prepare a release from current main." >&2
  exit 1
fi
export RELEASE_BASE_SHA

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
echo "Next: bash scripts/release/open-pr.sh"
