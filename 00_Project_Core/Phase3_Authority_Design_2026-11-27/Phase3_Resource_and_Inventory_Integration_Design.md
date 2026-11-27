# Phase 3: Resource and Inventory Integration Design

**Date:** 2026-11-27  
**Status:** **[PROPOSAL]** — First implementation target after architecture approval.  
**References:** `Game/src/sim/gathering.ts`, `Game/src/sim/felling.ts`, `Game/src/sim/reservation.ts`, `Game/src/sim/wild-build.ts`, `chain/programs/astrix-settlement/src/lib.rs`, `v2.rs`.

---

## 1. Canonical Resource Taxonomy & Units

**[SRC] → [PROPOSAL]:** Mirror `WILD_ITEMS` (`Game/src/sim/gathering.ts:71-72`, 25 items) with stable, append-only `u8` IDs so `Game/src/sim` and Rust share an exact 1:1 mapping:

| `u8` ID | Canonical Key | Unit Weight | Source / Notes |
|---:|---|---:|---|
| `0` | `branch` | 2 | Ground pickup (`branch`) |
| `1` | `stone` | 2 | Ground pickup (`loose_stone`) |
| `2` | `fiber` | 1 | Ground pickup (`fiber_plant`) |
| `3` | `grass` | 1 | Ground pickup (`grass_tuft`) |
| `4` | `berries` | 1 | Ground pickup (`berry_bush`) |
| `5` | `mushroom` | 1 | Ground pickup (`mushroom`) |
| `6` | `cord` | 1 | Hand-crafted (`fiber × 2`) |
| `7` | `log` | 9 | Cut from felled tree trunk (`felling.ts`) |
| `8` | `plank` | 3 | Workbench (`log × 1 → plank × 2`) |
| `9` | `chest` | 10 | Workbench (`plank × 4 + cord × 1`, hammer) |
| `10` | `cooked_mushroom` | 1 | Campfire (`mushroom × 1`) |
| `11` | `clay` | 3 | Mined (`deposits.ts`) |
| `12` | `sand` | 3 | Mined |
| `13` | `gravel` | 3 | Mined |
| `14` | `iron_ore` | 4 | Mined |
| `15` | `copper_ore` | 4 | Mined |
| `16` | `coal` | 2 | Mined |
| `17` | `iron_ingot` | 4 | Smelted (`iron_ore × 2 + coal × 2`) |
| `18` | `copper_ingot` | 4 | Smelted |
| `19` | `raw_meat` | 2 | Butchered (`hunting.ts`) |
| `20` | `cooked_meat` | 2 | Campfire |
| `21` | `hide` | 2 | Butchered |
| `22` | `bone` | 1 | Butchered |
| `23` | `arrow` | 1 | Workbench |
| `24` | `blunt_arrow` | 1 | Workbench |
| `25..31` | *(reserved)* | — | Fixed `[u16; 32]` array in PDAs allows 7 future items with zero realloc |

**Canonical Tool IDs (`u8`):** `0 = stone_axe (dur 60, wt 3)`, `1 = hammer (80, wt 3)`, `2 = knife (40, wt 2)`, `3 = stone_pickaxe (60, wt 4)`, `4 = bow (150, wt 3)`.

---

## 2. On-Chain Account Layouts **[PROPOSAL]**

### A. `PlayerInventory` PDA — Seeds: `["inv", world, player]` (~256 bytes)
```rust
#[account]
pub struct PlayerInventory {
    pub world: Pubkey,            // 32 — owning V2 world slot
    pub player: Pubkey,           // 32 — owner or authorized player
    pub bump: u8,                 // 1
    pub bag_capacity: u16,        // 2  — 60 (matches WILD_CONTENT_V5)
    pub items: [u16; 32],         // 64 — total held per item ID
    pub reserved: [u16; 32],      // 64 — sum of units reserved in bag across all sites
    pub tools: [ToolSlot; 6],     // 24 — { kind: u8, durability: u16, _pad: u8 }
    pub equipped_tool: u8,        // 1  — 0..5 or 255 (bare hands)
    pub last_x_dm: i32,           // 4  — last verified decimetre X
    pub last_z_dm: i32,           // 4  — last verified decimetre Z
    pub last_swing_tick: u64,     // 8  — rate limit window (SWINGS_PER_TICK = 4)
    pub swings_in_tick: u8,       // 1
    pub action_nonce: u64,        // 8  — strictly monotonic idempotency counter
    pub state_epoch: u32,         // 4  — matches world.state_epoch
}
```
**Core Conservation Invariants enforced on every instruction:**
- `items[id] >= reserved[id]` for all `id in 0..32` (`free = items[id] - reserved[id]`).
- `sum(items[id] * WEIGHT[id]) + sum(active_tools * TOOL_WEIGHT) <= bag_capacity`.
- No instruction may decrement `items[id]` below `reserved[id]` except an explicit `for_site` transfer or `deliver_site` referencing the owning reservation.

