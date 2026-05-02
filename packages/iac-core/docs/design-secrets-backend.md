# Design spike — `SecretsBackend` pluggable interface

> **Status**: Spike / RFC. No code shipped.
> **Authors**: Tier 3 follow-up to the iac-core 0.2.0 graduation.
> **Date**: 2026-04-26
> **Decision needed before implementing**: identify a second concrete consumer (Azure Key Vault, AWS Secrets Manager, Vault, 1Password Connect, …) and validate the interface against their actual auth flow + secret organization.

## Why this exists

`SecretManager` today is welded to Infisical's SDK. It auto-detects credentials, walks Infisical-specific folder paths, and falls back to `process.env` when Infisical isn't available. That's fine for AdaptiveWorX-internal use — Infisical is our standard. But the package is now consumed externally:

- The current external consumer is willing to use Infisical short-term, so they're not pushing on this yet.
- The next external consumer (TBD) may have a strong preference for **Azure Key Vault** (Microsoft shop), **AWS Secrets Manager** (AWS-only shop), **HashiCorp Vault** (regulated industry shop), or **1Password Connect** (small-team shop). Forcing them to install Infisical to use `iac-core` is a real adoption barrier.
- Internally, **tests would benefit** from an in-memory backend that doesn't require the Infisical SDK at all.

The fix: extract a small `SecretsBackend` interface that the high-level `SecretManager` calls through. Ship `InfisicalBackend` as the canonical impl; let consumers BYO for everything else.

## Goals

1. Existing callers of `SecretManager` keep working with **no source-level changes** (constructor signature stays compatible, all public methods unchanged).
2. The interface is **small enough** that wrapping a foreign secrets API is half a day of work.
3. Backend swap is a **single line** in `OrganizationConfig`-style consumer code: `new SecretManager({ backend: new AzureKeyVaultBackend({...}) })`.
4. Domain-specific helpers (`getAwsAccountsJson`, `getDeploymentConfiguration`) stay on `SecretManager` as a layer above the backend — they're not Infisical-specific, they just happened to live with the Infisical code.
5. The fallback to `process.env` becomes its own backend (`EnvBackend`), composable with any other backend via a `ChainBackend`.

## Non-goals

- **Cross-backend secret syncing.** If a consumer wants to mirror secrets from Azure Key Vault to a `.env` file for local dev, that's their concern — we provide the primitives, not the orchestration.
- **A new auth abstraction.** Each backend handles its own auth (Universal Auth, Workload Identity, IAM role, OIDC). We don't try to unify.
- **Secret writing.** This is a read-only library; no `setSecret` or `rotate` methods. Pulumi reads secrets, it doesn't manage them.
- **Streaming / change-watching.** Secrets are fetched on-demand at deploy time. No subscription model.
- **Generic secret-management features** like leasing, dynamic credentials, response caching with TTLs. Those belong in dedicated tools (Vault Agent, AWS SDK caching).

## Interface — first cut

```ts
// libs/iac/core/src/config/secrets-backend.ts (new file)

/**
 * Lookup context passed to a backend on every fetch. Backends interpret
 * these fields however suits their organizational model — Infisical maps
 * cloud → folder, AWS Secrets Manager might map cloud + environment to a
 * secret-name prefix, etc.
 */
export interface SecretLookup {
  readonly key: string;
  readonly environment?: string;   // dev | stg | prd | sec | ...
  readonly cloud?: string;         // aws | azure | gcp | cloudflare
  readonly region?: string;
  readonly purpose?: string;
}

/**
 * The minimum surface a secrets backend must implement.
 *
 * Backends should:
 *   - return `null` (not throw) when a key isn't found — the caller decides
 *     whether absence is fatal
 *   - throw on auth failure, network failure, malformed responses — these
 *     are programmer / ops errors, not "secret missing"
 *   - be safe to construct without I/O (lazy auth on first fetch)
 */
export interface SecretsBackend {
  /** Human-readable name for logs + healthCheck — e.g. "infisical", "azure-keyvault" */
  readonly name: string;

  /** Fetch a secret. Returns null if the key is genuinely absent. */
  get(lookup: SecretLookup): Promise<string | null>;

  /**
   * Health probe used by `SecretManager.healthCheck()`. Backends should
   * verify auth + connectivity here. Returns whether the backend is
   * reachable and any keys it expected to find but didn't.
   */
  healthCheck(): Promise<BackendHealth>;
}

export interface BackendHealth {
  readonly available: boolean;
  readonly missingKeys: string[];   // for backends that have a known key list
  readonly diagnostics?: Record<string, unknown>;   // freeform — auth method, endpoint, etc.
}
```

