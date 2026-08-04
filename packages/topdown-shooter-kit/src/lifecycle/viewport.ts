export interface ViewportPlan { readonly width: number; readonly height: number; readonly aspect: number; readonly pixelRatio: number; readonly renderTargetSize: number }
export function computeViewportPlan(width: number, height: number, devicePixelRatio: number): ViewportPlan {
  if (![width, height, devicePixelRatio].every(Number.isFinite) || width <= 0 || height <= 0 || devicePixelRatio <= 0) throw new RangeError("viewport dimensions and pixel ratio must be positive finite numbers");
  const integerWidth = Math.max(1, Math.floor(width)); const integerHeight = Math.max(1, Math.floor(height));
  return { width: integerWidth, height: integerHeight, aspect: integerWidth / integerHeight, pixelRatio: Math.min(devicePixelRatio, 2), renderTargetSize: Math.max(64, Math.floor(Math.min(integerWidth, integerHeight) / 3)) };
}
