# Progress Report

**Date:** 2026-10-24 · **Phase:** T-009 voxel landscape + provisional Noxel coexistence — **review required, not approved**

## Summary

T-008's continuous heightfield was not approved and is superseded. T-009 rebuilds the natural world as
a **256 × 256 m voxel landscape** (1 m cells, 0.5 m height quantum) with connected authored regions,
a block mesher, and a small **provisional** Noxel presence. It is an in-engine review candidate, not
an approval. **Task 004 and any hero illustration remain blocked.**

## Designed (documents)

- Baseline: brief, GDD, architecture, ADB, naming, roles, decisions (D-001…D-017), backlog.
- `REF-001` Noxel architecture analysis and `REF-002` hybrid world analysis.
- Noxel Style Guide v1.0 (Mimo); Natural Asset Spec v2 (Mimo, faceted `NatMass`).
- Voxel Style Guide v1.0 + v1.1 (GLM); `start_map_v1.json` remains the last **formally approved**
  128 m map.
- `06_Voxel_Studio/Biomes/start_map_v2_proposal.md` + `.json` — proposed 256 m layout contract,
  awaiting GLM ratification (D-016).
- `13_Integration_and_QA/Integration_Reports/IR-004_voxel_noxel_world.md` — T-009 review record.
- `05_Noxel_Studio/Asset_Sheets/AS-002_noxel_reference_sheet_provisional.md` — provisional kit sheet
  and conformance gaps; owner reference images are still absent.
- Palette v2 (`04_Art_Director/Approved_Art_Direction/palette_v2.json`). Lighting was rebalanced in
  T-008; materials are unchanged.

## Generated (images)

T-009 capture set, all in-game renders (not concept art), seed 1337, in
`13_Integration_and_QA/Evidence/T-009/`:

- `T-009_world_default.png` — 1600×900 default gameplay framing.
- `T-009_world_voxel_closeup.png` — 1200×800 river-bank voxel close-up.
- `T-009_world_topdown.png` — 1400×1400 top-down map.
- `T-009_world_layout_annotated.png` — documentation overlay with region labels.
- `T-009_noxel_kit.png` — 1400×900 post, wall panel, gateway, stair and waystone.
- `T-009_noxel_closeup.png` — 1000×1000 waystone in the landscape.
- `T-009_time_dawn/noon/dusk/night.png` — 1600×900, t = 0.22 / 0.50 / 0.78 / 0.00.
- `T-009_mobile_390.png` — 390×664 touch layout.
- `T-009_public.png` — 1600×900 render of the deployed public URL.

## Implemented (running code)

`Game/` builds and runs. T-009 replaces the continuous natural mesh with a voxel mesher and expands
the world:

- **Sim (`src/sim/world.ts`, no `three` import):** 256 × 256 cells, authored ellipse/mask regions —
  Founder valley, Eastwood, Hanging wood, South downs, West rise, Crown massif (six cores, 12 separate
  crags, talus, three ravines), Sentinel Rock, Mirror lake and Heron islet, stepped river with an 18 m
  floodplain, eight isolated border mesas. 433 props: 308 trees, 97 rocks, 28 ore; 2 Noxel sites.
- **Render (`src/render/terrain.ts`):** 1 m cells, greedy-merged top faces, run-merged cut faces,
  three geometry bands (grass / ochre / rust) plus a world-space course/joint/stain shader, blocky
  water, reeds. A 12 m foundation skirt, a render-only 12 m-resolution apron and five jagged horizon
  rings prevent a floating-box edge. Terrain `castShadow` is off for budget; props and Noxels cast.
- **Noxel (`src/render/noxel.ts`, provisional):** post, wall panel, gateway, stair, 7.85 m forked
  waystone and 4.0 m marker; flat prisms, 5 cm seats, teal/blue accents; kit-only flat shelf so the
  test scene has clean ground contact.
- **App:** world / map / kit scene modes, HUD, time presets, desktop + touch controls, reproducible
  URL framing. The shipped build exposes only `window.__probe.renderer`.

Metrics (budget **120 calls / 250,000 triangles**, unchanged):

