//! ASTrix settlement program: the persistent, verifiable economic state of one
//! player settlement, executed on a MagicBlock Ephemeral Rollup.
//!
//! What lives here (authoritative on-chain):
//!   - the world identity a settlement belongs to (seed + terrain generator);
//!   - the settlement stockpile, crop plots, sawmill, population and clock;
//!   - prospecting discoveries decided by MagicBlock VRF;
//!   - a scoped session key (expiry + action budget) for gasless play.
//! What does not (stays in the TypeScript client): voxel terrain, rendering,
//! animation, wildlife, camera. Clients regenerate terrain from `world_seed`.
//!
//! Time (layout v2, see `v2.rs`): world time is derived from the Ephemeral
//! Rollup's Clock sysvar, never from a client. `settle` catches a world up to
//! the clock in bounded steps (at most `MAX_SETTLE_STEPS` per call), keeps the
//! fractional remainder, ignores clock regressions and is idempotent. Every
//! state-changing instruction settles first; player actions additionally require
//! the world to be fully caught up. `tick` keeps its name and single-account form
//! and is an alias for `settle`, so the existing cranks stay compatible. Cranks
//! only provide liveness: a missed, late or duplicated crank run changes when the
//! world is settled, not the result.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

pub mod v2;
use v2::{rec, seed_origin, vrf_kind, Settled, VrfPending, VrfRecord, VrfTicket, WorldExt, MAX_SETTLE_STEPS, V1_LEN, V2_LEN, VRF_TIMEOUT_S};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, vrf};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
#[allow(deprecated)]
use ephemeral_rollups_sdk::crank::{ScheduleCrankCpi, ScheduleTaskArgs};
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;
use ephemeral_rollups_sdk::vrf::{
    self as mbvrf,
    consts::program_identity_pubkey,
    instructions::{create_request_randomness_ix_const, RequestRandomnessParams},
    types::SerializableAccountMeta,
};

declare_id!("Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy");

/// v2: the first devnet "settlement" PDA was delegated before initialisation (see docs).
pub const SETTLEMENT_SEED: &[u8] = b"astrix-settlement";
/// Player-owned world slots: pre-funded by the registry admin, claimed by guests on the ER.
pub const WORLD_SLOT_SEED: &[u8] = b"world-slot";
pub const REGISTRY_SEED: &[u8] = b"astrix-registry";
pub const MAX_SLOTS_PER_CRANK: usize = 16;
pub const MAX_SLOTS: u8 = 255;
/// Crank limit is 32 accounts: 5 shared + 2 per world leaves room for 13; keep margin.
pub const MAX_WORLDS_PER_CHECKPOINT_CRANK: usize = 8;
pub const PASSPORT_SEED: &[u8] = b"passport";
pub const TREASURY_SEED: &[u8] = b"checkpoint-treasury";
/// Proof-of-work for anonymous world claims: sha256(guest || slot || nonce) must
/// start with this many zero bits. Costs ~0.3-1 s in a browser, nothing to verify.
pub const CLAIM_POW_BITS: u32 = 18;
/// Per-world action rate: at most RATE_MAX actions per RATE_WINDOW ticks.
pub const RATE_WINDOW_TICKS: u64 = 10;
pub const RATE_MAX_ACTIONS: u32 = 40;
/// Automatic durable checkpoints: at most one per this many ticks (~1 h at 2 s).
pub const CHECKPOINT_MIN_TICKS: u64 = 1800;
/// A forced checkpoint (after an ownership transfer) waits at least this long
/// since the previous one, so repeated transfers cannot drain the treasury.
pub const CHECKPOINT_MIN_GAP_S: i64 = 600;
pub mod identity_kind { pub const GUEST: u8 = 0; pub const PASSKEY: u8 = 1; pub const WALLET: u8 = 2; }
const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);
/// Scoped VRF identity that signs our callbacks, derived at compile time. The
/// `#[vrf_callback]` macro derives it at runtime with find_program_address, which
/// exhausted the callback's compute budget on devnet (see MagicBlock docs §10).
const VRF_CALLBACK_IDENTITY: Pubkey =
    Pubkey::new_from_array(mbvrf::consts::scoped_vrf_identity_const(&crate::ID).0);

/// Resource slots in `Settlement::stock`.
pub mod res {
    pub const WOOD: usize = 0;
    pub const STONE: usize = 1;
    pub const FIBER: usize = 2;
    pub const FOOD: usize = 3;
    pub const ORE: usize = 4;
    pub const SEED: usize = 5;
    pub const PLANKS: usize = 6;
    pub const CRYSTAL: usize = 7;
    pub const COUNT: usize = 8;
}

pub const PLOTS: usize = 9;
pub const EMPTY_PLOT: u64 = u64::MAX;
pub const CROP_GROWTH_TICKS: u64 = 4;
pub const CROP_FOOD: u32 = 6;
pub const CROP_FIBER: u32 = 1;
pub const STOCK_CAP: u32 = 10_000;
pub const MAX_HARVEST_PER_ACTION: u32 = 4;
pub const SAWMILL_COST_WOOD: u32 = 10;
pub const SAWMILL_COST_STONE: u32 = 6;
pub const PROSPECT_COST_FOOD: u32 = 4;
/// Every `FOOD_PERIOD` ticks each settler eats one food.
pub const FOOD_PERIOD: u64 = 10;
pub const MIN_TICK_INTERVAL_S: i64 = 1;
/// MagicBlock delegation program (escape-hatch CPIs).
pub const DLP_ID: Pubkey = pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
/// DLP legacy discriminators (u64 LE): delegation-program interface/src/legacy/discriminator.rs.
pub const DLP_REQUEST_UNDELEGATION: u64 = 26;
pub const DLP_UNDELEGATE_WITH_ROLLBACK_AFTER_TIMEOUT: u64 = 27;
/// Account kinds addressed by the escape-hatch wrappers.
pub mod acct_kind { pub const SETTLEMENT: u8 = 0; pub const REGISTRY: u8 = 1; pub const SLOT: u8 = 2; pub const PASSPORT: u8 = 3; pub const TREASURY: u8 = 4; }

#[ephemeral]
#[program]
pub mod astrix_settlement {
    use super::*;

    /// Base layer: found a settlement bound to a world seed and terrain generator.
    pub fn initialize(ctx: Context<Initialize>, world_seed: u32, generator: u8, tick_interval_s: i64) -> Result<()> {
        require!(generator == 1 || generator == 2, AstrixError::UnsupportedGenerator);
        require!(tick_interval_s >= MIN_TICK_INTERVAL_S, AstrixError::InvalidInterval);
        let s = &mut ctx.accounts.settlement;
        s.owner = ctx.accounts.owner.key();
        s.world_seed = world_seed;
        s.generator = generator;
        s.bump = ctx.bumps.settlement;
        s.tick = 0;
        s.last_tick_ts = Clock::get()?.unix_timestamp;
        s.tick_interval_s = tick_interval_s;
        // Founder's starter grant, matching the local game (24 wood, 48 stone) plus seeds.
        s.stock = [0; res::COUNT];
        s.stock[res::WOOD] = 24;
        s.stock[res::STONE] = 48;
        s.stock[res::SEED] = 6;
        s.plots = [EMPTY_PLOT; PLOTS];
        s.population = 1;
        s.sawmill = false;
        s.prospect_pending = false;
        s.prospects = 0;
        s.last_find = 0;
        s.rare_finds = 0;
        s.session_key = Pubkey::default();
        s.session_expires = 0;
        s.session_budget = 0;
        s.actions = 0;
        // New settlements are created in layout v2. The seed is caller-chosen, so it is unranked.
        let now = s.last_tick_ts;
        let key = s.key();
        let mut e = WorldExt::default();
        e.epoch_start = now;
        e.max_clock_ts = now;
        e.journal_hash = v2::journal_genesis(&key);
        let mut r = VrfRecord { kind: rec::GENESIS_LEGACY, ts: now, ..Default::default() };
        r.randomness[0..4].copy_from_slice(&world_seed.to_le_bytes());
        journal(&mut e, &key, r);
        v2::store_ext(&ctx.accounts.settlement.to_account_info(), &e)?;
        msg!("ASTrix settlement founded for world {} (generator v{})", world_seed, generator);
        Ok(())
    }

