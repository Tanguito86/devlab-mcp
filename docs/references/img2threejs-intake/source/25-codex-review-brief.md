# 25 — Codex Review Brief

Brief para la revisión de Codex del sprint OPS-IMG2THREEJS-INTAKE-01. Intake read-only + validación CPU aislada completados; la generación visual, ejecución WebGPU, integración y piloto quedan reservados para un sprint posterior revisado por Codex.

## Qué se auditó

- **Repo**: img2threejs/img2threejs, pin `b604139f51d6831780240e8cf1d8b21a42401d0a` (1.4.4-beta.3 declarado en SKILL.md; README 1.4.3; CHANGELOG 1.4.4-beta-2 + 1.5.0 invalidado → MIXED_VERSION_STATE / EXPLICITLY_DOCUMENTED, evidencia 02)
- **Checkout**: `external-evidence:/img2threejs-intake\source` (153 archivos, 81 Python, 0 binarios, detached, limpio)
- **Evidencia**: `external-evidence:/img2threejs-intake\evidence\OPS-IMG2THREEJS-INTAKE-01\` (00-26 + 25a/25b críticos + commands.log)
- **Validación CPU**: sandbox `external-evidence:/img2threejs-intake\sandbox` — compileall OK, 280/283 tests PASS (3 errores ambientales de symlinks en Windows), generación TS determinista bit a bit (SHA-256 idéntico), strict-quality bloquea starter (evidencia 22)
- **Sin ejecutar**: browser, GPU, WebGPU runtime, red, imágenes remotas, referencias comerciales

## Veredicto resumido

```text
OPS-IMG2THREEJS-INTAKE-01: COMPLETED / READY_FOR_CODEX_REVIEW
ROLE: ASSET_FORGE_CANDIDATE (no REFERENCE_ONLY, no REJECT — con fixes previos)
LICENSE: Apache-2.0 / VERIFIED (copyright 2026 hoainho; relicense MIT→Apache en 7b1c62c)
WEBGPU_TSL: STATIC_REVIEW_COMPLETE / ADAPTER_DECISION_RECORDED (ADAPTER_REQUIRED para presentación; modelo portable)
PILOT: DEVLAB-IMG2THREEJS-ASSET-PILOT-01 — DESIGNED / NOT_EXECUTED
GLOBAL_INSTALL: NO · INTEGRATION: NO
```

## Hallazgos que Codex debe conocer (los 10 más importantes)

1. **El pipeline es 100% Python stdlib** (81 scripts, cero deps) — corre en Windows salvo los 5 scripts que usan `sips` (macOS-only) y el path CS2 (Source2Viewer). (08)
2. **Parser PNG propio SIN límites** en **5 copias** (no 4): OOM explotable con archivos de ~65 bytes, decompression bombs, tuplas de 72 B/px, sin timeout en sips. Gate de admisión obligatorio antes de ingerir imágenes no confiables. (09 + 25a)
3. **Inyección de código en el TS emitido**: 3 interpolaciones crudas en comentarios (generate_threejs_factory.py:1020/:1021/:1169) → spec malicioso = código arbitrario en el artefacto. Fix de 3 líneas BLOQUEANTE antes del piloto. El pipeline nunca ejecuta el TS (atenuante: no es RCE del host). (12 + 25a)
4. **divine_eye.py y vlm_gate.py son módulos huérfanos** — el "harness heart" y la "VLM last layer" documentados NO están cableados al flujo real; el gate determinista efectivo es Tier 1 de diagnose_render.py, y append_review NO valida tier1Results antes de aceptar `continue`. (25b)
5. **ground-blade winding CONFIRMADO inside-out** (análisis de producto vectorial completo: manto ±z y bevels con normales hacia adentro; la hoja se culled desde afuera con FrontSide). No usar en el piloto; verificar/reparar antes. (13 §1.11 + 25b §7)
6. **El mismo agente construye, captura, elige ángulo, define críticos y se auto-puntúa** — el Gauntlet Loop de DevLab (roles separados) es la corrección estructural; fix mínimo de una línea: append_review debe exigir tier1Result pasado con renderHash coincidente. (15 + 25b)
7. **strict-quality = validador normal + promoción de warnings `quality:`** — gate de profundidad de autoría, NO de generabilidad: NaN/Infinity/dimensiones negativas/ciclos pasan; el generador no re-valida. (11)
8. **bake_projected_texture.py es descriptor-only** — "projection-first" del README/SKILL es aspiracional a este pin; no hay bake de píxeles. (14 §8.5)
9. **El runtime generado es stateless y 100% recreable** (seeds deterministas hashString, sin loops/listeners/audio) — device-loss = dispose + re-llamar el factory; falta el contrato disposeModel + DevLabCaptureTarget. (17)
10. **Performance budget declarativo, no ejecutivo** — nada mide nada; perfiles MOBILE/DESKTOP/HERO/BOSS/SPRITE_RENDER_SOURCE propuestos en 18; SPRITE_RENDER_SOURCE es el caso que mejor le calza (determinismo por seed) pero prohíbe referencePbr externo. (18)

## Lo que Codex debe hacer (siguiente paso)

1. **Aplicar los fixes bloqueantes** (25a §Fixes): R1-R3 (3 líneas), gate de admisión de imágenes en las 5 copias del parser, timeout en sips. Recomendados: finitud, clamps, Object.create(null), validar currentPass.
2. **Ejecutar DEVLAB-IMG2THREEJS-ASSET-PILOT-01** (contrato 23, runbook 24): CINDER RELAY DRONE con referencia original (Kimi/image_gen), outputs A (runtime WebGPU vía adaptador 16 §3) y B (atlas vía GVF cuando exista el puente glTF).
3. **Integrar con el Gauntlet Loop**: BUILDER/CRITIC_VISUAL (rol separado + tier1Result/renderHash check)/CRITIC_TÉCNICO (métricas reales + winding del TS)/DEVLAB (capturas deterministas)/INTEGRATOR (correcciones 3×6).
4. **NO tocar** el path CS2 (marcas Valve), ni instalar la skill globalmente, ni modificar DevLab sin aprobación.

## Restricciones para Codex

- No usar el checkout `img2threejs-intake\source` como instalación global; el piloto corre en un sandbox descartable.
- Rutas protegidas del sprint: devlab-mcp*, threejs-game-skills-intake, r3f-intake, game-visual-forge, GalaxyRaiders*, Hellbullet, %USERPROFILE%\.codex/.claude/.agents.
- Si el piloto usa el generador sin FIX-1 → rechazar (inyección).
- Reportar con los gates del contrato 23.
