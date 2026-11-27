# STAB-001 Bug B: the player walks through animals

Diagnosis and design only. No file under `Game/` and nothing tracked in git was changed.
Repo `Astrix`, branch `deploy/boxd`. Scratch scripts: `/projects/sandbox/.tools/scratch/stab-b/` (`repro.ts`, `crowd.ts`, bundled to `.mjs` with esbuild from `Game/`).

## Owner requirements (verbatim)

"The player must not walk through an animal. Animals must not walk through the player. Animals should attempt to step aside or move around the player where appropriate. Crowded areas must not permanently trap animals or the player. Animal movement, player movement, villagers, fences, gates and buildings must remain coherent. Do not solve this by making animals immovable obstacles. Avoid unstable collision jitter, overlapping and oscillation. Use the appropriate shared physical-world rules rather than adding an unrelated collision system."

---

## 1. Reproduction

### 1.1 Headless test (`repro.ts`)

Seed 1337, generator v2, `found_homestead { rules: 6 }`, chunks made resident around the paddock. A straight, clear 6 m stretch inside the paddock was chosen (`canStandAt` true along it). Cow `animal:011` was placed 3 m ahead of the player. Then:

| Case | Result |
|---|---|
| Player walks +x for 60 fixed steps (2 s) toward the cow | Ended at x = -17.26, 5.2 m **past** the cow (x = -22.50). Minimum centre distance **0.06 m**. 12 steps inside a 0.5 m body. |
| `settlementHits` at the cow's position | `[]` (nothing in the player's collision layer is there) |
| Player stands still at x = -24.0; cow's target set 1.5 m beyond the player; 8 journaled `tick` commands | Cow x per tick: -24.8 (d 0.80), **-24.1 (d 0.10)**, -23.4, -22.7, -22.5. It walked straight through the player's position. |

### 1.2 Animal crowding today (`crowd.ts`, 600 ticks, rules v6, 22 animals, 3 villagers)

- Extra animals sharing a 1 m nav cell, summed over ticks: **1106**; at most 3 animals in one cell.
- Animal pairs closer than 0.5 m (animal-tick pairs): **1307**.
- Villager-ticks spent in a cell that holds an animal: **12**.
- Whole `tick` command, 600 ticks: 375 ms in Node (about 0.6 ms per tick), the baseline for the performance budget below.

### 1.3 What the player collides with today (`Game/src/sim/character.ts`)

Per fixed step (`FIXED_STEP` 1/30 s, `stepCharacter`, line 323), the horizontal move is axis-separated (line 389). An axis move is accepted only if `clear()` (line 264) holds:

1. **Voxels** (`overlapsTerrain`, about line 183): the 0.3 m radius by 1.7 m box against resident solid voxels. Unloaded columns and `Y_MIN` count as walls.
2. **Structure modules** (`overlapsStructures`, line 198): founder-scene boxes (yaw-rotated), except `crop_row`. Their tops are also floors (`structureFloor`).
3. **Settlement structure layer** (`settlementHits`/`settleBlocked`, lines 247 to 262), added in M012: fence and gate edges (gates and the farmhouse door only while not `open`), and solid cells (buildings, shelters, troughs, store, barn, finished sites). These come from `structureHits` in `sim/nav.ts` (line 583) on the cached `homesteadNav` grid (`settlementCollision`, `sim/homestead.ts` line 542). Anything already overlapped at the start of the move never blocks.
4. **Natural entities** (`resolveEntities`, line 269, run after the move, line 446): tree trunks and stumps, rocks and ore as circles. The player is pushed out radially if the pushed spot is `clear()`. Shrubs are skipped.

Nothing in that list is a moving body. Homestead animals, villagers and wildlife are not consulted anywhere in `character.ts`, and `canStandAt` (line 505) ignores them too.

## 2. Root cause

**Where collision is defined.** Player collision is defined only against static or slow layers: voxels, structure modules, the settlement nav grid (structure bits only) and world entities. Dynamic actors live elsewhere:

