# M012: living settlement (evidence)

**Date:** 2026-11-25 · **Branch:** deploy/boxd (local commits only; not pushed or deployed)

## Stage A

### Owner requirements

- Animals should treat open gates as passages and closed gates as obstacles. They should stay inside closed paddocks and interact with their surroundings.
- The player should not walk through fences, buildings or other solid structures.
- Villagers should avoid one another, queue at narrow entrances and never take the same work position.
- The visible farmhouse door must match its authoritative open/closed state.
- All of this should come from one consistent collision and navigation architecture.

### Architecture: one structure layer

The M010 walking grid (`Game/src/sim/nav.ts`, built by `homesteadNav` in `Game/src/sim/homestead.ts`) is the single source for all three kinds of mover. It holds:
- fence edges on cell sides;
- gate and door edges with their live `open`/`closed`/`locked` state;
- building, shelter, trough, store and barn footprints;
- tree footprints by growth stage;
- terrain steps, cliffs and water.

| Mover | How it uses the grid | Tier |
|---|---|---|
| Villagers | A* routes as in M010. Under rules v3 they also hold cells (see below). | hashed sim |
| Homestead animals (new) | Every move is an A* route on the same grid with `openGatesOnly`. An open gate is a passage. A closed or locked gate is a fence, because animals cannot open gates. Each segment runs from a point in one cell to the centre of a neighbour the route allows, so no move can cross a fence edge or cut a blocked corner. | hashed sim |
| Player (new) | `stepCharacter` sweeps the character box against `structureHits(grid, …)`. That covers fence edges, gate and door edges while they are not open, and solid cells (house 4.5 m, shelters/store/barn 2.6 m, troughs 0.75 m). Fences are 1.15 m tall and 0.16 m thick. | player-local physics, not hashed |

- **New `NavGrid.solid` layer.** It is derived from the same feature list as the grid and is not part of the grid hash, so v2 grid hashes are unchanged.
- **Player cannot be sealed in.** A structure the player already overlaps never holds them; for example, a gate shut on the player, or a fence they stand in after loading a save. They can always walk out.
- **Banner safe landing.** `canStandAt`, which banner safe landing uses, also rejects settlement structures.
- **What I left unchanged:**
  - Vertical motion does not test settlement structures. A double jump (about 2.6 m) can vault a 1.15 m fence; a single jump (0.99 m) cannot.
  - Trees, rocks, voxels and M002 modules collide with the player exactly as before.

### Settlement rules v3 (hashed sim)

**Version gating.** New homesteads are founded with `found_homestead { rules: 3 }`. Existing v1 and v2 homesteads load with their exact bytes and hash. The app then sends one journaled `upgrade_homestead { rules: 3 }`. A plain `upgrade_homestead` with no `rules` still means v1 → v2, as old journals recorded it.

**Animals:**
- **Inside a pen:** they wander the pen as before and walk around shelters and troughs. When hungry and the pasture is bare, they walk to the trough.
- **Gate open:** when an animal picks a new spot while its gate is open and no villager is holding it, there is a 35% chance it heads out through the gate. It then grazes within 12 m of the gate: wild grass, no pen pasture or trough used, so it does not starve.
- **Strays going back on their own:** while the gate stays open, a stray that picks a new spot has a 25% chance of walking back in.
- **Gate closed:** animals inside stay in.
- **Saved state:** `animal.go` (`out` or `home`) is a v3-only snapshot field.

**Herder round-up:**
- A herder only rounds up strays when their gate is **closed**. An open gate is the owner's choice, and a locked gate keeps everyone out.
- The job is `round_up` (target `stray:<pen>`), done in this order:
  1. Walk to the stray (the goal follows it).
  2. `herd`: every stray within 3 m gets `go: home`.
  3. Walk to the spot beside the gate.
  4. `hold_gate`: open the gate, wait up to 30 ticks while the driven strays trot in at 1.2 m/tick, then close the gate again.
- No animal slips out while a villager holds a gate, whether the villager is walking through it or holding it for strays.

**Villager avoidance:**
- **Who holds which cell:** each tick, villagers hold the cell they stand on, plus the cell they are stepping into. Villagers move in a fixed id order.
- **No sharing:** a villager never enters a cell another villager holds.
- **Routing:** when planning, a villager prefers a route that goes round other villagers and ends on a free goal cell. Because each work position is a cell, two villagers never share a store, well, trough or field spot.
- **Waiting:** a villager that is blocked waits, and the reason is saved in `nav.wait = { by, reason, since }` (v3-only). Example reasons: "queueing at the pen gate behind Ada", "waiting for Bram to make room". The Farm panel shows it.
  - Every 4 ticks a waiting villager looks for a detour, limited to 4,000 expansions.
