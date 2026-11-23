# Incomplete verification runs

2026-11-22: two superseded `verify-production.mjs` runs were stopped while
waiting in Playwright locator/screenshot operations, before either wrote a
complete pass or a caught assertion failure. They are **not passing browser
verification**. Their screenshots were written while executing and may be
overwritten by a later final run. Original failed run evidence remains in
`results-failure.json`, `console-failure.log`, and `failure-0.png`.

The harness was subsequently corrected to use supported structure inspection,
persisted preparation-yield assertions, a supported camera view rather than
unavailable UI selectors, and step-by-step logging. New caught failures use
unique timestamped filenames. No source or public-production failure is inferred
from an incomplete harness run alone.

An additional syntax-check-then-run task was stopped after the DOM-visible
screenshot also remained blocked in the software renderer. It produced no
assertion result. The current harness places capture behind an explicit timeout
and records missing captures separately from gameplay checks. Earlier screenshots
are not proof that a subsequent capture of the same filename succeeded.

2026-11-22T21:22:20.968Z: the bounded-capture run completed keyboard gathering,
stockpile deposit, all three accepted founder builds, and keyboard inspection of
those structures. It then failed because `.drawer-world` is intentionally hidden
in the desktop layout. This was a harness failure, not a production failure. Its
unique JSON/log artifacts are retained. Capture warnings also record that its
new body-locator screenshots timed out waiting for element stability. The run is
not a pass. The harness now checks the visible desktop gather control and only
uses drawer tabs in the mobile layout.

Subsequent functional verification is run with `ASTRIX_CAPTURES=0` and writes
`results-functional-only.json` and `console-functional-only.log`. Missing visual
evidence is explicit; a functional pass in that mode is not a visual pass.

The first functional-only run reached the same three built-structure inspections,
then failed because the desktop-only check incorrectly expected the mobile/coarse-
pointer Gather button to be visible. The check now verifies the visible desktop
Build and Settlement panels. This does not establish a production UI defect.

The next functional-only run reached the persisted-snapshot checks and failed
because it incorrectly required an ore entity after legitimate farm preparation.
That preparation returns 8 ore and 12 wood and consumes the authored ore entity.
The harness now checks the cairn and recovered resources after construction;
its separate pre-build ore inspection remains intact.

Direct CDP screenshot capture succeeded at the close-up Waystone view. Focused
visual capture then incorrectly used a nonexistent `#build-detail` ID instead of
`.build-detail`. Its four completed retained-object captures remain separate
artifacts. The focused capture run does not verify a constructed settlement.

**Result-history note:** the focused harness rewrites the single
`visual-capture-results.json` file on each attempt. Its recorded failed selector
attempt is described above; images produced before that failure are retained but
were subsequently overwritten by later captures of the same names. The harness is
preserved as `capture-production.mjs`. 2026-11-22T21:55:29.242Z: the corrected functional-only run passed full state-hash
and progression restoration, then failed a second harness count assumption:
103 live entities versus 10 serialized entity records. `createWorldSnapshot`
stores authored entities and entities in changed chunks, not every unchanged
procedural entity; restore deterministically regenerates the latter. The fixture's
10 saved records are therefore not the expected live total. The harness now
compares restored live entities with the exact pre-reload total, retains the
full canonical state-hash assertion, and separately records serialized delta
kinds. The failed result remains in `results-failure-2026-11-22T21-55-29.242Z.json`
and its matching console log. No production-state loss was demonstrated by this
incorrect assertion.


2026-11-22T21:45 run (`buj1z7j84`): functional-only verification reached accepted,
persisted founder house, door path, and terraced field construction, then inspected
each built structure through the actual keyboard catalog. It subsequently ended in
the 103-restored-versus-105-genesis assertion failure recorded below. It is not an
in-progress run or a complete pass.

A separate focused founder-settlement capture attempt uses actual Build controls
in a separate browser context. It aims to capture a full page after construction,
rather than treating the read-only house project panel as a built house. Its final
status is in `focused-founder-capture-results.json`; an in-progress or failed run
does not establish visual verification.

