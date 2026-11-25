# M014: player-directed construction (evidence)

**Date:** 2026-11-25 · **Branch:** deploy/boxd

## Deployed vs merged

- **Not deployed.** Nothing was pushed. https://astrix.nyc.boxd.sh/ still serves the M013 build. Every browser number below comes from the local build (`Game/dist`), routed at `https://astrix.local/`.
- **Not merged.** The work exists only as local commits on `deploy/boxd`:
  - `b4703b2`: the feature (settlement rules v6), the tests and a rebuilt dist.
  - `b840b86`: the cheaper `multidraw=0` fallback, the drop-off leg added to the metrics, the "Turn 90°" label and the Controls.md update. This is the build the browser runs used: the probe's dist copy is identical to it (`diff -rq`).
  - The evidence commit that contains this report.

## What M014 adds (settlement rules v6)

### Catalogue (`SITE_RULES`, `Game/src/sim/homestead.ts`)

Each catalogue entry is data: footprint, door side, costs, work ticks, the largest ground step the footprint may span, and its function in the simulation.

| Building | Footprint (before turning) | Cost | Work ticks | Function in the simulation |
|---|---|---|---|---|
| Woodshed | 3 × 2 m | 12 wood, 4 fibre | 24 | Timber store for 60 wood. It is the woodcutter's drop-off and base. Its preview reports on the woodland within 30 m, planned for 12 wood a day. |
| Log store | 2 × 1 m | 6 wood, 2 fibre | 12 | Timber store for 24 wood. Preview radius 22 m, planned for 6 wood a day. |
| Well | 2 × 2 m | 8 wood, 2 fibre | 18 | Water source. Farmers and the herder draw water at whichever well is nearest the field or trough. |

- **Rotation.** `rot` 0–3 puts the door to the south (+z), east, north or west. Odd rotations swap the footprint's width and depth.
- **Door cell.** `siteEntrance` is the cell in front of the middle of the door side. The builder stands there to build, the woodcutter to stack wood, and the builder to fetch.
- **Old sites keep their spot.** Rotation 0, and every v4/v5 site (which has no rotation), gives the M012 builder spot exactly.
- **Not built:** path and road segments, fence and gate segments, storehouse/granary, workshop, animal shelter. See "Not done".

### One validator (`checkBuilding`, `Game/src/sim/buildings.ts`)

The placement preview and the journaled `place_site` call the same function on the same simulation state. A refused command returns the preview's reasons exactly, and the state hash does not change. A test compares the two at 60 candidate placements covering every kind and rotation.

The rules, in order:
1. **Position.** The footprint and its entrance must lie inside the homestead's 120 m walking window. The footprint's centre must be within 55 m of the farmhouse.
2. **Overlaps.**
   - Keep 1 m from the farmhouse, the well, pens, fields and other sites.
   - Do not touch another site's entrance, or put this entrance on another footprint.
   - Stay off the founder house and terraces, the store and barn zone, and any built M002 structure module.
3. **Fences.** No fence or gate edge on the walking grid may run inside the footprint.
4. **Ground.**
   - No water in the footprint or at the entrance.
   - Slope: the footprint may rise or fall at most `maxStep` (1 m) across it.
   - The door step to the entrance may be at most 1 m.
5. **Trees, using the woodland stage.**
   - Mature, old, dying trees and snags block, whether their trunk is in the footprint or their walking-grid claim reaches into it or onto the door step. The reason reads, for example, "a mature birch stands here (fell it first)".
   - Saplings, young trees, stumps and empty tree spots in the footprint or on the door step are cleared when the site is placed. They are removed for good (marked harvested, the record dropped, so nothing regrows there). No timber is credited, because it is brush. Replanting orders inside the footprint are dropped.
   - Trees the owner protected, trees in protected areas and the founders' grove always block, even saplings.
