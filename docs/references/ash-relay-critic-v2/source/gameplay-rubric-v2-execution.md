# Gameplay Rubric v2 — Ejecutable (OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C)

Autoridad: `gameplay-rubric-v2.md` (devlab-ash-relay-gameplay-correction-06a) + contratos v2. Esta es la versión EJECUTABLE: pesos, anclas 0-10 por ítem y gates con sus probes. Reemplaza la rúbrica v1 (70/100 histórico, no comparable).

## Gates funcionales (8, binarios, precedencia máxima sobre el score)

| Gate | Criterio v2 | Probe de referencia (ledger) |
|---|---|---|
| TITLE_TO_VICTORY | ruta title→victory alcanzable sin intervención de debug | A1, A2, C1-C3, E1-E6, F1, F6 |
| SOFTLOCKS | 0 softlocks en 10 bot runs + todos los adversariales (incluye floor, budgets locales, colas acotadas) | B2-B6, C1-C5, D1-D7, adversarial-plan-v2 (45 corridas) |
| RESTART_SUCCESS | restart: seed 424242, HP 100, relays off, activation 0, floor flags clear, colas vacías, sin handlers/loops duplicados | B4, D5, F3 |
| CHECKPOINT_RESTORE | core attached, A activo, B inactivo, HP 100, stream RNG en posición actual, sin residuos (enemigo/proyectil/telegráfico/efecto/hatch request/floor armado), jugador en marcador | B5, D6, F2 |
| BOSS_REACHABLE | Custodian inaccesible e invulnerable antes de 2 relays; alcanzable con estado inicial correcto tras ambos | A4, E1-E6 |
| VICTORY_REACHABLE | derrota del boss habilita extracción 1.50 s; victoria sin auto-restart | E8, F6 |
| TOUCH_MAIN_PATH | main path completable con touch y legible en 412×915 y 390×844 | G3-G5 |
| PAUSE_RESUME | pausa congela fixed-step y eventos procedimentales; resume sin paso extra, loop, binding ni audio nuevo | F4 |

Un gate FAIL → veredicto FAIL, aunque el score sea alto.

## Puntuación (anclas 0-10 por ítem; categoría = promedio × peso/10)

### CONTROL — 20 pts
| Ítem | Criterio v2 | Ancla 0 | Ancla 10 |
|---|---|---|---|
| Responsividad movimiento | responde al input al frame esperado a 8.5 u/s, sin lag | input muerto/retrasado | 1:1 perceptivo |
| Sin drift no intencional | parar y girar no derrapa; sin drift tras soltar (touch y teclas) | drift permanente | control total |
| Precisión del aim | aim desktop y touch apunta donde se espera; sin offset | aim ruidoso/desplazado | puntería fiel |
| Cadencia pulse 0.145 s | cadencia legible; no se traga inputs | inputs perdidos | cada input dispara |
| Daño recibido + i-frames 0.58 s | daño legible (flash naranja + impulso); sin multi-hit en un frame | daño silencioso | daño legible y justo |
| Dash | NO requerido ni puntuado (N/A) | — | — |

(5 ítems puntuables × 4 pts)

### CLARIDAD — 15 pts
| Ítem | Criterio v2 |
|---|---|
| Objetivo + rail 2 nodos + conduit + ruta | HUD objective, rail, conduit cyan legibles en todo el recorrido |
| Scrapper y Sentry identificables antes del daño | silueta/color/audio/timing distinguen; sin recibir daño para saber qué es |
| Hatch telegraph | TODO spawn estándar con hatch: forma o movimiento + color; ≥ 0.65 s; visible en portrait |
| Estados distinguibles | floor armed, committed attack, recovery, vulnerability, phase transition — estados visibles distintos |

(4 ítems × 3.75 pts)

### PACING — 15 pts
| Ítem | Criterio v2 |
|---|---|
| Relay A onboarding | exactamente 2 Scrappers antes de Node 01; activación solo tras derrotarlos |
| Relay A response | exactamente 1 Scrapper + 1 Sentry; sin refuerzos |
| A < B | A menos exigente que B (activos, totales, composición, sin elites) |
| Misión 3-5 min | target path (humano competente) en ventana; bot 165.85-167.30 s = límite inferior, no evidencia humana |
| Boss 70-100 s; fase ≤ 55 s | duración del boss; ninguna fase > 55 s sin cambio de patrón |
| Palancas correctas | timing NO por movimiento lento, waits pasivas, refuerzos infinitos ni HP inflado |

