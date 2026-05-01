# AdaptiveWorX `iac-core`

Open-source Pulumi infrastructure libraries for multi-cloud
infrastructure-as-code, written in TypeScript.

This is a publish-focused **Nx monorepo** that produces the
`@adaptiveworx/iac-*` family of npm packages. Every directory under
`packages/` is a separately-versioned npm artifact, released
independently via [Nx Release](https://nx.dev/features/manage-releases)
from conventional commits.

## Packages

| Package | Purpose |
|---|---|
| [`@adaptiveworx/iac-core`](./packages/iac-core) | Cross-cloud primitives: organization config, secret management, region utils, CIDR allocation, validation, schemas |
| [`@adaptiveworx/iac-schemas`](./packages/iac-schemas) | Zod-derived JSON schemas for configuration contracts |
| [`@adaptiveworx/iac-policies`](./packages/iac-policies) | Pulumi policy packs for security, compliance, cost |
| [`@adaptiveworx/iac-aws`](./packages/iac-aws) | AWS Pulumi components: VPC, IAM, OIDC |
| [`@adaptiveworx/iac-azure`](./packages/iac-azure) | Azure Pulumi components (Fabric, OneLake, secure storage, networking) |

> **Status (2026-04):** `iac-aws` is restructured and tests
> passing. `iac-core`, `iac-schemas`, `iac-policies` migration from
> `iac-worx` is in progress. `iac-azure` is an empty skeleton.
> See [docs/migration-plan.md](./docs/migration-plan.md) for
> sequencing.

## Install (consumers)

```bash
# AWS-only
pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-aws \
  @pulumi/aws @pulumi/pulumi

# Azure-only
pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-schemas \
  @pulumi/azure-native @pulumi/pulumi
```

`@pulumi/*` SDKs are peer dependencies — bring your own version. Node 24+
required.

## Quickstart (AWS)

```ts
import { SharedVpc, GitHubActionsOIDC } from "@adaptiveworx/iac-aws";

const vpc = new SharedVpc("dev-use1", {
  productLine: "worx",
  environment: "dev",
  region: "us-east-1",
  cidrBlock: "10.10.0.0/16",
  tiers: [
    { name: "public",  routeToInternet: true,  shareViaRam: false },
    { name: "private", routeToInternet: false, shareViaRam: true  },
    { name: "data",    routeToInternet: false, shareViaRam: true  },
  ],
});

const oidc = new GitHubActionsOIDC("github-actions", {
  awsRegion: "us-east-1",
  githubOrg: "AdaptiveWorX",
  environments: [
    {
      name: "prod",
      accountId: "436083577402",
      roleName: "worx-prod-github-actions-deploy",
      policyArn: "arn:aws:iam::aws:policy/PowerUserAccess",
    },
  ],
});
```

See each package's README for full options.

## Development (contributors)

```bash
# One-time
pnpm install

# Common tasks
pnpm build              # Build every package
pnpm test               # Run vitest across every package
pnpm lint               # Biome check across every package
pnpm typecheck          # tsc --noEmit across every package
pnpm graph              # Open Nx project graph in browser

# Affected (uses Nx graph; only what changed)
pnpm build:affected
pnpm test:affected
pnpm lint:affected

# Single package
pnpm nx build @adaptiveworx/iac-aws
pnpm nx test @adaptiveworx/iac-aws

# Format
pnpm format             # Write
pnpm format:check       # Check only
```

### Tooling

- **pnpm@10** workspace
- **Nx 22** for build orchestration, caching, affected graph, releases
- **TypeScript 5.9+** with `@tsconfig/strictest`
- **Vitest 3** for unit + integration tests
- **Biome 2** for lint + format

## Architecture & docs

- [docs/architecture.md](./docs/architecture.md) — producer/consumer
  model, package boundaries, dependency graph, release model, tooling
- [docs/migration-plan.md](./docs/migration-plan.md) — transient plan
  for the `iac-worx` → `iac-core` package migration (delete on completion)
- [docs/compliance-framework.md](./docs/compliance-framework.md)
- [docs/security-implementation.md](./docs/security-implementation.md)
- [docs/testing-strategy.md](./docs/testing-strategy.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute, conventional
  commits, release process

## Versioning

Each package ships **independent semver**. Nx Release reads conventional
commits to bump versions, generate changelogs, tag, and publish. See
[CONTRIBUTING.md#releases](./CONTRIBUTING.md#releases) for the
end-to-end flow.

## License

Apache 2.0 © 2023-2026 Adaptive Intelligence, LLC. See [LICENSE](./LICENSE).

Each package also ships its own `LICENSE` and `NOTICE` files for
distribution clarity.
