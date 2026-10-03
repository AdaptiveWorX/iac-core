/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core type definitions for agent-optimized infrastructure orchestration
 * These types form the foundation of the TypeScript-first IaC system
 */

import type { AwsRegion } from "../schemas/core/core-schemas.js";
import type { GlobalRegion, Provider } from "../schemas/core/providers.js";

/**
 * Environment classification for policy and CI/CD behavior
 * Organizations define custom environment names (dev, qa, uat, prod, etc.)
 * but classify them into standard categories for consistent policy application
 */
export type EnvironmentClass =
  | "development" // Experimental, short retention, relaxed policies
  | "testing" // QA/UAT, moderate retention, moderate policies
  | "staging" // Pre-production, longer retention, strict policies
  | "production" // Live systems, maximum retention, strictest policies
  | "operations" // Shared/security infrastructure, compliance-focused
  | "disaster-recovery"; // Backup systems, archival policies

/**
 * Deployment environment name
 * Configuration-driven from AWS_ACCOUNTS in Infisical
 * Organizations can use any naming convention (dev, development, qa, uat, stg, staging, prod, production, etc.)
 * Each environment is classified into an EnvironmentClass for policy behavior
 */
export type Environment = string;

/**
 * Account purpose for multi-account deployments
 * Configuration-driven from AWS_ACCOUNTS in Infisical
 * Common values: "ops", "app", "lake", "ucx"
 */
export type AccountPurpose = string;

/**
 * Stack purpose classification for policy behavior
 * Determines what type of infrastructure is being deployed and associated policy requirements
 */
export type StackPurposeClass =
  | "infrastructure" // Foundational network/compute: vpc, cicd, vpn, bastion
  | "security" // Security & identity: iam, secrets, kms, waf, firewall (always strict)
  | "compute" // Application workloads: web, api, ai, ml, worker
  | "data" // Data management: data, cache, queue, storage, backup
  | "observability" // Monitoring & ops: obs, logging, metrics, tracing
  | "edge" // Edge/distribution: cdn, edge-compute, iot-gateway
  | "integration"; // External integrations: webhooks, events, messaging

/**
 * Stack purpose for deployment-level organization
 * Configuration-driven - organizations can define custom purposes
 * Hybrid lookup: STACK_PURPOSES in Infisical → well-known catalog → inference
 */
export type StackPurpose = string;

/**
 * Stack context interface - contains all information needed to identify deployment target
 * Architecture: {org}/{tenant}-{provider}-{env}/[{target-env}-]{account-purpose}-{stack-purpose}[-{concern}]-{region}
 *
 * Project: {tenant}-{provider}-{env} (e.g., worx-aws-dev, worx-cloudflare-sec)
 * Stack: {account-purpose}-{stack-purpose}[-{concern}]-{region} (e.g., ops-iam-github-use1, ops-ztna-glb)
 * Stack (centralized): {target-env}-{account-purpose}-{stack-purpose}[-{concern}]-{region} (e.g., dev-ops-vpc-use1)
 *
 * Org: Pulumi Cloud organization (always "adaptiveworx")
 * Tenant: Multi-tenant identifier (worx, care, etc.) - each tenant can have different compliance requirements
 * Concern: Optional descriptor for blast radius isolation (e.g., "github", "sso", "appName1")
 */
export interface StackContext {
  readonly org: string;
  readonly tenant: string;
  /** The project's provider: the `{provider}` segment of `{tenant}-{provider}-{env}`. */
  readonly provider: Provider;
  readonly accountPurpose: AccountPurpose;
  readonly stackPurpose: StackPurpose;
  readonly environment: Environment;
  /** The stack's region code: the provider's (AWS `use1`, …) or `glb`. */
  readonly region: StackRegion;
  readonly projectName: string;
  readonly stackName: string;
  readonly concern?: string;
  readonly targetEnvironment?: Environment;
}

/**
 * Deployment configuration interface - contains runtime configuration
 */
export interface DeploymentConfig {
  readonly tenant: string;
  readonly orgName: string;
  readonly orgDomain: string;
  readonly accountPurposes: readonly string[]; // Loaded from AWS_ACCOUNTS configuration
  readonly accountEnvironments: readonly Environment[];
  readonly enableMultiPurpose: boolean;
  readonly useInfisical: boolean;
  readonly provider: Provider;
  readonly region: StackRegion;
}

/**
 * Validation result for agent-friendly error handling
 */
export interface ValidationResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly errors?: ValidationError[];
}

/**
 * Structured validation error for agent consumption
 */
export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly code: ValidationErrorCode;
  readonly severity: "error" | "warning" | "info";
}

/**
 * Validation error codes for programmatic handling
 */
export type ValidationErrorCode =
  | "REQUIRED_FIELD_MISSING"
  | "INVALID_FORMAT"
  | "INVALID_VALUE"
  | "CONSTRAINT_VIOLATION"
  | "SECURITY_VIOLATION"
  | "POLICY_VIOLATION"
  | "CROSS_ACCOUNT_VIOLATION";

/**
 * Compliance requirements for account configuration
 */
export type ComplianceRequirement = "pci-dss" | "hipaa" | "sox" | "gdpr" | "iso27001" | "nist";

/**
 * Account configuration with compliance requirements
 */
export interface AccountConfig {
  readonly accountPurpose: AccountPurpose;
  readonly environment: Environment;
  readonly complianceRequirements: readonly ComplianceRequirement[];
  readonly enableLogging: boolean;
  readonly enableMonitoring: boolean;
  readonly enableBackup: boolean;
  readonly retentionPolicyDays: number;
}

/**
 * CIDR block allocation for multi-environment networking
 */
export interface CidrAllocation {
  readonly environment: Environment;
  readonly vpcCidr: string;
  readonly publicSubnets: readonly string[];
  readonly privateSubnets: readonly string[];
  readonly databaseSubnets: readonly string[];
}

/**
 * Resource naming configuration
 */
/**
 * A stack's region: an AWS region (code or full name), `glb` / `global` for
 * providers without regions, or another provider's region code.
 */
export type StackRegion = AwsRegion | GlobalRegion | (string & {});

export interface ResourceNaming {
  readonly orgPrefix: string;
  readonly provider: Provider;
  readonly accountPurpose: AccountPurpose;
  readonly stackPurpose: StackPurpose;
  readonly environment: Environment;
  readonly region: StackRegion;
}

/**
 * Policy configuration for automated governance
 */
export interface PolicyConfig {
  readonly enableCostGuardrails: boolean;
  readonly enableSecurityPolicies: boolean;
  readonly enableCompliancePolicies: boolean;
  readonly maxMonthlyCostUsd: number;
  readonly provider: Provider;
  readonly allowedRegions: readonly StackRegion[];
  readonly requiredTags: readonly string[];
}

/**
 * Agent guardrail configuration
 */
export interface AgentGuardrails {
  readonly enablePreflightValidation: boolean;
  readonly enableRiskAssessment: boolean;
  readonly enableAutoApproval: boolean;
  readonly maxRiskScore: number;
  readonly requireManualApproval: readonly string[];
}
