# W8 "Hunting": completion report (uncommitted)

**W8 status: implemented, emulated only. Not accepted.** No physical-phone walkthrough was done; that needs the owner.

- **Repository:** `Astrix`, branch `deploy/boxd`, HEAD `daa61f1` (W7 code `9068b88`, deployed).
- **Not committed:** nothing is committed, staged, pushed or deployed.
- **Untouched:** `.tools/backups/w4-20261126/`, `05_Noxel_Studio/Asset_Sheets/2026-11-24_animals/Animals` and `Evidence/W1-wilderness-scenario/live-entry.png`.
- **Wilderness content:** v8 becomes **v9**, by one journaled `upgrade_wilderness` step. v1–v8 journals replay under their own rules first.
- **Scope:** W9 and W10 were not started. No horses, no taming, no new species.
- Evidence (screenshots, the v8 fixture generator, the browser save generator) is in `Evidence/W5-W8/w8/` and `Evidence/W5-W8/w8-fixture-gen.9068b88.ts.txt`.

## 1. What was built

### Crafting (`sim/gathering.ts`, content v9)
All three recipes are made at a finished workbench, need the stone knife in the bag (it loses 1 durability per craft), and are refused in a v8 world (`content`).

| Recipe | Input | Output |
|---|---|---|
| **Bow** | branch 2, cord 2 | a bow (a tool, 150 shots of durability, weight 2) |
| **Arrows** | branch 1, stone 1, fibre 2 (shaft, knapped stone head, fibre fletching) | 4 arrows (weight 1 each) |
| **Blunt arrows** | branch 1, fibre 1 (no head) | 4 blunt arrows (weight 1 each) |

- **New items** (content v9 only; snapshot validation refuses them in older content): `arrow`, `blunt_arrow`, `raw_meat` (weight 2, food 5), `cooked_meat` (weight 2, food 30), `hide` (3) and `bone` (1). The new tool is `bow`.
- **Cooking:** raw meat cooks at the campfire through the existing `cook` (`COOKS`).
- **The knife's note** no longer says it has no use. It now says it butchers and shapes the bow and arrows. The workbench summary changed the same way.

### The shot (`sim/hunting.ts`, pure TS, no three.js)
A journaled `shoot` carries the following. The command never names a target.

| Field | Meaning |
|---|---|
| `arrow` | `arrow` or `blunt_arrow` |
| `from` | release point, integer cm |
| `dir` | aim, an integer vector whose length is 9,900–10,100 |
| `draw` | draw time, ms |
| `t` | the release moment within the current 2 s tick, in thousandths. It is how far the drawn animals were along their latest tick's path |
| `at` | the player's position, dm |

**Validation** (a refusal changes nothing):
- the bow is in hand and not broken;
- an arrow of that kind is in the bag and not reserved for a site;
- the draw is at least 300 ms;
- the release point is within 1 m horizontally of `at`, and 0.2–3.5 m above the ground there;
- the player is not in water;
- `at` is within 16 m of the last journaled presence;
- at most 3 shots per tick, and a release in a tick never comes before the previous one.

**Ballistics:**
- **Launch speed:** 12 m/s at a 300 ms draw, rising to 40 m/s at a 1,200 ms draw.
- **Integration:** fixed 1/60 s steps (semi-implicit Euler) under gravity 9.81 m/s² and quadratic drag k|v|v. k is 0.0022/m for arrows and 0.006/m for blunt arrows. A flight lasts at most 4 s.
- **Determinism:** only `+ − × ÷` and `Math.sqrt`.
- **Shared function:** the client's aim preview and the drawn flight use the same function (`flightPath`).

