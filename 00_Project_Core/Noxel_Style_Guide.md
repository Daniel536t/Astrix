# Noxel Style Guide — v0.1 (seed)

**Owner:** Mimo · **Seed author:** DeepSeek from REF-001 · **Status:** Draft, superseded by Mimo's
expansion in `05_Noxel_Studio/Noxel_Style_Guide/`.

This document defines the **rules**. Mimo expands it into asset-level specifications. No asset is
designed until the rule it obeys is written here.

---

## 1. Definition

A **Noxel** is a modular, axis-aligned, flat-shaded 3D form used to construct human-made
architecture and props. It is *not* a unit cube and it is *not* a voxel. A Noxel asset is a
composition of rectangular prisms whose sizes are chosen for silhouette and proportion, snapped to
a construction grid only where assembly requires it.

## 2. Grammar

Every Noxel asset is built from four element classes:

| Element | Role | Typical dimensions |
|---|---|---|
| **Mass** | Main volume — hall, tower shaft, wall run | 4–16 m wide, 3–12 m tall |
| **Slab** | Horizontal plane — floor, platform, stair tread | 0.2–0.5 m thick |
| **Post** | Vertical square-section member — pillar, corner, rib | 0.6–1.4 m section |
| **Block** | Small applied detail — cap, corbel, step, parapet tooth | 0.15–0.6 m |

Rules:
- Masses are composed of **2–4** distinct volumes, never one extruded box (except a hut).
- At least one element class must be **deliberately oversized or undersized** to break uniformity.
- No element may be rotated off-axis. Y-rotation only, in 90° steps for assembly.
- Openings are rectangular voids. No curved arches, no circles, no chamfers.
- Repetition is allowed and encouraged, but never exceed 7 identical repeats without variation
  (one raised, one shortened, or one missing — for weathered kits).

## 3. Proportion rules

- Storey height 3.2 m; door 2.2 m × 1.2 m; window 1.2 m × 1.4 m.
- Pillar height : section ratio between 4:1 and 7:1. Beyond 7:1 a pillar needs a base or a cap block.
- Stairs: riser 0.3 m, tread 0.9 m, width a multiple of 2 m. Riser/tread ratio is fixed — this is
  what makes the reference staircase read as architecture rather than a ramp.
- Walls: 0.6 m thick minimum for load-bearing reads, 0.3 m for parapets.
- A building's footprint must be a multiple of 2 m on each side.
- Height above ground of the tallest element: 1.5–4× the footprint's short side.

## 4. Surface and colour

- Flat colour per material. One material per element, no per-face colour except wear.
- Stone: one pale family. Sunlit `#EDE4D6`, shadow falls violet — do **not** paint shadow into
  geometry; let the light do it.
- Wood (later): dark maroon-brown `#5B3A38` family, matching trunks, never bright.
- Accent materials are limited to **two per settlement tier**, plus emissive (effects only).
- Wear is expressed as: a slightly darker material on 5–10% of blocks, not as texture.
- No text, no signage, no heraldry until a UI/identity pass exists.

## 5. Damage vocabulary (for the world's *ancient* layer, if used)

Reference-derived: missing blocks, displaced cubes at the base, flat pale lichen patches on vertical
faces, grass creeping over top edges, pillars broken at unequal heights, one fallen lintel.

**Newly built Noxels must be the same language minus all five.** The player's first buildings are
clean: full walls, intact stairs, capped pillars, no debris.

## 6. Modular kit structure

A kit is a set of interchangeable pieces on a shared 2 m module:

- `foundation` (platform + one step)
- `wall_straight` / `wall_corner` / `wall_doorway` / `wall_window`
- `post` (with/without cap)
- `stair_run` (4, 6, 9 steps)
- `roof_flat_parapet` (M1 has no pitched roofs)
- `prop_*` (crate, well, fence, workbench)

Every piece declares: footprint (m), height (m), snap faces, and the material slot it uses.

## 7. Asset sheet requirements

For each family: 3/4 view, front, side, top; a 1.7 m human silhouette for scale; a component
breakdown; the module diagram; palette swatches with hex. Label whether the image is
*concept* or *implementation model*.

## 8. Do not

- Do not produce generic voxel/Minecraft architecture.
- Do not produce rounded, cartoon-soft "low poly" (no toon outlines, no subdiv surfaces).
- Do not copy the reference's ruin theme as the player's architecture.
- Do not introduce a second stone colour family without a style-guide revision.

## 9. Open items for Mimo

1. Full weathering gradient: how a Noxel building ages across progression tiers.
2. Roof language for M1 (flat parapet assumed) and what replaces it later.
3. Wood/plaster/roof-tile material families and their accent colours.
4. The vertical-rib monumental motif from REF image 2 — adopt, and where.
5. First asset family to specify: **founder's hall** (task 030), plus the 6-piece starter kit.
