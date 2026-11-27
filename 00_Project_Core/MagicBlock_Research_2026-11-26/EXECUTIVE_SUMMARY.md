# ASTrix and MagicBlock: executive summary

**Check date: 2026-11-26.** Research only; nothing was deployed, funded or signed. **Fact** = documented, verified in source, or demonstrated (labels [Doc]/[Src]/[Ex] in the cited documents). **Inference** = the authors' reasoning ([Inf]/[Est]). Document keys are in the index at the end.

**1. Can ASTrix realistically be built on MagicBlock?**
Yes, for the shared economic layer of the game. No, for the whole simulation.
- *Fact:* ASTrix already runs a Rust settlement program on a devnet rollup. Its world has ticked with no browser open for 2.8 days, with zero-fee transactions, VRF discoveries and commits to Solana (ARCH §13).
- *Fact:* The full ASTrix tick, with wildlife and navigation, does not fit one transaction's compute budget (TICK §2.2).
- *Inference:* Realistic means porting a bounded set of economic rules to Rust and keeping spatial simulation in TypeScript (Proposal §6).

**2. What does "built on MagicBlock" technically mean?**
- *Fact:* ASTrix writes Solana programs in Rust. It delegates its world accounts to one MagicBlock validator, which executes them at zero fee and commits them to Solana when the program asks. There is no "rollup" to create, and no TypeScript runs on MagicBlock (ARCH §1, §3.3, §5).
- *Fact:* While accounts are delegated, that one validator controls ordering and liveness, and its commits are accepted without a fraud proof (ARCH §6).
- *Inference:* The program is authoritative for what it enforces, and MagicBlock is trusted for everything else (Proposal §3).

**3. What must remain outside MagicBlock?**
Rendering, terrain generation, meshes, movement, navigation, wildlife minds, arrow physics, offline play, the local journal and saves, and ASTrix's own archive and verifier.
- *Fact:* None of these fits the compute, heap or 10,240-byte commit limits (TICK §2.2–2.3; REPL §3.1).
- *Owner decision on record:* the game must run without the chain (AX `MagicBlock_Architecture_2026-11-23.md` §8).

**4. Can ASTrix's world continue running when players are offline?**
Yes, while MagicBlock's validator and its scheduler or cranker are up.
- *Fact:* This is demonstrated on devnet (ARCH §13).
- *Fact:* Scheduled tasks are best-effort with no SLA. Today's ticks are fired by a cranker key ASTrix does not control, and the crank is expected to run out around 2026-11-28 (TICK §1.2, §1.4; ARCH §13).

**5. How should world ticks be implemented?**
- *Inference:* World time should be computed from the ER clock. Every instruction should first call a lazy, idempotent `settle(now)` that applies elapsed time in closed form, capped per call. A slow crank (every 30–60 s) only keeps the world live (TICK §4).
- *Fact:* The current 2 s clock-gated `tick` loses world time after outages, because missed runs replay back to back as no-ops (TICK §2.1).

**6. Where should VRF be used?**
For rare, valuable or contested outcomes:
- world genesis seeds;
- prospecting and loot;
- rare births;
- per-epoch seeds for weather and spawn waves.

Never in generation, per-tick behaviour, or anything needed offline (VRF §2.2).
- *Fact:* Proofs are verified on chain before the callback. The ER queue is free. Requests expire after 120 s with no notice or refund (VRF §1.6–1.9).
- *Fact:* ASTrix's prospect callback is not bound to a request nonce, and its world seed is chosen by the caller. Both need fixing (VRF §2.1).

**7. How can a civilization survive validator failure?**
Not through MagicBlock alone.
- *Fact:* There is no documented RTO or RPO. State lives on one validator's disk, and replication is same-operator only. The escape hatch (rollback to the last commit after about 9,000 slots) exists in DLP source but is not wired into ASTrix (REPL §1).
- *Inference:* ASTrix needs four things (REPL §2.5; Proposal §9):
  - regular commits;
  - its own archiver and hash chain;
  - escape-hatch wrapper instructions;
  - `state_epoch` handling and a tested re-delegation path.

**8. Managed, self-operated or hybrid?**
**Managed public nodes now. Engineer for portability.**
- *Fact:* Self-operating needs a commercial licence (BSL until 2027-12-01) and MagicBlock's whitelisting (MGD §B, §E).
- *Inference:* Self-operating would also move the trust to ASTrix rather than remove it, and the on-call load is too much for a 1–3 person team (MGD §B.14).
- *Inference:* Revisit hybrid or dedicated nodes once MagicBlock publishes terms (MGD §E).

**9. What is the smallest prototype that proves the architecture?**
- *Inference:* An isolated world with its own program id and accounts that demonstrates the 12 items in the Prototype Plan. It runs on a local MagicBlock stack first, then on devnet with the owner's approval. Effort: 28–40 engineer-days [Estimate].
- The proof is program-enforced rejection of invalid and forged transactions, ER signatures for every accepted action, and an independent verifier that uses only public RPC (Prototype Plan §4).
- Kill criteria are in Prototype Plan §6.

**10. What must be confirmed with MagicBlock before committing?**
The 15 blocking questions in Open Questions:
- licensing and dedicated-node terms;
- SLA, RPO and RTO;
- delegation lifetime;
- failover and identity;
- whether the escape hatch is live;
- the fraud-proof status;
- ER clock monotonicity;
- validator line per ER;
- mainnet cranker support;
- task persistence;
- undocumented limits;
- capacity guidance;
- the mainnet 2.x timeline.

## Deliverables index

| # | File | Content |
|---|---|---|
| 1 | [MagicBlock_Architecture_Research.md](MagicBlock_Architecture_Research.md) (ARCH) | What MagicBlock executes; delegation, commits, limits; what ASTrix's devnet program shows |
| 2 | [ASTrix_MagicBlock_Architecture_Proposal.md](ASTrix_MagicBlock_Architecture_Proposal.md) (Proposal) | Authority model, components, rule split, three transaction flows, partitioning (Part 6), activity split and costs (Part 7), save-safe migration |
| 3 | [MagicBlock_Scheduled_Tasks_and_World_Ticks.md](MagicBlock_Scheduled_Tasks_and_World_Ticks.md) (TICK) | Crank mechanics on 1.1.1 and 2.x; the lazy `settle` tick design |
| 4 | [MagicBlock_VRF_and_Deterministic_World_Generation.md](MagicBlock_VRF_and_Deterministic_World_Generation.md) (VRF) | VRF construction, trust, cost; seed vs VRF per system |
| 5 | [MagicBlock_Replication_Persistence_Recovery.md](MagicBlock_Replication_Persistence_Recovery.md) (REPL) | Storage, replication, recovery, integrity rules, partitioning and cost tables |
| 6 | [MagicBlock_Managed_vs_Self_Operated_Infrastructure.md](MagicBlock_Managed_vs_Self_Operated_Infrastructure.md) (MGD) | Managed, self-operated and hybrid compared; recommendation |
| 7 | [ASTrix_MagicBlock_Prototype_Plan.md](ASTrix_MagicBlock_Prototype_Plan.md) (Prototype Plan) | 12 demonstrations, order, acceptance tests, proof of authority, budget, kill criteria |
| 8 | [MagicBlock_Open_Questions_for_Engineering_Team.md](MagicBlock_Open_Questions_for_Engineering_Team.md) (Open Questions) | Deduplicated, prioritised questions for MagicBlock, with cross-references |