| Mode | Draw calls | Triangles |
|---|---:|---:|
| Default world | 49 | **245,094** |
| Top-down map | 50 | 201,670 |
| Noxel kit | 21 | 16,238 |
| Noxel close-up | 43 | 237,750 |
| Mobile 390×664 | 41–43 | 238,272–238,368 |
| Public URL | 49 | 245,094 |

Headroom in the default view is **4,906 triangles (1.96 %)**. Any prop or groundcover addition must
reclaim triangles first.

## Deployed

- Public server `i-06e433729ac159665` (t3.micro, AL2023, nginx) in eu-north-1b, SG
  `sg-020850b03455baf08`. **http://51.21.199.227/** serves the final T-009 build (deployed
  2026-10-24T02:38:50Z).
- Verified externally after redeploy: HTTP 200; headless WebGL2 render of the public URL is
  49 draw calls / 245,094 triangles / 0 console errors. Capture: `T-009_public.png`.
- No TLS or domain; public IP is ephemeral. Details:
  `08_Technical_Director/Deployment/DEPLOY-001_public_server.md`.

## Tested / verified

- `vite build` passes; production bundle in `Game/dist`; 0 console/page errors in every captured mode.
- Determinism, seed 1337 twice: heights `51296949`, materials `a3087357`, flags `f0360f66`; 433 props;
  2 sites — identical. Seed 42 differs.
- Layer rule: `sim/` has no `three` import and no `Math.random`.
- Mobile 390×664: coarse pointer, 5 pads + 2 zoom buttons, HUD offset 142 px, no horizontal overflow,
  a 0.9 s held pad press moved the camera (frame changed), 0 errors.
- All four time presets and the public render were captured against the final build at
  49 calls / 245,094 triangles.

## Approved

- D-001…D-014 approved. D-015 (ore violet) still awaiting owner glance.
- Noxel architecture spec (Mimo v1.0) accepted as the grammar; AS-001 v2 accepted pending a render
  check of the faceted canopy.
- Voxel spec v1.1 accepted as specification.
- **T-008 is not approved.** **T-009 is Review Required, not approved.** D-016 (256 m) and D-017
  (voxel mesher) are pending GLM/human review. **Task 004 remains blocked.**

## Known issues

- **Highland silhouette:** at the default camera the Crown massif still reads as a blocky mesa or
  fortress. The 12 crags and talus help closer in; this is the main art-direction question.
- **River banks:** the hard blocky banks are deliberate and GLM-consistent, but the pale stone/sand
  courses can read as a canal. The value contrast is the likely fix, not softer geometry.
- **Noxel provenance:** owner reference images are still absent. The kit and both landmarks are
  spec-conformant studies (AS-002), not final architecture.
- **256 m is not ratified.** It supersedes the approved 128 m `start_map_v1.json` for review only.
- **Thin triangle headroom** (1.96 %), and terrain shadows are disabled to stay under budget.
- `Game/src/data/palette.json` is a manual copy of the authoritative palette; no sync check.
- Captures use SwiftShader; tone should be checked once on a real GPU.
- No gameplay loop or resource inventory; props are scenery and resource hints.

## Deviations

- **256 × 256 m instead of the approved 128 × 128 m** — proposed, needs GLM ratification (D-016).
- **Voxel mesher instead of T-008's continuous heightfield** — T-008 was not approved; block
  construction was the review requirement (D-017, Review Required).
- **Authored ellipse/mask landforms instead of literal `start_map_v1` rects** — keeps regions
  connected; resource counts differ (433 scenic props vs 92 v1 resource nodes).
- **Noxel kit custom pieces** (post 3 volumes, wall panel 7) — written grammar only; owner images
  absent. Provisional.

## Next

1. Human review of IR-004: voxel construction, highland silhouette, river banks, Noxel coexistence,
   and the 256 m layout.
2. GLM ratification of D-016 / `start_map_v2_proposal` if the larger map is accepted.
3. Targeted art/geometry fixes from that review — **not** Task 004 and not a hero illustration.
4. After acceptance: unblock Task 004, then Task 012 camera/scale sheet and the T-020+ gameplay loop.
5. Automate the palette copy before the next palette edit.
