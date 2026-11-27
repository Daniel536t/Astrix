# STAB-001 · Bug C: slow and ineffective stewards and villagers (diagnosis)

Status: diagnosis only. No file under `Game/` and no tracked file was changed. Nothing was committed, pushed or deployed.
Branch: `deploy/boxd`. All numbers come from headless runs of the real simulation through `GameSession.dispatch`, the same journaled commands the browser sends.

Owner report: "the stewards, they work slowly or they perform slowly, and not effectively, it took a while for them to attend to the farm I tried building."

## 1. Summary

The villagers are not slow because of navigation. Gates, queues and the A* budget together cost under 4 % of their time. The delays come from rules:

1. **Role and steward rules can leave approved work without a worker, sometimes forever.** On every fresh v6 world the steward's default "Reassign jobs: auto" moves Ada from farmer to herder at tick 105–165. The rule is `herd >= 3 && farm === 0`, and it is true before any field exists. After that:
   - a site approved later waits about 285 ticks for a builder, because of a 300-tick cooldown;
   - **it never gets a woodcutter**, because the woodcutter rule needs a "spare" farmer and only one farmer is left. A fresh store holds 0 wood.
   - Result: a woodshed and a well approved at tick 120 or 400 were **still unbuilt after 1 800 ticks (1 hour of play)**.
2. **Player-ordered work has no priority.** For a farmer, tilling a new field comes last, after every watering, harvest, sowing and threshing errand. With two existing 4 × 4 fields and the default steward, a newly marked 6 × 6 field was **never touched in 900 ticks (30 min)**. With the steward off it took 243 ticks.
3. **Travel dominates every errand.** Moving takes 22–43 % of a villager's time and work takes 5–6 %. Travel-to-work ratios run from 4:1 to 12:1. The store is 22–50 m (path length) from beds, fields and troughs. Villagers walk at 1.3 m/s; the player walks at 4.2 m/s. The game clock runs about 144 times faster than real time (a 10-minute day), but villagers walk at real-time speed.
4. **The day loses a lot of time.** Night is 120 of every 300 ticks (40 %) with no work at all. Villagers also wake hungry (hunger 89–100) because hunger keeps rising while they sleep, and their first stop is the store. The first productive task starts 27–42 ticks after dawn, every day. That is 15–23 % of the 180-tick working day.

## 2. Method and reproduction

Scratch harnesses are in `/projects/sandbox/.tools/scratch/stab-c/`. Each is bundled from `Game/` with `npx esbuild <f>.ts --bundle --platform=node --format=esm --external:three --outfile=<f>.mjs`.

| Script | Purpose |
|---|---|
| `scen.ts` | Scenario F (field) and B (woodshed + well). It logs per-villager state every tick, records milestones, and splits time into travel, gate, queue, work, idle, eating and sleeping. It also emulates the steward: a line-by-line copy of the `assign_role` part of `app/homestead.ts` `runSteward()`, run every tick as the frame loop does, with `lastAssignTick = -1000`. |
| `wood.ts` | Woodcutter throughput: wood delivered, distance to trees, quota holds. |
| `detour.ts` | A* path length vs straight-line distance between homestead points, and gates crossed. |
| `scen-sp{26,39,52,84}.mjs` | Copies of the `scen.mjs` bundle with `VILLAGER_SPEED` patched, for the speed-sensitivity runs. Only the scratch bundle is patched. |

Usage: `node scen.mjs <rules> <seed> <F|B|FB> <fieldW> <fieldD> <steward on|off> <ticks> <startTick>`.
Optional environment variables:
- `PRE=n`: n 4 × 4 fields already marked at tick 0.
- `STOREWOOD=n`: the owner deposits n wood in the store.
- `ASSIGN=villager:2=builder`: the player assigns a job.
- `V=1 TL=n`: print the full per-tick timeline.

Worlds: `GameSession.genesis(seed, GENERATOR_V2)` then `found_homestead { rules }`, the same path the app takes for new worlds (`rules: 6`). Seeds 1337, 42 and 7 were used. Fields were placed with `findFieldSpot` and paid from the bag. Sites were placed with `checkBuilding(...).ok` (v6) and then approved.

