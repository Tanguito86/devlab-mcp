# 06 — Contrato de simulación e input — DEVLAB-TOPDOWN-SHOOTER-KIT-07

## Simulación (heredado de core/fixed-step.ts + random.ts, validado por tests y crítica)

| Cláusula | Valor | Fuente validada |
|---|---|---|
| fixed timestep configurable | `stepSeconds` (default 1/60); `maxCatchUpSteps` (default 8) | fixed-step.ts + contratos v2 |
| accumulator acotado | máx `stepSeconds * maxCatchUpSteps`; exceso → `droppedSeconds` contabilizado | fixed-step.ts advance() |
| render interpolation | `alpha = accumulator / stepSeconds`; render entre los 2 últimos estados | fixed-step.ts + engine.ts |
| pause exacta | pause() congela; freezeAt(ms) fija tiempo exacto; resume() sin paso extra | fixed-step.ts + test "pause edge-triggered" |
| determinismo | seed entero normalizado (>>>0); Mulberry32; `range(min, max)`; sin Math.random en runtime | random.ts + test bit-for-bit + scaffold test "no ambient random" |
| validaciones | stepSeconds finito positivo; delta finito ≥0; maxCatchUp entero ≥1 | fixed-step.ts constructor/advance |
| límite de catch-up | un frame de 60Hz con delta gigante NO produce espiral de muerte | fixed-step.ts (clamp + drop contabilizado) |

**Invariante del kit**: `simulationSeconds` solo avanza dentro de `advance()`; ningún módulo externo escribe el tiempo de sim.

## Input (heredado de input.ts, con la corrección v2 de intención)

| Cláusula | Valor | Fuente validada |
|---|---|---|
| desktop | WASD/flechas mover; mouse aim; click/Space fire; E interact/activate; Enter/R primary; Esc/P pause | input.ts (crítica 01B en vivo) |
| mouse aiming | pointermove en canvas → aimScreenX/Y normalizado (-1..1) | input.ts updatePointer |
| touch joystick | movePad pointerdown/move/up/cancel; radio ~37% del pad; 1:1; sin drift (vel≈0 al soltar) | input.ts updateTouchMove (crítica 01B) |
| touch action | FIRE en pointerdown (no release); **ACTIVATE separado (v2: intención inequívoca)** | input.ts + brief v2 #5 (AR-09) |
| pointer cancel | pointercancel limpia joystick y FIRE; sin input pegado | input.ts (117, 134-141) |
| multi-touch | pointerIds independientes por control; mover+fire+activate simultáneos sin cancelación cruzada | input.ts (crítica 01B parcial; checklist v2) |
| gamepad futuro | interfaz `InputSource` definida; implementación NO obligatoria en el kit v1 | 15-extension-points.md |
| blur/window | blur limpia teclas y touch (evita teclas pegadas fuera de foco) | input.ts (98-103) |
| preventDefault | flechas/space/contextmenu/controles táctiles (evita scroll/zoom fantasma) | input.ts (88-91, 118, 128, 146) |

**Contrato de capa**: el bot y el recorrido humano consumen la MISMA capa pública (InputSnapshot); no existen hooks internos para saltar el flujo.

**Output normalizado**: `InputSnapshot {moveX, moveZ, aimX, aimZ (mundo), attack, activate, start, restart, pause}` — los adapters (keyboard/touch) producen el snapshot; `screenToWorld` es parte del adapter de cámara del consumidor.
