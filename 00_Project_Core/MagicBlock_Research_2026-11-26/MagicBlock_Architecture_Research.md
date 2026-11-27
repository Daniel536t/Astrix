# MagicBlock architecture research for ASTrix

**Check date for every source in this document: 2026-11-26.** Research only. Nothing was deployed, signed, funded or sent. The live checks in this document are read-only JSON-RPC calls (`getVersion`, `getIdentity`, `getRoutes`, `getSignaturesForAddress`, `getTransaction`, `getAccountInfo`) and one read of the public status API.

Companion document: [MagicBlock_Managed_vs_Self_Operated_Infrastructure.md](MagicBlock_Managed_vs_Self_Operated_Infrastructure.md).

## Evidence labels

| Label | Meaning |
|---|---|
| **[Doc]** | Officially documented by MagicBlock (docs.magicblock.gg, magicblock.xyz, repository READMEs written by MagicBlock) or by Solana (solana.com docs). |
| **[Src]** | Verified in source code (file and commit given). |
| **[Ex]** | Demonstrated in an example: MagicBlock examples, or ASTrix's own devnet evidence, or a live read-only check made on 2026-11-26. |
| **[Bench]** | Independently benchmarked. **No independent benchmark of MagicBlock throughput was found.** |
| **[Inf]** | Architectural inference by the author. Not a fact. |
| **[Unk]** | Unknown. Docs and source are silent or inconclusive; a question for MagicBlock is listed in §14. |

"Vendor claim" marks numbers that MagicBlock states in talks or blog posts without a published method.

---

## 1. Summary in plain game-dev language

- **MagicBlock runs Solana programs, nothing else.** An Ephemeral Rollup (ER) validator is a Solana-VM (SVM) node. It runs compiled SBF programs (Rust/Anchor, native Rust, Pinocchio) plus a handful of built-in native programs. It does not run TypeScript, JavaScript, WASM or a game server. [Src][Doc]
- **"Creating a rollup" is just delegating accounts to an existing validator.** There is no "create rollup" instruction. Your program asks MagicBlock's Delegation Program to lock an account on Solana and name a validator. That validator then owns write access to the account until it is undelegated. One validator serves many apps at once. [Src]
- **The ER is fast and free per transaction, and it is centralized while an account is delegated.** One validator orders and executes every write to your delegated accounts. Solana only learns the new state when your program schedules a commit, and the Delegation Program deployed today accepts the commit if the right validator key signed it. There is no fraud-proof or challenge step in the deployed program; that is in development (DLP v2). [Src]
- **If ASTrix's TypeScript simulation stays outside, the chain does not hold the authority.** Whoever computes the next state and signs it is the authority. To make the chain authoritative for a rule, that rule must be ported to the Rust program. ASTrix already did this for a small settlement economy. [Inf]
- **ASTrix's devnet program works and is still running.** The original settlement's crank had advanced it to tick 119,646 at 20:39 UTC today, about 2.8 days after scheduling, with zero-fee transactions signed by a cranker key that is not ASTrix's. [Ex]

---

## 2. The seven things people confuse

| Thing | What it is | Who runs it | What it executes |
|---|---|---|---|
| **Solana** | The public base-layer blockchain (mainnet, devnet). Consensus among many validators. Holds program code and the durable copy of every account. | Solana validators worldwide | SBF programs. 5,000 lamports per signature base fee. |
| **MagicBlock infrastructure** | Everything MagicBlock operates: regional ER validators, the Magic Router, the VRF oracle, the pricing oracle, an RPC proxy, a status page, and the on-chain programs it controls (Delegation Program, Magic Domain Program, VRF, Hydra). | MagicBlock Labs | Mixed: validators run SBF programs; router and oracles are off-chain services. |
| **A MagicBlock validator** | One process (`magicblock-validator`) with one identity key, e.g. `MEUGGrYP…` for Europe. It clones accounts from Solana, executes transactions on those delegated to it, and sends commits back to Solana. | MagicBlock (public nodes), an enterprise (dedicated nodes), or a licensed self-operator | SBF programs and native built-ins on an SVM fork of Agave. |
| **An Ephemeral Rollup** | A *session*: a set of accounts delegated to one validator, from delegation until undelegation. Many sessions from many apps share one validator. "The EU rollup" in conversation usually means "the EU validator". | Lifecycle controlled by your program; execution by the validator | Your program's instructions on those accounts. |
| **An ASTrix game server** | Today there is none for the chain part. `astrix.nyc.boxd.sh` is a static web host. A future server could run the TypeScript simulation, relay, index or crank. | ASTrix | TypeScript/Node, anything. |
| **ASTrix's authoritative simulation** | The deterministic TypeScript `GameSession` with its command journal, replay and seeded RNG. Today it is authoritative for the local valley game. On chain, only the small `astrix_settlement` Rust program is authoritative. | Runs in the browser | TypeScript. Cannot run on MagicBlock. |
| **The Three.js client** | Renderer and UI. Reads chain state (`Game/src/chain/settlement.ts`) but must never depend on it (owner decision, 2026-11-24). | Player's browser | JavaScript/WebGL. |

---

## 3. What MagicBlock executes, and what "MagicBlock Engine" means

### 3.1 Two meanings of "MagicBlock Engine"

