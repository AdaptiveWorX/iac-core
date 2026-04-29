/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type-safe configuration validation patterns with environment-specific rules
 * Provides blast radius management through validated configuration constraints
 */

import { z } from "zod";
import {
  AccountPurposeSchema,
  AwsRegionSchema,
  ComplianceRequirementSchema,
  EnvironmentSchema,
  StackContextSchema,
} from "../schemas/core/core-schemas.js";
import type { Environment, ValidationError, ValidationResult } from "../types/core.js";
import { AgentValidationService } from "./agent-validation.js";

interface StackConfigurationInput {
  stackContext?: unknown;
  stackSize?: unknown;
  components?: unknown;
  crossAccountOperations?: unknown;
}

interface ValidatedStackConfiguration {
  stackContext: StackContext;
  stackSize: StackSize;
  components: InfrastructureComponent[];
  crossAccountOperations: CrossAccountOperation[];
}

/**
 * Environment-specific configuration constraints for blast radius management
 */
export const EnvironmentConstraintsSchema = z.discriminatedUnion("environment", [
  // Production: Maximum safety and compliance
  z.object({
    environment: z.literal("prd"),
    maxStackSize: z
      .literal("medium")
      .describe("Production stacks must be medium-sized for blast radius control"),
    requiresApproval: z.literal(true),
    enableFlowLogs: z.literal(true),
    enableGuardDuty: z.literal(true),
    enableBackup: z.literal(true),
    minRetentionDays: z.literal(365),
    natGatewayCount: z
      .number()
      .min(2)
      .describe("Production requires HA with multiple NAT gateways"),
    multiAz: z.literal(true),
    crossAccountOperationsAllowed: z.literal(true),
    complianceRequired: z.array(ComplianceRequirementSchema).min(1),
  }),

  // Staging: Moderate constraints for testing production-like scenarios
  z.object({
    environment: z.literal("stg"),
    maxStackSize: z.enum(["small", "medium"]).describe("Staging allows small to medium stacks"),
    requiresApproval: z.literal(false),
    enableFlowLogs: z.literal(true),
    enableGuardDuty: z.literal(true),
    enableBackup: z.literal(true),
    minRetentionDays: z.literal(90),
    natGatewayCount: z.literal(1),
    multiAz: z.literal(true),
    crossAccountOperationsAllowed: z.literal(true),
    complianceRequired: z.array(ComplianceRequirementSchema).length(0),
  }),

  // Development: Flexible for rapid iteration and cost optimization
  z.object({
    environment: z.literal("dev"),
    maxStackSize: z
      .enum(["small", "medium", "large"])
      .describe("Development allows flexible stack sizes"),
    requiresApproval: z.literal(false),
    enableFlowLogs: z.literal(false),
    enableGuardDuty: z.literal(false),
    enableBackup: z.literal(false),
    minRetentionDays: z.literal(7),
    natGatewayCount: z.literal(0),
    multiAz: z.literal(false),
    crossAccountOperationsAllowed: z.literal(true),
    complianceRequired: z.array(ComplianceRequirementSchema).length(0),
  }),

  // Security: Strict constraints for security operations
  z.object({
    environment: z.literal("sec"),
    maxStackSize: z
      .enum(["small", "medium"])
      .describe("Security stacks should be focused and manageable"),
    requiresApproval: z.literal(true),
    enableFlowLogs: z.literal(true),
    enableGuardDuty: z.literal(true),
    enableBackup: z.literal(true),
    minRetentionDays: z.literal(2557), // 7 years max
    natGatewayCount: z.literal(2),
    multiAz: z.literal(true),
    crossAccountOperationsAllowed: z.literal(true),
    complianceRequired: z
      .array(ComplianceRequirementSchema)
      .min(2)
      .describe("Security environments require multiple compliance frameworks"),
  }),
]);

/**
 * Stack size validation for blast radius management
 */
