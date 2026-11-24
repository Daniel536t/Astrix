// M006 living homestead: villagers with jobs, a watered farm, livestock with
// needs, products and reproduction, all as authoritative schema-3 state.
//
// Rules of this module (same as the rest of the life loop):
//  - every mutation happens inside an accepted command (found, act, assign) or
//    inside the journaled `tick`; rendering never writes here;
//  - integers only: positions are decimetres, needs are 0..100 counters;
//  - iteration is in sorted id order; randomness comes from `rng`, a seeded
//    xorshift state stored in the snapshot, never from Math.random;
//  - resources move between real inventories (the founder stockpile, the
//    player's carried bag, troughs, the coop's egg box): nothing is invented
//    except by an explicit biological source (crop growth, animal products,
//    births), and those are rule-driven, not presentation.
import type { World } from './world';
import { MAT, getVoxel, surfaceAt, waterDepthAt } from './world';
import {
  CARRIED_CAPACITY, FOUNDER_STOCKPILE, FOUNDER_STOCKPILE_ID, LifeResult, RECIPES, total, lifeState,
} from './economy';

export const HOMESTEAD_VERSION = 1 as const;
/** Decimetres per metre: sim positions are integer decimetres. */
export const DM = 10;
/** One in-game day: 300 ticks of 2 s = 10 minutes, matching the sky's day length. */
export const DAY_TICKS = 300;
/** Night inside a day (ticks), when villagers go home and rest. */
export const NIGHT_START = 171;
export const NIGHT_END = 291;
export const VILLAGER_SPEED = 26; // dm per tick (1.3 m/s)
export const ANIMAL_SPEED = 7;
export const MAX_VILLAGERS = 8;
export const MAX_ANIMALS = 60;

// ---- farming: the player decides where fields go, how big they are and what grows ----
export type CropKind = 'wheat' | 'potato' | 'flax';
export const CROPS: readonly CropKind[] = ['flax', 'potato', 'wheat'];
export interface CropRule {
  label: string;
  growTicks: number;
  /** Moisture lost every this many growing ticks: lower means thirstier. */
  drainEvery: number;
  /** Harvest per field unit (9 m²). Seed returned keeps the cycle going. */
  yield: Record<string, number>;
  purpose: string;
}
export const CROP_RULES: Record<CropKind, CropRule> = {
  wheat: { label: 'Wheat', growTicks: 60, drainEvery: 4, yield: { food: 3, seed: 2, fiber: 2 },
    purpose: 'grain for food, straw for the animals, and seed' },
  potato: { label: 'Potatoes', growTicks: 90, drainEvery: 6, yield: { food: 6, seed: 1 },
    purpose: 'the most food per field; slow, but needs less water' },
  flax: { label: 'Flax', growTicks: 70, drainEvery: 4, yield: { fiber: 5, seed: 2 },
    purpose: 'fibre: straw for the troughs and, later, linen' },
};
/** A field unit is 3 x 3 m: seed, work, water and harvest all scale with units. */
export const UNIT_M2 = 9;
export const FIELD_MIN = 2;
export const FIELD_MAX = 10;
export const MAX_FIELDS = 12;
export const MAX_FIELD_AREA = 400;
/** Fields must lie within this distance (metres) of the farmhouse. */
export const FIELD_RANGE = 45;
/** Wood for the fence: one per 4 m of perimeter. */
export const fenceCost = (w: number, d: number) => Math.ceil((2 * (w + d)) / 4);
export const fieldUnits = (w: number, d: number) => Math.ceil((w * d) / UNIT_M2);
export const MOISTURE_MAX = 12;
/** A crop dry for this long withers and the seed is lost. */
export const WITHER_TICKS = 45;
/** Digging work per field unit (ticks of villager work; the player does 3 per action). */
export const TILL_PER_UNIT = 4;

// ---- livestock ----
export type Species = 'chicken' | 'sheep' | 'goat' | 'pig' | 'cattle' | 'horse';
export const SPECIES: readonly Species[] = ['cattle', 'chicken', 'goat', 'horse', 'pig', 'sheep'];
export type EnclosureId = 'coop' | 'pen' | 'sty' | 'paddock';
export interface SpeciesRule {
  label: string;
  enclosure: EnclosureId;
  /** Pasture eaten per meal (grass, roots, insects); when the pasture is bare it eats trough feed. */
  graze: number;
  /** Trough feed (fiber: straw and grain) per meal when not grazing. */
  feed: number;
  adultAge: number;
  gestation: number;
  litter: number;
  /** Product that accumulates while fed; collected by a herder or the player. */
  product: null | { resource: 'eggs' | 'wool' | 'milk'; every: number; amount: number; females: boolean };
  purpose: string;
}
export const SPECIES_RULES: Record<Species, SpeciesRule> = {
  chicken: { label: 'Chicken', enclosure: 'coop', graze: 2, feed: 1, adultAge: 150, gestation: 90, litter: 1,
    product: { resource: 'eggs', every: 120, amount: 1, females: true }, purpose: 'lays eggs' },
  sheep: { label: 'Sheep', enclosure: 'pen', graze: 8, feed: 1, adultAge: 300, gestation: 220, litter: 1,
    product: { resource: 'wool', every: 300, amount: 2, females: false }, purpose: 'grows wool' },
  goat: { label: 'Goat', enclosure: 'pen', graze: 6, feed: 1, adultAge: 300, gestation: 200, litter: 1,
    product: { resource: 'milk', every: 150, amount: 1, females: true }, purpose: 'gives milk' },
  pig: { label: 'Pig', enclosure: 'sty', graze: 5, feed: 1, adultAge: 250, gestation: 150, litter: 2,
    product: null, purpose: 'breeds quickly (meat and leather come with the butcher)' },
  cattle: { label: 'Cattle', enclosure: 'paddock', graze: 12, feed: 2, adultAge: 500, gestation: 300, litter: 1,
    product: { resource: 'milk', every: 150, amount: 2, females: true }, purpose: 'gives milk (draught work comes with ploughs)' },
  horse: { label: 'Horse', enclosure: 'paddock', graze: 12, feed: 2, adultAge: 600, gestation: 400, litter: 1,
    product: null, purpose: 'kept for riding and carts (transport comes with roads)' },
};
export const HUNGER_MEAL = 60;
export const STARVING_DEATH_TICKS = 240;
export const GRASS_MAX = 100;
export const TROUGH_MAX = 30;
export const EGG_BOX_MAX = 12;
export const BUCKET = 10; // trough water from one bucket
/** A farmer's watering can holds this many waterings. */
export const CAN_WATERINGS = 3;

// ---- villagers ----
export type Role = 'farmer' | 'herder';
export const ROLES: readonly Role[] = ['farmer', 'herder'];
export const FOOD_PREFERENCE = ['rations', 'eggs', 'milk', 'food'] as const;
/** Resources a villager can carry in one load (one stack at a time). */
export type Carry = { item: string; amount: number } | null;
export type Effect =
  | 'take' | 'store' | 'till' | 'sow' | 'reap' | 'water_plot' | 'draw' | 'water_trough' | 'fill_feed'
  | 'gather_eggs' | 'shear' | 'milk' | 'eat' | 'rest' | 'restock' | 'thresh' | 'none';
export interface Leg { op: 'walk' | 'work'; x: number; z: number; ticks: number; effect: Effect; item?: string; amount?: number }
export interface Task { kind: string; target: string; legs: Leg[]; leg: number; progress: number }
export interface Villager {
  id: string; name: string; role: Role; x: number; z: number;
  energy: number; hunger: number; carry: Carry; task: Task | null;
}
export type PlotState = 'wild' | 'tilled' | 'growing' | 'ripe';
/** A field the player marked out: world position (metres, min corner), size and crop. */
export interface Plot {
  id: string; x: number; z: number; w: number; d: number; crop: CropKind;
  state: PlotState; growth: number; moisture: number; dry: number; tilled: number;
}
export interface Enclosure { id: EnclosureId; grass: number; feed: number; water: number; eggs: number }
export interface Animal {
  id: string; species: Species; sex: 'f' | 'm'; born: number; x: number; z: number; tx: number; tz: number;
  hunger: number; starving: number; product: number; pregnantUntil: number;
}
// ---- governance: the steward (AI agent) acts only through these permissions ----
export type Policy = 'auto' | 'approve' | 'off';
export type StewardAction = 'assign_role' | 'expand_field';
export const STEWARD_ACTIONS: readonly StewardAction[] = ['assign_role', 'expand_field'];
export interface Proposal {
  id: string; action: StewardAction; villagerId?: string; role?: Role; reason: string; tick: number;
}
export interface Steward {
  enabled: boolean;
  /** Per action: act directly, ask the owner first, or never. */
  policy: Record<StewardAction, Policy>;
  proposals: Proposal[];
  nextProposal: number;
}
export const MAX_PROPOSALS = 8;

export interface HomesteadState {
  version: typeof HOMESTEAD_VERSION;
  anchorX: number; anchorZ: number;
  rng: number; nextId: number;
  villagers: Villager[]; plots: Plot[]; enclosures: Enclosure[]; animals: Animal[];
  /** Goods set down beside a full store; moved inside when there is room. */
  overflow: Record<string, number>;
  steward: Steward;
}
export const OVERFLOW_CAPACITY = 100;

// ---------- layout (derived from the anchor; never stored twice) ----------

export type FacilityKind = 'farmhouse' | 'well' | 'field' | EnclosureId;
export interface Rect { x0: number; z0: number; x1: number; z1: number } // dm, inclusive-exclusive
export interface Facility {
  id: string; kind: FacilityKind; label: string; rect: Rect;
  /** Where villagers stand to use it (dm). */
  use: { x: number; z: number };
  /** Trough position for enclosures (dm). */
  trough?: { x: number; z: number };
  capacity?: number;
  species?: Species[];
  function: string;
}

