# M002 remediation verification — 2026-11-22

## Disposition

**READY FOR FORMAL CLOSURE REVIEW.**

This is an implementation and verification disposition, not formal M002 approval. Independent closure review remains required. M003 remains unauthorized.

## Verified remediation

- Versioned snapshots preserve authoritative voxel edits, entities, natural-entity deltas/tombstones, inventory, structures, revision and accepted-command boundary; caches and renderer state are derived again on restoration.
- Ordered, versioned accepted-command journals replay deterministically from genesis and a validated snapshot tail. Invalid input, stale revisions, reused IDs with changed work and rejected builds do not enter the journal.
- Construction failures roll back the whole project to its exact pre-build snapshot, including preparation terrain, resources and entities; a failed structure does not retain preparation.
- Obstruction lookup queries the bounded neighboring chunks whose entity footprints can intersect the requested rectangle. Tests cover both boundary axes, a disjoint neighbor and stale authorization invalidation.
- Production F/G and scripted excavation are disabled, including with debug query flags. Mutable world/scene exports require a development build and explicit debug opt-in.
- Browser harvest and build callers use canonical command envelopes. Generated and authored entity IDs round-trip through accepted commands and deterministic replay.
- CSS trailing whitespace and `git diff --check` pass.

## Automated gates

Run from `Game/`:

| Gate | Result |
| --- | --- |
| `npm test` | **74 passed, 0 failed**; Node exit 0 |
| `npm run typecheck` | Strict TypeScript passed; no output/errors |
| `npm run build` | Vite production build passed; existing chunk-size warning only |
| `git diff --check` | Passed; no whitespace errors |

Test coverage includes deterministic fixtures and the live 2048 m world, protected terrain outside authorized envelopes, canonical authoritative-state hashes, bounded planning, both adjacent-chunk obstruction axes, fault-injected whole-project rollback, snapshot round trips, cache regeneration/eviction, journal validation, genesis and snapshot-tail replay, rejected-command immutability, persistence transport faults and browser-generated entity command IDs.

Production outputs:

- `Game/dist/assets/index-7GCWIxlJ.js` — 676.21 kB minified; Vite gzip estimate 181.71 kB.
- `Game/dist/assets/index-CP3IsjGm.css` — 10.53 kB minified; Vite gzip estimate 2.86 kB.
- `Game/dist/index.html`.

## Complete production browser gate

`results.json` records **12 checks passed** and **zero page errors**, against the Vite production build in headless Chromium/software WebGL at `127.0.0.1:4173`, viewport tests at 1440 × 1000 and 390 × 844:

1. Production debug exports and F/G/debug-mutation requests cannot change state.
2. Browser harvesting accepts the command, updates authoritative inventory and atomically saves the record.
3. A one-harvest snapshot restores exactly once without a duplicate starter grant.
4. Clearing the record restores genesis; restoring the saved boundary restores the one-harvest state.
5. Desktop restoration recreates house/path/farm, four accepted commands and exact inventory `{ ore: 8, stone: 9, wood: 24 }`.
6. A clean mobile view restores the same authoritative world hash and all three structures.
7. The mobile interactive build panel fits the 390 × 844 viewport (x 52, y 60, width 330, height 312.84375).
8. Snapshot-tail replay matches live state exactly, including accepted-command sequence 4.
9. Invalid bytes `{broken` are preserved in the separate corrupt-save key and the original key is cleared after successful quarantine.
10. Quota fault injection retains usable accepted construction but explicitly marks the work volatile and not safely persisted.
11. Production `action=dig&debug=1&debugMutations=1` performs zero edits and zero accepted commands.
12. A fresh scripted build produces three structures, persists the record and records exactly ordered journal sequences `[0, 1, 2]`.

State hashes from this exact run:

| State | Canonical state hash |
| --- | --- |
| Genesis | `3ded386e17521851` |
| One harvest | `9c189604cd35c113` |
| Harvest + house/path/farm | `5508a2b3b180c49f` |
| Scripted house/path/farm without harvest | `5612602490e5e9b7` |

