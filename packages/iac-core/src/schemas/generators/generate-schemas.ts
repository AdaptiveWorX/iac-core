/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */
/**
 * Schema generator for agent-optimized development
 * Generates JSON schemas from Zod schemas for agent validation APIs
 * Outputs to /generated/ directory for clear separation
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { SCHEMA_CONFIG } from "../constants.js";
import * as coreSchemas from "../core/core-schemas.js";

/**
 * Schema registry for automated generation
 */
interface SchemaEntry {
  exportName: string;
  name: string;
  schema: ZodSchema<unknown>;
}

interface SchemaManifestEntry {
  name: string;
  file: string;
}

function isZodSchema(value: unknown): value is ZodSchema<unknown> {
  return (
    typeof value === "object" && value !== null && "_def" in (value as Record<string, unknown>)
  );
}

function collectSchemas(): SchemaEntry[] {
  return Object.entries(coreSchemas)
    .filter(([exportName, value]) => exportName.endsWith("Schema") && isZodSchema(value))
    .map(([exportName, schema]) => ({
      exportName,
      name: exportName.replace(/Schema$/, "") || exportName,
      schema,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const schemaEntries = collectSchemas();

/**
 * Generate JSON schemas for all registered Zod schemas
 * Agent utility: Enables external validation and API documentation
 */
function generateJsonSchemas(): void {
  // Ensure output directory exists
  const outputDir = resolve(SCHEMA_CONFIG.outputDirs.json);
  mkdirSync(outputDir, { recursive: true });

  const manifestEntries: Record<string, SchemaManifestEntry> = {};

  // Generate individual schema files
  for (const { name, schema } of schemaEntries) {
    try {
      const jsonSchema = zodToJsonSchema(schema, {
        name,
        target: "jsonSchema7",
        definitionPath: "$defs", // Native $defs format
        definitions: {} as Record<string, ZodSchema<unknown>>,
        errorMessages: true,
        markdownDescription: true,
      });

      // Add agent-specific metadata using constants
      const enhancedSchema = {
        ...jsonSchema,
        $id: `${SCHEMA_CONFIG.baseUrl}/${name.toLowerCase()}.json`,
        $schema: SCHEMA_CONFIG.jsonSchemaVersion,
        title: `${name} Schema`,
        description: `JSON Schema for ${name} validation in agent-optimized IaC deployments`,
        "x-agent-optimized": SCHEMA_CONFIG.agentOptimized,
        "x-version": SCHEMA_CONFIG.version,
        "x-namespace": SCHEMA_CONFIG.namespace,
      };

      const fileName = `${name.toLowerCase()}.json`;
      const filePath = resolve(outputDir, fileName);

      writeFileSync(filePath, JSON.stringify(enhancedSchema, null, 2));

      // Add to manifest
      manifestEntries[name.toLowerCase()] = { name, file: fileName };
    } catch (_error: unknown) {
      // Silently skip failed schema generations
    }
  }

  // Generate schema manifest for agent discovery
  const manifest = {
    $schema: SCHEMA_CONFIG.jsonSchemaVersion,
    $id: `${SCHEMA_CONFIG.baseUrl}/manifest.json`,
    title: "IaC Schema Manifest",
    description: "Registry of available JSON schemas for agent-optimized IaC validation",
    type: "object",
    properties: {
      version: {
        type: "string",
        const: SCHEMA_CONFIG.version,
      },
      namespace: {
        type: "string",
        const: SCHEMA_CONFIG.namespace,
      },
      schemas: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(manifestEntries).map(([key, { name, file }]) => [
            key,
            {
              type: "object",
              properties: {
                name: { type: "string", const: name },
                file: { type: "string", const: file },
                url: {
                  type: "string",
                  const: `${SCHEMA_CONFIG.baseUrl}/${file}`,
                },
              },
              required: ["name", "file", "url"],
            },
          ])
        ),
      },
    },
    required: ["version", "namespace", "schemas"],
    "x-agent-optimized": SCHEMA_CONFIG.agentOptimized,
    "x-version": SCHEMA_CONFIG.version,
    "x-namespace": SCHEMA_CONFIG.namespace,
  };

  writeFileSync(resolve(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

/**
 * Generate OpenAPI specification for agent communication
 */
function generateOpenApiSpec(): void {
  const openApiSpec = {
    openapi: SCHEMA_CONFIG.openApiVersion,
    info: {
      title: "IaC-Worx Agent API",
      description: "API specification for agent-optimized Infrastructure as Code operations",
      version: SCHEMA_CONFIG.version,
      contact: SCHEMA_CONFIG.contact,
      license: SCHEMA_CONFIG.license,
    },
    servers: [
      {
        url: "https://api.adaptiveworx.com/iac/v1",
        description: "Production API",
      },
      {
        url: "https://staging.adaptiveworx.com/iac/v1",
        description: "Staging API",
      },
    ],
    paths: {
      "/validate/stack-context": {
        post: {
          summary: "Validate Stack Context",
          description: "Validate stack context configuration for agent deployment",
          operationId: "validateStackContext",
          tags: ["validation"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/StackContext",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Validation successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      valid: { type: "boolean", const: true },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Validation failed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      valid: { type: "boolean", const: false },
                      errors: {
                        type: "array",
                        items: { $ref: "#/components/schemas/ValidationError" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/validate/deployment-config": {
        post: {
          summary: "Validate Deployment Configuration",
          description: "Validate deployment configuration for agent safety",
          operationId: "validateDeploymentConfig",
          tags: ["validation"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeploymentConfig",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Validation successful",
            },
            "400": {
              description: "Validation failed",
            },
          },
        },
      },
    },
    components: {
      schemas: Object.fromEntries(
        schemaEntries.map(({ name, schema }) => [
          name,
          zodToJsonSchema(schema, { target: "openApi3" }),
        ])
      ),
    },
    tags: [
      {
        name: "validation",
        description: "Schema validation endpoints for agent safety",
      },
      {
        name: "guardrails",
        description: "Agent guardrails and risk assessment",
      },
    ],
  };

  const outputDir = resolve(SCHEMA_CONFIG.outputDirs.schemas);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(resolve(outputDir, "openapi.json"), JSON.stringify(openApiSpec, null, 2));
}

/**
 * Generate TypeScript declaration files for schemas
 * Agent utility: Enable type-safe schema consumption
 */
function generateTypeDeclarations(): void {
  const declarations = `/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated schema types for agent development
 * DO NOT MODIFY - Generated by src/schemas/generators/generate-schemas.ts
 */

declare module "@adaptiveworx/iac-schemas" {
  export interface SchemaManifest {
    version: "${SCHEMA_CONFIG.version}";
    namespace: "${SCHEMA_CONFIG.namespace}";
    schemas: {
      ${schemaEntries
        .map(
          ({ name }) => `
      ${name.toLowerCase()}: {
        name: "${name}";
        file: "${name.toLowerCase()}.json";
        url: "${SCHEMA_CONFIG.baseUrl}/${name.toLowerCase()}.json";
      };`
        )
        .join("")}
    };
  }

  export interface ValidationAPI {
    validateStackContext(data: unknown): Promise<ValidationResult>;
    validateDeploymentConfig(data: unknown): Promise<ValidationResult>;
    assessRisk(context: unknown, config: unknown): Promise<RiskAssessment>;
  }

  export interface ValidationResult {
    valid: boolean;
    errors?: ValidationError[];
    message?: string;
  }

  export interface RiskAssessment {
    riskScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    requiresApproval: boolean;
    recommendations: string[];
  }

  export interface ValidationError {
    field: string;
    message: string;
    code: string;
    severity: "error" | "warning" | "info";
  }
}
`;

  const outputDir = resolve(SCHEMA_CONFIG.outputDirs.schemas);
  writeFileSync(resolve(outputDir, "types.d.ts"), declarations);
}

/**
 * Main schema generation entry point
 */
function main(): void {
  try {
    generateJsonSchemas();
    generateOpenApiSpec();
    generateTypeDeclarations();
  } catch (error: unknown) {
    console.error(
      "Schema generation failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateJsonSchemas, generateOpenApiSpec, generateTypeDeclarations };
