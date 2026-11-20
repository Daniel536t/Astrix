# Voxel Style Guide — v1.0 (natural world terrain)

**Owner:** GLM (Lead Voxel Terrain / Natural Environment) · **Date:** 2026-10-22
**Status:** v1.0 — supersedes `00_Project_Core/Voxel_Style_Guide.md` §3–§7 skeleton.
**Binding constraints:** REF-001 §3, §6, §10; ADB §3, §5, §6, §7; Technical_Architecture §2, §4, §8.
**Scope:** natural world only. Architecture stays Noxel/Mimo. Nothing here requires Mimo's assets to change (§11).

---

## 0. Decision status summary

| # | Item | Status |
|---|---|---|
| R1 | 1 m × 1 m XZ cell | **RATIFIED** |
| R2 | 0.5 m height quantum | **RATIFIED** (with plateau-zone 1.0 m terrace step, §1) |
| R3 | ±64 m map (128×128 cells) for M1 | **RATIFIED** |
| R4 | 32×32-cell chunks | **RATIFIED** |
| R5 | y = 0 sea level, water plane at 0.0 | **RATIFIED** |
| R6 | 2 m build grid | **RATIFIED** (XZ only; adds construction-grade height rule, §1) |
| R7 | Heightfield instead of sparse voxels (D-007) | **ACCEPTED**, §10.1 |
| R8 | Map-edge foundation skirt at y = −12 | **PROPOSED** (new) |
| R9 | Shoreline pin: last land step at +0.5 m | **PROPOSED** (new) |
| R10 | Palette values and band thicknesses in §4 | **PROPOSED** (numbers final, owner sign-off optional) |
| R11 | M1 scene layout (§6 + `Biomes/start_map_v1.json`) | **PROPOSED** |

## 1. Ratification of the provisional conventions

| Provisional | Verdict | Consequences |
|---|---|---|
| 1 unit = 1 m, Y-up, right-handed | **RATIFIED** | Matches ADB §5; no conversions anywhere. |
| Cell 1 m × 1 m XZ | **RATIFIED** | 128×128 map = 16,384 cells. Placement, harvest and validation all resolve to integer cell indices; no sub-cell queries in `sim`. |
| Height quantum 0.5 m (D-008) | **RATIFIED** | Terrace step is *not* fixed at 0.5 m. The generator picks the terrace step per region: `s = 1.0` inside plateau zones (plateau mask > 0.75 or massif interior), `s = 0.5` elsewhere, with a ±0.21 m contour wobble. Resulting step heights between adjacent plateaus measured at 0.5–1.5 m, cliffs up to 13.0 m per span (§7) — REF-001 §3 "roughly 0.5–2 m" is met without Minecraft stairs. Consequence: all heights are multiples of 0.5; a corridor's 2 m build grid (XXZ) never fights a 0.5 m riser. |
| Terrain spans ±64 m in M1 | **RATIFIED** | 128 m diorama. Fog `#DCD6EC` @ 0.0035 leaves the far edge ~20% hazed at 64 m from centre — inside ADB §6, matched to REF-001 image 3. |
| Chunk 32×32 cells | **RATIFIED** | 16 chunks. One terrain draw call per chunk (§3): 16 draw calls. Max measured chunk = 7,210 tris — fits all three budgets in TA §8 with headroom. |
| Sea level y = 0.0, water plane at 0.0 | **RATIFIED** | Water cells are exactly `height < 0`. Simplifies depth tint (§5) and the freshwater rule. |
| Build grid 2 m | **RATIFIED** (amended) | The grid is XZ-only: even cell coordinates, aligned to chunk origin. Heights of the starting plain pinned to exactly 4.0 m (a "construction-grade" region so any Noxel base sits flush). Ledges at 0.5 m multiples elsewhere; buildings on ledges is a later milestone decision, not blocked. |
| Playable range y ∈ [−6, +40] | **RATIFIED**, amended to **[−5, +40]** | Measured map range at seed 1337 is exactly [−5, +40]. Height storage therefore covers −8 m floor for safety margin (§2). |

