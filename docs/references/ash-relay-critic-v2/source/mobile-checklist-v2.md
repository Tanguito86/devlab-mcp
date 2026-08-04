# Mobile Checklist v2 — OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C

Ejecución posterior (tras CORRECTION_BUILD_READY_FOR_REVIEW) en 412×915 y 390×844 (portrait, touch real vía CDP + recorrido humano móvil). Fuente: rubric v2 MOBILE + encounter-plan v2 (mobile-active recipe 390×844).

## Layout y composición (medir en ambos tamaños)

- [ ] Controles táctiles visibles y no ambiguos: joystick + FIRE + ACTIVATE distinguibles
- [ ] Los controles NO cubren: ring de activación, jugador, telegráfico más cercano, gap del boss ni objetivo — en 412×915 y 390×844
- [ ] Safe-area: nada bajo notch/home indicator en portrait
- [ ] El HUD (objective, rail 0/2, health) no se solapa con los pulgares

## Intención de input (nuevo en v2 — AR-09 resuelto)

- [ ] **Activation y pulse son inequívocos**: hold de activación con progreso visible (anillo) NO dispara; FIRE no activa por accidente
- [ ] Sin botón fusionado que cause disparo/activación no intencional (regresión del hallazgo 01B AR-09)
- [ ] Hold táctil 1.25s: el botón de activación muestra progreso; soltar a mitad no commitea
- [ ] Pulse táctil: responde al pointerdown; cooldown 0.145s legible

## Movimiento

- [ ] Joystick 1:1 sin zona muerta excesiva (≤10-15%)
- [ ] Sin drift tras soltar (vel ≈ 0)
- [ ] Pointer cancel: pointercancel no deja joystick pegado ni jugador moviéndose
- [ ] Mover + apuntar a la vez (aim direccional o autoAim consistente)
- [ ] Cambio de orientación a mitad de combate: controles reposicionados sin perder input activo

## Multi-touch

- [ ] Mover + FIRE simultáneos (dos dedos)
- [ ] Mover + ACTIVATE (hold) simultáneos
- [ ] Sin cancelación cruzada entre dedos (pointerIds independientes)

## Legibilidad en portrait (390×844)

- [ ] Telegraph de hatch legible (forma+color, ≥0.65s) en portrait
- [ ] Sweep del boss con zona segura visible en portrait
- [ ] Fan con huecos reconocibles en portrait
- [ ] Floor armed / vulnerability / phase transition distinguibles en portrait
- [ ] Scrapper y Sentry identificables antes del daño en portrait
- [ ] Contraste suficiente contra el deck oscuro (regresión AR-08: objetivo lit ≥ 25% en composiciones de combate)

## Estados y performance

- [ ] Pausa accesible en touch; resume sin tocar sim
- [ ] DEFEAT/VICTORY UI operable con touch (elección explícita, sin auto-restart)
- [ ] Latencia toque→acción < 100ms percibida
- [ ] Sin doble disparo por toque fantasma (touch-action correcto)
- [ ] Resize/orientación no produce reflow visible durante combate

## Recorridos requeridos (ejecución posterior)

1. **1 victoria móvil humana completa** (touch exclusivo) — registra HUMAN_MOBILE_TIME (timing-contract-v2.json).
2. **Adversariales móviles**: AV-12 (pointer cancel), AV-13 (multitouch), AV-14 (resize).
3. **Captura mobile-active** en 390×844 con controles visibles (composición del contrato).

## Umbrales de severidad

- FAIL en intención de input (activation/pulse ambiguos) = **P1** (gate TOUCH_MAIN_PATH).
- FAIL en pointer-cancel o multitouch = **P1 alto**.
- FAIL de legibilidad de telegraph/sweep/fan en portrait = **P1** (ledger D2, G4).
- Regresión de contraste (lit < 25% en combate) = **P2** (ledger G4/H1).

Registrar en `mobile-results-v2.md` al ejecutar.