- **Head-on standoff:** the villager with the later id steps aside to a free neighbouring cell.
- **Beds:** villagers sleep in their own cells inside the farmhouse, west and east of the threshold. These cells are walkable for villagers but stay solid for the player, because the interior is not drawn.

### Controls added

- **E** (desktop), and the touch **Use/Gather** button through the same `gather()` → `HomesteadGame.useNearest()` path: within 2 m of a gate or the farmhouse door edge, this issues the journaled `set_gate`. It works the same from either side of the gate.
  - Closed → open, open → closed.
  - **Locked → unlocked and opened**, so the owner's own gate never holds the owner.
- The HUD and the Use button show the label, for example "E: Open the pen gate". The HUD hint and `00_Project_Core/Controls.md` are updated.

### Farmhouse door

- The cottage is built with `door: false`, which draws a dark doorway behind the frame.
- The door leaf is drawn from `h.gates['door:farmhouse']` inside the existing `homestead_troughs` mesh, alongside the gate leaves. This adds **no new mesh or draw call**.
  - closed: in the frame;
  - open: swung 90° outward on its left hinge;
  - locked: closed, with an iron bar across.
- `HomesteadView.metrics().leaves` reports the state each leaf is drawn in.

### Save compatibility

- Genesis is `e659504b056654dc`.
- Pinned hashes from the M011 build (b1dcdd8) for a fixed command sequence are reproduced by the M012 code:
  - v1 run: `16ca4c350d98096f`
  - v2 run: `542411888c83bf3a`
- v2 snapshots restore byte-identical and contain no `go` or `wait` fields.
- A v1 or v2 snapshot plus a journal that includes the upgrade replays to the live hash.
- v3-only fields in a v2 snapshot are rejected.
- **Deliberate test change:** `tests/m010.navigation.test.ts` used `found_homestead { rules: 3 }` as its example of an invalid command. That value is now valid, so the test uses `rules: 4`.

## Tests (Node): `cd Game && npx tsc --noEmit && npm test && npm run build`

Typecheck is clean and the build passes. **279/279 tests pass** (267 before, plus 12 new in `tests/m012.living.test.ts`).

New tests:
1. With every gate closed for 1,500 ticks, every animal stays inside its pen on every tick. Every move between ticks is a legal grid move (no fence or closed gate crossed). Animals wander and eat.
2. With the pen gate open, only pen animals cross the fence line, and only at the gate cells. At least 2 leave. Strays stay near the gate and do not starve. Other pens stay full. No round-up happens while the owner keeps the gate open.
3. With the gate **locked**, nobody brings strays in. Once it is closed, the herder runs `round_up`, holds the gate open while driving strays home, every stray gets back in, and the gate ends closed.
4. Over a 900-tick working day, the two villagers never share a cell, they rest in distinct beds, waits occur, and products reach the store.
5. Two villagers in line at the pen gate: Bram's saved state reads "queueing at the pen gate behind Ada", and the snapshot validates. Both work at the trough on **different cells**, and the gate ends closed.
6. Head-on at a gate: Bram (the later id) steps aside, both get through, they never share a cell, and the gate is shut behind them.
7. The player:
   - is stopped by the fence and by the closed gate;
   - E (`nearbyGate`) issues one journaled `set_gate`, and the player walks through the opening;
   - can close the gate from inside, is held by it, then reopens it from inside and walks out;
   - is offered "Unlock and open" at a locked gate;
   - can walk out of a gate shut on them while standing in it;
   - is stopped by the farmhouse wall and the closed door, goes only as far as the doorway when the door is open, and can open the door from inside.
8. Structure-layer cells are correct: the house is solid, the trough is low, and bed cells are walkable for villagers but solid for the player. Gate edges count by their state. A single jump does not clear a fence. The real home banner still has a safe landing that touches no structure, and nobody can stand inside the farmhouse.
9. Drawn door and gate leaves equal the sim state for open, locked and closed. The mesh count is unchanged, and three distinct door shapes are drawn.
10. Old saves: the pinned v1/v2 hashes, byte-identical v2 restore, and v2 → v3 and v1 → v3 journaled upgrades (once only), with replay and old snapshot + journal both reaching the live hash.
11. v3 determinism: two runs agree, and replay from genesis, restore of a mid-run snapshot (with strays) plus the tail, and dropped nav caches all reach the same hash, including gate commands.
12. Genesis hash, plus strict validation of `upgrade_homestead`/`found_homestead` rules and `animal.go`.

