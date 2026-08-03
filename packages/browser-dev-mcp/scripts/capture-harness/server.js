// DevLab capture harness — minimal secure static server.
// Node stdlib only. Binds 127.0.0.1 on an ephemeral port, serves only the
// allowlisted fixture root, no directory listing, no symlink escape,
// no external network. Guaranteed close.

import http from "node:http";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function lstatSafe(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function isRegularContainedFile(root, target) {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  if (normalizedTarget === normalizedRoot || !normalizedTarget.startsWith(normalizedRoot + sep)) {
    return false;
  }
  const rel = relative(normalizedRoot, normalizedTarget);
  let current = normalizedRoot;
  for (const segment of rel.split(sep)) {
    current = join(current, segment);
    const stat = lstatSafe(current);
    if (!stat || stat.isSymbolicLink()) return false;
  }
  const final = lstatSafe(normalizedTarget);
  if (!final?.isFile()) return false;
  try {
    const realRoot = realpathSync(normalizedRoot);
    const realTarget = realpathSync(normalizedTarget);
    return realTarget.startsWith(realRoot + sep);
  } catch {
    return false;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

export class CaptureServer {
  /**
   * @param {string} root absolute path of the allowlisted fixture directory
   * @param {object} [opts]
   * @param {string[]} [opts.vendor] absolute file paths exposed under /vendor/<basename>
   * @param {number} [opts.startTimeoutMs]
   */
  constructor(root, { vendor = [], startTimeoutMs = 5000 } = {}) {
    this.root = resolve(root);
    // vendor entries: absolute file paths (served as /vendor/<basename>) or
    // absolute directory paths (served as /vendor/<dirname>/<subpath>).
    this.vendor = vendor.map((p) => resolve(p));
    this.startTimeoutMs = startTimeoutMs;
    this.server = null;
    this.port = 0;
    this.started = false;
  }

  _resolveVendor(name) {
    // /vendor/<name> where name is <dir>/<subpath...> for a vendor directory
    // entry, or <basename> for a vendor file entry.
    if (!name || name.includes("..") || name.includes("\\")) return null;
    const slash = name.indexOf("/");
    const dirName = slash === -1 ? null : name.slice(0, slash);
    const rest = slash === -1 ? name : name.slice(slash + 1);
    for (const entry of this.vendor) {
      const stat = lstatSafe(entry);
      if (!stat) continue;
      if (stat.isFile() && slash === -1 && entry.endsWith(`${sep}${name}`)) {
        return entry;
      }
      if (stat.isDirectory() && dirName && entry.endsWith(`${sep}${dirName}`)) {
        const target = resolve(entry, ...rest.split("/"));
        if (target !== entry && !target.startsWith(entry + sep)) return null;
        if (isRegularContainedFile(entry, target)) return target;
        return null;
      }
    }
    return null;
  }

  _resolvePath(urlPath) {
    if (urlPath === "/") return join(this.root, "index.html");
    // vendor mapping: /vendor/<name>
    if (urlPath.startsWith("/vendor/")) {
      return this._resolveVendor(urlPath.slice("/vendor/".length));
    }
    const target = resolve(this.root, `.${urlPath}`);
    if (target !== this.root && !target.startsWith(this.root + sep)) return null;
    return target;
  }

  async start() {
    this.server = http.createServer((req, res) => {
      let urlPath;
      try {
        urlPath = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
      } catch {
        res.writeHead(400);
        res.end("bad request");
        return;
      }
      const file = this._resolvePath(urlPath);
      if (!file) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      let stat;
      try {
        stat = lstatSync(file);
      } catch {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const fixtureFile = file.startsWith(this.root + sep);
      const vendorDirectory = this.vendor.find((entry) => {
        const vendorStat = lstatSafe(entry);
        return vendorStat?.isDirectory() && file.startsWith(entry + sep);
      });
      // Every segment below a served directory is checked. A final-file lstat
      // alone is insufficient because an ancestor may be a junction.
      if (stat.isSymbolicLink() || !stat.isFile()
        || (fixtureFile && !isRegularContainedFile(this.root, file))
        || (vendorDirectory && !isRegularContainedFile(vendorDirectory, file))) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
        connection: "close",
      });
      res.end(readFileSync(file));
    });

    await new Promise((resolveStart, rejectStart) => {
      const timer = setTimeout(
        () => rejectStart(new Error("server start timeout")),
        this.startTimeoutMs,
      );
      this.server.once("error", (err) => {
        clearTimeout(timer);
        rejectStart(err);
      });
      this.server.listen(0, "127.0.0.1", () => {
        clearTimeout(timer);
        this.port = this.server.address().port;
        this.started = true;
        resolveStart();
      });
    });
    return this.port;
  }

  get baseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  async close() {
    if (!this.server) return;
    await new Promise((resolveClose) => {
      this.server.close(() => resolveClose());
      this.server.closeAllConnections?.();
    });
    this.server = null;
    this.started = false;
  }
}

// Convenience: resolve a bare npm specifier to an absolute file path from the
// package's own node_modules (workspace pnpm store included).
export function resolveVendor(specifier, fromMetaUrl = import.meta.url) {
  const { createRequire } = awaitImport();
  const req = createRequire(fromMetaUrl);
  return req.resolve(specifier);
}

function awaitImport() {
  // static import of createRequire is fine in ESM
  return import("node:module");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
  // tiny smoke: node scripts/capture-harness/server.js <root>
  const root = process.argv[2];
  if (!root) {
    console.error("usage: node server.js <fixture-root>");
    process.exit(2);
  }
  const srv = new CaptureServer(root);
  srv.start().then(() => {
    console.log(`serving ${srv.root} at ${srv.baseUrl}`);
    srv.close();
  });
}
