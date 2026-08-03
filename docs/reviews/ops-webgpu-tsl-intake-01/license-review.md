# OPS-WEBGPU-TSL-INTAKE-01 — license review

## Declarado

- `README.md`: "MIT License" + "Code examples derived from Three.js (MIT License)".
- `.claude-plugin/plugin.json`: `"license": "MIT"`.

## Material

- **No existe archivo LICENSE/COPYING** en el checkout (verificado: 24 paths
  de `git ls-files`, ninguno de licencia).
- Los 7 archivos de examples/templates declaran "Based on Three.js examples
  (MIT License)" en su cabecera.

## Veredicto

```text
DECLARED_LICENSE: MIT
LICENSE_FILE_PRESENT: false
LICENSE_STATUS: UNRESOLVED / SUBSTANTIAL_REUSE_NOT_AUTHORIZED
```

Mismo criterio que threejs-skills y jungle-trail: la ausencia de archivo de
licencia material no autoriza la reutilización sustancial. La referencia se
estudia para arquitectura; cualquier adaptación futura se reescribe desde la
documentación oficial de Three.js.

## Nota de auditoría

El repo declara derivación de Three.js (MIT) sin archivo LICENSE propio. La
cadena de derivación no es verificable formalmente; refuerza la vía de
reescritura propia para DevLab.
