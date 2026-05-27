import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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

// ── Profile types ──

export type BrowserProfile = {
  name: string;
  type: "web-canvas-game" | "web-app" | "web-site";
  defaultUrl: string;
  canvasSelector?: string;
  debugHooks?: Record<string, string>;
  viewport?: { width: number; height: number };
};

// ── Workflow types ──

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

// ── Evidence types ──

export type EvidenceEntry = {
  step: number;
  timestamp: string;
  tool: string;
  screenshot?: string;
  logs?: string;
  ok: boolean;
  output: string;
};

export type SessionMetadata = {
  name: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  profile?: string;
  url?: string;
  stepCount: number;
  ok: boolean;
};

// ── Workflow execution result ──

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
