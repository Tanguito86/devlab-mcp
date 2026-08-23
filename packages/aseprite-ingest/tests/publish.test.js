// Publishing is tested without Aseprite: it reads what an ingest left behind,
// and a fixture on disk is indistinguishable from a real one as far as it is
// concerned. That keeps the whole refusal surface running in CI.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { canonicalJson, publishAsepriteAsset } from "../dist/index.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const CATALOG = "assets/catalog/asset-catalog.json";
const ID = "test-sprite";
const VERSION = "1.0.0";

async function put(root, relative, contents) {
  const absolute = join(root, relative);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents);
  return absolute;
}

/** Lays out exactly what a completed ingest leaves on disk. */
async function ingested(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "publish-"));
  const specRelative = `assets/pilots/${ID}/${VERSION}.spec.json`;
  const artifactDir = `assets/builds/artifacts/${ID}/${VERSION}`;
  const manifestRelative = `${artifactDir}/artifact-manifest.json`;

  const specText = `${canonicalJson({
    schemaVersion: 1, assetId: ID, version: VERSION, width: 16, height: 16,
    frameCount: 2, origin: { x: 8, y: 8 }, collisionPolicy: "bbox-auto",
    compressionPolicy: "png-default", budgetProfile: "bridge-sprite-v1",
  })}\n`;
  await put(root, specRelative, specText);

  const frames = [];
  for (const index of [0, 1]) {
    const bytes = Buffer.from(`frame-${index}-pixels`, "utf8");
    const path = `${artifactDir}/exports/${ID}-${VERSION}_${index}.png`;
    await put(root, path, bytes);
    frames.push({ path, sha256: sha256(bytes), bytes: bytes.byteLength, width: 16, height: 16, channels: 4 });
  }

  const manifest = {
    schemaVersion: 1, assetId: ID, version: VERSION,
    specPath: specRelative, specSha256: sha256(specText),
    sourceSha256: sha256("the-aseprite-source"),
    generatedModuleSha256: "0".repeat(64),
    budgetProfile: "bridge-sprite-v1",
    gates: { SPEC_GATE: "PASS", BUDGET_GATE: "PASS", PNG_GATE: "PASS", DETERMINISM_GATE: "PASS", LIFECYCLE_GATE: "PASS" },
    outputs: frames,
    ...overrides,
  };
  await put(root, manifestRelative, `${canonicalJson(manifest)}\n`);
  await put(root, CATALOG, `${canonicalJson({ entries: [], migration: "asset-catalog-v1", schemaVersion: 1 })}\n`);
  return { root, specRelative, manifestRelative, frames };
}

const request = (root, extra = {}) => ({
  repoRoot: root, catalogPath: CATALOG, assetId: ID, version: VERSION,
  status: "APPROVED", approvedBy: "test", now: () => "2026-01-01T00:00:00.000Z",
  dryRun: false, ...extra,
});

const catalogOf = async (root) => JSON.parse(await readFile(join(root, CATALOG), "utf8"));

