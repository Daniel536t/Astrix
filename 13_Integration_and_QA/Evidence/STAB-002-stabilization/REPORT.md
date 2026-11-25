# STAB-002 · Stabilization (settlement rules v7)

Repo `Astrix`, branch `deploy/boxd`. Base commit `4169c21` (STAB-001 docs). Not pushed or deployed. Everything below was measured headlessly or in an emulated desktop browser (Playwright Chromium). **No real phone or tablet was used.**

Steps S2 to S4 are not part of this change.

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