The existing banner, double-jump, swimming (M011), navigation (M010), tree and fauna tests all pass unchanged.

## Performance

**Sim (Node, seed 1337, v2 world, 6 × 6 field, 900 ticks; `farm.ts`)**, whole `tick` command including animals:

| | mean | p50 | p99 | first tick |
|---|---|---|---|---|
| v3 | 0.87 ms | 0.59 ms | 2.8 ms | about 151 ms (terrain layer, chunks generated in Node) |
| v2 (same code) | 0.58 ms | 0.38 ms | 1.8 ms | about 150 ms |

Animal searches: about 10,400 in 900 ticks (29k expansions, 87 ms total).

**Browser (Chromium, software GL):**
- `__metrics.sections.tick` was mean 2.0–2.2 ms, p95 4.5–5.7 ms, max 16 ms. That covers the whole real-time tick, including save bookkeeping.
- Villager stepping alone (`navStats`) averaged 0.28–0.38 ms per tick.

**Render (budget 120 draws / 250k triangles):**
- 62–91 draw calls and 122k–167k triangles across all samples.
- Breakdown at the end: 67–80 draws and 145k–162k triangles.

## Browser (Playwright Chromium, software GL, desktop 1000×600; built `Game/dist` routed at https://astrix.local/?chain=0)

**Setup:**
- `Game/dist` from this build was copied to `.kiro/artifacts/screenshots/probe/dist`, byte-identical (`diff -rq`).
- Saves were made in Node by `saves.ts` (seed 1337, generator v2, a 6 × 6 flax field, 305 ticks) and injected into localStorage together with the avatar position, so the game **restored** them.
- Samples are the game's own `window.__metrics`, in `browser-samples.json`. Scripts are `m012-pen.template.js` and `m012-door.template.js`, with the config filled in by `gen.mjs`.
- No mutable debug hooks were used.
- **No page errors in either run.**

### Pen run (a v3 save; founder north of the pen gate at (-26, -4))

| t (s) | tick | what happened | evidence |
|---|---|---|---|
| 54 | 330 | Pushing into the fence 1.5 m west of the gate: stopped at z = -4.43 (fence line -4.0, minus 0.38 m of fence half-thickness plus body radius). | `pen-1-fence-blocks.png` |
| 65 | 335 | Pushing into the closed gate: stopped at z = -4.38. The HUD reads "E: Open the pen gate". | `pen-2-gate-closed-blocks.png` |
| 68 | 337 | E: the gate is `open` in the sim and in the drawn leaf. Accepted commands went from 337 to 340 (`set_gate` plus ticks). | `pen-3-gate-opened.png` |
| 71 | 338 | Walked through the opening to z = +0.21, inside the pen. | `pen-4-inside-pen.png` |
| 143–208 | 374–407 | With the gate open, `animal:018`, then `008`, then `017` set `go: out`, walked through the gate and grazed outside. | `pen-5-animals-out.png` (goats outside the fence, right) |
| 218 | 412 | E beside the gate: closed, with 3 strays out. | `pen-6-gate-closed-strays-out.png` |
| 294–349 | 450–477 | Bram finished shearing, then ran `round_up`. `008` was driven home (`go: home`) and was in at tick 468. Bram held the gate (`open` at 477) while `017` walked in; the gate was closed at 481. | `pen-7-herder-holds-gate.png` |
| 356–472 | 481–539 | Night fell (tick 471 is the night start), so Bram went to bed. `018` stayed out grazing; the round-up resumes by day. | `pen-8-night-one-stray-left.png` |

The drawn pen leaf matched the sim gate state in all 63 samples (and the door run matched for every gate and the door in every sample). The villagers slept in distinct beds: (-34.5, -11.5) and (-32.5, -11.5).

### Door run (a **v2** save, upgraded on load)

| t (s) | what happened | evidence |
|---|---|---|
| 13 | The save loaded with status `saved` (impossible after a hash mismatch). `rules` went 2 → 3 through the journaled upgrade, with the toast "The homestead is livelier…". | |
| 126 | In front of the farmhouse door, closed. | `door-0-front.png` |
| 131 | Pushing into the closed door: stopped at z = -10.57 (front wall at -11.0). | `door-1-closed-blocks.png` |
| 134 | E: the door is `open` in the sim and drawn open. | `door-2-open.png` (dark doorway; the leaf is swung out on the left) |
| 141 | Walked into the doorway, z = -11.67. The house behind is solid (cell edge -12, plus the body radius). | `door-3-in-doorway.png` |
| 144 / 147 | E from inside closed the door, then E opened it again (sim and drawn states agree). | `door-4-closed-from-inside.png` |
| 150 | Walked out to z = -5.95. | `door-5-out-door-open.png` |
| 164 | E: closed again; the leaf is back in the frame. | `door-6-closed.png` |
| 177 | Pushing into the wall 2 m west of the door: stopped at z = -10.67. | |

