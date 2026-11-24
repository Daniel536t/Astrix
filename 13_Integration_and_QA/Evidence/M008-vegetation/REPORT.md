# M008 vegetation stage: evidence report

Scope: the vegetation stage of the approved order (vegetation, then villager navigation, then birds, fish and land mammals). This report covers the tree species and growth stages, bushes and ground vegetation, the distance LOD, the world-asset optimisation done to make room for them, and the checks the owner asked for before any animal expansion.

All numbers below are copied from the JSON files in this folder: `baseline.json` (before), `trees-a.json` (after FEAT-002), `budget.json` (after FEAT-003), `final.json` (final desktop probe) and `mobile.json` (emulated mobile probe). Section 10 covers the fixes for review v1 (`.agents/tasks/task-m008-vegetation/2026-11-24-151805-review.md`, verdict NEEDS_CHANGES) and takes its numbers from `views-close.json`, `views-zoom.json`, `views-pan.json` and `views-before.json`. Sections 3 to 8 describe the build that was reviewed; where review v1 changed a value (near LOD band 60 to 90 m, shadow box and ground-cover anchors, macro draw runs, near ring at long zoom) section 10 says so.

## 1. Deployed vs merged

| Item | State |
| --- | --- |
| Live release | Unchanged: still `20261124T121804Z-99c6b11`. Nothing from this stage is deployed. |
| Branch | Committed locally on `deploy/boxd`: 984d317 (render breakdown + baseline), e98e446 (tree species, stages, LOD), abd9010 (ground cover and world-asset optimisation), 5be91a3 (FEAT-004: this report and `Game/tests/m008.persistence.test.ts`), plus the review v1 fix commit that adds section 10 and `Game/tests/m008.views.test.ts`. |
| Main | Not merged to `main`. Not pushed by this stage. |
| `Game/dist` | Tracked build output. The review v1 commit updates it to the review v1 build (still not deployed). The browser probes used fresh builds copied to `.kiro/artifacts/screenshots/probe/dist` (after), `probe/dist-base` (before, built from commit 99c6b11 in a separate git worktree) and `probe/dist-rv0` (the reviewed build, 5be91a3, built in a separate git worktree for the section 10 before/after). |

## 2. Tests vs live browser

### 2.1 Automated tests (Node, no browser)

`cd Game && npx tsc --noEmit && npm test && npm run build`: tsc clean, **230 of 230 tests pass** after review v1 (226 of 226 at FEAT-004), build succeeds. The genesis hash test (`tests/m004.generator.test.ts`, "generator v1 genesis is unchanged by the v2 work", `e659504b056654dc`) passes unchanged.

Tests added in this stage:

| File | Tests | What they prove |
| --- | --- | --- |
| `tests/m008.breakdown.test.ts` | 2 | The render breakdown helper matches three.js draw and triangle counting. |
| `tests/m008.vegetation.test.ts` | 7 | Species, stages and LOD are pure functions of entity id and position; no RNG draws, saved state or entity ids change; harvested entities are not drawn. |
| `tests/m008.groundcover.test.ts` | 8 | Ground cover is deterministic, load-order independent, avoids water, edits, structures, homestead cells and tree clearance, adds no entities, leaves the genesis hash alone; shadow policy; macro LOD bounds; no-multi-draw fallback bounded; herd culling sphere covers every animal. |
| `tests/m008.persistence.test.ts` (new in FEAT-004) | 4 | See 2.2. |
| `tests/m008.views.test.ts` (new in review v1) | 4 | Wide views draw the visible macro tiles in a few runs and close views still cull; zoomed out, the drawn near ring shrinks while the loaded chunk set is unchanged and the macro fills the gap, and zooming back restores it; the tiled fallback spreads re-bakes over frames while panning and converges when the camera stops; shadow box and ground cover reach the bottom screen edge at long zoom, and the near band is 90 m. |

### 2.2 Simulation persistence independent of render distance (`tests/m008.persistence.test.ts`)

1. "same seed and journal give identical sim state whatever the camera, LOD, ground cover or fallback": four runs of seed 1337 (generator v2), found homestead, 120 tick commands, one tree felled through the journaled `harvest` command at tick 40, ambient fauna in the 3x3 farm chunks stepped every tick. Run A builds nothing. Run B builds vegetation and ground cover with a camera orbiting 70 m from the farm (trees switch bands). Run C uses a camera 900 m away (every tree in the far band). Run D uses the no-multi-draw tiled fallback. All four give the same `stateHash`, saved snapshot, entity set with yields, homestead villagers and animals, and ambient creature state. The journal of run B replays headless to the same hash.
2. "building and updating the render views does not touch the state hash".
3. "a tree drawn at far LOD stays in the sim, is harvestable, and leaves the batch only once depleted": the tree is drawn in the far band, is still in `world.entities`, one harvest leaves it drawn, depleting it removes it from the rebuilt batch, and moving the camera next to it does not bring it back.
4. "the skinned villager figure is one mesh and moves every part rigidly with its joint": see section 5.

