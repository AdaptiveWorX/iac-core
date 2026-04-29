/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AWS-specific CIDR allocation: looks up a per-environment base block
 * from `SecretManager` (key: `VPC_CIDR_BASE_<ENV>`), then offsets it by
 * the region's slot from `AWS_REGION_CIDR_OFFSETS`.
 *
 * Pure CIDR math (`calculateVpcCidr`) lives in `@adaptiveworx/iac-core`
 * — this module is the AWS-specific composition layer.
 */

import { calculateVpcCidr, type SecretManager } from "@adaptiveworx/iac-core";
import { AWS_REGION_CIDR_OFFSETS } from "./regions.js";

/**
 * Compute the canonical AWS VPC CIDR for an environment + region.
 *
 * @param environment   environment identifier (`dev`, `stg`, `prd`, `sec`)
 * @param region        AWS region name (e.g. `us-east-1`); aliases not accepted
 * @param secretManager SecretManager that exposes `VPC_CIDR_BASE` per environment
 *   (Infisical routes by environment path; the secret name itself is constant)
 * @throws if the region isn't in the offset table or the base secret is
 *   missing
 */
export async function getAwsVpcCidr(
  environment: string,
  region: string,
  secretManager: SecretManager
): Promise<string> {
  const offset = AWS_REGION_CIDR_OFFSETS[region];
  if (offset === undefined) {
    throw new Error(
      `getAwsVpcCidr: no CIDR offset registered for AWS region '${region}'. ` +
        "Add it to AWS_REGION_CIDR_OFFSETS in @adaptiveworx/iac-aws if it's a valid region."
    );
  }
  const cidrBase = await secretManager.getSecret("VPC_CIDR_BASE", {
    cloud: "aws",
    environment,
  });
  return calculateVpcCidr(cidrBase, offset);
}
