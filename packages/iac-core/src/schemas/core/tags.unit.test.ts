/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { STANDARD_TAG_KEYS, StandardTagsSchema, TagValueSchema, WorkloadSchema } from "./tags.js";

describe("standard tags", () => {
  it("cover every standard key, Workload included", () => {
    expect(Object.keys(StandardTagsSchema.shape).sort()).toEqual([...STANDARD_TAG_KEYS].sort());
    expect(STANDARD_TAG_KEYS).toContain("Workload");
  });

  it("accept a flow workload resource's tags, and other tags alongside", () => {
    const tags = {
      Environment: "dev",
      Tenant: "worx",
      Workload: "flow",
      ManagedBy: "pulumi",
      Description: "Flow host - Graviton behind ZTNA",
      CostCenter: "eng/platform",
    };
    expect(StandardTagsSchema.parse(tags)).toEqual(tags);
  });

  it.each(["flow", "ztna", "shared", "flow-api"])("accepts workload %s", workload => {
    expect(WorkloadSchema.safeParse(workload).success).toBe(true);
  });

  it.each(["Flow", "flow_api", "-flow", "flow-", "f", "flow api"])(
    "rejects workload %s",
    workload => {
      expect(WorkloadSchema.safeParse(workload).success).toBe(false);
      expect(StandardTagsSchema.safeParse({ Workload: workload }).success).toBe(false);
    }
  );

  it("rejects tag values outside the cross-provider charset", () => {
    expect(TagValueSchema.safeParse("a,b").success).toBe(false);
    expect(TagValueSchema.safeParse("x".repeat(257)).success).toBe(false);
    expect(StandardTagsSchema.safeParse({ Custom: "a;b" }).success).toBe(false);
  });
});
