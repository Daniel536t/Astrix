# ASTrix settlement program: account layouts

Program `Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy` (upgradeable loader; programdata
`2FaAFUUL2fJpr7ZoB24ZWZtC9ZVQ3t9Sf6F8MbeRZDMb`; upgrade authority `GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32`
at the PHASE2 backup, 2026-11-26 22:49 UTC). Admin (registry, slots, treasury, demo settlement owner):
`GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32`.

All program accounts are Anchor accounts: 8-byte discriminator = `sha256("account:<Name>")[0..8]`, then Borsh
fields packed with no padding (little endian). Offsets below are absolute byte offsets in the account data.
Source: `chain/programs/astrix-settlement/src/lib.rs` (v1 structs) and `src/v2.rs` (v2 tail).
Raw copies of every account: `/projects/sandbox/.tools/scratch/phase2/backup/` (manifest + SHA256SUMS).

## Inventory at the PHASE2 backup

| Account | PDA seeds (program `Gge4…`) | Address | Size | Base owner | ER owner |
|---|---|---|---|---|---|
| Demo settlement | `["astrix-settlement", admin]` | `4PV6Ks9yUnfMd54vtmbYobM4RZza3ZtsM6zxczSmaxzw` | 240 | DLP (delegated) | ASTrix |
| Registry | `["astrix-registry", admin]` | `8J8shpq3C8eMSMvMV2HJXVsgyDNKcRQBX3jLGqwiFCCx` | 62 | DLP | ASTrix |
| World slot *i* (0–31) | `["world-slot", admin, [i]]` | e.g. slot 0 `6gD7kpgB2DB57RyKhTLTpJkniHAM123jkGdYbF9VmVDp` | 240 | DLP | ASTrix |
| Passport of slot *i* | `["passport", slot_i]` | e.g. slot 0 `9WfY4MsG7JcMwjbVHtXNX59j21jLkXcHtiha6JtzaRtp` | 332 | DLP | ASTrix |
| Checkpoint treasury | `["checkpoint-treasury", admin]` | `FNdEiiZn8qzx3ZaAQ7WW7QCFyPTRGm3o5DNPJEkexQks` | 41 | DLP | ASTrix |
| Orphan v1 settlement (unused, empty) | `["settlement", admin]` | see manifest | 0 | DLP | ASTrix (0 lamports) |
| Program identity (VRF requester, signs only) | `["identity"]` | derived | – | – | – |

68 program accounts on the ER (`getProgramAccounts`), 0 non-delegated program accounts on base.
Every delegated account has a DLP delegation record and metadata on base (below). No commit-state,
commit-record or undelegation-request PDAs existed.

## Settlement / world slot, layout v1 (240 bytes) — unchanged prefix of v2

Discriminator `370bdb21248828b6`. The Game client reads `world_seed` at offset 40 and the owner at 8.

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 8 | discriminator | | |
| 8 | 32 | owner | Pubkey | `11111…` = unclaimed slot |
| 40 | 4 | world_seed | u32 | terrain seed |
| 44 | 1 | generator | u8 | 1 or 2 |
| 45 | 1 | bump | u8 | |
| 46 | 8 | tick | u64 | **v2: `world_tick`** (settled simulation steps) |
| 54 | 8 | last_tick_ts | i64 | **v2: `last_settled_ts`** (ER clock of the last settled step boundary) |
| 62 | 8 | tick_interval_s | i64 | always 2 |
| 70 | 32 | stock | [u32; 8] | wood, stone, fiber, food, ore, seed, planks, crystal |
| 102 | 72 | plots | [u64; 9] | planted tick, `u64::MAX` = empty |
| 174 | 2 | population | u16 | |
| 176 | 1 | sawmill | bool | |
| 177 | 1 | prospect_pending | bool | |
| 178 | 4 | prospects | u32 | v2: the prospect id of the latest request |
| 182 | 1 | last_find | u8 | 0 nothing, 1 ore, 2 crystal |
| 183 | 1 | last_roll | u8 | 1..100 |
| 184 | 4 | rare_finds | u32 | |
| 188 | 32 | session_key | Pubkey | |
| 220 | 8 | session_expires | i64 | |
| 228 | 4 | session_budget | u32 | |
| 232 | 8 | actions | u64 | rate window (window << 32 \| count) |

