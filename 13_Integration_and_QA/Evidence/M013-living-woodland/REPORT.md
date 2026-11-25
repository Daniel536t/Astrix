# M013: living woodland (evidence)

**Date:** 2026-11-25 · **Branch:** deploy/boxd

## Deployed vs merged

- **Not deployed.** Nothing was pushed, and https://astrix.nyc.boxd.sh/ still serves the M012 build. All browser numbers below come from the local build (`Game/dist`) routed at `https://astrix.local/`.
- **Not merged.** The work exists only as local commits on `deploy/boxd`:
  - `9b0412f`: the feature (settlement rules v5).
  - `077c167`: the Farm panel fix that lets the browser probe protect a tree (see "Browser runs"), plus the rebuilt `Game/dist`.
  - The evidence and docs commit that contains this report.

## What M013 adds (settlement rules v5)

### Lifecycle model (`Game/src/sim/woodland.ts`)

**Stages.** A tree is a sapling, then young, mature, old, dying, then a dead snag. After the snag it becomes an empty spot (a "gap"), and later regrows in place as a sapling. A felled tree is a stump, which either resprouts or rots.

**Species.** Each species has its own stage lengths (`GROWTH`). Measured in in-game days of 300 ticks:
- an oak lives about 55 days;
- a birch lives about 24 days;
- birch and cherry grow faster than oak and beech.

**Stump outcome.** A felled broadleaf resprouts with its coppice chance (oak 0.8, birch 0.7, cherry 0.6, beech 0.4). A conifer stump never resprouts and always rots.

**Timber (`TIMBER`).** Yield depends on species and stage:
- young < mature < old;
- dying trees and snags give less;
- oak gives the most, cherry the least.

The woodcutter and the player's harvest both use this one table.

### Determinism approach

**Untouched trees store nothing.** An untouched natural tree's stage is derived from (entity id, epoch, tick):
1. The tree's starting age is placed 15–85 % of the way through its M008 drawn stage, using an id hash. At the epoch, therefore, every tree looks exactly as it did before v5.
2. Its age advances with `tick − epoch` along species stage lengths. Each tree's pace is ±15 %, set by an id hash.

As a result, a chunk loaded late, or loaded in any order, shows the same stages.

**Trees with history get a record.** Felled, partly cut, seeded and planted trees each get a hashed `WoodTree` record (`st` live/stump/gap, born, next event, origin). Due events (snag falls, stump resprouts or rots, gap regrowth) run in a sorted order, at most 16 per tick.

**Random numbers.** There is no `Math.random`. The woodland has its own xorshift stream (`w.rng`, saved), used only for seeding, coppice rolls and new-tree attributes. The homestead stream, and therefore every v1–v4 roll, is untouched.

**What the hash covers.** `woodlandSnapshot` sits inside the homestead snapshot only when `h.woodland` exists. v1–v4 snapshots therefore have no new key, and their hashes are unchanged. The renderer's change channel (`noteTreeChange`) is not saved or hashed.

### Policies (owner, journaled commands)

Five journaled commands go through the normal session path, and all are refused below v5:
- `plant_tree`
- `protect_tree`
- `protect_zone` (2–40 m, at most 8 areas)
- `remove_zone`
- `woodland_policy`

The policy fields (defaults in brackets) are:
- `harvest`: sustainable, by demand, or paused [sustainable];
- `minStage`: fell from mature or from old [mature];
- `keepVeterans`: keep old and dying trees [on];
- `snags`: fell them for poor wood, or keep them for wildlife [fell];
- `buffer`: distance kept from buildings, fields and the store, 0–15 m [5];
- `waterBuffer`: 0–10 m [3];
- `minStanding`: trees that always stay standing, 0–60 [6];
- `replant`: saplings per felled tree, 0–3 [1].

Owner-marked trees (at most 64), protected areas, and the founders' grove are never felled.

**Sustainable quota (`sustainableYield`):**
- Each tree spot in the managed window that is not protected contributes 1/rotation. The rotation is resprout or replant time plus sapling and young time.
- From that sum, `rate` is re-measured once a day and on any policy change.
- `quota` grows by `rate` each tick, with a cap.
- Each managed felling costs one tree.

