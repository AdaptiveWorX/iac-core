# @adaptiveworx/iac-policies

Pulumi CrossGuard policy pack for [AdaptiveWorX™ Flow](https://adaptiveworx.com) infrastructure governance:

- **Required-tag enforcement** — every taggable resource must declare ownership, environment, and project tags
- **Environment-aware deployment gates** — production stacks demand stricter compliance than dev
- **Region allowlisting** — prevents accidental deployment to unauthorized regions
- **Tenant-aware compliance frameworks** — picks the right policy bundle (ISO27001, HIPAA, PCI-DSS, etc.) per tenant
- **Component-resource policy filtering** — `adaptiveworx:*` AdaptiveWorX components are exempt from raw-resource rules (their internals are governed at the component level)

The pack is **cloud-agnostic at the framework level** but currently ships AWS-specific resource rules. Non-AWS resources pass through unchanged.

## Install

```bash
pnpm add -D @adaptiveworx/iac-policies @pulumi/policy @pulumi/pulumi
# or
yarn add -D @adaptiveworx/iac-policies @pulumi/policy @pulumi/pulumi
# or
npm install -D @adaptiveworx/iac-policies @pulumi/policy @pulumi/pulumi
```

`@pulumi/policy` and `@pulumi/pulumi` are peer dependencies — your project should already have them.

## Usage

### Apply during preview / deploy

Point the Pulumi CLI at the installed package's `src/` directory:

```bash
pulumi preview --policy-pack node_modules/@adaptiveworx/iac-policies/src
pulumi up --yes --policy-pack node_modules/@adaptiveworx/iac-policies/src
```

### Apply via `Pulumi.<stack>.yaml`

```yaml
policyPacks:
  - node_modules/@adaptiveworx/iac-policies/src
```

### Per-tenant configuration

Set the `IAC_TENANT` environment variable (or pass `tenant` in the policy-pack config) to pick a compliance framework bundle:

| `IAC_TENANT` | Compliance frameworks applied |
|---|---|
| `worx` | ISO27001, SOC2 |
| `care` | ISO27001, HIPAA |
| `pci` | ISO27001, PCI-DSS |
| (other / unset) | ISO27001 (baseline) |

Add a tenant in the `tenantFrameworks` map at the top of `src/index.ts` if you need a new bundle.

### Skip the pack for non-governed resources

The pack only enforces rules on resources whose `args.type` starts with `aws:`. Non-AWS resources pass through unconditionally. AdaptiveWorX-internal component resources (whose type starts with `adaptiveworx:`) are also exempted — those are governed at the component-author level.

## What's enforced

| Policy | Severity | Notes |
|---|---|---|
| Required tags (`environment`, `owner`, `project`) | `mandatory` | Tagged AWS resource types only |
| Allowed regions per environment | `mandatory` | Defaults: dev→`us-east-1`; prd→`us-east-1`+`us-west-2` |
| Encryption-at-rest for storage | `mandatory` | S3, EBS, RDS, etc. |
| Public-internet exposure gate | `advisory` | Warn on internet-facing LBs in non-prod |
| Naming conventions | `advisory` | Resources should match `<env>-<purpose>-<region>` shape |

The full rule set is in [`src/index.ts`](./src/index.ts).

## Stability

This is a `0.x` release. Policy rules and severities may change in
backwards-incompatible ways before `1.0`. Once `1.0` ships, additions are
non-breaking; rule severity bumps and new mandatory rules will be major
versions.

## License

[Apache 2.0](./LICENSE). See [NOTICE](./NOTICE).

## Repository + contributing

This package is developed in the [AdaptiveWorX/iac-worx](https://github.com/AdaptiveWorX/iac-worx) monorepo at `libs/iac/policies/`. See [CONTRIBUTING.md](https://github.com/AdaptiveWorX/iac-worx/blob/main/CONTRIBUTING.md) for setup, workflow conventions, and the release process. File issues at <https://github.com/AdaptiveWorX/iac-worx/issues>.
