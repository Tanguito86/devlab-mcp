// ═══════════════════════════════════════════════
// Evidence / session metadata — base contracts
// ═══════════════════════════════════════════════

/**
 * Base session metadata shared across all DevLab MCP packages.
 * Each package extends this with runtime-specific fields.
 */
export type BaseSessionMetadata = {
  name: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  stepCount: number;
};

/**
 * Base evidence entry recorded per workflow step.
 */
export type BaseEvidenceEntry = {
  step: number;
  timestamp: string;
  ok: boolean;
  output: string;
};
