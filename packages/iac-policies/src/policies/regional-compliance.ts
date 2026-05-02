/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as policy from "@pulumi/policy";

export interface RegionalComplianceOptions {
  /**
   * Region identifiers consumers are allowed to deploy into. Compared
   * exact-match against whatever `regionExtractor` returns for each
   * resource.
   */
  readonly allowedRegions: readonly string[];

  /**
   * Determines which resources to check. Default: AWS resources
   * (`type` starting with `aws:`). Override for Azure
   * (`startsWith("azure-native:")`), GCP, or multi-cloud.
   */
  readonly resourceTypeMatcher?: (resourceType: string) => boolean;

  /**
   * Extracts the region identifier from a resource's props. Default:
   * `args.props.region ?? process.env.AWS_REGION` (AWS convention).
   * Override for Azure (`args.props.location`) or other clouds.
   *
   * Return `undefined` to skip the region check for the resource (e.g.
   * for region-less resource types).
   */
  readonly regionExtractor?: (args: policy.ResourceValidationArgs) => string | undefined;

  /** Policy name. Default `"regional-compliance"`. */
  readonly name?: string;

  /** Enforcement level. Default `"mandatory"`. */
  readonly enforcementLevel?: policy.EnforcementLevel;
}

const DEFAULT_AWS_MATCHER = (type: string): boolean => type.startsWith("aws:");
const DEFAULT_AWS_REGION_EXTRACTOR = (args: policy.ResourceValidationArgs): string | undefined =>
  (args.props.region as string | undefined) ?? process.env.AWS_REGION;

/**
 * Create a Pulumi policy that enforces resources are deployed only in
 * an approved region allowlist.
 *
 * @example AWS (default behavior)
 *   regionalCompliancePolicy({ allowedRegions: ["us-east-1", "us-west-2"] });
 *
 * @example Azure
 *   regionalCompliancePolicy({
 *     allowedRegions: ["westus3", "eastus2"],
 *     resourceTypeMatcher: t => t.startsWith("azure-native:"),
 *     regionExtractor: args => args.props.location as string | undefined,
 *   });
 */
export function regionalCompliancePolicy(
  opts: RegionalComplianceOptions
): policy.ResourceValidationPolicy {
  const matcher = opts.resourceTypeMatcher ?? DEFAULT_AWS_MATCHER;
  const extractor = opts.regionExtractor ?? DEFAULT_AWS_REGION_EXTRACTOR;
  const allowed = new Set(opts.allowedRegions);

  return {
    name: opts.name ?? "regional-compliance",
    description: "Resources must be deployed in an approved region",
    enforcementLevel: opts.enforcementLevel ?? "mandatory",
    validateResource: (args, reportViolation) => {
      if (!matcher(args.type)) {
        return;
      }

      const region = extractor(args);
      if (region === undefined) {
        reportViolation(`Resource ${args.urn} missing region specification`);
        return;
      }

      if (!allowed.has(region)) {
        reportViolation(
          `Resource ${args.urn} deployed in unauthorized region: ${region}. ` +
            `Allowed: ${opts.allowedRegions.join(", ")}`
        );
      }
    },
  };
}
