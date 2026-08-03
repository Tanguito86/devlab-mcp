# OPS-WEBGPU-TSL-INTAKE-01 — source intake (F1-F2)

## Checkout externo

```text
REPOSITORY: https://github.com/dgreenheck/webgpu-claude-skill
PIN: af2319bd01bb7cc881267a9ef42cafdaf5e9029d
DESTINATION: %LOCALAPPDATA%\DevLab\external-sources\webgpu-claude-skill

DETACHED_HEAD: YES
HEAD_EQUALS_PIN: YES
WORKTREE: CLEAN
SUBMODULES: 0
CUSTOM_HOOKS: 0
SYMLINK_ESCAPES: 0
```

24 archivos en el checkout. **23 en allowlist** — `.claude-plugin/marketplace.json`
excluido (la allowlist del sprint solo cubre `plugin.json`).

Ningún archivo del checkout fue ejecutado. NO skill install, NO Cursor rules,
NO copias a proyectos, NO npm install en el checkout.

## Registro DevLab

- `external-sources/registry.json` → entrada `webgpu-claude-skill`
  (pinned af2319bd, default_branch main, 23 components exactos).
- `external-sources/webgpu-claude-skill/external-source-manifest.json`
  (schema 1, integration_mode `external-curated-reference`,
  execution_policy: installed/enabled/executed/installed-deps = false,
  automatic_updates false, license UNRESOLVED, 23 verified_files con SHA-256).
- `allowlist-validation.json` + `structural-test-report.txt` generados por
  `node scripts/validate-external-source.mjs --source webgpu-claude-skill
  --checkout <checkout> --write-reports` → **RESULT PASS** (17 checks:
  allowlist exacta, paths seguros, hashes verificados contra checkout real,
  licencia UNRESOLVED con reuse_authorized=false, sin wildcards, sin deps
  runtime, sin submodules, sin skills copiadas al root).

## Estructura registrada (23 archivos)

```
README.md (5,909 B)
.claude-plugin/plugin.json (539 B)
.cursor/rules/*.mdc x5
skills/webgpu-threejs-tsl/SKILL.md (3,295 B)
skills/webgpu-threejs-tsl/REFERENCE.md (9,424 B)
skills/webgpu-threejs-tsl/docs/*.md x7
skills/webgpu-threejs-tsl/examples/*.js x5
skills/webgpu-threejs-tsl/templates/*.js x2
```

Total: 142,544 bytes. Hashes SHA-256 en el manifest (verificados por el validador).