export const StackSizeSchema = z
  .object({
    name: z.string(),
    environment: EnvironmentSchema,
    purpose: AccountPurposeSchema,
    estimatedResourceCount: z.number().min(1),
    componentsIncluded: z.array(
      z.enum([
        "networking",
        "compute",
        "storage",
        "database",
        "security",
        "dns",
        "monitoring",
        "backup",
      ])
    ),
    crossAccountDependencies: z.number().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    // Determine stack size based on components and resource count
    let stackSize: "small" | "medium" | "large";

    if (data.estimatedResourceCount <= 20 && data.componentsIncluded.length <= 3) {
      stackSize = "small";
    } else if (data.estimatedResourceCount <= 100 && data.componentsIncluded.length <= 6) {
      stackSize = "medium";
    } else {
      stackSize = "large";
    }

    // Check against environment constraints
    const envConstraints = EnvironmentConstraintsSchema.parse({ environment: data.environment });
    const allowedSizes = Array.isArray(envConstraints.maxStackSize)
      ? envConstraints.maxStackSize
      : [envConstraints.maxStackSize];

    if (!allowedSizes.includes(stackSize)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Stack size '${stackSize}' not allowed in ${data.environment} environment. Allowed: ${allowedSizes.join(", ")}`,
        path: ["estimatedResourceCount"],
      });
    }

    // Additional blast radius checks
    if (data.crossAccountDependencies > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stacks with more than 3 cross-account dependencies increase blast radius risk",
        path: ["crossAccountDependencies"],
      });
    }

    // Component combination validation
    const hasNetworking = data.componentsIncluded.includes("networking");
    const hasCompute = data.componentsIncluded.includes("compute");
    const hasDatabase = data.componentsIncluded.includes("database");

    if (hasNetworking && hasCompute && hasDatabase && data.environment === "prd") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Production stacks should separate networking, compute, and database components for better blast radius control",
        path: ["componentsIncluded"],
      });
    }
  });

/**
 * Cross-account configuration validation with security constraints
 */
export const CrossAccountConfigSchema = z
  .object({
    sourceAccount: z
      .string()
      .length(12)
      .regex(/^\d{12}$/, "Must be valid 12-digit AWS account ID"),
    targetAccount: z
      .string()
      .length(12)
      .regex(/^\d{12}$/, "Must be valid 12-digit AWS account ID"),
    operation: z.enum([
      "assume-role",
      "share-resource",
      "create-dns",
      "access-secrets",
      "ram-sharing",
    ]),
    environment: EnvironmentSchema,
    purpose: AccountPurposeSchema,
    approvalRequired: z.boolean(),
    externalId: z.string().optional(),
    sessionDuration: z.number().min(900).max(43200).default(3600), // 15 minutes to 12 hours
    requiredTags: z.record(z.string(), z.string()).optional(),
    allowedActions: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    // Production requires approval for all cross-account operations
    if (data.environment === "prd" && !data.approvalRequired) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production cross-account operations require manual approval",
        path: ["approvalRequired"],
      });
    }

    // External ID required for production role assumptions
    if (
      data.environment === "prd" &&
      data.operation === "assume-role" &&
      (typeof data.externalId !== "string" || data.externalId.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production role assumptions require external ID for security",
        path: ["externalId"],
      });
    }

    // Session duration constraints for security-sensitive operations
    if (data.operation === "access-secrets" && data.sessionDuration > 1800) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Secret access sessions should be limited to 30 minutes maximum",
        path: ["sessionDuration"],
      });
    }

    // Validate account relationship
    if (data.sourceAccount === data.targetAccount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Source and target accounts cannot be the same",
        path: ["targetAccount"],
      });
    }
  });

/**
 * Infrastructure component validation with environment-specific constraints
 */
export const InfrastructureComponentSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(63)
      .regex(/^[a-zA-Z0-9-]+$/, "Component name must be alphanumeric with hyphens"),
    type: z.enum([
      "vpc",
      "subnet",
      "security-group",
      "instance",
      "load-balancer",
      "database",
      "bucket",
      "role",
    ]),
    environment: EnvironmentSchema,
    purpose: AccountPurposeSchema,
    region: AwsRegionSchema,
    tags: z.record(z.string(), z.string()),
    dependencies: z.array(z.string()).default([]),
    crossAccount: z.boolean().default(false),
    encryption: z
      .object({
        enabled: z.boolean(),
        keyId: z.string().optional(),
        algorithm: z.enum(["AES256", "aws:kms"]).default("AES256"),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Environment-specific encryption requirements
    const encryptionEnabled = data.encryption?.enabled === true;
    if (data.environment === "prd" && !encryptionEnabled) {
      if (["database", "bucket"].includes(data.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Production ${data.type} components require encryption`,
          path: ["encryption", "enabled"],
        });
      }
    }

    // Required tags validation
    const requiredTags = ["Environment", "Purpose", "ManagedBy", "Component"];
    for (const tag of requiredTags) {
      const tagValue = data.tags[tag];
      if (typeof tagValue !== "string" || tagValue.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing required tag: ${tag}`,
          path: ["tags", tag],
        });
      }
    }

    // Cross-account component validation
    if (data.crossAccount && data.environment === "prd") {
      const crossAccountApproval = data.tags.CrossAccountApproved;
      if (typeof crossAccountApproval !== "string" || crossAccountApproval.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Production cross-account components require approval tag",
          path: ["tags", "CrossAccountApproved"],
        });
      }
    }

    // Security group specific validation
    if (data.type === "security-group" && data.dependencies.length > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Security groups with many dependencies increase complexity and security risk",
        path: ["dependencies"],
      });
    }
  });

type EnvironmentConstraints = z.infer<typeof EnvironmentConstraintsSchema>;
type StackSize = z.infer<typeof StackSizeSchema>;
type InfrastructureComponent = z.infer<typeof InfrastructureComponentSchema>;
type CrossAccountOperation = z.infer<typeof CrossAccountConfigSchema>;
type StackContext = z.infer<typeof StackContextSchema>;

/**
 * Configuration validation service with comprehensive patterns
 */
export namespace ConfigurationValidator {
  /**
   * Validate complete stack configuration for blast radius management
   */
  export function validateStackConfiguration(
    config: StackConfigurationInput
  ): ValidationResult<ValidatedStackConfiguration> {
    const results: Partial<ValidatedStackConfiguration> = {};
    const allErrors: ValidationError[] = [];

    const componentInputs = Array.isArray(config.components) ? config.components : [];
    const crossAccountInputs = Array.isArray(config.crossAccountOperations)
      ? config.crossAccountOperations
      : [];

    const stackContextResult = AgentValidationService.validateWithContext(
      StackContextSchema,
      config.stackContext,
      "stack-context"
    );
    if (stackContextResult.success) {
      if (stackContextResult.data) {
        results.stackContext = stackContextResult.data;
      } else {
        allErrors.push({
          field: "stack-context",
          message: "Stack context validation returned no data",
          code: "INVALID_VALUE",
          severity: "error",
        });
      }
    } else if (stackContextResult.errors) {
      allErrors.push(...stackContextResult.errors);
    }

    const stackSizeResult = AgentValidationService.validateWithContext(
      StackSizeSchema,
      config.stackSize,
      "stack-size"
    );
    if (stackSizeResult.success && stackSizeResult.data) {
      // Ensure crossAccountDependencies has a default value
      results.stackSize = {
        ...stackSizeResult.data,
        crossAccountDependencies: stackSizeResult.data.crossAccountDependencies ?? 0,
      };
    } else if (stackSizeResult.errors) {
      allErrors.push(...stackSizeResult.errors);
    } else {
      allErrors.push({
        field: "stack-size",
        message: "Stack size validation returned no data",
        code: "INVALID_VALUE",
        severity: "error",
      });
    }

    const validatedComponents: InfrastructureComponent[] = [];
    componentInputs.forEach((component, index) => {
      const componentResult = AgentValidationService.validateWithContext(
        InfrastructureComponentSchema,
        component,
        `component-${index}`
      );
      if (componentResult.success && componentResult.data) {
        const encryption = componentResult.data.encryption
          ? {
              enabled: componentResult.data.encryption.enabled,
              algorithm: componentResult.data.encryption.algorithm ?? "AES256",
              keyId: componentResult.data.encryption.keyId,
            }
          : undefined;

        validatedComponents.push({
          ...componentResult.data,
          dependencies: componentResult.data.dependencies ?? [],
          crossAccount: componentResult.data.crossAccount ?? false,
          encryption,
        });
      } else if (componentResult.errors) {
        allErrors.push(...componentResult.errors);
      } else {
        allErrors.push({
          field: `component-${index}`,
          message: "Component validation returned no data",
          code: "INVALID_VALUE",
          severity: "error",
        });
      }
    });
    results.components = validatedComponents;

    const validatedOperations: CrossAccountOperation[] = [];
    crossAccountInputs.forEach((operation, index) => {
      const operationResult = AgentValidationService.validateWithContext(
        CrossAccountConfigSchema,
        operation,
        `cross-account-${index}`
      );
      if (operationResult.success && operationResult.data) {
        validatedOperations.push({
          ...operationResult.data,
          sessionDuration: operationResult.data.sessionDuration ?? 3600,
        });
      } else if (operationResult.errors) {
        allErrors.push(...operationResult.errors);
      } else {
        allErrors.push({
          field: `cross-account-${index}`,
          message: "Cross-account validation returned no data",
          code: "INVALID_VALUE",
          severity: "error",
        });
      }
    });
    results.crossAccountOperations = validatedOperations;

    return allErrors.length > 0
      ? { success: false, errors: allErrors }
      : { success: true, data: results as ValidatedStackConfiguration };
  }

  /**
   * Validate environment-specific constraints
   */
  export function validateEnvironmentConstraints(
    environment: Environment,
    config: unknown
  ): ValidationResult<EnvironmentConstraints> {
    const configObject = typeof config === "object" && config !== null ? config : {};
    const validationResult = AgentValidationService.validateWithContext(
      EnvironmentConstraintsSchema,
      { environment, ...configObject },
      `environment-constraints-${environment}`
    );

    if (validationResult.success && validationResult.data) {
      // Return the validated data as-is since Zod already handles defaults
      return { success: true, data: validationResult.data };
    }

    const errors = validationResult.errors ?? [];
    return {
      success: false,
      errors,
    };
  }

  /**
   * Validate blast radius constraints for stack design
   */
  export function validateBlastRadius(stackConfig: {
    components: string[];
    resourceCount: number;
    crossAccountDeps: number;
    environment: Environment;
  }): ValidationResult<{ riskLevel: "low" | "medium" | "high"; recommendations: string[] }> {
    const { components, resourceCount, crossAccountDeps, environment } = stackConfig;

    let riskLevel: "low" | "medium" | "high" = "low";
    const recommendations: string[] = [];

    // Component diversity risk
    if (components.length > 6) {
      riskLevel = "high";
      recommendations.push("Consider splitting into multiple focused stacks");
    } else if (components.length > 3) {
      riskLevel = "medium";
      recommendations.push("Monitor stack complexity as it grows");
    }

    // Resource count risk
    if (resourceCount > 100) {
      riskLevel = "high";
      recommendations.push("Stack has high resource count - consider decomposition");
    } else if (resourceCount > 50) {
      if (riskLevel === "low") {
        riskLevel = "medium";
      }
      recommendations.push("Large stack - ensure proper testing and rollback procedures");
    }

    // Cross-account dependencies risk
    if (crossAccountDeps > 3) {
      if (riskLevel !== "high") {
        riskLevel = "medium";
      }
      recommendations.push("High cross-account dependencies increase failure modes");
    }

    // Environment-specific recommendations
    if (environment === "prd" && riskLevel === "high") {
      recommendations.push("Production high-risk stacks require architectural review");
    }

    return {
      success: true,
      data: { riskLevel, recommendations },
    };
  }

  /**
   * Validate component dependencies for circular references and complexity
   */
  export function validateComponentDependencies(
    components: Array<{ name: string; dependencies: string[] }>
  ): ValidationResult<{ hasCycles: boolean; complexityScore: number; recommendations: string[] }> {
    // Build dependency graph
    const graph = new Map<string, Set<string>>();
    const allComponents = new Set<string>();

    for (const component of components) {
      allComponents.add(component.name);
      graph.set(component.name, new Set(component.dependencies));
    }

    // Check for cycles using DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();
    let hasCycles = false;

    function hasCycle(node: string): boolean {
      if (inStack.has(node)) {
        return true;
      }
      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      inStack.add(node);

      const deps = graph.get(node) ?? new Set<string>();
      for (const dep of deps) {
        if (hasCycle(dep)) {
          return true;
        }
      }

      inStack.delete(node);
      return false;
    }

    for (const component of allComponents) {
      if (!visited.has(component) && hasCycle(component)) {
        hasCycles = true;
        break;
      }
    }

    // Calculate complexity score
    const totalDeps = components.reduce((sum, comp) => sum + comp.dependencies.length, 0);
    const avgDepsPerComponent = totalDeps / components.length;
    const complexityScore = Math.round(avgDepsPerComponent * 10);

    const recommendations: string[] = [];
    if (hasCycles) {
      recommendations.push("Remove circular dependencies between components");
    }
    if (complexityScore > 30) {
      recommendations.push("High dependency complexity - consider simplifying architecture");
    }
    if (avgDepsPerComponent > 3) {
      recommendations.push("Components have many dependencies - review for tight coupling");
    }

    return {
      success: true,
      data: { hasCycles, complexityScore, recommendations },
    };
  }
}
