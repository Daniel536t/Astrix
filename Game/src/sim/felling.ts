// W3: physical tree felling in the wilderness (wilderness content v3).
//
// A standing tree has hit points from its species and lifecycle stage. Every
// swing of an equipped axe is one journaled `chop` command, validated here
// (tool, durability, reach, rate, a tree that stands); it takes one hit point
// and one unit of axe durability. At 0 the tree falls: its entity becomes an
// M013 stump (same id, same species, a woodland record with the lifecycle's
// resprout or rot schedule) and a fallen trunk record is created, lying away
// from the player. A standing tree never turns into inventory wood.
//
// The trunk is processed with `cut_log` swings into log piles on the ground
// (count from the M013 timber rule of the felled species and stage). Logs
// are heavy, picked up with `pickup` and delivered by dropping them at a
// stockpile marker the player placed (`mark_stockpile`).
//
// The wilderness has no homestead, so the lifecycle records live in the
// wilderness state (`fell.woodland`), and `treeLife` reads them there. Only
// the scheduled record events are ported (stumps resprout or rot, gaps
// regrow); there is no managed window, policy, quota or forester.
//
// Integer state, except entity positions copied from generation. Randomness
// only from the woodland's own xorshift stream. No three.js.
import type { Entity, World } from './world';
import { HALF, chunkKey, ensureChunk, surfaceAt, touchNature, waterDepthAt, worldToChunkX, worldToChunkZ } from './world';
import type { TreeSpecies } from './vegetation';
import { TREE_SPECIES } from './vegetation';
import {
  GROWTH, LIFE_TRUNK, TIMBER, TreeOrigin, TreeStage, WOOD_DAY, WoodlandState, addRecord, createWoodland, gapTicks,
  naturalBorn, noteTreeChange, recordOf, treeLife, validateWoodland, woodRnd, woodlandSnapshot, fallAge,
} from './woodland';
import type { At, WildResult, WildState } from './gathering';

export const WILD_CONTENT_V3 = 3 as const;

export const FELL_EVENTS = ['CHOP_STARTED', 'TREE_DAMAGED', 'TREE_FELLED', 'TRUNK_CREATED', 'LOGS_CREATED', 'LOGS_COLLECTED', 'LOGS_DELIVERED', 'STOCKPILE_MARKED',
  // W4 (content v4): construction and the functions of finished buildings, in the same bounded event list.
  'SITE_PLACED', 'MATERIALS_DELIVERED', 'CONSTRUCTION_PROGRESS', 'BUILDING_COMPLETED', 'SITE_CANCELLED', 'SHELTER_CLAIMED', 'FIRE_FUELED', 'FOOD_COOKED',
  'ITEMS_STORED', 'ITEMS_TAKEN', 'RESPAWNED', 'DIED',
  // W6 (content v7): mining deposits and smelting.
  'MINE_STARTED', 'DEPOSIT_MINED', 'DEPOSIT_EXHAUSTED', 'SMELT_STARTED', 'SMELT_DONE'] as const;
export type FellEvent = (typeof FELL_EVENTS)[number];

/** Stages a tree can be chopped in (a stump or an empty spot cannot). */
export type Standing = 'sapling' | 'young' | 'mature' | 'old' | 'dying' | 'snag';
export const STANDING: readonly Standing[] = ['sapling', 'young', 'mature', 'old', 'dying', 'snag'];

/** Reach from the player's reported position to the trunk's surface (m). */
export const CHOP_REACH = 2.5;
/** Swings (chop and cut_log together) the simulation accepts per world tick (2 s). */
export const SWINGS_PER_TICK = 4;
/** The client's pacing between swings (presentation; the sim enforces SWINGS_PER_TICK). */
export const SWING_COOLDOWN_MS = 650;
/** A log pile within this distance of a stockpile marker is delivered there (m). */
export const STOCKPILE_RADIUS = 3;
export const STOCKPILE_SPACING = 6;
export const MAX_STOCKPILES = 4;
export const MAX_TRUNKS = 256;
export const MAX_DAMAGED = 512;
export const MAX_EVENTS = 40;
/** Lifecycle record events processed per tick at most (as M013). */
export const FELL_EVENTS_PER_TICK = 16;
/** Trunks thinner than this (m) are stepped over; thicker ones block and must be walked around or jumped. */
export const WALK_OVER = 0.45;

