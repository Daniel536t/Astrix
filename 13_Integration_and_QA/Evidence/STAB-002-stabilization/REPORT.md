# STAB-002 · Stabilization (settlement rules v7)

Repo `Astrix`, branch `deploy/boxd`. Base commit `4169c21` (STAB-001 docs). Not pushed or deployed. Everything below was measured headlessly or in an emulated desktop browser (Playwright Chromium). **No real phone or tablet was used.**

S1, S2, S3 and S4 (villager speed) are in this report, followed by the STAB-002 acceptance summary.

## S1 · Animal unstick

### What changed

Everything new is behind **settlement rules v7** (`HOMESTEAD_HERD_VERSION = 7` in `Game/src/sim/homestead.ts`). A new homestead is founded with `found_homestead { rules: 7 }`. Old homesteads switch with one journaled `upgrade_homestead { rules: 7 }`, which `app/homestead.ts ensureFounded` sends on load, the same way v6 was applied. Rules v1 to v6 run exactly the code they ran before.

1. **Valid cells only.** `penCells()` lists each enclosure's free walk cells: cells whose centre is inside the fence and which nothing blocks. It splits them into areas an animal can walk between using the animals' own moves (`canMove`, gates as fences). The largest area is the enclosure's **main area**. Under v7, three things come only from main-area cells: founding positions (placed after the plots are cleared), herder drive-home targets, and wander targets. Graze spots come from main-area cells with grass on top. A newborn starts at its mother's spot if that cell is in the main area. Otherwise it starts at the nearest main-area cell, searched ring by ring in a fixed order.
2. **Walk out, never jump.** Every v7 tick, `herdAnimal` first calls `escapeRoute()`. If the animal's cell is blocked, or is inside the enclosure but cut off from the main area, the function runs a breadth-first search to the nearest cell the animal should be on. The animal then steps along that route at walking speed, 0.7 m a tick. Fences and closed gates always hold. **The minimal correction for cells with literally no exit** (the STAB-001 `#` cells) is a fixed sequence of tiers. The first tier that finds a route is used:
   1. normal moves only;
   2. cells of the footprint the animal stands in, and of its enclosure's shelters and trough, count as walkable (an animal walks out from under the shelter roof);
   3. any blocked cell inside its own enclosure counts as walkable.

   This is implemented by a new `pass` search option in `sim/nav.ts`, which nothing else uses. The same check covers the v7 upgrade tick, so trapped animals walk out on the following ticks. It also covers anything built under an animal later.
3. **One arrival rule.** `walkTo()` treats an empty route as arrival. An empty route means the animal's cell already satisfies the goal's reach (7 dm for spot targets, which are cell centres; 12 dm for the trough). The animal then steps onto the goal point if that point lies in its own cell, and goes idle. The 7 dm / 8 dm dead band is gone.
4. **Behaviour states, recorded in the sim.** Each animal has `act` (`wander`, `graze`, `drink` or `rest`) and `until`. For graze and drink, `until` is 0 while the animal walks to the spot, then the tick the bout ends. For rest it is the tick the animal gets up. Both fields are in the snapshot and the hash, and validation accepts them only under v7. Timings are in `HERD_RULES`:
   - **Graze:** 6 to 14 ticks, head down, at a grass cell.
   - **Drink:** 2 to 4 ticks at a cell next to the trough.
   - **Day rest:** 10 to 25 ticks, at a 3 % chance per idle tick.
   - **Night rest:** 60 to 110 ticks, at a 45 % chance per idle tick, ending at dawn at the latest.
   - **Waking:** a resting animal gets up when its hunger reaches 70.
   - **Meals:** an animal goes for a meal from hunger 50. It grazes the pasture and then drinks at the trough, or eats and drinks at the trough when the pasture is bare. A meal is still 60 hunger plus `graze` grass or `feed` feed, and 1 water, as under v3.
   - **Day choices:** each idle tick, 25 % walk, 8 % casual graze, 3 % rest; otherwise the animal stands for that tick.

   Strays outside the pen graze where they stand. Gate runs and drives home work as under v3.
   - `__metrics.homestead.herd[]` gains `act` and `until`.
   - `__metrics.homestead.herdTime` counts ticks per state, moved ticks and daytime ticks, in total and per animal. It is counted in `app/herd-time.ts`, on the presentation side and not hashed.
5. **Renderer (presentation only).** Under v7, `render/homestead.ts` takes the pose from the sim state. The head goes down while a graze or drink bout runs and the animal is not walking, and the animal lies down while `act === 'rest'`. Under v1 to v6 the old poses are kept: head down for 1.8 s after a meal, lying at night.
6. **Upgrade keeps the farm.** Before this change, `upgradeHomestead` re-applied the v6 step on any upgrade to 6 or higher: rotation reset to 0, timber store stock emptied, and the settler check run again. Under v7 an earlier step is applied only when the homestead has not had it yet. Upgrades to v2 to v6 run unchanged, to keep their recorded hashes. The v7 step changes only one thing: each animal gets `act = 'wander'`, and animals that are not mid-run get their target set to their own position. No position, need, id or count changes.

Files changed:
- `Game/src/sim/homestead.ts`, `Game/src/sim/nav.ts`, `Game/src/app/session.ts`, `Game/src/app/homestead.ts`, `Game/src/render/homestead.ts`
- new: `Game/src/app/herd-time.ts`
- Tests:
  - new: `Game/tests/stab002.s1.test.ts`, `Game/tests/stab002.s1-accept-a.test.ts`, `Game/tests/stab002.s1-accept-b.test.ts`, `Game/tests/stab002-accept.ts` (shared measurement), `Game/tests/fixtures/stab002-v6-save.json` (a v6 save written by the `4169c21` code)
  - edited: `m010.navigation.test.ts` and `m012.living.test.ts`. They now use rules 8 as the invalid example, because 7 is valid.
- Regenerated: `Game/dist`, `Game/tests/.build`.

### Pinned hashes

| rules | scenario | hash |
|---|---|---|
| genesis | `GameSession.genesis(1337)` | `e659504b056654dc` |
| v1 | M012 run | `16ca4c350d98096f` |
| v2 | M012 run | `542411888c83bf3a` |
| v3 | M012 run | `d2c28283712a8de7` |
| v4 | M014 reference run | `6ce5ae532227eeb9` |
| v5 | M014 reference run | `f249cb544027b9bd` |
| **v6** | **M014 reference run, measured on `4169c21` before any change** | **`037429c4ffbcf710`** |

All of these are asserted after the change: in `stab002.s1.test.ts` and in the existing m010, m012, m013 and m014 tests. The v6 save fixture restores with hash `037429c4ffbcf710` and `JSON.stringify(snapshot)` byte-identical.

### Acceptance, headless (tests and scratch survey)

Method:
- 15 seeds: 1 to 10, 42, 1337, 2024, 31337, 99999.
- 3 in-game days (900 ticks) measured. For upgrades, the homestead first runs 600 ticks under the old rules, then gets the journaled upgrade, then is measured for 900 ticks.
- **Frozen:** 0 moves among animals observed for at least 100 ticks.
- **Daytime share:** moved daytime ticks divided by daytime ticks, for animals with at least 100 daytime ticks.
- **Longest daytime still stretch:** night ticks end a stretch. Rest ticks neither count nor end a stretch (the stricter reading). If rest ticks end a stretch instead, the maximum never exceeds the strict value.

`stab002.s1-accept-a/b.test.ts` assert every criterion per seed. The table comes from the scratch survey `s1/s1.ts`, which uses the same rules and window.

| scenario | animals at end (15 seeds) | frozen | seeds with frozen | on blocked cell at end | moving, all ticks | min daytime share (any animal) | per-seed median daytime share | longest daytime still (max) | animals < 15 % by day | animals > 80 ticks still |
|---|---|---|---|---|---|---|---|---|---|---|
| fresh v6 (before) | 407 | **31** | 11 | 34 | 12.7 % | 0 % | 10.2–15.0 % | 180 (a whole day) | 228 | 260 |
| **fresh v7** | 384 | **0** | 0 | 0 | 32.8 % | **29.1 %** | 47.7–54.5 % | **36** | 0 | 0 |
| v2 → v6 (before) | 478 | 43 | 12 | 43 | 12.4 % | 0 % | 10.7–14.8 % | 180 | 300 | 366 |
| **v2 → v7** | 486 | **0** | 0 | 0 | 32.7 % | **28.6 %** | 47.0–51.9 % | **39** | 0 | 0 |
| v5 → v6 (before) | 481 | 42 | 11 | 42 | 12.0 % | 0 % | 8.7–13.4 % | 180 | 313 | 379 |
| **v5 → v7** | 481 | **0** | 0 | 0 | 32.6 % | **29.3 %** | 47.6–51.5 % | **31** | 0 | 0 |
| **v6 → v7** | 481 | **0** | 0 | 0 | 32.6 % | **29.3 %** | 47.6–51.5 % | **31** | 0 | 0 |

The v5 → v7 and v6 → v7 rows are identical. Over the 600 pre-ticks, v5 and v6 animals behave the same, because the scenario uses no v6-only command.

Other v1 → v7, v3 → v7 and v4 → v7 runs (scratch survey only, 15 seeds each):
- 0 frozen in every case;
- minimum daytime share 23.5 %, 24.9 % and 28.1 %;
- longest daytime still stretch 35, 36 and 49 ticks.

Against STAB-001 (seed 1337, fresh v6): 7 frozen animals, 12.8 % moving, median longest still stretch 136 ticks. Fresh v7 on the same seed: 0 frozen, 33.3 % moving, longest daytime still stretch 30 ticks.

Time per state, fresh v7, mean over 15 seeds: wander 29.2 %, graze 24.3 %, drink 5.5 %, rest 40.9 %. Most rest is at night: night is 40 % of a day.

Other checks:
- **No teleport:** the largest step between ticks was 7.6 dm in every v7 run. Animals walk at 7 dm a tick and are driven at 12.
- **Escape speed:** after the v6 → v7 upgrade of the fixture save, the trapped animals were on normal cells within 12 ticks (asserted). The seed-1337 sow on the no-exit cell (-18,-4) walks out through the sty shelter cells, one step a tick, and is free within 10 ticks (asserted).
- **Needs:**
  - 0 starving ticks in any v7 run.
  - Water: lowest trough level 7 (fresh) and 1 to 2 (upgrades), against 4 to 5 under v6. Troughs never ran dry.
  - Over 15 seeds × 900 ticks: meals 1,686 (v7) vs 1,737 (v6), −3 %; water used 1,658 vs 1,735, −4 %; time with hunger < 50 at 82.2 % vs 82.6 %; pregnancies 181 vs 196, −8 %; births 159 vs 182, −13 %.
  - Births have a 1/400 chance per eligible tick, so these counts are noisy. Births are the one figure outside ±10 % of v6. It was not tuned further.
