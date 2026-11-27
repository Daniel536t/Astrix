# M010: villager navigation

**Date:** 2026-11-24 · Branch `deploy/boxd` · local commits only. Nothing was pushed or deployed, so the live site still runs M009.

## Owner request (abridged)

Villagers should treat the settlement as a place they live and work in. That means terrain, buildings with doors, fences with gates they operate, paddocks and troughs, water and bridges, trees by growth stage, and real work destinations. Navigation must drive the authoritative simulation, so deliveries move real inventory. Saplings should be smaller and yield less than old trees. Doors and gates should block when shut, and villagers should react to changes while moving. A failed route should be reported, never hidden by a teleport. The system should be reusable by later professions, with no regressions and no changes to old saves or generation.

## As built

### One reusable module: `Game/src/sim/nav.ts`

| Part | Rule |
|---|---|
| Grid | 1 m cells in a 120 × 120 m window around the farmhouse (`homesteadNavRegion`). The window holds every legal field (fields must be within 45 m), every pen and the store. It is derived state, never saved, and cached per world. |
| Terrain layer | Walking height (`surfaceAt`) and water depth (`waterDepthAt`) for every column. It is rebuilt only when the voxel edit overlay changes (`editVersion`). Neighbouring columns may differ by **≤ 1 m** (a step, cost +6). **≥ 2 m is a cliff** and cannot be crossed. Water **≤ 1 m deep is a ford** (cost +20). **Deeper water is dangerous** and is blocked. |
| Decks (bridges) | A feature rect can give a walking height over water. **The world has no bridges.** Neither generator has a bridge structure, and `buildBridge` in `render/village-kit.ts` appears only in the kit showcase. Deck support is therefore tested on a synthetic bridge only. The river is 40–70 m west of the homestead, so villagers never need to cross it today. |
| Nature and structures layer | Rebuilt when the world revision changes. Trees use their **growth-stage footprint**: sapling radius 0.3 m (1 cell), young 0.6 m (1 cell), mature 1.0 m (5 cells, a plus shape), old 1.5 m (9 cells, 3 × 3). Bushes are walkable at +8. Ore, cairns, waystone and marker block their cell. Built structure modules (M002 house, path, terraces) block a cell when they are taller than a step and low enough to walk into. Rotated modules use their half-diagonal, so the hashed sim uses no trigonometry. |
| Homestead features (`homesteadNavFeatures`) | Farmhouse and well blocks. The farmhouse is solid except the threshold cell behind its **door**. Fences lie on the **cell edges** of each enclosure outline, matching where the posts are drawn. Each pen has one **gate** facing the yard. The hen house, sty house, paddock lean-to, each trough cell, the store and the barn are occupied cells. Each player-marked field gets a fence on its outline with one walk-in gap (`fieldOpening`), and its crop cells cost +3. |
| Search | A* with integer costs (10 straight, 14 diagonal) and an admissible octile heuristic. Open-list ties break on (f, h, cell index), a total order. A diagonal never cuts a blocked corner, a fence or a gate, so every gate crossing is orthogonal. Each search takes an expansion budget. All villagers share **40,000 expansions per tick**; a full search of the window is at most 14,400. When a search runs out of budget, the villager waits a tick and does not move. |
| Route state (`NavState`, saved on the villager) | Corner cells still to walk, the **grid hash** the route was planned on, the destination with its reach, and any gate being opened or held open. Any grid change gives a new hash, and every walker on the old hash replans from where it stands. Examples: a gate locked, a tree felled, a field marked, a voxel edit. Because this state is integers and strings, a restored snapshot continues exactly as the live run did. |
| Movement (`navStep`) | Moves at most `VILLAGER_SPEED` (26 dm/tick) along the route. It re-checks each edge before leaving a cell centre. At a closed gate it stops, opens the gate on its next tick, walks through, and **closes it once it reaches the far cell**. A locked gate, or an edge that became impassable, triggers a replan. There is no straight-line fallback and no teleport. |
| Failure report (`explainNoRoute`) | When no route exists, it searches again with locked gates allowed. If that succeeds, it reports **"the pen gate is locked"** with `by = gate:pen`. If not, it searches with trees and rocks allowed and reports the first tree or rock on that route, with its entity id. If neither works, it reports either "the destination is taken by a building / an occupied space ..." or "no walkable route: cliffs, deep water or fences cut it off". |

