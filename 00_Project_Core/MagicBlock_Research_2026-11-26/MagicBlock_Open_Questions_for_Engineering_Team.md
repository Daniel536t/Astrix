# Open questions for the MagicBlock engineering team

**Check date: 2026-11-26.** This list consolidates and deduplicates every question raised in the five research documents. No new questions of fact were added. A few items turn a conflict that a document flagged into a question; those are marked "from a flagged conflict".

## Source keys

| Key | Document | Its question list |
|---|---|---|
| ARCH | [MagicBlock_Architecture_Research.md](MagicBlock_Architecture_Research.md) | §14, Q1–Q10 |
| MGD | [MagicBlock_Managed_vs_Self_Operated_Infrastructure.md](MagicBlock_Managed_vs_Self_Operated_Infrastructure.md) | §F, 1–10 |
| TICK | [MagicBlock_Scheduled_Tasks_and_World_Ticks.md](MagicBlock_Scheduled_Tasks_and_World_Ticks.md) | §6, 1–10 |
| VRF | [MagicBlock_VRF_and_Deterministic_World_Generation.md](MagicBlock_VRF_and_Deterministic_World_Generation.md) | §5, Q1–Q10 |
| REPL | [MagicBlock_Replication_Persistence_Recovery.md](MagicBlock_Replication_Persistence_Recovery.md) | §5, Q1–Q9 |

## Priority levels

- **Blocking**: ASTrix should not commit to MagicBlock for persistent, valuable worlds until this is answered in writing.
- **Important**: affects the design, cost or runbooks; needed before mainnet.
- **Nice to know**: improves estimates or tooling.

## Summary: the blocking questions

| ID | Question (short) |
|---|---|
| L1 | Production licensing for BSL components, for managed and self-operated use |
| L2 | Dedicated nodes: price, operator, identity, whitelisting, SLA |
| A1 | SLA or uptime target for public mainnet ERs; upgrade notice |
| A2 | RPO/RTO, per-block fsync, disk backup, history retention |
| A3 | Maximum delegation lifetime, inactivity cleanup, forced undelegation |
| R1 | Replicas and failover on public ERs, and under which identity |
| R2 | Is the escape hatch (`request_undelegation`, rollback after timeout) live, and the supported recovery path |
| R3 | Which finalize path is used: fraud proofs or trusted validator |
| R4 | Is the ER clock monotonic across restarts and migrations |
| S1 | Which validator line runs on each ER, and how changes are announced |
| S2 | Is there a supported public cranker on mainnet 2.x |
| S3 | Do tasks survive restarts, upgrades, failover and the 1.1.1 → 2.x switch |
| T1 | Undocumented ER limits: accounts per transaction, CU per block/account, delegated accounts per program, rate limits, subscriptions |
| T2 | Capacity guidance for 10k–100k small delegated accounts |
| M1 | When mainnet moves from 1.1.1 to 2.x, and what breaks |

---

## 1. Licensing and self-hosting

| ID | Priority | Question | Why it matters for ASTrix | Raised in |
|---|---|---|---|---|
| L1 | Blocking | The validator, DLP and VRF are BSL-1.1 with no Additional Use Grant until 2027-12-01. What are the production terms for a third party running `magicblock-validator` before then? Does an app that only uses MagicBlock's deployed programs and public nodes need any licence? Is the local stack (`mb-test-validator`) fine for a prototype? | Decides whether self-hosting or hybrid is even legal before 2027-12-01, and whether the prototype can use the local stack | MGD §F.4; MGD §B.1, §B.14 |
| L2 | Blocking | What do dedicated nodes cost, who operates them, do they get their own identity, are they whitelisted in DLP automatically, and what SLA do they carry? | The only route to a guarantee without self-hosting; needed to choose managed vs hybrid | MGD §F.3; REPL Q6 |
| L3 | Important | What is the process and what are the criteria for whitelisting a third-party validator (fees-vault creation by the DLP authority)? | Without the fees vault a self-run validator cannot commit or undelegate; state would be trapped | MGD §F.5; MGD §B.6 |
| L4 | Important | Can ASTrix get the private knowledge-base runbooks (deployment prerequisites, recovery, settlement delivery)? The README links return 404. | Recovery and failover procedures (R1, R2) depend on them | ARCH Q6; MGD §F.9; ARCH §10 |
| L5 | Important | What are the hardware requirements for a self-hosted 2.x leader plus verifier? | The MGD §B.12 cost table rests on assumptions | REPL Q6; MGD §B.4 |
| L6 | Nice to know | Does the public Magic Router list third-party validators registered in the Magic Domain Program? | Affects client routing in a hybrid setup | MGD §F.6 |

## 2. Availability, SLA, RTO and RPO

