// DevLab capture harness — synthetic Three.js fixture.
// Original scene: no Galaxy Raiders content, no Jungle Trail content.
// Deterministic: layout derived from a seeded PRNG, simulation time frozen
// unless the animation loop is explicitly started (perf flow).
//
// Contract: window.__DEVLAB_CAPTURE__ (see scripts/capture-harness/contract.js)
// Test helpers: window.__DEVLAB_CAPTURE_TEST__ (loop + context loss controls).

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const VARIANT = new URLSearchParams(location.search).get("devlab-variant");
const VIEWPOINTS = ["overview", "instancing", "shader", "transparency", "postprocess"];

// ---- seeded PRNG (mulberry32) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- renderer ----
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // deterministic rasterization
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---- scene ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(8, 5, 10);

// ---- lights ----
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -8;
sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -8;
scene.add(sun);
sun.layers.enable(1);
const ambient = new THREE.AmbientLight(0x334466, 0.55);
ambient.layers.enable(1);
scene.add(ambient);

// ---- PBR hero object (animation depends on frozen time) ----
const hero = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 1.6, 1.6),
  new THREE.MeshStandardMaterial({ color: 0x7a4dd0, metalness: 0.35, roughness: 0.3 }),
);
hero.castShadow = true;
hero.position.set(0, 1.4, 0);
scene.add(hero);

const orb = new THREE.Mesh(
  new THREE.SphereGeometry(0.9, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0xd08a3a, metalness: 0.85, roughness: 0.18 }),
);
orb.castShadow = true;
orb.position.set(3.2, 1.0, -1.4);
scene.add(orb);

// ---- ground ----
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x22303c, roughness: 0.92, metalness: 0.05 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---- instanced field (layout from seeded PRNG) ----
const INSTANCE_COUNT = 200;
const instanceGeometry = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const instanceMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.15 });
const instances = new THREE.InstancedMesh(instanceGeometry, instanceMaterial, INSTANCE_COUNT);
// Layer 1: only overview/instancing cameras see the field, so a seed change
// cannot leak into shader/transparency/postprocess frames (isolation for
// sensitivity testing). Lights see both layers; the field casts no shadows
// (shadow frustum is center-only).
instances.layers.set(1);
instances.castShadow = false;
instances.receiveShadow = false;
scene.add(instances);
const instanceMatrix = new THREE.Matrix4();
const instanceColor = new THREE.Color();

let seedState = 1729;
let timeStateMs = 2500;
let viewpointState = "overview";
let bloomEnabled = VARIANT !== "bloom-off";
let variantState = VARIANT || null;

function regenerateLayout() {
  const rand = mulberry32(seedState);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < INSTANCE_COUNT; i++) {
    // Ring layout: radius 9.5..14 keeps the field OUT of the shader,
    // transparency and postprocess view cones, AND outside the shadow camera
    // frustum (+-8), so a seed change only affects viewpoints that actually
    // show the field (overview, instancing).
    const angle = rand() * Math.PI * 2;
    const radius = 9.5 + rand() * 4.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 0.11 + rand() * 1.1;
    dummy.position.set(x, y, z);
    dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
    dummy.scale.setScalar(0.7 + rand() * 0.9);
    dummy.updateMatrix();
    instanceMatrix.copy(dummy.matrix);
    instances.setMatrixAt(i, instanceMatrix);
    instanceColor.setHSL(0.55 + rand() * 0.25, 0.55, 0.4 + rand() * 0.3);
    instances.setColorAt(i, instanceColor);
  }
  instances.instanceMatrix.needsUpdate = true;
  instances.instanceColor.needsUpdate = true;
}

// ---- shader plane (time-driven waves + fresnel rim) ----
const shaderPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(5, 3.4, 48, 32),
  new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0x1b6f8f) },
      uColorB: { value: new THREE.Color(0x9fe8ff) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += sin(p.x * 2.4 + uTime * 1.6) * 0.22 + cos(p.y * 2.0 + uTime * 1.1) * 0.16;
        vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      void main() {
        float wave = 0.5 + 0.5 * sin(vUv.x * 9.0 + uTime * 1.6) * sin(vUv.y * 7.0 + uTime * 1.1);
        vec3 col = mix(uColorA, uColorB, wave);
        float rim = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 2.4);
        col += vec3(0.35, 0.55, 0.75) * rim * 0.8;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  }),
);
shaderPlane.position.set(-3.4, 2.1, -2.2);
scene.add(shaderPlane);

// ---- transparency: glass sheet ----
const glass = new THREE.Mesh(
  new THREE.BoxGeometry(2.6, 0.08, 1.8),
  new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.35,
    roughness: 0.08,
    metalness: 0.1,
    depthWrite: false,
  }),
);
glass.position.set(2.6, 2.2, 1.8);
glass.rotation.y = 0.6;
glass.renderOrder = 1;
scene.add(glass);

// ---- render target: mini scene mapped onto a "monitor" ----
const rtSize = 256;
const renderTarget = new THREE.WebGLRenderTarget(rtSize, rtSize, {
  depthBuffer: true,
});
const rtScene = new THREE.Scene();
rtScene.background = new THREE.Color(0x101418);
const rtCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
rtCamera.position.set(0, 1.2, 3.4);
rtCamera.lookAt(0, 0.6, 0);
const rtCube = new THREE.Mesh(
  new THREE.BoxGeometry(0.9, 0.9, 0.9),
  new THREE.MeshStandardMaterial({ color: 0xe04a4a, roughness: 0.4 }),
);
rtScene.add(rtCube);
const rtLight = new THREE.DirectionalLight(0xffffff, 2);
rtLight.position.set(2, 4, 3);
rtScene.add(rtLight);
const monitor = new THREE.Mesh(
  new THREE.BoxGeometry(2.2, 1.5, 0.12),
  new THREE.MeshStandardMaterial({ map: renderTarget.texture, roughness: 0.5 }),
);
monitor.position.set(-2.4, 1.6, 2.0);
monitor.rotation.y = -0.5;
scene.add(monitor);