2026-11-22T21:50:33.782Z: the functional-only run passed exact state-hash,
carried/stockpiled-resource, life-state, structure, and command-count reload
assertions, but failed its fixed entity-count check: 103 restored versus 105 at
genesis. Farm preparation legitimately clears two objects: authored ore (8 ore)
and blossom (12 wood). The full state hash already matched. The harness now uses
the real persisted snapshot's exact entity count and records its kind counts;
it does not expect pre-clearing genesis totals. A corrected run is in progress.

The bounded focused visual run (`bvj8sje6l`) captured the desktop initial world,
cairn, ore, Waystone, and unbuilt house preview, plus emulated-touch initial world
and cairn inspection. It then timed out at 360 seconds during the mobile Build
capture; the CDP target closed. `visual-capture-results.json` records a failure.
Its completed images remain useful only for the named views actually inspected.
It is not a complete mobile-layout visual pass.

The first focused actual-built-settlement capture (`bvtuu3ucc`) successfully built
and saved all three structures, then failed trying to click the hidden
`#inspect-close` button. This was unnecessary browser automation: no inspector
had been opened. The harness result records failure; no settlement screenshot
was produced. The next attempt omitted that hidden-control click and was bounded.

The next focused attempt (`behxswyf7`) accepted and saved the house, path and farm
with three commands, correct recovered inventory, and no console or response errors.
Its full-page CDP screenshot then exceeded the 20-second bound. The process exited
normally but `focused-founder-capture-results.json` correctly records **failed**,
because `captureFailure` is nonempty and no founder-settlement image exists. It
establishes construction and saving, not founder-structure visual verification.
A subsequent actual-built-settlement attempt, `capture-built-founder.mjs`, uses
one bounded viewport CDP capture after the three real Build buttons. It records a
unique result JSON filename per attempt, so it cannot overwrite the earlier
failure evidence. Its outcome is recorded separately from the functional-only
run; 2026-11-22T21:57:35.684Z: that viewport attempt completed construction and
local saving with the expected `{ stone: 9, wood: 20, ore: 8 }`, then timed out
after its 30-second capture bound. Its result is
`focused-founder-capture-2026-11-22T21-56-09.431Z.json`, explicitly `failed`.
The process exit code 0 does not change that recorded capture failure. No PNG
was created; the software-compositor limitation remains, and earlier retained-
object images cannot substitute for a constructed-settlement view.

The public preview from the earlier session stopped at session teardown. The
replacement service was started after confirming privilege and port availability
and serves the same `Game/dist` files at the unchanged public URL. A stopped preview
is not evidence of a game-code regression.

2026-11-22T21:59:41.332Z: the functional-only run completed real keyboard harvest,
deposit, three accepted builds, three built-structure inspections, and persistence
reload. The restored save retained its full state hash, inventory, stockpile/life
state, three structures, and five accepted commands. It failed a further count
assumption: the camera-history-dependent live total was 103 after reload versus
144 in the pre-reload session. The failure and its console log remain in the
matching timestamped JSON/log files.

Source investigation found that terrain streaming generates entities around the
current camera focus; evicting distant terrain retains already-generated entities.
Canonical snapshots serialize authored records and entity deltas, not every
unchanged procedural entity. `diagnose-entity-materialization.mjs` and
`entity-materialization-diagnostic.json` demonstrate that equal camera-region
histories after save/restore reproduce the exact sorted entity IDs. Its headless
approximation yielded 133, not the browser's 144: it did not establish the exact
browser camera history and is not production-browser evidence. Consequently the
mechanism is supported, but exact numerical attribution to those missing 41 was
not established by that diagnostic.

The proposed pointer/ore-inspection shortcut was not adopted: after accepted farm
preparation the ore no longer exposes a current pointer target, and a fresh
Waystone-only camera produces a different materialization history from the full
construction sequence. These failed harness hypotheses are not game failures.

The duplicate-camera-URL defect was also identified: `GAME + '&tx=...'` leaves
both the original and replacement `tx`, `tz`, `ty` and `dist` parameters. URLSearchParams
`get()` returns the first value, so the supposed close-up pointer view actually
remained at the original founder target. The completed `camera-history` diagnostic
confirms that camera equality. The corrected diagnostic uses a fresh URL. The
verification harness now also derives and asserts the orbit target from the
read-only camera matrix so equivalent-count evidence cannot hide a wrong camera.

