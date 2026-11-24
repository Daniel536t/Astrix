# M007b evidence: player stuck, double jump

## Deployed vs merged

- Nothing in this change is deployed. It is committed locally on `deploy/boxd` and is not pushed or merged to `main`.
- The live game the user played (latest release `9b16f0b`) does not have the double jump.

## Tests vs live-browser

### Cause of the stuck player

- A single jump launches at 6.6 m/s against 22 m/s² gravity, so the feet rise at most 0.99 m. Walking steps up at most 1.05 m (`STEP_HEIGHT`, one voxel). Any hole or ledge two voxels deep or higher therefore traps the player for good. Terrain dips, harvested ground and places between cliffs or trunks can all form such a hole.
- A reachability probe ran on seed 1337 with the founder house, path and terraces built. It flood-filled walk and jump moves from the spawn over the founder area (x -72..-14, z -56..-14, 11,570 standing positions) and found 0 positions from which the spawn could not be reached. The structures do not form enclosed pockets. Homestead fences and pens have no player colliders (they are not in `world.structures`), so they cannot trap the player either. The probe was a one-off and is not part of the test suite, because it took about 74 s.

### Fix

- The user asked for jumping instead of a return-to-spawn escape. With future weapons the player can cut voxels around themselves and still needs to climb out of the resulting hole. So no unstuck or respawn key was added.
- Tapping Jump again while airborne now gives one extra launch at 8.4 m/s (`DOUBLE_JUMP_SPEED` in `Game/src/sim/character.ts`). The total rise is about 2.2 m, enough to clear a two-voxel rim. The air jump resets on landing and in water. Keyboard (Space) and the touch Jump button both use it through `ExploreController.setJumpHeld`, because each new press already queues a jump. The on-screen hints mention it.
- The character's state is presentation-tier and is not journaled or hashed. The new `airJumpUsed` field is not saved, so old saves and their hashes do not change.

### Verified by test

- `Game/tests/m004.character.test.ts`, test "a second jump tap in the air jumps higher, once, and a two-voxel hole can be left":
  - a double tap peaks more than 0.5 m higher than a single tap;
  - a third tap adds nothing;
  - walking or a single jump does not leave a 2 x 2 shaft two voxels deep;
  - a double jump while pushing forward does leave it.
- The test fails on the pre-fix code, which has no air jump.
- Full suite: 191 pass. `tsc --noEmit` is clean and `npm run build` succeeds.

### Not verified

- Not checked in a live browser or on real phones.
- The exact spot where the user got stuck is unknown, and no reproduction from the live game is recorded.

## Visual model vs simulation behaviour

- The figure has no distinct second-jump animation. It uses the existing airborne pose, and only the simulated height changes.