**New conventions proposed here (R8/R9):**

- **R8 Map-edge foundation skirt.** Terrain faces at the 4 map edges extend down to y = −12, giving the diorama a slab base like REF-001 image 3 and hiding the map floor. Cost: ~32 extra band quads (see §3.4 counts, already included). Alternative if rejected: fog + far plane alone; cheeks of empty space visible at pitch 62°.
- **R9 Shoreline pin.** Any land cell adjacent to water has its last terrace step pinned to +0.5 m exactly. This produces the hard 0.5 m vertical shore cut everywhere (REF-001 §6) with zero special geometry, and makes the shore rim band land in a fixed vertex row (§4.3).

## 2. Terrain data representation (D-007 accepted)

Heightfield of material/strata columns. Overhangs are out of scope for M1 (§10.1) — accepted because settlement building, slope validation and harvesting all reduce to per-column queries, and meshing stays trivial.

```ts
// Game/src/sim/terrain.ts — RATIFIED storage contract (extends TA §3)
export const CELLS_PER_SIDE = 128;      // R3
export const CHUNK_CELLS    = 32;       // R4
export const CELL_M         = 1.0;      // R1
export const QUANTUM_M      = 0.5;      // R2
export const HEIGHT_FLOOR_M = 8.0;      // storage floor: h = raw*0.5 − 8.0
export const SEA_LEVEL_M    = 0.0;      // R5
export const SKIRT_M        = -12.0;    // R8
export const BUILD_GRID_M   = 2.0;      // R6

export type MaterialId = 0 | 1 | 2 | 3;   // bitwise-aligned to TA §3 `TerrainCell.material`
export const MAT = { GRASS: 0, SAND: 1, STONE: 2, ORE: 3 } as const;

export const F_CLIFF_LIP = 1 << 0;  // interior neighbour drop ≥ 5 m (building/HUD uses this)
export const F_SHORE     = 1 << 1;  // land cell with a water neighbour (R9 pin + rim band)
export const F_ORE_VEIN  = 1 << 2;  // accent cell belonging to an ore cluster
export const F_RING_EDGE = 1 << 3;  // inside the 8-cell extension ring: no interactables

export interface WorldSpec { seed: number; size: number; }            // unchanged, TA §3
export interface TerrainCell { height: number; material: MaterialId; flags: number; }  // readable shape

export interface TerrainMap {          // the STORED form (what sim keeps in memory)
  readonly spec: WorldSpec;
  readonly heights:   Uint8Array;      // raw = (h + HEIGHT_FLOOR_M) / QUANTUM_M  → h ∈ {−8.0 … +119.5}
  readonly materials: Uint8Array;      // MaterialId
  readonly flags:     Uint8Array;
}
export interface TerrainChunk { cx: 0|1|2|3; cz: 0|1|2|3; firstCell: number; }  // index bookkeeping only

export const cellHeight = (raw: number): number => raw * QUANTUM_M - HEIGHT_FLOOR_M;
export function cellAt(map: TerrainMap, x: number, z: number): TerrainCell {
  const i = z * CELLS_PER_SIDE + x;
  return { height: cellHeight(map.heights[i]), material: map.materials[i] as MaterialId, flags: map.flags[i] };
}
```

**Stored:** seed, heights, materials, flags — that is all. `sim` never sees derived data.
**Derived at mesh time (render only, never stored):** side-face spans between neighbour heights, band-row subdivision, run-merged cliff quads, vertex colours, face normals, water surface quads, water depth tint. A save file (TA §9) can rebuild every derived byte from `seed` + deltas.

**Memory (128×128):**