/** Wood hardness: hit points per unit of M013 timber. */
const HARDNESS: Record<TreeSpecies, number> = { oak: 0.65, beech: 0.65, pine: 0.55, spruce: 0.55, birch: 0.6, cherry: 0.6 };
/** A tree's drawn height when lying (m, mature, scale 1) and trunk width (m). */
const TREE_LEN: Record<TreeSpecies, number> = { oak: 6, beech: 6.5, birch: 6, cherry: 5, pine: 8, spruce: 7.5 };
const TRUNK_W: Record<TreeSpecies, number> = { oak: 0.65, beech: 0.6, birch: 0.45, cherry: 0.6, pine: 0.55, spruce: 0.5 };
const STAGE_LEN: Record<Standing, number> = { sapling: 0.4, young: 0.68, mature: 1, old: 1.12, dying: 1.12, snag: 0.8 };
const STAGE_W: Record<Standing, number> = { sapling: 0.4, young: 0.68, mature: 1, old: 1.12, dying: 1.12, snag: 1.0 };
/** Branches the crown drops where it lands. */
export const CROWN_BRANCHES: Record<Standing, number> = { sapling: 0, young: 1, mature: 2, old: 3, dying: 2, snag: 0 };

/** 16 compass directions as fixed decimals (as sim/forestry.ts; no trigonometry in the sim). */
export const DIRS16: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.9239, 0.3827], [0.7071, 0.7071], [0.3827, 0.9239], [0, 1], [-0.3827, 0.9239], [-0.7071, 0.7071], [-0.9239, 0.3827],
  [-1, 0], [-0.9239, -0.3827], [-0.7071, -0.7071], [-0.3827, -0.9239], [0, -1], [0.3827, -0.9239], [0.7071, -0.7071], [0.9239, -0.3827],
];

/** Hit points of a standing tree: saplings 2, an old oak 13. Dead wood (snag) is softer. */
export function treeHp(sp: TreeSpecies, stage: Standing): number {
  return Math.max(2, Math.round(TIMBER[sp][stage].total * HARDNESS[sp] * (stage === 'snag' ? 0.7 : 1)));
}
/** Logs a felled tree of this species and stage gives: its M013 timber in cuts (each log is one M013 cut of wood). */
export function trunkLogs(sp: TreeSpecies, stage: Standing): number {
  const t = TIMBER[sp][stage];
  return Math.ceil(t.total / t.cut);
}
/** Swings per log: thin trunks are cut through with one, thick ones need two. */
export const cutSwings = (t: Pick<Trunk, 'r'>): number => (t.r < 20 ? 1 : 2);

export interface DamageRecord { id: string; hp: number; max: number }
/** A fallen trunk: base at (x, z), lying along DIRS16[dir]. len in dm, r (radius) in cm. */
export interface Trunk {
  id: string; tree: string; sp: TreeSpecies; stage: Standing;
  x: number; y: number; z: number; dir: number; len: number; r: number;
  /** Logs it gives in total, logs still in it, and swings into the next log. */
  logs: number; left: number; work: number;
}
export interface StockpileMarker { id: string; x: number; y: number; z: number; delivered: number }
export interface EventRecord { seq: number; tick: number; type: FellEvent; ref: string; n?: number }

export interface FellState {
  /** Standing trees with damage. */
  chop: Map<string, DamageRecord>;
  /** Swings accepted in world tick `tick`. */
  swing: { tick: number; n: number };
  trunks: Map<string, Trunk>;
  stockpiles: Map<string, StockpileMarker>;
  /** The latest events (bounded), and the next event number. */
  events: EventRecord[];
  eventSeq: number;
  /** M013 lifecycle records of the wilderness (stumps, regrowth). */
  woodland: WoodlandState;
}

export function createFell(seed: number, tick: number): FellState {
  return { chop: new Map(), swing: { tick, n: 0 }, trunks: new Map(), stockpiles: new Map(), events: [], eventSeq: 0, woodland: createWoodland(seed, tick) };
}

const fail = (code: string, reason: string): { ok: false; code: string; reasons: string[] } => ({ ok: false, code, reasons: [reason] });
const tickOf = (world: World) => world.life?.tick ?? 0;
const days = (d: number) => Math.max(1, Math.round(d * WOOD_DAY));
const isStanding = (s: string): s is Standing => (STANDING as readonly string[]).includes(s);

