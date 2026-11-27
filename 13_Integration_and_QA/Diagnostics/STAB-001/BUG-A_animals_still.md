# STAB-001 · Bug A: "animals standing still" (diagnosis only)

Repo `Astrix`, branch `deploy/boxd`, HEAD `6e7fc61`. Nothing under `Game/` or anything tracked in git was changed. Scratch scripts live in `/projects/sandbox/.tools/scratch/stab-a/`. The browser probe is `/projects/sandbox/.kiro/artifacts/screenshots/probe/stab-a-motion2.js`, run against a copy of `Game/dist` in `probe/dist-stab-a`.

## Summary

The owner saw animals standing still. Two defects in the settlement rules v3+ animal movement (`sim/homestead.ts` `liveAnimal` / `walkAnimal`) cause it. Both happen on a fresh v6 homestead with no upgrade involved and with every trough supplied.

1. **Root cause 1, proven: animals permanently frozen inside shelters.** Founding places animals with `randomPointIn` over the whole pen rectangle, and births copy the mother's position. Neither checks the walk grid. The coop, sty and paddock shelters are 4×3 blocks of `occupied` cells (`homesteadNavFeatures`, lines 416-418). Some of those cells have no legal move to any free neighbour, because the fence or other shelter cells surround them. An animal standing on such a cell never gets a route (`findPath` returns `no_route` after 1 expansion), so `liveAnimal` resets its target every time (line 2011) and it stands there forever. It still "eats" by grazing in place, so it never starves, and the herder never notices it. Its piglets, calves and chicks are born on the same cell and freeze too.
   - Seed 1337 (the default world): 3 of the 15 starter animals are frozen from tick 0 (`animal:001` chicken, `animal:009` sow, `animal:014` mare). After 3 in-game days, **7 of 29 animals had moved 0 times in 900 ticks**, including all 4 piglets of sow 009.
   - Across 15 seeds: 0 to 3 starters frozen per seed (14 of 225 in total), and 0 to 7 of all animals frozen after 3 days.
   - Live build: the same three animals had 0 sim moves in 129 ticks and 0 drawn moves in 719 frame samples. The screenshot shows the mare standing under the paddock shelter.
2. **Root cause 2, proven: a dead band parks moving animals until their next meal.** A wander goal is reached within `reach: 8` dm (line 2009). The search counts the start cell as reached when its centre is within 8 dm of the goal, even if the goal lies in the next cell. `walkAnimal` then walks to the centre of its own cell (lines 2043-2047) and stays there. A new target is only picked once the animal is closer than `ANIMAL_SPEED` = 7 dm to it (line 1993). An animal left 7 to 8 dm from its target never picks again. Only the next meal resets the target, about every 120 ticks by day and 240 ticks at night, which is 4 to 8 minutes of real time.
   - Fresh v6, seed 1337: 4,545 animal-ticks were stuck this way (7 to 8 dm from target with no step), 28% of all stationary ticks.
   - The median "longest still stretch" per animal is 136 ticks (4.5 min).
3. **Contributing, by design: low activity even when nothing is broken.** A free animal re-picks a target with only a 6% chance per tick, about 33 s on average. It walks at 0.35 m/s and covers about 2 m. Eating is instant in the sim and is drawn as a 1.8 s head-down once per meal (about 0.75% of the time by day). There is no graze, rest or react behaviour for homestead animals. In the coop and sty, 50% of random targets fall on a blocked cell, which fails the route and wastes the pick. Even with both defects fixed in a scratch copy, animals move in only about 20% of ticks.

**Ruled out with numbers:**
- **Herder workload and feed:** no animal was ever hungry without food (0 ticks), troughs never went below 10 water, and no animal starved.
- **Old-save upgrade:** a fresh v6 homestead shows the fault with no upgrade.
- **Night:** the sim moves animals as much at night as by day (12.3% vs 13.2% of ticks).
- **Rendering:** drawn motion tracks sim motion one-to-one, and the drawn position lags the sim by at most one step (0.78 m).

## Reproduction

All commands run from `Astrix/Game`:

