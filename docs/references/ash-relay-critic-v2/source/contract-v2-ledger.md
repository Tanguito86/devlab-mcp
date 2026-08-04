# Contract v2 Ledger — OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C

Fuentes normativas (leídas 2026-08-04, read-only):
- `devlab-mcp/docs/reviews/devlab-ash-relay-pilot-05/core-loop-contract.md` (v2, 162 líneas)
- `devlab-mcp/docs/reviews/devlab-ash-relay-pilot-05/encounter-plan.md` (v2, 191 líneas)
- `devlab-mcp/docs/reviews/devlab-ash-relay-gameplay-correction-06a/gameplay-rubric-v2.md` (106 líneas)
- `devlab-mcp/docs/reviews/devlab-ash-relay-gameplay-correction-06a/codex-correction-brief-v2.md` (73 líneas)

Regla: cada requisito se evalúa con evidencia runtime observable (probe automatizada o revisión humana sobre la build), NUNCA por intención o comentarios de código.

## Valores canónicos v2

| Clave | Valor v2 | Fuente |
|---|---|---|
| PLAYER_SPEED | 8.5 u/s | core-loop v2 (Initial combat values) |
| PLAYER_HEALTH | 100 | core-loop v2 |
| INVULNERABILITY | 0.58 s | core-loop v2 |
| PULSE_COOLDOWN | 0.145 s | core-loop v2 |
| PULSE_DAMAGE | 18 | core-loop v2 |
| PULSE_SPEED | 20.5 u/s | core-loop v2 |
| ACTIVATION_HOLD | 1.25 s | core-loop v2 |
| EXTRACTION_HOLD | 1.50 s | core-loop v2 |
| CHECKPOINT_HEALTH | 100 | core-loop v2 (checkpoint retry restores full 100) |
| BOSS_HEALTH | 540 (provisional contra duración: misión 3-5 min, boss 70-100 s) | encounter-plan v2 (Relay Guardian) |
| POOL_CAPACITY | 24 (storage, NO presión simultánea) | core-loop v2 |
| RELAY_FLOOR | 75 % irreversible (drain 0.7 u/s solo hasta 75 %; nunca auto-completa) | core-loop v2 (regla 3) |
| ENCOUNTER_1 | 2 Cinder Scrappers normales ANTES de Node 01 (onboarding); response 1 Scrapper + 1 Sentry, sin refuerzos | encounter-plan v2 (Relay encounters) |
| SPAWNS | HATCH_IDLE → HATCH_TELEGRAPH (≥0.65 s, forma+color) → SPAWN_COMMIT → ENEMY_ACTIVE; sin spawn en el jugador; colas acotadas | encounter-plan v2 |
| BUDGETS | A: 2 activos/2 cola (onboarding) + 2 activos/2 cola (response); B: 5/5; boss P1: 0/0; boss P2: 2 activos/3 requests total | encounter-plan v2 |
| BOSS_FSM | TELEGRAPH → COMMITTED_ATTACK → RECOVERY → VULNERABLE; vulnerabilidad ligada al ataque, nunca reloj global | encounter-plan v2 |
| ENEMY_STATS | Scrapper 30/42 HP, 3.65/4.35 u/s, contacto 6/7, cooldown 0.82 s; Sentry 44/56 HP, bolt 5/6, cadencia 1.38/1.05 s, bolt 8.3 u/s, telegraph 0.32 s | encounter-plan v2 |
| TIMING | Tutorial 0:00-0:20 · Node 01 0:20-1:15 · Checkpoint 1:15-1:25 · Node 02 1:25-2:35 · Guardian 2:35-3:40 · Evac 3:40-4:10 · total 3-5 min | core-loop v2 |
| BOT_TIME | 165.850-167.300 s = límite inferior automático, NO evidencia humana | core-loop v2 |
| MOBILE_SIZES | 412×915 y 390×844 (mobile-active recipe) | rubric v2, encounter-plan v2 |

## Sección histórica — valores OBSOLETOS (prohibidos como autoridad)

Los siguientes valores pertenecen al contrato v1 / crítica 01B. Solo permanecen en esta sección histórica y en `ash-relay-critic/` (paquete v1). NO se evalúan, NO se puntúan, NO se comparan:

