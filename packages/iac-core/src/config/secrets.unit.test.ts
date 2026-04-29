/**
 * AdaptiveWorX™ Flux
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSecretManager, SecretManager, secretManager } from "./secrets.js";

type EnvSnapshot = Record<string, string | undefined>;

const snapshotEnv = (): EnvSnapshot => {
  const snap: EnvSnapshot = {};
  for (const key of Object.keys(process.env)) {
    snap[key] = process.env[key];
  }
  return snap;
};

const restoreEnv = (snap: EnvSnapshot): void => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  for (const key in snap) {
    if (Object.hasOwn(snap, key)) {
      process.env[key] = snap[key];
    }
  }
};

const clearControlEnv = (): void => {
  for (const key of [
    "INFISICAL_CLIENT_ID",
    "INFISICAL_CLIENT_SECRET",
    "INFISICAL_PROJECT_ID",
    "INFISICAL_SITE_URL",
    "IAC_ENV",
    "IAC_CLOUD",
    "IAC_REGION",
    "IAC_PURPOSE",
    "GITHUB_ACTIONS",
  ]) {
    delete process.env[key];
  }
};

// Hoisted Infisical mock — login & getSecret are spies tests can configure.
const { mockLogin, mockGetSecret, ConstructorSpy } = vi.hoisted(() => {
  const mockLogin = vi.fn();
  const mockGetSecret = vi.fn();
  const ConstructorSpy = vi.fn();
  return { mockLogin, mockGetSecret, ConstructorSpy };
});

vi.mock("@infisical/sdk", () => {
  return {
    InfisicalSDK: vi.fn().mockImplementation((...args: unknown[]) => {
      ConstructorSpy(...args);
      return {
        auth: () => ({ universalAuth: { login: mockLogin } }),
        secrets: () => ({ getSecret: mockGetSecret }),
      };
    }),
  };
});

vi.mock("@pulumi/pulumi", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe("SecretManager — current API", () => {
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
    clearControlEnv();
    mockLogin.mockReset().mockResolvedValue({});
    mockGetSecret.mockReset();
    ConstructorSpy.mockReset();
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  describe("constructor", () => {
    it("constructs with no arguments", () => {
      expect(() => new SecretManager()).not.toThrow();
    });

    it("accepts a default context", () => {
      const sm = new SecretManager({ environment: "stg", cloud: "azure" });
      expect(sm).toBeInstanceOf(SecretManager);
    });

    it("kicks off Infisical SDK init eagerly when client creds are present", () => {
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      // Construct + immediately drop — InfisicalSDK should be instantiated.
      void new SecretManager();
      expect(ConstructorSpy).toHaveBeenCalledTimes(1);
    });

    it("honors INFISICAL_SITE_URL when set", async () => {
      process.env.INFISICAL_SITE_URL = "https://infisical.example.com";
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      const sm = new SecretManager();
      // Force initialization by triggering a getSecret call (env fallback).
      process.env.SOMEKEY = "value";
      await sm.getSecret("SOMEKEY");
      expect(ConstructorSpy).toHaveBeenCalledWith({ siteUrl: "https://infisical.example.com" });
    });
  });

  describe("getSecret — environment-variable path", () => {
    it("returns the env-var value when set", async () => {
      process.env.MY_SECRET = "hello";
      const sm = new SecretManager();
      await expect(sm.getSecret("MY_SECRET")).resolves.toBe("hello");
    });

    it("trims surrounding whitespace from the value", async () => {
      process.env.PADDED = "  padded-value  ";
      const sm = new SecretManager();
      await expect(sm.getSecret("PADDED")).resolves.toBe("padded-value");
    });

    it("throws when the env var is missing", async () => {
      const sm = new SecretManager();
      await expect(sm.getSecret("DEFINITELY_MISSING")).rejects.toThrow(
        /Secret 'DEFINITELY_MISSING' not found/
      );
    });

    it("treats empty-string env vars as missing", async () => {
      process.env.EMPTY = "";
      const sm = new SecretManager();
      await expect(sm.getSecret("EMPTY")).rejects.toThrow(/not found/);
    });

    it("treats whitespace-only env vars as missing", async () => {
      process.env.SPACES = "   \t  ";
      const sm = new SecretManager();
      await expect(sm.getSecret("SPACES")).rejects.toThrow(/not found/);
    });
  });

  describe("getSecret — Infisical path", () => {
    beforeEach(() => {
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj-1";
    });

    it("returns the value when Infisical resolves it", async () => {
      mockGetSecret.mockResolvedValueOnce({ secretValue: "from-infisical" });
      const sm = new SecretManager();
      await expect(sm.getSecret("API_KEY")).resolves.toBe("from-infisical");
      expect(mockGetSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          secretName: "API_KEY",
          projectId: "proj-1",
          environment: "dev",
          secretPath: "/aws",
        })
      );
    });

    it("walks the path list and falls back from /{cloud} to /", async () => {
      mockGetSecret
        .mockRejectedValueOnce(new Error("not found in /aws"))
        .mockResolvedValueOnce({ secretValue: "from-root" });
      const sm = new SecretManager();
      await expect(sm.getSecret("ROOT_KEY")).resolves.toBe("from-root");
      expect(mockGetSecret).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ secretPath: "/aws" })
      );
      expect(mockGetSecret).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ secretPath: "/" })
      );
    });

    it("falls through to env vars if every Infisical path misses", async () => {
      mockGetSecret.mockRejectedValue(new Error("not found"));
      process.env.FALLTHROUGH = "from-env";
      const sm = new SecretManager();
      await expect(sm.getSecret("FALLTHROUGH")).resolves.toBe("from-env");
      // Both /aws and / were queried before the env fallback.
      expect(mockGetSecret).toHaveBeenCalledTimes(2);
    });

    it("falls through to env vars when login fails", async () => {
      mockLogin.mockRejectedValueOnce(new Error("auth boom"));
      process.env.AUTH_FAIL = "from-env";
      const sm = new SecretManager();
      await expect(sm.getSecret("AUTH_FAIL")).resolves.toBe("from-env");
      expect(mockGetSecret).not.toHaveBeenCalled();
    });

    it("uses the resolved environment in the Infisical query", async () => {
      mockGetSecret.mockResolvedValueOnce({ secretValue: "ok" });
      const sm = new SecretManager();
      await sm.getSecret("KEY", { environment: "prd" });
      expect(mockGetSecret).toHaveBeenCalledWith(expect.objectContaining({ environment: "prd" }));
    });

    it("uses the resolved cloud in the path list", async () => {
      mockGetSecret.mockResolvedValueOnce({ secretValue: "ok" });
      const sm = new SecretManager();
      await sm.getSecret("KEY", { cloud: "azure" });
      expect(mockGetSecret).toHaveBeenCalledWith(expect.objectContaining({ secretPath: "/azure" }));
    });
  });

  describe("getOptionalSecret", () => {
    it("returns the secret when present", async () => {
      process.env.PRESENT = "value";
      const sm = new SecretManager();
      await expect(sm.getOptionalSecret("PRESENT", "fallback")).resolves.toBe("value");
    });

    it("returns the default when missing", async () => {
      const sm = new SecretManager();
      await expect(sm.getOptionalSecret("MISSING", "fallback")).resolves.toBe("fallback");
    });

    it("propagates non-'not found' errors", async () => {
      const sm = new SecretManager();
      vi.spyOn(sm, "getSecret").mockRejectedValueOnce(new Error("Network exploded"));
      await expect(sm.getOptionalSecret("KEY", "fallback")).rejects.toThrow("Network exploded");
    });
  });

  describe("getBooleanSecret", () => {
    it.each([
      ["true", true],
      ["1", true],
      ["yes", true],
      ["on", true],
      ["TRUE", true],
      ["True", true],
      ["YES", true],
      ["false", false],
      ["0", false],
      ["no", false],
      ["off", false],
      ["FALSE", false],
      ["banana", false],
      ["", false],
    ])("coerces %s → %s", async (raw, expected) => {
      process.env.FLAG = raw;
      const sm = new SecretManager();
      // Empty strings are treated as missing → uses default (false here)
      await expect(sm.getBooleanSecret("FLAG", false)).resolves.toBe(expected);
    });

    it("returns the default when the secret is missing", async () => {
      const sm = new SecretManager();
      await expect(sm.getBooleanSecret("MISSING_FLAG", true)).resolves.toBe(true);
      await expect(sm.getBooleanSecret("MISSING_FLAG", false)).resolves.toBe(false);
    });

    it("defaults to false when no default is provided", async () => {
      const sm = new SecretManager();
      await expect(sm.getBooleanSecret("MISSING_FLAG")).resolves.toBe(false);
    });

    it("propagates non-'not found' errors", async () => {
      const sm = new SecretManager();
      vi.spyOn(sm, "getSecret").mockRejectedValueOnce(new Error("Network exploded"));
      await expect(sm.getBooleanSecret("FLAG")).rejects.toThrow("Network exploded");
    });
  });

  describe("context resolution", () => {
    it("uses defaults when nothing is provided", async () => {
      // Default env=dev, cloud=aws — visible via Infisical query when creds are set.
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj";
      mockGetSecret.mockResolvedValueOnce({ secretValue: "ok" });
      const sm = new SecretManager();
      await sm.getSecret("KEY");
      expect(mockGetSecret).toHaveBeenCalledWith(
        expect.objectContaining({ environment: "dev", secretPath: "/aws" })
      );
    });

    it("prefers IAC_* env vars over hardcoded defaults", async () => {
      process.env.IAC_ENV = "stg";
      process.env.IAC_CLOUD = "azure";
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj";
      mockGetSecret.mockResolvedValueOnce({ secretValue: "ok" });
      const sm = new SecretManager();
      await sm.getSecret("KEY");
      expect(mockGetSecret).toHaveBeenCalledWith(
        expect.objectContaining({ environment: "stg", secretPath: "/azure" })
      );
    });

    it("prefers defaultContext over IAC_* env vars", async () => {
      process.env.IAC_ENV = "stg";
      process.env.IAC_CLOUD = "azure";
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj";
      mockGetSecret.mockResolvedValueOnce({ secretValue: "ok" });
      const sm = new SecretManager({ environment: "prd", cloud: "gcp" });
      await sm.getSecret("KEY");
      expect(mockGetSecret).toHaveBeenCalledWith(
        expect.objectContaining({ environment: "prd", secretPath: "/gcp" })
      );
    });

    it("prefers explicit context over defaultContext", async () => {
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj";
      mockGetSecret.mockResolvedValueOnce({ secretValue: "ok" });
      const sm = new SecretManager({ environment: "prd", cloud: "gcp" });
      await sm.getSecret("KEY", { environment: "sec", cloud: "aws" });
      expect(mockGetSecret).toHaveBeenCalledWith(
        expect.objectContaining({ environment: "sec", secretPath: "/aws" })
      );
    });

    it("trims whitespace from context values", async () => {
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj";
      mockGetSecret.mockResolvedValueOnce({ secretValue: "ok" });
      const sm = new SecretManager();
      await sm.getSecret("KEY", { environment: "  stg  ", cloud: "  azure  " });
      expect(mockGetSecret).toHaveBeenCalledWith(
        expect.objectContaining({ environment: "stg", secretPath: "/azure" })
      );
    });
  });

  describe("healthCheck", () => {
    it("reports infisicalAvailable=false when creds are absent", async () => {
      const sm = new SecretManager();
      const health = await sm.healthCheck();
      expect(health.infisicalAvailable).toBe(false);
      expect(health.environmentVariablesAvailable).toBe(true);
    });

    it("reports infisicalAvailable=true when creds are present and login succeeds", async () => {
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj";
      mockGetSecret.mockRejectedValue(new Error("not found"));
      const sm = new SecretManager();
      const health = await sm.healthCheck();
      expect(health.infisicalAvailable).toBe(true);
    });

    it("includes the canonical recommended-secrets list", async () => {
      const sm = new SecretManager();
      const health = await sm.healthCheck();
      expect(health.recommendedSecrets).toEqual(["ORG_TENANT", "ORG_NAME", "ORG_DOMAIN"]);
    });

    it("flags every recommended secret as missing when none are set", async () => {
      const sm = new SecretManager();
      const health = await sm.healthCheck();
      expect(health.missingSecrets).toEqual(
        expect.arrayContaining(["ORG_TENANT", "ORG_NAME", "ORG_DOMAIN"])
      );
      expect(health.missingSecrets).toHaveLength(3);
    });

    it("removes a recommended secret from the missing list once it's set", async () => {
      process.env.ORG_TENANT = "worx";
      const sm = new SecretManager();
      const health = await sm.healthCheck();
      expect(health.missingSecrets).not.toContain("ORG_TENANT");
      expect(health.missingSecrets).toEqual(expect.arrayContaining(["ORG_NAME", "ORG_DOMAIN"]));
    });

    it("flags no secrets missing once all three are set", async () => {
      process.env.ORG_TENANT = "worx";
      process.env.ORG_NAME = "WorxCo";
      process.env.ORG_DOMAIN = "worx.dev";
      const sm = new SecretManager();
      const health = await sm.healthCheck();
      expect(health.missingSecrets).toHaveLength(0);
    });
  });

  describe("module-level singleton", () => {
    it("getSecretManager() returns the same instance as the exported singleton", () => {
      expect(getSecretManager()).toBe(secretManager);
    });

    it("the singleton is a SecretManager", () => {
      expect(secretManager).toBeInstanceOf(SecretManager);
    });
  });
});
