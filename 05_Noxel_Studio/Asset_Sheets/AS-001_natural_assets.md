# AS-001 — Natural Asset Specification

**Owner:** Mimo (Lead Noxel Artist) · **Status:** Review Required
**Task:** 011a — natural resource asset sheets (trees, rocks, ore + depleted states)
**Feeds:** Milestone 1 "The Untamed World" (ADB §2, GDD §3) — the first world is nature-only.
**Traces to:** REF-001 (`04_Art_Director/Reference_Analysis/REF-001_Noxel_Reference_Analysis.md`),
ADB (`00_Project_Core/Art_Direction_Bible.md`), `Voxel_Style_Guide.md` (§5, §6),
`Asset_Naming_Conventions.md`, `Decision_Log.md` (D-006, D-008).

> **Provenance statement.** The owner's reference images are **not on disk** and were **not viewed**
> for this document. All reference-derived observations are cited to REF-001 by section and inherit
> REF-001's own caveats (its palette is eye-sampled and "to be locked numerically", REF-001 §8).
> **No images, meshes or renders were created.** This document contains parametric data and exact
> numbers only. Anything beyond REF-001 and the ADB is tagged **[PROPOSAL]**.

---

## 0. Scope, and what belongs to someone else

| In this sheet | Not in this sheet (and why) |
|---|---|
| Tree meshes (3 species + 1 shrub family), their harvest states | Terrain, cliffs, terraces, strata banding — **GLM**, `Voxel_Style_Guide.md` §1 |
| Rock clusters (3 size classes), their depleted state | Ground cover, flowers, grass specks — **GLM** (terrain domain, `Voxel_Style_Guide.md` §1) |
| Ore clusters + their states | Water, shorelines, wildlife — not yet assigned |
| Placement *rules for the meshes* | Placement *algorithm, biomes, geology* — **GLM**, `Voxel_Style_Guide.md` §5 |
| Material slots and hex values | The palette module itself — one shared file (ADB §2) |

**Boundary note.** `Voxel_Style_Guide.md` §6 states: "Trees: geometry may be a **custom mesh**
(Noxel-adjacent blocky canopy), not voxel cells. The *distribution rule* is terrain's; the *mesh* is
not." This sheet supplies the **mesh**; GLM supplies the **distribution**.

**No buildings are designed here.** This sheet contains no architecture.

---

## 1. The parametric composition contract

Everything in this sheet is a **list of axis-aligned boxes**. A programmer can implement the whole
sheet from the tables below without asking a question.

### 1.1 Box record

```ts
interface NatBox {
  cx: number;  // centre X, metres, relative to asset origin
  cy: number;  // centre Y, metres, relative to asset origin (y=0 is ground)
  cz: number;  // centre Z, metres, relative to asset origin
  sx: number;  // full size X, metres
  sy: number;  // full size Y, metres
  sz: number;  // full size Z, metres
  slot: MatSlot; // palette slot id
}
```

- **Asset origin** = the centre of the trunk/rock footprint, at ground level (y = 0).
- The asset's **base is buried** 0.15 m into the terrain (see §2.4) so nothing floats on a slope.
  In the tables, `cy` is measured from the *planting plane* (y = 0); the renderer offsets the whole
  asset down 0.15 m.
- Boxes are **centre + full size**, never min-corner. No ambiguity.
- **No box may be rotated.** All boxes are axis-aligned in asset space (REF-001 §1, ADB §3.1).
- Box sizes and centres are multiples of **0.05 m** (same authoring quantum as the Noxel guide
  §2.2 G9), except where a table says otherwise (the 0.9 m tread-like values are exact).

### 1.2 Flat colour, no textures

Every box takes **one** palette slot and renders as flat colour. No texture maps, no vertex colour,
no baked AO (ADB §3.3, REF-001 §1.3). Shadows come from the light rig — a shadowed face of
`mat_stone_pale` must land near `#B9AECB` because of the hemisphere fill, never because a different
material was assigned (Noxel guide §4.3).

### 1.3 Palette slots used

| Slot | Hex | Source | Used by |
|---|---|---|---|
| `mat_bark_dark` | `#5B3A38` | REF-001 §8 "Trunk" | All trunks, stump bodies |
| `mat_foliage_primary` | `#F0A8BE` | REF-001 §8 "Canopy pink" | Main canopy mass |
| `mat_foliage_cream` | `#F2DDC4` | REF-001 §8 "Canopy cream" | Canopy variation blocks (minority) |
| `mat_ochre` | `#C9A06A` | REF-001 §8 "Strata: ochre" | Cut wood faces, gold-ore vein, rare foliage block |
| `mat_stone_pale` | `#EDE4D6` | REF-001 §8 "Sunlit stone" | All rock bodies |
| `mat_ore_copper` | `#B25A3F` | REF-001 §8 "Strata: red-brown" | Copper-ore vein only |
| `mat_emissive_magenta` | `#C24BEF` | REF-001 §8 "Emissive accent" | **FORBIDDEN on all natural assets** (§7.2) |

