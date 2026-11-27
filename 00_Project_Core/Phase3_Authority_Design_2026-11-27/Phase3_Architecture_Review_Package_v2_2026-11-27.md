# ASTrix — Phase 3 Architecture Review Package v2 (All 5 Issues Resolved)

**Date:** 2026-11-27  
**Status:** Revised architecture for final pre-implementation sign-off. **Zero code written; zero devnet changes.**  
**Supersedes (while preserving):** `Phase3_Architecture_Review_Package_2026-11-27.md` and the three `*_REVIEW_2026-11-27.md` documents in this directory.  
**Epistemic Labels:** `[Verified in source code]` · `[Verified on devnet]` · `[Demonstrated in isolated experiment]` · `[Architectural proposal]` · `[Assumption]`

---

## Summary of the 5 Resolved Architectural Issues

| # | Issue Identified in v1 Review | Concrete Architectural Resolution in v2 |
|---:|---|---|
| **1** | **Deterministic node verification on SBF** (JS floating-point terrain vs. Rust CU risk) | Commit a deterministic integer **Merkle root (`chunk_nodes_root: [u8; 32]`)** per `ChunkLedger` at chunk init; verify compact Merkle inclusion proofs (depth ≤ 9, `sol_sha256` syscall, ~10–14k CU) on `pickup_node` / `chop_tree`. Zero floating-point terrain on SBF. |
| **2** | **Child-PDA escape hatch & `state_epoch` split-brain** (`lib.rs:883` only supports 5 single-`u8` kinds) | Add generalized `request_child_undelegation` / `rollback_child_undelegation` for all child PDA seed shapes; enforce `child.state_epoch == world_ext.state_epoch` on every ER write; guard `undelegate_worlds` with `active_child_pdas == 0`. |
| **3** | **Quick Play (`0 SOL`) base-layer rent & unbounded PDA growth** | Enforce strict per-world on-chain caps (`MAX_CONTAINERS = 32` with mandatory inactive-pile recycling, `MAX_CHUNKS = 16` in Phase 3.1, `MAX_PLAYERS = 1` in 3.1); sponsor base-layer init/delegation via operator relayer; close & refund all child PDAs to sponsor on `release_world`. |
| **4** | **Orphaned reservations in Phase 3.1 before `BuildSite` (3.3) exists** | Add a dedicated **`ReservationLedger` PDA (`["rsv", world]`, `804` B, 32 active slots)** tracking `(ref_id, source_kind, source_id, item_id, qty, owner)` so `sum(active records) == source.reserved[item]` is an airtight invariant in Phase 3.1 and seamlessly binds `ref_id = site.id` in Phase 3.3. |
| **5** | **ER commit batch ceiling & Hydra crank stalls during undelegation** | Strictly cap every `commit` and `undelegate` intent at **`≤ 2` accounts** (matching devnet-verified 2-slot batches); checkpoint child PDAs via a 2-account round-robin cursor; codify mandatory in-place crank rescheduling after any planned undelegation. |

---

## 1. Resolution 1 — Deterministic Node Verification via Per-Chunk Merkle Root `[Architectural proposal]`

### Why Pure On-Chain Terrain Generation Is Rejected
`Game/src/sim/world.ts` and `terrain-v2.ts` compute elevation, hydrology, forest scores, and rock scores using JavaScript IEEE-754 floating-point math `[Verified in source code]`. Re-implementing floating-point noise in Rust SBF risks both CU exhaustion and 1-ULP rounding divergence between browser and chain.

### Authoritative Design
1. **Canonical Leaf Encoding (20 bytes, little-endian):**
   ```text
   leaf_bytes = [
     node_kind: u8,        // 0 = Pickup, 1 = Tree
     node_idx: u16,        // 0..255 (Pickup) or 0..511 (Tree)
     x_dm: i32,            // world X in decimetres
     z_dm: i32,            // world Z in decimetres
     item_or_species: u8,  // PICKUP_ITEM u8 (if Pickup) or TreeSpecies u8 (if Tree)
     stage: u8,            // 0 (if Pickup) or TreeStage u8 (if Tree)
     max_hp: u8,           // 1 (if Pickup) or tree HP from species/stage
     yield_qty: u8,        // 1 (if Pickup) or TIMBER[species][stage] logs
     cuts_needed: u8,      // 0 (if Pickup) or trunk cut swings
     _pad: [u8; 4]         // zero
   ]
   leaf_hash = sha256(b"ASTRIX_NODE_V1" || world_seed_le32 || cx_le16 || cz_le16 || leaf_bytes)
   ```
