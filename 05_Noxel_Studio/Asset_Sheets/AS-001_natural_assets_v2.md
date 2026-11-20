# AS-001 — Natural Asset Specification **v2.0**

**Owner:** Mimo (Lead Noxel Artist) · **Status:** Review Required · **Revision:** REV-001 (supersedes v1.0)
**Task:** 011a — natural resource asset sheets (trees, rocks, ore + depleted states)
**Feeds:** Milestone 1 "The Untamed World" (ADB §2, GDD §3) — the first world is nature-only.

**Traces to:** REF-002 (`04_Art_Director/Reference_Analysis/REF-002_Hybrid_World_Reference_Analysis.md`),
`04_Art_Director/Approved_Art_Direction/palette_v2.json`,
D-012 / D-013 / D-014 / D-015 (`00_Project_Core/Decision_Log.md`),
ADB (`00_Project_Core/Art_Direction_Bible.md`),
`05_Noxel_Studio/Noxel_Style_Guide/Noxel_Style_Guide_v1.0.md` §4,
`00_Project_Core/Asset_Naming_Conventions.md`,
`06_Voxel_Studio/Biomes/start_map_v1.json` (region names and counts).

> **Provenance statement.** The owner's reference images are **not on disk** and were **not viewed**
> for this document. Every reference-derived claim below is cited to **REF-002** by section and
> inherits REF-002's own caveats (its palette is "sampled by eye; numeric verification pending",
> `palette_v2.json` `source`). **No images, meshes or renders were created.** This document contains
> parametric data, exact numbers in metres, and one render contract. Anything beyond REF-002, the
> ADB and the decision log is tagged **[PROPOSAL]**.

> **Scope note.** This sheet designs **nature only**. No buildings, walls, stairs or props are
> designed here. The "No buildings are designed here" clause of v1.0 §0 is carried forward
> unchanged.

---

## 0. Change log vs v1.0

### 0.1 What changed, and why

| # | Item | v1.0 | **v2.0** | Authority |
|---|---|---|---|---|
| **C1** | Composition contract | "Everything in this sheet is a **list of axis-aligned boxes**." | **Three primitive kinds**: `NatBox` (axis-aligned box), `NatColumn` (6-sided prism), `NatMass` (faceted convex low-poly mass). Every asset is a list of primitives of those three kinds. | REF-002 §1 ("Hybrid = block-based terrain & structure + **stylized, smooth objects**"), §6 ("Mimo's tree spec as written uses stacked axis-aligned boxes… superseded for canopies") |
| **C2** | **Canopy primitive** | 3–8 stacked cuboids per canopy | **`NatMass`** — centre, three radii, `sides` (7–11), shape (`orb`/`dome`/`drum`), yaw quantised to 15°, fixed 3-band low-poly subdivision, flat-shaded. A canopy is 2–4 masses + ≤1 flat block satellite. | Brief item 1; REF-002 §2 ("faceted, rounded low-poly blossom/leaf masses") |
| **C3** | Trunk | one axis-aligned square box | **`NatColumn`** — 6-sided prism (circumradius, height, 15° yaw) + a wider 6-sided root-flare collar | Brief item 1 ("a square or 6-sided column is acceptable; state which, and why") — §4 of this sheet |
| **C4** | Palette source | REF-001 eyeballed slots (`mat_foliage_primary`, `mat_bark_dark`, `mat_ore_copper`, `mat_stone_pale`, `mat_ochre`, `mat_foliage_cream`) | **`palette_v2.json` slots only**: `canopy_green_a/b/c`, `canopy_pink`, `canopy_pink_b`, `trunk`, `bark_dark`, `stone_top`, `stone_body_b`, `stone_shade`, `strata_ochre`, `ore_crystal`, `ore_crystal_b`, `grass_top` | D-014, ADB §7 |
| **C5** | **Cream foliage** | `mat_foliage_cream` `#F2DDC4` used as the canopy variation block | **Removed entirely.** Canopy variation is now the 3-value green family (and the 2-value pink family). | Brief item 2 ("cream foliage should go — it was too close to stone") |
| **C6** | Green in canopies | forbidden ("green appears only on the ground, never in canopies") | **Green is the dominant canopy colour.** `canopy_green_b` is the main mass of every green tree. | D-013, ADB §3.10, REF-002 §2 |
| **C7** | Pink | dominant canopy colour | **Accent species only.** New species **T4 — Blossom** (pink), hard-capped at **≤ 25 %** of standing tree instances. | D-013, ADB §3.10, brief item 2 |
| **C8** | Species roster | T1 Spire, T2 Table, T3 Cluster, G1 Shrub | T1, T2, T3 retained unchanged in silhouette framing; **T4 Blossom added**; G1 retained | REF-002 §2 ("pink trees have chunkier faceted blossom masses") |
| **C9** | **Ore accent** | copper `#B25A3F` + ochre "gold" `#C9A06A` | **violet crystal `#7B5AD6`** (`ore_crystal`) + **highlight `#9B7BE8`** (`ore_crystal_b`). Magenta stays forbidden. | D-015, ADB §7, REF-002 §3, brief item 4 |
| **C10** | Ore asset IDs | `nat_ore_copper_a`, `nat_ore_gold_a` | `nat_ore_crystal_small_a`, `nat_ore_crystal_large_a` | The ore colour changed; `Asset_Naming_Conventions.md` §1 requires the ID to follow the asset |
| **C11** | Rock geometry | blocky clusters (3–4 boxes) | **Unchanged** — still blocky | REF-002 §1 (rocks may stay blocky), brief item 5 |
| **C12** | Rock material | `mat_stone_pale` | `stone_top` (main) + `stone_body_b` / `stone_shade` (facet breakup) | D-014, palette_v2 |
| **C13** | Rock-vs-terrain read | not addressed | **New §8.4 clause**: a measured value/separation rule so a rock never merges into terrain | Brief item 5 |
| **C14** | Species mix | prose proposal (30/35/25/10) | **Numeric per-100-instance table** + per-biome mix + a **cap-enforcement algorithm** | Brief item 2 ("express this as data (a mix table), not prose") |
| **C15** | Biome placement | one prose paragraph | **5-row biome table** (forest interior / forest edge / open plain / lakeshore / rocky terrain) with density ranges, spacing, per-biome species mix and shrub budget | Brief item 3 |
| **C16** | Render contract | none | **§14 RENDER CONTRACT** — camera, light rig, ground, instance list, pass criteria, one-command run | Brief (deliverable) |
| **C17** | Partial state ("felled crown") | one axis-aligned box | a **flattened `drum` mass** lying on the ground + 2 cut-limb boxes in `strata_ochre` | Follows from C2 |
| **C18** | Aspect-ratio separation rule | ≥ 25 % between **any** two species | ≥ 25 % in aspect **OR** a measured colour separation (≥ 25 % relative luminance + ≥ 60° hue) | T4 makes the strict rule unsatisfiable for a 4th silhouette; §12.3 states the measured substitute |
| **C19** | Q-001 deferral (§7.3 of v1.0) | two-branch "if the owner goes green" table | **Deleted — Q-001 is resolved green-dominant (D-013)** | D-013 |
| **C20** | Open items | 12 (U1–U12) | **8** (U1–U8). U2 (Q-001), U3 (green-canopy conflict), U4 (no saturated ore colour) and U6 (shrub slot) are **closed**; U5 is **partially closed**; U7 and U8 are **new** | §16 |

### 0.2 What did **not** change (accepted in v1.0 — do not re-litigate)

The parametric composition discipline, the species silhouette framing (T1 spire / T2 table / T3
cluster / G1 shrub), the standing→partial→stump state system and its non-overlapping height bands,
the rock cluster structure and its depleted state, the ore vein construction rules, the silhouette
readability method at 45 m, the table format, the authoring quantum of **0.05 m**, the
**0.15 m burial** of planted assets, the determinism rule (D-006, `mulberry32`), the asset-naming
policy (no colour in an asset ID for T1–T3), and the yield/resource mapping.

---

## 1. Scope, and what belongs to someone else

| In this sheet | Not in this sheet (and why) |
|---|---|
| Tree meshes (4 species + 1 shrub family) and their harvest states | Terrain, cliffs, terraces, strata banding, water, shorelines — **GLM**, `Voxel_Style_Guide.md` |
| Rock clusters (3 size classes) and their depleted state | Ground cover, flowers, grass specks — **GLM** (terrain domain) |
| Ore clusters and their states | The placement **algorithm** and biome logic — **GLM**; this sheet supplies the *constraint table* (§11) |
| Species mix, pink cap, grove rule | The economy / yield balance — GDD §5 |
| Material slots and hex values | The palette module itself — `palette_v2.json` (D-014) |
| The render contract for the natural assets | The terrain render contract — GLM |

