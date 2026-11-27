//! Layout v2: world clock, VRF request binding and the on-chain event journal.
//!
//! A v2 world account is the unchanged v1 `Settlement` (240 bytes, same field
//! offsets, so older readers such as the Game client and the previous program
//! binary keep working) followed by a fixed-size `WorldExt` tail at offset 240.
//! v1 accounts (no tail) remain fully readable and keep ticking; they only lack
//! the features that need the tail (VRF v2, journal, genesis status).
//!
//! Header field mapping (owner-facing names -> storage):
//!   world_tick      = Settlement.tick          (offset 46, u64)
//!   last_settled_ts = Settlement.last_tick_ts  (offset 54, i64)
//!   epoch_start     = WorldExt.epoch_start     (always last_settled_ts - world_tick * interval)
//!   state_epoch     = WorldExt.state_epoch     (+1 on every escape-hatch rollback)
use anchor_lang::prelude::*;

use crate::{res, Settlement, CROP_FIBER, CROP_FOOD, CROP_GROWTH_TICKS, EMPTY_PLOT, FOOD_PERIOD, PLOTS, STOCK_CAP};

/// Byte length of a v1 world account (8-byte discriminator + Settlement).
pub const V1_LEN: usize = 8 + Settlement::INIT_SPACE;
/// Byte length of a v2 world account.
pub const V2_LEN: usize = V1_LEN + WorldExt::INIT_SPACE;
pub const EXT_MAGIC: [u8; 4] = *b"AXv2";
pub const LAYOUT_V2: u8 = 2;
/// Rules version of the simulation step. v2 keeps the v1 step unchanged; only
/// time accounting changed (no lost ticks, bounded catch-up).
pub const RULES_VERSION: u8 = 2;

/// Maximum simulation steps one `settle` call applies (300 steps = 10 minutes of
/// world time). Measured locally: ~6.5k CU fixed + ~150 CU per step, so a capped
/// call stays near 52k CU and 16 capped worlds in one crank stay under the
/// 1.4 M CU transaction limit (PHASE2 report). Larger backlogs drain over several calls.
pub const MAX_SETTLE_STEPS: u64 = 300;
/// The VRF callback settles best-effort with a small cap: the oracle gives the
/// whole fulfilment (proof check + callback) only 300k CU.
pub const CALLBACK_SETTLE_STEPS: u64 = 32;
/// A VRF request may be cancelled (or a genesis re-requested) only after this
/// many seconds: MagicBlock purges unfulfilled requests after 120 s (121-124 s
/// measured, 4-second timestamp units) plus margin.
pub const VRF_TIMEOUT_S: i64 = 130;

pub mod seed_origin {
    /// Seed chosen or derivable by the creator (all pre-v2 worlds, legacy claim): unranked.
    pub const LEGACY_UNRANKED: u8 = 0;
    /// Seed revealed by MagicBlock VRF after the creator committed the configuration: ranked.
    pub const VRF_RANKED: u8 = 1;
    /// Configuration committed, waiting for the VRF genesis callback. No play, clock not started.
    pub const AWAITING_VRF: u8 = 2;
}

pub mod vrf_kind {
    pub const NONE: u8 = 0;
    pub const PROSPECT: u8 = 1;
    pub const GENESIS: u8 = 2;
}

/// Journal record kinds (hash-chained, see `journal_append`).
pub mod rec {
    pub const PROSPECT_RESULT: u8 = 1;
    pub const GENESIS_VRF: u8 = 2;
    pub const GENESIS_LEGACY: u8 = 3;
    pub const VRF_CANCELLED: u8 = 4;
    pub const ROLLBACK: u8 = 5;
    pub const MIGRATED: u8 = 6;
    pub const RELEASED: u8 = 7;
}

/// The outstanding VRF request of a world (at most one at a time).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug, InitSpace)]
pub struct VrfPending {
    pub request_id: u64,
    pub nonce: u64,
    pub prospect_id: u32,
    pub kind: u8,
    pub _pad: [u8; 3],
    pub requested_ts: i64,
    pub requested_slot: u64,
}

/// Passed through MagicBlock VRF as `callback_args` and checked in the callback.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug, InitSpace)]
pub struct VrfTicket {
    pub world: Pubkey,
    pub request_id: u64,
    pub prospect_id: u32,
    pub nonce: u64,
    pub kind: u8,
}