2. **Root Commitment (`init_chunk`):** When a `ChunkLedger` PDA is initialized on base devnet, the authorized chunk-manifest builder (deterministic pure function of `(world_seed, generator_version, cx, cz)`) supplies `chunk_nodes_root: [u8; 32]`, signed by the operator relayer (or world admin). `chunk_nodes_root` is **immutable** once initialized.
3. **On-Chain Proof Verification (`pickup_node` / `chop_tree`):**
   - Client passes `leaf: NodeLeaf` (20 B) + `proof: Vec<[u8; 32]>` (depth ≤ 9 = ≤ 288 B).
   - Program hashes `leaf` via Solana's native `sol_sha256` syscall, walks `proof` to compute root, and checks `computed_root == chunk.chunk_nodes_root` (~`10k–14k` CU `[Assumption]`, zero floating-point math).
   - Program then checks `dist(player_dm, (leaf.x_dm, leaf.z_dm)) <= reach`, checks tombstone bit (`pickup_depleted[idx] == 0` or `tree_felled[idx] == 0`), and executes the state transition.
4. **Security Guarantee:** A client cannot invent a tree, inflate log yield, alter HP, or move a node closer—any 1-bit tamper fails the Merkle root check.

---

## 2. Resolution 2 — Child-PDA Escape Hatch, Delegation Sync & `state_epoch` Fence `[Architectural proposal]`

### Generalized Escape Hatch Instructions
Extend `lib.rs:883-960` `[Verified in source code]` with two base-layer admin instructions supporting every Phase 3 child PDA:
```rust
pub mod child_kind {
    pub const INVENTORY: u8 = 10;    // seeds: ["inv", world, seed_a(player_32)]
    pub const CONTAINER: u8 = 11;    // seeds: ["cont", world, seed_b(id_u32_le)]
    pub const CHUNK: u8     = 12;    // seeds: ["chunk", world, seed_b(cx_i16_le || cz_i16_le)]
    pub const RESERVATION: u8 = 13;  // seeds: ["rsv", world]
    pub const SITE: u8      = 14;    // seeds: ["site", world, seed_b(id_u32_le)] (Phase 3.3)
}

pub fn request_child_undelegation(
    ctx: Context<RequestChildUndelegationCtx>,
    kind: u8, world: Pubkey, seed_a: [u8; 32], seed_b: u32
) -> Result<()>

pub fn rollback_child_undelegation(
    ctx: Context<RollbackChildUndelegationCtx>,
    kind: u8, world: Pubkey, seed_a: [u8; 32], seed_b: u32
) -> Result<()>
```
- `rollback_child_undelegation` saves raw bytes before DLP CPI, restores them after `UndelegateWithRollbackAfterTimeout` (identical to proven `lib.rs:922-949` `[Demonstrated in isolated experiment: Test C]`), and sets `child.state_epoch = world_ext.state_epoch` (requiring `world` to be passed read-only on base layer).

### `state_epoch` Fencing & Safe World Undelegation
- **Epoch Fence:** Every mutating Phase 3 ER instruction checks `require!(child.state_epoch == world_ext.state_epoch, AstrixError::EpochMismatch)` for every child PDA passed. If `world` underwent an emergency rollback (`state_epoch += 1`), no stale ER child PDA can execute against it.
- **Undelegation Guard:** `WorldExt.reserved[0..32]` tracks `active_child_pdas: u16` (incremented on `delegate_child`, decremented on `undelegate_children`). `undelegate_worlds` rejects undelegating a Phase 3 world while `active_child_pdas > 0` unless an explicit admin `force: bool` is set, preventing accidental cross-layer split-brain.

---

## 3. Resolution 3 — Quick Play (`0 SOL`) Rent Funding, Hard Caps & Rent Reclamation `[Architectural proposal]`

