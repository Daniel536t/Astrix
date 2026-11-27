# STAB-001 · M015 device evidence assessment (device report 1)

Status: **M015 OPEN.** Nothing in this assessment changes the report's results. The failed session-length check stays failed.

Source: the owner's pasted report, saved as `13_Integration_and_QA/Evidence/M015-mobile-verification/device/owner-report-2026-11-25-summary.txt`. The JSON arrived truncated after bucket 62 (t = 620 s), so buckets 63–106 are known only through the summary line.

## 1. Where did the report come from?

| Signal | Value | What it indicates |
|---|---|---|
| WebGL unmasked renderer | `Adreno (TM) 710`, vendor Qualcomm | A Qualcomm mobile GPU (Snapdragon 7-series class). Emulated or remote browsers we have run report SwiftShader, llvmpipe or a desktop GPU. Our own Playwright runs report `ANGLE (Google, Vulkan 1.3.0 (SwiftShader ...))`. |
| User agent | `Mozilla/5.0 (X11; Linux x86_64) ... Chrome/142` | This is the UA that Chrome for Android sends when "Desktop site" is on. A plain Android Chrome UA contains `Android`. |
| `platform` | `Linux` | Consistent with Android in desktop-site mode. It does not by itself distinguish a Linux PC. |
| Touch | true | Touch screen present. |
| Screen | 1366×854 CSS px at dpr 1.875, which is 2561×1601 physical | A 2560×1600 panel, a common 11–12" Android tablet resolution. The owner's earlier screenshots (1536×960 with an Android status bar, 4:16 Wed Nov 25, 40 % battery) have the same 1.6 aspect ratio. |
| Cores / memory | 8 / 8 GB | Consistent with a mid-range 2024–25 Android tablet. |
| Battery API | 72 % → 63 % over 17.9 min, not charging | A real battery draining. Remote browsers and emulators usually report no battery or a constant 100 % charging. Our emulator reported `100% charging`. |
| Frame timing | median 59.5 fps, p95 19 ms at a 2047×1063 canvas | Real GPU throughput. SwiftShader runs this game at about 1 fps. |

**Assessment:** the report most likely came from a real Android tablet with an Adreno 710 GPU, running Chrome 142 with "Desktop site" enabled. It was probably not an emulator or a remote browser, for two reasons: software renderers report themselves in the renderer string and cannot reach 60 fps here, and the battery data drains like a real device.

**What remains uncertain:**
- The exact device model.
- That the strings were not spoofed. A browser can override the user agent, and with effort the WebGL strings too, but nothing suggests that here.
- That one device produced the whole session. The `hidden` + `reload` event at 751 s fits the owner switching apps or the tab reloading.

**Effect of desktop-site mode on the evidence:**
- **Auto quality:** desktop-site mode is why auto quality chose `high` on the first load and `medium` after the reload. The renderer saw a desktop UA, and the coarse-pointer media query flipped between loads.
- **First 751 s:** this part of the session (buckets 0–74) therefore ran at **high**, which is harsher than the intended mobile default.
- **Thresholds:** the fps and frame-time passes are valid, if anything conservative.
- **Fix:** the heuristic was fixed in `090cab6` to classify touch plus a mobile GPU (Adreno/Mali/PowerVR/Apple/Xclipse) as mobile on the first frame. That fix is verified in emulation only.

## 2. What is verified, and what is not

| Check | Result | Validity |
|---|---|---|
| Median fps ≥ 30 | 59.5, PASS | Valid. Real device, 107 visible 10 s buckets. |
| Frame p95 ≤ 50 ms | 19 ms, PASS | Valid as a session aggregate. It hides walking hitches: buckets 9–11 and 16–25 had p5 20–26 fps and 10–17 frames over 50 ms each. In total, 265 frames exceeded 50 ms. |
| Thermal drift ≤ 25 % | 0 %, "PASS" | **Weak.** The same-scene comparison used only 2 baseline buckets and 6 later buckets, and the session was split by a hide and reload at 751 s. I do not treat this as a thermal verification. |
| Session ≥ 20 min | 17.9 min, **FAIL** | Stands. The 20-minute thermal requirement is not met. |
| Draw calls ≤ 120 | max **143**, FAIL against the budget | Genuine; see section 3. |
| Triangles ≤ 250k | max 194,094, PASS | Valid. The budget is unchanged. |
| Memory | heap 136 → 212 max → 61 MB | No sign of a leak in this session. |
| Battery | 30.5 %/h at 60 fps | Measured. No threshold was set, so this is informational only. |

