# DevLab MCP Suite — Baseline Freeze v1

**Date:** 2026-05-27
**Commit:** `8fca6bc` — "Add CI and changesets for DevLab MCP suite"
**Phase:** DEVLAB-MCP-05 — Suite Freeze + Tag Prep
**Status:** ✅ STABLE — Ready for pre-publish tag

---

## Package Inventory

| Package | Version | Description | Tests |
|---------|---------|-------------|-------|
| `@tanguito/devlab-shared` | **0.1.0** | Contracts, schemas, helpers (pure, zero runtime deps) | 0 (pure types) |
| `@tanguito/android-dev-mcp` | **1.2.0** | Android device automation MCP | 42/42 ✅ |
| `@tanguito/browser-dev-mcp` | **1.0.0** | Desktop browser automation MCP (Playwright) | 8/8 ✅ |

**Total tests:** 50/50 ✅

---

## Validation Results

### Build
```
packages/shared build        tsc  ✅
packages/android-dev-mcp build  tsc  ✅
packages/browser-dev-mcp build  tsc  ✅
```
All 3 packages compile cleanly.

### Test
```
shared:       0 tests (pure types, no runtime)
android:      42/42 pass ✅
browser:      8/8 pass ✅
```

### Doctor
```
browser-dev-mcp Doctor
✅ Node v22.22.3
✅ Playwright 1.60.0
✅ Chromium (Playwright) available
✅ dist/ build found
✅ 1 profiles: galaxy-raiders.json
✅ 3 workflow files
Result: Ready 🚀
```

### Pack Dry-Run
| Package | Files | Size |
|---------|-------|------|
| `@tanguito/devlab-shared@0.1.0` | 21 | 3.0 kB |
| `@tanguito/browser-dev-mcp@1.0.0` | 17 | 24.3 kB |
| `@tanguito/android-dev-mcp@1.2.0` | 87 | 51.6 kB |

All tarballs clean — no evidence/, sessions/, screenshots, or node_modules.

### Independence Verification
- ✅ android-dev-mcp builds and tests independently
- ✅ browser-dev-mcp builds and tests independently
- ✅ shared has ZERO runtime imports (no fs, child_process, os, path)
- ✅ shared is pure Zod schemas + string helpers (~102 lines)
- ✅ No package depends on another for runtime (shared is build-time only)

### Package Content Audit
- ✅ No `evidence/` directory in any package
- ✅ No `sessions/` directory in any package
- ✅ No screenshots (.png, .jpg, .webm) in any package
- ✅ No local artifacts in source tree
- ✅ `.npmignore` / `files` field properly scoped

---

## Infrastructure

### Monorepo
- **Tool:** pnpm workspaces
- **Package manager:** pnpm 9.15.4 (via corepack)
- **Node:** v22.22.3
- **TypeScript:** ^5.3 (shared), ^6.0 (android/browser)

### CI/CD
- **File:** `.github/workflows/ci.yml`
- **Matrix:** Node 20 + 22, ubuntu-latest
- **Steps:** checkout → pnpm setup → install --frozen-lockfile → build → test → pack:dry-run → doctor
- **Trigger:** push + pull_request → main/master

### Versioning
- **Tool:** Changesets (`@changesets/cli`)
- **Config:** `.changeset/config.json`
- **Strategy:** Independent versioning per package
- **Access:** public
- **Base branch:** main

### Docs
- `docs/architecture.md` — Suite design decisions
- `docs/browser-mcp-freeze.md` — Browser MCP freeze report
- `docs/publishing.md` — Publishing workflow guide
- `docs/suite-freeze-v1.md` — This file

---

## Known Limitations

1. **WSL Chromium:** Headless shell crashes on WSL without extra libs (`libnspr4`, etc.). Workaround: set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to full Chromium binary. Documented in `docs/browser-mcp-freeze.md`.

2. **npm pack under pnpm:** The root `package.json` has `"packageManager": "pnpm@..."` which causes `npm pack --dry-run` to redirect to pnpm. Workaround: `COREPACK_ENABLE_STRICT=0 npm pack --dry-run`. The `pack:dry-run` scripts have been updated accordingly.

3. **Shared has no runtime tests:** `@tanguito/devlab-shared` is pure type contracts (Zod schemas + string helpers). No runtime tests exist because there's no runtime logic. This is acceptable for v0.1.0.

4. **No npm publishing yet:** All packages are local-only. Publishing flow is documented but not executed.

5. **Browser MCP requires Playwright:** Full Chromium binary must be installed via `npx playwright install chromium` in headless environments.

---

## Next Steps (Post-Freeze)

### Option A: Publish to npm
- Run `pnpm changeset:version` to bump versions
- Run `pnpm changeset:publish` to publish all 3 packages
- Requires npm token configured

### Option B: Add visual-regression-mcp
- New `packages/visual-regression-mcp/` 
- Screenshot comparison, pixel diffing, regression detection
- Complements browser-dev-mcp for canvas game testing

### Option C: Galaxy Raiders Deep Integration
- Create comprehensive test suite with browser-dev-mcp
- Canvas state validation, FPS monitoring, boss fight verification
- Automated regressions on game changes

### Option D: SoundBend DSP Validation
- Return to android-dev-mcp → SoundBend DSP pipeline
- Runtime validation on real device (SM-A225M)

---

## Suggested Tag

```bash
# DO NOT EXECUTE PUSH — local tag only
git tag -a devlab-mcp-suite-v1.0.0-prepublish \\
  -m "DevLab MCP Suite baseline freeze: shared 0.1.0, android 1.2.0, browser 1.0.0"
```

Git tree at freeze point:
```
8fca6bc Add CI and changesets for DevLab MCP suite
acdd693 Extract shared DevLab contracts
1717efa fix: track src/evidence/EvidenceStore.ts
9fd56c6 Scaffold DevLab MCP monorepo
```