| Valor obsoleto | Reemplazo v2 |
|---|---|
| player speed 6.0 | 8.5 |
| checkpoint health 75 | 100 |
| boss health 360 obligatorio | 540 (provisional vs duración) |
| global active-hostile cap 6 | NO EXISTE — presupuestos locales por encuentro |
| exact checkpoint RNG rewind | el restore retiene la POSICIÓN ACTUAL del stream |
| Harrier 40 HP / 20 dmg / lunge 0.45 s | Scrapper 30/42 HP, contacto 6/7, cooldown 0.82 s, sin lunge |
| Ward 60 HP / 15 dmg / floor line 0.75 s | Sentry 44/56 HP, bolt 5/6, apertura 0.32 s |
| score 01B 70/100 | no comparable (rúbrica v2) |

## Ledger de requisitos verificables

Formato: CONTRACT_PATH · SECTION · REQUIREMENT · OBSERVABLE_SIGNAL · AUTOMATED_PROBE · HUMAN_REVIEW · PASS_CONDITION · FAIL_SEVERITY

### A. Estado y progresión

| # | CONTRACT_PATH / SECTION | REQUIREMENT | OBSERVABLE_SIGNAL | AUTOMATED_PROBE | HUMAN_REVIEW | PASS_CONDITION | FAIL_SEVERITY |
|---|---|---|---|---|---|---|---|
| A1 | core-loop / Mission state model | TITLE → start → mundo reconstruido seed 424242 → TUTORIAL | snapshot.seed === 424242; phase tutorial tras start | probe título: seed + phase tras Enter | — | seed 424242 y phase tutorial | P1 (gate TITLE_TO_VICTORY) |
| A2 | core-loop / regla 1 | jugador lleva core visible y demuestra movimiento + pulse direccional en tutorial | phase tutorial → encounter-1 solo tras move+attack; core tethered visible | probe tutorial: move+fire → transición | revisión visual (tether) | transición ≤ 20 s tras input competente | P1 |
| A3 | core-loop / regla 4 | relay activado = permanente; orange→cyan; conduit; HUD 0/2→1/2→2/2 | node.active; HUD rail text; color visual | probe nodo: activar → re-hold no re-activa (evento único) | captura checkpoint (cyan) | sin re-activación; HUD 1/2 | P1 |
| A4 | core-loop / regla 5 | guardian inaccesible e invulnerable hasta 2 relays; evac inactiva hasta derrota | guardian === null antes; evacuation.unlocked false | probe boss: snapshot en encounter-2 (sin guardian) y tras activar B | — | guardian solo tras ambos relays | P1 (gate BOSS_REACHABLE) |
| A5 | core-loop / Progress | 4 canales: objective text, rail 2 nodos, conduit cyan, cues locales | HUD DOM + presentation.objective; conduits visuales | probe HUD por fase (objective string esperado) | capturas | objective correcto por fase | P2 |

### B. Activación (floor 75 %)

| # | SECTION | REQUIREMENT | OBSERVABLE_SIGNAL | AUTOMATED_PROBE | HUMAN_REVIEW | PASS_CONDITION | FAIL_SEVERITY |
|---|---|---|---|---|---|---|---|
| B1 | core-loop / regla 3 | antes de 75 %: soltar/salir drena 0.7 u/s hasta 0 | node.activation decay al soltar < 75 % | probe: subir a 74 %, soltar, medir decay | — | decay a 0 (o ≤ 74 %) | P1 |
| B2 | core-loop / regla 3 | al llegar a 75 %: floor armado; interrupción drena solo hasta 75 % | activation nunca < 0.75 tras armar | probe: 89 % → soltar → muestreo 2 s | — | min ≥ 0.75 | P1 (gate SOFTLOCKS) |
| B3 | core-loop / regla 3 | floor NO auto-completa; no avanza offscreen | activation se mantiene en 0.75 sin input (no sube sola) | probe: 89 % → soltar 3 s → activation estable | — | sin auto-complete | P1 |
| B4 | core-loop / regla 3 | restart completo limpia progreso Y floor flag | tras restart: activation 0; re-hold arranca de 0 | probe: armar 89 % → restart → activation 0 | — | 0 y sin floor | P1 (gate RESTART_SUCCESS) |
| B5 | core-loop / Progress & recovery | checkpoint restore recrea solo el estado contractual (sin floor armado filtrado) | tras restore: activation del relay pendiente 0, sin floor | probe: armar B al 89 % → morir → restore → activation B = 0 | — | 0 y sin floor armado | P1 (gate CHECKPOINT_RESTORE) |
| B6 | core-loop / regla 3 | hold 1.25 s acumulado; complete = evento único | activation 0→1 en 1.25 s; 1 solo evento de commit | probe: ramp muestreo + contador commits | — | DUPLICATE_COMPLETE_EVENTS = 0 | P1 |

