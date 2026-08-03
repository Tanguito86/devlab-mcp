# OPS-WEBGPU-TSL-INTAKE-01 — API audit (F3-F4)

Baseline: `three@0.185.1` (instalado localmente, exports verificados por
imports reales — no por memoria). Familia de referencia r183+.

## Inventario (F3)

24 archivos; 23 en allowlist. Bloques de código: ~100 (docs 7 + REFERENCE +
SKILL + examples 5 + templates 2 + rules 5). Ningún comando shell, ningún
acceso a red, ningún acceso a almacenamiento fuera de `localStorage` en un
ejemplo de device-loss (patrón de app, no de skill). Import patterns:
`three/webgpu`, `three/tsl`, `three/addons/controls/OrbitControls.js`,
`three/addons/tsl/display/BloomNode.js` — correctos para r183+.

## Verificación de exports (0.185.1)

**114 APIs referenciadas verificadas PRESENTES** (THREE.WebGPURenderer,
RenderPipeline, node materials; TSL: Fn/If/Loop/select/uniform/float/vec*/color/
time/oscSine/instancedArray/attributeArray/instanceIndex/hash/pass/screenUV/
wgslFn/TWO_PI/posiciones/normales/cámaras; addons: bloom/gaussianBlur/fxaa/
smaa/dof/ssr/OrbitControls). `PI2` y `transformedNormalView` siguen presentes
(deprecados — las notas r178+ de la skill son correctas).

**2 imports de addon ROTOS en 0.185.1** (paths inexistentes, verificados
contra el árbol real de examples/jsm):

| Skill usa | Real en 0.185.1 | Estado |
|---|---|---|
| `three/addons/tsl/display/MotionBlurNode.js` | `.../display/MotionBlur.js` (export `motionBlur`) | **BROKEN** |
| `three/addons/tsl/display/AmbientOcclusionNode.js` | `.../display/GTAONode.js` (export `ao`) | **BROKEN** |

(El export nombrado existe en ambos casos — solo el PATH del archivo cambió.)

## Clasificación de bloques

- **PASS**: ~90% — TSL core (Fn, If, select, assign/toVar, element), compute
  (instancedArray, instanceIndex, renderer.compute), RenderPipeline
  (pass/getTextureNode/outputNode), wgslFn, límites (requiredLimits),
  notas de versión r177/r178/r180/r181/r183 (precisas y correctas).
- **BROKEN (2)**: los imports de addon rotos (post-processing.md).
- **MISLEADING (1)**: `basic-setup.js` mezcla `positionLocal` (espacio modelo)
  con `normalWorld` (espacio mundo) en `positionNode` → desplazamiento
  incoherente bajo rotación. Contraste interno: `custom-material.js` y
  `docs/materials.md` usan `positionLocal + normalLocal` (correcto).
- **VERSION_BOUND (3)**: `devicePixelRatio` sin límite en 3 examples
  (los 2 templates SÍ limitan a 2 — inconsistencia interna); `render()`
  sin `await` en loops (r183+ render es async); compatibilidad declarada
  "r171+" en README/REFERENCE contra APIs ajustadas a r183+.
- **PRIVATE_API_DEPENDENCY (1)**: `renderer.backend.device` (REFERENCE.md,
  device-loss.md, examples de testing) — no existe API pública en 0.185.1
  para lost/destroy; debe marcarse VERSION_PINNED/NOT_GENERALIZED.
- **PERFORMANCE_RISK (1)**: `particle-system.js` con 100.000 esferas
  (SphereGeometry 8×8 ≈ 12.8M triángulos) — el ejemplo oficial usa Points.
  También en docs/compute-shaders.md (count=100000).

## Hallazgos iniciales re-chequeados (8/8)

1. positionLocal+normalWorld → **CONFIRMADO (MISLEADING)**
2. devicePixelRatio sin límite → **CONFIRMADO** (3 examples; templates OK)
3. 100k esferas costosas → **CONFIRMADO** (examples + docs)
4. renderer.backend.device → **CONFIRMADO (PRIVATE_API_DEPENDENCY)**
5. r171+ vs r183+ → **CONFIRMADO (INCOHERENTE)**
6. RenderPipeline version-dependent → **CONFIRMADO con matiz**: la skill
   documenta los renombres correctamente, pero 2 paths de addon rotos
7. Ejemplos derivados de Three.js sin LICENSE → **CONFIRMADO**
8. Recovery que puede duplicar DOM → **CONFIRMADO**: el patrón
   `initWebGPU()` recursivo del doc hace `appendChild(domElement)` en cada
   init; `renderer.dispose()` no remueve el canvas → canvas duplicado.
   (El fixture propio device-loss evita esto reutilizando el canvas.)

## Hallazgo NUEVO (runtime, F7)

**Chrome 150/Edge 151 desactivan WebGPU bajo depuración remota (CDP)** —
la skill declara "Chrome 113+, Edge 113+" sin mencionar que la
automatización (Playwright/CDP, el mecanismo del capture harness) no puede
acceder a WebGPU en los navegadores actuales. 20+ combinaciones probadas
(150, 151, bundled 148, Chrome 131 CfT; perfiles limpios y del usuario;
swiftshader/GPU real; in-process-gpu; sin no-startup-window). WebGPU
funciona solo sin CDP (dump-dom): `gpu: object`, adapter NVIDIA turing.

## Veredicto de auditoría

Documentación mayormente de ALTA calidad (notas de versión precisas,
patrones TSL correctos). Bloqueantes de adopción directa: 2 imports rotos,
1 patrón MISLEADING, dependencia privada del device, y la restricción CDP
que impide la verificación automatizada en navegadores actuales.
