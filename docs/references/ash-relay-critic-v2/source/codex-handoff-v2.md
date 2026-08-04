# Codex Handoff v2 — OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C

Para: Codex (DEVLAB-ASH-RELAY-GAMEPLAY-CORRECTION-06B)
De: Hermes (crítico independiente v2)
Estado: preparación completa; a la espera de `CORRECTION_BUILD_READY_FOR_REVIEW`

## Qué preparó Hermes (todo en `external-evidence:/ash-relay-critic-v2\`)

| Archivo | Contenido |
|---|---|
| contract-v2-ledger.md | Ledger de requisitos v2 (señal observable + probe + revisión humana + PASS + severidad); valores obsoletos solo en sección histórica |
| gameplay-rubric-v2-execution.md | Rúbrica v2 ejecutable: 8 gates + pesos/anclas; veredicto PASS / GAMEPLAY_ACCEPTED_POLISH_PENDING / FAIL |
| activation-floor-probes.json | 7 probes del floor 75% (AF-01…AF-07) + gates LAST_QUARTER_FLOOR / DUPLICATE_COMPLETE_EVENTS |
| encounter-1-probes.json | 7 probes del onboarding/response (E1-01…E1-07) |
| boss-fsm-probes.json | 10 probes del FSM del Custodian (BF-01…BF-10) + 5 gates de boss |
| spawn-hatch-probes.json | 8 probes del lifecycle de hatches y presupuestos (SH-01…SH-08); distinción pool 24 / budget local / cap 6 inexistente |
| timing-contract-v2.json | Segmentos de timing v2 + BOT_TIME / HUMAN_DESKTOP_TIME / HUMAN_MOBILE_TIME separados (el bot NO sustituye al humano) |
| adversarial-plan-v2.md | 15 casos × 3 corridas = 45/45 esperado |
| mobile-checklist-v2.md | Checklist táctil v2 (412×915 y 390×844; intención activation/pulse inequívoca) |
| evidence-schema-v2.json | Entregables requeridos + verificación de hashes + esquema hallazgos + schema final v2 |
| codex-handoff-v2.md | Este documento |
| preparation-status.md | Estado PREPARED / WAITING_FOR_CORRECTION_BUILD |

## Qué necesita entregar Codex con CORRECTION_BUILD_READY_FOR_REVIEW

1. **GAME_WORKING path** (build corregida).
2. **Tree o commit hash** — Hermes verifica el hash ANTES de abrir el browser.
3. **Build + typecheck + tests** verdes (v2 consistency test incluido, según brief 06B).
4. **Capturas frozen** de los 10 estados del contrato v2 (mobile-active en 390×844).
5. **Video** del recorrido completo + derrota + checkpoint retry + boss.
6. **Bot results v2** (10 seeds; rango 165.850-167.300s como límite inferior informativo, no evidencia humana).
7. **Adversarial results v2** (los 15 casos del plan v2).
8. **Timing report** por segmento (timing-contract-v2.json).
9. **Boss metrics**: tiempo por fase, ataques ejecutados, ventanas abiertas, daño durante telegraph, daño en zona segura, duración total.
10. **Determinism report** (2 capturas por estado idénticas + hash).
11. **Lifecycle report** (restart/checkpoint + floors + colas).
12. **Device-loss report** (incluye Overload).

## Reglas de la crítica v2

- Hermes NO modifica código, NO pide cambios de alcance, NO crea enemigos, NO reemplaza el diseño, NO selecciona capturas favorables, NO usa valores v1.
- Gates funcionales (8) con precedencia sobre el score; P0/P1 → veredicto FAIL.
- El recorrido humano (desktop y móvil) es evidencia propia del crítico: el tiempo del bot es cota inferior, no sustituye al humano.
- La crítica evalúa con evidencia runtime observable: señal en snapshot/HUD/capturas, nunca "por intención del código".

## Puntos de vigilancia v2 (los más fáciles de violar en 06B)

1. **Floor 75%**: el drain post-armado debe parar en 0.75 (no en 0). Fácil de "arreglar" mal: piso global en vez de por-relay, o floor que auto-completa, o floor que sobrevive al restart.
2. **Onboarding de Relay A**: 2 Scrappers ANTES de habilitar Node 01, y response de EXACTAMENTE 1+1 sin refuerzos. Fácil de romper: spawnea la response junto con el onboarding, o deja refuerzos.
3. **FSM del boss**: TELEGRAPH → COMMITTED_ATTACK → RECOVERY → VULNERABLE en ese orden y POR ataque. Fácil de violar: volver al ciclo temporal, o abrir VULNERABLE sin ataque previo, o el fan sin gaps.
4. **Lifecycle de hatch**: HATCH_IDLE → HATCH_TELEGRAPH (≥0.65s, 2 canales) → SPAWN_COMMIT → ENEMY_ACTIVE, con budgets locales (A 2/2+2/2, B 5/5, P2 2/3). Fácil de violar: commit sin telegraph, o cola sin tope, o reintento en coordenada cruda.
5. **Pool 24 ≠ cap**: no se puntúa como presión; no introducir un cap global de 6 (prohibido por el brief v2).
6. **Timing**: extender con onboarding/telegraphs/recovery/patrones reales; NO con movimiento lento, waits pasivas, refuerzos infinitos o HP inflado (speed 8.5 y HP 540 se mantienen).
7. **Móvil**: activation y pulse inequívocos (el control fusionado de 01B es P2 pendiente de resolver); controles sin solapamiento en 412×915 y 390×844.
8. **RNG**: checkpoint restore retiene la posición ACTUAL del stream (no rewind); el determinismo de capturas debe seguir intacto.

## Próximo paso

Cuando la build esté lista, avisá con `CORRECTION_BUILD_READY_FOR_REVIEW` + los 12 entregables y Hermes ejecuta la crítica v2 read-only con este paquete. Mientras tanto, 0 interferencia del crítico.
