/**
 * SharedVpc tier renames, roles and per-tier sharing, under Pulumi mocks
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 *
 * A renamed tier keeps every resource's identity: each resource named after the tier carries
 * its former logical name as an alias, so the engine sees a rename and replaces nothing. The
 * check here runs the old layout and the new layout under two environment prefixes and compares
 * names with the prefix swapped: every old name must be some new resource's name or alias (no
 * deletes) and every new resource must have an old name (no creates). Aliases are read from the
 * child options through a component transformation, the same options the engine receives.
 */

import * as pulumi from "@pulumi/pulumi";
import { beforeAll, describe, expect, it } from "vitest";

interface Registered {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}
interface Optioned {
  type: string;
  name: string;
  aliases: string[];
}

const registered: Registered[] = [];
const optioned: Optioned[] = [];
const ZONES = ["us-east-1a", "us-east-1b"];

pulumi.runtime.setMocks(
  {
    newResource: args => {
      registered.push({ type: args.type, name: args.name, inputs: args.inputs });
      const state: Record<string, unknown> = { ...args.inputs, arn: `arn:mock:${args.name}` };
      if (args.type === "aws:ec2/vpc:Vpc") {
        state["ipv6CidrBlock"] = "2001:db8:1234:5600::/56";
      }
      return { id: `${args.name}-id`, state };
    },
    call: args =>
      args.token === "aws:index/getAvailabilityZones:getAvailabilityZones"
        ? { names: ZONES, zoneIds: ["use1-az4", "use1-az6"] }
        : { ...args.inputs },
  },
  "iac-aws",
  "test",
  true
);

type Mod = typeof import("./shared-vpc.js");
let mod: Mod;
let renamed: import("./shared-vpc.js").SharedVpc;

// Made-up account ids (not any real account).
const ACCOUNTS = { "111111111111": "app-dev", "222222222222": "analytics-dev" };

const capture: pulumi.ResourceTransformation = args => {
  optioned.push({
    type: args.type,
    name: args.name,
    aliases: (args.opts.aliases ?? []).map(a =>
      typeof a === "string" ? a : String((a as pulumi.Alias).name ?? "")
    ),
  });
  return undefined;
};

function build(
  environment: string,
  subnetTiers: import("./shared-vpc.js").SubnetTier[],
  extra: Partial<import("./shared-vpc.js").SharedVpcArgs> = {}
): import("./shared-vpc.js").SharedVpc {
  return new mod.SharedVpc(
    `${environment}-vpc`,
    {
      environment,
      region: "us-east-1",
      accountId: "123456789012",
      orgPrefix: "worx",
      vpcCidr: "10.224.0.0/16",
      availabilityZones: ZONES,
      natGatewayCount: 0,
      enableIpv6: true,
      flowLogs: { enabled: false, trafficType: "ALL" },
      sharedAccounts: { "111111111111": "app-dev" },
      tags: {},
      subnetTiers,
      ...extra,
    },
    { transformations: [capture] }
  );
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 150));
}

const OLD = (shared: [boolean, boolean, boolean]) => [
  { name: "public", routeToInternet: true, shareViaRam: shared[0], ipv6Slot: 0 },
  { name: "private", routeToInternet: false, shareViaRam: shared[1], ipv6Slot: 1 },
  { name: "data", routeToInternet: false, shareViaRam: shared[2], ipv6Slot: 2 },
];

/**
 * The state a pre-0.6.0 library left for the old layout, with the old prefix swapped to the new
 * one: every child's name, except that a RAM association holds its old running-index name (the
 * one alias of that form, since the old layouts carry no former names).
 */
const LEGACY_RAM = /-ram-[a-z]+-\d+$/;
const namesOf = (env: string, swapTo: string) =>
  optioned
    .filter(o => o.name.startsWith(`${env}-`))
    .map(o =>
      o.type === "aws:ram/resourceAssociation:ResourceAssociation"
        ? (o.aliases.find(a => LEGACY_RAM.test(a)) ?? o.name)
        : o.name
    )
    .map(n => `${swapTo}${n.slice(env.length)}`);

