# browser-dev-mcp — Foundation Freeze

**Date:** 2026-05-27
**Version:** 1.0.0
**Phase:** BROWSER-MCP-02 validation complete

## Environment

| Item | Detail |
|------|--------|
| OS | Windows 11 + WSL (Ubuntu) |
| Node | v22.22.3 |
| TypeScript | 6.0.3 |
| Playwright | 1.60.0 |
| Chromium | 1223 (full binary, NOT headless shell) |
| MCP SDK | @modelcontextprotocol/sdk ^1.29.0 |
| Package | @tanguito/browser-dev-mcp |
| Location | C:\Users\Deposito\Documents\browser-dev-mcp |

## WSL / Chromium Workaround

The Playwright headless shell (`chromium_headless_shell-1223`) fails in WSL due to missing shared libraries (`libnspr4.so`, `libnss3.so`, `libasound.so.2`). The full Chromium binary at `chromium-1223/chrome-linux64/chrome` has zero missing dependencies.

**Workaround:** Set the env var before launching the MCP server or any Playwright session:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/home/$USER/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
```

This is read by `BrowserSession.open()` and passed as `executablePath` to `chromium.launch()`.

**Not needed on** native Linux, macOS, or Windows — only WSL.

## Validation Summary

### Unit Tests — 8/8 PASS
```
sanitizeName normalizes input        ✅
validateSessionId rejects traversal   ✅
validateSessionId accepts valid IDs   ✅
profile JSON schema: required fields  ✅
workflow JSON schema: required fields ✅
workflow steps: known tool names      ✅
BrowserSession export shape           ✅
textResponse produces valid shape     ✅
```

### Doctor — Ready 🚀
```
✅ Node v22.22.3
✅ npm available
✅ Playwright 1.60.0
✅ Chromium (Playwright) available
✅ dist/ build found
✅ 1 profiles: galaxy-raiders.json
✅ 3 workflow files
```

### Playwright Runtime Smoke — PASS
- Browser opens (headless, full Chromium) ✅
- Navigation (about:blank) ✅
- Canvas injection + rendering ✅
- Full page screenshot ✅
- Canvas element screenshot ✅
- FPS capture (window.__fps) ✅
- Console logs collection ✅
- Page errors collection ✅
- Click at percent coordinates ✅
- Keyboard press (Enter) ✅
- Browser closes cleanly ✅

### Galaxy Raiders Integration — 3/3 workflows PASS

**Galaxy Raiders detected state:**
- Title: "Galaxy Raiders: ULTIMATE"
- Canvas elements: 1
- `window.game` exists (hasGame: true)
- `window.__GR_DEBUG_JUMP_TO_LEVEL` available (function)
- `window.currentLevel` undefined
- 0 page errors on clean load
- Minimal console output

**WF1: smoke-menu** — 5/5 steps PASS (2.6s)
```
browser_open_url     → http://localhost:5173
browser_wait         → 2000ms
browser_screenshot   → menu-smoke.png (204KB)
browser_get_console_logs → 0 entries
browser_get_page_errors  → 0 errors
```

**WF2: start-game** — 8/8 steps PASS (6.1s)
```
browser_open_url         → http://localhost:5173
browser_wait             → 2000ms
browser_screenshot       → pre-start-menu.png (204KB)
browser_press_key(Enter) → game starts
browser_wait             → 3000ms
browser_screenshot_canvas → gameplay-start.png (279KB)
browser_get_console_logs → 0 entries
browser_get_page_errors  → 0 errors
```

**WF3: boss-jump** — 8/8 steps PASS (5.8s)
```
browser_open_url          → http://localhost:5173
browser_wait              → 2000ms
browser_evaluate_js       → DEBUG_JUMP_TO_LEVEL(5) → "jumped to LV5"
browser_wait              → 3000ms
browser_screenshot_canvas → boss-lv5-attempt.png (185KB)
browser_evaluate_game_state → gameState_keys: [], hasGame: true
browser_get_console_logs  → 1 entry
browser_get_page_errors   → 0 errors
```

### Consecutive Cycle Test — 3/3 PASS
Three rapid open → navigate → screenshot → close cycles. No browser leaks, no memory accumulation, all clean closes.

### Evidence Generated — 4 sessions

| Session | Steps | Status | Screenshots |
|---------|-------|--------|-------------|
| galaxy-raiders-smoke-menu | 5 | ✅ PASS | 1 (menu) |
| galaxy-raiders-start-game | 8 | ✅ PASS | 2 (menu + gameplay canvas) |
| galaxy-raiders-boss-jump (v1) | 5 | ⚠️ incomplete | 1 (boss) |
| galaxy-raiders-boss-jump (v2) | 8 | ✅ PASS | 1 (boss canvas) |

Each session contains: `metadata.json`, `evidence.jsonl`, `screenshots/`, `final-report.md`.

**Total evidence:** 11 screenshots, 3 workflow execution logs.

## Issues Found & Fixed

| # | Issue | Root Cause | Fix |
|---|-------|------------|-----|
| 1 | Headless shell crashes in WSL | Missing `libnspr4.so`, `libnss3.so`, `libasound.so.2` | Use full Chromium binary via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` env var |
| 2 | `browser_evaluate_game_state` not in workflow executors | Tool was registered in MCP tools but not in WorkflowRunner executors map | Added `browser_evaluate_game_state: execEvaluateJs` to executors |
| 3 | boss-jump workflow assumed debug hooks always exist | Galaxy Raiders has the hook but other projects may not | Made workflow resilient with IIFE conditional |
| 4 | WSL DNS issue for external URLs | `net::ERR_NAME_NOT_RESOLVED` for internet URLs | Local URLs (localhost) work fine — noted as environment limitation |

