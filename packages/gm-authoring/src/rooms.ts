import { GmAuthoringError, insertIntoGmArray, renderGmJson } from "./gm-json.js";
import { assertResourceName, type ProjectIdentity } from "./resources.js";

/**
 * Room records for GameMaker LTS 2026 / project format 225.
 *
 * The shape mirrors the shipped pilot fixture, which compiles today: a
 * `$GMRoom:"v1"` carrying one `$GMRInstanceLayer` above one
 * `$GMRBackgroundLayer`, an `instanceCreationOrder` list, view settings and
 * physics defaults.
 */

export const MAX_ROOM_DIMENSION = 16384;
export const MAX_INSTANCES_PER_ROOM = 256;
export const INSTANCE_LAYER_NAME = "Instances";
export const BACKGROUND_LAYER_NAME = "Background";

export const roomResourcePath = (name: string): string => `rooms/${name}/${name}.yy`;

export interface RoomInstance {
  readonly objectName: string;
  readonly x: number;
  readonly y: number;
  /** Optional explicit instance identifier; derived deterministically if absent. */
  readonly instanceName?: string;
}

export interface ResolvedInstance {
  readonly instanceName: string;
  readonly objectName: string;
  readonly x: number;
  readonly y: number;
}

function assertCoordinate(value: number, axis: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000) {
    throw new GmAuthoringError("INVALID_ROOM", `instance ${axis} must be a finite coordinate`);
  }
  return value;
}

/**
 * Deterministic instance identity. GameMaker itself uses random `inst_<hex>`
 * names; deriving from the object name keeps two identical plans byte-identical,
 * which the whole plan-hash model depends on.
 */
export function deriveInstanceName(objectName: string, taken: ReadonlySet<string>): string {
  const base = `inst_${objectName}`;
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new GmAuthoringError("INVALID_ROOM", `cannot derive a free instance name for ${objectName}`);
}

export function resolveInstances(
  instances: readonly RoomInstance[],
  alreadyTaken: ReadonlySet<string> = new Set(),
): readonly ResolvedInstance[] {
  if (instances.length > MAX_INSTANCES_PER_ROOM) {
    throw new GmAuthoringError("LIMIT_EXCEEDED", "too many instances for one room");
  }
  const taken = new Set(alreadyTaken);
  const resolved: ResolvedInstance[] = [];
  for (const instance of instances) {
    const objectName = assertResourceName(instance.objectName, "object");
    const instanceName = instance.instanceName === undefined
      ? deriveInstanceName(objectName, taken)
      : assertResourceName(instance.instanceName, "instance");
    if (taken.has(instanceName)) throw new GmAuthoringError("INVALID_ROOM", `duplicate instance name ${instanceName}`);
    taken.add(instanceName);
    resolved.push(Object.freeze({
      instanceName,
      objectName,
      x: assertCoordinate(instance.x, "x"),
      y: assertCoordinate(instance.y, "y"),
    }));
  }
  return Object.freeze(resolved);
}

/** One `$GMRInstance:"v4"` record. */
export function instanceRecord(instance: ResolvedInstance): unknown {
  return {
    $GMRInstance: "v4",
    "%Name": instance.instanceName,
    colour: 4294967295,
    frozen: false,
    hasCreationCode: false,
    ignore: false,
    imageIndex: 0,
    imageSpeed: 1.0,
    inheritCode: false,
    inheritedItemId: null,
    inheritItemSettings: false,
    isDnd: false,
    name: instance.instanceName,
    objectId: { name: instance.objectName, path: `objects/${instance.objectName}/${instance.objectName}.yy` },
    properties: [],
    resourceType: "GMRInstance",
    resourceVersion: "2.0",
    rotation: 0.0,
    scaleX: 1.0,
    scaleY: 1.0,
    x: instance.x,
    y: instance.y,
  };
}

export interface RoomOptions {
  readonly width?: number;
  readonly height?: number;
  readonly persistent?: boolean;
}

