// DevLab capture harness — CLI entry.
//
//   node scripts/capture-harness.js capture --fixture capture-fixtures/threejs-scene --out <dir> --tag <name> [--seed 1729] [--time 2500] [--viewpoints all|a,b,c] [--variant id] [--backend cpu|gpu]
//   node scripts/capture-harness.js determinism --fixture ... --out <dir>
//   node scripts/capture-harness.js sensitivity --fixture ... --out <dir> --time2 <ms>   (or --seed2)
//   node scripts/capture-harness.js ab --fixture ... --out <dir> --variant-b <id>
//   node scripts/capture-harness.js perf --fixture ... --out <dir>
//   node scripts/capture-harness.js resize --fixture ... --out <dir>
//   node scripts/capture-harness.js context --fixture ... --out <dir>
//
// Output roots are validated; tags are validated; no arbitrary JS is ever
// evaluated in the page.

import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";

import {
  runCaptureFlow,
  runDeterminismFlow,
  runSensitivityFlow,
  runAbFlow,
  runPerfFlow,
  runResizeFlow,
  runContextFlow,
  runResourceStabilityFlow,
} from "./capture-harness/runner.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

export function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = true;
      }
    } else {
      opts._.push(arg);
    }
  }
  return opts;
}

export function resolveCliRelativePath(packageRoot, value, label) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)
    || /^[A-Za-z]:/.test(value)) {
    throw new Error(`${label} must be a relative path inside the package`);
  }
  const root = resolve(packageRoot);
  const target = resolve(root, value);
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} escapes the package root`);
  }
  let current = root;
  let lastExisting = root;
  for (const segment of rel.split(sep)) {
    current = join(current, segment);
    if (!existsSync(current)) break;
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} crosses a symlink or junction`);
    }
    lastExisting = current;
  }
  const realRoot = realpathSync(root);
  const realExisting = realpathSync(lastExisting);
  if (realExisting !== realRoot && !realExisting.startsWith(realRoot + sep)) {
    throw new Error(`${label} escapes the package root through an ancestor`);
  }
  return target;
}

