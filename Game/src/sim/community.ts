// W10 (wilderness content v11): trading post, finite merchant barter, legitimate settler recruitment & productive work.
// Pure TypeScript simulation rules — zero Three.js imports (D-005).
import { World, HALF } from './world';
import { siteSpotOf } from './wild-build';

export const WILD_CONTENT_V11 = 11 as const;

export const TRADE_REACH = 6.5;
export const SETTLER_WORK_INTERVAL = 10;
export const SETTLER_ID = /^s:\d{1,3}$/;
export const MAX_SETTLERS = 8;

export const SETTLER_ROLES = ['idle', 'forager', 'woodcutter', 'farmer', 'builder'] as const;
export type SettlerRole = (typeof SETTLER_ROLES)[number];

export interface TradeOfferDef {
  id: string;
  label: string;
  /** Item received by the player (1 unit per trade). */
  receive: string;
  receiveQty: number;
  /** Real items paid from the player's bag per trade. */
  give: Record<string, number>;
  /** Finite merchant stock (never regenerates from thin air). */
  initialStock: number;
}

/** Deterministic, finite merchant catalogue at the Trading Post. */
export const MERCHANT_OFFERS: readonly TradeOfferDef[] = [
  { id: 'trade_seeds', label: 'Wild seeds (×3)', receive: 'seeds', receiveQty: 3, give: { berries: 2 }, initialStock: 8 },
  { id: 'trade_iron_ingot', label: 'Iron ingot', receive: 'iron_ingot', receiveQty: 1, give: { plank: 4, stone: 2 }, initialStock: 6 },
  { id: 'trade_cooked_meat', label: 'Cooked meat (×2)', receive: 'cooked_meat', receiveQty: 2, give: { log: 2 }, initialStock: 6 },
  { id: 'trade_saddle', label: 'Leather saddle', receive: 'saddle', receiveQty: 1, give: { plank: 4, iron_ingot: 2, cord: 2 }, initialStock: 2 },
  { id: 'trade_bridle', label: 'Riding bridle', receive: 'bridle', receiveQty: 1, give: { plank: 2, iron_ingot: 1, cord: 2 }, initialStock: 2 },
  { id: 'trade_leather_armour', label: 'Adventurer leather armour', receive: 'leather_armour', receiveQty: 1, give: { hide: 3, iron_ingot: 2 }, initialStock: 1 },
  { id: 'trade_astrix_cape', label: 'ASTrix star cape', receive: 'astrix_cape', receiveQty: 1, give: { hide: 2, plank: 4, iron_ingot: 1 }, initialStock: 1 },
];

export const offerById = (id: string): TradeOfferDef | undefined => MERCHANT_OFFERS.find((o) => o.id === id);

/** Food rations required to recruit a settler (real bag items consumed). */
export const RECRUIT_FOOD_COST: Record<string, number> = {
  cooked_meat: 3,
  cooked_mushroom: 4,
  berries: 8,
};

const SETTLER_NAMES = ['Alden', 'Bryn', 'Cora', 'Dain', 'Elin', 'Fenn', 'Gale', 'Hana'] as const;

export interface SettlerRecord {
  id: string;
  name: string;
  role: SettlerRole;
  /** Position in decimetres (dm, integer). */
  x: number;
  z: number;
  /** World tick progress toward next real production output. */
  workTicks: number;
  /** Lifetime units produced by this settler. */
  produced: number;
  /** Cycle counter for alternating deterministic outputs. */
  cycles: number;
}

export interface CommunityState {
  /** Remaining finite merchant stock keyed by offer id. */
  stock: Record<string, number>;
  tradesCompleted: number;
  settlers: Map<string, SettlerRecord>;
  nextSettlerId: number;
  /** Real items produced by working settlers, stored at the settlement depot until collected. */
  depot: Record<string, number>;
}

export interface CommunitySnapshot {
  depot: Record<string, number>;
  nextSettlerId: number;
  settlers: SettlerRecord[];
  stock: Record<string, number>;
  tradesCompleted: number;
}

export function createCommunity(): CommunityState {
  const stock: Record<string, number> = {};
  for (const o of MERCHANT_OFFERS) stock[o.id] = o.initialStock;
  return {
    stock,
    tradesCompleted: 0,
    settlers: new Map(),
    nextSettlerId: 1,
    depot: {},
  };
}

/** Finished trading posts in the world. */
export function finishedTradingPosts(world: World) {
  const b = world.wild?.build;
  if (!b) return [];
  return [...b.sites.values()].filter((s) => s.state === 'done' && s.kind === 'trading_post');
}

export function tradingPostNear(world: World, at: { x: number; z: number }): boolean {
  const px = at.x / 10, pz = at.z / 10;
  return finishedTradingPosts(world).some((s) => {
    const c = siteSpotOf(s);
    return Math.hypot(c.x - px, c.z - pz) <= TRADE_REACH;
  });
}

/** Shelter capacity for settlers: 1 per finished lean-to, 2 per finished timber hut. */
export function shelterCapacity(world: World): number {
  const b = world.wild?.build;
  if (!b) return 0;
  let cap = 0;
  for (const s of b.sites.values()) {
    if (s.state !== 'done') continue;
    if (s.kind === 'lean_to') cap += 1;
    else if (s.kind === 'timber_hut') cap += 2;
  }
  return cap;
}

