# M007 Animals Evidence (2026-11-24)

## Screenshots
- `ANI-lineup-A` to `ANI-lineup-E`: species lineup (`?animals=1`).
- `ANI-close-1-farm-small`, `-2-farm-mid`, `-3-wild-big`, `-4-young`: close-ups by size class and age.
- `ANI-farm-A-overview`, `ANI-farm-1-pens`, `-2-paddock`, `-3-coop-sty`, `ANI-farm-B-pens-t1`, `-t2`: homestead in context, two time steps for the pens.

Captured in software GL at about 1.4 fps. The paddock and shelter shots predate the shelter fix (a lower lean-to with back wall, side walls, two front posts and a stepped roof replaced the large flat roof). The shelter was not re-photographed.

## Performance
About 96 draw calls and about 241k triangles in the homestead scene. Targets: at most 120 draw calls and 250k triangles. The shelter change swaps a few boxes for a few boxes and does not change the draw call count (facility statics are one merged mesh each).

## Tests
`npx tsc --noEmit`, `npm test` (190 of 190 pass) and `npm run build` all succeed.

## Predator behaviour (fox and wolf)
Covered by `tests/m007.predators.test.ts` and `tests/m004.fauna.test.ts`. Foxes and wolves are predators in `src/sim/fauna.ts`, and the render side shows their state through `iState`.

## Animal rig design
- One instanced draw call per species.
- Each model is built from boxes with a per-vertex `aRig` attribute that identifies the part (body, head, legs, tail, ears and so on).
- Each instance carries `iAnim` (animation phase and speed) and `iState` (idle, walk, graze, predator and similar), so animation runs in the vertex shader with no per-frame CPU skinning.
- Files: `src/render/animal-kit.ts` (box builders and rig attributes), `animal-models.ts` (per-species definitions), `animal-showcase.ts` (the `?animals=1` lineup), `fauna.ts` (wild instancing), and the `Herd` class in `homestead.ts`.
