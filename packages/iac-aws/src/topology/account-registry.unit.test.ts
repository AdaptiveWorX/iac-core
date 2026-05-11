/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SecretManager } from "@adaptiveworx/iac-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AwsAccountRegistry } from "./account-registry.js";

/**
 * Builds a minimally-shaped `SecretManager` mock that returns a fixed
 * `AWS_ACCOUNTS` JSON blob and stubs the bag of helpers
 * `getAwsDeploymentConfiguration` reads.
 */
function makeMockSecretManager(accountsJson: object): SecretManager {
  return {
    getOptionalSecret: vi.fn((key: string, fallback: string) =>
      Promise.resolve(key === "AWS_ACCOUNTS" ? JSON.stringify(accountsJson) : fallback)
    ),
    getSecret: vi.fn((key: string) => {
      switch (key) {
        case "ORG_TENANT":
          return Promise.resolve("worx");
        case "ORG_NAME":
          return Promise.resolve("AdaptiveWorX");
        case "ORG_DOMAIN":
          return Promise.resolve("adaptiveworx.com");
        default:
          return Promise.reject(new Error(`unexpected secret: ${key}`));
      }
    }),
    getBooleanSecret: vi.fn(() => Promise.resolve(false)),
  } as unknown as SecretManager;
}

describe("AwsAccountRegistry", () => {
  let registry: AwsAccountRegistry;
  let mockSecretManager: SecretManager;

  beforeEach(() => {
    mockSecretManager = makeMockSecretManager({
      ops: { id: "730335555486", profile: "worx-ops-sec" },
      app: { id: "413639306030", profile: "worx-app-dev" },
    });
    registry = new AwsAccountRegistry({
      secretManager: mockSecretManager,
      accountNamingPrefix: "worx",
    });
  });

  describe("getAccountByName", () => {
    it("returns ops-sec account by profile name", async () => {
      const result = await registry.getAccountByName("worx-ops-sec");
      expect(result?.id).toBe("730335555486");
      expect(result?.profile).toBe("worx-ops-sec");
    });

    it("returns null when account not found", async () => {
      const result = await registry.getAccountByName("does-not-exist");
      expect(result).toBeNull();
    });
  });

  describe("getAccountsForEnvironment", () => {
    it("normalises the account JSON into a Map keyed by profile name", async () => {
      const result = await registry.getAccountsForEnvironment("dev");

      expect(result).toBeInstanceOf(Map);
      expect(result.has("worx-ops-sec")).toBe(true);
      expect(result.get("worx-ops-sec")?.id).toBe("730335555486");
    });

    it("caches accounts per environment", async () => {
      await registry.getAccountsForEnvironment("dev");
      await registry.getAccountsForEnvironment("dev");

      expect(mockSecretManager.getOptionalSecret).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAwsAccountId", () => {
    it("resolves an account ID by purpose+environment", async () => {
      const opsId = await registry.getAwsAccountId("ops", "dev");
      const appId = await registry.getAwsAccountId("app", "dev");

      expect(opsId).toBe("730335555486");
      expect(appId).toBe("413639306030");
    });

    it("returns null for an unknown purpose", async () => {
      const result = await registry.getAwsAccountId("unknown", "dev");
      expect(result).toBeNull();
    });
  });

  describe("clearCache", () => {
    it("clears both the normalised and raw-JSON caches", async () => {
      await registry.getAccountsForEnvironment("dev");
      registry.clearCache();
      await registry.getAccountsForEnvironment("dev");

      // Without the JSON cache being cleared, a second call would still
      // return the cached normalised Map without re-reading. After clear,
      // both layers re-fetch.
      expect(mockSecretManager.getOptionalSecret).toHaveBeenCalledTimes(2);
    });
  });
});
