# ASTrix wilderness start: architecture direction (proposal, 2026-11-25)

Philosophy: **From one pair of hands to a civilization.** Wilderness → Survival → Crafting → Settlement → Civilization.

Status: proposal for owner approval. Nothing here is implemented. Code facts come from the STAB-001 architecture review of the current code.

## 1. The layers as they exist in code

No document names six layers, so these are derived from the code. Governance currently lives inside the simulation core and can count as part of layer 2.

| # | Layer | Main files | Role |
|---|---|---|---|
| 1 | World generation | `sim/world.ts` (`createWorld`, `generateEntityChunk`, `REGIONS`, `forestScore`/`rockScore`), `sim/terrain-v2.ts`, `sim/hydrology.ts` | Deterministic terrain, water and entities from seed + generator version |
| 2 | Simulation core and governance | `sim/world.ts` (entities, `cutEntity`), `economy.ts`, `homestead.ts` (villagers, livestock, steward `propose`/`permitted`), `buildings.ts`, `nav.ts`, `woodland.ts`, `forestry.ts`, `fauna.ts`, `character.ts` | Authoritative rules. No three.js imports (checked by grep). |
| 3 | Session, journal, persistence | `app/session.ts` (single write boundary, `Command` union, journal, compaction), `sim/snapshot.ts`, `sim/canonical.ts`, `app/persistence.ts` | Journaled, replayable, hashed state |
| 4 | Render | `render/*` | Presentation only |
| 5 | App / UI | `main.ts`, `app/explore.ts`, `app/homestead.ts`, `app/build-mode.ts`, `app/touch-controls.ts`, `ui/*` | Input, panels, HUD |
| 6 | Chain (MagicBlock) | `chain/identity.ts`, `chain/settlement.ts`, `chain/enter.ts` | Passport, world slots, commitments. Optional: the game runs without it. |

The pipeline **Observe → Decide → Propose → Authorize → Execute → Verify → Record** maps onto these layers as follows:
- Observe: the UI and agents, from sim state.
- Propose and Authorize: commands and steward `propose`/`permitted`.
- Execute and Verify: sim rules plus `validateCommand`.
- Record: the journal and the hash.

## 2. Scenario: wilderness beside the preserved settlement

- **New field:** an optional `scenario: 'wilderness'` on `CommandJournal`, `WorldManifest` and `WorldSnapshot`. It is omitted for the settlement scenario, so every existing journal, snapshot and hash stays byte-identical. This is the same pattern already used for `generatorVersion` v1. `paramsHash` includes the key only when it is not the default.
- **Starting inventory:** `createJournal` and `validateJournal` take the starter inventory from the scenario. Settlement worlds keep `{wood:24, stone:48}`; wilderness starts empty.
- **Gating for wilderness:**
  - `ensureFounded()` (`app/homestead.ts`) does not run.
  - `found_homestead` and `upgrade_homestead` are rejected.
  - The founder stockpile, M002 layout, authored founder sites and founder UI are absent.
- **Save slots:** a new world gets its own save key. **Your current settlement world is kept as it is and stays loadable from a world list.** "Reset mine" becomes "start a new wilderness world". Nothing is deleted. Archiving or removing the old world later is your explicit choice.
- **Chain:** wilderness worlds start **local only**, as Quick Play does today. Recording a wilderness world on MagicBlock means putting the scenario into the committed bytes or the account layout. That touches identity and ownership, so it is a decision for you before it is built.

## 3. New systems mapped onto the layers