### C. Encounter 1 (onboarding y response)

| # | SECTION | REQUIREMENT | OBSERVABLE_SIGNAL | AUTOMATED_PROBE | HUMAN_REVIEW | PASS_CONDITION | FAIL_SEVERITY |
|---|---|---|---|---|---|---|---|
| C1 | encounter-plan / Relay encounters | Node 01 comienza DISABLED; 2 Scrappers normales por hatches opuestos ANTES de habilitarse | nodes[0].unlocked === false al entrar; 2 harriers spawneados; node se habilita tras derrotarlos | probe encounter-1: spawn order, node unlock, kills | captura encounter-1 | 2 Scrappers primero; node0.unlocked tras 2 kills | P1 (gate SOFTLOCKS, PACING) |
| C2 | encounter-plan | activación SOLO tras onboarding (no antes) | updateNodeActivation no progresa con node bloqueado | probe: E hold con node disabled → activation 0 | — | sin progreso pre-onboarding | P1 |
| C3 | encounter-plan | response acotada: exactamente 1 Scrapper + 1 Sentry, sin refuerzos | tras activar: 2 enemigos; sin spawns posteriores | probe: post-activación muestreo 30 s | — | ≤ 2 totales, sin refuerzos | P1 |
| C4 | rubric PACING | Relay A mediblemente menos exigente que Relay B (activos, totales, composición, sin elites) | peak activos A < peak activos B; totales A < B | probe: métricas comparativas A vs B | — | A < B en activos y totales | P2 |
| C5 | encounter-plan | sin spawn sobre el jugador; sin enemigos perdidos fuera de arena | distancia spawn-jugador > radio; enemigos clamp/recuperados | probe adversarial 5 | — | sin overlap; sin softlock en borde | P1 |
| C6 | core-loop / Timing | Node 01 + primer encuentro 0:20-1:15 | tiempo fase encounter-1 | probe timing | recorrido humano | 0:20-1:15 | P2 |

### D. Spawns, hatches y presupuestos

| # | SECTION | REQUIREMENT | OBSERVABLE_SIGNAL | AUTOMATED_PROBE | HUMAN_REVIEW | PASS_CONDITION | FAIL_SEVERITY |
|---|---|---|---|---|---|---|---|
| D1 | encounter-plan / lifecycle | todo spawn estándar sigue HATCH_IDLE → HATCH_TELEGRAPH → SPAWN_COMMIT → ENEMY_ACTIVE | estado hatch observable (idle/telegraph/commit); telegraph ≥ 0.65 s | probe spawn-hatch: timeline del primer Scrapper | captura hatch (2 canales: forma+color) | lifecycle completo y ≥ 0.65 s | P1 (gate SOFTLOCKS) |
| D2 | encounter-plan | telegraph usa forma animada + color alto contraste; visible en portrait | 2 canales verificables en captura | análisis de capturas (píxeles + frames) | revisión visual | 2 canales presentes | P2 |
| D3 | encounter-plan / budgets | Relay A 2/2 + 2/2; Relay B 5/5; boss P2 2 activos/3 requests | conteos activos y cola por encuentro | probe: muestreo activos máx + requests | — | máximos ≤ presupuestos | P1 |
| D4 | core-loop / pools | pool 24 = storage; colas acotadas (defer/reject determinista) | poolStats; cola nunca crece sin límite | probe: conteo de requests vs commits | — | sin crecimiento ilimitado | P1 |
| D5 | core-loop / restart | restart limpia hatch/timer/cola | tras restart: sin hatch activo, cola vacía | probe adversarial 7 | — | 0 residuos | P1 (gate RESTART_SUCCESS) |
| D6 | core-loop / checkpoint | restore sin residuos de cola/hatch | tras restore: cola 0, hatch idle | probe adversarial 8 | — | 0 residuos | P1 (gate CHECKPOINT_RESTORE) |
| D7 | encounter-plan | commit nunca dentro del radio del jugador; hatch inválido queda en cola y reintenta | distancia commit-jugador > radio; sin spawn en coordenada cruda | probe adversarial 5 + análisis spawn | — | sin overlap | P1 |