## Settlement / world slot, layout v2 (876 bytes) = v1 prefix + `WorldExt` tail (636 bytes)

A v2 account is recognised by length ≥ 876 **and** magic `AXv2` at offset 240. Anything else is v1.
The v1 prefix keeps its offsets, so the previous program binary, the Game client and the checkpoint hash
keep working (tested: old binary ticks, harvests, links passports on v2 accounts and leaves the tail intact).

| Offset | Size | Field | Type | Meaning |
|---|---|---|---|---|
| 240 | 4 | magic | [u8;4] | `AXv2` |
| 244 | 1 | layout_version | u8 | 2 |
| 245 | 1 | rules_version | u8 | 2 (step rules unchanged from v1; only time accounting changed) |
| 246 | 1 | seed_origin | u8 | 0 legacy/unranked, 1 VRF genesis (ranked), 2 awaiting VRF genesis |
| 247 | 1 | flags | u8 | reserved |
| 248 | 4 | state_epoch | u32 | +1 on each escape-hatch rollback |
| 252 | 8 | epoch_start | i64 | `last_settled_ts − world_tick × interval` (re-derived and counted if anything else moved it) |
| 260 | 8 | max_clock_ts | i64 | highest ER clock any settle saw |
| 268 | 4 | clock_regressions | u32 | settle calls that saw an earlier clock |
| 272 | 4 | reanchors | u32 | times epoch_start had to be re-derived (e.g. after a rolled-back binary ticked) |
| 276 | 8 | last_settle_slot | u64 | |
| 284 | 8 | settled_steps_total | u64 | steps applied since migration |
| 292 | 8 | migrated_ts | i64 | 0 for accounts created as v2 |
| 300 | 8 | migrated_from_tick | u64 | |
| 308 | 8 | next_request_id | u64 | per-world VRF request counter, never reused |
| 316 | 40 | pending | VrfPending | request_id u64 @316, nonce u64 @324, prospect_id u32 @332, kind u8 @336 (0 none, 1 prospect, 2 genesis), pad[3], requested_ts i64 @340, requested_slot u64 @348 |
| 356 | 8 | journal_seq | u64 | records appended |
| 364 | 32 | journal_hash | [u8;32] | hash-chain head (see below) |
| 396 | 288 | recent | [VrfRecord; 4] | ring, index `seq % 4` |
| 684 | 32 | genesis_commitment | [u8;32] | creator's committed configuration |
| 716 | 32 | genesis_randomness | [u8;32] | VRF output that set the seed |
| 748 | 128 | reserved | [u8;128] | zero; for phase 3 (evidence-validated commands) |

`VrfRecord` (72 bytes): seq u64, request_id u64, prospect_id u32, kind u8 (1 prospect result, 2 VRF genesis,
3 legacy genesis, 4 VRF cancelled, 5 rollback, 6 migrated, 7 released), outcome u8 (roll), find u8,
state_epoch_lo u8, world_tick u64, ts i64, randomness [u8;32] (legacy genesis / migration: seed LE in bytes 0..4).

**Journal hash chain.** Genesis `sha256("astrix-journal-v1" ‖ world)`; each record:
`journal_hash = sha256(prev ‖ world ‖ borsh(VrfRecord))`. Every record is also emitted as Anchor event
`JournalEvent` (discriminator `6d5d1aad019e5369`) in the transaction logs; replaying the events must reproduce
`journal_hash` (tested).

