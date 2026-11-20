# IR-003 — First Runnable World (Task 006)

**Date:** 2026-10-22 · **Owner:** DeepSeek · **Status:** T-006 Review Required; T-008 addendum below is Review Required (not approved)
**Build:** `Game/` (Vite + TypeScript + three r186), production build in `Game/dist`

---

## 1. What exists

| Layer | File | Notes |
|---|---|---|
| sim | `src/sim/world.ts` | seeded heightfield 128×128, materials, prop placement, time state. **No `three` import** (D-005) |
| data | `src/data/palette.json` | copy of `palette_v2.json` |
| render | `src/render/terrain.ts` | chunkless mesh, vertex-colour strata, water quads |
| render | `src/render/props.ts` | faceted `NatMass` trees/rocks/ore, instanced; ground cover |
| render | `src/render/sky.ts` | 4 lighting presets, animated cycle |
| render | `src/render/camera.ts` | orbit rig, ADB §4 clamps |
| app | `src/main.ts` | wiring, HUD, input (space pause, 1-4 time jump) |

Controls: drag = orbit, wheel = zoom, space = pause, 1/2/3/4 = dawn/noon/dusk/night.
URL: `?t=0..1&freeze=1&seed=N` — screenshots are reproducible.

## 2. Verified, not assumed

| Check | Result |
|---|---|
| `vite build` | passes, 1.6 s |
| Browser console errors | 0 |
| Draw calls | **21** (budget 120) |
| Triangles | **153,202** (budget 250,000) |
| Renders produced | day / dusk / night, 1600×900, SwiftShader |
| Determinism | same seed → same props/heights; no `Math.random` in sim |
| Layer rule | `sim/` imports nothing from `three` |

## 3. Defects found by looking at the output (and their fixes)

1. **Terrain contours.** Quantising a smooth field produced concentric staircase rings around the
   plain. Fixed by quantising only steep ground (2 m) and leaving gentle ground at 1 m.
2. **Hairline faces.** Emitting a side face for every cell boundary turned every meadow into
   corduroy stripes. Fixed by skipping lips below 0.5 m.
3. **Plain as a pit.** Flattening the start area to 4 m inside terrain averaging 8–10 m created an
   amphitheatre. Fixed by flattening to 5.5 m with a wide feather, and moving the lake into a
   proper two-stage basin instead of a hole.
4. **Massif checkerboard.** Grass tops alternating with stone risers. Partially fixed in T-006
   (stone above the massif mask); **superseded by the T-008 addendum**, which replaces the mesher.

## 4. Honest assessment of the visual result

The scene is **structurally right and visually unfinished**. It reads as a diorama, the palette is
correct, trees and water match REF-002's language, and the day/night cycle works. It does **not**
yet read as an inviting landscape:

- The massif is a pale terraced wall/quarry, not a mountain. This is the single biggest problem.
- The starting plain is a large empty green field; ground cover is too sparse to help.
- Dusk is too dark — the 8° sun leaves most of the frame in shadow; ambient needs lifting.
- Ore veins are too small to read at default zoom.
- Water is blocky at the shoreline (expected) but has no foam/rim response yet.

These are art-direction and generation problems, not architecture problems. Nothing here needs a
rewrite; the terrain *representation* is the thing to change (fewer, larger benches; real cliffs
authored as regions rather than quantised noise).

## 5. Requirement deviations (documented, not hidden)

- GLM's v1.1 layout is not implemented literally: regions are approximate (plain, forest NE, lake
  SW, rocky W, massif NW) and resource counts differ from the 92-node spec. This is a first-playable
  scene, not the specified map.
- No run-merging of cliff faces yet (GLM §3.3) — hence 153k tris instead of 67k.
- `Game/src/data/palette.json` is a **copy**. The single-source rule (D-009) currently depends on a
  manual copy; a sync check must be added before the palette is edited again.
- Shadows are not throttled; the sun moves every frame.

## 6. Next actions (ranked)

1. **T-008 terrain authoring pass** — replace quantised-noise cliffs with authored benches; target
   the REF-002 read (broad meadow → clean cliff face → summit). This unlocks Task 004.
2. Lift dusk/night ambient; re-run the 4-preset legibility test.
3. Run-merge cliff quads (GLM §3.3), reclaiming ~40% of the triangle budget.
4. Increase ground-cover density near the play area; add dirt/flower patches.
5. Then, and only then, freeze the camera framing and produce the Task 004 world concept render
   from this scene.

---

# T-008 addendum — authored terrain pass + movement controls

**Date:** 2026-10-22 · **Owner:** DeepSeek · **State:** Review Required (not approved)
**Scope:** terrain read, water, ore legibility, movement on desktop/tablet/phone.

## A. What changed

