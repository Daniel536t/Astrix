# Voxel Style Guide — v1.1 (natural world terrain)

**Owner:** GLM (Lead Voxel Terrain / Natural Environment) · **Date:** 2026-10-22
**Status:** v1.1 — supersedes `Voxel_Style_Guide_v1.0.md`. Driven by REV-002: new world reference
REF-002 (hybrid world), authoritative palette `04_Art_Director/Approved_Art_Direction/palette_v2.json`,
and the D-011 day/night requirement.
**Binding constraints:** REF-001 §3, §6, §10; **REF-002 §1–§5**; ADB §3, §5, §6, §7; palette_v2;
Technical_Architecture §2, §4, §8.
**Scope:** natural world only. Architecture stays Noxel/Mimo. Nothing here requires Mimo's assets to change (§11).

---

## Change log (v1.0 → v1.1)

| # | Change | Driver |
|---|---|---|
| 1 | All palette hexes replaced with palette_v2.json values (REF-002-sampled). The REF-001 eyeballed hexes (the v1.0 olive grass family, the navy water family, the verdigris ore) are retired. | REV-002 item 1, REF-002 §3 |
| 2 | Side strata: **three bands**, not two — grass cap 0–0.40 m → ochre 0.40–0.62 m → rust 0.62–0.80 m → stone body. Mesher `splitRows` and `bandQuadColour` updated. Row/triangle impact re-measured. | REV-002 item 2, REF-002 §3 |
| 3 | Water colours: bright turquoise ramp (shallow `#67CFD8` → mid `#3AAFC4` → deep `#2A8FA8`, rim `#BFEAF0`). Navy values retired. Opaque approach retained (§5). | REV-002 item 3, REF-002 §2/§3 |
| 4 | Ore accent: verdigris teal → **violet crystal** `#7B5AD6` (highlight `#9B7BE8`). **Provisional — owner decision D-015** (proposed, pending owner glance; REF-002 §5.5). | REV-002 item 4 |
| 5 | **NEW §4.5 Day/night (D-011).** Four lighting presets adopted wholesale from palette_v2; concrete answers on night strata, material count, fog/rim interaction, and shadow-map refresh policy. | REV-002 item 5 |
| 6 | CONSISTENCY FIXES (REV-002 item 6): plain rect now written identically in prose and JSON (`[16,80,54,102)` half-open; prose also states occupied cells `[16..53]×[80..101]`, 38×22 = 836 m²). Massif figures disambiguated: **peak contribution +34 m** (ridge term above base) vs **measured absolute summit +40.0 m** = `map.observedHeightRange[1]`; JSON now carries `peakContributionM` and `measuredSummitM`. | REV-002 item 6 |
| 7 | Top grass ramp: 3 elevation steps (not 4) matching the three palette_v2 grass hexes. Stone top: single `#E6DFCC`. | consequence of 1 |
| 8 | `dirtRoute` colour removed from the map JSON: routes are read by geometry (graded corridor + cut-face strata), and palette_v2 has no route paint — every colour must exist in palette_v2. | acceptance rule |
| 9 | Budgets re-measured with the three-band splitter: terrain 62,008 → **66,828 tris** (+7.8%), indexed verts 124,016 → 133,656; still ≈ 29% of 250k with props (§3.4, §9). | consequence of 2 |
| 10 | **Palette_v2.json was re-tuned concurrently with this revision** (noon sun intensity 3.0 → 2.75; night preset re-tuned: sun 0.45 → 1.15, hemi → `#3E4E80`/`#202A45` @ 0.9, fog `#151C3C` @ 0.0045, exposure 1.25 → 1.45). Every lighting figure in this document is derived from the palette file **as read at commit time**; no doc value quotes the superseded brief numbers. The night-strata conclusions are exposure-independent (monotonic tone curve), so the REV-002 question asked at 1.25 is answered a fortiori at 1.45. | observed file change |

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
| R10 | Palette values and band thicknesses in §4 | **PROPOSED → revised:** REF-002 + palette_v2 values are binding (owner-supplied); D-015 ore violet is **provisional** |
| R11 | M1 scene layout (§6 + `Biomes/start_map_v1.json`) | **PROPOSED** |
| R12 | Day/night cycle with four presets (D-011) | **ACCEPTED** into scope; lighting per §4.5, palette_v2 `lighting` |
| R13 | Three strata bands (cap → ochre → rust) | **PROPOSED** (was two bands in v1.0) |

## 1. Ratification of the provisional conventions

