# 05 — Licencia y procedencia

Pin: `b604139` — img2threejs/img2threejs

## Resultado

```text
ROOT_LICENSE: Apache-2.0 / VERIFIED
COPYRIGHT: 2026 hoainho (autor/sponsor; sin aviso de copyright en el texto del LICENSE — Apache no lo exige en el cuerpo; el autor figura en README y en el commit de relicense)
SUBLICENSES: sin sublicencias detectadas (repo 100% propio: 81 py, 48 md, 10 yml, 5 json, 4 jsonl, 1 svg; CERO binarios)
COMMERCIAL_REFERENCE_ASSETS: PRESENTES (ejemplos CS2 con marcas de Valve — no licenciados por el repo)
```

## Verificación

- `LICENSE`: texto Apache-2.0 completo (201 líneas) ✅
- Historial: `7b1c62c chore: relicense from MIT to Apache-2.0 (#16)` — el repo se relicenció; la licencia actual es Apache-2.0 ✅
- `NOTICE`: no existe
- Licencias por subdirectorio: ninguna adicional (grep de LICENSE* en todo el árbol: solo el raíz)
- Assets: `assets/logo.svg` (logo propio del proyecto, inline en README) — sin procedencia externa
- Sin screenshots, fixtures de imagen, datasets ni vocabularios externos en el árbol (0 binarios; los fixtures de tests son JSON/JSONL)

## Referencias comerciales (NO cubiertas por la licencia del repo)

- `skills/cs2-knife.md`, `skills/cs2-pistol.md`, `skills/cs2_technical_analysis.md`, `docs/cs2/`, `docs/cs2-anatomy/`, `docs/raw/`: prompts, contratos y anatomía de **armas de Counter-Strike 2 (marca registrada de Valve)** — p. ej. "Classic Knife | Fade" (skills/cs2-knife.md), Glock-18 (CHANGELOG 1.4.1). Son ejemplos de referencia del pipeline; la licencia Apache del repo **no concede derechos sobre esas marcas, personajes o productos**, y el propio repo los usa como casos de prueba documentales.
- README: badges de sponsors/Trendshift (enlaces externos, no assets).

## Separación de derechos (obligaciones para una futura adaptación)

| Capa | Licencia | Obligaciones |
|---|---|---|
| LICENCIA DEL PIPELINE (scripts, SKILL.md, grimoire, schemas) | Apache-2.0 (hoainho) | Incluir copia de Apache-2.0, preservar notices, **marcar archivos modificados** (requisito §4(b) de Apache para archivos modificados), mantener atribución |
| LICENCIA DEL CÓDIGO GENERADO (el TypeScript que emite generate_threejs_factory.py) | Determinar en adaptación: el código generado es output del pipeline; la práctica prudente es tratarlo como obra derivada del usuario (los templates del generador están bajo Apache) — documentar en la política de DevLab; no implica derechos sobre el modelo/imagen de entrada |
| DERECHOS SOBRE LA IMAGEN DE ENTRADA | Del usuario/remitente | No usar imágenes personales ni comerciales en el piloto; la referencia del piloto será un concepto original (ver 23-24) |
| DERECHOS SOBRE EL OBJETO RECONSTRUIDO | Del usuario (obra derivada de su propia imagen); el código de reconstrucción es generado por la herramienta | Atribución Apache del pipeline si se redistribuye el código generado tal cual |

## Política de atribución propuesta

1. Incluir el archivo LICENSE (Apache-2.0) y una nota de atribución "img2threejs — Copyright (c) 2026 hoainho" en cualquier distribución que incluya los scripts del pipeline o código generado derivado de sus templates.
2. Marcar archivos modificados del pipeline (Apache §4(b)) en cualquier fork/adaptación.
3. No redistribuir los prompts/contratos CS2 como material de marca propia; si se conservan como referencia interna, mantener la atribución al proyecto.
4. El piloto (CINDER RELAY DRONE) usará exclusivamente referencia original (sin marcas, sin IP externa) — eludiendo el problema de derechos de imagen.
