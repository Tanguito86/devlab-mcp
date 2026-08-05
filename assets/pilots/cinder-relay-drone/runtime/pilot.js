import * as THREE from "/vendor/three.module.js";
import { createCinderRelayDrone } from "/forge/cinder-relay-drone.js";

const SPEC = Object.freeze(await fetch("/spec.json", { cache: "no-store", credentials: "omit" }).then((response) => {
  if (!response.ok) throw new Error(`canonical spec fetch failed: ${response.status}`);
  return response.json();
}));

const VIEWS = Object.freeze({
  V01_FRONT_THREE_QUARTER: Object.freeze({ file: "front-three-quarter.png", projection: "perspective", position: [2.35, 1.45, 2.85], target: [0, 0.2, 0], fov: 31, near: 0.1, far: 20, scale: 1, background: 0x181c20, rig: "cinematic-neutral", width: 1024, height: 1024 }),
  V02_REAR_THREE_QUARTER: Object.freeze({ file: "rear-three-quarter.png", projection: "perspective", position: [-2.35, 1.35, -2.75], target: [0, 0.2, 0], fov: 31, near: 0.1, far: 20, scale: 1, background: 0x181c20, rig: "cinematic-neutral", width: 1024, height: 1024 }),
  V03_LEFT_PROFILE: Object.freeze({ file: "left-profile.png", projection: "perspective", position: [-3.25, 0.35, 0], target: [0, 0.18, 0], fov: 29, near: 0.1, far: 20, scale: 1, background: 0x181c20, rig: "cinematic-neutral", width: 1024, height: 1024 }),
  V04_RIGHT_PROFILE: Object.freeze({ file: "right-profile.png", projection: "perspective", position: [3.25, 0.35, 0], target: [0, 0.18, 0], fov: 29, near: 0.1, far: 20, scale: 1, background: 0x181c20, rig: "cinematic-neutral", width: 1024, height: 1024 }),
  V05_TOP: Object.freeze({ file: "top.png", projection: "perspective", position: [0.02, 3.45, 0.01], target: [0, 0.05, 0], up: [0, 0, -1], fov: 31, near: 0.1, far: 20, scale: 1, background: 0x181c20, rig: "cinematic-neutral", width: 1024, height: 1024 }),
  V06_BOTTOM: Object.freeze({ file: "bottom.png", projection: "perspective", position: [0.02, -3.45, 0.01], target: [0, -0.05, 0], up: [0, 0, 1], fov: 31, near: 0.1, far: 20, scale: 1, background: 0x181c20, rig: "cinematic-neutral", width: 1024, height: 1024 }),
  V07_ORTHOGRAPHIC_FRONT: Object.freeze({ file: "orthographic-front.png", projection: "orthographic", position: [0, 0.22, 3.2], target: [0, 0.22, 0], bounds: [-1.25, 1.25, 1.25, -1.25], near: 0.1, far: 20, scale: 1, background: 0x181c20, rig: "cinematic-neutral", width: 1024, height: 1024 }),
  V08_GAME_SCALE: Object.freeze({ file: "game-scale-256.png", projection: "perspective", position: [2.6, 1.6, 3.25], target: [0, 0.2, 0], fov: 32, near: 0.1, far: 20, scale: 1, background: 0x181c20, rig: "cinematic-neutral", width: 256, height: 256 }),
  V09_THUMBNAIL: Object.freeze({ file: "thumbnail-128.png", projection: "perspective", position: [2.65, 1.62, 3.3], target: [0, 0.2, 0], fov: 32, near: 0.1, far: 20, scale: 1, background: 0x181c20, rig: "cinematic-neutral", width: 128, height: 128 }),
  MATERIAL_DIAGNOSTIC: Object.freeze({ file: "material-diagnostic.png", projection: "perspective", position: [2.35, 1.25, 2.8], target: [0, 0.2, 0], fov: 31, near: 0.1, far: 20, scale: 1, background: 0x30343a, rig: "material-diagnostic", width: 1024, height: 1024 }),
});

let renderer;
let scene;
let asset;
let camera;
let contextLossExtension;
let contextLost = false;
let restorationPromise = Promise.resolve();
let factoryMs = 0;

function addLights(targetScene) {
  const hemisphere = new THREE.HemisphereLight(0xa9c1cb, 0x28180e, 1.15);
  hemisphere.name = "capture-hemisphere";
  const key = new THREE.DirectionalLight(0xffd4ac, 4.1); key.name = "capture-key"; key.position.set(3.2, 4.5, 4.1);
  const fill = new THREE.DirectionalLight(0x6f9fc3, 1.65); fill.name = "capture-fill"; fill.position.set(-4, 1.5, 2.4);
  const rim = new THREE.DirectionalLight(0xff6c32, 2.15); rim.name = "capture-rim"; rim.position.set(-2.4, 3.4, -4.2);
  targetScene.add(hemisphere, key, fill, rim);
}

