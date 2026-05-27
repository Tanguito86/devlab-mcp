# DevLab MCP Suite — Architecture & Roadmap

**Version:** 1.0-draft
**Date:** 2026-05-27
**Phase:** DEVLAB-MCP-01 — Planning
**Status:** Proposal

---

## 1. Overview

DevLab MCP Suite is a modular platform for testing and automation across platforms. Each package is an independent MCP server targeting a specific runtime: Android devices, desktop browsers, and future targets (iOS, Electron, visual regression, performance profiling).

### Core principles

1. **Each MCP is independent.** Installable, runnable, and testable in isolation.
2. **Shared is minimal.** Only truly generic primitives cross package boundaries.
3. **No runtime coupling.** ADB and Playwright never coexist in the same process.
4. **Consistent patterns, not shared runtimes.** Tool registration, evidence, workflows, and profiles follow the same conventions without sharing code that would create lockstep versioning.

---

## 2. Package Inventory

### Existing

| Package | Version | Tests | Runtime | Status |
|---------|---------|-------|---------|--------|
| `@tanguito/android-dev-mcp` | 1.2.0 | 42 | ADB → Android | Published |
| `@tanguito/browser-dev-mcp` | 1.0.0 | 8 | Playwright → Chromium | Frozen (repo) |

### Proposed

| Package | Scope | Priority |
|---------|-------|----------|
| `@devlab/shared` | Common types, evidence schema, session primitives, workflow contracts | Foundation |
| `@devlab/electron-dev-mcp` | Electron/Chromium desktop app testing | Future |
| `@devlab/ios-dev-mcp` | iOS device automation (libimobiledevice/WebKit) | Future |
| `@devlab/visual-regression-mcp` | Screenshot diffing, pixel-perfect regression | Future |
| `@devlab/perf-profiler-mcp` | Lighthouse, Web Vitals, frame timing, memory profiling | Future |

---

## 3. Repository Structure Decision

### Option A: Monorepo (pnpm workspace)

```
devlab-mcp/
  pnpm-workspace.yaml
  package.json              # root (scripts, devDeps shared)
  tsconfig.base.json        # shared TS config
  .github/
    workflows/
      ci.yml               # matrix: [android, browser]
  packages/
    shared/                 # @devlab/shared
    android-dev-mcp/        # @devlab/android-dev-mcp (or keep @tanguito/)
    browser-dev-mcp/        # @devlab/browser-dev-mcp
  docs/
  examples/
```

### Option B: Multi-repo

```
github.com/Tanguito86/
  android-dev-mcp/          # standalone repo
  browser-dev-mcp/          # standalone repo
  devlab-shared/            # standalone repo (depended on by both)
  devlab-suite/             # meta-repo (docs, examples, CI orchestration)
```

### Recommendation: **Monorepo (Option A)**

| Factor | Monorepo | Multi-repo |
|--------|----------|------------|
| **Shared code iteration** | ✅ One PR can update shared + consumer | ❌ 3 PRs, version bumps, publish cycles |
| **Versioning** | ⚠️ Coupled releases or independent with changesets | ✅ Naturally independent |
| **CI/CD** | ✅ Single matrix workflow | ⚠️ Duplicated workflows per repo |
| **Issue tracking** | ✅ One issue tracker | ❌ Fragmented across repos |
| **New contributor onboarding** | ✅ One clone, one `pnpm install` | ❌ Multiple clones, discoverability |
| **Package isolation** | ✅ pnpm enforces strict boundaries | ✅ Natural isolation |
| **npm publishing** | ⚠️ Needs automation (changesets) | ✅ Manual per repo |
| **Dependency hoisting** | ✅ Shared devDeps (tsx, typescript, vitest) | ❌ Duplicated installs |

**Verdict:** Monorepo with pnpm workspaces + Changesets for independent versioning. The packages remain independently publishable while sharing a single repo, CI pipeline, and development experience.

### Package manager: **pnpm**

