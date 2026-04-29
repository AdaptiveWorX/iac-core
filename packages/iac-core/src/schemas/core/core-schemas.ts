/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Zod schemas for runtime validation and agent-optimized error handling
 * These schemas provide type-safe validation with structured error messages
 */

import { z } from "zod";
import type { ComplianceRequirement } from "../../types/core.js";

/**
 * Cloud provider schema with agent-friendly validation
 */
export const CloudProviderSchema = z.enum(["aws", "gcp", "azure"]);

/**
 * Environment classification schema for policy behavior
 * Maps user-defined environment names to standardized categories
 */
export const EnvironmentClassSchema = z.enum([
  "development",
  "testing",
  "staging",
  "production",
  "operations",
  "disaster-recovery",
]);

/**
 * Environment schema - configuration-driven from AWS_ACCOUNTS
 *
 * DESIGN PRINCIPLE: Validates FORMAT, not VALUES
 * Tenants define their own environment names based on organizational needs.
 *
 * Common patterns:
 * - dev, development: Development/experimental environments
 * - qa, uat, sit: Testing/QA environments
 * - stg, staging, preprod: Pre-production staging
 * - prd, prod, production: Production/live systems
 * - dr: Disaster recovery
 * - sandbox, local: Individual developer environments
 *
 * Organizations can use any lowercase alphanumeric string (2-15 chars).
 * Each environment is classified into an EnvironmentClass for policy behavior.
 */
export const EnvironmentSchema = z
  .string()
  .min(2)
  .max(15)
  .regex(
    /^[a-z][a-z0-9]*$/,
    "Environment must start with lowercase letter and contain only lowercase alphanumeric characters"
  );

/**
 * Account purpose schema - configuration-driven from AWS_ACCOUNTS
 *
 * DESIGN PRINCIPLE: Validates FORMAT, not VALUES
 * Tenants define their own account purposes based on organizational structure.
 *
 * Common patterns:
 * - app: Application workloads
 * - ops: Operational/shared infrastructure
 * - ucx: Amazon Connect (Unified Communications eXperience) - PCI-DSS/HIPAA compliance
 * - agent: AI/ML agent workloads - isolated compute/data
 * - data: Data lake/warehouse accounts
 * - lake: Alternative to "data" for data platforms
 * - phi: Protected Health Information (HIPAA compliance)
 * - training: ML model training pipelines
 * - inference: ML model serving infrastructure
 * - pci: PCI-DSS compliant payment processing
 * - sox: SOX compliant financial systems
 *
 * Accepts any lowercase alphanumeric string (2-10 chars) to support
 * unlimited tenant-specific organizational boundaries.
 *
 * See docs/extending-configuration.md for adding custom account purposes.
 */
export const AccountPurposeSchema = z
  .string()
  .min(2)
  .max(10)
  .regex(
    /^[a-z][a-z0-9]*$/,
    "Account purpose must start with lowercase letter and contain only lowercase alphanumeric characters"
  );

/**
 * Stack purpose classification schema
 */
export const StackPurposeClassSchema = z.enum([
  "infrastructure",
  "security",
  "compute",
  "data",
  "observability",
  "edge",
  "integration",
]);

/**
 * Stack purpose schema - configuration-driven
 *
 * DESIGN PRINCIPLE: Validates FORMAT, not VALUES
 * Tenants define their own stack purposes based on infrastructure patterns.
 *
 * Common patterns:
 * - Infrastructure: vpc, vpn, bastion, cicd, dns
 * - Applications: web, api, worker, scheduler
 * - Data: data, cache, queue, storage, backup
 * - AI/ML: ml, ml-training, ml-inference, agent-runtime
 * - Security: iam, secrets, kms, waf, firewall
 * - Observability: monitoring, logging, metrics, tracing
 *
 * Accepts any lowercase alphanumeric string with hyphens (2-20 chars).
 * Hyphens allowed for compound names (e.g., "ml-training", "data-pipeline").
 *
 * See docs/extending-configuration.md for patterns and examples.
 */
export const StackPurposeSchema = z
  .string()
  .min(2)
  .max(20)
  .regex(
    /^[a-z][a-z0-9-]*$/,
    "Stack purpose must start with lowercase letter and contain only lowercase alphanumeric characters and hyphens"
  );

/**
 * AWS region schema with regional compliance considerations
 * Accepts both full region names (us-east-1) and compressed codes (use1)
 */
