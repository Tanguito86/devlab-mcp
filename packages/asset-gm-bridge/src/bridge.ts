import { mkdir, readFile, rename, rm, stat, writeFile, open } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  GovernedGameMakerIdeAdapter, type GmApplyResult, type GmMutationPlan, type GmProjectSnapshot,
  type GmVerificationResult,
} from "@tanguito/devlab-gm-ide-adapter";
import { planHash as adapterPlanHash, resolveInsideRoot, safeRelativePath, safeTransactionId, type ProcessInventory } from "@tanguito/devlab-gm-ide-adapter/internal";
import {
  type AssetCatalog, AssetForgeError, validateAssetCatalog, scanCatalogProvenance, parsePng,
} from "@tanguito/devlab-img2threejs-asset-forge";
import {
  ASSET_GM_BRIDGE_CAPABILITY, ASSET_GM_BRIDGE_CAPABILITY_CONTRACT, ASSET_GM_BRIDGE_INSTRUMENTATION,
  ASSET_GM_BRIDGE_VERSION, PILOT_INSTRUMENTED_PATHS,
  type AssetGmBridgeApplyRequest, type AssetGmBridgeApplyResult, type AssetGmBridgeAssetInspection,
  type AssetGmBridgeInspectAssetRequest, type AssetGmBridgeInspectTargetRequest,
  type AssetGmBridgeManifest, type AssetGmBridgePlanRequest, type AssetGmBridgePlanResult,
  type AssetGmBridgeRollbackRequest, type AssetGmBridgeRollbackResult, type AssetGmBridgeStatus,
  type AssetGmBridgeVerifyRequest,
} from "./contracts.js";
import { AssetGmBridgeError, fail, mapAdapterError, type AssetGmBridgeErrorCode } from "./errors.js";
import { canonicalBytes, sha256 } from "./canonical.js";
import { assertBudgetPasses, evaluateSpriteBudget } from "./budget.js";
import { type BeaconFactory, BRIDGE_TEST_BEACON_FACTORY } from "./beacon.js";
import { canonicalResourceName, validateSpriteSpec } from "./sprite-spec.js";
import { assertNoPathCollisions, assertResourceNameAvailable, normalizePathIdentity } from "./paths.js";
import { computePlanBinding, manifestHash as computeManifestHash } from "./binding.js";
import {
  assetVersionToNumber, patchProjectTexts, renderImportedGml, renderSpriteYy, runtimeSignalFor,
  spriteCompositeImagePath, spriteImagePath, type SpriteRenderContext,
} from "./gm-sprite.js";

export interface AssetGmBridgeConfig {
  readonly catalogPath: string;
  readonly repoRoot: string;
  readonly factory?: Readonly<Record<string, BeaconFactory>>;
  readonly inventory?: ProcessInventory;
}

function computePngBoundingBox(pixels: Uint8Array, width: number, height: number): Readonly<{ left: number; top: number; right: number; bottom: number }> {
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] !== 0) {
        if (x < left) left = x; if (x > right) right = x;
        if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
  }
  return Object.freeze({ left, top, right, bottom });
}

interface BindingRecord {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly bindingHash: string;
  readonly manifestHash: string;
  readonly adapterPlanHash: string;
  readonly expectedHead: string | null;
  readonly plannedFiles: readonly Readonly<{ path: string; action: "modify" | "create"; beforeSha256: string | null; afterSha256: string }>[];
  readonly resourceName: string;
}

interface ArtifactManifest {
  readonly schemaVersion: number;
  readonly assetId: string;
  readonly version: string;
  readonly specSha256: string;
  readonly generatedModuleSha256: string;
  readonly budgetProfile: string;
  readonly outputs: readonly Readonly<{ path: string; sha256: string; bytes: number; width: number; height: number; channels: number }>[];
}

const ALLOWED_EXTENSIONS = Object.freeze(["gml", "yy", "yyp", "json", "png", "resource_order"]);

export class GovernedAssetGmBridge {
  readonly adapter: GovernedGameMakerIdeAdapter;
  private readonly factory: Readonly<Record<string, BeaconFactory>>;

  constructor(
    readonly projectsDir: string,
    readonly config: AssetGmBridgeConfig,
  ) {
    if (!projectsDir) fail("INVALID_REQUEST", "projectsDir is required");
    if (!config.catalogPath) fail("INVALID_REQUEST", "catalogPath is required");
    if (!config.repoRoot) fail("INVALID_REQUEST", "repoRoot is required");
    this.adapter = new GovernedGameMakerIdeAdapter(projectsDir, config.inventory);
    this.factory = config.factory ?? BRIDGE_TEST_BEACON_FACTORY;
  }

  // ── private plumbing ──────────────────────────────────────────────────────

