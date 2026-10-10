/**
 * SharedVpc component, under Pulumi mocks
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 *
 * Every assertion reads the resources the component actually registers. IPv6 dual-stack covers
 * every subnet (a /64 each, assign-on-create), every tier NACL (IPv6 rules in both directions),
 * routing (::/0 to the IGW on public, to the egress-only gateway on private, with or without NAT)
 * and VPC endpoints (dual-stack where the service supports it). Without IPv6 nothing IPv6 is
 * created. The security controls keep their compliance metadata (scripts/compliance-report.ts).
 */

import * as pulumi from "@pulumi/pulumi";
import { beforeAll, describe, expect, it, vi } from "vitest";

interface Captured {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}

const resources: Captured[] = [];
// IPv6 documentation prefix (RFC 3849), never a live block.
const VPC_V6 = "2001:db8:1234:5600::/56";
const VPC_CIDR = "10.224.0.0/16";

pulumi.runtime.setMocks(
  {
    newResource: args => {
      resources.push({ type: args.type, name: args.name, inputs: args.inputs });
      const state: Record<string, unknown> = { ...args.inputs, arn: `arn:mock:${args.name}` };
      if (args.type === "aws:ec2/vpc:Vpc" && args.inputs["assignGeneratedIpv6CidrBlock"] === true) {
        state["ipv6CidrBlock"] = VPC_V6;
      }
      if (args.type === "aws:s3/bucket:Bucket") {
        state["bucket"] = args.inputs["bucket"];
      }
      return { id: `${args.name}-id`, state };
    },
    call: args => {
      if (args.token === "aws:ec2/getVpcEndpointService:getVpcEndpointService") {
        const name = String(args.inputs["serviceName"]);
        return {
          ...args.inputs,
          supportedIpAddressTypes: name.endsWith(".ipv4only") ? ["ipv4"] : ["ipv4", "ipv6"],
        };
      }
      return { ...args.inputs };
    },
  },
  "iac-aws",
  "test",
  true
);

type Mod = typeof import("./shared-vpc.js");
let mod: Mod;
// Without an engine (mocks), pulumi.log.warn writes to console.warn: capture it there.
const warn = vi.spyOn(console, "warn");

const baseArgs = (environment: string) => ({
  environment,
  region: "us-east-1",
  accountId: "123456789012",
  orgPrefix: "worx",
  vpcCidr: VPC_CIDR,
  flowLogs: { enabled: false, trafficType: "ALL" as const },
  sharedAccounts: {},
  tags: {},
});

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 100));
}

const of = (env: string, type: string) =>
  resources.filter(r => r.type === type && r.name.startsWith(`${env}-`));
const named = (name: string) => resources.find(r => r.name === name)?.inputs;
const naclRules = (env: string, tier: string) =>
  of(env, "aws:ec2/networkAclRule:NetworkAclRule").filter(r =>
    r.name.startsWith(`${env}-${tier}-nacl-`)
  );
const v6Rules = (env: string, tier: string) =>
  naclRules(env, tier).filter(r => r.inputs["ipv6CidrBlock"] !== undefined);

let v6devOutputs: Record<string, string[]> | undefined;
// Warnings logged while the VPCs construct (copied in beforeAll: the runner clears spies per test).
let warnings: string[] = [];

beforeAll(async () => {
  mod = await import("./shared-vpc.js");

  // Dev shape: IPv6, no NAT, default tiers, endpoints incl. one IPv4-only service
  const dev = new mod.SharedVpc("v6dev", {
    ...baseArgs("v6dev"),
    availabilityZones: ["us-east-1a", "us-east-1b"],
    natGatewayCount: 0,
    enableIpv6: true,
    flowLogs: { enabled: true, trafficType: "ALL", retentionDays: 30 },
    vpcEndpoints: ["s3", "dynamodb", "ecr.api", "ipv4only"],
  });
  dev.subnetIpv6CidrBlocks?.apply(v => {
    v6devOutputs = v;
  });

  // Stg/prd shape: IPv6 with NAT gateways, public IPv6 ingress opted in
  new mod.SharedVpc("v6nat", {
    ...baseArgs("v6nat"),
    availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"],
    natGatewayCount: 2,
    enableIpv6: true,
    allowIpv6PublicIngress: true,
  });

  // IPv4-only: nothing IPv6 is created
  new mod.SharedVpc("v4", {
    ...baseArgs("v4"),
    availabilityZones: ["us-east-1a", "us-east-1b"],
    natGatewayCount: 1,
    vpcEndpoints: ["s3", "ecr.api"],
  });

  await settle();
  warnings = warn.mock.calls.map(c => String(c[0]));
});