test("PUBLISH: an ingested asset reaches the catalog as APPROVED", async () => {
  const { root } = await ingested();
  try {
    const result = await publishAsepriteAsset(request(root));
    assert.equal(result.published, true);
    assert.equal(result.status, "APPROVED");
    assert.equal(result.replaced, false);
    assert.equal(result.verifiedOutputs, 2);

    const catalog = await catalogOf(root);
    assert.equal(catalog.entries.length, 1);
    const entry = catalog.entries[0];
    assert.equal(entry.assetId, ID);
    assert.equal(entry.version, VERSION);
    assert.equal(entry.status, "APPROVED");
    assert.equal(entry.assetClass, "bridge-sprite");
    assert.equal(entry.exports.length, 2);
    assert.equal(entry.provenance.sourceSha256, sha256("the-aseprite-source"));
    // The entry carries exactly the keys Asset Forge's validator accepts.
    assert.deepEqual(Object.keys(entry).sort(), [
      "artifactManifest", "assetClass", "assetId", "budgetProfile", "criticProfiles",
      "exports", "factoryCapability", "provenance", "rendererTargets", "specPath",
      "status", "version",
    ]);
    assert.deepEqual(Object.keys(entry.provenance).sort(), [
      "license", "manifest", "manifestSha256", "source", "sourceSha256",
    ]);

    // Both durable audit phases exist before the catalog exposes APPROVED.
    assert.equal(result.approvalLogPath, "assets/catalog/approvals.jsonl");
    const log = (await readFile(join(root, "assets/catalog/approvals.jsonl"), "utf8")).trim().split(/\r?\n/);
    assert.equal(log.length, 2);
    const [prepared, committed] = log.map((line) => JSON.parse(line));
    assert.match(prepared.approvalId, /^[a-f0-9]{64}$/);
    assert.equal(committed.approvalId, prepared.approvalId);
    const common = {
      approvalId: prepared.approvalId,
      assetId: ID, at: "2026-01-01T00:00:00.000Z", by: "test",
      catalogSha256: result.catalogSha256,
      manifestSha256: JSON.parse(await readFile(join(root, CATALOG), "utf8")).entries[0].provenance.manifestSha256,
      status: "APPROVED", version: VERSION,
    };
    assert.deepEqual(prepared, { ...common, phase: "PREPARED" });
    assert.deepEqual(committed, { ...common, phase: "COMMITTED" });
    assert.equal(result.catalogSha256, sha256(await readFile(join(root, CATALOG), "utf8")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: DRAFT records no approval", async () => {
  const { root } = await ingested();
  try {
    const result = await publishAsepriteAsset(request(root, { status: "DRAFT" }));
    const [entry] = (await catalogOf(root)).entries;
    assert.equal(entry.status, "DRAFT");
    // A draft is not an approval, so nothing is logged.
    assert.equal(result.approvalLogPath, null);
    await assert.rejects(readFile(join(root, "assets/catalog/approvals.jsonl"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: a dry run verifies everything and writes nothing", async () => {
  const { root } = await ingested();
  try {
    const before = await readFile(join(root, CATALOG), "utf8");
    const result = await publishAsepriteAsset(request(root, { dryRun: true }));
    assert.equal(result.published, false);
    assert.equal(result.dryRun, true);
    assert.equal(result.verifiedOutputs, 2, "a dry run still checks the frames");
    assert.equal(await readFile(join(root, CATALOG), "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: it defaults to a dry run", async () => {
  const { root } = await ingested();
  try {
    const result = await publishAsepriteAsset({ ...request(root), dryRun: undefined });
    assert.equal(result.dryRun, true);
    assert.equal((await catalogOf(root)).entries.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: republishing replaces in place and stays deterministic", async () => {
  const { root } = await ingested();
  try {
    const first = await publishAsepriteAsset(request(root, { status: "DRAFT" }));
    const second = await publishAsepriteAsset(request(root, { status: "APPROVED" }));
    assert.equal(second.replaced, true);
    const catalog = await catalogOf(root);
    assert.equal(catalog.entries.length, 1, "republishing must not duplicate the entry");
    assert.equal(catalog.entries[0].status, "APPROVED");
    assert.notEqual(first.catalogSha256, second.catalogSha256);

    const third = await publishAsepriteAsset(request(root, { status: "APPROVED" }));
    assert.equal(third.catalogSha256, second.catalogSha256, "the same publish twice is byte-identical");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: entries stay sorted so the index reads as a diff", async () => {
  const { root } = await ingested();
  try {
    await put(root, CATALOG, `${canonicalJson({
      entries: [{ assetId: "zzz-last", version: "1.0.0", status: "APPROVED" }], schemaVersion: 1,
    })}\n`);
    await publishAsepriteAsset(request(root));
    const catalog = await catalogOf(root);
    assert.deepEqual(catalog.entries.map(({ assetId }) => assetId), ["test-sprite", "zzz-last"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: an asset whose frames changed since ingest is refused", async () => {
  const { root, frames } = await ingested();
  try {
    await put(root, frames[1].path, Buffer.from("tampered", "utf8"));
    await assert.rejects(
      publishAsepriteAsset(request(root)),
      (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /changed after ingest/.test(error.message),
    );
    assert.equal((await catalogOf(root)).entries.length, 0, "a refusal must leave the catalog alone");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: an edited spec is refused", async () => {
  const { root, specRelative } = await ingested();
  try {
    await put(root, specRelative, `${canonicalJson({ schemaVersion: 1, assetId: ID, tampered: true })}\n`);
    await assert.rejects(
      publishAsepriteAsset(request(root)),
      (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /no longer matches/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: a failed ingest gate cannot be published", async () => {
  const { root } = await ingested({
    gates: { SPEC_GATE: "PASS", BUDGET_GATE: "PASS", PNG_GATE: "PASS", DETERMINISM_GATE: "FAIL", LIFECYCLE_GATE: "PASS" },
  });
  try {
    await assert.rejects(
      publishAsepriteAsset(request(root)),
      (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /DETERMINISM_GATE did not pass/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: missing or extra ingest gates cannot be published", async () => {
  const exact = { SPEC_GATE: "PASS", BUDGET_GATE: "PASS", PNG_GATE: "PASS", DETERMINISM_GATE: "PASS", LIFECYCLE_GATE: "PASS" };
  const cases = [
    {},
    Object.fromEntries(Object.entries(exact).filter(([gate]) => gate !== "PNG_GATE")),
    { ...exact, UNRECOGNIZED_GATE: "PASS" },
  ];
  for (const gates of cases) {
    const { root } = await ingested({ gates });
    try {
      await assert.rejects(
        publishAsepriteAsset(request(root)),
        (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /exactly these ingest gates/.test(error.message),
      );
      assert.equal((await catalogOf(root)).entries.length, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("PUBLISH: audit persistence failure cannot expose APPROVED", async () => {
  const { root } = await ingested();
  try {
    const catalogBefore = await readFile(join(root, CATALOG));
    // A directory at the audit-file path deterministically makes the durable
    // append fail on every supported host without relying on permissions.
    await mkdir(join(root, "assets/catalog/approvals.jsonl"));
    await assert.rejects(publishAsepriteAsset(request(root)));
    assert.deepEqual(await readFile(join(root, CATALOG)), catalogBefore);
    assert.equal((await catalogOf(root)).entries.length, 0, "APPROVED must remain invisible when audit persistence fails");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: concurrent publishers fail closed instead of losing an update", async () => {
  const { root } = await ingested();
  let enteredCommit;
  let releaseCommit;
  const entered = new Promise((resolve) => { enteredCommit = resolve; });
  const hold = new Promise((resolve) => { releaseCommit = resolve; });
  try {
    const first = publishAsepriteAsset(request(root, {
      status: "DRAFT",
      beforeCatalogCommit: async () => { enteredCommit(); await hold; },
    }));
    await entered;
    await assert.rejects(
      publishAsepriteAsset(request(root, { status: "DRAFT" })),
      (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /already being published/.test(error.message),
    );
    releaseCommit();
    await first;
    assert.equal((await catalogOf(root)).entries.length, 1);
    await assert.rejects(readFile(join(root, `${CATALOG}.devlab-publish.lock`)), "the owned lock must be released");
  } finally {
    releaseCommit?.();
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: a non-cooperating catalog edit is preserved and aborts commit", async () => {
  const { root } = await ingested();
  const external = `${canonicalJson({
    entries: [{ assetId: "external", version: "1.0.0", status: "DRAFT" }],
    migration: "asset-catalog-v1",
    schemaVersion: 1,
  })}\n`;
  try {
    await assert.rejects(
      publishAsepriteAsset(request(root, {
        beforeCatalogCommit: async () => { await writeFile(join(root, CATALOG), external, "utf8"); },
      })),
      (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /changed during publish/.test(error.message),
    );
    assert.equal(await readFile(join(root, CATALOG), "utf8"), external);
    await assert.rejects(readFile(join(root, "assets/catalog/approvals.jsonl"), "utf8"), "audit must not commit after a failed compare");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: an asset that was never ingested is refused", async () => {
  const { root } = await ingested();
  try {
    await assert.rejects(
      publishAsepriteAsset(request(root, { version: "9.9.9" })),
      (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /ingest the asset before publishing/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: a manifest describing another asset is refused", async () => {
  const { root, manifestRelative } = await ingested();
  try {
    const manifest = JSON.parse(await readFile(join(root, manifestRelative), "utf8"));
    await put(root, manifestRelative, `${canonicalJson({ ...manifest, assetId: "someone-else" })}\n`);
    await assert.rejects(
      publishAsepriteAsset(request(root)),
      (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /different asset/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: an asset ingested before source provenance was recorded is refused", async () => {
  const { root, manifestRelative } = await ingested();
  try {
    const manifest = JSON.parse(await readFile(join(root, manifestRelative), "utf8"));
    delete manifest.sourceSha256;
    await put(root, manifestRelative, `${canonicalJson(manifest)}
`);
    await assert.rejects(
      publishAsepriteAsset(request(root)),
      (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /re-ingest this asset/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: the written catalog always carries the header the bridge requires", async () => {
  const { root } = await ingested();
  try {
    // A catalog missing its header comes back valid rather than staying broken.
    await put(root, CATALOG, `${canonicalJson({ entries: [] })}
`);
    await publishAsepriteAsset(request(root));
    const catalog = await catalogOf(root);
    assert.deepEqual(Object.keys(catalog).sort(), ["entries", "migration", "schemaVersion"]);
    assert.equal(catalog.migration, "asset-catalog-v1");
    assert.equal(catalog.schemaVersion, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: a catalog from a schema this publisher does not write is refused", async () => {
  const { root } = await ingested();
  try {
    for (const header of [{ schemaVersion: 2 }, { migration: "asset-catalog-v2" }]) {
      await put(root, CATALOG, `${canonicalJson({ entries: [], migration: "asset-catalog-v1", schemaVersion: 1, ...header })}
`);
      await assert.rejects(
        publishAsepriteAsset(request(root)),
        (error) => error.code === "ASEPRITE_PUBLISH_REFUSED" && /only writes/.test(error.message),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PUBLISH: a catalog path outside the repository is refused", async () => {
  const { root } = await ingested();
  try {
    for (const catalogPath of ["../escape.json", "a/../../b.json"]) {
      await assert.rejects(publishAsepriteAsset(request(root, { catalogPath })));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
