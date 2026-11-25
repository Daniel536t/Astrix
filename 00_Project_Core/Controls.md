# ASTrix — Controls

**Updated:** 2026-11-25 (M015 mobile verification: Settings, quality levels, performance monitor, touch layout) · Owner-approved key map (World_Engine_Audit §7). The game starts in **Walk** (explore) mode.
Scripted captures (`?action=`, `?ui=0`, explicit camera params) and `?mode=builder` start in the builder view.

## Desktop

| Action | Walk (explore) | Builder view |
|---|---|---|
| Move | WASD / arrow keys (camera-relative) | WASD / arrows pan the overview |
| Run | Shift | Shift = faster pan |
| Jump | Space (hold to swim up in water, faster than floating up) | — |
| Dive | Hold C while swimming to swim down; let go and you float back up | — |
| Plant banner (mark this spot) | V: your one field banner moves to where you stand (dry ground only) | — |
| Return home | R, then hold still about 1.5 s: back beside your home banner at the founding spot. Moving, jumping or getting hurt cancels; R again cancels | — |
| Return to banner | T, then hold still about 1.5 s: back beside your field banner | — |
| Look / orbit | Drag with any mouse button | Drag orbits |
| Zoom | Wheel (3–60 m, follows trackpad deltas) | Wheel (12–1400 m) |
| Rotate camera | Drag | Q / E |
| Work the homestead (dig, sow, water, harvest, feed, collect, milk, shear), open or close a gate or the farmhouse door within 2 m (M012; a locked one is unlocked and opened), or gather | E: the HUD names the action in reach; otherwise gathers (H also gathers) — prompt shows in the HUD, ring marks the target. Touch: the Use / Gather button does the same | H (nearest within 40 m of the view centre) |
| Switch mode | Tab, or the **Builder view / Walk** button at top centre | Tab / button |
| Plan a field (where, size, crop) | F, or Farm → Plan a new field | — |
| Build (M014: choose a woodshed, log store or well, where it goes and which way it faces) | G, or Farm → Build…. The ghost follows the mouse; click to pin it (click elsewhere or drag the ghost to move it); X or Shift + wheel turns it a quarter (Shift + X back); Enter or **Place & approve** places and approves it (its materials are reserved); Escape, G or **Close** leaves. Green: good spot; red: the reasons are listed | same (G) |
| Homestead (fields, people, animals, steward) | Farm button | Farm button |
| Build panel | B | always shown |
| Settlement (bag, stockpile, crops) | I | always shown |
| Pause time | P | P |
| Time-of-day presets | 1 dawn · 2 noon · 3 dusk · 4 midnight | same |
| Time speed | [ and ] | same |
| Inspect objects | Developer tool only: `?inspect=1` | same |
| Dismiss inspector | Escape | Escape |

Typing in a panel field never moves the character or camera.

## Touch (phones, tablets)

Modelled on Minecraft Bedrock's joystick layout: move with the left thumb, look with the right.

| Action | Control |
|---|---|
| Walk | Put a thumb anywhere on the **left half** of the screen: a joystick appears under it. Push gently to walk, push to the rim to run (the ring turns yellow). Lift the thumb to stop. The joystick follows the thumb if it slides past the rim. |
| Look | Drag anywhere on the **right half** |
| Zoom | Pinch on the right half, or the + / − buttons |
| Jump / swim up | **Jump** (bottom right). Tap to jump; hold to swim up. |
| Dive | **Dive** (appears left of Jump while swimming). Hold to swim down; release to float back up. |
| Banners | A small column on the right, above the zoom buttons: **Home** (return home), **To banner** (return to your field banner; dimmed until one is planted), **Plant** (plant or move your field banner here). Tap Home or To banner, then keep the joystick thumb off for about 1.5 s; the button fills as a ring while you wait. |
| Use / gather | The yellow button names what it will do ("Dig the flax field", "Draw water"…) |
| Farm | **Farm** button (top left): fields, people, animals, steward; Plan a new field. On a portrait phone it opens as a sheet from the top that ends at 60 % of the height, so the joystick, Jump and Use stay usable (the banner and zoom buttons step aside while it is open); in landscape it opens beside the right-hand thumb column. Close it with ×. |
| Settings | The gear button beside Farm: graphics quality (Auto / Low / Medium / High, applied after a reload; the world is saved first) and the performance monitor switch |
| MagicBlock panel | Folded to one **MagicBlock ▸** button on phones and tablets (top right while walking, bottom right in the builder view); tap it to unfold, **▾ hide** to fold. M still hides it on a keyboard |
| Build (M014) | Farm → **Build…**. The ghost starts in front of the founder; tap the ground on the right half to move it there (drag the ghost to slide it). The bar at the top has the catalogue, **Turn 90°**, **Place & approve** and **Close**; it stays clear of the joystick and Jump |
| Switch mode | **Builder view / Walk** button (top centre) |
| Panels | Settlement / Build / World tabs (top right). Walk mode opens the World tab. |

