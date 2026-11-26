# W1 · Wilderness scenario and world list (2026-11-26)

State: committed locally on `deploy/boxd`. **Not pushed, not deployed, not merged to `main`.** The browser runs used emulated Chromium (software GL) on the local build. **No real phone or tablet was used.**

## Design as built

- **Scenario field.** `scenario?: 'wilderness'` is on `WorldParams`, `WorldManifest` (and so every `WorldSnapshot`) and `CommandJournal`. The field is written only for a wilderness world. `paramsHash` is `fnv1a(JSON.stringify(params))`, so it includes the key only when the key is present. Settlement journals, snapshots and hashes are unchanged.
- **Starter inventory.** `createJournal(seed, schema, gen, scenario)` and `validateJournal` take the grant from the scenario (`starterInventoryFor`). Settlement keeps `{wood:24, stone:48}`; wilderness is `{}`. A wilderness journal requires schema 3.
- **Gating** (`sim/wilderness.ts`, `app/session.ts`):
  - In a wilderness world, `dispatch` accepts only `tick`. It rejects `found_homestead`, `upgrade_homestead`, `build`, the stockpile, crop, field, site and steward commands, and `harvest`, all with code `wilderness`. `harvest` is refused because bare hands cannot fell trees or break rock; gathering is W2.
  - `validateJournal` refuses a wilderness journal that contains any other command.
  - `GameSession.restore` and `restoreCurrent` refuse a snapshot whose scenario differs from its journal's.
  - `createLifeState('wilderness')` has no founder stockpile. Snapshot validation requires 0 stockpiles, 0 jobs, 0 crops and no homestead in a wilderness snapshot.
  - `placeAuthoredSites` leaves out the waystone, the marker and the cairn, which are human-made. The hero grove, rock, shrub and ore stay, because they are natural.
  - `HomesteadGame.ensureFounded` returns early in a wilderness world. The app also never creates `HomesteadGame`, `M2Game` (founder slice and Build panel), `LifeGame` (founder stockpile panel) or the MagicBlock chain view there.
- **Ticks.** A wilderness world runs one journaled `tick` per tick period, so it keeps a world clock and replays.
- **Spawn.** `wildernessSpawn(seed, gen)` picks a deterministic, pure spot (it uses a scratch world):
  - Candidates lie on a 6 m grid, 150–520 m from the origin and outside `SETTLEMENT_ZONE` (x −130..70, z −110..110). They are visited in an order hashed from the seed.
  - A spot passes if it is dry, nearly flat grass that is open on the spot, with forest within 40 m and water within 44 m.
  - It is then checked on the generated world: at least 8 trees within 30 m, the nearest tree 3–12 m away, and nothing within 3 m. If no spot passes within 40 checks, the checked spot with the most trees is used.
  - Seed 1337 gives (−82, −172) on both generators, about 270 ms.
  - The spot is recorded in the world-list entry. The home banner stands there and is the player's recovery point.
- **New-world seed.** Every new wilderness world uses seed **1337** (the curated terrain) on the latest generator (v2). Each world has its own id (`w1`, `w2`, …) and its own save. `?seed=` is ignored in a wilderness world.
- **UI.**
  - The entry screen (`chain/enter.ts`) gains a "Your worlds" section with these rows:
    - "Continue settlement", or "Open settlement" when this browser has no settlement save.
    - One "Continue wilderness" per wilderness world.
    - "New wilderness".
  - Quick Play, Wallet Play, recovery and Explore offline are unchanged.
  - The same list opens from Settings → Worlds → "Your worlds…", or with `?worlds=1`. That is the way back from a wilderness world, which has no chain view and therefore no entry screen.
  - Opening a world writes the active-world key and reloads.
  - Wilderness HUD:
    - The header reads "ASTrix — Wilderness N · local only".
    - It shows "bag: empty · bare hands".
    - The Farm button is greyed (`aria-disabled`). It explains "no farm yet…".
    - The Gather button and the Settlement/Build drawer are hidden. There is no gather prompt, and E says "bare hands: nothing you can gather yet".

## Save keys

| what | key |
|---|---|
| settlement save (unchanged) | `astrix:m002:v<schema>:seed:<seed>`, e.g. `astrix:m002:v3:seed:1337` |
| wilderness save | `astrix:wild:v3:<id>:seed:<seed>`, e.g. `astrix:wild:v3:w1:seed:1337` |
| world list | `astrix:worlds:v1` (`{v:1, worlds:[{id, seed, generatorVersion, created, spawn}]}`) |
| active world | `astrix:world:active:v1` (`settlement` or a world id; absent = settlement) |
| wilderness avatar / banners / tab lease | settlement key + `:world:<id>` / `astrix:lease:world:<id>`; the settlement's keys are unchanged |

- A slot holds only its own scenario. `parseSave` refuses a mismatched record, and `save()` refuses a session of the other scenario.
- Nothing is deleted. A world-list registry that cannot be read is kept beside the new one, under `astrix:worlds:v1:unreadable:<t>`.

## Tests (headless)

`npx tsc --noEmit` is clean. **425 tests pass** (417 + 8 in `tests/w1.wilderness.test.ts`), and `npm run build` is OK.

1. Settlement byte-identity against pins recorded on `b86c9c0` (a worktree of the pre-W1 tree, same calls), on v1 and v2:
   - journal JSON, `paramsHash` (`2ce2f06e` / `2ce52f05`), genesis hash (`e659504b056654dc` / `75bf55316843348f`);
   - 20 ticks, `found_homestead {rules:8}` and 30 more ticks give the same hashes;
   - journal and snapshot round-trips are byte-identical, and replay gives the same hash.
