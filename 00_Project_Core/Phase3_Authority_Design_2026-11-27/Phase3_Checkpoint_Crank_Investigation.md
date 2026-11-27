# Phase 3: Checkpoint Crank Investigation (`743000`, `743008`, `743024`)

**Date:** 2026-11-27  
**Mode:** **STRICTLY READ-ONLY INVESTIGATION.** No crank was rescheduled, cancelled, funded, or modified.  
**Live observation timestamp:** `2026-11-27T08:21:28Z` (ER slot `1,169,196,294`, base slot `526,806,281`) **[ON-CHAIN]**.

---

## 1. Purpose & Account Assignments **[SRC] / [ON-CHAIN]**

Each `743xxx` crank is a Hydra scheduled task (`eHyd5BU8QffvHi4GnXwxrK4WpS7pM2x9UGKHBWii7mf`) running every `6,000` ER slots (~60 s) that executes 8 `checkpoint` instructions (`discriminator d5c813ccf08fb8fc`) for a contiguous group of 8 numbered world slots (`chain/client/scripts/astrix.ts:185-196`). Each `checkpoint` instruction is rate-limited on-chain (`CHECKPOINT_MIN_TICKS = 1800` ticks = 1 hour per claimed world, `lib.rs:59,655`) and commits `(world, passport)` to Solana devnet base layer, paying commit fees from the delegated checkpoint treasury `FNdEiiZn8qzx3ZaAQ7WW7QCFyPTRGm3o5DNPJEkexQks`.

| Task ID | Crank PDA | Assigned Slots | Claimed Slots in Group | Status at `08:21 UTC` | `nextExecSlot` | `overdueSlots` | `executed` | `remaining` |
|---:|---|---|---|---:|---:|---:|---:|---:|
| **`743000`** | `2QEjDdoZSxzCdydhRYB5zhikTUHdfdAuagPRD275h6eM` | `0–7` | **8** (`0–7`, all occupied) | **STALLED** | `1,169,131,680` | `+64,320` (~10.7 min) | `179` | `999,821` |
| **`743008`** | `CWRr3KWbzadFK85jQB42hj7Uka4WakYkDjeqKgQohWD9` | `8–15` | **8** (`8–15`, all occupied) | **STALLED** | `1,169,139,199` | `+56,801` (~9.5 min) | `180` | `999,820` |
| **`743016`** | `A335J8CBMZPrM4kY1621hf61N3wsGgNQcjZksy7g2ar9` | `16–23` | **0** (all empty no-ops) | **RUNNING** | `1,169,199,129` | `-3,129` | `4,439` | `995,561` |
| **`743024`** | `4HUM4qkDWYqPHp9gG8icNZGYf2P3RByaXK34sP2MYnzg` | `24–31` | **1** (pilot `slot 31`) | **STALLED** | `1,169,121,428` | `+74,572` (~12.4 min) | `4,426` | `995,574` |

---

## 2. Root Cause (Confirmed From On-Chain Error Logs) **[ON-CHAIN]**

All three stalled cranks failed with **`InstructionError: [ix_idx, "Immutable"]`** at the exact moment a slot in their 8-slot group was temporarily undelegated (~4–6 s) during the Phase 2 rollout:

- **`743000`:** Last 3 ER txs (`ZsVg3rbg…`, `3X7oxEqE…`, `5UAyVMph…`) at slots `1,169,131,745..1,169,131,937` (`08:10:42–44Z`) failed with `InstructionError: [2, "Immutable"]` while batch `[0, 1]` was undelegated on base devnet.
- **`743008`:** Last 3 ER txs (`3FyrVQfZ…`, `wtNps74s…`, `3TrBo5TL…`) at slots `1,169,139,264..1,169,139,456` (`08:11:57–59Z`) failed with `InstructionError: [6, "Immutable"]` while batch `[12, 13]` was undelegated.
- **`743024`:** Last 3 ER txs (`5vLpZWBE…`, `QoVytXhR…`, `67kmsTD8…`) at slots `1,169,121,493..1,169,121,685` (`08:08:59–09:01Z`) failed with `InstructionError: [5..6, "Immutable"]` while batch `[28, 29]` was undelegated.
- **`743016`:** Did not happen to fire during the brief undelegation windows of `16–23`, so it kept running normally.
- **Why they did not self-recover:** Hydra (`core 2.0.5`) stops retrying a crank after consecutive execution failures and leaves it overdue until replaced or closed (after `STALENESS_THRESHOLD_SLOTS = 17,280,000` slots, ~48 h).
- **Treasury is NOT the cause:** `FNdEiiZn…` currently holds **`1.40985852 SOL`** on the ER (well funded).

---

## 3. Impact Assessment **[ON-CHAIN]**

- **World time & simulation:** **UNAFFECTED.** All 3 replacement 30 s clock cranks (`744001`, `744101`, `744117`) are executing normally (`executed: 33, 17, 24` at `08:21 UTC`), and all 32 V2 worlds + V1 demo settlement are ticking cleanly.
- **Checkpoint durability:** **AFFECTED for 17 occupied slots (`0–15` and `31`).**
  - Slots `0–14` last checkpointed around ticks `127,564–137,748` (`17,746` for slot `14`) shortly before the rollout.
  - Slot `15` (`Ea5KPPzw`, newly claimed) and pilot slot `31` (`GVbuuocW`) have `0` checkpoints recorded on base devnet.
  - Until `743000`, `743008`, and `743024` are recovered, no new hourly durable snapshots of slots `0–15` and `31` will be committed to Solana devnet base layer, and the 3 stalled cranks will become permissionlessly closable in ~47.8 hours.

---

## 4. Recovery Recommendation, Procedure & Cost

- **Is recovery necessary?** **Yes** — recommended before starting Phase 3 work so all 17 occupied V2 worlds resume hourly base-layer checkpoints.
- **Safest recovery procedure (in-place atomic replacement, identical to the previously verified MB004 / checkpoint-recovery procedure):**
  ```bash
  source ~/.astrix-secrets/env.sh
  cd /home/antigravity/Astrix/chain/client
  npx tsx scripts/astrix.ts schedule-checkpoints 0 743000 60000
  npx tsx scripts/astrix.ts schedule-checkpoints 8 743008 60000
  npx tsx scripts/astrix.ts schedule-checkpoints 24 743024 60000
  ```
  Each command atomically replaces its crank in Hydra (`Cancel` + `Create` in one ER tx) without touching any other crank (`744xxx` or `743016`), any world account, or the treasury.
- **Verification after recovery (read-only, after ~65 s):**
  - `npx tsx scripts/crank-inventory.ts` confirms `overdueSlots <= 0` and `executed >= 1` on `743000`, `743008`, and `743024`.
  - `npx tsx scripts/astrix.ts passports 32` confirms `checkpoints` increment on due worlds (including slots `0–15` and `31`).
- **Cost:**
  - Reschedule transactions (3 ER txs): **`0 SOL`**.
  - Ongoing commit fees (paid from existing `1.40985852 SOL` ER treasury balance, **no treasury top-up needed**): ~`0.00044–0.00187 SOL` per checkpoint (~`0.007–0.032 SOL/hr` across 17 claimed worlds, covered for multiple days by the existing ER treasury balance).