Notes on the shape:

- **`get` returns `Promise<string | null>`** rather than throwing on missing keys. Throwing is reserved for "this backend is broken" (auth, network, malformed response). The current `SecretManager.getSecret` decides whether `null` becomes a thrown error — that policy stays at the layer above.
- **No `getMany`.** Most backends don't have batched fetches with low enough latency to matter; the ones that do (e.g. Vault's KVv2) can pipeline behind the scenes. Add later if a consumer measures real value.
- **No `list` or enumeration.** Some backends (Azure Key Vault) gate listing behind a separate role; some (Infisical Universal Auth) have it freely. Not worth the cross-backend friction.
- **`healthCheck` returns a structured result** so `SecretManager.healthCheck()` can include backend diagnostics in its output for ops to triage.

## `SecretManager` after the refactor

```ts
// libs/iac/core/src/config/secrets.ts (refactored)

export interface SecretManagerOptions {
  /**
   * Backend to use for secret lookups. Defaults to a `ChainBackend` of
   * `InfisicalBackend` followed by `EnvBackend` — i.e. exactly the
   * behavior pre-0.3.0.
   */
  readonly backend?: SecretsBackend;

  /** Default lookup context applied to every call when not overridden */
  readonly defaultContext?: SecretContext;
}

export class SecretManager {
  private readonly backend: SecretsBackend;
  private readonly defaultContext: SecretContext | undefined;

  constructor(opts: SecretManagerOptions | SecretContext = {}) {
    // Backwards-compat: 0.2.0 took a bare SecretContext as the constructor
    // arg. We sniff for that shape and route it through.
    if (isSecretContext(opts)) {
      this.defaultContext = opts;
      this.backend = defaultBackend();   // InfisicalBackend → EnvBackend
    } else {
      this.defaultContext = opts.defaultContext;
      this.backend = opts.backend ?? defaultBackend();
    }
  }

  // Public API stays identical — getSecret, getOptionalSecret, etc.
  async getSecret(key: string, context?: SecretContext): Promise<string> {
    const lookup = this.toLookup(key, context);
    const value = await this.backend.get(lookup);
    if (value === null) {
      throw new Error(this.formatMissingError(lookup));
    }
    return value;
  }

  async getOptionalSecret(key: string, defaultValue: string, context?: SecretContext) {
    const value = await this.backend.get(this.toLookup(key, context));
    return value ?? defaultValue;
  }

  async healthCheck() {
    const backendHealth = await this.backend.healthCheck();
    return {
      backend: this.backend.name,
      available: backendHealth.available,
      missingKeys: backendHealth.missingKeys,
      diagnostics: backendHealth.diagnostics ?? {},
    };
  }

  // Domain helpers (getAwsAccountsJson, getDeploymentConfiguration, …) stay
  // — they call this.getSecret() under the hood, which goes through the
  // backend.
}

function isSecretContext(x: unknown): x is SecretContext {
  return typeof x === "object" && x !== null
    && !("backend" in x) && !("defaultContext" in x);
}
```

The constructor sniff is mildly ugly but it preserves the 0.2.0 signature exactly. After a deprecation period (one minor) we can drop the bare-`SecretContext` form.