export const AwsRegionSchema = z.enum([
  // Full AWS region names
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  // Compressed region codes
  "use1",
  "use2",
  "usw1",
  "usw2",
  "euw1",
  "euw2",
  "euc1",
  "apse1",
  "apse2",
  "apne1",
]);

export type AwsRegion = z.infer<typeof AwsRegionSchema>;

/**
 * Compliance requirement schema
 */
export const ComplianceRequirementSchema = z.enum([
  "pci-dss",
  "hipaa",
  "sox",
  "gdpr",
  "iso27001",
  "nist",
]);

/**
 * Organization prefix validation with business rules
 */
export const OrgPrefixSchema = z
  .string()
  .min(2, "Organization prefix must be at least 2 characters")
  .max(8, "Organization prefix must be at most 8 characters")
  .regex(
    /^[a-z][a-z0-9]*$/,
    "Organization prefix must start with lowercase letter and contain only lowercase letters and numbers"
  )
  .refine(val => !val.includes("test"), {
    message: "Organization prefix cannot contain 'test' for production safety",
  });

/**
 * Project name validation for tenant-cloud-env format
 * Pattern: {tenant}-{cloud}-{env} (e.g., worx-aws-dev, care-gcp-prd)
 */
export const ProjectNameSchema = z
  .string()
  .min(7, "Project name too short")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Project name must be kebab-case")
  .refine(
    val => {
      const parts = val.split("-");
      return parts.length === 3; // tenant-cloud-env
    },
    {
      message: "Project name must follow pattern: {tenant}-{cloud}-{env}",
    }
  );

/**
 * Stack name validation following 3-part or 4-part naming convention
 * 3-part: {account-purpose}-{stack-purpose}-{region} (e.g., app-web-use1)
 * 4-part: {target-env}-{account-purpose}-{stack-purpose}-{region} (e.g., dev-ops-vpc-use1)
 *
 * 4-part naming is used for centralized resources (VPCs, DNS, etc.) deployed in
 * one environment but serving another environment.
 */
export const StackNameSchema = z
  .string()
  .min(5, "Stack name too short")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Stack name must be kebab-case")
  .refine(
    val => {
      const parts = val.split("-");
      return parts.length === 3 || parts.length === 4;
    },
    {
      message:
        "Stack name must follow pattern: {account-purpose}-{stack-purpose}-{region} or {target-env}-{account-purpose}-{stack-purpose}-{region}",
    }
  );

/**
 * Stack context schema with cross-field validation for project/stack naming
 * Architecture: adaptiveworx/{tenant}-{cloud}-{env}/{account-purpose}-{stack-purpose}-{concern}-{region}
 * Or for centralized resources: adaptiveworx/{tenant}-{cloud}-{env}/{target-env}-{account-purpose}-{stack-purpose}-{concern}-{region}
 * Concern: Optional descriptor for blast radius isolation (e.g., "github", "sso", "appName1")
 */
