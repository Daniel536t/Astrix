# IR-001 — Headless Render Path Verified

**Date:** 2026-10-22 · **Task:** 007 · **Owner:** DeepSeek
**Status:** Passed with findings

## What was built

- `08_Technical_Director/Project_Setup/tools/scene_probe.html` — throwaway terrain probe:
  72×72 m heightfield, 0.5 m terracing, 1 m cells, strata-banded side faces via vertex colours,
  basin water, 10 blocky trees, 4 rocks, ADB lighting.
- `08_Technical_Director/Project_Setup/tools/render.mjs` — Playwright harness: boots Chromium with
  SwiftShader, waits for `window.__ready`, screenshots, reports draw calls / triangle count / GL
  version and fails on console errors.

## Result

| Metric | Value |
|---|---|
| GL | WebGL 2.0 (OpenGL ES 3.0 Chromium) — software rasteriser |
| Draw calls | 111 |
| Triangles | 37,064 |
| Console errors | 0 |
| Output | `04_Art_Director/Reference_Analysis/probe_00{1,2,3}.png` |

Confirmed: we can produce real imagery of real geometry without an image model. This is the
foundation of every visual deliverable in this project.

## Defects found and fixed

1. **Inverted winding** — every quad was emitted clockwise, so all faces were back-face culled and
   the scene rendered as a dark plate. Fixed by deriving winding from the supplied normal.
   *Carry into `Game/src/render/terrain.ts`: do not hand-write vertex order per face type.*
2. **Water as a plane** — a 90 m plane intersected the landmass. Replaced with per-cell quads emitted
   only for submerged cells, giving the hard shoreline cut seen in REF-001 §6.
3. **Sun too high** — 45° produced short shadows; moved to ~30° to match the reference's long shadows.

## Finding that changes the voxel spec (important)

At **0.5 m steps on 1 m cells**, terrain edges render as a **sawtooth grid artefact**, not as the
broad terraces in the references. The cause is structural, not a tuning issue: terracing a continuous
noise field at cell resolution produces single-cell zigzags.

Consequences:

- The reference look needs **fewer, larger, higher steps** (1.5–2 m at terrace boundaries) and
  **smoothed contour lines**, not finer quantisation.
- A 0.45 m grass cap + 0.18 m rust band on a 0.5 m step means the cap consumes the whole step; the
  strata rule only reads when steps are ≥ 1.2 m.
- This must be resolved in the voxel specification before Task 004 composes a landscape, or the
  concept render will show sawtooth edges we then have to redo.

GLM has been given REF-001 §3/§10 as binding; this artefact is the empirical proof of why. Review
point for Task 003.

## Not yet done

- No game code. `Game/src` is still empty.
- Harness is not in CI; it is a manual tool.
- SwiftShader colour is approximate; final tone check must happen on a GPU.