    /// Base layer: hand the settlement to an Ephemeral Rollup validator.
    pub fn delegate(ctx: Context<DelegateInput>) -> Result<()> {
        // Never delegate an account that is not an initialised settlement of this program.
        require_keys_eq!(*ctx.accounts.pda.owner, crate::ID, AstrixError::NotInitialised);
        let len = ctx.accounts.pda.data_len();
        require!(len == V1_LEN || len == V2_LEN, AstrixError::NotInitialised);
        let owner = ctx.accounts.payer.key();
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[SETTLEMENT_SEED, owner.as_ref()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|a| a.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// Owner only: authorise a session key with an expiry and an action budget.
    pub fn set_session(ctx: Context<OwnerOnly>, session_key: Pubkey, expires_at: i64, budget: u32) -> Result<()> {
        settle_account(&mut ctx.accounts.settlement, false)?;
        let s = &mut ctx.accounts.settlement;
        s.session_key = session_key;
        s.session_expires = expires_at;
        s.session_budget = budget;
        msg!("session {} until {} for {} actions", session_key, expires_at, budget);
        Ok(())
    }

    /// Owner only: end the current session immediately.
    pub fn revoke_session(ctx: Context<OwnerOnly>) -> Result<()> {
        settle_account(&mut ctx.accounts.settlement, false)?;
        let s = &mut ctx.accounts.settlement;
        s.session_key = Pubkey::default();
        s.session_expires = 0;
        s.session_budget = 0;
        Ok(())
    }

    /// Gather a resource into the stockpile (owner or session key).
    pub fn harvest(ctx: Context<PlayerAction>, resource: u8, amount: u32) -> Result<()> {
        settle_for_action(&mut ctx.accounts.settlement)?;
        authorise(&mut ctx.accounts.settlement, &ctx.accounts.signer.key())?;
        let r = resource as usize;
        require!(r == res::WOOD || r == res::STONE || r == res::FIBER || r == res::ORE, AstrixError::InvalidResource);
        require!(amount >= 1 && amount <= MAX_HARVEST_PER_ACTION, AstrixError::InvalidAmount);
        let s = &mut ctx.accounts.settlement;
        s.stock[r] = s.stock[r].saturating_add(amount).min(STOCK_CAP);
        Ok(())
    }

    /// Plant one seed in an empty plot (owner or session key).
    pub fn plant(ctx: Context<PlayerAction>, plot: u8) -> Result<()> {
        settle_for_action(&mut ctx.accounts.settlement)?;
        authorise(&mut ctx.accounts.settlement, &ctx.accounts.signer.key())?;
        let s = &mut ctx.accounts.settlement;
        let p = plot as usize;
        require!(p < PLOTS, AstrixError::InvalidPlot);
        require!(s.plots[p] == EMPTY_PLOT, AstrixError::PlotOccupied);
        require!(s.stock[res::SEED] >= 1, AstrixError::InsufficientResources);
        s.stock[res::SEED] -= 1;
        s.plots[p] = s.tick;
        Ok(())
    }

    /// Build the sawmill: afterwards each tick turns 2 wood into 1 plank.
    pub fn build_sawmill(ctx: Context<PlayerAction>) -> Result<()> {
        settle_for_action(&mut ctx.accounts.settlement)?;
        authorise(&mut ctx.accounts.settlement, &ctx.accounts.signer.key())?;
        let s = &mut ctx.accounts.settlement;
        require!(!s.sawmill, AstrixError::AlreadyBuilt);
        require!(s.stock[res::WOOD] >= SAWMILL_COST_WOOD && s.stock[res::STONE] >= SAWMILL_COST_STONE,
            AstrixError::InsufficientResources);
        s.stock[res::WOOD] -= SAWMILL_COST_WOOD;
        s.stock[res::STONE] -= SAWMILL_COST_STONE;
        s.sawmill = true;
        Ok(())
    }

    /// Kept for the live cranks (742001/742101/742117): same name, same single
    /// writable account, same discriminator. Since layout v2 it is an alias for
    /// `settle`, so old and new cranks firing together cannot double-apply time.
    pub fn tick(ctx: Context<Tick>) -> Result<()> {
        settle_account(&mut ctx.accounts.settlement, false)?;
        Ok(())
    }

    /// Permissionless: catch the world up to the rollup clock in at most
    /// MAX_SETTLE_STEPS steps. Idempotent; never moves time backwards. Works on
    /// v1 (unmigrated) and v2 accounts. Call repeatedly to drain a large backlog.
    pub fn settle(ctx: Context<Tick>) -> Result<()> {
        settle_account(&mut ctx.accounts.settlement, false)?;
        Ok(())
    }

    /// ER, registry admin: one crank runs `settle` on up to 16 worlds (any
    /// program-owned world accounts, including the demo settlement). Use new task
    /// ids (e.g. 744xxx) and a 30-60 s interval; liveness only.
    #[allow(deprecated)]
    pub fn schedule_world_settles<'info>(ctx: Context<'info, ScheduleWorldTicks<'info>>, task_id: i64, interval_ms: i64, iterations: i64) -> Result<()> {
        require_keys_eq!(ctx.accounts.registry.admin, ctx.accounts.payer.key(), AstrixError::NotOwner);
        let worlds = ctx.remaining_accounts;
        require!(!worlds.is_empty() && worlds.len() <= MAX_SLOTS_PER_CRANK, AstrixError::InvalidSlot);
        let mut ixs = Vec::with_capacity(worlds.len());
        let mut accounts = vec![ctx.accounts.payer.to_account_info()];
        for w in worlds.iter() {
            require_keys_eq!(*w.owner, crate::ID, AstrixError::NotInitialised);
            ixs.push(Instruction {
                program_id: crate::ID,
                accounts: vec![AccountMeta::new(w.key(), false)],
                data: anchor_lang::InstructionData::data(&crate::instruction::Settle {}),
            });
            accounts.push(w.clone());
        }
        ScheduleCrankCpi {
            payer: &ctx.accounts.payer,
            magic_program: &&ctx.accounts.magic_program,
            instruction_accounts: &accounts,
            args: ScheduleTaskArgs { task_id, execution_interval_millis: interval_ms, iterations, instructions: ixs },
        }.invoke()?;
        Ok(())
    }

    /// Owner only, on the ER: schedule `tick` with a MagicBlock crank.
    #[allow(deprecated)]
    pub fn schedule_ticks<'info>(ctx: Context<'info, ScheduleTicks<'info>>, task_id: i64, interval_ms: i64, iterations: i64) -> Result<()> {
        require_keys_eq!(ctx.accounts.settlement.owner, ctx.accounts.payer.key(), AstrixError::NotOwner);
        let tick_ix = Instruction {
            program_id: crate::ID,
            accounts: vec![AccountMeta::new(ctx.accounts.settlement.key(), false)],
            data: anchor_lang::InstructionData::data(&crate::instruction::Tick {}),
        };
        ScheduleCrankCpi {
            payer: &ctx.accounts.payer,
            magic_program: &&ctx.accounts.magic_program,
            instruction_accounts: &[ctx.accounts.payer.to_account_info(), ctx.accounts.settlement_info.to_account_info()],
            args: ScheduleTaskArgs { task_id, execution_interval_millis: interval_ms, iterations, instructions: vec![tick_ix] },
        }
        .invoke()?;
        Ok(())
    }

    /// Prospect for minerals: spend food, ask MagicBlock VRF for the outcome.
    /// Layout v2 only. The request gets a unique request id, the world id (its
    /// address), a prospect id and a nonce; all four travel through the VRF
    /// `callback_args` and the callback settles only that exact request.
    pub fn prospect(ctx: Context<Prospect>, client_seed: u8) -> Result<()> {
        let signer = ctx.accounts.payer.key();
        let (ext, _) = settle_for_action(&mut ctx.accounts.settlement)?;
        let mut e = ext.ok_or(error!(AstrixError::MigrationRequired))?;
        require!(e.seed_origin != seed_origin::AWAITING_VRF, AstrixError::WorldNotReady);
        authorise(&mut ctx.accounts.settlement, &signer)?;
        let s = &mut ctx.accounts.settlement;
        require!(!s.prospect_pending && e.pending.kind == vrf_kind::NONE, AstrixError::ProspectPending);
        require!(s.stock[res::FOOD] >= PROSPECT_COST_FOOD, AstrixError::InsufficientResources);
        s.stock[res::FOOD] -= PROSPECT_COST_FOOD;
        s.prospect_pending = true;
        s.prospects += 1;
        let world = s.key();
        let clock = Clock::get()?;
        let ticket = open_request(&mut e, &world, vrf_kind::PROSPECT, s.prospects, &clock, client_seed);
        v2::store_ext(&s.to_account_info(), &e)?;
        s.exit(&crate::ID)?;
        let ix = vrf_request_ix(signer, ctx.accounts.oracle_queue.key(), &ticket)?;
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        msg!("prospect request {} prospect {} nonce {}", ticket.request_id, ticket.prospect_id, ticket.nonce);
        Ok(())
    }

    /// Legacy VRF callback (pre-v2 requests carried no ticket). Applies only to a
    /// v1 (unmigrated) world with a legacy prospect pending, exactly as before. On
    /// a v2 world it is always rejected: an unbound result can never settle a
    /// v2 request.
    pub fn prospect_callback(ctx: Context<ProspectCallback>, randomness: [u8; 32]) -> Result<()> {
        let info = ctx.accounts.settlement.to_account_info();
        require!(v2::load_ext(&info)?.is_none(), AstrixError::LegacyCallbackRejected);
        let s = &mut ctx.accounts.settlement;
        require!(s.prospect_pending, AstrixError::NoProspect);
        s.prospect_pending = false;
        let (roll, find) = apply_prospect(s, &randomness);
        msg!("prospect roll {} find {}", roll, find);
        Ok(())
    }

