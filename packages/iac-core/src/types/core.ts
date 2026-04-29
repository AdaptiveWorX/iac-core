/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core type definitions for agent-optimized infrastructure orchestration
 * These types form the foundation of the TypeScript-first IaC system
 */

/**
 * Supported cloud providers
 */
export type CloudProvider = "aws" | "gcp" | "azure" | "cloudflare";

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
 * AWS regions where OPT-IN is NOT REQUIRED
 * Includes both full region names and shorthand codes
 */
export type AwsRegion =
  // US Regions (full names)
  | "us-east-1"
  | "us-east-2"
  | "us-west-1"
  | "us-west-2"
  // US Regions (shorthand)
  | "use1"
  | "use2"
  | "usw1"
  | "usw2"
  // Asia Pacific (full names)
  | "ap-south-1"
  | "ap-northeast-1"
  | "ap-northeast-2"
  | "ap-northeast-3"
  | "ap-southeast-1"
  | "ap-southeast-2"
  // Asia Pacific (shorthand)
  | "aps1"
  | "apne1"
  | "apne2"
  | "apne3"
  | "apse1"
  | "apse2"
  // Europe (full names)
  | "eu-central-1"
  | "eu-west-1"
  | "eu-west-2"
  | "eu-west-3"
  | "eu-north-1"
  // Europe (shorthand)
  | "euc1"
  | "euw1"
  | "euw2"
  | "euw3"
  | "eun1"
  // Canada (full names)
  | "ca-central-1"
  // Canada (shorthand)
  | "cac1"
  // South America (full names)
  | "sa-east-1"
  // South America (shorthand)
  | "sae1";

/**
 * Stack context interface - contains all information needed to identify deployment target
 * Architecture: adaptiveworx/{tenant}-{cloud}-{env}/{account-purpose}-{stack-purpose}-{concern}-{region}
 * Or for centralized resources: adaptiveworx/{tenant}-{cloud}-{env}/{target-env}-{account-purpose}-{stack-purpose}-{concern}-{region}
 *
 * Project: {tenant}-{cloud}-{env} (e.g., worx-aws-dev, care-aws-prd)
 * Stack: {account-purpose}-{stack-purpose}-{concern}-{region} (e.g., ops-iam-github-use1)
 * Stack (centralized): {target-env}-{account-purpose}-{stack-purpose}-{concern}-{region} (e.g., dev-ops-vpc-shared-use1)
 *
 * Org: Pulumi Cloud organization (always "adaptiveworx")
 * Tenant: Multi-tenant identifier (worx, care, etc.) - each tenant can have different compliance requirements
 * Concern: Optional descriptor for blast radius isolation (e.g., "github", "sso", "appName1")
 */
export interface StackContext {
  readonly org: string;
  readonly tenant: string;
  readonly cloud: CloudProvider;
  readonly accountPurpose: AccountPurpose;
  readonly stackPurpose: StackPurpose;
  readonly environment: Environment;
  readonly region: AwsRegion;
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
  readonly awsRegion: AwsRegion;
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
export interface ResourceNaming {
  readonly orgPrefix: string;
  readonly cloud: CloudProvider;
  readonly accountPurpose: AccountPurpose;
  readonly stackPurpose: StackPurpose;
  readonly environment: Environment;
  readonly region: AwsRegion;
}

/**
 * Policy configuration for automated governance
 */
export interface PolicyConfig {
  readonly enableCostGuardrails: boolean;
  readonly enableSecurityPolicies: boolean;
  readonly enableCompliancePolicies: boolean;
  readonly maxMonthlyCostUsd: number;
  readonly allowedRegions: readonly AwsRegion[];
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