const m = (v: number) => Math.round(v * DM);
/** Euclidean length via IEEE sqrt (correctly rounded everywhere), unlike Math.hypot. */
const len2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
const rect = (x: number, z: number, w: number, d: number): Rect => ({ x0: m(x), z0: m(z), x1: m(x + w), z1: m(z + d) });

/** The homestead plan, relative to its anchor (metres). Building models in the renderer read these rects. */
export function homesteadLayout(h: Pick<HomesteadState, 'anchorX' | 'anchorZ'>): Facility[] {
  const ax = h.anchorX, az = h.anchorZ;
  const r = (x: number, z: number, w: number, d: number) => rect(ax + x, az + z, w, d);
  const at = (x: number, z: number) => ({ x: m(ax + x), z: m(az + z) });
  const list: Facility[] = [
    { id: 'farmhouse', kind: 'farmhouse', label: 'Farmhouse', rect: r(-13, -12, 7, 5), use: at(-9.5, -6.4),
      function: 'home: villagers sleep here at night and recover energy' },
    { id: 'well', kind: 'well', label: 'Well', rect: r(-2, -9, 2, 2), use: at(-1, -6.8),
      function: 'water source: buckets for crops and troughs' },
    { id: 'coop', kind: 'coop', label: 'Chicken coop', rect: r(-14, 0, 6, 5), use: at(-11, -0.6), trough: at(-9.2, 3.6),
      capacity: 10, species: ['chicken'], function: 'houses chickens; eggs collect in the nest box' },
    { id: 'pen', kind: 'pen', label: 'Sheep and goat pen', rect: r(-6, 0, 8, 7), use: at(-2, -0.6), trough: at(0.8, 1.2),
      capacity: 10, species: ['sheep', 'goat'], function: 'pasture for sheep and goats; trough for water and feed' },
    { id: 'sty', kind: 'sty', label: 'Pig sty', rect: r(4, 0, 6, 5), use: at(7, -0.6), trough: at(8.8, 1.2),
      capacity: 6, species: ['pig'], function: 'houses pigs; they eat from the trough' },
    { id: 'paddock', kind: 'paddock', label: 'Paddock', rect: r(-6, 9, 16, 8), use: at(2, 8.4), trough: at(8.6, 10.2),
      capacity: 8, species: ['cattle', 'horse'], function: 'pasture and shelter for cattle and horses' },
  ];
  return list;
}

/** A field's footprint (dm) and the spot a worker stands on (its centre). */
export function fieldRect(p: Pick<Plot, 'x' | 'z' | 'w' | 'd'>): Rect { return rect(p.x, p.z, p.w, p.d); }
export function fieldCentre(p: Pick<Plot, 'x' | 'z' | 'w' | 'd'>): { x: number; z: number } {
  return { x: m(p.x + p.w / 2), z: m(p.z + p.d / 2) };
}
export const unitsOf = (p: Pick<Plot, 'w' | 'd'>) => fieldUnits(p.w, p.d);

export function facility(h: HomesteadState, id: string): Facility | undefined {
  return homesteadLayout(h).find((f) => f.id === id);
}

const STOCK = { x: m(FOUNDER_STOCKPILE.x), z: m(FOUNDER_STOCKPILE.z + 1.6) };

// ---------- founding ----------

/** Homestead yard and buildings relative to its anchor (metres); fields go wherever the player wants. */
const FOOTPRINT = { x0: -14, z0: -13, x1: 12, z1: 17 };
/** The founder house and terraced farm sites (M002) that the homestead must not cover. */
const RESERVED_SITES = [{ x0: -62, z0: -48, x1: -51, z1: -39 }, { x0: -54, z0: -44, x1: -44, z1: -42 }, { x0: -40, z0: -44, x1: -25, z1: -33 }];

/**
 * Deterministic site search: a dry, gentle area whose yard edge is next to
 * the founder stockpile (the homestead store), clear of the founder sites.
 */
export function findHomesteadAnchor(world: World): { x: number; z: number } {
  let best = { x: -36, z: -14, score: Infinity };
  for (let cz = -20; cz <= 4; cz += 2) {
    for (let cx = -40; cx <= -24; cx += 2) {
      const fx0 = cx + FOOTPRINT.x0, fz0 = cz + FOOTPRINT.z0, fx1 = cx + FOOTPRINT.x1, fz1 = cz + FOOTPRINT.z1;
      if (RESERVED_SITES.some((r) => fx0 < r.x1 && fx1 > r.x0 && fz0 < r.z1 && fz1 > r.z0)) continue;
      let lo = Infinity, hi = -Infinity, wet = 0;
      for (let z = fz0; z <= fz1; z += 3) {
        for (let x = fx0; x <= fx1; x += 3) {
          const y = surfaceAt(world, x, z);
          lo = Math.min(lo, y); hi = Math.max(hi, y);
          if (waterDepthAt(world, x, z) > 0) wet++;
        }
      }
      // Distance from the farmhouse yard to the store is walking time for every delivery.
      const toStore = len2(cx - 9 - FOUNDER_STOCKPILE.x, cz - 6 - FOUNDER_STOCKPILE.z);
      const score = (hi - lo) * 2 + wet * 25 + toStore * 1.5;
      if (score < best.score) best = { x: cx, z: cz, score };
    }
  }
  return { x: best.x, z: best.z };
}