| Provisional | Verdict | Consequences |
|---|---|---|
| 1 unit = 1 m, Y-up, right-handed | **RATIFIED** | Matches ADB §5; no conversions anywhere. |
| Cell 1 m × 1 m XZ | **RATIFIED** | 128×128 map = 16,384 cells. Placement, harvest and validation all resolve to integer cell indices; no sub-cell queries in `sim`. |
| Height quantum 0.5 m (D-008) | **RATIFIED** | Terrace step is *not* fixed at 0.5 m. The generator picks the terrace step per region: `s = 1.0` inside plateau zones (plateau mask > 0.75 or massif interior), `s = 0.5` elsewhere, with a ±0.21 m contour wobble. Resulting step heights between adjacent plateaus measured at 0.5–1.5 m, cliffs up to 13.0 m per span (§7) — REF-001 §3 "roughly 0.5–2 m" is met without Minecraft stairs. Consequence: all heights are multiples of 0.5; a corridor's 2 m build grid (XXZ) never fights a 0.5 m riser. |
| Terrain spans ±64 m in M1 | **RATIFIED** | 128 m diorama. Fog from the palette_v2 noon preset (`#DCEFF8` @ 0.0028) leaves the far edge lightly hazed — inside ADB §6, matched to the high-key REF-002 look. |
| Chunk 32×32 cells | **RATIFIED** | 16 chunks. One terrain draw call per chunk (§3): 16 draw calls. Max measured chunk = 8,166 tris (three-band split) — fits all three budgets in TA §8 with headroom. |
| Sea level y = 0.0, water plane at 0.0 | **RATIFIED** | Water cells are exactly `height < 0`. Simplifies depth tint (§5) and the freshwater rule. |
| Build grid 2 m | **RATIFIED** (amended) | The grid is XZ-only: even cell coordinates, aligned to chunk origin. Heights of the starting plain pinned to exactly 4.0 m (a "construction-grade" region so any Noxel base sits flush). Ledges at 0.5 m multiples elsewhere; buildings on ledges is a later milestone decision, not blocked. |
| Playable range y ∈ [−6, +40] | **RATIFIED**, amended to **[−5, +40]** | Measured map range at seed 1337 is exactly [−5, +40]. The upper bound +40.0 is the **measured absolute summit** of the cliff massif (see §6f). Height storage covers −8 m floor for safety margin (§2). |

**New conventions proposed here (R8/R9):**

- **R8 Map-edge foundation skirt.** Terrain faces at the 4 map edges extend down to y = −12, giving the diorama a slab base like REF-001 image 3 and hiding the map floor. Cost: ~32 extra band quads (see §3.4 counts, already included). Alternative if rejected: fog + far plane alone; cheeks of empty space visible at pitch 62°.
- **R9 Shoreline pin.** Any land cell adjacent to water has its last terrace step pinned to +0.5 m exactly. This produces the hard 0.5 m vertical shore cut everywhere (REF-002 §2 "hard blocky stone banks") with zero special geometry, and makes the shore rim band land in a fixed vertex row (§4.3).

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
| Derived chunk meshes (16 chunks, indexed, §3.4) | ~4.9 MB GPU-shared buffers |
| Water surface mesh | ~0.1 MB |

Comfortably inside the 120 MB heap budget (TA §8). Encoding `heights` as Uint8 with an 8 m floor keeps the −12 m skirt and −4.5 m lake beds addressable while the playable floor sits at −5 m; if a future map ever needs below −8 m, the storage floor moves and the save schema version bumps — documented consequence, not a silent change.

## 3. Meshing strategy — one buffer per chunk, one material, vertex colours

### 3.1 Structures

Every chunk compiles to a **single indexed `BufferGeometry`** and renders with exactly one shared `MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 })` (no textures; ADB §3 rule 3). Attribute layout per vertex: `position` Float32×3, `normal` Float32×3 (constant per face orientation, `flat` crisp lighting), `color` Float32×3 — **authored in sRGB, converted to linear-sRGB once at mesh time** (three r152+ treats the `color` attribute as already-linear working-space data). Indices Uint16 — max measured chunk is 16,332 verts (< 65,535; assert in mesher).

Normals are baked per face (top = +Y; sides = ±X/±Z); `flatShading` stays false, which is free and exact.

### 3.2 Pseudocode (normative)

Rows for a face use a common vertical subdivision with **three named band boundaries**: 0.40 m (grass cap), 0.62 m (ochre band), 0.80 m (rust band), then stone-body rows at most 1.5 m apart (this is what carries the strata palette onto tall faces — §4.3). Rows are emitted exactly *at* these boundaries so each band row lies wholly inside one colour class (crisp band edges, §4.3).