## Tests vs browser

- **Tests only:**
  - full containment over 1,500 ticks;
  - the grid-legality check on every animal move;
  - the locked-gate round-up refusal;
  - the gate queue and head-on standoff;
  - locked-gate "Unlock and open";
  - a gate shut on the player;
  - jumping against a fence;
  - banner landing;
  - pinned old hashes, replay and restore.
- **Browser:**
  - the player blocked by the fence, the gate, the door and the wall;
  - E opening and closing the gate and the door (journaled);
  - walking through the gate and into the doorway;
  - animals leaving through an open gate;
  - the herder holding the gate and driving two strays home;
  - drawn leaves matching the sim;
  - v2 → v3 upgrade on load;
  - render budget and tick cost.
- **Not seen in the browser:** villager queueing (the two villagers rarely meet at one gate) and the touch Use button. The touch button uses the same `gather()` path as E.
- No real phone was used, and no phone emulation was run in this stage.

## Not done / limits

- **Not every stray came back in the browser run.** One stray was still out at nightfall, because the herder rests at night and resumes by day. In the herder test (`round_up`), every stray did come back.
- **Round-up is one stray at a time** (plus any others within 3 m), so a large escape takes several trips.
- **Night shelter:** animals do not seek their shelter at night.
- **Chickens out of the coop** still lay into the coop egg box.
- **Strays can wander into fields** (field fences have a walk-in gap) and do not eat crops.
- **Troughs:** the player is blocked by the trough's 1 m nav cell, not by the 1.6 m model.
- **The doorway:** the player can step 1 m into it, which is inside the drawn plaster. There is no house interior.
- **Fence vaulting:** a double jump can clear a fence. This was left as is, and it is one more way out of a pen.
- **Owner-opened gates:** the herder does not round up strays while the owner keeps the gate open, and never closes a gate that he did not open himself.
- **Villager avoidance is between villagers only.** Villagers and animals do not reserve cells against each other, and the player is not an obstacle for villagers.
- **First tick after load:** about 150 ms in Node with chunks generated (as in M010). In the browser the player's collision layer is built from the same cached grid.

## Stage B: work (woodcutter, builder, reservations)

**Date:** 2026-11-25 · **Branch:** deploy/boxd · **Commits:** feature `1cf4e4d`, then the frame-order fix and this evidence (see the end of this section). Merged locally only: **not pushed, not deployed.** No real phone was used.

### Owner requirements (Stage B)

- A villager assigned to woodcutting, and one assigned to construction.
- Real resource collection, transport and delivery; no teleportation or invented resource transfers.
- Material reservations, so two jobs cannot consume the same resources.
- Animals and villagers navigating gates correctly; player collision with the environment.
- Work and inventory surviving save/reload.
- Jobs must use the existing authoritative simulation and governance, not decorative animations.
- A reproducible live-browser test that assigns jobs and then checks positions, gates, inventories and deliveries over time.

### Settlement rules v4

Everything below is hashed simulation state, gated behind **settlement rules v4** (`HOMESTEAD_WORK_VERSION`, `Game/src/sim/homestead.ts`).
- New homesteads: `found_homestead { rules: 4 }`.
- Existing saves load with their exact bytes and hash, then the app sends one journaled `upgrade_homestead { rules: 4 }` (from v1, v2 or v3).
- Pinned hashes for the fixed command sequence (seed 1337, generator v2, potato field, 300 ticks, pen gate opened, 100 ticks), measured on the Stage A build (`d46d58e`) and reproduced by this code:
  - v1 `16ca4c350d98096f`
  - v2 `542411888c83bf3a`
  - v3 `d2c28283712a8de7`
- Genesis is still `e659504b056654dc`.
- A v3 snapshot restores byte-identical and has no v4 fields. v4 fields (work roles, `sites`, `carry.site`) are rejected in a v3 snapshot.

**Third settler.** Under v4, **Cora** (`villager:2`) arrives as a farmer, as part of the journaled found or upgrade command. She is placed on the free walkable cell nearest the yard, never on a cell another villager stands on. The owner gives her work.

