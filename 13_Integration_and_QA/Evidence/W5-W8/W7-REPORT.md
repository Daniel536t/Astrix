# W7 "Persistent wildlife and animal minds": completion report (uncommitted)

**W7 status: implemented, emulated only. Not accepted.** No physical-phone walkthrough was done; that needs the owner.

- **Repository:** `Astrix`, branch `deploy/boxd`, HEAD `2ed9366` (W6 code `12bf1e2`, deployed).
- **Not committed:** nothing is committed, staged, pushed or deployed.
- **Untouched:** `.tools/backups/w4-20261126/`, `05_Noxel_Studio/Asset_Sheets/2026-11-24_animals/Animals` and `Evidence/W1-wilderness-scenario/live-entry.png`.
- **Wilderness content:** v7 becomes **v8**, by one journaled `upgrade_wilderness` step. v1–v7 journals replay under their own rules first.
- **Scope:** W8 and later were not started. No species was added (deer, hare, trout, fox, wolf only).
- **Farm animals:** the settlement's six homestead species (`sim/homestead.ts`) are untouched. Settlement wildlife stays the ambient (unhashed) tier, unchanged, so no settlement hash moves.
- Evidence (screenshots and the v7 fixture generator) is in `Evidence/W5-W8/w7/` and `Evidence/W5-W8/w7-fixture-gen.12bf1e2.ts.txt`.

## 1. What was built

### Architecture (`src/sim/wildlife.ts`, pure TS, no three.js)
This is the authoritative tier that the `sim/fauna.ts` header already designed. Species, habitats, ids (`fauna:<species>:<cx>,<cz>:<i>`) and the predator table (`FEARS`) are fauna.ts's.

**Identity: derive, override, tombstone.**
- **Derive.** `wildlifeInChunk(seed, gen, cx, cz)` gives each chunk's starting creatures. It is a pure function of the seed, the generator and the chunk. It reads:
  - base terrain: route.ts's `TerrainCache`. A test checks that it equals the voxel surface and water;
  - the natural planner's trees and ore, through deposits.ts `naturalPlanInChunk`. A `solid` list was added to that plan; its existing outputs are unchanged.
  - It reads no voxels and no loaded chunks, so the result does not depend on load order.
  - The rules are the ambient tier's: trout schools in water at least 2 m deep, deer at forest edges, hares in open ground, foxes in thin woods, wolf packs of 2–4 in forest. Predators use their own random stream.
- **Override.** A creature gets a saved record the first time its chunk enters the active area. From then on the record *is* the creature:
  - position (integer dm) and heading (one of 32);
  - act and the time it ends;
  - goal and target creature;
  - hunger, thirst and fatigue (0–10,000);
  - trout depth, its own 32-bit random stream, the last time it was stepped, and a stuck counter.
- **Tombstone.** A killed creature's id goes into `dead` for good, and a carcass record `{id, x, z, t, by:'wolf'}` lies for 900 ticks (3 days). Materialization skips any id that has a record or a tombstone, so reload, compaction and replay never duplicate or resurrect one. Snapshot validation also refuses a record whose id is tombstoned.
- **Record budget.** At most 4,096 records. Over that, the farthest *calm, frozen* records are dropped and come back as derived when their area is next active. This is tested with a lowered cap, and it never happens at realistic play sizes.

**Simulation on the 2 s world tick (LOD).** The tick command carries the player's presence. This is the S2 `presence {x, z, mx, mz}`, sent with every wilderness tick in v8 while the character is alive. The focus is the last presence; ticks without presence keep the last focus and react to no player. Rings are counted in chunks (Chebyshev distance) from the focus chunk, using the nearer of an animal's position and its home:

| Ring | Name | What runs |
|---|---|---|
| ≤ 3 | full | Two 1 s sub-steps per tick, with perception of the player, noise, predators, prey and herd-mates. This ring contains the renderer's near ring (3), so every drawn animal is fully simulated |
| 4 | coarse | One 2 s step: needs and calm behaviour only, with no perception and no hunts |
| ≥ 5 | frozen | Not stepped; the record is kept unchanged. On waking, needs move toward a resting baseline by the time away, a transient act (flight, chase) ends, and the position does not jump (tested) |

