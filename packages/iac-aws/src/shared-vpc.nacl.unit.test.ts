/**
 * SharedVpc NACL rules, under Pulumi mocks
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 *
 * Every tier NACL admits all protocols from the VPC CIDR (security groups gate intra-VPC
 * traffic). The public tier gets it at rule 95, beside its internet rules; private/data keep
 * rule 100 and their existing resource names.
 *
 * Internet-initiated HTTPS/HTTP (rules 100/110) is opt-in (`allowIpv4PublicIngress`), the IPv4
 * counterpart of `allowIpv6PublicIngress`.
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
    call: args =>
      args.token === "aws:index/getAvailabilityZones:getAvailabilityZones"
        ? { names: ["us-east-1a", "us-east-1b"], zoneIds: ["use1-az1", "use1-az2"] }
        : { ...args.inputs },
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
    // Same VPC under another environment name, opted into public IPv4 ingress.
    new mod.SharedVpc("edge-vpc", {
      environment: "edge",
      region: "us-east-1",
      accountId: "123456789012",
      orgPrefix: "worx",
      vpcCidr: VPC_CIDR,
      availabilityZones: ["us-east-1a", "us-east-1b"],
      natGatewayCount: 0,
      enableIpv6: true,
      allowIpv4PublicIngress: true,
      flowLogs: { enabled: false, trafficType: "ALL" },
      sharedAccounts: {},
      tags: {},
    });
    await settle();
  });

  const vpcInbound = (tier: string) =>
    rules.find(r => r.name === `dev-${tier}-nacl-vpc-in`)?.inputs;
  // IPv4 entries only: the IPv6 counterparts (+1000) are covered in shared-vpc.unit.test.ts.
  const ingressOf = (tier: string, env = "dev") =>
    rules.filter(
      r =>
        r.name.startsWith(`${env}-${tier}-nacl-`) &&
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
    ).toEqual([120, 95]);
  });

  it("by default the public tier admits no internet-initiated IPv4 (no 443/80 from 0.0.0.0/0)", () => {
    for (const tier of ["public", "private", "data"]) {
      const fromInternet = ingressOf(tier).filter(
        r => r.inputs["cidrBlock"] === "0.0.0.0/0" && r.inputs["fromPort"] !== 1024
      );
      expect(fromInternet).toEqual([]);
    }
    expect(rules.some(r => r.name === "dev-public-nacl-https-in")).toBe(false);
    expect(rules.some(r => r.name === "dev-public-nacl-http-in")).toBe(false);
  });

  it("allowIpv4PublicIngress adds 443 (rule 100) and 80 (rule 110) on the public tier only", () => {
    const byName = (name: string) => rules.find(r => r.name === name)?.inputs;
    expect(byName("edge-public-nacl-https-in")).toMatchObject({
      ruleNumber: 100,
      protocol: "tcp",
      ruleAction: "allow",
      cidrBlock: "0.0.0.0/0",
      fromPort: 443,
      toPort: 443,
      egress: false,
    });
    expect(byName("edge-public-nacl-http-in")).toMatchObject({
      ruleNumber: 110,
      protocol: "tcp",
      ruleAction: "allow",
      cidrBlock: "0.0.0.0/0",
      fromPort: 80,
      toPort: 80,
      egress: false,
    });
    expect(
      ingressOf("public", "edge")
        .map(r => r.inputs["ruleNumber"])
        .sort()
    ).toEqual([100, 110, 120, 95]);
    for (const tier of ["private", "data"]) {
      expect(ingressOf(tier, "edge").some(r => r.inputs["fromPort"] === 443)).toBe(false);
    }
  });

  it("allowIpv4PublicIngress leaves the IPv6 entries alone (allowIpv6PublicIngress governs them)", () => {
    const v6PublicIngress = (env: string) =>
      rules.filter(
        r =>
          r.name.startsWith(`${env}-public-nacl-`) &&
          r.inputs["egress"] === false &&
          r.inputs["ipv6CidrBlock"] !== undefined
      ).length;
    expect(v6PublicIngress("edge")).toBe(v6PublicIngress("dev"));
  });
});