Mutation check: I temporarily made `buildNoxelNature` nudge one tree's rotation when the camera was far away. Test 1 failed, as it should. The change was then reverted. The test therefore fails if rendering or LOD state leaks into sim state.

### 2.3 Live-browser runs (local build, not the deployed site)

All browser runs used Playwright headless Chromium with software GL (ANGLE over SwiftShader), against a local build routed at `https://astrix.local/`. Software GL renders about 1 frame per second, so draw calls and triangles come from `renderer.info` and `window.__renderBreakdown()`, not from fps.

| Run | Probe script | Evidence |
| --- | --- | --- |
| Baseline (FEAT-001) | `.kiro/artifacts/screenshots/probe/m008-baseline-b.js` | `baseline.json`, `baseline-*.png` |
| Trees (FEAT-002) | `probe/m008-trees-a.js` | `trees-a.json`, `trees-*.png` |
| Budget (FEAT-003) | `probe/m008-budget-c.js` | `budget.json`, `budget-*.png` |
| Final desktop (FEAT-004), 1000x600 | `probe/m008-final-a.js` | `final.json`, `final-*.png` |
| Emulated mobile (FEAT-004) | `probe/m008-mobile-a.js` | `mobile.json`, `mobile-*.png` |
| Review v1: farm, forest, forest 140 m | `probe/m008-views-a3.js` | `views-close.json`, `views-farm*.png`, `views-forest.png`, `views-forest-clean.png`, `views-forest-140*.png` |
| Review v1: zoomed out (300, 600, 1400 m) | `probe/m008-views-b3.js` | `views-zoom.json`, `views-farm-{300,600,1400}*.png`, `views-forest-{300,600,1400}*.png` |
| Review v1: panning | `probe/m008-views-d4.js` | `views-pan.json` |
| Review v1: reviewed build (5be91a3) for comparison | `probe/m008-views-e4.js` | `views-before.json` |

The review v1 probe scripts are generated from `probe/m008-views.template.js` by `probe/m008-views-gen.mjs`; each saves its JSON through a browser download. The `*-clean.png` screenshots hide the UI panels so the scene can be judged.

View URLs (all with `?chain=0&mode=builder`):

- farm: `tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=40`
- forest (Eastwood): `tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=50`
- grove close-up: `tx=-27&ty=19&tz=-30&yaw=0&pitch=16&dist=15`
- LOD pair: forest target at `dist=30` and `dist=140`
- `&multidraw=0` forces the fallback used when `WEBGL_multi_draw` is missing.

## 3. Budget: before and after (desktop browser)

Budget from the owner: draw calls below 120 and triangles below 250,000, with real headroom. The plan's working target was at most 95 calls and 200,000 triangles in the farm and forest views.

| View | Before (99c6b11 + breakdown) calls / tris | Final calls / tris | Headroom to 120 / 250k | Main pass calls / tris | Shadow pass calls / tris |
| --- | --- | --- | --- | --- | --- |
| Farm | 106 / 248,364 | **80 / 116,486** | 40 calls / 133,514 tris | 59 / 91,822 (before 70 / 216,466) | 21 / 24,664 (before 36 / 31,898) |
| Forest | 74 / 403,068 | **40 / 162,690** | 80 calls / 87,310 tris | 37 / 113,650 (before 39 / 254,680) | 3 / 49,372 (before 35 / 148,388) |
| Grove close-up | 66 / 228,826 | **59 / 109,010** | 61 calls / 140,990 tris | 38 / 83,862 (before 30 / 197,180) | 21 / 25,148 (before 36 / 31,646) |
| Farm, `multidraw=0` | n/a | 87 / 117,110 | 33 calls / 132,890 tris | 61 / 92,258 | 26 / 24,852 |
| Forest, `multidraw=0` | n/a | 52 / 182,160 | 68 calls / 67,840 tris | 42 / 128,808 | 10 / 53,352 |
| Forest LOD pair, dist 30 | n/a | 35 / 146,492 | 85 / 103,508 | 29 / 94,052 | 4 / 52,554 |
| Forest LOD pair, dist 140 | n/a | 62 / 201,236 | 58 / 48,764 | 59 / 168,016 | 3 / 33,220 |

