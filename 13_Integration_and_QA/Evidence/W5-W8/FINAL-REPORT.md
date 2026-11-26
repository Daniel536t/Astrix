# W5–W8 final evidence report (integration pass, 2026-11-26)

**Implemented and deployed; NOT owner-accepted. The owner and assistant decide acceptance.**

Nothing in this pass changed game code, committed, pushed or deployed. New files are only in `Evidence/W5-W8/integration/` and this report. Scratch work is in `/projects/sandbox/.tools/scratch/integration/`. The W4 backup, the `Animals` asset folder and `W1-wilderness-scenario/live-entry.png` were not touched.

## Common facts (all four milestones)

### Commits and remote
- Branch `deploy/boxd`. Local HEAD = `origin/deploy/boxd` = `a4a02a43a262502341c176d6f3dd7e5c6879bfbb` (W8 docs commit). Confirmed by `git fetch` and by the GitHub branches API in this pass.
- Feature commits, each confirmed on `origin/deploy/boxd` by `git branch -r --contains`:
  - W5 `5917608204260d2fb07c7bf920e6b06e8829fe81`
  - W6 `12bf1e28c73b793dda11a10aa3df730f872ab4c4`
  - W7 `9068b88c7c54d19dfbbe2a8b3ed42aac1cb6c778`
  - W8 `2429be3580f5f20328412b3c5e2ed7581003c6f9`
- `git diff 2429be3 HEAD -- Game/src Game/tests` is empty, so the tested source is the W8 feature source.

### Live site
- `https://astrix.nyc.boxd.sh/` serves `assets/index-D_QGs37z.js`. The served bundle has the build stamp `commit:"2429be3",dirty:!1`. Checked with curl in this pass.
- Release name `20261126T182516Z-2429be3` and the server `current` link: **NOT VERIFIED in this pass**. The read-only `boxd machine exec` check needed an interactive login. The name comes from the W8 report.
- Earlier releases come from the W5–W7 reports and were not re-checked here:
  - W5 `20261126T131223Z-5917608` / `index-BO7OAFQ3.js`
  - W6 `20261126T144002Z-12bf1e2` / `index-BVp4sZm9.js`
  - W7 `20261126T161401Z-9068b88` / `index-CzxGZWdl.js` (deploy attempt 1 stopped at the m004 timing test)
- W8 process breach: as recorded in the W8 report, the deploy started before commit confirmation. The result is traceable to `2429be3` through the bundle stamp confirmed above.

### Test counts (in a copy: `cp -a` to `.tools/scratch/integration/copy`)
- **Full suite (`npm test`): 579 tests, 578 pass, 1 fail.**
  - Run 18:42:11–18:47:17Z, 298 s. Load average 8.70 at start, 14.50 at end, on 8 CPUs. A live game tab was open in the browser at the time.
  - The failure is m004 "v2 chunk generation stays within budget per chunk": 76.3 ms against a 60 ms limit. This is the host-load timing flake recorded in W5, W7 and W8. The threshold was not changed.
  - Evidence: `integration/full-suite-summary.txt`.
- **Fixture tests: 165 tests, 165 pass, 0 fail.** These are the 12 test files that read save fixtures, run separately in the copy:
  - `stab002.s1`, `stab002.s3`, `stab002.v8`
  - `w1.wilderness`, `w2.gathering`, `w3.felling`, `w4.build`, `w4.owner-report1`
  - `w5.map`, `w6.mining`, `w7.wildlife`, `w8.hunting`
  - The passing set includes: the W1–W7 wilderness fixtures (short and long) upgrading to v6, v7, v8 and v9; the v5, v6, v7 and v8 saves made by `0e41531`, `5917608`, `12bf1e2` and `9068b88` (the w5..w8 fixtures); the settlement v6 and v7 save fixtures (restored byte-identical, also as settlement worlds); and the genesis pins (settlement, wilderness v2–v9).
  - Evidence: `integration/fixture-tests-summary.txt`.

