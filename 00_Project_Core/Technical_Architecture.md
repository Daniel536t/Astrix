# Technical Architecture

**Last updated:** 2026-10-22 · **Status:** v0.1 — decisions D-001…D-010 apply.

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Rendering | Three.js r180+, WebGL2 | `three` from npm |
| Language | TypeScript `strict`, ES2022 modules | |
| Build | Vite 7 | `npm run dev` / `npm run build` |
| UI | Plain HTML/CSS overlay + typed DOM helpers | No React in M1 |
| Tests | `node:test` + `tsx` for sim; Playwright for render/screenshot checks | |
| Save | JSON in `localStorage`, schema-versioned | |

## 2. Layering (enforced, not aspirational)

```
Game/src/
  sim/        pure TypeScript. NO three. NO DOM.
  data/       static definitions (JSON/TS) — resources, buildings, biomes, palette
  render/     three.js scene, meshes, materials, camera, input-to-camera
  ui/         DOM overlay, sidebar, HUD
  app/        wiring: boot, game loop, save/load, event bus
  main.ts
```

Rule: `sim` may not import `three`, `ui`, or `render`. A test enforces this by scanning imports.
`render` may read `sim` state; it may never mutate game rules. A building's cost and output live in
`data/` + `sim/`; its mesh lives in `render/` and is addressed only by `buildingId`.

Why: the placement validator must be testable without a GPU, and the world must be regenerable from
a save file without replaying meshes.

## 3. Core data contracts (v1)

```ts
// sim/world.ts
interface WorldSpec { seed: number; size: number; /* cells per side */ }
interface TerrainCell { height: number; material: MaterialId; flags: number }

// sim/resources.ts
interface ResourceNode {
  id: string;
  type: ResourceType;            // 'wood' | 'stone' | 'ore' | 'food' | 'freshwater'
  cell: [number, number];
  remaining: number;
  max: number;
  state: 'full' | 'partial' | 'depleted';
}

// sim/inventory.ts
type Inventory = Record<ResourceType, number>;

// data/buildings.ts  (M2)
interface BuildingDef {
  id: string; name: string;
  footprint: [number, number];   // metres, multiple of build grid
  cost: Partial<Inventory>;
  buildSeconds: number;
  requiresFlat: boolean;
  maxSlope: number;
  produces?: { type: ResourceType; perMinute: number }[];
}
```

## 4. Terrain

- **Representation:** heightfield, 1 m cells, 0.5 m quantum, seeded generation (D-006/D-007).
- **Meshing:** per-chunk (32×32) custom `BufferGeometry`, top quad per cell plus side quads only where
  a neighbour is lower. Vertex colours carry the strata bands so one material serves the whole
  terrain (1 draw call per chunk, no texture atlas).
- **Strata:** top quad = grass material colour; side quads = vertex-colour ramp
  (grass cap → red-brown band → stone body) computed from world Y. This satisfies REF-001 §3 with
  no texture cost.
- **Cliffs:** cells whose neighbour drop exceeds a threshold get a vertical face without the terraced
  intermediate steps, giving the smooth-plane look of REF image 3.
- **Chunks:** created lazily within camera far plane in M1; fixed for the 128 m prototype.

## 5. Water

Single plane mesh at y = 0 covering the basin, `MeshStandardMaterial` with low roughness
transmission-free (no `MeshPhysicalMaterial` refraction in M1), depth-tinted via vertex colour or a
two-tone gradient. Shoreline is the terrain's hard cut — no foam geometry.

## 6. Camera

`OrbitCameraRig` in `render/camera.ts`: spherical target-relative orbit, pointer-drag yaw/pitch,
wheel dolly, pan with middle-drag or two-finger. Clamps from ADB §4. Renderer obtains the same
parameters from `data/camera.ts` so the render harness and game share them.

## 7. Render settings

- `ACESFilmicToneMapping`, exposure ~1.05
- `PCFSoftShadowMap`, 2048, directional sun elevation 30° (ADB §6)
- `HemisphereLight` for violet shadow fill
- `FogExp2` optional
- `devicePixelRatio` capped at 2
- No postprocessing in M1

## 7b. Time of day (D-011)

Split across the boundary:

```
sim/time.ts      TimeState { t: number /* 0..1, 0 = midnight */, dayLengthSec: number }
                 advance(dt) — pure, deterministic, saved. No three import.
render/sky.ts    applies TimeState to: sun/moon direction + colour + intensity,
                 hemisphere colours, scene.background, FogExp2 colour/density, exposure.
data/palette.ts  the four presets from palette_v2.json, single source of truth.
```

Rules:
- Sun direction from `t`: elevation/azimuth interpolated between the four presets, not a raw sin arc —
  authored keyframes give a better dusk than a physical model.
- The shadow camera re-targets to the camera focus, not the world origin, so shadows stay crisp at zoom.
- Shadow map refresh may be throttled to every second frame; the sun moves slowly at a 10-minute day.
- Night legibility is a test target, not an afterthought: the §7 readability contract must hold at t=0.0.
- `dayLengthSec` default 600 s. Pausing time must be possible for screenshots.
- Render harness accepts `?t=0.5` so every concept render declares its time of day.

## 8. Performance budget (M1)

| Metric | Target |
|---|---|
| Frame time | ≤ 16 ms at 1920×1080 on integrated GPU |
| Draw calls | ≤ 120 |
| Triangles | ≤ 250 k |
| JS heap | ≤ 120 MB |
| Initial load | ≤ 3 s on a warm connection |

## 9. Save format

```json
{ "schema": 1, "seed": 123456, "createdAt": "...", "camera": {...},
  "inventory": {...}, "buildings": [], "harvested": [] }
```

Load validates `schema`, then regenerates terrain from `seed` and re-applies deltas. No meshes are
serialised. Unknown keys are preserved on save (forward compatibility).

## 10. Render harness (not the game)

`08_Technical_Director/Project_Setup/tools/render.mjs` — Playwright + headless Chromium
(`--use-angle=swiftshader`) loads a scene module, waits for a `window.__ready` flag, and writes a PNG
at a fixed size. Used for:

- concept renders of world compositions (Task 004);
- camera/scale reference sheets (Task 012);
- screenshot regression when visuals change.

Verified available: Chromium 1248, SwiftShader, ffmpeg. Not yet proven end-to-end for our scene —
that is Task 007.

## 11. Known risks

| Risk | Mitigation |
|---|---|
| SwiftShader renders are slow and differ subtly from GPU output | Use for composition review only; treat colour as approximate until GPU check |
| Heightfield cannot do overhangs | Documented; Q-003 |
| Strata via vertex colour fights fog/tonemapping | Tune in M1 once terrain renders |
| Two palettes (game vs harness) drift | One shared palette module imported by both |
| Voxel and Noxel scale mismatch | One scale table in ADB §5; both specialists cite it |
