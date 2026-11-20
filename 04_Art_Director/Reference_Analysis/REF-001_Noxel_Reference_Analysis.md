# REF-001 — Noxel Reference Analysis

**Analyst:** DeepSeek (orchestrator)
**Status:** Review Required — this is the authoritative reading of the owner's reference set until
the owner confirms it or supplies the raw image files for independent re-analysis by Mimo.
**Sources:** three images supplied by the owner in-chat, 2026-10-22.
**Not on disk yet:** `05_Noxel_Studio/Reference_Images/` is currently empty. Mimo must not be asked
to "analyse the references" until the files exist there; this document is the text substitute.

---

## 1. What the style actually is

The owner's own description is accurate: this is **not** voxel art in the Minecraft sense. It is

> stylized low-poly, block-based, modular 3D, shot as a diorama.

Three properties define it, and all three must hold or the look breaks:

1. **Axis-aligned rectangular massing** — the world is made of boxes and stacked slabs, all
   faces parallel to X/Y/Z. Nothing is rotated off-axis, nothing is bevelled.
2. **Non-uniform block scale** — a 9 m cliff face and a 0.3 m flower are both "a box". There is no
   single module size. This is the single biggest difference from voxel art.
3. **Aggressive flatness** — flat colour per material, no textures, no bump, no baked AO. Depth
   comes entirely from directional light, coloured shadows, and silhouette.

## 2. Camera

| Property | Observation |
|---|---|
| Pitch | ~35–45° above the horizon (all three images) |
| Yaw | ~45° three-quarter; one image is closer to front-quarter |
| Projection | Mild perspective. Near-orthographic long-lens feel; vertical edges stay near-parallel |
| Framing | Diorama: the world fills the frame, horizon not visible in images 1–2, visible as haze in 3 |
| Scale anchor | A ~1.7 m humanoid stands in images 1 and 2 |

**Implication for the game:** perspective camera at a *narrow* FOV (≈35–40°) and a long distance
reproduces this. Wide FOV (75°) will destroy the miniature feel instantly.

## 3. Terrain

- **Structure:** broad flat plateau tops, separated by vertical drops. Terraces are irregular
  polygons, not concentric rings, and step heights vary (roughly 0.5–2 m, occasionally wider).
- **Edge treatment (the signature):** every vertical cut exposes thin horizontal **strata bands**.
  Reading top-down: a grass cap (~0.3–0.5 m, olive green) → a thin dark red-brown band
  (~0.1–0.2 m) → the pale stone body. This banding appears on *every* exposed edge in all three
  images and is the most recognisable part of the world's identity.
- **Surface:** flat. No ground texture. Grass is a colour, not an image.
- **Detail:** tiny flowers scattered in patches — white, cream, pale blue, pale yellow — as
  sub-0.15 m specks. Sparsely distributed, never carpeted.
- **Cliffs (image 3):** large **smooth vertical planes**, not stair-stepped voxels. Blocky notches
  and occasional terrace ledges break them up. Vertical tonal banding is subtle.
- **Paving:** pale rectangular slabs with visible joints, grass growing through inset squares.

## 4. Vegetation

- **Trunk:** thin square-section column, dark maroon → near-black violet in dusk; no taper, no branches.
- **Canopy:** 3–8 cuboids of *different* sizes clustered with deliberate offsets; usually one large
  mass plus smaller satellites, some detached. Canopy is wider than tall, flat-bottomed.
- **Scale:** 6–9 m tall; canopy 4–6 m across; trunk ~0.4–0.6 m.
- **Colour:** pink (day) / magenta-violet (dusk) canopies, with occasional cream or pale-ochre
  blocks mixed in as variation. Green foliage appears only on the ground, never in canopies.
- **Placement:** trees stand on ledges and terraces, sometimes in front of walls; never a dense
  uniform forest in the references — clusters with clear ground between them.

## 5. Architecture

- **Material:** one pale stone. Ivory/cream in sunlight, lavender-grey in shadow. Nothing else.
- **Vocabulary:** square-section monolithic pillars (1–1.4 m, 4–7 m tall, broken at varied
  heights); wide shallow stairs (~0.3 m riser, ~0.9 m tread, 6–9 steps, 8 m wide); broken walls of
  1–3 m; lintels; square openings; simple stacked-block arch; occasional cap blocks on pillars.
