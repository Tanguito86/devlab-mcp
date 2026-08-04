# 07 — Contrato de pooling — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Heredado de los pools reales (simulation.ts: ENEMY_CAPACITY 24, PROJECTILE_CAPACITY 96, IMPACT_CAPACITY 48, PARTICLE_CAPACITY 192) + contrato v2 (pool = storage, presupuestos locales por encuentro).

| Cláusula | Valor / regla | Fuente validada |
|---|---|---|
| capacity | fija por pool (preasignada); nunca crece en runtime | sim + test "pools preallocated" |
| active count | `active` + `highWater` (máximo histórico) + `dropped` (rechazos) | diagnostics.pools (crítica 01B: dropped=0 en 10 runs) |
| acquire/release | `acquire(spec)` devuelve slot activo o null; `release`/lifecycle desactiva | sim spawnProjectile/spawnEnemy |
| restart cleanup | clear() total de pools en restartRun | restartRun (crítica 01B en vivo) |
| checkpoint cleanup | clear() de pools en restore (enemigos, proyectiles, telegráficos, efectos) | restoreCheckpoint (crítica 01B en vivo) |
| device-loss rebuild | los pools son DATOS (sim): intactos; solo se re-crea el render (visuales espejo) | device-host + engine recoverDevice |
| overflow policy | agotamiento = skip cosmético o reciclaje seguro; NUNCA stream ilimitado | contrato v2 + test pool bounds |
| diagnóstico | {active, capacity, highWater, dropped} por pool en getMetrics | capture-contract.ts |

## Reglas del kit

1. `Pool<T>` genérico con slots reutilizables (mismo patrón de la sim): find inactive → activar; sin alloc en hot path (los specs pueden ser objetos reutilizados).
2. **Pool ≠ presión**: la capacidad es almacenamiento. La presión simultánea la define el EncounterDirector con sus budgets locales (v2: A 2/2+2/2, B 5/5, P2 2 activos/3 requests). El kit NUNCA impone un cap global.
3. Los pools de efectos (impacts/partículas) son cosméticos: su agotamiento no altera la simulación (skip determinista).
4. El `dropped` cuenta como diagnóstico, no como fallo (salvo que un encuentro dependa de él para completarse — ese caso es un bug del consumidor).
5. Colisiones fuera del pool: el kit provee utilidades de distancia/círculo; la lógica de colisión es del consumidor (kinds).

## Mapeo de capacidades de referencia (Ash Relay)

| Pool | Capacidad | Overflow esperado |
|---|---|---|
| enemies | 24 | drop (encounter budgets evitan saturación) |
| projectiles | 96 | skip |
| impacts | 48 | skip |
| particles | 192 | skip |
