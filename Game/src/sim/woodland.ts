// M013 living woodland: the authoritative tree lifecycle.
//
// Every tree has a species and an age, and passes through the stages
//   sapling → young → mature → old → dying → snag (standing dead) → gap
// at species-specific rates (days below; one day is 300 ticks). Felling
// leaves a stump; broadleaf stumps may resprout (coppice), conifer stumps rot
// away. Timber depends on species and stage.
//
// Determinism model (why it does not depend on loaded chunks or the camera):
//  - An untouched natural tree has no stored state at all. Its age is a pure
//    function of (entity id, its visual stage at the woodland epoch, ticks
//    since the epoch): `a0 + (tick - epoch)`, cycled so a fallen snag's spot
//    regenerates in place. A chunk that is loaded late, or reloaded after a
//    save, computes exactly the same stage for the same tick, so unloaded
//    trees "catch up" for free and nothing has to be simulated off screen.
//    At the epoch (the journaled upgrade or founding under rules v5) every
//    tree is in the stage it was already drawn in, so nothing visibly jumps.
//  - Trees with history (cut, felled, planted, seeded, resprouted, cleared)
//    get a small record in the homestead's woodland state (hashed, saved).
//    Records change only inside journaled commands and the journaled tick,
//    through scheduled events (`next`), a bounded number per tick.
//  - Active regeneration that needs neighbours (seeding from mature parents,
//    the forester's replanting) runs only inside the homestead's walking
//    window, whose chunks the simulation always generates itself.
//
// This module holds the pure lifecycle and the records. Policies, the
// woodcutter/forester, seeding and the M014 query API are in sim/forestry.ts.
import type { Entity, EntityKind, World } from './world';
import { GrowthStage, TreeSpecies, TREE_SPECIES, growthStage, idHash, treeSpecies } from './vegetation';

/** Settlement rules v5 (M013): the living woodland. */
export const WOODLAND_VERSION = 5 as const;
/** One in-game day in ticks (equal to homestead DAY_TICKS; kept local to avoid an import cycle at load). */
export const WOOD_DAY = 300;

/** Drawn and simulated stages. `gap` is an empty spot: nothing drawn, nothing blocks, nothing to cut. */
export type TreeStage = GrowthStage | 'dying' | 'snag' | 'stump';
export type LifeStage = TreeStage | 'gap';
export const TREE_STAGES: readonly TreeStage[] = ['sapling', 'young', 'mature', 'old', 'dying', 'snag', 'stump'];
/** Lifecycle order (index into the duration tables). */
export const CYCLE: readonly LifeStage[] = ['sapling', 'young', 'mature', 'old', 'dying', 'snag', 'gap'];

export interface SpeciesGrowth {
  /** Days in sapling, young, mature, old, dying, snag, and the gap before a fallen snag's spot regrows. */
  days: readonly [number, number, number, number, number, number, number];
  /** Chance a felled stump resprouts (coppice), and the days it takes. */
  coppice: number; resprout: number;
  /** Days a stump that does not resprout takes to rot away. */
  rot: number;
  /** Seeding: how far seed falls (m), expected seedlings per parent per day (before site conditions), min spacing (m). */
  seedRange: number; seedPerDay: number; spacing: number;
}

/**
 * Growth tables. Birch and cherry are fast and short-lived pioneers; oak and
 * beech grow slowly and live long; the conifers sit between and never coppice.
 * A whole oak life is about 55 days (9 hours of play), a birch about 24.
 */
export const GROWTH: Record<TreeSpecies, SpeciesGrowth> = {
  oak: { days: [3.5, 6, 16, 18, 3, 6, 3], coppice: 0.8, resprout: 1.5, rot: 8, seedRange: 7, seedPerDay: 0.25, spacing: 3 },
  beech: { days: [3, 5, 14, 14, 2, 5, 3], coppice: 0.4, resprout: 1.5, rot: 6, seedRange: 7, seedPerDay: 0.3, spacing: 3 },
  birch: { days: [1.5, 2.5, 7, 6, 1.5, 3, 2], coppice: 0.7, resprout: 1, rot: 4, seedRange: 9, seedPerDay: 0.5, spacing: 2.5 },
  cherry: { days: [2, 3, 7, 6, 1.5, 3, 2], coppice: 0.6, resprout: 1.2, rot: 4, seedRange: 6, seedPerDay: 0.35, spacing: 2.5 },
  pine: { days: [2, 4, 10, 10, 2, 4, 3], coppice: 0, resprout: 0, rot: 6, seedRange: 10, seedPerDay: 0.4, spacing: 2.5 },
  spruce: { days: [2.5, 4, 10, 10, 2, 4, 3], coppice: 0, resprout: 0, rot: 6, seedRange: 9, seedPerDay: 0.4, spacing: 2 },
};