| ID | Priority | Question | Why it matters for ASTrix | Raised in |
|---|---|---|---|---|
| A1 | Blocking | Is there an SLA or uptime target for public mainnet ER nodes? How much notice is given before validator upgrades? | A persistent civilization is unavailable whenever its one validator is. Devnet moved from core 2.0.4 to 2.0.5 with no notice to ASTrix. | MGD §F.1; MGD §A.4, §A.5 |
| A2 | Blocking | What RPO and RTO do public ERs target? Is the ledger fsynced per block? What are the disk backup policy and the history-retention period? | Sets how much uncommitted world activity can be lost and how often ASTrix must commit (cost) | REPL Q2; REPL §1.4 |
| A3 | Blocking | Is there a maximum lifetime, inactivity timeout or cleanup policy for delegations on public validators? Will public nodes ever force-undelegate? | ASTrix worlds are delegated for months and idle worlds are never recycled (AX Identity doc §6) | ARCH Q1 |
| A4 | Important | Can a program owner export, or be given, snapshots of its delegated and Magic accounts? | Faster recovery than replaying ASTrix's archive; needed if Ephemeral accounts hold bulky state | REPL Q3 |
| A5 | Nice to know | How does `status.magicblock.app` measure downtime? | Needed to interpret the 4–29 minutes of devnet downtime per server observed over 10 days | MGD §F.10; MGD §A.1 |

## 3. Replication and failover

| ID | Priority | Question | Why it matters for ASTrix | Raised in |
|---|---|---|---|---|
| R1 | Blocking | Do the public ERs (devnet eu/as/us; mainnet eu/us/as/sa/as-tyo) run replicas or verifiers? If the primary host is lost, is failover manual or automatic, and under which identity? Can a promoted follower keep the same identity? | DLP v1 pins the validator identity in each delegation; a failover that changes identity means undelegate and redelegate | REPL Q1; MGD §B.10; REPL §1.3 |
| R2 | Blocking | Are `request_undelegation` and `undelegate_with_rollback_after_timeout` live on mainnet and devnet DLP? Will the SDK expose them? What is the supported recovery path if a validator disappears? | This is ASTrix's only way to take a world back from a dead validator. ASTrix has no wrapper yet and would need a program upgrade. | ARCH Q2; MGD §F.8; REPL §1.7 |
| R3 | Blocking | The docs say commits are finalized through fraud proofs and a security committee; the deployed legacy finalize path trusts the whitelisted validator. Which path do public ERs use, and is any challenge mechanism active? | Defines what players must trust about committed world state | ARCH Q10; REPL Q7; ARCH §6 (flagged conflict) |
| R4 | Blocking | Is the ER `Clock.unix_timestamp` monotonic across restarts and validator migrations? What is the maximum skew from real time? | The proposed world time is a function of the ER clock (TICK §4.2) | TICK §6.6 |
| R5 | Important | When will DLP v2 ship (`DelegationCluster`, validator rotation, challenge mode)? How do v1 delegations migrate? How is rotation authorized? | Rotation would allow failover without undelegation | ARCH Q3; REPL Q1, Q7 |
| R6 | Important | Is the 9,000-slot undelegation timeout fixed in slots? Will it shorten as Solana slots fall toward 200 ms? Can a program configure it? | Sets the minimum recovery time for a lost validator | REPL Q9 |

## 4. Commits and delegation