function seedRng(world: World): number {
  let h = (world.seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return h === 0 ? 0x6d2b79f5 : h;
}

export function rnd(h: HomesteadState): number {
  let x = h.rng;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  h.rng = x === 0 ? 0x6d2b79f5 : x;
  return h.rng / 4294967296;
}

/** Supplies delivered into the founder stockpile when the homestead is founded. */
export const FOUNDING_SUPPLIES = { fiber: 20, food: 10, seed: 6 } as const;

const STARTER_HERD: Array<[Species, 'f' | 'm']> = [
  ['chicken', 'f'], ['chicken', 'f'], ['chicken', 'f'], ['chicken', 'm'],
  ['sheep', 'f'], ['sheep', 'f'], ['sheep', 'm'], ['goat', 'f'], ['goat', 'm'],
  ['pig', 'f'], ['pig', 'm'], ['cattle', 'f'], ['cattle', 'm'], ['horse', 'f'], ['horse', 'm'],
];

export function foundHomestead(world: World): LifeResult<{ anchor: { x: number; z: number } }> {
  const life = lifeState(world);
  if (world.homestead) return { ok: false, code: 'already_founded', reasons: ['this world already has a homestead'] };
  const anchor = findHomesteadAnchor(world);
  const h: HomesteadState = {
    version: HOMESTEAD_VERSION, anchorX: anchor.x, anchorZ: anchor.z, rng: seedRng(world), nextId: 0,
    villagers: [], plots: [], enclosures: [], animals: [], overflow: {},
    steward: { enabled: true, policy: { assign_role: 'auto', expand_field: 'approve' }, proposals: [], nextProposal: 0 },
  };
  const layout = homesteadLayout(h);
  const home = layout.find((f) => f.id === 'farmhouse')!.use;
  h.villagers.push(
    { id: 'villager:0', name: 'Ada', role: 'farmer', x: home.x + 8, z: home.z, energy: 100, hunger: 20, carry: null, task: null },
    { id: 'villager:1', name: 'Bram', role: 'herder', x: home.x - 8, z: home.z, energy: 100, hunger: 30, carry: null, task: null },
  );
  for (const id of ['coop', 'paddock', 'pen', 'sty'] as EnclosureId[]) {
    h.enclosures.push({ id, grass: GRASS_MAX, feed: id === 'coop' || id === 'sty' ? 10 : 0, water: TROUGH_MAX, eggs: 0 });
  }
  for (const [species, sex] of STARTER_HERD) {
    const pos = randomPointIn(h, enclosureRect(h, SPECIES_RULES[species].enclosure));
    h.animals.push({
      id: `animal:${String(h.nextId++).padStart(3, '0')}`, species, sex,
      born: life.tick - SPECIES_RULES[species].adultAge, x: pos.x, z: pos.z, tx: pos.x, tz: pos.z,
      hunger: Math.floor(rnd(h) * 40), starving: 0, product: Math.floor(rnd(h) * 60), pregnantUntil: 0,
    });
  }
  // The settlers arrive with seed, straw for the troughs and a little food.
  const s = stock(world);
  for (const [item, amount] of Object.entries(FOUNDING_SUPPLIES)) {
    if (!putInto(s.inventory, item, amount, s.capacity)) return { ok: false, code: 'capacity_exceeded', reasons: ['the founder stockpile is too full to receive the settlers\' supplies'] };
  }
  world.homestead = h;
  world.revision++;
  return { ok: true, value: { anchor } };
}

function enclosureRect(h: HomesteadState, id: EnclosureId): Rect {
  return facility(h, id)!.rect;
}

function randomPointIn(h: HomesteadState, r: Rect): { x: number; z: number } {
  const pad = 6;
  return {
    x: r.x0 + pad + Math.floor(rnd(h) * Math.max(1, r.x1 - r.x0 - pad * 2)),
    z: r.z0 + pad + Math.floor(rnd(h) * Math.max(1, r.z1 - r.z0 - pad * 2)),
  };
}

// ---------- stockpile helpers ----------

/** The founder stockpile, with capacity reduced by output reserved for running production jobs. */
function stock(world: World) {
  const life = lifeState(world);
  const s = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
  if (!s) throw new Error('founder stockpile missing');
  const reserved = [...life.jobs.values()].reduce((n, j) => n + total(RECIPES[j.recipe].output as Record<string, number>), 0);
  return { inventory: s.inventory, capacity: s.capacity - reserved };
}
function takeFrom(bag: Record<string, number>, item: string, amount: number): number {
  const got = Math.min(amount, bag[item] ?? 0);
  if (got <= 0) return 0;
  bag[item] -= got;
  if (bag[item] === 0) delete bag[item];
  return got;
}
function putInto(bag: Record<string, number>, item: string, amount: number, capacity: number): boolean {
  if (total(bag) + amount > capacity) return false;
  bag[item] = (bag[item] ?? 0) + amount;
  return true;
}

/** Seed kept back for replanting: enough to sow every field that is waiting for seed. */
export function seedReserve(h: HomesteadState): number {
  return h.plots.filter((p) => p.state === 'tilled' || p.state === 'wild').reduce((n, p) => n + unitsOf(p), 0);
}

// ---------- villager task planning ----------

const isNight = (tick: number) => { const t = tick % DAY_TICKS; return t >= NIGHT_START && t < NIGHT_END; };
export function dayTime(tick: number): { day: number; phase: number; night: boolean } {
  return { day: Math.floor(tick / DAY_TICKS), phase: (tick % DAY_TICKS) / DAY_TICKS, night: isNight(tick) };
}

function walk(p: { x: number; z: number }): Leg { return { op: 'walk', x: p.x, z: p.z, ticks: 0, effect: 'none' }; }
function work(p: { x: number; z: number }, ticks: number, effect: Effect, item?: string, amount?: number): Leg {
  return { op: 'work', x: p.x, z: p.z, ticks, effect, ...(item ? { item } : {}), ...(amount ? { amount } : {}) };
}

function claimed(h: HomesteadState, self: Villager): Set<string> {
  return new Set(h.villagers.filter((v) => v !== self && v.task).map((v) => v.task!.target));
}

function plan(world: World, h: HomesteadState, v: Villager, tick: number): Task | null {
  const layout = homesteadLayout(h);
  const byId = new Map(layout.map((f) => [f.id, f]));
  const home = byId.get('farmhouse')!.use, well = byId.get('well')!.use;
  const s = stock(world).inventory;
  const taken = claimed(h, v);
  const task = (kind: string, target: string, legs: Leg[]): Task => ({ kind, target, legs, leg: 0, progress: 0 });

  // Whatever is in hand goes to the store first (a harvest interrupted by night, a full store retried).
  const carryingSeed = v.carry?.item === 'seed' && v.role === 'farmer'
    && h.plots.some((p) => p.state === 'tilled' && !taken.has(p.id) && unitsOf(p) <= v.carry!.amount);
  const room = stock(world);
  if (v.hunger >= 70 && FOOD_PREFERENCE.some((f) => (s[f] ?? 0) + (h.overflow[f] ?? 0) > 0)) {
    return task('eat', `eat:${v.id}`, [walk(STOCK), work(STOCK, 3, 'eat')]);
  }
  if (isNight(tick) || v.energy <= 10) return task('rest', `home:${v.id}`, [walk(home), work(home, 1, 'rest')]);
  const space = Math.max(0, room.capacity - total(room.inventory)) + Math.max(0, OVERFLOW_CAPACITY - total(h.overflow));
  const carryingFeed = v.carry?.item === 'fiber' && v.role === 'herder';
  if (v.carry && v.carry.item !== 'water' && !carryingSeed && !carryingFeed) {
    return task('store', `carry:${v.id}`, [walk(STOCK), work(STOCK, 1, 'store')]);
  }
  // Seed in hand is sown before anything else, so it is never set aside or lost.
  if (carryingSeed) {
    const p = [...h.plots].sort((a, b) => a.id.localeCompare(b.id)).find((q) => q.state === 'tilled' && !taken.has(q.id) && unitsOf(q) <= v.carry!.amount)!;
    const at = fieldCentre(p);
    return task('sow', p.id, [walk(at), work(at, 1 + unitsOf(p), 'sow')]);
  }
  /** Only start work whose output has somewhere to go. */
  const fits = (n: number) => space >= n;
  // Move goods from the overflow pile into the store once there is room.
  const loose = Object.keys(h.overflow).sort()[0];
  if (loose && total(room.inventory) < room.capacity && !taken.has('overflow:store')) {
    const n = Math.min(h.overflow[loose], room.capacity - total(room.inventory), 10);
    return task('restock', 'overflow:store', [walk(STOCK), work(STOCK, 2, 'restock', loose, n)]);
  }
  if (v.role === 'farmer') {
    const plots = [...h.plots].sort((a, b) => a.id.localeCompare(b.id));
    const free = (p: Plot) => !taken.has(p.id);
    const at = (p: Plot) => fieldCentre(p);
    const harvestSize = (p: Plot) => Object.values(CROP_RULES[p.crop].yield).reduce((n, a) => n + a, 0) * unitsOf(p);
    // A can still holding water is used on the driest crop, or emptied, before work that needs free hands.
    if (v.carry?.item === 'water') {
      const dry = plots.filter((p) => p.state === 'growing' && p.moisture < MOISTURE_MAX - 3 && free(p)).sort((a, b) => a.moisture - b.moisture)[0];
      if (dry) return task('water', dry.id, [walk(at(dry)), work(at(dry), 1, 'water_plot')]);
      v.carry = null;
    }
    const ripe = plots.find((p) => p.state === 'ripe' && free(p));
    if (ripe && fits(harvestSize(ripe))) {
      return task('harvest', ripe.id, [walk(at(ripe)), work(at(ripe), 1 + 2 * unitsOf(ripe), 'reap'), walk(STOCK), work(STOCK, 1, 'store')]);
    }
    const thirsty = plots.filter((p) => p.state === 'growing' && p.moisture <= 4 && free(p)).sort((a, b) => a.moisture - b.moisture)[0];
    if (thirsty) {
      const legs = v.carry?.item === 'water' ? [] : [walk(well), work(well, 2, 'draw')];
      return task('water', thirsty.id, [...legs, walk(at(thirsty)), work(at(thirsty), 1, 'water_plot')]);
    }
    const seedAvailable = (s.seed ?? 0) + (h.overflow.seed ?? 0);
    // Sow the first waiting field there is enough seed for (one seed per unit).
    const tilled = plots.find((p) => p.state === 'tilled' && free(p) && unitsOf(p) <= seedAvailable);
    if (tilled) {
      return task('sow', tilled.id, [walk(STOCK), work(STOCK, 1, 'take', 'seed', unitsOf(tilled)), walk(at(tilled)), work(at(tilled), 1 + unitsOf(tilled), 'sow')]);
    }
    // Short of seed with a field waiting: thresh straw into seed at the store (the seed recipe).
    const waiting = plots.find((p) => p.state === 'tilled' && free(p));
    const fiberAvailable = (s.fiber ?? 0) + (h.overflow.fiber ?? 0);
    if (waiting && fiberAvailable >= RECIPES.seed.input.fiber! && !taken.has('thresh:store')) {
      return task('thresh', 'thresh:store', [walk(STOCK), work(STOCK, 4, 'thresh')]);
    }
    const wild = plots.find((p) => p.state === 'wild' && free(p));
    if (wild) return task('till', wild.id, [walk(at(wild)), work(at(wild), TILL_PER_UNIT * unitsOf(wild) - wild.tilled, 'till')]);
  } else {
    const encl = [...h.enclosures].sort((a, b) => a.id.localeCompare(b.id));
    const occupied = (e: Enclosure) => h.animals.some((a) => SPECIES_RULES[a.species].enclosure === e.id);
    // Top troughs up well before they run dry: the herd drinks through the night.
    const thirsty = encl.filter((e) => occupied(e) && e.water <= 14 && !taken.has(`water:${e.id}`)).sort((a, b) => a.water - b.water)[0];
    if (thirsty) {
      const t = byId.get(thirsty.id)!.trough!;
      const legs = v.carry?.item === 'water' ? [] : [walk(well), work(well, 2, 'draw')];
      return task('water_trough', `water:${thirsty.id}`, [...legs, walk(t), work(t, 1, 'water_trough')]);
    }
    const straw = (s.fiber ?? 0) + (h.overflow.fiber ?? 0) + (v.carry?.item === 'fiber' ? v.carry.amount : 0);
    const hungry = encl.filter((e) => {
      if (!occupied(e) || taken.has(`feed:${e.id}`)) return false;
      const needsTrough = h.animals.some((a) => SPECIES_RULES[a.species].enclosure === e.id && e.grass < SPECIES_RULES[a.species].graze * 3);
      return needsTrough && e.feed <= 8;
    }).sort((a, b) => a.feed - b.feed)[0];
    if (hungry && straw > 0) {
      const t = byId.get(hungry.id)!.trough!;
      if (v.carry?.item === 'fiber') return task('feed', `feed:${hungry.id}`, [walk(t), work(t, 2, 'fill_feed')]);
      const amount = Math.min(6, straw, TROUGH_MAX - hungry.feed);
      if (amount > 0) {
        return task('feed', `feed:${hungry.id}`, [walk(STOCK), work(STOCK, 1, 'take', 'fiber', amount), walk(t), work(t, 2, 'fill_feed')]);
      }
    }
    // Straw left over after feeding goes back to the store.
    if (v.carry?.item === 'fiber') return task('store', `carry:${v.id}`, [walk(STOCK), work(STOCK, 1, 'store')]);
    const coop = h.enclosures.find((e) => e.id === 'coop');
    if (coop && coop.eggs >= 3 && !taken.has('eggs:coop') && fits(coop.eggs)) {
      const c = byId.get('coop')!.use;
      return task('collect', 'eggs:coop', [walk(c), work(c, 2, 'gather_eggs'), walk(STOCK), work(STOCK, 1, 'store')]);
    }
    const ready = [...h.animals].sort((a, b) => a.id.localeCompare(b.id)).find((a) => {
      const p = SPECIES_RULES[a.species].product;
      return p && p.resource !== 'eggs' && a.product >= p.every && !taken.has(a.id) && fits(p.amount);
    });
    if (ready) {
      const p = SPECIES_RULES[ready.species].product!;
      const spot = { x: ready.x, z: ready.z };
      return task(p.resource === 'wool' ? 'shear' : 'milk', ready.id,
        [walk(spot), work(spot, p.resource === 'wool' ? 4 : 3, p.resource === 'wool' ? 'shear' : 'milk'), walk(STOCK), work(STOCK, 1, 'store')]);
    }
  }
  // Leftover water is poured out (the well is endless); then rest near home.
  if (v.carry?.item === 'water') v.carry = null;
  // Nothing to do: idle near home for a while.
  const ox = Math.floor(rnd(h) * 60) - 30, oz = Math.floor(rnd(h) * 40) - 20;
  return task('idle', `idle:${v.id}`, [walk({ x: home.x + ox, z: home.z + oz + 30 }), work({ x: home.x + ox, z: home.z + oz + 30 }, 8, 'none')]);
}

// ---------- applying effects ----------

interface Events { log: string[] }
/** Effects that put something into empty hands. */
const PICKUP = new Set<Effect>(['take', 'draw', 'reap', 'gather_eggs', 'shear', 'milk']);

function applyEffect(world: World, h: HomesteadState, v: Villager, leg: Leg, task: Task, ev: Events): boolean {
  const s = stock(world);
  // One load at a time: nothing is ever dropped to make room for another.
  if (PICKUP.has(leg.effect) && v.carry && !(leg.effect === 'draw' && v.carry.item === 'water')) return false;
  switch (leg.effect) {
    case 'none': return true;
    case 'take': {
      // The loose pile beside the store is used first, then the store itself.
      let got = takeFrom(h.overflow, leg.item!, leg.amount!);
      got += takeFrom(s.inventory, leg.item!, leg.amount! - got);
      if (got <= 0) return false;
      v.carry = { item: leg.item!, amount: got };
      world.revision++;
      return true;
    }
    case 'store': {
      if (!v.carry) return true;
      if (!putInto(s.inventory, v.carry.item, v.carry.amount, s.capacity)) return false;
      ev.log.push(`${v.name} stored ${v.carry.amount} ${v.carry.item}`);
      v.carry = null;
      return true;
    }
    case 'eat': {
      const loose = FOOD_PREFERENCE.find((f) => (h.overflow[f] ?? 0) > 0);
      const food = loose ?? FOOD_PREFERENCE.find((f) => (s.inventory[f] ?? 0) > 0);
      if (!food) return false;
      takeFrom(loose ? h.overflow : s.inventory, food, 1);
      v.hunger = Math.max(0, v.hunger - 70);
      return true;
    }
    case 'rest': {
      // The work leg repeats until morning and the villager is rested.
      v.energy = Math.min(100, v.energy + 2);
      return true;
    }
    case 'draw': v.carry = { item: 'water', amount: v.role === 'farmer' ? CAN_WATERINGS : 1 }; return true;
    case 'thresh': {
      const need = RECIPES.seed.input.fiber!, out = RECIPES.seed.output.seed!;
      const fromPile = takeFrom(h.overflow, 'fiber', need);
      const got = fromPile + takeFrom(s.inventory, 'fiber', need - fromPile);
      if (got < need) { if (got) h.overflow.fiber = (h.overflow.fiber ?? 0) + got; return false; }
      s.inventory.seed = (s.inventory.seed ?? 0) + out;
      ev.log.push(`${v.name} threshed straw into ${out} seed`);
      return true;
    }
    case 'restock': {
      const n = Math.min(leg.amount ?? 0, h.overflow[leg.item!] ?? 0, s.capacity - total(s.inventory));
      if (n <= 0) return false;
      takeFrom(h.overflow, leg.item!, n);
      s.inventory[leg.item!] = (s.inventory[leg.item!] ?? 0) + n;
      return true;
    }
    case 'till': {
      const p = h.plots.find((x) => x.id === task.target);
      if (!p || p.state !== 'wild') return false;
      p.state = 'tilled'; p.tilled = 0;
      ev.log.push(`${v.name} dug over the ${CROP_RULES[p.crop].label.toLowerCase()} field`);
      return true;
    }
    case 'sow': {
      const p = h.plots.find((x) => x.id === task.target);
      const need = p ? unitsOf(p) : 0;
      if (!p || p.state !== 'tilled' || v.carry?.item !== 'seed' || v.carry.amount < need) return false;
      v.carry = v.carry.amount > need ? { item: 'seed', amount: v.carry.amount - need } : null;
      Object.assign(p, { state: 'growing', growth: 0, moisture: 0, dry: 0 });
      ev.log.push(`${v.name} sowed ${CROP_RULES[p.crop].label.toLowerCase()} (${need} seed)`);
      return true;
    }
    case 'water_plot': {
      const p = h.plots.find((x) => x.id === task.target);
      if (!p || v.carry?.item !== 'water' || (p.state !== 'growing' && p.state !== 'tilled')) return false;
      // Each can-full waters one unit (9 m²); a big field takes several trips.
      const used = Math.min(v.carry.amount, Math.ceil(((MOISTURE_MAX - p.moisture) * unitsOf(p)) / MOISTURE_MAX));
      if (used <= 0) return true;
      v.carry = v.carry.amount > used ? { item: 'water', amount: v.carry.amount - used } : null;
      p.moisture = Math.min(MOISTURE_MAX, p.moisture + Math.ceil((used * MOISTURE_MAX) / unitsOf(p))); p.dry = 0;
      return true;
    }
    case 'reap': {
      const p = h.plots.find((x) => x.id === task.target);
      if (!p || p.state !== 'ripe') return false;
      // Carried as one mixed load (crop and units): the store leg deposits each part.
      v.carry = { item: `harvest:${p.crop}`, amount: unitsOf(p) };
      Object.assign(p, { state: 'tilled', growth: 0, moisture: Math.max(0, p.moisture - 4), dry: 0 });
      ev.log.push(`${v.name} harvested the ${CROP_RULES[p.crop].label.toLowerCase()}`);
      return true;
    }
    case 'water_trough': {
      const e = h.enclosures.find((x) => `water:${x.id}` === task.target);
      if (!e || v.carry?.item !== 'water') return false;
      v.carry = null;
      e.water = Math.min(TROUGH_MAX, e.water + BUCKET);
      return true;
    }
    case 'fill_feed': {
      const e = h.enclosures.find((x) => `feed:${x.id}` === task.target);
      if (!e || v.carry?.item !== 'fiber') return false;
      const room = TROUGH_MAX - e.feed, used = Math.min(room, v.carry.amount);
      e.feed += used;
      v.carry = v.carry.amount - used > 0 ? { item: 'fiber', amount: v.carry.amount - used } : null;
      return true;
    }
    case 'gather_eggs': {
      const e = h.enclosures.find((x) => x.id === 'coop');
      if (!e || e.eggs <= 0) return false;
      v.carry = { item: 'eggs', amount: e.eggs };
      e.eggs = 0;
      return true;
    }
    case 'shear': case 'milk': {
      const a = h.animals.find((x) => x.id === task.target);
      const p = a && SPECIES_RULES[a.species].product;
      if (!a || !p || a.product < p.every) return false;
      v.carry = { item: p.resource, amount: p.amount };
      a.product = 0;
      ev.log.push(`${v.name} ${leg.effect === 'shear' ? 'sheared' : 'milked'} ${a.id}`);
      return true;
    }
  }
  return true;
}

/**
 * Store a carried load (a harvest load expands into its real parts). What does
 * not fit inside is set down on the overflow pile beside the store.
 */
function storeCarry(world: World, h: HomesteadState, v: Villager): boolean {
  if (!v.carry) return true;
  const s = stock(world);
  const crop = v.carry.item.startsWith('harvest:') ? v.carry.item.slice(8) as CropKind : null;
  const parts: Array<[string, number]> = crop ? Object.entries(CROP_RULES[crop].yield).map(([k, n]) => [k, n * v.carry!.amount])
    : [[v.carry.item, v.carry.amount]];
  const need = parts.reduce((n, [, a]) => n + a, 0);
  const inside = Math.max(0, s.capacity - total(s.inventory));
  const outside = Math.max(0, OVERFLOW_CAPACITY - total(h.overflow));
  if (inside + outside < need) return false;
  let free = inside;
  for (const [item, amount] of parts) {
    const a = Math.min(amount, free);
    if (a > 0) { s.inventory[item] = (s.inventory[item] ?? 0) + a; free -= a; }
    if (amount - a > 0) h.overflow[item] = (h.overflow[item] ?? 0) + amount - a;
  }
  v.carry = null;
  return true;
}

/** At dawn, half the stored milk and a quarter of the eggs have spoiled. */
function spoil(world: World, h: HomesteadState, tick: number): void {
  if (tick % DAY_TICKS !== NIGHT_END) return;
  const s = stock(world);
  for (const bag of [s.inventory, h.overflow]) {
    if (bag.milk) takeFrom(bag, 'milk', Math.ceil(bag.milk / 2));
    if (bag.eggs) takeFrom(bag, 'eggs', Math.floor(bag.eggs / 4));
  }
}

function stepVillager(world: World, h: HomesteadState, v: Villager, tick: number, ev: Events): void {
  if (tick % 2 === 0) v.hunger = Math.min(100, v.hunger + 1);
  const starving = v.hunger >= 100;
  if (!v.task) v.task = plan(world, h, v, tick);
  const t = v.task;
  if (!t) return;
  const leg = t.legs[t.leg];
  if (leg.op === 'walk') {
    const dx = leg.x - v.x, dz = leg.z - v.z, d = len2(dx, dz);
    const speed = starving ? VILLAGER_SPEED / 2 : VILLAGER_SPEED;
    if (d <= speed) { v.x = leg.x; v.z = leg.z; t.leg++; }
    else { v.x += Math.round((dx / d) * speed); v.z += Math.round((dz / d) * speed); }
  } else {
    if (leg.effect !== 'rest' && tick % 3 === 0) v.energy = Math.max(0, v.energy - 1);
    t.progress += starving ? 1 : 2;
    if (t.progress >= leg.ticks * 2) {
      if (leg.effect === 'rest' && (isNight(tick) || v.energy < 90)) {
        v.energy = Math.min(100, v.energy + 2);
        return;
      }
      const ok = leg.effect === 'store' ? storeCarry(world, h, v) : applyEffect(world, h, v, leg, t, ev);
      t.progress = 0;
      if (!ok && leg.effect === 'store' && v.carry) {
        // The store filled up on the way: the load is left to spoil rather than
        // stopping all other work (animal care must never wait on storage).
        ev.log.push(`${v.name} found the store full; ${v.carry.item.startsWith('harvest') ? 'the harvest' : `${v.carry.amount} ${v.carry.item}`} spoiled`);
        v.carry = null;
      }
      if (!ok) { v.task = null; return; }
      if (leg.effect === 'store' && t.kind !== 'store') ev.log.push(`${v.name} delivered to the store`);
      t.leg++;
    }
  }
  if (t.leg >= t.legs.length) v.task = null;
}

// ---------- animals ----------

function stepAnimals(h: HomesteadState, tick: number): void {
  const byEnclosure = new Map<EnclosureId, Animal[]>();
  for (const a of h.animals) {
    const id = SPECIES_RULES[a.species].enclosure;
    byEnclosure.set(id, [...(byEnclosure.get(id) ?? []), a]);
  }
  const births: Animal[] = [];
  const dead = new Set<string>();
  for (const a of [...h.animals].sort((x, y) => x.id.localeCompare(y.id))) {
    const rule = SPECIES_RULES[a.species];
    const fac = facility(h, rule.enclosure)!;
    const encl = h.enclosures.find((e) => e.id === rule.enclosure)!;
    const adult = tick - a.born >= rule.adultAge;
    // Animals get hungry every other tick by day and every fourth tick while they sleep.
    if (tick % (isNight(tick) ? 4 : 2) === 0) a.hunger = Math.min(100, a.hunger + 1);
    // Eat: graze the pasture if there is grass, else the trough; water is always from the trough.
    let target = { x: a.tx, z: a.tz };
    if (a.hunger >= HUNGER_MEAL) {
      const grazing = rule.graze > 0 && encl.grass >= rule.graze;
      const canEat = encl.water > 0 && (grazing || encl.feed >= rule.feed);
      if (canEat) {
        const trough = fac.trough!;
        target = grazing ? { x: a.x, z: a.z } : trough;
        const near = len2(a.x - target.x, a.z - target.z) <= 12;
        if (near) {
          if (grazing) encl.grass -= rule.graze; else encl.feed -= rule.feed;
          encl.water -= 1;
          a.hunger = Math.max(0, a.hunger - HUNGER_MEAL);
          a.tx = a.x; a.tz = a.z;
        } else { a.tx = target.x; a.tz = target.z; }
      }
    } else if (len2(a.tx - a.x, a.tz - a.z) < ANIMAL_SPEED && rnd(h) < 0.06) {
      const p = randomPointIn(h, fac.rect);
      a.tx = p.x; a.tz = p.z;
    }
    const dx = a.tx - a.x, dz = a.tz - a.z, d = len2(dx, dz);
    if (d > 0) {
      const step = Math.min(d, ANIMAL_SPEED);
      a.x += Math.round((dx / d) * step); a.z += Math.round((dz / d) * step);
    }
    // Starvation is a real consequence.
    if (a.hunger >= 100) { a.starving++; if (a.starving >= STARVING_DEATH_TICKS) dead.add(a.id); continue; }
    a.starving = 0;
    // Products accumulate only while the animal is fed.
    const p = rule.product;
    if (p && adult && a.hunger < 80 && (!p.females || a.sex === 'f') && a.product < p.every) {
      a.product++;
      if (p.resource === 'eggs' && a.product >= p.every) {
        if (encl.eggs < EGG_BOX_MAX) { encl.eggs += p.amount; }
        a.product = 0;
      }
    }
    // Reproduction: fed adult female, an adult male in the same enclosure, room to spare.
    const herd = byEnclosure.get(rule.enclosure) ?? [];
    if (a.pregnantUntil > 0 && tick >= a.pregnantUntil) {
      a.pregnantUntil = 0;
      for (let i = 0; i < rule.litter; i++) {
        if (herd.length + births.length >= (fac.capacity ?? 0) || h.animals.length + births.length >= MAX_ANIMALS) break;
        births.push({ id: `animal:${String(h.nextId++).padStart(3, '0')}`, species: a.species, sex: rnd(h) < 0.5 ? 'f' : 'm',
          born: tick, x: a.x, z: a.z, tx: a.x, tz: a.z, hunger: 20, starving: 0, product: 0, pregnantUntil: 0 });
      }
    } else if (a.sex === 'f' && adult && a.pregnantUntil === 0 && a.hunger < 50
      && herd.length < (fac.capacity ?? 0)
      && herd.some((o) => o.species === a.species && o.sex === 'm' && tick - o.born >= rule.adultAge)
      && rnd(h) < 1 / 400) {
      a.pregnantUntil = tick + rule.gestation;
    }
  }
  if (dead.size) h.animals = h.animals.filter((a) => !dead.has(a.id));
  if (births.length) h.animals = [...h.animals, ...births].sort((a, b) => a.id.localeCompare(b.id));
  // Pasture regrows; it never exceeds its maximum.
  // Pasture regrows in proportion to its area (one unit per 40 m² per tick).
  for (const e of h.enclosures) {
    const r = facility(h, e.id)!.rect;
    const regrow = Math.max(1, Math.round(((r.x1 - r.x0) * (r.z1 - r.z0)) / (40 * DM * DM)));
    e.grass = Math.min(GRASS_MAX, e.grass + regrow);
  }
}

// ---------- crops ----------

function stepPlots(h: HomesteadState, tick: number, ev: Events): void {
  // Crops neither grow nor dry out overnight.
  if (isNight(tick)) return;
  for (const p of h.plots) {
    if (p.state !== 'growing') continue;
    const rule = CROP_RULES[p.crop];
    if (p.moisture > 0) {
      p.growth++;
      p.dry = 0;
      if (tick % rule.drainEvery === 0) p.moisture--;
      if (p.growth >= rule.growTicks) p.state = 'ripe';
    } else if (++p.dry >= WITHER_TICKS) {
      // A crop left dry withers: the seed is lost and the plot must be sown again.
      Object.assign(p, { state: 'tilled', growth: 0, dry: 0 });
      ev.log.push(`the ${rule.label.toLowerCase()} withered for lack of water`);
    }
  }
}

/** Messages from the latest ticks for the HUD. Presentation only: never saved or hashed. */
export const recentHomesteadEvents = new WeakMap<World, string[]>();

/** One homestead tick. Called by the journaled `tick` command after jobs. */
export function stepHomestead(world: World, tick: number): string[] {
  const h = world.homestead;
  if (!h) return [];
  const ev: Events = { log: [] };
  spoil(world, h, tick);
  stepPlots(h, tick, ev);
  stepAnimals(h, tick);
  for (const v of [...h.villagers].sort((a, b) => a.id.localeCompare(b.id))) stepVillager(world, h, v, tick, ev);
  if (ev.log.length) recentHomesteadEvents.set(world, [...(recentHomesteadEvents.get(world) ?? []), ...ev.log].slice(-8));
  return ev.log;
}

export function cropStage(p: Plot): 0 | 1 | 2 | 3 | 4 {
  if (p.state === 'ripe') return 4;
  if (p.state !== 'growing') return 0;
  return Math.min(3, 1 + Math.floor((p.growth / CROP_RULES[p.crop].growTicks) * 3)) as 1 | 2 | 3;
}

// ---------- player actions ----------

export type HomesteadAction =
  | 'draw_water' | 'till' | 'sow' | 'water' | 'reap' | 'feed' | 'water_trough' | 'collect_eggs' | 'shear' | 'milk';
export const HOMESTEAD_ACTIONS: readonly HomesteadAction[] = [
  'collect_eggs', 'draw_water', 'feed', 'milk', 'reap', 'shear', 'sow', 'till', 'water', 'water_trough',
];
export interface ActResult { action: HomesteadAction; target: string; spent: Record<string, number>; gained: Record<string, number> }

const fail = (code: string, reason: string) => ({ ok: false as const, code, reasons: [reason] });

/**
 * The player works the homestead directly with their own carried bag. Each
 * action does one unit of work immediately; villagers do the same work over
 * several ticks. Requirements and resource flows are identical.
 */
export function homesteadAct(world: World, action: HomesteadAction, target: string): LifeResult<ActResult> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  const bag = world.inventory;
  const spent: Record<string, number> = {}, gained: Record<string, number> = {};
  const gain = (item: string, amount: number) => {
    if (total(bag) + amount > CARRIED_CAPACITY) return false;
    bag[item] = (bag[item] ?? 0) + amount; gained[item] = (gained[item] ?? 0) + amount; return true;
  };
  const spend = (item: string, amount: number) => {
    if ((bag[item] ?? 0) < amount) return false;
    bag[item] -= amount; if (bag[item] === 0) delete bag[item]; spent[item] = (spent[item] ?? 0) + amount; return true;
  };
  const plot = h.plots.find((p) => p.id === target);
  const encl = h.enclosures.find((e) => e.id === target);
  const animal = h.animals.find((a) => a.id === target);
  const busy = h.villagers.some((v) => v.task?.target === target || v.task?.target === `water:${target}` || v.task?.target === `feed:${target}`);
  if (busy && action !== 'draw_water') return fail('busy', 'a villager is already working on that');
  switch (action) {
    case 'draw_water':
      if (target !== 'well') return fail('invalid_target', 'draw water at the well');
      if ((bag.water ?? 0) >= 3) return fail('full', 'you can carry at most 3 buckets');
      if (!gain('water', 1)) return fail('capacity_exceeded', 'your bag is full');
      break;
    case 'till': {
      if (!plot || plot.state !== 'wild') return fail('invalid_target', 'only an undug field can be dug over');
      const need = TILL_PER_UNIT * unitsOf(plot);
      plot.tilled = Math.min(need, plot.tilled + 3);
      if (plot.tilled >= need) { plot.state = 'tilled'; plot.tilled = 0; }
      break;
    }
    case 'sow': {
      if (!plot || plot.state !== 'tilled') return fail('invalid_target', 'sow into a dug field');
      const n = unitsOf(plot);
      if (!spend('seed', n)) return fail('insufficient_resources', `this field needs ${n} seed (1 per 9 m²); you have ${bag.seed ?? 0}`);
      Object.assign(plot, { state: 'growing', growth: 0, moisture: 0, dry: 0 });
      break;
    }
    case 'water':
      if (!plot || (plot.state !== 'growing' && plot.state !== 'tilled')) return fail('invalid_target', 'water a dug or growing field');
      if (plot.moisture >= MOISTURE_MAX) return fail('full', 'the soil is already wet');
      if (!spend('water', 1)) return fail('insufficient_resources', 'draw a bucket at the well first');
      // A bucket soaks one 9 m² unit: a big field takes several.
      plot.moisture = Math.min(MOISTURE_MAX, plot.moisture + Math.ceil(MOISTURE_MAX / unitsOf(plot))); plot.dry = 0;
      break;
    case 'reap': {
      if (!plot || plot.state !== 'ripe') return fail('invalid_target', 'the crop is not ripe');
      const parts = Object.entries(CROP_RULES[plot.crop].yield).map(([k, n]) => [k, n * unitsOf(plot)] as const);
      if (total(bag) + parts.reduce((n, [, a]) => n + a, 0) > CARRIED_CAPACITY) return fail('capacity_exceeded', 'your bag is too full for this harvest');
      for (const [item, amount] of parts) gain(item, amount);
      Object.assign(plot, { state: 'tilled', growth: 0, moisture: Math.max(0, plot.moisture - 4), dry: 0 });
      break;
    }
    case 'feed': {
      if (!encl) return fail('invalid_target', 'feed a trough');
      const amount = Math.min(bag.fiber ?? 0, 6, TROUGH_MAX - encl.feed);
      if (amount <= 0) return fail('insufficient_resources', (bag.fiber ?? 0) <= 0 ? 'you need fiber (straw) in your bag' : 'the trough is full');
      spend('fiber', amount); encl.feed += amount;
      break;
    }
    case 'water_trough':
      if (!encl) return fail('invalid_target', 'water a trough');
      if (encl.water >= TROUGH_MAX) return fail('full', 'the trough is full');
      if (!spend('water', 1)) return fail('insufficient_resources', 'draw a bucket at the well first');
      encl.water = Math.min(TROUGH_MAX, encl.water + BUCKET);
      break;
    case 'collect_eggs': {
      const coop = h.enclosures.find((e) => e.id === 'coop');
      if (target !== 'coop' || !coop || coop.eggs <= 0) return fail('invalid_target', 'there are no eggs in the coop');
      if (!gain('eggs', coop.eggs)) return fail('capacity_exceeded', 'your bag is full');
      coop.eggs = 0;
      break;
    }
    case 'shear': case 'milk': {
      const p = animal && SPECIES_RULES[animal.species].product;
      if (!animal || !p || (action === 'shear') !== (p.resource === 'wool') || p.resource === 'eggs' || animal.product < p.every) {
        return fail('invalid_target', action === 'shear' ? 'no sheep is ready to shear' : 'no animal is ready to milk');
      }
      if (!gain(p.resource, p.amount)) return fail('capacity_exceeded', 'your bag is full');
      animal.product = 0;
      break;
    }
  }
  world.revision++;
  return { ok: true, value: { action, target, spent, gained } };
}