```
npx esbuild ../../.tools/scratch/stab-a/run.ts --bundle --platform=node --format=esm --external:three --outfile=../../.tools/scratch/stab-a/run.mjs
node ../../.tools/scratch/stab-a/run.mjs fresh 6 3 1337           # fresh v6, 3 days, seed 1337
node ../../.tools/scratch/stab-a/run.mjs fresh <v> 3 1337         # fresh v1..v5
node ../../.tools/scratch/stab-a/run.mjs upgrade <from> 3 1337 600 # 600 ticks under v<from>, journaled upgrade_homestead rules 6, then 3 days
node ../../.tools/scratch/stab-a/map.mjs 6 1337                   # ASCII map of pens: no-exit cells (#) and animals standing on them
node ../../.tools/scratch/stab-a/stuck.mjs 6 1337                 # pos/target/cell block/findPath result for the frozen animals
node ../../.tools/scratch/stab-a/odds.mjs                         # share of placement area on no-exit cells; snapshot/validate round trip
node ../../.tools/scratch/stab-a/fauna.mjs                        # wildlife motion share, day vs night
```

(`.mjs` files are built from the same-named `.ts` with the esbuild line above.)

In the browser (live build): use fresh storage with `astrix:entered:v1=1` and `?chain=0&metrics=1&tx=-26&ty=12&tz=4&yaw=0&pitch=50&dist=26`. Do not use `ui=0`, because it disables the homestead. Wait for the page to load, then look at the paddock shelter: the mare under it never moves.

The game commands (`found_homestead rules 6`, `tick`, `upgrade_homestead`) all go through `GameSession.dispatch`, the same journaled path the client uses.

## Measured results

### 1. Headless, 3 in-game days (900 ticks), seed 1337

"Moving" means the position changed during the tick. "Frozen" means 0 moves in the whole window.

| run | final rules | animals | moving | day | night | dm/tick | frozen (0 moves) | dead-band ticks (7–8 dm) |
|---|---|---|---|---|---|---|---|---|
| fresh v1 | 1 | 24 | 25.1% | 25.1% | 25.1% | 1.61 | 0 | 0 |
| fresh v2 | 2 | 25 | 26.8% | 26.3% | 27.4% | 1.73 | 0 | 0 |
| fresh v3 | 3 | 27 | 11.0% | 10.6% | 11.5% | 0.72 | 9 | 4,530 |
| fresh v4 | 4 | 29 | 12.3% | 13.1% | 11.1% | 0.80 | 7 | 4,875 |
| fresh v5 | 5 | 29 | 12.8% | 13.2% | 12.3% | 0.83 | 7 | 4,545 |
| fresh v6 | 6 | 29 | 12.8% | 13.2% | 12.3% | 0.83 | 7 (001, 009, 014, 019, 020, 024, 025) | 4,545 |
| v1 → v6 (after 600 v1 ticks) | 6 | 30 | 13.4% | 13.9% | 12.8% | 0.88 | 0 | 8,482 |
| v2 → v6 | 6 | 32 | 11.2% | 11.8% | 10.4% | 0.73 | 7 | 8,611 |
| v3 → v6 | 6 | 31 | 9.8% | 10.2% | 9.2% | 0.64 | 9 | 7,487 |
| v4 → v6 | 6 | 33 | 11.3% | 11.7% | 10.8% | 0.74 | 7 | 8,163 |
| v5 → v6 | 6 | 34 | 10.5% | 11.5% | 9.2% | 0.69 | 8 | 8,482 |

The upgrade rows cover 900 measured ticks after the upgrade, so their dead-band counts are not directly comparable with the fresh rows.

Why animals stood still in fresh v6 (share of all stationary animal-ticks):
- 62.4%: idle at target, waiting for the 6% re-pick. This includes the frozen animals, whose target is reset to their own position every tick.
- 36.8%: has a target but took no step. 4,545 of these were 7 to 8 dm from the target (the dead band) and 1,381 were 5 to 6 dm (waiting for the 6% roll).
- 0.7%: meal ticks.
- 0.1%: route failed.

Hungry with no food: 0 ticks. Starving: 0 ticks. Herder tasks over 900 ticks: rest 318, collect 152, water_trough 124, eat 95, idle 72, shear 66, milk 43, none 30. Troughs stayed at water ≥ 10 and grass at 96-100.

