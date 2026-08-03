# threejs-skills curated intake

Review date: 2026-08-03

Status: **CURATED_REFERENCE / AUDIT_PENDING**

Repository: `https://github.com/CloudAI-X/threejs-skills`

Pinned commit: `b1c623076c661fc9b03dac19292e825a5d106823`

Default branch at intake: `main`

## Purpose

This entry makes the ten Three.js skills discoverable for later audit. It does
not install a skill, execute upstream code, add an upstream dependency, or
approve any component for production.

Only these paths are in scope (11 files, all allowlisted individually):

| Path | Intake status |
|---|---|
| `README.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-fundamentals/SKILL.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-geometry/SKILL.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-materials/SKILL.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-lighting/SKILL.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-textures/SKILL.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-animation/SKILL.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-loaders/SKILL.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-shaders/SKILL.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-postprocessing/SKILL.md` | `CANDIDATE_FOR_AUDIT` |
| `skills/threejs-interaction/SKILL.md` | `CANDIDATE_FOR_AUDIT` |

Nothing else in the repository is admitted by this record.

## Provenance verification

The commit page, local Git object, detached checkout, and manifest all resolve
to the same full SHA. The detached checkout is stored outside this repository
(`%LOCALAPPDATA%\DevLab\external-sources\threejs-skills`) and has no local
modifications; HEAD is detached at the pin, worktree clean, zero submodules,
zero symlinks, zero custom hooks. A manual `refs/heads/main` lookup on the
review date also resolved to the pin; no upstream drift was observed.

Central file hashes are recorded in `external-source-manifest.json` and
verified against the checkout (`allowlist-validation.json`). Upstream changes
are never pulled or adopted automatically.

## Findings recorded at intake (see risk-register.json)

- README installation commands clone `pinkforest/threejs-playground`, not this
  repository.
- README documents a `.claude/skills/` layout that does not exist in the tree
  (actual layout: `skills/<name>/SKILL.md`).
- No `LICENSE` file in the pinned tree; README declares MIT (see
  `license-review.md` — status UNRESOLVED).
- `skills/threejs-postprocessing/SKILL.md` contains a WebGPU example using
  `new THREE.PostProcessing(renderer)`, which does not exist in the THREE
  namespace; the example does not run as written.
- `skills/threejs-lighting/SKILL.md` imports `ContactShadows` from an official
  Three.js path where that module does not exist; the API belongs to a
  separate ecosystem and the example is not portable as written.
- `skills/threejs-animation/SKILL.md` labels a `StringKeyframeTrack` as a
  morph-target example even though morph weights are numeric; the later
  `NumberKeyframeTrack` example is the viable form.
- The selective-bloom sample renders the normal scene directly after the
  composer without an explicit additive combine pass, so the second render
  can overwrite the bloom result instead of demonstrating the stated effect.
- Mixed import styles (`three/examples/jsm` vs `three/addons`) and version
  annotations r150/r152 against a README claim of "r160+".
- Direct installation is not approved under this sprint.

## Adoption boundary

The external checkout is reference material only. No code may be executed,
copied into a package, exposed as an MCP tool, or installed with
`npx skills add` under this sprint. License status UNRESOLVED blocks
substantive reuse until resolved.
