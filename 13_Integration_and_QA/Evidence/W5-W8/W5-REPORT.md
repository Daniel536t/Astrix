# W5 "World navigation and map": completion report (uncommitted)

**W5 status: implemented, emulated only. Not accepted.** I did not do a physical-phone walkthrough; that needs the owner.

- **Repository:** `Astrix`, branch `deploy/boxd`, HEAD `f91ffc9` (the live W4 candidate code is `0e41531`).
- **Not committed:** nothing is committed, staged, pushed or deployed.
- **Untouched:** `.tools/backups/w4-20261126/`, `05_Noxel_Studio/Asset_Sheets/2026-11-24_animals/Animals` and `Evidence/W1-wilderness-scenario/live-entry.png`.
- **Wilderness content:** v5 becomes **v6**, by one journaled `upgrade_wilderness` step.
- **Scope:** I did not start W6 or later.
- Evidence (screenshots and probe scripts) is in `Evidence/W5-W8/w5/`.

## 1. What was built

### Named places (`src/sim/places.ts`, pure, no three.js)
Places come from deterministic rules on the generated terrain. Each 512 m block is sampled once on an 8 m grid (height and water depth). Area rules are applied on a 16 m lattice over that grid.

| Place | Example name | Rule (it must hold at the anchor point) |
|---|---|---|
| Meadow | Fertile Meadow | Forest score < 0.1, relief over 8 m ≤ 2 m, height 2–30 m, within 120 m of the river or lake |
| Forest | Old Forest, Deep Wood, … | Forest score ≥ 0.55 on dry land, relief ≤ 4 m |
| Highland | Rocky Highlands | Height ≥ 45 m and rock score ≥ 0.5 |
| Ore | Ore Mountain, Ore Ridge, … | Generator top material STONE, rock score > 0.58, height ≥ 30 m. This is the ground the `styl_ore` rule places outcrops on |
| Quarry | Quarry | STONE top, rock score > 0.45, height below 30 m |
| Ford | River Ford, Shallow Ford, … | A water run ≤ 48 m wide whose straight 1 m crossing is never deeper than `WADE_MAX` (1 m), with dry land on both ends and deep water within 160 m |
| Valley | River Valley | A river run with low dry banks (1–10 m high, 40 m out) on both sides and ground ≥ 15 m high within 150 m of each |
| Lake / tarn | Mirror Lake, Highland Tarn | The hydrology lake and tarn, only if their centre really is under water |

- Area places need enough qualifying lattice points around the anchor; there is at most one place of each kind per block.
- The Trading Post is not included (W10).
- Seed 1337 gives 40 places, for example "Shallow Ford" at (−120, −216), about 58 m from the spawn.

### Exploration and discovery (`src/sim/map.ts`, authoritative state in the wild block of the save)
- **What is saved:**
  - a 128×128 grid of explored 16 m cells, saved as sorted runs;
  - the ids of discovered places;
  - the ids of discovered ore outcrops;
  - up to 32 waypoints;
  - the last accepted report (position, tick and travel credit).
- **The `explore` command.** It carries the player's position in decimetres. The client sends one after moving 16 m, but only when that report would discover something.
- **Visibility rule.** Every fog cell whose centre is within the reveal radius of the reported position becomes explored. The radius is 48 m, 64 m when standing at a generated height of 35 m or more, and 80 m at 60 m or more.
- **Places.** A place is discovered when its anchor's fog cell is explored.
- **Ore outcrops.** These are the existing `styl_ore` entities, and they are the only deposits in W5 (typed deposits are W6). An outcrop is discovered only when a report comes within 24 m of it. Positions and ids come from the same pure planner as chunk generation (`planNaturalEntities`, split out of `generateEntityChunk`), so no voxels are generated to discover one.
- **Plausibility check.** Each world tick adds 16 m of travel credit, up to 160 m. A report spends its straight-line distance from the last accepted report. A report that is too far is refused with `implausible` and changes nothing. These reports are allowed without spending credit:
  - the first report after the upgrade;
  - a return to an already explored cell (Home and banner returns);
  - the spawn point;
  - the claimed lean-to;
  - the respawn landing point.

