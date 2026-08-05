# 04 — Threat model

Alcance: `ASSET_GM_BRIDGE_V1` (puente ASSET_FORGE → gm-ide-adapter). Clasificación de
amenazas, mitigación y a qué prueba/evidencia se remite cada una. Fail-closed: cualquier
duda de identidad, integridad o autorización bloquea sin escalar privilegios.

## T1 — Tampering del asset entre plan y apply
Cambio del PNG, del manifest, del .yyp, del nombre del recurso, del HEAD, de la allowlist
o del lifecycle después de planificar.
→ Binding SHA-256 completo (§9) + re-verificación LIVE en apply; manifest canónico
inmutable almacenado en evidencia; `STALE_OR_TAMPERED_PLAN`.
Evidencia: 11-negative-tests.md (tamper), tests `binding.test.js`.

## T2 — Bypass del gate de lifecycle
Asset DRAFT/PILOT/CANDIDATE/DEPRECATED/REJECTED llegando a apply.
→ Gate único sin flags de bypass; los seis estados probados; estado leído del catálogo
LIVE (no de copia del plan).
Evidencia: 11-negative-tests.md, tests `lifecycle.test.js`.

## T3 — Manifest mutable / hash incompleto
Manifest editado tras la importación; binding que no cubre algún archivo planeado.
→ Manifest canónico + sha256 ligado al binding; el binding cubre TODOS los planned file
hashes; el ledger del adaptador verifica manifestSha256 en rollback.
Evidencia: 11-negative-tests.md, 13-crash-recovery.md.

## T4 — TOCTOU entre inspección y escritura
El target cambia (archivo editado, recurso creado, snapshot distinto) entre plan y apply,
o entre verify y rollback.
→ El adaptador re-hashea cada destino en staging (EXPECTED_HASH_MISMATCH), re-valida
snapshot (PLAN_STALE), y el rollback exige estado "before" o "after" exacto
(CONCURRENT_MODIFICATION).
Evidencia: 12-toctou-and-concurrency.md, tests `toctou.test.js`.

## T5 — Path traversal / escape del proyecto
`..`, absolutos, UNC, ADS, NUL, separadores mixtos, aliases, reserved names, destinos
fuera del proyecto, escritura fuera de allowlist.
→ Reuso de `safeRelativePath`/`resolveInsideRoot` del adaptador (walk con rechazo de
symlink/junction) + allowlist estricta; tests positivos y negativos.
Evidencia: 11-negative-tests.md, tests `paths.test.js` (bridge) + `security.test.js` (adapter).

## T6 — Colisión de paths: case y Unicode ambiguo
Dos recursos que difieren solo en mayúsculas (`Sprite` vs `sprite`) o en normalización
Unicode (NFC vs NFD) → escritura ambigua, referencias rotas o sobrescritura en Windows.
→ Detección de colisión NFKC sobre paths planeados vs proyecto existente y vs paths del
mismo plan; `CASE_COLLISION` / `RESOURCE_COLLISION`; nombre de recurso validado.
Evidencia: 11-negative-tests.md, tests `paths.test.js`.

## T7 — Symlink/junction escape (target o evidencia)
Un path del plan atraviesa un link que apunta fuera del root; la evidencia es un link.
→ `resolveInsideRoot` rechaza symlinks/junctions en el walk (todos los niveles);
inspectProject falla si el proyecto contiene links.
Evidencia: 11-negative-tests.md, tests adapter `security.test.js`.

## T8 — Cambio concurrente externo (archivo o proyecto)
Otro actor modifica el proyecto durante la transacción o antes del rollback.
→ Lock O_EXCL por proyecto + re-hash de cada destino + estado before/after exacto en
rollback; `ROLLBACK_BLOCKED_CONCURRENT_CHANGE` / `TARGET_SNAPSHOT_CHANGED`.
Evidencia: 12-toctou-and-concurrency.md, tests `concurrency.test.js`.

## T9 — Crash a mitad de transacción (WRITE_AHEAD parcial)
Muerte entre reemplazos; el proyecto queda mezclado (PNG nuevo + .yy viejo).
→ WRITE_AHEAD: el manifest se escribe y fsync antes de promover; el rollback acepta
estados WRITE_AHEAD/FAILED y restaura backups byte-exactos; nunca se deja un estado sin
camino de recuperación.
Evidencia: 13-crash-recovery.md, tests `crash-recovery.test.js`.