function note(f: FellState, tick: number, type: FellEvent, ref: string, n?: number): FellEvent {
  f.events.push({ seq: f.eventSeq++, tick, type, ref, ...(n !== undefined ? { n } : {}) });
  if (f.events.length > MAX_EVENTS) f.events.splice(0, f.events.length - MAX_EVENTS);
  return type;
}

/** Record an event from another wilderness rule (pickup, drop). */
export function noteEvent(world: World, type: FellEvent, ref: string, n?: number): FellEvent {
  return note(world.wild!.fell!, tickOf(world), type, ref, n);
}

/** The axe in hand, or why there is none fit to swing. */
function axeOf(w: WildState): { ok: true; tool: { durability: number } } | { ok: false; code: string; reasons: string[] } {
  const tool = w.equipped ? w.tools.find((t) => t.id === w.equipped) : undefined;
  if (!tool || tool.kind !== 'stone_axe') return fail('no_axe', 'you need an axe in hand: craft a stone axe and equip it (bag)');
  if (tool.durability <= 0) return fail('broken_tool', 'your stone axe is broken: craft a new one');
  return { ok: true, tool };
}
function rate(world: World, f: FellState): { ok: false; code: string; reasons: string[] } | null {
  const tick = tickOf(world);
  return f.swing.tick === tick && f.swing.n >= SWINGS_PER_TICK ? fail('too_fast', `too fast: at most ${SWINGS_PER_TICK} swings every 2 s`) : null;
}
function spend(world: World, f: FellState, tool: { durability: number }): void {
  const tick = tickOf(world);
  if (f.swing.tick !== tick) f.swing = { tick, n: 0 };
  f.swing.n++;
  tool.durability -= 1;
}

/**
 * The tree entity of an id, generating its chunk first: the simulation never
 * depends on what a renderer or a walk happened to load (replay generates it too).
 */
export function treeEntity(world: World, id: string): Entity | undefined {
  const m = /^e:(\d{1,2}),(\d{1,2}):\d+$/.exec(id);
  if (m) ensureChunk(world, Number(m[1]), Number(m[2]));
  return world.entities.get(id);
}

/** A tree's standing stage for chopping, or why it cannot be chopped. */
export function choppable(world: World, e: Entity | undefined): { ok: true; sp: TreeSpecies; stage: Standing } | { ok: false; code: string; reasons: string[] } {
  if (!e || !e.kind.startsWith('styl_tree_') || world.entityRemovals.has(e.id)) return fail('not_found', 'there is no tree there');
  const life = treeLife(world, e);
  if (!life || !life.present) return fail('not_choppable', 'nothing stands here');
  if (!isStanding(life.stage)) return fail('not_choppable', 'only a stump is left: it regrows by itself');
  return { ok: true, sp: life.species, stage: life.stage };
}

/** Distance from (x, z) to the trunk's surface (m). */
export function treeDistance(e: Entity, stage: Standing, x: number, z: number): number {
  return Math.hypot(e.x - x, e.z - z) - LIFE_TRUNK[stage as TreeStage] * e.scale;
}

/** The fall direction: of the 16, the one most nearly away from the player (ties: lowest index). */
export function fallDirection(e: Entity, at: At): number {
  const vx = e.x * 10 - at.x, vz = e.z * 10 - at.z;
  let best = 0, bd = -Infinity;
  for (let i = 0; i < 16; i++) {
    const d = DIRS16[i][0] * vx + DIRS16[i][1] * vz;
    if (d > bd + 1e-9) { bd = d; best = i; }
  }
  return best;
}

export interface ChopValue {
  hp: number; max: number; durability: number; events: FellEvent[];
  trunkId?: string; branchPile?: string;
}

