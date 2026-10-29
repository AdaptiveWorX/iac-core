/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The account grammar, and only it (Pl.Architecture.Meta.NamingConventionsAcrossPlatforms,
 * the-legacy-grammar-is-removed-at-the-close):
 *
 *   project: {tenant}-{provider}-{account-purpose}-{env}
 *   stack:   {target-env}-{stack-purpose}[-{concern}]-{region}
 *
 * The policy's examples parse and round-trip; a legacy name is refused: a three-segment
 * {tenant}-{provider}-{env} project, and a [{target-env}-]{account-purpose}-{stack-purpose}...
 * stack under its account-grammar project.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@pulumi/pulumi", () => ({
  getProject: vi.fn(),
  getStack: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import * as pulumi from "@pulumi/pulumi";
import { ProjectNameSchema, StackNameSchema } from "../schemas/core/core-schemas.js";
import {
  detectStackContext,
  isAccountGrammarProject,
  parseStackIdentity,
  projectNameOf,
  stackNameOf,
} from "./stack-utils.js";

const PROJECT_GRAMMAR = "{tenant}-{provider}-{account-purpose}-{env}";
const STACK_GRAMMAR = "{target-env}-{stack-purpose}[-{concern}]-{region}";

function contextFor(project: string, stack: string) {
  vi.mocked(pulumi.getProject).mockReturnValue(project);
  vi.mocked(pulumi.getStack).mockReturnValue(stack);
  return detectStackContext();
}

describe("the account grammar", () => {
  beforeEach(() => {
    process.env.PULUMI_ORG = "adaptiveworx";
  });
  afterEach(() => {
    delete process.env.PULUMI_ORG;
  });

  it("reads a project as one account", () => {
    expect(isAccountGrammarProject("worx-aws-ops-sec")).toBe(true);
    expect(isAccountGrammarProject("worx-aws-sec")).toBe(false);
    expect(ProjectNameSchema.safeParse("worx-cloudflare-ops-sec").success).toBe(true);
  });

  it("reads a stack by position, the target environment first", () => {
    expect(parseStackIdentity("worx-aws-ops-sec", "sec-iam-github-use1")).toEqual({
      tenant: "worx",
      provider: "aws",
      accountPurpose: "ops",
      environment: "sec",
      stackPurpose: "iam",
      region: "use1",
      concern: "github",
    });
  });

  it("keeps the target environment only for a centralized stack", () => {
    expect(parseStackIdentity("worx-aws-ops-sec", "dev-vpc-use1")).toMatchObject({
      targetEnvironment: "dev",
      stackPurpose: "vpc",
    });
    expect(parseStackIdentity("worx-aws-app-dev", "dev-flow-use1")).not.toHaveProperty(
      "targetEnvironment"
    );
  });

  it("reads glb as the region of a global platform", () => {
    const context = contextFor("worx-cloudflare-ops-sec", "sec-ztna-glb");
    expect(context).toMatchObject({ provider: "cloudflare", region: "glb", stackPurpose: "ztna" });
  });

  it("builds both names back from the identity", () => {
    const identity = parseStackIdentity("worx-aws-ops-sec", "dev-vpn-use1");
    expect(projectNameOf(identity)).toBe("worx-aws-ops-sec");
    expect(stackNameOf(identity)).toBe("dev-vpn-use1");
  });

  it("refuses a stack that is neither 3 nor 4 segments, naming the grammar", () => {
    expect(() => parseStackIdentity("worx-aws-ops-sec", "sec-iam-github-x-use1")).toThrow(
      `Invalid stack name format: sec-iam-github-x-use1. Expected: ${STACK_GRAMMAR}`
    );
    expect(() => parseStackIdentity("worx-aws-ops-sec", "sec-use1")).toThrow(
      `Invalid stack name format: sec-use1. Expected: ${STACK_GRAMMAR}`
    );
  });

  it("refuses an empty segment", () => {
    expect(() => parseStackIdentity("worx-aws-ops-sec", "sec--use1")).toThrow(
      `Incomplete stack name components: sec--use1. Expected: ${STACK_GRAMMAR}`
    );
    expect(() => parseStackIdentity("worx--ops-sec", "sec-iam-use1")).toThrow(
      `Incomplete project name components: worx--ops-sec. Expected: ${PROJECT_GRAMMAR}`
    );
  });

  it("refuses a centralized stack outside the ops-sec project", () => {
    expect(() => contextFor("worx-aws-app-dev", "stg-flow-use1")).toThrow(
      /Stack context detection failed/
    );
  });

  it("detectStackContext takes no options: there is no alias map", () => {
    expect(detectStackContext.length).toBe(0);
  });
});

