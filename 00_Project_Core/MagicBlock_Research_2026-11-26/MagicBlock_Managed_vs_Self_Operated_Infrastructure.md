# MagicBlock: managed vs self-operated infrastructure for ASTrix

**Check date for every source: 2026-11-26.** Research only; nothing was deployed, funded or signed. Labels as in the companion document [MagicBlock_Architecture_Research.md](MagicBlock_Architecture_Research.md): **[Doc]** officially documented, **[Src]** verified in source, **[Ex]** demonstrated (example, ASTrix evidence, or a live read-only check today), **[Bench]** independently benchmarked (none found), **[Inf]** architectural inference, **[Unk]** unknown. Cost figures marked **[Assumption]** are the author's estimates, not quotes.

## 0. Key findings

1. **There is no "create a rollup" step on managed infrastructure.** You delegate accounts to one of MagicBlock's existing validators by naming its identity. One validator is shared by every app that delegates to it. [Src] (`delegation-program/program/src/legacy/processor/fast/delegate.rs`)
2. **Self-operating a validator that settles to Solana needs MagicBlock's cooperation twice.**
   - *License:* the validator is BSL-1.1 with no production-use grant until 2027-12-01. [Src] (`magicblock-validator/LICENSE.md`)
   - *Whitelist:* the deployed Delegation Program accepts commits and undelegations only from validators whose fees vault exists, and only MagicBlock's DLP upgrade authority can create that vault. [Src] (`init_validator_fees_vault.rs`, `commit_state.rs`, `undelegate.rs`; deployed build `0c551fa`)
3. **No SLA, quota or capacity figure is published for public nodes.** "Dedicated nodes" are offered on the pricing page with no price or terms. [Doc]
4. **Moving between validators means undelegate → redelegate.** In DLP v1 the validator is pinned in each delegation record. Crank tasks and the validator-scoped `magic_fee_vault` must be recreated or re-pointed. [Src][Inf]
5. **Mainnet and devnet run different validator major versions today**: mainnet 1.1.1 (`8886db2`), devnet 2.0.5 (`380360a`). The two use different crank models. [Ex] (live `getVersion`)

---

## A. MagicBlock-managed execution

### A.1 What MagicBlock operates