/** True when the settlement has real storage (log_store, trading_post, or wooden chest). */
export function hasSettlementStorage(world: World): boolean {
  const w = world.wild;
  if (!w) return false;
  if ((w.items.chest ?? 0) > 0) return true;
  if (w.build) {
    for (const s of w.build.sites.values()) {
      if (s.state === 'done' && (s.kind === 'log_store' || s.kind === 'trading_post')) return true;
    }
  }
  return false;
}

export function nextSettlerName(seed: number, index: number): string {
  const idx = ((seed >>> 0) + index) % SETTLER_NAMES.length;
  return SETTLER_NAMES[idx];
}

/** Step productive settler work on each world tick. Produces real items into community.depot. */
export function stepCommunity(world: World, _tick: number): void {
  const c = world.wild?.community;
  if (!c || c.settlers.size === 0) return;
  const hasSeeds = (world.wild?.items.seeds ?? 0) > 0 || (c.depot.seeds ?? 0) > 0;
  for (const s of c.settlers.values()) {
    if (s.role === 'idle') continue;
    s.workTicks += 1;
    if (s.workTicks < SETTLER_WORK_INTERVAL) continue;
    s.workTicks = 0;
    s.cycles += 1;
    const add = (item: string, n: number) => {
      c.depot[item] = (c.depot[item] ?? 0) + n;
      s.produced += n;
    };
    if (s.role === 'forager') {
      add(s.cycles % 2 === 1 ? 'berries' : 'fiber', 1);
    } else if (s.role === 'woodcutter') {
      add(s.cycles % 2 === 0 ? 'log' : 'branch', 1);
    } else if (s.role === 'farmer') {
      add(s.cycles % 2 === 1 ? 'mushroom' : 'berries', hasSeeds ? 2 : 1);
    } else if (s.role === 'builder') {
      add('plank', 1);
    }
  }
}

// ---------- snapshot ----------
function sortRec(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
}

export function communitySnapshot(c: CommunityState): CommunitySnapshot {
  const stock: Record<string, number> = {};
  for (const o of MERCHANT_OFFERS) stock[o.id] = c.stock[o.id] ?? 0;
  return {
    depot: sortRec(c.depot),
    nextSettlerId: c.nextSettlerId,
    settlers: [...c.settlers.values()].sort((a, b) => a.id.localeCompare(b.id)).map((s) => ({ ...s })),
    stock,
    tradesCompleted: c.tradesCompleted,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const uintMax = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const intRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

export function validateCommunity(value: unknown, itemOk: (k: unknown) => boolean): CommunitySnapshot {
  const bad = (what: string): never => { throw new Error(`snapshot community: invalid ${what}`); };
  if (!isObj(value)) bad('object');
  const v = value as Record<string, unknown>;
  if (!uintMax(v.tradesCompleted, 100_000) || !uintMax(v.nextSettlerId, 1000) || (v.nextSettlerId as number) < 1) bad('counters');
  if (!isObj(v.stock) || !isObj(v.depot) || !Array.isArray(v.settlers)) bad('fields');

  const stock: Record<string, number> = {};
  for (const o of MERCHANT_OFFERS) {
    const n = (v.stock as Record<string, unknown>)[o.id];
    if (!uintMax(n, o.initialStock)) bad(`stock:${o.id}`);
    stock[o.id] = n as number;
  }
  if (Object.keys(v.stock as Record<string, unknown>).length !== MERCHANT_OFFERS.length) bad('stock keys');

  const depot: Record<string, number> = {};
  for (const [k, n] of Object.entries(v.depot as Record<string, unknown>)) {
    if (!itemOk(k) || !uintMax(n, 10_000) || (n as number) < 1) bad('depot item');
    depot[k] = n as number;
  }

  if ((v.settlers as unknown[]).length > MAX_SETTLERS) bad('settlers count');
  const seen = new Set<string>();
  const settlers: SettlerRecord[] = [];
  const lim = HALF * 10;
  for (const raw of v.settlers as unknown[]) {
    if (!isObj(raw)) bad('settler');
    const s = raw as Record<string, unknown>;
    if (typeof s.id !== 'string' || !SETTLER_ID.test(s.id) || seen.has(s.id)) bad('settler id');
    if (typeof s.name !== 'string' || s.name.length < 1 || s.name.length > 32) bad('settler name');
    if (!SETTLER_ROLES.includes(s.role as SettlerRole)) bad('settler role');
    if (!intRange(s.x, -lim, lim) || !intRange(s.z, -lim, lim)) bad('settler coords');
    if (!uintMax(s.workTicks, SETTLER_WORK_INTERVAL) || !uintMax(s.produced, 100_000) || !uintMax(s.cycles, 100_000)) bad('settler work');
    const id = s.id as string;
    seen.add(id);
    settlers.push({
      id,
      name: s.name as string,
      role: s.role as SettlerRole,
      x: s.x as number,
      z: s.z as number,
      workTicks: s.workTicks as number,
      produced: s.produced as number,
      cycles: s.cycles as number,
    });
  }

  return {
    depot,
    nextSettlerId: v.nextSettlerId as number,
    settlers,
    stock,
    tradesCompleted: v.tradesCompleted as number,
  };
}

export function restoreCommunity(snap: CommunitySnapshot): CommunityState {
  const settlers = new Map<string, SettlerRecord>();
  for (const s of snap.settlers) settlers.set(s.id, { ...s });
  return {
    stock: { ...snap.stock },
    tradesCompleted: snap.tradesCompleted,
    settlers,
    nextSettlerId: snap.nextSettlerId,
    depot: { ...snap.depot },
  };
}