2026-11-22T22:50:12Z: functional run `bjdffnck8` reached desktop original-view
reload, then failed in harness code with `ReferenceError: Cannot access
'beforeReload' before initialization` at `verify-production.mjs:253`. Its failed
JSON and console log are preserved. No complete functional pass is inferred.

The corrected headless terrain diagnostic `diagnose-terrain-materialization.mjs`
was rerun successfully. Its valid timestamped JSON output measures:
- founder original or Waystone fresh view: 105 entities / 81 generated chunks;
- full original + house/path/farm/final-focus history: 144 entities / 107 chunks;
- fresh restored original or Waystone view: 103 entities / 81 chunks, with exact
  sorted entity IDs matching;
- restored original + house/path/farm/final-focus: 144 entities / 107 chunks;
- restored original + only final-focus: 133 entities / 98 chunks.

The corrected browser harness reproduces the supported original + house/path/farm
project-camera sequence after reload and expects the measured 144 entities / 101
chunks there. The final settlement-focus shift is a separate pre-reload phase
measured at 144 / 107. It does not call a fresh founder/Waystone restore equivalent
to the full construction history.

Distant views start a new page-load generation counter, so old cumulative totals
cannot establish streaming there. The corrected checks instead require an 81-chunk
generated neighborhood, 81 cached and 49 visible chunks, unchanged canonical
state/resources, exact saved bytes, five accepted commands and zero retired
inspection or serialized records. Keyboard-boundary movement must increase its
within-page generation count. New distant views may retain different deterministic
natural entities; an unchanged live total is not a valid distant-view requirement.

`terrain-materialization-diagnostic.json` is an empty artifact caused by shell
redirection while an earlier diagnostic assertion failed. It is deliberately
preserved but is not valid JSON evidence. The successful runs use timestamped
`terrain-materialization-*.json` files. Running that empty JSON through Node also
caused an `Unexpected end of JSON input` error; that mistaken invocation is not a
product behavior or a diagnostic result.

The next functional run (`b8m0gz2h8`) failed at the intended pointer-camera
assertion before harvesting or construction. Its orbit-target calculation used a
negative camera-local Z offset and a fixed radius of 78. The camera looks along
negative local Z, so its target is on positive local Z; the close-up URL also uses
radius 28. The harness was corrected to derive the configured URL radius and
transform that positive-Z point through the existing read-only camera matrix. The
production URL itself was correctly distinct after removing duplicate parameters.
The failure result is retained; it is not evidence of a game camera or persistence
defect.

Separate bounded run `bpmmgn6lv` accepted and saved the actual house, path and
farm, with three structures, three accepted commands and the expected
`{ stone: 9, wood: 20, ore: 8 }`. Its pre-reload screenshot timed out at 30 seconds
while running concurrently with the functional software-WebGL browser. The task
correctly exited 1 and recorded `status: failed`; it never reached the reload or a
post-reload capture. Its JSON preserves exactly those completed gameplay facts.
Subsequent functional and capture runs are sequential to reduce SwiftShader
contention. The successful earlier pre-reload founder screenshot is not reload
visual proof. No product source was changed during these harness corrections.

A follow-up run (`bxmc9yb3v`) caught a further error in that calculation: it
applied the quaternion-free `camera.matrixWorld`, which leaves the camera in its
unrotated world translation frame. `OrbitRig.camera` is a child of the scene;
`getWorldDirection` applies its actual quaternion. The harness now follows that
world-space viewing direction at the configured radius and leaves all camera and
simulation properties unchanged. The failed artifact remains; no game defect is
inferred from these two erroneous camera calculations.

The corrected `bml17gsuz` run passed its distinct close-up camera target, pointer
inspection, keyboard gathering/deposit, three saved founder builds, three structure
inspections, and the original-view persistence reload. It then timed out after 60
seconds waiting for the restored project-camera metric union **144 entities / 101
chunks** at `verify-production.mjs:292`. That check has **not passed**. The failed
JSON records the completed assertions and timeout; no movement, distant-view, map or
touch result was reached. The headless 144/101 approximation must not be substituted
for this exact browser measurement. A separate bounded build/reload visual capture
started only after this browser exited. No production source was changed.

