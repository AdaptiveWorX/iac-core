/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AWS_REGION_CODES,
  AWS_REGION_NAMES,
  REGIONS,
  regions,
  STANDARD_TAG_KEYS,
} from "./index.js";

describe("regions", () => {
  it("config/regions.json equals REGIONS (the published JSON never drifts from the typed source)", () => {
    const json: unknown = JSON.parse(
      readFileSync(new URL("../config/regions.json", import.meta.url), "utf8")
    );
    // On failure, regenerate the JSON from src/regions.ts (REGIONS).
    expect(json).toEqual(REGIONS);
  });

  it("every alias points at a listed region, for every provider", () => {
    for (const group of Object.values(regions)) {
      for (const region of Object.values(group.aliases)) {
        expect(group.regions).toContain(region);
      }
    }
  });

  it("derives the AWS code and name lists from REGIONS", () => {
    expect(AWS_REGION_CODES).toEqual(Object.keys(REGIONS.aws.aliases));
    expect(AWS_REGION_NAMES).toEqual([...REGIONS.aws.regions]);
    expect(AWS_REGION_CODES).toContain("use1");
    expect(AWS_REGION_NAMES).toContain("us-east-1");
  });

  it("gives Cloudflare the single region code glb", () => {
    expect(regions.cloudflare).toEqual({ aliases: { glb: "global" }, regions: ["global"] });
  });
});

describe("standard tag keys", () => {
  it("include Workload", () => {
    expect(STANDARD_TAG_KEYS).toContain("Workload");
    expect(new Set(STANDARD_TAG_KEYS).size).toBe(STANDARD_TAG_KEYS.length);
  });
});
