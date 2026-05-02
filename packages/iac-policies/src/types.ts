/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Compliance framework controls mapping.
 *
 * Annotation type for documenting which compliance framework requirements
 * a given policy satisfies. One policy can satisfy multiple framework
 * controls (e.g. encryption-at-rest covers NIST SC-28, ISO 27001 A.10.1.1,
 * and HIPAA 164.312(a)(2)(iv) simultaneously).
 *
 * Attach via metadata or comments alongside policy definitions; consumers
 * use this when generating compliance reports or audit evidence.
 */
export interface FrameworkControls {
  "NIST-800-53"?: string[];
  ISO27001?: string[];
  HIPAA?: string[];
  "PCI-DSS"?: string[];
  SOC2?: string[];
  FedRAMP?: string[];
  HITRUST?: string[];
}

/**
 * Compliance evidence record for audit trail emission.
 *
 * Future use — the `emitEvidence()` helper is a stub that downstream
 * compliance platforms (Vanta, Drata, etc.) will receive these on a
 * scheduled basis. For now consumers can construct these for their own
 * reporting pipelines.
 */
export interface ComplianceEvidence {
  timestamp: string;
  policyName: string;
  resourceUrn: string;
  result: "pass" | "fail" | "warning";
  frameworks?: string[];
  message: string;
}
