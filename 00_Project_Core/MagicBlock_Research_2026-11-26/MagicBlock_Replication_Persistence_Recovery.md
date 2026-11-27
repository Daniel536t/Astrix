# MagicBlock replication, persistence, commitment and recovery for ASTrix

Research only. Nothing in `/projects/sandbox/Astrix` was modified. Nothing was deployed, no keys or accounts were created, and no transactions were sent on any network, including devnet.
**Check date for every source below: 2026-11-26.**

## Evidence labels

| Label | Meaning |
|---|---|
| **[DOC]** | Officially documented by MagicBlock or Solana |
| **[SRC]** | Verified in source code (repo, commit, path:line given) |
| **[EX]** | Demonstrated in an example (MagicBlock examples or dev skill) |
| **[BENCH]** | Independently benchmarked. Only ASTrix's own measured evidence qualifies; I ran no benchmarks. |
| **[INF]** | Architectural inference |
| **[UNK]** | Unknown. A question for MagicBlock is given. |
| **[EST]** | An estimate I calculated from cited inputs. It is not a measurement. |

All quotes are paraphrased.

---

## 0. Sources (all checked 2026-11-26)

### Source code (shallow clones under `/projects/sandbox/research/magicblock/src/`)

| ID | Repo @ commit (date) | Local path | Web |
|---|---|---|---|
| S1 | magicblock-validator `v1.1.1` tag @ `493729d` (2026-10-21). This is the V1 line that most public ERs report as `magicblock-core 1.1.1`. | `src/validator-v1.1.1/` | https://github.com/magicblock-labs/magicblock-validator/tree/493729d202f702e8388ba6a15df054c0ce9c7d29 |
| S2 | magicblock-validator `master` @ `543fd3f` (2026-11-25). This is V2; devnet-us runs 2.0. | `src/validator-master/` | https://github.com/magicblock-labs/magicblock-validator/tree/543fd3f4fe9cbafc49254e28faf668928dec738d |
| S3 | magicblock-engine tag `0.26.4` @ `8ed0c92` (2026-11-25). V2 pulls in its accountsdb, ledger, replicator and keeper from here (S2 `Cargo.toml:84-91`). | `src/engine-0.26.4/` | https://github.com/magicblock-labs/magicblock-engine/tree/0.26.4 |
| S4 | delegation-program `main` @ `7f3017e` (2026-11-25) | `src/delegation-program/` | https://github.com/magicblock-labs/delegation-program/tree/7f3017e0c1384cbcf2b9b7ea6592333f0d9fb0f7 |
| S5 | ephemeral-rollups-sdk @ `4545ccf` (2026-11-18) | `src/ephemeral-rollups-sdk/` | https://github.com/magicblock-labs/ephemeral-rollups-sdk |
| S6 | MagicBlock docs source @ `832ccae` (2026-11-19) | `src/docs/pages/` | https://docs.magicblock.gg |

Caveat: the production ERs run validator commit `8886db2` on the V1 branch, not the `v1.1.1` tag (S8 fees page, section "Verify the current numbers"). I did not clone `8886db2`. V1 claims below are from the tag and may differ in detail.

### Official documentation (web)

| ID | URL |
|---|---|
| S7 | https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/runtime-limits (local copy: `src/docs/pages/ephemeral-rollups-ers/introduction/runtime-limits.mdx`) |
| S8 | https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/fees-and-commit-economics (fetched live; the page says its values were checked 2026-11-19) |
| S9 | https://docs.magicblock.gg/pages/overview/additional-information/pricing (fetched live) |
| S10 | https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-rollup (`…/ephemeral-rollup.mdx`) |
| S11 | https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/faq (`…/faq.mdx`) |
| S12 | https://docs.magicblock.gg/pages/ephemeral-rollups-ers/magic-actions/overview (local copy `research/magicblock/docs/ephemeral-rollups-ers_magic-actions_overview.md`) |
| S13 | https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/pricing |
| S14 | https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/magic-router |

### MagicBlock dev skill and examples (local)

- **S15:** `/projects/sandbox/.tools/magicblock-dev-skill-main/skill/references/`. Files used: `fees-and-commit-economics.md`, `delegation.md`, `cranks.md`, `resources.md`, `ephemeral-accounts.md`.
- **S16:** `/projects/sandbox/.tools/magicblock-examples-main/00-LEGACY_EXAMPLES/`. Examples used: `anchor-counter`, `magic-actions`, `crank-counter`.

### Solana

| ID | Source |
|---|---|
| S17 | https://solana.com/docs/core/fees/fee-structure |
| S18 | https://solana.com/docs/core/accounts and https://solana.com/docs/core/accounts/account-runtime |
| S19 | https://solana.com/upgrades/reduced-rent and https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0437-incremental-rent-reduction.md |
| S20 | https://solana.com/upgrades/100m-cu-blocks and https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0306-raise-account-cu-limits.md |

solana.com returned HTTP 429 to direct fetches. The S17–S20 facts come from official solana.com and SIMD pages as indexed by search. Re-read those pages before relying on them.

### Third-party pricing pages

| ID | URL |
|---|---|
| S21 | https://www.helius.dev/docs/billing/credits |
| S22 | https://www.hetzner.com/dedicated-rootserver/ax42/ |

### ASTrix (read-only; paths relative to `/projects/sandbox/Astrix/`)

| ID | Path |
|---|---|
| A1 | `00_Project_Core/MagicBlock_Architecture_2026-11-23.md` |
| A2 | `00_Project_Core/MagicBlock_Architecture_2026-11-24_status.md` |
| A3 | `00_Project_Core/Identity_and_Persistence_Architecture_2026-11-24.md` |
| A4 | `chain/programs/astrix-settlement/src/lib.rs` |
| A5 | `Game/src/app/session.ts` |
| A6 | `Game/src/sim/snapshot.ts` |
| A7 | `Game/src/app/persistence.ts` |
| A8 | Reports under `13_Integration_and_QA/Evidence/`: `W5-W8/W5-REPORT.md`, `W5-W8/W7-REPORT.md`, `W5-W8/W8-REPORT.md`, `STAB-002-stabilization/REPORT.md`, `MB001-devnet-20261124/REPORT.md`, `MB003-identity-persistence-20261124/REPORT.md` |

---

## 1. Replication, persistence, commitment and recovery

### 1.1 Six terms kept separate