### Browser setup (live site, emulated, Chromium with SwiftShader software GL)
- **World:** seed 1337, gen 2, `w1`, spawn (−82, −172), localStorage seeded as specified.
- **Generated start (Node, journaled commands only), not played in the browser:** made by `integration/gen-start.ts.txt` (summary in `start-save-summary.json`; save sha256 `03e2f1cd…`, hash `69fa627f97f2e111`, tick 74, 262 journal entries). It contains:
  - axe, workbench `b:10`, log store `b:18`, knife, stone pickaxe (equipped, 46/60);
  - 2 cord and the bow and arrow materials in the bag;
  - a journaled walk north with 2 iron ore mined from `e:31,16:6` and 2 coal from `k:25,15:0`;
  - ore, coal, 6 stone and 2 branches stored in `b:18`;
  - **no** clay, sand or gravel discovered; no smelter; no bow; no wildlife records.
- **Played in the live browser:** everything else in chains 1–8. Desktop is 1000×600 throughout. Quality was "high (auto)" until the chain-5 shots, then `?quality=low`.
- **Capture on every run:** console errors and warnings, page errors, failed requests and HTTP ≥ 400, over 20 page loads on desktop and on the phone emulation.
  - **Result: 0 from the game.**
  - The only 2 entries were page errors from my own decompression probe on `/healthz`, before any game load.

### Performance (measured in this pass; `__metrics`)

| Run | Draw calls | Triangles | Sim tick ms (mean / p95 / max, n) | Fauna sim ms | Frame interval p50 |
|---|---|---|---|---|---|
| Desktop 1000×600, high, at the spawn after chains 1–3 | 63 | 143,240 | 6.4 / 12.2 / 537.8 (276) | 1.7 (89 drawn, 178 records) | 389 ms |
| Desktop 1000×600, low, at the log store, 25 s steady | 56 | 110,408 | 3.31 / 4.7 / 5.7 (12) | 4.1 (63 drawn, 202 records) | 311 ms |
| Desktop, right after a reload | 56 | 111,624 | max 441.8 (first-tick hitch) | max 434.8 | – |
| Desktop, route to a waypoint shown (trail) | 58 | 110,436 | – | – | – |
| **Phone 390×844 EMULATED** (isMobile, touch, DPR 2, auto-low because of SwiftShader), 25 s steady | 44 | 82,772 | 11.05 / 21.1 / 65.3 (13) | 1.3 (61 drawn, 201 records) | 285 ms |

- Every sample was within the 120-call / 250k-triangle budget.
- The frame rate (about 2.5–3.5 fps) comes from software GL. It is not meaningful. Frame rate on real hardware: **NOT VERIFIED**.
- Phone layout (emulated): 15 visible controls, 0 overlaps, 0 tap targets under 40 px. With the bow equipped, the Bow button is 62×62 at [218, 678, 280, 740].
- No physical device was used.

### Save compatibility
- Fixture tests are 165/165 (above).
- In the browser, a v9 save written by Node loaded on the live build (content 9, hash continued).
- A desktop → phone handoff of the same save gave the same hash: `d37c6108d8843a88` with the desktop paused and the phone on `?freeze=1`.

---

## W5 "World navigation and map"

