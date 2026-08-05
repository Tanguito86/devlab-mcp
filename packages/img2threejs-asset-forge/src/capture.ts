import { createHash } from "node:crypto";
import { assertSafeRelativePath } from "./artifacts.js";
import { parsePng } from "./png.js";

export const CAPTURE_LIMITS = Object.freeze({ MAX_WIDTH: 4096, MAX_HEIGHT: 4096, MAX_PIXELS: 4096 * 4096, MAX_CAPTURE_BYTES: 64 * 1024 * 1024, MAX_TEXT_LENGTH: 128, MAX_VIEWS: 32 });
export type CaptureState = "READY" | "IN_PROGRESS" | "DEVICE_LOST" | "RECOVERING" | "DISPOSED";
export type CaptureBackend = "webgl" | "webgpu" | "fake";
export interface CaptureView { readonly id: string; readonly cameraSpecHash: string }
export interface CaptureRequest { readonly runId: string; readonly seed: string; readonly background: "transparent" | "solid"; readonly views: readonly CaptureView[]; readonly outputFormat: "png" | "raw-rgba" }
export interface CaptureFrameRequest { readonly frameId: string; readonly viewId: string; readonly sceneSpecHash: string; readonly optionsHash: string }
export interface AdapterCaptureRequest extends CaptureFrameRequest { readonly width: number; readonly height: number; readonly pixelRatio: number; readonly colorSpace: string; readonly alpha: boolean; readonly seed: string; readonly background: "transparent" | "solid"; readonly outputFormat: "png" | "raw-rgba"; readonly cameraSpecHash: string }
export interface CaptureTargetConfig { readonly id: string; readonly width: number; readonly height: number; readonly pixelRatio: number; readonly colorSpace: string; readonly alpha: boolean; readonly backend: CaptureBackend; readonly evidenceDirectory?: string }
export interface CaptureAdapter { capture(request: AdapterCaptureRequest): Promise<Uint8Array>; recover(): Promise<void>; dispose(): Promise<void> }
export interface CaptureFrame { readonly frameId: string; readonly viewId: string; readonly width: number; readonly height: number; readonly pixelRatio: number; readonly byteLength: number; readonly sha256: string; readonly rendererBackend: CaptureBackend; readonly cameraSpecHash: string; readonly sceneSpecHash: string; readonly seed: string; readonly sequence: number; readonly relativePath: string }
export interface CaptureSummary { readonly runId: string; readonly frameCount: number; readonly framesHash: string; readonly frames: readonly CaptureFrame[] }
export interface CaptureFailure { readonly request: AdapterCaptureRequest; readonly reason: string }

export class DeviceLostError extends Error { constructor(message = "capture device lost") { super(message); this.name = "DeviceLostError"; } }
function validHash(value: string): boolean { return /^[0-9a-f]{64}$/.test(value); }
function validToken(value: string): boolean { return value.length > 0 && value.length <= CAPTURE_LIMITS.MAX_TEXT_LENGTH && /^[A-Za-z0-9._-]+$/.test(value); }
function sameAdapterRequest(left: AdapterCaptureRequest, right: AdapterCaptureRequest): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function outputDimensions(width: number, height: number, pixelRatio: number): Readonly<{ width: number; height: number }> {
  const outputWidth = width * pixelRatio; const outputHeight = height * pixelRatio; const pixels = outputWidth * outputHeight;
  if (!Number.isSafeInteger(outputWidth) || !Number.isSafeInteger(outputHeight) || outputWidth <= 0 || outputHeight <= 0 || outputWidth > CAPTURE_LIMITS.MAX_WIDTH || outputHeight > CAPTURE_LIMITS.MAX_HEIGHT || !Number.isSafeInteger(pixels) || pixels > CAPTURE_LIMITS.MAX_PIXELS) throw new Error("capture target physical dimensions are invalid");
  return Object.freeze({ width: outputWidth, height: outputHeight });
}

function admitCaptureOutput(bytes: unknown, request: AdapterCaptureRequest): asserts bytes is Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > CAPTURE_LIMITS.MAX_CAPTURE_BYTES) throw new Error("capture adapter returned bytes outside policy");
  const dimensions = outputDimensions(request.width, request.height, request.pixelRatio);
  if (request.outputFormat === "raw-rgba") {
    const expectedBytes = dimensions.width * dimensions.height * 4;
    if (bytes.byteLength !== expectedBytes) throw new Error(`raw RGBA byte length ${bytes.byteLength} does not match expected ${expectedBytes}`);
    return;
  }
  const parsed = parsePng(bytes);
  if (parsed.width !== dimensions.width || parsed.height !== dimensions.height) throw new Error(`PNG dimensions ${parsed.width}x${parsed.height} do not match expected ${dimensions.width}x${dimensions.height}`);
}

