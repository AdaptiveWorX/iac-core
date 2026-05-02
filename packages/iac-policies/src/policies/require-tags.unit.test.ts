/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResourceValidationArgs } from "@pulumi/policy";
import { describe, expect, it, vi } from "vitest";
import { AWS_NON_TAGGABLE_RESOURCES, requireTagsPolicy } from "./require-tags.js";

function makeArgs(
  type: string,
  props: Record<string, unknown>,
  urn = `urn:pulumi:test::test::${type}::res`
): ResourceValidationArgs {
  return { type, props, urn } as unknown as ResourceValidationArgs;
}

describe("requireTagsPolicy", () => {
  it("produces a policy with the configured name and enforcement", () => {
    const p = requireTagsPolicy({ requiredTags: ["A"], name: "n", enforcementLevel: "advisory" });
    expect(p.name).toBe("n");
    expect(p.enforcementLevel).toBe("advisory");
  });

  it("defaults name to 'require-tags' and enforcement to 'mandatory'", () => {
    const p = requireTagsPolicy({ requiredTags: ["A"] });
    expect(p.name).toBe("require-tags");
    expect(p.enforcementLevel).toBe("mandatory");
  });

  it("flags resources missing the tags field entirely", () => {
    const p = requireTagsPolicy({ requiredTags: ["Env"] });
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", {}), report);
    expect(report).toHaveBeenCalledWith(expect.stringContaining("missing tags field"));
  });

  it("flags resources missing one specific required tag", () => {
    const p = requireTagsPolicy({ requiredTags: ["Env", "Owner"] });
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", { tags: { Env: "dev" } }), report);
    expect(report).toHaveBeenCalledWith(expect.stringContaining("Owner"));
  });

  it("accepts the AWS Tags (capital T) prop name as well as tags", () => {
    const p = requireTagsPolicy({ requiredTags: ["Env"] });
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", { Tags: { Env: "dev" } }), report);
    expect(report).not.toHaveBeenCalled();
  });

  it("validates expected tag values when provided", () => {
    const p = requireTagsPolicy({
      requiredTags: ["Env"],
      expectedTagValues: () => ({ Env: "prd" }),
    });
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", { tags: { Env: "dev" } }), report);
    expect(report).toHaveBeenCalledWith(expect.stringContaining("incorrect Env tag"));
  });

  it("skips resources whose type is in skipResourceTypes", () => {
    const p = requireTagsPolicy({
      requiredTags: ["Env"],
      skipResourceTypes: AWS_NON_TAGGABLE_RESOURCES,
    });
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:iam/rolePolicyAttachment:RolePolicyAttachment", {}), report);
    expect(report).not.toHaveBeenCalled();
  });

  it("skips resources whose type matches a default prefix (pulumi:)", () => {
    const p = requireTagsPolicy({ requiredTags: ["Env"] });
    const report = vi.fn();
    p.validateResource?.(makeArgs("pulumi:providers:aws", {}), report);
    expect(report).not.toHaveBeenCalled();
  });
});
