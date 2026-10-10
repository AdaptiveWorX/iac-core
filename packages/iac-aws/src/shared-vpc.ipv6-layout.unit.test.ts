/**
 * SharedVpc IPv6 layout: the deterministic /64 scheme and its validation (pure functions)
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 *
 * Each subnet's /64 is netnum = ipv6Slot * 16 + azIndex inside the VPC's /56, where the slot is
 * explicit per tier and the AZ index comes from the AZ letter. Adding an AZ or a tier never
 * changes an existing subnet's /64.
 */

import { describe, expect, it } from "vitest";
import {
  azIndexOf,
  DEFAULT_SUBNET_TIERS,
  IPV6_SLOT_COUNT,
  ipv6SubnetCidr,
  type SubnetTier,
  validateIpv6Layout,
} from "./shared-vpc.js";

// IPv6 documentation prefix (RFC 3849), never a live block.
const VPC_V6 = "2001:db8:1234:5600::/56";

describe("azIndexOf", () => {
  it("derives the index from the AZ letter, not list order", () => {
    expect(azIndexOf("us-east-1a")).toBe(0);
    expect(azIndexOf("us-east-1f")).toBe(5);
    expect(azIndexOf("us-west-2d")).toBe(3);
    expect(azIndexOf("us-east-1p")).toBe(15);
  });

  it("rejects letters beyond p and non-letter suffixes", () => {
    expect(() => azIndexOf("us-east-1q")).toThrow(/a–p/);
    expect(() => azIndexOf("us-east-1")).toThrow(/a–p/);
  });
});

describe("ipv6SubnetCidr", () => {
  it("carves netnum = slot * 16 + azIndex as a canonical /64", () => {
    expect(ipv6SubnetCidr(VPC_V6, 0, 0)).toBe("2001:db8:1234:5600::/64");
    expect(ipv6SubnetCidr(VPC_V6, 1, 1)).toBe("2001:db8:1234:5611::/64");
    expect(ipv6SubnetCidr(VPC_V6, 2, 5)).toBe("2001:db8:1234:5625::/64");
    expect(ipv6SubnetCidr(VPC_V6, 15, 15)).toBe("2001:db8:1234:56ff::/64");
  });

  it("formats per RFC 5952 (lowercase, longest zero run compressed)", () => {
    expect(ipv6SubnetCidr("2001:DB8:0:0::/56", 0, 1)).toBe("2001:db8:0:1::/64");
    expect(ipv6SubnetCidr("2001:0db8:0000:0000:0000:0000:0000:0000/56", 0, 0)).toBe(
      "2001:db8::/64"
    );
  });

  it("gives all 256 slot/AZ pairs distinct /64s inside the /56", () => {
    const seen = new Set<string>();
    for (let slot = 0; slot < IPV6_SLOT_COUNT; slot++) {
      for (let az = 0; az < IPV6_SLOT_COUNT; az++) {
        const cidr = ipv6SubnetCidr(VPC_V6, slot, az);
        expect(cidr.startsWith("2001:db8:1234:56")).toBe(true);
        expect(cidr.endsWith("/64")).toBe(true);
        seen.add(cidr);
      }
    }
    expect(seen.size).toBe(256);
  });

  it("rejects a VPC block smaller than /56 and out-of-range slots or indexes", () => {
    expect(() => ipv6SubnetCidr("2001:db8:1234:5600::/60", 0, 0)).toThrow(/56/);
    expect(() => ipv6SubnetCidr(VPC_V6, 16, 0)).toThrow(/ipv6Slot/);
    expect(() => ipv6SubnetCidr(VPC_V6, 0, -1)).toThrow(/AZ index/);
  });
});

describe("stability: adding an AZ or a tier never renumbers an existing subnet", () => {
  const layout = (tiers: readonly SubnetTier[], azs: string[]): Map<string, string> => {
    validateIpv6Layout(tiers, azs);
    const out = new Map<string, string>();
    for (const tier of tiers) {
      for (const az of azs) {
        out.set(
          `${tier.name}/${az}`,
          ipv6SubnetCidr(VPC_V6, tier.ipv6Slot as number, azIndexOf(az))
        );
      }
    }
    return out;
  };
  const before = layout(DEFAULT_SUBNET_TIERS, ["us-east-1a", "us-east-1b", "us-east-1c"]);

  it("adding an AZ (in any list position) keeps every existing /64", () => {
    const after = layout(DEFAULT_SUBNET_TIERS, [
      "us-east-1d",
      "us-east-1a",
      "us-east-1b",
      "us-east-1c",
    ]);
    for (const [key, cidr] of before) {
      expect(after.get(key)).toBe(cidr);
    }
  });

  it("inserting a tier (anywhere in the array) keeps every existing /64", () => {
    const [publicTier, privateTier, dataTier] = DEFAULT_SUBNET_TIERS;
    const tiers = [
      publicTier,
      { name: "dmz", routeToInternet: true, shareViaRam: false, ipv6Slot: 3 },
      privateTier,
      dataTier,
    ] as SubnetTier[];
    const after = layout(tiers, ["us-east-1a", "us-east-1b", "us-east-1c"]);
    for (const [key, cidr] of before) {
      expect(after.get(key)).toBe(cidr);
    }
  });
});

describe("validateIpv6Layout", () => {
  const azs = ["us-east-1a", "us-east-1b"];

  it("accepts the default tiers (slots 0, 1, 2)", () => {
    expect(DEFAULT_SUBNET_TIERS.map(t => t.ipv6Slot)).toEqual([0, 1, 2]);
    expect(() => validateIpv6Layout(DEFAULT_SUBNET_TIERS, azs)).not.toThrow();
  });

  it("rejects a tier without an explicit ipv6Slot (no array-position default)", () => {
    const tiers: SubnetTier[] = [
      { name: "public", routeToInternet: true, shareViaRam: false, ipv6Slot: 0 },
      { name: "private", routeToInternet: false, shareViaRam: true },
    ];
    expect(() => validateIpv6Layout(tiers, azs)).toThrow(/'private' has no ipv6Slot/);
  });

  it("rejects duplicate, out-of-range and non-integer slots", () => {
    const dup: SubnetTier[] = [
      { name: "a", routeToInternet: true, shareViaRam: false, ipv6Slot: 1 },
      { name: "b", routeToInternet: false, shareViaRam: true, ipv6Slot: 1 },
    ];
    expect(() => validateIpv6Layout(dup, azs)).toThrow(/both declare ipv6Slot 1/);
    for (const bad of [16, -1, 1.5]) {
      expect(() =>
        validateIpv6Layout(
          [{ name: "a", routeToInternet: true, shareViaRam: false, ipv6Slot: bad }],
          azs
        )
      ).toThrow(/integer 0–15/);
    }
  });

  it("rejects AZs that map to the same index", () => {
    expect(() =>
      validateIpv6Layout(DEFAULT_SUBNET_TIERS, ["us-east-1a", "us-east-1-bos-1a"])
    ).toThrow(/same IPv6 AZ index 0/);
  });
});