describe("IPv6: subnets", () => {
  it("every subnet of every tier gets its slot/AZ /64 from the VPC's /56 and assigns on create", () => {
    const subnets = of("v6dev", "aws:ec2/subnet:Subnet");
    expect(subnets).toHaveLength(6);
    const slot: Record<string, number> = { public: 0, private: 1, data: 2 };
    for (const s of subnets) {
      const [, tier, letter] = s.name.split("-") as [string, string, string];
      const expected = mod.ipv6SubnetCidr(
        VPC_V6,
        slot[tier] as number,
        mod.azIndexOf(`us-east-1${letter}`)
      );
      expect(s.inputs["ipv6CidrBlock"]).toBe(expected);
      expect(s.inputs["assignIpv6AddressOnCreation"]).toBe(true);
    }
    expect(named("v6dev-private-b")?.["ipv6CidrBlock"]).toBe("2001:db8:1234:5611::/64");
    const cidrs = subnets.map(s => s.inputs["ipv6CidrBlock"]);
    expect(new Set(cidrs).size).toBe(cidrs.length);
  });

  it("exposes each tier's /64s in AZ order", () => {
    expect(v6devOutputs).toEqual({
      public: ["2001:db8:1234:5600::/64", "2001:db8:1234:5601::/64"],
      private: ["2001:db8:1234:5610::/64", "2001:db8:1234:5611::/64"],
      data: ["2001:db8:1234:5620::/64", "2001:db8:1234:5621::/64"],
    });
  });

  it("IPv4 subnet CIDRs are unchanged by IPv6 (sequential IPv4 carving untouched)", () => {
    expect(named("v6dev-public-a")?.["cidrBlock"]).toBe("10.224.0.0/22");
    expect(named("v6dev-private-a")?.["cidrBlock"]).toBe("10.224.8.0/22");
    expect(named("v6dev-data-b")?.["cidrBlock"]).toBe("10.224.20.0/22");
  });
});

describe("IPv6: NACLs", () => {
  const shape = (rules: Captured[]) =>
    rules
      .map(r => ({
        n: r.inputs["ruleNumber"],
        egress: r.inputs["egress"],
        protocol: r.inputs["protocol"],
        cidr: r.inputs["ipv6CidrBlock"],
        from: r.inputs["fromPort"],
        to: r.inputs["toPort"],
        icmpType: r.inputs["icmpType"],
      }))
      .sort((a, b) => Number(a.egress) - Number(b.egress) || Number(a.n) - Number(b.n));

  it("public tier (ingress flag default false): VPC /56, ephemeral TCP/UDP return, ICMPv6 Packet Too Big; all out", () => {
    expect(shape(v6Rules("v6dev", "public"))).toEqual([
      {
        n: 1095,
        egress: false,
        protocol: "-1",
        cidr: VPC_V6,
        from: undefined,
        to: undefined,
        icmpType: undefined,
      },
      {
        n: 1120,
        egress: false,
        protocol: "tcp",
        cidr: "::/0",
        from: 1024,
        to: 65535,
        icmpType: undefined,
      },
      {
        n: 1130,
        egress: false,
        protocol: "udp",
        cidr: "::/0",
        from: 1024,
        to: 65535,
        icmpType: undefined,
      },
      {
        n: 1150,
        egress: false,
        protocol: "58",
        cidr: "::/0",
        from: undefined,
        to: undefined,
        icmpType: 2,
      },
      {
        n: 1100,
        egress: true,
        protocol: "-1",
        cidr: "::/0",
        from: undefined,
        to: undefined,
        icmpType: undefined,
      },
    ]);
  });

  it("private and data tiers: VPC /56, ephemeral TCP/UDP return, ICMPv6 Packet Too Big; all out", () => {
    for (const tier of ["private", "data"]) {
      expect(shape(v6Rules("v6dev", tier)).map(r => [r.n, r.egress, r.protocol, r.cidr])).toEqual([
        [1100, false, "-1", VPC_V6],
        [1110, false, "tcp", "::/0"],
        [1130, false, "udp", "::/0"],
        [1150, false, "58", "::/0"],
        [1100, true, "-1", "::/0"],
      ]);
    }
  });

  it("allowIpv6PublicIngress adds IPv6 443 and 80 inbound on the public tier only", () => {
    const pub = shape(v6Rules("v6nat", "public")).filter(r => !r.egress);
    expect(pub.map(r => [r.n, r.from])).toEqual([
      [1095, undefined],
      [1100, 443],
      [1110, 80],
      [1120, 1024],
      [1130, 1024],
      [1150, undefined],
    ]);
    expect(v6Rules("v6nat", "private").some(r => r.inputs["fromPort"] === 443)).toBe(false);
  });

  it("no rule number repeats per tier and direction across IPv4 and IPv6, and none hits iac-worx's 90–150", () => {
    for (const env of ["v6dev", "v6nat"]) {
      for (const tier of ["public", "private", "data"]) {
        for (const egress of [false, true]) {
          const numbers = naclRules(env, tier)
            .filter(r => r.inputs["egress"] === egress)
            .map(r => r.inputs["ruleNumber"]);
          expect(new Set(numbers).size).toBe(numbers.length);
        }
        for (const r of v6Rules(env, tier)) {
          expect(Number(r.inputs["ruleNumber"])).toBeGreaterThan(1000);
        }
      }
    }
  });
});

