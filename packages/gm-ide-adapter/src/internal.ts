/**
 * INTERNAL composition surface — NOT the public capability barrel.
 *
 * The public barrel (`index.ts`) exposes exactly the six governed operations
 * (GM_STATUS_V1 / GM_INSPECT_V1 / GM_PLAN_V1 / GM_APPLY_SAFE_V1 /
 * GM_VERIFY_V1 / GM_ROLLBACK_V1) plus contracts, errors and the adapter
 * class. The primitives re-exported here (path safety, canonical planning
 * digest, process inventory types) are internal machinery that the governed
 * composition layer `asset-gm-bridge` reuses WITHOUT weakening the public
 * boundary: they are reachable only through this explicit, documented
 * subpath (`@tanguito/devlab-gm-ide-adapter/internal`), never through the
 * capability barrel.
 */
export { planHash } from "./planning/index.js";
export { safeAllowedExtensions, safeRelativePath, safeTransactionId, resolveRealRoot, resolveInsideRoot } from "./paths/index.js";
export { windowsProcessInventory } from "./processes/index.js";
export type { ProcessInventory, RawProcess, OwnedProcessRecord, OwnedCommandResult } from "./processes/index.js";
