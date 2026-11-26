# W4 "Build anywhere": completion report (DRAFT, uncommitted)

**W4 status: candidate, not accepted.** Physical-phone walkthrough: NOT DONE, requires owner.

- Repo `Astrix`, branch `deploy/boxd`, HEAD `86865c8cc790056b6716a7a04a28dcf49acd234e`. All W4 work is uncommitted, unstaged and unpushed. Nothing was deployed.
- Built on the preserved W4 working tree; the backup in `.tools/backups/w4-20261126/` was not touched.
- Scope: the owner's ordered list, items 1–8 done in code and tests, item 9 done as an emulated desktop and phone run only. **Physical-phone walkthrough: NOT DONE, requires owner.**
- The pre-commit follow-up (phone layout, storage shed, console/network capture, the shore-spawn bug, full rerun, budgets) is in §6. Sections 2, 4 and 5 below are updated where §6 changed them.

## 1. Owner requirements: status and evidence

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Shared resource reservation (option A), cancellation and release | Done | `sim/reservation.ts` (new shared ledger); settlement `reservedOf / reservations / freeInStore / reserveSites` now call it (`sim/homestead.ts`); wilderness ledger in `sim/wild-build.ts`. Tests: `w4.reserve.test.ts` 1–4, `w4.build.test.ts` 4 |
| 2 | Campfire warmth claim dropped | Done | `warmthAt` / `WARMTH_RADIUS` removed; catalogue summary, fire panel and header no longer mention warmth; a locked cabin's "warm" text removed. Test: `w4.ui.test.ts` 1 and 5 assert no `/warm/i` |
| 3 | Knife honest | Done | Recipe `note`: "A tool for later: it has no use yet. Butchering arrives with hunting (W8)."; workbench summary says "stone knife (no use yet)". Pickaxe note says mining arrives with W6. Test `w4.ui.test.ts` 5; browser `w4-l-workbench-knife-honest.png` |
| – | Player enclosure (doorways, escape routes, orientations) | Done | `checkWildSite`: footprint may not overlap the character body; `trapsPlayer` flood fill. Tests `w4.reserve.test.ts` 5–6 |
| – | Construction integrity | Done | `validateBuild` checks the construction history. Test `w4.reserve.test.ts` 7 |
| – | Respawn integrity | Done | `died` + `respawn` commands. Test `w4.reserve.test.ts` 8, `w4.build.test.ts` 6 |
| – | One allow-list, no bypass | Done | `WILDERNESS_COMMANDS` holds every W4 command; `wildernessAllowsCommand` replaces the bypass in `session.ts`. Test `w4.reserve.test.ts` 9 |
| – | One construction architecture | Done (partly shared) | Shared: the reservation ledger, the footprint geometry (`homestead.ts siteSize/siteCells/siteEntrance` now call `placement.ts`), the placement core and the build-mode ghost. Still separate (by design, documented): the settlement's villager-built `BuildSite` lifecycle and the player-built `WildSite` lifecycle, and the two catalogues |
| – | Tests for preview, rotation, placement UI, reservations, cancellation, history, respawn, authorization | Done | 16 new tests (see §2) |
| – | Rendering budgets | Done | `SCENE_BUDGET` (120 calls / 250k triangles), `BUILDINGS_BUDGET` (2 meshes, 300 triangles a building, 9,600 for 32); `__metrics.sceneBudget` in the browser. Tests `w4.ui.test.ts` 6–7 |
| – | Desktop and physical-phone walkthroughs | Desktop and phone **emulated** done; physical phone **NOT DONE** | §4 |

### How the reservation model works (item 1)
- Placing a site reserves the **whole** material list, or the placement is refused with code `unfunded` and a reason naming what is missing. No underfunded site can exist.
- Sources, in order: the bag (`bag`), dropped piles within 24 m of the footprint (`d:N`, nearest first), finished storage within 24 m (`b:N`, nearest first).
- Reserved items stay where they are. They keep their id, count and location. A site holds `reserved: { source: { item: n } }`, `delivered`, `consumed`.
- **Free = held − reserved.** Crafting, eating, fuel, cooking, dropping (including logs dropped at a stockpile), storing, plain pickups from a pile, plain withdrawals from storage and other sites see only free units.
- Reserved units move only on purpose. They keep their reservation when they move:
  - a pickup or a withdrawal `forSite` moves them into the bag;
  - a death moves the bag's reserved items into the piles dropped where the character died.
- **Delivery** (`deliver_site`, optional `from`) works from the bag, or from a pile or storage within 3.5 m of the site. Anything further away is carried first.
- **Consumption.** A stage's work needs that stage's materials delivered. When the stage completes, they move to `consumed`. The invariant reserved + delivered + consumed = catalogue materials holds at every step.
- **Cancel** releases the reservations, so nothing moves. Delivered but unconsumed materials are put down as piles at the door. Consumed materials are gone.
- Unbacked reservations cannot arise from player actions in W4:
  - drop and store are refused for reserved units;
  - storage cannot be destroyed;
  - piles that merge only grow.
- Snapshot validation also rejects any reservation larger than its source holds.

### Enclosure
- **Covering the player.** A footprint that overlaps the character's body (radius 0.3 m) is refused with code `traps_player` and the reason "you are standing where it would go". Tested for every early building, every rotation and every footprint position over the player.
- **Shutting the player in.** `trapsPlayer` flood-fills the 64×64 local walking grid from the player, with the footprint solid.
  - The player must still reach the edge of the grid.
  - Where terrain already closes the player in, nothing the player could reach before may be cut off.
  - Tested on walls with a gap, in all four orientations, plus a pocket already closed by terrain.
