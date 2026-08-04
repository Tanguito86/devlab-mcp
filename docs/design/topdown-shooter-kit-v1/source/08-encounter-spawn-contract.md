# 08 — Contrato de encounters y spawning — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Heredado de encounter-plan.md v2 (budgets locales, lifecycle de hatches, onboarding) + la corrección 06B. La build actual (waves por tiempo sin cola ni hatches) NO es la base — el contrato v2 SÍ.

## EncounterDirector — cláusulas

| Cláusula | Regla | Fuente |
|---|---|---|
| entry conditions | fase entra cuando su condición se cumple (ej. "jugador entra al yard") | encounter-plan v2 (RELAY_A entry) |
| beats | secuencia declarativa [condición → acciones] (ej. onboarding → activación → response) | encounter-plan v2 |
| local budgets | activos máx + cola máx por encuentro (A 2/2 + 2/2; B 5/5; P2 2/3) | encounter-plan v2 (tabla de budgets) |
| bounded queue | cola finita; request extra → defer o reject determinista; nunca crecimiento ilimitado | encounter-plan v2 + brief v2 #4 |
| success conditions | encuentro limpio = condición declarada (ej. sin enemigos activos + mínimos de fase) | sim updatePhaseLogic (patrón) |
| failure recovery | derrota pre-checkpoint → restart; post → checkpoint restore | core-loop v2 (Progress, defeat) |
| softlock recovery | enemigo perdido en borde NO traba el encuentro; el director sigue completable | brief v2 #2 + probes E1-06 |
| sin spawn en el jugador | commit solo en hatch válido fuera del radio del jugador; hatch inválido reintenta | encounter-plan v2 (lifecycle) |
| pacing | mínimos de fase configurable; NUNCA waits pasivas ni refuerzos infinitos | brief v2 #5 + rubric v2 PACING |

## SpawnDirector — lifecycle (contrato v2, corrección 06B)

```text
HATCH_IDLE -> HATCH_TELEGRAPH -> SPAWN_COMMIT -> ENEMY_ACTIVE
```

| Cláusula | Regla | Fuente |
|---|---|---|
| telegraph | duración ≥ 0.65s; usa forma/movimiento + color (2 canales); visible en portrait 390×844 | encounter-plan v2 + rubric v2 CLARIDAD |
| commit | nunca dentro del radio del jugador; hatch inválido queda en cola y reintenta en hatch válido; jamás coordenada cruda | encounter-plan v2 |
| estado observable | HatchState {IDLE, TELEGRAPH, COMMIT} + timer; legible para probes (SH-01/02) | paquete crítico v2 |
| cola | EncounterDirector cede requests; SpawnDirector los serializa; cola llena = defer/reject determinista | encounter-plan v2 |
| clear | restart y checkpoint limpian hatches/timers/colas (probes SH-05/06; gates RESTART/CHECKPOINT) | contrato v2 |
| pausa | lifecycle congelado durante pause (sin commits ni avance de telegraph) — probe SH-08 | core-loop v2 PAUSED |

## Budgets de referencia (Ash Relay v2 — config del consumidor, NO del kit)

| Encuentro | Activos | Cola | Composición |
|---|---|---|---|
| Relay A onboarding | 2 | 2 | 2 Cinder Scrappers normales (hatches opuestos) |
| Relay A response | 2 | 2 | 1 Scrapper + 1 Arc Sentry; sin refuerzos |
| Relay B | 5 | 5 | 3 Scrappers (con elites) + 2 Sentries; waves deterministas finitas |
| Guardian P1 | 0 | 0 | sin refuerzos |
| Guardian P2 | 2 | 3 | máx 3 requests totales, por hatches telegrafiados |

## Onboarding (contrato v2 — corrección 06B #2)

1. Node 01 comienza DESACTIVADO.
2. 2 Scrappers normales emergen por hatches opuestos (telegrafados).
3. Derrotar ambos → Node 01 habilitado.
4. Activación (floor 75%) → response acotada (1+1).
5. Sin refuerzos posteriores; Relay A < Relay B en presión (probe E1-04).
