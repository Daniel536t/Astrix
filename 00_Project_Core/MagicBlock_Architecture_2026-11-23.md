# ASTrix × MagicBlock — architecture

**Date:** 2026-11-23 · **Context:** Solana Blitz v10, MagicBlock hackathon, theme *Entertainment Finance*.
**Status:** design. Nothing in this document is implemented yet.

Sources: [Blitz v10](https://luma.com/hedv5sgh), [MagicBlock docs](https://docs.magicblock.gg/llms.txt),
[games use case](https://docs.magicblock.gg/pages/get-started/use-cases/games.md),
[fees and commits](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/fees-and-commit-economics.md),
[runtime limits](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/runtime-limits.md),
[cranks](https://docs.magicblock.gg/pages/tools/crank/introduction.md),
[VRF](https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/solana-vrf.md),
[BOLT ECS](https://github.com/magicblock-labs/bolt). Numbers below were checked on 2026-11-23. The docs themselves note that fees change.

## 1. The judging question: can ASTrix stand without MagicBlock?

**Today: yes.** That is the problem. ASTrix currently runs entirely in one browser:
- The world stops ticking when the tab closes.
- Nobody else can see it.
- Its resources are numbers in localStorage.

**Target: no.** In the target design the defining feature is a persistent world that keeps living when you
close the tab, that nobody owns except its players, and whose economy runs in real time at zero fees.
Three properties make MagicBlock structural rather than decorative:

| Property | Why only MagicBlock gives it to us |
|---|---|
| **The world runs without you** | A crank on the Ephemeral Rollup issues the settlement `tick` (today a browser timer). Crops grow, jobs finish and villagers work while every player is offline, with no server we operate. Plain Solana is too slow and costs a fee per tick; a normal server is trusted and centralized. |
| **Every action is an onchain transaction, free and instant** | Harvest, haul, build, plant and trade are ER transactions: gasless, ~10 ms slots, signed by a session key so there is no wallet pop-up per action. This is the only way a real-time builder can have every economic action onchain. |
| **Fair discovery that is worth money** | VRF decides what prospecting finds (ore veins, rare timber), hunt/fishing outcomes and expedition loot. Proven randomness makes found resources credible assets. That is the *finance* in Entertainment Finance. |

Without MagicBlock you would need a trusted game server for the always-on world, and a fee for every action. Removing it removes the game.

## 2. What goes where

| Tier | State | Why |
|---|---|---|
| **Solana base layer** | World identity and seed, generator version, land plots and owners, settled resource balances (SPL mints), achievements (SOAR) | Durable ownership; tradable outside the game |
| **Delegated to the Ephemeral Rollup** | Per-settlement state: stockpile, buildings, construction progress, crops, production jobs, villagers (position, job, carried item), resource node depletion, reservations. Chunk edit deltas for edited chunks. | High-frequency, gasless mutations; committed back periodically |
| **Ephemeral-only accounts** | Short-lived coordination: active job claims, transient agent plans | Never needs Solana; refundable storage |
| **Private ER (TEE)**, stretch goal | Sealed prospecting claims, hidden bids for land plots | Privacy as a game mechanic |
| **Client only** | Voxel terrain generation (deterministic from the onchain seed), meshes, water, animation, camera, ambient wildlife, UI | Never needs consensus. The world is reconstructed from seed + onchain edits + onchain entity state |

## 3. Constraints that shape the account design

- **Size:** an account committed back to Solana is at most **10,240 bytes**. So: one settlement account, separate villager accounts (or one per group of a few villagers), and one edit-delta account per edited chunk. Never one big "world" account.
- **Commit cost:** ER transactions cost 0. A delegation session costs 0.003 SOL. Each commit after the first costs 0.001 SOL. Without a fee payer there are 10 commits per session; with a delegated fee payer it is unlimited, with a live fee from commit 26. So we commit on milestones (building completed, trade settled, session end), **not on every tick**.
- **Limits:** 64 KB transactions and 1.4 M CU per transaction on the ER, so a whole tick (jobs + crops + villagers) fits in one instruction if state is compact.
- **Slot time:** the docs say not to depend on slot timing. The tick counter is advanced explicitly by the crank, not inferred from slots.

## 4. Mapping the existing engine (why the current architecture is an asset)

| ASTrix today | MagicBlock equivalent |
|---|---|
| `GameSession.dispatch(command)`, validated commands | Program instructions on the delegated settlement |
| Accepted-command journal and replay | The ER transaction history, committed to Solana |
| `SimClock` (tick every 2 s in the browser) | **Crank** scheduled on the ER |
| Deterministic seeded generation | The world seed is stored onchain; clients regenerate identical terrain |
| Chunk edit overlay | Per-chunk edit-delta accounts |
| `TabLease` (one writer) | Delegation: exactly one ER owns the writable state |
| `Math.random` is banned in sim; mulberry32 | VRF for every outcome that must be fair and valuable |
| Local-stub authorizer | Program-enforced rules plus a session-key scope |

The TypeScript simulation remains as client-side prediction and as the test oracle. The Rust program
becomes the authority for the onchain tier. Both must produce identical results for the same inputs,
and that equivalence becomes a test.

## 5. Entertainment Finance loop

1. **Claim** a valley plot (base layer, owned).
2. **Gather and build** (ER, gasless, session key). Villagers work via the crank while you are away.
3. **Prospect** (VRF): spend effort and get a provably random strike. Rare finds are scarce.
4. **Produce** goods (planks, tools, rations) through recipes in the program.
5. **Settle and trade**: produced goods are committed into SPL balances that can be traded with other players, using Ephemeral SPL tokens on the ER for instant trades.
6. **Compete**: SOAR leaderboard for settlement value and population.

## 6. Hackathon MVP (Blitz deadline, about 4 days)

Must work end to end on **devnet** (zero external cost; faucet SOL):

1. Anchor program `astrix_world`: `create_world(seed)`, `found_settlement`, `harvest`, `deposit`, `build`, `plant`, `tick`.
2. Delegate the settlement to the ER, and schedule a **crank** for `tick` every 2 s.
3. **Session keys** so the browser signs gameplay without wallet pop-ups.
4. **VRF** prospecting: request, callback, ore strike recorded in settlement state.
5. **Commit and undelegate** on demand; reload the world from chain in a fresh browser.
6. The existing Three.js client renders onchain state (subscriptions to the ER account).

Stretch: Ephemeral SPL resource token and trade; SOAR; Private ER prospecting claims.

**Not in the MVP:** putting voxel meshes, animation or ambient animals onchain. They gain nothing from consensus.

## 7. Risks

- New toolchain (Rust, Anchor, Solana CLI, MagicBlock SDK) in 4 days.
- Crank timing and cost are unverified: check on devnet before relying on 2 s.
- Duplicating rules in Rust and TypeScript risks drift. An equivalence test is required.
- Devnet availability on judging day: record a video fallback.