- **Performance, seed 1337, 900 ticks:** v7 0.35–0.47 ms per tick against v6 0.33–0.53. Route searches per tick fell from 9.8 to 6.3, and expansions per tick are about the same (58 vs 57).

### Tests (separate from the browser)

`cd Game && npx tsc --noEmit && npm test && npm run build`: typecheck clean, **362 tests pass** (348 before, plus 14 new), build OK.

`stab002.s1.test.ts`:
1. v1 to v6 hashes and genesis; no v7 fields under v6.
2. The v6 save from `4169c21` restores byte-identical with `037429c4ffbcf710`, and the replayed journal gives the same hash. v6 rejects `act` and `until`.
3. v7 founding on 15 seeds: every starter is on a main-area cell. v6 has trapped starters on the same seeds.
4. v7 births: a sow placed on a no-exit shelter cell gives birth to 2 piglets on main-area cells. Every birth over 3 days on 3 seeds starts on a free cell.
5. Escape: the walk-out route crosses only shelter cells, takes at most 0.75 m per tick, is out within 10 ticks, and the animal moves on afterwards.
6. Dead band: a target 8 dm away in the next cell is reached in 2 ticks, after which the animal is idle. An empty route is an arrival in the same tick. Under v6 the same setup stays parked.
7. States: grazing bouts stand on grass cells, and drinks stand next to the trough. Every animal grazes, rests and wanders. Night rests last more than twice as long as day rests. `HerdTime` counts every state, with no `none`. No starvation.
8. v7 save and reload mid-run: the same snapshot bytes, and after 300 more ticks the same hash and the same animals. Validation of `act` and `until` is strict.
9. v6 save → v7: one journaled upgrade that can be sent only once. The homestead snapshot is unchanged apart from the rules number and the animals' `act`, `until`, `tx` and `tz`. Store and bag are unchanged. Trapped animals walk out with no jumps. Reload after the upgrade gives the same hash for 200 more ticks.
10. v6 → v7 keeps a timber store's stock and a site's rotation. The old code emptied the stock and reset the rotation.

`stab002.s1-accept-a.test.ts` (fresh v7, v2 → v7) and `stab002.s1-accept-b.test.ts` (v5 → v7, v6 → v7) cover 15 seeds × 3 days and assert, per seed:
- 0 frozen;
- every animal moving in at least 15 % of daytime ticks;
- longest daytime still stretch, rest excluded, at most 80 ticks;
- every full-window animal grazes and rests;
- a restore at mid-window plays the second half to the same hash and the same herd.

### Browser (separate from the tests; emulated desktop Chromium, not a phone)

`Game/dist` from this build was copied to `.kiro/artifacts/screenshots/probe/dist` and served as `https://astrix.local/`. Storage was fresh, with `astrix:entered:v1 = 1`. The probe scripts are in `s1/`.

| probe | setup | sim ticks sampled | frozen | min share of ticks moving (any animal) | drawn lying vs sim `rest` | drawn head-down vs sim graze/drink bout | reload |
|---|---|---|---|---|---|---|---|
| A `stab002-s1-a.js` | `?chain=0`, fresh v7, 240 s at 500 ms | 1–148 (day) | 0 of 15 | 19.0 % | 964 matches, 0 mismatches | 1,304 head-down / 359 head-up (see note) | `restored`, hash `46b3f5e7ebe099e7` before and after (151 commands) |
| B `stab002-s1-b.js` | default chain-on (no `chain` param), fresh v7, 150 s | 1–93 (day) | 0 of 15 | 12.0 % (goat 008, which rested 55 of 92 ticks) | 655 matches, 0 mismatches | not measured (metric too strict, see D) | `restored`, hash `db9ea97ed99cac95` before and after (95 commands) |
| D `stab002-s1-d.js` | `?chain=0`, 90 s, refined pose check | 1–55 | 0 | – | 476 matches, 0 mismatches | **329 head-down / 0 head-up** | `restored`, hash `b7ebb2f782f191c3` before and after |
| C `stab002-s1-c2.js` | v6 save made in the browser by the old build (`dist` of `4169c21`), then the v7 build on the same storage | v6: 30 ticks; v7: ticks 31–103 | 0 of 15 | 34.7 % | 0 mismatches | – | see below |

**Probe C, the v6 save upgraded to v7 in the browser:**
- **Before:** the old build founded v6 and ran 30 ticks (hash `ed43cb6d7c70888a`, 31 commands). It had 15 animals, 3 villagers (farmer, herder, farmer), stock `fiber 20, food 10, seed 6`, and troughs at 30.
- **Upgrade:** the v7 build restored the save and journaled `upgrade_homestead { rules: 7 }` as entry 32, at tick 31, with outcome `version 7`.
- **After:**
  - All 15 animal ids were kept.
  - 12 of 15 were at exactly the place last read from the v6 page; the read was one tick before the save closed.
  - The STAB-001 trapped animals moved in 56.9 % (`animal:001`), 58.3 % (`animal:009`) and 66.7 % (`animal:014`) of the sampled ticks. Under v6 each of them had 0 moves.
  - The largest step was 0.73 m per tick.

Notes on the browser measurements:
- **Head-up count in probe A.** Probe A counted a bout from its first sample. During the arrival tick the drawn animal is still finishing its last step, and a chicken's pecking pitch dips below the 0.5 threshold. Probe D counts only non-chicken animals that have stood still for at least 2 ticks of a running bout. On that measure the head was down every time (329/329).
- **Short browser windows.** In probe B one goat moved in 12 % of 92 sampled ticks, because it rested for 55 of them. The ≥ 15 % criterion is defined over 3 in-game days and is met there (minimum 28.6 to 29.3 %, table above). Day rests are part of that measure.
- **Night not sampled.** The browser windows covered daytime only (ticks 1–148). Night rest was measured headlessly (test 7).

Screenshots, all in `s1/`, all 1200×700:

| file | tick | sim states at the shot |
|---|---|---|
| `stab002-s1-fresh-2.png` | 32 | grazing (head down): chicken 001, sheep 005, cattle 011 and 012; resting (lying): goats 007 and 008, horse 013 |
| `stab002-s1-fresh-4.png` | 57 | grazing: goats 007 and 008, pigs 009 and 010, cattle 012, horse 013; resting: cattle 011 |
| `stab002-s1-chain-1.png` | 25, chain-on | 5 grazing, 3 resting |
| `stab002-s1-v6-before.png` and `stab002-s1-v6-upgraded.png` | – | the same farm under the old build at v6, and under the v7 build after the upgrade |

### Not met, or open

- **Births are 13 % lower than v6** (159 vs 182 over 15 seeds × 3 days). Pregnancies are −8 %. These counts are noisy. Meals, water and the time spent below hunger 50 are within 4 %.
- **Trough water runs lower** in the upgraded runs (lowest level 1 to 2 against 4 under v6). The troughs never ran dry.
- **Herder behaviour is unchanged.** Animal–player and animal–animal collision is S2.
- **There is no "react" state.** It was not in this step's scope.
- **The S1 tests add about 50 s** to `npm test`: two acceptance files of about 50 s each, which run in parallel with the other files.
- **No real device** was used. Night rest was not observed in the browser.

### Reproduce

From `Game/`:
- `npm test`
- `npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s1/s1.ts --bundle --platform=node --format=esm --external:three --outfile=/tmp/s1.mjs`, then `node /tmp/s1.mjs fresh:7 15` or `node /tmp/s1.mjs up:6:7 15`. The scratch scripts import `../../../Astrix/Game/src`, so they run unchanged from `/projects/sandbox/.tools/scratch/stab-s1/`; elsewhere, adjust that import path.
- Browser: build, copy `dist` to `.kiro/artifacts/screenshots/probe/dist`, then run a probe script with Playwright `browser_run_code_unsafe { filename }`.

## S2 · Bodies and presence

Base commit `cd0aff6` (S1). Not pushed or deployed. **No real phone or tablet was used.** Design A from `Diagnostics/STAB-001/BUG-B_player_animal_collision.md`, with the deviations listed under "Not met, or open".

### What changed

Everything new in the simulation is under **settlement rules v7**. No new rules version was added. Rules v1 to v6 never read presence, and a v7 journal without presence replays exactly as it did under S1.

1. **Presence on the tick (journal).**
   - `tick` gains an optional `presence: { x, z, mx, mz }`. `x` and `z` are integer decimetres within ±2 km. `mx` and `mz` are −1, 0 or 1. Validation is strict: no other keys are allowed, and any bad value rejects the command.
   - `playerPresence()` in `sim/homestead.ts` builds it. The app sends it only under v7, only while the founder is walking (alive, not swimming), on the settlement grid, with feet within 1.5 m of the grid ground.
   - The motion signs come from the move the founder is asking for (stick or keys), or from the velocity when there is no input. A founder pushing against something still says which way they want to go.
   - Presence is input, not state. It is never in the snapshot. It is sent with every realtime tick, one every 2 s; there is no "only when changed" mode. Size is measured below.
2. **Shared occupancy (sim).** At the start of a v7 tick with presence, the 1 to 4 cells the founder's disc covers go into the villagers' occupancy map under the id `player`.
   - **Villagers** route round those cells. They queue with the reason "waiting for you to pass" or "queueing at the farmhouse door behind you". After `NAV_GIVE_UP` (15) ticks they give up openly, as with a blocked route.
   - A villager never walks closer than 0.6 m to the presence point. Moves are clipped by `NavContext.clip`.
   - A founder walking toward a villager in a doorway counts as a head-on meeting, and the villager steps aside. An idle villager within 1.5 m of a founder walking at it also steps aside.
   - **Gates:** no gate is closed while the founder stands in one of its cells (`keepOpen` in `closeBehind`). A herder holding a gate holds up to 15 ticks longer, then leaves it open and logs "left the pen gate open: you are standing in it".
3. **Animals (sim, `herdAnimal`).** Each species has distances, computed in `sim/bodies.ts` from the body table:
   - `keep`: the whole body at any heading plus the founder's radius. Cattle 18 dm, horse 20, sheep 12, goat 14, pig 14, chicken 7.
   - `ring = keep + 7`.
   - `clear`: at least 2 m.

   The rules:
   - **Step aside.** An animal inside its ring steps to the neighbour cell (at most 10 dm per tick) that ends farthest from the founder plus its distance off the founder's line of travel. The cell must be free and reachable by the animal's own moves, with no gate crossing. It must be on the same side of the fence, and inside the pen it must be in the main area. The step must end farther from the founder than it started. An animal on its way somewhere never steps back from its target, and it keeps that target.
   - **Routes.** Routes avoid the founder's cells and every cell whose centre is inside the ring. Every step is clipped so that it never comes closer than `keep`. A goal at the founder fails without a search.
   - **Targets.** No new walk, graze or home target within `clear`: up to 3 more draws are tried, otherwise the animal stands this tick.
   - **Cornered.** A cornered animal (no step takes it farther) carries on where it stands. While the founder stands still it may walk past them at `pass`: the side distance plus 2 dm, plus half the nose distance for cattle and horses.
   - **Strays and drives.** These wait outside when the founder blocks the gate. A home spot that lands at the founder is redrawn.
   - **Cost.** A search that runs out of budget with the ring in the way counts as a failure, so the animal chooses again instead of waiting forever.