| Term | What MagicBlock has | Label |
|---|---|---|
| **Transaction replication** | **V1:** the primary publishes every transaction, block and superblock to a NATS JetStream stream; replicas re-execute them (S1 `magicblock-replicator/src/lib.rs:1-13`, `nats/mod.rs:30-60`). **V2:** the leader serves ordered history over authenticated TCP; followers ("verifiers") re-execute it (S3 `replicator/README.md:3-6`). S3 `README.md:115-117` calls this replication of execution, not consensus between peers. | [SRC] [DOC-in-repo] |
| **State replication** | Snapshot bootstrap only: a fresh follower installs the newest snapshot, then streams (S3 `replicator/README.md:35-46`; S1 `magic_validator.rs:196-226`). State checksums at superblocks or checkpoints detect divergence (S1 `service/replica.rs:129`; S3 `replicator/README.md:13-18`). | [SRC] |
| **Durable storage** | One validator's local disk. V1: an mmap AccountsDB file, an LMDB index and a RocksDB ledger. V2: Engine AccountsDB plus the Engine ledger. Details in 1.2. | [SRC] |
| **Solana settlement** | On demand only, when the program schedules a commit. Validators do not commit delegated accounts automatically (S10 `ephemeral-rollup.mdx:39-44`). Only the delegation record's `authority` validator can commit (S4 `program/src/legacy/processor/fast/commit_state.rs:208-216`). | [DOC] [SRC] |
| **Independent verification** | Legacy path (production today): none. Finalize treats state as valid because a whitelisted validator committed it (S4 `fast/finalize.rs:54`). The docs say commits are finalized by a fraud-proof mechanism (S10 `ephemeral-rollup.mdx:43`). A V2 challenge/bond system exists in source (S4 `interface/src/instruction.rs:7-48`, `interface/src/state/delegation_cluster.rs:4-75`), but its disputes are settled by a multisig `resolver`, not by on-chain re-execution. Whether it is deployed or used by public ERs is unknown. V2 verifiers check execution for their own operator only, and their result does not transfer as proof to anyone else (S3 `engine/README.md:41-42`). | [SRC] [DOC conflict] [UNK] |
| **Disaster recovery** | Restart from local disk: snapshot plus ledger replay (1.4). There is an owner-program escape hatch: `RequestUndelegation`, then after 9,000 slots `UndelegateWithRollbackAfterTimeout`, which returns the **last committed** state (1.7). I found no documented RTO/RPO, automatic failover or cross-operator takeover. | [SRC] [UNK] |

### 1.2 Where rollup state lives

**V1 (S1, the line production ERs run):**

AccountsDB [SRC]:
- It is one memory-mapped file, `accounts.db` (`magicblock-accounts-db/src/storage.rs:32`; mmap at `:83, :139-185`).
- It has a 256-byte header that holds the slot, and an LMDB index (`index.rs:4, 19-22`).
- The default size is 100 MiB (`magicblock-config/src/consts.rs:42`).
- Everything sits under the top-level `storage` directory (`config.example.toml:72-75`).
- `accountsdb.reset` wipes the directory (`magicblock-accounts-db/src/lib.rs:53-56`).

Snapshots [SRC]:
- A snapshot is taken every `ledger.superblock-size` slots. The default is 72,000, which the code comment equates to about 1 hour at 50 ms blocks (`consts.rs:57-58`).
- `take_snapshot` flushes, computes a checksum, and copies the data by reflink or deep copy (`lib.rs:292-303`; `snapshot.rs:22-60`).
- The copy is archived as `.tar.gz` and fsynced (`snapshot.rs:63-170`, `sync_all` at `:149`).
- `max-snapshots` archives are kept, default 4 (`consts.rs:48`).
- The checksum is xxHash3-64 over pubkey plus account bytes (`lib.rs:523-540`).

Ledger [SRC]:
- RocksDB, with column families for transaction status, transactions, signatures by address, block time and blockhash (`magicblock-ledger/src/database/columns.rs:32-90`).
- Default size cap is 100 GiB (`consts.rs:55`).
- A truncator deletes the oldest 10% of slots when the cap is reached (`ledger_truncator.rs:32-33`). **Transaction history is therefore not permanent.**

Commit queue [SRC]:
- SQLite (`magicblock-committor-service/src/persist/db.rs`).
- In-flight intent bundles up to 14 days old are recovered on start (`committor_processor.rs:39, 150-155`).
- Each intent gets 3 attempts with backoff (`intent_execution_engine.rs:54`).

Task scheduler (cranks) [SRC]: SQLite (`magicblock-task-scheduler/src/db.rs`).

**V2 (S2 and S3; devnet-us now, other ERs later):**

- **Persisted versus volatile state [SRC-doc].** Delegated, Magic (ER-created), Runtime and undelegating accounts are persisted. Mirrors of base-chain accounts are kept in memory and rebuilt (S3 `accountsdb/README.md:3-11`).
- **Snapshots [SRC-doc].** Superblocks pair an account snapshot with a sealed history segment (S3 `ledger/README.md:8-18`, `keeper/README.md:53-57`). Optional checksum checkpoints only detect divergence; they are not recovery points (S3 `ledger/README.md:16-18`).
- **Config [SRC].** The keys are `engine.accountsdb.directory`, `engine.ledger.directory`, `engine.ledger.size-limit` (default 100 GB), `engine.blockstore.superblock` (default 72,000) and `engine.blockstore.checkpoint` (S2 `config/src/config/engine.rs:137-202`, `config.validator.example.toml:103-122`).
- **Storage layout.** The migration guide recommends putting AccountsDB on a separate filesystem with copy-on-write support (S2 `docs/MIGRATION_V1_V2.md:48-56`).
- **Durability caveats [SRC-doc]:**
  - A finished execution has not necessarily reached disk (S3 `engine/README.md:24-26`; `README.md:130-133`).
  - Ordinary blocks are published buffered, without forced sync. A crash can leave data that has no index, and startup does not rebuild those indexes (S3 `ledger/README.md:28-36`).
  - Only a coordinated shutdown is a complete-history boundary (same file).
- **Maturity [SRC].** The Engine README badge says "status experimental" (S3 `README.md:12`).
- **Cranks [SRC-doc].** In V2 they move to Hydra, an external `hydra-cranker` service. The V1 `[task-scheduler]` section is removed (S2 `docs/MIGRATION_V1_V2.md:27-40, 147, 365-378`).

**Block time [SRC vs DOC].** The code default is 50 ms (S1 `consts.rs:52`; S2 `config/src/consts.rs:47`). The docs say about 10 ms and that slot times are not guaranteed (S7 `runtime-limits.mdx:16-21`; S11 `faq.mdx:23-25`).

### 1.3 Replicas, independent validators and trust model

**V1 replication [SRC]:**

- **Modes:** `ReplicationMode` is Standalone (default), Primary{url, secret} or Replica{url, secret, authority-override} (S1 `magicblock-config/src/config/validator.rs:27-48`; `config.example.toml:129-142`).
- **Transport:** NATS JetStream (`nats/mod.rs:30-60`):
  - stream `EVENTS`: 256 GiB, 24 h TTL
  - object store `SNAPSHOTS`: 5 GiB
  - KV `PRODUCER` lock: 15 s TTL
  - duplicate window: 30 s
- **Primary:**
  - Holds the producer lock and refreshes it. If it loses the lock it stops publishing until it reacquires it (`service/primary.rs:59-145`).
  - Publishes a block only after every transaction before it has been persisted to the stream.
- **Replica:**
  - Re-executes transactions, checks sequence continuity and verifies superblock checksums (`service/replica.rs:39-190, 129, 141`).
  - Runs with chainlink disabled and does not register on-chain (S1 `magic_validator.rs:636-647`).
- **No automatic promotion:** the service enters exactly the configured role and exits if a Primary cannot get the lock (`service/mod.rs:165-198`). A doc comment mentions `can_promote` (`:84-87`), but no code acts on it.

**V2 replication [SRC]:**

