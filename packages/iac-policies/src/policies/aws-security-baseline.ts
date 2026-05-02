/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as policy from "@pulumi/policy";

export interface AwsSecurityBaselineChecks {
  /** Reject S3 buckets with `acl: "public-read"` or `"public-read-write"`. Default `true`. */
  readonly s3PublicAcl?: boolean;
  /** Require S3 server-side encryption configuration to declare at least one rule. Default `true`. */
  readonly s3Encryption?: boolean;
}

export interface AwsSecurityBaselineOptions {
  /** Per-check toggles. Each defaults to `true`. */
  readonly checks?: AwsSecurityBaselineChecks;

  /** Policy name. Default `"aws-security-baseline"`. */
  readonly name?: string;

  /** Enforcement level. Default `"mandatory"`. */
  readonly enforcementLevel?: policy.EnforcementLevel;
}

/**
 * AWS-specific security baseline checks. Currently:
 *
 *   - S3 bucket public-ACL rejection
 *   - S3 server-side encryption presence requirement
 *
 * Use alongside cross-cloud policies; for Azure/GCP equivalents write
 * cloud-specific factories.
 *
 * @example
 *   awsSecurityBaselinePolicy(); // all default checks on
 *
 * @example Disable a single check
 *   awsSecurityBaselinePolicy({ checks: { s3PublicAcl: false } });
 */
export function awsSecurityBaselinePolicy(
  opts: AwsSecurityBaselineOptions = {}
): policy.ResourceValidationPolicy {
  const checks: Required<AwsSecurityBaselineChecks> = {
    s3PublicAcl: opts.checks?.s3PublicAcl ?? true,
    s3Encryption: opts.checks?.s3Encryption ?? true,
  };

  return {
    name: opts.name ?? "aws-security-baseline",
    description: "AWS resource security baseline (secure-by-default)",
    enforcementLevel: opts.enforcementLevel ?? "mandatory",
    validateResource: (args, reportViolation) => {
      if (checks.s3PublicAcl && args.type === "aws:s3/bucket:Bucket") {
        const acl = args.props.acl as string | undefined;
        if (acl === "public-read" || acl === "public-read-write") {
          reportViolation(`S3 bucket ${args.urn} cannot have public ACL (secure-by-default)`);
        }
      }

      if (
        checks.s3Encryption &&
        args.type ===
          "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration"
      ) {
        const rules = args.props.rules as unknown[] | undefined;
        if (!rules || rules.length === 0) {
          reportViolation(
            `S3 encryption configuration ${args.urn} must have at least one encryption rule`
          );
        }
      }
    },
  };
}
