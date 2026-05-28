# browser-dev-mcp

**Desktop browser automation & testing MCP server — powered by Playwright.**

Part of the **DevLab MCP Suite** alongside [android-dev-mcp](https://github.com/Tanguito86/android-dev-mcp). Designed for testing web apps, PWAs, and **canvas/web-game projects** (like Galaxy Raiders) with structured evidence capture and reproducible workflows.

## What it does

- **Opens a real Chromium browser** (headless or headed) via Playwright
- **Navigates** to any URL
- **Takes screenshots** — full viewport, or specific elements (canvas, div, etc.)
- **Simulates user input** — mouse clicks (absolute or %-based), keyboard, text typing
- **Evaluates JavaScript** in page context — inspect game state, call debug hooks
- **Captures diagnostics** — console logs, uncaught JS errors, FPS counters
- **Runs predefined workflows** — JSON-defined test sequences with evidence collection
- **Generates structured evidence** — sessions with metadata, JSONL evidence, markdown reports

### How it differs from android-dev-mcp

| | android-dev-mcp | browser-dev-mcp |
|---|---|---|
| **Target** | Android devices (ADB) | Desktop browsers (Playwright) |
| **Canvas games** | Via ADB screenshot + tap | Via Playwright screenshot + mouse/keyboard |
| **UI inspection** | XML UI dump | DOM / evaluate_js |
| **App management** | Install APK, launch, force-stop | N/A — browser navigation |
| **Evidence** | Sessions + logcat + reports | Sessions + screenshots + console + reports |
| **Workflows** | JSON workflows with session capture | JSON workflows with evidence capture |

## Quick Start

```bash
npm install
npm run build
npx playwright install chromium
npm run doctor
```

### Run as MCP server

```bash
node dist/index.js
```

Configure in your MCP client (Claude Desktop, Hermes Agent, etc.):

```json
{
  "browser-dev-mcp": {
    "command": "node",
    "args": ["/absolute/path/to/browser-dev-mcp/dist/index.js"]
  }
}
```

### WSL Setup (important!)

WSL users need to set the Chromium executable path. The headless shell is missing shared libraries; use the full browser binary:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/home/$USER/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
```

Add this to your `~/.bashrc` for persistence. Not needed on native Linux, macOS, or Windows.

## Testing Canvas / Web Games

**browser-dev-mcp controls canvas games through the browser, not by inspecting canvas internals.**

Canvas elements render to a bitmap — there's no DOM tree to query inside the canvas. The testing strategy:

1. **Screenshots** — Primary evidence. `browser_screenshot_canvas` captures just the canvas element at any moment.
2. **Keyboard/Mouse input** — `browser_press_key`, `browser_click_percent` (ideal for games where coordinates matter).
3. **evaluate_js** — Read game state from JavaScript globals (`window.game`, `window.score`, etc.).
4. **Debug hooks** — Games can expose functions like `window.__GR_DEBUG_JUMP_TO_LEVEL(N)` for test automation. `evaluate_js` or `evaluate_game_state` calls them.
5. **FPS capture** — `browser_capture_fps` reads common FPS counter patterns (`#fps-counter`, `window.__fps`).
6. **Canvas change detection** — `browser_wait_for_canvas_change` polls until the canvas bitmap changes.

**What it does NOT do:**
- No pixel-perfect canvas content assertion
- No canvas API interception
- No WebGL state introspection
- No game logic modification

For reliable game testing, expose debug hooks in your game code (level skip, god mode, state dump) and call them via `evaluate_js`.

## Available Tools

### Browser Lifecycle
| Tool | Description |
|------|-------------|
| `browser_open` | Launch Chromium (headless or headed). Accepts optional `profile` to load config. |
| `browser_close` | Close browser and cleanup all resources. |

### Navigation
| Tool | Description |
|------|-------------|
| `browser_open_url` | Navigate to a URL. Waits for DOM content loaded. |

### Screenshots
| Tool | Description |
|------|-------------|
| `browser_screenshot` | Full viewport screenshot, saved to evidence directory. |
| `browser_screenshot_canvas` | Screenshot of a canvas element by CSS selector. Default: `"canvas"`. |

### Interaction
| Tool | Description |
|------|-------------|
| `browser_click` | Click at absolute pixel coordinates (x, y). |
| `browser_click_text` | Click the first element containing given text. |
| `browser_click_percent` | Click at viewport-relative % coordinates. **Ideal for canvas games.** |
| `browser_press_key` | Send a keyboard key press (Enter, Space, ArrowUp, KeyA, etc.). |
| `browser_type_text` | Type text into the currently focused element. |

### JavaScript & Game State
| Tool | Description |
|------|-------------|
| `browser_evaluate_js` | Execute arbitrary JavaScript in page context. Returns the result. |
| `browser_evaluate_game_state` | Evaluate a JS expression returning game state (score, level, lives). |

### Console & Errors
| Tool | Description |
|------|-------------|
| `browser_get_console_logs` | Collect all `console.log/warn/error` messages since page load. |
| `browser_get_page_errors` | Collect uncaught JavaScript errors. |

### Wait / Timing
| Tool | Description |
|------|-------------|
| `browser_wait` | Wait N milliseconds (max 60s). |
| `browser_wait_for_selector` | Wait until a CSS selector appears in the DOM. |

### Canvas-Specific
| Tool | Description |
|------|-------------|
| `browser_wait_for_canvas_change` | Poll canvas until its content changes (toDataURL comparison). Useful for frame updates. |
| `browser_capture_fps` | Try to read FPS from the page (looks for `#fps-counter`, `.fps`, `window.__fps`, `window.fpsCounter`). |
| `browser_record_trace` | Capture screenshots at 100ms intervals for N seconds. Saves first frame + frame-count metadata. |

### Sessions & Evidence
| Tool | Description |
|------|-------------|
| `browser_start_session` | Begin an evidence-gathering session with structured output. |
| `browser_stop_session` | Finalize the session and generate `final-report.md`. |
| `browser_list_sessions` | List recent sessions with metadata. |
| `browser_get_session_report` | Read a completed session's markdown report. |

### Profiles & Workflows
| Tool | Description |
|------|-------------|
| `browser_list_profiles` | List available project profiles (JSON configs). |
| `browser_list_workflows` | List workflows defined for a profile. |
| `browser_run_workflow` | Execute a predefined workflow against a profile. |

## Galaxy Raiders Example

### Profile (`profiles/galaxy-raiders.json`)
```json
{
  "name": "galaxy-raiders",
  "type": "web-canvas-game",
  "defaultUrl": "http://localhost:5173",
  "canvasSelector": "canvas",
  "debugHooks": {
    "jumpToLevel": "window.__GR_DEBUG_JUMP_TO_LEVEL"
  }
}
```

### Starting a test session
```
browser_open { profile: "galaxy-raiders", headless: true }
browser_open_url { url: "http://localhost:5173" }
browser_screenshot { name: "menu" }
browser_press_key { key: "Enter" }
browser_wait { ms: 2000 }
browser_screenshot_canvas { name: "gameplay", selector: "canvas" }
browser_evaluate_game_state { expression: "window.game.state" }
browser_get_console_logs {}
browser_close {}
```

### Running a workflow
```
browser_open { profile: "galaxy-raiders" }
browser_run_workflow { profile: "galaxy-raiders", workflow: "smoke-menu" }
browser_run_workflow { profile: "galaxy-raiders", workflow: "start-game" }
browser_run_workflow { profile: "galaxy-raiders", workflow: "boss-jump" }
browser_close {}
```

## Evidence & Reports

All evidence is saved under the project directory:

```
sessions/
  2026-05-27T10_55_50_galaxy-raiders-start-game/
    metadata.json        — Session metadata (name, timestamps, profile, status)
    evidence.jsonl       — One JSON object per step (tool, output, ok, screenshot)
    screenshots/         — Captured screenshots
    final-report.md      — Generated markdown with step table and summary

evidence/
  <workflow-evidence>/   — Screenshots from workflow runs

workflow-reports/
  <timestamp>-<profile>-<workflow>/
    workflow.json         — The workflow definition used
    execution-log.json    — Full execution result with step results
```

## Development

```bash
npm run dev          # Run with tsx (hot-reload)
npm run build        # Compile TypeScript → dist/
npm test             # Run unit tests (8 tests)
npm run typecheck    # TypeScript type checking
npm run doctor       # Environment health check
npm run clean        # Remove dist/
npm pack --dry-run   # Preview package contents
```

## Project Structure

```
browser-dev-mcp/
  src/
    index.ts                      — MCP server entry, tool registration
    types.ts                      — Shared types
    browser/
      BrowserSession.ts           — Playwright browser/page lifecycle
      tools.ts                    — All 26 tool registrations
    workflows/
      WorkflowRunner.ts           — Workflow execution engine
    evidence/
      EvidenceStore.ts            — Sessions, evidence persistence, MD reports
    profiles/
      ProfileLoader.ts            — Profile & workflow loading
  profiles/                       — Project profiles (JSON)
  workflows/                      — Workflow definitions (JSON)
  tests/                          — Unit tests (node:test)
  docs/                           — Documentation
  scripts/                        — doctor.js, utilities
```

## DevLab MCP Suite

browser-dev-mcp is part of the planned DevLab MCP Suite:

```
DevLab MCP Suite
├─ android-dev-mcp    → Android device automation (ADB)
├─ browser-dev-mcp    → Desktop browser automation (Playwright)
└─ (shared patterns)  → Evidence sessions, workflow runner, profiles
```

## Known Limitations

- **Canvas content is opaque.** Validate via screenshots, not pixel-level assertions.
- **Debug hooks are project-specific.** Each game needs its own hooks exposed via `window.*`.
- **WSL requires full Chromium binary.** Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (see WSL Setup above).
- **WebGL may differ headless vs headed.** Use `headless: false` for visual validation.
- **External URLs may not resolve in WSL.** Localhost testing works reliably.

## License

MIT — see [LICENSE](LICENSE)

## Status

**v1.0.0 — Foundation frozen.** Validated against Galaxy Raiders with 3 workflows, 8 unit tests, and 3 consecutive browser cycles. See [docs/browser-mcp-freeze.md](docs/browser-mcp-freeze.md) for the full validation report.
