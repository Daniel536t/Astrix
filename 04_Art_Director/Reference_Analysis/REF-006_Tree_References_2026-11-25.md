# REF-006 Tree References (2026-11-25)

**Source.** Three images the owner posted in chat during M013 ("Living woodland"). They are **not in the repo**.

**Owner action.** Please upload them to `05_Noxel_Studio/Asset_Sheets/` (for example `2026-11-25_trees/`) so this analysis can be checked against the originals. The descriptions below are from the chat copies.

**Used for.** The M013 tree models in `Game/src/render/vegetation-kit.ts`, drawn through `Game/src/render/nature.ts`.

## Shared traits
- Trees are built from many small blocks. Crowns are lumpy and irregular, not one big box.
- Each part has a flat colour. Trunks are distinct from crowns (white birch, brown oak, dark spruce).
- Different heights and ages stand side by side. Dead trees are bare, reddish brown and branchy.

## Per image

| # | Content | What it asks for |
|---|---|---|
| 1 | A lifecycle row of ten small trees, each on its own grass/soil block. In order: a young round broadleaf, a fuller bushy broadleaf, then a small cone conifer growing to a tall tiered spruce, then two bare dead reddish-brown snags. | Visible growth stages per species, plus a dead stage that stays standing. |
| 2 | A dense conifer forest by a lake. Tall spruces have flat, layered tiers, with the dark trunk visible between the tiers. Lighter young firs and a birch stand among them; the birch has a white trunk and a wide, drooping crown. Heights vary. Stone and gravel lie near the water. | Layered spruce silhouette, mixed ages in one stand, birch contrast. |
| 3 | Four big broadleafs on a grey background: a birch with a white trunk flared at the roots; a dark green oak with a thick brown trunk and spreading roots; a yellow-green broadleaf; a pink cherry. Every crown is lumpy and made of many small blocks. | Root flare and spreading roots, irregular crowns, species told apart by colour. |

## How each was interpreted (as built)

All shapes are plain-coloured blocks. Colours are from `Game/src/data/palette.json`, and lit and shadowed variation comes from the scene lighting.

### Image 1: the lifecycle row
- **Stages.** Every species has seven drawn stages, each sized by `STAGE_SIZE`: sapling, young, mature, old, dying, dead snag and stump.
  - sapling 0.4
  - young 0.68
  - mature 1
  - old and dying 1.12
  - snag 1.08
- **Saplings.** A trunk with two tiers in the species colours.
- **Old trees.** A 0.94 colour tint, a trunk 1.3 times wider, and a root flare.
- **Dying stage.** Not in the image; added between old and snag. It is the old tree's plan with every third crown block removed, the rest shrunk to 0.9, and the leaves recoloured ochre or olive (`leaf_dying_a` #A69A45 / `leaf_dying_b` #B8873E; conifers `conifer_dying` #7E7A3E).
- **Snag (`snagPlan`).** Follows the two dead trees at the end of the row: a bare reddish-brown trunk (`snag_bark` #8A4F36 / `snag_bark_b` #6A3B2A) with broken limbs. Conifers get a 6.2 m pole with stubs; broadleaves get a 4.4 m trunk.
- **Stump (`stumpPlan`).** Not in the image; added as the last stage. It is a 0.5 m stump with a pale cut face (`stump_cut` #C9A274) and 3 near-only roots.
- **Grass/soil blocks.** These are not modelled. Trees stand on the voxel terrain.
- **Dev lineup.** `?trees=1` lays out the whole row for every species. Rows are pine, spruce, oak, birch, beech and cherry; columns are the seven stages.

### Image 2: the conifer forest by the lake
- **Spruce.** A dark trunk (`bark_dark`) up to 5.6 m with six flat, layered tiers (`conifer_spruce` #2F6B48 / #3E7F56).
  - The lower three tiers are crossed slabs, so the trunk shows between them.
  - At full detail the tier tips droop.
- **Birch.** A white trunk (`birch_bark` #E6E1D3) with dark bands (`birch_mark` #3A3530), and a yellow-green crown (#9CC95A / #B3D76B). At full detail the crown is wide with drooping tips.
- **Mixed ages and heights.** These come from the simulation. Each tree's stage follows its own clock, and its pace varies by ±15 % per tree, so a stand always mixes ages.
- **Young firs.** Shown by the young pine and spruce stages.
- **Lakeside stone and gravel.** Not changed. The terrain and rock props are as in M008.

### Image 3: the four big broadleafs
- **Root spurs** (`addCharacter`, mature, old and dying trees): low blocks reaching out from the trunk foot, 4 on oak and 3 on the other species, in bark colour.
- **Lumpier crowns.** On broadleaves, side lumps are added to the three biggest crown blocks, plus one lump on top. This breaks the flat, boxed crown line.
- **Oak.** A thick brown trunk (0.8 m wide, `trunk` #6B4A33) with spreading root spurs.
  - Its crown uses the shared mid-green canopy (#5FA83F–#7FC356). This is lighter than the dark green oak in the image.
  - The darker broadleaf green is beech (#558F3A / #67A445, grey bark #8E897D).
- **Yellow-green broadleaf.** Covered by the birch leaf colour. No separate species was added.
- **Cherry.** A pink crown (#F2A6C4 / #E88FB2) with twigs.
- **Birch root flare.** The white trunk with its root flare uses birch bark for the spurs.

## LOD and triangle cost decision

- **Near-only detail.** All the M013 detail is in the near-only `detail` list: root spurs, crown lumps, drooping tips and stump roots. That list is drawn only inside the 90 m near band.
- **Mid and far LOD are unchanged.** Mid draws the trunk plus at most 3 bounding boxes of the tier groups. Far draws the trunk plus at most 2 boxes and is capped at 36 triangles. As a result, zoomed-out and forest-edge cost did not grow.
- **Near cost per model.**
  - Bounded by tests: ≤ 260 triangles for every species, stage and variant. The M008 bound for a mature tree was raised from 160 to 240 to fit the spurs and lumps.
  - Always near > mid ≥ far.
  - Dying trees have fewer blocks than old trees.
- **Measured cost.** On the local build in software-GL Chromium (`13_Integration_and_QA/Evidence/M013-living-woodland/REPORT.md`):
  - Multi-draw path: the dense forest view at 50 m is 189,674 triangles, with 39,598 of them from 244 near trees.
  - `multidraw=0` fallback: 217–227k triangles in fixed views, peaking at 237k while panning. One earlier reading was 263k, above the 250k budget.
- **Possible further detail is deferred because of the fallback cost.** Examples: more crown lumps, or per-block bark marks on every stage. If more near detail is wanted, the fallback path's near band or detail list should be trimmed first.
- **Not done.** The tree renders were not checked against the original images side by side, because the images are not in the repo. The owner should review `wood-8-lineup.png`, `wood-9-lineup-close.png` and `wood-view-forest.png` in the evidence folder.
