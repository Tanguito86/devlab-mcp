# 11 — Contrato de lifecycle y device-loss — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Heredado de core-loop-contract.md v2 (Restart mission is distinct; PAUSED; Determinism and presentation) + engine.ts (recoverDevice) + webgpu-device.ts (WebGpuDeviceHost) + resource-owner.ts.

## GameLifecycle — máquina

```text
start ─► running ─► pause ─► running
  │         │          └── resume sin paso extra
  │         ├── restart ─► running (estado limpio, seed original, SIN rebind)
  │         ├── restore ─► running (checkpoint contractual)
  │         └── dispose ─► closed (idempotente, LIFO)
device-loss: running ─► (GPU rebuild) ─► running (sim intacta)
```

| Transición | Regla | Verificación (build actual) |
|---|---|---|
| start | primer arranque; world rebuild seed; sin input duplicado | title→start (crítica 01B) |
| pause | edge-triggered; congela fixed-step/enemigos/proyectiles/timers/audio; overlay visible | tick 608→608 (crítica 01B) + test |
| resume | vuelve al estado previo; SIN paso extra de simulación | 60Hz post-resume (crítica 01B) |
| restart | seed 424242, HP 100, relays off, activation 0, floors clear, colas vacías, pools clear; SIN rebind de input/audio/rAF/resize handlers | 10/10 bot + 60.86Hz (crítica 01B) |
| restore | checkpoint exacto (ver 09) | 10/10 bot + en vivo |
| dispose | idempotente; LIFO; AggregateError si falla; cierra audio/GPU/renderer | resource-owner.test |
| device-loss | GPU generación +1; sim NO se toca; re-render; recoveryCount++ | destroyDevice → RECOVERED (crítica 01B en vivo) |

## Contrato de no-duplicación (QA)

El lifecycle garantiza, mediblemente:

| Métrica | Regla | Instrumento |
|---|---|---|
| activeLoopCount | 1 (jamás 2 tras restart/pause/resume) | capture metrics |
| inputListenerCount | estable entre restarts | capture metrics |
| audioVoiceCount | sin voces huérfanas; sin cues en pause | capture metrics + cue-bus |
| resize handlers | 1 registro; sin acumulación | ResourceOwner + conteo |
| rAF | 1 loop; scheduleFrame guard | engine + crítica 01B (60.86Hz) |

## Device-loss — contrato

1. **Fail-closed**: el host rechaza adapters de software (SwiftShader/llvmpipe/etc.) — "NATIVE WEBGPU // RTX HARDWARE REQUIRED".
2. **Pérdida**: `device.lost` → onLoss (reason/message/generation/controlled).
3. **Recuperación**: stopLoop → disposeGpuGeneration → createGpuGeneration (+1) → resize → syncPresentation → renderFrame → startLoop; sim y estado de juego INTACTOS.
4. **Estado**: lostObserved, recoveryCount, recoveryInProgress observables (test surface).
5. **Nunca**: estado corrupto silencioso; la partida continúa o muere con mensaje claro.
6. **destroyForTest** permite inducir pérdida controlada (probes AV-15, device-loss por fase del boss).

## Ownership del GPU (planos separados)

| Plano | Contenido | Device-loss |
|---|---|---|
| Simulación (kit + consumidor) | estado, pools, RNG, director, boss | NO se entera |
| GPU (kit gpu/) | device, renderer, visuales, overlay | rebuild generación |
| Input/audio | handlers, context | intactos (audio puede requerir re-unlock tras rebuild si el contexto murió — verificar en 06B report) |

## Test surface (loopback only)

`__DEVLAB_CAPTURE_TEST__`: destroyDevice, lostObserved, recoveryCount, recoveryInProgress, startLoop, stopLoop, sessionId — SOLO en localhost (contrato de seguridad de main.ts).

## Gates de QA asociados

- RESTART_SUCCESS · CHECKPOINT_RESTORE · PAUSE_RESUME (rúbrica v2)
- QA: LISTENER_DUPLICATION · LOOP_DUPLICATION · AUDIO_DUPLICATION · DEVICE_LOSS_RECOVERY (12-qa-contracts.md)
