/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stack utilities for parsing and validating stack context
 * Agent-optimized with comprehensive error handling and validation
 */

import * as pulumi from "@pulumi/pulumi";
import { StackContextSchema } from "../schemas/core/core-schemas.js";
import type { AccountPurpose, StackContext } from "../types/core.js";

/**
 * Read PULUMI_ORG from the environment, trim it, and throw if missing or empty.
 * iac-core is org-agnostic: every consumer must declare its Pulumi Cloud org.
 */
function requirePulumiOrg(): string {
  const value = process.env.PULUMI_ORG?.trim();
  if (value === undefined || value === "") {
    throw new Error(
      "PULUMI_ORG environment variable is required for detectStackContext(). " +
        "Set it to your Pulumi Cloud organization (e.g. PULUMI_ORG=mycompany). " +
        "In CI workflows, set it at the job/workflow level; locally, export it " +
        "from your shell or .env."
    );
  }
  return value;
}

/**
 * Detect stack context from current Pulumi project and stack
 * Agent guardrail: Comprehensive validation with structured error handling
 * Uses hierarchical naming: {org}/{tenant}-{cloud}-{env}/{account-purpose}-{stack-purpose}-{concern}-{region}
 * Or for centralized resources: {org}/{tenant}-{cloud}-{env}/{target-env}-{account-purpose}-{stack-purpose}-{concern}-{region}
 */
export function detectStackContext(): StackContext {
  try {
    const projectName = pulumi.getProject(); // e.g., "worx-aws-dev"
    const stackName = pulumi.getStack(); // e.g., "ops-iam-github-use1" or "dev-ops-vpc-shared-use1"

    // Parse project name using helper
    const { tenant, cloud, environment } = parseProjectName(projectName);

    // Parse stack name using centralized parser
    const parsed = parseStackName(stackName);
    const { accountPurpose, stackPurpose, region, concern, targetEnvironment } = parsed;

    // Build and validate context
    const contextInput = {
      org: requirePulumiOrg(),
      tenant, // Multi-tenant identifier (worx, care, etc.)
      cloud,
      accountPurpose,
      stackPurpose,
      environment,
      region,
      projectName,
      stackName,
      ...(concern !== undefined && concern !== "" ? { concern } : {}),
      ...(targetEnvironment !== undefined && targetEnvironment !== "" ? { targetEnvironment } : {}),
    };

    const context = StackContextSchema.parse(contextInput) as StackContext;

    return context;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    void pulumi.log.error(`Failed to detect stack context: ${errorMessage}`);
    throw new Error(`Stack context detection failed: ${errorMessage}`);
  }
}

/**
 * Validate stack context with agent-friendly error reporting
 */