export const StackContextSchema = z
  .object({
    org: z.string().min(1), // Pulumi Cloud organization (e.g., "adaptiveworx")
    tenant: OrgPrefixSchema, // Multi-tenant identifier (worx, care, etc.)
    cloud: CloudProviderSchema,
    accountPurpose: AccountPurposeSchema,
    stackPurpose: StackPurposeSchema,
    environment: EnvironmentSchema,
    region: AwsRegionSchema,
    projectName: ProjectNameSchema,
    stackName: StackNameSchema,
    concern: z.string().optional(),
    targetEnvironment: EnvironmentSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Agent guardrail: Validate project name consistency
    const expectedProjectName = `${data.tenant}-${data.cloud}-${data.environment}`;
    if (data.projectName !== expectedProjectName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Project name '${data.projectName}' does not match expected pattern '${expectedProjectName}'`,
        path: ["projectName"],
      });
    }

    // Agent guardrail: Validate stack name consistency with optional targetEnvironment and concern
    let expectedStackName: string;
    const hasTargetEnv = data.targetEnvironment !== undefined;
    const hasConcern = data.concern !== undefined && data.concern.trim() !== "";

    if (hasTargetEnv && hasConcern) {
      // 5-part: target-account-stack-concern-region
      expectedStackName = `${data.targetEnvironment}-${data.accountPurpose}-${data.stackPurpose}-${data.concern}-${data.region}`;
    } else if (hasTargetEnv) {
      // 4-part with target: target-account-stack-region
      expectedStackName = `${data.targetEnvironment}-${data.accountPurpose}-${data.stackPurpose}-${data.region}`;
    } else if (hasConcern) {
      // 4-part with concern: account-stack-concern-region
      expectedStackName = `${data.accountPurpose}-${data.stackPurpose}-${data.concern}-${data.region}`;
    } else {
      // 3-part: account-stack-region
      expectedStackName = `${data.accountPurpose}-${data.stackPurpose}-${data.region}`;
    }

    if (data.stackName !== expectedStackName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Stack name '${data.stackName}' does not match expected pattern '${expectedStackName}'`,
        path: ["stackName"],
      });
    }

    // Agent guardrail: targetEnvironment only allowed for centralized resources
    if (data.targetEnvironment !== undefined && data.targetEnvironment.length > 0) {
      const allowedCentralized = ["vpc", "cicd", "vpn", "monitoring"];
      if (!allowedCentralized.includes(data.stackPurpose)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `targetEnvironment is only allowed for centralized resources: ${allowedCentralized.join(", ")}`,
          path: ["targetEnvironment"],
        });
      }

      // Must be deployed in sec environment
      if (data.environment !== "sec") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Centralized resources with targetEnvironment must be deployed in 'sec' environment",
          path: ["environment"],
        });
      }

      // accountPurpose must be ops for centralized resources
      if (data.accountPurpose !== "ops") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Centralized resources with targetEnvironment must use 'ops' account purpose",
          path: ["accountPurpose"],
        });
      }
    }

    // Agent guardrail: Production environment safety checks
    if (data.environment === "prd") {
      if (data.accountPurpose === "ops" && data.region !== "us-east-1") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Production ops accounts must be deployed in us-east-1",
          path: ["region"],
        });
      }
    }

    // Agent guardrail: UCX compliance validation
    if (data.accountPurpose === "ucx" && !["us-east-1", "us-west-2"].includes(data.region)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UCX accounts require US regions for compliance",
        path: ["region"],
      });
    }

    // Agent guardrail: VPC deployment validation
    if (data.stackPurpose === "vpc" && data.accountPurpose !== "ops") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "VPC infrastructure must be deployed in ops account only",
        path: ["accountPurpose"],
      });
    }

    // Agent guardrail: CI/CD infrastructure validation
    if (data.stackPurpose === "cicd" && data.accountPurpose !== "ops") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CI/CD infrastructure must be deployed in ops account only",
        path: ["accountPurpose"],
      });
    }
  });

/**
 * Deployment configuration schema with comprehensive validation
 */
export const DeploymentConfigSchema = z
  .object({
    tenant: OrgPrefixSchema,
    orgName: z.string().min(2, "Organization name required").max(100),
    orgDomain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Invalid domain format"),
    accountPurposes: z.array(AccountPurposeSchema).min(1, "At least one account purpose required"),
    accountEnvironments: z.array(EnvironmentSchema).min(1, "At least one environment required"),
    enableMultiPurpose: z.boolean(),
    useInfisical: z.boolean(),
    awsRegion: AwsRegionSchema,
  })
  .superRefine((data, ctx) => {
    // Agent guardrail: Multi-purpose account validation
    if (data.enableMultiPurpose && data.accountPurposes.includes("ucx")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UCX accounts cannot be multi-purpose for compliance reasons",
        path: ["enableMultiPurpose"],
      });
    }

    // Agent guardrail: Production environment validation
    if (data.accountEnvironments.includes("prd")) {
      if (!data.useInfisical) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Production environments require Infisical for secrets management",
          path: ["useInfisical"],
        });
      }
    }
  });

/**
 * Account configuration schema with compliance validation
 */
export const AccountConfigSchema = z
  .object({
    accountPurpose: AccountPurposeSchema,
    environment: EnvironmentSchema,
    complianceRequirements: z.array(ComplianceRequirementSchema),
    enableLogging: z.boolean(),
    enableMonitoring: z.boolean(),
    enableBackup: z.boolean(),
    retentionPolicyDays: z.number().int().min(30).max(2557), // 30 days to 7 years
  })
  .superRefine((data, ctx) => {
    // Agent guardrail: UCX compliance requirements
    if (data.accountPurpose === "ucx") {
      const requiredCompliance: ComplianceRequirement[] = ["pci-dss", "hipaa"];
      const missing = requiredCompliance.filter(req => !data.complianceRequirements.includes(req));

      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `UCX accounts require compliance: ${missing.join(", ")}`,
          path: ["complianceRequirements"],
        });
      }

      // UCX accounts must have all monitoring enabled
      if (!(data.enableLogging && data.enableMonitoring && data.enableBackup)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UCX accounts require logging, monitoring, and backup enabled",
          path: ["enableLogging", "enableMonitoring", "enableBackup"],
        });
      }
    }

    // Agent guardrail: Production environment requirements
    if (data.environment === "prd") {
      if (data.retentionPolicyDays < 365) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Production environments require minimum 365-day retention",
          path: ["retentionPolicyDays"],
        });
      }
    }
  });

