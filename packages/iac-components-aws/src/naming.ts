/**
 * Shared helpers for consistent resource naming across stacks and scripts.
 */

import type { Environment } from "./types.js";

/**
 * Canonical environment ordering for worx product line.
 */
export const ENVIRONMENTS = ["dev", "stg", "prd", "sec"] as const satisfies readonly Environment[];

const ENVIRONMENT_NAME_SEGMENTS: Record<Environment, string> = {
  dev: "dev",
  stg: "staging",
  prd: "prod",
  sec: "secops",
};

const GITHUB_OIDC_ROLE_SUFFIX = "github-actions-deploy";
const CROSS_ACCOUNT_ROLE_SUFFIX = "pulumi-cross-account";
const FOUNDATION_ROLE_SUFFIX = "foundation-access";

export function getEnvironmentSegment(environment: Environment): string {
  return ENVIRONMENT_NAME_SEGMENTS[environment];
}

export function buildGithubOidcRoleName(prefix: string, environment: Environment): string {
  const segment = getEnvironmentSegment(environment);
  return `${prefix}-${segment}-${GITHUB_OIDC_ROLE_SUFFIX}`;
}

export function buildCrossAccountRoleName(prefix: string, environment: Environment): string {
  const segment = getEnvironmentSegment(environment);
  return `${prefix}-${segment}-${CROSS_ACCOUNT_ROLE_SUFFIX}`;
}

export function buildFoundationAccessRoleName(prefix: string): string {
  return `${prefix}-${FOUNDATION_ROLE_SUFFIX}`;
}

export function buildFoundationAccessPolicyName(prefix: string): string {
  return `${buildFoundationAccessRoleName(prefix)}-policy`;
}

export function buildCrossAccountPolicyName(prefix: string, environment: Environment): string {
  return `${buildCrossAccountRoleName(prefix, environment)}-policy`;
}

export { GITHUB_OIDC_ROLE_SUFFIX, CROSS_ACCOUNT_ROLE_SUFFIX, FOUNDATION_ROLE_SUFFIX };