| Item | Size |
|---|---|
| `heights` Uint8Array(16,384) | 16 KiB |
| `materials` Uint8Array(16,384) | 16 KiB |
| `flags` Uint8Array(16,384) | 16 KiB |
| ResourceNode records (92 nodes, §8) | ~8 KiB |
| **Sim terrain state total** | **56 KiB** |
| Derived chunk meshes (16 chunks, indexed, §3.4) | ~4.5 MB GPU-shared buffers |
| Water surface mesh | ~0.1 MB |

Comfortably inside the 120 MB heap budget (TA §8). Encoding `heights` as Uint8 with an 8 m floor keeps the −12 m skirt and −4.5 m lake beds addressable while the playable floor sits at −5 m; if a future map ever needs below −8 m, the storage floor moves and the save schema version bumps — documented consequence, not a silent change.

## 3. Meshing strategy — one buffer per chunk, one material, vertex colours

### 3.1 Structures

Every chunk compiles to a **single indexed `BufferGeometry`** and renders with exactly one shared `MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 })` (no textures; ADB §3 rule 3). Attribute layout per vertex: `position` Float32×3, `normal` Float32×3 (constant per face orientation, `flat` crisp lighting), `color` Float32×3. Indices Uint16 — max measured chunk is 14,420 verts (< 65,535; assert in mesher).

Normals are baked per face (top = +Y; sides = ±X/±Z); `flatShading` stays false, which is free and exact.

### 3.2 Pseudocode (normative)

Rows for a face use a common vertical subdivision: band boundaries at 0.4 m (grass cap) and 0.6 m (red-brown), then stone-body rows at most 1.5 m apart (this is what carries the strata palette onto tall faces — §4).

```
splitRows(drop):                # drop = h(cell) − h(neighbour), strictly > 0
    rows ← []
    if drop > 0.4: rows += 0.4            # grass cap bottom
    if drop > 0.6: rows += 0.6            # red-brown band bottom
    y ← 0.6 + 1.5
    while y < drop − 0.05: rows += min(y, drop − 0.05); y += 1.5
    return rows                            # rows split the span [0, drop] into ≤ 1.5 m + band rows

buildChunk(cx, cz):
    for cell (x, z) in chunk:
        h ← height(x, z)
        if h < −0.5 and no 8-neighbour is land: continue     # deep bed: hidden under opaque water
        emit top quad at y = h, colour topFaceColour(material, h)         # §4.2
        chunkTris += 2
        for dir in {+X, +Z}:                                 # interior faces owned once by the higher cell
            nh ← height(neighbour)
            if h ≤ nh: continue
            emit side band quads over splitRows(h − nh)      # §4.3 colours; each band quad = 1 colour
            chunkTris += 2 per row
        # horizontal run merge for smooth cliffs:
        merge consecutive cells (x, z), (x+1, z) / (x, z+1) whose band quads share
        identical (h, nh, rowSpan) into ONE wide quad, cap run length 32 cells
    for map-edge cells at x = 0 / z = 0:                     # R8: outward skirt down to SKIRT_M
        nh ← SKIRT_M; treat like an interior side face
    normals: +Y for tops, ±X/±Z per side direction; colours constant per band quad
```

### 3.3 How smooth cliffs happen (the anti-staircase requirement)

Two mechanisms, both engine-cheap and REF-001 §3-compliant:

1. **Run merging in the mesher.** A cliff lip whose cells share the same quantised top height (and the cells below share the same base height) produces **one wide face quad** per band row instead of N individual 1 m quads. Normal is identical so lighting stays flat — visually a single large plane.
2. **Lip quantisation in the generator.** The massif's surface contribution is rounded to whole metres before adding to base, and plateau-zone terrace steps are 1.0 m. Lips therefore *coincide* over long stretches. The contour wobble (±0.21 m) and the notch pass (−1.5 m cells at noise > 0.88) break runs deliberately — REF-001 §3 wants smooth planes "broken by blocky notches", not infinite planes.