2. The v6 fixture (`037429c4ffbcf710`) and the v7 fixture (`75eaf4d14533a811`) restore byte-identical as settlement worlds.
3. A wilderness genesis has `scenario` in its journal and manifest, `starterInventory {}`, no stockpile, no homestead, no sites and no cairn, and does have trees, ore and shrubs.
4. `found_homestead`, `upgrade_homestead`, `build`, `harvest` and the stockpile, crop, field and site commands are rejected (`wilderness`) with no state or journal change.
5. Replay is deterministic: 120 ticks pin `cac927319fa86807`. Replay from genesis, restore from a mid-run save, and restore after compaction all give the same hash.
6. Scenario mismatches and tampering are rejected:
   - snapshot vs journal scenario mismatch, both ways;
   - a stripped scenario key or a settlement grant (starter check);
   - a founding inside a wilderness journal;
   - `scenario:'settlement'` or an unknown value;
   - a stockpile in a wilderness snapshot;
   - a removed manifest scenario (params hash).
7. Save keys:
   - the settlement key is unchanged, and the wilderness key is its own;
   - creating, playing, saving and reloading a wilderness world leaves the settlement bytes identical;
   - switching back restores the farm with its hash;
   - a second world gets `w2` and no key is removed;
   - a wilderness record under the settlement key is quarantined, not loaded as a farm.
8. Spawn: deterministic on 4 seeds, outside the settlement zone, on grass, at a forest edge (≥ 8 trees within 30 m), with water ≤ 44 m.

The other pins (v1 `16ca4c350d98096f` … v6 `037429c4ffbcf710`, v7 S3 and v8 pins) are asserted by the existing suites. They all pass unchanged.

## Browser (emulated Chromium, local build `index-DTpyAqEt.js`, routed `https://astrix.local/`)

**(a) Desktop 1200×700, chain on, `?metrics=1&timescale=6`:**
1. A fresh load founded the settlement (`found_homestead {rules:8}`) and ran. Saved key `astrix:m002:v3:seed:1337`: 42 entries, tick 41, 3 villagers, 15 animals, 20,194 bytes.
2. I loaded a fresh context holding only those bytes. The entry screen showed "Continue settlement" and "New wilderness" above Quick Play and Wallet Play (`w1-a-entry.png`).
3. I chose New wilderness and the page reloaded into Wilderness 1:
   - bag `{}`;
   - `homestead`, `m2`, `life` and `chain` are null; 0 structures;
   - no chain, homestead, build or life panel; Farm greyed;
   - wildlife: 39 animals (fox 4, deer 12, rabbit 14, trout 7, wolf 2); 282 trees loaded;
   - the player at (−81.5, −171.5) with the home banner beside them;
   - save key `astrix:wild:v3:w1:seed:1337`.
   - E gave "bare hands: nothing you can gather yet". Farm gave "no farm yet…".
   - Screenshots: `w1-a-wild-walk.png` (lake, trees and a deer in view) and `w1-a-wild-overview.png` (river, lake, forest edge, foxes, deer, ground cover).
   - `w1-a-wild-walk.png` was taken before a HUD fix that removed the "E: gather wood" prompt in the wilderness. Later screenshots are on the final build.
4. On reload, the wilderness restored: the journal continued at 773 accepted commands with the same boundary hash, and the bag stayed empty. Settings → Your worlds listed "Continue settlement", "Wilderness 1 (open now) Continue wilderness" and "New wilderness" (`w1-a-worldlist.png`).
5. I chose Continue settlement.
   - The settlement key bytes were identical to the moment the wilderness opened. This was checked at document start of every load: 4 of 4 wilderness loads and the settlement load.
   - The settlement played on behind the entry screen before the switch, as it always does. That is the only change to its bytes.
   - The farm loaded: rules 8, 3 villagers, 16 animals, bag wood 24 / stone 48, chain panel present (`w1-a-settlement-back.png`).

**(b) Phone 390×844 emulated** (touch, mobile, DPR 2, quality auto → low):
- The entry screen with the world list fits the width (`w1-b-phone-entry.png`).
- The bare HUD (`w1-b-phone-wild.png`) shows the header, "bag: empty · bare hands", the greyed Farm button, Home / To banner / Plant, zoom and Jump. The Gather button and the drawer are hidden. 83 wild animals, no chain.
- No page errors in any run.

## Performance at the wilderness spawn (renderer counters, emulated)

| view | draw calls | triangles |
|---|---|---|
| desktop, walk at spawn (high) | 48 | 143–147k |
| desktop, builder overview of the spawn | 57 | 155k |
| phone 390×844 (low), walk at spawn | 31–32 | 82–87k |

All are under the 120 calls / 250k triangles budget. Breakdown at the desktop spawn: voxel world 29 draws / 85k, fauna 9 / 34k, nature 3 / 15k, ground cover 1 / 11k.

## Not done / limitations

- Not deployed, and no real device.
- Loose pickups, items, tools and crafting are W2. In W1 the wilderness player can walk, swim, plant the banner and return home, and the world ticks. Natural harvesting is refused on purpose.
- Every new wilderness world uses seed 1337, so they share terrain and spawn. A per-world seed needs only a different `create()` argument.
- The sky in a wilderness world follows the local day cycle, not world ticks (unchanged from a settlement without a homestead).
- Wilderness worlds are local only: no MagicBlock registration, wallet, ownership or cost. Putting the scenario on chain is the owner's decision.