// ---------- fields the player designs ----------

export interface FieldSpec { x: number; z: number; w: number; d: number; crop: CropKind }
const overlaps = (a: Rect, b: Rect, gap = 0) => a.x0 < b.x1 + gap && a.x1 + gap > b.x0 && a.z0 < b.z1 + gap && a.z1 + gap > b.z0;

/**
 * Can a field go here? Returns every reason it cannot, so the placement
 * preview can explain itself. Deterministic: reads only authoritative state.
 */
export function checkField(world: World, spec: FieldSpec, ignoreId?: string): string[] {
  const h = world.homestead;
  if (!h) return ['found the homestead first'];
  const reasons: string[] = [];
  const { x, z, w, d } = spec;
  if (![x, z, w, d].every(Number.isSafeInteger)) return ['field coordinates must be whole metres'];
  if (w < FIELD_MIN || d < FIELD_MIN || w > FIELD_MAX || d > FIELD_MAX) return [`fields are ${FIELD_MIN}–${FIELD_MAX} m on each side`];
  if (!CROPS.includes(spec.crop)) return ['unknown crop'];
  const others = h.plots.filter((p) => p.id !== ignoreId);
  if (!ignoreId && others.length >= MAX_FIELDS) reasons.push(`the farm already has ${MAX_FIELDS} fields`);
  if (others.reduce((n, p) => n + p.w * p.d, 0) + w * d > MAX_FIELD_AREA) reasons.push(`total field area is limited to ${MAX_FIELD_AREA} m²`);
  const home = facility(h, 'farmhouse')!.use;
  if (len2(m(x + w / 2) - home.x, m(z + d / 2) - home.z) > FIELD_RANGE * DM) reasons.push(`too far from the farmhouse (max ${FIELD_RANGE} m)`);
  const r = fieldRect(spec);
  if (homesteadLayout(h).some((f) => overlaps(r, f.rect, DM))) reasons.push('too close to a building or pen');
  if (others.some((p) => overlaps(r, fieldRect(p)))) reasons.push('overlaps another field');
  if (RESERVED_SITES.some((q) => overlaps(r, rect(q.x0, q.z0, q.x1 - q.x0, q.z1 - q.z0)))) reasons.push('the founder house and terraces are here');
  const sx = m(FOUNDER_STOCKPILE.x), sz = m(FOUNDER_STOCKPILE.z);
  if (overlaps(r, { x0: sx - 25, z0: sz - 20, x1: sx + 25, z1: sz + 30 })) reasons.push('the store is here');
  let lo = Infinity, hi = -Infinity, wet = false, rock = false;
  for (let cz = z; cz < z + d; cz++) {
    for (let cx = x; cx < x + w; cx++) {
      const y = surfaceAt(world, cx, cz);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
      if (waterDepthAt(world, cx, cz) > 0) wet = true;
      const top = getVoxel(world, cx, y - 1, cz);
      if (top !== MAT.GRASS && top !== MAT.SOIL && top !== MAT.MOSS) rock = true;
    }
  }
  if (wet) reasons.push('there is water here');
  if (rock) reasons.push('crops need soil, not stone or sand');
  if (hi - lo > 1) reasons.push(`the ground is too steep (${hi - lo} m of slope; at most 1 m)`);
  for (const e of world.entities.values()) {
    if (e.harvested || world.entityRemovals.has(e.id) || e.kind === 'marker') continue;
    if (e.x >= x - 0.4 && e.x < x + w + 0.4 && e.z >= z - 0.4 && e.z < z + d + 0.4) {
      reasons.push(e.kind.startsWith('styl_tree') ? 'clear the trees first (gather them for wood)' : 'clear the bushes and rocks first (gather them)');
      break;
    }
  }
  return reasons;
}

