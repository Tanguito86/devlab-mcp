# License review — webgpu-claude-skill (pin af2319bd)

## Declarado

- `README.md` (línea 157-161): "MIT License" + "Code examples derived from
  [Three.js](https://github.com/mrdoob/three.js) (MIT License)."
- `.claude-plugin/plugin.json`: `"license": "MIT"`.

## Material

- **No existe archivo `LICENSE`/`COPYING` en el checkout** (24 archivos
  listados por `git ls-files`; ninguno de licencia). Verificado: ningún path
  con `license` en el árbol.
- Los 5 `examples/*.js` y `templates/*.js` declaran en su cabecera "Based on
  Three.js examples (MIT License)" / "derived from Three.js (MIT)".

## Veredicto

```text
DECLARED_LICENSE: MIT
LICENSE_FILE_PRESENT: false
LICENSE_STATUS: UNRESOLVED / SUBSTANTIAL_REUSE_NOT_AUTHORIZED
```

La falta de archivo de licencia material deja la reutilización sustancial en
un estado no autorizado (mismo caso que threejs-skills y jungle-trail). El
contenido puede estudiarse como referencia de arquitectura; la adaptación
para DevLab debe reescribirse desde la documentación oficial de Three.js.

Nota adicional: el propio repo declara que los ejemplos derivan de Three.js
(MIT). Dado que el archivo LICENSE está ausente, la cadena de derivación no
puede verificarse formalmente; la vía limpia es la reescritura propia.
