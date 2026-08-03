# jungle-trail curated intake

Review date: 2026-08-03

Status: **REFERENCE_ARCHITECTURE / EXECUTION_NOT_AUTHORIZED**

Repository: `https://github.com/StarKnightt/jungle-trail`

Pinned commit: `073e6eb8efc6d6915efacc611a6e5ba91c89e34c`

Default branch at intake: `main`

## Purpose

This entry records jungle-trail as a reference architecture for deterministic
WebGL canvas capture and blind-critic visual validation. It does not install,
execute, or depend on anything upstream.

Only these paths are in scope (8 files, all allowlisted individually and
confirmed to exist at the pin — no path was assumed from a previous report):

| Path | Intake status |
|---|---|
| `README.md` | `REFERENCE_ARCHITECTURE_ONLY` |
| `PROMPT.md` | `REFERENCE_ARCHITECTURE_ONLY` |
| `LICENSE` | `REFERENCE_ARCHITECTURE_ONLY` |
| `package.json` | `REFERENCE_ARCHITECTURE_ONLY` |
| `tools/harness.mjs` | `REFERENCE_ARCHITECTURE_ONLY` |
| `tools/shoot.mjs` | `REFERENCE_ARCHITECTURE_ONLY` |
| `tools/px.mjs` | `REFERENCE_ARCHITECTURE_ONLY` |
| `tools/fx.mjs` | `REFERENCE_ARCHITECTURE_ONLY` |

Nothing else in the repository (game source under `src/`, remaining tools,
media) is admitted by this record.

## Provenance verification

The commit page, local Git object, detached checkout, and manifest all resolve
to the same full SHA. The detached checkout is stored outside this repository
(`%LOCALAPPDATA%\DevLab\external-sources\jungle-trail`) and has no local
modifications; HEAD is detached at the pin, worktree clean, zero submodules,
zero symlinks, zero custom hooks. A manual `refs/heads/main` lookup on the
review date also resolved to the pin; no upstream drift was observed.

Central file hashes are recorded in `external-source-manifest.json` and
verified against the checkout (`allowlist-validation.json`).

## Key characteristics recorded (see architecture-review.md)

- Playwright is a dev dependency only (`^1.62.0`), used exclusively by
  `tools/`; the game itself has no npm runtime dependencies.
- Three.js r170 is loaded from jsDelivr at runtime via an importmap — the only
  runtime network dependency.
- No external assets observed in the pinned tree; every texture, mesh, and
  audio buffer is procedural.
- Builder→blind-critic pattern documented in `PROMPT.md` (critic sees rendered
  screenshots only, never source).
- Deterministic capture strategy documented (single `page.evaluate`:
  pause → renderOnce → read buffer → resume; frame sync via 1-px readPixels,
  not glFinish).

## Adoption boundary

No code may be executed, copied into a package, exposed as an MCP tool, or
used as a dependency under this sprint (`npm run serve`, `npm run shoot`, and
`npm install` in the checkout are explicitly not authorized). The value here
is architectural: patterns that may inspire DevLab tooling after a separate
review.