| Criterion (from W5-REPORT §9) | Proposed | Evidence |
|---|---|---|
| Minimap works, shows position, updates, readable desktop and mobile, hides undiscovered areas | Pass (emulated) | W5 report `w5-a/b/m`. This pass: minimap present on live desktop and phone 390 ([282, 8, 382, 108]). Explored cells 311 → 318 → 349 while walking |
| Full map: larger view, explored and unexplored distinct, discovered features, named places only once discovered | Pass | W5 tests 2–3. Live this pass: places list shows only Shallow Ford and Green Forest, both discovered on the Node walk (`c1-b`) |
| Exploration persists after reload | Pass | W5 test 8. Live: explored, places, deposits and waypoints the same after the frozen reload H (`c8-H`) |
| Fog driven by the player's movement and the visibility rule | Pass | W5 tests 3 and 5. Live: reports at walking pace, 0 refused |
| Discovering a place creates a persistent record | Pass | W5 tests 3 and 8; places persisted through 9 live reloads |
| Deposits visible only when legitimately discovered | **Partial** | On the map: Pass, live (chain 1). In the land: deposits are drawn before discovery. Live: 6–7 mounds drawn near the river while sand `k:28,27:1` and gravel `k:28,27:0` were undiscovered (`mining.drawn`) |
| Waypoints created, inspected, removed, persist, revisited | Pass (create, route, persist live; inspect and remove from the W5 report and test 7) | Live: `w:1` "Waypoint 1" (−3, −192) created, routed to, and present after frozen reload H (`w5-a`) |
| Distance and direction information | Pass | Live popup "Unexplored land · 85 m E of you"; deposit list "clay 10/10 left · 14 m SW" |
| Routes follow valid terrain, avoid cliffs and deep water, use fords | **Partial** | W5 tests 10–11 pass. Live route 94 m, 11 points, 12 ms (10 ms CPU, 22 expansions). The routes are on the 8 m lattice. W6 recorded a coarse route that led into a highland face the character could not climb (`w6-j`) |
| Never a straight line through a known obstacle | Pass | W5 tests 10–11 |
| In-world trail | Pass | Live: trail visible, 128 triangles (`w5-b`) |
| No valid route: explains why | Pass (tests and W5 browser) | W5 `w5-g`, test 11. Not re-run live |
| Player position correct | Pass | W5 test 12. Live: route start = the player's position (−82.3, −161.4) |
| Desktop and mobile interfaces usable | **Partial** | Emulated only (0 overlaps at 390×844 this pass; 390, 360 and 844×390 in the W5 report). Physical phone NOT DONE |
| Old saves preserved | Pass | Fixture tests 165/165, including the v5 save from `0e41531` |
| Automated tests | Pass | `w5.map` 19 tests within 578/579 |

- **Releases:** `20261126T131223Z-5917608` / `index-BO7OAFQ3.js` (from the report). It is superseded by the W8 release, which contains W5.
- **Known issues:**
  - routes on the 8 m grid; trees and rocks are seen only by the local refinement;
  - refusal reasons can reveal fogged terrain;
  - deposits are visible in the land before discovery;
  - physical phone NOT DONE.

## W6 "Deposits, mining and processing"

| Criterion (from W6-REPORT §8) | Proposed | Evidence |
|---|---|---|
| All six deposit types exist in world generation and simulation | Pass | W6 test 1. Live map lists clay, sand, gravel, iron ore and coal entries (`c1-b`) |
| Distribution respects geography | Pass | W6 test 2 |
| Discoverable by exploration; recorded; map respects W5 rules | Pass | Chain 1, live: clay undiscovered with the last report 31 m away (player 16.1 m), discovered at a report 15.3 m away. Sand discovered at 19.2 m |
| Finite quantities that deplete, no regeneration | Pass | Live: clay 10 → 0, DEPOSIT_EXHAUSTED tick 469, still `left 0` after 7 frozen reloads. Headless: `exhausted` after 300 more ticks and a reload |
| Mining needs the correct tool, is real work with progress, gives actual material | **Partial** | Live: clay (2 swings per unit), sand, gravel. Iron and coal were mined only by Node, in this pass too: **browser NOT VERIFIED** |
| Mining respects tool, position and inventory capacity | Pass | Live: "your bag is full (58/60; clay weighs 3)" refused before work (`work` stayed 0). W6 test 4 |
| Carry, drop, pick up, store | Pass | Live: 8 clay carried 33 m and stored (`b:18` clay 8). Taken back "for the site" |
| Reservations: no double consumption | Pass | Live: the smelter reserved shed clay 8 + stone 4 and bag items. Consumed exactly {branch 2, clay 10, gravel 4, sand 4, stone 6} |
| Smelting consumes correct inputs and fuel, outputs only after time; refused without facility or inputs | Pass | Live: Smelt disabled at 0/2 ore. SMELT_STARTED tick 686 (n 45), ore and coal left the bag at once. SMELT_DONE tick 731. Iron ingot pile `d:22` at the door, picked up (`c3-*`) |
| The forge chain resolved honestly | Pass | W6 §1 and test 13 (not re-checked live) |
| Identity, reservations and persistence; old saves preserved | Pass | Frozen reload mid-smelt B2: equal hash `65a0634ff98fecf4`. Fixtures 165/165 |
| Tests cover mining, depletion, limits, processing, reload, replay | Pass | `w6.mining` 20 tests within 578/579 |
| Mobile usability | **Partial** | Emulated only. Physical phone NOT DONE |
| Render budget | Pass | All samples ≤ 63 calls and 143k triangles |

