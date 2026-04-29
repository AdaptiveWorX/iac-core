/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent-optimized validation service with structured error handling
 * Provides LLM-friendly validation results and error formatting
 */

import { z } from "zod";
import type { ValidationError, ValidationErrorCode, ValidationResult } from "../types/core.js";

/**
 * Agent validation error with enhanced context and recommendations
 */
export class AgentValidationError extends Error {
  public readonly errors: ValidationError[];
  public readonly context: string;
  public readonly recommendations: string[];

  constructor(
    message: string,
    errors: ValidationError[],
    context: string = "Unknown",
    recommendations: string[] = []
  ) {
    super(message);
    this.name = "AgentValidationError";
    this.errors = errors;
    this.context = context;
    this.recommendations = recommendations;
  }

  /**
   * Format error for agent consumption with structured feedback
   */
  toAgentMessage(): string {
    const errorSummary = this.errors
      .map(err => `[${err.code}] ${err.field}: ${err.message}`)
      .join("\n");

    const recommendations =
      this.recommendations.length > 0
        ? `\n\nRecommended Actions:\n${this.recommendations.map(rec => `- ${rec}`).join("\n")}`
        : "";

    return `Agent Configuration Error in ${this.context}:\n${errorSummary}${recommendations}`;
  }
}

/**
 * Agent validation service with comprehensive error handling
 */
export namespace AgentValidationService {
  const ERROR_CODE_MAP: Partial<Record<string, ValidationErrorCode>> = {
    invalid_type: "REQUIRED_FIELD_MISSING",
    invalid_string: "INVALID_FORMAT",
    invalid_enum_value: "INVALID_VALUE",
    too_small: "CONSTRAINT_VIOLATION",
    too_big: "CONSTRAINT_VIOLATION",
    invalid_union: "INVALID_VALUE",
    custom: "POLICY_VIOLATION",
  };

  /**
   * Validate data with agent-friendly error handling
   */
  export function validateWithContext<T>(
    schema: z.ZodType<T>,
    data: unknown,
    context: string,
    fieldPrefix: string = ""
  ): ValidationResult<T> {
    try {
      const validData = schema.parse(data);
      return {
        success: true,
        data: validData,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = formatZodErrors(error, fieldPrefix, context);

        return {
          success: false,
          errors,
        };
      }

      // Handle unexpected errors
      return {
        success: false,
        errors: [
          {
            field: fieldPrefix !== "" ? fieldPrefix : "unknown",
            message: error instanceof Error ? error.message : "Unknown validation error",
            code: "INVALID_VALUE",
            severity: "error",
          },
        ],
      };
    }
  }

  /**
   * Validate and throw agent-friendly error on failure
   */
  export function validateOrThrow<T>(
    schema: z.ZodType<T>,
    data: unknown,
    context: string,
    fieldPrefix: string = ""
  ): T {
    const result = validateWithContext(schema, data, context, fieldPrefix);

    if (!result.success) {
      const recommendations = generateRecommendationsFromErrors(result.errors ?? []);
      throw new AgentValidationError(
        `Validation failed for ${context}`,
        result.errors ?? [],
        context,
        recommendations
      );
    }

    if (result.data === undefined) {
      throw new AgentValidationError(
        `Validation failed for ${context}`,
        result.errors ?? [],
        context,
        ["Validation returned unknown data state"]
      );
    }

    return result.data;
  }

  /**
   * Format Zod errors into structured validation errors
   */
  function formatZodErrors(
    zodError: z.ZodError,
    fieldPrefix: string,
    context: string
  ): ValidationError[] {
    return zodError.issues.map(issue => {
      const issuePath = issue.path.join(".");
      const field = fieldPrefix !== "" ? `${fieldPrefix}.${issuePath}` : issuePath;

      const code = mapZodCodeToValidationCode(issue, context);
      const severity = determineSeverity(issue, context);

      return {
        field,
        message: issue.message,
        code,
        severity,
      };
    });
  }

  /**
   * Map Zod error codes to validation error codes
   */
  function mapZodCodeToValidationCode(issue: z.ZodIssue, context: string): ValidationErrorCode {
    // Check for security-related issues
    if (
      issue.message.includes("security") ||
      issue.message.includes("cross-account") ||
      issue.message.includes("production")
    ) {
      return "SECURITY_VIOLATION";
    }

    // Check for compliance issues
    if (
      issue.message.includes("compliance") ||
      issue.message.includes("UCX") ||
      issue.message.includes("PCI") ||
      issue.message.includes("HIPAA")
    ) {
      return "POLICY_VIOLATION";
    }

    // Check for cross-account issues
    if (issue.message.includes("cross-account") || context.includes("cross-account")) {
      return "CROSS_ACCOUNT_VIOLATION";
    }

    return ERROR_CODE_MAP[issue.code] ?? "INVALID_VALUE";
  }

  /**
   * Determine error severity based on context and issue type
   */
  function determineSeverity(issue: z.ZodIssue, context: string): "error" | "warning" | "info" {
    // Production issues are always errors
    if (context.includes("prd") || context.includes("production")) {
      return "error";
    }

    // Security and compliance issues are errors
    if (
      issue.message.includes("security") ||
      issue.message.includes("compliance") ||
      issue.code === "custom"
    ) {
      return "error";
    }

    // Format and constraint violations are warnings in dev
    if (["invalid_string", "too_small", "too_big"].includes(issue.code)) {
      return context.includes("dev") ? "warning" : "error";
    }

    return "error";
  }

