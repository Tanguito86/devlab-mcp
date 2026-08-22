import type { ResolvedEvent } from "./events.js";
import { GmAuthoringError, renderGmJson } from "./gm-json.js";

/**
 * Resource record shapes for GameMaker LTS 2026 / project format 225.
 *
 * Both records below were validated by compiling a project that contains them
 * with the installed Igor (runtime 2024.14.3.260), not inferred from
 * documentation: the object record mirrors the shipped pilot fixture byte for
 * byte in structure, and the script record was probed by building a project
 * whose object calls the generated script and observing the compiled game
 * return the expected value.
 */

const RESOURCE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** GameMaker identifiers must be valid GML names, not merely safe paths. */
export function assertResourceName(name: string, kind: string): string {
  if (typeof name !== "string" || !RESOURCE_NAME.test(name)) {
    throw new GmAuthoringError("INVALID_RESOURCE_NAME", `${kind} name must match /^[A-Za-z_][A-Za-z0-9_]{0,63}$/`);
  }
  return name;
}

export interface ProjectIdentity {
  readonly projectName: string;
  /** Project file relative to the project root, e.g. "MyGame.yyp". */
  readonly projectFile: string;
}

export const scriptResourcePath = (name: string): string => `scripts/${name}/${name}.yy`;
export const scriptCodePath = (name: string): string => `scripts/${name}/${name}.gml`;
export const objectResourcePath = (name: string): string => `objects/${name}/${name}.yy`;
export const objectEventPath = (name: string, fileName: string): string => `objects/${name}/${fileName}`;

export function renderScriptYy(name: string, project: ProjectIdentity): string {
  return renderGmJson({
    $GMScript: "v1",
    "%Name": name,
    isCompatibility: false,
    isDnD: false,
    name,
    parent: { name: project.projectName, path: project.projectFile },
    resourceType: "GMScript",
    resourceVersion: "2.0",
  });
}

function eventRecord(event: ResolvedEvent): unknown {
  return {
    $GMEvent: "v1",
    "%Name": "",
    collisionObjectId: null,
    eventNum: event.eventNum,
    eventType: event.eventType,
    isDnD: false,
    name: "",
    resourceType: "GMEvent",
    resourceVersion: "2.0",
  };
}

export interface ObjectOptions {
  /** Existing sprite resource name, or null for no sprite. */
  readonly spriteName?: string | null;
  readonly persistent?: boolean;
  readonly visible?: boolean;
  readonly solid?: boolean;
}

export function renderObjectYy(
  name: string,
  project: ProjectIdentity,
  events: readonly ResolvedEvent[],
  options: ObjectOptions = {},
): string {
  const spriteName = options.spriteName ?? null;
  if (spriteName !== null) assertResourceName(spriteName, "sprite");
  return renderGmJson({
    $GMObject: "",
    "%Name": name,
    eventList: events.map(eventRecord),
    managed: true,
    name,
    overriddenProperties: [],
    parent: { name: project.projectName, path: project.projectFile },
    parentObjectId: null,
    persistent: options.persistent ?? false,
    physicsAngularDamping: 0.1,
    physicsDensity: 0.5,
    physicsFriction: 0.2,
    physicsGroup: 1,
    physicsKinematic: false,
    physicsLinearDamping: 0.1,
    physicsObject: false,
    physicsRestitution: 0.1,
    physicsSensor: false,
    physicsShape: 1,
    physicsShapePoints: [],
    physicsStartAwake: true,
    properties: [],
    resourceType: "GMObject",
    resourceVersion: "2.0",
    solid: options.solid ?? false,
    spriteId: spriteName === null ? null : { name: spriteName, path: `sprites/${spriteName}/${spriteName}.yy` },
    spriteMaskId: null,
    visible: options.visible ?? true,
  });
}
