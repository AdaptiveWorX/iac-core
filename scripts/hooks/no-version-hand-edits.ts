#!/usr/bin/env tsx
// Pre-commit guard: rejects manual edits to packages/*/package.json
// `version` fields. Versions are owned by Nx Release.
//
// Nx Release commits bypass this hook via `commitArgs: "--no-verify"`
// in nx.json (release.git block). The one hand change allowed: reverting a
// release that was never tagged, back to the latest tagged version
// (version-guard.ts; CONTRIBUTING.md, "A refused release").
//
// Invoked by lefthook with the staged files as argv.

import { execFileSync } from "node:child_process";
import { isVersionChangeAllowed } from "./version-guard.js";

const stagedFiles = process.argv.slice(2);
const packageJsonPattern = /^packages\/[^/]+\/package\.json$/;

function readPackage(ref: string, file: string): { name?: string; version?: string } | null {
  try {
    const content = execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
    });
    return JSON.parse(content);
  } catch {
    // File doesn't exist at that ref (new file).
    return null;
  }
}

function readVersion(ref: string, file: string): string | null {
  return readPackage(ref, file)?.version ?? null;
}

function tagExists(tag: string): boolean {
  return execFileSync("git", ["tag", "--list", tag], { encoding: "utf8" }).trim() === tag;
}

function latestTaggedVersion(name: string): string | undefined {
  const latest = execFileSync("git", ["tag", "--list", `${name}@*`, "--sort=-v:refname"], {
    encoding: "utf8",
  })
    .split("\n")[0]
    ?.trim();
  return latest ? latest.slice(name.length + 1) : undefined;
}

let failed = false;

for (const file of stagedFiles) {
  if (!packageJsonPattern.test(file)) {
    continue;
  }

  const stagedVersion = readVersion("", file); // index version
  const headVersion = readVersion("HEAD", file);

  const name = readPackage("", file)?.name ?? "";
  const allowed = isVersionChangeAllowed({
    head: headVersion,
    staged: stagedVersion,
    latestTagged: name ? latestTaggedVersion(name) : undefined,
    headTagged: name !== "" && headVersion !== null && tagExists(`${name}@${headVersion}`),
  });

  if (!allowed) {
    console.error(`error: ${file} version changed from ${headVersion} → ${stagedVersion}`);
    failed = true;
  }
}

if (failed) {
  console.error("");
  console.error("Versions are owned by Nx Release; do not edit by hand.");
  console.error("Releases are cut by the Scheduled Release workflow; to undo a release that was");
  console.error("never tagged, revert its release commit (restores the latest tagged version).");
  console.error("See CONTRIBUTING.md#releases for the full flow.");
  process.exit(1);
}
