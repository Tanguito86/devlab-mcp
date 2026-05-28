# DevLab MCP Suite

Modular testing and automation MCP servers for Android devices, desktop browsers, canvas games, and visual regression.

```
DevLab MCP Suite
├── @tanguito/android-dev-mcp        ← Android device automation (ADB)
├── @tanguito/browser-dev-mcp        ← Desktop browser automation (Playwright)
├── @tanguito/visual-regression-mcp  ← Visual regression & pixel diff
└── @tanguito/devlab-shared          ← Shared contracts and helpers
```

## The Testing Triangle

```
             ┌──────────────────────┐
             │   visual-regression   │  ← pixel-perfect diffs
             │   screenshot compare  │
             └──────────┬───────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
  ┌──────┴──────┐              ┌───────┴──────┐
  │  android     │              │   browser     │
  │  device tests│              │   canvas/web  │
  └──────────────┘              └──────────────┘

browser-dev-mcp screenshot  →  visual-regression-mcp diff  →  markdown report
```

Three independent testing layers, same tool patterns, same evidence system, single monorepo.

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
pnpm test          # 67 tests: 42 android + 8 browser + 8 visual + 9 shared

# 4. Your first browser workflow
node examples/browser-hello-world/run-hello-world.js
```

**You just ran a 5-step browser workflow: open → screenshot → console → errors → report.** Takes ~5 seconds.

## Package Table

| Package | Purpose | Version | Tests | npm | Status |
|---------|---------|---------|-------|-----|--------|
| `@tanguito/devlab-shared` | Types, schemas, helpers | 0.1.0 | 9 | `@tanguito/devlab-shared` | Pending publish |
| `@tanguito/android-dev-mcp` | Device automation (ADB) | 1.2.0 | 42 | `@tanguito/android-dev-mcp` | ✅ Published |
| `@tanguito/browser-dev-mcp` | Browser/canvas (Playwright) | 1.0.0 | 8 | `@tanguito/browser-dev-mcp` | Pending publish |
| `@tanguito/visual-regression-mcp` | Screenshot diffing | 0.1.0 | 8 | `@tanguito/visual-regression-mcp` | Pending publish |

**Total: 67 tests | 70 tools | 4 packages**

> **Publishing:** `android-dev-mcp` is already on npm. `shared`, `browser`, and `visual-regression` are ready. See [publishing guide](docs/publishing.md) for exact commands.

## Case Study: Galaxy Raiders

We validated browser-dev-mcp and visual-regression-mcp against a real 68-script HTML5 Canvas shmup with 5 bosses across 20 levels.

### Browser Testing

| Metric | Result |
|--------|--------|
| Workflows executed | 4 (smoke, boss ladder, performance, console audit) |
| Total steps | **81/81 (100%)** |
| Page errors | **0** across all workflows |
| Bosses validated | 5/5 (Crabtron, Serpentrix, Colossus, Lieutenant, Emperor) |
| Screenshots | 13 real rendered canvas captures |
| Leak test | 3/3 consecutive cycles clean |

### Visual Regression

```
boss-lv5:   81 kB, 360×640, 0 changed pixels, ✅ PASS
boss-lv20:  90 kB, 360×640, 0 changed pixels, ✅ PASS
```

**Pipeline:** browser-dev-mcp captures canvas screenshots → visual-regression-mcp diffs against baselines → markdown report with pass/fail.

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

### visual-regression-mcp

Visual regression testing — pixel comparison, diff generation, markdown reporting. 4 tools: `visual_compare_images`, `visual_create_baseline`, `visual_compare_folder`, `visual_generate_report`. Zero native dependencies — pure Node.js PNG parsing with zlib.

```bash
pnpm --filter @tanguito/visual-regression-mcp build
pnpm --filter @tanguito/visual-regression-mcp test
pnpm --filter @tanguito/visual-regression-mcp run doctor
```

[Full README →](packages/visual-regression-mcp/README.md)

### android-dev-mcp

Android device automation via ADB. 42 tools for device inspection, app management, UI interaction, screenshots, logcat, and workflow execution.

```bash
pnpm --filter @tanguito/android-dev-mcp build
pnpm --filter @tanguito/android-dev-mcp test
```

[Full README →](packages/android-dev-mcp/README.md)

### devlab-shared

Minimal shared contracts: textResponse, sanitizeName, validateSessionId, RegisterTool, WorkflowStep, StepResult, and base evidence types. Zero IO, zero runtime dependencies. 9 tests, full doctor check. **107 lines**.

```bash
pnpm --filter @tanguito/devlab-shared build
pnpm --filter @tanguito/devlab-shared test
pnpm --filter @tanguito/devlab-shared run doctor
```

[Full README →](packages/shared/README.md)

## Examples

| Example | Time | What it does |
|---------|------|-------------|
| [browser-hello-world](examples/browser-hello-world/) | ~5s | Opens test page, takes screenshot, collects console/errors |
| [galaxy-raiders](examples/galaxy-raiders/) | ~15s | Loads Galaxy Raiders, starts game, captures canvas, jumps to boss |
| [galaxy-visual-regression](examples/galaxy-visual-regression/) | ~2s | Pixel-diff Galaxy Raiders boss screenshots against baselines |

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
| `pnpm test` | Run all 67 tests |
| `pnpm doctor` | Health checks per package (use `pnpm --filter <pkg> run doctor`) |
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
    shared/                    # @tanguito/devlab-shared (107 lines)
    android-dev-mcp/           # @tanguito/android-dev-mcp (42 tools)
    browser-dev-mcp/           # @tanguito/browser-dev-mcp (24 tools)
    visual-regression-mcp/     # @tanguito/visual-regression-mcp (4 tools)
  examples/
    browser-hello-world/       # 5-step first workflow
    galaxy-raiders/            # Real canvas game smoke test
    galaxy-visual-regression/  # Pixel-diff boss screenshots
  docs/
    devlab-suite-v1-freeze.md      # v1 freeze document
    architecture.md                # Suite architecture decisions
    case-study-galaxy-raiders.md   # Full Galaxy Raiders validation
    publishing.md                  # How to version and publish
```

## Architecture

- **Monorepo** with pnpm workspaces — shared iteration, single CI
- **Independent packages** — each installable, runnable, testable in isolation
- **Shared is minimal** — 107 lines of pure contracts, zero runtime coupling
- **Changesets** for independent versioning within the monorepo
- **Workflow-first** — declarative JSON test plans executed by MCP servers

[Full architecture →](docs/architecture.md)
[Freeze document →](docs/devlab-suite-v1-freeze.md)

## License

MIT — see individual package LICENSE files.
