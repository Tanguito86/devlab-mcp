# OPS-WEBGPU-TSL-INTAKE-01 — adoption scorecard (F12)

Puntajes 0-10 con evidencia de api-audit.md. Estados: ADAPT_FIRST /
ADAPT_AFTER_FIXES / REFERENCE_ONLY / REJECT.

| Dimensión | Puntaje | Evidencia |
|---|---|---|
| API_ACCURACY | 8 | 114/114 APIs presentes; 2 paths de addon rotos (BROKEN) |
| VERSION_COHERENCE | 6 | r171+ declarado vs APIs r183+; notas de versión precisas (r177-r183) |
| TSL_GUIDANCE | 9 | assign vs reassign, select, toVar, espacios — lo mejor de la skill |
| COMPUTE_GUIDANCE | 8 | Patrones correctos; presupuesto 100k esferas irreal |
| POSTPROCESSING_GUIDANCE | 7 | RenderPipeline correcto; 2 imports rotos |
| DEVICE_LOSS_GUIDANCE | 7 | Conceptos sólidos; backend.device privado; patrón de duplicación |
| PERFORMANCE_GUIDANCE | 6 | DPR sin límite en 3 examples; 100k esferas; sin métricas honestas |
| SECURITY | 9 | Sin red/exec; localStorage solo en ejemplo de app |
| RUNTIME_RESULTS | 10 | WebGPU/TSL/compute/RenderPipeline/device-loss verificados en NVIDIA/Turing |
| ADAPTATION_COST | 5 | Alta: reescribir examples, fix de paths, decidir política device |

## Estados por área

| Área | Estado |
|---|---|
| docs/core-concepts + materials (TSL) | **ADAPT_FIRST** (calidad alta, reescritura directa desde docs oficiales) |
| docs/compute-shaders (guía) | **ADAPT_FIRST** (con presupuesto razonable) |
| docs/post-processing | **ADAPT_AFTER_FIXES** (2 paths rotos + verificación runtime) |
| docs/device-loss | **ADAPT_AFTER_FIXES** (API privada + patrón de recovery a corregir) |
| examples (5) + templates (2) | **REFERENCE_ONLY** (derivados de three sin LICENSE material; reescribir) |
| .cursor/rules (5) | **REFERENCE_ONLY** (shims de un ecosistema ajeno; referencias @skills no verificables en Cursor) |

## FUTURE_SKILL

```text
devlab-threejs-webgpu-tsl: DEFINED / NOT STARTED
```

Requisitos mínimos antes de su inicio:
1. Mantener el probe sobre origen loopback real y Chromium completo.
2. Preservar la regresión que rechaza `about:blank` y adapters software.
3. Política de device: API pública si aparece en three; si no, wrapper
   version-pinned documentado.
4. Presupuestos: partículas ≤ 16k por defecto, DPR ≤ 2, geometrías ligeras.
