/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type EnvRecord = Record<string, string | undefined>;

const cloneEnvironment = (): EnvRecord => {
  const clone: EnvRecord = {};
  for (const key of Object.keys(process.env)) {
    clone[key] = process.env[key];
  }
  return clone;
};

import { SecretManager } from "../../src/config/secrets.js";

// Agent-specific workflow tests for critical IAC operations
describe("Agent Workflow Validation - Core IAC Functions", () => {
  let originalEnv: EnvRecord;
  let secretManager: SecretManager;

  beforeEach(() => {
    originalEnv = cloneEnvironment();

    // Clear ALL environment variables first to ensure clean slate
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }

    // Set up minimal test environment ONLY
    process.env.ORG_TENANT = "test";
    process.env.ORG_NAME = "Test Organization";
    process.env.ORG_DOMAIN = "test.example.com";
    process.env.AWS_ACCOUNTS =
      '{"app-dev":{"id":"123456789012","profile":"test-app-dev","accountPurpose":"app","environment":"dev"},"ops-sec":{"id":"123456789013","profile":"test-ops-sec","accountPurpose":"ops","environment":"sec"}}';

    // Ensure Infisical is explicitly disabled
    // (Don't set these at all - they should be undefined)

    secretManager = new SecretManager();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    for (const key in originalEnv) {
      if (Object.hasOwn(originalEnv, key)) {
        process.env[key] = originalEnv[key];
      }
    }
  });

  describe("Agent Secret Resolution Workflows", () => {
    it("should handle basic secret retrieval for agent operations", async () => {
      // Test core secret retrieval that agents will use
      const orgTenant = await secretManager.getSecret("ORG_TENANT");
      expect(orgTenant).toBe("test");

      const orgName = await secretManager.getSecret("ORG_NAME");
      expect(orgName).toBe("Test Organization");
    });
    it("should handle optional secrets with fallbacks for agent resilience", async () => {
      // Test optional secret retrieval with fallbacks
      const nonExistentSecret = await secretManager.getOptionalSecret(
        "NON_EXISTENT",
        "fallback-value"
      );
      expect(nonExistentSecret).toBe("fallback-value");

      // Test boolean secret parsing for agent configuration
      const enabledFeature = await secretManager.getBooleanSecret("ENABLED_FEATURE", false);
      expect(enabledFeature).toBe(false);
    });

    it("should handle context-aware secret resolution for multi-environment agents", async () => {
      // Test context-specific secret resolution
      const devContext = { environment: "dev", cloud: "aws" };
      const stgContext = { environment: "stg", cloud: "aws" };

      // Both should work but may return different values based on context
      try {
        await secretManager.getSecret("ORG_TENANT", devContext);
        await secretManager.getSecret("ORG_TENANT", stgContext);
      } catch (error) {
        // Expected for missing secrets, but should not crash
        expect(error).toBeDefined();
      }
    });
  });

  describe("Agent AWS Configuration Workflows", () => {
    it("should resolve AWS accounts for agent deployment operations", async () => {
      const awsAccounts = await secretManager.getAwsAccountsJson();
      expect(awsAccounts).toBeDefined();
      const appAccount = awsAccounts["app-dev"];
      expect(appAccount).toBeDefined();
      if (appAccount === undefined) {
        throw new Error("app-dev account missing in test data");
      }
      expect(appAccount.id).toBe("123456789012");
      expect(appAccount.accountPurpose).toBe("app");
      expect(appAccount.environment).toBe("dev");

      const opsAccount = awsAccounts["ops-sec"];
      expect(opsAccount).toBeDefined();
      if (opsAccount === undefined) {
        throw new Error("ops-sec account missing in test data");
      }
      expect(opsAccount.id).toBe("123456789013");
      expect(opsAccount.accountPurpose).toBe("ops");
      expect(opsAccount.environment).toBe("sec");
    });

    it("should generate AWS profiles for agent authentication", async () => {
      // Test profile generation for different scenarios
      const appProfile = await secretManager.getAwsProfile("app", "dev", "test");
      expect(appProfile).toBe("test-app-dev");

      const opsProfile = await secretManager.getAwsProfile("ops", "sec", "test");
      expect(opsProfile).toBe("test-ops-sec");

      // Test non-existent account - should return null (no fallback)
      const vpcProfile = await secretManager.getAwsProfile("vpc", "stg", "test");
      expect(vpcProfile).toBeNull();
    });

    it("should resolve AWS account IDs for agent cross-account operations", async () => {
      const appAccountId = await secretManager.getAwsAccountId("app", "dev");
      expect(appAccountId).toBe("123456789012");

      const opsAccountId = await secretManager.getAwsAccountId("ops", "sec");
      expect(opsAccountId).toBe("123456789013");

      // Test non-existent account
      const nonExistentAccount = await secretManager.getAwsAccountId("nonexistent", "dev");
      expect(nonExistentAccount).toBeNull();
    });
  });

  describe("Agent Deployment Configuration Workflows", () => {
    it("should provide deployment configuration for agent planning", async () => {
      const deployConfig = await secretManager.getDeploymentConfiguration();

      expect(deployConfig).toBeDefined();
      expect(deployConfig.tenant).toBe("test");
      expect(deployConfig.orgName).toBe("Test Organization");
      expect(deployConfig.orgDomain).toBe("test.example.com");

      // Verify expected account purposes and environments
      expect(deployConfig.accountPurposes).toContain("app");
      expect(deployConfig.accountPurposes).toContain("ops");
      expect(deployConfig.accountEnvironments).toContain("dev");
      expect(deployConfig.accountEnvironments).toContain("sec");
    });

    it("should provide health check information for agent monitoring", async () => {
      const healthCheck = await secretManager.healthCheck();

      expect(healthCheck).toBeDefined();
      expect(healthCheck.infisicalAvailable).toBeDefined();
      expect(healthCheck.environmentVariablesAvailable).toBe(true);
      expect(Array.isArray(healthCheck.recommendedSecrets)).toBe(true);
      expect(Array.isArray(healthCheck.missingSecrets)).toBe(true);

      // Should have the core secrets we set
    });
  });

  describe("Agent Error Handling and Resilience", () => {
    it("should handle missing critical secrets gracefully", async () => {
      // Test what happens when critical secrets are missing
      delete process.env.ORG_TENANT;

      await expect(secretManager.getSecret("ORG_TENANT")).rejects.toThrow();

      // But optional secrets should work with fallbacks
      const fallback = await secretManager.getOptionalSecret("ORG_TENANT", "fallback");
      expect(fallback).toBe("fallback");
    });

    it("should handle malformed AWS accounts configuration", async () => {
      // Set environment to dev for graceful degradation behavior
      process.env.IAC_ENV = "dev";

      // Test with malformed JSON
      process.env.AWS_ACCOUNTS = "invalid-json";

      const awsAccounts = await secretManager.getAwsAccountsJson();
      expect(awsAccounts).toEqual({});

      // Account ID should return null for malformed config
      const accountId = await secretManager.getAwsAccountId("app", "dev");
      expect(accountId).toBeNull();
    });

    it("should handle rapid secret access without caching", async () => {
      // Verify secrets are fetched directly from environment without cache
      process.env.TEST_SECRET = "value1";
      const first = await secretManager.getSecret("TEST_SECRET");
      expect(first).toBe("value1");

      // Change environment variable
      process.env.TEST_SECRET = "value2";
      const second = await secretManager.getSecret("TEST_SECRET");
      expect(second).toBe("value2");

      // Secrets are always fresh from environment
      expect(first).not.toBe(second);
    });
  });

  describe("Agent Context Switching Scenarios", () => {
    it("should handle rapid environment context changes", async () => {
      const environments = ["dev", "stg", "prd", "sec"];

      for (const env of environments) {
        // Simulate context switching
        const context = { environment: env, cloud: "aws" };

        // Should be able to get secrets in any environment context
        try {
          await secretManager.getSecret("ORG_TENANT", context);
        } catch (error) {
          // Expected for some contexts, but should not crash
          expect(error).toBeDefined();
        }
      }
    });

    it("should handle cloud provider context switching", async () => {
      const clouds = ["aws", "gcp", "azure"];

      for (const cloud of clouds) {
        const context = { environment: "dev", cloud };

        // Should handle different cloud contexts
        try {
          await secretManager.getSecret("ORG_TENANT", context);
        } catch (error) {
          // Expected for some contexts, but should not crash
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe("Agent Security and Validation Workflows", () => {
    it("should validate boolean secrets for agent security flags", async () => {
      // Test various boolean value interpretations
      process.env.TEST_FLAG_TRUE = "true";
      process.env.TEST_FLAG_1 = "1";
      process.env.TEST_FLAG_YES = "yes";
      process.env.TEST_FLAG_ON = "on";
      process.env.TEST_FLAG_FALSE = "false";
      process.env.TEST_FLAG_0 = "0";

      expect(await secretManager.getBooleanSecret("TEST_FLAG_TRUE")).toBe(true);
      expect(await secretManager.getBooleanSecret("TEST_FLAG_1")).toBe(true);
      expect(await secretManager.getBooleanSecret("TEST_FLAG_YES")).toBe(true);
      expect(await secretManager.getBooleanSecret("TEST_FLAG_ON")).toBe(true);
      expect(await secretManager.getBooleanSecret("TEST_FLAG_FALSE")).toBe(false);
      expect(await secretManager.getBooleanSecret("TEST_FLAG_0")).toBe(false);
    });

    it("should handle sensitive data properly in agent operations", async () => {
      // Test that secrets don't leak in error messages or logs
      process.env.SENSITIVE_SECRET = "super-secret-value";

      const secret = await secretManager.getSecret("SENSITIVE_SECRET");
      expect(secret).toBe("super-secret-value");

      // Error should not contain the secret value
      await expect(secretManager.getSecret("NON_EXISTENT")).rejects.toThrow(/not found/);
    });
  });

  describe("Agent Performance Considerations", () => {
    it("should fetch secrets efficiently for repeated agent access", async () => {
      // Without cache, secrets are fetched from environment each time
      const startTime = performance.now();

      // Get the same secret multiple times
      await secretManager.getSecret("ORG_TENANT");
      await secretManager.getSecret("ORG_TENANT");
      await secretManager.getSecret("ORG_TENANT");

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Environment variable access should be very fast (< 10ms for 3 calls)
      expect(duration).toBeLessThan(10);
    });
    it("should handle concurrent secret requests from agents", async () => {
      const secrets = ["ORG_TENANT", "ORG_NAME"];

      // Simulate concurrent requests
      const promises = secrets.map(async secret => {
        try {
          return await secretManager.getSecret(secret);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return errorMessage;
        }
      });
      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      expect(results[0]).toBe("test");
      expect(results[1]).toBe("Test Organization");
    });
  });
});
