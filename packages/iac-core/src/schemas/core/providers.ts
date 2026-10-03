/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Providers: the second segment of a project name (`{tenant}-{provider}-{env}`).
 *
 * A provider is anything a project deploys into: a cloud (AWS, GCP, Azure) or
 * a SaaS platform (Cloudflare, GitHub, Infisical). Each one is a single entry
 * in {@link PROVIDER_DEFINITIONS}; adding a provider means adding one entry
 * there (and, for a regional provider, its region codes to
 * `@adaptiveworx/iac-schemas`' `config/regions.json`).
 *
 * Regions: a regional provider's stacks use its region codes from
 * iac-schemas (e.g. AWS `use1`, `usw2`). A global provider has no regions: its
 * stacks use the single region code `glb` (`global`). No provider is both;
 * AWS, GCP and Azure resources that are "global" (IAM, Route 53, …) are still
 * deployed through a home region, so they keep a regional code (`use1`).
 */

import { regions as regionsData } from "@adaptiveworx/iac-schemas";
import { z } from "zod";

/** The region code of a provider without regions. */
export const GLOBAL_REGION_CODE = "glb";

/** The full region name `glb` resolves to. */
export const GLOBAL_REGION = "global";

/** The region code (`glb`) or full name (`global`) of a global provider's stacks. */
export type GlobalRegion = typeof GLOBAL_REGION_CODE | typeof GLOBAL_REGION;

/**
 * How a provider identifies the account (or subscription, project,
 * organization) a stack deploys into.
 */
export interface AccountIdFormat {
  /** The shape of a valid account id. */
  readonly pattern: RegExp;
  /** What the id is, for error messages (e.g. "12-digit AWS account ID"). */
  readonly description: string;
  /** A syntactically valid example. */
  readonly example: string;
}

export interface ProviderDefinition {
  readonly displayName: string;
  /**
   * `regional`: stacks use the provider's region codes from iac-schemas'
   * regions.json (`glb` is rejected). `global`: stacks use `glb` only.
   */
  readonly regions: "regional" | "global";
  readonly accountId: AccountIdFormat;
}

/**
 * Every provider a project may name. Adding a provider is one entry here.
 * A `regional` provider must also have a section in iac-schemas'
 * `config/regions.json` (aws, gcp, azure do).
 */
export const PROVIDER_DEFINITIONS = {
  aws: {
    displayName: "Amazon Web Services",
    regions: "regional",
    accountId: {
      pattern: /^\d{12}$/,
      description: "12-digit AWS account ID",
      example: "123456789012",
    },
  },
  gcp: {
    displayName: "Google Cloud",
    regions: "regional",
    accountId: {
      // A GCP project ID: 6-30 chars, lowercase letters, digits and hyphens,
      // starting with a letter and not ending with a hyphen.
      pattern: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
      description: "GCP project ID",
      example: "worx-shared-prd",
    },
  },
  azure: {
    displayName: "Microsoft Azure",
    regions: "regional",
    accountId: {
      pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      description: "Azure subscription ID (GUID)",
      example: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
    },
  },
  cloudflare: {
    displayName: "Cloudflare",
    regions: "global",
    accountId: {
      pattern: /^[0-9a-f]{32}$/,
      description: "32-character hex Cloudflare account ID",
      example: "0123456789abcdef0123456789abcdef",
    },
  },
  github: {
    displayName: "GitHub",
    regions: "global",
    accountId: {
      // A GitHub organization (or user) login: 1-39 alphanumerics or single
      // hyphens, not starting or ending with a hyphen.
      pattern: /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/,
      description: "GitHub organization login",
      example: "AdaptiveWorX",
    },
  },
  infisical: {
    displayName: "Infisical",
    regions: "global",
    accountId: {
      pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      description: "Infisical organization ID (UUID)",
      example: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
    },
  },
} as const satisfies Record<string, ProviderDefinition>;

/** A provider name: the `{provider}` segment of `{tenant}-{provider}-{env}`. */
export type Provider = keyof typeof PROVIDER_DEFINITIONS;

const PROVIDER_NAMES = Object.keys(PROVIDER_DEFINITIONS) as [Provider, ...Provider[]];

/** Validates a provider name (`aws`, `gcp`, `azure`, `cloudflare`, `github`, `infisical`). */
export const ProviderSchema = z.enum(PROVIDER_NAMES);

/** Type guard for {@link Provider}. */
export function isProvider(value: string): value is Provider {
  return Object.hasOwn(PROVIDER_DEFINITIONS, value);
}

interface RegionTable {
  aliases: Record<string, string>;
  regions: string[];
}

function regionTable(provider: Provider): RegionTable | undefined {
  const table = (regionsData as unknown as Record<string, RegionTable | undefined>)[provider];
  return table;
}

/** True when the provider's stacks use region codes; false when they use `glb`. */
export function isRegionalProvider(provider: Provider): boolean {
  return PROVIDER_DEFINITIONS[provider].regions === "regional";
}

/**
 * The region codes a provider's stack names may end with: a regional
 * provider's short codes from iac-schemas (AWS: `use1`, `usw2`, …), or `glb`.
 */
export function getProviderRegionCodes(provider: Provider): string[] {
  if (!isRegionalProvider(provider)) {
    return [GLOBAL_REGION_CODE];
  }
  return Object.keys(regionTable(provider)?.aliases ?? {});
}

/**
 * True when `region` is valid for the provider: one of its region codes or
 * full region names (AWS `use1` or `us-east-1`), or, for a global provider,
 * `glb` / `global`. `glb` is never valid for a regional provider.
 */
export function isValidProviderRegion(provider: Provider, region: string): boolean {
  if (!isRegionalProvider(provider)) {
    return region === GLOBAL_REGION_CODE || region === GLOBAL_REGION;
  }
  const table = regionTable(provider);
  if (table === undefined) {
    return false;
  }
  return Object.hasOwn(table.aliases, region) || table.regions.includes(region);
}

/**
 * Resolve a region code to the provider's full region name (`use1` ->
 * `us-east-1`, `glb` -> `global`). Unknown values are returned unchanged.
 */
export function resolveProviderRegion(provider: Provider, region: string): string {
  if (!isRegionalProvider(provider)) {
    return region === GLOBAL_REGION_CODE ? GLOBAL_REGION : region;
  }
  return regionTable(provider)?.aliases[region] ?? region;
}

/** True when `id` has the shape of an account id for the provider. */
export function isValidAccountId(provider: Provider, id: string): boolean {
  return PROVIDER_DEFINITIONS[provider].accountId.pattern.test(id);
}

/**
 * A provider-neutral reference to the account a stack deploys into: an AWS
 * account (12 digits), a Cloudflare account (32 hex), an Azure subscription,
 * a GCP project, a GitHub organization or an Infisical organization.
 */
export const AccountReferenceSchema = z
  .object({
    provider: ProviderSchema,
    id: z.string().min(1),
    /** Optional human-readable name (e.g. the account's alias). */
    name: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const format = PROVIDER_DEFINITIONS[data.provider].accountId;
    if (!format.pattern.test(data.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Must be a valid ${format.description} (e.g. ${format.example})`,
        path: ["id"],
      });
    }
  });

/** A provider-neutral account reference. See {@link AccountReferenceSchema}. */
export type AccountReference = z.infer<typeof AccountReferenceSchema>;

/** Build an {@link AccountReference}, throwing if the id has the wrong shape for the provider. */
export function accountReference(provider: Provider, id: string, name?: string): AccountReference {
  return AccountReferenceSchema.parse({
    provider,
    id,
    ...(name === undefined ? {} : { name }),
  });
}
