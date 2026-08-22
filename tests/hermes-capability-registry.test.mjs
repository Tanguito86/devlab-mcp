import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = JSON.parse(readFileSync(new URL("../capabilities/hermes-capability-manifest.json", import.meta.url), "utf8"));
const gmAdapter = JSON.parse(readFileSync(new URL("../capabilities/gm-ide-adapter-v1.json", import.meta.url), "utf8"));
const gmMcp = JSON.parse(readFileSync(new URL("../capabilities/gamemaker-dev-mcp-v1.json", import.meta.url), "utf8"));
const assetBridge = JSON.parse(readFileSync(new URL("../capabilities/asset-gm-bridge-v1.json", import.meta.url), "utf8"));
const kit = JSON.parse(readFileSync(new URL("../capabilities/topdown-shooter-kit-v1.json", import.meta.url), "utf8"));
const external = JSON.parse(readFileSync(new URL("../capabilities/external-candidate-status.json", import.meta.url), "utf8"));

test("capability registry has the exact governed capability set", () => {
  assert.equal(registry.capabilities.length, 16);
  assert.equal(new Set(registry.capabilities.map(({ id }) => id)).size, 16);
  for (const capability of registry.capabilities) {
    assert.ok(registry.allowedStatuses.includes(capability.status));
    for (const field of ["source", "sourcePin", "license", "evidencePath", "authority", "integrationMode", "runtimeStatus", "securityStatus", "nextPermittedAction"]) assert.equal(typeof capability[field], "string");
    assert.match(capability.evidenceSha256, /^[0-9a-f]{64}$/);
    const evidence = readFileSync(new URL("../" + capability.evidencePath, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    assert.equal(createHash("sha256").update(evidence).digest("hex"), capability.evidenceSha256);
    assert.ok(Array.isArray(capability.prohibitedActions));
  }
});

test("GameMaker MCP registry exposes only the local read-only stdio slice", () => {
  assert.equal(gmMcp.package, "@tanguito/gamemaker-dev-mcp");
  assert.equal(gmMcp.transport, "STDIO");
  assert.deepEqual(gmMcp.publicTools, ["gamemaker_status", "gamemaker_inspect", "gamemaker_plan"]);
  assert.deepEqual(gmMcp.internalCapabilities, ["GM_STATUS_V1", "GM_INSPECT_V1", "GM_PLAN_V1"]);
  assert.equal(gmMcp.mode, "READ_ONLY_AND_PLAN_ONLY");
  assert.equal(gmMcp.writeTools, 0);
  assert.equal(gmMcp.resources, 0);
  assert.equal(gmMcp.prompts, 0);
  assert.deepEqual(gmMcp.dependencies, ["@tanguito/devlab-gm-ide-adapter"]);
  assert.equal(gmMcp.runtimeStatus, "LOCAL_VERIFIED");
  assert.equal(gmMcp.productionVerified, false);
  assert.equal(gmMcp.assetBridgeAvailable, false);
  assert.equal(gmMcp.networkAccess, false);
  assert.equal(gmMcp.persistentState, false);
  assert.doesNotThrow(() => readFileSync(new URL("../" + gmMcp.inputSchema, import.meta.url), "utf8"));
  const entry = registry.capabilities.find(({ id }) => id === "GAMEMAKER_MCP_READONLY_V1");
  assert.ok(entry);
  assert.equal(entry.status, "LOCAL_VERIFIED");
  assert.equal(entry.integrationMode, "STDIO_MCP_SERVER");
  assert.ok(entry.prohibitedActions.includes("write tools"));
  assert.ok(entry.prohibitedActions.includes("Asset-GM Bridge exposure"));
});

test("GameMaker registry exposes exactly six governed capabilities and no Hermes tools", () => {
  const expected = ["GM_STATUS_V1", "GM_INSPECT_V1", "GM_PLAN_V1", "GM_APPLY_SAFE_V1", "GM_VERIFY_V1", "GM_ROLLBACK_V1"];
  assert.deepEqual(gmAdapter.publicCapabilities, expected);
  assert.equal(gmAdapter.publicHermesTools, 0);
  assert.equal(gmAdapter.errorTypes.length, 23);
  assert.equal(gmAdapter.destructiveEnabled, false);
  assert.equal(gmAdapter.hermesRuntimeDependency, false);
  assert.deepEqual(registry.capabilities.filter(({ id }) => id.startsWith("GM_")).map(({ id }) => id), expected);
  assert.doesNotThrow(() => readFileSync(new URL("../" + gmAdapter.inputSchema, import.meta.url), "utf8"));
});

test("external candidates remain uninstalled and outside the kit", () => {
  assert.equal(external.r3f.installed, false); assert.equal(external.r3f.topdownKitDependency, false);
  assert.equal(external.img2threejs.installed, false); assert.equal(external.img2threejs.status, "PRODUCTION_CAPABILITY_VERIFIED"); assert.equal(external.img2threejs.blockers.length, 0);
  assert.equal(external.img2threejs.upstreamCopiesModified, 0);
  assert.deepEqual(kit.runtimeDependencies, []);
});

test("ASSET_GM_BRIDGE_V1 is a governed composition of ASSET_FORGE + GM_ADAPTER", () => {
  assert.deepEqual(assetBridge.publicCapabilities, ["ASSET_GM_BRIDGE_V1"]);
  assert.equal(assetBridge.publicHermesTools, 0);
  assert.equal(assetBridge.destructiveEnabled, false);
  assert.equal(assetBridge.hermesRuntimeDependency, false);
  assert.equal(assetBridge.offlineRuntime, true);
  assert.deepEqual(assetBridge.dependencies, ["ASSET_FORGE", "GM_ADAPTER"]);
  assert.equal(assetBridge.errorTypes.length, 16);
  for (const code of ["ASSET_NOT_APPROVED", "STALE_OR_TAMPERED_PLAN", "VERIFY_COMPILE_FAILED", "VERIFY_RUNTIME_FAILED"]) assert.ok(assetBridge.errorTypes.includes(code));
  assert.doesNotThrow(() => readFileSync(new URL("../" + assetBridge.inputSchema, import.meta.url), "utf8"));
  const entry = registry.capabilities.find(({ id }) => id === "ASSET_GM_BRIDGE_V1");
  assert.ok(entry, "ASSET_GM_BRIDGE_V1 must be registered in the manifest");
  assert.equal(entry.status, "INTEGRATED");
  // The bridge never exposes raw GameMaker/Igor/Asset Forge tools to its callers.
  assert.deepEqual(entry.prohibitedActions, ["raw GameMaker/Igor/Asset Forge tool exposure", "implicit toolchain", "implicit work root", "publish without authorization"]);
});

test("kit manifest contains every mandatory module without game content", () => {
  for (const module of ["simulation", "input", "combat", "pooling", "encounters", "spawning", "checkpoints", "boss-fsm", "lifecycle", "capture", "testing", "contracts"]) assert.ok(kit.modules.includes(module));
  assert.ok(kit.contentExclusions.length >= 8);
});
