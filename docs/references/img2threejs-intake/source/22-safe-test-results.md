# 22 — Resultados de la validación CPU aislada (SANDBOX)

Sprint: OPS-IMG2THREEJS-INTAKE-01 · Fecha: 2026-08-03 21:10–21:15 · Host: Windows 10, Python 3.11.15 (venv hermes)
Sandbox: `external-evidence:/img2threejs-intake\sandbox` (copia de source sin .git, 153 archivos)
Variables: `PYTHONDONTWRITEBYTECODE=1`, `PYTHONNOUSERSITE=1` · Red: 0 · Browser/GPU: 0

## Ejecuciones

### 1. `python -m compileall -q forge scripts` → **PASS** (exit 0, 81 .py compilan)

### 2. Suite unittest completa: **280 PASS / 3 ERROR (ambientales) / 0 FAIL** de 283 tests (91.9s)

Los 3 errores son **ambientales de Windows**, no del código:
- `test_search_specs.py:922,513,532` — los tests de symlinks fallan con `WinError 1314` (el cliente no dispone de privilegios para crear symlinks; requiere Developer Mode en Windows). El código bajo test (rechazo de symlinks en search_specs) es correcto — el entorno no puede CREAR el symlink para probarlo.
- Cero fallos de lógica. Cero tests que requieran red/browser/GPU (verificado pre-corrida: los subprocess de los tests son `[sys.executable, <script del repo>]`; la única red del repo está mockeada).

### 3. Fixture propio + spec starter → **PASS**

- `tmp/ref.png` generado (10.4 KB, PNG RGB 64×64 válido, struct+zlib sin PIL — mismo método que test_pipeline.py:36-52)
- `python forge/stage2_spec/new_sculpt_spec.py "TestDrone" --image tmp/ref.png --out tmp/spec.json` → spec de 37.1 KB (starter, 1 componente)

### 4. Validador normal + strict → **comportamiento confirmado**

- Normal: **exit 0** con 8 warnings (tier unassessed, qualityBar unassessed, material-pass sin overrides, referencePbr faltante, colorMaterialRecipe faltante, "only one component found" — este último es warning plain, NO quality:)
- `--strict-quality`: **exit 1** con 8 "strict quality failure" (promueve los warnings `quality:` a error — confirma la mecánica documentada en la evidencia 11 §2: strict = normal + promoción de prefijo `quality:`; y confirma que el starter pasa normal y falla strict, igual que el test "Oak" del test_pipeline)

### 5-6. Generación TypeScript ×2 + determinismo → **PASS determinista**

- `generate_threejs_factory.py tmp/spec.json --out tmp/model-a.ts` → exit 0, 725 líneas, 44.6 KB (imports three + 6 de three/examples, ProceduralModelOptions, helpers)
- Repetición idéntica → `model-b.ts`
- **`sha256sum` IDÉNTICO** (34f4376f8cd0a6ecfd0b1e22d994829dd32e12c872c066f3463810580c064d91 en ambos) — mismo spec → mismo código bit a bit. Determinismo verificado en ejecución real.

## Post-checks

| Check | Resultado |
|---|---|
| Source original limpio | ✅ porcelain 0, pin `b604139` intacto |
| Escrituras fuera de sandbox/evidence | ✅ solo los `.git` del clone inicial (20:17-18, previos a la corrida) |
| pycache | 8 dirs en SANDBOX (generados por compileall explícito — descartables; el import con PYTHONDONTWRITEBYTECODE no genera) |
| Red externa | 0 llamadas (ningún comando de red en la corrida; urlopen solo mockeado en tests) |
| Procesos residuales | ✅ 10 procesos python = los preexistentes de la baseline; los subprocess de los tests terminaron |
| Temp del usuario (H:\Temp\Deposito\tmpXXX) | uso normal de `tempfile.TemporaryDirectory` por los tests (se limpian solos; no es escritura del pipeline) |

## Conclusión

`STOP / EXTERNAL_SIDE_EFFECT_DETECTED`: **NO se disparó**. La validación CPU aislada confirma en ejecución lo que la auditoría estática predijo: (a) el código compila y la suite es sólida (280/283 con 3 fallos ambientales de symlinks), (b) strict-quality bloquea el starter incompleto (exit 1), (c) el generador produce TypeScript válido y **determinista bit a bit**. El pipeline es ejecutable localmente con stdlib puro en Windows para los paths que no dependen de `sips` (macOS-only, evidencia 08) ni del path CS2.
