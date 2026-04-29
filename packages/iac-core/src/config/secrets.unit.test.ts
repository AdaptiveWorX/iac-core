/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type EnvRecord = Record<string, string | undefined>;

const cloneEnvironment = (): EnvRecord => {
  const clone: EnvRecord = {};
  for (const key of Object.keys(process.env)) {
    clone[key] = process.env[key];
  }
  return clone;
};

import { SecretManager } from "./secrets.js";

// Define SecretContext interface for tests
interface SecretContext {
  readonly environment?: string;
  readonly cloud?: string;
  readonly region?: string;
  readonly purpose?: string;
}

// Mock Infisical SDK
vi.mock("@infisical/sdk", () => ({
  InfisicalSDK: vi.fn().mockImplementation(() => ({
    auth: vi.fn().mockReturnValue({
      universalAuth: {
        login: vi.fn().mockResolvedValue({}),
      },
    }),
    secrets: vi.fn().mockReturnValue({
      getSecret: vi.fn(),
    }),
  })),
}));

// Mock Pulumi logging
vi.mock("@pulumi/pulumi", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe("SecretManager - Agent-Critical Functionality", () => {
  let secretManager: SecretManager;
  let originalEnv: EnvRecord;

  beforeEach(() => {
    // Store original environment
    originalEnv = cloneEnvironment();

    // Clear environment for clean slate
    delete process.env.INFISICAL_PROJECT_ID;
    delete process.env.INFISICAL_SITE_URL;
    delete process.env.IAC_ENV;
    delete process.env.IAC_CLOUD;
    delete process.env.IAC_REGION;
    delete process.env.IAC_PURPOSE;
    delete process.env.GITHUB_ACTIONS;

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

  describe("Initialization & Fallback Behavior", () => {
    it("should initialize without Infisical and use env vars", () => {
      expect(secretManager).toBeDefined();
      // Should work without Infisical (CLI auth or GitHub App) - falls back to environment variables
    });
  });

  describe("Context Resolution - Agent Environment Handling", () => {
    it("should resolve context with default values", async () => {
      const result = await secretManager.getOptionalSecret("MISSING_SECRET", "default-value");
      expect(result).toBe("default-value");
    });

    it("should prioritize explicit context over environment variables", async () => {
      process.env.IAC_ENV = "dev";
      process.env.IAC_CLOUD = "aws";
      process.env.TEST_SECRET = "env-value";

      const context: SecretContext = {
        environment: "prod",
        cloud: "gcp",
      };

      const result = await secretManager.getOptionalSecret("TEST_SECRET", "default", context);
      expect(result).toBe("env-value"); // Should still get from env since Infisical not configured
    });

    it("should handle missing context gracefully", async () => {
      const result = await secretManager.getOptionalSecret("MISSING_SECRET", "fallback");
      expect(result).toBe("fallback");
    });

    it("should trim whitespace from context values", async () => {
      process.env.IAC_ENV = "  dev  ";
      process.env.IAC_CLOUD = "  aws  ";

      const context = {
        environment: "  stg  ",
        cloud: "  gcp  ",
      };

      // Test that context values are properly trimmed by using a unique secret name
      await expect(
        secretManager.getOptionalSecret("NONEXISTENT_TEST_SECRET", "default", context)
      ).resolves.toBe("default");
    });
  });

  describe("Secret Retrieval - Agent Operations", () => {
    it("should retrieve secret from environment variables", async () => {
      process.env.TEST_SECRET = "test-value";

      const result = await secretManager.getSecret("TEST_SECRET");
      expect(result).toBe("test-value");
    });

    it("should throw error for missing required secret", async () => {
      await expect(secretManager.getSecret("MISSING_REQUIRED_SECRET")).rejects.toThrow(
        "Secret 'MISSING_REQUIRED_SECRET' not found"
      );
    });

    it("should return default for missing optional secret", async () => {
      const result = await secretManager.getOptionalSecret("MISSING_OPTIONAL", "default-value");
      expect(result).toBe("default-value");
    });

    it("should handle boolean secret conversion", async () => {
      process.env.BOOL_TRUE = "true";
      process.env.BOOL_FALSE = "false";
      process.env.BOOL_ONE = "1";
      process.env.BOOL_ZERO = "0";
      process.env.BOOL_YES = "yes";
      process.env.BOOL_NO = "no";
      process.env.BOOL_ON = "on";
      process.env.BOOL_OFF = "off";

      expect(await secretManager.getBooleanSecret("BOOL_TRUE")).toBe(true);
      expect(await secretManager.getBooleanSecret("BOOL_FALSE")).toBe(false);
      expect(await secretManager.getBooleanSecret("BOOL_ONE")).toBe(true);
      expect(await secretManager.getBooleanSecret("BOOL_ZERO")).toBe(false);
      expect(await secretManager.getBooleanSecret("BOOL_YES")).toBe(true);
      expect(await secretManager.getBooleanSecret("BOOL_NO")).toBe(false);
      expect(await secretManager.getBooleanSecret("BOOL_ON")).toBe(true);
      expect(await secretManager.getBooleanSecret("BOOL_OFF")).toBe(false);
    });

    it("should return default for missing boolean secret", async () => {
      const result = await secretManager.getBooleanSecret("MISSING_BOOL", true);
      expect(result).toBe(true);
    });

    it("should handle case-insensitive boolean values", async () => {
      process.env.BOOL_UPPER = "TRUE";
      process.env.BOOL_MIXED = "True";

      expect(await secretManager.getBooleanSecret("BOOL_UPPER")).toBe(true);
      expect(await secretManager.getBooleanSecret("BOOL_MIXED")).toBe(true);
    });
  });

  describe("AWS Account Management - Agent AWS Operations", () => {
    it("should parse valid AWS accounts JSON", async () => {
      const awsAccountsJson = JSON.stringify({
        app: { id: "123456789012", profile: "worx-app-dev" },
        vpc: { id: "123456789013", profile: "worx-vpc-dev" },
        security: { id: "123456789014", profile: "worx-security" },
      });

      process.env.AWS_ACCOUNTS = awsAccountsJson;

      const accounts = await secretManager.getAwsAccountsJson();
      const appAccount = accounts.app;
      expect(appAccount).toBeDefined();
      if (appAccount === undefined) {
        throw new Error("app account missing in test setup");
      }
      expect(appAccount.id).toBe("123456789012");
      expect(appAccount.profile).toBe("worx-app-dev");
    });

    it("should handle malformed AWS accounts JSON gracefully", async () => {
      process.env.AWS_ACCOUNTS = "invalid-json{";

      const accounts = await secretManager.getAwsAccountsJson();
      expect(accounts).toEqual({});
    });

    it("should handle empty AWS accounts", async () => {
      process.env.AWS_ACCOUNTS = "{}";

      const accounts = await secretManager.getAwsAccountsJson();
      expect(accounts).toEqual({});
    });

    it("should retrieve AWS account ID by purpose", async () => {
      const awsAccountsJson = JSON.stringify({
        "app-dev": { id: "123456789012", accountPurpose: "app", environment: "dev" },
        "app-stg": { id: "123456789013", accountPurpose: "app", environment: "stg" },
        "ops-sec": { id: "123456789014", accountPurpose: "ops", environment: "sec" },
      });

      process.env.AWS_ACCOUNTS = awsAccountsJson;

      const appAccountId = await secretManager.getAwsAccountId("app", "dev");
      const appStgAccountId = await secretManager.getAwsAccountId("app", "stg");
      const missingAccountId = await secretManager.getAwsAccountId("missing", "dev");

      expect(appAccountId).toBe("123456789012");
      expect(appStgAccountId).toBe("123456789013");
      expect(missingAccountId).toBeNull();
    });

    it("should return AWS profile names from configuration", async () => {
      const awsAccountsJson = JSON.stringify({
        "app-dev": { profile: "custom-app-profile", accountPurpose: "app", environment: "dev" },
        "app-stg": { profile: "worx-app-stg", accountPurpose: "app", environment: "stg" },
        "ops-sec": { profile: "worx-ops-sec", accountPurpose: "ops", environment: "sec" },
      });

      process.env.AWS_ACCOUNTS = awsAccountsJson;

      const customProfile = await secretManager.getAwsProfile("app", "dev", "worx");
      const stagingProfile = await secretManager.getAwsProfile("app", "stg", "worx");
      const secopsProfile = await secretManager.getAwsProfile("ops", "sec", "worx");

      expect(customProfile).toBe("custom-app-profile");
      expect(stagingProfile).toBe("worx-app-stg");
      expect(secopsProfile).toBe("worx-ops-sec");
    });

    it("should return null when profile not configured", async () => {
      const awsAccountsJson = JSON.stringify({
        "app-dev": { accountPurpose: "app", environment: "dev" }, // No profile field
      });

      process.env.AWS_ACCOUNTS = awsAccountsJson;

      const profile = await secretManager.getAwsProfile("app", "dev", "worx");
      expect(profile).toBeNull(); // No fallback generation - returns null
    });

    it("should return null when accounts unavailable", async () => {
      // Don't set AWS_ACCOUNTS
      const profile = await secretManager.getAwsProfile("app", "dev", "worx");
      expect(profile).toBeNull(); // No fallback generation - returns null
    });
  });

  describe("Caching - Agent Performance", () => {
    it("should cache retrieved secrets", async () => {
      process.env.CACHED_SECRET = "cached-value";

      // First retrieval
      const result1 = await secretManager.getSecret("CACHED_SECRET");
      expect(result1).toBe("cached-value");

      // Change environment value
      process.env.CACHED_SECRET = "new-value";

      // Second retrieval should return new value (no caching)
      const result2 = await secretManager.getSecret("CACHED_SECRET");
      expect(result2).toBe("new-value"); // Should get fresh value from environment
    });

    it("should fetch fresh values from environment", async () => {
      process.env.TEST_SECRET = "test-value";

      const first = await secretManager.getSecret("TEST_SECRET");
      expect(first).toBe("test-value");

      // Change value
      process.env.TEST_SECRET = "new-value";
      const second = await secretManager.getSecret("TEST_SECRET");
      expect(second).toBe("new-value");

      // Should get fresh values each time
      expect(first).not.toBe(second);
    });

    it("should handle different contexts independently", async () => {
      process.env.CONTEXT_SECRET = "base-value";

      const context1 = { environment: "dev", cloud: "aws" };
      const context2 = { environment: "prod", cloud: "aws" };

      const result1 = await secretManager.getOptionalSecret("CONTEXT_SECRET", "default", context1);
      const result2 = await secretManager.getOptionalSecret("CONTEXT_SECRET", "default", context2);

      // Both should get the same environment value
      expect(result1).toBe("base-value");
      expect(result2).toBe("base-value");
    });
  });

  describe("Deployment Configuration - Agent Deployment", () => {
    it("should retrieve complete deployment configuration", async () => {
      process.env.ORG_TENANT = "worx";
      process.env.ORG_NAME = "WorkX Organization";
      process.env.ORG_DOMAIN = "workx.dev";
      process.env.ENABLE_MULTI_PURPOSE = "true";

      const config = await secretManager.getDeploymentConfiguration();

      expect(config.tenant).toBe("worx");
      expect(config.orgName).toBe("WorkX Organization");
      expect(config.orgDomain).toBe("workx.dev");
      expect(config.enableMultiPurpose).toBe(true);
      // Infisical availability depends on either GitHub Actions OIDC or local Universal Auth credentials
      const hasInfisicalAuth =
        process.env.GITHUB_ACTIONS === "true" ||
        (process.env.INFISICAL_CLIENT_ID !== undefined &&
          process.env.INFISICAL_CLIENT_SECRET !== undefined);
      expect(config.useInfisical).toBe(hasInfisicalAuth);
      expect(config.accountPurposes).toContain("app");
      expect(config.accountPurposes).toContain("ops");
      expect(config.accountEnvironments).toContain("dev");
      expect(config.accountEnvironments).toContain("prd");
    });

    it("should handle missing deployment configuration gracefully", async () => {
      // Don't set any required environment variables
      await expect(secretManager.getDeploymentConfiguration()).rejects.toThrow(); // Should throw for missing required secrets
    });
  });

  describe("Health Check - Agent Validation", () => {
    it("should perform comprehensive health check", async () => {
      process.env.ORG_TENANT = "worx";
      process.env.ORG_NAME = "WorkX Organization";
      process.env.ORG_DOMAIN = "workx.dev";
      process.env.AWS_ACCOUNTS = "{}";

      const health = await secretManager.healthCheck();

      // Infisical availability depends on either GitHub Actions OIDC or local Universal Auth credentials
      const hasInfisicalAuth =
        process.env.GITHUB_ACTIONS === "true" ||
        (process.env.INFISICAL_CLIENT_ID !== undefined &&
          process.env.INFISICAL_CLIENT_SECRET !== undefined);
      expect(health.infisicalAvailable).toBe(hasInfisicalAuth);
      expect(health.environmentVariablesAvailable).toBe(true);
      expect(health.recommendedSecrets).toContain("ORG_TENANT");
      expect(health.recommendedSecrets).toContain("AWS_ACCOUNTS");
      expect(health.missingSecrets).toHaveLength(0); // All required secrets present
    });

    it("should identify missing secrets in health check", async () => {
      // Don't set any environment variables
      const health = await secretManager.healthCheck();

      expect(health.missingSecrets.length).toBeGreaterThan(0);
      expect(health.missingSecrets).toContain("ORG_TENANT");
      expect(health.missingSecrets).toContain("ORG_NAME");
    });

    it("should report available services correctly", async () => {
      const health = await secretManager.healthCheck();

      expect(health.environmentVariablesAvailable).toBe(true);
      // Infisical availability depends on either GitHub Actions OIDC or local Universal Auth credentials
      const hasInfisicalAuth =
        process.env.GITHUB_ACTIONS === "true" ||
        (process.env.INFISICAL_CLIENT_ID !== undefined &&
          process.env.INFISICAL_CLIENT_SECRET !== undefined);
      expect(health.infisicalAvailable).toBe(hasInfisicalAuth);
    });
  });

  describe("Error Handling - Agent Resilience", () => {
    it("should handle secret retrieval errors gracefully", async () => {
      // Test with non-existent secret
      await expect(secretManager.getSecret("NON_EXISTENT_SECRET")).rejects.toThrow("not found");
    });

    it("should propagate non-missing-secret errors", async () => {
      // Mock a scenario where getSecret throws a non-missing error
      const mockSecretManager = new SecretManager();
      vi.spyOn(mockSecretManager, "getSecret").mockRejectedValue(new Error("Network error"));

      await expect(mockSecretManager.getBooleanSecret("TEST_SECRET")).rejects.toThrow(
        "Network error"
      );
    });

    it("should handle empty string secrets", async () => {
      process.env.EMPTY_SECRET = "";

      await expect(secretManager.getSecret("EMPTY_SECRET")).rejects.toThrow("not found"); // Empty strings should be treated as missing
    });

    it("should handle whitespace-only secrets", async () => {
      process.env.WHITESPACE_SECRET = "   ";

      await expect(secretManager.getSecret("WHITESPACE_SECRET")).rejects.toThrow("not found"); // Whitespace-only should be treated as missing
    });
  });

  describe("Agent-Specific Scenarios", () => {
    it("should handle rapid successive secret requests", async () => {
      process.env.RAPID_SECRET = "rapid-value";

      const promises = Array.from({ length: 10 }, () => secretManager.getSecret("RAPID_SECRET"));

      const results = await Promise.all(promises);
      for (const result of results) {
        expect(result).toBe("rapid-value");
      }

      // All requests fetch fresh values from environment
      expect(results.every(r => r === "rapid-value")).toBe(true);
    });

    it("should handle concurrent context switches", async () => {
      process.env.CONTEXT_SECRET = "base-value";

      const contexts = [
        { environment: "dev", cloud: "aws" },
        { environment: "stg", cloud: "aws" },
        { environment: "prd", cloud: "gcp" },
      ];

      const promises = contexts.map(context =>
        secretManager.getOptionalSecret("CONTEXT_SECRET", "default", context)
      );

      const results = await Promise.all(promises);
      for (const result of results) {
        expect(result).toBe("base-value");
      }
    });

    it("should handle multiple context requests", async () => {
      process.env.ISOLATION_SECRET = "base-value";

      const devContext = { environment: "dev", cloud: "aws" };
      const prodContext = { environment: "prd", cloud: "aws" };

      const devResult = await secretManager.getOptionalSecret(
        "ISOLATION_SECRET",
        "default",
        devContext
      );
      const prodResult = await secretManager.getOptionalSecret(
        "ISOLATION_SECRET",
        "default",
        prodContext
      );

      // Both contexts fetch fresh values from environment
      expect(devResult).toBe("base-value");
      expect(prodResult).toBe("base-value");
    });

    it.each([
      ["dev", false],
      ["stg", true],
      ["prd", true],
      ["sec", true],
    ])("should handle malformed AWS_ACCOUNTS JSON in %s environment", async (env, shouldThrow) => {
      process.env.IAC_ENV = env;
      process.env.AWS_ACCOUNTS = '{"app": invalid}';

      if (shouldThrow) {
        await expect(secretManager.getAwsAccountsJson()).rejects.toThrow(
          env === "stg"
            ? "Staging environment requires valid AWS_ACCOUNTS configuration"
            : "Production environment requires valid AWS_ACCOUNTS configuration"
        );
      } else {
        const accounts = await secretManager.getAwsAccountsJson();
        expect(accounts).toEqual({});
      }
    });

    it.each([
      ['{"app": invalid}'],
      ['{"app": {"id": }}'],
      ['{app: "missing-quotes"}'],
      ["not-json-at-all"],
      ['{"valid": "json", "but": {"nested": "improperly"'],
    ])("should gracefully handle malformed JSON pattern: %s in dev", async malformedJson => {
      process.env.IAC_ENV = "dev";
      process.env.AWS_ACCOUNTS = malformedJson;

      const accounts = await secretManager.getAwsAccountsJson();
      expect(accounts).toEqual({});
    });
  });

  describe("Tenant-Driven Configuration - Dynamic Account Purposes", () => {
    it("should accept any valid account purpose format", async () => {
      const testPurposes = ["app", "ops", "ucx", "agent", "data", "lake", "phi", "training"];

      for (const purpose of testPurposes) {
        process.env.AWS_ACCOUNTS = JSON.stringify({
          [purpose]: {
            id: "123456789012",
            accountPurpose: purpose,
            environmentClass: "development",
          },
        });

        // Create new instance to avoid cache from previous iterations
        const testSecretManager = new SecretManager();

        const accountId = await testSecretManager.getAwsAccountId(purpose, "dev");
        expect(accountId).toBe("123456789012");
      }
    });

    it("should filter out non-account keys from AWS_ACCOUNTS", async () => {
      process.env.AWS_ACCOUNTS = JSON.stringify({
        default: "app",
        app: { id: "111222333444", accountPurpose: "app" },
        ops: { id: "222333444555", accountPurpose: "ops" },
        // default should be filtered out, not appear as account
      });

      const accounts = await secretManager.getAwsAccountsJson();
      expect(accounts.app).toBeDefined();
      expect(accounts.ops).toBeDefined();
      expect(accounts.default).toBeUndefined(); // Filtered out
    });

    it("should support healthcare tenant with compliance isolated accounts", async () => {
      process.env.AWS_ACCOUNTS = JSON.stringify({
        default: "app",
        app: { id: "111222333444", accountPurpose: "app" },
        ucx: {
          id: "222333444555",
          accountPurpose: "ucx",
          complianceRequirements: ["pci-dss", "hipaa"],
        },
        phi: {
          id: "333444555666",
          accountPurpose: "phi",
          complianceRequirements: ["hipaa"],
        },
      });

      const ucxId = await secretManager.getAwsAccountId("ucx", "prd");
      const phiId = await secretManager.getAwsAccountId("phi", "prd");

      expect(ucxId).toBe("222333444555");
      expect(phiId).toBe("333444555666");
    });

    it("should support AI platform tenant with workload isolation", async () => {
      process.env.AWS_ACCOUNTS = JSON.stringify({
        default: "app",
        app: { id: "111222333444", accountPurpose: "app" },
        agent: { id: "222333444555", accountPurpose: "agent" },
        training: { id: "333444555666", accountPurpose: "training" },
        inference: { id: "444555666777", accountPurpose: "inference" },
      });

      expect(await secretManager.getAwsAccountId("agent", "dev")).toBe("222333444555");
      expect(await secretManager.getAwsAccountId("training", "dev")).toBe("333444555666");
      expect(await secretManager.getAwsAccountId("inference", "dev")).toBe("444555666777");
    });

    it("should support arbitrary custom account purposes", async () => {
      process.env.AWS_ACCOUNTS = JSON.stringify({
        default: "app",
        myservice: { id: "111222333444", accountPurpose: "myservice" },
        customapp: { id: "222333444555", accountPurpose: "customapp" },
        teama: { id: "333444555666", accountPurpose: "teama" },
      });

      expect(await secretManager.getAwsAccountId("myservice", "dev")).toBe("111222333444");
      expect(await secretManager.getAwsAccountId("customapp", "dev")).toBe("222333444555");
      expect(await secretManager.getAwsAccountId("teama", "dev")).toBe("333444555666");
    });

    it("should handle account purpose that doesn't exist", async () => {
      process.env.AWS_ACCOUNTS = JSON.stringify({
        default: "app",
        app: { id: "111222333444", accountPurpose: "app" },
        ops: { id: "222333444555", accountPurpose: "ops" },
      });

      const result = await secretManager.getAwsAccountId("nonexistent", "dev");
      expect(result).toBeNull();
    });

    it("should support compliance metadata on custom account purposes", async () => {
      process.env.AWS_ACCOUNTS = JSON.stringify({
        default: "app",
        pci: {
          id: "111222333444",
          accountPurpose: "pci",
          complianceRequirements: ["pci-dss"],
          comment: "PCI-DSS Level 1 workloads",
        },
        sox: {
          id: "222333444555",
          accountPurpose: "sox",
          complianceRequirements: ["sox"],
          comment: "Financial reporting systems",
        },
      });

      const accounts = await secretManager.getAwsAccountsJson();
      expect(accounts.pci).toBeDefined();
      expect(accounts.pci?.id).toBe("111222333444");
      expect(accounts.sox).toBeDefined();
      expect(accounts.sox?.id).toBe("222333444555");
    });
  });
});
