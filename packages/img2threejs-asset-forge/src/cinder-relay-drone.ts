import { disposeModel, type DisposalReport, type ResourceRegistration } from "./resources.js";

export interface CinderRelayDroneSpec {
  readonly schemaVersion: 1;
  readonly assetId: "cinder-relay-drone";
  readonly assetType: "industrial-relay-drone";
  readonly seed: "devlab-cinder-relay-drone-v1";
  readonly scaleMeters: Readonly<{ width: 1.8; height: 1.35; depth: 1.2 }>;
  readonly silhouette: Readonly<{ centralBody: "compact-armored-core"; upperRelay: "broken-arc-antenna"; sideStabilizers: 2; asymmetry: "controlled" }>;
  readonly materials: Readonly<{ primary: "charcoal-metal"; secondary: "oxidized-steel"; accent: "ember-orange"; sensor: "cold-cyan" }>;
  readonly damage: Readonly<{ level: "used"; missingPanels: 1; surfaceWear: "moderate" }>;
  readonly lighting: Readonly<{ emissiveCore: true; sensorLights: true }>;
}

interface VectorLike { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
interface EulerLike { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
interface MatrixLike { readonly elements: ArrayLike<number>; determinant(): number }
interface AttributeLike { readonly count: number; readonly itemSize: number; readonly array: ArrayLike<number>; getX(index: number): number }
interface GeometryLike {
  readonly attributes: Record<string, AttributeLike>;
  readonly index: AttributeLike | null;
  boundingBox: BoundsBoxLike | null;
  boundingSphere: BoundsSphereLike | null;
  computeBoundingBox(): void;
  computeBoundingSphere(): void;
  dispose(): void;
}
interface ColorLike { setHex(value: number): void }
interface MaterialLike { name: string; emissiveIntensity: number; readonly emissive?: ColorLike; dispose(): void }
interface SceneNode {
  name: string;
  parent: SceneNode | null;
  readonly children: SceneNode[];
  readonly position: VectorLike;
  readonly rotation: EulerLike;
  readonly scale: VectorLike;
  readonly matrixWorld: MatrixLike;
  readonly userData: Record<string, unknown>;
  readonly geometry?: GeometryLike;
  readonly material?: MaterialLike | readonly MaterialLike[];
  add(...nodes: SceneNode[]): void;
  traverse(callback: (node: SceneNode) => void): void;
  updateMatrixWorld(force?: boolean): void;
}
interface BoundsBoxLike { readonly min: VectorLike; readonly max: VectorLike; setFromObject(root: SceneNode): BoundsBoxLike; isEmpty(): boolean; getCenter(target: VectorLike): VectorLike }
interface BoundsSphereLike { readonly center: VectorLike; radius: number }
interface Constructor<T> { new (...args: unknown[]): T }
interface ThreeRuntime {
  readonly Group: Constructor<SceneNode>;
  readonly Mesh: Constructor<SceneNode>;
  readonly InstancedMesh: Constructor<SceneNode>;
  readonly Object3D: Constructor<SceneNode>;
  readonly IcosahedronGeometry: Constructor<GeometryLike>;
  readonly BoxGeometry: Constructor<GeometryLike>;
  readonly SphereGeometry: Constructor<GeometryLike>;
  readonly CylinderGeometry: Constructor<GeometryLike>;
  readonly TorusGeometry: Constructor<GeometryLike>;
  readonly MeshStandardMaterial: Constructor<MaterialLike>;
  readonly Box3: Constructor<BoundsBoxLike>;
  readonly Sphere: Constructor<BoundsSphereLike>;
}

export interface AssetForgeContext { readonly three: ThreeRuntime; readonly factoryVersion: "1.0.0" }
export interface CanonicalTransform { readonly position: readonly [number, number, number]; readonly rotation: readonly [number, number, number]; readonly scale: readonly [number, number, number] }
export interface CanonicalPartRecord {
  readonly canonicalId: string;
  readonly transform: CanonicalTransform;
  readonly ownership: "OWNED";
  readonly materialAssignment: readonly string[];
  readonly bounds: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
  readonly visualRole: string;
}
export interface GeometryStatistics { readonly triangles: number; readonly geometries: number; readonly drawCalls: number; readonly objectCount: number }
export interface MaterialStatistics { readonly materials: number; readonly textures: 0; readonly internalLights: 0; readonly names: readonly string[] }
export interface GeometryValidationReport { readonly status: "PASS" | "FAIL"; readonly checks: readonly string[]; readonly errors: readonly string[] }
export interface GeneratedAsset {
  readonly root: SceneNode;
  readonly resources: readonly ResourceRegistration[];
  readonly geometryStatistics: GeometryStatistics;
  readonly materialStatistics: MaterialStatistics;
  readonly boundingBox: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
  readonly boundingSphere: Readonly<{ center: readonly [number, number, number]; radius: number }>;
  readonly anchorPoints: Readonly<Record<string, readonly [number, number, number]>>;
  readonly parts: readonly CanonicalPartRecord[];
  readonly captureMetadata: Readonly<{ assetId: string; seed: string; factoryVersion: string; animation: "relay-pulse"; durationSeconds: 2; logicalHz: 60 }>;
  readonly validation: GeometryValidationReport;
  applyRelayPulse(frameIndex: number): void;
  dispose(): DisposalReport;
}

const ROOT_ID = "cinder-relay-drone";
const PART_IDS = Object.freeze([
  "core-housing", "ember-core", "forward-sensor-cluster", "relay-arc-root",
  "relay-arc-left", "relay-arc-right", "stabilizer-left", "stabilizer-right",
  "lower-service-module", "damaged-panel", "maintenance-markers",
] as const);
const MATERIAL_NAMES = Object.freeze(["charcoal-metal", "oxidized-steel", "ember-core", "sensor-cyan", "maintenance-marker"] as const);
const EXPECTED_SPEC_KEYS = Object.freeze(["assetId", "assetType", "damage", "lighting", "materials", "scaleMeters", "schemaVersion", "seed", "silhouette"]);

function exactKeys(value: unknown, expected: readonly string[], field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${field} must be a plain object`);
  const actual = Object.keys(value as Record<string, unknown>).sort();
  if (actual.join("|") !== [...expected].sort().join("|")) throw new Error(`${field} must be closed by schema`);
}

export function validateCinderRelayDroneSpec(value: unknown): asserts value is CinderRelayDroneSpec {
  exactKeys(value, EXPECTED_SPEC_KEYS, "spec");
  const spec = value as Record<string, unknown>;
  if (spec.schemaVersion !== 1 || spec.assetId !== ROOT_ID || spec.assetType !== "industrial-relay-drone" || spec.seed !== "devlab-cinder-relay-drone-v1") throw new Error("spec identity is invalid");
  exactKeys(spec.scaleMeters, ["depth", "height", "width"], "scaleMeters");
  exactKeys(spec.silhouette, ["asymmetry", "centralBody", "sideStabilizers", "upperRelay"], "silhouette");
  exactKeys(spec.materials, ["accent", "primary", "secondary", "sensor"], "materials");
  exactKeys(spec.damage, ["level", "missingPanels", "surfaceWear"], "damage");
  exactKeys(spec.lighting, ["emissiveCore", "sensorLights"], "lighting");
  const scale = spec.scaleMeters as Record<string, unknown>; const silhouette = spec.silhouette as Record<string, unknown>;
  const materials = spec.materials as Record<string, unknown>; const damage = spec.damage as Record<string, unknown>; const lighting = spec.lighting as Record<string, unknown>;
  if (scale.width !== 1.8 || scale.height !== 1.35 || scale.depth !== 1.2 || silhouette.centralBody !== "compact-armored-core" || silhouette.upperRelay !== "broken-arc-antenna" || silhouette.sideStabilizers !== 2 || silhouette.asymmetry !== "controlled") throw new Error("spec silhouette or scale is invalid");
  if (materials.primary !== "charcoal-metal" || materials.secondary !== "oxidized-steel" || materials.accent !== "ember-orange" || materials.sensor !== "cold-cyan" || damage.level !== "used" || damage.missingPanels !== 1 || damage.surfaceWear !== "moderate" || lighting.emissiveCore !== true || lighting.sensorLights !== true) throw new Error("spec materials, damage, or lighting are invalid");
}

function finiteTuple(vector: VectorLike): readonly [number, number, number] { return Object.freeze([vector.x, vector.y, vector.z]); }
function setTransform(node: SceneNode, position: readonly [number, number, number], rotation: readonly [number, number, number], scale: readonly [number, number, number]): void {
  node.position.set(...position); node.rotation.set(...rotation); node.scale.set(...scale);
}
function makeMaterial(three: ThreeRuntime, name: typeof MATERIAL_NAMES[number], parameters: Record<string, unknown>): MaterialLike {
  const material = new three.MeshStandardMaterial(parameters); material.name = name; return material;
}
function registerPart(node: SceneNode, id: typeof PART_IDS[number], materialAssignment: readonly string[], visualRole: string): void {
  node.name = id; node.userData.canonicalId = id; node.userData.ownership = "OWNED"; node.userData.materialAssignment = [...materialAssignment]; node.userData.visualRole = visualRole;
}

function geometryTriangles(geometry: GeometryLike): number { return geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3; }
function materialNames(material: MaterialLike | readonly MaterialLike[] | undefined): readonly string[] { return !material ? [] : Array.isArray(material) ? material.map((entry) => entry.name) : [(material as MaterialLike).name]; }
function boundsRecord(three: ThreeRuntime, node: SceneNode): Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }> {
  const box = new three.Box3().setFromObject(node); return Object.freeze({ min: finiteTuple(box.min), max: finiteTuple(box.max) });
}

export function validateCinderGeometry(root: SceneNode): GeometryValidationReport {
  const errors: string[] = []; const checks = ["finite-matrices", "invertible-matrices", "positive-scales", "nonempty-bounds", "bounded-size", "geometry-attributes", "indices-in-range", "normals-present", "uv-finite", "material-ownership", "attached-nodes", "unique-names", "canonical-ids"];
  const names = new Set<string>(); const ids = new Set<string>();
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.name || names.has(node.name)) errors.push(`duplicate-or-empty-name:${node.name}`); else names.add(node.name);
    if ([node.scale.x, node.scale.y, node.scale.z].some((entry) => !Number.isFinite(entry) || entry <= 0)) errors.push(`invalid-scale:${node.name}`);
    if (Array.from(node.matrixWorld.elements).some((entry) => !Number.isFinite(entry))) errors.push(`nonfinite-matrix:${node.name}`);
    const determinant = node.matrixWorld.determinant(); if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) errors.push(`noninvertible-matrix:${node.name}`);
    if (node !== root && !node.parent) errors.push(`orphan:${node.name}`);
    const canonicalId = node.userData.canonicalId; if (typeof canonicalId === "string") ids.add(canonicalId);
    const geometry = node.geometry; if (!geometry) return;
    const position = geometry.attributes.position; const normal = geometry.attributes.normal;
    if (!position || position.count <= 0 || position.itemSize !== 3) errors.push(`position-attribute:${node.name}`);
    if (!normal || normal.count !== position?.count) errors.push(`normal-attribute:${node.name}`);
    for (const attribute of Object.values(geometry.attributes)) if (Array.from(attribute.array).some((entry) => !Number.isFinite(entry))) errors.push(`nonfinite-attribute:${node.name}`);
    if (geometry.index) for (let index = 0; index < geometry.index.count; index += 1) if (geometry.index.getX(index) < 0 || geometry.index.getX(index) >= position.count) errors.push(`index-range:${node.name}`);
    if (!node.userData.ownership || materialNames(node.material).some((name) => !MATERIAL_NAMES.includes(name as typeof MATERIAL_NAMES[number]))) errors.push(`material-ownership:${node.name}`);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty() || !geometry.boundingSphere || !Number.isFinite(geometry.boundingSphere.radius) || geometry.boundingSphere.radius <= 0 || geometry.boundingSphere.radius > 10) errors.push(`geometry-bounds:${node.name}`);
  });
  for (const id of PART_IDS) if (!ids.has(id)) errors.push(`missing-canonical-id:${id}`);
  return Object.freeze({ status: errors.length === 0 ? "PASS" : "FAIL", checks: Object.freeze(checks), errors: Object.freeze(errors) });
}

export async function createCinderRelayDrone(spec: CinderRelayDroneSpec, context: AssetForgeContext): Promise<GeneratedAsset> {
  validateCinderRelayDroneSpec(spec);
  if (!context || context.factoryVersion !== "1.0.0" || !context.three) throw new Error("AssetForgeContext is invalid");
  const T = context.three;
  const charcoal = makeMaterial(T, "charcoal-metal", { color: 0x24272b, metalness: 0.82, roughness: 0.48, flatShading: true });
  const steel = makeMaterial(T, "oxidized-steel", { color: 0x5b5147, metalness: 0.7, roughness: 0.65 });
  const ember = makeMaterial(T, "ember-core", { color: 0x4a1b08, emissive: 0xff5a16, emissiveIntensity: 1.7, metalness: 0.25, roughness: 0.28 }); ember.emissiveIntensity = 1.7;
  const cyan = makeMaterial(T, "sensor-cyan", { color: 0x082c34, emissive: 0x54d9e8, emissiveIntensity: 1.35, metalness: 0.35, roughness: 0.24 }); cyan.emissiveIntensity = 1.35;
  const marker = makeMaterial(T, "maintenance-marker", { color: 0xd08a2e, emissive: 0x3a1702, emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.55 }); marker.emissiveIntensity = 0.25;
  const materials = [charcoal, steel, ember, cyan, marker] as const;
  const resources: ResourceRegistration[] = materials.map((resource) => ({ category: "material", ownership: "OWNED", resource }));
  const geometries: GeometryLike[] = [];
  const geometry = <TGeometry extends GeometryLike>(value: TGeometry): TGeometry => { geometries.push(value); resources.push({ category: "geometry", ownership: "OWNED", resource: value }); return value; };
  const root = new T.Group(); root.name = ROOT_ID; root.userData.canonicalId = ROOT_ID; root.userData.ownership = "OWNED"; root.userData.visualRole = "industrial relay drone silhouette";

  const core = new T.Mesh(geometry(new T.IcosahedronGeometry(0.58, 2)), charcoal); registerPart(core, "core-housing", [charcoal.name], "compact faceted armored core"); setTransform(core, [0, 0, 0], [0, 0, 0], [1.22, 0.78, 0.86]); root.add(core);
  const emberCore = new T.Mesh(geometry(new T.SphereGeometry(0.205, 24, 16)), ember); registerPart(emberCore, "ember-core", [ember.name], "front thermal relay core"); setTransform(emberCore, [0, -0.02, 0.47], [0, 0, 0], [1.1, 0.78, 0.42]); root.add(emberCore);
  const sensorCluster = new T.Group(); registerPart(sensorCluster, "forward-sensor-cluster", [cyan.name], "paired cold-cyan forward sensors"); setTransform(sensorCluster, [0, 0.18, 0.5], [0, 0, 0], [1, 1, 1]);
  const sensorGeometry = geometry(new T.SphereGeometry(0.065, 16, 10)); const sensors = new T.InstancedMesh(sensorGeometry, cyan, 2); sensors.name = "forward-sensor-pair"; sensors.userData.ownership = "OWNED";
  const dummy = new T.Object3D(); setTransform(dummy, [-0.14, 0, 0], [0, 0, 0], [1, 0.78, 0.45]); dummy.updateMatrixWorld(true); (sensors as SceneNode & { setMatrixAt(index: number, matrix: MatrixLike): void }).setMatrixAt(0, dummy.matrixWorld);
  setTransform(dummy, [0.14, 0, 0], [0, 0, 0], [1, 0.78, 0.45]); dummy.updateMatrixWorld(true); (sensors as SceneNode & { setMatrixAt(index: number, matrix: MatrixLike): void }).setMatrixAt(1, dummy.matrixWorld);
  sensorCluster.add(sensors); root.add(sensorCluster);

  const relayRoot = new T.Group(); registerPart(relayRoot, "relay-arc-root", [steel.name, marker.name], "broken upper signal relay arc"); setTransform(relayRoot, [0, 0.43, -0.03], [0.12, 0, -0.04], [1, 1, 1]);
  const arcLeft = new T.Mesh(geometry(new T.TorusGeometry(0.43, 0.047, 10, 24, 1.38)), steel); registerPart(arcLeft, "relay-arc-left", [steel.name], "left relay arc segment"); setTransform(arcLeft, [-0.035, 0.03, 0], [0, 0, 0.89], [1, 1, 1]); relayRoot.add(arcLeft);
  const arcRight = new T.Mesh(geometry(new T.TorusGeometry(0.43, 0.047, 10, 20, 1.18)), marker); registerPart(arcRight, "relay-arc-right", [marker.name], "short repaired relay arc segment"); setTransform(arcRight, [0.035, 0.03, 0], [0, 0, 2.26], [1, 1, 1]); relayRoot.add(arcRight); root.add(relayRoot);

  const stabilizerGeometry = geometry(new T.BoxGeometry(0.48, 0.18, 0.33, 2, 1, 1));
  const left = new T.Mesh(stabilizerGeometry, steel); registerPart(left, "stabilizer-left", [steel.name], "broad industrial hover stabilizer"); setTransform(left, [-0.73, -0.03, -0.02], [0, 0.1, 0.08], [1, 1, 1]); root.add(left);
  const rightGeometry = geometry(new T.BoxGeometry(0.42, 0.16, 0.3, 2, 1, 1));
  const right = new T.Mesh(rightGeometry, charcoal); registerPart(right, "stabilizer-right", [charcoal.name], "compact replacement stabilizer"); setTransform(right, [0.69, 0.02, -0.02], [0, -0.08, -0.04], [1, 1, 1]); root.add(right);
  const lower = new T.Mesh(geometry(new T.CylinderGeometry(0.23, 0.29, 0.28, 12, 1, false)), steel); registerPart(lower, "lower-service-module", [steel.name], "underslung maintenance and cooling module"); setTransform(lower, [0.04, -0.48, -0.02], [0, 0, 0.05], [1, 1, 1]); root.add(lower);
  const damaged = new T.Mesh(geometry(new T.BoxGeometry(0.31, 0.22, 0.055)), steel); registerPart(damaged, "damaged-panel", [steel.name], "single displaced armor access panel"); setTransform(damaged, [0.39, 0.02, 0.47], [0.08, -0.22, 0.19], [1, 1, 1]); root.add(damaged);
  const markers = new T.Group(); registerPart(markers, "maintenance-markers", [marker.name], "asymmetric field-service markings"); setTransform(markers, [0, 0, 0], [0, 0, 0], [1, 1, 1]);
  const markerGeometry = geometry(new T.BoxGeometry(0.055, 0.018, 0.02)); const markerInstances = new T.InstancedMesh(markerGeometry, marker, 4); markerInstances.name = "maintenance-marker-stripes"; markerInstances.userData.ownership = "OWNED";
  const stripe = new T.Object3D(); for (let index = 0; index < 4; index += 1) { setTransform(stripe, [-0.17 + index * 0.115, -0.31, 0.493], [0, 0, -0.22], [1, 1, 1]); stripe.updateMatrixWorld(true); (markerInstances as SceneNode & { setMatrixAt(index: number, matrix: MatrixLike): void }).setMatrixAt(index, stripe.matrixWorld); }
  markers.add(markerInstances); root.add(markers);

  root.updateMatrixWorld(true);
  const validation = validateCinderGeometry(root); if (validation.status !== "PASS") { disposeModel({ root, resources }); throw new Error(`generated Cinder geometry failed validation: ${validation.errors.join(",")}`); }
  const box = new T.Box3().setFromObject(root); const center = new T.Object3D().position; box.getCenter(center); let radius = 0;
  root.traverse((node) => { if (node.geometry) { node.geometry.computeBoundingSphere(); const local = node.geometry.boundingSphere; if (local) radius = Math.max(radius, local.radius * Math.max(node.scale.x, node.scale.y, node.scale.z) + Math.hypot(node.position.x - center.x, node.position.y - center.y, node.position.z - center.z)); } });
  let triangles = 0; let drawCalls = 0; let objectCount = 0; const parts: CanonicalPartRecord[] = [];
  root.traverse((node) => { objectCount += 1; if (node.geometry) { triangles += geometryTriangles(node.geometry); drawCalls += 1; } if (typeof node.userData.canonicalId === "string" && PART_IDS.includes(node.userData.canonicalId as typeof PART_IDS[number])) parts.push(Object.freeze({ canonicalId: node.userData.canonicalId, transform: Object.freeze({ position: finiteTuple(node.position), rotation: finiteTuple(node.rotation), scale: finiteTuple(node.scale) }), ownership: "OWNED", materialAssignment: Object.freeze(materialNames(node.material).length > 0 ? materialNames(node.material) : [...(node.userData.materialAssignment as string[])]), bounds: boundsRecord(T, node), visualRole: String(node.userData.visualRole) })); });
  const applyRelayPulse = (frameIndex: number): void => { if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) throw new Error("relay-pulse frame index must be a non-negative integer"); const phase = (frameIndex % 120) / 120; const wave = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); ember.emissiveIntensity = 1.15 + wave * 1.1; cyan.emissiveIntensity = 0.95 + wave * 0.8; };
  const generated: GeneratedAsset = Object.freeze({
    root, resources: Object.freeze(resources), geometryStatistics: Object.freeze({ triangles, geometries: geometries.length, drawCalls, objectCount }),
    materialStatistics: Object.freeze({ materials: materials.length, textures: 0 as const, internalLights: 0 as const, names: MATERIAL_NAMES }),
    boundingBox: Object.freeze({ min: finiteTuple(box.min), max: finiteTuple(box.max) }), boundingSphere: Object.freeze({ center: finiteTuple(center), radius }),
    anchorPoints: Object.freeze({ origin: Object.freeze([0, 0, 0] as const), relay: Object.freeze([0, 0.78, -0.03] as const), forward: Object.freeze([0, 0, 0.6] as const), service: Object.freeze([0.04, -0.62, -0.02] as const) }),
    parts: Object.freeze(parts.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId))), captureMetadata: Object.freeze({ assetId: ROOT_ID, seed: spec.seed, factoryVersion: context.factoryVersion, animation: "relay-pulse" as const, durationSeconds: 2 as const, logicalHz: 60 as const }), validation,
    applyRelayPulse, dispose: () => disposeModel({ root, resources }),
  });
  return generated;
}