### B. `Container` PDA — Seeds: `["cont", world, container_id_le32]` (~224 bytes)
Unifies ground piles (`d:N`), stockpiles, and storage buildings (`b:N`) under one accounting model:
```rust
pub enum ContainerKind { GroundPile = 0, Stockpile = 1, StorageBuilding = 2 }

#[account]
pub struct Container {
    pub world: Pubkey,            // 32
    pub id: u32,                  // 4
    pub kind: u8,                 // 1
    pub bump: u8,                 // 1
    pub owner: Pubkey,            // 32 — Pubkey::default() = shared world access
    pub x_dm: i32,                // 4  — authoritative world position (decimetres)
    pub z_dm: i32,                // 4
    pub capacity: u16,            // 2  — 60 (pile), 600 (stockpile), 300 (shed)
    pub items: [u16; 32],         // 64
    pub reserved: [u16; 32],      // 64
    pub active: bool,             // 1  — false when emptied ground pile
}
```

### C. `ChunkLedger` PDA — Seeds: `["chunk", world, cx_i16_le, cz_i16_le]` (~640 bytes)
Prevents fabricated gathering/felling by recording authoritative depletion and fallen trunks per 64×64 m chunk:
```rust
pub struct FallenTrunk {
    pub tree_idx: u16,            // deterministic tree index in chunk
    pub x_dm: i32,
    pub z_dm: i32,
    pub logs_remaining: u8,       // from TIMBER[species][stage]
    pub cuts_needed: u8,          // remaining cut_log swings
}

#[account]
pub struct ChunkLedger {
    pub world: Pubkey,            // 32
    pub cx: i16,                  // 2
    pub cz: i16,                  // 2
    pub bump: u8,                 // 1
    pub pickup_depleted: [u8; 32],// 32 — 256-bit tombstone bitset for chunk pickups
    pub tree_felled: [u8; 64],    // 64 — 512-bit tombstone bitset for standing trees
    pub trunks: [FallenTrunk; 16],// 224 — active fallen trunks awaiting cut_log
    pub trunk_count: u8,          // 1
    pub damaged: [DamagedTree; 16],// 128 — { tree_idx: u16, hp_left: u8, last_tick: u64 }
}
```

