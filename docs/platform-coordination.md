# Platform Coordination — Prosilio ↔ AdaptiveWorX OSS `iac-*` packages

> **Audience**: anyone (human or agent) opening a working session in
> `adaptive/iac-worx`, `adaptive/flux-core`, or any external consumer
> repo (e.g. Prosilio) needs this context.
> **Purpose**: capture decisions made in the Prosilio design sessions that
> ripple into the OSS packages, so coordinated work doesn't need to
> re-derive them.
> **Status**: living doc. Update as decisions land.

## Context in one paragraph

Prosilio Care (healthcare client, small surgical center, US-only,
**Microsoft Fabric–primary** with Azure Databricks as a thin appliance for
the ModMed Delta Share) is the first external commercial consumer of
AdaptiveWorX's `@adaptiveworx/iac-*` npm packages. Prosilio builds its
Azure infrastructure with Pulumi + TypeScript, consuming `iac-core` and
`iac-schemas` directly, and eventually a new `iac-azure` once
patterns stabilize. This forces the packages to graduate from
"AdaptiveWorX-internal reusable code" to "externally consumable Apache 2.0
libraries," which is the catalyst for the **flux-core** OSS monorepo.

Full Prosilio architecture: `architecture.md` (separate repo).
This repo's OSS architecture: [architecture.md](./architecture.md).

## The repo split — current state

| Repo | Role | Visibility |
|---|---|---|
| **`adaptive/flux-core`** (this repo) | **Producer.** Hosts every reusable OSS `iac-*` package as an Nx-managed monorepo. Each package ships independent semver to public npm via Nx Release. | Public, Apache 2.0 |
| **`adaptive/iac-worx`** | **Consumer.** AdaptiveWorX's private deployment monorepo. Pulumi stacks under `apps/aws/{dev,stg,prd,sec}` consume the published `@adaptiveworx/iac-*` packages from npm. | Private, BUSL-1.1 |
| **External consumers** (Prosilio, future clients) | **Consumers.** `pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-schemas` etc., write their own stacks. | Their own |

Decision rationale: separating producer from consumer lets the OSS
packages have their own release cadence, public license, and consumer
audience without dragging Adaptive's private deployment infrastructure
along. iac-worx becomes a consumer like any other client.

## Decisions made (and locked in)

### Platform shape (Prosilio)

- **Microsoft Fabric is the primary platform.** F2 capacity to start; scale
  as user load demands.
- **Azure Databricks is reduced to a thin appliance** — its only role is to
  receive the ModMed D2D Delta Share (which can only land in a UC
  metastore) and run a daily snapshot job that writes Delta to its own
  workspace storage.
- **Cross-region phase**: Fabric in WUS3, ADB workspace in EUS2 (existing).
  Fabric Lakehouse uses a OneLake shortcut to read the EUS2 ADB storage
  for ModMed bronze. All other bronze (HubSpot, AirCall, SIS) ingests
  natively to WUS3 OneLake. Silver and gold live in WUS3 OneLake. Power BI
  hits gold via DirectLake — full intra-region speed.
- **Future state**: when ModMed re-provisions the share against a WUS3 ADB
  metastore, the EUS2 footprint goes away. No Fabric or Power BI changes
  required at that transition.

### OSS package layout (flux-core)

Nx workspace, **pnpm**, independent semver via **Nx Release**, all
packages Apache 2.0, all published to public npm under the `@adaptiveworx`
scope.

| Package | Purpose | Status |
|---|---|---|
| `@adaptiveworx/iac-core` | Cross-cloud primitives: `OrganizationConfig`, `SecretManager`, region utils, CIDR allocation, stack utils, validation, agent guardrails | Migrating from `iac-worx/libs/iac/core` |
| `@adaptiveworx/iac-schemas` | Zod-derived JSON schemas (validation contracts) | Migrating from `iac-worx/libs/iac/schemas` |
| `@adaptiveworx/iac-policies` | Pulumi policy packs (cross-cloud + cloud-specific) | Migrating from `iac-worx/libs/iac/policies` |
| `@adaptiveworx/iac-aws` | AWS Pulumi components: `SharedVpc`, `CrossAccountIAMRoles`, `GitHubActionsOIDC`, IAM helpers, AWS-IAM naming helpers (formerly `src/shared/`) | **Renamed in-place from** `@adaptiveworx/iac-components` (deprecated post-rename) |
| `@adaptiveworx/iac-azure` | Azure Pulumi components (Fabric, OneLake, secure storage, networking) | Empty skeleton |

