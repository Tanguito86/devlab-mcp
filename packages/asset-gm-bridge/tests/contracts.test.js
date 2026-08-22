import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ASSET_GM_BRIDGE_CAPABILITY, ASSET_GM_BRIDGE_CAPABILITY_CONTRACT, ASSET_GM_BRIDGE_VERSION,
  GovernedAssetGmBridge, bridgeErrorCodes,
} from "../dist/index.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const schema = JSON.parse(readFileSync(new URL("../schemas/asset-gm-bridge-v1.schema.json", import.meta.url), "utf8"));

test("capability contract: one small versioned public capability", () => {
  assert.equal(ASSET_GM_BRIDGE_CAPABILITY, "ASSET_GM_BRIDGE_V1");
  assert.equal(ASSET_GM_BRIDGE_VERSION, "1.2.0");
  assert.equal(ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.publicCapabilities.length, 1);
  assert.equal(ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.publicCapabilities[0], ASSET_GM_BRIDGE_CAPABILITY);
  assert.equal(ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.publicHermesTools, 0);
  assert.equal(ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.destructiveEnabled, false);
  assert.equal(ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.offlineRuntime, true);
  assert.equal(ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.hermesRuntimeDependency, false);
  assert.deepEqual(ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.dependencies, ["ASSET_FORGE", "GM_ADAPTER"]);
  assert.ok(ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.actionGate.includes("SAFE_WRITE"));
  assert.ok(!ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.actionGate.includes("DESTRUCTIVE"));
});

test("public error vocabulary is closed and matches the contract", () => {
  const expected = [
    "ASSET_NOT_APPROVED", "ASSET_NOT_FOUND", "ASSET_HASH_MISMATCH", "ASSET_BUDGET_EXCEEDED",
    "INVALID_ASSET_MANIFEST", "TARGET_PROJECT_MISMATCH", "TARGET_SNAPSHOT_CHANGED",
    "STALE_OR_TAMPERED_PLAN", "PATH_NOT_ALLOWED", "RESOURCE_COLLISION", "CASE_COLLISION",
    "APPLY_FAILED_RECOVERED", "APPLY_FAILED_RECOVERY_REQUIRED", "ROLLBACK_BLOCKED_CONCURRENT_CHANGE",
    "VERIFY_COMPILE_FAILED", "VERIFY_RUNTIME_FAILED",
  ];
  assert.deepEqual([...ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.errors].sort(), [...expected].sort());
  assert.equal(new Set(bridgeErrorCodes).size, bridgeErrorCodes.length);
});

test("input schema is valid JSON Schema and admits the request kinds", () => {
  assert.equal(schema.$defs.capability.const, ASSET_GM_BRIDGE_CAPABILITY);
  for (const kind of ["inspectAssetRequest", "inspectTargetRequest", "planRequest", "applyRequest", "verifyRequest", "rollbackRequest"]) {
    assert.ok(schema.$defs[kind], `missing ${kind}`);
  }
  assert.equal(schema.$defs.applyRequest.allOf[1].properties.confirm.const, true);
  assert.equal("faultAt" in schema.$defs.applyRequest.allOf[1].properties, false, "fault injection must not be public");
  assert.equal(schema.$defs.rollbackRequest.allOf[1].properties.confirm.const, true);
});

test("public surface exposes no raw tools", () => {
  const prototype = GovernedAssetGmBridge.prototype;
  const methods = Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor").sort();
  // The class shape is exactly the seven public operations plus the
  // TypeScript-private plumbing helpers (TS `private` methods are present on
  // the prototype at runtime). Any new method must be reviewed: the bridge
  // exposes no filesystem / GameMaker / Igor / Asset Forge raw tool.
  assert.deepEqual(methods, [
    "applyImport", "assertAssetApproved", "bridgeEvidenceRoot", "catalogEntry", "gate",
    "inspectAsset", "inspectTarget", "loadBindingChain", "loadCatalog", "planImport",
    "readAssetFiles", "readTargetProject", "rollbackImport", "status", "verifyImport", "writeStable",
  ]);
  const rawTool = /^(fs|exec|spawn|run|shell|adb|igor|gameMaker|delete|remove|rename|writeFile|readFile|mkdir|open|kill|launch)/i;
  assert.equal(methods.filter((name) => rawTool.test(name)).length, 0);
});
