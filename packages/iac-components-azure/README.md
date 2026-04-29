# @adaptiveworx/iac-components-azure

Reusable Pulumi infrastructure components for Microsoft Azure, written in
TypeScript.

> **Status: skeleton.** No components yet. Patterns are being captured inline
> in the [Prosilio](https://github.com/AdaptiveWorX) Azure stacks first;
> stable patterns will be extracted here.

Part of [AdaptiveWorX Flux](https://github.com/AdaptiveWorX/flux-core) —
a suite of open-source IaC libraries for multi-cloud Pulumi deployments.

## Planned components

- `FabricCapacity` — F-series capacity, region, admin assignments
- `FabricWorkspace` — workspace identity, capacity assignment, role grants
- `FabricLakehouse` — Lakehouse + shortcut configuration helpers
- `OneLakeShortcut` — generalized shortcut wrapper (cross-region, cross-account)
- `StorageSecure` — ADLS Gen2 with private endpoints, public network disabled, hierarchical namespace
- `KeyVaultSecure` — KV with private endpoint, RBAC model, soft-delete, purge protection
- `PrivateEndpointWithDns` — PE + private DNS zone link + zone group config
- `LogAnalyticsCentral` — central LAW with retention, Defender linkage
- `HubVNet` / `SpokeVNet` — hub-and-spoke networking primitives

See [../../docs/architecture.md](../../docs/architecture.md) for the full
roadmap.

## Install (when components ship)

```sh
pnpm add @adaptiveworx/iac-components-azure @pulumi/azure-native @pulumi/pulumi
```

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