/** One axe swing at a standing tree. */
export function chopTree(world: World, entityId: string, at: At): WildResult<ChopValue> {
  const w = world.wild!, f = w.fell!;
  const axe = axeOf(w);
  if (!axe.ok) return axe;
  const e = treeEntity(world, entityId);
  const c = choppable(world, e);
  if (!c.ok) return c;
  if (treeDistance(e!, c.stage, at.x / 10, at.z / 10) > CHOP_REACH) return fail('out_of_reach', `out of reach: walk up to the trunk (${CHOP_REACH} m)`);
  const slow = rate(world, f);
  if (slow) return slow;
  const max = treeHp(c.sp, c.stage);
  let rec = f.chop.get(entityId);
  if (!rec && f.chop.size >= MAX_DAMAGED) return fail('too_many', 'too many trees partly chopped in this world');
  const tick = tickOf(world);
  spend(world, f, axe.tool);
  const events: FellEvent[] = [];
  if (!rec) {
    rec = { id: entityId, hp: max, max };
    f.chop.set(entityId, rec);
    events.push(note(f, tick, 'CHOP_STARTED', entityId));
  } else if (rec.max !== max) {
    // The tree grew into another stage while partly chopped: the cuts already made still count.
    rec.hp = Math.max(1, max - (rec.max - rec.hp));
    rec.max = max;
  }
  rec.hp -= 1;
  events.push(note(f, tick, 'TREE_DAMAGED', entityId, rec.max - rec.hp));
  if (rec.hp > 0) return { ok: true, value: { hp: rec.hp, max: rec.max, durability: axe.tool.durability, events } };
  f.chop.delete(entityId);
  const fell = fellTree(world, w, e!, c.sp, c.stage, at);
  events.push(note(f, tick, 'TREE_FELLED', entityId), note(f, tick, 'TRUNK_CREATED', fell.trunkId, fell.logs));
  return { ok: true, value: { hp: 0, max: rec.max, durability: axe.tool.durability, events, trunkId: fell.trunkId, ...(fell.branchPile ? { branchPile: fell.branchPile } : {}) } };
}

/** The standing tree becomes an M013 stump and a trunk lies where it fell. */
function fellTree(world: World, w: WildState, e: Entity, sp: TreeSpecies, stage: Standing, at: At): { trunkId: string; logs: number; branchPile?: string } {
  const f = w.fell!, wl = f.woodland, tick = tickOf(world);
  let rec = recordOf(wl, e.id);
  if (!rec) rec = addRecord(wl, { id: e.id, sp, st: 'live', born: naturalBorn(world, e, wl, sp), at: tick, next: -1, from: 'wild' });
  // M013 rules: a living broadleaf stump may resprout (coppice roll on the woodland stream); otherwise it rots.
  const g = GROWTH[rec.sp];
  const sprout = stage !== 'dying' && stage !== 'snag' && woodRnd(wl) < g.coppice;
  rec.st = 'stump'; rec.at = tick; rec.next = tick + days(sprout ? g.resprout : g.rot);
  if (sprout) rec.sprout = true; else delete rec.sprout;
  wl.felled++;
  e.harvested = true;
  e.harvestedOnce = true;
  e.remaining = 0;
  world.entityChanges.add(e.chunk);
  touchNature(world);
  noteTreeChange(world, e.id);
  const dir = fallDirection(e, at);
  const len = Math.max(8, Math.round(TREE_LEN[sp] * STAGE_LEN[stage] * e.scale * 10));
  const r = Math.max(4, Math.round(TRUNK_W[sp] / 2 * STAGE_W[stage] * e.scale * 100));
  const logs = trunkLogs(sp, stage);
  const trunkId = `t:${w.nextId++}`;
  const y = surfaceAt(world, Math.floor(e.x), Math.floor(e.z));
  f.trunks.set(trunkId, { id: trunkId, tree: e.id, sp, stage, x: e.x, y, z: e.z, dir, len, r, logs, left: logs, work: 0 });
  const n = CROWN_BRANCHES[stage];
  let branchPile: string | undefined;
  if (n > 0 && w.piles.size < 512) {
    const [dx, dz] = DIRS16[dir];
    const s = len / 10 * 0.8;
    const bx = round2(e.x + dx * s - dz * 0.9), bz = round2(e.z + dz * s + dx * 0.9);
    if (Math.abs(bx) < HALF - 1 && Math.abs(bz) < HALF - 1) {
      branchPile = `d:${w.nextId++}`;
      w.piles.set(branchPile, { id: branchPile, item: 'branch', qty: n, x: bx, y: surfaceAt(world, Math.floor(bx), Math.floor(bz)), z: bz });
    }
  }
  return { trunkId, logs, ...(branchPile ? { branchPile } : {}) };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The trunk's current extent: from the stump's cut to the uncut end (m). */
export function trunkSegment(t: Trunk): { ax: number; az: number; bx: number; bz: number; dx: number; dz: number; length: number } {
  const [dx, dz] = DIRS16[t.dir];
  const length = t.len / 10 * t.left / t.logs;
  const a = 0;
  return { ax: t.x + dx * a, az: t.z + dz * a, bx: t.x + dx * length, bz: t.z + dz * length, dx, dz, length };
}
/** Horizontal distance from (x, z) to the trunk's axis, and the closest point. */
export function trunkDistance(t: Trunk, x: number, z: number): { d: number; px: number; pz: number } {
  const s = trunkSegment(t);
  const vx = s.bx - s.ax, vz = s.bz - s.az, l2 = vx * vx + vz * vz;
  const k = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / l2)) : 0;
  const px = s.ax + vx * k, pz = s.az + vz * k;
  return { d: Math.hypot(x - px, z - pz), px, pz };
}

