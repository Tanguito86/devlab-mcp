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
  authorObject, authorScript,
  type AuthoredFile, type AuthoredResource, type NewObjectRequest, type NewScriptRequest, type ProjectTexts,
} from "./authoring.js";