**Beds (a Stage A bug, fixed for v4).**
- Under v3, the two beds sit in the farmhouse's front row beside the threshold. Their south sides open straight onto the yard, so a villager could leave bed through the wall, and a locked door did not keep anyone in.
- v3 keeps this behaviour so that its hashes stay exact.
- v4 moves the three beds one row in, off a one-cell hall behind the threshold. The door is now the only way in or out. The test "an unreachable building site…" locks the door on a sleeping builder: she reports "the farmhouse door is locked" and gives the job up openly.

### Roles and governance

Jobs are `woodcutter` and `builder` (v4 only), added beside `farmer` and `herder`.

**Owner.** Assigns a job with the journaled `assign_role` command, from a Job selector per villager in the Farm panel.

**Steward (AI agent).** Uses the same permission-checked command (`actor: 'steward'`) under its existing **Reassign jobs** policy:
- *may act*: it reassigns directly;
- *ask me first*: it files a proposal, which the owner approves or declines;
- *never*: it does nothing.

The steward's rules (`app/homestead.ts`, checked every 300 ticks as before):
- an approved site with no builder takes a spare farmer as builder;
- a site short of wood with no woodcutter takes a spare farmer as woodcutter;
- it never takes the last farmer while fields exist;
- it never moves a woodcutter or builder away from the job.

**Building sites are the owner's.**
- `place_site { kind: 'woodshed', x, z }`: the Farm panel's "Plan a woodshed" picks a deterministic spot with a ring search from the farmhouse.
- `approve_site`: reserves the site's materials.
- `cancel_site`: allowed only while nothing has been delivered.
- The steward cannot place or approve sites; there is no steward policy for building.

**Movement.** Every walk is the shared `navStep` on the one walking grid, through the same `navWalk` the other jobs use. There is no per-job movement code.

### Woodcutter

**Which trees.** The woodlot is the trees a woodcutter may fell (`woodlot()`):
- natural trees at the **mature or old** stage only (never a sapling or a young tree);
- not the authored hero grove;
- inside the homestead's 120 m walking window;
- more than **5 m** from every building, pen, field, site, the store and the barn.

**When to start a new tree.** Only while all of these hold:
- at least **6** mature or old trees (the grove included) would still stand afterwards;
- either the store and barn hold under 40 free wood, or a site still needs wood.

A partly cut tree is always finished first.

**Choice.** A Dijkstra search over the walking grid picks the nearest tree by route cost, with the smallest entity id on a tie (`findNearest` in `sim/nav.ts`). The tree becomes the task target `tree:cx:cz:i`.
- No other villager can take that target.
- The player's `harvest` of that tree is rejected with code `reserved` ("Cora is felling this tree").

**The work.**
1. She walks to the tree and chops for 4 ticks per cut.
2. Each cut goes through `cutEntity` in `sim/world.ts`. This is the player's harvest rule, now shared: stage timber, the same depletion and the same `harvested` flag. Her load is capped at **8 wood**, which is two cuts of a mature tree.
3. A depleted tree is no longer drawn: `main.ts` redraws nature when `felledTrees` changes. It also leaves the walking grid, because the grid rebuilds when the world revision changes.
4. She walks to the store and deposits the load. The store total rises only at that store leg.

**At nightfall** she stops between cuts and takes her load to the store, or turns home if she is still walking to a tree.

### Builder and reservations

**Woodshed.** 3 × 2 m. It costs **12 wood + 4 fibre** and needs **24 work ticks**.

**Reserving.** When a site is approved, and again at the start of every tick, approved sites take free store stock in site-id order, up to what each still needs.
- Free stock = store stock minus all reservations.
- A site still needs: cost − delivered − carried for it − already reserved.
- A reservation only ever takes stock nobody holds, so two sites cannot hold the same unit. Snapshot validation rejects reservations above store stock.

**What reserved stock is closed to:**
- the owner's `withdraw` (code `reserved`, "N wood is reserved for building; M free");
- `produce` recipes;
- the steward's fence wood (`expand_field` "the store has free 0");
- the herder's feed;
- the farmer's threshing.

**Hauling and building.**
- The builder takes only the site's own reserved stock, at most 8 per trip. The load carries a `site` tag, and the builder walks it to the site's front cell and delivers it.
- Work advances in 6-tick stints and is capped at `24 × delivered / cost`, so work follows the materials in.
- When work reaches 24 with all materials delivered, the site becomes `done`. It is then a solid `occupied` block on the walking grid: villagers route round it and the player collides with it (`SOLID.shelter`).

