# Production stone-form removal verification — in progress

Date: 2026-11-22. Public preview tested: `http://18.116.53.201/` (seed 1337).

## Scope

Only **Stone Boulder**, **Small stone deposit**, and **Large stone outcrop**
(`styl_rock_small`, `styl_rock_medium`, `styl_rock_large`) are retired, including
`hero:styl_rock_medium:-6:-10`. No replacement objects were added. Stone cairns,
Purple-seam ore deposits, terrain stone, landmarks, structures, resources, crops,
jobs, and unrelated natural generation remain outside this removal.

## Verified implementation and automated checks

The authoritative generation, collision/obstruction, harvesting, inspection,
rendering, serialization, and historical-restore boundaries suppress the three
retired forms. Procedural random-number consumption and sequence allocation are
preserved. Authenticated historical replay retains old obstructions until restore
migration; persisted natural retired entities then receive tombstones, while the
authored retired hero does not.

- `npm --prefix /home/ubuntu/as/Game run typecheck`: passed.
- `npm --prefix /home/ubuntu/as/Game test`: **126 passed, 0 failed** (37,815.848531 ms), rerun after the map-rendering fix.
- `npm --prefix /home/ubuntu/as/Game run build`: passed (36 modules, 1.89 s). Bundle
  `index-BSSOh2N7.js` includes the empty-map-nature warning fix.
- The public HTML and its referenced assets returned HTTP 200 on 2026-11-22 and
  2026-11-23. The replacement service serves current `Game/dist` files at the
  unchanged public URL.

## Production browser runs

The corrected functional-only run is executing with screenshots explicitly disabled;
disabled captures are not used for assertions about visible geometry. Earlier failed
runs and their harness corrections are retained in `INCOMPLETE_RUNS.md`. **No complete
functional pass is claimed yet.**

Completed runs have verified pointer selection, keyboard gathering, stockpile deposit,
three accepted and saved founder builds, keyboard inspection of all three structures,
and persistence reload with matching canonical state, carried inventory,
stockpile/life state, structures, accepted commands, and exact saved bytes. An actual
restored project-camera revisit measured **144 entities / 99 generated chunks**, not
the earlier unsupported 144/101 assumption. Those runs subsequently failed harness
movement assumptions, not a demonstrated production-state defect. The current run
uses geometrically justified boundary movement instead.

Live entity totals depend on camera/materialization history. Terrain generated at
successive camera targets remains in the live entity set after chunk eviction, whereas
a fresh reload initially materializes only its startup view. Canonical snapshots store
authored records and changed-chunk deltas rather than every unchanged deterministic
procedural entity. Equal canonical hashes and exact saved bytes, not equal live totals
from different camera histories, establish persistence.

Headless materialization approximations are retained as diagnostics but are not
production-browser evidence. A deterministic current-schema fixture check independently
confirmed 12 → 10 authored-founder-region entities after the three builds, with
`{ stone: 9, wood: 20, ore: 8 }`; see `current-farm-clearing.json`. Movement, streaming,
map, and mobile browser checks are still pending in the current run.

The separate read-only visual capture run inspected and captured the initial
world, cairn, ore, Waystone, an unbuilt house preview, and emulated-touch world
and cairn views. No retired pale-rock form appears in those inspected views; the
retained objects, block terrain, faceted nature, and actual UI remain visible.
That run later timed out on the mobile Build capture. The house panel is not
constructed-house evidence. All failures are described in `INCOMPLETE_RUNS.md`;
the focused capture harness is retained as `capture-production.mjs`.
The focused founder attempt subsequently accepted and saved the house, path, and
field with three commands and the expected inventory, but its bounded full-page
CDP screenshot timed out. `focused-founder-capture-results.json` is explicitly
`failed`, with a `captureFailure`, and no founder-settlement image was produced.
The isolated `capture-built-founder.mjs` attempt at 2026-11-22T22:45:05Z succeeded.
It used the actual Build controls to accept and save the founder house, door path,
and terraced field, then produced
`production-built-founder-settlement-2026-11-22T22-45-05.079Z.png`. The inspected
production screenshot visibly shows both house modules, the path, and multiple
terraced fields on voxel terrain, alongside the construction UI. Its matching JSON
records `status: captured`, three structures, three commands, persistent local save,
`{ stone: 9, wood: 20, ore: 8 }`, and no console/page or failed-response errors.
This single founder-view capture confirms visible structure geometry in software
WebGL; it is not reload-after-construction visual proof, hardware-GPU performance
evidence, or owner art approval.

A later isolated build/reload capture provides the missing restored-geometry
evidence. `restored-founder-capture-2026-11-22T23-33-58.342Z.json` records the
automatic settlement camera target, three accepted and saved Build commands, a
genuine reload, identical canonical hash `5b05e32aed0a9a05`, structure names,
resources and life/crop/job state, and exact localStorage bytes. Its two timestamped
PNGs were opened and inspected: the founder house, door path, and terraced field are
visible both before and after reload. The live totals are 135 entities / 90 generated
chunks before reload and 88 / 81 afterward; these camera-dependent totals do not
override the matching canonical state and persisted bytes. No browser errors or
failed responses were recorded.

The latest functional run completed real held-key movement of 46.47 m and increased
generated chunks from **81 to 93** (93 cached), with unchanged canonical state and
exact saved bytes. Its distant view passed **83 generated / 83 cached / 49 loaded**,
with bounded geometry, zero retired target/serialized records, unchanged
state/resources/life/commands and exact snapshot/journal preservation.

The same run failed in map mode: initialization called `Group.add(...[])` for a
legitimately empty hidden nature group, producing a Three.js warning. The harness
also incorrectly required loaded near chunks, which map mode intentionally does not
use. A targeted production fix omits that empty add; the corrected harness verifies
positive renderer calls/macro triangles, zero hidden nature instances and near chunks,
and unchanged state/save bytes. Typecheck, 126 tests, and production build passed.
A sequential map diagnostic and rerun remain pending; touch verification has not
yet been reached. The failed run and minified-stack diagnostic are retained.

The subsequent functional browser and preview were killed at session teardown. Its
record ends at successful Waystone pointer inspection, before gathering, construction
or streaming, with an aborted navigation. That interrupted run is not a pass. A new
service now serves the same production bundle at the unchanged URL, locally and
publicly verified HTTP 200, and a fresh sequential functional run is executing.


## Evidence integrity and limitations

Failed and interrupted attempts and their limitations are retained in
`INCOMPLETE_RUNS.md` and timestamped failure artifacts. Successful assertions and
screenshots will be recorded separately once the bounded runs actually finish.

Browser evidence uses software WebGL, not hardware-GPU performance testing.
The 390 × 844 touch run is emulated, not physical-device usability approval.
No owner art approval or independent M002 milestone closure is asserted.