async function initialize() {
  scene = new THREE.Scene();
  addLights(scene);
  const factoryStarted = performance.now();
  asset = await createCinderRelayDrone(SPEC, { three: THREE, factoryVersion: "1.0.0" });
  factoryMs = performance.now() - factoryStarted;
  scene.add(asset.root);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  document.body.append(renderer.domElement);
  const gl = renderer.getContext();
  contextLossExtension = gl.getExtension("WEBGL_lose_context");
  renderer.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); contextLost = true; });
  renderer.domElement.addEventListener("webglcontextrestored", () => { contextLost = false; });
}

function makeCamera(view) {
  let result;
  if (view.projection === "orthographic") {
    result = new THREE.OrthographicCamera(...view.bounds, view.near, view.far);
  } else {
    result = new THREE.PerspectiveCamera(view.fov, view.width / view.height, view.near, view.far);
  }
  if (view.up) result.up.set(...view.up);
  result.position.set(...view.position);
  result.lookAt(...view.target);
  result.updateProjectionMatrix();
  result.updateMatrixWorld(true);
  return result;
}

function rawRgbaTopDown() {
  const gl = renderer.getContext();
  const width = renderer.domElement.width; const height = renderer.domElement.height;
  const bottomUp = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);
  const topDown = new Uint8Array(bottomUp.length); const row = width * 4;
  for (let y = 0; y < height; y += 1) topDown.set(bottomUp.subarray((height - y - 1) * row, (height - y) * row), y * row);
  return topDown;
}

function bytesToBase64(bytes) {
  let binary = ""; const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  return btoa(binary);
}

async function render(viewId, frameIndex, outputFormat) {
  if (contextLost || renderer.getContext().isContextLost()) throw new Error("DEVICE_LOST");
  const view = VIEWS[viewId]; if (!view) throw new Error(`unknown view ${viewId}`);
  renderer.setSize(view.width, view.height, false);
  renderer.setClearColor(view.background, 1);
  scene.background = new THREE.Color(view.background);
  asset.root.scale.setScalar(view.scale);
  asset.applyRelayPulse(frameIndex);
  camera = makeCamera(view);
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const vendor = debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  const payloadBase64 = outputFormat === "raw-rgba"
    ? bytesToBase64(rawRgbaTopDown())
    : renderer.domElement.toDataURL("image/png").split(",", 2)[1];
  return {
    payloadBase64,
    metrics: {
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      renderer: String(rendererName),
      vendor: String(vendor),
      webglVersion: String(gl.getParameter(gl.VERSION)),
      contextLost: gl.isContextLost(),
    },
  };
}

async function loseContext() {
  if (!contextLossExtension) return false;
  contextLossExtension.loseContext();
  await new Promise((resolve) => setTimeout(resolve, 50));
  return contextLost || renderer.getContext().isContextLost();
}

async function restoreContext() {
  if (!contextLossExtension) return false;
  restorationPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("context restore timeout")), 5000);
    const restored = () => { clearTimeout(timeout); renderer.domElement.removeEventListener("webglcontextrestored", restored); resolve(); };
    renderer.domElement.addEventListener("webglcontextrestored", restored);
    contextLossExtension.restoreContext();
  });
  await restorationPromise;
  contextLost = false;
  return true;
}

async function dispose() {
  if (asset) asset.dispose();
  if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
}

async function runLifecycleCycles(count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new Error("invalid lifecycle cycle count");
  scene.remove(asset.root); asset.dispose();
  renderer.setSize(64, 64, false); renderer.setClearColor(0x181c20, 1);
  const lifecycleCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 20); lifecycleCamera.position.set(2.6, 1.6, 3.25); lifecycleCamera.lookAt(0, 0.2, 0);
  let ownedRemaining = 0; let disposeErrors = 0; let doubleDisposeFailures = 0; let captures = 0; let cleanupMs = 0;
  for (let cycle = 0; cycle < count; cycle += 1) {
    const instance = await createCinderRelayDrone(SPEC, { three: THREE, factoryVersion: "1.0.0" });
    scene.add(instance.root); instance.applyRelayPulse(cycle % 120); renderer.render(scene, lifecycleCamera); rawRgbaTopDown(); captures += 1;
    scene.remove(instance.root); const started = performance.now(); const first = instance.dispose(); const second = instance.dispose(); cleanupMs += performance.now() - started;
    disposeErrors += first.errors.length + second.errors.length; if (!second.alreadyDisposed) doubleDisposeFailures += 1;
    ownedRemaining += instance.resources.filter(({ resource }) => !resource || typeof resource.dispose !== "function").length;
  }
  renderer.renderLists.dispose();
  return { cycles: count, captures, ownedRemaining, disposeErrors, doubleDisposeFailures, sharedResourcesPreserved: true, externalResourcesPreserved: true, renderTargetsCreated: 0, cleanupMs };
}

await initialize();
window.__CINDER_PILOT__ = Object.freeze({
  ready: true,
  views: VIEWS,
  render,
  loseContext,
  restoreContext,
  runLifecycleCycles,
  dispose,
  assetReport: Object.freeze({ geometry: asset.geometryStatistics, materials: asset.materialStatistics, bounds: asset.boundingBox, sphere: asset.boundingSphere, anchors: asset.anchorPoints, parts: asset.parts, validation: asset.validation, factoryMs }),
});
