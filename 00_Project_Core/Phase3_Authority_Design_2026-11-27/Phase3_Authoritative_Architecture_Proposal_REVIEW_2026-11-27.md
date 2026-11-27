# Phase 3: Authoritative Architecture Proposal (Review Copy)

**Date:** 2026-11-27  
**Status:** Review copy prepared for independent architectural sign-off. Original draft preserved at `Phase3_Authoritative_Architecture_Proposal.md`.  
**Labels:** `[Verified in source code]` · `[Verified on devnet]` · `[Demonstrated in isolated experiment]` · `[Architectural proposal]` · `[Assumption]` · `[Unknown]`

---

## 1. Verified V2 Foundation & `WorldExt.reserved[0..32]`

- **V2 Layout & Size:** `V1_LEN = 240` bytes (`8 + Settlement::INIT_SPACE`); `V2_LEN = 876` bytes (`V1_LEN + WorldExt::INIT_SPACE`, `636`-byte tail starting with `EXT_MAGIC = b"AXv2"`) `[Verified in source code: chain/programs/astrix-settlement/src/v2.rs:19-22]`. All 32 numbered devnet worlds are `876` bytes (`AXv2`) and delegated to `devnet-eu.magicblock.app` (`core 2.0.5`) `[Verified on devnet]`.
- **`WorldExt.reserved`:** `pub reserved: [u8; 128]` occupies the final 128 bytes of `WorldExt` (`offset 748..876` in the 876-byte account), initialized to all zeros `[Verified in source code: v2.rs:134,144]`.
- **Proposed `reserved[0..32]` Header (`P3Header`) `[Architectural proposal]`:**
  - `0..2`: `economy_version: u16` (`0` = pre-Phase 3, `1` = Phase 3.1 active)
  - `2..6`: `next_container_id: u32` (monotonic ID generator for `Container` PDAs)
  - `6..10`: `next_site_id: u32` (monotonic ID generator for `BuildSite` PDAs)
  - `10..12`: `active_child_pdas: u16` (count of currently delegated child PDAs — used to guard world undelegation)
  - `12..14`: `active_players: u16`
  - `14..16`: `flags: u16` (e.g., bit 0 = `wilderness_linked`)
  - `16..32`: reserved zero padding (`[u8; 16]`)
  - Bytes `reserved[32..128]` (`96` bytes) remain untouched for Phases 3.4–3.8.
- **Backward Compatibility:** `load_ext` / `store_ext` (`v2.rs:150-163`) deserialize and serialize the full `WorldExt` in place without changing `V2_LEN`. Non-migrated V1 demo settlement (`4PV6…`, `240` B) returns `Ok(None)` from `load_ext` and continues ticking normally `[Verified in source code & Verified on devnet]`.

---

## 2. Child-PDA Technical Feasibility & Limitations

While child PDAs avoid reallocating the 876-byte `Settlement` account, **they introduce real operational constraints that must be designed for explicitly**:

1. **Cross-Account Delegation Synchronization (`world` + child PDAs):**
   - On MagicBlock ER (`core 2.0.5`), a transaction can only mutate accounts that are **all delegated to the same ER validator** (or all on base layer) `[Verified on devnet]`.
   - Every child PDA is bound to its parent world by including `world.key()` in its PDA seeds (`["inv", world, player]`, `["cont", world, id_le32]`, `["chunk", world, cx_le16, cz_le16]`, `["site", world, id_le32]`) and storing `pub world: Pubkey` + `pub state_epoch: u32` inside the account `[Architectural proposal]`.
2. **Escape-Hatch Limitation Found in Source Code `[Verified in source code: lib.rs:883-960]`:**
   - The existing Phase 2 escape hatch `request_undelegation(kind: u8, index: u8)` / `rollback_undelegation(kind: u8, index: u8)` only derives seeds for 5 fixed kinds (`0..4`: Settlement, Registry, Slot, Passport, Treasury) with a single `u8` index.
   - **Required Phase 3 addition `[Architectural proposal]`:** Add `request_child_undelegation(child_kind: u8, world: Pubkey, key_bytes: [u8; 32])` and `rollback_child_undelegation(...)` so every delegated child PDA (`PlayerInventory`, `Container`, `ChunkLedger`, `BuildSite`) can be independently recovered after the 9,000-slot DLP timeout if a validator becomes unresponsive.