/** What the engine would do for `next` against `prev`: creates and deletes, by name. */
function diff(prev: string, next: string): { creates: string[]; deletes: string[] } {
  const before = new Set(namesOf(prev, next));
  const after = optioned.filter(o => o.name.startsWith(`${next}-`));
  const claimed = new Set<string>();
  const creates: string[] = [];
  for (const o of after) {
    const hits = [o.name, ...o.aliases].filter(n => before.has(n));
    if (hits.length === 0) {
      creates.push(o.name);
    }
    for (const h of hits) {
      claimed.add(h);
    }
  }
  return { creates, deletes: [...before].filter(n => !claimed.has(n)) };
}

beforeAll(async () => {
  mod = await import("./shared-vpc.js");

  // S1: rename only, sharing unchanged (every tier shared, the dev layout before re-tiering).
  build("s1old", OLD([true, true, true]));
  renamed = build("s1new", [
    {
      name: "edge",
      role: "ztna-connectors",
      routeToInternet: true,
      shareViaRam: true,
      ipv6Slot: 0,
      formerNames: ["public"],
    },
    {
      name: "flow",
      role: "flow-hosts",
      routeToInternet: false,
      shareViaRam: true,
      ipv6Slot: 1,
      formerNames: ["private"],
    },
    {
      name: "analytics",
      role: "analytics",
      routeToInternet: false,
      shareViaRam: true,
      ipv6Slot: 2,
      formerNames: ["data"],
    },
  ]);

  // S2: the dev re-tiering in one apply: rename, and share only the flow tier.
  build("s2old", OLD([true, true, true]));
  build(
    "s2new",
    [
      {
        name: "edge",
        role: "ztna-connectors",
        routeToInternet: true,
        shareWith: [],
        ipv6Slot: 0,
        formerNames: ["public"],
      },
      {
        name: "flow",
        role: "flow-hosts",
        routeToInternet: false,
        shareWith: ["app-dev"],
        ipv6Slot: 1,
        formerNames: ["private"],
      },
      {
        name: "analytics",
        role: "analytics",
        routeToInternet: false,
        shareWith: [],
        ipv6Slot: 2,
        formerNames: ["data"],
      },
    ],
    { legacyRamSharedTiers: ["public", "private", "data"] }
  );

  // S3: the same as S2 without the legacy layout, which the stack must not do.
  build("s3old", OLD([true, true, true]));
  build("s3new", [
    {
      name: "edge",
      role: "ztna-connectors",
      routeToInternet: true,
      shareWith: [],
      ipv6Slot: 0,
      formerNames: ["public"],
    },
    {
      name: "flow",
      role: "flow-hosts",
      routeToInternet: false,
      shareWith: ["app-dev"],
      ipv6Slot: 1,
      formerNames: ["private"],
    },
    {
      name: "analytics",
      role: "analytics",
      routeToInternet: false,
      shareWith: [],
      ipv6Slot: 2,
      formerNames: ["data"],
    },
  ]);

  // S4: a rename that forgets formerNames.
  build("s4old", OLD([false, true, true]));
  build("s4new", [
    {
      name: "edge",
      role: "ztna-connectors",
      routeToInternet: true,
      shareViaRam: false,
      ipv6Slot: 0,
    },
    { name: "flow", role: "flow-hosts", routeToInternet: false, shareViaRam: true, ipv6Slot: 1 },
    {
      name: "analytics",
      role: "analytics",
      routeToInternet: false,
      shareViaRam: true,
      ipv6Slot: 2,
    },
  ]);

  // S5: an unchanged pre-0.6.0 stack upgrading: same config, new library.
  build("s5", OLD([false, true, true]));

  // S6: a tier shared with a narrower set than sharedAccounts gets a share of its own.
  build(
    "s6",
    [
      {
        name: "flow",
        role: "flow-hosts",
        routeToInternet: false,
        shareWith: ["app-dev"],
        ipv6Slot: 1,
      },
      {
        name: "analytics",
        role: "analytics",
        routeToInternet: false,
        shareWith: ["analytics-dev"],
        ipv6Slot: 2,
      },
    ],
    { sharedAccounts: ACCOUNTS }
  );
  await settle();
});

