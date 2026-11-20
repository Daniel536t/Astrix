# Art Direction Bible

**Last updated:** 2026-10-22 · **Status:** v0.1 — Noxel half grounded in REF-001; voxel half pending GLM.

---

## 1. One-sentence direction

A pale-stone, pastel, block-based **diorama world** where natural terrain is built from stepped
strata and human architecture from crisp monolithic boxes — warm sunlight, violet shadows, and
deliberate emptiness.

## 2. The three mesh languages

| | Voxel — terrain | Noxel — architecture | Styl (`nat_`) — organics |
|---|---|---|---|
| Owns | ground, cliffs, rock, deposits, shoreline | buildings, walls, stairs, structures | trees, shrubs, boulders, soft props |
| Geometry | quantised grid, strata bands | axis-aligned modular prisms, off-grid proportions | faceted low-poly, off-grid, smooth silhouette |
| Specialist | GLM | Mimo | Mimo |
| Shared | palette, scale, light, camera, silhouette rules | same | same |

REF-002 defines this split explicitly ("block-based terrain & structure, stylized smooth objects").
A fourth language is not permitted without an owner decision.

## 3. Non-negotiable visual rules

1. **Axis-aligned.** No rotated boxes in terrain or architecture. (Props may rotate about Y only.)
2. **Crisp edges.** No bevels, chamfers, or rounded corners.
3. **Flat colour.** No image textures on terrain, stone or foliage. No normal maps, no baked AO.
4. **Violet shadows.** Shadow colour is a cool violet-lavender, never black or neutral grey.
5. **Thin strata on every cut.** Grass cap → dark red-brown band → pale stone body.
6. **Sparse detail.** Decoration occupies well under 5% of any surface. Empty ground is a feature.
7. **Silhouette first.** Every asset must be identifiable as a black shape at gameplay distance.
8. **No uniform module.** Deliberately vary block sizes; avoid a single "cube size" read.
9. **One material set, four lighting presets.** Materials never repaint for time of day. Dawn, noon,
   dusk and night are expressed by light colour, ambient, fog and exposure only.
10. **Green forest, pink accents.** Pink blossom is a minority species, never the biome. Forest must
    read as a wood resource.

## 4. Camera (shared by game and renders)

| Parameter | Value | Reason |
|---|---|---|
| Projection | Perspective | Required by the game; matches references closely enough |
| FOV | 38° | Narrow FOV + distance = diorama |
| Pitch | 40° default, clamp 28°–62° | Shows tops and faces simultaneously |
| Yaw | 45° default, free orbit | Three-quarter read |
| Distance | 45 m default, clamp 22–95 m | 22 m ≈ close inspection, 95 m ≈ overview |
| Target | terrain surface, not origin | Keeps the subject framed on slopes |
| Far plane | 600 m | Fog closes the world before the far plane is visible |

These are the values the render harness and the game must both use. A "looks nicer" render at a
different FOV is not a valid reference for the game.

## 5. Scale

- 1 world unit = 1 metre. Y-up, right-handed.
- Human = 1.7 m. This is the ruler for everything.
- Terrain cell 1 m (XZ), step quantum 0.5 m. Build grid 2 m. *(Proposed, D-008.)*
- Tree 6–9 m. Rock 0.8–3 m. Building storey 3.2 m (later).
- Anything that cannot be described in metres is not specified yet.

## 6. Light and time of day (D-011: full cycle is in scope)

One directional sun/moon, hemisphere fill, and a sky/fog colour that changes with time. Four authored
presets, linearly blended between; no material changes. Numbers live in
`04_Art_Director/Approved_Art_Direction/palette_v2.json`.

| Preset | Sun elev. | Sun | Sky/ambient | Character |
|---|---|---|---|---|
| Dawn | 12° | `#FFC79A` @ 2.2 | `#8FA6C8` / `#4E5F6E` | low warm light, long shadows, mist |
| **Noon (default)** | 38° | `#FFF4DC` @ 3.0 | `#BFD9F2` / `#7A8F55` | the REF-002 look: bright, high-key |
| Dusk | 8° | `#FF9E6E` @ 2.4 | `#6E5C8C` / `#3A3350` | REF-001 image 2, violet |
| Night | 40° (moon) | `#BFD0FF` @ 0.45 | `#2A3560` / `#161C33` | emissives take over; terrain reads by silhouette |

- Shadows: 2048 map, soft, tight ortho frustum around the play area, violet-tinted by the hemisphere
  fill at noon; the sun direction is animated, so the shadow frustum follows the active region.
- Fog: `FogExp2`, colour tracks the sky preset, density 0.0028 (noon) to 0.0060 (night).
- Exposure: 1.05 noon → 1.25 night. This is the only "grade" we apply.
- No bloom, no SSAO, no post stack in M1. Emissive geometry is not bloomed; it is simply bright.
- A full cycle must stay legible: the readability contract in §7 is tested at noon **and** at night.

**Shadows are never neutral grey/black.** At noon the shadow tint is cool blue-violet; at dusk strong
violet; at night, blue. This is the single most important lighting rule.

## 7. Readability contract

At 45 m distance and 40° pitch, the player must distinguish, by colour *and* silhouette:

| Thing | Cue |
|---|---|
| Buildable ground | flat, grass-topped, no strata band visible, no props |
| Water | darkest value in frame, flat, hard shore |
| Forest | clustered vertical trunks + canopy mass |
| Rock / stone deposit | bare pale stone, faceted, no grass cap |
| Ore | stone + violet crystal accent `#7B5AD6` — not cyan (clashes with water), not magenta (reserved) |
| Steep ground | visible strata band + sharp vertical drop |
| Cliff | large near-vertical face |

If a distinction exists only as a label in a UI, it has failed this contract.

## 8. Composition rules for concept renders

- Landscape is the subject; no UI chrome, no text panels, no catalogue grids.
- One clear focal region (the starting plain) and one strong vertical mass (cliff/mountain) for horizon.
- Foreground occlusion is allowed and desirable; empty flat plane is not.
- Narrate opportunity: forest edge near the clearing, water within sight, stone in the near distance,
  unexplored terrain at the frame edge.
- A render may hide the horizon with fog; that is honest, not a cheat.

## 9. Do-not-copy list

See `REF-001` §9. Summary: no ruins-as-premise, no portal VFX, no pink-only biome, no star water,
no screenshot chrome, no fake detail density.

## 10. Open art questions

- **Resolved by REF-002:** Q-001 (green-dominant forest, pink accents) and Q-002 (full day/night cycle
  is in scope, D-011).
- **Q-003** overhangs — GLM proposes heightfield-only for M1; I accept, documented escape hatch exists.
- **Q-004** newly built vs weathered Noxels — REF-002 shows clean, built architecture. Treat newly-built
  as the default; weathering is a progression feature.
- **Q-005** ore accent violet `#7B5AD6` — needs a glance.
- **Q-006** water foam at rock contact (REF-002) — geometry-free rim tint may be insufficient; test by
  render.
