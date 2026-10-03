/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Security regression suite: `SecretManager` never writes a secret value —
 * nor any substring of 4+ characters of one, nor a credential — to the
 * Pulumi logger, on success, on repeated reads, or on error paths.
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecretManager } from "./secrets.js";

const { mockLogin, mockGetSecret, logCalls } = vi.hoisted(() => {
  const logCalls: string[] = [];
  return { mockLogin: vi.fn(), mockGetSecret: vi.fn(), logCalls };
});

vi.mock("@infisical/sdk", () => ({
  InfisicalSDK: class {
    auth() {
      return { universalAuth: { login: mockLogin } };
    }
    secrets() {
      return { getSecret: mockGetSecret };
    }
  },
}));

vi.mock("@pulumi/pulumi", () => {
  const capture =
    (level: string) =>
    (...args: unknown[]): Promise<void> => {
      logCalls.push(`${level}: ${args.map(a => String(a)).join(" ")}`);
      return Promise.resolve();
    };
  return {
    log: {
      info: capture("info"),
      warn: capture("warn"),
      debug: capture("debug"),
      error: capture("error"),
    },
  };
});

// Distinctive values: no 4-char window of these occurs in any log template.
const SECRET_VALUE = "Zq7XvK2mPw9TcR4nLb8YhJ3s";
const CLIENT_ID = "Cid5Gx8QwErTy2Ui";
const CLIENT_SECRET = "Csx9Vb4NmKj7Hg3FdQ";

const CONTROL_ENV = [
  "INFISICAL_CLIENT_ID",
  "INFISICAL_CLIENT_SECRET",
  "INFISICAL_PROJECT_ID",
  "INFISICAL_SITE_URL",
  "IAC_ENV",
  "IAC_CLOUD",
  "IAC_REGION",
  "IAC_PURPOSE",
  "LEAK_TEST_KEY",
] as const;

/** Every substring of `value` with length ≥ 4 (the minimal windows suffice). */
function windowsOf(value: string, size = 4): string[] {
  const windows: string[] = [];
  for (let i = 0; i + size <= value.length; i++) {
    windows.push(value.substring(i, i + size));
  }
  return windows;
}

function expectNoLeak(output: readonly string[], ...values: string[]): void {
  const joined = output.join("\n");
  for (const value of values) {
    for (const window of windowsOf(value)) {
      expect(joined, `log output leaked '${window}'`).not.toContain(window);
    }
  }
}

