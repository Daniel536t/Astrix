# W6 "Deposits, mining and processing": completion report (uncommitted)

**W6 status: implemented, emulated only. Not accepted.** No physical-phone walkthrough was done; that needs the owner.

- **Repository:** `Astrix`, branch `deploy/boxd`, HEAD `dcec8b2` (W5 code `5917608`, deployed).
- **Not committed:** nothing is committed, staged, pushed or deployed.
- **Untouched:** `.tools/backups/w4-20261126/`, `05_Noxel_Studio/Asset_Sheets/2026-11-24_animals/Animals` and `Evidence/W1-wilderness-scenario/live-entry.png`.
- **Wilderness content:** v6 becomes **v7**, by one journaled `upgrade_wilderness` step. v1–v6 journals replay under their own rules first.
- **Scope:** W7 and later were not started.
- Evidence (screenshots and the generator scripts) is in `Evidence/W5-W8/w6/`.

## 1. What was built

### Deposits (`src/sim/deposits.ts`, pure, no three.js)
There are six types. Each deposit has an id, a type, a location and a finite quantity in units.

| Type | Where it is generated (the rule holds at the deposit) | Id | Units |
|---|---|---|---|
| Iron | The existing ore outcrops (`styl_ore`: stone top, rock score > 0.58, from `planNaturalEntities`). The metal is chosen by a smooth "copper province" field (`fbm2(x/260)`, seed + 7811): copper where it is > 0.56, iron elsewhere | unchanged `e:cx,cz:i` | 10–18 |
| Copper | Same outcrops, inside the copper province | unchanged `e:cx,cz:i` | 8–14 |
| Coal | A seam on a highland slope: stone top, height 22–70 m, slope ≥ 2, rock score 0.40–0.66, inside a coal-measure field | new `k:cx,cz:i` | 12–20 |
| Clay | A river or lake margin: grass top, flat (slope ≤ 1), water within 6 m, at most 4 m above that water, inside a clay field | `k:` | 10–16 |
| Sand | A beach or stream bank: sand top, dry, water within 4 m | `k:` | 12–20 |
| Gravel | A stream bar or bank: gravel top (the generator puts gravel only in stream and river beds and banks), either dry with water within 4 m or under at most 1 m of water (a ford's bed) | `k:` | 12–20 |

**Why the outcrops became iron and copper.** The ore outcrops already render, were already discovered in W5, and anchor the "Ore Mountain" places. New ore records beside them would have duplicated the system. Their ids, positions and random draws do not change. Only v7 gives them a metal and a quantity.

**How the new records are generated:**
- They use their own random stream (seed + 7919) and their own id namespace (`k:`).
- Each chunk has a jittered 16 m lattice. Every cell draws exactly four numbers, so a cell never depends on its neighbours or on load order.
- Each cell searches its 4 m sub-grid in a fixed order for the first spot where a rule holds. This finds thin bands such as stream banks.
- No record is placed within 2 m of a planned natural entity (tree, shrub or ore). This uses the same planner, without generating voxels.
- `generateEntityChunk`, its ids and its random order are unchanged, and so is the W2 pickup stream.

**Counts.**
- Seed 1337, whole world: iron 299, copper 212, coal 326, clay 59, sand 101, gravel 42.
- Nearest to the spawn: clay 47 m, gravel 45 m and sand 53 m at the river by the spawn; iron 317 m north-north-east; coal 386 m; copper 396 m west.

**Depletion.** What has been mined is saved per touched deposit: units left and swings into the next unit. Untouched deposits are not saved. A worked-out deposit stays at 0 and never regrows.

### Discovery (W5 rules, `src/sim/map.ts`)
- In v7, an explore report discovers every typed deposit within 24 m (`DEPOSIT_SIGHT`). In v6 it still discovers ore outcrops only, so v6 replays are unchanged.
- Discovered ids are recorded in the existing map block. Outcrops discovered in v6 stay discovered after the upgrade.
- A `k:` id in a snapshot below v7 is refused.
- **Minimap and full map:** a colour per type, shown only for discovered deposits. Metal deposits are circles, the others squares, and a worked-out one is hollow. The full map has a "Deposits found" list with units left and distance, plus legend entries.
- **Toast:** "You find a clay deposit (10 units): marked on your map".
- **In the land:** deposits are drawn as physical features whether or not they are discovered, the same as the W5 outcrops. Only the map is gated by discovery.

### Mining (`src/sim/mining.ts`, journaled `mine {depositId, at}`, one command per swing)
A swing is validated in this order; the code in brackets is the refusal:
1. The deposit exists, and an outcrop has not been removed from the world (`not_found`).
2. It is **discovered** (`undiscovered`).
3. It is not worked out (`exhausted`: "does not regrow").
4. A **stone pickaxe is in hand**, not merely in the bag (`no_pickaxe`; an axe is refused too). It is not broken (`broken_tool`).
5. The player is within **3 m** (`out_of_reach`).
6. The **swing budget** has room. It is shared with chopping and construction work: 4 swings per 2 s tick (`too_fast`).
7. The **bag can hold one more unit** (`capacity`). This is checked before any work, so a swing that could not produce a unit is refused.

**Capability tiers, kept simple.** The stone pickaxe is the only mining tool, for all six types. Hard material takes longer:

| Type | Swings per unit |
|---|---|
| Iron, copper | 4 |
| Coal | 3 |
| Clay, sand, gravel | 2 |

- Each swing costs 1 pickaxe durability (60 when new).
- No shovel was added.

**What a swing produces.** Only the last swing of a unit produces anything: one unit goes into the bag. A click produces nothing.

**Events:** `MINE_STARTED`, `DEPOSIT_MINED` (with units left) and `DEPOSIT_EXHAUSTED`, in the existing bounded event list.

**Client.**
- E or the Use button ("Mine") swings, and holding keeps swinging at the swing pace.
- The prompt reads, for example, `E: mine clay · 1/2 swings · 8/10 left · pickaxe 55/60`.
- Toasts show progress and depletion.
- Tapping a deposit inspects it: type, units left, swings per unit and weight. The type is shown only once the deposit is discovered.
- A deposit in sight but not yet on the map is reported by an explore first; that is the only discovery path.
- The pickaxe is drawn in the hand.

### Items and their lifecycle
- **New items, with weights:** `iron_ore` 4, `copper_ore` 4, `coal` 2, `clay` 3, `sand` 2, `gravel` 2, `iron_ingot` 3, `copper_ingot` 3. The bag still holds 60.
- **Existing systems only:**
  - carried in the bag;
  - dropped as piles (`d:N`, with location and quantity);
  - picked up with the 3.5 m reach;
  - stored in and taken from the log store or shed (by weight capacity);
  - reserved for sites through the W4 ledger.
- **Gating:** snapshot validation rejects these items in a world below v7.

### Processing (the clay smelter, smelting)
**The circular chain.** The catalogue's forge needs a workshop, and the workshop needs iron nails. That chain was **not** made available. W6 adds a primitive **clay smelter** (bloomery) instead:
- category Industry, implemented, `minContent: 7`;
- built with the W4 construction system: place, reserve in full, deliver, work by hand;
- stages: hearth (stone 6, gravel 4; 3 swings), shaft (clay 8, sand 4; 4 swings), dome and tuyere (clay 2, branch 2; 3 swings).

**Recipes** (`SMELT_RECIPES`):

| Recipe | Inputs (coal is the fuel) | Time | Output |
|---|---|---|---|
| Iron | 2 iron ore + 2 coal | 45 ticks (90 s) | 1 iron ingot |
| Copper | 2 copper ore + 1 coal | 30 ticks (60 s) | 1 copper ingot |

**Journaled `smelt {siteId, recipe, at}`.**
- It needs a **finished** smelter within reach. It refuses `not_found`, `wrong_building`, `unfinished` and `out_of_reach`.
- One batch at a time (`busy`).
- The inputs must be in the bag and **free**, using the same `bagRefusal` rule as crafting, so items reserved for a site are refused.
- The inputs leave the bag at once into the smelter's charge, so nothing else can use, drop or deliver them. Event `SMELT_STARTED`.

**When the batch is done.** At the tick the batch ends, the charge is consumed and the ingots appear as a pile at the smelter's door. They join an existing pile of the same item there. Event `SMELT_DONE`. The ingots are then picked up like any pile.

**Saving.** The batch (`job {recipe, start, end, charge}`) is saved in the site. Validation checks that:
- the recipe is known;
- the batch started after the smelter was finished and not in the future;
- `end = start + ticks`;
- the charge equals the recipe's inputs.

The smelter glows at its door while a batch is in it.

### What stays locked, and why (the menu shows these reasons)
| Building | Reason |
|---|---|
| Workshop | Needs smithed iron nails. Nails need a forge, and the forge needs a workshop |
| Forge | Needs a workshop, and cut stone (no stone cutting yet) |
| Cabin, timber house, barn, fence, farm plot | Iron nails |
| Bridge | A workshop and nails |
| Stone house | Cut stone, mortar and nails |
| Well | Cut stone |
| Gate | Hinges |
| Water barrel | Hoops |

- The old "W6" milestone labels were wrong once W6 existed, so they now name the real missing part. In a v6 world, clay and iron ingots say "mining arrives with wilderness content v7 (W6)".
- **Uses of the outputs:** iron ingots are listed for the (locked) forge. Copper ingots have no use yet.

### Render
- **`render/deposits.ts`:** four instanced meshes, each one draw call when anything of that kind is near:
  - a clay, sand or gravel mound coloured per type, shrinking as it is dug out;
  - a coal seam;
  - coloured vein blocks on iron or copper outcrops;
  - a worked-out scar. A worked-out outcrop is also hidden from the nature batch.
- **`render/pickups.ts`:** one heap mesh and one ingot mesh, coloured per item.
- **`render/wild-buildings.ts`:** the smelter model, 15 boxes (180 triangles), and the door glow.

## 2. Files
- **New:**
  - `Game/src/sim/deposits.ts`, `Game/src/sim/mining.ts`, `Game/src/render/deposits.ts`;
  - `Game/tests/w6.mining.test.ts`;
  - `Game/tests/fixtures/w6-wilderness-save.json`;
  - `Evidence/W5-W8/w6-fixture-gen.5917608.ts.txt`, `Evidence/W5-W8/w6/`.
- **Changed:**
  - `sim/gathering.ts`: v7, items, weights, the mine block, validation, the upgrade;
  - `sim/map.ts`: typed discovery in v7; `oreInChunk` moved to `deposits.ts` with identical output;
  - `sim/catalogue.ts`: the smelter, `SMELT_RECIPES`, content-aware material locks, honest milestone reasons;
  - `sim/wild-build.ts`: lock by content, deposits block building placement in v7, `smeltAt`, the finish in `stepBuild`, job snapshot and validation;
  - `sim/felling.ts`: 5 event names;
  - `sim/wilderness.ts`: the allow-list;
  - `app/wild-commands.ts`: `mine` and `smelt` (validators, outcomes, agreement, v7 gating);
  - `app/wild-game.ts`, `app/wild-build-ui.ts` (smelter panel), `app/wild-map.ts`, `render/pickups.ts`, `render/wild-buildings.ts`, `styles.css` (lg-dep legend; the phone event feed position, see §4).
- **Existing tests changed** (no assertion weakened):
  - `w2` and `w4.build`: the latest and default content is 7 instead of 6;
  - `w4.build` and `w4.ui`: the lock-reason text, which no longer claims W6 delivers cut stone or nails;
  - `w5.map`: `v6()` now builds an explicit v6 world, so the W5 tests keep testing exactly the v6 rules.
- **Regenerated:** `Game/dist` (the build empties it, so the deploy's untracked `index-BO7OAFQ3.js` is gone from the working tree) and `Game/tests/.build`.

## 3. Tests, typecheck and build
| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npm test` | **527 tests, 527 pass, 0 fail** (256 s, host load average about 9 on 8 CPUs); 507 before, plus 20 new |
| m004 "v2 chunk generation stays within budget per chunk" | **Passed** in this full run (threshold unchanged). It was not re-run in isolation because it did not fail |
| `npm run build` | OK. Bundle `assets/index--1L6ZEre.js`, `assets/index-D6bp5Ey-.css` |

**New tests (`tests/w6.mining.test.ts`, 20):**
1. **All six types:**
   - at least 5 of each in the 1 km around the spawn (seed 1337), and at least 3 of each in seed 4242;
   - finite quantities and unique ids;
   - pins (for example `k:29,28:0` clay at (−94.5, −126.5), 10 units; `e:31,16:6` iron, 15);
   - iron and copper deposits are exactly the `styl_ore` entities chunk generation places (6 chunks);
   - pickup ids unchanged.
2. **Geography:** every deposit in 28×28 chunks is checked against its rule (top material, water distance and depth, height range, rock score, copper field).
3. **Discovery:**
   - an unseen deposit is refused (`undiscovered`) even when standing by it;
   - it is not discovered at 40 m and is discovered within 24 m;
   - farther deposits stay undiscovered.
4. **Validation:**
   - bare hands and the axe are refused (`no_pickaxe`);
   - reach;
   - the 5th swing in a tick is refused;
   - capacity is checked before work;
   - each refusal leaves the state hash unchanged.
5. **Progress:** work 1, 2, 3, 0; a unit only on the 4th swing; durability −4; the events.
6. **Depletion:** 10 units, then `exhausted`, still worked out after 1,800 more ticks; the mined clay is real (10 in piles where they were dropped).
7. **Lifecycle:** carry; drop as a pile at the exact spot; a pickup from 20 m is refused (no teleporting); pickup; store in a log store; take back.
8. **The smelter built with W4 construction** from mined clay, sand and gravel (consumed exactly), and the deposits depleted by what was taken.
9. **Smelting:**
   - refusals: workbench (`wrong_building`), no such site, reach, missing copper ore, `busy`;
   - exactly 2 ore + 2 coal leave the bag at the start, and the charged ore cannot be dropped;
   - no ingot at 44 ticks, 1 ingot at 45, at the door;
   - "missing 1 coal, 2 iron ore" for a second batch;
   - the pickaxe ends at 7 after 53 swings.
10. **Reservations:**
    - a second smelter is `unfunded` (nothing free);
    - reserved campfire stones cannot be dropped;
    - a second site never takes the reserved stones;
    - a smelt leaves the fire site's reservation intact.
11. **Save, reload, compaction and replay mid-batch:** identical hashes and job, and the ingot comes out identically in all three.
12. **Snapshot tampering refused:** `left` 99, a bad id, a missing mine block, a wrong batch end, a wrong charge, v6 content with v7 state.
13. **v6 and pins:**
    - `mine` and `smelt` are refused in v6; the smelter is locked there (content v7, clay "mining arrives…"); v6 discovery is ore only;
    - pins: v6 genesis `2d9f702a4368b9d1` unchanged, **v7 genesis `2b53c51d7dec7daa`**, settlement `e659504b056654dc`;
    - the smelter is the only v7 building; the forge and workshop locks give the reasons above.
14–15. **The v6 fixture from `5917608`** (short and compacted):
    - byte-identical record; replays under v6; `mine` refused before the upgrade; one upgrade to v7 with all v6 state untouched;
    - the outcrop discovered in v6 is now an iron deposit, mined with the save's own pickaxe;
    - its unfinished lean-to is finished; reload and replay.
16–20. **W1–W5 fixtures:** load, replay, upgrade straight to v7, explore.

**The v6 fixture.**
- Made by the live W5 code `5917608` in a temporary worktree, `/projects/sandbox/.tools/scratch/w6-wt`. The worktree was removed and is not in `git worktree list`.
- Contents:
  - a campfire with fuel and a workbench;
  - a stone axe, and a stone pickaxe that is equipped;
  - an unfinished lean-to;
  - piles;
  - land explored to the outcrop `e:31,16:6` (discovered), with a waypoint there.
- 163 entries, hash `8a6b03f31eb3d7a8`.

**Settlement:** the pins and the v1–v8, v6 and v7 fixtures pass in their own suites, which are part of the 527.

## 4. Browser walkthrough (emulated; local build at https://astrix.local/; Chromium with software GL)
**Setup.**
- localStorage was seeded as specified (`w1`, seed 1337, gen 2, spawn (−82, −172)).
- Captured on every run: console errors and warnings, page errors, failed requests and HTTP ≥ 400. **None were recorded in any run.**

**Generated start (stated).** A scratch script (`w6/w6-browser-save-gen.ts.txt`) ran the W6 code with journaled commands only. It produced a v7 save containing:
- a stone axe, a finished workbench and a log store;
- a stone pickaxe, crafted and equipped;
- 6 stones and 2 branches dropped near the spawn;
- nothing mined and no deposit discovered.

**Desktop 1200×700:**
- **a. Start.** Map deposits 0; 4 mounds drawn in the land. `w6-a`.
- **b. Walking to the river.** At 22 m from the clay, the last report (sent every 16 m) had been farther than 24 m away, so the clay was not yet discovered and not on the map. `w6-b`.
- **c. Discovery.** 8 m on, the clay was discovered: toast "You find a clay deposit (10 units): marked on your map". Next, the gravel was found. `w6-c`.
- **d. Mining with progress, by holding E.** The prompt read `E: mine clay · 0/2 swings · 10/10 left · pickaxe 60/60`. After 3.5 s: 2 clay, toast "mining clay 1/2 · 8/10 left · pickaxe 55/60". `w6-d`.
- **e. Depletion.** 20 swings gave 10 clay. Deposit left 0, toast "the deposit is worked out (it does not regrow)", 1 scar drawn, bag 37/60. **0 refused swings.** `w6-e`.
- **f. Gravel and sand.** Gravel was mined standing in the ford (4) and sand on the bank (4). Bag 53/60, pickaxe 22/60. `w6-f`.
- **g–i. The smelter.**
  - The Build menu lists "Clay smelter … branch 2/2 · clay 10/10 · gravel 4/4 · sand 4/4 · stone 6/6". The ghost reported "Good spot". Enter placed it.
  - Reserved: bag {clay 10, gravel 4, sand 4}, pile d:21 {stone 6}, pile d:22 {branch 2}.
  - E delivered everything; holding E built it (10 swings). Consumed exactly the list. `w6-g/h/i`.
- **Not done in the browser: walking to the iron outcrop.** The walk to iron (317 m) was attempted on foot, also by the W5 route planner's points. The character got stuck at (−27.7, −399.7), below a highland face that the coarse route treats as passable (the W5 limitation of the coarse route). It also could not step back out. Return home (R) recovered it. `w6-j`.
- **Iron and coal, generated (stated).** I downloaded the browser's own save. A second scratch leg (`w6/w6-browser-ore-leg.ts.txt`, journaled `explore` reports at walking pace, then `mine`) walked to `e:31,16:6`, mined 2 iron ore (8 swings), walked to coal `k:25,15:0`, mined 3 coal (9 swings), and walked back. That save was loaded into the browser.
  - **Mining iron and coal in the browser: NOT VERIFIED.** Those two deposits were mined by the same `mine` command in Node.
- **k. Drop and pick up.** The Bag showed weights "ore 4, clay 3, coal/sand/gravel 2, ingot 3". Bag → Drop 1 iron ore made pile d:24 at the player (bag 21 → 17); E picked it back up (→ 21). `w6-k`.
- **l. Storage.** At the log store, "Store 3" coal gave stock {coal 3}, then 3× Take 1 put it back in the bag. `w6-l`.
- **m–o. Smelting.**
  - The smelter panel showed "coal 2/2 (fuel) · iron ore 2/2 · 90 s" and the copper line greyed out (0/2 ore).
  - Smelt: bag went to {coal 1} at once; event SMELT_STARTED (n 45) at tick 698. The panel read "Smelting 1 iron ingot · 90 s left … holds 2 coal, 2 iron ore", then 74 s left. `w6-m`.
  - **Reload mid-batch:** after the reload, "Smelting 1 iron ingot · 64 s left", bag {coal 1}. `w6-n`.
  - SMELT_DONE n 1 at **tick 743 (exactly 45 ticks)**. The panel read "Cold"; the iron ingot pile was at the door; E picked it up ("bag 12/60"). `w6-o`.
- **p. Full map.** Square and round deposit icons; the worked-out clay is drawn hollow; "Deposits found (33)". Map open took 7.6 ms. `w6-p`.

**Phone and tablet layout, emulated** (touch, DPR 2, quality low; the save above, standing at the smelter, then at the sand):

| Viewport | Smelter panel open | At a deposit (Use = "Mine") | Tap targets < 40 px |
|---|---|---|---|
| 390×844 | **0 overlaps** (panel [8,276,278,574] below the HUD [12,124,191,268]) | **0** (after the fix below) | 0; smelter buttons 57×40 |
| 360×780 | **0** | **0** | 0 |
| 844×390 | **0** | **0** (after the fix below) | 0 |

**Bugs found and fixed:**
- In portrait, the event feed (new mining events) overlapped the Builder view button by 1,536 px². The feed now starts at 176 px.
- In landscape, the feed overlapped the joystick ring by 3,654 px². It now sits in the middle column.
- The "→" in the smelter recipe line rendered as a missing glyph; it now reads "makes".

**Remaining observation:** for about the first 3 s after a load, the site panel overlapped the HUD on 390 and 360 (21,480 px²). This happens until the HUD height is published (the W4 `--hud-bottom` mechanism, refreshed every 12 frames). It was 0 at 7 s.

**Touch mining:** on 390×844, one tap of Use gave "+1 sand · 8/13 left in the deposit · bag 14/60".

## 5. Performance
- **Scene budget (renderer.info)** stayed within 120 draw calls and 250k triangles in every run:

| Run | Draw calls | Triangles |
|---|---|---|
| Desktop, at the smelter with the ingot | 66 | 161,508 |
| Desktop, at the deposits | 58 | 156,428 |
| Phone 390 | 40–42 | 87–93k |
| Landscape 844 | 48 | 117k |

- **Deposits view:** at most 4 instanced meshes. 7 deposits drawn near the river.
- **Frame rate in this sandbox:** about 2 fps in all runs (desktop, phone, and phone with CDP CPU ×4). This is software GL on a loaded host (load average about 9), so it is **not a meaningful frame rate**. It was not compared with W5 under the same conditions: NOT VERIFIED.
- **Sim costs in Node (host under load):**
  - `depositsInChunk` the first time per chunk: median 9.4 ms, max 74 ms (then cached);
  - explore dispatch: v7 median 0.37 ms, max 150.8 ms on the first report (places and deposit chunks computed); v6 median 0.43 ms, max 87.4 ms;
  - the in-browser W6 explore and mine dispatch times were not isolated: NOT VERIFIED.

## 6. Save and replay
- **v6 save from `5917608`:** byte-identical, replays under v6, then one journaled upgrade to v7 that leaves all v6 state untouched (tests 14–15).
- **W1–W5 fixtures:** upgrade straight to v7 (tests 16–20).
- **Mid-smelt:** save, reload, compaction and replay give identical results (test 11; browser steps m–o).
- **Strict snapshot form:** the mine block and smelter jobs are canonical and validated; deposit quantities are checked on use, not in the snapshot (see §7).

## 7. Known limitations
- **Snapshot validation checks formats and bounds for mining records** (left ≤ 20, work below the largest swing count). It does not regenerate each deposit to check left ≤ its quantity. This is the same trust level as W5's map block.
- **The stone pickaxe is the only mining tool, for all six types.** There is no shovel and no tool tiers beyond swings per unit.
- **No charcoal, and copper ingots have no use yet.** Iron ingots are only for the locked forge. Sand and gravel are used only by the smelter.
- **Ore-to-ingot only.** There is no smithing, no iron tools and no nails. The workshop, forge and every nail, hinge, hoop or cut-stone building stay locked, with the reasons in §1.
- **Deposits are visible in the land before discovery,** as the W5 outcrops were. Only the map hides them.
- **Iron, copper and coal are 300–400 m away, in highlands.** The W5 coarse route led into a face the character could not climb (§4), so reaching them on foot is not guaranteed by the route.
- **Physical-phone walkthrough: NOT DONE (needs the owner).**
- **Commit hygiene:** `Game/dist` and `Game/tests/.build` are regenerated and dirty.

## 8. Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| All six deposit types exist in world generation and simulation | Pass | Test 1 (counts, pins, two seeds); `w6-c/e/f/p` |
| Distribution respects geography | Pass | Test 2 (every deposit's rule checked); §1 table |
| Discoverable by exploration; recorded; map respects W5 rules | Pass | Test 3; `w6-b` (22 m, not yet reported) and `w6-c` (found); map icons only for discovered (`w6-p`) |
| Finite quantities that deplete, no regeneration | Pass | Test 6; `w6-e` (10 → 0, scar, "does not regrow") |
| Mining needs the correct tool, is real work with progress, gives actual material | Pass in tests and in the browser (clay, sand, gravel); iron and coal mined by a generated leg: **browser NOT VERIFIED** | Tests 4–5; `w6-d` (1/2 swings, 55/60) |
| Mining respects tool, position and inventory capacity | Pass | Test 4 (`no_pickaxe`, `out_of_reach`, `too_fast`, `capacity` before work) |
| Carry, drop, pick up, store | Pass | Test 7; `w6-k`, `w6-l` |
| Reservations: no double consumption | Pass | Tests 9–10 (charged ore leaves the bag; reserved stones not dropped or reserved twice) |
| Smelting consumes the correct inputs and fuel and produces the correct outputs only after time; refused without a facility or inputs | Pass | Test 9; browser: 2 ore + 2 coal in, 1 iron ingot at tick +45 at the door (`w6-m/o`) |
| The forge chain resolved honestly | Pass (primitive smelter; forge and workshop stay locked with accurate reasons) | §1; test 13; smelter panel text |
| Identity, reservations and persistence correct; old saves preserved | Pass | Tests 11–20; pins; reload mid-smelt in the browser (`w6-n`) |
| Tests cover mining, depletion, inventory limits, processing, reload and replay | Pass | 20 new tests; 527/527 |
| Mobile usability | Pass, emulated (0 overlaps at 390, 360 and 844×390 after the fixes; a transient overlap for 3 s after load noted); physical phone NOT DONE | §4 |
| Render budget | Pass | §5 (max 66 calls, 161,508 triangles) |
