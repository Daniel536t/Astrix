# IR-005 — World Foundation Audit and Correction Plan

**Mission:** M001 — Foundation Correction  
**Date:** 2026-10-26  
**Status:** Audit complete; correction implemented as a vertical slice. **Not approved.**  
**Author:** OpenCode / DeepSeek V4.1 Flash  
**Evidence:** `13_Integration_and_QA/Evidence/M001/` (before/after captures, test log, performance JSON)

---

## 0. Executive summary

The deployed world is small because the simulation is a finite **256 × 256 m heightfield**, not because the camera is too close or the fog is too thin. `Game/src/sim/world.ts` allocates one `Float32Array` of 65,536 heights plus a top-surface material byte per cell, and `Game/src/render/terrain.ts` meshes that heightfield in four fixed 64 m chunks. The visible square is the heightfield boundary: at ±128 m the mesh stops, a 12 m render-only apron continues the silhouette, and a separate horizon ring sits behind it. The default camera at 105 m and 12° pitch looks across the slab edge, so the boundary is part of the first frame.

This report proposes a replacement foundation: a chunked, genuinely three-dimensional voxel world with occupancy and material per cell, deterministic generation from a seed, lazy chunk streaming, a near 1 m voxel mesher, a far LOD surface derived from the same generator, an ocean that continues past the playable extent, and Noxel natural/architectural assets placed on the authoritative surface. The vertical slice in this change proves the data model, deterministic regeneration, material layering, connected geography, streaming, Noxel placement, voxel edits, entity harvest state, and measured rendering. It does **not** prove MagicBlock integration, production persistence, construction, governance, or final Noxel art direction.

---

## 1. Root-cause diagnosis

### 1.1 Why the world is small

| Cause | Evidence | Consequence |
|---|---|---|
| Fixed 256 m simulation extent | `Game/src/sim/world.ts:13` `SIZE = 256`; `:16` `HALF = SIZE / 2`; `:111` `iddx = z * SIZE + x` | All terrain, materials, props, sites and queries live in one 256² array. |
| Heightfield storage | `Game/src/sim/world.ts:58-68` `World { heights, materials, flags, ... }`; `:196-199` allocates 65,536 heights and top-surface material bytes | The world has one solid value per XZ cell. There is no occupancy volume, overhang, cave, or per-voxel material. |
| Fixed render chunks | `Game/src/render/terrain.ts:22` `CHUNK = 64`; `:333-348` loops the whole 256 m map once | Chunking is a meshing convenience, not streaming. The whole world is always resident. |
| No streaming or LOD | No camera-dependent chunk load/unload in `terrain.ts` or `main.ts` | World size is bounded by what one mesh set can hold, not by what can be streamed. |
| Camera clamp mirrors the map | `Game/src/render/camera.ts:129-133` clamps target to ±120 m, y 0…62 | Even if terrain were larger, the camera could not explore it. |
| Camera default exposes the edge | `Game/src/main.ts:54-57` default `yaw 10°, pitch 12°, dist 105`, target `(-8, 6, -18)`; `camera.ts:25` far plane 1600 | The first frame is a low oblique view across the 256 m slab, so the apron/skirt boundary is visible. |
| Separate scenery masks the boundary | `Game/src/render/terrain.ts:423-498` `buildOuterApron`; `:501-554` `buildHorizon`; `main.ts:81-84` adds both | The square is not fixed; it is dressed with a 12 m apron and a horizon ring. This is the "small square surrounded by empty space" read. |

The 256 m dimension is **not an owner-approved final world size**. It is D-016, status **Proposed (GLM ratification)**, and the older 128 m v1 map remains the formally approved baseline. The style guide's ±64 m / 128 m map is marked RATIFIED, but it is a prototype convention, not a world-scale decision. The mission supersedes both for this correction.

### 1.2 Why the square remains visually apparent

