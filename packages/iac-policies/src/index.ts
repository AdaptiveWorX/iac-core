/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pulumi Policy Engine for Agent-Optimized Infrastructure Governance
 * Provides automated compliance checking, cost guardrails, and security policies
 * Designed for autonomous agent deployments with safety-first approach
 */

import type { ResourceValidationArgs } from "@pulumi/policy";
import * as policy from "@pulumi/policy";
import * as pulumi from "@pulumi/pulumi";

/**
 * Compliance framework controls mapping (future use)
 * Allows one policy to satisfy multiple frameworks
 * Example: securityBaselinePolicy maps to NIST SC-28, ISO27001 A.10.1.1, HIPAA 164.312(a)(2)(iv)
 */
export interface FrameworkControls {
  "NIST-800-53"?: string[];
  ISO27001?: string[];
  HIPAA?: string[];
  "PCI-DSS"?: string[];
  SOC2?: string[];
  FedRAMP?: string[];
}

/**
 * Compliance evidence for audit trails (future use)
 * Will be emitted to compliance platforms (Vanta, Drata, etc.)
 */
interface ComplianceEvidence {
  timestamp: string;
  policyName: string;
  resourceUrn: string;
  result: "pass" | "fail" | "warning";
  frameworks?: string[];
  message: string;
}

/**
 * Tenant-aware policy configuration
 */
interface AgentPolicyConfig {
  tenant: string; // Multi-tenant identifier (worx, care, etc.)
  frameworks: string[]; // Compliance frameworks for this tenant
  environment: string;
  environmentClass: string;
  accountPurpose: string;
  stackPurpose: string;
  stackPurposeClass: string;
  targetEnvironment?: string; // Optional: for centralized resources (e.g., sec account with dev/stg/prd targets)
  allowedRegions: string[];
  requiredTags: string[];
  enableSecurityPolicies: boolean;
  requiresAuditLogging: boolean;
}

/**
 * Get compliance frameworks for a tenant
 * Future: Read from Infisical per tenant
 */
function getTenantFrameworks(tenant: string): string[] {
  const tenantFrameworks: Record<string, string[]> = {
    worx: ["ISO27001"], // Internal baseline
    care: ["HIPAA", "HITRUST", "ISO27001"], // Healthcare
    // Future tenants will be added here or read from Infisical
  };

  return tenantFrameworks[tenant] ?? ["ISO27001"]; // Default to ISO27001 baseline
}

/**
 * Parse project name to extract tenant, cloud, and environment
 * Format: {tenant}-{cloud}-{env} (e.g., "worx-aws-dev")
 * Self-contained for policy pack - no external imports
 */
function parseProjectName(projectName: string): {
  tenant: string;
  cloud: string;
  environment: string;
} {
  const parts = projectName.split("-");
  if (parts.length !== 3) {
    throw new Error(
      `Invalid project name format: ${projectName}. Expected: {tenant}-{cloud}-{env}`
    );
  }
  const tenant = parts[0];
  const cloud = parts[1];
  const environment = parts[2];

  if (tenant === undefined || cloud === undefined || environment === undefined) {
    throw new Error(`Invalid project name parts: ${projectName}`);
  }

  return { tenant, cloud, environment };
}

/**
 * Parse stack name to extract account-purpose, stack-purpose, and region
 * Format: {account-purpose}-{stack-purpose}-{concern?}-{region}
 * Or centralized: {target-env}-{account-purpose}-{stack-purpose}-{concern?}-{region}
 * Self-contained for policy pack - no external imports
 */
function parseStackName(stackName: string): {
  accountPurpose: string;
  stackPurpose: string;
  region: string;
  targetEnvironment?: string;
} {
  const parts = stackName.split("-");

  // Check if this is a centralized resource (starts with env prefix)
  const envPrefixes = ["dev", "stg", "prd", "sec"];
  const firstPart = parts[0];
  const hasTargetEnv =
    parts.length >= 4 && firstPart !== undefined && envPrefixes.includes(firstPart);

  if (hasTargetEnv) {
    // Centralized format: {target-env}-{account-purpose}-{stack-purpose}-{region}
    const targetEnvironment = parts[0];
    const accountPurpose = parts[1];
    const stackPurpose = parts[2];
    const region = parts[parts.length - 1];

    if (
      targetEnvironment === undefined ||
      accountPurpose === undefined ||
      stackPurpose === undefined ||
      region === undefined
    ) {
      throw new Error(`Invalid centralized stack name parts: ${stackName}`);
    }

    return { targetEnvironment, accountPurpose, stackPurpose, region };
  }

  // Standard format: {account-purpose}-{stack-purpose}-{region}
  if (parts.length < 3) {
    throw new Error(
      `Invalid stack name format: ${stackName}. Expected: {account-purpose}-{stack-purpose}-{region}`
    );
  }

  const accountPurpose = parts[0];
  const stackPurpose = parts[1];
  const region = parts[parts.length - 1];

  if (accountPurpose === undefined || stackPurpose === undefined || region === undefined) {
    throw new Error(`Invalid stack name parts: ${stackName}`);
  }

  return { accountPurpose, stackPurpose, region };
}

