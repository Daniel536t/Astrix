# Phase 3: Current Gameplay Authority Audit

**Date:** 2026-11-27  
**Scope:** Read-only live devnet verification + full codebase authority audit (`deploy/boxd`, commit `1b8705c`).  
**Epistemic labels:** **[ON-CHAIN]** verified live via RPC · **[SRC]** read directly in repository source · **[ANALYSIS]** engineering assessment.

---

## 1. Verified Live Production Devnet State (2026-11-27 08:21 UTC)

All facts below were verified directly against `https://api.devnet.solana.com` (base slot `526,806,281`) and `https://devnet-eu.magicblock.app` (ER slot `1,169,196,294`, `core 2.0.5`, `solana-core 4.2.2`, `git 380360a`) **[ON-CHAIN]**:

| Component | Address / ID | Live State |
|---|---|---|
| Production Program | `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy` | Deployed at slot `526,798,568`, `620,008` bytes, upgrade authority `GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32` |
| Numbered World Slots `0–31` | `["world-slot", admin, [0..31]]` | **32 / 32 on V2** (`876` bytes, `AXv2` magic), all delegated to ER; slots `0–15` and `31` occupied (17), slots `16–30` empty (15) |
| Demo Settlement | `4PV6Ks9yUnfMd54vtmbYobM4RZza3ZtsM6zxczSmaxzw` | **V1 (`240` bytes)** compatibility reference, delegated, live at `tick 140,689` |
| Registry & 32 Passports | `8J8shpq3…FCCx` (`62` B), 32× `332` B | Delegated on ER, layouts unchanged |
| Checkpoint Treasury | `FNdEiiZn8qzx3ZaAQ7WW7QCFyPTRGm3o5DNPJEkexQks` | Delegated; ER balance `1.40985852 SOL`, base balance `0.20085852 SOL` |
| Admin / Payer Wallet | `GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32` | Base devnet balance `14.52679904 SOL` |
| Replacement Clock Cranks (30 s) | `744001` (`cSwi…`), `744101` (`2gRb…`), `744117` (`EZgW…`) | **All 3 running** (`executed`: `33`, `17`, `24`; `0` legacy `742xxx` cranks remain) |
| Checkpoint Cranks (60 s) | `743000`, `743008`, `743016`, `743024` | `743016` running (`overdueSlots: -3,129`); **`743000`, `743008`, `743024` stalled** (see `Phase3_Checkpoint_Crank_Investigation.md`) |

---

## 2. Executive Finding: Authority Gap Summary

**[SRC] / [ANALYSIS]:** ASTrix currently has **two completely disconnected authoritative engines**:
1. **The browser deterministic simulation** (`Game/src/sim/*`, `Game/src/app/session.ts`): Rich, hash-verified, journaled, rule-versioned (settlement v1–v8; wilderness content v1–v9), and strictly separated from Three.js. However, its state lives **100% in browser `localStorage` / IndexedDB** (`Game/src/app/persistence.ts`). It is **client-authoritative**: a user with DevTools can edit local saves or replay forged journals locally without any chain verification.
2. **The Solana / MagicBlock V2 program** (`chain/programs/astrix-settlement/src/lib.rs`, `v2.rs`): Authoritative on devnet ER for world ownership, passkey/wallet/session identity, 8 abstract settlement resource counters (`stock: [u32; 8]`), 9 crop plots, sawmill, VRF genesis/prospecting, world clock (`settle`), and hash-chained journal. However, **`Game/src/chain/chain-view.ts` only renders a side panel for the abstract settlement prototype; zero wilderness or local settlement gameplay actions are sent to the chain** (`HANDOVER.md` §6, verified in `Game/src/app/wild-commands.ts` and `Game/src/app/session.ts`).

---

## 3. System-by-System Classification

