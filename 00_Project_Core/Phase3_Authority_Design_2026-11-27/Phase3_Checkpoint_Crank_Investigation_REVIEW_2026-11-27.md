# Phase 3: Checkpoint Crank Investigation (Review Copy)

**Date:** 2026-11-27  
**Status:** Review copy prepared for independent architectural sign-off. Original draft preserved at `Phase3_Checkpoint_Crank_Investigation.md`.  
**Mode:** Strictly read-only investigation. Zero cranks rescheduled, cancelled, funded, or modified.  
**Labels:** `[Verified in source code]` · `[Verified on devnet]` · `[Demonstrated in isolated experiment]` · `[Architectural proposal]` · `[Assumption]` · `[Unknown]`

---

## 1. Exact Scheduled Instruction & Configuration

- **Scheduled instruction:** 8× `checkpoint` instructions per crank trigger (`discriminator: d5c813ccf08fb8fc`), with 6 accounts per instruction: `[w: world_slot_i, w: passport_i, w: treasury (FNdEiiZn…), w: magicFeeVault (ByZyZ632…), w: MagicContext111…, r: Magic111…]` `[Verified in source code: chain/client/scripts/astrix.ts:185-196 & Verified on devnet: crank-inventory.ts]`.
- **Arguments:** None (instruction data is the 8-byte Anchor discriminator only) `[Verified in source code: lib.rs:646]`.
- **Expected frequency:** `intervalSlots = 6,000` ER slots (`~60,000 ms` = 1 minute). Each slot commits to base devnet at most once per `CHECKPOINT_MIN_TICKS = 1800` ticks (`3,600 s` = 1 hour) or after an ownership transfer (`CHECKPOINT_MIN_GAP_S = 600 s`) `[Verified in source code: lib.rs:59,62,653-655]`.

---

## 2. Live Status, Last Success & Last Failure (Verified at ER Slot `1,169,233,645`) `[Verified on devnet]`

| Task ID | Crank PDA | Checkpointed Slots | Current Status | Last Successful Tx (`err: null`) | Last Failed Tx (`err != null`) |
|---:|---|---|---|---|---|
| **`743000`** | `2QEjDdoZSxzCdydhRYB5zhikTUHdfdAuagPRD275h6eM` | `0–7` (8 occupied) | **STALLED** (`nextExecSlot 1,169,131,680`, `+101,965` overdue, ~17 min) | `XLZUkTQb…FpH9kHEWgr` (slot `1,169,125,681`, `08:09:41Z`) | `5UAyVMph…nXuRGTP5` (slot `1,169,131,937`, `08:10:44Z`, `InstructionError: [2, "Immutable"]`) |
| **`743008`** | `CWRr3KWbzadFK85jQB42hj7Uka4WakYkDjeqKgQohWD9` | `8–15` (8 occupied) | **STALLED** (`nextExecSlot 1,169,139,199`, `+94,446` overdue, ~15.7 min) | `BjCPxKmS…usRZHasE` (slot `1,169,133,200`, `08:10:57Z`) | `3TrBo5TL…ag3YfrHe` (slot `1,169,139,456`, `08:11:59Z`, `InstructionError: [6, "Immutable"]`) |
| **`743024`** | `4HUM4qkDWYqPHp9gG8icNZGYf2P3RByaXK34sP2MYnzg` | `24–31` (pilot `31` occupied) | **STALLED** (`nextExecSlot 1,169,121,428`, `+112,217` overdue, ~18.7 min) | `2xQNNkJR…jJoPbHYQ` (slot `1,169,115,429`, `08:07:59Z`) | `67kmsTD8…qECF9noC` (slot `1,169,121,685`, `08:09:01Z`, `InstructionError: [6, "Immutable"]`) |
| *`743016`* | `A335J8CBMZPrM4kY1621hf61N3wsGgNQcjZksy7g2ar9` | `16–23` (0 occupied) | **RUNNING** (`overdueSlots < 0`) | Running normally | None |

---

## 3. Verification of Recovery Questions

1. **Are missed executions recoverable?** Yes. `checkpoint()` commits the *current* world state and updates `passport.last_checkpoint_tick = w.tick`, `state_hash`, and `checkpoints += 1` (`lib.rs:658-663`) `[Verified in source code]`. Missed intermediate hourly snapshots are skipped without data loss; the next successful trigger commits the latest authoritative ER state.
2. **Does in-place rescheduling preserve existing task configuration?** Yes. Using the exact same task IDs (`743000`, `743008`, `743024`), `60000 ms` interval, `1,000,000` iterations, and identical 8-slot account lists causes Hydra `2.0.5` to execute atomic `Cancel + Create` in one transaction (`MB004 REPORT §2a`, proven live during our earlier `743000`/`743008` recovery) `[Verified on devnet]`.
3. **Does recovery change checkpoint history or durability guarantees?** No. `Passport.checkpoints`, `last_checkpoint_tick`, and `state_hash` live on the `Passport` accounts, not on the Hydra crank PDA `[Verified in source code]`. Recovery simply resumes hourly base-layer commits; it does not alter history or weaken durability.
4. **Does the recovery transaction itself cost zero SOL?**
   - **Reschedule transactions (3 ER txs):** **Yes — `0 SOL`** (`fee: 0` on ER, proven in our earlier `743000`/`743008` recovery txs `g58Qt1EA…` and `z23YcmYg…`) `[Verified on devnet]`.
   - **Subsequent hourly checkpoint commits:** Paid from the **existing `1.40985852 SOL` ER treasury balance** (`FNdEiiZn…`), NOT from the admin wallet. No additional SOL transfer is required `[Verified on devnet]`.

---

## 4. Comparison of Recovery Options

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| **A. In-place rescheduling (Recommended)** | `schedule-checkpoints 0 743000 60000`, `8 743008 60000`, `24 743024 60000` | Atomic `Cancel+Create`; preserves canonical task IDs (`743xxx`) expected by `crank-inventory.ts`; `0 SOL` tx cost; already proven on devnet `2.0.5`. | Resets crank `executed` counter on the Hydra PDA (passport history unaffected). |
| **B. New task IDs + cancel old** | Schedule e.g. `745000`/`745008`/`745024`, then `cancel-task 743xxx` | Zero overlap risk with stalled IDs. | Breaks `crank-inventory.ts` hardcoded IDs; requires 6 txs instead of 3; leaves non-standard IDs. |
| **C. Do nothing (leave stalled)** | None | 0 txs. | All 17 occupied V2 worlds stop committing base-layer backups; cranks become permissionlessly closable in ~47.7 h. |

---

## 5. Timing Recommendation
**Recover independently BEFORE Phase 3.1 implementation** (as a small, standalone 0-SOL devnet operational approval). It is completely decoupled from Phase 3.1 code, takes < 2 minutes to execute and verify, and restores hourly base-layer durability for all 17 occupied production devnet worlds immediately.