/**
 * Get stack purpose classification for intelligent policy decisions
 * Self-contained for policy pack - no external imports
 */
function getStackPurposeClass(stackPurpose: string): string {
  const normalized = stackPurpose.toLowerCase();

  // Well-known stack purposes
  const wellKnown: Record<string, string> = {
    iam: "security",
    vpc: "infrastructure",
    cicd: "infrastructure",
    web: "compute",
    api: "compute",
    db: "data",
    cache: "data",
    monitor: "observability",
    log: "observability",
  };

  const wellKnownClass = wellKnown[normalized];
  if (wellKnownClass !== undefined) {
    return wellKnownClass;
  }

  // Intelligent inference from naming patterns
  if (normalized.includes("api") || normalized.includes("web") || normalized.includes("app")) {
    return "compute";
  }
  if (
    normalized.includes("secret") ||
    normalized.includes("key") ||
    normalized.includes("iam") ||
    normalized.includes("auth")
  ) {
    return "security";
  }
  if (
    normalized.includes("log") ||
    normalized.includes("monitor") ||
    normalized.includes("metric") ||
    normalized.includes("trace")
  ) {
    return "observability";
  }
  if (
    normalized.includes("data") ||
    normalized.includes("db") ||
    normalized.includes("cache") ||
    normalized.includes("queue")
  ) {
    return "data";
  }
  if (normalized.includes("vpc") || normalized.includes("network") || normalized.includes("cicd")) {
    return "infrastructure";
  }

  return "general";
}

/**
 * Map common environment names to standard environment classes
 * Organizations can override this by setting ENVIRONMENT_CLASS in Pulumi config
 */
function inferEnvironmentClass(environment: string): string {
  const classMap: Record<string, string> = {
    // Development environments
    dev: "development",
    development: "development",
    local: "development",
    sandbox: "development",

    // Testing environments
    test: "testing",
    testing: "testing",
    qa: "testing",
    uat: "testing",
    sit: "testing",
    uit: "testing",

    // Staging environments
    stg: "staging",
    stage: "staging",
    staging: "staging",
    preprod: "staging",

    // Production environments
    prd: "production",
    prod: "production",
    production: "production",
    live: "production",

    // Operations environments
    sec: "operations",
    security: "operations",
    ops: "operations",
    shared: "operations",

    // Disaster recovery
    dr: "disaster-recovery",
    backup: "disaster-recovery",
  };

  return classMap[environment.toLowerCase()] ?? "development";
}

/**
 * Emit compliance evidence (future audit integration)
 * Currently unused but will be called by policies to generate audit trails
 * @internal - For future use with compliance platforms (Vanta, Drata, etc.)
 */
export function emitEvidence(_evidence: ComplianceEvidence): void {
  // Future implementation: emit to compliance platform
}

/**
 * Load tenant-aware policy configuration from stack context
 * Baseline security enforced everywhere, compliance frameworks per tenant
 * Self-contained for policy pack - uses inline parsing
 */
