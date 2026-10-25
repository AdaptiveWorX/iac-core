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
    // With enableIpv6 every tier declares a unique, permanent ipv6Slot (0–15). role names the
    // workloads a tier holds; shareWith names the accounts it is shared with.
    { name: "public", role: "load-balancers", routeToInternet: true, shareWith: [], ipv6Slot: 0 },
    { name: "private", role: "apps", routeToInternet: false, shareWith: ["worx-app-dev"], ipv6Slot: 1 },
    { name: "data", role: "databases", routeToInternet: false, shareWith: ["worx-app-dev"], ipv6Slot: 2 },
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

- `allowIpv4PublicIngress` (default `false`, since 0.5.0): no internet-initiated IPv4 inbound on
  the public tier. Set it to `true` only for a production-facing edge; it adds IPv4 443/80 inbound
  (rules 100/110) to the public NACL.
- `allowIpv6PublicIngress` (default `false`): no internet-initiated IPv6 inbound; the tiers keep
  their required egress and its return traffic. Set it to `true` only for a production-facing edge
  that must accept internet-initiated IPv6; it adds IPv6 443/80 inbound to the public NACL. The
  public `::/0` route is always present (it is IPv6 egress), so security groups remain the control
  on inbound IPv6.
- IPv6 egress cannot reach IPv4-only destinations (e.g. `github.com`, `ghcr.io`), and there is no
  DNS64/NAT64. `natGatewayCount: 0` with private tiers is valid only when their workloads use VPC
  endpoints or IPv6-capable destinations exclusively.

Details: [docs/security-implementation.md](https://github.com/AdaptiveWorX/iac-core/blob/main/docs/security-implementation.md).

### Tier roles, sharing and renames

- `role` names the workloads a tier holds. It is tagged `Role` on the tier's subnets and NACL.
  Optional in this release (a tier without it logs a warning), required after.
- `shareWith` lists the accounts (by their names in `sharedAccounts`) a tier's subnets are shared
  with through RAM. A tier sharing with every account goes in the main share; a narrower set gets
  a share of its own; `[]` shares with no account. `shareViaRam` is deprecated. Every tier gives
  exactly one of the two, and every `shareWith` name must be in `sharedAccounts` (fail closed).
- `formerNames` renames a tier without replacing anything: every resource named after the tier
  carries its old logical name as a Pulumi alias, so the preview shows tag updates only. The
  standard outputs (`publicSubnetIds`, `privateSubnetIds`, `dataSubnetIds`) and NAT placement
  follow a renamed tier through its former name. `tierSubnetIds` lists every tier by its current
  name.
- Each subnet is tagged `AzId` with its zone ID (zone names map to physical zones per account).
  Pass `availabilityZoneIds` or let the component look them up (`aws.getAvailabilityZones`); under
  Pulumi mocks, return `names` and `zoneIds` for that call.
- Exported helpers: `tierAliases`, `tierNamed`, `validateTierSharing`, `tierShareTargets`,
  `legacyRamAssociationNames`.

See each component's source for its full options interface.

## Upgrading to 0.6.0

**Every consumer**: the next preview renames each subnet's RAM association from a running index
(`<env>-ram-<tier>-<n>`) to tier and AZ letter (`<env>-ram-<tier>-<a…p>`) through an alias, and
adds the `AzId` tag (plus `Role` where declared) to subnets. Nothing is replaced. Test suites
under mocks must answer `aws:index/getAvailabilityZones:getAvailabilityZones` with `names` and
`zoneIds`, or pass `availabilityZoneIds`.

**A stack that renames tiers, moves to `shareWith` or stops sharing a tier in the same apply**:
pass `legacyRamSharedTiers` with the tiers that were in the main share before, by the names then
applied (e.g. `["public", "private", "data"]`). Without it the associations it keeps are deleted
and recreated, which briefly unshares their subnets. Check the preview: a kept tier's
associations must show as renames, never as create plus delete.

## Upgrading to 0.5.0

**Who must act**: consumers with a public tier whose public subnets take internet-initiated
HTTPS/HTTP over IPv4 (e.g. a public load balancer). Set `allowIpv4PublicIngress: true` for them.

The public tier NACL's TCP 443 and 80 rules from `0.0.0.0/0` (rules 100 and 110) are now opt-in,
symmetric with `allowIpv6PublicIngress`. Without the flag the next preview deletes those two rule
entries per public tier and changes nothing else. The VPC CIDR rule (95) and the return-traffic
rule (120) stay, so public-tier targets remain reachable from inside the VPC and keep their egress.

## Upgrading to 0.4.0

0.4.0 is the release that marks the SharedVpc IPv6 change as breaking. The change itself first
shipped in **0.3.4**, which is deprecated: it was released as a patch although it breaks some
consumers. Pin to 0.3.3 or move to 0.4.0; don't use 0.3.4.

**Who must act**: consumers that set `enableIpv6: true`.

- **Custom `subnetTiers`**: every tier must declare `ipv6Slot` (an integer 0–15, unique across
  tiers). Without it the component throws at construction, so nothing is deployed. Choose the
  slots once and never change them: a tier's slot fixes its subnets' /64s.
- **Default tiers**: they carry slots 0/1/2, so construction succeeds, but the next preview turns
  on IPv6 everywhere. Every subnet gains a /64 and assign-on-create (in-place updates, never
  replacements), every tier NACL gains IPv6 rules, private tiers gain an egress-only gateway route,
  and endpoints become dual-stack. Review it as a deliberate network change, per environment.
- `allowIpv6PublicIngress` now defaults to `false`, and the public `::/0` route is always present
  with IPv6 (see [SharedVpc and IPv6](#sharedvpc-and-ipv6)).

Consumers without `enableIpv6` see no change.

## Versioning & releases

This package ships independent semver. Below 1.0, a breaking change bumps the minor version
(0.3.x → 0.4.0) and features and fixes bump the patch. Breaking changes are marked (`!`), so a
`^0.y.z` range never admits one. See the
[root CHANGELOG conventions](https://github.com/AdaptiveWorX/iac-core/blob/main/CONTRIBUTING.md#releases)
and this package's [CHANGELOG.md](./CHANGELOG.md).

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