// ---- postprocessing (bloom; OutputPass handles tone mapping + color space) ----
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.65, 0.55, 0.82);
bloomPass.enabled = bloomEnabled;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ---- camera viewpoints ----
const VIEWPOINT_TABLE = {
  overview: { pos: [8, 5, 10], target: [0, 1.2, 0], layers: [0, 1] },
  instancing: { pos: [8.5, 3.2, 8.5], target: [5.5, 0.6, 5.5], layers: [0, 1] },
  shader: { pos: [-7.4, 2.6, -1.4], target: [-3.4, 1.6, -2.2], layers: [0] },
  transparency: { pos: [5.4, 3.0, 3.6], target: [2.6, 1.8, 1.8], layers: [0] },
  postprocess: { pos: [1.6, 3.4, 6.8], target: [0, 1.2, 0], layers: [0] },
};

function applyViewpoint(id) {
  if (!VIEWPOINTS.includes(id)) {
    throw new Error(`unknown viewpoint: ${id}`);
  }
  const vp = VIEWPOINT_TABLE[id];
  camera.position.set(...vp.pos);
  camera.lookAt(...vp.target);
  camera.layers.set(0);
  for (const layer of vp.layers) camera.layers.enable(layer);
  viewpointState = id;
}

// ---- resize ----
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
  const size = Math.max(64, Math.min(w, h) / 3);
  renderTarget.setSize(Math.floor(size), Math.floor(size));
}
window.addEventListener("resize", onResize);

// ---- context loss / restore ----
let contextLost = false;
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  contextLost = true;
});
canvas.addEventListener("webglcontextrestored", () => {
  contextLost = false;
  // Recreate GPU-owned resources that may have been dropped.
  const size = Math.max(64, Math.min(window.innerWidth, window.innerHeight) / 3);
  renderTarget.setSize(Math.floor(size), Math.floor(size));
  monitor.material.map = renderTarget.texture;
  monitor.material.needsUpdate = true;
  renderer.shadowMap.enabled = true;
});

// ---- simulation update (frozen time) ----
function updateScene() {
  const t = timeStateMs / 1000;
  hero.rotation.y = t * 0.7;
  hero.rotation.x = Math.sin(t * 0.5) * 0.25;
  orb.position.y = 1.0 + Math.sin(t * 1.3) * 0.35;
  shaderPlane.material.uniforms.uTime.value = t;
  rtCube.rotation.y = t * 1.1;
  rtCube.rotation.x = t * 0.4;
}

function renderOnce() {
  updateScene();
  renderer.setRenderTarget(renderTarget);
  renderer.render(rtScene, rtCamera);
  renderer.setRenderTarget(null);
  composer.render();
}

function setVariant(id) {
  if (id !== null && id !== "bloom-off") throw new Error(`unknown variant: ${id}`);
  variantState = id;
  bloomEnabled = id !== "bloom-off";
  bloomPass.enabled = bloomEnabled;
}

// ---- animation loop (only used by the perf flow) ----
let loopRunning = false;
let loopClock = null;
function startLoop() {
  if (loopRunning) return;
  loopRunning = true;
  loopClock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = loopClock.getDelta();
    timeStateMs += delta * 1000;
    renderOnce();
  });
}
function stopLoop() {
  loopRunning = false;
  renderer.setAnimationLoop(null);
}

// ---- contract ----
let readyResolved = false;
const contract = {
  version: 1,
  async ready() {
    // one microtask; scene is built synchronously at module evaluation
    await Promise.resolve();
    readyResolved = true;
  },
  async setSeed(seed) {
    if (typeof seed !== "number" || !Number.isFinite(seed)) throw new Error("seed must be a finite number");
    seedState = seed;
    regenerateLayout();
  },
  async setTime(milliseconds) {
    if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds)) {
      throw new Error("time must be a finite number");
    }
    timeStateMs = milliseconds;
  },
  async setViewpoint(id) {
    applyViewpoint(id);
  },
  async setVariant(id) {
    setVariant(id);
  },
  async renderOnce() {
    renderOnce();
  },
  async getMetrics() {
    const info = renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      seedApplied: seedState,
      timeAppliedMs: timeStateMs,
      viewpointApplied: viewpointState,
      variantApplied: variantState,
      resize: {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        cameraAspect: camera.aspect,
        pixelRatio: renderer.getPixelRatio(),
        renderTargetWidth: renderTarget.width,
        renderTargetHeight: renderTarget.height,
        composerWidth: composer.readBuffer.width,
        composerHeight: composer.readBuffer.height,
      },
    };
  },
};

window.__DEVLAB_CAPTURE__ = contract;
window.__DEVLAB_CAPTURE_TEST__ = {
  sessionId: crypto.randomUUID(),
  startLoop,
  stopLoop,
  loseContext() {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  },
  restoreContext() {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.restoreContext();
  },
};

// ---- boot ----
regenerateLayout();
applyViewpoint("overview");
onResize();
renderOnce();
console.log(`[fixture] boot ok seed=${seedState} time=${timeStateMs} variant=${VARIANT || "default"} three=${THREE.REVISION}`);
