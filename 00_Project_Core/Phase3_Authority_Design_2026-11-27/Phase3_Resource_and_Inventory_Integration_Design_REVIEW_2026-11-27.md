# Phase 3: Resource and Inventory Integration Design (Review Copy)

**Date:** 2026-11-27  
**Status:** Review copy prepared for independent architectural sign-off. Original draft preserved at `Phase3_Resource_and_Inventory_Integration_Design.md`.  
**Corrections from source verification:** 8 item/tool weights corrected directly from `Game/src/sim/gathering.ts:104-111` (`chest=8`, `sand=2`, `gravel=2`, `iron_ingot=3`, `copper_ingot=3`, `hide=3`, `knife=1`, `bow=2`).  
**Labels:** `[Verified in source code]` · `[Verified on devnet]` · `[Demonstrated in isolated experiment]` · `[Architectural proposal]` · `[Assumption]` · `[Unknown]`

---

## 1. Verified Canonical Resource & Tool Taxonomy

All 25 items and 5 tools verified 1:1 against `Game/src/sim/gathering.ts:71-119` `[Verified in source code]`:

| `u8` ID | Key (`WILD_ITEMS`) | Verified Weight (`ITEM_WEIGHT`) | `u8` ID | Key (`WILD_ITEMS`) | Verified Weight (`ITEM_WEIGHT`) |
|---:|---|---:|---:|---|---:|
| `0` | `branch` | **2** | `13` | `gravel` | **2** *(corrected)* |
| `1` | `stone` | **2** | `14` | `iron_ore` | **4** |
| `2` | `fiber` | **1** | `15` | `copper_ore` | **4** |
| `3` | `grass` | **1** | `16` | `coal` | **2** |
| `4` | `berries` | **1** | `17` | `iron_ingot` | **3** *(corrected)* |
| `5` | `mushroom` | **1** | `18` | `copper_ingot` | **3** *(corrected)* |
| `6` | `cord` | **1** | `19` | `raw_meat` | **2** |
| `7` | `log` | **9** | `20` | `cooked_meat` | **2** |
| `8` | `plank` | **3** | `21` | `hide` | **3** *(corrected)* |
| `9` | `chest` | **8** *(corrected)* | `22` | `bone` | **1** |
| `10` | `cooked_mushroom` | **1** | `23` | `arrow` | **1** |
| `11` | `clay` | **3** | `24` | `blunt_arrow` | **1** |
| `12` | `sand` | **2** *(corrected)* | `25..31` | *(reserved zero)* | — |

**Verified Tools (`TOOL_KINDS`, `TOOL_DURABILITY`, `ITEM_WEIGHT`, `gathering.ts:80-110`) `[Verified in source code]`:**
`0 = stone_axe` (dur `60`, wt `3`) · `1 = hammer` (dur `80`, wt `3`) · `2 = knife` (dur `40`, wt `1` *(corrected)*) · `3 = stone_pickaxe` (dur `60`, wt `4`) · `4 = bow` (dur `150`, wt `2` *(corrected)*).  
**Bag capacity:** `CARRY_CAPACITY_V5 = 60` `[Verified in source code: gathering.ts:119]`.

---

## 2. Exact Serialized Account Layouts, Sizes, Seeds, Rent & Lifecycle `[Architectural proposal]`

Rent calculations use the Solana devnet rent rate measured in Phase 2 (`~6,960 lamports/byte` for small accounts: `(128 + size) * 6960`, or exact `getMinimumBalanceForRentExemption`) `[Assumption / Estimated from Solana rent formula]`.