(6 ítems × 2.5 pts)

### ENEMIGOS — 15 pts
| Ítem | Criterio v2 |
|---|---|
| Cinder Scrapper | 30/42 HP, pursuit 3.65/4.35 u/s, contacto 6/7, cooldown 0.82 s, sin proyectil |
| Arc Sentry | 44/56 HP, lane 2.4 u/s, bolt 5/6 @ 8.3 u/s, apertura 0.32 s, standoff 5-8 u |
| Budgets locales | A: 2/2 + 2/2; B: 5/5; colas acotadas con defer/reject determinista |
| Pool 24 | storage; NUNCA se puntúa como presión simultánea |
| Lifecycle hatch | HATCH_IDLE → HATCH_TELEGRAPH → SPAWN_COMMIT → ENEMY_ACTIVE; sin spawn en jugador |

(5 ítems × 3 pts)

### BOSS — 15 pts
| Ítem | Criterio v2 |
|---|---|
| HP 540 | inicial; revisado solo contra duración medida (70-100 s boss / 3-5 min misión) |
| FSM por fase | TELEGRAPH → COMMITTED_ATTACK → RECOVERY → VULNERABLE, en ese orden |
| Fase 1 | sweep legible con aviso y zona segura alcanzable; sin refuerzos; sin armor lock por tiempo |
| Fase 2 | fan con huecos estables y alcanzables; shell naranja; ≤ 2 activos / ≤ 3 requests |
| Vulnerabilidad causal | abre POR el ataque completado, nunca reloj global; sin estados perpetuos |
| Sin daño inevitable | daño solo tras telegraph; combinaciones evadibles a 8.5 u/s |

(6 ítems × 2.5 pts)

### FEEDBACK — 10 pts
| Ítem | Criterio v2 |
|---|---|
| 2+ canales por evento | spawn telegraph, floor armed, relay complete, boss vulnerability, hit, daño jugador, phase change, checkpoint restore, defeat, victory: cada uno con ≥ 2 canales (shape/color/motion/audio/text) |
| Determinista | feedback deriva de eventos de sim deterministas; no altera timing ni frozen-state |

(2 ítems × 5 pts)

### MOBILE — 10 pts
| Ítem | Criterio v2 |
|---|---|
| Touch main path | completable en touch; pointer-cancel y multi-touch seguros |
| Sin obstrucción | controles no tapan ring, jugador, telegráfico cercano, gap del boss u objetivo en 412×915 y 390×844 |
| Intención inequívoca | activation y pulse sin ambigüedad; control fusionado no causa disparo/activación accidental |
| Resize | cambia layout/cámara solo, nunca sim |

(4 ítems × 2.5 pts)

## Puntuación final v2

- Gates: 8 binarios (todos PASS o FAIL).
- Score: suma por categoría (anclas 0-10).
- Veredicto:
  - `PASS` = gates 8/8 + sin P0/P1 + score ≥ 80.
  - `GAMEPLAY_ACCEPTED_POLISH_PENDING` = gates 8/8 + sin P0/P1 + score 75-79.9.
  - `FAIL` = cualquier gate FAIL, P0/P1 presente, o score < 75.
- Precedencia: P0/P1 → gates → score.

## Sección histórica — valores obsoletos (NO operativos en esta rúbrica)

- player speed 6.0 → **8.5**
- checkpoint health 75 → **100**
- boss health 360 obligatorio → **540** (provisional vs duración)
- global active-hostile cap 6 → **NO EXISTE** (budgets locales: A 2/2+2/2, B 5/5, P2 2/3)
- exact checkpoint RNG rewind → **posición actual del stream**
- Harrier 40/20/lunge → **Scrapper 30/42, contacto 6/7, sin lunge**
- Ward 60/15/floor line 0.75 → **Sentry 44/56, bolt 5/6, apertura 0.32 s**
- score 01B 70/100 → no comparable

Estos valores solo existen aquí como registro histórico; ninguna probe, gate o ítem los usa.