1. The terrain mesh ends at x/z = ±128 m. The side faces at the boundary extend to `SKIRT = -12` (`world.ts:20`, `terrain.ts:229-273`), producing a cut-away diorama slab.
2. `buildOuterApron` continues the border mountains only 408 m outward at 12 m resolution, using clamped edge heights (`terrain.ts:423-454`). It is render-only, never queried by simulation, and visibly lower-detail.
3. `buildHorizon` is a separate 200-segment ring at 430–1100 m (`terrain.ts:501-554`). It is scenery, not world.
4. The default camera is outside its own documented spec: ADB §4 says ~40° pitch and ~45 m distance, but `main.ts:54-57` uses 12° and 105 m. At 12° the eye is near the slab's horizon, so the edge and the apron seam are both in frame.
5. `buildWater` only covers cells inside the 256 m map (`terrain.ts:353-415`). Beyond the map there is no water surface, so the slab floats.

The correction therefore must change the **representation and generation**, not the camera alone. A wider camera over a 256 m heightfield would only show the square more clearly.

### 1.3 Current verified baseline

Measured on the current build (`vite build` 1.65 s; headless Chromium/SwiftShader, 1600×900, seed 1337, noon, UI off):

| View | Draw calls | Triangles | Errors |
|---|---:|---:|---|
| Default | 49 | 245,094 | 0 |
| Map (`scene=map`) | 50 | 201,670 | 0 |
| Wide (dist 330) | 53 | 252,924 | 0 |

Budget in `00_Project_Core/Technical_Architecture.md` §8: ≤120 calls, ≤250k triangles, ≤120 MB heap, ≤16 ms frame. The default is already at 98% of the triangle budget with a world the mission rejects. The budget must be revised, not silently exceeded.

---

## 2. Current architecture map

```
Game/src/
  sim/world.ts          deterministic 256² heightfield + top material + flags
                        props (trees/rocks/ore) and two Noxel sites are placed here
  render/terrain.ts     top-quad + run-merged side mesher, 4 fixed 64 m chunks
                        water surface, render-only apron, render-only horizon
  render/props.ts       faceted NatMass trees/rocks/ore, ground cover, reeds,
                        cliff fringe/detail, wall shrubs, stone trail
  render/noxel.ts       provisional Noxel kit (post/wall/gateway/stair/bench),
                        waystone, marker
  render/camera.ts      orbit rig, keyboard/touch movement, ±120 m target clamp
  render/sky.ts         time-of-day lighting, gradient dome, sun disc
  main.ts               renderer/scene wiring, URL params, HUD, capture contract
  data/palette.json     authoritative materials + lighting presets (palette_v2)
```

### 2.1 Generation and storage

- Entry point: `generateWorld(seed = 1337)` in `sim/world.ts:195`.
- Storage: `heights: Float32Array(SIZE*SIZE)`, `materials: Uint8Array(SIZE*SIZE)` (top surface only), `flags: Uint8Array(SIZE*SIZE)`, `edge: Float32Array(SIZE*SIZE)` (`world.ts:58-68`, `:196-199`).
- Coordinates: world metres x/z ∈ [-128, 128), cell centres at integer + 0.5; `worldX/worldZ` at `world.ts:114-115`.
- Determinism: `mulberry32` (`world.ts:77-86`) and integer hash/value-noise/fBm (`:71-108`). Generation is deterministic for a given seed; props use a separate seeded RNG (`:450`).
- Geography: authored ellipses, hard/soft masks, ridge masks, river polyline, lake, plain, passes (`world.ts:117-193`, `:202-348`). This is an authored diorama, not a general landscape generator.
- Materials: only four top-surface IDs (`GRASS/STONE/SAND/PATH`, `world.ts:22`) assigned after height generation (`:350-387`). There is no volume material, no subsurface strata in data, and no ore in terrain data.
- Props: 260 trees, boulders, ore clusters, ground cover, reeds, cliff fringe/detail, shrubs, trail. All placed by heightfield queries (`world.ts:449-586`, `render/props.ts`).
- Noxel sites: two provisional landmarks (`world.ts:603-622`), rendered by `render/noxel.ts`.
- Water: not stored as a material; `buildWater` infers it from `height < WATER` (`terrain.ts:353-415`). No water occupancy or interaction rules.
- Persistence: no save/load implementation in the running app. Technical Architecture §9 specifies a JSON schema, but it is not wired.
- Resource simulation/inventory/construction: absent in code. Props are decorative data records without IDs, yield, depletion or permitted actions.
- Governance/event history/MagicBlock: absent in code and dependencies. `Game/package.json` has only `three`; no Solana/MagicBlock SDK, program, IDL or account code.