The restored desktop/mobile hash and the replay-tail hash are both `5508a2b3b180c49f`. These are reproducibility checks, not cryptographic integrity signatures.

Artifacts:

- `results.json` — complete assertions and browser metrics.
- `browser-verification.mjs` — preserved executable harness used for this run. It references the locally installed Playwright package path and starts its own Chromium browser; the preview server must already be running.
- `desktop-genesis.png` — fresh normal production view.
- `desktop-restored-all.png` — desktop restored structures, inventory and UI.
- `mobile-restored-all.png` — clean mobile restored world.
- `mobile-restored-ui.png` — interactive mobile restored world and build panel.
- `desktop-scripted-build.png` — three structures from accepted scripted commands.

The harness was executed before being copied into this directory; its implementation is unchanged from the successful `/tmp/astrix-m002-browser-verification.mjs` run.

## Implementation map

- `Game/src/app/session.ts` — sole DOM-free command/replay write boundary, canonical command validation, accepted journal and snapshot restoration.
- `Game/src/app/persistence.ts` — DOM-free browser transport adapter; one storage record atomically replaces snapshot and journal; corrupt-save and storage-failure reporting.
- `Game/src/app/projects.ts` — read-only inspection, unified project definitions and complete build rollback.
- `Game/src/app/m2.ts` — UI/rendering controller; only accepted commands write simulation, and persistence follows accepted work.
- `Game/src/sim/snapshot.ts` — versioned snapshot schema, strict validation, deterministic hashes and derived-state reconstruction.
- `Game/src/sim/world.ts` — durable entity deltas/tombstones, eviction-safe regeneration and voxel edit deltas.
- `Game/src/sim/terrain.ts` — bounded neighboring-chunk obstruction queries.
- `Game/src/sim/structures.ts` — shared exact project costs.
- `Game/src/main.ts` — browser load/restore, canonical dispatch, debug gating and metrics.
- `Game/src/render/structures.ts` — derived structure/ghost meshes only.
- `Game/src/ui/build.ts`, `Game/src/styles.css`, `Game/index.html` — construction UI and responsive layout.
- `Game/src/vite-env.d.ts` — Vite development-environment typing.
- `Game/tests/m002.remediation.test.ts`, `m002.journal.test.ts`, `m002.browser-persistence.test.ts`, `m002.play.test.ts` — remediation and browser-caller regressions.
- `Game/tests/.build/` — generated test bundles produced by the passing test runner.

Several neighboring authoritative simulation/UI/source files predate this remediation verification and are included implicitly by the integrated build and tests. The scope here was M002 remediation only.

## Limitations and preservation

- Authority is a **local simulation stub** (`local-stub / local-simulation-only`), not authentication, multiplayer enforcement, a database, blockchain or MagicBlock enforcement.
- Browser persistence is Web Storage. Successful browser persistence means Web Storage accepted the record; it is not durable disk or crash-atomic server storage.
- Corrupt saves are quarantined byte-for-byte when storage permits; unit tests also cover failed quarantine preserving original bytes and returning an explicitly volatile session.
- Browser verification used headless Chromium with software WebGL, not a physical mobile device or production GPU performance benchmark. The existing software-WebGL and Three.js warnings are not counted as failures; no page errors occurred.
- The canonical 64-bit-style hex hash is a deterministic reproducibility mechanism, not a cryptographic signature or a security boundary.
- This does not demonstrate arbitrary future-world saves, server replay, network concurrency or a mature general-purpose engine. It verifies the bounded M002 playable slice.
- M001 evidence has no tracked diff. Earlier failed/interim M002 browser evidence remains in distinct directories; no evidence run was overwritten.
- No commit, branch, reset/revert/clean/discard operation, M003 implementation, or explicit public deployment was performed. All implementation changes remain uncommitted on `main`. The ordinary production build rewrote `Game/dist` outputs.
