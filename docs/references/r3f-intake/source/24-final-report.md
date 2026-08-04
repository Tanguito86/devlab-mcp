# 24 — Informe final OPS-R3F-INTAKE-01

## Estado

```text
OPS-R3F-INTAKE-01:
COMPLETED / READY_FOR_CODEX_REVIEW

SOURCE:     pmndrs/react-three-fiber
PIN:        0a107412ac64667b1908422e859447952f57feef
LICENSE:    MIT / VERIFIED
R3F:        HIGH_VALUE_ARCHITECTURE_CANDIDATE
WEBGPU_TSL: STATICALLY_SUPPORTED / RUNTIME_BENCHMARK_PENDING
INSTALLATION: NOT_PERFORMED
DEVLAB_INTEGRATION: NO
BENCHMARK:  DEVLAB-R3F-ARCHITECTURE-AB-05 — DESIGNED / NOT_EXECUTED
```

## Resumen ejecutivo

React Three Fiber 9.7.0 (pin `0a107412`, release del 2026-07-31) es un candidato serio como segunda vía de producción de DevLab, con condiciones claras:

1. **Arquitectura**: el reconciler es *lazy por diseño* — si la simulación muta three imperativamente (patrón shmup natural), el costo por frame del reconciler es ~0; el costo real vive en mount/unmount y reconstrucción por `args` (ev. 07). Los fixes 9.7.0 (prioridades de eventos estilo react-dom, microtasks, keyed reorders, pierced props, reconstrucción batch) cierran bugs de exactitud de estado que importan para escenas dinámicas.
2. **Determinismo**: `frameloop='never'` + `advance(timestamp)` da control total del reloj — la API determinista que el harness necesita (ev. 08). El fixed timestep, accumulator, pooling, ECS y seeded RNG siguen siendo 100% del usuario, pero R3F no los estorba.
3. **WebGPU/TSL**: estáticamente soportado (gl async + `await renderer.init()`, extend de three/webgpu, TSL node materials, demo oficial) — pero todo lo de runtime (device loss, TSL exec, compute, pipelines) es UNKNOWN_RUNTIME. **No se declara R3F_WEBGPU_RUNTIME_VERIFIED** (ev. 09).
4. **Device loss**: R3F no maneja NADA (cero refs a `device.lost`/`contextlost`); recovery = 100% userland; unmount fuerza `forceContextLoss` (no-op en WebGPU). DevLab debe implementar observación, recreación y re-upload (ev. 10).
5. **Recursos**: R3F dispone lo declarativo (diferido a idle); primitives/Scene/externos nunca. Cache de `useLoader` global y permanente (leak si no se limpia; salvavidas post-device-loss). Políticas propuestas en ev. 11 §8.
6. **Testing**: `@react-three/test-renderer` 9.1.1 da unit tests de scene graph sin navegador (snapshots sin uuids, `advanceFrames` determinístico) — separación clara: RTTR = contratos, harness DevLab = runtime/GPU/píxeles (ev. 14).
7. **Perf**: los claims del readme ("no overhead", "outperforms Threejs") son CLAIM DE DOCUMENTACIÓN sin benchmark propio — solo cuentan los números de DEVLAB-R3F-ARCHITECTURE-AB-05 (ev. 13).
8. **Gauntlet**: PASS_1 analyst (ev. 07-18) + PASS_2 critic con reinspección directa del source (ev. 25: 6/7 claims VERIFICADOS, 1 PARCIAL, ~50 citas re-chequeadas sin errores, 3 errores menores corregidos en 07/08/12/13) + PASS_3 integrator (este informe).

## Hallazgos principales por fase

| Fase | Hallazgo clave | Evidencia |
|---|---|---|
| Licencia | MIT Poimandres VERIFIED; assets del example (glTF samples Khronos/three.js) ENUMERATED_AS_UNRESOLVED, fuera del paquete npm | 04 |
| Inventario | fiber 9.7.0: peer react >=19 <19.3, three >=0.156; deps: zustand 5.0.3 (única dep dura de ecosistema), scheduler 0.27, its-fine, suspend-react; react-reconciler 0.33 solo devDep → transpilado al paquete | 05 |
| Scripts | postinstall = preconstruct dev + vite build (genera `packages/fiber/react-reconciler/` gitignored — **no es un parche de comportamiento**, solo CJS→ESM); paquete publicado sin lifecycle scripts → consumir npm, no el checkout | 06 |
| Reconciler | Lazy por diseño; snapshot de props reemplazado entero por update (O(props) por instancia por commit); reconstrucción batch en resetAfterCommit; disposal a idle; swapInteractivity | 07 |
| Loop | frameloop always/demand/never + invalidate + advance; subscribers por prioridad; store zustand = bus de invalidación; `never`+advance = reloj inyectable | 08 |
| WebGPU | STATICALLY_SUPPORTED (core) / UNKNOWN_RUNTIME (device loss, TSL exec, compute, sombras, XR); `state.gl` tipado WebGLRenderer (cast requerido); renderer inmutable por root | 09 |
| Device loss | UNSUPPORTED (0 refs); loop sordo; unmount: 500ms, forceContextLoss (no-op WebGPU), gl.dispose nunca; BUILT_IN solo loop global y prevención de duplicados | 10 |
| Recursos | Dispose automático de declarativos (idle); primitives/Scene/externos nunca; useLoader cache global permanente; hide ≠ unload (Suspense); políticas propuestas | 11 |
| Eventos | Raycast solo por evento sobre interaction; sin keyboard/gamepad/pointerlock; multi-touch sin raycast por dedo; pointercancel nunca llega al handler; patrón input determinista = cola + fixed tick | 12 |
| Perf | demand requiere invalidate manual; dpr [min,max] = clamp estático; regress = semáforo manual (no cambia el render solo); instancing/LOD = three puro; claims del readme sin evidencia | 13 |
| Test renderer | Scene graph real en JS puro; GL mock 225 no-ops; fireEvent sintético sin raycast; snapshots sin uuids pero frágiles a tipos de three; doc miente en toGraph/attach | 14 |
| Ecosistema | zustand dep dura; drei = mayor valor y mayor lock-in/riesgo WebGPU; rapier/postprocessing/uikit/leva = 0 en lock; candidatos intake: drei → zustand → rapier | 15 |
| Windows | CONSUMER_COMPATIBILITY alta (sin lifecycle scripts); REPOSITORY_MAINTAINER_COMPATIBILITY limitada (yarn 1 ausente en host, cp POSIX, husky) | 16 |
| Matriz | 24 capacidades: empates en runtime/determinismo/WebGPU; ventajas R3F en composición/UI/loaders/testing/estructura; costes: +50-100KB, cadena React 19, device loss, disposal asíncrono | 17 |
| Clasificación | ADOPT: fiber (condicionado), test-renderer, zustand, never+advance. ADAPT: patrones gameplay, cache, ownership, touch, args. REFERENCE_ONLY: drei, docs, demo. REJECT: checkout como install, postprocessing, uikit, device-loss de R3F, claims | 18 |

