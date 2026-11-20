# Task Backlog

States: `Proposed` · `In Progress` · `Review Required` · `Approved` · `Blocked` · `Rejected`

## Active

| ID | Task | Owner | State | Depends on |
|---|---|---|---|---|
| 001 | Project baseline | DeepSeek | **Approved** | — |
| 002 | Noxel reference analysis + style guide + natural asset spec | Mimo | **Approved** (v2 faceted canopy) | owner references |
| 003 | Voxel terrain direction + scale/coordinate conventions | GLM | **Approved** (v1.1 spec; layout not yet implemented literally) | — |
| 004 | Primary world concept (untamed landscape) | Mimo + GLM consult | **Blocked** | 008 |
| 006 | Runnable Three.js world: terrain, water, trees, rocks, camera, day/night | DeepSeek | **Review Required** — IR-003 | 003 |
| 007 | Headless render harness | DeepSeek | **Approved** — IR-001 | — |
| 008 | Terrain/world pass: 256 m voxel landscape, authored regions, Noxel coexistence test + movement controls | DeepSeek (with GLM consult) | **Review Required** — IR-004 (T-009; T-008 continuous pass superseded; not approved) | 003, 006 |
| 014 | Public hosting: dedicated EC2 server + open port 80 | DeepSeek | **Approved** — DEPLOY-001 | 006 |

## Queued

| ID | Task | Owner | Gate |
|---|---|---|---|
| 009 | Cliff run-merging (GLM §3.3) + triangle reclaim | DeepSeek | 008 — **terrain run-merging implemented in T-009**; remaining work is Noxel block meshes |
| 010 | Terrain biome reference sheets | GLM | 008 |
| 011 | Resource asset sheets — render verification of AS-001 v2 | Mimo | 008 |
| 012 | Camera & scale reference sheet | DeepSeek | 008 |
| 013 | Implementation reference: world → game translation | DeepSeek | 008 |
| 020 | Resource inventory + HUD | DeepSeek | 012 |
| 021 | Building definitions, costs, sidebar | DeepSeek + Mimo | 020 |
| 022 | Placement preview + validity rules | DeepSeek | 021 |
| 023 | Resource gathering loop | DeepSeek | 021 |
| 030 | First Noxel building kit (founder's hall) | Mimo | 013 |

## Notes

- Task 004 remains gated on 008 **review**, not on more generation work. T-008 was not approved and
  is superseded by T-009: a 256 m voxel-meshed landscape with authored regions, 245,094 tris / 49
  calls, and a provisional Noxel kit. IR-004 is the review record. T-009 is **not approved**.
- **T-009 is a candidate, not a completed approval.** A reviewer must accept (a) the 1 m voxel
  construction at eye level, (b) the highland silhouette, (c) the hard river banks, (d) voxel + Noxel
  coexistence, and (e) the 256 m layout. Approving 004 before that would lock in the wrong
  silhouette.
- **256 m is not ratified.** It supersedes the approved 128 m `start_map_v1.json` for review only.
  GLM must accept `06_Voxel_Studio/Biomes/start_map_v2_proposal.md` / `.json`; until then v1 remains
  the formal baseline.
- **Noxel reference images are still absent** (`05_Noxel_Studio/Reference_Images/` is empty). The
  waystone/marker and kit are provisional, spec-conformant studies (AS-002), not final architecture.
- **Budget is thin:** 245,094 / 250,000 triangles (4,906 headroom), 49 / 120 draw calls. Any prop or
  groundcover addition must reclaim triangles first.
- T-009 also retains desktop/tablet/phone movement (keyboard, one-finger orbit, two-finger pinch/pan,
  on-screen D-pad). This is part of the 008 review, not a separate approved task.
- Palette has one authoritative file; the game currently holds a manual copy (must be automated).