| Domain | Subsystem | Source Files **[SRC]** | Classification | Key Findings & Gaps **[SRC] / [ANALYSIS]** |
|---|---|---|---|---|
| **Resources & Inventory** | Item catalogue, weights, bag capacity (`60` in v5+) | `Game/src/sim/gathering.ts` (`WILD_ITEMS` 25 items, `CARRY_CAPACITY_V5`) | **Implemented (client-authoritative)** | Deterministic locally; on-chain `Settlement.stock` only has 8 abstract `u32` counters (`wood, stone, fiber, food, ore, seed, planks, crystal`), not the 25 wilderness items or bag/pile/container locations. |
| | Gathering & depletion (`p:<cx>,<cz>:<i>` pickups) | `Game/src/sim/gathering.ts` (seed + 7717 deterministic chunks, tombstones) | **Implemented (client-authoritative)** | Local sim prevents re-picking tombstoned pickups, but chain has no record of consumed pickup IDs or world-object depletion. |
| | Carrying, dropping, ground piles (`d:N`), storage (`b:N`) | `Game/src/sim/gathering.ts`, `Game/src/sim/wild-build.ts` (`storeItems`, `takeItems`) | **Implemented (client-authoritative)** | Bag weight, drop piles, and storage sheds (300 weight) work locally with snapshot validation; zero on-chain representation. |
| | Reservations & double-spend prevention | `Game/src/sim/reservation.ts` (`planReservation`, `freeOf`), `wild-build.ts` (`reservedOf`), `homestead.ts` | **Implemented (client-authoritative)** | Strong local invariant (`reserved + delivered + consumed = materials`, `free = held - reserved`), shared by settlement and wilderness. **Not enforced on-chain.** |
| | Resource ownership & shared access | `Game/src/sim/wild-build.ts` (single-player) vs `chain/lib.rs` (owner + session key) | **Not implemented (shared)** | Local sim assumes single player (`bag`). On-chain `Settlement` has 1 `owner` + 1 `session_key` (`lib.rs:584`), no multi-player container ACLs or concurrent carrier ledgers. |
| **Tools & Crafting** | Tool ownership, durability, capabilities | `Game/src/sim/gathering.ts` (`TOOL_KINDS`: bow, hammer, knife, stone_axe, stone_pickaxe; `TOOL_DURABILITY`) | **Implemented (client-authoritative)** | Durability decrements per swing/shot locally; no on-chain tool inventory or capability checks. |
| | Recipe validation, stations, crafting output | `Game/src/sim/gathering.ts`, `wild-build.ts` (`stationNear`, `cookAtFire`, `smeltAt`) | **Implemented (client-authoritative)** | Recipes check free (unreserved) materials + station proximity + tool locally. On-chain `harvest()` (`lib.rs:193`) currently trusts client `amount` (1..16) with no tool/node proof! |
| **Construction** | Catalogue, placement, enclosure check | `Game/src/sim/catalogue.ts`, `placement.ts`, `wild-build.ts` (`checkWildSite`, `trapsPlayer`) | **Implemented (client-authoritative)** | Full geometry/slope/water/enclosure validation runs locally. Terrain-level 64×64 flood-fill is too heavy for on-chain SBF; requires compact precondition + commitment model. |
| | Reservations, staged delivery, work swings, cancel | `Game/src/sim/wild-build.ts` (`placeWildSite`, `deliverToSite`, `workOnSite`, `cancelWildSite`, `validateBuild`) | **Implemented (client-authoritative)** | Staged consumption and `swap` delivery are journaled locally; zero on-chain construction sites (on-chain only has boolean `sawmill: bool`). |
| | Building functionality & persistence | `wild-build.ts` (lean-to respawn, campfire fuel/cook, workbench, log store, shed, smelter) | **Implemented (client-authoritative)** | Survives local browser reload; not persisted to Solana/ER. |
| **World Simulation** | Crops, growth, food economy | `Game/src/sim/homestead.ts` (local farm) & `chain/lib.rs` (`plots: [u64; 9]`, `v2.rs:settle_core`) | **Implemented & connected to V2 (abstract settlement only)** | On-chain V2 `settle_core` runs 9-plot crop growth, sawmill, food/population on ER clock. Local settlement & wilderness food/hunger are still local-only. |
| | Tree lifecycle & wood production | `Game/src/sim/felling.ts`, `woodland.ts` (HP, stumps, trunks, logs, regrowth) | **Implemented (client-authoritative)** | Standing tree → stump + fallen trunk → cut into log piles → carried to stockpile. Zero on-chain tree depletion or log provenance. |
| | Mining & finite deposits | `Game/src/sim/deposits.ts`, `mining.ts` (6 deposit types, finite quantities, no regen) | **Implemented (client-authoritative)** | Deterministic deposit generation + local depletion; no on-chain deposit depletion ledger. |
| | Animal identity, needs, lifecycle, hunting | `Game/src/sim/wildlife.ts`, `hunting.ts` (persistent IDs, 5 species, wounds, carcasses, butcher) | **Implemented (client-authoritative)** | Deterministic per-creature state + tombstones locally; too state-heavy for per-tick on-chain updates (requires hybrid authoritative harvest/kill/butcher boundary). |
| | World clock & time-dependent catch-up | `chain/src/v2.rs` (`settle_core`, `MAX_SETTLE_STEPS=300`) & `Game/src/app/sim-clock.ts` | **Implemented in V2 (not yet wired to Game sim)** | V2 ER clock is live on all 32 slots; Game client still runs its own local `sim-clock.ts` independently. |
| **Multiplayer & Governance** | Shared-world ownership & identity | `chain/src/lib.rs` (`Passport`, `owner`, `session_key`, passkey/wallet) & `Game/src/chain/guest.ts` | **Implemented in V2 (single-owner)** | Supports Quick Play, Passkey, Wallet Play, and session keys on ER; no multi-member roles/ACLs yet. |
| | Concurrent actions & conflict resolution | `chain/src/lib.rs` (Solana account write locks) | **Requires architectural changes** | Solana/ER serializes writes to the same account, but fine-grained player inventories + shared stockpiles need split PDAs to avoid write-lock contention. |
| | AI-agent authorization (`steward`) | `Game/src/app/steward.ts` (`actor: 'steward'`, policy gates, cooldowns) | **Implemented (client-authoritative)** | Steward already strictly proposes journaled commands and never invents outcomes (`steward.ts:1-6`), making it architecturally ready for on-chain scoped session-key delegation. |
| | Event journal, replay & recovery | `Game/src/app/session.ts` (local journal) & `chain/src/v2.rs` (`journal_hash`, `RECENT=4`, `JournalEvent`) | **Partially implemented (dual journals)** | Both local sim and V2 chain have hash-chained journals, but they are not linked. V2 tail reserves **128 zero bytes** (`WorldExt.reserved: [u8; 128]`, `v2.rs:134`) specifically for Phase 3 hooks without reallocating `Settlement`. |