export interface CutValue { left: number; work: number; durability: number; events: FellEvent[]; pileId?: string }

/** One axe swing along a fallen trunk: every `cutSwings` swings a log comes off the far end. */
export function cutLog(world: World, trunkId: string, at: At): WildResult<CutValue> {
  const w = world.wild!, f = w.fell!;
  const axe = axeOf(w);
  if (!axe.ok) return axe;
  const t = f.trunks.get(trunkId);
  if (!t) return fail('not_found', 'there is no trunk there');
  if (trunkDistance(t, at.x / 10, at.z / 10).d - t.r / 100 > CHOP_REACH) return fail('out_of_reach', `out of reach: walk up to the trunk (${CHOP_REACH} m)`);
  const slow = rate(world, f);
  if (slow) return slow;
  if (w.piles.size >= 512) return fail('too_many_piles', 'too many piles on the ground in this world');
  const tick = tickOf(world);
  spend(world, f, axe.tool);
  t.work++;
  const events: FellEvent[] = [];
  let pileId: string | undefined;
  if (t.work >= cutSwings(t)) {
    t.work = 0;
    const k = t.left - 1;
    const [dx, dz] = DIRS16[t.dir];
    const s = t.len / 10 * (k + 0.5) / t.logs, side = t.r / 100 + 0.5;
    let lx = round2(t.x + dx * s - dz * side), lz = round2(t.z + dz * s + dx * side);
    lx = Math.max(-HALF + 1, Math.min(HALF - 1, lx)); lz = Math.max(-HALF + 1, Math.min(HALF - 1, lz));
    pileId = `d:${w.nextId++}`;
    w.piles.set(pileId, { id: pileId, item: 'log', qty: 1, x: lx, y: surfaceAt(world, Math.floor(lx), Math.floor(lz)), z: lz });
    t.left = k;
    events.push(note(f, tick, 'LOGS_CREATED', pileId, 1));
    if (t.left === 0) f.trunks.delete(trunkId);
  }
  return { ok: true, value: { left: t.left, work: t.work, durability: axe.tool.durability, events, ...(pileId ? { pileId } : {}) } };
}

/** A stockpile marker on the ground where the player stands. */
export function markStockpile(world: World, at: At): WildResult<{ stockpileId: string; events: FellEvent[] }> {
  const w = world.wild!, f = w.fell!;
  const x = at.x / 10, z = at.z / 10;
  if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) return fail('out_of_world', 'outside the world');
  if (waterDepthAt(world, Math.floor(x), Math.floor(z)) > 0) return fail('water', 'not in water: mark the stockpile on dry ground');
  if (f.stockpiles.size >= MAX_STOCKPILES) return fail('too_many', `you can mark ${MAX_STOCKPILES} stockpiles`);
  for (const s of f.stockpiles.values()) if (Math.hypot(s.x - x, s.z - z) < STOCKPILE_SPACING) return fail('too_close', `another stockpile is within ${STOCKPILE_SPACING} m`);
  for (const t of f.trunks.values()) if (trunkDistance(t, x, z).d < t.r / 100 + 1) return fail('blocked', 'a fallen trunk lies here');
  const id = `s:${w.nextId++}`;
  f.stockpiles.set(id, { id, x, y: surfaceAt(world, Math.floor(x), Math.floor(z)), z, delivered: 0 });
  return { ok: true, value: { stockpileId: id, events: [note(f, tickOf(world), 'STOCKPILE_MARKED', id)] } };
}

