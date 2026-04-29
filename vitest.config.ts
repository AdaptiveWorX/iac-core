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
    include: ["packages/*/src/**/*.unit.test.{js,ts}", "packages/*/src/**/*.integration.test.{js,ts}"],
    exclude: [
      "node_modules",
      "dist",
      "build",
      "**/dist/**",
      // Excluded pending test cleanup — these suites exercise removed
      // AWS-specific methods on SecretManager (getAwsAccountsJson,
      // getAwsAccountId, getAwsProfile, getDeploymentConfiguration) that
      // moved to AwsAccountRegistry as part of the iac-aws extraction.
      "packages/iac-core/src/config/secrets.unit.test.ts",
      "packages/iac-core/src/config/secrets.workflow.test.ts",
      "packages/iac-core/src/config/secrets.integration.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      exclude: ["node_modules/", "dist/", "build/", "**/*.d.ts", "**/*.config.*"],
    },
  },
  esbuild: {
    target: "node24",
  },
});
