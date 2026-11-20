# Noxel Style Guide — v1.0

**Owner:** Mimo (Lead Noxel Artist) · **Status:** Review Required
**Supersedes:** `00_Project_Core/Noxel_Style_Guide.md` v0.1 (seed by DeepSeek) — the seed remains the
summary; this document is the implementable version.
**Traces to:** REF-001 (`04_Art_Director/Reference_Analysis/REF-001_Noxel_Reference_Analysis.md`),
ADB (`00_Project_Core/Art_Direction_Bible.md`), `Asset_Naming_Conventions.md`,
`Decision_Log.md` (D-003, D-008).

> **Provenance statement.** The owner's reference images are **not on disk** and were **not viewed**
> for this document. Every reference-derived claim below is cited to REF-001 by section and is
> therefore only as good as REF-001's own reading. Nothing in this guide claims to have analysed an
> image. Where this guide goes beyond REF-001 and the ADB it is tagged **[PROPOSAL]**. Where it
> contradicts REF-001 it is tagged **[CONFLICT]** and repeated in §9.

---

## 0. How to use this guide

| You are… | Read |
|---|---|
| a programmer building the kit loader | §2 (grammar), §3 (numbers), §5 (kit catalog), §7 (naming) |
| an artist authoring a building | §2 (grammar), §3 (proportion), §4 (colour), §6 (progression) |
| a reviewer checking an asset | §8 (three pass/fail tests) |
| the owner / orchestrator | §4 (colour policy), §6 (tier policy), §9 (open questions) |

**M1 scope reminder:** Milestone 1 is nature-only (ADB §2, GDD §3). This guide exists so that the
architecture pipeline is *specified in advance*, not built. No building in this document is designed;
only the **kit** is specified. Building architecture is a later task and is gated behind the world
(Task 030 depends on Tasks 004 and 013).

---

## 1. Definition and scope

A **Noxel** is a modular, axis-aligned, flat-shaded 3D form used to construct human-made
architecture and props. It is *not* a unit cube and it is *not* a voxel.

Three properties must all hold, or the look breaks (REF-001 §1):

1. **Axis-aligned rectangular massing** — every face parallel to X/Y/Z.
2. **Non-uniform block scale** — no single module size; a 9 m cliff and a 0.3 m step are both
   "a box".
3. **Aggressive flatness** — flat colour per material, no textures, no bump, no baked AO.

**In scope for this guide:** buildings, walls, stairs, posts, roofs, props, settlement assets.
**Out of scope:** terrain (GLM, `Voxel_Style_Guide.md`), trees/rocks/ore
(`05_Noxel_Studio/Asset_Sheets/AS-001_natural_assets.md`), water, wildlife.

**Noxels vs voxels:** Noxels are grid-*aligned* but not grid-*quantised* (ADB §2). They may use
proportions that do not fit a 1 m cell — but they must still land on the build grid where assembly
requires it (§2.5).

### 1.1 Hard non-negotiables (inherited)

| # | Rule | Source |
|---|---|---|
| N1 | No rotated boxes in architecture. Y-rotation only, in 90° steps. | ADB §3.1, REF-001 §1 |
| N2 | No bevels, chamfers, rounded corners. | ADB §3.2, REF-001 §1 |
| N3 | Flat colour. No image textures, no normal maps, no baked AO on architecture. | ADB §3.3 |
| N4 | Shadows are violet and come from the light rig, never from geometry. | ADB §3.4, §4.3 below |
| N5 | Sparse detail — decoration occupies well under 5 % of any surface. | ADB §3.6 |
| N6 | Silhouette first — identifiable as a black shape at gameplay distance. | ADB §3.7 |
| N7 | No uniform module — block sizes must be deliberately varied. | ADB §3.8, REF-001 §1 |
| N8 | One pale stone family; a second stone family needs a style-guide revision. | Seed §8, REF-001 §5 |
| N9 | Emissive magenta is reserved for effects. It is not an architectural material. | ADB §6, REF-001 §7 |
| N10 | No ruined architecture as the player's own work. | REF-001 §9, §6.3 below |

---

## 2. Geometry grammar

### 2.1 Element classes

A Noxel asset is a composition of **rectangular prisms** (volumes). Every volume is assigned exactly
one class. Classes are the vocabulary; they are not interchangeable.

| Class | Role | X/Z extent | Y extent | Count per asset | Notes |
|---|---|---|---|---|---|
| **Mass** | Primary volume — hall, tower shaft, wall run, roof block | 4–16 m | 3–12 m | 1–3 | The dominant read. At least one per asset. |
| **Slab** | Horizontal plane — floor, platform, stair tread, roof deck | any | 0.20–0.50 m | 0–4 | Thin. Never the only element of an asset. |
| **Post** | Vertical square-section member — pillar, pier, rib | 0.60–1.40 m square | 4–7 m | 0–6 | Section is square; the section is not arbitrary. |
| **Block** | Small applied detail — cap, nosing, corbel, parapet tooth | 0.15–0.60 m | 0.15–0.60 m | 0–12 | Never load-bearing. Never > 0.6 m in any axis. |

**Class assignment test (for review):** if a volume is thinner than 0.50 m in Y it is a Slab; if it
is thinner than 0.60 m in X and Z it is a Block; if it is square in plan and ≥ 4 m tall it is a Post;
anything else is a Mass. A volume may not be reclassified to escape a count limit.

### 2.2 Volume budget rules

