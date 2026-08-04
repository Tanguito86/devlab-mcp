# Adversarial Plan v2 — OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C

15 casos × 3 repeticiones = 45 corridas. Resultado esperado: **45/45 PASS**. Cada caso define cómo inducirlo, la expectativa del contrato v2 y el criterio PASS/FAIL. Ejecución posterior (solo tras CORRECTION_BUILD_READY_FOR_REVIEW), read-only, input por capa pública; instrumentación de captura solo con el harness del builder.

| # | Caso | Cómo inducirlo | Expectativa (contrato v2) | PASS | FAIL → severidad |
|---|---|---|---|---|---|
| AV-01 | Relay floor 89% → soltar | hold hasta ~0.89, soltar, muestrear 2.2s | drena solo hasta 75%, nunca menos; no auto-completa | min >= 0.75 | P1 (gate SOFTLOCKS) — probe AF-03 |
| AV-02 | Restart durante activación | armar al 60%, restart (R) a mitad | restart limpia progreso y floor flag; sin residuos | activation 0, sin floor | P1 (gate RESTART_SUCCESS) — probe AF-05 |
| AV-03 | Pausa durante activación | pausar al 60% de activación, esperar, resume | sin progreso ni decay durante pause; resume desde el mismo valor | activation idéntica | P1 (gate PAUSE_RESUME) — probe AF-04 |
| AV-04 | Node 01 antes de onboarding | hold E en el ring con node bloqueado (antes de matar los 2 Scrappers) | node no acepta activación; activation 0 | 0 progreso | P1 (gate SOFTLOCKS) — probe E1-02 |
| AV-05 | Scrapper fuera de arena | kite un Scrapper al borde del arena | sin softlock; el encuentro sigue completable; sin disparos desde fuera; budget/cola lo absorben | encounter completable | P1 (brief v2 #2) — probe E1-06 |
| AV-06 | Spawn durante pausa | pausar durante HATCH_TELEGRAPH, esperar 1s | lifecycle congelado: sin commits ni avance de telegraph | sin commits en pause | P1 (gate PAUSE_RESUME) — probe SH-08 |
| AV-07 | Restart durante hatch | restart en pleno HATCH_TELEGRAPH (o con cola llena) | hatch/timer/cola limpiados; sin commits post-restart | 0 residuos | P1 (gate RESTART_SUCCESS) — probe SH-05 |
| AV-08 | Checkpoint durante cola | morir con cola pendiente en relay B, retry checkpoint | restore sin residuos de cola/hatch/proyectiles; estado contractual exacto | 0 residuos | P1 (gate CHECKPOINT_RESTORE) — probe SH-06 |
| AV-09 | Boss transition + damage | dañar al boss justo en la transición 1→2 (o recibir daño en el tick de transición) | transición explícita entre FSM completadas; sin doble transición; sin daño sin telegraph | DOUBLE_PHASE_TRANSITION = 0 | P1 — probe BF-07 |
| AV-10 | Boss vulnerable tras ataque | registrar aperturas de vulnerabilidad en toda la pelea | toda apertura sigue a un ataque completado (RECOVERY); nunca reloj global | VULNERABILITY_CAUSED_BY_ATTACK PASS | P1 — probe BF-05 |
| AV-11 | Victoria y derrota simultáneas | último hit al boss y último daño al jugador en el mismo frame (instrumentación frozen si el harness lo permite; si no, análisis de orden determinista del fixed-step) | desempate determinista del fixed-step 60Hz; un solo terminal; sin estado inválido | 1 terminal, sin corrupción | P1 (ledger F5/F6) |
| AV-12 | Pointer cancel | cancelar el toque del joystick a mitad de movimiento (pointercancel) | joystick no queda pegado; jugador se detiene; sin drift | vel ≈ 0 tras cancel | P1 (gate TOUCH_MAIN_PATH) |
| AV-13 | Multitouch | mover con un dedo + pulsar con el otro (y hold de activación + disparo) | ambos inputs conviven; sin cancelación cruzada; intención activation/pulse inequívoca | sin conflicto; sin acción accidental | P1 (gate TOUCH_MAIN_PATH) |
| AV-14 | Resize durante combate | cambiar portrait↔desktop a mitad de relay B (CDP Emulation) | layout/cámara cambian; la sim NO cambia (hash idéntico); sin glitches de input | sim inalterada | P2 (ledger G6) |
| AV-15 | Device loss durante Overload | perder el device GPU a mitad de fase 2 (surface de test del builder) | la sim sobrevive; al restaurar device se re-renderiza; la partida continúa o muere con mensaje claro; NUNCA estado corrupto silencioso | recoveryCount ≥ 1, estado coherente | P1 (ledger F4/G; contrato device-loss) |

## Reglas de ejecución

- 3 corridas por caso; PASS exige 3/3.
- Un softlock real (estado sin salida) = P0 con reproducción mínima.
- Los casos AV-06, AV-07, AV-08 requieren observar el lifecycle de hatch: si la build no expone el estado de hatch en el snapshot público, se verifica por comportamiento observable (timing de spawn + telegraph visual en capturas) y por los unit tests del builder; se documenta el método en los resultados.
- AV-11: si no es inducible con la capa pública, se verifica el orden determinista del fixed-step y se registra como PASS por determinismo con justificación (nunca NOT_APPLICABLE sin justificación).
- AV-15 depende de la infraestructura WebGPU (la build la tiene: captureTestSurface.destroyDevice). Si la build corregida no la expone, NOT_APPLICABLE con justificación.

## Resultado esperado

```text
45/45 PASS
P0: 0
P1: 0
```

Registrar en `adversarial-results-v2.md` al ejecutar (mismo formato que v1: tabla + repro + evidencia).
