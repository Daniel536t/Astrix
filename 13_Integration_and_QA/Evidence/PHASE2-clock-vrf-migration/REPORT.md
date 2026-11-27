# PHASE2: world clock + catch-up, VRF binding, account migration (local only)

**Status: Implemented / Verified-locally. Devnet upgrade NOT performed (awaits owner approval).**
Items that could not be verified locally are labelled **NOT VERIFIED**.

- Date: 2026-11-26/27 UTC.
- Repo: `Astrix`, branch `deploy/boxd`, HEAD `8eaee75` (after `c28cd1d`).
- Changes: uncommitted, nothing staged or pushed.
- Program `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy`.

## 0. Safety record

- **No devnet or mainnet transaction was sent.** There was no upgrade, deployment, scheduling, cancellation or
  spending. Devnet was used for reads only:
  - `getAccountInfo`, `getMultipleAccounts`, `getProgramAccounts`, `getSlot`, `getBlockTime`, `getVersion` and
    `getMinimumBalanceForRentExemption` on `api.devnet.solana.com` and `devnet-eu.magicblock.app`;
  - `solana program dump` of the delegation program (DLP).
- Every local process was bound to 127.0.0.1. The MagicBlock ephemeral validator defaults to `--remotes devnet`.
  It was started through a shim that refuses to run unless every remote is `127.0.0.1`
  (`tests/run-stack.sh`; shim in the scratch area).
- The devnet admin key (`/projects/sandbox/.tools/wallets/astrix-devnet.json`) was read only by the in-process
  LiteSVM tests (no RPC), to sign escape-hatch tests on the backed-up accounts. No secret key was printed or
  copied. All local-validator and local-ER runs used throwaway local keys.
- The Agave CLI printed two recovery phrases for its own temporary deploy buffers. These belonged to the first
  local-validator run, were throwaway keys on a localhost validator that has since been stopped, and were not
  saved anywhere. Later runs pass `--buffer` with a pre-made keypair, and the devnet procedure below does the same.
- Untouched: `Game/`, `.tools/backups/w4-20261126/`, `05_Noxel_Studio/Asset_Sheets/2026-11-24_animals/Animals` and
  `13_Integration_and_QA/Evidence/W1-wilderness-scenario/live-entry.png`.
- The toolchain was installed only under `/projects/sandbox/.tools`:
  - Agave 4.4.1 and platform-tools v1.57;
  - anchor-cli 1.0.2;
  - a private glibc 2.39 (the ER binary needs 2.38; the sandbox has 2.34);
  - npm packages in scratch: `@magicblock-labs/ephemeral-validator@2.0.3` and `litesvm@1.6.2`.

## 1. Backup (read-only)

Location: `/projects/sandbox/.tools/scratch/phase2/backup/` (4.6 MB). Copies of `manifest.json`, `SHA256SUMS`
and `decoded.txt` are in `backup-manifest/` here. The backup tool is `chain/client/scripts/phase2-backup.ts`.

| Item | Value |
|---|---|
| Taken | 2026-11-26 22:49:29 UTC. Base slot 526,663,424; ER slot 1,165,763,721 |
| Program binary | `program/astrix_settlement.devnet.so`: 506,417 bytes, sha256 `73647fc8…9f10` |
| Programdata | `2FaAFUUL2fJpr7ZoB24ZWZtC9ZVQ3t9Sf6F8MbeRZDMb`: 535,437 bytes (ELF capacity 535,392); last deploy slot 525,692,004 |
| Upgrade authority | `GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32` |
| Source ↔ binary | **HEAD source rebuilds byte-identically** to the deployed binary (trailing zero padding stripped) |
| Accounts | 274 saved and 204 confirmed absent. ER: 68 program accounts (settlement, registry, treasury, 32 slots, 32 passports, empty v1 orphan). Base: the same 68 delegated copies (DLP-owned), plus 68 delegation records and 68 metadata accounts. There were no commit-state, commit-record or undelegation-request PDAs |
| Format | One `.bin` (raw data) and one `.json` (`solana-test-validator --account` format, with lamports and owner) per account |
| Manifest | `manifest.json` sha256 `8865990a…c5cc`; `SHA256SUMS` lists 276 files (sha256 `fe15b444…82bc`) |
| DLP binary | `program/dlp.devnet.so`: 502,240 bytes, sha256 `54d0acd1…5212` (used for the local escape-hatch tests) |

