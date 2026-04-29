/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Schema metadata constants.
 *
 * `SCHEMA_BASE_URL` and `SCHEMA_CONFIG.contact.*` are overridable at
 * runtime via env vars so external consumers (or staging environments)
 * can host schemas + contact info under their own domain without
 * patching the package.
 */

export const SCHEMA_VERSION = "1.0.0";
export const SCHEMA_NAMESPACE = "adaptiveworx.iac";

const DEFAULT_SCHEMA_BASE_URL = "https://schemas.adaptiveworx.com/iac";

export const SCHEMA_BASE_URL = process.env.IAC_SCHEMA_BASE_URL ?? DEFAULT_SCHEMA_BASE_URL;

/**
 * Schema generation configuration
 */
export const SCHEMA_CONFIG = {
  version: SCHEMA_VERSION,
  namespace: SCHEMA_NAMESPACE,
  baseUrl: SCHEMA_BASE_URL,

  // JSON Schema specification version (true 2020-12 support with updated Zod)
  jsonSchemaVersion: "https://json-schema.org/draft/2020-12/schema",

  // OpenAPI specification version (latest)
  openApiVersion: "3.1.0",

  // Output directories (relative to repository root)
  outputDirs: {
    generated: "libs/iac/schemas/generated",
    schemas: "libs/iac/schemas/generated/schemas",
    json: "libs/iac/schemas/generated/schemas/json",
  },

  // Agent-specific metadata
  agentOptimized: true,

  // Contact and license information (overridable via env vars)
  contact: {
    name: process.env.IAC_SCHEMA_CONTACT_NAME ?? "Adaptive Intelligence, LLC",
    url: process.env.IAC_SCHEMA_CONTACT_URL ?? "https://adaptiveworx.com",
  },

  license: {
    name: "Apache 2.0",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
  },
} as const;
