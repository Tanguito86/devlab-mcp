// DevLab capture harness — scene contract validation.
// The harness talks to a page only through the fixed contract below.
// It never evaluates arbitrary JavaScript.

export const CONTRACT_VERSION = 1;

export const CONTRACT_METHODS = [
  "ready",
  "setSeed",
  "setTime",
  "setViewpoint",
  "renderOnce",
  "getMetrics",
];

export class ContractError extends Error {
  constructor(message, code = "CONTRACT_ERROR") {
    super(message);
    this.code = code;
  }
}

export function validateContractValue(value) {
  if (!value || typeof value !== "object") {
    throw new ContractError("missing capture contract: window.__DEVLAB_CAPTURE__", "MISSING_CONTRACT");
  }
  if (value.version !== CONTRACT_VERSION) {
    throw new ContractError(
      `unknown contract version: ${JSON.stringify(value.version)} (expected ${CONTRACT_VERSION})`,
      "UNKNOWN_CONTRACT_VERSION",
    );
  }
  for (const method of CONTRACT_METHODS) {
    if (typeof value[method] !== "function") {
      throw new ContractError(`contract method missing or not a function: ${method}`, "MISSING_METHOD");
    }
  }
  return value;
}

// ---- manifest (fixture-side declaration of viewpoints/variants) ----

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new ContractError("missing capture manifest", "MISSING_MANIFEST");
  }
  if (manifest.version !== 1) {
    throw new ContractError("unknown manifest version", "MANIFEST_VERSION");
  }
  const viewpoints = Array.isArray(manifest.viewpoints) ? manifest.viewpoints : [];
  if (viewpoints.length === 0) {
    throw new ContractError("manifest declares no viewpoints", "NO_VIEWPOINTS");
  }
  const seen = new Set();
  for (const id of viewpoints) {
    if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new ContractError(`invalid viewpoint id: ${JSON.stringify(id)}`, "BAD_VIEWPOINT_ID");
    }
    if (seen.has(id)) {
      throw new ContractError(`duplicate viewpoint id: ${id}`, "DUPLICATE_VIEWPOINT");
    }
    seen.add(id);
  }
  if (typeof manifest.defaultSeed !== "number" || !Number.isFinite(manifest.defaultSeed)) {
    throw new ContractError("manifest defaultSeed must be a finite number", "BAD_DEFAULT_SEED");
  }
  if (typeof manifest.defaultTimeMs !== "number" || !Number.isFinite(manifest.defaultTimeMs)) {
    throw new ContractError("manifest defaultTimeMs must be a finite number", "BAD_DEFAULT_TIME");
  }
  const variants = manifest.variants && typeof manifest.variants === "object" ? manifest.variants : {};
  for (const [name, variant] of Object.entries(variants)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new ContractError(`invalid variant id: ${name}`, "BAD_VARIANT_ID");
    }
    if (!variant || typeof variant !== "object") {
      throw new ContractError(`variant ${name} must be an object`, "BAD_VARIANT");
    }
  }
  return { viewpoints, defaultSeed: manifest.defaultSeed, defaultTimeMs: manifest.defaultTimeMs, variants };
}

// ---- output tag policy (fail-closed, no traversal, no absolute) ----

export function validateOutputTag(tag) {
  if (typeof tag !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(tag)) {
    throw new ContractError(
      `invalid output tag: ${JSON.stringify(tag)} (lowercase alphanumeric + dashes only)`,
      "BAD_OUTPUT_TAG",
    );
  }
  return tag;
}

// ---- metrics schema (finite numbers only) ----

const METRIC_KEYS = [
  "drawCalls",
  "triangles",
  "geometries",
  "textures",
  "programs",
  "seedApplied",
  "timeAppliedMs",
  "viewpointApplied",
];

export function validateSceneMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") {
    throw new ContractError("getMetrics() returned no object", "MALFORMED_METRICS");
  }
  const out = {};
  for (const key of METRIC_KEYS) {
    const value = metrics[key];
    if (key === "viewpointApplied") {
      if (typeof value !== "string") {
        throw new ContractError(`metrics.${key} must be a string`, "MALFORMED_METRICS");
      }
      out[key] = value;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ContractError(
        `metrics.${key} must be a finite number (got ${JSON.stringify(value)})`,
        value !== null && typeof value === "number" && !Number.isFinite(value)
          ? "NON_FINITE_METRIC"
          : "MALFORMED_METRICS",
      );
    }
    out[key] = value;
  }
  return out;
}

export { METRIC_KEYS };