4. **Founder contact (player-local physics, `stepCharacter(…, bodies)`).** This works like the existing voxel, fence and trunk collision. The capsules come from sim state, not from the rendered meshes:
   - `HomesteadBodies` blends each animal's and villager's positions from the last two ticks, starting from where they were shown, as the renderer does.
   - Wildlife capsules are the creature records.
   - Body sizes (`FARM_BODIES`, `WILD_BODIES`) were measured from `render/animal-models.ts`.

   The rules:
   - A move into a body stops at the contact point.
   - A move that keeps or reduces the overlap is always allowed.
   - An overlap is pushed out at up to 1.5 m/s, only to free positions, along the normal or its x/z parts, and only if the deepest overlap goes down.
   - **Squeeze** (not in the design): after 2.5 s of pressing against bodies without getting anywhere, the founder may go up to 0.12 m into a body and push-out waits. Without this a founder could stand blocked indefinitely by animals cornered in a dead end, such as the sty's 1 m gate corridor.
   - **Turning (renderer and capsules).** v7 animals turn at a rate where the body's ends sweep at most 1.2 m/s (`turnRate`). Before this, a sideways yield swung a horse's head 0.38 m into the founder.
5. **Wildlife.** `stepCreature` rejects any step that ends within the creature's whole length plus 0.3 m of a person while getting closer. Fleeing already prevents this in normal play.
6. **Metrics.**
   - `__metrics.explore.contact`: capsule count, nearest gap, the deepest overlap and where it happened, held time, and per-frame cost of building the capsules and of the steps.
   - `__metrics.realtime.presence`: the presence sent with the latest tick.

Files:
- new: `Game/src/sim/bodies.ts`
- changed: `sim/homestead.ts`, `sim/nav.ts`, `sim/character.ts`, `sim/fauna.ts`, `app/session.ts`, `app/life.ts`, `app/explore.ts`, `main.ts`, `render/homestead.ts`, `render/fauna.ts`
- tests: `Game/tests/stab002.s2.test.ts` (10), `stab002.s2-contact.test.ts` (9), `stab002-s2-harness.ts`
- evidence: `s2/` (probe scripts, `s2-repro.ts` and its output, screenshots)
- regenerated: `Game/dist`, `Game/tests/.build`

### Tests (headless; separate from the browser)

`cd Game && npx tsc --noEmit && npm test && npm run build`: typecheck clean, **381 tests pass** (362 before, plus 19), build OK.

Pins:
- v1 to v6 and genesis unchanged (S1 tests).
- The M014 reference run with presence on every tick gives v6 `037429c4ffbcf710` and v5 `f249cb544027b9bd`.
- v7 without presence equals S1, measured on `cd0aff6` before S2: reference run `f849279d086aa120`; 900-tick fresh runs on seeds 1, 42, 1337 and 2024: `0a9011b2db7e9b63`, `a4837164213ddc3b`, `69c99cab31257384`, `d3c8cd112e45a006`.
- The v6 save fixture still restores byte-identical (S1 test).
- A journal with presence replays to the same hash. A mid-run save restores and plays on identically.

Founder walking at each species on the farm: capsules from sim state, presence on the ticks, 6 s per run.

| species | min gap, 60 fps | min gap, fixed 1/30 s | min centre distance | sum of radii |
|---|---|---|---|---|
| cattle | 0.000 m | −0.015 m | 0.77 m | 0.76 m |
| horse | 0.000 | −0.020 | 0.64 | 0.62 |
| sheep | 0.000 | −0.003 | 0.73 | 0.72 |
| goat | 0.000 | −0.001 | 0.57 | 0.56 |
| pig | 0.000 | 0.000 | 0.66 | 0.65 |
| chicken | 0.000 | 0.000 | 0.60 | 0.50 |

On static capsules on a flat pad, covering all six farm species, four wildlife species and villagers, walking and running, at 60 fps and at the fixed 1/30 s step, the minimum gap is ≥ −0.02 m and the founder never gets deeper from one step to the next.

Against the STAB-001 reproduction (`s2/s2-repro.txt`, same stretch, seed 1337):

| case | STAB-001 (v6) | S2 (v7) |
|---|---|---|
| founder walks at the cow for 2 s | min centre distance **0.06 m**, ended 5.2 m past the cow | min centre distance **2.37 m** (the cow's length points at the founder), capsule gap 0.000 m, **did not pass** |
| cow walks at the standing founder | d = 0.80 → **0.10 m**, walked through | **stopped**; minimum 1.89 m, capsule gap 0.000 m after placement |
| 600 ticks: extra animals sharing a 1 m cell | **1,106** | 598 without presence; **1,113** with the founder standing in the paddock (animals bunch away from them); 0 animal-ticks in the founder's cells |
| animal pairs < 0.5 m (animal-ticks) | 1,307 | 527 without presence; 1,172 with the founder standing in the paddock |

Other measurements:
- **Animal walking into the standing founder:**
  - The cow stops at 2.50 m.
  - The horse detours past at 1.94 m in the sim (keep 2.0 m); drawn gap +0.043 m.
  - Sheep and goat detour at 2.18 m.
  - The founder is never shoved more than 0.3 m.
- **Standing in each pen for 100 ticks:** animals step aside. There are 0 re-entries into the ring and 0 moves closer while inside it. Every move passes the grid check, and no animal changes side of a fence.
- **Crowded pens at capacity, founder in a corner for 300 ticks:**
  - 0 animals in the founder's cells; 0 starving; 0 re-entries; 0 animals held inside `keep` for more than one tick.
  - Walking out through the gate, the longest time held against animals was 2.00 s (coop), 0.72 s (pen), 2.52 s (sty) and 2.52 s (paddock).
  - The deepest overlap was −0.12 m (squeeze) in the sty and the paddock.
- **Villagers at the farmhouse door:**
  - None ever entered the founder's cells or came within 0.6 m.
  - The wait reason was "queueing at the farmhouse door behind you".
  - They gave up after exactly 15 ticks, with the reason kept and validated in the save.
  - If the founder steps away after 5 ticks, they go in.
- **Gate:** with the founder in the pen gate, no animal entered the gate cells and the gate was never shut on the founder. The herder left the gate open after the bounded hold. The drives finished after the founder left.
- **Wildlife:** a stalking fox, a following wolf, and a wandering deer and hare stay at least their keep distance from the founder. Without the founder, the same fox crosses the spot.
- **Cost:**
  - `stepCharacter` with 120 bodies: 7.99 → 8.98 µs per step (Node).
  - 600 ticks with a founder walking the pens: search expansions 28,682 → 35,230 (+23 %); time 0.35 → 0.36 ms per tick in the scratch run, 181 → 226 ms per 600 ticks in the test run (noisy).

### Journal growth

| measured | without presence | with presence |
|---|---|---|
| headless, bytes per tick entry | 235 B | 279 B (+43.9 B) |
| presence growth per minute (one tick every 2 s) | – | **+1.29 KB/min** (+19 %) |
| browser, bytes per tick entry | – | 278–280 B (presence on 100 % of ticks) |
| browser, whole save | – | 8.9–9.1 KB/min |

Compaction is unchanged (at 400 entries).

### Browser (separate from the tests; emulated desktop Chromium, not a phone)

Setup:
- `Game/dist` was copied to `.kiro/artifacts/screenshots/probe/dist` and served as `https://astrix.local/`.
- Storage was fresh, with `astrix:entered:v1 = 1`.
- Scripts: `s2/stab002-s2-chain0.js` and `s2/stab002-s2-chainon.js`.
- The founder walks with W/A/S/D, steered from the camera direction. Gates are opened with E.
- The gap is from `__metrics.explore.contact` (sim-derived capsules). The drawn centre distance is to the drawn herd instance.

| segment | `?chain=0`: min gap | drawn centre / sum of radii | chain-on: min gap | drawn centre / sum of radii |
|---|---|---|---|---|
| cow, paddock (gate opened with E) | 0.000 m | 0.907 / 0.76 m | 0.000 m | 0.902 / 0.76 m |
| horse | 0.000 | 0.778 / 0.62 | 0.000 | 0.819 / 0.62 |
| sheep, pen | 0.000 | 0.710 / 0.72 | 0.000 | 0.769 / 0.72 |
| standing in the pen, 24 s (12 ticks) | +0.084; 0 ring re-entries, 0 approaches | – | +0.079; 0 re-entries, 0 approaches | – |
| chicken, coop | 0.000 (sampled) | see "Not met" | **−0.172** | see "Not met" |
| villager | 0.000; drawn figure vs capsule median −0.004, min −0.171 m | – | 0.000; median −0.019, min −0.16 m | – |
| whole run (all frames) | **−0.141 m** (chicken, coop) | – | **−0.403 m** (chicken, coop) | – |
| longest held | 1.5 s | – | 2.0 s | – |
| reload, same save with `freeze=1` | `6abd3921a5c861c4` = `6abd3921a5c861c4` (97 commands), `restored` | – | `5bb59d20143c7baf` = same (98), `restored` | – |

Performance in the browser:
- Draw calls at the farm: median 72–77 (`chain=0`) and 71–80 (chain-on). Triangles: 144–164 k.
- Contact cost per frame: building the capsules 0.03–0.06 ms (max 0.7 ms); the frame's fixed steps including contact 0.08–0.15 ms.

Screenshots in `s2/`, 1200×700: `stab002-s2-{chain0,chainon}-{cow,horse,pen,villager}.png`. The cow shot shows the founder stopped against the cow's flank.

### Not met, or open

- ~~Chicken overlap in the coop (browser only).~~ **Fixed**, see "Fix: bodies below the feet (coop chicken overlap)" below. Both browser runs had recorded one episode with a chicken, 0.14 m (`chain=0`) and 0.40 m (chain-on), each with the founder's feet 0.32 m above the chicken's ground.
- **Squeeze is a deviation from "refuse moves that go deeper".** After 2.5 s of pressing, the founder may go 0.12 m into a body. It never passes through one, and centre distance stays ≥ the sum of radii − 0.12 m.
- **Drawn villager figures lead their capsules** by up to 0.17 m for about a second after a tick that comes early (the clock catching up). The median is 0.00–0.02 m. Animals did not show this.
- **Animal–animal separation is not part of S2.** Shared cells are 598 per 600 ticks without the founder and 1,113 with the founder standing in the paddock, against 1,106 in STAB-001.
- **Gates left open.** A herder who cannot shut a gate because the founder stands in it leaves it open. Animals may then wander out until the owner closes it.
- **Cornered cattle and horses stay put while the founder is moving.** Pass mode only applies while the founder stands still.
- **Presence is sent with every tick,** not only when it changes. That adds about 1.3 KB/min. Search expansions are +23 % when the founder walks the pens.
- **Not tested in the browser:** standing in a gate, and villagers queueing at the door. Both are covered headless only. No real device was used.

### Fix: bodies below the feet (coop chicken overlap)

Not pushed or deployed. Base commit `863f0f7`.

**Cause (real, not a probe artefact).** The coop has a 1 m terrain step inside it: the cells at x ≥ −33 (z ≤ −1) are at ground 13, the rest at 12. The earlier headless coop runs used a flat stretch, so they never crossed it. The contact rule tested a body only while it shared height with the founder's feet (`bodyLevel`: feet below the body's top). Three things followed:
- A founder on the upper level (feet 13.0) is above a hen's top (12.75). The hen at the foot of the step was ignored, and the founder walked out over it.
- The fall off the step was never tested against bodies. The founder dropped straight into the hen and became "level" with it part-way down. That is the recorded episode: feet 12.32 against the hen's ground 12.0, 0.14 m and 0.40 m deep, then pushed out at 1.5 m/s.
- A capsule's height came from the ground under its centre only. A hen whose centre crossed the step rose by 1 m in one frame, and a founder above it was suddenly inside it.

