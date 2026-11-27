# ASTrix on MagicBlock: minimal prototype plan

**Check date: 2026-11-26.** Plan only. Nothing was built, deployed, funded or signed. Source keys and evidence labels are the same as in [ASTrix_MagicBlock_Architecture_Proposal.md](ASTrix_MagicBlock_Architecture_Proposal.md) (ARCH, MGD, TICK, VRF, REPL, AX). Effort figures are labelled **[Estimate]**: they are the author's judgement, not measurements.

## 0. Ground rules

- **Isolation.** The prototype is a separate experimental world: new program (`astrix_proto`), new program id, new registry and world accounts. It does not touch program `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy`, its 32 worlds, its cranks, the live site, or any local save. Its client is a separate entry point (for example `?proto=1` on a dev build). The game's `GameSession`, journals and save keys are not changed.
- **Owner approval.** Every devnet or mainnet action needs the owner's approval first: creating keys, airdrops, deploys, delegations, cranks, any transaction. Phases P0–P7 run on a **local** MagicBlock stack and need no network funds.
- **Existing crank.** ASTrix's devnet tick crank (original task 742001) is expected to run out around **2026-11-28 ~16:40 UTC** (ARCH §13, [Inf]). The prototype does not depend on it. Renewing it or letting it lapse is a separate owner decision (Proposal §13.2). Either way, record what happens at exhaustion, because that behaviour is untested (TICK §1.4).
- **Licensing.** The local stack (`mb-test-validator`, `ephemeral-validator`) is BSL-1.1, which MGD §B.1 lists as dev-only. Prototype use is non-production use [Inf]. Confirm with MagicBlock before any public deployment (Open Questions L1).

## 1. Scope: the 12 demonstrations

| # | Demonstration | Where it runs |
|---|---|---|
| 1 | Player connects | Client → ER |
| 2 | Player enters a world | Base (init, delegate) → ER |
| 3 | Position updates | Presentation; optional ER-only account |
| 4 | Player gathers a real resource | ER program, chunk root + tombstone |
| 5 | Tree takes damage and falls | ER program |
| 6 | Logs are created and collected | ER program |
| 7 | A resource is consumed in crafting | ER program |
| 8 | A scheduled world update runs while the player is disconnected | ER crank → `settle` |
| 9 | State survives a validator interruption or restart | Local validator restart; devnet observation |
| 10 | Two players cannot consume the same resource | ER program, write serialization |
| 11 | State is committed and recoverable | ER → Solana commit; restore from Solana |
| 12 | A VRF request returns a verifiable result | ER VRF queue, nonce-bound callback |

## 2. Order and reasons