### Gates and doors

- The gates are `gate:coop`, `gate:pen`, `gate:sty` and `gate:paddock`, plus `door:farmhouse`. They live in homestead v2 state as `gates: [{ id, state }]`, where state is `open`, `closed` or `locked`.
- `closed` gates are passable to villagers, who open them and close them behind themselves. `locked` blocks everyone. `open` stays open.
- The owner changes a gate with the journaled command `set_gate { gateId, state }`. The Farm panel has a **Gates and doors** list with Open / Close / Lock buttons.
- Gate leaves are drawn from the simulated state: closed across the gap, swung inward when open, and with an iron bar when locked. They are merged into the existing `homestead_troughs` mesh, so they add **no draw calls**.
- Fence gaps in the renderer are drawn exactly where the sim has openings. Enclosure gaps moved from the back (+z) side to the yard (-z) side, where the gates are.
- The farmhouse door is not animated. The cottage model is in the merged static mesh. Villagers disappear inside while resting, as before.

### Villager jobs on top of navigation (homestead v2)

- **Job planning is unchanged** (`plan()` in `sim/homestead.ts`). Every job is still a list of walk and work legs. Each walk leg goes through the **one** API, `navWalk → navStep`, with a goal from `goalFor`:
  - a fixed spot within 0.8 m: field centre, well, store, nest, bed;
  - a trough within 1.5 m (the trough cell itself is occupied);
  - **the animal itself** for milking and shearing, within 1.2 m and re-targeted as it grazes.
- Arriving runs the **existing** effect code (`applyEffect` / `storeCarry`). Inventories change only then. Later professions only need to add legs; they need no new movement code.
- Destinations that moved to the real resource under v2:
  - beds are the threshold inside the farmhouse door;
  - eggs are collected at the nest box inside the coop fence, behind the hen house (it used to be the yard spot outside).
- **Blocked:** the villager keeps its job and its load. `nav.blocked = { reason, by, target, since }` is saved and shown in the panel ("can't get there: the pen gate is locked (n ticks)"), and an event is logged. After **15 ticks** it gives the job up openly:
  - `avoid: [{ target, until, reason, by }]` is saved and shown as "gave up … retries in n ticks";
  - the job is skipped for 150 ticks;
  - the load stays in hand, and other work goes on.
- Idle strolls with no route just stay put.
- Livestock stay inside their enclosure rects, which is unchanged animal movement. The enclosure rect is exactly the fence outline, so animals already respect fences. **An open or unlocked gate does not let animals escape.** That would need escape and round-up rules, which I left as a follow-up. Villagers still close every gate they open, and a test checks that the gates end closed and every animal stays inside on every tick.

### Saplings and save compatibility: "settlement rules v2"

- Growth stage was already a pure function (`growthStage` in `sim/vegetation.ts`) of entity id and scale. The renderer, the inspector and now the sim all use that one function, so the sapling you see is the sapling the sim uses.
- Stage tables (`sim/vegetation.ts`):

  | Stage | Timber | Per cut | Nav footprint | Walking-character trunk (× scale) |
  |---|---|---|---|---|
  | Sapling | 2 | 2 | 1 cell | 0.15 m |
  | Young | 6 | 3 | 1 cell | 0.30 m |
  | Mature | 12 | 4 | 5 cells | 0.45 m |
  | Old | 16 | 4 | 9 cells | 0.45 m |