    /// VRF callback for layout v2 (prospect and world genesis). Only the VRF
    /// program's scoped identity can call it (checked by address + signer), and
    /// only the exact outstanding request matches the ticket: a late response to
    /// a cancelled, released or superseded request is rejected and changes nothing.
    /// Every accepted result is appended to the world's hash-chained journal and
    /// emitted as a `JournalEvent`.
    pub fn vrf_callback(ctx: Context<ProspectCallback>, randomness: [u8; 32], ticket: VrfTicket) -> Result<()> {
        let world = ctx.accounts.settlement.key();
        let info = ctx.accounts.settlement.to_account_info();
        let mut e = v2::load_ext(&info)?.ok_or(error!(AstrixError::VrfTicketMismatch))?;
        let p = e.pending;
        require!(ticket.world == world && p.kind != vrf_kind::NONE && ticket.kind == p.kind && ticket.request_id == p.request_id
            && ticket.nonce == p.nonce && ticket.prospect_id == p.prospect_id, AstrixError::VrfTicketMismatch);
        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        let s = &mut ctx.accounts.settlement;
        let mut r = VrfRecord { request_id: p.request_id, prospect_id: p.prospect_id, kind: rec::PROSPECT_RESULT, ts: now, randomness, ..Default::default() };
        if p.kind == vrf_kind::PROSPECT {
            // Settle first (best effort: a callback must never fail because of a backlog).
            v2::settle_core(s, Some(&mut e), now, clock.slot, v2::CALLBACK_SETTLE_STEPS);
            require!(s.prospect_pending, AstrixError::NoProspect);
            s.prospect_pending = false;
            let (roll, find) = apply_prospect(s, &randomness);
            r.outcome = roll;
            r.find = find;
        } else {
            // World genesis: the seed is revealed only now, after the creator committed
            // the configuration in claim_world_vrf. The world clock starts here.
            s.world_seed = u32::from_le_bytes(randomness[0..4].try_into().unwrap());
            s.tick = 0;
            s.last_tick_ts = now;
            e.seed_origin = seed_origin::VRF_RANKED;
            e.genesis_randomness = randomness;
            e.epoch_start = now;
            e.max_clock_ts = e.max_clock_ts.max(now);
            r.kind = rec::GENESIS_VRF;
        }
        r.world_tick = s.tick;
        e.pending = VrfPending::default();
        journal(&mut e, &world, r);
        v2::store_ext(&info, &e)?;
        Ok(())
    }

    /// Owner only: clear a prospect whose randomness never arrived. v2: allowed only
    /// once VRF_TIMEOUT_S has passed since the request (after MagicBlock's purge
    /// window), so a cancel can never race a still-valid result. The cancelled
    /// request id is burnt; a late result for it is rejected. Food is not refunded.
    pub fn cancel_prospect(ctx: Context<OwnerOnly>) -> Result<()> {
        let (ext, _) = settle_account(&mut ctx.accounts.settlement, false)?;
        let world = ctx.accounts.settlement.key();
        match ext {
            None => { ctx.accounts.settlement.prospect_pending = false; }
            Some(mut e) => {
                let now = Clock::get()?.unix_timestamp;
                if e.pending.kind == vrf_kind::NONE {
                    // A legacy (pre-migration) request without a ticket: nothing can settle it anymore.
                    require!(ctx.accounts.settlement.prospect_pending, AstrixError::NoProspect);
                } else {
                    require!(e.pending.kind == vrf_kind::PROSPECT, AstrixError::NoProspect);
                    require!(now >= e.pending.requested_ts.saturating_add(VRF_TIMEOUT_S), AstrixError::VrfNotTimedOut);
                    let p = e.pending;
                    let r = VrfRecord { request_id: p.request_id, prospect_id: p.prospect_id, kind: rec::VRF_CANCELLED, ts: now,
                        world_tick: ctx.accounts.settlement.tick, ..Default::default() };
                    e.pending = VrfPending::default();
                    journal(&mut e, &world, r);
                }
                ctx.accounts.settlement.prospect_pending = false;
                v2::store_ext(&ctx.accounts.settlement.to_account_info(), &e)?;
            }
        }
        Ok(())
    }

    /// World owner: re-request the genesis randomness after VRF_TIMEOUT_S without a
    /// result. The committed configuration is unchanged; the old request id is
    /// burnt, so its late result is rejected. Accounts as `prospect`.
    pub fn retry_genesis(ctx: Context<Prospect>) -> Result<()> {
        let signer = ctx.accounts.payer.key();
        require_keys_eq!(ctx.accounts.settlement.owner, signer, AstrixError::NotOwner);
        let world = ctx.accounts.settlement.key();
        let info = ctx.accounts.settlement.to_account_info();
        let mut e = v2::load_ext(&info)?.ok_or(error!(AstrixError::MigrationRequired))?;
        require!(e.seed_origin == seed_origin::AWAITING_VRF && e.pending.kind == vrf_kind::GENESIS, AstrixError::WorldNotReady);
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= e.pending.requested_ts.saturating_add(VRF_TIMEOUT_S), AstrixError::VrfNotTimedOut);
        let p = e.pending;
        journal(&mut e, &world, VrfRecord { request_id: p.request_id, kind: rec::VRF_CANCELLED, ts: clock.unix_timestamp, ..Default::default() });
        let ticket = open_request(&mut e, &world, vrf_kind::GENESIS, 0, &clock, 0);
        v2::store_ext(&info, &e)?;
        let ix = vrf_request_ix(signer, ctx.accounts.oracle_queue.key(), &ticket)?;
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    // ---------- player-owned world slots ----------

    /// Base layer, admin: create the registry that governs world slots.
    pub fn init_registry(ctx: Context<InitRegistry>, slots: u8, claim_cooldown_s: i64) -> Result<()> {
        let r = &mut ctx.accounts.registry;
        r.admin = ctx.accounts.admin.key();
        r.slots = slots;
        r.claims = 0;
        r.last_claim_ts = 0;
        r.claim_cooldown_s = claim_cooldown_s.max(0);
        r.bump = ctx.bumps.registry;
        Ok(())
    }

    /// Base layer, admin: pre-fund one empty world slot (rent paid by the admin).
    pub fn init_slot(ctx: Context<InitSlot>, index: u8) -> Result<()> {
        require!(index < MAX_SLOTS, AstrixError::InvalidSlot);
        let now = Clock::get()?.unix_timestamp;
        let s = &mut ctx.accounts.slot;
        clear_world(s, Pubkey::default(), 0, now);
        s.bump = ctx.bumps.slot;
        // New slots are created in layout v2.
        let key = s.key();
        let mut e = WorldExt::default();
        e.epoch_start = now;
        e.max_clock_ts = now;
        e.journal_hash = v2::journal_genesis(&key);
        v2::store_ext(&s.to_account_info(), &e)?;
        Ok(())
    }

    /// Base layer, admin: delegate the registry to the ER.
    pub fn delegate_registry(ctx: Context<DelegateRegistry>) -> Result<()> {
        let admin = ctx.accounts.payer.key();
        ctx.accounts.delegate_pda(&ctx.accounts.payer, &[REGISTRY_SEED, admin.as_ref()], DelegateConfig {
            validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default()
        })?;
        Ok(())
    }

    /// Base layer, admin: delegate one world slot to the ER.
    pub fn delegate_slot(ctx: Context<DelegateSlot>, index: u8) -> Result<()> {
        require_keys_eq!(*ctx.accounts.pda.owner, crate::ID, AstrixError::NotInitialised);
        let admin = ctx.accounts.payer.key();
        ctx.accounts.delegate_pda(&ctx.accounts.payer, &[WORLD_SLOT_SEED, admin.as_ref(), &[index]], DelegateConfig {
            validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default()
        })?;
        Ok(())
    }

    /// ER, permissionless: a guest key claims an empty slot and becomes the sole
    /// owner of that world. Each claim needs a proof of work bound to the key and
    /// slot. The world seed is derived from the claimant's key, so every world differs.
    pub fn claim_world(ctx: Context<ClaimWorld>, index: u8, nonce: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let guest = ctx.accounts.guest.key();
        let digest = solana_sha256_hasher::hashv(&[guest.as_ref(), &[index], &nonce.to_le_bytes()]).to_bytes();
        require!(leading_zero_bits(&digest) >= CLAIM_POW_BITS, AstrixError::ProofOfWork);
        let r = &mut ctx.accounts.registry;
        let s = &mut ctx.accounts.slot;
        require_keys_eq!(s.owner, Pubkey::default(), AstrixError::SlotTaken);
        let k = ctx.accounts.guest.key().to_bytes();
        let seed = u32::from_le_bytes([k[0], k[1], k[2], k[3]]) ^ (r.claims.wrapping_mul(2_654_435_761)) ^ (index as u32);
        clear_world(s, ctx.accounts.guest.key(), seed, now);
        s.stock[res::WOOD] = 24;
        s.stock[res::STONE] = 48;
        s.stock[res::SEED] = 6;
        s.population = 1;
        r.claims = r.claims.saturating_add(1);
        r.last_claim_ts = now;
        let pp = &mut ctx.accounts.passport;
        require_keys_eq!(pp.world, s.key(), AstrixError::InvalidSlot);
        pp.owner = guest;
        pp.identity_kind = identity_kind::GUEST;
        pp.created_ts = now;
        // v2 slot: this seed is derivable by the claimant before claiming, so the world is unranked.
        let info = s.to_account_info();
        if let Some(mut e) = v2::load_ext(&info)? {
            let key = s.key();
            reset_ext_for_new_world(&mut e, now, seed_origin::LEGACY_UNRANKED);
            let mut r = VrfRecord { kind: rec::GENESIS_LEGACY, ts: now, ..Default::default() };
            r.randomness[0..4].copy_from_slice(&seed.to_le_bytes());
            journal(&mut e, &key, r);
            v2::store_ext(&info, &e)?;
        }
        msg!("world slot {} claimed by {} with seed {}", index, ctx.accounts.guest.key(), seed);
        Ok(())
    }

