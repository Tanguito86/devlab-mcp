export const DEVLAB_CAPTURE_CONTRACT_VERSION = 1;
export interface CaptureFrame { readonly png: Uint8Array; readonly rgba: Uint8Array; readonly width: number; readonly height: number }
export interface CaptureSurface<TSnapshot, TDiagnostics> {
  setSeed(seed: number): void;
  setTime(milliseconds: number): void;
  setViewpoint(viewpoint: string): void;
  render(): void | Promise<void>;
  snapshot(): TSnapshot;
  diagnostics(): TDiagnostics;
}
export function assertLoopbackCaptureOrigin(origin: string): void {
  const url = new URL(origin);
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost" && url.hostname !== "[::1]")) throw new Error("capture surface must be loopback-only HTTP");
}
export function framesExactlyEqual(left: CaptureFrame, right: CaptureFrame): boolean {
  return left.width === right.width && left.height === right.height && bytesEqual(left.png, right.png) && bytesEqual(left.rgba, right.rgba);
}
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean { if (left.byteLength !== right.byteLength) return false; for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false; return true }
