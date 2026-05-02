/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as policy from "@pulumi/policy";

/**
 * AWS resource types that don't accept tags directly. Provided as a
 * convenience for AWS consumers — combine with your own skip list:
 *
 *     skipResourceTypes: [...AWS_NON_TAGGABLE_RESOURCES, "my:other/Type"]
 *
 * (Tags on these types are either invalid or land on a sibling resource;
 * trying to enforce required-tags on them produces false positives.)
 */
export const AWS_NON_TAGGABLE_RESOURCES: readonly string[] = [
  "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
  "aws:iam/policyAttachment:PolicyAttachment",
  "aws:iam/userPolicyAttachment:UserPolicyAttachment",
  "aws:iam/groupPolicyAttachment:GroupPolicyAttachment",
  "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
  "aws:s3/bucketVersioning:BucketVersioning",
  "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock",
  "aws:s3/bucketLifecycleConfiguration:BucketLifecycleConfiguration",
  "aws:ram/principalAssociation:PrincipalAssociation",
  "aws:ram/resourceAssociation:ResourceAssociation",
  "aws:ec2/routeTableAssociation:RouteTableAssociation",
  "aws:ec2/route:Route",
  "aws:ec2/networkAclAssociation:NetworkAclAssociation",
  "aws:ec2/networkAclRule:NetworkAclRule",
] as const;

export interface RequireTagsOptions {
  /** Tag names that all (non-skipped) resources must carry. */
  readonly requiredTags: readonly string[];

  /**
   * Optional: expected values for specific tag names. When provided, a
   * resource whose tag value differs from the expected reports a
   * violation. The function form lets the consumer derive expected
   * values from stack context (e.g. `Environment` should equal the
   * current Pulumi stack's environment).
   *
   * Returns a `Record<tagName, expectedValue>`. Tags not in the record
   * are checked only for presence, not value.
   */
  readonly expectedTagValues?: () => Record<string, string>;

  /**
   * Resource types to skip entirely. Use `AWS_NON_TAGGABLE_RESOURCES`
   * for the AWS-standard skip list, plus any consumer-specific types.
   */
  readonly skipResourceTypes?: readonly string[];

  /**
   * Resource type prefixes to skip. Default: `["pulumi:"]` (skip Pulumi
   * internal types like `pulumi:providers:*`, `pulumi:pulumi:Stack`).
   * Override to add other prefixes (e.g. `"adaptiveworx:"` for component
   * resources whose children carry the tags instead).
   */
  readonly skipResourceTypePrefixes?: readonly string[];

  /** Policy name. Default `"require-tags"`. */
  readonly name?: string;

  /** Enforcement level. Default `"mandatory"`. */
  readonly enforcementLevel?: policy.EnforcementLevel;
}

/**
 * Create a Pulumi policy that requires specified tags on all resources.
 *
 * Cross-cloud — works for any provider whose resource props expose a
 * `tags` (or AWS-style `Tags`) field. Optionally validates tag values
 * against expected values derived from stack context.
 *
 * @example
 *   requireTagsPolicy({
 *     requiredTags: ["Environment", "Owner", "CostCenter"],
 *     expectedTagValues: () => ({
 *       Environment: process.env.ENV ?? "dev",
 *     }),
 *     skipResourceTypes: AWS_NON_TAGGABLE_RESOURCES,
 *   });
 */
export function requireTagsPolicy(opts: RequireTagsOptions): policy.ResourceValidationPolicy {
  const skipTypes = new Set(opts.skipResourceTypes ?? []);
  const skipPrefixes = opts.skipResourceTypePrefixes ?? ["pulumi:"];

  return {
    name: opts.name ?? "require-tags",
    description: "Required tags enforcement for governance and cost allocation",
    enforcementLevel: opts.enforcementLevel ?? "mandatory",
    validateResource: (args, reportViolation) => {
      if (skipTypes.has(args.type)) {
        return;
      }
      for (const prefix of skipPrefixes) {
        if (args.type.startsWith(prefix)) {
          return;
        }
      }

      const tags = (args.props.tags ?? args.props.Tags ?? {}) as Record<string, string>;
      const hasTagsField = args.props.tags !== undefined || args.props.Tags !== undefined;

      if (!hasTagsField) {
        reportViolation(
          `Resource ${args.urn} missing tags field. Required tags: ${opts.requiredTags.join(", ")}`
        );
        return;
      }

      const missingTags = opts.requiredTags.filter(t => !tags[t]);
      if (missingTags.length > 0) {
        reportViolation(`Resource ${args.urn} missing required tags: ${missingTags.join(", ")}`);
      }

      if (opts.expectedTagValues) {
        const expected = opts.expectedTagValues();
        for (const [tagName, expectedValue] of Object.entries(expected)) {
          const actual = tags[tagName];
          if (actual !== undefined && actual !== expectedValue) {
            reportViolation(
              `Resource ${args.urn} has incorrect ${tagName} tag: ${actual}. Expected: ${expectedValue}`
            );
          }
        }
      }
    },
  };
}
