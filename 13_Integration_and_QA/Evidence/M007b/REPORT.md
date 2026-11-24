# M007b evidence: player stuck, double jump

## Deployed vs merged

- Nothing in this change is deployed. It is committed locally on `deploy/boxd` and is not pushed or merged to `main`.
- The live game the user played (latest release `9b16f0b`) does not have the double jump.

### FEAT-003 (animal and world lag)

- Committed locally on `deploy/boxd`. Not pushed, not deployed, not merged to `main`. The live game does not have the smoothing.

## Tests vs live-browser

### Cause of the stuck player

- A single jump launches at 6.6 m/s against 22 m/s² gravity, so the feet rise at most 0.99 m. Walking steps up at most 1.05 m (`STEP_HEIGHT`, one voxel). Any hole or ledge two voxels deep or higher therefore traps the player for good. Terrain dips, harvested ground and places between cliffs or trunks can all form such a hole.
- A reachability probe ran on seed 1337 with the founder house, path and terraces built. It flood-filled walk and jump moves from the spawn over the founder area (x -72..-14, z -56..-14, 11,570 standing positions) and found 0 positions from which the spawn could not be reached. The structures do not form enclosed pockets. Homestead fences and pens have no player colliders (they are not in `world.structures`), so they cannot trap the player either. The probe was a one-off and is not part of the test suite, because it took about 74 s.

### Fix

- The user asked for jumping instead of a return-to-spawn escape. With future weapons the player can cut voxels around themselves and still needs to climb out of the resulting hole. So no unstuck or respawn key was added.
- Tapping Jump again while airborne now gives one extra launch at 8.4 m/s (`DOUBLE_JUMP_SPEED` in `Game/src/sim/character.ts`). The total rise is about 2.2 m, enough to clear a two-voxel rim. The air jump resets on landing and in water. Keyboard (Space) and the touch Jump button both use it through `ExploreController.setJumpHeld`, because each new press already queues a jump. The on-screen hints mention it.
- The character's state is presentation-tier and is not journaled or hashed. The new `airJumpUsed` field is not saved, so old saves and their hashes do not change.

### Verified by test

- `Game/tests/m004.character.test.ts`, test "a second jump tap in the air jumps higher, once, and a two-voxel hole can be left":
  - a double tap peaks more than 0.5 m higher than a single tap;
  - a third tap adds nothing;
  - walking or a single jump does not leave a 2 x 2 shaft two voxels deep;
  - a double jump while pushing forward does leave it.
- The test fails on the pre-fix code, which has no air jump.
- Full suite: 191 pass. `tsc --noEmit` is clean and `npm run build` succeeds.

### Not verified

- Not checked in a live browser or on real phones.
- The exact spot where the user got stuck is unknown, and no reproduction from the live game is recorded.

### FEAT-003: animal and world lag

#### Cause
- The ambient wildlife (`render/fauna.ts`) steps at 10 Hz (`FAUNA_STEP` 0.1 s) and drew each creature at its last stepped position with no blending. On a 60 fps display an animal moved on one frame in six, which reads as stutter.
- Farm animals and villagers (`render/homestead.ts`) already blended between the previous and the current 2 s tick, but each tick restarted the blend from the previous tick's end point, not from where the animal was drawn. A late tick (slow frame, background tab) made the animal pop back. There was also no snap rule for teleports.
- Per-frame uploads copied the full instance buffers (capacity, not count) for every species. Wildlife spawn for all newly loaded chunks ran in one frame.

#### Changes
- `Game/src/render/smooth.ts` (new): `blendPose` (position, y, shortest-arc heading, snap above 6 m), `tickAlpha`, `stepAlpha`, `shortestArc`. Presentation only, no simulation reads or writes.
- `FaunaView`: keeps the pose before the latest 10 Hz step per creature and draws the blend by `accumulator / FAUNA_STEP`. Sim stepping is unchanged. Chunk spawn is capped at 2 chunks per frame (`pendingSpawn` makes `main.ts` call `sync` again next frame).
- `Herd` and villagers: each tick blends from the pose currently drawn; heading and speed still come from the logical step; a jump over 6 m snaps.
- `AnimalBatch.end()` uploads only the used instance range.
- `app/perf.ts` `SectionStats` plus `main.ts` timing of homestead, fauna, terrain, render and the settlement tick, exposed as `window.__metrics.sections`.
- Deliberately not changed: `SimClock` and every sim module, so tick numbers, journals and save hashes are untouched.

