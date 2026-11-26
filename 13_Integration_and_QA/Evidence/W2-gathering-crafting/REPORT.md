# W2 · Gathering, inventory and crafting: stone axe (2026-11-26)

State: committed locally on `deploy/boxd`. **Not pushed and not deployed.** The browser runs used emulated Chromium (software GL) on the local build. **No real phone was used.** Everything below applies to the wilderness scenario only.

## Design as built

**Pickups** (`sim/gathering.ts`) are authoritative records: `{id, kind, x, y, z, qty, rot, variant}`.
- Kinds: `branch`, `loose_stone`, `fiber_plant`, `grass_tuft`, `berry_bush`, `mushroom`. A pile the player dropped is a pickup too (`d:<n>`).
- Generation is a pure function of seed, generator and chunk. It has its own random stream (`hash2i(cx, cz, seed + 7717)`) and its own ids (`p:<cx>,<cz>:<i>`). The cells sit on a 4 m jittered lattice, and every cell draws exactly 5 random numbers, so the result does not depend on load order.
- Pickups are **not** in `world.entities`. `generateEntityChunk`, its random sequence, entity ids, collision, the nature renderer and the W1 spawn check are untouched.
- Placement depends on geography, read only from the base terrain:
  - stones: on stone and gravel (30 % of cells), on sand banks near water (22 %), on slopes, on rocky ground (`rockScore`), and on grass near water;
  - branches: under trees (`forestScore` > 0.25, rising with density);
  - fibre plants and grass tufts: open grass and meadow;
  - berry bushes: the forest edge (forest score 0.15 to 0.6);
  - mushrooms: in the woods (forest score above 0.4);
  - nothing on water columns or snow.
- Quantity per pickup:

  | pickup | units |
  |---|---|
  | branch | 1–2 |
  | stone | 1 |
  | fibre | 2–3 |
  | grass | 2–3 |
  | berries | 2–4 |
  | mushroom | 1 |

**Collection rules.**
- Reach is 3.5 m from the player position given in the command. The prompt uses 3.25 m.
- Carry capacity is 30 by weight. Branch, stone and axe weigh 2, 2 and 3; every other item weighs 1.
- A pickup gives as many units as fit. The rest stays on the ground (`left`).
- A pickup that is fully taken is tombstoned (`taken`). It does not come back on reload.
- Pickups do **not** grow back in W2. Natural replenishment was optional and is left for later.

**Inventory.** `world.wild` holds:
- item counts;
- tools with durability (stone axe 60/60; nothing wears it down in W2);
- the equipped tool;
- hunger. Hunger starts at 25 and rises by 1 every 15 ticks (30 s). Berries take off 6 and a mushroom 10. Hunger has no other effect yet.

**Commands** (`app/wild-commands.ts`), all journaled, strictly validated and replayed:
- `pickup {entityId, at:{x,z} dm}`
- `drop {item, n, at}` (makes a real pile)
- `craft {recipe}`
- `equip {item: 'stone_axe'|'hands'}`
- `eat {item}`
- `upgrade_wilderness {content:2}`

Each one is a single coarse command. Commands do not bump `world.revision`. Reach is checked by the simulation against the reported `at`, the same trust level as the existing `harvest` command. The avatar remains player-local physics.

**Recipes** (`WILD_RECIPES`, data-driven `{id, label, station:'hand', input, output}`):

| recipe | inputs | output |
|---|---|---|
| `stone_axe` | 1 branch + 1 stone + 2 fibre | stone axe |
| `stone_axe_cord` | 1 branch + 1 stone + 1 cord | stone axe |
| `cord` | 2 fibre | 1 cord |
| `grass_cord` | 3 grass | 1 cord |

A recipe with missing inputs is refused (`missing N <item>`) and nothing changes. A craft never makes anything out of nothing.

**Harvest.** `harvest` (tree felling, rock breaking) stays refused in the wilderness, even with the axe equipped: "trees are felled with an axe in W3 (physical felling); breaking rock needs a pickaxe".

