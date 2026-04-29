/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import {
  getRegionAliases,
  getRegions,
  isValidRegion,
  resolveRegion,
} from "../../src/utils/region-utils.js";

describe("region-utils", () => {
  describe("resolveRegion", () => {
    describe("AWS", () => {
      it("resolves AWS region aliases to full names", () => {
        expect(resolveRegion("aws", "use1")).toBe("us-east-1");
        expect(resolveRegion("aws", "usw2")).toBe("us-west-2");
        expect(resolveRegion("aws", "euw1")).toBe("eu-west-1");
        expect(resolveRegion("aws", "aps1")).toBe("ap-south-1");
      });

      it("returns full AWS region names unchanged", () => {
        expect(resolveRegion("aws", "us-east-1")).toBe("us-east-1");
        expect(resolveRegion("aws", "eu-west-1")).toBe("eu-west-1");
        expect(resolveRegion("aws", "ap-southeast-1")).toBe("ap-southeast-1");
      });

      it("returns unknown AWS region codes as-is", () => {
        expect(resolveRegion("aws", "unknown-region")).toBe("unknown-region");
        expect(resolveRegion("aws", "future-region-1")).toBe("future-region-1");
      });
    });

    describe("Azure", () => {
      it("resolves Azure region aliases to full names", () => {
        expect(resolveRegion("azure", "use1")).toBe("eastus");
        expect(resolveRegion("azure", "usw2")).toBe("westus2");
        expect(resolveRegion("azure", "euw1")).toBe("westeurope");
      });

      it("returns full Azure region names unchanged", () => {
        expect(resolveRegion("azure", "eastus")).toBe("eastus");
        expect(resolveRegion("azure", "westeurope")).toBe("westeurope");
      });
    });

    describe("GCP", () => {
      it("resolves GCP region aliases to full names", () => {
        expect(resolveRegion("gcp", "use1")).toBe("us-east1");
        expect(resolveRegion("gcp", "usw2")).toBe("us-west2");
        expect(resolveRegion("gcp", "euw1")).toBe("europe-west1");
      });

      it("returns full GCP region names unchanged", () => {
        expect(resolveRegion("gcp", "us-east1")).toBe("us-east1");
        expect(resolveRegion("gcp", "europe-west1")).toBe("europe-west1");
      });
    });

    describe("Cloudflare", () => {
      it("resolves Cloudflare global region", () => {
        expect(resolveRegion("cloudflare", "global")).toBe("global");
      });
    });
  });

  describe("getRegionAliases", () => {
    it("returns all AWS region aliases", () => {
      const aliases = getRegionAliases("aws");
      expect(aliases).toHaveProperty("use1", "us-east-1");
      expect(aliases).toHaveProperty("usw2", "us-west-2");
      expect(aliases).toHaveProperty("euw1", "eu-west-1");
      expect(Object.keys(aliases).length).toBeGreaterThan(10);
    });

    it("returns all Azure region aliases", () => {
      const aliases = getRegionAliases("azure");
      expect(aliases).toHaveProperty("use1", "eastus");
      expect(aliases).toHaveProperty("euw1", "westeurope");
      expect(Object.keys(aliases).length).toBeGreaterThan(10);
    });

    it("returns all GCP region aliases", () => {
      const aliases = getRegionAliases("gcp");
      expect(aliases).toHaveProperty("use1", "us-east1");
      expect(aliases).toHaveProperty("euw1", "europe-west1");
      expect(Object.keys(aliases).length).toBeGreaterThan(10);
    });

    it("returns Cloudflare region aliases", () => {
      const aliases = getRegionAliases("cloudflare");
      expect(aliases).toHaveProperty("global", "global");
    });
  });

  describe("getRegions", () => {
    it("returns all AWS full region names", () => {
      const regions = getRegions("aws");
      expect(regions).toContain("us-east-1");
      expect(regions).toContain("us-west-2");
      expect(regions).toContain("eu-west-1");
      expect(regions).toContain("ap-southeast-1");
      expect(regions.length).toBeGreaterThan(20);
    });

    it("returns all Azure full region names", () => {
      const regions = getRegions("azure");
      expect(regions).toContain("eastus");
      expect(regions).toContain("westeurope");
      expect(regions).toContain("southeastasia");
      expect(regions.length).toBeGreaterThan(40);
    });

    it("returns all GCP full region names", () => {
      const regions = getRegions("gcp");
      expect(regions).toContain("us-east1");
      expect(regions).toContain("europe-west1");
      expect(regions).toContain("asia-southeast1");
      expect(regions.length).toBeGreaterThan(20);
    });

    it("returns Cloudflare regions", () => {
      const regions = getRegions("cloudflare");
      expect(regions).toContain("global");
      expect(regions.length).toBe(1);
    });
  });

  describe("isValidRegion", () => {
    describe("AWS", () => {
      it("validates AWS region aliases", () => {
        expect(isValidRegion("aws", "use1")).toBe(true);
        expect(isValidRegion("aws", "usw2")).toBe(true);
        expect(isValidRegion("aws", "euw1")).toBe(true);
      });

      it("validates AWS full region names", () => {
        expect(isValidRegion("aws", "us-east-1")).toBe(true);
        expect(isValidRegion("aws", "us-west-2")).toBe(true);
        expect(isValidRegion("aws", "eu-west-1")).toBe(true);
      });

      it("rejects invalid AWS regions", () => {
        expect(isValidRegion("aws", "invalid-region")).toBe(false);
        expect(isValidRegion("aws", "us-fake-1")).toBe(false);
        expect(isValidRegion("aws", "")).toBe(false);
      });
    });

    describe("Azure", () => {
      it("validates Azure region aliases", () => {
        expect(isValidRegion("azure", "use1")).toBe(true);
        expect(isValidRegion("azure", "euw1")).toBe(true);
      });

      it("validates Azure full region names", () => {
        expect(isValidRegion("azure", "eastus")).toBe(true);
        expect(isValidRegion("azure", "westeurope")).toBe(true);
      });

      it("rejects invalid Azure regions", () => {
        expect(isValidRegion("azure", "invalid-region")).toBe(false);
      });
    });

    describe("GCP", () => {
      it("validates GCP region aliases", () => {
        expect(isValidRegion("gcp", "use1")).toBe(true);
        expect(isValidRegion("gcp", "euw1")).toBe(true);
      });

      it("validates GCP full region names", () => {
        expect(isValidRegion("gcp", "us-east1")).toBe(true);
        expect(isValidRegion("gcp", "europe-west1")).toBe(true);
      });

      it("rejects invalid GCP regions", () => {
        expect(isValidRegion("gcp", "invalid-region")).toBe(false);
      });
    });

    describe("Cloudflare", () => {
      it("validates Cloudflare global region", () => {
        expect(isValidRegion("cloudflare", "global")).toBe(true);
      });

      it("rejects invalid Cloudflare regions", () => {
        expect(isValidRegion("cloudflare", "us-east-1")).toBe(false);
        expect(isValidRegion("cloudflare", "invalid")).toBe(false);
      });
    });
  });

  describe("Cross-cloud consistency", () => {
    it("each cloud has consistent alias and region lists", () => {
      const clouds: Array<"aws" | "azure" | "gcp" | "cloudflare"> = [
        "aws",
        "azure",
        "gcp",
        "cloudflare",
      ];

      for (const cloud of clouds) {
        const aliases = getRegionAliases(cloud);
        const regions = getRegions(cloud);

        // All alias values should be in the regions list
        for (const fullRegion of Object.values(aliases)) {
          expect(regions).toContain(fullRegion);
        }

        // Regions list should not be empty
        expect(regions.length).toBeGreaterThan(0);
      }
    });
  });
});