| Phase | Items | Why in this position | Effort [Estimate] |
|---|---|---|---|
| **P0 Setup** | — | Local stack (`mb-stack` / `mb-test-validator` from npm `@magicblock-labs/ephemeral-validator`, MGD §B.1), Anchor 1.0.2 + `ephemeral-rollups-sdk` 0.18 (ASTrix's working versions, ARCH §13), program skeleton with `settle`, `seq` and version headers. Pin the validator line: the local 2.0 CLI differs from 1.1.1 (MGD §B.2). | 2–3 days |
| **P1 Connect, enter, move** | 1, 2, 3 | Everything else needs a delegated world and a session key. Position comes early because every reach check uses it. These are the lowest-risk items: ASTrix already did delegation and session keys (ARCH §13). | 2–3 days |
| **P2 Real resource, no double use** | 4, 10 | This is the core claim of the architecture: the program, not the client, decides that a resource exists and was taken once. It also carries the largest unknown, the CU cost of Merkle proofs (Proposal §6.2). If it fails, stop here. | 4–6 days |
| **P3 Felling and logs** | 5, 6 | A multi-step lifecycle with identity (tree → stump + trunk → log piles → bag). It tests per-swing transaction load and conservation. It depends on P2's chunk roots. | 4–5 days |
| **P4 Crafting** | 7 | Consumption with exactly-once jobs. It depends on items from P2–P3. | 2 days |
| **P5 Offline world update** | 8 | Tests the time model (world time = f(ER clock), lazy idempotent `settle`). It can run in parallel with P3–P4. It is a kill criterion, so it should not be left late. | 3–4 days |
| **P6 Commit, recover, restart** | 11, 9 | Needs real state to commit. Restart testing needs the local validator, which ASTrix controls; the public devnet validator cannot be stopped on purpose. | 4–6 days |
| **P7 VRF** | 12 | Already demonstrated by ASTrix on devnet (3 prospects, ARCH §13), so the lowest new risk. The work is the nonce binding and the independent proof check (VRF §3.6). | 2–3 days |
| **P8 Devnet rerun** | 1–12 | Same tests against MagicBlock's devnet ER, after owner approval. Adds what local cannot show: MagicBlock's cranker, real oracle, real network. | 3–5 days |
| **P9 Proof package and report** | — | Independent verifier, negative-test log, evidence report (§4) | 2–3 days |
| **Total** | | One engineer familiar with Anchor | **28–40 days** |

## 3. Acceptance tests

Common test conditions: every test runs from a clean local stack; the TS reference rules and the Rust program receive the same command list; every result records signatures, slots and account hashes.

### P1

| Item | Acceptance test |
|---|---|
| **1 Connect** | AT-1.1 The client discovers the world's ER endpoint with `getDelegationStatus` and opens `accountSubscribe` on the player account. AT-1.2 After a forced WebSocket drop, it reconnects, re-reads, and its state equals a fresh `getAccountInfo` (ARCH §9 bounded queues). AT-1.3 With the ER unreachable, the client shows the last committed image from Solana and refuses writes. |
| **2 Enter** | AT-2.1 `create_world` on base, then `delegate` to the named local validator; `getAccountInfo` on base shows owner = DLP, on the ER shows owner = `astrix_proto` (ARCH §4). AT-2.2 `join_world` creates the player account; the owner signs `set_session` once; all later gameplay is signed by the session key. AT-2.3 A second join by the same key is rejected. |
| **3 Position** | AT-3.1 Position updates are presentation-only; they never land in a committed account (check every committed image). AT-3.2 If the optional ER-only position account is used, a second client sees position changes within 1 s on the local stack (latency recorded, not a pass bar). AT-3.3 A `gather` whose reported position jumps further than `max_speed × elapsed` from the last accepted position is rejected with `OutOfReach`. |

### P2

| Item | Acceptance test |
|---|---|
| **4 Gather a real resource** | AT-4.1 The client builds a chunk root from (seed, generator, chunk) with the existing TS generator (`Game/src/sim/gathering.ts`, pickup stream `seed + 7717`, VRF §2.1). An independent script computes the same root. AT-4.2 `gather(pickup_id, proof)` succeeds; the bag count rises by the generated quantity; the tombstone bit is set. AT-4.3 A pickup id absent from the chunk root, or a wrong quantity, is rejected (`InvalidProof`). AT-4.4 The CU used by `gather` is recorded; the pass bar is < 200,000 CU (the default per-instruction limit, ARCH §11). |
| **10 No double use** | AT-10.1 Two clients with different keys send `gather` for the same pickup in the same slot window. Exactly one succeeds; the other fails `AlreadyTaken`; total bag counts equal the generated quantity. Repeat 100 times. AT-10.2 The same `(seq, cmd_id)` resent 10 times changes state once. AT-10.3 Two sites cannot reserve the same log unit: the sum of reservations never exceeds what the source holds (the rule in AX `Game/src/sim/reservation.ts`). |

### P3

| Item | Acceptance test |
|---|---|
| **5 Tree damage and fall** | AT-5.1 Each `chop` lowers tree HP by 1 and axe durability by 1. HP starts from the (species, stage) table ported from `Game/src/sim/felling.ts`. AT-5.2 Swings faster than `SWING_COOLDOWN_MS` (650 ms) or more than `SWINGS_PER_TICK` (4) are rejected. AT-5.3 Without an axe, out of reach, or on a stump: rejected. AT-5.4 At HP 0 the tree record becomes a stump with `regrow_due_tick` set, and a trunk record exists, in the same transaction. AT-5.5 The Rust outcome equals the TS `chopTree` outcome for the same command list (equivalence test over at least 1,000 random command sequences from a fixed seed). |
| **6 Logs created and collected** | AT-6.1 `cut_log` produces the log count of the timber rule for that species and stage. AT-6.2 `pickup` moves logs from the pile to the bag within carry capacity; pile + bag is constant. AT-6.3 A second player can take logs from a pile only if they are not reserved. AT-6.4 A trunk cannot be cut beyond its log count. |

### P4

| Item | Acceptance test |
|---|---|
| **7 Crafting consumes** | AT-7.1 A recipe (for example a workbench recipe using logs) debits the inputs and credits the output in one transaction. AT-7.2 With an input missing, the transaction fails and no counts change. AT-7.3 Replaying the same craft command does not produce a second output. AT-7.4 A conservation audit over the full test log: for each item, generated + crafted − consumed = held + in piles + in escrow. |

### P5

| Item | Acceptance test |
|---|---|
| **8 Update while disconnected** | AT-8.1 A villager job is assigned, then every client disconnects. A settle crank runs every 60 s. After 30 minutes, the site's delivered materials and work progress equal the closed-form value for the elapsed world ticks. AT-8.2 Stop the crank for 10 minutes, then restart it: no world time is lost, unlike today's `tick` (TICK §2.1). AT-8.3 Call `settle` twice at the same `now`: the second call changes nothing. AT-8.4 A gap longer than `MAX_SETTLE_TICKS` is applied over several calls. AT-8.5 Record the CU of a 16-world `settle` crank; pass bar: within the measured crank budget (about 400k on 1.1.1, 1.4M shared on Hydra; TICK §1.6). AT-8.6 Construction progress never passes delivered materials. |

### P6

| Item | Acceptance test |
|---|---|
| **11 Commit and recover** | AT-11.1 The checkpoint crank writes `header.state_hash` = sha256 over the canonical account set, then commits. On base, sha256 of the committed bytes equals the stored hash (the method already verified in AX Identity doc §5). AT-11.2 Commit finalization is checked on base, not assumed from the ER scheduling call (REPL §1.1 settlement receipts). AT-11.3 A fresh client with only base RPC rebuilds the world view from committed images and matches the hash. AT-11.4 Commit count and fees per day are logged and compared with REPL §4.2 strategy C. |
| **9 Survive interruption** | AT-9.1 Clean restart of the local validator: all confirmed state is back; the crank resumes; `settle` catches up. AT-9.2 Hard kill (`SIGKILL`) under load: record which acknowledged transactions were lost (the crash tail, REPL §1.4). Clients resubmit and the sequence rule drops duplicates. AT-9.3 Escape hatch, local only: stop the validator, call the new `request_undelegation` wrapper, wait 9,000 slots, call `rollback_after_timeout`; the world returns to the last committed image and `state_epoch` increments. (On devnet a live validator answers the request with a normal commit-and-undelegate, so the rollback path cannot be forced there; REPL §1.7.) AT-9.4 After rollback, the archiver restore re-applies archived commands only through program validation and reaches the archived hash. AT-9.5 Devnet (P8): passive only. Watch the status API and the world; record any natural interruption and what survived. |

### P7

| Item | Acceptance test |
|---|---|
| **12 Verifiable VRF** | AT-12.1 `prospect` stores `nonce` and `requested_at`, charges at request, and passes the nonce in `callback_args`. AT-12.2 The callback checks the scoped identity and the nonce. A late callback for an old nonce is rejected (the gachapon `pull_id` pattern, VRF §1.10). AT-12.3 `cancel_prospect` works only after `requested_at + 130 s`. AT-12.4 An independent script reads (input, Γ, U, V, s) from the fulfilment transaction, runs the open-source `verify_vrf` (VRF §3.2), and checks SHA-256(Γ) equals the randomness used. AT-12.5 The result is journaled as a `vrf_result` entry, and replay applies it without a new request. AT-12.6 Record latency from request to callback (none has been measured yet, VRF §1.7). |

## 4. Proving the rollup, not a conventional backend, made the decision

A demo that only shows state changing proves nothing: a normal server could produce the same screen. The proof package has six parts [Inf]:

| # | Evidence | How to produce it |
|---|---|---|
| E1 | **The rule lives in the program.** | Publish the program source and the deployed hash. Show that the IDL has no instruction that writes inventory, tombstones or tree HP directly. Every write goes through a rule instruction. |
| E2 | **Invalid transactions are rejected by the program.** | A negative-test script (in the style of ASTrix's existing `chain/client/scripts/steal-test.ts`) sends: a gather of a taken pickup; a gather with a forged proof; a chop without an axe; a craft without inputs; a swing faster than the cooldown; a second consumption of the same log; a callback with a stale nonce; a gather signed by the admin key on a player's behalf. Each must fail with its specific program error code. The log lists signature, error code and the account state unchanged. |
| E3 | **The operator key cannot forge outcomes.** | Run E2's forgery cases with the admin/operator key and with the treasury key. Show that neither can credit items, move a site's escrow, or call a callback. The only privileged powers are provisioning and cranks (as in AX Identity doc §8). |
| E4 | **Every accepted action is an ER transaction.** | For each demonstration, list ER signatures. Show them with `getTransaction` on the ER endpoint and in an explorer pointed at the ER RPC: program id, instruction, signer, logs, CU. |
| E5 | **The world runs with every ASTrix service off.** | During P5, turn off the archiver, the agent and every ASTrix process. Show the crank transactions signed by the scheduler or MagicBlock's cranker key (as `8hwz…` signed ASTrix's ticks, ARCH §13), and the state advancing. |
| E6 | **An independent client verifies from RPC only.** | A separate script with no access to ASTrix servers reads ER history and accounts, replays them with the TS reference rules, and reaches the same hashes. It then reads Solana and checks sha256(committed bytes) = `header.state_hash`. |

What the package cannot prove, and must say plainly:
- The validator is trusted for ordering, liveness and honest commits. DLP v1 has no fraud proof (ARCH §6).
- The program upgrade authority can change the rules. Show who holds it.
- Reported positions and chunk roots are bounded trust (Proposal §3).

## 5. Budget

| Stage | Cost | Basis |
|---|---|---|
| P0–P7 local stack | 0 SOL; engineer time only | Local validator, no network |
| P8 devnet | 0 real SOL. Faucet SOL is rate-limited: ASTrix's first wallet stayed unfunded (AX `MagicBlock_Architecture_2026-11-23.md` §10). | ER transactions, VRF on the ER queue and crank executions are free (REPL §4.1). Devnet top-up helper charge 3,000,000 lamports (REPL §4.1). |
| Mainnet (not part of this plan) [Est] | One prototype world at the REPL §2.2 size: rent ≈ 1.34 SOL locked, refundable (≈ 0.18 SOL at 696 lamports/byte); delegation deposits ≈ 0.10 SOL per session; commits ≤ 0.057 SOL/day (strategy C); VRF free on ER queue. The prototype world is smaller than that model, so these are upper bounds. | REPL §4.2–4.3 "Small prototype" column |
| Mainnet program deploy [Est] | About 1.84 SOL of rent for a 363 KB program at 5,080 lamports/byte: (128 + 363,000) × 5,080. This assumes the program-data account is the size of the `.so`; a larger allocation costs more. Refundable on close. | Size from AX `MagicBlock_Architecture_2026-11-23.md` §10; formula REPL §2.2 |
| Off-chain | Archiver and verifier on one small server (Hetzner AX42 €99/month) and free or $49 Helius RPC — only for P8 and later | REPL §4.1, §4.3 |

Mainnet is not needed to prove the architecture. Run mainnet only after the questions in [MagicBlock_Open_Questions_for_Engineering_Team.md](MagicBlock_Open_Questions_for_Engineering_Team.md) marked "blocking" are answered, and remember mainnet runs validator 1.1.1 with a different crank model (MGD §0.5).

## 6. Kill criteria

Any of these results disproves the proposed architecture, or the part named, and should stop work until it is redesigned:

| # | Result | What it disproves |
|---|---|---|
| K1 | `gather` with a Merkle proof cannot fit 200k CU, or proof size makes the transaction impractical | Program-validated generated resources (Proposal §6.2) |
| K2 | A 16-world `settle` cannot fit the crank budget even after reducing per-call event budgets | Lazy world time on cranks (TICK §4) |
| K3 | Rust/TS equivalence cannot be reached for felling, crafting or settle within the phase budget | TS prediction for chain worlds |
| K4 | Two-player tests show a double consumption, or a negative count, even once | Program-enforced resource identity |
| K5 | A clean local restart loses confirmed transactions, or the crank does not resume | ER durability assumptions (REPL §1.4) |
| K6 | The escape hatch cannot be built (DLP instructions not usable from our program) and MagicBlock offers no alternative | Survival of validator loss (Open Questions R-group) |
| K7 | Devnet VRF fulfilment fails or times out in more than 1 in 100 requests, or the proof cannot be checked independently | VRF for discoveries |
| K8 | MagicBlock answers that public nodes have capacity far below one world per player group, or force-undelegate idle delegations, and no dedicated-node terms exist | Managed hosting of persistent worlds |
| K9 | Per-swing load or per-account serialization makes a world with 8 active players lag by more than the client can hide (threshold set by the owner) | One ER per world with these account boundaries |
| K10 | Commit fees at the needed durability exceed the owner's budget at 25 worlds (REPL §4.3) | The commit cadence; a cheaper cadence or Ephemeral accounts plus archive would be needed |

## 7. Deliverables of the prototype

- `astrix_proto` program source, IDL and deployed hash.
- TS reference rules for every ported rule, with the equivalence test.
- Negative-test script and log (E2, E3).
- Archiver, verifier and monitor scripts.
- An evidence report in ASTrix's existing format (`13_Integration_and_QA/Evidence/…/REPORT.md`): every signature, CU measurement, restart outcome, cost, and which kill criteria were checked.