### 2.2 Rendering

- `buildTerrain` (`terrain.ts:275-350`) loops four fixed 64 m chunks. Each chunk is one mesh with a shared `MeshLambertMaterial` and vertex colours.
- Tops are greedy-merged (`terrain.ts:120-176`); side faces are run-merged (`:229-273`) and split into 0.4/0.62/0.8 m strata rows (`:63-89`). This produces a good blocky *look* but from a heightfield.
- Water is a second blocky surface at y=0 (`terrain.ts:353-415`).
- Apron/horizon are separate low-detail meshes (`:423-554`).
- Shadows: terrain `castShadow = false` (`terrain.ts:344`), props cast; sun shadow camera ±125 m (`sky.ts:47-51`).
- Camera: orbit target clamp ±120 m (`camera.ts:129-133`); default view bypasses the pointer pitch clamp via `setView` (`camera.ts:170-176`).
- Sky: palette-driven keyframes, gradient dome radius 1200, sun disc, fog `FogExp2` (`sky.ts:26-149`).

### 2.3 Tests and profiling

- No `test` script in `Game/package.json`; no sim test files.
- Build: `vite build` only (no typecheck in the build script).
- Visual capture: `08_Technical_Director/Project_Setup/tools/render.mjs` (Playwright + SwiftShader), reads `renderer.info.render` and `window.__ready`.
- Existing artifacts are screenshots in `Game/tests/` and `13_Integration_and_QA/Evidence/T-009/`; no automated assertions.
- Deployment: `08_Technical_Director/Deployment/DEPLOY-001_public_server.md`; static `dist` behind a public server. No CI.

---

## 3. Reuse assessment

### 3.1 Retain

| System | Why |
|---|---|
| Three.js + Vite + TypeScript stack | Approved D-001/D-002; works and builds in ~1.7 s. |
| `render/camera.ts` orbit/input model | Useful; only the clamp and default framing need correction. |
| `render/sky.ts` and `palette.json` | Approved time-of-day system and palette; reuse with a fog-scale/dome-range adjustment for the larger world. |
| Noxel grammar and kit | D-003 approved the two-pipeline language; existing waystone/marker/post/wall/gateway/stair/bench are reusable provisional studies. |
| HUD/URL-param/capture contract | Essential for reproducible evidence and deployment. |
| `mulberry32` and deterministic noise approach | Reuse in the new generator. |
| Renderer-derived vertex-colour terrain material | Good performance pattern; extend to per-voxel faces and strata. |

### 3.2 Modify

| System | Change |
|---|---|
| `sim/world.ts` | Replace heightfield storage with chunked 3D voxel occupancy + material. Keep the file as the sim entry point. |
| `render/terrain.ts` | Replace heightfield mesher with a 3D greedy voxel mesher + chunk streaming + macro LOD. Remove apron/horizon. |
| `render/props.ts` | Replace heightfield-coupled faceted placement with Noxel natural asset instancing driven by authoritative entities. Preserve the instancing pattern. |
| `render/noxel.ts` | Keep kit/waystone/marker grammar; add natural Noxel assets in a separate module or extend this one. |
| `main.ts` | Wire the voxel world, streaming view, entity renderer, edit/harvest demo, new HUD and map/kit modes. |
| `camera.ts` | Clamp to world bounds, fix default pitch, keep map top-down exception. |
| `sky.ts` | Larger dome/far range and a world-scale fog multiplier; do not change palette presets. |
| `Technical_Architecture.md` §4/§8/§9 | Supersede heightfield, 256 m and 250k-triangle assumptions after owner review. |
| `Decision_Log.md` | D-007/D-016/D-017 remain proposed; add M001 proposal for voxel substrate, 2048 m world, streaming, revised budget. |
| `Voxel_Style_Guide_v1.1.md` | Its R7 heightfield acceptance and R3 ±64 m are superseded for M001; strata palette rules remain useful. |

### 3.3 Retire

- 256 m `SIZE`/`HALF` heightfield as the authoritative world.
- Fixed 64 m whole-map terrain chunks.
- `buildOuterApron`, `buildHorizon`, and the foundation skirt as boundary concealment.
- Top-surface-only `materials` as the only material model.
- Heightfield-only prop placement.
- The assumption that 250k triangles is the correct budget for a world of this scope.

