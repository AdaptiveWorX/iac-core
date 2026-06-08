#!/usr/bin/env bash
# Print a comma-separated list of packages that have a RELEASABLE commit
# touching their own directory since that package's last release tag.
#
# Why this exists: nx's conventional-commit version resolver attributes changes
# to files that belong to no project (pnpm-lock.yaml, root config, scripts/) to
# EVERY project. So a single `fix:` that also touches the lockfile, or a
# tooling commit, makes nx patch-bump the whole workspace. Scoping
# `nx release --projects=…` to what this script returns keeps releases to the
# packages that actually changed in a way that warrants one.
#
# "Releasable" mirrors nx.json's conventionalCommitsConfig: feat / fix / perf
# bump, everything else is `none`, and a `!` breaking marker (or a
# "BREAKING CHANGE" footer) bumps regardless of type.
#
# Output: e.g. "@adaptiveworx/iac-core,@adaptiveworx/iac-aws" (empty if none).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Subject lines that warrant a release: feat/fix/perf (any scope), or any type
# carrying a `!` breaking marker.
releasable_subject_re='^(feat|fix|perf)(\([^)]*\))?!?:|^[a-zA-Z]+(\([^)]*\))?!:'

projects=()
for pj in packages/*/package.json; do
  [ -f "$pj" ] || continue
  dir=$(dirname "$pj")
  name=$(jq -r '.name // empty' "$pj")
  private=$(jq -r '.private // false' "$pj")
  [ -z "$name" ] && continue
  [ "$private" = "true" ] && continue

  # Latest release tag for this package (releaseTagPattern: {name}@{version}).
  last_tag=$(git tag --list "${name}@*" | sort -V | tail -n1)
  range="${last_tag:+${last_tag}..}HEAD" # all history if never released

  # Releasable if a dir-touching commit has a releasable subject…
  if git log "$range" --format='%s' -- "$dir" | grep -qE "$releasable_subject_re"; then
    projects+=("$name")
  # …or carries a BREAKING CHANGE footer in its body.
  elif git log "$range" --format='%b' -- "$dir" | grep -q 'BREAKING CHANGE'; then
    projects+=("$name")
  fi
done

# Comma-join (empty string when nothing is releasable).
(
  IFS=,
  echo "${projects[*]:-}"
)