- **Homestead animals** (`sim/homestead.ts`): integer decimetre positions inside the hashed homestead state, moved once per 2 s tick (`TICK_SECONDS = 2`, `app/sim-clock.ts`). Under rules v3 and later, `liveAnimal` (line 1960) and `walkAnimal` (line 2034) route with `findPath(..., { openGatesOnly: true })`. That search sees only grid blocks and edges. No `avoid` filter and no occupancy map is passed in, so animals ignore each other, villagers and the player. Rendering (`render/homestead.ts`, `Herd.advance`/`draw`, lines 335 to 360) interpolates linearly between ticks.
- **Villagers**: rules v3 builds a cell occupancy map from villagers only (`stepHomestead`, lines 2100 to 2111; `footprint`, line 1782). `navStep` (`sim/nav.ts`, line 940) never enters an occupied cell. It queues, detours (`DETOUR_EVERY`) or breaks a head-on standoff by having the later id step aside (`queue`, line 1079). Animals are not in this map, and neither is the player. M012 REPORT.md lines 211 and 484 already record this: "Villager avoidance is between villagers only", "villagers do not treat the player as an obstacle".
- **Wildlife** (`sim/fauna.ts`): ambient, app-tier, not saved and not hashed. Each creature steps at 10 Hz in `render/fauna.ts` and gets `threats: [player x,z]` from `main.ts` line 744. It flees once the player is within `wariness` (3.5 to 14 m). There is no contact rule, so a creature that is stalking, following, or cornered can still overlap the player. Wildlife also ignores fences and buildings: it only checks terrain through `landOk`.

**Why animals are absent.** The player-side layers are static caches keyed by world revision. Animals move every tick and sit in a different tier: hashed sim at 0.5 Hz, while the player runs player-local at 30 Hz. The reverse direction is missing for a structural reason. The player's position is **not in the sim**: no command carries it, and `tick` is `{ ticks }` only (`app/session.ts` lines 95 and 457). The hashed sim therefore cannot react to the player without breaking replay. That is why nothing was built.

**Summary of current relations**

| A \ B | player | villager | animal | wildlife | fences/gates/buildings |
|---|---|---|---|---|---|
| player | — | passes through | **passes through** | passes through | collides (M012) |
| villager | not seen | cell reservations, queue, step-aside | not seen | not seen | routes (nav grid) |
| homestead animal | **not seen** | not seen | not seen (stack up to 3 per cell) | n/a | routes, open gates only |
| wildlife | flees at a distance, no contact rule | not seen | not seen | predator/prey only | not seen (terrain only) |

## 3. Design options

### Constraints any option must respect

- **Determinism:** homestead state is hashed and replayed from the journal. Anything the sim reacts to must be in a journaled command. Drawn or interpolated positions must never feed the sim.
- **Rates:** the sim ticks every 2 s. Animals walk 0.7 m per tick (`ANIMAL_SPEED` 7 dm, 0.35 m/s) and are driven at 1.2 m per tick (`DRIVEN_SPEED`, 0.6 m/s). Villagers walk 2.6 m per tick. The player moves 4.2 to 7.5 m/s at 30 Hz. Whatever the sim knows about the player is up to 2 s stale, so contact at frame rate must be handled player-side.
- **Existing shared rule:** the v3 cell occupancy map plus `navStep` queue and step-aside is already the settlement's rule for "bodies do not share space". The owner asks for the shared physical-world rules rather than a new system.

### Option A: journaled player presence in the shared occupancy layer, plus player-side soft contact (recommended)

