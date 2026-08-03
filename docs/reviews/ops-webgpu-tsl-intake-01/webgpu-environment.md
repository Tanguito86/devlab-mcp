# OPS-WEBGPU-TSL-INTAKE-01 — WebGPU environment (F7)

## Estado

```text
NATIVE_WEBGPU: NO ACCESIBLE VIA AUTOMATION (BLOCKED / WEBGPU_BROWSER_OR_ADAPTER_UNAVAILABLE)
WEBGL_FALLBACK: no evaluado (el objetivo del sprint es WebGPU nativo; TSL sobre
                WebGL2 backend de three queda como trabajo futuro si se destraba)
PLAYWRIGHT_BUNDLED_CHROMIUM: SIN WebGPU (navigator.gpu ausente con CDP)
```

## Evidencia de probes (2026-08-03)

| Configuración | navigator.gpu | Adapter |
|---|---|---|
| Chrome 150 (sistema) + dump-dom, SIN CDP, perfil usuario | object | **nvidia / turing** (real) |
| Chrome 150 + CDP (Playwright pipe o port), perfil limpio | **undefined** | — |
| Chrome 150 + CDP, perfil del usuario | **undefined** | — |
| Edge 151 + CDP, perfil limpio | **undefined** | — |
| Chromium 148 bundled + CDP | **undefined** | — |
| Chrome 131 CfT + CDP | **undefined** | — |
| Chromium 148 / Chrome 131, perfil limpio, sin CDP | object | requestAdapter cuelga (race GPU process) |
| Chrome 150, perfil limpio, sin CDP, --disable-gpu + swiftshader | object | **null** |

## Diagnóstico

1. **CDP (pipe o puerto) desactiva `navigator.gpu`** en Chrome 150, Edge 151,
   Chromium 148 y Chrome 131 (el modo de depuración remota rompe WebGPU).
   Reproducible 8/8 con Playwright; el mismo Chrome 150 sin CDP expone
   WebGPU con adapter NVIDIA real.
2. Con **perfil limpio sin CDP**, `requestAdapter` cuelga o falla
   intermitentemente (race del GPU process con el adaptador virtualizado).
   El perfil del usuario estabiliza el caso sin CDP.
3. WebGPU por software (--disable-gpu + swiftshader): navigator.gpu existe
   pero `requestAdapter` devuelve null en todas las variantes probadas.

## Implicación para el arnés

El capture harness usa Playwright (CDP obligatorio) → **no puede capturar
WebGPU en este entorno con los navegadores disponibles**. Los fixtures
quedan escritos y el contrato extendido (`__DEVLAB_FRAME__`), pero **no se
declaran verificados**.

## Desbloqueo potencial (documentado, no ejecutado)

- Firefox con WebGPU estable (no instalado en la máquina; el harness está
  atado a chromium).
- Builds de Chromium < 113 o con la restricción CDP removida (no verificadas).
- Un Chrome con perfil persistente pre-caliente + CDP (el perfil del usuario
  falla con CDP; no se encontró combinación).