### Waypoints
- Journaled `set_waypoint {x, z, name}` and `remove_waypoint {waypointId}`.
- Names are validated (1–24 safe characters). There are at most 32 waypoints, with ids `w:N`.
- The full map lets the player place, inspect (distance and compass direction), route to and remove waypoints.

### Routes (`src/sim/route.ts`, derived, never saved)
- **Coarse layer.** An 8 m node lattice covers the whole world. An edge exists only if the 1 m walk along it obeys nav's own rules:
  - steps of at most `MAX_STEP` (1 m);
  - no water deeper than `WADE_MAX`;
  - diagonal moves keep both corner cells walkable and level;
  - no building footprints.
  
  Costs are nav's costs, including `COST_FORD` per wading cell. Terrain is sampled once per 32 m tile and cached.
- **Search.** A* with a total order on ties, run in time slices of 6 ms per frame. The result does not depend on how the search is sliced (tested). A backward flood from the destination runs at the same time, so a cut-off destination is detected early.
- **Refusal reasons:**
  - "the destination is in deep water (N m deep …)";
  - "the destination is cut off: cliffs (steps over 1 m) / deep water / buildings close it in …";
  - "no walkable route: … close in the ground you can reach";
  - "no route found within the planning limit (… km² searched; blocked by …)";
  - outside the world.
- **Local refinement.** Near the player, nav's 1 m `windowGrid` of the live world (voxel edits, buildings, trees, rocks) refines the first stretch.
- **Replanning.** The route is replanned when the player strays more than 12 m from it, and cleared on arrival within 4 m.

### UI (`src/app/wild-map.ts`, `src/render/trail.ts`, CSS, `settings.ts`, `main.ts`)
- **Minimap.** A canvas in the top-right corner, north up. It shows fog, explored terrain tiles, discovered places and ore, waypoints, the route and a player arrow.
  - Sizes: 132 px on desktop, 100 px on phone portrait, 80 px below 380 px wide, 84 px in phone landscape.
- **Opening the full map.** Tap the minimap, press M, or use Settings → Map → "Open the map". Settings also has "Show the small map", which is saved locally.
- **Full map.** It supports:
  - pan by drag, pinch zoom, wheel zoom, and the + / − / Me buttons;
  - tap → popup with "Route here" and "Add waypoint" (a tapped waypoint offers "Route here" and "Remove");
  - lists of waypoints and discovered places;
  - a legend and a route status line (including "No route …: reason");
  - "Stop route".
- **Route line in the fog.** The route line is clipped to explored cells, so it is never drawn through the fog.
- **In-world trail.** One mesh (one draw call) along the next 60 m of the route, on the ground or on the water's surface where the route wades.
- **Route pill.** Shows a direction arrow (relative to the camera), the remaining distance and the destination name. Tapping it opens the map.

## 2. Files

- **New:**
  - `Game/src/sim/places.ts`, `Game/src/sim/map.ts`, `Game/src/sim/route.ts`;
  - `Game/src/app/wild-map.ts`, `Game/src/render/trail.ts`;
  - `Game/tests/w5.map.test.ts`;
  - `Game/tests/fixtures/w5-wilderness-save.json`;
  - `Evidence/W5-W8/w5-fixture-gen.0e41531.ts.txt` (the fixture generator), `Evidence/W5-W8/w5/`.