/** Timber: total a tree of this stage holds, and one cut. Stumps and gaps hold none; snags give a little poor wood. */
export const TIMBER: Record<TreeSpecies, Record<'sapling' | 'young' | 'mature' | 'old' | 'dying' | 'snag', { total: number; cut: number }>> = {
  oak: { sapling: { total: 2, cut: 2 }, young: { total: 7, cut: 3 }, mature: { total: 15, cut: 5 }, old: { total: 20, cut: 5 }, dying: { total: 15, cut: 5 }, snag: { total: 7, cut: 3 } },
  beech: { sapling: { total: 2, cut: 2 }, young: { total: 7, cut: 3 }, mature: { total: 14, cut: 4 }, old: { total: 18, cut: 5 }, dying: { total: 13, cut: 4 }, snag: { total: 6, cut: 3 } },
  spruce: { sapling: { total: 2, cut: 2 }, young: { total: 6, cut: 3 }, mature: { total: 12, cut: 4 }, old: { total: 16, cut: 4 }, dying: { total: 12, cut: 4 }, snag: { total: 6, cut: 3 } },
  pine: { sapling: { total: 2, cut: 2 }, young: { total: 6, cut: 3 }, mature: { total: 12, cut: 4 }, old: { total: 16, cut: 4 }, dying: { total: 12, cut: 4 }, snag: { total: 6, cut: 3 } },
  birch: { sapling: { total: 2, cut: 2 }, young: { total: 5, cut: 3 }, mature: { total: 9, cut: 3 }, old: { total: 12, cut: 4 }, dying: { total: 9, cut: 3 }, snag: { total: 4, cut: 2 } },
  cherry: { sapling: { total: 2, cut: 2 }, young: { total: 4, cut: 2 }, mature: { total: 8, cut: 4 }, old: { total: 11, cut: 4 }, dying: { total: 8, cut: 4 }, snag: { total: 4, cut: 2 } },
};

/** Walking-grid footprint by stage (m from the trunk). A stump blocks its own cell; a snag is a bare trunk. */
export const LIFE_FOOTPRINT: Record<TreeStage, number> = { sapling: 0.3, young: 0.6, mature: 1.0, old: 1.5, dying: 1.5, snag: 0.6, stump: 0.3 };
/** Player trunk collision radius by stage (m, before entity scale). */
export const LIFE_TRUNK: Record<TreeStage, number> = { sapling: 0.15, young: 0.3, mature: 0.45, old: 0.45, dying: 0.45, snag: 0.35, stump: 0.3 };

/** Entity kind a species is recorded as (the renderer and inspector read the species from the record). */
export const SPECIES_KIND: Record<TreeSpecies, EntityKind> = {
  oak: 'styl_tree_table', beech: 'styl_tree_cluster', birch: 'styl_tree_cluster', cherry: 'styl_tree_blossom', pine: 'styl_tree_spire', spruce: 'styl_tree_spire',
};

export const timberOf = (sp: TreeSpecies, stage: LifeStage): { total: number; cut: number } | null =>
  stage === 'stump' || stage === 'gap' ? null : TIMBER[sp][stage];

// ---------- records (hashed, saved) ----------

/** How a record's current growth began. */
export type TreeOrigin = 'wild' | 'seed' | 'plant' | 'sprout' | 'regrow';
export const TREE_ORIGINS: readonly TreeOrigin[] = ['plant', 'regrow', 'seed', 'sprout', 'wild'];
/**
 * A tree with history. `live`: growing since `born` (age 0); `stump`: felled
 * at `at`; `gap`: nothing stands (a fallen snag or a rotted stump). `next` is
 * the tick of the next scheduled event (snag falls, stump resprouts or rots,
 * gap regrows), or -1 for none. `sprout` marks a stump that will resprout.
 */