- **No** roofs, columns with capitals, mouldings, arches with curvature, windows with frames.
  Openings are rectangular voids between blocks.
- **Damage language:** missing blocks, displaced cubes lying on the ground, lichen/moss as flat
  pale patches on vertical faces, grass creeping over horizontal edges.
- **Monumental motif (image 2):** a tall wall of narrow vertical ribs at alternating depths —
  cheap to build, reads as grandeur at distance. Worth adopting for later civic architecture.
- **Proportion rule:** architecture is 3–5× human height. The world feels inhabited by small people
  in large ruins.

## 6. Water

- Flat plane, no waves or foam geometry.
- Deep navy-violet, darker than everything else; a lighter rim at the shoreline.
- Pale speckles on the surface (stars/reflections) — treat as an effect, not base water.
- Hard vertical shore cut with a thin light band where stone meets water.

## 7. Light and colour

- One dominant directional source, low (~25–35° elevation), long shadows.
- **Shadows are violet, never black or grey.** This is non-negotiable and is most of the "pastel" feel.
- Ambient is strong and cool; sunlit faces are warm. The warm/cool split is the whole colour story.
- Atmospheric haze at distance (image 3), sky near-white lavender.
- Emissive magenta appears once, as a focal VFX (portal) with local light spill.

## 8. Palette (approximate — sampled by eye, to be locked numerically)

| Slot | Day | Dusk |
|---|---|---|
| Sunlit stone | `#EDE4D6` | `#B7AEDC` |
| Shadow stone | `#B9AECB` | `#6E6796` |
| Grass top | `#8E9C57` | `#5C6B4A` |
| Grass shadow | `#6C7A44` | `#3F4C38` |
| Strata: red-brown | `#B25A3F` | `#7A4A55` |
| Strata: ochre | `#C9A06A` | `#8C7A6A` |
| Canopy pink | `#F0A8BE` | `#C070D8` |
| Canopy cream | `#F2DDC4` | `#C9B7D8` |
| Trunk | `#5B3A38` | `#2A2233` |
| Water deep | `#1E2A4A` | `#161C33` |
| Emissive accent | `#C24BEF` | `#D24BFF` |

A colour-sampling pass over the actual files will replace these values.

## 9. What must NOT be copied

| Do not copy | Why |
|---|---|
| Ruins as the world's premise | Our world has **no** pre-existing civilization. Noxels must be able to look *new*, *built*, and *maintained*, not only ancient. |
| The glowing portal ring | Proprietary focal VFX of the reference; unrelated to our game. |
| Pink as the only foliage colour | Our forest must read as a natural, harvestable resource. Pink-only would make wood/forest illegible. Pink is an accent species, not the biome. |
| Star-speckled water | Effect, not material. |
| The phone screenshot chrome (image 3) | Not content. |
| Uniform low detail | The references work because quiet areas are genuinely quiet. Do not "add detail" to compensate. |

## 10. Consequences for our two systems

**Noxel (architecture/props):** the language above is directly usable. New, undamaged Noxels must
be derivable by *removing the damage vocabulary* while keeping massing, proportion and palette —
that is, complete walls, intact stairs, full-height pillars, no debris.

**Voxel (terrain):** the references show terrain that is blocky but **not** quantised to a uniform
grid, and whose edges carry thin **strata bands**. A naive 1 m Minecraft staircase will not match.
The voxel system must therefore support:
- varied step heights (0.5 m quantum recommended, see D-008);
- broad flat terrace tops with irregular outlines;
- **per-face vertical strata banding on cut edges** (grass cap, red-brown band, stone body), not a
  single side colour.

This is a hard constraint to pass to GLM in Task 003, and it affects the shader/material design,
not only the geometry.

## 11. Open questions for the owner

1. **Q-001** — Is pink the dominant foliage of the world, or an accent within a green-dominant
   forest? (Affects whether "forest" reads as a wood resource.)
2. **Q-002** — Is the dusk/portal image a *mood reference* or evidence that time-of-day is in scope?
3. **Q-003** — Heightfield terrain cannot produce overhangs. Are overhanging cliffs required for
   the first world, or is smooth vertical cliff + terraces sufficient?
4. Should Noxel architecture in the first milestone lean **newly built** (clean, intact) — my
   recommendation, since the player builds it — or intentionally weathered?