## 3. The 143 draw calls

This was a genuine over-budget scene and a measurement gap, not a regression from M013–M015 code, and not an outdated budget.

- **Where the calls occurred:** buckets 42–61, scene `walk:-1,0:mid`. That is walk mode at the farm, mid camera distance, quality high, multi-draw, **with the MagicBlock chain view on**. Every budget probe since M008 used `?chain=0`, so the default live configuration was never measured.
- **Reproduction:** in emulation, viewport 1365×709 in the same scene with the chain on, the count was exactly **143**.
- **Cause:** the chain settlement drew every crate, woodpile, cottage, crop row and settler as its own shadow-casting mesh, adding 30 main-pass and 30 shadow-pass calls. On top of that came two calls per near water chunk and 4 + 4 for the waystones.
- **Fix:** `090cab6`, deployed in release `20261125T164136Z-6e7fc61`. It merges the settlement props per material, merges near water per 4×4-chunk region, and merges the waystones.
  - Emulated worst case over 3 spots × 16 camera angles: high/medium 82–89 calls, low 57–64.
  - Triangles rose to at most 181,184, because merged meshes cull as one unit.
  - This is **not yet confirmed on the device**.
- **Budget:** 120 draw calls and 250,000 triangles are unchanged. Future probes must measure both `chain=0` and the default chain-on configuration.

## 4. Required second device run (exact procedure)

1. Use the same tablet. Charge it to at least 60 %, unplug it, close other apps, and let it cool to room temperature.
2. **Turn off "Desktop site"** in Chrome's ⋮ menu, so the run reflects how players will see it. If you normally play in desktop-site mode, do run 2 that way and tell me. A third short run in the other mode is then useful.
3. Open `https://astrix.nyc.boxd.sh/?perf=1`. Check the overlay shows build `6e7fc61` or newer, and note the quality it chose. It should be `medium`.
4. Do not switch apps, lock the screen or rotate the tablet during the run. Any of these creates a `hidden` event and invalidates the thermal comparison.
5. Timeline, all in one orientation, with the screen on throughout:
   - **0–3 min:** stand still at the farm in walk mode at the default zoom. This is the thermal baseline scene.
   - **3–10 min:** walk around the farm, open the Farm panel, then walk at least 300 m away from the farm in one direction into new ground, and walk back.
   - **10–22 min:** play normally (gather, build a woodshed, swim). Stay active.
   - **22–25 min:** return home (Home button) and stand still at the same spot and zoom as minutes 0–3.
6. At 25 min, tap the fps pill, then Copy report, and paste the whole text into chat. Also tell me how warm the tablet felt (cool / warm / hot) and whether any taps were missed.
7. Optional, after the run: switch Settings → frame cap to 30 and play 10 more minutes, then copy a second report for the battery comparison.

**Run 2 passes when all of these hold:**
- median ≥ 30 fps and p95 ≤ 50 ms;
- the session is at least 20 min with no hidden events;
- thermal drift between minutes 0–3 and 22–25 at the same scene is no more than 25 %, with at least 6 buckets each;
- max draw calls ≤ 120, with the target ≤ 100;
- max triangles < 250k;
- frames over 50 ms while walking into new ground are clearly lower than run 1, where buckets 16–25 had 10–17 per 10 s; target ≤ 3 per 10 s;
- the same quality level was chosen at load and after any reload;
- no control or layout blockers.