## Gaps y limitaciones del sprint (transparencia)

1. **`packages/fiber/react-reconciler/` no está en el árbol git del pin** (se genera en postinstall): el análisis del reconciler asume el comportamiento estándar de react-reconciler 0.33 + React 19, razonable pero no verificable contra el artefacto distribuido desde este checkout (gap señalado por el PASS_2; corregido en 07).
2. **Una excepción menor al "NO external API calls"**: dos subagentes (09 y PASS_2) hicieron fetch read-only de `three@0.172.0/build/three.webgpu.js` vía jsdelivr para verificar la API pública de WebGPURenderer contra el build real (el checkout no trae node_modules). Sin efectos, sin escritura, sin credenciales; registrado en commands.log.
3. Todo lo de runtime WebGPU/device loss queda UNKNOWN_RUNTIME por diseño del sprint (prohibido browser/GPU).
4. DevLab fue tocado solo en lectura (preflight): master `2879485`, 7 worktrees, porcelain limpio al inicio; Codex activo en DEVLAB-CODEX-GAME-SKILLS-REVIEW-03 (worktree devlab-codex-game-skills-review). Sin conflicto de rutas.

## Gates finales

```text
SOURCE_PIN_EXACT: PASS            (0a107412ac64667b1908422e859447952f57feef)
SOURCE_WORKTREE_CLEAN: PASS       (porcelain 0, detached, 187 files)
LICENSE_REVIEW: PASS              (MIT Poimandres; assets ENUMERATED_AS_UNRESOLVED)
PACKAGE_INVENTORY: COMPLETE       (05: 5 package.json + lockfile versions)
SCRIPT_REVIEW: COMPLETE           (06: postinstall/prepare/analyze-* clasificados)
RECONCILER_REVIEW: COMPLETE       (07 + PASS_2)
RENDER_LOOP_REVIEW: COMPLETE      (08 + PASS_2)
WEBGPU_TSL_STATIC_REVIEW: COMPLETE (09 + PASS_2; runtime NO verificado)
DEVICE_LOSS_REVIEW: COMPLETE      (10)
RESOURCE_LIFECYCLE_REVIEW: COMPLETE (11)
EVENTS_INPUT_REVIEW: COMPLETE     (12 + PASS_2)
PERFORMANCE_REVIEW: COMPLETE      (13 + PASS_2)
TEST_RENDERER_REVIEW: COMPLETE    (14)
WINDOWS_REVIEW: COMPLETE          (16)
VANILLA_VS_R3F_MATRIX: COMPLETE   (17)
ADOPT_ADAPT_REJECT: COMPLETE      (18)
BENCHMARK_CONTRACT: READY         (19-22)
CODEX_REVIEW_BRIEF: READY         (23)

DEPENDENCIES_INSTALLED: 0
POSTINSTALL_EXECUTED: 0
BROWSER_RUNS: 0
PLAYWRIGHT_RUNS: 0
GPU_RUNS: 0
WEBGPU_RUNTIME_CLAIMED: NO
DEVLAB_FILES_CHANGED: 0
PRODUCT_FILES_CHANGED: 0
GLOBAL_FILES_CHANGED: 0
COMMITS: 0
PUSH: 0
TAGS: 0
RESIDUAL_PROCESSES: 0
```

## Entregables

- Checkout pineado: `external-evidence:/r3f-intake\source` (187 archivos, hashes en 03)
- Bundle de evidencia: `external-evidence:/r3f-intake\evidence\OPS-R3F-INTAKE-01\` — 25 archivos (00-24 + 25-gauntlet-critic.md) + commands.log
- Benchmark diseñado: DEVLAB-R3F-ARCHITECTURE-AB-05 (19-22) — ejecución reservada para Codex

## Próximos pasos (fuera de este sprint)

1. Codex revisa el bundle (23) y ejecuta DEVLAB-R3F-ARCHITECTURE-AB-05.
2. Con resultado PASS → habilitar discusión de integración R3F en DevLab (nuevo sprint).
3. Con resultado FAIL → R3F queda REFERENCE_ONLY (ev. 18) y el issue se documenta upstream.

Sprint cerrado por Hermes. La ejecución, integración y cualquier uso de navegador o GPU quedan reservados para Codex.