**Slot discipline:** the same hex may be reached by two different slot ids (e.g. `mat_ochre` here vs
`mat_strata_ochre` in GLM's terrain work). The palette module must resolve both to `#C9A06A`
(ADB §2 "one palette file as law"). Logged as an open item in §9.

---

## 2. Tree families

### 2.0 Design constraints (from REF-001 §4 and ADB §5)

| Constraint | Value |
|---|---|
| Total tree height | **6.0 – 9.0 m** |
| Canopy width (across) | **4.0 – 6.0 m** |
| Trunk section | **0.40 – 0.60 m**, square, **no taper**, **no branches** |
| Canopy is wider than it is tall | yes — REF-001 §4 "canopy is wider than tall, flat-bottomed" |
| Canopy construction | **3–8 cuboids of different sizes** clustered with deliberate offsets; usually one large mass plus smaller satellites, **some detached** |
| Trunk colour | dark maroon → near-black violet (`#5B3A38`) |
| Canopy colour | pink/magenta-violet, with **occasional cream or pale-ochre blocks mixed in as variation** |
| Ground foliage | green appears **only on the ground**, never in canopies (REF-001 §4) — see §7.3 and guide §9-C13 |

### 2.1 Species roster

Three tree species with deliberately different silhouettes, plus one ground-scale shrub family.

| Species | ID stem | Silhouette archetype | Total H | Canopy W (main mass) | Canopy H | Distinctive read at 45 m |
|---|---|---|---|---|---|---|
| **T1 — Spire** | `nat_tree_spire_` | tall, narrow, stepped cone | **8.50 m** | **4.20 m** | **3.90 m** | A thin vertical needle with a small stepped crown on a long bare stem. The tallest, thinnest tree. |
| **T2 — Table** | `nat_tree_table_` | squat, very wide, flat top | **6.15 m** | **5.90 m** | **2.65 m** | A wide flat tabletop on a short thick stem. The widest tree; reads as a horizontal bar. |
| **T3 — Cluster** | `nat_tree_cluster_` | mid-height lumpy blob with side lobes | **6.60 m** | **4.35 m** | **3.40 m** | A lumpy rounded clump with two outboard lobes; the only tree whose silhouette is not a single mass. |
| **G1 — Shrub** | `nat_shrub_` | low ground bun | **1.50 m** | **1.40 m** | **1.50 m** | A small dark bun on the ground; the "sapling" read at human scale. |

**Two width figures are used deliberately:**
- **Canopy W (main mass)** = the X/Z extent of the canopy boxes that touch the main mass. This is the
  figure used for the 4.0–6.0 m band check and for the aspect-ratio rule.
- **Canopy envelope** = the total extent including any detached satellite. Hard limit **6.00 m**,
  and **5.60 m** for T1 and T3 so that a satellite never pushes them toward T2's silhouette.

**Aspect-ratio separation rule [PROPOSAL]:** any two species must differ by **≥ 25 %** in overall
aspect ratio (total height ÷ canopy W, main mass), or they will not be told apart at 45 m.

| | H/W | T1 | T2 | T3 |
|---|---|---|---|---|
| T1 Spire | **2.02** | — | +94 % | +33 % |
| T2 Table | **1.04** | | — | +46 % |
| T3 Cluster | **1.52** | | | — |

All three pairs pass the 25 % rule. G1 the shrub is excluded — it is separated by absolute size
(1.50 m vs 6.15–8.50 m).

### 2.2 T1 — Spire (`nat_tree_spire_a`)

**Trunk:** 0.50 × 5.00 × 0.50, centre (0, 2.50, 0) → spans y 0 → 5.00. Bare trunk height 4.40 m.

| Box | Slot | sx | sy | sz | cx | cy | cz | Spans |
|---|---|---|---|---|---|---|---|---|
| T | `mat_bark_dark` | 0.50 | 5.00 | 0.50 | 0.00 | 2.50 | 0.00 | y 0–5.00 |
| C1 | `mat_foliage_primary` | 4.20 | 1.80 | 4.20 | 0.00 | 5.50 | 0.00 | y 4.60–6.40 |
| C2 | `mat_foliage_primary` | 2.80 | 1.40 | 2.80 | 0.35 | 6.90 | −0.25 | y 6.20–7.60 |
| C3 | `mat_foliage_cream` | 1.60 | 1.20 | 1.60 | −0.30 | 7.90 | 0.25 | y 7.30–8.50 |
| C4\* | `mat_foliage_primary` | 1.20 | 1.00 | 1.20 | 2.85 | 5.60 | 1.20 | y 5.10–6.10, **detached** |

\* C4 is the optional detached satellite (REF-001 §4 "some detached"). Present in 1 of 3 instances.

**Canopy envelope:** x[−2.10, 2.10] without C4 (main mass **4.20 m**); x[−2.10, 3.45] with C4
(**5.55 m** ≤ 5.60 limit). z[−2.10, 2.10].
**Total height** 8.50 m.
**Canopy extent** y 4.60 → 8.50 = **3.90 m** tall (canopy is wider than tall ✓).
**Canopy overlap on trunk:** C1 bottom 4.60 vs trunk top 5.00 → 0.40 m interpenetration, so the
canopy is always attached (no floating crown).
**Slot plan:** C3 is the only cream block — it is the top cap, which is where sun hits and where
REF-001's "occasional cream blocks mixed in" reads best.

### 2.3 T2 — Table (`nat_tree_table_a`)

**Trunk:** 0.60 × 3.80 × 0.60, centre (0, 1.90, 0) → y 0 → 3.80.

| Box | Slot | sx | sy | sz | cx | cy | cz | Spans |
|---|---|---|---|---|---|---|---|---|
| T | `mat_bark_dark` | 0.60 | 3.80 | 0.60 | 0.00 | 1.90 | 0.00 | y 0–3.80 |
| C1 | `mat_foliage_primary` | 5.60 | 1.20 | 4.60 | 0.00 | 4.10 | 0.00 | y 3.50–4.70 |
| C2 | `mat_foliage_primary` | 3.20 | 1.00 | 3.20 | 0.50 | 5.00 | −0.30 | y 4.50–5.50 |
| C3 | `mat_foliage_cream` | 1.80 | 0.90 | 1.80 | −0.60 | 5.70 | 0.40 | y 5.25–6.15 |
| C4 | `mat_foliage_primary` | 2.00 | 0.80 | 2.00 | 2.10 | 4.60 | 1.30 | y 4.20–5.40 |

**Canopy envelope:** x[−2.80, 3.10] = **5.90 m**; z[−2.30, 2.30] = 4.60 m.
**Total height** 6.15 m. **Canopy overlap on trunk:** C1 bottom 3.50 vs trunk top 3.80 → 0.30 m.
C4 is an outboard lobe, attached to C1 (C1's x max 2.80 = C4's x min 1.10 → C4 overlaps C1 by
1.70 m — it is a lobe, not a satellite).
**Slot plan:** C3 is the only cream block. C4 is `mat_foliage_primary` so the table stays a solid
pink mass (the table read depends on mass, not on colour breakup).

### 2.4 T3 — Cluster (`nat_tree_cluster_a`)

**Trunk:** 0.45 × 3.60 × 0.45, centre (0, 1.80, 0) → y 0 → 3.60.

| Box | Slot | sx | sy | sz | cx | cy | cz | Spans |
|---|---|---|---|---|---|---|---|---|
| T | `mat_bark_dark` | 0.45 | 3.60 | 0.45 | 0.00 | 1.80 | 0.00 | y 0–3.60 |
| C1 | `mat_foliage_primary` | 3.00 | 2.20 | 3.00 | 0.00 | 4.50 | 0.00 | y 3.40–5.60 |
| C2 | `mat_foliage_primary` | 2.40 | 1.60 | 2.20 | 1.05 | 4.00 | 0.25 | y 3.20–4.80 |
| C3 | `mat_foliage_primary` | 2.20 | 1.60 | 2.20 | −1.00 | 4.20 | −0.50 | y 3.40–5.00 |
| C4 | `mat_foliage_primary` | 2.00 | 1.40 | 2.00 | 0.15 | 5.55 | −0.15 | y 4.85–6.25 |
| C5 | `mat_foliage_cream` | 1.20 | 1.00 | 1.20 | −0.35 | 6.10 | 0.25 | y 5.60–6.60 |

**Canopy envelope:** x[−2.10, 2.25] = **4.35 m** (main mass); z[−1.60, 1.60] = 3.20 m.
**Canopy extent** y 3.20 → 6.60 = **3.40 m** tall (canopy is wider than tall ✓).
**Total height** 6.60 m. **Canopy overlap on trunk:** C1 bottom 3.40 vs trunk top 3.60 → 0.20 m.
C2 and C3 are the outboard lobes — they make T3 the only species whose silhouette is not one mass.
**Slot plan:** C5 is the only cream block.

### 2.5 G1 — Shrub (`nat_shrub_a`)

Ground-scale foliage. **Outside the 6–9 m tree band by design** — it is the "small sapling" read,
and its separation from the trees is absolute size, not aspect ratio.

| Box | Slot | sx | sy | sz | cx | cy | cz | Spans |
|---|---|---|---|---|---|---|---|---|
| B1 | `mat_foliage_primary` | 1.40 | 0.70 | 1.40 | 0.00 | 0.35 | 0.00 | y 0–0.70 |
| B2 | `mat_foliage_primary` | 1.00 | 0.60 | 1.00 | 0.30 | 0.90 | −0.20 | y 0.60–1.20 |
| B3 | `mat_foliage_cream` | 0.70 | 0.50 | 0.70 | −0.30 | 1.25 | 0.25 | y 1.00–1.50 |

**Total height** 1.50 m, **width** 1.40 m. No trunk — a shrub has a woody base only, which is why
it reads as ground cover rather than a small tree.
**Slot plan:** B3 is the only cream block. §7.3 explains the shrub's slot under Q-001.

### 2.6 Tree variation rules

A tree instance is generated from **one integer seed** (D-006: the world seed is authoritative).
The mesh is deterministic: same seed + same species ⇒ same tree, every time.

**Algorithm (implement literally):**

```
seed -> mulberry32(seed) -> jitter the authored box list -> validate -> emit
```

**Parameters and ranges.** Applied to the authored boxes above:

| # | Parameter | Range | Applies to |
|---|---|---|---|
| V1 | Canopy group lateral offset | **−0.35 … +0.35 m** in x **and** z (independent) | The whole canopy group as a rigid translation. Produces a "lean" read without any rotation (guide §2.4). |
| V2 | Per-box size jitter | **±8 %** of the authored size, rounded to the nearest 0.05 m, and **clamped** so no box shrinks below 0.30 m in any axis | Every canopy box |
| V3 | Per-box position jitter | **±0.30 m** in x and z, **±0.20 m** in y, rounded to 0.05 m | Every canopy box |
| V4 | Trunk section | **0.40 – 0.60 m**, rounded to 0.05 m | Trunk only |
| V5 | Trunk height | **−0.60 … +0.60 m** | Trunk only |
| V6 | Detached satellite | **0 or 1** per instance; present in **1 of 3** instances. Size **0.80–1.40 m**, offset **0.15–0.45 m** clear of the main mass | T1 (box C4) and T3 only. **Not permitted for T2** — its main mass is already at the top of the 4–6 m band. |
| V7 | Cream-block substitution | 1 canopy box (never the largest) takes `mat_foliage_cream` in **3 of 5** instances; the rest stay `mat_foliage_primary` | Slot assignment only — **no geometry change** |
| V8 | Ochre-block substitution | 1 canopy box takes `mat_ochre` in **1 of 7** instances | Slot assignment only |
| V9 | Attached lobe | 1 extra canopy box of 0.80–1.40 m that **overlaps** the main mass (not detached) | T2 only — keeps the table read while adding asymmetry |

**Hard clamps after jitter (a jittered tree that breaks these is rejected and regenerated with the
next seed value — it is never clamped into a broken state):**

| Clamp | Rule |
|---|---|
| K1 | Total height ∈ **[6.0, 9.0] m**. |
| K2 | Canopy **main-mass** width (max of X extent, Z extent, satellites excluded) ∈ **[4.0, 6.0] m**, and the **total envelope** ≤ **6.00 m** (≤ 5.60 m for T1 and T3). |
| K3 | Canopy height < canopy width (canopy wider than tall). |
| K4 | The canopy's lowest box must **overlap the trunk's top by ≥ 0.20 m** — no floating crown. |
| K5 | Trunk base touches y = 0 exactly. |
| K6 | No canopy box may be separated from the main canopy mass by more than **0.60 m**, except the single deliberate satellite (V6). |
| K7 | Species aspect ratio (total height ÷ main-mass canopy width) must stay within **±12 %** of the authored value, so the 25 % separation rule (T1/T2/T3) survives jitter. |

**What must NOT be jittered:** the number of boxes per species, the trunk being a single box, the
canopy being flat-bottomed in its main mass (REF-001 §4), and the slot of the trunk.

---

## 3. Tree states — standing, partially harvested, stump

`ResourceNode` states are `'full' | 'partial' | 'depleted'` (Technical Architecture §3). The tree
states map onto them as follows:

| Art state | Sim state | Suffix in asset ID | Resource type | Yield |
|---|---|---|---|---|
| Standing | `full` | *(none)* | `wood` | 100 % of the node's max |
| Partially harvested | `partial` | `_partial` | `wood` | 25–50 % remaining |
| Stump | `depleted` | `_stump` | `wood` | 0 % remaining; node is cleared |

### 3.1 Standing

The authored composition (§2.2–§2.5), with jitter applied.

### 3.2 Partially harvested (`_partial`)

**Rule:** the crown has been **felled** — it is no longer on the trunk. The trunk is **cut flat**
(never broken: REF-001 §4 says trunks have no taper and no branches, so a clean cut is the only
honest harvest read), the cut face is exposed and coloured, and the **felled crown lies on the
ground** beside the stem. This is the most readable possible signal of "this tree was cut": a bare
stem with a bright sawn top, and the pink mass lying in the grass next to it.

| Species | Trunk (sx, sy, sz) | Trunk centre | Cut face box | Felled crown on the ground |
|---|---|---|---|---|
| T1 Spire | 0.50 × **3.95** × 0.50 | (0, 1.975, 0) → y 0–3.95 | 0.54 × 0.05 × 0.54 at (0, 3.975, 0) → y 3.95–4.00 | 2.40 × 1.20 × 2.40 at (1.85, 0.60, 0.55) → y 0–1.20, x 0.65–3.05 |
| T2 Table | 0.60 × **3.45** × 0.60 | (0, 1.725, 0) → y 0–3.45 | 0.64 × 0.05 × 0.64 at (0, 3.475, 0) → y 3.45–3.50 | 3.20 × 0.90 × 2.80 at (2.15, 0.45, 0.65) → y 0–0.90, x 0.55–3.75 |
| T3 Cluster | 0.45 × **3.15** × 0.45 | (0, 1.575, 0) → y 0–3.15 | 0.49 × 0.05 × 0.49 at (0, 3.175, 0) → y 3.15–3.20 | 1.90 × 1.10 × 1.90 at (1.60, 0.55, 0.45) → y 0–1.10, x 0.65–2.55 |
| G1 Shrub | *(no trunk)* | — | — | B1 shrunk to 1.10 × 0.50 × 1.10 at (0, 0.25, 0); B2 and B3 removed |

- **Cut face material:** `mat_ochre` `#C9A06A` — the only warm note on the plant, and it reads as
  freshly cut wood. It is a **separate box, 0.04 m wider than the trunk in X and Z, sitting on the
  trunk top** (butt joint). The 0.04 m proud rim means it has **no coplanar side face with the
  trunk** — it satisfies the joint rule in guide §2.2 G8 and cannot z-fight.
- **The felled crown keeps `mat_foliage_primary`** and is **not** jittered into the ground: it is a
  box resting on y = 0.
- **Total height of a partially harvested tree:** **3.20 – 4.00 m** — deliberately below the 6–9 m
  standing band, and clearly above the 0.60–0.80 m stump. Three states, three heights, no overlap.
- **Silhouette at 45 m:** a bare vertical stem with a bright cap, and a **pink mass lying on the
  ground** to one side. The pink mass is the loudest element and is what the player actually sees
  first.
- **Resource:** `wood`, 25–50 % of the standing node's yield remaining.

### 3.3 Stump (`_stump`)

**Rule:** the trunk is cut down to a low square nub. Optionally one felled log lies on the ground
beside it. There is **no crown** — the crown was already removed in the partial state.

| Species | Stump (sx, sy, sz) | Centre | Cut face box | Optional log |
|---|---|---|---|---|
| T1 Spire | 0.50 × **0.65** × 0.50 | (0, 0.325, 0) → y 0–0.65 | 0.54 × 0.05 × 0.54 at (0, 0.675, 0) → y 0.65–0.70 | 2.00 × 0.35 × 0.35 at (1.30, 0.175, 0.55), axis-aligned (no rotation) |
| T2 Table | 0.60 × **0.75** × 0.60 | (0, 0.375, 0) → y 0–0.75 | 0.64 × 0.05 × 0.64 at (0, 0.775, 0) → y 0.75–0.80 | 2.20 × 0.40 × 0.40 at (1.45, 0.20, 0.60) |
| T3 Cluster | 0.45 × **0.55** × 0.45 | (0, 0.275, 0) → y 0–0.55 | 0.49 × 0.05 × 0.49 at (0, 0.575, 0) → y 0.55–0.60 | 1.80 × 0.30 × 0.30 at (1.20, 0.15, 0.50) |
| G1 Shrub | *(no stump)* | — | — | G1's stump state is **empty** — a harvested shrub leaves nothing |

- **Log presence:** 1 of 2 stumps carries a log (seeded). The log's two end faces are `mat_ochre`;
  the rest is `mat_bark_dark`.
- **Total height** 0.60–0.80 m. At 45 m this is a **21–28 px** dark nub at 1080p — it must be found
  by its position in a clearing, not by its silhouette alone. This is acceptable because a stump is
  a *state*, not a resource the player must spot from the map.
- **Resource:** `wood`, 0 % — the node is cleared and removed from the sim on transition.

---

## 4. Rock families

### 4.1 Design constraints

| Constraint | Value | Source |
|---|---|---|
| Rock sizes | **0.8 m, 1.8 m, 3.0 m** | ADB §5, task brief |
| Form | "blocky faceted clusters" — stepped boxes of different sizes, **no single box** | ADB §3.8, REF-001 §1 |
| Read | "bare pale stone, faceted, no grass cap" | ADB §7 |
| Colour | one pale stone family | REF-001 §5 |
| Placement | usable as **scenery** and as a **stone resource** node | task brief |
| State | every harvestable node needs a depleted representation | `Voxel_Style_Guide.md` §5 |

### 4.2 Compositions

Each size class is a cluster of boxes. The **bounding box maximum dimension equals the nominal
size** — that is how the size is specified and how it is checked.

**R1 — Small, 0.8 m class (`nat_rock_small_a`)**

| Box | Slot | sx | sy | sz | cx | cy | cz |
|---|---|---|---|---|---|---|---|
| 1 | `mat_stone_pale` | 0.80 | 0.40 | 0.70 | 0.00 | 0.20 | 0.00 |
| 2 | `mat_stone_pale` | 0.50 | 0.30 | 0.45 | 0.10 | 0.50 | −0.05 |
| 3 | `mat_stone_pale` | 0.30 | 0.20 | 0.30 | −0.20 | 0.60 | 0.10 |

Bounding box: 0.80 × **0.70** × 0.70 → max dimension **0.80** ✓. Height 0.70.
Silhouette at 45 m: a low, slightly stepped pebble — **24 px** tall at 1080p. Too small to be a
landmark, so **R1 must be placed in clusters of 4–9 within a 3 m radius** and the cluster counts as
one harvestable node. A single R1 is scenery only.

**R2 — Medium, 1.8 m class (`nat_rock_medium_a`)**

| Box | Slot | sx | sy | sz | cx | cy | cz |
|---|---|---|---|---|---|---|---|
| 1 | `mat_stone_pale` | 1.80 | 0.90 | 1.50 | 0.00 | 0.45 | 0.00 |
| 2 | `mat_stone_pale` | 1.20 | 0.70 | 1.00 | 0.15 | 1.10 | −0.10 |
| 3 | `mat_stone_pale` | 0.70 | 0.50 | 0.60 | −0.40 | 1.40 | 0.25 |

Bounding box: **1.80** × 1.60 × 1.50 → max **1.80** ✓. Height 1.60.
Silhouette at 45 m: a stepped mound with a small off-axis cap — **56 px** tall, and the step between
box 1 and box 2 is visible as a notch. This is the default **stone resource** node.

**R3 — Large, 3.0 m class (`nat_rock_large_a`)**

| Box | Slot | sx | sy | sz | cx | cy | cz |
|---|---|---|---|---|---|---|---|
| 1 | `mat_stone_pale` | 3.00 | 1.40 | 2.40 | 0.00 | 0.70 | 0.00 |
| 2 | `mat_stone_pale` | 1.80 | 1.00 | 1.40 | 0.30 | 1.80 | −0.20 |
| 3 | `mat_stone_pale` | 1.10 | 0.90 | 0.90 | −0.60 | 2.40 | 0.40 |
| 4 | `mat_stone_pale` | 0.60 | 0.50 | 0.55 | 0.90 | 2.20 | −0.70 |

Bounding box: **3.00** × 2.85 × 2.40 → max **3.00** ✓. Height 2.85.
Silhouette at 45 m: a broad mass with an off-axis spire and one detached chip (box 4) — **99 px**
tall, **59 px** wide. Reads as a landmark boulder / cliff foot.

**Construction rules (all sizes):**
- Every cluster is **3–4 boxes**, never fewer, never more.
- At least one box is **≤ 60 %** of the largest box's width (the faceting).
- No two boxes share the same top y (no coplanar front-facing tops — guide §2.2 G8).
- The largest box is always box 1 and always sits on the ground.
- Box 1 spans the full footprint; boxes 2–4 are offset and smaller.

### 4.3 Depleted state (`_depleted`)

**Rule:** depletion removes whole boxes. It never shrinks a box in place, never adds debris, never
changes the material. The depleted rock must not be mistakable for a full one at 45 m.

| Class | Depleted composition | Height | Bbox max | Screen height @45 m |
|---|---|---|---|---|
| R1 0.8 | 0.50 × 0.20 × 0.45 at (0, 0.10, 0) · 0.20 × 0.12 × 0.20 at (−0.15, 0.26, 0.05) | 0.32 | 0.50 | 11 px |
| R2 1.8 | 1.10 × 0.40 × 0.90 at (0, 0.20, 0) · 0.40 × 0.25 × 0.35 at (−0.25, 0.50, 0.10) | 0.62 | 1.10 | 22 px |
| R3 3.0 | 1.80 × 0.70 × 1.40 at (0, 0.35, 0) · 0.80 × 0.40 × 0.65 at (0.20, 0.90, −0.10) | 1.10 | 1.80 | 38 px |

- Depleted height is **≤ 45 %** of the full rock's height in every class.
- Depleted bbox max is **≤ 65 %** of the full rock's.
- A depleted rock stays **in place** (no scatter debris) — the player must see that *this* spot is
  worked out.
- Resource: `stone`, 0 % remaining.

---

## 5. Ore deposits

### 5.1 Design constraints

| Constraint | Value | Source |
|---|---|---|
| Form | "stone + one saturated accent colour" | ADB §7 |
| Accent colour | **exactly one** saturated colour per deposit | ADB §7 |
| Magenta / violet emissive | **forbidden** — reserved for effects | ADB §7, REF-001 §7, task brief |
| Size | inherits the rock size classes | task brief |
| States | full / partial / depleted, with the accent removed at depletion | `Voxel_Style_Guide.md` §5 |

### 5.2 Ore families

Two ore appearances, both mapping to sim `ResourceType: 'ore'`.

| Ore | ID stem | Accent slot | Accent hex | Body | Host rock class | Total height | Screen height @45 m |
|---|---|---|---|---|---|---|---|
| **Copper** | `nat_ore_copper_` | `mat_ore_copper` | `#B25A3F` | `mat_stone_pale` | R2 (1.8 m) | 1.60 m | 56 px |
| **Gold** | `nat_ore_gold_` | `mat_ochre` | `#C9A06A` | `mat_stone_pale` | R3 (3.0 m) | 2.85 m | 99 px |

**Readability rule [PROPOSAL]:** an ore deposit must never use the R1 (0.8 m) size class. At 45 m
an R1 is 24 px tall and its accent patch would be ~4 px — below the threshold at which colour can
carry the "this is ore" read (ADB §7 requires ore to be distinguishable by colour **and** silhouette).
The **R2 class is the minimum ore size**.

**Copper (`nat_ore_copper_a`)** — R2 body + one vein slab:

| Box | Slot | sx | sy | sz | cx | cy | cz | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | `mat_stone_pale` | 1.80 | 0.90 | 1.50 | 0.00 | 0.45 | 0.00 | R2 body box 1 — z spans [−0.75, 0.75], y [0, 0.90] |
| 2 | `mat_stone_pale` | 1.20 | 0.70 | 1.00 | 0.15 | 1.10 | −0.10 | R2 body box 2 |
| 3 | `mat_stone_pale` | 0.70 | 0.50 | 0.60 | −0.40 | 1.40 | 0.25 | R2 body box 3 |
| V1 | `mat_ore_copper` | **0.90** | **0.35** | **0.20** | 0.10 | 0.45 | **0.75** | Vein slab emerging from the +z face. z spans [0.65, 0.85]: overlaps the body by 0.10, protrudes 0.10. Visible accent face 0.90 × 0.35 = **0.32 m²** ≈ 13 % of the visible surface. |

**Gold (`nat_ore_gold_a`)** — R3 body + two vein slabs:

| Box | Slot | sx | sy | sz | cx | cy | cz | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | `mat_stone_pale` | 3.00 | 1.40 | 2.40 | 0.00 | 0.70 | 0.00 | R3 body box 1 — x [−1.50, 1.50], z [−1.20, 1.20], y [0, 1.40] |
| 2 | `mat_stone_pale` | 1.80 | 1.00 | 1.40 | 0.30 | 1.80 | −0.20 | R3 body box 2 |
| 3 | `mat_stone_pale` | 1.10 | 0.90 | 0.90 | −0.60 | 2.40 | 0.40 | R3 body box 3 |
| 4 | `mat_stone_pale` | 0.60 | 0.50 | 0.55 | 0.90 | 2.20 | −0.70 | R3 body box 4 |
| V1 | `mat_ochre` | **1.30** | **0.45** | **0.20** | −0.20 | 0.75 | **1.15** | Vein emerging from the +z face. z spans [1.05, 1.25]: overlaps 0.15, protrudes 0.05. Visible accent face 1.30 × 0.45 = **0.59 m²**. |
| V2 | `mat_ochre` | **0.20** | **0.45** | **1.10** | **1.45** | 0.80 | −0.10 | Vein emerging from the +x face. x spans [1.35, 1.55]: overlaps 0.15, protrudes 0.05. Fully inside body box 1's y range [0, 1.40], so it never hangs in the air. Visible accent face 0.45 × 1.10 = **0.50 m²**. |

Total gold accent ≈ 1.09 m² of a ≈ 6.6 m² visible surface = **16 %** ✓ (10–25 % band).

**Vein construction rules:**
- A vein is a **thin slab, 0.20 m thick**, lying against one face of the body: its broad face is
  parallel to the rock face it emerges from, and it **protrudes 0.05–0.10 m** out of the rock.
  It is never a face recolour and never a large patch.
- The vein **overlaps** the body by **0.10–0.15 m** on the face normal, so it is bonded to the rock
  and never floats (guide §2.2 G8).
- The vein's other four faces are **inside** the body, so the vein has no coplanar face with the
  rock it emerges from. There is no z-fighting.
- Veins are **never** magenta/violet emissive.
- The accent occupies **10–25 %** of the deposit's visible surface. Below 10 % it will not read at
  45 m; above 25 % the deposit stops looking like stone.
- A deposit carries **one accent slot only** — never two. Copper is copper, gold is gold.
- Vein count: copper 1, gold 2 (the larger, rarer deposit gets the richer read).

### 5.3 Ore state rules

| State | Sim state | Rule |
|---|---|---|
| **Full** | `full` | Body as authored; all vein slabs present at full size. Accent area 10–25 %. |
| **Partial** | `partial` | **One** vein slab removed (of two, gold loses V2) and the body loses its smallest box (copper: box 3; gold: box 4). Accent area falls to 4–12 %. |
| **Depleted** | `depleted` | **All vein slabs removed** and the body is reduced to the R×-depleted composition for its size class (§4.3). |

**Absolute rule:** a depleted deposit contains **zero** saturated accent colour. This is what makes
"colour = ore, no colour = spent" a rule the player can learn (ADB §7). A depleted copper deposit
is *not* a grey rock — it is a rock with no colour on it, and the player learns to read absence.

**Resource type:** `ore` for all three states.

---

## 6. Silhouette read at 45 m

The camera reference (ADB §4): perspective, **38° vertical FOV**, distance **45 m**, pitch 40°,
yaw 45°. Frame height at the target plane:

```
2 × 45 × tan(19°) = 30.99 m   → 30.99 m over 1080 px  =  34.8 px per metre (height)
frame width at 16:9 = 30.99 × 16/9 = 55.1 m  →  19.6 px per metre (width)
```

| Asset | Height (m) | Screen height @45 m | % of frame height | Silhouette read |
|---|---|---|---|---|
| T1 Spire | 8.50 | 296 px | 27.4 % | A narrow vertical spike with a small stepped crown on a long bare stem. Unmistakable. |
| T2 Table | 6.15 | 214 px | 19.8 % | A wide, flat, slightly domed bar on a short stem. The opposite of T1. |
| T3 Cluster | 6.60 | 230 px | 21.3 % | A lumpy clump with two outboard lobes; the only silhouette that is not a single mass. |
| G1 Shrub | 1.50 | 52 px | 4.8 % | A small dark bun on the ground plane. Reads as undergrowth. |
| T1 partial | 4.00 | 139 px | 12.9 % | A bare stem with a bright cap, and a pink mass lying on the ground beside it. Reads as *cut down*. |
| T1 stump | 0.70 | 24 px | 0.8 % | A small square nub. Found by position, not by silhouette. |
| R1 rock | 0.70 | 24 px | 0.8 % | A low stepped pebble. Only reads in a group. |
| R2 rock | 1.60 | 56 px | 5.2 % | A stepped mound with a visible notch. Reads as stone. |
| R3 rock | 2.85 | 99 px | 9.1 % | A broad mass with an off-axis spire. Reads as a landmark. |
| Ore copper | 1.60 | 56 px | 5.2 % | R2's silhouette **plus a rust-coloured vertical vein** — the colour is the difference, which is why R2 is the minimum ore size. |
| Ore gold | 2.85 | 99 px | 9.1 % | R3's silhouette plus two ochre veins. |

**Distinctness check at 45 m [PROPOSAL]:**
- Wood vs stone: wood is a **tall thin vertical with a canopy mass on top**; stone is a **low
  wide mound**. A tree's silhouette has a void under the canopy; a rock's does not.
- Ore vs stone: same silhouette family, different **accent hue** — permitted by ADB §7 only because
  the accent is a *saturated* colour on a *pale* body. Never use magenta (N9).
- T1 vs T2 vs T3: aspect ratios 2.02 / 1.04 / 1.52 — the 25 % separation rule in §2.1.
- Standing vs partial vs stump: **height bands do not overlap** — standing 6.15–8.50 m, partial
  3.20–4.00 m, stump 0.60–0.80 m. The partial state also carries a **pink mass on the ground**
  that no other state has, which is the loudest cue of all.

---

## 7. Colour rules and the Q-001 pink swap

### 7.1 Palette-only rule

Every colour in this sheet comes from the ADB/REF-001 palette. No new hues are introduced. The
sheet names colours by **slot**, never by hex in the geometry tables, so a palette edit propagates
without touching geometry.

### 7.2 Reserved colours — hard prohibitions

| Colour | Hex | Prohibition |
|---|---|---|
| Emissive magenta / violet | `#C24BEF` | **Never** on a plant, a rock, an ore vein, or any natural asset. Reserved for effects (ADB §6, REF-001 §7, N9). A glowing tree or glowing ore is an instant rejection. |
| Violet shadow stone | `#B9AECB` | **Never** a material. Shadow is the light rig's job (guide §4.3). A rock must be one flat colour; its shadowed faces darken because of the hemisphere fill. |
| Blue | — | The palette has no blue for foliage or stone. Water deep `#1E2A4A` is water-only. |

### 7.3 The Q-001 pink swap — designed for, not retrofitted

**Q-001 asks:** is pink the dominant foliage, or an accent within a green-dominant forest?
(Decision Log, open decisions.)

**Design rule: no foliage geometry in this sheet encodes a hue.** Canopy boxes reference
`mat_foliage_primary` / `mat_foliage_cream` / `mat_ochre`. Nothing in §2 records "pink".

**Therefore, if the owner resolves Q-001 toward green, the change is one palette edit and zero
geometry edits:**

| Owner decision | Palette change | Geometry change | Asset ID change |
|---|---|---|---|
| Keep pink dominant | `mat_foliage_primary = #F0A8BE` (today) | **none** | **none** |
| Green-dominant forest | `mat_foliage_primary = #6E8F46` **[PROPOSAL — olive-green, not grass green]** | **none** | **none** |

**Why the proposed green is `#6E8F46` and not the grass green `#8E9C57`:** the canopy must not be
the same value as the ground it stands on, or a tree at 45 m loses its silhouette against a clearing
and the forest stops reading as a forest (ADB §7: "Forest | clustered vertical trunks + canopy mass").
Measured with the sRGB relative-luminance formula
`Y = 0.2126 R + 0.7152 G + 0.0722 B` on linearised channels:

| Colour | Relative luminance Y | Separation from grass `#8E9C57` (Y = 0.302) |
|---|---|---|
| grass top `#8E9C57` | 0.302 | — |
| grass shadow `#6C7A44` | 0.175 | 42 % |
| **proposed canopy `#6E8F46`** | **0.234** | **22.5 % ✓** |
| proposed `mat_ground_foliage` `#6C7A44` | 0.175 | 42 % |

Required separation: **≥ 20 % relative luminance** between `mat_foliage_primary` and the terrain
grass top `#8E9C57`. `#6E8F46` clears it at 22.5 %. This is a **[PROPOSAL]** value — the actual
replacement hue needs an owner decision with the references on disk.

**If the owner resolves Q-001 toward green, three consequences must be handled in the same decision:**

1. **REF-001 §4 conflicts.** REF-001 §4 states "Green foliage appears only on the ground, never in
   canopies". A green canopy contradicts it. The sentence must be retired or rewritten in the same
   decision (logged as guide §9-C13). **[CONFLICT]**
2. **The shrub (G1) needs a second foliage slot.** Under a pink world, `mat_foliage_primary` on a
   shrub is consistent. Under a green world, a shrub in the same green as a canopy would blur tree
   and ground cover. Recommendation: add `mat_ground_foliage` `#6C7A44` (the grass-shadow value)
   and assign it to G1's boxes only — **a slot change, not a geometry change**. G1 is the only
   asset whose slots would differ.
3. **Cream and ochre foliage blocks survive.** `mat_foliage_cream` `#F2DDC4` and `mat_ochre`
   `#C9A06A` work as canopy variation under either hue, so the cream/ochre variation rules (V7, V8)
   need no change.

**A note on the shrub under pink:** the shrub is a *tree-scale ground element* with foliage, so
REF-001 §4's "green only on the ground" is arguably satisfied by the terrain's grass layer rather
than by the shrub. This reading is not settled; it is logged in §9.

### 7.4 Ore accent vs pink

`mat_ore_copper` `#B25A3F` is a warm red-brown; `mat_ochre` `#C9A06A` is a warm sand. Neither is
pink, and neither is in the foliage slot family, so a pink world and a green world both keep ore
legible. **No ore slot is affected by Q-001.**

---

## 8. Variation counts and the world-scale table

### 8.1 Authored variant counts

The world does not repeat one mesh. Each family is authored as N distinct variants; the per-instance
seed then jitters each variant further, so the world never shows two *identical* meshes.

| Family | Authored variants | Variant suffixes | Runtime jitter | Max identical-looking within a 20 m radius |
|---|---|---|---|---|
| T1 Spire | **4** | `_a` `_b` `_c` `_d` | Yes (V1–V9) | 3 |
| T2 Table | **4** | `_a` `_b` `_c` `_d` | Yes | 3 |
| T3 Cluster | **3** | `_a` `_b` `_c` | Yes | 3 |
| G1 Shrub | **3** | `_a` `_b` `_c` | Yes | 6 |
| R1 rock 0.8 | **3** | `_a` `_b` `_c` | Box offsets only, ±0.15 m | 5 |
| R2 rock 1.8 | **3** | `_a` `_b` `_c` | Box offsets only, ±0.25 m | 4 |
| R3 rock 3.0 | **3** | `_a` `_b` `_c` | Box offsets only, ±0.35 m | 3 |
| Ore copper | **2** | `_a` `_b` | Vein face + offset | 2 |
| Ore gold | **2** | `_a` `_b` | Vein faces + offset | 2 |
| **Total authored meshes** | **27** | | | |

**Variant differences** are *compositional*, not cosmetic:
- Tree variants differ in which canopy box is the cream one, how far the satellites are offset, and
  whether a satellite is present (V6). They are not colour swaps.
- Rock variants differ in box offsets and which side the small cap sits on.
- Ore variants differ in which face the vein is on and its exact position.

**Rock jitter rule [PROPOSAL]:** rocks are jittered by **offset only** — never resized, never
re-boxed — because a rock's size class is its gameplay meaning. A "0.8 m rock" that jitters to
1.1 m breaks the size contract. Trees are jittered in size and offset because their exact height is
not a gameplay contract.

### 8.2 Species mix for the first world

**[PROPOSAL]** — the mix is GLM's to change, but the art side constrains it:

| Family | Share of tree instances | Reason |
|---|---|---|
| T1 Spire | 30 % | The tallest, most vertical silhouette — carries the forest's vertical rhythm |
| T2 Table | 35 % | The widest silhouette — carries the forest's mass |
| T3 Cluster | 25 % | The only lumpy silhouette — breaks up the two dominant reads |
| G1 Shrub | 10 % | Ground texture at human scale |

A forest must read as **clusters with clear ground between them**, never a dense uniform field
(REF-001 §4). Recommended cluster: **5–11 trees of mixed species within a 6–12 m radius**, with a
minimum 3 m gap between clusters. This is a placement rule and therefore GLM's to implement
(`Voxel_Style_Guide.md` §5) — this sheet states the constraint, not the algorithm.

### 8.3 Resource mapping summary

| Asset family | Resource type | Max yield per node [PROPOSAL] | Notes |
|---|---|---|---|
| T1 Spire (standing) | `wood` | 12 | |
| T2 Table (standing) | `wood` | 12 | |
| T3 Cluster (standing) | `wood` | 10 | |
| G1 Shrub (standing) | `wood` | 3 | Minor; shrubs are not a wood source in bulk |
| Tree `_partial` | `wood` | 3–6 (25–50 %) | |
| Tree `_stump` | `wood` | 0 | Node is removed |
| R1 rock (0.8 m) | `stone` | 2 | Only in clusters of 4–9 = one node |
| R2 rock (1.8 m) | `stone` | 8 | Default stone node |
| R3 rock (3.0 m) | `stone` | 16 | |
| Rock `_depleted` | `stone` | 0 | Node is removed |
| Ore copper | `ore` | 10 | |
| Ore gold | `ore` | 18 | Rarer, larger |

Yield numbers are **[PROPOSAL]** — the economy is not designed yet (GDD §5, milestone 3). They are
listed so the art and the economy can be sized against each other, not as a balance decision.

---

## 9. Naming, metadata and file layout

### 9.1 Asset IDs

Per `Asset_Naming_Conventions.md`: `nat_<species>_<state>`, lowercase `snake_case`, ASCII.

| Asset | File stem | Code ID (camelCase) |
|---|---|---|
| T1 standing | `nat_tree_spire_a` | `treeSpireA` |
| T1 partial | `nat_tree_spire_a_partial` | `treeSpireAPartial` |
| T1 stump | `nat_tree_spire_a_stump` | `treeSpireAStump` |
| T2 standing | `nat_tree_table_a` | `treeTableA` |
| T3 standing | `nat_tree_cluster_a` | `treeClusterA` |
| Shrub | `nat_shrub_a` | `shrubA` |
| R1 rock | `nat_rock_small_a` | `rockSmallA` |
| R1 depleted | `nat_rock_small_a_depleted` | `rockSmallADepleted` |
| R2 rock | `nat_rock_medium_a` | `rockMediumA` |
| R3 rock | `nat_rock_large_a` | `rockLargeA` |
| Ore copper | `nat_ore_copper_a` | `oreCopperA` |
| Ore gold | `nat_ore_gold_a` | `oreGoldA` |

**Deliberate deviation from the conventions doc.** The example `nat_tree_pink_a` encodes the
colour *pink* in the species name. **This sheet does not encode colour in any asset ID**, because
Q-001 may change the foliage hue and `Asset_Naming_Conventions.md` §1 says "Never rename an approved
asset". Species are named for their **silhouette** (`spire`, `table`, `cluster`) instead. The
conventions doc lists `nat_tree_pink_a` as a *pattern*, not a mandate. Flagged for DeepSeek's
approval in §10-U7.

**State suffixes:** `_partial` (partially harvested), `_stump` (stump), `_depleted` (rock/ore).
The standing state takes no suffix.

### 9.2 Required metadata (`<stem>.json`)

```json
{
  "id": "nat_tree_spire_a",
  "system": "nat",
  "version": 1,
  "resource": "wood",
  "states": ["full", "partial", "depleted"],
  "height": 8.5,
  "canopyWidth": 4.2,
  "boxes": 5,
  "materials": ["mat_bark_dark", "mat_foliage_primary", "mat_foliage_cream"],
  "author": "mimo",
  "status": "review_required",
  "source": "05_Noxel_Studio/Asset_Sheets/AS-001_natural_assets.md"
}
```

`resource` is one of `'wood' | 'stone' | 'ore'` (matching `ResourceType` in Technical Architecture
§3). `boxes` is the authored box count before jitter.

### 9.3 File layout

| Kind | Location |
|---|---|
| This sheet | `05_Noxel_Studio/Asset_Sheets/AS-001_natural_assets.md` |
| Authored mesh source (parametric definitions) | `Game/src/data/natural/` — the tables in §2–§5 are the source of truth; a JSON/TS module should mirror them exactly |
| Exported GLB | `Game/assets/nat/` |
| Runtime placement | `Game/src/render/` (mesh) + `Game/src/sim/` (node state) |

**Recommended implementation [PROPOSAL]:** the meshes are **generated at load time** from the box
tables rather than exported as 27 GLBs. The data is small (5–7 boxes per asset), deterministic
(D-006), and the same box list drives the hit-test, the LOD and the harvest state. Exporting GLBs
is still supported by the naming conventions if the team prefers binary assets.

---

## 10. Unresolved / needs owner or REF revision

| ID | Item | Status / who | Why it matters | Interim handling |
|---|---|---|---|---|
| **U1** | **The reference images are not on disk.** REF-001 is the only source, and its palette is explicitly "approximate — sampled by eye, to be locked numerically" (REF-001 §8). | **Blocked on owner** (files into `05_Noxel_Studio/Reference_Images/`). | Every hex and every proportion in this sheet may shift after a real sampling pass. | All hexes are provisional and live in one palette module. Nothing in the geometry is hue-locked (§7.3). |
| **U2** | **[CONFLICT] Q-001 — pink vs green-dominant foliage.** | **Owner.** | Decides `mat_foliage_primary`'s hex and whether the shrub needs a separate ground-foliage slot (§7.3). | Geometry is authored against slots, so the answer changes **no mesh**. |
| **U3** | **[CONFLICT] REF-001 §4 "Green foliage appears only on the ground, never in canopies" vs a green canopy.** | **Owner + DeepSeek.** | A green canopy contradicts REF-001's own vegetation paragraph. | Logged also as guide §9-C13; the reference text must be amended in the same decision if Q-001 goes green. |
| **U4** | **No saturated "ore" colour exists in the palette except the strata rust and ochre.** ADB §7 wants "one saturated accent colour" for ore; `#B25A3F` (strata red-brown) and `#C9A06A` (strata ochre) are the only candidates, and both are terrain-strata values. | **Needs owner ruling.** | If ore reuses a strata colour exactly, a player might confuse an ore vein with a terrain strata band (ADB §7: a red-brown band means *steep ground*). | Copper `#B25A3F` is proposed but with the **geology cue** to carry the read (bare pale stone body, no grass cap), not the colour alone. A dedicated ore hue may be needed. |
| **U5** | **`mat_ochre` vs `mat_strata_ochre` — one hex, two slot ids.** | **Needs DeepSeek (palette module).** | Two ids with one hex invites drift (ADB §2). | The palette module must resolve both to `#C9A06A`. |
| **U6** | **The shrub's slot under a pink world.** REF-001 §4's "green only on the ground" is ambiguous for a shrub. | **Owner.** | Decides whether G1's boxes use `mat_foliage_primary` or a new `mat_ground_foliage`. | G1 currently uses `mat_foliage_primary`; adding `mat_ground_foliage` is a slot assignment change only. |
| **U7** | **Asset IDs deliberately omit the colour** (`nat_tree_spire_a`, not `nat_tree_pink_a`), deviating from the example in `Asset_Naming_Conventions.md` §2. | **Needs DeepSeek approval.** | `Asset_Naming_Conventions.md` §1 forbids renaming an approved asset; a colour-named ID would have to be renamed if Q-001 flips. | Silhouette-named IDs used throughout. |
| **U8** | **Ore minimum size class (R2 = 1.8 m) is my derivation, not a stated rule.** | **Needs a render check (Task 007/012).** | If an R1 ore deposit turns out to be legible at 45 m, small ore veins could be scattered more freely. | R1 is scenery only for now. |
| **U9** | **Depleted trees leave no debris and no foliage on the ground.** REF-001 §5 lists "displaced cubes lying on the ground" as *ruin* damage vocabulary, which the seed §5 forbids in the player's own architecture; the same logic applies to harvest. | **Needs owner ruling.** | If felled logs should accumulate as a visual record of the player's clearing, that is a new asset family, not a variant of this one. | Stumps are the only residue; the optional felled log (§3.3) is the exception. |
| **U10** | **The mix in §8.2 (30/35/25/10) and the yields in §8.3 are proposals.** | **GLM + DeepSeek.** | The economy is not designed (GDD §5). | Listed so art and economy can be sized together. |
| **U11** | **Whether trees may be placed on a slope steeper than flat.** | **GLM.** | A tree's base is buried 0.15 m (§1.1); on a 0.5 m terrain step that may leave a visible gap on the downhill side. | A larger bury depth (0.30 m) or a terrain skirt box may be needed; flagged for the first render. |
| **U12** | **No owl/fauna, ground cover, or flowers are specified here.** | **GLM / later task.** | REF-001 §3 mentions tiny scattered flowers as sub-0.15 m specks; those are terrain detail. | Explicitly out of scope (§0). |

---

## 11. Implementation checklist

A programmer can verify this sheet is fully implemented with:

1. Every asset in §2–§5 is built from the box list given, with the stated slot per box.
2. Box geometry uses **centre + full size**, origin at the footprint centre on the ground plane.
3. The whole asset is offset down **0.15 m** at placement.
4. Jitter follows V1–V9 and passes all seven clamps K1–K7; a tree that fails a clamp is regenerated
   with the next seed value, not clamped into a broken state.
5. Trees use `mulberry32` seeded from the world seed (D-006) — the same save regenerates the same
   forest.
6. A depleted rock or ore contains **no** saturated accent colour.
7. Ore never uses the R1 size class.
8. No natural asset uses `mat_emissive_magenta`, `mat_stone_pale_shadow`, or any texture map.
9. Every asset ships the `.json` metadata block from §9.2.
10. Foliage colour is applied **only** through palette slots, so changing `mat_foliage_primary`
    changes every plant in the world without touching a mesh.

---

**No images, meshes or renders were created in the production of this document.** It contains
written specifications, exact dimensions in metres, and parametric box data only.
