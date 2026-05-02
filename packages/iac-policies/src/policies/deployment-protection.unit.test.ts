/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StackValidationArgs } from "@pulumi/policy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deploymentProtectionPolicy } from "./deployment-protection.js";

function makeStackArgs(): StackValidationArgs {
  return {} as unknown as StackValidationArgs;
}

describe("deploymentProtectionPolicy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("produces a policy with default name and advisory enforcement", () => {
    const p = deploymentProtectionPolicy({
      productionEnvironments: ["prd"],
      environmentResolver: () => "dev",
    });
    expect(p.name).toBe("deployment-protection");
    expect(p.enforcementLevel).toBe("advisory");
  });

  it("does not violate when current env is non-production", () => {
    const p = deploymentProtectionPolicy({
      productionEnvironments: ["prd"],
      environmentResolver: () => "dev",
    });
    const report = vi.fn();
    p.validateStack?.(makeStackArgs(), report);
    expect(report).not.toHaveBeenCalled();
  });

  it("does not violate prod deploys running in CI (CI=true)", () => {
    vi.stubEnv("CI", "true");
    const p = deploymentProtectionPolicy({
      productionEnvironments: ["prd"],
      environmentResolver: () => "prd",
    });
    const report = vi.fn();
    p.validateStack?.(makeStackArgs(), report);
    expect(report).not.toHaveBeenCalled();
  });

  it("violates prod deploys running outside CI", () => {
    const p = deploymentProtectionPolicy({
      productionEnvironments: ["prd"],
      environmentResolver: () => "prd",
      ciDetector: () => false, // simulate non-CI context
    });
    const report = vi.fn();
    p.validateStack?.(makeStackArgs(), report);
    expect(report).toHaveBeenCalled();
  });

  it("supports multiple production environments", () => {
    const p = deploymentProtectionPolicy({
      productionEnvironments: ["prd", "sec"],
      environmentResolver: () => "sec",
      ciDetector: () => false,
    });
    const report = vi.fn();
    p.validateStack?.(makeStackArgs(), report);
    expect(report).toHaveBeenCalled();
  });

  it("uses a custom CI detector when provided", () => {
    const p = deploymentProtectionPolicy({
      productionEnvironments: ["prd"],
      environmentResolver: () => "prd",
      ciDetector: () => true, // pretend we're always in CI
    });
    const report = vi.fn();
    p.validateStack?.(makeStackArgs(), report);
    expect(report).not.toHaveBeenCalled();
  });
});