- **Entrance.** The existing check that the entrance can be reached from the player is kept.

### Construction history (snapshot)
A site in a snapshot is rejected unless all of these hold:
- consumed = the materials of the stages before the current one;
- reserved + delivered + consumed = the building's materials;
- a stage with work in it has its materials delivered;
- a finished building has consumed exactly its materials and holds nothing reserved or delivered;
- the swings done fit the ticks since placing (at most 4 a tick);
- every reservation source exists and holds enough.

The audit's probe 3 (a lean-to marked finished with nothing delivered) is now refused.

### Respawn
- **`died {cause:'drowned', at}`** is journaled when the character dies.
  - It is accepted only inside the world, at or beside a dry cell, with water within 6 m, and with no death already pending.
  - It drops all carried items as piles there; reservations follow them.
  - Tools stay. Hunger is unchanged.
- While a death is pending, everything except `respawn` (and ticks) is refused with code `dead`.
- **`respawn {to}`** needs a recorded death.
  - `to` = the claimed home lean-to. It must be claimed (`not_claimed`), a shelter (`no_shelter`), finished (`shelter_unfinished`), and its door step dry and free of buildings (`shelter_damaged`).
  - `to` = `'spawn'` wakes the character at the spawn banner's spot.
  - The outcome records the exact landing point (dm), and the client lands exactly there.
- **Client handling.**
  - A refused lean-to respawn is followed by a journaled `respawn` to the spawn, with a toast giving the reason.
  - A refused `died` is shown in a toast. The character then wakes at its last dry spot and keeps its items.
  - A page reloaded during a pending death journals the respawn when the page starts.
- The audit's probe 2 (a respawn 424 m away with no death) is now refused with `no_death`.

## 2. Tests

- `npx tsc --noEmit`: clean.
- `npm test`: **478 tests, 478 pass, 0 fail**, 209 s (follow-up run, `.tools/scratch/w4-finish/full.log`). It was 470 in the first W4 pass (`.tools/scratch/w4-run/full2.log`) and 454 before W4.
- `npm run build`: OK, bundle `assets/index-BbO2sg6-.js`, `assets/index-CFrphe5m.css`.
- Follow-up tests (8): `tests/w4.shed.test.ts` (2) and `tests/w4.spawn.test.ts` (6), see §6.
- New (16):
  - `tests/w4.reserve.test.ts` (9): shared ledger; two projects never share materials; piles as sources, `forSite`, delivery from within reach, reservations through a death; storage as a source and cancel releasing everything; never covering the player (all early kinds and rotations); never shutting the player in (4 orientations and a terrain pocket); construction-history tampering (6 forms); respawn validation (no death, implausible spots, already dead, actions while dead, unclaimed, not a shelter, missing, damaged, unfinished, spawn fallback, journal disagreement, pending death in snapshot); one allow-list (set equality, no catalogue id equals a settlement site kind, settlement-shaped commands refused, removing an entry from the list refuses the command, forged journal refused).
  - `tests/w4.ui.test.ts` (7): menu honesty, ghost verdict = `checkWildSite`, bar funding text, place via the bar; rotation (sides swap, door moves, 4 positions, X key, Esc); refused placement over the player; site panel (reserved by source, Deliver buttons, two-press cancel, piles); honest building panels (no warmth, knife note, the bench counts only free stones); render budget per model, stage and rotation; 32-building view budget with flames only where there is fuel. This file runs against a minimal DOM stand-in, not a browser.
  - `tests/w4-harness.ts`: shared helpers (not a test file).
- **Changed existing test**: only `tests/w4.build.test.ts`, which is W4's own, unreleased and uncommitted.
  - Placing now reserves the whole building. The tests that placed with an empty bag now fund the site first (`fund`).
  - The assertion "placing reserves and takes nothing" now asserts exactly what is reserved and that nothing moves.
  - Death uses `died`/`respawn`. With no lean-to, the respawn point is now the spawn banner rather than the last dry spot.
  - The reachable-entrance check moved before the first placement, so the bag still holds the campfire's materials.
  - `no_tool` is reached by removing the axe from the state directly, because an axe cannot be dropped. The comment in the test says so.
  - Every other assertion is unchanged. No settlement or W1–W3 test file was edited in this pass. The pre-existing W4 edits to `w2`/`w3` tests are as the audit describes.
- Fixes found by the tests or the runs:
  - the ghost verdict did not refresh when the bag changed;
  - a death spot reported just over the waterline was refused;
  - the phone's Place button was rebuilt every tick, so a tap could be lost.

## 3. Compatibility

- Settlement genesis `e659504b056654dc`, rule pins v1–v8 and the v6/v7 fixtures all pass unchanged in their suites. This covers M012, M014 and every STAB-002 suite inside the 470.
- The reservation refactor and the footprint refactor changed no settlement hash.
- Wilderness v2 genesis `3c3a0c8e4090efcf`, v3 genesis `158e989e4c10cf13` and v4 genesis `6d50f19f01f39eec` are unchanged. An empty v4 build block serialises as before.
- The W1, W2 and W3 fixtures load byte-identical, replay, upgrade to v4 and then place a funded site, save, reload and replay (`w4.build.test.ts` 10–12).
- The v4 site format changed: `reserved` and `consumed` were added, and `death` is optional. The respawn command shape also changed. W4 is unreleased, so no v4 save exists outside tests.

