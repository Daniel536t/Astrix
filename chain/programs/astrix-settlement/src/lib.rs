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
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, vrf, vrf_callback};
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

pub const SETTLEMENT_SEED: &[u8] = b"settlement";
const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);

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
pub const FOOD_PERIOD: u64 = 5;
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
        let now = Clock::get()?.unix_timestamp;
        if now < s.last_tick_ts + s.tick_interval_s {
            return Ok(());
        }
        s.last_tick_ts = now;
        s.tick += 1;
        // Crops: ripe plots are harvested into the stockpile and replanted if a seed is left.
        for p in 0..PLOTS {
            let planted = s.plots[p];
            if planted == EMPTY_PLOT || s.tick < planted + CROP_GROWTH_TICKS { continue; }
            s.stock[res::FOOD] = s.stock[res::FOOD].saturating_add(CROP_FOOD).min(STOCK_CAP);
            s.stock[res::FIBER] = s.stock[res::FIBER].saturating_add(CROP_FIBER).min(STOCK_CAP);
            if s.stock[res::SEED] >= 1 { s.stock[res::SEED] -= 1; s.plots[p] = s.tick; } else { s.plots[p] = EMPTY_PLOT; }
            // Fiber from the harvest is also seed stock: every 2 fiber become 1 seed.
            if s.stock[res::FIBER] >= 2 && s.stock[res::SEED] < 20 {
                s.stock[res::FIBER] -= 2;
                s.stock[res::SEED] += 1;
            }
        }
        // Production: the sawmill converts wood into planks.
        if s.sawmill && s.stock[res::WOOD] >= 2 {
            s.stock[res::WOOD] -= 2;
            s.stock[res::PLANKS] = s.stock[res::PLANKS].saturating_add(1).min(STOCK_CAP);
        }
        // Consumption: settlers eat; the population grows when food is plentiful.
        if s.tick % FOOD_PERIOD == 0 {
            let need = s.population as u32;
            if s.stock[res::FOOD] >= need { s.stock[res::FOOD] -= need; } else { s.stock[res::FOOD] = 0; }
            if s.stock[res::FOOD] >= 30 && s.population < 10 { s.population += 1; }
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
        let roll = mbvrf::rnd::random_u8_with_range(&randomness, 1, 100);
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

/// Owner always; session key only while unexpired and within its action budget.
fn authorise(s: &mut Account<Settlement>, signer: &Pubkey) -> Result<()> {
    s.actions = s.actions.saturating_add(1);
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
    #[account(mut, seeds = [SETTLEMENT_SEED, owner.key().as_ref()], bump = settlement.bump, has_one = owner)]
    pub settlement: Account<'info, Settlement>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct PlayerAction<'info> {
    #[account(mut, seeds = [SETTLEMENT_SEED, settlement.owner.as_ref()], bump = settlement.bump)]
    pub settlement: Account<'info, Settlement>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(mut, seeds = [SETTLEMENT_SEED, settlement.owner.as_ref()], bump = settlement.bump)]
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
    #[account(mut, seeds = [SETTLEMENT_SEED, settlement.owner.as_ref()], bump = settlement.bump)]
    pub settlement: Account<'info, Settlement>,
    /// CHECK: MagicBlock oracle queue (base or ephemeral)
    #[account(mut, constraint =
        oracle_queue.key() == mbvrf::consts::DEFAULT_QUEUE ||
        oracle_queue.key() == mbvrf::consts::DEFAULT_EPHEMERAL_QUEUE ||
        oracle_queue.key() == mbvrf::consts::DEFAULT_TEST_QUEUE ||
        oracle_queue.key() == mbvrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct ProspectCallback<'info> {
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
}
