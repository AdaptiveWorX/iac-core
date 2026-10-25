/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The account grammar and the legacy grammar side by side
 * (Pl.Architecture.Meta.NamingConventionsAcrossPlatforms 9):
 *
 *   project: {tenant}-{provider}-{account-purpose}-{env}   (legacy {tenant}-{provider}-{env})
 *   stack:   {target-env}-{stack-purpose}[-{concern}]-{region}
 *            (legacy [{target-env}-]{account-purpose}-{stack-purpose}[-{concern}]-{region})
 *
 * The fixture is iac-worx's 16 stacks in its 5 projects as they are named today, each with
 * the name it takes. It is a fixture, not a declaration: the one declared map lives with the
 * consumer (iac-worx), which validates it with validateNameAliases.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@pulumi/pulumi", () => ({
  getProject: vi.fn(),
  getStack: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import * as pulumi from "@pulumi/pulumi";
import { ProjectNameSchema } from "../schemas/core/core-schemas.js";
import {
  canonicalStackName,
  detectStackContext,
  isAccountGrammarProject,
  type NameAliasMap,
  parseStackIdentity,
  projectNameOf,
  stackNameOf,
  validateNameAliases,
} from "./stack-utils.js";

const WORX_RENAMES: NameAliasMap = {
  "worx-aws-dev/app-flow-use1": "worx-aws-app-dev/dev-flow-use1",
  "worx-aws-dev/app-iam-github-use1": "worx-aws-app-dev/dev-iam-github-use1",
  "worx-aws-dev/app-iam-pulumi-use1": "worx-aws-app-dev/dev-iam-pulumi-use1",
  "worx-aws-stg/app-iam-github-use1": "worx-aws-app-stg/stg-iam-github-use1",
  "worx-aws-stg/app-iam-pulumi-use1": "worx-aws-app-stg/stg-iam-pulumi-use1",
  "worx-aws-prd/app-iam-github-use1": "worx-aws-app-prd/prd-iam-github-use1",
  "worx-aws-prd/app-iam-pulumi-use1": "worx-aws-app-prd/prd-iam-pulumi-use1",
  "worx-aws-sec/dev-ops-vpc-use1": "worx-aws-ops-sec/dev-vpc-use1",
  "worx-aws-sec/dev-ops-vpc-usw2": "worx-aws-ops-sec/dev-vpc-usw2",
  "worx-aws-sec/dev-ops-vpn-use1": "worx-aws-ops-sec/dev-vpn-use1",
  "worx-aws-sec/stg-ops-vpc-use1": "worx-aws-ops-sec/stg-vpc-use1",
  "worx-aws-sec/stg-ops-vpc-usw2": "worx-aws-ops-sec/stg-vpc-usw2",
  "worx-aws-sec/prd-ops-vpc-use1": "worx-aws-ops-sec/prd-vpc-use1",
  "worx-aws-sec/ops-iam-github-use1": "worx-aws-ops-sec/sec-iam-github-use1",
  "worx-aws-sec/ops-iam-pulumi-use1": "worx-aws-ops-sec/sec-iam-pulumi-use1",
  "worx-cloudflare-sec/ops-ztna-glb": "worx-cloudflare-ops-sec/sec-ztna-glb",
};

function contextFor(project: string, stack: string, nameAliases?: NameAliasMap) {
  vi.mocked(pulumi.getProject).mockReturnValue(project);
  vi.mocked(pulumi.getStack).mockReturnValue(stack);
  return detectStackContext(nameAliases === undefined ? {} : { nameAliases });
}

function withoutNames<T extends { projectName: string; stackName: string }>(context: T) {
  const { projectName: _p, stackName: _s, ...rest } = context;
  return rest;
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

  it("refuses a stack that is neither 3 nor 4 segments", () => {
    expect(() => parseStackIdentity("worx-aws-ops-sec", "sec-iam-github-x-use1")).toThrow(
      /Invalid stack name format/
    );
    expect(() => parseStackIdentity("worx-aws-ops-sec", "sec-use1")).toThrow(
      /Invalid stack name format/
    );
  });

  it("refuses a centralized stack outside the ops-sec project", () => {
    expect(() => contextFor("worx-aws-app-dev", "stg-flow-use1")).toThrow(
      /Stack context detection failed/
    );
  });
});