- **Verifier binary:** followers are a separate `magicblock-verifier` binary (S2 `bins/verifier/src/main.rs:41-107`).
- **Access control:** the leader has a follower allowlist, and an empty list admits nobody. Each follower trusts one configured `upstream-authority` (S2 `config/src/config/engine.rs:33-54`; S3 `replicator/README.md:20-31`).
- **What verifiers do not do:** they expose no application RPC and run no settlement or tasks (S2 `docs/MIGRATION_V1_V2.md:495-496`).
- **No failover path:** I found no leader election or promotion.

**Who can take over [SRC + INF]:**

- Only `DelegationRecord.authority` may commit or undelegate a delegated account (S4 `commit_state.rs:208-216`; record fields at `interface/src/legacy/state/delegation_record.rs:15-30`).
- A replica can therefore continue serving only if it runs under the **same validator identity key**, which is what V1 `authority-override` supports. A different operator's validator cannot resume a world without an undelegation and a new delegation.
- **V2 rotation:** the cluster model has `validator_rotation_authority` and `current_validator` fields (`interface/src/state/delegation_cluster.rs`, around lines 60-75). However, `UpdateDelegationCluster` copies `current_validator` through unchanged (`program/src/processor/bootstrap/update_delegation_cluster.rs:61-62`). I found no rotation instruction in this commit.

**Trust model [INF]:** single operator, single sequencer. Replication makes one operator's own service more available; it does not add independent trust. ASTrix must treat the ER operator as trusted for liveness and for the state it commits.

**[UNK] Q1:** Do the public ERs (devnet-eu/as/us, mainnet eu/us/as/sa/as-tyo) run replicas or verifiers? If the primary host is lost, is failover manual or automatic, and to which identity?

### 1.4 Primary crash, restart and uncommitted transactions

**V1 restart [SRC]:**

1. AccountsDB opens. If its slot is more than 1 ahead of the ledger, it rolls back to the newest snapshot at or below the ledger slot (S1 `magicblock-accounts-db/src/lib.rs:309-338`).
2. `maybe_process_ledger` replays the ledger forward from the AccountsDB slot (`magic_validator.rs:690-727`; `blockstore_processor/mod.rs:42-175`).
3. Commits scheduled during replay are cleared so they are not sent twice (`magic_validator.rs:723-727`).
4. Pending commits that survive come from the SQLite committor store.

**V2 restart [SRC-doc]:**

- Keeper validates storage against ledger progress and restores a retained snapshot if needed. Engine replays the rest. Startup refuses to proceed on a state mismatch (S3 `keeper/README.md:9-17`; `engine/README.md:81-91`).
- After restart the leader has an **empty processed-signature cache** (S3 `keeper/README.md:19-22`). Duplicate-signature protection across a restart therefore cannot be relied on.

**Fate of uncommitted ER transactions [INF from SRC]:**

- **Disk intact:** ER state survives up to the last block that was durably written. Delegated and Magic accounts are persisted in AccountsDB; that is the point of the ER storage. They return when the validator restarts.
- **Crash tail:**
  - Transactions that were acknowledged but not durably written can be lost. Execution does not imply disk sync (S3 `engine/README.md:26`).
  - V1 has no per-block fsync of the mmap. Explicit flushes happen only at snapshot or defragment time (S1 `lib.rs:292-295, 474-477`).
  - Transactions that were queued but never admitted are dropped (S3 `engine/README.md:93-101`).
- **Disk lost and no replica:** only the last **committed** state on Solana remains. Everything the ER did after that commit is gone. Ephemeral/Magic accounts never settle (S15 `ephemeral-accounts.md:14`), so they are lost entirely.

**Documented RTO/RPO [UNK]:** I found none in the docs, READMEs, AGENTS.md or the migration guide.

**[UNK] Q2:** What RPO and RTO do the public ERs target? Is the ledger fsynced per block? What is the backup and replication policy for the AccountsDB and ledger disks?

### 1.5 Commit frequency

- **The field exists [SRC].** `DelegationRecord.commit_frequency_ms` (S4 `delegation_record.rs:28-29`). The SDK default is `u32::MAX` (S5 `rust/pinocchio/src/types.rs:8-24`). ASTrix uses the SDK default (A4 `lib.rs:135-138, 356-358`).
- **It is not honoured [SRC].**
  - In V1 the periodic auto-commit crank built from `commit_frequency_ms` is dead code, commented "Currently disabled", referencing issue #625 (S1 `magicblock-account-cloner/src/lib.rs:289-316`).
  - In V2 the field appears only in tests (S2 `chainlink/...`).
  - The docs say commits happen when the program schedules them (S10 `:39-44`).
- **What controls frequency in practice [SRC/DOC]:**
  - The program calls `commit` or `commit_and_undelegate` (S5 `rust/pinocchio/src/instruction/commit.rs:65`, `commit_and_undelegate.rs:4`), or uses intent bundles (`intent_bundle/commit.rs:20-111`). A crank can drive this (S15 `cranks.md`).
  - ASTrix drives it from a crank with a tick gate: `checkpoint` runs every 1,800 ticks, or is forced, with at least 600 s between runs (A4 `lib.rs:461-490`; A3 `:64-73`).
- **Ordering [SRC].** Commits are strictly sequential per account: the nonce must equal `last_commit_id + 1` (S4 `commit_state.rs:163-169`; `fast/internal/commit_finalize_internal.rs:92-94`).
- **Limits [DOC]:**
  - Without a fee payer, an account can commit at most 10 times per delegation.
  - With a delegated fee payer and `magic_fee_vault` there is no cap, but commit 26 onward costs 0.001 SOL per account (S8 sections 2-3).

### 1.6 Reconstructing state from Solana, transaction history, snapshots

**From Solana [SRC/DOC]:**

- Only the last finalized commit of each delegated account is on Solana.
- Commit-record and commit-state PDAs are closed at finalize (S4 `fast/finalize.rs:166-189`), so the chain keeps no history of states. Base-layer commit transactions do remain in Solana's history, subject to RPC provider retention.
- Accounts larger than 10,240 bytes cannot be committed at all (S7 `:49-61`; S2 `programs/magic-program/src/intent_bundles/schedule/process_schedule_commit.rs:108-115`).

**ER transaction history [SRC]:**

- The ER RPC serves `getSignaturesForAddress` and `getTransaction` (S1 `magicblock-aperture/src/requests/http/get_signatures_for_address.rs`).
- That history is bounded by ledger retention (100 GB default, oldest 10% pruned).
- After a crash, V2 queryable history can be incomplete (S3 `ledger/README.md:33-36`).
- The Magic Router does **not** serve some methods, such as `getProgramAccounts` (S14 line 19).

**Account snapshots [SRC]:** these are operator-internal files (1.2). I found no public API for downloading them. **[UNK] Q3:** Can an application export, or be given, a snapshot of its delegated and Magic accounts?

**[INF] Consequence for ASTrix:** keep its **own** archive (journal plus checkpoints). The ER ledger is not an archive the game controls.

### 1.7 Rollup restart, interrupted delegation, prolonged outage

**Normal exit [SRC/DOC]:**

1. `commit_and_undelegate` from the ER.
2. The validator sends commit, finalize and undelegate to Solana. The delegation program calls back into the owner program via `EXTERNAL_UNDELEGATE_DISCRIMINATOR` (S4 `legacy/consts.rs:19-20`; `fast/undelegate.rs:195-258`).
3. Fee cleanup (S4 `fast/undelegate.rs:441-473`).