    /// ER, permissionless, layout v2: claim an empty slot as a ranked world. The
    /// claimant commits to the configuration (owner, slot, generator, rules
    /// version, `config_hash` of any creator settings) first; the seed is then
    /// revealed by MagicBlock VRF in `vrf_callback`. Until then the world cannot be
    /// played and its clock does not run. Re-rolling means releasing the world and
    /// claiming again: each attempt costs a proof of work, honours the registry
    /// cooldown and leaves a public GENESIS record in the journal.
    pub fn claim_world_vrf(ctx: Context<ClaimWorldVrf>, index: u8, nonce: u64, config_hash: [u8; 32]) -> Result<()> {
        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        let guest = ctx.accounts.guest.key();
        let digest = solana_sha256_hasher::hashv(&[guest.as_ref(), &[index], &nonce.to_le_bytes()]).to_bytes();
        require!(leading_zero_bits(&digest) >= CLAIM_POW_BITS, AstrixError::ProofOfWork);
        let r = &mut ctx.accounts.registry;
        require!(now >= r.last_claim_ts.saturating_add(r.claim_cooldown_s), AstrixError::ClaimCooldown);
        let s = &mut ctx.accounts.slot;
        require_keys_eq!(s.owner, Pubkey::default(), AstrixError::SlotTaken);
        let info = s.to_account_info();
        let mut e = v2::load_ext(&info)?.ok_or(error!(AstrixError::MigrationRequired))?;
        let world = s.key();
        clear_world(s, guest, 0, now);
        s.stock[res::WOOD] = 24;
        s.stock[res::STONE] = 48;
        s.stock[res::SEED] = 6;
        s.population = 1;
        r.claims = r.claims.saturating_add(1);
        r.last_claim_ts = now;
        let pp = &mut ctx.accounts.passport;
        require_keys_eq!(pp.world, world, AstrixError::InvalidSlot);
        pp.owner = guest;
        pp.identity_kind = identity_kind::GUEST;
        pp.created_ts = now;
        reset_ext_for_new_world(&mut e, now, seed_origin::AWAITING_VRF);
        e.genesis_commitment = solana_sha256_hasher::hashv(&[b"astrix-genesis-v1", world.as_ref(), guest.as_ref(), &[index, s.generator, v2::RULES_VERSION],
            &config_hash, &e.next_request_id.to_le_bytes()]).to_bytes();
        let ticket = open_request(&mut e, &world, vrf_kind::GENESIS, 0, &clock, 0);
        v2::store_ext(&info, &e)?;
        s.exit(&crate::ID)?;
        let ix = vrf_request_ix(guest, ctx.accounts.oracle_queue.key(), &ticket)?;
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.guest.to_account_info(), &ix)?;
        msg!("world slot {} committed by {}; genesis request {}", index, guest, ticket.request_id);
        Ok(())
    }

    /// ER, owner only: delete your own world and return the slot to the pool.
    /// Claimed worlds are never recycled by the operator, however long inactive.
    pub fn release_world(ctx: Context<ReleaseWorld>) -> Result<()> {
        require_keys_eq!(ctx.accounts.slot.owner, ctx.accounts.owner.key(), AstrixError::NotOwner);
        let now = Clock::get()?.unix_timestamp;
        // No settle: the world is being deleted. A pending VRF request is dropped, so its
        // late result no longer matches and is rejected.
        clear_world(&mut ctx.accounts.slot, Pubkey::default(), 0, now);
        let info = ctx.accounts.slot.to_account_info();
        if let Some(mut e) = v2::load_ext(&info)? {
            let key = ctx.accounts.slot.key();
            reset_ext_for_new_world(&mut e, now, seed_origin::LEGACY_UNRANKED);
            journal(&mut e, &key, VrfRecord { kind: rec::RELEASED, ts: now, ..Default::default() });
            v2::store_ext(&info, &e)?;
        }
        let pp = &mut ctx.accounts.passport;
        pp.owner = Pubkey::default();
        pp.identity_kind = identity_kind::GUEST;
        pp.checkpoint_due = true; // publish the release so the base record is not stale
        Ok(())
    }

    /// Base, admin: create the passport (durable identity record) for one of the
    /// admin's world slots.
    pub fn init_passport(ctx: Context<InitPassport>, _index: u8) -> Result<()> {
        let pp = &mut ctx.accounts.passport;
        pp.version = 1;
        pp.world = ctx.accounts.world.key();
        pp.bump = ctx.bumps.passport;
        Ok(())
    }

    /// Base, admin: delegate a passport to the ER.
    pub fn delegate_passport(ctx: Context<DelegatePassport>, _index: u8) -> Result<()> {
        let world = ctx.accounts.world.key();
        ctx.accounts.delegate_pda(&ctx.accounts.payer, &[PASSPORT_SEED, world.as_ref()], DelegateConfig {
            validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default()
        })?;
        Ok(())
    }

    /// ER, permissionless: link a world claimed before passports existed. Copies
    /// the world's current owner; does nothing once linked.
    pub fn link_passport(ctx: Context<LinkPassport>) -> Result<()> {
        let pp = &mut ctx.accounts.passport;
        require_keys_eq!(pp.world, ctx.accounts.world.key(), AstrixError::InvalidSlot);
        if pp.owner == Pubkey::default() && ctx.accounts.world.owner != Pubkey::default() {
            pp.owner = ctx.accounts.world.owner;
            pp.identity_kind = identity_kind::GUEST;
            pp.created_ts = Clock::get()?.unix_timestamp;
        }
        Ok(())
    }

    /// ER: move ownership to a new identity (passkey or wallet). Both the current
    /// owner and the new owner must sign, so a world cannot be pushed to a key
    /// nobody controls, and the old key loses all control (session cleared).
    pub fn transfer_world(ctx: Context<TransferWorld>, kind: u8) -> Result<()> {
        require!(kind <= identity_kind::WALLET, AstrixError::InvalidIdentity);
        settle_account(&mut ctx.accounts.world, false)?;
        let w = &mut ctx.accounts.world;
        require_keys_eq!(w.owner, ctx.accounts.owner.key(), AstrixError::NotOwner);
        let pp = &mut ctx.accounts.passport;
        require_keys_eq!(pp.world, w.key(), AstrixError::InvalidSlot);
        w.owner = ctx.accounts.new_owner.key();
        w.session_key = Pubkey::default();
        w.session_expires = 0;
        w.session_budget = 0;
        pp.owner = w.owner;
        pp.identity_kind = kind;
        pp.transfers = pp.transfers.saturating_add(1);
        pp.checkpoint_due = true;
        msg!("world {} transferred to {} (kind {})", w.key(), w.owner, kind);
        Ok(())
    }

    /// ER, permissionless: commit the world and its passport to Solana, paid by
    /// the operator's delegated checkpoint treasury. Rate-limited per world: once
    /// every CHECKPOINT_MIN_TICKS of simulation, or after an ownership transfer
    /// once CHECKPOINT_MIN_GAP_S has passed since the last checkpoint.
    /// Records a hash of the committed world so restores can be verified.
    pub fn checkpoint(ctx: Context<Checkpoint>) -> Result<()> {
        // Settle first so the committed snapshot is current (best effort, never fails on a backlog).
        settle_account(&mut ctx.accounts.world, false)?;
        let pp = &mut ctx.accounts.passport;
        let w = &ctx.accounts.world;
        require_keys_eq!(pp.world, w.key(), AstrixError::InvalidSlot);
        let now = Clock::get()?.unix_timestamp;
        let forced = pp.checkpoint_due && now >= pp.last_checkpoint_ts.saturating_add(CHECKPOINT_MIN_GAP_S);
        let periodic = w.owner != Pubkey::default()
            && w.tick >= pp.last_checkpoint_tick.saturating_add(CHECKPOINT_MIN_TICKS);
        if !forced && !periodic { return Ok(()); }
        w.exit(&crate::ID)?;
        let data = w.to_account_info().try_borrow_data()?.to_vec();
        pp.state_hash = solana_sha256_hasher::hash(&data).to_bytes();
        pp.last_checkpoint_tick = w.tick;
        pp.last_checkpoint_ts = now;
        pp.checkpoints = pp.checkpoints.saturating_add(1);
        pp.checkpoint_due = false;
        pp.exit(&crate::ID)?;
        let admin = ctx.accounts.treasury.admin;
        let bump = ctx.accounts.treasury.bump;
        let seeds: &[&[u8]] = &[TREASURY_SEED, admin.as_ref(), &[bump]];
        MagicIntentBundleBuilder::new(
            ctx.accounts.treasury.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .magic_fee_vault(ctx.accounts.magic_fee_vault.to_account_info())
        .commit(&[w.to_account_info(), pp.to_account_info()])
        .build_and_invoke_signed(&[seeds])?;
        Ok(())
    }

    /// Base, admin: create and fund the checkpoint treasury.
    pub fn init_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        let t = &mut ctx.accounts.treasury;
        t.admin = ctx.accounts.admin.key();
        t.bump = ctx.bumps.treasury;
        Ok(())
    }

    /// Base, admin: delegate the treasury so it can pay commit fees on the ER.
    pub fn delegate_treasury(ctx: Context<DelegateTreasury>) -> Result<()> {
        let admin = ctx.accounts.payer.key();
        ctx.accounts.delegate_pda(&ctx.accounts.payer, &[TREASURY_SEED, admin.as_ref()], DelegateConfig {
            validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default()
        })?;
        Ok(())
    }

    /// ER, admin: one crank ticks up to 16 independent worlds. Each scheduled
    /// instruction is a separate `tick` on one world account; no state is shared.
    #[allow(deprecated)]
    pub fn schedule_world_ticks<'info>(ctx: Context<'info, ScheduleWorldTicks<'info>>, task_id: i64, interval_ms: i64, iterations: i64) -> Result<()> {
        require_keys_eq!(ctx.accounts.registry.admin, ctx.accounts.payer.key(), AstrixError::NotOwner);
        let worlds = ctx.remaining_accounts;
        require!(!worlds.is_empty() && worlds.len() <= MAX_SLOTS_PER_CRANK, AstrixError::InvalidSlot);
        let mut ixs = Vec::with_capacity(worlds.len());
        let mut accounts = vec![ctx.accounts.payer.to_account_info()];
        for w in worlds.iter() {
            require_keys_eq!(*w.owner, crate::ID, AstrixError::NotInitialised);
            ixs.push(Instruction {
                program_id: crate::ID,
                accounts: vec![AccountMeta::new(w.key(), false)],
                data: anchor_lang::InstructionData::data(&crate::instruction::Tick {}),
            });
            accounts.push(w.clone());
        }
        ScheduleCrankCpi {
            payer: &ctx.accounts.payer,
            magic_program: &&ctx.accounts.magic_program,
            instruction_accounts: &accounts,
            args: ScheduleTaskArgs { task_id, execution_interval_millis: interval_ms, iterations, instructions: ixs },
        }.invoke()?;
        Ok(())
    }

    /// ER, admin: one crank runs `checkpoint` for up to MAX_WORLDS_PER_CHECKPOINT_CRANK
    /// worlds. Remaining accounts are (world, passport) pairs. Each call is
    /// self-rate-limited, so most crank runs are cheap no-ops.
    #[allow(deprecated)]
    pub fn schedule_checkpoints<'info>(ctx: Context<'info, ScheduleCheckpoints<'info>>, task_id: i64, interval_ms: i64, iterations: i64) -> Result<()> {
        require_keys_eq!(ctx.accounts.registry.admin, ctx.accounts.payer.key(), AstrixError::NotOwner);
        require_keys_eq!(ctx.accounts.treasury.admin, ctx.accounts.payer.key(), AstrixError::NotOwner);
        let pairs = ctx.remaining_accounts;
        require!(!pairs.is_empty() && pairs.len() % 2 == 0 && pairs.len() / 2 <= MAX_WORLDS_PER_CHECKPOINT_CRANK, AstrixError::InvalidSlot);
        let mut accounts = vec![ctx.accounts.payer.to_account_info(), ctx.accounts.treasury.to_account_info(), ctx.accounts.magic_fee_vault.to_account_info(),
            ctx.accounts.magic_context.to_account_info(), ctx.accounts.magic_program.to_account_info()];
        let mut ixs = Vec::with_capacity(pairs.len() / 2);
        for pair in pairs.chunks(2) {
            let (w, p) = (&pair[0], &pair[1]);
            require_keys_eq!(*w.owner, crate::ID, AstrixError::NotInitialised);
            let expected = Pubkey::find_program_address(&[PASSPORT_SEED, w.key.as_ref()], &crate::ID).0;
            require_keys_eq!(p.key(), expected, AstrixError::InvalidSlot);
            ixs.push(Instruction {
                program_id: crate::ID,
                accounts: vec![
                    AccountMeta::new(w.key(), false), AccountMeta::new(p.key(), false),
                    AccountMeta::new(ctx.accounts.treasury.key(), false), AccountMeta::new(ctx.accounts.magic_fee_vault.key(), false),
                    AccountMeta::new(ctx.accounts.magic_context.key(), false), AccountMeta::new_readonly(ctx.accounts.magic_program.key(), false),
                ],
                data: anchor_lang::InstructionData::data(&crate::instruction::Checkpoint {}),
            });
            accounts.push(w.clone());
            accounts.push(p.clone());
        }
        ScheduleCrankCpi {
            payer: &ctx.accounts.payer,
            magic_program: &&ctx.accounts.magic_program,
            instruction_accounts: &accounts,
            args: ScheduleTaskArgs { task_id, execution_interval_millis: interval_ms, iterations, instructions: ixs },
        }.invoke()?;
        Ok(())
    }

    /// ER, admin: commit a set of world slots (and the registry) to Solana.
    pub fn commit_worlds<'info>(ctx: Context<'info, CommitWorlds<'info>>) -> Result<()> {
        require_keys_eq!(ctx.accounts.registry.admin, ctx.accounts.payer.key(), AstrixError::NotOwner);
        let mut list = vec![ctx.accounts.registry.to_account_info()];
        for w in ctx.remaining_accounts.iter() {
            require_keys_eq!(*w.owner, crate::ID, AstrixError::NotInitialised);
            list.push(w.clone());
        }
        ctx.accounts.registry.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        ).commit(&list).build_and_invoke()?;
        Ok(())
    }

    /// Owner only, on the ER: commit the current settlement state to Solana.
    pub fn commit_settlement(ctx: Context<CommitSettlement>) -> Result<()> {
        require_keys_eq!(ctx.accounts.settlement.owner, ctx.accounts.payer.key(), AstrixError::NotOwner);
        settle_account(&mut ctx.accounts.settlement, false)?;
        ctx.accounts.settlement.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.settlement.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    /// Owner only, on the ER: commit and return the settlement to Solana.
    pub fn undelegate(ctx: Context<CommitSettlement>) -> Result<()> {
        require_keys_eq!(ctx.accounts.settlement.owner, ctx.accounts.payer.key(), AstrixError::NotOwner);
        settle_account(&mut ctx.accounts.settlement, false)?;
        ctx.accounts.settlement.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.settlement.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    // ---------- layout migration (v1 -> v2) ----------

    /// Permissionless, idempotent: grow a v1 world account (240 bytes) to layout
    /// v2 in place. The 240-byte v1 prefix is not modified (byte-identical), so
    /// all existing data survives and old readers keep working. The payer funds
    /// the extra rent. Requires the account to be owned by this program where it
    /// runs and the payer to be a writable system account there: on Solana this
    /// means after undelegation (see the PHASE2 report). Existing seeds are kept
    /// and marked legacy/unranked. Already-v2 accounts are a no-op.
    pub fn migrate_world(ctx: Context<MigrateWorld>) -> Result<()> {
        let info = ctx.accounts.world.to_account_info();
        if v2::load_ext(&info)?.is_some() {
            msg!("already layout v2");
            return Ok(());
        }
        require!(info.data_len() == V1_LEN, AstrixError::NotInitialised);
        let need = Rent::get()?.minimum_balance(V2_LEN).saturating_sub(info.lamports());
        if need > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.key(), anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(), to: info.clone() }),
                need,
            )?;
        }
        info.resize(V2_LEN)?;
        let now = Clock::get()?.unix_timestamp;
        let w = &ctx.accounts.world;
        let key = w.key();
        let interval = w.tick_interval_s.max(MIN_TICK_INTERVAL_S);
        let mut e = WorldExt::default();
        e.seed_origin = seed_origin::LEGACY_UNRANKED;
        // Continue from the current tick: lost pre-migration time is not credited retroactively.
        e.epoch_start = w.last_tick_ts - (w.tick as i64) * interval;
        e.max_clock_ts = w.last_tick_ts;
        e.migrated_ts = now;
        e.migrated_from_tick = w.tick;
        e.journal_hash = v2::journal_genesis(&key);
        let mut r = VrfRecord { kind: rec::MIGRATED, ts: now, world_tick: w.tick, ..Default::default() };
        r.randomness[0..4].copy_from_slice(&w.world_seed.to_le_bytes());
        journal(&mut e, &key, r);
        v2::store_ext(&info, &e)?;
        msg!("migrated {} to layout v2 at tick {} (+{} lamports)", key, w.tick, need);
        Ok(())
    }

    /// ER, registry admin: commit and return the given world, passport and treasury
    /// accounts (and the registry itself when `include_registry`) to Solana, for the
    /// migration path and planned exits. Send small batches (2-4 accounts) so each
    /// commit fits inline; undelegate the registry last. Cancel cranks that touch
    /// these accounts first, or accept that they stall until re-delegation.
    pub fn undelegate_worlds<'info>(ctx: Context<'info, CommitWorlds<'info>>, include_registry: bool) -> Result<()> {
        require_keys_eq!(ctx.accounts.registry.admin, ctx.accounts.payer.key(), AstrixError::NotOwner);
        let mut list = Vec::with_capacity(ctx.remaining_accounts.len() + 1);
        if include_registry { list.push(ctx.accounts.registry.to_account_info()); }
        for w in ctx.remaining_accounts.iter() {
            require_keys_eq!(*w.owner, crate::ID, AstrixError::NotInitialised);
            list.push(w.clone());
        }
        require!(!list.is_empty(), AstrixError::InvalidSlot);
        ctx.accounts.registry.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        ).commit_and_undelegate(&list).build_and_invoke()?;
        Ok(())
    }

    // ---------- escape hatch (validator unresponsive) ----------

    /// Base layer, admin (the delegation rent payer): ask the delegation program
    /// to undelegate one of our delegated accounts (`DLP RequestUndelegation`).
    /// The ER validator may honour it with a normal commit+undelegate; if it does
    /// not respond within 9,000 slots, `rollback_undelegation` takes the account
    /// back with its last committed (base-chain) state. Idempotent in DLP.
    pub fn request_undelegation(ctx: Context<RequestUndelegationCtx>, kind: u8, index: u8) -> Result<()> {
        let payer = ctx.accounts.payer.key();
        let (seeds, bump) = escape_seeds(kind, index, &payer, &ctx.accounts.delegated.key())?;
        let ix = Instruction {
            program_id: DLP_ID,
            accounts: vec![
                AccountMeta::new(payer, true),
                AccountMeta::new_readonly(ctx.accounts.delegated.key(), true),
                AccountMeta::new_readonly(crate::ID, false),
                AccountMeta::new(ctx.accounts.undelegation_request.key(), false),
                AccountMeta::new_readonly(ctx.accounts.delegation_record.key(), false),
                AccountMeta::new(ctx.accounts.delegation_metadata.key(), false),
                AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
            ],
            data: DLP_REQUEST_UNDELEGATION.to_le_bytes().to_vec(),
        };
        let bump_s = [bump];
        let mut signer: Vec<&[u8]> = seeds.iter().map(|v| v.as_slice()).collect();
        signer.push(&bump_s);
        invoke_signed(&ix, &[
            ctx.accounts.payer.to_account_info(), ctx.accounts.delegated.to_account_info(), ctx.accounts.owner_program.to_account_info(),
            ctx.accounts.undelegation_request.to_account_info(), ctx.accounts.delegation_record.to_account_info(),
            ctx.accounts.delegation_metadata.to_account_info(), ctx.accounts.system_program.to_account_info(),
            ctx.accounts.delegation_program.to_account_info(),
        ], &[&signer])?;
        msg!("undelegation requested for {}", ctx.accounts.delegated.key());
        Ok(())
    }

    /// Base layer, admin: after the undelegation request expired (9,000 slots),
    /// take the account back with its last base-chain state
    /// (`DLP UndelegateWithRollbackAfterTimeout`). DLP empties the account during
    /// the CPI; the data is preserved and restored here as DLP requires. World
    /// accounts in layout v2 get `state_epoch += 1` and a ROLLBACK journal record,
    /// so clients can tell that ER state newer than the last commit was discarded.
    pub fn rollback_undelegation(ctx: Context<RollbackUndelegationCtx>, kind: u8, index: u8) -> Result<()> {
        let payer = ctx.accounts.payer.key();
        let delegated = ctx.accounts.delegated.to_account_info();
        let (seeds, bump) = escape_seeds(kind, index, &payer, &delegated.key())?;
        let saved = delegated.try_borrow_data()?.to_vec();
        let ix = Instruction {
            program_id: DLP_ID,
            accounts: vec![
                AccountMeta::new(delegated.key(), true),
                AccountMeta::new_readonly(crate::ID, false),
                AccountMeta::new(ctx.accounts.undelegation_request.key(), false),
                AccountMeta::new(ctx.accounts.delegation_record.key(), false),
                AccountMeta::new(ctx.accounts.delegation_metadata.key(), false),
                AccountMeta::new(payer, false),
                AccountMeta::new(ctx.accounts.commit_state.key(), false),
                AccountMeta::new(ctx.accounts.commit_record.key(), false),
                AccountMeta::new(ctx.accounts.commit_reimbursement.key(), false),
            ],
            data: DLP_UNDELEGATE_WITH_ROLLBACK_AFTER_TIMEOUT.to_le_bytes().to_vec(),
        };
        let bump_s = [bump];
        let mut signer: Vec<&[u8]> = seeds.iter().map(|v| v.as_slice()).collect();
        signer.push(&bump_s);
        invoke_signed(&ix, &[
            delegated.clone(), ctx.accounts.owner_program.to_account_info(), ctx.accounts.undelegation_request.to_account_info(),
            ctx.accounts.delegation_record.to_account_info(), ctx.accounts.delegation_metadata.to_account_info(),
            ctx.accounts.payer.to_account_info(), ctx.accounts.commit_state.to_account_info(), ctx.accounts.commit_record.to_account_info(),
            ctx.accounts.commit_reimbursement.to_account_info(), ctx.accounts.delegation_program.to_account_info(),
        ], &[&signer])?;
        require_keys_eq!(*delegated.owner, crate::ID, AstrixError::NotInitialised);
        delegated.resize(saved.len())?;
        delegated.try_borrow_mut_data()?.copy_from_slice(&saved);
        if (kind == acct_kind::SLOT || kind == acct_kind::SETTLEMENT) && saved.len() >= V2_LEN {
            if let Some(mut e) = v2::load_ext(&delegated)? {
                e.state_epoch = e.state_epoch.saturating_add(1);
                let tick = u64::from_le_bytes(saved[46..54].try_into().unwrap());
                let now = Clock::get()?.unix_timestamp;
                // A pending VRF request belonged to the discarded ER history.
                e.pending = VrfPending::default();
                journal(&mut e, &delegated.key(), VrfRecord { kind: rec::ROLLBACK, ts: now, world_tick: tick, ..Default::default() });
                v2::store_ext(&delegated, &e)?;
            }
        }
        msg!("rolled back {} to its last committed state", delegated.key());
        Ok(())
    }
}