| Resource | Phase 3.1 Hard Cap / World | Max Rent + Delegation / World `[Assumption]` | Lifecycle & Anti-Spam Rule |
|---|---:|---:|---|
| `PlayerInventory` | `1` (owner) | `0.0061` SOL | Created once on world link (`init_inventory` + `delegate_inventory`). |
| `ReservationLedger` | `1` / world | `0.0099` SOL | Created once on world link (`init_reservations` + `delegate_reservations`). |
| `Container` (piles/stockpiles) | **`32`** (`MAX_CONTAINERS`) | `0.1853` SOL (worst-case all 32) | Emptied ground piles flip `active = false` and **must be reused** before allocating a new ID. |
| `ChunkLedger` | **`16`** (`MAX_CHUNKS`) | `0.1278` SOL (worst-case all 16) | Spawn chunk pre-funded; adjacent chunks only initialized when within 1 chunk of an existing chunk. |
| **Worst-Case Total / World** | **50 PDAs max** | **`~0.329 SOL` max** *(typical early play: `~0.036 SOL` for 1 inv + 1 rsv + 1 chunk + 2 containers)* | **All rent is reclaimed on `release_world`:** undelegated child PDAs are closed via `close_child_pda` returning lamports directly to `sponsor: Pubkey` (stored in `WorldExt.reserved[16..48]`? No — stored in `rent_sponsor: Pubkey` inside each child PDA or derived from `registry.admin`, returning 100% of rent to the operator relayer!). |

- **Zero-SOL Quick Play UX:** The operator relayer sponsors base-layer `init_*` + `delegate_*` txs (rate-limited per world by the hard caps above and by `ChunkLedger` adjacency). Once delegated, **100% of gameplay transactions run on ER at `0 SOL` fee** `[Verified on devnet]`.

---

## 4. Resolution 4 — Self-Contained `ReservationLedger` PDA (`["rsv", world]`) `[Architectural proposal]`

To guarantee zero orphaned reservations in Phase 3.1 (before `BuildSite` exists in Phase 3.3), add a single per-world `ReservationLedger` PDA:

- **Seeds:** `["rsv", world]`
- **Exact Size:** **`804` bytes** (`8` disc + `32` world + `1` bump + `1` version + `4` state_epoch + `2` active_count + `736` records[`32 × 23` B] + `20` reserved_pad)
- **Record Struct (`23` bytes):**
  ```rust
  pub struct ReservationRecord {
      pub active: u8,       // 1  (0 = empty slot, 1 = active)
      pub ref_id: u32,      // 4  (opaque project/site ID; bound to BuildSite.id in Phase 3.3)
      pub source_kind: u8,  // 1  (0 = PlayerInventory, 1 = Container)
      pub source_id: u32,   // 4  (0 for Bag, or Container.id)
      pub item_id: u8,      // 1  (0..24 canonical WILD_ITEMS ID)
      pub qty: u16,         // 2  (> 0)
      pub created_tick: u64,// 8  (world.tick when reserved)
      pub _pad: [u8; 2],    // 2
  }
  ```
- **Airtight Invariant:**
  - `reserve_resources(ref_id, source, item_id, qty, nonce)`: Write-locks `ReservationLedger` + `source`. Checks `source.items[item_id] - source.reserved[item_id] >= qty`, writes an active `ReservationRecord`, and increments `source.reserved[item_id] += qty` atomically.
  - `release_reservation(ref_id, source, item_id, nonce)`: Write-locks `ReservationLedger` + `source`. Finds matching active record, clears `active = 0`, and decrements `source.reserved[item_id] -= record.qty` atomically.
  - `transfer_reserved(ref_id, from_source, to_bag, item_id, qty, nonce)`: Moves reserved units (`forSite` semantics from `wild-build.ts`) while atomically updating `ReservationRecord.source_kind/source_id`, `from.items/reserved -= qty`, and `to.items/reserved += qty` — preserving conservation and reservation backing at every step!
  - **Result:** `sum(active ReservationRecord.qty for (source, item)) == source.reserved[item]` holds unconditionally across Phase 3.1 and Phase 3.3.

---