Every control tracks its own finger, so looking or jumping never stops or replaces the walking thumb. Movement also stops when the browser loses focus or the page is hidden, so an OS gesture that swallows the touch cannot leave the character walking.

## Graphics quality and the performance monitor (M015)

| URL / setting | Effect |
|---|---|
| `?quality=low`, `medium`, `high`, `auto` | Graphics level for this load (overrides the Settings choice). Auto: high on computers, medium on phones and tablets, low on weak ones (4 or fewer CPU threads, 3 GB or less memory, an older Mali / Adreno 3xx-5xx / PowerVR or software GPU, or no WEBGL_multi_draw at a pixel density of 2.5 or more). |
| high | pixel ratio up to 2, smoothing (MSAA), 2048 px shadows, full-detail trees to 90 m (70 m on the `multidraw=0` path), ground cover 52 m. The renderer as it was before M015. |
| medium | pixel ratio up to 1.5, smoothing, 1024 px shadows, full-detail trees to 70 m, ground cover 40 m |
| low | pixel ratio 1, no smoothing, no shadows, full-detail trees to 50 m, ground cover 30 m |
| `?perf=1` | Performance monitor: a pill with fps and p95 frame time (bottom centre; under the vitals on portrait phones). Tap it for draw calls, triangles, the render path, GPU, pixel ratio, canvas size, battery, the thermal indicator and **Copy report**, **Download report**, **Share…** (where the browser offers it), **Mark**, **New session**. It stays on while `perf=1` is in the address; the log survives a reload in the same tab. |
| `?metrics=1` | Test harness only: refreshes `window.__metrics` every frame (for slow emulated runs). |

Animals, villagers, the founder and buildings are drawn the same at every level. None of these change the settlement, its journal or its save.

## Water

| Situation | What happens |
|---|---|
| Up to chest depth | You wade. The deeper the water, the slower the walk. Rivers push you downstream a little. |
| Deeper | You float. At rest you tread water with head and shoulders out (water at the chest), bobbing gently, carried by the current (half its surface speed). Moving, you swim a breaststroke at the surface. Hold Dive to go under (an underwater breaststroke, body pointing where you swim); let go and you float back up; hold Jump to swim up faster. Over a submerged ledge you keep swimming. |
| Stamina (yellow bar) | Active swimming (strokes, diving, swimming up) lasts about 40 s. Floating at rest costs nothing and recovers it in about 30 s; dry land in about 8 s. At zero you still float, lower (water at the chin), swim slowly and cannot dive. |
| Breath (bubbles) | Lost only while your head is underwater: 15 s. With the head out it refills in about 2.5 s. |
| Health (red bar) | Out of breath, you lose 10 health per second, so about 10 s to drowning. After 4 s without damage it regenerates at 3 per second. |
| Drowning | "You drowned". After 3 s you respawn on the last dry ground you stood on, with full health, breath and stamina. |
| Getting out | Swim at the surface into a bank up to about 2 m high to climb out. |

## Banners (checkpoints)

| Banner | What it is |
|---|---|
| Home banner (red cloth, gold cap) | Planted beside the spot where every world first puts you (the founder's area). Always there; cannot be moved. |
| Field banner (yellow cloth) | Your one personal checkpoint. Plant it anywhere on dry ground; planting again moves it. |
| Returning | You land on dry, open ground next to the banner (never inside blocks, trees or water). If the land there is not loaded yet, you wait a moment while it streams in. |
| Saving | Banners are kept in this browser with your walking position, per world. They are not part of the settlement save, so they never change it. |

If you ever get stuck (a hole deeper than a double jump, about 2.5 m), use **Return home** or **Return to banner**.

## Known gaps

- Gamepad input is not supported.
- No physical-device testing yet. Touch was verified in Chrome mobile emulation with real multi-touch sequences (CDP), not on a phone. M015 prepared the device test (13_Integration_and_QA/Evidence/M015-mobile-verification/DEVICE_TEST_PLAN.md); its results are pending the owner's phone or tablet.
- Safe-area insets (`env(safe-area-inset-*)`) are applied to every edge-anchored control, but emulation reports zero insets, so notch / gesture-bar clearance is unverified until a device run.
