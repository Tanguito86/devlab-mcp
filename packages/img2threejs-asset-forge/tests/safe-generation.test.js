import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalJson, generateSafeFactoryModule, safeIdentifier, validateSafeIdentifier } from "../dist/index.js";

const base = { exportName: "createRelayDrone", assetId: "relay/drone", symbols: ["body", "rotor"], components: [{ id: "body", label: "safe" }], metadata: { z: 2, a: 1 } };

test("safe factory generation is deterministic and canonical", () => {
  const left = generateSafeFactoryModule(base);
  const right = generateSafeFactoryModule({ ...base, metadata: { a: 1, z: 2 } });
  assert.equal(left, right);
  assert.ok(left.includes('{"assetId":"relay/drone","components"'));
  assert.ok(!left.includes("eval(") && !left.includes("new Function"));
});

test("hostile strings are rejected before source emission", () => {
  for (const hostile of ['";\nprocess.exit(1);\n//', "${globalThis}", "`template injection`", "../../outside", "C:\\outside", "/absolute", "constructor", "__proto__", "default"]) {
    assert.throws(() => generateSafeFactoryModule({ ...base, assetId: hostile }), /hostile|reserved|dangerous|policy/);
  }
});

test("identifier policy rejects reserved, non-ASCII, traversal, NUL, and oversized values", () => {
  for (const hostile of ["constructor", "__proto__", "default", "eval", "arguments", "../../outside", "bad-name", "área", "x\0y", "", "a".repeat(65)]) {
    assert.throws(() => validateSafeIdentifier(hostile));
  }
  assert.equal(validateSafeIdentifier("$safe_9"), "$safe_9");
  assert.deepEqual(safeIdentifier("default"), { ok: false, reason: "identifier is reserved or dangerous" });
});

test("symbol collisions and dangerous object keys fail closed", () => {
  assert.throws(() => generateSafeFactoryModule({ ...base, symbols: ["body", "body"] }), /collide/);
  assert.throws(() => generateSafeFactoryModule({ ...base, symbols: [base.exportName] }), /collide/);
  const poisoned = Object.create(null); poisoned.__proto__ = "bad";
  assert.throws(() => canonicalJson(poisoned), /dangerous/);
});

test("numeric policy rejects non-finite values and negative zero", () => {
  for (const value of [NaN, Infinity, -Infinity, 1e309]) assert.throws(() => canonicalJson({ value }), /finite/);
  assert.throws(() => canonicalJson({ value: -0 }), /negative zero/);
});

test("NUL and 100k-character strings are rejected", () => {
  assert.throws(() => canonicalJson("x\0y"), /NUL/);
  assert.throws(() => canonicalJson("x".repeat(100_000)), /exceeds/);
});

test("canonicalization rejects deep, wide, exotic, symbolic, and accessor inputs before serialization", () => {
  let deep = {}; let cursor = deep; for (let index = 0; index < 40; index += 1) { cursor.child = {}; cursor = cursor.child; }
  assert.throws(() => canonicalJson(deep), /depth/);
  assert.throws(() => canonicalJson(new Array(10_001).fill(0)), /length/);
  assert.throws(() => canonicalJson(new Date()), /plain/);
  assert.throws(() => canonicalJson({ [Symbol("hidden")]: 1 }), /symbol/);
  const accessor = {}; Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 }); assert.throws(() => canonicalJson(accessor), /accessor/);
});

test("generated safe module compiles with the pinned workspace TypeScript", () => {
  const directory = mkdtempSync(join(tmpdir(), "devlab-safe-ts-"));
  try {
    const source = join(directory, "generated.ts"); writeFileSync(source, generateSafeFactoryModule(base), "utf8");
    const tsc = resolve("node_modules", "typescript", "bin", "tsc");
    const result = spawnSync(process.execPath, [tsc, "--ignoreConfig", "--noEmit", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", source], { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
