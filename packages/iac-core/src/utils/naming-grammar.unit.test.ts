/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The project/stack naming grammar end to end: every project and stack name
 * iac-worx deploys today (apps/aws/{env}/Pulumi*.yaml, plus stacks on its
 * open branches) and the planned Cloudflare project, through
 * detectStackContext(), StackContextSchema, StackNameSchema and
 * parseStackName; then the negative cases.
 *
 *   project: {tenant}-{provider}-{env}
 *   stack:   [{target-env}-]{account-purpose}-{stack-purpose}[-{concern}]-{region}
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
  buildStackReference,
  detectStackContext,
  generateProjectName,
  generateStackName,
  getStackProvider,
  isValidStackName,
  parseProjectName,
  parseStackName,
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

/** iac-worx's project/stack pairs as deployed (2026-10-03), plus the planned Cloudflare one. */
const IAC_WORX: Expected[] = [
  // apps/aws/dev
  {
    project: "worx-aws-dev",
    stack: "app-iam-github-use1",
    provider: "aws",
    environment: "dev",
    accountPurpose: "app",
    stackPurpose: "iam",
    concern: "github",
    region: "use1",
  },
  {
    project: "worx-aws-dev",
    stack: "app-flow-use1",
    provider: "aws",
    environment: "dev",
    accountPurpose: "app",
    stackPurpose: "flow",
    region: "use1",
  },
  // apps/aws/stg, apps/aws/prd
  {
    project: "worx-aws-stg",
    stack: "app-iam-github-use1",
    provider: "aws",
    environment: "stg",
    accountPurpose: "app",
    stackPurpose: "iam",
    concern: "github",
    region: "use1",
  },
  {
    project: "worx-aws-prd",
    stack: "app-iam-github-use1",
    provider: "aws",
    environment: "prd",
    accountPurpose: "app",
    stackPurpose: "iam",
    concern: "github",
    region: "use1",
  },
  // apps/aws/sec
  {
    project: "worx-aws-sec",
    stack: "ops-iam-github-use1",
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "iam",
    concern: "github",
    region: "use1",
  },
  {
    project: "worx-aws-sec",
    stack: "dev-ops-vpc-use1",
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "vpc",
    targetEnvironment: "dev",
    region: "use1",
  },
  {
    project: "worx-aws-sec",
    stack: "dev-ops-vpc-usw2",
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "vpc",
    targetEnvironment: "dev",
    region: "usw2",
  },
  {
    project: "worx-aws-sec",
    stack: "stg-ops-vpc-use1",
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "vpc",
    targetEnvironment: "stg",
    region: "use1",
  },
  {
    project: "worx-aws-sec",
    stack: "stg-ops-vpc-usw2",
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "vpc",
    targetEnvironment: "stg",
    region: "usw2",
  },
  {
    project: "worx-aws-sec",
    stack: "prd-ops-vpc-use1",
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "vpc",
    targetEnvironment: "prd",
    region: "use1",
  },
  {
    project: "worx-aws-sec",
    stack: "dev-ops-vpn-use1",
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "vpn",
    targetEnvironment: "dev",
    region: "use1",
  },
  {
    project: "worx-aws-sec",
    stack: "ops-ztna-cloudflare-use1",
    provider: "aws",
    environment: "sec",
    accountPurpose: "ops",
    stackPurpose: "ztna",
    concern: "cloudflare",
    region: "use1",
  },
  // planned: the Cloudflare project
  {
    project: "worx-cloudflare-sec",
    stack: "ops-ztna-glb",
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
    it.each(IAC_WORX)("$project/$stack detects as before", e => {
      vi.mocked(pulumi.getProject).mockReturnValue(e.project);
      vi.mocked(pulumi.getStack).mockReturnValue(e.stack);

      const context = detectStackContext();

      expect(context).toEqual({
        org: "adaptiveworx",
        tenant: "worx",
        provider: e.provider,
        cloud: e.provider,
        accountPurpose: e.accountPurpose,
        stackPurpose: e.stackPurpose,
        environment: e.environment,
        region: e.region,
        projectName: e.project,
        stackName: e.stack,
        ...(e.concern === undefined ? {} : { concern: e.concern }),
        ...(e.targetEnvironment === undefined ? {} : { targetEnvironment: e.targetEnvironment }),
      });
      expect(getStackProvider(context)).toBe(e.provider);
    });

    it.each(IAC_WORX)(
      "$project/$stack validates with provider, with the deprecated cloud, and with both",
      e => {
        expect(issuesOf(contextInput(e))).toEqual([]);
        const { provider, ...rest } = contextInput(e);
        expect(issuesOf({ ...rest, cloud: provider })).toEqual([]);
        expect(issuesOf(contextInput(e, { cloud: e.provider }))).toEqual([]);
      }
    );

    it.each(IAC_WORX)(
      "$stack is one grammar: StackNameSchema, parseStackName, generateStackName agree",
      e => {
        expect(StackNameSchema.safeParse(e.stack).success).toBe(true);
        expect(isValidStackName(e.stack)).toBe(true);
        expect(ProjectNameSchema.safeParse(e.project).success).toBe(true);
        expect(StackPurposeSchema.safeParse(e.stackPurpose).success).toBe(true);
        const parsed = parseStackName(`adaptiveworx/${e.project}/${e.stack}`);
        expect(parsed.provider).toBe(e.provider);
        expect(parsed.cloud).toBe(e.provider);
        expect(
          generateStackName(
            parsed.accountPurpose,
            parsed.stackPurpose,
            parsed.region,
            parsed.concern,
            parsed.targetEnvironment
          )
        ).toBe(e.stack);
      }
    );
  });

  describe("stack name segments (one 3-5 rule)", () => {
    it.each([
      ["app-web-use1", 3],
      ["ops-ztna-glb", 3],
      ["ops-iam-github-use1", 4],
      ["dev-ops-vpc-use1", 4],
      ["dev-ops-vpc-shared-use1", 5],
    ])("%s (%i segments) passes StackNameSchema and parseStackName", stack => {
      expect(StackNameSchema.safeParse(stack).success).toBe(true);
      expect(isValidStackName(stack)).toBe(true);
    });

    it.each(["ops-ztna", "a-b-c-d-e-f", "dev-ops-vpc-shared-use1-extra"])(
      "%s (wrong segment count) fails both",
      stack => {
        expect(StackNameSchema.safeParse(stack).success).toBe(false);
        expect(isValidStackName(stack)).toBe(false);
      }
    );

    it.each(["Ops-ztna-glb", "ops_ztna-glb", "ops--glb", "ops-ztna-glb-", "-ops-ztna-glb"])(
      "%s (not kebab-case) fails StackNameSchema",
      stack => {
        expect(StackNameSchema.safeParse(stack).success).toBe(false);
      }
    );

    it("validates a 5-part stack context (it used to fail StackNameSchema)", () => {
      expect(
        issuesOf({
          org: "adaptiveworx",
          tenant: "worx",
          provider: "aws",
          accountPurpose: "ops",
          stackPurpose: "vpc",
          environment: "sec",
          region: "use1",
          projectName: "worx-aws-sec",
          stackName: "dev-ops-vpc-shared-use1",
          concern: "shared",
          targetEnvironment: "dev",
        })
      ).toEqual([]);
    });
  });

  describe("stack purposes are one segment", () => {
    it("rejects hyphenated purposes, which the parser could never read back", () => {
      expect(StackPurposeSchema.safeParse("ml-training").success).toBe(false);
      expect(StackPurposeSchema.safeParse("mltraining").success).toBe(true);
      // what a hyphenated purpose actually parses as: purpose + concern
      expect(parseStackName("app-ml-training-use1")).toMatchObject({
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
    };

    it("accepts github and infisical projects with glb", () => {
      expect(
        issuesOf({
          ...base,
          provider: "github",
          region: "glb",
          projectName: "worx-github-sec",
          stackName: "ops-ztna-glb",
        })
      ).toEqual([]);
      expect(
        issuesOf({
          ...base,
          provider: "infisical",
          region: "glb",
          projectName: "worx-infisical-sec",
          stackName: "ops-ztna-glb",
        })
      ).toEqual([]);
    });

    it("rejects glb on AWS", () => {
      const issues = issuesOf({
        ...base,
        provider: "aws",
        region: "glb",
        projectName: "worx-aws-sec",
        stackName: "ops-ztna-glb",
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
        projectName: "worx-cloudflare-sec",
        stackName: "ops-ztna-use1",
      });
      expect(issues).toEqual([
        "region: Provider 'cloudflare' has no regions: its stacks use region 'glb'",
      ]);
    });

    it("rejects an unknown provider in the project and the context", () => {
      expect(ProjectNameSchema.safeParse("worx-k8s-sec").success).toBe(false);
      expect(
        issuesOf({
          ...base,
          provider: "k8s",
          region: "glb",
          projectName: "worx-k8s-sec",
          stackName: "ops-ztna-glb",
        }).length
      ).toBeGreaterThan(0);

      vi.mocked(pulumi.getProject).mockReturnValue("worx-k8s-sec");
      vi.mocked(pulumi.getStack).mockReturnValue("ops-ztna-glb");
      expect(() => detectStackContext()).toThrow("Stack context detection failed");
    });

    it("rejects a project whose provider differs from the context's", () => {
      expect(
        issuesOf({
          ...base,
          provider: "cloudflare",
          region: "glb",
          projectName: "worx-aws-sec",
          stackName: "ops-ztna-glb",
        })
      ).toEqual([
        "projectName: Project name 'worx-aws-sec' does not match expected pattern 'worx-cloudflare-sec'",
      ]);
    });

    it("requires a provider, and provider and cloud to agree", () => {
      expect(
        issuesOf({
          ...base,
          region: "glb",
          projectName: "worx-cloudflare-sec",
          stackName: "ops-ztna-glb",
        })
      ).toEqual(["provider: provider is required (or the deprecated cloud)"]);
      expect(
        issuesOf({
          ...base,
          provider: "cloudflare",
          cloud: "aws",
          region: "glb",
          projectName: "worx-cloudflare-sec",
          stackName: "ops-ztna-glb",
        })
      ).toContain(
        "cloud: provider 'cloudflare' and cloud 'aws' disagree; cloud is a deprecated alias of provider"
      );
    });

    it("rejects a malformed project name", () => {
      for (const project of ["worx-aws", "worx-aws-sec-x", "Worx-aws-sec", "worx_aws_sec"]) {
        expect(ProjectNameSchema.safeParse(project).success).toBe(false);
      }
      expect(() => parseProjectName("worx-cloudflare")).toThrow("{tenant}-{provider}-{env}");
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
      projectName: "worx-aws-prd",
    };

    it("accepts a prd ops stack in use1 (the code for us-east-1)", () => {
      expect(issuesOf({ ...prdOps, region: "use1", stackName: "ops-iam-use1" })).toEqual([]);
      expect(
        issuesOf({ ...prdOps, region: "us-east-1", stackName: "ops-iam-us-east-1" })
      ).not.toContain("region: Production ops accounts must be deployed in us-east-1");
    });

    it("rejects a prd ops stack outside us-east-1", () => {
      expect(issuesOf({ ...prdOps, region: "usw2", stackName: "ops-iam-usw2" })).toEqual([
        "region: Production ops accounts must be deployed in us-east-1",
      ]);
    });
  });

  describe("project names and stack references", () => {
    it("generateProjectName(tenant, provider, env) builds a valid project name", () => {
      expect(generateProjectName("worx", "cloudflare", "sec")).toBe("worx-cloudflare-sec");
      expect(ProjectNameSchema.safeParse(generateProjectName("worx", "aws", "dev")).success).toBe(
        true
      );
    });

    it("keeps the deprecated two-argument form's output", () => {
      expect(generateProjectName("aws", "dev")).toBe("aws-dev");
    });

    it("buildStackReference() builds org/project/stack", () => {
      expect(
        buildStackReference({
          org: "adaptiveworx",
          tenant: "worx",
          provider: "cloudflare",
          environment: "sec",
          accountPurpose: "ops",
          stackPurpose: "ztna",
          region: "glb",
        })
      ).toBe("adaptiveworx/worx-cloudflare-sec/ops-ztna-glb");
      expect(
        buildStackReference({
          org: "adaptiveworx",
          tenant: "worx",
          provider: "aws",
          environment: "sec",
          accountPurpose: "ops",
          stackPurpose: "vpc",
          region: "use1",
          targetEnvironment: "dev",
        })
      ).toBe("adaptiveworx/worx-aws-sec/dev-ops-vpc-use1");
    });
  });
});