## 4. Browser (emulated; local build served at https://astrix.local/; Chromium with software GL)

**Desktop 1200×700, fresh world `w1` (seed 1337, generator 2, content 4).**
- **Gathering and axe.** Gathered branch, stone and fibre, crafted a stone axe in the Bag and equipped it.
- **Felling and carrying.** Felled a mature oak in 10 swings (one log trunk, 3 logs) and cut it in 6 swings. Carried 2 logs, bag 28/30, and dropped them by the planned camp.
- **Build menu.** The menu listed every entry with free-to-reserve counts.
- **Invalid spot** (`w4-c-invalid-spot.png`). Three red reasons: too far (81 m), too steep (2 m), and "not enough free materials to reserve: 2 log more needed". The log piles were more than 24 m from that spot.
- **Spot over the player** (`w4-d-over-player-refused.png`). Red: "you are standing where it would go". Pressing Enter gave the toast "Cannot build here: …", `refusedPlacements` 1 and 0 sites.
- **Lean-to placed** at (−62, −180), about 20 m from spawn. Reserved: 6 branch and 2 cord in the bag, 1 log in each of two piles.
- **Reservation refusal** (`w4-f-reserved-craft-refused.png`). The Bag showed "branch ×8 (6 reserved for a site)" and "cord ×2 (2 reserved for a site)". Crafting the cord-bound axe was refused: "2 of your 2 cord are reserved for your lean-to shelter site …". No tool was made.
- **Delivery.** One E press at the door delivered 10 items, including both logs straight from the piles within reach.
- **Stages.** Stage 1 consumed branch 2. Stage 2 consumed log 2.
- **Reload mid-construction** (frozen time):
  - Two reloads both restored `82c9f263c671d942`, equal to the saved record's last entry, with the site at stage 2 and consumed {branch 2, log 2}.
  - The first comparison, against a record read before the reload, did not match, because the page saved again on unload. That comparison is not evidence.
- **Lean-to finished.** consumed {branch 6, cord 2, log 2}. Claimed as home (`w4-j-leanto-claimed.png`).
- **Campfire.** Placed and built with 6 stone and 3 branch reserved from the bag. Fuelled with a branch (fuel 1:00). Cooked a mushroom. Eating the cooked mushroom took hunger from 100 to 76 (`w4-k-campfire-lit-cooked.png`).
- **Workbench.** Built with 1 log and 2 stone from the bag and 1 log from each of two piles. Crafted planks (2) and a stone pickaxe. The panel shows the knife and pickaxe notes (`w4-l-…`).
- **Log store.**
  - It reserved two pile logs, one of them further than 3.5 m from the site. E on that pile picked it up "reserved for your log store" and it was delivered.
  - The first attempt took a branch instead and then hit the bag limit. The run was repeated after unloading.
  - Storing 1 log recorded `ITEMS_STORED` and `LOGS_DELIVERED` (`w4-m-…`).
- **Cancel** (`w4-n-…`). A campfire site with 6 stones delivered was cancelled with two presses. One stone pile ×6 lay at the site, the reservation of 3 branches was released, and reserved went to {}.
- **Drowning, first attempt.** The death was **refused** ("the last dry spot must be on dry ground"), and the game showed that toast instead of hiding it. The cause was a death spot rounded just over the waterline. After the fix and a rebuild, a second drowning was recorded: death at (−1710, −2172) dm, 3 branches dropped in 1 pile, toast shown.
- **Respawn** (`w4-q-…`). The character respawned at the lean-to. The outcome `{point: b:9, x: −605, z: −1775}` matched the landing (−60.5, −177.5) exactly, with toast "You wake at your lean-to", the bag empty and tools kept. The death pile was not inspected in the browser; the simulation tests cover it.
- **Performance** (`renderer.info`):
  - at spawn: 51 calls, 137,690 triangles;
  - by the camp with 4 buildings drawn: 60 calls, 173,034–173,078 triangles; the buildings themselves were 564 triangles in 2 meshes;
  - both within budget (`sceneBudget.ok` true). The camp screenshot (`w4-p-…`) mostly shows trees; the buildings were in the drawn set but not prominent in that frame.

**Phone, emulated** 390×844, touch, DPR 2, quality "low"; movement by synthetic keys, UI by taps.
- **Placing.** Tapped Build, chose Campfire, then tapped Place.
  - The first attempt timed out because the bar was rebuilt every tick. After the fix, the Place button stayed the same element for 4.5 s and the tap placed the site with {bag: branch 3, stone 6}.
- **Building.** Tapping the round Use button ("Deliver", then "Build") delivered the materials and finished the campfire in 4 taps after delivery. It consumed {branch 3, stone 6}.
- **Performance**: 37 calls / 82,778 triangles at spawn; 40 calls / 104,140 triangles at the finished campfire.
- **Layout** (bounding boxes in CSS px):
  - The build bar [10, 56, 380, 256] covers the HUD text box [12, 124, 191, 236]. The bar sits on top and the HUD text shows faintly through it (`w4-s-…`).
  - The site panel [150, 128, 376, 398] overlaps the HUD's right edge and the "Builder view" button (`w4-t-…`). **Not fixed.**
  - Use [294, 664, 356, 726] and Jump [286, 740, 366, 820] do not overlap each other or the panels.
  - The ghost was not visible in the phone screenshot; only its verdict was checked.

**Not measured or not done (first pass; see §6 for the follow-up):**
- page errors were not captured in the first pass (§6.3 captures them in every follow-up run);
- frame times;
- the Home override in explore (used once by pressing R, not asserted);
- the phone death and respawn flow.

