import path from "node:path";
import { contractError } from "./errors.js";
import type { AppProfile, WorkflowStep } from "./appProfiles.js";

export function assertStringField(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw contractError("validation", `${name} must be a non-empty string.`);
  }
}

export function validateAppProfile(app: string, profile: AppProfile | undefined): AppProfile {
  if (!profile) {
    throw contractError("validation", `Unknown app profile "${app}".`);
  }

  assertStringField(`App profile "${app}" package`, profile.package);
  assertStringField(`App profile "${app}" activity`, profile.activity);

  if (profile.logTags !== undefined && !Array.isArray(profile.logTags)) {
    throw contractError("validation", `App profile "${app}" logTags must be an array.`);
  }

  if (profile.workflows !== undefined && (typeof profile.workflows !== "object" || profile.workflows === null)) {
    throw contractError("validation", `App profile "${app}" workflows must be an object.`);
  }

  return profile;
}

export function validateWorkflowName(workflow: unknown): string {
  assertStringField("workflow", workflow);
  return workflow;
}

export function validateWorkflowStepShape(step: unknown, index: number): WorkflowStep {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    throw contractError("workflow", `Workflow step ${index} must be an object.`);
  }

  const candidate = step as Partial<WorkflowStep>;
  assertStringField(`Workflow step ${index} tool`, candidate.tool);

  if (candidate.args !== undefined && (typeof candidate.args !== "object" || candidate.args === null || Array.isArray(candidate.args))) {
    throw contractError("workflow", `Workflow step ${index} args must be an object.`);
  }

  return candidate as WorkflowStep;
}

export function validateTimeoutSec(value: unknown, defaultValue: number, maxValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maxValue) {
    throw contractError("validation", `timeoutSec must be a number between 1 and ${maxValue}.`);
  }

  return value;
}

export function validateIntervalMs(value: unknown, defaultValue: number, maxValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maxValue) {
    throw contractError("validation", `intervalMs must be a number between 1 and ${maxValue}.`);
  }

  return value;
}

export function validateCoordinate(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw contractError("validation", `${name} must be a non-negative number.`);
  }

  return value;
}

export function validateCoordinates(values: Record<string, unknown>, keys: string[]): void {
  keys.forEach((key) => validateCoordinate(key, values[key]));
}

export function validateDeviceIdFormat(deviceId?: string): string | undefined {
  if (deviceId === undefined) {
    return undefined;
  }

  assertStringField("deviceId", deviceId);
  return deviceId;
}

export function validateOutputPath(outputPath?: string): string | undefined {
  if (outputPath === undefined) {
    return undefined;
  }

  assertStringField("outputPath", outputPath);

  if (path.isAbsolute(outputPath)) {
    throw contractError("validation", "outputPath must be relative to the project directory.");
  }

  if (outputPath.split(/[\\/]/).includes("..")) {
    throw contractError("validation", "outputPath must not contain parent directory segments.");
  }

  return outputPath;
}
