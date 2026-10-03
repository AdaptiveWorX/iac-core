/**
 * Copyright (c) Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Imports every public entry point of every published package, the way a
 * consumer does (through each package's `exports` and its built dist/*.d.ts),
 * so `tsc` (TypeScript 7, skipLibCheck off) checks all of their declarations.
 */

import * as aws from "@adaptiveworx/iac-aws";
import * as azure from "@adaptiveworx/iac-azure";
import * as core from "@adaptiveworx/iac-core";
import * as organization from "@adaptiveworx/iac-core/config/organization";
import * as secrets from "@adaptiveworx/iac-core/config/secrets";
import * as constants from "@adaptiveworx/iac-core/schemas/constants";
import * as coreSchemas from "@adaptiveworx/iac-core/schemas/core/core-schemas";
import * as providers from "@adaptiveworx/iac-core/schemas/core/providers";
import * as tags from "@adaptiveworx/iac-core/schemas/core/tags";
import * as coreTypes from "@adaptiveworx/iac-core/types/core";
import * as cidrAllocation from "@adaptiveworx/iac-core/utils/cidr-allocation";
import * as regionUtils from "@adaptiveworx/iac-core/utils/region-utils";
import * as stackReadme from "@adaptiveworx/iac-core/utils/stack-readme";
import * as stackUtils from "@adaptiveworx/iac-core/utils/stack-utils";
import * as agentValidation from "@adaptiveworx/iac-core/validation/agent-validation";
import * as configurationPatterns from "@adaptiveworx/iac-core/validation/configuration-patterns";
import * as policies from "@adaptiveworx/iac-policies";
import * as schemas from "@adaptiveworx/iac-schemas";
import * as regions from "@adaptiveworx/iac-schemas/regions";

export const entryPoints = {
  aws,
  azure,
  core,
  organization,
  secrets,
  constants,
  coreSchemas,
  providers,
  tags,
  coreTypes,
  cidrAllocation,
  regionUtils,
  stackReadme,
  stackUtils,
  agentValidation,
  configurationPatterns,
  policies,
  schemas,
  regions,
};

// A few uses of the public types, so their shapes are exercised, not just loaded.
export const awsRegion: core.AwsRegion = "us-east-1";
export const parsedRegion = core.AwsRegionSchema.parse(awsRegion);
export const regionTable: schemas.Regions = schemas.regions;
export const flowTags: core.StandardTags = { Workload: "flow", ManagedBy: "pulumi" };
export const ztnaProject: core.Provider = "cloudflare";
export const cloudflareAccount: core.AccountReference = core.accountReference(
  "cloudflare",
  "0123456789abcdef0123456789abcdef"
);
export const ztnaStack: string = core.buildStackReference({
  org: "adaptiveworx",
  tenant: "worx",
  provider: "cloudflare",
  environment: "sec",
  accountPurpose: "ops",
  stackPurpose: "ztna",
  region: providers.GLOBAL_REGION_CODE,
});
