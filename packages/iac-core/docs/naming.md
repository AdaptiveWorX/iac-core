# Naming: projects, stacks, providers, regions

Every Pulumi stack is addressed as `{org}/{project}/{stack}`. iac-core parses and
validates both names (`detectStackContext()`, `parseProjectName()`,
`parseStackName()`, `StackContextSchema`, `ProjectNameSchema`,
`StackNameSchema`); this page is the grammar they share.

## Project: `{tenant}-{provider}-{env}`

| Segment | Rule | Examples |
|---|---|---|
| tenant | `OrgPrefixSchema`: 2-8 lowercase alphanumerics | `worx`, `care` |
| provider | `ProviderSchema` (below) | `aws`, `cloudflare` |
| env | `EnvironmentSchema`: 2-15 lowercase alphanumerics | `dev`, `stg`, `prd`, `sec` |

`worx-aws-dev`, `worx-aws-sec`, `worx-cloudflare-sec`, `worx-github-sec`.

The provider segment used to be called `cloud`. The old names stay as
deprecated aliases with the same values: `CloudProviderSchema`
(= `ProviderSchema`), `CloudProvider` (= `Provider`), and `cloud` on a
`StackContext` (= `provider`). `StackContextSchema` accepts `provider`, `cloud`
or both (they must agree); `detectStackContext()` sets both.

## Stack: `[{target-env}-]{account-purpose}-{stack-purpose}[-{concern}]-{region}`

Three to five kebab-case segments, one rule everywhere:

| Segments | Form | Examples |
|---|---|---|
| 3 | `{account-purpose}-{stack-purpose}-{region}` | `app-flow-use1`, `ops-ztna-glb` |
| 4 | `{account-purpose}-{stack-purpose}-{concern}-{region}` | `ops-iam-github-use1`, `ops-ztna-cloudflare-use1` |
| 4 | `{target-env}-{account-purpose}-{stack-purpose}-{region}` | `dev-ops-vpc-use1`, `dev-ops-vpn-use1` |
| 5 | `{target-env}-{account-purpose}-{stack-purpose}-{concern}-{region}` | `dev-ops-vpc-shared-use1` |

- The two 4-part forms are told apart by the first segment: one of
  `STACK_TARGET_ENVIRONMENTS` (`dev`, `stg`, `prd`, `sec`) makes it the
  centralized form.
- **Every segment is one word.** A stack purpose has no hyphens
  (`StackPurposeSchema`): `ml-training` would read back as purpose `ml`, concern
  `training`. Write `mltraining`, or use the concern segment.
- `targetEnvironment` (centralized resources) is only for `vpc`, `cicd`, `vpn`,
  `monitoring`, deployed from the `sec` environment with account purpose `ops`.

## Providers and regions

A provider is anything a project deploys into: a cloud or a SaaS platform. Each
is one entry in `PROVIDER_DEFINITIONS` (`schemas/core/providers`), which decides
its regions and its account-id shape.

| Provider | Regions | Region codes in stack names | Account id |
|---|---|---|---|
| `aws` | regional | AWS codes from iac-schemas (`use1`, `usw2`, `euw1`, …) | 12 digits |
| `gcp` | regional | GCP codes from iac-schemas (`use1` = `us-east1`, …) | project ID |
| `azure` | regional | Azure codes from iac-schemas (`use1` = `eastus`, …) | subscription GUID |
| `cloudflare` | global | `glb` only | 32 hex |
| `github` | global | `glb` only | organization login |
| `infisical` | global | `glb` only | organization UUID |

- **`glb`** (`global`) is the region of providers without regions. It is
  rejected for AWS, GCP and Azure: their "global" services (IAM, Route 53, …)
  are still deployed through a home region, so those stacks keep a regional
  code (`ops-iam-github-use1`).
- A regional code is rejected for a global provider (`ops-ztna-use1` in
  `worx-cloudflare-sec`).
- `isValidProviderRegion(provider, region)`, `getProviderRegionCodes(provider)`
  and `resolveProviderRegion(provider, region)` (`use1` -> `us-east-1`,
  `glb` -> `global`) apply these rules. iac-schemas' `resolveRegion("cloudflare", "glb")`
  also returns `global`.

### Adding a provider

Add one entry to `PROVIDER_DEFINITIONS` (display name, `regional` or `global`,
account-id pattern with a description and an example). A regional provider also
needs its region codes in `@adaptiveworx/iac-schemas`' `config/regions.json`.
`ProviderSchema`, project names, stack-context validation and account references
pick it up from there.

## Account references

`AccountReferenceSchema` / `accountReference(provider, id, name?)` is the
provider-neutral way to name the account a stack deploys into:
`{ provider: "cloudflare", id: "0123…cdef" }`, `{ provider: "aws", id: "123456789012" }`.
The id is checked against the provider's shape (`isValidAccountId`).
`CrossAccountConfigSchema` and `ValidationPatterns.validateCrossAccountOperation`
take an optional `provider` (default `aws`) and check both account ids against it.
`AwsAccountRegistry` (iac-aws) stays the AWS account registry.

## Building names

- `generateProjectName(tenant, provider, env)` -> `worx-cloudflare-sec`. The
  two-argument form `generateProjectName(cloud, env)` is deprecated: it returns
  `aws-dev`, which is not a valid project name.
- `generateStackName(accountPurpose, stackPurpose, region, concern?, targetEnv?)`.
- `buildStackReference({ org, tenant, provider, environment, accountPurpose,
  stackPurpose, region, concern?, targetEnvironment? })` ->
  `adaptiveworx/worx-cloudflare-sec/ops-ztna-glb`. It replaces the deprecated
  `generateFullStackReference()`, whose project segment has no tenant.