/** Mark out a new field. The fence is paid in wood: from the player's bag, or the store for the steward. */
export function markField(world: World, spec: FieldSpec, payFrom: 'bag' | 'store'): LifeResult<{ fieldId: string; units: number; wood: number }> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  const reasons = checkField(world, spec);
  if (reasons.length) return { ok: false, code: 'invalid_site', reasons };
  const wood = fenceCost(spec.w, spec.d);
  const bag = payFrom === 'bag' ? world.inventory : stock(world).inventory;
  if ((bag.wood ?? 0) < wood) return fail('insufficient_resources', `the fence needs ${wood} wood (you have ${bag.wood ?? 0})`);
  takeFrom(bag, 'wood', wood);
  const id = `field:${h.nextId++}`;
  h.plots.push({ id, x: spec.x, z: spec.z, w: spec.w, d: spec.d, crop: spec.crop, state: 'wild', growth: 0, moisture: 0, dry: 0, tilled: 0 });
  h.plots.sort((a, b) => a.id.localeCompare(b.id));
  world.revision++;
  return { ok: true, value: { fieldId: id, units: fieldUnits(spec.w, spec.d), wood } };
}

/** Change what a field will grow next. A crop already in the ground is kept. */
export function setFieldCrop(world: World, fieldId: string, crop: CropKind): LifeResult<{ fieldId: string; crop: CropKind }> {
  const h = world.homestead;
  const p = h?.plots.find((q) => q.id === fieldId);
  if (!h || !p) return fail('invalid_target', 'no such field');
  if (!CROPS.includes(crop)) return fail('invalid_crop', 'unknown crop');
  if (p.state === 'growing' || p.state === 'ripe') return fail('busy', 'harvest the current crop first');
  if (p.crop === crop) return fail('unchanged', `the field is already set to ${CROP_RULES[crop].label.toLowerCase()}`);
  p.crop = crop;
  world.revision++;
  return { ok: true, value: { fieldId, crop } };
}

