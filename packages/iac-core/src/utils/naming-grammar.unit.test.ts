/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The project/stack naming grammar end to end: every project and stack name
 * iac-worx deploys (apps/{provider}/{env}/Pulumi*.yaml, after its W3 renames),
 * through detectStackContext(), StackContextSchema, StackNameSchema,
 * parseStackIdentity, projectNameOf and stackNameOf; then the negative cases.
 *
 *   project: {tenant}-{provider}-{account-purpose}-{env}
 *   stack:   {target-env}-{stack-purpose}[-{concern}]-{region}
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@pulumi/pulumi", () => ({
  getProject: vi.fn(),
  getStack: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import * as pulumi from "@pulumi/pulumi";
import {
  ProjectNameSchema,
  StackContextSchema,
  StackNameSchema,
  StackPurposeSchema,
} from "../schemas/core/core-schemas.js";
import {
  detectStackContext,
  parseStackIdentity,
  projectNameOf,
  stackNameOf,
} from "./stack-utils.js";

interface Expected {
  project: string;
  stack: string;
  provider: string;
  environment: string;
  accountPurpose: string;
  stackPurpose: string;
  region: string;
  concern?: string;
  targetEnvironment?: string;
}

/** iac-worx's 16 stacks in its 5 projects, as deployed after the W3 renames (2026-10-28). */
const IAC_WORX: Expected[] = [
  ...(["dev", "stg", "prd"] as const).flatMap(env =>
    ["github", "pulumi"].map(concern => ({
      project: `worx-aws-app-${env}`,
      stack: `${env}-iam-${concern}-use1`,
      provider: "aws",
      environment: env,
      accountPurpose: "app",
      stackPurpose: "iam",
      concern,
      region: "use1",
    }))
  ),
  {
    project: "worx-aws-app-dev",
    stack: "dev-flow-use1",
    provider: "aws",
    environment: "dev",
    accountPurpose: "app",
    stackPurpose: "flow",
    region: "use1",
  },
  ...["github", "pulumi"].map(concern => ({
    project: "worx-aws-ops-sec",
    stack: `sec-iam-${concern}-use1`,
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "iam",
    concern,
    region: "use1",
  })),
  ...(
    [
      ["dev", "vpc", "use1"],
      ["dev", "vpc", "usw2"],
      ["dev", "vpn", "use1"],
      ["stg", "vpc", "use1"],
      ["stg", "vpc", "usw2"],
      ["prd", "vpc", "use1"],
    ] as const
  ).map(([targetEnvironment, stackPurpose, region]) => ({
    project: "worx-aws-ops-sec",
    stack: `${targetEnvironment}-${stackPurpose}-${region}`,
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose,
    targetEnvironment,
    region,
  })),
  {
    project: "worx-cloudflare-ops-sec",
    stack: "sec-ztna-glb",
    provider: "cloudflare",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "ztna",
    region: "glb",
  },
];

function contextInput(e: Expected, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    org: "adaptiveworx",
    tenant: "worx",
    provider: e.provider,
    accountPurpose: e.accountPurpose,
    stackPurpose: e.stackPurpose,
    environment: e.environment,
    region: e.region,
    projectName: e.project,
    stackName: e.stack,
    ...(e.concern === undefined ? {} : { concern: e.concern }),
    ...(e.targetEnvironment === undefined ? {} : { targetEnvironment: e.targetEnvironment }),
    ...extra,
  };
}

function issuesOf(input: Record<string, unknown>): string[] {
  const result = StackContextSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
}