export class DevLabCaptureTarget {
  readonly id: string; readonly width: number; readonly height: number; readonly pixelRatio: number; readonly colorSpace: string; readonly alpha: boolean;
  #state: CaptureState = "READY"; #sequence = 0; #session?: Readonly<CaptureRequest>; #frames: CaptureFrame[] = []; #pendingRetry?: Readonly<AdapterCaptureRequest>; #lastFailure?: Readonly<CaptureFailure>; #disposePromise?: Promise<void>;
  private readonly backend: CaptureBackend; private readonly evidenceDirectory: string;
  constructor(private readonly adapter: CaptureAdapter, config: CaptureTargetConfig) {
    if (!validToken(config.id) || !new Set<CaptureBackend>(["webgl", "webgpu", "fake"]).has(config.backend) || !validToken(config.colorSpace) || typeof config.alpha !== "boolean" || !Number.isSafeInteger(config.width) || !Number.isSafeInteger(config.height) || config.width <= 0 || config.height <= 0 || config.width > CAPTURE_LIMITS.MAX_WIDTH || config.height > CAPTURE_LIMITS.MAX_HEIGHT || !Number.isFinite(config.pixelRatio) || config.pixelRatio <= 0 || config.pixelRatio > 4) throw new Error("capture target config is invalid");
    outputDimensions(config.width, config.height, config.pixelRatio);
    this.id = config.id; this.width = config.width; this.height = config.height; this.pixelRatio = config.pixelRatio; this.colorSpace = config.colorSpace; this.alpha = config.alpha; this.backend = config.backend; this.evidenceDirectory = assertSafeRelativePath(config.evidenceDirectory ?? "captures");
  }
  get state(): CaptureState { return this.#state; }
  get lastFailure(): Readonly<CaptureFailure> | undefined { return this.#lastFailure; }
  async begin(request: CaptureRequest): Promise<void> {
    if (this.#state !== "READY" || this.#session) throw new Error("capture session is already active or target unavailable");
    if (!validToken(request.runId) || !validToken(request.seed) || !new Set(["transparent", "solid"]).has(request.background) || !new Set(["png", "raw-rgba"]).has(request.outputFormat) || !Array.isArray(request.views) || request.views.length === 0 || request.views.length > CAPTURE_LIMITS.MAX_VIEWS) throw new Error("invalid capture session request");
    const ids = new Set<string>(); const views = request.views.map((view): CaptureView => { if (!validToken(view.id) || !validHash(view.cameraSpecHash) || ids.has(view.id)) throw new Error("capture views must be unique and valid"); ids.add(view.id); return Object.freeze({ id: view.id, cameraSpecHash: view.cameraSpecHash }); });
    this.#session = Object.freeze({ runId: request.runId, seed: request.seed, background: request.background, outputFormat: request.outputFormat, views: Object.freeze(views) }); this.#sequence = 0; this.#frames = []; this.#pendingRetry = undefined;
  }
  async captureFrame(request: CaptureFrameRequest): Promise<CaptureFrame> {
    if (this.#state !== "READY" || !this.#session) throw new Error(`capture frame unavailable in state ${this.#state}`);
    if (!validToken(request.frameId) || !validToken(request.viewId) || !validHash(request.sceneSpecHash) || !validHash(request.optionsHash)) throw new Error("invalid capture frame request");
    const view = this.#session.views.find(({ id }) => id === request.viewId); if (!view) throw new Error("capture view is not declared by the session");
    const adapterRequest: AdapterCaptureRequest = Object.freeze({ frameId: request.frameId, viewId: request.viewId, sceneSpecHash: request.sceneSpecHash, optionsHash: request.optionsHash, width: this.width, height: this.height, pixelRatio: this.pixelRatio, colorSpace: this.colorSpace, alpha: this.alpha, seed: this.#session.seed, background: this.#session.background, outputFormat: this.#session.outputFormat, cameraSpecHash: view.cameraSpecHash });
    if (this.#pendingRetry && !sameAdapterRequest(adapterRequest, this.#pendingRetry)) throw new Error("retry must preserve the complete frame request after device loss");
    this.#state = "IN_PROGRESS";
    try {
      const bytes = await this.adapter.capture(adapterRequest);
      admitCaptureOutput(bytes, adapterRequest);
      this.#sequence += 1; const sha256 = createHash("sha256").update(bytes).digest("hex"); const relativePath = `${this.evidenceDirectory}/${request.viewId}-${request.frameId}-${String(this.#sequence).padStart(6, "0")}-${sha256.slice(0, 16)}.${this.#session.outputFormat === "png" ? "png" : "rgba"}`;
      const frame = Object.freeze({ frameId: request.frameId, viewId: request.viewId, width: this.width, height: this.height, pixelRatio: this.pixelRatio, byteLength: bytes.byteLength, sha256, rendererBackend: this.backend, cameraSpecHash: view.cameraSpecHash, sceneSpecHash: request.sceneSpecHash, seed: this.#session.seed, sequence: this.#sequence, relativePath });
      this.#frames.push(frame); this.#state = "READY"; this.#pendingRetry = undefined; return frame;
    } catch (error) {
      if (error instanceof DeviceLostError) { this.#state = "DEVICE_LOST"; this.#pendingRetry = adapterRequest; this.#lastFailure = Object.freeze({ request: adapterRequest, reason: error.message }); } else this.#state = "READY";
      throw error;
    }
  }
  async end(): Promise<CaptureSummary> {
    if (this.#state !== "READY" || !this.#session) throw new Error("capture session cannot end in the current state");
    const frames = Object.freeze([...this.#frames]); const summary = Object.freeze({ runId: this.#session.runId, frameCount: frames.length, framesHash: createHash("sha256").update(JSON.stringify(frames)).digest("hex"), frames }); this.#session = undefined; return summary;
  }
  async recover(): Promise<void> { if (this.#state !== "DEVICE_LOST") throw new Error(`recovery unavailable in state ${this.#state}`); this.#state = "RECOVERING"; try { await this.adapter.recover(); this.#state = "READY"; } catch (error) { this.#state = "DEVICE_LOST"; throw error; } }
  dispose(): Promise<void> { if (this.#disposePromise) return this.#disposePromise; if (this.#state === "IN_PROGRESS" || this.#state === "RECOVERING") return Promise.reject(new Error(`dispose unavailable in state ${this.#state}`)); if (this.#state === "DISPOSED") return Promise.resolve(); const previous = this.#state; this.#state = "DISPOSED"; this.#disposePromise = this.adapter.dispose().catch((error: unknown) => { this.#state = previous; this.#disposePromise = undefined; throw error; }); return this.#disposePromise; }
}

export class FakeCaptureAdapter implements CaptureAdapter {
  #loseNext = false; #disposed = false;
  loseNextCapture(): void { this.#loseNext = true; }
  async capture(request: AdapterCaptureRequest): Promise<Uint8Array> {
    if (this.#disposed) throw new Error("adapter disposed"); if (this.#loseNext) { this.#loseNext = false; throw new DeviceLostError(); }
    if (request.outputFormat !== "raw-rgba") throw new Error("fake capture adapter supports raw-rgba only");
    const dimensions = outputDimensions(request.width, request.height, request.pixelRatio); const length = dimensions.width * dimensions.height * 4;
    const pattern = createHash("sha256").update(JSON.stringify(request)).digest(); const bytes = new Uint8Array(length);
    for (let offset = 0; offset < bytes.length; offset += pattern.length) bytes.set(pattern.subarray(0, Math.min(pattern.length, bytes.length - offset)), offset);
    return bytes;
  }
  async recover(): Promise<void> { if (this.#disposed) throw new Error("adapter disposed"); }
  async dispose(): Promise<void> { this.#disposed = true; }
}

export interface RendererReadbackBoundary { readFrame(request: AdapterCaptureRequest): Promise<Uint8Array>; recoverDevice(): Promise<void>; disposeRenderer(): Promise<void> }
export class MinimumRendererCaptureAdapter implements CaptureAdapter { constructor(private readonly renderer: RendererReadbackBoundary) {} capture(request: AdapterCaptureRequest): Promise<Uint8Array> { return this.renderer.readFrame(request); } recover(): Promise<void> { return this.renderer.recoverDevice(); } dispose(): Promise<void> { return this.renderer.disposeRenderer(); } }
