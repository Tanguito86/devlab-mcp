# DevLab Topdown Shooter Kit

Renderer-agnostic TypeScript mechanisms extracted from validated top-down shooter contracts. The package owns clocks, normalized input, pools, bounded queues, encounter sequencing, checkpoints, boss-state causality, lifecycle, capture contracts, and reusable QA helpers. Games retain content, balance, maps, presentation, and objective definitions.

Hard boundaries:

- no Three.js, R3F, img2threejs, game art, enemy names, maps, or balance values;
- no ambient `Math.random`; consumers inject deterministic state and definitions;
- pool capacity is storage, never a global hostile-pressure cap;
- device loss rebuilds infrastructure without mutating simulation state;
- bots and human acceptance are distinct evidence levels.

Import from `@tanguito/devlab-topdown-shooter-kit`. Camera-specific screen/world conversion is supplied through `DirectionTransform`; the kit never owns a camera.