/** The stockpile a drop at `at` delivers to, if any (nearest; ties by id). */
export function stockpileAt(world: World, x: number, z: number): StockpileMarker | null {
  const f = world.wild?.fell;
  if (!f) return null;
  let best: StockpileMarker | null = null, bd = STOCKPILE_RADIUS;
  for (const s of [...f.stockpiles.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d <= bd && (!best || d < bd)) { best = s; bd = d; }
  }
  return best;
}

/** Deliver carried logs to a stockpile: they join its log pile there. */
export function deliverLogs(world: World, s: StockpileMarker, n: number): { pileId: string; events: FellEvent[] } {
  const w = world.wild!, f = w.fell!;
  w.items.log -= n;
  if (w.items.log === 0) delete w.items.log;
  let pile = [...w.piles.values()].find((p) => p.item === 'log' && p.x === s.x && p.z === s.z);
  if (pile) pile.qty += n;
  else {
    const id = `d:${w.nextId++}`;
    pile = { id, item: 'log', qty: n, x: s.x, y: s.y, z: s.z };
    w.piles.set(id, pile);
  }
  s.delivered += n;
  return { pileId: pile.id, events: [note(f, tickOf(world), 'LOGS_DELIVERED', s.id, n)] };
}

/** Logs lying at a stockpile now. */
export function stockpileLogs(world: World, s: StockpileMarker): number {
  let n = 0;
  for (const p of world.wild?.piles.values() ?? []) if (p.item === 'log' && Math.hypot(p.x - s.x, p.z - s.z) <= STOCKPILE_RADIUS) n += p.qty;
  return n;
}

// ---------- the lifecycle (ported from M013 stepWoodland, step 1, without the homestead window) ----------

function regrow(world: World, w: WoodlandState, e: Entity, from: TreeOrigin, tick: number): void {
  const rec = recordOf(w, e.id)!;
  e.harvested = false;
  delete e.harvestedOnce;
  e.remaining = 12; e.yieldPerHarvest = 4;
  world.entityChanges.add(e.chunk);
  rec.st = 'live'; rec.born = tick; rec.at = tick; rec.next = tick + fallAge(rec.sp, e.id); rec.from = from;
  delete rec.sprout;
  touchNature(world);
  noteTreeChange(world, e.id);
}

/**
 * One tick of the wilderness woodland: due record events, oldest first,
 * bounded. A snag that grew from a stump falls; a coppicing stump puts up
 * shoots (a sapling, same id); a stump that does not resprout rots, and its
 * spot reseeds in place after the species' gap time (the wilderness has no
 * forester, so the spot regrows as a fallen snag's does in M013).
 */
export function stepFelling(world: World, tick: number): void {
  const f = world.wild?.fell;
  if (!f) return;
  const wl = f.woodland;
  const due = wl.trees.filter((t) => t.next >= 0 && t.next <= tick).sort((a, b) => a.next - b.next || a.id.localeCompare(b.id)).slice(0, FELL_EVENTS_PER_TICK);
  for (const t of due) {
    const e = treeEntity(world, t.id);
    if (!e) { t.next = -1; continue; }
    if (t.st === 'live') {
      t.st = 'gap'; t.at = tick; t.next = tick + gapTicks(t.sp, t.id);
      e.harvested = true;
      world.entityChanges.add(e.chunk);
      touchNature(world); noteTreeChange(world, e.id);
    } else if (t.st === 'stump' && t.sprout) {
      regrow(world, wl, e, 'sprout', tick);
      wl.sprouted++;
    } else if (t.st === 'stump') {
      t.st = 'gap'; t.at = tick; t.next = tick + gapTicks(t.sp, t.id);
      touchNature(world); noteTreeChange(world, e.id);
    } else {
      regrow(world, wl, e, 'regrow', tick);
    }
    f.chop.delete(t.id);
  }
}

// ---------- queries (UI, tests) ----------