/** Take a field out of use; anything growing in it is lost and the fence is not refunded. */
export function removeField(world: World, fieldId: string): LifeResult<{ fieldId: string }> {
  const h = world.homestead;
  if (!h || !h.plots.some((q) => q.id === fieldId)) return fail('invalid_target', 'no such field');
  if (h.villagers.some((v) => v.task?.target === fieldId)) return fail('busy', 'a villager is working this field');
  h.plots = h.plots.filter((q) => q.id !== fieldId);
  world.revision++;
  return { ok: true, value: { fieldId } };
}

/** Deterministic search for a good spot, used by the steward when it proposes a field. */
export function findFieldSpot(world: World, w = 4, d = 4, crop: CropKind = 'wheat'): FieldSpec | null {
  const h = world.homestead;
  if (!h) return null;
  const home = facility(h, 'farmhouse')!.use;
  const hx = Math.round(home.x / DM), hz = Math.round(home.z / DM);
  for (let r = 4; r <= FIELD_RANGE - 4; r += 2) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const spec = { x: hx + Math.round(Math.cos(ang) * r) - Math.floor(w / 2), z: hz + Math.round(Math.sin(ang) * r) - Math.floor(d / 2), w, d, crop };
      if (checkField(world, spec).length === 0) return spec;
    }
  }
  return null;
}