Measured at seed 1337 (the algorithm is §7, prototype `/tmp/opencode/terrain_proto.mjs`, algorithm identical to this doc): longest merged cliff run **29 cells (29 m)**, **58 separate cliff plane regions**, max interior drop **13.0 m** within one cell span, 135 steep face columns. A 29 m × ~13 m plane of merged band rows is exactly the REF image-3 read; a 1 m quantum/hard-1.0-m-stair terrain would have produced 135×13 independent cube steps and been rejected.

### 3.4 Vertex / triangle counts (128×128, seed 1337, from the full audit in §7)

| Quantity | Measured |
|---|---|
| Top quads emitted (deep bed skipped) | 15,824 |
| Top triangles | 31,648 |
| Side band-row quads (after band split, incl. skirt rows) | 15,180 |
| Side triangles | 30,360 |
| **Terrain triangles total** | **62,008** |
| Quads total | 31,004 |
| Indexed vertices (4 per quad) | **124,016** |
| Indices (6 per quad) | 186,024 (Uint16 per chunk) |
| Per-chunk triangles | 2,402 … 7,210 (chunk row 0 col 3 =NE massif/rocky corner) |
| Water surface quads (all 843 water cells) | 843 → 1,686 tris |
| Trees/rocks/ore/food props (§8) | ≈ 6,500 tris |

Grand total ≈ **70.2 k tris** — 28% of the 250 k budget. No per-cell overdraw abuse, no texture fetch, one material for all terrain.

## 4. Strata and material system (vertex colours, zero shader branching)

### 4.1 Principle

All band colour is **baked into vertex attributes at mesh time**. The fragment shader consumes them blind: zero per-pixel branching, zero texture fetches, no `MeshPhysicalMaterial`. Palette lives in one module (`Game/src/render/palette.ts`, mirrored to `tools/palette.mjs` per D-009) — single source of truth, no drift.

### 4.2 Top-face colours (sRGB hex, day / M1)

Ramp is a **step lookup by elevation**, no gradients (ADB flat colour):

| Material | Condition | Hex |
|---|---|---|
| GRASS L0 | y < 8 m | `#8E9C57` |
| GRASS L1 | 8 ≤ y < 16 | `#97A15C` |
| GRASS L2 | 16 ≤ y < 24 | `#A0A85E` |
| GRASS L3 | y ≥ 24 | `#A6AC64` |
| SAND | shore cells (F_SHORE), y ≤ 0.6 | `#DCCB9E` |
| STONE L0 (top) | y < 20 m, no grass cover | `#D8C9B2` |
| STONE L1 (top) | y ≥ 20 m, no grass cover | `#E6DBC7` |
| ORE accent top | F_ORE_VEIN cells | `#4E8F86` (verdigris teal — one saturated accent, not magenta, per ADB §7) |

Grass-top reading stays uniform because lighting, not the ramp, does the work — shadows violet via hemisphere fill (`#CFC6F0`/`#6B7350` @ 0.55 i, ADB §6).

### 4.3 Side-face strata bands (the identity feature)

Band thicknesses are fixed constants — thin strata on **every** cut edge (REF-001 §3):

| Band (below top surface) | Colour | Hex |
|---|---|---|
| 0.0–0.4 m — grass cap | darker olive than top grass | `#7D8A4E` |
| 0.4–0.6 m — red-brown band | | `#B25A3F` |
| ≥ 0.6 m — stone body, alternating every 4.5 m of world Y (3 body rows) | pale stone, subtle tonal banding | `#E4D6BF` / `#DCCEB6` |
| Shore rim band (F_SHORE faces, rows intersecting y ∈ (−0.25, +0.55)) | thin light band where stone meets water (REF-001 §6) | `#BFC8DC` |

Computation inside the mesher is a pure function — no lookup tables, no branching in shaders:

