#!/usr/bin/env tsx
/**
 * prepare.sh's preflight: refuse to start a release while main carries
 * package versions without a release tag (a merged release that Release Tags
 * refused or failed to tag). Prints the recovery and exits 1.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkNoUntaggedVersions, type PackageVersion } from "./release-base.js";

const packages: PackageVersion[] = readdirSync("packages", { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join("packages", d.name, "package.json")))
  .map(d => JSON.parse(readFileSync(join("packages", d.name, "package.json"), "utf8")))
  .filter(p => !p.private && p.name && p.version)
  .map(p => ({ name: p.name, version: p.version }));

const tagExists = (tag: string): boolean =>
  execFileSync("git", ["tag", "--list", tag], { encoding: "utf8" }).trim() === tag;

const error = checkNoUntaggedVersions(packages, tagExists);
if (error !== undefined) {
  console.error(`error: ${error}`);
  process.exit(1);
}
console.log(`✓ every package version is tagged (${packages.length} packages)`);