6. **Other natural things.** Bushes, rocks and other entities in the footprint block, with the reason "gather them first".
7. **Entrance.**
   - The entrance cell must be open ground once young growth is cleared.
   - A flood fill over the walking grid, with the footprint treated as solid, must reach the store spot and the farmhouse door from the entrance. The preview reports both route lengths.
   - The flood fill runs only once no other reason is left. So a spot with several problems may not list reachability until the others are fixed.

### Placement UX and controls (`Game/src/app/build-mode.ts`)

**Desktop:**
- **G** (free in walk and builder view, outside `?debug` builds) or **Farm → Build… (G)** opens build mode.
- The ghost follows the mouse. A click pins it. Clicking elsewhere, or dragging the ghost, moves it. The drag is intercepted in the capture phase, so the camera does not turn (checked in the browser).
- **X** or **Shift + wheel** turns it; **Shift + X** turns it back.
- **Enter** or **Place & approve** places it. **Escape**, **G** or **Close** leaves.
- R stays "return home". Q and E stay camera rotation and Use.

**Touch:**
- Farm → **Build…**. The ghost starts 6 m in front of the founder.
- Tapping the ground on the right (look) half moves it there and pins it. A drag that starts on the ghost slides it. Taps are measured as < 9 px of movement and < 450 ms.
- The bar has the catalogue buttons, **Turn 90°**, **Place & approve** and **Close**.
- On a portrait phone the bar sits at the top (y 56–286 at 390 × 844). The joystick zone starts at y 287 and Jump is at y 740. The Builder view button, the banner pad and the Use button are hidden while building.

**The bar shows:**
- size and door side;
- costs against the free stock in the store;
- the verdict: green, or red with every reason;
- what construction will clear;
- the route to the store;
- for timber stores, the woodland figures (see below).

**The ghost** is one mesh in one draw call: 936 triangles for a woodshed with its ring. It contains:
- the footprint cells, green or red;
- a door-step tile and post;
- markers above trees: green may be felled, blue protected, orange will be cleared, red blocks;
- a ring for the work radius.

It is rebuilt only when the verdict or the marked trees change. The validator runs at most every 180 ms.

**Confirming** sends two journaled commands: `place_site { kind, x, z, rot }`, then `approve_site`, which reserves the materials as M012 did. The Farm panel lists every site with its kind, door side, state, progress, reservations, timber held and status. It keeps the M012 Approve and Cancel buttons, and adds a "Quick woodshed near the farmhouse" button that runs the v6 validator.

### How the woodland and buildings connect

**The preview.** `buildingPreview` calls M013's `woodlandStats` for a woodshed or log store. It calls it twice over the same area:
- with the store set to the new building's door;
- with the founder store, for comparison.

`woodlandStats` gained two optional query fields: `footprint` and `clears`.
- Trees within the policy's building buffer (5 m) of the planned footprint count as protected and are left out of the sustainable yield. A test confirms the finished site protects exactly those trees.
- Trees the construction clears are left out.
- The answer gains `newlyProtected`.

