/**
 * AdaptiveWorX™
 * Copyright (c) 2023-2026 Adaptive Intelligence, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComplianceEvidence } from "./types.js";

/**
 * Emit a compliance evidence record.
 *
 * Currently a no-op stub — reserved for future integration with audit
 * platforms (Vanta, Drata, etc.). Consumers can call this from inside
 * policy `validateResource` / `validateStack` callbacks to mark
 * pass/fail/warning observations; downstream the records will route to
 * a configured backend.
 *
 * @param _evidence A complete `ComplianceEvidence` record describing
 *   the observation.
 */
export function emitEvidence(_evidence: ComplianceEvidence): void {
  // Future implementation: emit to compliance platform.
}