Clock: 1 tick = 2 s (`TICK_SECONDS`). A day is 300 ticks (10 min). Night runs from tick 171 to 291 of each day (`NIGHT_START`/`NIGHT_END`, 120 ticks). `VILLAGER_SPEED` is 26 dm/tick (1.3 m/s). The player's `WALK_SPEED` is 4.2 m/s and `RUN_SPEED` is 7.5 m/s.

Founding state on seeds 1337, 42 and 7:
- Store: fiber 20, food 10, seed 6, **wood 0**.
- Player bag: wood 24, stone 48.
- Villagers: Ada (farmer), Bram (herder), Cora (farmer).

## 3. Scenario F: the player marks a field

**Approval.** None is needed. `mark_field` from the player creates the plot (state `wild`) in the same tick (`sim/homestead.ts` `markField`, around line 2283). The `expand_field: 'approve'` policy applies only to fields the steward proposes itself (`app/homestead.ts` around line 326). The planner toast still says "Ada will dig and sow it", even after the steward has made Ada a herder.

### 3.1 Fresh world, field marked at tick `start` (v6, steward default)

| Seed | Field (units) | Start | First claimed | Tilled | Fully sown |
|---|---|---|---|---|---|
| 1337 | 4×4 (2) | 0 | +1 (Ada) | +13 | +49 |
| 1337 | 6×6 (4) | 0 | +1 | +22 | +56 |
| 1337 | 10×10 (12) | 0 | +1 | +55 | +106 |
| 42 | 10×10 (12) | 0 | +1 | +63 | +156 |
| 1337 | 4×4 | 120 | +6 (Cora) | +18 | +53 |
| 1337 | 10×10 | 120 | +6 | +62 | **+253** (threshing for seed, then night) |
| 1337 | 4×4 | 165 (dusk) | **+167** | +190 | +227 |
| 42 | 6×6 | 165 | +4 | +27 | +186 |
| 42 | 6×6 | 400 | +22 | +54 | +94 |
| 42 | 10×10 | 400 | +22 | +89 | **+276** |

Rules v3, v4 and v5 give the same field timings as v6 (6 × 6 at tick 0: tilled +22, sown +56).

Example of a dusk delay (seed 1337, marked at tick 165), read from the timeline:
1. Cora finishes an 8-tick idle task.
2. Night starts at tick 171 and she goes to bed.
3. She wakes at tick 291 with hunger 100, which means she is starving: half walking speed and half work rate.
4. She spends 40 ticks walking to the store and eating (ticks 292–331), queueing behind Bram twice on the way.
5. She starts tilling at tick 332.

### 3.2 Established farm: the new field starves (v6, seed 1337, new 6×6 field, 900 ticks)

| Existing 4×4 fields | Steward | New field claimed | State after 900 ticks |
|---|---|---|---|
| 2 | default (Ada moved to herder at tick 165) | **never** | `wild` |
| 4 | default (no move) | **never** | `wild`; one older field also stuck at `tilled` |
| 6 | default | **never** | `wild` |
| 2 | off (2 farmers) | +243 | sown at +297 |

Why: the farmer's job list in `plan()` (`sim/homestead.ts` lines 1270–1307) is a fixed order:
1. leftover water
2. ripe harvest
3. thirsty fields (watering)
4. sow a tilled field
5. thresh seed
6. till a wild field (last)

A 4 × 4 wheat field cycles every 60 growing ticks. Each cycle needs about 2 watering trips, 1 harvest and 1 resowing, each 10–25 ticks door to door. That keeps about one farmer busy per one or two fields. Nothing marks the owner's new field as more important, so it waits until the farmers are idle, which never happens.

### 3.3 Time budget per villager

v6, seed 1337, 4×4 field at tick 0, steward default, 1 500 ticks (5 days):

| Villager | Travel (walk+gate+queue+stall) | Work | Sleep (+walk to bed) | Eating (walk+eat) | Idle | Starving ticks |
|---|---|---|---|---|---|---|
| Ada (farmer, herder from tick 135) | 41 % | 6 % | 34 % | 13 % | 6 % | 6 % |
| Bram (herder) | 43 % | 5 % | 35 % | 11 % | 6 % | 7 % |
| Cora (only farmer) | 22 % | 5 % | 38 % | 17 % | 19 % | 7 % |

Inside travel, gate opening takes 2–3 % (37–40 ticks per villager over 1 500). Queueing takes under 0.5 % and nav-budget stalls under 0.3 %.

Travel vs work ticks per job (same run):

