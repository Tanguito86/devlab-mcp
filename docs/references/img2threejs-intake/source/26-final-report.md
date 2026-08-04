# 26 — Informe final OPS-IMG2THREEJS-INTAKE-01

## Estado

```text
OPS-IMG2THREEJS-INTAKE-01:
COMPLETED / READY_FOR_CODEX_REVIEW

SOURCE:     img2threejs/img2threejs
PIN:        b604139f51d6831780240e8cf1d8b21a42401d0a
LICENSE:    Apache-2.0 / VERIFIED (copyright 2026 hoainho)
ROLE:       ASSET_FORGE_CANDIDATE
INTEGRATION: NO
GLOBAL_INSTALL: NO
WEBGPU_TSL: STATIC_REVIEW_COMPLETE / ADAPTER_DECISION_RECORDED
PILOT:      DEVLAB-IMG2THREEJS-ASSET-PILOT-01 — DESIGNED / NOT_EXECUTED
```

## Resumen ejecutivo

img2threejs (pin `b604139`, línea 1.4.4-beta, post-v1.4.3) es un **candidato sólido como Asset Forge para DevLab** — el eslabón que faltaba entre "imagen de referencia" y "modelo procedural Three.js con contrato de calidad" — con **dos condiciones bloqueantes** (fix de inyección en el generador + gate de admisión de imágenes) y una corrección estructural (separación de roles visuales) antes del piloto:

1. **Pipeline de calidad real**: 12 pasos con state machine local (state.py/next.py, hard stops exit 3, límites 3 correcciones por pass / 6 totales), passes locked-sequential con evidencia, validador strict-quality, gates deterministas Tier 1, comparison sheets, bounded correction — verificado en ejecución (sandbox: 280/283 tests, generación determinista bit a bit).
2. **Generador de alta calidad técnica**: 14 primitivas con branches propios (0 fallback silencioso para primitivas válidas — `GeometryNotImplementedError` fail-loud), PBR completo con colorSpace correcto (sRGB/NoColorSpace), texturas procedurales deterministas (FNV-1a por id, sin Math.random), runtime de evidencia (`sculptRuntime`), y **cero shaders custom** → el modelo es portable a WebGPU r172 (solo la sección de presentación requiere adaptador).
3. **Seguridad: dos agujeros reales, ambos con fix conocido y barato**: (a) inyección de código en el TS emitido por 3 interpolaciones crudas en comentarios (spec malicioso → código arbitrario en el artefacto; el pipeline no lo ejecuta, pero el deliverable queda contaminado); (b) parser PNG propio sin límites en 5 copias (OOM con ~65 bytes, bombs, sin timeout) — el path CS2 agrega traversal/SSRF pero queda fuera del piloto.
4. **El eslabón débil es la agencia, no la matemática**: divine_eye.py y vlm_gate.py (el "harness heart" y la "VLM last layer" documentados) son código huérfano; el mismo agente construye, captura, elige ángulo, define críticos y se auto-puntúa; append_review no valida Tier 1. El Gauntlet Loop de DevLab con roles separados cierra esto por construcción.
5. **Hallazgo de malla real**: el winding de `ground-blade` está invertido (inside-out en Z, confirmado por producto vectorial en 25b §7) — con FrontSide la hoja se culled desde afuera. No usar en el piloto; reparar/verificar por render primero.
6. **Integración tripartita sin solape**: img2threejs = asset specification + procedural factory; DevLab = runtime/captura/WebGPU/determinismo; GVF = render canónico/atlas/sprites/GameMaker. El puente que falta: modelo procedural → glTF (v1.7) → atlas GVF; y el contrato DevLabCaptureTarget en el runtime generado.

## Hallazgos principales por fase

