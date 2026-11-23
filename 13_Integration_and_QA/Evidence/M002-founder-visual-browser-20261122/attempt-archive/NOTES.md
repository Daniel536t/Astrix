# Superseded browser attempts

These artifacts are retained to distinguish earlier evidence from the final production-browser run. They are not valid final facade evidence.

## `stale-camera/`

`results.json` and the close/farm/mobile PNGs came from a nine-check run using an earlier production bundle. Camera inspection had stale matrix state. The harness was subsequently strengthened to assert the actual requested camera position. That earlier functional result must not be used as visual acceptance for the corrected production bundle.

`house-camera-candidate.png` was an uninspected candidate from that earlier bundle, not an accepted capture.

## `scripted-focus/`

The corrected `index-D0Cff74d.js` bundle passed schema-2 genesis/debug isolation, harvest restoration, normal UI construction, exact reload restoration, snapshot-tail replay, and the saved-world wide capture. Its close capture then failed because scripted `action=all` calls `M2Game.buildAll()`, which recentres the inspection camera over the entire slice. The saved `results-failure.json` records the resulting camera-position assertion.

This failure does not identify a simulation/hash mismatch. The final harness loads the same verified saved world for close inspection instead of constructing and recentring it. `run-attempts.log` in the parent directory is append-only and includes the failures. Earlier evidence directories are unchanged.

## `corrected-nine-check/`

Successful inspected corrected-bundle run before the final harness-only additions of an explicit bundle reference assertion and inspection-camera direction assertions. These nine PNGs were visually inspected and preserve the evidence set used to establish the final framing. The parent `results.json` and PNGs come from the later run with those assertions enabled.
