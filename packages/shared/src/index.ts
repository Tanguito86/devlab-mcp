import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ═══════════════════════════════════════════════
// MCP Tool Helpers
// ═══════════════════════════════════════════════

export type RegisterTool = (server: McpServer) => void;

export function textResponse(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ]
  };
}

// ═══════════════════════════════════════════════
// Path & ID Helpers
// ═══════════════════════════════════════════════

export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "session";
}

export function validateSessionId(sessionId: string): void {
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("sessionId is required and must be a string.");
  }
  if (sessionId.includes("..") || sessionId.includes("/") || sessionId.includes("\\")) {
    throw new Error(`Invalid sessionId: "${sessionId}". Path traversal not allowed.`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error(`Invalid sessionId: "${sessionId}". Only alphanumeric, hyphens, underscores allowed.`);
  }
}

export function timestampForPath(): string {
  return new Date().toISOString().replace(/:/g, "_").replace(/\..+/, "");
}

// ═══════════════════════════════════════════════
// Evidence Schemas (Zod)
// ═══════════════════════════════════════════════

export const EvidenceEntrySchema = z.object({
  step: z.number().int().min(0),
  timestamp: z.string(),
  tool: z.string(),
  screenshot: z.string().optional(),
  logs: z.string().optional(),
  ok: z.boolean(),
  output: z.string()
});

export const SessionMetadataSchema = z.object({
  name: z.string(),
  sessionId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  profile: z.string().optional(),
  url: z.string().optional(),
  stepCount: z.number().int().min(0),
  ok: z.boolean()
});

// ═══════════════════════════════════════════════
// Workflow Contracts
// ═══════════════════════════════════════════════

export type WorkflowStep = {
  tool: string;
  args?: Record<string, unknown>;
  description?: string;
};

export type Workflow = {
  name: string;
  description: string;
  steps: WorkflowStep[];
};

export type StepResult = {
  index: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
  output: string;
  screenshot?: string;
};

export type WorkflowExecution = {
  profile: string;
  workflow: string;
  reportDir: string;
  sessionId?: string;
  ok: boolean;
  start: string;
  end: string;
  durationMs: number;
  steps: StepResult[];
};

// ═══════════════════════════════════════════════
// Profile base
// ═══════════════════════════════════════════════

export type BaseProfile = {
  name: string;
  type: string;
  defaultUrl?: string;
};
