# ASTrix: Personal World Ownership, Dual Entry and Persistence

Architecture decision record, 2026-11-24. Covers identity, ownership, recovery, persistence, provisioning, action security and the multiplayer design. Sections are marked **Implemented** (deployed and tested on devnet and the live site) or **Designed** (specified here, not built yet).

Program `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy` (devnet), rollup `devnet-eu.magicblock.app`, live game https://astrix.nyc.boxd.sh. Evidence: `13_Integration_and_QA/Evidence/MB003-identity-persistence-20261124/`.

## 1. Decisions in brief

| Topic | Decision | Rejected alternative and reason |
|---|---|---|
| Entry | Two permanent entry methods into the same game: **Quick Play** and **Wallet Play** | A reduced "guest mode" engine. The owner wants one game for both. |
| Identity | Three protection levels: local guest, passkey-protected guest, wallet owner. Upgrades go through an on-chain `transfer_world` that the current owner **and** the new owner both sign. | Server-held keys or server-side signing. Both are forbidden by the mandate. |
| Passkey | WebAuthn **PRF** extension. Owner key = ed25519 seed `sha256("astrix-passkey-v1" ‖ PRF(salt))`. The credential is discoverable. | Storing an encrypted key on a server. That would need a server and is not recoverable without one. |
| Gameplay signing | Passkey and wallet owners authorise a **session key** (7 days, 100 000 actions) once, and the browser plays with it. A guest owner key signs directly. | A wallet pop-up for every action. |
| Durable record | **World Passport** account per world: owner, identity kind, transfers, checkpoint count/tick/time, sha256 of the committed world, plus 192 reserved bytes. | Adding fields to `Settlement`. That would change the layout of live accounts. |
| Persistence | Active state lives on the ER. A permissionless, rate-limited **`checkpoint`** commits the world and its passport to Solana, paid by an operator treasury PDA. | Committing only when the admin runs a script. A crashed operator would leave the base layer stale. |
| Destruction | Only the owner can call `release_world`. The admin `reset_world` was **removed**. The operator can never recycle a claimed world. | Recycling inactive worlds. Forbidden by the mandate. |
| Anti-abuse | An 18-bit **proof of work** bound to (claimant key, slot), plus per-world action rate limits. | The global claim cooldown. One spammer blocked everyone. |
| Rate limit | Each world allows at most 40 actions per 10 ticks (about 20 s). The window is counted in **simulation ticks** and enforced in the program. | Wall-clock limits. Those don't follow the world's own clock. |

## 2. Identity and ownership model (Implemented)

```
             Quick Play                         Wallet Play
                 │                                   │
   browser key K_g claims slot (PoW)      wallet K_w claims slot (PoW)
                 │                        + transfer(K_w→K_w, kind=wallet)
                 ▼                        + set_session(S)   ← one approval
         LOCAL GUEST (kind 0)                        │
   owner = K_g, stored in localStorage               ▼
                 │                            WALLET OWNER (kind 2)
   "Protect with passkey"                     owner = K_w, browser plays with S
   transfer(K_g→K_p, kind 1) + set_session(S)        ▲
   signed by K_g and K_p                             │
                 ▼                                   │
        PROTECTED GUEST (kind 1) ── "Move to wallet" ┘
   owner = K_p (derived from passkey PRF)     transfer(K_p→K_w) signed by K_p and K_w
   browser plays with session key S
```

- `Settlement.owner` is the single on-chain authority. `authorise()` accepts the owner, or the session key while it is unexpired and within budget. All checks run in the program. The UI only decides which buttons to show.
- `transfer_world` requires **both** signatures. A world therefore cannot be pushed to a key nobody controls. The transfer clears the session, and the old key immediately loses all control (verified: old key → `Unauthorised`; `set_session` by old key → `ConstraintHasOne`).
- The world seed, terrain generator, state and history stay the same across every upgrade. Only `owner` and the passport change.
- A wallet claim is sent as one transaction: `claim_world` + `transfer_world(self→self, kind=wallet)` + `set_session`. The self-transfer records the identity kind without changing the `claim_world` interface again.
- **Trust note on the passkey PRF.** The browser sends a random, unverified challenge. The passkey is used as a key-derivation device, not as a login, so security rests on the authenticator's PRF secret. Passkeys synced by the platform (iCloud Keychain, Google Password Manager) carry the PRF secret with them. Authenticators without PRF are detected and the player is pointed to a wallet instead.

## 3. Dual entry (Implemented)