| ID | Priority | Question | Why it matters for ASTrix | Raised in |
|---|---|---|---|---|
| C1 | Important | When does the production V1 build (`8886db2`) use diff commits rather than full buffer writes? How many base transactions does a 10 KB commit take, and who bears that cost on dedicated nodes? | ASTrix's world is about 33 accounts up to 10 KB each; commit cost and time scale with this | REPL Q4 |
| C2 | Important | Magic Actions: the docs say they are not atomic with the commit and the validator retries without the actions; a blog post describes one atomic operation. Which is correct? | Cross-world transfers and settlements depend on it | ARCH §8 (flagged conflict); REPL §3.3 |
| C3 | Important | What happens to an active scheduled task when its target account is undelegated and later redelegated to another ER? | Needed for any migration or failover runbook | TICK §6.10; MGD §0.4 |
| C4 | Nice to know | Will `commit_frequency_ms` ever be honoured (issue #625), or should programs always schedule their own commits? | ASTrix already self-schedules; this only affects future simplification | REPL Q8; ARCH §5.1 |

## 5. Scheduled tasks (cranks)

| ID | Priority | Question | Why it matters for ASTrix | Raised in |
|---|---|---|---|---|
| S1 | Blocking | Which validator line (1.1.1 or 2.x) runs on each mainnet and devnet ER today, and how is a change announced? The crank docs say devnet-eu runs 1.1.1; ASTrix observed 2.0.4 and then 2.0.5 there. | The two lines use different crank models, CLIs and SDK lines | TICK §6.1; TICK §1 (flagged conflict) |
| S2 | Blocking | On 2.x ERs, does MagicBlock run a public `hydra-cranker` for validator-created cranks on mainnet? Is it supported, with any SLA? Who operates devnet cranker `8hwzNBBP19tmy7R9udyWkm6ne5y4TA1J1TEYTnWqsJNy`? | ASTrix's world currently advances only because this cranker fires | ARCH Q8; MGD §F.7; TICK §6.2 |
| S3 | Blocking | Do public 1.1.1 ERs run with `task-scheduler.reset = false`, and what `min_interval` do they use? Do tasks survive validator restarts, upgrades, region failover and the switch from 1.1.1 to 2.x? | A wiped task stops the world with no notice | TICK §6.3 |
| S4 | Important | Is the effective CU budget for a 1.1.1 `ExecuteCrank` transaction about 400k (2 × 200k default)? Can a task request more CU or a heap frame? Can a 2.x validator-created crank set `cu_limit`? | Sets how many worlds one `settle` crank can cover | TICK §6.4 |
| S5 | Important | Is there a cap on active tasks per authority, program or validator? How many cranks per validator, at what minimum interval? | ASTrix's current design needs one tick and one checkpoint crank per 16 and 8 worlds | TICK §6.8; REPL Q5 |
| S6 | Important | On 1.1.1, is a failed or removed task observable to the program (account, log or RPC method), or only in the validator's SQLite? | 1.1.1 drops a task after 10 failed sends; ASTrix needs to detect this | TICK §6.9 |
| S7 | Nice to know | Can a crank-scheduled instruction request VRF, given that only the read-only crank signer may sign? Is a program-PDA payer on the ER queue the supported pattern? Is there an example? | Needed for epoch seeds on a public schedule (VRF §3.4) | VRF Q3 |

## 6. VRF

| ID | Priority | Question | Why it matters for ASTrix | Raised in |
|---|---|---|---|---|
| V1 | Important | Who operates the production oracles for the base and ER queues, and how many are registered? Is there a status page or a fulfilment SLA? | Oracle liveness is trusted; an unfulfilled request expires with no refund | VRF Q1 |
| V2 | Important | Is `Dsjad1Bs9aoE6nH6sg8kdNX22XMvnGiKcRJeeeTGW7zJ` the Squads vault? What are the threshold and any timelock for upgrades and oracle-set changes? | The upgrade authority can replace the verifier and the oracle keys | VRF Q2 |
| V3 | Important | Is `DEFAULT_EPHEMERAL_QUEUE` served on every public ER region and on validator 2.x? | ASTrix would use the free ER queue in every region it delegates to | VRF Q4 |
| V4 | Important | What are the measured p50 and p99 latencies of the ER and base queues, and the historical fulfilment rate? | Only documented targets exist; ASTrix did not time its fulfilments | VRF Q5 |
| V5 | Important | How is oracle withholding and early leakage of outputs mitigated? Is the VRF secret in an HSM or TEE? It is derived by HKDF from the oracle's Solana keypair. | Withholding is the one way the oracle can bias outcomes | VRF Q6 |
| V6 | Nice to know | The README says the scheme follows RFC 9381, but the suite differs (Ristretto255, SHA-256, proof Γ, U, V, s). Is there a written spec and test vectors for independent verifiers (for example WASM)? Do the audits cover the cryptography or only the program? | ASTrix wants players to verify world seeds and discoveries independently | VRF Q7 |
| V7 | Nice to know | After ER state containing a VRF result is committed, is there any base-layer evidence of the proof, or is it trusted as ER state? | Affects what an auditor needs to keep (ASTrix plans to journal the proof) | VRF Q8 |
| V8 | Nice to know | What are the limits on callback account count and `callback_args` size per request? | Sizing nonce-bound callbacks | VRF Q9 |
| V9 | Nice to know | Will `ProvideRandomness` add an age check, so expired requests cannot be fulfilled before they are purged? | ASTrix must otherwise reject late callbacks itself (planned anyway) | VRF Q10 |

## 7. Limits and throughput

| ID | Priority | Question | Why it matters for ASTrix | Raised in |
|---|---|---|---|---|
| T1 | Blocking | ER limits not in the docs: maximum accounts per transaction and the account-lock limit (64? 128?); any per-block or per-writable-account CU limit; maximum delegated accounts per program; request rate limits per IP or program; WebSocket subscription limits per client; and is the Hydra account limit 32 (skill) or 64 (`hydra-api`)? | Account layout, crank fan-out and client subscription design all depend on these | ARCH Q4; MGD §F.2; TICK §6.5; REPL Q5 |
| T2 | Blocking | What capacity guidance applies to a persistent game with about 10k–100k small delegated accounts on one public validator? What sustained TPS, and TPS per hot writable account, do public ERs support? | ASTrix at 25 worlds is about 825 accounts; at 500 worlds about 16,500 (REPL §2.2 layout) | ARCH Q7; REPL Q5 |
| T3 | Important | How are transactions ordered on public nodes? Can an app get FCFS guarantees or a custom sequencer on a dedicated node? | Contested resources (two players, one pickup) are decided by arrival order | ARCH Q5 |

## 8. Pricing

| ID | Priority | Question | Why it matters for ASTrix | Raised in |
|---|---|---|---|---|
| P1 | Important | Will crank executions stay free (base fee 0, validator-paid), or be charged later, and to whom? Fees are described as applying to "the current release": how much notice is given before ER transaction, session or commit fees change? | ASTrix's cost model assumes free ER transactions and cranks | TICK §6.7; MGD §A.4 |
| P2 | Important | Dedicated-node pricing (see L2) | Production budget | MGD §F.3; REPL Q6 |

## 9. Roadmap

| ID | Priority | Question | Why it matters for ASTrix | Raised in |
|---|---|---|---|---|
| M1 | Blocking | When will mainnet validators move from 1.1.1 to 2.x, and what breaks for programs using 1.1.1 cranks? | ASTrix's working code was proven on devnet 2.0.x; mainnet runs 1.1.1 | ARCH Q9; TICK §6.1 |
| M2 | Important | DLP v2 timeline (see R5) | Failover without undelegation | ARCH Q3 |
| M3 | Nice to know | `commit_frequency_ms` (see C4) and `ProvideRandomness` age check (see V9) | — | REPL Q8; VRF Q10 |

## 10. Cross-reference: every original question

| Original | Consolidated |
|---|---|
| ARCH Q1 | A3 |
| ARCH Q2 | R2 |
| ARCH Q3 | R5, M2 |
| ARCH Q4 | T1 |
| ARCH Q5 | T3 |
| ARCH Q6 | L4 |
| ARCH Q7 | T2 |
| ARCH Q8 | S2 |
| ARCH Q9 | M1 |
| ARCH Q10 | R3 |
| MGD 1 | A1 |
| MGD 2 | T1 |
| MGD 3 | L2, P2 |
| MGD 4 | L1 |
| MGD 5 | L3 |
| MGD 6 | L6 |
| MGD 7 | S2 |
| MGD 8 | R2 |
| MGD 9 | L4 |
| MGD 10 | A5 |
| TICK 1 | S1, M1 |
| TICK 2 | S2 |
| TICK 3 | S3 |
| TICK 4 | S4 |
| TICK 5 | T1 |
| TICK 6 | R4 |
| TICK 7 | P1 |
| TICK 8 | S5 |
| TICK 9 | S6 |
| TICK 10 | C3 |
| VRF Q1 | V1 |
| VRF Q2 | V2 |
| VRF Q3 | S7 |
| VRF Q4 | V3 |
| VRF Q5 | V4 |
| VRF Q6 | V5 |
| VRF Q7 | V6 |
| VRF Q8 | V7 |
| VRF Q9 | V8 |
| VRF Q10 | V9, M3 |
| REPL Q1 | R1, R5 |
| REPL Q2 | A2 |
| REPL Q3 | A4 |
| REPL Q4 | C1 |
| REPL Q5 | T1, T2, S5 |
| REPL Q6 | L2, L5, P2 |
| REPL Q7 | R3, R5 |
| REPL Q8 | C4, M3 |
| REPL Q9 | R6 |
| Flagged conflicts | C2 (ARCH §8), R3 (ARCH §6), S1 (TICK §1) |

## 11. Open items ASTrix must answer itself (not for MagicBlock)

Found in the input documents. They need ASTrix measurements, not vendor answers.

| Item | Source |
|---|---|
| Why the devnet tick rate is about 99% of the expected rate (missed firings or clock-gate skips) | ARCH §13; TICK §2.1 |
| What happens when the 200,000-iteration crank runs out (~2026-11-28) | ARCH §13; TICK §1.4 |
| Undelegate and re-delegate have never been tested | ARCH §5.2, §13 |
| CU per `tick` was never measured; CU per ported rule is unknown | TICK §2.1, §2.2 |
| VRF latency was not timed | VRF §1.7 |
| VRF audit PDFs were not read; WASM build of `verify_vrf` not tried | VRF §1.2, §5 |
| Production V1 commit `8886db2` was not inspected; V1 facts come from the `v1.1.1` tag | REPL §6 |
| Solana rent and slot-time pages could not be fetched directly; re-read before final cost decisions | REPL §6; ARCH §11 |
