# ASTrix — Phase 3 Architecture Review Package (2026-11-27)

**Purpose:** Consolidated independent architectural review package prior to authorizing **Phase 3.1 (Resources & Inventory)** in an isolated local + disposable devnet environment.  
**Companion Review Copies (in this directory):**
- `Phase3_Authoritative_Architecture_Proposal_REVIEW_2026-11-27.md`
- `Phase3_Resource_and_Inventory_Integration_Design_REVIEW_2026-11-27.md`
- `Phase3_Checkpoint_Crank_Investigation_REVIEW_2026-11-27.md`
- *(Original audit & design drafts preserved untouched alongside them.)*

**Epistemic Labels Used Throughout:**
`[Verified in source code]` · `[Verified on devnet]` · `[Demonstrated in isolated experiment]` · `[Architectural proposal]` · `[Assumption]` · `[Unknown]`

---

## 1. Executive Summary

1. **Production Devnet Baseline Is Stable:** All 32 numbered devnet worlds (`0–31`) run V2 (`876` B, `AXv2`) on `devnet-eu.magicblock.app` (`core 2.0.5`), the V1 demo settlement (`4PV6…`) remains intact (`240` B), and all three 30 s replacement clock cranks (`744001`, `744101`, `744117`) are healthy `[Verified on devnet]`.
2. **Three Checkpoint Cranks (`743000`, `743008`, `743024`) Are Stalled:** All three failed with `InstructionError: [idx, "Immutable"]` during the ~4–6 s slot-undelegation windows of the Phase 2 rollout. World time is unaffected, treasury holds `1.4099 SOL`, and in-place recovery costs **`0 SOL`** `[Verified on devnet]`. Recommended as a standalone operational approval **before** Phase 3.1.
3. **Architecture Is Feasible With Three Explicitly Bounded Risks:** Storing Phase 3 state in modular child PDAs (`PlayerInventory`, `Container`, `ChunkLedger`, `BuildSite`) anchored to `WorldExt.reserved[0..32]` avoids any further V2 world-account migration `[Verified in source code & Architectural proposal]`. However, three design gaps caught during this review **must** be addressed inside Phase 3.1 before any production rollout:
   - Generalized child-PDA escape hatch (`request_child_undelegation` / `rollback_child_undelegation`) and `state_epoch` sync guard.
   - Deterministic node verification (pure SBF integer hash vs. Merkle chunk-root proof) CU-benchmarked in LiteSVM.
   - Inactive `Container` PDA slot reuse + operator-funded base-layer rent path for Quick Play (`0 SOL`) users.
4. **Recommendation:** **CONDITIONAL GO** for **isolated Phase 3.1 (Resources & Inventory only)** on LiteSVM + a fresh disposable devnet program ID, subject to the strict scope boundary in §9. **NO-GO** for any production `Gge4…` upgrade until Phase 3.1 passes all 11 mandatory integration tests and receives separate review.

---

## 2. Verified Architectural Facts

| Fact | Evidence | Label |
|---|---|---|
| `V1_LEN = 240` B, `V2_LEN = 876` B, `EXT_MAGIC = b"AXv2"`, `WorldExt.reserved = [u8; 128]` (`offset 748..876`, zero-initialized) | `chain/programs/astrix-settlement/src/v2.rs:19-22,134,144` | `[Verified in source code]` |
| All 32 numbered slots (`0–31`) are `876` B (`AXv2`) delegated on ER; demo settlement `4PV6…` is `240` B V1; admin balance `14.5268 SOL`; treasury ER `1.4099 SOL` | Live RPC `devnet-eu.magicblock.app` (slot `1,169,196,294`) & `api.devnet.solana.com` (slot `526,806,281`) | `[Verified on devnet]` |
| Existing escape hatch `request_undelegation(kind: u8, index: u8)` only supports 5 fixed kinds (`0..4`) with a single `u8` index | `chain/programs/astrix-settlement/src/lib.rs:883-960` | `[Verified in source code]` |
| Real MagicBlock VRF callbacks (`claim_world_vrf` `7,574` CU, `prospect` `7,806` CU), exact 876 B undelegation hash preservation, and 9,000-slot offline-validator `rollback_undelegation` (`state_epoch: 0→1`) work on devnet ER `2.0.5` | Phase 2 disposable experiment (`Htjs5…`, closed) & pilot slot 31 (`CFAs…`) | `[Demonstrated in isolated experiment]` & `[Verified on devnet]` |
| 25 `WILD_ITEMS`, 5 `TOOL_KINDS`, exact `ITEM_WEIGHT` & `TOOL_DURABILITY`, `CARRY_CAPACITY_V5 = 60`, `SWINGS_PER_TICK = 4`, `CHOP_REACH = 2.5 m` | `Game/src/sim/gathering.ts:71-119`, `Game/src/sim/felling.ts:50-52` | `[Verified in source code]` |
| 8 weights corrected from initial draft (`chest=8`, `sand=2`, `gravel=2`, `iron_ingot=3`, `copper_ingot=3`, `hide=3`, `knife=1`, `bow=2`) | `Game/src/sim/gathering.ts:104-111` | `[Verified in source code]` |
| Local simulation (`Game/src/sim/*`) has zero Three.js imports and is 100% client-authoritative; zero wilderness actions currently hit the chain | `Game/src/app/wild-commands.ts`, `Game/src/chain/chain-view.ts` | `[Verified in source code]` |