Isolated sequential run `b2nuq41ow` then completed with `status: captured` in
`restored-founder-capture-2026-11-22T23-00-17.728Z.json`. It accepted and saved all
three real founder builds, reloaded, and asserted identical canonical hash
`5b05e32aed0a9a05`, three structures, three accepted commands, identical resources,
life/crop/job state and structure names, and exactly unchanged localStorage bytes.
Its built/restored live totals were 144/99 and 103/81, respectively. Both named PNGs
were opened and visually inspected. They appear to remain at the original founder
camera and do not clearly show the constructed house, path, or terraces. They are
valid capture and persistence artifacts, but **not visual evidence of restored
founder-structure geometry**. The earlier 22:45 built-settlement image remains
pre-reload-only visual evidence.

The subsequent harness does not prescribe exact restored project-camera live totals.
It measures the actual browser union while retaining canonical hash, state/resource,
command and exact-save assertions. Headless numerical approximations are not treated
as browser evidence. Its result is separate and has not been inferred from any
in-progress process. The replacement visual harness starts at the settlement camera
and asserts the automatic post-build settlement target before its captures; capture
success does not imply that visible geometry was approved.

The old public-preview process `b305b4ulk` stopped at session teardown. After checking
that port 80 was free and `sudo -n` was available, replacement `bze8kgl2r` now serves
the same `Game/dist` build on 0.0.0.0:80. Localhost and the unchanged public URL both
returned HTTP 200 before the replacement browser runs began.

The actual replacement functional browser measured **144 entities / 99 chunks** after
restored project-camera revisits, not the earlier unsupported 101 assumption. Its
canonical hash `97c8b8ff48087e72`, resource/life state, three structures, five commands
and exact saved bytes all matched. Run `bd9cu0sx8` then failed `actual keyboard input
must move across a chunk boundary`; its timestamped failure JSON and log are retained.
No distant, map or touch checks were reached. The camera controller clamps low-frame-rate
deltas to 0.1 seconds, so the next harness holds the real movement key until its observed
camera distance exceeds 16 m or a bounded timeout expires, with guaranteed key release.
It does not mutate camera or simulation state to make the movement check pass.

Run `bf53hhf4v` then moved its camera by more than 16 m but failed the following
`keyboard movement across chunk boundaries must generate additional terrain`
assertion. A camera displacement of 16 m does not necessarily cross a 32 m boundary
from the farm target. The timestamped failed JSON/log are retained; no persistence
or camera regression is inferred from that incorrect geometric assumption. The next
movement test reloads the same saved state at its original founder camera without
commands, holds W until both a greater-than-20 m observed displacement (crossing its
known x=-32 boundary) and increased chunk generation occur, and checks unchanged hash
and exact persisted bytes. All later checks remain unverified until actually reached.

The next isolated capture (`brr78zpl3`) completed its three saved builds and measured
the intended settlement target, but failed a strict `deepEqual` camera assertion on
floating-point epsilon: x=-43.00000000000001 versus -43 (and equivalent y/z errors).
No screenshot was attempted. The JSON records failure. The camera check now uses a
0.0001 tolerance; the underlying measured coordinates remain recorded unchanged.

Corrected isolated capture `byucoa8ee` completed with `status: captured` in
`restored-founder-capture-2026-11-22T23-33-58.342Z.json`. It recorded the intended
automatic settlement target within floating-point epsilon, accepted and saved all
three real Build commands, genuinely reloaded, and asserted identical canonical hash
`5b05e32aed0a9a05`, three structures and their names, identical resources, crop/job
state, three accepted commands, and exact localStorage bytes. Built/restored live
totals were 135/90 and 88/81; these different camera/materialization histories do
not replace the canonical-state comparison. Both timestamped PNGs were opened and
visually inspected: the founder house, door path, and terraced field are visible
before and after reload. This is software-WebGL restored-structure geometry evidence,
not owner art approval or hardware-GPU performance evidence. No browser errors or
failed responses were recorded.

