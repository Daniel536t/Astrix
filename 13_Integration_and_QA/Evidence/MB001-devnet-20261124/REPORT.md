# MB001 — ASTrix settlement on MagicBlock devnet

**Date:** 2026-11-24, 01:30–01:48 UTC · **Network:** Solana devnet plus the MagicBlock devnet Ephemeral Rollup EU
(`https://devnet-eu.magicblock.app`, validator `MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e`, core 2.0.4).
**Wallet:** throwaway devnet wallet `GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32`, funded by the owner from the faucet. Not the owner's personal wallet.

| Item | Value |
|---|---|
| Program | `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy` (upgradeable; authority = throwaway wallet) |
| Settlement PDA | `4PV6Ks9yUnfMd54vtmbYobM4RZza3ZtsM6zxczSmaxzw` (seeds `astrix-settlement` + owner) |
| World | seed 1337, terrain generator v2 |

## Verified on chain

| Step | Where | Signature / evidence |
|---|---|---|
| Found settlement (`initialize`) | Solana devnet | `uKce8AoQ7m2YQS7AmJMZnZ8HagzfawyUwKKKD8aD7snuM1QBzYmxhmKsDXuHFAVjLeTvUKWyyfxwYivyJea4v3t` |
| Delegate to the ER | Solana devnet | `4uH4VKfp6Ca1VX1kCiYidfm1FjB8B6iUkiwpT4nKyZ3A632T1ejxvrQ36i3ktkd3MqbjpxUeUCy8ZfVmWYFQDgnA` |
| Build sawmill | ER | `P1xocDodLtTrT3F9VLKUV6SzwtzAEsbiJU3AxEhub9dzFduLZZhRhLtjLzxoi49duf5asWk55bgCcpcsvvTfWqk` |
| Schedule tick crank (task 742001, every 2,000 ms, 200,000 iterations ≈ 4.6 days) | ER | `2C6RanuLnJMKsK2KLYmcxREkJCg39ZRoUpeVmWywQ7wEySB74yeEXZRaDYmJusxmsrw23jLsPkRXWxSHsZRNd3Hu` |
| **Crank ticks** | ER | e.g. `QQ4C4gkx…u53` at 01:35:28 (`tick 69`) and `2hVfo63P…phT` at 01:35:26 (`tick 68`), one about every 2 s. **Signed by `8hwzNBBP19tmy7R9udyWkm6ne5y4TA1J1TEYTnWqsJNy`, not by our wallet.** |
| Session key set (expiry 1 h, budget 5) | ER | `41vpc5T8…Hiw2` |
| Harvest signed **by the session key** | ER | `2vsbraAu…dk2G`; the on-chain budget dropped from 5 to 4 |
| VRF prospect requests | ER | `5ottAHtj…jCVp`, `5TYCu7WK…2CoGWP`, `3kXaZzRj…CcpKcR` |
| VRF results delivered by callback | ER | rolls 10 (nothing), 62 (ore vein, +6 ore) and 44 (nothing); `prospect_pending` cleared each time |
| Commit to Solana | ER → Solana | ER `3PkPVT7E…d4EBVC`; base settlement tx `NTPeP7hv2MKu6rRRFhaHo18ZuyudPAKjmN4gYWZ2aNmq2wESV4iPZdUbrxjc7KEAGqpfJzchL19VptqqXmZ8uWD` (01:47:34) |

**State after the commit.** A fresh client reading Solana directly, with no ER involved, saw:
- tick 430, food 284, seed 55, ore 12, planks 11, population 8, sawmill built, 5 prospects.

The ER had meanwhile moved on to tick 439. The crank keeps advancing the delegated account, and Solana holds the last committed snapshot.

## Without a browser

The crank was scheduled by one CLI transaction. Every later tick was executed and signed by MagicBlock
infrastructure (`8hwz…`), with no browser and no process of ours running. Between status reads the
settlement advanced by about 0.5 ticks per second (10 ticks in 20 s; 249 → 259; 393 → 407 → 421).

## Problems found and fixed (all on devnet, preserved here)

1. **Empty account delegated.** A first PDA (seed `settlement`, `BAiq…`/`3fNV…`) was delegated before it was initialised.
   - The program now refuses to delegate anything that is not an initialised settlement.
   - The seed was changed to `astrix-settlement`.
   - The orphaned account holds no value.
2. **VRF callback ran out of compute** (`ProgramFailedToComplete` after about 268k CU) on every oracle attempt. The SDK's `#[vrf_callback]` derives the scoped VRF identity at runtime with `find_program_address`. It is replaced by a compile-time constant (`scoped_vrf_identity_const`), and the callback now uses a few thousand CU.
   - A request that is never fulfilled leaves `prospect_pending` set. Added an owner-only `cancel_prospect`.
3. **Settlement collapse.** The first economy rules let the population boom and then starve the settlement. Changes:
   - The food period is now 10 ticks.
   - A settler arrives only with a 20-tick reserve for everyone.
   - Harvests return seed, so the farm can expand.

## Costs (devnet SOL, free)

| Item | Cost |
|---|---|
| Program deploys and upgrades (rent held by the program account) | about 1.9 SOL |
| Each ER transaction | 0 |
| Delegation session | 0.003 SOL at undelegation |
| Commits after the first | 0.001 SOL each, taken from the delegation deposit |

Without a delegated fee payer, a session allows **10 commits**. One has been used.

## Not yet verified

- `undelegate`, followed by re-delegation.
- The browser client reading and acting on chain state.
- Behaviour after the 200,000 crank iterations run out.
- What happens to cranks if the ER restarts.
