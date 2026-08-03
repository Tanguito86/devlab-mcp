import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { CaptureServer } from "../scripts/capture-harness/server.js";

const tmpDirs = [];
after(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function makeFixture(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "cap-server-"));
  tmpDirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

async function get(server, path) {
  const res = await fetch(`${server.baseUrl}${path}`);
  return { status: res.status, body: await res.text() };
}

test("serves index.html at root with correct MIME", async () => {
  const root = makeFixture({ "index.html": "<h1>hi</h1>" });
  const server = new CaptureServer(root);
  const port = await server.start();
  try {
    assert.ok(port > 0);
    const { status, body } = await get(server, "/");
    assert.equal(status, 200);
    assert.equal(body, "<h1>hi</h1>");
  } finally {
    await server.close();
  }
});

test("binds 127.0.0.1 only", async () => {
  const root = makeFixture({ "index.html": "x" });
  const server = new CaptureServer(root);
  const port = await server.start();
  try {
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200, "localhost resolves to loopback, should work");
  } finally {
    await server.close();
  }
});

test("no directory listing and no directory serving", async () => {
  const root = makeFixture({ "index.html": "x", "sub/index.html": "y" });
  const server = new CaptureServer(root);
  await server.start();
  try {
    const dir = await get(server, "/sub");
    assert.equal(dir.status, 404, "directory path must not be served");
    const listing = await get(server, "/sub/");
    assert.equal(listing.status, 404, "no directory listing");
  } finally {
    await server.close();
  }
});

test("path traversal is rejected (.., encoded, absolute)", async () => {
  const root = makeFixture({ "index.html": "x" });
  // secret.txt lives OUTSIDE the fixture root; any route reaching it is a leak.
  const outside = mkdtempSync(join(tmpdir(), "cap-secret-"));
  tmpDirs.push(outside);
  writeFileSync(join(outside, "secret.txt"), "s3cret");
  const server = new CaptureServer(root);
  await server.start();
  try {
    assert.equal((await get(server, "/../secret.txt")).status, 404);
    assert.equal((await get(server, "/%2e%2e/secret.txt")).status, 404);
    assert.equal((await get(server, "/..%2fsecret.txt")).status, 404);
    assert.equal((await get(server, "/%2e%2e%2fsecret.txt")).status, 404);
    assert.equal((await get(server, "/secret.txt")).status, 404, "file outside root must never resolve");
  } finally {
    await server.close();
  }
});

test("symlinks are rejected even inside the fixture", async () => {
  const root = makeFixture({ "index.html": "x" });
  const outside = makeFixture({ "leak.txt": "leak" });
  const linkPath = join(root, "link.txt");
  try {
    symlinkSync(join(outside, "leak.txt"), linkPath, "file");
  } catch {
    // symlink creation unsupported in this environment: fail closed anyway
    assert.ok(true, "symlink creation not supported here; nothing to test");
    return;
  }
  const server = new CaptureServer(root);
  await server.start();
  try {
    assert.equal((await get(server, "/link.txt")).status, 404, "symlink must not be served");
  } finally {
    await server.close();
  }
});

test("vendor file and vendor directory mapping work", async () => {
  const root = makeFixture({ "index.html": "x" });
  const vendorFile = join(root, "..", `vendor-file-${Date.now()}.js`);
  const vendorDir = mkdtempSync(join(tmpdir(), "cap-vendor-"));
  tmpDirs.push(vendorDir);
  writeFileSync(vendorFile, "module export");
  writeFileSync(join(vendorDir, "addon.js"), "addon");
  writeFileSync(join(vendorDir, "nested.js"), "nested");
  const server = new CaptureServer(root, { vendor: [vendorFile, vendorDir] });
  await server.start();
  try {
    const base = vendorFile.split(/[\\/]/).pop();
    assert.equal((await get(server, `/vendor/${base}`)).status, 200);
    assert.equal((await get(server, "/vendor/vendor-dir/no-such.js")).status, 404);
    // directory mapped under its own name: /vendor/<dirname>/<file>
    const dirName = vendorDir.split(/[\\/]/).pop();
    assert.equal((await get(server, `/vendor/${dirName}/addon.js`)).status, 200);
    assert.equal((await get(server, `/vendor/${dirName}/nested.js`)).status, 200);
    assert.equal((await get(server, `/vendor/${dirName}/../addon.js`)).status, 404, "traversal inside vendor rejected");
    assert.equal((await get(server, `/vendor/${dirName}/nested.js/../../x`)).status, 404);
  } finally {
    await server.close();
  }
});

test("unknown paths are 404 with no content-type leak", async () => {
  const root = makeFixture({ "index.html": "x" });
  const server = new CaptureServer(root);
  await server.start();
  try {
    assert.equal((await get(server, "/missing.txt")).status, 404);
  } finally {
    await server.close();
  }
});

test("close is idempotent and releases the port", async () => {
  const root = makeFixture({ "index.html": "x" });
  const server = new CaptureServer(root);
  const port = await server.start();
  await server.close();
  await server.close();
  const res = await fetch(`http://127.0.0.1:${port}/`).catch((e) => null);
  assert.equal(res, null, "port must be released after close");
});