The decoded state at backup time is in `decoded.txt`:
- 15 claimed worlds: slots 0–14 on the ER (slot 14 was claimed after MB004).
- ER demo settlement at tick 123,539.
- Registry claims counter: 16.
- 0 pending prospects.
- Treasury on the ER at 858,520 lamports, which is the rent floor (confirms the MB004 drain finding).
- Devnet rent is 5,080 lamports per byte, measured.

## 2. Account layouts

`chain/docs/ACCOUNT_LAYOUTS.md` (new) documents:
- every field, offset, size and discriminator;
- the PDA seeds;
- the DLP record layouts;
- the v2 tail;
- the journal hash-chain and VRF ticket encodings.

## 3. What was implemented (in `chain/`, uncommitted)

Files changed:
- `programs/astrix-settlement/src/lib.rs` (+651/−79, 1,600 lines);
- new `src/v2.rs` (367 lines, including 7 unit tests);
- `idl/astrix_settlement.json`;
- `client/scripts/astrix.ts` (+83);
- new `client/scripts/phase2-backup.ts`;
- new `docs/ACCOUNT_LAYOUTS.md`.

The full diff is in `program.diff`. No existing instruction changed its name, discriminator, accounts or
arguments; only the docs changed (verified against the old IDL). Error codes 6000–6020 are unchanged and
6021–6027 are appended. Binary: 620,008 bytes, sha256 `93dab6d7…2540`.

**(a) World clock.**
- `settle_core` (`v2.rs:231`) computes `due = floor((now − last_settled_ts)/2)` from the ER `Clock` sysvar and
  applies at most `MAX_SETTLE_STEPS = 300` steps per call (`v2.rs:32`).
  - It advances `last_settled_ts` by whole steps, so the remainder is kept: no lost time and no double time.
  - It is idempotent.
  - On a clock regression it changes nothing except the counters (`clock_regressions`, `max_clock_ts`).
- Header fields:
  - `world_tick` = `tick` (offset 46);
  - `last_settled_ts` = `last_tick_ts` (offset 54);
  - `epoch_start` and `state_epoch` live in the tail.
- The step is exactly the v1 tick rule (`v2.rs:193`), so there is no economy change.
- `settle` (`lib.rs:243`) is permissionless.
- `tick` (`lib.rs:235`) keeps its name, discriminator and single-account form and is now an alias for `settle`.
- Every state-changing world instruction settles first:
  - harvest, plant, build_sawmill and prospect use `settle_for_action` (`lib.rs:1006`). It also requires the
    world to be fully caught up (`CatchUpRequired`) and the genesis to be revealed (`WorldNotReady`);
  - set/revoke_session, cancel_prospect, transfer_world, checkpoint, commit_settlement, undelegate and the VRF
    callback settle best-effort (the callback caps at 32 steps);
  - release_world intentionally does not settle, because the world is deleted.
- Failure atomicity comes from the runtime: any error discards the settle.
- New crank scheduler `schedule_world_settles` (`lib.rs:252`). The CLI refuses 742xxx ids and intervals outside
  30–60 s.

**(b) VRF binding.**
- `prospect` (`lib.rs:299`, layout v2 only) opens one request (`open_request`, `lib.rs:1019`) with:
  - a unique per-world `request_id` that is never reused, even across re-claims;
  - world id = the account address;
  - `prospect_id`;
  - a `nonce` = sha256(world, request_id, slot, ts, client_seed).
- The ticket travels as `callback_args`, and `caller_seed` = sha256("astrix-vrf-v2" ‖ ticket) (`lib.rs:1031`).
- `vrf_callback` (`lib.rs:343`) requires the scoped VRF identity signer (compile-time address). Every ticket
  field must match the outstanding request; otherwise it fails with `VrfTicketMismatch` and changes nothing.
- The legacy `prospect_callback` applies only to a v1 world with a legacy pending prospect (old behaviour). On
  v2 worlds it is rejected.
