/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The standard tags (keys from `@adaptiveworx/iac-schemas`' STANDARD_TAG_KEYS)
 * and the shape of their values. Values use the tag charset every supported
 * provider accepts (AWS's is the narrowest): letters, digits, spaces and
 * `+ - = . _ : / @`, at most 256 characters.
 */

import { STANDARD_TAG_KEYS, type StandardTagKey } from "@adaptiveworx/iac-schemas";
import { z } from "zod";

export { STANDARD_TAG_KEYS, type StandardTagKey };

/** A tag value in the cross-provider charset. */
export const TagValueSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(
    /^[\p{L}\p{N}\s+\-=._:/@]+$/u,
    "Tag values may contain letters, digits, spaces and + - = . _ : / @"
  );

/**
 * A workload name (the Workload tag): one lowercase kebab-case word (`flow`,
 * `ztna`, `shared`). Permission boundaries and ABAC conditions compare it
 * verbatim, so it has one canonical spelling.
 */
export const WorkloadSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(
    /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
    "Workload must be lowercase kebab-case (e.g. flow, ztna, shared)"
  );

/**
 * The standard tags. Every key is optional here (which ones a resource must
 * carry is a policy decision: see iac-policies' DEFAULT_REQUIRED_TAGS); a
 * value, when present, must be valid. Other tags pass through.
 */
export const StandardTagsSchema = z
  .object({
    Environment: TagValueSchema.optional(),
    Tenant: TagValueSchema.optional(),
    AccountPurpose: TagValueSchema.optional(),
    StackPurpose: TagValueSchema.optional(),
    TargetEnvironment: TagValueSchema.optional(),
    Workload: WorkloadSchema.optional(),
    ManagedBy: TagValueSchema.optional(),
    Description: TagValueSchema.optional(),
  } satisfies Record<StandardTagKey, z.ZodType>)
  .catchall(TagValueSchema);

/** The standard tags, plus any others. */
export type StandardTags = z.infer<typeof StandardTagsSchema>;
