# @adaptiveworx/iac-components-aws

Reusable Pulumi infrastructure components for AWS, written in TypeScript.

Part of [AdaptiveWorX Flux](https://github.com/AdaptiveWorX/flux-core) — a
suite of open-source IaC libraries for multi-cloud Pulumi deployments.

## Install

```sh
pnpm add @adaptiveworx/iac-components-aws @pulumi/aws @pulumi/pulumi
```

`@pulumi/aws` and `@pulumi/pulumi` are peer dependencies — bring your own
versions.

## Components

| Component | Purpose |
|---|---|
| `SharedVpc` | Multi-tier VPC with NAT, flow logs, RAM sharing, configurable per-tier CIDR |
| `CrossAccountIAMRoles` | Cross-account Pulumi role + foundation access role for product-line architectures |
| `GitHubActionsOIDC` | OIDC provider + deploy role for GitHub Actions CI/CD |
| IAM policy helpers | Composable policy document builders |

## Usage

```ts
import { SharedVpc, CrossAccountIAMRoles, GitHubActionsOIDC } from "@adaptiveworx/iac-components-aws";

const vpc = new SharedVpc("dev-use1", {
  productLine: "worx",
  environment: "dev",
  region: "us-east-1",
  cidrBlock: "10.10.0.0/16",
  tiers: [/* ... */],
});
```

See each component's source for its full options interface.

## Versioning & releases

This package ships independent semver. See the
[root CHANGELOG conventions](https://github.com/AdaptiveWorX/flux-core/blob/main/CONTRIBUTING.md#releases)
and this package's [CHANGELOG.md](./CHANGELOG.md).

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
