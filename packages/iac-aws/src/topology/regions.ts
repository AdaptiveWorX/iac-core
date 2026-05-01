/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AWS region metadata: shorthand-to-canonical resolution and CIDR offsets
 * used by `getAwsVpcCidr` to allocate non-overlapping VPC CIDRs across
 * regions, anchored to a per-environment base block.
 *
 * The offsets are stable: never re-number an existing region (it would
 * collide with already-deployed VPCs). New regions append at the next
 * unused index.
 */

import { resolveRegion } from "@adaptiveworx/iac-core";
import type * as aws from "@pulumi/aws";

/**
 * Resolve an AWS region from a shorthand alias (e.g. `use1`) or a
 * canonical region name (e.g. `us-east-1`). Returns the input unchanged
 * if it doesn't match any known alias.
 *
 * The return type is `aws.Region` so consumers get type-safe
 * inter-operation with `@pulumi/aws` resource arguments.
 */
export function resolveAwsRegion(regionCode: string): aws.Region {
  return resolveRegion("aws", regionCode) as aws.Region;
}

export const AWS_REGION_CIDR_OFFSETS: Readonly<Record<string, number>> = {
  "us-east-1": 0,
  "us-east-2": 1,
  "us-west-1": 2,
  "us-west-2": 3,
  "af-south-1": 4,
  "ap-east-1": 5,
  "ap-south-2": 6,
  "ap-southeast-3": 7,
  "ap-southeast-4": 8,
  "ap-south-1": 9,
  "ap-northeast-3": 10,
  "ap-northeast-2": 11,
  "ap-southeast-1": 12,
  "ap-southeast-2": 13,
  "ap-northeast-1": 14,
  "ca-central-1": 15,
  "eu-central-1": 16,
  "eu-west-1": 17,
  "eu-west-2": 18,
  "eu-south-1": 19,
  "eu-west-3": 20,
  "eu-south-2": 21,
  "eu-central-2": 22,
  "eu-north-1": 23,
  "il-central-1": 24,
  "me-south-1": 25,
  "me-central-1": 26,
  "sa-east-1": 27,
} as const;

/**
 * Look up the CIDR offset for an AWS region. Returns `null` if the region
 * isn't in the offset table (caller decides whether to fall back to 0,
 * throw, or fail closed).
 */
export function getAwsRegionCidrOffset(region: string): number | null {
  const offset = AWS_REGION_CIDR_OFFSETS[region];
  return offset === undefined ? null : offset;
}
