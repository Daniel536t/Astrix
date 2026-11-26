# FINAL-MAP: full-world map visibility (owner decision 4)

**Status: Implemented and Verified on the local build. Not owner-accepted. Not committed, staged, pushed or deployed.**

- Repository `Astrix`, branch `deploy/boxd`, HEAD `aad7660` (live W8 build, wilderness content v9). All changes are uncommitted.
- Not touched: `chain/`, `13_Integration_and_QA/Evidence/MB004-crank-renewal/` (another agent's work shows in `git status`; it is not mine), `/projects/sandbox/.tools/backups/w4-20261126/`, `05_Noxel_Studio/Asset_Sheets/2026-11-24_animals/Animals`, `Evidence/W1-wilderness-scenario/live-entry.png`.
- `Game/dist/` was rebuilt by `npm run build`. It was already modified in the working tree before this work.

## What changed (presentation only)

| File | Change |
|---|---|
| `Game/src/app/map-survey.ts` (new) | Whole-world map data from the pure generation functions: every deposit (`depositsInChunk` for all 64 × 64 chunks), every place (`allPlaces`), a 512 × 512 terrain overview at 4 m a pixel, and 2 m zoomed-in tiles. Jobs are ordered nearest the focus first. The finished deposit and place lists are cached per seed, generator and content version in `localStorage` (`astrix:mapsurvey:v1:…`, 37,949 chars for seed 1337). The cache is strictly validated and display-only. The file also has clustering for low zoom and a survey-worker-only memo of the v2 `column()` function. |
| `Game/src/app/map-survey.worker.ts` (new) | Runs the survey jobs off the main thread (3 workers on this host). |
| `Game/src/app/map-nav.ts` (new) | Tap-to-navigate. A tap plans a route in 6 ms slices. When a route is found, the old navigation waypoint is removed and the new one is set, using the existing journaled `remove_waypoint` and `set_waypoint` commands, under the name `Destination`. An impossible destination keeps the previous route, waypoint and trail and shows the reason. Saved waypoints stay separate. Arrival or Stop removes the navigation waypoint. After a reload, the saved `Destination` becomes the route again, with no new journal entry. The W5 refine, stray-replan and 60 m trail logic was moved here unchanged. |
| `Game/src/app/wild-map.ts` | No fog. The whole terrain is drawn, plus every generated place and deposit (type colour and shape; `Fe`/`Cu`/`C`/`Cl`/`S`/`G` glyphs at ≥ 2 px/m; clusters with counts below 0.6 px/m). Places you have visited and deposits you have found keep their discovery records and are only marked (✓, white outline). Worked-out deposits are hollow. The route is no longer clipped. The player arrow is always drawn, pinned to the edge when off-view. The lists are: saved waypoints, all places, and all deposits (nearest first). There is a new legend. On phones the popup sits at the bottom edge of the map. Exploration reports are sent exactly as before; only the toast text changed. |
| `Game/src/app/wild-game.ts` | UI text only. When a mine swing is refused with `undiscovered`, the toast no longer says "walk up to it so it goes on your map". |
| `Game/src/styles.css` | Legend swatches; phone popup size. |
| `Game/tests/final.map.test.ts` (new) | 6 tests (below). |

**Sim rules: none changed.** `git diff -- Game/src/sim` is empty. There is no content version bump. The journal, snapshot and hashes are unchanged.

### Mining rule check

- `mineDeposit` still requires all of the following:
  - the deposit is discovered (an explore report within 24 m);
  - the player is within 3 m;
  - a stone pickaxe is in hand;
  - rate, capacity and depletion limits.
- Reaching 3 m means walking through the 24 m discovery radius, and `WildGame.mine` already sends `reportNow` (an explore report) before the swing.
- **The case that can still refuse a legitimate miner:** if the explore report itself is refused as `implausible` (travel credit), the swing is refused with `undiscovered`. The UI now explains this instead of pointing at the map. The rule was not changed.

## Tests

- `npx tsc --noEmit`: OK.
- `npm test`, run 1 (before the last two UI fixes): **584 tests, 584 pass, 0 fail.**
  - This is the 579 existing tests plus 5 new ones. The 6th new test, the memo equality test, was added after this run.
  - The m004 test "v2 chunk generation stays within budget per chunk" passed.
- `npm test`, run 2 (final code): **585 tests, 584 pass, 1 fail.**
  - The failure was `m002.validation` "candidate search is cost-ranked, deterministic and inside its budget": `search took 114.64 ms`, against a limit of `< 100`. This is a wall-clock test of settlement code I did not touch.
  - The host load average was 12.35 / 13.28 / 11.53 on 8 cores.
  - Re-run in isolation (`node --test tests/.build/m002.validation.test.mjs`) 3 times: 8/8 pass each time. The test was not relaxed.
  - The m004 chunk-budget test passed in run 2.
- `npm run build`: OK. Bundle `index-BAIxaxIE.js`, worker `map-survey.worker-CCxMv2em.js`.
- The existing fixtures, pins and replays all pass unchanged in both runs: w1..w8 wilderness fixtures and pins, settlement genesis `e659504b056654dc`, v1..v8, and the v6/v7 fixtures.

New tests in `final.map.test.ts`:

1. **Survey without discovery.** In a fresh v9 world (0 deposits found, 0 places visited):
   - The places equal `allPlaces` (40 places).
   - The first 64 surveyed chunks are the nearest to the player, and they equal `depositsInChunk` exactly.
   - More than 10 of the deposits lie farther than 24 m away.
   - The state hash, map snapshot (discovery records) and journal length are unchanged after the survey.
2. **Overview.** Every pixel is opaque; Mirror Lake is drawn blue.
3. **Cache.** Round trip works; a bad id, another seed or invalid JSON is refused. Clusters keep every count.
4. **Seen on the map, not mined remotely.** Iron `e:31,16:6`, about 315 m from the spawn:
   - From the spawn: `undiscovered`.
   - Forging a position beside it: `undiscovered`.
   - Jumping there with an explore report: `implausible`.
   - The hash is unchanged after these refusals.
   - Walked there: discovered, and a swing is accepted.
   - Walked 85 m away: `out_of_reach`.
   - Back beside it with bare hands: `no_pickaxe`.
   - The journal replays to the same hash.
5. **Tap to navigate.**
   - Tap 1 creates one `Destination` waypoint, a route and a trail.
   - Tap 2 replaces it: the journal gets `remove_waypoint` then `set_waypoint`; the saved "Camp" waypoint is kept.
   - Tapping Mirror Lake is refused with "deep water". The route, waypoint, journal and hash stay unchanged.
   - Tapping outside the world is refused with "outside the world".
   - Routing to a saved waypoint makes no `Destination`.
   - A new navigator (a reload) restores the destination with no journal entry.
   - On arrival the waypoint is removed and the trail cleared.
   - The journal replays.
6. **Memo equality across realms.** A `worker_threads` worker with the column memo gives deposits identical to the main thread for the listed chunks: at least 30 deposits of at least 4 types.
   - One-off whole-world check (scratch, not in the suite): plain run 1039 deposits, signature `4e6585472215`, 33,957 ms; memo run identical 1039 / `4e6585472215`, 17,361 ms.

## Browser (local build, Chromium headless, routed `https://astrix.local/`, seed 1337 fresh world)

The page ran at about 3 fps on this loaded host (software WebGL). Survey times are measured from when the map starts surveying, at game start.

| Check | Result |
|---|---|
| Fresh world, map opened at once (desktop 1280×800) | Opens in 11.3 ms. Places: 40 at once. Deposits near the player at open: 32. Overview (all terrain) 11,428 ms. Deposits within 300 m 13,724 ms. All **1,039 deposits 23,115 ms**. Deposit CPU in workers 18,764 ms in total, max 89.6 ms per chunk. Survey work on the main thread is at most 25.7 ms per frame (`surveyPumpMaxMs`). Before the overview is ready, unsurveyed land is a flat grey-green, not black. |
| Whole world zoomed out | 1,039 deposits drawn as 99 clusters; 40 places; draw 0.5–1.1 ms. Screenshot `fm-a4`. |
| Discovery after all this | 0 found, 0 visited, 29 explored cells (unchanged; still recorded as you walk). |
| Tap far, (150, −420) | Waypoint `w:1 Destination`. Route 344 m, planned in 526 ms (71 ms CPU). Trail visible, 122 triangles. Pill "344 m · the marked spot". 57 draw calls / 149,058 triangles (budget OK). Screenshots `fm-b1`, `fm-b2`. |
| Tap another, Fertile Meadow | `w:1` removed; `w:2 Destination` set. 1 waypoint in total. Route 192 m, 1 ford. |
| Tap Mirror Lake | "No route to Mirror Lake: the destination is in deep water (5 m deep; …). Still heading to Fertile Meadow". Waypoint `w:2` and route unchanged. Screenshot `fm-b4`. |
| Walk 14 m along the route | Remaining 194 → 181 m. Trail start moved from (−81.5, −171.5) to (−94.5, −172.5). 0 replans, refine 0.4 ms. |
| Far deposit not mineable | Nearest deposits 32–45 m away, none found. E pressed 3 times: 0 mines. |
| Reload | Deposits from cache in 2 ms (1,039). The overview is recomputed (9,261 ms). Destination `w:2` restored with a new route. |
| Phone 390×844 (touch) | Minimap tap opens the map (18.1 ms). 0 of 3,276 sample points over the map sheet belong to another control. Touch pan moves the centre. Pinch zoom goes 1.08 → 3.68 px/m. Tap 1 creates `w:1`. Tap 2 replaces it with `w:2` (1 waypoint in total). The popup is inside the sheet. Minimap and pill overlap 0 of the 14 other visible controls. 42 calls / 92,226 triangles. Minimap 0.74 ms average, 7.7 ms max. |
| Errors | 0 console errors, 0 page errors, 0 failed requests, 0 HTTP ≥ 400, in every run. |

Probes A–C ran on the build from just before the last two UI fixes: the phone popup anchoring and the "surveying…" label refresh. Desktop behaviour is the same in the final build. Probe D (phone) ran on the final build.

Scripts: `fm-a-setup.js`, `fm-b-taps.js`, `fm-c-walk.js`, `fm-d-phone.js`, `fm-t-timeline.js`. Screenshots: `screenshots/`.

## Limitations / NOT VERIFIED

- **Not instant on the first load of a seed.** On this host a fresh seed takes:
  - 23.1 s for all deposits;
  - 11.4 s for the whole terrain overview;
  - 13.7 s for the deposits within 300 m.
  
  Places are immediate. Later loads take 2 ms for deposits from the cache. The overview is not cached (1 MB), so it is recomputed in about 9 s after each reload. Real-device timings are **NOT VERIFIED**.
- Mining in the browser through the UI (crafting a pickaxe, walking to a deposit, swinging) is **NOT VERIFIED**. It is covered by node test 4 only.
- Real physical phone, landscape and 360 px layouts: **NOT VERIFIED** (emulated 390×844 only).
- The live site has not been deployed or tested. **NOT VERIFIED.**
- Tapping the minimap opens the full map. It does not set a destination.
- Routes are the W5 coarse 8 m routes, so long straight segments can appear (for example 330 m), as before.

## Orchestrator verification and deployment (recorded after the results were read)

**Pre-commit check**
- I ran the full suite myself on the final working tree: **585 tests, 585 pass, 0 fail**.
- Typecheck was clean and the build passed.
- `git diff -- Game/src/sim` was empty, so no sim rule changed.

**Commit**
- `c28cd1d3cb49bd66de1989b88a6094a4010a28ad`.
- Confirmed on the remote by `git fetch` and by the GitHub branches API before deploying.

**Deploy attempt 1**
- Stopped at its own test step: 585 tests, 584 pass, 1 fail. Nothing was uploaded.
- The failure was the m004 wall-clock check "v2 chunk generation stays within budget per chunk", which measured 60.1 ms against its 60 ms limit.
- Host load average was about 14. This is the same flake recorded in W5 and W7, and the threshold was not relaxed.

**Deploy attempt 2** (same commit, no changes)
- Exit 0, and its own suite run passed 585 / 585.
- Release: `20261126T224414Z-c28cd1d`, and the server's `current` link resolves to it.
- Bundle: `assets/index-BYLgLfLr.js`, stamped `commit:"c28cd1d", dirty:false`. The worker bundle `assets/map-survey.worker-CCxMv2em.js` returns HTTP 200.

**Live check**
Fresh headless Chromium, desktop 1000x600, software GL, a new wilderness world on seed 1337 with no cache, observed for 60 s.

| Item | Result |
|---|---|
| Wilderness content | 9 |
| Survey workers | 3 running, none failed |
| Places | all 40, in 696 ms |
| Terrain overview | done in 29.5 s |
| Deposits within 300 m | done in 31.6 s |
| All deposits | 1,039, done in 44.5 s |
| Worker time per chunk | at most 63.7 ms |
| Main-thread sync | max 0 ms |
| Draw calls / triangles | 56 / 152,068 |
| Errors | 0 page errors, 0 console errors, 0 failed requests, 0 HTTP ≥ 400 responses |

Deposit fill-in on the live site took **44.5 s** on a first load. That is slower than the 23 s measured locally, on a host under load and with software rendering.

**NOT VERIFIED on the live site:** tapping to set a route, waypoint replacement and the trail. These were verified on the local build, as reported above.

**Status:** Implemented and Verified (local), deployed. **Not owner-accepted.**