  private gate(capability: unknown): void {
    if (capability !== ASSET_GM_BRIDGE_CAPABILITY) fail("GATE_VIOLATION", `operation requires ${ASSET_GM_BRIDGE_CAPABILITY}`);
  }

  private async loadCatalog(): Promise<AssetCatalog> {
    let text: string;
    try { text = await readFile(this.config.catalogPath, "utf8"); } catch { fail("ASSET_NOT_FOUND", "asset catalog is not readable"); }
    try { return validateAssetCatalog(JSON.parse(text)); } catch (error) { fail("INVALID_ASSET_MANIFEST", error instanceof Error ? error.message : "invalid catalog"); }
  }

  private catalogEntry(catalog: AssetCatalog, assetId: string, assetVersion: string) {
    const entry = catalog.entries.find((candidate) => candidate.assetId === assetId && candidate.version === assetVersion);
    if (!entry) fail("ASSET_NOT_FOUND", `${assetId}@${assetVersion} is not in the catalog`);
    return entry;
  }

  private async readAssetFiles(entry: ReturnType<GovernedAssetGmBridge["catalogEntry"]>) {
    const resolveRepo = (path: string): Promise<string> => resolveInsideRoot(this.config.repoRoot, path, { existing: true });
    let specBytes: Buffer;
    try { specBytes = await readFile(await resolveRepo(entry.specPath)); } catch { fail("ASSET_HASH_MISMATCH", `spec is missing: ${entry.specPath}`); }
    let artifactBytes: Buffer;
    try { artifactBytes = await readFile(await resolveRepo(entry.artifactManifest)); } catch { fail("ASSET_HASH_MISMATCH", `artifact manifest is missing: ${entry.artifactManifest}`); }
    const artifact = JSON.parse(artifactBytes.toString("utf8")) as ArtifactManifest;
    if (!artifact || artifact.schemaVersion !== 1 || artifact.assetId !== entry.assetId || artifact.version !== entry.version || !Array.isArray(artifact.outputs)) fail("INVALID_ASSET_MANIFEST", "artifact manifest is malformed");
    if (artifact.specSha256 !== sha256(specBytes)) fail("ASSET_HASH_MISMATCH", "spec hash does not match the artifact manifest");
    const frames: Array<Readonly<{ path: string; sha256: string; bytes: number; width: number; height: number; channels: number; png: Buffer; boundingBox: Readonly<{ left: number; top: number; right: number; bottom: number }> }>> = [];
    let exportHash = "";
    for (const output of [...artifact.outputs].sort((a, b) => a.path.localeCompare(b.path))) {
      const absolute = await resolveRepo(output.path);
      let bytes: Buffer;
      try { bytes = await readFile(absolute); } catch { fail("ASSET_HASH_MISMATCH", `export is missing: ${output.path}`); }
      if (sha256(bytes) !== output.sha256) fail("ASSET_HASH_MISMATCH", `export hash mismatch: ${output.path}`);
      if (bytes.byteLength !== output.bytes) fail("INVALID_ASSET_MANIFEST", `export size mismatch: ${output.path}`);
      let parsed: ReturnType<typeof parsePng>;
      try { parsed = parsePng(bytes); } catch { fail("INVALID_ASSET_MANIFEST", `export is not a valid PNG: ${output.path}`); }
      if (parsed.width !== output.width || parsed.height !== output.height || parsed.channels !== output.channels) fail("INVALID_ASSET_MANIFEST", `export dimensions mismatch: ${output.path}`);
      const boundingBox = computePngBoundingBox(parsed.pixels, parsed.width, parsed.height);
      frames.push(Object.freeze({ path: output.path, sha256: output.sha256, bytes: bytes.byteLength, width: parsed.width, height: parsed.height, channels: parsed.channels, png: bytes, boundingBox }));
      exportHash = sha256(Buffer.concat([Buffer.from(exportHash, "utf8"), bytes]));
    }
    const boundingBox = frames.reduce<Readonly<{ left: number; top: number; right: number; bottom: number }>>(
      (union, frame) => Object.freeze({ left: Math.min(union.left, frame.boundingBox.left), top: Math.min(union.top, frame.boundingBox.top), right: Math.max(union.right, frame.boundingBox.right), bottom: Math.max(union.bottom, frame.boundingBox.bottom) }),
      Object.freeze({ left: Number.MAX_SAFE_INTEGER, top: Number.MAX_SAFE_INTEGER, right: -1, bottom: -1 }),
    );
    return Object.freeze({ specBytes, artifact, artifactBytes, frames, exportHash: sha256(Buffer.from(exportHash, "utf8")), boundingBox });
  }

