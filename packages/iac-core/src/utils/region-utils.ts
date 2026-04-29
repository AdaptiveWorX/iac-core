/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Region mapping utilities for cloud providers.
 *
 * Sources canonical region data from `@adaptiveworx/iac-schemas` so this
 * works identically in the monorepo and in published-npm form (no
 * fs.readFileSync gymnastics).
 */

import { regions as regionsData } from "@adaptiveworx/iac-schemas";

interface RegionConfig {
  aliases: Record<string, string>;
  regions: string[];
}

interface RegionsData {
  aws: RegionConfig;
  azure: RegionConfig;
  gcp: RegionConfig;
  cloudflare: RegionConfig;
}

const cachedRegions = regionsData as RegionsData;

function loadRegionsConfig(): RegionsData {
  return cachedRegions;
}

/**
 * Resolve a region alias to its full region name
 * @param cloud - Cloud provider (aws, azure, gcp, cloudflare)
 * @param regionAlias - Short region code (e.g., "use1") or full name
 * @returns Full region name (e.g., "us-east-1") or original if no mapping exists
 */
export function resolveRegion(
  cloud: "aws" | "azure" | "gcp" | "cloudflare",
  regionAlias: string
): string {
  const regions = loadRegionsConfig();
  const config = regions[cloud];

  // Check if it's an alias
  const resolvedAlias: string | undefined = config.aliases[regionAlias];
  if (resolvedAlias !== undefined) {
    return resolvedAlias;
  }

  // Check if it's already a full region name
  if (config.regions.includes(regionAlias)) {
    return regionAlias;
  }

  // Return as-is if not found (may be a new region)
  return regionAlias;
}

/**
 * Get all available region aliases for a cloud provider
 * @param cloud - Cloud provider
 * @returns Record of alias to full region name
 */
export function getRegionAliases(
  cloud: "aws" | "azure" | "gcp" | "cloudflare"
): Record<string, string> {
  const regions = loadRegionsConfig();
  return regions[cloud].aliases;
}

/**
 * Get all available full region names for a cloud provider
 * @param cloud - Cloud provider
 * @returns Array of full region names
 */
export function getRegions(cloud: "aws" | "azure" | "gcp" | "cloudflare"): string[] {
  const regions = loadRegionsConfig();
  return regions[cloud].regions;
}

/**
 * Check if a region alias or name is valid for a cloud provider
 * @param cloud - Cloud provider
 * @param region - Region alias or full name
 * @returns true if valid, false otherwise
 */
export function isValidRegion(
  cloud: "aws" | "azure" | "gcp" | "cloudflare",
  region: string
): boolean {
  const regions = loadRegionsConfig();
  const config = regions[cloud];

  // Check if region exists as an alias or full region name
  return region in config.aliases || config.regions.includes(region);
}

/**
 * Validate that availability zones belong to the specified region
 * AWS AZs must start with the region name (e.g., us-west-2a starts with us-west-2)
 *
 * This prevents the bug where getAvailabilityZones() without explicit region
 * parameter would return AZs from AWS_REGION env var instead of target region.
 *
 * @param azs - Array of availability zone names
 * @param region - Full region name (e.g., 'us-west-2')
 * @throws Error if any AZ doesn't match the region
 *
 * @example
 * // Valid
 * validateAvailabilityZones(['us-west-2a', 'us-west-2b'], 'us-west-2')
 *
 * // Throws error - wrong region
 * validateAvailabilityZones(['us-east-1a', 'us-east-1b'], 'us-west-2')
 */
export function validateAvailabilityZones(azs: string[], region: string): void {
  const invalidAzs = azs.filter(az => !az.startsWith(region));

  if (invalidAzs.length > 0) {
    throw new Error(
      `Invalid availability zones for region '${region}': ${invalidAzs.join(", ")}. ` +
        `All AZs must start with region name '${region}'. ` +
        "This usually indicates getAvailabilityZones() was called without explicit region parameter."
    );
  }

  // Warn if AZ count is unexpectedly low
  if (azs.length < 2) {
    console.warn(
      `Warning: Only ${azs.length} availability zone(s) found in ${region}. ` +
        "High availability requires at least 2 AZs."
    );
  }
}
