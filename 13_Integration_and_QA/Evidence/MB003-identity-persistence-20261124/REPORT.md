# MB003: Identity, dual entry and persistence: evidence (2026-11-24)

Design: `00_Project_Core/Identity_and_Persistence_Architecture_2026-11-24.md`.
Program `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy` (devnet). The deployed binary was byte-compared with the local build (506 432 bytes, match). Live site release `20261124T063446Z-1601853`.

## 1. Program security tests (devnet, `chain/client/scripts/identity-test.ts`)

Fresh 0-SOL keys on slot 7, which is released at the end. All 18 checks passed:

```
PASS  claim with weak proof of work is rejected ProofOfWork
PASS  a nonce solved for another key is rejected ProofOfWork
PASS  claim with valid proof of work succeeds (0 SOL key)
PASS  passport records the guest as owner, kind guest
PASS  claiming an owned world is rejected SlotTaken
PASS  transfer signed by a non-owner is rejected NotOwner
PASS  transfer signed by owner + new owner succeeds
PASS  passport now names the passkey owner, kind passkey, transfers 1, checkpoint due
PASS  world owner moved to the passkey key
PASS  old guest key can no longer act Unauthorised
PASS  old guest key cannot set a session ConstraintHasOne
PASS  new owner can act
PASS  anyone can trigger the due checkpoint (0 SOL key) { checkpoints: 1 }
PASS  a repeat checkpoint is a no-op (no treasury drain)
PASS  burst of 50 actions: at most 40 counted in the window { windowCount: 40 }
PASS  the next action in the same window is rejected with RateLimited
PASS  release by a non-owner is rejected NotOwner
PASS  owner can release their own world
```

The release test ran before `release_world` was changed to also mark a checkpoint as due. That later change only touches the passport's `checkpoint_due` flag.

## 2. Checkpoint integrity (devnet)

| Slot | Tick | sha256(base world account) | ER passport hash | Base passport hash |
|---|---|---|---|---|
| 0 | 6506 | c5989676b539…eb99fd | same | same |
| 1 | 6585 | 94a46619e0fe…bab1e9 | same | same |

The treasury balance was 200 858 520 lamports before and after (no commit fee within the free allowance). The checkpoint cranks (743000, 743008, 743016, 743024) then checkpointed every claimed world (slots 0–11, `checkpoints: 1`) without any manual call.

## 3. Browser flows (Chrome, local build served at https://astrix.local)

Passkeys used a CDP virtual authenticator (ctap2.1, resident keys, user verification, `hasPrf`). Wallets used an injected `window.phantom.solana` mock that signs with a real ed25519 devnet key. Script: `browser-flow.js` (test keys removed).

| Step | Result |
|---|---|
| Enter screen | Quick Play, Wallet Play (Connect Phantom), Recover with passkey/Phantom, Explore offline (`MB003-01`) |
| Quick Play | slot 10, seed 3053296915, badge "Local guest"; claim incl. PoW 31 s (8 s in a quieter run) |
| Guest action | `done: wood` |
| Protect with passkey | "protected: your passkey now owns this world"; same slot and seed, owner changed to the PRF-derived key `G6mk…PKwV` (`MB003-02`) |
| Session-key action | `done: stone` |
| Site data wiped (`localStorage.clear()` + reload) | Enter screen shown again (`MB003-03`) |
| Recover with passkey | same slot 10, seed and owner in 15 s; then `done: wood` |
| Move to Phantom | "your Phantom wallet now owns this world"; one wallet signature; badge "Wallet owner" (`MB003-04`) |
| Action under wallet ownership | `done: stone` (session key, no wallet prompt) |
| **Fresh browser context**, Recover with Phantom | same slot 10 and seed 3053296915; HUD terrain seed 3053296915; `done: wood` (`MB003-05`) |
| Wallet Play with a second wallet | new world, slot 11, seed 1438487729 (different from slot 10); badge "Wallet owner"; `done: wood` (`MB003-06`) |
| Page errors | none |

## 4. Live site (https://astrix.nyc.boxd.sh, fresh context)

Quick Play created slot 12 (seed 2096322546) in 20 s. The terrain loaded on that seed, the badge showed "Local guest", the Protect button was present, and `done: wood` succeeded with no page errors (`MB003-07`).

## 5. Not verified here

- A real Phantom or Backpack extension and a real platform passkey (iCloud or Google sync). Only simulators were available in the sandbox.
- Passkey recovery across two different authenticators. This was not attempted: CDP's credential export has no field for the PRF secret, so copying a credential to a second virtual authenticator would not reproduce sync. Cross-device recovery was verified with the wallet path instead.
