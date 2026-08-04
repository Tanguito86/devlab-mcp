# 10 — Contrato de Boss FSM — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Heredado de encounter-plan.md v2 (Relay Guardian FSM) + corrección 06B #3. La implementación actual (ciclo temporal 3.1/4.8s + refuerzos infinitos) es OBSOLETA — el kit extrae el FRAMEWORK de estados, no la IA actual.

## Estados explícitos

```text
INTRO -> TELEGRAPH -> COMMITTED_ATTACK -> RECOVERY -> VULNERABLE -> TELEGRAPH (loop por fase)
   └───────────────────────────── TRANSITION (fase 1 -> 2) ────────────────────────┘
   └──────────────────────────────── DEFEATED ─────────────────────────────────────┘
```

| Estado | Semántica | Regla |
|---|---|---|
| INTRO | boss spawnea (HP 540), sin ataque activo | estado inicial; metrics reset |
| TELEGRAPH | señal del patrón entrante (aviso previo) | precede SIEMPRE al daño; visible ≥ umbral del patrón |
| COMMITTED_ATTACK | el patrón produce daño/proyectiles | solo tras TELEGRAPH; el patrón comprometido se ejecuta completo |
| RECOVERY | fin del patrón; sin daño activo | comienza solo tras terminar de producir daño |
| VULNERABLE | weak point abierto | SOLO como consecuencia del ataque completado (nunca reloj global) |
| TRANSITION | evento explícito entre FSM completadas | 1 solo evento; DOUBLE_PHASE_TRANSITION prohibido |
| DEFEATED | HP 0; ataques cancelados; evac unlock | limpieza de proyectiles; control del jugador preservado |

## Reglas de transición (guards)

1. `TELEGRAPH → COMMITTED_ATTACK`: guard = duración del telegraph cumplida (el aviso se lee completo).
2. `COMMITTED_ATTACK → RECOVERY`: guard = el patrón terminó de producir daño.
3. `RECOVERY → VULNERABLE`: guard = recovery completo; VULNERABLE se abre por causalidad del ataque.
4. `VULNERABLE → TELEGRAPH`: guard = ventana consumida (duración o hits).
5. `TRANSITION`: solo entre FSM completadas (estado VULNERABLE o RECOVERY de la fase 1), 1 sola vez; resetea patrones de fase.
6. Prohibido: apertura de VULNERABLE sin ataque previo; estados perpetuos (PermanentInvulnerability=0); armor locks por tiempo.

## Contrato de fase (config del consumidor)

```ts
interface BossPhaseDef {
  id: "calibration" | "overload";
  patterns: PatternDef[];                    // dirigido, sweep (con safe zone), fan (con gaps)
  telegraph: { minSeconds: number; channels: number }; // >= 0.65s, 2+ canales (visuales)
  safeZone: (world) => ZoneDef | null;       // fase 1: zona segura real alcanzable
  fan: { gaps: { stable: boolean; reachable: boolean } }; // fase 2: huecos estables
  reinforcements: { maxSimultaneous: number; maxRequests: number }; // P1: 0/0; P2: 2/3
  budgetSeconds: number;                     // <= 55s sin cambio de patrón
}
```

## Patrones del contrato v2 (corrección 06B #3)

| Patrón | Fase | Requisito |
|---|---|---|
| directed attack | 1 | aviso distinto; daño evadible |
| sweep | 1 | legible con aviso previo; zona segura alcanzable (daño en zona = 0) |
| fan | 2 | huecos estables, reconocibles y alcanzables desde la posición telegrafiada; NUNCA anillo radial cerrado sin gaps |

## Métricas obligatorias (BossMetrics)

```text
phase_time (por fase), attacks_executed, windows_opened,
damage_during_telegraph (debe ser 0), damage_in_safe_zone (debe ser 0),
boss_total_duration (70-100s), mission_total (3-5 min)
```

El HP (540) se mantiene salvo que métricas repetibles fallen el presupuesto (brief v2 #3).

## Gates de QA asociados

- BOSS_HP: 540 · VULNERABILITY_CAUSED_BY_ATTACK: PASS · CLOSED_RADIAL_RING_WITHOUT_GAPS: 0 · PERMANENT_INVULNERABILITY: 0 · DOUBLE_PHASE_TRANSITION: 0
- Probes BF-01…BF-10 (paquete crítico v2).
