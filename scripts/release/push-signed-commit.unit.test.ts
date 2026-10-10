/**
 * push-signed-commit: the local release commit maps exactly onto createCommitOnBranch's
 * FileChanges (against a throwaway git repository).
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fileChangesBetween } from "./push-signed-commit.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function repo(): { dir: string; git: (...args: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), "signed-commit-test-"));
  dirs.push(dir);
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
  git("init", "-q", "-b", "main");
  git("config", "commit.gpgsign", "false");
  return { dir, git };
}

describe("fileChangesBetween", () => {
  it("lists modified and added files with base64 contents, and deleted files", () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, "keep.json"), '{"version": "0.3.4"}\n');
    writeFileSync(join(dir, "gone.md"), "old\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");

    writeFileSync(join(dir, "keep.json"), '{"version": "0.4.0"}\n');
    rmSync(join(dir, "gone.md"));
    writeFileSync(join(dir, "dir with space.md"), "naïve ✓\n");
    git("add", "-A");
    git("commit", "-q", "-m", "chore(release): publish");
    const head = git("rev-parse", "HEAD");

    const changes = fileChangesBetween(dir, base, head);
    const decoded = changes.additions
      .map(a => [a.path, Buffer.from(a.contents, "base64").toString("utf8")])
      .sort();
    expect(decoded).toEqual([
      ["dir with space.md", "naïve ✓\n"],
      ["keep.json", '{"version": "0.4.0"}\n'],
    ]);
    expect(changes.deletions).toEqual([{ path: "gone.md" }]);
  });

  it("refuses a change it cannot express (an executable file)", () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, "a.txt"), "a\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "run.sh"), "#!/bin/sh\n");
    chmodSync(join(dir, "run.sh"), 0o755);
    git("add", "-A");
    git("commit", "-q", "-m", "exec");
    expect(() => fileChangesBetween(dir, base, git("rev-parse", "HEAD"))).toThrow(/100755/);
  });

  it("produces no changes between identical commits", () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, "a.txt"), "a\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const sha = git("rev-parse", "HEAD");
    expect(fileChangesBetween(dir, sha, sha)).toEqual({ additions: [], deletions: [] });
  });
});
