# Decision Log

Format: `D-###` — decision — status — rationale — consequences.

| ID | Decision | Status | Rationale | Consequences |
|---|---|---|---|---|
| D-001 | Browser game built on **Three.js** (WebGL2). | Approved (owner) | Owner-directed. Fast iteration, no install, direct control of a diorama-scale scene. | No Unity/Godot tooling; we build our own editor affordances. |
| D-002 | **TypeScript** with `strict`, built by **Vite**. | Approved (DeepSeek, in architecture scope) | Required to be chosen before substantial code. Simulation/world data benefit from typed contracts; Vite gives near-zero-config dev server and ESM output. | Slight build overhead; no runtime type checks at the boundary, so save files are validated at load. |
| D-003 | Two construction systems: **voxels** for the natural world, **Noxels** for designed assets. | Approved (owner) | Reference imagery shows natural forms and architecture sharing a blocky vocabulary but not a uniform grid. Collapsing them would lose the identity. | Two pipelines, one shared palette and scale convention. |
| D-004 | Project root **is** `GameDev OS/` — i.e. `/home/ubuntu/as`; numbered folders at top level plus `Game/`. | Approved (DeepSeek) | The owner's tree maps 1:1 onto this workspace. Avoids a redundant nesting level and paths with spaces in build tooling. | Docs and game source stay separated by directory, not by repository. |
| D-005 | **Simulation is render-agnostic.** No `three` imports inside `Game/src/sim`. | Approved (DeepSeek) | Building cost/state/production must not live inside a mesh. Enables unit tests without WebGL and future renderer changes. | Enforced by review and a test that greps imports. |
| D-006 | World generation is **seeded and deterministic** (mulberry32 or equivalent). | Approved (DeepSeek) | A saved game must regenerate the identical terrain; also makes visual diffs meaningful. | Seed is part of every save file. |
| D-007 | Voxel terrain is a **heightfield + material/strata columns**, not a sparse voxel volume, for M1. | Proposed (awaiting GLM Task 003) | Settlements do not need overhangs in M1; heightfields are cheap to mesh, cut, and validate for building placement. | Cliffs/overhangs require a later extension; must be documented before building assets assume them. |
| D-008 | Terrain step quantum **0.5 m** on a 1 m XZ cell; build grid **2 m**. | Proposed (awaiting GLM Task 003) | References show terraces of uneven height, not 1 m Minecraft stairs. Half-metre quantum allows that while keeping 2:1 compatibility with the build grid. | Axis-aligned architecture sits cleanly on the 2 m grid without z-fighting on terraces. |
| D-009 | Visual deliverables are produced by **rendering geometry** in headless Chromium, because no image model exists. | Approved (DeepSeek, environmental constraint) | Honest path to real imagery; also dogfoods the actual renderer. | Renders cost more time than prompting; style must be authored in code, so the palette/material module is shared by concept renders and the game. |
| D-010 | Concept-art renders are **not** proof of implementation. Separate `Progress_Report` sections. | Approved (DeepSeek) | Prevents the classic failure of "we have 200 images and no game". | Every visual deliverable is labelled *concept render* or *in-game capture*. |
| D-011 | **Full day/night cycle is in scope** for M1. | Approved (owner) | Owner decision in response to the dusk reference. | Adds a time module + 4 lighting presets + per-frame sun movement. Materials stay single-set. Concept renders must state their time of day. |
| D-012 | World art direction is **Hybrid**: voxel terrain + Noxel architecture + *Styl* faceted organics. | Approved (owner, REF-002) | REF-002 defines the target explicitly. | Third mesh language `nat_`; Mimo's stacked-box canopies are superseded; palette replaced (Palette v2). |
| D-013 | **Green-dominant forest with pink blossom accents.** | Approved (owner, REF-002) | Resolves Q-001; forest must read as harvestable wood. | Pink species ≤ ~25% of tree instances; palette-swappable, not geometry-dependent. |
| D-014 | Palette v2 (`04_Art_Director/Approved_Art_Direction/palette_v2.json`) supersedes the REF-001 eyeballed values. | Approved (DeepSeek) | REF-002 is brighter/saturated; navy water was a dusk mood, not the material. | GLM §4/§5 and Mimo §4 require revision. Ore accent moves teal → violet. |
| D-015 | Ore accent is **violet crystal `#7B5AD6`**, not teal. | Proposed (owner glance) | Teal now collides with turquoise water. | If rejected, choose a non-cyan, non-magenta accent. |
| D-016 | T-009 candidate world is **256 × 256 m** (1 m cells, ±128 m), with the playable camera target clamped to ±120 m. | **Proposed (GLM ratification)** | The approved 128 m v1 map compressed the lake, forest and massif into a diorama; 256 m lets the authored regions connect. | A new `start_map_v2_proposal` (MD + JSON) is the layout contract. `start_map_v1.json` remains the formally approved baseline until GLM ratifies. Task 004 stays blocked. |
| D-017 | Natural terrain is rendered as a **1 m voxel mesher** with greedy-merged tops and run-merged cut faces; T-008's continuous heightfield is superseded. | **Review Required (GLM + human art)** | T-008 was not approved; block construction, exposed strata and readable cliffs were the review requirement. | Terrain triangles and draw calls are measured in IR-004; the visual read still needs human acceptance. Noxel language is unchanged. |

## Open decisions

| ID | Question | Owner | Needed by |
|---|---|---|---|
| Q-001 | Pink vs green-dominant forest | **Resolved (D-013)** | — |
| Q-002 | Day/night scope | **Resolved (D-011): full cycle** | — |
| Q-003 | Are heightfield-only cliffs acceptable for M1, or must cliff overhangs exist in the first world? | Human owner + GLM | Task 005 |
| Q-004 | Is the 256 m v2 layout ratified, including authored ellipse regions and the ±120 m playable clamp? | GLM | T-009 review |
| Q-005 | Do the blocky highland silhouette and hard river banks pass art review, or need another geometry/value pass? | Human owner + GLM | T-009 review |
| Q-006 | Can the provisional Noxel kit be accepted as a coexistence test while the owner reference images are still absent? | Owner + Mimo | T-009 review |
