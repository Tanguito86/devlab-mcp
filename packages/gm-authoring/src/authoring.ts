import {
  GmAuthoringError,
  insertIntoGmArray,
  nextResourceOrder,
  resourceOrderEntry,
  yypResourceEntry,
} from "./gm-json.js";
import { resolveEvents, type GmEventSpec } from "./events.js";
import {
  assertTileCells,
  renderTilesetYy,
  spliceTileLayerIntoRoom,
  tilesetResourcePath,
} from "./tiles.js";
import {
  existingInstanceNames,
  renderRoomYy,
  resolveInstances,
  roomOrderEntry,
  roomResourcePath,
  spliceInstancesIntoRoom,
  type ResolvedInstance,
  type RoomInstance,
  type RoomOptions,
} from "./rooms.js";
import {
  assertResourceName,
  objectEventPath,
  objectResourcePath,
  renderObjectYy,
  renderScriptYy,
  scriptCodePath,
  scriptResourcePath,
  type ObjectOptions,
  type ProjectIdentity,
} from "./resources.js";

/** One file the caller should create, in the shape GM_PLAN_V1 accepts. */
export interface AuthoredFile {
  readonly path: string;
  readonly action: "create" | "modify";
  readonly content: string;
}

export interface AuthoredResource {
  readonly resourceKind: "script" | "object" | "room" | "instance" | "tileset" | "tileLayer";
  readonly resourceName: string;
  readonly resourcePath: string;
  readonly files: readonly AuthoredFile[];
  /** Every path the plan will touch, for the allowlist. */
  readonly allowlist: readonly string[];
}

export interface ProjectTexts {
  readonly identity: ProjectIdentity;
  readonly yyp: string;
  /** Omit when the project has no .resource_order file. */
  readonly resourceOrder?: string;
  /** Body of the room being edited; required only by placeInstance. */
  readonly roomText?: string;
  /** Every file path already present in the project. */
  readonly existingFiles: readonly string[];
  /** Every resource path already referenced by the .yyp. */
  readonly existingReferences: readonly string[];
}

const normalize = (path: string): string => path.normalize("NFKC").toLowerCase();

/**
 * Refuses a name that already exists, or that differs from an existing
 * resource only by case or Unicode form. Windows and macOS filesystems would
 * merge the two and quietly corrupt the project.
 */
function assertAvailable(project: ProjectTexts, resourcePath: string, name: string): void {
  for (const candidate of [...project.existingReferences, ...project.existingFiles]) {
    if (candidate === resourcePath) throw new GmAuthoringError("RESOURCE_EXISTS", `${name} already exists in this project`);
    if (normalize(candidate) === normalize(resourcePath)) {
      throw new GmAuthoringError("RESOURCE_EXISTS", `${name} collides with existing ${candidate} by case or Unicode form`);
    }
  }
}

function projectFileEdits(project: ProjectTexts, name: string, resourcePath: string): AuthoredFile[] {
  const edits: AuthoredFile[] = [{
    path: project.identity.projectFile,
    action: "modify",
    content: insertIntoGmArray(project.yyp, '"resources":[', resourcePath, yypResourceEntry(name, resourcePath)),
  }];
  // .resource_order is IDE ordering metadata and is not required to compile.
  // It is patched only when the project already has one; conjuring the file
  // would mean inventing a layout no IDE wrote.
  if (project.resourceOrder !== undefined) {
    edits.push({
      path: `${project.identity.projectName}.resource_order`,
      action: "modify",
      content: insertIntoGmArray(
        project.resourceOrder,
        '"ResourceOrderSettings":[',
        resourcePath,
        resourceOrderEntry(name, resourcePath, nextResourceOrder(project.yyp)),
      ),
    });
  }
  return edits;
}

export interface NewScriptRequest {
  readonly name: string;
  readonly gml: string;
}

