/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretManager } from "./secrets.js";

type EnvRecord = Record<string, string | undefined>;

const cloneEnvironment = (): EnvRecord => {
  const clone: EnvRecord = {};
  for (const key of Object.keys(process.env)) {
    clone[key] = process.env[key];
  }
  return clone;
};

/**
 * Integration tests for SecretManager
 *
 * These tests verify that SecretManager correctly integrates with:
 * - Real Infisical service (when credentials available)
 * - Environment variable fallbacks (when Infisical unavailable)
 * - Caching layer
 * - AWS account resolution
 */
describe("SecretManager Integration Tests", () => {
  let originalEnv: EnvRecord;
  let secretManager: SecretManager;

  beforeEach(() => {
    originalEnv = cloneEnvironment();
    secretManager = new SecretManager();
  });

  afterEach(() => {
    // Restore original environment
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    for (const key in originalEnv) {
      if (Object.hasOwn(originalEnv, key)) {
        process.env[key] = originalEnv[key];
      }
    }
  });

  describe("Infisical Integration", () => {
    it("should connect to Infisical when credentials are available", async () => {
      // This test uses real Infisical credentials from the environment
      const healthCheck = await secretManager.healthCheck();

      expect(healthCheck).toBeDefined();
      expect(typeof healthCheck.infisicalAvailable).toBe("boolean");

      // If Infisical is configured with Universal Auth credentials, should be available
      const hasUniversalAuthCredentials =
        process.env.INFISICAL_CLIENT_ID !== undefined &&
        process.env.INFISICAL_CLIENT_SECRET !== undefined;

      if (hasUniversalAuthCredentials) {
        expect(healthCheck.infisicalAvailable).toBe(true);
      }
    });

    it("should retrieve deployment configuration from Infisical", async () => {
      // Skip if Infisical is not available (no Universal Auth credentials)
      const hasUniversalAuthCredentials = process.env.INFISICAL_CLIENT_ID !== undefined;

      if (!hasUniversalAuthCredentials) {
        // Skip test if no Infisical access
        return;
      }

      const config = await secretManager.getDeploymentConfiguration();

      expect(config).toBeDefined();
      expect(Array.isArray(config.accountEnvironments)).toBe(true);
      expect(config.accountEnvironments.length).toBeGreaterThan(0);
    });
  });

  describe("Environment Variable Fallback", () => {
    beforeEach(() => {
      // Disable Infisical to test environment variable fallback
      delete process.env.INFISICAL_PROJECT_ID;
      delete process.env.GITHUB_ACTIONS;
    });

    it("should fall back to environment variables when Infisical unavailable", async () => {
      const testValue = "test-value-12345";
      process.env.TEST_SECRET = testValue;

      const manager = new SecretManager();
      const value = await manager.getOptionalSecret("TEST_SECRET", "default-value");

      expect(value).toBe(testValue);
    });

    it("should return default value when secret not found", async () => {
      const manager = new SecretManager();
      const value = await manager.getOptionalSecret("NONEXISTENT_SECRET", "my-default");

      expect(value).toBe("my-default");
    });
  });

  describe("AWS Account Resolution", () => {
    beforeEach(() => {
      // Disable Infisical for predictable testing
      delete process.env.INFISICAL_PROJECT_ID;
      delete process.env.GITHUB_ACTIONS;
    });

    it("should resolve AWS profile for known accounts", async () => {
      // Set up test AWS_ACCOUNTS configuration
      process.env.AWS_ACCOUNTS = JSON.stringify({
        "app-dev": {
          id: "413639306030",
          profile: "worx-app-dev",
          accountPurpose: "app",
          environment: "dev",
        },
        "ops-sec": {
          id: "730335555486",
          profile: "worx-ops-sec",
          accountPurpose: "ops",
          environment: "sec",
        },
      });

      const manager = new SecretManager();

      const appDevProfile = await manager.getAwsProfile("app", "dev", "worx");
      expect(appDevProfile).toBe("worx-app-dev");

      const opsSecProfile = await manager.getAwsProfile("ops", "sec", "worx");
      expect(opsSecProfile).toBe("worx-ops-sec");
    });

    it("should resolve AWS account ID for known accounts", async () => {
      process.env.AWS_ACCOUNTS = JSON.stringify({
        "app-dev": {
          id: "413639306030",
          profile: "worx-app-dev",
          accountPurpose: "app",
          environment: "dev",
        },
      });

      const manager = new SecretManager();
      const accountId = await manager.getAwsAccountId("app", "dev");

      expect(accountId).toBe("413639306030");
    });

    it("should return null for unknown account combinations", async () => {
      process.env.AWS_ACCOUNTS = JSON.stringify({
        "app-dev": {
          id: "413639306030",
          profile: "worx-app-dev",
          accountPurpose: "app",
          environment: "dev",
        },
      });

      const manager = new SecretManager();
      const unknownProfile = await manager.getAwsProfile("vpc", "stg", "worx");

      expect(unknownProfile).toBe(null);
    });

    it("should handle underscore format in account keys", async () => {
      process.env.AWS_ACCOUNTS = JSON.stringify({
        app_dev: {
          id: "413639306030",
          profile: "worx-app-dev",
          accountPurpose: "app",
          environment: "dev",
        },
      });

      const manager = new SecretManager();
      const profile = await manager.getAwsProfile("app", "dev", "worx");

      // Should resolve app_dev even when querying with hyphen format
      expect(profile).toBe("worx-app-dev");
    });
  });

  describe("GitHub Actions Integration", () => {
    beforeEach(() => {
      // Simulate GitHub Actions environment with Universal Auth credentials
      process.env.GITHUB_ACTIONS = "true";
      // Universal Auth credentials are set via GitHub secrets (same as local dev)
      // INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET should already be set
    });

    afterEach(() => {
      delete process.env.GITHUB_ACTIONS;
    });

    it("should detect GitHub Actions and authenticate with Universal Auth", async () => {
      const manager = new SecretManager();
      const health = await manager.healthCheck();

      // In GitHub Actions, Infisical should be available via Universal Auth (same as local dev)
      expect(health.infisicalAvailable).toBe(true);
    });

    it("should report useInfisical=true in deployment config", async () => {
      process.env.ORG_TENANT = "worx";
      process.env.ORG_NAME = "WorkX";
      process.env.ORG_DOMAIN = "workx.dev";
      process.env.AWS_ACCOUNTS = "{}";

      const manager = new SecretManager();
      const config = await manager.getDeploymentConfiguration();

      // GitHub Actions uses Universal Auth (same credentials as local dev)
      expect(config.useInfisical).toBe(true);
      expect(config.tenant).toBe("worx");
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      // Disable Infisical for error handling tests
      delete process.env.INFISICAL_CLIENT_ID;
      delete process.env.INFISICAL_CLIENT_SECRET;
      delete process.env.INFISICAL_PROJECT_ID;
    });

    it("should handle malformed AWS_ACCOUNTS JSON gracefully", async () => {
      // Disable persistent cache to ensure we're testing environment variable behavior
      process.env.IAC_CACHE_ENABLED = "false";
      process.env.IAC_ENV = "dev"; // Set environment to dev for graceful degradation
      process.env.AWS_ACCOUNTS = "not-valid-json";

      const manager = new SecretManager();

      // Should not throw, but return null (graceful degradation in dev)
      const profile = await manager.getAwsProfile("app", "dev", "worx");
      expect(profile).toBe(null);
    });

    it("should handle missing environment gracefully", async () => {
      const manager = new SecretManager();

      // Should not throw
      const healthCheck = await manager.healthCheck();

      // When no credentials are set, Infisical should not be available
      expect(healthCheck.infisicalAvailable).toBe(false);
    });
  });

  describe("Real Infrastructure Integration", () => {
    it("should resolve real worx accounts when Infisical is available", async () => {
      // Check if Infisical is available with Universal Auth credentials
      const hasUniversalAuthCredentials = process.env.INFISICAL_CLIENT_ID !== undefined;

      if (!hasUniversalAuthCredentials) {
        // Skip if no Infisical credentials
        return;
      }

      // These are real accounts that should exist in Infisical
      const devProfile = await secretManager.getAwsProfile("app", "dev", "worx");
      const secProfile = await secretManager.getAwsProfile("ops", "sec", "worx");

      // Should not be null when Infisical is configured
      expect(devProfile).not.toBe(null);
      expect(secProfile).not.toBe(null);

      // Should match expected naming pattern
      if (devProfile !== null) {
        expect(devProfile).toMatch(/^worx-.*-dev$/);
      }
      if (secProfile !== null) {
        expect(secProfile).toMatch(/^worx-.*-sec$/);
      }
    });
  });
});