/**
 * CIDR allocation schema with network validation
 */
export const CidrAllocationSchema = z
  .object({
    environment: EnvironmentSchema,
    vpcCidr: z
      .string()
      .regex(
        /^10\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\/([0-9]{1,2})$/,
        "VPC CIDR must be valid RFC1918 format"
      ),
    publicSubnets: z.array(z.string()).min(2, "At least 2 public subnets required for HA"),
    privateSubnets: z.array(z.string()).min(2, "At least 2 private subnets required for HA"),
    databaseSubnets: z.array(z.string()).min(2, "At least 2 database subnets required for HA"),
  })
  .superRefine((data, ctx) => {
    // Agent guardrail: Environment-specific CIDR validation
    const cidrParts = data.vpcCidr.split(".");
    const cidrPrefix = cidrParts.length > 1 ? cidrParts[1] : null;

    // CIDR ranges based on environment classification (cidr-allocation-strategy.md)
    // Organizations with custom environments may skip this validation
    const expectedPrefixes: Record<string, [string, string]> = {
      // Production: 10.0.0.0/9
      prd: ["0", "127"],
      prod: ["0", "127"],
      production: ["0", "127"],

      // Staging: 10.192.0.0/11
      stg: ["192", "223"],
      stage: ["192", "223"],
      staging: ["192", "223"],

      // Development: 10.224.0.0/11
      dev: ["224", "255"],
      development: ["224", "255"],

      // Operations/Security: can use any range
      sec: ["0", "255"],
      security: ["0", "255"],
      ops: ["0", "255"],
      operations: ["0", "255"],
    };

    const prefixRange = expectedPrefixes[data.environment.toLowerCase()];
    if (prefixRange !== undefined) {
      const [minPrefix, maxPrefix] = prefixRange;
      const cidrNum = Number.parseInt(cidrPrefix ?? "0", 10);
      const minRange = Number.parseInt(minPrefix, 10);
      const maxRange = Number.parseInt(maxPrefix, 10);

      if (Number.isNaN(cidrNum) || cidrNum < minRange || cidrNum > maxRange) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${data.environment.toUpperCase()} environment CIDR must be in range 10.${minPrefix}.0.0 - 10.${maxPrefix}.255.255`,
          path: ["vpcCidr"],
        });
      }
    }
    // Skip CIDR validation for custom environment names
  });

/**
 * Policy configuration schema for governance
 */
export const PolicyConfigSchema = z
  .object({
    enableCostGuardrails: z.boolean(),
    enableSecurityPolicies: z.boolean(),
    enableCompliancePolicies: z.boolean(),
    maxMonthlyCostUsd: z.number().min(100).max(1000000),
    allowedRegions: z.array(AwsRegionSchema).min(1),
    requiredTags: z.array(z.string()).min(1),
  })
  .superRefine((data, ctx) => {
    // Agent guardrail: Production cost validation
    if (data.maxMonthlyCostUsd > 50000 && !data.enableCostGuardrails) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "High-cost deployments require cost guardrails enabled",
        path: ["enableCostGuardrails"],
      });
    }
  });

/**
 * Agent guardrails schema
 */
export const AgentGuardrailsSchema = z
  .object({
    enablePreflightValidation: z.boolean(),
    enableRiskAssessment: z.boolean(),
    enableAutoApproval: z.boolean(),
    maxRiskScore: z.number().min(0).max(100),
    requireManualApproval: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    // Agent guardrail: High-risk operations require manual approval
    if (data.maxRiskScore > 70 && data.enableAutoApproval) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "High-risk operations cannot have auto-approval enabled",
        path: ["enableAutoApproval"],
      });
    }
  });

/**
 * Validation error schema for structured error handling
 */
export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.enum([
    "REQUIRED_FIELD_MISSING",
    "INVALID_FORMAT",
    "INVALID_VALUE",
    "CONSTRAINT_VIOLATION",
    "SECURITY_VIOLATION",
    "POLICY_VIOLATION",
    "CROSS_ACCOUNT_VIOLATION",
  ]),
  severity: z.enum(["error", "warning", "info"]),
});
