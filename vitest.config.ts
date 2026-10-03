/**
 * Copyright (c) Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packagesDir = fileURLToPath(new URL("./packages/", import.meta.url));

export default defineConfig({
  // Workspace packages resolve to their source, never to dist/: their
  // package.json exports point at dist/, which a PR run of `nx affected` may
  // not have built (or may have built from an older commit). Tests and
  // coverage therefore always run against the code under review.
  resolve: {
    alias: [
      // @adaptiveworx/iac-core/{config,schemas,types,utils,validation}/<path>
      {
        find: /^@adaptiveworx\/iac-core\/(config|schemas|types|utils|validation)\/(.+)$/,
        replacement: `${packagesDir}iac-core/src/$1/$2.ts`,
      },
      // @adaptiveworx/<package> (each package's root export)
      {
        find: /^@adaptiveworx\/(iac-[a-z]+)$/,
        replacement: `${packagesDir}$1/src/index.ts`,
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/*/src/**/*.unit.test.{js,ts}",
      "packages/*/src/**/*.integration.test.{js,ts}",
      "packages/*/src/**/*.workflow.test.{js,ts}",
    ],
    exclude: ["node_modules", "dist", "build", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      // Score every source file, not only those a test happened to import, so
      // adding untested code visibly lowers coverage instead of going unseen.
      all: true,
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/*.config.*"],
      // Ratchet floor: set just below current coverage so it blocks
      // regressions, not normal work. Raise these as coverage improves —
      // never lower them. Measure with `pnpm test:coverage`.
      thresholds: {
        statements: 33,
        branches: 36,
        functions: 30,
        lines: 33,
      },
    },
  },
});
