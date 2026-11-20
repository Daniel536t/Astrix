# REF-002 — Hybrid World Reference Analysis

**Analyst:** DeepSeek · **Status:** Approved direction — owner-supplied world reference
**Source:** one infographic comparing *Voxel Style* / *Low-Poly Stylized* / **Hybrid Style**, with seven
close-up panels labelled "Hybrid Style". Owner statement: this is the world reference, "a combination
of both voxel and noxels", and the finished world should be **richer and less limited** than the
small panels in the image.
**Relationship to REF-001:** REF-002 is the *world* reference; REF-001 remains the *Noxel architecture*
reference. Where they disagree, REF-002 wins on palette, water, lighting and vegetation; REF-001 wins
on modular stone architecture grammar.

---

## 1. The decision this settles

The infographic names the target itself: **Hybrid = block-based terrain & structure + stylized, smooth
objects.** That is now the project's art direction, and it resolves the ambiguity in REF-001 (where
everything, including trees, was made of cubes).

**Three mesh languages, not two:**

| Language | Used for | Geometry | Owner |
|---|---|---|---|
| **Voxel** | terrain, cliffs, ground, deposits, shoreline | quantised grid, strata bands | GLM |
| **Noxel** | architecture, walls, stairs, structures | axis-aligned modular prisms, off-grid proportions | Mimo |
| **Styl** (`nat_`) | trees, shrubs, boulders, soft props | **faceted low-poly, off-grid, smooth silhouette** | Mimo |

This is not a boundary violation: the original brief allowed "some natural assets may use custom
meshes if that is more appropriate". REF-002 makes it appropriate for organics.

**Consequence:** Mimo's tree spec (`AS-001`) as written uses stacked axis-aligned boxes. That is the
REF-001 reading and is now **superseded for canopies** — a REV task follows. Trunks, rock clusters and
stone may stay blocky; foliage must become faceted masses.

## 2. What the hybrid panels show

**Terrain.** Stepped grass terraces with pale stone retaining edges; visible block structure; lush,
saturated green; cliffs as large vertical planes with occasional ledges. Terracing is broad, not
1 m staircases — consistent with REF-001 §3 and with my own probe finding (IR-001).

**Water.** Bright **turquoise/cyan**, high clarity, shallow-to-deep gradient, white foam where it meets
rock, hard blocky stone banks. This directly contradicts REF-001's navy water — REF-001's dusk image
was a mood piece, not the daytime water colour.

**Vegetation.** **Green-dominant forest with pink blossom trees as accents.** Green broadleaf trees
have faceted, rounded canopies; pink trees have chunkier faceted blossom masses. Trunks dark brown,
slim. This answers Q-001: green dominant, pink accent.

**Architecture (Noxel).** Pale cream/grey stone, modular, crenellated walls, towers with blue banners,
wide stairs, arched openings, flat and low-pitched roofs. Cleaner and more *built* than REF-001's
ruins — reinforcing that our Noxels are new construction, not decay.

**Props.** Campfires with warm glow, crates, barrels, wooden benches, banners, fences, crop rows on
tilled soil. Small, saturated accents against large calm surfaces.

**Scale and framing.** Miniature diorama, high three-quarter camera, dense settlement in the distance,
terrain filling the frame. The panels are deliberately cropped small — the owner's instruction is that
the real world must feel larger and richer, not like a vignette.

## 3. Palette extract (approximate — sampled by eye)

| Role | Hex | Note |
|---|---|---|
| Grass top | `#79B94C` | saturated, not olive |
| Grass, higher elevation | `#8FC95E` → `#9AD06A` | subtle ramp |
| Grass cut edge / cap | `#5E9440` | darker than top |
| Soil / ochre stratum | `#C99A5F` | warm band under grass |
| Red-brown stratum | `#B4633C` | thinner, below ochre |
| Stone, sunlit | `#E6DFCC` | pale warm cream |
| Stone body | `#DCD3BE` / `#D1C7AF` | alternating |
| Stone, shaded | `#B9AE96` | |
| Sand / shore | `#E3D3A6` | |
| Water shallow | `#67CFD8` | turquoise |
| Water mid | `#3AAFC4` | |
| Water deep | `#2A8FA8` | |
| Water rim / foam | `#BFEAF0` | |
| Canopy green | `#5FA83F` / `#6FB84A` / `#7FC356` | |
| Canopy pink | `#F2A6C4` / `#E88FB2` | accent species only |
| Trunk | `#6B4A33` | |
| Banner blue | `#3E7FB8` | Noxel accent |
| Banner teal | `#2FA6A0` | secondary accent |
| Ore crystal | `#7B5AD6` | proposed: violet mineral, distinct from cyan water |
| Fire / warm emissive | `#FF9E4A` | |

**Ore colour must change.** GLM proposed verdigris teal `#4E8F86`; with turquoise water that is no
longer distinct. Violet crystal is proposed instead. Magenta `#D24BFF` stays reserved for effects.

## 4. Lighting and the day/night decision

The reference is high-key: bright sky, strong warm sun, soft cool ambient, shadows present but not
black. The owner has additionally approved a **full day/night cycle** (D-011), so the palette must be
expressed as *one material set under three lighting presets*, not three painted worlds.

| Preset | Sun | Sun colour | Sky/ambient | Notes |
|---|---|---|---|---|
| Dawn | elev 12°, warm low | `#FFC79A` | `#8FA6C8` / `#4E5F6E` | long shadows, mist |
| Noon (default) | elev 38° | `#FFF4DC` | `#BFD9F2` sky, `#DCEFF8` fog | reference look |
| Dusk | elev 8°, strong warm | `#FF9E6E` | `#6E5C8C` / `#3A3350` | REF-001 image 2 palette |
| Night | moon elev 40° | `#BFD0FF` i=0.45 | `#2A3560` / `#161C33` | emissives take over |

Materials are **not** repainted per time of day. Only sky, fog, light colours/intensities, exposure and
a small number of emissive materials change. This keeps one palette module and one terrain material.

## 5. What remains uncertain

1. Canopy faceting degree — how "smooth" before it stops matching the blocky world. Needs a test render.
2. Water foam: the panels show white foam at rock contact. Geometry-free approach (rim band + shoreline
   vertex tint) may not be enough; evaluate after first render.
3. Roofs are pitched in one panel, flat/crenellated in another. M1 has no buildings, so deferred.
4. How much prop density the "richer, less limited" instruction implies without violating ADB's
   sparse-detail rule. Resolve by render, not debate.
5. Ore colour (violet proposed) needs owner glance.

## 6. Consequences for the specs already produced

- **GLM vsg v1.0 §4.2/§4.3/§5**: palette and water hexes must be replaced with Palette v2 values;
  §5 water becomes turquoise, not navy; add the ochre stratum band. Geometry, layout, budgets and
  determinism stand — that work is unaffected and accepted.
- **Mimo AS-001**: canopy composition changes from stacked boxes to faceted masses; palette slots
  change; the pink/green question is now answered (green dominant, pink accent) instead of deferred.
- **ADB**: water, vegetation, palette and lighting sections revised.
- **Technical Architecture**: adds a time-of-day module; render cost of a moving sun must be budgeted.