Per-animal (fresh v6, seed 1337):
- Free starters move in 9 to 29% of ticks.
- Their longest still stretch is 75 to 251 ticks (2.5 to 8.4 min).
- The frozen ones have a longest still stretch of 900 of 900 ticks.

Across 15 seeds (1-10, 42, 1337, 2024, 31337, 99999), fresh v6, 3 days:
- Moving: 11.4 to 14.4% of ticks.
- Frozen starters per seed: 0 to 3.
- Frozen animals in total per seed: 0 to 7.
- Median longest-still per animal: 127 to 167 ticks.

### 2. Proof of the shelter trap (`map.mjs`, `stuck.mjs`, `odds.mjs`)

Sty at founding, seed 1337. `#` is a blocked cell with no legal move out, `+` is a blocked cell with a way out, `.` is free, and a capital letter is an animal on a blocked cell:

```
  -4 .##P+...      P = animal:009 (sow) on a # cell: fence to the north, shelter cells on the other sides
  -3 .####+..
  -2 .+P++...      P = animal:010 on a + cell: can step out (it moves 9.3% of ticks)
```

The frozen animals' state at t0 and again at t600 is identical:

| animal | cell / block | target | findPath result |
|---|---|---|---|
| `animal:001` chicken | (-37,-3), `shelter:coop` | = position | `no_route`, expanded 1 |
| `animal:009` pig | (-18,-4), `shelter:sty` | = position | `no_route`, expanded 1 |
| `animal:014` horse | (-29,6), `shelter:paddock` | = position | `no_route`, expanded 1 |
| `animal:019` (piglet of 009) | (-18,-4), `shelter:sty` | = position | `no_route`, expanded 1 |

Share of the `randomPointIn` area (6 dm padding) that lands on a no-exit cell:

| pen | no-exit cell | any blocked cell |
|---|---|---|
| coop | 18.4% | 50.2% |
| sty | 23.9% | 50.2% |
| paddock | 3.3% | 9.1% |
| pen | 0% | 2.5% |

The "any blocked cell" share applies to every wander target, which also wastes picks.

The trap survives save and reload. After `homesteadSnapshot` → JSON → `validateHomestead`, animals 001, 009 and 014 are still on no-exit cells. Positions are saved state, so a reload cannot free them.

### 3. Fix effect (scratch copy only: `stab-a/patched/src`, env flags, not a proposed patch as written)

- `FIX_TRAP`: an animal on a no-exit cell is moved to the nearest free cell in its pen.
- `FIX_BAND`: when the route is empty because the start cell already satisfies the goal, the target counts as reached.

| seeds 1337 / 8 / 10 | moving | frozen | longest-still median |
|---|---|---|---|
| current v6 | 12.8 / 11.5 / 11.8% | 7 / 6 / 6 | 136 / 147 / 167 |
| FIX_TRAP only | 14.0 / 14.0 / 13.4% | 0 / 0 / 2* | 150 / 134 / 137 |
| FIX_BAND only | 16.4 / 17.8 / 16.0% | 7 / 5 / 8 | 93 / 73 / 79 |
| both | 21.4 / 21.7 / 21.9% | 1* / 0 / 2* | 67 / 73 / 72 |

\* These remaining entries are animals born late in the window. Their 0 moves come from a short life in the window, not a trap: their longest still stretch is at most 130 ticks.

With both fixes the "had target, no step" class falls from 5,926 animal-ticks to 0. That shows the dead band is the whole of that class. Seeds 1 and 42 give 20.0% and 19.2% moving with both fixes.

### 4. Night and rest (question 3)

- `DAY_TICKS` = 300 and `TICK_SECONDS` = 2, so one day is 600 s of real time. Night is ticks 171 to 290 (120 ticks), which is **240 s, or 40% of a real-time session**.
- The sim does not rest animals at night. Only hunger slows (+1 every 4 ticks instead of every 2). Moving share is 12.3% at night and 13.2% by day.
- The renderer lies an animal down when it is night, it is not walking and it is not eating (`render/homestead.ts:369`). So at night about 87% of animal-ticks are drawn lying down.
- A night visit could therefore look static. But the frozen animals are just as still by day (0% day, 0% night), and the browser sample was taken in daylight (ticks 2 to 131). So night rest does not explain the frozen animals. It does add to the general "static" impression.
- There is no separate rest behaviour or rest duration for homestead animals.

