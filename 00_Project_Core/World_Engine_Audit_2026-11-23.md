# ASTrix — World Engine Audit and Roadmap to a Living World

**Date:** 2026-11-23 · **Author:** game engineering (Kiro) · **Deadline:** 2026-11-27
**Goal from the owner:** a world that feels real: a character you control, a proper camera and controls,
water that flows with creatures in it, and animals on land.

This audit reviews the voxel and Noxel architecture as it exists in `Game/src`, says what each part can
and cannot carry, and lays out the work in dependency order. Line references are to the current branch.

---

## 1. Voxel architecture (terrain, geology, water)

### What it is
- **Storage.** 2048 × 2048 m world, 32 × 32 × 128 chunks, one material byte per 1 m cell
  (`sim/world.ts:16-41`, `144-158`). About 130 KiB per chunk. Edits are a separate overlay that survives
  regeneration (`setVoxel`, `world.ts:741-768`). This is sound and stays.
- **Generation.** Pure function of the seed: domain-warped FBM island, NW highlands, a north–south river
  (`riverCenterX`, `world.ts:334`), one lake at (-260, -230), sea outside the island ellipse, sparse caves,
  overhangs and ore (`surfaceHeightAt`, `world.ts:358-442`).
- **Meshing.** Greedy mesher, one mesh per chunk, vertex colours plus a small `onBeforeCompile` shader
  for stone joints and grass noise (`render/terrain.ts:135-334`). 7 × 7 near chunks plus an 8 m macro LOD.
- **Measured.** 47–51 draw calls, ~195k triangles in the default view (budget 120 / 250k). Startup ≈ 1.9 s.

### What limits a "real world"
| # | Finding | Evidence | Consequence |
|---|---|---|---|
| V1 | **All water is flat at sea level (y = 0).** River, lake and sea are the same height; there is no gradient, source, mouth or flow direction anywhere. | `world.ts:601-610`, `SEA_LEVEL = 0` | "Flowing" water today can only be visual. Real downhill rivers with falls need a new terrain generator. |
| V2 | **Water is one opaque 20 km plane** with static vertex colours. No transparency, no animation, no time uniform. | `terrain.ts:338-374` | Fish would be invisible; nothing moves. |
| V3 | The macro LOD **skips underwater cells**, so making water transparent would expose holes at distance. | `terrain.ts:677`, `919` | A seabed must be drawn before water can be see-through. |
| V4 | River gravel uses **unwarped** coordinates but the channel is carved on **warped** ones (up to ~135 m apart). | `world.ts:410` vs `456` | Any flow field must use the warped centreline or the real water voxels, not `riverCenterX` directly. |
| V5 | **Chunk leak.** Neighbour chunks generated for meshing or by sim queries are never evicted. | `terrain.ts:839-857` | Memory grows as the camera travels. A walking character makes this worse. |
| V6 | **Any terrain query can synchronously generate a chunk** (3–5 ms each). | `getVoxel` → `ensureChunk` | Animals or a character near the edge of the loaded ring will cause frame hitches. |
| V7 | Main-thread meshing spikes of 40–83 ms (p95) and macro rebuilds of 125–276 ms. No Web Workers. | QA evidence `results*.json` | Ground-level movement streams chunks more often; visible stutter. |
| V8 | `clearanceAt` treats water as an obstacle, so `walkStep`'s 0.4 m wading allowance never applies. | `sim/terrain.ts:111-117`, `457-477` | Characters and animals can't cross shallow water until fixed. |
| V9 | No pathfinding. `walkStep` is a good A* edge test (step ≤ 1 m, drop ≤ 1.5 m, slope, clearance) but only 4-neighbour and integer heights. | `sim/terrain.ts:441-486` | Need A* plus smooth height interpolation for movement. |

## 2. Noxel and organic architecture (buildings, nature)

### What it is
- **Noxels** are procedural boxes merged into one vertex-coloured, flat-shaded Lambert mesh per assembly
  (`render/noxel.ts:32-56`). Structures come from authoritative sim records (`StructureModule`,
  `sim/structures.ts:48-76`) and are meshed once per build (`render/structures.ts:119-150`).