**Finding outside W4's own code.** After the refused death, the character's saved avatar was at a shore spot with y = 0. The page then never spawned the character (`findStandingY` returned null). The run continued by rewriting the client-local avatar save to the lean-to door. Root cause and fix: §6.4.

## 5. Acceptance gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | Pass (clean) |
| `npm test` | Pass: 478 tests, 478 pass, 0 fail |
| `npm run build` | Pass (`index-BbO2sg6-.js`) |
| Settlement genesis `e659504b056654dc`, rules v1–v8, v6/v7 fixtures | Pass (tests 131, 279, 311–312, 378, 392, 410–419 and the rest of the suite) |
| W1/W2/W3 fixtures load, replay, upgrade | Pass (tests 441–442, 452–454) |
| Wilderness v2/v3/v4 genesis pins | Pass (test 444) |
| Reservations, enclosure, construction history, respawn validation, one allow-list | Pass (tests 455–463) |
| Storage shed built, real storage, capacity 300, reservations, persistence | Pass in tests (464–465); built, stocked, withdrawn and reloaded in the browser (§6.2) |
| Shore-spawn / saved-avatar bug fixed with regression tests | Pass (tests 466–471; browser §6.4) |
| Phone/tablet layout: no panel overlaps a control or another panel, tap targets ≥ 40 px | Pass, emulated, 4 touch viewports × 4 states (§6.1) |
| Browser console errors/warnings, page errors, failed requests, HTTP ≥ 400 | None recorded in the captured runs (§6.3) |
| Render budget tests (per model, 32 buildings) | Pass (tests 477–478) |
| Scene budget 120 calls / 250k triangles at spawn and at the camp with the shed | Pass, desktop 1000×600 and phone 390×844 (§6.5) |
| Desktop and phone emulated walkthroughs | Done (emulated only) |
| **Physical-phone walkthrough** | **NOT DONE, requires owner** |
| Commit hygiene (`tests/.build`, `Game/dist` regenerated and dirty) | Open, not addressed (audit §4.6) |

**Still open:**
- **Physical-phone walkthrough: NOT DONE, requires owner.**
- Settlement and wilderness keep separate site lifecycles and catalogues. They share the reservation ledger, footprint geometry, placement core and ghost.
- Commit hygiene (audit §4.6): `tests/.build` and `Game/dist` are regenerated and dirty in the working tree.
- In the browser the shed's reservation interplay was not exercised (no free stones were left near the camp); it is covered by test 465.
- The first-pass desktop and drowning runs in §4 had no console capture.

**W4 status: candidate, not accepted.**

## 6. Pre-commit follow-up (owner items 1–6)

Browser setup for every run in this section: local production build copied to `.kiro/artifacts/screenshots/probe/dist`, served at `https://astrix.local/`, Chromium with software GL; localStorage seeded with `astrix:entered:v1`, `astrix:worlds:v1` (`w1`, seed 1337, generator 2, spawn −82, −172) and `astrix:world:active:v1 = w1`. Touch viewports use `hasTouch`, `isMobile`, DPR 2 (tablet 1.5). The camp save used for layout and the shed (`w4f-gen-camp.ts.txt`) is built by journaled commands only, outside the repo: a finished workbench and log store, a hammer, 6 planks and a wooden chest lying by the camp, 2 logs piled, 4 stones in the bag and an unfinished campfire site. The shed itself is placed and built in the browser.

### 6.1 Phone construction-panel overlap (item 1): fixed

Measured with element rectangles (`getBoundingClientRect`) in four states: near a site (site panel), Build menu open, placement bar open (lean-to chosen), Bag open. Controls checked: `#hud`, `#mode-button` (Builder view), Farm / Settings / Bag / Build buttons, `#vitals`, every `#controls .pb` (Use, Jump, Home, To banner, Plant, zoom), the joystick ring (`#move-zone::after`), `#wild-events`; panels: `#wild-site-panel`, `#build-bar`, `#wild-build-panel`, `#wild-panel`. Overlap = intersection area in CSS px².

**Before** (W4 CSS as in §4):

| Viewport | State | Overlaps (px²) |
|---|---|---|
| 390×844 | site | site panel [150,128,376,374] ∩ HUD 5,084; ∩ Builder view 1,536 |
| 390×844 | menu | menu [14,128,354,594] ∩ HUD 21,948; Builder view 1,184; Home 2,000; To banner 2,000; Plant 2,000; zoom + 1,224; event feed 7,072 |
| 390×844 | bar | bar [10,56,380,300] ∩ HUD 22,912; Build button 2,816; Bag button 2,816; event feed 8,568 |
| 390×844 | bag | bag [14,128,334,594] ∩ HUD 21,948; Builder view 864; Home / To banner / Plant 1,200 each; zoom + 504 |
| 360×780 | site | site panel ∩ HUD 5,740; Builder view 1,536; Home 2,304 |
| 360×780 | menu / bar / bag | menu ∩ HUD 22,960 (+ Builder view, Home, To banner, Plant, zoom, feed); bar ∩ HUD 23,904, Build 2,816, Bag 2,816; bag ∩ HUD 22,960 (+ 5 controls) |
| 844×390 | site | site panel [530,150,830,388] ∩ Use 3,844; Jump 6,400; Home 2,048; To banner 2,560; Plant 2,560; zoom − 1,600 |
| 844×390 | menu / bar / bag | menu ∩ HUD 27,200, feed 10,138; bar [142,8,702,183] ∩ HUD 14,750, Build 2,816, Bag 352, feed 549; bag ∩ HUD 25,600 |
| 1365×709 | menu / bag | menu ∩ HUD 27,200, feed 10,138; bag ∩ HUD 25,600 (site and bar: none) |
| all four | all | Bag button ∩ Settings button 1,848 (the Settings button was hidden under Bag); HUD ∩ event feed 9,864 on 844 and 1365 wide; sheet close buttons 32×40 px |
| 1000×600 desktop | menu | menu ∩ HUD 59,160 |

