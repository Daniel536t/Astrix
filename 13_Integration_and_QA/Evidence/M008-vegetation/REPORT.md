# M008 vegetation stage: evidence report

Scope: the vegetation stage of the approved order (vegetation, then villager navigation, then birds, fish and land mammals). This report covers the tree species and growth stages, bushes and ground vegetation, the distance LOD, the world-asset optimisation done to make room for them, and the checks the owner asked for before any animal expansion.

All numbers below are copied from the JSON files in this folder: `baseline.json` (before), `trees-a.json` (after FEAT-002), `budget.json` (after FEAT-003), `final.json` (final desktop probe) and `mobile.json` (emulated mobile probe).

## 1. Deployed vs merged

| Item | State |
| --- | --- |
| Live release | Unchanged: still `20261124T121804Z-99c6b11`. Nothing from this stage is deployed. |
| Branch | Committed locally on `deploy/boxd`: 984d317 (render breakdown + baseline), e98e446 (tree species, stages, LOD), abd9010 (ground cover and world-asset optimisation), plus the FEAT-004 commit with this report and `Game/tests/m008.persistence.test.ts`. |
| Main | Not merged to `main`. Not pushed by this stage. |
| `Game/dist` | Tracked build output left at its committed state. The browser probes used fresh builds copied to `.kiro/artifacts/screenshots/probe/dist` (after) and `probe/dist-base` (before, built from commit 99c6b11 in a separate git worktree). |

## 2. Tests vs live browser

### 2.1 Automated tests (Node, no browser)

`cd Game && npx tsc --noEmit && npm test && npm run build`: tsc clean, **226 of 226 tests pass**, build succeeds. The genesis hash test (`tests/m004.generator.test.ts`, "generator v1 genesis is unchanged by the v2 work", `e659504b056654dc`) passes unchanged.

Tests added in this stage:

| File | Tests | What they prove |
| --- | --- | --- |
| `tests/m008.breakdown.test.ts` | 2 | The render breakdown helper matches three.js draw and triangle counting. |
| `tests/m008.vegetation.test.ts` | 7 | Species, stages and LOD are pure functions of entity id and position; no RNG draws, saved state or entity ids change; harvested entities are not drawn. |
| `tests/m008.groundcover.test.ts` | 8 | Ground cover is deterministic, load-order independent, avoids water, edits, structures, homestead cells and tree clearance, adds no entities, leaves the genesis hash alone; shadow policy; macro LOD bounds; no-multi-draw fallback bounded; herd culling sphere covers every animal. |
| `tests/m008.persistence.test.ts` (new in FEAT-004) | 4 | See 2.2. |

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