- **Changed:**
  - `sim/gathering.ts`: v6, the `map` block, its snapshot and validation, the upgrade step;
  - `app/wild-commands.ts`: 3 commands, validators, outcomes, v6 gating, and the respawn anchoring the next report;
  - `sim/wilderness.ts`: the allow-list;
  - `sim/world.ts`: `planNaturalEntities` and `baseColumnAt` split out, with identical output;
  - `sim/nav.ts`: `Heap` exported;
  - `sim/wild-build.ts`: `windowGrid` exported;
  - `app/wild-game.ts`: upgrade to v6, the map wired in, metrics;
  - `app/settings.ts`, `main.ts` (M and Escape keys, the Settings entry), `styles.css`.
- **Regenerated:** `Game/dist` and `Game/tests/.build`. Both were already dirty before this work.

## 3. Tests, typecheck and build

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npm test` | **507 tests, 507 pass, 0 fail** (224.5 s); 488 before, plus 19 new |
| `npm run build` | OK. Final bundle `assets/index-vueiFeoh.js`, `assets/index-CZ4HNKip.css` |

The last full test run was made before the last CSS-only change (the 80 px minimap rule for narrow phones). No test reads CSS.

**New tests (`tests/w5.map.test.ts`, 19):**
1. **Places:**
   - deterministic (recomputed from scratch gives the same list; another seed gives other places);
   - pins near the spawn;
   - every place's rule checked at its anchor (fords by a wadeable 1 m line with deep water nearby);
   - nothing in the open sea, no ford in the lake.
2. **Fog at the start:** a new v6 world has explored and discovered nothing; 20 ticks reveal nothing; the v6 genesis is pinned `2d9f702a4368b9d1`.
3. **Exploring:**
   - the reveal radius;
   - the ford is not discovered at the spawn and is discovered when walking toward it;
   - every discovered place has its cell explored, and no undiscovered place lies in an explored cell.
4. **Ore outcrops:**
   - not discovered at 40 m, discovered within 24 m;
   - each one is a real `styl_ore`;
   - the planner's outcrops equal chunk generation's in 25 chunks.
5. **Explore validation:**
   - a 500 m jump is refused and changes nothing;
   - outside the world is refused;
   - the credit rule;
   - returns to explored cells are allowed;
   - a forged explore outcome is refused on replay.
6. **v5 world:** map commands are refused until upgraded; the upgrade happens once and reveals nothing.
7. **Waypoints:** create, inspect, bad names, outside the world, remove, double remove, the cap of 32, save, reload and replay.
8. **Persistence:** save, reload, compaction and replay keep the identical map block. Four forms of tampering with the map block are refused.
9. **Journal growth:** see §7. Walking back over explored land would send nothing.
10. **Routes on the real terrain:**
    - across the river by a ford (wades, never deeper than 1 m, every segment walkable);
    - around the deep lake, where the straight line crosses deep water (the route is longer and not straight).
11. **Routes on synthetic terrain:**
    - a deep river is crossed only at its ford;
    - with no ford: refused, reason "deep water";
    - a plateau is climbed by its ramp, never up the cliff;
    - no ramp: `cut_off`, reason "cliffs";
    - a deep-water destination, outside the world, and a ring of buildings (reason "buildings").
12. **Determinism and agreement:**
    - the route is identical with 7-node slices and with a fresh cache;
    - the coarse terrain samples equal the live world's `surfaceAt` and `waterDepthAt` at 200 points;
    - local refinement joins the route.
13. **Old saves:**
    - 13–14: the v5 fixture made from `0e41531` (short and compacted) loads byte-identically, replays under v5, upgrades to v6, keeps the 60-weight bag and all W4 state, finishes its lean-to, explores, adds a waypoint, then reloads and replays;
    - 15–18: the W1–W4 fixtures (short and long) load, replay, upgrade straight to v6 and explore;
    - 19: the pins (settlement `e659504b056654dc`; wilderness v2 `3c3a0c8e4090efcf`, v3 `158e989e4c10cf13`, v4 `6d50f19f01f39eec`, v5 `9ddf941c10692096`).

**Changed existing tests.** Each change follows from new worlds now starting at v6. No assertion was weakened.
- `w2.gathering.test.ts`: `LATEST_WILD_CONTENT` is now expected to be 6, not 5.
- `w4.build.test.ts`:
  - the default genesis is asserted to be v6;
  - the v5 pin is now checked on `genesis(…, 5)`, with the same hash `9ddf941c10692096`.
- `w4.owner-report1.test.ts`: the "v5 swap" test now builds an explicit v5 world (`genesis(…, 5)`), so it still tests exactly the v5 rules.

**The v5 fixture.**
- Made by the live W4 candidate code `0e41531` in a temporary git worktree, `/projects/sandbox/.tools/scratch/w5-wt`. The worktree was removed afterwards; `git worktree list` no longer shows it.
- Contents: a stone axe, a finished campfire with fuel, an unfinished lean-to (materials delivered, worked once) and dropped piles. 75 journal entries, hash `09a310a8faf1fa68`.

## 4. Browser walkthrough (emulated; local build at https://astrix.local/; Chromium with software GL)

**Setup and capture.**
- localStorage was seeded as specified: `w1`, seed 1337, generator 2, spawn (−82, −172).
- Captured on every run: console errors and warnings, page errors, failed requests and HTTP ≥ 400. **None were recorded in any run.**

**Which build each run used.**
- The desktop steps (a–l) ran on builds from this pass before the last three changes: the 8 m place grid (the ford anchor moved 2 m), the pure ore planner and a lazy anchor computation.
- After those changes, on the final build, I re-ran the following and they behaved the same:
  - the minimap, map opening, routing through the UI and the trail: desktop 1200×700, phone 390×844, 360×780 and landscape 844×390 (`w5-perf.js`, `w5-phone.js`);
  - the 360×780 layout, after the final CSS change.

**Desktop 1200×700, fresh world:**
- **a. Spawn.** The minimap [1054,14,1186,146] shows the fog with 29 explored cells after the first report. `w5-a`.
- **b. Walk toward the river.** Explored cells went from 29 to 39. **"Shallow Ford" was discovered** (toast and HUD: "Discovered: Shallow Ford (on your map)"). 3 reports, 0 refused. `w5-b`.
- **c. Route across the river.**
  - I opened the full map by clicking the minimap (open 13 ms), tapped across the river (popup "Unexplored land · 59 m W of you"), then chose Route here.
  - Result: **61 m, wading 10 m at 1 ford, at most 1 m deep**. Planning took 11 ms over 29 expansions; local refinement took 11.4 ms.
  - The route line is shown only over explored cells. `w5-c`.
- **d. In-world trail.** A continuous ribbon across the ford, 124 triangles. Scene with the trail: 68 calls, 204,716 triangles (budget ok).
  - **Bug found and fixed:** the first version was hidden under 1 m terrace steps and under the water surface.
  - The direction pill showed "61 m · the marked spot". `w5-d`.
- **e. Walking the route** (keys, following the route points):
  - I reached each point and arrived (the destination was cleared), in mode `ground` at every point, with health 100 and 0 deaths;
  - explored cells went from 43 to 60. `w5-e`.
- **f. Waypoints.** Added two by tapping the map, then Add waypoint (`w:1` and `w:2`). I tapped `w:1` to inspect it (`w5-f`), then removed it. `w:2` stayed.
- **g. Impossible destination: the lake centre.** "No route to the marked spot: the destination is in deep water (5 m deep; walkers wade at most 1 m): pick a spot on land or in shallow water". `w5-g`.
- **h. Reload.**
  - Persisted: places ["pl:ford:1,1:0"], waypoints [`w:2` "Waypoint 2" (−120, −160)], explored cells 60.
  - After the load, explored cells were 64. The first report at the standing position revealed 4 new cells, which is correct behaviour.
  - The map opened in 6.2 ms. `w5-h`.
  - Two earlier reloads also kept the ford and the explored cells.
- **i. Route to the meadow.** 110 m, planned in 19 ms. I walked it in 67 s. **"Fertile Meadow" was discovered**; explored cells reached 100; 0 replans; 0 refused reports. `w5-i`, `w5-j`.
- **k. Long route.** 498 m, wading 13 m at 1 ford. Planning took 1,685 ms wall time across frames, 494 expansions, 32 tiles. `w5-k`.
- **Settings:**
  - "Show the small map" off hid the minimap and stayed off after a reload.
  - "Open the map" opened it.
  - **Bug found and fixed:** after a reload the switch showed the wrong state.
- **l. v5 save from the fixture, loaded in the browser.**
  - One journaled `upgrade_wilderness` to content 6 (the journal header stays 5), with toast "You now have a map: …".
  - Bag weight 6 of 60; first report revealed 29 cells. `w5-l`.
- **Not done in the browser:** discovering an ore outcrop. The nearest found is about 390 m west in rocky ground. This is covered by test 4. **NOT VERIFIED in the browser.**

**Phone and tablet layout, emulated** (touch, DPR 2, quality low; final build). Element rectangles (`getBoundingClientRect`) were measured for:
- every top-level button and every `#controls` button (Use, Jump, Home, To banner, Plant, zoom + and −);
- `#hud`, `#vitals`, `#wild-events`, Builder view;
- the joystick ring (`#move-zone::after`), the minimap and the route pill.