**Validator unresponsive (escape hatch) [SRC]:**

1. **`RequestUndelegation` (discriminator 26).** The owner program calls it via CPI, signing for the delegated PDA; the rent payer must match the metadata. It creates `UndelegationRequest{expires_at_slot = now + 9000}` (S4 `fast/request_undelegation.rs:33-150`; `legacy/consts.rs:14-16`).
   - The constant's comment assumes 400 ms slots, so about 60 minutes.
   - A live V1 validator watches for these requests and schedules commit-and-undelegate, with a 5-minute backfill poll (S15 `delegation.md:424-429`; S1 `config.example.toml:279`, `magicblock-config/src/config/chain.rs:76`).
2. **`UndelegateWithRollbackAfterTimeout` (27).** After expiry, the owner program reclaims the account with its **last base-chain state**.
   - Pending commit PDAs are cleaned up and **not applied**. The source explicitly warns of data loss.
   - The account is resized to 0, and the owner program's wrapper must save and restore the data around the call (S4 `fast/undelegate_with_rollback_after_timeout.rs:28-150`).
3. **SDK support.** SDK 0.17.3/0.18.0 has no Anchor wrapper for these, only `instruction_builder` re-exports (S15 `delegation.md:437-442`).
4. **ASTrix today [SRC]:** `astrix-settlement` has no instructions for request-undelegation or rollback (A4: grep finds only `undelegate` at `lib.rs:606-614`). **ASTrix currently cannot use this escape hatch without a program upgrade.**

**Migrating a world to another validator [SRC/INF]:**

1. `commit_and_undelegate` on the old ER, or the escape hatch if that ER is dead.
2. A base-layer `delegate` that names the new validator in `DelegateConfig.validator` (A4 `lib.rs:135-138`).
3. V2 Engine requires a re-delegation at a strictly newer slot (S3 `engine/README.md:62-63`).
4. Cost: a new delegation session, so a new deposit and session fee (Part 7).
5. Downtime: at least the base-layer confirmations for undelegate and delegate. [UNK: no documented timing.]

**Program whitelist [SRC].** If the owner program has a `ProgramConfig`, only approved validators may commit (S4 `commit_state.rs:242-259`; `interface/src/legacy/state/program_config.rs:12-26`). This limits which operators can ever hold ASTrix worlds.

### 1.8 Summary answers

| Question | Answer | Label |
|---|---|---|
| Where does rollup state live? | On the validator's local disk (AccountsDB mmap/Engine store plus ledger), with hourly-default snapshots. Base-chain mirrors are in memory. | [SRC] |
| Replicas? | Possible: V1 NATS replica, V2 verifier. Same operator, no consensus, no automatic promotion found. | [SRC] |
| Can another validator resume? | Only under the same identity key, or after undelegate plus redelegate. | [SRC]+[INF] |
| Uncommitted transactions | Survive a clean restart from disk. The crash tail can be lost. If the disk is lost, everything after the last commit is lost. | [SRC-doc]+[INF] |
| Commit frequency configurable per delegation? | Stored but not honoured. The program schedules commits. | [SRC] |
| Rebuild from Solana | Last committed account images only. No history. Accounts over 10,240 B cannot be committed. | [SRC]/[DOC] |
| Transaction history | ER RPC, bounded by retention (100 GB default). Can be incomplete after a crash. | [SRC] |
| RTO/RPO | Not documented. | [UNK] |
| Prolonged outage | Owner program: RequestUndelegation, then after 9,000 slots rollback to the last commit. ASTrix lacks the wrapper. | [SRC] |

---

## 2. Applied to ASTrix

### 2.1 What ASTrix has now (facts)

**On-chain program (A4):**
- `Settlement` is 240 B: tick, stock `[u32;8]`, 9 plots, population, session key and budget, packed rate-limit `actions` (`lib.rs:671-692`; A3 `:62`).
- `Passport` is 332 B and holds `state_hash` = sha256 of the account bytes, written at checkpoint (`lib.rs:767-784, 461-490`).
- `tick` is clock-gated, so a duplicate crank call does nothing (`lib.rs:201-241`).
- Checkpoint commits world plus passport through `MagicIntentBundleBuilder` paid from a treasury fee vault (`lib.rs:461-490`).

**Client:**
- **Journal entries:** each carries `sequence`, `revision`, `hash`, `outcome`. Sequences must be contiguous from `base.sequence`. Command ids are `${kind}:${sequence}:${target}` and never recur (A5 `session.ts:191-229, 626-720, 959`).
- **Compaction and hashing:**
  - Compaction runs at 400 entries and replaces the journal with `base{sequence, hash}` (A5 `:230-231, 934-948`).
  - `canonicalHash` is a non-cryptographic 64-bit two-lane FNV-style hash over canonical JSON (A6 `snapshot.ts:131-147`).
  - Snapshots are canonical and sorted, and must re-serialize byte-identically (A6 `:84-129`, about `:478`).
- **Save compatibility:** old save schemas keep their bytes, and upgrades are journaled commands (A7 `persistence.ts:7-9, 104-106`; A5 `:74, 79-80`).

**Measured sizes [BENCH, ASTrix evidence]:**

| Measurement | Value | Source |
|---|---|---|
| Wildlife JSON record (content v8) | about 154 B (177 records = 27,214 B) | A8 `W7-REPORT.md:105, 193` |
| Wildlife JSON record (content v9) | 161 B | A8 `W8-REPORT.md:290` |
| Wildlife record cap | 4,096 | A8 `W7-REPORT.md:31` |
| Tick journal entry | 235 B, or 279 B with presence | A8 `STAB-002/REPORT.md:282-289` |
| Browser save growth | 8.9–9.1 KB/min | same |
| One minute of new-land exploring | 10,370 B of journal | A8 `W5-REPORT.md:258-260` |

**Devnet runs [BENCH]:** the tick crank ran every 2 s. A commit landed tick 430 while the ER was already at 439 (A8 `MB001/REPORT.md:21, 29-31`). Treasury balance was 200,858,520 lamports before and after the checkpoints, so all were inside the free quota (A8 `MB003/REPORT.md:40`).

**Rent per world [BENCH]:** world 0.00187 + passport 0.00234 + delegation PDAs 0.00635 = 0.0106 SOL (A3 `:79`). This matches the 5,080 lamports/byte rate: (240+128)×5,080 = 1,869,440 lamports and (332+128)×5,080 = 2,336,800 lamports.

### 2.2 Target civilization: estimated on-chain layout [EST]

The scenario: 10,000 trees, 500 animals, 100 villagers, farms and workshops, about 5,000 resource entries, about 300 buildings, and 8 players.

**Principle [INF]:** terrain and generated entities are deterministic from (seed, generator) (A3 `:64-73`; A6 `:103-105`). Store only **deltas** and **tombstones**, never the generated world. Use fixed-width binary records, not the JSON used in saves. JSON costs about 3× more: the 161 B wildlife JSON record against an estimated 48 B binary record.

