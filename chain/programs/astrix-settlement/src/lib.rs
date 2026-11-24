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
//! Time: `tick` is permissionless but gated by the rollup clock, so it can only
//! advance the settlement at most once per `tick_interval_s`. A MagicBlock crank
//! calls it on a schedule; anyone calling it early is a no-op, so there is no
//! way to speed up time or apply an effect twice.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
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
        msg!("ASTrix settlement founded for world {} (generator v{})", world_seed, generator);
        Ok(())
    }

    /// Base layer: hand the settlement to an Ephemeral Rollup validator.
    pub fn delegate(ctx: Context<DelegateInput>) -> Result<()> {
        // Never delegate an account that is not an initialised settlement of this program.
        require_keys_eq!(*ctx.accounts.pda.owner, crate::ID, AstrixError::NotInitialised);
        require!(ctx.accounts.pda.data_len() == 8 + Settlement::INIT_SPACE, AstrixError::NotInitialised);
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
        let s = &mut ctx.accounts.settlement;
        s.session_key = session_key;
        s.session_expires = expires_at;
        s.session_budget = budget;
        msg!("session {} until {} for {} actions", session_key, expires_at, budget);
        Ok(())
    }

    /// Owner only: end the current session immediately.
    pub fn revoke_session(ctx: Context<OwnerOnly>) -> Result<()> {
        let s = &mut ctx.accounts.settlement;
        s.session_key = Pubkey::default();
        s.session_expires = 0;
        s.session_budget = 0;
        Ok(())
    }

    /// Gather a resource into the stockpile (owner or session key).
    pub fn harvest(ctx: Context<PlayerAction>, resource: u8, amount: u32) -> Result<()> {
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

    /// Advance settlement time by one tick. Permissionless; clock-gated so that
    /// early or repeated calls are no-ops. Executed by the MagicBlock crank.
    pub fn tick(ctx: Context<Tick>) -> Result<()> {
        let s = &mut ctx.accounts.settlement;
        if s.owner == Pubkey::default() { return Ok(()); } // unclaimed world slot
        let now = Clock::get()?.unix_timestamp;
        if now < s.last_tick_ts + s.tick_interval_s {
            return Ok(());
        }
        s.last_tick_ts = now;
        s.tick += 1;
        // Crops: ripe plots are harvested into the stockpile and replanted from their own seed.
        for p in 0..PLOTS {
            let planted = s.plots[p];
            if planted == EMPTY_PLOT || s.tick < planted + CROP_GROWTH_TICKS { continue; }
            s.stock[res::FOOD] = s.stock[res::FOOD].saturating_add(CROP_FOOD).min(STOCK_CAP);
            s.stock[res::FIBER] = s.stock[res::FIBER].saturating_add(CROP_FIBER).min(STOCK_CAP);
            // Each harvest also returns one seed, so the farm can expand into more plots.
            s.stock[res::SEED] = s.stock[res::SEED].saturating_add(1).min(STOCK_CAP);
            s.plots[p] = s.tick;
        }
        // Production: the sawmill converts wood into planks.
        if s.sawmill && s.stock[res::WOOD] >= 2 {
            s.stock[res::WOOD] -= 2;
            s.stock[res::PLANKS] = s.stock[res::PLANKS].saturating_add(1).min(STOCK_CAP);
        }
        // Consumption: every FOOD_PERIOD ticks each settler eats one food. A settler
        // arrives only when there is a 20-tick food reserve for everyone, and one
        // leaves when the stockpile cannot feed them.
        if s.tick % FOOD_PERIOD == 0 {
            let need = s.population as u32;
            if s.stock[res::FOOD] >= need {
                s.stock[res::FOOD] -= need;
                let reserve = need.saturating_add(1) * 4 * 5;
                if s.tick % (FOOD_PERIOD * 6) == 0 && s.stock[res::FOOD] >= reserve && s.population < 10 { s.population += 1; }
            } else {
                s.stock[res::FOOD] = 0;
                if s.population > 1 { s.population -= 1; }
            }
        }
        msg!("tick {} food {} planks {} pop {}", s.tick, s.stock[res::FOOD], s.stock[res::PLANKS], s.population);
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
    pub fn prospect(ctx: Context<Prospect>, client_seed: u8) -> Result<()> {
        let signer = ctx.accounts.payer.key();
        authorise(&mut ctx.accounts.settlement, &signer)?;
        let s = &mut ctx.accounts.settlement;
        require!(!s.prospect_pending, AstrixError::ProspectPending);
        require!(s.stock[res::FOOD] >= PROSPECT_COST_FOOD, AstrixError::InsufficientResources);
        s.stock[res::FOOD] -= PROSPECT_COST_FOOD;
        s.prospect_pending = true;
        s.prospects += 1;
        let settlement_key = s.key();
        s.exit(&crate::ID)?;
        let params = RequestRandomnessParams {
            payer: signer,
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: crate::instruction::ProspectCallback::DISCRIMINATOR.to_vec(),
            caller_seed: [client_seed; 32],
            accounts_metas: Some(vec![SerializableAccountMeta { pubkey: settlement_key, is_signer: false, is_writable: true }]),
            ..Default::default()
        };
        let ix = create_request_randomness_ix_const(params, PROGRAM_IDENTITY);
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// VRF callback: decide what the prospect found. Only the VRF program identity can call it.
    pub fn prospect_callback(ctx: Context<ProspectCallback>, randomness: [u8; 32]) -> Result<()> {
        let s = &mut ctx.accounts.settlement;
        require!(s.prospect_pending, AstrixError::NoProspect);
        s.prospect_pending = false;
        // Uniform 1..=100 from the first 8 random bytes (bias < 2^-57). The SDK
        // range helper exhausted the callback's compute budget on devnet.
        let raw = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
        let roll = (raw % 100) as u8 + 1;
        // 1-55 nothing, 56-90 ore vein (+6 ore), 91-100 rare crystal (+1 crystal).
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
        msg!("prospect roll {} find {}", roll, s.last_find);
        Ok(())
    }

    /// Owner only: clear a prospect whose randomness never arrived (the oracle
    /// gives up after its retries). The food spent is not refunded.
    pub fn cancel_prospect(ctx: Context<OwnerOnly>) -> Result<()> {
        ctx.accounts.settlement.prospect_pending = false;
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
        let s = &mut ctx.accounts.slot;
        clear_world(s, Pubkey::default(), 0, Clock::get()?.unix_timestamp);
        s.bump = ctx.bumps.slot;
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
        msg!("world slot {} claimed by {} with seed {}", index, ctx.accounts.guest.key(), seed);
        Ok(())
    }

    /// ER, owner only: delete your own world and return the slot to the pool.
    /// Claimed worlds are never recycled by the operator, however long inactive.
    pub fn release_world(ctx: Context<ReleaseWorld>) -> Result<()> {
        require_keys_eq!(ctx.accounts.slot.owner, ctx.accounts.owner.key(), AstrixError::NotOwner);
        clear_world(&mut ctx.accounts.slot, Pubkey::default(), 0, Clock::get()?.unix_timestamp);
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
    #[account(init, payer = admin, space = 8 + Settlement::INIT_SPACE, seeds = [WORLD_SLOT_SEED, admin.key().as_ref(), &[index]], bump)]
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
    #[account(init, payer = owner, space = 8 + Settlement::INIT_SPACE,
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
}