**Waiting and abandonment.**
- A site without stock waits, with a derived reason shown in the Farm panel, for example "waiting for 4 wood: none free in the store".
- Cancelling a site releases its reservation. A builder heading for it stops, and any load in hand is walked back to the store as ordinary stock.
- Reassigning a woodcutter frees the tree, and her load is walked to the store.

### Daily routine

This is unchanged rules, now with three settlers:
- they eat from the store at hunger 70;
- they sleep at night in three distinct beds, through the farmhouse door (which they open and close);
- they work by day.

### Presentation

- **Sites:** drawn inside the existing `homestead_troughs` mesh, so there is no new draw call. The stages are:
  1. stakes and a string line when planned;
  2. a log pile and fibre bundles for what has been delivered;
  3. a frame that rises with the work done;
  4. the finished woodshed, with posts, walls, a thatched roof and stacked timber.
- **Villager looks:** woodcutters wear a red shirt and a green cap; builders a tan shirt and a leather apron.
- **Carried loads:** one small mesh on each villager's torso, visible exactly while the sim says they carry wood, fibre or another item. That is at most 3 extra draws.
- **Frame order fix:** the homestead view now updates after the frame's settlement tick. In the first browser run, 2 of 183 samples showed the door leaf one frame behind the sim state; after the fix, 184 of 184 samples match.
- **Phone portrait:** the "Builder view" button now sits below the drawer tabs on the right, so it no longer covers the Settlement tab (the problem seen in `M009-banners/mobile-3-returned-home.png`). This is CSS only, and it was **not checked on a phone or in phone emulation**.

## Stage B tests (Node): `cd Game && npx tsc --noEmit && npm test && npm run build`

Typecheck is clean and the build passes. **294/294 tests pass**: the 279 from before plus 15 new tests in `tests/m012.work.test.ts`.

**Deliberate test change:** `m010.navigation` and `m012.living` used `rules: 4` as their example of an invalid value. It is valid now, so they use `rules: 5`.

New tests:
1. **Acceptance run** (420 ticks; Cora woodcutter, Ada builder, one approved woodshed), checked every tick:
   - every chosen tree is mature or old and in the woodlot; at least one is felled, and felled trees no longer block any grid cell;
   - full 8-wood loads are carried;
   - store wood rises only on a tick when the woodcutter's store leg ran at the store;
   - **wood is conserved every tick**: wood cut = store + barn + hands + site;
   - no villager moves more than 26 dm (walking speed) + 1 dm of integer rounding in a tick;
   - the builder delivers in at least 3 trips, and the woodshed is `done` with exactly 12 wood and 4 fibre in it;
   - reservations never exceed the store;
   - the door opens and closes as they pass.
2. The finished woodshed is blocked on the grid, `SOLID.shelter`, and stops the player (`structureHits`).
3. Daily routine: at night all three rest in three distinct beds, and meals came out of the store.
4. Reservations between two sites, with 14 wood in the store:
   - site 1 reserves 12 wood and site 2 only the remaining 2;
   - site 2 reads "waiting for a builder", then "waiting for 10 wood";
   - withdraw, steward fence and `produce seed` are refused for reserved stock;
   - site 2 never holds more than 2 wood, and site 1 is finished.
5. The herder never feeds reserved fibre: 12 fibre stays reserved for 3 sites over 150 hungry ticks, while free fibre is fed.
6. A tree being felled is reserved against the player's harvest. Saplings and young trees are never in the woodlot, and are untouched after 600 more ticks.
7. No clear-cutting: two woodcutters over 2,400 ticks (store emptied by the test) stop with at least 6 mature or old trees standing.
8. Abandonment:
   - reassigning the woodcutter frees the tree, and her 4 wood is walked to the store (conserved, delivered only at the store);
   - cancelling a site stops the builder and releases the reservation.
9. Unreachable site: with the door locked on the sleeping builder, she reports "the farmhouse door is locked", gives up openly, keeps the reservation, loses no wood, and never moves more than walking speed.
10. Save/reload mid-job (Cora mid-chop with wood in hand, the site started):
    - snapshot + journal restores the same hash and the same homestead snapshot (tasks, chop progress, carried load, reservations, site progress) and the same tree timber;
    - both sessions then run 150 ticks to the same hash, with the restored nav cache dropped;
    - invalid site bags and reservations above store stock are rejected.
11. v4 determinism: two runs, plus replay from genesis, give the same hash.
12. Old saves:
    - pinned v1/v2/v3 hashes; genesis; v3 restores byte-identical;
    - v3 refuses work roles, sites and the `builder` role in a snapshot;
    - v3 → v4 is one journaled upgrade (a second is refused), Cora arrives on a free cell, and restore and replay both reach the live hash;
    - v1 → v4 works directly.
