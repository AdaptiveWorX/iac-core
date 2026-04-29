/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @adaptiveworx/iac-core — public library entry point.
 *
 * Cloud-agnostic primitives only. AWS-Org-shaped pieces (account
 * registry, AWS organization config, AWS region CIDR offsets) live in
 * the sibling `@adaptiveworx/iac-aws` package; Azure pieces in
 * `@adaptiveworx/iac-azure`; and so on.
 *
 * Subpath imports (e.g. `@adaptiveworx/iac-core/utils/stack-utils`)
 * remain available for tree-shaking-sensitive consumers.
 */

// Organization config (cloud-agnostic — identity, environments, naming, network)
export type {
  EnvironmentConfig,
  NetworkConfig,
  OrganizationOptions,
  StackNaming,
} from "./config/organization.js";
export {
  DEFAULT_ENVIRONMENTS,
  DEFAULT_NETWORK,
  DEFAULT_STACK_NAMING,
  loadAdaptiveOrganizationDefaults,
  loadOrganizationOptionsFromEnv,
  OrganizationConfig,
} from "./config/organization.js";

// Secret management
export {
  getSecretManager,
  SecretManager,
  secretManager,
} from "./config/secrets.js";

// Schemas
export {
  SCHEMA_BASE_URL,
  SCHEMA_CONFIG,
  SCHEMA_NAMESPACE,
  SCHEMA_VERSION,
} from "./schemas/constants.js";
export * from "./schemas/core/core-schemas.js";

// Types — `AwsRegion` is sourced from ./schemas/core/core-schemas.js
// (Zod-derived runtime + type) rather than ./types/core.js to avoid duplicate exports.
export type {
  AccountConfig,
  AccountPurpose,
  AgentGuardrails,
  CidrAllocation,
  CloudProvider,
  ComplianceRequirement,
  DeploymentConfig,
  Environment,
  EnvironmentClass,
  PolicyConfig,
  ResourceNaming,
  StackContext,
  StackPurpose,
  StackPurposeClass,
  ValidationError,
  ValidationErrorCode,
  ValidationResult,
} from "./types/core.js";

// Utilities
export * from "./utils/cidr-allocation.js";
export * from "./utils/region-utils.js";
export * from "./utils/stack-readme.js";
export * from "./utils/stack-utils.js";

// Validation
export {
  AgentValidationError,
  AgentValidationService,
  ValidationPatterns,
} from "./validation/agent-validation.js";
export {
  ConfigurationValidator,
  CrossAccountConfigSchema,
  EnvironmentConstraintsSchema,
  InfrastructureComponentSchema,
  StackSizeSchema,
} from "./validation/configuration-patterns.js";