Calls and triangles in the "Final" column are `renderer.info` at the time of reading. The main/shadow split comes from `__renderBreakdown()`, read a moment later; in the forest view it gave 163,022 triangles against the renderer's 162,690 (332 apart, from animals moving between the two reads). Farm and forest are within the 95 / 200,000 target. The zoomed-out forest at 140 m is just over 200,000 triangles (201,236) and still 48,764 below the 250,000 budget. Its cost is mostly near voxel terrain (53 calls, 112,024 triangles), because more ground is in view.

Run-to-run variation: the FEAT-003 run measured the forest at 43 calls / 162,456 and the farm at 80 / 116,530. Ambient fauna counts move between runs (rabbits spawn and despawn), which shifts a few calls and triangles.

### 3.1 Vegetation share

| View | Vegetation before calls / tris | Vegetation final calls / tris (main + shadow) | Ground cover final calls / tris |
| --- | --- | --- | --- |
| Farm | 2 / 11,454 | 2 / 2,348 (852 + 1,496) | 1 / 10,334 |
| Forest | 2 / 128,742 | 3 / 26,516 (6,328 + 20,188) | 1 / 13,676 |
| Grove close-up | 2 / 10,416 | 2 / 3,076 (844 + 2,232) | 1 / 10,804 |

The forest view has 500 vegetation instances: 120 near, 252 mid, 128 far.

### 3.2 What was changed to get there (honest list)

Everything below is presentation only. No animal model, animal count or animal size was reduced.