| ID | Rule | Rationale |
|---|---|---|
| **G1** | A founder-tier asset declares **4–9 volumes** (all classes combined). Village tier 5–12, town tier 6–16. | Seed §2 caps masses at 2–4; the wider range lets a tier grow without changing the language. |
| **G2** | **1–3 Mass volumes** per asset. A mass may never be a single extruded box (exception: a one-room hut = 1 Mass + 1 Slab roof, max 2 volumes). | Seed §2 "never one extruded box (except a hut)". |
| **G3** | At least one volume must be **deliberately oversized or undersized** relative to the dominant volume by ≥ 25 % in its largest dimension, OR be a class strictly below the dominant class. | Seed §2, ADB §3.8, N7. This is the rule that kills the Minecraft read. |
| **G4** | **Off-axis rotation is forbidden.** All volumes are axis-aligned in world space. The only permitted rotation is a 90° multiple about Y applied to the *whole asset*. | ADB §3.1, N1. |
| **G5** | **Openings are rectangular voids** cut through the full thickness of the volume that carries them. No curved arches, no circles, no chamfers, no triangular voids. | REF-001 §5, seed §2. |
| **G6** | **Repetition cap.** No run of more than **7** identical repeats without a variation (one raised, one shortened, or one missing). Founder tier cap is **5**. | Seed §2. |
| **G7** | **Ground contact.** At least one volume must contact the ground plane (y = 0) over its full footprint. No volume may float unsupported. An overhang > 0.5 m requires a Post or Mass directly beneath it. | **[PROPOSAL]** — needed for the loader to reject invalid assemblies. |
| **G8** | **Joint rule.** Two volumes of one asset must either (a) **butt** — share a boundary plane with opposite-facing surfaces, the preferred joint — or (b) **overlap by ≥ 0.05 m** on at least one axis. A pair of **front-facing coplanar** faces over a shared area is forbidden: it z-fights. Whenever two volumes share a height band, either butt them or make their tops differ. | **[PROPOSAL]** — prevents z-fighting without forcing a strict boolean-union pipeline. |
| **G9** | **Quantisation.** Every volume dimension and every position coordinate is a multiple of **0.05 m**. Structural dimensions use the named values in §3 and are exact. | **[PROPOSAL]** — D-008's 0.5 m quantum is a *terrain* concept; Noxel detail is finer (0.15 m blocks, 0.3 m risers) and needs its own quantum. |
| **G10** | **One material per volume.** A volume is never split by material, and a face is never given a colour to simulate lighting. | Seed §4, §4.3. |
| **G11** | **Silhouette budget.** The asset's bounding box must have at least 2 distinct edge lengths, and the ratio of the longest to shortest edge must be **≥ 3:1**. | **[PROPOSAL]** — operationalises N6/N7 as a number. |

### 2.3 Opening rules (expanded)

| ID | Rule |
|---|---|
| O1 | Openings are rectangular voids through the full wall thickness. No reveal deeper than the wall. |
| O2 | Minimum opening **0.9 m** in both directions. Below that, use a Block recess, not a void. |
| O3 | Maximum single opening **3.0 m** wide without a structural Post interrupting the wall. |
| O4 | An opening may not sit closer than **0.6 m** to a wall end or to a corner pier. |
| O5 | A single wall panel may carry at most **3** openings. |
| O6 | **Vertical alignment:** openings in stacked storeys align on the same vertical plane (one 2 m grid line), producing a legible shaft of voids. Deliberate staggering is allowed only on civic/landmark assets. **[PROPOSAL]** |
| O7 | Openings have **no frame, no moulding, no projecting sill and no projecting lintel** at founder tier. The lintel is flush with the wall face. |
| O8 | A door opening starts at finished floor level (no step). A window opening has its sill at 1.0 m above finished floor. |
| O9 | Openings are centred on the midpoint of the wall piece that carries them. |
| O10 | Any door or window may be **filled** with a timber leaf/shutter, but a filled opening still counts as an opening for the geometry budget. |

### 2.4 Off-axis prohibition — practical consequences

- No volume may be sheared, tapered, twisted, or given a non-uniform scale after placement.
- A "leaning" or "tilted" read must be produced by **offsetting a whole group of volumes**, never by rotating them (this is exactly how the natural assets in AS-001 express variation).
- A tapered, branchy, curved or twisted silhouette is impossible in a Noxel by design. Organic
  *readings* are produced by clustering and offsetting boxes — which is exactly how the natural
  assets in AS-001 are built — but never by deforming a box.

### 2.5 Grid, anchoring and snapping

The build grid is **2 m** (D-008). A Noxel asset is placed on that grid but is *not* quantised to it.

**Two anchor types** — the kit needs both because a 0.6 m wall and a 1.2 m post cannot both be
2 m multiples:

| Anchor | Used by | Rule |
|---|---|---|
| **Edge-anchored** | walls, roofs, foundations, landings, stairs | The piece's **outer faces** lie on build-grid lines. A wall's outer footprint is therefore an exact multiple of 2 m. |
| **Node-anchored** | posts | The piece's **centre** lies on a build-grid node (x, z both multiples of 2 m), or on a 2.0 m-pitch row offset by 0.0 / 0.6 / 1.2 m from a referenced wall face. Node-anchored and edge-anchored pieces are never mixed inside one row. |

**Local space of every kit piece:** origin at the **centre of its footprint, on its underside** (y = 0).
Positive +X is the piece's "length" direction, +Y is up, +Z is the piece's "thickness" direction.
Yaw is applied to the whole piece in 90° steps.

**Grid compliance test:** after assembly, measure the building's **outer footprint** (outer wall face
to outer wall face). It must be an exact multiple of 2 m on each axis, and its outer faces must lie
on build-grid lines. Interior pieces (stair runs, posts, landings) are exempt — see §5.4.

---

## 3. Dimension table

All values in metres. 1 unit = 1 m, Y-up, right-handed (ADB §5). Human = 1.7 m.

### 3.1 Vertical

| Item | Value | Note |
|---|---|---|
| Standard storey (floor-to-floor) | **3.2** | Seed §3. All storeys are the same unless stated. |
| Tall-hall storey | **4.8** | 1.5 × standard. At most **one** per building. |
| Mezzanine floor-to-floor | **2.0** | Only over a Mass that is not the tallest. |
| Roof parapet height | **0.3** | Above roof deck. |
| Roof deck thickness | **0.4** | Slab class. |
| Foundation step rise | **0.3** | Matches the stair riser so the plinth reads as the same module. |
| Foundation platform thickness | **0.4** | |
| Finished floor level (FFL) above grade, standard foundation | **0.7** | 0.3 step + 0.4 platform. |
| Door opening height | **2.2** | |
| Door head / lintel top | **2.6** | Lintel is 0.4 tall. |
| Window opening height | **1.4** | |
| Window sill above FFL | **1.0** | Window head at 2.4. |
| Corner pier rise above wall top | **0.0** | The pier's mass is expressed in plan (1.2 m vs 0.6 m), not in height. |