```ts
// render/mesher.ts (summary; normative rules)
const BAND_GRASS = 0.4, BAND_RUST = 0.6, BODY_ROW_M = 1.5, BODY_TINT_ROWS = 3; // 4.5 m period

function bodyTint(worldY: number): number {                    // alternating pale stone layers
  return Math.floor(worldY / (BODY_ROW_M * BODY_TINT_ROWS)) & 1;
}
// band quad spans [yBottom, yTop); dropA/dropB: distance below the cell top at each edge (dropA < dropB)
function bandQuadColour(top: number, yBottom: number, yTop: number, flags: number): RGB {
  const dropA = top - yTop, dropB = top - yBottom;
  if ((flags & F_SHORE) && yTop > -0.25 && yBottom < 0.55) return SHORE_RIM;   // REF-001 §6 rim first
  if (dropA >= BAND_RUST)    return STONE_BODY[bodyTint(yBottom)];            // wholly in stone body
  if (dropB >  BAND_GRASS)   return BAND_RED_BROWN;                           // span inside [0.4, 0.6)
  return BAND_GRASS_CAP;                                                      // span inside [0, 0.4)
}
```

Rows are emitted *on* band boundaries (§3.2), so each band quad lies wholly inside one colour class — crisp band edges, no interpolation smear, and the body tint follows absolute world Y so strata line up across separate cliff faces (they read as geological layers, REF-001 §3 "vertical tonal banding is subtle").

### 4.4 ACES / fog interaction

- Palette hexes are authored in **sRGB**, converted once to linear at module init; renderer: `ACESFilmicToneMapping`, exposure 1.05 (TA §7), output sRGB.
- The sun (2.6 i) can push pale stone tops over 1.0 linear → ACES compresses to a slightly desaturated near-white: this is the REF sunlit-stone look and is *wanted*.
- `FogExp2` `#DCD6EC` density 0.0035 is applied post-material; vertex colours are untouched. Risk note (§10.4): the *effective* far-edge stone tone is fog-tinted lavender — acceptance is measured, not eyeballed.
- **Colour acceptance test** (render harness, D-009): render the three bench quads (grass cap `#7D8A4E`, red-brown `#B25A3F`, stone body `#E4D6BF`) and sample the centre pixel of each: `|sample − target| ≤ 10/255 per channel`. SwiftShader colour is approximate (§10.5); bench renders are re-checked on a real GPU before sign-off.

## 5. Water

- **Representation:** water exists exactly where `height < 0`. Surface = one static full-map `BufferGeometry` of one quad per water cell (843 quads → 1,686 tris) at y = 0.0, one draw call. Material `MeshStandardMaterial({vertexColors: true, roughness: 0.12, metalness: 0.0})` — flat, hard, **opaque**. No transmission, no refraction, no foam geometry (TA §5, REF-001 §6).
- **Depth tint:** vertex colour per water quad; depth `d = −height(cell)` clamped to [0, 4.5]: lerp `#3D5484` (shallow, d ≤ 0.5) → `#1E2A4A` (deep, d ≥ 4.0). Per-vertex smoothing across neighbouring water cells gives soft bands without any shader work. Interior lake beds (560 cells) are not meshed at all — opaque water plus the shore cut face closes the shape; cost already reflected in §3.4.
- **Waterline rim**, REF-001 §6 "lighter rim at the shoreline": two cheap rules, no extra geometry:
  1. land-side: cut faces of shore cells use the rim band `#BFC8DC` (§4.3).
  2. water-side: water quads whose cell is within 1.0 m of a land cell blend the vertex colour 50% toward `#6D7FA8`.
- **Why opaque:** transparency forces sorted blending and interacts badly with fog + ACES; depth tint plus the pale rim reads exactly like REF image 1–2's "dark navy plane with light edge" without `MeshPhysicalMaterial`.

## 6. Milestone 1 scene layout — starting map 128×128

Machine-readable source of truth: **`06_Voxel_Studio/Biomes/start_map_v1.json`** (all coordinates below are copied from it; JSON is authoritative if they ever disagree).

Cell-space convention: x = east, z = south, origin NW corner; rect `[x0,z0,x1,z1)` half-open; "cell [i]" in prose = the JSON coordinate pair.

