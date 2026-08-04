import "./style.css";

import {
  CAPTURE_CONTRACT_VERSION,
  type DevLabCaptureTarget,
} from "./capture-contract.js";
import { BenchmarkScaffoldEngine } from "./engine.js";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const status = document.querySelector<HTMLOutputElement>("#status");
if (!canvas || !status) throw new Error("scaffold DOM is incomplete");

const engine = new BenchmarkScaffoldEngine(canvas, status);

const captureTarget: DevLabCaptureTarget = {
  version: CAPTURE_CONTRACT_VERSION,
  ready: () => engine.ready(),
  setSeed: (seed) => engine.setSeed(seed),
  setTime: (milliseconds) => engine.setTime(milliseconds),
  setViewpoint: (id) => engine.setViewpoint(id),
  renderOnce: () => engine.renderOnce(),
  getMetrics: () => engine.getMetrics(),
  pause: () => engine.pause(),
  resume: () => engine.resume(),
  setFrozen: (frozen, milliseconds) => engine.setFrozen(frozen, milliseconds),
  shutdown: () => engine.shutdown(),
};

window.__DEVLAB_CAPTURE__ = captureTarget;
window.__DEVLAB_FRAME__ = () => engine.readFrame();

void engine.ready().catch((error: unknown) => {
  status.value = error instanceof Error ? error.message : String(error);
  status.dataset.state = "error";
  console.error(error);
});
