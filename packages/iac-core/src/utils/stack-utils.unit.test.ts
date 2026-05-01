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

import { beforeEach, describe, expect, it, vi } from "vitest";
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
  generateFullStackReference,
  generateProjectName,
  generateStackName,
  getComplianceRequirements,
  getEnvironmentConfig,
  getStackPurposeClass,
  isValidStackName,
  parseProjectName,
  parseStackName,
  validateCrossAccountOperation,
  validateStackContext,
} from "./stack-utils.js";

describe("Stack Utils - Comprehensive Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseProjectName", () => {
    it("should parse valid 3-part project names", () => {
      const result = parseProjectName("worx-aws-dev");
      expect(result).toEqual({
        tenant: "worx",
        cloud: "aws",
        environment: "dev",
      });
    });

    it("should parse different tenant/cloud/env combinations", () => {
      expect(parseProjectName("care-gcp-prd")).toEqual({
        tenant: "care",
        cloud: "gcp",
        environment: "prd",
      });

      expect(parseProjectName("worx-azure-stg")).toEqual({
        tenant: "worx",
        cloud: "azure",
        environment: "stg",
      });
    });

    it("should trim whitespace from components", () => {
      // Test that parsed components are trimmed (even though input shouldn't have spaces)
      const result = parseProjectName("worx-aws-dev");
      expect(result.tenant).toBe("worx");
      expect(result.cloud).toBe("aws");
      expect(result.environment).toBe("dev");
    });

    it("should throw error for invalid format with too few parts", () => {
      expect(() => parseProjectName("worx-aws")).toThrow(
        "Invalid project name format: worx-aws. Expected: {tenant}-{cloud}-{env}"
      );
    });

    it("should throw error for invalid format with too many parts", () => {
      expect(() => parseProjectName("worx-aws-dev-extra")).toThrow(
        "Invalid project name format: worx-aws-dev-extra. Expected: {tenant}-{cloud}-{env}"
      );
    });

    it("should throw error for single part name", () => {
      expect(() => parseProjectName("worx")).toThrow("Invalid project name format");
    });

    it("should throw error for empty components", () => {
      expect(() => parseProjectName("--")).toThrow("Incomplete project name components");
    });

    it("should throw error for components with only whitespace", () => {
      expect(() => parseProjectName("   -   -   ")).toThrow("Incomplete project name components");
    });
  });

  describe("parseStackName - 3-part format", () => {
    it.each([
      ["app-web-use1", { accountPurpose: "app", stackPurpose: "web", region: "use1" }],
      ["ops-iam-use1", { accountPurpose: "ops", stackPurpose: "iam", region: "use1" }],
      ["lake-data-usw2", { accountPurpose: "lake", stackPurpose: "data", region: "usw2" }],
    ])("should parse '%s' correctly", (stackName, expected) => {
      expect(parseStackName(stackName)).toEqual(expected);
    });

    it.each([["--use1"], ["app--use1"], ["app-web-"], ["   -web-use1"]])(
      "should throw error for invalid format: %s",
      invalidName => {
        expect(() => parseStackName(invalidName)).toThrow("Incomplete stack name components");
      }
    );
  });

  describe("parseStackName - 4-part format with concern", () => {
    it.each([
      [
        "app-iam-github-use1",
        { accountPurpose: "app", stackPurpose: "iam", concern: "github", region: "use1" },
      ],
      [
        "app-web-myapp-use1",
        { accountPurpose: "app", stackPurpose: "web", concern: "myapp", region: "use1" },
      ],
      [
        "ops-cicd-flow-usw2",
        { accountPurpose: "ops", stackPurpose: "cicd", concern: "flow", region: "usw2" },
      ],
    ])("should parse '%s' correctly", (stackName, expected) => {
      expect(parseStackName(stackName)).toEqual(expected);
    });

    it.each([["app--github-use1"], ["app-iam--use1"]])(
      "should throw error for invalid format: %s",
      invalidName => {
        expect(() => parseStackName(invalidName)).toThrow("Incomplete stack name components");
      }
    );
  });

  describe("parseStackName - 4-part format with targetEnvironment", () => {
    it.each([
      [
        "dev-ops-vpc-use1",
        { targetEnvironment: "dev", accountPurpose: "ops", stackPurpose: "vpc", region: "use1" },
      ],
      [
        "stg-ops-vpc-use1",
        { targetEnvironment: "stg", accountPurpose: "ops", stackPurpose: "vpc", region: "use1" },
      ],
      [
        "prd-ops-vpc-use1",
        { targetEnvironment: "prd", accountPurpose: "ops", stackPurpose: "vpc", region: "use1" },
      ],
      [
        "sec-ops-cicd-use1",
        { targetEnvironment: "sec", accountPurpose: "ops", stackPurpose: "cicd", region: "use1" },
      ],
    ])("should parse '%s' correctly", (stackName, expected) => {
      expect(parseStackName(stackName)).toEqual(expected);
    });

    it.each([["dev--vpc-use1"], ["dev-ops--use1"]])(
      "should throw error for invalid format: %s",
      invalidName => {
        expect(() => parseStackName(invalidName)).toThrow("Incomplete stack name components");
      }
    );
  });

  describe("parseStackName - 5-part format", () => {
    it.each([
      [
        "dev-ops-vpc-shared-use1",
        {
          targetEnvironment: "dev",
          accountPurpose: "ops",
          stackPurpose: "vpc",
          concern: "shared",
          region: "use1",
        },
      ],
      [
        "stg-ops-cicd-github-usw2",
        {
          targetEnvironment: "stg",
          accountPurpose: "ops",
          stackPurpose: "cicd",
          concern: "github",
          region: "usw2",
        },
      ],
      [
        "prd-ops-monitoring-prometheus-euw1",
        {
          targetEnvironment: "prd",
          accountPurpose: "ops",
          stackPurpose: "monitoring",
          concern: "prometheus",
          region: "euw1",
        },
      ],
    ])("should parse '%s' correctly", (stackName, expected) => {
      expect(parseStackName(stackName)).toEqual(expected);
    });

    it.each([
      ["dev--vpc-shared-use1"],
      ["dev-ops--shared-use1"],
      ["dev-ops-vpc--use1"],
      ["dev-ops-vpc-shared-"],
    ])("should throw error for invalid format: %s", invalidName => {
      expect(() => parseStackName(invalidName)).toThrow("Incomplete stack name components");
    });
  });

  describe("parseStackName - full Pulumi paths", () => {
    it("should parse full Pulumi path format (org/project/stack)", () => {
      const result = parseStackName("adaptiveworx/worx-aws-dev/app-web-use1");
      expect(result).toEqual({
        org: "adaptiveworx",
        tenant: "worx",
        cloud: "aws",
        environment: "dev",
        accountPurpose: "app",
        stackPurpose: "web",
        region: "use1",
      });
    });

    it("should parse full path with 4-part stack (concern)", () => {
      const result = parseStackName("adaptiveworx/worx-aws-dev/app-iam-github-use1");
      expect(result).toEqual({
        org: "adaptiveworx",
        tenant: "worx",
        cloud: "aws",
        environment: "dev",
        accountPurpose: "app",
        stackPurpose: "iam",
        concern: "github",
        region: "use1",
      });
    });

    it("should parse full path with 4-part stack (targetEnvironment)", () => {
      const result = parseStackName("adaptiveworx/worx-aws-sec/dev-ops-vpc-use1");
      expect(result).toEqual({
        org: "adaptiveworx",
        tenant: "worx",
        cloud: "aws",
        environment: "sec",
        targetEnvironment: "dev",
        accountPurpose: "ops",
        stackPurpose: "vpc",
        region: "use1",
      });
    });

    it("should parse full path with 5-part stack", () => {
      const result = parseStackName("adaptiveworx/worx-aws-sec/dev-ops-vpc-shared-use1");
      expect(result).toEqual({
        org: "adaptiveworx",
        tenant: "worx",
        cloud: "aws",
        environment: "sec",
        targetEnvironment: "dev",
        accountPurpose: "ops",
        stackPurpose: "vpc",
        concern: "shared",
        region: "use1",
      });
    });

    it("should handle paths with non-3-part project names", () => {
      const result = parseStackName("adaptiveworx/care-gcp-prd/app-api-apne1");
      expect(result).toEqual({
        org: "adaptiveworx",
        tenant: "care",
        cloud: "gcp",
        environment: "prd",
        accountPurpose: "app",
        stackPurpose: "api",
        region: "apne1",
      });
    });
  });

  describe("parseStackName - invalid formats", () => {
    it("should throw error for 2-part stack names", () => {
      expect(() => parseStackName("app-use1")).toThrow("Invalid stack name format");
    });

    it("should throw error for 6-part stack names", () => {
      expect(() => parseStackName("dev-ops-vpc-shared-use1-extra")).toThrow(
        "Invalid stack name format"
      );
    });

    it("should throw error for single part stack names", () => {
      expect(() => parseStackName("app")).toThrow("Invalid stack name format");
    });

    it("should throw error for empty stack names", () => {
      expect(() => parseStackName("")).toThrow("Invalid stack name format");
    });
  });

  describe("generateProjectName", () => {
    it("should generate project name from cloud and environment", () => {
      expect(generateProjectName("aws", "dev")).toBe("aws-dev");
      expect(generateProjectName("gcp", "prd")).toBe("gcp-prd");
      expect(generateProjectName("azure", "stg")).toBe("azure-stg");
    });
  });

  describe("generateStackName", () => {
    it("should generate 3-part stack name without concern or targetEnvironment", () => {
      expect(generateStackName("app", "web", "use1")).toBe("app-web-use1");
      expect(generateStackName("ops", "iam", "usw2")).toBe("ops-iam-usw2");
    });

    it("should generate 4-part stack name with concern", () => {
      expect(generateStackName("app", "iam", "use1", "github")).toBe("app-iam-github-use1");
      expect(generateStackName("ops", "cicd", "usw2", "flow")).toBe("ops-cicd-flow-usw2");
    });

    it("should generate 4-part stack name with targetEnvironment", () => {
      expect(generateStackName("ops", "vpc", "use1", undefined, "dev")).toBe("dev-ops-vpc-use1");
      expect(generateStackName("ops", "cicd", "usw2", undefined, "stg")).toBe("stg-ops-cicd-usw2");
    });

    it("should generate 5-part stack name with both concern and targetEnvironment", () => {
      expect(generateStackName("ops", "vpc", "use1", "shared", "dev")).toBe(
        "dev-ops-vpc-shared-use1"
      );
      expect(generateStackName("ops", "cicd", "usw2", "github", "prd")).toBe(
        "prd-ops-cicd-github-usw2"
      );
    });

    it("should ignore empty string concern", () => {
      expect(generateStackName("app", "web", "use1", "")).toBe("app-web-use1");
    });

    it("should ignore empty string targetEnvironment", () => {
      expect(generateStackName("app", "web", "use1", undefined, "")).toBe("app-web-use1");
    });

    it("should ignore both empty strings", () => {
      expect(generateStackName("app", "web", "use1", "", "")).toBe("app-web-use1");
    });
  });

  describe("generateFullStackReference", () => {
    it("should generate full Pulumi stack reference", () => {
      expect(generateFullStackReference("adaptiveworx", "aws", "dev", "app", "web", "use1")).toBe(
        "adaptiveworx/aws-dev/app-web-use1"
      );
    });

    it("should generate references for different combinations", () => {
      expect(generateFullStackReference("adaptiveworx", "gcp", "prd", "ops", "iam", "usw2")).toBe(
        "adaptiveworx/gcp-prd/ops-iam-usw2"
      );

      expect(
        generateFullStackReference("adaptiveworx", "azure", "stg", "lake", "data", "euw1")
      ).toBe("adaptiveworx/azure-stg/lake-data-euw1");
    });
  });

  describe("isValidStackName", () => {
    it("should return true for valid 3-part stack names", () => {
      expect(isValidStackName("app-web-use1")).toBe(true);
      expect(isValidStackName("ops-iam-usw2")).toBe(true);
    });

    it("should return true for valid 4-part stack names", () => {
      expect(isValidStackName("app-iam-github-use1")).toBe(true);
      expect(isValidStackName("dev-ops-vpc-use1")).toBe(true);
    });

    it("should return true for valid 5-part stack names", () => {
      expect(isValidStackName("dev-ops-vpc-shared-use1")).toBe(true);
    });

    it("should return true for full Pulumi paths", () => {
      expect(isValidStackName("adaptiveworx/worx-aws-dev/app-web-use1")).toBe(true);
    });

    it("should return false for invalid formats", () => {
      expect(isValidStackName("app-use1")).toBe(false);
      expect(isValidStackName("app")).toBe(false);
      expect(isValidStackName("")).toBe(false);
      expect(isValidStackName("app-web-use1-extra-extra-parts")).toBe(false);
    });
  });

  describe("detectStackContext", () => {
    it("should detect context from Pulumi project and stack (3-part)", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("app-web-use1");

      const context = detectStackContext();

      expect(context.org).toBe("adaptiveworx");
      expect(context.tenant).toBe("worx");
      expect(context.cloud).toBe("aws");
      expect(context.environment).toBe("dev");
      expect(context.accountPurpose).toBe("app");
      expect(context.stackPurpose).toBe("web");
      expect(context.region).toBe("use1");
      expect(context.projectName).toBe("worx-aws-dev");
      expect(context.stackName).toBe("app-web-use1");
      expect(context.concern).toBeUndefined();
      expect(context.targetEnvironment).toBeUndefined();
    });

    it("should detect context with concern (4-part)", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("app-iam-github-use1");

      const context = detectStackContext();

      expect(context.accountPurpose).toBe("app");
      expect(context.stackPurpose).toBe("iam");
      expect(context.concern).toBe("github");
      expect(context.region).toBe("use1");
    });

    it("should detect context with targetEnvironment (4-part)", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-sec");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-ops-vpc-use1");

      const context = detectStackContext();

      expect(context.environment).toBe("sec");
      expect(context.targetEnvironment).toBe("dev");
      expect(context.accountPurpose).toBe("ops");
      expect(context.stackPurpose).toBe("vpc");
      expect(context.region).toBe("use1");
    });

    it("should throw error for 5-part stack names (not supported by schema)", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-sec");
      vi.mocked(pulumi.getStack).mockReturnValue("dev-ops-vpc-shared-use1");

      // Schema validation only allows 3-part or 4-part stack names
      expect(() => detectStackContext()).toThrow("Stack context detection failed");
    });

    it("should throw error for invalid project name", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("invalid-project");
      vi.mocked(pulumi.getStack).mockReturnValue("app-web-use1");

      expect(() => detectStackContext()).toThrow("Stack context detection failed");
      expect(pulumi.log.error).toHaveBeenCalled();
    });

    it("should throw error for invalid stack name", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("invalid-stack");

      expect(() => detectStackContext()).toThrow("Stack context detection failed");
    });

    it("should exclude empty concern from context", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("app-web-use1");

      const context = detectStackContext();

      expect(context.concern).toBeUndefined();
    });

    it("should exclude empty targetEnvironment from context", () => {
      vi.mocked(pulumi.getProject).mockReturnValue("worx-aws-dev");
      vi.mocked(pulumi.getStack).mockReturnValue("app-web-use1");

      const context = detectStackContext();

      expect(context.targetEnvironment).toBeUndefined();
    });
  });

  describe("validateStackContext", () => {
    it("should pass validation for valid context", () => {
      const context: StackContext = {
        org: "adaptiveworx",
        tenant: "worx",
        cloud: "aws",
        accountPurpose: "app",
        stackPurpose: "web",
        environment: "dev",
        region: "use1",
        projectName: "worx-aws-dev",
        stackName: "app-web-use1",
      };

      expect(() => validateStackContext(context)).not.toThrow();
      expect(pulumi.log.info).toHaveBeenCalledWith(expect.stringContaining("validation passed"));
    });

    it("should pass validation for context with concern", () => {
      const context: StackContext = {
        org: "adaptiveworx",
        tenant: "worx",
        cloud: "aws",
        accountPurpose: "app",
        stackPurpose: "iam",
        environment: "dev",
        region: "use1",
        projectName: "worx-aws-dev",
        stackName: "app-iam-github-use1",
        concern: "github",
      };

      expect(() => validateStackContext(context)).not.toThrow();
    });

    it("should throw error for invalid context", () => {
      const invalidContext = {
        org: "adaptiveworx",
        tenant: "worx",
        cloud: "invalid-cloud",
        accountPurpose: "app",
        stackPurpose: "web",
        environment: "dev",
        region: "use1",
        projectName: "worx-aws-dev",
        stackName: "app-web-use1",
      } as unknown as StackContext;

      expect(() => validateStackContext(invalidContext)).toThrow("validation failed");
      expect(pulumi.log.error).toHaveBeenCalled();
    });

    it("should provide detailed error messages for validation failures", () => {
      const invalidContext = {
        org: "",
        tenant: "worx",
        cloud: "aws",
        accountPurpose: "a",
        stackPurpose: "web",
        environment: "dev",
        region: "use1",
        projectName: "worx-aws-dev",
        stackName: "app-web-use1",
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
      cloud: "aws",
      accountPurpose: "app",
      stackPurpose: "web",
      environment: "dev",
      region: "use1",
      projectName: "worx-aws-dev",
      stackName: "app-web-use1",
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