| Area | Change |
|---|---|
| `src/sim/world.ts` | Replaced noise-then-quantise generation with authored landforms: feathered starting plain (`cx2, cz4, rx26, rz20`), escarpment distance field with a promontory and two gullies, plateau lift 7–20 m in ~9 m buttress segments, higher back shelf, low east hill, shallow lake basin, forest patches with three authored clearings, four ore veins, boulders. Water table `WATER = 4.0` (2 m below the meadow). |
| `src/render/terrain.ts` | Continuous indexed heightfield (corner-averaged heights, smooth normals, vertex colours). Per-cell quantised tops and per-cell cliff faces are gone. Rock faces get **world-Y strata in the fragment shader** (1.2 m beds, thin ochre seam), because a smooth heightfield compresses cliffs into tall vertical triangles that smear vertex colours. Water is a continuous 0.8 m grid whose colour is sampled from terrain depth; the terrain surface defines the shoreline. |
| `src/render/props.ts` | Ore cluster geometry raised to ~1.7 m pre-scale with a violet emissive material; ground cover reworked into clumped 3-cone grass patches + tetrahedron flowers; all props still instanced. |
| `src/render/camera.ts` | Mouse orbit/wheel; one-finger orbit, two-finger pinch zoom + pan; WASD/arrows movement, Q/E yaw, `+`/`-` zoom, Shift sprint; `setPad()` API for the on-screen D-pad; `update(dt)` integrates movement. |
| `index.html`, `src/styles.css`, `src/main.ts` | Coarse-pointer D-pad + zoom buttons with safe-area insets and `touch-action: none`; responsive HUD; camera view parameters in the URL (`yaw,pitch,dist,tx,ty,tz`). |
| `palette_v2.json` (dusk, night) | Dusk rebalanced warm-key/cool-shadow (sun `#FFB27A` 3.2, hemi 1.1, exposure 1.32, warmer sky/fog); night sun cooled to `#AFC8FF`, exposure 1.5. **Lighting values only; material slots unchanged.** |

## B. Defects fixed

1. **Terraced quarry read.** Quantising every smooth slope produced contour rings and stair-step
   cliffs. Fixed by removing height quantisation from natural terrain and drawing a continuous
   heightfield; stepped/blocky treatment is now reserved for Noxel architecture.
2. **Checkerboard cliff.** Per-cell faces plus per-run colour bands made a checker wall. Fixed by
   world-Y absolute bed indices and, after the mesher change, shader bands on rock faces.
3. **Deep uniform moat.** Lake bed at sea level with terraced walls. Fixed by raising the water
   table to 4 m and carving a shallow bowl, so the lake sits in the meadow.
4. **Stair-stepped shoreline.** Cell-quad water. Fixed by a continuous water plane sampled against
   the terrain; the geometric shoreline is now the terrain intersection.
5. **Ore unreadable at gameplay zoom.** Fixed by a larger clustered deposit with a faint violet
   self-light.
6. **Dusk too dark / night near-black.** Both presets re-verified against captures after rebalancing.
7. **Infinite loop / OOM in strata band generation** at exact bed boundaries. Fixed with integer bed
   indices (found via a Node OOM, not by inspection).

## C. Defects remaining (known, not hidden)

- **Cliff close-up** (`t008_03_cliff.png`) reads as a smooth banded wall with vertical shading
  streaks; it lacks fracture facets and talus. At default zoom it reads as a layered escarpment,
  but it is not yet convincing at close range.
- **Lake shape** is still close to radial; the beach ring is uniform and there are no reeds/foam.
- **Plain** is broad and still comparatively empty; grass patches read as dots at gameplay distance.
- Trees along the plateau lip partly obscure the cliff top in the default framing.
- No ambient occlusion or texture detail; flat palette colours only.
- `Game/src/data/palette.json` is still a manual copy of the authoritative palette.

## D. Before / after (in-engine, same harness)

- Before (T-006 build): `Game/tests/final_v3_day.png` — pale terraced massif, deep moat lake.
- After (T-008): `Game/tests/t008_01_default.png` (default), `t008_02_plain.png`,
  `t008_03_cliff.png`, `t008_04_lake.png`, `t008_05_forest.png`, `t008_06_ore.png`,
  `t008_time_0.22/0.50/0.78/0.00.png`, mobile layout `t008_07_mobile.png`.

## E. Validation

| Check | Result |
|---|---|
| `vite build` | passes (~1.5 s, 545 KB JS / 1.9 KB CSS) |
| Console / page errors | 0 |
| Draw calls | **21** (budget 120) |
| Triangles | **203,221** (budget 250,000) |
| Determinism | same seed → identical heights/materials/props; seed 42 differs; 312 props |
| Layer rule | `sim/` contains no `three` import or reference |
| Keyboard | `W` moved target ≈ 20 m in 0.6 s; `2` set t = 0.50; Space toggled pause |
| Touch layout | 390×664 viewport: controls visible (192×132, 7 buttons); D-pad press moved target ≈ 22 m; no errors |
| URL reproducibility | `?t=&freeze=&seed=&yaw=&pitch=&dist=&tx=&ty=&tz=` verified by the capture set |

## F. Deviations from GLM v1.1 / Mimo AS-001

- **GLM voxel terrain is not implemented literally.** Natural terrain is a continuous heightfield,
  not 1 m quantised blocks; block/side-face run-merging (GLM §3.3) therefore no longer applies to
  terrain. This was a deliberate T-008 decision to satisfy "broad forms over repetitive steps" and
  "steps only where deliberate"; it needs owner/GLM acceptance or a request to restore blockier
  terrain. Noxel architecture keeps the block language.
- Layout is not the literal `start_map_v1.json`: landforms are authored (plain, escarpment, east
  hill, lake, forest), and resource counts differ (4 ore veins / 16 clusters, not 92 nodes).
- Ore emissive violet is an extension of AS-001/palette (still tied to D-015 approval).
- Dusk/night lighting numbers in the authoritative palette changed; material slots did not.

## G. Readiness

**Ready for human art review as a terrain candidate.** Not approved. Task 004 must stay blocked until
a reviewer accepts (a) the continuous-terrain read versus GLM's block spec, and (b) the cliff at
default zoom despite the weak close-up. If the reviewer rejects the smooth cliff, the next move is a
deliberate block-cliff layer, not another palette pass.