| System | Layer 1 generation | Layer 2 simulation | Layer 3 journal and save | Layer 4 render | Layer 5 UI |
|---|---|---|---|---|---|
| Loose pickups (branch, stone, fibre, edible plants) | New entity kinds from a **separate RNG stream** and id namespace, wilderness only | `pickup` rule: reach, capacity | `pickup` command; removal tombstones | Instanced per kind | Tap or E to pick up |
| Inventory and tools | – | Items with kind and durability, beside the count bags; tools in hand | Saved in the snapshot | Tool in hand | Inventory panel |
| Crafting | – | Recipes reuse the `RECIPES`/`ProductionJob` pattern, with station requirements (hand, workbench, campfire, forge) | `craft` command | – | Craft menu |
| Tree felling | – | Tree HP; swing validated by tool, reach and cooldown; on felling, a **trunk** entity is added; `cut_log` creates **log** entities; carry and drop; M013 lifecycle keeps stump and regrowth | Coarse commands: `chop` (one per swing, rate-limited), `cut_log`, `pickup`, `drop`, `deliver`. Events: CHOP_STARTED, TREE_DAMAGED, TREE_FELLED, TRUNK_CREATED, LOGS_CREATED, LOGS_COLLECTED, LOGS_DELIVERED | Shake by damage state; fall animation; trunk and log meshes | Swing button; target ring |
| Build anywhere | – | Split `checkBuilding` into a scenario-neutral core (terrain, slope, water, overlap, trees, reachability) plus homestead-only predicates; player settlement container; **player does the construction work** at first; catalogue of id, category, cost, prerequisites, footprint, stages, work, function, model | `place_site`, `approve_site`, `build_work` | Construction stages | M014 build mode, reused |
| Navigation and routes | – | Current nav is a 120 m window around the farmhouse. Needs a **coarse chunk graph plus local windows** (hierarchical A*) for world-scale routes; local windows around each settlement | Routes are derived, not saved | Trail ribbon in the world | Map route line |
| Map | Pure functions already exist: `baseHeightAt`, `baseTopMaterialFor`, `hydrologyFor`, `REGIONS` | Named places generated by rules (ore where rockScore and stone are high, clay at river margins); discovery | Discovery saved | Minimap texture cached per chunk | Minimap, full map, waypoints |
| Deposits and mining | Deposit records from rockScore and hydrology (iron, copper, coal, clay, sand, gravel) with finite quantity | `mine` rule; no regeneration; processing chain ore → crushed ore → smelt → ingot | Commands and remaining quantity | Deposit models | Mining interaction |
| Persistent wildlife | Ambient spawn per chunk stays | Implement the **authoritative tier** already designed in the `fauna.ts` header: promotion on interaction (hit, stun, bait); tick-stepped; kill tombstones per chunk so killed animals do not respawn | `promote_creature`, `shoot`, `butcher`, `place_bait`, `tame`, `mount` | Carcass, stun state, mount pose | Aim controls (desktop and mobile separately) |
| Hunting | – | Projectile simulated in the sim with the arc integrated at a fixed step; hit test against creature bodies; damage; death leaves a carcass entity; stun is a separate recoverable state | Journaled shot (origin, direction, power) | Arrow flight is presentation of the sim result | Hold, drag, release on touch; mouse on desktop |
| Taming and horses | – | Trust per creature from food preference and repeated bait events; species temperament; horse riding with stamina and terrain speed | Saved | Riding pose | Mount and dismount |
| Livestock acquisition | – | Trade and breeding; domestication only where biologically appropriate (wild boar does not become a pig by feeding) | Commands | – | Trading post |
| Settlers and stewards | – | Reuse the homestead villager, job, nav and steward code after STAB-002, unlocked by shelter, food surplus and storage | Existing commands | Existing | Recruit |

## 4. Milestone dependency plan

1. **STAB-002**: stabilization, settlement rules v7 (animals, bodies and presence, priorities, speed). **M015 run 2** goes alongside it, on your device.
2. **W1, scenario and world list**: the scenario field, a new save slot, a world list ("Continue settlement" / "New wilderness"), the bare start, and no auto-founding. Old saves get exact-hash tests.
3. **W2, gathering, inventory, crafting**: loose pickups, item inventory, hand recipes, and the stone axe within about 2 minutes of play.
4. **W3, physical felling**: chop, damage, shake, fall, trunk, logs, carry, deliver. The M013 stump and regrowth rules continue.
5. **W4, build anywhere**: neutral validator, catalogue (lean-to, campfire, workbench, storage), player-built construction, functions (campfire cooks, workbench crafts, lean-to is shelter and a respawn point).
6. **W5, world navigation and map**: hierarchical nav, minimap, full map, discovery, waypoint routes and trail. Needed before deposits and far travel make sense.
7. **W6, deposits, mining, processing**: deposits, pickaxe, smelting chain, forge.
8. **W7, persistent wildlife and animal minds**: the authoritative fauna tier, needs, awareness, collision through the STAB-002 rules.
9. **W8, hunting**: bow, projectiles, carcass, butchering, stun.
10. **W9, taming and horses**: bait trust, temperaments, riding.
11. **W10, trade and settlers**: trading post, livestock acquisition, recruiting settlers and stewards into the reused homestead systems.
12. **Birds and other new species**: only after M015 passes and the reference sheets are in the repo.

Later investigations, not scheduled: seasons, skill by doing, organic trails, shared worlds.

## 5. Risks, migration and performance

- **Determinism:** new generation must not change the existing `generateEntityChunk` random sequence or entity ids. Use separate RNG streams and gate them on the scenario.
- **Journal size:** per-swing and per-step commands inflate journals. Use coarse, rate-limited commands. Compaction already exists.
- **Save size:** logs, pickups, carcasses and tombstones add records. Each needs caps, and despawn rules for decorative leftovers.
- **Navigation scale:** world-scale routes are the largest new engine piece (W5). An approximate map line is not acceptable, as you ruled.
- **Persistent wildlife cost:** only promoted creatures are tick-stepped in the sim. Ambient ones stay cheap.
- **Performance:** every milestone measures both chain=0 and chain-on, at each quality level, against 120 calls and 250k triangles. Pickups and logs are instanced. The minimap is cached. Mobile aiming controls need your device for acceptance.
- **Decisions needed from you:**
  1. Wilderness on MagicBlock (identity and ownership).
  2. Barter or coins at the trading post.
  3. Whether the lean-to counts as a respawn point. I'd propose yes.