- **Releases:** `20261126T144002Z-12bf1e2` / `index-BVp4sZm9.js` (from the report).
- **Known issues:**
  - deposits are visible in the land before discovery;
  - iron, copper and coal are 300–400 m away in highland, and the coarse route can lead into an unclimbable face;
  - stone pickaxe only; no charcoal; copper ingots have no use;
  - physical phone NOT DONE.

## W7 "Persistent wildlife and animal minds"

| Criterion (from W7-REPORT §8) | Proposed | Evidence |
|---|---|---|
| Stable identities | Pass | W7 tests 1–2. Live: 0 duplicate drawn ids in all 9 frozen reloads |
| Interacted-with wildlife persists; locations, states, needs survive reload | Pass | Live: every frozen reload with a settled pause had an equal hash and equal record counts. Every animal drawn after a reload matched exactly in id, act, position, needs and target. Example: the stunned hare record was identical across reload E |
| Killed animals stay dead; no duplication or resurrection | Pass | Live: the dead count was carried through every reload (0 → 2 → 4 → 5 → 6). The killed hare `27,26:0` was never drawn again. Headless H8: 0 resurrected, 0 duplicates |
| Existing populations functional | Pass | Live: all five species drawn (deer, rabbit, fox, wolf, trout) |
| Species-specific behaviour | Pass in tests; browser partial | Live this pass, seen: deer graze, browse, drink, rest, wander; herd alert and flight; hare graze, rest, freeze; fox mouse; wolves patrol, follow, chase; **a wolf kill** (dead 2 → 3 at tick 789, pack chasing `deer:31,22:3`); trout rise and hold. Fox stalk and pounce and the hare zig-zag: browser **NOT VERIFIED** |
| Reaction to proximity and actions | Pass | Chain 4 (live) |
| Terrain and collision; not trapped; no teleport | Pass | W7 tests 14–16 (not measured live) |
| Sensible update rates; distant state preserved | Pass | W7 test 17. Live rings, for example full 78 / coarse 55 / frozen 69 |
| Performance with meaningful populations | **Partial** | Sim tick 3.3–11 ms steady with 200 records; first-tick hitch up to 442 ms after a reload. Real-hardware frame rate NOT VERIFIED |
| Tests | Pass | `w7.wildlife` 30 tests |
| Old saves preserved | Pass | Fixtures 165/165 |

- **Releases:** `20261126T161401Z-9068b88` / `index-CzxGZWdl.js` (from the report; attempt 1 stopped at the m004 test).
- **Known issues:**
  - **no births.** The live desktop world reached 6 dead from tick 74 to about 1,773, which is 5 wolf kills of deer plus my hare;
  - reactions lag up to one 2 s tick;
  - first-tick hitch after a load;
  - physical phone NOT DONE.

## W8 "Hunting"