```
splitRows(drop):                # drop = h(cell) − h(neighbour), strictly > 0
    rows ← []
    if drop > 0.40: rows += 0.40          # grass cap bottom
    if drop > 0.62: rows += 0.62          # ochre band bottom
    if drop > 0.80: rows += 0.80          # rust band bottom
    y ← 0.80 + 1.5
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

1. **Run merging in the mesher.** A cliff lip whose cells share the same quantised top height (and the cells below share the same base height) produces **one wide face quad** per band row instead of N individual 1 m quads. Normal is identical so lighting stays flat — visually a single large plane; merged runs share identical `rowSpan` lists, so the three-band boundaries merge identically.
2. **Lip quantisation in the generator.** The massif's surface contribution is rounded to whole metres before adding to base, and plateau-zone terrace steps are 1.0 m. Lips therefore *coincide* over long stretches. The contour wobble (±0.21 m) and the notch pass (−1.5 m cells at noise > 0.88) break runs deliberately — REF-001 §3 wants smooth planes "broken by blocky notches", not infinite planes.

Measured at seed 1337 (prototype `/tmp/opencode/terrain_proto.mjs`, accounting method identical to §3.4): longest merged cliff run **29 cells (29 m)**, **58 separate cliff plane regions**, max interior drop **13.0 m** within one cell span, 135 steep face columns. A 29 m × ~13 m plane of merged band rows is exactly the REF image-3 read; a 1 m quantum/hard-1.0-m-stair terrain would have produced 135×13 independent cube steps and been rejected. Unchanged by v1.1 (geometry untouched).

### 3.4 Vertex / triangle counts (128×128, seed 1337, three-band splitter, measured)

| Quantity | v1.0 (2 bands) | **v1.1 (3 bands)** |
|---|---|---|
| Top quads emitted (deep bed skipped) | 15,824 | 15,824 |
| Top triangles | 31,648 | 31,648 |
| Side band-row quads (after band split, incl. skirt rows) | 15,180 | **17,590** (+2,410, +15.9%) |
| Side triangles | 30,360 | **35,180** |
| **Terrain triangles total** | 62,008 | **66,828** (+7.8%) |
| Quads total | 31,004 | **33,414** |
| Indexed vertices (4 per quad) | 124,016 | **133,656** |
| Indices (6 per quad) | 186,024 | 200,484 (Uint16 per chunk) |
| Per-chunk triangles | 2,402 … 7,210 | **2,554 … 8,166** (chunk row 0 col 3 = NE massif) |
| Max chunk indexed verts | 14,420 | 16,332 (Uint16 OK) |
| Water surface quads (all 843 water cells) | 843 → 1,686 tris | unchanged |
| Trees/rocks/ore/food props (§8) | ≈ 6,500 tris | unchanged |

Grand total ≈ **73,300 tris ≈ 29% of the 250 k budget.** No per-cell overdraw abuse, no texture fetch, one material for all terrain.

**Where the +2,410 rows come from (measured):** every side span with drop > 0.80 m gains exactly one row (the extra ochre/rust boundary); there are 2,177 such interior spans plus 256 skirt faces, less 23 spans in (0.60, 0.62] that shrink a row. The dominant contributor is the 1.0 m plateau terrace riser: at drop ≈ 1.0 m it used to read as 2 rows (cap + rust remainder) and now reads as **cap + ochre + rust = 3 rows** — which is precisely the REF-002 terrace look (grass edge → warm ochre → red-brown on every stepped bank). The extra row *is* the accepted look; it is not overhead to apologise for.

## 4. Strata and material system (vertex colours, zero shader branching)

### 4.1 Principle

All band colour is **baked into vertex attributes at mesh time**. The fragment shader consumes them blind: zero per-pixel branching, zero texture fetches, no `MeshPhysicalMaterial`. Palette lives in one module (`Game/src/render/palette.ts`, mirrored to `tools/palette.mjs` per D-009) with palette_v2.json as the numeric source of truth — single source, no drift.

### 4.2 Top-face colours (sRGB hex, palette_v2)

Ramp is a **step lookup by elevation**, no gradients (ADB flat colour). Three steps, matching the three palette_v2 grass hexes:

| Material | Condition | palette_v2 key | Hex |
|---|---|---|---|
| GRASS L0 | y < 8 m | `grass_top` | `#79B94C` |
| GRASS L1 | 8 ≤ y < 16 | `grass_high` | `#8FC95E` |
| GRASS L2 | y ≥ 16 | `grass_peak` | `#9AD06A` |
| SAND | shore cells (F_SHORE), y ≤ 0.6 | `sand` | `#E3D3A6` |
| STONE top | no grass cover (rocky region + massif above ~13 m) | `stone_top` | `#E6DFCC` |
| ORE accent top | F_ORE_VEIN cells | `ore_crystal` | `#7B5AD6` (**provisional, D-015**) |

Notes: the ramp is saturated green, not olive — REF-002 explicitly supersedes REF-001's moodier sampling ("saturated, not olive"). Grass-top reading stays uniform because lighting, not the ramp, does the work — the noon preset's hemisphere fill (`hemiSky` `#BFD9F2` / `hemiGround` `#7A8F55` @ 0.55 i) provides the soft cool shadow tint. Ore deposit *props* additionally carry the highlight facet `#9B7BE8` (`ore_crystal_b`) on upper faces; that is prop-level, still vertex colour, still zero branching. Magenta `#D24BFF` stays reserved for effects only per palette_v2.

### 4.3 Side-face strata bands — three bands, explicit boundaries (the identity feature)

All thicknesses are fixed constants below the cell's top surface; thin strata on **every** cut edge (REF-002 §2: stepped grass terraces with visible banding, REF-001 §3 refined by REF-002 §3):

