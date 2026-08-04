# 02 — Coherencia de versión

Pin: `b604139f51d6831780240e8cf1d8b21a42401d0a` — img2threejs/img2threejs

## Discrepancia detectada

| Fuente | Versión declarada |
|---|---|
| README.md badge | **1.4.3** (badge verde "version-1.4.3") |
| SKILL.md frontmatter | **1.4.4-beta.3** |
| CHANGELOG.md | `[1.4.4-beta-2]` (unreleased, al tope) + `[1.4.3]` como "accepted current release line" + `1.5.0` marcado "Invalid historical record — not released" |
| Historial git | `549a2e3 chore(release): v1.5.0` + merges beta con `v1.6.0-beta.1` y `v1.4.4-beta.1` |
| Tags remotos | v1.0, v1.3, v1.4.0, v1.4.3 (el pin no tiene tag) |

## Análisis

1. **Qué versión representa el pin**: el pin (`b604139`, 2026-08-03) es el commit de merge "chore: merge beta release infra back to main (#69)" que trae a main la infraestructura de releases beta (workflow de tags) y commits de versión `v1.6.0-beta.1` / `v1.4.4-beta.1`. Es el estado de main **inmediatamente después** de la línea estable 1.4.3, con la infra beta recién mergeada. El código efectivo es la línea 1.4.x con la maquinaria de state machine local (feature de 1.4.4-beta) ya presente.
2. **Si el pin pertenece a una release gobernada**: NO. El CHANGELOG declara explícitamente que "Release publication now occurs only from an approved annotated version tag" (sección 1.4.3) y que el commit `v1.5.0` fue generado por la **automatización retirada** de push-to-main: se retiene como "historical context only and does not represent an accepted release". El pin es post-tag-gobernado pero no es él mismo una release taggeada.
3. **Si main mezcla líneas de versión**: SÍ, históricamente. `549a2e3 chore(release): v1.5.0` (commit de la automatización retirada) está en la historia del pin; el merge #69 trae commits beta de dos líneas (`v1.6.0-beta.1`, `v1.4.4-beta.1`). El CHANGELOG mitiga la confusión declarando 1.5.0 como inválido y 1.4.3 como la línea aceptada — pero README (1.4.3) y SKILL.md (1.4.4-beta.3) siguen sin coincidir entre sí ni con el CHANGELOG (1.4.4-beta-2).
4. **Qué tag antecede/sucede al pin**: antecede `v1.4.3` (2026-07-30, tag gobernado). No hay tag que suceda al pin entre los tags remotos (v1.0/v1.3/v1.4.0/v1.4.3). El pin es un commit intermedio entre la línea estable y la primera release beta taggeada.
5. **Si documentación/schemas/scripts corresponden a la misma versión**: parcialmente. El CHANGELOG 1.4.4-beta-2 describe el state machine local, los ceilings de corrección, CS2 review CLI y los perfiles — todos presentes en el árbol del pin (forge/state.py, forge/next.py, cs2_review.py, perfiles generic/cs2/character en SKILL.md). El frontmatter del SKILL.md (1.4.4-beta.3) es una versión patch más que el CHANGELOG (beta-2), sin entrada propia en el changelog: incoherencia menor de documentación de release. Los fixtures/schemas de CS2 están presentes (forge/tests/fixtures/).

## Resultado

```text
PIN_COHERENCE: MIXED_VERSION_STATE / EXPLICITLY_DOCUMENTED
```

- MIXED_VERSION_STATE: README (1.4.3) vs SKILL.md (1.4.4-beta.3) vs CHANGELOG (1.4.4-beta-2, 1.5.0 invalidado) no coinciden; el pin es un merge de infra beta con historial de una release no gobernada (v1.5.0) en su línea.
- EXPLICITLY_DOCUMENTED: el propio CHANGELOG documenta la situación (sección "Invalid historical record: 1.5.0 — not released") y declara la política de releases gobernadas por tag desde v1.4.3 — la confusión es conocida y mitigada por el repo.
- El contenido técnico del pin es coherente con la línea 1.4.x-beta (state machine, gates, CS2) — no hay mezcla de código de líneas divergentes en los scripts.

**No se cambió el pin** para resolver la discrepancia (regla del sprint). Para un piloto futuro: usar el pin tal cual y reportar la versión efectiva como "1.4.4-beta (pin b604139, post-v1.4.3)".