- **Growth on arrival.** The active area grows by one ring per tick (`reach`, saved), so the first ticks after the upgrade or a far respawn derive 9, 25, 49, then 81 chunks rather than all at once.
- **Determinism.** Integer positions; a hard-coded integer direction table; integer distance squares; `Math.sqrt` only, which is correctly rounded; each animal's own random stream; fixed id order. There is no `Math.sin`, `cos`, `atan2` or `hypot` in the sim.
- **Noise.** An accepted `chop`, `cut_log`, `mine` or `build_work` records a noise at its `at`. Animals within earshot react on the next tick. A refused command makes no noise (tested).

**Movement and collision.**
- A land animal stands only on cells that are dry, not a tree or ore cell, not inside a building footprint (`blockedCells`, the same one the W5 route uses) and not under a fallen trunk. It steps at most 1 m (nav.ts `MAX_STEP`), with nav's corner rule on diagonals.
- A trout is only in cells with water at least 1 m deep.
- Goals are reached by a straight line when one is clear. Otherwise the animal follows a bounded A* route (2,500 expansions, a window of up to 96 m), walking from one cell centre to the next. New goals are only chosen if they are reachable.
- **Stuck recovery:** an animal that makes no net progress, including oscillating back and forth, gives up the goal and picks a new reachable one.
- **Building put over an animal:** it walks out to the nearest good cell at walking pace (`escape`). It never jumps (tested).
- **Player:** an animal never steps into the player's body plus its own length while approaching (the S2 keep-away). The player's capsule contact with wildlife uses the same blended sim pose that is drawn.

### Behaviour per species (each has its own decision function)
| Species | Behaviour |
|---|---|
| **Deer** (herds) | **Feeding and drinking:** graze open ground beside trees, or browse at a tree, near the herd's centre; drink at the nearest reachable bank within 60 m when thirsty. **Resting:** bed down in cover at midday and at night, getting up if very hungry or thirsty. **Herd:** keep with the herd. **The player:** seen at 14 m (22 m if the player moves) → **alert**: head up, facing the player, 2–3 s. An approaching player, or one within 9 m, → **flight** at 8.5 m/s (6 m/s when tired). A herd-mate's flight spreads one step. **Wolves:** a hunting wolf, or any wolf within 6 m, → flight; a passing wolf → alert, then walk 25–35 m away. **Noise:** within 14 m → flight; within 25 m → alert |
| **Hare** | Graze near cover or its form; rest in its form by day (active at dusk, night and dawn). **The player:** seen at 6 m (10 m moving) → **freeze**. Bolts in **zig-zags** (±45°, alternating every second) when the player comes within 4 m or keeps approaching. Flees foxes and wolves; a stalking fox is noticed only within 3.5 m |
| **Fox** | Solitary; rests by day. When hungry: **mouses** in open grass (a pounce for a vole; 1 in 4 catches one, which lowers hunger), or **stalks** a hare within 13 m at 0.6 m/s and **pounces** at 3.5 m. **W7: the hare always escapes** (see §7). Trots away from the player at 11–16 m, flees within 6 m. Flees wolves |
| **Wolf** (packs) | **Leader** (the lowest living id): patrols the home range, drinks, and rests at midday and in the afternoon. When the pack is hungry (≥ 8,500) it **hunts**: it chases the most tired deer within 45 m, for up to 60 s. **Followers** keep their place behind the leader, and rest, drink, chase and feed with it. **A kill:** a wolf within 1.5 m of a deer whose fatigue is ≥ 6,500 kills it. This is an authoritative death: the record goes, the id is tombstoned and a carcass is recorded; the pack feeds there up to 120 s. Wolves avoid the player at 20–26 m and flee within 8 m |
| **Trout** (schools) | Water only. **Hold** station facing upstream (the higher water level within 6 m), **cruise** up or down the stream to a new lie (upstream 65 %), keep with the **school**, **rise** to feed near the surface at dusk and dawn, and **dart** from the player on the bank or in the water at 5 m (8 m when the player moves). Depth in the water column is part of the state |