**Boundary note.** `Voxel_Style_Guide.md` §6 states "Trees: geometry may be a **custom mesh**…
The *distribution rule* is terrain's; the *mesh* is not." This sheet supplies the **mesh**; GLM
supplies the **distribution** (§11 states the art-side constraint; the algorithm is GLM's).

---

## 2. The parametric composition contract (v2)

### 2.1 The three primitives

An asset is an **ordered list of primitives**. Every primitive carries exactly one palette slot.
There are exactly three primitive kinds.

```ts
// ---- 1. Axis-aligned box. Structure, cut faces, block satellites, logs, rock clusters, ore veins.
interface NatBox {
  cx: number;  // centre X, metres, asset-local
  cy: number;  // centre Y, metres, asset-local (y = 0 is the planting plane)
  cz: number;  // centre Z, metres, asset-local
  sx: number;  // full size X, metres
  sy: number;  // full size Y, metres
  sz: number;  // full size Z, metres
  slot: MatSlot;
}

// ---- 2. n-sided vertical prism column. Trunks, root flares, stump bodies, cut-face caps.
interface NatColumn {
  cx: number;  // centre X of the prism axis, metres
  cz: number;  // centre Z of the prism axis, metres
  y0: number;  // bottom Y, metres
  h: number;   // height, metres
  r: number;   // circumradius (axis centre to a vertex), metres
  sides: 6;    // FIXED at 6
  yawDeg: number; // rotation about Y, multiple of 15
  slot: MatSlot;
}

// ---- 3. Faceted convex mass. ALL canopies.
interface NatMass {
  cx: number;  // centre, metres, asset-local
  cy: number;
  cz: number;
  rx: number;  // semi-axis X, metres
  ry: number;  // semi-axis Y, metres
  rz: number;  // semi-axis Z, metres
  sides: number;    // radial segments, integer 7..11
  shape: 'orb' | 'dome' | 'drum';
  yawDeg: number;   // rotation about Y, multiple of 15 (this IS the facet phase)
  slot: MatSlot;
}
```

**Global rules, all primitives:**

| # | Rule |
|---|---|
| **P1** | **Asset origin** = the centre of the trunk/rock footprint, at ground level (y = 0). |
| **P2** | The whole asset is **buried 0.15 m** at placement (the renderer offsets it down 0.15 m). All `cy`/`y0` in this sheet are measured from the **planting plane**. |
| **P3** | Every linear dimension and every coordinate is a multiple of **0.05 m** unless a table says otherwise. Mass **radii** are the exception: they are multiples of **0.05 m** too, but the *derived* extents (e.g. `ry·0.7071`) are not quantised. |
| **P4** | **No rotation about X or Z, ever.** The only rotation is a **yaw about Y, quantised to 15°** (0, 15, 30 … 345). This applies to boxes as well, which therefore stay axis-aligned *in asset space* and may be yawed as a whole. |
| **P5** | **Flat colour, no textures.** One slot per primitive. No image maps, no normal maps, no vertex colour, no baked AO. Shadow is the light rig's job (`Noxel_Style_Guide.md` §4.3). |
| **P6** | **One material per primitive.** A primitive is never split by material and a face is never given a colour to simulate lighting. |
| **P7** | **Ground contact.** Every asset has at least one primitive touching y = 0. |
| **P8** | **Joint rule.** Two primitives of one asset either **butt** (share a boundary plane with opposite-facing surfaces) or **overlap by ≥ 0.05 m** on at least one axis. A pair of *front-facing* coplanar faces over a shared area is forbidden — it z-fights. For a `NatColumn` cut-face cap, the cap radius is the trunk radius **+ 0.03 m** so the cap's sides are never coplanar with the trunk's sides. |

### 2.2 The authoring quantum, restated

0.05 m (Noxel guide §2.2 G9) for every dimension and coordinate. The exceptions are exactly:
the `0.9 m` tread-like values (none in this sheet), the derived `ry·0.7071` values of a `drum`/`dome`
cap plane, and the percentages in the variation ranges.

---

## 3. The canopy primitive — `NatMass` (faceted convex mass)

**This is the single most important change in v2.0.** Every canopy in this sheet is built from
`NatMass` primitives. A cuboid may never be a canopy mass; the only boxes allowed inside a canopy
are the single optional **block satellite** (§6.4), which is explicitly a minor silhouette-breaking
detail, not the mass.

### 3.1 Mesh construction (implement literally)

1. **Longitude set.** `θ_k = yawDeg·π/180 + k·2π/sides`, `k = 0 … sides−1`.
   Because `yawDeg` is a multiple of 15°, the **facet phase** of every mass in the world lies on the
   same 15° lattice — the canopies read as designed, not as random noise.
2. **Latitude rows.** The shape selects the rows:

   | `shape` | Latitude rows | Top | Bottom | Reads as |
   |---|---|---|---|---|
   | `orb` | −45°, 0°, +45° | pole | pole | a rounded faceted blob |
   | `dome` | 0°, +45° | pole | **flat cap** (n-gon) | a rounded crown with a flat underside |
   | `drum` | −45°, 0°, +45° | **flat cap** (n-gon) | **flat cap** (n-gon) | a chunky faceted block-mass |

3. **Vertex position.** For a row at latitude `φ` and vertex `k`:

   ```
   local = ( rx · cosφ · cosθ_k ,  ry · sinφ ,  rz · cosφ · sinθ_k )
   world = ( cx + local.x ,  cy + local.y ,  cz + local.z )
   ```

   so the row's horizontal radius factor is `cosφ`: 1.000 at the equator, 0.707 at ±45°.
4. **Poles.** The top/bottom pole of a shape is the single point `(cx, cy ± ry, cz)`.
5. **Caps.** A flat cap is an n-gon at the row's plane; its centre is
   `(cx, cy + ry·sinφ_cap, cz)` — e.g. for a `drum`, the bottom cap plane is at `cy − 0.7071·ry`
   and the top cap plane at `cy + 0.7071·ry`.
6. **Triangulation.**
   - band between two consecutive rows → 2 triangles per segment (`sides` segments);
   - pole fan → 1 triangle per segment;
   - cap fan (cap centre + row) → 1 triangle per segment.
7. **Winding.** Emit each triangle so its face normal points **away from the mass centre**:
   `dot(faceNormal, faceCentre − massCentre) > 0`; if not, swap two vertices. This removes any
   ambiguity about inside/outside and guarantees back-face culling is correct.
8. **Flat shading.** Every triangle gets the **face** normal (no vertex normals, no smoothing
   groups). The geometry is non-indexed. This is what makes the mass read as *faceted*.
9. **Convexity.** Each `NatMass` is the tessellation of an ellipsoid (optionally truncated by one or
   two half-spaces). Both operations are convex, so **every mass is convex by construction** — the
   silhouette of a single mass can never have a concave corner. The canopy as a whole is a **union**
   of convex masses (as in REF-002 §2: "chunkier faceted blossom masses").

### 3.2 Budgets and counts (implement exactly)

| `shape` | Vertices | Triangles | For `sides` = 7 … 11 |
|---|---|---|---|
| `orb` | `2 + 3·sides` | `6·sides` | 23 … 35 v · 42 … 66 t |
| `dome` | `2 + 2·sides` | `4·sides` | 16 … 24 v · 28 … 44 t |
| `drum` | `3·sides + 2` | `6·sides` | 23 … 35 v · 42 … 66 t |

- **Fixed low-poly subdivision level:** every mass in the project uses **3 latitude bands**
  (`orb`, `drum`) or **2 bands** (`dome` — the dome is one band short by definition).
  The subdivision level is **never** a runtime parameter.
- **`sides` is 7 … 11** and is **authored per variant, never jittered** (it changes the facet count
  and therefore the silhouette class).

### 3.3 Reference implementation (drop-in)

```js
// Build one NatMass into flat (non-indexed) position + normal arrays.
function buildMass(m) {
  const { cx, cy, cz, rx, ry, rz, sides, shape, yawDeg } = m;
  const D = Math.PI / 180;
  const pos = [], nrm = [];
  const lon = (k) => yawDeg * D + k * 2 * Math.PI / sides;
  const row = (phiDeg) => {
    const phi = phiDeg * D, c = Math.cos(phi), s = Math.sin(phi);
    const out = [];
    for (let k = 0; k < sides; k++) {
      const t = lon(k);
      out.push([cx + rx * c * Math.cos(t), cy + ry * s, cz + rz * c * Math.sin(t)]);
    }
    return out;
  };
  const pole = (sign) => [cx, cy + sign * ry, cz];
  const capCentre = (phiDeg) => [cx, cy + ry * Math.sin(phiDeg * D), cz];
  const tri = (a, b, c) => {
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx/=L; ny/=L; nz/=L;
    // outward winding
    const fx = (a[0]+b[0]+c[0])/3 - cx, fy = (a[1]+b[1]+c[1])/3 - cy, fz = (a[2]+b[2]+c[2])/3 - cz;
    if (nx*fx + ny*fy + nz*fz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nrm.push(nx, ny, nz); }
  };
  const band = (r0, r1) => { for (let k = 0; k < sides; k++) { const j = (k+1) % sides; tri(r0[k], r0[j], r1[k]); tri(r0[j], r1[j], r1[k]); } };
  const fan = (ring, apex) => { for (let k = 0; k < sides; k++) tri(ring[k], ring[(k+1) % sides], apex); };
  const cap  = (ring, centre) => { for (let k = 0; k < sides; k++) tri(ring[(k+1) % sides], ring[k], centre); };

  if (shape === 'orb') {
    const r = [row(-45), row(0), row(45)];
    band(r[0], r[1]); band(r[1], r[2]);
    fan(r[0], pole(-1)); fan(r[2], pole(+1));
  } else if (shape === 'dome') {
    const r = [row(0), row(45)];
    band(r[0], r[1]);
    fan(r[1], pole(+1));
    cap(r[0], capCentre(0));
  } else { // drum
    const r = [row(-45), row(0), row(45)];
    band(r[0], r[1]); band(r[1], r[2]);
    cap(r[0], capCentre(-45)); cap(r[2], capCentre(+45));
  }
  return { pos, nrm };
}
```

### 3.4 Why this reads as REF-002 and not as a voxel

| REF-002 §2 wording | What in this spec delivers it |
|---|---|
| "Green broadleaf trees have **faceted, rounded** canopies" | `orb` / `dome` masses: a curved silhouette with 7–11 flat facets per latitude band, never a right angle |
| "pink trees have **chunkier faceted blossom masses**" | `drum` masses on T4: flat top and bottom, 9 sides, visibly blockier *and* visibly faceted |
| "Trunks dark brown, **slim**" | 6-gon column, flat-to-flat 0.45–0.59 m, in `trunk` `#6B4A33` |
| "**block-based terrain & structure** + stylized, smooth objects" | Trunks and rocks stay in the block language; only the organic layer becomes faceted |

### 3.5 Anti-regression checks (a reviewer can run these on the mesh)

These are the checks that catch "the canopy is still made of boxes". They are stated so that a
reviewer can run them on a silhouette render with a ruler and an angle.

| ID | Check | Pass | A cuboid canopy fails because |
|---|---|---|---|
| **F1** | Count the distinct edge directions in the canopy's outline. | **≥ 5** non-parallel directions | a stacked-cuboid canopy has at most **3** (x, y, z) |
| **F2** | Are there any **slanted** edges in the canopy's outline? | **Yes — at least one** | every edge of a cuboid canopy is axis-parallel. **This is the decisive test**: a `NatMass` always contributes slanted facet edges (the pole-fan and band edges), a box never does. |
| **F3** | Look for a **90° corner** formed by two axis-parallel silhouette edges, each ≥ 0.50 m long. | **None** | every cuboid has four such corners per box. A mass's flat cap edge meets its band edges at an obtuse dihedral, never a right angle. |
| **F4** | Count flat-shaded value steps across the sunlit side of one canopy. | **≥ 6** distinct steps | a cuboid canopy shows **1–3** flat values |
| **F5** | Check the convexity of any single mass. | **no concave corner** on a mass's own outline | n/a (a box is convex too — this check guards the *mass*, not the canopy) |

---

## 4. The trunk primitive — `NatColumn`, and why **6-sided** and not square

**Decision: every trunk in this project is a 6-sided prism column (`NatColumn`), not a square box.**

Rationale, in order of weight:

1. **It avoids the "cube on a stick" read.** ADB §3.8 and Noxel guide rule G3 exist to kill the
   Minecraft read. A 0.50 m square trunk under a 5 m canopy is exactly that read; a 6-gon with a
   0.45–0.59 m flat-to-flat width reads as a *slim, slightly round* stem, which is what REF-002 §2
   describes ("Trunks dark brown, slim").
2. **It bridges the two mesh languages.** REF-002 §1 keeps trunks in the "may stay blocky" group,
   but a 6-gon is still a *structural column* — it carries the world's grid discipline — while its
   60° facets sit in the same family as the canopy's 7–11 facets. A square trunk sits in neither
   family.
3. **The harvest read stays unambiguous.** The partial state needs a **flat sawn cut** (v1.0 §3.2:
   trunks have no taper and no branches, so a clean cut is the only honest harvest read). A
   horizontal plane through a 6-gon gives a clean hexagonal disc; the cap is authored as a
   6-gon column of thickness 0.05 m with radius **+0.03 m** over the trunk (rule P8), so the two
   never z-fight.
4. **It costs one extra vertex ring.** A 6-gon is 6 side quads (12 tris) + 2 caps (12 tris) = 24
   triangles, against 12 for a box. Affordable at the tree budget in §6.5.

**The documented fallback.** If the render (or the owner) rejects the 6-gon, the square column is
one constant away: keep `NatColumn` and set `sides = 4`, `r = 0.32` (flat-to-flat 0.45 m for T1,
0.34 m for T4). No other number in this sheet changes. **Do not mix 4-sided and 6-sided trunks in
one world.**

**Trunk parameters, all species:**

| Species | Circumradius `r` | Flat-to-flat | Root-flare radius | Root-flare height |
|---|---|---|---|---|
| T1 Spire | 0.28 m | 0.49 m | 0.38 m | 0.30 m |
| T2 Table | 0.34 m | 0.59 m | 0.46 m | 0.28 m |
| T3 Cluster | 0.26 m | 0.45 m | 0.36 m | 0.26 m |
| T4 Blossom | 0.30 m | 0.52 m | 0.42 m | 0.28 m |
| G1 Shrub | *(no trunk)* | — | — | — |

The **root flare** is a second `NatColumn` of the same `sides` and `yawDeg`, radius as above, height
as above, in slot `bark_dark`. It sits at `y0 = 0` and overlaps the trunk from y = 0 upward, so
the trunk base never reads as a floating cylinder on grass.

---

## 5. Palette (v2) — slots, values, and the measured separations

### 5.1 The slots this sheet uses — every one exists in `palette_v2.json`

| Slot | Hex | `palette_v2.json` role | Used by |
|---|---|---|---|
| `canopy_green_a` | `#5FA83F` | green canopy, **shade** mass | the lowest/inner mass of every green canopy (§6.2 rule K8) |
| `canopy_green_b` | `#6FB84A` | green canopy, **main** mass | the bulk of every green canopy |
| `canopy_green_c` | `#7FC356` | green canopy, **highlight** mass | the sunlit upper mass of every green canopy |
| `canopy_pink` | `#F2A6C4` | blossom accent species only | T4 main / upper masses |
| `canopy_pink_b` | `#E88FB2` | blossom **shade** mass | T4 lower / side masses |
| `trunk` | `#6B4A33` | tree trunks | every standing trunk column |
| `bark_dark` | `#4E3626` | trunk shade, stumps | root flares, stump bodies, log sides |
| `stone_top` | `#E6DFCC` | bare stone top surface | the main body of every rock and ore host |
| `stone_body_b` | `#D1C7AF` | side body, odd band | the secondary facet boxes of a rock cluster |
| `stone_shade` | `#B9AE96` | crevice / recessed stone accent | the smallest box of an R3 cluster |
| `strata_ochre` | `#C99A5F` | side band 0.4–0.62 m below top | **cut faces** (freshly cut wood), log end caps |
| `ore_crystal` | `#7B5AD6` | ore deposit accent | crystal vein slabs |
| `ore_crystal_b` | `#9B7BE8` | ore highlight facet | the highlight cap on each vein slab |
| `grass_top` | `#79B94C` | terrain top, low elevation | **render-contract ground only** (not an asset slot) |
| `emissive_magic` | `#D24BFF` | reserved: magic effects only | **FORBIDDEN on every natural asset** (§16 U5) |

**Slot discipline.** The sheet names colours by **slot**, never by hex, in every geometry table, so
a palette edit propagates without touching a mesh. `strata_ochre` is used on cut wood; that is a
**role stretch** flagged in §16 U4 — it is the only warm wood-family value in `palette_v2.json`.

### 5.2 Measured separations (sRGB relative luminance `Y = 0.2126R + 0.7152G + 0.0722B`, linearised)

| Colour | Hex | Y | Hue (HSV) | Use |
|---|---|---|---|---|
| `grass_top` | `#79B94C` | 0.393 | 95° | ground |
| `canopy_green_a` | `#5FA83F` | 0.308 | 102° | canopy shade mass |
| `canopy_green_b` | `#6FB84A` | 0.382 | 100° | canopy main mass |
| `canopy_green_c` | `#7FC356` | 0.442 | 97° | canopy highlight mass |
| `canopy_pink` | `#F2A6C4` | 0.501 | 336° | blossom main mass |
| `canopy_pink_b` | `#E88FB2` | 0.400 | 336° | blossom shade mass |
| `trunk` | `#6B4A33` | 0.083 | 25° | trunk |
| `bark_dark` | `#4E3626` | 0.044 | 24° | flare / stump / log |
| `stone_top` | `#E6DFCC` | 0.740 | 44° | rock body |
| `stone_body_b` | `#D1C7AF` | 0.575 | 42° | rock facet |
| `stone_shade` | `#B9AE96` | 0.428 | 41° | rock recess |
| `strata_ochre` | `#C99A5F` | 0.364 | 33° | cut wood |
| `ore_crystal` | `#7B5AD6` | 0.164 | 256° | ore vein |
| `ore_crystal_b` | `#9B7BE8` | 0.270 | 258° | ore highlight |

*(Values computed from the sRGB hexes with `Y = 0.2126 R + 0.7152 G + 0.0722 B` on linearised
channels; hue is HSV, 0–360°.)*

**Consequences the geometry must honour:**

| Finding | Rule it produces |
|---|---|
| `canopy_green_b` (Y 0.382) sits only **2.9 %** from `grass_top` (Y 0.393). A *single-value* green canopy would merge with the ground. | **K8** (§6.2): every canopy contains at least one `canopy_green_a` mass (−21.6 % vs grass) and one `canopy_green_c` mass (+12.5 % vs grass) — an internal value spread of **43.6 %**, so the canopy can never be one flat field against grass. Flagged as U2 in §16. |
| `stone_top` (Y 0.740) is **12.9 %** brighter than the terrain's vertical stone face `stone_body_a` (`#DCD3BE`, Y 0.655) and **28.6 %** brighter than `stone_body_b`. | The rock-vs-terrain rule, §8.4. |
| `ore_crystal` Y 0.164 is **75 %** darker than `stone_top`; its hue (256°) is 80° from the pink family (336°) and 143° from the greens. | The ore read, §9.4. |
| `emissive_magic` `#D24BFF` would be hue 285° — **29°** from the violet ore. | Magenta stays **forbidden**; the violet is the *only* non-green, non-pink, non-stone hue in the sheet. |

---

## 6. Tree families

### 6.0 Design constraints (from ADB §5, REF-002 §2, task brief)

| Constraint | Value |
|---|---|
| Total tree height (authored, above the planting plane) | **6.0 – 9.0 m** |
| Canopy width, main mass | **4.0 – 6.0 m** |
| Canopy envelope (incl. the block satellite) | ≤ **6.00 m**; ≤ **5.60 m** for T1 |
| Canopy height | **< canopy width** (canopy wider than tall) |
| Trunk section | 6-gon column, **no taper**, **no branches** |
| Canopy construction | **2–4 `NatMass` primitives** + **0–1 flat `NatBox` satellite** |
| Trunk colour | `trunk` `#6B4A33` |
| Canopy colour | **green-dominant** (`canopy_green_a/b/c`); pink only on T4 |

### 6.1 Species roster

| Species | ID stem | Silhouette archetype | Authored H | Canopy W (main mass) | Canopy H | Masses | Distinctive read at 45 m |
|---|---|---|---|---|---|---|---|
| **T1 — Spire** | `nat_tree_spire_` | tall, narrow, stepped crown | **8.50 m** | **4.20 m** | **4.05 m** | 3 `orb` + 1 box | A thin vertical needle with a small stepped crown on a long bare stem. The tallest, thinnest tree. |
| **T2 — Table** | `nat_tree_table_` | squat, very wide, flat top | **6.15 m** | **5.90 m** | **2.65 m** | 4 (3 `dome` + 1 `orb`) | A wide flat tabletop on a short thick stem. The widest tree; reads as a horizontal bar. |
| **T3 — Cluster** | `nat_tree_cluster_` | mid-height lumpy blob with side lobes | **6.60 m** | **4.35 m** | **3.35 m** | 4 `orb` + 1 box | A lumpy rounded clump with two outboard lobes; the only green silhouette that is not a single mass. |
| **T4 — Blossom** | `nat_tree_blossom_` | round-crowned, chunky blossom masses | **7.10 m** | **4.80 m** | **2.91 m** | 3 `drum` + 1 `orb` + 1 box | The pink accent species: a fat, barrel-chunky crown, clearly a different object from the green trees. |
| **G1 — Shrub** | `nat_shrub_` | low ground bun | **1.50 m** | **1.40 m** | **1.50 m** | 3 `orb` | A small bun on the ground; the "sapling" read at human scale. |

**Width definitions (kept from v1.0):**
- **Canopy W (main mass)** = the X/Z extent of the union of the canopy **masses** (block satellites
  excluded), measured **analytically from the authored radii** (`cx ± rx`, `cz ± rz`). Used for the
  4.0–6.0 m band check and the aspect ratio.
- **Canopy envelope** = the total extent including the block satellite. Hard limit **6.00 m**,
  and **5.60 m** for T1.
- **Note:** the *realised* mesh is 2–7 % narrower than the analytic extent, because a 7–11-gon's
  vertices do not land on the X/Z axes (T1's authored ±2.10 m realises as ±1.97 m). All the clamps
  are therefore evaluated on the **analytic** value, which is the conservative choice — the built
  mesh is always inside the band, never outside it.

### 6.2 Composition rules for a canopy (all species)

| ID | Rule |
|---|---|
| **K1** | Authored total height ∈ **[6.00, 9.00] m**. |
| **K2** | Canopy main-mass width ∈ **[4.00, 6.00] m**; canopy envelope ≤ **6.00 m** (≤ 5.60 m for T1). |
| **K3** | Canopy height **<** canopy main-mass width. |
| **K4** | The trunk's top must lie **≥ 0.20 m inside** the canopy's lowest solid (no floating crown). |
| **K5** | The trunk base touches y = 0 exactly. |
| **K6** | Every mass must **intersect** at least one other mass by volume (no detached canopy lobes). The authoring rule that guarantees it: *the lower mass's solid must contain the upper mass's bottom pole or bottom-cap centre.* |
| **K7** | The species aspect ratio (authored height ÷ canopy main-mass width) must stay within **± 12 %** of the authored value. |
| **K8** | Every canopy must contain **at least one shade mass** (`canopy_green_a` for green species, `canopy_pink_b` for T4) **and at least one highlight mass** (`canopy_green_c` / `canopy_pink`). This is the guaranteed internal value spread (see §5.2). |
| **K9** | Masses and boxes must not interpenetrate so deeply that the mass's own outline is destroyed: no mass may have more than **60 %** of its volume inside another mass. |
| **K10** | A mass may not be **wholly** inside another mass (it must contribute to the silhouette). |

### 6.3 The authored species geometry

All coordinates are asset-local, metres, planting plane at y = 0. **The `yawDeg` column is the
facet phase** (§3.1 step 1) and also the yaw of the trunk column and root flare.

#### 6.3.1 T1 — Spire (`nat_tree_spire_a`)

| # | Primitive | Shape / sides | Slot | Position | Radii / size | Yaw |
|---|---|---|---|---|---|---|
| T | `NatColumn` | 6 | `trunk` | axis (0, 0), `y0` 0, `h` **4.90** | `r` 0.28 | 0° |
| F | `NatColumn` (flare) | 6 | `bark_dark` | axis (0, 0), `y0` 0, `h` **0.30** | `r` 0.38 | 0° |
| M1 | `NatMass` | `orb`, 9 | `canopy_green_a` | (0.00, **5.45**, 0.00) | rx 2.10, ry 1.00, rz 2.05 | 0° |
| M2 | `NatMass` | `orb`, 7 | `canopy_green_b` | (0.20, 6.85, −0.20) | rx 1.45, ry 0.95, rz 1.35 | 15° |
| M3 | `NatMass` | `orb`, 7 | `canopy_green_c` | (−0.15, 7.85, 0.15) | rx 0.95, ry 0.65, rz 0.90 | 30° |
| S1 | `NatBox` (optional) | — | `canopy_green_c` | (2.40, 5.55, 0.75) | 0.80 × 0.50 × 0.80 | 0° |

- Total height **8.50 m** (M3 top = 7.85 + 0.65).
- Canopy bottom **4.45** (M1) → trunk top 4.90 is **0.45 m inside** the canopy (K4 ✓).
- Canopy main-mass width: x [−2.10, 2.10] = **4.20 m**; z [−2.05, 2.05] = 4.10 m.
- Canopy envelope with S1: x [−2.10, 2.80] = **4.90 m** ≤ 5.60 ✓. S1 overlaps M1 by 0.10 m in x
  (P8 ✓).
- Canopy height **4.05 m** < 4.20 m ✓ (K3).
- Aspect **8.50 / 4.20 = 2.024**.
- Bare trunk height 4.45 m.

#### 6.3.2 T2 — Table (`nat_tree_table_a`)

| # | Primitive | Shape / sides | Slot | Position | Radii / size | Yaw |
|---|---|---|---|---|---|---|
| T | `NatColumn` | 6 | `trunk` | axis (0, 0), `y0` 0, `h` **3.85** | `r` 0.34 | 0° |
| F | `NatColumn` (flare) | 6 | `bark_dark` | axis (0, 0), `y0` 0, `h` **0.28** | `r` 0.46 | 0° |
| M1 | `NatMass` | `dome`, 11 | `canopy_green_a` | (0.00, **3.50**, 0.00) | rx 2.95, ry 1.30, rz 2.30 | 0° |
| M2 | `NatMass` | `dome`, 9 | `canopy_green_b` | (1.35, 4.00, −0.60) | rx 1.45, ry 0.95, rz 1.25 | 15° |
| M3 | `NatMass` | `orb`, 9 | `canopy_green_c` | (−0.35, 5.20, 0.25) | rx 1.35, ry 0.95, rz 1.25 | 30° |
| M4 | `NatMass` | `dome`, 7 | `canopy_green_b` | (−1.45, 4.05, 0.95) | rx 1.10, ry 0.75, rz 1.00 | 45° |

- Total height **6.15 m** (M3 top = 5.20 + 0.95).
- Canopy bottom **3.50** (M1's flat base) → trunk top 3.85 is **0.35 m inside** (K4 ✓).
- Canopy main-mass width: x [−2.95, 2.95] = **5.90 m**; z [−2.30, 2.30] = 4.60 m.
- Canopy height **2.65 m** (3.50 → 6.15) < 5.90 ✓ (K3).
- Aspect **6.15 / 5.90 = 1.042**.
- M2's base-cap centre (1.35, −0.60) lies inside M1's solid at y = 4.00 ✓ (K6); M3's bottom pole
  (−0.35, 0.25) lies inside M1 ✓; M4's base-cap centre (−1.45, 0.95) lies inside M1 ✓.

#### 6.3.3 T3 — Cluster (`nat_tree_cluster_a`)

| # | Primitive | Shape / sides | Slot | Position | Radii / size | Yaw |
|---|---|---|---|---|---|---|
| T | `NatColumn` | 6 | `trunk` | axis (0, 0), `y0` 0, `h` **3.60** | `r` 0.26 | 0° |
| F | `NatColumn` (flare) | 6 | `bark_dark` | axis (0, 0), `y0` 0, `h` **0.26** | `r` 0.36 | 0° |
| M1 | `NatMass` | `orb`, 9 | `canopy_green_a` | (0.00, **4.55**, 0.00) | rx 1.45, ry 1.30, rz 1.40 | 0° |
| M2 | `NatMass` | `orb`, 7 | `canopy_green_b` | (1.25, 4.05, 0.30) | rx 0.95, ry 0.80, rz 0.90 | 15° |
| M3 | `NatMass` | `orb`, 7 | `canopy_green_b` | (−1.30, 4.45, −0.45) | rx 0.85, ry 0.75, rz 0.85 | 30° |
| M4 | `NatMass` | `orb`, 7 | `canopy_green_c` | (0.10, 5.70, −0.10) | rx 1.00, ry 0.90, rz 0.95 | 45° |
| S1 | `NatBox` (optional) | — | `canopy_green_c` | (2.35, 3.90, −0.25) | 0.70 × 0.45 × 0.70 | 0° |

- Total height **6.60 m** (M4 top = 5.70 + 0.90).
- Canopy bottom **3.25** (M1) → trunk top 3.60 is **0.35 m inside** (K4 ✓).
- Canopy main-mass width: x [−2.15, 2.20] = **4.35 m**; z [−1.40, 1.40] = 2.80 m (M2 z [−0.60, 1.20],
  M3 z [−1.30, 0.40]).
- Canopy envelope with S1: x [−2.15, 2.70] = **4.85 m** ≤ 6.00 ✓.
- Canopy height **3.35 m** < 4.35 ✓.
- Aspect **6.60 / 4.35 = 1.517**.
- K6: M2's centre lies inside M1 ✓; M3's centre lies inside M1 ✓; M4's bottom pole lies inside M1 ✓.

#### 6.3.4 T4 — Blossom (`nat_tree_blossom_a`) — the pink accent species

| # | Primitive | Shape / sides | Slot | Position | Radii / size | Yaw |
|---|---|---|---|---|---|---|
| T | `NatColumn` | 6 | `trunk` | axis (0, 0), `y0` 0, `h` **4.45** | `r` 0.30 | 0° |
| F | `NatColumn` (flare) | 6 | `bark_dark` | axis (0, 0), `y0` 0, `h` **0.28** | `r` 0.42 | 0° |
| M1 | `NatMass` | `drum`, 9 | `canopy_pink_b` | (0.00, **5.00**, 0.00) | rx 2.35, ry 1.15, rz 2.20 | 0° |
| M2 | `NatMass` | `drum`, 9 | `canopy_pink` | (0.30, 5.90, −0.25) | rx 1.55, ry 1.00, rz 1.45 | 15° |
| M3 | `NatMass` | `drum`, 7 | `canopy_pink_b` | (−1.40, 4.95, 0.75) | rx 1.05, ry 0.80, rz 1.00 | 30° |
| M4 | `NatMass` | `orb`, 7 | `canopy_pink` | (0.15, 6.45, 0.10) | rx 0.95, ry 0.65, rz 0.90 | 45° |
| S1 | `NatBox` (optional) | — | `canopy_pink` | (2.55, 5.35, 0.85) | 0.85 × 0.55 × 0.85 | 0° |

- Total height **7.10 m** (M4 top = 6.45 + 0.65).
- Canopy bottom = M1's bottom cap = 5.00 − 0.7071 × 1.15 = **4.187 m** → trunk top 4.45 is
  **0.263 m inside** (K4 ✓).
- Canopy main-mass width: x [−2.45, 2.35] = **4.80 m**; z [−2.20, 1.75] = 3.95 m.
- Canopy envelope with S1: x [−2.45, 2.975] = **5.425 m** ≤ 6.00 ✓.
- Canopy height **2.91 m** (4.187 → 7.10) < 4.80 ✓.
- Aspect **7.10 / 4.80 = 1.479**.
- The `drum` masses are the deliberate "chunkier faceted blossom mass" of REF-002 §2.

#### 6.3.5 G1 — Shrub (`nat_shrub_a`)

Outside the 6–9 m tree band by design — it is the "small sapling" read, separated from the trees by
absolute size, not aspect ratio. No trunk (a shrub has a woody base only).

| # | Primitive | Shape / sides | Slot | Position | Radii |
|---|---|---|---|---|---|
| M1 | `NatMass` | `orb`, 9 | `canopy_green_a` | (0.00, **0.55**, 0.00) | rx 0.70, ry 0.55, rz 0.65 |
| M2 | `NatMass` | `orb`, 7 | `canopy_green_b` | (0.25, 0.95, −0.15) | rx 0.45, ry 0.42, rz 0.42 |
| M3 | `NatMass` | `orb`, 7 | `canopy_green_c` | (−0.20, 1.05, 0.20) | rx 0.34, ry 0.45, rz 0.32 |

- Total height **1.50 m** (M3 top = 1.05 + 0.45); width **1.40 m** (M1 x ±0.70).
- M1's bottom pole is at y = 0.00 → the shrub touches the ground (P7 ✓).
- M2's centre and M3's bottom pole lie inside M1 ✓ (K6).

### 6.4 The block satellite (the only box allowed in a canopy)

| ID | Rule |
|---|---|
| **B1** | **≤ 1 per tree.** Present in **1 of 3 instances** of T1, T3 and T4; never on T2 (its main mass is already at the top of the 4–6 m band). |
| **B2** | It is a **flat** box: its smallest dimension ≤ 0.55 m, and it is never taller than it is wide. |
| **B3** | It must **overlap** the canopy mass it decorates by ≥ 0.05 m on one axis (P8). It is attached, never floating. |
| **B4** | Size **0.70 – 0.90 m**. It never exceeds 12 % of the canopy's projected area. |
| **B5** | Its slot is the canopy's **highlight** mass slot (`canopy_green_c` / `canopy_pink`). |
| **B6** | **A canopy is never fewer than 2 masses.** If a programmer is unsure whether a piece belongs in the canopy, it is a **mass**, not a box. |

### 6.5 Triangle budget

| Asset | Primitives | Triangles |
|---|---|---|
| T1 Spire | 3 `orb` (9+7+7) + 1 box + column + flare | 54+42+42+12+24+24 = **198** |
| T2 Table | `dome`(11)+`dome`(9)+`orb`(9)+`dome`(7) + column + flare | 44+36+54+28+24+24 = **210** |
| T3 Cluster | 4 `orb` (9+7+7+7) + 1 box + column + flare | 54+42+42+42+12+24+24 = **240** |
| T4 Blossom | 2 `drum`(9) + `drum`(7) + `orb`(7) + 1 box + column + flare | 54+54+42+42+12+24+24 = **252** |
| G1 Shrub | 3 `orb` (9+7+7) | 54+42+42 = **138** |

**Hard cap: 260 triangles per standing tree, 150 per shrub.** Exceeding it is a review failure.

### 6.6 Variation rules (v2)

A tree instance is generated from **one integer seed** (D-006). The mesh is deterministic: same seed
+ same species + same variant ⇒ same tree, every time.

```
seed -> mulberry32(seed) -> jitter the authored primitive list -> validate (K1..K10) -> emit
```

| # | Parameter | Range | Applies to |
|---|---|---|---|
| **V1** | Canopy group lateral offset | **−0.35 … +0.35 m** in x **and** z (independent) | The whole canopy group as a rigid translation. Produces the "lean" read with no rotation. |
| **V2** | Per-mass radius jitter | **± 8 %** of the authored `rx/ry/rz`, rounded to **0.05 m**, clamped so no radius falls below **0.25 m** | Every canopy mass |
| **V3** | Per-mass position jitter | **± 0.30 m** in x and z, **± 0.20 m** in y, rounded to **0.05 m** | Every canopy mass |
| **V4** | Trunk circumradius | **−0.04 … +0.04 m**, rounded to 0.05 m | The trunk column and its flare (the flare stays 0.10 m wider) |
| **V5** | Trunk height | **−0.60 … +0.60 m** | The trunk column only |
| **V6** | Mass yaw | **± 15°** in 15° steps | Every mass (the facet phase rotates by one step) |
| **V7** | Block satellite | **0 or 1**; present in **1 of 3** instances | T1, T3, T4 only |
| **V8** | `sides` | **not jittered** — authored per variant | — |
| **V9** | `shape` | **not jittered** — it defines the silhouette class | — |

**What must NOT be jittered:** the number of primitives per species, the shape and `sides` of a
mass, the trunk being a single column, the trunk's slot, and the mass slot assignment.

**Hard clamps after jitter** (K1–K10 in §6.2). A jittered tree that breaks a clamp is **rejected
and regenerated with the next seed value** — it is never clamped into a broken state.

### 6.7 Authored variant counts

| Family | Authored variants | Suffixes | Runtime jitter | Max identical-looking within 20 m |
|---|---|---|---|---|
| T1 Spire | **4** | `_a` `_b` `_c` `_d` | Yes (V1–V7) | 3 |
| T2 Table | **4** | `_a` `_b` `_c` `_d` | Yes | 3 |
| T3 Cluster | **3** | `_a` `_b` `_c` | Yes | 3 |
| T4 Blossom | **2** | `_a` `_b` | Yes | 2 |
| G1 Shrub | **3** | `_a` `_b` `_c` | Yes | 6 |
| R1 rock 0.8 | **3** | `_a` `_b` `_c` | Box offsets only, ±0.15 m | 5 |
| R2 rock 1.8 | **3** | `_a` `_b` `_c` | Box offsets only, ±0.25 m | 4 |
| R3 rock 3.0 | **3** | `_a` `_b` `_c` | Box offsets only, ±0.35 m | 3 |
| Ore crystal small | **2** | `_a` `_b` | Vein face + offset | 2 |
| Ore crystal large | **2** | `_a` `_b` | Vein faces + offset | 2 |
| **Total authored meshes** | **29** | | | |

**Variant differences are compositional, not cosmetic.** Tree variants differ in which mass is the
shade/highlight mass, the `sides` count of one mass, the facet phase, and whether the block
satellite is present — they are not colour swaps.

---

## 7. Tree states — standing, partially harvested, stump

`ResourceNode` states are `'full' | 'partial' | 'depleted'` (Technical Architecture §3). The tree
states map onto them unchanged from v1.0:

| Art state | Sim state | Suffix | Resource type | Yield |
|---|---|---|---|---|
| Standing | `full` | *(none)* | `wood` | 100 % of the node's max |
| Partially harvested | `partial` | `_partial` | `wood` | 25–50 % remaining |
| Stump | `depleted` | `_stump` | `wood` | 0 %; the node is cleared |

**Standing** = the authored composition of §6.3 with jitter applied.

### 7.1 Partially harvested (`_partial`)

**Rule (unchanged from v1.0):** the crown has been **felled** — it is no longer on the trunk. The
trunk is **cut flat**, the cut face is exposed and coloured, and the **felled crown lies on the
ground beside the stem**. A clean cut is the only honest harvest read because trunks have no taper
and no branches.

| Species | Trunk column (`r`, `h`) | Cut-face cap | Felled crown on the ground |
|---|---|---|---|
| **T1 Spire** | r 0.28, `y0` 0, `h` **3.95** | 6-gon column, r **0.31**, `y0` 3.95, `h` 0.05, `strata_ochre` | `drum` mass, sides 9, centre (1.85, **0.297**, 0.55), rx 1.30, ry 0.42, rz 1.15, `canopy_green_b` + 2 cut-limb boxes |
| **T2 Table** | r 0.34, `y0` 0, `h` **3.45** | r **0.37**, `y0` 3.45, `h` 0.05 | `drum` mass, sides 9, centre (2.15, **0.255**, 0.65), rx 1.60, ry 0.36, rz 1.35, `canopy_green_b` + 2 cut-limb boxes |
| **T3 Cluster** | r 0.26, `y0` 0, `h` **3.15** | r **0.29**, `y0` 3.15, `h` 0.05 | `drum` mass, sides 7, centre (1.60, **0.198**, 0.45), rx 1.00, ry 0.28, rz 0.95, `canopy_green_b` + 2 cut-limb boxes |
| **T4 Blossom** | r 0.30, `y0` 0, `h` **3.85** | r **0.33**, `y0` 3.85, `h` 0.05 | `drum` mass, sides 9, centre (1.75, **0.283**, 0.60), rx 1.30, ry 0.40, rz 1.15, `canopy_pink` + 2 cut-limb boxes |
| **G1 Shrub** | *(no trunk)* | — | M1 only, radii scaled to rx 0.55, ry 0.55, rz 0.52, centre (0, 0.55, 0); M2 and M3 removed |

- **Felled-crown placement rule:** a `drum` mass rests on the ground with its **bottom cap exactly
  at y = 0.00**, i.e. the mass centre is at `ry · 0.7071`. It never sinks into the ground.
- **Cut-limb boxes:** two `NatBox` primitives, **0.30 × 0.12 × 0.30** in `strata_ochre`, sitting
  **on** the felled crown's top cap (y = `2 · ry · 0.7071` … +0.12), at ±0.55 m from the crown's
  centre along X. They read as the sawn-off limbs.
- **Total height of a partially harvested tree: 3.20 – 4.00 m** — below the 6–9 m standing band,
  above the 0.55–0.80 m stump. Three states, three heights, no overlap.
- The **pink mass on the ground** is the loudest cue in the whole sheet — a felled pink tree is
  unmistakable at 45 m.
- **Resource:** `wood`, 25–50 % of the standing node's yield remaining.

### 7.2 Stump (`_stump`)

**Rule (unchanged):** the trunk is cut down to a low nub. Optionally one felled log lies beside it.
There is **no crown**.

| Species | Stump column (`r`, `h`) | Cut-face cap | Optional log |
|---|---|---|---|
| **T1 Spire** | r 0.28, `y0` 0, `h` **0.65**, slot `bark_dark` | r **0.31**, `y0` 0.65, `h` 0.05, `strata_ochre` | `NatBox` 2.00 × 0.35 × 0.35 at (1.30, 0.175, 0.55), `bark_dark` |
| **T2 Table** | r 0.34, `y0` 0, `h` **0.75** | r **0.37**, `y0` 0.75, `h` 0.05 | `NatBox` 2.20 × 0.40 × 0.40 at (1.45, 0.20, 0.60) |
| **T3 Cluster** | r 0.26, `y0` 0, `h` **0.55** | r **0.29**, `y0` 0.55, `h` 0.05 | `NatBox` 1.80 × 0.30 × 0.30 at (1.20, 0.15, 0.50) |
| **T4 Blossom** | r 0.30, `y0` 0, `h` **0.70** | r **0.33**, `y0` 0.70, `h` 0.05 | `NatBox` 1.90 × 0.32 × 0.32 at (1.25, 0.16, 0.52) |
| **G1 Shrub** | *(no stump)* | — | G1's stump state is **empty** |

- **Log presence:** 1 of 2 stumps carries a log (seeded). The log's two end faces are
  `strata_ochre`: two `NatBox` end caps, 0.06 m thick and **0.02 m wider** than the log in Y and Z,
  butting the log's ends (P8 ✓).
- **Total height 0.55 – 0.80 m.** At 45 m this is a 19–28 px dark nub at 1080p — it must be found
  by its position in a clearing, not by its silhouette alone. A stump is a *state*, not a resource
  the player must spot from the map.
- **Resource:** `wood`, 0 % — the node is cleared and removed from the sim on transition.

---

## 8. Rock families

### 8.1 Design constraints

| Constraint | Value | Source |
|---|---|---|
| Rock sizes | **0.8 m, 1.8 m, 3.0 m** | ADB §5, task brief |
| Form | "blocky faceted clusters" — stepped boxes of different sizes, **never a single box** | ADB §3.8, REF-002 §1 |
| Read | "bare pale stone, faceted, no grass cap" | ADB §7 |
| Geometry language | **Voxel/block — unchanged.** REF-002 §1 keeps rocks blocky | Brief item 5 |
| Colour | the pale stone family only: `stone_top` + `stone_body_b` (+ `stone_shade` on R3) | palette_v2, D-014 |
| Placement | scenery **and** a stone resource node | task brief |
| State | every harvestable node needs a depleted representation | `Voxel_Style_Guide.md` §5 |

### 8.2 Compositions — **geometry identical to v1.0**

Each size class is a cluster of boxes. **The bounding-box maximum dimension equals the nominal
size** — that is how the size is specified and how it is checked.

**R1 — Small, 0.8 m class (`nat_rock_small_a`)**

| Box | Slot | sx | sy | sz | cx | cy | cz |
|---|---|---|---|---|---|---|---|
| 1 | `stone_top` | 0.80 | 0.40 | 0.70 | 0.00 | 0.20 | 0.00 |
| 2 | `stone_top` | 0.50 | 0.30 | 0.45 | 0.10 | 0.50 | −0.05 |
| 3 | `stone_body_b` | 0.30 | 0.20 | 0.30 | −0.20 | 0.60 | 0.10 |

Bounding box 0.80 × 0.70 × 0.70 → max **0.80** ✓. Height 0.70.
Silhouette at 45 m: a low stepped pebble — **24 px** at 1080p. Too small to be a landmark, so
**R1 must be placed in clusters of 4–9 within a 3 m radius**, and the cluster counts as one
harvestable node. A single R1 is scenery only.

**R2 — Medium, 1.8 m class (`nat_rock_medium_a`)**

| Box | Slot | sx | sy | sz | cx | cy | cz |
|---|---|---|---|---|---|---|---|
| 1 | `stone_top` | 1.80 | 0.90 | 1.50 | 0.00 | 0.45 | 0.00 |
| 2 | `stone_top` | 1.20 | 0.70 | 1.00 | 0.15 | 1.10 | −0.10 |
| 3 | `stone_body_b` | 0.70 | 0.50 | 0.60 | −0.40 | 1.40 | 0.25 |

Bounding box **1.80** × 1.60 × 1.50 → max **1.80** ✓. Height 1.60.
Silhouette at 45 m: a stepped mound with a small off-axis cap — **56 px** tall, with a visible
notch between box 1 and box 2. The default **stone resource** node.

**R3 — Large, 3.0 m class (`nat_rock_large_a`)**

| Box | Slot | sx | sy | sz | cx | cy | cz |
|---|---|---|---|---|---|---|---|
| 1 | `stone_top` | 3.00 | 1.40 | 2.40 | 0.00 | 0.70 | 0.00 |
| 2 | `stone_top` | 1.80 | 1.00 | 1.40 | 0.30 | 1.80 | −0.20 |
| 3 | `stone_body_b` | 1.10 | 0.90 | 0.90 | −0.60 | 2.40 | 0.40 |
| 4 | `stone_shade` | 0.60 | 0.50 | 0.55 | 0.90 | 2.20 | −0.70 |

Bounding box **3.00** × 2.85 × 2.40 → max **3.00** ✓. Height 2.85.
Silhouette at 45 m: a broad mass with an off-axis spire and one detached chip — **99 px** tall.
Reads as a landmark boulder / cliff foot.

**Construction rules (all sizes) — unchanged from v1.0:**
- Every cluster is **3–4 boxes**, never fewer, never more.
- At least one box is **≤ 60 %** of the largest box's width.
- No two boxes share the same top y (no coplanar front-facing tops, guide G8).
- The largest box is always box 1 and always sits on the ground.
- Box 1 spans the full footprint; boxes 2–4 are offset and smaller.
- **New:** each cluster uses **at most 2 slots** (R3 may use 3), always from
  {`stone_top`, `stone_body_b`, `stone_shade`}. A rock is never two different stone families.

### 8.3 Depleted state (`_depleted`)

**Rule (unchanged):** depletion removes whole boxes. It never shrinks a box in place, never adds
debris, never changes the material. The depleted rock must not be mistakable for a full one at 45 m.

| Class | Depleted composition (all `stone_top`) | Height | Bbox max | Screen height @45 m |
|---|---|---|---|---|
| R1 0.8 | 0.50 × 0.20 × 0.45 at (0, 0.10, 0) · 0.20 × 0.12 × 0.20 at (−0.15, 0.26, 0.05) | 0.32 | 0.50 | 11 px |
| R2 1.8 | 1.10 × 0.40 × 0.90 at (0, 0.20, 0) · 0.40 × 0.25 × 0.35 at (−0.25, 0.50, 0.10) | 0.62 | 1.10 | 22 px |
| R3 3.0 | 1.80 × 0.70 × 1.40 at (0, 0.35, 0) · 0.80 × 0.40 × 0.65 at (0.20, 0.90, −0.10) | 1.10 | 1.80 | 38 px |

- Depleted height ≤ 45 % of the full rock's height; depleted bbox max ≤ 65 % of the full rock's.
- A depleted rock **stays in place** (no scatter debris) — the player must see that *this* spot is
  worked out.
- Resource: `stone`, 0 % remaining.

### 8.4 Does a rock read as **pale faceted stone**, not as terrain? (confirmation clause)

The brief requires this explicitly, and it is a real risk: `palette_v2` gives the **terrain** and
the **rock** the same pale stone family. The separating evidence is measurable:

| Comparison | Terrain | Rock | Separation |
|---|---|---|---|
| Vertical stone face | `stone_body_a` `#DCD3BE` (Y 0.655) / `stone_body_b` `#D1C7AF` (Y 0.575) | `stone_top` `#E6DFCC` (Y 0.740) | rock's vertical faces are **+12.9 %** (vs `stone_body_a`) and **+28.6 %** (vs `stone_body_b`) brighter |
| Horizontal stone face | `stone_top` `#E6DFCC` | `stone_top` `#E6DFCC` | **0 %** — the top faces are the same value, so the top faces alone must not carry the read |
| Edge profile | a cliff face is **one planar vertical run**; terrain has no horizontal step edges | **two or three hard horizontal step edges** at 0.40–1.40 m, each throwing a shadow line | the step edges are the primary cue |
| Against grass | `grass_top` `#79B94C` (Y 0.393) | `stone_top` (Y 0.740) | **+88.3 %** — a rock on grass is unmistakable |

**Therefore the following rules are binding:**

| ID | Rule |
|---|---|
| **R1** | A rock's **vertical faces use `stone_top`** (never `stone_body_a`/`stone_body_b`), so a rock is always brighter than the terrain's cut stone. |
| **R2** | A rock must show **at least two visible horizontal step edges** at 45 m. A single-box rock is forbidden (already in the construction rules). |
| **R3** | A rock's **top faces are `stone_top`**, identical to a bare terrain stone top — so a rock may only be read by its **step edges, its brightness on the vertical faces, and its shadow**, never by its top-face colour alone. |
| **R4** | **Standalone rocks are placed on grass-topped cells only.** On a bare stone-top cell, the only permitted stone asset is an **ore host** (§9), whose violet accent carries the read. This matches GLM's ore-zone rule ("clusters sit on stone-top cells") and keeps boulders from melting into the rocky biome. |
| **R5** | A rock **never carries a grass cap** (ADB §7). Grass creeping over a rock is a terrain effect and is not authored here. |
| **R6** | Rock jitter is **offset only** — never resized, never re-boxed — because a rock's size class is its gameplay meaning. |

---

## 9. Ore deposits — violet crystal

### 9.1 Design constraints

| Constraint | Value | Source |
|---|---|---|
| Form | "stone + one saturated accent colour" | ADB §7 |
| Accent colour | **exactly one saturated hue per deposit: violet crystal** | D-015, ADB §7 |
| Accent slots | `ore_crystal` `#7B5AD6` + `ore_crystal_b` `#9B7BE8` (highlight) | palette_v2, brief item 4 |
| Magenta / violet **emissive** | **forbidden** — `#D24BFF` is reserved for effects | ADB §6, REF-001 §7, brief item 4 |
| Size | inherits the rock size classes | task brief |
| States | full / partial / depleted, with the accent removed at depletion | `Voxel_Style_Guide.md` §5 |

### 9.2 Ore families

Two ore appearances, both mapping to sim `ResourceType: 'ore'`.

| Ore | ID stem | Accent slots | Host rock class | Total height | Screen height @45 m |
|---|---|---|---|---|---|
| **Crystal vein** | `nat_ore_crystal_small_` | `ore_crystal` + `ore_crystal_b` | R2 (1.8 m) | 1.60 m | 56 px |
| **Crystal cluster** | `nat_ore_crystal_large_` | `ore_crystal` + `ore_crystal_b` | R3 (3.0 m) | 2.85 m | 99 px |

**Readability rule (unchanged from v1.0):** an ore deposit must never use the R1 (0.8 m) size
class. At 45 m an R1 is 24 px tall and its accent patch would be ~4 px — below the threshold at
which colour can carry the read (ADB §7 requires ore to be distinguishable by colour **and**
silhouette). **R2 is the minimum ore size.**

### 9.3 Compositions

**Crystal vein (`nat_ore_crystal_small_a`)** — R2 body + one vein slab + one highlight cap:

| Box | Slot | sx | sy | sz | cx | cy | cz | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | `stone_top` | 1.80 | 0.90 | 1.50 | 0.00 | 0.45 | 0.00 | R2 body box 1 |
| 2 | `stone_top` | 1.20 | 0.70 | 1.00 | 0.15 | 1.10 | −0.10 | R2 body box 2 |
| 3 | `stone_body_b` | 0.70 | 0.50 | 0.60 | −0.40 | 1.40 | 0.25 | R2 body box 3 |
| V1 | `ore_crystal` | **0.90** | **0.35** | **0.20** | 0.10 | 0.45 | **0.75** | Vein slab emerging from the +z face. z spans [0.65, 0.85]: overlaps the body by 0.10, protrudes 0.10 beyond the body's +z face (0.75). Visible accent face 0.90 × 0.35 = **0.32 m²**. |
| H1 | `ore_crystal_b` | **0.50** | **0.14** | **0.07** | 0.10 | 0.45 | **0.865** | Highlight facet on the vein's outer face. z spans [0.83, 0.90]: overlaps the vein by 0.02, protrudes 0.05 beyond it. x and y are inset 0.15 / 0.10 from the vein's edges → no coplanar face. Visible highlight face 0.50 × 0.14 = **0.07 m²**. |

**Crystal cluster (`nat_ore_crystal_large_a`)** — R3 body + two vein slabs + two highlight caps:

| Box | Slot | sx | sy | sz | cx | cy | cz | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | `stone_top` | 3.00 | 1.40 | 2.40 | 0.00 | 0.70 | 0.00 | R3 body box 1 |
| 2 | `stone_top` | 1.80 | 1.00 | 1.40 | 0.30 | 1.80 | −0.20 | R3 body box 2 |
| 3 | `stone_body_b` | 1.10 | 0.90 | 0.90 | −0.60 | 2.40 | 0.40 | R3 body box 3 |
| 4 | `stone_shade` | 0.60 | 0.50 | 0.55 | 0.90 | 2.20 | −0.70 | R3 body box 4 |
| V1 | `ore_crystal` | **1.30** | **0.45** | **0.20** | −0.20 | 0.75 | **1.15** | Vein emerging from the +z face. z spans [1.05, 1.25]: overlaps the body by 0.15, protrudes 0.05 beyond the body's +z face (1.20). Visible accent face 1.30 × 0.45 = **0.59 m²**. |
| V2 | `ore_crystal` | **0.20** | **0.45** | **1.10** | **1.45** | 0.80 | −0.10 | Vein emerging from the +x face. x spans [1.35, 1.55]: overlaps the body by 0.15, protrudes 0.05 beyond the body's +x face (1.50). Visible accent face 0.45 × 1.10 = **0.50 m²**. |
| H1 | `ore_crystal_b` | **0.80** | **0.18** | **0.07** | −0.20 | 0.75 | **1.265** | Highlight on V1's outer face. z spans [1.23, 1.30]: overlaps the vein by 0.02, protrudes 0.05 beyond it. x and y inset 0.25 / 0.135 from the vein's edges → no coplanar face. Visible highlight face 0.80 × 0.18 = **0.14 m²**. |
| H2 | `ore_crystal_b` | **0.07** | **0.18** | **0.80** | **1.565** | 0.80 | −0.10 | Highlight on V2's outer face. x spans [1.53, 1.60]: overlaps the vein by 0.02, protrudes 0.05 beyond it. Visible highlight face 0.18 × 0.80 = **0.14 m²**. |

Total violet accent ≈ 1.09 m² of vein face + 0.29 m² of highlight face = **1.38 m²** of a
≈ 6.6 m² visible surface = **21 %** ✓ (inside the 10–25 % band). The vein slabs alone cover 16 %.

### 9.4 Vein and highlight construction rules

- A vein is a **thin slab, 0.20 m thick**, lying against one face of the body: its broad face is
  parallel to the rock face it emerges from, and it **protrudes 0.05–0.10 m** out of the rock. It is
  never a face recolour and never a large patch.
- The vein **overlaps** the body by **0.10–0.15 m** on the face normal, so it is bonded to the rock
  and never floats (guide §2.2 G8).
- The vein's other four faces are **inside** the body, so the vein has no coplanar face with the
  rock it emerges from. There is no z-fighting.
- **A highlight cap is a box that overlaps its parent vein by ≥ 0.02 m on the vein's outer face
  normal and protrudes ≤ 0.06 m beyond it.** It is inset from the vein's other three edges by
  ≥ 0.05 m, so it never shares a coplanar face with the vein and never floats off it. The cap's
  visible face is ≤ 40 % of the vein's visible face.
- Veins are **never** magenta, and never emissive.
- The accent occupies **10–25 %** of the deposit's visible surface. Below 10 % it will not read at
  45 m; above 25 % the deposit stops looking like stone.
- A deposit carries **one accent hue only** — violet, in two values. Never two hues.
- Vein count: small 1, large 2 (the larger, rarer deposit gets the richer read).
- **The violet is distinct from the water** (`water_mid` `#3AAFC4`, hue 189°) by **67° of hue** and
  from the pink blossom (336°) by **80° of hue** — this is why teal/copper were retired (D-015).
  Teal `accent_teal` `#2FA6A0` (hue 177°) is only **12°** from the water and **79°** from the
  violet: it could carry neither read.

### 9.5 Ore state rules

| State | Sim state | Rule |
|---|---|---|
| **Full** | `full` | Body as authored; all vein slabs and highlight caps present. Accent area 10–25 %. |
| **Partial** | `partial` | **One** vein slab removed (the large deposit loses V2, with its cap H2) and the body loses its smallest box (small: box 3; large: box 4). Accent area falls to 4–12 %. |
| **Depleted** | `depleted` | **All vein slabs and caps removed** and the body is reduced to the R×-depleted composition for its size class (§8.3). |

**Absolute rule:** a depleted deposit contains **zero** saturated accent colour. This is what makes
"colour = ore, no colour = spent" a rule the player can learn (ADB §7). A depleted crystal deposit
is *not* a grey rock — it is a rock with no colour on it, and the player learns to read absence.

**Resource type:** `ore` for all three states.

---

## 10. Species mix for the first world — **data**

> **Definition used throughout:** a **tree instance** is a *standing* instance of T1, T2, T3 or T4.
> Harvested states (`_partial`, `_stump`) are the same node and are **not** extra instances. Shrubs
> (G1) are **not** tree instances and are budgeted separately.

### 10.1 Global mix table — per 100 standing tree instances

| Species | Colour class | Instances per 100 | Allowed band | Authored variants |
|---|---|---|---|---|
| **T1 Spire** | green | **28** | 20 – 35 | 4 |
| **T2 Table** | green | **34** | 25 – 42 | 4 |
| **T3 Cluster** | green | **26** | 18 – 30 | 3 |
| **T4 Blossom** | **pink** | **12** | **0 – 25 (hard cap)** | 2 |
| **Total** | — | **100** | — | 13 |

**Pink share = 12 % ≤ 25 % ✓.** The cap is enforced by the algorithm in §10.3, not by hope.

### 10.2 Pink grove rule — "occasional pink blossom groves"

Pink must read as a **grove accent**, not as confetti. The numbers:

| ID | Rule |
|---|---|
| **G1** | **70 %** of pink instances belong to a **grove**. The remaining 30 % are lone specimens. |
| **G2** | A grove is **3 – 7 pink trees** with a centre-to-centre spacing of **3.5 – 5.0 m** and a grove diameter ≤ **18 m**. |
| **G3** | At most **1 grove per 40 m radius**; at most **4 groves per 100 tree instances**. |
| **G4** | Groves are placed only in **forest interior, forest edge and lakeshore** (§11). A grove never forms in open plain or on rocky terrain. |
| **G5** | A grove never contains a green tree inside it. The 4.5 m buffer around a grove is **green-only**, so a grove reads as a distinct patch. |

### 10.3 Mix enforcement algorithm (implement literally)

Species assignment happens **before** mesh construction, so the cap can be enforced on data alone.

```
for each candidate tree position P in the world (GLM's placement pass, §11):
    region = biome(P)                         // one of the 5 rows of §11
    if region == 'forest interior' or 'forest edge' or 'lakeshore':
        if groveMode(P):                      // §10.2 G2..G4
            species = T4
        else:
            species = weightedPick([T1,T2,T3], weights[region])   // green only
    else:
        species = weightedPick([T1,T2,T3,T4], weights[region])      // may be T4

    // ---- the hard pink cap (D-013) ----
    if species == T4:
        if (pinkCount + 1) > 0.25 * (treeCount + 1):
            species = T3                      // fallback: green, never another pink
            pinkOverflow++
        else:
            pinkCount++
    treeCount++
```

| ID | Rule |
|---|---|
| **X1** | The cap is checked **per insertion**, so it can never be exceeded at any point in the generation order. |
| **X2** | The fallback species is **T3** (the lumpy green), so the silhouette variety is preserved when a pink is refused. |
| **X3** | `pinkOverflow` is logged in the generation report. A non-zero value is **not** an error — it means the biome weights asked for more pink than the cap allows, and the cap won. |
| **X4** | The cap is a property of the **world**, not of a region. A region may exceed 25 % pink locally only if the world total stays ≤ 25 %. |

### 10.4 Weighted mix per biome (the weights fed to `weightedPick`)

These are the `weights[region]` arrays used above, in the order `[T1, T2, T3, T4]`. They are
percentages and must sum to 100.

| Region | T1 | T2 | T3 | **T4 (pink)** |
|---|---|---|---|---|
| Forest interior | 32 | 38 | 20 | **10** |
| Forest edge | 28 | 34 | 20 | **18** |
| Open plain | 40 | 30 | 25 | **5** |
| Lakeshore | 25 | 30 | 30 | **15** |
| Rocky terrain | 45 | 20 | 33 | **2** |

### 10.5 The mix that comes out (a worked 100-tree sample)

Using the region weights above and the world composition implied by §11 (62 trees in the forest
interior, 24 at the forest edge, 4 on the plain apron, 8 at the lakeshore, 2 on rocky terrain):

| Region | Trees | × T4 weight | Pink trees |
|---|---|---|---|
| Forest interior | 62 | 10 % | 6.20 |
| Forest edge | 24 | 18 % | 4.32 |
| Open plain | 4 | 5 % | 0.20 |
| Lakeshore | 8 | 15 % | 1.20 |
| Rocky terrain | 2 | 2 % | 0.04 |
| **Total** | **100** | — | **11.96 ≈ 12 pink** |

**12 % pink ≤ 25 % ✓.** The grove rule (§10.2) then clusters those 12 into ≈ 2–3 groves.

### 10.6 Shrub budget (not tree instances)

| Region | Shrubs per 100 m² | Notes |
|---|---|---|
| Forest interior | 2.0 – 4.0 | the ground texture that makes a forest read as a forest |
| Forest edge | 1.5 – 3.0 | |
| Open plain | 0.2 – 0.6 | sparse — "empty ground is a feature" (ADB §3.6) |
| Lakeshore | 1.0 – 2.5 | |
| Rocky terrain | 0.1 – 0.4 | |

---

## 11. Biome placement table

**This is an art-side constraint table.** The *algorithm* is GLM's (`Voxel_Style_Guide.md` §5); this
sheet states what the art requires of it. Region names are taken from
`06_Voxel_Studio/Biomes/start_map_v1.json` so the two documents can be diffed.

| Region | Definition (from `start_map_v1.json`) | Tree density (trees / 100 m²) | Mean spacing | Species mix T1/T2/T3/T4 | Shrub density /100 m² | Rock density /100 m² | Notes |
|---|---|---|---|---|---|---|---|
| **Forest interior** | forest rect `[64,24]–[104,52]`, inset 12 m from the rect edge | **4.0 – 7.0** | 3.78 – 5.00 m | 32 / 38 / 20 / **10** | 2.0 – 4.0 | 0.2 – 0.6 | GLM's 3 m lattice with a density fbm > 0.40 already produces ≈ 6.1 trees/100 m² over the rect — **inside the band** ✓. 68 trees are GLM's current count; at 4.0–7.0/100 m² over 1120 m² the interior alone wants 45–78 trees, so GLM's 68 is consistent. |
| **Forest edge** | the outer **12 m** band of the forest rect + the grass apron out to 15 m | **1.5 – 3.0** | 5.77 – 8.16 m | 28 / 34 / 20 / **18** | 1.5 – 3.0 | 0.4 – 1.0 | The **pink concentration zone**. The edge thins and the accent groves live here, so a grove is seen from the plain before it is entered. |
| **Open plain** | **0 trees inside** the buildable plain rect `[16,80]–[53,101]` (GLM rule); **0.3 – 0.8** in the surrounding grass apron, outside the 7 m feather | **0.00** (inside) / **0.3 – 0.8** (apron) | ≥ 11.2 m (apron) | 40 / 30 / 25 / **5** | 0.2 – 0.6 | 0.1 – 0.3 | The plain stays empty (ADB §8: "one clear focal region"). The apron carries 1–4 lonely spires as scale cues and nothing else. |
| **Lakeshore** | land within **12 m** of the water edge of the lake ellipse `[76,91] r 16×13` and the river polyline | **0.8 – 2.0** | 7.07 – 11.18 m | 25 / 30 / 30 / **15** | 1.0 – 2.5 | 0.3 – 0.8 | A treed shore gives the turquoise water a dark frame (ADB §8: "water within sight"). Keep the last **4 m** to the water clear of trees so the shore stays hard-edged. |
| **Rocky terrain** | the rocky sub-rect `[96,56]–[120,84]` (1418 stone-top cells) and the massif's stone apron | **0.0 – 0.4** | ≥ 15.8 m | 45 / 20 / 33 / **2** | 0.1 – 0.4 | 0.5 – 1.2 | **No trees on bare stone-top cells.** Trees stand on the grass terraces below the stone, so a spire on a terrace reads against the cliff (ADB §8: "one strong vertical mass"). |

**Additional placement constraints:**

| ID | Rule |
|---|---|
| **PB1** | **No tree stands on a bare stone-top cell.** Rocks and ore may; trees may not. |
| **PB2** | **No tree stands within 4 m of the water's edge** (the shore stays a hard cut). |
| **PB3** | A tree may stand on a **slope up to 4°** with the standard 0.15 m burial. On a slope steeper than 4°, the terrain quantum is 0.5 m and the burial may leave a downhill gap — GLM's placement must avoid slope > 4° for trees, or the burial depth must be raised to 0.30 m (flagged as U6 in §16). |
| **PB4** | Trees never stand on the buildable plain rect, on a route corridor (R1, R2), or on a 2 m build-grid cell that GLM has reserved for a structure. |
| **PB5** | A **grove** (§10.2) is never placed inside 10 m of a route corridor — the player must walk *toward* a grove, not stumble into one on the road. |
| **PB6** | The minimum tree-to-tree distance inside the forest interior is **2.4 m** (so two 4.2 m canopies touch but do not interpenetrate); canopies **may** interpenetrate at the forest edge, where the density is lower and the spacing is larger. |

---

## 12. Silhouette read at 45 m

The camera reference (ADB §4): perspective, **38° vertical FOV**, distance **45 m**, pitch 40°,
yaw 45°. Frame height at the target plane:

```
2 × 45 × tan(19°) = 30.99 m   → 30.99 m over 1080 px  =  34.8 px per metre (height)
frame width at 16:9 = 30.99 × 16/9 = 55.1 m  →  19.6 px per metre (width)
```

All figures below use the **authored** height; the 0.15 m burial subtracts **5 px** from every row
and changes no conclusion.

| Asset | Authored H (m) | Screen height @45 m | % of frame height | Silhouette read |
|---|---|---|---|---|
| T1 Spire | 8.50 | 296 px | 27.4 % | A narrow vertical spike with a small stepped faceted crown on a long bare stem. Unmistakable. |
| T2 Table | 6.15 | 214 px | 19.8 % | A wide, flat, faceted bar on a short stem. The opposite of T1. |
| T3 Cluster | 6.60 | 230 px | 21.3 % | A lumpy faceted clump with two outboard lobes. |
| T4 Blossom | 7.10 | 247 px | 22.9 % | A fat, chunky, flat-topped pink crown — the only saturated mass in the forest. |
| G1 Shrub | 1.50 | 52 px | 4.8 % | A small dark-green bun on the ground plane. Reads as undergrowth. |
| T1 partial | 4.00 | 139 px | 12.9 % | A bare stem with a bright cap, and a **green** mass lying on the ground beside it. Reads as *cut down*. |
| T4 partial | 3.90 | 136 px | 12.6 % | The same, with a **pink** mass on the ground — the loudest cue in the sheet. |
| T1 stump | 0.70 | 24 px | 0.8 % | A small hexagonal nub. Found by position, not by silhouette. |
| R1 rock | 0.70 | 24 px | 0.8 % | A low stepped pebble. Only reads in a group. |
| R2 rock | 1.60 | 56 px | 5.2 % | A stepped mound with a visible notch. Reads as stone. |
| R3 rock | 2.85 | 99 px | 9.1 % | A broad mass with an off-axis spire. Reads as a landmark. |
| Ore crystal small | 1.60 | 56 px | 5.2 % | R2's silhouette **plus a violet vein with a lighter highlight cap** — the colour is the difference. |
| Ore crystal large | 2.85 | 99 px | 9.1 % | R3's silhouette plus two violet veins. |

### 12.1 Distinctness check at 45 m

- **Wood vs stone:** wood is a **tall thin vertical with a canopy mass on top**; stone is a **low
  wide mound**. A tree's silhouette has a void under the canopy; a rock's does not.
- **Ore vs stone:** same silhouette family, different **accent hue** — permitted by ADB §7 only
  because the accent is a *saturated* colour on a *pale* body. Never magenta.
- **Pink vs green:** hue 336° vs 95–102° and luminance **+31.4 %** (`canopy_pink` Y 0.501 vs
  `canopy_green_b` Y 0.382). Unmistakable at any distance.
- **T1 vs T2 vs T3 vs T4:** see §12.3.

### 12.2 The aspect-ratio separation rule (amended)

**v1.0 rule:** any two species must differ by **≥ 25 %** in aspect ratio (total height ÷ canopy
main-mass width).

**v2.0 rule:** two species must be separable by **either** the aspect ratio **or** a colour
separation, where a colour separation means **≥ 25 % relative luminance difference AND ≥ 60° hue
difference** between their canopy slots.

**Why the amendment is necessary (and it is not a weakening):** with three green species at aspect
1.04 / 1.52 / 2.02, any fourth tree between 6.0 and 9.0 m with a 4.0–6.0 m canopy lands inside
that span — a strict 25 % rule is mathematically unsatisfiable for a fourth species without
inventing a canopy narrower than 4.0 m or a tree taller than 9.0 m, both of which violate ADB §5.
The colour clause is the measured substitute: pink is separated from green by **31.4 % luminance
and 236° of hue**, which is a far stronger cue than any aspect difference.

### 12.3 The measured species separation table

| Pair | Aspect A | Aspect B | Aspect Δ | Colour separation | Verdict |
|---|---|---|---|---|---|
| T1 vs T2 | 2.024 | 1.042 | **+94.3 %** ✓ | — | aspect ✓ |
| T1 vs T3 | 2.024 | 1.517 | **+33.4 %** ✓ | — | aspect ✓ |
| T2 vs T3 | 1.042 | 1.517 | **+45.6 %** ✓ | — | aspect ✓ |
| T4 vs T2 | 1.479 | 1.042 | **+42.1 %** ✓ | — | aspect ✓ |
| T4 vs T1 | 1.479 | 2.024 | **−26.9 %** ✓ | — | aspect ✓ |
| **T4 vs T3** | 1.479 | 1.517 | −2.5 % ✗ | pink Y 0.501 vs green Y 0.382 = **+31.4 %**; hue 336° vs 97° = **239°** ✓ | **colour ✓** |

Additionally T4 is separated from every green species by **shape class**: its masses are `drum`
(flat top and bottom) where every green species uses `orb`/`dome`. At 45 m the T4 crown reads as a
**flat-topped barrel**, which no green species has.

---

## 13. Resource mapping summary (unchanged from v1.0)

| Asset family | Resource type | Max yield per node [PROPOSAL] | Notes |
|---|---|---|---|
| T1 Spire (standing) | `wood` | 12 | |
| T2 Table (standing) | `wood` | 12 | |
| T3 Cluster (standing) | `wood` | 10 | |
| T4 Blossom (standing) | `wood` | 10 | Same as T3: the pink accent must not be a better resource |
| G1 Shrub (standing) | `wood` | 3 | Minor; shrubs are not a wood source in bulk |
| Tree `_partial` | `wood` | 3–6 (25–50 %) | |
| Tree `_stump` | `wood` | 0 | Node is removed |
| R1 rock (0.8 m) | `stone` | 2 | Only in clusters of 4–9 = one node |
| R2 rock (1.8 m) | `stone` | 8 | Default stone node |
| R3 rock (3.0 m) | `stone` | 16 | |
| Rock `_depleted` | `stone` | 0 | Node is removed |
| Ore crystal small | `ore` | 10 | |
| Ore crystal large | `ore` | 18 | Rarer, larger |

Yield numbers are **[PROPOSAL]** — the economy is not designed yet (GDD §5, milestone 3).

---

## 14. RENDER CONTRACT — `nat_verify_v2`

This is the single verification render for this sheet. It is written so it can be executed **without
asking a question**.

### 14.1 Harness

| Item | Value |
|---|---|
| Engine | **three.js**, the copy already vendored at `08_Technical_Director/Project_Setup/node_modules/three` |
| Renderer | `THREE.WebGLRenderer({ antialias: true })`, `setSize(1600, 900)`, `setPixelRatio(1)` |
| Shadows | `shadowMap.enabled = true`, `THREE.PCFSoftShadowMap` |
| Tone mapping | `THREE.ACESFilmicToneMapping`, `toneMappingExposure = 1.05` (the noon preset's exposure) |
| Page contract | set `window.__ready = true` after **3** rendered frames; expose `window.__probe = { camera, scene, renderer }` |
| Run | `node tools/render.mjs <url> <out.png> 1600 900` from `08_Technical_Director/Project_Setup/` |
| Output | `08_Technical_Director/Testing/nat_verify_v2.png` |
| Scene file (suggested) | `08_Technical_Director/Project_Setup/tools/nat_verify_v2.html` |

### 14.2 Camera — **exact**

| Parameter | Value | Derivation |
|---|---|---|
| Projection | Perspective | ADB §4 |
| **FOV** | **38°** vertical | ADB §4 (the game and the render harness share this value) |
| Aspect | 16:9 (1600 × 900) | |
| Near / far | 0.1 / 600 | ADB §4 far plane |
| **Pitch** | **40°** | ADB §4 default |
| **Yaw** | **45°** | ADB §4 default |
| **Distance** | **20.00 m** | The brief's 6-tree lineup distance |
| **Target** | `(0, 2.50, 0)` — the ground point at the centre of the lineup, raised to **2.50 m** | *Documented deviation from ADB §4's "target = terrain surface":* the subject is a 6–9 m lineup, not terrain. 2.50 m frames the canopies against the sky (see §14.9) |
| **Camera position** | **`(10.83, 15.36, 10.83)`** | `target + 20·(cos40°·sin45°, sin40°, cos40°·cos45°)` = `(0,2.5,0) + (10.830, 12.856, 10.830)` |

```js
const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 600);
const target = new THREE.Vector3(0, 2.50, 0);
const pitch = 40 * Math.PI / 180, yaw = 45 * Math.PI / 180, dist = 20.0;
camera.position.set(
  target.x + dist * Math.cos(pitch) * Math.sin(yaw),
  target.y + dist * Math.sin(pitch),
  target.z + dist * Math.cos(pitch) * Math.cos(yaw)
);                                   // -> (10.830, 15.356, 10.830)
camera.lookAt(target);
```

### 14.3 Lighting — **noon preset, verbatim from `palette_v2.json`**

| Light | Value | Source |
|---|---|---|
| Sun colour | `#FFF4DC` | `palette_v2.json` → `lighting.noon.sunColor` |
| Sun intensity | **2.75** | `palette_v2.json` → `lighting.noon.sunIntensity` |
| Sun elevation | **38°** | `lighting.noon.sunElevationDeg` |
| Sun azimuth | **50°** | `lighting.noon.sunAzimuthDeg` |
| Hemisphere sky | `#BFD9F2` | `lighting.noon.hemiSky` |
| Hemisphere ground | `#7A8F55` | `lighting.noon.hemiGround` |
| Hemisphere intensity | **0.55** | `lighting.noon.hemiIntensity` |
| Background / sky | `#9ED2EE` | `lighting.noon.sky` |
| Exposure | **1.05** | `lighting.noon.exposure` |
| **Fog** | **NONE** — `scene.fog = null` | *Documented deviation from `lighting.noon.fogDensity = 0.0028` / `fog = #DCEFF8`,* required by the brief: a clean sky behind the canopies is what makes the silhouette and facet read testable |
| Shadow map | 2048 × 2048, `PCFSoftShadowMap`, `bias = -0.0005`, `normalBias = 0.02` | ADB §6 |
| Shadow camera | orthographic, `left/right/top/bottom = ±24`, `near = 1`, `far = 160`, aimed at the target | covers the whole 25 m scene at 2.3 cm/texel |

> **Read the lighting from the file, do not hard-code it.** `palette_v2.json` is the authority for the
> light rig (ADB §6: "Numbers live in `04_Art_Director/Approved_Art_Direction/palette_v2.json`").
> The palette was revised while this sheet was being written — the noon sun intensity moved from
> **3.0 to 2.75**, and ADB §6's table still shows the old 3.0 (flagged as U8 in §16). The renderer
> should load `lighting.noon` from the JSON so a later palette revision does not invalidate the
> render contract. The values quoted above are the ones in the file at the time of writing.

```js
// load the noon preset from the palette file — do not hard-code these
const PAL = await (await fetch('/palette_v2.json')).json();   // or import the JSON
const noon = PAL.lighting.noon;
const sun = new THREE.DirectionalLight(new THREE.Color(noon.sunColor), noon.sunIntensity);
const sunDir = new THREE.Vector3(
  Math.cos(noon.sunElevationDeg * Math.PI / 180) * Math.sin(noon.sunAzimuthDeg * Math.PI / 180),
  Math.sin(noon.sunElevationDeg * Math.PI / 180),
  Math.cos(noon.sunElevationDeg * Math.PI / 180) * Math.cos(noon.sunAzimuthDeg * Math.PI / 180)
);                                   // (0.6036, 0.6157, 0.5067)
sun.position.copy(target).addScaledVector(sunDir, 60);   // (36.22, 39.44, 30.40)
sun.target.position.copy(target);
scene.add(new THREE.HemisphereLight(
  new THREE.Color(noon.hemiSky), new THREE.Color(noon.hemiGround), noon.hemiIntensity));
scene.background = new THREE.Color(noon.sky);
renderer.toneMappingExposure = noon.exposure;
scene.fog = null;                    // §14.3 — no fog
```

**Note on the light angle:** a 50° azimuth against a 45° yaw camera is close to front lighting, so
the facet read comes from the dome curvature (top facets N·L ≈ 0.62, side facets 0.0–0.60) plus
the hemisphere fill. If the facets read flat, the **only** permitted change is
`hemiIntensity 0.55 → 0.40`. The sun, the camera and the palette values are fixed.

### 14.4 Ground

| Item | Value |
|---|---|
| Geometry | a single **flat plane 120 × 120 m at y = 0**, centred on the origin |
| Material | `grass_top` `#79B94C`, `MeshLambertMaterial`, `receiveShadow = true` |
| Terrain | **none.** The terrain is GLM's deliverable and is verified separately; a flat plane isolates the assets. No grass detail, no flowers, no water in this render. |

### 14.5 Materials in the render

| Rule | Value |
|---|---|
| Material class | `THREE.MeshLambertMaterial`, **flat colour only**, no maps, no vertex colours |
| Colour source | the palette slot hex of each primitive, resolved from `palette_v2.json` |
| Masses | built with `buildMass()` (§3.3) into a **non-indexed** geometry with **per-face normals** → the facets are hard-edged automatically |
| Boxes / columns | `THREE.BoxGeometry` / a 6-gon `CylinderGeometry(r, r, h, 6)` with `flatShading` and the authored yaw |
| Shadows | every tree, rock and ore primitive **casts** and **receives** |

### 14.5.1 Consolidated scene skeleton (copy-paste)

This block is the whole render. The asset geometry tables in §6.3, §8.2 and §9.3 are the source of
truth; the lists below are those tables transcribed for the 11 instances in §14.6.

```js
import * as THREE from '../node_modules/three/build/three.module.js';

// ---------- palette (palette_v2.json) ----------
const P = {
  grass_top: 0x79B94C, canopy_green_a: 0x5FA83F, canopy_green_b: 0x6FB84A, canopy_green_c: 0x7FC356,
  canopy_pink: 0xF2A6C4, canopy_pink_b: 0xE88FB2, trunk: 0x6B4A33, bark_dark: 0x4E3626,
  stone_top: 0xE6DFCC, stone_body_b: 0xD1C7AF, stone_shade: 0xB9AE96, strata_ochre: 0xC99A5F,
  ore_crystal: 0x7B5AD6, ore_crystal_b: 0x9B7BE8
};

// ---------- geometry builders ----------
function geo(pos, nrm) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
function buildMass(m) {          // { shape:'orb'|'dome'|'drum', sides, cx,cy,cz, rx,ry,rz, yawDeg }
  const { cx, cy, cz, rx, ry, rz, sides, shape, yawDeg } = m;
  const D = Math.PI / 180, pos = [], nrm = [];
  const lon = (k) => yawDeg * D + k * 2 * Math.PI / sides;
  const row = (phiDeg) => {
    const phi = phiDeg * D, c = Math.cos(phi), s = Math.sin(phi), out = [];
    for (let k = 0; k < sides; k++) { const t = lon(k);
      out.push([cx + rx*c*Math.cos(t), cy + ry*s, cz + rz*c*Math.sin(t)]); }
    return out;
  };
  const pole = (sg) => [cx, cy + sg*ry, cz];
  const capCentre = (phiDeg) => [cx, cy + ry*Math.sin(phiDeg*D), cz];
  const tri = (a, b, c) => {
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2], vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const L=Math.hypot(nx,ny,nz)||1; nx/=L; ny/=L; nz/=L;
    const fx=(a[0]+b[0]+c[0])/3-cx, fy=(a[1]+b[1]+c[1])/3-cy, fz=(a[2]+b[2]+c[2])/3-cz;
    if (nx*fx+ny*fy+nz*fz < 0) { const t=b; b=c; c=t; nx=-nx; ny=-ny; nz=-nz; }
    for (const p of [a,b,c]) { pos.push(p[0],p[1],p[2]); nrm.push(nx,ny,nz); }
  };
  const band = (r0,r1) => { for(let k=0;k<sides;k++){const j=(k+1)%sides;
    tri(r0[k],r0[j],r1[k]); tri(r0[j],r1[j],r1[k]);} };
  const fan  = (ring,apex) => { for(let k=0;k<sides;k++) tri(ring[k],ring[(k+1)%sides],apex); };
  const cap  = (ring,c)    => { for(let k=0;k<sides;k++) tri(ring[(k+1)%sides],ring[k],c); };
  if (shape === 'orb') {
    const r = [row(-45), row(0), row(45)];
    band(r[0],r[1]); band(r[1],r[2]); fan(r[0],pole(-1)); fan(r[2],pole(+1));
  } else if (shape === 'dome') {
    const r = [row(0), row(45)];
    band(r[0],r[1]); fan(r[1],pole(+1)); cap(r[0],capCentre(0));
  } else {                      // drum
    const r = [row(-45), row(0), row(45)];
    band(r[0],r[1]); band(r[1],r[2]); cap(r[0],capCentre(-45)); cap(r[2],capCentre(45));
  }
  return geo(pos,nrm);
}
function buildBox(b) {            // { cx,cy,cz,sx,sy,sz }
  const hx=b.sx/2, hy=b.sy/2, hz=b.sz/2, pos=[], nrm=[];
  const V=[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz],[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz]];
  const F=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  for (const f of F) {
    const A=V[f[0]], B=V[f[1]], C=V[f[2]], Dp=V[f[3]];
    const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2], vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const L=Math.hypot(nx,ny,nz)||1; nx/=L; ny/=L; nz/=L;
    const put=(p)=>{pos.push(p[0]+b.cx,p[1]+b.cy,p[2]+b.cz); nrm.push(nx,ny,nz);};
    put(A); put(B); put(C); put(A); put(C); put(Dp);
  }
  return geo(pos,nrm);
}
function buildColumn(c) {         // { cx,cz,y0,h,r,sides:6,yawDeg }
  const pos=[], nrm=[], D=Math.PI/180;
  const ring=(y)=>{const o=[];for(let k=0;k<c.sides;k++){const t=c.yawDeg*D+k*2*Math.PI/c.sides;
    o.push([c.cx+c.r*Math.cos(t),y,c.cz+c.r*Math.sin(t)]);}return o;};
  const tri=(a,b,cc)=>{const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=cc[0]-a[0],vy=cc[1]-a[1],vz=cc[2]-a[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const L=Math.hypot(nx,ny,nz)||1;
    for(const p of [a,b,cc]){pos.push(p[0],p[1],p[2]);nrm.push(nx/L,ny/L,nz/L);}};
  const lo=ring(c.y0), hi=ring(c.y0+c.h);
  for(let k=0;k<c.sides;k++){const j=(k+1)%c.sides;
    tri(lo[k],lo[j],hi[k]); tri(lo[j],hi[j],hi[k]);
    tri(lo[j],lo[k],[c.cx,c.y0,c.cz]); tri(hi[k],hi[j],[c.cx,c.y0+c.h,c.cz]);}
  return geo(pos,nrm);
}

// ---------- the 11 instances (§14.6) ----------
const COL = (r,y0,h,slot,yaw=0)=>({kind:'column',r,y0,h,sides:6,yawDeg:yaw,slot});
const MASS = (shape,sides,c,r,yaw,slot)=>({kind:'mass',shape,sides,cx:c[0],cy:c[1],cz:c[2],
  rx:r[0],ry:r[1],rz:r[2],yawDeg:yaw,slot});
const BOX  = (c,s,slot)=>({kind:'box',cx:c[0],cy:c[1],cz:c[2],sx:s[0],sy:s[1],sz:s[2],slot});

const T1 = [ COL(0.28,0,4.90,'trunk'), COL(0.38,0,0.30,'bark_dark'),
  MASS('orb',9,[0,5.45,0],[2.10,1.00,2.05],0,'canopy_green_a'),
  MASS('orb',7,[0.20,6.85,-0.20],[1.45,0.95,1.35],15,'canopy_green_b'),
  MASS('orb',7,[-0.15,7.85,0.15],[0.95,0.65,0.90],30,'canopy_green_c'),
  BOX([2.40,5.55,0.75],[0.80,0.50,0.80],'canopy_green_c') ];

const T2 = [ COL(0.34,0,3.85,'trunk'), COL(0.46,0,0.28,'bark_dark'),
  MASS('dome',11,[0,3.50,0],[2.95,1.30,2.30],0,'canopy_green_a'),
  MASS('dome',9,[1.35,4.00,-0.60],[1.45,0.95,1.25],15,'canopy_green_b'),
  MASS('orb',9,[-0.35,5.20,0.25],[1.35,0.95,1.25],30,'canopy_green_c'),
  MASS('dome',7,[-1.45,4.05,0.95],[1.10,0.75,1.00],45,'canopy_green_b') ];

const T3 = [ COL(0.26,0,3.60,'trunk'), COL(0.36,0,0.26,'bark_dark'),
  MASS('orb',9,[0,4.55,0],[1.45,1.30,1.40],0,'canopy_green_a'),
  MASS('orb',7,[1.25,4.05,0.30],[0.95,0.80,0.90],15,'canopy_green_b'),
  MASS('orb',7,[-1.30,4.45,-0.45],[0.85,0.75,0.85],30,'canopy_green_b'),
  MASS('orb',7,[0.10,5.70,-0.10],[1.00,0.90,0.95],45,'canopy_green_c'),
  BOX([2.35,3.90,-0.25],[0.70,0.45,0.70],'canopy_green_c') ];

const T4 = [ COL(0.30,0,4.45,'trunk'), COL(0.42,0,0.28,'bark_dark'),
  MASS('drum',9,[0,5.00,0],[2.35,1.15,2.20],0,'canopy_pink_b'),
  MASS('drum',9,[0.30,5.90,-0.25],[1.55,1.00,1.45],15,'canopy_pink'),
  MASS('drum',7,[-1.40,4.95,0.75],[1.05,0.80,1.00],30,'canopy_pink_b'),
  MASS('orb',7,[0.15,6.45,0.10],[0.95,0.65,0.90],45,'canopy_pink'),
  BOX([2.55,5.35,0.85],[0.85,0.55,0.85],'canopy_pink') ];

const SHRUB = [ MASS('orb',9,[0,0.55,0],[0.70,0.55,0.65],0,'canopy_green_a'),
  MASS('orb',7,[0.25,0.95,-0.15],[0.45,0.42,0.42],15,'canopy_green_b'),
  MASS('orb',7,[-0.20,1.05,0.20],[0.34,0.45,0.32],30,'canopy_green_c') ];

const ROCK_M = [ BOX([0,0.45,0],[1.80,0.90,1.50],'stone_top'),
  BOX([0.15,1.10,-0.10],[1.20,0.70,1.00],'stone_top'),
  BOX([-0.40,1.40,0.25],[0.70,0.50,0.60],'stone_body_b') ];

const ROCK_L = [ BOX([0,0.70,0],[3.00,1.40,2.40],'stone_top'),
  BOX([0.30,1.80,-0.20],[1.80,1.00,1.40],'stone_top'),
  BOX([-0.60,2.40,0.40],[1.10,0.90,0.90],'stone_body_b'),
  BOX([0.90,2.20,-0.70],[0.60,0.50,0.55],'stone_shade') ];

const ORE_S = [ ...ROCK_M,
  BOX([0.10,0.45,0.75],[0.90,0.35,0.20],'ore_crystal'),
  BOX([0.10,0.45,0.865],[0.50,0.14,0.07],'ore_crystal_b') ];

const ORE_L = [ ...ROCK_L,
  BOX([-0.20,0.75,1.15],[1.30,0.45,0.20],'ore_crystal'),
  BOX([1.45,0.80,-0.10],[0.20,0.45,1.10],'ore_crystal'),
  BOX([-0.20,0.75,1.265],[0.80,0.18,0.07],'ore_crystal_b'),
  BOX([1.565,0.80,-0.10],[0.07,0.18,0.80],'ore_crystal_b') ];

// ---------- placements (§14.6) ----------
const STEP = 2.40, OFF = 2.80;
const treeAt = (i) => [ STEP*(i-2.5), -0.15, -STEP*(i-2.5) ];
const propAt = (i) => [ STEP*(i-2.5)+OFF, -0.15, -STEP*(i-2.5)+OFF ];
const SCENE = [
  [ T4, treeAt(0) ], [ T1, treeAt(1) ], [ T2, treeAt(2) ],
  [ T3, treeAt(3) ], [ T1, treeAt(4) ], [ T2, treeAt(5) ],
  [ ROCK_M, propAt(0.5) ], [ ORE_S, propAt(1.5) ], [ ORE_L, propAt(2.5) ],
  [ SHRUB, propAt(3.5) ], [ ROCK_L, propAt(4.5) ]
];

// ---------- scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ED2EE);
scene.fog = null;                                   // §14.3 — no fog

const camera = new THREE.PerspectiveCamera(38, 16/9, 0.1, 600);
const target = new THREE.Vector3(0, 2.50, 0);
const pitch = 40*Math.PI/180, yaw = 45*Math.PI/180, dist = 20.0;
camera.position.set(target.x + dist*Math.cos(pitch)*Math.sin(yaw),
                    target.y + dist*Math.sin(pitch),
                    target.z + dist*Math.cos(pitch)*Math.cos(yaw));   // (10.830,15.356,10.830)
camera.lookAt(target);

const sun = new THREE.DirectionalLight(0xFFF4DC, 2.75);   // palette_v2 lighting.noon
const sunDir = new THREE.Vector3(Math.cos(38*Math.PI/180)*Math.sin(50*Math.PI/180),
                                 Math.sin(38*Math.PI/180),
                                 Math.cos(38*Math.PI/180)*Math.cos(50*Math.PI/180));
sun.position.copy(target).addScaledVector(sunDir, 60);
sun.target.position.copy(target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left:-24, right:24, top:24, bottom:-24, near:1, far:160 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xBFD9F2, 0x7A8F55, 0.55));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(120,120),
  new THREE.MeshLambertMaterial({ color: P.grass_top }));
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true;
scene.add(ground);

for (const [prims, at] of SCENE) {
  const g = new THREE.Group();
  for (const p of prims) {
    const m = new THREE.MeshLambertMaterial({ color: P[p.slot] });
    const mesh = new THREE.Mesh(
      p.kind === 'mass' ? buildMass(p) : p.kind === 'column' ? buildColumn(p) : buildBox(p), m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.position.set(at[0], at[1], at[2]);
  scene.add(g);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1600, 900); renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

let frames = 0;
(function loop(){ renderer.render(scene, camera);
  if (++frames >= 3) window.__ready = true; requestAnimationFrame(loop); })();
window.__probe = { camera, scene, renderer };
```

### 14.6 The instance list — 6 trees + 5 props

All assets are placed with their **origin at y = −0.15 m** (the standard burial, rule P2).
**Jitter is disabled** for this render: the canonical authored `_a`/`_b` meshes are used verbatim,
so the render shows the spec, not a random draw.

**Lineup geometry.** The six trees stand on a line **perpendicular to the view axis**, so that all
six share one depth and their bases land on one screen line:

```
line direction r = (0.7071, 0, -0.7071)     (45° in XZ, perpendicular to the 45° yaw)
per-axis step    = 2.40 m   →  spacing along r = 3.394 m
P_i              = ( 2.40·(i-2.5), 0, -2.40·(i-2.5) )        i = 0..5
```

> **Why 2.40 m per axis and not 4.50 m along r.** The frame is 26.6 m wide at the tree row's depth
> (21.7 m). A 4.50 m spacing puts the end crowns' centres at ±11.25 m, and a 5.90 m crown adds
> ±2.65 m of projected half-width — the outer crowns would be **clipped by the frame edge** and
> could not be judged. 2.40 m per axis (3.394 m along r) keeps every crown inside the frame with
> ≥ 2 % margin. The resulting crown overlap of 25–40 % is **intended**: REF-002 §2 shows canopies
> interlocking, and the targets being verified (facet read, colour read) both survive the overlap.

| Slot | Asset ID | Species | Authored H | World position (x, z) | Crown NDC x | Crown NDC edge |
|---|---|---|---|---|---|---|
| **0** | **`nat_tree_blossom_a`** | **T4 Blossom (pink)** | **7.10 m** | **(−6.00, +6.00)** | −0.750 | **−0.951** |
| 1 | `nat_tree_spire_a` | T1 Spire (green) | 8.50 m | (−3.60, +3.60) | −0.457 | −0.643 |
| 2 | `nat_tree_table_a` | T2 Table (green) | 6.15 m | (−1.20, +1.20) | −0.143 | +0.079 |
| 3 | `nat_tree_cluster_a` | T3 Cluster (green) | 6.60 m | (+1.20, −1.20) | +0.148 | +0.272 |
| 4 | `nat_tree_spire_b` | T1 Spire variant b (green) | 8.20 m | (+3.60, −3.60) | +0.457 | +0.692 |
| 5 | `nat_tree_table_b` | T2 Table variant b (green) | 6.40 m | (+6.00, −6.00) | +0.713 | +0.935 |

**The pink tree is at slot 0, the frame-left end**, so it has only one neighbour and stays legible
(≈ 80 % of its projected crown is unoccluded; the T1 at slot 1 overlaps ≈ 20 % of it).

Expected tree tops (NDC y, with the 0.15 m burial applied): slot 0 **+0.578**, slot 1 **+0.801**,
slot 2 **+0.439**, slot 3 **+0.503**, slot 4 **+0.751**, slot 5 **+0.474**. All six visible trunk
bases sit on one screen line at NDC y **−0.257** (the buried origin is at −0.272). That shared base
line is the depth check.

**Prop row.** The five props stand **3.96 m in front of** the tree row (horizontally, toward the
camera), on the same line, at the half-slot offsets `i = 0.5, 1.5, 2.5, 3.5, 4.5`:

```
Q(i) = ( 2.40·(i-2.5) + 2.80 , 0,  -2.40·(i-2.5) + 2.80 )
```

| Prop | Asset ID | Class | Height | World position (x, z) | NDC x | Base NDC y |
|---|---|---|---|---|---|---|
| Rock | `nat_rock_medium_a` | R2, 1.8 m | 1.60 m | (−2.00, +7.60) | −0.594 | −0.712 |
| Ore | `nat_ore_crystal_small_a` | R2 host + 1 vein + 1 cap | 1.60 m | (+0.40, +5.20) | −0.297 | −0.712 |
| Ore | `nat_ore_crystal_large_a` | R3 host + 2 veins + 2 caps | 2.85 m | (+2.80, +2.80) | 0.000 | −0.712 |
| Shrub | `nat_shrub_a` | G1 | 1.50 m | (+5.20, +0.40) | +0.297 | −0.712 |
| Rock | `nat_rock_large_a` | R3, 3.0 m | 2.85 m | (+7.60, −2.00) | +0.594 | −0.712 |

Every prop's base sits below the tree base line (−0.712 < −0.257), so **no prop occludes a trunk**.

**What the single frame verifies:** 3 green species + 1 pink species + 2 tree variants + 2 rock
size classes + 2 ore classes + the shrub + the trunk/flare/cut-face language + the ground value.

### 14.7 Expected screen samples (1600 × 900)

`px_x = (NDC_x + 1) / 2 · 1600`, `px_y = (1 − NDC_y) / 2 · 900`. The sampled pixel is a **lit**
colour, so the check is on the **hue family and the light/dark ordering**, not an exact hex.

| # | Pixel (x, y) | What is there | Expected hue window | Value expectation |
|---|---|---|---|---|
| 1 | (60, 850) | grass | **90 – 105°** | mid value |
| 2 | (483, 522) | T1 trunk, 1.0 m up | **15 – 35°** | the darkest thing in frame (Y ≈ 0.08) |
| 3 | (200, 323) | T4 blossom, main mass M1 | **330 – 342°** | brighter than the grass (Y ≈ 0.50) |
| 4 | (168, 233) | T4 blossom, upper mass M4 | **330 – 342°** | same family |
| 5 | (434, 296) | T1 canopy M1 (green shade mass) | **95 – 105°** | **darker than the grass** (Y ≈ 0.31) |
| 6 | (686, 406) | T2 canopy M1 (green main mass) | **95 – 105°** | ≈ the grass value (Y ≈ 0.38) |
| 7 | (1248, 775) | R3 rock front face | **38 – 50°**, low saturation | **+88 % brighter than the grass** |
| 8 | (268, 782) | R2 rock front face | **38 – 50°**, low saturation | as above |
| 9 | (697, 758) | large ore — **vein V1 body**, clear of its cap | **250 – 262°** | **much darker than the rock** (Y ≈ 0.16) |
| 10 | (723, 783) | large ore — **highlight cap H1** | **250 – 262°** | **brighter than the vein** (Y ≈ 0.27) |
| 11 | (888, 798) | large ore — vein V2 on the +x face | **250 – 262°** | dark against the rock |
| 12 | (496, 774) | small ore — vein body, clear of its cap | **250 – 262°** | dark against the rock |
| 13 | (512, 792) | small ore — highlight cap H1 | **250 – 262°** | brighter than the vein |
| 14 | (1045, 731) | shrub | **95 – 105°** | a green bun on the grass |

### 14.8 Pass / fail criteria

| ID | Check | Pass | If it fails |
|---|---|---|---|
| **V1** | **The canopy is not a cuboid.** Run checks F1–F4 (§3.5) on the canopy outline of every tree. | ≥ 5 non-parallel edge directions; **at least one slanted edge**; no 90° corner between two axis-parallel edges ≥ 0.50 m; ≥ 6 flat-shaded value steps | The implementation is still using boxes for the canopy — rebuild from `NatMass` (§3.3) |
| **V2** | **Facets read.** Count flat-shaded value steps across the sunlit side of one canopy. | ≥ 6 distinct steps | Set `hemiIntensity` 0.55 → 0.40 (the only permitted change, §14.3) |
| **V3** | **Green dominance.** Count the canopies by hue family. | **5 green, 1 pink** | A wrong slot was used in the mesh |
| **V4** | **Pink identity.** Sample the pink canopy's visible pixels. | ≥ 40 % of the pink canopy's projected area is unoccluded, and every sampled pixel is in the 330–342° window | The pink tree is already at the frame-left end (slot 0); if it is still hidden, move it **out** of the lineup and render the pink tree alone in the optional close-up frame (§14.10) |
| **V5** | **Internal canopy contrast.** Every green canopy contains one mass darker than the grass and one lighter. | Yes (rule K8) | A mass was given the wrong slot |
| **V6** | **Trunk reads.** A dark brown column is visible under slots 1–4 and never exceeds 0.60 m wide. | Yes | The trunk column was mis-built (check `r` and `sides`) |
| **V7** | **No floating canopy.** The canopy sits on the trunk; the trunk's top is ≥ 0.20 m inside the canopy. | Yes for all six | Rule K4 violated — check the trunk height |
| **V8** | **Rock reads as stone, not terrain.** The R3 rock is brighter than the grass and shows ≥ 2 horizontal step edges. | Yes | Check that the rock's vertical faces use `stone_top` (rule R1) |
| **V9** | **Ore reads violet.** Both ore props show a violet patch with a lighter highlight cap. | Yes | Check the vein geometry and the cap overlap (rule P8) |
| **V10** | **No magenta anywhere.** Scan the whole frame. | No pixel in the 275 – 300° hue window at high saturation | `emissive_magic` was used — forbidden (§16 U5) |
| **V11** | **No cream, no copper, no teal.** Scan the whole frame. | No pixel in the 30 – 60° window above 25 % saturation other than the rock (low sat); no copper `#B25A3F`; no teal `#4E8F86` / `#2FA6A0` | A retired slot was used |
| **V12** | **Scale and framing.** The tallest tree (slot 1) runs from the base line at NDC −0.257 to the top at NDC **+0.801** — a span of **1.058 NDC = 476 px of 900**. The pink crown's outer edge sits at NDC −0.951 (px 39) and the right crown's at +0.935 (px 1496): **nothing is clipped**. | Yes | The camera, the asset scales or the lineup spacing are wrong |
| **V13** | **The props do not occlude a trunk.** | All five prop bases are below the tree base line (NDC −0.712 vs −0.257) | The prop row offset was applied wrongly |

### 14.9 Why this framing (for the owner)

- The **canopies are silhouetted against a clean sky** (the top 20 % of the frame is background), so
  the outline of every mass is unambiguous — this is what makes the "faceted, not cuboid" check
  objective.
- All six trees share a depth, so their bases align exactly on one screen line. A mistake in the
  placement maths shows up immediately.
- The crowns interlock (as in REF-002 §2) but no crown crosses the frame edge, so every tree can be
  judged whole.
- The props sit on the lower ground band, in front, where they do not occlude a trunk or a canopy.
- The sun is behind the camera at noon, so the lit faces are the visible faces and the frame is
  bright and high-key, like REF-002.

### 14.10 Optional second frame (30 s extra, not required)

`nat_verify_v2_close.html` — the same scene, camera moved to `target (0, 1.60, 0)`, **distance
9.0 m**, same noon rig, framing the **T4 Blossom** and the **large ore deposit** only. Its job is to
prove the *chunky drum* read of the pink masses and the *two-tone* violet vein. It is not a gate.

---

## 15. Naming, metadata and file layout

### 15.1 Asset IDs

Per `Asset_Naming_Conventions.md`: `nat_<species>_<state>`, lowercase `snake_case`, ASCII.

| Asset | File stem | Code ID (camelCase) |
|---|---|---|
| T1 standing | `nat_tree_spire_a` | `treeSpireA` |
| T1 partial | `nat_tree_spire_a_partial` | `treeSpireAPartial` |
| T1 stump | `nat_tree_spire_a_stump` | `treeSpireAStump` |
| T2 standing | `nat_tree_table_a` | `treeTableA` |
| T2 partial | `nat_tree_table_a_partial` | `treeTableAPartial` |
| T2 stump | `nat_tree_table_a_stump` | `treeTableAStump` |
| T3 standing | `nat_tree_cluster_a` | `treeClusterA` |
| T3 partial | `nat_tree_cluster_a_partial` | `treeClusterAPartial` |
| T3 stump | `nat_tree_cluster_a_stump` | `treeClusterAStump` |
| T4 standing | `nat_tree_blossom_a` | `treeBlossomA` |
| T4 partial | `nat_tree_blossom_a_partial` | `treeBlossomAPartial` |
| T4 stump | `nat_tree_blossom_a_stump` | `treeBlossomAStump` |
| Shrub | `nat_shrub_a` | `shrubA` |
| R1 rock | `nat_rock_small_a` | `rockSmallA` |
| R1 depleted | `nat_rock_small_a_depleted` | `rockSmallADepleted` |
| R2 rock | `nat_rock_medium_a` | `rockMediumA` |
| R3 rock | `nat_rock_large_a` | `rockLargeA` |
| Ore crystal small | `nat_ore_crystal_small_a` | `oreCrystalSmallA` |
| Ore crystal large | `nat_ore_crystal_large_a` | `oreCrystalLargeA` |

**Deliberate deviation from the conventions doc (carried forward from v1.0).** The example
`nat_tree_pink_a` encodes the colour in the species name. This sheet does **not** encode a colour
in any asset ID: T1–T3 are named for their silhouette (`spire`, `table`, `cluster`) and **T4 is
named for its species, "blossom"**, which is a botanical term and not a colour. The conventions doc
lists `nat_tree_pink_a` as a *pattern*, not a mandate.

**Retired IDs (never approved; retired by this revision).** `nat_ore_copper_a`,
`nat_ore_gold_a`, and their `_partial` / `_depleted` forms. The ore colour changed, so the ID must
follow the asset (`Asset_Naming_Conventions.md` §1). **A Decision Log entry is required** (§16 U3).

### 15.2 Required metadata (`<stem>.json`)

```json
{
  "id": "nat_tree_spire_a",
  "system": "nat",
  "version": 2,
  "resource": "wood",
  "states": ["full", "partial", "depleted"],
  "height": 8.5,
  "canopyWidth": 4.2,
  "canopyEnvelope": 4.9,
  "aspect": 2.024,
  "primitives": [
    { "kind": "column", "slot": "trunk",      "r": 0.28, "sides": 6, "y0": 0.0,  "h": 4.90 },
    { "kind": "column", "slot": "bark_dark",  "r": 0.38, "sides": 6, "y0": 0.0,  "h": 0.30 },
    { "kind": "mass",   "slot": "canopy_green_a", "shape": "orb", "sides": 9,
      "c": [0.00, 5.45, 0.00], "r": [2.10, 1.00, 2.05], "yawDeg": 0 },
    { "kind": "mass",   "slot": "canopy_green_b", "shape": "orb", "sides": 7,
      "c": [0.20, 6.85, -0.20], "r": [1.45, 0.95, 1.35], "yawDeg": 15 },
    { "kind": "mass",   "slot": "canopy_green_c", "shape": "orb", "sides": 7,
      "c": [-0.15, 7.85, 0.15], "r": [0.95, 0.65, 0.90], "yawDeg": 30 }
  ],
  "triangles": 198,
  "materials": ["trunk", "bark_dark", "canopy_green_a", "canopy_green_b", "canopy_green_c"],
  "author": "mimo",
  "status": "review_required",
  "source": "05_Noxel_Studio/Asset_Sheets/AS-001_natural_assets_v2.md"
}
```

`resource` is one of `'wood' | 'stone' | 'ore'`. `triangles` is the authored count before jitter.

### 15.3 File layout

| Kind | Location |
|---|---|
| This sheet | `05_Noxel_Studio/Asset_Sheets/AS-001_natural_assets_v2.md` |
| Superseded sheet | `05_Noxel_Studio/Asset_Sheets/AS-001_natural_assets.md` (v1.0, retained for history, do not implement from it) |
| Authored mesh source (parametric definitions) | `Game/src/data/natural/` — the tables in §6–§9 are the source of truth |
| Exported GLB | `Game/assets/nat/` |
| Runtime placement | `Game/src/render/` (mesh) + `Game/src/sim/` (node state) |

**Recommended implementation [PROPOSAL]:** the meshes are **generated at load time** from the
primitive tables rather than exported as 29 GLBs. The data is small (5–7 primitives per asset),
deterministic (D-006), and the same list drives the hit-test, the LOD and the harvest state.

---

## 16. Unresolved / cross-document actions

| ID | Item | Status / who | Why it matters | Interim handling |
|---|---|---|---|---|
| **U1** | **The reference images are not on disk.** REF-002 is the only source, and its palette is explicitly "sampled by eye; numeric verification pending" (`palette_v2.json` `source`). | **Blocked on owner** (files into `05_Noxel_Studio/Reference_Images/`). | Every hex and every proportion here may shift after a real sampling pass. | All hexes live in `palette_v2.json`; the geometry references slots only. |
| **U2** | **The canopy green sits only 2.9 % from `grass_top` in luminance** (`canopy_green_b` Y 0.382 vs `grass_top` Y 0.393). A single-value green canopy would merge with the ground at 45 m. | **Palette owner (DeepSeek).** | The forest's silhouette read (ADB §7) depends on the canopy separating from the grass. | Rule **K8** forces a 43.6 % internal value spread per canopy (one `canopy_green_a` mass + one `canopy_green_c` mass), and the trunk provides the dark vertical. **If the render still merges, the fix is a palette edit: darken the canopy family ~10 %, or reserve `canopy_green_b` for the lower mass.** |
| **U3** | **The ore IDs change** (`nat_ore_copper_a` → `nat_ore_crystal_small_a`, `nat_ore_gold_a` → `nat_ore_crystal_large_a`). `Asset_Naming_Conventions.md` §1 forbids renaming an approved asset; these were `review_required`, never approved. | **Decision Log entry required** (DeepSeek). | The palette module and the renderer must not hold two sets of ore IDs. | The new IDs are used everywhere in this sheet; the old ones are listed as retired in §15.1. |
| **U4** | **`strata_ochre` used as fresh-cut wood.** `palette_v2.json` defines it as "side band 0.4–0.62 m below top" (a terrain stratum). There is no dedicated wood-cut slot in v2. | **Palette owner.** | A cut face should not be a terrain-stratum value; the ADB's rule "a red-brown band means steep ground" (guide R4) could bleed into the harvest read. | `strata_ochre` is the only warm wood-family value available. It is used **only** on cut faces and log end caps, never on a horizon-parallel band. A dedicated `wood_cut` slot would be a clean later addition. |
| **U5** | **Magenta is forbidden** (`emissive_magic` `#D24BFF`, hue 285°) and sits **29°** from the violet ore (256°). | **Enforced here.** | A player must never confuse an effect with ore. | Rule §14.8 V10 scans for it; the ore hue window is 250–262°, which excludes magenta. |
| **U6** | **Tree burial on a slope.** The 0.15 m burial can leave a downhill gap on a 0.5 m terrain step. | **GLM + render check.** | A floating tree base breaks the world instantly. | Rule **PB3** forbids trees on slopes > 4°. If GLM cannot guarantee that, raise the tree burial to **0.30 m** (trees only; rocks and ore keep 0.15 m). |
| **U7** | **The noon shadow tint is not violet.** ADB §6 says "shadows are violet-tinted by the hemisphere fill at noon", but the noon preset's `hemiSky` is `#BFD9F2` (pale blue) and `hemiGround` is `#7A8F55` (olive). | **Palette owner.** | The single most important lighting rule in the ADB is not literally met by the preset. | Not changed here (palette_v2 is approved as the reference). Flagged for the next palette pass. |
| **U8** | **ADB §6's noon row is stale.** ADB line 72 lists the noon sun as `#FFF4DC @ 3.0`, but `palette_v2.json` now carries **2.75** (the palette was revised while this sheet was being written). ADB line 67 states that the numbers live in `palette_v2.json`, so the JSON wins. | **DeepSeek / ADB owner.** | Two documents quoting different sun intensities will produce two different renders. | This sheet and the render contract use **2.75**, read from `palette_v2.json` at render time (§14.3). `00_Project_Core/` is out of my scope, so the ADB row is **not** edited here — it needs a one-line correction. |

**Closed in this revision** (from v1.0 §10): U2 (Q-001 pink vs green) → closed by D-013; U3 (the
"green only on the ground" conflict with REF-001 §4) → closed by D-012/D-013, and REF-002 §1
supersedes REF-001 for vegetation; U4 (no saturated ore colour in the palette) → closed by D-015
(violet crystal); U6 (the shrub's slot under a pink world) → closed, the shrub is green
(`canopy_green_a/b/c`); U5 (two slot ids for one hex) → closed, this sheet uses `palette_v2.json`
slot ids exclusively.

---

## 17. Implementation checklist

A programmer can verify this sheet is fully implemented with:

1. Every asset in §6–§9 is built from the primitive list given, with the stated slot per primitive.
2. `NatMass` meshes are built by the §3.3 algorithm: fixed 3-band subdivision, `sides` 7–11,
   15°-quantised facet phase, per-face normals, outward winding.
3. **No canopy is built from boxes.** The only box inside a canopy is the single optional block
   satellite, and it is ≤ 1 per tree, ≤ 0.90 m, and attached.
4. Trunks are 6-gon `NatColumn` primitives, not boxes.
5. The whole asset is offset down **0.15 m** at placement.
6. Jitter follows V1–V7 and passes all ten clamps K1–K10; a tree that fails a clamp is regenerated
   with the next seed value, not clamped into a broken state.
7. Trees use `mulberry32` seeded from the world seed (D-006) — the same save regenerates the same
   forest.
8. **The species assignment pass runs before mesh construction**, and the pink cap of §10.3 is
   enforced on every insertion.
9. Pink instances are placed by the grove pass (§10.2): 70 % in groves of 3–7, ≤ 1 grove per 40 m,
   no grove in the plain or on rocky terrain.
10. Every biome is populated inside its density band (§11), and no tree stands on a bare
    stone-top cell.
11. A depleted rock or ore contains **no** saturated accent colour.
12. Ore never uses the R1 size class. Every ore vein is a 0.20 m slab that overlaps its host by
    0.10–0.15 m and protrudes 0.05–0.10 m; every highlight cap overlaps its vein by 0.02 m on the
    face normal, protrudes ≤ 0.06 m, and is inset ≥ 0.05 m from the vein's other edges.
13. No natural asset uses `emissive_magic`, and no asset uses a texture map or a vertex colour.
14. Every asset ships the `.json` metadata block from §15.2.
15. Canopy colour is applied **only** through palette slots, so changing `canopy_green_b` changes
    every plant in the world without touching a mesh.
16. The light rig is **read from `palette_v2.json` at runtime**, not hard-coded (§14.3), so a
    palette revision does not invalidate the render contract.

---

## 18. Revision notes

| Version | Date | Author | Change |
|---|---|---|---|
| v1.0 | 2026-10-22 | Mimo | First full sheet: box-only composition contract, pink-dominant canopy, copper/gold ore, prose mix. |
| **v2.0** | 2026-10-22 | Mimo | **REV-001.** Canopy primitive replaced with faceted convex masses (`NatMass`); trunks become 6-gon columns; palette moved to `palette_v2.json`; cream foliage deleted; green-dominant with a new pink species T4 capped at 25 %; species mix and biome placement expressed as data; ore accent moved to violet crystal; rocks confirmed as pale faceted stone; RENDER CONTRACT added. |

**No images, meshes or renders were created in the production of this document.** It contains
written specifications, exact dimensions in metres, parametric primitive data, and one render
contract that can be executed without further questions.