Live inventory from read-only checks on 2026-11-26 [Ex], cross-checked with [ER docs](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-rollup.md) and the [status API](https://status.magicblock.app/api/services):

| Service | Mainnet | Devnet | Notes |
|---|---|---|---|
| ER validators | `as`, `as-tyo`, `eu`, `us`, `sa`, `mainnet-tee` (`*.magicblock.app`) | `devnet-as`, `devnet-eu`, `devnet-us`, `devnet-tee` | Mainnet reports `magicblock-core 1.1.1`, commit `8886db2`, solana-core 4.0.0. Devnet reports `core 2.0.5`, commit `380360a`, solana-core 4.2.2. The same identity key is used per region on both networks (e.g. `MEUGGrYP…` for eu and devnet-eu). |
| Magic Router | `router.magicblock.app` | `devnet-router.magicblock.app` | `getRoutes` lists the validators above with `baseFee 0`, `blockTimeMs 10` (TEE mainnet 50). Serves a subset of RPC; WebSocket supports only `signatureSubscribe`. [Doc][Src] |
| Base RPC proxy | `rpc.magicblock.app/mainnet` | `rpc.magicblock.app/devnet` | Recommended in the dev skill. [Doc] |
| VRF oracle | per region | per region | Status API service `vrf_oracle`. VRF on the ER is free; on Solana 0.0005–0.0008 SOL per request. [Doc] ([pricing](https://docs.magicblock.gg/pages/overview/additional-information/pricing.md)) |
| Pricing oracle | per region | per region | Pyth Lazer feeds republished on the ER. [Doc] |
| Crank execution | 1.1.1 built-in task scheduler inside the validator | Hydra crank triggered by an external cranker | On devnet a cranker `8hwzNBBP…` (not ASTrix) triggered ASTrix's ticks today. Its operator is not documented. [Ex][Unk] |
| Status page | `status.magicblock.app` | same | Per-server live status and daily downtime minutes. [Ex] |
| On-chain programs MagicBlock controls | Delegation Program (`DELeGG…`, Squads multisig upgrade authority), VRF (`Vrf1RN…`), Hydra (`Hydra17…`, `eHyd5…`), Magic Domain Program (`DmnRGf…`), Session Keys (`KeyspM…`), Permission program | same | [Doc][Src] |

Downtime recorded by the status API for 2026-11-17…26 (sum of daily minutes) [Ex]:

| Server | ER | Router | VRF | Pricing |
|---|---|---|---|---|
| All 6 mainnet servers | 0 | 0 | 0 | 0 |
| devnet-as | 8 | 0 | 8 | 7 |
| devnet-eu | 9 | 0 | 13 | 4 |
| devnet-tee-as | 27 | n/a | 13 | 29 |
| devnet-us | 0 | 0 | 0 | 0 |

How the status API measures downtime is not documented. [Unk]

### A.2 What ASTrix must operate on managed infrastructure

[Inf, based on ASTrix's current setup]
- The Solana program (deploy, upgrade authority, keypair custody).
- Rent and deposits for every delegated account, plus a funded delegated fee payer or treasury for commits beyond the free allowance.
- Crank scheduling transactions, and re-scheduling after iterations run out.
- A web host for the client (today `astrix.nyc.boxd.sh`).
- Optional: an indexer or backup reader if ER history retention matters (ER history is bounded; see the architecture doc §11).
- Optional: its own `hydra-cranker` if MagicBlock's devnet cranker is best-effort (MIT, published as npm packages). [Doc] (dev skill `cranks.md`)
- Monitoring of the status API, its own world state, and its treasury balance.

### A.3 How rollups are "created"

- Your program CPIs into DLP `delegate` with an optional validator pubkey. No validator signature and no MagicBlock approval is needed at delegation time. If no validator is given, DLP uses `MAS1Dt9…` (Asia). [Src]
- The Magic Router discovers validators through an on-chain registry (Magic Domain Program records with identity, URL, block time, fees, features, country). [Src] ([magic-router README](https://github.com/magicblock-labs/magic-router); `magic-domain-program/src/processors/register.rs`)
- Configuration options per delegation: validator, `commit_frequency_ms` (stored but not acted on; validators never auto-commit), PDA seeds, and optional post-delegation actions. [Src][Doc]
- Marketing language describes a short-lived rollup spun up per match ([Interstellar Command post](https://www.magicblock.xyz/blog/interstellar-command)); in code this is a delegation session on a shared validator. [Doc vs Src]

### A.4 Control MagicBlock retains

[Src][Doc][Inf]
- **Ordering and liveness** of every write to delegated accounts on its validator.
- **Commit honesty.** DLP v1 checks only that the named validator signed; there is no fraud-proof or challenge step in the deployed program. The docs describe fraud proofs, but the v2 design doc says v1 is current and v2 adds challenge mode later. [Src] (`docs/design/mimd-0024-fraud-proofs.md`)
- **Software version.** Devnet moved from core 2.0.4 (recorded by ASTrix 2026-11-24) to 2.0.5 (today) with no action from ASTrix. Upgrade notice policy is undocumented. [Ex][Unk]
- **Fee parameters.** Fees are described as applying to "the current release" and are set in DLP and validator code that MagicBlock upgrades. [Doc]
- **DLP and VRF program upgrades** through MagicBlock's Squads multisig. [Doc] (`delegation-program/README.md`)
- **Validator whitelist** (fees vaults) and the router's view of which validators exist. [Src]
- **Compliance gating** on TEE nodes (IP geofencing, sanctions screening) per the PER docs; the 2.0 config also has an optional risk-check (AML) hook for post-delegation action signers. [Doc][Src] (`config.validator.example.toml` `[chainlink.risk]`)

### A.5 Availability guarantees

- **No SLA is documented** for public nodes. The docs call them "supported for development" in the validator list note. [Doc] ([ER lifecycle page](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-rollup.md))
- "Dedicated nodes" are described as providing maximum reliability with your own dedicated infrastructure; no terms are published. [Doc] (pricing)

### A.6 Behaviour when MagicBlock is unavailable

[Src][Inf]
- Delegated accounts cannot be written anywhere: on Solana they are owned by DLP, and only the named validator can write them on the ER.
- Reads of the last committed state on Solana still work. ASTrix already has this fallback, and it checks `sha256(world) == passport.state_hash`. [Ex]
- Uncommitted ER state is unavailable until the validator returns. Engine recovers from local snapshots and history on restart. [Src]
- If the validator never returns: DLP source contains an owner-program request-undelegation path and a rollback after at least 9,000 slots (about 1 hour) that returns the last committed state and drops anything newer. It is not exposed in SDK 0.18.0 or documented. [Src][Unk]
- Cranks stop while the validator or cranker is down; ASTrix's tick is clock-gated, so the world pauses rather than catching up. [Inf from `lib.rs` tick design]
- The router depends on the validators; if one region is down, the accounts delegated there stay unavailable. The router does not fail over delegated accounts. [Src] (router routes by delegation record)

### A.7 Pricing, quotas, capacity

| Item | Price | Evidence |
|---|---|---|
| ER transaction | 0 "in the current release" | [Doc] pricing |
| Delegation session | 0.003 SOL from the deposit at undelegation | [Doc] fees page |
| Commits after the first | 0.001 SOL each from the deposit; 10-commit cap without fee payer | [Doc] |
| Live commit fee with fee payer | 0.001 SOL per account from commit 26 | [Doc] |
| Base Actions | requested CU × 50,000 / 1,000,000 lamports, rounded up; callback +5,000 lamports | [Doc] |
| Ephemeral Account storage | (bytes + 60) × 32 lamports, refundable | [Doc] |
| Lamports top-up helper | 300,000 lamports mainnet, 3,000,000 devnet | [Doc] |
| VRF on ER | free | [Doc] |
| Quotas, rate limits, max accounts, subscription limits | **not documented** | [Unk] |

### A.8 Production support and dedicated offerings

- Support contact for running your own nodes: `development@magicblock.xyz`. [Doc] (pricing page)
- Discord is linked from the validator README. [Doc]
- Dedicated nodes: mentioned, unpriced. Whether a dedicated node is a MagicBlock-operated machine with your own identity, and whether it is whitelisted automatically, is not documented. [Unk]
- Different services have different commercial models: ER (session/commit fees), VRF (per request on Solana, free on ER), Private Payments API (0.00204 SOL + 0.1% per transfer), oracles (free). [Doc]

---

## B. Self-operated

### B.1 Repositories, binaries and services

| Component | Repo / package | License | Needed? |
|---|---|---|---|
| ER validator (leader) | [`magicblock-validator`](https://github.com/magicblock-labs/magicblock-validator) `bins/validator`; npm `@magicblock-labs/ephemeral-validator` | BSL-1.1, no Additional Use Grant, Change Date 2027-12-01 → MIT | Yes |
| Engine (execution core) | [`magicblock-engine`](https://github.com/magicblock-labs/magicblock-engine) | Apache-2.0 (pulled in as a dependency) | Yes (inside validator) |
| Verifier (replica) | `bins/verifier` | BSL-1.1 | For HA/audit |
| Operator CLI (`magicblock`): fee claims, domain register/sync/unregister, healthcheck, failure monitor | `bins/magicblock` | BSL-1.1 | Yes |
| Terminal monitor | `bins/validator-tui` | BSL-1.1 | Optional |
| Local stack (`mb-stack`, `mb-test-validator`, `query-filtering-service`, `rpc-router`, `vrf-oracle`) | npm `@magicblock-labs/ephemeral-validator` | BSL-1.1 | Dev only |
| Hydra cranker | [`hydra`](https://github.com/magicblock-labs/hydra), npm `@magicblock-labs/hydra-cranker-<platform>` | MIT | For 2.x cranks |
| Magic Router | [`magic-router`](https://github.com/magicblock-labs/magic-router) | No license file (GitHub reports none) | Optional |
| Delegation Program | [`delegation-program`](https://github.com/magicblock-labs/delegation-program) | BSL-1.1 | Use MagicBlock's deployed instance |
| Magic Domain Program | [`magic-domain-program`](https://github.com/magicblock-labs/magic-domain-program) | No license file | Registration is permissionless (payer must equal identity) [Src] |
| VRF | [`solana-vrf`](https://github.com/magicblock-labs/solana-vrf) | BSL-1.1 | If you need your own oracle |
| Load testing | [`redline`](https://github.com/magicblock-labs/redline) | — | Optional |

Sources: each repo's `LICENSE*` file and `gh api repos/... --jq .license` on 2026-11-26. [Src]

### B.2 Deployment instructions

- Build and run: `cargo run --release --locked -p magicblock-validator -- config.toml`; configuration is TOML, overridden by `MBV_…` environment variables, overridden by CLI flags. [Doc] (`bins/validator/README.md`, `config/README.md`)
- Without a config the leader connects to devnet and uses a **publicly embedded development keypair**, which must not be used in production. [Doc] (`config/README.md`)
- The leader's identity must be funded: startup submits base-chain transactions to initialize and delegate fee vaults. [Doc]
- Domain registration is a separate operator command. [Doc] (`bins/magicblock/README.md`)
- Validator 1.1.1 CLI uses `--lifecycle`, `--remotes`, `-l`; the 2.0 CLI accepts only `--remotes`, `-l`, `-m`, so 1.1.1 guides do not work on 2.0. [Doc] ([local development](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/local-development.md))
- Multi-host deployment prerequisites and recovery runbooks are in a private knowledge base (links return 404). [Unk]

### B.3 Validator configuration (2.0 example, abridged)

From [`config.validator.example.toml`](https://github.com/magicblock-labs/magicblock-validator/blob/master/config.validator.example.toml) [Src]:

| Section | Key settings |
|---|---|
| `remotes` | Solana HTTP, WebSocket and/or gRPC (Helius LaserStream needs an API key) endpoints |
| `[engine.authority]` | Validator identity keypair (base58) |
| `[engine.accountsdb]` | Directory, LRU capacity |
| `[engine.blockstore]` | `blocktime` (example 400 ms; public nodes run 10 ms), `superblock` slots |
| `[engine.ledger]` | Directory, `size-limit` (example 512 MiB) |
| `[engine.replication]` | `allowed-followers`, bind address |
| `[aperture]` | RPC listen address (WS = port + 1), Geyser plugins |
| `[commit]` | `compute-unit-price` for commit transactions (default 1,000,000 micro-lamports/CU) |
| `[ledger]` | RocksDB block cache; the comment says production nodes should use 16 GB or more |
| `[chainlink]` | `allowed-programs`, resubscription delay, undelegation-request poll (default 5 min), WS subs per connection (900), optional `[chainlink.risk]` AML server |
| `[[programs]]` | Programs preloaded at startup |
| `[task-scheduler]` | Minimum interval, reset (1.1.1) |

### B.4 Hardware requirements

- **Not documented.** [Unk]
- Clues [Src][Doc]: 1.1.1 runs CPUs/2 − 1 executor threads (`magic_validator.rs`); the config comment recommends ≥16 GB RocksDB block cache in production; a MagicBlock blog post says the containerized validator is under 50 MB and starts executing in 1–3 ms ([6 innovations](https://www.magicblock.xyz/blog/6-core-innovations)); the Breakpoint 2025 talk claimed 50k TPS "on commodity hardware" ([summary](https://solanacompass.com/learn/breakpoint-25/tech-talk-magicblock-labs), vendor claim).
- **[Assumption]** A non-TEE leader for a small game should run on 8–16 vCPU, 32–64 GB RAM, fast NVMe, with low latency to its Solana RPC. TEE (PER) nodes need Intel TDX hardware, which most VPS plans do not offer.

### B.5 Solana RPC dependency

- The validator clones every account and program it touches from Solana and subscribes to changes; it sends every commit and undelegation to Solana. It needs a reliable HTTP RPC plus WebSocket or gRPC streaming. [Src] (Chainlink README, config)
- Account loading depends on RPC availability; reconnection resubscribes at 50 ms per account by default (1,000 accounts ≈ 50 s). [Src] (config comment)
- Helius plans are $0 / $49 / $499 / $999 per month ([Helius plans](https://www.helius.dev/docs/billing/plans)); which plan includes LaserStream gRPC at the needed volume was not checked. [Doc, third party]

### B.6 Keys and permissions

| Key / record | Purpose | Who controls it |
|---|---|---|
| Validator identity | Signs ER blocks, commits, undelegations, fee-vault setup | You |
| **Validator fees vault (DLP)** | Proof of whitelisting; required for commit, finalize and undelegate | **Created only by DLP's upgrade authority (MagicBlock)** [Src] |
| Magic fee vault (DLP) | Validator-scoped vault for live commit fees; needs the fees vault first | You, after whitelisting [Src] |
| Magic Domain record | Advertises URL, fees, block time to the router | You; permissionless [Src] |
| `ProgramConfig.approved_validators` (DLP) | Optional per-program allowlist of validators | Your program's upgrade authority [Src] |
| Replication follower identities | Allowed verifiers | You |
| Commercial license | Production use of BSL code | MagicBlock |

Without whitelisting, a self-run validator can still execute and serve state for accounts delegated to it, but it cannot commit or undelegate them through DLP, so state would be trapped until the rollback timeout. [Src][Inf]

### B.7 Monitoring and logging

- Prometheus metrics on `[metrics].address`. [Doc] (`metrics/README.md` referenced from the validator README)
- `magicblock healthcheck` submits a probe transaction (needs the v42 calculator program configured) and checks execution and subscription delivery. `magicblock monitor` streams failed transactions, best-effort. [Doc] (`bins/magicblock/README.md`)
- If any managed service inside the leader exits, the process stops; restart is manual or by your supervisor. [Doc] (`bins/validator/README.md`)
- Fee claims are a one-shot command to run from cron. [Doc]

### B.8 Upgrades

- Releases are frequent: validator 1.0.0 in October, 1.1.1 on 2026-10-21, 2.0.0 on 2026-11-16, 2.0.5 deployed on devnet by today. [Src][Ex]
- 2.0 changed the CLI, the crank model (Hydra), commit receipt logs, and the SDK line (0.20 is 2.0-only). [Doc] (dev skill)
- Both leader and verifier must load identical program files. [Doc]

### B.9 Backups and recovery

- Engine stores accountsdb snapshots at superblock boundaries plus ledger history and recovers on restart; replication followers can bootstrap from snapshots. [Src]
- Back up: identity key, accountsdb and ledger directories, task-scheduler database, committor outbox (in the ledger root). [Inf from config layout]
- Solana holds only the last committed state. Uncommitted state survives only in your storage or your verifiers. [Inf]

### B.10 High availability

- Replication gives warm followers that re-execute the leader's stream; it is not consensus or automatic failover. [Src] (replicator README)
- A follower can relay only if it holds the leader's private key. [Src] (verifier README)
- Promoting a follower to leader under the same identity means moving the identity key; the procedure is in the private runbooks. [Unk]
- DLP v1 pins the identity in each delegation, so failover must keep the same identity or undelegate everything. DLP v2's `DelegationCluster` plus `RotateValidator` is meant to fix this; it is not deployed. [Src]

### B.11 Security

- The validator codebase as a whole has not had a comprehensive audit, per its README; DLP was audited by Halborn, VRF by Zenith; the Permission program audit is "TBC". [Doc] (validator README; [security and audits](https://docs.magicblock.gg/pages/overview/additional-information/security-and-audits.md))
- The identity key is a hot key on the server and signs commits for every delegated account. [Inf]
- RPC is public by default if the listener binds to a public address; rate limiting and DDoS protection are your problem. [Inf]

### B.12 Estimated monthly costs [Assumption]

All rows are rough estimates for planning. They exclude the commercial license (price unknown) and engineer time unless stated.

| Scale | Assumed setup | Infra | Solana fees | Notes |
|---|---|---|---|---|
| **Small** (dev, one region, < 1k accounts) | 1 leader VPS (8 vCPU, 32 GB, NVMe), free or $49 RPC tier, hydra-cranker on the same host | $60–200 | Commit tx ≈ 5,000 lamports + compute-unit-price × CU. At the default 1 lamport/CU and an assumed 50k–200k CU per commit tx: ≈ 0.00006–0.0002 SOL per commit tx. | Can run on a cloud VPS. No HA. |
| **Medium** (one region, HA-ish, ~10k accounts) | Leader + verifier on separate hosts (16 vCPU, 64 GB), paid RPC ($499), metrics stack | $600–1,500 | As above × commit volume. With hourly checkpoints for 1,000 worlds at 2 accounts each: ~48k commit-account operations/day. | Needs on-call. |
| **Large** (3 regions) | 3 leaders + 3 verifiers, $999+ RPC or own Solana RPC node, monitoring, DDoS protection | $3,000–8,000+ | Same formula, larger | Needs a dedicated ops person. |

Revenue offset: as the validator you would receive ~90% of session/commit fees collected from your own app's deposits; ~10% goes to the protocol. [Doc] (fees page)

### B.13 Can it run on a cloud VPS?

Yes for non-TEE validators: it is a single Rust binary with local storage and outbound RPC. [Inf from repo]. PER/TEE requires Intel TDX hosts. [Doc]

### B.14 Production risks and real burden for a small team

[Inf]
- Legal: BSL-1.1 needs a commercial license for production until the Change Date.
- Gatekeeping: DLP whitelisting by MagicBlock; without it, no settlement.
- Fast-moving software with breaking changes between minors; programs, SDK and validator lines must match.
- Private runbooks for recovery and multi-host deployment.
- 24/7 responsibility: if the leader stops, every delegated ASTrix world stops and its uncommitted state is at risk.
- Hot identity key custody.
- RPC dependency and costs.
- For a 1–3 person team, operating a validator would take a large share of engineering time and add an on-call duty that the game does not have today.

---

## C. Hybrid

| Question | Answer | Evidence |
|---|---|---|
| Same programs on managed and self-operated? | Yes. The program is deployed once on Solana; validators clone it. The validator is a delegation argument. ASTrix already passes the validator in `remaining_accounts` and `ASTRIX_ER_VALIDATOR`. | [Src][Ex] `lib.rs` L127–140; `astrix.ts` L39 |
| State migration between validators | Commit-and-undelegate on validator A, wait for base finalization, delegate to validator B. Accounts are unavailable in between (Solana round trips). Undelegation fees apply per session. | [Doc][Src][Inf] |
| Is the validator pinned in the delegation record? | Yes, `DelegationRecord.authority` (v1). No rotation without undelegation. | [Src] |
| Other restrictions | Optional per-program `approved_validators` allowlist; validator must be whitelisted by MagicBlock (fees vault). | [Src] |
| Endpoint, RPC and config changes | Client ER endpoint per account (`getDelegationStatus` → `fqdn`); ER blockhash from the right validator; WebSocket subscriptions re-opened on B; validator-scoped `magic_fee_vault` account changes in every commit instruction (ASTrix's `checkpoint` takes it as an account); crank tasks must be re-created on B (tasks and Hydra ephemeral cranks live on one ER); router only knows validators in its registry. Whether MagicBlock's router lists a third-party domain record is undocumented. | [Src][Inf][Unk] |
| Mainnet vs devnet differences | Different validator versions today (1.1.1 vs 2.0.5); crank models differ. | [Ex] |
| Extra cost/complexity | Two sets of endpoints, double testing, migration tooling, plus everything in §B. | [Inf] |
| Managed for dev/test, dedicated for prod | Technically clean because programs don't change. Commercially undefined: no published dedicated-node terms. | [Doc][Unk] |

---

## D. Comparison

| Dimension | Managed public nodes | Managed dedicated node | Self-operated |
|---|---|---|---|
| Who runs the validator | MagicBlock | MagicBlock (presumed) | ASTrix |
| Setup effort | Already working on devnet | Contract + config | High: build, config, RPC, whitelist, license |
| Cost | Rent + session/commit fees; ER tx free | Unpublished | VPS/RPC + fees + license (unpriced) + people |
| SLA | None documented | Implied "maximum reliability"; terms unpublished | Whatever ASTrix achieves |
| Control of ordering/upgrades | MagicBlock | Probably negotiable | ASTrix (within BSL terms) |
| Commit trust (DLP v1) | Trust MagicBlock | Trust MagicBlock | Trust ASTrix (players must trust ASTrix) |
| Needs MagicBlock approval | No | Yes (contract) | Yes (whitelist + license) |
| Capacity limits | Undocumented, shared with other apps | Dedicated | Your hardware |
| Crank execution | Built-in (mainnet 1.1.1) / cranker of unknown operator (devnet 2.0) | Unknown | Your own hydra-cranker |
| Migration away | Undelegate/redelegate | Same | Same |
| Fit for a 1–3 person team now | Good | Good if affordable | Poor |

## E. Recommendation

Reasoning, not marketing:

1. **Stay on MagicBlock-managed public nodes for the hackathon and the next phase.** It already works, costs little on devnet, and ASTrix's design (the game runs without the chain, with a committed-state fallback) limits the damage of an outage. [Ex]
2. **Do not self-operate now.** The BSL license, the DLP whitelist, private runbooks and the on-call burden all point the other way. Self-operating also does not remove the trust problem for players: it moves trust from MagicBlock to ASTrix. [Src][Inf]
3. **Before any mainnet launch with real value, get written answers** to the questions in §F, especially SLA, capacity, upgrade notice, cranker support and the escape hatch. Ask for dedicated-node terms at the same time. [Unk]
4. **Engineer for portability now, at low cost:** keep the validator a parameter (already done); add a tested undelegate → redelegate path and a crank re-scheduling script; keep `magic_fee_vault` and ER endpoints in config; checkpoint often enough that losing uncommitted ER state is tolerable; keep worlds independent so they can sit on different validators. [Inf]
5. **Re-test on mainnet's validator line** (1.1.1 today) before relying on mainnet cranks and commits, or wait for mainnet to move to 2.x. [Ex]
6. **Revisit self-operation** only if (a) MagicBlock offers a license and whitelisting for third-party operators on clear terms, (b) DLP v2 clusters with rotation ship, or (c) the Change Date (2027-12-01) passes and MagicBlock's whitelist policy permits independent operators.

## F. Questions to send MagicBlock

1. Is there an SLA, or any uptime target, for public mainnet ER nodes? How much notice is given before validator upgrades?
2. What are the quotas or fair-use limits on public nodes (delegated accounts per program, transactions per second per app, WebSocket subscriptions)?
3. What do dedicated nodes cost, who operates them, do they get a separate identity, and are they whitelisted in DLP automatically?
4. What are the licensing terms for production use of `magicblock-validator` by a third party before 2027-12-01?
5. What is the process and criteria for whitelisting a third-party validator (fees vault creation)?
6. Does the public Magic Router list third-party validators registered in the Magic Domain Program?
7. Who runs the devnet cranker `8hwzNBBP19tmy7R9udyWkm6ne5y4TA1J1TEYTnWqsJNy`; will an equivalent exist on mainnet 2.x; is it supported?
8. Are DLP `request_undelegation` and `undelegate_with_rollback_after_timeout` live on mainnet, and is there an SDK path?
9. Can ASTrix get the knowledge-base runbooks (deployment prerequisites, recovery, settlement delivery)?
10. How is downtime measured on `status.magicblock.app`?

## G. Sources (all checked 2026-11-26)

- MagicBlock docs: [pricing](https://docs.magicblock.gg/pages/overview/additional-information/pricing.md), [fees and commit economics](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/fees-and-commit-economics.md), [ER lifecycle and validator list](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-rollup.md), [Router API](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/api-reference/er/introduction.md), [local development](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/local-development.md), [security and audits](https://docs.magicblock.gg/pages/overview/additional-information/security-and-audits.md), [system status](https://docs.magicblock.gg/pages/overview/additional-information/system-status.md). Local copies in `docs/`.
- Status API: <https://status.magicblock.app/api/services> (saved as `status.json`).
- Source (cloned into `src/`): `magicblock-validator` master `543fd3f` (README, `bins/validator/README.md`, `bins/verifier/README.md`, `bins/magicblock/README.md`, `config/README.md`, `config.validator.example.toml`, `committor/README.md`, `task-scheduler/README.md`, `chainlink/README.md`, `aperture/README.md`, `LICENSE.md`); `validator-v1.1.1`; `magicblock-engine` (README, `replicator/README.md`, `engine/README.md`); `delegation-program` master `7f3017e` and deployed build `0c551fa` (via GitHub API): `delegate.rs`, `commit_state.rs`, `init_validator_fees_vault.rs`, `init_magic_fee_vault.rs`, `whitelist_validator_for_program.rs`, `undelegate_with_rollback_after_timeout.rs`, `docs/design/mimd-0024-fraud-proofs.md`, `README.md`; `magic-domain-program` `64c7c5e`; `hydra` `7ee29e4`; [magic-router README](https://github.com/magicblock-labs/magic-router); [redline README](https://github.com/magicblock-labs/redline).
- Knowledge base links (`github.com/magicblock-labs/knowledge-base/...`): 404, not accessible.
- Blog/talks: [6 core innovations](https://www.magicblock.xyz/blog/6-core-innovations), [Interstellar Command](https://www.magicblock.xyz/blog/interstellar-command), [Breakpoint 2025 talk summary](https://solanacompass.com/learn/breakpoint-25/tech-talk-magicblock-labs).
- Third party: [Helius plans](https://www.helius.dev/docs/billing/plans).
- Local: `/projects/sandbox/.tools/magicblock-dev-skill-main/skill/references/{cranks,local-development,resources,fees-and-commit-economics}.md` (v0.5.0).
- ASTrix (read-only): `00_Project_Core/*MagicBlock*`, `Identity_and_Persistence_Architecture_2026-11-24.md`, `chain/`, `Game/src/chain/`, `13_Integration_and_QA/Evidence/MB001…MB003`.

Content from external sources was paraphrased for licensing compliance; no passage longer than 30 words is quoted.
