# @adaptiveworx/iac-aws

Reusable Pulumi infrastructure components for AWS, written in TypeScript.

Part of [AdaptiveWorX `iac-core`](https://github.com/AdaptiveWorX/iac-core) — a
suite of open-source IaC libraries for multi-cloud Pulumi deployments.

## Install

```sh
pnpm add @adaptiveworx/iac-aws @pulumi/aws @pulumi/pulumi
```

`@pulumi/aws` and `@pulumi/pulumi` are peer dependencies — bring your own
versions.

## Components

| Component | Purpose |
|---|---|
| `SharedVpc` | Multi-tier VPC with NAT, flow logs, RAM sharing, configurable per-tier CIDR, optional IPv6 dual-stack on every subnet |
| `CrossAccountIAMRoles` | Cross-account Pulumi role + foundation access role for product-line architectures |
| `GitHubActionsOIDC` | OIDC provider + deploy role for GitHub Actions CI/CD |
| IAM policy helpers | Composable policy document builders |

## Usage

```ts
import { SharedVpc, CrossAccountIAMRoles, GitHubActionsOIDC } from "@adaptiveworx/iac-aws";

const vpc = new SharedVpc("dev-use1", {
  environment: "dev",
  region: "us-east-1",
  accountId: "123456789012",
  orgPrefix: "worx",
  vpcCidr: "10.10.0.0/16",
  availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"],
  natGatewayCount: 3,
  enableIpv6: true, // dual-stack: a /64 on every subnet
  subnetTiers: [
    // With enableIpv6 every tier declares a unique, permanent ipv6Slot (0–15)
    { name: "public", routeToInternet: true, shareViaRam: false, ipv6Slot: 0 },
    { name: "private", routeToInternet: false, shareViaRam: true, ipv6Slot: 1 },
    { name: "data", routeToInternet: false, shareViaRam: true, ipv6Slot: 2 },
  ],
  flowLogs: { enabled: true, trafficType: "ALL", retentionDays: 90 },
  sharedAccounts: { "210987654321": "worx-app-dev" },
  tags: {},
});
```

### SharedVpc and IPv6

`enableIpv6: true` makes the VPC dual-stack throughout: an Amazon-provided /56 on the VPC; on
every subnet a /64 (`netnum = ipv6Slot * 16 + AZ-letter index`, so adding an AZ or a tier never
renumbers an existing subnet) with IPv6 assigned to new network interfaces; IPv6 rules on every
tier NACL (numbered IPv4 counterpart + 1000, plus UDP return and ICMPv6 Packet Too Big); `::/0`
to the internet gateway on public tiers and to an egress-only gateway on private tiers, with or
without NAT; dual-stack VPC endpoints where the service supports IPv6.

- `allowIpv6PublicIngress` (default `false`): no internet-initiated IPv6 inbound; the tiers keep
  their required egress and its return traffic. Set it to `true` only for a production-facing edge
  that must accept internet-initiated IPv6; it adds IPv6 443/80 inbound to the public NACL. The
  public `::/0` route is always present (it is IPv6 egress), so security groups remain the control
  on inbound IPv6.
- IPv6 egress cannot reach IPv4-only destinations (e.g. `github.com`, `ghcr.io`), and there is no
  DNS64/NAT64. `natGatewayCount: 0` with private tiers is valid only when their workloads use VPC
  endpoints or IPv6-capable destinations exclusively.

Details: [docs/security-implementation.md](https://github.com/AdaptiveWorX/iac-core/blob/main/docs/security-implementation.md).

See each component's source for its full options interface.

## Versioning & releases

This package ships independent semver. See the
[root CHANGELOG conventions](https://github.com/AdaptiveWorX/iac-core/blob/main/CONTRIBUTING.md#releases)
and this package's [CHANGELOG.md](./CHANGELOG.md).

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
