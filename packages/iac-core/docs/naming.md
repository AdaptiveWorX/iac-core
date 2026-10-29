# Naming: projects, stacks, providers, regions

Every Pulumi stack is addressed as `{org}/{project}/{stack}`. iac-core parses and
validates both names (`detectStackContext()`, `parseStackIdentity()`,
`StackContextSchema`, `ProjectNameSchema`, `StackNameSchema`); this page is the
grammar they share, the account grammar of
`Pl.Architecture.Meta.NamingConventionsAcrossPlatforms`. It is the only grammar
they read: a name in any other is refused, the legacy one included (see
[Removed in 0.6](#removed-in-06)).

## Project: `{tenant}-{provider}-{account-purpose}-{env}`

A project is one account. Four segments:

| Segment | Rule | Examples |
|---|---|---|
| tenant | `OrgPrefixSchema`: 2-8 lowercase alphanumerics | `worx`, `care` |
| provider | `ProviderSchema` (below) | `aws`, `cloudflare` |
| account-purpose | `AccountPurposeSchema`: 2-10 lowercase alphanumerics | `app`, `ops` |
| env | `EnvironmentSchema`: 2-15 lowercase alphanumerics | `dev`, `stg`, `prd`, `sec` |

`worx-aws-app-dev`, `worx-aws-ops-sec`, `worx-cloudflare-ops-sec`, `worx-github-ops-sec`.

The provider segment used to be called `cloud`; iac-core 0.5 renamed it
everywhere, with no aliases (see [Renamed in 0.5](#renamed-in-05)).

## Stack: `{target-env}-{stack-purpose}[-{concern}]-{region}`

Three or four kebab-case segments in fixed position, one rule everywhere:

| Segments | Form | Examples |
|---|---|---|
| 3 | `{target-env}-{stack-purpose}-{region}` | `dev-flow-use1`, `dev-vpc-use1`, `sec-ztna-glb` |
| 4 | `{target-env}-{stack-purpose}-{concern}-{region}` | `sec-iam-github-use1`, `dev-iam-pulumi-use1` |

- **The target environment is always first**: the project's own environment
  (`sec-iam-github-use1` in `worx-aws-ops-sec`), or, for a centralized stack,
  the environment it serves (`dev-vpc-use1` in `worx-aws-ops-sec`). The account
  purpose lives in the project, not the stack.
- **Every segment is one word.** A stack purpose has no hyphens
  (`StackPurposeSchema`): `ml-training` would read back as purpose `ml`, concern
  `training`. Write `mltraining`, or use the concern segment.
- `targetEnvironment` (centralized resources: a target environment other than
  the project's) is only for `vpc`, `cicd`, `vpn`, `monitoring`, deployed from
  the `sec` environment with account purpose `ops`.

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
  code (`sec-iam-github-use1`).
- A regional code is rejected for a global provider (`sec-ztna-use1` in
  `worx-cloudflare-ops-sec`).
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

## Parsing and building names

- `parseStackIdentity(project, stack)` -> `StackIdentity` (`tenant`, `provider`,
  `accountPurpose`, `environment`, `stackPurpose`, `region`, `concern?`, and
  `targetEnvironment?` for a centralized stack only). Any other grammar throws,
  naming the expected one.
- `projectNameOf(identity)` -> `worx-cloudflare-ops-sec`;
  `stackNameOf(identity)` -> `sec-ztna-glb`.
- A stack reference is `` `${org}/${projectNameOf(identity)}/${stackNameOf(identity)}` ``
  -> `adaptiveworx/worx-cloudflare-ops-sec/sec-ztna-glb`.
- `isAccountGrammarProject(project)`: four segments.

## Removed in 0.6

The legacy grammar (project `{tenant}-{provider}-{env}`, stack
`[{target-env}-]{account-purpose}-{stack-purpose}[-{concern}]-{region}`) and the
alias map that bridged its renames are gone. A legacy name is refused.

| Removed | Use instead |
|---|---|
| `detectStackContext({ nameAliases })`, `DetectStackContextOptions` | `detectStackContext()` |
| `NameAliasMap`, `validateNameAliases`, `canonicalStackName` | none: every name is in the account grammar |
| `parseProjectName(project)` | `parseStackIdentity(project, stack)` |
| `parseStackName(stack)` | `parseStackIdentity(project, stack)` |
| `isValidStackName(stack)` | `StackNameSchema.safeParse(stack).success` |
| `generateStackName(accountPurpose, stackPurpose, region, concern?, targetEnv?)` | `stackNameOf(identity)` |
| `buildStackReference({ org, … })` | `` `${org}/${projectNameOf(identity)}/${stackNameOf(identity)}` `` |
| `STACK_TARGET_ENVIRONMENTS` | none: the target environment is always the first segment |
| `STACK_NAME_MAX_SEGMENTS` = 5 | 4 |

## Renamed in 0.5

Rows naming `parseProjectName`, `parseStackName`, `buildStackReference` or the
`{tenant}-{provider}-{env}` project name are superseded by
[Removed in 0.6](#removed-in-06).

`cloud` became `provider` throughout, with no deprecated aliases:

| Before (0.4) | Now (0.5) |
|---|---|
| `CloudProviderSchema` (`aws`, `gcp`, `azure`) | `ProviderSchema` (+ `cloudflare`, `github`, `infisical`) |
| type `CloudProvider` | type `Provider` |
| `StackContext.cloud` / `StackContextSchema` input `cloud` | `provider` (required) |
| `parseProjectName()` → `{ tenant, cloud, environment }` | `{ tenant, provider, environment }` |
| `parseStackName("org/project/stack").cloud` | `.provider` |
| `ResourceNaming.cloud` | `ResourceNaming.provider` |
| `SecretContext.cloud` (SecretManager) | `SecretContext.provider` (Infisical folder `/{provider}`) |
| env var `IAC_CLOUD` | `IAC_PROVIDER` (default `aws`) |
| `resolveRegion(cloud, …)`, `getRegionAliases(cloud)`, `getRegions(cloud)`, `isValidRegion(cloud, …)` | same functions, parameter `provider: Provider` |
| `OrganizationConfig.formatStackName(org, cloud, …)`, `DEFAULT_STACK_NAMING.components` `"cloud"` | `provider` |
| `ValidationPatterns.validateStackContext` field `cloud` | `provider` |
| `generateProjectName(cloud, env)` (returned `aws-dev`) | removed: a project name is `` `${tenant}-${provider}-${env}` `` |
| `generateFullStackReference(org, cloud, env, …)` (no tenant) | removed: `buildStackReference({ org, tenant, provider, … })` |
| Cloudflare region alias `global` | `glb` (`global` stays valid as the region name) |