export interface WoodTree {
  id: string; sp: TreeSpecies; st: 'live' | 'stump' | 'gap';
  born: number; at: number; next: number; from: TreeOrigin; sprout?: true;
}
export type HarvestMode = 'sustainable' | 'demand' | 'paused';
export const HARVEST_MODES: readonly HarvestMode[] = ['demand', 'paused', 'sustainable'];
/**
 * The owner's woodland policy. `harvest`: fell only what regrows
 * (sustainable quota), whatever the store needs (demand), or nothing.
 * `minStage`: the youngest stage that may be felled. `keepVeterans` protects
 * old and dying trees; `snags` fells standing dead trees (poor wood) or keeps
 * them for wildlife. Buffers protect trees near buildings/fields and water.
 * `minStanding` mature-or-older trees always stay in the managed woodland.
 * `replant`: saplings the forester plants for each tree felled.
 */
export interface WoodPolicy {
  harvest: HarvestMode; minStage: 'mature' | 'old'; keepVeterans: boolean; snags: 'fell' | 'keep';
  buffer: number; waterBuffer: number; minStanding: number; replant: number;
}
export const DEFAULT_POLICY: WoodPolicy = { harvest: 'sustainable', minStage: 'mature', keepVeterans: true, snags: 'fell', buffer: 5, waterBuffer: 3, minStanding: 6, replant: 1 };
export const POLICY_LIMITS = { buffer: [0, 15], waterBuffer: [0, 10], minStanding: [0, 60], replant: [0, 3] } as const;
/** A protected area (whole metres): no tree inside is felled. */
export interface ProtectZone { id: string; x: number; z: number; r: number }
/** A replanting order the forester works through: plant one sapling of `sp` at cell (x, z). */
export interface PlantOrder { id: string; x: number; z: number; sp: TreeSpecies }
export interface WoodlandState {
  /** Tick the lifecycle clock started (upgrade or founding under rules v5). */
  epoch: number;
  /** Separate xorshift stream: seeding and coppice rolls never touch the homestead's stream. */
  rng: number;
  nextId: number;
  trees: WoodTree[];
  protect: string[];
  zones: ProtectZone[];
  orders: PlantOrder[];
  policy: WoodPolicy;
  /** Sustainable felling allowance in micro-trees (1e6 = one tree), and its accrual per tick. */
  quota: number; rate: number;
  /** Rotating cursor over seed parents (bounded seeding work per tick). */
  scan: number;
  /** Counters for the panel: trees felled in the managed woodland, planted, seeded, resprouted. */
  felled: number; planted: number; seeded: number; sprouted: number;
}
export const MAX_RECORDS = 20_000;
export const MAX_PROTECTED = 64;
export const MAX_ZONES = 8;
export const MAX_ORDERS = 12;
export const QUOTA_TREE = 1_000_000;

export function woodRng(seed: number): number {
  let h = (seed ^ 0x2545f491) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h === 0 ? 0x1b873593 : h;
}
export function woodRnd(w: WoodlandState): number {
  let x = w.rng;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  w.rng = x === 0 ? 0x1b873593 : x;
  return w.rng / 4294967296;
}

export function createWoodland(seed: number, epoch: number): WoodlandState {
  return { epoch, rng: woodRng(seed), nextId: 0, trees: [], protect: [], zones: [], orders: [], policy: { ...DEFAULT_POLICY },
    quota: QUOTA_TREE, rate: 0, scan: 0, felled: 0, planted: 0, seeded: 0, sprouted: 0 };
}

const recordMaps = new WeakMap<WoodlandState, { list: WoodTree[]; n: number; map: Map<string, WoodTree> }>();
/** The record of a tree, or undefined. */
export function recordOf(w: WoodlandState, id: string): WoodTree | undefined {
  let c = recordMaps.get(w);
  if (!c || c.list !== w.trees || c.n !== w.trees.length) {
    c = { list: w.trees, n: w.trees.length, map: new Map(w.trees.map((t) => [t.id, t])) };
    recordMaps.set(w, c);
  }
  return c.map.get(id);
}
export function addRecord(w: WoodlandState, t: WoodTree): WoodTree {
  const old = recordOf(w, t.id);
  if (old) { Object.assign(old, t); if (!t.sprout) delete old.sprout; return old; }
  w.trees.push(t);
  return t;
}
export function dropRecord(w: WoodlandState, id: string): void {
  const i = w.trees.findIndex((t) => t.id === id);
  if (i >= 0) w.trees.splice(i, 1);
}

// ---------- the pure lifecycle ----------

interface TreeConsts { sp: TreeSpecies; ends: Int32Array; a0: number }
const constsCache = new WeakMap<Entity, TreeConsts & { key: string }>();