The directory layout under `packages/` matches each unscoped package name
1:1 (`packages/iac-core/`, `packages/iac-aws/`, …) so npm name
and folder name are always grep-equivalent.

There is **no `iac-shared` package**. The folder formerly at
`flux-core/src/shared/` was AWS-IAM-specific naming helpers, not
cross-cloud — those folded into `iac-aws`. Genuinely
cross-cloud primitives live in `iac-core`; that's the right semantic name
because it's the foundation everything else depends on.

### Cross-cloud primitives boundary (locked)

- `iac-core` is **cloud-agnostic only.** AWS-Org-shaped pieces (account
  registry, AWS organization config, AWS region CIDR offsets) live in the
  sibling `iac-aws` package; Azure pieces in
  `iac-azure`; etc. This rule is documented at the top of
  `iac-core/src/index.ts` and is the test for "does this code belong in
  core."
- Prosilio consumes `iac-core` + `iac-schemas` on day 1. Not
  `iac-aws` (AWS-only). Not `iac-azure` (doesn't
  exist yet — Prosilio writes Azure stacks inline first; we'll extract
  components once patterns stabilize). `iac-policies` consumable but
  no-op on Azure resources.

### Subscription topology (Prosilio)

- 2 Azure subscriptions to start (`prod`, `nonprod`); room to expand to 4
  later (`mgmt`, `connectivity`, `prod`, `nonprod`).
- ADB workspace lives in the `prod` subscription (current EUS2 location).
- Fabric capacity + workspace lives in the `prod` subscription (WUS3 region).
- Resource Groups named forward-compatibly (e.g. `rg-prosilio-prd-data-wus3`,
  `rg-prosilio-prd-data-eus2`, `rg-prosilio-prd-mgmt-wus3`) so future
  subscription splits don't require rebuilding.

### Identity / access (Prosilio)