/// Seeds (without bump) of one of our delegated PDAs, derived from the signer so
/// only the admin (or the settlement owner) can drive the escape hatch.
fn escape_seeds(kind: u8, index: u8, signer: &Pubkey, expected: &Pubkey) -> Result<(Vec<Vec<u8>>, u8)> {
    let seeds: Vec<Vec<u8>> = match kind {
        acct_kind::SETTLEMENT => vec![SETTLEMENT_SEED.to_vec(), signer.to_bytes().to_vec()],
        acct_kind::REGISTRY => vec![REGISTRY_SEED.to_vec(), signer.to_bytes().to_vec()],
        acct_kind::SLOT => vec![WORLD_SLOT_SEED.to_vec(), signer.to_bytes().to_vec(), vec![index]],
        acct_kind::PASSPORT => {
            let slot = Pubkey::find_program_address(&[WORLD_SLOT_SEED, signer.as_ref(), &[index]], &crate::ID).0;
            vec![PASSPORT_SEED.to_vec(), slot.to_bytes().to_vec()]
        }
        acct_kind::TREASURY => vec![TREASURY_SEED.to_vec(), signer.to_bytes().to_vec()],
        _ => return err!(AstrixError::InvalidKind),
    };
    let refs: Vec<&[u8]> = seeds.iter().map(|v| v.as_slice()).collect();
    let (pda, bump) = Pubkey::find_program_address(&refs, &crate::ID);
    require_keys_eq!(pda, *expected, AstrixError::InvalidSlot);
    Ok((seeds, bump))
}