13. Governance:
    - with *ask me first*, a steward `assign_role` builder is refused (`approval_required`); its proposal, once the owner approves it, makes Cora a builder;
    - with *may act*, the steward reassigns directly;
    - malformed new commands are `invalid_command`.
14. Three villagers never share a cell over 400 working ticks.
15. Render:
    - sites draw inside the existing mesh, so the mesh count is unchanged, with at least 3 drawn site stages;
    - each figure's role equals its sim role;
    - the drawn load equals the sim carry on every tick for 420 ticks.

## Stage B performance

**Sim (Node, seed 1337, generator v2, 900 ticks, whole `tick` command; `perf-b.ts` in this folder, run from a scratch folder beside the repo as `farm.ts` was):**

| | mean | p50 | p99 | max (after the first tick) |
|---|---|---|---|---|
| v3, no jobs | 0.65 ms | 0.50 ms | 2.42 ms | 6.0 ms |
| v4, woodcutter + builder + woodshed | 0.85 ms | 0.57 ms | 6.63 ms | 24.9 ms |

The v4 peaks are the woodcutter's tree choice. That is one Dijkstra search per trip, capped at 15,000 expansions; in total there were 138,643 expansions in 900 ticks (217 ms).

**Browser (Chromium, software GL, the probe run below):**
- `sections.tick` (the whole real-time tick including saving): mean **4.36 ms**, p95 6.7 ms, max 22.8 ms over 150 ticks.
- Villager stepping (`navStats`): 0.84 ms per tick.
- Render: at most **96 draw calls and 138,978 triangles** (budget 120 / 250k).

## Stage B browser: reproducible live job probe

**Script:** `13_Integration_and_QA/Evidence/M012-living-settlement/m012-jobs.probe.js`. It is a Playwright `async (page) => …` function, run with `browser_run_code_unsafe` and `filename`.
- `CFG.base` is the URL under test.
- Only `https://astrix.local/` is served from a local copy of `Game/dist` (`CFG.dist`). Any other base loads from the network.
- To point it at the live site, `node gen-jobs.mjs https://astrix.nyc.boxd.sh/ <out.js> live` writes a copy with that base and the prefix `live`. Run that file the same way.
- The probe writes `m012-<prefix>-results.json` (as a browser download, because the tool has no file API) and `<prefix>-*.png` into `CFG.out`.

**What it does:**
1. A fresh world: `?chain=0`, localStorage cleared on the first load only, `astrix:entered:v1 = 1`, builder view over the yard.
2. Through the **real Farm panel**, as journaled commands: Job selector Cora → woodcutter, Ada → builder, "Plan a woodshed", "Approve".
3. It samples `window.__metrics` once per settlement tick (one every 2 s of real time; there is no speed control for settlement time) until tick 196, which is after nightfall.
4. Mid-job it pauses (P), reloads the page and compares.
5. It evaluates the checks listed below.

**Run used for this report:** `Game/dist` from this build, byte-identical to `.kiro/artifacts/screenshots/probe/dist` (`diff -rq`), at `https://astrix.local/`. It took 406 s, ticks 4 → 196, 184 samples. **All 10 checks passed, with no page errors.**

| Check | Result (from `m012-jobs-results.json`) |
|---|---|
| Jobs assigned in the UI | Ada:builder, Bram:herder, Cora:woodcutter. The woodshed was approved with `{fiber: 4}` reserved (the store had no wood). |
| Woodcutter reaches a mature tree | At tick 20 Cora is working at (-22.5, 21.5), 2 m from mature tree `e:31,32:5` at (-22.5, 23.5). She was seen working at a tree in 24 samples. Every tree chosen was mature. |
| Tree yield decreases | `e:31,32:5`: 12→8 (t24), 8→4 (t28), 4→0 (t82, felled). `e:31,30:4`: 12→8→4→0 (t130/134/164). Fellable trees went 4 → 2; 8 mature or old trees are still standing. |
| Timber carried | Loads of up to 8 wood. The load is drawn on her shoulder in the samples. |
| Store wood only at the store | 4 rises, each equal to what Cora put down, and she was 0–0.5 m from the store spot each time: t54 0→8, t109 0→4, t148 0→8, t177 8→12. The builder picked reserved stock straight up after the first two. |
| Builder carries reserved materials | Loads of 4 fibre, 8 wood and 4 wood, all tagged for the site. Reservations seen: `{fiber:4}` → `{}` → `{wood:8}` → `{wood:4}`. |
| Site progress | 0 → 12 → 25 → 50 → 62 → 75 → 87 → 100 %. **Finished at tick 152.** |
| Reservations within the store | Yes, in every sample. |
| Gates and doors | 12 events, each open followed by a close one tick later: coop gate by Bram (t110/111, t121/122), pen gate by Bram (t161/162), farmhouse door by Ada (t174/175), Cora (t190/191) and Bram (t194/195). The drawn leaves matched the sim in 184/184 samples. |
| No teleport | Nobody moved more than 2.6 m per elapsed tick (+0.15 m). The worst case was 0.97 of the allowance (Cora, 5.2 m over 2 ticks). |
| Reload mid-job | Reloaded at tick 46 with Ada `build`, Cora carrying 8 wood (task `chop`, leg 2). After the reload: the same tick, the same state hash `1b1e7d844a3f4715`, 51 accepted commands, and identical villagers (positions, tasks, legs, loads), site and store. The work then continued. |

