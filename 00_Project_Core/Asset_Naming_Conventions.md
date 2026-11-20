# Asset Naming Conventions

**Last updated:** 2026-10-22

## 1. Principles

- Names are lowercase, `snake_case`, ASCII, no spaces.
- The prefix declares the system: `vox_` (terrain/natural voxel), `nox_` (Noxel architecture/prop),
  `nat_` (natural custom mesh: trees, bushes, boulders), `ui_`, `mat_`, `tex_`.
- IDs in code are `camelCase` and match the file stem: `nox_founders_hall` → `foundersHall`.
- Never rename an approved asset; add a version suffix (`_v2`) and retire the old one through the
  decision log.

## 2. Patterns

```
mat_<family>_<tone>          mat_stone_pale, mat_grass_olive, mat_strata_rust
tex_<family>_<variant>       tex_grass_noise_a            (avoided in M1 — no textures)
vox_<category>_<variant>     vox_terrain_grass, vox_cliff_face, vox_ore_iron
nat_<species>_<state>        nat_tree_pink_a, nat_tree_pink_a_stump
nox_<family>_<piece>_<size>  nox_wall_straight_4m, nox_stair_run_6
ui_<area>_<element>          ui_sidebar_cost_row, ui_icon_wood
```

## 3. Directory placement

| Kind | Location |
|---|---|
| Noxel concepts & sheets | `05_Noxel_Studio/{Architecture,Buildings,Construction_Modules,Props,Asset_Sheets}/` |
| Voxel definitions | `06_Voxel_Studio/{Terrain_Blocks,Biomes,Rocks_and_Minerals}/` |
| Shared concept art | `01_2D_Artist/` |
| Exported glTF/GLB | `02_3D_Artist/Exported_Assets/` |
| Runtime assets | `Game/assets/<system>/` |
| Concept renders | `04_Art_Director/Approved_Art_Direction/` when approved, otherwise stay in the producing studio |

## 4. Metadata requirement

Every exported asset ships a sibling `.json`:

```json
{ "id": "nox_wall_straight_4m", "system": "noxel", "version": 1,
  "footprint": [4, 0.6], "height": 3.2, "snap": ["+x","-x"],
  "materials": ["mat_stone_pale"], "author": "mimo",
  "status": "review_required", "source": "05_Noxel_Studio/..." }
```

An asset without metadata cannot be integrated, regardless of how good it looks.

## 5. Reference images

`REF-###_<topic>.png` under `05_Noxel_Studio/Reference_Images/` or
`06_Voxel_Studio/Terrain_References/`, with the analysis document named identically.
Reference sets are immutable; new material gets a new number.