**Why replacing rather than layering:** the mission explicitly rejects a heightfield with voxel decorations. Keeping the heightfield as the primary representation and adding cubes would create two competing sources of truth, break edits, and preserve the square. The old code is therefore retired, not wrapped. The Noxel grammar, palette, camera input, sky and capture harness are retained.

---

## 4. Target world architecture

### 4.1 Layers and ownership

```
World generation rules (sim, deterministic, seed + version + params)
        │
        ▼
Authoritative voxel state (sim)
  chunked Uint8 occupancy/material, edits, entity records, inventory
        │
        ├── simulation actions (harvest, dig, place, build, AI intents)
        │        validated by sim rules; governance authorizes; MagicBlock enforces
        │
        ▼
Derived presentation (render)
  near voxel meshes, macro LOD surface, water surface, Noxel instances, sky
```

The renderer never writes world state. A voxel edit is a sim action; the renderer is notified by a dirty-chunk set and rebuilds the affected mesh. An entity's visual presence is derived from `entity.state`, not from the mesh.

### 4.2 Voxel substrate

- One material byte per cell. `0` is air; `1…N` are solid/water materials. Occupancy is implicit: `material !== AIR`.
- Chunk = 32 × 32 × 128 cells = 131,072 bytes at 1 m resolution. A near ring of 49–81 chunks is 6.4–10.6 MB of voxel data.
- World = 2048 × 2048 m, y ∈ [-16, 112), sea level 0. The finite world edge is ocean, not a terrain cut.
- Generation is lazy per chunk. A chunk is a pure function of `(seed, generatorVersion, params, cx, cz)` plus the edit log. Chunk order never affects output.
- `getVoxel`, `setVoxel`, `surfaceAt`, `columnAt` are the sim query/mutation API. `setVoxel` records an edit and marks the chunk dirty.
- Surface height is a derived query, not the storage. Overhangs, caves, ledges and water cells are real occupancy.
- Materials: air, grass, soil, sand, gravel, stone, ore, water, bedrock, moss. Top material and subsurface strata are selected from height, slope, water distance and biome noise; ore is a 3D vein field inside stone.
- Water is stored as `WATER` cells up to sea level in ocean/lake/river columns. The renderer derives a single water surface from sea level and the seabed depth; the data still records the water volume.

### 4.3 Generation stages

1. **Continental mask** — domain-warped fBm + irregular radial falloff; produces a large connected island with peninsulas, bays and an ocean boundary.
2. **Elevation** — rolling fBm base, ridged mountain field, plateau/mesa mask, inlandness weighting.
3. **Hydrology** — sinuous river carve from the highlands to the sea; lake basin; connected water table at sea level.
4. **Founder valley** — soft flattening around the start for a buildable shelf, without a hard square or visible seam.
5. **Voxel fill** — per-column solid occupancy from bedrock to integer surface; top material, soil/sand/gravel subsoil, stone body, 3D ore veins, overhang/ledge carving on steep faces.
6. **Water fill** — water cells above submerged terrain up to sea level.
7. **Entities** — deterministic per-chunk Noxel trees/rocks/plants/ore, authored hero sites near the start, stable IDs and resource state.
8. **Presentation** — near 1 m greedy meshes; far 8–12 m macro LOD derived from the same surface sampler; water surface; Noxel instances.

### 4.4 Streaming and LOD

- Near ring: radius 4 chunks (128 m) at 1 m voxels, one mesh per chunk. Load/unload around the camera target.
- Macro LOD: one mesh at 8 m (map) or 12 m (world) over the full 2048 m, with a hole around the near ring. Rebuilt only when the target moves >48 m or the mode changes.
- Ocean/water: one large segmented plane at sea level, vertex-coloured by seabed depth, extending to 12 km. This is the visual continuation past the world edge and removes the square.
- Initial load preloads the near ring; subsequent streaming is budgeted (e.g. 2 chunks/frame) and unloads beyond radius+1.
- No per-frame voxel work. No per-voxel draw calls.

### 4.5 Noxel system

