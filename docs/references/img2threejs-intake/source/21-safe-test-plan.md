# 21 — Safe Test Plan (validación CPU aislada en SANDBOX)

Fase 16 de OPS-IMG2THREEJS-INTAKE-01. Solo después de completar las fases estáticas (00-19). Ejecución permitida: CPU + filesystem dentro de `external-evidence:/img2threejs-intake\sandbox`.

## Preparación (ya hecha)

- Copia descartable: `sandbox/` = copia de `source/` sin `.git` (153 archivos, verificado: sin .git, source original intacto y limpio en el pin).
- Variables de entorno: `PYTHONDONTWRITEBYTECODE=1`, `PYTHONNOUSERSITE=1`.
- Sin red: los tests del repo solo invocan `[sys.executable, <script del repo>, args...]` (verificado en test_pipeline.py:20-27, test_workflow_state.py:168-180, test_search_specs.py:238-244); la única red del repo (fetch_cs2_metadata.py, scripts/issue_triage.py) NO se ejecuta; el test de issue_triage mockea urlopen (test_issue_triage.py:158+).
- Sin browser/GPU: ningún test del repo los usa (verificado por grep de playwright/selenium/webbrowser en forge/tests: 0).
- Fixtures: solo `forge/tests/fixtures/knife_review_scene.json` (review-scene, no spec). Los specs reales se generan en los tests o se construyen para esta corrida.

## Comandos a ejecutar (en orden, todos con cwd = sandbox)

1. **compileall** (validación de sintaxis de los 81 .py):
   `python -m compileall -q forge scripts`
2. **Suite de unittest local** (todos los test_*.py de forge/tests):
   `python -m unittest discover -s forge/tests -p "test_*.py" 2>&1 | tail -30`
   - Esperado: mayoría PASS; fallos posibles por `sips` (macOS-only, ausente en Windows → FileNotFoundError limpio, sin side effects) — se documentan, no se reparan.
3. **Spec fixture propio** (PNG mínimo + spec starter, replicando el patrón del test_pipeline):
   - generar PNG 64×64 RGB válido (struct+zlib, mismo método que test_pipeline.py:36-52) en `sandbox/tmp/ref.png`
   - `python forge/stage2_spec/new_sculpt_spec.py "TestDrone" --image tmp/ref.png --complexity simple --out tmp/spec.json`
4. **Validador normal + strict** sobre la spec generada:
   `python forge/stage2_spec/validate_sculpt_spec.py tmp/spec.json`
   `python forge/stage2_spec/validate_sculpt_spec.py tmp/spec.json --strict-quality` (exit != 0 esperado: starter incompleto — documentar)
5. **Generación TypeScript** sobre la spec:
   `python forge/stage3_build/generate_threejs_factory.py tmp/spec.json --out tmp/model-a.ts`
6. **Determinismo**: repetir la generación y comparar:
   `python forge/stage3_build/generate_threejs_factory.py tmp/spec.json --out tmp/model-b.ts`
   `sha256sum tmp/model-a.ts tmp/model-b.ts` (deben ser IDÉNTICOS — la spec no cambia entre corridas)
7. **Post-checks**:
   - `git -C source status --porcelain` (source original limpio — 0)
   - buscar escrituras fuera del sandbox: `find` de archivos modificados/creados hoy en `img2threejs-intake` fuera de `sandbox/` y `evidence/`
   - red observada: 0 (sin comandos de red en la corrida)
   - procesos residuales: 0 (los tests usan subprocess que terminan; verificar con tasklist tras la corrida)

## Reglas de aborto

- Si un test intenta escribir fuera del sandbox, descargar algo, o abrir browser → **STOP / EXTERNAL_SIDE_EFFECT_DETECTED** (matar el proceso, registrar, no continuar).
- Si un script del repo intenta red → STOP.

## Qué NO se ejecuta (por diseño)

- Ningún script de imagen que dependa de `sips` (delight_albedo, extract_pbr_evidence con fallback, build_detail_inventory, extract_landmarks, make_comparison_sheet): su ejecución real requiere el binario de macOS; los tests que los tocan (test_color_recipe, test_reference_admission, etc.) corren funciones puras, no el CLI (verificado: test_color_recipe.py:6 "pure functions directly, not the CLI subprocess surface").
- Cualquier cosa con browser, GPU, WebGPU, URLs, modelos externos o agente visual.
- Nada del path CS2 (fetch_cs2_metadata, extract_cs2_textures, Source2Viewer).