### 5. Rendering (question 4): browser, live build copy, fresh v6 save, 180 s, daytime

The probe sampled `window.__metrics.homestead.herd` (sim) and the drawn `herd_<species>` InstancedMesh matrices every 250 ms. It read the scene by wrapping `renderer.render`, read-only. Results:

- **Drawn motion matches sim motion one-to-one.** Every tick the sim moves an animal gives about 6 drawn samples of motion. For example `animal:013` horse moved in 55 of 129 sim ticks and in 323 of 719 drawn samples. `animal:007` goat moved in 4 of 129 and in 34 of 719.
- **Drawn position stays within one step of the sim.** The largest gap was 0.68 to 0.80 m, the interpolation lag.
- **Leg swing appears in about 90% of moving samples.** Head-down appears in 2 to 6 samples per animal (meals). Lying was 0 (daytime).
- **Every batch is visible with the correct count:** cattle 2, chicken 5, goat 2, horse 2, pig 2, sheep 3.
- **The three trapped animals (001, 009, 014): 0 of 129 sim moves, 0 of 719 drawn moves.**
- Screenshot: `.kiro/artifacts/screenshots/probe/stab-a-farm.png`. The mare stands under the paddock shelter.

No rendering defect was found: frustum culling, slot reuse and interpolation all behave correctly. One small point: the final partial step of a walk can fall under the `walking` threshold (0.15 m/s), so it slides without leg swing for one tick. That is cosmetic.

### 6. Wildlife (question 5), `fauna.mjs`, seed 1337, 625 chunks around the origin, 150 s, no threats

- **Rabbits:** move in 31.7% of steps by day (graze 43%, wander 30%, rest 24%). At night they move in 0.1% (sleep 98%), because they are `diurnal` and `sleep` comes back every 8 to 18 s all night.
- **Trout:** move in 90% of steps.
- Deer, fox and wolf did not spawn in this area, so they were not measured. The same code applies to diurnal deer.
- Wildlife does not freeze by day, so it does not match "on their farm". At night diurnal wildlife is fully still, which is by design.

### 7. New vs existing saves (question 6)

- **v1/v2 saves (legacy wander):** straight-line movement with no grid, so neither defect exists. They move in 25 to 27% of ticks.
- **Upgrading to v6 (journaled):** any animal that happens to stand on a no-exit shelter cell at that tick freezes from then on. In the measured runs: v1→v6 0 frozen, v2→v6 7 frozen. The dead band applies to every v3+ save.
- **New v6 homesteads:** affected from founding, and the count grows as frozen mothers give birth.
- **Reload:** the state is stored in the save, so it persists across reloads. Reload neither causes it nor clears it.

## Root causes (files and lines)

1. **No-exit spawn and birth cells under v3+ rules.**
   - `Game/src/sim/homestead.ts:648`: founding uses `randomPointIn` with no walk-grid check.
   - `homestead.ts:749-755`: `randomPointIn` itself, which is also used for v3 wander targets at lines 1999 and 2002.
   - `homestead.ts:1916-1917`: births at the mother's position.
   - `homestead.ts:416-418`: the shelter blocks.
   - `homestead.ts:2010-2013`: a failed route resets the target and the animal stands.
   - `Game/src/sim/nav.ts:545-568`: `moveCost` needs a free destination cell, so the animal cannot leave.
2. **Goal reach larger than the arrival threshold.**
   - `homestead.ts:2009`: `reach: 8`.
   - `homestead.ts:1993`: re-pick only when the distance is under `ANIMAL_SPEED` (7).
   - `nav.ts:785`: the start cell counts as the goal.
   - `homestead.ts:2043-2047`: an empty route means "walk to own cell centre".