describe("IPv6: routing", () => {
  const routes = (env: string) => of(env, "aws:ec2/route:Route");

  it("public route table sends ::/0 to the IGW even with public IPv6 ingress off (it is egress)", () => {
    expect(named("v6dev-public-route-ipv6")).toMatchObject({
      destinationIpv6CidrBlock: "::/0",
      gatewayId: "v6dev-igw-id",
    });
  });

  it("without NAT: one egress-only gateway, ::/0 from the shared private route table", () => {
    expect(of("v6dev", "aws:ec2/egressOnlyInternetGateway:EgressOnlyInternetGateway")).toHaveLength(
      1
    );
    expect(named("v6dev-shared-route-ipv6")).toMatchObject({
      destinationIpv6CidrBlock: "::/0",
      egressOnlyGatewayId: "v6dev-eigw-id",
    });
  });

  it("with NAT: the egress-only gateway still exists and every per-AZ private route table has ::/0 to it", () => {
    expect(of("v6nat", "aws:ec2/egressOnlyInternetGateway:EgressOnlyInternetGateway")).toHaveLength(
      1
    );
    const v6 = routes("v6nat").filter(r => r.inputs["egressOnlyGatewayId"] === "v6nat-eigw-id");
    expect(v6.map(r => r.name).sort()).toEqual(
      ["private", "data"]
        .flatMap(t => ["a", "b", "c"].map(z => `v6nat-${t}-route-ipv6-${z}`))
        .sort()
    );
    expect(named("v6nat-public-route-ipv6")).toMatchObject({ destinationIpv6CidrBlock: "::/0" });
  });
});

describe("IPv6: VPC endpoints", () => {
  it("dual-stack where the service lists ipv6, ipv4 otherwise", () => {
    expect(named("v6dev-vpce-s3")?.["ipAddressType"]).toBe("dualstack");
    expect(named("v6dev-vpce-dynamodb")?.["ipAddressType"]).toBe("dualstack");
    expect(named("v6dev-vpce-ecr-api")?.["ipAddressType"]).toBe("dualstack");
    expect(named("v6dev-vpce-ipv4only")?.["ipAddressType"]).toBe("ipv4");
  });
});

describe("IPv4-only VPC: nothing IPv6", () => {
  it("no subnet IPv6, no IPv6 NACL rules, no IPv6 routes, no egress-only gateway, no endpoint IP type", () => {
    for (const s of of("v4", "aws:ec2/subnet:Subnet")) {
      expect(s.inputs["ipv6CidrBlock"]).toBeUndefined();
      expect(s.inputs["assignIpv6AddressOnCreation"]).toBeFalsy();
    }
    for (const tier of ["public", "private", "data"]) {
      expect(v6Rules("v4", tier)).toEqual([]);
    }
    expect(of("v4", "aws:ec2/route:Route").some(r => r.inputs["destinationIpv6CidrBlock"])).toBe(
      false
    );
    expect(of("v4", "aws:ec2/egressOnlyInternetGateway:EgressOnlyInternetGateway")).toEqual([]);
    expect(named("v4-vpce-s3")?.["ipAddressType"]).toBeUndefined();
    expect(named("v4-vpce-ecr-api")?.["ipAddressType"]).toBeUndefined();
  });
});

