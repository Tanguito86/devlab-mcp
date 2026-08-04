# ASH RELAY — generated benchmark prompt

<!-- GENERATED FROM benchmark-contract.json (ab04-v2). DO NOT EDIT. -->

Build a complete 3–5 minute elevated-view 3D arcade action
vertical slice named **ASH RELAY** using the supplied **devlab-internal-threejs-game-benchmark-v1**
scaffold. Use Three.js WebGPURenderer on native-webgpu; WebGL fallback is not an
acceptable benchmark result.

## Setting and loop

An abandoned relay station on an ash-covered moon. Original industrial forms with a charcoal, steel, cyan and orange palette.

Carry an energy core, activate two relay nodes, survive the encounters, defeat the final guardian and evacuate.

## Required content

- title screen
- short tutorial
- movement
- aiming or attack direction
- primary action
- two distinct enemy types
- visible progression
- functional checkpoint
- pause and resume
- defeat
- clean restart
- checkpoint restoration
- mini-boss
- victory
- HUD
- desktop controls
- touch controls
- impact feedback
- local procedural audio
- deterministic frozen capture states

## Required technology

- Three.js
- WebGPURenderer
- native WebGPU hardware
- visible TSL material or effect
- TypeScript
- the internal DevLab scaffold
- fixed timestep simulation
- render interpolation
- seeded RNG
- pooling for projectiles and frequent effects

## Frozen capture states

- title
- tutorial
- encounter-1
- checkpoint
- encounter-2
- boss
- defeat
- victory
- mobile-active

## Shared execution contract

- exact model/build policy: same-exact-model-and-build-within-pair
- reasoning effort: ultra
- world seed: 424242
- desktop viewport: 1280×720
- mobile viewport: 390×844
- active agent time per leg: 240 minutes total
- independent builder runs per leg: 1
- implementation cycles: 1
- correction cycles: 2
- maximum total agent passes: 3
- frozen captures per state: 2
- bot playtests per leg: 10
- performance repetitions per scenario: 3
- performance scenarios: idle, encounter-normal, stress, boss, mobile
- simulation: 60 Hz fixed timestep with at most 8 catch-up steps

## Forbidden

- external services
- paid APIs
- CDNs
- commercial assets
- Galaxy Raiders assets or code
- Hellbullet assets or code
- code from other games
- WebGL presented as WebGPU
- React Three Fiber
- external scaffolds
- upstream scripts or generators

## Required validation

- frozen dependency install
- build
- typecheck
- browser QA
- bot playtest
- exact repeated frozen captures
- desktop and mobile resize
- repeated restart and resource lifecycle
- native adapter diagnostics
- device-loss recovery
- zero external network requests