### 3.2 Plan / linear

| Item | Value | Note |
|---|---|---|
| Load-bearing wall thickness | **0.6** | |
| Parapet / non-load-bearing wall thickness | **0.3** | |
| Monumental rib projection | **0.5** | REF-001 §5 vertical-rib motif; village/town only. |
| Post section | **1.2 × 1.2** | Square. Range 0.6–1.4 permitted; 1.2 is the founder default. |
| Post height : section ratio | **4:1 – 7:1** | Beyond 7:1 a post requires a base block or a cap block. Seed §3. |
| Post height (founder) | **4.8** | 4.0:1 at a 1.2 section. |
| Post cap block | **1.6 × 1.6 × 0.3** | Overhangs the shaft by 0.2 on each side. |
| Post row pitch | **2.0** | Along a colonnade. |
| Stair riser | **0.3** | **Fixed.** |
| Stair tread (going) | **0.9** | **Fixed.** |
| Stair width | **2.0** (multiple of 2) | |
| Stair steps (founder) | **4, 6, 9** | Rise 1.2 / 1.8 / 2.7. Going 3.6 / 5.4 / 8.1. |
| Landing | **2.0 × 2.0 × 0.3** | Terminates a stair on the grid. |
| Minimum building footprint | **4.0 × 4.0** | Two grid cells. |
| Minimum clear internal dimension | **2.8** | 4.0 external − 2 × 0.6 wall. |
| Minimum door clearance for a 1.7 m human | **1.2 wide × 2.2 high** | With headroom to the lintel. |

### 3.3 Derived ratios and bands

| Ratio | Band | Source |
|---|---|---|
| Tallest element : footprint short side | **1.5 : 1 – 4 : 1** | Seed §3 |
| Tallest element : human height | **3 : 1 – 5 : 1** (5.1–8.5 m) | REF-001 §5 |
| Architect (architectural piece) : human height | **3.5 : 1 – 7 : 1** | **[PROPOSAL]** — spans founder (7.1 m = 4.2:1) to town civic (24 m = 14:1, over; cap at 12 m = 7:1 for a single architect element) |
| Canopy/roof span : post section (if roofed) | not applicable in M1 | M1 has flat parapet roofs only. |
| Repeats before a variation is required | **5** (founder) / 7 (village, town) | Seed §2 |
| Volumes per asset | 4–9 / 5–12 / 6–16 | G1 |

### 3.4 Progression bands by tier

| Property | Founder | Village | Town |
|---|---|---|---|
| Storeys | 1 tall-hall or 2 standard | 2–3 standard | 3–5 standard |
| Tallest point above grade | 5.1–8.5 m | 8.5–13 m | 13–24 m |
| Volumes per asset (G1) | 4–9 | 5–12 | 6–16 |
| Mass volumes (G2) | 1–2 | 1–3 | 2–3 |
| Distinct accent materials in the settlement | 2 | 2 | 2 |
| Accent surface budget per asset | ≤ 5 % | ≤ 8 % | ≤ 10 % |
| Material IDs per asset | ≤ 3 | ≤ 4 | ≤ 4 |
| Repeats before variation (G6) | 5 | 7 | 7 |
| Footprint minimum | 4 × 4 m | 6 × 6 m | 8 × 8 m |

---

## 4. Material families

### 4.1 Palette (ADB §7, REF-001 §8)

Hex values are **eye-sampled approximations** in REF-001 §8 and are flagged there as "to be locked
numerically". They are the working values for implementation. **[PROPOSAL]** where a value is
mine.

| Material ID | Family | Hex | Founder | Village | Town | Use |
|---|---|---|---|---|---|---|
| `mat_stone_pale` | Stone | `#EDE4D6` | ✓ | ✓ | ✓ | The only structural stone. Every mass, wall, post, stair, roof. |
| `mat_stone_pale_shadow` | — | `#B9AECB` | **✗ forbidden** | ✗ | ✗ | **Measurement target only — [CONFLICT] with REF-001 §8.** See §4.3 and §9-C1. |
| `mat_timber_dark` | Timber | `#5B3A38` | ✓ (≤ 20 %) | ✓ | ✓ | Door leaves, shutters, benches, well hardware, handrail-free trim. Never a Mass. |
| `mat_accent_ochre` | Accent | `#C9A06A` | ✓ | ✓ | ✓ | Trim, thresholds, floor inlay, stair nosing. |
| `mat_accent_ivory` | Accent | `#F2DDC4` | ✓ | — | ✓ | Parapet caps, highlight bands on horizontal edges. |
| `mat_accent_rust` | Accent | `#B25A3F` | — | ✓ (restricted) | ✓ (restricted) | Horizontal faces only, ≤ 5 % of a building's visible surface. Never on a vertical face (see §4.2 R4). |
| `mat_accent_rose` | Accent | `#F0A8BE` | — | — | — | **Reserved** pending Q-001. Not unlocked by default. |
| `mat_emissive_magenta` | Emissive | `#C24BEF` | ✗ | ✗ | ✗ | **Effects only.** Never a building material. (ADB §6, REF-001 §7) |

### 4.2 Co-occurrence rules

| ID | Rule |
|---|---|
| R1 | A single asset uses **at most 3 material IDs** at founder tier, 4 at village/town. |
| R2 | `mat_stone_pale` is present in every structural asset. An asset with no stone is a prop, not a building. |
| R3 | `mat_timber_dark` covers **≤ 20 %** of an asset's visible surface and never forms a Mass. Maximum timber volume extent: 2.0 m in any axis. |
| R4 | `mat_accent_rust` may appear **only on horizontal faces** (tops of slabs, sills, landings) and only where it cannot be mistaken for a terrain strata band (ADB §7: a visible red-brown band means *steep ground*). Budget: ≤ 5 % of the building's visible surface. |
| R5 | Accent families in use at any one time across a settlement: **exactly 2 maximum** (seed §4). The tier table in §4.1 shows which two are unlocked. |
| R6 | Any single asset uses **at most 1 accent family** at founder tier; at most 2 at village/town (the settlement-wide limit of 2 still applies). |
| R7 | A second stone family is forbidden without a style-guide revision (N8, seed §8). "Ivory" and "ochre" are *accents*, not a second stone family: they may never form a Mass. |
| R8 | No emissive material on any architecture. Emissive is a scene effect (ADB §6). |
| R9 | Wear is expressed as *a different material on 5–10 % of blocks*, never as texture, never as a second colour on one block (seed §4). Founder-tier player buildings have **no wear at all** (see §6.3). |