describe("SecretManager — never logs secret values", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of CONTROL_ENV) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    logCalls.length = 0;
    mockLogin.mockReset().mockResolvedValue({});
    mockGetSecret.mockReset();
  });

  afterEach(() => {
    for (const key of CONTROL_ENV) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  const useInfisical = (): void => {
    process.env.INFISICAL_CLIENT_ID = CLIENT_ID;
    process.env.INFISICAL_CLIENT_SECRET = CLIENT_SECRET;
    process.env.INFISICAL_PROJECT_ID = "proj-1";
  };

  it("self-check: the harness detects a leaked 4-char window", () => {
    expect(() => expectNoLeak([`token=${SECRET_VALUE.substring(7, 11)}`], SECRET_VALUE)).toThrow();
  });

  describe("success paths", () => {
    it("Infisical hit logs key, env and path — not the value", async () => {
      useInfisical();
      mockGetSecret.mockResolvedValue({ secretValue: SECRET_VALUE });
      const sm = new SecretManager();

      await expect(sm.getSecret("CLOUDFLARE_API_TOKEN")).resolves.toBe(SECRET_VALUE);

      const output = logCalls.join("\n");
      expect(output).toContain("CLOUDFLARE_API_TOKEN");
      expect(output).toContain("env=dev");
      expect(output).toContain("path=/aws");
      expect(output).not.toMatch(/preview/i);
      expectNoLeak(logCalls, SECRET_VALUE, CLIENT_ID, CLIENT_SECRET);
    });

    it("does not log a value length", async () => {
      useInfisical();
      mockGetSecret.mockResolvedValue({ secretValue: SECRET_VALUE });
      const sm = new SecretManager();
      await sm.getSecret("CLOUDFLARE_API_TOKEN");
      expect(logCalls.join("\n")).not.toContain(String(SECRET_VALUE.length));
    });

    it("repeated reads of the same key (warm SDK) still never log the value", async () => {
      useInfisical();
      mockGetSecret.mockResolvedValue({ secretValue: SECRET_VALUE });
      const sm = new SecretManager();

      await sm.getSecret("CLOUDFLARE_API_TOKEN");
      await sm.getSecret("CLOUDFLARE_API_TOKEN");
      await sm.getOptionalSecret("CLOUDFLARE_API_TOKEN", "fallback");

      expect(mockGetSecret).toHaveBeenCalledTimes(3);
      expectNoLeak(logCalls, SECRET_VALUE, CLIENT_ID, CLIENT_SECRET);
    });

    it("environment-variable fallback logs the key only", async () => {
      process.env.LEAK_TEST_KEY = SECRET_VALUE;
      const sm = new SecretManager();

      await expect(sm.getSecret("LEAK_TEST_KEY")).resolves.toBe(SECRET_VALUE);

      expect(logCalls.join("\n")).toContain("LEAK_TEST_KEY");
      expectNoLeak(logCalls, SECRET_VALUE);
    });

    it("getBooleanSecret does not log the raw value", async () => {
      useInfisical();
      mockGetSecret.mockResolvedValue({ secretValue: "true" });
      const sm = new SecretManager();
      await expect(sm.getBooleanSecret("FEATURE_FLAG")).resolves.toBe(true);
      expect(logCalls.join("\n")).not.toMatch(/\btrue\b/);
    });
  });

  describe("error paths", () => {
    it("redacts credentials echoed by a failed Universal Auth login", async () => {
      useInfisical();
      mockLogin.mockRejectedValueOnce(
        new Error(`401 for clientId=${CLIENT_ID} clientSecret=${CLIENT_SECRET}`)
      );
      process.env.LEAK_TEST_KEY = SECRET_VALUE;
      const sm = new SecretManager();

      await expect(sm.getSecret("LEAK_TEST_KEY")).resolves.toBe(SECRET_VALUE);

      const output = logCalls.join("\n");
      expect(output).toContain("Universal Auth login failed");
      expect(output).toContain("[REDACTED]");
      expectNoLeak(logCalls, SECRET_VALUE, CLIENT_ID, CLIENT_SECRET);
    });

    it("redacts credentials echoed by a failed Infisical lookup, then falls back", async () => {
      useInfisical();
      mockGetSecret.mockRejectedValue(
        new Error(`lookup failed (auth ${CLIENT_SECRET}) ${"x".repeat(2000)}`)
      );
      process.env.LEAK_TEST_KEY = SECRET_VALUE;
      const sm = new SecretManager();

      await expect(sm.getSecret("LEAK_TEST_KEY")).resolves.toBe(SECRET_VALUE);

      expect(logCalls.some(line => line.includes("not found in /aws"))).toBe(true);
      expect(logCalls.every(line => line.length < 1000)).toBe(true);
      expectNoLeak(logCalls, SECRET_VALUE, CLIENT_ID, CLIENT_SECRET);
    });

    it("a missing secret throws without values, and nothing leaks to the log", async () => {
      useInfisical();
      mockGetSecret.mockRejectedValue(new Error("not found"));
      const sm = new SecretManager();

      const error = await sm.getSecret("ABSENT_KEY").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain("ABSENT_KEY");
      expectNoLeak([message, ...logCalls], CLIENT_ID, CLIENT_SECRET);
    });

    it("an Infisical hit with a blank value falls back without logging the env value", async () => {
      useInfisical();
      mockGetSecret.mockResolvedValue({ secretValue: "   " });
      process.env.LEAK_TEST_KEY = SECRET_VALUE;
      const sm = new SecretManager();

      await expect(sm.getSecret("LEAK_TEST_KEY")).resolves.toBe(SECRET_VALUE);
      expectNoLeak(logCalls, SECRET_VALUE, CLIENT_ID, CLIENT_SECRET);
    });
  });
});
