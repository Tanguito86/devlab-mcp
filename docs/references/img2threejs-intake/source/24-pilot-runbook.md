# 24 — Pilot Runbook: DEVLAB-IMG2THREEJS-ASSET-PILOT-01 (CINDER RELAY DRONE)

> Diseñado en OPS-IMG2THREEJS-INTAKE-01. **NO ejecutado** (la ejecución queda reservada a un sprint posterior revisado por Codex). Este runbook es el procedimiento paso a paso.

## 0. Pre-requisitos (bloqueantes)

1. **FIX-1 aplicado** (inyección por comentarios, contrato 23): el generador debe estar saneado antes de ingerir cualquier spec no confiable.
2. **FIX-2 aplicado** (gate de admisión de imágenes, 09 §7): los 4 parsers PNG con límites.
3. **Referencia generada**: concepto original "CINDER RELAY DRONE" por Kimi o `image_gen` (vista 3/4, fondo simple, sin marcas). Guardar como `assets/ref-drone.png` en el workspace del piloto.
4. Sandbox descartable del pipeline (copia de source b604139 sin .git, como en Fase 16).

## 1. Setup

```bash
export PYTHONDONTWRITEBYTECODE=1 PYTHONNOUSERSITE=1
cd <workspace-piloto>   # ajeno a DevLab hasta aprobación
python forge/stage1_intake/probe_image.py assets/ref-drone.png        # metadata, no visual
python forge/state.py init --state .img2threejs/state.json --reference assets/ref-drone.png --profile generic
```

## 2. Intake y assessment

```bash
python forge/stage1_intake/check_reference_admission.py assets/ref-drone.png   # admisión
python forge/stage2_spec/new_pre_spec_assessment.py "Cinder Relay Drone" --image assets/ref-drone.png \
  --complexity moderate --out assessment.json
```

- Completar `detailInventory` (mínimos del tier moderate: 6 detalles) con mapsTo a localFeatures/material.localOverrides REALES (no prose-only).
- Definir ≤5 featureReviewTargets críticos del drone: núcleo luminoso, propulsores, arma inferior, proporción general, silueta.

## 3. Spec + validación

```bash
python forge/stage2_spec/new_sculpt_spec.py "Cinder Relay Drone" --image assets/ref-drone.png \
  --assessment assessment.json --out object-sculpt-spec.json
python forge/stage2_spec/validate_sculpt_spec.py object-sculpt-spec.json
python forge/stage2_spec/validate_sculpt_spec.py object-sculpt-spec.json --strict-quality   # debe dar exit 1 hasta completar
```

- Componentes mínimos: chasis (box), núcleo (sphere/ellipsoid), 2 propulsores (cylinder), arma inferior (extrude/cylinder), pivotes laterales (sockets), collider proxy, destruction groups por fractureGroup.
- **No usar ground-blade** (winding bajo sospecha — verificar primero en fixture aparte si se necesita).
- Primitivas necesarias (13): box, cylinder, cone, torus, extrude — TODAS SUPPORTED (evidencia 13 §6).

## 4. Build por passes

```bash
python forge/next.py --state .img2threejs/state.json object-sculpt-spec.json   # gate obligatorio
python forge/stage3_build/orchestrate_passes.py status object-sculpt-spec.json
python forge/stage3_build/generate_threejs_factory.py object-sculpt-spec.json --out src/createCinderRelayDroneModel.ts
```

- Regla: solo el pass desbloqueado; `refine-code` edita el artefacto actual sin regenerar; `refine-spec` re-valida.

## 5. Runtime + captura (DevLab harness)

1. Integrar el `.ts` generado con el **adaptador DEVLAB_IMG2THREEJS_ADAPTER** (16 §3): WebGPURenderer + `await init()`, sin composer clásico, `disposeModel()` por traverse con dedup, `rebuildGpuResources()` = re-ejecutar el factory con el mismo spec, hook `userData.tick` opcional.
2. Implementar `DevLabCaptureTarget` (setSeed/setTime/setViewpoint/renderOnce/getMetrics) — el runtime ya es determinista (seeds hashString); falta la API de captura (19 §5 puente 1).
3. Capturas: vista 3/4 de la referencia + órbita (5 viewpoints del capture-harness) — **productor real de los orbit shots** que img2threejs no tiene (15 §4.2).

## 6. Gates visuales (Gauntlet Loop)

| Rol | Qué hace |
|---|---|
| BUILDER | spec + modelo (pasos 2-4) |
| DEVLAB | capturas deterministas + métricas (paso 5) |
| CRITIC_TÉCNICO | check_part_coverage contra el manifest + conteo real de tris/draw calls/texturas (18 §6) contra perfil DESKTOP_PROP |
| CRITIC_VISUAL | comparison sheet + multiángulo + per-feature (rol SEPARADO del builder) |
| INTEGRATOR | correction_loop (3 por pass, 6 total) — `refine-spec`/`refine-code` según routing |

```bash
python forge/stage4_review/diagnose_render.py --spec object-sculpt-spec.json --pass-id <pass> --in-place
python forge/stage4_review/make_comparison_sheet.py --reference assets/ref-drone.png --render <shot> --out cmp.png --json
python forge/stage4_review/append_review.py object-sculpt-spec.json --pass-id <pass> --fidelity <0-1> \
  --action continue --summary "..." --render-screenshot <shot> --comparison-image cmp.png \
  --ai-vision-score <0-1> --in-place
python forge/stage4_review/check_part_coverage.py --spec object-sculpt-spec.json --manifest parts.json
```

## 7. Salida B — atlas y sprite (puente GVF)

1. Render multivista con `frameCamera` del runtime (azimut 45° + elevaciones; determinista por bounding box).
2. **Prohibido** referencePbr/URLs externas (determinismo de atlas — 18 §5).
3. Cuando exista el export glTF de img2threejs (v1.7, hoy no existe — 19 gap), GVF model-to-sprite → atlas → sprite GameMaker.

## 8. Criterios de éxito

- Silhouette agreement + component coverage + multi-angle coherence PASS en los gates.
- Attachments/sockets correctos (sin partes flotantes).
- Budgets DESKTOP_PROP respetados (18).
- WebGPU runtime + device-loss recovery + resource disposal OK (contratos de 17).
- Capturas deterministas byte-idénticas (mismo seed → mismos hashes).
- Atlas canónico generado (salida B).
- Veredicto del gauntlet registrado en reviewHistory con evidencia.
