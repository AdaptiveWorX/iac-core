/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { CloudProviderSchema } from "./core-schemas.js";
import {
  AccountReferenceSchema,
  accountReference,
  GLOBAL_REGION,
  GLOBAL_REGION_CODE,
  getProviderRegionCodes,
  isProvider,
  isRegionalProvider,
  isValidAccountId,
  isValidProviderRegion,
  PROVIDER_DEFINITIONS,
  ProviderSchema,
  resolveProviderRegion,
} from "./providers.js";

describe("providers", () => {
  describe("ProviderSchema", () => {
    it("accepts every provider", () => {
      for (const provider of ["aws", "gcp", "azure", "cloudflare", "github", "infisical"]) {
        expect(ProviderSchema.parse(provider)).toBe(provider);
      }
    });

    it("rejects unknown providers", () => {
      for (const provider of ["k8s", "AWS", "", "digitalocean"]) {
        expect(ProviderSchema.safeParse(provider).success).toBe(false);
      }
    });

    it("has exactly one definition per provider (the extension point)", () => {
      expect(ProviderSchema.options).toEqual(Object.keys(PROVIDER_DEFINITIONS));
    });

    it("keeps CloudProviderSchema as a deprecated alias of the same schema", () => {
      expect(CloudProviderSchema).toBe(ProviderSchema);
      expect(CloudProviderSchema.parse("cloudflare")).toBe("cloudflare");
    });

    it("isProvider narrows provider names and rejects prototype keys", () => {
      expect(isProvider("aws")).toBe(true);
      expect(isProvider("cloudflare")).toBe(true);
      expect(isProvider("toString")).toBe(false);
      expect(isProvider("k8s")).toBe(false);
    });
  });

  describe("regions", () => {
    it("classifies regional and global providers", () => {
      expect(isRegionalProvider("aws")).toBe(true);
      expect(isRegionalProvider("gcp")).toBe(true);
      expect(isRegionalProvider("azure")).toBe(true);
      expect(isRegionalProvider("cloudflare")).toBe(false);
      expect(isRegionalProvider("github")).toBe(false);
      expect(isRegionalProvider("infisical")).toBe(false);
    });

    it("gives global providers the single region code glb", () => {
      expect(GLOBAL_REGION_CODE).toBe("glb");
      expect(GLOBAL_REGION).toBe("global");
      expect(getProviderRegionCodes("cloudflare")).toEqual(["glb"]);
      expect(getProviderRegionCodes("github")).toEqual(["glb"]);
      expect(getProviderRegionCodes("infisical")).toEqual(["glb"]);
    });

    it("gives regional providers their iac-schemas region codes, never glb", () => {
      const aws = getProviderRegionCodes("aws");
      expect(aws).toEqual(expect.arrayContaining(["use1", "usw2", "euw1", "apne1"]));
      expect(aws).not.toContain("glb");
      expect(getProviderRegionCodes("gcp")).toContain("use1");
      expect(getProviderRegionCodes("azure")).toContain("usw2");
    });

    it("validates regions per provider", () => {
      // AWS: codes and full names, never glb
      expect(isValidProviderRegion("aws", "use1")).toBe(true);
      expect(isValidProviderRegion("aws", "us-east-1")).toBe(true);
      expect(isValidProviderRegion("aws", "glb")).toBe(false);
      expect(isValidProviderRegion("aws", "global")).toBe(false);
      expect(isValidProviderRegion("aws", "use9")).toBe(false);
      // Cloudflare: only glb / global
      expect(isValidProviderRegion("cloudflare", "glb")).toBe(true);
      expect(isValidProviderRegion("cloudflare", "global")).toBe(true);
      expect(isValidProviderRegion("cloudflare", "use1")).toBe(false);
      // GCP / Azure: their own codes
      expect(isValidProviderRegion("gcp", "use1")).toBe(true);
      expect(isValidProviderRegion("gcp", "us-east1")).toBe(true);
      expect(isValidProviderRegion("azure", "eastus")).toBe(true);
      expect(isValidProviderRegion("azure", "glb")).toBe(false);
    });

    it("resolves region codes to full names per provider", () => {
      expect(resolveProviderRegion("aws", "use1")).toBe("us-east-1");
      expect(resolveProviderRegion("aws", "us-east-1")).toBe("us-east-1");
      expect(resolveProviderRegion("gcp", "use1")).toBe("us-east1");
      expect(resolveProviderRegion("azure", "use1")).toBe("eastus");
      expect(resolveProviderRegion("cloudflare", "glb")).toBe("global");
      expect(resolveProviderRegion("cloudflare", "global")).toBe("global");
      expect(resolveProviderRegion("aws", "future1")).toBe("future1");
    });
  });

  describe("account references", () => {
    const valid: [string, string][] = [
      ["aws", "123456789012"],
      ["cloudflare", "0123456789abcdef0123456789abcdef"],
      ["azure", "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"],
      ["gcp", "worx-shared-prd"],
      ["github", "AdaptiveWorX"],
      ["infisical", "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"],
    ];

    it.each(valid)("accepts a %s account id (%s)", (provider, id) => {
      expect(AccountReferenceSchema.safeParse({ provider, id }).success).toBe(true);
    });

    it("documents a valid example for every provider", () => {
      for (const [provider, definition] of Object.entries(PROVIDER_DEFINITIONS)) {
        expect(
          AccountReferenceSchema.safeParse({ provider, id: definition.accountId.example }).success
        ).toBe(true);
      }
    });

    it("rejects ids of another provider's shape", () => {
      // A Cloudflare id is not an AWS id, and vice versa
      expect(isValidAccountId("aws", "0123456789abcdef0123456789abcdef")).toBe(false);
      expect(isValidAccountId("cloudflare", "123456789012")).toBe(false);
      // Cloudflare ids are 32 lowercase hex
      expect(isValidAccountId("cloudflare", "0123456789ABCDEF0123456789ABCDEF")).toBe(false);
      expect(isValidAccountId("cloudflare", "0123456789abcdef")).toBe(false);
      // AWS ids are exactly 12 digits
      expect(isValidAccountId("aws", "12345678901")).toBe(false);
      expect(isValidAccountId("aws", "1234567890123")).toBe(false);
      // GitHub logins don't start or end with a hyphen
      expect(isValidAccountId("github", "-worx")).toBe(false);
      expect(isValidAccountId("github", "worx-")).toBe(false);
      // GCP project ids start with a letter
      expect(isValidAccountId("gcp", "1worx-shared")).toBe(false);
    });

    it("reports the provider's id format on failure", () => {
      const result = AccountReferenceSchema.safeParse({ provider: "cloudflare", id: "123" });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["id"]);
      expect(result.error?.issues[0]?.message).toContain("32-character hex Cloudflare account ID");
    });

    it("rejects unknown providers", () => {
      expect(AccountReferenceSchema.safeParse({ provider: "k8s", id: "x" }).success).toBe(false);
    });

    it("accountReference() builds or throws", () => {
      expect(accountReference("aws", "123456789012", "worx-sec")).toEqual({
        provider: "aws",
        id: "123456789012",
        name: "worx-sec",
      });
      expect(accountReference("cloudflare", "0123456789abcdef0123456789abcdef")).toEqual({
        provider: "cloudflare",
        id: "0123456789abcdef0123456789abcdef",
      });
      expect(() => accountReference("cloudflare", "123456789012")).toThrow();
    });
  });
});
