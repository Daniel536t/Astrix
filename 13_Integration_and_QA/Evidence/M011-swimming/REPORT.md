# M011: realistic swimming (evidence)

**Date:** 2026-11-25 · **Branch:** deploy/boxd (local commit, not pushed or deployed)

Owner's report: no strokes, hands didn't move, the head felt always inside the water and life drained; the
character should float normally and only go deep by choice.

## Root cause of the drain at the surface

Reproduced in the sim at the 2 m deep river west of the spawn (column -60, 4; `waterDepthAt` = 2), standing still
in the water for 100 s with the pre-M011 code:

| t | eye vs sim surface | drawn neck vs drawn water | stamina | breath | health |
|---|---|---|---|---|---|
| 5 s | +0.08 m | **-0.32 m** | 0.92 | 1.00 | 100 |
| 60 s | +0.08 m | -0.32 m | 0.00 | 1.00 | 100 |
| 65 s | **-0.50 m** (sunk to the bed) | -0.90 m | 0 | 0.68 | 100 |
| 80 s | -0.50 m | -0.90 m | 0 | 0.00 | 52 |
| 90 s | | | | | 0, drowned |

There were two causes:
1. **The pose drew the head underwater.** The swim pose pitched the body 1.3 rad forward (torso 0.9 + hips 0.4), so
   the drawn neck sat about 1.0 m above the feet. The sim float line put the surface 1.42 m above the feet, with the
   eyes only 0.08 m clear, and the water is drawn 0.1 m below the voxel top. The result was a head drawn 0.32 m under the
   water the whole time, even while the sim said the eyes were out.
2. **Floating at rest drained stamina in 60 s, and an exhausted swimmer sank.** After that the head really was under:
   breath was gone in 15 s, then health in 10 s. Doing nothing in deep water killed the founder in about 90 s.

A third problem showed up in the browser. A swimmer brushing a submerged ledge (1 m deep) "landed", switched to wading,
then stepped off the ledge with full gravity and dipped the head under for a moment.

## What changed

**Physics (`Game/src/sim/character.ts`, player-local, not in the hashed sim):**
- Buoyancy float line `FLOAT_DEPTH` = 1.30 m: the water line is at the upper chest and the eyes are 0.20 m clear. The
  vertical response is slightly underdamped, so a swimmer bobs gently into place. Jumping in plunges about 0.3 m below
  the float line, then rises back.
- Hold Dive: swim down at 2.0 m/s. Release: buoyancy rises at up to 1.1 m/s. Hold Jump: swim up at 2.6 m/s, easing off
  near the top so the kick never leaves the water. At the surface it lifts the head 0.18 m higher.
- Breath is lost only while `depth > EYE_HEIGHT` (eyes under). Otherwise it refills in 2.5 s. Drowning is unchanged:
  15 s of breath, then 10 health/s.
- Stamina: active swimming (moving, Dive, Jump) drains it in 40 s. Floating at rest with the head out recovers it in
  30 s. An exhausted swimmer still floats, lower (`EXHAUSTED_FLOAT_DEPTH` = 1.42 m, water at the chin), at 1 m/s, and
  cannot dive. This replaces the old rule that exhaustion sinks the swimmer.
- A swimmer stays afloat while the water at the feet is deeper than 0.9 m, even when the feet brush a ledge.
- Bank haul-out, step-up, wading, the wading double jump and banner safe landing are untouched.

**Animation (`Game/src/render/characters.ts`):** the regimes are ground (walk/run/wade), air, surface and underwater.
Each has a pose, and the poses are cross-faded with smoothed weights over about 0.3 s.
- Surface, idle (treading water): the body is near upright, the arms scull out to the sides forward and back, the legs
  kick alternately, and the body bobs about 2 cm.