| Job | Travel:work | Job | Travel:work |
|---|---|---|---|
| egg collect | 105:9 (12:1) | harvest | 147:30 (4.9:1) |
| milk | 137:16 (8.6:1) | sow | 68:16 (4.3:1) |
| shear | 140:20 (7:1) | water field | 115:27 (4.3:1) |
| water trough | 182:27 (6.7:1) | chop (woodcutter probe) | 289:43 (6.7:1) |

**Mornings.** Villagers wake with hunger 89–100 every day. Hunger rises by 1 every 2 ticks, so a 120-tick night adds 60. Eating is only checked when a task is planned, with a threshold of 70, so nobody eats before going to bed. The first productive task starts **27–42 ticks after dawn**:

| Villager | Day 1 | Day 2 | Day 3 | Day 4 |
|---|---|---|---|---|
| Ada | 27 | 31 | 27 | 31 |
| Bram | 35 | 35 | 30 | 34 |
| Cora | 41 | 42 | 36 | 41 |

A starving villager (hunger 100) walks and works at half rate (`stepVillager`, `starving ? VILLAGER_SPEED / 2`, `progress += 1`).

## 4. Scenario B: the player places and approves a woodshed and a well (v6)

Costs (`SITE_RULES`):
- Woodshed: 12 wood + 4 fibre, 24 work.
- Well: 8 wood + 2 fibre, 18 work.

When approved, a site only reserves what the store holds. On a fresh world that is the fibre, and **no wood**.

