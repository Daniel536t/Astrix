# MB004: Renewal of the devnet tick cranks (temporary stopgap)

**Scope.** Devnet only: Solana devnet plus the MagicBlock devnet ER EU (`https://devnet-eu.magicblock.app`).
No mainnet action, no program upgrade or redeploy, no undelegation, no commit. Owner approval (verbatim):
"Crank: Renew the existing devnet crank as a temporary stopgap. I want the demo settlement to continue
progressing while the new world clock is developed. First verify that renewal cannot cause duplicate ticks or
conflicting execution when the new clock is introduced. Keep the temporary crank until the replacement has been
tested successfully."

Labels: **[CHAIN]** read from devnet in this session · **[SRC]** read in source, not executed ·
**[INF]** inference · **[UNVERIFIED]** not verified.

Program `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy`. Task authority (CLI wallet, `ASTRIX_WALLET` default
`/projects/sandbox/.tools/wallets/astrix-devnet.json`): `GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32`.
Secret keys were not printed or copied.

Sections 1 and 2 were written **before** any transaction was sent.

## 1. Inventory (read-only, 2026-11-26 21:37 UTC, ER slot 1,165,331,969)

**Scheduler.** `getVersion` on devnet-eu, devnet-us and devnet-as all return `core 2.0.5`, git `380360a`
**[CHAIN]**. That is the 2.x line: `ScheduleTask` creates a Hydra crank account owned by
`eHyd5BU8QffvHi4GnXwxrK4WpS7pM2x9UGKHBWii7mf`, and an external cranker fires it. This is not the 1.1.1 SQLite
scheduler. ER validator identity: `MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e`.

**Method.** Crank PDA = `PDA(["crank", sha256(authority ‖ task_id i64 LE)], eHyd5…)`
(`research/magicblock/src/validator-master/task-scheduler/src/crank.rs:7-19`). The header and the scheduled
instructions are decoded per `hydra/crates/hydra-api/src/state.rs` (script `chain/client/scripts/crank-inventory.ts`).
A `getProgramAccounts` scan of every Hydra crank whose first scheduled instruction targets the ASTrix program
(`crank-scan.ts`) found exactly these 7 cranks and no others. Raw data: `inventory-pre.jsonl`, `scan-pre.jsonl`,
`slot-map.txt`.

| Task | Crank account | Ticks | Interval | Remaining | Executed | State | Est. exhaustion |
|---|---|---|---|---|---|---|---|
| 742001 | `8wz5UkLx6hoQ1AHtSo5VgSrUk3yBy4BwxiugCVssmo2R` | `tick` on the demo settlement `4PV6Ks9y…maxzw` | 200 slots (2,000 ms requested) | 78,022 | 121,978 | running | **≈ 2026-11-28 17:16 UTC** |
| 742101 | `2SEs5n2snEsyvjF8anD2xkqRk85yGCBpx8fzqhfH6Yi6` | 16 × `tick`, world slots 0–15 | 200 slots | 79,220 | 120,780 | running | **≈ 2026-11-28 17:56 UTC** |
| 742117 | `56rHBpVCSpwK42aG9vgEHZkprNbVqzRVwb2VCbhLfQzo` | 16 × `tick`, world slots 16–31 (all unclaimed, so no-ops) | 200 slots | 86,164 | 113,836 | running | **≈ 2026-11-28 21:49 UTC** |
| 743000 | `2QEjDdoZSxzCdydhRYB5zhikTUHdfdAuagPRD275h6eM` | 8 × `checkpoint`, slots 0–7 | 6,000 slots | 998,065 | 1,935 | **stalled**: next_exec_slot 11.2 M slots in the past | n/a |
| 743008 | `CWRr3KWbzadFK85jQB42hj7Uka4WakYkDjeqKgQohWD9` | 8 × `checkpoint`, slots 8–15 | 6,000 slots | 998,025 | 1,975 | **stalled** (11.0 M slots overdue) | n/a |
| 743016 | `A335J8CBMZPrM4kY1621hf61N3wsGgNQcjZksy7g2ar9` | 8 × `checkpoint`, slots 16–23 | 6,000 slots | 996,205 | 3,795 | running (all no-ops: unclaimed) | years |
| 743024 | `4HUM4qkDWYqPHp9gG8icNZGYf2P3RByaXK34sP2MYnzg` | 8 × `checkpoint`, slots 24–31 | 6,000 slots | 996,205 | 3,795 | running (all no-ops) | years |