#### Verified by test
- `Game/tests/m007.smooth.test.ts` (7 tests): alpha from the clock, continuity across a tick boundary at 60 fps, shortest-arc yaw over the +-PI seam, snap on a large jump, result independent of frame count, `FaunaView` simulation state identical whether or not extra draws happen, and drawn instances move on more than 60% of 60 fps frames. The last test fails on the old drawing (animal moved on 28 of 180 frames with blending disabled) and passes now.
- `npm test` 198 pass, `tsc --noEmit` clean, `npm run build` succeeds.

#### Live browser (software GL, about 1.2 frames per second, so frame-independent numbers only)
Build served from a copy of `Game/dist`, farm view `?chain=0&mode=builder&tx=-28&ty=14&tz=4&dist=40`, 70 s, 36 settlement ticks, no page errors:
- Draw calls 106 (budget 120) and triangles 248,364 (budget 250,000). The earlier figure was about 96 / 241k before the lean-to. The triangle margin is 1.6k, so any new geometry needs a matching cut.
- Instance matrices of the first 6 animals per species, read from the scene each frame. Implied speed between consecutive frames for farm animals: frames straddling a tick boundary mean 0.09 m/s, max 0.81 m/s (210 samples); other frames mean 0.09 m/s, max 0.80 m/s (1005 samples). No position jump at tick boundaries.
- CPU per frame (ms, mean / p95 / max): homestead update 0.92 / 0.6 / 60.3, wildlife 0.51 / 1.2 / 3.1, terrain streaming 0.07 / 0.1 / 0.4, settlement tick 1.99 / 3.8 / 7.0. Render max 26.9 s is the first frame (shader compile on software GL), and the homestead max 60 ms is the first frame that builds the buildings. Neither recurs.
- Probe scripts: `.kiro/artifacts/screenshots/probe/smooth-feat003-c.js`.

#### Not verified
- Smoothness as seen at 60 fps on a real device. The sandbox renders about 1.2 fps, so the blend was verified by unit test and by tick-boundary sampling, not by eye.
- No before/after live measurement of the old build, so the improvement in the live game is inferred from the cause analysis and the failing-without-fix test.
- Chunk-mesh uploads were not found to spike (terrain section max 0.4 ms in this scene), but walking across many new chunks was not measured live in this run.

## FEAT-004: animal behaviour evidence

### Tests (`Game/tests/m007.behaviour.test.ts` new, `m007.predators.test.ts`, `m006.homestead.test.ts`)
Full suite: 202 pass, `tsc --noEmit` clean, `npm run build` succeeds.

### Live browser (this build, fresh context, software GL, 42 frames over 43 s, no page errors)
- Local `Game/dist` copy served at a routed origin. Data: `probe-local-farm.json`, screenshot `probe-local-farm.png`. Script: `.kiro/artifacts/screenshots/probe/feat004-b.js`.
- Wildlife drawn: 46 rabbits, 2 deer, 2 foxes, 10 trout, 0 wolves (none spawn in view here). Farm animals drawn: cattle 2, chickens 4, goats 2, horses 2, pigs 2, sheep 3.
- Positions changed over the run for farm animals (all species) and for 4 of the 4 rabbits present on the first frame. Deer, foxes and trout were not drawn yet on the first frame, so their movement was not compared.
- https://astrix.nyc.boxd.sh answered HTTP 200, but it serves the older release, so it was not probed.

### Per-behaviour status
| Behaviour | Status |
|---|---|
| Wildlife and farm animals appear | verified-in-browser (software GL) |
| Farm animals move | verified-in-browser; smooth blending also verified-by-test |
| Rabbits move | verified-in-browser (4 rabbits) |
| Deer, foxes, trout, wolves move | not verified in browser; fox and deer reactions verified-by-test |
| Hare flees fox, deer flee wolves not foxes | verified-by-test (`m007.predators`) |
| Fox stalks, pounces, gives up | verified-by-test; not seen in browser |
| Predator kills prey | not implemented. The fox ends a missed or finished pounce in rest and the hare is not removed. Wildlife is presentation only. |
| Wolf pack cohesion and group flee | verified-by-test (`m007.predators`) |
| Feeding (pasture first, trough when bare, none without water) | verified-by-test (`m007.behaviour`) |
| Starvation death | verified-by-test (`m006.homestead`) |
| Reproduction (fed adult pair, litter, unique ids, capacity) | verified-by-test (`m007.behaviour`, `m006.homestead`) |
| Wildlife excluded from save and hash; old journals replay to the same hash | verified-by-test (`m007.behaviour`) |
| Persistence in a real browser reload | not verified |
| Real phones, 60 fps feel | not verified |
| Vegetation, villager navigation, new species | out of scope |

## Visual model vs simulation behaviour

- The figure has no distinct second-jump animation. It uses the existing airborne pose, and only the simulated height changes.

- FEAT-003 changes how smoothly existing poses are drawn only. Animal and villager models are unchanged.
