/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { ValidationPatterns } from "./agent-validation.js";
import { CrossAccountConfigSchema } from "./configuration-patterns.js";

const AWS_A = "123456789012";
const AWS_B = "210987654321";
const CF_A = "0123456789abcdef0123456789abcdef";
const CF_B = "fedcba9876543210fedcba9876543210";

const base = {
  operation: "share-resource",
  environment: "dev",
  purpose: "ops",
  approvalRequired: false,
};

describe("cross-account account ids are provider-aware", () => {
  describe("CrossAccountConfigSchema", () => {
    it("defaults to aws: 12-digit ids pass as before", () => {
      const result = CrossAccountConfigSchema.safeParse({
        ...base,
        sourceAccount: AWS_A,
        targetAccount: AWS_B,
      });
      expect(result.success).toBe(true);
      expect(result.data?.provider).toBe("aws");
    });

    it("defaults to aws: other shapes fail with the AWS message on the same paths", () => {
      const result = CrossAccountConfigSchema.safeParse({
        ...base,
        sourceAccount: CF_A,
        targetAccount: "12345",
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues.map(i => [i.path.join("."), i.message, i.code])).toEqual([
        ["sourceAccount", "Must be valid 12-digit AWS account ID", "invalid_format"],
        ["targetAccount", "Must be valid 12-digit AWS account ID", "invalid_format"],
      ]);
    });

    it("accepts 32-hex Cloudflare account ids for provider cloudflare", () => {
      expect(
        CrossAccountConfigSchema.safeParse({
          ...base,
          provider: "cloudflare",
          sourceAccount: CF_A,
          targetAccount: CF_B,
        }).success
      ).toBe(true);
    });

    it("rejects AWS ids for provider cloudflare", () => {
      const result = CrossAccountConfigSchema.safeParse({
        ...base,
        provider: "cloudflare",
        sourceAccount: AWS_A,
        targetAccount: CF_B,
      });
      expect(result.error?.issues[0]?.message).toBe(
        "Must be valid 32-character hex Cloudflare account ID"
      );
    });
  });

  describe("ValidationPatterns.validateCrossAccountOperation", () => {
    const op = { operation: "assume-role", environment: "dev", approvalRequired: false };

    it("defaults to aws", () => {
      expect(
        ValidationPatterns.validateCrossAccountOperation({
          ...op,
          sourceAccount: AWS_A,
          targetAccount: AWS_B,
        }).success
      ).toBe(true);
    });

    it("keeps classifying a malformed id as before (cross-account context)", () => {
      const result = ValidationPatterns.validateCrossAccountOperation({
        ...op,
        sourceAccount: "not-an-id",
        targetAccount: AWS_B,
      });
      expect(result.success).toBe(false);
      // the default "cross-account-operation" context maps every issue here
      expect(result.errors?.[0]?.code).toBe("CROSS_ACCOUNT_VIOLATION");
      expect(result.errors?.[0]?.field).toContain("sourceAccount");
    });

    it("accepts Cloudflare ids for provider cloudflare", () => {
      expect(
        ValidationPatterns.validateCrossAccountOperation({
          ...op,
          provider: "cloudflare",
          sourceAccount: CF_A,
          targetAccount: CF_B,
        }).success
      ).toBe(true);
    });
  });
});