- **Gating.** Stage timber applies only when the world's homestead is **version 2** (`stageRulesActive`). Generation is unchanged, so entity records still say 12 / 4. On a tree's first cut under v2 the record is set to its stage timber (`applyStageTimber`). Founding a v2 homestead also uses stage timber for the trees it clears.
- **New homesteads.** The game now sends `found_homestead { rules: 2 }`. A `found_homestead` without `rules`, which is what every old journal recorded, still founds a **v1** homestead with straight-line walking. Old journals therefore replay exactly.
- **Existing homesteads.** A v1 save loads with its exact bytes and hash. The app then sends one journaled `upgrade_homestead` command (v1 → v2, all gates closed) and shows a toast. That command is part of history, so replay and compaction work as normal.
- **Schema.** New snapshot fields exist only on v2 (`gates`, `villager.nav`, `villager.avoid`) and are strictly validated. A v1 snapshot is rejected if it contains any of them.
- **Genesis hash** `e659504b056654dc` is unchanged. Genesis has no homestead.
- **Player-character trunk radius** is presentation-tier and not hashed. It follows the stage in every world. Mature and old keep the old 0.45 m, so nothing got bigger and the M009 stuck and banner fixes are unaffected.
- **Bug found and fixed:** `thresh` was missing from the saved-effect validator. A save taken while a farmer was threshing seed was rejected as corrupt on load. The fix only widens validation; no hashes change.

## Automated tests (Node, `npm test`)

`cd Game && npx tsc --noEmit && npm test && npm run build`: typecheck clean, **255/255 pass** (241 before plus 14 in `tests/m010.navigation.test.ts`), build OK. No existing test was changed. The M006–M009 homestead, animal, tree, water and banner tests all still pass, and they run on legacy v1 homesteads.

New tests:

1. **Terrain:** a 1 m step is walkable at +6 both ways, a 2 m ridge blocks and the route goes round it, a 1 m ford is walkable at +20, 2 m water blocks with the reason "cliffs, deep water or fences", and a synthetic deck crosses it. All terrain is shaped by voxel edits on a cleared pad.
2. **Fences and gates:** the only way into a fenced square is its gate, crossed once and orthogonally. The walker stops, opens the gate, passes and closes it. When that gate is locked mid-trip, the walker **replans through the second gate**, opens and closes that one, and never opens the locked gate. With both locked, the result is "blocked: the … gate is locked", naming the gate.
3. **Trees:** sapling, mature and old block 1, 5 and 9 cells. **A tree felled mid-route changes the grid hash**, and the walker replans through the gap the tree stood in and arrives.
4. **Timber by stage** under v2: sapling 2, young 6, mature 12, old 16. A legacy world gives 12 for a sapling and 12 for an old tree. Replay reproduces the result.
5. **Homestead grid:** every pen outline is fenced except exactly one gate, trough cells are occupied, the farmhouse is solid except the door threshold, a marked field has exactly one gap and changes the grid hash, and the store is inside the window.
6. **Herder through the pen gate:** he stands at the cell outside the gate, the gate opens, he is inside the next tick and the gate is closed again. Every entry into the pen used the open gate. Water was delivered, and every animal stayed in its enclosure on every tick.
7. **Locked gate:** the herder reports "Bram cannot reach the trough: the pen gate is locked". He never moves more than 26 dm per tick (+1 for rounding) and never stands inside the pen. He gives up exactly 15 ticks later with `by: gate:pen`, and the report survives snapshot validation. After unlocking, the trough gets its water.
8. **Unreachable spot inside the farmhouse wall:** "the destination is taken by a building", `by: farmhouse`, and the villager does not move.
9. **Full job loop:** he enters the coop, takes 6 eggs at the nest (the coop egg box goes to 0), carries 6 eggs the whole way, and store eggs rise by exactly 6 only when he is within 1 m of the store spot.
10. **Whole farm under v2 for 900 ticks:**
    - fields worked, eggs or milk and wool stored, no animal starving or dead, all gates closed at the end;
    - **no villager ever stands in a blocked cell**;
    - maximum step 26 dm per tick;
    - every search stays within the window.