**Woodcutter.** In order, the woodcutter:
1. plants a sapling already in hand;
2. takes the next replant order: lifts a wildling from a parent within 40 m (3 ticks), then plants it (4 ticks);
3. finishes partly cut trees;
4. fells eligible trees, choosing by route cost.

The forester work is part of the v5 woodcutter role. When idle, the woodcutter states the reason, for example "sustainable quota reached…", "the store has N wood and no site needs more", "only N mature trees stand…" or "felling is paused…".

**Natural seeding.**
- Parents are mature or old trees in the 120 m window.
- Two parents are visited per tick.
- Seeding uses `plantable`, the same suitability test used for planting. It refuses water, buildings, fields, fences, the yard, steep or low ground, and crowded or shaded cells, and gives a reason for each.
- Seeding stops when 500 trees are present.

### `woodlandStats` API for M014

`woodlandStats(world, { x, z, radius, store?, demandPerDay? })` is a pure query (`Game/src/sim/forestry.ts`). It returns null below v5, and it does not change the state hash; a test checks that.

It returns:
- `trees`, `byStage`, `bySpecies`;
- `harvestable`/`harvestableIds`, `protected`/`protectedIds`, `regrowing`;
- `standingTimber`, `harvestableTimber`;
- `meanPathToStore`, `maxPathToStore`, `unreachable` (walking-grid distances, from a cached flood fill);
- `sustainableTreesPerDay`, `sustainableWoodPerDay`, `rotationDays`;
- `spotsForDemand`, `regenerationShortfall`, `quotaTrees`, `policy`.

M014's placement preview can call it for a candidate store position and radius. The Farm panel uses it for its woodland summary.

### Navigation and rendering

- **Walking grid.** The grid follows stages. Tree footprints are sapling 1 cell, mature 5, old 9, and smaller for a snag; a stump is small, and a gap has none. When 64 or fewer claims change, the grid is patched cell by cell instead of rebuilt, and a test proves each patch equals a full rebuild.
- **NatureView.** NatureView updates drawn trees incrementally, on both the multi-draw (`LodBatch`) path and the `multidraw=0` (`TiledLodMesh`) path. It handles chunk loads, the change channel (growth, felling, planting) and a rotating scan of 400 entries per call. It swaps an instance's geometry in place instead of rebuilding.
- **Tree models (`Game/src/render/vegetation-kit.ts`).** New models are dying, dead snag and stump. Near-only root spurs, lumpier broadleaf crowns, layered spruce and a drooping birch crown were added. Mid and far LOD are unchanged. See `04_Art_Director/Reference_Analysis/REF-006_Tree_References_2026-11-25.md`.
- **Dev URL parameters.** `?trees=1` draws a lineup of every species × stage at near LOD. It is presentation only: nothing in it is simulated or saved. `?timescale=N` (1–60) issues the ordinary one-tick commands N times as often, at most 8 per frame; the rules do not change.

## Tests (Node): `cd Game && npx tsc --noEmit && npm test && npm run build`

The typecheck is clean and the build passes. **313/313 tests pass**: 294 from M012, plus 19 new in `Game/tests/m013.woodland.test.ts`. They were re-run after the panel fix and the result was the same.

New tests and what they prove:
1. Founding with rules v5 starts the clock, and at the epoch every tree is in its M008 drawn stage.
2. Each species passes sapling → snag at its own pace; birch and cherry are faster than oak and beech.
3. Timber follows the species/stage table, and a felling yields exactly that table.
4. Felling leaves a stump on the walking grid. Broadleaves resprout and conifers rot. A gap is not drawn, does not block and cannot be harvested.
5. Seeding and planting are refused on water, buildings, fields, fences, the yard, steep ground, and in crowded or shaded spots.
6. Natural seeding fills only suitable ground near mature parents, using the woodland's own random stream.
7. An old tree dies, stands as a snag with poor wood, falls in a scheduled event, and the spot regrows.
8. The same journal gives the same state whatever chunks were loaded, in any order, and whatever the camera.
9. A chunk generated late shows the same stages. A snapshot restored mid-cycle keeps stages, records and hash.
10. Protected trees are never felled: owner marks, areas, veterans and building buffers.
11. The sustainable quota stops felling with a stated reason instead of clear-cutting.
12. With replant 1, the forester lifts a wildling and plants one sapling per felled tree; with replant 0 it plants none.
13. `plant_tree` works, refuses unsuitable ground with reasons, and replay and restore agree.
14. Old saves: v1–v4 hashes are unchanged, the v4 → v5 and v1 → v5 upgrades preserve state, and trees felled before the upgrade get gap records.
15. `woodlandStats` fields are consistent, a farther store gives longer paths, the query leaves the hash unchanged, and it returns null without v5.
16. Walking-grid footprints follow the stage, and every incremental patch equals a full rebuild.
17. NatureView follows growth, felling to stump, and planting incrementally on multi-draw and `multidraw=0`, and matches a full build.
18. Every species has 7 stages × 3 variants, with near > mid ≥ far, far ≤ 36 and near ≤ 260 triangles. Stumps sit low, and a dying tree has fewer blocks than an old one.
19. Strict validation of the woodland commands and of the saved state.