- **Noxel natural assets** (new, provisional): trees, rocks, plants, ore outcrops, cairns. Constructed from axis-aligned rectangular prisms, 4–9 volumes, flat palette colours, deliberate silhouette variants. They are not smooth low-poly models and not unmodified cubes.
- **Noxel architecture** (existing provisional kit): post, wall panel, gateway, stair, bench, waystone, marker. Reused as authored landmarks and the kit test.
- **Relationship to voxel terrain:** terrain is a 1 m occupancy volume with strata; Noxels sit on the authoritative surface and use a different construction grammar (authored prisms, proportions, silhouette, accents). Shared palette and scale make them one world; different construction keeps them distinct.
- **Simulation link:** each natural Noxel is an entity with a stable ID, resource type, remaining yield and harvested state. Harvesting changes sim state; the renderer hides or re-instances it. A tree is not a decorative mesh.
- Owner reference images are still absent (`05_Noxel_Studio/Reference_Images/` empty). The natural Noxel set is therefore labelled **provisional**, like the kit.

### 4.6 MagicBlock boundary (design, not implemented)

Verified from official MagicBlock documentation (`docs.magicblock.gg`, AI Dev Skill page, `magicblock-labs/magicblock-dev-skill` README) before writing this section. Documented mechanisms include delegation/undelegation, Ephemeral Rollups/Accounts, Magic Router, session keys, cranks, VRF, Magic Actions, fee/commit economics, dual-connection architecture, and the `MagicIntentBundleBuilder` / `#[ephemeral]` / `#[delegate]` / `#[commit]` patterns.

No MagicBlock SDK, program, IDL, account or dependency exists in this repository. The following is a **target design**, not a validated integration:

| State | Authority | Proposed representation |
|---|---|---|
| World identity, seed, generator version, params hash | Base layer + governance | One `WorldManifest` account/PDA. Immutable after creation except governance-authorized version/params migration. |
| Player inventory, permissions, session | Base layer + delegated session account | Player account; delegated to Ephemeral Rollup during a play session; commit/settle on interval or session end. |
| Terrain chunk edits | Base layer for durable edits; ER for active edits | Compact delta per 32×32 chunk: chunk key, base version, list of `(localIndex, material)`; base voxels regenerated from seed. Bounded account size; split if over cap. |
| Entity/resource state | ER while active; base layer at settlement | Per-region or per-entity account with stable ID, remaining yield, harvested flag, respawn rule. |
| Buildings/construction jobs | Base layer + governance | Region/plot account with building ID, footprint, cost, progress, owner; job transitions authorized. |
| AI agent actions | Approved action interface | Agent submits intents (harvest, move, build, dig) with permissions; sim/governance validates; MagicBlock enforces assigned transitions. |
| Rendered frames/vertices/textures | Never on-chain | Derived client state only. |

Lifecycle to validate in a dev-environment spike:
- Delegate the session/active-region accounts to an Ephemeral Rollup; use Magic Router for routing; use session keys for signing.
- Commit periodic checkpoints; undelegate on session end; recover from base-layer state if the ER is unavailable.
- Use cranks for scheduled production/construction ticks, not per-frame updates.
- Use VRF for verifiable seed/nonce selection if the world seed is to be publicly auditable; the current seed is a local deterministic input.
- Measure account sizes, rent, commit frequency and transaction costs before claiming a budget.

**Unverified:** account sizes, rent, commit cadence, ER availability, SDK version, program addresses, instruction encoding, and whether chunk deltas fit one account. Do not treat this table as an API contract.

---

## 5. Proposed initial parameters