At the end (tick 196): the store held 12 wood, and all three villagers were resting in their own beds.

**Screenshots** (1000 × 600; builder-view side panels hidden for scene shots, a presentation-only CSS class):

| File | What it shows |
|---|---|
| `jobs-0-fresh-world.png` | The fresh yard. |
| `jobs-1-farm-panel-jobs.png` | The Job selectors, woodland counts, the approved woodshed with "reserved in store: 4 fiber", and the toast "Approved: 4 fiber reserved now; the rest as it comes in." |
| `jobs-2-woodcutter-chopping.png` | Cora chopping (tick 20). |
| `jobs-3-woodcutter-carrying.png` | Cora walking 8 wood to the store (tick 28). |
| `jobs-4-builder-hauling.png` | Ada carrying the reserved fibre. |
| `jobs-5-builder-building.png` | The site at 12 %. |
| `jobs-6-after-reload.png` | After the mid-job reload. |
| `jobs-7-woodshed-built.png` | The finished woodshed, right of the farmhouse. |
| `jobs-8-farm-panel-built.png` | The Farm panel after completion. |
| `jobs-9-night.png` | Nightfall. |
| `jobs-9-farm-panel-end.png` | The Farm panel at the end. |
| `jobs-fell-a-standing.png` / `jobs-fell-b-felled.png` | A separate short run with the camera on tree `e:31,32:5`, before and after Cora fells it at tick 82. `natureRebuilds` went 1 → 2 and nature instances 42 → 41: the trunk is gone. |

## Stage B: tests vs browser

- **Tests only:**
  - wood conservation on every tick;
  - two sites competing for the same stock;
  - withdraw, produce, fence and feed refused for reserved stock;
  - the player's harvest refused on a reserved tree;
  - the minimum number of standing trees;
  - saplings never chosen over a long run;
  - abandonment and cancel;
  - the locked-door give-up;
  - player collision with the finished woodshed;
  - replay determinism and pinned old hashes;
  - the steward's policy path.
- **Browser (local build only):** UI assignment and approval, positions over time, felling, the store leg, reserved hauling, site progress to completion, gate and door events, no teleport, reload continuity, render budget and tick cost, and the felled tree disappearing.
- **Not run:** the probe against `https://astrix.nyc.boxd.sh/`, because this build is not deployed. A real phone, and phone emulation for the button fix.

## Stage B: not done / limits

- **One building kind (woodshed).** It is a real solid building, but it has no gameplay function beyond that: no extra storage capacity.
- **Sites are placed by the "Plan a woodshed" spot search**, not by free placement in front of the player.
- **No steward policy for building.** Only the owner places and approves sites; the steward only staffs them through **Reassign jobs**.
- **The woodlot is small** around this seed's homestead: 4 natural mature trees inside the window, with the authored grove kept. After felling down to the 6-tree minimum, woodcutters idle, with a reason in the panel. Trees do not regrow and there is no replanting.
- **The Settlement panel's withdraw form** does not show reserved amounts. The sim refuses the withdrawal with the reason shown, and the Farm panel shows reservations.
- **Delivered materials on an unfinished site** cannot be taken back (cancel is refused once anything is delivered).
- **Builders and woodcutters do not avoid animals,** and villagers do not treat the player as an obstacle. This is unchanged from Stage A.
- **Night interruption:** only felling and walking to a tree stop at nightfall. A haul or build stint already underway finishes first.
- **Phone-portrait mode-button fix:** not checked on any phone or emulator.
