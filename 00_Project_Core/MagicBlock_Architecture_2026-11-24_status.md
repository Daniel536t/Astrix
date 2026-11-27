# MagicBlock MVP status — 2026-11-24 01:56 UTC

Evidence with every signature: `13_Integration_and_QA/Evidence/MB001-devnet-20261124/REPORT.md`.

| MVP item (owner list) | Status | On-chain or local |
|---|---|---|
| 1. Anchor program for world and settlement | **Done.** Deployed to devnet as `Gge4…GRdy` | On-chain |
| 2. ER delegation | **Done.** Delegated to devnet-eu | On-chain |
| 3. Crank advancing time plus an economic operation, with no browser | **Done.** About 0.5 ticks/s, signed by MagicBlock (`8hwz…`). Each tick runs crops, the sawmill, food consumption and population. | On-chain |
| 4. Scoped session keys | **Done (program-enforced).** Expiry and action budget verified. MagicBlock's gum Session Keys program is *not* used. The browser cannot sign yet; only the CLI does. | On-chain |
| 5. VRF discovery | **Done.** 3 fulfilled prospects, including one ore vein | On-chain |
| 6. Commit to Solana and restore in a fresh browser | **Commit done** (Solana holds tick 430). The live site reads the settlement in a fresh browser. Undelegate is untested. | On-chain + read |
| 7. 3D world renders the authoritative settlement | **Done, read-only.** Deployed to https://astrix.nyc.boxd.sh | Presentation |

**Local versus chain.** The player's own valley game (bag, founder projects, local stockpile, crops) is
still the local simulation, saved in the browser. The MagicBlock settlement is a separate outpost that
the browser reads. Nothing in the local game writes to the chain yet.

**Next:**
1. Browser wallet or session signing, so a player can plant, harvest and prospect from the game UI.
2. Test undelegate and re-delegate.
3. Demo video and submission (target: Nov 27 before 08:00 UTC).