| Parameter | Proposed value | Reason / assumption |
|---|---|---|
| World extent | **2048 × 2048 m** (x/z ∈ [-1024, 1024)) | Large enough for a connected island, multiple biomes and a visible horizon; small enough for a deterministic finite identity and a 64×64 chunk grid. |
| Voxel resolution | **1 m** near | Matches the existing 1 m cell language and Noxel scale; keeps edits legible. |
| Vertical range | **y ∈ [-16, 112)**, 128 layers | Sea level 0, ocean floor to -16, mountains to ~90; one byte per cell, no negative indexing. |
| Chunk | **32 × 32 × 128** cells | 131,072 bytes; aligns with the existing 32 m chunk convention; one mesh per chunk. |
| Near streaming radius | **4 chunks = 128 m** | 81 chunk meshes worst case; keeps draw calls under the revised target. Tunable. |
| Macro LOD | **12 m** world, **8 m** map | 171² or 256² samples; one draw call; derived from the same `sampleSurface`. |
| Sea level | **0 m** | Existing convention; water plane and shore rules stay simple. |
| Water extent | **12 km** visual plane | Ocean continues beyond the 2048 m world; no square edge. |
| Start | Founder valley around **(0, 0)**, surface ~7 m | Flat buildable shelf; river ~80 m east; highlands NW; forest patches E/S. |
| Default camera | **pitch 36°, distance 58 m**, target at start surface + 4 m | Inside the documented 24–66° pointer range; shows terrain, Noxel assets and horizon without exposing a boundary. |
| Camera clamp | world bounds ±1000 m, y 0…104 | Exploration follows the streamed world; map mode remains a top-down exception. |
| Fog | palette density × **0.55** in world mode; **0** in map mode | Palette colours retained; density scaled for a 2 km landscape. |
| Initial load | near ring preloaded; stream 2 chunks/frame afterward | Reproducible screenshots; bounded hitch. |

### 5.1 Revised performance targets (proposed, to be validated)

| Metric | Current | Proposed target | Notes |
|---|---:|---:|---|
| Draw calls, default | 49 | **≤ 90** | 81 near chunks worst case + water + macro + Noxel instances + sky. |
| Triangles, default | 245,094 | **≤ 350,000** | Richer world; still bounded by greedy meshing and LOD. |
| Triangles, wide/map | 252,924 | **≤ 500,000** | Macro LOD + ocean + near ring; map uses macro only. |
| JS heap | not measured | **≤ 200 MB** | Near voxel data ~10 MB; entity records and meshes dominate. |
| Initial generation (49 chunks) | not measured | **≤ 500 ms** | Pure JS, no network. |
| Streamed chunk generation | not measured | **≤ 15 ms/chunk** | Budget 2/frame; measure p95. |
| Macro mesh rebuild | not measured | **≤ 120 ms** | Only on 48 m movement or mode change. |
| Frame time | not measured on GPU | **≤ 16 ms at 1600×900** | SwiftShader cannot validate this; requires a real GPU run. |
| Streaming | none | no visible seam; ≤ 2 chunk loads/frame | Acceptance is visual + measured load counts. |

These are **proposals**. The old 250k budget is not silently discarded; it is explicitly revised because the world is now 64× larger in area and genuinely volumetric. The new targets must be re-measured on target hardware.

---

## 6. Migration plan

| Stage | Change | Test / acceptance |
|---|---|---|
| **M1.1** | Add `sim` voxel substrate: chunk data, materials, generation stages, `getVoxel`/`setVoxel`, `surfaceAt`, stable entity IDs, deterministic manifest. | Unit tests: same seed → same chunk hash; chunk order independence; material layers; water occupancy; edit round-trip; entity harvest state; sim has no `three` import. |
| **M1.2** | Add 3D greedy mesher + near chunk streaming + macro LOD + water plane + ocean. | Build passes; default view has no square edge; close-up shows material transitions and 3D faces; calls/tris within target; chunk load/unload counts measured. |
| **M1.3** | Add Noxel natural assets and place them from entities; add hero waystone/marker/cairn; integrate kit scene. | Noxel trees/rocks/plants visible at human scale; harvest hides one and updates inventory; kit still renders. |
| **M1.4** | Add edit/harvest actions and HUD; dirty-chunk remesh. | Scripted dig + harvest changes sim state and visible mesh; reload/regenerate from seed reproduces the unedited base; edit log is serializable. |
| **M1.5** | Capture before/after/default/close-up/wide/map; run tests; record performance; update docs/decision log. | Evidence complete; explicit list of unverified items; mission not marked approved. |
| **M1.6** (separate) | MagicBlock dev-environment spike: program, delegation, chunk delta account, session keys, commit/recovery. | Must be validated against the installed SDK/program before any API claim. Not in this slice. |

Rollback: the new world is behind the same `main.ts` entry point. If the slice fails, restore the previous `sim/world.ts`, `render/terrain.ts`, `render/props.ts`, `main.ts` and keep the report. The old heightfield is not kept as a parallel runtime path.