- Surface, moving (head-up breaststroke): the body pitches up to 0.95 rad. The arms pull out, round and down, then
  recover and shoot ahead, followed by a whip kick and a glide. The head lifts during the pull. The stroke rate rises
  with speed, from about 0.55 Hz treading to about 1.1 Hz at full speed. The hips are placed so the neck stays 7 cm
  above the drawn water line.
- Underwater breaststroke: a long pull to the thighs, a glide, then recovery and a whip kick. The body pitches along the
  swim velocity: head first when diving, level along the bottom, upright while rising, and prone when hovering. The
  turn rate is limited, so a duck dive takes about half a second.
- Foam ring: 8 small flat blocks at the water line while swimming or wading. They pulse with the stroke and are part
  of the same skinned mesh, so there is no new draw call (+96 triangles per figure, hidden by a zero bone scale).
- `animateFigure(f, state, dt, feetY?)`: villagers keep calling it as before.

**Camera (`Game/src/app/explore.ts`):** while floating with the head out, the lens stays at least 0.35 m above the
water.

`Game/src/render/water.ts` now exports the 0.1 m draw offset as `WATER_DRAW_DROP`. The geometry is unchanged.

## Tests (Node, `npm test`): 267 pass (255 before + 12 new)

New `Game/tests/m011.swimming.test.ts`:
- Floating at rest for 30 s keeps the head out, and breath never drops (it refills from 0.4). The eyes are 0.15–0.3 m
  clear.
- Falling in, the swimmer plunges and then bobs up to the float line.
- Holding Dive submerges and breath drops. Releasing surfaces the swimmer within 4 s and it returns to the float line.
- Holding Jump surfaces at least 25% faster than buoyancy alone, and lifts the head without leaving the water.
- Kept under, the swimmer drowns after 24–28 s.
- A floating swimmer climbs out onto the bank.
- Swimming over a submerged ledge never dips the head (this test fails with the pre-fix rule).
- In the real river near the spawn, 90 s at rest keeps the founder alive with full breath and health (generator v2,
  seed 1337).
- Animation:
  - The stroke cycles the arms (>1.4 rad) and legs (>0.7 rad), and the neck stays above the drawn water.
  - Treading puts the arms out (z > 0.7), sculls them (>0.5 rad), kicks the legs alternately and bobs 2–12 cm.
  - The dive pitches head down (>2.2 rad), the underwater pull is long, the body is upright again after surfacing, no
    joint steps more than 0.25 rad per frame, and the figure returns to the walking pose with no foam on land.
  - The figure is still one skinned mesh.

Updated existing tests to match the deliberate rule changes (`m005.water`):
- Treading no longer tires the swimmer.
- An exhausted swimmer floats instead of sinking.
- The stamina test now covers 40 s of active swimming and recovery at rest.
- The haul-out test starts at 0.5 stamina.

`m008.persistence` now expects the new `ripple` bone. That test shows the ring before measuring, because a zero scale
cannot be inverted. Genesis/world hash tests (`e659504b056654dc`) and the save, banner, double-jump and navigation
tests pass unchanged. `tsc --noEmit` and `vite build` succeed.

## Browser (Playwright Chromium, software GL, built `Game/dist` routed at https://astrix.local/?chain=0)

The avatar save (`astrix:avatar:v1:seed:1337:gen:2`) was seeded at (-59.5, 100, 4.5). The game spawns on the river bed
there and floats up. No mutable debug hooks were used. Scripts: `m011-desk-d.js`, `m011-mobile-a.js` (in this folder).
No page errors.

**Desktop 1000x600:**

