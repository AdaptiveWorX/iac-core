/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SecretManager } from "@adaptiveworx/iac-core";
import { describe, expect, it, vi } from "vitest";
import { getAwsVpcCidr } from "./cidr.js";

const secretManagerReturning = (value: string): SecretManager =>
  ({ getSecret: vi.fn(() => Promise.resolve(value)) }) as unknown as SecretManager;

describe("getAwsVpcCidr", () => {
  it("offsets the base block by the region slot", async () => {
    await expect(
      getAwsVpcCidr("dev", "us-east-1", secretManagerReturning("10.224.0.0/11"))
    ).resolves.toMatch(/^10\.2\d\d\.0\.0\/16$/);
  });

  it("rejects an unusable VPC_CIDR_BASE without echoing its value", async () => {
    const marker = "Wx7Kq2Zp9Lm4";
    const error = await getAwsVpcCidr(
      "dev",
      "us-east-1",
      secretManagerReturning(`${marker}/99`)
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("VPC_CIDR_BASE");
    expect(message).toContain("value withheld");
    for (let i = 0; i + 4 <= marker.length; i++) {
      expect(message).not.toContain(marker.substring(i, i + 4));
    }
    expect((error as Error).cause).toBeUndefined();
  });
});
