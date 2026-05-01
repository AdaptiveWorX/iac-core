#!/usr/bin/env bash
# Push the release commit and per-package tags individually so each tag
# triggers its own workflow run.
#
# Background: nx release creates one commit + N tags atomically. Pushing
# them in a single git invocation lets GitHub's webhook layer coalesce
# the tag fan-out, and the documented edge of >3 tags in one push can
# drop workflow events entirely (zero runs observed in practice). This
# script unwinds the batch so each tag gets its own push event and its
# own release.yml run.
#
# Run after `pnpm nx release` produces the version commit + tags.
# Pairs with `release.git.push: false` in nx.json.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TAGS=$(git tag --points-at HEAD | grep '^@adaptiveworx/iac-.*@' || true)

if [ -z "$TAGS" ]; then
  echo "error: no @adaptiveworx/iac-* tags point at HEAD." >&2
  echo "Did 'pnpm nx release' run? Check 'git tag --points-at HEAD'." >&2
  exit 1
fi

TAG_COUNT=$(printf '%s\n' "$TAGS" | wc -l | tr -d ' ')
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "Pushing release commit on branch: $BRANCH"
git push origin "$BRANCH"
sleep 2

echo "Pushing $TAG_COUNT release tag(s) sequentially:"
while IFS= read -r tag; do
  echo "  → $tag"
  git push origin "refs/tags/$tag"
  sleep 2
done <<< "$TAGS"

echo
echo "Done. Watch workflow runs:"
echo "  gh run list --workflow=release.yml --limit $TAG_COUNT"
