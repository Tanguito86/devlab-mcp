import assert from "node:assert/strict";
import test from "node:test";
import * as publicApi from "../dist/index.js";
import { createReviewCoordinator, disposeModel } from "../dist/index.js";

const sha = "a".repeat(64); const inputSha = "b".repeat(64);
function workflow(id = "review-1") { return createReviewCoordinator(id, new Uint8Array(32).fill(id === "review-1" ? 1 : 2)); }
function artifact(flow = workflow()) { return flow.builder.createArtifact({ id: "asset-1", relativePath: "assets/model.ts", sha256: sha, inputsHash: inputSha }); }

test("builder port cannot report or approve and raw role constructors are not exported", () => {
  const flow = workflow(); const value = artifact(flow); assert.equal(value.role, "BUILDER_OUTPUT"); assert.equal("status" in value, false);
  assert.deepEqual(Object.keys(flow.builder), ["createArtifact"]); assert.equal("createCriticReport" in publicApi, false); assert.equal("resolveCriticReport" in publicApi, false);
  assert.throws(() => { value.id = "mutated"; }, TypeError);
  const injected = flow.builder.createArtifact({ id: "asset-2", relativePath: "assets/other.ts", sha256: sha, inputsHash: inputSha, status: "APPROVED", role: "RESOLVER_OUTPUT" }); assert.equal("status" in injected, false); assert.equal(injected.role, "BUILDER_OUTPUT");
});

test("critic evidence is mandatory, immutable, closed, and bound to full artifact identity", () => {
  const flow = workflow(); const value = artifact(flow);
  assert.throws(() => flow.critic.createReport(value, "security", [{ severity: "REQUIRED", category: "SECURITY", code: "R1", message: "fix", evidence: [] }]), /evidence/);
  assert.throws(() => flow.critic.createReport(value, "security", [{ severity: "CRITICAL", category: "SECURITY", code: "R2", message: "fix", evidence: ["test"] }]), /severity/);
  assert.throws(() => flow.critic.createReport(value, "security", [{ severity: "REQUIRED", category: "OTHER", code: "R3", message: "fix", evidence: ["test"] }]), /category/);
  const report = flow.critic.createReport(value, "security", [{ severity: "OPTIONAL", category: "TECHNICAL", code: "O1", message: "note", evidence: ["test:12"] }]);
  assert.equal(report.artifactBinding, value.artifactBinding); assert.throws(() => { report.findings[0].code = "changed"; }, TypeError);
});

test("resolver policy maps BLOCKER, REQUIRED, and OPTIONAL exactly", () => {
  const flow = workflow(); const value = artifact(flow);
  const make = (severity) => flow.critic.createReport(value, "critic", [{ severity, category: "PRODUCT", code: severity, message: "finding", evidence: ["evidence"] }]);
  assert.equal(flow.resolver.resolve(value, make("BLOCKER")).status, "BLOCKED");
  assert.equal(flow.resolver.resolve(value, make("REQUIRED")).status, "CHANGES_REQUIRED");
  assert.equal(flow.resolver.resolve(value, make("OPTIONAL")).status, "APPROVED");
  assert.equal(flow.resolver.resolve(value, flow.critic.createReport(value, "critic", [])).status, "APPROVED");
});

test("resolver rejects reports from another session and fabricated reports", () => {
  const flow = workflow(); const value = artifact(flow); const otherFlow = workflow("review-2"); const report = flow.critic.createReport(value, "critic", []);
  assert.throws(() => otherFlow.resolver.resolve(artifact(otherFlow), report), /session|binding/);
  assert.throws(() => flow.resolver.resolve(value, { ...report, findings: [{ severity: "CRITICAL", category: "SECURITY", code: "X", message: "fake", evidence: ["fake"] }], signature: "0".repeat(64) }), /signature|severity/);
});

test("disposeModel honors ownership, deduplicates resources, and is idempotent", () => {
  let owned = 0; let shared = 0; let external = 0; let mixer = 0; let listener = 0; let detached = 0;
  const ownedResource = { dispose: () => owned += 1 };
  const model = {
    root: {},
    resources: [
      { category: "geometry", ownership: "OWNED", resource: ownedResource },
      { category: "geometry", ownership: "OWNED", resource: ownedResource },
      { category: "texture", ownership: "SHARED", resource: { dispose: () => shared += 1 } },
      { category: "custom", ownership: "EXTERNAL", resource: { dispose: () => external += 1 } },
    ],
    mixers: [{ stopAllAction: () => mixer += 1, uncacheRoot: () => mixer += 1 }],
    listeners: [{ remove: () => listener += 1 }], sceneReferences: [{ detach: () => detached += 1 }],
  };
  const first = disposeModel(model); const second = disposeModel(model);
  assert.deepEqual([owned, shared, external, mixer, listener, detached], [1, 0, 0, 2, 1, 1]);
  assert.equal(first.disposed.geometry, 1); assert.equal(first.skippedShared, 1); assert.equal(first.skippedExternal, 1); assert.equal(second.alreadyDisposed, true);
});

test("disposal accumulates errors and continues through every category", () => {
  let later = 0; const model = { root: {}, resources: [
    { category: "material", ownership: "OWNED", resource: { dispose() { throw new Error("broken material"); } } },
    { category: "renderTarget", ownership: "OWNED", resource: { dispose() { later += 1; } } },
    { category: "skeleton", ownership: "OWNED", resource: { dispose() { later += 1; } } },
  ] };
  const report = disposeModel(model); assert.equal(later, 2); assert.equal(report.errors.length, 1); assert.match(report.errors[0], /broken material/);
});

test("failed resources remain retryable and root identity prevents double-dispose across wrappers", () => {
  const root = {}; let attempts = 0; const resource = { dispose() { attempts += 1; if (attempts === 1) throw new Error("transient"); } };
  const first = disposeModel({ root, resources: [{ category: "geometry", ownership: "OWNED", resource }] }); assert.equal(first.errors.length, 1); assert.equal(first.alreadyDisposed, false);
  const second = disposeModel({ root, resources: [{ category: "geometry", ownership: "OWNED", resource }] }); assert.equal(second.errors.length, 0); assert.equal(second.disposed.geometry, 1);
  const third = disposeModel({ root, resources: [{ category: "geometry", ownership: "OWNED", resource }] }); assert.equal(third.alreadyDisposed, true); assert.equal(attempts, 2);
});

test("empty models have a defined idempotent lifecycle", () => {
  const root = {}; assert.equal(disposeModel({ root }).alreadyDisposed, false); assert.equal(disposeModel({ root }).alreadyDisposed, true);
});

test("100 create/dispose cycles leave no live owned resources", () => {
  let live = 0; let peak = 0;
  for (let cycle = 0; cycle < 100; cycle += 1) {
    live += 6; peak = Math.max(peak, live);
    const resources = ["geometry", "material", "texture", "renderTarget", "skeleton", "custom"].map((category) => ({ category, ownership: "OWNED", resource: { dispose: () => live -= 1 } }));
    const report = disposeModel({ root: {}, resources }); assert.equal(report.errors.length, 0); assert.equal(live, 0);
  }
  assert.equal(peak, 6); assert.equal(live, 0);
});
