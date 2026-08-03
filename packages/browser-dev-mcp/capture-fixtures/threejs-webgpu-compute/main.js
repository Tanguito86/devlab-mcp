// DevLab capture harness — WebGPU compute fixture (three@0.185.1).
// Deterministic particle physics on the GPU: seed drives the initial state,
// frozen time drives the simulation steps, compute() advances it.
// Budget: 16384 particles (NOT 100000 — the audited skill used that with
// expensive sphere geometry; this fixture uses cheap Points).

import * as THREE from "three/webgpu";
import {
  Fn, If, float, color, uniform,
  instancedArray, instanceIndex,
} from "three/tsl";

const PARTICLE_COUNT = 16384;
const state = {
  seed: 1729,
  timeMs: 2500,
  viewpoint: "overview",
  renderer: null,
  scene: null,
  camera: null,
  positions: null,
  velocities: null,
  computeStep: null,
  points: null,
  stepsRun: 0,
  stepsForTime: 0,
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VIEWPOINTS = ["overview", "closeup"];

// storage buffers
const positions = instancedArray(PARTICLE_COUNT, "vec3");
const velocities = instancedArray(PARTICLE_COUNT, "vec3");
const gravity = uniform(-2.6);
const bounce = uniform(0.55);
const dt = uniform(0.02); // fixed step: deterministic, time-driven

// one physics step on the GPU (frozen simulation: only dt, gravity, bounce)
const computeStep = Fn(() => {
  const pos = positions.element(instanceIndex);
  const vel = velocities.element(instanceIndex);
  vel.y.addAssign(gravity.mul(dt));
  pos.addAssign(vel.mul(dt));
  If(pos.y.lessThan(0), () => {
    pos.y.assign(0);
    vel.y.assign(vel.y.abs().mul(bounce));
    vel.x.mulAssign(0.92);
    vel.z.mulAssign(0.92);
  });
  If(pos.x.abs().greaterThan(4.4), () => {
    pos.x.assign(pos.x.sign().mul(4.4));
    vel.x.assign(vel.x.negate().mul(bounce));
  });
  If(pos.z.abs().greaterThan(4.4), () => {
    pos.z.assign(pos.z.sign().mul(4.4));
    vel.z.assign(vel.z.negate().mul(bounce));
  });
})().compute(PARTICLE_COUNT);

// deterministic CPU-side initial state from the seed
function fillInitialState(seed) {
  const rand = mulberry32(seed);
  const posArr = positions.value.array;
  const velArr = velocities.value.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    posArr[i * 3] = (rand() - 0.5) * 6;
    posArr[i * 3 + 1] = rand() * 4;
    posArr[i * 3 + 2] = (rand() - 0.5) * 6;
    velArr[i * 3] = (rand() - 0.5) * 1.2;
    velArr[i * 3 + 1] = rand() * 1.5;
    velArr[i * 3 + 2] = (rand() - 0.5) * 1.2;
  }
  positions.value.needsUpdate = true;
  velocities.value.needsUpdate = true;
}

async function ready() {
  if (state.renderer) return;
  fillInitialState(state.seed);

  state.renderer = new THREE.WebGPURenderer({
    canvas: document.getElementById("c"),
    antialias: false,
  });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.renderer.setSize(960, 540, false);
  await state.renderer.init();

  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x0c0e14);
  state.camera = new THREE.PerspectiveCamera(55, 960 / 540, 0.1, 50);
  state.camera.position.set(0, 3.4, 8.2);

  const mat = new THREE.SpriteNodeMaterial({ transparent: false });
  mat.positionNode = positions.toAttribute();
  mat.colorNode = Fn(() => {
    const vel = velocities.toAttribute();
    const speed = vel.length().div(2.0).saturate();
    return color(0x1144ff).mix(color(0xffaa22), speed);
  })();
  mat.scaleNode = float(0.09);
  state.points = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    mat,
    PARTICLE_COUNT,
  );
  const identity = new THREE.Matrix4();
  for (let index = 0; index < PARTICLE_COUNT; index++) {
    state.points.setMatrixAt(index, identity);
  }
  state.points.instanceMatrix.needsUpdate = true;
  state.points.frustumCulled = false;
  state.scene.add(state.points);

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
    overview: { pos: [0, 3.4, 8.2], target: [0, 1.4, 0] },
    closeup: { pos: [2.2, 1.9, 3.4], target: [0.6, 1.0, 0.4] },
  };
  const vp = table[id];
  if (!vp) throw new Error(`unknown viewpoint: ${id}`);
  state.camera.position.set(...vp.pos);
  state.camera.lookAt(...vp.target);
  state.viewpoint = id;
}

// simulation advances in fixed 20ms steps: steps = timeMs / 20
function advanceToTime(ms) {
  const steps = Math.floor(ms / 20);
  for (let i = state.stepsRun; i < steps; i++) {
    state.renderer.compute(computeStep);
  }
  state.stepsRun = Math.max(state.stepsRun, steps);
  state.stepsForTime = steps;
}

const target = {
  version: 1,
  async ready() { await ready(); },
  async setSeed(seed) {
    state.seed = seed;
    fillInitialState(seed);
    state.stepsRun = 0;
    state.stepsForTime = 0;
  },
  async setTime(ms) { state.timeMs = ms; },
  async setViewpoint(id) { applyViewpoint(id); },
  async renderOnce() {
    advanceToTime(state.timeMs);
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
      particles: PARTICLE_COUNT,
      bufferBytes: positions.value.array.byteLength + velocities.value.array.byteLength,
      stepsRun: state.stepsForTime,
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