- Strict dependency resolution (packages can't import undeclared deps)
- Workspace protocol (`"@devlab/shared": "workspace:*"`)
- Fast installs with content-addressable store
- Changesets integration for independent versioning

---

## 4. `@devlab/shared` — Boundaries

### What goes IN

These are the primitives that are truly generic — no ADB, no Playwright, no device-specific logic:

```typescript
// ── MCP tool registration ──
export type RegisterTool = (server: McpServer) => void;
export function textResponse(text: string): MCPContent;

// ── Session primitives ──
export function sanitizeName(name: string): string;
export function validateSessionId(sessionId: string): void;
export function timestampForPath(): string;

// ── Evidence schemas (Zod) ──
export const EvidenceEntrySchema = z.object({ ... });
export const SessionMetadataSchema = z.object({ ... });
export const StepResultSchema = z.object({ ... });

// ── Evidence base classes ──
export abstract class EvidenceStore {
  abstract createSession(name: string, context?: unknown): Promise<SessionMetadata>;
  abstract appendEvidence(sessionId: string, entry: EvidenceEntry): Promise<void>;
  abstract stopSession(sessionId: string): Promise<SessionMetadata>;
  listSessions(limit: number): Promise<SessionMetadata[]>;
  getSessionReport(sessionId: string): Promise<string>;
}

// ── Workflow contracts ──
export type WorkflowStep = {
  tool: string;
  args?: Record<string, unknown>;
  description?: string;
};

export type Workflow = {
  name: string;
  description: string;
  steps: WorkflowStep[];
};

export type WorkflowExecution = {
  profile: string;
  workflow: string;
  reportDir: string;
  sessionId?: string;
  ok: boolean;
  start: string;
  end: string;
  durationMs: number;
  steps: StepResult[];
};

// ── Profile base ──
export type BaseProfile = {
  name: string;
  type: string;
  defaultUrl?: string;
};
```

### What stays OUT (runtime-specific)

| Domain | Stays in... |
|--------|-------------|
| ADB commands, device resolution, logcat | android-dev-mcp |
| Playwright browser/page lifecycle | browser-dev-mcp |
| UI dump parsing (XML) | android-dev-mcp |
| Canvas screenshot, element selection | browser-dev-mcp |
| App profiles (package names, activities) | android-dev-mcp |
| Browser profiles (canvasSelector, debugHooks) | browser-dev-mcp |
| ADB error formatting | android-dev-mcp |
| Playwright error formatting | browser-dev-mcp |

### Shared size estimate

The current duplicated code (sanitizeName, validateSessionId, textResponse, timestampForPath, RegisterTool, session listing logic) amounts to approximately **150-200 lines** across both projects. The shared package would be **~300-400 lines** including Zod schemas and base classes.

This is intentionally minimal — the goal is consistent contracts, not coupled implementations.

---

## 5. Naming Audit

### Package names

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `@tanguito/android-dev-mcp` | `@devlab/android-dev-mcp` | Suite scope, shorter |
| `@tanguito/browser-dev-mcp` | `@devlab/browser-dev-mcp` | Suite scope, shorter |
| — | `@devlab/shared` | Internal dependency |
| — | `@devlab/visual-regression-mcp` | Future |

### Decision: **Keep `@tanguito/*` for now, migrate to `@devlab/*` when suite is official**

The `@tanguito` scope is already published. Renaming to `@devlab` requires:
1. New npm organization or user `@devlab`
2. Deprecation notices on old packages
3. Coordination with existing consumers

**Recommendation:** Freeze scope decision. Continue with `@tanguito/*` for the immediate future. Evaluate `@devlab` when the suite reaches 3+ packages and has external consumers.

### Bin names

| Package | Bin name |
|---------|----------|
| android-dev-mcp | `android-dev-mcp` |
| browser-dev-mcp | `browser-dev-mcp` |
| visual-regression-mcp | `visual-regression-mcp` |
| electron-dev-mcp | `electron-dev-mcp` |

Pattern: `<target>-dev-mcp` — consistent, discoverable, self-documenting.

### Shared package bin: **None**

`@devlab/shared` or `@tanguito/devlab-shared` is a library, not an executable. No bin entry.

---

## 6. Publishing Strategy

### Independent versioning (Changesets)

Each package has its own version. A PR that only touches `browser-dev-mcp` only bumps `browser-dev-mcp`.

```yaml
# .changeset/config.json
{
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

### Release flow

```
PR merged → Changeset detected → Version PR created
  → CI builds all packages → Tests pass
    → Version PR merged → CI publishes changed packages to npm
```

### Changelog

One `CHANGELOG.md` per package. Root `CHANGELOG.md` aggregates with links.

### Publication commands (manual trigger)

```bash
pnpm changeset        # Create a changeset (describes the change)
pnpm changeset version # Bump versions, update CHANGELOGs
pnpm changeset publish # Publish to npm
```

### npm dist-tags

| Tag | Meaning |
|-----|---------|
| `latest` | Stable release |
| `next` | Pre-release / beta |
| `canary` | Nightly from main |

---

## 7. CI/CD Pipeline

### GitHub Actions matrix

```yaml
jobs:
  build-and-test:
    strategy:
      matrix:
        package: [android-dev-mcp, browser-dev-mcp, shared]
    steps:
      - uses: pnpm/action-setup
      - run: pnpm install
      - run: pnpm --filter @devlab/${{ matrix.package }} build
      - run: pnpm --filter @devlab/${{ matrix.package }} test
```

### Pipeline stages

| Stage | When | What |
|-------|------|------|
| **PR Check** | Every PR | Lint, typecheck, build, test (matrix) |
| **Version PR** | Changeset merge | Build all, test all, version bump |
| **Publish** | Version PR merge | Build, test, `npm publish` (changed packages only) |
| **Doctor** | Nightly | Environment health checks (ADB available? Playwright available?) |

### Integration tests (future)

- android-dev-mcp: Needs physical device or emulator → manual trigger or dedicated runner
- browser-dev-mcp: Can run headless in CI → auto on PR
- visual-regression: Needs baseline screenshots → manual trigger

---

## 8. Documentation Strategy

### Root README

```
devlab-mcp/
  README.md             # Suite overview, package index, quick links
```

### Per-package README

Each package keeps its own comprehensive README (already done for both).

### Shared docs

```
docs/
  architecture.md        # This document
  getting-started.md     # One-page quickstart for the suite
  contributing.md        # Dev setup, PR flow, changesets
  workflow-examples/     # Cross-package workflow examples
    android-smoke-test.md
    browser-canvas-test.md
```

---

## 9. Shared Standards (Conventions, Not Code)

These are enforced by convention and code review, not by the shared package:

### Tool registration

Every tool follows the same pattern — validated by Zod, registered with snake_case name, returns `textResponse()`.

### Evidence structure

Every session produces:
```
sessions/<timestamp>_<name>/
  metadata.json
  evidence.jsonl
  screenshots/          (optional, runtime-specific)
  final-report.md
```

### Workflow format

Defined in JSON, tool names match MCP tool names, args are flat objects, descriptions are optional.

### Doctor scripts

Every package has `scripts/doctor.js` that checks runtime health (Node version, dependencies, runtime availability).

### Test patterns

- Unit tests: `node:test` + `node:assert/strict`
- Pure logic only — no runtime dependencies
- Files in `tests/*.test.js`
- Auto-discovered by `node --test tests/*.test.js`

---

## 10. Migration Path (From Current State)

### Phase 1: Create monorepo scaffold (DEVLAB-MCP-02, future)

```
1. Create devlab-mcp/ with pnpm workspace
2. Move android-dev-mcp → packages/android-dev-mcp
3. Move browser-dev-mcp → packages/browser-dev-mcp
4. Add tsconfig.base.json at root
5. Re-root .gitignore, keep git history
```

### Phase 2: Extract shared (DEVLAB-MCP-03, future)

```
1. Create packages/shared/
2. Move textResponse → shared
3. Move sanitizeName, validateSessionId, timestampForPath → shared
4. Define EvidenceStore base class → shared
5. Define Zod schemas → shared
6. Update both packages to import from @devlab/shared
```

### Phase 3: CI/CD + changesets (DEVLAB-MCP-04, future)

```
1. Add .github/workflows/ci.yml
2. Add changesets configuration
3. Verify independent builds + tests
4. Dry-run publish pipeline
```

### Phase 4: Freeze + tag (DEVLAB-MCP-05, future)

```
1. Tag v1.0.0-suite
2. Publish shared package (internal only)
3. Bump android-dev-mcp to use shared
4. Bump browser-dev-mcp to use shared
5. Both remain independently publishable
```

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shared package becomes a bottleneck | Version bumps cascade | Keep shared minimal (<500 lines). Never add runtime-specific code. |
| Monorepo grows unwieldy | Slow CI, complex tooling | pnpm filtering (`--filter`), Turborepo for caching |
| Scope name binding to one npm user | Bus factor if `@tanguito` is personal | Migrate to `@devlab` org when suite matures |
| Breaking changes in shared | Both packages break simultaneously | Changesets version bumps internal deps; never merge shared changes without testing both consumers |
| ADB/Playwright version conflicts | CI flakiness | Pin runtime versions, test matrix per package |

---

## 12. Future Roadmap

### Immediate (next 2 phases)

| # | What | Why |
|---|------|-----|
| 1 | Monorepo scaffold | Single repo, pnpm workspace |
| 2 | Extract shared types | Eliminate 150 lines of duplication |

### Medium-term (3-6 months)

| # | What | Why |
|---|------|-----|
| 3 | Visual regression MCP | Screenshot diffing for Galaxy Raiders pixel-perfect tests |
| 4 | Galaxy Raiders CI pipeline | Auto-smoke on every www/ change |
| 5 | SoundBend CI pipeline | Auto-test DSP runtime on APK changes |

### Long-term (6-12 months)

| # | What | Why |
|---|------|-----|
| 6 | Electron MCP | Test desktop app wrappers (Capacitor Electron builds) |
| 7 | iOS MCP | Complete the mobile testing story |
| 8 | Performance profiler MCP | Frame timing, memory, Lighthouse audits |
| 9 | DevLab dashboard | Web UI for session history, workflow triggers |

---

## 13. Decisions Log

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Monorepo over multi-repo | Shared iteration speed, single CI, pnpm enforces boundaries | 2026-05-27 |
| 2 | pnpm over npm/yarn | Strict deps, workspace protocol, changesets integration | 2026-05-27 |
| 3 | Keep `@tanguito/*` scope for now | Avoid premature rename, evaluate `@devlab` at 3+ packages | 2026-05-27 |
| 4 | Shared package ≤ 500 lines | Prevent coupling; contracts over implementations | 2026-05-27 |
| 5 | Changesets for independent versioning | Each package versions independently within monorepo | 2026-05-27 |
| 6 | No runtime coupling ever | ADB and Playwright never in same process. Shared is types + helpers only. | 2026-05-27 |

---

## 14. Veredict

**Monorepo with pnpm workspaces + changesets.** Packages remain independently installable, testable, and publishable. Shared is intentionally minimal — schema contracts and string helpers, never runtime logic. Migration is phased and reversible at each step.

**android-dev-mcp and browser-dev-mcp remain fully decoupled runtimes.** They never share a process, never import each other, and never depend on each other's runtime dependencies (ADB vs Playwright).
