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
| Look / orbit | Drag with any mouse button | Drag orbits |
| Zoom | Wheel (3–60 m, follows trackpad deltas) | Wheel (12–1400 m) |
| Rotate camera | Drag | Q / E |
| Gather what you are next to | E (or H) — prompt shows in the HUD, ring marks the target | H (nearest within 40 m of the view centre) |
| Switch mode | Tab, or the **Builder view / Walk** button at top centre | Tab / button |
| Build panel | B | always shown |
| Settlement (bag, stockpile, crops) | I | always shown |
| Pause time | P | P |
| Time-of-day presets | 1 dawn · 2 noon · 3 dusk · 4 midnight | same |
| Time speed | [ and ] | same |
| Inspect objects | Hover / click (Inspect button lists objects) | same |
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
| Gather | **Gather** button |
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

## Known gaps

- Gamepad input is not supported.
- No physical-device testing yet. Touch was verified in Chrome mobile emulation with real multi-touch sequences (CDP), not on a phone.