- **Sim:** the `tick` command gains an optional, quantised `presence` (the player's cell position in dm and coarse move direction). Under a new rules version, presence is stamped into the same occupancy map villagers already use, under id `player`. Animals get that map too. They route around presence cells, never enter them, and step aside deterministically when the player is adjacent.
- **Player:** `stepCharacter` gets optional dynamic bodies, built app-side from the *drawn* (interpolated) positions of animals, villagers and wildlife. The player slides around them. If already overlapping, the player is separated at a capped speed. There is no hard hold.
- **Pros:** reuses the existing occupancy, queue and give-up rules. Small journal change. Old journals and hashes are unchanged. Animals visibly yield.
- **Cons:** the sim reacts up to 2 s late. Contact in between is soft and player-side.

### Option B: a shared continuous dynamic-body layer in the sim

All villagers, animals and a player proxy become circles or capsules in dm with separation steering inside the sim tick.

- **Pros:** physically uniform.
- **Cons:**
  - It replaces the M012 cell reservations, queueing and step-aside, which puts the M012, M014 and nav tests at high risk.
  - It still needs journaled player presence, and the proxy is still 2 s stale, so player-side contact is still needed.
  - Continuous separation at 0.5 Hz oscillates unless heavily damped.
  - Search cost goes up.

Not recommended now. Option A's cell layer can grow into it later.

### Option C: player position authoritative (journaled movement input)

Journal input at 30 Hz so the sim runs `stepCharacter`. `character.ts` notes this as the eventual multiplayer direction.

- **Cons:** journal volume (about 30 entries per second), a large architecture change, and it couples rendering cadence to the sim.

Out of scope for a bug fix.

### Option D: player-only soft collision (no sim change)

- **Pros:** fixes "the player walks through animals" cheaply.
- **Cons:** animals still walk into the player (the player is shoved) and never step aside. It meets requirement 1 but not 2 or 3.

Acceptable only as stage 1 of Option A.

### Option E: render-only avoidance (drawn animals bend around the player)

- **Cons:** drawn positions diverge from sim positions, so herder work spots and gate logic disagree with what is shown.

Reject, except as a cosmetic of at most a few cm.

(Making animals immovable obstacles is excluded by the owner.)

## 4. Recommended design: Option A

### 4.1 Rules version and journal

- New `HOMESTEAD_CONTACT_VERSION = 7` in `sim/homestead.ts`, added to `HomesteadVersion`, `HOMESTEAD_VERSIONS`, `found_homestead`/`upgrade_homestead { rules: 7 }` and the `RULES` lists in `app/session.ts`. Rules v1 to v6 ignore presence completely, so every existing journal, snapshot and hash is unchanged.
- `TickCommand` gets `presence?: { x: number; z: number; mx: -1|0|1; mz: -1|0|1 }`:
  - `x` and `z` are integer dm, validated as ints within the homestead nav region plus a margin.
  - `mx` and `mz` give the sign of the player's intended motion.
  - Strict keys; anything else is rejected.
  - The field is omitted when explore mode is off, the player is dead or swimming, the player is outside the nav region, or the player's feet are more than 1.5 m above the grid ground (for example on a roof).
- `realtimeTick(presence)` (`app/life.ts`) fills it from `explore.character` at dispatch. The same presence applies to every tick of a multi-tick command (timescale catch-up), which is correct because the player is frozen relative to those ticks.
- Presence is input, not state. There is no snapshot change and no new saved animal field, and replay reproduces it from the journal. Cost is about 40 bytes per tick entry, on entries that already exist every 2 s.

### 4.2 Shared occupancy (sim, v7)

- At the start of `stepHomestead`, when presence is given, compute the player cells: the cell containing the player, plus each neighbour cell the 0.3 m player radius reaches into (1 to 4 cells).
- Put them in a per-tick `occupied: Map<cell, id>` under id `player`. This is the same map type villagers use. It is created before `stepAnimals` and then passed on into the villager loop, so villagers and animals see the same player.
- **Villagers:** the map is seeded with the player cells before villager footprints. `navStep` then already routes around the player, queues ("waiting for you to pass", "queueing at the pen gate behind you"; `nameOf('player') → 'you'`) and gives up after `NAV_GIVE_UP` (15 ticks) with the reason kept. `waitingOn('player')` returns undefined, so villagers never wait for a step-aside from the player.
- **Gate guard:** `closeBehind` (`nav.ts` line 1117) does not close a gate while a player cell is one of the gate's two cells. The player would not be held anyway (`settleBlocked`), but this avoids a gate visibly shutting through the founder.
- **Animals:** `walkAnimal` passes `avoid: i => occupied.get(i) === 'player'` to `findPath`. Before entering the next cell, it rechecks that the cell is not a player cell, as `navStep` does. If there is no route that avoids the player, the animal does **not** take the plain route through the player. It falls into the existing "no way there" branch: it stands and chooses again later, and a `go: 'out'` intent is dropped. Driven strays (`go: 'home'`) wait outside the gate, bounded by `HOLD_GATE_TICKS`. Animals cannot be stuck forever on the player: they re-choose targets, and the player always moves eventually or the herder's hold ends.
- **Stage 2 (not required for Bug B, same mechanism):** animals also stamp their own footprint, one cell for small species and two cells along the heading for cattle and horse. That gives animal-animal and villager-animal separation. It needs care with herder work spots (milk and shear goals are adjacent cells) and gate queues. The measured overlap (1106 cell shares in 600 ticks) is the baseline.

### 4.3 Step-aside rule (deterministic, `liveAnimal`, v7)

At the start of an animal's tick, if a player cell is within Chebyshev distance 1 of the animal's cell (distance 2 for cattle and horse), the animal yields before doing anything else except eating where it stands:

1. **Candidates:** the 8 neighbour cells in the fixed `DIRS` order. A candidate must:
   - be inside the grid and allowed by `canMove` (fences and corners respected);
   - not cross any gate (same rule as `queue()`);
   - not be a player cell or inside the personal-space ring;
   - keep the animal on the same side of its enclosure fence (`insideRect` unchanged).
2. **Score** (integer):
   - Increase Chebyshev distance from the player cell.
   - Add a bonus for being off the player's motion line (`mx`, `mz`): cells perpendicular to the player's heading win, so the animal clears the path instead of being herded ahead.
   - Break ties by `DIRS` order.
3. **Move:** toward the chosen cell centre at `max(ANIMAL_SPEED, 10)` dm per tick ("startled"), and set `tx`/`tz` there.
4. **No candidate** (cornered): stand still. Player-side contact (4.4) then separates the player instead.
5. **Hysteresis without new state:** while presence is given, new wander targets (`randomPointIn`, `strayCell`) within 2 m of the player are rejected (up to 3 deterministic retries, then stay). An animal that just stepped away does not wander straight back, and a stationary player produces at most one yield per animal, not oscillation.

No `rnd(h)` draws are added on the no-presence path, so v7 without presence equals v6 behaviour tick for tick (a test checks this).

### 4.4 Player-side contact (`stepCharacter`, app-tier)

- **Signature:** `stepCharacter(world, prev, input, dt, bodies?)`. `bodies` is a `ReadonlyArray<DynamicBody>` with fields `{ id, x, z, y, h, r, hl, heading }`, a capsule with radius `r` and half-length `hl` along `heading`. Absent or empty means behaviour identical to today, so all existing tests keep their results.
- **Bodies source:** drawn positions, so collision matches what the player sees.
  - `HomesteadView.bodies()` reads `Herd.seen` (`sx`, `sz`, shown heading) and the `people` drawn positions.
  - `FaunaView.bodies()` reads interpolated creatures; trout are excluded.
  - `explore.update` currently runs before `homesteadGame.update` (`main.ts` lines 703 and 729), so it uses last frame's drawn positions. A lag of one frame or less is harmless.
- **Blocking:**
  - In the horizontal axis loop, an axis move is rejected when it would *increase* penetration into any body. The check uses the closest point on the capsule segment to the player, with contact distance `r + CHARACTER_RADIUS`. Rejection means sliding along the other axis, as with fences.
  - Moves that keep or reduce penetration are always allowed. The player is therefore never held by something already overlapping, which mirrors the `settleBlocked` rule.
  - A body is ignored if the player's feet are above its top (`y + h`) or the player is swimming.
- **Separation:** after the move, for each overlapping body, the player is pushed along the normal by `min(penetration, SEP_SPEED * dt)`, but only to `clear()` positions (never into fences or terrain).
  - `SEP_SPEED = 1.5` m/s. That is faster than any interpolated animal (0.6 m/s at most), so an animal walking into a standing player nudges the player at the animal's own speed and overlap never grows. It is far below walk speed, so there is no visible pop.
  - There is no positional snap and no velocity reflection, which avoids jitter.
  - When a `SNAP_DISTANCE` pop (load, teleport) puts a body on the player, the overlap clears over a few frames.
- **Escape guarantee:** the player always has at least the moves that do not deepen penetration. Between a fence and a cornered cow, the player can walk away along the escape normal. A cornered player in a full pen is separated at `SEP_SPEED`, and the sim moves the animals aside within one tick.
- **Bump-to-yield:** sustained contact needs no extra mechanism. The next `tick`'s presence carries the player's cell and heading, and the animal steps aside within 2 s or less.

### 4.5 Body sizes (proposal; tune against `render/animal-models.ts`)

Cattle model: about 0.92 m wide and 2.3 m nose to tail.

| Body | r (m) | hl (m) | h (m) |
|---|---|---|---|
| player | 0.30 | 0 | 1.70 |
| villager | 0.30 | 0 | 1.70 |
| chicken | 0.15 | 0 | 0.45 |
| sheep | 0.35 | 0.25 | 1.0 |
| goat | 0.30 | 0.25 | 1.0 |
| pig | 0.38 | 0.25 | 0.9 |
| cattle | 0.46 | 0.60 | 1.6 |
| horse | 0.42 | 0.70 | 1.8 |
| deer / fox / wolf / hare | 0.3·length, at least 0.12 | 0.3·length | per model |

Juveniles scale by the renderer's young scale. These values live in one table in a new `sim/bodies.ts`, shared by the sim (personal-space ring per species) and the app (capsules).

### 4.6 Wildlife

Wildlife is app-tier, not hashed and not saved, so it can be handled directly:

- The player collides with wildlife bodies as in 4.4.
- In `stepCreature`, the heading fan (`sim/fauna.ts` about line 322) rejects any step that ends within `r + 0.3` m of a threat. The flee rule already keeps creatures away. This only covers stalk, chase, follow and cornered cases.

Wildlife versus fences and pens is a separate gap and is not part of Bug B.

### 4.7 Gates and pens

- **Player standing in a gate cell:**
  - Animals do not pass. They re-choose, and a `go: 'out'` intent is dropped.
  - Driven strays wait outside.
  - Villagers queue and then give up after 15 ticks with a visible reason.
  - The gate is not auto-closed onto the player.
  - When the player leaves, everything proceeds on the next tick.
- **Escapes:** step-aside never crosses a gate or the fence line, so the player cannot shove animals out of a pen or into the wrong one.
- **Open gate:** routing around the player through the open gate is a normal route. Escapes stay governed by `ESCAPE_CHANCE`.

### 4.8 Performance

- **Sim:** at most 4 presence cells per tick. Each animal does one Chebyshev check plus at most 8 candidate checks when adjacent. The `avoid` filter costs one Map lookup per expansion, and searches stay within the existing `ANIMAL_SEARCH` and `ANIMAL_TICK_BUDGET`. Expected added cost is under 5% of the 0.6 ms per tick baseline.
- **Player:** up to 60 animals, 8 villagers and about 50 nearby wildlife bodies. A broad-phase cull at 3 m from the player leaves only a handful of capsule tests per step, well under 0.05 ms per step.

## 5. Files to change (when implementation is approved)

| File | Change |
|---|---|
| `Game/src/sim/bodies.ts` (new) | `DynamicBody`, capsule closest-point and penetration, species body table, presence quantisation and presence-to-cells helper |
| `Game/src/sim/homestead.ts` | `HOMESTEAD_CONTACT_VERSION = 7` plus lists and `upgradeHomestead`; `stepHomestead(world, tick, presence?)`; shared `occupied` built before animals; `liveAnimal` step-aside and target hysteresis; `walkAnimal` avoid filter and next-cell check; villager map seeded with player cells |
| `Game/src/sim/nav.ts` | `closeBehind` guard against player cells on a gate's cells (through a `NavContext` option); `'player'` naming hook |
| `Game/src/sim/character.ts` | optional `bodies` in `stepCharacter`: no-deepen axis test plus capped separation; exports for tests |
| `Game/src/sim/fauna.ts` | threat personal-space rejection in the heading fan |
| `Game/src/app/session.ts` | `TickCommand.presence` type and strict validation; pass to `stepHomestead`; rules 7 in `found_homestead`/`upgrade_homestead` validation |
| `Game/src/app/life.ts`, `Game/src/main.ts` | build presence from the explore character at dispatch; pass bodies to explore |
| `Game/src/app/explore.ts` | body provider hook into `stepCharacter` |
| `Game/src/render/homestead.ts`, `Game/src/render/fauna.ts` | `bodies()` from drawn positions |
| `Game/src/app/homestead.ts` | rules v7 upgrade entry or text, if the UI lists rules |
| `Game/tests/stab001.contact.test.ts` (new) | tests below |

## 6. Tests required

1. **Player into a body:** walking at a static cow, sheep or chicken capsule stops at contact distance ±0.02 m and never ends deeper. At 45° the player slides past.
2. **Overlap at start:** a body placed on the player separates the player monotonically: distance never decreases, at most one sign change in the derivative over 60 steps, and no jitter while standing.
3. **Moving body:** a body interpolated at 0.6 m/s into a standing player keeps penetration ≤ 0.05 m at all times.
4. **No bodies:** identical `CharacterState` sequence to the current code over the existing m004/m012 walk scenarios. All existing tests pass.
5. **Pinned case:** with a fence on one side and a cornered cow on the other, the player can walk out within 1 s and is never held.
6. **Presence on an animal's route (v7):** over N ticks the animal never enters a player cell, it reaches the goal by detour or re-chooses, and every move passes `assertGridMove` (the existing m012 helper).
7. **Adjacent presence:** the animal steps to a free neighbour away from the player and off the player's motion line, stays on its side of the fence, and never crosses a gate. A stationary player causes no re-approach: no animal in the ring after tick 2, and no oscillation over 100 ticks.
8. **Gate case:** with the player in the pen gate cell and the gate open, no animal passes, strays wait, and the herder's hold ends. After the player leaves, the round-up completes. No animal or villager waits more than the bounded ticks.
9. **Crowding:** with the player in a corner of a full coop and a full pen for 300 ticks, no animal shares a player cell after the first tick, animals still eat (no starvation), and the player can walk out (headless, with bodies built from sim positions).
10. **Villagers:** with presence in the farmhouse door cell, the villager queues ("waiting for you"), then proceeds once the player leaves, and gives up per `NAV_GIVE_UP` if the player never leaves.
11. **Determinism:** journal replay with presence gives an identical hash. A v6 journal is byte-identical in outcome. v7 without presence equals v6 per tick.
12. **Validation:** bad presence (non-int, out of range, extra keys, `mx = 2`) is rejected. Old builds' journals still load.
13. **Wildlife:** an approaching player never overlaps a deer, hare or fox body, and a stalking fox never steps into the player.
14. **Performance:** 600-tick v7 run with presence at most 1.05 × baseline. `stepCharacter` with 120 bodies costs ≤ 0.05 ms per step (Node).
15. **Browser evidence:** screenshots of the player stopped at a cow, a sheep stepping aside, a villager queueing behind the player at a door, and the player walking out of a crowded pen.

## 7. Acceptance criteria

- The player never ends a fixed step deeper inside a drawn animal, villager or wildlife body than at the start of that step, and is separated within 0.5 s of any overlap.
- With v7 rules and presence, no homestead animal's sim position enters a player cell. An animal adjacent to the player steps aside within one tick when a legal cell exists.
- No animal or villager waits on the player indefinitely: bounded by the existing re-choose, `HOLD_GATE_TICKS` and `NAV_GIVE_UP` rules. The player can always leave any crowd.
- No body crosses a fence or closed gate because of yielding or separation, and no animal leaves its pen because of the player.
- No visible jitter: standing in contact produces no oscillation of player or animal positions. This is measured as zero direction reversals over 100 ticks or 300 steps.
- v1 to v6 journals and hashes are unchanged. v7 replays deterministically from the journal.
- The performance budgets in test 14 are met.

## 8. Risks

- **Latency:** the sim learns of the player at most 2 s late, so animals yield on the next tick. Mitigation: soft player-side contact. If faster yields are wanted later, the app could dispatch an extra presence-only `tick { ticks: 0 }`-style command, which would be a separate journal change.
- **Griefing or idling:** an idle player in a door or gate blocks villagers for up to 30 s, after which they give up with a visible reason. This is acceptable and explainable. Do not let villagers push the player.
- **Herding exploit:** the player could steer animals by walking at them. This is limited by "never across a gate or fence" and by the perpendicular preference.
- **Big bodies versus 1 m cells:** cattle and horses extend beyond one cell. The sim ring uses distance 2 for them, and the player-side capsule covers the rest. Exact animal-animal separation is Stage 2.
- **Drawn versus sim divergence:** contact uses drawn positions, which are at most one tick behind the sim. Snaps on load are handled by capped separation.
- **Multi-tab and timescale:** only the leader tab dispatches ticks, and presence comes from that tab's player. Multi-tick commands reuse one presence.
- **Journal schema:** presence is an optional new field on the schema 3 `tick` command. Older builds would drop it on parse, but they cannot run rules v7 anyway because `upgrade_homestead { rules: 7 }` is rejected. Keep validation strict.
- **Scope creep:** Stage 2 (animals in the occupancy map) touches herder work spots and gate queues. Ship it separately with its own tests.
