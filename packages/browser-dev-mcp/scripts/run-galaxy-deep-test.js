#!/usr/bin/env node

import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(__dirname, '..', '..', '..', 'evidence', 'galaxy-deep-test');
mkdirSync(EVIDENCE_DIR, { recursive: true });

const PROFILE = JSON.parse(readFileSync(join(__dirname, '..', 'profiles', 'galaxy-raiders.json'), 'utf8'));
const WORKFLOW_DIR = join(__dirname, '..', 'workflows', 'galaxy-raiders');

const workflows = [
  'galaxy-smoke-full',
  'galaxy-boss-ladder',
  'galaxy-performance-sample',
  'galaxy-console-audit'
];

const results = [];

function makeExecutors(page, evidenceDir, logs, errors) {

  // Helper: push console logs from Playwright native events into window.__browser_console_logs too
  const syncLogs = async (page, logs) => {
    await page.evaluate((arr) => {
      if (!window.__browser_console_logs) window.__browser_console_logs = [];
      const latest = arr.slice(-50);
      window.__browser_console_logs = latest;
    }, logs);
  };

  return {
  browser_open_url: async (args) => { await page.goto(args.url, { waitUntil: 'domcontentloaded' }); return `navigated to ${args.url}`; },
  browser_wait: async (args) => { const ms = args.ms || 1000; await new Promise(r => setTimeout(r, ms)); return `waited ${ms}ms`; },
  browser_screenshot: async (args) => {
    const path = join(evidenceDir, `${args.name}.png`);
    await page.screenshot({ path, fullPage: true });
    return `screenshot saved: ${path}`;
  },
  browser_screenshot_canvas: async (args) => {
    const path = join(evidenceDir, `${args.name}_canvas.png`);
    try {
      const el = await page.$(args.selector || 'canvas');
      if (!el) return `no canvas element: ${args.selector}`;
      await el.screenshot({ path });
      return `canvas screenshot saved: ${path}`;
    } catch(e) { return `canvas screenshot error: ${e.message}`; }
  },
  browser_press_key: async (args) => { await page.keyboard.press(args.key); return `pressed ${args.key}`; },
  browser_get_console_logs: async (args) => {
    await syncLogs(page, logs);
    const entries = await page.evaluate(() => {
      if (Array.isArray(window.__browser_console_logs)) return window.__browser_console_logs;
      return [];
    });
    return JSON.stringify(entries.slice(-30));
  },
  browser_get_page_errors: async (args) => {
    // Use Playwright-captured errors (most reliable)
    return JSON.stringify(errors.slice(-20));
  },
  browser_evaluate_js: async (args) => {
    return await page.evaluate(args.expression);
  },
  browser_evaluate_game_state: async (args) => {
    return await page.evaluate(args.expression);
  }
  };
}

async function runWorkflow(name) {
  const wfPath = join(WORKFLOW_DIR, `${name}.json`);
  const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
  console.log(`\n━━━ ${wf.name} ━━━`);
  console.log(`   Steps: ${wf.steps.length}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
  });
  const context = await browser.newContext({
    viewport: PROFILE.viewport || { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  // Capture console via Playwright native events (works for ALL scripts)
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => { consoleLogs.push(`[${msg.type()}] ${msg.text()}`); });
  page.on('pageerror', err => { pageErrors.push(err.message); });

  // Also expose capture array for evaluate-based access
  await page.evaluate(() => {
    window.__browser_console_logs = [];
    window.__browser_page_errors = [];
  });

  // Use makeExecutors to create tool executors with closure access to logs
  const executors = makeExecutors(page, EVIDENCE_DIR, consoleLogs, pageErrors);

  const stepResults = [];
  let failed = false;

  for (const [i, step] of wf.steps.entries()) {
    const executor = executors[step.tool];
    if (!executor) {
      console.log(`   ✗ Step ${i+1}: unknown tool ${step.tool}`);
      stepResults.push({ step: i+1, tool: step.tool, passed: false, error: 'unknown tool' });
      failed = true;
      break;
    }

    try {
      const result = await executor(step.args || {});
      const displayResult = typeof result === 'string' ? result.slice(0, 120) : JSON.stringify(result).slice(0, 120);
      console.log(`   ✓ Step ${i+1}: ${step.description} → ${displayResult}`);
      stepResults.push({ step: i+1, tool: step.tool, passed: true, result: displayResult });
    } catch(e) {
      console.log(`   ✗ Step ${i+1}: ${step.description} → ${e.message}`);
      stepResults.push({ step: i+1, tool: step.tool, passed: false, error: e.message });
      failed = true;
    }
  }

  // Include console logs and page errors in metadata
  const finalLogs = consoleLogs.slice(-30);
  const finalErrors = pageErrors;

  await browser.close();

  return {
    workflow: wf.name,
    totalSteps: wf.steps.length,
    passedSteps: stepResults.filter(s => s.passed).length,
    failed: failed,
    steps: stepResults,
    consoleLogCount: consoleLogs.length,
    consoleLogs: finalLogs,
    pageErrors: finalErrors
  };
}

// Run all workflows sequentially
for (const wfName of workflows) {
  try {
    const res = await runWorkflow(wfName);
    results.push(res);
    console.log(`\n   Result: ${res.passedSteps}/${res.totalSteps} steps passed${res.failed ? ' ❌' : ' ✅'}`);
  } catch(e) {
    console.log(`\n   FATAL: ${e.message}`);
    results.push({ workflow: wfName, fatal: true, error: e.message });
  }
}

// Summary
console.log('\n═══════════════════════════════════════');
console.log('  GALAXY RAIDERS DEEP TEST RESULTS');
console.log('═══════════════════════════════════════');
for (const r of results) {
  const status = r.fatal ? '💥 FATAL' : r.failed ? '❌ FAIL' : '✅ PASS';
  const steps = r.fatal ? '?' : `${r.passedSteps}/${r.totalSteps}`;
  console.log(`  ${status}  ${r.workflow}  (${steps} steps)`);
}

// Write report
const report = {
  timestamp: new Date().toISOString(),
  commit: 'b858e7b',
  suite: 'DevLab MCP Suite — browser-dev-mcp v1.0.0',
  game: 'Galaxy Raiders: ULTIMATE',
  url: PROFILE.defaultUrl,
  canvasSelector: PROFILE.canvasSelector,
  results: results
};

writeFileSync(join(EVIDENCE_DIR, 'results.json'), JSON.stringify(report, null, 2));
console.log(`\nReport saved: ${join(EVIDENCE_DIR, 'results.json')}`);

// Exit code
const anyFailed = results.some(r => r.fatal || r.failed);
process.exit(anyFailed ? 1 : 0);