- `cancel_prospect` is allowed only after `VRF_TIMEOUT_S = 130` s (after MagicBlock's 120–124 s purge window). It
  burns the request id and does not refund.
- Each accepted, cancelled or genesis result is appended to a per-world hash-chained journal (`journal_append`,
  `v2.rs:173`; 4-entry ring in the account) and emitted as `JournalEvent`.

**(c) World creation.**
- `claim_world_vrf(index, pow_nonce, config_hash)` (`lib.rs:528`) works as follows:
  - The creator commits to the configuration first: `genesis_commitment` = sha256(world, owner, slot, generator,
    rules version, config_hash, request id).
  - The world stays `AWAITING_VRF`: no play, and the clock does not run.
  - The seed is revealed by `vrf_callback`: `world_seed` = u32 LE of the randomness, `seed_origin` = ranked, and
    the clock starts.
- `retry_genesis` (owner only, after 130 s) re-requests with the same commitment and burns the old id.
- The registry cooldown is enforced, and proof of work is required as before.
- Legacy `claim_world` is unchanged for the live Game, but now marks the world `LEGACY_UNRANKED` and journals
  its seed.
- Migrated worlds keep their seeds and are marked legacy/unranked.

**(d) Escape hatch.**
- `request_undelegation(kind, index)` and `rollback_undelegation(kind, index)` (`lib.rs:883`, `:918`) CPI into
  DLP `RequestUndelegation` (26) and `UndelegateWithRollbackAfterTimeout` (27), signing for our PDA. The seeds
  are derived from the signer, so only the admin or settlement owner can drive them.
- The rollback saves the data, lets DLP empty the account, then restores it, as DLP requires.
- v2 worlds get `state_epoch += 1`, their pending VRF request is dropped, and a ROLLBACK record is journaled.

**(e) Migration.**
- Layout v2 = the unchanged 240-byte v1 prefix + a 636-byte tail with `AXv2` magic (876 bytes). See the layouts
  doc.
- v1 accounts stay readable, and `tick`/`settle` work on them unmigrated.
- `migrate_world` (`lib.rs:817`) is permissionless and idempotent. The payer funds rent, the account is resized
  in place, and the prefix is not touched.
- `epoch_start = last_tick_ts − tick·2`, so worlds continue from their current tick and lost pre-migration time
  is not credited.
- New `init_slot` and `initialize` create v2 directly.
- `delegate` accepts both sizes.
- `undelegate_worlds(include_registry)` (`lib.rs:858`) commits and undelegates world slots in small batches.
- For phase 3, the tail reserves 128 zero bytes and has `rules_version`/`layout_version` fields, so
  evidence-validated commands can be added without another realloc.

## 4. Local environment: what ran

| Environment | Ran | Used for |
|---|---|---|
| `cargo test` (native) | yes | 7 unit tests of `settle_core`/layout sizes |
| LiteSVM 1.6.2 (in-process SVM, clock and slot control) | yes | clock, VRF, migration, escape-hatch and CU suites. Loads the new binary, the **dumped devnet binary** (rollback), the **dumped devnet DLP** binary and a TEST-ONLY mock VRF at `Vrf1RNU…` that rebuilds callbacks exactly like MagicBlock's `provide_randomness` (`mock-vrf/lib.rs`) |
| `solana-test-validator` 4.4.1 with the dumped devnet program (upgradeable, local authority), the DLP and all 67 ER account copies | yes | real in-place upgrade with `program extend` and `deploy`, migration of 33 worlds, a real-time 61 s outage, rollback by re-deploying the dumped binary, and re-upgrade |
| **Full local MagicBlock stack**: mb-test-validator (base) + `ephemeral-validator` **2.0.3** + `hydra-cranker` + `vrf-oracle` | yes, except the oracle callback | rehearsal of the devnet procedure on a real ER: delegation, old 2 s `tick` crank, base upgrade picked up by the ER, new settle crank, ER-side migration attempt, batched commit+undelegate, base migration, re-delegation, v2 commit back to base |

What could not be run locally (devnet-only or **NOT VERIFIED**):
- **VRF with the real oracle.** The local `vrf-oracle` connected, and our requests were accepted by the real VRF
  program on the local ER ("Idx: 16"). No fulfilment arrived within 60 s, for prospect or genesis. Binding,
  late-response, forgery and journal behaviour is therefore verified with the mock, which mirrors the real
  callback construction. A real-oracle callback, and its CU inside the oracle's 300k budget, is **NOT VERIFIED**.
- Devnet runs ER 2.0.5 (`380360a`); locally 2.0.3 (`3f53eec`) was run. The devnet scheduler, cranker
  `8hwz…`, the committor fee charging and the drained treasury are devnet-only.
- Killing and restarting the ER process with persisted state was not tried. The "stop scheduler" test cancelled
  the cranks instead.
- `checkpoint` needs the Magic program and fee vault. It was not executed by the local tests: the settle part is
  covered and the commit part is unchanged (**NOT VERIFIED** with v2 accounts). `commit_worlds` with two v2
  accounts **was** verified on the local ER.

## 5. Test results (exact numbers)

All test sources are in `tests/`; raw output is in `results/`.

**Unit (`cargo test`): 7/7 pass** (`results/unit-tests.txt`).

**LiteSVM clock suite: 10/10 pass** (`results/clock-test-output.txt`, `clock.jsonl`).
- Catch-up: 62 s → exactly 31 steps, and the odd second is kept.
- Idempotency: 5 × `[settle, tick, settle]` at the same clock changed no byte.
- Cap: a 3 h outage (5,400 steps) drains in exactly 18 calls of ≤ 300 and ends exactly at world time. Max
  44,396 CU; no-op 6,453 CU.
- An action during a backlog fails with `CatchUpRequired` and saves nothing. After settles, the action happens at
  the present tick.
- An invalid harvest after 30 s elapsed is byte-identical before and after, also when settle and the failing
  action are in one transaction.
- A clock regression of −500 s gives no change, `clock_regressions = 1`, and the world resumes correctly
  (+5 steps after +10 s).
- **Old 2 s tick crank + 30 s settle crank + 3 duplicate runs every 10 s for 600 s** are byte-identical to the old
  crank alone, and `tick = floor((now − epoch_start)/2)`.
- **Owner test:**
  - Setup: the player farms for 10 min (6 plots, sawmill), disconnects, the scheduler stops, then a 3 h wait.
  - Restart: a 30 s crank resumes and catches up in **19 runs**; the player reconnects and acts.
  - Result: the final 240-byte state is **byte-identical** to a world whose scheduler never stopped. Final tick
    5,970 after 11,940 world seconds; population 1 → 10; 9 planks.
  - So there is no duplicate production, no repeated starvation, no repeated sawmill crafting and no lost time.
    Animals are not on-chain yet (phase 3).
- Rollback compatibility: the old devnet binary ticked a v2 world six times. The new binary then re-anchored
  (`reanchors ≥ 1`) with no double time.
- The demo settlement from the ER backup works unmigrated (v1 catch-up) and after migration.

**LiteSVM VRF suite: 10/10 pass** (`results/vrf-test-output.txt`, `vrf.jsonl`).
- The ticket carries the world, request id, prospect id and nonce, and `caller_seed` is reproducible.
- Duplicate delivery is rejected.
- **Late response:** request A, then a cancel is refused before 130 s; after 131 s the cancel succeeds, and a new
  request B is made. A's late result is rejected and B's result is applied. The cancellation is journaled.
- Forged request id, prospect id, nonce, kind, world or truncated args are all rejected, with no state change.
  World A's ticket delivered into world B is rejected.
- A spoofed signer gets `ConstraintAddress`.
- The legacy callback is rejected on v2, still works on a v1 world with a legacy pending prospect, and a new
  prospect on v1 gets `MigrationRequired`.
- Journal: claim, genesis, 2 prospects and 1 cancel; the emitted events replay to the exact on-chain
  `journal_hash`.
- VRF genesis: seed 0 and `WorldNotReady` before the reveal, and the clock stays at 0. After the callback:
  seed = u32 of the randomness, ranked, commitment unchanged, and the clock starts at the reveal.
- Genesis retry is refused before 130 s; after it, the old late result is rejected, and a stranger cannot retry.
- Fairness limits: `ClaimCooldown`, `ProofOfWork`, a legacy claim is unranked with its seed journaled, and a
  migrated slot 0 keeps seed 1,422,761,687 and is unranked.

**LiteSVM migration and escape-hatch suite: 5/5 pass** (`results/migration-test-output.txt`, `migration.jsonl`,
`escape.jsonl`).
- **All 33 world accounts** (demo settlement + 32 slots) migrate from the ER backup copy:
  - 876 bytes each, **240-byte prefix byte-identical to the backup** for all 33;
  - exactly rent-exempt;
  - tail fields correct, and idempotent on re-run.
- **32 passports, the registry and the treasury are byte-identical and lamport-identical** to the backup.
- `link_passport` works for all 32. The 33 stale base copies also migrate with the prefix intact.
- Rent added: 106,619,040 lamports at the devnet rate; max 16,472 CU.
- **Rollback:** the dumped devnet binary on migrated accounts runs tick ×3, `link_passport`, a demo-settlement
  tick and a harvest, all OK. The tail is untouched, and the re-upgraded binary continues with +5 steps.
- **Escape hatch against the dumped devnet DLP binary**, for the slot, passport, registry, treasury and
  settlement:
  - `request_undelegation` creates the DLP request and is idempotent;
  - rollback before 9,000 slots fails;
  - after a 9,001-slot warp the rollback returns the account to ASTrix with **data and lamports equal to the
    base backup**, and the DLP record and metadata are closed;
  - a stranger gets `InvalidSlot`.
  - So RequestUndelegation (26) and the timeout rollback (27) **exist in today's devnet DLP build**.
- A v2 world re-delegated through the real DLP and then rolled back has its prefix intact, `state_epoch = 1` and a
  ROLLBACK record, and can still be settled.

**solana-test-validator end-to-end: all 8 steps pass** (`results/e2e-localval.json`, final binary).
1. The 67 loaded accounts equal the backup.
2. The old binary ticks (5,097 CU).
3. In-place upgrade: extend 113,591 bytes, then deploy to the same id. Local cost 0.794 SOL at the local
   6,960 lamports/byte.
4. v1 accounts tick and settle under the new binary.
5. All 33 worlds migrate: **prefix identical 33/33**; owner, seed, prospects and rare finds preserved 33/33;
   34 other accounts identical; re-run is a no-op.
6. Real 61 s outage with nobody calling: one settle applied **39 steps**, landing exactly on
   `floor((clock − epoch_start)/2)` = 122,741. Duplicate runs right after added 0.
7. **Rollback by re-deploying the dumped devnet binary:** legacy claim, harvest, tick and link all OK on v2
   accounts, and the tail is intact.
8. Re-upgrade: settle OK, `reanchors = 1`, invariant holds, 1 s behind the clock.

**Local MagicBlock ER rehearsal** (`results/er-local.json`; ephemeral-validator 2.0.3, real hydra-cranker):

| Step | Result |
|---|---|
| A | Old binary: v1 registry, 4 slots, 4 passports and treasury created and delegated to the local ER |
| B | Old 2 s `tick` crank (task 742101) fired by the real cranker: +6 ticks in 12 s |
| C | Base upgrade (extend + deploy): **the ER loaded the new program**, and `settle` succeeded on the ER. **The old tick crank kept working** (+5 ticks in 10 s) |
| D | Old 2 s tick crank and new settle crank together: 10 ticks in 20 s, `Δlast_settled_ts = 20 = 2 × Δticks` (no double time) |
| E | **`migrate_world` on the ER fails with `Immutable`**: the payer is not a delegated account. ER-side growth has no lamport source, so migration must run on the base layer |
| F | Cranks cancelled: 0 ticks in 20 s. `undelegate_worlds` in batches of 2 (37,475 CU each), then registry (33,395 CU): **every base account byte-equal to the ER snapshot**. A single 10-account intent failed in the committor (`FailedToPrepareBufferAccounts … ProgramAccountNotFound`) and left the accounts "poisoned" for the life of that ER process, so batching is required |
| G | Base migration: 876 bytes, prefix identical 4/4. Re-delegated; the ER sees 876 bytes. One settle caught up exactly the stopped time (28 s → 14 steps) and the invariant holds |
| H/I | VRF prospect and VRF genesis requests accepted by the VRF program on the ER. **Oracle fulfilment did not arrive (NOT VERIFIED)** |
| J | `commit_worlds` of v2 accounts landed on base at 876 bytes (DLP finalize accepts the larger layout) |
| K | Legacy tick crank re-scheduled on v2 worlds next to the settle crank: 7 ticks in 14 s, invariant holds, 0 regressions |

## 6. Compute units (LiteSVM, program CU from the top-level "consumed" log)

Full data: `results/cu.json`.

| Instruction | CU |
|---|---|
| OLD binary `tick` (1 step, v1) | 4,947 |
| `settle` no-op / 1 step / `tick` alias 1 step | 6,305 / 7,516 / 7,514 |
| `settle` 15 / 30 / 300 (cap) steps | 9,333 / 11,058 / 43,867 |
| `harvest` / `plant` (with settle) | 8,028 / 7,936 |
| `prospect` (settle + VRF CPI) | 21,880 |
| `vrf_callback` prospect / genesis (ASTrix part only; oracle budget 300k) | 7,810 / 7,574 |
| `cancel_prospect` (after timeout, includes a 65-step settle) | 18,947 |
| `claim_world` legacy (tx) / `claim_world_vrf` | 22,490 / 32,813 |
| `migrate_world` | 16,276 |
| `request_undelegation` / `rollback_undelegation` (via devnet DLP) | 22,505–31,507 / 24,939–36,197 |
| `delegate_slot` (v2) | 44,869 |
| `undelegate_worlds` batch of 2 / registry (local ER, tx) | 37,475 / 33,395 |
| **16-world crank**: 15 / 30 / 300 steps each | **148,706 / 177,876 / 701,864** (limit 1.4 M) |
| 16-world crank, old 2 s tick alias (1 step each) | 120,816 (devnet observed 76,847 for the old code) |

## 7. Exact proposed devnet change (for owner approval; nothing below has been run)

**Program diff summary.** See §3 and `program.diff`.
- New binary: 620,008 bytes, sha256 `93dab6d764a4fbdf6db1198370b7c9e901727d6b1c03656e8bad915f3ed82540`, built
  from the uncommitted tree with cargo-build-sbf 4.5.0 and platform-tools v1.57. The HEAD rebuild reproduced the
  deployed binary exactly with the same tools.
- **Behaviour change on day one:**
  - `tick` becomes catch-up `settle`; there is no rule change per step;
  - `prospect` on an unmigrated world fails with `MigrationRequired` until it is migrated;
  - new error codes from 6021 (Game shows the raw message).

**Order of operations** (admin wallet `GVbu…`, from `chain/client`):
0. Commit and push the code; the owner reviews the PR. Then take a fresh read-only backup
   (`npx tsx scripts/phase2-backup.ts <dir>`) and compare it with this one.
1. **Upgrade in place.**
   - Extend: `solana program extend Gge4… 84616` (620,008 − 535,392).
   - Deploy: `solana program deploy --program-id Gge4… --buffer <new buffer keypair> --upgrade-authority <GVbu> astrix_settlement.so`.
   - Check: `solana program show Gge4…`, then `astrix.ts settle settlement`, then confirm the 742xxx tick cranks
     keep executing (`crank-observe.ts`). Locally the ER picked up the upgrade within about a minute.
2. **Do not cancel the 742xxx tick cranks yet.** They are now harmless aliases (verified A–D, K).
3. **Pilot migration on one unclaimed slot (31):**
   - `undelegate-worlds 31 1` (ER), then wait for base owner = `Gge4…`;
   - `migrate-worlds 31 1` (base);
   - `setup-worlds 32` re-delegates only program-owned slots;
   - `v2 32`, and compare against the backup.
4. Remaining slots, in batches of 2 (`undelegate-worlds 15 16 2`, then `0 15 2`), each followed by migration and
   `setup-worlds 32`. Then the demo settlement: `undelegate`, `migrate-settlement`, `delegate`.
   - Registry, passports and treasury are **not** undelegated; their layouts are unchanged.
   - Players see a short maintenance window: actions fail while their world is undelegated. No world time is
     lost, because settle catches up afterwards.
5. **Verify** with `v2 32` and `worlds 32`:
   - prefix fields equal to the pre-migration snapshot;
   - `epoch_start` invariant;
   - passports unchanged.
   Show the results to the owner.
6. **New clock cranks (new ids, 30 s):**
   - `schedule-world-settles 744101 30000 16 0` and `744117 30000 16 16`;
   - demo settlement: `ASTRIX_INCLUDE_SETTLEMENT=1 schedule-world-settles 744001 30000 0`, which schedules the
     demo settlement alone.
   - Observe for the agreed test period, then cancel 742001/742101/742117 (`cancel-task`, MB004 §5). This follows
     the owner's "keep the temporary crank until the replacement has been tested" instruction.
7. **Checkpoint cranks 743000/743008** stay stalled until the treasury is refunded. That is a separate owner
   decision and was not part of this change.

**Rollback procedure** (tested locally: steps 7–8 of the e2e, LiteSVM rollback test, escape-hatch tests):
- *Code rollback:* `solana program deploy --program-id Gge4… --buffer <kp> program/astrix_settlement.devnet.so`
  (the backup binary). The old code reads v1 and v2 accounts, and the tail stays intact. Re-upgrading later
  re-anchors cleanly.
- *Data:* the migration never rewrites the v1 prefix, so there is nothing to restore.
- *Validator unresponsive:* run `request-undelegation <kind> <index>`, wait 9,000 slots (about 1 h on devnet),
  then `rollback-undelegation`. The world returns to its last base commit with `state_epoch += 1`.
- *Point of no return:* none. The programdata extension and the 636-byte growth stay in place; both are
  harmless to the old code.

**Cost in devnet SOL** (rent 5,080 lamports/byte, measured):

| Item | Lamports | SOL |
|---|---|---|
| Programdata extend (84,616 B, permanent) | 429,849,280 | 0.430 |
| Deploy buffer (620,045 B, refunded after deploy) | ≈ 3,150,478,000 | 3.15 temporary |
| Buffer write transactions (about 615 × 5,000) | ≈ 3,100,000 | 0.003 |
| Migration rent, 33 worlds × 3,230,880 (permanent, in the accounts) | 106,619,040 | 0.107 |
| Re-delegation deposits, 33 × about 3.2 M (DLP doc; refunded only if commits ≤ 1) | ≈ 105,600,000 | ≈ 0.106 |
| Undelegation: paid from the existing deposits; about 0 extra (**NOT VERIFIED** on devnet) | ≈ 0 | 0 |
| Base transaction fees (about 70 × 5,000) | 350,000 | 0.0004 |
| ER transactions (schedule, settle, undelegate) | 0 | 0 |
| **Net** | | **≈ 0.65 SOL** (peak need ≈ 3.8 SOL; wallet had 6.69 SOL at MB004) |

A rollback redeploy needs about 2.57 SOL temporarily for the buffer (refunded) plus about 0.003 SOL in fees.

## 8. Open risks

1. **Real VRF oracle path NOT VERIFIED.** Before relying on ranked worlds, run one devnet prospect and one
   genesis after the upgrade and confirm the callback CU stays under 300k. Locally it was 7.8k for our part.
   Until then, keep the Game on legacy `claim_world` (unranked).
2. **Re-roll by abandonment.** A creator cannot pick the seed, but can release and re-claim, paying proof of work
   and the cooldown each time; every draw is public in the journal. Full prevention needs an identity cost or a
   ranked-eligibility rule. That is an owner decision.
3. **ER clock monotonicity across validator restarts or migration is unknown** (MagicBlock open question).
   Mitigations:
   - regressions are ignored and counted;
   - forward jumps are capped per call;
   - the clock source is always the ER Clock sysvar, never the client.
   A large forward jump would still advance the world quickly over several calls. Monitor `clock_regressions`
   and `max_clock_ts` against wall time.
4. **Committor batching.** Large commit intents failed locally and poisoned the accounts for the life of that ER
   process. Devnet's 2.0.5 may behave differently. Hence the single-slot pilot and batches of 2.
5. **Game compatibility.** Game is unchanged and must later:
   - map the new error codes;
   - handle `CatchUpRequired` by calling `settle`;
   - adopt `claim_world_vrf` (its seed arrives asynchronously).
   Claims during the maintenance window fail.
6. **Treasury drained.** `checkpoint` now also settles (≤ 44k CU per world), but commits still need a funded
   treasury. Durable checkpoints remain stalled until the owner funds it.
7. **The settle cost grows with backlog** up to the 300-step cap: 44k CU, 702k for 16 worlds. That is fine for
   Hydra's 1.4 M limit, but leaves no room for a cheaper default CU limit.
8. ER 2.0.5 on devnet versus 2.0.3 locally. The upgrade pickup, aliasing and commit size behaviour must be
   re-observed during the pilot (step 3).
9. The 4-entry on-chain ring means an off-chain journal that misses more than 4 records between reads must
   re-fetch transaction logs. The hash chain detects any gap.

## 9. Files

- Code (uncommitted):
  - `chain/programs/astrix-settlement/src/lib.rs`, `src/v2.rs`;
  - `chain/idl/astrix_settlement.json`;
  - `chain/client/scripts/astrix.ts`, `chain/client/scripts/phase2-backup.ts`;
  - `chain/docs/ACCOUNT_LAYOUTS.md`.
- This folder:
  - `program.diff`;
  - `results/` (raw outputs and JSON);
  - `tests/` (harness and all suites; `run-stack.sh` local-only stack);
  - `mock-vrf/` (TEST-ONLY mock);
  - `backup-manifest/`.
- Scratch (not in the repo): `/projects/sandbox/.tools/scratch/phase2/` (backup with raw accounts and binaries,
  builds, local ledgers, node modules).