**After** (final build): **0 overlaps** (panel–control, panel–panel and control–control) in every state on 390×844, 360×780, 844×390 and 1365×709, and on desktop 1000×600; **0 touch tap targets under 40 px** (desktop has smaller mouse buttons, not counted); no panel clipped by the viewport. Panel rectangles after:

| Viewport | site panel | menu | bar | bag |
|---|---|---|---|---|
| 390×844 | [8,260,278,490] | [8,260,278,674] | [8,128,382,372] | [8,260,278,674] |
| 360×780 | [8,276,248,522] | [8,276,248,610] | [8,128,352,362] | [8,276,248,610] |
| 844×390 | [400,82,660,320] | [400,82,660,382] | [276,8,660,187] | [400,82,660,382] |
| 1365×709 | [1051,150,1351,388] | [14,212,354,539] | [403,8,963,183] | [14,212,334,539] |
| 1000×600 | [686,150,986,365] | [646,150,986,576] | [200,124,800,301] | [666,150,986,576] |

Joystick ring: [34,698,146,810] (390×844), [34,634,146,746] (360×780), [34,244,146,356] (844×390), [34,563,146,675] (1365×709).

How (all in `src/styles.css` under `body.wilderness`, plus 14 lines in `app/wild-game.ts`):
- `wild-game.ts` publishes `--hud-bottom` (where the HUD text ends, read every 12 frames; 0 when the HUD is not at the top). Phone sheets start at `max(128px, --hud-bottom + 8px)`, are `100vw − 120px` wide (left of the right-hand column) and end 170 px above the bottom (above the joystick ring).
- Phone portrait: Builder view moves to top 128 px. While placing on a touch screen, the HUD text and event feed step aside and the build bar takes the top (the bar replaces the HUD, as the Builder view button already did).
- Phone landscape: sheets in the middle column between the HUD text and the right-hand column; the bar starts right of the Build button.
- Tablet landscape: bag and menu start below the HUD text. Desktop: bag and menu open on the right; the bar starts below the button row.
- Top row: Bag and Build move right so the Settings button is no longer under Bag. Sheet close buttons are 40×40 on touch. The event feed hides while any sheet is open.
- Screenshots: `w4f-phone390-before-{site,menu,bar}.png`, `w4f-land-before-site.png`, `w4f-*-final-*.png`.

### 6.2 Storage shed (item 2): built and tested

The shed's prerequisites are all W4: a finished workbench and a hammer; materials stone 4, log 2, plank 6, wooden chest 1 (planks are split from logs at the bench, the chest is 4 planks + 1 cord with the hammer). No W6 material is involved, so nothing was unlocked dishonestly. It was already `implemented: true`; no catalogue change.

Tests (`tests/w4.shed.test.ts`, journaled commands only):
- 464: locked before ("needs a finished workbench; needs a hammer"), `place_site` refused `locked`; still locked with the bench alone; unlocked with bench + hammer. Ten planks from five logs, a chest from four. Placing reserves exactly {chest 1, log 2, plank 6, stone 4}: stone 4 from the bag, planks, chest and logs in their piles. Delivered, 12 hammer swings (hammer durability −12), consumed = materials, stock {}, snapshot validates.
- 465: store 5 stones, take 2, refused `missing` (take 4 of 3), refused `out_of_reach`; filled with stones and branches to **exactly 300/300**; one more stone refused `full` ("storage shed is full (300/300)"); withdrawal refused `capacity` when the bag is full. A campfire placed beside it reserves its 6 stones **in the shed**; free stones are taken out until only the 6 reserved remain; a plain withdrawal is then refused `reserved` and changes no hash; `take_items forSite` moves one reserved stone to the bag, still reserved (it cannot be stored back or dropped: `reserved`); reserving moves nothing (branches stay). Replay from genesis, snapshot restore and a `BrowserSaveStore` reload give the same hash, stock and reservations; the refusal holds after reload. A snapshot with stock weight 302 is rejected (`stock weight`).

Browser (desktop 1000×600, final-but-one build; later builds changed CSS only):
- The Build menu entry read "Storage shed 3×3 m · 12 swings, hammer · wooden chest 1/1 · log 2/2 · plank 6/6 · stone 4/4" and was unlocked.
- Placed with the ghost at (−92, −177), rot 0 (`w4f-desk-shed-ghost.png`). Toast: "Storage shed marked out. Reserved for it: 4 stone in your bag; 1 wooden chest in a pile; 2 plank in a pile; 2 plank in a pile; 2 plank in a pile; 2 log in a pile."
- Delivered by E: stones from the bag; chest and 4 planks picked up "reserved for your storage shed" (bag 29/30), then 2 planks and the logs in two more trips. Built with E; toast "Storage shed finished! A plank shed with a chest: holds 300 weight of items." consumed {chest 1, log 2, plank 6, stone 4}, stock {} (`w4f-desk-shed-built.png`).
- Shed panel: stored branch 3, berries 2, grass 2 ("holds 8/300 weight"), took 1 branch: stock {berries 2, branch 2, grass 2}, bag {branch 1} (`w4f-desk-shed-stock.png`).
- Reload: the shed is `done` with stock {berries 2, branch 2, grass 2}, bag {branch 1}, panel "holds 8/300 weight". (The hash differs after the reload because world ticks run in real time; it is not used as evidence.)
- Not done in the browser: the reservation interplay (no free stones near the camp) and filling to 300; both are in test 465.

