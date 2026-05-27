# DevLab MCP Suite

Modular testing and automation MCP servers for Android devices, desktop browsers, canvas games, and PWAs.

```
DevLab MCP Suite
├── @tanguito/android-dev-mcp   ← Android device automation (ADB)
├── @tanguito/browser-dev-mcp   ← Desktop browser automation (Playwright)
└── @tanguito/devlab-shared     ← Shared contracts and helpers
```

## 5-Minute Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Tanguito86/devlab-mcp.git
cd devlab-mcp
pnpm install

# 2. Environment check + auto-fix
pnpm setup

# 3. Build and test
pnpm build
pnpm test          # 59 tests: 42 android + 8 browser + 9 shared

# 4. Your first browser workflow
node examples/browser-hello-world/run-hello-world.js
```

**You just ran a 5-step browser workflow: open → screenshot → console → errors → report.** Takes ~5 seconds.

## Status

| Package | Version | Tests | npm |
|---------|---------|-------|-----|
| android-dev-mcp | 1.2.0 | 42 | ✅ `@tanguito/android-dev-mcp` |
| browser-dev-mcp | 1.0.0 | 8 | ✅ `@tanguito/browser-dev-mcp` |
| devlab-shared | 0.1.0 | 9 | ✅ `@tanguito/devlab-shared` |

## Case Study: Galaxy Raiders

We validated browser-dev-mcp against a real 68-script HTML5 Canvas shmup with 5 bosses across 20 levels.

| Metric | Result |
|--------|--------|
| Workflows executed | 4 (smoke, boss ladder, performance, console audit) |
| Total steps | **81/81 (100%)** |
| Page errors | **0** across all workflows |
| Bosses validated | 5/5 (Crabtron, Serpentrix, Colossus, Lieutenant, Emperor) |
| Screenshots | 13 real rendered canvas captures |
| Leak test | 3/3 consecutive cycles clean |

**[Read the full case study →](docs/case-study-galaxy-raiders.md)**

## Packages

### browser-dev-mcp

Desktop browser automation via Playwright. 24 tools for navigation, screenshots, canvas game testing, JavaScript evaluation, keyboard/mouse input, and evidence capture.

```bash
pnpm --filter @tanguito/browser-dev-mcp build
pnpm --filter @tanguito/browser-dev-mcp test
pnpm --filter @tanguito/browser-dev-mcp run doctor
```

Key tools: `browser_open_url`, `browser_screenshot`, `browser_screenshot_canvas`, `browser_click`, `browser_click_percent`, `browser_press_key`, `browser_type_text`, `browser_evaluate_js`, `browser_evaluate_game_state`, `browser_wait_for_canvas_change`, `browser_get_console_logs`, `browser_get_page_errors`, and 12 more.

[Full README →](packages/browser-dev-mcp/README.md)

### android-dev-mcp

Android device automation via ADB. 42 tools for device inspection, app management, UI interaction, screenshots, logcat, and workflow execution.

```bash
pnpm --filter @tanguito/android-dev-mcp build
pnpm --filter @tanguito/android-dev-mcp test
```

[Full README →](packages/android-dev-mcp/README.md)

### devlab-shared

Minimal shared contracts: textResponse, sanitizeName, validateSessionId, RegisterTool, WorkflowStep, StepResult, and base evidence types. Zero IO, zero runtime dependencies. 9 tests, full doctor check.

```bash
pnpm --filter @tanguito/devlab-shared build
pnpm --filter @tanguito/devlab-shared test
pnpm --filter @tanguito/devlab-shared run doctor
```

[Full README →](packages/shared/README.md)

## Examples

| Example | Time | What it does |
|---------|------|-------------|
| [browser-hello-world](examples/browser-hello-world/) | ~5s | Opens example.com, takes screenshot, collects console/errors |
| [galaxy-raiders](examples/galaxy-raiders/) | ~15s | Loads Galaxy Raiders, starts game, captures canvas, jumps to boss |

```bash
# Hello World
node examples/browser-hello-world/run-hello-world.js

# Galaxy Raiders (requires game running on localhost:5173)
node examples/galaxy-raiders/run-galaxy-smoke.js
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm setup` | Detect environment, auto-install Chromium, suggest fixes |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all 59 tests |
| `pnpm doctor` | Health checks for all packages |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm clean` | Remove dist/ from all packages |
| `pnpm pack:dry-run` | Preview npm package contents |
| `pnpm changeset` | Create a version changeset |
| `pnpm changeset:version` | Bump versions from changesets |
| `pnpm changeset:publish` | Publish changed packages to npm |

## Troubleshooting

### "Browser not open" on WSL

WSL's headless Chromium shell is missing shared libraries. browser-dev-mcp automatically uses the full Chromium binary if `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` is set.

```bash
# Find your Chromium binary
ls ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome

# Set the env var
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome
```

Run `pnpm setup` — it detects WSL and suggests the fix automatically.

### Playwright not found

```bash
pnpm setup       # Auto-detects and suggests fixes
npx playwright install chromium   # Manual install
```

### ADB not found (android-dev-mcp only)

ADB is optional — only needed for `@tanguito/android-dev-mcp`.

```bash
# Install Android SDK Platform Tools
# https://developer.android.com/tools/releases/platform-tools
```

## Repository Structure

```
devlab-mcp/
  pnpm-workspace.yaml
  package.json              # Root scripts + pnpm setup
  .changeset/               # Changesets configuration
  .github/workflows/ci.yml  # CI matrix (Node 20/22)
  scripts/
    devlab-setup.js         # Environment detector + auto-fixer
  packages/
    shared/                 # @tanguito/devlab-shared
    android-dev-mcp/        # @tanguito/android-dev-mcp
    browser-dev-mcp/        # @tanguito/browser-dev-mcp
  examples/
    browser-hello-world/    # 5-step first workflow
    galaxy-raiders/         # Real canvas game smoke test
  docs/
    architecture.md         # Suite architecture decisions
    case-study-galaxy-raiders.md  # Full Galaxy Raiders validation
    publishing.md           # How to version and publish
```

## Architecture

- **Monorepo** with pnpm workspaces — shared iteration, single CI
- **Independent packages** — each installable, runnable, testable in isolation
- **Shared is minimal** — 107 lines of pure contracts, zero runtime coupling
- **Changesets** for independent versioning within the monorepo
- **Workflow-first** — declarative JSON test plans executed by MCP servers

[Full architecture →](docs/architecture.md)

## License

MIT — see individual package LICENSE files.
