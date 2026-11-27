# Phase 3: Phased Implementation Roadmap

**Date:** 2026-11-27  
**Status:** **[PROPOSAL]** — Sequencing and engineering estimates for Phases 3.1–3.8. All CU and SOL figures marked **[MEASURED]** (from Phase 2 devnet/pilot runs) or **[ESTIMATED]**.

---

## 1. Guiding Constraint: Minimize Upgrades & Zero Re-Migration of V2 Worlds

- All 32 numbered devnet worlds are already `876`-byte V2 accounts (`AXv2`) with `128` reserved zero bytes (`WorldExt.reserved`).
- **Zero further world-account migrations** are required across Phases 3.1–3.8: every new subsystem uses **modular child PDAs** seeded by `world` and anchored to `WorldExt.reserved[0..32]` (`economy_version`, entity counters, capability roots).
- Program upgrades are grouped into **at most 2–3 well-tested releases** (e.g., Release 3A = Phases 3.1–3.3 core economy/crafting/construction; Release 3B = Phases 3.4–3.6 world economy/wildlife/mining; Release 3C = Phases 3.7–3.8 multiplayer/AI governance), each validated first on an isolated disposable devnet program ID before touching `Gge4…`.

---

## 2. Eight-Phase Integration Sequence

| Phase | Target System | Existing Systems Reused **[SRC]** | New PDAs & Instructions **[PROPOSAL]** | Est. CU / Tx **[ESTIMATED]** | Base Rent / World **[ESTIMATED]** | Dependencies & Acceptance Gate |
|---|---|---|---|---:|---:|---|
| **3.1** | **Resources & Inventory** *(First target)* | `sim/gathering.ts` (25 items, weights, cap 60), `sim/felling.ts` (tree HP, `SWINGS_PER_TICK=4`), `sim/reservation.ts` (`freeOf`), V2 `settle` & `JournalEvent` | PDAs: `PlayerInventory` (~256 B), `Container` (~224 B), `ChunkLedger` (~640 B). Ix: `init_inventory`, `pickup_node`, `chop_tree`, `cut_trunk`, `drop_item`, `transfer_item`, `mark_stockpile` | `12k–28k` CU (ER tx fee `0`) | `~0.012 SOL` (1 inv + 1 spawn chunk + 2 containers + delegations) | Disposable devnet program; all 11 mandatory tests in `Phase3_Testing_and_Acceptance_Plan.md` pass; zero double-spend or fabricated logs. |
| **3.2** | **Tools & Crafting** | `sim/gathering.ts` (`TOOL_KINDS`, `TOOL_DURABILITY`, hand recipes), `sim/wild-build.ts` (`stationNear`, workbench recipes, campfire cook) | Reuse `PlayerInventory.tools[6]`. Ix: `equip_tool`, `craft_item(recipe_id, station_site_id?)`, `cook_item(site_id, item_id)` | `10k–20k` CU | `0 SOL` (no new PDA) | Depends on 3.1. Recipe inputs verified against `free` bag items; tool durability decremented atomically; forged output rejected. |
| **3.3** | **Construction** | `sim/catalogue.ts`, `sim/wild-build.ts` (`placeWildSite`, `deliverToSite`, `swap`, `workOnSite`, `cancelWildSite`, `claimShelter`), `sim/reservation.ts` | PDA: `BuildSite` (~512 B). Ix: `place_site`, `deliver_site` (with `swap`), `work_site`, `cancel_site`, `claim_shelter`, `fuel_fire` | `18k–45k` CU (scales with source count ≤ 4) | `~0.005 SOL` / site | Depends on 3.1 + 3.2. `reserved + delivered + consumed == materials` invariant verified; concurrent reservation conflict test passes; reload/undelegate preserves site state. |
| **3.4** | **Production, Crops & Food Economy** | `chain/src/v2.rs` (`settle_core`, 9 plots, sawmill), `sim/homestead.ts`, `sim/wild-build.ts` (smelter timers, campfire fuel burn) | Reuse V2 `Settlement` clock (`settle`) + `BuildSite` fuel/smelt fields. Ix: `smelt_start`, `smelt_collect`, `eat_food`, `plant_wild_crop`, `harvest_wild_crop` | `15k–30k` CU (plus `settle` up to `44k` CU **[MEASURED]**) | `0 SOL` | Depends on 3.3. Time-dependent smelting & crop maturity driven solely by ER `Clock` sysvar; disconnect/reconnect catch-up verified. |
| **3.5** | **Wildlife & Animal Lifecycle** | `sim/wildlife.ts` (persistent IDs, 5 species), `sim/hunting.ts` (bow/arrow, wounds, stuns, carcasses, knife butchering) | Extend `ChunkLedger` with `wildlife_killed: [u8; 32]` tombstone bitset + bounded `Carcass` records (8 slots). Ix: `record_hunt_kill`, `butcher_carcass` | `14k–25k` CU | `0 SOL` (inside `ChunkLedger`) | Depends on 3.1 + 3.2. Killed animals stay dead across reloads; carcasses yield exact deterministic meat/hide/bone once only; knife durability enforced. |
| **3.6** | **Mining & Resource Deposits** | `sim/deposits.ts` (6 deposit types), `sim/mining.ts` (`MINE_SWINGS`, finite quantities, no regen) | Extend `ChunkLedger` with `deposits_remaining: [u8; 16]` per chunk. Ix: `mine_deposit(cx, cz, dep_idx, swings)` | `14k–24k` CU | `0 SOL` | Depends on 3.1 + 3.2 + 3.4. Pickaxe capability + durability enforced; finite deposit reaches `0` and refuses further mining permanently. |
| **3.7** | **Shared Multiplayer Economy** | `chain/src/lib.rs` (`Passport`, `owner`, `session_key`), `Container.owner` ACLs | PDA: `WorldMembership` (`["member", world, player]`, ~128 B, role bitmask). Ix: `grant_member`, `revoke_member`, `set_container_acl` | `10k–18k` CU | `~0.002 SOL` / member | Depends on 3.1–3.3. Two distinct signers concurrently reserving from one shared stockpile: Solana write-lock serializes cleanly, zero double-spend. |
| **3.8** | **AI-Agent Planning & Governed Execution** | `Game/src/app/steward.ts` (pure proposal function, policy gates, cooldowns), `chain/src/lib.rs` session key pattern | PDA: `AgentCapability` (`["agent", world, agent_pk]`, ~160 B: allowed ix bitmask, per-tick budget, expiry). Ix: `grant_agent_cap`, `revoke_agent_cap`, `agent_propose_exec` | `12k–22k` CU | `~0.002 SOL` / agent | Depends on 3.1–3.7. AI steward acts only within owner-granted capability bitmask; unauthorized actions rejected on-chain; instant 1-tx revocation verified. |