| Account | Seeds (Program `Gge4…`) | Exact Bytes (incl. 8 B Anchor disc) | Authority / Owner | Max Capacity | Est. Rent + Delegation Deposit | Init / Close / Upgrade Rules |
|---|---|---:|---|---|---:|---|
| **`PlayerInventory`** | `["inv", world, player]` | **`284` B** (`8` disc + `32` world + `32` player + `1` bump + `1` version + `2` bag_cap + `64` items + `64` reserved + `24` tools[6] + `1` equipped + `4` last_x_dm + `4` last_z_dm + `8` last_swing_tick + `1` swings_in_tick + `8` action_nonce + `4` state_epoch + `26` reserved_pad) | Program-owned; writable by `player` or authorized session key | Bag weight `60`; 32 item slots (`u16` max `65,535`); 6 tool slots | `~0.00287` SOL rent + `~0.00320` SOL delegation | Lazy init on base + delegate (operator-funded for Quick Play); closed only on `release_world`; `version` byte + `26` B pad avoids realloc. |
| **`Container`** | `["cont", world, id_u32_le]` | **`244` B** (`8` disc + `32` world + `4` id + `1` kind + `1` bump + `1` version + `1` active + `32` owner + `4` x_dm + `4` z_dm + `2` capacity + `64` items + `64` reserved + `4` state_epoch + `22` reserved_pad) | Program-owned; `owner == default` = shared world access | Pile `60`, Stockpile `600`, Storage Shed `300` (`wild-build.ts`) | `~0.00259` SOL rent + `~0.00320` SOL delegation | Emptied ground piles set `active = false` and are **reused** (slot pool) before allocating new `Container` PDAs to cap rent growth! |
| **`ChunkLedger`** | `["chunk", world, cx_i16_le, cz_i16_le]` | **`560` B** (`8` disc + `32` world + `2` cx + `2` cz + `1` bump + `1` version + `4` state_epoch + `32` pickup_depleted[256b] + `64` tree_felled[512b] + `1` trunk_count + `1` damaged_count + `224` trunks[16×14B] + `128` damaged[16×8B] + `60` reserved_pad) | Program-owned; mutated by authorized world players | 256 pickups, 512 trees, 16 concurrent fallen trunks, 16 damaged trees per 64×64 m chunk | `~0.00479` SOL rent + `~0.00320` SOL delegation | Spawn chunk pre-created & delegated; adjacent chunks lazy-created when entered; `60` B pad reserved for Phase 3.5/3.6 (wildlife/deposits). |
| **`BuildSite`** *(Phase 3.3; reservation schema defined now)* | `["site", world, id_u32_le]` | **`388` B** (`8` disc + `32` world + `4` id + `1` kind + `1` bump + `1` version + `1` stage + `1` rot + `1` status + `4` x_dm + `4` z_dm + `8` placed_tick + `2` swings_done + `4` state_epoch + `120` allocs[12×10B] + `64` delivered + `64` consumed + `68` func_state_and_pad) | Program-owned; mutated by world owner / authorized builder | Up to 12 distinct `(source, item, qty)` reservations per site | `~0.00359` SOL rent + `~0.00320` SOL delegation | Created on `place_site`; cancelled sites release reservations and return unconsumed delivered items to a `Container`; finished sites persist. |

---

## 3. Verification of All 10 Resource Conservation Invariants

| # | Invariant | Enforcement Mechanism | Status |
|---:|---|---|---|
| **1** | **No creation from untrusted client assertion** | No generic `mint` or `harvest(item, qty)` exists in Phase 3. Items enter existence **only** via `pickup_node` (deterministic chunk pickup bit `0 → 1`) or `cut_trunk` (requires `FallenTrunk` created by `chop_tree` depleting deterministic tree bit `0 → 1`). | `[Architectural proposal]` *(Deterministic node check on SBF is `[Assumption]` until LiteSVM CU-benchmarked)* |
| **2** | **No double-spending** | Every reservation or transfer write-locks the source account (`PlayerInventory` or `Container`) in the same Solana tx and checks `free = items[id] - reserved[id] >= qty`. | `[Verified in source code (Solana write-lock + reservation.ts:44-46)]` |
| **3** | **Reservations cannot exceed available quantities** | Enforced on every mutation: `require!(src.items[id] >= src.reserved[id])`. Dropping, crafting, or plain transfer only reads `free = items[id] - reserved[id]`. | `[Architectural proposal]` *(Mirrors `wild-build.ts:229-250` `[Verified in source code]`)* |
| **4** | **Failed txs cannot partially consume resources** | Solana runtime atomicity rolls back all account writes on any `Err(...)`. | `[Verified on devnet]` |
| **5** | **Transfers cannot duplicate or destroy resources** | `transfer_item` executes `src.items[id] = src.items[id].checked_sub(qty)?; dst.items[id] = dst.items[id].checked_add(qty)?;` in one instruction with `src.key() != dst.key()`. | `[Architectural proposal]` |
| **6** | **Inventory limits enforced authoritatively** | `bag_weight(inv) + qty * ITEM_WEIGHT[id] <= inv.bag_capacity` (`60`) and `container_weight(c) + qty * ITEM_WEIGHT[id] <= c.capacity` checked on-chain before crediting. | `[Architectural proposal]` *(Weights `[Verified in source code]`)* |
| **7** | **Gathering requires valid world conditions & tool capability** | `chop_tree` checks `equipped == STONE_AXE`, `durability >= swings`, `swings <= SWINGS_PER_TICK (4)`, `dist(player, tree) <= 2.5 m`, and `tree_felled[idx] == 0`. | `[Architectural proposal]` *(Reach & swing rate `[Verified in source code: felling.ts:50-52]`)* |
| **8** | **Cannot harvest after depletion** | `pickup_depleted` (256-bit) and `tree_felled` (512-bit) tombstones in `ChunkLedger` are checked before granting output and flipped atomically in the same tx. | `[Architectural proposal]` |
| **9** | **Retrying an action cannot duplicate output** | Strict monotonic `action_nonce`: `require!(nonce == inv.action_nonce + 1)` and `inv.action_nonce = nonce` in the same tx. | `[Architectural proposal]` |
| **10** | **Replaying event journal reproduces authoritative state** | Every state-mutating instruction appends a canonical `JournalEvent` to `WorldExt.journal_hash` (`sha256(prev_hash || record)`), extending `v2.rs:173` (`journal_append`). | `[Verified in source code (V2 journal)]` / `[Architectural proposal (Phase 3 record kinds)]` |