## Reference backends

### `InfisicalBackend` — the canonical impl

Extract straight from the current `SecretManager`:

```ts
export class InfisicalBackend implements SecretsBackend {
  readonly name = "infisical";

  constructor(opts?: InfisicalBackendOptions) { /* … */ }

  async get(lookup: SecretLookup): Promise<string | null> {
    await this.ensureInitialized();
    if (!this.authenticated) return null;

    // Same path-building logic as today: try /<cloud>, then /
    for (const path of this.pathsFor(lookup)) {
      const result = await this.infisical.secrets().getSecret({
        environment: lookup.environment ?? "dev",
        projectId: this.projectId,
        secretName: lookup.key,
        secretPath: path,
      });
      if (result) return result.secretValue;
    }
    return null;
  }

  async healthCheck(): Promise<BackendHealth> { /* … */ }
}

interface InfisicalBackendOptions {
  readonly clientId?: string;       // default: process.env.INFISICAL_CLIENT_ID
  readonly clientSecret?: string;   // default: process.env.INFISICAL_CLIENT_SECRET
  readonly projectId?: string;      // default: process.env.INFISICAL_PROJECT_ID
  readonly siteUrl?: string;        // default: process.env.INFISICAL_SITE_URL
}
```

### `EnvBackend` — process.env fallback

```ts
export class EnvBackend implements SecretsBackend {
  readonly name = "env";

  async get(lookup: SecretLookup): Promise<string | null> {
    return process.env[lookup.key] ?? null;
  }

  async healthCheck(): Promise<BackendHealth> {
    return { available: true, missingKeys: [] };
  }
}
```

### `ChainBackend` — try-each-in-order

```ts
export class ChainBackend implements SecretsBackend {
  readonly name: string;
  constructor(private readonly chain: SecretsBackend[]) {
    this.name = chain.map(b => b.name).join(" → ");
  }

  async get(lookup: SecretLookup): Promise<string | null> {
    for (const backend of this.chain) {
      const value = await backend.get(lookup);
      if (value !== null) return value;
    }
    return null;
  }

  async healthCheck(): Promise<BackendHealth> {
    const healths = await Promise.all(this.chain.map(b => b.healthCheck()));
    return {
      available: healths.some(h => h.available),
      missingKeys: [],
      diagnostics: Object.fromEntries(
        this.chain.map((b, i) => [b.name, healths[i]])
      ),
    };
  }
}

// Default: try Infisical first, then env vars
function defaultBackend(): SecretsBackend {
  return new ChainBackend([new InfisicalBackend(), new EnvBackend()]);
}
```

This is what gives us **zero behavior change for AdaptiveWorX-internal callers**. The default backend is the chain, and the chain reproduces the current Infisical-then-env logic.

### `MapBackend` — for tests

```ts
export class MapBackend implements SecretsBackend {
  readonly name = "map";
  constructor(private readonly secrets: Map<string, string>) {}
  async get(lookup: SecretLookup) { return this.secrets.get(lookup.key) ?? null; }
  async healthCheck(): Promise<BackendHealth> {
    return { available: true, missingKeys: [] };
  }
}
```

```ts
// In tests
const sm = new SecretManager({
  backend: new MapBackend(new Map([
    ["DB_PASSWORD", "test"],
    ["VPC_CIDR_BASE", "10.0.0.0/16"],
  ])),
});
```

## Future backends — sketches

These won't ship in the first PR. Listed here so the interface design accounts for their constraints.

### `AzureKeyVaultBackend`

