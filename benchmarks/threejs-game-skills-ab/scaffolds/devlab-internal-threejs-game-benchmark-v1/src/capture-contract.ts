export const CAPTURE_CONTRACT_VERSION = 1 as const;

export const REQUIRED_CAPTURE_METHODS = [
  "ready",
  "setSeed",
  "setTime",
  "setViewpoint",
  "renderOnce",
  "getMetrics",
] as const;

export interface ResizeMetrics {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly cameraAspect: number;
  readonly pixelRatio: number;
  readonly renderTargetWidth: number;
  readonly renderTargetHeight: number;
  readonly composerWidth: number;
  readonly composerHeight: number;
}

export interface CaptureMetrics {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly seedApplied: number;
  readonly timeAppliedMs: number;
  readonly viewpointApplied: string;
  readonly canvasCount: number;
  readonly activeLoopCount: number;
  readonly paused: boolean;
  readonly frozen: boolean;
  readonly rendererBackend: string;
  readonly resize: ResizeMetrics;
}

export interface DevLabCaptureTarget {
  readonly version: typeof CAPTURE_CONTRACT_VERSION;
  ready(): Promise<void>;
  setSeed(seed: number): Promise<void>;
  setTime(milliseconds: number): Promise<void>;
  setViewpoint(id: string): Promise<void>;
  renderOnce(): Promise<void>;
  getMetrics(): Promise<CaptureMetrics>;
  pause(): void;
  resume(): void;
  setFrozen(frozen: boolean, milliseconds?: number): Promise<void>;
  shutdown(): Promise<void>;
}

export interface DevLabFrame {
  readonly png: string;
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

declare global {
  interface Window {
    __DEVLAB_CAPTURE__: DevLabCaptureTarget;
    __DEVLAB_FRAME__: () => Promise<DevLabFrame>;
  }
}