| Account group (PDA seeds by `world_id`, group, index) | Est. binary record | Count | Bytes | Accounts (≤10,240 B, ~9.6 KB usable) |
|---|---|---|---|---|
| World header: version, rules, generator, schema, `world_tick` u64, `state_epoch` u32, `journal_seq` u64, `state_hash` [32], `next_id` u64, per-group dirty bitmap, ownership/members (ASTrix Passport 192 B reserve, A3 `:122-127`) | — | 1 | ~512 | 1 |
| Player: owner, session key and expiry, position (3×i32), inventory (32 slots × 6 B), `last_seq` u64, last command hash | ~384 | 8 | 3,072 | 8, one per player so players do not contend for write locks |
| Tree delta: local id u32, stage u8, damage u8, remaining u16, regrow-due tick u32 | 12 | up to 10,000 (worst case all touched) | 120,000 | ~13 (regional: chunk-range per account) |
| Tree/rock tombstone bitmap (1 bit per generated id) | 1 bit | 10,000 | 1,250 | inside tree accounts |
| Animal: spawn id u32, species u8, position 3×i16, hp u8, state u8, flags, born/last tick u32×2, target u32, rng state u64 | ~48 | 500 | 24,000 | 3 |
| Animal death tombstones: bitmap over spawn ids, up to 4,096 (W7 cap) | 1 bit | 4,096 | 512 | in the animal header |
| Villager: id, home u16, job u8, job target u32, carry [u16;4], hunger, energy, position, ticks | ~96 | 100 | 9,600 | 1 |
| Building / construction site: id u32, kind, position, rotation, owner index, progress u16, delivered [u16;6], hp, flags | ~64 | 300 | 19,200 | 2 |
| Resource entries (ground piles and stockpile slots): item u16, quantity u32, location ref u32 | ~10 | 5,000 | 50,000 | 5–6 |
| Farms and workshops: 200 plots × 8 B, 50 jobs × 32 B, stock totals | — | — | ~3,500 | 1 |
| **Total** | | | **≈ 230 KB** | **≈ 33 accounts** (8 player + ~25 world) |

**JSON comparison [EST]:** 500 animals × 161 B = 80.5 KB for animals alone. A whole-world JSON snapshot would be several hundred KB to about 1 MB. That fits the client's 25 MB snapshot cap (A6 `:25-27`), but it cannot be committed as one account.

**Base-layer rent for these accounts [EST from DOC rates]:**
- **Formula:** (128 + bytes) × lamports_per_byte (S19).
- **Current rate:** 5,080 lamports/byte. MagicBlock S8 states this as of Nov 2026, and the ASTrix figures above agree.
- **Scheduled rate:** SIMD-0437 continues to 2,575, then 1,322, then 696 (S19). Activation dates are [UNK]; recheck on solana.com.

| Item | At 5,080 lamports/byte | At 696 lamports/byte |
|---|---|---|
| One full 10,240 B account | 52,669,440 lamports (0.0527 SOL) | 7,216,128 lamports (0.0072 SOL) |
| 25 world accounts plus 8 × 384 B players, refundable when closed | ≈ 1.34 SOL | ≈ 0.18 SOL |
| Delegation PDAs per delegated account (deposit) | 2.82M–3.32M lamports (S8 table), at the legacy floor of 6,960/byte | not affected by the Solana rate |
| Delegation PDAs, 33 accounts | ≈ 0.10 SOL per delegation session, and **mostly consumed**: once any account reaches commit 2, the charge exceeds the deposit (S8) | same |

**Commit sizes and mechanics [SRC]:**
- An account over 256 B is committed from a buffer: the data is written in chunks, then a finalize step runs. Smaller accounts can be committed inline (S2 `core/src/intent/limits.rs:21-22, 222-230`).
- Base-layer limits per commit transaction: 1,232 bytes (`PACKET_DATA_SIZE`), 64 account locks and 1.4M CU (same file, lines 24-25, 334-338, 412-416).
- **[EST]** A 10 KB account therefore needs about 10–12 base transactions per commit. On public ERs the validator pays and signs these.
- Diff commits (`CommitDiff`, `CommitDiffFromBuffer`) exist (S4 `legacy/discriminator.rs:36-39`), so small changes to big accounts can be cheaper on the base layer.
- **[UNK] Q4:** When does V1 `8886db2` choose a diff over a full write, and how large is each base transaction?

### 2.3 Unexpected validator stop: how to recover each kind of state

Two cases:
- **R1, restart with disk:** the ER returns with its own state, possibly minus a crash tail.
- **R2, loss or prolonged outage:** fall back to the last commit plus ASTrix's off-chain archive.

| State | Where it lives (recommended) | R1 recovery | R2 recovery | Integrity rule |
|---|---|---|---|---|
| Player positions | Presentation or ER-ephemeral only; snap to last committed "home" or anchor | Re-read the ER; the client re-sends | Teleport to the last committed position or anchor | Never authoritative for value |
| Inventories | Player account (delegated) | ER state | Last commit, plus replay of archived commands that pass validation | Per-player `last_seq`, conservation audit |
| Resource locations and quantities | Resource accounts | ER | Last commit plus replay | Quantity never negative; produced − consumed = held |
| Tree damage and regrowth | Tree delta accounts; regrowth is a pure function of `regrow_due_tick` and `world_tick` | ER | Last commit; regrowth recomputed from ticks | Tombstones by union; regrowth computed lazily, not stored per tick |
| Animal identity, health, deaths | Animal accounts plus death bitmap | ER | Last commit; deaths merged by union from the archive | **Never clear a death bit** except in a new `generation_epoch` |
| Construction | Building/site accounts; materials held in site escrow | ER | Last commit plus replay | Materials leave the stockpile in the same transaction that credits the site |
| Villager jobs, food, production | Villager and economy accounts, crank-ticked | ER | Last commit; the tick crank resumes from `world_tick` | Job state machine with ids |
| World time | Header `world_tick` plus `state_epoch` | ER | Commit tick; epoch +1 | (epoch, tick) increases lexicographically |
| Ownership and permissions | Passport/world header, always committed after change (ASTrix already forces this, A4 `lib.rs:438-457, 461-490`) | ER | Last commit, which is always current because it is forced | Never left uncommitted |

### 2.4 Integrity mechanisms ASTrix must implement [INF]

1. **Duplicate transactions.**
   - Every gameplay instruction carries `(player, seq u64, command_id)`. The program requires `seq == player.last_seq + 1` and stores a short hash of the command.
   - A replay returns success with no state change.
   - Do not rely on ER signature dedupe: it is bounded by retention and empty after a leader restart (S3 `keeper/README.md:19-22`; `engine/README.md:33-35`).
   - This mirrors the delegation program's own nonce rule (S4 `commit_state.rs:163-169`) and ASTrix's contiguous journal sequences (A5 `:645-658`).
2. **Duplicate items and invalid balances.**
   - Items are counters with u32 checked arithmetic and caps, as ASTrix already does with `STOCK_CAP` and `MAX_HARVEST_PER_ACTION` (A4 `lib.rs:63-87`).
   - Every credit has a debited source in the **same** transaction: a node's `remaining` goes down, or a stockpile goes down.
   - Each checkpoint runs a conservation audit off-chain.
