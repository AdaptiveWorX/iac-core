/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SecretManager } from "@adaptiveworx/iac-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AwsAccountRegistry, parseAwsAccountsJson } from "./account-registry.js";

const { logCalls } = vi.hoisted(() => ({ logCalls: [] as string[] }));

vi.mock("@pulumi/pulumi", async importOriginal => {
  const actual = await importOriginal<typeof import("@pulumi/pulumi")>();
  const capture =
    (level: string) =>
    (...args: unknown[]): Promise<void> => {
      logCalls.push(`${level}: ${args.map(a => String(a)).join(" ")}`);
      return Promise.resolve();
    };
  return {
    ...actual,
    log: {
      info: capture("info"),
      warn: capture("warn"),
      debug: capture("debug"),
      error: capture("error"),
    },
  };
});

/** Fails if any 4-character window of `value` appears in `output`. */
function expectNoLeak(output: readonly string[], value: string): void {
  const joined = output.join("\n");
  for (let i = 0; i + 4 <= value.length; i++) {
    const window = value.substring(i, i + 4);
    expect(joined, `output leaked '${window}'`).not.toContain(window);
  }
}

/** Malformed AWS_ACCOUNTS blob carrying a distinctive marker V8 would echo. */
const LEAKY_MARKER = "Qz8RwT5yUi3PkL";
const MALFORMED_ACCOUNTS = `{"ops": {"id": "1", "email": ${LEAKY_MARKER}}}`;

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

  describe("never logs AWS_ACCOUNTS contents", () => {
    beforeEach(() => {
      logCalls.length = 0;
    });

    it("dev: a malformed blob warns without echoing its contents", () => {
      expect(parseAwsAccountsJson(MALFORMED_ACCOUNTS, "dev")).toEqual({});
      expect(logCalls.join("\n")).toContain("not valid JSON");
      expectNoLeak(logCalls, LEAKY_MARKER);
    });

    it("prd: the thrown error and the error log withhold the contents", () => {
      let thrown: unknown;
      try {
        parseAwsAccountsJson(MALFORMED_ACCOUNTS, "prd");
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expectNoLeak([(thrown as Error).message, ...logCalls], LEAKY_MARKER);
    });

    it("registry: first read and cache hit both stay silent about contents", async () => {
      const sm = {
        getOptionalSecret: vi.fn(() => Promise.resolve(MALFORMED_ACCOUNTS)),
      } as unknown as SecretManager;
      const reg = new AwsAccountRegistry({ secretManager: sm, accountNamingPrefix: "worx" });

      await expect(reg.getAccountsForEnvironment("dev")).resolves.toEqual(new Map());
      await expect(reg.getAccountsForEnvironment("dev")).resolves.toEqual(new Map());
      await reg.getAwsProfile("ops", "dev");

      expect(sm.getOptionalSecret).toHaveBeenCalledTimes(1);
      expectNoLeak(logCalls, LEAKY_MARKER);
    });

    it("registry: a production parse failure is logged without contents", async () => {
      const sm = {
        getOptionalSecret: vi.fn(() => Promise.resolve(MALFORMED_ACCOUNTS)),
      } as unknown as SecretManager;
      const reg = new AwsAccountRegistry({ secretManager: sm, accountNamingPrefix: "worx" });

      await expect(reg.getAccountsForEnvironment("prd")).resolves.toEqual(new Map());
      await reg.getAwsProfile("ops", "prd");

      expect(logCalls.length).toBeGreaterThan(0);
      expectNoLeak(logCalls, LEAKY_MARKER);
    });
  });
});
