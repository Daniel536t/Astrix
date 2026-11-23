# ASTrix — World Engine Architecture (living world, phase 1)

**Date:** 2026-11-23 · **Status:** implemented and tested; committed to `deploy/boxd` (PR #1). **Not deployed, not art-reviewed, not tested on real devices.**
Companion to `World_Engine_Audit_2026-11-23.md` (findings) and `Controls.md`.

## 1. Layers

| Layer | New / changed modules | Rule |
|---|---|---|
| `sim/` (pure TS, no three.js) | `noise.ts`, `materials.ts`, `hydrology.ts`, `terrain-v2.ts`, `character.ts`, `fauna.ts`; `world.ts`, `snapshot.ts` | Deterministic. Owns terrain, water network, movement rules, creature rules. |
| `app/` | `explore.ts`, `perf.ts`; `session.ts`, `persistence.ts` | Input sampling, fixed-step accumulation, journal/save handling. |
| `render/` | `water.ts`, `characters.ts`, `fauna.ts`; `terrain.ts`, `camera.ts`, `nature.ts` | Presentation only; reads sim state, never invents it. |

## 2. Chunk lifetime and streaming (audit V5, V6, V7)

- Near chunks stream **nearest-first** within a **6 ms per-frame budget** (`VoxelTerrainView.frameBudgetMs`); dirty re-meshing shares the budget.
- A sweep every 30 frames evicts any resident chunk outside `nearRadius + 2` that is not loaded or **pinned**. The settlement envelope and stockpile are pinned because construction previews query them several times a second.
- Edits and entities survive eviction (chunk bytes are regenerated from seed + generator + durable edits).
- `residentSurfaceAt` / `residentVoxelAt` never generate chunks. Characters, creatures and the camera use only these.
- The macro-LOD edit fingerprint is memoized on an edit-version counter (was O(edits) every frame).
- Nature variant geometry is cached (was rebuilt per entity on every nature rebuild).
- Measured (headless SwiftShader, 24 s travel ≈ 450 m): resident chunks **81 → 135** before, **81 → ~100 and bounded** after; 49 chunks swept.
- **Not done:** Web Worker generation/meshing. Main-thread chunk meshing is still the largest frame spike.

## 3. Terrain generator versioning

| | v1 (`GENERATOR_VERSION = 1`) | v2 (`GENERATOR_V2 = 2`) |
|---|---|---|
| Who uses it | Every save made before 2026-11-23; `createWorld()` / `GameSession.genesis()` defaults | **New browser worlds by default**; `?generator=1` makes a classic world |
| Landscape | Original low island (0–30 m) | Same founder corridor + northern snow massif, flanking ranges, terraced cliffs (peaks ~100 m) |
| Water | Sea level only | Sea level + a mountain river from a highland tarn (level ~45 m) down three cascades to the lake |

**Compatibility strategy**
1. v1 output is byte-identical to before (heights, materials, chunk bytes, entities, genesis hash `e659504b056654dc`; pinned in a test).
2. Each world records its generator in `world.params` → snapshot manifest (already existed). The journal gains an **optional** `generatorVersion: 2`; v1 journals omit it, so their canonical bytes and hashes are unchanged.
3. A save always restores on **its own** generator, whatever the new-world default is. Journal/snapshot generator mismatch is rejected.
4. Inside the founder corridor v2 heights equal v1, so the pinned house, path and farm stay buildable on v2 worlds (tested).
5. Same storage key for both versions: an existing player keeps their v1 world; a new player gets v2. **Gap:** there is no in-game "start a new v2 world" button yet; today that means clearing the save or using another seed.

## 4. Hydrology (simulation data, not animation)

`sim/hydrology.ts` builds a deterministic network per (seed, generator):

- **Lake**: located from the real terrain, not the formula.
- **Lower river**: traced from the real carved channel (the v1 channel is on warped coordinates, up to ~135 m from `riverCenterX`), flowing south to the sea.
- **Upper river (v2)**: an authored, seeded centreline whose water-surface level **never rises downstream** (tested), with three cascades.

Terrain v2 carves the valley, banks and channel from that level, and chunk generation fills water voxels to it. Water containment against open air is tested. `flowAt(x, z, level)` returns body type, downstream direction and speed. The water shader animates along that field; ripples, foam and transparency are presentation only.

## 5. Water rendering

- Near chunks get their own water mesh, built from the actual water voxels, with per-vertex flow, depth and foam. It is transparent in the shallows and shows the real bed.
- Cascades emit vertical falling sheets.
- The far opaque sea plane has a hole cut under the near ring.
- **Limits:** no underwater fog or camera-below-surface effect; the macro LOD draws the mountain riverbed without water beyond the near ring; draw calls rise by one per chunk that holds water.

## 6. Character

- `sim/character.ts` is a deterministic 30 Hz step for a 0.3 × 1.7 m box.
  - Speeds: walk 4.2 m/s, run 7.5, wade 2.4, swim 2.0.
  - Movement: 1-voxel step-up, jump, collision with voxels, structure modules and tree trunks.
  - Water: wading in shallow water; swimming in water deeper than 1.25 m.
  - Unloaded terrain is a wall.
- `app/explore.ts` interpolates between steps, follows with the camera, and finds the resource within 3.2 m.
- Gathering still goes through the journaled `harvest` command. The avatar position is saved under a separate presentation key and is not in the journal hash.
- The figure is a 1.7 m articulated rigid-part body: hips, torso, head, arms and legs, with walk, run, air and swim poses.
- **Camera:** in explore mode the arm (3–60 m, pitch −11° to 74°) is ray-marched against resident voxels so the camera stays out of hillsides. The builder view keeps the old overview limits.

## 7. Creatures

`sim/fauna.ts` defines the species (red deer, hare, brown trout), habitats, deterministic per-chunk spawning with stable ids, and behaviour:

- **Land animals:** graze, wander, rest, flee, and sleep at night.
- **Fish:** swim, school, hold position against the current, and scatter.

Today's creatures are the **ambient** tier: not saved, re-spawned identically when a chunk loads. The record already has `tier`, stable `id`, `homeX/Z` and species yields, so promotion to the **authoritative** tier (hunting, fishing, taming, breeding) keeps the same identity. That promotion requires snapshot storage plus journaled commands, which do not exist yet.

`render/fauna.ts` draws instanced bodies and limbs: 6 draw calls for all wildlife in the near ring.

## 8. Instrumentation

`window.__metrics` now reports:
- `generatorVersion`;
- `residentChunks`, `pendingChunkBuilds`, `sweptChunks`;
- `frameWork` and `frameInterval` (p50/p95/p99/max, frames >33 ms and >100 ms, heap);
- `explore` (position, mode, camera distance, reachable resource);
- `fauna` counts.

## 9. Tests added

| File | Covers |
|---|---|
| `tests/m004.foundation.test.ts` | Resident queries, edit version, bounded residency while travelling, pinning, nature cache |
| `tests/m004.generator.test.ts` | v1 genesis pin, v2 determinism and corridor equality, snow/peaks, monotone river levels, cascades, downstream flow, water containment, founder builds on v2, save compatibility both ways, journal/snapshot mismatch, chunk generation time |
| `tests/m004.character.test.ts` | Landing, walk/run speeds, step-up, wall, jump, no chunk generation, determinism, swimming |
| `tests/m004.fauna.test.ts` | Deterministic spawn, valid habitat, no chunk generation, fleeing, sleeping |

## 10. Open decisions and art review

- **Visual language — resolved (owner, 2026-11-23):** characters, animals, vegetation, architecture and props are *block-built* with varied proportions, articulated parts and species-specific silhouettes. This supersedes the Styl/faceted instruction in the mandate. Existing faceted trees are to be migrated.
- **New palette keys** were added to both palette files and are marked "review required": `snow`, `char_*`, `fauna_*`.
- **The Noxel rule revision** (pitched roofs, timber) has not been written into the style guide yet. Timber-and-stone architecture has not been built.