**Pinned old hashes** (fixed command sequence, seed 1337):
- v1 `16ca4c350d98096f`
- v2 `542411888c83bf3a`
- v3 `d2c28283712a8de7`
- v4 `6ce5ae532227eeb9` (measured with the M012 build `7d66e8c`)

Genesis is still **`e659504b056654dc`**.

**Deliberate test changes:**
- m010 and m012 now use `rules: 6` as their example of an invalid value.
- m008.vegetation raised the near triangle bound for a mature tree from 160 to 240, to make room for root spurs and crown lumps. Mid and far bounds are unchanged.

## Browser runs (Playwright Chromium, software GL, 1000×600, local build at https://astrix.local/?chain=0)

**Setup:**
- `Game/dist` was copied to `.kiro/artifacts/screenshots/probe/dist`; `diff -rq` shows it is identical.
- Each run starts a fresh world (empty localStorage).
- The probe is `m013-woodland.probe.js`; configured copies are written by `gen-woodland.mjs`.
- Samples are the game's own `window.__metrics`.
- No run had page errors.

### Earlier failures

The two earlier failures are explained below.

**`verdict.setup: false`** (`m013-wood-results.json` 04:16 and the earlier `m013-wood-life-results.json` 04:32, the latter now overwritten by the passing run):
- The probe clicked `[data-protect-tree="e:29,33:0"]`, but the woodland protect list stayed `[]`.
- The build committed in `9b0412f` has no `data-protect-tree` button and no handler for it.
  - The first run (`commands: 1`, assign_role only) used a working build that rendered the button but had no click handler.
  - In the 04:32 run, the tree appears in the save after the reload (`protect` `["e:29,33:0"]`, accepted commands 9 → 10), but not in the setup sample. This is consistent with `Game/dist` being rebuilt and recopied while that run was starting.
- **Fix (`077c167`):** the Farm panel now lists "Trees that may be felled now (N)", up to 6, each with a Protect button. Clicks go through the panel's delegated handler as one synchronous journaled `protect_tree`.
- **Check:** a separate diagnostic run (`m013-diag-protect-a.js`) recorded mousedown, mouseup and click on the connected button, and the tree was protected immediately (accepted commands 6 → 7). The button is not re-rendered away before the click, because settlement time is paused (P) during setup.
- **Probe change:** the setup check now requires the tree to be protected **both** right after the click (`immediate`) and in the reloaded save.