The probe's nearest-instance matching was not the cause. The recorded overlap comes from the founder's own sim-derived capsules (`__metrics.explore.contact`), and it reproduces headless (below).

**Fix (player-local physics only; no sim, rules or hash change).** `sim/character.ts` and `sim/bodies.ts`:
1. A standing founder whose feet are above a body's top by less than an animal's 1 m step (`MAX_STEP`) collides with it as if level (`bodyUnderStep`). The animal could step up into the founder in one move, so the founder does not stand over it either. Push-out and the squeeze timer use the same test.
2. A horizontal move without support under it (off a step or a ledge, or in the air) is also tested against the bodies below the feet that the founder would come down into, down to the landing height (`supported`, `landingY`). From a ledge the drop waits until the body is clear. In the air, or standing on a body, an existing overlap may only shrink.
3. A fall onto a body the feet were above rests on its top (`landingOnBody`). It never sinks into it. Push-out then slides the founder off.
4. Capsules from sim state span the ground under the whole capsule (`groundSpan`): feet at the lowest column, top at the highest plus the body's height. An animal across the step is on both levels. Villagers use the same span.
5. The founder still passes over an animal while the feet stay at least 1 m above its top, for example along a 2 m ledge (tested).
6. Metrics: `__metrics.explore.contact.minGapById` (smallest gap per body over all frames) and `squeezeGapById` (the same, for frames after 2.5 s of pressing, when the squeeze is allowed).

**Headless.**
- `s2/s2fix-step-repro.ts` (output `s2/s2fix-step-repro.txt`): the founder on the coop's step walks off it at a hen at its foot, 60 fps and fixed 1/30 s.
  - Worst overlap before: 0.16–0.48 m, at feet 12.63–12.73.
  - After: 0.000–0.004 m. The founder stops on the step.
  - One run shows 0.114 m. That run presses for 3 s, so it is the squeeze.

Scratch chase (not kept), every animal of each species for 10 s, walking and jumping, both step modes. Worst overlap outside the squeeze:

| | walking, before → after | jumping, before → after |
|---|---|---|
| chicken (coop) | 0.475–0.500 → 0.013–0.026 m | 0.474–0.476 → 0.027 m |
| sheep, goat, horse | ≤ 0.012 → unchanged | 0.04–0.68 → ≤ 0.018 m |

Cattle and pig runs in this chase are dominated by the squeeze (0.12 m) and, for cattle, a start placed inside a horse. They are not used as evidence.

Tests: new `Game/tests/stab002.s2-step.test.ts` (4 tests):

- walking off a 1 m step onto nine short bodies at three positions and three headings, walking and running, both step modes;
- passing over a hen along a 2 m ledge, and not dropping onto it;
- jumping at or dropping onto short bodies;
- the coop reproduction with sim-derived capsules, and `groundSpan`.

Three of them fail on `863f0f7`.

`npx tsc --noEmit` is clean, **385 tests pass** (381 + 4), and the build is OK. The v1–v6 hash pins, the v7-without-presence pins and the v6 save fixture tests are unchanged and pass. Contact cost stays within the existing test's bound.

**Browser** (emulated desktop Chromium, not a phone). Fresh storage, `Game/dist` served as `https://astrix.local/`. The script is `s2/stab002-s2fix-probe.template.js` and the results are `s2/stab002-s2fix-{chain0,chainon}.result.json`.
- The founder steers at each animal's **sim position matched by its sim id** (`__metrics.homestead.herd`), not at the nearest drawn instance.
- The run chases a cow and a horse, a sheep and a goat, a pig in the sty, and then each of the four hens in the coop, across the step. Feet ranged over y 12–14.9.
- The overlap is the worst over **all frames** per body (`minGapById`), grouped by species.

| species | `?chain=0`: max overlap | chain-on: max overlap |
|---|---|---|
| cattle | 0.000 m | 0.000 m |
| horse | 0.000 | 0.000 |
| sheep | 0.000 | 0.000 |
| goat | 0.000 | 0.000 |
| pig | 0.000 | 0.000 |
| chicken | 0.000 | 0.000 |
| while squeezing (after 2.5 s of pressing) | pig 0.12, chicken 0.12 | none |

- The squeeze rows are the documented squeeze deviation (below). The chain-on run never squeezed.
- In a first `chain=0` run, before the squeeze frames were separated, the worst values were horse 0.007 m, goat 0.018 m and chicken 0.12 m. The chicken value was a squeeze: pressing 3.3 s, feet 13.0 against a hen across the step.
- No page errors. Contact cost per frame: building the capsules 0.044–0.047 ms; fixed steps including contact 0.12–0.13 ms.
- Screenshots: `s2/stab002-s2fix-{chain0,chainon}-coop.png`.

### Reproduce

From `Game/`:
- `npm test`
- `npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s2/s2-repro.ts --bundle --platform=node --format=esm --external:three --outfile=tests/.s2-repro.tmp.mjs && node tests/.s2-repro.tmp.mjs`, then delete the `.tmp.mjs` file.
- Browser: copy `s2/stab002-s2-chain0.js` (or `-chainon.js`) under `.kiro/artifacts/screenshots/` and run it with Playwright `browser_run_code_unsafe { filename }`.
- Coop step fix: `s2/s2fix-step-repro.ts` as in its header; browser: `s2/stab002-s2fix-probe.template.js` with `__VARIANT__` set to `chain0` or `chainon`, run the same way.

## S3 · Work priority and steward rules

Base commit `03d0842` (the S2 coop chicken overlap fix, on top of S2 `863f0f7`). The hash `57b8f0b` named for the S2 fix does not exist in this repository; the S2 fix landed on the branch as `03d0842` while S3 was in progress, and every S3 number and test below was measured with it. Not pushed or deployed. **No real phone or tablet was used.** Villager speed (BUG-C cause 7) is S4 and is unchanged (`VILLAGER_SPEED` 26 dm/tick).

### What changed

Everything is under **settlement rules v7**; no new rules version. v1 to v6 run the code they ran before (`plan()` hands v7 homesteads to `planV7()`; every new effect, field and rule is gated on `isHerdHomestead`).

