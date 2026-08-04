# 00 — Baseline del entorno

Sprint: OPS-R3F-INTAKE-01
Fecha y hora (local): 2026-08-03 19:28 (lun., 3 de agosto de 2026 19:28:20)
Host: Windows 10 Pro (build 19045, 22H2) — `Microsoft Windows NT 10.0.19045.0`

## Toolchain

| Herramienta | Versión | Notas |
|---|---|---|
| Hermes | v0.20.0 (2026.8.3) | desktop, perfil default |
| Modelo | DeepSeek V4 (flash) | provider deepseek, vía env DEEPSEEK_API_KEY |
| Git | 2.55.0.windows.3 | git-bash/MSYS |
| Node | v24.13.0 | |
| npm | 11.6.2 | |
| Yarn | NO disponible | `yarn: command not found` |
| Corepack | NO disponible | `MODULE_NOT_FOUND corepack` (Node 24 sin corepack instalado) |
| PowerShell | 5.1.19041.6456 | Windows PowerShell clásico |
| Python | 3.11.15 (hermes venv) | |

Implicancia para Fase 14: el repo es Yarn 1 workspace (`packageManager: yarn@1.22.22`); este host no tiene yarn ni corepack. Cualquier `yarn install` del checkout requeriría habilitar corepack o instalar yarn — **no se ejecutó nada de eso** (ver gates).

## Estado DevLab (informativo, read-only)

Registrado antes del sprint, sin tocar:

- master HEAD: `28794856be45c8f4beb2a537b0b2f2ee75db5667` — "DEVLAB-CODEX-WEBGPU-REVIEW-02 document verified integration"
- branch master: `master`
- porcelain: limpio (0 entradas)
- Worktrees:
  - devlab-mcp → master @ 2879485
  - devlab-mcp-codex-game-skills-review → devlab-codex-game-skills-review-03 @ 2879485
  - devlab-mcp-codex-review → devlab-codex-review-01 @ 38ae493
  - devlab-mcp-codex-webgpu-review → devlab-codex-webgpu-review-02 @ 82c34f3
  - devlab-mcp-deepseek-threejs → detached @ c10aee1
  - devlab-mcp-threejs-capture → devlab-threejs-capture-01 @ 7995ca1
  - devlab-mcp-webgpu-tsl → ops-webgpu-tsl-intake-01 @ f933fa2

Codex está activo en DEVLAB-CODEX-GAME-SKILLS-REVIEW-03 (worktree `devlab-codex-game-skills-review`, HEAD en el mismo commit que master). No se detiene el intake por actividad concurrente de Codex salvo conflicto directo de rutas (no lo hubo).

## Post-check (al cierre del sprint, 19:55)

- DevLab master HEAD: `4c66a883e58d021ebd955789d0b324a098c61e85` (avanzó desde `2879485` — delta atribuible al trabajo concurrente de Codex en DEVLAB-CODEX-GAME-SKILLS-REVIEW-03, NO a este sprint; porcelain limpio, no se tocó nada)
- Checkout del intake: limpio, pin `0a107412` intacto
- Rutas protegidas: 0 modificaciones (verificación por porcelain y ausencia de escrituras propias)

## Procesos preexistentes (informativo)

Chrome/Chromium/Edge vivos al inicio (propios de la sesión desktop y del trabajo de Codex; **no se terminó ninguno**):

- chrome.exe ×7, chrome-headless-shell.exe ×3 (sesión de browser/Playwright activa de otro agente), chrome-native-host.exe ×1
- msedge.exe ×2, msedgewebview2.exe ×8 (webview del desktop app)

Contadores del sprint: BROWSER_RUNS: 0 (ningún lanzamiento propio), RESIDUAL_PROCESSES: 0 (no se inició proceso alguno).

## Rutas

- ROOT: `external-evidence:/r3f-intake` (creado)
- SOURCE: `external-evidence:/r3f-intake\source` (checkout git)
- EVIDENCE: `external-evidence:/r3f-intake\evidence\OPS-R3F-INTAKE-01` (creado)

Nota histórica: el directorio lógico de documentos era un junction; el intake trabajó sobre la ruta física registrada por el bundle fuente. Esta observación no constituye autoridad operativa en DevLab.