All 7 cranks have Hydra `authority` = the validator `MEUGG…` (it is the sponsor and cancel authority), `cu_limit 0`,
`priority_tip 0` and `authority_signer 1` **[CHAIN]**. The scheduled `tick` data is the Anchor discriminator
`5c4f2c0865503f0f` with a single writable account per instruction.

**Observed cadence.** Task 742001 was scheduled at 2026-11-24 01:33:09 UTC (tx `2C6Ranu…Hu`, which decodes to
ScheduleTask id 742001, 2,000 ms, 200,000 iterations). It had executed 121,978 times by 21:37:07 on 11-26. That is
**2.014 s per execution**, so a 200-slot interval implies an ER slot time of about 10 ms on devnet-eu. The estimated
exhaustion times above are remaining iterations × 2.014 s **[INF from CHAIN]**.

**Last executions [CHAIN]** (`crank-observe.ts`). Every recent transaction on the settlement and on world slots is
signed only by `8hwzNBBP19tmy7R9udyWkm6ne5y4TA1J1TEYTnWqsJNy`, with fee 0. The top-level programs are
`[eHyd5… (Trigger), Gge4… × n]`, so the ticks run top-level after the Hydra Trigger. Examples:
- Settlement: `3xFVxcPk…6scy` at 21:36:42 (`tick 121359`, 5,377 CU), `3QGaJBES…VTas` at 21:36:40 (`tick 121358`).
- Slots 0–15: `4GktgXuk…WxP` at 21:36:43 (15 tick logs, 76,847 CU).
- Slots 16–31: `ScDJFdpi…6g9` at 21:36:46 (no tick logs, 55,101 CU).

**Settlement and world state [CHAIN].** Settlement ER tick 121,346 (base snapshot 430). Slots 0–14 are claimed,
with ticks between 499 and 120,508. Slots 15–31 are unclaimed.

**Finding outside the scope of this task (not changed).** The checkpoint treasury `FNdEiiZn…xQks` holds
**858,520 lamports on the ER**, down from 200,858,520 (the base copy still shows 200,858,520). Passports 0–13 stopped
at 30–33 checkpoints (last checkpointed ticks 54k–64k). The most likely cause is that commit fees drained the delegated
treasury, so every `checkpoint` in 743000/743008 fails and Hydra never advances the crank **[INF]**. Hydra makes a
crank that is overdue by `STALENESS_THRESHOLD_SLOTS` (17.28 M ephemeral slots, about 48 h at the observed 10 ms
slots) closable by anyone (`hydra-api/src/consts.rs:84`) **[SRC]**, so these two cranks may be closed by third
parties within about a day. The tick cranks are not affected. Fixing this needs SOL and commits, which is out of
scope here.

## 2. Safety analysis (written before sending)

### (a) Can a renewal create duplicate ticks?

1. **Re-scheduling the same task id replaces the crank.** In 2.x the crank address is deterministic from
   `(authority, task_id)`. When the address already holds a Hydra crank, the scheduler submits **`Cancel` and `Create`
   in one transaction** (`validator-master/task-scheduler/src/service.rs:136-174`) **[SRC]**. If that transaction
   fails, the old crank is untouched, because the two instructions are atomic. Same-id re-scheduling therefore
   can never leave two cranks for one task id. Caveat: the clone is at `543fd3f` (version 2.0.5), while devnet runs git
   `380360a`, which is not in the clone. The behaviour is checked on chain in §3 step 1 before the real cranks are
   touched.
2. **A new task id adds an independent crank.** Both would then run until the old one is exhausted, and each world
   would receive two `tick` calls per interval.
3. **`tick` is clock-gated** (`chain/programs/astrix-settlement/src/lib.rs:201-209`) **[SRC]**. It returns early
   for unclaimed worlds, and it returns early unless `Clock.unix_timestamp ≥ last_tick_ts + tick_interval_s` (2 s).
   On a pass it sets `last_tick_ts = now` and then `tick += 1`. All state writes happen inside one instruction, and
   the account write lock serialises concurrent cranks. So even with two cranks, a world advances **at most once per
   2 s of ER clock**, and every extra call is a no-op that only spends an iteration. Duplicated cranks cannot
   double-apply crops, the sawmill, food or population.
4. **Decision.** Renew by **re-scheduling the same ids** 742001, 742101 and 742117 with the same accounts and
   interval, and with 1,400,000 iterations (≈ 32.6 days at the observed 2.014 s). This avoids even the harmless
   overlap, keeps one known id per world group, and keeps the cancellation procedure unchanged. A finite count is
   used instead of `i64::MAX` (infinite), so the stopgap expires on its own if nobody cancels it. The replace path
   is proven first on a throwaway task (`749931`, a single no-op `tick` on unclaimed slot 31). Then 742117 (all
   no-op worlds) is replaced before the two live cranks.

