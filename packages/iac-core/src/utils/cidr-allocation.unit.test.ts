#!/usr/bin/env tsx
/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { calculateVpcCidr } from "./cidr-allocation.js";

describe("calculateVpcCidr", () => {
  describe("Dev environment (10.224.0.0/11)", () => {
    const devBase = "10.224.0.0/11";

    it("should calculate first VPC CIDR (offset 0)", () => {
      expect(calculateVpcCidr(devBase, 0)).toBe("10.224.0.0/16");
    });

    it("should calculate second VPC CIDR (offset 1)", () => {
      expect(calculateVpcCidr(devBase, 1)).toBe("10.225.0.0/16");
    });

    it("should calculate third VPC CIDR (offset 2)", () => {
      expect(calculateVpcCidr(devBase, 2)).toBe("10.226.0.0/16");
    });

    it("should calculate last valid VPC CIDR (offset 31)", () => {
      expect(calculateVpcCidr(devBase, 31)).toBe("10.255.0.0/16");
    });

    it("should throw error for offset exceeding capacity", () => {
      expect(() => calculateVpcCidr(devBase, 32)).toThrow(
        "Region offset 32 exceeds available capacity"
      );
    });
  });

  describe("Stg environment (10.192.0.0/11)", () => {
    const stgBase = "10.192.0.0/11";

    it("should calculate first VPC CIDR (offset 0)", () => {
      expect(calculateVpcCidr(stgBase, 0)).toBe("10.192.0.0/16");
    });

    it("should calculate second VPC CIDR (offset 1)", () => {
      expect(calculateVpcCidr(stgBase, 1)).toBe("10.193.0.0/16");
    });

    it("should calculate last valid VPC CIDR (offset 31)", () => {
      expect(calculateVpcCidr(stgBase, 31)).toBe("10.223.0.0/16");
    });

    it("should throw error for offset exceeding capacity", () => {
      expect(() => calculateVpcCidr(stgBase, 32)).toThrow(
        "Region offset 32 exceeds available capacity"
      );
    });
  });

  describe("Prd environment (10.0.0.0/9)", () => {
    const prdBase = "10.0.0.0/9";

    it("should calculate first VPC CIDR (offset 0)", () => {
      expect(calculateVpcCidr(prdBase, 0)).toBe("10.0.0.0/16");
    });

    it("should calculate second VPC CIDR (offset 1)", () => {
      expect(calculateVpcCidr(prdBase, 1)).toBe("10.1.0.0/16");
    });

    it("should calculate tenth VPC CIDR (offset 9)", () => {
      expect(calculateVpcCidr(prdBase, 9)).toBe("10.9.0.0/16");
    });

    it("should calculate last valid VPC CIDR (offset 127)", () => {
      expect(calculateVpcCidr(prdBase, 127)).toBe("10.127.0.0/16");
    });

    it("should throw error for offset exceeding capacity", () => {
      expect(() => calculateVpcCidr(prdBase, 128)).toThrow(
        "Region offset 128 exceeds available capacity"
      );
    });
  });

  describe("Error handling", () => {
    it("should throw error for invalid CIDR format", () => {
      expect(() => calculateVpcCidr("10.0.0.0", 0)).toThrow("Invalid CIDR block: 10.0.0.0");
    });

    it("should throw error for invalid prefix length", () => {
      expect(() => calculateVpcCidr("10.0.0.0/33", 0)).toThrow(
        "Invalid prefix length in CIDR: 10.0.0.0/33"
      );
    });

    it("should throw error for invalid IP address", () => {
      expect(() => calculateVpcCidr("10.0.256.0/16", 0)).toThrow("Invalid IP octet: 256");
    });

    it("should throw error for negative offset", () => {
      // Offset validation happens in capacity check
      expect(() => calculateVpcCidr("10.0.0.0/16", -1)).toThrow();
    });
  });

  describe("Boundary conditions", () => {
    it("should handle /16 base CIDR (no subdivision)", () => {
      expect(calculateVpcCidr("10.100.0.0/16", 0)).toBe("10.100.0.0/16");
      expect(() => calculateVpcCidr("10.100.0.0/16", 1)).toThrow(
        "Region offset 1 exceeds available capacity"
      );
    });

    it("should handle /8 base CIDR (maximum subdivision)", () => {
      const base = "10.0.0.0/8";
      expect(calculateVpcCidr(base, 0)).toBe("10.0.0.0/16");
      expect(calculateVpcCidr(base, 1)).toBe("10.1.0.0/16");
      expect(calculateVpcCidr(base, 255)).toBe("10.255.0.0/16");
      expect(() => calculateVpcCidr(base, 256)).toThrow(
        "Region offset 256 exceeds available capacity"
      );
    });
  });

  describe("CIDR allocation strategy validation", () => {
    it("dev and stg should not overlap", () => {
      const devFirst = calculateVpcCidr("10.224.0.0/11", 0);
      const devLast = calculateVpcCidr("10.224.0.0/11", 31);
      const stgFirst = calculateVpcCidr("10.192.0.0/11", 0);
      const stgLast = calculateVpcCidr("10.192.0.0/11", 31);

      // Dev range: 10.224.0.0/16 - 10.255.0.0/16
      expect(devFirst).toBe("10.224.0.0/16");
      expect(devLast).toBe("10.255.0.0/16");

      // Stg range: 10.192.0.0/16 - 10.223.0.0/16
      expect(stgFirst).toBe("10.192.0.0/16");
      expect(stgLast).toBe("10.223.0.0/16");

      // Verify no overlap (stgLast < devFirst)
      expect(Number.parseInt(stgLast.split(".")[1] ?? "0", 10)).toBeLessThan(
        Number.parseInt(devFirst.split(".")[1] ?? "0", 10)
      );
    });

    it("prd should have largest capacity", () => {
      const prdBase = "10.0.0.0/9";
      const devBase = "10.224.0.0/11";
      const stgBase = "10.192.0.0/11";

      // Prd: /9 = 128 /16 blocks (0-127)
      expect(() => calculateVpcCidr(prdBase, 127)).not.toThrow();
      expect(() => calculateVpcCidr(prdBase, 128)).toThrow();

      // Dev/Stg: /11 = 32 /16 blocks (0-31)
      expect(() => calculateVpcCidr(devBase, 31)).not.toThrow();
      expect(() => calculateVpcCidr(devBase, 32)).toThrow();
      expect(() => calculateVpcCidr(stgBase, 31)).not.toThrow();
      expect(() => calculateVpcCidr(stgBase, 32)).toThrow();
    });
  });
});