| Criterion (from W8-REPORT §8) | Proposed | Evidence |
|---|---|---|
| Bow and arrows legitimately crafted | Pass | Live: bow 150/150, 2 × 4 arrows and 4 blunt arrows crafted at `b:10`; knife 40 → 36 (`c5-a`) |
| Projectiles follow physical trajectories | Pass | W8 tests 2–3. Live flights of 52–2,778 ms with impact points recorded |
| Arrows travel through the world; terrain, trees and buildings block | Pass (terrain and water live; trees and buildings from tests) | Live impacts: terrain ×12, water ×1 |
| Moving animals can be hit or missed | **Partial** | Live: 2 misses on moving hares with the sight on the animal (`aimOn` set) — blunt at 245 ms and sharp at 276 ms, both stopped by rising ground. Headless on this world (H5): a running deer (15.7 m in its tick) was hit with a lead (body, 314 ms, 40.9 m/s, wounded, damage 10, hp 2), and the same stand without a lead hit terrain. A browser hit on a moving animal: NOT VERIFIED |
| Damage from the actual hit | Pass | Every live outcome has part, speed and damage from contact |
| Damage, fleeing, death, stun distinct | Pass | Live: wounded deer (8, hp 4/12), killed hare, stunned hare, misses that startle |
| A wounded animal does not vanish | Pass | Live: the wounded deer was alive 108 m away, fleeing a wolf |
| Killed animals leave persistent carcasses | Pass | Live: carcass identical after frozen reload D |
| Butchering needs a knife, gives correct resources | Pass | Live hare: hide then raw meat, 1 swing each, knife 36 → 34. Headless deer: 16 swings, 4 meat, 2 hide, 2 bone; `no_knife` with the bow |
| No duplicated resources or false kills | Pass | Live: after the stun, dead and carcass counts were unchanged. After butchering, the shed stock was hide 1, raw meat 1 and stayed so after reload G. Headless: stock unchanged after 50 ticks and a reload; a second butcher is `not_found` |
| Non-lethal stun with defined recovery | Pass | Live: stunned (power 8, hp 3 = full); identical across reload E; seen fleeing at tick 1339 after the hit at about tick 1320. Headless H7 the same |
| Bloodless presentation, feedback | Pass, emulated | Toasts such as "The blunt arrow stunned the hare…" (`c7-d`) |
| Desktop and touch controls work | **Partial** | Desktop Q, mouse and Z used. Touch on the 390 emulation: hold, drag (heading −2.470 → −2.431) and release on the Bow button fired a journaled blunt shot (2,778 ms, terrain). A touch hit and a physical phone: NOT VERIFIED |
| Tests | Pass | `w8.hunting` 22 tests |
| Old saves preserved | Pass | Fixtures 165/165 (v8 save from `9068b88`) |

- **Release:** `20261126T182516Z-2429be3` / `index-D_QGs37z.js` (bundle and stamp verified, release name not verified, process breach as above).
- **Known issues:**
  - **W8 double-swing on one tap:** not reproduced in this pass. Two 60 ms taps gave exactly one swing each. It stays open.
  - **1 m terrain steps stop arrows** aimed at low or nearby animals. This caused most of my live misses (aim points landed on the ground before the animal).
  - **Trout are not huntable;** wolves' kills cannot be butchered (tests only; not reached live).
  - **The sight never leads.**
  - **Physical phone NOT DONE.**

---

## Integration chains 1–8 (one world: seed 1337, `w1`)