/// Settle a world to the rollup clock and persist the v2 tail.
fn settle_account(acc: &mut Account<Settlement>, require_current: bool) -> Result<(Option<WorldExt>, Settled)> {
    let clock = Clock::get()?;
    let info = acc.to_account_info();
    let mut ext = v2::load_ext(&info)?;
    let r = v2::settle_core(acc, ext.as_mut(), clock.unix_timestamp, clock.slot, MAX_SETTLE_STEPS);
    if let Some(e) = ext.as_ref() { v2::store_ext(&info, e)?; }
    if r.applied > 0 || r.regressed {
        msg!("settle +{} tick {} rem {}{}", r.applied, acc.tick, r.remaining, if r.regressed { " clock-regression" } else { "" });
    }
    if require_current {
        require!(r.remaining == 0, AstrixError::CatchUpRequired);
        if let Some(e) = ext.as_ref() { require!(e.seed_origin != seed_origin::AWAITING_VRF, AstrixError::WorldNotReady); }
    }
    Ok((ext, r))
}

/// Player actions: settle, then require the world to be fully caught up so the
/// action happens at the present world tick. If a long outage left more than
/// MAX_SETTLE_STEPS due, the client calls `settle` (permissionless) until caught up.
fn settle_for_action(acc: &mut Account<Settlement>) -> Result<(Option<WorldExt>, Settled)> {
    settle_account(acc, true)
}

fn journal(e: &mut WorldExt, world: &Pubkey, r: VrfRecord) {
    let r = v2::journal_append(e, world, r);
    emit!(JournalEvent {
        world: *world, seq: r.seq, kind: r.kind, request_id: r.request_id, prospect_id: r.prospect_id, outcome: r.outcome,
        find: r.find, world_tick: r.world_tick, ts: r.ts, randomness: r.randomness, state_epoch: e.state_epoch, journal_hash: e.journal_hash,
    });
}

/// Opens the single outstanding VRF request of a world and returns its ticket.
fn open_request(e: &mut WorldExt, world: &Pubkey, kind: u8, prospect_id: u32, clock: &Clock, client_seed: u8) -> VrfTicket {
    let request_id = e.next_request_id;
    e.next_request_id = e.next_request_id.saturating_add(1);
    let h = solana_sha256_hasher::hashv(&[b"astrix-vrf-nonce", world.as_ref(), &request_id.to_le_bytes(), &clock.slot.to_le_bytes(),
        &clock.unix_timestamp.to_le_bytes(), &[client_seed]]).to_bytes();
    let nonce = u64::from_le_bytes(h[0..8].try_into().unwrap());
    e.pending = VrfPending { request_id, nonce, prospect_id, kind, _pad: [0; 3], requested_ts: clock.unix_timestamp, requested_slot: clock.slot };
    VrfTicket { world: *world, request_id, prospect_id, nonce, kind }
}

/// MagicBlock VRF request whose callback is `vrf_callback(randomness, ticket)`.
/// caller_seed = sha256("astrix-vrf-v2" || borsh(ticket)) so auditors can rebuild it.
fn vrf_request_ix(payer: Pubkey, oracle_queue: Pubkey, t: &VrfTicket) -> Result<Instruction> {
    let mut args = Vec::with_capacity(VrfTicket::INIT_SPACE);
    t.serialize(&mut args).map_err(|_| error!(AstrixError::VrfTicketMismatch))?;
    let caller_seed = solana_sha256_hasher::hashv(&[b"astrix-vrf-v2", &args]).to_bytes();
    let params = RequestRandomnessParams {
        payer,
        oracle_queue,
        callback_program_id: crate::ID,
        callback_discriminator: crate::instruction::VrfCallback::DISCRIMINATOR.to_vec(),
        caller_seed,
        accounts_metas: Some(vec![SerializableAccountMeta { pubkey: t.world, is_signer: false, is_writable: true }]),
        callback_args: Some(args),
        ..Default::default()
    };
    Ok(create_request_randomness_ix_const(params, PROGRAM_IDENTITY))
}

