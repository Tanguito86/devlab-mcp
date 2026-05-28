import { readFile, access } from "node:fs/promises";
import path from "node:path";
import type { BrowserProfile, WorkflowStep, Workflow } from "../types.js";

const PROFILES_DIR = "profiles";
const WORKFLOWS_DIR = "workflows";

export async function loadProfile(name: string): Promise<BrowserProfile> {
  const profilePath = path.resolve(process.cwd(), PROFILES_DIR, `${name}.json`);

  try {
    await access(profilePath);
  } catch {
    throw new Error(`Profile "${name}" not found. Expected at: ${profilePath}`);
  }

  const raw = await readFile(profilePath, "utf8");
  const profile = JSON.parse(raw) as BrowserProfile;

  if (!profile.name || !profile.defaultUrl) {
    throw new Error(`Profile "${name}" is missing required fields (name, defaultUrl).`);
  }

  return profile;
}

export async function loadWorkflow(
  profileName: string,
  workflowName: string
): Promise<Workflow> {
  // Try profile-specific workflow first
  const profileWorkflowPath = path.resolve(
    process.cwd(),
    WORKFLOWS_DIR,
    profileName,
    `${workflowName}.json`
  );

  try {
    await access(profileWorkflowPath);
    const raw = await readFile(profileWorkflowPath, "utf8");
    const wf = JSON.parse(raw) as Workflow;
    if (!wf.name || !wf.steps) {
      throw new Error(`Workflow "${workflowName}" for "${profileName}" is missing required fields.`);
    }
    return wf;
  } catch (err) {
    if (err instanceof Error && err.message.includes("missing required fields")) throw err;
  }

  throw new Error(
    `Workflow "${workflowName}" not found for profile "${profileName}". ` +
    `Expected at: ${profileWorkflowPath}`
  );
}

export async function listProfiles(): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const profilesDir = path.resolve(process.cwd(), PROFILES_DIR);

  try {
    const entries = await readdir(profilesDir);
    return entries
      .filter(e => e.endsWith(".json"))
      .map(e => e.replace(".json", ""))
      .sort();
  } catch {
    return [];
  }
}

export async function listWorkflows(profileName: string): Promise<Workflow[]> {
  const { readdir } = await import("node:fs/promises");
  const wfDir = path.resolve(process.cwd(), WORKFLOWS_DIR, profileName);

  try {
    const entries = await readdir(wfDir);
    const workflows: Workflow[] = [];
    for (const entry of entries.filter(e => e.endsWith(".json")).sort()) {
      try {
        const raw = await readFile(path.join(wfDir, entry), "utf8");
        workflows.push(JSON.parse(raw) as Workflow);
      } catch { /* skip malformed */ }
    }
    return workflows;
  } catch {
    return [];
  }
}
