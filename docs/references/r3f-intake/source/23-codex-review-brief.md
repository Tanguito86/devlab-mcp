# 23 — Codex Review Brief

Brief para la revisión de Codex del sprint OPS-R3F-INTAKE-01. Este intake fue read-only; la ejecución (browser/GPU/installs) queda reservada para Codex.

## Qué se auditó

- **Repo**: pmndrs/react-three-fiber, pin `0a107412ac64667b1908422e859447952f57feef` (release: `@react-three/fiber@9.7.0`, `@react-three/test-renderer@9.1.1`)
- **Checkout**: `external-evidence:/r3f-intake\source` (187 archivos, detached, limpio, sin submodules/symlinks/LFS)
- **Evidencia**: `external-evidence:/r3f-intake\evidence\OPS-R3F-INTAKE-01\` (00–25)
- **Sin ejecutar nada**: 0 installs, 0 scripts del repo, 0 browser, 0 GPU (gates verificados abajo)

## Veredicto resumido

- **R3F 9.7.0 = HIGH_VALUE_ARCHITECTURE_CANDIDATE** (segunda vía de producción de DevLab, sujeta a benchmark)
- **WebGPU/TSL**: STATICALLY_SUPPORTED / DEVLAB_RUNTIME_BENCHMARK_PENDING — NO se declaró runtime verificado
- **License**: MIT VERIFIED (Poimandres); assets del example (glb/gltf de Khronos/three.js samples) ENUMERATED_AS_UNRESOLVED, fuera del paquete npm
- **Device loss**: 100% userland (R3F no maneja nada; unmount fuerza forceContextLoss, no-op en WebGPU)
- **Instalación**: usar el paquete publicado (sin lifecycle scripts); el checkout monorepo requiere yarn 1 + postinstall + husky

## Qué decidió el intake

- **ADOPT** (condicionado a benchmark): fiber core, test-renderer, zustand, frameloop `never`+`advance`
- **ADAPT**: patrones de gameplay (sim imperativa), useLoader (política de cache), ownership de recursos, touch input, input determinista
- **REFERENCE_ONLY**: drei (intake propio pendiente), docs de perf, demo WebGPU
- **REJECT**: checkout monorepo como instalación, postprocessing hasta benchmark WebGPU, uikit, claims de perf sin evidencia
- Clasificación completa: evidencia 18

## Lo que Codex debe hacer (siguiente paso)

1. **Revisar el bundle de evidencia** (24 archivos + commands.log), especialmente 07-09 (arquitectura), 17-18 (matriz y clasificación), 19-22 (benchmark).
2. **Ejecutar DEVLAB-R3F-ARCHITECTURE-AB-05** (contrato en 19, prompt en 20, rúbrica en 21, gates en 22): LEG_A Vanilla Three.js vs LEG_B React 19.2 + fiber 9.7.0, ambos WebGPURenderer + TSL + harness DevLab, slice EMBER CIRCUIT.
3. **Verificaciones críticas de runtime que el intake no pudo hacer** (de 09):
   - Device loss WebGPU real (`device.lost` → recreación + re-upload)
   - Ejecución de nodos TSL (time/uniform/mix) bajo el rAF de R3F
   - Compute y RenderPipeline custom desde userland
   - Renderer recreation por remount del Canvas
   - Resize + dpr contra WebGPURenderer
   - Init failure UX (sin try/catch en el path de configure)
4. **Verificar claims de perf con números propios**: mount/unmount de N objetos, frameloop demand + invalidate, disposal idle (evidencia 13 — los claims del readme "no overhead/outperforms" NO tienen evidencia reproducible).
5. **Antes de integrar**: política de recursos (evidencia 11 §8) y contrato de gameplay (evidencia 08 §6) aprobados por José.

## Restricciones para Codex

- No usar el checkout `r3f-intake\source` como dependencia instalable (canal correcto: npm publicado)
- No modificar rutas protegidas del sprint (devlab-*, threejs-game-skills-intake, game-visual-forge, GalaxyRaiders*, %USERPROFILE%\.codex/.claude/.agents)
- Si el benchmark falla WebGPU runtime → R3F queda REFERENCE_ONLY (evidencia 18)
- Reportar con las tablas pierna vs métrica del contrato 19/21

## Datos de contacto del sprint

- Sprint owner: José (evaluador humano de maintainability y gameplay)
- Files: todo en `external-evidence:/r3f-intake\` (ajeno a DevLab a propósito)