- Entra-native (Prosilio's IdP choice). Duo for MFA via Conditional Access.
- No IP allowlists anywhere — identity + Conditional Access does the work.
- Fabric workspace identity (system-assigned managed identity) for
  cross-resource access. Service principal for ADB-side workloads.
- Fabric workspace SPN/identity gets `Storage Blob Data Reader` on EUS2
  ADB workspace storage to drive the OneLake shortcut.
- CI/CD auth: GitHub Actions OIDC → Entra App Registration federated
  credential → Contributor on target subscription. Same pattern as
  iac-worx's `ops-iam-github-use1` AWS stack.

### Region (Prosilio)

- **Decided**: WUS3 primary; EUS2 secondary footprint (ADB only) until
  ModMed share re-provisioning.
- F-capacity confirmed available in WUS3 and EUS2.

## What's blocking Prosilio

Now that the OSS monorepo exists, blockers shift from "fix license fields
in iac-worx" to "publish initial versions from flux-core."

### Phase 1 — `iac-core` + `iac-schemas` initial publishes (~1 day)

These are the only things blocking Prosilio's Azure work.

1. Migrate `iac-core` source from `iac-worx/libs/iac/core/` into
   `packages/iac-core/` here. Adjust internal imports, scripts paths,
   peer/dev deps. Verify build/test/typecheck pass under Nx.
2. Same for `iac-schemas` (no internal deps; simpler).
3. Run `nx release` to publish `@adaptiveworx/iac-core@0.x` and
   `@adaptiveworx/iac-schemas@0.x` to public npm.
4. Update iac-worx to consume the published versions instead of the
   workspace path. Verify iac-worx still builds + deploys.

After these land, Prosilio can `pnpm add @adaptiveworx/iac-core
@adaptiveworx/iac-schemas` and start building.

### Phase 2 — `iac-policies` migration (~half day, async)

Not blocking Prosilio (policies are no-op on Azure resources today).
Migrate when Phase 1 has settled to keep PRs reviewable.

### Phase 3 — Rename publish of components (~1 hour)

1. Publish `@adaptiveworx/iac-aws@0.7.0` from
   `packages/iac-aws/` (already restructured).
2. Publish `@adaptiveworx/iac-components@0.6.2` deprecated, with a rename
   pointer to `iac-aws` in the README.
3. Stub `@adaptiveworx/iac-azure@0.1.0` already in place; no
   first publish until first component lands.

## What can happen async (not blocking Prosilio)

### `iac-core` debt to address before second external client

- **OrganizationConfig parameterization** — hardcoded AdaptiveWorX AWS org
  ID, master account, region lists. Prosilio doesn't use OrganizationConfig
  (AWS-org-structure-specific), so this blocks other external clients but
  not Prosilio.
- **SecretManager pluggability** — Infisical-or-env-vars today. Pluggable
  backend interface would let a client use Azure Key Vault. Medium
  refactor.
- **Hardcoded email domain fallbacks** in `aws-accounts.ts`.
- **Schema URL** — `constants.ts` hardcodes `schemas.adaptiveworx.com`.
- **CHANGELOG already migrated; README will need refresh** post-move.

### `iac-aws` debt

- **Hardcoded log archive account ID** (`539920679260`) in
  `cross-account-roles.ts`.
- **Per-component README expansion**.
- Move `iac-core` dep to `devDep` in `iac-policies` (unused at runtime).

### Azure components (future — Fabric-targeted)

When Prosilio's first few stacks have stabilized, extract these into
`packages/iac-azure/src/`. See
[architecture.md](./architecture.md#azure-component-roadmap) for the full
list and rationale.

Note: `DatabricksSecureWorkspace` as previously sketched is no longer a
high priority — Prosilio uses ADB only as a thin appliance, not a
general-purpose lakehouse.

## Open questions routed to the platform repos

| # | Question | Owner | Why routed |
|---|---|---|---|
| 1 | SecretManager pluggable backend interface design | `flux-core` (`iac-core`) | Prosilio could live with Infisical short-term, but external clients will push on this |
| 2 | OrganizationConfig parameterization strategy | `flux-core` (`iac-core`) | Needed before second external client |
| 3 | Semver commitment — cut 1.0 for `iac-core` / `iac-schemas` / `iac-policies` or stay 0.x? | `flux-core` | Affects Prosilio's trust calculus on consuming. Recommend staying 0.x until OrgConfig + SecretManager pluggability land. |
| 4 | `iac-aws` version strategy — bump to 0.7.0 at rename or cut 1.0? | `flux-core` | Rename is a natural moment to commit to semver. Recommend 0.7.0 — preserves continuity with 0.6.x history; 1.0 waits for Azure parity. |
| 5 | Azure component conventions — mirror AWS shapes or let Azure primitives drive a different API? | `flux-core` (`iac-azure`) | Answer before first Azure component. Likely different given Fabric's distinct primitive set. |

## Pointers

- This repo's architecture: [architecture.md](./architecture.md)
- Contribution + release process:
  [../CONTRIBUTING.md](../CONTRIBUTING.md)
- Compliance framework: [compliance-framework.md](./compliance-framework.md)
- Security implementation: [security-implementation.md](./security-implementation.md)
- Testing strategy: [testing-strategy.md](./testing-strategy.md)
- Full Prosilio architecture: `architecture.md` (Prosilio repo)
- ModMed CDF documentation: `../ModMed/` (Prosilio repo) (PDF + extracted dictionary TSVs)

## How to use this doc in a fresh session

**Starting a session in `adaptive/flux-core` (this repo):**
1. Read this file and [architecture.md](./architecture.md).
2. Phase 1/2/3 above tells you what's pending. Pick a phase scope; don't
   conflate.
3. All releases go through `nx release` — never edit a package's
   `version` field by hand.

**Starting a session in `adaptive/iac-worx`:**
1. Read this file.
2. iac-worx is now a **consumer** of the OSS packages. Don't add new
   reusable code there — add it to the appropriate `flux-core`
   package and bump its version.
3. To consume a new feature: bump the dep version in `iac-worx` and ship.

**Starting a session in a Prosilio (or other external) repo:**
1. Read this file for cross-repo context.
2. Check [architecture.md](./architecture.md) for which package solves
   which problem.
3. `pnpm add @adaptiveworx/iac-core @adaptiveworx/iac-schemas`. Open issues
   in `AdaptiveWorX/flux-core` for any gaps.