export interface NearTree { e: Entity; sp: TreeSpecies; stage: Standing; d: number }
/** Choppable trees of the generated chunks within `r` m of (x, z), nearest trunk first (ties by id). Generates nothing. */
export function treesNear(world: World, x: number, z: number, r: number): NearTree[] {
  const out: NearTree[] = [];
  const c0x = worldToChunkX(Math.floor(x - r)), c1x = worldToChunkX(Math.floor(x + r));
  const c0z = worldToChunkZ(Math.floor(z - r)), c1z = worldToChunkZ(Math.floor(z + r));
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    for (const id of world.entityChunks.get(chunkKey(cx, cz)) ?? []) {
      const e = world.entities.get(id);
      if (!e || !e.kind.startsWith('styl_tree_') || Math.abs(e.x - x) > r + 2 || Math.abs(e.z - z) > r + 2) continue;
      const c = choppable(world, e);
      if (!c.ok) continue;
      const d = treeDistance(e, c.stage, x, z);
      if (d <= r) out.push({ e, sp: c.sp, stage: c.stage, d });
    }
  }
  out.sort((a, b) => a.d - b.d || a.e.id.localeCompare(b.e.id));
  return out;
}

/** Trunks within `r` m of (x, z) (to the trunk surface), nearest first. */
export function trunksNear(world: World, x: number, z: number, r: number): Array<{ t: Trunk; d: number }> {
  const f = world.wild?.fell;
  if (!f) return [];
  const out: Array<{ t: Trunk; d: number }> = [];
  for (const t of f.trunks.values()) {
    if (Math.hypot(t.x - x, t.z - z) > t.len / 10 + r + 1) continue;
    const d = trunkDistance(t, x, z).d - t.r / 100;
    if (d <= r) out.push({ t, d });
  }
  return out.sort((a, b) => a.d - b.d || a.t.id.localeCompare(b.t.id));
}

// ---------- collision (player-local physics reads these) ----------

/** Trunks near (x, z) that block walking (thick enough). */
export function blockingTrunks(world: World, x: number, z: number, r: number): Trunk[] {
  const f = world.wild?.fell;
  if (!f || f.trunks.size === 0) return [];
  const out: Trunk[] = [];
  for (const t of f.trunks.values()) {
    if (t.r * 2 / 100 < WALK_OVER) continue;
    if (Math.hypot(t.x - x, t.z - z) > t.len / 10 + r) continue;
    out.push(t);
  }
  return out;
}

// ---------- snapshot form ----------

export interface FellSnapshot {
  chop: DamageRecord[];
  eventSeq: number;
  events: EventRecord[];
  stockpiles: StockpileMarker[];
  swing: { n: number; tick: number };
  trunks: Trunk[];
  woodland: WoodlandState;
}

export function fellSnapshot(f: FellState): FellSnapshot {
  return {
    chop: [...f.chop.values()].sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({ id: c.id, hp: c.hp, max: c.max })),
    eventSeq: f.eventSeq,
    events: f.events.map((e) => ({ seq: e.seq, tick: e.tick, type: e.type, ref: e.ref, ...(e.n !== undefined ? { n: e.n } : {}) })),
    stockpiles: [...f.stockpiles.values()].sort((a, b) => a.id.localeCompare(b.id)).map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z, delivered: s.delivered })),
    swing: { n: f.swing.n, tick: f.swing.tick },
    trunks: [...f.trunks.values()].sort((a, b) => a.id.localeCompare(b.id)).map((t) => ({
      id: t.id, tree: t.tree, sp: t.sp, stage: t.stage, x: t.x, y: t.y, z: t.z, dir: t.dir, len: t.len, r: t.r, logs: t.logs, left: t.left, work: t.work,
    })),
    woodland: woodlandSnapshot(f.woodland),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const TREE_ENTITY = /^e:\d{1,2},\d{1,2}:\d{1,5}$/;
export const TRUNK_ID = /^t:\d{1,7}$/;
export const STOCKPILE_ID = /^s:\d{1,7}$/;
export const isTreeEntityId = (v: unknown): v is string => typeof v === 'string' && TREE_ENTITY.test(v);