- **(a) Buildable plain**, rect `[16,80]–[53,101]` (38×22 cells = **836 m²**, requirement ≥ 28×22 m): exactly flat at **4.0 m**, 7 m feather rim, no trees/rocks/ore inside, slope **0°** measured (< 4°). Construction-grade height so 2 m bases sit flush.
- **(b) Forest** rect `[64,24]–[103,51]` (1,120 m²): terraced meadow 4.5–9.5 m, 68 tree nodes from a 3 m jittered lattice (rule in JSON; coordinates generated, never hand-placed).
- **(c) Rocky region** rect `[96,56]–[119,83]`: bare stone tops above 13 m, faceted terraces 1,418 stone-top cells total, no grass cap, no strata bands on horizontal stone (grass cap rule applies only to soil), strata bands still on cut edges.
- **(d) Ore-bearing rock**, sub-rect `[102,64]–[113,75]`: **4 vein clusters** at cells (105,74), (107,65), (112,68), (111,74), radius 2.2 m each, accent `#4E8F86` on top faces + deposit props (§8).
- **(e) Lake** — irregular ellipse centre **(76,91)**, radii 16×13, bed **−4.5 m**, 843 water cells incl. river; shore = hard 0.5 m cut + rim bands (R9). Shore nodes: 3 freshwater wells (94,92), (77,106), (90,100).
- **(f) Cliff massif** rect `[86,0]–[127,19]` — the horizon silhouette: peak **+34 m** (measured max +40.0 incl. base), 58 smooth face regions, longest face run **29 m**, notch-jagged lip; visible from the whole plain (NNE of the camera's default 45° yaw target at plain centre).
- **(g) Natural routes** (graded passes, max grade 13% ≈ 7.4°, 4.5 m corridor):
  - **R1** plain → forest: `(36,88) → (52,78) → (64,66) → (76,52) → (84,40)`, 68.7 m.
  - **R2** plain → rocky southern bypass skirting the lake: `(46,94) → (62,104) → (86,116) → (108,100) → (110,82)`, 91.0 m.
  Both connect the plain edge to resource regions without crossing water (no ford needed in M1).
- **(h) Terrain past the playable edge:** playable rect is `[8,8]–[119,119]` (12,544 m²); the **8-cell outer ring** keeps full generation (height/noise/mesh) but no interactables — building, harvesting and placement all refuse on `F_RING_EDGE`. The massif deliberately reaches the map edge, and all 4 edges get the −12 m foundation skirt (R8) so the diorama ends in a slab, never a hollow.
- **Lowland bowl** at (34,34), r 22, −5.0 m relief: gives the mid-south real depth variation instead of one uniform shelf, and creates the small stream valley the river occupies.
- **River** polyline `(94,26) → (84,44) → (72,60) → (70,76) → (72,88)`, width 4 m, bed −1.7 m; emerges as a spring-line at the massif south cliff base, joins the lake north shore. Vision: water is *in sight* from the plain's east rim and the forest's south edge, per ADB §8.

Camera-facing target (for the Task-004 composition render): default rig pitch 40°/yaw 45°/dist 45 m aimed at plain-centre cell (34,90) frames the plain foreground, forest mid-ground, lake right, massif horizon left — verifying ADB §8 "one focal region + one strong vertical mass".

## 7. Generation pipeline (deterministic, seed-only reproduction)

All randomness is **pure integer hashing** (`Math.imul` finaliser, constants in the JSON) + bilinear-smoothstep value noise. No `Math.sin/pow/-random` on floats → bit-identical across browsers/machines. D-006's mulberry32 is reserved for lattice jitter; both consume the same `seed`.

Pipeline, in fixed order (all parameters also in `start_map_v1.json`):

```
1. base      h = 6.4 + 2.7·(fbm(x/90, 3oct)−0.5) + 2.0·(fbm(x/30, 3oct)−0.5) − bowl((34,34), r22, −5)
             clamped ≥ 0.6
2. massif    + massif(x): hardness = min(softFeather(9 m), 0.4 + 0.6·hard(0.9..2.3 m band))
             height  = round(hardness · irr · (13 + 21·ridge(1/22)))           # 1 m lip quantisation
3. water     river: t = sstep(4.0→1.0 m from polyline); h = lerp(h, −1.7, t)
             lake:  e = 0.78 + 0.44·fbm(x/11); ellipse (76,91,rx16,rz13);
                    t = sstep(1.25→0.75 of normalised dist); h = lerp(h, −4.5, t)
4. terraces  s = 1.0 if plateauMask(fbm(x/46)) > 0.75 or massif(x) > 0.4 else 0.5
             wobble = ±0.21 (1/3.4 m noise)
             h = round((h + wobble)/s − 0.18) · s
5. notches   if massif > 4 and vnoise(x/9) > 0.88: h −= 1.5
6. routes    relax profile to ≤ 0.13 m/m (fwd+bwd passes), write back with 4.5 m feather (85% blend),
             re-quantise to 0.5 m
7. plain     rect [16,80,54,102]: h = lerp(h, 4.0, plainMask(7 m feather)), final 0.5 re-quant
8. materials stone tops (mask §6c), sand (h ≤ 0.6 + water neighbour), grass otherwise
9. flags     F_CLIFF_LIP (drop ≥ 5), F_SHORE (R9 pin: last land step snapped to +0.5), F_ORE_VEIN,
             F_RING_EDGE
10. resources ore clusters → stone nodes → trees → freshwater/food (§8), in that order
```

Determinism guarantees: single-threaded, fixed pass order, fixed iteration (row-major); any constant change bumps the save schema. Re-loads reproduce the map bit-exactly from `seed` alone (TA §9).

## 8. Resource placement (geological rules, not uniform random)

| Resource | Rule (geology-inspired) | M1 count | Parameters |
|---|---|---|---|
| **Ore** | Contact-zone rule: clusters sit inside the rocky sub-rect only, on stone-top cells, within 14 m of a >5 m drop (mineral veins at fault contacts), max separation 5.5 m between centres | **4 clusters** (target ≤ 5) at (105,74), (107,65), (112,68), (111,74) | radius 2.2 m accent per cluster → 1 ore node per cluster, 24 units |
| **Stone** | Scree rule: ring band z ∈ [21,30] under the massif's south cliff base | **12 nodes** | min separation 3.0 m |
| **Wood** | Forest canopy density: 3 m jittered lattice, fbm(1/6 m) > 0.40, land only | **68 trees** | jitter ±1.1 m/axis → clustered, never carpeted (REF-001 §4) |
| **Freshwater** | Lake shoreline rake: 3 fixed radial offsets, land cells only | **3 nodes**: (94,92), (77,106), (90,100) | vertices: each 12 units |
| **Food** | Forest–plain seam: south edge band z ∈ [52,57] of forest rect | **5 bushes**: (66,53), (89,55), (103,53), (95,53), (77,57) | 8 units each |

Total **92 ResourceNode** records, all with depleted representations (stump/scree rubble/empty vein/quarry hole/dry bush — visual reserved for Mimo coordination, *placement* is terrain's per VSG §0.6). Every node type must satisfy ADB §7 readability: rock = pale faceted stone, ore = same + teal accent, wood = clustered trunk-canopy silhouettes.

## 9. Performance (M1 budget confirmation)

**250k triangles / 120 draw calls: CONFIRMED, with measured headroom.**

| Metric | Budget | Measured/expected M1 |
|---|---|---|
| Terrain triangles | — | 62,008 (16 chunks) |
| Water triangles | — | 1,686 (1 draw) |
| Props (3 tree archetypes instanced + rocks/ore/food instanced) | — | ≈ 6,500 |
| **Total triangles** | ≤ 250,000 | **≈ 70,200** (28%) |
| Draw calls: 16 terrain + 1 water + 5 instanced prop batches + HUD/UI planes | ≤ 120 | **~25** (×2 incl. shadow pass ≈ 50) |

- **Culling:** three.js frustum culling on each chunk mesh (already per-object); chunk count is fixed at 16, no streaming in M1 — far plane 600 m covers the whole 128 m map. Chunk meshes are still built lazily-to-far-plane per TA §4, but everything builds on first frame in practice.
- **LOD:** none in M1 — deferred to M2 with a documented plan (chunk-decimation to 2 m top quads for far chunks). Justification: 70k tris leaves 3.5× headroom; LOD now would be gold-plating.
- **Mesh build budget:** ≤ 16 × 8 ms = 128 ms at boot (target < 250 ms assertion), inside the 3 s load budget.
- Frame time target (16 ms) requires measured profiling once Task 007 wires the harness; geometry count implies no risk.

## 10. Open questions & risks

1. **Overhangs (Q-003)** — heightfield cannot express them, full stop. **Recommendation: keep M1 heightfield-only** (D-007 accepted) — nothing in the game loop needs a cave or arch. Escape hatch if the owner insists later: optional per-cell `overhang` metadata plus a 2.5-D "cliff shell" mesh pass, ≈ +25% mesh memory, +2 draw calls, one new mesher rule — cheap enough to add post-M1 without re-architecting. Never silently blocked: this paragraph is the documented answer.
2. **Vertex inflation from band rows.** Band subdivision raises side-vertex count (15,180 band quads for 62k tris). Mitigation is already in place: deep-bed skip (−560 cells), horizontal run merging (29-cell runs measured), 1.5 m max body rows (not 0.1 m). If a future map triples cliff area, drop BODY_ROW_M fine rows to 2.25 m — a documented one-constant trade.
3. **Uint16 index ceiling.** Per-chunk verts peak 14,420 < 65,535 → OK, but the mesher asserts; a larger map (256×256) must switch to Uint32 — flagged, not hidden.
4. **ACESTonemapping + fog tone drift.** Strata red-brown can shift dull after ACES at high exposure; acceptance is numeric (§4.4 bench test ±10/255), not aesthetic judgement. Palette module shared with the harness so concept renders and game cannot drift (D-009).
5. **SwiftShader headless specifics.** Known deltas: no MSAA, rasterisation/texture rounding differs; vertex colours and ACES output are shader-identical maths but may quantise differently. Treat all harness colour captures as ±1 byte per channel until a GPU capture confirms (mirrors TA §11 risk).
6. **Water/geometry interaction.** Shore rim band tops out at +0.55 m, water at 0.00 m, beds ≥ −4.5 → no coplanar z-fighting candidates. The one to watch: lake rim band at exactly y ∈ (−0.25, 0.55) intersects the waterline — intended; assert no water quad shares a plane with terrain faces in a unit test.
7. **Deterministic float equality.** All quantisation uses `round(x*2)/2` on values < 3,000; bitwise-stable. Risk: future refactors adding trig noise. Guard: lint rule rejecting `Math.sin/cos/tan/atan` in `sim/` (already implied by D-005).
8. **Tree archetype uniformity.** 68 trees over 3 archetypes risks a "same tree" read at 45 m; mitigate with per-instance scale jitter ×[0.85, 1.2] and Y-rotation limited to 90° steps (ADB §3 allows Y-only rotation for props).

## 11. Not touched (boundary)

Trees/rocks *meshes*, building silhouettes, wall/pillar/stairs geometry, depleted prop visuals: Mimo's Noxel domain. This guide supplies palette values, placement coordinates, height/legibility requirements and depleted-representation obligations only. No `Game/` source here, no `00_Project_Core/` edits, no architecture decisions beyond terrain internals.

### Change log
- v1.0 — ratified §0 table, full spec, `start_map_v1.json`, resource rules, budgets confirmed from measured generator run.