---

## 3. Proposed Architecture & Exact Account Layouts `[Architectural proposal]`

- **Separation:** Three.js + `explore.ts` handle rendering, 60 fps interpolation, locomotion, animations, sound, and ghost previews. MagicBlock ER (`astrix-settlement` + child PDAs) is authoritative for ownership, resource existence, inventory/container balances, reservations, depletion, tool durability, world time, and hash-chained `JournalEvent`s.
- **Zero V2 Re-Migration:** `WorldExt.reserved[0..32]` holds `P3Header` (`economy_version`, `next_container_id`, `next_site_id`, `active_child_pdas`, `active_players`, `flags`). All Phase 3 state lives in delegated child PDAs bound to `world.key()` and `world.state_epoch`:

| Child PDA | Seeds | Exact Size | Max Capacity | Est. Rent + Delegation `[Assumption]` |
|---|---|---:|---|---:|
| **`PlayerInventory`** | `["inv", world, player]` | **`284` B** | Bag wt `60`, 32 items (`u16`), 6 tools, `action_nonce: u64` | `~0.00287` + `0.00320` SOL |
| **`Container`** | `["cont", world, id_u32_le]` | **`244` B** | Pile `60` / Stockpile `600` / Shed `300`; inactive piles recycled | `~0.00259` + `0.00320` SOL |
| **`ChunkLedger`** | `["chunk", world, cx_i16_le, cz_i16_le]` | **`560` B** | 256 pickups, 512 trees, 16 trunks, 16 damaged trees / 64×64 m chunk | `~0.00479` + `0.00320` SOL |
| **`BuildSite`** *(Phase 3.3)* | `["site", world, id_u32_le]` | **`388` B** | 12 `(source, item, qty)` reservations + delivered/consumed | `~0.00359` + `0.00320` SOL |

---

## 4. Instruction Flow & 10 Resource Conservation Invariants `[Architectural proposal]`

Every action follows **`Observe → Decide → Propose → Authorize → Execute → Verify → Record`**:
- **Tree → Logs → Bag → Stockpile → Reservation → Cabin:** `chop_tree` (rate-limited ≤ 4 swings/tick, verifies `stone_axe` durability & `tree_felled[idx]==0`) → `FallenTrunk` → `cut_trunk` (creates `Container(GroundPile)` with deterministic yield) → `transfer_item` (pile → bag, checks weight ≤ 60) → `transfer_item` (bag → stockpile `Container`) → `reserve_resources` (write-locks `Container`, checks `free = items - reserved >= qty`, increments `reserved` atomically) → *(Phase 3.3)* `deliver_site` & `work_site`.
- **All 10 Invariants Enforced On-Chain:** (1) No client-asserted minting; (2) No double-spend (Solana write-lock + `free = items - reserved`); (3) `reserved <= items` always; (4) Atomic rollback on any error `[Verified on devnet]`; (5) Checked `sub`/`add` conservation on transfer (`src != dst`); (6) Authoritative bag/container weight caps; (7) Reach + tool capability + durability + swing rate checked; (8) Depletion bitsets prevent re-harvest; (9) Strict monotonic `action_nonce == inv.action_nonce + 1` prevents replay/duplicate outputs; (10) Hash-chained `JournalEvent` appended on every mutation.

---

## 5. Checkpoint Crank Findings (`743000`, `743008`, `743024`) `[Verified on devnet]`

- All 3 cranks run 8× `checkpoint` (`d5c813ccf08fb8fc`) every `6,000` ER slots (~60 s) and stalled with `InstructionError: [idx, "Immutable"]` during the ~4–6 s undelegation windows of the Phase 2 rollout (`743000` last OK `XLZUkTQb…`, last fail `5UAyVMph…`; `743008` last OK `BjCPxKmS…`, last fail `3TrBo5TL…`; `743024` last OK `2xQNNkJR…`, last fail `67kmsTD8…`). `743016` kept running.
- World time is unaffected (`744xxx` running). Hourly base-layer commits are paused for the 17 occupied worlds (`0–15`, `31`).
- **Recommended standalone action (0 SOL tx cost, uses existing `1.4099 SOL` ER treasury):** In-place atomic rescheduling (`schedule-checkpoints 0 743000 60000`, `8 743008 60000`, `24 743024 60000`) **before** Phase 3.1.

