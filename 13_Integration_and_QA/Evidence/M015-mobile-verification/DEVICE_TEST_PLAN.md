# M015 device test plan (owner's phone or tablet)

This is the part of M015 that only a real device can do. Everything here runs in Chrome on Android. It takes about 35 minutes, most of it just playing.

## Before you start

- Use the build that includes M015. It is **not deployed yet**. When it is, the address is **https://astrix.nyc.boxd.sh/?perf=1**. The perf report's first line names the build (`build <commit> (index-….js)`). Check it against the commit in REPORT.md.
- Charge the device to at least 60 %, then **unplug it**. The battery reading only counts while it discharges.
- Turn off battery saver. Set the screen brightness to what you normally use.
- Play in the orientation you normally use. If you use both, do the long session in one orientation and the layout checks (step 6) in both.
- Close other apps. Leave Chrome's normal settings alone (no desktop mode).

## The monitor

`?perf=1` shows a small pill with **fps** and the **p95 frame time** (bottom centre; on a portrait phone it sits just under the health bar). Tap it to open the details and the buttons:

- **Copy report**: copies a short summary and the full JSON. Paste it into the chat.
- **Download report**: saves `astrix-perf-<time>.json` to Downloads.
- **Share…**: Android's share sheet, if Chrome offers it.
- **Mark**: puts a timestamp in the log. Tap it when something feels wrong (stutter, heat, a missed tap).
- **New session**: starts the log again.

The log keeps going if the tab reloads. Leave `?perf=1` in the address the whole time.

The quality level is picked automatically: **medium** on phones and tablets, **low** on weak ones. The report says which level ran and why. Use **⚙ Settings** (beside Farm) to change it. A change reloads the page; the world is saved first.

## Steps

| # | What to do | Time |
|---|---|---|
| 1 | Open https://astrix.nyc.boxd.sh/?perf=1. If the entry screen appears, use the way you normally play. Wait until the world has loaded and you stand at the farm in walk mode. | 1 min |
| 2 | **Idle baseline.** Don't touch the screen; let the camera rest where it starts. This is what the heat check compares against later. | 2 min |
| 3 | **Walk loop.** Walk around the farm and the nearby trees with the joystick, running part of the way. Jump; double-tap Jump for the high jump. Tap Plant, walk away, tap To banner, then tap Home. | 4 min |
| 4 | **Swim.** Walk west to the river (about 40 m west of the farm). Swim, hold Dive to go under, let go to come up, and hold Jump to swim up. Then tap Home. | 3 min |
| 5 | **Build flow.** Tap Farm, give Cora a job (woodcutter), then tap Build…. Tap the ground to put the ghost there, Turn 90°, then Place & approve. Close the Farm panel. | 3 min |
| 6 | **Layout check.** Open and close every panel once: Farm (scroll it to the bottom), ⚙ Settings, the MagicBlock button, Builder view and its Settlement / Build / World tabs. Rotate the device if you use both orientations. Screenshot anything that overlaps, is cut off or is hard to tap. | 3 min |
| 7 | **Long session.** Play normally (walk, build, farm) until **at least 20 minutes** have passed since step 1, and 30 if you can. | 15–20 min |
| 8 | **Heat check.** Tap Home, then don't touch the screen for 2 minutes, as in step 2. | 2 min |
| 9 | Open the pill and tap **Copy report**. Paste it into the chat. If the paste fails, use Download report or Share… and attach the file. | 1 min |

If the median fps in the report is under 30, open ⚙ Settings, choose **Low**, and repeat steps 2–3 and 8–9 (about 8 minutes). Send both reports.

## Pass thresholds (proposed)

| Check | Pass | Where it comes from |
|---|---|---|
| Median fps over the session | **≥ 30** at the level that ran (farm view included) | report: `FPS: median …`, check `medianFps` |
| Frame time p95 | **≤ 50 ms** | report: `p95 … ms`, check `frameP95` |
| Heat (fps drift) | **≤ 25 %** lower in step 8 than in step 2 | report: `Thermal: …`, check `thermalDrift` (`warming` is 10–25 %, `throttling` is over 25 %) |
| Session length | ≥ 20 min | check `sessionLength` |
| Controls | No failures: every tap, hold and joystick move does what it should the first time | your notes |
| Layout | No blockers: nothing important hidden, cut off or untappable in either orientation | your notes and screenshots |

A failed check sends M015 back for fixes. The thresholds are a proposal; change them if they don't match how the game feels to you.

## What to note by eye

Write a line for each in the chat with the report:

- **Controls:** does the joystick respond at once and stop when you lift your thumb? Any missed or doubled taps on Jump, Dive, Use, the banner buttons or the build bar? Does looking with the right thumb ever stop the walk?
- **Smoothness:** any stutter while walking or turning the camera, and where?
- **Heat:** how warm is the device at 10 and 20 minutes (cool, warm, hot)? Did Chrome or Android warn about heat?
- **Battery:** the percentage at the start and the end. The report also has it if Chrome exposes the battery, which current Chrome on Android usually does.
- **Anything else:** text too small to read, the notch or gesture bar covering a button, the keyboard or a select picker behaving oddly.

## What the report contains

- **Build and device:** build id, user agent, screen size and pixel density, CPU threads, memory, GPU name (if Chrome exposes it), WebGL2, WEBGL_multi_draw, viewport.
- **Render settings:** render path (multi-draw or fallback), quality level and why it was chosen, pixel ratio, canvas size.
- **Summary:** median fps, the worst 10-second bucket, frame time p50/p95, frames over 50 ms, the most draw calls and triangles, JS heap, battery, the thermal result and the pass/fail checks.
- **Buckets:** one per 10 seconds, with fps (mean and 5th percentile), frame times, long frames, scene, draw calls, triangles, heap, battery, visibility and quality.
- **Events:** start, reloads, hidden or visible, orientation changes, charging changes and your Marks.

The report contains no wallet keys and no world save.
