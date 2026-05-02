## 0.2.0 (2026-05-02)

### 🚀 Features

- ⚠️  **iac-policies:** refactor to library of factory primitives ([42b3bbc](https://github.com/AdaptiveWorX/iac-core/commit/42b3bbc))

### ⚠️  Breaking Changes

- **iac-policies:** refactor to library of factory primitives  ([42b3bbc](https://github.com/AdaptiveWorX/iac-core/commit/42b3bbc))
  the policyPack export and all internal helpers
  (loadPolicyConfig, getConfig, parseProjectName, parseStackName,
  inferEnvironmentClass, getStackPurposeClass, getTenantFrameworks,
  AgentPolicyConfig) are removed. Consumers must construct their own
  PolicyPack from the new factory exports — see README for
  AWS-consumer and Azure-consumer examples.
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

### ❤️ Thank You

- Claude Opus 4.7 (1M context)
- Lloyd Mangnall @lloydmangnall

## 0.1.2 (2026-04-29)

This was a version bump only for @adaptiveworx/iac-policies to align it with other projects, there were no code changes.

## 0.1.1 (2026-04-29)

This was a version bump only for @adaptiveworx/iac-policies to align it with other projects, there were no code changes.

# Changelog

All notable changes to `@adaptiveworx/iac-policies` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/) once it
reaches `1.0.0`. Until then, breaking changes may land in any `0.x` minor.

## 0.1.0 (unreleased)

Initial publish from the `iac-core` monorepo. First public version on
npm.

### Ships

A Pulumi CrossGuard policy pack with four enforced policies:

- **Required tags** — every taggable resource must carry the canonical
  governance tags (`Environment`, `AccountPurpose`, `StackPurpose`).
- **Regional compliance** — resources are deployed only in approved
  regions per environment + tenant.
- **Security baseline** — secure-by-default enforcement (S3 ACL +
  encryption rules; expand as VPC/RDS/IAM resources land).
- **Deployment protection** — production/security stacks must deploy
  through CI/CD with approval gates, not from a developer machine.

The pack auto-detects context (tenant, environment, account purpose,
stack purpose) from Pulumi project + stack names — no per-stack
configuration required.

### Peer dependencies

- `@pulumi/policy` (>= 1.18)
- `@pulumi/pulumi` (>= 3.150)

### Notes

The package ships as TypeScript source — Pulumi's policy runtime
compiles it on load. No build step.

Developed inside the private `iac-worx` workspace prior to publish; no
artifacts shipped to npm before this version.
