# T-009 evidence — voxel landscape + provisional Noxel coexistence

**Status:** Review candidate. **Not approved.** Task 004 is blocked.
**Build:** `Game/dist`, seed 1337, Vite + three r186.
**Public URL:** <http://51.21.199.227/> (deployed 2026-10-24T02:38:50Z).
**Report:** [`IR-004_voxel_noxel_world.md`](../../Integration_Reports/IR-004_voxel_noxel_world.md).

All images are in-game WebGL2 captures (SwiftShader), not concept art.

| File | Frame | Calls | Triangles |
|---|---|---:|---:|
| `T-009_world_default.png` | default gameplay, noon | 49 | 245,094 |
| `T-009_world_voxel_closeup.png` | river bank / strata close-up | — | — |
| `T-009_world_topdown.png` | `scene=map`, north up | 50 | 201,670 |
| `T-009_world_layout_annotated.png` | documentation labels over the map | — | — |
| `T-009_noxel_kit.png` | `scene=kit`, five pieces | 21 | 16,238 |
| `T-009_noxel_closeup.png` | waystone in the landscape | 43 | 237,750 |
| `T-009_time_dawn.png` | t = 0.22 | 49 | 245,094 |
| `T-009_time_noon.png` | t = 0.50 | 49 | 245,094 |
| `T-009_time_dusk.png` | t = 0.78 | 49 | 245,094 |
| `T-009_time_night.png` | t = 0.00 | 49 | 245,094 |
| `T-009_mobile_390.png` | 390×664 touch layout | 43 | 238,368 |
| `T-009_public.png` | deployed public URL | 49 | 245,094 |

Budget: **120 calls / 250,000 triangles**. Default headroom: 4,906 triangles (1.96 %).

The `—` cells were not instrumented; both are visual/documentation frames. The mobile frame has a
measured range of 41–43 calls / 238,272–238,368 triangles across the initial view and a forward hold.

## What to review

1. Voxel construction: `T-009_world_voxel_closeup.png` and the default frame.
2. Noxel coexistence: `T-009_noxel_kit.png`, `T-009_noxel_closeup.png`.
3. Layout: `T-009_world_topdown.png` / `T-009_world_layout_annotated.png`, plus
   `06_Voxel_Studio/Biomes/start_map_v2_proposal.md`.
4. Open questions: IR-004 §13.

The Noxel kit and both landmarks are **provisional**: the owner's reference images are still absent.
`start_map_v2` and D-016 (256 m) await GLM ratification; `start_map_v1.json` remains the last formally
approved map.
