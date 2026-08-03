# OPS-WEBGPU-TSL-INTAKE-01 — runtime fixtures, determinism, performance

## runtime-fixtures.md (F5-F6)

Cuatro fixtures escritos en `packages/browser-dev-mcp/capture-fixtures/`
(siguiendo la convención real del arnés — el sprint sugería packages/visual,
pero los fixtures del harness viven en browser-dev-mcp/capture-fixtures):

```text
threejs-webgpu-basic/        WebGPURenderer + TSL material + desplazamiento
                             coherente (positionLocal+normalLocal), DPR<=2,
                             setAnimationLoop, resize, render target, 5 viewpoints
threejs-webgpu-compute/      16384 partículas, seed determinista, física por
                             pasos fijos, PointsNodeMaterial, métricas de buffers
threejs-webgpu-post/         RenderPipeline + bloom + grading + vignette,
                             variante bloom-off (1 parámetro), 5 viewpoints
threejs-webgpu-device-loss/  loss/recovery sobre el MISMO canvas, 0 duplicados,
                             PRIVATE_API_DEPENDENCY declarada
```

Todos exponen el contrato completo (ready/setSeed/setTime/setViewpoint/
renderOnce/getMetrics) + `window.__DEVLAB_FRAME__` (lector de frame WebGPU:
drawImage → canvas 2d → PNG+RGBA, en el mismo task tras el render await —
la sincronización se apoya en `await renderer.render()`, API pública; no se
usa ninguna API interna para la captura).

**Extensión del harness**: `capturePageFrame` acepta `__DEVLAB_FRAME__`
como proveedor opcional (camino WebGL intacto; el contrato no cambia).
Vendor ampliado con `three.webgpu.js`, `three.webgpu.nodes.js`, `three.tsl.js`
(resueltos desde el package de three).

**ESTADO: ESCRITOS, NO VERIFICADOS** (ver webgpu-environment.md — WebGPU no
accesible vía CDP en este entorno).

## determinism-review.md

**NO EJECUTADO.** El gate DETERMINISM_SAME_BACKEND no puede demostrarse sin
un backend WebGPU accesible. Se documenta el diseño previsto (2 corridas
run-a/run-b por fixture, PNG/RGBA byte-idénticos, metadata normalizada,
VIEWPOINT_ORDER, FILE_SET idéntico, cambio controlado por seed/time con
aislamiento por layers) — el fixture basic ya implementa el aislamiento
(anillo instanciado en layer 1) replicando el patrón validado del arnés
WebGL. Sin promesas de determinismo entre GPUs/drivers/backends.

## performance-review.md

**NO EJECUTADO.** Mismas razones. Métricas previstas: CPU_SUBMIT_P50/P95,
SYNCHRONIZED_COMPLETION_P50/P95 (vía espera del frame presentado),
FPS_ESTIMATE, DRAW_CALLS, TRIANGLES, INSTANCES, BUFFER_BYTES, TEXTURE_COUNT.
Sin etiquetado GPU_TIME sin timestamp queries válidas. Gates de higiene
(no unbounded growth, no leaks tras restart, no pipelines duplicados tras
recovery, no console errors) definidos para los fixtures.

## Seguridad (F10) — estática, completada

```text
EXTERNAL_NETWORK_REQUESTS: 0   (fixtures sin fetch; el server bloquea todo no-local)
CDN_IMPORTS: 0                 (importmap local /vendor/)
EVAL: 0 · NEW_FUNCTION: 0
REMOTE_WGSL: 0                 (wgslFn solo en la skill auditada, no en fixtures)
REMOTE_MODELS: 0
PATH_ESCAPE: 0                 (validado por el harness: tags + vendor)
ARBITRARY_URLS: 0
```

El servidor del arnés permanece en 127.0.0.1, puerto efímero, sin directory
listing, red externa bloqueada por route abort.
