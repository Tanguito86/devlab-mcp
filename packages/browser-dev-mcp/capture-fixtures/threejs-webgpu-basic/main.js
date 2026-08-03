// DevLab capture harness — WebGPU+TSL basic fixture (three@0.185.1).
// Original scene written from official Three.js docs (WebGPURenderer, TSL).
// Covers: WebGPURenderer init, TSL material, coherent-space displacement,
// setAnimationLoop, resize, DPR capped at 2, zero warnings.

import * as THREE from "three/webgpu";
import {
  Fn, float, vec3, color, time, oscSine,
  positionLocal, normalLocal, cameraPosition,
} from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const state = {
  seed: 1729,
  timeMs: 2500,
  viewpoint: "overview",
  variant: null,
  clock: null,
  controls: null,
  renderer: null,
  scene: null,
  camera: null,
  mesh: null,
  rafId: null,
  loopRunning: false,
  contextLost: false,
  frameCount: 0,
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VIEWPOINTS = ["overview", "instancing", "shader", "transparency", "postprocess"];

// eslint-disable-next-line no-unused-vars
let ring = null; // assigned in createScene

async function createRenderer() {
  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  // DPR capped at 2 (never unbounded)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(960, 540, false);
  return renderer;
}

function createScene(seed) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c10);

  const camera = new THREE.PerspectiveCamera(50, 960 / 540, 0.1, 100);

  // lights
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(4, 6, 3);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x334466, 0.6));

  // ground (receives shadows)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardNodeMaterial({ color: 0x1a1e26, roughnessNode: float(0.9) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // PBR hero with TSL material — displacement in LOCAL space (coherent)
  const heroMat = new THREE.MeshStandardNodeMaterial();
  heroMat.colorNode = color(0x1188ff).mul(oscSine(time.mul(0.5)).mul(0.5).add(0.5));
  heroMat.metalnessNode = float(0.35);
  heroMat.roughnessNode = float(0.25);
  // vertex displacement: positionLocal + normalLocal (both model space)
  heroMat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(2.0).add(positionLocal.y)).mul(0.06)),
  );
  const hero = new THREE.Mesh(new THREE.TorusKnotGeometry(0.85, 0.28, 160, 24), heroMat);
  hero.position.set(0, 1.7, 0);
  hero.castShadow = true;
  scene.add(hero);

  // instanced ring (layer 1: isolated from shader/transparency/postprocess views)
  const instMat = new THREE.MeshStandardNodeMaterial({ roughnessNode: float(0.6), metalnessNode: float(0.2) });
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), instMat, 200);
  inst.layers.set(1);
  scene.add(inst);
  const dummy = new THREE.Object3D();
  const rand = mulberry32(seed);
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < 200; i++) {
    const a = rand() * Math.PI * 2;
    const r = 5.5 + rand() * 4.5;
    dummy.position.set(Math.cos(a) * r, 0.11 + rand() * 1.1, Math.sin(a) * r);
    dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
    dummy.scale.setScalar(0.6 + rand() * 0.9);
    dummy.updateMatrix();
    m4.copy(dummy.matrix);
    inst.setMatrixAt(i, m4);
    c.setHSL(0.55 + rand() * 0.3, 0.6, 0.45 + rand() * 0.3);
    inst.setColorAt(i, c);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

  // TSL shader plane (waves, time-driven) — coherent: world-space lighting math
  const shaderMat = new THREE.MeshStandardNodeMaterial();
  shaderMat.colorNode = Fn(() => {
    const p = positionLocal;
    const wave = p.x.mul(1.5).add(time).sin().mul(p.z.mul(1.5).add(time.mul(0.7)).cos());
    const h = wave.mul(0.18).add(0.5);
    return color(0x2266aa).mul(h).add(color(0x88ccff).mul(h.mul(0.4)));
  })();
  const shaderPlane = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.4, 48, 32), shaderMat);
  shaderPlane.position.set(-4.2, 1.6, -1.6);
  shaderPlane.rotation.y = 0.6;
  scene.add(shaderPlane);

  // transparent glass pane
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshStandardNodeMaterial({
      color: 0x88ccff,
      transparent: true,
      opacityNode: float(0.35),
      roughnessNode: float(0.1),
      metalnessNode: float(0.0),
    }),
  );
  glass.position.set(2.8, 2.0, 1.9);
  glass.renderOrder = 2;
  scene.add(glass);

  // mini scene rendered to a texture (render target), shown on a "monitor"
  const rtScene = new THREE.Scene();
  rtScene.background = new THREE.Color(0x101420);
  const rtCam = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
  rtCam.position.set(0, 0.4, 2.2);
  const rtCube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardNodeMaterial({ colorNode: color(0xff6644), metalnessNode: float(0.1) }),
  );
  rtScene.add(rtCube);
  rtScene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const rt = new THREE.WebGLRenderTarget(256, 256);
  const monitorMat = new THREE.MeshBasicNodeMaterial();
  monitorMat.colorNode = THREE.texture(rt.texture);
  const monitor = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), monitorMat);
  monitor.position.set(2.8, 2.0, -2.4);
  monitor.rotation.y = Math.PI / 2 + 0.5;
  scene.add(monitor);

  return { scene, camera, hero, inst, rt, rtScene, rtCam, rtCube, shaderPlane, glass, monitor };
}

