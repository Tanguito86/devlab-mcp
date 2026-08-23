#!/usr/bin/env node
import { resolve } from "node:path";

import { AsepriteError } from "./aseprite.js";
import { ORIGIN_PRESET_NAMES, ingestAsepriteSprite, type OriginPreset } from "./ingest.js";

const USAGE = `devlab-aseprite-ingest --source <file.aseprite> --repo-root <dir> --asset-id <id> --version <semver> [--origin <preset>] [--timeout-ms <n>]

Ingests one Aseprite source into the Asset Forge catalog layout as a GameMaker
sprite the asset-gm-bridge can import.

  --origin   ${ORIGIN_PRESET_NAMES.join(" | ")}   (default: centre)

The Aseprite executable is read from DEVLAB_ASEPRITE and never from an argument.
The catalog entry is emitted with status DRAFT and is not registered in the
index; publishing it there, at DRAFT or at the APPROVED the bridge requires
before an import, is a separate step.`;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = flag(name);
  if (!value) {
    process.stderr.write(`missing --${name}\n\n${USAGE}\n`);
    process.exit(2);
  }
  return value;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const timeoutRaw = flag("timeout-ms");
try {
  const result = await ingestAsepriteSprite({
    source: resolve(required("source")),
    repoRoot: resolve(required("repo-root")),
    assetId: required("asset-id"),
    version: required("version"),
    origin: (flag("origin") as OriginPreset | undefined) ?? "centre",
    ...(timeoutRaw ? { timeoutMs: Number(timeoutRaw) } : {}),
  });
  process.stdout.write(`${JSON.stringify({
    assetId: result.assetId,
    version: result.version,
    frameCount: result.frames.length,
    dimensions: { width: result.spec.width, height: result.spec.height },
    origin: result.spec.origin,
    specPath: result.specPath,
    artifactManifestPath: result.artifactManifestPath,
    deterministic: result.deterministic,
    asepriteVersion: result.asepriteVersion,
    catalogStatus: result.catalogEntry.status,
    catalogEntry: result.catalogEntry,
  }, null, 2)}\n`);
} catch (error) {
  if (error instanceof AsepriteError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
    process.exit(1);
  }
  const name = error instanceof Error ? error.name : typeof error;
  process.stderr.write(`INGEST_FAILED: ${name}\n`);
  process.exit(1);
}
