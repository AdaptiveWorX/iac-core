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

case "$BRANCH" in
  release/*) ;;
  *)
    echo "warning: branch '$BRANCH' is not named release/<id>. Continuing anyway." >&2
    ;;
esac

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