/// Prospect outcome (unchanged mapping). Uniform 1..=100 from the first 8 random
/// bytes (bias < 2^-57): 1-55 nothing, 56-90 ore vein (+6 ore), 91-100 crystal.
fn apply_prospect(s: &mut Settlement, randomness: &[u8; 32]) -> (u8, u8) {
    let raw = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
    let roll = (raw % 100) as u8 + 1;
    if roll > 90 {
        s.last_find = 2;
        s.rare_finds += 1;
        s.stock[res::CRYSTAL] = s.stock[res::CRYSTAL].saturating_add(1);
    } else if roll > 55 {
        s.last_find = 1;
        s.stock[res::ORE] = s.stock[res::ORE].saturating_add(6).min(STOCK_CAP);
    } else {
        s.last_find = 0;
    }
    s.last_roll = roll;
    (roll, s.last_find)
}

/// Per-world tail state for a fresh world in a slot. Request ids, the journal
/// and state_epoch continue (never reused); everything else starts over.
fn reset_ext_for_new_world(e: &mut WorldExt, now: i64, origin: u8) {
    e.seed_origin = origin;
    e.pending = VrfPending::default();
    e.genesis_commitment = [0; 32];
    e.genesis_randomness = [0; 32];
    e.epoch_start = now;
    e.max_clock_ts = e.max_clock_ts.max(now);
}

#[event]
pub struct JournalEvent {
    pub world: Pubkey,
    pub seq: u64,
    pub kind: u8,
    pub request_id: u64,
    pub prospect_id: u32,
    pub outcome: u8,
    pub find: u8,
    pub world_tick: u64,
    pub ts: i64,
    pub randomness: [u8; 32],
    pub state_epoch: u32,
    pub journal_hash: [u8; 32],
}

fn leading_zero_bits(d: &[u8; 32]) -> u32 {
    let mut n = 0;
    for b in d.iter() {
        if *b == 0 { n += 8; continue; }
        n += b.leading_zeros();
        break;
    }
    n
}

fn clear_world(s: &mut Account<Settlement>, owner: Pubkey, seed: u32, now: i64) {
    s.owner = owner;
    s.world_seed = seed;
    s.generator = 2;
    s.tick = 0;
    s.last_tick_ts = now;
    s.tick_interval_s = 2;
    s.stock = [0; res::COUNT];
    s.plots = [EMPTY_PLOT; PLOTS];
    s.population = 0;
    s.sawmill = false;
    s.prospect_pending = false;
    s.prospects = 0;
    s.last_find = 0;
    s.last_roll = 0;
    s.rare_finds = 0;
    s.session_key = Pubkey::default();
    s.session_expires = 0;
    s.session_budget = 0;
    s.actions = 0;
}

/// Owner always; session key only while unexpired and within its action budget.
fn authorise(s: &mut Account<Settlement>, signer: &Pubkey) -> Result<()> {
    // `actions` packs (window start tick << 32 | actions in window). The window is
    // simulation time, so limits follow the world's own clock.
    let window = s.tick / RATE_WINDOW_TICKS;
    let (w, n) = ((s.actions >> 32) as u64, (s.actions & 0xffff_ffff) as u32);
    let n = if w == window { n } else { 0 };
    require!(n < RATE_MAX_ACTIONS, AstrixError::RateLimited);
    s.actions = ((window & 0xffff_ffff) << 32) | (n as u64 + 1);
    if *signer == s.owner { return Ok(()); }
    require!(*signer == s.session_key && s.session_key != Pubkey::default(), AstrixError::Unauthorised);
    require!(Clock::get()?.unix_timestamp < s.session_expires, AstrixError::SessionExpired);
    require!(s.session_budget > 0, AstrixError::SessionBudgetExhausted);
    s.session_budget -= 1;
    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct Settlement {
    pub owner: Pubkey,
    pub world_seed: u32,
    pub generator: u8,
    pub bump: u8,
    pub tick: u64,
    pub last_tick_ts: i64,
    pub tick_interval_s: i64,
    pub stock: [u32; res::COUNT],
    pub plots: [u64; PLOTS],
    pub population: u16,
    pub sawmill: bool,
    pub prospect_pending: bool,
    pub prospects: u32,
    pub last_find: u8,
    pub last_roll: u8,
    pub rare_finds: u32,
    pub session_key: Pubkey,
    pub session_expires: i64,
    pub session_budget: u32,
    pub actions: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Registry {
    pub admin: Pubkey,
    pub slots: u8,
    pub bump: u8,
    pub claims: u32,
    pub last_claim_ts: i64,
    pub claim_cooldown_s: i64,
}

#[derive(Accounts)]
pub struct InitRegistry<'info> {
    #[account(init, payer = admin, space = 8 + Registry::INIT_SPACE, seeds = [REGISTRY_SEED, admin.key().as_ref()], bump)]
    pub registry: Account<'info, Registry>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct InitSlot<'info> {
    #[account(init, payer = admin, space = V2_LEN, seeds = [WORLD_SLOT_SEED, admin.key().as_ref(), &[index]], bump)]
    pub slot: Account<'info, Settlement>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateRegistry<'info> {
    pub payer: Signer<'info>,
    /// CHECK: the admin's registry PDA
    #[account(mut, del, seeds = [REGISTRY_SEED, payer.key().as_ref()], bump)]
    pub pda: UncheckedAccount<'info>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(index: u8)]
pub struct DelegateSlot<'info> {
    pub payer: Signer<'info>,
    /// CHECK: one of the admin's world slot PDAs
    #[account(mut, del, seeds = [WORLD_SLOT_SEED, payer.key().as_ref(), &[index]], bump)]
    pub pda: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct ClaimWorld<'info> {
    #[account(mut, seeds = [REGISTRY_SEED, registry.admin.as_ref()], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
    #[account(mut, seeds = [WORLD_SLOT_SEED, registry.admin.as_ref(), &[index]], bump = slot.bump)]
    pub slot: Account<'info, Settlement>,
    #[account(mut, seeds = [PASSPORT_SEED, slot.key().as_ref()], bump = passport.bump)]
    pub passport: Account<'info, Passport>,
    pub guest: Signer<'info>,
}

#[vrf]
#[derive(Accounts)]
#[instruction(index: u8)]
pub struct ClaimWorldVrf<'info> {
    #[account(mut, seeds = [REGISTRY_SEED, registry.admin.as_ref()], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
    #[account(mut, seeds = [WORLD_SLOT_SEED, registry.admin.as_ref(), &[index]], bump = slot.bump)]
    pub slot: Account<'info, Settlement>,
    #[account(mut, seeds = [PASSPORT_SEED, slot.key().as_ref()], bump = passport.bump)]
    pub passport: Account<'info, Passport>,
    /// Claimant; also the VRF request payer (the ER queue charges no fee).
    #[account(mut)]
    pub guest: Signer<'info>,
    /// CHECK: MagicBlock oracle queue (base or ephemeral)
    #[account(mut, constraint =
        oracle_queue.key() == mbvrf::consts::DEFAULT_QUEUE ||
        oracle_queue.key() == mbvrf::consts::DEFAULT_EPHEMERAL_QUEUE ||
        oracle_queue.key() == mbvrf::consts::DEFAULT_TEST_QUEUE ||
        oracle_queue.key() == mbvrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct MigrateWorld<'info> {
    #[account(mut)]
    pub world: Account<'info, Settlement>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestUndelegationCtx<'info> {
    /// Delegation rent payer recorded by DLP (the admin / settlement owner).
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: one of our delegated PDAs; address checked against seeds in the handler, owner checked by DLP
    #[account(mut)]
    pub delegated: UncheckedAccount<'info>,
    /// CHECK: this program
    #[account(address = crate::ID)]
    pub owner_program: UncheckedAccount<'info>,
    /// CHECK: DLP undelegation request PDA (validated by DLP)
    #[account(mut)]
    pub undelegation_request: UncheckedAccount<'info>,
    /// CHECK: DLP delegation record PDA (validated by DLP)
    pub delegation_record: UncheckedAccount<'info>,
    /// CHECK: DLP delegation metadata PDA (validated by DLP)
    #[account(mut)]
    pub delegation_metadata: UncheckedAccount<'info>,
    /// CHECK: MagicBlock delegation program
    #[account(address = DLP_ID)]
    pub delegation_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RollbackUndelegationCtx<'info> {
    /// Delegation rent payer recorded by DLP (receives the closed DLP PDAs' rent).
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: one of our delegated PDAs; address checked against seeds in the handler, owner checked by DLP
    #[account(mut)]
    pub delegated: UncheckedAccount<'info>,
    /// CHECK: this program
    #[account(address = crate::ID)]
    pub owner_program: UncheckedAccount<'info>,
    /// CHECK: DLP undelegation request PDA (validated by DLP)
    #[account(mut)]
    pub undelegation_request: UncheckedAccount<'info>,
    /// CHECK: DLP delegation record PDA (validated by DLP)
    #[account(mut)]
    pub delegation_record: UncheckedAccount<'info>,
    /// CHECK: DLP delegation metadata PDA (validated by DLP)
    #[account(mut)]
    pub delegation_metadata: UncheckedAccount<'info>,
    /// CHECK: DLP commit state PDA (validated by DLP; usually empty)
    #[account(mut)]
    pub commit_state: UncheckedAccount<'info>,
    /// CHECK: DLP commit record PDA (validated by DLP; usually empty)
    #[account(mut)]
    pub commit_record: UncheckedAccount<'info>,
    /// CHECK: receives the rent of a pending commit's PDAs (the validator identity in DLP's record)
    #[account(mut)]
    pub commit_reimbursement: UncheckedAccount<'info>,
    /// CHECK: MagicBlock delegation program
    #[account(address = DLP_ID)]
    pub delegation_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ReleaseWorld<'info> {
    #[account(mut)]
    pub slot: Account<'info, Settlement>,
    #[account(mut, seeds = [PASSPORT_SEED, slot.key().as_ref()], bump = passport.bump)]
    pub passport: Account<'info, Passport>,
    pub owner: Signer<'info>,
}

/// World identity record: survives browsers, devices, wallets and sessions.
#[account]
#[derive(InitSpace)]
pub struct Passport {
    pub version: u8,
    pub bump: u8,
    pub identity_kind: u8,
    pub checkpoint_due: bool,
    pub world: Pubkey,
    pub owner: Pubkey,
    pub created_ts: i64,
    pub transfers: u32,
    pub checkpoints: u32,
    pub last_checkpoint_tick: u64,
    pub last_checkpoint_ts: i64,
    /// sha256 of the world account bytes at the last checkpoint.
    pub state_hash: [u8; 32],
    /// Reserved for members, permissions, governance and agent policy (v2+),
    /// so those features do not need another layout migration.
    pub reserved: [u8; 192],
}

#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub admin: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct InitPassport<'info> {
    /// CHECK: the admin's world slot PDA (address checked by seeds; may be delegated, so not deserialised)
    #[account(seeds = [WORLD_SLOT_SEED, admin.key().as_ref(), &[index]], bump)]
    pub world: UncheckedAccount<'info>,
    #[account(init, payer = admin, space = 8 + Passport::INIT_SPACE, seeds = [PASSPORT_SEED, world.key().as_ref()], bump)]
    pub passport: Account<'info, Passport>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(index: u8)]
pub struct DelegatePassport<'info> {
    pub payer: Signer<'info>,
    /// CHECK: the admin's world slot PDA (address checked by seeds)
    #[account(seeds = [WORLD_SLOT_SEED, payer.key().as_ref(), &[index]], bump)]
    pub world: UncheckedAccount<'info>,
    /// CHECK: the passport PDA
    #[account(mut, del, seeds = [PASSPORT_SEED, world.key().as_ref()], bump)]
    pub pda: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct LinkPassport<'info> {
    pub world: Account<'info, Settlement>,
    #[account(mut, seeds = [PASSPORT_SEED, world.key().as_ref()], bump = passport.bump)]
    pub passport: Account<'info, Passport>,
}

#[derive(Accounts)]
pub struct TransferWorld<'info> {
    #[account(mut)]
    pub world: Account<'info, Settlement>,
    #[account(mut, seeds = [PASSPORT_SEED, world.key().as_ref()], bump = passport.bump)]
    pub passport: Account<'info, Passport>,
    pub owner: Signer<'info>,
    pub new_owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Checkpoint<'info> {
    #[account(mut)]
    pub world: Account<'info, Settlement>,
    #[account(mut, seeds = [PASSPORT_SEED, world.key().as_ref()], bump = passport.bump)]
    pub passport: Account<'info, Passport>,
    #[account(mut, seeds = [TREASURY_SEED, treasury.admin.as_ref()], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    /// CHECK: validator-scoped MagicBlock fee vault, checked by the magic program
    #[account(mut)]
    pub magic_fee_vault: UncheckedAccount<'info>,
    /// CHECK: MagicBlock magic context
    #[account(mut, address = ephemeral_rollups_sdk::consts::MAGIC_CONTEXT_ID)]
    pub magic_context: UncheckedAccount<'info>,
    /// CHECK: MagicBlock magic program
    #[account(address = ephemeral_rollups_sdk::consts::MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(init, payer = admin, space = 8 + Treasury::INIT_SPACE, seeds = [TREASURY_SEED, admin.key().as_ref()], bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateTreasury<'info> {
    pub payer: Signer<'info>,
    /// CHECK: the treasury PDA
    #[account(mut, del, seeds = [TREASURY_SEED, payer.key().as_ref()], bump)]
    pub pda: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ScheduleWorldTicks<'info> {
    /// CHECK: MagicBlock magic program
    pub magic_program: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [REGISTRY_SEED, payer.key().as_ref()], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
    /// CHECK: this program
    pub program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ScheduleCheckpoints<'info> {
    /// CHECK: MagicBlock magic program
    #[account(address = ephemeral_rollups_sdk::consts::MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [REGISTRY_SEED, payer.key().as_ref()], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
    #[account(mut, seeds = [TREASURY_SEED, payer.key().as_ref()], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    /// CHECK: validator-scoped MagicBlock fee vault, checked by the magic program at run time
    #[account(mut)]
    pub magic_fee_vault: UncheckedAccount<'info>,
    /// CHECK: MagicBlock magic context
    #[account(mut, address = ephemeral_rollups_sdk::consts::MAGIC_CONTEXT_ID)]
    pub magic_context: UncheckedAccount<'info>,
    /// CHECK: this program
    pub program: UncheckedAccount<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitWorlds<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [REGISTRY_SEED, payer.key().as_ref()], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = owner, space = V2_LEN,
        seeds = [SETTLEMENT_SEED, owner.key().as_ref()], bump)]
    pub settlement: Account<'info, Settlement>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    pub payer: Signer<'info>,
    /// CHECK: the settlement PDA of `payer`, delegated to the ER
    #[account(mut, del, seeds = [SETTLEMENT_SEED, payer.key().as_ref()], bump)]
    pub pda: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    #[account(mut, has_one = owner)]
    pub settlement: Account<'info, Settlement>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct PlayerAction<'info> {
    /// Any settlement or world slot of this program (owner + discriminator checked
    /// by Anchor); who may act is decided by `authorise`.
    #[account(mut)]
    pub settlement: Account<'info, Settlement>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(mut)]
    pub settlement: Account<'info, Settlement>,
}

