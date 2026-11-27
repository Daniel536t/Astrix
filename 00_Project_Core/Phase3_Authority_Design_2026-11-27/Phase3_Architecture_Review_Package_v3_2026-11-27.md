# ASTrix — Phase 3 Architecture Review Package v3 (Design-Only Correction)

**Date:** 2026-11-27  
**Status:** Design-only v3 correction addressing all 7 review findings from v2. **Zero code written; zero devnet changes; Phase 3.1 and checkpoint crank recovery remain UNAPPROVED.**  
**History Preserved:** `Phase3_Architecture_Review_Package_2026-11-27.md` (v1) and `Phase3_Architecture_Review_Package_v2_2026-11-27.md` (v2) are preserved untouched in `00_Project_Core/Phase3_Authority_Design_2026-11-27/`.  
**Epistemic Labels:** `[Verified in source code]` · `[Verified on devnet]` · `[Demonstrated in isolated experiment]` · `[Architectural proposal]` · `[Assumption — Unverified Until Isolated Benchmark]` · `[Unknown]`

---

## Resolution Index (All 7 v2 Review Issues Addressed)

| # | v2 Review Issue | v3 Design Resolution |
|---:|---|---|
| **1** | Player position (`player_dm`) not authenticated / reach bypass | Authoritative anchor `(last_x_dm, last_z_dm, last_pos_tick)` on `PlayerInventory` + ER-clock travel-speed envelope (`RUN_SPEED = 7.5 m/s` = `150 dm/tick`) + reach check, with explicit trust-boundary disclosure (§1). |
| **2** | Merkle proof depth (`9`) inconsistent with `256 + 512 = 768` leaves | **Two separate fixed-depth Merkle trees** in `ChunkLedger`: `pickup_root` (depth **8**, $2^8 = 256$ leaves) and `tree_root` (depth **9**, $2^9 = 512$ leaves) with domain-separated inner/leaf/empty hashes (§2). |
| **3** | `≤ 2`-account limit overstated as a protocol ceiling | Explicitly reframed as an **observed successful operational batch size** on devnet ER `2.0.5`, distinct from the `[Unknown]` protocol ceiling (§3). |
| **4** | Incomplete child-account discovery (`active_child_pdas` is only a count) | Added base-layer **`WorldChildIndex` PDA (`["idx", world]`, `248` B, never delegated)** enumerating every child PDA deterministically for `release_world`, rent reclamation, and offline-validator recovery (§4). |
| **5** | Ambiguous partial reservation transfer semantics in `transfer_reserved` | Defined exact **split-or-merge** rules (Case A full move/merge, Case B partial split with invariant proof) (§5). |
| **6** | Overbroad automatic crank-rescheduling rule | Replaced with a **strictly inspection-gated, approval-gated** maintenance procedure; stalled `743000`/`743008`/`743024` remain a separate unapproved decision (§6). |
| **7** | Unmeasured cost/CU figures mixed with verified claims | Isolated all unmeasured rent, delegation, and CU estimates into a dedicated `[Assumption — Unverified Until Isolated Benchmark]` table (§7). |

---

## 1. Player Position Validation & Honest Trust Boundary `[Architectural proposal]`

### Why Reach Alone Is Insufficient
Checking `dist(player_dm, node_dm) <= reach` alone fails if the client can freely submit any `player_dm`.

### Authoritative Movement-Envelope Enforcement
1. **State Stored on `PlayerInventory`:**
   - `last_x_dm: i32`, `last_z_dm: i32` — initialized deterministically at the world's authoritative spawn coordinates (`spawn_x_dm, spawn_z_dm`) on `init_inventory`.
   - `last_pos_tick: u64` — initialized to `world.tick` on `init_inventory`.
2. **Source-Verified Speed Limit:** `Game/src/sim/character.ts:33-34` defines `WALK_SPEED = 4.2 m/s` and `RUN_SPEED = 7.5 m/s` `[Verified in source code]`. At `2 s/tick`, maximum legitimate travel is **`MAX_SPEED_DM_PER_TICK = 150` dm/tick** (`15.0 m/tick`), plus a bounded rounding/latency margin `STEP_MARGIN_DM = 20` dm (`2.0 m`).
3. **Mandatory Dual Spatial Check on Every Spatial Instruction (`pickup_node`, `chop_tree`, `cut_trunk`, `transfer_item`, `drop_item`, `mark_stockpile`):**
   ```text
   // 1. Advance world clock authoritatively from ER Clock sysvar
   settle(world)
   dt_ticks = max(1, world.tick - inv.last_pos_tick)

   // 2. Travel-speed envelope (anti-teleport)
   max_travel_dm = min(MAX_TRAVEL_CAP_DM, dt_ticks * 150 + 20)
   require!(dist_sq((inv.last_x_dm, inv.last_z_dm), (req.x_dm, req.z_dm)) <= max_travel_dm^2, TeleportRejected)

   // 3. Spatial reach to target node / container
   require!(dist_sq((req.x_dm, req.z_dm), (target.x_dm, target.z_dm)) <= REACH_DM^2, OutOfReach)

   // 4. Commit new authoritative position anchor
   inv.last_x_dm = req.x_dm; inv.last_z_dm = req.z_dm; inv.last_pos_tick = world.tick;
   ```
   *(Reach constants `[Verified in source code]`: `CHOP_REACH = 25 dm` (`2.5 m`, `felling.ts:50`), container/pickup reach `35 dm` (`3.5 m`, `wild-build.ts`).)*