- **Styl organics** (trees, shrubs) are faceted ellipsoids and 6-sided trunks, deterministic per variant,
  198–252 triangles per tree, all drawn in **one BatchedMesh** (`render/nature.ts:89-160`, `342-407`).
- **No asset files.** No glTF/GLB loader, no skinned meshes, no `AnimationMixer`. Everything is code.

### What limits a "real world"
| # | Finding | Evidence | Consequence |
|---|---|---|---|
| N1 | **Nothing moves.** The only per-frame motion is the sky and the camera. There is no entity update loop. | `main.ts` frame loop | Characters, animals, fish and water all need a new update loop. |
| N2 | **The art bible allows only three mesh languages** (voxel, Noxel, Styl) and forbids a fourth without an owner decision. No document assigns characters or animals to any of them. | `Art_Direction_Bible.md:13-24` | **Owner decision needed** before building creatures (see §5). |
| N3 | Nature rebuilds **everything** in loaded chunks on any harvest or chunk change, and builds a throw-away geometry per entity during bucketing. | `nature.ts:~352`, `main.ts:163-176` | Wasteful now; must be fixed before trees sway or regrow. |
| N4 | The same paint/merge helper is copied in four files. | `noxel.ts`, `structures.ts`, `nature.ts`, `life.ts` | Extract one `render/mesh-kit.ts` before adding creature meshes. |
| N5 | Code diverges from the Noxel guide: vertex colour on architecture (guide §4.3.4), emissive waystone accents (R8), cone roof on the stockpile. | `noxel.ts:110-113`, `life.ts:77-87` | Art debt; not blocking. Record, fix when art is reviewed. |

## 3. Camera, controls and UI

| # | Finding | Evidence |
|---|---|---|
| C1 | The camera orbits a **free point**, not a character. WASD moves that point at 16–80 m/s at a fixed height, so it sinks into hills and floats over valleys. | `render/camera.ts:126-158` |
| C2 | **No terrain collision.** At low pitch the camera goes into hillsides. Minimum distance is 12 m, so there is no close, human-scale view. | `camera.ts:45`, `118` |
| C3 | Every mouse button orbits; no mouse pan; context menu not suppressed; wheel zoom ignores trackpad deltas. No smoothing. | `camera.ts:28-75` |
| C4 | Defaults contradict the art bible (§4: pitch 28–62°, distance 22–95 m, far 600 m). | `camera.ts:26`, `main.ts:~108-123` |
| C5 | **Key conflicts.** Space = pause time, 1–4 = time of day, Q/E = rotate, Shift = camera boost. These are the keys a character game uses for jump, hotbar, interact and sprint. | `main.ts:441-489` |
| C6 | The camera target is the de-facto player: streaming, shadows and the 40 m harvest radius all centre on it. | `main.ts:226-279`, frame loop |
| C7 | **Panels cover 34–48 % of a desktop screen** and can't be collapsed; the HUD overlaps the Settlement panel; on mobile the Settlement panel covers ~78 % of the width. | `styles.css:14-29`, `189-205`, `390-407` |

## 4. Target experience (what "done" looks like for the 27th)

1. You spawn as a **founder character** standing in the valley. WASD walks, Shift runs, Space jumps,
   the camera follows behind you, never clips into terrain, and you can scroll from close third-person
   out to the existing overview.
2. **E** interacts with whatever you're looking at or standing next to: chop a tree, gather a shrub,
   open the build menu at a site. Gathering requires being near the resource.
3. **Tab** (or a button) switches to **Builder view**, the current overview camera and panels.
   In Explore view the panels collapse to a compact HUD.
4. The **river visibly flows** downstream with moving surface facets and foam at the banks; the lake
   ripples; the sea has slow swell. Water is see-through near the shore so you can see the bed.
5. **Fish** school in the river and lake and scatter when you wade in. **Animals** (deer, rabbits, birds)
   graze and wander on walkable ground, react to you, and behave differently at night.