11. The **farmer harvests and delivers** wheat within 900 ticks (the legacy timeline).
12. **Determinism:** two runs agree. Replay from genesis, restore from a mid-run snapshot plus the journal tail, and dropping all nav caches mid-run all give the live hash. The runs include `set_gate` lock and open commands.
13. **Old saves:**
    - a v1 homestead save has no `gates`, `nav` or `avoid` fields;
    - it restores byte-identical with the same hash, and replays;
    - `set_gate` is refused before the upgrade;
    - `upgrade_homestead` works once, after which villagers navigate;
    - the pre-upgrade snapshot plus the longer journal restores to the live hash;
    - a `thresh` leg now validates.
14. **Genesis** is `e659504b056654dc`. Malformed `set_gate` and `found_homestead { rules: 3 }` commands are rejected and leave the hash unchanged. A bad gate state in a snapshot is rejected.

## Performance (sim)

Node 900-tick v2 run, seed 1337, v2 world, one 6 × 6 field (`.m010-scratch/perf.ts`):

| Measure | Value |
|---|---|
| Villager step per tick (including navigation) | mean **0.24 ms**, p99 1.28 ms, max 5.1 ms |
| First tick | 207 ms. It builds the terrain layer and generates the window's chunks in Node, where no renderer has loaded them (terrain layer total 198 ms). |
| Searches | 88 in 900 ticks: 14,589 expansions in 29 ms. At most 678 expansions and 2 searches in any one tick. |
| Obstacle-layer rebuilds | 584, 154 ms in total (about 0.26 ms each). |

In the browser (Chromium, software GL), from `window.__metrics.homestead.navStats` over the runs below, villager stepping including navigation averaged **about 2.0 ms per tick** (91 ms over 46 ticks). Steady ticks were 1.3–1.7 ms; the max was 9.5–13.4 ms, on the first tick after load, which includes a 5–9 ms terrain-layer build. Chunks were already resident there.

## Browser checks (Playwright Chromium, software GL, about 1 fps; desktop 1000 × 600, not a phone)

**Setup:**
- `Game/dist` was built from this commit and copied to `.kiro/artifacts/screenshots/probe/dist`. It is byte-identical to the committed build (`diff -rq`). It was served at `https://astrix.local/`.
- Saves were made in Node (`.m010-scratch/saves.ts`): seed 1337, generator v2, `found_homestead { rules: 2 }`, a 6 × 6 flax field, then N ticks. They were injected into `localStorage`, so the browser **restored** them. The legacy run used a v1 save.
- The game then ran its own real-time ticks (one per 2 s). Each probe sampled `window.__metrics.homestead` about once per second. Samples include the simulated positions, tasks, loads, gates and store, the drawn figure positions (`view.villagers`), draw calls and triangles.
- Probe scripts: `.kiro/artifacts/screenshots/probe/m010.template.js`, generated with `m010-gen.mjs`. Raw samples are in `browser-samples.json` in this folder.
- **There were no page errors in any run.**

**Simulated vs visual:**
- For each v2 run I compared the browser's simulated positions with Node's continuation of the same save at the same ticks. **They were identical on every sampled tick:** coop 68/68 and 35/35, store 18/18, paddock 42/42. The steward issued no commands during these windows.
- The drawn figures trail the simulated position by up to one tick of interpolation. This is the existing presentation behaviour.
- The legacy run is expected to differ from Node (0/9 identical): Node kept v1 straight lines, while the browser had already upgraded to v2.