## T10 — Rollback destructivo
Rollback que pisa un cambio externo posterior al apply o restaura blobs corruptos.
→ Verificación de backup (sha256 == beforeSha256) y de destino (estado before/after);
si el destino no es ninguno de los dos → bloqueo. `ROLLBACK_BLOCKED_CONCURRENT_CHANGE`.
Evidencia: 14-rollback.md, tests `rollback.test.js`.

## T11 — Confusión de procesos (ajenos vs propios)
Terminar Runner/Igor ajeno; matar un proceso cuyo PID fue reutilizado.
→ ProcessLedger con startToken (creationDate) + executable + commandHash; `identityMatches`
antes de cualquier kill; solo se terminan procesos registrados por la operación
(`startedByOperation`). Runner ajeno → RUN_BLOCKED_EXTERNAL_RUNNER sin tocar el proceso.
Evidencia: 15-igor-and-runtime.md, tests `processes.test.js` + pilot real.

## T12 — Determinismo perdido (UUIDs, timestamps, rutas absolutas)
IDs distintos entre ejecuciones idénticas; metadata con reloj; paths absolutos en el repo.
→ Sin UUIDs (identidad por name/path), sin timestamps en payload canónico, sin rutas
absolutas; PNG con deflate stored (byte-determinista); parche textual del .yyp.
Evidencia: 09-idempotency.md, 10-version-update.md, tests `determinism.test.js`.

## T13 — Presupuesto excedido
Asset demasiado ancho/alto, demasiados frames, bytes comprimidos/decodificados enormes.
→ Evaluación pre-write con datos reales del PNG (parsePng); `ASSET_BUDGET_EXCEEDED`
antes de escribir.
Evidencia: 11-negative-tests.md, tests `budget.test.js`.

## T14 — Vida útil del plan (reuso en otro fixture/proyecto)
Plan de un fixture aplicado en otro; recurso destino editado antes de aplicar.
→ Binding incluye snapshot_hash + project identity + expected HEAD + hashes planeados;
cualquier desvío → STALE_OR_TAMPERED_PLAN.
Evidencia: 11-negative-tests.md, tests `binding.test.js`.

## T15 — Fuga de información pública
Stacks internos, secretos, rutas privadas, credenciales en respuestas/errores.
→ Errores públicos con vocabulario cerrado; logs de evidencia sin secretos; scan de
secretos en el repo (verificación final).
Evidencia: 17-clean-clone-validation.md (scans), tests `errors.test.js`.

## T16 — Dependencias ocultas del entorno (clean-clone)
Estado global oculto, red, cache no documentada, checkout Hermes, archivos no trackeados.
→ Todo determinista en repo + work roots explícitos; runtime offline; el pilot exige
toolchain por flags; recipe de clean-clone en 17.
Evidencia: 17-clean-clone-validation.md.

## T17 — Compilación/runtime mal declarado
Exit code no-cero reportado como válido; log preexistente como evidencia; runtime
declarado solo por compile.
→ runOwnedCommand captura stdout/stderr/exit/owned pids de una invocación ACTUAL;
COMPILE_VALID exige exit 0; RUNTIME_VALID exige señal esperada + Runner propio observado;
compilación negativa intencional probada.
Evidencia: 15-igor-and-runtime.md, 11-negative-tests.md.

## Matriz de severidad residual

| Amenaza | Control primario | Residual post-control |
|---|---|---|
| T1–T3 | binding + manifest inmutable | bajo (requiere compromiso del repo o claves) |
| T4, T8 | lock + re-hash + estados exactos | bajo |
| T5–T7 | path safety reutilizado + NFKC | bajo |
| T9, T10 | WRITE_AHEAD + backups verificados | bajo |
| T11 | identity tokens de procesos | bajo |
| T12 | determinismo estructural | nulo (verificado por byte-exact restore) |
| T13–T17 | gates + evidencia real | bajo |

El modelo asume: repositorio y catálogo íntegros (los hashes del catálogo se verifican
contra disco); el atacante puede editar archivos del proyecto entre llamadas pero no
sustituir el proceso ni las claves del OS.
