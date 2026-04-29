#!/usr/bin/env tsx
/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CIDR Allocation Utilities — pure IP arithmetic.
 *
 * `calculateVpcCidr` is cloud-agnostic: it knows nothing about AWS regions
 * or any other cloud's region naming. The AWS-region-aware composition
 * (`getAwsVpcCidr`) lives in `@adaptiveworx/iac-aws`. Future per-cloud
 * siblings (`@adaptiveworx/iac-azure`, etc.) carry their own analogs.
 */

/**
 * Parse CIDR block into components
 */
function parseCidr(cidr: string): { baseIp: string; prefixLength: number } {
  const parts = cidr.split("/");
  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    throw new Error(`Invalid CIDR block: ${cidr}`);
  }

  const baseIp = parts[0];
  const prefixLength = Number.parseInt(parts[1], 10);

  if (Number.isNaN(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    throw new Error(`Invalid prefix length in CIDR: ${cidr}`);
  }

  return { baseIp, prefixLength };
}

/**
 * Convert IP address to 32-bit integer
 */
function ipToInt(ip: string): number {
  const octets = ip.split(".");
  if (octets.length !== 4) {
    throw new Error(`Invalid IP address: ${ip}`);
  }

  return octets.reduce((acc, octet) => {
    const num = Number.parseInt(octet, 10);
    if (Number.isNaN(num) || num < 0 || num > 255) {
      throw new Error(`Invalid IP octet: ${octet}`);
    }
    return (acc << 8) + num;
  }, 0);
}

/**
 * Convert 32-bit integer to IP address
 */
function intToIp(int: number): string {
  return [(int >>> 24) & 0xff, (int >>> 16) & 0xff, (int >>> 8) & 0xff, int & 0xff].join(".");
}

/**
 * Calculate VPC CIDR from base block and region offset.
 *
 * Pure math. The caller picks the offset (typically from a per-cloud
 * region-offset table — see `AWS_REGION_CIDR_OFFSETS` in
 * `@adaptiveworx/iac-aws`).
 *
 * @param cidrBase - Base CIDR block (e.g., "10.224.0.0/11" for dev)
 * @param offset - Region offset (0-based index from a per-cloud offset table)
 * @returns VPC CIDR block (/16)
 *
 * @example
 * calculateVpcCidr("10.224.0.0/11", 0) // "10.224.0.0/16"
 * calculateVpcCidr("10.224.0.0/11", 1) // "10.225.0.0/16"
 */
export function calculateVpcCidr(cidrBase: string, offset: number): string {
  const { baseIp, prefixLength } = parseCidr(cidrBase);

  // VPC CIDR is always /16
  const vpcPrefix = 16;

  // Validate offset is non-negative
  if (offset < 0) {
    throw new Error(`Region offset must be non-negative, got ${offset}`);
  }

  // Calculate how many /16 blocks fit in the base CIDR
  const blockSize = 1 << (vpcPrefix - prefixLength); // Number of /16s in base CIDR

  if (offset >= blockSize) {
    throw new Error(
      `Region offset ${offset} exceeds available capacity. ` +
        `Base CIDR ${cidrBase} can accommodate ${blockSize} /16 blocks (offsets 0-${blockSize - 1})`
    );
  }

  // Calculate the new base IP by adding offset * (size of /16 block)
  const baseInt = ipToInt(baseIp);
  const vpcBlockSize = 1 << (32 - vpcPrefix); // Size of a /16 block in IPs
  const newBaseInt = baseInt + offset * vpcBlockSize;

  return `${intToIp(newBaseInt)}/${vpcPrefix}`;
}
