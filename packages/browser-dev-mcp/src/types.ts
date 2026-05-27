import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ── Re-exported from shared ──
export { textResponse, type RegisterTool } from "@tanguito/devlab-shared";
export type { WorkflowStep, Workflow, StepResult } from "@tanguito/devlab-shared";

// ── Browser-specific profile types ──

export type BrowserProfile = {
  name: string;
  type: "web-canvas-game" | "web-app" | "web-site";
  defaultUrl: string;
  canvasSelector?: string;
  debugHooks?: Record<string, string>;
  viewport?: { width: number; height: number };
};

// ── Browser-specific evidence types ──

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

// ── Browser-specific workflow execution ──

export type WorkflowExecution = {
  profile: string;
  workflow: string;
  reportDir: string;
  sessionId?: string;
  ok: boolean;
  start: string;
  end: string;
  durationMs: number;
  steps: import("@tanguito/devlab-shared").StepResult[];
};