| Band | Span below top | palette_v2 key | Hex |
|---|---|---|---|
| 1. Grass cap | 0.00–0.40 m | `grass_cap` | `#5E9440` |
| 2. Ochre | 0.40–0.62 m | `strata_ochre` | `#C99A5F` |
| 3. Rust | 0.62–0.80 m | `strata_rust` | `#B4633C` |
| 4. Stone body | ≥ 0.80 m, alternating every 4.5 m of world Y (3 body rows of 1.5 m each; `stone_body_a` even band, `stone_body_b` odd) | `stone_body_a` / `stone_body_b` | `#DCD3BE` / `#D1C7AF` |
| 5. Shore rim band | F_SHORE faces, rows intersecting y ∈ (−0.25, +0.55) | `water_rim` | `#BFEAF0` |

Row-splitting rules (normative, mirrors `splitRows` in §3.2):

- A row boundary is emitted whenever the span crosses 0.40, then 0.62, then 0.80 m below the top; the region above 0.40 m is the grass cap row, 0.40–0.62 ochre, 0.62–0.80 rust.
- Below 0.80 m the span is subdivided into body rows no taller than 1.5 m (first core row starts at 2.30 m below top), so tall cliffs keep ~1.5 m stone slabs instead of micro-banding.
- Because rows land *on* boundaries, every band quad is wholly inside one colour class — no interpolation smear.
- On faces shorter than 0.80 m (all 0.5 m steps) the cap occupies most of the span: the strata read only on ≥1.2 m steps — this is IR-001's measured finding and still limits band visibility on micro-terraces, by design.

Computation inside the mesher is a pure function — no lookup tables, no branching in shaders:

```ts
// render/mesher.ts (summary; normative rules)
const BAND_CAP = 0.40, BAND_OCHRE = 0.62, BAND_RUST = 0.80;   // band boundaries below the top surface
const BODY_ROW_M = 1.5, BODY_TINT_ROWS = 3;                   // 4.5 m period

function bodyTint(worldY: number): number {                    // alternating pale stone layers
  return Math.floor(worldY / (BODY_ROW_M * BODY_TINT_ROWS)) & 1;
}
// band quad spans [yBottom, yTop); dropA/dropB: distance below the cell top at each edge (dropA < dropB)
function bandQuadColour(top: number, yBottom: number, yTop: number, flags: number): RGB {
  const dropA = top - yTop, dropB = top - yBottom;
  if ((flags & F_SHORE) && yTop > -0.25 && yBottom < 0.55) return WATER_RIM;   // shoreline rim first (§5)
  if (dropA >= BAND_RUST)   return STONE_BODY[bodyTint(yBottom)];             // wholly in stone body
  if (dropA >= BAND_OCHRE)  return STRATA_RUST;                               // span inside [0.62, 0.80)
  if (dropA >= BAND_CAP)    return STRATA_OCHRE;                              // span inside [0.40, 0.62)
  return GRASS_CAP;                                                           // span inside [0, 0.40)
}
```

The body tint follows absolute world Y so strata line up across separate cliff faces — they read as geological layers (REF-001 §3 "vertical tonal banding is subtle", REF-002 confirms).

### 4.4 ACES / fog interaction + numeric palette acceptance

- Palette hexes are authored in **sRGB**, converted once to linear at module init; renderer: `ACESFilmicToneMapping`, output sRGB; exposure = the active preset's `exposure` (noon 1.05 — the reference look; night 1.45).
- The noon sun (i 2.75) can push pale stone tops over 1.0 linear → ACES compresses to a slightly desaturated near-white: this is the REF sunlit-stone look and is *wanted*.
- `FogExp2` from the active preset (noon: `#DCEFF8`, density 0.0028) is applied post-material; vertex colours are untouched, and because tone mapping is exposure-driven the palette never needs repainting between presets (§4.5).
- **Numeric acceptance protocol (D-009), REVISED.** The tone pipeline changes what a hex looks like as a pixel (three 0.186 ACES multiplies exposure/0.6 before the film curve, so mid-tones render brighter than the authored sRGB hex — e.g. the cap `#5E9440` samples near RGB 108,166,69). The instrument is therefore an **unlit bench**: the harness draws strip quads with `MeshBasicMaterial` (white diffuse × linear vertex colour) under the production renderer settings; the sampled centre pixel must equal the **expected** column below within ±10/255 per channel (SwiftShader ±1 byte caveat, §10.5, still applies; re-confirm on GPU before sign-off). Values below are computed with exactly the three 0.186.1 shader maths: sRGB→linear → ×exposure/0.6 → Hill RRT/ODT fit → output matrix → clamp → sRGB encode.

**Palette acceptance table** (bench: unlit, output sRGB; columns E = exposure):