**VRF ticket** (`callback_args`, 53 bytes, Borsh): world Pubkey, request_id u64, prospect_id u32, nonce u64,
kind u8. `caller_seed = sha256("astrix-vrf-v2" ‖ ticket)`. Callback = `vrf_callback(randomness, ticket)`.

Rent at 876 bytes on devnet: 5,100,320 lamports (240 bytes: 1,869,440; devnet charges 5,080 lamports per
byte incl. the 128-byte header, verified with `getMinimumBalanceForRentExemption`). Migration adds
3,230,880 lamports per world.

## Registry (62 bytes, unchanged)

Discriminator `2fae6ef6b8b6fcda`: admin Pubkey @8, slots u8 @40 (16; 32 slots exist), bump u8 @41,
claims u32 @42, last_claim_ts i64 @46, claim_cooldown_s i64 @54 (10). `claim_world_vrf` enforces the cooldown.

## Passport (332 bytes, unchanged)

Discriminator `123df5ef060f1222`: version u8 @8 (1), bump u8 @9, identity_kind u8 @10, checkpoint_due bool @11,
world Pubkey @12, owner Pubkey @44, created_ts i64 @76, transfers u32 @84, checkpoints u32 @88,
last_checkpoint_tick u64 @92, last_checkpoint_ts i64 @100, state_hash [32] @108 (sha256 of the whole world
account at the last checkpoint; v2 hashes all 876 bytes), reserved [192] @140 (all zero in the backup).

## Treasury (41 bytes, unchanged)

Discriminator `eeef7bee5901a8fd`: admin Pubkey @8, bump u8 @40. ER balance at backup: 858,520 lamports =
exactly the rent minimum for 41 bytes (drained; base copy shows 200,858,520 from delegation time).

## MagicBlock delegation program (DLP `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`) records on base

| PDA | Seeds (DLP) | Layout |
|---|---|---|
| Delegation record | `["delegation", account]` | 96 bytes: disc `64…` (u64 100) @0, authority (ER validator, `MEUGG…`) @8, owner (`Gge4…`) @40, delegation_slot u64 @72, lamports u64 @80, commit_frequency_ms u64 @88 |
| Delegation metadata | `["delegation-metadata", account]` | 101–112 bytes: disc `66…` (u64 102), last_commit_id u64, undelegation_requester u8, seeds Vec<Vec<u8>>, rent_payer Pubkey (= admin `GVbu…`) |
| Undelegation request | `["undelegation-request", account]` | delegated_account Pubkey, expires_at_slot u64 (+9,000 slots) — none existed |
| Commit state / record | `["state-diff", account]` / `["commit-state-record", account]` | only during a pending commit — none existed |
| Delegate buffer | `["buffer", account]` under **the owner program** | transient during `delegate_*` |

Escape hatch (DLP legacy discriminators, u64 LE): RequestUndelegation = 26, UndelegateWithRollbackAfterTimeout = 27.
Wrapped by `request_undelegation(kind, index)` / `rollback_undelegation(kind, index)`; kind 0 settlement,
1 registry, 2 slot, 3 passport, 4 treasury; seeds are derived from the signer.

## Instruction discriminators that live cranks depend on

`tick` = `5c4f2c0865503f0f` (single writable account; kept, now an alias for `settle`),
`checkpoint` (6 accounts; unchanged). New: `settle` `af2ab957908366d4`, `vrf_callback` `f8e037e3380a6c24`,
`claim_world_vrf` `d73bd73cd7ce0c2b`, `migrate_world` `0fc154b6ae7cffa9`, `undelegate_worlds` `8dfabc82bf7db954`,
`request_undelegation` `705f4cba43213bc7`, `rollback_undelegation` `1ac4c7d53c43919a`,
`schedule_world_settles` `a5354d39bfe89077`, `retry_genesis` `e01a20a4cf22bbbb`.
Error codes 6000–6020 keep their v1 meaning (the Game maps `0x1770 + index`); 6021–6027 are new.