| Run | What the samples show (simulated) | Screenshots |
|---|---|---|
| Coop (save at tick 94) | Bram stops at the cell outside `gate:coop` (-33.5, -4.5) with `opening` at tick 111. The gate is `open` at 112. At 113 he is inside (-32.5, -2.3) and the gate is closed. He walks round the trough to the nest (-36.4, -0.6) at 116, has "3 eggs" at 118, and the gate opens again at 123 as he leaves. | `coop-0-loaded.png`, `coop-1-coop-gate-open.png` (he is behind the hen house in this view), `coop-2-eggs-in-hand.png`, `coop-3-leaving.png` (Bram in blue beside the open gate), `coop-9-panel.png` |
| Store (save at tick 118) | Bram carries "3 eggs" from (-44.3, -22.3) to the store spot (-50, -30.4) at 137. At 138 the load is gone and store eggs go 0 → **3**. | `store-9-panel.png` only. Three camera positions left the store hidden behind a tree or out of frame, so those shots were deleted. The delivery is shown by the samples, not by a picture. |
| Paddock (save at tick 636) | Bram walks the corridor between pen and sty carrying "1 water", stops at `gate:paddock` (-21.5, 4.5) at 654, and the gate opens at 655. He fills the trough from (-16.5, 5.5) at 658, returns for a second bucket (out through the gate at 662, closed at 663), and comes back in. | `paddock-1-paddock-gate-open.png` (Bram at the gate, horses and cattle behind the fence), `paddock-2-at-trough.png` (Bram inside the paddock at the trough), `paddock-3-out.png`, `paddock-9-panel.png` |
| Legacy v1 save (tick 104) | Restores with persistence status `saved`, which is impossible after a hash mismatch. It is then upgraded: `rules` = 2 and the toast reads "The homestead now has gates and doors …". Gates and routes appear. | `legacy-0-loaded.png`, `legacy-1-upgraded.png`, `legacy-9-panel.png` |

**Render budget, measured:**
- `__renderBreakdown().totals.all` was **74–93 draw calls** and **129k–168k triangles** across the runs (main plus shadow). `renderer.info` gave 74–93 calls.
- Both are under the 120-call and 250k-triangle budget.
- Gates and gaps add no meshes. `homestead_troughs` is still 1 draw (708 triangles with the gate leaves).

## Tests vs browser, deployed vs merged

- **Tests:** everything in the test list above was checked in Node. That covers determinism, replay, restore, old saves, the genesis hash, locked-gate reports and the job loop.
- **Browser:**
  - restore of v2 saves and the legacy upgrade;
  - real-time ticks with gate use and deliveries;
  - the panel's gate and route lines;
  - draw calls and triangles;
  - simulated positions matching Node.
- **Not exercised in the browser:** locking a gate from the panel, blocked reports and give-ups. They are covered by tests only.
- **Deployed:** nothing. The work is committed on `deploy/boxd` but not pushed or deployed.

## Not done / limits

- **Livestock escape** through open gates is not modelled. Animals are confined to their enclosure rect, as before.
- **The player character does not collide with fences or homestead buildings** (follow-up). Only the trunk radius by stage changed for the player, and it only got smaller. So M009's banner landing and stuck fixes are untouched, but the player can still walk through fences.
- **No bridges exist in the world.** Deck support is ready but only tested synthetically. Shallow fords are walkable at a cost.
- **Villagers do not avoid each other.** Occupied space means buildings, shelters, troughs, the store and the barn, not other walkers.
- No woodcutter, builder or construction-site job exists yet. The navigation API supports them, but this milestone adds no new professions. "Construction site" destinations are therefore untested in play.
- The farmhouse door's open state is not drawn.
- Bushes keep their 4 fiber at every stage. Only trees got stage timber.
- First tick after loading a v2 world: about 5–9 ms in the browser (chunks resident) and about 200 ms in Node (chunks generated).
- In a legacy world before upgrading, and in any world with no v2 homestead, the player's tree harvest still yields 12 wood regardless of stage. This is how the rules are gated, so that old journals replay exactly.
- The browser runs were desktop software GL only. No phone or real GPU was used.

## Live deployment check

Release `20261124T211145Z-0bbc656` was deployed to https://astrix.nyc.boxd.sh. It is pushed to `deploy/boxd` but not merged to `main`. The served bundle matches the local build (`assets/index-DZOn8jKi.js`). A fresh headless Chromium context (software GL, empty storage, `?chain=0`) founded a new homestead with no page errors. All five gates and doors were present and closed (`door:farmhouse`, `gate:coop`, `gate:paddock`, `gate:pen`, `gate:sty`), along with all 15 animals and both villagers. Over settlement ticks 14 to 32 both villagers were idle or between tasks, and Ada moved once from (-32.5, -8.5) to (-33.5, -6.5). The store did not change in that window. Gate use and deliveries were therefore not seen on the live site. They are shown only by the local runs above. Screenshot: `live-0bbc656.png`.
