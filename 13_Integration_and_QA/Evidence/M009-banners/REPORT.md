# M009: banners (checkpoints) and Return home / Return to banner

**Date:** 2026-11-24 · Branch `deploy/boxd` · local commit only (not pushed or deployed).

## Owner request

The owner got stuck in a hole and asked for a flag at the first spawn spot, plus a flag they can plant anywhere, and buttons to go back to either. These should work like checkpoints.

## As built

| Part | Detail |
|---|---|
| Home banner | Block-built corner flag: stone foot, 2.6 m thin timber pole (0.12 m), red cloth (founder tunic red) in two stepped blocks, gold cap. It stands 1.6 m east of the founding spawn cell (-18, -18), so the pole is at (-15.9, -17.5). Always present. It cannot be moved. Its height comes from the terrain. |
| Field banner | Same flag with yellow cloth and a timber cap. There is one per player. **Plant banner** puts it at the founder's feet and planting again moves it. It is refused in the air, in water or while down. |
| Return home / Return to banner | You hold still for 1.5 s, timed by the wall clock so a low frame rate does not stretch it. Moving, jumping or taking damage cancels it, and so does pressing the same key again. The founder then lands on the first safe spot on rings 1.2 / 1.8 / 2.6 / 3.6 / 5 m around the pole. A safe spot has resident solid ground underfoot, no voxel, structure or trunk overlap, and no water in the feet or head cells. For the field banner the spot must also be within 3 m of the planted height. If that land is not resident, the camera target moves there to stream it in. After 30 s it gives up and the founder stays put. Health, stamina and breath carry over. |
| Keys | V plant banner · R return home · T return to banner (also in the desktop HUD hint). |
| Touch | **Home**, **To banner** (dimmed until a field banner exists) and **Plant** are a column on the right above the zoom buttons. A progress ring fills during the wait. Taps act on `pointerdown`, so they work while another finger is down. In landscape the column moves left of the Gather/Jump cluster. |
| Rendering | Both banners are merged into **one mesh** (`banners`): 1 main draw plus 1 shadow draw, 56 triangles for one banner and 112 for both. The mesh is rebuilt only when a banner moves. |
| Persistence | Player-local Web Storage key `astrix:banners:v1:seed:<seed>:gen:<gen>`, next to the existing `astrix:avatar:v1` position record. It is **not** in the hashed world snapshot or the command journal. |

### Why player-local instead of the world save

- The thing a banner returns is the character position, which is already player-local presentation state (`sim/character.ts` notes that movement is not journaled). A journaled `plant_banner` command would put a position into the hashed state while the teleport it serves stays outside it.
- Keeping banners out of the save guarantees by construction that old saves keep their exact bytes and hashes. Replay, compaction and the genesis hash cannot be affected.
- Old players with no banner record get the home banner derived from the founding spawn, which is the same constant every world spawns at. The derived home is written on first load, so a later change to the default spawn would not move it.
- When positions become authoritative (multiplayer, reach checks), banners can move into the snapshot as an optional field the same way `homestead?` did.

## Stuck-in-a-hole findings

1. **Jump arithmetic.** A ground jump reaches 0.99 m (6.6²/2·22). A double jump adds about 1.6 m, so the best total is about 2.6 m. A dry hole up to two voxels deep can be escaped. **Three or more voxels cannot, by design.** A test confirms that no second-tap timing leaves a 3-deep shaft. The banner return is the escape.
2. **Real bug, fixed: no double jump from water.** In knee-to-waist water (wading, 0.2–1.35 m), three things combined:
   - the wade jump was 0.7×, a 0.49 m hop;
   - the air jump required `!wading`;
   - `jumped` was cleared on every step that started with wet feet.

   Together these made a **two-voxel hole with water in it inescapable**. In a scratch probe, 0 of 24 tap timings escaped. Fix in `Game/src/sim/character.ts`: the air jump is allowed after a wading jump, jumps re-arm only on landing or swimming, and the wade jump is 0.85× (about 0.72 m). Now 4 of 24 timings escape. The new test `wading in a two-voxel hole` asserts at least 3.
