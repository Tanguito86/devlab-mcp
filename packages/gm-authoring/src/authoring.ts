import {
  GmAuthoringError,
  insertIntoGmArray,
  nextResourceOrder,
  resourceOrderEntry,
  yypResourceEntry,
} from "./gm-json.js";
import { resolveEvents, type GmEventSpec } from "./events.js";
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
  readonly resourceKind: "script" | "object";
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