| Role | palette_v2 key | Target hex | Expected @ noon (E 1.05) | Expected @ night (E 1.45) |
|---|---|---|---|---|
| Grass top L0 (y<8) | `grass_top` | `#79B94C` | RGB 151,198,97 | RGB 176,213,122 |
| Grass top L1 (8–16) | `grass_high` | `#8FC95E` | RGB 173,207,123 | RGB 195,221,148 |
| Grass top L2 (y≥16) | `grass_peak` | `#9AD06A` | RGB 183,211,137 | RGB 202,223,162 |
| Grass cap band | `grass_cap` | `#5E9440` | RGB 108,166,69 | RGB 135,188,90 |
| Ochre band | `strata_ochre` | `#C99A5F` | RGB 209,175,114 | RGB 224,195,139 |
| Rust band | `strata_rust` | `#B4633C` | RGB 198,109,60 | RGB 218,134,78 |
| Stone top | `stone_top` | `#E6DFCC` | RGB 220,217,210 | RGB 230,228,223 |
| Stone body a | `stone_body_a` | `#DCD3BE` | RGB 216,212,203 | RGB 227,225,217 |
| Stone body b | `stone_body_b` | `#D1C7AF` | RGB 211,206,193 | RGB 224,220,210 |
| Sand | `sand` | `#E3D3A6` | RGB 219,212,189 | RGB 230,225,207 |
| Water shallow (d ≤ 0.5) | `water_shallow` | `#67CFD8` | RGB 151,211,214 | RGB 177,223,225 |
| Water mid (d ≈ 1.5) | `water_mid` | `#3AAFC4` | RGB 95,191,203 | RGB 129,208,217 |
| Water deep (d ≥ 4.0) | `water_deep` | `#2A8FA8` | RGB 43,161,183 | RGB 80,183,202 |
| Water rim / foam | `water_rim` | `#BFEAF0` | RGB 206,221,223 | RGB 220,231,233 |
| Ore accent (D-015 provisional) | `ore_crystal` | `#7B5AD6` | RGB 141,95,213 | RGB 167,119,226 |
| Ore highlight facet | `ore_crystal_b` | `#9B7BE8` | RGB 177,141,220 | RGB 197,165,231 |

In-scene (lit) pixels are *not* compared to the table — they are the product of sun+hemisphere with normals and shadows by design. The bench isolates palette-vs-pipeline; separate in-scene probes assert ordering/invariants only (e.g. rust reads redder than ochre at the same world Y).

### 4.5 Day/night (D-011) — concrete answers