describe("naming grammar", () => {
  beforeEach(() => {
    vi.stubEnv("PULUMI_ORG", "adaptiveworx");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("every iac-worx project and stack", () => {
    it("covers 16 stacks in 5 projects", () => {
      expect(IAC_WORX).toHaveLength(16);
      expect(new Set(IAC_WORX.map(e => e.project)).size).toBe(5);
      expect(new Set(IAC_WORX.map(e => `${e.project}/${e.stack}`)).size).toBe(16);
    });

    it.each(IAC_WORX)("$project/$stack detects its context", e => {
      vi.mocked(pulumi.getProject).mockReturnValue(e.project);
      vi.mocked(pulumi.getStack).mockReturnValue(e.stack);

      const context = detectStackContext();

      expect(context).toEqual({
        org: "adaptiveworx",
        tenant: "worx",
        provider: e.provider,
        accountPurpose: e.accountPurpose,
        stackPurpose: e.stackPurpose,
        environment: e.environment,
        region: e.region,
        projectName: e.project,
        stackName: e.stack,
        ...(e.concern === undefined ? {} : { concern: e.concern }),
        ...(e.targetEnvironment === undefined ? {} : { targetEnvironment: e.targetEnvironment }),
      });
    });

    it.each(IAC_WORX)("$project/$stack validates as a context", e => {
      expect(issuesOf(contextInput(e))).toEqual([]);
    });

    it.each(IAC_WORX)(
      "$project/$stack is one grammar: the schemas, parseStackIdentity and the builders agree",
      e => {
        expect(StackNameSchema.safeParse(e.stack).success).toBe(true);
        expect(ProjectNameSchema.safeParse(e.project).success).toBe(true);
        expect(StackPurposeSchema.safeParse(e.stackPurpose).success).toBe(true);
        const identity = parseStackIdentity(e.project, e.stack);
        expect(identity.provider).toBe(e.provider);
        expect(projectNameOf(identity)).toBe(e.project);
        expect(stackNameOf(identity)).toBe(e.stack);
      }
    );
  });

  describe("stack name segments (one 3-4 rule)", () => {
    it.each([
      ["dev-flow-use1", 3],
      ["sec-ztna-glb", 3],
      ["sec-iam-github-use1", 4],
      ["dev-vpc-shared-use1", 4],
    ])("%s (%i segments) passes StackNameSchema and parseStackIdentity", stack => {
      expect(StackNameSchema.safeParse(stack).success).toBe(true);
      expect(() => parseStackIdentity("worx-aws-ops-sec", stack)).not.toThrow();
    });

    it.each(["sec-ztna", "dev-ops-vpc-shared-use1", "a-b-c-d-e-f"])(
      "%s (wrong segment count) fails both",
      stack => {
        expect(StackNameSchema.safeParse(stack).success).toBe(false);
        expect(() => parseStackIdentity("worx-aws-ops-sec", stack)).toThrow(
          "Invalid stack name format"
        );
      }
    );

    it.each(["Sec-ztna-glb", "sec_ztna-glb", "sec--glb", "sec-ztna-glb-", "-sec-ztna-glb"])(
      "%s (not kebab-case) fails StackNameSchema",
      stack => {
        expect(StackNameSchema.safeParse(stack).success).toBe(false);
      }
    );

    it("validates a centralized stack context with a concern (4 segments)", () => {
      expect(
        issuesOf({
          org: "adaptiveworx",
          tenant: "worx",
          provider: "aws",
          accountPurpose: "ops",
          stackPurpose: "vpc",
          environment: "sec",
          region: "use1",
          projectName: "worx-aws-ops-sec",
          stackName: "dev-vpc-shared-use1",
          concern: "shared",
          targetEnvironment: "dev",
        })
      ).toEqual([]);
    });

    it("refuses a legacy stack name in a context", () => {
      const legacy = {
        org: "adaptiveworx",
        tenant: "worx",
        provider: "aws",
        accountPurpose: "ops",
        stackPurpose: "vpc",
        environment: "sec",
        region: "use1",
        projectName: "worx-aws-ops-sec",
        targetEnvironment: "dev",
      };
      expect(issuesOf({ ...legacy, stackName: "dev-ops-vpc-use1" })).toEqual([
        "stackName: Stack name 'dev-ops-vpc-use1' does not match expected pattern 'dev-vpc-use1'",
      ]);
      expect(
        issuesOf({ ...legacy, stackName: "dev-ops-vpc-shared-use1", concern: "shared" })
      ).toContain(
        "stackName: Stack name must have 3 or 4 segments: {target-env}-{stack-purpose}[-{concern}]-{region}"
      );
    });

    it("refuses a legacy project name in a context", () => {
      const issues = issuesOf({
        org: "adaptiveworx",
        tenant: "worx",
        provider: "aws",
        accountPurpose: "ops",
        stackPurpose: "iam",
        environment: "sec",
        region: "use1",
        projectName: "worx-aws-sec",
        stackName: "sec-iam-github-use1",
        concern: "github",
      });
      expect(issues).toContain(
        "projectName: Project name must follow pattern: {tenant}-{provider}-{account-purpose}-{env}"
      );
    });
  });

  describe("stack purposes are one segment", () => {
    it("rejects hyphenated purposes, which the parser could never read back", () => {
      expect(StackPurposeSchema.safeParse("ml-training").success).toBe(false);
      expect(StackPurposeSchema.safeParse("mltraining").success).toBe(true);
      // what a hyphenated purpose actually parses as: purpose + concern
      expect(parseStackIdentity("worx-aws-app-dev", "dev-ml-training-use1")).toMatchObject({
        stackPurpose: "ml",
        concern: "training",
      });
    });
  });

  describe("providers and the global region", () => {
    const base = {
      org: "adaptiveworx",
      tenant: "worx",
      accountPurpose: "ops",
      stackPurpose: "ztna",
      environment: "sec",
      stackName: "sec-ztna-glb",
    };

    it("accepts github and infisical projects with glb", () => {
      expect(
        issuesOf({
          ...base,
          provider: "github",
          region: "glb",
          projectName: "worx-github-ops-sec",
        })
      ).toEqual([]);
      expect(
        issuesOf({
          ...base,
          provider: "infisical",
          region: "glb",
          projectName: "worx-infisical-ops-sec",
        })
      ).toEqual([]);
    });

    it("rejects glb on AWS", () => {
      const issues = issuesOf({
        ...base,
        provider: "aws",
        region: "glb",
        projectName: "worx-aws-ops-sec",
      });
      expect(issues.join("\n")).toMatch(
        /region: Region 'glb' is not a aws region code \(glb is only for providers without regions/
      );
    });

    it("rejects a regional code on Cloudflare", () => {
      const issues = issuesOf({
        ...base,
        provider: "cloudflare",
        region: "use1",
        projectName: "worx-cloudflare-ops-sec",
        stackName: "sec-ztna-use1",
      });
      expect(issues).toEqual([
        "region: Provider 'cloudflare' has no regions: its stacks use region 'glb'",
      ]);
    });

    it("rejects an unknown provider in the project and the context", () => {
      expect(ProjectNameSchema.safeParse("worx-k8s-ops-sec").success).toBe(false);
      expect(
        issuesOf({
          ...base,
          provider: "k8s",
          region: "glb",
          projectName: "worx-k8s-ops-sec",
        }).length
      ).toBeGreaterThan(0);

      vi.mocked(pulumi.getProject).mockReturnValue("worx-k8s-ops-sec");
      vi.mocked(pulumi.getStack).mockReturnValue("sec-ztna-glb");
      expect(() => detectStackContext()).toThrow("Stack context detection failed");
    });

    it("rejects a project whose provider differs from the context's", () => {
      expect(
        issuesOf({
          ...base,
          provider: "cloudflare",
          region: "glb",
          projectName: "worx-aws-ops-sec",
        })
      ).toEqual([
        "projectName: Project name 'worx-aws-ops-sec' does not match expected pattern 'worx-cloudflare-ops-sec'",
      ]);
    });

    it("requires a provider", () => {
      expect(
        issuesOf({
          ...base,
          region: "glb",
          projectName: "worx-cloudflare-ops-sec",
        }).some(issue => issue.startsWith("provider:"))
      ).toBe(true);
    });

    it("a cloud field does not stand in for provider (renamed, no alias)", () => {
      const result = StackContextSchema.safeParse({
        ...base,
        cloud: "cloudflare",
        region: "glb",
        projectName: "worx-cloudflare-ops-sec",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a malformed project name", () => {
      // Four segments, {tenant}-{provider}-{account-purpose}-{env}; three is the legacy grammar
      for (const project of [
        "worx-aws",
        "worx-aws-sec",
        "worx-aws-ops-sec-x",
        "Worx-aws-ops-sec",
        "worx_aws_ops_sec",
      ]) {
        expect(ProjectNameSchema.safeParse(project).success).toBe(false);
      }
      expect(() => parseStackIdentity("worx-cloudflare", "sec-ztna-glb")).toThrow(
        "{tenant}-{provider}-{account-purpose}-{env}"
      );
    });
  });

  describe("AWS region guardrails compare resolved regions", () => {
    const prdOps = {
      org: "adaptiveworx",
      tenant: "worx",
      provider: "aws",
      accountPurpose: "ops",
      stackPurpose: "iam",
      environment: "prd",
      projectName: "worx-aws-ops-prd",
    };

    it("accepts a prd ops stack in use1 (the code for us-east-1)", () => {
      expect(issuesOf({ ...prdOps, region: "use1", stackName: "prd-iam-use1" })).toEqual([]);
    });

    it("rejects a prd ops stack outside us-east-1", () => {
      expect(issuesOf({ ...prdOps, region: "usw2", stackName: "prd-iam-usw2" })).toEqual([
        "region: Production ops accounts must be deployed in us-east-1",
      ]);
    });
  });

  describe("project names and stack references", () => {
    const referenceOf = (org: string, identity: Parameters<typeof projectNameOf>[0]) =>
      `${org}/${projectNameOf(identity)}/${stackNameOf(identity)}`;

    it("projectNameOf and stackNameOf build org/project/stack", () => {
      expect(
        referenceOf("adaptiveworx", {
          tenant: "worx",
          provider: "cloudflare",
          environment: "sec",
          accountPurpose: "ops",
          stackPurpose: "ztna",
          region: "glb",
        })
      ).toBe("adaptiveworx/worx-cloudflare-ops-sec/sec-ztna-glb");
      expect(
        referenceOf("adaptiveworx", {
          tenant: "worx",
          provider: "aws",
          environment: "sec",
          accountPurpose: "ops",
          stackPurpose: "vpc",
          region: "use1",
          targetEnvironment: "dev",
        })
      ).toBe("adaptiveworx/worx-aws-ops-sec/dev-vpc-use1");
    });
  });
});
