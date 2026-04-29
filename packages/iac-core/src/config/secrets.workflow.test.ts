/**
 * AdaptiveWorX™ Flux
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Workflow-level tests for SecretManager.
 *
 * These exercise multi-step usage patterns that mirror real consumers:
 * resolution-priority chains, environment switches, concurrent requests,
 * and pre/post-state from healthCheck. The Infisical SDK and Pulumi log
 * are mocked at module scope; tests run with no live network.
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecretManager } from "./secrets.js";

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

const { mockLogin, mockGetSecret } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockGetSecret: vi.fn(),
}));

vi.mock("@infisical/sdk", () => ({
  InfisicalSDK: vi.fn().mockImplementation(() => ({
    auth: () => ({ universalAuth: { login: mockLogin } }),
    secrets: () => ({ getSecret: mockGetSecret }),
  })),
}));

vi.mock("@pulumi/pulumi", () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe("SecretManager — workflow scenarios", () => {
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
    clearControlEnv();
    mockLogin.mockReset().mockResolvedValue({});
    mockGetSecret.mockReset();
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  describe("env-only mode (no Infisical credentials)", () => {
    it("retrieves a chain of org secrets from env vars", async () => {
      process.env.ORG_TENANT = "worx";
      process.env.ORG_NAME = "WorxCo";
      process.env.ORG_DOMAIN = "worx.dev";

      const sm = new SecretManager();

      await expect(sm.getSecret("ORG_TENANT")).resolves.toBe("worx");
      await expect(sm.getSecret("ORG_NAME")).resolves.toBe("WorxCo");
      await expect(sm.getSecret("ORG_DOMAIN")).resolves.toBe("worx.dev");
    });

    it("mixes required and optional secret access", async () => {
      process.env.REQUIRED_SECRET = "must-have";
      const sm = new SecretManager();

      await expect(sm.getSecret("REQUIRED_SECRET")).resolves.toBe("must-have");
      await expect(sm.getOptionalSecret("OPTIONAL_SECRET", "default")).resolves.toBe("default");
      await expect(sm.getBooleanSecret("MISSING_FLAG", true)).resolves.toBe(true);
    });

    it("never calls Infisical when no creds are configured", async () => {
      process.env.SOME_KEY = "some-value";
      const sm = new SecretManager();
      await sm.getSecret("SOME_KEY");
      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockGetSecret).not.toHaveBeenCalled();
    });
  });

  describe("Infisical mode (with mocked SDK)", () => {
    beforeEach(() => {
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj-1";
    });

    it("authenticates exactly once across multiple getSecret calls", async () => {
      mockGetSecret.mockResolvedValue({ secretValue: "x" });
      const sm = new SecretManager();
      await sm.getSecret("A");
      await sm.getSecret("B");
      await sm.getSecret("C");
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    it("queries the cloud-specific path before the root", async () => {
      mockGetSecret
        .mockRejectedValueOnce(new Error("miss"))
        .mockResolvedValueOnce({ secretValue: "found-in-root" });

      const sm = new SecretManager();
      await expect(sm.getSecret("KEY")).resolves.toBe("found-in-root");

      const calls = mockGetSecret.mock.calls.map(c => (c[0] as { secretPath: string }).secretPath);
      expect(calls).toEqual(["/aws", "/"]);
    });

    it("survives repeated misses by reaching the env var", async () => {
      mockGetSecret.mockRejectedValue(new Error("not in infisical"));
      process.env.SAFETY_NET = "from-env";

      const sm = new SecretManager();
      await expect(sm.getSecret("SAFETY_NET")).resolves.toBe("from-env");
    });

    it("skips Infisical entirely when login fails up front", async () => {
      mockLogin.mockRejectedValueOnce(new Error("bad creds"));
      process.env.AFTER_AUTH_FAIL = "from-env";

      const sm = new SecretManager();
      await expect(sm.getSecret("AFTER_AUTH_FAIL")).resolves.toBe("from-env");
      expect(mockGetSecret).not.toHaveBeenCalled();
    });
  });

  describe("multi-environment context switching", () => {
    beforeEach(() => {
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj-1";
      mockGetSecret.mockResolvedValue({ secretValue: "ok" });
    });

    it("dispatches each request to the right Infisical environment", async () => {
      const sm = new SecretManager();

      for (const env of ["dev", "stg", "prd", "sec"]) {
        await sm.getSecret("KEY", { environment: env });
      }

      const calls = mockGetSecret.mock.calls.map(
        c => (c[0] as { environment: string }).environment
      );
      expect(calls).toEqual(["dev", "stg", "prd", "sec"]);
    });

    it("dispatches each request to the right cloud path", async () => {
      const sm = new SecretManager();

      for (const cloud of ["aws", "azure", "gcp", "cloudflare"]) {
        await sm.getSecret("KEY", { cloud });
      }

      const paths = mockGetSecret.mock.calls.map(c => (c[0] as { secretPath: string }).secretPath);
      expect(paths).toEqual(["/aws", "/azure", "/gcp", "/cloudflare"]);
    });

    it("default context locks in environment for every call until overridden", async () => {
      const sm = new SecretManager({ environment: "stg", cloud: "azure" });

      await sm.getSecret("A");
      await sm.getSecret("B", { environment: "prd" });
      await sm.getSecret("C");

      const envs = mockGetSecret.mock.calls.map(c => (c[0] as { environment: string }).environment);
      const paths = mockGetSecret.mock.calls.map(c => (c[0] as { secretPath: string }).secretPath);
      expect(envs).toEqual(["stg", "prd", "stg"]);
      expect(paths).toEqual(["/azure", "/azure", "/azure"]);
    });
  });

  describe("concurrent access", () => {
    it("serves N concurrent env-var lookups consistently", async () => {
      process.env.HOT_SECRET = "hot";
      const sm = new SecretManager();

      const results = await Promise.all(
        Array.from({ length: 25 }, () => sm.getSecret("HOT_SECRET"))
      );

      expect(results).toHaveLength(25);
      expect(results.every(r => r === "hot")).toBe(true);
    });

    it("authenticates once even under concurrent Infisical calls", async () => {
      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj-1";
      mockGetSecret.mockResolvedValue({ secretValue: "x" });

      const sm = new SecretManager();
      await Promise.all(Array.from({ length: 10 }, () => sm.getSecret("KEY")));

      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    it("returns fresh values when env vars change between calls", async () => {
      const sm = new SecretManager();

      process.env.MUTABLE = "first";
      const a = await sm.getSecret("MUTABLE");

      process.env.MUTABLE = "second";
      const b = await sm.getSecret("MUTABLE");

      expect(a).toBe("first");
      expect(b).toBe("second");
    });
  });

  describe("healthCheck transitions", () => {
    it("missingSecrets shrinks as recommended secrets are populated", async () => {
      const sm = new SecretManager();

      const before = await sm.healthCheck();
      expect(before.missingSecrets).toHaveLength(3);

      process.env.ORG_TENANT = "worx";
      process.env.ORG_NAME = "WorxCo";
      const middle = await sm.healthCheck();
      expect(middle.missingSecrets).toEqual(["ORG_DOMAIN"]);

      process.env.ORG_DOMAIN = "worx.dev";
      const after = await sm.healthCheck();
      expect(after.missingSecrets).toEqual([]);
    });

    it("infisicalAvailable lights up after successful login", async () => {
      const before = await new SecretManager().healthCheck();
      expect(before.infisicalAvailable).toBe(false);

      process.env.INFISICAL_CLIENT_ID = "id";
      process.env.INFISICAL_CLIENT_SECRET = "secret";
      process.env.INFISICAL_PROJECT_ID = "proj-1";
      mockGetSecret.mockRejectedValue(new Error("not found"));

      const after = await new SecretManager().healthCheck();
      expect(after.infisicalAvailable).toBe(true);
    });
  });
});
