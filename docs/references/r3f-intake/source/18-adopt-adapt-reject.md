# 18 — Clasificación ADOPT / ADAPT / REFERENCE_ONLY / REJECT

Pin `0a107412` — fiber 9.7.0 / test-renderer 9.1.1. Criterio: valor para DevLab como segunda vía de producción (juegos de agentes, determinismo, WebGPU/TSL, mobile) ponderado contra costes y riesgos documentados en 04–17.

## ADOPT (usar tal cual, en el benchmark primero)

| Componente | Justificación |
|---|---|
| **@react-three/fiber 9.7.0 (paquete publicado)** | Viable estructuralmente: reconciler lazy (costo por frame ≈ 0 con mutación imperativa, 07 §10), frameloop `never`+`advance` para determinismo (08 §8), WebGPU estáticamente soportado vía `gl` async (09 §1-2), TSL ciudadano de primera clase (09 §3-4), MIT verificado (04). Consumo npm sin lifecycle scripts (06). **Sujeto al resultado del benchmark AB-05.** |
| **@react-three/test-renderer 9.1.1** | Unit tests de scene graph sin navegador, determinístico, snapshots sin uuids (14 §2,5). Separación clara: RTTR = contratos, harness DevLab = runtime (14 §7). Adopción inmediata para el contrato de escena de la slice del benchmark. |
| **zustand ^5 (dep dura de fiber)** | Ya es el store interno de R3F (15 §0.1). Para estado de juego fuera del render: transient updates sin re-renders. Lock-in bajo (15 §1.6). |
| **frameloop `never` + `advance(timestamp)`** | La API determinista que el harness necesita: el reloj de simulación se inyecta como timestamp, `invalidate()` es no-op, `runGlobalEffects=false` permite frames limpios (08 §3,8). |

## ADAPT (usar con modificaciones / condiciones)

| Componente | Condición de uso |
|---|---|
| **Patrón de gameplay (useFrame + refs)** | Válido solo con el contrato: simulación imperativa en typed arrays/pools, React solo para estructura (08 §6-7). Los antipatrones (setState por frame, mount por proyectil, tree-as-ECS) quedan prohibidos por convención del proyecto (08 §7). |
| **useLoader + cache global** | Con política: assets globales sin `clear`, assets de nivel con `useLoader.clear()` en teardown (11 §8 SHARED_CACHE_POLICY). El cache es el mecanismo de recovery post-device-loss (11 §8 DEVICE_LOSS_POLICY). |
| **dispose / ownership** | Con política RESOURCE_OWNERSHIP: declarativo = R3F; primitives/pool/props = app; `dispose={null}` solo puntual, nunca en contenedores de nivel (11 §8). |
| **Pointer events para touch** | Joystick/botones/drag: sí, con capture por pointerId + `touch-action:none` CSS + lectura de `offsetX/Y` del evento (12 §7). Keyboard/gamepad/pointer lock: implementación propia (12 §7-8). |
| **Reconstrucción por args** | Permitida solo en setup; jamás por frame (07 §2.3). Para churn: `<primitive>` con pool. |
| **Eventos → input determinista** | Los handlers solo encolan input crudo con `nativeEvent.timeStamp`; la cola se consume en el fixed timestep; se graba para replay (12 §6). |

## REFERENCE_ONLY (inspirarse, no integrar)

| Componente | Motivo |
|---|---|
| **@react-three/drei 9.105.5** | Alto valor (Hud, Text, Instances, useGLTF — 15 §1.1) pero compatibilidad WebGPU no verificada y mayor lock-in del ecosistema (15 §2). Referencia para patrones; intake posterior propio antes de adoptar. |
| **react-reconciler parcheado (postinstall del repo)** | El mecanismo (vite build CJS→ESM, 06) es un detalle de mantenimiento del monorepo; referencia para entender el bundle, nunca para reproducir en DevLab. |
| **Docs de performance (scaling-performance.mdx)** | Buenas prácticas (instancing, pools, pitfalls) — las afirmaciones numéricas son claims sin repro propio (13 §0,8). |
| **Demo WebGPU.tsx** | El patrón canónico `gl` async + extend + TSL (09 §3); copiar el patrón, no el código. |
| **react-spring / use-gesture / maath** | Patrones de animación/gestos reemplazables; el example ya usa maath `easing.damp` (15 §1.7-1.8). |

## REJECT (no usar para esta vía)

| Componente | Motivo |
|---|---|
| **Checkout del monorepo como fuente de instalación** | Requiere yarn 1 + postinstall + husky (06); el paquete publicado es el canal correcto. El checkout solo como referencia de código. |
| **@react-three/postprocessing (por ahora)** | Compatibilidad WebGPU incierta (15 §1.3); si el benchmark WebGPU falla, es dealbreaker. Monitorear, no adoptar. |
| **@react-three/uikit** | Cero evidencia en checkout, caso de uso dudoso para HUD DOM (15 §1.4). |
| **device loss como responsabilidad de R3F** | R3F no lo maneja (10 §1): NO adoptar la expectativa; DevLab implementa observación/recreación/re-upload (10 §8). |
| **Claims "no overhead / outperforms Three.js"** | Sin evidencia reproducible (13 §0): rechazados como criterio de decisión; solo cuentan los números del benchmark propio. |

## Veredicto de clasificación

```text
ADOPT: fiber core (condicionado al benchmark), test-renderer, zustand, frameloop never+advance
ADAPT: patrones de gameplay (contrato sim imperativa), useLoader (política de cache),
       ownership de recursos, touch input, reconstrucción por args, input determinista
REFERENCE_ONLY: drei, react-reconciler parcheado, docs de perf, demo WebGPU, animación/gestos
REJECT: checkout monorepo como instalación, postprocessing (hasta benchmark WebGPU),
        uikit, esperar device-loss de R3F, claims de perf sin evidencia
```

R3F como plataforma: **HIGH_VALUE_ARCHITECTURE_CANDIDATE** — la decisión final ADOPT/REFERENCE_ONLY se firma con el resultado de DEVLAB-R3F-ARCHITECTURE-AB-05.