---

## 6. Architectural Risks & Unresolved Questions

### Critical Blockers (Must Be Solved in Phase 3.1 Design/Prototype Before Any Production Rollout)
1. **Deterministic node verification on SBF `[Assumption]`:** Porting integer `hash2i`/`mulberry32` node derivation vs. Merkle chunk-root proof must be CU-benchmarked in LiteSVM (target `< 30k` CU).
2. **Child-PDA escape hatch & epoch sync `[Verified in source code: lib.rs:883]`:** Existing `(kind: u8, index: u8)` escape hatch cannot recover multi-seed child PDAs; must add `request_child_undelegation` / `rollback_child_undelegation` and enforce `child.state_epoch == world.state_epoch`.
3. **Quick Play (`0 SOL`) base-layer rent for lazy child PDAs `[Unknown]`:** Players without SOL cannot pay base-layer `init` + delegation rent for new `ChunkLedger` / `Container` PDAs. Requires an operator-funded relayer or pre-funded world-rent pool with anti-spam bounds.

### Manageable Engineering Risks
4. **Rent growth from ground piles:** Mitigated by recycling inactive `Container` PDAs (`active = false`) before allocating new IDs `[Architectural proposal]`.
5. **Commit batch size on ER `2.0.5` `[Unknown]`:** Keep checkpoint/undelegation batches ≤ 2–3 accounts per intent (2-slot batches `[Verified on devnet]`).
6. **Account-lock contention:** Mitigated by per-player `PlayerInventory` + per-chunk `ChunkLedger` + per-`Container` PDAs (only contending on shared targets).
7. **Journal growth & replay cost:** On-chain keeps O(1) 32-byte `journal_hash` + 4-entry ring (`v2.rs:105`); full history streams from `JournalEvent` logs.
8. **Compatibility with existing local saves:** Keep local-only `localStorage` saves (`HANDOVER.md` §2) strictly isolated from MagicBlock-linked ER worlds.
9. **Rollback compatibility:** Phase 3.1 adds new instructions & child PDAs without altering the 876-byte `Settlement` V2 layout or V1 `240`-byte prefix, preserving rollback safety.

---

## 7. Exact Phase 3.1 Approval Boundary (Resources & Inventory Only)

### INCLUDED in Phase 3.1 (Isolated Local + Disposable Devnet Program Only)
- Canonical 25-item + 5-tool taxonomy with source-verified weights & capacities.
- `PlayerInventory` (`284` B), `Container` (`244` B, with inactive pile recycling), and `ChunkLedger` (`560` B) PDAs + `WorldExt.reserved[0..32]` header.
- Instructions: `init_inventory`, `init_container`, `init_chunk`, `pickup_node`, `chop_tree`, `cut_trunk`, `drop_item`, `transfer_item`, `mark_stockpile`, `reserve_resources`, `release_reservation`, `request_child_undelegation`, `rollback_child_undelegation`.
- Strict `action_nonce` idempotency, `free = items - reserved` double-spend prevention, tool durability & swing-rate enforcement, `JournalEvent` emission, and LiteSVM + disposable devnet tests for all 11 mandatory scenarios.

### EXPLICITLY EXCLUDED from Phase 3.1 (Deferred to Future Phases)
- Crafting (`3.2`) · Construction stages/building execution (`3.3`) · Crops & food production (`3.4`) · Animal lifecycle & hunting (`3.5`) · Mining & deposits (`3.6`) · Multiplayer ACL rollout (`3.7`) · AI-agent execution (`3.8`) · **Any production `Gge4…` deployment** · **Any mainnet activity**.

---

## 8. Go / No-Go Recommendation

- **Checkpoint Cranks (`743000`, `743008`, `743024`):** **GO (separate 0-SOL operational approval)** to restore hourly base-layer checkpoints before Phase 3.1.
- **Phase 3.1 (Isolated Local + Disposable Devnet Prototype):** **CONDITIONAL GO** — authorize implementing Phase 3.1 strictly within the §7 scope boundary, benchmarking deterministic node verification in LiteSVM first, and verifying all 11 mandatory scenarios on a fresh disposable devnet program ID (closed afterwards to reclaim rent).
- **Production `Gge4…` Phase 3 Upgrade:** **NO-GO** until Phase 3.1 isolated verification passes and is separately reviewed and approved.