export function authorScript(project: ProjectTexts, request: NewScriptRequest): AuthoredResource {
  const name = assertResourceName(request.name, "script");
  if (typeof request.gml !== "string" || request.gml.length === 0) {
    throw new GmAuthoringError("INVALID_EVENT", "a script needs GML text");
  }
  const resourcePath = scriptResourcePath(name);
  assertAvailable(project, resourcePath, name);

  const files: AuthoredFile[] = [
    { path: resourcePath, action: "create", content: renderScriptYy(name, project.identity) },
    { path: scriptCodePath(name), action: "create", content: request.gml },
    ...projectFileEdits(project, name, resourcePath),
  ];
  return Object.freeze({
    resourceKind: "script",
    resourceName: name,
    resourcePath,
    files: Object.freeze(files),
    allowlist: Object.freeze(files.map(({ path }) => path)),
  });
}

export interface NewRoomRequest {
  readonly name: string;
  readonly instances?: readonly RoomInstance[];
  readonly options?: RoomOptions;
}

/** Every object an instance references must already exist in the project. */
function assertObjectsExist(project: ProjectTexts, instances: readonly ResolvedInstance[]): void {
  for (const instance of instances) {
    const objectPath = `objects/${instance.objectName}/${instance.objectName}.yy`;
    if (!project.existingReferences.includes(objectPath) && !project.existingFiles.includes(objectPath)) {
      throw new GmAuthoringError("INVALID_ROOM", `object ${instance.objectName} is not in this project`);
    }
  }
}

export function authorRoom(project: ProjectTexts, request: NewRoomRequest): AuthoredResource {
  const name = assertResourceName(request.name, "room");
  const resourcePath = roomResourcePath(name);
  assertAvailable(project, resourcePath, name);
  const instances = resolveInstances(request.instances ?? []);
  assertObjectsExist(project, instances);

  // A new room must also join the project's room order, or the game has no
  // start room and the compiler has nothing to launch.
  const edits = projectFileEdits(project, name, resourcePath);
  const yypEdit = edits[0]!;
  const withRoomOrder: AuthoredFile = {
    ...yypEdit,
    content: insertIntoGmArray(yypEdit.content, '"RoomOrderNodes":[', resourcePath, roomOrderEntry(name)),
  };

  const files: AuthoredFile[] = [
    { path: resourcePath, action: "create", content: renderRoomYy(name, project.identity, instances, request.options ?? {}) },
    withRoomOrder,
    ...edits.slice(1),
  ];
  return Object.freeze({
    resourceKind: "room",
    resourceName: name,
    resourcePath,
    files: Object.freeze(files),
    allowlist: Object.freeze(files.map(({ path }) => path)),
  });
}

export interface PlaceInstanceRequest {
  readonly roomName: string;
  readonly instances: readonly RoomInstance[];
}

/**
 * Adds instances to a room that already exists. The room is patched as text,
 * never re-rendered, so any layer or setting this package does not model
 * survives untouched.
 */
export function authorPlaceInstance(project: ProjectTexts, request: PlaceInstanceRequest): AuthoredResource {
  const roomName = assertResourceName(request.roomName, "room");
  const resourcePath = roomResourcePath(roomName);
  if (!project.existingReferences.includes(resourcePath) && !project.existingFiles.includes(resourcePath)) {
    throw new GmAuthoringError("INVALID_ROOM", `room ${roomName} is not in this project`);
  }
  if (project.roomText === undefined) throw new GmAuthoringError("INVALID_ROOM", "the room body is required to place an instance");
  if (!request.instances.length) throw new GmAuthoringError("INVALID_ROOM", "at least one instance is required");

  const instances = resolveInstances(request.instances, existingInstanceNames(project.roomText));
  assertObjectsExist(project, instances);

  const files: AuthoredFile[] = [{
    path: resourcePath,
    action: "modify",
    content: spliceInstancesIntoRoom(project.roomText, roomName, instances),
  }];
  return Object.freeze({
    resourceKind: "instance",
    resourceName: instances.map(({ instanceName }) => instanceName).join(","),
    resourcePath,
    files: Object.freeze(files),
    allowlist: Object.freeze(files.map(({ path }) => path)),
  });
}

export interface NewTilesetRequest {
  readonly name: string;
  readonly spriteName: string;
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
}

