/**
 * Copyright (c) Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runs this fixture's TypeScript 7 `tsc` (skipLibCheck off) and fails on any
 * diagnostic except the known upstream ones below. skipLibCheck is
 * all-or-nothing, so an upstream declaration bug can't be skipped per library;
 * it is matched here by file and code instead, and anything else fails.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const KNOWN_UPSTREAM = [
  // @pulumi/policy 1.21.0: index.d.ts re-exports unknownCheckingProxy and
  // UnknownValueError from ./proxy, whose proxy.d.ts doesn't declare them
  // (TypeScript 6 reports the same). Not in our declarations.
  { file: /@pulumi\/policy\/index\.d\.ts/, code: "TS2305" },
];

const require = createRequire(import.meta.url);
// typescript@7 exports no bin path; resolve the package root via package.json.
const tsc = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json", "--pretty", "false"], {
  encoding: "utf8",
});
const output = `${result.stdout}${result.stderr}`;
const diagnostics = output.split("\n").filter((line) => /error TS\d+/.test(line));
const unexpected = diagnostics.filter(
  (line) => !KNOWN_UPSTREAM.some((k) => k.file.test(line) && line.includes(k.code))
);

process.stdout.write(`${output.trim() ? `${output.trim()}\n` : ""}`);
if (unexpected.length > 0 || (result.status !== 0 && diagnostics.length === 0)) {
  process.stderr.write(`\n${unexpected.length} unexpected diagnostic(s) under TypeScript 7.\n`);
  process.exit(1);
}
process.stdout.write(
  `TypeScript 7 consumer check passed (${diagnostics.length} known upstream diagnostic(s) tolerated).\n`
);