**Needs:** hunger, thirst and fatigue rise at per-species rates; running tires an animal fast. Thresholds (`NEED_LEVELS`) choose when to feed, drink and rest. The day phases come from the tick (300 ticks per day). In content v8 the wilderness sky follows world time, the same day as the homestead's, so the animals' midday is the sky's midday.

### Client
- **`render/fauna.ts`** (one view, two sources):
  - **v8 wilderness:** it only draws sim records that stand in loaded near chunks. Each tick's path (start plus each sub-step) is blended over the tick, starting from where the animal was shown when the tick arrived, so nothing jumps. Poses follow sim state: lying for `rest` or a frozen hare, head down for graze, browse or drink, head up for alert. Carcasses are drawn lying on their side.
  - **Settlement and pre-upgrade worlds:** the ambient tier as before.
  - Still one instanced mesh per species (5 draw calls). The capacities were raised (deer 96, hares 96, trout 192, foxes 32, wolves 64).
- **`main.ts`:** presence on wilderness v8 ticks; the sky follows the tick when wildlife exists; `__wildlife()` (with `?metrics=1` only) is a read-only sample.
- **`wild-game.ts`:** the load-time upgrade goes to v8, with a toast.

## 2. Files
- **New:**
  - `Game/src/sim/wildlife.ts`;
  - `Game/tests/w7.wildlife.test.ts` (30 tests);
  - `Game/tests/fixtures/w7-wilderness-save.json`;
  - `Evidence/W5-W8/w7-fixture-gen.12bf1e2.ts.txt`, `Evidence/W5-W8/w7/`.
- **Changed:**
  - `sim/gathering.ts`: v8, the `wildlife` block, `stepWild(…, presence)`, validation, the upgrade;
  - `sim/fauna.ts`: `FEARS` and `PREDATOR_ALARM` exported;
  - `sim/deposits.ts`: the additive `solid` list in the natural plan;
  - `app/session.ts`: presence passed to `stepWild`;
  - `app/wild-commands.ts`: the noise hook and comments;
  - `app/wild-game.ts`, `render/fauna.ts`, `main.ts`.
- **Existing tests changed** (no assertion weakened):
  - `w2` and `w4.build`: the latest and default content is 8 instead of 7;
  - `w6.mining`: `v7()` now builds an explicit v7 world, so W6 tests keep testing exactly the v7 rules. The v7 genesis pin `2b53c51d7dec7daa` is unchanged.
- **Regenerated:** `Game/dist` and `Game/tests/.build`.

