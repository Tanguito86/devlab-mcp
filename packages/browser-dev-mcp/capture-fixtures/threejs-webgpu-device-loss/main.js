// DevLab capture harness — WebGPU device-loss fixture (three@0.185.1).
// Tests loss detection + recovery WITHOUT duplicating canvas, loops or
// listeners. The renderer is rebuilt on the SAME canvas element; no
// setAnimationLoop is used (explicit render only); the lost handler is
// registered once per device (each new device gets its own handler).
//
// PRIVATE_API_DEPENDENCY: three@0.185.1 exposes no public destroy/lost
// surface, so this fixture reads `renderer.backend.device` — the same
// pattern the audited skill documents. VERSION_PINNED / NOT GENERALIZED.

import * as THREE from "three/webgpu";
import { color, float, time, oscSine } from "three/tsl";

const state = {
  seed: 1729,
  timeMs: 2500,
  viewpoint: "overview",
  renderer: null,
  scene: null,
  camera: null,
  mesh: null,
  recoveryCount: 0,
  lostObserved: false,
  initialRenderDone: false,
};

async function buildRenderer(canvas) {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(960, 540, false);
  await renderer.init();
  return renderer;
}

function buildSceneContent(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1016);
  const camera = new THREE.PerspectiveCamera(50, 960 / 540, 0.1, 100);
  camera.position.set(3.2, 2.8, 4.6);
  camera.lookAt(0, 1.2, 0);

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(3, 5, 2);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x334466, 0.6));

  const mat = new THREE.MeshStandardNodeMaterial();
  mat.colorNode = color(0x22aa66).mul(oscSine(time.mul(0.6)).mul(0.4).add(0.6));
  mat.metalnessNode = float(0.4);
  mat.roughnessNode = float(0.3);
  const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.3, 128, 20), mat);
  mesh.position.y = 1.5;
  scene.add(mesh);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardNodeMaterial({ colorNode: color(0x1a1e26), roughnessNode: float(0.9) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  return { scene, camera, mesh };
}

async function initWebGPU(canvas) {
  const renderer = await buildRenderer(canvas);
  const content = buildSceneContent(renderer);
  Object.assign(state, { renderer, ...content });

  // ---- loss detection + recovery (once per device) ----
  const device = renderer.backend.device; // PRIVATE_API_DEPENDENCY (documented)
  device.lost.then(async (info) => {
    state.lostObserved = true;
    state.recoveryCount++;
    if (info.reason === "unknown" || info.reason === "destroyed") {
      // dispose old renderer resources; do NOT remove the canvas
      renderer.dispose();
      // re-initialize on the SAME canvas (no duplicate DOM, no new loop)
      await initWebGPU(canvas);
    }
  });
}

async function ready() {
  if (state.renderer) return;
  const canvas = document.getElementById("c");
  await initWebGPU(canvas);
}

const target = {
  version: 1,
  async ready() { await ready(); },
  async setSeed(seed) { state.seed = seed; },
  async setTime(ms) { state.timeMs = ms; },
  async setViewpoint(id) {
    if (id !== "overview") throw new Error(`unknown viewpoint: ${id}`);
    state.viewpoint = id;
  },
  async renderOnce() {
    const t = state.timeMs / 1000;
    if (state.mesh) {
      state.mesh.rotation.y = t * 0.7;
      state.mesh.rotation.x = Math.sin(t * 0.4) * 0.35;
    }
    if (!state.renderer) throw new Error("renderer not initialized");
    await state.renderer.render(state.scene, state.camera);
    state.initialRenderDone = true;
  },
  async getMetrics() {
    return {
      drawCalls: state.renderer ? state.renderer.info.render.calls : 0,
      triangles: state.renderer ? state.renderer.info.render.triangles : 0,
      geometries: state.renderer ? state.renderer.info.memory.geometries : 0,
      textures: state.renderer ? state.renderer.info.memory.textures : 0,
      programs: state.renderer ? (state.renderer.info.programs || []).length : 0,
      seedApplied: state.seed,
      timeAppliedMs: state.timeMs,
      viewpointApplied: state.viewpoint,
      recoveryCount: state.recoveryCount,
      lostObserved: state.lostObserved,
      initialRenderDone: state.initialRenderDone,
      canvasCount: document.querySelectorAll("canvas").length,
    };
  },
};

window.__DEVLAB_CAPTURE__ = target;
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
  destroyDevice() {
    if (state.renderer && state.renderer.backend.device) {
      state.renderer.backend.device.destroy();
    }
  },
  recoveryCount: () => state.recoveryCount,
  lostObserved: () => state.lostObserved,
};
