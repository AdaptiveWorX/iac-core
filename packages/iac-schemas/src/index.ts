/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @adaptiveworx/iac-schemas — public library entry point.
 *
 * Loads the published JSON config artifacts at module import time and
 * re-exports them as typed values, so consumers get a single,
 * package-resolvable import path with no `resolveJsonModule` requirement
 * on their tsconfig.
 */

import { REGIONS } from "./regions.js";

export { REGIONS } from "./regions.js";
export type { StandardTagKey } from "./tags.js";
export { STANDARD_TAG_KEYS } from "./tags.js";

interface RegionGroup {
  aliases: Record<string, string>;
  regions: string[];
}

export interface Regions {
  aws: RegionGroup;
  azure: RegionGroup;
  gcp: RegionGroup;
  cloudflare: RegionGroup;
}

/**
 * Region aliases + canonical region names per provider (aws, azure, gcp,
 * cloudflare), as a plain record. The typed source is {@link REGIONS}.
 */
export const regions: Regions = REGIONS as unknown as Regions;

/** An AWS region code used in stack names (`use1`, `usw2`, …). */
export type AwsRegionCode = keyof typeof REGIONS.aws.aliases;

/** An AWS region name (`us-east-1`, …). */
export type AwsRegionName = (typeof REGIONS.aws.regions)[number];

/** Every AWS region code, in iac-schemas order. */
export const AWS_REGION_CODES = Object.keys(REGIONS.aws.aliases) as [
  AwsRegionCode,
  ...AwsRegionCode[],
];

/** Every AWS region name, in iac-schemas order. */
export const AWS_REGION_NAMES = [...REGIONS.aws.regions] as [AwsRegionName, ...AwsRegionName[]];
