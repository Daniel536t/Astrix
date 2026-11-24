> **Superseded in part (2026-11-24):** the global claim cooldown and the admin `reset_world` were replaced by proof-of-work claims, per-world rate limits and owner-only `release_world`. See `Identity_and_Persistence_Architecture_2026-11-24.md`.

# ASTrix — player-owned worlds on MagicBlock

**Owner decision, 2026-11-24:** every player has their own independent world. Shared ownership and shared economic state are not the default. ASTrix never holds player private keys.

## Accounts

| Account | Seeds | Who writes | Where |
|---|---|---|---|
| Registry | `astrix-registry`, admin | claims (cooldown, counter) | delegated to ER |
| World slot ×N | `world-slot`, admin, index | **only its owner** for gameplay; admin for reset/commit | delegated to ER |
| Demo settlement (MB001) | `astrix-settlement`, owner | owner | delegated to ER |

Each world slot is a `Settlement` account (283 bytes, well under the 10,240-byte commit limit). It holds:
- the owner key;
- a world seed derived from the owner's key, which every client uses to regenerate the voxel terrain;
- the stockpile, crops, sawmill, population, prospects and clock.

## Guest onboarding (implemented)

1. The browser generates an ed25519 keypair. The secret stays in `localStorage` and is never sent anywhere.
2. The browser signs `claim_world(index)` on the ER for an empty, pre-funded slot. The guest becomes its owner.
3. Gameplay (plant, harvest, build_sawmill, prospect) is signed by the guest key and sent to the ER.

**Fees, verified.** The guest key is the fee payer and holds **0 lamports**, and ER transactions are free. Before and after a full session its balance was 0. Rent for slots, the delegation deposits and program upgrades are paid once by the admin.

**Authorisation is in the program, not the UI:**
- Gameplay requires `signer == world.owner`.
- Claims require an empty slot plus a global cooldown.
- Admin instructions (`reset_world`, `schedule_world_ticks`, `commit_worlds`) require the registry admin.
- The owner key and the crank authority never reach the browser.

**Recovery limits, shown in the UI.** A guest world lives as long as that browser's storage. "Export key" downloads the guest's own key (ASTrix never receives it). A guest world is a *temporary* world, not permanent ownership. Abandoned slots are reset by the admin.

## Time

One crank runs 16 independent `tick` instructions, one per world (the Hydra limit is 16 instructions and 32 accounts per crank). `tick` is permissionless but rate-limited by each world's own clock and skips unclaimed slots, so duplicate or early calls change nothing. Scaling means one crank per 16 worlds, all scheduled by the admin.

## Costs (devnet, measured)

- **Per slot:** about 0.0028 SOL rent plus about 0.003 SOL delegation deposit, so about 0.006 SOL. 16 slots cost about 0.1 SOL.
- **Gameplay:** 0.
- **Commits:** 0.001 SOL each after the first, per delegation session. Without a fee payer, a session allows 10 commits.

## Known limits and next steps

- **Open pool.** Anyone can make new keys and claim slots. The 10 s global cooldown slows this down, and the admin can reset worlds. When the pool is exhausted, new visitors are turned away. *Next:* recycle slots automatically after inactivity, which needs a last-activity field (a v2 account layout).
- **No per-world rate limit.** There is no per-world action cooldown yet, so a guest can spam free harvests *in their own world*. That only affects their own economy. Needs the v2 layout.
- **Persistence.** Guest world state is on the ER and committed to Solana only when the admin runs `commit_worlds`, because commits cost the admin. Slots must not be undelegated while the crank is active.
- **Long term (investigated, not built):**
  - *Embedded wallets with passkeys* (for example Privy, Para, Turnkey, Web3Auth): the player's key is held in their own device's secure enclave or by an MPC/TEE provider, not by ASTrix. This gives real recovery.
  - *Phantom/Backpack connect* for existing Solana users.
  - In both cases the player funds or sponsors their own world PDA (`astrix-settlement` + their key), as the MB001 demo settlement already does.
- **Multiplayer later.** Visiting is read-only (every world account is public). Trading and cooperation would go through explicit permission accounts: owner-signed grants scoped to an action and a counterparty. No other writes to another player's world will exist.
- **Local game on other seeds.** The local founder projects (house, path, farm) are pinned to seed 1337 and show "blocked" on player seeds. Free building placement (post-hackathon) replaces them.