| Viewport | Minimap | Route pill | Overlaps (spawn / with a route) | Tap targets < 40 px |
|---|---|---|---|---|
| 390×844 | [282,8,382,108] | [282,176,382,220] | **0 / 0** | 0 |
| 360×780 | [272,8,352,88] | [252,176,352,220] | **0 / 0** (before the fix: minimap × Build button 480 px²; fixed with an 80 px minimap) | 0 |
| 844×390 | [752,8,836,92] | [574,8,744,54] | **0 / 0** | 0 |
| Desktop 1000×600 | [854,14,986,146] | – | 0 with the Bag panel [666,150,986,576] or the Build menu [646,150,986,576] open | (mouse) |

- **Full map on a 390 px phone:** header [0,0,390,53], canvas [0,53,390,540], list [0,540,390,844].
- **Tap targets in the full map:** every header button is 40×40. The popup buttons are 89×40, 108×40 and 40×40.
- **On 390×844, by touch:**
  - tapping the minimap opened the map;
  - tapping across the river then Route here gave an 84 m route, wading 10 m at 1 ford;
  - closing the map showed the trail (122 triangles);
  - walking cleared fog (29 → 36 cells). `w5-m/n/o-phone390`, `-phone360`, `-land844`.

## 5. Performance (measured; `__metrics.wild.map.stats`, `__metrics.sceneBudget`)