---

## 4. Critical Security & Integrity Observations

1. **[SRC] Legacy `harvest()` is trust-based:** In `chain/programs/astrix-settlement/src/lib.rs:193-202`, `harvest(resource, amount)` adds `1..16` units of wood/stone/fiber/ore on client assertion alone—with no source node, no tool check, no depletion, and no cooldown. Phase 3 **must not** extend this pattern to wilderness gameplay (`HANDOVER.md` §8.3: *"Never trust a client report like 'give me 6 logs'"*).
2. **[SRC] `Settlement` V2 account size (876 B) cannot hold full wilderness entity graphs:** A wilderness world has hundreds of pickups, damaged trees, trunks, piles, buildings, deposits, and 200+ wildlife records. Packing these into the 876-byte `Settlement` PDA would immediately overflow Solana's 10 KB CPI realloc limit and cause massive write-lock contention. Phase 3 requires **modular child PDAs** anchored to the existing V2 `Settlement` (using its 128 reserved bytes for roots/counters/versions).
3. **[SRC] Existing deterministic sim is a huge asset:** Because `Game/src/sim/*` already uses integer arithmetic, canonical sorted bags (`reservation.ts`), explicit command allow-lists (`WILDERNESS_COMMANDS`), and deterministic chunk generation from `(world_seed, generator)`, the on-chain program can validate **preconditions, recipes, depletion tombstones, reservations, and state transitions** without needing to run 3D physics or rendering on-chain.
