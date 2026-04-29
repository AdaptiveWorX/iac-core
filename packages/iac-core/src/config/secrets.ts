/**
 * AdaptiveWorX™ Flow
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Modern secrets management using Infisical Universal Auth.
 * Supports both local development and GitHub Actions with the same auth method.
 * Paths: /aws, /github, /cloudflare, / (flat structure from infisical-sync.ts)
 */

import { InfisicalSDK } from "@infisical/sdk";
import * as pulumi from "@pulumi/pulumi";

const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_CLOUD = "aws";

function getEnvVar(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export interface SecretContext {
  readonly environment?: string;
  readonly cloud?: string;
  readonly region?: string;
  readonly purpose?: string;
}

interface ResolvedContext {
  readonly environment: string;
  readonly cloud: string;
  readonly region: string | undefined;
  readonly purpose: string | undefined;
}

export class SecretManager {
  private infisical: InfisicalSDK | null = null;
  private useInfisical = false;
  private authenticated = false;
  private initializationPromise: Promise<void> | null = null;
  private readonly defaultContext: SecretContext | undefined;

  constructor(defaultContext?: SecretContext) {
    this.defaultContext = defaultContext;
    // Start initialization immediately but don't block constructor
    this.initializationPromise = this.initializeInfisical();
  }

  /**
   * Ensures Infisical is initialized before use.
   * Called automatically by getSecret() methods.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initializationPromise !== null) {
      await this.initializationPromise;
      this.initializationPromise = null;
    }
  }

  private async initializeInfisical(): Promise<void> {
    try {
      const siteUrl = getEnvVar("INFISICAL_SITE_URL");

      // Initialize SDK
      this.infisical =
        typeof siteUrl === "string" && siteUrl.length > 0
          ? new InfisicalSDK({ siteUrl })
          : new InfisicalSDK();

      // Try Universal Auth with machine identity credentials (works in both GitHub Actions and local dev)
      const clientId = getEnvVar("INFISICAL_CLIENT_ID");
      const clientSecret = getEnvVar("INFISICAL_CLIENT_SECRET");

      if (
        typeof clientId === "string" &&
        clientId.length > 0 &&
        typeof clientSecret === "string" &&
        clientSecret.length > 0
      ) {
        try {
          await this.infisical.auth().universalAuth.login({
            clientId,
            clientSecret,
          });
          this.authenticated = true;
          this.useInfisical = true;
          void pulumi.log.info("🔐 Infisical using Universal Auth (machine identity)");
          return await Promise.resolve();
        } catch (error: unknown) {
          // Handle large Infisical SDK errors that can cause RangeError during formatting
          let errorMessage = "Authentication failed";
          try {
            if (error instanceof Error) {
              const msg = String(error.message);
              errorMessage = msg.length > 500 ? `${msg.substring(0, 500)}... (truncated)` : msg;
            } else {
              errorMessage = String(error).substring(0, 500);
            }
          } catch {
            errorMessage = "Authentication failed (error details unavailable)";
          }
          void pulumi.log.warn(`⚠️ Universal Auth login failed: ${errorMessage}`);
          // Fall through to env vars fallback
        }
      }

      // Fallback to environment variables for secrets
      // This requires secrets to be in .env.{cloud}.{env} files (use env-refresh)
      void pulumi.log.info("ℹ️  Using environment variables for secrets (local development mode)");
      void pulumi.log.info(
        "💡 Tip: Set INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET for cross-environment access"
      );
      return await Promise.resolve();
    } catch (error: unknown) {
      // Handle large Infisical SDK errors that can cause RangeError during formatting
      let errorMessage = "Initialization failed";
      try {
        if (error instanceof Error) {
          const msg = String(error.message);
          errorMessage = msg.length > 500 ? `${msg.substring(0, 500)}... (truncated)` : msg;
        } else {
          errorMessage = String(error).substring(0, 500);
        }
      } catch {
        errorMessage = "Initialization failed (error details unavailable)";
      }
      void pulumi.log.warn(`⚠️ Failed to initialize Infisical: ${errorMessage}`);
      void pulumi.log.info("🔄 Falling back to environment variables");
      this.useInfisical = false;
    }
  }

  private resolveContext(context?: SecretContext): ResolvedContext {
    // Merge: explicit context > default context > environment variables
    const environment = (
      context?.environment ??
      this.defaultContext?.environment ??
      getEnvVar("IAC_ENV") ??
      DEFAULT_ENVIRONMENT
    ).trim();
    const cloud = (
      context?.cloud ??
      this.defaultContext?.cloud ??
      getEnvVar("IAC_CLOUD") ??
      DEFAULT_CLOUD
    ).trim();
    const region =
      context?.region?.trim() ??
      this.defaultContext?.region?.trim() ??
      getEnvVar("IAC_REGION")?.trim();
    const purpose =
      context?.purpose?.trim() ??
      this.defaultContext?.purpose?.trim() ??
      getEnvVar("IAC_PURPOSE")?.trim();

    return {
      environment,
      cloud,
      region,
      purpose,
    };
  }

  private buildSecretPaths(context: ResolvedContext): string[] {
    // Simple 2-path lookup: cloud-specific, then root
    // Cloud folder (/{cloud}): Cloud-specific feature flags and config
    //   Examples: /aws, /azure, /cloudflare (when deploying to those clouds)
    // Root folder (/): Cross-cloud org-wide config (GITHUB_*, ORG_*, PULUMI_*, quality gates)
    return [`/${context.cloud}`, "/"];
  }

  async getSecret(key: string, context?: SecretContext): Promise<string> {
    // Ensure initialization is complete before accessing secrets
    await this.ensureInitialized();

    const resolved = this.resolveContext(context);

    // Try Infisical first
    if (this.useInfisical && this.infisical && this.authenticated) {
      const projectId = getEnvVar("INFISICAL_PROJECT_ID") ?? "";
      const secretPaths = this.buildSecretPaths(resolved);

      for (const path of secretPaths) {
        try {
          void pulumi.log.debug(
            `🔍 Fetching '${key}' from Infisical: env=${resolved.environment}, path=${path}`
          );
          const secret = await this.infisical.secrets().getSecret({
            secretName: key,
            projectId,
            environment: resolved.environment,
            secretPath: path,
          });

          const secretValue =
            typeof secret.secretValue === "string" ? secret.secretValue : undefined;
          if (typeof secretValue === "string" && secretValue.trim().length > 0) {
            void pulumi.log.info(
              `🔐 Retrieved '${key}' from Infisical: env=${resolved.environment}, path=${path}`
            );
            void pulumi.log.debug(`🔐 Secret value preview: ${secretValue.substring(0, 100)}...`);
            return secretValue;
          }
        } catch (error: unknown) {
          // Handle Infisical SDK errors carefully (can be very large)
          // Completely suppress the error to prevent RangeError from large messages
          let debugMessage = "Secret not found";
          try {
            if (error instanceof Error) {
              // Safely truncate error message
              const msg = String(error.message);
              debugMessage = msg.length > 100 ? `${msg.substring(0, 100)}...` : msg;
            }
          } catch {
            // If even accessing error.message fails, use generic message
            debugMessage = "Error accessing secret (details suppressed)";
          }
          // Continue to next path
          void pulumi.log.debug(`🔍 '${key}' not found in ${path}: ${debugMessage}`);
        }
      }
    }

    // Fallback to environment variables
    // For local development, if requesting a different environment than IAC_ENV,
    // we need to load from that environment's .env file
    const currentEnv = getEnvVar("IAC_ENV") ?? DEFAULT_ENVIRONMENT;
    const requestedEnv = resolved.environment;

    // If requesting different environment, try Infisical CLI first
    if (currentEnv !== requestedEnv && !this.useInfisical) {
      void pulumi.log.warn(
        `⚠️ Cross-environment secret access: Reading '${key}' from ${requestedEnv} while IAC_ENV=${currentEnv}.\n` +
          `Local mode doesn't support cross-environment .env files.\n` +
          `💡 Solution: Run 'infisical login' to enable Infisical SDK, or ensure secret is in current environment's .env file.`
      );
    }

    const envValue = getEnvVar(key);
    if (envValue !== undefined) {
      void pulumi.log.debug(`🔐 Retrieved '${key}' from environment variables`);
      return envValue;
    }

    throw new Error(
      `❌ Secret '${key}' not found in Infisical or environment variables.\n` +
        `Context: env=${resolved.environment}, cloud=${resolved.cloud}, region=${resolved.region ?? "-"}, purpose=${resolved.purpose ?? "-"}\n` +
        `Current IAC_ENV: ${currentEnv}\n` +
        "💡 For cross-environment access, set INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET for Universal Auth."
    );
  }

  async getOptionalSecret(
    key: string,
    defaultValue: string,
    context?: SecretContext
  ): Promise<string> {
    try {
      return await this.getSecret(key, context);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        return defaultValue;
      }
      throw error;
    }
  }

  async getBooleanSecret(
    key: string,
    defaultValue = false,
    context?: SecretContext
  ): Promise<boolean> {
    try {
      const value = await this.getSecret(key, context);
      const normalised = value.toLowerCase().trim();
      return ["true", "1", "yes", "on"].includes(normalised);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        return defaultValue;
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{
    infisicalAvailable: boolean;
    environmentVariablesAvailable: boolean;
    recommendedSecrets: string[];
    missingSecrets: string[];
  }> {
    const recommendedSecrets = ["ORG_TENANT", "ORG_NAME", "ORG_DOMAIN"];

    const missingSecrets: string[] = [];

    for (const secret of recommendedSecrets) {
      try {
        await this.getSecret(secret);
      } catch {
        missingSecrets.push(secret);
      }
    }

    return {
      infisicalAvailable: this.useInfisical && this.authenticated,
      environmentVariablesAvailable: true,
      recommendedSecrets,
      missingSecrets,
    };
  }
}

export const secretManager = new SecretManager();

export function getSecretManager(): SecretManager {
  return secretManager;
}