3. **Resurrected animals.** Keep a monotonic death bitmap or tombstone list. A restore merges it by bitwise OR. Spawn ids are deterministic, so a dead id can never respawn within a generation. ASTrix's `wl.dead` already behaves this way (`Game/src/sim/wildlife.ts:1106-1113`).
4. **Lost construction materials.** Deliver to escrow in the site record within one transaction. Cancelling refunds the delivered counts. Completion is a single transaction from site to building.
5. **Repeated crafting.** Use a job record `{id, state: queued|running|done, output_credited bool}`. The crank is idempotent: "advance to the next unprocessed step", following the S15 `cranks.md` retry guidance.
6. **Time moving backwards.**
   - `world_tick` only ever increases within an epoch.
   - A rollback (R2) increments `state_epoch`, and clients compare (epoch, tick).
   - Gate ticks by `Clock.unix_timestamp` as ASTrix already does (`last_tick_ts`, A4 `lib.rs:201-241`), never by slot. Slot duration is not guaranteed (S11 `faq.mdx:23-25`).
7. **Inconsistent world versions.**
   - Every account header carries `(world_id, schema, rules_version, generator, state_epoch)`. The program rejects transactions that mix versions.
   - Upgrades are explicit `upgrade_*` instructions, the same model as ASTrix save compatibility, where old bytes stay valid and upgrades are journaled (A5 `:74-80`; A7 `:104-106`).
8. **Hash strength.** The client `canonicalHash` is not cryptographic (A6 `:131-141`). Use it for local determinism tests only. The on-chain and audit chain should use sha256, as `checkpoint` already does (A4 `lib.rs:461-490`).

### 2.5 Recovery strategy (checkpoints, history, replay, validation) [INF]

**Normal operation:**

1. **Archiver (operator-run, off-chain).**
   - It subscribes to the ER for ASTrix program transactions (websocket plus `getSignaturesForAddress` backfill, S1 aperture).
   - It writes an append-only journal: ER signature, slot, instruction, `(player, seq, command_id)`, and the post-state hash of the touched accounts.
   - It reuses ASTrix's journal format: contiguous `sequence`, per-entry hash, `base{sequence, hash}` compaction (A5).
2. **Checkpoint crank (as now, generalised).**
   - At each checkpoint it computes sha256 over the canonical concatenation of all world accounts, ordered by PDA index.
   - It writes `header.state_hash`, `header.journal_seq` and `header.world_tick`.
   - It commits the header **and only the dirty accounts**, plus all ownership-relevant accounts.
   - The archiver stores the full account set whose hash matches. That set becomes the new **compaction base**, and older journal entries can be pruned or archived.
3. **Cadence.** Header hash every 1–6 h (cheap: one account). Full dirty-set commit every 24 h and on ownership changes. This follows the ASTrix proposal of `CHECKPOINT_MIN_TICKS` = 43,200 (A3 `:89-90`).

**On a stop:**

1. **Detect.** Signs of a stop: tick crank progress stalls for more than N intervals; the status API shows `er` down (S15 `resources.md:14-31`, `https://status.magicblock.app/api/services`); the RPC times out.
2. **R1 (comes back).**
   - Compare the ER header `(epoch, tick, journal_seq)` and recomputed hashes with the archiver.
   - If the ER is **ahead or equal**, accept it and backfill the archive from ER history.
   - If the ER is **behind** (crash tail), mark the archive entries after the ER position as *lost*. Clients resubmit pending commands, and the `seq` rules reject duplicates.
3. **R2 (still down after T, e.g. 15–30 min).**
   - The owner program calls `RequestUndelegation` for each world account. ASTrix needs new instructions for this.
   - If the validator does not respond within 9,000 slots, call `UndelegateWithRollbackAfterTimeout`. The world returns to its last commit, and `state_epoch` is incremented.
   - Optionally, an admin-multisig `restore` instruction re-applies archived commands after the commit. It accepts them only if each passes the program's own validation and the resulting hash matches the archive.
   - Trade-off: this re-trusts the operator's archive. [INF]
   - Then re-delegate to another region's validator.
4. **Validate.**
   - Recompute the sha256 chain.
   - Replay the TS sim from the compaction base to the same tick and require an identical canonical hash. ASTrix already requires Rust/TS equivalence tests (A1 `:50-65`).
   - Run conservation audits and the tombstone union check.
   - Only then reopen ingress.

**Rough RPO [EST]:**
- R1: crash tail only (unknown, [UNK] Q2).
- R2 without a restore: up to one full-commit interval (24 h at the proposed cadence).
- R2 with an archive restore: archiver lag (seconds), subject to the trust trade-off.

**RTO [EST]:**
- R1: depends on the operator ([UNK]).
- R2: at least the decision time T, plus 9,000 slots (about 60 min at 400 ms; shorter if slots get faster, S20/SIMD notes), plus base-layer transactions for undelegate and delegate.

### 2.6 Guarantees: MagicBlock versus ASTrix

| Concern | MagicBlock provides | ASTrix must implement |
|---|---|---|
| Ordered execution on one ER | Yes. Conflicting writes keep input order (S3 `README.md:55-56`). | — |
| Durable ER storage | Local disk plus snapshots, with replay on restart (S1/S3). **Crash-tail sync is not guaranteed.** | Assume a tail can be lost; keep client resubmission |
| Replication / failover | Optional same-operator replicas. Public-ER policy unknown. | Plan for R2 |
| Settlement to Solana | On demand, sequential nonces, authority-only (S4) | Choose what and when to commit; dirty tracking |
| Automatic periodic commits | **No** (`commit_frequency_ms` unused) | Crank-driven checkpoints |
| Commit retries | Committor retries and persistent queue (S1 SQLite; S2 outbox) | Monitor; treat a commit as done only when finalized on the base layer |
| Fraud proofs / independent verification | **Not on the legacy path in use** | Hash chain plus archive plus TS replay audit |
| Escape from a dead validator | `RequestUndelegation` + rollback after 9,000 slots (S4) | Wrapper instructions, decision runbook |
| Data newer than the last commit after R2 | **Lost** (rollback path does not apply pending commits) | Off-chain archive and optional restore |
| Ephemeral/Magic account durability | Persisted on the ER disk; never settles | Use only for rebuildable or presentation state |
| Idempotency | Signature dedupe bounded by retention; empty after restart | Per-player `seq` and command ids |
| Duplicate items, balances, tombstones, crafting, construction escrow | — | Program invariants (2.4) |
| Monotonic world time | Clock sysvar, slot from the last block (S3 `keeper/README.md:76-78`) | `(state_epoch, world_tick)` |
| World version consistency | — | Version fields, upgrade instructions |
| Ownership permanence | Delegation record and owner program | Force a commit on change (already done) |
| History / audit trail | ER RPC within retention | Archiver journal plus compaction bases |
| RTO/RPO | **Not documented** | Own targets; ask MagicBlock (Q2) |

---

## 3. Partitioning and scalability (Part 6)

### 3.1 Constraints from sources