/** Stage end ticks (cumulative) for a tree of `sp`, with its own ±15% pace. */
export function stageEnds(sp: TreeSpecies, id: string): Int32Array {
  const pace = 0.85 + 0.3 * idHash(id, 0xa9e5);
  const ends = new Int32Array(7);
  let acc = 0;
  GROWTH[sp].days.forEach((d, i) => { acc += Math.max(1, Math.round(d * WOOD_DAY * pace)); ends[i] = acc; });
  return ends;
}
function stageIndex(ends: Int32Array, age: number): number {
  for (let i = 0; i < 7; i++) if (age < ends[i]) return i;
  return 6;
}
const VISUAL_INDEX: Record<GrowthStage, number> = { sapling: 0, young: 1, mature: 2, old: 3 };

function consts(e: Entity, seed: number, sp: TreeSpecies): TreeConsts {
  const key = `${sp}:${seed}`;
  const c = constsCache.get(e);
  if (c && c.key === key) return c;
  const ends = stageEnds(sp, e.id);
  // Where in its drawn stage the tree stood at the epoch: never at an edge, so nothing changes on the first tick.
  const k = VISUAL_INDEX[growthStage(e) ?? 'mature'];
  const start = k === 0 ? 0 : ends[k - 1];
  const a0 = start + Math.floor((0.15 + 0.7 * idHash(e.id, 0x1ee7)) * (ends[k] - start));
  const out = { sp, ends, a0, key };
  constsCache.set(e, out);
  return out;
}

export interface TreeLife {
  species: TreeSpecies;
  stage: LifeStage;
  /** Something stands here (drawn, on the walking grid, collides). */
  present: boolean;
  /** Age in ticks of the current growth, or null (legacy rules, stumps, gaps, the founders' grove). */
  age: number | null;
  /** Ticks until the stage changes, or null when nothing is scheduled. */
  nextIn: number | null;
  /** Legacy rules: the stage is the fixed visual stage (M008) and nothing grows. */
  legacy: boolean;
  record?: WoodTree;
}

const isTreeKind = (kind: EntityKind) => kind.startsWith('styl_tree_');
export const woodlandOf = (world: World): WoodlandState | null =>
  world.homestead && world.homestead.version >= WOODLAND_VERSION && world.homestead.woodland ? world.homestead.woodland : null;

/**
 * The woodland whose lifecycle drives the trees: the homestead's (rules v5)
 * or, W3, the wilderness's (content v3, `world.wild.fell.woodland`).
 */
export const livingWoodlandOf = (world: World): WoodlandState | null => woodlandOf(world) ?? world.wild?.fell?.woodland ?? null;

/**
 * The single source of a tree's species, stage and presence for the sim
 * (nav, felling, woodcutter), the player's collision, the renderer and the
 * inspector. Without rules v5 it is the M008 visual stage, unchanged.
 */
export function treeLife(world: World, e: Entity): TreeLife | null {
  if (!isTreeKind(e.kind)) return null;
  const w = livingWoodlandOf(world);
  if (!w) {
    const species = treeSpecies(e, world.seed) as TreeSpecies;
    return { species, stage: growthStage(e)!, present: !e.harvested, age: null, nextIn: null, legacy: true };
  }
  const tick = world.life?.tick ?? 0;
  const rec = recordOf(w, e.id);
  if (rec) {
    if (rec.st === 'stump') return { species: rec.sp, stage: 'stump', present: true, age: null, nextIn: rec.next >= 0 ? Math.max(0, rec.next - tick) : null, legacy: false, record: rec };
    if (rec.st === 'gap') return { species: rec.sp, stage: 'gap', present: false, age: null, nextIn: rec.next >= 0 ? Math.max(0, rec.next - tick) : null, legacy: false, record: rec };
    const c = consts(e, world.seed, rec.sp);
    const age = Math.max(0, tick - rec.born);
    // A snag past its time stays standing until its fall event runs (the same tick, in the tick's woodland step).
    const i = Math.min(5, stageIndex(c.ends, age));
    return { species: rec.sp, stage: CYCLE[i], present: true, age, nextIn: Math.max(0, c.ends[i] - age), legacy: false, record: rec };
  }
  const species = treeSpecies(e, world.seed) as TreeSpecies;
  if (e.harvested) return { species, stage: 'gap', present: false, age: null, nextIn: null, legacy: false };
  // The founders' grove is tended: it keeps its stage until it is cut.
  if (e.authored) return { species, stage: growthStage(e)!, present: true, age: null, nextIn: null, legacy: false };
  const c = consts(e, world.seed, species);
  const cycle = c.ends[6];
  const age = (c.a0 + Math.max(0, tick - w.epoch)) % cycle;
  const i = stageIndex(c.ends, age);
  return { species, stage: CYCLE[i], present: i !== 6, age, nextIn: c.ends[i] - age, legacy: false };
}

