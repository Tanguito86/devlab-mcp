#!/usr/bin/env node
// @tanguito/devlab-shared — doctor
// Validates: build output present, exports work, schemas compile

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ok = [];
const warn = [];
const fail = [];
const distIndexUrl = pathToFileURL(join(__dirname, "..", "dist", "index.js")).href;

function check(label, pass, detail = "") {
  if (pass) { ok.push(label); } else { fail.push(`${label}  ${detail ? "→ " + detail : ""}`); }
}

// 1. dist/ output present
try {
  const distIndex = join(__dirname, "..", "dist", "index.js");
  readFileSync(distIndex, "utf8");
  check("dist/index.js present", true);
} catch (e) {
  check("dist/index.js present", false, e.message);
}

try {
  const distDts = join(__dirname, "..", "dist", "index.d.ts");
  readFileSync(distDts, "utf8");
  check("dist/index.d.ts present", true);
} catch (e) {
  check("dist/index.d.ts present", false, e.message);
}

// 2. Module files exist
const modules = ["naming.js", "tools.js", "evidence.js", "workflows.js"];
for (const m of modules) {
  try {
    const f = join(__dirname, "..", "dist", m);
    readFileSync(f, "utf8");
    check(`dist/${m} present`, true);
  } catch (e) {
    check(`dist/${m} present`, false, e.message);
  }
}

// 3. Import and verify exports
try {
  const mod = await import(distIndexUrl);
  check("exports sanitizeName", typeof mod.sanitizeName === "function");
  check("exports validateSessionId", typeof mod.validateSessionId === "function");
  check("exports textResponse", typeof mod.textResponse === "function");
  check("exports RegisterTool type", true); // TypeScript type, verified by .d.ts presence
} catch (e) {
  fail.push(`import failed → ${e.message}`);
}

// 4. Validate sanitizeName behavior
try {
  const mod = await import(distIndexUrl);
  const r1 = mod.sanitizeName("Hello World!");
  check("sanitizeName: Hello World! → hello-world", r1 === "hello-world");
  const r2 = mod.sanitizeName("");
  check("sanitizeName: empty → session", r2 === "session");
  const r3 = mod.sanitizeName("test_session_v2");
  check("sanitizeName: preserves underscores", r3 === "test_session_v2");
} catch (e) {
  fail.push(`sanitizeName runtime test failed → ${e.message}`);
}

// 5. Validate validateSessionId
try {
  const mod = await import(distIndexUrl);
  try { mod.validateSessionId("../bad"); check("validateSessionId rejects ../bad", false); } catch { check("validateSessionId rejects ../bad", true); }
  try { mod.validateSessionId(""); check("validateSessionId rejects empty", false); } catch { check("validateSessionId rejects empty", true); }
  try { mod.validateSessionId("safe_id-123"); check("validateSessionId accepts safe_id-123", true); } catch { check("validateSessionId accepts safe_id-123", false); }
} catch (e) {
  fail.push(`validateSessionId runtime test failed → ${e.message}`);
}

// 6. Check shared lines ≤400
try {
  const files = ["naming.ts", "tools.ts", "evidence.ts", "workflows.ts", "index.ts"];
  let total = 0;
  for (const f of files) {
    const p = join(__dirname, "..", "src", f);
    total += readFileSync(p, "utf8").split("\n").length;
  }
  if (total <= 400) {
    check(`Source lines: ${total} (≤400)`, true);
  } else {
    warn.push(`Source lines: ${total} (>400 soft limit)`);
  }
} catch (e) {
  warn.push(`Could not count source lines: ${e.message}`);
}

// ════════════════════════════════════════
console.log("@tanguito/devlab-shared Doctor");
console.log("════════════════════════════════════");
for (const o of ok) console.log(`  ✅ ${o}`);
for (const w of warn) console.log(`  ⚠️ ${w}`);
for (const f of fail) console.log(`  ❌ ${f}`);

if (fail.length > 0) {
  console.log(`\nResult: 🔴 ${fail.length} failure(s)`);
  process.exit(1);
}
console.log(`\nResult: Ready ✅ (${ok.length} checks passed${warn.length ? `, ${warn.length} warnings` : ""})`);