---

## 4. Complete End-to-End State Transition Example

**Scenario:** Tree (`chunk -2,-3, tree_idx=14`, mature oak, HP `10`, yield `3` logs) → player bag (`0/60`, `stone_axe` dur `60`, wt `3`) → stockpile `Container(12)` → reserved for Cabin `BuildSite(5)` *(Phase 3.3 consumer)*:

1. **Local Presentation:** Player walks to `(-82.0, -172.0)`, aims at tree `14`, client checks `dist <= 2.5 m` and plays swing animation. *(0 chain txs)*
2. **`chop_tree(cx=-2, cz=-3, idx=14, swings=4, x=-820, z=-1720, nonce=1)` [ER]:** Verifies `stone_axe` dur `60 >= 4`, `tree_felled[14]==0`, `swings_in_tick <= 4`. Writes `axe.durability = 56`, `damaged[14].hp = 6`, `action_nonce = 1`.
3. **`chop_tree(..., swings=4, nonce=2)` & `chop_tree(..., swings=2, nonce=3)` [ER, across next ticks]:** `hp` reaches `0` → sets `tree_felled[14] = 1`, inserts `FallenTrunk{idx=14, logs=3, cuts=6}`, `axe.durability = 50`, emits `JournalEvent(TREE_FELLED)`.
4. **`cut_trunk(cx=-2, cz=-3, idx=14, swings=6, pile_id=88, nonce=4)` [ER, 2 ticks]:** Consumes trunk, `axe.durability = 44`, activates `Container(88, GroundPile)` with `items[LOG] = 3` (`wt 27/60`), emits `LOGS_CREATED`.
5. **`transfer_item(from=Container(88), to=Inv, item=LOG, qty=2, nonce=5)` [ER]:** Checks `free(88, LOG)=3 >= 2`, `bag_wt = 3 + 18 = 21 <= 60`. Writes `Container(88).items[LOG] = 1`, `Inv.items[LOG] = 2`.
6. **Local Presentation:** Player carries 2 logs `30 m` to Stockpile `Container(12)`. *(0 chain txs)*
7. **`transfer_item(from=Inv, to=Container(12), item=LOG, qty=2, nonce=6)` [ER]:** Checks `dist <= 3.5 m`, `free(Inv, LOG)=2 >= 2`, `Container(12)` cap `600`. Writes `Inv.items[LOG] = 0`, `Container(12).items[LOG] = 2`.
8. **`reserve_resources(site_id=5, allocs=[{Container, 12, LOG, 2}], nonce=7)` [ER, Phase 3.1/3.3 boundary]:** Write-locks `Container(12)`, checks `free(12, LOG)=2 >= 2`, increments `Container(12).reserved[LOG] = 2`, records allocation for site `5`. Any concurrent second site trying to reserve `Container(12)` logs sees `free = 2 - 2 = 0` and fails with `Unfunded`.
9. *(Phase 3.3)* **`deliver_site` & `work_site`:** Moves `Container(12)` reserved logs into `BuildSite(5).delivered[LOG]`, decrements `Container(12).items[LOG]` and `reserved[LOG]` atomically, then moves `delivered → consumed` on stage completion.

---

## 5. Assumptions vs. Verified Behaviour

- **`[Verified in source code]`:** All 25 item IDs/weights, 5 tool durabilities/weights, `CARRY_CAPACITY_V5 = 60`, `SWINGS_PER_TICK = 4`, `CHOP_REACH = 2.5 m`, `WorldExt` 128 reserved bytes, and V2 `journal_append`.
- **`[Verified on devnet]`:** ER `core 2.0.5` fee-free execution, Solana tx atomicity on error, V2 `settle` catch-up, and 2-account undelegation batches.
- **`[Assumption]` (Must be benchmarked in LiteSVM before devnet):** (1) On-chain deterministic tree/pickup derivation CU cost vs. Merkle proof fallback; (2) reusing inactive `Container` PDAs to prevent unbounded rent growth; (3) exact max accounts per `MagicIntentBundleBuilder::commit` on ER `2.0.5`.
- **`[Unknown]`:** Exact operator funding mechanism for Quick Play base-layer child-PDA rent in multi-chunk exploration beyond the spawn chunk.