6. Frame budget holds: ≤ 120 draw calls, ≤ 250k triangles, no new stutter.

Honest limit: in this window the river stays at sea level, so "flow" is a visual current along the
channel, not water running downhill. Elevation rivers and waterfalls are post-deadline (§6, item L1).

## 5. Decisions needed from the owner before I start

| ID | Question | My recommendation |
|---|---|---|
| Q-007 | Which mesh language do characters, animals and fish use? | **Styl faceted organic**, the same family as the trees: faceted low-poly, flat face normals, palette colours, no skinning. Animated by moving rigid parts (legs, arms, tail, wings) in code. Keeps one visual world and costs no asset pipeline. |
| Q-008 | Is the player character a **founder avatar** (one person you control)? | Yes. One avatar now; villagers later. |
| Q-009 | Should gathering require walking to the resource? | Yes, within ~3 m of the avatar. Keeps the world physical. |
| Q-010 | Are animals and fish **ambient** (visual life, not saved) for the 27th, or **huntable/fishable resources** (saved, part of the economy)? | **Ambient for the 27th**, deterministic per seed, not journaled. Hunting and fishing as journaled commands after the deadline. |
| Q-011 | Does animated, partly transparent water fit the art bible (water "flat, darkest value, hard shore")? | Yes if it stays faceted and flat-shaded with the hard voxel shore kept; transparency only in the shallow band. |
| Q-012 | New key map (below) OK? | See §7. |

## 6. Work plan (dependency-ordered TODOs)

Status key: ☐ todo. Estimates are engineering days for me.

### Phase A — Foundations (Tue 24, ~0.5 day). Blocks everything that moves.
- ☐ **A1** Fix the chunk eviction leak (V5): track every generated chunk, evict outside radius + 2.
- ☐ **A2** Loaded-only terrain queries for moving things (V6): `heightAtLoaded()` returns null instead of
  generating, so creatures turn back at the edge of the loaded ring.
- ☐ **A3** Fixed-step presentation update loop (`app/living.ts`): 30 Hz fixed step, interpolated render,
  registered systems (avatar, camera, fauna, water). Paused-time aware.
- ☐ **A4** Extract the shared mesh helper `render/mesh-kit.ts` (N4) with a faceted-part builder for creatures.
- ☐ **A5** Smooth ground height sampling (bilinear between integer `surfaceAt` tops, step-aware) for feet.

### Phase B — Character, controls, camera (Tue 24–Wed 25, ~1.5 days)
- ☐ **B1** Founder avatar mesh: Styl faceted, 1.7 m, ~300–400 triangles, separate rigid parts
  (torso, head, arms, legs), palette colours. Walk/run/idle/jump cycles by part rotation.
- ☐ **B2** Character controller: camera-relative WASD, acceleration, run, jump with gravity,
  step-up ≤ 1 m, blocked by steep faces and structures, wading in water ≤ 0.4 m (fix V8),
  swimming deferred (stops at deep water).
- ☐ **B3** Follow camera replacing `OrbitRig` in Explore mode: orbit around the avatar with right or
  left drag, smooth damping, distance 3–60 m, **terrain collision** (ray-march the height field along
  the arm), pitch 5–75°. Builder mode keeps the overview rig.
- ☐ **B4** Streaming, shadows and harvest radius follow the avatar instead of the camera target (C6).
- ☐ **B5** Interaction: E on the nearest harvestable within 3 m (highlight + prompt), uses the
  existing journaled `harvest` command so saves still work. Avatar position saved locally
  (presentation state, separate key; not part of the journal hash).
- ☐ **B6** Input map rework and on-screen help (§7). Touch: left-thumb joystick, right-side drag look,
  buttons for jump/interact.
- ☐ **B7** UI: Explore view hides the Settlement and Build panels behind toggles; fix HUD overlap (C7).

### Phase C — Water (Wed 25–Thu 26, ~1 day)
- ☐ **C1** `sim/hydrology.ts` (pure, seeded): per-column flow vector for water cells. River = tangent of
  the *warped* centreline pointing downstream (V4), lake = slow circulation, sea = swell direction.