describe("every iac-worx rename", () => {
  beforeEach(() => {
    process.env.PULUMI_ORG = "adaptiveworx";
  });
  afterEach(() => {
    delete process.env.PULUMI_ORG;
  });

  it("covers 16 stacks in 5 projects", () => {
    const projects = new Set(Object.keys(WORX_RENAMES).map(name => name.split("/")[0]));
    expect(Object.keys(WORX_RENAMES)).toHaveLength(16);
    expect(projects.size).toBe(5);
  });

  it("passes validateNameAliases", () => {
    expect(() => validateNameAliases(WORX_RENAMES)).not.toThrow();
  });

  for (const [from, to] of Object.entries(WORX_RENAMES)) {
    it(`${from} and ${to} give the same context`, () => {
      const [oldProject, oldStack] = from.split("/") as [string, string];
      const [newProject, newStack] = to.split("/") as [string, string];
      const legacy = contextFor(oldProject, oldStack);
      const account = contextFor(newProject, newStack);
      expect(withoutNames(account)).toEqual(withoutNames(legacy));
      expect(account.projectName).toBe(newProject);
      expect(account.stackName).toBe(newStack);
      expect(canonicalStackName(from, WORX_RENAMES)).toBe(to);
      expect(canonicalStackName(to, WORX_RENAMES)).toBe(to);
    });
  }
});

describe("the alias map", () => {
  beforeEach(() => {
    process.env.PULUMI_ORG = "adaptiveworx";
  });
  afterEach(() => {
    delete process.env.PULUMI_ORG;
  });

  it("refuses a target that changes what the name means", () => {
    expect(() =>
      validateNameAliases({ "worx-aws-dev/app-flow-use1": "worx-aws-app-dev/dev-web-use1" })
    ).toThrow(/changes what the name means/);
  });

  it("refuses a key already in the account grammar, and a legacy target", () => {
    expect(() =>
      validateNameAliases({ "worx-aws-app-dev/dev-flow-use1": "worx-aws-app-dev/dev-flow-use1" })
    ).toThrow(/already an account-grammar name/);
    expect(() =>
      validateNameAliases({ "worx-aws-dev/app-flow-use1": "worx-aws-dev/app-flow-use1" })
    ).toThrow(/not an account-grammar name/);
  });

  it("refuses two legacy names for one target", () => {
    expect(() =>
      validateNameAliases({
        "worx-aws-dev/app-flow-use1": "worx-aws-app-dev/dev-flow-use1",
        "worx-aws-dev/app-flow-use1x": "worx-aws-app-dev/dev-flow-use1",
      })
    ).toThrow();
  });

  it("with a map given, refuses a legacy name the map doesn't declare", () => {
    expect(() => contextFor("worx-aws-dev", "app-web-use1", WORX_RENAMES)).toThrow(
      /not in the name alias map/
    );
    expect(() => canonicalStackName("worx-aws-dev/app-web-use1", WORX_RENAMES)).toThrow(
      /not in the name alias map/
    );
  });

  it("with a map given, still reads a declared legacy name and any account-grammar name", () => {
    expect(contextFor("worx-aws-sec", "ops-iam-github-use1", WORX_RENAMES)).toMatchObject({
      stackPurpose: "iam",
      concern: "github",
    });
    expect(contextFor("worx-aws-app-dev", "dev-web-use1", WORX_RENAMES)).toMatchObject({
      stackPurpose: "web",
    });
  });

  it("refuses a name in neither grammar", () => {
    expect(() => contextFor("worx-aws", "flow")).toThrow(/Stack context detection failed/);
    expect(() => parseStackIdentity("worx-aws-ops-sec", "use1")).toThrow();
  });
});