| Fase | Hallazgo clave | Evidencia |
|---|---|---|
| Versión | MIXED_VERSION_STATE / EXPLICITLY_DOCUMENTED: README 1.4.3 vs SKILL.md 1.4.4-beta.3 vs CHANGELOG 1.4.4-beta-2; 1.5.0 invalidado por el propio repo; pin = merge de infra beta post-v1.4.3 | 02 |
| Licencia | Apache-2.0 VERIFIED (relicense MIT→Apache #16); 0 binarios; referencias comerciales CS2 (Valve) presentes en skills/docs — no licenciadas; separación de derechos documentada | 05 |
| Inventario | 153 archivos: 81 Python stdlib puro, 48 md, 5 json, 4 jsonl, 1 svg; 13 ejecutables en index; red real = 2 scripts (CS2 metadata + issue triage); subprocess = sips (macOS) ×5 + Source2Viewer (CS2); shell=True = 0; eval/exec = 0 | 03, 06, 07, 08 |
| Seguridad imágenes | Parser PNG propio sin NINGÚN límite (5 copias): OOM ~65 bytes, bombs, 72 B/px, sin timeout sips, sin CRC, sin MAX_CHUNK_COUNT; code injection desde imagen NO encontrada; límites propuestos (50MB/16K px/16-20MP/160MB/10k chunks/30s) | 09 + 25a |
| State machine | Orden estricto + atómico + hard stops 3/6 + fail-closed; sin locks (lost update), evidencia declarativa, manipulable; ADAPT (patrones valiosos, no el acoplamiento) | 10 |
| SculptSpec | strict = normal + promoción de `quality:`; NO valida generabilidad (NaN/negativos/ciclos pasan; spec de 1 componente pasa; descriptores custom sin validar; generador no re-valida) | 11 |
| Generador | Calidad alta (gating real con evidencia, helpers selectivos, determinismo); seguridad 95% (R1-R3 inyección por comentarios, NaN/Infinity, count sin tope, `__proto__`, sin dispose) | 12 |
| Primitivas | 14/14 con branch; 0 fallback silencioso para válidas; ground-blade PARTIAL (winding inside-out); ellipsoid = esfera escalada; instancing real solo en repetitionSystems | 13 |
| Materiales | Claims clasificados: CIEDE2000 = MEASUREMENT real (Sharma-verificado); pHash = MEASUREMENT con invariancia parcial; PBR = MEASUREMENT+HEURISTIC+APPROXIMATION; de-lighting = HEURISTIC (cap 0.72); bake = descriptor-only; "proceduralMapsIndependent" = claim incorrecto en path referencia; seed determinista FNV-1a | 14 |
| Gates visuales | Determinista-first correcto pero: divine_eye/vlm_gate/per_feature huérfanos; append_review sin validación de Tier 1; multi-angle sin productor ni enforcement no-CS2; comparison sheet sin alineación; important por promedio; calibración pendiente | 15 + 25b |
| WebGPU/TSL | Modelo portable (0 shaders custom, geometrías+materiales classic compatibles r172); ADAPTER_REQUIRED para renderer (WebGLRenderer explícito), composer clásico (UNSUPPORTED), PMREM/shadows (UNKNOWN_RUNTIME); adaptador DEVLAB_IMG2THREEJS_ADAPTER propuesto | 16 |
| Device loss | Modelo stateless, 100% recreable (seeds + spec); sin dispose (único pmrem.dispose); sin tick/loops/listeners/audio (cumple regla del sprint); contratos create/dispose/rebuild/serialize propuestos | 17 |
| Presupuestos | Declarativo, no ejecutivo (performanceBudget muerto, lodPlan muerto); únicos controles: segmentos fijos + clamp textura; perfiles MOBILE/DESKTOP/HERO/BOSS/SPRITE_RENDER_SOURCE propuestos; SPRITE exige determinismo (prohibe referencePbr) | 18 |
| Integración | img2threejs = ASSET FORGE (no duplica DevLab/GVF); integración más barata = img2threejs→DevLab (seeds + DevLabCaptureTarget); puente faltante = glTF→GVF; no unificar state machines (tres planos que se referencian) | 19 |
| Clasificación | ADOPT: orchestration, sockets, destruction, bounded correction, part coverage, texturas procedurales, ObjectSculptSpec. ADAPT: generador (fix R1-R3), validador, state machine, PNG parser (5 copias), gates visuales (rol separado + tier1Result check). REFERENCE_ONLY: camera solving, bake. REJECT piloto: CS2 completo | 20 + 25a/25b |
| Sandbox | compileall OK; 280/283 tests (3 errores ambientales symlinks Windows); strict bloquea starter (exit 1); generación TS ×2 con SHA-256 IDÉNTICO; post-checks: source limpio, 0 red, 0 residuales | 21, 22 |
| Gauntlet | PASS_1 analyst (00-20) + PASS_2 security critic (25a: claims verificados, 5ª copia parser, chain state→R3, 3 fixes bloqueantes) + PASS_3 visual critic (25b: divine_eye/vlm_gate huérfanos, rescue IoU ambiguo, ground-blade CONFIRMADO inside-out, claims sobrevendidos) + PASS_4 integrator (este informe; correcciones aplicadas a 09/20) | 25a, 25b, 26 |

## Gates finales

```text
SOURCE_PIN_EXACT: PASS
SOURCE_WORKTREE_CLEAN: PASS
VERSION_COHERENCE: DOCUMENTED (MIXED_VERSION_STATE / EXPLICITLY_DOCUMENTED)
LICENSE_REVIEW: PASS (Apache-2.0, hoainho)
PROVENANCE_REVIEW: COMPLETE
COMPONENT_INVENTORY: COMPLETE
SCRIPT_SECURITY_REVIEW: COMPLETE
PATH_TRAVERSAL_REVIEW: COMPLETE
UNTRUSTED_IMAGE_REVIEW: COMPLETE (5 copias del parser, límites propuestos)
CODE_INJECTION_REVIEW: COMPLETE (R1-R3 encontrados — fix bloqueante documentado)
NETWORK_MAP: COMPLETE
SUBPROCESS_MAP: COMPLETE
STATE_MACHINE_REVIEW: COMPLETE
SCULPT_SPEC_REVIEW: COMPLETE
CODE_GENERATOR_REVIEW: COMPLETE
PRIMITIVE_MATRIX: COMPLETE
MATERIAL_REVIEW: COMPLETE
VISUAL_GATE_REVIEW: COMPLETE (críticos: módulos huérfanos identificados)
WEBGPU_TSL_STATIC_REVIEW: COMPLETE (ADAPTER_DECISION_RECORDED)
DEVICE_LOSS_REVIEW: COMPLETE
RESOURCE_LIFECYCLE_REVIEW: COMPLETE
TECHNICAL_BUDGET_REVIEW: COMPLETE
DEVLAB_GVF_MATRIX: COMPLETE
ADOPT_ADAPT_REJECT: COMPLETE
PILOT_CONTRACT: READY (23, 24)
CODEX_REVIEW_BRIEF: READY (25)

GLOBAL_SKILL_INSTALLS: 0
BROWSER_RUNS: 0
PLAYWRIGHT_RUNS: 0
GPU_RUNS: 0
WEBGPU_RUNTIME_CLAIMED: NO
REMOTE_IMAGES_USED: 0
COMMERCIAL_REFERENCES_USED: 0
PRODUCT_REPOSITORIES_CHANGED: 0
DEVLAB_FILES_CHANGED: 0
COMMITS: 0
PUSH: 0
TAGS: 0
RESIDUAL_PROCESSES: 0
```

## Entregables

- Checkout pineado: `external-evidence:/img2threejs-intake\source` (153 archivos, hashes en 04)
- Sandbox (descartable): `external-evidence:/img2threejs-intake\sandbox` (sin .git; artefactos de la corrida en sandbox/tmp)
- Bundle de evidencia: `external-evidence:/img2threejs-intake\evidence\OPS-IMG2THREEJS-INTAKE-01\` — 27 archivos (00-26 + 25a/25b) + commands.log
- Piloto diseñado: DEVLAB-IMG2THREEJS-ASSET-PILOT-01 (23-24) — NO ejecutado

## Notas de transparencia

- Dos subagentes del batch 1 no completaron (task-0 de 07/08 y task-2 de 16): los JSONs de scripts/red y el informe WebGPU se generaron por vía directa (análisis ast propio + grep fino verificado, y redacción integradora) — sin pérdida de cobertura.
- La validación sandbox usó tempdirs del usuario (H:\Temp\Deposito\tmpXXX) por `tempfile.TemporaryDirectory` de los tests — comportamiento normal de Python, sin escrituras del pipeline fuera del sandbox.

## Próximos pasos (fuera de este sprint)

1. Codex aplica los fixes bloqueantes (25a §Fixes 1-3) y ejecuta el piloto (23-24) con el Gauntlet Loop de roles separados.
2. Resultado PASS del piloto → habilitar discusión de integración img2threejs en DevLab como Asset Forge (nuevo sprint).
3. Los caminos CS2/armas comerciales permanecen fuera (marcas de Valve, red, binarios externos).

Sprint cerrado por Hermes. La generación visual, ejecución WebGPU, integración y piloto quedan reservados para un sprint posterior revisado por Codex.