### 6.3 Console errors and failed requests (item 3)

Captured with `page.on('console')` (error and warning), `page.on('pageerror')`, `page.on('requestfailed')` and responses with status ≥ 400, per page.

| Run | console error/warning | page errors | failed requests | HTTP ≥ 400 |
|---|---|---|---|---|
| Desktop 1000×600 fresh world, spawn budget | none | none | none | none |
| Desktop: shed placed, delivered, built, stocked, reload | none | none | none | none |
| Desktop: drowning off the shore, reload, spawn (final build) | none | none | none | none |
| Desktop camp budget | none | none | none | none |
| Phone 390×844: layout before/after, camp budget, spawn budget | none | none | none | none |
| Phone 360×780, landscape 844×390, tablet 1365×709: layout before/after | none | none | none | none |

Not captured: the first desktop drowning and reload runs of §6.4 and the first phone page load (the listeners wrote into an object a later tool call could not read), so nothing is claimed for them; the run was repeated with capture on the final build (row 3).

### 6.4 The drowning / refused-spawn bug (item 4): root cause found and fixed

**Reproduced from a clean start.** Node (test 466): from the shore at (−170.5, −215.5) with the real movement rules, three walks into the lake (dive held) drown; each records `safe` at y = 0, e.g. (−171.21, 0, −216.21). Browser (fresh world, walking and diving with keys): the saved avatars were (−171.22, 0, −216.52), (−171.60, 0, −216.25) and (−168.25, 0, −218.21). For all of them `findStandingY` returns null; the centre cell is water (depth 1).

**Root cause.** The movement rules let the 0.3 m-radius box rest on the dry cell beside a water cell, and record that spot as dry footing (`safe`; `depth === 0`, grounded). `findStandingY` looks only under the character's centre: there it finds water at y −1, then solid ground inside terrain, and returns null. The page's `trySpawn` waited for a non-null height for ever, so a page reloaded with that avatar never spawned the character. Saves come from `persist`, which writes `safe` while the character is dead or under water, and from the no-death respawn (`respawnCharacter` falls back to `safe.y` when `findStandingY` is null). A pending death after such a reload was also never woken from, because the wake needs a spawned character. The refused `died` in §4 was the same rounding at the shore edge (fixed in the first pass).

**Fix** (player-local; no simulation rule or hash changes):
- `sim/character.ts`: `standProblemAt` (can the box stand here: resident, no water in any feet/head cell, clear of voxels and structures, resting on solid under any of its columns, clear of buildings, trees, rocks, trunks; else why) and `standingSpotNear` (the asked spot first, then cell middles within a radius, nearest first, deterministic; `pending` while terrain is not resident). `canStandAt`, `findStandingY` and `respawnCharacter` are unchanged.
- `app/avatar-spawn.ts` (new, no three.js): `planAvatarSpawn` keeps the saved spot when standable, else the ground in the same column, else the nearest standable spot within 6 m, else the spawn banner; every move carries a note. `planLanding` lands exactly at a recorded respawn point; only if it cannot be stood on does it move and say so (`exact: false`).
- `app/explore.ts`: `trySpawn`, the death-screen respawn and `wakeAt` use these; moves are shown once as a notice and recorded in `__metrics.explore.placement`.

**Regression tests** (`tests/w4.spawn.test.ts`): 466 the clean-start repro (old lookup null; now exact); 467 the refused-death path (a refused `died` changes no hash, the client wakes at the y = 0 spot, a replayed session spawns there, the accepted `died` + `respawn` lands exactly at the outcome); 468 a saved height that is not ground (−6 m, +25 m, −15) lands on the ground in the same column with a note; 469 inside water (2 m deep: nearest dry ground ≤ 6 m; far out in the lake: the spawn banner with a note); 470 inside a finished workbench (lands outside, no building hit) and non-resident terrain (`pending`, nothing invented); 471 settlement.

**Settlement.** Affected: it uses the same `trySpawn`. Test 471: genesis `e659504b056654dc`, rules v8 homestead; a shore-edge spot near the farm where `findStandingY` is null spawns exactly; a spot inside the farmhouse lands outside it; the settlement hash is unchanged by planning.

**Browser after the fix** (final build, desktop): drowned off the shore; the saved avatar was (−168.25, 0, −218.21); after a reload the character spawned there in the first 250 ms sample (`placement: load, source saved, moved 0`). In an earlier run reloaded during the death screen (saved avatar (−171.60, 0, −216.25), death pending), the page spawned and journaled the respawn, landing exactly at the recorded spawn point (−81.5, −171.5), toast "You have no claimed lean-to. You wake at the spawn banner."

### 6.5 Rendering budgets (item 6)

Tests 477 (every model, stage and rotation) and 478 (32 buildings, 8 fires: 2 meshes) pass. Browser `renderer.info` via `__metrics.sceneBudget`, limits 120 calls / 250,000 triangles:

| Where | Desktop 1000×600 (quality high) | Phone 390×844 (quality low) |
|---|---|---|
| Spawn, fresh world (4 samples) | 53–54 calls, 141,004–149,876 triangles | 37–38 calls, 86,714–91,382 triangles |
| Camp at the finished shed (workbench, log store, campfire, storage shed drawn: 4 buildings, 588 triangles in 2 meshes) | 58 calls, 147,824 triangles | 39–40 calls, 80,374–85,462 triangles |

`sceneBudget.ok` was true in every sample.

### 6.6 Files changed in the follow-up (uncommitted)
- `Game/src/sim/character.ts`: `entityBlocks` split out of `canStandAt` (same behaviour), `standProblemAt`, `standingSpotNear`.
- `Game/src/app/avatar-spawn.ts` (new), `Game/src/app/explore.ts` (spawn, respawn, wake, metrics).
- `Game/src/app/wild-game.ts` (`--hud-bottom`), `Game/src/styles.css` (touch and desktop layout).
- `Game/tests/w4.shed.test.ts`, `Game/tests/w4.spawn.test.ts` (new). No existing test was changed.
- Evidence: `w4f-*.png`, `w4f-gen-camp.ts.txt` in this folder.

Nothing was committed, staged, pushed or deployed. The backup `.tools/backups/w4-20261126/`, `05_Noxel_Studio/Asset_Sheets/2026-11-24_animals/Animals` and `W1-wilderness-scenario/live-entry.png` were not touched (content hashes identical before and after).

## Candidate test deployment (not acceptance)

**Status:** W4 is a **CANDIDATE, not accepted**. It is waiting for the owner's physical-phone walkthrough. W5 stays blocked and PR #1 stays unmerged.

**Commit:** `c01c7747a05d7188dd642b20deb224b598506cdc` on `deploy/boxd`. After the push, a fresh fetch and the GitHub branches API both showed it on the remote before any deploy was started.

**First deploy attempt failed.** Release `20261126T093823Z-c01c774` built and passed 478/478 tests, but the upload failed with `mkdir: cannot create directory '/var/www/astrix/releases/...': Read-only file system`.
- The server's kernel log showed write I/O errors on `vda`, and ext4 had remounted read-only (`emergency_ro`).
- The live site kept serving W3 (`20261126T033631Z-86865c8`) the whole time.
- With the owner's approval, the machine was rebooted (`boxd machine reboot astrix`). Afterwards `/` was mounted `rw` and was writable with sudo, and nginx was active.

**Second deploy succeeded.** Each fact below was checked after the deploy returned:
- **Deploy script:** exit 0. Tests ran inside the deploy and gave 478 tests, 478 pass, 0 fail.
- **Release:** `20261126T095429Z-c01c774`. On the server, `/var/www/astrix/current` resolves to that release.
- **Bundle:** the served `index.html` loads `assets/index-Do3STZWm.js`. Its build stamp is `commit:"c01c774", dirty:false`.

**Live check** (fresh headless Chromium, software GL, 1000x600, wilderness world seeded in storage, 45 s):
- **World state:** title "ASTrix — Wilderness", wilderness content **4**. `build` and `felling` state are present, and the Bag and Build buttons are shown.
- **Render cost:** 54 draw calls and 151,720 triangles.
- **Errors:** 0 page errors, 0 failed requests and 0 HTTP ≥ 400 responses. There were 4 console warnings, all the software-GL driver notice "GPU stall due to ReadPixels".
- **Not tested live:** the build loop itself. It was verified on the local build of the same commit (§§ above). No real phone has been used.

**Local `Game/dist` mismatch:** the committed `Game/dist` in `c01c774` carries an older build stamp (`86865c8`, dirty). The deploy rebuilds from source, so the served bundle is the `c01c774` build. The local rebuilt `Game/dist` is left uncommitted, so the candidate commit stays exactly as reviewed.

## Owner phone report 1: stuck campfire and bag capacity

**Report (live candidate `20261126T095429Z-c01c774`):** the campfire site panel showed "Stage 2/2: Kindling stack · 2/4 swings · branch 0/3 (reserved: 1 in a pile, 1 in a pile, 1 in a pile) · stone 6/6". The owner had more than 6 branches but could not finish. Second message: "Increase the bag storage."

**Cause** (reproduced headless on the c01c774 code; the v4 fixture below is that state):
- Placement already reserves the bag first, then piles nearest the site. But the owner's bag held no free branches when the campfire was placed. The Bag panel only offers "Drop 1", so branches dropped to make room in the 30-weight bag lie as one-branch piles. The 3 nearest ones (7.5, 12.3 and 12.5 m from the site) were reserved.
- Delivery takes only the reserved units, from the bag or from a pile within 3.5 m of the site. The 8 branches picked up later were free, so they could not be delivered (`not_reserved`). Nothing could replace the reservations.
- Picking a reserved pile up for the site was refused because the bag was full: 29/30 with the axe, a log and 8 branches, and a branch weighs 2 (`capacity`, "your bag is full").
- The panel said only "in a pile", with no location. The pickup prompt did not say the pile was reserved for the campfire.

**Fix (wilderness content v5):**
- **Bag capacity 60** (was 30). The early loop fits: axe 3 + 2 logs 18 + 6 stones 12 + 6 branches 12 + 4 fibre 4 = 49. Logs stay heavy: with the axe, at most 6 logs (57). Weights are unchanged.
  - The Bag panel shows a weight bar, "weight used/60", "Carries 60 weight, N free", the weight of each item kind, and each row's own weight (e.g. "branch ×6 · 2 each · 12"). Tools show their weight.