Run `bhn4e3ne4` passed real keyboard movement across the known original-view chunk
boundary, with increased chunk generation, unchanged canonical state and exact saved
bytes. At the subsequent distant `x=96,z=-64` camera it measured **83 generated chunks**
and failed the unsupported assumption that this distinct centered view must equal the
original camera's 81. The map and touch phases were not reached. The timestamped
failure JSON/log preserve the completed assertions. A centered 32 m voxel chunk can
straddle two mesh columns, requiring 8 mesh rows/columns and 10 cache rows/columns;
the corrected harness compares generated with cached totals and asserts the resulting
81 cached / 49 loaded geometry without imposing the original view's generated count.
Canonical hash, resources, commands, exact saved bytes and retired absence remain
unchanged assumptions in both the harness and the documentation need revisiting.

Run `b2cp9l43x` reached the same distant target. Generated=cache and canonical
state/resources/commands/saved-byte requirements passed, but **cached was also 83**,
not the assumed 81. This means the original and distant views have the same 83/49
geometry, not a proven two-boundary-chunk discrepancy. Both earlier claims of an
81/49 pass and the straddling explanation were unsupported harness assumptions, not
production failures. The failed timestamped JSON/log are retained. The next harness
checks the actual seven-chunk near ring (49) and bounded 9x9 mesh-neighborhood cache
(81–100), with exact generated=cache, canonical hash/resources/life/commands/save,
retired absence, and no duplicate serialized commands. It also records observed
keyboard generation before its assertions so these counts exist even on a later
failure. Neither distant view is claimed to have passed a nonexistent 81 expectation.
The map and touch checks remain unreached. No production source was changed.

Run `bb8vv023r` was killed with preview `bze8kgl2r` at session teardown. Its last
completed step was pointer inspection of the Waystone; the following initial-state
navigation was aborted at line 193 before harvesting, construction, streaming or
persistence. `results-failure-2026-11-22T23-45-33.786Z.json` preserves that failure
and its three completed retained-object inspections. It is not a functional pass or
evidence of a production regression. Port 80 was confirmed free and `sudo -n`
available; replacement `by9m0g03q` serves the same `Game/dist` at the unchanged
public URL and both localhost and public HTTP returned 200 before a sequential rerun.

Run `b41m3wygq` completed keyboard gathering, stockpile deposit, all three saved
founder builds and inspections, canonical persistence reload, project-camera
revisits, held-key streaming, and the corrected distant-view assertions. Its failure
JSON `results-failure-2026-11-23T00-55-41.964Z.json` records **81 → 93 generated
chunks / 93 cached** after a 46.47 m real W-key movement, with unchanged canonical
state and exact saved bytes. The distinct `x=96,z=-64` view passed its bounded
**83 generated / 83 cached / 49 loaded** checks, zero retired serialized/inspection
records, and exact save/journal preservation. This is not yet a complete pass: the
map phase recorded `THREE.Object3D.add: object not an instance of THREE.Object3D.
undefined`, then timed out waiting for `loadedChunks > 0`.

The separate read-only `diagnose-map.mjs` reproduced the warning and captured its
minified production stack in `map-diagnostic-2026-11-23T00-55-52.572Z.json`. It traced
the warning to `rebuildNature()`: map mode deliberately has no loaded near chunks,
but initialization still constructed a hidden, empty nature group and called
`Group.add(...[])`. The map's renderer and `__ready` flag did work; requiring loaded
near chunks was an incorrect harness expectation, because map mode intentionally
uses only the macro terrain mesh. No terrain generation or persistence defect is
inferred from that mismatch.

The production fix skips only that empty `Group.add` call. The harness now waits for
positive renderer calls and macro triangles, and explicitly asserts zero nature
instances and zero near chunks in map mode, plus unchanged canonical state/save bytes.
After this targeted fix, TypeScript passed, all 126 tests passed (37,815.848531 ms),
and production rebuilt with bundle `index-BSSOh2N7.js`; the public preview serves the
updated `Game/dist`. A separate map-only diagnostic precedes the sequential rerun.
The touch phase remains unverified. No stone-removal or simulation behavior changed.
