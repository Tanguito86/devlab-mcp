// DevLab capture harness — WebGPU RenderPipeline fixture (three@0.185.1).
// r183+ API: RenderPipeline + pass() + outputNode. Effects: bloom (addon),
// saturation + tint (grading), vignette (custom Fn). Variant "bloom-off"
// disables exactly ONE parameter for A/B. The comparison never measures
// different motion or time between variants (frozen simulation).

import * as THREE from "three/webgpu";
import {
  Fn, float, color, uniform, pass, screenUV,
  oscSine, saturation,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

const state = {
  seed: 1729,
  timeMs: 2500,
  viewpoint: "overview",
  variant: null,
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
const timeSeconds = uniform(2.5);

function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b18);

  const floorMaterial = new THREE.MeshStandardNodeMaterial();
  floorMaterial.colorNode = color(0x111a2c);
  floorMaterial.roughnessNode = float(0.82);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const towerGeometry = new THREE.BoxGeometry(0.7, 1, 0.7);
  const palette = [0x00d9ff, 0xff335f, 0x7dff4f, 0xffc247];
  for (let index = 0; index < 12; index++) {
    const material = new THREE.MeshStandardNodeMaterial();
    const swatch = palette[index % palette.length];
    const pulse = oscSine(timeSeconds.mul(0.35 + index * 0.031).add(index * 0.61))
      .mul(0.38).add(0.62);
    material.colorNode = color(swatch).mul(0.16);
    material.emissiveNode = color(swatch).mul(pulse.mul(3.1));
    material.roughnessNode = float(0.34);
    material.metalnessNode = float(0.52);
    const tower = new THREE.Mesh(towerGeometry, material);
    const column = index % 4;
    const row = Math.floor(index / 4);
    const height = 0.8 + ((index * 7) % 5) * 0.32;
    tower.scale.y = height;
    tower.position.set((column - 1.5) * 1.55, height * 0.5, (row - 1) * 1.7);
    scene.add(tower);
  }

  const coreMaterial = new THREE.MeshStandardNodeMaterial();
  coreMaterial.colorNode = color(0x8ea7c7);
  coreMaterial.metalnessNode = float(0.88);
  coreMaterial.roughnessNode = float(0.16);
  const core = new THREE.Mesh(new THREE.TorusKnotGeometry(0.72, 0.22, 96, 16), coreMaterial);
  core.position.set(0, 2.4, 0);
  scene.add(core);

  const key = new THREE.DirectionalLight(0xc9ddff, 2.1);
  key.position.set(-3, 7, 5);
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0x315b88, 0x130d1e, 0.8));

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
  const b = bloom(sceneColor);
  b.threshold = bloomThreshold;
  b.strength = bloomStrength;
  b.radius = uniform(0.6);
  output = output.add(b);
  output = saturation(output, saturationAmount);
  output = output.mul(colorTint);
  const vignette = Fn(() => {
    const centered = screenUV.mul(2.0).sub(1.0);
    const radialEnergy = centered.dot(centered);
    return float(1.0).sub(radialEnergy.mul(vignetteIntensity)).saturate();
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
  async setTime(ms) {
    state.timeMs = ms;
    timeSeconds.value = ms / 1000;
  },
  async setViewpoint(id) { applyViewpoint(id); },
  async setVariant(id) {
    if (id !== null && id !== "bloom-off") throw new Error(`unknown variant: ${id}`);
    state.variant = id;
    state.bloomEnabled = id !== "bloom-off";
    bloomStrength.value = state.bloomEnabled ? 1.1 : 0;
  },
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
      variantApplied: state.variant,
      canvasCount: document.querySelectorAll("canvas").length,
      activeLoopCount: 0,
    };
  },
};

window.__DEVLAB_CAPTURE__ = target;
window.__DEVLAB_FRAME__ = async () => {
  const canvas = state.renderer.domElement;
  const w = canvas.width;
  const h = canvas.height;
  const png = canvas.toDataURL("image/png");
  const decoded = new Image();
  decoded.src = png;
  await decoded.decode();
  if (decoded.naturalWidth !== w || decoded.naturalHeight !== h) {
    throw new Error("decoded WebGPU frame dimensions do not match the canvas");
  }
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  ctx.drawImage(decoded, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  return { png, rgba: img.data, width: w, height: h };
};