### E. Boss FSM

| # | SECTION | REQUIREMENT | OBSERVABLE_SIGNAL | AUTOMATED_PROBE | HUMAN_REVIEW | PASS_CONDITION | FAIL_SEVERITY |
|---|---|---|---|---|---|---|---|
| E1 | encounter-plan / FSM | secuencia TELEGRAPH → COMMITTED_ATTACK → RECOVERY → VULNERABLE por fase | estados del boss observables (snapshot: directedAttackSeconds, areaAttackSeconds, vulnerable, armorLock) | probe boss-fsm: timeline de estados | video | orden exacto por fase | P1 (gate BOSS_REACHABLE) |
| E2 | encounter-plan / P1 | sweep legible con aviso previo y zona segura alcanzable | ataque tipo sweep + safe zone; daño en zona segura = 0 | probe boss-fsm P1: daño durante sweep | video + captura | sweep con zona segura real | P1 |
| E3 | encounter-plan / P2 | fan con huecos estables, reconocibles y alcanzables | gaps angulares medibles; sin anillo cerrado | probe boss-fsm P2: ángulos de bolts | video | CLOSED_RADIAL_RING_WITHOUT_GAPS = 0 | P1 |
| E4 | encounter-plan / FSM | vulnerabilidad abre POR el ataque completado, nunca reloj global | vulnerable === true solo tras recovery del ataque | probe: correlación ataque→ventana | video | VULNERABILITY_CAUSED_BY_ATTACK = PASS | P1 |
| E5 | encounter-plan / P2 | ≤ 2 enemigos secundarios simultáneos; ≤ 3 requests total; por hatches | conteos refuerzos fase 2 | probe boss-fsm: refuerzos | — | ≤ 2/≤ 3 | P1 |
| E6 | encounter-plan | 540 HP inicial; sin armor locks por tiempo ni shutter cíclico | guardian.health === 540 al spawn; sin invulnerabilidad periódica | probe: HP spawn + vulnerable timeline | — | HP 540; sin locks cíclicos | P1/P2 |
| E7 | rubric BOSS | boss 70-100 s; ninguna fase > 55 s sin cambio de patrón | duración fase 1 y 2 | probe timing boss | — | 70-100 s total; fases ≤ 55 s | P2 |
| E8 | rubric BOSS | sin daño inevitable; sin invulnerabilidad/vulnerabilidad eterna | daño solo tras telegraph; estados acotados | probe adversarial 9-10 | video | sin daño sin telegraph | P1 |

### F. Checkpoint, restart, pausa

| # | SECTION | REQUIREMENT | OBSERVABLE_SIGNAL | AUTOMATED_PROBE | HUMAN_REVIEW | PASS_CONDITION | FAIL_SEVERITY |
|---|---|---|---|---|---|---|---|
| F1 | core-loop / Progress & recovery | checkpoint commit tras Relay A activo + encuentro limpio | checkpointAvailable true; checkpointSaves=1 | probe: kill todos → checkpoint | — | commit correcto | P1 |
| F2 | core-loop / recovery | retry checkpoint restaura: core, A activo, B inactivo, HP 100, stream RNG actual, 0 residuos, jugador en marcador | snapshot post-restore completo | probe restore (estado + hash RNG) | — | restore exacto v2 | P1 (gate CHECKPOINT_RESTORE) |
| F3 | core-loop / recovery | restart mission: seed 424242, HP 100, relays off, activation 0, floors clear, colas vacías, sin handlers duplicados | snapshot post-restart + conteo loops | probe restart (ticks/Hz) | — | restart completo | P1 (gate RESTART_SUCCESS) |
| F4 | core-loop / PAUSED | pausa congela fixed-step y eventos; resume sin paso extra/loop/binding/audio | tick congelado; al resume 60 Hz; listenerCount estable | probe pause/resume + adversarial 3, 6 | — | sin paso extra | P1 (gate PAUSE_RESUME) |
| F5 | core-loop / Defeat | DEFEAT congela combate; UI no dispara pulse debajo; sin auto-restart | phase defeat; attack no efectivo en UI | probe derrota | — | sin disparo bajo UI | P1 |
| F6 | core-loop / Victory | victoria sin auto-restart; elección explícita | phase victory estable hasta input | probe victory | — | sin auto-restart | P1 (gate VICTORY_REACHABLE) |

