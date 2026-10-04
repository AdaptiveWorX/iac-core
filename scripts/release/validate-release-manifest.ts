#!/usr/bin/env tsx
/**
 * Validate `.release/manifest.json` against the current HEAD's repo state.
 *
 * Run by the `release-tags.yml` workflow on the post-merge `main` HEAD. Fails
 * loudly if the manifest doesn't match reality:
 *
 *   - manifest entry's `version` matches the on-disk `package.json` version
 *   - manifest entry's `tag` follows the `releaseTagPattern`
 *     (`{projectName}@{version}`)
 *   - manifest's `directory` exists and contains the expected `package.json`
 *   - no on-disk @adaptiveworx package whose version differs from its last
 *     released tag is missing from the manifest
 *
 * If validation fails, the workflow stops before creating any tags. This
 * protects against corrupted manifests, partial commits, or rebase mishaps
 * that would otherwise produce wrong tags on `main`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

interface Manifest {
  releases: Release[];
}

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const MANIFEST_PATH = join(REPO_ROOT, ".release", "manifest.json");

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8"));
}

function existingTag(tagName: string): boolean {
  try {
    execFileSync("git", ["rev-parse", `refs/tags/${tagName}`], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  if (!existsSync(MANIFEST_PATH)) {
    fail(`manifest not found at ${MANIFEST_PATH}`);
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch (e) {
    fail(`manifest is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!Array.isArray(manifest.releases) || manifest.releases.length === 0) {
    fail("manifest.releases is missing or empty");
  }

  // Per-entry validation.
  for (const r of manifest.releases) {
    if (!(r.package && r.version && r.tag && r.directory)) {
      fail(`incomplete release entry: ${JSON.stringify(r)}`);
    }

    const expectedTag = `${r.package}@${r.version}`;
    if (r.tag !== expectedTag) {
      fail(
        `tag mismatch for ${r.package}: manifest says ${r.tag}, expected ${expectedTag} per releaseTagPattern`
      );
    }

    const pkgPath = join(REPO_ROOT, r.directory, "package.json");
    if (!existsSync(pkgPath)) {
      fail(`directory missing or has no package.json: ${r.directory}`);
    }

    const pkg = readPackageJson(pkgPath);
    if (pkg.name !== r.package) {
      fail(
        `package name mismatch in ${r.directory}/package.json: manifest says ${r.package}, on-disk says ${pkg.name}`
      );
    }
    if (pkg.version !== r.version) {
      fail(
        `version mismatch in ${r.directory}/package.json: manifest says ${r.version}, on-disk says ${pkg.version}`
      );
    }
  }

  // Cross-check: the manifest should cover every published @adaptiveworx
  // package whose on-disk version doesn't already have a tag in the repo.
  const manifestPackages = new Set(manifest.releases.map(r => r.package));
  const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of dirs) {
    const pkgPath = join(PACKAGES_DIR, dir, "package.json");
    if (!existsSync(pkgPath)) {
      continue;
    }
    const pkg = readPackageJson(pkgPath);
    if (pkg.private || !pkg.name?.startsWith("@adaptiveworx/")) {
      continue;
    }
    if (!pkg.version) {
      continue;
    }

    const expectedTag = `${pkg.name}@${pkg.version}`;
    if (existingTag(expectedTag)) {
      continue; // already tagged; not a release candidate
    }
    if (manifestPackages.has(pkg.name)) {
      continue; // covered by manifest
    }

    fail(
      `package ${pkg.name}@${pkg.version} (in ${dir}) has no existing tag and is missing from the release manifest. ` +
        "Either include it in the release or roll back the version bump."
    );
  }

  console.log(`✓ manifest valid: ${manifest.releases.length} release(s)`);
  for (const r of manifest.releases) {
    console.log(`  ${r.tag}`);
  }
}

main();