| # | Result | Where | Key numbers |
|---|---|---|---|
| 1 Explore → discover → on the map only after | **Pass** | Live browser | Clay `k:29,28:0` not discovered while the last report was 31 m away (player 16.1 m). Discovered at a report 15.3 m away; map deposits 33 → 34; list "clay 10/10 · 14 m SW". Nearby sand and gravel were absent from the list until discovered (list 37: "gravel 14/18 · 1 m N", "sand 9/13 · 15 m S"). Headless H1: not discovered at 40 m (`mine` → `undiscovered`), discovered at 20 m. Deposits are drawn in the land before discovery (known issue) |
| 2 Find → mine → carry → store | **Pass** | Live | 8 clay in 16 swings (17.6 s), bag 34 → 58/60, the next unit refused for capacity. Carried 33 m and stored: `b:18` clay 8. Deposit later exhausted |
| 3 Ore + fuel → smelter → ingots | **Pass** (iron ore and coal were Node-mined) | Live | Smelter built from browser-mined clay, sand and gravel plus stored stone and branches. Smelted 2 iron ore + 2 coal from tick 686 to tick 731 (45 ticks) → 1 iron ingot at the door, picked up |
| 4 Wildlife → observe → approach / threaten → response | **Pass** | Live | Hare: freeze at 7.6 m (target player), flee, grazing again in 3 ticks; also fled a fox. Deer: alert at 21.5 m, flee, stopped at 63.6 m. Wolves chased and killed a deer. Arrow impacts startled hares and a fox ("avoid", target noise) |
| 5 Bow → shoot moving animal → physics decides | **Partial** | Live + headless | Live: 15 journaled shots; 2 misses on moving hares with the sight on them (impact data above); 1 hit on a resting deer (body, 1,069 ms, 36.5 m/s, 8 damage). Headless: lead hit on a running deer, no-lead miss |
| 6 Kill → carcass → knife → butcher → collect → store | **Pass** (hare live; deer headless) | Live + headless | Live: resting hare killed at 17.4 m (body, 433 ms, 38.6 m/s, 9 damage); reload; knife; hide then meat; picked up; stored (hide 1, raw meat 1). Headless deer: 4 meat, 2 hide, 2 bone stored |
| 7 Stun → alive → recovers, no carcass or tombstone | **Pass** | Live + headless | Live: dead 5 and carcasses 5 unchanged; record identical across reload; fled at tick 1339. Headless: `stunned` → `flee`, `deadDelta` 0 |
| 8 Save and reload consistency | **Pass**, with one inconclusive attempt | Live + headless | Frozen reloads A, B2, C, D, E, F, G and H plus the desktop → phone handoff: all hashes equal, records and dead equal, 0 duplicates. Attempt B differed by exactly one command (a tick landed before the pause settled), so the harness was changed to require a stable hash over 2.5 s and B2 was repeated. Headless: 7 save and reload checks equal; restore and compacted restore equal |

## Defects found
- **No new game defect was confirmed in this pass.**
- **Observations recorded, not fixed:**
  - m004 timing failure (76.3 ms) under host load.
  - Arrows are frequently stopped by 1 m terrain steps in live play.
  - Wildlife thinning near the player with no births.
  - Mining refusal order: in Node the rate limit (`too_fast`) is reported before capacity. This is consistent with the documented order.

## Deferred / NOT VERIFIED
- Physical phone walkthrough (W5–W8): NOT DONE.
- Real-hardware frame rate.
- Iron and coal mining in the browser.
- A browser hit on a moving animal; a touch hit.
- A wolf-kill `picked_over` refusal in the browser.
- Fox stalk and pounce and the hare zig-zag in the browser.
- The live release name.
- The W8 double-swing (not reproduced, still open).
- W4 is still awaiting the owner walkthrough.

## Orchestrator note on the server-side release check

The integration agent could not run the server tool, which needed an interactive login. I ran these checks myself with the deploy key, each right after its deploy returned (see each W*-REPORT deployment section).

| Milestone | Commit | `/var/www/astrix/current` resolved to | Served bundle | Build stamp |
|---|---|---|---|---|
| W5 | `5917608` | `20261126T131223Z-5917608` | `index-BO7OAFQ3.js` | `5917608` |
| W6 | `12bf1e2` | `20261126T144002Z-12bf1e2` | `index-BVp4sZm9.js` | `12bf1e2` |
| W7 | `9068b88` | `20261126T161401Z-9068b88` | `index-CzxGZWdl.js` | `9068b88` |
| W8 | `2429be3` | `20261126T182516Z-2429be3` | `index-D_QGs37z.js` | `2429be3` |

All four build stamps were `dirty:false`. The W8 release is the one currently live.
