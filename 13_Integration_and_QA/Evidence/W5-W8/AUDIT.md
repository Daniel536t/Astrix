# W5–W8 pre-implementation audit (2026-11-26)

## Verified starting state

These facts were measured before any change.

- **Repository:** local `deploy/boxd` = `origin/deploy/boxd` = `f91ffc9`, a docs-only commit on top of `0e41531`.
- **Live site:** serves `assets/index-Bz63E2dC.js`, build stamp `commit:"0e41531", dirty:false`. The server's `current` resolves to `/var/www/astrix/releases/20261126T105209Z-0e41531`, and the root filesystem is mounted `rw`.
- **W4:** deployed candidate, **not owner-accepted**.
- **Working tree:** only the locally rebuilt `Game/dist` (from the deploy) and two untracked files that are deliberately excluded.

## What exists to build on

| Milestone | Reuse | Missing |
|---|---|---|
| W5 map and navigation | `sim/nav.ts` windowed A* with ford, deep-water and cliff rules and `explainNoRoute` reasons. Pure terrain functions in `sim/world.ts`: `baseHeightAt`, `baseTopMaterialFor`, `REGIONS`, `forestScore`, `rockScore`. `sim/hydrology.ts` and `sim/terrain-v2.ts`. | Minimap, map, fog, discovery, waypoints, world-scale (hierarchical) routing. |
| W6 deposits and mining | `styl_ore` entities, which have no metal type. The felling HP and swing pattern. Gathering items, weights, piles and storage. Reservations. Campfire fuel and cook as a station pattern. The stone pickaxe is already a workbench recipe. | Typed deposits (iron, copper, coal, clay, sand, gravel), mining, ingots, a forge. The catalogue forge is circular: it needs a workshop, which needs iron nails. |
| W7 persistent wildlife | `sim/fauna.ts`: species deer, rabbit, trout, fox and wolf, stable ids, and a designed but unbuilt authoritative tier. `sim/bodies.ts` capsules and journaled presence. | Today wildlife is ambient: frame-stepped in `render/fauna.ts`, not saved, and it respawns per chunk. There is no LOD or tombstones. |
| W8 hunting | Knife tool, `SPECIES.yields`, the event list, and the W4 `died` validation pattern. | Bow, arrows, projectiles, damage, stun, carcass, butchering. Meat, hide and bone items. |

## Dependencies, in order

1. **W5 discovery:** a fog bitset plus a discovered-place set is the base for W6 deposit discovery.
2. **W5 routing:** a coarse grid over pure base terrain plus local `navGrid` windows. W7 reuses the coarse layer for animals beyond the loaded chunks.
3. **W6 forge chain:** a primitive forge or bloomery made from stone and clay, so smelting is not blocked by the circular workshop and nails dependency. The catalogue's later forge and workshop stay locked, with honest reasons.
4. **W7 authoritative tier:** promoted creatures are saved and stepped on the 2 s sim tick. Kill and removal tombstones are filtered at spawn. Ambient creatures stay cheap.
5. **W8:** depends on W7 creatures, the W4 knife and stone or flint arrowheads, so it does not depend on W6 metal. A journaled `shoot` command is resolved by the sim at fixed sub-steps against tick-time capsules.
6. **Content versions:** W5 = v6, W6 = v7, W7 = v8, W8 = v9. Each adds one `upgrade_wilderness` step. Older journals must replay under their own rules.

## Risks

- **Wildlife determinism:** ambient creatures step per frame and depend on which chunks are loaded.
- **Respawn after kills:** a killed animal could reappear when its chunk is regenerated.
- **Save size:** fog must be stored as a bitset, and authoritative creatures must be bounded.
- **Projectile resolution:** a flight is shorter than one 2 s tick.
- **Performance:** the budget is 120 draw calls and 250k triangles, and mobile is sensitive.
