#!/usr/bin/env tsx
/**
 * Stale-release guard (a), run by CI on release/* pull requests: fails when
 * main has moved past the commit this release PR was prepared from.
 *
 * Usage: tsx scripts/release/check-release-pr.ts
 * Reads .release/manifest.json and main's current tip from origin.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkReleasePrIsCurrent, type ReleaseManifest } from "./release-base.js";

const manifest = JSON.parse(readFileSync(".release/manifest.json", "utf8")) as ReleaseManifest;
const mainTip = execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], {
  encoding: "utf8",
})
  .split("\t")[0]
  ?.trim();

if (mainTip === undefined || mainTip === "") {
  console.error("error: could not read main's tip from origin");
  process.exit(1);
}

const stale = checkReleasePrIsCurrent(manifest, mainTip);
if (stale !== undefined) {
  console.error(`error: ${stale}`);
  process.exit(1);
}
console.log(`✓ release PR is current: prepared from main at ${mainTip.slice(0, 7)}`);
