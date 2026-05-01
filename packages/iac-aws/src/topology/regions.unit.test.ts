/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { AWS_REGION_CIDR_OFFSETS, getAwsRegionCidrOffset, resolveAwsRegion } from "./regions.js";

describe("resolveAwsRegion", () => {
  it("resolves shorthand region codes to full AWS region names", () => {
    expect(resolveAwsRegion("use1")).toBe("us-east-1");
    expect(resolveAwsRegion("use2")).toBe("us-east-2");
    expect(resolveAwsRegion("usw1")).toBe("us-west-1");
    expect(resolveAwsRegion("usw2")).toBe("us-west-2");
    expect(resolveAwsRegion("euw1")).toBe("eu-west-1");
    expect(resolveAwsRegion("euc1")).toBe("eu-central-1");
    expect(resolveAwsRegion("apne1")).toBe("ap-northeast-1");
  });

  it("passes through full region names unchanged", () => {
    expect(resolveAwsRegion("us-east-1")).toBe("us-east-1");
    expect(resolveAwsRegion("eu-west-1")).toBe("eu-west-1");
  });

  it("passes through unknown region codes unchanged", () => {
    expect(resolveAwsRegion("unknown-region")).toBe("unknown-region");
  });
});

describe("getAwsRegionCidrOffset", () => {
  it("returns the offset for known regions", () => {
    expect(getAwsRegionCidrOffset("us-east-1")).toBe(0);
    expect(getAwsRegionCidrOffset("us-east-2")).toBe(1);
    expect(getAwsRegionCidrOffset("eu-west-1")).toBe(17);
  });

  it("returns null for unknown regions", () => {
    expect(getAwsRegionCidrOffset("mars-central-1")).toBeNull();
  });
});

describe("AWS_REGION_CIDR_OFFSETS", () => {
  it("has unique offsets across all regions", () => {
    const offsets = Object.values(AWS_REGION_CIDR_OFFSETS);
    expect(new Set(offsets).size).toBe(offsets.length);
  });
});
