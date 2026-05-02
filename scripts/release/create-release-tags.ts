#!/usr/bin/env tsx
/**
 * Create + push git tags from `.release/manifest.json` against HEAD.
 *
 * Idempotent semantics:
 *   - tag exists at HEAD          → no-op (success)
 *   - tag exists at another SHA   → fail loudly (don't silently move tags)
 *   - tag does not exist          → create at HEAD and push
 *
 * Designed to run inside the `release-tags.yml` workflow with a GitHub App
 * token (env var `GH_TOKEN` from the App, used by `git push` via the
 * default `actions/checkout@v6` token replacement). Tag pushes via App
 * authentication trigger downstream `release.yml` workflows; pushes via
 * the default `GITHUB_TOKEN` would NOT (anti-recursion safeguard).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
const MANIFEST_PATH = join(REPO_ROOT, ".release", "manifest.json");

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function tryGit(...args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).toString().trim();
  } catch {
    return null;
  }
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function main(): void {
  if (!existsSync(MANIFEST_PATH)) {
    fail(`manifest not found at ${MANIFEST_PATH}`);
  }

  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const headSha = git("rev-parse", "HEAD");
  console.log(`HEAD: ${headSha}`);

  let created = 0;
  let already = 0;

  for (const r of manifest.releases) {
    const existingSha = tryGit("rev-list", "-n", "1", `refs/tags/${r.tag}`);

    if (existingSha === null) {
      // Tag does not exist — create + push.
      console.log(`create + push: ${r.tag}`);
      git("tag", r.tag, headSha);
      git("push", "origin", `refs/tags/${r.tag}`);
      created++;
      continue;
    }

    if (existingSha === headSha) {
      // Idempotent — already correct.
      console.log(`already at HEAD: ${r.tag}`);
      already++;
      continue;
    }

    // Tag exists at a different commit. Don't silently move it.
    fail(
      `tag ${r.tag} exists at ${existingSha.slice(0, 7)} but HEAD is ${headSha.slice(0, 7)}. ` +
        "Refusing to move an existing release tag. Investigate manually."
    );
  }

  console.log(`✓ done: created ${created}, already-at-HEAD ${already}`);
}

main();
