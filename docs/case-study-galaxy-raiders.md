# Case Study: Galaxy Raiders

**Testing a 68-script HTML5 Canvas shmup with browser-dev-mcp**

---

## The Game

[Galaxy Raiders](https://github.com/Tanguito86/galaxy-raiders) is a hardcore vertical-scrolling shoot-'em-up built entirely with JavaScript Canvas2D. It features:

- **68 scripts** — entity management, collision, combat, boss AI, parallax backgrounds, audio engine, HUD
- **20 levels** — escalating difficulty with curated wave profiles
- **5 bosses** — Crabtron (LV5), Serpentrix (LV10), Orbital Colossus (LV15), Lieutenant (LV19), Emperor (LV20)
- **Hardcore mode** — reduced hitbox, rank system, combo scoring, bullet readability systems
- **Debug hooks** — `window.__GR_DEBUG_JUMP_TO_LEVEL(n)` for fast boss testing
- **No DOM text** — everything is rendered on `<canvas>`, making traditional DOM-based testing tools useless

## The Problem

Testing a canvas game manually is slow and error-prone:

- You need to play through levels to reach bosses (minutes per attempt)
- Visual regressions are invisible to unit tests (there's no DOM to assert against)
- Console errors and page errors need manual DevTools inspection
- Performance degradation (FPS drops, render corruption) is hard to catch
- Regression testing across 5 bosses × 20 levels is hours of manual work

Traditional Playwright scripts help, but they require writing and maintaining JavaScript test files, handling browser lifecycle, and interpreting raw output.

## The Solution: browser-dev-mcp

browser-dev-mcp provides 24 MCP tools specialized for canvas game testing:

| Tool | Use Case |
|------|----------|
| `browser_screenshot_canvas` | Capture just the `<canvas>` element — no browser chrome |
| `browser_evaluate_game_state` | Read `level`, `lives`, `score`, `enemies.length` directly |
| `browser_click_percent` | Click viewport-relative coordinates — essential for canvas games |
| `browser_press_key` | Send keyboard input (Enter to start, arrows to navigate) |
| `browser_wait_for_canvas_change` | Poll canvas until content changes — detect frame rendering |
| `browser_get_console_logs` | Collect all `console.log/warn/error` since page load |
| `browser_get_page_errors` | Collect uncaught JS errors |

But the killer feature is **workflows** — declarative JSON test plans:

```json
{
  "name": "galaxy-boss-ladder",
  "steps": [
    { "tool": "browser_open_url", "args": { "url": "http://localhost:5173" } },
    { "tool": "browser_press_key", "args": { "key": "Enter" } },
    { "tool": "browser_evaluate_js", "args": { "expression": "window.__GR_DEBUG_JUMP_TO_LEVEL(5)" } },
    { "tool": "browser_screenshot_canvas", "args": { "selector": "canvas", "name": "boss-lv5" } },
    { "tool": "browser_evaluate_game_state", "args": { "expression": "({ level, bossActive: boss.active })" } }
  ]
}
```

This is a 5-step workflow that reaches the first boss. No JavaScript coding needed — the MCP server executes it and produces structured evidence.

## What We Tested

### 4 Workflows, 81 Steps, 0 Failures

| Workflow | Steps | Result | Key Findings |
|----------|-------|--------|-------------|
| **smoke-full** | 13 | ✅ | Game loads, menu renders, Enter starts game, LV1 active (level=1, lives=1, enemies=10) |
| **boss-ladder** | 27 | ✅ | All 5 bosses reached with `__GR_DEBUG_JUMP_TO_LEVEL`: Crabtron, Serpentrix, Colossus, Lieutenant, Emperor. All `bossActive: true` |
| **performance-sample** | 19 | ✅ | Canvas 360×640, menu=382K chars, gameplay=552K, boss LV15=97K, boss LV20=191K |
| **console-audit** | 22 | ✅ | 0 console noise at menu, gameplay, and all 5 boss levels. Only expected GR DEBUG messages |

### 3 Consecutive Clean Cycles

```
Cycle 1: canvas=1, game=true, title="Galaxy Raiders: ULTIMATE", jumped=LV5, errors=0
Cycle 2: canvas=1, game=true, title="Galaxy Raiders: ULTIMATE", jumped=LV5, errors=0
Cycle 3: canvas=1, game=true, title="Galaxy Raiders: ULTIMATE", jumped=LV5, errors=0
```

No browser leaks. Each cycle opens a fresh browser, validates game state, jumps to LV5, and closes cleanly.

### Galaxy Raiders Validation

```
npm run validate  →  "Validación JS OK"
```

## Evidence Captured

### 13 Real Screenshots (1.9 MB total)

| Screenshot | Size | Content |
|-----------|------|---------|
| **Menu** | | |
| `smoke-menu.png` | 205 KB | Title screen with stars, nebula background |
| `perf-menu_canvas.png` | 185 KB | Canvas-only menu capture |
| **Gameplay LV1** | | |
| `smoke-gameplay-lv1_canvas.png` | 274 KB | Player ship, 10 enemies, bullets, HUD |
| `perf-gameplay-lv1_canvas.png` | 276 KB | Maximum render density (enemies + bullets + bg) |
| **Bosses** | | |
| `boss-lv5-crabtron_canvas.png` | 81 KB | Crabtron with attack patterns |
| `boss-lv10-serpentrix_canvas.png` | 64 KB | Serpentrix (legacy sprite) |
| `boss-lv15-orbital_canvas.png` | 56 KB | Orbital Colossus fortress |
| `boss-lv19-lieutenant_canvas.png` | 63 KB | Lieutenant (Imperial) |
| `boss-lv20-emperor_canvas.png` | 90 KB | Emperor — final boss |
| **Performance** | | |
| `perf-boss-lv15_canvas.png` | 57 KB | LV15 combat density sample |
| `perf-boss-lv20_canvas.png` | 87 KB | LV20 max density sample |
| **Full Page** | | |
| `smoke-fullscreen.png` | 298 KB | Full browser viewport with game |

### Console Audit

0 errors, 0 warnings across all game states. The only console output is the expected debug jump confirmation:
```
GR DEBUG: Jumped to level 5 — CRABTRON
GR DEBUG: Jumped to level 10 — SERPENTRIX
GR DEBUG: Jumped to level 15 — ORBITAL
GR DEBUG: Jumped to level 20 — EMPERADOR
```

## Why This Matters

### Before browser-dev-mcp

Testing Galaxy Raiders meant:
1. Open Chrome manually
2. Navigate to localhost
3. Press Enter to start
4. Play through 5 levels to reach Crabtron
5. Open DevTools, check console
6. Take manual screenshots
7. Die, restart, repeat for each boss
8. Hope you didn't miss a console error between runs

**Estimated time per full boss test cycle: 20-30 minutes**

### After browser-dev-mcp

1. Run one command: `node run-galaxy-smoke.js`
2. Wait 15 seconds
3. Read the report

**Time: 15 seconds. 0 errors. Reproducible. Evidence saved.**

### The Real Value

The MCP isn't just automation — it's **LLM-orchestrated automation**. An AI agent can:
- Write workflow JSONs for you ("test the menu, start the game, jump to the emperor, take a screenshot")
- Interpret results ("the canvas data URL at LV20 is 191K — that's 2x LV15, normal for the emperor's visual complexity")
- Generate reports with analysis, not just pass/fail
- Chain workflows across game versions for regression testing

This is what makes browser-dev-mcp different from writing Playwright scripts by hand.

## Full Report

See `evidence/galaxy-deep-test/report.md` for the complete validated test report with all 81 steps, timings, and analysis.

## Files

- `workflows/galaxy-raiders/galaxy-smoke-full.json` — 13-step smoke test
- `workflows/galaxy-raiders/galaxy-boss-ladder.json` — 27-step boss ladder
- `workflows/galaxy-raiders/galaxy-performance-sample.json` — 19-step performance sample
- `workflows/galaxy-raiders/galaxy-console-audit.json` — 22-step console audit
- `examples/galaxy-raiders/run-galaxy-smoke.js` — Quick-start smoke runner
- `packages/browser-dev-mcp/profiles/galaxy-raiders.json` — Game profile