**Hit model.** Each step is a segment tested against the following. The earliest contact wins; ties go in this order:
1. **Ground and water:** the 1 m terrain columns, through an exact 2D cell traversal. These are route.ts `TerrainCache`, equal to the voxel surface; the wilderness has no voxel edits. Water stops the arrow.
2. **Finished buildings:** their collision boxes.
3. **Standing trees and stumps:** a vertical cylinder with the stage's trunk radius. It is half the tree's height tall (full height for a snag, 0.5 m for a stump). Leaves do not stop arrows.
4. **Fallen trunks:** a horizontal cylinder.
5. **Land animals:**
   - each has a body capsule and a head sphere per species, measured from the block models (`HIT_SHAPES`);
   - a lying animal (resting, a frozen hare, stunned) is lower by 0.7 of its leg length;
   - the animal is placed where it is at that moment of the flight: along its latest tick's path at fraction `t/1000 + flight time / 2 s`;
   - past the end of that path, it stands at its record.

   **New saved state:** in v9 each record's path is saved as `tr` when the animal moved in its latest tick, because shots are resolved against it. On the upgrade, paths are cleared, so a restored v8 save and one replayed in memory agree.

**The outcome** records:
- what was hit (`none`, `terrain`, `water`, `tree`, `trunk`, `building` or `animal`) and its id;
- the body part;
- the impact point (cm), flight time (ms) and speed at impact;
- the result, damage and health after;
- the arrow pile, or `broke`;
- the animals startled.

### Damage, wounds, stun and death
| Item | Rule |
|---|---|
| Hit power | 10 × (v / 40 m/s)² points, × 1.5 on the head, rounded |
| Health (`WILD_HP`) | deer 12, wolf 10, fox 4, hare 3. A record carries `hp` only while wounded |
| **Sharp arrow** | Below 1 point it **glances** off (no harm). At health 0 the animal is **killed**: the record goes, the id is tombstoned, and a player's carcass lies where it was hit. Otherwise it is **wounded** and flees for 12 s from the shooter |
| **Wounded** | Runs at 0.5 + 0.5 × hp/max of its speed and tires 1.5 times as fast running. It heals 1 point every 300 s (150 ticks) when not fleeing; frozen animals catch up. There is no bleeding out: a wounded animal can be followed and finished, or caught by wolves once it is tired |
| **Blunt arrow** | Never takes health. A power at or above the species' threshold (hare 2, fox 3, wolf 7, deer 8) **stuns**: the new act `stunned`, lying still for hare 40 s, fox 40 s, wolf 24 s, deer 30 s. Then it gets up and flees. Below the threshold it is **bruised** and flees. More blunt hits only extend a stun (never a kill). A stun is never a tombstone or a carcass |
| **Being shot at** | An animal whose body the arrow passes within 2 m of flees (6 s). Every impact is a W7 noise at the impact point, which animals within earshot hear on the next tick |
| **Wolves** | A hit wolf flees like the others. No aggression and no damage to the player were added |
| **Trout** | Not targets: they are in the water, and an arrow stops at the surface |

### Carcass and butchering
- **A player's carcass** (`by: 'player'`, with `cut` and `work`) lies until it is fully butchered, or for 4,500 ticks (15 days). A wolves' kill still lies for 900 ticks.
- **Carcass budget:** at 256 carcasses, wolves' kills are dropped first.
- **Wolves' kills** are refused for butchering ("picked over").
- **`butcher`** is one knife swing:
  - the knife must be in hand;
  - the player must be within 2.2 m;
  - it shares the swing rate with chopping, 4 swings per tick;
  - it costs 1 knife durability.
- Every `BUTCHER_SWINGS` swings, the next output in the species order comes off onto a pile beside the carcass. There is one pile spot per item, so units join a pile.
- The count in the carcass record means nothing comes off twice. The last output removes the carcass; the tombstone stays.

| Species | Outputs, in order | Swings each |
|---|---|---|
| Deer | hide, meat, meat, bone, meat, hide, meat, bone → **4 meat, 2 hide, 2 bone** | 2 |
| Wolf | hide, meat, bone, meat, hide, meat, bone → **3 meat, 2 hide, 2 bone** | 2 |
| Fox | hide, meat, bone | 1 |
| Hare | hide, meat | 1 |

