import * as THREE from "three/webgpu";
import { color, float, oscSine, uniform } from "three/tsl";

import type { CaptureMetrics, DevLabFrame } from "./capture-contract.js";
import { FixedStepAccumulator, FIXED_STEP_HZ } from "./core/fixed-step.js";
import { SeededRandom } from "./core/random.js";
import { ResourceOwner } from "./core/resource-owner.js";
import { computeViewportPlan } from "./core/viewport.js";

const TITLE_VIEWPOINT = "title";
const INSTANCE_COUNT = 72;

export class BenchmarkScaffoldEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLOutputElement;
  private readonly owner = new ResourceOwner();
  private readonly clock = new FixedStepAccumulator({
    stepSeconds: 1 / FIXED_STEP_HZ,
    maxCatchUpSteps: 8,
  });

  private readyPromise: Promise<void> | null = null;
  private renderer: any = null;
  private scene: any = null;
  private camera: any = null;
  private hero: any = null;
  private halo: any = null;
  private instances: any = null;
  private pulseTime: any = null;
  private resizeTarget: any = null;

  private seedApplied = 0;
  private timeAppliedMs = 0;
  private viewpointApplied = TITLE_VIEWPOINT;
  private previousVisualSeconds = 0;
  private currentVisualSeconds = 0;
  private animationFrameId: number | null = null;
  private lastAnimationTimeMs: number | null = null;
  private loopRunning = false;
  private closed = false;

  constructor(canvas: HTMLCanvasElement, status: HTMLOutputElement) {
    this.canvas = canvas;
    this.status = status;
  }

  ready(): Promise<void> {
    this.readyPromise ??= this.initialize();
    return this.readyPromise;
  }

  async setSeed(seed: number): Promise<void> {
    await this.ready();
    if (!Number.isFinite(seed)) throw new RangeError("seed must be finite");
    this.seedApplied = seed;
    this.applySeed(seed);
  }

  async setTime(milliseconds: number): Promise<void> {
    await this.ready();
    this.stopLoop();
    this.clock.freezeAt(milliseconds);
    this.timeAppliedMs = milliseconds;
    this.previousVisualSeconds = this.clock.simulationSeconds;
    this.currentVisualSeconds = this.clock.simulationSeconds;
    this.updateVisualState(this.currentVisualSeconds);
  }

  async setViewpoint(id: string): Promise<void> {
    await this.ready();
    if (id !== TITLE_VIEWPOINT) throw new Error(`unknown viewpoint: ${id}`);
    this.camera.position.set(7.4, 4.6, 8.8);
    this.camera.lookAt(0, 1.35, 0);
    this.viewpointApplied = id;
  }

  pause(): void {
    this.clock.pause();
    this.stopLoop();
    this.setStatus("Paused / resources retained", "ready");
  }

  resume(): void {
    if (this.closed || !this.renderer) return;
    this.clock.resume();
    this.previousVisualSeconds = this.clock.simulationSeconds;
    this.currentVisualSeconds = this.clock.simulationSeconds;
    this.lastAnimationTimeMs = null;
    this.loopRunning = true;
    this.scheduleFrame();
    this.setStatus("Native WebGPU / live fixed-step", "ready");
  }

  async setFrozen(frozen: boolean, milliseconds = this.timeAppliedMs): Promise<void> {
    if (frozen) {
      await this.setTime(milliseconds);
      return;
    }
    await this.ready();
    this.resume();
  }

  async renderOnce(): Promise<void> {
    await this.ready();
    this.updateVisualState(this.presentationSeconds());
    await this.renderer.render(this.scene, this.camera);
  }

  async getMetrics(): Promise<CaptureMetrics> {
    await this.ready();
    const renderInfo = this.renderer.info.render;
    const memoryInfo = this.renderer.info.memory;
    const targetSize = this.resizeTarget
      ? { width: this.resizeTarget.width, height: this.resizeTarget.height }
      : { width: 0, height: 0 };

    return {
      drawCalls: Number(renderInfo.calls ?? 0),
      triangles: Number(renderInfo.triangles ?? 0),
      geometries: Number(memoryInfo.geometries ?? 0),
      textures: Number(memoryInfo.textures ?? 0),
      programs: Number((this.renderer.info.programs ?? []).length),
      seedApplied: this.seedApplied,
      timeAppliedMs: this.timeAppliedMs,
      viewpointApplied: this.viewpointApplied,
      canvasCount: document.querySelectorAll("canvas").length,
      activeLoopCount: this.loopRunning ? 1 : 0,
      paused: this.clock.isPaused,
      frozen: this.clock.isFrozen,
      rendererBackend: this.renderer.backend?.isWebGPUBackend === true ? "webgpu" : "unknown",
      resize: {
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
        cameraAspect: Number(this.camera.aspect),
        pixelRatio: Number(this.renderer.getPixelRatio()),
        renderTargetWidth: Number(targetSize.width),
        renderTargetHeight: Number(targetSize.height),
        composerWidth: this.canvas.width,
        composerHeight: this.canvas.height,
      },
    };
  }

  async readFrame(): Promise<DevLabFrame> {
    // DevLab calls renderOnce() immediately before this provider. Read the
    // already-presented WebGPU frame so capture remains one logical render.
    await this.ready();
    const width = this.canvas.width;
    const height = this.canvas.height;
    const png = this.canvas.toDataURL("image/png");
    const decoded = new Image();
    decoded.src = png;
    await decoded.decode();
    if (decoded.naturalWidth !== width || decoded.naturalHeight !== height) {
      throw new Error("decoded WebGPU frame dimensions do not match the canvas");
    }

    const readback = document.createElement("canvas");
    readback.width = width;
    readback.height = height;
    const context = readback.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D readback context is unavailable");
    context.drawImage(decoded, 0, 0);
    const rgba = context.getImageData(0, 0, width, height).data;
    return { png, rgba, width, height };
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopLoop();
    await this.owner.shutdown();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.setStatus("Shutdown complete", "ready");
  }

  private async initialize(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error("native WebGPU is required; navigator.gpu is unavailable");
    }

    const renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: "high-performance",
      forceWebGL: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(1, 1, false);
    await renderer.init();
    if (renderer.backend?.isWebGPUBackend !== true) {
      await renderer.dispose();
      throw new Error("WebGPURenderer initialized without a native WebGPU backend");
    }
    this.renderer = renderer;
    this.owner.defer(() => renderer.dispose());

    this.buildScene();
    this.applySeed(this.seedApplied);
    await this.setViewpointInternal(TITLE_VIEWPOINT);

    const onResize = (): void => this.resize();
    window.addEventListener("resize", onResize, { passive: true });
    this.owner.defer(() => window.removeEventListener("resize", onResize));

    const onBeforeUnload = (): void => {
      void this.shutdown();
    };
    window.addEventListener("beforeunload", onBeforeUnload, { once: true });
    this.owner.defer(() => window.removeEventListener("beforeunload", onBeforeUnload));

    this.clock.freezeAt(0);
    this.resize();
    this.updateVisualState(0);
    await renderer.render(this.scene, this.camera);
    this.setStatus("Native WebGPU / frozen capture ready", "ready");
  }

  private buildScene(): void {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a12);
    scene.fog = new THREE.Fog(0x060a12, 12, 28);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);

    const ambient = new THREE.HemisphereLight(0xbdeaff, 0x111827, 1.35);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(4, 8, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0x2dd4bf, 28, 14, 2);
    rim.position.set(-4, 2.4, -2);
    scene.add(rim);

    this.pulseTime = uniform(0);
    const heroMaterial = this.owner.own(new THREE.MeshStandardNodeMaterial());
    heroMaterial.colorNode = color(0x38bdf8).mul(
      float(0.72).add(oscSine(this.pulseTime.mul(1.4)).mul(0.18)),
    );
    heroMaterial.metalnessNode = float(0.62);
    heroMaterial.roughnessNode = float(0.22);
    const heroGeometry = this.owner.own(new THREE.TorusKnotGeometry(1.08, 0.3, 144, 20));
    this.hero = new THREE.Mesh(heroGeometry, heroMaterial);
    this.hero.position.y = 1.65;
    scene.add(this.hero);

    const haloMaterial = this.owner.own(new THREE.MeshBasicNodeMaterial());
    haloMaterial.colorNode = color(0x67e8f9).mul(
      float(0.58).add(oscSine(this.pulseTime.mul(0.8)).mul(0.16)),
    );
    const haloGeometry = this.owner.own(new THREE.TorusGeometry(2.25, 0.035, 8, 128));
    this.halo = new THREE.Mesh(haloGeometry, haloMaterial);
    this.halo.position.y = 1.65;
    this.halo.rotation.x = Math.PI / 2.5;
    scene.add(this.halo);

    const platformMaterial = this.owner.own(new THREE.MeshStandardNodeMaterial({
      color: 0x111c2e,
      roughnessNode: float(0.72),
      metalnessNode: float(0.25),
    }));
    const platformGeometry = this.owner.own(new THREE.CylinderGeometry(3.4, 3.9, 0.42, 64));
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = -0.16;
    scene.add(platform);

    const instanceMaterial = this.owner.own(new THREE.MeshStandardNodeMaterial({
      color: 0x93c5fd,
      roughnessNode: float(0.5),
      metalnessNode: float(0.18),
    }));
    const instanceGeometry = this.owner.own(new THREE.IcosahedronGeometry(0.09, 0));
    this.instances = new THREE.InstancedMesh(instanceGeometry, instanceMaterial, INSTANCE_COUNT);
    scene.add(this.instances);

    // The harness resize flow expects one bounded target to follow viewport size.
    this.resizeTarget = this.owner.own(new THREE.WebGLRenderTarget(64, 64));
  }

  private applySeed(seed: number): void {
    if (!this.instances) return;
    const random = new SeededRandom(seed);
    const transform = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let index = 0; index < INSTANCE_COUNT; index += 1) {
      const angle = random.range(0, Math.PI * 2);
      const radius = random.range(4.2, 9.2);
      transform.position.set(
        Math.cos(angle) * radius,
        random.range(0.15, 4.9),
        Math.sin(angle) * radius,
      );
      transform.rotation.set(random.range(0, Math.PI), random.range(0, Math.PI), angle);
      transform.scale.setScalar(random.range(0.55, 1.5));
      transform.updateMatrix();
      this.instances.setMatrixAt(index, transform.matrix);
      tint.setHSL(random.range(0.48, 0.62), random.range(0.55, 0.9), random.range(0.55, 0.82));
      this.instances.setColorAt(index, tint);
    }
    this.instances.instanceMatrix.needsUpdate = true;
    if (this.instances.instanceColor) this.instances.instanceColor.needsUpdate = true;
  }

  private async setViewpointInternal(id: string): Promise<void> {
    if (id !== TITLE_VIEWPOINT) throw new Error(`unknown viewpoint: ${id}`);
    this.camera.position.set(7.4, 4.6, 8.8);
    this.camera.lookAt(0, 1.35, 0);
    this.viewpointApplied = id;
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const plan = computeViewportPlan(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1,
    );
    this.renderer.setPixelRatio(plan.pixelRatio);
    this.renderer.setSize(plan.width, plan.height, false);
    this.camera.aspect = plan.aspect;
    this.camera.updateProjectionMatrix();
    this.resizeTarget?.setSize(plan.renderTargetSize, plan.renderTargetSize);
  }

  private fixedUpdate(stepSeconds: number): void {
    this.previousVisualSeconds = this.currentVisualSeconds;
    this.currentVisualSeconds += stepSeconds;
    this.timeAppliedMs = this.currentVisualSeconds * 1000;
  }

  private presentationSeconds(): number {
    if (this.clock.isFrozen) return this.clock.simulationSeconds;
    const alpha = this.clock.interpolationAlpha;
    return this.previousVisualSeconds
      + (this.currentVisualSeconds - this.previousVisualSeconds) * alpha;
  }

  private updateVisualState(seconds: number): void {
    if (!this.hero || !this.halo || !this.pulseTime) return;
    this.pulseTime.value = seconds;
    this.hero.rotation.x = Math.sin(seconds * 0.44) * 0.24;
    this.hero.rotation.y = seconds * 0.58;
    this.halo.rotation.z = seconds * -0.21;
  }

  private scheduleFrame(): void {
    if (!this.loopRunning || this.animationFrameId !== null) return;
    this.animationFrameId = requestAnimationFrame((timestamp) => {
      this.animationFrameId = null;
      void this.onAnimationFrame(timestamp);
    });
  }

  private async onAnimationFrame(timestampMs: number): Promise<void> {
    if (!this.loopRunning || this.closed) return;
    const previousTimestamp = this.lastAnimationTimeMs ?? timestampMs;
    this.lastAnimationTimeMs = timestampMs;
    const deltaSeconds = Math.max(0, (timestampMs - previousTimestamp) / 1000);
    this.clock.advance(deltaSeconds, (stepSeconds) => this.fixedUpdate(stepSeconds));
    this.updateVisualState(this.presentationSeconds());
    try {
      await this.renderer.render(this.scene, this.camera);
    } catch (error) {
      this.stopLoop();
      this.setStatus(error instanceof Error ? error.message : String(error), "error");
      throw error;
    }
    this.scheduleFrame();
  }

  private stopLoop(): void {
    this.loopRunning = false;
    this.lastAnimationTimeMs = null;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private setStatus(message: string, state: "ready" | "error"): void {
    this.status.value = message;
    this.status.dataset.state = state;
  }
}