describe("Construction-time validation", () => {
  it("with IPv6, a tier without an explicit ipv6Slot fails", () => {
    expect(
      () =>
        new mod.SharedVpc("noslot", {
          ...baseArgs("noslot"),
          availabilityZones: ["us-east-1a"],
          natGatewayCount: 1,
          enableIpv6: true,
          subnetTiers: [
            { name: "public", routeToInternet: true, shareViaRam: false, ipv6Slot: 0 },
            { name: "private", routeToInternet: false, shareViaRam: true },
          ],
        })
    ).toThrow(/'private' has no ipv6Slot/);
  });

  it("with IPv6, duplicate slots fail", () => {
    expect(
      () =>
        new mod.SharedVpc("dupslot", {
          ...baseArgs("dupslot"),
          availabilityZones: ["us-east-1a"],
          natGatewayCount: 1,
          enableIpv6: true,
          subnetTiers: [
            { name: "public", routeToInternet: true, shareViaRam: false, ipv6Slot: 0 },
            { name: "private", routeToInternet: false, shareViaRam: true, ipv6Slot: 0 },
          ],
        })
    ).toThrow(/both declare ipv6Slot 0/);
  });

  it("without IPv6, slots are not required (custom tiers unchanged)", () => {
    expect(
      () =>
        new mod.SharedVpc("v4tiers", {
          ...baseArgs("v4tiers"),
          availabilityZones: ["us-east-1a"],
          natGatewayCount: 1,
          subnetTiers: [{ name: "public", routeToInternet: true, shareViaRam: false }],
        })
    ).not.toThrow();
  });

  it("no NAT and no IPv6 with private tiers fails, naming the IPv4-only limit of IPv6 egress", () => {
    expect(
      () =>
        new mod.SharedVpc("noegress", {
          ...baseArgs("noegress"),
          availabilityZones: ["us-east-1a"],
          natGatewayCount: 0,
        })
    ).toThrow(/natGatewayCount>0[\s\S]*cannot reach IPv4-only destinations/);
  });

  it("no NAT with IPv6 warns that IPv4-only destinations are unreachable and does not call it sufficient", () => {
    const message = warnings.find(m => m.includes("IPv6-only egress"));
    expect(message).toMatch(/cannot reach IPv4-only destinations/);
    expect(message).toMatch(/github\.com/);
    expect(message).toMatch(/VPC endpoints or IPv6-capable destinations/);
    expect(message).not.toMatch(/sufficient/i);
  });
});