/** Age (ticks) a natural untouched tree has at `tick` within its current cycle, for records taking it over. */
export function naturalBorn(world: World, e: Entity, w: WoodlandState, sp: TreeSpecies): number {
  const c = consts(e, world.seed, sp);
  const age = (c.a0 + Math.max(0, (world.life?.tick ?? 0) - w.epoch)) % c.ends[6];
  return (world.life?.tick ?? 0) - age;
}

/** Ticks a tree of this record lives until its snag falls. */
export function fallAge(sp: TreeSpecies, id: string): number { return stageEnds(sp, id)[5]; }
export function gapTicks(sp: TreeSpecies, id: string): number { const e = stageEnds(sp, id); return e[6] - e[5]; }

/** Timber a tree holds now (null: nothing to cut). */
export function lifeTimber(life: TreeLife): { total: number; cut: number } | null {
  if (!life.present) return null;
  return timberOf(life.species, life.stage);
}

export function stageLabel(stage: LifeStage): string {
  return stage === 'snag' ? 'dead snag' : stage === 'gap' ? 'empty spot' : stage;
}
export function speciesFromText(v: unknown): TreeSpecies | null {
  return typeof v === 'string' && (TREE_SPECIES as readonly string[]).includes(v) ? v as TreeSpecies : null;
}

// ---------- presentation-side change channel (never saved or hashed) ----------

const changes = new WeakMap<World, { seq: number; ids: string[] }>();
/** Record that a tree's drawn state may have changed (felled, cut, resprouted, planted...). */
export function noteTreeChange(world: World, id: string): void {
  let c = changes.get(world);
  if (!c) { c = { seq: 0, ids: [] }; changes.set(world, c); }
  c.seq++;
  c.ids.push(id);
  if (c.ids.length > 512) c.ids.splice(0, c.ids.length - 512);
}
/** Ids changed since `seq` (or null when too many to list: rescan everything). */
export function treeChangesSince(world: World, seq: number): { seq: number; ids: string[] | null } {
  const c = changes.get(world);
  if (!c) return { seq: 0, ids: [] };
  const n = c.seq - seq;
  if (n <= 0) return { seq: c.seq, ids: [] };
  if (n > c.ids.length) return { seq: c.seq, ids: null };
  return { seq: c.seq, ids: c.ids.slice(c.ids.length - n) };
}

// ---------- validation and canonical form ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
const TREE_ID = /^(?:e:\d+,\d+:\d+|hero:styl_[a-z_]+:-?\d+:-?\d+)$/;

export function woodlandSnapshot(w: WoodlandState): WoodlandState {
  const p = w.policy;
  return {
    epoch: w.epoch, rng: w.rng, nextId: w.nextId,
    trees: [...w.trees].sort((a, b) => a.id.localeCompare(b.id)).map((t) => ({ id: t.id, sp: t.sp, st: t.st, born: t.born, at: t.at, next: t.next, from: t.from, ...(t.sprout ? { sprout: true as const } : {}) })),
    protect: [...w.protect].sort(),
    zones: [...w.zones].sort((a, b) => a.id.localeCompare(b.id)).map((z) => ({ id: z.id, x: z.x, z: z.z, r: z.r })),
    orders: [...w.orders].sort((a, b) => a.id.localeCompare(b.id)).map((o) => ({ id: o.id, x: o.x, z: o.z, sp: o.sp })),
    policy: { harvest: p.harvest, minStage: p.minStage, keepVeterans: p.keepVeterans, snags: p.snags, buffer: p.buffer, waterBuffer: p.waterBuffer, minStanding: p.minStanding, replant: p.replant },
    quota: w.quota, rate: w.rate, scan: w.scan, felled: w.felled, planted: w.planted, seeded: w.seeded, sprouted: w.sprouted,
  };
}

