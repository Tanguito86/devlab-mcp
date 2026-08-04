# 14 — Registro de riesgos — DEVLAB-TOPDOWN-SHOOTER-KIT-07

| ID | Riesgo | Prob. | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| R-01 | Extraer la IA actual del boss (ciclo temporal) en vez del framework FSM | media | ALTO: el kit heredaría el bug AR-03 (vulnerabilidad por reloj) | Prohibido explícito: REWRITE_BEFORE_EXTRACTION; extraer SOLO tras 06B validado | Hermes (diseño) + Codex (06B) |
| R-02 | Extraer la activación sin floor (AR-01) | media | ALTO: el kit heredaría el bug del último cuarto | Extraer tras 06B con el floor validado; probe AF-02/03 en el test del kit | Hermes |
| R-03 | El encounter director genérico se vuelve un juego disfrazado (acoplamiento de defs) | media | MEDIO: DevLab = framework, no contenido | Regla de límites (07-límites); defs de contenido SOLO en consumidores; review de PR del kit | Hermes (crítico) |
| R-04 | La extracción del pooling cambia el hot path (rendering) | baja | MEDIO: micro-diferencias de timing visual | QA-06 determinismo por hash en cada paso; bot runs; capturas pre/post | Hermes |
| R-05 | 06B introduce regresiones que invalidan el diseño (FSM/hatches distintos de lo contratado) | media | MEDIO: el kit se diseñaría contra un contrato que no se implementó | Regla de prioridad: 01C primero; el kit se ajusta con los hallazgos finales (NEXT del sprint) | Hermes |
| R-06 | Duplicación de handlers al mover lifecycle (regresión del hallazgo 01B resuelto) | baja | ALTO: restart con dobles loops/listeners | QA-08/09/10 (LISTENER/LOOP/AUDIO_DUPLICATION) en el kit + capture metrics | Hermes |
| R-07 | El checkpoint provider serializa estado transitorio (fuga de floors/colas) | media | ALTO: restore corrupto | Contrato type-level (pendingFloor: never); probes AF-06/SH-06; QA-04 | Hermes |
| R-08 | El kit crece en abstracciones innecesarias (sobre-ingeniería) | media | MEDIO: kits que nadie consume | Principio: servir primero a juegos arcade pequeños; 1 paquete; interfaces mínimas; review de consumo | Hermes |
| R-09 | Dependencia de Three en el núcleo del kit | baja | MEDIO: acopla sim a render | Regla: núcleo sin Three (snapshots numéricos); render adapter en consumidor | Hermes |
| R-10 | Migración rompe la reproducibilidad de capturas (byte-equivalencia) | media | ALTO: pierde el contrato de capturas DevLab | Paso 7 del plan: validación pre/post por estado; rollback individual por paso | Hermes |
| R-11 | El sprint de diseño queda obsoleto por cambios de 06B no previstos | media | MEDIO: diseño desalineado | Suspender/reanudar según regla de prioridad; ajustar con hallazgos de 01C antes de autorizar KIT-07 | Hermes |
| R-12 | Interferencia con Codex durante 06B (lectura de código nuevo a mitad de análisis) | baja | BAJO | Regla: registrar cambio de baseline, no leer código nuevo hasta finalizar/suspender | Hermes |
| R-13 | Audio rebuild tras device-loss (context muerto) | baja | MEDIO: sin audio post-recovery | Verificar en el device-loss report de 06B; contrato de lifecycle contempla re-unlock | Codex (report) + Hermes |
| R-14 | El bot runner genérico no cubre objetivos complejos (multi-objetivo) | media | BAJO | BotObjectiveAdapter declarativo; extender por adapter por juego | Hermes |

## Top 5 (orden de atención)

1. **R-01** (boss FSM: extraer framework, no la IA obsoleta)
2. **R-02** (activación: extraer con floor, no sin él)
3. **R-07** (checkpoint: nunca serializar transitorios)
4. **R-10** (byte-equivalencia de capturas pre/post migración)
5. **R-05** (diseño condicionado a la validación de 06B/01C)