**Settlement.** Wilderness commands are rejected with `not_wilderness`, and a settlement journal or snapshot that contains them does not validate.

## Wilderness content versioning

- **Content v1 (W1).** No pickups. A W1 journal has no `wildContent` key and a W1 snapshot has no `wild` block, so both keep their exact bytes. W1 tests now pass `wildContent 1` explicitly and keep the W1 pin `cac927319fa86807` unchanged.
- **Content v2 (W2).** A new wilderness journal records `"wildContent":2` in its header. Its schema-3 snapshot carries a canonical `wild` block (`content, equipped?, hunger, items, left, nextId, piles, taken, tools`). The manifest and params hash are unchanged; the generated pickups are not stored.
  - New genesis pin (seed 1337, generator v2): `3c3a0c8e4090efcf`.
- **Upgrading a W1 world.** A W1 world loads and replays exactly as before. The app then sends one journaled `upgrade_wilderness` command, which accepts only once. After that the world has pickups. A replay of the upgraded journal reproduces it.

## Tests (headless)

`npx tsc --noEmit` is clean. **433 tests pass** (425 + 8 in `tests/w2.gathering.test.ts`), and `npm run build` is OK.

1. **Determinism.**
   - Generation gives the same results in any chunk order, with other seeds generated in between.
   - Ids index the chunk's list.
   - Natural entities and the genesis hash are identical whether or not pickups were generated first, and match a content-v1 world.
2. **Geography.** Pickups never lie on water, mushrooms are only in the woods, at least 85 % of branches are under trees, and all six kinds occur within 200 m.
3. **Settlement.**
   - No pickups, and the v1 genesis is `e659504b056654dc` with the same journal bytes.
   - pickup, craft and upgrade are rejected with `not_wilderness`.
   - A `wild` block in a settlement snapshot is rejected.
   - A pickup in a settlement journal is rejected.
   - All other settlement pins pass in the existing suites unchanged: v1..v8, the v6 and v7 fixtures, and W1.
4. **W1 save fixture** `tests/fixtures/w1-wilderness-save.json`.
   - It was made by the 69296e9 code in a temporary worktree (`.tools/scratch/w1-tree`, removed afterwards), with `BrowserSaveStore` slot w1, seed 1337, generator v2. It holds two saves: 50 ticks (`4e310ec571ac93ee`) and 450 ticks, compacted (`32bcdf4988822936`).
   - Both load as `restored` with the same hash and byte-identical record. The short journal replays from genesis.
   - Before the upgrade, craft is refused with `wilderness` and there are no pickups.
   - After `upgrade_wilderness`, a pickup works, save and reload keep it, and the upgraded journal replays.
5. **Seed-1337 spawn (−82, −172).**
   - Within 40 m: at least 3 branches, 3 stones and 4 fibre.
   - A greedy route (branch 2.5 m, stone, fibre plant) is 23.7 m in total, about 5 s of walking.
   - Craft, equip and durability checked. Harvest is refused with the W3 message.
6. **No axe without materials.** Every recipe is refused at genesis. A branch and a stone alone give "missing 2 plant fibre" with no state or journal change. Unknown recipes and malformed commands are refused.
7. **Reach and capacity.**
   - Picking up from out of reach is refused (`out_of_reach`).
   - Stones fill the bag to 30/30, then the next pickup is refused (`capacity`).
   - A 3-unit plant gives 2 and keeps 1.
   - A dropped pile can be picked up again.
8. **Journal and persistence.**
   - The full flow is pickup ×7, grass cord, axe with cord binding, equip, eat (−6), drop, then 30 ticks, during which hunger rises by 2.
   - Replay from genesis, restore from a mid-run save, save and reload, and restore after compaction all give the same hash.
   - Taken pickups stay gone after reload, and picking one up again is refused (`not_found`).
   - Tampered outcomes, unknown items and an overweight bag are rejected.

## Browser (emulated Chromium, local build `index-CKfTl391.js`, routed `https://astrix.local/`)

