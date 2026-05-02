/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as policy from "@pulumi/policy";

export interface DeploymentProtectionOptions {
  /**
   * Environment identifiers that require CI/CD-driven deployment. A
   * `pulumi up` from a developer laptop targeting one of these
   * environments fails the policy.
   *
   * @example ["prd", "sec"]   // AdaptiveWorX
   * @example ["prod"]          // simpler convention
   */
  readonly productionEnvironments: readonly string[];

  /**
   * Resolves the current deployment's environment identifier. Required.
   * Typically derives from stack context (e.g. via
   * `detectStackContext()` from `@adaptiveworx/iac-core`, or from a
   * Pulumi config value).
   */
  readonly environmentResolver: () => string;

  /**
   * Detects whether the current process is running in a CI/CD context.
   * Default: returns `true` if any of `CI`, `GITHUB_ACTIONS`, or
   * `PULUMI_DEPLOYMENT` env vars are set.
   */
  readonly ciDetector?: () => boolean;

  /**
   * Message prepended to the violation when blocking a non-CI prod
   * deploy. Default suggests using `pulumi preview` locally and
   * deploying via GitHub Actions.
   */
  readonly violationMessage?: string;

  /** Policy name. Default `"deployment-protection"`. */
  readonly name?: string;

  /**
   * Enforcement level. Default `"advisory"` so non-prod deploys see
   * messages without blocking; the policy always blocks prod deploys
   * outside CI regardless of this level (the prod gate is enforced via
   * `reportViolation` only when applicable).
   */
  readonly enforcementLevel?: policy.EnforcementLevel;
}

const DEFAULT_CI_DETECTOR = (): boolean =>
  process.env.CI === "true" ||
  process.env.GITHUB_ACTIONS === "true" ||
  process.env.PULUMI_DEPLOYMENT !== undefined;

const DEFAULT_VIOLATION_MESSAGE =
  "Production deployments must run via CI/CD. " +
  "Use `pulumi preview` locally, then deploy via the configured pipeline.";

/**
 * Create a Pulumi policy that blocks production deployments from
 * non-CI/CD contexts (e.g. a developer's laptop).
 *
 * @example
 *   deploymentProtectionPolicy({
 *     productionEnvironments: ["prd", "sec"],
 *     environmentResolver: () => detectStackContext().environment,
 *   });
 */
export function deploymentProtectionPolicy(
  opts: DeploymentProtectionOptions
): policy.StackValidationPolicy {
  const isCi = opts.ciDetector ?? DEFAULT_CI_DETECTOR;
  const productionEnvs = new Set(opts.productionEnvironments);
  const message = opts.violationMessage ?? DEFAULT_VIOLATION_MESSAGE;

  return {
    name: opts.name ?? "deployment-protection",
    description: "Production deployments must originate from CI/CD",
    enforcementLevel: opts.enforcementLevel ?? "advisory",
    validateStack: (_args, reportViolation) => {
      const env = opts.environmentResolver();
      if (!productionEnvs.has(env)) {
        return;
      }
      if (isCi()) {
        return;
      }
      reportViolation(message);
    },
  };
}
