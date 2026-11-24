# ASTrix — Controls

**Updated:** 2026-11-24 · Owner-approved key map (World_Engine_Audit §7). The game starts in **Walk** (explore) mode.
Scripted captures (`?action=`, `?ui=0`, explicit camera params) and `?mode=builder` start in the builder view.

## Desktop

| Action | Walk (explore) | Builder view |
|---|---|---|
| Move | WASD / arrow keys (camera-relative) | WASD / arrows pan the overview |
| Run | Shift | Shift = faster pan |
| Jump | Space (hold to swim up in water) | — |
| Dive | Hold C while swimming | — |
| Plant banner (mark this spot) | V: your one field banner moves to where you stand (dry ground only) | — |
| Return home | R, then hold still about 1.5 s: back beside your home banner at the founding spot. Moving, jumping or getting hurt cancels; R again cancels | — |
| Return to banner | T, then hold still about 1.5 s: back beside your field banner | — |
| Look / orbit | Drag with any mouse button | Drag orbits |
| Zoom | Wheel (3–60 m, follows trackpad deltas) | Wheel (12–1400 m) |
| Rotate camera | Drag | Q / E |
| Work the homestead (dig, sow, water, harvest, feed, collect, milk, shear) or gather | E: the HUD names the action in reach; otherwise gathers (H also gathers) — prompt shows in the HUD, ring marks the target | H (nearest within 40 m of the view centre) |
| Switch mode | Tab, or the **Builder view / Walk** button at top centre | Tab / button |
| Plan a field (where, size, crop) | F, or Farm → Plan a new field | — |
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
| Dive | **Dive** (appears left of Jump while swimming). Hold to swim down. |
| Banners | A small column on the right, above the zoom buttons: **Home** (return home), **To banner** (return to your field banner; dimmed until one is planted), **Plant** (plant or move your field banner here). Tap Home or To banner, then keep the joystick thumb off for about 1.5 s; the button fills as a ring while you wait. |
| Use / gather | The yellow button names what it will do ("Dig the flax field", "Draw water"…) |
| Farm | **Farm** button (top left): fields, people, animals, steward; Plan a new field |
| Switch mode | **Builder view / Walk** button (top centre) |
| Panels | Settlement / Build / World tabs (top right). Walk mode opens the World tab. |

Every control tracks its own finger, so looking or jumping never stops or replaces the walking thumb. Movement also stops when the browser loses focus or the page is hidden, so an OS gesture that swallows the touch cannot leave the character walking.

## Water

| Situation | What happens |
|---|---|
| Up to chest depth | You wade. The deeper the water, the slower the walk. Rivers push you downstream a little. |
| Deeper | You swim. You tread water with your head above the surface, carried by the current (half its surface speed). |
| Stamina (yellow bar) | Treading water lasts about 60 s, active swimming about 40 s. At zero you can no longer stay afloat and sink. It recovers in about 8 s on dry land. |
| Breath (bubbles) | 15 s with your head underwater. |
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
- No physical-device testing yet. Touch was verified in Chrome mobile emulation with real multi-touch sequences (CDP), not on a phone.
