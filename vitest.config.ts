/**
 * Copyright (c) Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/src/**/*.unit.test.{js,ts}", "packages/*/src/**/*.integration.test.{js,ts}"],
    exclude: ["node_modules", "dist", "build", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      exclude: ["node_modules/", "dist/", "build/", "**/*.d.ts", "**/*.config.*"],
    },
  },
  esbuild: {
    target: "node22",
  },
});
