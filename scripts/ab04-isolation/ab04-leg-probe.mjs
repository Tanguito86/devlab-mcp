#!/usr/bin/env node
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { connect } from "node:net";
import { access, readFile, writeFile, rm, mkdir, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const [configPath, resultPath] = process.argv.slice(2);
if (!configPath || !resultPath) throw new Error("usage: ab04-leg-probe.mjs <config.json> <result.json>");
const config = JSON.parse(await readFile(configPath, "utf8"));
const result = { schemaVersion: 1, leg: config.leg, pid: process.pid, user: process.env.USERNAME, tests: {} };

async function canRead(path) {
  try {
    await access(path, constants.R_OK);
    const metadata = await stat(path);
    if (metadata.isDirectory()) await readdir(path);
    else await readFile(path);
    return true;
  } catch { return false; }
}
async function canWriteDirectory(path) {
  const probe = join(path, `.ab04-write-${process.pid}.tmp`);
  try { await writeFile(probe, "probe", { flag: "wx" }); await rm(probe); return true; } catch { return false; }
}
async function fetchSucceeds(url, timeout = 4000) {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(timeout) }); await response.arrayBuffer(); return true; } catch { return false; }
}
async function tcpConnects(host, port, timeout = 4000) {
  return await new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(timeout, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
async function udpDnsResponds(host, timeout = 4000) {
  const query = Buffer.from([
    0xab, 0x04, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 0x03, 0x63, 0x6f, 0x6d,
    0x00, 0x00, 0x01, 0x00, 0x01,
  ]);
  return await new Promise((resolve) => {
    const socket = createSocket("udp4");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeout);
    socket.once("message", () => finish(true));
    socket.once("error", () => finish(false));
    socket.send(query, 53, host, (error) => { if (error) finish(false); });
  });
}
async function runCandidate(file, args, timeout = 6000) {
  return await new Promise((resolve) => {
    let settled = false;
    const child = spawn(file, args, { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill(); resolve({ file, available: true, timedOut: true, exitCode: null }); } }, timeout);
    child.once("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ file, available: false, error: error.code }); } });
    child.once("exit", (exitCode) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ file, available: true, timedOut: false, exitCode }); } });
  });
}

async function cdpEvaluate(wsUrl, expression) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const id = 1;
  const reply = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP timeout")), 10000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id === id) { clearTimeout(timer); resolve(message); }
    });
  });
  socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  const message = await reply;
  socket.close();
  if (message.error || message.result?.exceptionDetails) throw new Error("CDP evaluation failed");
  return message.result.result.value;
}

async function probeChromium() {
  await mkdir(config.browserProfile, { recursive: true });
  const chrome = spawn(config.chromium, [
    "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-sync", "--metrics-recording-only", "--remote-debugging-port=0",
    `--user-data-dir=${config.browserProfile}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  try {
    const activePort = join(config.browserProfile, "DevToolsActivePort");
    let lines;
    for (let i = 0; i < 100; i++) {
      try { lines = (await readFile(activePort, "utf8")).trim().split(/\r?\n/); if (lines.length >= 2) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!lines) throw new Error("DevToolsActivePort missing");
    const port = Number(lines[0]);
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const target = await targetResponse.json();
    const gpu = await cdpEvaluate(target.webSocketDebuggerUrl, `(async () => {
      if (!navigator.gpu) return { available: false };
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return { available: true, adapter: false };
      const device = await adapter.requestDevice();
      const input = new Uint32Array([7, 11, 13, 17]);
      const storage = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, mappedAtCreation: true });
      new Uint32Array(storage.getMappedRange()).set(input);
      storage.unmap();
      const readback = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const module = device.createShaderModule({ code: '@group(0) @binding(0) var<storage, read_write> values: array<u32>; @compute @workgroup_size(4) fn main(@builtin(global_invocation_id) id: vec3<u32>) { values[id.x] = values[id.x] * 2u; }' });
      const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
      const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: storage } }] });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.dispatchWorkgroups(1); pass.end();
      encoder.copyBufferToBuffer(storage, 0, readback, 0, input.byteLength);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const values = Array.from(new Uint32Array(readback.getMappedRange()).slice());
      readback.unmap();
      const info = adapter.info || {};
      return { available: true, adapter: true, deviceCreated: true, computeSubmitted: true, readback: values, readbackVerified: values.join(',') === '14,22,26,34', vendor: info.vendor || '', architecture: info.architecture || '', device: info.device || '', description: info.description || '' };
    })()`);
    return { launched: true, pid: chrome.pid, devtoolsLoopback: true, gpu };
  } finally {
    chrome.kill();
  }
}

async function startLoopback(host) {
  const server = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/plain" }); response.end("AB04_LOOPBACK_OK"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, host, resolve); });
  const literal = host.includes(":") ? `[${host}]` : host;
  return { server, url: `http://${literal}:${server.address().port}/` };
}

const ipv4 = await startLoopback("127.0.0.1");
let ipv6;
try { ipv6 = await startLoopback("::1"); } catch { ipv6 = null; }
try {
  result.tests.ownRootWritable = await canWriteDirectory(config.ownRoot);
  result.tests.siblingReadable = await canRead(config.siblingSentinel);
  result.tests.privateReadable = await canRead(config.privateSentinel);
  result.tests.externalReadable = await canRead(config.externalSentinel);
  result.tests.deniedTargets = [];
  for (const target of config.deniedTargets || []) result.tests.deniedTargets.push({ path: target, readable: await canRead(target) });
  result.tests.guidance = { readable: [], writable: null };
  for (const target of config.guidanceFiles || []) result.tests.guidance.readable.push({ path: target, readable: await canRead(target) });
  if (config.guidanceRoot) result.tests.guidance.writable = await canWriteDirectory(config.guidanceRoot);
  result.tests.loopbackIPv4 = await fetchSucceeds(ipv4.url);
  result.tests.loopbackIPv6 = ipv6 ? await fetchSucceeds(ipv6.url) : false;
  result.tests.localhostAvailable = result.tests.loopbackIPv4 && result.tests.loopbackIPv6;
  const externalIp = config.externalProbeIp || "1.1.1.1";
  result.tests.externalTcpHttp = await tcpConnects(externalIp, 80);
  result.tests.externalTcpHttps = await tcpConnects(externalIp, 443);
  result.tests.externalDnsUdp = await udpDnsResponds(externalIp);
  result.tests.externalDnsTcp = await tcpConnects(externalIp, 53);
  result.tests.internetAvailable = result.tests.externalTcpHttp || result.tests.externalTcpHttps || result.tests.externalDnsUdp || result.tests.externalDnsTcp;
  result.tests.chromium = await probeChromium();
  result.tests.childEscape = [];
  for (const candidate of config.escapeCandidates) result.tests.childEscape.push(await runCandidate(candidate.file, candidate.args));
} finally {
  ipv4.server.close();
  if (ipv6) ipv6.server.close();
}
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
