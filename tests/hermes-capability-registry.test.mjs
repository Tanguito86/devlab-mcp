import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = JSON.parse(readFileSync(new URL("../capabilities/hermes-capability-manifest.json", import.meta.url), "utf8"));
const gmAdapter = JSON.parse(readFileSync(new URL("../capabilities/gm-ide-adapter-v1.json", import.meta.url), "utf8"));
const gmMcp = JSON.parse(readFileSync(new URL("../capabilities/gamemaker-dev-mcp-v1.json", import.meta.url), "utf8"));
const gmWriteMcp = JSON.parse(readFileSync(new URL("../capabilities/gamemaker-write-mcp-v1.json", import.meta.url), "utf8"));
const gmBuildMcp = JSON.parse(readFileSync(new URL("../capabilities/gamemaker-compile-mcp-v1.json", import.meta.url), "utf8"));
const asepriteIngest = JSON.parse(readFileSync(new URL("../capabilities/aseprite-ingest-v1.json", import.meta.url), "utf8"));
const assetBridge = JSON.parse(readFileSync(new URL("../capabilities/asset-gm-bridge-v1.json", import.meta.url), "utf8"));
const kit = JSON.parse(readFileSync(new URL("../capabilities/topdown-shooter-kit-v1.json", import.meta.url), "utf8"));
const external = JSON.parse(readFileSync(new URL("../capabilities/external-candidate-status.json", import.meta.url), "utf8"));

