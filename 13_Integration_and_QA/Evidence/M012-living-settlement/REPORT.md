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