/// One accepted (or cancelled) randomness outcome, kept in a small ring so an
/// off-chain journal that missed a transaction log can still recover it.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug, InitSpace)]
pub struct VrfRecord {
    pub seq: u64,
    pub request_id: u64,
    pub prospect_id: u32,
    pub kind: u8,
    pub outcome: u8,
    pub find: u8,
    pub state_epoch_lo: u8,
    pub world_tick: u64,
    pub ts: i64,
    pub randomness: [u8; 32],
}

pub const RECENT: usize = 4;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub struct WorldExt {
    pub magic: [u8; 4],
    pub layout_version: u8,
    pub rules_version: u8,
    pub seed_origin: u8,
    pub flags: u8,
    pub state_epoch: u32,
    pub epoch_start: i64,
    /// Highest ER clock value any settle has seen (regression detection).
    pub max_clock_ts: i64,
    pub clock_regressions: u32,
    /// Times epoch_start had to be re-derived because something other than
    /// settle moved the clock fields (e.g. a rolled-back older binary ticking).
    pub reanchors: u32,
    pub last_settle_slot: u64,
    pub settled_steps_total: u64,
    pub migrated_ts: i64,
    pub migrated_from_tick: u64,
    pub next_request_id: u64,
    pub pending: VrfPending,
    pub journal_seq: u64,
    pub journal_hash: [u8; 32],
    pub recent: [VrfRecord; RECENT],
    pub genesis_commitment: [u8; 32],
    pub genesis_randomness: [u8; 32],
    /// Reserved for phase 3 (evidence-validated commands) without another realloc.
    pub reserved: [u8; 128],
}

impl Default for WorldExt {
    fn default() -> Self {
        WorldExt {
            magic: EXT_MAGIC, layout_version: LAYOUT_V2, rules_version: RULES_VERSION, seed_origin: seed_origin::LEGACY_UNRANKED,
            flags: 0, state_epoch: 0, epoch_start: 0, max_clock_ts: 0, clock_regressions: 0, reanchors: 0, last_settle_slot: 0,
            settled_steps_total: 0, migrated_ts: 0, migrated_from_tick: 0, next_request_id: 1, pending: VrfPending::default(),
            journal_seq: 0, journal_hash: [0; 32], recent: [VrfRecord::default(); RECENT], genesis_commitment: [0; 32],
            genesis_randomness: [0; 32], reserved: [0; 128],
        }
    }
}

/// Reads the v2 tail; `None` for a v1 (unmigrated) account.
pub fn load_ext(info: &AccountInfo) -> Result<Option<WorldExt>> {
    let data = info.try_borrow_data()?;
    if data.len() < V2_LEN || data[V1_LEN..V1_LEN + 4] != EXT_MAGIC { return Ok(None); }
    let mut slice: &[u8] = &data[V1_LEN..V2_LEN];
    Ok(Some(WorldExt::deserialize(&mut slice).map_err(|_| error!(crate::AstrixError::NotInitialised))?))
}

pub fn store_ext(info: &AccountInfo, ext: &WorldExt) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    require!(data.len() >= V2_LEN, crate::AstrixError::MigrationRequired);
    let mut dst: &mut [u8] = &mut data[V1_LEN..V2_LEN];
    ext.serialize(&mut dst).map_err(|_| error!(crate::AstrixError::NotInitialised))?;
    Ok(())
}

pub fn journal_genesis(world: &Pubkey) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[b"astrix-journal-v1", world.as_ref()]).to_bytes()
}

/// Appends a record to the world's hash chain:
/// `journal_hash = sha256(prev_hash || world || borsh(record))`, `journal_seq += 1`.
/// The off-chain journal replays the emitted `JournalEvent`s and must reproduce the
/// same head; a gap or reorder is detectable.
pub fn journal_append(ext: &mut WorldExt, world: &Pubkey, mut r: VrfRecord) -> VrfRecord {
    ext.journal_seq = ext.journal_seq.saturating_add(1);
    r.seq = ext.journal_seq;
    r.state_epoch_lo = (ext.state_epoch & 0xff) as u8;
    let mut bytes = Vec::with_capacity(VrfRecord::INIT_SPACE);
    r.serialize(&mut bytes).ok();
    ext.journal_hash = solana_sha256_hasher::hashv(&[&ext.journal_hash, world.as_ref(), &bytes]).to_bytes();
    ext.recent[(r.seq as usize) % RECENT] = r;
    r
}