export function validatePolicy(p: unknown): WoodPolicy {
  if (!isObj(p) || !HARVEST_MODES.includes(p.harvest as HarvestMode) || (p.minStage !== 'mature' && p.minStage !== 'old')
    || typeof p.keepVeterans !== 'boolean' || (p.snags !== 'fell' && p.snags !== 'keep')
    || !int(p.buffer, ...POLICY_LIMITS.buffer) || !int(p.waterBuffer, ...POLICY_LIMITS.waterBuffer)
    || !int(p.minStanding, ...POLICY_LIMITS.minStanding) || !int(p.replant, ...POLICY_LIMITS.replant)) throw new Error('snapshot has an invalid woodland policy');
  return { harvest: p.harvest as HarvestMode, minStage: p.minStage, keepVeterans: p.keepVeterans, snags: p.snags, buffer: p.buffer, waterBuffer: p.waterBuffer, minStanding: p.minStanding, replant: p.replant };
}

export function validateWoodland(raw: unknown, tick: number): WoodlandState {
  if (!isObj(raw) || !int(raw.epoch, 0, tick) || !int(raw.rng, 1, 0xffffffff) || !int(raw.nextId, 0, 100_000_000)
    || !Array.isArray(raw.trees) || raw.trees.length > MAX_RECORDS || !Array.isArray(raw.protect) || raw.protect.length > MAX_PROTECTED
    || !Array.isArray(raw.zones) || raw.zones.length > MAX_ZONES || !Array.isArray(raw.orders) || raw.orders.length > MAX_ORDERS
    || !int(raw.quota, -10 * QUOTA_TREE, 1_000 * QUOTA_TREE) || !int(raw.rate, 0, 100 * QUOTA_TREE) || !int(raw.scan, 0, Number.MAX_SAFE_INTEGER)
    || !int(raw.felled, 0, 1e9) || !int(raw.planted, 0, 1e9) || !int(raw.seeded, 0, 1e9) || !int(raw.sprouted, 0, 1e9)) throw new Error('snapshot has an invalid woodland');
  const seen = new Set<string>();
  const trees: WoodTree[] = raw.trees.map((t: unknown) => {
    if (!isObj(t) || typeof t.id !== 'string' || t.id.length > 64 || !TREE_ID.test(t.id) || seen.has(t.id) || !speciesFromText(t.sp)
      || (t.st !== 'live' && t.st !== 'stump' && t.st !== 'gap') || !int(t.born, -10_000_000, tick) || !int(t.at, -10_000_000, tick)
      || !int(t.next, -1, Number.MAX_SAFE_INTEGER) || !TREE_ORIGINS.includes(t.from as TreeOrigin)
      || t.sprout !== undefined && (t.sprout !== true || t.st !== 'stump')) throw new Error('snapshot has an invalid woodland tree');
    seen.add(t.id);
    return { id: t.id, sp: t.sp as TreeSpecies, st: t.st, born: t.born, at: t.at, next: t.next, from: t.from as TreeOrigin, ...(t.sprout ? { sprout: true as const } : {}) };
  });
  const protect = raw.protect.map((id: unknown) => {
    if (typeof id !== 'string' || id.length > 64 || !TREE_ID.test(id)) throw new Error('snapshot has an invalid protected tree');
    return id;
  });
  if (new Set(protect).size !== protect.length) throw new Error('snapshot has a duplicate protected tree');
  const zones: ProtectZone[] = raw.zones.map((z: unknown) => {
    if (!isObj(z) || typeof z.id !== 'string' || !/^zone:\d{1,8}$/.test(z.id) || !int(z.x, -1024, 1024) || !int(z.z, -1024, 1024) || !int(z.r, 2, 40)) throw new Error('snapshot has an invalid protected area');
    return { id: z.id, x: z.x, z: z.z, r: z.r };
  });
  const orders: PlantOrder[] = raw.orders.map((o: unknown) => {
    if (!isObj(o) || typeof o.id !== 'string' || !/^plant:\d{1,8}$/.test(o.id) || !int(o.x, -1024, 1023) || !int(o.z, -1024, 1023) || !speciesFromText(o.sp)) throw new Error('snapshot has an invalid planting order');
    return { id: o.id, x: o.x, z: o.z, sp: o.sp as TreeSpecies };
  });
  const w: WoodlandState = { epoch: raw.epoch, rng: raw.rng, nextId: raw.nextId, trees, protect, zones, orders, policy: validatePolicy(raw.policy),
    quota: raw.quota, rate: raw.rate, scan: raw.scan, felled: raw.felled, planted: raw.planted, seeded: raw.seeded, sprouted: raw.sprouted };
  const canonical = woodlandSnapshot(w);
  if (JSON.stringify(canonical) !== JSON.stringify(raw)) throw new Error('snapshot woodland is not canonical');
  return canonical;
}