```ts
export class AzureKeyVaultBackend implements SecretsBackend {
  readonly name = "azure-keyvault";
  constructor(opts: { vaultUrl: string; credential?: TokenCredential }) {
    this.client = new SecretClient(opts.vaultUrl, opts.credential ?? new DefaultAzureCredential());
  }

  async get(lookup: SecretLookup): Promise<string | null> {
    // KV doesn't have a folder concept; we encode context into key name
    const candidates = [
      `${lookup.cloud}-${lookup.environment}-${lookup.key}`,
      `${lookup.environment}-${lookup.key}`,
      lookup.key,
    ].map(name => name.replaceAll("_", "-"));   // KV doesn't allow underscores

    for (const name of candidates) {
      try {
        const result = await this.client.getSecret(name);
        if (result.value) return result.value;
      } catch (e) {
        if (isNotFound(e)) continue;
        throw e;
      }
    }
    return null;
  }

  async healthCheck(): Promise<BackendHealth> { /* getProperties to verify access */ }
}
```

Wrinkle: Azure Key Vault names are `[a-zA-Z0-9-]` only (no underscores). The backend is responsible for translating between the consumer-friendly `VPC_CIDR_BASE` and the KV-friendly `vpc-cidr-base`. **The interface stays the same**; the translation is internal.

### `AwsSecretsManagerBackend`

```ts
export class AwsSecretsManagerBackend implements SecretsBackend {
  readonly name = "aws-secrets-manager";
  constructor(opts: { client?: SecretsManagerClient; pathPrefix?: string }) { /* … */ }

  async get(lookup: SecretLookup): Promise<string | null> {
    // SM uses paths: /myorg/dev/aws/VPC_CIDR_BASE
    const path = [
      this.pathPrefix,
      lookup.environment,
      lookup.cloud,
      lookup.key,
    ].filter(Boolean).join("/");

    try {
      const result = await this.client.send(new GetSecretValueCommand({ SecretId: path }));
      return result.SecretString ?? null;
    } catch (e) {
      if (e instanceof ResourceNotFoundException) return null;
      throw e;
    }
  }
}
```

### `VaultBackend`

```ts
export class VaultBackend implements SecretsBackend {
  readonly name = "hashicorp-vault";
  constructor(opts: { address: string; token: string; mount: string; basePath?: string }) {}

  async get(lookup: SecretLookup): Promise<string | null> {
    // Vault KVv2: mount=secret, basePath=myorg, key=dev/aws/VPC_CIDR_BASE
    const fullPath = [this.basePath, lookup.environment, lookup.cloud, lookup.key]
      .filter(Boolean).join("/");

    const result = await fetch(`${this.address}/v1/${this.mount}/data/${fullPath}`, {
      headers: { "X-Vault-Token": this.token },
    });
    if (result.status === 404) return null;
    if (!result.ok) throw new Error(`vault: ${result.status} ${result.statusText}`);
    const body = await result.json();
    return body.data?.data?.[lookup.key] ?? null;
  }
}
```

### `OnePasswordConnectBackend`

Similar shape — REST API at a known endpoint, vault concept maps to `lookup.cloud` or `lookup.environment`, item name is `lookup.key`. Single-org workflows preferred.

## Migration plan

If we move forward:

| Phase | Change | Public API impact |
|---|---|---|
| **0.3.0** | Land `SecretsBackend` + `InfisicalBackend` + `EnvBackend` + `ChainBackend` + `MapBackend`. `SecretManager` constructor accepts `SecretManagerOptions` (sniffs old signature). Default backend stays the chain. | None for existing callers |
| **0.4.0** | Add docs/examples for the third-party backends consumers want most. No code changes if we don't ship the backends ourselves. | None |
| **1.0.0** | Drop the `SecretContext`-only constructor signature. Always-options form. | Minor — single-line caller fix: `new SecretManager(ctx)` → `new SecretManager({ defaultContext: ctx })` |

We ship Azure / AWS / Vault backends as **separate sibling packages** (`@adaptiveworx/iac-secrets-azure`, etc.) only if a real consumer asks. Bundling them into iac-core means iac-core's `dependencies` list grows with every new backend; sibling packages keep iac-core lean and let consumers install only what they use.