## 3. Tests, typecheck and build
| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npm test` (final tree) | **557 tests, 557 pass, 0 fail** (297 s, load average about 13 on 8 CPUs); 527 before, plus 30 new |
| m004 "v2 chunk generation stays within budget per chunk" | **Passed** in the final full run (303 ms test), threshold unchanged. In an earlier full run on an intermediate tree it **failed**, while I was running wildlife scratch simulations on the same host at the same time. That run was cut off by a tool timeout before it finished. It was not re-run in isolation because the final full run passed it |
| `npm run build` | OK. Bundle `assets/index-CMRUPcBa.js`, `assets/index-D6bp5Ey-.css` |

**New tests (`tests/w7.wildlife.test.ts`):**
1. **Derivation:** pure and identical twice; ids number each chunk in order; each species on its own ground. All five species near the spawn. No voxel chunk is generated. The sim terrain equals voxel surface and water. The forest at (272, −176) has ≥ 40 deer and ≥ 30 wolves in 7×7 chunks.
2. **Records:**
   - nothing at genesis and nothing without presence;
   - growth ring by ring;
   - records equal the derived ids of the active area, with no duplicates;
   - **v8 genesis pin `7c46024708b9815d`**; v7 genesis `2b53c51d7dec7daa` and settlement `e659504b056654dc` unchanged.
3. **Save and reload** (BrowserSaveStore): the whole wildlife block is byte-identical after reload. The reloaded and continued worlds agree after 40 more ticks; the journal replays; a compacted save restores; no duplicates. Size: 177 records, 27,214 bytes (154 per record).
4. **Wolf kill** (600-tick forest run): a real kill, the id tombstoned, a carcass recorded.
   - Reload: still dead after 20 more ticks; restore equal.
   - After 900 ticks the carcass is gone and the tombstone stays.
   - A snapshot bringing a dead id back is refused.
5. **Deer by phase:** rest 63 % at night and 68 % at midday, 0–7 % at dawn and in the morning. Feeding 34 % at dawn and 34 % in the afternoon. 88 % have a herd-mate within 20 m.
6. **A thirsty deer** walks to the river, drinks on dry ground beside the water, and is slaked.
7. **Deer and player:** alert at 12 m, still, facing the player, with `tg` = player. Flight when approached; it ends more than 8 m farther away.
8. **Hare:** freezes at 8 m, stays frozen and still while the player passes sideways, bolts at 3 m, and its sub-step headings swing (zig-zag).
9. **Fox:** a hungry fox stalks a hare from more than 3.5 m and pounces on it, and the hare bolts and survives. Without hares it mouses. It moves away from the player.
10. **Wolves:** followers within 15 m of the leader in 94 % of samples. Leader acts seen: patrol, rest, chase, feed, drink. Follower acts seen: follow, rest, chase, feed.
11. **Trout:** checked at every sub-step of 200 ticks, never out of 1 m water. Hold and cruise seen; they dart from the player walking the bank.
12. **Threats:** a noise 6 m away → flight (`tg` = noise); a wolf 4 m away → flight (`tg` = that wolf).
13. **Noise via commands:** construction work is heard where it was done; a refused `chop` makes no noise.
14. **Collision:** 287,871 sub-step positions over the forest run were all on allowed cells. The longest sub-step was 17.0 m (a 2 s coarse step at a run), within the speed bound.
15. **Building over an animal:** walks out within 5 ticks at walking pace; afterwards no animal is ever inside the footprint over 60 ticks.
16. **Stuck recovery:** a goal in deep water is given up, and the animal stays on land. Over the forest run, the longest time any animal stood still while meaning to move was **3 ticks**.
17. **LOD:** 60 ticks away, every spawn-area record is unchanged. On return the animals wake where they stood and their needs catch up. Replay is equal.
18. **Record budget:** the evicted records come back derived; no duplicates, never the dead.
19. **Strict block:** wrong act for a species, wrong order, a carcass without a tombstone, a fish with fatigue, a need over the bound, extra fields, v7 content with the block, and v8 without it are all refused.
20. **Performance:** see §5.
21–22. **The v7 fixture from `12bf1e2`** (short and compacted):
    - byte-identical record;
    - it holds ticks with presence, and it replays under v7, which ignores them;
    - one upgrade to v8 with all v7 state untouched; then creatures appear; reload and replay.
23. A v7 world ignores presence (same hash with and without it).
24–29. **W1–W6 fixtures:** load, replay, upgrade straight to v8, and wildlife appears.
30. **Settlement:** no wildlife block; genesis pin unchanged.

**The v7 fixture.**
- Made by the live W6 code `12bf1e2` in a temporary worktree, `/projects/sandbox/.tools/scratch/w7-wt`. The worktree was removed and is not in `git worktree list`.
- Contents:
  - a workbench, a stone axe, and a stone pickaxe (equipped);
  - land explored from the spawn to the river;
  - clay `k:29,28:0` discovered and mined: 2 clay, 1 carried and 1 dropped;
  - 14 ticks, some with presence.
- 74 entries, hash `85bcc9a04c68b602`, 44,549 bytes.

**Settlement:** the pins and the v1–v8, v6 and v7 fixtures pass in their own suites, which are part of the 557.

## 4. Browser walkthrough (emulated; local build at https://astrix.local/; Chromium with software GL)
**Setup.**
- localStorage was seeded as specified (`w1`, seed 1337, gen 2, spawn (−82, −172)). It was cleared from a blank page first: an earlier attempt reloaded a leftover W6 browser save because the app saves on unload.
- Captured on every run: console errors and warnings, page errors, failed requests and HTTP ≥ 400. **None were recorded in any run.**

**Desktop 1200×700, `?metrics=1&timescale=4`:**
- **Fresh world.** Content 8, source `sim`. 139 records and 79–84 drawn (deer 21, hares 23, foxes 5, wolves 5–10, trout 25). Presence is sent with every tick. `w7-b`. (`w7-a` is from the accidental first load of the leftover W6 browser save, tick 3439. It was upgraded v7 → v8 in the browser with 0 errors, and its inventory and events were intact.)
- **Behaviour over time** (6 samples, 15 s apart):
  - midday: all deer, hares, foxes and wolves resting;
  - afternoon: deer grazing, browsing, wandering and drinking; hares grazing; a fox mousing; wolves patrolling, following and drinking;
  - dusk: 21 trout rising;
  - then deer resting again.
- **Approach.** Walking toward the herd `deer:29,25:*` (wander and graze, 25–28 m away, the player moving): one tick later all three were in flight (one from the player, two by the herd alarm). They stopped at 42–57 m and went back to wandering and browsing. `w7-d`.
- **Reload.** Paused, saved, then reopened with `?freeze=1`, so no tick ran after loading:
  - state hash identical (`b05bb9d18d5fdc8d`);
  - **85/85 drawn animals identical** in id, position, act, hunger, thirst, fatigue and target;
  - 0 duplicate ids; 171 records before and after;
  - **2 deer killed by wolves** near the spawn earlier in the run were still dead, with 2 carcasses. `w7-e`.
  - After unfreezing for 25 s: records 171, dead 2, kills 2 (no resurrection).
- **Forest** (world `w2`, spawn (272, −176)): **66–77 deer and 40–41 wolves drawn** (107–118 animals); 177 records; 132–135 in the full ring and 41–44 coarse. `w7-f`, `w7-g` (overview, deer visible).

**Phone 390×844** (isMobile, touch, DPR 2; quality auto-low on SwiftShader): spawn world, 82 animals drawn, sim source, presence sent, 0 errors. `w7-h`.

**NOT VERIFIED:**
- watching a wolf kill happen on screen (the kills were seen in state, not on screen);
- a fox stalking a hare in the browser;
- a hare's freeze or zig-zag in the browser.

These are covered by tests 4, 8 and 9.

## 5. Performance
- **Sim cost per tick (Node, 600-tick forest run, 165 stepped: wolves 64, deer 99, foxes 2):** median **7.2 ms**, p95 32.6 ms, max 146 ms, after the first 20 ticks, on a loaded host.
- **First ticks after a load or upgrade** derive terrain tiles and plans: 68–425 ms once. This is a one-time hitch, after which the caches are warm.
- **Browser (sim ms from `__metrics.fauna.sim`):**
  - spawn: 0.8–3.3 ms;
  - forest: 1.4–7.9 ms per tick;
  - first tick after load: 127–425 ms.
- **Drawing (fauna section, per frame):** mean 0.47–0.57 ms, p95 1 ms.

| Run | Draw calls | Triangles |
|---|---|---|
| Desktop, spawn | 55–62 | 147–166k |
| Desktop, forest | 40–51 | 222–231k |
| Phone 390 | 39 | 92k |

- **Scene budget:** within 120 draw calls and 250k triangles in every run. The forest is the closest, at 231k.
- **Frame rate:** about 1.7 fps (p50 587 ms) on software GL and a loaded host. That is **not meaningful**, and it was not compared with W6 under the same conditions: NOT VERIFIED.
- **Saves:**
  - the wildlife block is about 154 bytes per record: 21.5–27 KB near the spawn (139–177 records), 25 KB in a fresh world's snapshot after 100 ticks;
  - presence adds **46 bytes per tick** to the journal (281 instead of 235 bytes per tick entry).

## 6. Save and replay
- **v7 save from `12bf1e2`:** byte-identical; replays under v7, with presence ignored; one journaled upgrade to v8 leaves all v7 state untouched (tests 21–22).
- **W1–W6 fixtures:** upgrade straight to v8 (tests 24–29).
- **Equality:** continued, reloaded, compacted and replayed worlds agree (tests 3, 4 and 17, and the browser reload).

## 7. Known limitations
- **No births in W7,** so wolf kills slowly thin the deer where the player stays. The forest run lost 7–9 of about 100 deer in 1,500 ticks (5 game days).
  - Kills happen only in the full ring near the player.
  - Foxes never kill hares, on purpose, because hares have no recruitment. A fox's pounce on a hare always misses, and foxes feed by mousing.
- **Validation trust level:** snapshot validation checks formats, bounds, species acts, tombstones and order. It does not re-derive every record's id to prove the chunk spawns it; an unknown id uses its own position as home. This is the same trust level as W5 and W6.
- **Tree obstacles** are the planned natural trees and ore. A felled tree's stump cell stays blocked; regrown saplings and shrubs are not obstacles.
- **Water within reach:** drinking places are searched within 60 m and must be reachable by the bounded A*. Animals far from water (some wolf packs in deep forest) do not drink, and their thirst stays high; it has no effect beyond that.
- **Frozen animals:** an animal beyond the active area does not move. On waking, only its needs are caught up; its position is not.
- **Reaction time:** animals react to the player only on the 2 s tick (presence), so a reaction can lag by up to 2 s. Detection distances (6–26 m) are sized for that.
- **First-tick hitch** after a load (up to about 425 ms in the browser) while terrain caches warm.
- **Settlement wildlife** remains the ambient presentation tier, not saved, so that settlement hashes do not change.
- **Physical-phone walkthrough: NOT DONE (needs the owner).**
- **Commit hygiene:** `Game/dist` and `Game/tests/.build` are regenerated and dirty.

## 8. Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| Stable identities | Pass | Tests 1–2 (pure derivation, ids, no duplicates) |
| Interacted-with wildlife persists; locations, states and needs survive save and reload | Pass | Test 3 (byte-identical block); browser reload: 85/85 identical, same hash |
| Killed animals stay dead; no duplication or resurrection on reload | Pass | Test 4 (tombstone, carcass, reload, restore, carcass decay, refusal); browser: 2 dead after reload and 25 s of play |
| Existing populations remain functional | Pass | All five species derived and simulated; settlement ambient tier unchanged; farm animals untouched (settlement suites pass) |
| Species-specific behaviour (graze, browse, drink, rest, wander, threat detection, flight, predation, aquatic) | Pass in tests; browser: resting, grazing, browsing, drinking, mousing, patrol and follow, trout rising, herd flight **seen**; stalk, pounce and zig-zag **browser NOT VERIFIED** | Tests 5–12; §4 |
| Reaction to the player's proximity and actions | Pass | Tests 7–9, 11–13 (presence, noise from commands); browser approach |
| Terrain and collision respected; not trapped; no teleport | Pass | Tests 14–16 (287,871 positions; walk-out; stuck at most 3 ticks) |
| Sensible update rates and distance; distant state preserved; optimisation keeps state | Pass | Rings full, coarse, frozen; test 17 (frozen unchanged); test 18 (budget) |
| Performance with meaningful populations | Pass (sim: 7.2 ms median with 165 animals; render within budget with 107–118 drawn); frame rate on real hardware NOT VERIFIED | §5 |
| Tests cover persistence, death, spawning, movement and behaviour | Pass | 30 new tests; 557/557 |
| Old saves preserved (settlement pins and fixtures; W1–W6; new v7 fixture) | Pass | Tests 2, 21–30; full suite |