3. **Contributing (design):**
   - `homestead.ts:1993`: 6% re-pick per tick.
   - `homestead.ts:1985-1990`: meals are instant.
   - `render/homestead.ts:349`: eating is drawn for 1.8 s.
   - No graze, rest or react states for homestead animals.

## Proposed correction (not implemented)

Everything must sit behind **settlement rules v7**. v3 to v6 journals and saves have to replay to their recorded hashes, and every behaviour change here changes hashed state. Apply v7 with a journaled `upgrade_homestead { rules: 7 }` in `app/homestead.ts ensureFounded`, the same way v6 is applied.

1. **Valid cells only.** Under v7, founding positions, birth positions and wander targets come from free walk-grid cells inside the pen. For example, `randomPointIn` retries or snaps to the nearest free cell in a fixed ring order, deterministically, using `rnd` only.
2. **Unstick on upgrade and every tick.**
   - In the v7 upgrade: every animal on a blocked cell is moved to the nearest free cell in its own pen, in a fixed ring order.
   - In `walkAnimal`: when the start cell is blocked, search with the start cell's own blocked region passable, so the animal walks out visibly instead of jumping. This also covers a shelter or trough added under an animal later.
3. **Consistent arrival.** In `walkAnimal`, an empty route means the goal is reached: set `tx/tz = x/z`, or step to the goal point if its cell is free. Alternatively make the arrival threshold equal to the goal reach.
4. **Optional, needs an owner decision because it is a design change:** visible behaviour states for homestead animals:
   - graze for several ticks with the head down,
   - rest or lie down by a schedule,
   - walk to the trough to drink,
   - react to the player or herder,
   - shorter idle (for example 12-15% re-pick instead of 6%).

## Risks

- Changing v3-v6 behaviour without a new rules version would break hash replay of existing journals and the M012-M014 tests that pin hashes.
- A teleport in the upgrade is visible for one tick. Walking out is preferable. The renderer's `SNAP_DISTANCE` snap stops a slide across the pen.
- Moving more animals costs more route searches. `ANIMAL_TICK_BUDGET` (20,000) and the `NAV_TICK_BUDGET` timings in the M012/M015 perf evidence need re-measuring.
- Excluding shelter cells reduces each pen's usable area: coop and sty by about 40% of cells. Capacity rules may need a check.

## Tests required

- **v7 founding:** no animal's cell is blocked, on several seeds including 1337, 8 and 10.
- **v7 births:** a calf, piglet or chick is never placed on a blocked cell.
- **v7 upgrade:** a v6 save with animals on no-exit cells (seed 1337: 001, 009, 014) leaves 0 animals on blocked cells after `upgrade_homestead rules 7`. The upgrade is journaled and replay gives the same hash.
- **Dead band:** a v7 animal with its target 7 to 8 dm away in a neighbouring cell re-picks within the normal idle time.
- **Regression:** over 900 ticks on several seeds, every animal alive at least 300 ticks moves at least once, and its longest still stretch is at most N ticks (for example 120 if behaviour stays as now). Measure both day and night.
- **Compatibility:** v1-v6 replays keep their recorded hashes (existing m006, m007, m010, m012, m013 and m014 hash tests).
- **Browser:** drawn instance motion stays within one step of the sim, with no animal at 0 drawn moves over 3 minutes, for a fresh save and an upgraded save.

## Acceptance criteria

- **Fresh v7 homestead (seed 1337 and at least 10 other seeds):** 0 animals with 0 moves over 900 ticks, not counting animals younger than 100 ticks.
- **Longest still stretch:** at most 120 ticks (4 min) by day for every animal. Night lying is allowed if the owner accepts night rest.
- **Upgraded saves (v2→v7, v5→v7, v6→v7):** the same two criteria apply after the upgrade, and reload keeps it so.
- **Needs and supplies:** no change in feeding and watering outcomes (0 starvation, troughs topped up), and egg, milk and wool rates stay within ±10% of v6.
- **Compatibility and performance:** v1-v6 journals replay bit-identically, and the per-tick nav time stays within the M015 budget.
- **Owner's wish list:** "graze, eat, rest, react" needs the optional behaviour work in correction 4, with visible graze and rest poses. This is not delivered by fixes 1-3 alone, which bring movement to about 20% of ticks.