The bar then shows:
- trees in the radius, how many may be felled (with their timber) and how many are protected (and how many of those by this building's buffer);
- how many are regrowing;
- the mean haul to this building against the haul to the store now;
- the sustainable trees and wood per day and the rotation;
- whether the building's planned demand has enough managed tree spots, or how many are short.

**The simulation.** A finished woodshed or log store holds `stock` (wood, at most its capacity).
- **Woodcutter drop-off.** The woodcutter's chop task, and any wood load in hand, ends at the nearest drop-off by straight line from the tree: one of the finished timber stores with room, or the founder store (the founder store wins a tie). The new effect is `stow`. A store with too little room takes what fits, and the rest is carried on.
- **Stock and felling.** Timber in the stores counts as store stock for reservations, `freeInStore` and the woodcutter's stock target. That target is 40 wood plus the stores' capacity.
- **Builder fetch.** Builders fetch reserved timber from whichever store (founder store, woodshed or log store) is nearest the site and holds some.
- **Steward fences.** The steward's fence wood comes from the founder store first, then the timber stores.
- **Wells.** Farmers and the herder draw water at the nearest well: a finished well, or the farm well.

**Cancelling.**
- A planned site, or an approved site with nothing delivered, is removed and its reservation released, as in M012.
- In v6, a site with materials on it can also be cancelled. It becomes `cancelled` (reservations released, work lost), and the builder carries the delivered materials off (`reclaim`, at most 8 per trip) to the store or a timber store, walking, with no teleport. The site disappears when it is empty.

**Finished buildings** are blocked cells on the walking grid and solid for the player (`SOLID.shelter`), in their turned footprints. The door step stays open.

### Rendering (`Game/src/render/homestead.ts`)

- **Models.** Each building is modelled in its own frame and turned by `turnBox` with the simulation's rotation. They use the plain vertex-coloured block style of the farmhouse:
  - woodshed: the M012 model, with one log per 4 wood stored, up to 15 (v4/v5 woodsheds keep their 6 logs);
  - log store: an open lean-to with up to 8 logs;
  - well: a stone curb round dark water, posts, a windlass beam, a little roof and a plank step.
- **Construction stages** are drawn rotated: stakes and string, then the materials on site, then a frame rising with the work. A cancelled site gets red stake tops and its material pile.
- **Draw calls.** Everything is inside the existing `homestead_troughs` mesh, so sites and buildings add no draw call. A test confirms the mesh count stays the same through a build and that the drawn geometry grows with the stock.

### Fallback LOD fix (`Game/src/render/nature.ts`)

- On the `multidraw=0` tiled path only, near detail now switches to mid at 70 m instead of 90 m (`FALLBACK_LOD_BANDS`). Mid and far are unchanged. Multi-draw is unchanged.
- **Deliberate test change:** `m008.groundcover` asserted identical LOD counts on both paths. It now asserts the same far band and the same total, with fewer near instances and fewer triangles on the fallback.

## Save compatibility

- **Gated behind v6.** Everything above needs rules v6.
  - Fresh worlds are founded with `found_homestead { rules: 6 }`.
  - Older saves load with their exact bytes and hash, then the app sends one journaled `upgrade_homestead { rules: 6 }` (from v1–v5).
- **Upgrade fix.** Upgrading from v5 to v6 no longer restarts the woodland. The woodland clock is started only when coming from below v5.
- **At the upgrade:**
  - every site gets `rot: 0`;
  - every finished woodshed becomes an empty timber store (`stock: {}`);
  - the woodland snapshot (records, policy, quota, orders) is unchanged, and so are the stages of every tree, the walking-grid hash, the store, the bag and the villagers (test).
- **The old woodshed works.** After the upgrade, the M012 auto-placed woodshed takes the woodcutter's loads when it is nearer than the store.
- **Snapshot fields.** `rot` and `stock` appear only in v6 snapshots, so v4/v5 snapshot bytes are unchanged. v5 refuses `rot`, the new kinds, the `stow`/`reclaim` legs and `stock` (snapshot validation). `place_site` with `rot` on a v5 homestead is refused with `needs_rules`.
- **Pinned hashes** (fixed command sequence, seed 1337, generator v2):
  - v4 `6ce5ae532227eeb9` (M012 build `7d66e8c`);
  - v5 `f249cb544027b9bd` (measured with the M013 build `5ef2236` before any M014 change);
  - v1 `16ca4c350d98096f`, v2 `542411888c83bf3a` and v3 `d2c28283712a8de7` stay pinned in the M012 tests;
  - genesis is still `e659504b056654dc`.
- **Not tried in the browser:** a real v5 save from the deployed M013 site.

## Tests (Node): `cd Game && npx tsc --noEmit && npm test && npm run build`

The typecheck is clean and the build passes. **325/325 tests pass**: 313 from before, plus 12 new in `Game/tests/m014.construction.test.ts`.

New tests:
1. **Catalogue and rotations:** sizes swap with the rotation, the door is on the stated side, the entrance lies outside the footprint, and rotation 0 gives the M012 spot.
2. **Validation:**
   - the farmhouse, a pen (plus "a fence runs here"), a field (plus its fence), the store and barn, outside the window;
   - steep ground and water found by a scan;
   - a planted sapling is cleared ("1 sapling") while the same tree aged to mature blocks, and an owner-protected sapling blocks;
   - placing clears it for good (no record, never regrows, off the grid);
   - a door step walled in with stone gives exactly "the entrance cannot be reached from the store on foot", and the command refuses with the same reasons and no state change.
3. **Same validator:** at 60 candidates covering every kind and rotation, preview and command agree, with the same reasons on refusal. Malformed `rot` and kinds are refused.
4. **Woodland figures in the preview:**
   - the preview leaves the hash unchanged;
   - the store is the door cell;
   - the haul to the woodshed is less than a third of the haul to the store;
   - after placement, the counts of harvestable and protected trees equal the preview's (the buffer).
5. **Reservations across three sites** (woodshed, log store, well) with 20 wood:
   - 12, 6 and 2 are held in id order and never exceed the stock;
   - the third site waits "for a builder", then "for 6 wood";
   - a journaled deposit lets it take the rest;
   - all three finish, solid for the walker and the player, with the door step open.
6. **The woodshed changes the woodcutter:**
   - each felling's drop-off is the nearer of the shed and the store (or the store when the shed is full);
   - timber is stacked in the shed;
   - wood is conserved;
   - a shed holding 58 takes 2 of an 8-wood load and the rest goes to the store;
   - a builder fetches a log store's timber from the woodshed, and the shed goes 60 → 54.
7. **Wells:** a built well is the water source nearest to jobs around it.
8. **Cancel:**
   - a planned site goes at once;
   - after 8 wood was delivered, cancel releases the reservation;
   - the builder reclaims, and the store gains wood only with the builder at it;
   - materials are conserved every tick, the site goes, and the store is back to 30.
9. **Reload mid-construction** (materials on site and a load in hand):
   - snapshot + journal restores the same hash and the same homestead snapshot;
   - both sessions then run 500 ticks to the same hash;
   - replay from genesis and a second run of the commands agree.
10. **Old saves:**
    - v4 and v5 pins;
    - v5 restores byte-identical and refuses the v6 additions;
    - v5 → v6 once only, with everything listed above unchanged and the woodshed becoming a timber store;
    - 600 ticks later, restore and replay reach the live hash;
    - v1 → v6 directly.
11. **Strict validation of v6 sites:** bad rotation, missing rotation, unknown kind, stock on an unfinished site, a cancelled site with reservations, an unknown leg effect, stock over capacity (61 > 60), and fibre in a woodshed are all refused.
12. **Rendering:**
    - every kind × rotation × stage draws inside its footprint (materials within 1.6 m of it);
    - `turnBox` maps the door side;
    - the view's mesh count is unchanged through a build;
    - stored timber is drawn.

No regressions: the M012 work and living tests, M013 woodland, banners (M009), swimming (M011), fauna, navigation and the other existing suites all pass. The only deliberate edits to existing tests are:
- `m010.navigation` and `m012.living` now use `rules: 7` as their invalid example;
- the `m008.groundcover` LOD assertion described above.

## Browser runs (Playwright Chromium, software GL, local build at https://astrix.local/?chain=0)

**Setup:**
- `Game/dist` was copied to `.kiro/artifacts/screenshots/probe/dist`; `diff -rq` shows it is identical.
- Each run starts a fresh world (empty localStorage).
- The probe is `m014-construction.probe.js`; configured copies are written by `gen-construction.mjs`.
- Samples are the game's own `window.__metrics`. The probe projects world points to the screen with the read-only `__probe.camera`.
- There were no page errors in either run.

### Desktop build run (1000 × 600): `m014-build-build-results.json`, all 11 checks pass

The run took 306 s, at `?timescale=30`, sampled over ticks 29–1,053.

| Check | Result |
|---|---|
| freshWorld | Rules 6, no sites. The store holds 20 fibre, 10 food, 6 seed and no wood. |
| invalid | Build mode opened with Farm → Build…. Hovering over the farmhouse gives a red ghost with "too close to the farmhouse, the well or a pen" and "a fence runs here". |
| valid | X turned the woodshed to face east. Hovering at (-32, 20), beside the woodland north of the farm, gives a green ghost: entrance (-30, 21), 60.6 m walk to the store, 34.2 m to the farmhouse. Bar text: "Woodland within 30 m: 2 trees · 1 may be felled (15 wood) · 1 protected · 1 regrowing · Haul to this woodshed: 5.8 m on average (to the store now: 64 m) · holds 60 wood · Sustainable: 0.09 trees (1.4 wood) a day, 10.8-day rotation · 12 wood a day needs 9 managed tree spots: 8 short". |
| drag | The pinned ghost was dragged from (-32, 20) to (-29, 20) and back. The camera did not turn. |
| placed | Woodshed `site:15` (rot 1) and well `site:16` at (0, 8) (rot 2, door north), both approved, in 4 journaled commands. Reserved at once: 4 fibre and 2 fibre. There was no wood yet. |
| setup | Farm panel: Cora woodcutter, Ada builder, harvest "by demand" (3 commands). |
| construction | Woodshed deliveries at ticks 49 (4 fibre), 111 (5 wood), 160 (10), 227 (12); finished at tick 354. Well deliveries at 403 (fibre) and 463 (8 wood); finished at 483. |
| woodshedDropOff | After the shed was finished, Cora carried the timber of `tree:31:32:1` (a birch that was young at the epoch) to the woodshed (`stow` legs sampled at ticks 990–1,021). The shed holds 6 wood. Four earlier fellings, all before the shed was finished, went to the store, which ended with 27 wood. |
| midReload | Reload at tick 83 with the woodshed holding 4 fibre and 6 work: hash `f587f94276c7d1fa` before and after, with the same sites and loads. |
| persist | After both buildings were finished, reload at tick 1,057: hash `cfa7a49d1bb7efa6` before and after, with identical sites (done, stock). |
| render | At most 90 draw calls and 222,024 triangles (views below). During the run: at most 78 calls and 128,690 triangles. |

**The second building's spot.** The probe's four listed spots for the well were all refused at rotation 2. The final click landed at (0, 8), which the validator accepted, so the well was built there. The candidate list in `CFG.well` should be revised before the next run.

### Phone run (390 × 844, `isMobile`, touch, deviceScaleFactor 1): `m014-phone-phone-results.json`, the check passes

- Farm → Build… opened build mode with the ghost at (-19, -24), in front of the founder.
- One tap at (300, 520) on the right half moved the ghost to (-19, -21) and pinned it. The spot was green, with woodland stats: 9 trees, 1 may be felled, haul 28.2 m against 33.2 m to the store.
- Turn 90° gave a door to the east. Place & approve made `site:15`, a woodshed with rot 1, approved (2 commands).
- Layout: the bar covers y 56–286. The joystick zone starts at y 287 and Jump is at y 740–820. There is no overlap.
- Not exercised on the phone: dragging the ghost by touch (Playwright's touchscreen only taps). The drag code path is shared with the mouse, which was tested on desktop.

## Performance

**Render** (budget 120 draws / 250k triangles; the world from the build run at tick 1,057, with both buildings):

| View | Calls | Triangles | M013 (same camera) |
|---|---|---|---|
| farm (dist 40) | 82 | 134,756 | 82 / 121,602 (epoch world, no buildings) |
| farm, build mode open (ghost) | 83 | 135,692 | ghost: +1 call, +936 triangles |
| farm, `multidraw=0` | 90 | 134,646 | – |
| farm-600 | 47 | 123,812 | 46 / 116,156 |
| forest (dist 50) | 38 | 198,930 | 38 / 189,674 |
| forest, `multidraw=0` | 49 | **212,000** | 49 / 217,100 |
| forest-140, `multidraw=0` | 70 | **218,620** | 70 / 226,720 |
| pan forest `multidraw=0` (max of 10 samples over 20 s) | 52 | **222,024** | 52 / 237,210 |

- **Fallback margin.** The 70 m near band on the fallback lowered the fallback forest views by 5–8k triangles and the pan peak by 15k. The pan peak is now 222k against the 250k budget (it was 237k).
- **Not a strict A/B.** The world here is 1,000 ticks older than M013's epoch views, with seeding and growth. The multi-draw forest view went up 9k, from 189,674 to 198,930, with no LOD change on that path, so part of every difference is the world's own change.

**Simulation cost:**
- **Browser** (`sections.tick`, the whole real-time tick at ×30): mean 1.87 ms, p95 3.4 ms, max 25.8 ms. The homestead view update: mean 0.5 ms, p95 2.2 ms, max 21 ms.
- **Node** (900 ticks, woodcutter, builder, seed 1337; `.m014-scratch/perf.ts`):
  - v6 with two sites: mean 0.50 ms, p99 2.43 ms, max 11.9 ms;
  - v5, same roles, no sites: mean 0.68 ms, p99 4.07 ms.
- **The validator:**
  - `checkBuilding`: mean 10.7 ms, max 16 ms in Node; most of it is the reachability flood fill;
  - `buildingPreview` with the two woodland queries: mean 23 ms, max 39 ms in Node;
  - in the browser, at most 30.6 ms per preview (5 previews, 89 ms in all), throttled to once every 180 ms while the ghost moves. So moving the ghost can cost a 30 ms frame now and then.

## Tests vs browser; visual vs simulated

- **Simulated, hashed, and checked in the browser:**
  - placement and refusal reasons;
  - rotation;
  - reservations;
  - builder deliveries, work and completion;
  - the woodshed's stock and the woodcutter's `stow` drop-off;
  - the mid-construction reload and the persistence hashes.
- **Tests only:**
  - water, slope, sapling clearing versus a mature tree blocking, a protected tree blocking, an unreachable entrance;
  - preview and command equality across many candidates;
  - reservations across three sites;
  - capacity overflow;
  - builders fetching from the woodshed;
  - wells as the water source;
  - cancelling after delivery with materials carried back;
  - the v5 → v6 upgrade with woodland and woodsheds kept;
  - strict validation;
  - replay determinism.
- **Presentation only:** the ghost, its markers and ring, and the bar text. All of it reads `buildingPreview` and writes nothing.
- **What the screenshots show:**
  - `build-1-red-ghost.png`: the bar's reasons, but the red ghost itself sits under the bar at the top of the builder-view frame and is barely visible. `build-2-green-ghost-woodland.png` and `build-3` show the ghost more clearly.
  - `build-7-woodcutter-to-woodshed.png`: taken from the overhead farm camera. Cora is a small figure at that distance; the stow is evidenced by the sampled sim legs and the shed's stock.
  - `build-9-woodshed-close.png`: shows the woodshed from behind (its back wall). Its open east front and the stacked timber are not facing the camera.

## Screenshots (in this folder)

**Desktop build run:**
- `build-0-fresh-world.png`: the fresh world.
- `build-1-red-ghost.png`: the invalid spot.
- `build-2-green-ghost-woodland.png`: the green woodshed ghost with the woodland figures.
- `build-3-second-building-ghost.png`: the well ghost.
- `build-4-farm-panel-sites.png`: the Farm panel with the sites.
- `build-5-under-construction.png`: a site under construction.
- `build-6-mid-construction-after-reload.png`: after the mid-construction reload.
- `build-7-woodcutter-to-woodshed.png`: Cora taking wood to the woodshed.
- `build-8-finished-buildings.png`: both buildings finished.
- `build-9-woodshed-close.png`: the woodshed close up.
- `build-view-*.png`: the measured views.

**Phone run:** `phone-p1-build-open.png`, `phone-p2-ghost-turned.png` (bar at the top, green ghost in front of the founder, joystick ring and Jump clear), `phone-p3-placed.png`.

## How to run the probe against any URL

```
cd 13_Integration_and_QA/Evidence/M014-player-construction
node gen-construction.mjs <base-url> <out.js> [prefix] [build|phone] [untilTick] [timescale]
# local build (copy Game/dist to /projects/sandbox/.kiro/artifacts/screenshots/probe/dist first):
node gen-construction.mjs https://astrix.local/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m014-build-a.js build build
node gen-construction.mjs https://astrix.local/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m014-phone-b.js phone phone
# deployed site (once deployed):
node gen-construction.mjs https://astrix.nyc.boxd.sh/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m014-live-a.js live build
```

- Run the written file with Playwright `browser_run_code_unsafe { filename }`. Retry once on ENOENT, and use a new filename after each edit.
- Only `https://astrix.local/` is served from the local dist copy; any other base loads from the network.
- Results go to `m014-<prefix>-<phase>-results.json`, and screenshots to `<prefix>-*.png`.
- The build phase takes about 5 minutes. The Playwright tool stops a run after 900 s.

## Not done / not verified

- **No real phone.** Phone emulation in desktop Chromium only, with taps only (no touch drag).
- **Not deployed and not merged**, so there is no live-site run.
- **The catalogue is three buildings.** Not built: storehouse/granary (the founder stockpile capacity of 200 is validated as fixed), workshop, animal shelter, path/road and fence/gate segments.
- **The woodland near the farm is sparse at the epoch.** There are 15 trees in the 120 m managed window, and 2–9 within a woodshed's 30 m radius. "Beside a forest" in the browser run is beside the few trees north of the farm. The preview reported 8 managed tree spots short for the woodshed's 12 wood a day. The large forests (for example at 220, -110) lie outside the managed window, which M014 did not change.
- **Drop-off choice is by straight line, not walking distance.** The woodcutter picks the drop-off by straight-line distance from the tree. The preview's haul figures are walking-grid distances.
- **No timber from cleared growth.** Young growth cleared by construction is discarded, not credited as timber.
- **Trees can grow up beside a building.** Untouched natural trees just outside a footprint keep their own lifecycle. One grew to claim an edge cell of a finished building in a test (harmless: the cell was blocked either way). A tree could, in principle, later grow onto a door step. The villager would then report the obstruction and give up, as M012 does; this has not been seen.
- **Preview cost.** Up to about 30–39 ms per preview, throttled to once every 180 ms while the ghost moves.
- **Not seen in the browser:** cancelling after delivery, the log store, a full woodshed overflowing to the store, and builders fetching from a woodshed. These are covered by tests only.

## Live deployment check

Release `20261125T084321Z-d73c1ea` was deployed to https://astrix.nyc.boxd.sh. It is pushed to `deploy/boxd` but not merged to `main`. The served bundle matches the local build (`assets/index-Bpr8TR4w.js`).

The build probe was generated with `node gen-construction.mjs https://astrix.nyc.boxd.sh/ <out> live build` and run against the live site in a fresh headless Chromium context (desktop 1000x600, software GL). The run took 306.7 s. There were no page errors, and **all 11 checks passed**. Results are in `m014-live-build-results.json`, and screenshots in `live-*.png`.

- **Invalid spot:** the red ghost over the farmhouse gave "too close to the farmhouse, the well or a pen" and "a fence runs here".
- **Woodshed:** placed at (-32, 20) with the door facing east. The preview said: 2 trees within 30 m (1 may be felled, 1 protected, 1 regrowing), a 5.8 m haul against 64 m to the store, and the woodland 8 tree spots short of the planned demand.
- **Well:** placed at (0, 8) with the door facing north. The probe's preferred well spots were all refused; this is a known issue.
- **Construction:** the woodshed finished at tick 352 and the well at tick 479. The woodcutter stowed wood in the woodshed, which ended holding 6 wood.
- **Reloads:** a reload mid-construction at tick 83 gave hash `f587f94276c7d1fa` before and after. A reload after completion gave `49bc9f0611a1d4bd` before and after.
- **Render:** at most 90 draw calls and 218,740 triangles. The peak was on the `multidraw=0` forest pan.

The phone placement flow was run only in emulation, against the local build. No real phone was used.