- **Enter screen** (`Game/src/chain/enter.ts`): Quick Play, Wallet Play (one button per detected injected wallet: Phantom, Backpack, Solflare, `window.solana`), Recover with passkey, Recover with wallet, Explore offline. It appears on the first visit and can be forced with `?enter=1`.
- **Chain panel** shows a protection badge (Local guest / Protected guest (passkey) / Wallet owner). Guest worlds get "Protect with passkey" and "Move to ⟨wallet⟩". Passkey worlds get "Move to ⟨wallet⟩". An expired session shows "Renew this browser's session".
- The game stays complete without the chain. If the rollup is down, the local simulation, saves and rendering are unaffected. "Explore offline" skips the chain.

## 4. Recovery (Implemented)

| Situation | Path |
|---|---|
| Site data cleared, same device | Recover with passkey. The discoverable credential is picked, the key is re-derived, the world is found by an ER `getProgramAccounts` memcmp on owner (byte 8), and a new session key is authorised. Verified in the browser: same slot, seed and owner. |
| New device or browser | Recover with passkey (synced passkey) or Recover with wallet. Verified in a fresh browser context with the wallet: same slot 10, seed 3053296915. |
| Rollup unreachable | Fallback reads the passports and worlds on Solana and checks `sha256(world bytes) == passport.state_hash`. The player is told the world is safe but cannot be played until the rollup is back. |
| Guest key lost, never protected | Not recoverable unless the key file was exported. This is stated in the UI. The world is **not** recycled; it keeps running untouched. |

Notes: the rollup ignores `dataSize` filters, so lookups filter by memcmp and then check account length (240) and the known slot addresses client-side. Settlement accounts are 240 bytes; earlier docs said 283, which was wrong.

## 5. Persistence and checkpoint strategy (Implemented)