/** Strict canonical form; throws otherwise. `nextId` bounds the ids; `tick` the times. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateFell(raw: unknown, tick: number, nextId: number): FellSnapshot {
  const bad = (what: string): never => { throw new Error(`snapshot wilderness felling: invalid ${what}`); };
  if (!isObj(raw) || !Array.isArray(raw.chop) || !Array.isArray(raw.events) || !Array.isArray(raw.stockpiles) || !Array.isArray(raw.trunks)
    || !isObj(raw.swing) || !int(raw.eventSeq, 0, Number.MAX_SAFE_INTEGER)) bad('fields');
  const v = raw as Record<string, unknown>;
  const chopIds = new Set<string>();
  if ((v.chop as unknown[]).length > MAX_DAMAGED) bad('damaged trees');
  const chop = (v.chop as unknown[]).map((c: any) => {
    if (!isObj(c) || !isTreeEntityId(c.id) || chopIds.has(c.id) || !int(c.max, 2, 100) || !int(c.hp, 1, (c.max as number) - 1)) bad('damaged tree');
    chopIds.add((c as { id: string }).id);
    return { id: c.id as string, hp: c.hp as number, max: c.max as number };
  });
  const sw = v.swing as Record<string, unknown>;
  if (!int(sw.n, 0, SWINGS_PER_TICK) || !int(sw.tick, 0, tick)) bad('swing');
  if ((v.events as unknown[]).length > MAX_EVENTS) bad('events');
  let lastSeq = -1;
  const events = (v.events as unknown[]).map((e: any) => {
    if (!isObj(e) || !int(e.seq, lastSeq + 1, (v.eventSeq as number) - 1) || !int(e.tick, 0, tick) || !FELL_EVENTS.includes(e.type as FellEvent)
      || typeof e.ref !== 'string' || e.ref.length > 64 || e.n !== undefined && !int(e.n, 0, 10_000)) bad('event');
    lastSeq = e.seq as number;
    return { seq: e.seq as number, tick: e.tick as number, type: e.type as FellEvent, ref: e.ref as string, ...(e.n !== undefined ? { n: e.n as number } : {}) };
  });
  const below = (id: string) => Number(id.slice(2)) < nextId;
  if ((v.stockpiles as unknown[]).length > MAX_STOCKPILES) bad('stockpiles');
  const stockpiles = (v.stockpiles as unknown[]).map((s: any) => {
    if (!isObj(s) || typeof s.id !== 'string' || !STOCKPILE_ID.test(s.id) || !below(s.id) || !fin(s.x) || !fin(s.y) || !fin(s.z)
      || Math.abs(s.x) >= HALF || Math.abs(s.z) >= HALF || !int(s.delivered, 0, 1_000_000)) bad('stockpile');
    return { id: s.id as string, x: s.x as number, y: s.y as number, z: s.z as number, delivered: s.delivered as number };
  });
  if ((v.trunks as unknown[]).length > MAX_TRUNKS) bad('trunks');
  const trunks = (v.trunks as unknown[]).map((t: any) => {
    if (!isObj(t) || typeof t.id !== 'string' || !TRUNK_ID.test(t.id) || !below(t.id) || !isTreeEntityId(t.tree)
      || !(TREE_SPECIES as readonly string[]).includes(t.sp as string) || !isStanding(String(t.stage))
      || !fin(t.x) || !fin(t.y) || !fin(t.z) || Math.abs(t.x) >= HALF || Math.abs(t.z) >= HALF
      || !int(t.dir, 0, 15) || !int(t.len, 1, 400) || !int(t.r, 1, 200) || !int(t.logs, 1, 40) || !int(t.left, 1, t.logs as number) || !int(t.work, 0, 1)) bad('trunk');
    return { id: t.id as string, tree: t.tree as string, sp: t.sp as TreeSpecies, stage: t.stage as Standing, x: t.x as number, y: t.y as number, z: t.z as number,
      dir: t.dir as number, len: t.len as number, r: t.r as number, logs: t.logs as number, left: t.left as number, work: t.work as number };
  });
  const out: FellSnapshot = {
    chop, eventSeq: v.eventSeq as number, events, stockpiles, swing: { n: sw.n as number, tick: sw.tick as number }, trunks,
    woodland: validateWoodland(v.woodland, tick),
  };
  if (new Set(stockpiles.map((s) => s.id)).size !== stockpiles.length || new Set(trunks.map((t) => t.id)).size !== trunks.length) bad('duplicate id');
  if (JSON.stringify(out) !== JSON.stringify(raw)) bad('canonical form');
  return out;
}

export function fellFromSnapshot(s: FellSnapshot): FellState {
  return {
    chop: new Map(s.chop.map((c) => [c.id, { ...c }])),
    swing: { ...s.swing },
    trunks: new Map(s.trunks.map((t) => [t.id, { ...t }])),
    stockpiles: new Map(s.stockpiles.map((p) => [p.id, { ...p }])),
    events: s.events.map((e) => ({ ...e })),
    eventSeq: s.eventSeq,
    woodland: JSON.parse(JSON.stringify(s.woodland)) as WoodlandState,
  };
}