### 4.3 "Shadow is light's job, never painted into geometry"

This is the single most important material rule in the guide.

1. **Materials are assigned by material identity only** — stone, timber, accent. A material is never
   chosen because of which way a face points or which way the sun is shining.
2. **A single asset never contains two versions of the same family for lighting reasons.** There is
   no `mat_stone_pale_sun` / `mat_stone_pale_shade` pair. There is only `mat_stone_pale`.
3. The palette value `#B9AECB` (REF-001 §8 "Shadow stone") and `#6E6796` (dusk) are **render
   targets, not swatches**. If a sunlit-stone face and a shadowed-stone face are to land on those
   values, the fix is in the light rig (sun elevation 30°, hemisphere sky `#CFC6F0` / ground
   `#6B7350` at 0.55, ADB §6) — never in the mesh.
4. **No vertex colour on architecture.** Vertex colour is permitted on *terrain* for the strata
   bands (Technical Architecture §4) and on *water* for depth tint. Never on a Noxel.
5. **No baked AO, no ambient-occlusion vertex colours, no gradient textures** (N3).
6. **Test:** render the asset twice — once with the sun disabled (hemisphere only) and once with the
   full ADB rig. Every material ID must be identical between the two renders. If any material ID
   changes, shadow has been painted in. This is Test Case 3 in §8.

### 4.4 Accent budget — where accents may appear

Accent is not decoration sprayed over a building. Permitted accent locations at founder tier:

- Stair nosing band (0.10 m strip on each tread's leading edge).
- Door threshold (0.30 × 1.20 m slab in the opening).
- Floor inlay panel (a flush 0.10 m recessed rectangle in a Slab floor).
- Parapet cap band (0.10 m on the top edge of a parapet).

Forbidden accent locations: large vertical wall fields, whole roofs, any surface a viewer would
read as terrain (see R4).

---

## 5. Modular kit — FOUNDER tier

### 5.1 Kit rules

- One shared **2 m module**; every piece declares footprint, height, snap faces, material slot.
- Every piece is a pure rectangular volume composition — **no baked-in detail, no decoration, no
  damage**. The founder kit is the "clean" language (seed §5).
- A piece's material slot is declared once. A piece may not introduce a second material by default.
- Piece IDs follow `nox_<family>_<piece>_<size>` (§7).

### 5.2 Piece catalog

| Piece | ID | Footprint X×Z (m) | Height (m) | Volumes | Snap faces | Material slot | Silhouette note (one line) |
|---|---|---|---|---|---|---|---|
| Foundation | `nox_foundation_4x4` | 6.0 × 6.0 overall (platform 4.0 × 4.0) | 0.7 | 2 | bottom, ±x, ±z | `mat_stone_pale` | A shallow two-step plinth; grounds the mass, never floats. |
| Wall, straight (primary) | `nox_wall_straight_4m` | 4.0 × 0.6 | 3.2 | 1 | ±x | `mat_stone_pale` | A 6.7:1 horizontal bar; reads as a wall run, never a cube. |
| Wall, straight (short) | `nox_wall_straight_2m` | 2.0 × 0.6 | 3.2 | 1 | ±x | `mat_stone_pale` | Same rhythm, half length; the piece that lets runs land on the grid. |
| Wall, corner | `nox_wall_corner_4x4` | 4.0 × 4.0 (L) | 3.2 | 3 | 4 arm ends | `mat_stone_pale` | An L in plan with a heavier square pier at the corner. |
| Wall, doorway | `nox_wall_doorway_2m` | 2.0 × 0.6 | 3.2 | 4 | ±x | `mat_stone_pale` (+ optional `mat_timber_dark` leaf) | One tall rectangular void — the only void in the founder kit. |
| Wall, window | `nox_wall_window_2m` | 2.0 × 0.6 | 3.2 | 4 | ±x | `mat_stone_pale` (+ optional `mat_timber_dark` shutter) | A pierced panel with the void sitting above the mid-line. |
| Post | `nox_post_1p2` | 1.2 × 1.2 | 4.8 | 1 | 4 vertical (node-anchored) | `mat_stone_pale` | A 4:1 needle; the tallest thin element in the kit. |
| Post, capped | `nox_post_capped_1p2` | 1.2 × 1.2 | 5.1 | 2 | 4 vertical, +y | `mat_stone_pale` | A needle with a 0.2 m hat brim; the only overhang in the kit. |
| Stair run (6) | `nox_stair_run_6` | 5.4 × 2.0 | 1.8 (rise) | 6 | −x (lower), +x (upper) | `mat_stone_pale` (+ optional `mat_accent_ochre` nosing) | A stepped wedge of six equal steps; the 0.3/0.9 rhythm is the signature. |
| Roof, flat + parapet | `nox_roof_flat_parapet_4x4` | 4.0 × 4.0 | 0.7 | 5 | ±x, ±z (at wall-top level) | `mat_stone_pale` | A shallow tray with a thin lip; reads as a flat roof edge, never a pitched roof. |
| Landing (support) | `nox_landing_2x2` | 2.0 × 2.0 | 0.3 | 1 | ±x, ±z | `mat_stone_pale` | A flush tile that closes a stair run onto the grid. |

Variants of `nox_stair_run`: `_4` (rise 1.2, going 3.6) and `_9` (rise 2.7, going 8.1). All three
share the fixed 0.3 / 0.9 geometry.

### 5.3 Per-piece geometry

**`nox_foundation_4x4`** — 2 volumes.
| V | Size X×Y×Z | Centre (x,y,z) | Slot |
|---|---|---|---|
| 1 | 6.0 × 0.3 × 6.0 | (0, 0.15, 0) | `mat_stone_pale` |
| 2 | 4.0 × 0.4 × 4.0 | (0, 0.50, 0) | `mat_stone_pale` |
FFL = **0.70**. The 1.0 m band between the 6.0 and 4.0 footprints is the visible step.

**`nox_wall_straight_4m`** — 1 volume: 4.0 × 3.2 × 0.6 at (0, 1.60, 0).
`nox_wall_straight_2m` — 1 volume: 2.0 × 3.2 × 0.6 at (0, 1.60, 0).
Local +Z is the outer face; the piece is placed with its outer face on a grid line.

**`nox_wall_corner_4x4`** — 3 volumes, L in plan, outer corner at the local origin. The volumes
**butt** (G8a): the pier's faces meet the arms' end faces, so no front-facing coplanar pair exists.
| V | Size X×Y×Z | Centre | Note |
|---|---|---|---|
| 1 (pier) | 1.2 × 3.2 × 1.2 | (0.6, 1.60, 0.6) | The deliberate oversized element (G3). Spans x[0, 1.2], z[0, 1.2]. |
| 2 (arm +x) | 2.8 × 3.2 × 0.6 | (2.6, 1.60, 0.3) | Spans x[1.2, 4.0], z[0, 0.6]. |
| 3 (arm +z) | 0.6 × 3.2 × 2.8 | (0.3, 1.60, 2.6) | Spans x[0, 0.6], z[1.2, 4.0]. |
Outer faces lie on x = 0 and z = 0; the arm ends land on x = 4.0 and z = 4.0 — **all build-grid
lines**. Plan footprint 4.0 × 4.0. Height 3.2. The pier projects 0.6 m further into the room than
the arms, which is the intended silhouette break.

**`nox_wall_doorway_2m`** — 4 volumes, opening 1.2 w × 2.2 h centred on the piece midpoint:
| V | Size X×Y×Z | Centre |
|---|---|---|
| 1 (jamb −x) | 0.4 × 3.2 × 0.6 | (−0.8, 1.60, 0) |
| 2 (jamb +x) | 0.4 × 3.2 × 0.6 | (0.8, 1.60, 0) |
| 3 (lintel) | 1.2 × 0.4 × 0.6 | (0, 2.40, 0) | — spans y 2.2 → 2.6, flush with the wall face |
| 4 (header) | 1.2 × 0.6 × 0.6 | (0, 2.90, 0) | — spans y 2.6 → 3.2 |
Optional timber leaf: 1.15 × 2.15 × 0.08 at (0, 1.075, 0.26), set 0.05 m back from the outer face.

**`nox_wall_window_2m`** — 4 volumes, opening 1.2 w × 1.4 h, sill at 1.0:
| V | Size X×Y×Z | Centre |
|---|---|---|
| 1 (jamb −x) | 0.4 × 3.2 × 0.6 | (−0.8, 1.60, 0) |
| 2 (jamb +x) | 0.4 × 3.2 × 0.6 | (0.8, 1.60, 0) |
| 3 (sill panel) | 1.2 × 1.0 × 0.6 | (0, 0.50, 0) |
| 4 (header) | 1.2 × 0.8 × 0.6 | (0, 2.80, 0) | — spans y 2.4 → 3.2 |
No frame, no projecting sill (O7, REF-001 §5 "no windows with frames").
Optional timber shutter: 1.15 × 1.35 × 0.06 at (0, 1.70, 0.27).

**`nox_post_1p2`** — 1 volume: 1.2 × 4.8 × 1.2 at (0, 2.40, 0). Ratio 4.0:1.
Node-anchored: centre on a build-grid node.

**`nox_post_capped_1p2`** — 2 volumes:
| V | Size | Centre |
|---|---|---|
| 1 (shaft) | 1.2 × 4.8 × 1.2 | (0, 2.40, 0) |
| 2 (cap) | 1.6 × 0.3 × 1.6 | (0, 4.95, 0) | — overhangs 0.2 per side; total height 5.10 |

**`nox_stair_run_6`** — 6 volumes, solid (no open riser):
| V | Size X×Y×Z | Centre |
|---|---|---|
| 1 | 0.9 × 0.3 × 2.0 | (0.45, 0.15, 0) |
| 2 | 0.9 × 0.6 × 2.0 | (1.35, 0.30, 0) |
| 3 | 0.9 × 0.9 × 2.0 | (2.25, 0.45, 0) |
| 4 | 0.9 × 1.2 × 2.0 | (3.15, 0.60, 0) |
| 5 | 0.9 × 1.5 × 2.0 | (4.05, 0.75, 0) |
| 6 | 0.9 × 1.8 × 2.0 | (4.95, 0.90, 0) |
Riser 0.3, tread 0.9, width 2.0, total rise 1.8, total going 5.4, footprint 5.4 × 2.0.
Lower edge at y = 0 (floor level), upper edge at y = 1.8 (floor level of the storey above).
Optional accent nosing: 0.10 × 0.03 × 2.0 strip on the leading edge of each tread.

**`nox_roof_flat_parapet_4x4`** — 5 volumes. The deck is inset and the parapet ring forms the
outer 4.0 × 4.0 outline; the four ring members butt each other at the corners (G8a):
| V | Size X×Y×Z | Centre | Spans |
|---|---|---|---|
| 1 (deck) | 3.4 × 0.4 × 3.4 | (0, 0.20, 0) | x[−1.7, 1.7], z[−1.7, 1.7], y[0, 0.4] |
| 2 (parapet N) | 4.0 × 0.3 × 0.3 | (0, 0.55, 1.85) | z[1.7, 2.0], y[0.4, 0.7] |
| 3 (parapet S) | 4.0 × 0.3 × 0.3 | (0, 0.55, −1.85) | z[−2.0, −1.7], y[0.4, 0.7] |
| 4 (parapet E) | 0.3 × 0.3 × 3.4 | (1.85, 0.55, 0) | x[1.7, 2.0], z[−1.7, 1.7] |
| 5 (parapet W) | 0.3 × 0.3 × 3.4 | (−1.85, 0.55, 0) | x[−2.0, −1.7], z[−1.7, 1.7] |
Total height **0.7**. The deck bears on the wall tops (it overlaps the 0.6 wall band by 0.3 m per
side and the interior by the remainder). Sits at y = wall top = 3.2 + FFL.
Optional accent: a 0.10 m band on the parapet's outer face top edge — but per R4/R6 founder-tier
roofs are single-material; the ivory accent is reserved for the village/town tier.

### 5.4 Assembly rules

1. **Wall runs.** A corner piece consumes **4.0 m** of each of the two runs it terminates. A closed
   rectangle of outer size *S* therefore needs straight-wall lengths summing to *S* − 8.0 m, and
   those lengths must be drawn from {2.0, 4.0, 6.0}. Example: an 8 × 8 m outer footprint is two
   corners and four 0 m gaps — i.e. two corner pieces directly abutting, which is legal. A 12 × 8 m
   footprint uses two corners on the long sides (4 m each) plus one `nox_wall_straight_4m` per long
   side, and two corners on the short sides.
2. **Doorways and windows** replace a straight wall of the same length. A 2.0 m doorway replaces a
   2.0 m wall; a 2.0 m window replaces a 2.0 m wall. They cannot be applied to the 4.0 m piece.
3. **Doors on the ground floor, windows on both.** A doorway piece is not used above the ground
   storey. A window piece is not used below the ground storey's sill height (O8).
4. **Stairs** are interior elements and are *not* required to land on the build grid. A
   `nox_stair_run_*` is terminated at its upper end by a `nox_landing_2x2` or by the floor slab of
   the storey above. The *building* footprint is still defined by the wall lines and remains a
   multiple of 2 m.
5. **Roofs.** `nox_roof_flat_parapet_4x4` tiles in 4.0 m units; a non-multiple of 4 m roof edge is
   closed by a parapet-only strip of the same height. Roof decks step, they never pitch (M1).
6. **Posts** stand free. They are never receptacles for a wall end and never butt into a wall
   (see §2.5 node-anchoring). Minimum clearance from any wall face: 0.6 m.
7. **Foundation.** A building sits on one `nox_foundation_4x4` per 4.0 × 4.0 m cell of platform, or
   on a bare slab if the ground is already flat. The foundation's lower 6.0 × 6.0 m step must not
   overlap another foundation's step (the overlap is disallowed by G8 anyway).
8. **Vertical alignment.** Stack a doorway above a window and their voids share a plane (O6).

---

## 6. Progression and weathering rules

### 6.1 The three tiers

| Tier | Trigger (conceptual) | Character |
|---|---|---|
| **Founder** | The player's first settlement | Small, clean, monolithic. One or two masses. |
| **Village** | Population/production grows | Secondary wings, terraces, a second accent, first colonnades. |
| **Town** | Late progression | Massing complexity, roofscape stepping, civic monumentality. |

### 6.2 What changes across tiers

| Axis | Founder → Village → Town |
|---|---|
| **Massing complexity** | Volumes 4–9 → 5–12 → 6–16. Mass volumes 1–2 → 1–3 → 2–3. A founder building is a single mass; a town building is a cluster of masses with a clear hierarchy. |
| **Height** | 5.1–8.5 m → 8.5–13 m → 13–24 m (§3.4). Storeys 1–2 → 2–3 → 3–5. |
| **Footprint** | ≥ 4 × 4 m → ≥ 6 × 6 m → ≥ 8 × 8 m. |
| **Material accents** | Accent set {ivory, ochre} → {ochre, rust (restricted)} → {ivory, rust (restricted)}. Still exactly 2 families live at once. Accent surface budget 5 % → 8 % → 10 %. |
| **Timber** | ≤ 20 % of visible surface, never a mass. Village may add timber shutters to windows; town may add a timber ground-floor colonnade, still ≤ 20 %. |
| **Detail density** | Repeats before a variation: 5 → 7 → 7. Rib motif (REF-001 §5) is not available before village tier. |
| **Roofscape** | One flat parapet plane. Village may add a second, lower parapet plane over a wing. Town may step the roofline into 2–3 parapet levels. **Never a pitch.** |
| **Podium** | One 0.7 m foundation. Village may add a second plinth tier (0.3 m). Town may add stepped podiums of 2–3 tiers. |

### 6.3 What must NOT change — the grammar is tier-invariant

These hold at every tier, without exception:

| # | Invariant |
|---|---|
| I1 | Axis-aligned. No off-axis rotation, no shear, no taper. |
| I2 | Crisp edges. No bevels, no chamfers, no rounded corners, no subdivision. |
| I3 | Flat colour. No textures, no normal maps, no baked AO, no vertex colour on architecture. |
| I4 | Shadow is the light rig's job (§4.3). |
| I5 | Openings are rectangular voids; no arches, no circles, no frames, no mouldings. |
| I6 | Stair riser 0.3 / tread 0.9. This ratio never changes. |
| I7 | Storey height 3.2 m (tall hall 4.8). Never a fractional storey. |
| I8 | Wall thickness 0.6 (load-bearing) / 0.3 (parapet). |
| I9 | Footprint is a multiple of 2 m; kit pieces snap to the 2 m module. |
| I10 | One material per volume; ≤ 3 (founder) / ≤ 4 (village, town) IDs per asset. |
| I11 | Exactly 2 accent families live at once; a third is a revision, not an addition. |
| I12 | One stone family only. |
| I13 | Emissive magenta is never an architectural material. |
| I14 | Detail stays sparse: ≤ 10 % of visible surface is anything other than the primary stone. |
| I15 | The player's own buildings are **not** weathered, damaged, or ruined. |

### 6.4 Weathering (decay) — explicitly deferred

The reference set shows *ruins*: missing blocks, displaced cubes at the base, pale lichen patches on
vertical faces, grass creeping over top edges, pillars broken at unequal heights, one fallen lintel
(REF-001 §5, seed §5).

**These five devices are not part of the player's architecture and are not used in M1–M3.**
"Newly built Noxels must be the same language minus all five" (seed §5). A player's founding hall is
clean: full walls, intact stairs, capped posts, no debris. REF-001 §9 forbids ruins as the world's
premise.

Should the owner ever enable a ruins layer (a discovered ancient structure, a war-scarred town),
the composition rule is: **decay removes whole declared volumes and shortens them — it never adds
scratches, never subdivides a volume, never changes a material to a "dirty" version.** Lichen is a
flat patch of `mat_accent_ivory` on a vertical face at ≤ 5 % coverage. Grass creep is a GLM
terrain effect at a wall's top edge. Displaced cubes are whole Blocks lying on the ground, ≤ 0.6 m.
This is recorded so the language stays coherent if the decision is taken later; it is **not** a
current task and must not appear in M1 art.

---

## 7. Naming conformance

Per `00_Project_Core/Asset_Naming_Conventions.md`:

- Lowercase `snake_case`, ASCII, no spaces.
- System prefix `nox_` for Noxel architecture and props.
- Pattern `nox_<family>_<piece>_<size>`.
- Code IDs are `camelCase` and match the file stem.
- Every exported asset ships a sibling `.json` with the metadata block below.
- Concept/sheet artefacts live under `05_Noxel_Studio/Construction_Modules/`; exported GLB under
  `Game/assets/nox/`.

### 7.1 Piece ID table

| Piece | Asset ID (file stem) | Code ID (camelCase) | GLB |
|---|---|---|---|
| Foundation | `nox_foundation_4x4` | `foundation4x4` | `nox_foundation_4x4.glb` |
| Wall straight 4 m | `nox_wall_straight_4m` | `wallStraight4m` | `nox_wall_straight_4m.glb` |
| Wall straight 2 m | `nox_wall_straight_2m` | `wallStraight2m` | `nox_wall_straight_2m.glb` |
| Wall corner | `nox_wall_corner_4x4` | `wallCorner4x4` | `nox_wall_corner_4x4.glb` |
| Wall doorway | `nox_wall_doorway_2m` | `wallDoorway2m` | `nox_wall_doorway_2m.glb` |
| Wall window | `nox_wall_window_2m` | `wallWindow2m` | `nox_wall_window_2m.glb` |
| Post | `nox_post_1p2` | `post1p2` | `nox_post_1p2.glb` |
| Post capped | `nox_post_capped_1p2` | `postCapped1p2` | `nox_post_capped_1p2.glb` |
| Stair run 4 | `nox_stair_run_4` | `stairRun4` | `nox_stair_run_4.glb` |
| Stair run 6 | `nox_stair_run_6` | `stairRun6` | `nox_stair_run_6.glb` |
| Stair run 9 | `nox_stair_run_9` | `stairRun9` | `nox_stair_run_9.glb` |
| Roof flat parapet | `nox_roof_flat_parapet_4x4` | `roofFlatParapet4x4` | `nox_roof_flat_parapet_4x4.glb` |
| Landing | `nox_landing_2x2` | `landing2x2` | `nox_landing_2x2.glb` |

### 7.2 Required metadata (`<stem>.json`)

```json
{
  "id": "nox_wall_doorway_2m",
  "system": "noxel",
  "version": 1,
  "footprint": [2.0, 0.6],
  "height": 3.2,
  "snap": ["+x", "-x"],
  "materials": ["mat_stone_pale"],
  "optionalMaterials": ["mat_timber_dark"],
  "author": "mimo",
  "status": "review_required",
  "source": "05_Noxel_Studio/Noxel_Style_Guide/Noxel_Style_Guide_v1.0.md"
}
```

`footprint` is `[x, z]` in metres. `snap` uses the vocabulary `+x`, `-x`, `+z`, `-z`, `+y`, `bottom`,
`floor`. `materials` lists the default slots; anything else must be in `optionalMaterials`.

### 7.3 Naming rules for future assets

- Buildings: `nox_<tier>_<name>_<variant>` — e.g. `nox_founder_hall_a` → `founderHallA`.
- Props: `nox_prop_<name>_<size>` — e.g. `nox_prop_crate_1m`.
- Kit pieces must **not** carry a tier prefix: a piece is tier-neutral until it is used.
- Do **not** encode a colour in a name unless the colour is guaranteed permanent. `mat_accent_rose`
  is pending Q-001, so no asset ID may contain "rose" or "pink". This deviates from the
  `nat_tree_pink_a` example in the conventions doc, for the same reason (see AS-001 §7).

---

## 8. Test cases

Three checks a reviewer can apply **by looking at a model**. Each has a procedure, a pass criterion
and a failure example.

### Test 1 — "Is this a Noxel or a Minecraft block?"

**Procedure.** Render the asset (or kit piece) as a flat black silhouette from the ADB default
camera (yaw 45°, pitch 40°, distance 45 m). Count the distinct edge lengths visible in the outline.

**Pass.**
- The outline contains **at least 3 distinct edge lengths**, and
- the ratio longest edge : shortest edge is **≥ 3:1**, and
- at least one edge is **shorter than 1.0 m** (i.e. the silhouette contains a detail-scale step) or
  one element is **more than 2× the dominant element's width**.

**Fail examples.** A 2 × 2 × 2 pile of identical 1 m cubes. A wall whose every block is 1 m. A
post that is a stack of 1 m cubes. Any asset you could describe as "made of cubes".

**Why.** ADB §3.8, REF-001 §1 (non-uniform block scale is "the single biggest difference from voxel
art"), grammar rule G3, G11.

### Test 2 — "Does the human ruler fit?"

**Procedure.** Place a **1.7 m** human silhouette (flat black) at the door of the asset and a 1.7 m
figure beside the stair. Measure.

**Pass.** All of:
- The doorway clear width is **1.2 m ± 0.0** and clear height **2.2 m** — the human passes with
  headroom and shoulder room.
- The stair's riser is **0.3 m** and tread **0.9 m**; the human's rise is 1/5 of the tread depth.
- The window sill is at **1.0 m** (chest height) and the window head at **2.4 m**.
- The tallest point of the building is between **3× and 5×** the human height (5.1–8.5 m at founder
  tier) — "the world feels inhabited by small people in large ruins" (REF-001 §5), which for the
  *player's* buildings reads as monumental but not absurd.
- The storey is **3.2 m** floor-to-floor (or **4.8 m** for a single tall hall) — never a fractional
  storey.

**Fail examples.** A door the human cannot fit through; a ramp-like stair with a 0.6 m riser; a
building whose top is 3 m tall (the human is more than half the building); a 2.7 m storey.

**Why.** ADB §5 (human = ruler), seed §3, REF-001 §5.

### Test 3 — "Is the shadow painted in?"

**Procedure.** Render the asset twice with the same camera: (a) full ADB rig — sun elevation 30°,
intensity 2.6, hemisphere 0.55; (b) **sun disabled**, hemisphere only. Diff the two material-ID
lists.

**Pass.**
- The set of material IDs is **identical** in both renders.
- No material in the asset is a "shadow variant" of another. In particular
  `mat_stone_pale_shadow` (`#B9AECB`) does not appear on any face of the asset.
- The asset has **no vertex-colour attribute** and **no texture map** — flat colour only.
- Every material ID in the asset is in the tier's allowed list (§4.1).
- Accent materials cover **≤ 5 %** of the visible surface at founder tier.

**Fail examples.** A west wall painted a cooler tone; a baked AO vertex gradient; a texture atlas
with a soft shadow along the base of every wall; two greys of "stone".

**Why.** ADB §3.3–3.4, REF-001 §7, §4.3 of this guide.

---

## 9. Unresolved / needs owner or REF revision

| ID | Item | Status / who | Why it matters | Interim handling |
|---|---|---|---|---|
| **C1** | **Is `#B9AECB` ("Shadow stone") a material or a measurement target?** REF-001 §8 lists it as a palette slot, but seed §4 and ADB §3.4 require that shadow never be painted into geometry. | **Needs owner/DeepSeek ruling.** | If it is a swatch, every asset ships a second stone tone and the guide's §4.3 rule breaks. | Treated as a **render target only**; `mat_stone_pale_shadow` is marked forbidden in §4.1. |
| **C2** | **The reference images are not on disk.** REF-001 is the only source and its palette is eye-sampled ("to be locked numerically", REF-001 §8). | **Blocked on owner** (files into `05_Noxel_Studio/Reference_Images/`). | Every hex in §4.1 and every proportion in §3 may shift by a few percent after a real sampling pass. | All hexes are treated as provisional working values and are centralised in one palette module (ADB §2). |
| **C3** | **Q-001 — pink vs green-dominant foliage.** | **Owner.** | Does not change Noxel geometry, but decides whether `mat_accent_rose` is ever unlocked as an architectural accent, and therefore whether the accent sets in §4.1 change. | `mat_accent_rose` is **not unlocked** at any tier. Founder accents are ivory + ochre so the set stays valid under either answer. |
| **C4** | **Tier accent sets are my proposal.** The seed says "two accent materials per settlement tier" but never says which. | **Needs DeepSeek/orchestrator approval.** | It is a palette-module decision (one palette file, ADB §2). | Sets in §4.1 are written into the palette module as `tierAccents.founder = ['mat_accent_ivory','mat_accent_ochre']` etc., so they can be changed in one place. |
| **C5** | **Foundation step 0.3 m against 0.5 m terrain quantisation (D-008).** | **Needs a render check (Task 007/012).** | If the plinth reads as a step in the terrain rather than a built plinth, the step should become 0.5 m. | 0.3 m specified so it matches the stair riser; flagged for visual verification. |
| **C6** | **Q-003 — overhangs.** Heightfield terrain cannot make them; the kit only allows a 0.2 m cap overhang and a 0.5 m rib projection. | **Owner + GLM.** | If the owner wants real overhangs (brackets, cantilevers), the grammar needs a new element class. | Grammar currently forbids overhangs > 0.5 m (G7). |
| **C7** | **Node-anchored posts** require a kit loader that supports two anchor types. | **Needs DeepSeek (architecture scope).** | If the loader only supports grid-cell anchoring, posts must move to a grid-multiple section (e.g. 2.0 m) or become edge-anchored. | Specified here; the loader decides. |
| **C8** | **Timber at founder tier.** The seed lists wood as "(later)". | **Needs owner/art ruling.** | Door leaves and shutters need it; without it, doors are voids only. | Included with a ≤ 20 % budget, flagged optional in the piece tables. |
| **C9** | **Roof language after M1.** Seed §9.2 asks what replaces flat parapet later. | **Open — later task.** | Pitched roofs would break I5/I6/flat-parapet assumptions and need a revision. | M1 and the founder kit are flat-parapet only. |
| **C10** | **Architect scale.** REF-001 §5 fixes architecture at 3–5× human height; §3.4 proposes an "architect" band up to 7:1 for civic pieces. | **Needs owner ruling.** | Town-tier landmarks need a height justification. | Founder tier is locked to 3–5×; town tier is not yet authored. |
| **C11** | **`mat_accent_ochre` and `mat_strata_ochre` share `#C9A06A`.** One material ID or two? | **Needs DeepSeek (palette module).** | Two IDs with one hex invites drift. | Both are listed; the palette module should resolve them to one value. |
| **C12** | **Mass volume counts.** Seed §2 says masses are 2–4 distinct volumes; this guide's G1/G2 permits 1–3 Mass *volumes* plus slabs/posts/blocks. | **Needs a reconciliation ruling.** | A reviewer applying the seed literally would reject a valid asset. | G1/G2 are treated as the implementable superset; the seed's "2–4" is read as the *total* volume count, which G1's 4–9 partially contradicts. Flagged rather than silently resolved. |
| **C13** | **[CONFLICT]** REF-001 §4 states "Green foliage appears only on the ground, never in canopies", but Q-001 asks the owner whether the forest should be green-dominant. A green canopy would contradict REF-001 §4 directly. | **Owner (Q-001) + DeepSeek.** | If green canopies are chosen, REF-001 §4's sentence must be retired or rewritten in the same decision, or the two documents will contradict. | All natural foliage in AS-001 is authored against **palette slots**, not hues, so the geometry survives either answer; the *conflict is documentary*, not geometric. |

---

## 10. Revision notes

| Version | Date | Author | Change |
|---|---|---|---|
| v0.1 | 2026-10-22 | DeepSeek | Seed from REF-001. |
| v1.0 | 2026-10-22 | Mimo | Expansion: grammar rules G1–G11, opening rules O1–O10, dimension tables, material families + co-occurrence rules + shadow rule, founder-tier kit catalog of 9 pieces with exact volumes, tier progression tables, naming conformance, three test cases, 13 open items. |

**No images were created, rendered, or viewed in the production of this document.** It contains
written specifications and exact numbers only.
