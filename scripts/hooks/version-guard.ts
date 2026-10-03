/**
 * When may a commit change a packages/*\/package.json `version`?
 *
 * Versions are owned by Nx Release (its release commit skips this hook). By
 * hand, only one change is allowed: undoing a release that was never tagged,
 * i.e. restoring the version of the package's latest release tag. That is
 * the recovery when Release Tags refuses a stale release (see
 * CONTRIBUTING.md, "A refused release"): main then carries bumped,
 * untagged versions, and a PR reverting the release commit restores them.
 */
export interface VersionChange {
  /** The version at HEAD (null for a new package). */
  readonly head: string | null;
  /** The staged version. */
  readonly staged: string | null;
  /** The version of the package's latest `{name}@{version}` tag, if any. */
  readonly latestTagged: string | undefined;
  /** Whether HEAD's version has a release tag. */
  readonly headTagged: boolean;
}

export function isVersionChangeAllowed(change: VersionChange): boolean {
  if (change.head === null || change.staged === change.head) {
    return true; // a new package, or no version change
  }
  // Undoing an untagged release: back to the latest released version.
  return (
    !change.headTagged && change.latestTagged !== undefined && change.staged === change.latestTagged
  );
}