### G. Timing y móvil

| # | SECTION | REQUIREMENT | OBSERVABLE_SIGNAL | AUTOMATED_PROBE | HUMAN_REVIEW | PASS_CONDITION | FAIL_SEVERITY |
|---|---|---|---|---|---|---|---|
| G1 | core-loop / Timing | total first-input-to-victory 3-5 min (humano competente); bot 165.85-167.30 s como límite inferior | tiempos segmentados | probe timing (BOT_TIME) | recorrido humano desktop + móvil | humano 180-300 s | P2 (gate implícito PACING) |
| G2 | rubric PACING | timing NO vía movimiento lento, waits pasivas, refuerzos infinitos o HP inflado | speed 8.5; sin refuerzos infinitos; HP 540 justificado | probe: speed constante + conteo refuerzos | — | palancas correctas | P1 |
| G3 | rubric MOBILE | touch completa el main path; pointer-cancel y multi-touch seguros | recorrido touch completo | probe móvil (CDP touch) | recorrido móvil humano | victoria en touch | P1 (gate TOUCH_MAIN_PATH) |
| G4 | rubric MOBILE | controles no tapan ring/jugador/telegráfico/gap/objetivo en 412×915 y 390×844 | rects de controles vs canvas | probe layout móvil | capturas | sin solapamiento | P1 |
| G5 | rubric MOBILE | intención activation vs pulse inequívoca; control fusionado no causa disparo/activación no intencional | interacción touch con ring y enemigos | probe móvil: hold vs fire | recorrido móvil | sin ambigüedad | P1 |
| G6 | rubric MOBILE | resize portrait/desktop cambia layout/cámara solo | hash sim idéntico pre/post resize | probe resize | — | sim inalterada | P2 |

### H. Feedback (≥ 2 canales)

| # | SECTION | REQUIREMENT | OBSERVABLE_SIGNAL | AUTOMATED_PROBE | HUMAN_REVIEW | PASS_CONDITION | FAIL_SEVERITY |
|---|---|---|---|---|---|---|---|
| H1 | rubric FEEDBACK | spawn telegraph, floor armed, relay complete, boss vulnerability, hit, daño, phase change, checkpoint restore, defeat, victory: ≥ 2 canales (shape/color/motion/audio/text) | por evento: 2+ canales observables | probe: eventos → canales (audio cues, visual state, HUD text) | video/capturas | 2+ canales c/u | P2 |
| H2 | rubric FEEDBACK | feedback de eventos deterministas; no altera timing ni frozen-state | hash sim; capturas idénticas | probe determinismo | — | sin alteración | P1 |

## Gates v2 (8) — mapeo a probes

| Gate | Probes que lo sustentan |
|---|---|
| TITLE_TO_VICTORY | A1, A2, A4, C1-C3, E1-E6, F1, F6, G1 |
| SOFTLOCKS | B2-B6, C1-C5, D1-D7, E1-E8, adversarial plan v2 completo |
| RESTART_SUCCESS | B4, D5, F3 |
| CHECKPOINT_RESTORE | B5, D6, F2 |
| BOSS_REACHABLE | A4, E1-E6 |
| VICTORY_REACHABLE | F6, E8 |
| TOUCH_MAIN_PATH | G3-G5 |
| PAUSE_RESUME | F4 |

## Estado del ledger

Todos los requisitos tienen señal observable, probe asignada y condición PASS. Ninguno se evalúa por intención. Los valores obsoletos v1 quedan SOLO en la sección histórica de arriba y en el paquete v1 (`ash-relay-critic/`), que se marca explícitamente como histórico (ver gameplay-rubric.md v1, encounter-matrix.md v1, boss-review.md v1, bot-run-contract.json v1, codex-handoff.md v1).
