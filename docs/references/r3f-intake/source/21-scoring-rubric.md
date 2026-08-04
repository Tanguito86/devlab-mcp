# 21 — Rúbrica de scoring para DEVLAB-R3F-ARCHITECTURE-AB-05

> Diseñada en OPS-R3F-INTAKE-01. No ejecutada.

## Escalas

Toda métrica cuantitativa se registra como valor crudo + percentil cuando aplique. Los scores subjetivos (humano) usan escala 1–10 con anclas escritas abajo. Un solo evaluador humano (José) para ambas piernas, en sesiones separadas sin conocer la identidad de la pierna cuando sea posible (doble ciego parcial para gameplay).

## Métricas cuantitativas

| Métrica | Unidad | Mejor | Umbral de regresión P0/P1 |
|---|---|---|---|
| time_to_first_playable | minutos | menor | — |
| total_implementation_time | horas | menor | — |
| files_changed / LOC | conteo | menor (mismo feature set) | — |
| component_count | conteo | — | — |
| react_commits (solo B) | commits/60s de juego | menor | — |
| cpu_frame_time | ms (media, p95, p99) | menor | +15% vs LEG_A = P1; +25% = P0 |
| gpu_frame_time | ms | menor | +15% = P1; +25% = P0 |
| draw_calls / triangles / textures | conteo | igual o menor | +20% = P1 |
| input_latency | ms (pointer→acción visible) | menor | +16ms = P1; +32ms = P0 |
| heap_growth | MB (60s idle) | menor | +20% = P1 |
| restart_growth | MB (10 restarts) | menor | crecimiento monotónico = P1 |
| device_loss_recovery | s hasta render correcto | menor | >5s o fallo = P0 |
| softlocks | conteo (bot 30 min) | 0 | 1 = P0 |
| bot_completion | % de la slice completada | 100% | <100% = P1 |
| mobile_correctness | % checks táctiles OK | 100% | <90% = P1 |
| frozen_determinism | frames idénticos / frames capturados | 100% | <100% = P0 |

## Scores humanos (1–10)

**Maintainability** (se puntúa leyendo el código as-built, sin ejecutar):
- 1–3: lógica de gameplay acoplada al render, sin separación sim/visual, duplicación, sin tests.
- 4–6: separación parcial, componentes razonables, deuda localizada.
- 7–8: separación clara sim/render, componentes reutilizables, convenciones consistentes.
- 9–10: arquitectura limpia, extensible, documentada, testable sin browser.

**Gameplay** (se puntúa jugando, mismo evaluador, mismo orden):
- 1–3: roto/injugable, controles frustrantes, feedback ausente.
- 4–6: jugable con fricción, feedback básico, pacing plano.
- 7–8: sólido, responsive, pacing bueno, variedad perceptible.
- 9–10: pulido, juicy, sin fricción perceptible.

## Regla de aceptación (del contrato)

```
PASS ⇔ (maintainability_B + production_B) >= (maintainability_A + production_A) × 1.10
      Y sin regresión P0/P1 en ninguna métrica de runtime/robustez
FAIL ⇔ de lo contrario
```

Donde production = (time_to_first_playable, total_time, LOC) combinados por ranking relativo (menor mejor), y P0/P1 según tabla de umbrales. Si alguna métrica no puede medirse en una pierna (p. ej. react_commits en LEG_A), se marca N/A y no participa del veredicto.

## Anti-reglas

- No se aceptan optimizaciones post-hoc de una pierna sin re-medir la otra (el benchmark mide "as-built").
- No se acepta "no overhead" ni "outperforms" como claim sin los números de este benchmark.
- Si LEG_B falla WebGPU runtime (device loss, TSL, compute), el veredicto es FAIL independiente del resto (WebGPU es requisito de producción para DevLab).