| Constraint | Value | Source / label |
|---|---|---|
| Committable account size | ≤ 10,240 B | S7 `:15, 49-61`; S2 `process_schedule_commit.rs:108-115` [DOC][SRC] |
| Account max (ER/SVM) | 10 MiB | S7 `:14`; S18 [DOC] |
| Realloc growth | 10 KiB per instruction | S18; S4 `interface/src/state/state_buffer.rs:59-62` [DOC][SRC] |
| Transaction size, ER | 64 KB | S7 `:13, 37-47` [DOC] |
| Transaction size, base | 1,232 B (applies to delegation and to commit transactions the validator sends) | S7 `:41-47`; S2 `limits.rs:412-416` [DOC][SRC] |
| Transaction size, Solana v1 transactions | Agave 4.2 transaction v1 targets 4,096 B; activation status [UNK] | third-party summary of SIMD-0296; recheck |
| Compute | 200k CU per instruction default, 1.4M per transaction (ER and base) | S7 `:11-12` [DOC] |
| Commit intent limits | 1.4M CU and 64 base account locks per intent transaction | S2 `core/src/intent/limits.rs:24-25` [SRC] |
| Crank fan-out | 32 accounts per crank, so 16 worlds per tick crank and 8 per checkpoint crank in ASTrix. Hydra 0.2.2 raises `Create` to 64 accounts. | A4 `lib.rs:33-87`; S2 `MIGRATION_V1_V2.md:36-37` [SRC][BENCH] |
| Commits without a fee payer | 10 per account per delegation | S8 [DOC] |
| Base-layer per-account write CU per block | 12M CU (SIMD-0306 proposes 40% of the block limit). Block limit is 100M CU since 2026-07-29. | S20 [DOC] |
| ER per-account write limit, ER TPS, cranks per validator | **Not documented** | [UNK] Q5 |
| Concurrency on the ER | Parallel; conflicting writes on the same account serialize | S3 `README.md:55-56` [SRC-doc] |

**Q5:** What sustained transactions per second, and transactions per second per hot writable account, do the public ERs support? What are their rate limits per IP or per program? How many cranks per validator, and with what minimum interval? V1 `min-interval` defaults to 10 ms (S1 `config.example.toml:344-366`).

### 3.2 Options

| Option | Pros | Cons | Verdict [INF] |
|---|---|---|---|
| **One ER per world** (all ~33 world accounts delegated to one validator) | Atomic transactions across villagers, stock and buildings. Simple recovery unit. Matches ASTrix today (A3). | One validator is the failure domain for the world. Hot header account serializes writes if every transaction touches it. | **Recommended.** Keep the header out of the write set of ordinary actions; update the header only from the crank. |
| One ER per region within a world | Lower latency per region | **No atomic transaction across validators.** An ER transaction can only write accounts delegated to that validator (S11 `faq.mdx:14-16`). Moving a player or items across a border needs undelegate plus redelegate. | Only for very large worlds; use region borders as "portals" with escrow |
| One ER per gameplay system | — | Systems interact every tick (food → villagers → construction), so every tick crosses partitions | **Reject** |
| Hybrid | World on an ER; global tokens, market, ownership and achievements on the base layer | Base fees per global action | Good fit with ASTrix's plan (A1 `:33-41`) |
| Many worlds per validator, spread over regions | Simple horizontal scale; each world independent | Operator-side limits unknown (Q5) | **Recommended** for growth |

### 3.3 Moving things across partitions

- **Commit + undelegate + redelegate [SRC].**
  - Moves accounts, not items. Destination must be a strictly newer delegation (S3 `engine/README.md:62-63`).
  - Each new delegation costs a new deposit and session (S8).
  - Latency is at least two base-layer confirmations. [UNK] exact timing.
  - Use this for whole-world migration, not item transfers.
- **Escrow handoff [INF].** For items, a player, or ownership moving from world A to world B:
  1. On A, burn the item into an `outbox` record `{transfer_id, item, qty, dest, nonce}`.
  2. Commit A's outbox account.
  3. A Magic Action, or an off-chain relayer, posts a base-layer `transfer_ticket`.
  4. B's ER program reads the ticket (base accounts are readable on the ER, S11 `faq.mdx:14-16`), credits the items once, and marks `transfer_id` as used.
  - Every step is idempotent by `transfer_id`.
- **Magic Actions [DOC].**
  - Base-layer instructions that run after a commit (S12).
  - **Not atomic with the commit:** if an action fails, the validator retries the commit without the action (S12 lines 41-42). Actions must therefore be idempotent and re-triggerable.
  - Base Action fee: 50,000 µlamports per requested CU, plus 5,000 lamports per callback (S8).
- **Intent bundles [SRC].** `MagicIntentBundleBuilder` can combine commit, commit-and-undelegate and call-handler actions (S5 `rust/pinocchio/src/intent_bundle/commit.rs:20-111`, `commit_and_undelegate.rs:19-119`). ASTrix already uses it for checkpoints (A4 `lib.rs:461-490`).
- **Ownership** stays on the base layer or in the always-committed passport. A transfer forces a commit, as ASTrix already does (A4 `lib.rs:438-457`).

---

## 4. Cost inputs (Part 7)

### 4.1 Documented prices (2026-11-26)

| Item | Price | Source / label |
|---|---|---|
| ER transaction | 0 lamports in the current release | S8, S9 [DOC] |
| Delegation session | 3,000,000 lamports, from the deposit at undelegation | S8; S4 `legacy/consts.rs:12`; `fast/undelegate.rs:441-473` [DOC][SRC] |
| Commit after the first | 1,000,000 lamports each, from the deposit, capped by the deposit | S8; S4 `legacy/consts.rs:9` [DOC][SRC] |
| Live commit fee from commit 26 (fee-vault path) | 1,000,000 lamports per account (V1 `8886db2`; 100,000 on the v1.1.1 tag) | S8; S15 `fees-and-commit-economics.md:26-35` [DOC] |
| Delegation deposit (record plus metadata PDAs) | (bytes+128)×6,960; 2.82M–3.32M lamports depending on seeds | S8 [DOC] |
| Base Action | ceil(CU × 50,000 / 1e6) lamports; callback 5,000 lamports | S8 [DOC] |
| Ephemeral (Magic) account rent, refundable | 32×(len+60) lamports, so a 10,240 B account is 329,600 lamports | S8 [DOC] |
| Lamport top-up helper setup charge | 300,000 lamports mainnet / 3,000,000 devnet | S8 [DOC] |
| VRF | ER queue free; Solana fast 0.0008 SOL; Solana 1/2 s 0.0005 SOL per request | S9, S13 [DOC] |
| Dedicated ER nodes | Offered; **no public price** (contact development@magicblock.xyz) | S9 [DOC][UNK] Q6 |
| Solana base fee | 5,000 lamports per signature; priority fee = CU price × CU limit / 1e6 | S17 [DOC] |
| Solana rent | (128+bytes)×lamports_per_byte; 5,080 now, planned to fall to 696 | S19; S8 [DOC] |
| Validator commit CU price (operator cost if self-hosting) | `compute-unit-price` default 1,000,000 µlamports/CU, i.e. 1 lamport/CU | S1 `config.example.toml:167-171`; S2 `config/src/consts.rs:23` [SRC] |
| Self-hosted leader minimum balance check | 5 SOL | S2 `bins/validator/src/leader.rs:226-244` [SRC] |
| RPC (Helius) | $0 / $49 / $499 / $999 per month for 1M / 10M / 100M / 200M credits; standard call 1 credit, `getProgramAccounts` 10 | S21 [DOC-3rd party] |
| Server (Hetzner AX42) | €99.00/month excl. VAT on the product page. An older press page shows €46; Hetzner changed prices on 2026-06-15. | S22 [DOC-3rd party] |