| Measure | Desktop 1200×700 | Phone 390×844 (desktop CPU) | Phone 390×844 with CDP CPU throttling ×4 |
|---|---|---|---|
| Minimap redraw, running average / max | 2.0 / 3.5 ms | 1.7 / 2.6 ms | 9.3 / 26.3 ms |
| Map open, to first draw | 13.0 ms | 11.9 ms | 61.6 ms |
| Full-map redraw | 0.2 ms | 0.2 ms | 1.4 ms |
| Route across the river, 84 m (CPU / wall) | 26 / 140 ms | 31 / 32 ms | 145 / 154 ms |
| Route, 347 m (CPU / wall) | 108 / 688 ms | 103 / 518 ms | 382 / 624 ms |
| Local refinement | 16.8 ms | 23.5 ms | 45.4 ms |
| First explore dispatch | 5.5 ms | 4.4 ms | 27.8 ms |
| Scene after routing | 56 calls / 152,200 triangles | 40 / 92,042 | 40 / 92,042 |

- **Map open during the desktop walkthrough:** 2.5–13 ms.
- **Scene budgets:** all runs stayed within 120 calls and 250k triangles. The highest was 68 calls and 204,716 triangles (desktop, trail shown).
- **Place computation in Node:** the first computation of a 512 m block took 86–99 ms (it was 150 ms before the 8 m grid). This runs in the client's discovery preview, outside the timed dispatch, so **its cost was not measured in the browser**.
- **What the phone figures are:** viewport, touch and CPU throttling only. They are not a real phone's GPU or CPU.