These come from fauna.ts `yields`: meat is food ÷ 3 (at least 1), hide is as given, and the larger animals add bone. The piles are ordinary piles: they can be picked up, carried, stored and reserved like any other.

### Arrows after the shot
| Where it goes | Arrow | Blunt arrow |
|---|---|---|
| An animal | spent | drops at the animal's feet (a pile) |
| Stone, gravel, ore or a building | breaks | becomes a pile |
| Soft ground, a tree or a trunk | becomes a pile where it struck | becomes a pile |
| Water, or out of the world | lost | lost |

### Client
- **`app/hunting-ui.ts`:**
  - **Desktop:** hold **Q** or the **right mouse button** to draw, aim with the mouse, release to shoot. **Z** (or the Bag's Quiver row) switches arrow kind.
  - **Touch:** hold the **Bow** button, drag to move the aim mark, release.
  - **The sight:** the launch is solved, with the sim's own `flightPath`, so that the free flight passes the point under the mark. That point is a drawn animal's body centre if the camera ray passes through it, else the ground, else 40 m out. The sight allows for drop but **never leads a moving animal**.
  - **Touch assist:** it may turn the heading by at most 3° toward the nearest drawn animal before release. The sim flies the arrow.
  - **Release moment:** `t` comes from the wildlife view's blend (`tickAlpha`).
- **`render/hunting.ts`** (at most 5 draw calls):
  - the bow in the left hand;
  - the preview dots;
  - instanced arrows in flight along the journaled path up to the recorded impact, and standing where they struck for 20 s;
  - an impact ring;
  - a dazed ring over stunned animals.
- **`render/fauna.ts`:**
  - stunned animals lie on their side where they were hit;
  - a felled or stunned animal is drawn as it was until the drawn arrow arrives;
  - a player's carcass shrinks as it is butchered (it stays bloodless);
  - carcasses keep their animal's heading.
- **`render/pickups.ts`:** arrow, hide, meat and bone piles are drawn in the plain block style.
- **`app/wild-game.ts`:**
  - **E / Use butchers:** with the knife in hand the carcass comes first; otherwise it comes after a pickup in reach.
  - **Prompts:** a prompt shows what is taken and what is left; hunting toasts describe each outcome.
  - **Load-time upgrade:** goes to v9, with a toast.
- **`app/explore.ts`:** the aim pose. The character faces the aim, the left arm holds the bow out, and the right draws.

## 2. Files
- **New:**
  - `Game/src/sim/hunting.ts`, `Game/src/app/hunting-ui.ts`, `Game/src/render/hunting.ts`;
  - `Game/tests/w8.hunting.test.ts` (22 tests);
  - `Game/tests/fixtures/w8-wilderness-save.json`;
  - `Evidence/W5-W8/w8-fixture-gen.9068b88.ts.txt`, `Evidence/W5-W8/w8/` (including `w8-browser-save-gen.ts.txt`).
- **Changed:**
  - `sim/gathering.ts` (v9, items, tool, recipes with `since`, the hunt block, upgrade, validation);
  - `sim/wildlife.ts` (`stunned`, `hp`, saved `tr`, player carcasses, butcher tables, wound speed, fatigue and healing; all inert for v8 records);
  - `sim/felling.ts` (6 events, `standingTreeHeight`);
  - `sim/wild-build.ts` (`COOKS`), `sim/catalogue.ts` (workbench summary), `sim/wilderness.ts` (allow-list);
  - `app/wild-commands.ts` (`shoot`, `butcher`), `app/wild-game.ts`, `app/explore.ts`, `main.ts`;
  - `render/fauna.ts`, `render/pickups.ts`, `styles.css`.
- **Existing tests changed** (no assertion weakened):
  - `w2`, `w4.build`, `w6`: the latest and default content is 9;
  - `w4.build`: the workbench recipe list includes bow, arrows and blunt arrows;
  - `w4.ui`: the knife's note says butchering instead of "no use yet", which is the honest text now;
  - `w7`: `v8()` builds an explicit v8 world, so W7 tests keep testing exactly the v8 rules. The v8 genesis pin `7c46024708b9815d` is unchanged.
- **Regenerated:** `Game/dist` (bundle `assets/index-4a3vuVoe.js`) and `Game/tests/.build`.

## 3. Tests, typecheck and build
| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npm test` (final tree) | **579 tests, 578 pass, 1 fail** (277 s, load average 9.8–13.8 on a shared host); 557 before, plus 22 new |
| The 1 failure | m004 "v2 chunk generation stays within budget per chunk": 107.9 ms against 60 ms. See below |
| `npm run build` | OK. Bundle `assets/index-4a3vuVoe.js` |

**The m004 failure.** The threshold was not relaxed.
- Run alone 3 times on this tree: 72.7, 72.1 and 61.3 ms, all failing.
- Run 3 times on **unchanged code** (a temporary worktree of `daa61f1`, removed afterwards) at load about 12–13: 71.5, 88.5 and 76.6 ms, also all failing.
- W8 does not touch chunk generation. This is the host-load flake recorded in W5 and W7.
- The first full run on an intermediate tree also failed here (65.6 ms), together with two W4 text tests that were then updated (above).

**New tests (`tests/w8.hunting.test.ts`):**
1. **Crafting:**
   - bow, 8 arrows and 4 blunt arrows from real materials at the bench with the knife;
   - refused away from a bench (`station`), without materials (`missing`, nothing spent), without a knife (`no_tool`), and in v8 (`content`, and `shoot` gives `wilderness`).
2. **Ballistics:**
   - range peaks at 35–45° and is shorter than the vacuum range;
   - longer draws fly farther; a blunt arrow drags more;
   - released level, the drop after 0.5 s is ½gt² within +10 %;
   - the same flight twice is identical.
3. **A lob straight up** flies more than 1.5 s and comes down. Refusals: `not_drawn`, `out_of_reach` (horizontal and height), `bad_aim`, an earlier release (`too_fast`), a 4th shot in a tick, and a position too far from the presence. The journal replays to the same hash.
4. **The world stops arrows:**
   - the ground (the pile can be picked up: arrow recovered);
   - a tree trunk (`ref` = the tree), even when aimed at a point 6 m behind it;
   - the workbench (`building`, broke);
   - river water (lost, no pile).
5. **A running deer** (17.1 m in its tick):
   - the shot leading it along its path hits its body at 200 ms, 39.6 m/s, damage 10;
   - the same shot aimed where it was at the release misses (it struck a tree behind), on an identical replayed world.
6. **An arrow passing 1.3 m beside a deer** misses: no damage, the deer is startled and flees. It replays equal.
7. **Distinct outcomes:**
   - a weak shot wounds a hare (damage matches the impact speed; slower; flees; not removed);
   - a full draw kills it later;
   - a deer takes a body hit (wounded, 8–11 points), then a head shot (killed, carcass at the hit point).
8. **Stun:**
   - a blunt arrow lays a hare down with health untouched, the blunt arrow dropped at its feet, and no tombstone or carcass;
   - two more blunt hits do not kill it;
   - it lies still where hit through a save and reload;
   - it is still down one tick before its time and recovers on time;
   - it replays equal;
   - a weak blunt shot only bruises a deer.
9. **A kill's carcass:**
   - the tombstone is set and the record gone;
   - it survives reload and compaction, and stays after 920 ticks away (longer than a wolf kill) without being resurrected;
   - snapshots with too many cuts, past 4,500 ticks, or a player carcass in v8 are refused.
10. **Butchering a deer:**
    - refused with the bow in hand (`no_knife`) and out of reach;
    - a save and reload after 5 swings, carried on in the reloaded world;
    - outputs come in the species order, each once, in 16 swings: **4 meat, 2 hide, 2 bone**, picked up exactly once;
    - then `not_found`; knife durability is correct; replay is equal;
    - cooked at a campfire and eaten (hunger −30).
11. **A wolves' kill** (from the v8 fixture) is `picked_over`; v8 refuses `butcher`; trout have no hit shape.
12–13. **The v8 fixture from `9068b88`** (short and compacted):
    - byte-identical record;
    - it replays under v8;
    - one upgrade to v9 with all v8 state untouched (creatures, tombstone, wolf carcass) and an empty hunt block;
    - a bow is made at its v8 workbench; reload and replay.
14–20. **W1–W7 fixtures** (short and long): load, replay, upgrade straight to v9, creatures appear, replay.
21. **Pins:**
    - settlement `e659504b056654dc`, v7 `2b53c51d7dec7daa` and v8 `7c46024708b9815d` unchanged;
    - **v9 genesis `a0d9a2c347997b70`**;
    - a settlement refuses `butcher`.
22. **Performance:** shot dispatch (flight, collisions, journal, hash) median 1.8 ms, max 141 ms (the first shot builds tree lists and generates chunks).

**The v8 fixture.**
- Made by the live W7 code `9068b88` in a temporary worktree, `/projects/sandbox/.tools/scratch/w8-wt`. The worktree was removed and is not in `git worktree list`.
- Contents:
  - a workbench, a stone axe, and a knife (equipped);
  - 12 ticks with presence near the spawn (short: 69 entries, hash `9ab397c10946e6ed`);
  - then a forest stay until wolves killed `fauna:deer:43,29:1`, compacted (long: hash `593131ccbbd547ff`, tick 329).

## 4. Browser walkthrough (emulated; local build at https://astrix.local/; Chromium, software GL at about 2 fps)
**Setup.**
- localStorage was seeded as specified (`w1`, seed 1337, gen 2, spawn (−82, −172)).
- **A Node-made v9 save** stood in for the early steps: a finished workbench and log store, an axe, a knife, and the bow and arrow materials in the bag. It was made by `w8-browser-save-gen.ts.txt` from this tree.
- Captured on every step: console errors and warnings, page errors, failed requests and HTTP ≥ 400. **None came from the game.**
- Four page errors were caused by my own probe: synthetic PointerEvents with a fake pointer id made the camera rig's `setPointerCapture` throw. Those helpers were replaced with real Playwright mouse input, and nothing appeared after that.

**Desktop 1200×700:**
- **Crafted in the browser** at the workbench (Bag panel): a bow (150/150), 2 × 4 arrows and 4 blunt arrows. The knife went 40 → 36. The recipe notes were shown. `w8-a`.
- **Aiming:** the character faces the aim, the bow is held out, the preview dots show, and the aim mark fills. `w8-h`.

**Shots (each one journaled, with its impact recorded):**

| Shot | Outcome |
|---|---|
| **Misses** | terrain (a 1 m step 4 m ahead of a deer); river water (lost); several on the ground near moving hares on stepped terrain; a **tree** (`e:30,29:0`); the **workbench** three times while standing beside it (`building`, broke); a **fleeing wounded deer** at 47.7 m (terrain) |
| **Blunt arrow → stun** | hare `29,28:2` resting at 6.3 m: body, power 9, `stunned`, the blunt arrow on a pile, the dazed ring shown (`w8-e`). **Reloaded during the stun:** still `stunned` at the same spot (`w8-f`); about 10 s later it was `flee` and away. No carcass; the dead count stayed at the wolves' two |
| **Wounded deer** | `32,27:2` resting at **68 m**: body, damage 8, hp 4/12. It fled more than 60 m and was later browsing, alive (`w8-d-…-hit-2`). Deer `29,25:0` resting at 30 m: body, damage 9, hp 3, flight 758 ms; it ran (`w8-n-…-0`) |
| **Kills** | hare `33,28:0` resting at 67.9 m (flight 1,882 ms, 34.4 m/s, damage 7: killed). Fox `29,26:0` **while wandering, at 11.9 m: a head shot**, damage 14, killed (`w8-n-…-2`) |

**Carcasses, butchering and storage:**
- **Reload after the kill, before butchering:** the hare's carcass record was identical (`cut 0, work 0`). `w8-j`.
- **Hare:** knife equipped; E butchered it. A hide pile and a raw-meat pile came off, then `CARCASS_BUTCHERED`, and the carcass was gone. Both were picked up and **stored in the log store**. `w8-k`, `w8-l`, `w8-m`.
- **Fox, with a reload mid-butchering:** after 1 output (hide), a reload. The record was still `cut 1`, and the hide pile was there once. Then meat and bone came off: **hide, raw meat, bone, one each**. The events were `CARCASS_CUT` ×3 and `CARCASS_BUTCHERED`; the knife went 30 → 28.
  - All three were picked up and stored. The log store then held bone 1, hide 2, raw meat 2. `w8-o`, `w8-p`, `w8-q`.
- **Arrow recovery:** 11 arrows were picked back up from the piles where they struck.

**Phone 390×844** (isMobile, touch, DPR 2; quality auto-low on SwiftShader):
- **Layout:**
  - with the bow equipped, the **Bow** button is 62×62 at (218, 678)–(280, 740);
  - **0 overlaps** among the 16 visible controls and panels, and no tap target under 40 px;
  - the first placement touched the log store panel by 5 px, so the button was moved 14 px down. That is fixed and re-measured.
- **Hold, drag and release** (CDP touch events):
  - the draw started (`by: touch`);
  - dragging turned the aim from −2.478 to −2.370 rad;
  - the preview showed 48 points, and the mark showed full draw;
  - the release sent a journaled shot. It was aimed at the sky and flew 4 s out of sight. This led to the default mark moving closer and the sky fallback becoming 40 m.
- **A second phone shot** was turned by the assist (`assisted: 1`). It missed on the ground beside a fox and startled it.
- **A phone hit: NOT VERIFIED.**

**NOT VERIFIED in the browser:**
- a sharp-arrow hit on an animal that was *running*: the only browser kill on a moving animal is the wandering fox, and the fleeing deer was missed. This is covered by test 5;
- a deer or wolf kill and its 8-output butchering: covered by test 10;
- cooking meat: covered by test 10.

**Observed once:** a 60 ms synthetic E tap at the hare's carcass gave two butchering swings. A hare needs 1 swing per output, so both outputs came off at once. An instant tap gave exactly one swing at the fox. The cause was not isolated, and the sim counted both swings correctly.

## 5. Performance
| Measure | Result |
|---|---|
| Sim, per shot (Node) | median 1.8 ms, max 141 ms (the first shot near unvisited chunks generates them, as felling does) |
| Desktop draw calls | 63, with 142–144k triangles and 61–63 animals drawn |
| Phone 390 draw calls | 43–45, with 85–86k triangles |
| Hunting view | at most 5 draw calls by construction (arrows, preview, ring, dazed ring, bow); not isolated in the breakdown |
| Scene budget | within 120 draw calls and 250k triangles |
| Save size | wildlife block 161 bytes per record in v9 against 154 in v8 (177 records near the spawn; only animals that moved save a path); hunt block about 70 bytes |

The frame rate (about 2 fps on software GL and a loaded host) is **not meaningful**: NOT VERIFIED on real hardware.

## 6. Save and replay
- **v8 save from `9068b88`:** byte-identical; replays under v8; one journaled upgrade to v9 leaves all v8 state untouched (tests 12–13).
- **W1–W7 fixtures:** upgrade straight to v9 (tests 14–20).
- **Equality:** continued, reloaded, compacted and replayed worlds agree through stun, kill and mid-butchering (tests 7–10, and the browser reloads).

## 7. Known limitations and decisions to review
- **The sight allows for drop:** the client solves the elevation so the free flight passes the point under the cursor or mark. It never leads, and the sim flies every arrow. The owner may prefer a raw aim; the preview arc is honest in both cases.
- **Animals during a flight:** they move along their latest tick's path. Past its end they are taken to stand at their record, because the next tick's motion is unknown at release.
- **Drawn and simulated paths:** the drawn blend starts where the animal was shown when the tick arrived, which is almost always the path's start. A tick arriving mid-flight changes the drawing, not the outcome.
- **Not obstacles:** tree crowns, shrubs and rocks other than voxel terrain do not stop arrows.
- **Trout** cannot be hunted.
- **A sharp arrow that hits an animal is spent**, including in a kill.
- **Wolves' kills cannot be butchered.**
- **Wolves never turn on the player.**
- **Wounds do not bleed out;** they heal slowly.
- **Butchering, storage and reservations:** none of the new items is reserved by any building, so the reservations are unchanged.
- **Stepped terrain:** 1 m terrain steps often stop arrows aimed at low animals such as hares. This is physically right, but a player will feel it.
- **Physical-phone walkthrough: NOT DONE (needs the owner).**
- **Commit hygiene:** `Game/dist` and `Game/tests/.build` are regenerated and dirty.

## 8. Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| Bow and arrows are legitimately crafted | Pass | Test 1; browser crafting at the workbench (`w8-a`) |
| Projectiles follow physical trajectories | Pass | Tests 2–3 (gravity, drag, fixed steps, determinism); browser flights of 26–1,882 ms with impact data |
| Arrows travel through the world; terrain, trees and buildings block | Pass | Test 4; browser terrain, water, tree and building impacts |
| Moving animals can be hit or missed | Pass in tests; browser: a wandering fox hit, a fleeing deer and moving hares missed. A browser hit on a *running* animal: NOT VERIFIED | Test 5 (lead hits, no lead misses); §4 |
| Damage from the actual hit, not selection | Pass | Tests 5–7 (part, speed and damage from contact; aiming beside an animal misses) |
| Damage, fleeing, death and stun are distinct simulation outcomes | Pass | Tests 7–8; browser wounded, fled, killed, stunned and recovered |
| A wounded animal does not vanish | Pass | Test 7; browser wounded deer alive and browsing later |
| Killed animals leave persistent carcasses | Pass | Test 9; browser reload before butchering |
| Butchering needs a knife and gives correct resources | Pass (deer in tests; hare and fox in the browser) | Test 10; browser hare and fox piles, picked up and stored |
| No duplicated resources or false kills | Pass | Tests 8–10 (stun: no tombstone or carcass; each output once across reload and replay); browser mid-butchering reload |
| Non-lethal stun with defined recovery | Pass | Test 8; browser stun, reload and recovery |
| Bloodless presentation, clear feedback, light effects | Pass, emulated | Bow, preview dots, aim mark, flights, impact ring, dazed ring, lying and shrinking carcasses, toasts; at most 5 extra draw calls |
| Desktop and touch controls work | Partial | Desktop: right mouse, Q and Z used throughout. Touch: hold, drag and release fired journaled shots, the assist was counted, the layout had 0 overlaps and all targets ≥ 40 px; a touch *hit* and a physical phone NOT VERIFIED |
| Tests cover projectile physics, collision, damage, stun, death, butchering and persistence | Pass | 22 new tests; 578/579, the 1 being the m004 timing flake, which also fails on unchanged `daa61f1` |
| Old saves preserved (settlement pins, v1–v8, v6/v7 fixtures, W1–W7, the new v8 fixture) | Pass | Tests 12–21; full suite |