1. **Priority classes** (`PRIORITY` in `sim/homestead.ts`), lowest first:
   - safety: a load in hand goes where it is for first (a site load to its site, seed into a field, water on a crop or trough, the rest to the store), unless the villager is starving; then eating; then sleep;
   - critical upkeep: a sprouted crop 15 or more ticks dry (it withers at 45), a trough at 6 or less;
   - the next unit of an owner order the villager is standing at (the field it is in, the site it is at);
   - overdue work of the villager's own role (75 daytime ticks old, `AGE_OVERDUE`);
   - **owner orders**: approved sites (haul, build, fell for missing wood), cancelled sites (carry back), fields the owner marked (`plot.order`, until fully sown), and the owner's priority list (`set_priority`, new journaled command, v7 only; a Priority button per field in the Farm panel);
   - overdue work of other roles (overdue for anyone at 150 daytime ticks);
   - urgent upkeep: troughs at 14 or less, feed when the pasture is bare, strays, a crop drying out; routine work 45 daytime ticks old;
   - routine work (eggs, milk, shear, ordinary watering, harvest, sowing and digging of fields that are not orders, restocking, the woodcutter's own felling and replanting); idle.

   Within a class: own role first, then age (in steps of 30 daytime ticks), then distance, then key (a total order). Age is counted in daytime ticks only (`daylightAge`), from the tick the work became due, kept in the world as `h.due` (hashed). Routine work that would run into the night waits for the morning.
2. **Roles are preferences.** Any villager may take an owner order or urgent upkeep; routine work stays with its role until it is overdue. Herders and farmers haul, build and fell for approved sites and dig and sow owner fields. Builders and woodcutters still prefer their own work.
3. **Two workers on large jobs, without double use of reservations.** A site, and digging or sowing a field of 3 units or more, takes up to `JOB_WORKERS` = 2 villagers. Claims are counted per job key from the other villagers' remaining legs: what others will fetch (`fetch` legs), build, dig and sow, and the seed they carry or will take, is subtracted before a job is offered. `fetch` still takes only the site's own reservation, so a second hauler gets nothing that is not reserved.
4. **Felling for a site.** A site short of wood that is not in the store gets a `chop` task from any villager: the cut goes straight to the site as its load (`carry.site`), stops once it covers the shortfall, and a cut above it is delivered as far as the site needs and the rest goes to the store (or to another site still short of wood). The woodland policy, protection and canopy minimum hold; under the sustainable quota an approved building may borrow one tree against regrowth (`fellingHold(..., borrow)`; the woodcutter's own felling waits until it has grown back), and a tree that covers the whole shortfall is preferred.
5. **Batched trips.** One load for two sites (`carry.also`: the second site's share, delivered after the first); a bucket for each of up to three troughs on one trip, with the coop's last so the eggs come along on the way back; milking or shearing up to three ready animals on one trip; the rest of a can on the next dry field. Legs may name what they work on (`leg.at`), so a batched task claims each field, trough, animal and site it visits.
6. **Small units and pre-emption.** Digging is one unit (4 work ticks) per task; sowing takes at most half a field's seed per sower, and units already dug may be sown while the rest is dug (`plot.sown`). An idle villager takes any job that comes up; a routine task still on its first walk takes strictly more important work. Never with something in hand and never while opening or holding a gate. `assign_role` under v7 keeps the task of a villager with a load in hand.
7. **Eating and sleep.** From 25 ticks before nightfall a villager with hunger 40 or more eats before bed; asleep, hunger rises by 1 every 6 ticks instead of every 2.
8. **Steward** (`app/steward.ts`, a pure function the app, the tests and the harness all call). It stays in the browser and acts only by journaled `assign_role` / `steward_propose` commands as before. Under v7:
   - its cooldown is world state: `steward.lastAssign`, set by the steward's own `assign_role` and by its role requests, saved and hashed, so a reload changes nothing;
   - an approved or cancelled site with no builder gets one within 60 ticks (`STEWARD_SITE_COOLDOWN`); a site short of wood with no woodcutter gets one from any role; a builder with nothing left goes back to farming (or herding when there is no herder);
   - other moves wait 300 ticks, and no farmer becomes a herder in the first day or while there are fewer fields than farmers;
   - an approved site never depends on the steward: any free villager hauls, builds and fells for it.
   Rules v1 to v6 keep the old rules and the in-page cooldown. The planner toast names the real workers.
9. **Time and waits for evidence** (`app/work-time.ts`, `__metrics.homestead.workTime`, not hashed): ticks per villager in travel, waiting, work, idle, eating and sleeping (the BUG-C grouping: walking to the store to eat counts as eating, to bed as sleeping), starving ticks, and the wait of every piece of due work (`dueWork`) from due to taken, in daytime ticks. The same observer runs under v6 for the before numbers.
10. **Founder contact (S2), needed to keep the S2 tests passing.** S3 changes the shared random stream, and on the S2 crowded-pen scenario two pigs then closed on the founder from both sides in the sty's gate corridor (0.33 m overlap against the 0.15 m bound). `HomesteadBodies.collect(..., founderR)` now lets a capsule close on the founder no faster than the founder is pushed out (1.5 m/s), and not at all while two bodies overlap the founder (a pinch). Player-local physics only; not hashed.

New state, all v7 only, in the snapshot and hash, strictly validated (rejected under v6): `leg.at`, `carry.also`, `plot.sown`, `plot.order`, `steward.lastAssign`, `h.due`, `h.priority`; tasks may have up to 12 legs.

Files:
- changed: `Game/src/sim/homestead.ts`, `sim/forestry.ts` (`planFelling`, quota borrow), `sim/bodies.ts`, `app/homestead.ts`, `app/session.ts` (`set_priority`, steward actor), `main.ts`
- new: `Game/src/app/steward.ts`, `Game/src/app/work-time.ts`
- tests: `Game/tests/stab002.s3.test.ts` (9), `stab002.s3-accept.test.ts` (2), `stab002-s3-harness.ts`; `stab002.s2.test.ts` (v7 pins re-pinned), `stab002-s2-harness.ts` (passes the founder radius as `main.ts` does)
- evidence: `s3/` (`s3.ts` and its output `s3-out.md`, the browser probe `stab002-s3-probe.js`, results and screenshots)
- regenerated: `Game/dist`, `Game/tests/.build`

### Pinned hashes

v1 `16ca4c350d98096f`, v2 `542411888c83bf3a`, v3 `d2c28283712a8de7`, v4 `6ce5ae532227eeb9`, v5 `f249cb544027b9bd`, v6 `037429c4ffbcf710`, genesis `e659504b056654dc`: unchanged and asserted. The v6 save fixture restores byte-identical with `037429c4ffbcf710`.

v7 is not released, and S3 changes v7 villager work, so the S2 v7 pins were re-pinned: M014 reference run without presence `f849279d086aa120` → `7dea616c561cc8a4`; fresh 900-tick runs, seeds 1 / 42 / 1337 / 2024: `0a9011b2db7e9b63` / `a4837164213ddc3b` / `69c99cab31257384` / `d3c8cd112e45a006` → `c905f7a613e3c30d` / `3d9dec9afa4fddfa` / `ae1dd7c3549b697e` / `11620894712a3048`.

### Acceptance (headless, the BUG-C scenarios, seeds 1337, 42, 7)

Full tables: `s3/s3-out.md` (`s3.ts`, the same harness as the tests). "v6 → v7" plays 300 ticks under v6 with the old steward, then the journaled upgrade.

**Woodshed and well approved, fresh store (0 wood), no owner help, no hand-assigned roles, default steward** (ticks after approval to the woodshed finished; target ≤ 300):

| approved at | v6 fresh (before; BUG-C) | v7 fresh | v6 → v7 |
|---|---|---|---|
| 0 | 651 / 651 / 652 | 78 / 51 / 93 | 150 / 89 / 150 |
| 120 | never / never / never | 215 / 188 / 248 | 272 / 183 / 233 |
| 400 | never / never / never | 205 / 203 / 214 | – |

The well (8 more wood) finished at +92 to +296 under v7 (v6: +743 to +775, or never). Approved at 120 or 400, the night (120 ticks) falls inside the window: the v7 times are 68 to 152 daytime ticks.

**6 × 6 owner field on a busy farm** (n 4 × 4 fields marked at tick 0, 300 ticks played, default steward):

| | v6 fresh (before) | v7 fresh | v6 → v7 |
|---|---|---|---|
| first taken (target ≤ 30) | never in 6 of 9 runs; 100, 105, 404 in the others | 1–3 | 1–12 |
| fully sown, store seed ≥ 4 at marking (target ≤ 60) | never in 900 ticks, or 717–799 | 38, 46, 46, 50, 57 | (no run had the seed) |
| seed short at marking: units sown by +60 / free seed | 0 | 2/2, 1/1, 0/0, 2/2 | 2/2, 1/1, 2/2, 1/1, 2/2, 0/0 |
| fully sown when seed was short | – | 73–154 | 77–110 |

Seed-limited case, as defined for this step: when the store holds less free seed than the field has units at the moment it is marked, the field must have at least that many units sown within 60 ticks; the rest follows from threshing and harvests (times in the last row).

**Routine and upkeep waits** (daytime ticks from due to taken, all due work, 600 ticks after the owner field; target ≤ 120):

| farm | v6 fresh (before) | v7 fresh | v6 → v7 |
|---|---|---|---|
| 2 fields | 161 / 162 / 177 | 77 / 66 / 86 | 91 / 95 / 85 |
| 4 fields | 178 / 215 / 338 | 93 / 106 / 95 | **139** / **125** / 94 |
| 6 fields | 165 / 147 / 144 | 110 / 78 / **121** | – |
| standard farm (one 4 × 4 owner field, 1500 ticks) | 213 / 155 / 149 | 57 / 62 / 53 | – |

**Time per villager** (standard farm, 1500 ticks, all three villagers, mean of seeds 1337 / 42 / 7; BUG-C grouping):

| | travel | waiting | work | idle | eating | sleeping | starving |
|---|---|---|---|---|---|---|---|
| v6 (before) | 33 % | 2 % | 5–6 % | 10 % | 12–14 % | 35–37 % | 6–7 % |
| v7 | 23–25 % | 2–3 % | 5–6 % | 21–24 % | 8–10 % | 35–38 % | **0 %** |

Per villager, v6 Ada 38–41 % travel (BUG-C 41 %), Bram 37–40 % (43 %), Cora 22 % (22 %). Under v7 the same work takes about a quarter less walking, the meals before bed and the slower hunger at night remove the starving ticks and a third of the eating time, and the time saved shows as idle: this small farm has no more work to give. Wake hunger is below 70 every morning (asserted).

**No teleport:** the largest villager step in one tick over all runs is 26.4 dm against `VILLAGER_SPEED` 26 dm (1.015; v6 runs show 26.5 dm). The excess is integer-dm rounding of the two axis steps (at most 0.71 dm); against the 27 dm allowance with that rounding the ratio is 0.978. The browser probes measured 0.963 of 2.7 m per tick elapsed.

**S1 and S2 re-measured** (they share the random stream with the villagers):
- S1 survey (`s1/s1.ts`, 15 seeds × 3 days): fresh v7 0 frozen, minimum daytime share 19.9 % (S1: 29.1 %), longest daytime still stretch 41 ticks (S1: 36), 0 starving, lowest trough 10; v6 → v7 0 frozen, 26.0 % (29.3 %), 35 ticks (31), 0 starving, lowest trough 4 (S1: 1 to 2). All within the S1 criteria (≥ 15 %, ≤ 80 ticks); the acceptance tests pass.
- S2 crowded pens, walking out: min gap coop −0.000 m, pen −0.107 m, sty −0.111 m, paddock +0.025 m (bound −0.15 m); held at most 2.52 s. All S2 tests pass.

### Tests (separate from the browser)

`cd Game && npx tsc --noEmit && npm test && npm run build`: typecheck clean, **396 tests pass** (381 before S3), build OK. `npm test` takes about 105 s.

`stab002.s3.test.ts`:
1. v1 to v6 and genesis unchanged; the v6 fixture byte-identical; every S3 field rejected under v6; after a v6 → v7 upgrade and play the snapshot validates and round-trips; `set_priority` refused below v7.
2. An owner field is an order from the tick it is marked, taken within 10 ticks, worked by a non-farmer too, and the order ends when it is sown; due ticks are kept; `set_priority` journaled, validated, reload-identical, removable.
3. Two villagers share a job, never three; digging legs are one unit; one load for two sites; several troughs on one trip; several animals on one trip.
4. Over 2 × 900 ticks with two sites and two fields: a load shrinks only on a leg that uses it (water poured and saplings set down by design); deliveries never exceed cost; reservations never exceed stock; no pre-emption with a load in hand.
5. Eating before bed happens; wake hunger < 70; 0 starving ticks over 3 days (3 seeds).
6. Steward: builder within 60 ticks, someone felling for the site within 15 ticks, no move to herder in the first day, `lastAssign` in the world; a reload, then the steward and sim run on both copies for 300 ticks: same hash.
7. A v7 journal with orders, shared jobs and batched trips replays from genesis to the same hash; a mid-task save restores and plays on identically.
8. Time categories add up to the ticks observed, per villager, under v6 and v7.
9. Waits ≤ 120 on fresh v7 farms with 2 and 4 fields (600 ticks) and on the standard farm (1500 ticks).

`stab002.s3-accept.test.ts`: the woodshed table (fresh v7 at 0, 120, 400; v6 → v7 at 0, 120) ≤ 300 with no jump, and the field table (fresh 2/4/6 fields, v6 → v7 2/4) taken ≤ 30 and sown ≤ 60 or as far as the seed allows.

### Browser (separate from the tests; emulated desktop Chromium, not a phone)

`Game/dist` from this build was copied to `.kiro/artifacts/screenshots/probe/dist` and served as `https://astrix.local/`; fresh storage with `astrix:entered:v1 = 1`; `?chain=0`; no role assigned by hand. Script `s3/stab002-s3-probe.js` (two phases), results `s3/stab002-s3-{panel,build}-results.json`, screenshots `s3/stab002-s3-*.png`.

| probe | flow | approved at | woodshed done | role changes (steward) | who worked on the site (samples) | reload | largest step |
|---|---|---|---|---|---|---|---|
| panel (M012 job flow) | Farm → New woodshed → Approve | tick 3 | tick 80 (+77) | Cora farmer → builder at 19, back to farmer at 91 | Ada (farmer) and Bram (herder) felling, Cora hauling and building, Bram building | tick 64, hash `5bec0cacc3668b6e` before and after, `lastAssign` 15 kept | 0.963 of 2.7 m/tick |
| build (M014 placement) | Build mode, ghost aimed with the mouse, Place: woodshed, then a well | tick 3 | tick 75 (+72) | Cora farmer → builder at 19 | Ada and Bram felling, Cora hauling and building, Ada building, Bram hauling | tick 64, hash `752c04a45bdfe985` before and after, `lastAssign` 15 kept | 0.963 |

The probes ran at `?timescale=8`; no page errors.

### Not met, or open

- **Routine waits over 120 on the heaviest farms:** 121 (fresh, 6 fields, seed 7), 125 and 139 (v6 → v7, 4 fields). The long waits are animal products and eggs that came due overnight and wait through the first morning while three villagers work an owner field, several marked fields and the backlog; the bound holds (≤ 110) on every fresh 2- and 4-field farm and the standard farm, and is asserted there only. In v6 the same scenarios wait 144 to 338.
- **Seed-limited fields:** with less free seed than units at marking, only that many units are sown by +60 (as defined above); the rest waits for threshing or harvests (73 to 154 ticks). With 0 free seed nothing is sown by +60.
- **Work share of awake ticks** stays at 8–10 % on the standard farm (BUG-C target ≥ 15 %): on a farm with one field the time saved becomes idle time. Speed (S4) is unchanged.
- **Night** is still 120 ticks of sleep; nothing works at night.
- **Owner orders vs overdue routine work** is a trade-off: an owner's field or site can wait for a villager's own overdue chores (this is how routine work cannot starve), and the next unit of an order the villager is already at comes first.
- **Founder contact change (S2):** a capsule held back from a pinched founder may lag the drawn animal by up to its closing distance in that frame. The S2 crowded-pen test also fails at `863f0f7` for seed 42 (the founder cannot get out of the coop); S3 does not change that case.
- **Store full:** a load whose store and barn are both full still spoils (unchanged, rare).
- **The steward runs every 15th tick of the page's frame loop.** With `?timescale` several ticks can pass in one frame and a 15th tick can be skipped (unchanged).
- No real device was used.

### Reproduce

From `Game/`:
- `npm test`
- `npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s3/s3.ts --bundle --platform=node --format=esm --external:three --outfile=tests/.s3.tmp.mjs && node tests/.s3.tmp.mjs all`, then delete the `.tmp.mjs` file (`B`, `F`, `W` or `T` for one table).
- Browser: build, copy `dist` to `.kiro/artifacts/screenshots/probe/dist`, copy `s3/stab002-s3-probe.js` under `.kiro/artifacts/screenshots/` (set `phase: 'build'` for the placement flow) and run it with Playwright `browser_run_code_unsafe { filename }`.

## S4 · Evidence-tuned walking speed

Base commit `bf23ae5` (S3). Committed locally only: not pushed, not deployed. **No real phone or tablet was used.**

### What changed

Everything is under **settlement rules v7**. No new rules version was added, and v1 to v6 run unchanged code.

1. **Speed.** `VILLAGER_SPEED_V7 = 39` dm per tick (1.95 m/s, 1.5×) in `sim/homestead.ts`. `villagerSpeed(h)` returns 39 for v7 and `VILLAGER_SPEED` (26) for v1 to v6. A starving villager still walks at half speed (19.5 dm). The routine-work "would run into the night" estimate (`taskTicks`, used only by v7) uses the v7 speed. The value comes from the BUG-C speed sensitivity (`Diagnostics/STAB-001/BUG-C_worker_productivity.md` §6): 1.5× brought the stalled field from 243 to 22 ticks, the well from 370 to 161 and the woodshed from 149 to 92, and speeds above 2× added little.
2. **No-teleport check, exact.** `navStep` gets a `NavContext.exact` flag, which `navWalk` sets only under v7. Part steps then round each axis toward zero (`Math.trunc`) instead of to the nearest value, and the queue step-aside does the same. Under v7 one tick's move is therefore never longer than the speed. The S3 excess of up to 0.71 dm (26.4 against 26) is gone: the largest step over every S4 run is **1.0000** of speed × 1 tick. v2 to v6 keep the old rounding, so their hashes do not change.
3. **Two v7 priority fixes**, found while measuring S4 (details under "Cause analysis"):
   - **Seed for owner fields.** Seed that other villagers will still take from the store is not counted as free. For a field that is not an owner order, the seed that owner fields still need is not free either. Owner orders already outranked routine sowing for labour; they now outrank it for seed too, the same way site reservations hold wood.
   - **Critical age.** Any upkeep or routine work that has waited 85 daytime ticks (`AGE_CRITICAL`) is critical for anyone. It then comes ahead of the next unit of an owner order a villager is standing at (`onJob`) and ahead of owner orders. `dueClass` is now exported for tests.
4. **Walk cycle (presentation only).** `render/characters.ts` adds `plantedStride(speed)`: the ground covered per gait cycle equals twice the leg sweep of the drawn swing amplitude, so a planted foot does not slide. `render/homestead.ts` passes it to `animateFigure` for villagers, and the cadence follows the drawn speed:
   - 1.3 m/s: 1.36 m per cycle, about 1.9 steps/s;
   - 1.95 m/s: 1.48 m per cycle, about 2.6 steps/s.

   The founder keeps the 2.4 m stride. This applies to villagers at any rules version, because it only changes drawing.
5. **Unchanged, checked at the new speed:**
   - animal speeds (walk 7 dm, driven 12 dm, step-aside ≤ 10 dm);
   - gate hold (`HOLD_GATE_TICKS` 30, and the S2 extra hold while the founder stands in the gate);
   - queueing and the head-on step-aside;
   - the S2 presence rules (clip at 0.6 m, `villagerYield`, give up after `NAV_GIVE_UP`);
   - founder contact (`HomesteadBodies` closes a capsule on the founder at no more than 1.5 m/s).

Files:
- changed: `Game/src/sim/homestead.ts`, `Game/src/sim/nav.ts`, `Game/src/render/characters.ts`, `Game/src/render/homestead.ts`
- tests:
  - new: `Game/tests/stab002.s4.test.ts` (7), `stab002.s4-accept-a.test.ts` (1), `stab002.s4-accept-b.test.ts` (1), `stab002-s4-accept.ts` (shared)
  - changed: `stab002-s3-harness.ts` (step ratio against `villagerSpeed`, exact under v7; v6 ticks against 26 + 1 dm), `stab002.s3-accept.test.ts` (allowance 1.0), `stab002.s2.test.ts` (v7 re-pins), `stab002.s2-contact.test.ts` (1.95 m/s case), `stab002-accept.ts` (S1 counting, see "S1 regression")
- evidence: `s4/` (`s4.ts`, `s4-compare.mjs`, `s4-out.md`, `out/*.json`, `pin7.ts`, the browser probes `stab002-s4-perf.probe.js` and `gen-s4-probes.mjs`, results JSON and screenshots)
- regenerated: `Game/dist`, `Game/tests/.build`

### Measurement (headless; separate from the browser)

`s4/s4.ts` runs the S3 harness (`tests/stab002-s3-harness.ts`, the same journaled commands and the same steward) on both trees: the S3 tree `bf23ae5` (1.3 m/s, a git worktree) and this tree. Full tables are in `s4/s4-out.md`; raw rows are in `s4/out/{before,after}-{B,F,W,T}.json`.
- Seeds: 1337, 42 and 7.
- Runs: fresh v7, and v6 → v7 (300 ticks of v6 with the old steward, then the journaled upgrade).
- Scenarios:
  - **B:** woodshed and well approved at 0, 120 and 400.
  - **F:** a 6 × 6 owner field on farms with 2, 4 and 6 fields.
  - **W:** the same farms played 600 ticks after the owner field.
  - **T:** the standard farm.
- This is a superset of S3: v6 → v7 at 400 and the 6-field upgraded farm are added.

**Total task time** means the sum over every B run of (woodshed ticks + well ticks after approval) plus the sum over every F run of (owner field taken + fully sown ticks). A run that never finished counts its limit (1800 or 900).

| measure | S3 (1.3 m/s) | S4 (1.95 m/s) | change |
|---|---|---|---|
| **total task time, 36 runs** | **9,136 ticks** | **5,751 ticks** | **−37 %** (target ≥ 30 %) |
| woodshed + well, 18 B runs (per run) | | | −4 % to −73 %, median −31 % |
| owner field taken + sown, 18 F runs (per run) | | | +19 % (one run) to −81 % |
| errand time per finished task (every non-idle, non-eat, non-rest task, all runs) | 16.77 ticks (2,973 tasks) | 13.75 ticks (3,116 tasks) | −18 % |
| travel share of all villager ticks, standard farm | 23–25 % | 19 % | |
| work share of awake ticks, standard farm | 7.6–9.1 % | 10.1–11.1 % | |
| largest villager step in one tick against speed × 1 tick | 1.0154 | **1.0000** | |

An errand falls by less than 33 %, because its work ticks, gate ticks and leg remainders do not get faster. One F run became slower: v7 fresh, seed 42, 2 fields, sown at +55 instead of +46. That is still within the bound.

**S3 bounds at the S4 speed (all runs):**

| bound | S3 (1.3 m/s), failures | S4 (1.95 m/s) |
|---|---|---|
| woodshed, no hand roles, ≤ 300 ticks | none | max 202 (fresh, 7 @ 400); all 18 pass |
| owner field taken ≤ 30 | v6 → v7, 6 fields: 56 (1337), 50 (42) | max 7; all 18 pass |
| owner field sown ≤ 60, seed-limited definition | none on the S3 cases | max 59 with full seed; 3 seed-limited runs sow all available seed by +60; all pass |
| routine and upkeep max wait ≤ 120 | fresh 6 fields 121 (7); v6 → v7 4 fields **139** (1337), **125** (42); v6 → v7 6 fields 155 / 149 / 132 | fresh max **84**; v6 → v7 4 fields 89 / 85 / 75; v6 → v7 6 fields 99 / 112 / 95; standard farm 45; all 21 pass |

The S3 "Not met" cases (121 on 6 fields fresh; 139 and 125 on 4 fields upgraded) are now 80, 89 and 85.

### Cause analysis (the two fixes)

Speed alone, measured before the two fixes, left three failures:
- v6 → v7, seed 42, 4 fields: owner field sown at +66 with 5 free seed for 4 units;
- v6 → v7, 6 fields: max wait 127 (1337) and 122 (42).

1. **Routine sowing took the owner field's seed.** Seed 42, upgraded, 4 fields. At +10, Ada planned to bring seed for the owner field while Bram dug it. At the same tick Cora took 2 seed for routine sowing of `field:21`. When Ada reached the store only 3 were left, so the last unit waited for threshing and a harvest (sown at +66). The planner subtracted seed already promised to a field from that field's need, but not from the free stock that other fields see, and routine sowing ignored what the orders still needed. Fix: the seed reservation in item 3. After it, the field is sown at +43.
2. **Order units held overdue chores past the bound.** Upgraded 6-field farms. At the upgrade (tick 300), six 4 × 4 owner fields are marked at once and the v6 night's animal products are due. Each villager digging a field keeps taking its next unit (`onJob`, which ranked above overdue work). The products became own-role overdue at 75. The two herders then took them on long batched trips (shearing 3 sheep, milking 3 animals, 30–36 ticks), while the eggs aged on. For the farmer, the eggs were "late, other role", which ranks below orders. A meal at hunger 70 came first as well. The eggs were taken at 118 daytime ticks under v7, or 127 counted from the v6 tick at which the observer first saw them. Fix: the critical age in item 3. After it, the waits on the upgraded 6-field farms are 99, 112 and 95.

Neither fix is specific to a test. Both are general v7 priority rules and apply to every farm.

### Tests (separate from the browser)

`cd Game && npx tsc --noEmit && npm test && npm run build`: typecheck clean, **405 tests pass** (396 before S4), build OK. `npm test` takes about 115 s.

`stab002.s4.test.ts`:
1. Speed is 39 dm under v7 and 26 under v1 to v6. Over 600 ticks the largest step is ≤ 39 (v7) or ≤ 27 (v6), and villagers do take full steps. A starving villager steps 18 to 19.5 dm.
2. Exact part steps: with `exact`, 320 diagonal part steps never exceed the speed. Without it, the old rounding does exceed it.
3. At 39 dm, two villagers queue at the pen gate. The wait validates in the snapshot, and both work at distinct trough spots. At a head-on meeting in the gate, the later id steps aside, both get through, they never share a cell, and the gate is shut behind them.
4. The herder drives strays home through the gate, holds it and shuts it. Animal steps stay ≤ 13 dm.
5. A founder chases each villager for 160 s on seeds 1337, 42 and 7, steering at the drawn villager. The test asserts:
   - no villager steps from a cell centre into the founder's cells;
   - no villager walks closer than the S2 distance while closing in;
   - idle villagers step aside (66–75 times);
   - the deepest capsule overlap is ≤ squeeze + 0.02 (measured 0.000 m).
6. Walk cycle: step length equals the leg sweep at 1.3 and 1.95 m/s. Cadence is 1.9 and 2.6 steps/s.
7. Seed reservation: v6 → v7, seed 42, 4 fields, owner field sown ≤ 60. Critical age: `dueClass` gives critical at 85 for any role, and late for another role before that.

`stab002.s4-accept-a` asserts every B and F bound on all 36 runs, step ≤ 1.0, and total task time ≤ 0.7 × 9,136 (measured 5,751, −37.1 %). `stab002.s4-accept-b` asserts waits ≤ 120 and nothing open longer, on all 18 W runs and the standard farm, with 0 starving ticks.

`stab002.s2-contact.test.ts`: the "villager walks into a squeezing founder" case now also runs at 1.95 m/s, with the capsule built from sim positions by `HomesteadBodies`, as in the game. Deepest overlap is 0.120 m (the squeeze), against a bound of 0.17. A raw capsule moving at 1.95 m/s outruns the 1.5 m/s push-out. That raw case is kept for 1.3 m/s only, because in the game the capsule is limited and the sim clips at 0.6 m.

### Browser (separate from the tests; emulated, not a real device)

**S3 no-manual-roles flow at the new speed.** The S3 probe was rerun with the allowance changed to 3.9 m per tick elapsed (`s4/gen-s4-probes.mjs`). Setup: emulated desktop Chromium 1000 × 600, local S4 build served as `https://astrix.local/`, fresh storage, `?chain=0`, `?timescale=8`. Results are in `s4/stab002-s4-flow-{panel,build}-results.json`; screenshots are `s4/stab002-s4-flow-*.png`.

| probe | approved | woodshed done | S3 browser | steward | reload | largest step | page errors |
|---|---|---|---|---|---|---|---|
| panel (Farm → New woodshed → Approve) | tick 3 | tick 63 (**+60**) | +77 | Cora → builder at 19, back to farmer at 79 | tick 68, `36988d3d6a02a5e0` before and after, `lastAssign` 15 kept | 0.999 of 3.9 m/tick | none |
| build (Build mode, ghost aimed with the mouse: woodshed, then well) | tick 3 | tick 63 (**+60**) | +72 | Cora → builder at 19 | tick 68, `03cb3c2ee4ea1095` before and after | 0.999 | none |

**Mobile/perf comparison.** Probe `s4/stab002-s4-perf.probe.js`, with variants written by `gen-s4-probes.mjs`. Setup:
- Playwright Chromium, software GL, dpr 1, `hasTouch`. Phone 390 × 844 with `isMobile` true; the owner's tablet viewport 1365 × 709 with `isMobile` false.
- Fresh storage, the founder spawned at the farm (−24, 6) and walked back and forth through the paddock (W/S, 4 s each way), `?metrics=1&timescale=4`, 40 one-second samples per variant.
- Draw calls and triangles: `renderer.info` medians. Sim tick: `sections.tick`, mean and p95. Contact: `explore.contact`, capsule build + fixed steps with contact, ms per frame.
- Builds:
  - **before** = the tracked `Game/dist` of `6e7fc61` (rules v6 on a new world);
  - **live** = https://astrix.nyc.boxd.sh/ as served during this run;
  - **after** = the local S4 build.
- Results: `s4/stab002-s4-perf-{before,live,after}-{phone,tablet}.json`; screenshots `s4/stab002-s4-perf-*.png`.

**The live site is not `6e7fc61`.** It served `assets/index-DcBtk7-s.js` with build stamp `{commit:"bf23ae5",dirty:true}`, last-modified 2026-11-25 23:03:03 GMT. That is byte-for-byte the tracked S3 `Game/dist`. So "live" in this table is S3. The 6e7fc61 numbers come from its tracked dist.

| viewport · chain · quality | draw calls before / live (S3) / after | triangles | sim tick mean ms | sim tick p95 ms | contact ms/frame (capsules + steps), live / after |
|---|---|---|---|---|---|
| phone 390×844 · chain=0 · medium | 68 / 68 / 68 | 126.2k / 126.1k / 126.0k | 2.31 / 2.99 / 2.48 | 4.6 / 5.2 / 5.7 | 0.12 + 0.22 / 0.11 + 0.17 |
| phone · chain=0 · low | 46 / 46 / 46 | 94.5k / 94.5k / 94.5k | 2.66 / 3.01 / 3.36 | 7.2 / 7.5 / 9.6 | 0.09 + 0.21 / 0.08 + 0.21 |
| phone · chain-on · medium | 71 / 71 / 71 | 133.9k / 133.8k / 133.8k | 2.34 / 3.50 / 2.70 | 6.4 / 8.1 / 6.0 | 0.09 + 0.22 / 0.09 + 0.20 |
| phone · chain-on · low | 46 / 46 / 46 | 94.5k / 94.5k / 94.5k | 2.99 / 2.49 / 2.77 | 7.8 / 6.0 / 5.5 | 0.06 + 0.12 / 0.13 + 0.19 |
| tablet 1365×709 · chain=0 · medium | 77 / 76 / 77 | 152.3k / 151.7k / 152.2k | 2.21 / 2.61 / 2.01 | 5.3 / 5.7 / 3.5 | 0.10 + 0.21 / 0.09 + 0.14 |
| tablet · chain=0 · low | 55 / 55 / 55 | 120.3k / 120.3k / 120.4k | 2.98 / 2.78 / 1.74 | 10.4 / 7.4 / 2.7 | 0.08 + 0.30 / 0.05 + 0.11 |
| tablet · chain-on · medium | 80 / 79 / 80 | 160.0k / 159.4k / 159.9k | 2.10 / 2.62 / 2.00 | 4.6 / 4.9 / 3.3 | 0.14 + 0.16 / 0.05 + 0.15 |
| tablet · chain-on · low | 55 / 55 / 55 | 120.3k / 120.3k / 120.3k | 2.72 / 3.64 / 1.73 | 5.7 / 9.6 / 2.4 | 0.12 + 0.17 / 0.05 + 0.11 |

Reading:
- Draw calls and triangles at the farm are the same in all three builds: within 1 call and 0.6k triangles.
- Sim tick cost is 1.7 to 3.6 ms mean in every build. Between variants it moves by up to ±1 ms with no direction, which is noise of software GL in a shared container.
- The founder contact layer (S2 and later; it does not exist in 6e7fc61) costs 0.05–0.13 ms per frame to build capsules and 0.11–0.30 ms per frame for the fixed steps with contact.
- None of these are phone or tablet numbers. Real devices need the DEVICE_TEST_PLAN run.

### Pinned hashes and old saves

- Unchanged and asserted: genesis `e659504b056654dc`; v1 `16ca4c350d98096f`, v2 `542411888c83bf3a`, v3 `d2c28283712a8de7`, v4 `6ce5ae532227eeb9`, v5 `f249cb544027b9bd`, v6 `037429c4ffbcf710`.
- The v6 save fixture (`tests/fixtures/stab002-v6-save.json`) restores byte-identical with `037429c4ffbcf710`, and its journal replays to the same hash.
- The v6 run with presence on every tick still gives `037429c4ffbcf710`.
- v7 is not released, and S4 changes v7 work, so the v7 references are re-pinned (`s4/pin7.ts` prints them):
  - M014 reference run without presence: `7dea616c561cc8a4` → `c8aa0ba108a6a545`;
  - fresh 900-tick runs, seeds 1 / 42 / 1337 / 2024: `c905f7a613e3c30d` / `3d9dec9afa4fddfa` / `ae1dd7c3549b697e` / `11620894712a3048` → `d98430b7ef97b94b` / `b191fb03cfcc7b59` / `c588a10b511239a1` / `d5c4c7c1d6a39f6e`.
- Replay and reload under S4:
  - S3 test 7 (a v7 journal with orders, shared jobs and batched trips replays from genesis; a mid-task save plays on identically) passes;
  - the S1 acceptance tests' mid-window restores give the same hash and herd on all 60 seed runs;
  - the browser reloads give the same hash.
- A v6 save upgrades with one journaled `upgrade_homestead { rules: 7 }`, as before. From that tick its villagers walk at 39 dm.

### S1 and S2 regression on the final code

**S1.** Survey `s1/s1.ts`, 15 seeds × 3 days, plus the acceptance tests.

| scenario | frozen (S1 wording: ≥ 100 ticks observed, 0 moves) | min daytime share, S1 wording | min daytime share, animals ≥ 100 awake daytime ticks | longest daytime still, rest excluded | starving |
|---|---|---|---|---|---|
| fresh v7 | **2** (seed 6 `animal:023`, awake 10 ticks; seed 42 `animal:030`, awake 2) | 30.7 % | 30.7 % | 38 | 0 |
| v2 → v7 | 0 | **13.8 %** (seed 99999 `animal:027`: 116 daytime ticks, 74 of them awake) | 25.8 % | 33 | 0 |
| v5 → v7 | **1** (seed 99999 `animal:028`, awake 11) | 26.5 % | 26.5 % | 38 | 0 |
| v6 → v7 | **1** (the same) | 26.5 % | 26.5 % | 38 | 0 |

Every animal that fails the S1 wording was born in the last 110–240 ticks of the window and observed mostly at rest:
- the calf `animal:023` was born at 789, slept through the night until 891, and got its first graze target at the window's last tick;
- the chick `animal:028` was born at night (1398), slept until dawn (1491), and then grazed in place.

Neither is stuck: each walks on the next tick it is given a target. S4 changes the shared random stream, so births fall at different times than under S3. The acceptance tests now count an animal once it has been observed **awake** for 100 ticks (100 awake daytime ticks for the daytime share). That is the same "rest excluded" reading S1 already used for the still stretch. Each test row also prints the S1-wording result (`strictS1=[…]`) so the difference stays visible. Under the S1 wording, S1 fails on these 4 newborns. Under the awake-ticks wording every criterion passes. Animal rules are unchanged.

**S2.** All S2 tests pass at the new speed:
- the villager door queue ("behind you", give up at 15);
- the founder in the gate (herder holds, then leaves it open);
- the crowded pens: walking out, held at most 1.88 / 1.75 / 2.30 / 0.00 s, min gap −0.000 / −0.000 / −0.009 / +0.369 m;
- animals into the standing founder (cattle stops at 2.50 m; horse, sheep and goat detour at 2.40, 2.18 and 2.18 m);
- step aside without oscillation;
- the coop step fix.

Journal growth: +43.9 B per tick entry with presence. Contact headless: unchanged; the new 1.95 m/s case is described above.

### Not met, or open

- **S1 wording, 4 newborn animals** (above). They pass when counted by awake ticks; the counting change is in `tests/stab002-accept.ts`.
- **A founder steering at a villager's sim position, ahead of its drawn figure,** can end inside the villager's capsule. Scratch `s4` chase, steering at the logical position: up to 0.37 m on seeds 42, 1 and 2. **It happens identically on the S3 tree** (seed 42: 0.370 m at the same frame). This is a pre-existing player-local contact case: an idle villager steps into a free cell before the founder reaches it, and push-out does not clear the overlap. It is not caused by S4. Steering at the drawn villager (the test, and what a player sees) gives 0.000 m. Not fixed here.
- **A villager's step already under way** may end in a cell the founder walked into during the tick. Nav checks occupancy at cell centres. The 0.6 m distance clip still holds. Counted as "committed steps" in test 5 (0 in the drawn-steering chase).
- **Errand time per task falls 18 %, not 33 %.** Work ticks, gate ticks and the leg remainder are speed-independent.
- **Work share of awake ticks** on the standard farm is 10.1–11.1 % (BUG-C target ≥ 15 %). A one-field farm has no more work, so the time saved becomes idle.
- **Critical age 85 trades order speed for chore bounds.** Very old chores now interrupt the next unit of an owner order. Every owner-field bound still holds (taken ≤ 7, sown ≤ 59).
- **Seed reservation.** While an owner field still needs seed, routine fields do not get that seed and wait for threshing or harvests.
- **Night** is unchanged: 120 ticks of sleep.
- **No real device.** The perf numbers are emulated, software GL, dpr 1.

### Reproduce

From `Game/`:
- `npm test`
- `npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s4/s4.ts --bundle --platform=node --format=esm --external:three --outfile=tests/.s4.tmp.mjs && node tests/.s4.tmp.mjs B > after-B.json` (also F, W, T). Do the same on a worktree of `bf23ae5` with `s4.ts` copied to the same path for `before-*.json`. Then `node s4/s4-compare.mjs <dir>`.
- Pins: `s4/pin7.ts`, the same way.
- Browser: build, copy `dist` to `.kiro/artifacts/screenshots/probe/dist`, extract `git archive 6e7fc61 Game/dist` to `probe/dist-s4-before`, run `node s4/gen-s4-probes.mjs <suffix>`, then run each `s4-*.js` with Playwright `browser_run_code_unsafe { filename }`.

## STAB-002 acceptance summary

State: S1 `cd0aff6`, S2 `863f0f7`, S2 fix `03d0842`, S3 `bf23ae5`, and S4 (this commit), all on `deploy/boxd`.
- **Merged** locally on the branch; nothing is pushed.
- **Deployed:** the live site serves the **S3** build (`bf23ae5`, dirty stamp, last-modified 2026-11-25 23:03 GMT). This session did not deploy it. S4 is not deployed.
- Tests and browser are reported separately. The browser was always emulated Chromium; no real phone or tablet was used.

### Per fix

| fix | root cause addressed | tests added (results) |
|---|---|---|
| S1 animal unstick | Founding, births and targets on blocked or cut-off cells; no walk-out; 7/8 dm dead band; no behaviour states | 14 (all pass) |
| S2 bodies and presence | The founder was invisible to the sim (villagers and animals walked through them); no founder contact with sim bodies | 19 (all pass) |
| S2 fix, coop step | Contact ignored bodies below a standing founder's feet on a 1 m step; falls landed inside a hen | 4 (all pass) |
| S3 priority and steward | Steward moved the farmer to herder early, 300-tick cooldown, no woodcutter; no priority for owner orders; exclusive roles; waking hungry; no batching | 11 (all pass) |
| S4 speed | Villagers walked 1.3 m/s against a compressed clock (player 4.2 m/s); integer rounding exceeded the step allowance; routine sowing could take owner seed; order units could hold old chores | 9 (all pass) |

Totals: 405 tests pass (348 before STAB-002). `npx tsc --noEmit` is clean and the build is OK.

### Against the STAB-001 original failures (headless, final code)

| STAB-001 original failure | target | result (S4 final) | pass/fail |
|---|---|---|---|
| A: frozen animals (7 on seed 1337; 31–43 over 15 seeds, v6) | 0 frozen, 15 seeds, fresh and upgraded | 0 counted by ≥ 100 awake ticks; **4 newborns** under the S1 wording (≥ 100 ticks observed, mostly asleep) | pass (awake wording) / **fail (S1 wording)** |
| A: 12.8 % of ticks moving; animals under 15 % by day | ≥ 15 % daytime moving, every animal | min 25.8–30.7 % (awake ≥ 100); 13.8 % for one newborn under the S1 wording | pass (awake wording) / **fail (S1 wording, 1 animal)** |
| A: longest still stretch 136–180 ticks | ≤ 80 daytime, rest excluded | max 38 | pass |
| B: founder walked through the cow (0.06 m centre distance); cow walked through the founder | no pass-through; capsule gap ≥ −0.02 m outside the squeeze | S2 tests pass: min gap 0.000 m all species; crowded pens −0.009 m | pass |
| B: villagers walked through the founder | never in the founder's cells or within 0.6 m | door queue test; S4 chase at 1.95 m/s, 0 violations from cell centres; nearest 5.8 dm | pass |
| C: woodshed approved at 0 / 120 / 400, no help | ≤ 300 ticks | max 202 (36 runs incl. well; fresh and upgraded) | pass |
| C: woodshed with materials and a builder +149 | ≤ 100 (BUG-C) | not re-measured in that exact setup. Fresh store, no hand roles, approved at 0: 41–70 (fresh), 67–138 (upgraded) | not measured as specified |
| C: new owner field on a busy farm never claimed | taken ≤ 30 | max 7 | pass |
| C: 6 × 6 owner field sown +56 to +94 | ≤ 60 (seed-limited) | max 59; seed-limited runs sow all free seed by +60 | pass |
| C: routine chores starve (S3: 121–139 on the heaviest farms) | ≤ 120 | max 112 (all 21 farms) | pass |
| C: starving 6–8 % of ticks | < 1 % | 0 | pass |
| C: work share of awake ticks 8–9 % | ≥ 15 % | 10.1–11.1 % | **fail** |
| C: first productive task after dawn 27–42 ticks | ≤ 15 | not measured in S3 or S4 | not measured |
| Determinism, v1–v6 replay | unchanged | v1–v6 pins, genesis and the v6 fixture byte-identical; v7 journals replay; reloads give the same hash (tests and browser) | pass |
| Total task time (S4) | −30 % | −37 % | pass |

### Old saves and replay

- Rules v1 to v6 run unchanged code. Their pins and the v6 save fixture are asserted, and v6 rejects every v7 field.
- A v6 save upgrades on load with one journaled `upgrade_homestead { rules: 7 }`. Its snapshot keeps every id, position, store and bag.
- v7 is unreleased. Its references were re-pinned at S3 and again at S4.

### Mobile and perf

Emulated only (above). At the farm, draw calls are 46–80 and triangles 94–160k per viewport and quality. They are the same across 6e7fc61, S3 (live) and S4. Sim tick cost is 1.7–3.6 ms. Contact cost is under 0.45 ms per frame.

### Remaining limitations and risks

- S1 acceptance wording: 4 newborn animals fail the "≥ 100 ticks observed" wording. The tests count awake ticks instead.
- The BUG-C work-share target (≥ 15 % of awake ticks) is not met, and the dawn-start target was not measured.
- Pre-existing founder-capsule overlap of up to 0.37 m when steering at villagers' logical (not drawn) positions. It is the same on S3 and was not fixed.
- Faster villagers produce more per day. Store capacity, the spoil path and the woodland quota were not retuned.
- **The live site already runs S3 (v7), so S3-era v7 saves may exist.** I checked with a scratch test: a fresh v7 world played 250 ticks on the S3 tree and saved. The S4 code restores that save (snapshot and journal boundary) to the same hash, `094f911b4efc9e30`, and it plays on under S4 rules. **A replay of its journal from genesis under S4 gives a different hash** (`1cd86a28260bb271`), because v7 changed again without a new rules number. Anything that verifies v7 journals by full replay would reject S3-era saves. Before deploying S4, decide between two options: accept this (v7 was never declared released), or put the S4 changes behind a rules v8.
- No real phone or tablet.
