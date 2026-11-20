# Agent Roles and Workflows

**Last updated:** 2026-10-22

## 1. Roles

### DeepSeek — Master Orchestrator / Technical Director
Owns architecture, task decomposition, delegation, integration, review and final acceptance.
Writes and maintains `00_Project_Core`. Does not spend budget on work a specialist can do
better; does retain enough context to judge the result.

### Mimo (`opencode/minimax-m3.1-flash-free`) — Lead Noxel Artist
Owns the Noxel design language: architecture, modular systems, buildings, props, asset sheets,
proportions, palettes, and implementation-oriented specifications. Receives the owner's
reference images directly whenever possible.

Mimo designs the *language*; that does not imply Mimo can emit production 3D meshes. Concept
illustration, specification and exportable geometry are different deliverables and are always
labelled as such.

### GLM (`opencode/glm-5.3-flash-free`) — Voxel World Specialist
Owns terrain representation, voxel grid conventions, block and material definitions, biome
rules, procedural generation parameters, natural resource placement, and voxel-side
performance. Must work inside the world-level art direction set by the owner and recorded in
`Art_Direction_Bible.md`.

### Human owner
Final authority on art direction and scope. Supplies references, approves or rejects style,
and resolves genuinely expensive or irreversible choices.

## 2. Hard boundaries

| Concern | Voxel (GLM) | Noxel (Mimo) |
|---|---|---|
| Domain | Natural terrain and natural features | Designed architecture, props, settlement assets |
| Geometry | Grid-oriented, quantized | Custom modular meshes, off-grid allowed |
| Deliverables | Terrain rules, block definitions, generation params | Reference sheets, modular kits, asset specs |
| Integration owner | DeepSeek | DeepSeek |

Neither specialist may unilaterally redefine the other's system. Boundary changes are recorded
in `Decision_Log.md` before they are implemented.

## 3. Task format (mandatory when delegating)

```
Task ID:
Owner:
Objective:
Context:            (only the relevant approved decisions)
Scope:
Out of scope:
Inputs:             (files, references, prior outputs)
Deliverables:       (exact paths)
Acceptance criteria:
Dependencies:
Reporting:          (what to report back, and where files were written)
```

## 4. Review states

`Proposed` → `In Progress` → `Review Required` → `Approved`
plus `Blocked` (missing dependency) and `Rejected` (fails requirements; reason recorded).

Only DeepSeek moves an item to `Approved`, and only after inspecting the artifact.

## 5. Known environmental constraints (verified, not assumed)

- No diffusion/image-generation model is available in this environment. Visual deliverables are
  therefore produced by **rendering real geometry** (Three.js + headless Chromium/SwiftShader,
  verified working) or by vector/raster drafting (Python + Pillow, ffmpeg available).
  A text description is never submitted in place of a requested image.
- Sub-agents start with empty context and **cannot see images that exist only in the
  orchestrator's conversation**. Reference images must be present on disk under
  `05_Noxel_Studio/Reference_Images/` before a sub-agent can analyse them. Until then, DeepSeek
  performs the visual analysis and passes the written analysis as the input.
- Headless renders are for review and specification. They are not evidence that a feature is
  implemented in the game.

## 6. Cost discipline

1. Reuse approved specs; do not ask an agent to rediscover a decision.
2. One task, one owner. Duplicate runs only for high-impact decisions.
3. Do not redo finished work without naming the specific defect.
4. Return concise completion reports; long rationale lives in the artifact, not the report.
