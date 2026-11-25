# STAB-002 · Stabilization (settlement rules v7)

Repo `Astrix`, branch `deploy/boxd`. Base commit `4169c21` (STAB-001 docs). Not pushed or deployed. Everything below was measured headlessly or in an emulated desktop browser (Playwright Chromium). **No real phone or tablet was used.**

S1 and S2 are in this report. Steps S3 and S4 are not part of these changes.

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

- **Chicken overlap in the coop (browser only).** Both browser runs recorded one episode with a chicken, 0.14 m (`chain=0`) and **0.40 m** (chain-on). Each time the founder's feet were 0.32 m above the chicken's ground (y 12.32 against 12.0). The headless coop runs show nothing like it, and the terrain there is flat at y 12. **Cause not found.**
- **Squeeze is a deviation from "refuse moves that go deeper".** After 2.5 s of pressing, the founder may go 0.12 m into a body. It never passes through one, and centre distance stays ≥ the sum of radii − 0.12 m.
- **Drawn villager figures lead their capsules** by up to 0.17 m for about a second after a tick that comes early (the clock catching up). The median is 0.00–0.02 m. Animals did not show this.
- **Animal–animal separation is not part of S2.** Shared cells are 598 per 600 ticks without the founder and 1,113 with the founder standing in the paddock, against 1,106 in STAB-001.
- **Gates left open.** A herder who cannot shut a gate because the founder stands in it leaves it open. Animals may then wander out until the owner closes it.
- **Cornered cattle and horses stay put while the founder is moving.** Pass mode only applies while the founder stands still.
- **Presence is sent with every tick,** not only when it changes. That adds about 1.3 KB/min. Search expansions are +23 % when the founder walks the pens.
- **Not tested in the browser:** standing in a gate, and villagers queueing at the door. Both are covered headless only. No real device was used.

### Reproduce

From `Game/`:
- `npm test`
- `npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s2/s2-repro.ts --bundle --platform=node --format=esm --external:three --outfile=tests/.s2-repro.tmp.mjs && node tests/.s2-repro.tmp.mjs`, then delete the `.tmp.mjs` file.
- Browser: copy `s2/stab002-s2-chain0.js` (or `-chainon.js`) under `.kiro/artifacts/screenshots/` and run it with Playwright `browser_run_code_unsafe { filename }`.