describe("the policy's examples", () => {
  beforeEach(() => {
    process.env.PULUMI_ORG = "adaptiveworx";
  });
  afterEach(() => {
    delete process.env.PULUMI_ORG;
  });

  // pulumi-project-is-one-account and pulumi-stack-shape, each stack under its project
  it.each([
    ["worx-aws-ops-sec", "dev-vpc-use1"],
    ["worx-aws-ops-sec", "dev-vpn-use1"],
    ["worx-aws-ops-sec", "sec-iam-pulumi-use1"],
    ["worx-aws-ops-sec", "sec-iam-github-use1"],
    ["worx-aws-app-dev", "dev-flow-use1"],
    ["worx-cloudflare-ops-sec", "sec-ztna-glb"],
  ])("%s/%s parses, detects and round-trips", (project, stack) => {
    expect(ProjectNameSchema.safeParse(project).success).toBe(true);
    expect(StackNameSchema.safeParse(stack).success).toBe(true);
    const identity = parseStackIdentity(project, stack);
    expect(projectNameOf(identity)).toBe(project);
    expect(stackNameOf(identity)).toBe(stack);
    expect(contextFor(project, stack)).toMatchObject({ projectName: project, stackName: stack });
  });
});

describe("the legacy grammar is refused", () => {
  beforeEach(() => {
    process.env.PULUMI_ORG = "adaptiveworx";
  });
  afterEach(() => {
    delete process.env.PULUMI_ORG;
  });

  it.each([
    ["worx-aws-sec", "ops-iam-github-use1"],
    ["worx-aws-sec", "dev-ops-vpc-use1"],
    ["worx-aws-dev", "app-flow-use1"],
    ["worx-cloudflare-sec", "ops-ztna-glb"],
  ])("a legacy project: %s/%s", (project, stack) => {
    expect(ProjectNameSchema.safeParse(project).success).toBe(false);
    expect(() => parseStackIdentity(project, stack)).toThrow(
      `Invalid project name format: ${project}. Expected: ${PROJECT_GRAMMAR}`
    );
    expect(() => contextFor(project, stack)).toThrow(
      `Stack context detection failed: Invalid project name format: ${project}. Expected: ${PROJECT_GRAMMAR}`
    );
  });

  it.each([
    ["worx-aws-ops-sec", "ops-iam-github-use1"],
    ["worx-aws-ops-sec", "dev-ops-vpc-use1"],
    ["worx-aws-ops-sec", "dev-ops-vpn-use1"],
    ["worx-aws-app-dev", "app-flow-use1"],
    ["worx-aws-app-dev", "app-iam-github-use1"],
    ["worx-cloudflare-ops-sec", "ops-ztna-glb"],
  ])("a legacy stack under its account-grammar project: %s/%s", (project, stack) => {
    expect(() => contextFor(project, stack)).toThrow(/Stack context detection failed/);
  });

  it("a legacy five-segment stack, which no position reads", () => {
    expect(StackNameSchema.safeParse("dev-ops-vpc-shared-use1").success).toBe(false);
    expect(() => parseStackIdentity("worx-aws-ops-sec", "dev-ops-vpc-shared-use1")).toThrow(
      `Invalid stack name format: dev-ops-vpc-shared-use1. Expected: ${STACK_GRAMMAR}`
    );
  });

  it("a name in no grammar", () => {
    expect(() => contextFor("worx-aws", "flow")).toThrow(/Stack context detection failed/);
    expect(() => parseStackIdentity("worx-aws-ops-sec", "use1")).toThrow();
  });
});
