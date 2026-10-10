#!/usr/bin/env tsx
/**
 * Publish the local release commit as a GitHub-signed commit.
 *
 * main's ruleset requires verified signatures, and GitHub evaluates every commit a pull request
 * introduces, even for a squash merge. The release commit is made locally by `nx release` (in
 * prepare.sh), so it is unsigned. Instead of pushing it, this script re-creates it on GitHub with
 * the GraphQL `createCommitOnBranch` mutation, authenticated with the release App's installation
 * token. GitHub documents that commits made with this mutation "are automatically signed by GitHub
 * if supported and will be marked as verified", authored by the credential's owner (the App).
 * No signing key exists anywhere.
 *
 * Steps (CI only; the Scheduled Release workflow runs it from open-pr.sh):
 *   1. HEAD must be exactly one commit on top of origin/main (prepare.sh's chore(release) commit).
 *   2. Create the remote release branch at origin/main (REST git/refs).
 *   3. createCommitOnBranch with the local commit's message and its file changes (expectedHeadOid
 *      = origin/main, so nothing else can slip in).
 *   4. Fail closed unless the remote commit's tree equals the local commit's tree byte for byte,
 *      and GitHub reports it verified. On any failure the remote branch this run created is deleted.
 *   5. Move the local branch to the signed commit (same tree, so the work tree is unchanged).
 *
 * `--dry-run` prints the planned file changes and makes no API call.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface FileAddition {
  path: string;
  contents: string;
}

export interface FileDeletion {
  path: string;
}

export interface FileChanges {
  additions: FileAddition[];
  deletions: FileDeletion[];
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
}

/**
 * The file changes between two commits, in createCommitOnBranch's FileChanges shape. Only regular
 * non-executable files (mode 100644) can be expressed: the mutation carries no file mode, so an
 * executable, symlink or submodule change is refused rather than silently altered.
 */
export function fileChangesBetween(cwd: string, base: string, head: string): FileChanges {
  // --raw -z: ":<old mode> <new mode> <old sha> <new sha> <status>\0<path>\0" per entry.
  const raw = execFileSync("git", ["diff", "--raw", "-z", "--no-renames", base, head], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const fields = raw.split("\0").filter(f => f !== "");
  const changes: FileChanges = { additions: [], deletions: [] };
  for (let i = 0; i < fields.length; i += 2) {
    const meta = fields[i];
    const path = fields[i + 1];
    if (meta === undefined || path === undefined || !meta.startsWith(":")) {
      throw new Error(`Unparseable git diff --raw entry: ${JSON.stringify(meta)}`);
    }
    const [, newMode, , , status] = meta.slice(1).split(" ");
    if (status === "D") {
      changes.deletions.push({ path });
      continue;
    }
    if (status !== "A" && status !== "M") {
      throw new Error(`Unsupported change '${status}' for ${path}`);
    }
    if (newMode !== "100644") {
      throw new Error(
        `${path} has mode ${newMode}; createCommitOnBranch can only write regular 100644 files`
      );
    }
    const blob = execFileSync("git", ["show", `${head}:${path}`], {
      cwd,
      maxBuffer: 256 * 1024 * 1024,
    });
    changes.additions.push({ path, contents: blob.toString("base64") });
  }
  return changes;
}

function ghApi(args: string[], input?: unknown): string {
  let dir: string | undefined;
  try {
    const fullArgs = ["api", ...args];
    if (input !== undefined) {
      dir = mkdtempSync(join(tmpdir(), "signed-commit-"));
      const file = join(dir, "input.json");
      writeFileSync(file, JSON.stringify(input));
      fullArgs.push("--input", file);
    }
    return execFileSync("gh", fullArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
  } finally {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

const CREATE_COMMIT = `mutation($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}`;

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  const cwd = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.startsWith("release/")) {
    throw new Error(`expected a release/* branch, got '${branch}'`);
  }
  const head = git(cwd, ["rev-parse", "HEAD"]);
  const base = git(cwd, ["rev-parse", "origin/main"]);
  if (git(cwd, ["rev-parse", "HEAD^"]) !== base) {
    throw new Error("HEAD must be exactly one commit on top of origin/main (the release commit)");
  }
  const message = git(cwd, ["log", "-1", "--format=%B", head]);
  const [headline = "", ...rest] = message.split("\n");
  const body = rest.join("\n").trim();
  const fileChanges = fileChangesBetween(cwd, base, head);

  console.log(`→ ${branch}: ${headline}`);
  for (const a of fileChanges.additions) {
    console.log(`  write  ${a.path}`);
  }
  for (const d of fileChanges.deletions) {
    console.log(`  delete ${d.path}`);
  }
  if (dryRun) {
    console.log("(dry run: no API calls)");
    return;
  }
  if (process.env["GITHUB_ACTIONS"] !== "true") {
    throw new Error(
      "push-signed-commit runs only in the Scheduled Release workflow (or --dry-run)"
    );
  }
  const repo = process.env["GITHUB_REPOSITORY"];
  if (repo === undefined || repo === "") {
    throw new Error("GITHUB_REPOSITORY is not set");
  }

  ghApi(["-X", "POST", `/repos/${repo}/git/refs`], { ref: `refs/heads/${branch}`, sha: base });
  try {
    const result = JSON.parse(
      ghApi(["graphql"], {
        query: CREATE_COMMIT,
        variables: {
          input: {
            branch: { repositoryNameWithOwner: repo, branchName: branch },
            expectedHeadOid: base,
            message: body === "" ? { headline } : { headline, body },
            fileChanges,
          },
        },
      })
    ) as { data?: { createCommitOnBranch?: { commit?: { oid?: string } } }; errors?: unknown };
    const oid = result.data?.createCommitOnBranch?.commit?.oid;
    if (oid === undefined) {
      throw new Error(`createCommitOnBranch failed: ${JSON.stringify(result.errors ?? result)}`);
    }

    git(cwd, ["fetch", "--quiet", "origin", `refs/heads/${branch}`]);
    const fetched = git(cwd, ["rev-parse", "FETCH_HEAD"]);
    const remoteTree = git(cwd, ["rev-parse", `${fetched}^{tree}`]);
    const localTree = git(cwd, ["rev-parse", `${head}^{tree}`]);
    if (fetched !== oid || remoteTree !== localTree) {
      throw new Error(
        `signed commit ${oid} does not reproduce the release commit (tree ${remoteTree} ≠ ${localTree})`
      );
    }
    const verification = JSON.parse(
      ghApi([`/repos/${repo}/commits/${oid}`, "--jq", ".commit.verification"])
    ) as { verified: boolean; reason: string };
    if (!verification.verified) {
      throw new Error(`commit ${oid} is not verified (reason: ${verification.reason})`);
    }

    git(cwd, ["reset", "--soft", oid]);
    git(cwd, ["branch", "--set-upstream-to", `origin/${branch}`]);
    console.log(
      `✓ ${oid} on ${branch}: tree identical to the local release commit, verified by GitHub`
    );
  } catch (error) {
    console.error(`→ deleting the remote branch ${branch} this run created`);
    try {
      ghApi(["-X", "DELETE", `/repos/${repo}/git/refs/heads/${branch}`]);
    } catch {
      console.error(`  could not delete ${branch}; remove it before re-running`);
    }
    throw error;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