## Open questions

These need answers from a real second consumer before we lock the interface:

1. **Auth bootstrapping.** Infisical and Vault both have a "machine identity" concept where the SDK handles auth internally given credentials. Azure Key Vault uses `DefaultAzureCredential` (chain of env vars, managed identity, az CLI, etc.). AWS Secrets Manager uses the AWS SDK's credential chain. **Should `SecretsBackend` expose an `authenticate()` method**, or do we let each backend handle auth in its constructor + `get()` lazily? The current proposal says "lazy in get()" — simplest, but means a misconfigured backend doesn't fail until first use.

2. **Path layout / context interpretation.** Infisical maps `cloud` to a folder (`/aws`, `/`). Other backends interpret context very differently (key name prefix, separate vault mounts, key naming convention). **Should the interface require backends to document their context-mapping**, or let them be opaque? Current proposal: opaque — each backend's docstring explains its scheme. Risk: subtle behavior differences across backends become invisible.

3. **Multi-tenant within one backend.** A consumer might run multiple tenants (e.g., a SaaS reselling our libraries) and want one Vault mount per tenant. Should `SecretsBackend.get` accept a `tenant` field in `SecretLookup`? Current proposal: no — tenants get separate `SecretManager` instances with different backend configs. Cleaner separation.

4. **Caching.** The current `SecretManager` has an `awsAccountsCache` for the `AWS_ACCOUNTS` JSON. Should the backend cache, or should `SecretManager` cache backend responses, or neither (let consumers cache)? Current proposal: caching stays at the `SecretManager` domain-helper layer (`getAwsAccountsJson` keeps its cache); backends are uncached. Backends that benefit from caching (Vault, KV) can wrap themselves in their own cache layer transparently.

5. **Error taxonomy.** Right now `SecretManager.getSecret` throws a single error type for all failure modes (missing, auth, network). Should `SecretsBackend` errors carry structured tags (`MissingError`, `AuthError`, `NetworkError`)? Current proposal: no — return null for missing, throw `Error` for everything else. Consumers who need fine-grained handling can subclass. Worth revisiting when we have a real second consumer.

## Recommended path forward

1. **Don't ship 0.3.0 yet.** Wait for a concrete second consumer to validate the interface against their real auth + secret layout.
2. **Land this design doc** so the rationale + open questions are persistent (this PR).
3. **When a second consumer surfaces**, run a half-day spike: write the second backend without changing iac-core, verify the interface design holds, then do the actual extraction.
4. **Ship 0.3.0 with `SecretsBackend` + at minimum two backends** (`InfisicalBackend` + the new one). Two backends is the floor for "we got the abstraction right."

## Appendix — what the diff looks like

Approximate file impact for the actual implementation, when we get there:

| File | Change |
|---|---|
| `libs/iac/core/src/config/secrets-backend.ts` | New — interface + types |
| `libs/iac/core/src/config/backends/infisical.ts` | New — `InfisicalBackend` (extracted from current `SecretManager`) |
| `libs/iac/core/src/config/backends/env.ts` | New — `EnvBackend` |
| `libs/iac/core/src/config/backends/chain.ts` | New — `ChainBackend` |
| `libs/iac/core/src/config/backends/map.ts` | New — `MapBackend` (test helper) |
| `libs/iac/core/src/config/secrets.ts` | Refactored — accept `SecretManagerOptions`, delegate `get` to `this.backend`, keep domain helpers |
| `libs/iac/core/src/index.ts` | Re-export new types + backends |
| `libs/iac/core/src/config/secrets.unit.test.ts` | Add tests using `MapBackend` instead of mocking Infisical SDK |
| `libs/iac/core/CHANGELOG.md` | `0.3.0` entry |

Roughly 600 lines of new code, ~150 lines moved from `secrets.ts` → `infisical.ts`, no public-API breaks.
