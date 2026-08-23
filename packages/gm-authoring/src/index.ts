export {
  GmAuthoringError, insertIntoGmArray, nextResourceOrder, parseGmJson, renderGmJson,
  resourceOrderEntry, yypResourceEntry, type GmAuthoringErrorCode,
} from "./gm-json.js";
export {
  EVENT_KINDS, EVENT_NAMES, MAX_EVENTS_PER_OBJECT, MAX_GML_BYTES, resolveEvent, resolveEvents,
  type GmEventKind, type GmEventName, type GmEventSpec, type ResolvedEvent,
} from "./events.js";
export {
  assertResourceName, objectEventPath, objectResourcePath, renderObjectYy, renderScriptYy,
  scriptCodePath, scriptResourcePath, type ObjectOptions, type ProjectIdentity,
} from "./resources.js";
export {
  authorObject, authorPlaceInstance, authorRoom, authorScript, authorTileLayer, authorTileset,
  type AuthoredFile, type AuthoredResource, type NewObjectRequest, type NewRoomRequest,
  type NewScriptRequest, type NewTileLayerRequest, type NewTilesetRequest,
  type PlaceInstanceRequest, type ProjectTexts,
} from "./authoring.js";
export {
  BACKGROUND_LAYER_NAME, INSTANCE_LAYER_NAME, MAX_INSTANCES_PER_ROOM, MAX_ROOM_DIMENSION,
  deriveInstanceName, existingInstanceNames, instanceRecord, renderRoomYy, resolveInstances,
  roomOrderEntry, roomResourcePath, spliceInstancesIntoRoom,
  type ResolvedInstance, type RoomInstance, type RoomOptions,
} from "./rooms.js";
export {
  EMPTY_TILE, MAX_TILE_LAYER_CELLS, assertTileCells, decodeTileData, encodeTileData,
  renderTilesetYy, spliceTileLayerIntoRoom, tileLayerRecord, tilesetLayout, tilesetResourcePath,
  type TileLayerSpec, type TilesetGeometry, type TilesetLayout,
} from "./tiles.js";
export {
  assertProjectName, authorProject, renderProjectYyp, renderResourceOrder,
  type AuthoredProject, type AuthoredProjectFile,
} from "./project.js";