describe("Security controls", () => {
  it("blocks all public access to the flow logs bucket", {
    meta: {
      id: "s3-block-public-access",
      compliance: ["ISO27001:A.13.1.3", "ISO27001:A.9.4.1"],
      severity: "critical",
      controlType: "preventive",
      risk: "Data breach via public internet exposure",
    },
  }, () => {
    expect(named("v6dev-flow-logs-public-access")).toMatchObject({
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    });
  });

  it("versions the flow logs bucket", {
    meta: {
      id: "s3-versioning-enabled",
      compliance: ["ISO27001:A.12.3.1"],
      severity: "medium",
      controlType: "corrective",
      risk: "Data loss from accidental deletion or corruption",
    },
  }, () => {
    expect(named("v6dev-flow-logs-versioning")).toMatchObject({
      versioningConfiguration: { status: "Enabled" },
    });
  });

  it("encrypts the flow logs bucket at rest", {
    meta: {
      id: "s3-encryption-at-rest",
      compliance: ["ISO27001:A.10.1.1", "ISO27001:A.10.1.2"],
      severity: "critical",
      controlType: "preventive",
      risk: "Data breach via unencrypted storage",
    },
  }, () => {
    expect(named("v6dev-flow-logs-encryption")).toMatchObject({
      rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" } }],
    });
  });

  it("enables VPC flow logs with the configured traffic type and retention", {
    meta: {
      id: "vpc-flow-logs-enabled",
      compliance: ["ISO27001:A.12.4.1", "ISO27001:A.12.4.3"],
      severity: "high",
      controlType: "detective",
      risk: "Undetected network intrusions or data exfiltration",
    },
  }, () => {
    expect(named("v6dev-flow-logs")).toBeDefined();
    const flowLog = of("v6dev", "aws:ec2/flowLog:FlowLog")[0]?.inputs;
    expect(flowLog).toMatchObject({ trafficType: "ALL", logDestinationType: "s3" });
    expect(String(flowLog?.["logFormat"])).toContain("${tcp-flags}");
    expect(named("v6dev-flow-logs-lifecycle")).toMatchObject({
      rules: [{ status: "Enabled", expiration: { days: 30 } }],
    });
  });

  it("expires flow logs after the configured retention", {
    meta: {
      id: "flow-log-retention",
      compliance: ["ISO27001:A.12.4.2"],
      severity: "medium",
      controlType: "detective",
      risk: "Insufficient audit trail for incident investigation",
    },
  }, () => {
    expect(named("v6dev-flow-logs-lifecycle")).toMatchObject({
      rules: [{ id: "expire-flow-logs", status: "Enabled", expiration: { days: 30 } }],
    });
  });

  it("routes S3 and DynamoDB through gateway endpoints on every route table", {
    meta: {
      id: "vpc-endpoint-data-exfiltration-prevention",
      compliance: ["ISO27001:A.13.1.3", "ISO27001:A.13.2.1"],
      severity: "high",
      controlType: "preventive",
      risk: "Data exfiltration via internet egress",
    },
  }, () => {
    const tables = of("v6dev", "aws:ec2/routeTable:RouteTable").map(r => `${r.name}-id`);
    for (const service of ["s3", "dynamodb"]) {
      const endpoint = named(`v6dev-vpce-${service}`);
      expect(endpoint).toMatchObject({ vpcEndpointType: "Gateway" });
      expect([...((endpoint?.["routeTableIds"] as string[] | undefined) ?? [])].sort()).toEqual(
        tables.sort()
      );
    }
  });

  it("restricts VPC endpoint access to HTTPS from the VPC's own IPv4 and IPv6 blocks", {
    meta: {
      id: "vpc-endpoint-access-control",
      compliance: ["ISO27001:A.13.1.3"],
      severity: "high",
      controlType: "preventive",
      risk: "Unauthorized access to VPC endpoints from external networks",
    },
  }, () => {
    const ingress = named("v6dev-vpce-sg")?.["ingress"] as Record<string, unknown>[];
    expect(ingress).toEqual([
      expect.objectContaining({
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: [VPC_CIDR],
        ipv6CidrBlocks: [VPC_V6],
      }),
    ]);
    const v4Ingress = named("v4-vpce-sg")?.["ingress"] as Record<string, unknown>[];
    expect(v4Ingress[0]?.["ipv6CidrBlocks"]).toBeUndefined();
  });

  it("enables private DNS for interface endpoints", {
    meta: {
      id: "vpc-endpoint-private-dns",
      compliance: ["ISO27001:A.13.1.3"],
      severity: "medium",
      controlType: "preventive",
      risk: "DNS hijacking or man-in-the-middle attacks",
    },
  }, () => {
    expect(named("v6dev-vpce-ecr-api")).toMatchObject({
      vpcEndpointType: "Interface",
      privateDnsEnabled: true,
    });
  });

  it("shares only shareViaRam tiers, never to external principals", {
    meta: {
      id: "ram-sharing-tier-isolation",
      compliance: ["ISO27001:A.13.1.3", "ISO27001:A.9.4.1"],
      severity: "high",
      controlType: "preventive",
      risk: "Privilege escalation via shared public subnets",
    },
  }, () => {
    expect(named("v6dev-vpc-share")).toMatchObject({ allowExternalPrincipals: false });
    const shared = of("v6dev", "aws:ram/resourceAssociation:ResourceAssociation").map(
      r => r.inputs["resourceArn"]
    );
    expect(shared.sort()).toEqual(
      ["private-a", "private-b", "data-a", "data-b"].map(s => `arn:mock:v6dev-${s}`).sort()
    );
  });
});