**(a) Desktop 1200×700, returning player, world seeded in `astrix:worlds:v1` / `astrix:world:active:v1`.**
- The HUD showed "bag 0/30: empty · bare hands · hunger 27" and "E: pick up branch" at the spawn (`w2-a-spawn.png`).
- I walked with WASD keys steered by a script and pressed E at a branch, a stone and a fibre plant ×3. Each toast read like "picked up 1 stone · bag 4/30".
- I opened the bag with I. Craft was enabled only for the stone axe (`w2-a-bag-before-craft.png`). I clicked Craft, then Equip. The axe shows in the right hand, and the bag lists "stone axe 60/60 in hand", with the other recipes greyed and showing have/need (`w2-a-axe-equipped.png`).
- **Reload:**
  - Items, the axe and the equipped state persisted, and the 3 pickups stayed gone (`taken` in the saved `wild` block).
  - The journal header has `wildContent: 2`, and the command types are tick, pickup, craft and equip.
  - The axe is drawn in the hand after reload (`w2-a-after-reload.png`).

**Time to the first axe.** In a fresh context I measured from the first step at the spawn to the axe equipped: **67 s**.
- Breakdown: branch 2.7 s, stone 32 s, fibre 50 s, then craft and equip.
- The walking was a stop-and-go script on software GL (about 0.4 s key pulses, with a round trip per step), so a person walking straight should be faster: the route is 24 m.

**(b) World list.** `?worlds=1` → New wilderness made w1 with the v2 content, and the pickups worked there (`w2-b-worldlist.png`).
- Known W1 behaviour, not changed here: the reload keeps `?worlds=1`, so the world list stays open over the new world until it is closed.

**(c) Phone 390×844 emulated** (touch, DPR 2, quality auto → low).
- The touch button reads "Pick up", and tapping it picked up the branch.
- The Bag button sits beside Farm (`w2-c-phone-hud.png`).
- The open bag panel spans y 128–537 (`w2-c-phone-bag.png`). The Pick up button (y 664–726), Jump (y 740–820) and the joystick in the lower left stay clear.
- The open panel does cover part of the Home / To banner / Plant pad and the upper part of the left-half move zone, until it is closed with ×.
- No page errors in any run.

## Performance at the wilderness spawn (renderer counters, emulated)

| view | draw calls | triangles | W1, same view |
|---|---|---|---|
| desktop walk (high) | 53–54 | 151–153k | 48 / 146k |
| phone 390×844 (low) | 38–39 | 92k | 31–32 / 82–87k |

All are under the 120 calls / 250k triangles budget.
- Pickups cost up to 7 instanced draws: one per kind plus piles, with no shadow casting. About 140–150 instances are drawn within 48 m, and an instance is 12–60 triangles.
- The held axe is 1 mesh.
- Pickup generation costs about 6 ms per chunk on first use, then comes from a cache.

## Not done / limitations

- Not deployed; no real device.
- No replenishment of branches or grass yet (optional; documented).
- Tools cannot be dropped (items only).
- Hunger has no consequence yet.
- Tree felling with the axe is W3; mining needs a later pickaxe.
- Reach trusts the client-reported position, as `harvest` already does.
- Drawn pickups use the resident terrain height. Pickups are not obstacles, so the player walks through them.

## Live deployment check

Release `20261126T024301Z-6b0c06d` was deployed to https://astrix.nyc.boxd.sh. It is pushed to `deploy/boxd` but not merged to `main`. The served bundle matches the local build (`assets/index-BPPsHnyr.js`).

The check used a fresh headless Chromium (software GL, 1000x600) with an active wilderness world seeded in storage. There were no page errors.

- **World state on load:**
  - wilderness content v2;
  - 18 pickups in range (3 branch, 4 stone, 4 fibre, 4 grass, 3 berry);
  - empty bag;
  - no tools.
- **Render cost:** 54 draw calls and 151,568 triangles.
- **UI:** the Bag button is present.

I did not run the full collect-and-craft flow on the live site. That flow was verified on the local build of the same commit.