### Explicit Trust-Boundary Disclosure (No Overclaiming)
- **What IS cryptographically/authoritatively prevented:** Instant teleport-harvesting across chunks, harvesting two distant nodes in the same tick, claiming interaction without paying real elapsed ER-clock travel time from the last authoritative anchor, and forging node coordinates/yields.
- **What IS NOT enforced on-chain (accepted client-trust boundary):** Between two valid anchor points within the `7.5 m/s` speed envelope, the SBF program does **not** run 3D terrain slope, cliff, water, or building collision. A modified client could move in a straight line at sprint speed across a cliff or river between valid anchors. Full 3D collision remains local presentation; economic integrity is protected by depletion tombstones, tool durability, `SWINGS_PER_TICK = 4`, and real-time travel envelopes.

---

## 2. Mathematically Consistent Dual-Tree Merkle Specification `[Architectural proposal]`

Instead of a single 768-leaf tree (which requires depth 10), `ChunkLedger` stores **two separate fixed-depth binary Merkle roots**, matching the exact bitset capacities:

| Tree | Root Field in `ChunkLedger` | Leaf Count | Fixed Depth | Proof Size | `sol_sha256` Calls / Proof | Depletion Bitset |
|---|---|---:|---:|---:|---:|---|
| **Pickup Tree** | `pickup_root: [u8; 32]` | $2^8 = \mathbf{256}$ (`idx 0..255`) | **8** | `8 × 32 = 256` B | `9` (1 leaf + 8 inner) | `pickup_depleted: [u8; 32]` (`256` bits) |
| **Tree Tree** | `tree_root: [u8; 32]` | $2^9 = \mathbf{512}$ (`idx 0..511`) | **9** | `9 × 32 = 288` B | `10` (1 leaf + 9 inner) | `tree_felled: [u8; 64]` (`512` bits) |

- **Domain Separation (Second-Preimage Resistant):**
  - Occupied leaf: `sha256(b"ASTRIX_LEAF_V1" || world_seed_le32 || cx_le16 || cz_le16 || tree_tag_u8 || leaf_bytes_20)`
  - Empty slot (`idx >= actual_node_count`): `sha256(b"ASTRIX_EMPTY_V1")`
  - Internal node: `sha256(b"ASTRIX_INNER_V1" || left_32 || right_32)` (left/right determined strictly by bit `d` of `leaf.node_idx`, so the proof is purely `[u8; 32]` siblings with zero direction-bit ambiguity).
- **Updated `ChunkLedger` Exact Size:** **`624` bytes** (`8` disc + `32` world + `2` cx + `2` cz + `1` bump + `1` version + `4` state_epoch + `32` pickup_root + `32` tree_root + `32` pickup_depleted + `64` tree_felled + `1` trunk_count + `1` damaged_count + `224` trunks[`16×14` B] + `128` damaged[`16×8` B] + `60` reserved_pad).

---

## 3. Honest Classification of the `≤ 2`-Account Batch Policy

- **Observed operational fact `[Verified on devnet]`:** Batching **2** accounts per `commit_and_undelegate` intent succeeded across all 31 slot migrations on `devnet-eu.magicblock.app` (`core 2.0.5`).
- **Observed local failure `[Demonstrated in isolated experiment: PHASE2 REPORT §8.4]`:** A 10-account commit intent failed buffer preparation on local ER `2.0.3`.
- **Protocol ceiling `[Unknown]`:** The exact maximum accounts per commit/undelegation intent on devnet ER `2.0.5` has **not** been empirically measured.
- **Policy:** Phase 3.1 uses `≤ 2` accounts per intent strictly as a **conservative operational policy**, not a claimed protocol maximum. Higher batch sizes (e.g., 3–4 accounts) may optionally be benchmarked on a disposable devnet program before Phase 3.3.

---

## 4. Complete Child-Account Discovery & Recovery (`WorldChildIndex`) `[Architectural proposal]`