### (b) Can a future world-clock upgrade conflict with a still-running old task?

A Hydra crank stores the exact instruction bytes: program `Gge4…`, discriminator `tick`, and the account list.
`Trigger` byte-compares them against the template and then runs whatever code the program has **at that time**
(`hydra/programs/hydra-ephemeral/src/processor/trigger.rs`) **[SRC]**. After an upgrade, the old crank therefore
invokes the **new** program's `tick` handler.

- If `tick` is removed, or its accounts change, every Trigger fails. Hydra does not advance a failing crank, so it
  stalls: no state change, retries by the cranker, and it becomes permissionlessly closable after ≈ 17.3 M slots.
  That is harmless to world state, but it is noise.
- If the old `tick` (+1 per call) stays alongside a new `settle(now)` that derives `world_tick` from
  `(now − epoch)/2`, the two would **conflict**. Both would advance the same world in different ways.
- If the `Settlement` layout changes and `tick` still deserialises the old layout, it would fail (stall) or, in the
  worst case, misinterpret fields.

**Required constraints for the world-clock change [INF]:**

1. In the same upgrade that introduces `settle`, `tick` must keep its discriminator and its single-account
   signature, and become an **alias for `settle(now)`**, or a no-op that returns `Ok`.
2. `settle` must be idempotent and monotonic (`last_settled_tick` never decreases; a second call at the same
   `now` does nothing), so old and new cranks firing together are harmless.
3. The new clock's crank must use **new task ids** (for example 744xxx), and only one crank group per world should
   be live once the replacement is accepted.
4. Test the replacement first on accounts that the temporary cranks do not touch (a separate program id or
   separate test slots). Cancel 742001/742101/742117 only after that test passes, as the owner instructed.
5. Keep the total per-crank CU under 1.4 M with 16 `settle` calls (today 16 ticks use about 77k CU) **[CHAIN]**.

### (c) How the temporary crank is cancelled later

The program has no cancel instruction (`lib.rs` has `cancel_prospect` only). None is needed: 2.x
`MagicBlockInstruction::CancelTask { task_id }` can be sent top-level by the task authority. Account 0 is the
authority as a signer; data is u32 LE variant **7** followed by `task_id` as i64 LE
(`validator-master/programs/magic-program/src/schedule_task/process_cancel_task.rs`,
`magic-interface/src/instruction.rs:117`) **[SRC]**. The variant numbering was cross-checked against the original
schedule transaction, whose inner Magic instruction begins `06000000` (ScheduleTask = 6) **[CHAIN]**. The scheduler
then submits Hydra `Cancel` asynchronously. Cancelling a missing crank is a no-op. This path is exercised on chain
on task 749931 before the real cranks are renewed (§3 step 1).

**Conclusion before sending:** renewal by same-id re-schedule is safe. It cannot cause duplicate execution beyond
clock-gated no-ops, and the cranks can be cancelled later by the wallet `GVbu…`. The conditions are that §3 step 1
confirms replace-in-place and cancel on the deployed 2.0.5, and that the world-clock upgrade follows constraint (b)1.

## 3. What was sent (all on the devnet ER, signed by `GVbu…`, 2026-11-26)