---

## 7. Risks and unresolved decisions

| Risk / decision | Impact | Mitigation / next step |
|---|---|---|
| **World size vs. simulation cost** | 2048² × 128 is 536M cells if fully resident. | Lazy chunks + LRU; only near ring resident; macro LOD from sampler. Measure memory. |
| **Chunk edit persistence** | A full chunk delta can exceed a Solana account. | Compact `(localIndex, material)` deltas; split per sub-chunk if needed; benchmark before choosing account size. |
| **Determinism across versions** | Changing noise/params breaks saved worlds. | `generatorVersion` + params hash in manifest; edits are applied on top of regenerated base; never silently change a live world's version. |
| **Terrain vs. water authority** | Water stored in voxels but rendered as a sea-level surface. | Sim owns water cells; renderer derives surface; document that flow/currents are not simulated. |
| **LOD seams** | Near 1 m mesh and 12 m macro can show a seam. | Macro hole around near ring; fog/vegetation; measure; consider a transition ring later. |
| **Overhang/cave meshing cost** | 3D faces increase triangles. | Sparse overhang carving; greedy merge; measure; disable deep caves if over budget. |
| **Noxel art direction** | Owner reference images absent; natural Noxel set is provisional. | Keep `provisional: true`; do not approve art direction; owner review required. |
| **MagicBlock API drift** | Docs and SDK versions change; no local SDK/program. | Do not claim implementation; run a dev-environment spike; pin versions; validate instruction/account layout. |
| **Performance on real hardware** | SwiftShader numbers are not GPU frame times. | Measure on target integrated GPU; keep draw-call/triangle budgets; profile chunk generation p95. |
| **Documentation conflict** | `Project_Brief.md` says blockchain is an M1 non-goal; GDD §7 excludes it; TA §4 says heightfield. | Treat mission 001 as a superseding direction request; record proposed decisions; require owner ratification before marking approved. |
| **No git repository** | Changes are uncommitted filesystem edits. | Keep a copy of retired files/report; do not claim a commit. |

### 7.1 Explicitly unresolved

- Is 2048 m the right final world scale, or should the streamed world be unbounded with a 2048 m authored island?
- Should terrain edits be permanent on-chain state, session-local, or checkpointed per region?
- Which MagicBlock execution mode is authoritative for active play: ER-only session with periodic commits, or base-layer settlement per action?
- What is the maximum acceptable account size / rent budget per chunk delta?
- Are Noxel natural assets acceptable as a direction, or must they wait for owner reference images?
- What is the real GPU frame-time target and test hardware?

---

## 8. What this change implements, demonstrates, and leaves unverified

### Implemented in the vertical slice

- Chunked 3D voxel world with material + occupancy per cell; deterministic seed; lazy chunk generation; `getVoxel`/`setVoxel`/`surfaceAt`; edit log; stable entity IDs; inventory and harvest state.
- 3D greedy mesher, near chunk streaming, macro LOD, water/ocean surface, no apron/horizon, no square terrain edge.
- Connected island geography: irregular coast, mountains/ridges, river, lake, forest patches, beaches, exposed stone, overhang ledges.
- Noxel natural assets (trees/rocks/plants/ore/cairn) plus the existing provisional waystone/marker/kit, placed from authoritative entities.
- Deterministic scripted dig/harvest action and HUD state; renderer rebuilds dirty chunks.
- Sim tests, build, before/after captures, performance JSON.

### Demonstrated by evidence

- Before/after default, wide and map views; terrain close-up; Noxel close-up; edit/harvest view.
- Automated determinism/material/edit/entity tests.
- Measured calls/triangles, generation time, chunk counts, memory (where available).

### Not verified / not implemented

- MagicBlock SDK/program/account integration; all account architecture is a design proposal.
- Construction, governance, AI agent, event history, persistence/save/load, multiplayer, networking.
- Real-GPU frame time; only headless SwiftShader measurements.
- Owner approval of Noxel natural art direction, world scale, or the revised performance budget.
- Full cave systems/water flow; the slice has sparse overhang ledges and a static water table.

**Mission status: implementation candidate, not approved.**