**Q6:** Price and SLA for a dedicated ER node? Hardware requirements for self-hosting V2 leader plus verifier? Rate limits on the public ER RPC and router?

No SOL/USD rate is assumed here. MagicBlock's VRF simulator uses 200 USD/SOL as an illustration only (S9).

### 4.2 Per-world costs for the section 2.2 civilization [EST]

Assumptions:
- 33 delegated accounts.
- Fee-vault commit path.
- Every account's nonce is past 25, which is steady state.
- Deposits are already consumed.

| Commit strategy | Account-commits/day | Live fees/day |
|---|---|---|
| A. Everything hourly | 792 | 0.79 SOL |
| B. Dirty-only hourly (assume ~10 dirty/h) | 240 | 0.24 SOL |
| C. Header hash hourly + all dirty daily (≤33) | ≤57 | ≤0.057 SOL |
| D. Header every 6 h + dirty daily | ≤37 | ≤0.037 SOL |
| ASTrix today (2 accounts hourly) | 48 | 0.048 SOL, matching A3 `:84-87` (100 worlds → 4.8 SOL/day) |

One-off and locked costs per world:
- Rent locked, refundable: ≈ 1.34 SOL at 5,080 lamports/byte, or ≈ 0.18 SOL at 696.
- Delegation deposits: ≈ 0.10 SOL per delegation session, effectively consumed.
- Each migration or re-delegation repeats the deposits.

**Cheaper alternative [INF/EST]:** keep bulky, rebuildable state (tree deltas, animal positions) in **Ephemeral accounts**. A 10 KB account then costs 329,600 lamports of refundable ER rent, against 52.7M lamports of base rent.
- Commit only a hash of it in the header.
- R2 recovery of that state then depends **entirely** on the ASTrix archive.
- Animal deaths, inventories, ownership, buildings and economy stay in committed accounts.

### 4.3 Three scales [EST, built from 4.1 unit prices; strategy C]

| | Small prototype | Growing | Larger |
|---|---|---|---|
| Worlds / concurrent players | 1 / a few | 25 / hundreds | 500 / thousands |
| Rent locked, refundable (5,080 → 696) | 1.34 → 0.18 SOL | 33.5 → 4.6 SOL | 670 → 92 SOL |
| Delegation deposits (once per session) | 0.10 SOL | 2.5 SOL | 50 SOL |
| Commit fees/day (strategy C) | ≤0.057 SOL | ≤1.4 SOL | ≤28.5 SOL |
| Same at strategy A | 0.79 SOL | 19.8 SOL | 396 SOL |
| Cranks | 1 tick + 1 checkpoint | about 2 tick + 4 checkpoint (16 and 8 per crank) | about 32 tick + 63 checkpoint, or Hydra 64-account cranks |
| ER transactions | 0 | 0 | 0 (if public ER pricing holds; dedicated pricing [UNK]) |
| RPC | Helius free/$49 | $499 | $999 or enterprise |
| Off-chain archive server | 1 small server (e.g. Hetzner AX42 €99/mo) | 1–2 servers | Several, plus object storage (pricing not researched) |
| Validator | Public ER | Public ER or dedicated [UNK price] | Dedicated or self-hosted leader + verifier (≥5 SOL leader balance; hardware [UNK]) |

ASTrix's own 1-to-10,000-world table for its current 240 B design is in A3 `:81-85`.

### 4.4 Per-activity placement and cost

ER transactions currently cost 0. Rows are [INF]; costs are [EST].

| Activity | Placement | Marginal cost | Notes |
|---|---|---|---|
| Player movement | **Presentation only**, client-predicted, optionally an ER-ephemeral position for nearby players | 0 | Presence costs 46 B per tick in the journal (A8 `W7-REPORT.md:194`). Never commit position per move. |
| Gathering | ER transaction on the player and resource accounts; idempotent `seq` | 0 per action; committed in the batch | `MAX_HARVEST_PER_ACTION` style caps (A4) |
| Crafting | ER transaction with a job record | 0 | Exactly-once credit |
| Tree lifecycle | Deterministic from seed; store deltas only; regrowth computed lazily | 0 | No per-tree crank |
| Animal simulation | Movement and AI off-chain and deterministic (client and archiver); ER stores identity, hp and death bitmap, changed on interaction | 0 | On-chain per-tick AI for 500 animals would use CU in cranks; ER CU limits per transaction are 1.4M (S7) |
| Villager simulation | ER crank tick (2 s today, A4) over villager and economy accounts | 0 in fees; uses crank capacity [UNK limits] | Keep the per-tick work bounded |
| Construction | ER transactions with escrow; commit on completion | 0 plus dirty commit | — |
| Periodic world updates | Crank: tick, then header hash, then checkpoint | Strategy C ≈ 0.057 SOL/day per world | — |
| Ownership, transfers, claims | Base layer (claim, transfer) plus forced commit | 5,000 lamports per signature plus priority fee; 0.001 per committed account after nonce 25 | Already done (A4) |
| Discovery randomness | ER VRF queue | Free (S13) | Already used (A4 `lib.rs:263-312`) |
| Achievements, tokens, market | Base layer | Solana fees | — |

---

## 5. Open questions for MagicBlock (consolidated)

1. **Q1:** Do public ERs run replicas or verifiers? How does failover happen (manual or automatic), and under which identity? Is V2 validator rotation (`DelegationCluster.current_validator`) planned or deployed, and how is it authorized?
2. **Q2:** What are the RPO/RTO targets? Is the ledger fsynced per block? What are the disk backup policy and history retention period on public ERs?
3. **Q3:** Can a program owner obtain snapshots or exports of their delegated and Magic accounts?
4. **Q4:** When does `8886db2` use diff commits versus full buffer writes? How many base transactions does a 10 KB commit take, and who bears that cost on dedicated nodes?
5. **Q5:** What are the ER TPS, per-account write throughput, crank count and interval limits, and RPC rate limits?
6. **Q6:** What are dedicated-node pricing and SLA, and the self-hosting hardware requirements?
7. **Q7:** The docs say commits are finalized by fraud proofs (S10), but the legacy finalize path trusts the whitelisted validator (S4 `finalize.rs:54`). Which path do public ERs use, and when will V2 challenge clusters be live?
8. **Q8:** Will `commit_frequency_ms` ever be honoured (issue #625), or should programs always self-schedule commits?
9. **Q9:** Is the 9,000-slot undelegation timeout fixed in slots? Will it shorten as Solana slot time falls toward 200 ms? Can a program configure a longer or shorter timeout?

## 6. Limits of this research

- I did not inspect the production V1 commit `8886db2`. V1 facts come from the `v1.1.1` tag.
- Most V2 Engine internals come from in-repo READMEs at the cited lines. I did not trace them line by line in Rust.
- Solana pages could not be fetched directly (HTTP 429). Their facts come from indexed official pages; re-read them before final decisions. This matters most for rent rates, which are mid-rollout.
- All ASTrix civilization sizes and costs in sections 2.2 and 4 are estimates. No benchmark was run. Only the A8 evidence figures are measurements.
