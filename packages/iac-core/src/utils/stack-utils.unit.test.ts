/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Comprehensive unit tests for stack-utils.ts
 * Target: 95%+ coverage for all exported functions
 * Agent-optimized with exhaustive branch coverage
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StackContext } from "../types/core.js";

// Mock Pulumi before importing stack-utils
vi.mock("@pulumi/pulumi", () => ({
  getProject: vi.fn(),
  getStack: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock region-utils to avoid file system dependencies
vi.mock("./region-utils.js", () => ({
  resolveRegion: vi.fn((_cloud: string, regionCode: string) => {
    // Simple mapping for testing
    const awsRegionMap: Record<string, string> = {
      use1: "us-east-1",
      use2: "us-east-2",
      usw1: "us-west-1",
      usw2: "us-west-2",
      euw1: "eu-west-1",
      euc1: "eu-central-1",
      apne1: "ap-northeast-1",
    };
    return awsRegionMap[regionCode] ?? regionCode;
  }),
}));

import * as pulumi from "@pulumi/pulumi";
import {
  detectStackContext,
  getComplianceRequirements,
  getEnvironmentConfig,
  getStackPurposeClass,
  validateCrossAccountOperation,
  validateStackContext,
} from "./stack-utils.js";

describe("Stack Utils - Comprehensive Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectStackContext", () => {
    beforeEach(() => {
      vi.stubEnv("PULUMI_ORG", "adaptiveworx");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should detect context from Pulumi project and stack (3-part)", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-app-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-web-use1");

      const context = detectStackContext();

      expect(context.org).toBe("adaptiveworx");
      expect(context.tenant).toBe("worx");
      expect(context.provider).toBe("aws");
      expect(context.environment).toBe("dev");
      expect(context.accountPurpose).toBe("app");
      expect(context.stackPurpose).toBe("web");
      expect(context.region).toBe("use1");
      expect(context.projectName).toBe("worx-aws-app-dev");
      expect(context.stackName).toBe("dev-web-use1");
      expect(context.concern).toBeUndefined();
      expect(context.targetEnvironment).toBeUndefined();
    });

    it("uses PULUMI_ORG from the environment", () => {
      vi.stubEnv("PULUMI_ORG", "acme");
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-app-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-web-use1");

      const context = detectStackContext();

      expect(context.org).toBe("acme");
    });

    it("trims surrounding whitespace from PULUMI_ORG", () => {
      vi.stubEnv("PULUMI_ORG", "  acme  ");
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-app-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-web-use1");

      const context = detectStackContext();

      expect(context.org).toBe("acme");
    });

    it("throws when PULUMI_ORG is not set", () => {
      vi.stubEnv("PULUMI_ORG", undefined);
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-app-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-web-use1");

      expect(() => detectStackContext()).toThrow(/PULUMI_ORG environment variable is required/);
    });

    it("throws when PULUMI_ORG is empty or whitespace", () => {
      vi.stubEnv("PULUMI_ORG", "   ");
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-app-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-web-use1");

      expect(() => detectStackContext()).toThrow(/PULUMI_ORG environment variable is required/);
    });

    it("should detect context with concern (4-part)", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-app-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-iam-github-use1");

      const context = detectStackContext();

      expect(context.accountPurpose).toBe("app");
      expect(context.stackPurpose).toBe("iam");
      expect(context.concern).toBe("github");
      expect(context.region).toBe("use1");
    });

    it("should detect context with targetEnvironment (3-part, centralized)", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-ops-sec");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-vpc-use1");

      const context = detectStackContext();

      expect(context.environment).toBe("sec");
      expect(context.targetEnvironment).toBe("dev");
      expect(context.accountPurpose).toBe("ops");
      expect(context.stackPurpose).toBe("vpc");
      expect(context.region).toBe("use1");
    });

    it("should detect context with targetEnvironment and concern (4-part, centralized)", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-ops-sec");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-vpc-shared-use1");

      // StackNameSchema, parseStackIdentity and StackContextSchema share the 3-4 segment rule.
      const context = detectStackContext();
      expect(context.targetEnvironment).toBe("dev");
      expect(context.concern).toBe("shared");
      expect(context.stackPurpose).toBe("vpc");
    });

    it("should throw error for invalid project name", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("invalid-project");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-web-use1");

      expect(() => detectStackContext()).toThrow("Stack context detection failed");
      expect(pulumi.log.error).toHaveBeenCalled();
    });

    it("should throw error for invalid stack name", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-app-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("invalid-stack");

      expect(() => detectStackContext()).toThrow("Stack context detection failed");
    });

    it("should exclude empty concern from context", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-app-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-web-use1");

      const context = detectStackContext();

      expect(context.concern).toBeUndefined();
    });

    it("should exclude empty targetEnvironment from context", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-app-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-web-use1");

      const context = detectStackContext();

      expect(context.targetEnvironment).toBeUndefined();
    });
  });

  describe("validateStackContext", () => {
    it("should pass validation for valid context", () => {
      const context: StackContext = {
        org: "adaptiveworx",
        tenant: "worx",
        provider: "aws",
        accountPurpose: "app",
        stackPurpose: "web",
        environment: "dev",
        region: "use1",
        projectName: "worx-aws-app-dev",
        stackName: "dev-web-use1",
      };

      expect(() => validateStackContext(context)).not.toThrow();
      expect(pulumi.log.info).toHaveBeenCalledWith(expect.stringContaining("validation passed"));
    });

    it("should pass validation for context with concern", () => {
      const context: StackContext = {
        org: "adaptiveworx",
        tenant: "worx",
        provider: "aws",
        accountPurpose: "app",
        stackPurpose: "iam",
        environment: "dev",
        region: "use1",
        projectName: "worx-aws-app-dev",
        stackName: "dev-iam-github-use1",
        concern: "github",
      };

      expect(() => validateStackContext(context)).not.toThrow();
    });

    it("should throw error for invalid context", () => {
      const invalidContext = {
        org: "adaptiveworx",
        tenant: "worx",
        provider: "invalid-cloud",
        accountPurpose: "app",
        stackPurpose: "web",
        environment: "dev",
        region: "use1",
        projectName: "worx-aws-app-dev",
        stackName: "dev-web-use1",
      } as unknown as StackContext;

      expect(() => validateStackContext(invalidContext)).toThrow("validation failed");
      expect(pulumi.log.error).toHaveBeenCalled();
    });

    it("should provide detailed error messages for validation failures", () => {
      const invalidContext = {
        org: "",
        tenant: "worx",
        provider: "aws",
        accountPurpose: "a",
        stackPurpose: "web",
        environment: "dev",
        region: "use1",
        projectName: "worx-aws-app-dev",
        stackName: "dev-web-use1",
      } as unknown as StackContext;

      try {
        validateStackContext(invalidContext);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain("validation failed");
      }
    });
  });

  describe("getEnvironmentConfig", () => {
    it("should return production config for production environment", () => {
      const config = getEnvironmentConfig("production");
      expect(config).toEqual({
        isProduction: true,
        requiresApproval: true,
        enableMonitoring: true,
        enableBackup: true,
        retentionDays: 2557,
      });
    });

    it("should return staging config for staging environment", () => {
      const config = getEnvironmentConfig("staging");
      expect(config).toEqual({
        isProduction: false,
        requiresApproval: true,
        enableMonitoring: true,
        enableBackup: true,
        retentionDays: 365,
      });
    });

    it("should return testing config for testing environment", () => {
      const config = getEnvironmentConfig("testing");
      expect(config).toEqual({
        isProduction: false,
        requiresApproval: false,
        enableMonitoring: true,
        enableBackup: true,
        retentionDays: 180,
      });
    });

    it("should return development config for development environment", () => {
      const config = getEnvironmentConfig("development");
      expect(config).toEqual({
        isProduction: false,
        requiresApproval: false,
        enableMonitoring: true,
        enableBackup: false,
        retentionDays: 90,
      });
    });

    it("should return operations config for operations environment", () => {
      const config = getEnvironmentConfig("operations");
      expect(config).toEqual({
        isProduction: true,
        requiresApproval: true,
        enableMonitoring: true,
        enableBackup: true,
        retentionDays: 2557,
      });
    });

    it("should return disaster-recovery config for disaster-recovery environment", () => {
      const config = getEnvironmentConfig("disaster-recovery");
      expect(config).toEqual({
        isProduction: true,
        requiresApproval: true,
        enableMonitoring: true,
        enableBackup: true,
        retentionDays: 3650,
      });
    });

    it("should fallback to development config for unknown environments", () => {
      const config = getEnvironmentConfig("custom-env");
      expect(config).toEqual({
        isProduction: false,
        requiresApproval: false,
        enableMonitoring: true,
        enableBackup: false,
        retentionDays: 90,
      });
    });
  });

  describe("getStackPurposeClass", () => {
    it.each([
      // Infrastructure
      ["vpc", "infrastructure"],
      ["vnet", "infrastructure"],
      ["network", "infrastructure"],
      ["cicd", "infrastructure"],
      ["vpn", "infrastructure"],
      ["bastion", "infrastructure"],
      ["gateway", "infrastructure"],
      ["custom-vpc-setup", "infrastructure"],
      ["cicd-pipeline", "infrastructure"],

      // Security
      ["iam", "security"],
      ["entra", "security"],
      ["active-directory", "security"],
      ["secrets", "security"],
      ["key-vault", "security"],
      ["kms", "security"],
      ["waf", "security"],
      ["firewall", "security"],
      ["app-gateway", "security"],
      ["custom-iam-roles", "security"],
      ["secret-manager", "security"],

      // Compute
      ["web", "compute"],
      ["api", "compute"],
      ["ai", "compute"],
      ["ml", "compute"],
      ["worker", "compute"],
      ["lambda", "compute"],
      ["functions", "compute"],
      ["app-service", "compute"],
      ["aks", "compute"],
      ["eks", "compute"],
      ["gke", "compute"],
      ["ecs", "compute"],
      ["container-apps", "compute"],
      ["custom-api-gateway", "compute"],
      ["web-server", "compute"],

      // Data
      ["data", "data"],
      ["cache", "data"],
      ["queue", "data"],
      ["storage", "data"],
      ["backup", "data"],
      ["streaming", "data"],
      ["database", "data"],
      ["rds", "data"],
      ["cosmos", "data"],
      ["cloud-sql", "data"],
      ["dynamodb", "data"],
      ["redis", "data"],
      ["s3", "data"],
      ["blob-storage", "data"],
      ["cloud-storage", "data"],
      ["custom-data-lake", "data"],

      // Observability
      ["obs", "observability"],
      ["logging", "observability"],
      ["metrics", "observability"],
      ["tracing", "observability"],
      ["alerting", "observability"],
      ["monitoring", "observability"],
      ["cloudwatch", "observability"],
      ["application-insights", "observability"],
      ["cloud-monitoring", "observability"],
      ["custom-logging", "observability"],

      // Edge
      ["cdn", "edge"],
      ["edge", "edge"],
      ["iot", "edge"],
      ["cloudfront", "edge"],
      ["front-door", "edge"],
      ["cloud-cdn", "edge"],
      ["edge-compute", "edge"],

      // Integration
      ["webhooks", "integration"],
      ["events", "integration"],
      ["messaging", "integration"],
      ["sns", "integration"],
      ["sqs", "integration"],
      ["service-bus", "integration"],
      ["pubsub", "integration"],
      ["eventgrid", "integration"],
      ["event-bus", "integration"],
      ["integration-hub", "integration"],

      // Default (compute)
      ["unknown", "compute"],
      ["custom", "compute"],
      ["myservice", "compute"],

      // Case insensitivity
      ["VPC", "infrastructure"],
      ["IAM", "security"],
      ["API", "compute"],
      ["Vpc", "infrastructure"],
      ["Iam", "security"],
      ["Api", "compute"],
    ])("should classify '%s' as %s", (purpose, expected) => {
      expect(getStackPurposeClass(purpose)).toBe(expected);
    });
  });

  describe("getComplianceRequirements", () => {
    it("should return compliance requirements for ucx account", () => {
      expect(getComplianceRequirements("ucx")).toEqual(["pci-dss", "hipaa", "sox"]);
    });

    it("should return compliance requirements for lake account", () => {
      expect(getComplianceRequirements("lake")).toEqual(["gdpr", "sox"]);
    });

    it("should return compliance requirements for ops account", () => {
      expect(getComplianceRequirements("ops")).toEqual(["nist", "sox", "iso27001"]);
    });

    it("should return compliance requirements for app account", () => {
      expect(getComplianceRequirements("app")).toEqual(["sox"]);
    });

    it("should return empty array for unknown account purposes", () => {
      expect(getComplianceRequirements("unknown")).toEqual([]);
      expect(getComplianceRequirements("custom")).toEqual([]);
    });
  });

  describe("validateCrossAccountOperation", () => {
    const createContext = (overrides: Partial<StackContext>): StackContext => ({
      org: "adaptiveworx",
      tenant: "worx",
      provider: "aws",
      accountPurpose: "app",
      stackPurpose: "web",
      environment: "dev",
      region: "use1",
      projectName: "worx-aws-app-dev",
      stackName: "dev-web-use1",
      ...overrides,
    });

    it("should allow cross-account operations within same organization", () => {
      const source = createContext({ accountPurpose: "app" });
      const target = createContext({ accountPurpose: "ops" });

      expect(() => validateCrossAccountOperation(source, target)).not.toThrow();
      expect(pulumi.log.info).toHaveBeenCalledWith(expect.stringContaining("validation passed"));
    });

    it("should throw error for cross-organization operations", () => {
      const source = createContext({ org: "adaptiveworx" });
      const target = createContext({ org: "different-org" });

      expect(() => validateCrossAccountOperation(source, target)).toThrow(
        "Cross-organization operations not allowed"
      );
    });

    it("should throw error when non-production modifies production", () => {
      const source = createContext({ environment: "dev" });
      const target = createContext({ environment: "prd" });

      expect(() => validateCrossAccountOperation(source, target)).toThrow(
        "Non-production accounts cannot modify production resources"
      );
    });

    it("should allow production to modify production", () => {
      const source = createContext({ environment: "prd" });
      const target = createContext({ environment: "prd" });

      expect(() => validateCrossAccountOperation(source, target)).not.toThrow();
    });

    it("should allow staging to modify staging", () => {
      const source = createContext({ environment: "stg" });
      const target = createContext({ environment: "stg" });

      expect(() => validateCrossAccountOperation(source, target)).not.toThrow();
    });

    it("should allow dev to modify dev", () => {
      const source = createContext({ environment: "dev" });
      const target = createContext({ environment: "dev" });

      expect(() => validateCrossAccountOperation(source, target)).not.toThrow();
    });

    it("should throw error when ucx interacts with non-ucx", () => {
      const source = createContext({ accountPurpose: "ucx" });
      const target = createContext({ accountPurpose: "app" });

      expect(() => validateCrossAccountOperation(source, target)).toThrow(
        "UCX accounts can only interact with other UCX accounts for compliance"
      );
    });

    it("should throw error when non-ucx interacts with ucx", () => {
      const source = createContext({ accountPurpose: "app" });
      const target = createContext({ accountPurpose: "ucx" });

      expect(() => validateCrossAccountOperation(source, target)).toThrow(
        "Non-UCX accounts cannot modify UCX resources for compliance"
      );
    });

    it("should allow ucx to ucx operations", () => {
      const source = createContext({ accountPurpose: "ucx" });
      const target = createContext({ accountPurpose: "ucx" });

      expect(() => validateCrossAccountOperation(source, target)).not.toThrow();
    });

    it("should allow app to ops operations", () => {
      const source = createContext({ accountPurpose: "app" });
      const target = createContext({ accountPurpose: "ops" });

      expect(() => validateCrossAccountOperation(source, target)).not.toThrow();
    });

    it("should allow ops to app operations", () => {
      const source = createContext({ accountPurpose: "ops" });
      const target = createContext({ accountPurpose: "app" });

      expect(() => validateCrossAccountOperation(source, target)).not.toThrow();
    });

    it("should allow lake to lake operations", () => {
      const source = createContext({ accountPurpose: "lake" });
      const target = createContext({ accountPurpose: "lake" });

      expect(() => validateCrossAccountOperation(source, target)).not.toThrow();
    });
  });
});