describe("a renamed tier replaces nothing", () => {
  it("S1: rename with formerNames, sharing unchanged: no creates, no deletes", () => {
    expect(diff("s1old", "s1new")).toEqual({ creates: [], deletes: [] });
  });

  it("S2: rename and share only flow, with the legacy layout: only the unshared associations go", () => {
    const { creates, deletes } = diff("s2old", "s2new");
    expect(creates).toEqual([]);
    expect(deletes.sort()).toEqual(
      ["s2new-ram-public-0", "s2new-ram-public-1", "s2new-ram-data-4", "s2new-ram-data-5"].sort()
    );
  });

  it("S2: the flow associations keep their old names as aliases", () => {
    const flowA = optioned.find(o => o.name === "s2new-ram-flow-a");
    expect(flowA?.aliases).toEqual(
      expect.arrayContaining(["s2new-ram-private-a", "s2new-ram-private-2"])
    );
  });

  it("S3: without the legacy layout the kept associations would be recreated", () => {
    const { creates } = diff("s3old", "s3new");
    expect(creates.sort()).toEqual(["s3new-ram-flow-a", "s3new-ram-flow-b"]);
  });

  it("S4: a rename without formerNames would replace every tier-named resource", () => {
    const { creates, deletes } = diff("s4old", "s4new");
    expect(creates).toContain("s4new-flow-a");
    expect(deletes).toContain("s4new-private-a");
  });

  it("S5: an unchanged stack upgrading keeps every resource (association names move by alias)", () => {
    const assoc = optioned.filter(
      o =>
        o.name.startsWith("s5-ram-") && o.type === "aws:ram/resourceAssociation:ResourceAssociation"
    );
    expect(assoc.map(o => [o.name, o.aliases])).toEqual([
      ["s5-ram-private-a", ["s5-ram-private-0"]],
      ["s5-ram-private-b", ["s5-ram-private-1"]],
      ["s5-ram-data-a", ["s5-ram-data-2"]],
      ["s5-ram-data-b", ["s5-ram-data-3"]],
    ]);
  });
});

describe("outputs follow a renamed tier", () => {
  const resolved = <T>(o: pulumi.Output<T>) => new Promise<T>(resolve => o.apply(v => resolve(v)));

  it("publicSubnetIds and privateSubnetIds resolve through the former names", async () => {
    expect(await resolved(renamed.publicSubnetIds)).toEqual(["s1new-edge-a-id", "s1new-edge-b-id"]);
    expect(await resolved(renamed.privateSubnetIds)).toEqual([
      "s1new-flow-a-id",
      "s1new-flow-b-id",
    ]);
    expect(await resolved(renamed.dataSubnetIds)).toEqual([
      "s1new-analytics-a-id",
      "s1new-analytics-b-id",
    ]);
  });

  it("tierSubnetIds is keyed by the current names", async () => {
    expect(Object.keys(await resolved(renamed.tierSubnetIds))).toEqual([
      "edge",
      "flow",
      "analytics",
    ]);
  });
});

describe("roles and zone IDs are tagged", () => {
  const inputsOf = (name: string) => registered.find(r => r.name === name)?.inputs;

  it("a subnet carries Role and AzId, the zone ID of its zone", () => {
    const tags = inputsOf("s1new-flow-b")?.["tags"] as Record<string, string>;
    expect(tags).toMatchObject({
      Tier: "flow",
      Role: "flow-hosts",
      AZ: "us-east-1b",
      AzId: "use1-az6",
    });
  });

  it("a tier NACL carries Role", () => {
    const tags = inputsOf("s1new-analytics-nacl")?.["tags"] as Record<string, string>;
    expect(tags).toMatchObject({ Tier: "analytics", Role: "analytics" });
  });
});

