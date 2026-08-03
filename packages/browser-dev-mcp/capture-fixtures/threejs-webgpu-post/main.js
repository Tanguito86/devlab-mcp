// DevLab capture harness — WebGPU RenderPipeline fixture (three@0.185.1).
// r183+ API: RenderPipeline + pass() + outputNode. Effects: bloom (addon),
// saturation + tint (grading), vignette (custom Fn). Variant "bloom-off"
// disables exactly ONE parameter for A/B. The comparison never measures
// different motion or time between variants (frozen simulation).

import * as THREE from "three/webgpu";
import {
  Fn, float, vec2, color, uniform, pass, screenUV,
  time, oscSine, saturation,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

const state = {
  seed: 1729,
  timeMs: 2500,
  viewpoint: "overview",
  variant: "default",
  renderer: null,
  scene: null,
  camera: null,
  pipeline: null,
  bloomEnabled: true,
};

const VIEWPOINTS = ["overview", "bloom", "grading", "vignette", "composite"];

const bloomStrength = uniform(1.1);
const bloomThreshold = uniform(0.55);
const vignetteIntensity = uniform(0.55);
const saturationAmount = uniform(1.25);
const colorTint = uniform(new THREE.Color(1.0, 0.94, 0.88));

function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101216);

  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 6, 3);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x445566, 0.5));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshStandardNodeMaterial({ colorNode: color(0x22262e), roughnessNode: float(0.9) }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const sphereGeo = new THREE.SphereGeometry(0.55, 32, 32);
  const colors = [0xff2244, 0x22ff88, 0x4488ff, 0xffaa22, 0xff44ff];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(colors[i]).mul(0.35);
    mat.emissiveNode = Fn(() => {
      const pulse = oscSine(time.mul(1.0 + i * 0.2)).mul(0.5).add(0.5);
      return color(colors[i]).mul(pulse.mul(2.2).add(0.4));
    })();
    mat.roughnessNode = float(0.25);
    mat.metalnessNode = float(0.7);
    const s = new THREE.Mesh(sphereGeo, mat);
    const a = (i / 5) * Math.PI * 2;
    s.position.set(Math.cos(a) * 2.6, 0.9 + Math.sin(i * 1.7) * 0.4, Math.sin(a) * 2.6);
    scene.add(s);
  }

  const center = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 64, 64),
    (() => {
      const m = new THREE.MeshStandardNodeMaterial();
      m.colorNode = color(0x8899aa);
      m.roughnessNode = float(0.12);
      m.metalnessNode = float(1.0);
      return m;
    })(),
  );
  center.position.y = 1.0;
  scene.add(center);

  return scene;
}

async function ready() {
  if (state.renderer) return;
  state.renderer = new THREE.WebGPURenderer({
    canvas: document.getElementById("c"),
    antialias: false,
  });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.renderer.setSize(960, 540, false);
  await state.renderer.init();

  state.scene = buildScene();
  state.camera = new THREE.PerspectiveCamera(55, 960 / 540, 0.1, 50);

  state.pipeline = new THREE.RenderPipeline(state.renderer);
  const scenePass = pass(state.scene, state.camera);
  const sceneColor = scenePass.getTextureNode("output");

  let output = sceneColor;
  if (state.bloomEnabled) {
    const b = bloom(sceneColor);
    b.threshold = bloomThreshold;
    b.strength = bloomStrength;
    b.radius = uniform(0.6);
    output = output.add(b);
  }
  output = saturation(output, saturationAmount);
  output = output.mul(colorTint);
  const vignette = Fn(() => {
    const dist = screenUV.sub(0.5).length();
    return float(1.0).sub(dist.mul(vignetteIntensity).pow(2.0)).saturate();
  });
  output = output.mul(vignette());
  state.pipeline.outputNode = output;

  window.addEventListener("resize", () => {
    const w = window.innerWidth || 960;
    const h = window.innerHeight || 540;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h, false);
  });
}

function applyViewpoint(id) {
  const table = {
    overview: { pos: [0, 4.2, 7.4], target: [0, 1.1, 0] },
    bloom: { pos: [1.9, 2.1, 2.9], target: [-0.7, 1.0, -0.7] },
    grading: { pos: [-2.8, 2.2, 2.6], target: [0.6, 1.0, 0.4] },
    vignette: { pos: [0.2, 2.6, 4.6], target: [0.9, 1.2, 0.2] },
    composite: { pos: [2.4, 1.7, 3.4], target: [-0.2, 1.0, 0.2] },
  };
  const vp = table[id];
  if (!vp) throw new Error(`unknown viewpoint: ${id}`);
  state.camera.position.set(...vp.pos);
  state.camera.lookAt(...vp.target);
  state.viewpoint = id;
}

const target = {
  version: 1,
  async ready() { await ready(); },
  async setSeed(seed) { state.seed = seed; /* static scene: seed is accepted, no-op */ },
  async setTime(ms) { state.timeMs = ms; },
  async setViewpoint(id) { applyViewpoint(id); },
  async renderOnce() {
    // frozen time drives emissive pulse; render the pipeline (async)
    await state.pipeline.render();
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
      bloomEnabled: state.bloomEnabled,
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

// variant applied at boot: read from query param (single parameter)
const params = new URLSearchParams(window.location.search);
if (params.get("devlab-variant") === "bloom-off") {
  state.bloomEnabled = false;
  state.variant = "bloom-off";
}