## 6. Save and replay verification
- **v5 save from `0e41531`:** byte-identical record, replays under v5, then one journaled upgrade to v6. W4 state is unchanged and the lean-to is finished after the upgrade (tests 13–14; browser step l).
- **W1–W4 fixtures:** load, replay and upgrade straight to v6 (tests 15–18).
- **Settlement:** genesis `e659504b056654dc`, the v1–v8 pins and the v6/v7 fixtures pass unchanged in their own suites, which are part of the 507.
- **Map block:** saved, reloaded, compacted and replayed identically. Tampering is refused (test 8).
- **Entity generation:** the refactor of `generateEntityChunk` into `planNaturalEntities` leaves generation byte-identical. Every generator and genesis pin still passes, and the planner's outcrops equal the generated ones (test 4).

## 7. Journal growth
- **New land:** one minute of walking (252 m at 4.2 m/s) into new land gives **15 explore reports, 3,469 bytes**. With the 30 world ticks of that minute, the journal grows by 10,370 bytes in total. The ticks were already there before W5.
- **Explored land:** walking in already explored land sends nothing.

## 8. Known limitations
- **The coarse route is conservative.** It only finds walks along the 8 m lattice lines. A walkable zig-zag between lines, or a ford narrower than the lattice spacing, can be missed, and the result is an honest refusal or a longer route.
  - Trees and rocks are ignored by the coarse layer; only the local 64 m refinement sees them.
  - Swimming is never routed.
- **Refusal reasons can reveal fogged terrain.** A destination tapped inside fog is planned against the real terrain. So a refusal reason can say that unexplored ground is deep water, and the in-world trail can lead into unexplored land. On the map, the route line is drawn only over explored ground.
- **Exploration while the world is paused (P) is delayed.** Reports queue up (up to 64) and are accepted at walking pace once ticks resume. A walk of more than about 1 km while paused can stay refused until the player returns to explored land.
- **The first report after the v6 upgrade is accepted wherever it is made.** Positions are reported, not proven, which is the same trust as the other wilderness commands.
- **Place rules are heuristics on the generated fields.** Their names do not claim species or metal types. One place of each kind per 512 m block means neighbouring blocks can show the same kind twice, with different names.
- **Snapshot validation checks formats, not facts.** It checks place and outcrop ids by format only; it does not recompute whether the anchor is explored.
- **Phone performance:** at ×4 CPU throttling the minimap redraw averages 9.3 ms. It redraws at most every 120 ms while moving.
- **Physical-phone walkthrough: NOT DONE (needs the owner).**
- **Commit hygiene:** `Game/dist` and `Game/tests/.build` are regenerated and dirty in the working tree.

