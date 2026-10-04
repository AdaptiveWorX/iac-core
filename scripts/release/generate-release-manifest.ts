#!/usr/bin/env tsx
/**
 * Generate `.release/manifest.json` from the current HEAD's release state.
 *
 * Run AFTER `nx release` has created the chore(release) commit + per-package
 * tags. The manifest captures package@version pairs that the tag-creation
 * workflow will then materialize as git tags on `main` post-PR-merge.
 *
 * Output shape:
 *   {
 *     "releases": [
 *       {
 *         "package": "@adaptiveworx/iac-policies",
 *         "version": "0.2.0",
 *         "tag": "@adaptiveworx/iac-policies@0.2.0",
 *         "directory": "packages/iac-policies"
 *       },
 *       ...
 *     ]
 *   }
 *
 * The manifest is a stable contract between the release-prep script and the
 * `release-tags.yml` workflow — purposely independent of Nx's commit-body
 * formatting so workflow logic doesn't break if Nx output changes shape.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const MANIFEST_DIR = join(REPO_ROOT, ".release");
const MANIFEST_PATH = join(MANIFEST_DIR, "manifest.json");

interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
}

interface Release {
  package: string;
  version: string;
  tag: string;
  directory: string;
}

function readPackageJson(dir: string): PackageJson {
  const path = join(PACKAGES_DIR, dir, "package.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

function tagsAtHead(): string[] {
  const out = execFileSync("git", ["tag", "--points-at", "HEAD"], { encoding: "utf8" }).trim();
  if (!out) {
    return [];
  }
  return out.split("\n");
}

function main(): void {
  const headTags = new Set(tagsAtHead());
  if (headTags.size === 0) {
    console.error("error: no tags at HEAD. Did `nx release` run?");
    process.exit(1);
  }

  const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  const releases: Release[] = [];

  for (const dir of dirs) {
    const pkg = readPackageJson(dir);
    if (pkg.private || !pkg.name || !pkg.version) {
      continue;
    }

    const tag = `${pkg.name}@${pkg.version}`;
    if (!headTags.has(tag)) {
      // Package wasn't included in this release — skip silently.
      continue;
    }

    releases.push({
      package: pkg.name,
      version: pkg.version,
      tag,
      directory: `packages/${dir}`,
    });
  }

  if (releases.length === 0) {
    console.error(
      "error: no @adaptiveworx/* package tags found at HEAD matching package.json versions."
    );
    process.exit(1);
  }

  // Sanity check: every release tag at HEAD should be in the manifest.
  const manifestTags = new Set(releases.map(r => r.tag));
  for (const tag of headTags) {
    if (!tag.startsWith("@adaptiveworx/")) {
      continue;
    }
    if (!manifestTags.has(tag)) {
      console.error(`error: tag ${tag} at HEAD has no corresponding package.json entry`);
      process.exit(1);
    }
  }

  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify({ releases }, null, 2)}\n`);

  console.log(`✓ wrote ${releases.length} release entrie(s) to .release/manifest.json:`);
  for (const r of releases) {
    console.log(`  ${r.tag}`);
  }
}

main();
