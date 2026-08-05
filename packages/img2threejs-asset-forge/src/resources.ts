export type ResourceOwnership = "OWNED" | "SHARED" | "EXTERNAL";
export type ResourceCategory = "geometry" | "material" | "texture" | "renderTarget" | "skeleton" | "custom";
export interface DisposableResource { dispose(): void }
export interface MixerResource { stopAllAction(): void; uncacheRoot(root: unknown): void }
export interface SceneReference { detach(): void }
export interface ListenerReference { remove(): void }
export interface ResourceRegistration { readonly category: ResourceCategory; readonly ownership: ResourceOwnership; readonly resource: DisposableResource }
export interface DisposableModel { readonly root: unknown; readonly resources?: readonly ResourceRegistration[]; readonly mixers?: readonly MixerResource[]; readonly listeners?: readonly ListenerReference[]; readonly sceneReferences?: readonly SceneReference[] }
export interface DisposalReport { readonly alreadyDisposed: boolean; readonly disposed: Readonly<Record<ResourceCategory, number>>; readonly skippedShared: number; readonly skippedExternal: number; readonly mixersStopped: number; readonly listenersRemoved: number; readonly sceneReferencesDetached: number; readonly errors: readonly string[] }

const disposedResources = new WeakSet<DisposableResource>();
const completedMixers = new WeakSet<MixerResource>();
const completedListeners = new WeakSet<ListenerReference>();
const completedSceneReferences = new WeakSet<SceneReference>();
const completedRoots = new WeakSet<object>();

function rootIdentity(model: DisposableModel): object { return model.root !== null && (typeof model.root === "object" || typeof model.root === "function") ? model.root as object : model as object; }

export function disposeModel(model: DisposableModel): DisposalReport {
  const root = rootIdentity(model); const wasComplete = completedRoots.has(root);
  const counts: Record<ResourceCategory, number> = { geometry: 0, material: 0, texture: 0, renderTarget: 0, skeleton: 0, custom: 0 };
  let skippedShared = 0; let skippedExternal = 0; let mixersStopped = 0; let listenersRemoved = 0; let sceneReferencesDetached = 0; let performed = false;
  const errors: string[] = []; const seenThisCall = new Set<DisposableResource>();
  for (const entry of model.resources ?? []) {
    if (!entry || !new Set<ResourceCategory>(["geometry", "material", "texture", "renderTarget", "skeleton", "custom"]).has(entry.category) || !new Set<ResourceOwnership>(["OWNED", "SHARED", "EXTERNAL"]).has(entry.ownership) || !entry.resource || typeof entry.resource.dispose !== "function") { errors.push("resource registration is invalid"); continue; }
    if (entry.ownership === "SHARED") { skippedShared += 1; continue; }
    if (entry.ownership === "EXTERNAL") { skippedExternal += 1; continue; }
    if (seenThisCall.has(entry.resource) || disposedResources.has(entry.resource)) continue;
    seenThisCall.add(entry.resource); performed = true;
    try { entry.resource.dispose(); disposedResources.add(entry.resource); counts[entry.category] += 1; } catch (error) { errors.push(`${entry.category}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  for (const mixer of model.mixers ?? []) {
    if (completedMixers.has(mixer)) continue; performed = true;
    try { mixer.stopAllAction(); mixer.uncacheRoot(model.root); completedMixers.add(mixer); mixersStopped += 1; } catch (error) { errors.push(`mixer: ${error instanceof Error ? error.message : String(error)}`); }
  }
  for (const listener of model.listeners ?? []) {
    if (completedListeners.has(listener)) continue; performed = true;
    try { listener.remove(); completedListeners.add(listener); listenersRemoved += 1; } catch (error) { errors.push(`listener: ${error instanceof Error ? error.message : String(error)}`); }
  }
  for (const reference of model.sceneReferences ?? []) {
    if (completedSceneReferences.has(reference)) continue; performed = true;
    try { reference.detach(); completedSceneReferences.add(reference); sceneReferencesDetached += 1; } catch (error) { errors.push(`sceneReference: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (errors.length === 0) completedRoots.add(root); else completedRoots.delete(root);
  return Object.freeze({ alreadyDisposed: wasComplete && !performed && errors.length === 0, disposed: Object.freeze(counts), skippedShared, skippedExternal, mixersStopped, listenersRemoved, sceneReferencesDetached, errors: Object.freeze(errors) });
}
