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

/** The project grammar, named in every refusal. */
const PROJECT_GRAMMAR = "{tenant}-{provider}-{account-purpose}-{env}";

/** The stack grammar, named in every refusal. */
const STACK_GRAMMAR = "{target-env}-{stack-purpose}[-{concern}]-{region}";

/**
 * Detect stack context from current Pulumi project and stack
 * Agent guardrail: Comprehensive validation with structured error handling
 * Reads the account grammar (Pl.Architecture.Meta.NamingConventionsAcrossPlatforms), and only it:
 *   {org}/{tenant}-{provider}-{account-purpose}-{env}/{target-env}-{stack-purpose}[-{concern}]-{region}
 *   (e.g. adaptiveworx/worx-aws-ops-sec/sec-iam-github-use1)
 * A name in any other grammar is refused.
 */
export function detectStackContext(): StackContext {
  try {
    const projectName = pulumi.getProject(); // e.g., "worx-aws-ops-sec"
    const stackName = pulumi.getStack(); // e.g., "sec-iam-github-use1"

    const parsed = parseStackIdentity(projectName, stackName);
    const { tenant, provider, environment } = parsed;
    const { accountPurpose, stackPurpose, region, concern, targetEnvironment } = parsed;

    // Build and validate context
    const contextInput = {
      org: requirePulumiOrg(),
      tenant, // Multi-tenant identifier (worx, care, etc.)
      provider,
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

/** The components a project and stack name carry. */
export interface StackIdentity {
  readonly tenant: string;
  readonly provider: string;
  readonly accountPurpose: string;
  readonly environment: string;
  readonly stackPurpose: string;
  readonly region: string;
  readonly concern?: string;
  /** Present only when the stack is centralized: it serves another environment than its project's. */
  readonly targetEnvironment?: string;
}

/** True when a project name uses the account grammar: {tenant}-{provider}-{account-purpose}-{env}. */
export function isAccountGrammarProject(projectName: string): boolean {
  return projectName.split("-").length === 4;
}

/**
 * Parse a project and stack name in the account grammar
 * (Pl.Architecture.Meta.NamingConventionsAcrossPlatforms): project
 * {tenant}-{provider}-{account-purpose}-{env}, stack {target-env}-{stack-purpose}[-{concern}]-{region}.
 * The stack is fixed-position, its target environment always first. Any other project or stack is
 * refused with an error naming the expected grammar. It reads positions only:
 * {@link detectStackContext} and StackContextSchema check what the components mean.
 */
export function parseStackIdentity(projectName: string, stackName: string): StackIdentity {
  if (!isAccountGrammarProject(projectName)) {
    throw new Error(`Invalid project name format: ${projectName}. Expected: ${PROJECT_GRAMMAR}`);
  }
  const projectParts = projectName.split("-").map(part => part.trim());
  const [tenant, provider, accountPurpose, environment] = projectParts;
  if (
    tenant === undefined ||
    provider === undefined ||
    accountPurpose === undefined ||
    environment === undefined ||
    projectParts.some(part => part.length === 0)
  ) {
    throw new Error(
      `Incomplete project name components: ${projectName}. Expected: ${PROJECT_GRAMMAR}`
    );
  }

  const stackParts = stackName.split("-").map(part => part.trim());
  if (stackParts.length !== 3 && stackParts.length !== 4) {
    throw new Error(`Invalid stack name format: ${stackName}. Expected: ${STACK_GRAMMAR}`);
  }
  if (stackParts.some(part => part.length === 0)) {
    throw new Error(`Incomplete stack name components: ${stackName}. Expected: ${STACK_GRAMMAR}`);
  }
  const targetEnv = stackParts[0] as string;
  const stackPurpose = stackParts[1] as string;
  const concern = stackParts.length === 4 ? (stackParts[2] as string) : undefined;
  const region = stackParts[stackParts.length - 1] as string;

  return {
    tenant,
    provider,
    accountPurpose,
    environment,
    stackPurpose,
    region,
    ...(concern === undefined ? {} : { concern }),
    ...(targetEnv === environment ? {} : { targetEnvironment: targetEnv }),
  };
}

/** The account-grammar project name: {tenant}-{provider}-{account-purpose}-{env}. */
export function projectNameOf(identity: StackIdentity): string {
  return `${identity.tenant}-${identity.provider}-${identity.accountPurpose}-${identity.environment}`;
}

/**
 * The account-grammar stack name: {target-env}-{stack-purpose}[-{concern}]-{region}. A fully
 * qualified stack reference is `${org}/${projectNameOf(identity)}/${stackNameOf(identity)}`.
 */
export function stackNameOf(identity: StackIdentity): string {
  const concern =
    identity.concern !== undefined && identity.concern !== "" ? `-${identity.concern}` : "";
  return `${identity.targetEnvironment ?? identity.environment}-${identity.stackPurpose}${concern}-${identity.region}`;
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