`active_child_pdas: u16` in `WorldExt.reserved` is only a counter, not a discovery index. To guarantee **100% authoritative enumeration** even if the ER validator is completely offline, Phase 3.1 adds a single **base-layer-only (NEVER delegated)** index PDA per world:

### `WorldChildIndex` PDA — Seeds: `["idx", world]` — Exact Size: **`276` bytes**
```rust
#[account]
pub struct WorldChildIndex {
    pub world: Pubkey,              // 32 — owning V2 world
    pub bump: u8,                   // 1
    pub version: u8,                // 1
    pub rent_sponsor: Pubkey,       // 32 — receives refunded lamports on close_child_pda
    pub inv_count: u8,              // 1  (<= 4; Phase 3.1 cap = 1)
    pub inv_players: [Pubkey; 4],   // 128 — exact player keys for ["inv", world, player]
    pub has_reservations: bool,     // 1  — true if ["rsv", world] exists
    pub max_container_id: u32,      // 4  — contiguous IDs 0..max_container_id (<= 32)
    pub chunk_count: u8,            // 1  (<= 16 in Phase 3.1)
    pub chunks: [(i16, i16); 16],   // 64 — exact (cx, cz) for ["chunk", world, cx, cz]
    pub _pad: [u8; 3],              // 3
}
// Total: 8 (disc) + 32 + 1 + 1 + 32 + 1 + 128 + 1 + 4 + 1 + 64 + 3 = 276 bytes
```

- **Why Base-Layer-Only Is Critical:** Every child PDA is created (`init_*`) and closed (`close_child_pda`) on Solana **base layer**, which atomically registers/unregisters it in `WorldChildIndex`. Because `WorldChildIndex` is **never delegated to ER**, it remains 100% readable on Solana base devnet even if the ER validator crashes or disappears permanently.

### Complete `release_world` Procedure (Guaranteed Zero Leaked Child PDAs or Rent)
1. Read `WorldChildIndex` (`["idx", world]`) on Solana base devnet.
2. Deterministically derive every child PDA address:
   - `inv_players[0..inv_count]` → `["inv", world, player]`
   - if `has_reservations` → `["rsv", world]`
   - `0..max_container_id` → `["cont", world, id_le32]`
   - `chunks[0..chunk_count]` → `["chunk", world, cx_le16, cz_le16]`
3. Undelegate every currently delegated child PDA in batches of `≤ 2` (`undelegate_children` on ER), waiting until each account's base owner equals `Gge4…`.
4. Call `close_child_pda` on base devnet for every child PDA, transferring 100% of its rent lamports to `WorldChildIndex.rent_sponsor` and decrementing `WorldChildIndex` entries.
5. Verify `inv_count == 0 && !has_reservations && max_container_id == 0 && chunk_count == 0`, then close `WorldChildIndex` (refunding its rent to `rent_sponsor`) and verify `world` has `active_child_pdas == 0`.
6. Optional off-chain cross-check: `getProgramAccounts(Gge4…, memcmp(offset=8, world))` on both base and ER confirms **0 remaining child accounts** before calling `release_world`.

### Complete Offline-Validator Emergency Recovery Procedure
1. Read `WorldChildIndex` on base devnet (always available, never delegated).
2. Call `request_undelegation` on `world` + `request_child_undelegation` on every delegated child PDA enumerated by `WorldChildIndex`.
3. Wait 9,000 Solana slots (~60 min).
4. Call `rollback_undelegation` on `world` (`state_epoch += 1`, `ROLLBACK` journaled).
5. Call `rollback_child_undelegation` on every child PDA enumerated by `WorldChildIndex`, restoring each child's last base-layer snapshot and syncing `child.state_epoch = world_ext.state_epoch`.

---

## 5. Exact Partial Reservation Transfer Semantics (`transfer_reserved`) `[Architectural proposal]`

Given `transfer_reserved(ref_id: u32, from_source, to_source, item_id: u8, qty: u16, nonce: u64)`:
1. **Preconditions:** `qty > 0`, `from_source.key() != to_source.key()`, active `ReservationRecord` `R` exists matching `(ref_id, from_source, item_id)` with `R.qty >= qty`, `from_source.items[item_id] >= qty`, `from_source.reserved[item_id] >= qty`, and `to_source` weight + `qty * ITEM_WEIGHT[item_id] <= to_source.capacity`.
2. **Record Transition (Deterministic Split-or-Merge):**
   - **Case A — Full transfer (`qty == R.qty`):**
     - If an active record `R_dst` already exists for `(ref_id, to_source, item_id)`: `R_dst.qty = R_dst.qty.checked_add(qty)?`; deactivate `R` (`R.active = 0`, `ledger.active_count -= 1`).
     - Else: update `R.source_kind` and `R.source_id` in place to `to_source` (`active_count` unchanged).
   - **Case B — Partial transfer (`qty < R.qty`):**
     - Decrement `R.qty -= qty` (remains active on `from_source` with `R.qty > 0`).
     - If an active record `R_dst` already exists for `(ref_id, to_source, item_id)`: `R_dst.qty = R_dst.qty.checked_add(qty)?`.
     - Else: require a free slot in `ReservationLedger` (`active_count < 32`, else abort atomically with `ReservationLedgerFull`) and insert `ReservationRecord { active: 1, ref_id, source: to_source, item_id, qty, created_tick: world.tick }`, `active_count += 1`.