describe("sharing is per tier and fails closed", () => {
  it("S6: a narrower set gets its own share, with only its account", () => {
    const principals = registered
      .filter(
        r =>
          r.type === "aws:ram/principalAssociation:PrincipalAssociation" && r.name.startsWith("s6-")
      )
      .map(r => r.name)
      .sort();
    expect(principals).toEqual([
      "s6-ram-analytics-dev",
      "s6-ram-analytics-dev-analytics-dev",
      "s6-ram-app-dev",
      "s6-ram-app-dev-app-dev",
    ]);
    const shares = registered
      .filter(r => r.type === "aws:ram/resourceShare:ResourceShare" && r.name.startsWith("s6-"))
      .map(r => r.name)
      .sort();
    expect(shares).toEqual(["s6-vpc-share", "s6-vpc-share-analytics-dev", "s6-vpc-share-app-dev"]);
  });

  it("refuses a tier that gives both shareWith and shareViaRam, or neither", () => {
    expect(() =>
      mod.validateTierSharing(
        [{ name: "x", routeToInternet: false, shareViaRam: true, shareWith: [] }],
        {}
      )
    ).toThrow(/exactly one/);
    expect(() => mod.validateTierSharing([{ name: "x", routeToInternet: false }], {})).toThrow(
      /exactly one/
    );
  });

  it("refuses an account that is not in sharedAccounts", () => {
    expect(() =>
      mod.validateTierSharing(
        [{ name: "x", routeToInternet: false, shareWith: ["nobody"] }],
        ACCOUNTS
      )
    ).toThrow(/not in sharedAccounts/);
  });

  it("refuses a name or former name used twice", () => {
    expect(() =>
      mod.validateTierSharing(
        [
          { name: "edge", routeToInternet: true, shareWith: [], formerNames: ["public"] },
          { name: "public", routeToInternet: true, shareWith: [] },
        ],
        {}
      )
    ).toThrow(/used by both/);
  });
});

describe("helpers", () => {
  it("tierNamed finds a tier by its former name", () => {
    const tiers = [
      { name: "flow", routeToInternet: false, shareWith: [], formerNames: ["private"] },
    ];
    expect(mod.tierNamed(tiers, "private")?.name).toBe("flow");
    expect(mod.tierNamed(tiers, "data")).toBeUndefined();
  });

  it("legacyRamAssociationNames counts subnets across the old shared tiers", () => {
    const tier = {
      name: "flow",
      routeToInternet: false,
      shareWith: ["a"],
      formerNames: ["private"],
    };
    expect(
      mod.legacyRamAssociationNames("dev", ["public", "private", "data"], [tier], tier, 3, 6)
    ).toEqual(["dev-ram-private-9"]);
    expect(mod.legacyRamAssociationNames("dev", ["data"], [tier], tier, 0, 6)).toEqual([]);
  });

  it("without a layout, a renamed shareViaRam tier gets its index under every name", () => {
    const edge = {
      name: "edge",
      routeToInternet: true,
      shareViaRam: false,
      formerNames: ["public"],
    };
    const flow = {
      name: "flow",
      routeToInternet: false,
      shareViaRam: true,
      formerNames: ["private"],
    };
    expect(mod.legacyRamAssociationNames("dev", undefined, [edge, flow], flow, 1, 6)).toEqual([
      "dev-ram-flow-1",
      "dev-ram-private-1",
    ]);
    expect(mod.legacyRamAssociationNames("dev", undefined, [edge, flow], edge, 0, 6)).toEqual([]);
  });
});
