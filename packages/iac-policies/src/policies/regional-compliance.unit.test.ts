/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResourceValidationArgs } from "@pulumi/policy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { regionalCompliancePolicy } from "./regional-compliance.js";

function makeArgs(
  type: string,
  props: Record<string, unknown>,
  urn = `urn:pulumi:test::test::${type}::res`
): ResourceValidationArgs {
  return { type, props, urn } as unknown as ResourceValidationArgs;
}

describe("regionalCompliancePolicy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("produces a policy with the configured name and defaults", () => {
    const p = regionalCompliancePolicy({ allowedRegions: ["us-east-1"] });
    expect(p.name).toBe("regional-compliance");
    expect(p.enforcementLevel).toBe("mandatory");
  });

  it("flags AWS resources in unauthorized regions", () => {
    const p = regionalCompliancePolicy({ allowedRegions: ["us-east-1"] });
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", { region: "eu-west-1" }), report);
    expect(report).toHaveBeenCalledWith(expect.stringContaining("unauthorized region: eu-west-1"));
  });

  it("does not flag AWS resources in allowed regions", () => {
    const p = regionalCompliancePolicy({ allowedRegions: ["us-east-1", "us-west-2"] });
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", { region: "us-east-1" }), report);
    expect(report).not.toHaveBeenCalled();
  });

  it("falls back to AWS_REGION env var when props.region missing", () => {
    vi.stubEnv("AWS_REGION", "us-west-2");
    const p = regionalCompliancePolicy({ allowedRegions: ["us-east-1"] });
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", {}), report);
    expect(report).toHaveBeenCalledWith(expect.stringContaining("us-west-2"));
  });

  it("ignores non-AWS resources by default", () => {
    const p = regionalCompliancePolicy({ allowedRegions: ["us-east-1"] });
    const report = vi.fn();
    p.validateResource?.(
      makeArgs("azure-native:storage:StorageAccount", { location: "westus3" }),
      report
    );
    expect(report).not.toHaveBeenCalled();
  });

  it("supports Azure via custom matcher + extractor", () => {
    const p = regionalCompliancePolicy({
      allowedRegions: ["westus3"],
      resourceTypeMatcher: t => t.startsWith("azure-native:"),
      regionExtractor: args => args.props.location as string | undefined,
    });
    const report = vi.fn();
    p.validateResource?.(
      makeArgs("azure-native:storage:StorageAccount", { location: "eastus2" }),
      report
    );
    expect(report).toHaveBeenCalledWith(expect.stringContaining("eastus2"));
  });
});