## Known Limitations

1. **No canvas content introspection.** Canvas games render to a bitmap. We validate via screenshots, not DOM inspection of canvas internals.
2. **Debug hooks are project-specific.** `__GR_DEBUG_JUMP_TO_LEVEL` exists in Galaxy Raiders but is not a standard API. Each project needs its own hooks.
3. **WSL needs full Chromium binary.** See workaround above. Not an issue on native OS installs.
4. **External URLs may not resolve in WSL.** Localhost testing works fine. Internet access depends on WSL networking config.
5. **Headless mode for canvas games.** Canvas rendering works in headless mode, but some WebGL features may differ. Headed mode (`headless: false`) recommended for visual validation on a real display.

## Tool Inventory (26 registrations, 22 MCP tools)

**Lifecycle:** browser_open, browser_close
**Navigation:** browser_open_url
**Screenshots:** browser_screenshot, browser_screenshot_canvas
**Interaction:** browser_click, browser_click_text, browser_click_percent, browser_press_key, browser_type_text
**JavaScript:** browser_evaluate_js, browser_evaluate_game_state
**Diagnostics:** browser_get_console_logs, browser_get_page_errors
**Wait:** browser_wait, browser_wait_for_selector
**Canvas:** browser_wait_for_canvas_change, browser_capture_fps, browser_record_trace
**Sessions:** browser_start_session, browser_stop_session, browser_list_sessions, browser_get_session_report
**Profiles:** browser_list_profiles, browser_list_workflows, browser_run_workflow

## Project Structure

```
browser-dev-mcp/
  src/
    index.ts                      — MCP server entry (22 tools)
    types.ts                      — Shared types
    browser/
      BrowserSession.ts           — Playwright browser/page lifecycle
      tools.ts                    — Tool registrations (26)
    workflows/
      WorkflowRunner.ts           — Workflow engine (14 executors)
    evidence/
      EvidenceStore.ts            — Sessions, evidence JSONL, MD reports
    profiles/
      ProfileLoader.ts            — Profile & workflow JSON loading
  profiles/
    galaxy-raiders.json           — Galaxy Raiders profile
  workflows/galaxy-raiders/
    smoke-menu.json               — Menu smoke test
    start-game.json               — Game start + screenshot
    boss-jump.json                — Debug hook jump + boss screenshot
  tests/
    browser.test.js               — 8 unit tests
  docs/
    browser-mcp-freeze.md         — This document
  scripts/
    doctor.js                     — Environment health check
```

## Freeze Criteria Met

- [x] TypeScript compiles cleanly (`tsc`)
- [x] All unit tests pass (8/8)
- [x] Doctor reports Ready
- [x] Playwright runtime validated with real Chromium
- [x] Galaxy Raiders controlled via MCP tools
- [x] 3 workflows execute end-to-end
- [x] Evidence generated with proper structure
- [x] No browser leaks in consecutive runs
- [x] Known limitations documented
- [x] WSL workaround documented

## Sign-off

**browser-dev-mcp v1.0.0 foundation is frozen.** No further changes to this baseline without a new phase. Ready for DevLab MCP Suite packaging.
