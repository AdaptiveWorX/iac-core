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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const here = dirname(fileURLToPath(import.meta.url));
// At runtime this resolves to <package>/config/regions.json. The relative
// path holds in both monorepo source layout (libs/iac/schemas/src → ../config)
// and the published-npm layout (dist/ → ../config).
const regionsPath = join(here, "..", "config", "regions.json");

/**
 * Region aliases + canonical region names per cloud provider (aws, azure,
 * gcp, cloudflare). Source-of-truth for region resolution across the
 * @adaptiveworx/iac-* packages.
 */
export const regions: Regions = JSON.parse(readFileSync(regionsPath, "utf8")) as Regions;
