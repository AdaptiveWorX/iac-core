/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResourceValidationArgs } from "@pulumi/policy";
import { describe, expect, it, vi } from "vitest";
import { awsSecurityBaselinePolicy } from "./aws-security-baseline.js";

function makeArgs(
  type: string,
  props: Record<string, unknown>,
  urn = `urn:pulumi:test::test::${type}::res`
): ResourceValidationArgs {
  return { type, props, urn } as unknown as ResourceValidationArgs;
}

describe("awsSecurityBaselinePolicy", () => {
  it("produces a policy with default name and mandatory enforcement", () => {
    const p = awsSecurityBaselinePolicy();
    expect(p.name).toBe("aws-security-baseline");
    expect(p.enforcementLevel).toBe("mandatory");
  });

  it("flags S3 buckets with public-read ACL", () => {
    const p = awsSecurityBaselinePolicy();
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", { acl: "public-read" }), report);
    expect(report).toHaveBeenCalledWith(expect.stringContaining("cannot have public ACL"));
  });

  it("flags S3 buckets with public-read-write ACL", () => {
    const p = awsSecurityBaselinePolicy();
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", { acl: "public-read-write" }), report);
    expect(report).toHaveBeenCalledWith(expect.stringContaining("public ACL"));
  });

  it("does not flag S3 buckets with private ACL", () => {
    const p = awsSecurityBaselinePolicy();
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", { acl: "private" }), report);
    expect(report).not.toHaveBeenCalled();
  });

  it("flags S3 encryption configuration with no rules", () => {
    const p = awsSecurityBaselinePolicy();
    const report = vi.fn();
    p.validateResource?.(
      makeArgs(
        "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
        { rules: [] }
      ),
      report
    );
    expect(report).toHaveBeenCalledWith(expect.stringContaining("at least one encryption rule"));
  });

  it("can disable individual checks via the checks option", () => {
    const p = awsSecurityBaselinePolicy({ checks: { s3PublicAcl: false } });
    const report = vi.fn();
    p.validateResource?.(makeArgs("aws:s3/bucket:Bucket", { acl: "public-read" }), report);
    expect(report).not.toHaveBeenCalled();
  });
});