- **Live state:** the delegated `Settlement` on the ER, ticked every 2 s by MagicBlock cranks.
- **Durable state:** the base-layer copy of `Settlement` and `Passport`, written by `checkpoint`.
- **Large world data:** the terrain is deterministic from `(world_seed, generator)`. Player modifications that should be durable belong in the on-chain state (see §9 for the planned voxel-diff log).
- `checkpoint` is permissionless (no signer needs SOL) and commits world plus passport through `MagicIntentBundleBuilder` with `.magic_fee_vault(...)`. A delegated program PDA treasury `["checkpoint-treasury", admin]` signs and pays.
- **When it runs:** periodically, once `tick ≥ last_checkpoint_tick + 1800` (about 1 h of simulation). It is also forced after a transfer or release (`checkpoint_due`), but at most once per 600 s of wall time. Repeated transfers therefore cannot drain the treasury. Unclaimed slots are never checkpointed periodically.
- **Integrity:** the passport stores the sha256 of the exact world bytes committed. Verified: the hash computed by the program, the base-layer passport hash and `sha256(base world account)` were equal for slots 0 and 1 (`c5989676…`, `94a46619…`).
- **Cranks:** checkpoint cranks 743000/743008/743016/743024 each cover 8 worlds, every 60 s. Each run is a no-op unless a world is due. Within an hour of scheduling, all 12 claimed worlds had a first checkpoint.
- **Cost measured:** the treasury balance was unchanged after checkpoints (inside MagicBlock's free commit allowance per delegation session). MagicBlock's documented rate beyond that is 0.001 SOL per committed account, so 0.002 SOL per world checkpoint. See §6 for scale.

## 6. Provisioning and crank strategy

**Implemented now:** 32 slots, each with a passport, all delegated. Tick cranks 742101 (slots 0–15) and 742117 (slots 16–31). Four checkpoint cranks. `MAX_SLOTS` is 255 (u8 slot seed). Provisioning is idempotent and expandable (`setup-worlds n`, `setup-passports n`); slots can be added at any time without touching claimed worlds.

**Measured rent per world** (recoverable, paid by the operator): world 0.00187 + passport 0.00234 + four delegation records and metadata accounts 0.00635 = **0.0106 SOL**.

| Worlds | Rent locked | Tick cranks (16/crank) | Checkpoint cranks (8/crank) | Checkpoint fees if hourly, after the free quota | Same at one per 24 h |
|---|---|---|---|---|---|
| 100 | 1.06 SOL | 7 | 13 | 4.8 SOL/day | 0.2 SOL/day |
| 1 000 | 10.6 SOL | 63 | 125 | 48 SOL/day | 2 SOL/day |
| 10 000 | 106 SOL | 625 | 1 250 | 480 SOL/day | 20 SOL/day |

**Designed (next):**
1. **Reserve replenishment.** Keep N free slots ready (for example 16). A small operator job watches the number of free slots and provisions more in batches. That job holds the admin key on the operator's own machine, the same trust level as today's CLI, and never touches player keys. *Escalation point:* running this unattended on a server means keeping the admin key on that server. This needs the owner's approval.
2. **Checkpoint interval at scale.** Hourly checkpoints cost too much past about 100 worlds. Recommended: make `CHECKPOINT_MIN_TICKS` a registry parameter, default 43 200 ticks (24 h), and keep forced checkpoints after ownership changes. This is a one-field change, deferred until the owner chooses the budget.
3. **Beyond 255 slots.** Use a v2 slot seed `["world-slot", admin, u16_le]` with a second registry. Existing u8 slots stay valid forever, so no migration of claimed worlds is needed.
4. **Idle worlds.** The tick is clock-gated and costs nothing on the ER. Abandoned worlds keep running and are never recycled. An owner can call `release_world`.

## 7. Migration from the 16-slot pool (Implemented)

1. Upgrade the program. The `Settlement` layout is unchanged, and old `actions` counters are read as "window 0", which simply resets on the next window.
2. `setup-passports 16`: create and delegate a passport per slot.
3. `link-passports 16`: permissionless. It copies the current owner of every world claimed before passports existed into its passport (7 worlds linked: slots 0–6).
4. `setup-treasury 0.2`, schedule the checkpoint cranks.
5. Expand to 32 slots with passports and cranks.
6. Deploy the client together with the program, because `claim_world` now takes `(index, nonce)` and a passport account.
No claimed world was reset, moved or re-seeded. Old guest records in `localStorage` (v1, no `kind`) load as Local guest.

## 8. Action security (Implemented)

| Threat | Control (in the program) | Test |
|---|---|---|
| Acting on someone else's world | `authorise`: owner or live session key only | `Unauthorised` (CLI and browser tests, MB002) |
| Taking over an owned world | `claim_world` requires an empty slot | `SlotTaken` |
| Claim spam | PoW bound to key and slot; one solution cannot be reused by another key | weak nonce and stolen nonce → `ProofOfWork` |
| Action flooding | 40 actions per 10-tick window per world | burst of 50 → window count exactly 40, next action → `RateLimited` |
| Hijack by transfer | owner **and** new owner must sign | non-owner transfer → `NotOwner` |
| Old key after upgrade | session cleared, owner replaced | old key → `Unauthorised` and `ConstraintHasOne` |
| Operator recycling worlds | `reset_world` removed; `release_world` is owner-only | non-owner release → `NotOwner` |
| Treasury drain via checkpoints | per-world tick interval and 600 s forced gap | repeated checkpoint → no-op |
| Forged passport | passport PDA = `["passport", world]`, seeds checked on every use; `init_passport` requires the admin's own slot address | n/a (Anchor seeds) |

Remaining risks, stated plainly:
- PoW raises the cost of spam but does not stop a determined attacker from claiming all free slots (about 1–20 s of CPU each). Reserve replenishment and a per-registry claim budget are the next controls.
- The session key lives in `localStorage`. An XSS on the game origin could use it until it expires; it cannot transfer or release the world. The site serves no third-party scripts.
- The admin key controls provisioning and cranks, not claimed worlds.

## 9. Multiplayer permissions (Designed, uses the passport's reserved bytes)

- The passport's `reserved: [u8; 192]` holds up to 4 members as `(pubkey 32 + permission bits 8) × 4 = 160 bytes`, plus a 32-byte agent-policy area. A `members` account per world can be added for more members without migrating the passport.
- Permission bits: harvest, plant, build, prospect, invite, manage-session. Ownership is never a permission: only `transfer_world` changes the owner.
- `invite_member(member, bits)` and `remove_member` are owner-only. `authorise(signer, required_bit)` checks owner, then the session key, then the member list, and every action stays attributed to its signer in the transaction.
- **AI agent:** a member key with a restricted bit set and its own action budget in the agent-policy area. It is revocable by the owner at any time.

## 10. Implemented vs designed

Implemented and verified: Passport, `transfer_world`, `checkpoint` with treasury, checkpoint cranks, PoW claim, per-world rate limits, owner-only release, migration of 16 slots, expansion to 32, Enter screen, Quick Play, Wallet Play (injected providers), passkey protection, passkey and wallet recovery, base-layer checkpoint fallback, session renewal, live deployment.

Verified with simulators only: passkeys (Chrome virtual authenticator with PRF) and wallets (mock injected provider that signs with a real ed25519 key). A real Phantom or Backpack extension and a real platform passkey have not been tested in this sandbox. These are the first things to try by hand.

Designed only: reserve replenishment job, configurable checkpoint interval, u16 slot scheme, multiplayer members and agent policy, voxel-diff persistence.