1. **Brand.** The docs and the examples repo call the whole product "MagicBlock Engine" ("Integration Examples", "a fully-fledged game accelerated by the MagicBlock Engine"). [Doc] ([games use case](https://docs.magicblock.gg/pages/get-started/use-cases/games.md); `/projects/sandbox/.tools/magicblock-examples-main/README.md`)
2. **A code repository.** [`magicblock-labs/magicblock-engine`](https://github.com/magicblock-labs/magicblock-engine) (Apache-2.0, marked *experimental*, version 0.26.4, created 2026-04-17) is the execution core of validator 2.x. Its README says the validator handles base-chain integration and commit policy, while Engine handles local execution and state; Engine's blocks are execution boundaries, not consensus. [Src] (`magicblock-engine/README.md` @ HEAD cloned 2026-11-26; validator `Cargo.toml` pins engine tag `0.26.4`)

Engine crates [Src]:

| Crate | Job |
|---|---|
| `engine` | Orchestration, transaction ingress, account import, recovery |
| `processor` | Dependency scheduling and SVM execution |
| `keeper` | Storage coordination, caches, subscriptions |
| `accountsdb` | Current account state, snapshots, checksums |
| `ledger` | Execution history, replay, retention |
| `replicator` | Authenticated leader→follower transaction stream |
| `solana/*` | Forks of Agave 4.2.2 runtime crates (`svm`, `program-runtime`, `transaction-context`, `account`, `transaction-view`) |

### 3.2 The validator in code

- **It is an SVM validator built from Agave runtime crates, not a Solana consensus node.** Validator 2.0.5 pins Agave crates at `=4.2.2` (`solana-bpf-loader-program`, `solana-compute-budget`, `agave-syscalls`, …) and Engine forks Agave 4.2.2 runtime layers. Consensus and fork machinery are explicitly not part of it. [Src] (`magicblock-validator/Cargo.toml`; `magicblock-engine/solana/README.md`)
- **Only SBF programs and native built-ins execute.** The runtime loads raw ELF bytes for SBF programs (loader v2/v3/v4 ABIs) and keeps native programs under the native loader. [Src] (`magicblock-engine/solana/README.md`). The 1.1.1 validator (live on mainnet) registers these built-ins: System, BPF Loader Upgradeable, Loader v4, Magic program, Crank program, Callback program, Ephemeral System program, Compute Budget, ZK ElGamal proof. [Src] (`validator-v1.1.1/magicblock-processor/src/builtins.rs`, tag v1.1.1)
- **Programs are not deployed to the ER.** Program accounts are cloned from Solana when a transaction needs them and kept in sync. [Doc] ([ER FAQ](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/faq.md)). A self-operator can also preload program files (`[[programs]]` in config) and restrict which programs are cloned (`allowed-programs`). [Src] (`magicblock-validator/config.validator.example.toml`, `config/src/config/chain.rs`)
- **Lifecycle modes (1.1.1):** `ephemeral` (clone on demand, write only delegated accounts; what the public nodes use), `replica`, `programs-replica`, `offline`. [Src] (`validator-v1.1.1/config.example.toml`)
- **License: Business Source License 1.1, Additional Use Grant: None, Change Date 2027-12-01 → MIT.** Production use of the validator needs a commercial license from MagicBlock until then. The Delegation Program and the VRF program are also BSL-1.1. Hydra is MIT; Engine is Apache-2.0. [Src] (`LICENSE.md` in each repo). See the companion document §B.

### 3.3 Direct answers

| Question | Answer | Evidence |
|---|---|---|
| What does MagicBlock execute? | Solana transactions: SBF program instructions and native built-ins, against accounts delegated to the validator (writes) and clones of any Solana account (reads). | [Src] engine/solana README; [Doc] FAQ |
| What runs on its validator? | Your Solana programs (cloned from Solana), MagicBlock's native programs (Magic program for commits/scheduling, crank, callback, ephemeral system), SPL programs, VRF program, Hydra ephemeral program. Plus services around the runtime: Chainlink (cloning), Aperture (RPC/WebSocket), Committor (settlement), task scheduler. | [Src] validator README and crate READMEs |
| What does the Engine do? | Executes transactions in parallel where accounts don't conflict, stores state and history, publishes subscriptions, recovers after restart, streams history to followers. It does not talk to Solana. | [Src] magicblock-engine/README.md |
| Does it run arbitrary TypeScript/JavaScript? | **No.** There is no JS/TS/WASM runtime in the validator. TypeScript only exists in client SDKs (`@magicblock-labs/ephemeral-rollups-sdk`). | [Src] builtins list, loader handling; [Inf] absence confirmed by repo layout |
| What must be Solana programs? | Every rule that should be enforced by MagicBlock or Solana: state layout, validation, the tick, randomness callbacks, commits, delegation and undelegation hooks. In practice Rust (Anchor 1.x with `ephemeral-rollups-sdk`, native, or Pinocchio). | [Doc] [quickstart](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/quickstart.md); [Src] SDK |

---

## 4. Ephemeral Rollups and Solana base-layer interaction

Lifecycle [Doc] ([Delegating accounts](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-rollup.md)):

1. **Initialize on Solana.** The account must already exist on Solana; delegated accounts cannot be created on the ER. [Doc] FAQ
2. **Delegate on Solana.** The owning program CPIs into the Delegation Program (`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`). The account's owner becomes the Delegation Program on Solana. [Doc][Src]
3. **Execute on the ER.** The first ER transaction (or read) clones the account. On the ER the account appears owned by your original program, so normal Anchor constraints apply. [Doc]
4. **Commit (optional, repeatable).** Your program schedules a commit inside an ER transaction; the validator later sends the base-layer settlement transactions. Validators do not commit automatically. [Doc]
5. **Undelegate.** Commit-and-undelegate on the ER; the validator finalizes on Solana and the Delegation Program CPIs back into your program (the `#[ephemeral]` macro injects the handler) to restore ownership. [Doc][Src] (SDK `#[ephemeral]`, see dev skill `SKILL.md`)

Transaction routing [Doc] (dev skill and [Magic Router](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/magic-router.md)):

| Transaction | Sent to |
|---|---|
| Create/initialize, delegate | Solana (1,232-byte limit applies) |
| Anything writing delegated accounts, scheduling commits, undelegating | The ER endpoint (or the Magic Router, which forwards) |
| Reads of live delegated state | The ER endpoint |
| Reads of last committed state | Solana |

A delegated account looks owned by the Delegation Program on Solana and by your program on the ER. ASTrix's `settlement.ts` uses exactly this test to show "delegated". [Ex] (`Game/src/chain/settlement.ts` lines 106–113)

---

## 5. Delegation and undelegation in detail

### 5.1 Delegation Program (DLP) v1, the program deployed today

The fees page states the deployed DLP build is commit `0c551fa`. [Doc] ([fees](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/fees-and-commit-economics.md)). The repository's master is now `dlp@v2.0.x` but its design doc says "DLP v1 is the current program". [Src] (`delegation-program/docs/design/mimd-0024-fraud-proofs.md`)

**PDAs created at delegation** [Src] (`program/src/legacy/processor/fast/delegate.rs` @ `7f3017e`, same logic at `0c551fa`):

| Account | Seeds (under DLP) | Content |
|---|---|---|
| Delegation record | `["delegation", delegated_account]` (tag constant) | `authority` (the validator pubkey), `owner` (your program), `delegation_slot`, `lamports`, `commit_frequency_ms` |
| Delegation metadata | `["delegation-metadata", delegated_account]` | PDA seeds of your account, `last_commit_id`, `undelegation_requester`, `rent_payer` |
| Delegate buffer | `["buffer", delegated_account]` under **your** program | Temporary copy of the data during the owner change |

**Who signs.** The payer and the delegated account (your program signs for its PDA via CPI) sign the delegation. The validator does **not** sign delegation; you just name it. [Src]

**Which validator.** `DelegateConfig.validator` is optional. If omitted, the record's authority defaults to `MAS1Dt9…` (Asia). There is no whitelist check at delegation time. [Src] (`delegate.rs`; `interface/src/legacy/consts.rs`)

**Ownership and authority transfer.** On Solana the account's owner becomes DLP; your program can no longer write it there. The validator named in `authority` becomes the only key that DLP accepts for commits and undelegation: `commit_state` fails with `InvalidAuthority` if the signer differs. [Src] (`fast/commit_state.rs` lines ~208–217)

**Validator whitelisting.** Commits, finalization and undelegation also require the validator's *fees vault* PDA to exist, and only DLP's upgrade authority (MagicBlock admin) can create it. The code comment says its existence acts as the whitelist. [Src] (`init_validator_fees_vault.rs`, `requires.rs::require_initialized_validator_fees_vault`; checked at both `7f3017e` and `0c551fa`)

**Per-program validator allowlist.** A program's upgrade authority can create a `ProgramConfig` listing approved validators; if present, commits by other validators fail. [Src] (`whitelist_validator_for_program.rs`, `commit_state.rs` lines ~242–260)

**Lifetime.** The delegation record has no expiry field. Delegation lasts until undelegation. [Src]. There is no documented maximum session length. [Unk → Q1]

**Commit frequency.** `commit_frequency_ms` is stored but the docs say validators never commit automatically. In the 2.0 validator source this field appears only in tests. [Doc][Src] (`chainlink/src/...` grep). ASTrix commits by program call or crank. [Ex]

**Escape hatch.** DLP source contains `request_undelegation` (the owner program asks on Solana) and `undelegate_with_rollback_after_timeout` (after a minimum of 9,000 slots, about 1 hour at 400 ms, the owner program can take the account back with its *last committed* state, losing anything newer). The validator polls these requests every 5 minutes by default. [Src] (`fast/undelegate_with_rollback_after_timeout.rs`, `interface/src/legacy/consts.rs` `DEFAULT_UNDELEGATION_REQUEST_TIMEOUT_SLOTS = 9000`, validator `chainlink.undelegation-request-poll-interval`). The SDK 0.18.0 does not wrap these instructions and the docs do not mention them. [Src][Unk → Q2]

**Upgrade control.** DLP upgrades go through a Squads multisig held by MagicBlock; mainnet builds are verified by OtterSec. [Doc] (`delegation-program/README.md`)

### 5.2 Undelegation and re-delegation

- Undelegation is requested on the ER (commit-and-undelegate) and finalized by the validator on Solana. A final commit-and-undelegate is allowed even after the 10-commit cap so accounts cannot be trapped. [Doc] (fees page)
- Re-delegation is a new `delegate` on Solana, optionally to a different validator. This is the only migration path between validators in DLP v1. [Src][Inf]
- The docs warn to wait for state propagation after delegate/undelegate. [Doc] (dev skill)
- ASTrix has **not** tested undelegate or re-delegation. [Ex] (MB001 report "Not yet verified")

### 5.3 DLP v2 (not deployed; design)

DLP v2 introduces `DelegationCluster` accounts so a delegation points at a cluster PDA instead of a raw validator key, a planned `RotateValidator` instruction, and an optional challenge mode with operator/verifier bonds and a multisig dispute resolver. It is to start permissioned. [Src] (`docs/design/mimd-0024-fraud-proofs.md`). Timeline and migration of v1 delegations are not documented. [Unk → Q3]

---

## 6. Account ownership and execution authority

- **On the ER, normal Solana rules apply.** The account is owned by your program; signer, `has_one` and seed constraints work as on Solana. Delegation is a routing concern, not a new authorization rule. [Doc] (dev skill `SKILL.md`)
- **The validator decides ordering and liveness.** It cannot forge your program's instruction logic (it runs the program), but it chooses which transactions to include and in what order, and it signs the commits. With DLP v1 nothing on Solana re-checks that the committed bytes came from honest execution. [Src][Inf]. The docs describe a fraud-proof mechanism with a security committee, citing the [whitepaper](https://arxiv.org/abs/2311.02650) and a [fraud-proof PDF](https://docs.magicblock.gg/public/Ephemeral_Rollups_Fraud_Proof.pdf); the deployed v1 program has no challenge path. [Doc vs Src: conflict, flagged]
- **Engine adds lifecycle modes to accounts.** Delegated and Magic (ER-only) accounts accept user writes; an undelegating account becomes immutable immediately, including inside CPIs. [Src] (`magicblock-engine/solana/README.md`)
- **Accounts delegated to another validator are read-only here.** Chainlink compares the delegation record's authority with its own identity and treats foreign delegations as not delegated. [Src] (`magicblock-validator/chainlink/src/chainlink/account_still_undelegating_on_chain.rs`, `fetch_cloner/ata_projection.rs`)

---

## 7. Transaction processing

| Aspect | Validator 1.1.1 (mainnet today) | Validator 2.0.5 (devnet today) | Evidence |
|---|---|---|---|
| Parallel? | Yes. Scheduler + pool of executor threads, count = CPUs/2 − 1. Per-account bitmask locks: many readers or one writer. Blocked transactions queue FIFO by arrival ID. | Yes. Dependency graph built at admission: a write waits for prior unfinished readers and writer; conflicts keep input order; disjoint and read/read run concurrently. | [Src] `validator-v1.1.1/magicblock-processor/README.md`, `magicblock-api/src/magic_validator.rs` ~L401; `magicblock-engine/processor/README.md` |
| Fees | 0 base fee on public nodes | "All versions execute without fees" | [Doc] pricing; [Src] processor README; [Ex] tick tx fee 0 |
| Preflight | `sendTransaction` executes without simulation; `skipPreflight: true` only returns early. Failed transactions are still recorded. | Same | [Doc] FAQ |
| Slot / block time | ~10 ms documented; router `getRoutes` reports `blockTimeMs: 10` for all mainnet and devnet nodes except mainnet TEE (50). Docs say not to depend on it. | Same | [Doc] [runtime limits](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/runtime-limits.md); [Ex] live `getRoutes` 2026-11-26 |
| Measured slot rate | — | ASTrix tick transactions 2 s apart are 200 slots apart on devnet-eu (slots 1164985441 → 1164985641), i.e. 10 ms per slot. | [Ex] live read 2026-11-26 |
| Address lookup tables | Not determined | Rejected at sanitization (`AddressLookupMismatch`); the router also does not support ALTs. | [Src] engine solana README; magic-router README |
| Block CU limits | Not found | No block cost model found in Engine outside the Agave forks (search for `cost_model`, `block_cost`). | [Src] grep; [Unk → Q4] |

**Concurrent actions on the same account.** Every write to one account is serialized, in the order the validator admitted the transactions. Two players hitting the same settlement account in the same 10 ms will both execute, one after the other; the second sees the first's result. Ordering is arrival order at the validator; there are no priority fees on the public nodes. A blog post mentions configurable sequencing (FCFS or priority fees) as a runtime customization [Doc] ([6 innovations](https://www.magicblock.xyz/blog/6-core-innovations)); how to request it is undocumented. [Src][Inf][Unk → Q5]

**Throughput.**
- No documented per-ER TPS figure in the docs. [Unk]
- Vendor claim: at Breakpoint 2025 MagicBlock announced a scheduler doing 50,000 TPS on commodity hardware and over 1 billion transactions on its canary network ([Solana Compass summary of the talk](https://solanacompass.com/learn/breakpoint-25/tech-talk-magicblock-labs)). No method or hardware spec was published. [Doc, vendor claim]
- MagicBlock publishes [REDLINE](https://github.com/magicblock-labs/redline), a load-testing tool, but no results. [Src]
- **No independent benchmark found.** [Bench: none]
- For ASTrix, the practical bound is per hot account, not per node: one settlement account can absorb only as many transactions per second as fit serially. ASTrix's tick uses about 4,900 CU of program time plus 477 CU for Hydra's `Trigger`. [Ex] (live `getTransaction`, 2026-11-26)

---

## 8. State commitment and settlement

| Mechanism | What it does | Atomicity | Evidence |
|---|---|---|---|
| `commit` (via `MagicIntentBundleBuilder` in SDK 0.17/0.18) | Schedules a copy of the current ER state of listed accounts to Solana; accounts stay delegated. | Scheduling succeeds in the ER transaction; base-layer settlement happens later and can fail and retry. | [Doc] dev skill; [Src] `magicblock-validator/committor/README.md` |
| `commit_and_undelegate` | Commit plus return ownership. | Same; undelegation completes only after base finalization. | [Doc][Src] |
| Magic Actions (post-commit base actions) | Base-layer instructions run after a commit. | **Docs:** not atomic with the commit; on action failure the validator retries the commit without the actions. **Blog:** describes a single atomic operation. Treat as not atomic. | [Doc] [Magic Actions overview](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/magic-actions/overview.md) vs [blog](https://www.magicblock.xyz/blog/6-core-innovations) — conflict |
| Post-delegation actions | Instructions stored in the delegation record, run on the ER after cloning. Base delegation success does not prove they ran. | No | [Doc] dev skill |
| Settlement receipts (2.0) | The committor writes an outbox; completion is a later `ScheduledCommitSent` transaction with real base signatures. Scheduling is not a settlement guarantee. | — | [Src] committor README |

**Limits and fees** [Doc] (fees page, checked by MagicBlock 2026-11-19):
- Committed account ≤ 10,240 bytes; larger accounts cannot be committed or undelegated normally.
- Without a delegated fee payer: 10 commits per delegation session, commit 11 fails `0xA0000000`.
- With a delegated fee payer and the validator's `magic_fee_vault`: unlimited commits; commit 26 onward costs 0.001 SOL per committed account, taken live.
- At undelegation: 0.003 SOL session fee plus 0.001 SOL per commit after the first, taken from the delegation deposit (about 0.0028–0.0033 SOL), never more than the deposit.
- Fee split: ~10% protocol, ~90% validator fee vault.

ASTrix measured that its checkpoints did not reduce the treasury, consistent with commits 1–25 having no live fee. [Ex] (`Identity_and_Persistence_Architecture_2026-11-24.md` §5)

---

## 9. WebSocket subscriptions and state updates

- ER endpoints serve Solana-style WebSocket on the HTTP port + 1 (`wss://devnet-eu.magicblock.app` publicly). Supported subscriptions include `accountSubscribe`, `programSubscribe`, `logsSubscribe`, `signatureSubscribe`, `slotSubscribe`. [Src] (`magicblock-validator/aperture/src` method names; aperture README)
- Account and block subscribers have bounded queues and slow receivers are disconnected. Clients must reconnect and re-read. [Src] (`magicblock-engine/README.md`)
- The Magic Router's WebSocket supports only `signatureSubscribe`. Subscribe to accounts on the ER endpoint returned by `getDelegationStatus`, not on the router. [Src] ([magic-router README](https://github.com/magicblock-labs/magic-router))
- The router also rejects `getProgramAccounts`, `getSlot`, `simulateTransaction` and others (`-32601`). [Doc] ([Router API intro](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/api-reference/er/introduction.md))
- ASTrix subscribes with `onAccountChange` on devnet-eu and also polls every 4 s, which is the right defensive pattern. ASTrix also found the ER ignores `dataSize` filters in `getProgramAccounts`. [Ex] (`Game/src/chain/settlement.ts` L88–100; `Identity_and_Persistence…` §4)
- Geyser plugins are supported on self-operated nodes but expose fewer fields than a full Solana validator. [Src] (aperture README)

---

## 10. Replication and recovery (pointers only)

Another researcher covers this in depth. Starting points:

- **Restart recovery:** Engine validates stores on start, restores a retained snapshot and replays history. Execution completion is not a disk-sync guarantee; the crash tail may be incomplete. [Src] `magicblock-engine/engine/README.md#startup-and-recovery`, `ledger/README.md`
- **Replication:** leader streams ordered history over TCP to allow-listed followers ("verifiers") that re-execute and check state. Explicitly *not* consensus. [Src] `magicblock-engine/replicator/README.md`, `magicblock-validator/bins/verifier/README.md`
- **Settlement retry:** durable outbox, on-chain dedup of commit IDs, restart recovery. [Src] `magicblock-validator/committor/README.md`
- **Scheduled tasks persist across restarts**; execution and progress recording are separate, so tasks may re-execute after a crash. [Src] `magicblock-validator/task-scheduler/README.md`
- **Operational runbooks** (deployment prerequisites, recovery, settlement delivery) are linked from READMEs to `magicblock-labs/knowledge-base`, which returns 404 (private). [Unk → Q6]
- **Evidence of survival:** ASTrix's crank kept firing across the devnet upgrade from core 2.0.4 (recorded 2026-11-24) to 2.0.5 (observed today). [Ex]

---

## 11. Scaling constraints: Solana vs ER

| Limit | Solana | ER | Source |
|---|---|---|---|
| Transaction size | 1,232 bytes | 64 KB (u16::MAX in Engine) | [Doc] Solana [constants](https://solana.com/docs/core/constants-reference) (read via `solana-foundation/solana-com` repo); MagicBlock runtime limits; [Src] engine solana README |
| CU per instruction (default) | 200,000 | 200,000 | [Doc] both |
| CU per transaction (max) | 1,400,000 | 1,400,000 | [Doc] both |
| Account size max | 10 MiB | 10 MiB | [Doc] both |
| Committable account size | n/a | 10,240 bytes | [Doc] runtime limits |
| Accounts per transaction | 64 enforced (legacy/v0) | Not documented for ER | [Doc] Solana constants; [Unk → Q4] |
| CU per block | 50,000,000 at 200 ms slots (100M at 400 ms) | No limit found | [Doc] Solana [compute budget](https://solana.com/docs/core/fees/compute-budget); [Src] grep |
| CU per writable account per block | 20,000,000 at 200 ms (40M at 400 ms) | No limit found | same |
| Slot time | Solana docs: mainnet runs 200 ms slots. MagicBlock docs still say ~400 ms. | ~10 ms | [Doc] both (they disagree on Solana's slot time) |
| Base fee | 5,000 lamports/signature + priority | 0 | [Doc] |
| Rent | (128 + bytes) × 5,080 lamports on mainnet (Nov 2026) | ER-only Magic accounts: (bytes + 60) × 32 lamports, refundable | [Doc] Solana [rent](https://solana.com/docs/core/rent); MagicBlock fees page |
| DLP deposit rate | (bytes + 128) × 6,960 lamports (legacy rate) | — | [Doc] fees page |
| Address lookup tables | Supported | Not supported (2.0) | [Src] |

ER-local storage: "Magic accounts"/Ephemeral Accounts live only on the ER, never commit, and are lost if the validator loses them. Use them only for data that may disappear. [Doc] ([Ephemeral Accounts](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-accounts.md))

ER history retention is bounded: the 2.0 example config sets a 512 MiB ledger size limit. ER transaction history is not a permanent journal. [Src] (`config.validator.example.toml` `engine.ledger.size-limit`) [Inf]

---

## 12. Game-design questions for ASTrix

### 12.1 Can the TypeScript sim stay outside while authoritative transitions go through MagicBlock?

Two different designs hide behind this question:

| Design | Where authority lives | What MagicBlock adds |
|---|---|---|
| **A. Server computes, chain records.** An ASTrix server runs the TS sim and submits resulting state (or diffs) signed by a server key. | The server key. The program can check bounds (caps, rate limits, signatures) but cannot check the game rule it did not run. | Ordering, a public log while history is retained, fast reads, commits to Solana. A trusted notary, not an arbiter. |
| **B. Chain computes, TS predicts.** Players and cranks submit *commands*; the Rust program applies the rule. The TS sim mirrors the rule for prediction, rendering and offline play. | The program, executed by the delegated validator (trusted for liveness and, under DLP v1, for honest commits). | Rule enforcement, fair VRF, scheduled ticks without an ASTrix server. |

ASTrix's current program is design B for the settlement economy, with one explicit gap: `harvest` is capped but not checked against terrain entities, which stay client-side. [Ex] (`MagicBlock_Architecture_2026-11-23.md` §10)

A hybrid is common: B for scarce, valuable or contested state (ownership, stockpiles, trades, VRF finds), A or local-only for cosmetic and high-volume state (animation, wildlife, meshes). [Inf]

### 12.2 What would need porting

[Inf] Any rule whose outcome must be trusted by other players or tradable:
- resource accounting, recipes and production jobs, construction progress, villager jobs that change resources;
- terrain facts the economy depends on (resource node positions and depletion). Generation from the seed can stay client-side, but the program must then validate claims against something on chain: precomputed node lists, Merkle commitments to node sets, or edit-delta accounts;
- reservations and job claims if players share a world;
- the tick schedule (already crank-driven).

What can stay TypeScript: meshing, rendering, water, animation, ambient wildlife, camera, UI, offline play, prediction. Determinism matters: Rust and TS must agree bit-for-bit for prediction to match, which needs an equivalence test (ASTrix already lists this risk). [Ex] (23 Nov doc §7)

Compute fit: one transaction gets at most 1.4M CU; ASTrix's tick uses ~4,900 CU today. A whole-world tick over thousands of entities will not fit in one transaction; it must be split across accounts and cranks (Hydra allows up to 16 instructions per crank). [Src] (hydra README) [Inf]

### 12.3 Can one rollup support a whole persistent civilization?

- **Persistence: yes, technically.** A delegation has no expiry [Src]; ASTrix's world has run for 2.8 days [Ex]. But the durable copy on Solana is only as fresh as the last commit, and long-lived delegation depends on one operator's uptime and continued support. Public devnet status shows 4–29 minutes of per-service downtime per server over the last 10 days; mainnet servers show 0. [Ex] (status API read 2026-11-26)
- **Size: only as many small accounts.** Every account that must reach Solana must be ≤ 10,240 bytes. A civilization is thousands of accounts (per chunk, per settlement, per villager group), not one world account. [Doc]
- **Hot spots:** any account written by many players serializes. Design so independent players touch independent accounts. [Src][Inf]
- **Cost:** ER execution is free; Solana rent for every account (plus the DLP deposit at 6,960 lamports/byte) and commit fees after 25 commits are not. ASTrix measured 0.0106 SOL locked per world. [Ex]
- **Undocumented capacity limits** on the public shared nodes (max delegated accounts per app, max subscriptions, rate limits). [Unk → Q7]

### 12.4 Multiple rollups per region or world?

Yes: delegate EU players' accounts to `MEUGG…`, US players' to `MUS3…`. Each validator executes only accounts delegated to it. [Src]

### 12.5 Cross-rollup interactions

- **No atomic cross-rollup transaction.** The router rejects a transaction whose writable delegated accounts sit on different ERs. [Src] (magic-router README)
- A validator can *read* any Solana account, but for an account delegated elsewhere it sees the last committed base copy, which may be stale. [Inf from Chainlink behavior]
- Paths: commit on ER A → Magic Action or base transaction on Solana → ER B clones the update; or undelegate from A and re-delegate to B. Each costs at least one Solana round trip (hundreds of ms to seconds) plus commit fees. [Inf]
- Design implication: keep each interaction (a trade, a shared settlement, a battle) on one validator. Cross-region trade should settle on Solana or through a shared account pinned to one validator. [Inf]

### 12.6 Concurrent actions on the same account

See §7. Writes serialize in arrival order; the program sees a consistent state per transaction; there are no partial interleavings. [Src]

---

## 13. What ASTrix's devnet program already demonstrated, and its limits

Program `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy` (Anchor 1.0.2, `ephemeral-rollups-sdk` 0.18.0 with `anchor`, `crank`, `vrf`), delegated to devnet-eu (`MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e`). Sources: `/projects/sandbox/Astrix/chain/programs/astrix-settlement/src/lib.rs` (1,028 lines), `00_Project_Core/MagicBlock_Architecture_2026-11-24_status.md`, `Identity_and_Persistence_Architecture_2026-11-24.md`, `13_Integration_and_QA/Evidence/MB001…/REPORT.md`.

| Demonstrated [Ex] | Detail |
|---|---|
| Delegation of program PDAs to a chosen validator | Validator passed in `remaining_accounts` (`lib.rs` L127–140, L344–419); client `ER_VALIDATOR` env var (`chain/client/scripts/astrix.ts` L39) |
| Zero-fee ER gameplay transactions | Build, harvest, plant, prospect |
| Crank-driven world clock with no browser | Task 742001 every 2,000 ms × 200,000 iterations. Re-checked today: tick 119,646 at 20:39:23 UTC, signer `8hwzNBBP19tmy7R9udyWkm6ne5y4TA1J1TEYTnWqsJNy`, Hydra `Trigger` (`eHyd5…`) then `Tick`, fee 0, 5,377 CU total |
| Crank survives validator upgrade | Kept ticking from core 2.0.4 to 2.0.5 |
| Program-enforced session keys, PoW claims, rate limits | Not MagicBlock's gum Session Keys |
| VRF on the ER | 3 fulfilled prospects; callback CU problem fixed with `scoped_vrf_identity_const` |
| Commit with `MagicIntentBundleBuilder` and a delegated treasury paying via `magic_fee_vault` | Hourly per-world checkpoints by crank; hash of committed bytes in a passport |
| Fresh-browser restore reading Solana's committed copy | Verified `sha256` equality |
| 32 worlds provisioned, multi-world cranks (16 per crank) | — |

Limits and open points:

- **Tick-rate shortfall is unexplained.** From 01:48 UTC on 24 Nov (ER tick ~439) to 20:39 UTC today, 2 s ticks predict ~120,350 ticks; observed ~119,200 (≈99%). Either crank firings were missed (status API shows 9 minutes of devnet-eu ER downtime in the window) or the clock gate in `tick` skips firings that arrive slightly early. Not determined. [Ex][Unk]
- **Who runs cranker `8hwz…` is unconfirmed.** The dev skill says it is not confirmed that MagicBlock runs a public ephemeral cranker; the evidence shows *someone* does on devnet. Mainnet (validator 1.1.1) uses the older built-in scheduler, not Hydra. [Doc][Ex][Unk → Q8]
- **The 200,000-iteration crank will end** around 2026-11-28 ~16:40 UTC if each firing counts as one iteration. Behaviour at exhaustion is untested. [Inf]
- **Undelegate and re-delegate are untested.** [Ex]
- **Devnet only, validator 2.0.5.** Mainnet runs 1.1.1 with a different crank model (`ScheduleTask` executed by the built-in scheduler with a `crank_signer_pda`), and SDK 0.18 is required to read both commit-log formats. A mainnet move needs re-testing of cranks and commits. [Ex][Doc]
- **The local valley game does not write to the chain.** The chain settlement is a separate outpost. [Ex]
- **Authority gaps:** harvest not checked against terrain; terrain, villagers, entity placement client-side. [Ex]
- **Trust:** worlds rely on MagicBlock's devnet-eu validator for liveness and honest commits; DLP v1 has no challenge path; the operator admin key controls provisioning and cranks. [Src][Ex]
- **Scale costs** are computed in ASTrix's own table (hourly checkpoints ≈ 4.8 SOL/day at 100 worlds after the free allowance). [Ex]

---

## 14. Questions to ask MagicBlock

1. Is there any maximum lifetime, inactivity timeout, or cleanup policy for delegations on public validators? Will public nodes ever force-undelegate?
2. Are `request_undelegation` and `undelegate_with_rollback_after_timeout` live on mainnet/devnet DLP, and will the SDK expose them? What is the supported recovery path if a validator disappears?
3. When will DLP v2 (`DelegationCluster`, validator rotation, challenge mode) ship, and how do v1 delegations migrate?
4. ER limits not in the docs: max accounts per transaction, any per-block or per-account CU limit, max delegated accounts per program, request rate limits, WebSocket subscription limits per client.
5. How are transactions ordered on public nodes, and can an app get FCFS guarantees or a custom sequencer on a dedicated node?
6. Can we get access to the knowledge-base runbooks (deployment prerequisites, recovery, settlement delivery)?
7. Capacity guidance for a persistent game with ~10k–100k small delegated accounts on one public validator.
8. Who operates cranker `8hwzNBBP19tmy7R9udyWkm6ne5y4TA1J1TEYTnWqsJNy` on devnet; is there a mainnet equivalent after mainnet moves to 2.0; is it supported or best-effort?
9. When will mainnet validators move from 1.1.1 to 2.x, and what breaks for programs using 1.1.1 cranks?
10. Is the fraud-proof / security-committee mechanism described in the docs active anywhere today?

---

## 15. Sources (all checked 2026-11-26)

MagicBlock docs: [llms.txt index](https://docs.magicblock.gg/llms.txt) · [Delegating accounts / lifecycle](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-rollup.md) · [What is an ER](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/why.md) · [Runtime limits](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/runtime-limits.md) · [FAQ](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/faq.md) · [Fees and commit economics](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/fees-and-commit-economics.md) · [Magic Router](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/magic-router.md) · [Router API](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/api-reference/er/introduction.md) · [getRoutes](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/api-reference/er/getRoutes.md) · [Ephemeral Accounts](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-accounts.md) · [Magic Actions](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/magic-actions/overview.md) · [Cranks](https://docs.magicblock.gg/pages/tools/crank/introduction.md) · [Local development](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/local-development.md) · [Quickstart](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/quickstart.md) · [Pricing](https://docs.magicblock.gg/pages/overview/additional-information/pricing.md) · [Security and audits](https://docs.magicblock.gg/pages/overview/additional-information/security-and-audits.md) · [Games use case](https://docs.magicblock.gg/pages/get-started/use-cases/games.md) · [Whitepaper (arXiv 2311.02650)](https://arxiv.org/abs/2311.02650). Local copies: `/projects/sandbox/research/magicblock/docs/`.

MagicBlock blog/talks: [6 core innovations](https://www.magicblock.xyz/blog/6-core-innovations) · [Breakpoint 2025 talk summary (Solana Compass)](https://solanacompass.com/learn/breakpoint-25/tech-talk-magicblock-labs).

Source code (cloned `--depth 1` into `/projects/sandbox/research/magicblock/src/` on 2026-11-26):
- [magicblock-validator](https://github.com/magicblock-labs/magicblock-validator) master `543fd3f` (v2.0.5) and tag `v1.1.1` (`493729d`)
- [magicblock-engine](https://github.com/magicblock-labs/magicblock-engine) master (0.26.4)
- [delegation-program](https://github.com/magicblock-labs/delegation-program) master `7f3017e`; deployed build `0c551fa` read via GitHub API
- [ephemeral-rollups-sdk](https://github.com/magicblock-labs/ephemeral-rollups-sdk) `v0.18.0`
- [magic-domain-program](https://github.com/magicblock-labs/magic-domain-program) `64c7c5e`
- [hydra](https://github.com/magicblock-labs/hydra) `7ee29e4`
- [magic-router README](https://github.com/magicblock-labs/magic-router), [redline README](https://github.com/magicblock-labs/redline)

Local: `/projects/sandbox/.tools/magicblock-dev-skill-main/skill/` (skill v0.5.0, MagicBlock-authored, facts dated 2026-11-13/19; partly superseded: all devnet nodes now run 2.0.5) and `/projects/sandbox/.tools/magicblock-examples-main/`.

Solana: [constants reference](https://solana.com/docs/core/constants-reference), [compute budget and block limits](https://solana.com/docs/core/fees/compute-budget), [rent](https://solana.com/docs/core/rent). solana.com returned a bot checkpoint, so these were read from the docs source in [`solana-foundation/solana-com`](https://github.com/solana-foundation/solana-com/tree/main/apps/docs/content/docs/en/core) via the GitHub API.

Live read-only checks (2026-11-26 ~20:30–20:40 UTC): `getVersion`/`getIdentity` on all 10 public ER hosts; `getRoutes` on both routers; [status API](https://status.magicblock.app/api/services) (saved as `status.json`); ASTrix settlement `4PV6Ks9yUnfMd54vtmbYobM4RZza3ZtsM6zxczSmaxzw` on devnet-eu.

ASTrix (read-only): `/projects/sandbox/Astrix/00_Project_Core/MagicBlock_Architecture_2026-11-23.md`, `MagicBlock_Architecture_2026-11-24_status.md`, `Identity_and_Persistence_Architecture_2026-11-24.md`, `chain/`, `Game/src/chain/`, `13_Integration_and_QA/Evidence/MB001…MB003`.

Content from external sources was paraphrased for licensing compliance; no passage longer than 30 words is quoted.
