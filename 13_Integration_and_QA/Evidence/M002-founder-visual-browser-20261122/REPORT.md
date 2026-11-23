# M002 founder production-browser verification — 2026-11-22

## Disposition

**Production implementation evidence complete: nine browser checks passed with no page errors.**

This verifies the bounded founder candidate in the production preview. It is **not owner art acceptance, independent M002 review, or formal milestone closure**. The founder house remains provisional and exceeds the provisional 4–9 asset-volume target.

## Verified production artifact

Served by the Vite **production preview** at `127.0.0.1:4173`, not the development server on port 5174.

- `Game/dist/assets/index-D0Cff74d.js` — 681.51 kB minified, Vite gzip estimate 183.42 kB.
- `Game/dist/assets/index-CP3IsjGm.css` — 10.53 kB minified, Vite gzip estimate 2.86 kB.
- `Game/dist/index.html` — references the JavaScript artifact above.
- `production-artifacts.sha256` — SHA-256 identifiers for those three files.
- `verification-gates.log` — preserved typecheck, 84-test, production-build and whitespace-check output.
- `browser-output.log` — successful final nine-check harness output, including its exit-0 status.
- The final harness explicitly checks the loaded script reference and the actual position/direction of every requested inspection camera.

The test-only camera-direction strengthening was rerun through typecheck, tests and the production build. The resulting production bundle is byte-identical to `index-D0Cff74d.js`.

## Automated gates

| Gate | Result |
| --- | --- |
| `npm --prefix Game run typecheck` | Strict TypeScript passed; exit 0 |
| `npm --prefix Game test` | **84 passed, 0 failed**; exit 0 |
| `npm --prefix Game run build` | Production build passed; exit 0 |
| `git diff --check` | Passed; no whitespace errors |
| `node .../browser-verification.mjs` | **Nine browser checks passed, zero page errors**; exit 0 |

The test suite includes synchronous inspection-camera position **and look-direction** regression coverage (`Game/tests/m002.camera.test.ts`), authoritative founder geometry/openings, crop-envelope bounds, canonical hashes, authorized terrain changes, deterministic fixture/live-world replay, snapshot-tail replay and browser persistence.

Vite reports the existing advisory that the JavaScript chunk exceeds 500 kB minified. This is a build advisory, not a failure.

## Browser checks

Headless Chromium, software WebGL, desktop viewport 1440 × 1000 and mobile-emulated viewport 390 × 844:

1. A fresh world selects schema-2 persistence. Production has no mutable `window.__world`/`window.__scene`; debug flags remain inert and an attempted `f` excavation does not change state.
2. Harvest acceptance persists and reloads exactly once, with expected inventory and no duplicate starter grant.
3. Normal UI interaction constructs house/path/farm through accepted schema-2 commands. The persisted canonical state contains **19 house modules, 9 path modules and 14 terrace modules**, with inventory `{ ore: 8, stone: 9, wood: 24 }` and four accepted commands including the harvest.
4. Browser reload reconstructs all three structures and the exact state hash `d1e79035f68ee923`.
5. Replacing the snapshot with the harvested boundary while retaining the complete journal replays the construction tail to the same hash and accepted-command sequence. `GameSession` remains DOM-free; the harness only transports saved records.
6. The wide daylight view restores the exact saved state, voxel geology, stepped path, house, faceted vegetation and terraces with renderer shadows enabled.
7. The close south/east facade view shows the actual doorway, two full-thickness window voids, foundation, roof and adjacent stepped path/terraces. The camera is asserted, not inferred from screenshot readiness.
8. The close farm view shows faceted crop clusters on stepped terrace beds and retaining/edge elements within the saved authoritative world.
9. The mobile world restores the same exact hash; the build/project-inspection panel fits the emulated viewport and reports all three completed projects.

Observed hashes in this founder run:

| State | Canonical reproducibility hash |
| --- | --- |
| Genesis | `b8dc647bea044a84` |
| One harvest | `cf3c5281650f6ac6` |
| Harvest + house/path/farm, restored and tail-replayed | `d1e79035f68ee923` |

These deterministic hashes are reproducibility checks, not cryptographic signatures or security boundaries.

## Visual inspection

The final PNGs were opened and inspected, not merely generated:

- `wide-daylight.png`: settlement sits on deliberate stepped ground; the house and infrastructure remain distinguishable from voxel earthwork and separate organic vegetation.
- `close-house-openings.png`: doorway and both south windows are genuinely open voids, not decorative window blocks. Stone modules, floor/roof hierarchy, path edge and retaining elements are visible.
- `close-farm-crops.png`: faceted green crop clusters sit on stepped soil bands; crop foliage is derived presentation only, not a crop lifecycle/yield claim.
- `desktop-built-ui.png`, `desktop-restored-ui.png`: all three projects shown as built, construction costs/gains visible, inventory and persistence status visible after reload.
- `mobile-built-ui.png`, `mobile-house-inspection.png`: emulated mobile rendering and interactive project details remain within the viewport.
- `desktop-genesis.png`: fresh production world and normal UI.

This evidence does not assess every art reference, lighting condition or gameplay-distance composition. No visual approval is implied.

## Camera diagnosis and preserved failures

An earlier nine-check run passed functional assertions but used stale camera state; its close capture was not valid facade evidence. `OrbitRig.setView` now updates the position matrix before deriving the look-at quaternion and then updates the camera world matrix. Unit coverage checks actual position, direction and subsequent zoom.

The first corrected-bundle rerun also correctly failed its new camera-position assertion on the close view: scripted `action=all` calls `buildAll()`, whose slice-focus operation overwrites the requested pose after construction. The final harness does not weaken that assertion or change game code to accommodate the harness. It restores the already-verified saved world for close inspection, then checks the requested pose.

Both attempts and their screenshots/results are preserved under `attempt-archive/`:

- `stale-camera/`: earlier passing functional results and stale-camera visual captures, explicitly superseded.
- `scripted-focus/`: first corrected-bundle camera failure and its retained artifacts.
- `attempt-archive/NOTES.md`: detailed dispositions.
- `run-attempts.log`: append-only run history, including warnings; no failed run is concealed.
- `results-failure.json`: retained corrected-bundle scripted-focus failure even after the subsequent successful run.

Older browser evidence directories elsewhere in `13_Integration_and_QA/Evidence/` were not overwritten.

## Warnings and limitations

- `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`
- `THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.` This records Three.js's requested fallback; it does not prove the shadow-map configuration was modernized beyond the recorded warning.
- Software-WebGL `GPU stall due to ReadPixels` warnings occurred. These are not a physical-GPU performance measurement.
- Desktop rendering used headless Chromium and software WebGL. Mobile dimensions/touch emulation are not physical-device validation. No mobile-performance or frame-rate acceptance is claimed.
- Browser persistence means local Web Storage accepted and restored the record; it is not server storage, authentication, crash-atomic durable database storage, multiplayer authority, Solana or MagicBlock enforcement.
- Local authority remains `local-stub / local-simulation-only`.
- Crop lifecycle, processing/storage and the integrated gather→store→make→cultivate loop are not verified here.
- The harness uses the locally installed Playwright package through its recorded absolute lookup path; it is local evidence tooling, not portable packaged browser infrastructure.
- The preview server remains a local service. No deployment, public publishing, chain integration, spending, formal closure or independent review is claimed by this report.