3. **Atomic Balance & Reserved Update:**
   - `from_source.items[item_id] -= qty`; `from_source.reserved[item_id] -= qty`.
   - `to_source.items[item_id] += qty`; `to_source.reserved[item_id] += qty`.
4. **Conservation Invariant Proof:** In both Case A and Case B, `sum(active records for (S, item)) == S.reserved[item]` and `from.items[item] + to.items[item]` are strictly preserved across the single atomic instruction.

---

## 6. Scoped Checkpoint Maintenance Procedure (No Automatic Rescheduling)

- **Controlled Maintenance Policy:** Any planned undelegation of accounts covered by Hydra cranks (`743xxx` or `744xxx`) **must NOT** trigger automatic or blind rescheduling. Instead, operators must:
  1. Run read-only `crank-inventory.ts` and `getSignaturesForAddress` on every crank covering the undelegated accounts.
  2. Verify the exact scheduled instruction discriminator, account list, `overdueSlots`, and failure error code (e.g., `Immutable` coinciding with the undelegation slot window).
  3. Obtain explicit approval for the specific task IDs before running in-place rescheduling, and verify post-recovery execution.
- **Current Stalled Cranks (`743000`, `743008`, `743024`):** Remain **UNAPPROVED** and untouched; their recovery is a separate operational decision from Phase 3.1.

---

## 7. Unverified Assumptions Pending Isolated Benchmark

All figures below are **`[Assumption — Unverified Until Isolated Benchmark]`** and must be measured in LiteSVM and/or on the isolated disposable devnet program before any production rollout decision:

| Claim / Parameter | Current Estimate | Must Be Measured In |
|---|---:|---|
| `pickup_node` (depth-8 Merkle) & `chop_tree` (depth-9 Merkle) CU | `~10k–16k` CU | LiteSVM unit benchmark |
| `WorldChildIndex` (`276` B) base rent (never delegated) | `~0.00281` SOL | Disposable devnet deploy |
| `PlayerInventory` (`284` B) rent + delegation deposit | `~0.00287` + `0.00320` SOL | Disposable devnet deploy |
| `Container` (`244` B) rent + delegation deposit | `~0.00259` + `0.00320` SOL | Disposable devnet deploy |
| `ChunkLedger` (`624` B) rent + delegation deposit | `~0.00523` + `0.00320` SOL | Disposable devnet deploy |
| `ReservationLedger` (`804` B) rent + delegation deposit | `~0.00649` + `0.00320` SOL | Disposable devnet deploy |
| Worst-case 50-PDA world funding (`1 inv + 1 rsv + 1 idx + 32 cont + 16 chunk`) | `~0.339` SOL max *(early play `~0.040` SOL)* | Disposable devnet deploy |
| Exact max accounts per commit/undelegation intent on ER `2.0.5` | `≥ 2` (`2` `[Verified on devnet]`; ceiling `[Unknown]`) | Optional disposable ER test |

---

## 8. Final Phase 3.1 Account Summary & Approval Status

| Account | Seeds | Exact Bytes | Layer |
|---|---|---:|---|
| `Settlement` V2 *(existing, unchanged)* | `["world-slot", admin, [i]]` | `876` B | Delegated (ER) |
| `WorldChildIndex` | `["idx", world]` | **`276` B** | **Base-layer only (never delegated)** |
| `PlayerInventory` | `["inv", world, player]` | **`284` B** | Delegated (ER) |
| `Container` | `["cont", world, id_u32_le]` | **`244` B** | Delegated (ER) |
| `ChunkLedger` | `["chunk", world, cx_i16_le, cz_i16_le]` | **`624` B** | Delegated (ER) |
| `ReservationLedger` | `["rsv", world]` | **`804` B** | Delegated (ER) |

**Stopped here with zero code written and zero devnet changes.** Awaiting your review of v3 before deciding on:
1. Isolated **Phase 3.1** implementation (local LiteSVM + disposable devnet program only; production `Gge4…` untouched).
2. *(Separate decision)* In-place recovery of stalled checkpoint cranks `743000`, `743008`, and `743024`.