function vendorPaths() {
  // three.module.js + the full addons tree, resolved from this package's
  // node_modules (pnpm workspace store). The harness itself never imports
  // three; these files are only served to the fixture page.
  const req = createRequire(import.meta.url);
  // three 0.185 restricts "exports"; resolve through public subpaths:
  //   "." (require condition) -> build/three.cjs ; "./addons/*" -> examples/jsm/*
  const threeCjs = req.resolve("three");
  const buildDir = dirname(threeCjs);
  const threeMain = join(buildDir, "three.module.js"); // ESM build, same dir
  // three.module.js imports ./three.core.js relatively; expose both files.
  // WebGPU fixtures also need the webgpu + tsl builds and their imports.
  const vendorFiles = [
    threeMain,
    join(buildDir, "three.core.js"),
    join(buildDir, "three.webgpu.js"),
    join(buildDir, "three.webgpu.nodes.js"),
    join(buildDir, "three.tsl.js"),
  ].filter((p) => existsSync(p));
  const addonsRoot = dirname(dirname(req.resolve("three/addons/postprocessing/EffectComposer.js")));
  return { threeMain, addonsRoot, vendorFiles };
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command) fail("usage: capture-harness.js <capture|determinism|sensitivity|ab|perf|resize|context|stability> --fixture <dir> --out <dir> ...");

  const fixtureArg = args.fixture;
  if (!fixtureArg) fail("--fixture <dir> required");
  let fixtureRoot;
  try {
    fixtureRoot = resolveCliRelativePath(PKG_ROOT, fixtureArg, "--fixture");
  } catch (error) {
    fail(error.message);
  }
  if (!existsSync(join(fixtureRoot, "index.html"))) {
    fail(`fixture root has no index.html: ${fixtureRoot}`);
  }
  let outputRoot = resolve(fixtureRoot, "capture-output");
  if (args.out) {
    try {
      outputRoot = resolveCliRelativePath(PKG_ROOT, args.out, "--out");
    } catch (error) {
      fail(error.message);
    }
  }

  const { threeMain, addonsRoot, vendorFiles } = vendorPaths();
  // vendor: three.module.js (+ three.core.js it imports) and the whole addons
  // tree (addons import each other relatively).
  const vendor = [...vendorFiles, addonsRoot];

  const manifestPath = join(fixtureRoot, "capture-manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const viewpoints = args.viewpoints && args.viewpoints !== "all"
    ? args.viewpoints.split(",")
    : manifest?.viewpoints || ["overview"];
  const seed = args.seed !== undefined ? Number(args.seed) : manifest?.defaultSeed ?? 1729;
  const timeMs = args.time !== undefined ? Number(args.time) : manifest?.defaultTimeMs ?? 2500;
  if (!Number.isFinite(seed) || !Number.isFinite(timeMs)) fail("--seed/--time must be finite numbers");

  const common = {
    fixtureRoot,
    vendor,
    outputRoot,
    seed,
    timeMs,
    viewpoints,
    backend: manifest?.requiresNativeWebGPU === true ? "native-webgpu" : (args.backend || "cpu"),
    requireNativeWebGPU: manifest?.requiresNativeWebGPU === true,
  };

  try {
    switch (command) {
      case "capture": {
        if (!args.tag) fail("capture requires --tag <name>");
        const result = await runCaptureFlow({ ...common, tag: args.tag, variant: args.variant || null });
        console.log(`capture OK -> ${result.outDir}`);
        for (const c of result.report.captures) {
          console.log(`  ${c.viewpoint}: ${c.width}x${c.height} png=${c.pngSha256.slice(0, 12)} rgba=${c.rgbaSha256.slice(0, 12)}`);
        }
        break;
      }
      case "determinism": {
        const out = await runDeterminismFlow(common);
        console.log(`determinism: PNG=${out.pngByteEquality} RGBA=${out.rgbaEquality} METRICS=${out.metricsNormalizedEquality} ORDER=${out.viewpointOrder} FILES=${out.outputFileSetIdentical}`);
        break;
      }
      case "sensitivity": {
        const seed2 = args.seed2 !== undefined ? Number(args.seed2) : null;
        const timeMs2 = args.time2 !== undefined ? Number(args.time2) : null;
        if (seed2 === null && timeMs2 === null) fail("sensitivity requires --seed2 or --time2");
        const out = await runSensitivityFlow(common, { seed2, timeMs2 });
        console.log(`sensitivity: changed=${out.controlledChangeDetected} unrelated_changed=${out.unrelatedViewpointsChanged}`);
        for (const p of out.pairs) console.log(`  ${p.viewpoint}: changed=${p.changedPixels} maxDelta=${p.maxChannelDelta} pct=${p.changedPixelPercentage}%`);
        break;
      }
      case "ab": {
        if (!args["variant-b"]) fail("ab requires --variant-b <id>");
        const out = await runAbFlow(common, { variantA: args["variant-a"] || null, variantB: args["variant-b"] });
        console.log(`ab: A=${out.variantA || "default"} B=${out.variantB}`);
        for (const c of out.comparisons) {
          console.log(`  ${c.viewpoint}: changed=${c.changedPixels} maxDelta=${c.maxChannelDelta} pct=${c.changedPixelPercentage}%`);
        }
        break;
      }
      case "perf": {
        const out = await runPerfFlow(common);
        console.log(`perf: cpu_p50=${out.cpuFrameP50.toFixed(2)}ms cpu_p95=${out.cpuFrameP95.toFixed(2)}ms synced_p50=${out.syncedFrameP50.toFixed(2)}ms synced_p95=${out.syncedFrameP95.toFixed(2)}ms fps≈${out.fpsEstimate.toFixed(1)}`);
        break;
      }
      case "resize": {
        const out = await runResizeFlow(common);
        for (const r of out.matrix) console.log(`  ${r.width}x${r.height}: canvas=${r.canvasCorrect} warnings=${r.warnings.length} valid=${r.captureValid}`);
        console.log(`resize allPassed=${out.allPassed}`);
        break;
      }
      case "context": {
        const out = await runContextFlow(common);
        console.log(JSON.stringify(out));
        break;
      }
      case "stability": {
        const out = await runResourceStabilityFlow(common);
        console.log(`stability: bounded=${out.bounded} canvases=${out.duplicateCanvases} loops=${out.duplicateLoops}`);
        break;
      }
      default:
        fail(`unknown command: ${command}`);
    }
  } catch (err) {
    fail(`${err.code || "ERROR"}: ${err.message}`);
  }
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
