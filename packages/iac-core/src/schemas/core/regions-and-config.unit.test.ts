/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWS_REGION_CODES, AWS_REGION_NAMES, REGIONS } from "@adaptiveworx/iac-schemas";
import { describe, expect, it } from "vitest";
import { AwsRegionSchema, DeploymentConfigSchema, PolicyConfigSchema } from "./core-schemas.js";

describe("AwsRegionSchema is derived from iac-schemas", () => {
  it("accepts exactly the AWS codes and names in REGIONS", () => {
    expect([...AwsRegionSchema.options].sort()).toEqual(
      [...Object.keys(REGIONS.aws.aliases), ...REGIONS.aws.regions].sort()
    );
  });

  it("still accepts every value the old hand-written lists did", () => {
    const formerSchemaAndType = [
      "us-east-1",
      "us-east-2",
      "us-west-1",
      "us-west-2",
      "eu-west-1",
      "eu-west-2",
      "eu-west-3",
      "eu-central-1",
      "eu-north-1",
      "ap-south-1",
      "ap-southeast-1",
      "ap-southeast-2",
      "ap-northeast-1",
      "ap-northeast-2",
      "ap-northeast-3",
      "ca-central-1",
      "sa-east-1",
      "use1",
      "use2",
      "usw1",
      "usw2",
      "euw1",
      "euw2",
      "euw3",
      "euc1",
      "eun1",
      "aps1",
      "apse1",
      "apse2",
      "apne1",
      "apne2",
      "apne3",
      "cac1",
      "sae1",
    ];
    for (const region of formerSchemaAndType) {
      expect(AwsRegionSchema.safeParse(region).success, region).toBe(true);
    }
  });

  it("rejects non-AWS and unknown regions", () => {
    for (const region of ["glb", "global", "eastus", "us-east1", "use9"]) {
      expect(AwsRegionSchema.safeParse(region).success, region).toBe(false);
    }
    expect(AWS_REGION_CODES.length + AWS_REGION_NAMES.length).toBe(AwsRegionSchema.options.length);
  });
});

const deployment = {
  tenant: "worx",
  orgName: "AdaptiveWorX",
  orgDomain: "adaptiveworx.com",
  accountPurposes: ["app", "ops"],
  accountEnvironments: ["dev", "sec"],
  enableMultiPurpose: false,
  useInfisical: true,
};

describe("DeploymentConfigSchema is provider-aware", () => {
  it.each([
    ["aws", "use1"],
    ["aws", "us-east-1"],
    ["gcp", "use1"],
    ["azure", "eastus"],
    ["cloudflare", "glb"],
  ])("accepts %s region %s", (provider, region) => {
    expect(DeploymentConfigSchema.safeParse({ ...deployment, provider, region }).success).toBe(
      true
    );
  });

  it.each([
    ["aws", "glb"],
    ["aws", "eastus"],
    ["cloudflare", "use1"],
  ])("rejects %s region %s", (provider, region) => {
    const result = DeploymentConfigSchema.safeParse({ ...deployment, provider, region });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(i => [i.path.join("."), i.message])).toContainEqual([
      "region",
      `Region '${region}' is not a ${provider} region`,
    ]);
  });

  it("requires a provider (awsRegion is gone)", () => {
    expect(
      DeploymentConfigSchema.safeParse({ ...deployment, awsRegion: "us-east-1" }).success
    ).toBe(false);
  });
});

const policy = {
  enableCostGuardrails: true,
  enableSecurityPolicies: true,
  enableCompliancePolicies: true,
  maxMonthlyCostUsd: 1000,
  requiredTags: ["Environment"],
};

describe("PolicyConfigSchema is provider-aware", () => {
  it("accepts the provider's regions", () => {
    expect(
      PolicyConfigSchema.safeParse({
        ...policy,
        provider: "aws",
        allowedRegions: ["use1", "us-west-2"],
      }).success
    ).toBe(true);
    expect(
      PolicyConfigSchema.safeParse({ ...policy, provider: "cloudflare", allowedRegions: ["glb"] })
        .success
    ).toBe(true);
  });

  it("reports each region the provider doesn't have", () => {
    const result = PolicyConfigSchema.safeParse({
      ...policy,
      provider: "aws",
      allowedRegions: ["use1", "glb", "eastus"],
    });
    expect(result.error?.issues.map(i => i.path.join("."))).toEqual([
      "allowedRegions.1",
      "allowedRegions.2",
    ]);
  });
});