export function authorTileset(project: ProjectTexts, request: NewTilesetRequest): AuthoredResource {
  const name = assertResourceName(request.name, "tileset");
  const resourcePath = tilesetResourcePath(name);
  assertAvailable(project, resourcePath, name);

  const spritePath = `sprites/${request.spriteName}/${request.spriteName}.yy`;
  if (!project.existingReferences.includes(spritePath) && !project.existingFiles.includes(spritePath)) {
    throw new GmAuthoringError("INVALID_RESOURCE_NAME", `sprite ${request.spriteName} is not in this project`);
  }

  const files: AuthoredFile[] = [
    { path: resourcePath, action: "create", content: renderTilesetYy(name, project.identity, request) },
    ...projectFileEdits(project, name, resourcePath),
  ];
  return Object.freeze({
    resourceKind: "tileset",
    resourceName: name,
    resourcePath,
    files: Object.freeze(files),
    allowlist: Object.freeze(files.map(({ path }) => path)),
  });
}

export interface NewTileLayerRequest {
  readonly roomName: string;
  readonly layerName: string;
  readonly tilesetName: string;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly number[];
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly depth?: number;
  /** Tile count of the referenced tileset, used to bounds-check every cell. */
  readonly tilesetTileCount: number;
}

/**
 * Adds a tile layer to a room that already exists. Like instance placement,
 * the room is patched as text so unmodelled layers and settings survive.
 */
export function authorTileLayer(project: ProjectTexts, request: NewTileLayerRequest): AuthoredResource {
  const roomName = assertResourceName(request.roomName, "room");
  const layerName = assertResourceName(request.layerName, "layer");
  const tilesetName = assertResourceName(request.tilesetName, "tileset");
  const resourcePath = roomResourcePath(roomName);
  if (!project.existingReferences.includes(resourcePath) && !project.existingFiles.includes(resourcePath)) {
    throw new GmAuthoringError("INVALID_ROOM", `room ${roomName} is not in this project`);
  }
  if (project.roomText === undefined) throw new GmAuthoringError("INVALID_ROOM", "the room body is required to add a tile layer");

  const tilesetPath = tilesetResourcePath(tilesetName);
  if (!project.existingReferences.includes(tilesetPath) && !project.existingFiles.includes(tilesetPath)) {
    throw new GmAuthoringError("INVALID_TILE_DATA", `tileset ${tilesetName} is not in this project`);
  }

  const spec = {
    layerName, tilesetName,
    width: request.width, height: request.height, cells: request.cells,
    tileWidth: request.tileWidth, tileHeight: request.tileHeight,
    ...(request.depth === undefined ? {} : { depth: request.depth }),
  };
  assertTileCells(spec, request.tilesetTileCount);

  const files: AuthoredFile[] = [{
    path: resourcePath,
    action: "modify",
    content: spliceTileLayerIntoRoom(project.roomText, spec),
  }];
  return Object.freeze({
    resourceKind: "tileLayer",
    resourceName: layerName,
    resourcePath,
    files: Object.freeze(files),
    allowlist: Object.freeze(files.map(({ path }) => path)),
  });
}

export interface NewObjectRequest {
  readonly name: string;
  readonly events: readonly GmEventSpec[];
  readonly options?: ObjectOptions;
}

export function authorObject(project: ProjectTexts, request: NewObjectRequest): AuthoredResource {
  const name = assertResourceName(request.name, "object");
  const events = resolveEvents(request.events);
  const resourcePath = objectResourcePath(name);
  assertAvailable(project, resourcePath, name);

  // A sprite may only be attached if the project already has it; inventing a
  // reference would produce a project that does not load.
  const spriteName = request.options?.spriteName ?? null;
  if (spriteName !== null) {
    const spritePath = `sprites/${spriteName}/${spriteName}.yy`;
    if (!project.existingReferences.includes(spritePath) && !project.existingFiles.includes(spritePath)) {
      throw new GmAuthoringError("INVALID_RESOURCE_NAME", `sprite ${spriteName} is not in this project`);
    }
  }

  const files: AuthoredFile[] = [
    { path: resourcePath, action: "create", content: renderObjectYy(name, project.identity, events, request.options ?? {}) },
    ...events.map((event) => ({
      path: objectEventPath(name, event.fileName),
      action: "create" as const,
      content: event.gml,
    })),
    ...projectFileEdits(project, name, resourcePath),
  ];
  return Object.freeze({
    resourceKind: "object",
    resourceName: name,
    resourcePath,
    files: Object.freeze(files),
    allowlist: Object.freeze(files.map(({ path }) => path)),
  });
}