---

## 3. Performance, Scalability & Cost Summary

- **ER Latency & Throughput:** On `devnet-eu.magicblock.app` (`core 2.0.5`), ER transactions are **fee-free (`0 SOL`)** **[MEASURED]** and confirm in **~50–150 ms**. Batching swing work to ≤ 1 ER tx per 2 s world tick keeps peak load under **0.5 tx/s per active player**, well within ER capacity.
- **Write-Lock Contention Mitigation:** Because `PlayerInventory`, `Container`, `ChunkLedger`, and `BuildSite` are **separate PDAs**, two players chopping trees in different chunks or managing separate bags execute **in parallel** on the ER without locking each other's accounts. Contention occurs *only* when two players target the exact same `Container` or `BuildSite`—which is precisely where serialization is required to prevent double-spending.
- **Client Render Budget Preserved:** Zero Three.js or render-loop changes are required in `Game/src/sim/*`; the browser render budget (**< 120 draw calls, < 250k triangles**, `HANDOVER.md` §9) remains untouched.
- **Live Browser Panel Integration (Parallel UI Task in 3.1):** Wire `Game/src/chain/chain-view.ts` to display live V2 fields (`world_tick`, `seed_origin`, `journal_seq`, last VRF result, connection status) for linked worlds while keeping local-only saves untouched.

---

## 4. Failure & Recovery Strategy Across All Phases

1. **ER Disconnect:** Client re-subscribes to ER WebSocket, fetches `PlayerInventory.action_nonce` + active PDAs, reconciles local mirror, and resumes with zero lost world time (`settle`).
2. **Checkpoint Stalls (Lesson Learned from Phase 2):** Any future undelegation of delegated PDAs must follow the migrate-then-reschedule crank discipline so Hydra cranks never stall indefinitely.
3. **Validator Unresponsive:** The Phase 2 escape hatch (`request_undelegation` → 9,000-slot timeout → `rollback_undelegation`, verified live on devnet in Test C) extends cleanly to child PDAs (`kind` enum extended for `PlayerInventory`, `Container`, `BuildSite`, `ChunkLedger`).