- **Trees and bushes** (FEAT-002): faceted ellipsoid trees replaced by block-built species (oak, birch, beech, spruce, pine, cherry) with four growth stages (sapling, young, mature, old) and three bush types (leafy, berry, fern clump). Three LOD bands: near under 60 m, mid 60 to 130 m (three stacked boxes, about 32% of a mature near tree), far beyond 130 m (a simple block silhouette that casts no shadow).
- **Ground cover** (FEAT-003, `Game/src/render/ground-cover.ts`): grass tufts, flowers, ferns, stones, logs, mushrooms, understory bushes and saplings within 52 m of the camera target, one merged mesh, no shadows cast, decoration only (not sim entities, not harvestable).
- **Far terrain**: coarser beyond 448 m (16 m cells) and 896 m (32 m cells), split into 256 m tiles that are culled when outside the view. Near terrain within 448 m is unchanged. The sea surface grid was trimmed beyond the island (18,432 to 1,152 triangles).
- **Sun shadows**: the shadow box is now plus or minus 100 m (was 180 m), placed 40 m ahead of the camera target along the view and snapped to shadow-map texels so it does not shimmer. Trees more than about 140 m ahead of the target, or about 60 m behind it, now render without shadows.
- **Herds and wildlife**: an animal batch whose whole group is off screen (or outside the shadow box) skips its draw call (`Game/src/render/animal-kit.ts`, bounding sphere around that frame's animals plus 4 m). The animals still exist and move in the simulation and appear again as soon as any of them is in view.
- **Homestead**: farmhouse, well, fences and shelters merged into one static mesh. Each villager is now one skinned mesh instead of six part meshes (same parts, same animation code).
- **No multi-draw fallback** (`?multidraw=0`, or automatically when `WEBGL_multi_draw` is missing): vegetation is drawn as merged 96 m tiles so calls stay bounded instead of one call per tree.

## 4. Emulated mobile measurement

**This is not a real phone.** No device was available. The run used Playwright headless Chromium 151 with an emulated 390x844 viewport, deviceScaleFactor 3, `isMobile` and `hasTouch` (coarse pointer reported), software GL (ANGLE over SwiftShader). The game caps pixel ratio at 2, so the drawing buffer was 780x1688. Each build loaded unthrottled until stable, then CDP `Emulation.setCPUThrottlingRate` rate 4 was applied for a measured 60 s span on the farm view. CPU throttling slows the page's main thread; SwiftShader rasterises in the GPU process, which is not throttled. Frame rate from this setup does not represent any phone. Draw calls, triangles and main-thread CPU per frame are comparable between builds because the emulation was identical.

`WEBGL_multi_draw` was **present** in this emulated context (it is a SwiftShader feature here; some real mobile GPUs lack it). So the default run used the shared BatchedMesh path, and a second run forced the fallback with `?multidraw=0`.

| Farm view, emulated mobile, 4x CPU throttle | Before (99c6b11) | After | After, `multidraw=0` |
| --- | --- | --- | --- |
| Draw calls | 80 | 53 (main 32, shadow 21) | 60 (main 33, shadow 27) |
| Triangles | 222,626 | 87,900 | 88,772 |
| Frames in 60 s span | 44 | 47 | 45 |
| Main-thread CPU per frame, mean / p50 / p95 / max (ms) | 31.2 / 32.9 / 55.7 / 72.6 | 30.8 / 32.9 / 49.4 / 63.2 | 31.6 / 33.8 / 52.6 / 60.0 |
| Frame interval mean / p50 / p95 (ms) | 1,387.8 / 1,306.4 / 1,795.5 | 1,292.5 / 1,193.5 / 1,866.8 | 1,348.1 / 1,206.6 / 1,808.2 |
| Section means over the span (ms): render submit | 11.49 | 10.63 | 9.57 |
| tick | 9.18 | 8.76 | 8.43 |
| fauna | 2.48 | 1.88 | 2.48 |
| homestead | 0.96 | 1.02 | 1.01 |
| terrain | 0.36 | 0.52 | 0.58 |
| vegetation / groundcover | not measured in that build | 0.02 / 0.18 | 0.00 / 0.12 |
| JS heap (MB) | 41.7 | 38.5 | 38.0 |

Reading: under identical emulation the new build draws 34% fewer calls and 61% fewer triangles on the farm view. Main-thread CPU per frame is about the same (about 31 ms mean, p95 6 ms lower). The vegetation LOD and ground cover add well under 1 ms per frame. Frame interval is about 1.2 to 1.4 s in every build because software rasterisation of a 780x1688 buffer dominates; that number says nothing about a phone's frame rate. The settlement panel covers most of the portrait screen in the screenshots (`mobile-before-farm.png`, `mobile-after-farm.png`, `mobile-after-farm-multidraw0.png`), which is the existing UI layout, not a vegetation issue.

## 5. Animal regression check

Source changes since the live release (`git diff 99c6b11`): `render/animal-models.ts`, `render/fauna.ts`, `sim/fauna.ts` and `sim/homestead.ts` are **unchanged**. `render/animal-kit.ts` changed only in culling (frustum culling on, with a bounding sphere around that frame's instances plus 4 m); the shader, models, pose attributes and counts are untouched. `render/characters.ts` draws the same villager parts as one skinned mesh; `render/homestead.ts` merges static buildings and fences.

Tests covering animal behaviour, all passing: `m004.fauna` (3: deterministic spawn and habitat, flee from people, sleep at night), `m007.behaviour` (4: feeding, reproduction, wildlife not in saves, homestead replay), `m007.predators` (5: spawn determinism, hare bolts from fox, fox stalk/pounce/rest, wolf pack, deer bolt from wolves), `m007.smooth` (7, including "rendering never changes simulation state" and "drawn animals move every frame"), `m008.groundcover` "sun shadow box snaps to texels and herds cull by a sphere around their animals", and `m008.persistence` "the skinned villager figure is one mesh and moves every part rigidly with its joint" (posed vertex positions match the old part hierarchy within 0.0001 m for a walking, turning pose).

Browser counts below are drawn instances from `final.json`, sampled after warm-up over about 23 s in the farm and forest views. "Moved" is how many of the first eight instances changed position by more than 5 cm; "phase" is how many changed their gait animation phase. Instance slots can be reassigned between frames, so these show that animals are drawn and animated, not that a specific animal walked a path.

Rabbits and hares are one species in the game (`rabbit`, labelled "Hare" in the inspector), so they share a row.

| Species | M007b farm (before) | Final farm | Final forest | Moved / phase (farm) | Moved / phase (forest) |
| --- | --- | --- | --- | --- | --- |
| Deer | 2 | 2 | 48 drawn (64 in sim) | 0 of 2 / 2 of 2 | 2 of 8 / 8 of 8 |
| Rabbit / hare | 46 | 46 | not in view | 4 of 8 / 8 of 8 | n/a |
| Fox | 2 | 2 | 1 | 0 of 2 / 2 of 2 | 0 of 1 / 1 of 1 |
| Wolf | 0 | 0 (not in view) | 32 drawn (37 in sim) | n/a | 1 of 8 / 8 of 8 |
| Trout | 10 | 10 | not in view | 5 of 8 / 8 of 8 | n/a |
| Cattle | 2 | 2 | 2 (sim) | 2 of 2 / 2 of 2 | homestead off screen |
| Chicken | 4 | 4 | 4 (sim) | 3 of 4 / 2 of 4 | homestead off screen |
| Goat | 2 | 2 | 2 (sim) | 1 of 2 / 1 of 2 | homestead off screen |
| Horse | 2 | 2 | 2 (sim) | 2 of 2 / 2 of 2 | homestead off screen |
| Pig | 2 | 2 | 2 (sim) | 1 of 2 / 0 of 2 | homestead off screen |
| Sheep | 3 | 3 | 3 (sim) | 3 of 3 / 3 of 3 | homestead off screen |

Deer and fox standing still in a 23 s window is normal grazing or resting behaviour; their animation phase still advanced. The deer and wolf caps (48 and 32 drawn) are the existing M007 render caps and are unchanged. The forest view's homestead herds cost no draw calls because the herd is off screen; their animals are still in the sim (`__metrics.homestead.animals` reports all 15).

Not observed in the browser in this stage: a predator chasing prey on screen, wolves in the farm view, rabbits and trout in the forest view. Predator and prey rules are covered by `m007.predators` only.

## 6. Tree felling in the browser

Grove close-up view, normal builder **Use/Gather** button (`#gather-nearest`, the `harvest` command path, 40 m radius around the camera target). Nine presses harvested 36 wood (inventory wood 24 to 60) from three trees, in order: the hero spruce/pine at (-22, -26), a cherry, then a birch/beech. All three were depleted. Drawn nature instances went from 42 to 39, near-band instances from 16 to 13, calls from 59 to 58 and triangles from 109,010 to 107,990. The state hash changed from `777382d06cbdd2f6` to `acf9994f015e9e85` (the harvests are journaled). Screenshot: `final-grove-felled.png`. Note: `__metrics.trees` is a generation statistic and does not change on harvest; the drawn count is `natureInstances`.

## 7. Visual vs simulated behaviour

Simulated (in the save, hashed, replayed):

- Tree, shrub, ore and cairn entities, their ids, positions, yields and harvest state. Unchanged by this stage: the generator draws the same random numbers and the genesis hash `e659504b056654dc` is unchanged.
- Homestead villagers and animals, and ambient wildlife rules (wildlife is not saved, as before).

Visual only (derived, never saved, never decides whether anything exists):

- Tree species, growth stage and colour variant: pure functions of the entity id, position and seed. **Growth stage does not change yield.** Trees do not regrow or grow over time in this stage; the stage is a fixed appearance per tree.
- LOD band (near, mid, far), ground cover, understory bushes and saplings, shadow box placement, far terrain coarsening, herd culling, merged meshes, the skinned villager mesh and the multi-draw fallback.
- Ground cover is not a sim entity and cannot be harvested.

## 8. Species, stages and screenshots

Species: oak (from `styl_tree_table`), birch and beech (from `styl_tree_cluster`, by 48 m area), spruce and pine (from `styl_tree_spire`, by area, height and slope), cherry (from `styl_tree_blossom`). Bushes: leafy bush, berry bush, fern clump. Stages: sapling, young, mature, old (hero trees near the start are mature or old). Ground cover kinds: grass, flower, fern, stone, log, mushroom, understory bush, sapling.

| Screenshot | Shows |
| --- | --- |
| `baseline-farm.png`, `baseline-forest.png`, `baseline-grove-close.png` | Before (faceted ellipsoid trees). |
| `final-farm.png` | Farm: homestead, herds, block trees, ground cover. |
| `final-forest.png` | Eastwood: mixed oak, birch, spruce, cherry, with ferns, logs, mushrooms and stones on the forest floor. |
| `final-grove-close.png` | Close-up cherry at 15 m, with a deer partly behind its trunk. |
| `final-grove-felled.png` | Same view after three trees were felled. |
| `final-lod-near.png`, `final-lod-far.png` | LOD pair: forest from 30 m and 140 m. At 140 m, 346 of 500 trees are in the far band and 145 in mid. |
| `final-farm-multidraw0.png`, `final-forest-multidraw0.png` | The no-multi-draw fallback; same look, tiles instead of one batch. |
| `mobile-*.png` | Emulated mobile portrait views. |

Close-up quality: within 60 m everything is drawn at full detail. Animal models, counts and sizes are unchanged. Near terrain is unchanged. The visible trade-offs are at distance only: mid-band trees (60 to 130 m) are three stacked boxes; far trees beyond 130 m cast no shadow; shadows end about 140 m ahead of the camera target; terrain beyond 448 m is coarser. Whether the new block trees read better than the old ellipsoids is an art judgement for the owner, made from the screenshots above.

## 9. What is not verified

- A real phone. Only the emulated, software-GL measurement in section 4 exists.
- Smoothness at 60 fps by eye. Software GL runs about 1 fps; only CPU per frame and render counts were measured.
- Tree regrowth or growth over time: not implemented in this stage (stage is a fixed appearance).
- Ecological spawn by biome, season and resources for new species: belongs to the later animal stages; no species were added.
- Predators actually catching prey: not implemented (unchanged from M007b).
- Villager animation in the browser was seen in screenshots only; the pose correctness of the skinned mesh is verified by test, not by measuring the browser.
- Wolves near the farm, rabbits and trout in the forest: not in view in these probes.
- Panning at a real 60 fps. The panning runs in section 10.3 ran at about 8 to 14 rendered frames per second (240 to 366 frames in 20 to 30 s), so the camera moved about 2 to 2.75 m per frame instead of about 0.5 m at 60 fps.
- Mobile performance on a real device (open gate, section 10.6).

## 10. Review v1 fixes

Review: `.agents/tasks/task-m008-vegetation/2026-11-24-151805-review.md`, verdict NEEDS_CHANGES, six items. All runs below: local build of the review v1 working tree, Playwright headless Chromium, software GL, 1000x600, `WEBGL_multi_draw` present unless `multidraw=0` is forced. Calls and triangles are `renderer.info` (main plus shadow pass); the split is from `__renderBreakdown()`. Nothing here is deployed. The panning runs (`views-pan.json`) used the committed `Game/dist` build; the farm, forest and zoomed-out runs (`views-close.json`, `views-zoom.json`) used the build just before it, which differs only by the added `naturerebuild` section and `natureRebuilds` counter.

### 10.1 Item 1: macro tiles at zoomed-out cameras (fixed)

Two changes, both presentation only:

- **Macro tiles share one buffer** (`buildMacroMesh`, `VoxelTerrainView.cullMacro` in `Game/src/render/terrain.ts`). All 256 m tiles now sit in one vertex and index buffer in row-major order. Each frame, off-screen tiles are still dropped by box test, and each run of consecutive visible tiles is drawn with one call (a run may continue across an off-screen tile of at most 1,500 triangles). Measured: 40 tiles in view at farm 1400 m now cost 1 macro call, and every zoomed-out view below needs 1 to 4; the farm view at 40 m still culls to 4 tiles in 2 calls.
- **Smaller drawn near ring at long zoom** (`nearDisplayRadius`, `NEAR_DISPLAY_DISTANCES = [220, 450]`). Merging the macro alone was not enough: an intermediate browser run with only the merged macro (same probe views, JSON overwritten by the final run) measured farm 300 m at 121 calls, farm 600 m at 102, farm 1400 m at 97 and forest 600 m at 251,954 triangles, because the 49 near chunk meshes plus their water cost about 75 calls and about 100,000 triangles when the whole ring is on screen. Now, beyond 220 m camera distance only the 5x5 chunks around the target are drawn, and beyond 450 m only the 3x3 (10% hysteresis when zooming back in). The macro mesh is rebuilt with the matching smaller hole. Chunks stay loaded, so fauna, vegetation and the sim see exactly the same chunk set (test "zoomed out, the drawn near ring shrinks while every chunk stays loaded..."). One 1 m voxel covers about 4 pixels at 220 m and about 2 at 450 m in this viewport.

| View (`?chain=0&mode=builder`) | Reviewed build 5be91a3 calls / tris | Review v1 calls / tris | Main pass calls / tris | Shadow pass calls / tris | Macro tiles in view | Near chunks drawn |
| --- | --- | --- | --- | --- | --- | --- |
| Farm 300 m (`tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=300`) | 129 / 201,198 | **89 / 148,736** | 69 / 125,568 | 20 / 23,168 | 12 | 25 of 49 |
| Farm 600 m (`pitch=30&dist=600`) | not measured | **44 / 115,128** | 41 / 104,616 | 3 / 10,512 | 26 | 9 of 49 |
| Farm 1400 m (`pitch=30&dist=1400`) | not measured | **39 / 117,892** | 39 / 117,892 | 0 / 0 | 40 | 9 of 49 |
| Farm 1400 m, lowest pitch (`pitch=20&dist=1400`) | 157 / 239,318 | **39 / 117,892** | 39 / 117,892 | 0 / 0 | 40 | 9 of 49 |
| Forest 300 m (`tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=300`) | not measured | **54 / 180,714** | 35 / 139,426 | 19 / 41,288 | 16 | 25 of 49 |
| Forest 600 m (`pitch=28&dist=600`) | 103 / 253,252 | **51 / 179,072** | 34 / 137,912 | 17 / 41,160 | 26 | 9 of 49 |
| Forest 1400 m (`pitch=28&dist=1400`) | not measured | **32 / 150,014** | 32 / 150,014 | 0 / 0 | 37 | 9 of 49 |
| Forest 1400 m, lowest pitch (`pitch=20&dist=1400`) | not measured | **32 / 150,014** | 32 / 150,014 | 0 / 0 | 37 | 9 of 49 |
| Forest 1400 m, lowest pitch, `multidraw=0` | not measured | **40 / 150,014** | 40 / 150,014 | 0 / 0 | 37 | 9 of 49 |

The reviewed build was over budget at three of the four zoomed-out views it was measured at (129 and 157 calls; 253,252 triangles). Review v1 stays at or below 89 calls (31 headroom) and 180,714 triangles (69,286 headroom) in every zoomed-out view. `pitch=20` is clamped to the rig's minimum of 0.35 rad (20.05°).

Visible trade-off: at 300 m the drawn 1 m voxel ring is 160 m wide instead of 224 m, and its edge against the 8 m macro terrain is closer to the target (`views-farm-300-clean.png`). At 600 m and beyond the foreground is macro terrain.

### 10.2 Item 4: near LOD band raised to 90 m (fixed)

`DEFAULT_LOD_BANDS.near` is 90 m (was 60); mid stays 130 m, hysteresis 4 m (`Game/src/render/lod.ts`).

| View | Reviewed build (`final.json`) calls / tris | Review v1 (`views-close.json`) calls / tris | Main / shadow calls | Vegetation near / mid / far instances | Vegetation LOD triangles |
| --- | --- | --- | --- | --- | --- |
| Farm (`dist=40`) | 80 / 116,486 | **78 / 117,822** | 57 / 21 | 25 / 14 / 3 (was 10 / 29 / 3) | 3,098 (was 2,088) |
| Forest (`dist=50`) | 40 / 162,690 | **41 / 170,330** | 35 / 6 | 244 / 128 / 128 (was 120 / 252 / 128) | 35,488 (was 27,616) |
| Forest 140 m | 62 / 201,236 | **59 / 210,498** | 52 / 7 | 66 / 88 / 346 (was 9 / 145 / 346) | 21,670 (was 17,800) |

Headroom to 120 calls / 250,000 triangles: farm 42 / 132,178, forest 79 / 79,670, forest 140 m 61 / 39,502. The forest 140 m view is the tightest view measured; its cost is mostly near voxel terrain (46 main calls, 112,630 triangles). Screenshots: `views-farm.png`, `views-farm-clean.png`, `views-forest.png`, `views-forest-clean.png`, `views-forest-140.png`, `views-forest-140-clean.png`.

### 10.3 Item 2: tiled fallback while panning (fixed: re-bakes split and spread)

`TiledLodMesh` (`Game/src/render/lod.ts`) now marks the near/mid mesh and the far mesh of a tile dirty separately (a near/mid switch re-bakes only the near/mid mesh), and bakes at most 2 tile meshes per frame, nearest tile first (`TILED_LOD_BAKES_PER_UPDATE`). Tiles waiting for a bake keep their previous geometry, which is one band older, and are finished on later frames even when the camera stops.

Method: after warm-up, the probe holds D (builder pan right) without Shift. "Oscillate" alternates D and A for 1.5 s each for about 30 s, staying near the start (mostly band switches). "Sweep" holds D for 20 s (about 500 m, so chunks load). The mean comes from the `vegetation` section sum over the pan frames; `meanMs` is rounded to 0.01 ms in the metrics, which gives at most ±0.013 ms error on these means. "Max" is the section's maximum since page load (it was 0.1 ms before every pan). Chunk loads also rebuild the whole nature set (pre-existing behaviour, not part of the `vegetation` section); review v1 adds a separate `naturerebuild` section so that cost is visible.

| Run (forest `dist=50` unless noted) | Frames | `vegetation` mean / max (ms) | Band evaluations / switches | Tile meshes baked | Most bakes waiting | Nature rebuilds: count, mean / max (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| Reviewed build, `multidraw=0`, oscillate | 258 | 1.451 / 15.7 | 85 / 8,400 | not counted in that build | n/a | not measured in that build |
| **Review v1, `multidraw=0`, oscillate** | 240 | **1.032 / 4.6** | 101 / 2,153 | 419 | 10 | 1, 19.5 / 19.5 |
| Reviewed build, `multidraw=0`, sweep | 276 | 0.357 / 11.6 | 49 / 3,182 | not counted | n/a | not measured |
| **Review v1, `multidraw=0`, sweep** | 282 | **0.309 / 6.0** | 65 / 4,216 | 590 | 11 | 40, 3.59 / 20.7 |
| Review v1, `multidraw=0`, farm oscillate | 366 | 0.084 / 3.0 | 129 / 461 | 480 | 4 | 15, 1.53 / 4.1 |
| Review v1, multi-draw, oscillate | 258 | 0.017 / 0.2 | 105 / 6,360 | n/a | n/a | 21, 2.55 / 5.5 |
| Review v1, multi-draw, sweep | 282 | 0.017 / 0.8 | 69 / 3,987 | n/a | n/a | 40, 1.39 / 4.1 |

Every `multidraw=0` run ended with 0 bakes waiting 6 s after the keys were released. Reading: the worst `vegetation` frame on the fallback path fell from 15.7 ms to 4.6 ms (oscillate) and from 11.6 ms to 6.0 ms (sweep); the mean fell from 1.451 to 1.032 ms. The two builds also differ in the near band (60 vs 90 m), so the review v1 fallback bakes more near geometry per tile. Still open: the full nature rebuild after a chunk load reached 20.7 ms on the fallback path (3.59 ms mean over 40 rebuilds), against 4.1 ms with multi-draw. That rebuild existed before this stage; spreading it is not part of review v1. The "switches" counts differ between runs because the camera path depends on the frame rate.

### 10.4 Item 3: shadow box and ground cover anchored to the ground on screen (fixed)

`viewGroundOffset` (`Game/src/render/camera.ts`) finds where the bottom screen edge meets the ground plane through the target. The shadow box lead (`shadowLead`, `Game/src/render/sky.ts`) and the ground-cover centre (`groundCoverOffset`, `Game/src/render/ground-cover.ts`) slide toward the camera so both still reach 8 m past that point. Close views are unchanged (lead 40 m, cover offset 0).

| View | Bottom edge meets ground (m from target, negative = toward camera) | Shadow box lead (m) | Ground-cover offset (m) | Ground-cover pieces / triangles |
| --- | --- | --- | --- | --- |
| Farm 40 m | -17.3 | 40 | 0 | 422 / 10,334 |
| Forest 50 m | -22.3 | 40 | 0 | 509 / 13,676 |
| Forest 140 m (the review's example) | -62.3 | 29.7 | -18.3 | 523 / 14,102 |
| Farm 300 m | -129.4 | -37.4 | -85.4 | 274 / 6,186 |
| Forest 300 m | -133.5 | -41.5 | -89.5 | 190 / 5,146 |
| Farm / forest 600 m | -258.8 / -267.1 | -166.8 / -175.1 | -214.8 / -223.1 | 0 / 0 |

Limit: ground cover is only placed on drawn near chunks. From 450 m the foreground is macro terrain (section 10.1), so at 600 m and 1400 m no ground cover is drawn; at those distances a grass tuft is well under a pixel. At 300 m the cover disc is clipped to the 5x5 drawn ring. The anchors are checked geometrically in `tests/m008.views.test.ts`, not by measuring shadow pixels in a screenshot.

### 10.5 Item 5: sapling yield and obstruction (decision recorded, no sim change)

Decision: growth stage stays **visual only** in this stage. A sapling keeps the full timber yield of its entity record and the full `OBSTRUCTION_RADIUS`, as section 7 states. No sim, save or hash change was made; the genesis hash test still passes. This must be resolved **before villager navigation**, the next stage, because pathfinding would route around an obstruction disc larger than the drawn sapling. The two options from the review remain: scale the obstruction radius (and possibly yield) by stage, which is a sim change needing a new generator version, or rule out the sapling stage for large harvestable trees so the drawn model matches the sim footprint.

### 10.6 Item 6: mobile proof (open gate)

Still emulated only (section 4: SwiftShader, 4x CPU throttle, `WEBGL_multi_draw` present). No real device was measured in review v1. This stays an **open gate** before the animal stages: run the farm and forest views on a real phone, ideally one without `WEBGL_multi_draw` so the tiled fallback is the path measured.

### 10.7 Visual vs simulated in review v1

Everything changed in review v1 is presentation: macro draw runs, the drawn near ring radius, the LOD band threshold, fallback bake scheduling, shadow box and ground-cover anchors, and the new metrics (`macroTilesInView`, `viewAnchor`, `nearDisplayRadius`, `displayedChunks`, `nearDisplayedTriangles`, `natureRebuilds`, the `naturerebuild` section, fallback `tileBuilds` / `meshBakes` / `pendingBakes`). The loaded chunk set that fauna and vegetation read is unchanged. `tests/m008.persistence.test.ts` (identical sim state across no-render, near, 900 m and fallback runs) passes with these changes.