### D. `ReservationEntry` (stored inside `BuildSite` PDA — Seeds: `["site", world, site_id_le32]`)
Mirrors `Game/src/sim/reservation.ts` exactly:
- Each `BuildSite` holds `allocs: [Alloc; 12]` where `Alloc { source_kind: u8 (0=Bag, 1=Container), source_id: u32, item_id: u8, qty: u16 }`.
- **Atomic double-spend prevention:** When `place_site` reserves `qty` of `item_id` from source `S`:
  1. The program passes `S` (`PlayerInventory` or `Container`) as a **writable account** in the same Solana transaction (Solana's runtime write-lock serializes concurrent transactions touching `S`).
  2. Checks `S.items[item_id] - S.reserved[item_id] >= qty`.
  3. Increments `S.reserved[item_id] += qty` **and** records the `Alloc` on `BuildSite` in the **same atomic instruction**.
  4. If *any* required material is short, the entire instruction aborts (`Err(Unfunded)`) and Solana rolls back all state writes.

---

## 3. Concrete Walkthrough: Chop Tree → Logs → Carry → Stockpile → Reserve for Cabin

```mermaid
sequenceDiagram
    participant P as Player / Three.js
    participant ER as MagicBlock ER (astrix-settlement)

    Note over P: 1. Local: walk to mature oak (tree_idx=14, chunk -2,-3)<br/>Client checks reach <= 2.5m & plays chop animation
    P->>ER: chop_tree(cx=-2, cz=-3, tree_idx=14, swings=4, x_dm, z_dm, nonce=101)
    Note over ER: Authorize signer -> settle(world) -> verify nonce==101<br/>Verify equipped==stone_axe & durability>=4 & swings_in_tick<=4<br/>Verify tree_felled bit[14]==0 & reach<=2.5m<br/>Compute deterministic HP (e.g. 10) from (world_seed, cx, cz, 14)<br/>Deduct axe durability -= 4, damaged[14].hp = 6
    ER-->>P: Confirmed (hp=6, axe_dur=56)

    Note over P: 2. Next ticks: 2 more chop_tree bursts (4 + 2 swings)
    P->>ER: chop_tree(..., swings=2, nonce=103)
    Note over ER: hp reaches 0 -> set tree_felled[14]=1<br/>Create FallenTrunk{tree_idx=14, logs_remaining=3, cuts_needed=6}<br/>Emit JournalEvent(TREE_FELLED)
    ER-->>P: Confirmed -> Three.js plays tree-fall animation & renders trunk

    Note over P: 3. Player cuts fallen trunk into logs
    P->>ER: cut_trunk(cx=-2, cz=-3, tree_idx=14, swings=6, pile_id=88, nonce=104)
    Note over ER: Verify axe durability>=6, trunk exists -> remove trunk<br/>Create/credit Container(id=88, GroundPile, x, z) with items[LOG] += 3<br/>Emit JournalEvent(LOGS_CREATED)
    ER-->>P: Confirmed -> Three.js spawns log pile d:88 (3 logs)

    Note over P: 4. Player picks up 2 logs (weight 2*9=18, fits in 60 bag)
    P->>ER: transfer_item(from=Container(88), to=PlayerInventory, item=LOG, qty=2, nonce=105)
    Note over ER: Verify reach <= 3.5m, free(88, LOG)>=2, bag weight+18<=60<br/>Container(88).items[LOG] -= 2; PlayerInventory.items[LOG] += 2
    ER-->>P: Confirmed -> HUD shows 2 logs in bag

    Note over P: 5. Local: player walks 30m to Stockpile Container(12)
    P->>ER: transfer_item(from=PlayerInventory, to=Container(12), item=LOG, qty=2, nonce=106)
    Note over ER: Verify reach <= 3.5m to Container(12), free(bag, LOG)>=2<br/>PlayerInventory.items[LOG] -= 2; Container(12).items[LOG] += 2
    ER-->>P: Confirmed -> Stockpile 12 now holds 2 free logs

    Note over P: 6. Player places Cabin site (needs 2 logs + branches + stones)
    P->>ER: place_site(site_id=5, kind=CABIN, sources=[Bag, Container(12)], nonce=107)
    Note over ER: Atomic check across Bag & Container(12) (both write-locked!):<br/>free(Container(12), LOG) == 2 >= 2 -> Container(12).reserved[LOG] += 2<br/>Record Alloc{Container, 12, LOG, 2} on BuildSite(5)<br/>Emit JournalEvent(SITE_PLACED)
    ER-->>P: Confirmed -> Cabin site 5 funded & reserved

    Note over P: 7. Attempt to double-spend same 2 logs on a second site
    P->>ER: place_site(site_id=6, kind=WORKBENCH, sources=[Container(12)], nonce=108)
    Note over ER: free(Container(12), LOG) = items(2) - reserved(2) = 0 < 2<br/>ABORT Err(Unfunded) — zero state change!
    ER-->>P: Rejected (Unfunded) -> Client toast explains 2 logs are reserved for Cabin 5
```

### Why Fabricated Logs & Double-Spending Are Impossible
- **Cannot invent logs:** `items[LOG]` can **only** be incremented by `cut_trunk` (which requires a `FallenTrunk` created by `chop_tree` depleting a deterministic tree bit in `ChunkLedger`) or by `transfer_item` (which atomically decrements another account's free `items[LOG]` by the exact same `qty`). No `mint` or `harvest(LOG, N)` instruction exists.
- **Cannot double-spend on two projects:** Both `place_site` calls require `Container(12)` as a writable account. Solana/ER runtime executes them strictly sequentially; the first increments `Container(12).reserved[LOG]` from `0 → 2`, so the second sees `free = 2 - 2 = 0` and fails atomically.

---

## 4. Concurrency, Idempotency & Failure Recovery

- **Idempotency & replay protection:** Every mutating player instruction carries `action_nonce: u64`. The program enforces `action_nonce == inv.action_nonce + 1` (incrementing `inv.action_nonce` on success). A duplicated or retried packet with an already-processed nonce fails cleanly with `NonceAlreadyUsed`, preventing double pickups, double drops, or double crafting.
- **Disconnect / failed tx recovery:** Because all inventory, container, reservation, and chunk-depletion state lives on-chain in delegated PDAs, a client that disconnects mid-action simply re-fetches `PlayerInventory` (including `action_nonce`), `Container`s, and `BuildSite`s on reconnect, reconciles its local mirror, and resumes with `action_nonce + 1`.
- **Emergency rollback safety:** If a validator becomes unresponsive and `rollback_undelegation` increments `world.state_epoch`, child PDAs check `world.state_epoch` on next interaction and sync cleanly to the rolled-back checkpoint state.