## 9. Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| Minimap works, shows position, updates, readable desktop and mobile, hides undiscovered areas | Pass (emulated) | `w5-a`, `w5-b`, `w5-m-*`; fog in every capture; §4 layout table |
| Full map: larger view, explored and unexplored distinct, discovered features, named places only once discovered | Pass | `w5-c`, `w5-j`, `w5-k`; tests 2–3 |
| Exploration persists after reload | Pass | Browser step h; test 8 |
| Fog driven by the player's movement and the visibility rule | Pass | Tests 3 and 5; browser explored counts 29 → 39 → 60 → 100 |
| Discovering a place creates a persistent record | Pass | Shallow Ford and Fertile Meadow in `places` across reloads; tests 3 and 8 |
| Deposits visible only when legitimately discovered | Pass in tests; **NOT VERIFIED in the browser** | Test 4 |
| Waypoints created, inspected, removed, persist, revisited ("Route here" from a waypoint) | Pass | `w5-f`, step h; test 7 |
| Distance and direction information | Pass | Popup "59 m W of you"; list "127 m E"; route pill with arrow |
| Routes follow valid terrain, avoid cliffs and deep water, use fords | Pass | Tests 10–11; `w5-c`/`d`/`e` (walked across the ford without swimming) |
| Never a straight line through a known obstacle | Pass | Test 10 (lake detour), test 11 (cliff ramp); clipped line |
| In-world trail | Pass | `w5-d`, `w5-o-*` (one mesh, 122–124 triangles) |
| No valid route: explains why | Pass | `w5-g`; test 11 (deep water, cliffs, buildings, outside the world) |
| Player position correct | Pass | Minimap arrow at the character; the route start equals the reported position (test 12) |
| Desktop and mobile interfaces usable | Pass, emulated; physical phone NOT DONE | §4: 0 overlaps, 0 tap targets under 40 px at 390, 360 and 844×390 |
| Old saves preserved (settlement, W1–W4, v5 from `0e41531`, 60-weight bag) | Pass | Tests 13–19 and the existing suites; browser step l |
| Automated tests cover exploration, persistence, waypoints and pathfinding | Pass | 19 new tests, 507/507 |

## Orchestrator verification before commit (2026-11-26)

These are independent full-suite runs on the final W5 working tree. The sub-agent's 507/507 was **not** reproduced.

- **Typecheck and build:** `npx tsc --noEmit` is clean and `npm run build` succeeds.
- **Run 1:** 507 tests, 506 pass, **1 fail**.
- **Run 2:** 507 tests, 506 pass, **1 fail**.
- **The failure:** both times it was `m004.generator` "v2 chunk generation stays within budget per chunk", which asserts under 60 ms per chunk. It measured 67.5 ms in run 1 and 64.5 ms in run 2.
- **Cause, measured:** host load, not W5.
  - The test was bundled from the pre-W5 commit `f91ffc9` (in a temporary worktree, since removed) and from W5, and each was run 8 times alternately.
  - The pre-W5 code failed 5 of 8 runs (60.3–61.8 ms), and W5 failed 6 of 8 (60.0–64.0 ms).
  - Host load average was 12–15 on 8 CPUs during the runs.
  - The test is a wall-clock timing check, and both versions sit at its limit on this host.
  - W5 does refactor `computeBaseColumns`, but no regression from it is shown at this noise level.
- **Not changed:** the threshold was **not** relaxed. The failure is recorded here and stays open.

## Deployment (recorded after the results were read)

**Commit:** `5917608204260d2fb07c7bf920e6b06e8829fe81`, confirmed on the remote by fetch and by the GitHub API before deploying.

**Deploy:** the script exited 0. Its own full-suite run gave **507 / 507** (fail 0), with host load average about 14. The timing test passed in this run, which is consistent with it being host-load sensitive.

**What is live:**
- release `20261126T131223Z-5917608`;
- the server's `current` points to that release;
- bundle `assets/index-BO7OAFQ3.js`, stamped `commit:"5917608", dirty:false`.

**Live check** (fresh headless Chromium, desktop 1000x600, software GL, new wilderness world, 45 s at spawn):
- wilderness content **6**;
- the minimap is present;
- map state shows 29 explored cells, no discovered places, no deposits and no waypoints, so nothing was revealed before exploring;
- 54 draw calls, 151,916 triangles;
- 0 page errors, 0 console errors, 0 failed requests and 0 HTTP ≥ 400 responses.

**NOT VERIFIED on the live site:** routing, discovery while walking, and waypoints. These were verified on local builds only, as described above.

**Status:** W5 is implemented and deployed. It is **not owner-accepted**.