function applyViewpoint(id) {
  const table = {
    overview: { pos: [6.5, 4.6, 8.5], target: [0, 1.4, 0], layers: [0, 1] },
    instancing: { pos: [5.5, 2.6, 5.6], target: [3.4, 0.8, 3.4], layers: [0, 1] },
    shader: { pos: [-7.6, 2.8, -2.6], target: [-4.2, 1.6, -1.6], layers: [0] },
    transparency: { pos: [5.6, 3.2, 3.9], target: [2.8, 2.0, 1.9], layers: [0] },
    postprocess: { pos: [0.5, 3.4, 7.2], target: [0, 1.5, 0], layers: [0] },
  };
  const vp = table[id];
  if (!vp) throw new Error(`unknown viewpoint: ${id}`);
  state.camera.position.set(...vp.pos);
  state.camera.lookAt(...vp.target);
  state.camera.layers.set(0);
  for (const l of vp.layers) state.camera.layers.enable(l);
  state.viewpoint = id;
}

function updateSimulation() {
  // frozen simulation: everything derives from state.timeMs only
  const t = state.timeMs / 1000;
  if (state.hero) {
    state.hero.rotation.y = t * 0.8;
    state.hero.rotation.x = Math.sin(t * 0.5) * 0.3;
  }
  if (state.rtCube) {
    state.rtCube.rotation.y = t * 1.2;
    state.rtCube.rotation.x = t * 0.6;
  }
  if (state.renderer && state.rtScene && state.rtCam) {
    state.renderer.setRenderTarget(state.rt);
    state.renderer.render(state.rtScene, state.rtCam);
    state.renderer.setRenderTarget(null);
  }
}

async function ready() {
  if (state.renderer) return;
  state.renderer = await createRenderer();
  const built = createScene(state.seed);
  Object.assign(state, built);
  state.camera = built.camera;
  // lights must see both layers for the instanced ring
  for (const o of state.scene.children) {
    if (o.isLight) o.layers.enable(1);
  }
  const sun = state.scene.children.find((o) => o.isDirectionalLight);
  if (sun) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
  }
  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = false;

  window.addEventListener("resize", () => {
    const w = window.innerWidth || 960;
    const h = window.innerHeight || 540;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h, false);
    const size = Math.max(64, Math.floor(Math.min(w, h) / 3.5));
    state.rt.setSize(size, size);
  });

  // context loss handling
  const canvas = state.renderer.domElement;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    state.contextLost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    state.contextLost = false;
  });
}

const target = {
  version: 1,
  async ready() { await ready(); },
  async setSeed(seed) {
    state.seed = seed;
    // rebuild the instanced ring with the new seed
    const rand = mulberry32(seed);
    const dummy = new THREE.Object3D();
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < 200; i++) {
      const a = rand() * Math.PI * 2;
      const r = 5.5 + rand() * 4.5;
      dummy.position.set(Math.cos(a) * r, 0.11 + rand() * 1.1, Math.sin(a) * r);
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
      dummy.scale.setScalar(0.6 + rand() * 0.9);
      dummy.updateMatrix();
      m4.copy(dummy.matrix);
      state.inst.setMatrixAt(i, m4);
      c.setHSL(0.55 + rand() * 0.3, 0.6, 0.45 + rand() * 0.3);
      state.inst.setColorAt(i, c);
    }
    state.inst.instanceMatrix.needsUpdate = true;
    if (state.inst.instanceColor) state.inst.instanceColor.needsUpdate = true;
  },
  async setTime(ms) { state.timeMs = ms; },
  async setViewpoint(id) { applyViewpoint(id); },
  async renderOnce() {
    updateSimulation();
    await state.renderer.render(state.scene, state.camera);
  },
  async getMetrics() {
    return {
      drawCalls: state.renderer.info.render.calls,
      triangles: state.renderer.info.render.triangles,
      geometries: state.renderer.info.memory.geometries,
      textures: state.renderer.info.memory.textures,
      programs: (state.renderer.info.programs || []).length,
      seedApplied: state.seed,
      timeAppliedMs: state.timeMs,
      viewpointApplied: state.viewpoint,
    };
  },
};

window.__DEVLAB_CAPTURE__ = target;

// WebGPU frame reader: no readPixels on a webgpu canvas. After renderOnce()
// has awaited the render, copy the presented frame into a 2D canvas and read
// PNG + raw RGBA from there, in the same task.
window.__DEVLAB_FRAME__ = async () => {
  const canvas = state.renderer.domElement;
  const w = canvas.width;
  const h = canvas.height;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  return { png: tmp.toDataURL("image/png"), rgba: img.data, width: w, height: h };
};
window.__DEVLAB_CAPTURE_TEST__ = {
  startLoop() {
    if (state.loopRunning) return;
    state.loopRunning = true;
    state.clock = new THREE.Clock();
    const loop = () => {
      if (!state.loopRunning) return;
      state.rafId = requestAnimationFrame(loop);
      state.timeMs += Math.min(state.clock.getDelta(), 0.1) * 1000;
      updateSimulation();
      state.renderer.render(state.scene, state.camera);
      state.frameCount++;
    };
    loop();
  },
  stopLoop() {
    state.loopRunning = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
  },
  frameCount: () => state.frameCount,
  loseContext() {
    const gl = state.renderer.domElement.getContext("webgl2") || state.renderer.domElement.getContext("webgl");
    if (gl && gl.getExtension("WEBGL_lose_context")) gl.getExtension("WEBGL_lose_context").loseContext();
  },
  restoreContext() {
    const gl = state.renderer.domElement.getContext("webgl2") || state.renderer.domElement.getContext("webgl");
    if (gl && gl.getExtension("WEBGL_lose_context")) gl.getExtension("WEBGL_lose_context").restoreContext();
  },
};