test("capability registry has the exact governed capability set", () => {
  assert.equal(registry.capabilities.length, 19);
  assert.equal(new Set(registry.capabilities.map(({ id }) => id)).size, 19);
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
  assert.deepEqual(gmMcp.publicTools, [
    "gamemaker_status", "gamemaker_inspect", "gamemaker_plan",
    "gamemaker_plan_new_script", "gamemaker_plan_new_object",
    "gamemaker_plan_new_room", "gamemaker_plan_place_instance",
  ]);
  // Authoring is plan-only: creating resources still writes nothing here, and
  // the emitted plan is what makes the read and write tiers composable.
  assert.deepEqual(gmMcp.authoring, ["script", "object", "room", "instance"]);
  assert.deepEqual(gmMcp.authoringNotCovered, ["tile layers", "asset layers", "room inheritance", "room creation code"]);
  assert.equal(gmMcp.emitsApplicablePlan, true);
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

test("GameMaker write MCP is registered as a separate, process-free write tier", () => {
  assert.equal(gmWriteMcp.package, "@tanguito/gamemaker-write-mcp");
  assert.notEqual(gmWriteMcp.package, gmMcp.package, "the write tier must not share a package with the read tier");
  assert.equal(gmWriteMcp.transport, "STDIO");
  assert.deepEqual(gmWriteMcp.publicTools, ["gamemaker_apply", "gamemaker_verify_text", "gamemaker_rollback"]);
  assert.deepEqual(gmWriteMcp.internalCapabilities, ["GM_APPLY_SAFE_V1", "GM_VERIFY_V1", "GM_ROLLBACK_V1"]);
  assert.equal(gmWriteMcp.mode, "SAFE_WRITE_NO_PROCESS_EXECUTION");
  assert.deepEqual(gmWriteMcp.verificationLevels, ["TEXT_VALID"]);
  assert.equal(gmWriteMcp.compilerExecution, false);
  assert.equal(gmWriteMcp.runtimeExecution, false);
  assert.equal(gmWriteMcp.resources, 0);
  assert.equal(gmWriteMcp.prompts, 0);
  assert.equal(gmWriteMcp.assetBridgeAvailable, false);
  assert.equal(gmWriteMcp.networkAccess, false);
  assert.deepEqual(gmWriteMcp.dependencies, ["@tanguito/devlab-gm-ide-adapter"]);
  assert.doesNotThrow(() => readFileSync(new URL("../" + gmWriteMcp.inputSchema, import.meta.url), "utf8"));
  // The read tier must keep advertising zero write tools now that a write tier exists.
  assert.equal(gmMcp.writeTools, 0);
  const entry = registry.capabilities.find(({ id }) => id === "GAMEMAKER_MCP_WRITE_V1");
  assert.ok(entry, "GAMEMAKER_MCP_WRITE_V1 must be registered in the manifest");
  assert.equal(entry.integrationMode, "STDIO_MCP_SERVER");
  for (const prohibited of ["compile", "run", "Igor or Runner execution", "toolchain through tool arguments"]) {
    assert.ok(entry.prohibitedActions.includes(prohibited), `${prohibited} must remain prohibited`);
  }
});

test("GameMaker build MCP is a separate, opt-in, process-owning tier", () => {
  assert.equal(gmBuildMcp.package, "@tanguito/gamemaker-compile-mcp");
  // Three tiers, three packages: enabling one must never enable another.
  assert.equal(new Set([gmMcp.package, gmWriteMcp.package, gmBuildMcp.package]).size, 3);
  assert.deepEqual(gmBuildMcp.publicTools, ["gamemaker_toolchain_status", "gamemaker_verify_build"]);
  assert.deepEqual(gmBuildMcp.internalCapabilities, ["GM_VERIFY_V1"]);
  assert.equal(gmBuildMcp.platform, "WINDOWS_ONLY");
  assert.equal(gmBuildMcp.toolchainSource, "ENVIRONMENT_ONLY");
  assert.equal(gmBuildMcp.projectMutation, false);
  assert.equal(gmBuildMcp.writeTools, 0);
  assert.equal(gmBuildMcp.compilerExecution, true);
  // Igor is invoked with its Run verb, so a build also launches the game.
  assert.equal(gmBuildMcp.runtimeExecution, true);
  assert.equal(gmBuildMcp.resources, 0);
  assert.equal(gmBuildMcp.prompts, 0);
  assert.equal(gmBuildMcp.networkAccess, false);
  assert.ok(gmBuildMcp.configuration.includes("DEVLAB_GM_ALLOW_IGOR"));
  // Measured, not assumed: Package does not compile and PackageZip is
  // licence-gated, so Run is the only verb that invokes the asset compiler.
  assert.equal(gmBuildMcp.igorVerb, "Run");
  assert.equal(gmBuildMcp.compileOnlyAvailable, false);
  assert.equal(typeof gmBuildMcp.compileOnlyBlockedBy, "string");
  assert.equal(gmBuildMcp.diagnostics, "PARSED_AND_PATH_SCRUBBED");
  assert.doesNotThrow(() => readFileSync(new URL("../" + gmBuildMcp.inputSchema, import.meta.url), "utf8"));
  // Only the build tier may execute a compiler or a runtime.
  assert.equal(gmWriteMcp.compilerExecution, false);
  assert.equal(gmWriteMcp.runtimeExecution, false);
  const entry = registry.capabilities.find(({ id }) => id === "GAMEMAKER_MCP_BUILD_V1");
  assert.ok(entry, "GAMEMAKER_MCP_BUILD_V1 must be registered in the manifest");
  assert.equal(entry.integrationMode, "STDIO_MCP_SERVER");
  for (const prohibited of ["project mutation", "toolchain through tool arguments", "terminating a foreign process"]) {
    assert.ok(entry.prohibitedActions.includes(prohibited), `${prohibited} must remain prohibited`);
  }
});

test("Aseprite ingest is a library and CLI, not an MCP surface, and cannot self-approve", () => {
  assert.equal(asepriteIngest.package, "@tanguito/devlab-aseprite-ingest");
  assert.equal(asepriteIngest.mcpServer, false, "ingest must not become an MCP surface without a separate decision");
  assert.deepEqual(asepriteIngest.publicTools, []);
  assert.equal(asepriteIngest.surface, "LIBRARY_AND_CLI");
  assert.equal(asepriteIngest.toolchainSource, "ENVIRONMENT_ONLY");
  assert.equal(asepriteIngest.callerSuppliedFlags, false);
  // The bridge imports only APPROVED assets; ingest may never emit that itself.
  assert.equal(asepriteIngest.emittedLifecycleStatus, "DRAFT");
  assert.equal(asepriteIngest.determinismGate, "EARNED_BY_DOUBLE_EXPORT");
  assert.deepEqual(asepriteIngest.colourFormats, ["RGBA8888"]);
  assert.equal(asepriteIngest.networkAccess, false);
  const entry = registry.capabilities.find(({ id }) => id === "ASEPRITE_INGEST_V1");
  assert.ok(entry, "ASEPRITE_INGEST_V1 must be registered in the manifest");
  assert.equal(entry.integrationMode, "LIBRARY_AND_CLI");
  for (const prohibited of ["Aseprite --script execution", "writing outside the caller repo root", "approving its own catalog entry"]) {
    assert.ok(entry.prohibitedActions.includes(prohibited), `${prohibited} must remain prohibited`);
  }
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
  // Imports accept any catalog sprite, and rewriting object code stays opt-in.
  assert.equal(assetBridge.spriteSpec, "GENERIC_SPRITE_SPEC_V1");
  assert.deepEqual(assetBridge.instrumentationModes, ["NONE", "PILOT_BEACON_V1"]);
  assert.equal(assetBridge.defaultInstrumentation, "NONE");
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