  private async readTargetProject(projectRoot: string): Promise<Readonly<{ snapshot: GmProjectSnapshot; yypText: string; resourceOrderText: string; projectName: string; ideVersion: string; references: readonly string[]; existingFiles: readonly string[] }>> {
    const snapshot = await this.adapter.inspect({ capability: "GM_INSPECT_V1", projectRoot, expectedProjectFingerprint: null, expectedHead: null, allowlist: [], transactionId: "bridge-read-target", timeoutMs: 30_000, verificationPolicy: { projectLoad: false, compile: false, runtime: "forbidden" }, evidenceRoot: ".none" });
    const root = await resolveInsideRoot(this.projectsDir, projectRoot, { existing: true });
    const yypText = await readFile(join(root, ...snapshot.projectFile.split("/")), "utf8");
    const parsed = JSON.parse(yypText.replace(/,\s*([}\]])/g, "$1")) as Record<string, unknown>;
    const projectName = String(parsed["%Name"] ?? parsed.name ?? "");
    const ideVersion = String((parsed.MetaData as Record<string, unknown> | undefined)?.IDEVersion ?? "");
    const resourceOrderText = await readFile(join(root, `${projectName}.resource_order`), "utf8").catch(() => "");
    return Object.freeze({
      snapshot,
      yypText,
      resourceOrderText,
      projectName,
      ideVersion,
      references: snapshot.references,
      existingFiles: snapshot.files.map(({ path }) => path),
    });
  }

  private assertAssetApproved(entry: ReturnType<GovernedAssetGmBridge["catalogEntry"]>, phase: "plan" | "apply"): void {
    if (entry.status !== "APPROVED") {
      if (phase === "apply") fail("STALE_OR_TAMPERED_PLAN", `asset lifecycle changed to ${entry.status} after planning`);
      fail("ASSET_NOT_APPROVED", `${entry.assetId}@${entry.version} is ${entry.status}; only APPROVED assets can be imported`);
    }
  }

  private async bridgeEvidenceRoot(evidenceRoot: string, transactionId: string): Promise<string> {
    const relative = `${safeRelativePath(evidenceRoot)}/asset-bridge/${safeTransactionId(transactionId)}`;
    return resolveInsideRoot(this.projectsDir, relative);
  }

  private async writeStable(path: string, value: unknown): Promise<string> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.next`;
    await rm(temporary, { force: true });
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(canonicalBytes(value)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, path);
    const directory = await open(dirname(path), "r").catch(() => null);
    if (directory) try { await directory.sync().catch((error: NodeJS.ErrnoException) => { if (error.code !== "EPERM" && error.code !== "EINVAL") throw error; }); } finally { await directory.close(); }
    return sha256(await readFile(path));
  }

  private async loadBindingChain(evidenceRoot: string, transactionId: string, bindingHash: string, phase: string): Promise<Readonly<{ manifest: AssetGmBridgeManifest; record: BindingRecord; manifestPath: string }>> {
    const root = await this.bridgeEvidenceRoot(evidenceRoot, transactionId);
    const manifestPath = join(root, "manifest.json");
    let record: BindingRecord;
    let manifest: AssetGmBridgeManifest;
    try {
      record = JSON.parse(await readFile(join(root, "binding-record.json"), "utf8")) as BindingRecord;
      manifest = JSON.parse(await readFile(manifestPath, "utf8")) as AssetGmBridgeManifest;
    } catch { fail("STALE_OR_TAMPERED_PLAN", `${phase} requires an intact bridge binding record`); }
    if (computeManifestHash(manifest) !== record.manifestHash) fail("STALE_OR_TAMPERED_PLAN", "stored manifest was altered");
    const recomputed = computePlanBinding({
      bridgeVersion: ASSET_GM_BRIDGE_VERSION,
      manifest,
      adapterPlanHash: record.adapterPlanHash,
      expectedHead: record.expectedHead,
      plannedFiles: record.plannedFiles,
      transactionId: record.transactionId,
      resourceName: record.resourceName,
    });
    if (recomputed !== record.bindingHash || record.bindingHash !== bindingHash) fail("STALE_OR_TAMPERED_PLAN", "plan binding is stale or tampered");
    return Object.freeze({ manifest, record, manifestPath });
  }

  // ── public operations ─────────────────────────────────────────────────────

  async inspectAsset(request: AssetGmBridgeInspectAssetRequest): Promise<AssetGmBridgeAssetInspection> {
    this.gate(request.capability);
    const catalog = await this.loadCatalog();
    const entry = this.catalogEntry(catalog, request.assetId, request.assetVersion);
    const loaded = await this.readAssetFiles(entry);
    const provenanceScan = scanCatalogProvenance(catalog).find(({ assetId, version }) => assetId === entry.assetId && version === entry.version);
    const provenanceErrors = provenanceScan ? [...provenanceScan.errors] : ["missing-provenance-scan"];
    const budget = evaluateSpriteBudget({
      width: loaded.frames[0]!.width,
      height: loaded.frames[0]!.height,
      frameCount: loaded.frames.length,
      compressedBytes: loaded.frames.reduce((sum, frame) => sum + frame.bytes, 0),
      decodedBytes: loaded.frames.reduce((sum, frame) => sum + frame.width * frame.height * frame.channels, 0),
      fileCount: 0,
      gmResourceCount: 0,
    });
    const dimensions = Object.freeze({ width: loaded.frames[0]!.width, height: loaded.frames[0]!.height });
    const inspection: AssetGmBridgeAssetInspection = Object.freeze({
      schemaVersion: 1,
      assetId: entry.assetId,
      assetVersion: entry.version,
      status: entry.status,
      assetClass: entry.assetClass,
      specSha256: loaded.artifact.specSha256,
      exportSha256: loaded.exportHash,
      manifestSha256: sha256(loaded.artifactBytes),
      provenance: Object.freeze({
        source: entry.provenance.source,
        license: entry.provenance.license,
        sourceSha256: entry.provenance.sourceSha256,
        manifestSha256: entry.provenance.manifestSha256,
        errors: Object.freeze(provenanceErrors),
      }),
      frames: Object.freeze(loaded.frames.map((frame) => Object.freeze({ path: frame.path, sha256: frame.sha256, bytes: frame.bytes, width: frame.width, height: frame.height, channels: frame.channels }))),
      frameCount: loaded.frames.length,
      dimensions,
      boundingBox: loaded.boundingBox,
      estimatedDecodedBytes: loaded.frames.reduce((sum, frame) => sum + frame.width * frame.height * frame.channels, 0),
      budget,
      approved: entry.status === "APPROVED",
    });
    return inspection;
  }

  async inspectTarget(request: AssetGmBridgeInspectTargetRequest): Promise<GmProjectSnapshot> {
    this.gate(request.capability);
    const { snapshot } = await this.readTargetProject(request.projectRoot);
    return snapshot;
  }

  async planImport(request: AssetGmBridgePlanRequest): Promise<AssetGmBridgePlanResult> {
    this.gate(request.capability);
    if (!request.expectedProjectFingerprint) fail("INVALID_REQUEST", "planImport requires an expected project fingerprint");
    const catalog = await this.loadCatalog();
    const entry = this.catalogEntry(catalog, request.assetId, request.assetVersion);
    this.assertAssetApproved(entry, "plan");
    const loaded = await this.readAssetFiles(entry);
    const provenanceScan = scanCatalogProvenance(catalog).find(({ assetId, version }) => assetId === entry.assetId && version === entry.version);
    if (!provenanceScan || provenanceScan.errors.length) fail("INVALID_ASSET_MANIFEST", `catalog provenance errors: ${(provenanceScan?.errors ?? ["missing"]).join(", ")}`);
    const spec = validateSpriteSpec(JSON.parse(loaded.specBytes.toString("utf8")));
    if (spec.assetId !== entry.assetId) fail("INVALID_ASSET_MANIFEST", "spec assetId does not match the catalog entry");
    if (spec.frameCount !== loaded.frames.length) fail("INVALID_ASSET_MANIFEST", "spec frame count does not match exported frames");
    if (loaded.frames.some((frame) => frame.width !== spec.width || frame.height !== spec.height || frame.channels !== 4)) fail("INVALID_ASSET_MANIFEST", "spec dimensions or channel count do not match exported frames");
    if (spec.version !== entry.version) fail("INVALID_ASSET_MANIFEST", "spec version does not match the catalog entry");
    const target = await this.readTargetProject(request.projectRoot);
    if (target.snapshot.fingerprint !== request.expectedProjectFingerprint) fail("TARGET_SNAPSHOT_CHANGED", "target project changed since inspection");
    if (request.expectedHead !== null && request.expectedHead !== target.snapshot.gitHead) fail("STALE_OR_TAMPERED_PLAN", "target Git HEAD changed since inspection");
    // Resource name: path-safety first (hostile names -> PATH_NOT_ALLOWED),
    // then canonical-identity (case/Unicode variants -> CASE_COLLISION), then
    // the bridge naming policy. There is no bypass flag; the gate is the only
    // way a name reaches apply.
    try { safeRelativePath(request.resourceName, "resourceName"); } catch { fail("PATH_NOT_ALLOWED", "resourceName is outside the path safety policy"); }
    // The canonical name is derived from the spec's own assetId, so this rule
    // is identical for the pilot beacon and for any real catalog sprite.
    const canonicalName = canonicalResourceName(spec.assetId);
    if (normalizePathIdentity(request.resourceName) === normalizePathIdentity(canonicalName) && request.resourceName !== canonicalName) fail("CASE_COLLISION", "resourceName is a case/Unicode-variant of the canonical sprite name");
    if (request.resourceName !== canonicalName && request.resourceName !== spec.assetId && !request.resourceName.startsWith("spr_")) fail("INVALID_REQUEST", "resourceName is outside the bridge naming policy");

    const instrumentation = request.instrumentation ?? "NONE";
    if (!ASSET_GM_BRIDGE_INSTRUMENTATION.includes(instrumentation)) fail("INVALID_REQUEST", "unknown instrumentation mode");
    if (instrumentation === "PILOT_BEACON_V1") {
      // Instrumentation rewrites object code. Refuse unless every target file
      // already exists, so it can never conjure an object into a real project.
      const absent = PILOT_INSTRUMENTED_PATHS.filter((path) => !target.existingFiles.includes(path));
      if (absent.length) fail("PATH_NOT_ALLOWED", `PILOT_BEACON_V1 requires the pilot object; missing: ${absent.join(", ")}`);
    }
    const versionNumber = assetVersionToNumber(request.assetVersion);
    const spriteContext: SpriteRenderContext = {
      projectName: target.projectName,
      projectFile: target.snapshot.projectFile,
      ideVersion: target.ideVersion,
      resourceName: request.resourceName,
      width: spec.width,
      height: spec.height,
      frameCount: spec.frameCount,
      originIndex: 1,
      boundingBox: loaded.boundingBox,
    };
    const spriteYy = renderSpriteYy(spriteContext);
    const patched = patchProjectTexts({ yyp: target.yypText, resourceOrder: target.resourceOrderText }, request.resourceName);
    const spriteYyPath = `sprites/${request.resourceName}/${request.resourceName}.yy`;
    const spriteFileExists = (path: string): boolean => target.existingFiles.includes(path);

    const gml = instrumentation === "PILOT_BEACON_V1"
      ? renderImportedGml(versionNumber, true, `runtime-v${versionNumber}.png`, request.resourceName)
      : null;
    const plannedEdits: ReadonlyArray<Readonly<{ path: string; action: "modify" | "create"; content?: string; contentBase64?: string }>> = [
      { path: `${target.projectName}.resource_order`, action: target.resourceOrderText ? "modify" : "create", content: patched.resourceOrder },
      { path: target.snapshot.projectFile, action: "modify", content: patched.yyp },
      ...(gml ? [
        { path: PILOT_INSTRUMENTED_PATHS[0], action: "modify" as const, content: gml.create },
        { path: PILOT_INSTRUMENTED_PATHS[1], action: "modify" as const, content: gml.draw },
        { path: PILOT_INSTRUMENTED_PATHS[2], action: "modify" as const, content: gml.step },
      ] : []),
      { path: spriteYyPath, action: spriteFileExists(spriteYyPath) ? "modify" : "create", content: spriteYy },
      ...loaded.frames.flatMap((frame, index) => {
        const layerPath = spriteImagePath(request.resourceName, index);
        const compositePath = spriteCompositeImagePath(request.resourceName, index);
        const contentBase64 = frame.png.toString("base64");
        return [
          { path: compositePath, action: (spriteFileExists(compositePath) ? "modify" : "create") as "modify" | "create", contentBase64 },
          { path: layerPath, action: (spriteFileExists(layerPath) ? "modify" : "create") as "modify" | "create", contentBase64 },
        ];
      }),
    ];
    const plannedPaths = plannedEdits.map(({ path }) => path);
    const existingPaths = target.existingFiles.filter((path) => !path.startsWith("sprites/"));
    assertNoPathCollisions(plannedPaths, existingPaths);
    assertResourceNameAvailable(request.resourceName, target.references, target.existingFiles, target.references.includes(spriteYyPath));
    for (const path of plannedPaths) safeRelativePath(path);

    const plan: GmMutationPlan = await this.adapter.plan({
      capability: "GM_PLAN_V1",
      projectRoot: request.projectRoot,
      expectedProjectFingerprint: request.expectedProjectFingerprint,
      expectedHead: request.expectedHead,
      allowlist: [...plannedPaths],
      transactionId: request.transactionId,
      timeoutMs: request.timeoutMs,
      cancellation: request.cancellation,
      verificationPolicy: request.verificationPolicy,
      evidenceRoot: request.evidenceRoot,
      files: plannedEdits,
      allowedExtensions: ALLOWED_EXTENSIONS,
    });
    const planDigest = adapterPlanHash(plan);
    const budget = evaluateSpriteBudget({
      width: spec.width,
      height: spec.height,
      frameCount: spec.frameCount,
      compressedBytes: loaded.frames.reduce((sum, frame) => sum + frame.bytes, 0),
      decodedBytes: loaded.frames.reduce((sum, frame) => sum + frame.width * frame.height * frame.channels, 0),
      fileCount: plannedEdits.length,
      gmResourceCount: 1,
    });
    try { assertBudgetPasses(budget); } catch (error) { if (error instanceof AssetForgeError && error.code === "BUDGET_MAX") fail("ASSET_BUDGET_EXCEEDED", error.message); throw error; }

    const manifest: AssetGmBridgeManifest = Object.freeze({
      schemaVersion: 1,
      bridgeVersion: ASSET_GM_BRIDGE_VERSION,
      assetId: entry.assetId,
      assetVersion: entry.version,
      assetLifecycle: "APPROVED",
      assetSpecHash: loaded.artifact.specSha256,
      assetExportHash: loaded.exportHash,
      assetManifestHash: sha256(loaded.artifactBytes),
      assetForgeProfile: Object.freeze({
        operationContracts: Object.freeze(["asset_forge.validate_spec", "asset_forge.build", "asset_forge.build_batch", "asset_forge.capture", "asset_forge.critic", "asset_forge.resolve", "asset_forge.export", "asset_forge.inspect"]),
        budgetProfile: "bridge-sprite-v1",
      }),
      sourceProvenance: Object.freeze({
        source: entry.provenance.source,
        license: entry.provenance.license,
        sourceSha256: entry.provenance.sourceSha256,
        manifestSha256: entry.provenance.manifestSha256,
      }),
      targetEngine: "GameMaker",
      targetProjectIdentity: Object.freeze({
        projectName: target.projectName,
        projectFile: target.snapshot.projectFile,
        resourceVersion: target.snapshot.projectFormat,
        ideVersion: target.ideVersion,
      }),
      targetSnapshotHash: target.snapshot.snapshotHash,
      plannedPaths: Object.freeze([...plannedPaths].sort()),
      resourceName: request.resourceName,
      resourceType: "sprite",
      instrumentation,
      dimensions: Object.freeze({ width: spec.width, height: spec.height }),
      frameCount: spec.frameCount,
      origin: Object.freeze({ x: spec.origin.x, y: spec.origin.y }),
      boundingBox: Object.freeze({ left: spriteContext.boundingBox.left, top: spriteContext.boundingBox.top, right: spriteContext.boundingBox.right, bottom: spriteContext.boundingBox.bottom, mode: "auto" }),
      collisionPolicy: spec.collisionPolicy,
      compressionPolicy: spec.compressionPolicy,
      estimatedDecodedBytes: loaded.frames.reduce((sum, frame) => sum + frame.width * frame.height * frame.channels, 0),
      allowlist: Object.freeze([...plan.allowlist]),
      transactionId: request.transactionId,
      createdByCapability: ASSET_GM_BRIDGE_CAPABILITY,
    });
    const manifestDigest = computeManifestHash(manifest);
    const plannedFiles = plan.files.map((file) => Object.freeze({ path: file.path, action: file.action, beforeSha256: file.beforeSha256, afterSha256: file.afterSha256 }));
    const bindingHash = computePlanBinding({
      bridgeVersion: ASSET_GM_BRIDGE_VERSION,
      manifest,
      adapterPlanHash: planDigest,
      expectedHead: request.expectedHead,
      plannedFiles,
      transactionId: request.transactionId,
      resourceName: request.resourceName,
    });
    const record: BindingRecord = Object.freeze({
      schemaVersion: 1,
      transactionId: request.transactionId,
      bindingHash,
      manifestHash: manifestDigest,
      adapterPlanHash: planDigest,
      expectedHead: request.expectedHead,
      plannedFiles,
      resourceName: request.resourceName,
    });
    const evidenceRoot = await this.bridgeEvidenceRoot(request.evidenceRoot, request.transactionId);
    const existingManifest = await stat(join(evidenceRoot, "manifest.json")).catch(() => null);
    if (existingManifest) {
      // A plan already exists for this transaction id. Deterministic re-planning
      // of the IDENTICAL plan is allowed (same inputs -> same hashes); a
      // different plan under the same transaction is refused.
      let previousPlan: GmMutationPlan;
      try { previousPlan = JSON.parse(await readFile(join(evidenceRoot, "plan.json"), "utf8")) as GmMutationPlan; } catch { fail("MUTATION_ALREADY_APPLIED", "a bridge plan already exists for this transaction id"); }
      if (adapterPlanHash(previousPlan) !== planDigest) fail("MUTATION_ALREADY_APPLIED", "a different bridge plan already exists for this transaction id");
    } else {
      await this.writeStable(join(evidenceRoot, "manifest.json"), manifest);
      await this.writeStable(join(evidenceRoot, "binding-record.json"), record);
      await this.writeStable(join(evidenceRoot, "plan.json"), plan);
    }
    const manifestPath = relative(this.projectsDir, join(evidenceRoot, "manifest.json")).split("\\").join("/");
    return Object.freeze({
      schemaVersion: 1,
      transactionId: request.transactionId,
      manifest,
      manifestHash: manifestDigest,
      manifestPath,
      plan,
      planHash: planDigest,
      bindingHash,
      files: Object.freeze(plannedFiles),
      asset: Object.freeze({
        assetId: entry.assetId,
        assetVersion: entry.version,
        status: "APPROVED",
        specSha256: loaded.artifact.specSha256,
        exportSha256: loaded.exportHash,
        frameCount: spec.frameCount,
        dimensions: Object.freeze({ width: spec.width, height: spec.height }),
        boundingBox: Object.freeze({ ...spriteContext.boundingBox }),
        estimatedDecodedBytes: manifest.estimatedDecodedBytes,
        budget: Object.freeze({ status: budget.status, findings: budget.findings }),
      }),
    });
  }

  async applyImport(request: AssetGmBridgeApplyRequest): Promise<AssetGmBridgeApplyResult> {
    this.gate(request.capability);
    if (!request.confirm) fail("GATE_VIOLATION", "applyImport requires confirm=true");
    const { manifest, record } = await this.loadBindingChain(request.evidenceRoot, request.transactionId, request.bindingHash, "apply");
    if (request.planHash !== adapterPlanHash(request.plan)) fail("STALE_OR_TAMPERED_PLAN", "plan hash does not match the provided plan");
    if (request.planHash !== record.adapterPlanHash) fail("STALE_OR_TAMPERED_PLAN", "plan hash does not match the binding record");
    if (request.plan.transactionId !== request.transactionId) fail("STALE_OR_TAMPERED_PLAN", "plan transaction id does not match the request");
    const catalog = await this.loadCatalog();
    const entry = this.catalogEntry(catalog, request.assetId, request.assetVersion);
    this.assertAssetApproved(entry, "apply");
    let loaded: Awaited<ReturnType<GovernedAssetGmBridge["readAssetFiles"]>>;
    try {
      loaded = await this.readAssetFiles(entry);
    } catch (error) {
      if (error instanceof AssetGmBridgeError && (error.code === "ASSET_HASH_MISMATCH" || error.code === "INVALID_ASSET_MANIFEST")) {
        fail("STALE_OR_TAMPERED_PLAN", `asset changed after planning: ${error.message}`);
      }
      throw error;
    }
    if (loaded.exportHash !== manifest.assetExportHash) fail("STALE_OR_TAMPERED_PLAN", "asset export changed after planning");
    if (sha256(loaded.artifactBytes) !== manifest.assetManifestHash) fail("STALE_OR_TAMPERED_PLAN", "asset manifest changed after planning");
    let result: GmApplyResult;
    try {
      result = await this.adapter.applySafe({
        capability: "GM_APPLY_SAFE_V1",
        projectRoot: request.projectRoot,
        expectedProjectFingerprint: request.plan.projectFingerprint,
        expectedHead: request.plan.expectedHead,
        allowlist: request.plan.allowlist,
        transactionId: request.transactionId,
        timeoutMs: request.timeoutMs,
        cancellation: request.cancellation,
        verificationPolicy: request.verificationPolicy,
        evidenceRoot: request.evidenceRoot,
        plan: request.plan,
        planHash: request.planHash,
        confirm: true,
        dryRun: request.dryRun,
      });
    } catch (error) { return mapAdapterError(error, { phase: "apply" }); }
    return Object.freeze({
      schemaVersion: 1,
      transactionId: request.transactionId,
      applied: result.applied,
      dryRun: result.dryRun,
      state: result.state,
      planHash: result.planHash,
      bindingHash: request.bindingHash,
      manifestSha256: result.manifestSha256,
      changedFiles: result.changedFiles,
      rollbackAvailable: result.rollbackAvailable,
      projectFingerprint: result.projectFingerprint,
    });
  }

  async verifyImport(request: AssetGmBridgeVerifyRequest): Promise<GmVerificationResult> {
    this.gate(request.capability);
    const { manifest, record } = await this.loadBindingChain(request.evidenceRoot, request.transactionId, request.bindingHash, "verify");
    if (request.planHash !== adapterPlanHash(request.plan)) fail("STALE_OR_TAMPERED_PLAN", "plan hash does not match the provided plan");
    if (request.planHash !== record.adapterPlanHash) fail("STALE_OR_TAMPERED_PLAN", "plan hash does not match the binding record");
    const signal = runtimeSignalFor(manifest) ?? undefined;
    let result: GmVerificationResult;
    try {
      result = await this.adapter.verify({
        capability: "GM_VERIFY_V1",
        projectRoot: request.projectRoot,
        expectedProjectFingerprint: request.expectedProjectFingerprint,
        expectedHead: request.expectedHead,
        allowlist: request.plan.allowlist,
        transactionId: request.transactionId,
        timeoutMs: request.timeoutMs,
        cancellation: request.cancellation,
        verificationPolicy: request.verificationPolicy,
        evidenceRoot: request.evidenceRoot,
        plan: request.plan,
        planHash: request.planHash,
        levels: request.levels,
        igor: request.igor,
        expectedRuntimeSignal: signal,
      });
    } catch (error) { mapAdapterError(error, { phase: "verify", verify: "compile" }); }
    const compileLevels = ["TEXT_VALID", "PROJECT_LOAD_VALID", "COMPILE_VALID"] as const;
    const compileFailed = compileLevels.some((level) => request.levels.includes(level) && result.levels[level]?.passed === false);
    if (compileFailed) fail("VERIFY_COMPILE_FAILED", "GameMaker verification failed (project load or compile)", true, Object.freeze({ result, compileExitCode: result.compileExitCode }));
    if (request.levels.includes("RUNTIME_VALID") && result.levels.RUNTIME_VALID?.passed === false) fail("VERIFY_RUNTIME_FAILED", "GameMaker runtime verification failed", true, Object.freeze({ result, runtimeObserved: result.runtimeObserved }));
    return result;
  }

  async rollbackImport(request: AssetGmBridgeRollbackRequest): Promise<AssetGmBridgeRollbackResult> {
    this.gate(request.capability);
    if (!request.confirm) fail("GATE_VIOLATION", "rollbackImport requires confirm=true");
    const { manifest, record, manifestPath } = await this.loadBindingChain(request.evidenceRoot, request.transactionId, request.bindingHash, "rollback");
    if (request.planHash !== record.adapterPlanHash) fail("STALE_OR_TAMPERED_PLAN", "plan hash does not match the binding record");
    try {
      const result = await this.adapter.rollback({
        capability: "GM_ROLLBACK_V1",
        projectRoot: request.projectRoot,
        expectedProjectFingerprint: request.expectedProjectFingerprint,
        expectedHead: request.expectedHead,
        allowlist: manifest.allowlist,
        transactionId: request.transactionId,
        timeoutMs: request.timeoutMs,
        cancellation: request.cancellation,
        verificationPolicy: request.verificationPolicy,
        evidenceRoot: request.evidenceRoot,
        planHash: request.planHash,
        confirm: true,
      });
      return Object.freeze({
        schemaVersion: 1,
        transactionId: request.transactionId,
        restored: result.restored,
        byteExact: result.byteExact,
        restoredFiles: result.restoredFiles,
        projectFingerprint: result.projectFingerprint,
        manifestPath,
      });
    } catch (error) { mapAdapterError(error, { phase: "rollback" }); }
  }

  async status(request: AssetGmBridgeInspectTargetRequest): Promise<AssetGmBridgeStatus> {
    this.gate(request.capability);
    const catalog = await this.loadCatalog().catch(() => null);
    const entry = catalog ? catalog.entries.find((candidate) => candidate.assetId === request.assetId && candidate.version === request.assetVersion) ?? null : null;
    const adapterStatus = await this.adapter.status({
      capability: "GM_STATUS_V1",
      projectRoot: request.projectRoot,
      expectedProjectFingerprint: null,
      expectedHead: null,
      allowlist: [],
      transactionId: request.transactionId,
      timeoutMs: request.timeoutMs,
      cancellation: request.cancellation,
      verificationPolicy: request.verificationPolicy,
      evidenceRoot: request.evidenceRoot,
    });
    return Object.freeze({
      schemaVersion: 1,
      state: adapterStatus.pendingTransactions.length ? "TRANSACTION_PENDING" : adapterStatus.state === "READY" ? "READY" : "BLOCKED",
      assetId: entry?.assetId ?? null,
      assetVersion: entry?.version ?? null,
      assetApproved: entry?.status === "APPROVED",
      projectState: adapterStatus.state,
      projectFingerprint: adapterStatus.projectFingerprint,
      pendingTransactions: adapterStatus.pendingTransactions,
      rollbackAvailable: adapterStatus.rollbackAvailable,
      warnings: adapterStatus.warnings,
    });
  }
}

export { ALLOWED_EXTENSIONS, type BindingRecord };
export const bridgeErrorCodes: readonly AssetGmBridgeErrorCode[] = Object.freeze([...ASSET_GM_BRIDGE_CAPABILITY_CONTRACT.errors] as readonly AssetGmBridgeErrorCode[]);