export function validateStackContext(context: StackContext): void {
  const validation = StackContextSchema.safeParse(context);

  if (!validation.success) {
    const errorMessages = validation.error.issues
      .map(issue => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    const fullError = `Stack context validation failed:\n${errorMessages}`;
    void pulumi.log.error(fullError);
    throw new Error(fullError);
  }

  void pulumi.log.info("✅ Stack context validation passed");
}

/**
 * Parse project name components with validation
 * Agent guardrail: Ensures consistent project naming
 * Format: {tenant}-{cloud}-{env} (e.g., "worx-aws-dev", "care-aws-prd")
 */
export function parseProjectName(projectName: string): {
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

  const [tenantRaw, cloudRaw, environmentRaw] = parts;

  if (tenantRaw === undefined || cloudRaw === undefined || environmentRaw === undefined) {
    throw new Error(`Incomplete project name components: ${projectName}`);
  }

  const tenant = tenantRaw.trim();
  const cloud = cloudRaw.trim();
  const environment = environmentRaw.trim();

  if ([tenant, cloud, environment].some(part => part.length === 0)) {
    throw new Error(`Incomplete project name components: ${projectName}`);
  }

  return { tenant, cloud, environment };
}

/**
 * Parse stack name components with validation for 3-part, 4-part, or 5-part naming
 * Agent guardrail: Ensures consistent stack naming across deployments
 * 3-part: {account-purpose}-{stack-purpose}-{region}
 * 4-part: {account-purpose}-{stack-purpose}-{concern}-{region} OR {target-env}-{account-purpose}-{stack-purpose}-{region}
 * 5-part: {target-env}-{account-purpose}-{stack-purpose}-{concern}-{region}
 */
export function parseStackName(stackName: string): {
  accountPurpose: string;
  stackPurpose: string;
  region: string;
  concern?: string;
  targetEnvironment?: string;
  org?: string;
  tenant?: string;
  cloud?: string;
  environment?: string;
} {
  // Handle full Pulumi stack format: org/project/stack or org/tenant-cloud-env/stack
  let actualStackName = stackName;
  let extractedOrg: string | undefined;
  let extractedTenant: string | undefined;
  let extractedCloud: string | undefined;
  let extractedEnvironment: string | undefined;

  if (stackName.includes("/")) {
    const pathParts = stackName.split("/");
    if (pathParts.length === 3) {
      const org = pathParts[0];
      const projectName = pathParts[1];
      const stack = pathParts[2];

      if (org !== undefined && projectName !== undefined && stack !== undefined) {
        extractedOrg = org;
        actualStackName = stack;

        // Parse project name: {tenant}-{cloud}-{env}
        const projectParts = projectName.split("-");
        if (projectParts.length === 3) {
          extractedTenant = projectParts[0];
          extractedCloud = projectParts[1];
          extractedEnvironment = projectParts[2];
        }
      }
    }
  }

  const parts = actualStackName.split("-");

  if (parts.length === 5) {
    // 5-part: {target-env}-{account-purpose}-{stack-purpose}-{concern}-{region}
    const [targetEnvRaw, accountPurposeRaw, stackPurposeRaw, concernRaw, regionRaw] = parts;

    if (
      targetEnvRaw === undefined ||
      accountPurposeRaw === undefined ||
      stackPurposeRaw === undefined ||
      concernRaw === undefined ||
      regionRaw === undefined
    ) {
      throw new Error(`Incomplete stack name components: ${stackName}`);
    }

    const targetEnvironment = targetEnvRaw.trim();
    const accountPurpose = accountPurposeRaw.trim();
    const stackPurpose = stackPurposeRaw.trim();
    const concern = concernRaw.trim();
    const region = regionRaw.trim();

    if (
      [targetEnvironment, accountPurpose, stackPurpose, concern, region].some(
        part => part.length === 0
      )
    ) {
      throw new Error(`Incomplete stack name components: ${stackName}`);
    }

    return {
      targetEnvironment,
      accountPurpose,
      stackPurpose,
      concern,
      region,
      ...(extractedOrg !== undefined ? { org: extractedOrg } : {}),
      ...(extractedTenant !== undefined ? { tenant: extractedTenant } : {}),
      ...(extractedCloud !== undefined ? { cloud: extractedCloud } : {}),
      ...(extractedEnvironment !== undefined ? { environment: extractedEnvironment } : {}),
    };
  } else if (parts.length === 4) {
    // 4-part: {account-purpose}-{stack-purpose}-{concern}-{region} OR {target-env}-{account-purpose}-{stack-purpose}-{region}
    // Heuristic: if first part is a valid environment, it's a 4-part centralized (no concern)
    const potentialTargetEnv = parts[0];
    if (
      potentialTargetEnv !== undefined &&
      ["dev", "stg", "prd", "sec"].includes(potentialTargetEnv)
    ) {
      const [targetEnvRaw, accountPurposeRaw, stackPurposeRaw, regionRaw] = parts;

      if (
        targetEnvRaw === undefined ||
        accountPurposeRaw === undefined ||
        stackPurposeRaw === undefined ||
        regionRaw === undefined
      ) {
        throw new Error(`Incomplete stack name components: ${stackName}`);
      }

      const targetEnvironment = targetEnvRaw.trim();
      const accountPurpose = accountPurposeRaw.trim();
      const stackPurpose = stackPurposeRaw.trim();
      const region = regionRaw.trim();

      if (
        [targetEnvironment, accountPurpose, stackPurpose, region].some(part => part.length === 0)
      ) {
        throw new Error(`Incomplete stack name components: ${stackName}`);
      }

      return {
        targetEnvironment,
        accountPurpose,
        stackPurpose,
        region,
        ...(extractedOrg !== undefined ? { org: extractedOrg } : {}),
        ...(extractedTenant !== undefined ? { tenant: extractedTenant } : {}),
        ...(extractedCloud !== undefined ? { cloud: extractedCloud } : {}),
        ...(extractedEnvironment !== undefined ? { environment: extractedEnvironment } : {}),
      };
    } else {
      const [accountPurposeRaw, stackPurposeRaw, concernRaw, regionRaw] = parts;

      if (
        accountPurposeRaw === undefined ||
        stackPurposeRaw === undefined ||
        concernRaw === undefined ||
        regionRaw === undefined
      ) {
        throw new Error(`Incomplete stack name components: ${stackName}`);
      }

      const accountPurpose = accountPurposeRaw.trim();
      const stackPurpose = stackPurposeRaw.trim();
      const concern = concernRaw.trim();
      const region = regionRaw.trim();

      if ([accountPurpose, stackPurpose, concern, region].some(part => part.length === 0)) {
        throw new Error(`Incomplete stack name components: ${stackName}`);
      }

      return {
        accountPurpose,
        stackPurpose,
        concern,
        region,
        ...(extractedOrg !== undefined ? { org: extractedOrg } : {}),
        ...(extractedTenant !== undefined ? { tenant: extractedTenant } : {}),
        ...(extractedCloud !== undefined ? { cloud: extractedCloud } : {}),
        ...(extractedEnvironment !== undefined ? { environment: extractedEnvironment } : {}),
      };
    }
  } else if (parts.length === 3) {
    // 3-part: regular resource
    const [accountPurposeRaw, stackPurposeRaw, regionRaw] = parts;

    if (
      accountPurposeRaw === undefined ||
      stackPurposeRaw === undefined ||
      regionRaw === undefined
    ) {
      throw new Error(`Incomplete stack name components: ${stackName}`);
    }

    const accountPurpose = accountPurposeRaw.trim();
    const stackPurpose = stackPurposeRaw.trim();
    const region = regionRaw.trim();

    if ([accountPurpose, stackPurpose, region].some(part => part.length === 0)) {
      throw new Error(`Incomplete stack name components: ${stackName}`);
    }

    return {
      accountPurpose,
      stackPurpose,
      region,
      ...(extractedOrg !== undefined ? { org: extractedOrg } : {}),
      ...(extractedTenant !== undefined ? { tenant: extractedTenant } : {}),
      ...(extractedCloud !== undefined ? { cloud: extractedCloud } : {}),
      ...(extractedEnvironment !== undefined ? { environment: extractedEnvironment } : {}),
    };
  } else {
    throw new Error(
      `Invalid stack name format: ${stackName}. ` +
        "Expected: {account-purpose}-{stack-purpose}-{region}, " +
        "{account-purpose}-{stack-purpose}-{concern}-{region}, " +
        "{target-env}-{account-purpose}-{stack-purpose}-{region}, or " +
        "{target-env}-{account-purpose}-{stack-purpose}-{concern}-{region}"
    );
  }
}

/**
 * Generate project name from components
 * Agent utility: Ensures consistent project naming
 */
export function generateProjectName(cloud: string, environment: string): string {
  return `${cloud}-${environment}`;
}

/**
 * Generate stack name from components
 * Agent utility: Ensures consistent stack naming with 3-part, 4-part, or 5-part convention
 */
export function generateStackName(
  accountPurpose: string,
  stackPurpose: string,
  region: string,
  concern?: string,
  targetEnvironment?: string
): string {
  const parts: string[] = [];

  if (targetEnvironment !== undefined && targetEnvironment !== "") {
    parts.push(targetEnvironment);
  }

  parts.push(accountPurpose, stackPurpose);

  if (concern !== undefined && concern !== "") {
    parts.push(concern);
  }

  parts.push(region);

  return parts.join("-");
}

/**
 * Generate fully qualified stack reference for Pulumi Cloud
 * Agent utility: Creates org/project/stack reference path
 */
export function generateFullStackReference(
  org: string,
  cloud: string,
  environment: string,
  accountPurpose: string,
  stackPurpose: string,
  region: string
): string {
  const projectName = generateProjectName(cloud, environment);
  const stackName = generateStackName(accountPurpose, stackPurpose, region);
  return `${org}/${projectName}/${stackName}`;
}

/**
 * Validate stack name format
 * Agent guardrail: Pre-deployment validation
 */
export function isValidStackName(stackName: string): boolean {
  try {
    parseStackName(stackName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get environment-specific configuration
 * Agent utility: Environment-aware configuration loading
 */
/**
 * Get environment configuration based on environment classification
 * Uses EnvironmentClass for standardized policy behavior across custom environment names
 */
export function getEnvironmentConfig(environmentClass: string): {
  isProduction: boolean;
  requiresApproval: boolean;
  enableMonitoring: boolean;
  enableBackup: boolean;
  retentionDays: number;
} {
  const configs: Record<
    string,
    {
      isProduction: boolean;
      requiresApproval: boolean;
      enableMonitoring: boolean;
      enableBackup: boolean;
      retentionDays: number;
    }
  > = {
    production: {
      isProduction: true,
      requiresApproval: true,
      enableMonitoring: true,
      enableBackup: true,
      retentionDays: 2557, // 7 years
    },
    staging: {
      isProduction: false,
      requiresApproval: true,
      enableMonitoring: true,
      enableBackup: true,
      retentionDays: 365, // 1 year
    },
    testing: {
      isProduction: false,
      requiresApproval: false,
      enableMonitoring: true,
      enableBackup: true,
      retentionDays: 180, // 6 months
    },
    development: {
      isProduction: false,
      requiresApproval: false,
      enableMonitoring: true,
      enableBackup: false,
      retentionDays: 90, // 90 days
    },
    operations: {
      isProduction: true,
      requiresApproval: true,
      enableMonitoring: true,
      enableBackup: true,
      retentionDays: 2557, // 7 years
    },
    "disaster-recovery": {
      isProduction: true,
      requiresApproval: true,
      enableMonitoring: true,
      enableBackup: true,
      retentionDays: 3650, // 10 years
    },
  };

  const config = configs[environmentClass];
  if (config !== undefined) {
    return config;
  }

  // Fallback for unknown environment classes - use development defaults
  const developmentConfig = configs.development;
  if (developmentConfig === undefined) {
    throw new Error("Development config not defined");
  }
  return developmentConfig;
}

/**
 * Well-known stack purposes with their classifications
 * Multi-cloud aware: AWS, Azure, GCP naming conventions
 * Organizations can override via STACK_PURPOSES in Infisical
 */
const WELL_KNOWN_STACK_PURPOSES: Record<string, string> = {
  // Infrastructure (multi-cloud)
  vpc: "infrastructure", // AWS VPC
  vnet: "infrastructure", // Azure Virtual Network
  network: "infrastructure", // GCP VPC Network
  cicd: "infrastructure",
  vpn: "infrastructure",
  bastion: "infrastructure",
  gateway: "infrastructure", // API Gateway, VPN Gateway

  // Security (always strict policies)
  iam: "security", // AWS IAM
  entra: "security", // Azure Entra ID (formerly AD)
  "active-directory": "security", // Azure AD
  secrets: "security", // Secrets Manager
  "key-vault": "security", // Azure Key Vault
  kms: "security", // AWS KMS / GCP KMS
  waf: "security", // Web Application Firewall
  firewall: "security",
  "app-gateway": "security", // Azure Application Gateway

  // Compute
  web: "compute",
  api: "compute",
  ai: "compute",
  ml: "compute",
  worker: "compute",
  lambda: "compute", // AWS Lambda
  functions: "compute", // Azure Functions / GCP Functions
  "app-service": "compute", // Azure App Service
  aks: "compute", // Azure Kubernetes Service
  eks: "compute", // AWS Elastic Kubernetes Service
  gke: "compute", // Google Kubernetes Engine
  ecs: "compute", // AWS Elastic Container Service
  "container-apps": "compute", // Azure Container Apps

  // Data
  data: "data",
  cache: "data",
  queue: "data",
  storage: "data",
  backup: "data",
  streaming: "data",
  database: "data",
  rds: "data", // AWS RDS
  cosmos: "data", // Azure Cosmos DB
  "cloud-sql": "data", // GCP Cloud SQL
  dynamodb: "data", // AWS DynamoDB
  redis: "data", // Redis cache
  s3: "data", // AWS S3
  "blob-storage": "data", // Azure Blob Storage
  "cloud-storage": "data", // GCP Cloud Storage

  // Observability
  obs: "observability",
  logging: "observability",
  metrics: "observability",
  tracing: "observability",
  alerting: "observability",
  monitoring: "observability",
  cloudwatch: "observability", // AWS CloudWatch
  "application-insights": "observability", // Azure Application Insights
  "cloud-monitoring": "observability", // GCP Cloud Monitoring

  // Edge
  cdn: "edge",
  edge: "edge",
  iot: "edge",
  cloudfront: "edge", // AWS CloudFront
  "front-door": "edge", // Azure Front Door
  "cloud-cdn": "edge", // GCP Cloud CDN

  // Integration
  webhooks: "integration",
  events: "integration",
  messaging: "integration",
  sns: "integration", // AWS SNS
  sqs: "integration", // AWS SQS
  "service-bus": "integration", // Azure Service Bus
  pubsub: "integration", // GCP Pub/Sub
  eventgrid: "integration", // Azure Event Grid
};

/**
 * Get stack purpose classification using hybrid lookup
 * 1. Check user-defined STACK_PURPOSES in Infisical (future)
 * 2. Check well-known catalog
 * 3. Infer from naming patterns
 * 4. Fallback to "compute"
 */
export function getStackPurposeClass(stackPurpose: string): string {
  const normalized = stackPurpose.toLowerCase();

  // Check well-known catalog
  const wellKnownClass = WELL_KNOWN_STACK_PURPOSES[normalized];
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
  if (normalized.includes("cdn") || normalized.includes("edge") || normalized.includes("iot")) {
    return "edge";
  }
  if (
    normalized.includes("vpc") ||
    normalized.includes("vnet") ||
    normalized.includes("network") ||
    normalized.includes("cicd")
  ) {
    return "infrastructure";
  }
  if (
    normalized.includes("webhook") ||
    normalized.includes("event") ||
    normalized.includes("integration")
  ) {
    return "integration";
  }

  // Safe default - treat as compute workload
  return "compute";
}

/**
 * Get compliance requirements for account purpose
 * Agent utility: Automated compliance configuration
 */
export function getComplianceRequirements(accountPurpose: AccountPurpose): string[] {
  const complianceMap: Record<string, string[]> = {
    ucx: ["pci-dss", "hipaa", "sox"],
    lake: ["gdpr", "sox"],
    ops: ["nist", "sox", "iso27001"],
    app: ["sox"],
  };

  const requirements = complianceMap[accountPurpose];
  return requirements ?? [];
}

/**
 * Validate cross-account operations
 * Agent guardrail: Ensures safe cross-account deployments
 */
export function validateCrossAccountOperation(
  sourceContext: StackContext,
  targetContext: StackContext
): void {
  // Same organization check
  if (sourceContext.org !== targetContext.org) {
    throw new Error(
      `Cross-organization operations not allowed: ${sourceContext.org} -> ${targetContext.org}`
    );
  }

  // Production safety check
  if (sourceContext.environment !== "prd" && targetContext.environment === "prd") {
    throw new Error("Non-production accounts cannot modify production resources");
  }

  // UCX isolation check
  if (sourceContext.accountPurpose === "ucx" && targetContext.accountPurpose !== "ucx") {
    throw new Error("UCX accounts can only interact with other UCX accounts for compliance");
  }

  if (sourceContext.accountPurpose !== "ucx" && targetContext.accountPurpose === "ucx") {
    throw new Error("Non-UCX accounts cannot modify UCX resources for compliance");
  }

  void pulumi.log.info("✅ Cross-account operation validation passed");
}