/// What a settle call did.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Settled {
    pub applied: u64,
    pub remaining: u64,
    pub regressed: bool,
}

/// One 2-second simulation step: exactly the v1 `tick` rules (no rule change).
pub fn step(s: &mut Settlement) {
    s.tick += 1;
    for p in 0..PLOTS {
        let planted = s.plots[p];
        if planted == EMPTY_PLOT || s.tick < planted + CROP_GROWTH_TICKS { continue; }
        s.stock[res::FOOD] = s.stock[res::FOOD].saturating_add(CROP_FOOD).min(STOCK_CAP);
        s.stock[res::FIBER] = s.stock[res::FIBER].saturating_add(CROP_FIBER).min(STOCK_CAP);
        s.stock[res::SEED] = s.stock[res::SEED].saturating_add(1).min(STOCK_CAP);
        s.plots[p] = s.tick;
    }
    if s.sawmill && s.stock[res::WOOD] >= 2 {
        s.stock[res::WOOD] -= 2;
        s.stock[res::PLANKS] = s.stock[res::PLANKS].saturating_add(1).min(STOCK_CAP);
    }
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
}

/// Catch the world up to the ER clock `now`.
///
/// - World time is `floor((now - epoch_start) / interval)`; equivalently, the
///   number of whole intervals since `last_settled_ts`. The fractional remainder
///   is kept, so no time is lost and none is counted twice.
/// - At most `cap` steps per call; the rest stays due (`remaining`).
/// - `now` below `last_settled_ts` (a clock regression) changes nothing except
///   the regression counter: the saved timestamp never moves backwards.
/// - Repeated calls with the same `now` apply nothing (idempotent).
/// - Atomicity: if the enclosing instruction fails, the runtime discards every
///   write, so a failed execution never advances the saved timestamp.
pub fn settle_core(s: &mut Settlement, ext: Option<&mut WorldExt>, now: i64, slot: u64, cap: u64) -> Settled {
    let mut out = Settled::default();
    if s.owner == Pubkey::default() { return out; } // unclaimed slot: no world to simulate
    if let Some(e) = ext.as_ref() {
        if e.seed_origin == seed_origin::AWAITING_VRF { return out; } // clock starts at the genesis reveal
    }
    let interval = s.tick_interval_s.max(crate::MIN_TICK_INTERVAL_S);
    if now < s.last_tick_ts {
        out.regressed = true;
        if let Some(e) = ext { e.clock_regressions = e.clock_regressions.saturating_add(1); }
        return out;
    }
    let due = ((now - s.last_tick_ts) / interval) as u64;
    let n = due.min(cap);
    for _ in 0..n { step(s); }
    s.last_tick_ts += (n as i64) * interval;
    out.applied = n;
    out.remaining = due - n;
    if let Some(e) = ext {
        let epoch = s.last_tick_ts - (s.tick as i64) * interval;
        if e.epoch_start != epoch {
            if e.migrated_ts != 0 { e.reanchors = e.reanchors.saturating_add(1); }
            e.epoch_start = epoch;
        }
        if now < e.max_clock_ts { out.regressed = true; e.clock_regressions = e.clock_regressions.saturating_add(1); }
        e.max_clock_ts = e.max_clock_ts.max(now);
        e.settled_steps_total = e.settled_steps_total.saturating_add(n);
        e.last_settle_slot = slot;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn world(tick: u64, last: i64) -> Settlement {
        let mut s = Settlement {
            owner: Pubkey::new_unique(), world_seed: 7, generator: 2, bump: 255, tick, last_tick_ts: last, tick_interval_s: 2,
            stock: [0; res::COUNT], plots: [EMPTY_PLOT; PLOTS], population: 1, sawmill: false, prospect_pending: false,
            prospects: 0, last_find: 0, last_roll: 0, rare_finds: 0, session_key: Pubkey::default(), session_expires: 0,
            session_budget: 0, actions: 0,
        };
        s.stock[res::WOOD] = 500;
        s.stock[res::SEED] = 3;
        s.plots[0] = tick;
        s.sawmill = true;
        s
    }
    fn ext_for(s: &Settlement) -> WorldExt {
        let mut e = WorldExt::default();
        e.epoch_start = s.last_tick_ts - s.tick as i64 * 2;
        e.migrated_ts = 1;
        e
    }

    #[test]
    fn catch_up_keeps_remainder_and_is_idempotent() {
        let mut s = world(100, 1_000);
        let mut e = ext_for(&s);
        let r = settle_core(&mut s, Some(&mut e), 1_061, 5, MAX_SETTLE_STEPS);
        assert_eq!((r.applied, r.remaining, s.tick, s.last_tick_ts), (30, 0, 130, 1_060));
        let snap = (s.tick, s.last_tick_ts, s.stock, s.plots, s.population);
        let r2 = settle_core(&mut s, Some(&mut e), 1_061, 6, MAX_SETTLE_STEPS);
        assert_eq!(r2.applied, 0);
        assert_eq!(snap, (s.tick, s.last_tick_ts, s.stock, s.plots, s.population));
        // the kept odd second is not lost: one more second completes the next step
        let r3 = settle_core(&mut s, Some(&mut e), 1_062, 7, MAX_SETTLE_STEPS);
        assert_eq!((r3.applied, s.tick), (1, 131));
        assert_eq!(e.epoch_start, s.last_tick_ts - s.tick as i64 * 2);
        assert_eq!(e.reanchors, 0);
    }

    #[test]
    fn cap_and_multi_call_drain_equal_continuous() {
        let start = world(0, 10_000);
        let mut a = start.clone();
        let mut ea = ext_for(&a);
        let mut calls = 0;
        loop {
            let r = settle_core(&mut a, Some(&mut ea), 10_000 + 3_600, calls, MAX_SETTLE_STEPS);
            calls += 1;
            assert!(r.applied <= MAX_SETTLE_STEPS);
            if r.remaining == 0 { break; }
        }
        assert_eq!(a.tick, 1_800);
        assert_eq!(calls, (1_800 + MAX_SETTLE_STEPS - 1) / MAX_SETTLE_STEPS);
        // reference: a crank every 2 s with no outage
        let mut b = start.clone();
        let mut eb = ext_for(&b);
        for t in (10_002..=13_600).step_by(2) { settle_core(&mut b, Some(&mut eb), t, 0, MAX_SETTLE_STEPS); }
        assert_eq!((a.tick, a.last_tick_ts, a.stock, a.plots, a.population), (b.tick, b.last_tick_ts, b.stock, b.plots, b.population));
    }

    #[test]
    fn regression_never_moves_time_backwards() {
        let mut s = world(50, 2_000);
        let mut e = ext_for(&s);
        settle_core(&mut s, Some(&mut e), 2_090, 1, MAX_SETTLE_STEPS);
        let snap = (s.tick, s.last_tick_ts, s.stock);
        let r = settle_core(&mut s, Some(&mut e), 1_900, 2, MAX_SETTLE_STEPS);
        assert!(r.regressed);
        assert_eq!(snap, (s.tick, s.last_tick_ts, s.stock));
        assert_eq!(e.clock_regressions, 1);
        // back at the old max: nothing new is due, nothing applied twice
        let r = settle_core(&mut s, Some(&mut e), 2_090, 3, MAX_SETTLE_STEPS);
        assert_eq!(r.applied, 0);
        assert_eq!((s.tick, e.max_clock_ts), (95, 2_090));
    }

    #[test]
    fn unclaimed_and_awaiting_genesis_do_not_run() {
        let mut s = world(0, 0);
        s.owner = Pubkey::default();
        assert_eq!(settle_core(&mut s, None, 10_000, 0, MAX_SETTLE_STEPS).applied, 0);
        let mut s = world(0, 0);
        let mut e = ext_for(&s);
        e.seed_origin = seed_origin::AWAITING_VRF;
        assert_eq!(settle_core(&mut s, Some(&mut e), 10_000, 0, MAX_SETTLE_STEPS).applied, 0);
        assert_eq!(s.tick, 0);
    }

    #[test]
    fn v1_account_without_tail_catches_up_too() {
        let mut s = world(10, 100);
        let r = settle_core(&mut s, None, 150, 0, MAX_SETTLE_STEPS);
        assert_eq!((r.applied, s.tick, s.last_tick_ts), (25, 35, 150));
    }

    #[test]
    fn layout_sizes() {
        assert_eq!(V1_LEN, 240);
        assert_eq!(WorldExt::INIT_SPACE, 636);
        assert_eq!(V2_LEN, 876);
        assert_eq!(VrfTicket::INIT_SPACE, 53);
    }
}