**`verdict.render: false`** (`m013-wood-results.json` only, a single combined `all` run with an earlier build):
- `checks.render` = `{ ok: false, maxCalls: 92, maxTris: 263002 }`.
- 263,002 triangles were measured at the end of the 20 s pan on the **`multidraw=0` fallback path** (`pan-forest-multidraw0`, 56 calls). That is 5 % over the 250k budget. All other views were under budget.
- In that run, the views came after 1,200+ ticks of woodland life in the same save.
- How far a 20 s pan travels depends on the frame rate, so the end-of-pan number is a different place in every run.
- **Probe change:** the pan now samples calls and triangles every 2 s and reports the maximum. Two forest views on the fallback path are now measured at fixed cameras, and an `ageTo` option ages a fresh world at ×60 before measuring.
- **Re-measured:**
  - epoch world: max **237,210** (fallback pan);
  - aged to tick 1,201: max 223,668 (fallback forest-140 view; that run's file was overwritten by the next run, numbers from its console output);
  - aged to tick 6,000: max **224,474** (fallback pan).
- **Verdict:** this is a real, thin margin on the fallback path rather than a bug with a fix:
  - the fallback draws 15–28k more triangles than multi-draw in the same forest view (217,100 vs 189,674);
  - peaks reach 237k;
  - the one 263k reading was not reproduced, but it was not explained away either.

  Multi-draw stays at 214k or below. Not changed in code (see "Not done").

### Life run: `m013-wood-life-results.json`, all 12 checks pass

Run details:
- Started 07:31:52 and took 189.9 s.
- Covered ticks 3 → 1,203 (4 in-game days) at `?timescale=20`.
- Setup: Cora was made woodcutter in the Farm panel (journaled `assign_role`), and oak `e:29,33:0` was protected with its Protect button.

| Check | Result |
|---|---|
| freshWorld | rules 5, tick 3. 15 trees in the managed woodland: 4 harvestable, 7 protected, 5 regrowing. Mean path to store 68.6 m, 1.21 trees/day sustainable. |
| setup | `immediate: true`, protect `["e:29,33:0"]` right after the click and after the reload. 2 commands. Panel: "15 trees… 3 may be felled · 8 protected… about 1.12 trees (11.8 wood) a day, 6.2-day rotation · felling allowance 1.0 trees (+1.2/day)". |
| felling | 4 felled, all mature → stump. Felling ticks: `e:31,32:5` at 142, `e:31,30:4` at 396, `e:30,30:4` at 681, `e:32,30:0` at 963. |
| stumps | 4 stumps. 2 resprouted to saplings: `e:31,32:5` at tick 596, `e:31,30:4` at tick 690. 0 rotted within the run. |
| replanting | 4 orders seen (oak, birch, beech, birch), a wildling carried, **4 planted** (cherry, birch, oak and birch saplings; one already young). |
| growth | **12 stage changes**, e.g. sapling → young (`e:31,32:1` at 109), young → mature (`e:32,30:0` at 235), mature → old (protected `e:29,33:0` at 877), and planted saplings to young (690, 792, 920). |
| seeding | **8 trees seeded themselves**. This check is informational. |
| protectedUntouched | `e:29,33:0` was never targeted or cut: oak mature → old, standing throughout. |
| idleReasons | "sustainable quota reached: the woodland regrows about 1.4 trees a day; next tree in about 28 / 20 / 3 ticks"; "the store has 44 / 47 wood and no site needs more". |
| reload | Mid-cycle reload at tick 305 onto the stump of `e:31,32:5`: tick 305 → 305, hash `e82ada69faa381bc` → **`e82ada69faa381bc`**, the woodland, orders and quota identical. |
| panel | At the end: "27 trees… 10 sapling, 4 young, 7 mature, 4 old, 2 stump · 2 may be felled · 9 protected · 15 regrowing · about 3.11 trees (32.1 wood) a day, 6.1-day rotation… So far: 4 felled · 4 planted · 8 seeded themselves · 2 stumps resprouted". |
| resumed | The save resumed after the setup reload: tick 3 → 19, accepted commands 6 → 22. |

Woodland at the end: 16 records. Store: 47 wood, 20 fibre, 6 seed, 6 wool, 9 eggs.

**Cost in the life run:**
- `sections.tick` (whole real-time tick): mean 1.58–3.19 ms across samples, p95 3.6 ms, max 21.2 ms.
- Villager stepping: 0.39 ms per tick.
- Walking grid: 22 incremental patches.
- `naturesync` (incremental nature update during growth, felling and planting): mean 0.09 ms, p95 ≤ 0.7 ms, max 1.6 ms. Over 631 syncs it made 10 adds and 21 in-place swaps, and scanned 26,035 entries in 57 ms total.
- Draw calls 70–94 and at most 147,754 triangles across all samples.

### Views run: `m013-wood-views-results.json`, render passes (epoch world, every tree in its M008 stage)

| View | Calls | Triangles | Vegetation instances (near / mid / far) |
|---|---|---|---|
| farm (dist 40) | 82 | 121,602 | 25 / 14 / 3 |
| forest (dist 50) | 38 | 189,674 | 244 / 128 / 128 |
| forest-140 | 55 | 213,736 | 66 / 88 / 346 |
| farm-600 (zoomed out) | 46 | 116,156 | 0 / 0 / 42 |
| forest-600 (zoomed out) | 39 | 168,388 | 0 / 0 / 500 |
| forest, `multidraw=0` | 49 | 217,100 | same |
| forest-140, `multidraw=0` | 70 | **226,720** | same |
| farm, time-lapse ×20 | 82 | 121,250 | tick mean 1.62 ms, p95 2.5, max 7.6 |
| pan forest 20 s (max during) | 43 | 183,954 | 125 chunks added, 111 dropped |
| pan forest `multidraw=0` (max during) | 52 | **237,210** | 118 added, 106 dropped |

### Aged views run: `m013-aged-views-results.json`, render passes (fresh world aged at ×60 to tick 6,000, 20 days)

| View | Calls | Triangles |
|---|---|---|
| farm | 82 | 159,342 (140 trees near the farm after seeding and replanting, vs 42 at the epoch) |
| forest / forest-140 | 38 / 55 | 185,062 / 211,892 |
| farm-600 / forest-600 | 47 / 39 | 131,740 / 173,628 |
| forest / forest-140, `multidraw=0` | 49 / 70 | 209,388 / 223,668 |
| farm time-lapse | 84 | 159,364 (tick mean 3.05 ms, p95 5.5, max 14.6) |
| pan forest (max during) | 45 | 180,168 |
| pan forest `multidraw=0` (max during) | 54 | **224,474** |

**Nature update cost while panning** (20 s pan, about 300 chunk adds and 700–780 instance removals):
- multi-draw: `naturesync` mean 0.10 ms, max 3.0–3.1 ms;
- `multidraw=0`: `naturesync` mean 0.04–0.08 ms, max 1.2–4.8 ms, plus the tile-bake section (`vegetation`) mean 0.64–0.70 ms, max 6.7 ms (epoch) and 11.9 ms (aged);
- no full nature rebuild ran during either pan (`naturerebuild` absent; the 1 counted is the initial build), and 0 bakes were pending at the end.

M008 recorded a 20.7 ms full rebuild after a chunk load on the fallback path (`M008-vegetation/REPORT.md`). The incremental path replaces that rebuild. Its worst frame is now 4.8 ms for the sync, or 11.9 ms for a tile bake.

## Visual vs simulated

- **Simulated, hashed and checked in the browser:**
  - stage changes;
  - felling to stump and resprouting;
  - replant orders, the lifted sapling and planting;
  - seeding;
  - the protected tree;
  - idle reasons;
  - the reload hash.
- **Drawn:** NatureView draws the sim stage of every tree (`natureModel` reads `treeLife`). Test 17 checks that the incremental view equals a full build.
- **Presentation only:** the `?trees=1` lineup, the near-only detail blocks, and `?timescale`, which only changes how often ticks are issued.
- **What the screenshots can and cannot show:** at the farm camera distance the felling itself is not legible in the screenshot. The evidence for it is the sampled sim state.

## Save compatibility

- v1–v4 saves load with their exact bytes and hash. The app then sends one journaled `upgrade_homestead { rules: 5 }`.
- On upgrade:
  - every tree keeps its drawn stage;
  - trees already felled get gap records, and partly cut trees get live records with their age carried over;
  - the walking-grid hash, inventory, store, sites and villagers are unchanged (test 14).
- v5 fields in a v4 snapshot are rejected.
- Not tried in the browser: a real v4 save from the deployed M012 site. The life run uses a fresh v5 world.

## How to run the probe against any URL

```
cd 13_Integration_and_QA/Evidence/M013-living-woodland
node gen-woodland.mjs <base-url> <out.js> [prefix] [life|views|all] [untilTick] [timescale] [ageTo]
# local build (copy Game/dist to /projects/sandbox/.kiro/artifacts/screenshots/probe/dist first):
node gen-woodland.mjs https://astrix.local/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m013-wood-life.js wood life
node gen-woodland.mjs https://astrix.local/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m013-wood-views.js wood views
node gen-woodland.mjs https://astrix.local/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m013-aged-views.js aged views '' '' 6000
# deployed site:
node gen-woodland.mjs https://astrix.nyc.boxd.sh/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m013-live-life.js live life
```

- Run the written file with Playwright `browser_run_code_unsafe { filename }`.
- Only `https://astrix.local/` is served from the local dist copy; any other base loads from the network.
- Results go to `m013-<prefix>-<phase>-results.json`, and screenshots to `<prefix>-*.png`.
- Keep each phase separate, because the Playwright tool stops a run after 900 s.

## Screenshots

**Life run:**
- `wood-0-fresh-world.png`: fresh world under rules v5, with the farm and its woodland.
- `wood-1-farm-panel-woodland.png`: the Farm panel's woodland section, showing stats, policy, the protection buttons and the fellable-tree list, after Cora was made woodcutter and one tree protected.
- `wood-2-felling.png`: Cora felling `tree:31:32:5`, seen from the overhead farm camera. The thatched farmhouse, well, pens with animals and river are clear. Cora is a small figure near the farmhouse, and the cut is not visible at this scale. Trees at the top of the frame include a pink cherry, birches and a tiered conifer.
- `wood-3-carrying-sapling.png`: Cora carrying an oak wildling to replant.
- `wood-4-stump-after-reload.png`: close camera on the stump of `e:31,32:5` after the mid-cycle reload.
- `wood-5-planted-sapling.png`: the replanted oak sapling `e:31,32:1001`.
- `wood-6-farm-later.png`: the farm woodland at tick 1,203 (day 5).
- `wood-7-farm-panel-end.png`: the Farm panel at the end.

**Views run:**
- `wood-view-forest.png`: a dense mixed forest at near LOD.
  - Lumpy light-green broadleaf crowns built from several offset blocks, and dark-green tiered spruces.
  - Yellow-green birches with pale trunks, and pink cherries.
  - Small brown root spurs at some trunk feet, and fallen logs on the grass.
  - Deer and a wolf in the clearing.
- `wood-view-farm.png`, `wood-view-forest-140.png`, `wood-view-farm-600.png`, `wood-view-forest-600.png`, `wood-view-forest-multidraw0.png`, `wood-view-forest-140-multidraw0.png`, `wood-view-farm-timelapse.png`: the measured views (numbers above).
- `wood-8-lineup.png`: the `?trees=1` lineup seen down its length, from a high camera, so the rows are foreshortened. The left column of bare reddish-brown snags with broken limb stubs is clear. Beside it are dying trees with ochre/olive thinned crowns, then green mature and old crowns, dark tiered conifers, and pink cherry crowns at the back. Saplings and stumps are too small to read at this distance.
- `wood-9-lineup-close.png`: a low close-up of the first rows. It is dominated by long shadows. Tall dark trunks with flat, layered dark-green tiers are in front, with an ochre dying crown and pink crowns behind. The near-only root spurs are **not** clearly readable in this frame, because it is under-lit.

**Aged run:** `aged-view-*.png`, `aged-8-lineup.png` and `aged-9-lineup-close.png` are the same cameras on the world aged to tick 6,000.

**Superseded:** `m013-wood-results.json` is the earlier combined run with the earlier build (setup and render failures, explained above). Its screenshots were overwritten by the later runs.

## Not done / not verified

- **No real phone.** No phone emulation was run either. Everything was measured in software-GL Chromium on desktop at 1000×600.
- **Fallback-path triangle headroom is thin.** On `multidraw=0`, forest views measure 209–227k at fixed cameras and pans peak at 224–237k. One earlier end-of-pan reading was 263,002, over the 250k budget. No LOD change was made in M013. Options are a shorter near band, or dropping detail blocks, on the fallback path only.
- **Not seen in the browser** (tests only):
  - a stump rotting (none rotted within 1,200 ticks);
  - a tree dying, standing as a snag and falling;
  - protected areas;
  - policy changes from the panel;
  - the owner's `plant_tree` from the panel;
  - the `woodlandStats` API used from M014 (M014 does not exist yet).
- **Not deployed**, so no live-site run. **Not merged.**
- Owner reference images for trees are not in the repo (see REF-006).