| # | UTC | Action | Signature | Result **[CHAIN]** |
|---|---|---|---|---|
| 1a | 21:39:59 | Test: `schedule-worlds 749931 2000 1 31 30` (one `tick` on unclaimed slot 31; 30 iterations) | `2dis3ekcTZUiSmWqdTZE2Utw7NFFQpsapHRj9mNZ7gd3nh9wrMJ56EpjKv1DnCDtYCgF1bbh7nAhvqUKFbiigwCp` | Crank `F6ujbhsV1hdzdaddsNSkjk7SVeqMLVeeHLsMiTdzgP8i` was created and executed (`inv-01-test.jsonl`) |
| 1b | 21:40:19 | Test: re-schedule the **same id** 749931 with 40 iterations | `4dpthbJPDYeGgiM1HesRN2eunmLiwbagLcSPncs6XWJ7PxzHq4KdcSJQmU4y5K64cmUFJBbCYhPVhdsxnuGQoCv1` | Same crank address; `executed` reset 9 → 4, `remaining` 21 → 36 of 40. The validator sent one tx `4VHp3AAH…Ti5` = Hydra Cancel + Hydra Create + nonce. **Replace in place confirmed.** |
| 1c | 21:40:36 | Test: `cancel-task 749931` (Magic `CancelTask`, top-level) | `2w3LMtXeUDVkXe1pERkfbBDMuqLSaAZcb2svqvh4Nhk3Ydk5mS8k3DVaEu24ziNA9o6jLv3ifjzN6KxQuQkTRYjZ` | Validator Hydra Cancel `C4QC6TMW…3Ws`. The crank account is gone; the scan is back to 7 cranks. **Cancel confirmed.** The cranker then sent 10 Trigger attempts at the closed crank within 4 s. All failed with `InvalidAccountOwner`, so they changed no state (`test-crank-history.jsonl`). |
| 2 | 21:41:09 | Renew **742117**: `schedule-worlds 742117 2000 16 16 1400000` | `Qk8rV7rMAUUioekcDSGG8EHiNDe1nLXs69wAjbPR78v7EBYDcuC53ZCcuE3PAhZG7rWN1ZFkye2Hi73mjsB5ebf` | Validator replace `2n5Df31n…gKY` |
| 3 | 21:41:28 | Renew **742101**: `schedule-worlds 742101 2000 16 0 1400000` | `41ZF3RxpzcTgAEFr7QfJAjW7fe5FByJwMzg1FjiYw3CCCVxj3W5scwWo5ta5BFpzTszdMNEUSguz97GVpRcZeGyJ` | Validator replace `5Vhiy4mm…ut39` |
| 4 | 21:41:31 | Renew **742001**: `schedule 742001 2000 1400000` | `31cZgYwi4SVcT6VvDsMqkG2rMBGkd1xknJ1dnQ29UGhgd2922WRkjz2TYLnBJpW63TwaaBEWN7r4GJyu6JRtWYn8` | Validator replace `2Y63sEMUwfoeLHjcPcMVBpmFcfTj2DNskGMxHxTfKQe2Z1AWpUkmtLmPEjb9ZMyETsiBQshP8dAVXCr9rUp3MxBd` |

Each validator replace transaction is `eHyd5 (Cancel) + eHyd5 (Create) + MagicRoot (nonce)`, signed by `MEUGG…`.
Raw CLI output: `tx-0*.json`.

**Cost.** The wallet balance was 6,693,961,240 lamports before and after, on both the ER and Solana devnet. All
6 transactions cost **0 devnet SOL** (ER base fee 0). The validator pays for the crank accounts, which hold 0
lamports. No mainnet transaction of any kind was sent.

## 4. Result

**Before and after [CHAIN]** (`inventory-pre.jsonl` vs `inventory-post.jsonl`, compared by script):

| Task | Crank account | Accounts/instructions | Interval | Remaining | Executed | New est. exhaustion |
|---|---|---|---|---|---|---|
| 742001 | unchanged | byte-identical | 200 slots | 78,022 → 1,399,995 (6 s after) | 121,978 → 5 | ≈ 2026-12-29 12:50 UTC |
| 742101 | unchanged | byte-identical | 200 slots | 79,220 → 1,399,993 | 120,780 → 7 | ≈ 2026-12-29 12:50 UTC |
| 742117 | unchanged | byte-identical | 200 slots | 86,164 → 1,399,984 | 113,836 → 16 | ≈ 2026-12-29 12:50 UTC |
| 743000–743024 | unchanged | unchanged | 6,000 slots | not touched | not touched | n/a |

After the renewal, the scan of all Hydra cranks targeting ASTrix still finds **exactly 7**
(`scan-post.jsonl`). No second tick crank exists for any world.

The estimates assume the observed 2.014 s per execution, which follows from the 10 ms ER slot time. If MagicBlock
changes the ER slot time, real-time duration scales with it, because the interval is fixed at 200 slots.
1,400,000 iterations is ≈ 32.6 days at the observed cadence.

**Tick progression on the demo settlement `4PV6…` [CHAIN]** (`crank-history-8wz5….jsonl`,
`observe-post-settlement.jsonl`):

```
21:41:28  8hwz…  tick 121502
21:41:30  8hwz…  tick 121503          last run of the old schedule
21:41:31  MEUGG… Cancel+Create        2Y63sEMU… (replacement)
21:41:31  8hwz…  (no tick log)        4JhWoGwb… first run of the new crank: start_slot = now, clock gate makes it a no-op
21:41:33  8hwz…  tick 121504          5DKVodsi…
21:41:35  8hwz…  tick 121505          3RwjqKRz…
21:41:37  8hwz…  tick 121506          gq2x6Jvx…
 …        one tick every 2 s, 40 of 40 txs signed by 8hwz…, 0 failed
21:42:49  8hwz…  tick 121542          51NMy57d…
21:44:08  (read) tick 121584
```