3. **No natural traps near spawn.** A scan of a 321×321 m heightmap around the spawn on the v2 world (seed 1337) found no cell you can enter but not leave, dry or wet. A step-simulation of 48,841 standing spots within 220 m found no dry trap, either on genesis or after building all M2 projects. The one hit was inside the founder's house, where the probe's straight-line paths missed the door; that is not a trap. The owner's hole is therefore most likely a 3+ deep spot or a wet 2-deep spot somewhere else in their world. Their save was not available to confirm this.
4. **Touch Jump button.** `holdButton` fires on each first-finger press, so a second tap does produce a second jump. Quick taps only merge if both land inside one rendered frame. No bug found.
5. **Vegetation and fences.** Homestead fences and buildings have no collision. Shrubs are skipped. Tree trunks and rocks only push the founder sideways. No trap found.

## Automated tests (Node, `npm test`)

`cd Game && npx tsc --noEmit && npm test && npm run build`: typecheck clean, **241/241 pass** (230 before, plus 11 new in `tests/m009.banners.test.ts`), build OK. `tests/m003.ux.test.ts` was updated for 3 more touch buttons (6 → 9).

New tests:
- the home banner position; plant, then plant again moves the one field banner
- planting is refused in the air, in water and while down
- the landing is next to the banner, dry, not in voxels, at banner level, stable when standing, deterministic; unloaded terrain gives `unloaded`
- the real v2 home banner has a safe landing
- a 3-deep hole cannot be jumped out of, and the landing outside it works
- the wading 2-deep hole can now be left
- the return channel takes 1.5 s, and moving cancels it
- persistence round trip, corrupt or out-of-range records, and storage being unavailable
- an old world save restores with an identical hash, its bytes are untouched by banner writes, and it gets the derived home banner
- the genesis hash is independent of banners
- the banner mesh is one mesh, ≤150 triangles, two cloth colours, thin pole

## Browser checks (Playwright Chromium, software GL; not a real phone)

Built `Game/dist` was served at `https://astrix.local/`. Scripts are in `.kiro/artifacts/screenshots/probe/m009-desk-a.js` and `m009-mobile-a.js`. There were no page errors in either run.

**Desktop, 1000×600 (keyboard):**

| Step | Result |
|---|---|
| Load at the founding area | Founder at (-17.5, 14, -17.5). Home banner at (-15.9, 14, -17.5), visible beside the founder. `desktop-1-home-banner.png` |
| Run away, then V | Field banner planted at (-87.64, 4, -104.34). `desktop-2-field-banner-planted.png` |
| Move, then V again | The banner moved to (-75.06, 9, -114.16); there is still one field banner |
| R, then walk | "Return cancelled: you moved" |
| R, then hold still | The channel ran (`desktop-3a-returning-channel.png`). Landed at (-14.7, 14, -17.5), 1.2 m from the home pole. `desktop-3-returned-home.png` |
| T | Landed at (-73.86, 9, -114.16), 1.2 m from the field banner. `desktop-4-returned-to-banner.png` |
| Reload | The home and field banners are unchanged and the founder is at the banner. `desktop-5-after-reload.png` |
| Budget | Max 82 draws and 145k triangles across the run (under 120 and 250k). The banners cost 1 main and 1 shadow draw. |

**Emulated phone, 390×844, DPR 3, touch (CDP touch events):**

| Step | Result |
|---|---|
| Layout | Home, To banner and Plant sit at x 304–368, y 408–544. They do not overlap the joystick zone (x < 195), Jump, Gather, zoom or the HUD. In landscape (844×390) they are fully on screen with no overlaps. `mobile-1-home-banner-buttons.png`, `mobile-6-landscape.png` |
| Joystick walk, then tap Plant | Field banner at (-59.34, 10, -69.71). `mobile-2-field-banner-planted.png` |
| Home tapped with the joystick thumb down | Cancelled ("you moved") |
| Home tapped, thumb off | Back at (-14.7, 14, -17.5). `mobile-3-returned-home.png` |
| To banner | Back at (-58.14, 10, -69.71). `mobile-4-returned-to-banner.png` |
| Reload | The banners persisted. `mobile-5-after-reload.png` |
| Budget | Max 69 draws and 122k triangles |

`mobile-3a-returning-channel.png` was taken after the return had already finished: frames ran faster than expected, so it does not show the ring mid-way. In `mobile-1` the home banner is just out of frame to the right of the founder at spawn; it is in view in `mobile-3`.

## Not done / limits

- No real phone or real touch hardware. Touch was emulated in Chromium.
- The owner's actual save and hole location were not available.
- There are no clickable banner buttons on desktop (fine pointer); desktop uses the keys.
- Holes three or more voxels deep still cannot be jumped out of. That is intended, and the return is the way out.