- ☐ **C2** Per-chunk water surface meshes built from real water columns (so dug pits and edits stay
  correct), carrying depth and flow attributes. Far sea stays one cheap plane.
- ☐ **C3** Water shader: time uniform; faceted moving ripples along the flow vector; depth tint from the
  palette water ramp; foam band at the shore; transparent only where shallow.
- ☐ **C4** Draw the macro seabed (V3) so transparent shallows never show holes.
- ☐ **C5** Fish: instanced faceted fish (~40 triangles), small schools with simple flocking, confined to
  water columns deeper than 0.6 m, scatter from the avatar, fade beyond 60 m.

### Phase D — Animals (Thu 26, ~1 day)
- ☐ **D1** Spawning: deterministic per chunk from the seed and biome (deer in forest edges, rabbits in
  meadows, birds near trees), only in loaded chunks, capped (~30 land animals, ~20 birds on screen).
- ☐ **D2** Behaviour state machine: idle / graze / wander (short A* hops over `walkStep`) / flee from the
  avatar / sleep at night. Birds perch on trees and take off when approached.
- ☐ **D3** Meshes: Styl faceted deer (~250 tris), rabbit (~120), bird (~60), instanced per species, rigid
  part animation (legs, head, wings).
- ☐ **D4** Inspector support: hover/click an animal shows its name and state.

### Phase E — Freeze and ship (Fri 27, ~0.5 day)
- ☐ **E1** Performance pass against the budget (draw calls, triangles, frame-time spikes while walking).
- ☐ **E2** Tests: hydrology determinism, controller step/collision rules, spawn determinism, sim layer still
  free of `three`. Existing 126 tests stay green; journal hashes must not change.
- ☐ **E3** Browser evidence on the live URL (desktop + emulated mobile), then deploy with `deploy/boxd/deploy.sh`.
- ☐ **E4** Update `Progress_Report.md`, `Task_Backlog.md`, `Game_Design_Document.md` (currently stale).

### Later (after the 27th)
- **L1** Terrain generator v2: rivers descending from the highlands with real gradients, rapids and
  waterfalls. Requires a `GENERATOR_VERSION` bump and save handling for existing worlds.
- **L2** Villagers as simulation agents with jobs (gather, haul, farm), A* paths, needs, housing;
  journaled ticks.
- **L3** Hunting, fishing, animal husbandry as journaled economy commands; population ecology and regrowth.
- **L4** Real-time crop growth, weather (rain on water, wind on trees), ambient audio.
- **L5** Move chunk generation and meshing to Web Workers (V7).
- **L6** Noxel art debt (N5) once owner reference images and art review happen.

## 7. Proposed key map

| Action | Explore view | Builder view |
|---|---|---|
| Move | WASD / arrows | WASD pans the overview (as today) |
| Run / jump | Shift / Space | — |
| Look / orbit | Mouse drag (any button), touch drag right side | Drag orbits (as today) |
| Zoom | Wheel / pinch (3–60 m) | Wheel / pinch (12–1400 m) |
| Interact / gather | E | Click |
| Switch view | Tab | Tab |
| Settlement / Build panels | B / I | always shown |
| Pause time | P | P |
| Time of day presets, speed | moved to a Time menu (keys 1–4 freed for a future hotbar) | same |

## 8. Risks

1. **Four days is tight** for Phases A–E. If time runs short, the cut order is D3 detail → D2 sleep/night
   → C5 flocking polish → B6 touch joystick. The avatar, follow camera and flowing water are the core.
2. Ground-level walking streams chunks more often; the 40–83 ms meshing spikes (V7) may show as stutter.
   Mitigation: build budget per frame and a slightly larger preload ring; Workers are L5.
3. Transparency changes how the whole scene sorts and could cost frame time on integrated GPUs.
   Mitigation: transparent only in the shallow band; opaque elsewhere.
4. Art direction: creatures are a new visual subject with no approved guide (N2). I'll keep them in the
   existing Styl rules so they can be restyled without engine changes.
5. Saves: none of this changes the command journal or state hash. Avatar position is saved separately.
