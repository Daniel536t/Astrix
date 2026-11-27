# MB002 — independent player-owned worlds on MagicBlock devnet

**Date:** 2026-11-24, about 02:10–02:40 UTC · program `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy` · ER devnet-eu.

## Setup (admin, once)

- Created a registry `8J8shpq3C8eMSMvMV2HJXVsgyDNKcRQBX3jLGqwiFCCx` with a 10 s claim cooldown.
- Created 16 empty world slots, rent paid by the admin, all delegated to the ER.
- Scheduled one crank (task 742101, every 2 s), tx `vbVdY4stZ…EepY`. Each crank run is 16 *separate* `tick` instructions, one per world account. No state is shared between worlds.

## Two-guest test (`two-guest-cli-test.json`)

Alice and Bob used fresh keypairs with **0 lamports each**, before and after the test.

| Check | Result |
|---|---|
| Alice claims slot 0 | ok, seed 1422761687 |
| Bob claims within 10 s | rejected `0x1781` (ClaimCooldown) |
| Bob claims slot 1 after the cooldown | ok, seed 1145747086 |
| Mallory claims Alice's slot | rejected `0x1780` (SlotTaken) |
| Bob plants in Alice's world | rejected `0x1772` (Unauthorised) |
| Bob calls admin `reset_world` on Alice's world | rejected `0x7d6` (ConstraintSeeds: not the admin) |
| Independent progression after 20 s | Alice (farmer): food 0 → 35, no planks. Bob (builder): wood → planks 9, no food. |

A third zero-SOL guest also completed a VRF prospect in its own world: roll 12, nothing found, callback delivered.

## Browser test (production build, two isolated browser contexts)

Each "judge" opened the page and clicked **Create my own world**. There was no wallet, no pop-up and no SOL.

| Judge | Slot | Terrain seed | Account | Actions | Resulting state |
|---|---|---|---|---|---|
| A | 4 | 1330726770 | `FaBjDggWUZmrJipmfT37zn8M9CdrfRbfm3xBXnZmDyqw` | plant ×3 | 3 plots, food 35 |
| B | 5 | 2780676125 | `5d3VffrW1QXLMKTYEjQtaJNvphU2Gt1CL347XmV4HvWd` | sawmill, gather wood | sawmill, planks 9 |

Both pages loaded their own voxel terrain from their seed, with 0 page errors (screenshots `world-judgeA.png`, `world-judgeB.png`).
