# M005: Touch controls and water physics: evidence (2026-11-24)

Design and player-facing rules: `00_Project_Core/Controls.md`.

## Why the old touch controls failed

The D-pad was 5 discrete buttons that all shared one global direction. Reading `main.ts` and `camera.ts` (not observed on a device), the causes were:
- **Any lift cleared all movement.** Any `pointerup` cleared the direction, so a second finger stopped the first.
- **No sliding between directions.** Pointer capture pinned the finger to the first button it touched, so sliding to another direction did nothing.
- **Nothing reset on focus loss.** Losing window focus or hiding the page never cleared the pad, so an OS gesture that swallowed the touch left the character walking.
- **Long-press interference.** There was no `-webkit-user-select` or `-webkit-touch-callout`, so a long-press could start text selection or a callout and cancel the hold.

## New controls (Minecraft Bedrock-style joystick layout)

Microsoft's Bedrock control-scheme docs describe the model: a virtual joystick or D-pad moves and strafes, and dragging on the screen looks ([Control Schemes](https://learn.microsoft.com/en-gb/minecraft/creator/documents/controlschemes?view=minecraft-bedrock-stable)). Bedrock also offers a joystick-plus-crosshair mode ([touch controls overview](https://www.mc-mod.net/how-to-enable-touch-controls-customization-on-mobile/)). Content was rephrased for compliance with licensing restrictions.

ASTrix version:
- **Joystick:** a floating analog stick appears under the left thumb anywhere on the left half. Pushing to the rim runs, and the stick follows the thumb past the rim.
- **Look:** drag on the right half.
- **Buttons:** hold Jump (swims up in water); Dive appears while swimming; Gather.
- **Finger tracking:** every control tracks its own pointer id. Blur, page hide and visibility changes release everything.

## Browser verification

Setup: Chrome mobile emulation, 844×390 landscape, touch enabled. Real multi-touch sequences were sent through CDP `Input.dispatchTouchEvent` (`touch-flow.js`).

| Step | Result |
|---|---|
| Hold joystick at about ⅔ of the radius | stick active, vector z = 0.63, walking at 2.6 m/s |
| Second finger drags on the right half | camera turned; still walking at 2.6 m/s |
| Lift the look finger only | still walking at 2.6 m/s |
| Push to the rim | run = true, 7.5 m/s (`RUN_SPEED`) |
| Lift the thumb | stick released; drift over the next 4 s: 0.04 m (deceleration only) |
| Blur while holding (simulated OS steal) | stick released, speed 0 |
| Tap Jump while walking | went airborne; the walking thumb kept walking afterwards |

Layout screenshots: `CTL-before-landscape.png` (old D-pad), `CTL-layout-landscape.png`, `CTL-layout-portrait.png`.

## Water verification

Setup: a 5 m deep pool in the default world (seed 1337, at x −251, z −333). The dry respawn point is on the bank (`water-flow.js`).

| Step | Result |
|---|---|
| Spawn on the bed | floated up and treaded water with the head above the surface; Dive button appeared; stamina bar shown (`WTR-01`) |
| Hold Dive | head underwater, bubbles 10 → 6, underwater tint on (`WTR-02`) |
| Breath gone | 0 bubbles, health 74.7 and falling, red vignette (`WTR-03`) |
| Health 0 | "You drowned", respawn countdown (`WTR-04`) |
| Respawn | on the bank (−243.5, 1, −351.5), health 100, breath 1, standing (`WTR-05`) |

Page errors: none in any run.

## Automated tests

`npm test`: 167 pass, 0 fail.
- New: `tests/m005.water.test.ts` (9 tests). Covers treading water, diving, breath timing, drowning damage, surfacing, exhaustion sinking, the stamina duration, climbing out onto a bank, respawn, wading speed, and determinism.
- New: `tests/m005.touch.test.ts` (4 tests). Covers the joystick dead zone, direction, analog speed, running, and the base following the thumb.
- Updated: the M003 markup test (joystick zone instead of 5 pad buttons) and the river swim test (it now asserts the character swims).

## Bug found and fixed along the way

The explore controller never stepped in this sandbox (`steps: 0`; the character stuck in the air at spawn). The live site behaved the same way. The cause: `THREE.Timer` returned a negative first delta, because the first rAF timestamp came before the direct first call. The fixed-step accumulator therefore started about 15 s in the negative. Both `main.ts` and the controller now clamp the delta at zero. Whether real phones hit this depends on frame timing; a slow first frame makes it much more likely.

Also fixed: a saved position far from the origin could never spawn, because terrain only streamed around the camera target. While waiting to spawn, the camera target now moves to the spawn point.

## Not verified

- No physical phone. iOS Safari long-press and edge-swipe behaviour is inferred from the CSS and pointer handling, not observed.
- Frame rate in this sandbox is about 1.4 fps (software WebGL), so feel and latency can't be judged here.
