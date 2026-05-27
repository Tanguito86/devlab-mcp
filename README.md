# DevLab MCP Suite

Modular testing and automation MCP servers for Android devices, desktop browsers, canvas games, PWAs, and beyond.

```
DevLab MCP Suite
├── @tanguito/android-dev-mcp   ← Android device automation (ADB)
├── @tanguito/browser-dev-mcp   ← Desktop browser automation (Playwright)
└── @tanguito/devlab-shared     ← Shared contracts and helpers
```

## Status

| Package | Version | Tests | Status |
|---------|---------|-------|--------|
| android-dev-mcp | 1.2.0 | 42 | ✅ Published |
| browser-dev-mcp | 1.0.0 | 8 | ✅ Frozen (local) |
| devlab-shared | 0.1.0 | 0 | ✅ Foundation |

**Not yet published to npm as a suite.** Each package is independently installable and testable.

## Quick Start

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test           # 50 tests: 42 android + 8 browser

# Health check
pnpm --filter @tanguito/browser-dev-mcp run doctor

# Preview package contents
pnpm -r pack:dry-run
```

## Packages

### android-dev-mcp

Android device automation via ADB. 42 tools for device inspection, app management, UI interaction, screenshots, logcat, and workflow execution.

```bash
pnpm --filter @tanguito/android-dev-mcp build
pnpm --filter @tanguito/android-dev-mcp test
```

[Full README →](packages/android-dev-mcp/README.md)

### browser-dev-mcp

Desktop browser automation via Playwright. 22 tools for navigation, screenshots, canvas game testing, JavaScript evaluation, keyboard/mouse input, and evidence capture.

```bash
pnpm --filter @tanguito/browser-dev-mcp build
pnpm --filter @tanguito/browser-dev-mcp test
pnpm --filter @tanguito/browser-dev-mcp run doctor
```

[Full README →](packages/browser-dev-mcp/README.md)

### devlab-shared

Minimal shared contracts: textResponse, sanitizeName, validateSessionId, RegisterTool, WorkflowStep, StepResult, and base evidence types. Zero IO, zero runtime dependencies.

```bash
pnpm --filter @tanguito/devlab-shared build
```

## Repository Structure

```
devlab-mcp/
  pnpm-workspace.yaml
  tsconfig.base.json
  package.json              # Root scripts (build, test, doctor, changeset)
  .changeset/               # Changesets configuration
  .github/workflows/
    ci.yml                  # CI matrix (Node 20/22, build, test, dry-run)
  packages/
    shared/                 # @tanguito/devlab-shared
    android-dev-mcp/        # @tanguito/android-dev-mcp
    browser-dev-mcp/        # @tanguito/browser-dev-mcp
  docs/
    architecture.md         # Suite architecture decisions
    browser-mcp-freeze.md   # Browser MCP validation report
    publishing.md           # How to version and publish
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm clean` | Remove dist/ from all packages |
| `pnpm doctor` | Run health checks |
| `pnpm pack:dry-run` | Preview npm package contents |
| `pnpm changeset` | Create a version changeset |
| `pnpm changeset:version` | Bump versions from changesets |
| `pnpm changeset:publish` | Publish changed packages to npm |

## Architecture

- **Monorepo** with pnpm workspaces — shared iteration, single CI, strict dependency boundaries
- **Independent packages** — each installable, runnable, and testable in isolation
- **Shared is minimal** — 102 lines of pure contracts, no runtime coupling
- **Changesets** for independent versioning within the monorepo

[Full architecture document →](docs/architecture.md)

## Publishing

Not published yet. See [docs/publishing.md](docs/publishing.md) for the planned workflow.

## License

MIT — see individual package LICENSE files.
