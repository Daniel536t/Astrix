# M015 — Mobile verification (final gate)

**Status: NOT complete.** The build, the device test kit and the emulated checks are ready. M015 is complete only after the owner runs [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) on their own phone or tablet and the report is reviewed. No result in this file comes from a real device. Every browser run below is Playwright Chromium with mobile emulation (`isMobile`, `hasTouch`, touch through CDP) and software GL (SwiftShader).

**Deployed vs merged:** committed locally on `deploy/boxd`. Not pushed, not deployed, not merged to `main`. The live site (https://astrix.nyc.boxd.sh) still runs the M014 release.

**Commits (on `deploy/boxd`, after `043345f`):**

- `f750e91` feat: the perf monitor, quality levels, Settings and the touch layout fixes.
- `47a80d5`, `14ce903`, `48375bf`, `fd2f81b` fix: positions of the perf pill and the MagicBlock fold text, found by the audit re-runs.
- The evidence commit (this report, rebuilt `Game/dist`, screenshots and results) follows `fd2f81b`.

The built bundle identifies itself in the perf report as `build fd2f81b`. The evidence runs used these builds:

| Run | Build |
|---|---|
| Phone layout (360, 390, 844 wide) | `fd2f81b` |
| Tablet and desktop layout | `48375bf` (it differs from `fd2f81b` only in the perf pill's z-index and the MagicBlock button text) |
| Control flows, 10-minute session | `48375bf` |
| Quality-level performance | pre-commit tree of `f750e91`; the same render code, with CSS and report-format changes only since |

**Tests:** `npx tsc --noEmit`, `npm test` (**335 pass**: 325 before, plus 10 in `tests/m015.mobile.test.ts`) and `npm run build` all succeed.

Birds were not started.

---

## 1. Layout: what was fixed

The audit probe (`m015-layout.probe.js`) visits each screen on each viewport. For every visible control it records overlaps, clipping by the viewport, tap targets under 40 px, text overflow, and panels over the joystick thumb area (the bottom 40 % of the left half) or over Jump. Results are in `m015-layout-{before,after}-<vp>.json`, and screenshots in `{before,after}-<vp>-<screen>.png`.

**Viewports:** `p360` 360×780, `p390` 390×844 (portrait phones), `l844` 844×390 (landscape phone), `t1280` 1280×800 and `t800` 800×1280 (Android tablet), `d1280` 1280×720 (desktop, no touch). The probe uses deviceScaleFactor 1; CSS layout does not depend on DPR.

**Screens:** `1-entry` (entry screen, chain on), `2-chain-explore` (walking with the MagicBlock panel), `3-explore`, `4-joystick` (thumb held), `5-toast` (Plant), `6/7-farm-top/bottom`, `8-build-walk`, `9-builder` and the `9a/9b/9c` Settlement / Build / World tabs, `10-build-builder`, `11-swim` (Dive shown), and after the fixes `12-settings` and `13-perf-open`.

**Totals.** Overlaps are counted outside the screens that are dialogs by design (entry, Farm, Settings, the expanded monitor). Small targets are counted on touch only.

| Viewport | Overlaps before → after | Tap targets < 40 px | Panel over joystick / Jump | Text overflow |
|---|---|---|---|---|
| 360×780 | 26 → 0 | 66 → 0 | 4 → 0 | 4 → 0 |
| 390×844 | 11 → 0 | 68 → 0 | 4 → 0 | 4 → 0 |
| 844×390 | 16 → 0 | 62 → 0 | 3 → 0 | 4 → 0 |
| 1280×800 tablet | 3 → 0 | 92 → 0 | 2 → 0 | 4 → 0 |
| 800×1280 tablet | 3 → 0 | 132 → 0 | 4 → 0 | 4 → 0 |
| 1280×720 desktop | 1 → 0 | (fine pointer, not required) | – | 4 → 0 |

**Fixes, with the screenshots that show them:**

1. **Build bar over the Settlement and milestone panels in the builder view (the known M014 desktop issue).** While a building is being placed, both panels step aside; they come back when the bar closes. Before: `before-d1280-10-build-builder.png`, `before-p390-10-build-builder.png`, `before-t800-10-build-builder.png`. After: `after-d1280-10-build-builder.png`, `after-p390-10-build-builder.png`, `after-t800-10-build-builder.png`.
2. **MagicBlock panel covered the Farm and Builder view buttons and the vitals (phones), and the banner, zoom, Gather and Jump buttons (landscape).** On touch it now starts folded to one **MagicBlock** button: top right while walking, bottom right in the builder view. The fold choice is remembered. Before: `before-p390-2-chain-explore.png`, `before-l844-2-chain-explore.png`, `before-t800-2-chain-explore.png`. After: the same names with `after-`.
3. **Farm panel covered the joystick, Jump and Use.** Portrait: it is now a sheet from the top that ends at 60 % of the height, and the banner and zoom buttons step aside while it is open. Landscape: it sits left of the right-hand thumb column. Before: `before-p390-6-farm-top.png`, `before-l844-6-farm-top.png`, `before-t1280-6-farm-top.png`. After: `after-…`.
4. **Tap targets.** On touch, Farm (44), Builder view (40), the Farm panel's buttons, selects, number fields and checkbox labels, the build bar buttons, the MagicBlock buttons, the entry screen buttons, the Settlement panel fields and the perf pill are all at least 40 px. Before, they were 23–36 px: for example the job select was 25 px, "Plan a new field" 23 px and × 29 px. See the `smallList` in the before JSON.
5. **Farm panel lost taps and select choices while it rebuilt.** It rebuilt from scratch on every settlement tick (2 s). A tap during a rebuild landed on a removed element, and the emulated taps timed out on "element was detached". A choice in an open select picker could also be lost. The panel now skips a rebuild when nothing changed. It waits while a finger is on it, for 1.2 s after scrolling, and while one of its selects or fields has focus. Your own changes still show at once.
6. **Builder view on phones.** The Settlement and Build drawers covered Farm and the Builder view button; they now start below that row. The zoom buttons step aside for the Build drawer. Before: `before-p390-9a-settlement-tab.png`, `before-p390-9b-build-tab.png`. After: `after-…`.
7. **Settlement panel:** the Deposit / Withdraw "Amount" field ran past the panel's right edge (`before-d1280-10-build-builder.png`, `before-p390-9a-settlement-tab.png`). It now fits.
8. **Build mode in walk mode:** the bar covered the Farm button (portrait) and the resources and mode button (landscape); they step aside while building. Before: `before-p390-8-build-walk.png`, `before-l844-8-build-walk.png`. After: `after-…`.
9. **Swimming on portrait phones:** the stamina and breath rows ran into the Builder view button (360 px). Health, stamina and breath now sit side by side in one row (`after-p390-11-swim.png`).
10. **360 px phones:** the resources box touched the Settlement / Build / World tabs (`before-p360-3-explore.png`); the Settlement panel ran under the zoom buttons.
11. **Tablets in the builder view:** the milestone panel now sits left of the zoom and Gather column.
12. **Toasts** move to where they don't cover an open Farm panel.
13. **Safe-area insets:** every edge-anchored control uses `env(safe-area-inset-*)`. Added for the MagicBlock panel, the Farm panel, the entry screen, Settings and the monitor. Emulation reports zero insets, so this is unverified until a device run.

**Dialogs by design** (still listed as overlaps in the JSON): the entry screen, the Farm sheet over the top row, the Settings sheet and the expanded monitor. Each has a close control. None of them covers the joystick or Jump on a portrait phone.

## 2. Emulated control flows

Probe: `m015-controls.probe.js`; results in `m015-controls-ctl-{p390,t1280}.json`; screenshots `ctl-<vp>-1…8-*.png`. Fresh world, `?chain=0&metrics=1`. The quality was auto, which picked low because of the SwiftShader GPU.

**Software GL ran at about 1 fps here.** The animation step is capped at 0.1 s, and CDP touch events are delivered once per frame. So every check waits for the game state instead of timing it.

| Flow | 390×844 portrait | 1280×800 tablet | Evidence |
|---|---|---|---|
| Joystick walk; lifting the thumb stops | pass (2.44 m, 3.1 m/s, drift after stop 0) | pass (3.38 m, 3.2 m/s, drift 0.01 m) | |
| Jump | pass (0.88 m) | pass (0.88 m) | |
| Double jump | **not verified**: see below | **not verified** | |
| Plant banner | pass | pass | |
| To banner (walked 4.9 / 5.2 m away) | pass, ends 1.2 m from the banner | pass, 1.2 m | |
| Home | pass, 1.2 m from the home banner | pass | `ctl-*-2-home.png` |
| Farm panel: give Cora a job (select) | pass (farmer → woodcutter) | pass | `ctl-*-3-farm-job.png` |
| Build: tap the ground, Turn 90°, Place & approve | pass (woodshed, door east, approved) | pass | `ctl-*-4-build-turned.png` |
| Use opens the pen gate | pass ("Open the pen gate", closed → open) | pass | `ctl-*-5-gate.png` |
| Use gathers from a tree | pass ("harvested 4 wood from tree spire") | pass | `ctl-*-6-gather.png` |
| Swim, hold Dive (head under), release (surfaces) | pass | pass | `ctl-*-7-diving.png`, `ctl-*-8-surfaced.png` |

**Double jump.** The second tap has to arrive while the founder is still rising. At about 1 fps, the jump peaks within 3 frames, and the tap only reached the page about 2 s later, when the founder was falling. The game then correctly buffered it as a ground jump. The pointer log from `m015-doublejump-input.debug.js` shows this: pointerdown 1.9–2.5 s after dispatch. The rule itself is covered by the m009 simulation tests. The device test checks it by hand.

The native select picker cannot be opened by touch in headless Chromium. The probe taps the select, then chooses the option with `selectOption`.

## 3. Emulated performance per quality level

Probe: `m015-perf.probe.js`; results in `m015-perf-{low,medium,high}.json`; screenshots `perf-<level>-<view>.png`.

- **Setup:** 390×844 at deviceScaleFactor **2**, `isMobile`, `hasTouch`, a fresh world, `freeze=1`. Each view loads unthrottled, then is measured with the CPU throttled 4× (CDP `Emulation.setCPUThrottlingRate`).
- **Measurements:** draw calls and triangles are `renderer.info` (main and shadow passes), taken as the maximum of 3 samples over 6 s.
- **Views:** walk (the spawn), farm (M014 camera, 40 m), forest (220, −110, 50 m) and farm zoomed out (600 m); each with multi-draw and with `?multidraw=0`.

**This is not a real device.** The fps here is software rendering on a shared CPU, about 1 fps at every level. Draw calls and triangles carry over to a phone; frame times do not.

| View | low: calls / triangles | medium: calls / triangles | high: calls / triangles |
|---|---|---|---|
| walk | 46 / 84,420 | 70 / 110,726 | 70 / 115,690 |
| walk, multidraw=0 | 46 / 88,144 | 77 / 116,210 | 77 / 120,898 |
| farm | 31 / 55,430 | 54 / 83,298 | 54 / 88,732 |
| farm, multidraw=0 | 32 / 55,870 | 61 / 84,278 | 60 / 84,388 |
| forest | 21 / 66,194 | 24 / 119,650 | 24 / 147,674 |
| forest, multidraw=0 | 27 / 88,152 | 36 / 149,788 | 36 / 168,688 |
| farm at 600 m | 46 / 79,924 | 49 / 86,644 | 47 / 82,444 |
| farm at 600 m, multidraw=0 | 53 / 80,084 | 56 / 86,804 | 56 / 86,804 |
| canvas (pixels drawn) | 390×844 (0.33 MP) | 585×1266 (0.74 MP) | 780×1688 (1.32 MP) |

- Every load at every level had the same state hash, `63e6ad32757d1854`. That is 24 loads.
- **Low against high** in the forest: −55 % triangles on multi-draw and −48 % on the fallback. The canvas is a quarter of the pixels. There is no shadow pass, which accounts for most of the drop in calls.
- **Medium against high** in the forest: −19 % / −11 % triangles and 56 % of the pixels. Calls are the same, because shadows are kept.
- **Ground cover** in the forest: 180 pieces (low), 309 (medium), 509 (high).
- **Full-detail trees** in the forest: 81 (low), 165 (medium), 244 (high; 165 on the fallback, whose near band was already 70 m in M014).
- These are fresh-world numbers. M014's 198,930 / 212,000 forest figures came from a world 1,057 ticks older, so the two are not directly comparable.
- The farm at 600 m is unchanged across levels: no trees are near, and ground cover is not drawn at that zoom.
- The peak, 168,688 triangles (high, `multidraw=0` forest), is under the 250k budget.

**What each level changes** (`Game/src/app/quality.ts`, documented in `00_Project_Core/Controls.md`):

| | high | medium | low |
|---|---|---|---|
| pixel ratio cap | 2 | 1.5 | 1 |
| MSAA | on | on | off |
| sun shadows | 2048 px | 1024 px | off |
| full-detail trees, bushes and stones | 90 m (70 m on the fallback) | 70 m | 50 m |
| mid detail | to 130 m | to 130 m | to 130 m |
| ground cover radius | 52 m | 40 m | 30 m |
| animals, villagers, founder, buildings | unchanged | unchanged | unchanged |

**High is exactly the pre-M015 renderer**, so desktop evidence is comparable.

**Choosing a level:**

- **URL:** `?quality=low|medium|high|auto` applies to one load.
- **Settings:** ⚙ Settings → Graphics quality is kept in this browser (`astrix:quality:v1`) and reloads the page.
- **Auto** (`chooseQuality`): high on a fine pointer (desktop) and medium on touch. It picks low on touch when it sees any of:
  - 4 or fewer CPU threads;
  - `deviceMemory` of 3 GB or less;
  - a known weak or software GPU from `WEBGL_debug_renderer_info` (Mali-4xx/T, Mali-G31/51/52/57/68, Adreno 3xx–5xx, PowerVR, SwiftShader, llvmpipe);
  - no `WEBGL_multi_draw` at a DPR of 2.5 or more.
- The GPU string comes from a throwaway WebGL2 context, which is released at once and only read on touch devices.

## 4. 10-minute emulated session with `?perf=1`

Probe: `m015-session.probe.js`; results in `m015-session-results.json`; the downloaded report is `m015-session-report.json`; screenshots `session-1-overlay-open.png` and `session-2-after-download.png`.

**Steps:**

- 2 minutes idle at the farm in walk mode;
- six joystick walks;
- Home;
- a page reload at 4.5 min;
- the builder view for 1 min;
- walk mode, idle at the farm until 10 min;
- then the overlay's real **Copy report** and **Download report** buttons.

**Results:**

- **Log:** 49 buckets over 9.2 min (47 fully visible). The reload kept the session: 25 buckets before, 25 after, and the log records a `hidden` and a `reload` event at 285 s.
- **Copy:** the clipboard held the summary and the JSON (17,011 characters). The status read "Copied the report (17 KB): paste it into the chat."
- **Download:** saved `astrix-perf-2026-11-25T11-29-56.json`.
- **Share…** was not offered: headless Chromium has no `navigator.share`. Chrome on Android has it.
- **Thermal indicator:** `ok`, −2.5 % drift. It compared 6 recent buckets at `walk:-1,-1:close` with 10 baseline buckets.
- **Expected FAILs here:** median fps 1.2 and p95 ≥ 1000 ms (software GL), and the session was shorter than 20 min.

The pasted summary:

```
ASTrix perf report v1 · build 48375bf (index-DI-puJKV.js)
Device: Mozilla/5.0 (X11; Linux x86_64) … HeadlessChrome/151.0.0.0 …
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) · cores 8 · memory 32 GB · screen 390x844 @1x · viewport 390x844
Render: multi-draw · quality low (auto: GPU ANGLE (… SwiftShader driver)) · pixel ratio 1 · canvas 390x844
Session: 9.2 min · 49 buckets (47 visible)
FPS: median 1.2 · worst bucket 0.8 · p5 0.7 · frame p50 857 ms · p95 >= 1000 ms · frames > 50 ms: 593
Draw calls max 51 · triangles max 95820
Heap MB first/last/max: 63/47/63 · battery 100% → 100% (charging)
Thermal: ok · 1.2 → 1.3 fps (-2.5% drift) · 6 recent bucket(s) at walk:-1,-1:close against 10 in the first two minutes
Checks: median fps FAIL · p95 frame FAIL · drift PASS · length FAIL
Events: 0s start quality low · multi-draw · 285s hidden · 285s reload quality low · multi-draw
```

## 5. The device test kit

**Performance monitor (`?perf=1`):** `app/perf-monitor.ts` holds the pure functions; `app/perf-overlay.ts` draws the overlay.

- **Off by default.** Nothing in it runs without the flag. It stays on while `perf=1` is in the address.
- **The pill** shows fps and p95 frame time, updated twice a second. The expanded view adds:
  - fps and its 5th percentile, frame p50/p95 over the last 240 frames;
  - draw calls and triangles;
  - the render path: multi-draw, or the fallback (and whether `?multidraw=0` forced it);
  - the GPU string and the device pixel ratio → renderer pixel ratio;
  - canvas and viewport size, CPU threads, memory, JS heap, battery;
  - the bucket count and the thermal status.
- **Session log:** a 10 s bucket holds fps (mean and p5), p50/p95/max frame time, frames over 50 ms, the visible fraction, the scene key (mode, 48 m cell, zoom band), calls, triangles, heap, battery level and charging, quality and path. A 1 ms frame-time histogram up to 1 s gives the session p50/p95.
- **Events:** start, reload, hidden/visible, orientation, charging, and the owner's **Mark**s.
- **Reloads:** the log is saved to sessionStorage after every bucket and on page hide, so a reload in the same tab continues it.
- **Thermal indicator:** compares the mean fps of the most recent (up to 6) visible buckets after 2 min with the visible buckets from 20 s to 2 min in the same scene. Under 10 % is ok, 10–25 % is warming, over 25 % is throttling. A scene that was never revisited reads unknown.
- **Report:** Copy (the summary and the JSON in one paste, with a select-and-copy fallback), Download (JSON whose first field is the text summary) and Share (with the file where `navigator.canShare` allows it).
  - **Build:** `__ASTRIX_BUILD__` is set by `vite.config.ts` from `git rev-parse --short HEAD`, plus a dirty flag that ignores `dist` and `tests/.build`. The bundle file name is included.
  - **Device:** user agent, platform, screen, viewport, DPR, `hardwareConcurrency`, `deviceMemory`, the GPU strings, WebGL2, multi-draw support and the maximum texture size.
  - **Checks** use the proposed thresholds.
- **Never touches the simulation.**
  - Tests: no sim, session, save or controller module imports these modules.
  - Tests: drawing nature and ground cover at every level leaves the hash, revision and entity count unchanged, and 40 ticks give the same hash at every level.
  - Browser: the 24 perf loads (each with `?quality=` set) all had the same hash.

**Quality levels:** see §3. Settings is the gear button beside Farm.

**Other additions:**

- `?metrics=1`, a test-only cadence: `window.__metrics` is refreshed every frame.
- `homestead.anchor` in the metrics.

**Test plan:** [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) has the exact URL, the nine steps (about 35 min), the thresholds and what to note by eye.

**Probes and generator:** `gen-m015.mjs <layout|controls|perf|session> <out.js> key=value…`.

- Keys: `vps=p360,p390,l844,t1280,t800,d1280`, `base=<url>`, `dist=<dir>`, `prefix=…`, `quality=…`, `extra=&perf=1`.
- Run the written file with Playwright `browser_run_code_unsafe { filename }`.
- Only `https://astrix.local/` is served from the dist copy; any other base loads from the network.

## 6. Requires the owner's physical device

- Real frame rate, frame-time p95 and long frames on the owner's Android phone or tablet, at the level auto picks, and at Low if that level misses 30 fps.
- Whether the GPU string is exposed, and whether WEBGL_multi_draw is present on that GPU (which render path actually runs).
- Heat and throttling over a 20–30 minute session: the fps drift, how hot the device feels, and any Chrome or Android heat warning.
- Battery drain per hour.
- Touch feel:
  - joystick response and stopping;
  - double jump timing (not verifiable in emulation);
  - holding Dive and Jump with a second finger down;
  - dragging the build ghost by touch (never exercised: Playwright only taps);
  - the native select picker in the Farm panel;
  - pinch zoom.
- Safe areas: the status bar, notch, gesture bar or cut-outs against the top row, the Jump button and the bottom pill. Emulation has zero insets.
- Real tablet pixel densities (the owner's 1536×960 class screens) and both orientations, including rotating while playing.
- Memory pressure: whether Android reloads the tab during a long session (the log would show a `reload` event).
- The Share sheet on Android.
- The MagicBlock panel on a real network (the chain was reachable from the sandbox, but wallets were not tested).

When the owner's report arrives: check it against the thresholds, fix anything it finds, and re-run the device test if needed. Only then can M015 be approved.

## Files

**Docs:** `REPORT.md` (this file), `DEVICE_TEST_PLAN.md`.

**Probes:** `m015-layout.probe.js`, `m015-controls.probe.js`, `m015-perf.probe.js`, `m015-session.probe.js`, `gen-m015.mjs`.

**Results:**

- `m015-layout-{before,after}-<vp>.json`
- `m015-controls-ctl-<vp>.json`
- `m015-perf-<level>.json`
- `m015-session-results.json`, `m015-session-report.json`

**Screenshots:**

- `before-<vp>-*.png`, `after-<vp>-*.png`
- `ctl-<vp>-*.png`
- `perf-<level>-*.png`
- `session-*.png`
