export * from "./contracts.js";
export { AssetGmBridgeError, fail, mapAdapterError, publicErrorShape, type AssetGmBridgeErrorCode } from "./errors.js";
export { canonicalBytes, canonicalHash, sha256 } from "./canonical.js";
export { BRIDGE_SPRITE_BUDGET, evaluateSpriteBudget, assertBudgetPasses, type SpriteBudgetMetrics, type SpriteBudgetResult } from "./budget.js";
export { computePlanBinding, bindingPayload, manifestHash, hashBytes } from "./binding.js";
export { normalizePathIdentity, scanPathCollisions, assertNoPathCollisions, assertResourceNameAvailable } from "./paths.js";
export {
  BRIDGE_TEST_BEACON_ASSET_ID, BRIDGE_TEST_BEACON_RESOURCE_NAME, BRIDGE_TEST_BEACON_FACTORY,
  createBridgeTestBeacon, validateBridgeTestBeaconSpec, encodePng, type BeaconFactory, type BridgeTestBeaconAsset,
  type BridgeTestBeaconSpec,
} from "./beacon.js";
export {
  renderGmJson, insertIntoGmArray, parseGmJson, renderSpriteYy, patchProjectTexts,
  renderImportedGml, spriteCompositeImagePath, spriteImagePath, assetVersionToNumber, runtimeSignalFor, yypResourceEntry, resourceOrderEntry,
  type SpriteRenderContext, type ImportedGml,
} from "./gm-sprite.js";
export { GovernedAssetGmBridge, ALLOWED_EXTENSIONS, bridgeErrorCodes, type AssetGmBridgeConfig } from "./bridge.js";