/** The steward's version of a new field: a 4 x 4 wheat field at the first good spot, fenced from the store. */
export function expandField(world: World): LifeResult<{ plotId: string; wood: number }> {
  const spot = findFieldSpot(world);
  if (!spot) return fail('no_site', 'there is no suitable open ground near the farmhouse');
  const r = markField(world, spot, 'store');
  return r.ok ? { ok: true, value: { plotId: r.value.fieldId, wood: r.value.wood } } : r;
}

export function assignRole(world: World, villagerId: string, role: Role): LifeResult<{ villagerId: string; role: Role }> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  const v = h.villagers.find((x) => x.id === villagerId);
  if (!v) return fail('invalid_target', 'unknown villager');
  if (v.role === role) return fail('unchanged', `${v.name} is already a ${role}`);
  v.role = role;
  // The current errand is dropped (its claim released); whatever is carried is kept and stored next.
  if (v.task && v.task.kind !== 'rest') v.task = null;
  world.revision++;
  return { ok: true, value: { villagerId, role } };
}

/** Actions the player could take near (x, z) metres, nearest first. Presentation helper; the command validates. */
export function nearbyActions(world: World, x: number, z: number, reach = 3.2): Array<{ action: HomesteadAction; target: string; label: string; d: number }> {
  const h = world.homestead;
  if (!h) return [];
  const bag = world.inventory;
  const out: Array<{ action: HomesteadAction; target: string; label: string; d: number }> = [];
  const dist = (r: Rect) => {
    const cx = Math.max(r.x0, Math.min(x * DM, r.x1)), cz = Math.max(r.z0, Math.min(z * DM, r.z1));
    return len2(x * DM - cx, z * DM - cz) / DM;
  };
  for (const p of h.plots) {
    const r = fieldRect(p), d = dist(r);
    if (d > reach) continue;
    const crop = CROP_RULES[p.crop].label.toLowerCase();
    if (p.state === 'wild') out.push({ action: 'till', target: p.id, label: `Dig the ${crop} field`, d });
    else if (p.state === 'tilled' && (bag.seed ?? 0) >= unitsOf(p)) out.push({ action: 'sow', target: p.id, label: `Sow ${crop} (${unitsOf(p)} seed)`, d });
    else if (p.state === 'ripe') out.push({ action: 'reap', target: p.id, label: `Harvest ${crop}`, d });
    if ((p.state === 'growing' || p.state === 'tilled') && p.moisture < MOISTURE_MAX - 2 && (bag.water ?? 0) > 0) {
      out.push({ action: 'water', target: p.id, label: `Water the ${crop}`, d: d + 0.01 });
    }
  }
  for (const f of homesteadLayout(h)) {
    const d = f.kind === 'well' ? dist(f.rect) : f.trough ? len2(x * DM - f.trough.x, z * DM - f.trough.z) / DM - 0.8 : dist(f.rect);
    if (f.kind === 'well' && d <= reach && (bag.water ?? 0) < 3) out.push({ action: 'draw_water', target: 'well', label: 'Draw water', d });
    const e = h.enclosures.find((q) => q.id === f.id);
    if (e && f.trough && d <= reach) {
      if ((bag.water ?? 0) > 0 && e.water < TROUGH_MAX) out.push({ action: 'water_trough', target: e.id, label: 'Fill water', d });
      if ((bag.fiber ?? 0) > 0 && e.feed < TROUGH_MAX) out.push({ action: 'feed', target: e.id, label: 'Add feed', d: d + 0.01 });
    }
    if (e && e.id === 'coop' && e.eggs > 0 && dist(f.rect) <= reach) out.push({ action: 'collect_eggs', target: 'coop', label: `Collect ${e.eggs} eggs`, d: dist(f.rect) });
  }
  for (const a of h.animals) {
    const p = SPECIES_RULES[a.species].product;
    if (!p || p.resource === 'eggs' || a.product < p.every) continue;
    const d = len2(x * DM - a.x, z * DM - a.z) / DM;
    if (d <= reach) out.push({ action: p.resource === 'wool' ? 'shear' : 'milk', target: a.id, label: p.resource === 'wool' ? 'Shear sheep' : `Milk ${SPECIES_RULES[a.species].label.toLowerCase()}`, d });
  }
  return out.sort((a, b) => a.d - b.d || a.action.localeCompare(b.action));
}

// ---------- steward governance ----------

export type Actor = 'player' | 'steward';

/** Gate for actions that the steward may take. The player (owner) is always allowed. */
export function permitted(h: HomesteadState, actor: Actor, action: StewardAction): LifeResult<true> {
  if (actor === 'player') return { ok: true, value: true };
  if (!h.steward.enabled) return fail('steward_disabled', 'the steward is switched off');
  const p = h.steward.policy[action];
  if (p === 'off') return fail('not_permitted', `the steward may not ${action.replace('_', ' ')}`);
  if (p === 'approve') return fail('approval_required', `the steward must ask before it may ${action.replace('_', ' ')}`);
  return { ok: true, value: true };
}

export function setStewardPolicy(world: World, enabled: boolean, policy: Record<StewardAction, Policy>): LifeResult<Steward> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  h.steward.enabled = enabled;
  h.steward.policy = { assign_role: policy.assign_role, expand_field: policy.expand_field };
  // Switching an action off withdraws its open requests.
  h.steward.proposals = h.steward.proposals.filter((p) => enabled && h.steward.policy[p.action] === 'approve');
  world.revision++;
  return { ok: true, value: { ...h.steward, proposals: [...h.steward.proposals] } };
}

/** The steward asks the owner for an action its policy reserves for approval. */
export function propose(world: World, action: StewardAction, reason: string, villagerId?: string, role?: Role): LifeResult<Proposal> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  if (!h.steward.enabled) return fail('steward_disabled', 'the steward is switched off');
  if (h.steward.policy[action] !== 'approve') return fail('not_permitted', 'this action does not need a request');
  if (h.steward.proposals.some((p) => p.action === action && p.villagerId === villagerId && p.role === role)) {
    return fail('duplicate', 'the steward already asked for this');
  }
  if (h.steward.proposals.length >= MAX_PROPOSALS) return fail('limit', 'too many open requests');
  const proposal: Proposal = {
    id: `proposal:${h.steward.nextProposal++}`, action, reason, tick: lifeState(world).tick,
    ...(villagerId ? { villagerId } : {}), ...(role ? { role } : {}),
  };
  h.steward.proposals.push(proposal);
  world.revision++;
  return { ok: true, value: proposal };
}

/** The owner approves (the action runs now, as the owner's decision) or declines a request. */
export function resolveProposal(world: World, proposalId: string, approve: boolean): LifeResult<{ proposal: Proposal; approved: boolean; result: string }> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  const proposal = h.steward.proposals.find((p) => p.id === proposalId);
  if (!proposal) return fail('invalid_target', 'no such request');
  let result = 'declined';
  if (approve) {
    const r = proposal.action === 'expand_field' ? expandField(world)
      : assignRole(world, proposal.villagerId ?? '', proposal.role ?? 'farmer');
    if (!r.ok) return r;
    result = proposal.action === 'expand_field' ? `added ${(r.value as { plotId: string }).plotId}` : `assigned ${proposal.villagerId} as ${proposal.role}`;
  }
  h.steward.proposals = h.steward.proposals.filter((p) => p.id !== proposalId);
  world.revision++;
  return { ok: true, value: { proposal, approved: approve, result } };
}

// ---------- snapshot ----------

/** Canonical JSON form (sorted, integer, explicit) used by snapshots and the hash. */
export function homesteadSnapshot(h: HomesteadState): HomesteadState {
  return {
    version: h.version, anchorX: h.anchorX, anchorZ: h.anchorZ, rng: h.rng, nextId: h.nextId,
    villagers: [...h.villagers].sort((a, b) => a.id.localeCompare(b.id)).map((v) => ({
      id: v.id, name: v.name, role: v.role, x: v.x, z: v.z, energy: v.energy, hunger: v.hunger,
      carry: v.carry ? { item: v.carry.item, amount: v.carry.amount } : null,
      task: v.task ? { kind: v.task.kind, target: v.task.target, leg: v.task.leg, progress: v.task.progress,
        legs: v.task.legs.map((l) => ({ op: l.op, x: l.x, z: l.z, ticks: l.ticks, effect: l.effect,
          ...(l.item !== undefined ? { item: l.item } : {}), ...(l.amount !== undefined ? { amount: l.amount } : {}) })) } : null,
    })),
    plots: [...h.plots].sort((a, b) => a.id.localeCompare(b.id)).map((p) => ({ id: p.id, x: p.x, z: p.z, w: p.w, d: p.d, crop: p.crop,
      state: p.state, growth: p.growth, moisture: p.moisture, dry: p.dry, tilled: p.tilled })),
    enclosures: [...h.enclosures].sort((a, b) => a.id.localeCompare(b.id)).map((e) => ({ id: e.id, grass: e.grass, feed: e.feed, water: e.water, eggs: e.eggs })),
    animals: [...h.animals].sort((a, b) => a.id.localeCompare(b.id)).map((a) => ({
      id: a.id, species: a.species, sex: a.sex, born: a.born, x: a.x, z: a.z, tx: a.tx, tz: a.tz,
      hunger: a.hunger, starving: a.starving, product: a.product, pregnantUntil: a.pregnantUntil,
    })),
    overflow: Object.fromEntries(Object.entries(h.overflow).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b))),
    steward: {
      enabled: h.steward.enabled,
      policy: { assign_role: h.steward.policy.assign_role, expand_field: h.steward.policy.expand_field },
      proposals: h.steward.proposals.map((p) => ({ id: p.id, action: p.action,
        ...(p.villagerId !== undefined ? { villagerId: p.villagerId } : {}), ...(p.role !== undefined ? { role: p.role } : {}),
        reason: p.reason, tick: p.tick })),
      nextProposal: h.steward.nextProposal,
    },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
