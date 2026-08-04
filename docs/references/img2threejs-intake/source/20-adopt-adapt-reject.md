# 20 — Clasificación por componente (ADOPT / ADAPT / REFERENCE_ONLY / REJECT / PILOT_REQUIRED)

Pin: `b604139` — img2threejs 1.4.4-beta. Criterio: valor como Asset Forge para DevLab (pipeline de assets procedurales para juegos de agentes con Three.js/WebGPU, determinismo y captura), ponderado contra los hallazgos de 07-19. Los caminos CS2/armas comerciales quedan fuera del piloto (regla del sprint).

## Tabla de clasificación

| COMPONENTE | SOURCE_PATH | VALOR | RIESGO | DECISIÓN | ADAPTACIÓN REQUERIDA | PILOT_ELIGIBLE |
|---|---|---|---|---|---|---|
| Pre-spec assessment | forge/stage2_spec/new_pre_spec_assessment.py | Alto: qualityContract + complexity tiers + detailInventory | Medio: mínimos auto-declarados evadibles (11 §3) | **ADAPT** | Forzar tier desde contrato DevLab (no auto-declarado); validar detailInventory contra features reales | Sí |
| ObjectSculptSpec (schema) | new_sculpt_spec.py + docs/specs | **Muy alto**: contrato completo (componentes, materiales, pivots, sockets, colliders, destruction, reviewHistory) | Medio: gaps de validación (11 §5) | **ADOPT** (como base) | Cerrar gaps: ciclos, finitud, refs cruzadas, prefijos quality: | Sí |
| strict-quality validator | forge/stage2_spec/validate_sculpt_spec.py | Alto: gate de profundidad de autoría | Medio: no valida generabilidad (11 §4); spec de 1 componente pasa; NaN pasa | **ADAPT** | Agregar: positividad/finitud de dimensions/scale, chequeo de ciclos, cruce de componentRefs, unificar warnings de evidencia bajo quality: | Sí |
| Detail inventory | forge/stage1_intake/build_detail_inventory.py | Medio: mapeo detalle→feature | Medio: mapsTo evadible (11 §3); crops con traversal `--components` (09 §5.2) | **ADAPT** | Sanitizar ids de zona; exigir mapsTo a localFeatures/localOverrides reales | Sí |
| Pass orchestration | forge/stage3_build/orchestrate_passes.py | **Muy alto**: locked-sequential passes con evidencia real (12 §1) | Bajo | **ADOPT** | Exponer contrato a DevLab (estado de passes legible) | Sí |
| Three.js code generator | forge/stage3_build/generate_threejs_factory.py | **Muy alto**: calidad del emitido alta, determinista bit a bit (verificado en 22), fail-loud | **Alto**: inyección por comentarios R1-R3 (12 §4); NaN/Infinity; count sin tope; sin dispose | **ADAPT** (condicional a fixes) | **CERRAR R1-R3** (escapar/eliminar las 3 interpolaciones en comentarios :1020/:1021/:1169); finitud en vector(); clamp de count/segments; records con Object.create(null) | Sí (post-fixes) |
| Attachment contracts | validate_sculpt_spec.py:711-751 + generador :1090-1101 | Alto: joints orientados + override por diseño | Medio: heurística evadible (11 §3); override silencioso de primitiva | **ADAPT** | Documentar override; exigir attachment para hijos no neutros | Sí |
| Sockets | generador :1117-1135 | Alto: Object3D reales keyed componente:socket | Bajo | **ADOPT** | Nada | Sí |
| Colliders | generador :1107 | Medio: metadata JSON, no proxy físico | Bajo | **ADAPT** | Decidir contrato DevLab (proxies vs metadata) | Sí |
| Destruction groups | generador :1110-1116 | Medio-alto: grupos por fractureGroup | Bajo | **ADOPT** | Nada (hook de animación DevLab-side) | Sí |
| Material extraction (PBR heuristics) | extract_pbr_evidence.py, analyze_texture.py, delight_albedo.py | Medio: HEURISTIC honesto (14 §8) | Medio: maps correlacionadas por luma; flag proceduralMapsIndependent falso en path referencia; sips macOS-only | **ADAPT** | Path procedural por defecto; referencePbr opt-in con atribución; fix de flag; portabilidad sips | Parcial (procedural sí, reference no) |
| Camera solving | solve_camera_pose.py | Bajo-medio: heurística de framing (35/38mm) | Bajo | **REFERENCE_ONLY** | Verificar en piloto con vista 3/4 | No (piloto usa vista fija) |
| Texture projection / bake | bake_projected_texture.py | **Bajo actual**: descriptor-only, NO bakea píxeles (14 §8.5; contradice README/SKILL) | Medio: docs sobrevenden | **REFERENCE_ONLY** | Recién cuando exista bake real; para el piloto: procedimental | No |
| Comparison sheets | forge/stage4_review/make_comparison_sheet.py | Alto: empaqueta evidencia | Medio: sin alineación de encuadre (15 §5) | **ADAPT** | Alinear escala/posición entre paneles; adjuntar métricas + viewpoint | Sí |
| Multi-angle review | diagnose_render_multi_angle.py | Medio: analiza orbit PNGs, NO los produce (15 §4.2) | Alto: gate nominal sin enforcement | **ADAPT** | Productor de capturas (DevLab capture-harness) | Sí (con DevLab) |
| Bounded correction | correction_loop.py + workflow_state 3/6 | **Muy alto**: terminación garantizada (15 §2.3) | Bajo | **ADOPT** | Nada | Sí |
| Local state machine | forge/state.py + next.py + workflow_state.py | Alto: orden estricto, atómico, hard stops (10) | Alto: sin locks, evidencia declarativa, manipulable (10 §R1-R3) | **ADAPT** | Lock/CAS, verificación de evidencia, perfil↔checklist | Sí |
| Divine Eye (deterministic gates) | forge/stage4_review/divine_eye.py | **Muy alto**: hard gates no promediables | Medio: calibración pendiente (15 §1.6); framing falso-reject | **ADAPT** | Alineación scale+translation pre-IoU; calibración con corpus DevLab | Sí |
| Per-feature thresholds | per_feature.py + feature_acceptance_policy.py | **Muy alto**: críticos individuales con piso 0.8 | Medio: important por promedio; selección de críticos del agente | **ADAPT** | Piso individual para important; selección de críticos revisada por CRITIC | Sí |
| VLM gate | forge/stage4_review/vlm_gate.py | Alto: contrato gated/calibrado/cross-checked | Medio: no usado en el flujo estándar (15 §3) | **ADAPT** | Usar como revisor del CRITIC_VISUAL del Gauntlet | Sí |
| Part coverage | forge/stage4_review/check_part_coverage.py | **Muy alto**: único gate de estructura (15 §4.7) | Bajo | **ADOPT** | Contrato con DevLab manifest | Sí |
| Character path | grimoire/character/*, extract_landmarks.py | Medio (para otro dominio) | Medio | **REFERENCE_ONLY** | Fuera del piloto | No |
| CS2 path | docs/cs2*, cs2_*.py, skills/cs2-*.md | **No priorizar** (regla del sprint) | Alto (marcas Valve, red, Source2Viewer, sips) | **REJECT (para el piloto)** | Mantener fuera; no tocar marcas | No |
| PNG parser propio | extract_pbr_evidence.py:84-150 (+3 copias) | Bajo (necesario pero inseguro) | **Crítico**: OOM con ~60 bytes, bombas, sin límites (09 §4) | **ADAPT (urgente)** | Gate de admisión con límites de 09 §7; unificar 4 copias; representación plana | Sí (con gate) |
| Generador de texturas procedurales | generador :798-917 | **Muy alto**: 5 canales coherentes, POT [256,2048], seeds deterministas | Bajo | **ADOPT** | Nada (verificar en piloto) | Sí |
| Runtime emitido (sculptRuntime) | generador :1208-1212 | Alto: nodes/meshes/sockets/colliders/destructionGroups + evidencia | Medio: sin dispose, sin tick, sin métricas (17) | **ADAPT** | Contratos disposeModel/rebuild/serialize + DevLabCaptureTarget | Sí |

## Síntesis

- **ADOPT directo**: pass orchestration, sockets, destruction groups, bounded correction, part coverage, texturas procedurales, ObjectSculptSpec como base del contrato.
- **ADAPT (con fixes específicos)**: generador (cerrar R1-R3 ANTES de cualquier uso con specs no confiables — y notar que la cadena state.json→pass_id→R3 (25a §CLAIM 6) exige también validar currentPass en workflow_state), validador strict (finitud, ciclos, refs), state machine (lock+evidencia), PNG parser (límites — **5 copias**, no 4: incluye make_comparison_sheet.py:37-70, corrección de 25a §CLAIM 1), Divine Eye (alineación+calibración — **pero notar que divine_eye.py es módulo huérfano no cableado al flujo real**, el gate efectivo es Tier 1 de diagnose_render.py: corrección de 25b §1; el rescue IoU→pass en divine_eye.py:372-387 corta en zona ambigua 0.43-0.58 y debe degradarse a probe), comparison sheet (encuadre), per-feature (piso important; per_feature.py también es huérfano — el gate efectivo es feature_acceptance_policy.py), VLM gate (como CRITIC_VISUAL — vlm_gate.py es código muerto hoy, 25b §5), append_review (DEBE validar tier1Results + renderHash antes de aceptar continue — fix de una línea, 25b §10).
- **REFERENCE_ONLY**: camera solving, texture projection/bake (descriptor-only hoy), character path.
- **REJECT para el piloto**: CS2 path completo (marcas comerciales + red + binarios externos).
- **PILOT_REQUIRED**: el veredicto de ground-blade winding (13 §1.11 — sospechoso inside-out, solo verificable por render) y la paridad WebGPU de MeshPhysicalMaterial (16) — ambos se resuelven en DEVLAB-IMG2THREEJS-ASSET-PILOT-01.

## Condición de seguridad para el piloto

El piloto NO puede usar el generador tal cual: las 3 interpolaciones crudas en comentarios (12 R1-R3, :1020/:1021/:1169) permiten inyección de código desde un spec malicioso. Fix mínimo de 3 líneas (escapar `\n`/`\u2028`/`\u2029` en esos f-strings o eliminar los comentarios) antes de cualquier uso. Los límites del PNG parser (09 §7) son el segundo fix obligatorio si se ingiere imagen de referencia.
