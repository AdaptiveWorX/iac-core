/**
 * The stale-release guard.
 *
 * A release PR is computed from one main commit: Nx Release reads the history
 * up to it to pick versions and write changelogs. If main moves on before the
 * release PR merges, the squash commit (and so the tags and the published
 * packages) carries code those versions and changelogs never saw. Release
 * #58 did exactly that: prepared before #57, merged after it, it shipped
 * #57's breaking removal of iac-schemas' ./generated/* as the patch 0.1.6.
 *
 * So prepare.sh records the main commit it started from as `baseSha` in
 * .release/manifest.json, and two checks compare it:
 *   (a) CI on a release/* PR: main's current tip must still be baseSha;
 *   (b) Release Tags on main: the release commit's parent must be baseSha.
 */

export interface ReleaseManifest {
  readonly baseSha?: string;
  readonly releases: readonly unknown[];
}

const SHA = /^[0-9a-f]{40}$/;

const RERUN =
  "Close this release PR and re-run the Scheduled Release workflow, so versions and changelogs are computed from current main.";

/** The recorded base, or an error when it is missing or malformed. */
function recordedBase(manifest: ReleaseManifest): { sha: string } | { error: string } {
  if (manifest.baseSha === undefined) {
    return {
      error: `.release/manifest.json has no baseSha: the release was not prepared by the current prepare.sh. ${RERUN}`,
    };
  }
  if (!SHA.test(manifest.baseSha)) {
    return {
      error: `.release/manifest.json baseSha '${manifest.baseSha}' is not a full commit SHA.`,
    };
  }
  return { sha: manifest.baseSha };
}

/**
 * (a) A release PR is current only while main's tip is the commit it was
 * prepared from. Returns an error message, or undefined when current.
 */
export function checkReleasePrIsCurrent(
  manifest: ReleaseManifest,
  mainTip: string
): string | undefined {
  const base = recordedBase(manifest);
  if ("error" in base) {
    return base.error;
  }
  if (base.sha !== mainTip) {
    return `This release PR was prepared from main at ${base.sha.slice(0, 7)}, but main is now at ${mainTip.slice(0, 7)}: merging it would ship commits its versions and changelogs don't include. ${RERUN}`;
  }
  return undefined;
}

/**
 * (b) The release commit on main must sit directly on the commit the release
 * was prepared from (its first parent). Returns an error message, or
 * undefined when it does.
 */
export function checkReleaseCommitParent(
  manifest: ReleaseManifest,
  releaseCommitParent: string
): string | undefined {
  const base = recordedBase(manifest);
  if ("error" in base) {
    return base.error;
  }
  if (base.sha !== releaseCommitParent) {
    return `The release was prepared from main at ${base.sha.slice(0, 7)}, but it merged onto ${releaseCommitParent.slice(0, 7)}: the tagged commit carries changes its versions and changelogs don't include. Refusing to tag. Re-run the Scheduled Release workflow; it will release those changes too.`;
  }
  return undefined;
}