| phase | samples | eye above water | head under | breath | notes |
|---|---|---|---|---|---|
| rest 20 s | 21 | 0.20 m every sample | never | 1.0 | stamina 1.0 |
| W (stroke) 2.4 s | 3 | 0.17–0.48 m | never | 1.0 | speed 2.4 m/s; 0.48 m = feet on a ledge |
| low camera orbit | 1 | 0.20 m | no | 1.0 | camera 0.35 m above the water (clamped) |
| C held 2.5 s | 5 | -0.32 then -0.5 m (on the 2 m bed) | yes | 0.98 → 0.83 | |
| C+S under 1.5 s | 3 | -0.5 m | yes | 0.75 → 0.67 | 1.9 m/s along the bottom |
| released 5 s | 10 | -0.43 → 0.07 → 0.25 → 0.20 m | about 1 s | 0.59 → 1.0 | buoyancy, vy up to +0.71 |
| Space held after a dive | 6 | -0.48 → 0.14 → 0.45 → 0.38 m | about 0.6 s | 0.91 → 1.0 | vy +1.08; lifted head at the surface |

Render: 41–72 draw calls and 67k–127k triangles across samples (breakdown at the end: 43 draws, 67k triangles), under
the 120 / 250k budget.

**Emulated phone 390x844** (DPR 3, isMobile, hasTouch; CDP touch on the joystick, Dive and Jump buttons): the Dive
button was shown while swimming.

| phase | eye above water | head under | breath |
|---|---|---|---|
| rest 10 s | 0.20 m | never | 1.0 |
| joystick stroke | 0.39–0.50 m (ledge) | never | 1.0 |
| Dive held 3 s | -0.06 → -0.5 m | yes | 1.0 → 0.92 |
| Dive released 4 s | -0.48 → 0.25 → 0.20 m | about 1.5 s | 0.80 → 1.0 |
| Jump held after a dive | -0.09 → 0.43 m | about 0.5 s | 0.92 → 1.0 |

Render: 63 draw calls, about 108k triangles.

**Screenshots:**
- Desktop:
  - `desktop-1-treading.png`: head and shoulders out, arms sculling, foam ring.
  - `desktop-2a/2b/2c-stroke.png`: breaststroke phases from behind (arms reaching, pulling).
  - `desktop-3-low-camera.png`: low orbit held above the water.
  - `desktop-4a-dive.png`: prone on the bottom, seen from above through the water.
  - `desktop-4b-underwater-stroke.png`: underwater pull.
  - `desktop-5-back-at-surface.png`
- Phone: `mobile-1-treading.png`, `mobile-2a/2b-stroke.png`, `mobile-3-diving.png`, `mobile-4-back-at-surface.png`.

## Limits

- **No real phone was used.** Touch was checked in Chrome mobile emulation with software GL.
- The river near the spawn is only 2 m deep, so dives reach the bed in under a second. Deeper diving was covered by
  the 4 m pool tests, not in the browser.
- From the default camera behind the swimmer, the breaststroke body pitch is hard to see. The arm phases read clearly.
- The figure has no elbow or knee joints, so strokes are rigid-limb approximations.
- Ripples are body-attached blocks, not a water-surface effect.
- The phone probe's zoom-button clicks did not change the camera distance, so the phone shots use the default 9 m
  distance.

## Live deployment check

Release `20261125T003015Z-b10e0d6` was deployed to https://astrix.nyc.boxd.sh. It is pushed to `deploy/boxd` but not merged to `main`. The served bundle matches the local build (`assets/index-BeXCOc6U.js`). For this check the saved avatar was placed in the river at (-59.5, 4.5), using a fresh headless Chromium context with software GL. There were no page errors.

- **Resting 16 s:** in all 8 samples the mode was swim, the eyes were 0.20 m above water, and breath, stamina and health stayed at 1.0, 1.0 and 100.
- **Swimming forward 2 s:** eyes 0.28 m above water, breath 1.0, stamina 0.967. Screenshot: `live-b10e0d6-stroke.png`.
- **Holding C:** the eyes went 0.50 m under and breath fell 1.0 → 0.96 → 0.92.
- **Releasing C:** the swimmer surfaced within about 2 s (eyes −0.27 → +0.18 → +0.25 m) and breath refilled 0.88 → 0.98 → 1.0.

No real phone was used.
