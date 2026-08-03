import assert from "node:assert/strict";
import test from "node:test";

import {
  validateContractValue,
  validateManifest,
  validateOutputTag,
  validateSceneMetrics,
  ContractError,
} from "../scripts/capture-harness/contract.js";

const validContract = {
  version: 1,
  ready: async () => {},
  setSeed: async () => {},
  setTime: async () => {},
  setViewpoint: async () => {},
  renderOnce: async () => {},
  getMetrics: async () => ({}),
};

test("valid contract passes", () => {
  assert.equal(validateContractValue(validContract), validContract);
});

test("missing contract fails closed", () => {
  assert.throws(() => validateContractValue(null), (e) => e instanceof ContractError && e.code === "MISSING_CONTRACT");
  assert.throws(() => validateContractValue(undefined), (e) => e.code === "MISSING_CONTRACT");
  assert.throws(() => validateContractValue("nope"), (e) => e.code === "MISSING_CONTRACT");
});

test("wrong contract version fails closed", () => {
  assert.throws(
    () => validateContractValue({ ...validContract, version: 2 }),
    (e) => e.code === "UNKNOWN_CONTRACT_VERSION",
  );
  assert.throws(
    () => validateContractValue({ ...validContract, version: "1" }),
    (e) => e.code === "UNKNOWN_CONTRACT_VERSION",
  );
});

test("missing contract methods fail closed", () => {
  for (const method of ["ready", "setSeed", "setTime", "setViewpoint", "renderOnce", "getMetrics"]) {
    const broken = { ...validContract };
    delete broken[method];
    assert.throws(() => validateContractValue(broken), (e) => e.code === "MISSING_METHOD", method);
    assert.throws(
      () => validateContractValue({ ...validContract, [method]: 42 }),
      (e) => e.code === "MISSING_METHOD",
      `${method} not a function`,
    );
  }
});

test("manifest: valid manifest passes; unknown viewpoint rejected at capture level", () => {
  const manifest = validateManifest({
    version: 1,
    viewpoints: ["overview", "instancing"],
    defaultSeed: 1729,
    defaultTimeMs: 2500,
  });
  assert.deepEqual(manifest.viewpoints, ["overview", "instancing"]);
});

test("manifest: duplicate viewpoint IDs fail closed", () => {
  assert.throws(
    () => validateManifest({ version: 1, viewpoints: ["a", "a"], defaultSeed: 1, defaultTimeMs: 1 }),
    (e) => e.code === "DUPLICATE_VIEWPOINT",
  );
});

test("manifest: malformed viewpoint ids fail closed", () => {
  for (const bad of ["", "A", "a b", "a/b", "a_b", "../x", "1abc"]) {
    assert.throws(
      () => validateManifest({ version: 1, viewpoints: [bad], defaultSeed: 1, defaultTimeMs: 1 }),
      (e) => e.code === "BAD_VIEWPOINT_ID",
      JSON.stringify(bad),
    );
  }
});

test("manifest: native WebGPU requirement is explicit and fail-closed", () => {
  const base = { version: 1, viewpoints: ["overview"], defaultSeed: 1, defaultTimeMs: 1 };
  assert.equal(validateManifest({ ...base, requiresNativeWebGPU: true }).requiresNativeWebGPU, true);
  assert.equal(validateManifest(base).requiresNativeWebGPU, false);
  assert.throws(
    () => validateManifest({ ...base, requiresNativeWebGPU: false }),
    (error) => error.code === "BAD_NATIVE_WEBGPU_REQUIREMENT",
  );
});

test("manifest: empty viewpoints, bad seed, bad time fail closed", () => {
  assert.throws(() => validateManifest({ version: 1, viewpoints: [], defaultSeed: 1, defaultTimeMs: 1 }), (e) => e.code === "NO_VIEWPOINTS");
  assert.throws(() => validateManifest({ version: 1, viewpoints: ["a"], defaultSeed: NaN, defaultTimeMs: 1 }), (e) => e.code === "BAD_DEFAULT_SEED");
  assert.throws(() => validateManifest({ version: 1, viewpoints: ["a"], defaultSeed: 1, defaultTimeMs: Infinity }), (e) => e.code === "BAD_DEFAULT_TIME");
});

test("manifest: affected viewpoint declarations are unique subsets", () => {
  const base = { version: 1, viewpoints: ["a", "b"], defaultSeed: 1, defaultTimeMs: 1 };
  assert.deepEqual(
    validateManifest({ ...base, seedAffectedViewpoints: ["a"], timeAffectedViewpoints: ["a", "b"] })
      .seedAffectedViewpoints,
    ["a"],
  );
  assert.throws(
    () => validateManifest({ ...base, seedAffectedViewpoints: ["a", "a"] }),
    (e) => e.code === "BAD_AFFECTED_VIEWPOINTS",
  );
  assert.throws(
    () => validateManifest({ ...base, seedAffectedViewpoints: ["unknown"] }),
    (e) => e.code === "BAD_AFFECTED_VIEWPOINTS",
  );
});

test("output tag: traversal and absolute paths fail closed", () => {
  for (const bad of ["../escape", "a/../b", "/abs", "C:/abs", "a\\b", "", "UPPER", "a b", ".hidden"]) {
    assert.throws(() => validateOutputTag(bad), (e) => e.code === "BAD_OUTPUT_TAG", JSON.stringify(bad));
  }
  assert.equal(validateOutputTag("run-a"), "run-a");
  assert.equal(validateOutputTag("resize-960x540"), "resize-960x540");
});

test("metrics: malformed and non-finite values fail closed", () => {
  const base = { drawCalls: 10, triangles: 100, geometries: 2, textures: 3, programs: 1, seedApplied: 1, timeAppliedMs: 1, viewpointApplied: "a" };
  assert.deepEqual(validateSceneMetrics(base), base);
  assert.throws(() => validateSceneMetrics(null), (e) => e.code === "MALFORMED_METRICS");
  assert.throws(() => validateSceneMetrics({ ...base, drawCalls: NaN }), (e) => e.code === "NON_FINITE_METRIC");
  assert.throws(() => validateSceneMetrics({ ...base, triangles: Infinity }), (e) => e.code === "NON_FINITE_METRIC");
  assert.throws(() => validateSceneMetrics({ ...base, seedApplied: "1729" }), (e) => e.code === "MALFORMED_METRICS");
  assert.throws(() => validateSceneMetrics({ ...base, viewpointApplied: 1 }), (e) => e.code === "MALFORMED_METRICS");
  assert.throws(() => validateSceneMetrics({ ...base, drawCalls: undefined }), (e) => e.code === "MALFORMED_METRICS");
});
