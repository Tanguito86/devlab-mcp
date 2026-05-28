# Galaxy Raiders Example

Real-world canvas game testing with browser-dev-mcp.

## What it does

Runs a smoke test against Galaxy Raiders (a real HTML5 Canvas shmup game):
1. Opens the game at localhost
2. Takes menu screenshot
3. Starts the game
4. Takes gameplay canvas screenshot
5. Collects game state (level, lives, enemies)
6. Jumps to boss level 5 (Crabtron)
7. Takes boss screenshot
8. Collects console logs + page errors
9. Saves all evidence

## Prerequisites

1. Galaxy Raiders installed at `H:\DEV\AGENTE\GALAXY\GALAXY RAIDERS` or set `GR_PATH`
2. DevLab monorepo built: `pnpm install && pnpm build && pnpm setup`

## Quick Start

```bash
# Terminal 1: Start Galaxy Raiders dev server
GR_PATH="${GR_PATH:-/mnt/h/DEV/AGENTE/GALAXY/GALAXY RAIDERS}"
cd "$GR_PATH"
npx http-server www -p 5173 -c-1

# Terminal 2: Run smoke test
cd examples/galaxy-raiders
node run-galaxy-smoke.js
```

## Expected Output

```
━━━ galaxy-smoke ━━━
   ✓ Step 1: navigated to http://localhost:5173
   ✓ Step 2: waited 2000ms
   ✓ Step 3: screenshot → menu.png
   ✓ Step 4: debug enabled
   ✓ Step 5: game started (Enter)
   ✓ Step 6: waited 2000ms
   ✓ Step 7: canvas screenshot → gameplay.png
   ✓ Step 8: game state: level=1, lives=1, enemies=10
   ✓ Step 9: jumped to LV5 Crabtron
   ✓ Step 10: canvas screenshot → boss.png
   ✓ Step 11: console logs collected
   ✓ Step 12: 0 page errors

   Result: 12/12 steps passed ✅

Evidence: evidence/galaxy-smoke/...
```

## What you'll see

- **menu.png** — Galaxy Raiders title screen with stars/nebula
- **gameplay.png** — LV1 with player ship, enemies, bullets, HUD
- **boss.png** — Crabtron boss with attack patterns
- **report.json** — Full execution log with timings