const str = (v: unknown, re: RegExp): v is string => typeof v === 'string' && v.length <= 64 && re.test(v);
const POS = 20_000; // |dm| bound (±2 km)
const EFFECTS = new Set<Effect>(['take', 'store', 'till', 'sow', 'reap', 'water_plot', 'draw', 'water_trough', 'fill_feed', 'gather_eggs', 'shear', 'milk', 'eat', 'rest', 'restock', 'none']);
const ITEMS = /^(?:water|seed|fiber|eggs|wool|milk|harvest:(?:wheat|potato|flax)|food|rations|ore|stone|wood)$/;

/** Strict validation: unknown fields, ranges and references are rejected. */
export function validateHomestead(raw: unknown, tick: number): HomesteadState {
  if (!isObj(raw) || raw.version !== HOMESTEAD_VERSION || !int(raw.anchorX, -1000, 1000) || !int(raw.anchorZ, -1000, 1000)
    || !int(raw.rng, 1, 0xffffffff) || !int(raw.nextId, 0, 1_000_000)
    || !Array.isArray(raw.villagers) || raw.villagers.length > MAX_VILLAGERS
    || !Array.isArray(raw.plots) || raw.plots.length > MAX_FIELDS
    || !Array.isArray(raw.enclosures) || raw.enclosures.length !== 4
    || !Array.isArray(raw.animals) || raw.animals.length > MAX_ANIMALS) throw new Error('snapshot has an invalid homestead');
  const villagers: Villager[] = raw.villagers.map((v: unknown) => {
    if (!isObj(v) || !str(v.id, /^villager:\d{1,3}$/) || !str(v.name, /^[A-Za-z][A-Za-z '-]{0,23}$/)
      || !ROLES.includes(v.role as Role) || !int(v.x, -POS, POS) || !int(v.z, -POS, POS)
      || !int(v.energy, 0, 100) || !int(v.hunger, 0, 100)) throw new Error('snapshot has an invalid villager');
    let carry: Carry = null;
    if (v.carry !== null) {
      if (!isObj(v.carry) || !str(v.carry.item, ITEMS) || !int(v.carry.amount, 1, 100)) throw new Error('invalid villager load');
      carry = { item: v.carry.item, amount: v.carry.amount };
    }
    let task: Task | null = null;
    if (v.task !== null) {
      const t = v.task;
      if (!isObj(t) || !str(t.kind, /^[a-z_]{1,16}$/) || !str(t.target, /^[a-z_]+:[a-z0-9:]{1,24}$/)
        || !Array.isArray(t.legs) || t.legs.length < 1 || t.legs.length > 8 || !int(t.leg, 0, t.legs.length - 1) || !int(t.progress, 0, 10_000)) {
        throw new Error('invalid villager task');
      }
      const legs: Leg[] = t.legs.map((l: unknown) => {
        if (!isObj(l) || (l.op !== 'walk' && l.op !== 'work') || !int(l.x, -POS, POS) || !int(l.z, -POS, POS)
          || !int(l.ticks, 0, 1000) || !EFFECTS.has(l.effect as Effect)
          || l.item !== undefined && !str(l.item, ITEMS) || l.amount !== undefined && !int(l.amount, 1, 100)) throw new Error('invalid task leg');
        return { op: l.op, x: l.x, z: l.z, ticks: l.ticks, effect: l.effect as Effect,
          ...(l.item !== undefined ? { item: l.item as string } : {}), ...(l.amount !== undefined ? { amount: l.amount as number } : {}) };
      });
      task = { kind: t.kind, target: t.target, legs, leg: t.leg, progress: t.progress };
    }
    return { id: v.id, name: v.name, role: v.role as Role, x: v.x, z: v.z, energy: v.energy, hunger: v.hunger, carry, task };
  });
  const fieldIds = new Set<string>();
  const plots: Plot[] = raw.plots.map((p: unknown) => {
    if (!isObj(p) || !str(p.id, /^field:\d{1,6}$/) || fieldIds.has(p.id) || !CROPS.includes(p.crop as CropKind)
      || !int(p.x, -1000, 1000) || !int(p.z, -1000, 1000) || !int(p.w, FIELD_MIN, FIELD_MAX) || !int(p.d, FIELD_MIN, FIELD_MAX)
      || !['wild', 'tilled', 'growing', 'ripe'].includes(String(p.state))
      || !int(p.growth, 0, CROP_RULES[p.crop as CropKind].growTicks) || !int(p.moisture, 0, MOISTURE_MAX)
      || !int(p.dry, 0, WITHER_TICKS) || !int(p.tilled, 0, TILL_PER_UNIT * fieldUnits(p.w, p.d))) {
      throw new Error('snapshot has an invalid field');
    }
    fieldIds.add(p.id);
    return { id: p.id, x: p.x, z: p.z, w: p.w, d: p.d, crop: p.crop as CropKind, state: p.state as PlotState,
      growth: p.growth, moisture: p.moisture, dry: p.dry, tilled: p.tilled };
  });
  const enclosureIds: EnclosureId[] = ['coop', 'paddock', 'pen', 'sty'];
  const enclosures: Enclosure[] = raw.enclosures.map((e: unknown, i: number) => {
    if (!isObj(e) || e.id !== enclosureIds[i] || !int(e.grass, 0, GRASS_MAX) || !int(e.feed, 0, TROUGH_MAX)
      || !int(e.water, 0, TROUGH_MAX) || !int(e.eggs, 0, EGG_BOX_MAX)) throw new Error('snapshot has an invalid enclosure');
    return { id: e.id as EnclosureId, grass: e.grass, feed: e.feed, water: e.water, eggs: e.eggs };
  });
  const ids = new Set<string>();
  const animals: Animal[] = raw.animals.map((a: unknown) => {
    if (!isObj(a) || !str(a.id, /^animal:\d{3,6}$/) || ids.has(a.id) || !SPECIES.includes(a.species as Species)
      || (a.sex !== 'f' && a.sex !== 'm') || !int(a.born, -10_000, tick) || !int(a.x, -POS, POS) || !int(a.z, -POS, POS)
      || !int(a.tx, -POS, POS) || !int(a.tz, -POS, POS) || !int(a.hunger, 0, 100) || !int(a.starving, 0, STARVING_DEATH_TICKS)
      || !int(a.product, 0, 1000) || !int(a.pregnantUntil, 0, Number.MAX_SAFE_INTEGER)) throw new Error('snapshot has an invalid animal');
    ids.add(a.id);
    return { id: a.id, species: a.species as Species, sex: a.sex, born: a.born, x: a.x, z: a.z, tx: a.tx, tz: a.tz,
      hunger: a.hunger, starving: a.starving, product: a.product, pregnantUntil: a.pregnantUntil };
  });
  if (!isObj(raw.overflow)) throw new Error('snapshot has an invalid overflow pile');
  const overflow: Record<string, number> = {};
  for (const k of Object.keys(raw.overflow)) {
    const n = raw.overflow[k];
    if (!str(k, ITEMS) || k.startsWith('harvest') || k === 'water' || !int(n, 1, OVERFLOW_CAPACITY)) throw new Error('snapshot has an invalid overflow pile');
    overflow[k] = n;
  }
  if (total(overflow) > OVERFLOW_CAPACITY) throw new Error('overflow pile exceeds capacity');
  const st = raw.steward;
  const policies = new Set(['auto', 'approve', 'off']);
  if (!isObj(st) || typeof st.enabled !== 'boolean' || !isObj(st.policy) || !policies.has(String(st.policy.assign_role))
    || !policies.has(String(st.policy.expand_field)) || !Array.isArray(st.proposals) || st.proposals.length > MAX_PROPOSALS
    || !int(st.nextProposal, 0, 1_000_000)) throw new Error('snapshot has an invalid steward');
  const proposals: Proposal[] = st.proposals.map((p: unknown) => {
    if (!isObj(p) || !str(p.id, /^proposal:\d{1,6}$/) || !STEWARD_ACTIONS.includes(p.action as StewardAction)
      || p.villagerId !== undefined && !str(p.villagerId, /^villager:\d{1,3}$/) || p.role !== undefined && !ROLES.includes(p.role as Role)
      || typeof p.reason !== 'string' || p.reason.length > 160 || !int(p.tick, 0, tick)) throw new Error('snapshot has an invalid proposal');
    return { id: p.id, action: p.action as StewardAction, ...(p.villagerId !== undefined ? { villagerId: p.villagerId as string } : {}),
      ...(p.role !== undefined ? { role: p.role as Role } : {}), reason: p.reason, tick: p.tick };
  });
  const steward: Steward = { enabled: st.enabled, policy: { assign_role: st.policy.assign_role as Policy, expand_field: st.policy.expand_field as Policy },
    proposals, nextProposal: st.nextProposal };
  const h: HomesteadState = { version: HOMESTEAD_VERSION, anchorX: raw.anchorX, anchorZ: raw.anchorZ, rng: raw.rng, nextId: raw.nextId,
    villagers, plots, enclosures, animals, overflow, steward };
  const canonical = homesteadSnapshot(h);
  if (JSON.stringify(canonical) !== JSON.stringify(raw)) throw new Error('snapshot homestead is not canonical');
  return canonical;
}

export function cloneHomestead(h: HomesteadState): HomesteadState {
  return JSON.parse(JSON.stringify(homesteadSnapshot(h))) as HomesteadState;
}