#[derive(Accounts)]
pub struct ScheduleTicks<'info> {
    /// CHECK: MagicBlock magic program, used for the crank CPI
    pub magic_program: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [SETTLEMENT_SEED, payer.key().as_ref()], bump = settlement.bump)]
    pub settlement: Account<'info, Settlement>,
    /// CHECK: the same settlement account, passed writable to the CPI
    #[account(mut, address = settlement.key())]
    pub settlement_info: UncheckedAccount<'info>,
    /// CHECK: this program
    pub program: UncheckedAccount<'info>,
}

#[vrf]
#[derive(Accounts)]
pub struct Prospect<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub settlement: Account<'info, Settlement>,
    /// CHECK: MagicBlock oracle queue (base or ephemeral)
    #[account(mut, constraint =
        oracle_queue.key() == mbvrf::consts::DEFAULT_QUEUE ||
        oracle_queue.key() == mbvrf::consts::DEFAULT_EPHEMERAL_QUEUE ||
        oracle_queue.key() == mbvrf::consts::DEFAULT_TEST_QUEUE ||
        oracle_queue.key() == mbvrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ProspectCallback<'info> {
    /// The VRF program's scoped identity for this program; only it can deliver randomness.
    #[account(address = VRF_CALLBACK_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,
    #[account(mut)]
    pub settlement: Account<'info, Settlement>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitSettlement<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SETTLEMENT_SEED, payer.key().as_ref()], bump = settlement.bump)]
    pub settlement: Account<'info, Settlement>,
}

#[error_code]
pub enum AstrixError {
    #[msg("unsupported terrain generator")] UnsupportedGenerator,
    #[msg("tick interval too short")] InvalidInterval,
    #[msg("signer is neither the owner nor the active session key")] Unauthorised,
    #[msg("session key expired")] SessionExpired,
    #[msg("session action budget exhausted")] SessionBudgetExhausted,
    #[msg("only the owner may do this")] NotOwner,
    #[msg("resource cannot be harvested")] InvalidResource,
    #[msg("invalid amount")] InvalidAmount,
    #[msg("invalid plot")] InvalidPlot,
    #[msg("plot already planted")] PlotOccupied,
    #[msg("not enough resources")] InsufficientResources,
    #[msg("already built")] AlreadyBuilt,
    #[msg("a prospect is already waiting for randomness")] ProspectPending,
    #[msg("no prospect is pending")] NoProspect,
    #[msg("settlement is not initialised")] NotInitialised,
    #[msg("invalid world slot")] InvalidSlot,
    #[msg("world slot already has an owner")] SlotTaken,
    #[msg("too many worlds created recently; try again shortly")] ClaimCooldown,
    #[msg("proof of work too weak")] ProofOfWork,
    #[msg("too many actions in this world right now")] RateLimited,
    #[msg("unknown identity kind")] InvalidIdentity,
    // ----- layout v2 (append only: the Game client maps codes 0x1770 + index) -----
    #[msg("this world must be migrated to layout v2 first")] MigrationRequired,
    #[msg("world is catching up after an outage; call settle until caught up")] CatchUpRequired,
    #[msg("VRF result does not match the outstanding request (late or foreign)")] VrfTicketMismatch,
    #[msg("the VRF request has not timed out yet")] VrfNotTimedOut,
    #[msg("world is waiting for its genesis randomness")] WorldNotReady,
    #[msg("legacy VRF callback rejected for a layout v2 world")] LegacyCallbackRejected,
    #[msg("unknown account kind")] InvalidKind,
}