| Seed | Approved at | Builder assigned | Woodcutter assigned | First delivery | Woodshed done | Well done |
|---|---|---|---|---|---|---|
| 1337 | 0 | t15 (steward, Cora) | t315 (steward, Ada; 300-tick cooldown) | +43 | **+651** | +775 |
| 42 | 0 | t15 | t315 | +37 | **+651** | +743 |
| 1337 | 120 | **t405** (cooldown after the tick-105 farmer→herder move) | **never** | +313 | **not done after 1 800 ticks** | not done |
| 1337 | 400 | t405 | never | +33 | not done | not done |
| 42 | 120 / 400 | t405 | never | +311 / +31 | not done | not done |
| 1337 | 0, owner deposits 30 wood | t15 | t345 | +43 | +164 | +370 |
| 1337 | 0, player assigns Cora builder | t0 | t15 | +28 | +356 | +653 |
| 1337 | 0, 30 wood + player-assigned builder | t0 | t45 | +28 | **+149** (M012's "done at tick 150") | +370 (night in between) |
| 1337 | 120, 30 wood + player-assigned builder | t120 | none | +27 | +257 | +346 |

Older rules, woodshed approved at tick 0 with the default steward: **v4 done at tick 474**, v5 done at tick 651. The v5 sustainable-quota woodcutter is slower. Approved at tick 120, v4 and v5 stall exactly like v6.

What the villagers do meanwhile: Bram, and Ada once she is a herder, keep collecting eggs, milking, shearing and filling troughs (35–46 % of their ticks walking). Herders are never considered for builder or woodcutter jobs.

The stall comes from the steward rules (`app/homestead.ts` lines 300–325):
- `spare = farmers.length > 1 || (farmers.length === 1 && plots.length === 0) ? lastFarmer : null`. After the tick-105 move there is one farmer. That farmer becomes the builder at tick 405, leaving no farmers, so `spare` is null and no woodcutter is ever made.
- `tick - lastAssignTick >= 300`: only one reassignment per 300 ticks (10 min).
- `lastAssignTick` lives in memory and is reset to -1000 on every page load. The same world therefore behaves differently depending on when the page was reloaded. Each move is journaled, so replay is still exact.
- The panel status "waiting for wood: none free in the store" is correct. The owner's only fix is to deposit wood or assign people by hand.

Woodcutter throughput (`wood.ts`, Ada as woodcutter from tick 0, 900 ticks):

| Rules | Seed | Wood stored | Mean tree distance from store | Quota idle |
|---|---|---|---|---|
| v6 | 1337 | 33 | 54 m | 40 ticks |
| v6 | 42 | 36 | 42 m | 89 ticks |
| v4 | 1337 / 42 | 48 | 53–61 m | none (no quota) |

That is about 11–12 wood per day under v6. A woodshed plus a well need 20 wood, which is about 2 days of one woodcutter.

## 5. Task selection, interruption and carried loads (code reading)

**How a job is chosen.** `plan()` (`sim/homestead.ts` 1216–1406) runs only when a villager has no task. The order is:
1. eat (hunger ≥ 70)
2. rest (night or energy ≤ 10)
3. builder's carried site load
4. store whatever is carried
5. sow carried seed
6. move overflow into the store
7. the role's fixed list
8. idle (an 8-tick wait near home)

A job is a single target, and `claimed()` excludes targets someone else has taken, so no two villagers work the same field or site. Roles are exclusive:
- farmers do only fields;
- herders only animals;
- builders only sites;
- woodcutters only trees.

Nothing ranks player-ordered or approved work above routine work, and nothing looks at distance or batches errands. The only "nearest" choices are the woodcutter's tree, the well for water and the store for fetching.

**Interruption.** Once planned, a task runs to its end. The exceptions:
- `assign_role` drops the task (except rest);
- a chop or plant task that is still on its first walk leg at nightfall is replanned;
- an unreachable job is abandoned after 15 ticks (`NAV_GIVE_UP`).

Idle (up to about 10 ticks), long tilling legs (a 10 × 10 field is one 48-tick leg) and sleep cannot be interrupted. A tilling leg started at tick 170 runs on into the night.

**Carried loads.** These are safe:
- `PICKUP` refuses a second load while hands are full;
- after a reassignment the next plan stores the load;
- a builder's site-tagged load stored by a non-builder becomes free stock again, because `siteShortfall` counts carried amounts and `reserveSites` re-reserves;
- saplings are dropped by non-woodcutters, which is by design.

The one loss path: a load whose store is full on arrival "spoils" (`stepVillager`, around line 1838). This path is unchanged, and the overflow pile (300) makes it rare.

**Night.** 40 % of every day. Crops and drying pause too (`stepPlots`). Nobody plans work after about tick 165 if it cannot finish before night.

## 6. Walking speed and distances

`detour.ts`, v6. Path length is the A* path over cell centres.

| Route | Seed 1337: straight → path (×), gates | Villager ticks (seconds) | Player walk (seconds) |
|---|---|---|---|
| store → bed | 23.7 → 32.3 m (×1.36), 1 gate | 12.4 (25 s) | 8 s |
| store → nest box | 32.8 → 42.8 m (×1.31), 1 | 16.5 (33 s) | 10 s |
| store → 6×6 field | 22.3 → 33.4 m (×1.50), 0 | 12.8 (26 s) | 8 s |
| well → field | 16.0 → 21.5 m (×1.34), 0 | 8.3 | 5 s |
| store → paddock trough | 50.4 → 58.0 m (×1.15), 1 | 22.3 (45 s) | 14 s |
| bed → field | 7.0 → 16.7 m (×2.39), 1 (door) | 6.4 | 4 s |
| woodcutter: store ↔ trees | 42–61 m one way | 16–24 per leg | — |

Seed 42 gives similar figures (store → bed ×1.54, store → field 42.9 m).

- **Moving speed.** While actually moving, villagers cover 22.6 dm/tick on average, 87 % of the nominal 26. The loss is the unused remainder at the end of each leg and walking cell-centre to cell-centre.
- **Gates.** Each closed gate costs one tick to open. Closing is free. Gates add up to 2–3 % of a herder's ticks.
- **Placement.** The store sits next to the founder house, 24–50 m from everything the villagers use, and every meal, sowing, harvest and egg run goes through it.

Speed sensitivity (seed 1337, steward off so roles stay fixed; only `VILLAGER_SPEED` changed, in the scratch bundle):

| `VILLAGER_SPEED` (dm/tick, m/s) | 26 (1.3) | 39 (1.95) | 52 (2.6) | 84 (4.2 = player walk) |
|---|---|---|---|---|
| Woodshed done (30 wood + builder, approved at 0) | +149 | +92 | +75 | +63 |
| Well done | +370 | +161 | +136 | +120 |
| New 6×6 field with 2 existing fields: claimed / sown | +243 / +297 | +22 / +64 | +23 / +243 (night) | +14 / +56 |
| Farmer idle share (fields saturated vs not) | 24–35 % | 33 % | 36–37 % | 40–41 % |
| Herder walking share | 33 % | 37 % | 35 % | 31 % |

At 1.5× speed, the field-starvation case goes from +243 to +22, and the well finishes before the night. Beyond 2× the gains are small, because sleep (about 33 %) and fixed work ticks dominate. The herder's walking share barely changes: animal products pile up faster than trips, so a faster herder simply does more trips.

## 7. Root causes, ranked by measured impact

| # | Cause | Evidence | Impact |
|---|---|---|---|
| 1 | Steward role rules: the early farmer→herder move, the 300-tick cooldown, the woodcutter only taken from a "spare" farmer, herders never reassigned, `lastAssignTick` not saved | B approved at tick ≥ 105: builder +285 to +299, woodcutter never, not built after 1 800 ticks | Unbounded |
| 2 | No priority for player-ordered work; fixed per-role order puts tilling a new field last; roles exclusive, so herders and idle builders never help | new field with 2–6 existing fields: never claimed in 900 ticks (+243 with the steward off) | Unbounded or about 1 day |
| 3 | Night with no work: 40 % of the day; tasks run through dusk; the 10-minute day | marking at tick 165: first claim +167, sown +227 | +120–170 ticks |
| 4 | Hunger rises during sleep and is only checked when planning, so villagers wake starving; meals only at the store | 27–42 ticks lost each morning; 6–8 % of ticks at half speed | about 15–23 % of each working day |
| 5 | Errands dominated by travel: one item per trip (builder 8, eggs from 3), no batching or chaining, store 24–58 m away by path | travel:work 4:1 to 12:1; travel 22–43 % vs work 5–6 % | Throughput ×0.2 |
| 6 | One worker per target: no parallel tilling, sowing or building | 10×10 field: 48 ticks of tilling by one farmer while the other farmer idles | ×1/N on big jobs |
| 7 | Walking speed 1.3 m/s against a compressed clock (player 4.2 m/s) | table in §6 | 1.5×–2× faster builds |
| 8 | Cannot interrupt idle, tilling or sleep | ≤ 10 ticks idle; a tilling leg runs into the night | Small |
| — | Gates, queues, nav budget | under 4 % in total | Not a cause |

## 8. Proposed corrections

All of these change journaled simulation behaviour, so they need settlement rules v7. Steward changes in `app/homestead.ts` are journaled commands, so they do not need a rules bump, but they change new journals.

1. **Priority classes in `plan()`** (v7):
   - P0 safety: eat, sleep, store a carried load, sow carried seed.
   - P1 player orders: approved sites, player-marked fields until first sown, explicit "prioritize" flags.
   - P2 urgent upkeep: troughs ≤ 14, a crop near withering (`dry` ≥ WITHER/2), strays.
   - P3 routine: eggs, milk, shear, ordinary watering, harvest.
   - P4 idle.

   Within a class, choose by age, then distance. Add an aging bonus so that P3 work older than N ticks moves up one class. That way routine work cannot be starved either.
2. **Role-flexible help.** Keep roles as preferences: a villager does its own role's P1–P2 work first, then any role's P1 work.
   - An idle herder can haul for a site or till an ordered field.
   - Builders and woodcutters do not leave a site in progress.
   - This removes the dependency on the steward for approved work.
3. **Steward fixes** (`runSteward`):
   - do not make the `farm === 0 → herder` move while there are fewer than 1 field per farmer, or within the first day;
   - an approved site short of wood with no woodcutter takes any non-builder villager, the herder included, not only a "spare" farmer;
   - shorten the cooldown to 60 ticks for moves serving approved work;
   - save `lastAssignTick` in the homestead state (v7) so a reload does not change behaviour;
   - make the planner toast name the actual farmers.
4. **Preemption where safe.** A new P1 order may cancel a P3/P4 task that is still on its first walk leg, or an idle task, with nothing carried. Never preempt while carrying, holding a gate, or partway through a work leg. Split tilling into per-unit legs (4 ticks each) so night or a reassignment stops cleanly and progress (`plot.tilled` already exists) is kept.
5. **Night and hunger.**
   - Eat before bed if hunger ≥ 40 (planned at dusk).
   - Slow hunger while sleeping (for example +1 every 6 ticks).
   - Do not start work that cannot end before `NIGHT_START`; prefer short jobs near dusk.
   - Optionally, a food shelf in the farmhouse (eat at home).
6. **Batching and chaining.**
   - The builder carries mixed loads up to 8 + 8 (wood and fibre).
   - After a delivery, build at once if work is allowed (this already happens), and chain the next fetch from the same store.
   - Collect eggs together with nearby milking or shearing.
   - A farmer with water left over waters the next dry field (this partly exists).
   - Raise the egg threshold to cut trips.
7. **Parallel work.** Allow 2 workers per field above 4 units and per site (split by unit or by material). Claim `target#k` slots instead of one target.
8. **Speed tuning, based on §6.** Raise `VILLAGER_SPEED` to 39 dm/tick (1.95 m/s, 1.5×). The measured gain is large (field starvation +243 → +22; well +370 → +161). The look should still be a brisk walk; animate it with a faster gait. Values above 52 give little more. Keep starving at half speed.
9. **Skills later.** Add a per-villager work-rate multiplier once 1–8 are in place. Not needed for this bug.

## 9. Risks

- **Determinism.** Every change goes inside `stepHomestead`/`plan` and uses only authoritative state. Priority and tie-breaks must be total orders (id, then tick). Distance-based choices must use integer dm; A* expansion order is already deterministic. The nav budget (40 000 expansions per tick) is shared: faster walkers and more replanning use more of it. Measured use is 59 k expansions over 900 ticks, far below the limit.
- **Rules version.** v1–v6 journals must replay unchanged. Gate every behaviour change on `h.version >= 7`, add `upgrade_homestead { rules: 7 }`, and make new worlds found with v7. The steward's saved cooldown and any per-plot or per-site priority flag need `validateHomestead` and snapshot fields (v7 only).
- **Old saves.** Loading upgrades to v6 today (`app/homestead.ts` line 141). Moving to v7 adds one journaled upgrade, as M012–M014 did. Woodcutter quota and timber-store behaviour must stay the same, or be documented.
- **Balance.** Faster or flexible villagers produce more. Crop drain, the woodland quota and store capacity may need retuning. Watch the store-full "spoil" path once throughput rises.
- **Carried loads.** Preemption must never drop a load. Gate it on `v.carry === null` and on first-leg-walk only, and test site-tagged loads specifically.

## 10. Tests to add (new `tests/stab001.workers.test.ts`)

1. Fresh v7 world, player field 6 × 6 marked at tick 0, 120 and 400: tilled and sown within the limits in §11.
2. Established farm (2 and 4 fields) plus a new player field: the new field is claimed within the limit while the routine fields keep moisture above wither.
3. Woodshed and well approved at tick 0, 120 and 400 on a fresh world with the steward default, no owner help: both done within the limit. This regression catches the "never" case.
4. Preemption: a new order cancels an idle or first-leg routine task with empty hands, and never a carrying task. Carried totals are conserved every tick (extend the M014 wood-conservation check to all items).
5. Night: no task starts after tick 165 whose estimated length crosses `NIGHT_START`. Wake hunger is below 70.
6. Determinism: save/reload mid-task gives the same hash; replay from genesis matches; v1–v6 golden journals are unchanged.
7. Steward: no farmer→herder move while there are fewer fields than farmers; a site short of wood gets a woodcutter within 60 ticks of approval; the cooldown survives save/reload.

## 11. Acceptance criteria (measured with this harness, seeds 1337, 42 and 7, v7)

| Case | Today (v6) | Target |
|---|---|---|
| Player 6×6 field marked in daytime on a fresh world: first sown | +56 to +94 | **≤ +60 ticks** |
| Player 10×10 field (needs threshing) in daytime: sown | +106 to +276 | **≤ +120 ticks**, or before the next dawn + 30 |
| New field on a farm with 2–4 fields: first claimed | never / +243 | **≤ +30 ticks** in daytime |
| Field marked within 10 ticks of dusk: worked | +167 | first claimed **≤ dawn + 15** |
| Woodshed approved at tick 0, 120 or 400, fresh world, steward default, no owner help | +651 / never | **done ≤ +300 ticks** (one day) |
| Woodshed with materials in store and a builder | +149 | **≤ +100 ticks** |
| First productive task after dawn | 27–42 ticks | **≤ 15 ticks** |
| Share of daytime ticks spent on work legs | 5–6 % of all ticks (8–9 % of awake ticks) | **≥ 15 % of awake ticks** |
| Ticks starving | 6–8 % | **< 1 %** |
| Carried-load conservation, determinism, v1–v6 replay | pass | **pass, unchanged** |