The day/night cycle is in scope. The **four presets in palette_v2 `lighting` (dawn / noon / dusk / night) are adopted wholesale**: sun elevation/azimuth, sun colour+intensity (noon 2.75 i, night 1.15 i), hemisphere sky/ground/intensity, sky, fog colour + density, exposure (dawn 1.10 / noon 1.05 / dusk 1.12 / night 1.45). Noon is the default and the acceptance reference. The cycle is expressed **only** through light uniforms + exposure + fog; materials are never repainted (palette_v2 note, REF-002 §4). *(Note: palette_v2's lighting block was re-tuned while this revision was in flight; all figures here derive from the file as read at commit time — change log item 10.)*

1. **Do vertex-colour strata stay correct at night under ACES + elevated exposure? (The REV-002 brief asked at exposure 1.25; palette_v2 now prescribes 1.45.)** **Yes — no material swap needed, and the argument is exposure-independent.** Tone mapping is a monotonic, exposure-driven transform of the *lit* linear value; it never reorders colours, and the night sun `#BFD0FF` is near-neutral-cool, so linear-space band separations shrink roughly uniformly (monochrome scaling preserves every pairing's order and ratio structure). Measured on the tone pipeline at the prescribed night exposure 1.45, pairwise band separations hold at ≥ 72% of their noon values — grass-cap↔ochre Δ110.9→101.8, ochre↔rust 86.0→86.5 (unchanged), rust↔stone-body 177.1→166.4, water shallow↔deep 123.0→107.4, and the deliberately-subtle body-a↔b pair 12.7→9.1 (ΔRGB, unlit bench; the three readable pairs each hold ≥ 87%). At the brief's original 1.25 the same pairings measured ≥ 84%. The night column of the §4.4 table is the round-trip proof. Bands read at preset exposure — never merged, never hue-inverted.
2. **Material count.** Terrain keeps **exactly one** `MeshStandardMaterial` for all four presets — vertex colours carry the palette, light uniforms carry the time of day; an emissive or second terrain material would need shader variants and would break the "one palette module, no repaint per time of day" rule for no visual gain. Water keeps its **second material** (roughness 0.12 vs terrain 0.95) — it already was a separate material and stays one across all presets, which is what gives water its moon-glint sheen (moon 1.15 i at elev 40°). **No emissive-ish night tint on water:** night water is legible through the depth ramp (§5) plus the cool hemisphere sky `#3E4E80` picking up specular at roughness 0.12. If a night-water legibility problem is ever *measured*, the first remedy is the cheap uniform path (raise night `hemiIntensity` or exposure), not a material change.
3. **Fog/blending vs the water shore rim band.** No changes needed. Fog stays post-material and uniform per pixel, so it cannot interact with the rim band's blending (the rim remains a plain vertex tint — no blending-mode, no layer change). The real night effect: higher fog density (0.0045 vs 0.0028 noon) pulls rim and water both toward `#151C3C` — at 45 m the fog factor is ~18.3% night vs ~11.9% noon, so far-shore rim contrast shrinks somewhat; the near-camera rim (the one that matters for shore readability, REF-002 white foam at rock contact) is essentially unfogged. Rim geometry rule unchanged: rows intersecting y ∈ (−0.25, +0.55) on F_SHORE cut faces, `#BFEAF0`.
4. **Moving sun, shadow-map cost.** A shadow refresh re-renders the depth pass of all 16 chunk meshes + water + instanced props ≈ 22 draw calls — doubling draw-call pressure if done every frame for a slowly-moving sun, and causing shadow shimmer on terraces. **Recommendation: throttled + texel-quantised refresh.** Quantise the sun/moon direction to shadow-map texel steps (standard snap-to-texel to stop streak shimmer), refresh the shadow map every 10th frame (~6 Hz at 60 fps; ~10% amortised draw-call overhead) whenever the quantised direction changes; during preset crossfades (the only fast-lighting events, < 2 s) refresh every frame, then hold. Night: the moon's elevation is fixed at 40° and does not move within a preset — refresh once when the preset completes, then disable further updates; moonlight at 1.15 i does cast visible soft shadows, so the single refresh matters, but holding it costs nothing visually and nothing to compute. This keeps worst-case ≈ 44 draw calls (only during crossfade), ≪ the 120 budget.

## 5. Water

- **Representation:** water exists exactly where `height < 0`. Surface = one static full-map `BufferGeometry` of one quad per water cell (843 quads → 1,686 tris) at y = 0.0, one draw call. Material `MeshStandardMaterial({vertexColors: true, roughness: 0.12, metalness: 0.0})` — flat, hard, **opaque**. No transmission, no refraction, no foam geometry (TA §5, REF-002 §2: white foam is carried by the rim *tint*, not meshes).
- **Depth tint (cyan, three-stop):** vertex colour per water quad; depth `d = −height(cell)` clamped to [0, 4.5], piecewise lerp: `#67CFD8` (d ≤ 0.5) → `#3AAFC4` (d ≈ 1.5) → `#2A8FA8` (d ≥ 4.0), i.e. two segments with breakpoints at 0.5 and 1.5 m. Per-vertex smoothing across neighbouring water cells gives soft bands without any shader work. Interior lake beds (560 cells) are not meshed at all — opaque water plus the shore cut face closes the shape; cost already reflected in §3.4.
- **Waterline rim** (REF-002 §2: "white foam where water meets rock", REF-001 §6 rim retained), two cheap rules, no extra geometry:
  1. land-side: cut faces of shore cells intersecting y ∈ (−0.25, +0.55) use the rim band `#BFEAF0` (§4.3, band 5).
  2. water-side: water quads whose cell is within 1.0 m of a land cell blend the vertex colour 50% toward `#BFEAF0`.
- **Why opaque still holds with the brighter palette:** the decision was never about darkness — it is about correctness and cost under our constraints: (a) transparency forces sorted blending per quad and interacts badly with fog + ACES; with 843 quads and a hard shore cut the sorting cost buys nothing we can see; (b) REF-002's "high clarity, shallow-to-deep gradient" is fully expressed by the three-stop depth ramp in vertex colour — clarity is a *ramp*, not alpha; (c) a brighter, more saturated water plane makes the hard 0.5 m stone bank read *harder*, not softer — exactly the blocky-shore look. The rim band delivers the foam read. Opaque stays.

## 6. Milestone 1 scene layout — starting map 128×128

Machine-readable source of truth: **`06_Voxel_Studio/Biomes/start_map_v1.json`** (all coordinates below use the JSON convention; JSON is authoritative if they ever disagree).

Cell-space convention: x = east, z = south, origin NW corner; rect `[x0,z0,x1,z1)` **half-open in cell coordinates** (x1/z1 exclusive — the occupied cells are `x0…x1−1`, `z0…z1−1`). "Cell [i]" in prose = the JSON coordinate pair.

- **(a) Buildable plain**, rect `[16,80,54,102)` (JSON convention; occupied cells x 16–53 × z 80–101 = **38×22 cells = 836 m²**, requirement ≥ 28×22 m): exactly flat at **4.0 m**, 7 m feather rim, no trees/rocks/ore inside, slope **0°** measured (< 4°). Construction-grade height so 2 m bases sit flush.
- **(b) Forest** rect `[64,24,104,52)` (occupied x 64–103 × z 24–51, 1,120 m²): terraced meadow 4.5–9.5 m, 68 tree nodes from a 3 m jittered lattice (rule in JSON; coordinates generated, never hand-placed).
- **(c) Rocky region** rect `[96,56,120,84)`: bare stone tops above 13 m, faceted terraces 1,418 stone-top cells total, no grass cap, no ochre/rust bands on horizontal stone (band rule applies only to soil column tops), strata bands still on cut edges.
- **(d) Ore-bearing rock**, sub-rect `[102,64,114,76)`: **4 vein clusters** at cells (105,74), (107,65), (112,68), (111,74), radius 2.2 m each, accent `#7B5AD6` on top faces + highlight facets `#9B7BE8` + deposit props (§8). **D-015 provisional colour.**
- **(e) Lake** — irregular ellipse centre **(76,91)**, radii 16×13, bed **−4.5 m**, 843 water cells incl. river; shore = hard 0.5 m cut + rim bands (R9). Shore nodes: 3 freshwater wells (94,92), (77,106), (90,100).
- **(f) Cliff massif** rect `[86,0,128,20)` — the horizon silhouette: **peak contribution +34 m** (the massif ridge term added on top of ~6 m regional base terrain; JSON `massif.peakContributionM`), **measured absolute summit +40.0 m** (= JSON `massif.measuredSummitM` = `map.observedHeightRange[1]`; the upper bound of the measured height range at seed 1337), 58 smooth face regions, longest face run 29 m, notch-jagged lip; visible from the whole plain (NNE of the camera's default 45° yaw target at plain centre). The single measured maximum for this document is **+40.0 m**.
- **(g) Natural routes** (graded passes, max grade 13% ≈ 7.4°, 4.5 m corridor):
  - **R1** plain → forest: `(36,88) → (52,78) → (64,66) → (76,52) → (84,40)`, 68.7 m.
  - **R2** plain → rocky southern bypass skirting the lake: `(46,94) → (62,104) → (86,116) → (108,100) → (110,82)`, 91.0 m.
  Routes read by geometry (graded corridor, cut faces showing the §4.3 bands); palette_v2 has no route paint (`dirtRoute` removed in v1.1).
- **(h) Terrain past the playable edge:** playable rect is `[8,8,120,120)`; the **8-cell outer ring** keeps full generation (height/noise/mesh) but no interactables — building, harvesting and placement all refuse on `F_RING_EDGE`. The massif deliberately reaches the map edge, and all 4 edges get the −12 m foundation skirt (R8) so the diorama ends in a slab, never a hollow.
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
7. plain     rect [16,80,54,102): h = lerp(h, 4.0, plainMask(7 m feather)), final 0.5 re-quant
8. materials stone tops (mask §6c), sand (h ≤ 0.6 + water neighbour), grass otherwise
9. flags     F_CLIFF_LIP (drop ≥ 5), F_SHORE (R9 pin: last land step snapped to +0.5), F_ORE_VEIN,
             F_RING_EDGE
10. resources ore clusters → stone nodes → trees → freshwater/food (§8), in that order
```

Determinism guarantees: single-threaded, fixed pass order, fixed iteration (row-major); any constant change bumps the save schema. Re-loads reproduce the map bit-exactly from `seed` alone (TA §9). Unchanged in v1.1.

## 8. Resource placement (geological rules, not uniform random)

| Resource | Rule (geology-inspired) | M1 count | Parameters |
|---|---|---|---|
| **Ore** | Contact-zone rule: clusters sit inside the rocky sub-rect only, on stone-top cells, within 14 m of a >5 m drop (mineral veins at fault contacts), max separation 5.5 m between centres | **4 clusters** (target ≤ 5) at (105,74), (107,65), (112,68), (111,74) | radius 2.2 m accent per cluster → 1 ore node per cluster, 24 units; accent `#7B5AD6` + highlight `#9B7BE8` (**D-015 provisional**) |
| **Stone** | Scree rule: ring band z ∈ [21,30] under the massif's south cliff base | **12 nodes** | min separation 3.0 m |
| **Wood** | Forest canopy density: 3 m jittered lattice, fbm(1/6 m) > 0.40, land only | **68 trees** | jitter ±1.1 m/axis → clustered, never carpeted (REF-001 §4) |
| **Freshwater** | Lake shoreline rake: 3 fixed radial offsets, land cells only | **3 nodes**: (94,92), (77,106), (90,100) | vertices: each 12 units |
| **Food** | Forest–plain seam: south edge band z ∈ [52,57] of forest rect | **5 bushes**: (66,53), (89,55), (103,53), (95,53), (77,57) | 8 units each |

Total **92 ResourceNode** records, all with depleted representations (stump/scree rubble/empty vein/quarry hole/dry bush — visual reserved for Mimo coordination, *placement* is terrain's per VSG §0.6). Every node type must satisfy ADB §7 readability: rock = pale faceted stone (`#E6DFCC` family), **ore = same + violet crystal accent (`#7B5AD6`)** — distinct from turquoise water at a glance (rendered ΔRGB ≥ 107 under the noon pipeline vs every water stop), wood = clustered trunk-canopy silhouettes.

## 9. Performance (M1 budget confirmation, v1.1 numbers)

**250k triangles / 120 draw calls: CONFIRMED, with measured headroom.**

| Metric | Budget | Measured/expected M1 (three-band split) |
|---|---|---|
| Terrain triangles | — | 66,828 (16 chunks) |
| Water triangles | — | 1,686 (1 draw) |
| Props (3 tree archetypes instanced + rocks/ore/food instanced) | — | ≈ 6,500 |
| **Total triangles** | ≤ 250,000 | **≈ 73,300** (29%) |
| Draw calls: 16 terrain + 1 water + 5 instanced prop batches + HUD/UI planes | ≤ 120 | **~25** (≈ 50 static ×2 incl. shadow pass; during 2 s preset crossfades up to ~44 — §4.5.4) |

- **Culling:** three.js frustum culling on each chunk mesh (already per-object); chunk count is fixed at 16, no streaming in M1 — far plane 600 m covers the whole 128 m map. Chunk meshes are still built lazily-to-far-plane per TA §4, but everything builds on first frame in practice.
- **LOD:** none in M1 — deferred to M2 with a documented plan (chunk-decimation to 2 m top quads for far chunks). Justification: 73k tris leaves 3.4× headroom; LOD now would be gold-plating.
- **Mesh build budget:** ≤ 16 × 8 ms = 128 ms at boot (target < 250 ms assertion), inside the 3 s load budget. Three-band splitting adds no new loops (one extra comparison per span).
- Frame time target (16 ms) requires measured profiling once Task 007 wires the harness; geometry count implies no risk.

## 10. Open questions & risks

1. **Overhangs (Q-003)** — heightfield cannot express them, full stop. **Recommendation: keep M1 heightfield-only** (D-007 accepted) — nothing in the game loop needs a cave or arch. Escape hatch if the owner insists later: optional per-cell `overhang` metadata plus a 2.5-D "cliff shell" mesh pass, ≈ +25% mesh memory, +2 draw calls, one new mesher rule — cheap enough to add post-M1 without re-architecting. Never silently blocked: this paragraph is the documented answer.
2. **Vertex inflation from band rows.** Three bands raise side-vertex count: 17,590 rows / 133,656 indexed verts (+15.9% rows). Mitigations in place: deep-bed skip (−560 cells), horizontal run merging (29-cell runs measured), 1.5 m max body rows. If a future map triples cliff area, drop `BODY_ROW_M` fine rows to 2.25 m — a documented one-constant trade.
3. **Uint16 index ceiling.** Per-chunk verts peak 16,332 < 65,535 → OK, but the mesher asserts; a larger map (256×256) must switch to Uint32 — flagged, not hidden.
4. **ACES tone drift is now numeric.** The tone pipeline systematically brightens mid-tones (three's `exposure/0.6` convention + film shoulder); authored hexes are *not* the expected pixels. Acceptance is against the §4.4 expected column (±10/255 per channel), not the authored hex. Palette module shared with the harness so concept renders and game cannot drift (D-009).
5. **SwiftShader headless specifics.** Known deltas: no MSAA, rasterisation/texture rounding differs; vertex colours and ACES output are shader-identical maths but may quantise differently. Treat all harness colour captures as ±1 byte per channel until a GPU capture confirms (mirrors TA §11 risk). The §4.4 ±10/255 tolerance absorbs this.
6. **Water/geometry interaction.** Shore rim band tops out at +0.55 m, water at 0.00 m, beds ≥ −4.5 → no coplanar z-fighting candidates. The one to watch: lake rim band at exactly y ∈ (−0.25, 0.55) intersects the waterline — intended; assert no water quad shares a plane with terrain faces in a unit test.
7. **Deterministic float equality.** All quantisation uses `round(x*2)/2` on values < 3,000; bitwise-stable. Risk: future refactors adding trig noise. Guard: lint rule rejecting `Math.sin/cos/tan/atan` in `sim/` (already implied by D-005).
8. **Tree archetype uniformity.** 68 trees over 3 archetypes risks a "same tree" read at 45 m; mitigate with per-instance scale jitter ×[0.85, 1.2] and Y-rotation limited to 90° steps (ADB §3 allows Y-only rotation for props).
9. **Night lighting acceptance is a two-column check.** Band separations survive ACES at the prescribed night exposure 1.45 (§4.5.1 numerics), but *lit* night scenes need their own in-scene probe (ordering assertions + the unlit night-column bench), since pixel values are intentionally re-exposed rather than equal to targets. First harness run should capture both noon and night bench strips in one pass.
10. **D-015 ore violet is provisional.** If the owner rejects violet, the fallback must come from palette_v2 (e.g. `accent_teal` `#2FA6A0` reads distinct from cyan water but weaker against `canopy` greens); no new hexes may be invented for materials.

## 11. Not touched (boundary)

Trees/rocks *meshes*, building silhouettes, wall/pillar/stairs geometry, depleted prop visuals: Mimo's Noxel domain. This guide supplies palette values, placement coordinates, height/legibility requirements and depleted-representation obligations only. No `Game/` source here, no `00_Project_Core/` edits, no architecture decisions beyond terrain internals.

---

### Change log
- v1.0 — ratified §0 table, full spec, `start_map_v1.json`, resource rules, budgets confirmed from measured generator run.
- v1.1 — REV-002 revision: palette_v2 hexes throughout; three strata bands (0.40/0.62/0.80 m boundaries) with re-measured counts (66,828 tris, 133,656 verts); turquoise cyan water with three-stop depth ramp, opaque retained; ore accent → violet crystal `#7B5AD6` (D-015 provisional); new §4.5 day/night (D-011) with four palette_v2 presets, night-strata confirmation, one-terrain-material + one-water-material decision, fog/rim analysis, throttled shadow policy; §6/JSON consistency fixes (plain rect `[16,80,54,102)` convention agreed, massif peak contribution +34 m vs measured absolute summit +40.0 m); `dirtRoute` removed from the map JSON.
