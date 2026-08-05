# 00 — Sprint plan

Sprint: DEVLAB-ASSET-BRIDGE-01 — Governed Asset Forge → GameMaker Adapter Bridge.

## Roles

- Hermes: Lead y Builder (este informe). Modo `--safe-mode`, sin MCP, sin las 251
  herramientas del checkout Hermes, sin network browsing, sin memoria/plugins.
- DeepSeek V4 Flash 0731: crítico independiente read-only (posterior; 18-deepseek-critic.md).
- Codex: integrador y autoridad final (19-critic-resolution.md, 20-final-status.md,
  clean-clone gate 17).

## Objetivo

Componer la capability `ASSET_FORGE` (catálogo + lifecycle) con el adaptador
`gm-ide-adapter` (seis operations públicas) mediante un paquete de composición
gobernado `packages/asset-gm-bridge` con UNA capability pública versionada:
`ASSET_GM_BRIDGE_V1`. Fixture sintético original `fixtures/gamemaker/asset-bridge-pilot`
y asset generado `bridge_test_beacon` v1/v2. Sin assets productivos, sin tocar
Galaxy Raiders, Hellbullet ni consumidores reales.

## Orden de ejecución (basado en el sprint §28)

1. Verificar baseline (HEAD, rama, worktree, índice, commits locales, suites base,
   Node/pnpm, procesos ajenos) — Codex ya verificó; se re-confirma y documenta.
2. Backup bundle: verificado (no se recrea) — SHA-256 del bundle, `git bundle verify`,
   restauración ya probada por Codex. Documentar en 01.
3. Suites iniciales: build + tests de todos los paquetes, tests root, AB-04, pack dry-run.
4. Diseñar contratos y threat model (00–04, este conjunto).
5. Crear fixture sintético original.
6. Generar asset v1 `bridge_test_beacon@1.0.0` mediante el pipeline de Asset Forge
   (spec → build → export → inspect) y aprobarlo formalmente (CANDIDATE → APPROVED).
7. Construir manifest canónico inmutable.
8. Implementar planificación determinista (plan de importación GM + binding SHA-256).
9. Implementar apply seguro (gate APPROVED, presupuestos, allowlist, transacción adaptador).
10. Verificar importación (TEXT/LOAD/COMPILE/RUNTIME con Igor real).
11. Verificar idempotencia (segundo apply → NO_CHANGE).
12. Generar y aplicar asset v2; invalidación del plan v1.
13. Ejecutar compilación y runtime reales (initial, v1, v2, post-rollback, negativo).
14. Ejecutar pruebas negativas (gate lifecycle 6 estados, budgets, paths, tamper).
15. Ejecutar TOCTOU, concurrencia y crash recovery.
16. Ejecutar rollback byte-exact.
17. Actualizar registry de capabilities (sin tocar las seis GM ni las ocho ops de Asset Forge).
18. Ejecutar todas las suites + nueva suite Asset Bridge.
19. Entregar a DeepSeek (crítico independiente; NO lo invoca el builder).
20. Resolver hallazgos con Codex.
21. Repetir validaciones.
22. Clean-clone offline (Codex; recipe en 17-clean-clone-validation.md).
23. Verificar Git final (worktree limpio, índice vacío, commits locales coherentes).
24. Decisión final (Codex).
25. No iniciar el sprint siguiente (DEVLAB-ASSET-CONSUMER-PILOT-01 queda solo como preview).

## Fronteras de autoridad

- Composición exclusiva vía operaciones públicas de Asset Forge (validate_spec, build,
  build_batch, capture, critic, resolve, export, inspect) y la superficie pública de seis
  operations de gm-ide-adapter (GM_STATUS_V1, GM_INSPECT_V1, GM_PLAN_V1, GM_APPLY_SAFE_V1,
  GM_VERIFY_V1, GM_ROLLBACK_V1).
- No se exponen herramientas crudas de filesystem, GameMaker, Igor ni Asset Forge.
- No se toca el checkout Hermes (H:\DEV\AGENTE\hermes-gamemaker-ide-mcp), no se copia
  código de Hermes, no se importan assets productivos.
- Sin push, tag, release, rebase, force-push, ni cambios de origin.
- Herramienta: Igor, runtime, ProjectTool y user dir se pasan explícitamente por flag;
  jamás como defaults implícitos.
- Todo runtime/cache/evidencia operacional bajo un work root externo explícito
  (H:\Temp\Deposito), nunca dentro del árbol del repo.

## Criterios de cierre (resumen §26)

Baseline preservado, bundle verificado, worktree/índice finales limpios, capabilities
previas intactas, gate APPROVED, manifest canónico, binding completo, plan inmutable,
allowlist estricta, path safety, budgets, importación determinista, idempotencia,
update v1→v2, rollback byte-exact, concurrencia protegida, crash recovery, Igor positivo
y negativo correctamente rechazado, runtime v1/v2/post-rollback, procesos ajenos
preservados, suites verdes, registry válido, scans limpios, clean-clone offline PASS,
DeepSeek sin BLOCKER/REQUIRED abiertos, Codex acepta. El builder no se autoaprueba.
