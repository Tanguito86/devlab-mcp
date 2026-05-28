# Browser Hello World

The simplest possible browser-dev-mcp workflow. **Runs in <30 seconds.**

## What it does

1. Opens `https://example.com`
2. Takes a screenshot
3. Collects console logs
4. Collects page errors
5. Saves all evidence to a timestamped directory

## Prerequisites

Run from the monorepo root first:

```bash
pnpm install
pnpm build
pnpm setup
```

## Run

```bash
cd examples/browser-hello-world
node run-hello-world.js
```

## Expected Output

```
━━━ browser-hello-world ━━━
   ✓ Step 1: navigated to https://example.com
   ✓ Step 2: waited 1500ms
   ✓ Step 3: screenshot saved → evidence/.../example.png
   ✓ Step 4: 0 console logs
   ✓ Step 5: 0 page errors

   Result: 5/5 steps passed ✅

Evidence saved: evidence/yyyy-mm-ddThh_mm_ssZ-hello-world/
  ├── example.png          ← Screenshot of example.com
  ├── console.json         ← Console log entries
  ├── errors.json          ← Page errors
  └── report.json          ← Workflow execution report
```

## What Next?

Try the Galaxy Raiders example:

```bash
cd ../galaxy-raiders
node run-galaxy-smoke.js
```
