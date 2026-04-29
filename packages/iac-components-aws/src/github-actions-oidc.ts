/**
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GitHub Actions OIDC bridge for multi-account deployments
 * Recreates the Terraform implementation that provisions:
 *   - An OIDC provider in each AWS account (secops/dev/stg/prd)
 *   - A deployment role per account with environment-specific trust policies
 *   - Managed policy attachments (Administrator in secops, PowerUser elsewhere)
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

interface GithubOidcEnvironmentConfig {
  readonly name: "secops" | "prod" | "staging" | "dev";
  readonly accountId: string;
  readonly roleName: string;
  readonly policyArn: string;
  readonly tags?: Record<string, string>;
  readonly assumeRoleName?: string; // defaults to kebab-case pulumi cross-account role inferred from roleName
}

export interface GithubActionsOidcArgs {
  readonly awsRegion: aws.Region;
  readonly githubOrg: string;
  readonly environments: readonly GithubOidcEnvironmentConfig[];
  readonly thumbprintList?: readonly string[];
  readonly managementTags?: Record<string, string>;
}

export interface GithubActionsOidcOutputs {
  readonly roleArns: pulumi.Output<Record<string, string>>;
}

interface EnvironmentArtifacts {
  provider: aws.Provider;
  oidcProvider: aws.iam.OpenIdConnectProvider;
  role: aws.iam.Role;
  policyAttachment: aws.iam.RolePolicyAttachment;
}

const DEFAULT_THUMBPRINTS = [
  "6938fd4d98bab03faadb97b34396831e3780aea1",
  "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
] as const;

const ROLE_SUFFIX = "-github-actions-deploy";
const ASSUME_ROLE_SUFFIX = "-pulumi-cross-account";

function deriveAssumeRoleName(roleName: string): string {
  if (!roleName.endsWith(ROLE_SUFFIX)) {
    throw new Error(
      `Unable to derive assume role name from '${roleName}'. Expected suffix '${ROLE_SUFFIX}'. ` +
        "Provide 'assumeRoleName' when using a custom naming pattern."
    );
  }

  return `${roleName.slice(0, -ROLE_SUFFIX.length)}${ASSUME_ROLE_SUFFIX}`;
}

/**
 * Derive the GitHub subject patterns per environment.
 * Matches existing Terraform conditions.
 */
function getSubjectPatterns(
  environment: GithubOidcEnvironmentConfig["name"],
  githubOrg: string
): string[] {
  if (environment === "secops") {
    return [`repo:${githubOrg}/iac-worx:*`, `repo:${githubOrg}/iac-modules:*`];
  }

  const base = `repo:${githubOrg}/iac-worx`;
  return [
    `${base}:ref:refs/heads/main`,
    `${base}:ref:refs/tags/v*`,
    `${base}:pull_request`,
    `repo:${githubOrg}/iac-modules:*`,
  ];
}

function buildProvider(
  name: string,
  args: GithubOidcEnvironmentConfig,
  region: aws.Region
): aws.Provider {
  const assumeRoleName = args.assumeRoleName ?? deriveAssumeRoleName(args.roleName);

  return new aws.Provider(name, {
    region,
    assumeRoles: [
      {
        roleArn: `arn:aws:iam::${args.accountId}:role/${assumeRoleName}`,
        sessionName: `pulumi-github-oidc-${args.name}`,
      },
    ],
    defaultTags: {
      tags: {
        ManagedBy: "pulumi",
        Service: "github-actions",
        Environment: args.name,
      },
    },
  });
}

function buildTrustPolicy(
  args: GithubOidcEnvironmentConfig,
  githubOrg: string,
  oidcProviderArn: pulumi.Output<string>
): pulumi.Output<string> {
  const subjects = getSubjectPatterns(args.name, githubOrg);

  return aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["sts:AssumeRoleWithWebIdentity"],
        effect: "Allow",
        principals: [
          {
            type: "Federated",
            identifiers: [oidcProviderArn],
          },
        ],
        conditions: [
          {
            test: "StringEquals",
            values: ["sts.amazonaws.com"],
            variable: "token.actions.githubusercontent.com:aud",
          },
          {
            test: "StringLike",
            values: subjects,
            variable: "token.actions.githubusercontent.com:sub",
          },
        ],
      },
    ],
  }).json;
}

function buildEnvironment(
  parent: pulumi.ComponentResource,
  baseName: string,
  cfg: GithubOidcEnvironmentConfig,
  region: aws.Region,
  githubOrg: string,
  thumbprints: readonly string[],
  managementTags: Record<string, string>
): EnvironmentArtifacts {
  const provider = buildProvider(`${baseName}-${cfg.name}`, cfg, region);

  const oidcProvider = new aws.iam.OpenIdConnectProvider(
    `${baseName}-${cfg.name}`,
    {
      url: "https://token.actions.githubusercontent.com",
      clientIdLists: ["sts.amazonaws.com"],
      thumbprintLists: [...thumbprints],
      tags: {
        Name: "github-actions-oidc",
        Environment: cfg.name,
        ManagedBy: "pulumi",
        ...managementTags,
        ...cfg.tags,
      },
    },
    { provider, parent }
  );

  const assumeRolePolicy = buildTrustPolicy(cfg, githubOrg, oidcProvider.arn);

  const role = new aws.iam.Role(
    `${baseName}-${cfg.name}`,
    {
      name: cfg.roleName,
      description: `GitHub Actions deployment role for ${cfg.name}`,
      assumeRolePolicy,
      tags: {
        Name: cfg.roleName,
        Environment: cfg.name,
        Service: "github-actions",
        ManagedBy: "pulumi",
        ...managementTags,
        ...cfg.tags,
      },
    },
    { provider, parent }
  );

  const policyAttachment = new aws.iam.RolePolicyAttachment(
    `${baseName}-${cfg.name}-attachment`,
    {
      role: role.name,
      policyArn: cfg.policyArn,
    },
    { provider, parent }
  );

  return {
    provider,
    oidcProvider,
    role,
    policyAttachment,
  };
}

export class GithubActionsOidc extends pulumi.ComponentResource {
  public readonly roleArns: pulumi.Output<Record<string, string>>;

  constructor(name: string, args: GithubActionsOidcArgs, opts?: pulumi.ComponentResourceOptions) {
    super("iac:components:GithubActionsOidc", name, args, opts);

    const thumbprints = args.thumbprintList ?? DEFAULT_THUMBPRINTS;
    const managementTags = args.managementTags ?? {};

    const artifacts: Record<string, EnvironmentArtifacts> = {};

    for (const envCfg of args.environments) {
      const envArtifacts = buildEnvironment(
        this,
        `${name}-${envCfg.name}`,
        envCfg,
        args.awsRegion,
        args.githubOrg,
        thumbprints,
        managementTags
      );

      artifacts[envCfg.name] = envArtifacts;
    }

    this.roleArns = pulumi
      .all(
        Object.entries(artifacts).map(([env, art]) =>
          pulumi.output(art.role.arn).apply(arn => ({ env, arn }))
        )
      )
      .apply(entries => {
        const result: Record<string, string> = {};
        for (const entry of entries) {
          result[entry.env] = entry.arn;
        }
        return result;
      });

    this.registerOutputs({
      roleArns: this.roleArns,
    });
  }
}