3. **Commit Batch Size Limit `[Demonstrated in isolated experiment: PHASE2 REPORT §8.4]`:**
   - Large multi-account commit intents failed buffer preparation on local ER `2.0.3`; devnet `2.0.5` batch ceiling is `[Unknown]` beyond 2–3 accounts per intent (2-slot batches succeeded across all 31 slots `[Verified on devnet]`).
   - Therefore, checkpointing or undelegating child PDAs **must** be batched at ≤ 2–3 accounts per intent.
4. **PDA Creation & Rent Funding for Quick Play (0-SOL) Players:**
   - Delegated ER transactions are fee-free (`0 SOL`), **but** creating a new PDA (`init`) + delegating it to ER happens on Solana base layer and costs rent (~`0.002–0.007 SOL` per PDA) `[Verified on devnet]`.
   - Quick Play players hold `0 SOL` `[Verified in source code: Game/src/chain/guest.ts:5]`. Thus, base-layer child-PDA creation/delegation must be paid by an operator-funded relayer or a pre-funded world-rent pool `[Architectural proposal]`.

---

## 3. Failure & Edge-Case Behaviour Matrix

| Failure / Edge Case | Exact Behaviour Under Proposed Architecture | Verification Status |
|---|---|---|
| **A world is undelegated** | Any ER tx touching `world` fails with `Immutable` / `InvalidAccountOwner` (as observed on `743xxx` cranks) `[Verified on devnet]`. Before undelegating a world for maintenance, all active child PDAs should be undelegated in batches of 2–3 (`undelegate_children`), or remain frozen until `world` is re-delegated. | `[Architectural proposal]` |
| **A child account is missing** | Instructions require the target `PlayerInventory`, `Container`, or `ChunkLedger` PDA to exist and be owned by `Gge4…` on ER. Missing accounts fail Anchor account deserialization (`AccountNotInitialized`) with zero state change. Client prompts lazy base-layer init + delegation before retrying. | `[Verified in source code (Anchor)]` / `[Architectural proposal]` |
| **A player loses access (session expired / revoked / key lost)** | `authorise()` checks signer against `world.owner` or non-expired `world.session_key` (`lib.rs:584`) `[Verified in source code]`. Expired/revoked session returns `SessionExpired` / `NotOwner`; player's `PlayerInventory` remains intact on-chain and can be resumed after passkey/wallet recovery (`guest.ts`). | `[Verified in source code]` / `[Architectural proposal]` |
| **Two players attempt the same resource action concurrently** | Both txs must pass the target `Container` or `ChunkLedger` as writable. Solana/ER runtime write-locks execute them strictly sequentially: the first flips the depletion bit or increments `reserved[item]`; the second sees depleted/zero-free state and aborts atomically (`NodeAlreadyDepleted` / `Unfunded`). | `[Verified in source code (Solana runtime)]` / `[Architectural proposal]` |
| **A transaction fails midway** | Solana runtime transaction execution is atomic: any `Err(...)` at any line rolls back all lamport and account-data writes across `world` and all child PDAs, including `settle()` and `action_nonce`. Partial resource consumption is impossible. | `[Verified on devnet (demonstrated in disposable prospect InsufficientResources rollback)]` |
| **A player disconnects during an action** | The in-flight ER tx either commits atomically (advancing `action_nonce` and updating PDAs) or drops (leaving `action_nonce` unchanged). On reconnect, the client re-fetches `PlayerInventory` + active PDAs + calls `settle()`, converging 100% to authoritative ER state with zero lost world time. | `[Demonstrated in isolated experiment (world clock)]` / `[Architectural proposal]` |
| **A world must be recovered from base chain (validator unresponsive)** | Admin runs `request_undelegation` + `rollback_undelegation` (9,000-slot timeout) on `world` (`state_epoch += 1`, `ROLLBACK` journaled) `[Demonstrated in isolated experiment: Test C]`, plus `rollback_child_undelegation` on each active child PDA. Child PDAs whose `state_epoch < world.state_epoch` reject writes (`EpochMismatch`) until reconciled to `world.state_epoch`, preventing stale ER child state from colliding with a rolled-back world. | `[Demonstrated in isolated experiment (world)]` / `[Architectural proposal (child PDAs)]` |
