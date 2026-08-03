# OPS-WEBGPU-TSL-INTAKE-01 — compute / postprocessing / device-loss reviews

## compute-review.md

### Skill (docs/compute-shaders.md + examples/particle-system.js)

- **Aciertos (PASS)**: distinción assign vs reasignación JS (`toVar`,
  `select`, `element.assign` dentro de `If`) — la sección más valiosa de la
  skill; `instancedArray`/`attributeArray`/`instanceIndex` correctos;
  `renderer.compute()` síncrono tras init correcto; workgroup size
  parametrizable `.compute(count, [64])` correcto; límites de storage
  buffers documentados con valores reales (256 MiB / 128 MiB / 8 buffers).
- **Riesgo (PERFORMANCE_RISK)**: `PARTICLE_COUNT = 100000` con
  `SphereGeometry(0.08, 8, 8)` ≈ 12.8M triángulos instanciados. El ejemplo
  oficial de three usa Points + icosaedro de bajo detalle.
- **Sincronización**: el patrón del doc (compute por frame en el loop) es
  correcto; no documenta la espera de finalización para lecturas CPU
  (mapAsync) — ausencia, no error.

### Fixture propio (threejs-webgpu-compute, NO VERIFICADO)

- 16.384 partículas (presupuesto razonable), PointsNodeMaterial (no esferas).
- Estado inicial determinista por seed (mulberry32 en CPU → storage buffer),
  física por pasos fijos de 20 ms (gravedad, rebote, paredes), tiempo
  congelado → `steps = timeMs / 20`, `renderer.compute` por paso.
- Métricas: particles, bufferBytes (positions+velocities), stepsRun.
- Sensibilidad: seed distinto → layout inicial distinto (aislable).

## postprocessing-review.md

### Skill (docs/post-processing.md + examples/post-processing.js)

- **Aciertos (PASS)**: RenderPipeline r183+ correcto (`pass`, `getTextureNode('output')`,
  `outputNode`); bloom con threshold/strength/radius; notas de versión
  precisas (r177 sigma rescale, r180 resolutionScale, r181 DOF
  reimplementado, r183 PostProcessing→RenderPipeline); orden de efectos
  (bloom → grading → vignette) coherente.
- **BROKEN (2)**: imports `MotionBlurNode.js` y `AmbientOcclusionNode.js`
  inexistentes en 0.185.1 (ver api-audit).
- **Ausencia**: no documenta tone mapping/color space del pipeline (el
  OutputPass-equivalente en RenderPipeline es automático en r183+) —
  ausencia menor.

### Fixture propio (threejs-webgpu-post, NO VERIFICADO)

- RenderPipeline + pass + bloom (addon) + saturation/tint + vignette (Fn).
- Variante `bloom-off`: exactamente UN parámetro (bloomEnabled) — A/B sin
  reconstrucción de escena ni simulación distinta (tiempo congelado).
- 5 viewpoints (overview, bloom, grading, vignette, composite).

## device-loss-review.md

### Skill (docs/device-loss.md + REFERENCE.md)

- **Aciertos (PASS)**: concepto de lost promise correcto (no await directo),
  reasons destroyed/unknown, adapter consumido/expired, about:gpucrash con
  escalamiento de restricciones, límites de destroy() (unmap inmediato,
  recuperación siempre posible vs pérdida real).
- **PRIVATE_API_DEPENDENCY**: todo el acceso al device es vía
  `renderer.backend.device` — no hay API pública en three 0.185.1.
- **Riesgo de duplicación (hallazgo 8)**: el patrón de recovery del doc
  re-appendea `renderer.domElement` en cada `initWebGPU()` (dispose no
  remueve el canvas) → canvases duplicados; si el app usara setAnimationLoop,
  también loops duplicados.

### Fixture propio (threejs-webgpu-device-loss, NO VERIFICADO)

- PRIVATE_API_DEPENDENCY declarada (VERSION_PINNED / NOT GENERALIZED).
- Recovery: dispose + re-init sobre el MISMO canvas (0 canvases duplicados),
  render explícito (0 loops), handler lost registrado por device (0
  listeners duplicados), contador de recovery en métricas.
- Cobertura: INITIAL_RENDER, LOSS_OBSERVED, REINITIALIZATION,
  CAPTURE_AFTER_RECOVERY — pendientes de ejecución runtime.
