/**
 * SharedVpc NACL rules, under Pulumi mocks
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 *
 * Every tier NACL admits all protocols from the VPC CIDR (security groups gate intra-VPC
 * traffic). The public tier gets it at rule 95, beside its internet rules; private/data keep
 * rule 100 and their existing resource names.
 */

import * as pulumi from "@pulumi/pulumi";
import { beforeAll, describe, expect, it } from "vitest";

interface CapturedRule {
  name: string;
  inputs: Record<string, unknown>;
}

const rules: CapturedRule[] = [];

pulumi.runtime.setMocks(
  {
    newResource: args => {
      if (args.type === "aws:ec2/networkAclRule:NetworkAclRule") {
        rules.push({ name: args.name, inputs: args.inputs });
      }
      const state: Record<string, unknown> = { ...args.inputs, arn: `arn:mock:${args.name}` };
      if (args.type === "aws:ec2/vpc:Vpc") {
        state["ipv6CidrBlock"] = "2001:db8:1234:5600::/56";
      }
      return { id: `${args.name}-id`, state };
    },
    call: args => ({ ...args.inputs }),
  },
  "iac-aws",
  "test",
  true
);

const VPC_CIDR = "10.224.0.0/16";

async function settle(): Promise<void> {
  // Let the mocked registrations flush.
  await new Promise(resolve => setTimeout(resolve, 50));
}

describe("SharedVpc NACL: inbound from the VPC CIDR", () => {
  let PUBLIC_RULE: number;
  let PRIVATE_RULE: number;

  beforeAll(async () => {
    const mod = await import("./shared-vpc.js");
    PUBLIC_RULE = mod.PUBLIC_TIER_VPC_INBOUND_RULE_NUMBER;
    PRIVATE_RULE = mod.PRIVATE_TIER_VPC_INBOUND_RULE_NUMBER;
    new mod.SharedVpc("test-vpc", {
      environment: "dev",
      region: "us-east-1",
      accountId: "123456789012",
      orgPrefix: "worx",
      vpcCidr: VPC_CIDR,
      availabilityZones: ["us-east-1a", "us-east-1b"],
      natGatewayCount: 0,
      enableIpv6: true,
      flowLogs: { enabled: false, trafficType: "ALL" },
      sharedAccounts: {},
      tags: {},
    });
    await settle();
  });

  const vpcInbound = (tier: string) =>
    rules.find(r => r.name === `dev-${tier}-nacl-vpc-in`)?.inputs;
  // IPv4 entries only: the IPv6 counterparts (+1000) are covered in shared-vpc.unit.test.ts.
  const ingressOf = (tier: string) =>
    rules.filter(
      r =>
        r.name.startsWith(`dev-${tier}-nacl-`) &&
        r.inputs["egress"] === false &&
        r.inputs["ipv6CidrBlock"] === undefined
    );

  it("the public tier admits all protocols from the VPC CIDR at rule 95", () => {
    expect(PUBLIC_RULE).toBe(95);
    expect(vpcInbound("public")).toMatchObject({
      ruleNumber: 95,
      protocol: "-1",
      ruleAction: "allow",
      cidrBlock: VPC_CIDR,
      egress: false,
    });
  });

  it("private and data keep the same rule at 100 (unchanged name and number)", () => {
    expect(PRIVATE_RULE).toBe(100);
    for (const tier of ["private", "data"]) {
      expect(vpcInbound(tier)).toMatchObject({
        ruleNumber: 100,
        protocol: "-1",
        ruleAction: "allow",
        cidrBlock: VPC_CIDR,
        egress: false,
      });
    }
  });

  it("no inbound rule number repeats within a tier, and the public tier avoids iac-worx's 90", () => {
    for (const tier of ["public", "private", "data"]) {
      const numbers = ingressOf(tier).map(r => r.inputs["ruleNumber"]);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
    expect(
      ingressOf("public")
        .map(r => r.inputs["ruleNumber"])
        .sort()
    ).toEqual([100, 110, 120, 95]);
  });
});
