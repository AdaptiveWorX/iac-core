#!/usr/bin/env tsx
// Pre-commit guard: rejects manual edits to packages/*/package.json
// `version` fields. Versions are owned by Nx Release.
//
// Nx Release commits bypass this hook via `commitArgs: "--no-verify"`
// in nx.json (release.git block).
//
// Invoked by lefthook with the staged files as argv.

import { execFileSync } from "node:child_process";

const stagedFiles = process.argv.slice(2);
const packageJsonPattern = /^packages\/[^/]+\/package\.json$/;

function readVersion(ref: string, file: string): string | null {
  try {
    const content = execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
    });
    return JSON.parse(content).version ?? null;
  } catch {
    // File doesn't exist at that ref (new file).
    return null;
  }
}

let failed = false;

for (const file of stagedFiles) {
  if (!packageJsonPattern.test(file)) {
    continue;
  }

  const stagedVersion = readVersion("", file); // index version
  const headVersion = readVersion("HEAD", file);

  // New file (no HEAD version) is allowed — that's a new package.
  if (headVersion === null) {
    continue;
  }

  if (stagedVersion !== headVersion) {
    console.error(`error: ${file} version changed from ${headVersion} → ${stagedVersion}`);
    failed = true;
  }
}

if (failed) {
  console.error("");
  console.error("Versions are owned by Nx Release; do not edit by hand.");
  console.error("To cut a release: pnpm nx release && pnpm release:push-tags");
  console.error("See CONTRIBUTING.md#releases for the full flow.");
  process.exit(1);
}
