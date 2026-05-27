// ═══════════════════════════════════════════════
// Workflow contracts — shared across all packages
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
