# webgpu-claude-skill — intake (OPS-WEBGPU-TSL-INTAKE-01)

## Identidad

- Repositorio: https://github.com/dgreenheck/webgpu-claude-skill
- PIN: `af2319bd01bb7cc881267a9ef42cafdaf5e9029d` (detached HEAD, verificado)
- Checkout: `%LOCALAPPDATA%\DevLab\external-sources\webgpu-claude-skill`
- 24 archivos en checkout; **23 en allowlist** (`.claude-plugin/marketplace.json`
  queda EXCLUIDO por la allowlist del sprint: solo `plugin.json`).
- Gates del checkout: detached YES, HEAD==PIN YES, worktree CLEAN,
  submodules 0, hooks custom 0, symlinks 0.
- Ningún archivo del checkout fue ejecutado. Sin skill install, sin Cursor
  rules activation, sin copias a proyectos.

## Registro en DevLab

- `external-sources/registry.json` — entrada `webgpu-claude-skill`
  (id, repo, default_branch main, pinned_commit af2319bd, 23 components
  exactos, todos `candidate_for_audit`).
- `external-sources/webgpu-claude-skill/external-source-manifest.json` —
  schema 1, integration_mode `external-curated-reference`,
  execution_policy {installed:false, enabled:false, external_code_executed:false,
  external_dependencies_installed:false}, license UNRESOLVED,
  23 verified_files con SHA-256 reales.
- `allowlist-validation.json` + `structural-test-report.txt` — generados por
  `scripts/validate-external-source.mjs --source webgpu-claude-skill
  --checkout <checkout> --write-reports` → **RESULT PASS** (checks:
  allowlist exacta, paths seguros, hashes verificados contra el checkout,
  licencia UNRESOLVED registrada, sin wildcards, sin dependencias runtime).

## Estructura

```
README.md                        (161 líneas, MIT declarado, r183+ aligned, r171+ recomendado)
.claude-plugin/plugin.json       (metadata MIT, sin LICENSE)
.cursor/rules/*.mdc              (5 shims con referencias @skills/... a los docs)
skills/webgpu-threejs-tsl/
  SKILL.md                       (93 líneas, frontmatter name/description)
  REFERENCE.md                   (371 líneas, cheatsheet)
  docs/  core-concepts, materials, compute-shaders, post-processing,
         wgsl-integration, device-loss, limits-and-features (7 archivos)
  examples/ basic-setup, custom-material, earth-shader, particle-system,
            post-processing (5 archivos, JS ESM)
  templates/ webgpu-project, compute-shader (2 archivos)
```

## Estado

```text
OPS-WEBGPU-TSL-INTAKE-01 (fase 1-2): COMPLETED
WEBGPU_CLAUDE_SKILL: CURATED_REFERENCE / NOT INSTALLED
AUDIT: PENDING (fases 3-12)
```