  /**
   * Generate recommendations from structured errors
   */
  function generateRecommendationsFromErrors(errors: ValidationError[]): string[] {
    const recommendations: string[] = [];

    for (const error of errors) {
      switch (error.code) {
        case "REQUIRED_FIELD_MISSING":
          recommendations.push(`Provide a value for required field: ${error.field}`);
          break;
        case "INVALID_FORMAT":
          recommendations.push(`Check the format of ${error.field}`);
          break;
        case "INVALID_VALUE":
          recommendations.push(`Use a valid value for ${error.field}`);
          break;
        case "CONSTRAINT_VIOLATION":
          recommendations.push(`Adjust ${error.field} to meet constraints`);
          break;
        case "SECURITY_VIOLATION":
          recommendations.push(`Review security requirements for ${error.field}`);
          break;
        case "POLICY_VIOLATION":
          recommendations.push(`Ensure ${error.field} meets policy requirements`);
          break;
        case "CROSS_ACCOUNT_VIOLATION":
          recommendations.push(`Verify cross-account configuration for ${error.field}`);
          break;
        default:
          break;
      }
    }

    return recommendations;
  }

  /**
   * Validate multiple schemas and aggregate results
   */
  export function validateMultiple(
    validations: Array<{
      schema: z.ZodType<unknown>;
      data: unknown;
      context: string;
      fieldPrefix?: string;
    }>
  ): ValidationResult<Record<string, unknown>> {
    const results: Record<string, unknown> = {};
    const allErrors: ValidationError[] = [];

    for (const validation of validations) {
      const result = validateWithContext(
        validation.schema,
        validation.data,
        validation.context,
        validation.fieldPrefix
      );

      if (result.success) {
        if (result.data !== undefined) {
          results[validation.context] = result.data;
        }
      } else {
        allErrors.push(...(result.errors ?? []));
      }
    }

    return allErrors.length > 0
      ? { success: false, errors: allErrors }
      : { success: true, data: results };
  }
}

/**
 * Type-safe validation patterns for common configurations
 */
export namespace ValidationPatterns {
  /**
   * Validate stack context with environment-specific rules
   */
  export const validateStackContext = (
    data: unknown,
    context: string = "stack-context"
  ): ValidationResult<{
    org: string;
    cloud: "aws" | "gcp" | "azure";
    purpose: "app" | "ucx" | "data" | "security" | "ops";
    environment: "dev" | "stg" | "prd" | "sec";
    region: string;
    stackName: string;
  }> =>
    AgentValidationService.validateWithContext(
      z.object({
        org: z
          .string()
          .min(2)
          .max(8)
          .regex(/^[a-z][a-z0-9]*$/),
        cloud: z.enum(["aws", "gcp", "azure"]),
        purpose: z.enum(["app", "ucx", "data", "security", "ops"]),
        environment: z.enum(["dev", "stg", "prd", "sec"]),
        region: z.string(),
        stackName: z.string(),
      }),
      data,
      context
    );

  /**
   * Validate infrastructure configuration with business rules
   */
  export const validateInfrastructureConfig = (
    data: unknown,
    context: string = "infrastructure-config"
  ): ValidationResult<{
    vpcCidr: string;
    environment: "dev" | "stg" | "prd" | "sec";
    enableNatGateway: boolean;
    enableFlowLogs: boolean;
    retentionDays: number;
  }> =>
    AgentValidationService.validateWithContext(
      z
        .object({
          vpcCidr: z.string().regex(/^10\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\/([0-9]{1,2})$/),
          environment: z.enum(["dev", "stg", "prd", "sec"]),
          enableNatGateway: z.boolean(),
          enableFlowLogs: z.boolean(),
          retentionDays: z.number().min(1).max(2557),
        })
        .superRefine((parsedData, ctx) => {
          // Production requires flow logs
          if (parsedData.environment === "prd" && !parsedData.enableFlowLogs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Production environments require flow logs enabled",
              path: ["enableFlowLogs"],
            });
          }
        }),
      data,
      context
    );

  /**
   * Validate cross-account operation
   */
  export const validateCrossAccountOperation = (
    data: unknown,
    context: string = "cross-account-operation"
  ): ValidationResult<{
    sourceAccount: string;
    targetAccount: string;
    operation: "assume-role" | "share-resource" | "create-dns" | "access-secrets";
    environment: "dev" | "stg" | "prd" | "sec";
    approvalRequired: boolean;
  }> =>
    AgentValidationService.validateWithContext(
      z
        .object({
          sourceAccount: z
            .string()
            .length(12)
            .regex(/^\d{12}$/),
          targetAccount: z
            .string()
            .length(12)
            .regex(/^\d{12}$/),
          operation: z.enum(["assume-role", "share-resource", "create-dns", "access-secrets"]),
          environment: z.enum(["dev", "stg", "prd", "sec"]),
          approvalRequired: z.boolean(),
        })
        .superRefine((parsedData, ctx) => {
          if (parsedData.environment === "prd" && !parsedData.approvalRequired) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Production cross-account operations require approval",
              path: ["approvalRequired"],
            });
          }
        }),
      data,
      context
    );
}