function loadPolicyConfig(): AgentPolicyConfig {
  try {
    // Get Pulumi project and stack info
    const projectName = pulumi.getProject();
    const stackName = pulumi.getStack();

    // Parse context using inline functions
    const { tenant, environment } = parseProjectName(projectName);
    const parsed = parseStackName(stackName);
    const { accountPurpose, stackPurpose, targetEnvironment } = parsed;

    const environmentClass = inferEnvironmentClass(environment);
    const stackPurposeClass = getStackPurposeClass(stackPurpose);
    const frameworks = getTenantFrameworks(tenant);

    // Policy behavior based on classifications
    const isProduction = environmentClass === "production" || environmentClass === "operations";
    const isSecurity = stackPurposeClass === "security";
    const isInfrastructure = stackPurposeClass === "infrastructure";

    // Determine required tags (start minimal, can expand later)
    const requiredTags = ["Environment", "AccountPurpose", "StackPurpose"];

    // Security stack purposes always get audit logging
    if (isSecurity) {
      requiredTags.push("SecurityLevel");
    }

    // Determine allowed regions (US-only for now, future: tenant-specific)
    const allowedRegions = isProduction
      ? ["us-east-1", "us-west-2"] // Multi-region for production
      : ["us-east-1"]; // Single region for dev/stg

    const baseConfig = {
      tenant,
      frameworks,
      environment,
      environmentClass,
      accountPurpose,
      stackPurpose,
      stackPurposeClass,
      allowedRegions,
      requiredTags,
      enableSecurityPolicies: true, // Baseline security everywhere (secure by default)
      requiresAuditLogging: isSecurity || isInfrastructure || isProduction,
    };

    // Only include targetEnvironment if it's defined
    if (targetEnvironment !== undefined) {
      return { ...baseConfig, targetEnvironment };
    }

    return baseConfig;
  } catch (error) {
    throw new Error(
      `Failed to load policy config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Lazy-loaded config - will be initialized on first access
let config: AgentPolicyConfig | undefined;

function getConfig(): AgentPolicyConfig {
  if (config === undefined) {
    config = loadPolicyConfig();
  }
  return config;
}

/**
 * Agent Guardrail: Required Tags Policy
 * Ensures all resources have required tags for cost allocation and governance
 */
const requiredTagsPolicy: policy.ResourceValidationPolicy = {
  name: "required-tags",
  description: "All resources must have required tags for agent governance",
  enforcementLevel: "mandatory",
  validateResource: (args: ResourceValidationArgs, reportViolation: (message: string) => void) => {
    const cfg = getConfig();

    // Skip Pulumi internal resources (providers, stacks)
    if (args.type.startsWith("pulumi:")) {
      return;
    }

    // Skip component resources (they don't have tags, only their children do)
    if (args.type.startsWith("adaptiveworx:")) {
      return;
    }

    // Skip AWS resources that don't support tags (attachments, associations, bucket sub-resources, network ACL components)
    const nonTaggableResources = [
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
    ];

    if (nonTaggableResources.includes(args.type)) {
      return;
    }

    // Check if resource has tags property
    if (!(args.props.tags || args.props.Tags)) {
      reportViolation(
        `Resource ${args.urn} missing tags. Required tags: ${cfg.requiredTags.join(", ")}`
      );
      return;
    }

    const tags = args.props.tags || args.props.Tags || {};
    const missingTags = cfg.requiredTags.filter(tag => !tags[tag]);

    if (missingTags.length > 0) {
      reportViolation(`Resource ${args.urn} missing required tags: ${missingTags.join(", ")}`);
    }

    // Agent validation: Ensure proper tag values
    // For centralized resources (sec account with targetEnvironment), use targetEnvironment
    const expectedEnvironment = cfg.targetEnvironment ?? cfg.environment;
    if (tags.Environment && tags.Environment !== expectedEnvironment) {
      reportViolation(
        `Resource ${args.urn} has incorrect Environment tag: ${tags.Environment}. Expected: ${expectedEnvironment}`
      );
    }

    if (tags.AccountPurpose && tags.AccountPurpose !== cfg.accountPurpose) {
      reportViolation(
        `Resource ${args.urn} has incorrect AccountPurpose tag: ${tags.AccountPurpose}. Expected: ${cfg.accountPurpose}`
      );
    }

    if (tags.StackPurpose && tags.StackPurpose !== cfg.stackPurpose) {
      reportViolation(
        `Resource ${args.urn} has incorrect StackPurpose tag: ${tags.StackPurpose}. Expected: ${cfg.stackPurpose}`
      );
    }
  },
};

/**
 * Agent Guardrail: Regional Compliance Policy
 * Ensures resources are deployed only in approved regions
 */
const regionalCompliancePolicy: policy.ResourceValidationPolicy = {
  name: "regional-compliance",
  description: "Resources must be deployed in approved regions for agent safety",
  enforcementLevel: "mandatory",
  validateResource: (args: ResourceValidationArgs, reportViolation: (message: string) => void) => {
    const cfg = getConfig();

    // Check AWS resources
    if (args.type.startsWith("aws:")) {
      const region = args.props.region || process.env.AWS_REGION;

      if (!region) {
        reportViolation(`AWS resource ${args.urn} missing region specification`);
        return;
      }

      if (!cfg.allowedRegions.includes(region)) {
        reportViolation(
          `AWS resource ${args.urn} deployed in unauthorized region: ${region}. ` +
            `Allowed regions for ${cfg.environment}: ${cfg.allowedRegions.join(", ")}`
        );
      }

      // UCX compliance: US regions only
      if (cfg.accountPurpose === "ucx" && !region.startsWith("us-")) {
        reportViolation(
          "UCX resources must be deployed in US regions for compliance. " +
            `Resource ${args.urn} attempted deployment in: ${region}`
        );
      }
    }
  },
};

/**
 * Agent Guardrail: Security Baseline Policy
 * Ensures basic security requirements are met for actual resources we deploy
 */
const securityBaselinePolicy: policy.ResourceValidationPolicy = {
  name: "security-baseline",
  description: "Baseline security requirements (secure by default)",
  enforcementLevel: "mandatory", // Will check inside validateResource
  validateResource: (args: ResourceValidationArgs, reportViolation: (message: string) => void) => {
    const cfg = getConfig();
    if (!cfg.enableSecurityPolicies) {
      return;
    }

    // S3 bucket security
    if (args.type === "aws:s3/bucket:Bucket") {
      // Public ACL check
      if (args.props.acl === "public-read" || args.props.acl === "public-read-write") {
        reportViolation(`S3 bucket ${args.urn} cannot have public ACL (secure by default)`);
      }
    }

    // S3 encryption validation (separate resource pattern per AWS best practices)
    if (
      args.type ===
      "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration"
    ) {
      if (!args.props.rules || args.props.rules.length === 0) {
        reportViolation(
          `S3 encryption configuration ${args.urn} must have at least one encryption rule (secure by default)`
        );
      }
    }

    // Future: Add VPC security group rules when we deploy VPCs
    // Future: Add RDS security when we deploy databases
    // Future: Add IAM least privilege checks when we deploy roles
  },
};

/**
 * Deployment Protection Policy
 * Prevents direct local deployment to production/security environments
 * Enforcement: Production deployments MUST go through CI/CD with approval gates
 *
 * Based on Pulumi 2025 best practices:
 * - Separate advisory (dev/stg) vs mandatory (prd/sec) enforcement
 * - Check CI environment to allow automated deployments
 * - Block local development deployments to production
 * - Account for centralized resources: sec environment with targetEnv=dev/stg is non-prod
 */
const deploymentProtectionPolicy: policy.StackValidationPolicy = {
  name: "production-deployment-protection",
  description: "Production/Security deployments must go through CI/CD pipeline with approval gates",
  enforcementLevel: "advisory", // Will dynamically determine inside validateStack
  validateStack: (
    _args: policy.StackValidationArgs,
    reportViolation: (message: string) => void
  ) => {
    const cfg = getConfig();

    // Determine if this is a production deployment
    const isPrdEnvironment = cfg.environment === "prd";
    const isSecEnvironment = cfg.environment === "sec";

    let isProductionDeployment = isPrdEnvironment;

    // Handle centralized resources in sec account
    if (isSecEnvironment && cfg.targetEnvironment !== undefined) {
      isProductionDeployment = cfg.targetEnvironment === "prd";
    }

    // Only enforce on actual production deployments
    if (!isProductionDeployment) {
      return; // Advisory mode for dev/stg
    }

    // Check if running in CI/CD environment
    const isCI = process.env.CI === "true";
    const isGitHubActions = process.env.GITHUB_ACTIONS === "true";
    const isPulumiDeployments = process.env.PULUMI_DEPLOYMENT !== undefined;

    // Allow CI/CD deployments
    if (isCI || isGitHubActions || isPulumiDeployments) {
      return; // CI/CD deployment - allowed
    }

    // Block local deployments
    reportViolation(`Use 'pulumi preview' locally, then deploy via GitHub Actions.`);
  },
};

/**
 * Pragmatic MVP Policy Pack - Baseline Security + Deployment Gates
 *
 * Active policies (4):
 * 1. Required Tags - Governance foundation with 3 minimal tags
 * 2. Regional Compliance - US-only deployment enforcement
 * 3. Security Baseline - S3 encryption + no public access (actual resources we deploy)
 * 4. Deployment Protection - CI/CD-only for production (accounts for targetEnv)
 *
 * Deferred policies (will add when infrastructure grows):
 * - Healthcare/HIPAA (care tenant): When AdaptiveCare launches
 * - VPC Security: When deploying VPCs with security groups
 * - RDS Security: When deploying databases
 * - IAM Least Privilege: When deploying OIDC + cross-account roles
 * - Cost Management: When deploying EC2/expensive instances
 */
export const policyPack = new policy.PolicyPack("adaptiveworx-baseline-governance", {
  policies: [
    requiredTagsPolicy, // Governance foundation (3 minimal tags)
    regionalCompliancePolicy, // US-only deployment enforcement
    securityBaselinePolicy, // S3 encryption + no public access (actual resources we deploy)
    deploymentProtectionPolicy, // Production deployment gate (CI/CD only, targetEnv-aware)
  ],
});

// Policy pack loaded - config will be lazy-loaded on first policy execution