- **Deliver from the bag in place of remote reservations.** `deliver_site` with `swap: true`, from the bag only. Free units of the same item stand in for the site's reservations elsewhere, and those reservations are released where the items lie, farthest from the site first.
  - The swap is explicit and journaled: the outcome's `swapped` lists the released units per source (e.g. `{"d:10":1,"d:8":1,"d:9":1}`). A swap outcome without the command flag fails journal validation.
  - Units reserved for another site are never used. Nothing moves except the delivered units, which go from the bag to the site. The released piles stay where they are, whole and free.
  - The site panel and E/Deliver offer the swap automatically when the bag holds enough free units.
- **The site panel says where each reserved unit is:** "1 in your bag", or "1 in a pile 13 m north of you" (or "at the site" when it is in delivery reach).
  - Standing by a reserved pile away from the site shows that site's panel with "You are by 1 branch reserved for this campfire" and **Pick up for this site**, plus "The site is 8 m west of you". Work and Cancel are hidden there.
  - A help line says what to do: walk to each pile, or bring free branches.
- **The HUD pickup prompt for a reserved pile** reads "pick up 1 branch reserved for your campfire · carried for that site". A partly reserved pile reads "pick up N free branch (M more reserved for your campfire)".
- **Owner rules kept:**
  - Reserved items are still refused to crafting, other sites, dropping and plain pickups.
  - Cancel still releases everything, and consumption still happens only by stage work.
  - Placement still refuses an underfunded site.
  - The snapshot check that reserved + delivered + consumed = the building's materials is unchanged and holds after every swap.

**Versioning:**
- v5 is the latest content, and new worlds start at v5. v5 genesis `9ddf941c10692096`; the v4 genesis pin `6d50f19f01f39eec` is unchanged.
- On load, a v1-v4 world receives one journaled `upgrade_wilderness {content: 5}`. Its earlier journal replays under its own rules: capacity 30, no swap.
- `swap` in a v4 world is refused (`not_supported`). A v4 snapshot carrying more than 30 weight is refused, and a v5 snapshot carrying more than 60.
- Settlement genesis `e659504b056654dc`, v1..v8 and the v6/v7 fixtures are unchanged (all their tests pass).

**v4 fixture:** `Game/tests/fixtures/w4-wilderness-save.json`, made by the c01c774 code in a temporary worktree under `.tools/scratch/` (removed afterwards; the generator is kept at `.tools/scratch/w4-stuck/fixture-gen.c01c774.ts`).
- It holds the owner's state: campfire `b:12` with its ring built, branches reserved in `d:8`, `d:9`, `d:10` (1 each, 7.5-12.5 m away), 8 free branches and a log in a 29/30 bag. It has a short form (59 journal entries) and a compacted long form, hash `556848062811a0e3`.
- `Game/tests/w4.owner-report1.test.ts` (10 tests) checks:
  - Both forms load, are byte-identical and replay (short).
  - Under v4 the site is still stuck: `not_reserved`, `source_out_of_reach`, `not_supported`, and `capacity` 29/30, with no state change.
  - After the upgrade it is finished in two ways: the swap delivery, or picking the 3 piles up for the site (bag 35/60).
  - Saved, reloaded and replayed.
  - The swap rules, the 60 capacity and the snapshot weight checks.
  - The site panel against a DOM stand-in.
  - W1, W2, W3 and W4 fixtures upgrade straight to v5.

**Tests:** before the change, `npm test` gave 478 tests, 478 pass. After: `npx tsc --noEmit` is clean, and `npm test` gives **488 tests, 488 pass, 0 fail**. `npm run build` succeeds (bundle `index-TmN1cSo4.js`).
- Existing tests updated only where they asserted "a new world is the latest content (4)": now `LATEST_WILD_CONTENT` (5), with the v4 pin still asserted.
- The shed test's bag-limit checks now use the world's own capacity, and its fill loop allows 40 steps instead of 20 for the bigger bag.

**Browser** (local build at `https://astrix.local/`, Chromium software GL, localStorage seeded with the standard `w1` world plus the c01c774 v4 save):
- **Desktop 1000×600** (`or1-desktop-1..4`):
  - On load, content went from 4 to 5 and the toast said "Your bag now holds 60 weight (was 30)…". HUD "bag 29/60".
  - The site panel listed "1 in a pile 13 m north / 11 m east / 12 m south-west of you" and "Deliver 3 from bag". Clicking it delivered 3, released all 3 piles (they stayed at their positions with qty 1) and left 5 branches in the bag. Holding E for 2 swings finished the campfire (consumed branch 3, stone 6).
  - The Bag panel showed "weight 23/60 … Carries 60 weight, 37 free". After a reload, the save was intact (content 5, campfire done).
  - This run used the build just before a markup-only fix that removed stray commas between the location lines.
- **Phone 390×844, touch, DPR 2** (`or1-phone-1..5`, final build):
  - Walked to pile `d:8`. The panel showed "You are by 1 branch reserved for this campfire · Pick up for this site · The site is 8 m west of you". Tapping it carried the branch for the site, giving a bag of 31/60, which would have been refused at 30.
  - Back at the site: "reserved: 1 in your bag, 1 in a pile 15 m north of you, 1 in a pile 13 m south-west of you · Deliver 3 from bag". The tap delivered 3 (2 in place of the piles) and E finished the campfire. The Bag panel showed "weight 25/60".
- **Both runs:** 0 page or console errors, 0 failed requests, 0 HTTP ≥ 400 responses, 0 console warnings.

**Not done:** no real phone was used, and nothing ran against the live site. Nothing was committed, staged, pushed or deployed. W5 was not started.
