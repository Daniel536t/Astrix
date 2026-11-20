# Voxel Style Guide — v0.1 (skeleton + hard constraints)

**Owner:** GLM · **Status:** Skeleton. Populated by Task 003. Do not treat as approved.

---

## 1. Scope

Voxels describe the **natural** world: terrain surface, elevation, cliffs, exposed rock, mineral
deposits, ground cover, and the land side of shorelines. Water surface and vegetation placement are
terrain-adjacent and specified here; individual tree/rock *assets* may be custom meshes (see §6).

## 2. Constraints inherited from REF-001 (non-negotiable)

The owner's references show blocky terrain that is **not** quantised to a uniform cube grid:

1. **Varied step heights.** Terraces step by roughly 0.5–2 m, not always 1 m.
2. **Broad flat tops.** Plateau surfaces are large and flat; the interesting geometry is at the edges.
3. **Thin strata bands on every cut edge.** Grass cap (~0.3–0.5 m) → dark red-brown band
   (~0.1–0.2 m) → pale stone body. This is the terrain's identity. A single side colour is a
   rejection criterion.
4. **Irregular outlines.** Terrace boundaries follow natural, non-rectangular contours.
5. **Smooth vertical cliff faces** (large planes), broken by occasional blocky notches and ledges —
   not a staircase of cubes.
6. **Flat colour, no textures.** Banding is done with per-face material/vertex colour, and must be
   cheap: it is a shader/material feature, not a texture atlas requirement.

## 3. Provisional conventions (to be ratified by GLM)

| Item | Provisional value |
|---|---|
| Units | 1 unit = 1 m, Y-up, right-handed |
| Cell | 1 m × 1 m in XZ |
| Height quantum | 0.5 m |
| Coordinate origin | world centre; terrain spans ±64 m in M1 |
| Chunk | 32 × 32 cells |
| Build grid | 2 m (aligned to even cell coordinates) |
| Sea level | y = 0.0; water plane at 0.0 |
| Playable range | y ∈ [−6, +40] |

## 4. Terrain representation

Proposed: heightfield with per-cell material + a strata palette resolved at mesh-build time.
Heightfield cannot produce overhangs (see Q-003). GLM must confirm or reject with reasoning,
including the cost of adding overhang support later.

Data (conceptual):

```
TerrainCell { height: number (0.5 m quantised), material: Grass|Rock|Sand|Dirt|Ore, flags: bitfield }
```

## 5. Natural resource placement rules

- Resource nodes are data, not decoration: `{ type, position, remaining, depletedState }`.
- Deposits cluster geologically (ore in rock, stone at cliffs, wood in forest), never uniformly random.
- Every resource must be visible from the 40°/45 m camera as a distinct colour + silhouette.
- Every harvestable node needs a depleted representation.

## 6. Boundary notes

- Trees: geometry may be a **custom mesh** (Noxel-adjacent blocky canopy), not voxel cells. The
  *distribution rule* is terrain's; the *mesh* is not. This does not require an owner decision —
  it is the same reasoning as REF-001 §4.
- Rocks and outcrops: voxel cluster geometry is preferred where they meet terrain.
- Architecture is never voxel. GLM does not define building silhouettes.

## 7. To be written by GLM

1. Confirmed coordinate/scale table (or documented objections to §3).
2. Terrain data structure and meshing strategy, with vertex/face budget per chunk.
3. Strata shader approach and its performance cost.
4. Biome/terrain-type palette assignments (hex per material, per elevation band).
5. Water representation (surface, shoreline treatment, depth tint).
6. Generation parameters for the starting map: plains, hills, cliff mass, lake/river, forest masks.
7. LOD and culling plan for M1.