export function renderRoomYy(
  name: string,
  project: ProjectIdentity,
  instances: readonly ResolvedInstance[],
  options: RoomOptions = {},
): string {
  const width = options.width ?? 640;
  const height = options.height ?? 480;
  for (const [label, value] of [["width", width], ["height", height]] as const) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_ROOM_DIMENSION) {
      throw new GmAuthoringError("INVALID_ROOM", `room ${label} must be a positive integer up to ${MAX_ROOM_DIMENSION}`);
    }
  }
  const roomPath = roomResourcePath(name);
  return renderGmJson({
    $GMRoom: "v1",
    "%Name": name,
    creationCodeFile: "",
    inheritCode: false,
    inheritCreationOrder: false,
    inheritLayers: false,
    instanceCreationOrder: instances.map((instance) => ({ name: instance.instanceName, path: roomPath })),
    isDnd: false,
    layers: [
      {
        $GMRInstanceLayer: "",
        "%Name": INSTANCE_LAYER_NAME,
        depth: 0,
        effectEnabled: true,
        effectType: null,
        gridX: 32,
        gridY: 32,
        hierarchyFrozen: false,
        inheritLayerDepth: false,
        inheritLayerSettings: false,
        inheritSubLayers: true,
        inheritVisibility: true,
        instances: instances.map(instanceRecord),
        layers: [],
        name: INSTANCE_LAYER_NAME,
        properties: [],
        resourceType: "GMRInstanceLayer",
        resourceVersion: "2.0",
        userdefinedDepth: false,
        visible: true,
      },
      {
        $GMRBackgroundLayer: "",
        "%Name": BACKGROUND_LAYER_NAME,
        animationFPS: 15.0,
        animationSpeedType: 0,
        colour: 4278190080,
        depth: 100,
        effectEnabled: true,
        effectType: null,
        gridX: 32,
        gridY: 32,
        hierarchyFrozen: false,
        hspeed: 0.0,
        htiled: false,
        inheritLayerDepth: false,
        inheritLayerSettings: false,
        inheritSubLayers: true,
        inheritVisibility: true,
        layers: [],
        name: BACKGROUND_LAYER_NAME,
        properties: [],
        resourceType: "GMRBackgroundLayer",
        resourceVersion: "2.0",
        spriteId: null,
        stretch: false,
        userdefinedAnimFPS: false,
        userdefinedDepth: false,
        visible: true,
        vspeed: 0.0,
        vtiled: false,
        x: 0,
        y: 0,
      },
    ],
    name,
    parent: { name: project.projectName, path: project.projectFile },
    parentRoom: null,
    physicsSettings: {
      inheritPhysicsSettings: false,
      PhysicsWorld: false,
      PhysicsWorldGravityX: 0.0,
      PhysicsWorldGravityY: 10.0,
      PhysicsWorldPixToMetres: 0.1,
    },
    resourceType: "GMRoom",
    resourceVersion: "2.0",
    roomSettings: { Height: height, inheritRoomSettings: false, persistent: options.persistent ?? false, Width: width },
    sequenceId: null,
    views: [{
      hborder: 32, hport: height, hspeed: -1, hview: height, inherit: false, objectId: null,
      vborder: 32, visible: false, vspeed: -1, wport: width, wview: width,
      xport: 0, xview: 0, yport: 0, yview: 0,
    }],
    viewSettings: { clearDisplayBuffer: true, clearViewBackground: false, enableViews: false, inheritViewSettings: false },
    volume: 1.0,
  });
}

/** Canonical `.yyp` RoomOrderNodes entry. */
export function roomOrderEntry(name: string): string {
  return `{"roomId":{"name":"${name}","path":"${roomResourcePath(name)}",},}`;
}

const INSTANCE_ARRAY_MARKER = '"instances":[';
const CREATION_ORDER_MARKER = '"instanceCreationOrder":[';
// Instance records reach us both hand-authored on one line (as the IDE writes
// them) and pretty-printed across lines (as this package renders them), so the
// separator between the tag and the name must tolerate whitespace.
const INSTANCE_NAME = /"\$GMRInstance":"v\d+",\s*"%Name":"([^"]+)"/g;

/** Instance names already present in a room's text. */
export function existingInstanceNames(roomText: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of roomText.matchAll(INSTANCE_NAME)) names.add(match[1]!);
  return names;
}

/**
 * Splices instances into an existing room, preserving every other byte.
 *
 * Re-rendering the room instead would silently discard any layer, effect or
 * setting this package does not model, so the room is patched as text exactly
 * the way the .yyp is.
 *
 * Rooms with more than one instance layer are refused rather than guessed at:
 * there would be no way to know which layer the caller meant.
 */
export function spliceInstancesIntoRoom(
  roomText: string,
  roomName: string,
  instances: readonly ResolvedInstance[],
): string {
  const layerCount = roomText.split(INSTANCE_ARRAY_MARKER).length - 1;
  if (layerCount === 0) throw new GmAuthoringError("INVALID_ROOM", "the room has no instance layer");
  if (layerCount > 1) throw new GmAuthoringError("INVALID_ROOM", "the room has more than one instance layer; placing an instance would be ambiguous");
  if (!roomText.includes(CREATION_ORDER_MARKER)) throw new GmAuthoringError("INVALID_ROOM", "the room declares no instanceCreationOrder");

  const roomPath = roomResourcePath(roomName);
  let patched = roomText;
  for (const instance of instances) {
    patched = insertIntoGmArray(
      patched,
      INSTANCE_ARRAY_MARKER,
      instance.instanceName,
      renderGmJson(instanceRecord(instance)).replace(/\s*\n\s*/g, ""),
      "      ",
      `"%Name":"${instance.instanceName}"`,
    );
    patched = insertIntoGmArray(
      patched,
      CREATION_ORDER_MARKER,
      instance.instanceName,
      `{"name":"${instance.instanceName}","path":"${roomPath}",}`,
      "    ",
      `"name":"${instance.instanceName}"`,
    );
  }
  return patched;
}
