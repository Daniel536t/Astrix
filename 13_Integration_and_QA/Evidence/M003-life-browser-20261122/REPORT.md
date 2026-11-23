# M003 playable-life production-browser verification

**Date:** 2026-11-22  
**Scope:** schema-3 founder gathering, storage, processing, construction, cultivation, persistence, mobile controls, and honest save-failure feedback.  
**Authority:** `local-stub / local-simulation-only`; no network multiplayer or chain integration is claimed.

## Environment and method

- Production Vite build served at `http://127.0.0.1:4173/` with seed 1337 and frozen daylight.
- Chromium with SwiftShader software WebGL; this is **not physical-GPU performance evidence**.
- `browser-verification.mjs` uses actual DOM clicks, form input, keyboard actions, read-only game metrics, browser localStorage inspection, and reload. It does not call a mutable simulation hook.
- Mobile checks use a 390 × 844 emulated Chromium context. They are **not physical-device usability validation**.
- Desktop rendering is closed before mobile begins so this harness does not run two continuously rendering software-WebGL worlds concurrently.

## Current production checks

The code-split production build passes strict TypeScript and a full test-suite run of **116 tests, 116 passed, 0 failed** in 35.551 seconds. The added schema-3 regression proves that when recovered site obstructions would exceed the 120-unit carried capacity, the real bounded preparation pipeline rejects before changing inventory, entities, edits, or the complete snapshot.

Bundle splitting produces application, Three core, and Three renderer chunks independently. It does not change simulation behavior or suppress a size warning.

The first complete production-browser run passed at 15:14 UTC before bundle splitting; its results are preserved as `results-unsplit-success.json`. The final `results.json` records the verification of the current code-split build.

## Verified gameplay lifecycle

1. A fresh world explicitly reports `New local world`, `persistent: false`, and no accepted commands.
2. Two keyboard harvests gather two fiber into the carried bag.
3. Depositing two fiber stores it in the founder stockpile.
4. Starting seed production consumes the stored fiber; one explicit tick returns three seeds.
5. Building the pinned farm accepts one construction command and pays from carried resources while site clearing recovers ore and wood.
6. Planting crop zero consumes one seed. Four explicit ticks make it ready.
7. Harvesting returns six food and one fiber to the carried bag and empties the plot.
8. Two food enter the stockpile and begin ration production. Rations remain unfinished after one tick and produce three rations after a second tick.
9. Withdrawing two rations leaves one in storage and two in the carried bag.

The desktop run uses 14 accepted commands with the exact journal sequence:

`harvest, harvest, deposit, produce, tick, build, plant, tick, harvest_crop, deposit, produce, tick, tick, withdraw`

At the desktop reload boundary:

- State hash: `39cf99c90b4bf54f`
- Tick: 7
- Carried: 36 stone, 30 wood, 8 ore, 4 food, 1 fiber, 2 rations
- Stockpile: 2 seed, 1 ration
- Active jobs: none
- Crop zero: harvested and empty
- Snapshot `nextSequence`: 14
- Reload restores the exact hash, inventory, and life state and reports `Restored 14 accepted commands.`

Typing `h` while a numeric input has focus does not change the authoritative state hash.

## Mobile controls

The persisted desktop save loads in a separate emulated-mobile context. Settlement is initially visible. Build opens the construction panel and suppresses Settlement; World suppresses Settlement and exposes Gather; returning to Settlement restores it. One actual Settlement tick advances tick 7 → 8 and accepted sequence 14 → 15.

These checks establish emulated-browser control behavior only. Touch comfort, physical screen readability, browser chrome, thermal behavior, and real-device GPU performance remain untested.

## Injected storage failure

A separate production context throws `QuotaExceededError` for `astrix:` storage writes. An accepted tick still exists in memory, but:

- `save.status` is `unavailable` and `persistent` is `false`.
- The HUD shows `VOLATILE` and the failure detail.
- The toast is visibly bad and says the latest accepted work is not safely persisted.
- `lastAction` retains the save failure.
- The target localStorage key remains untouched.

This demonstrates honest save-result feedback, not remote persistence or recovery after a lost volatile session.

## Visual inspection

`desktop-genesis.png`, `desktop-ready-crop.png`, `desktop-restored.png`, `mobile-restored-world.png`, `mobile-settlement.png`, and `desktop-save-failure.png` show actual production rendering. Farm crop rows visibly progress from planted to mature, the restored view retains structures and crops, and mobile tabs change the visible interface.

The default framing leaves the farm partially distant/obscured, and the mobile World screenshot includes a large foreground tree obstructing much of the view. These are functional captures, not art approval. Founder architecture, composition, vegetation, and camera presentation still require owner visual review.

## Preserved failures and limitations

Earlier interrupted reads, stale generated-test runs, failed genesis capture, mobile readiness failure, and browser closure remain preserved in the evidence directory. They were not rewritten as successful evidence. During test repair, the initial site-capacity test targeted an unloaded entity and then an invalid farm floor; the final passing test uses the real farm obstructions and valid floor through the existing preparation pipeline.

Passing tests and browser checks do not formally close M002 or approve M003. Independent M002 review, owner art approval, general construction beyond the pinned projects, inhabitants/logistics/population, authenticated shared persistence, ownership/permissions, permissioned Steward operation, and evidence-gated chain evaluation remain open.