## 5. Resolution 5 — Strict `≤ 2`-Account Commit Batching & Crank Stall Prevention `[Architectural proposal]`

1. **Hard `≤ 2`-Account Batch Limit:** Every `MagicIntentBundleBuilder::commit` and `commit_and_undelegate` call in Phase 3 is capped at **`≤ 2` accounts per intent** (matching the 2-account batch size proven across all 31 devnet slot migrations `[Verified on devnet]`).
2. **Round-Robin Child Checkpointing:** `checkpoint()` continues committing `(world, passport)` (2 accounts). A companion `checkpoint_children()` commits at most **2** dirty child PDAs per trigger (e.g., `(PlayerInventory, ReservationLedger)` then `(Container_i, ChunkLedger_j)`), avoiding oversized intents and bounding per-commit CU and treasury fees.
3. **Crank-Safe Maintenance Rule:** Any planned undelegation of delegated worlds or child PDAs covered by Hydra cranks (`743xxx` / `744xxx`) is always followed by an immediate, verified in-place reschedule of the affected crank task IDs once re-delegation completes, eliminating silent Hydra back-off stalls.

---

## 6. Revised Exact Account Layout Table (Phase 3.1 Final Spec)

| Account | Seeds | Exact Bytes | `WorldExt` Link | Escape Hatch Kind |
|---|---|---:|---|---|
| **`Settlement` V2** *(existing, unchanged)* | `["world-slot", admin, [i]]` | **`876` B** | `WorldExt.reserved[0..32]` = `P3Header` | `kind = 2` (existing) |
| **`PlayerInventory`** | `["inv", world, player]` | **`284` B** | `world: Pubkey`, `state_epoch: u32` | `child_kind = 10` |
| **`Container`** | `["cont", world, id_u32_le]` | **`244` B** | `world: Pubkey`, `state_epoch: u32` | `child_kind = 11` |
| **`ChunkLedger`** | `["chunk", world, cx_i16_le, cz_i16_le]` | **`592` B** *(+32 B for `chunk_nodes_root: [u8; 32]`)* | `world: Pubkey`, `state_epoch: u32`, `chunk_nodes_root: [u8; 32]` | `child_kind = 12` |
| **`ReservationLedger`** | `["rsv", world]` | **`804` B** | `world: Pubkey`, `state_epoch: u32` | `child_kind = 13` |

---

## 7. Revised Phase 3.1 Scope & Go/No-Go

- **Included in Phase 3.1 (Isolated Local LiteSVM + Fresh Disposable Devnet Program Only):**
  - `WorldExt.reserved[0..32]` `P3Header` + `PlayerInventory` (`284` B), `Container` (`244` B, recycled pool, cap 32), `ChunkLedger` (`592` B, Merkle `chunk_nodes_root`, cap 16), `ReservationLedger` (`804` B, 32 active slots).
  - Source-verified 25-item + 5-tool taxonomy (`Game/src/sim/gathering.ts:71-119`).
  - Instructions: `init_inventory`, `init_container`, `init_chunk`, `init_reservations`, `delegate_child`, `undelegate_children` (≤ 2/tx), `close_child_pda`, `pickup_node` (Merkle proof), `chop_tree` (Merkle proof), `cut_trunk`, `drop_item`, `transfer_item`, `mark_stockpile`, `reserve_resources`, `release_reservation`, `transfer_reserved`, `request_child_undelegation`, `rollback_child_undelegation`.
  - All 11 mandatory test scenarios + Merkle CU benchmark + child-PDA escape-hatch test on LiteSVM and disposable devnet program (closed afterwards to reclaim rent).
- **Explicitly Excluded:** Crafting (`3.2`), Construction (`3.3`), Crops/Food (`3.4`), Wildlife (`3.5`), Mining (`3.6`), Multiplayer (`3.7`), AI execution (`3.8`), **production `Gge4…` deployment**, and **mainnet**.
- **Recommendation:** All 5 architectural blockers from v1 are now resolved on paper. Ready for your explicit approval to:
  1. *(Independent, `0 SOL`)* Reschedule stalled checkpoint cranks `743000`, `743008`, `743024` in place.
  2. Authorize **Phase 3.1** implementation strictly in an isolated local + disposable devnet environment.