Over the replacement there was no skipped tick and no double tick: the counter went exactly +1 per 2 s. World slot 0
(`observe-post-slot0.jsonl`) shows the same pattern: ticks 120664 → 120703, one per 2 s, 15 tick logs per crank run
(slot 15 is unclaimed), all signed by `8hwz…`. In the 100 most recent transactions of each of the three tick crank
accounts, **0 failed**.

## 5. Cancellation procedure (for when the new world clock has passed its test)

Do this only after the replacement world clock has been tested successfully (owner instruction). From
`Astrix/chain/client` (with `npm ci` done once), using the authority wallet
`/projects/sandbox/.tools/wallets/astrix-devnet.json` (`GVbu…`):

```
npx tsx scripts/astrix.ts cancel-task 742001   # demo settlement
npx tsx scripts/astrix.ts cancel-task 742101   # world slots 0-15
npx tsx scripts/astrix.ts cancel-task 742117   # world slots 16-31
npx tsx scripts/crank-inventory.ts             # expect "exists": false for each of the three
npx tsx scripts/crank-scan.ts                  # expect only the checkpoint cranks (plus any new-clock cranks)
```

- The instruction is the Magic program `CancelTask { task_id }`, sent top-level. Data: `07000000` followed by
  `task_id` as i64 LE. Account 0 is the authority (signer, writable). This was proven on 749931 in step 1c.
- The cancel is asynchronous. The validator submits Hydra `Cancel` about 0–2 s after the transaction. Expect a short
  burst of failed cranker Triggers afterwards; they are harmless.
- Only `GVbu…` can cancel these ids. Cancelling an id twice is a no-op.
- If nobody cancels, the cranks stop by themselves after 1,400,000 runs (≈ 2026-12-29).
- **Order with the program upgrade.** Under constraint (b)1, the upgrade that introduces `settle` must turn `tick`
  into an alias for `settle` or a no-op. With that in place, the temporary cranks can stay running safely until
  the replacement passes its test, and can be cancelled afterwards. If an upgrade ever removes `tick`, cancel these
  three cranks first. Otherwise they will stall: harmless to state, but noisy.

## 6. Not verified / limitations

- **Ticks after 2026-11-28 17:16 UTC** (the old exhaustion time) have not been observed, because that time is in the
  future. What was verified is that `remaining` was reset to 1,400,000 and that ticks continue under the replaced
  cranks. Check again after 11-28 with `crank-inventory.ts` and `crank-observe.ts settlement 10`.
- **Deployed scheduler source.** Devnet runs git `380360a`, which is not in the local clone (`543fd3f`, also 2.0.5).
  Replace-in-place and cancel were therefore verified behaviourally on chain (§3 step 1), not by reading the
  deployed source.
- Behaviour across an ER restart, region failover, or a switch of the validator line is **[UNVERIFIED]**. If the
  ER is reset, the cranks could disappear; the inventory script detects this.
- Who operates cranker `8hwz…`, and whether it keeps running, is **[UNVERIFIED]**. It is MagicBlock
  infrastructure, and there is no SLA.
- Slot 31 was ticked by both 749931 and 742117 for about 40 s during the test. Both calls were no-ops because the
  slot is unclaimed.
- **Checkpoint cranks 743000/743008 are stalled.** The treasury is most likely drained on the ER (§1). They were
  not touched; this needs a separate owner decision, because fixing it costs SOL.

## Files

- Client changes (not committed):
  - `chain/client/scripts/astrix.ts`: `schedule-worlds` takes an optional 6th argument `[iterations]` (default
    unchanged at 200,000), and a new `cancel-task <taskId>` command.
  - New read-only scripts: `crank-inventory.ts`, `crank-scan.ts` and `crank-observe.ts`.
  - `npm ci` created the gitignored `chain/client/node_modules/`.
- Evidence in this folder:
  - Inventories: `inventory-pre.jsonl`, `inventory-post.jsonl`, `inventory-final.jsonl`, `scan-*.jsonl`,
    `slot-map.txt`, `passports-pre.txt`, `worlds-final.txt`.
  - Transactions and observation: `tx-0*.json`, `inv-0*.jsonl`, `test-crank-history.jsonl`,
    `crank-history-*.jsonl`, `observe-post-*.jsonl`.
