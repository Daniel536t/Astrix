# M004 living-world phase 1 — browser evidence

**Date:** 2026-11-23 · **Build:** local production build (`vite build`) of the `deploy/boxd` working tree, served to
headless Chromium through Playwright request interception (the sandbox cannot open a local port).
**Renderer:** SwiftShader software WebGL. These are **not** physical-GPU or real-device results.
**Status:** implementation evidence only. No owner art acceptance or milestone approval is claimed.

## Captures

| File | What it shows | Metrics at capture |
|---|---|---|
| `astrix-boxd-live.png` | The *previous* build on the public URL, for comparison | 47 calls · 194,972 tris |
| `v2-settlement.png` | Generator v2 default view: founder valley unchanged, transparent near water | 65 calls · 235,300 tris · 0 console errors |
| `v2-river-cascade.png` | Mountain river channel with animated current and foam in the v2 massif | 65 calls · 289,778 tris |
| `v2-massif.png` | Wide view of the northern massif; the river enters from the tarn valley | 83 calls · 363,020 tris |
| `explore-walk.png` | Founder character in explore mode, follow camera, panels hidden | — |
| `river-wildlife.png` | River with transparent shallows; hares on the bank | 52 calls · 214,154 tris; fauna 54 (12 trout, 37 hares, 5 deer) |

**Budget note.** The wide massif view exceeds the 250k-triangle / 120-call budget on triangles (363k). The default
settlement view is within budget. The far massif is drawn by the macro LOD plus near chunks; triangle reduction for
tall terrain (greedy side merging in the macro mesh, a coarser far ring) is open work.

## Travel probe (`travel-probe.js`)

The probe holds W for 24 s in the builder view and samples streaming every 3 s.

| Build | Resident chunks over ~450 m | Swept |
|---|---|---|
| Previous (live) | 81 → 135, still rising | n/a |
| Phase 1 | 81 → 99–103, bounded | 49 |

The frame interval was ~230 ms p50 in software WebGL for both builds. This reflects the rendering speed of
software WebGL, not the main-thread work. CPU frame work in the new build was p50 22 ms and p95 61 ms in the same run.

## Explore check

Spawned at (-17.5, 14, -17.5), on the ground after landing:
- Walk speed 4.2 m/s and run speed 7.5 m/s matched the rule.
- The character stepped up a one-voxel ledge.
- The interaction target was found within reach (`hero:styl_tree_spire:-22:-26`).
- No page or console errors.

## Not verified

- Real GPU frame times.
- Real phones and tablets.
- Long sessions (memory over hours).
- Wildlife inspection UI.
- An underwater view.
