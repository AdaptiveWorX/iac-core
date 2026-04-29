/**
 * AdaptiveWorX™ Flux
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration tests for SecretManager.
 *
 * Unlike `secrets.unit.test.ts` (mocked SDK) and `secrets.workflow.test.ts`
 * (mocked SDK, multi-step flows), this file exercises **the real Infisical
 * SDK + network**. To stay safe in CI without secrets, every Infisical-
 * specific test is gated on `INFISICAL_CLIENT_ID` and
 * `INFISICAL_CLIENT_SECRET` being set; if either is missing the assertions
 * about the real service are skipped via `it.skipIf`.
 *
 * The env-var fallback path runs unconditionally — it never touches the
 * network and verifies the surface external consumers will hit on a fresh
 * machine.
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getSecretManager, SecretManager, secretManager } from "./secrets.js";

const HAS_INFISICAL_CREDS =
  typeof process.env.INFISICAL_CLIENT_ID === "string" &&
  process.env.INFISICAL_CLIENT_ID.length > 0 &&
  typeof process.env.INFISICAL_CLIENT_SECRET === "string" &&
  process.env.INFISICAL_CLIENT_SECRET.length > 0;

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

describe("SecretManager integration", () => {
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  describe("env-var fallback (no Infisical)", () => {
    beforeEach(() => {
      delete process.env.INFISICAL_CLIENT_ID;
      delete process.env.INFISICAL_CLIENT_SECRET;
      delete process.env.INFISICAL_PROJECT_ID;
      delete process.env.INFISICAL_SITE_URL;
    });

    it("retrieves a secret from process.env", async () => {
      process.env.INTEGRATION_FALLBACK = "fallback-value";
      const sm = new SecretManager();
      await expect(sm.getSecret("INTEGRATION_FALLBACK")).resolves.toBe("fallback-value");
    });

    it("returns the default for a missing optional secret", async () => {
      const sm = new SecretManager();
      await expect(sm.getOptionalSecret("ABSENT_KEY", "default")).resolves.toBe("default");
    });

    it("reports infisicalAvailable=false in healthCheck", async () => {
      const sm = new SecretManager();
      const health = await sm.healthCheck();
      expect(health.infisicalAvailable).toBe(false);
      expect(health.environmentVariablesAvailable).toBe(true);
    });

    it("flags every recommended secret as missing on a clean environment", async () => {
      delete process.env.ORG_TENANT;
      delete process.env.ORG_NAME;
      delete process.env.ORG_DOMAIN;
      const sm = new SecretManager();
      const health = await sm.healthCheck();
      expect(health.missingSecrets).toEqual(
        expect.arrayContaining(["ORG_TENANT", "ORG_NAME", "ORG_DOMAIN"])
      );
    });
  });

  describe("singleton lifecycle", () => {
    it("getSecretManager() returns the module-level instance", () => {
      expect(getSecretManager()).toBe(secretManager);
    });

    it("the singleton is reusable across calls", async () => {
      process.env.SHARED_KEY = "shared-value";
      const a = await secretManager.getSecret("SHARED_KEY");
      const b = await secretManager.getSecret("SHARED_KEY");
      expect(a).toBe("shared-value");
      expect(b).toBe("shared-value");
    });
  });

  describe.skipIf(!HAS_INFISICAL_CREDS)("live Infisical (gated on credentials)", () => {
    it("authenticates and reports infisicalAvailable=true", async () => {
      const sm = new SecretManager();
      const health = await sm.healthCheck();
      expect(health.infisicalAvailable).toBe(true);
    });

    it("retrieves a known secret from the dev environment", async () => {
      // The 'ORG_TENANT' secret is part of the canonical recommended set
      // and is expected to exist in any Infisical project AdaptiveWorX
      // operates against. If it doesn't, that's a configuration issue,
      // not a test bug.
      const sm = new SecretManager();
      await expect(sm.getSecret("ORG_TENANT", { environment: "dev" })).resolves.toMatch(/^\S+$/);
    });

    it("returns the default for a guaranteed-absent secret", async () => {
      const sm = new SecretManager();
      const value = await sm.getOptionalSecret(
        "DEFINITELY_NOT_A_REAL_SECRET_xyz_1234567890",
        "fallback"
      );
      expect(value).toBe("fallback");
    });
  });
});
