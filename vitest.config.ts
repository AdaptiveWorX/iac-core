/**
 * Copyright (c) Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
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
  esbuild: {
    target: "node24",
  },
});
