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
import { MAT, chunkKey, cutEntity, editVersion, worldToChunkX, worldToChunkZ, getVoxel, removeEntity, surfaceAt, topMaterialAtWorld, waterDepthAt } from './world';
import type { Entity } from './world';
import { STAGE_FOOTPRINT, growthStage, treeTimber, treeSpecies } from './vegetation';
import type { TreeSpecies } from './vegetation';
import { TIMBER, TREE_STAGES, WoodlandState, treeLife, validateWoodland, woodlandSnapshot } from './woodland';
import {
  clearGround, isWoodlandHomestead, liftSapling, lifeGoal, managedWoodland, planFelling, planWoodcutter, plantSapling, startWoodland, stepWoodland,
} from './forestry';
import {
  GATE_STATES, GateState, NavFeatures, NavGate, NavGoal, NavGrid, NavRegion, NavState, emptyFeatures, gateLabel, navGrid, navStats, navStep,
  expandPath, findPath, findNearest, canMove, BLOCK,
} from './nav';
import type { SearchOptions } from './nav';
import {
  CARRIED_CAPACITY, FOUNDER_STOCKPILE, FOUNDER_STOCKPILE_ID, LifeResult, RECIPES, total, lifeState,
} from './economy';
import { placeBuilding } from './buildings';
import { footprintCells, footprintEntrance, footprintSize } from './placement';
import { freeOf, planReservation, reservedTotal, reservedTotals } from './reservation';
import { Presence, VILLAGER_KEEP_DM, clipApproach, keepDm, passDm, presenceCells, quantisePresence, ringDm, sideDm, targetClearDm } from './bodies';

/** Legacy homestead rules (M006–M009): villagers walk straight lines, nothing collides. */
export const HOMESTEAD_VERSION = 1 as const;
/**
 * Settlement rules v2 (M010): villagers navigate the real terrain, fences,
 * gates, doors and trees; growth stage sets tree yield and footprint. New
 * homesteads are founded with it; a legacy homestead switches by the
 * journaled `upgrade_homestead` command, so every old journal replays exactly.
 */
export const HOMESTEAD_NAV_VERSION = 2 as const;
/**
 * Settlement rules v3 (M012, "living settlement"): animals move on the same
 * walking grid (fences hold them, an open gate lets them out, a closed one
 * keeps them in), strays graze outside and the herder drives them back
 * through the gate; villagers never share a cell, queue at gates, doors and
 * work spots, and sleep in their own bed. Founded with `found_homestead
 * { rules: 3 }` or switched by `upgrade_homestead { rules: 3 }`.
 */
export const HOMESTEAD_LIVING_VERSION = 3 as const;
/**
 * Settlement rules v4 (M012 Stage B, "work"): woodcutters fell mature and old
 * trees and carry the timber to the store; builders carry materials reserved
 * for an approved building site and build it; a third settler (Cora) arrives
 * with the rules and sleeps in a third bed. Founded with `found_homestead
 * { rules: 4 }` or switched by `upgrade_homestead { rules: 4 }`.
 */
export const HOMESTEAD_WORK_VERSION = 4 as const;
/**
 * Settlement rules v5 (M013, "living woodland"): trees grow, age, die and
 * regenerate in the simulation (sim/woodland.ts); felling leaves stumps that
 * resprout or rot; the owner sets woodland policies and protects trees and
 * areas; the woodcutter fells sustainably and replants (sim/forestry.ts).
 * Founded with `found_homestead { rules: 5 }` or switched by
 * `upgrade_homestead { rules: 5 }`; at that tick every tree is in the stage
 * it was already drawn in.
 */
export const HOMESTEAD_WOODLAND_VERSION = 5 as const;
/**
 * Settlement rules v6 (M014, "player-directed construction"): the owner picks
 * a building from the catalogue (`SITE_RULES`), its place and its rotation;
 * one validator (sim/buildings.ts) decides the placement preview and the
 * journaled `place_site`; young growth in the footprint is cleared, mature
 * trees block. Finished woodsheds and log stores hold timber: the woodcutter
 * carries each load to the nearest one with room, and builders fetch from
 * the store nearest their site. A finished well is a water source. Cancelling
 * a site after materials arrived sends the builder to carry them back.
 * Founded with `found_homestead { rules: 6 }` or switched by
 * `upgrade_homestead { rules: 6 }`.
 */
export const HOMESTEAD_BUILD_VERSION = 6 as const;
/**
 * Settlement rules v7 (STAB-002 S1, "animal unstick"): founding animals,
 * newborns and every wander, graze and herding target sit on free walk cells
 * of the main walkable area inside their enclosure; an animal whose cell is
 * blocked or cut off from that area walks out, cell by cell (never a jump);
 * an empty route is an arrival (one radius: the goal's own reach); and farm
 * animals have visible behaviour states (`act`: wander, graze, drink, rest)
 * with an end tick, which the renderer draws as the pose. Founded with
 * `found_homestead { rules: 7 }` or switched by `upgrade_homestead { rules: 7 }`,
 * which keeps every animal where it stands.
 *
 * STAB-002 S2 adds the player's presence on the tick; S3 ("work priority")
 * plans villager work by priority class (safety, overdue, owner orders, urgent
 * upkeep, routine), ages waiting work, lets any villager help with owner
 * orders, two share a large job, batches trips, splits digging into units,
 * pre-empts only empty-handed idle or not-yet-begun routine work, eats before
 * bed and slows hunger in sleep (see `planV7`).
 */
export const HOMESTEAD_HERD_VERSION = 7 as const;
/**
 * Settlement rules v8 (STAB-002 S4, "pace"): villagers walk 39 dm per tick
 * (VILLAGER_SPEED_V8) and plan with that speed; a part step rounds toward zero
 * on each axis, so a tick's move never exceeds the speed; routine sowing leaves
 * the seed other villagers are fetching and the seed the owner's fields still
 * need; any upkeep or routine work waiting AGE_CRITICAL daytime ticks is
 * critical; a young animal follows its mother (`follow`, so a newborn moves
 * with her from its first night). Everything else is v7 (S1-S3). Rules v7 were released with the S3
 * build (bf23ae5, deployed 2026-11-25) and keep exactly that behaviour; S4
 * changes apply only from v8. Founded with `found_homestead { rules: 8 }` or
 * switched by `upgrade_homestead { rules: 8 }`, which from v7 changes nothing
 * but the rules number (every animal, villager, task, load, site and field
 * stays as it is); from v6 or older it first applies the v7 step.
 */
export const HOMESTEAD_PACE_VERSION = 8 as const;
/** The rules new homesteads are founded with and old ones are upgraded to on load. */
export const HOMESTEAD_LATEST_VERSION = HOMESTEAD_PACE_VERSION;
export type HomesteadVersion = typeof HOMESTEAD_VERSION | typeof HOMESTEAD_NAV_VERSION | typeof HOMESTEAD_LIVING_VERSION | typeof HOMESTEAD_WORK_VERSION | typeof HOMESTEAD_WOODLAND_VERSION | typeof HOMESTEAD_BUILD_VERSION | typeof HOMESTEAD_HERD_VERSION | typeof HOMESTEAD_PACE_VERSION;
export const HOMESTEAD_VERSIONS: readonly HomesteadVersion[] = [HOMESTEAD_VERSION, HOMESTEAD_NAV_VERSION, HOMESTEAD_LIVING_VERSION, HOMESTEAD_WORK_VERSION, HOMESTEAD_WOODLAND_VERSION, HOMESTEAD_BUILD_VERSION, HOMESTEAD_HERD_VERSION, HOMESTEAD_PACE_VERSION];
/** Rules a homestead can be upgraded to by the journaled `upgrade_homestead`. */
export type UpgradeVersion = Exclude<HomesteadVersion, typeof HOMESTEAD_VERSION>;
/** Decimetres per metre: sim positions are integer decimetres. */
export const DM = 10;
/** One in-game day: 300 ticks of 2 s = 10 minutes, matching the sky's day length. */
export const DAY_TICKS = 300;
/** Night inside a day (ticks), when villagers go home and rest. */
export const NIGHT_START = 171;
export const NIGHT_END = 291;
export const VILLAGER_SPEED = 26; // dm per tick (1.3 m/s), settlement rules v1 to v7
/**
 * STAB-002 S4 (settlement rules v8): villagers walk 39 dm per tick (1.95 m/s,
 * 1.5x), from the STAB-001 BUG-C speed sensitivity (field +243 -> +22, well
 * +370 -> +161; above 2x little more is gained). Starving still halves it.
 */
export const VILLAGER_SPEED_V8 = 39;
/** Walking speed of a homestead's villagers (dm per tick) under its rules. */
export const villagerSpeed = (h: Pick<HomesteadState, 'version'>) => (h.version >= HOMESTEAD_PACE_VERSION ? VILLAGER_SPEED_V8 : VILLAGER_SPEED);
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
export type Role = 'farmer' | 'herder' | 'woodcutter' | 'builder';
export const ROLES: readonly Role[] = ['builder', 'farmer', 'herder', 'woodcutter'];
/** Roles that exist only under settlement rules v4. */
export const WORK_ROLES: readonly Role[] = ['builder', 'woodcutter'];
export const FOOD_PREFERENCE = ['rations', 'eggs', 'milk', 'food'] as const;
/** Resources a villager can carry in one load (one stack at a time). */
export type Carry = { item: string; amount: number; site?: string;
  /** v7: part of a site load that is for a second site (delivered after the first). */
  also?: { site: string; amount: number } } | null;
export type Effect =
  | 'take' | 'store' | 'till' | 'sow' | 'reap' | 'water_plot' | 'draw' | 'water_trough' | 'fill_feed'
  | 'gather_eggs' | 'shear' | 'milk' | 'eat' | 'rest' | 'restock' | 'thresh' | 'herd' | 'hold_gate'
  | 'chop' | 'fetch' | 'deliver' | 'build' | 'lift' | 'plant' | 'stow' | 'reclaim' | 'none';
export interface Leg { op: 'walk' | 'work'; x: number; z: number; ticks: number; effect: Effect; item?: string; amount?: number;
  /** v7: what this leg's effect works on when it is not the task's target (a second field, trough, animal or site of a batched trip). */
  at?: string }
export interface Task { kind: string; target: string; legs: Leg[]; leg: number; progress: number }
export interface Villager {
  id: string; name: string; role: Role; x: number; z: number;
  energy: number; hunger: number; carry: Carry; task: Task | null;
  /** v2: the route being walked, gates in hand and the current obstruction (see sim/nav.ts). */
  nav?: NavState;
  /** v2: jobs given up because their destination could not be reached, with the reason, until a tick. */
  avoid?: Avoided[];
}
export interface Avoided { target: string; until: number; reason: string; by: string }
/** A gate or door and whether villagers may pass (open, or closed but theirs to open) or not (locked). */
export interface GateRecord { id: string; state: GateState }
export type PlotState = 'wild' | 'tilled' | 'growing' | 'ripe';
/** A field the player marked out: world position (metres, min corner), size and crop. */
export interface Plot {
  id: string; x: number; z: number; w: number; d: number; crop: CropKind;
  state: PlotState; growth: number; moisture: number; dry: number; tilled: number;
  /** v7: units sown so far while the field is still `tilled` (two sowers, or seed for part of it). */
  sown?: number;
  /** v7: the tick the owner marked this field: an owner order until it is first fully sown. */
  order?: number;
}
export interface Enclosure { id: EnclosureId; grass: number; feed: number; water: number; eggs: number }
export interface Animal {
  id: string; species: Species; sex: 'f' | 'm'; born: number; x: number; z: number; tx: number; tz: number;
  hunger: number; starving: number; product: number; pregnantUntil: number;
  /** v3: heading out through its open gate, or home through it (on its own or driven by the herder). */
  go?: 'out' | 'home';
  /** v7: what the animal is doing (always set under v7). */
  act?: AnimalAct;
  /**
   * v7: for graze and drink, 0 while walking to the spot, then the tick the
   * bout ends; for rest, the tick it gets up; for wander, the tick the state began.
   */
  until?: number;
}
/** v7 behaviour states, drawn as poses: walking or standing, head down at grass, head down at the trough, lying. */
export type AnimalAct = 'wander' | 'graze' | 'drink' | 'rest';
export const ANIMAL_ACTS: readonly AnimalAct[] = ['drink', 'graze', 'rest', 'wander'];
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
  /** v7: the tick of the steward's last role change or role request (its cooldown lives in the world, not in the page). */
  lastAssign?: number;
}
export const MAX_PROPOSALS = 8;

export interface HomesteadState {
  version: HomesteadVersion;
  anchorX: number; anchorZ: number;
  rng: number; nextId: number;
  villagers: Villager[]; plots: Plot[]; enclosures: Enclosure[]; animals: Animal[];
  /** The barn beside the founder store: goods go here when the store is full. */
  overflow: Record<string, number>;
  steward: Steward;
  /** v2 only: gate and door states. */
  gates?: GateRecord[];
  /** v4 only: building sites the owner planned, approved or finished (id order). */
  sites?: BuildSite[];
  /** v5 only: the living woodland (lifecycle records, policy, protection, replanting orders, quota). */
  woodland?: WoodlandState;
  /** v7: routine and upkeep work waiting, by key, with the tick it became due (its age raises its priority). */
  due?: Record<string, number>;
  /** v7: fields, enclosures and sites the owner marked as priority work (sorted). */
  priority?: string[];
}

// ---- building sites (settlement rules v4; the v6 catalogue) ----
export type SiteKind = 'woodshed' | 'logstore' | 'well';
/** Kinds rules v4 and v5 know (their saves and journals only ever hold these). */
export const SITE_KINDS: readonly SiteKind[] = ['woodshed'];
/** The v6 building catalogue (sorted). */
export const BUILD_KINDS: readonly SiteKind[] = ['logstore', 'well', 'woodshed'];
export interface SiteRule {
  label: string;
  /** Footprint (whole metres) before rotation: `w` along x, `d` along z; the door is on the +z side. */
  w: number; d: number;
  /** Materials the builder carries from the store to the site. */
  cost: Record<string, number>;
  /** Builder work ticks after (and in proportion to) the delivered materials. */
  work: number;
  purpose: string;
  /** v6: highest step (m) of ground the footprint may span. */
  maxStep: number;
  /** v6: a timber store: what it holds and how much. Woodcutters stack their loads in the nearest one with room. */
  store?: { item: 'wood'; capacity: number };
  /** v6: a water source (villagers draw water at the nearest well). */
  water?: boolean;
  /** v6: the woodland the preview reports on around a timber store (m), and the wood a day it is planned for. */
  workRadius?: number; demandPerDay?: number;
  /** One line for the catalogue. */
  role: string;
}
export const SITE_RULES: Record<SiteKind, SiteRule> = {
  logstore: { label: 'Log store', w: 2, d: 1, cost: { fiber: 2, wood: 6 }, work: 12, maxStep: 1,
    purpose: 'an open lean-to for 24 wood near the felling', store: { item: 'wood', capacity: 24 }, workRadius: 22, demandPerDay: 6,
    role: 'timber drop-off for 24 wood' },
  well: { label: 'Well', w: 2, d: 2, cost: { fiber: 2, wood: 8 }, work: 18, maxStep: 1, water: true,
    purpose: 'a timber-lined well: farmers and the herder draw water at the nearest well', role: 'water source' },
  woodshed: { label: 'Woodshed', w: 3, d: 2, cost: { fiber: 4, wood: 12 }, work: 24, maxStep: 1,
    purpose: 'a roofed timber store beside the yard (a solid building once finished)', store: { item: 'wood', capacity: 60 }, workRadius: 30, demandPerDay: 12,
    role: 'timber store for 60 wood; the woodcutter\'s base' },
};
export type SiteState = 'planned' | 'approved' | 'done' | 'cancelled';
/**
 * A building site: `planned` is only marked out (no materials held);
 * `approved` holds store stock for it in `reserved` (still in the store,
 * usable by nobody else) and counts what the builder brought in `delivered`;
 * `work` is builder work done. `done` is a real building on the walking grid.
 * v6: `rot` (0-3) turns the footprint a quarter at a time (door +z, +x, -z,
 * -x); a finished timber store holds `stock`; `cancelled` is a site the owner
 * gave up after materials arrived: the builder carries them back, then it goes.
 */
export interface BuildSite {
  id: string; kind: SiteKind; x: number; z: number; state: SiteState;
  reserved: Record<string, number>; delivered: Record<string, number>; work: number;
  rot?: number; stock?: Record<string, number>;
}
export const MAX_SITES = 8;
/** v6: sites (planned, building, finished) a homestead may hold. */
export const MAX_SITES_V6 = 16;
export const isBuildHomestead = (h: Pick<HomesteadState, 'version'>) => h.version >= HOMESTEAD_BUILD_VERSION;
export const isHerdHomestead = (h: Pick<HomesteadState, 'version'>) => h.version >= HOMESTEAD_HERD_VERSION;
/** STAB-002 S4 rules (v8): villager speed 39 dm, exact part steps, seed kept for owner fields, critical age. */
export const isPaceHomestead = (h: Pick<HomesteadState, 'version'>) => h.version >= HOMESTEAD_PACE_VERSION;
/** Barn capacity (in addition to the 200 of the founder store). */
export const OVERFLOW_CAPACITY = 300;

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
/** Where villagers stand to use the founder store (dm). */
export const STORE_SPOT: { readonly x: number; readonly z: number } = STOCK;

// ---------- navigation (settlement rules v2) ----------

export const isNavHomestead = (h: Pick<HomesteadState, 'version'>) => h.version >= HOMESTEAD_NAV_VERSION;
export const isLivingHomestead = (h: Pick<HomesteadState, 'version'>) => h.version >= HOMESTEAD_LIVING_VERSION;
export const isWorkHomestead = (h: Pick<HomesteadState, 'version'>) => h.version >= HOMESTEAD_WORK_VERSION;
/** Gates and doors, sorted by id. */
export const GATE_IDS = ['door:farmhouse', 'gate:coop', 'gate:paddock', 'gate:pen', 'gate:sty'] as const;
export type GateId = typeof GATE_IDS[number];
/** Half-size (m) of the square navigation window around the farmhouse: every field, pen and the store fit inside. */
export const NAV_HALF = 60;
/** Search expansions shared by all villagers in one tick (a full search of the window is 14 400). */
export const NAV_TICK_BUDGET = 40_000;
/** A job whose destination stays unreachable this many ticks is given up, with the reason kept. */
export const NAV_GIVE_UP = 15;
/** ...and not tried again for this many ticks. */
export const NAV_AVOID = 150;

/**
 * Where each gate and door is (metres): the cell inside the fence or building
 * and the edge side it opens onto. Gates face the yard (the -z side), next to
 * where the yard path meets each enclosure; the farmhouse door is the middle
 * of the front (+z) wall, as the cottage model draws it.
 */
export function homesteadGates(h: Pick<HomesteadState, 'anchorX' | 'anchorZ'>): Array<NavGate & { label: string }> {
  const ax = h.anchorX, az = h.anchorZ;
  return [
    { id: 'door:farmhouse', x: ax - 10, z: az - 8, side: 's', label: 'Farmhouse door' },
    { id: 'gate:coop', x: ax - 10, z: az, side: 'n', label: 'Coop gate' },
    { id: 'gate:paddock', x: ax + 2, z: az + 9, side: 'n', label: 'Paddock gate' },
    { id: 'gate:pen', x: ax - 2, z: az, side: 'n', label: 'Pen gate' },
    { id: 'gate:sty', x: ax + 9, z: az, side: 'n', label: 'Sty gate' },
  ];
}

/** Where a field's fence leaves a walk-in gap: the middle of its +z side (the renderer draws the same gap). */
export function fieldOpening(p: Pick<Plot, 'x' | 'z' | 'w' | 'd'>): { x: number; z: number; side: 's' } {
  return { x: p.x + Math.floor(p.w / 2), z: p.z + p.d - 1, side: 's' };
}

/** The navigation window: a square around the farmhouse. */
export function homesteadNavRegion(h: Pick<HomesteadState, 'anchorX' | 'anchorZ'>): NavRegion {
  const cx = h.anchorX - 10, cz = h.anchorZ - 10;
  return { ox: cx - NAV_HALF, oz: cz - NAV_HALF, w: NAV_HALF * 2, h: NAV_HALF * 2 };
}

/** The farm's own obstacles and openings, in whole-metre cells derived from the layout. */
export function homesteadNavFeatures(h: HomesteadState): NavFeatures {
  const ax = h.anchorX, az = h.anchorZ;
  const cells = (x: number, z: number, w: number, d: number) => ({ x0: ax + x, z0: az + z, x1: ax + x + w, z1: az + z + d });
  const f = emptyFeatures();
  const layout = homesteadLayout(h);
  const toCells = (r: Rect) => ({ x0: Math.floor(r.x0 / DM), z0: Math.floor(r.z0 / DM), x1: Math.ceil(r.x1 / DM), z1: Math.ceil(r.z1 / DM) });
  for (const fac of layout) {
    if (fac.kind === 'farmhouse' || fac.kind === 'well') f.blocks.push({ ...toCells(fac.rect), reason: 'building', id: fac.id });
    else f.fences.push({ ...toCells(fac.rect), id: fac.id, gaps: [] });
    if (fac.trough) f.blocks.push({ x0: Math.floor(fac.trough.x / DM), z0: Math.floor(fac.trough.z / DM), x1: Math.floor(fac.trough.x / DM) + 1, z1: Math.floor(fac.trough.z / DM) + 1, reason: 'occupied', id: `trough:${fac.id}` });
  }
  // Shelters and the store take real ground (the models in render/homestead.ts and render/life.ts).
  f.blocks.push({ ...cells(-14, 0, 4, 3), reason: 'occupied', id: 'shelter:coop' });
  f.blocks.push({ ...cells(4, 0, 4, 3), reason: 'occupied', id: 'shelter:sty' });
  f.blocks.push({ ...cells(-6, 9, 4, 3), reason: 'occupied', id: 'shelter:paddock' });
  const sx = FOUNDER_STOCKPILE.x, sz = FOUNDER_STOCKPILE.z;
  f.blocks.push({ x0: sx - 2, z0: sz - 2, x1: sx + 2, z1: sz + 1, reason: 'occupied', id: 'store' });
  f.blocks.push({ x0: sx + 2, z0: sz - 2, x1: sx + 6, z1: sz + 1, reason: 'occupied', id: 'barn' });
  // The farmhouse threshold just inside the door is where villagers sleep.
  f.clear.push(cells(-10, -8, 1, 1));
  // v3: a bed each either side of the threshold (walkable for villagers; bodies still meet the undrawn interior as solid).
  if (isLivingHomestead(h)) for (const [bx, bz] of (isWorkHomestead(h) ? BED_CELLS_V4 : BED_CELLS.slice(0, 2))) f.clear.push({ ...cells(bx, bz, 1, 1), keepSolid: true });
  if (isWorkHomestead(h)) f.clear.push({ ...cells(HALL_V4[0], HALL_V4[1], 1, 1), keepSolid: true });
  // v4: a finished building is solid ground for everyone (villagers route round it, bodies collide).
  const built = (h.sites ?? []).filter((st) => st.state === 'done');
  for (const st of built) { const r = siteCells(st); f.blocks.push({ ...r, reason: 'occupied', id: st.id }); }
  for (const p of h.plots) {
    const r = { x0: p.x, z0: p.z, x1: p.x + p.w, z1: p.z + p.d };
    f.costs.push({ ...r, extra: 3 });
    f.fences.push({ ...r, id: p.id, gaps: [fieldOpening(p)] });
  }
  f.gates = homesteadGates(h).map(({ id, x, z, side }) => ({ id, x, z, side }));
  for (const g of h.gates ?? []) f.gateStates[g.id] = g.state;
  f.key = `${isWorkHomestead(h) ? `v4|${built.map((st) => `${st.id}:${st.x},${st.z},${st.kind}${st.rot ? `,${st.rot}` : ''}`).join(';')}|` : ''}${isLivingHomestead(h) ? 'v3|' : ''}${ax},${az}|${h.plots.map((p) => `${p.id}:${p.x},${p.z},${p.w},${p.d}`).join(';')}|${(h.gates ?? []).map((g) => g.state).join(',')}`;
  return f;
}

/** The current navigation grid of a v2 homestead. */
export function homesteadNav(world: World, h: HomesteadState): NavGrid {
  return navGrid(world, homesteadNavRegion(h), homesteadNavFeatures(h));
}

/** v3 beds inside the farmhouse (cells relative to the anchor): west and east of the threshold, then the threshold. */
const BED_CELLS: ReadonlyArray<[number, number]> = [[-11, -8], [-9, -8], [-10, -8]];
/**
 * v4 beds, one row further in, off a short hall behind the threshold. (The v3
 * beds sit in the front row beside the threshold, so their south sides open
 * straight onto the yard: under v3 a villager could leave bed through the wall
 * and a locked door did not keep anyone in. v3 keeps that for its exact
 * hashes; v4 walls them in, so the door is the only way in or out.)
 */
const BED_CELLS_V4: ReadonlyArray<[number, number]> = [[-11, -9], [-9, -9], [-10, -10]];
const HALL_V4: [number, number] = [-10, -9];
/** A footprint's size (whole metres) after rotation. */
// W4: the footprint geometry is the scenario-neutral one in sim/placement.ts (the same arithmetic, moved).
export function siteSize(kind: SiteKind, rot = 0): { w: number; d: number } {
  const r = SITE_RULES[kind];
  return footprintSize(r.w, r.d, rot);
}
/** A site's footprint in whole-metre cells (min corner x, z; v6 rotation swaps the sides). */
export function siteCells(st: Pick<BuildSite, 'x' | 'z' | 'kind'> & { rot?: number }): { x0: number; z0: number; x1: number; z1: number } {
  const r = SITE_RULES[st.kind];
  return footprintCells(r.w, r.d, st.x, st.z, st.rot ?? 0);
}
/**
 * The cell in front of a site's door (whole metres): outside the middle of its
 * front. Rotation 0 is the +z side (the M012 spot); 1 faces +x, 2 -z, 3 -x.
 */
export function siteEntrance(st: Pick<BuildSite, 'x' | 'z' | 'kind'> & { rot?: number }): { x: number; z: number } {
  const r = SITE_RULES[st.kind];
  return footprintEntrance(r.w, r.d, st.x, st.z, st.rot ?? 0);
}
/** Where a builder stands to work on a site (dm): the centre of its entrance cell. */
export function siteSpot(st: Pick<BuildSite, 'x' | 'z' | 'kind'> & { rot?: number }): { x: number; z: number } {
  const e = siteEntrance(st);
  return { x: e.x * DM + 5, z: e.z * DM + 5 };
}
/**
 * Where a villager sleeps (dm): under v2 just inside the farmhouse door; under
 * v3 each villager has its own bed (by id order), so two never share a cell.
 */
export function bedSpot(h: Pick<HomesteadState, 'anchorX' | 'anchorZ'> & Partial<Pick<HomesteadState, 'version' | 'villagers'>>, v?: Pick<Villager, 'id'>): { x: number; z: number } {
  let c: readonly [number, number] = [-10, -8];
  if (v && h.version !== undefined && h.version >= HOMESTEAD_LIVING_VERSION && h.villagers) {
    const k = [...h.villagers].map((x) => x.id).sort().indexOf(v.id);
    const beds = h.version >= HOMESTEAD_WORK_VERSION ? BED_CELLS_V4 : BED_CELLS;
    if (k >= 0 && k < beds.length) c = beds[k];
  }
  return { x: (h.anchorX + c[0]) * DM + 5, z: (h.anchorZ + c[1]) * DM + 5 };
}

/** A pen's gate: the cell inside it, the cell outside it, and where a herder stands to hold it (cells, metres). */
export function penGate(h: Pick<HomesteadState, 'anchorX' | 'anchorZ'>, id: EnclosureId): { id: string; inside: [number, number]; outside: [number, number]; hold: [number, number] } {
  const g = homesteadGates(h).find((x) => x.id === `gate:${id}`)!;
  return { id: g.id, inside: [g.x, g.z], outside: [g.x, g.z - 1], hold: [g.x + 1, g.z - 1] };
}
/** Midpoint of a gate's or door's edge (metres), where the player reaches for it. */
export function gateEdgeMid(g: NavGate): { x: number; z: number } {
  if (g.side === 'n') return { x: g.x + 0.5, z: g.z };
  if (g.side === 's') return { x: g.x + 0.5, z: g.z + 1 };
  if (g.side === 'e') return { x: g.x + 1, z: g.z + 0.5 };
  return { x: g.x, z: g.z + 0.5 };
}

/** How near (m) the player must be to a gate or door edge to open or close it by hand. */
export const GATE_REACH = 2;
export interface GateUse { gateId: string; state: GateState; next: GateState; label: string; d: number; command: { type: 'set_gate'; gateId: string; state: GateState } }
/**
 * The gate or door the player can work from (x, z) metres, nearest first, as
 * the journaled `set_gate` command it issues: a closed gate opens, an open one
 * closes, and a locked one is unlocked and opened (the owner's own gate never
 * holds the owner in). Works the same from either side of the edge.
 */
export function nearbyGate(world: World, x: number, z: number, reach = GATE_REACH): GateUse | null {
  const h = world.homestead;
  if (!h || !isNavHomestead(h)) return null;
  let best: GateUse | null = null;
  for (const g of homesteadGates(h)) {
    const mid = gateEdgeMid(g), d = len2(x - mid.x, z - mid.z);
    if (d > reach || (best && best.d <= d)) continue;
    const state = h.gates?.find((r) => r.id === g.id)?.state ?? 'closed';
    const next: GateState = state === 'open' ? 'closed' : 'open';
    const name = gateLabel(g.id);
    const label = state === 'open' ? `Close the ${name}` : state === 'locked' ? `Unlock and open the ${name}` : `Open the ${name}`;
    best = { gateId: g.id, state, next, label, d, command: { type: 'set_gate', gateId: g.id, state: next } };
  }
  return best;
}

/**
 * M012 shared structure layer for bodies (the player): the homestead's walking
 * grid (fence and gate edges, buildings, shelters, troughs) and the live gate
 * states. Cached per world revision; null without a v2+ homestead.
 */
const collisionCache = new WeakMap<World, { key: string; grid: NavGrid }>();
export function settlementCollision(world: World): { grid: NavGrid; gate: (id: string) => GateState } | null {
  const h = world.homestead;
  if (!h || !isNavHomestead(h)) return null;
  const key = `${world.revision}:${editVersion(world)}:${h.anchorX},${h.anchorZ}`;
  let c = collisionCache.get(world);
  if (!c || c.key !== key) { c = { key, grid: homesteadNav(world, h) }; collisionCache.set(world, c); }
  return { grid: c.grid, gate: (id) => h.gates?.find((g) => g.id === id)?.state ?? 'closed' };
}
/** The coop's nest box, inside the fence behind the hen house (dm). */
export function nestSpot(h: Pick<HomesteadState, 'anchorX' | 'anchorZ'>): { x: number; z: number } {
  return { x: m(h.anchorX - 12.4), z: m(h.anchorZ + 3.4) };
}

// ---------- founding ----------

/** Homestead yard and buildings relative to its anchor (metres); fields go wherever the player wants. */
export const FOOTPRINT = { x0: -14, z0: -13, x1: 12, z1: 17 };
/** The founder house and terraced farm sites (M002) that the homestead must not cover. */
export const RESERVED_SITES = [{ x0: -62, z0: -48, x1: -51, z1: -39 }, { x0: -54, z0: -44, x1: -44, z1: -42 }, { x0: -40, z0: -44, x1: -25, z1: -33 }];

/**
 * Deterministic site search: a dry, gentle area whose yard edge is next to
 * the founder stockpile (the homestead store), clear of the founder sites.
 */
export function findHomesteadAnchor(world: World): { x: number; z: number } {
  let best = { x: -36, z: -14, score: Infinity };
  // Generate the search area first so its natural features exist, then list them once.
  for (let z = -40; z <= 50; z += 16) for (let x = -64; x <= 4; x += 16) surfaceAt(world, x, z);
  const features = [...world.entities.values()].filter((e) => !e.harvested && !world.entityRemovals.has(e.id)
    && e.x > -80 && e.x < 20 && e.z > -50 && e.z < 60);
  const sites = world.sites.map((st) => ({ x: (st as { x?: number }).x ?? 0, z: (st as { z?: number }).z ?? 0 }));
  for (let cz = -24; cz <= 20; cz += 2) {
    for (let cx = -44; cx <= -20; cx += 2) {
      const fx0 = cx + FOOTPRINT.x0, fz0 = cz + FOOTPRINT.z0, fx1 = cx + FOOTPRINT.x1, fz1 = cz + FOOTPRINT.z1;
      if (RESERVED_SITES.some((r) => fx0 < r.x1 && fx1 > r.x0 && fz0 < r.z1 && fz1 > r.z0)) continue;
      // Never build over a landmark (waystone, marker, cairn); avoid felling the woods.
      const rects = homesteadLayout({ anchorX: cx, anchorZ: cz }).map((f) => f.rect);
      const hit = (x: number, z: number, pad: number) => rects.some((r) => x * DM >= r.x0 - pad * DM && x * DM <= r.x1 + pad * DM && z * DM >= r.z0 - pad * DM && z * DM <= r.z1 + pad * DM);
      const inside = features.filter((e) => hit(e.x, e.z, 1));
      if (inside.some((e) => e.kind === 'waystone' || e.kind === 'marker' || e.kind === 'styl_cairn')) continue;
      if (sites.some((q) => hit(q.x, q.z, 3))) continue;
      // The authored hero grove is part of the founder scene: keep the buildings off it.
      const heroes = inside.filter((e) => e.authored).length;
      const trees = inside.filter((e) => e.kind.startsWith('styl_tree') || e.kind === 'styl_ore').length;
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
      const score = (hi - lo) * 2 + wet * 25 + toStore * 1.5 + trees * 12 + heroes * 60;
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

export function foundHomestead(world: World, version: HomesteadVersion = HOMESTEAD_VERSION): LifeResult<{ anchor: { x: number; z: number } }> {
  const life = lifeState(world);
  if (world.homestead) return { ok: false, code: 'already_founded', reasons: ['this world already has a homestead'] };
  const anchor = findHomesteadAnchor(world);
  const h: HomesteadState = {
    version, anchorX: anchor.x, anchorZ: anchor.z, rng: seedRng(world), nextId: 0,
    villagers: [], plots: [], enclosures: [], animals: [], overflow: {},
    steward: { enabled: true, policy: { assign_role: 'auto', expand_field: 'approve' }, proposals: [], nextProposal: 0 },
    ...(version >= HOMESTEAD_NAV_VERSION ? { gates: GATE_IDS.map((id) => ({ id, state: 'closed' as GateState })) } : {}),
    ...(version >= HOMESTEAD_WORK_VERSION ? { sites: [] } : {}),
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
  const herd = version >= HOMESTEAD_HERD_VERSION;
  for (const [species, sex] of STARTER_HERD) {
    // v7 places the herd after the plots are cleared (below), on free walk cells only.
    const pos = herd ? { x: 0, z: 0 } : randomPointIn(h, enclosureRect(h, SPECIES_RULES[species].enclosure));
    h.animals.push({
      id: `animal:${String(h.nextId++).padStart(3, '0')}`, species, sex,
      born: life.tick - SPECIES_RULES[species].adultAge, x: pos.x, z: pos.z, tx: pos.x, tz: pos.z,
      hunger: Math.floor(rnd(h) * 40), starving: 0, product: Math.floor(rnd(h) * 60), pregnantUntil: 0,
    });
  }
  // The settlers clear the building plots; the felled timber and brush go into the store.
  const s = stock(world);
  const cleared: Record<string, number> = {};
  for (const f of layout) {
    const r = f.rect;
    for (const e of [...world.entities.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      if (e.authored || e.harvested || world.entityRemovals.has(e.id)) continue;
      if (e.x * DM < r.x0 - 10 || e.x * DM > r.x1 + 10 || e.z * DM < r.z0 - 10 || e.z * DM > r.z1 + 10) continue;
      // Under v2 rules a felled tree yields what its growth stage holds.
      const stage = growthStage(e);
      const timber = version >= HOMESTEAD_WOODLAND_VERSION && !e.harvestedOnce && stage && e.kind.startsWith('styl_tree_')
        ? TIMBER[treeSpecies(e, world.seed) as TreeSpecies][stage]
        : version >= HOMESTEAD_NAV_VERSION && !e.harvestedOnce ? treeTimber(e) : null;
      const left = timber ? timber.total : e.remaining;
      if (e.resource && left > 0) cleared[e.resource] = (cleared[e.resource] ?? 0) + left;
      removeEntity(world, e.id);
    }
  }
  for (const [item, amount] of Object.entries(cleared).sort(([a], [b]) => a.localeCompare(b))) {
    putInto(s.inventory, item, Math.min(amount, Math.max(0, s.capacity - total(s.inventory) - 40)), s.capacity);
  }
  // The settlers arrive with seed, straw for the troughs and a little food.
  for (const [item, amount] of Object.entries(FOUNDING_SUPPLIES)) {
    if (!putInto(s.inventory, item, amount, s.capacity)) return { ok: false, code: 'capacity_exceeded', reasons: ['the founder stockpile is too full to receive the settlers\' supplies'] };
  }
  if (herd) {
    // v7: every starter stands on a random free cell of its enclosure's main walkable area.
    const g = homesteadNav(world, h);
    for (const a of h.animals) {
      const p = penPoint(world, h, g, SPECIES_RULES[a.species].enclosure);
      a.x = a.tx = p.x; a.z = a.tz = p.z;
      a.act = 'wander'; a.until = life.tick;
    }
  }
  world.homestead = h;
  if (version >= HOMESTEAD_WORK_VERSION) settlerArrives(world, h);
  if (version >= HOMESTEAD_WOODLAND_VERSION) startWoodland(world, h);
  world.revision++;
  return { ok: true, value: { anchor } };
}

/** v4: the third settler, Cora, arriving with the new rules. She starts as a farmer; the owner (or steward) gives her work. */
export const THIRD_SETTLER = { id: 'villager:2', name: 'Cora' } as const;
function settlerArrives(world: World, h: HomesteadState): void {
  if (h.villagers.some((v) => v.id === THIRD_SETTLER.id) || h.villagers.length >= MAX_VILLAGERS) return;
  // The free walkable cell nearest the yard in front of the farmhouse (ring by ring, fixed order), never one a villager stands on.
  const home = facility(h, 'farmhouse')!.use;
  const g = homesteadNav(world, h);
  const hx = Math.floor(home.x / DM), hz = Math.floor(home.z / DM) + 2;
  const taken = new Set(h.villagers.map((v) => `${Math.floor(v.x / DM)},${Math.floor(v.z / DM)}`));
  let at = { x: home.x, z: home.z };
  search: for (let r = 0; r <= 6; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const cx = hx + dx, cz = hz + dz;
      if (!g.inside(cx, cz) || g.block[g.index(cx, cz)] !== 0 || taken.has(`${cx},${cz}`)) continue;
      at = { x: cx * DM + 5, z: cz * DM + 5 };
      break search;
    }
  }
  h.villagers.push({ id: THIRD_SETTLER.id, name: THIRD_SETTLER.name, role: 'farmer', x: at.x, z: at.z, energy: 100, hunger: 25, carry: null, task: null });
  h.villagers.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Switch a homestead to newer settlement rules (a journaled command). Without
 * `to` it is the M010 upgrade every old journal recorded: legacy v1 to v2.
 * `to: 3` switches a v1 or v2 homestead to v3 (gates keep their state; a
 * legacy one gets closed gates).
 */
export function upgradeHomestead(world: World, to: UpgradeVersion = HOMESTEAD_NAV_VERSION): LifeResult<{ version: HomesteadVersion }> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  if (h.version >= to) return fail('unchanged', `the homestead already uses settlement rules v${h.version}`);
  const from = h.version;
  // Upgrades to v2..v6 run exactly as their journals recorded them; v7 applies
  // each earlier step only when the homestead has not had it yet, so a v6 farm
  // keeps its rotations, its timber store stock and its settlers.
  const recorded = to <= HOMESTEAD_BUILD_VERSION;
  h.version = to;
  h.gates ??= GATE_IDS.map((id) => ({ id, state: 'closed' as GateState }));
  if (to >= HOMESTEAD_WORK_VERSION && (recorded || from < HOMESTEAD_WORK_VERSION)) { h.sites ??= []; settlerArrives(world, h); }
  // v5: the woodland clock starts now; every tree keeps the stage it is drawn in (a v5 woodland carries on unchanged).
  if (to >= HOMESTEAD_WOODLAND_VERSION && from < HOMESTEAD_WOODLAND_VERSION) startWoodland(world, h);
  // v6: every site keeps its place and faces the way it was built (rotation 0); finished woodsheds become (empty) timber stores.
  if (to >= HOMESTEAD_BUILD_VERSION && (recorded || from < HOMESTEAD_BUILD_VERSION)) for (const st of h.sites ?? []) { st.rot = 0; if (st.state === 'done' && SITE_RULES[st.kind].store) st.stock = {}; }
  // v7: every animal stays exactly where it is and starts wandering; one that
  // stands on a blocked or cut-off cell walks out on the following ticks.
  // Animals heading out or being driven home keep their way. (v7 -> v8 skips
  // it: animals keep their state and end tick; v8 adds no state of its own.)
  if (to >= HOMESTEAD_HERD_VERSION && from < HOMESTEAD_HERD_VERSION) {
    const tick = lifeState(world).tick;
    for (const a of h.animals) {
      if (!a.go) { a.tx = a.x; a.tz = a.z; }
      a.act = 'wander'; a.until = tick;
    }
  }
  world.revision++;
  return { ok: true, value: { version: to } };
}

/** The owner opens, closes or locks a gate or door. Locked keeps the villagers out too. */
export function setGate(world: World, gateId: string, state: GateState): LifeResult<{ gateId: string; state: GateState }> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  const g = h.gates?.find((x) => x.id === gateId);
  if (!g) return fail('invalid_target', isNavHomestead(h) ? 'no such gate' : 'this homestead has no gates yet (settlement rules v2)');
  if (!GATE_STATES.includes(state)) return fail('invalid_state', 'gates are open, closed or locked');
  if (g.state === state) return fail('unchanged', `the ${gateLabel(gateId)} is already ${state}`);
  g.state = state;
  world.revision++;
  return { ok: true, value: { gateId, state } };
}

function enclosureRect(h: HomesteadState, id: EnclosureId): Rect {
  return facility(h, id)!.rect;
}

// ---------- settlement rules v7: where animals can stand ----------

/**
 * The free walk cells of one enclosure: every cell whose centre lies inside
 * the fence and which nothing blocks, split into areas an animal can walk
 * between without leaving the enclosure. `main` is the largest area (ties:
 * the one holding the smallest cell index); `list` its cells in index order;
 * `grass` those of them with grass on top (all of `list` when none have).
 * Cached per grid object: a grid is rebuilt as a new object whenever any cell,
 * wall or footprint changes, so the cache never outlives what it describes.
 */
export interface PenCells { main: Set<number>; list: number[]; grass: number[]; all: Set<number> }
const penCache = new WeakMap<NavGrid, Map<string, PenCells>>();
const ANIMAL_MOVE: SearchOptions = { openGatesOnly: true, maxExpansions: 0 };
const DIRS8: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const cellIn = (r: Rect, x: number, z: number) => x * DM + 5 >= r.x0 && x * DM + 5 < r.x1 && z * DM + 5 >= r.z0 && z * DM + 5 < r.z1;

export function penCells(world: World, h: HomesteadState, g: NavGrid, id: EnclosureId): PenCells {
  let byPen = penCache.get(g);
  if (!byPen) { byPen = new Map(); penCache.set(g, byPen); }
  const r = facility(h, id)!.rect;
  const key = `${id}:${r.x0},${r.z0},${r.x1},${r.z1}`;
  const hit = byPen.get(key);
  if (hit) return hit;
  const all = new Set<number>();
  const x0 = Math.floor(r.x0 / DM), z0 = Math.floor(r.z0 / DM), x1 = Math.ceil(r.x1 / DM), z1 = Math.ceil(r.z1 / DM);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (g.inside(x, z) && cellIn(r, x, z)) all.add(g.index(x, z));
  const seen = new Set<number>();
  let best: number[] = [];
  for (const start of [...all].sort((a, b) => a - b)) {
    if (seen.has(start) || g.block[start] !== BLOCK.none) continue;
    const area = [start];
    seen.add(start);
    for (let k = 0; k < area.length; k++) {
      const i = area[k], x = g.cellX(i), z = g.cellZ(i);
      for (const [dx, dz] of DIRS8) {
        if (!g.inside(x + dx, z + dz)) continue;
        const j = g.index(x + dx, z + dz);
        if (seen.has(j) || !all.has(j) || g.block[j] !== BLOCK.none || !canMove(g, x, z, x + dx, z + dz, ANIMAL_MOVE)) continue;
        seen.add(j); area.push(j);
      }
    }
    if (area.length > best.length) best = area;
  }
  const list = best.sort((a, b) => a - b);
  const grassy = list.filter((i) => topMaterialAtWorld(world, g.cellX(i), g.cellZ(i)) === MAT.GRASS);
  const out: PenCells = { main: new Set(list), list, grass: grassy.length ? grassy : list, all };
  byPen.set(key, out);
  return out;
}

const cellCentre = (g: NavGrid, i: number) => ({ x: g.cellX(i) * DM + 5, z: g.cellZ(i) * DM + 5 });

/** v7: a random free cell centre (dm) of an enclosure's main area (one `rnd` draw); the old padded rectangle point if it has none. */
function penPoint(world: World, h: HomesteadState, g: NavGrid, id: EnclosureId, grass = false): { x: number; z: number } {
  const pen = penCells(world, h, g, id);
  const cells = grass ? pen.grass : pen.list;
  if (!cells.length) return randomPointIn(h, enclosureRect(h, id));
  return cellCentre(g, cells[Math.floor(rnd(h) * cells.length)]);
}

/** v7: the cell of `cells` nearest (x, z) dm, ring by ring in a fixed order; null if none within `range` cells. */
function nearestCell(g: NavGrid, x: number, z: number, ok: (i: number) => boolean, range = 24): number | null {
  const cx = Math.floor(x / DM), cz = Math.floor(z / DM);
  for (let r = 0; r <= range; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !g.inside(cx + dx, cz + dz)) continue;
      const i = g.index(cx + dx, cz + dz);
      if (ok(i)) return i;
    }
  }
  return null;
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

// ---------- settlement rules v4: material reservations ----------

/** Store stock held for approved building sites (still physically in the store). */
export function reservedOf(h: HomesteadState, item: string): number {
  return reservedTotal(approvedReservations(h), item);
}
/** The reservations of approved sites (the shared ledger's input; sim/reservation.ts). */
function approvedReservations(h: HomesteadState): Array<Record<string, number>> {
  return (h.sites ?? []).filter((st) => st.state === 'approved').map((st) => st.reserved);
}
/** All reservations by item (sorted). */
export function reservations(h: HomesteadState): Record<string, number> {
  return reservedTotals(approvedReservations(h));
}
/** What anyone but the site's builder may take from the store: stock minus reservations. */
export function freeInStore(world: World, item: string): number {
  const h = world.homestead;
  // v6: timber stacked in finished woodsheds and log stores is store stock too.
  const have = (lifeState(world).stockpiles.get(FOUNDER_STOCKPILE_ID)?.inventory[item] ?? 0) + (h ? storedIn(h, item) : 0);
  return freeOf(have, h ? reservedOf(h, item) : 0);
}

// ---------- settlement rules v6: timber stores and wells ----------

/** v6: finished timber stores (woodsheds, log stores), id order. Empty below v6. */
export function timberStores(h: HomesteadState): BuildSite[] {
  if (!isBuildHomestead(h)) return [];
  return (h.sites ?? []).filter((st) => st.state === 'done' && SITE_RULES[st.kind].store).sort((a, b) => a.id.localeCompare(b.id));
}
/** v6: how much of an item the finished timber stores hold. */
export function storedIn(h: HomesteadState, item: string): number {
  let n = 0;
  for (const st of timberStores(h)) n += st.stock?.[item] ?? 0;
  return n;
}
/** v6: room left in a timber store. */
export function storeRoom(st: BuildSite): number {
  const cap = SITE_RULES[st.kind].store?.capacity ?? 0;
  return Math.max(0, cap - Object.values(st.stock ?? {}).reduce((n, a) => n + a, 0));
}
/** v6: total capacity of the finished timber stores. */
export function storeCapacity(h: HomesteadState): number {
  return timberStores(h).reduce((n, st) => n + (SITE_RULES[st.kind].store?.capacity ?? 0), 0);
}
/** v6: the finished timber store whose door spot is exactly (x, z) dm (a leg's position), or null. */
export function storeAt(h: HomesteadState, x: number, z: number): BuildSite | null {
  for (const st of timberStores(h)) { const p = siteSpot(st); if (p.x === x && p.z === z) return st; }
  return null;
}
const d2 = (a: { x: number; z: number }, b: { x: number; z: number }) => (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z);
/**
 * v6: where a load of timber from (x, z) dm is set down: the nearest of the
 * finished timber stores with room and the founder store (straight line, the
 * founder store on a tie). Below v6 always the founder store.
 */
export function woodDropOff(h: HomesteadState, x: number, z: number): { x: number; z: number; effect: 'store' | 'stow'; siteId: string | null } {
  let best: { x: number; z: number; effect: 'store' | 'stow'; siteId: string | null } = { x: STOCK.x, z: STOCK.z, effect: 'store', siteId: null };
  let bd = d2(STOCK, { x, z });
  for (const st of timberStores(h)) {
    if (storeRoom(st) <= 0) continue;
    const p = siteSpot(st), d = d2(p, { x, z });
    if (d < bd) { bd = d; best = { x: p.x, z: p.z, effect: 'stow', siteId: st.id }; }
  }
  return best;
}
/** v6: where a builder fetches an item reserved for a site: the founder store or the timber store holding some nearest the site. */
function fetchSource(world: World, h: HomesteadState, st: BuildSite, item: string): { x: number; z: number; have: number } {
  const at = siteSpot(st);
  const founder = stock(world).inventory[item] ?? 0;
  let best = { x: STOCK.x, z: STOCK.z, have: founder };
  let bd = founder > 0 ? d2(STOCK, at) : Infinity;
  for (const s of timberStores(h)) {
    const n = s.stock?.[item] ?? 0;
    if (n <= 0) continue;
    const p = siteSpot(s), d = d2(p, at);
    if (d < bd) { bd = d; best = { x: p.x, z: p.z, have: n }; }
  }
  return best;
}
/** v6: where water is drawn for a job at (x, z) dm: the nearest of the farm well and finished wells. Below v6 the farm well. */
export function wellFor(h: HomesteadState, to: { x: number; z: number }): { x: number; z: number } {
  let best = facility(h, 'well')!.use;
  if (!isBuildHomestead(h)) return best;
  let bd = d2(best, to);
  for (const st of h.sites ?? []) {
    if (st.state !== 'done' || !SITE_RULES[st.kind].water) continue;
    const p = siteSpot(st), d = d2(p, to);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
/** v6: take store stock for the owner's or steward's use: the founder store first, then the timber stores in id order. */
export function takeStoreStock(world: World, h: HomesteadState, item: string, amount: number): number {
  let got = takeFrom(stock(world).inventory, item, amount);
  for (const st of timberStores(h)) {
    if (got >= amount) break;
    got += takeFrom(st.stock!, item, amount - got);
  }
  return got;
}
/** The store as everyone but a site's builder sees it (reserved stock left out). */
function freeView(world: World, h: HomesteadState): Record<string, number> {
  const inv = stock(world).inventory;
  if (!h.sites?.length) return inv;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(inv)) { const f = n - reservedOf(h, k); if (f > 0) out[k] = f; }
  return out;
}
/** Carried by villagers for a site (on the way from the store to it). */
function carriedFor(h: HomesteadState, siteId: string, item: string): number {
  // v7: a load for two sites counts each site's share (`also` is the second site's).
  return h.villagers.reduce((n, v) => n + (v.carry?.item !== item ? 0
    : (v.carry.site === siteId ? v.carry.amount - (v.carry.also?.amount ?? 0) : 0) + (v.carry.also?.site === siteId ? v.carry.also.amount : 0)), 0);
}
/** Materials a site still needs reserved: cost less delivered, carried and already reserved. */
export function siteShortfall(h: HomesteadState, st: BuildSite): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [item, cost] of Object.entries(SITE_RULES[st.kind].cost).sort(([a], [b]) => a.localeCompare(b))) {
    const n = cost - (st.delivered[item] ?? 0) - carriedFor(h, st.id, item) - (st.reserved[item] ?? 0);
    if (n > 0) out[item] = n;
  }
  return out;
}
/**
 * Approved sites take free store stock in id order (the first approved is
 * served first), up to what each still needs. Two sites never hold the same
 * unit: a reservation only ever takes stock nobody has reserved.
 */
function reserveSites(world: World, h: HomesteadState): boolean {
  let changed = false;
  for (const st of [...(h.sites ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    if (st.state !== 'approved') continue;
    // One source (the store); a partial plan is kept: the site reserves what is free now and the rest later.
    const plan = planReservation(siteShortfall(h, st), [{ id: 'store', free: (item) => freeInStore(world, item) }]);
    for (const [item, n] of Object.entries(plan.take.store ?? {})) {
      st.reserved[item] = (st.reserved[item] ?? 0) + n;
      changed = true;
    }
  }
  return changed;
}
const bagTotal = (b: Record<string, number>) => Object.values(b).reduce((n, a) => n + a, 0);
/** Builder work a site's delivered materials allow so far (work follows the materials in). */
export function siteWorkAllowed(st: BuildSite): number {
  const rule = SITE_RULES[st.kind];
  return Math.floor((rule.work * bagTotal(st.delivered)) / bagTotal(rule.cost));
}
/** Progress 0..100: half for materials on site, half for work. */
export function siteProgress(st: BuildSite): number {
  if (st.state === 'done') return 100;
  const rule = SITE_RULES[st.kind];
  return Math.floor((50 * bagTotal(st.delivered)) / bagTotal(rule.cost) + (50 * st.work) / rule.work);
}
/** Why a site is not moving, in words (presentation helper; derived, never stored). */
export function siteStatus(world: World, st: BuildSite): string {
  const h = world.homestead!;
  if (st.state === 'done') return 'finished';
  if (st.state === 'planned') return 'waiting for your approval (nothing reserved yet)';
  if (st.state === 'cancelled') {
    const left = Object.entries(st.delivered).map(([k, n]) => `${n} ${k}`).join(' and ');
    const busy = h.villagers.find((v) => v.task?.target === st.id);
    return busy ? `cancelled: ${busy.name} is carrying the materials back (${left} left)` : h.villagers.some((v) => v.role === 'builder')
      ? `cancelled: a builder will carry ${left} back to the store` : `cancelled: ${left} wait on site for a builder to carry them back`;
  }
  const builders = h.villagers.filter((v) => v.role === 'builder');
  const short = siteShortfall(h, st);
  const missing = Object.entries(short).map(([k, n]) => `${n} ${k}`).join(' and ');
  const busy = h.villagers.find((v) => v.task?.target === st.id);
  const felling = isHerdHomestead(h) ? h.villagers.find((v) => v.task?.kind === 'chop' && touches(v.task, st.id)) : undefined;
  if (!busy && felling) return `${felling.name} is felling a tree for it${missing ? `; still waiting for ${missing}` : ''}`;
  if (busy) {
    const what = busy.task!.kind === 'build' ? 'building' : busy.carry?.site === st.id ? `carrying ${busy.carry.amount} ${busy.carry.item} to it` : 'fetching reserved materials';
    return `${busy.name} is ${what}${missing ? `; still waiting for ${missing} (none free in the store)` : ''}`;
  }
  if (!builders.length && !isHerdHomestead(h)) return 'waiting for a builder: assign one in People';
  if (missing && !bagTotal(st.reserved) && siteWorkAllowed(st) <= st.work) return `waiting for ${missing}: none free in the store`;
  if (isHerdHomestead(h)) {
    // v7: approved work is everyone's: the next free villager takes it (a woodcutter, or anyone, fells for missing wood).
    if (missing && !bagTotal(st.reserved) && siteWorkAllowed(st) <= st.work) return `waiting for ${missing}: none free in the store; the next free villager fells for it`;
    return missing ? `waiting for ${missing}; the next free villager brings what is reserved` : 'ready: the next free villager builds it';
  }
  return missing ? `waiting for ${missing}; the builder brings what is reserved` : 'ready: the builder is on the way';
}

// ---------- settlement rules v4: building sites ----------

/** Can a site of this kind go here (min corner in whole metres)? Every reason it cannot. */
export function checkSite(world: World, kind: SiteKind, x: number, z: number, ignoreId?: string): string[] {
  const h = world.homestead;
  if (!h) return ['found the homestead first'];
  if (!isWorkHomestead(h)) return ['building sites need settlement rules v4'];
  if (!SITE_KINDS.includes(kind)) return [BUILD_KINDS.includes(kind) ? 'this building needs settlement rules v6' : 'unknown building'];
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) return ['sites are placed on whole metres'];
  const rule = SITE_RULES[kind];
  const reasons: string[] = [];
  const r = rect(x, z, rule.w, rule.d);
  const others = (h.sites ?? []).filter((st) => st.id !== ignoreId);
  if (!ignoreId && others.length >= MAX_SITES) reasons.push(`the homestead already has ${MAX_SITES} building sites`);
  const home = facility(h, 'farmhouse')!.use;
  if (len2(m(x + rule.w / 2) - home.x, m(z + rule.d / 2) - home.z) > FIELD_RANGE * DM) reasons.push(`too far from the farmhouse (max ${FIELD_RANGE} m)`);
  if (homesteadLayout(h).some((f) => overlaps(r, f.rect, DM))) reasons.push('too close to a building or pen');
  if (h.plots.some((p) => overlaps(r, fieldRect(p), DM))) reasons.push('too close to a field');
  if (others.some((st) => { const c = siteCells(st); return overlaps(r, rect(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0), DM); })) reasons.push('too close to another building site');
  if (RESERVED_SITES.some((q) => overlaps(r, rect(q.x0, q.z0, q.x1 - q.x0, q.z1 - q.z0), DM))) reasons.push('the founder house and terraces are here');
  const sx = m(FOUNDER_STOCKPILE.x), sz = m(FOUNDER_STOCKPILE.z);
  if (overlaps(r, { x0: sx - 25, z0: sz - 20, x1: sx + 65, z1: sz + 30 })) reasons.push('the store and barn are here');
  let lo = Infinity, hi = -Infinity, wet = false;
  // The footprint and the builder's spot in front of it.
  for (let cz = z; cz <= z + rule.d; cz++) {
    for (let cx = x; cx < x + rule.w; cx++) {
      const y = surfaceAt(world, cx, cz);
      if (cz < z + rule.d) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      if (waterDepthAt(world, cx, cz) > 0) wet = true;
    }
  }
  if (wet) reasons.push('there is water here');
  if (hi - lo > 1) reasons.push(`the ground is too steep (${hi - lo} m of slope; at most 1 m)`);
  for (const e of world.entities.values()) {
    if (e.harvested || world.entityRemovals.has(e.id) || e.kind === 'marker' || !standing(world, h, e)) continue;
    if (e.x >= x - 1.5 && e.x < x + rule.w + 1.5 && e.z >= z - 1.5 && e.z < z + rule.d + 2.5) { reasons.push('trees, bushes or rocks are in the way'); break; }
  }
  return reasons;
}

/** Deterministic spot for a new site near the yard (ring search from the farmhouse), or null. */
export function findSiteSpot(world: World, kind: SiteKind = 'woodshed'): { x: number; z: number } | null {
  const h = world.homestead;
  if (!h) return null;
  const home = facility(h, 'farmhouse')!.use;
  const hx = Math.round(home.x / DM), hz = Math.round(home.z / DM);
  const rule = SITE_RULES[kind];
  for (let r = 6; r <= FIELD_RANGE - 4; r += 2) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const x = hx + Math.round(Math.cos(ang) * r) - Math.floor(rule.w / 2), z = hz + Math.round(Math.sin(ang) * r) - Math.floor(rule.d / 2);
      if (checkSite(world, kind, x, z).length === 0) return { x, z };
    }
  }
  return null;
}

/** The owner marks out a building site. Nothing is reserved until it is approved. */
export function placeSite(world: World, kind: SiteKind, x: number, z: number, rot?: number): LifeResult<{ siteId: string; kind: SiteKind; x: number; z: number; rot?: number }> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  // v6: any building of the catalogue, at the owner's place and rotation (sim/buildings.ts decides).
  if (isBuildHomestead(h)) {
    const r = placeBuilding(world, kind, x, z, rot ?? 0);
    return r.ok ? { ok: true, value: { siteId: r.value.siteId, kind, x, z, ...(rot !== undefined ? { rot } : {}) } } : r;
  }
  if (rot !== undefined) return fail('needs_rules', 'turning a building needs settlement rules v6');
  const reasons = checkSite(world, kind, x, z);
  if (reasons.length) return { ok: false, code: 'invalid_site', reasons };
  const id = `site:${h.nextId++}`;
  h.sites = [...(h.sites ?? []), { id, kind, x, z, state: 'planned' as SiteState, reserved: {}, delivered: {}, work: 0 }].sort((a, b) => a.id.localeCompare(b.id));
  if (isWoodlandHomestead(h)) clearGround(world, h, x - 1, z - 1, x + SITE_RULES[kind].w + 1, z + SITE_RULES[kind].d + 2);
  world.revision++;
  return { ok: true, value: { siteId: id, kind, x, z } };
}

/**
 * The owner approves a site: from now on it holds store stock for its
 * materials (what is free now, the rest as it comes in), and a builder may
 * work it. Returns what was reserved at once.
 */
export function approveSite(world: World, siteId: string): LifeResult<{ siteId: string; reserved: Record<string, number> }> {
  const h = world.homestead;
  const st = h?.sites?.find((x) => x.id === siteId);
  if (!h || !st) return fail('invalid_target', 'no such building site');
  if (st.state !== 'planned') return fail('unchanged', st.state === 'done' ? 'this building is finished' : st.state === 'cancelled' ? 'this site was cancelled' : 'this site is already approved');
  st.state = 'approved';
  reserveSites(world, h);
  world.revision++;
  return { ok: true, value: { siteId, reserved: Object.fromEntries(Object.entries(st.reserved).sort(([a], [b]) => a.localeCompare(b))) } };
}

/**
 * The owner cancels a site that has no materials on it yet: its reservation
 * returns to free stock, and a builder working toward it stops (a load in
 * hand goes back to the store on the builder's next errand).
 */
export function cancelSite(world: World, siteId: string): LifeResult<{ siteId: string; released: Record<string, number> }> {
  const h = world.homestead;
  const st = h?.sites?.find((x) => x.id === siteId);
  if (!h || !st) return fail('invalid_target', 'no such building site');
  if (st.state === 'done') return fail('busy', 'this building is finished');
  if (st.state === 'cancelled') return fail('unchanged', 'this site is already cancelled');
  // v6: a site with materials on it is cancelled too: the builder carries them back to the store (no materials vanish or appear).
  const onSite = bagTotal(st.delivered) > 0 || st.work > 0;
  if (onSite && !isBuildHomestead(h)) return fail('busy', 'materials are already on the site');
  const released = Object.fromEntries(Object.entries(st.reserved).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
  if (onSite) { st.state = 'cancelled'; st.reserved = {}; st.work = 0; }
  else h.sites = h.sites!.filter((x) => x.id !== siteId);
  for (const v of h.villagers) {
    if (v.task && touches(v.task, siteId)) v.task = null;
    // v7: a load shared with a second site becomes free stock too (the other site reserves again).
    if (v.carry?.site === siteId || v.carry?.also?.site === siteId) v.carry = { item: v.carry.item, amount: v.carry.amount };
  }
  world.revision++;
  return { ok: true, value: { siteId, released } };
}

// ---------- settlement rules v4: woodcutting ----------

/** A woodcutter carries this much timber per trip (two cuts of a mature tree). */
export const WOOD_CARRY = 8;
/** Ticks of chopping per cut. */
export const CHOP_TICKS = 4;
/** Never start felling while this few mature or old trees (any, the authored grove included) would be left standing in the homestead area. */
export const MIN_STANDING_TREES = 6;
/** Trees this close (metres) to a building, pen, field, site, the store or the barn are left standing. */
export const TREE_CLEARANCE = 5;
/** No new tree is started while this much free timber is in the store and barn and no site still needs wood. */
export const WOOD_STOCK_TARGET = 40;
/** A builder carries at most this much per trip. */
export const BUILDER_CARRY = 8;
/** Builder work per stint (ticks). */
export const BUILD_STINT = 6;

/** Task target for a tree entity (`e:12,34:5` ↔ `tree:12:34:5`); trees with other ids are not felled by villagers. */
export function treeTarget(entityId: string): string | null {
  const mt = /^e:(\d+),(\d+):(\d+)$/.exec(entityId);
  return mt ? `tree:${mt[1]}:${mt[2]}:${mt[3]}` : null;
}
export function treeEntityId(target: string): string | null {
  const mt = /^tree:(\d+):(\d+):(\d+)$/.exec(target);
  return mt ? `e:${mt[1]},${mt[2]}:${mt[3]}` : null;
}

/** Felled trees per world (presentation only: tells the renderer to redraw nature). */
export const felledTrees = new WeakMap<World, number>();

/**
 * Trees a woodcutter may fell: mature or old (never a sapling or a young
 * tree), natural (the authored grove is kept), inside the homestead's walking
 * window and clear of everything built. `standing` counts every mature and
 * old tree there (the grove included) for the minimum that must stay.
 */
export function woodlot(world: World, h: HomesteadState): { trees: Entity[]; standing: number } {
  // v5: the managed woodland under the owner's policy (sim/forestry.ts).
  if (isWoodlandHomestead(h)) { const lot = managedWoodland(world, h); return { trees: lot.trees, standing: lot.standing }; }
  const reg = homesteadNavRegion(h);
  const keepOff: Rect[] = [...homesteadLayout(h).map((f) => f.rect), ...h.plots.map((p) => fieldRect(p)),
    ...(h.sites ?? []).map((st) => { const c = siteCells(st); return rect(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0); }),
    rect(FOUNDER_STOCKPILE.x - 2, FOUNDER_STOCKPILE.z - 2, 8, 3)];
  const near = (e: Entity) => keepOff.some((r) => {
    const cx = Math.max(r.x0, Math.min(e.x * DM, r.x1)), cz = Math.max(r.z0, Math.min(e.z * DM, r.z1));
    return len2(e.x * DM - cx, e.z * DM - cz) < TREE_CLEARANCE * DM;
  });
  const trees: Entity[] = [];
  let standing = 0;
  const ids: string[] = [];
  for (let cz = worldToChunkZ(reg.oz); cz <= worldToChunkZ(reg.oz + reg.h - 1); cz++) {
    for (let cx = worldToChunkX(reg.ox); cx <= worldToChunkX(reg.ox + reg.w - 1); cx++) ids.push(...(world.entityChunks.get(chunkKey(cx, cz)) ?? []));
  }
  ids.sort();
  for (const id of ids) {
    const e = world.entities.get(id);
    if (!e) continue;
    if (!e.kind.startsWith('styl_tree_') || e.harvested || world.entityRemovals.has(e.id) || e.remaining <= 0) continue;
    if (e.x < reg.ox || e.z < reg.oz || e.x >= reg.ox + reg.w || e.z >= reg.oz + reg.h) continue;
    const stage = growthStage(e);
    if (stage !== 'mature' && stage !== 'old') continue;
    standing++;
    if (e.authored || !treeTarget(e.id) || near(e)) continue;
    trees.push(e);
  }
  return { trees, standing };
}

/** Where a woodcutter stands to fell a tree: within reach of the trunk, outside its footprint. */
export function treeGoal(e: Entity): NavGoal {
  return { x: Math.round(e.x * DM), z: Math.round(e.z * DM), reach: Math.round((STAGE_FOOTPRINT[growthStage(e) ?? 'mature'] + 1.2) * DM) };
}

/** Does any approved site still need wood that is not already reserved? */
export function woodWanted(h: HomesteadState): boolean {
  return (h.sites ?? []).some((st) => st.state === 'approved' && (siteShortfall(h, st).wood ?? 0) > 0);
}

/**
 * The woodcutter's next tree: a started tree is finished first; otherwise a
 * new one only while enough stay standing and timber is wanted. The nearest
 * by route cost wins (smallest id on a tie).
 */
function chooseTree(world: World, h: HomesteadState, v: Villager, taken: Set<string>, budget: { left: number }): { e: Entity; why?: undefined } | { e: null; why: string } {
  const lot = woodlot(world, h);
  const open = lot.trees.filter((e) => !taken.has(treeTarget(e.id)!));
  const started = open.filter((e) => e.harvestedOnce);
  let pool = started;
  if (!pool.length) {
    if (lot.standing - 1 < MIN_STANDING_TREES) return { e: null, why: `only ${lot.standing} mature trees are left standing (${MIN_STANDING_TREES} are kept)` };
    const free = freeInStore(world, 'wood') + (h.overflow.wood ?? 0);
    if (free >= WOOD_STOCK_TARGET && !woodWanted(h)) return { e: null, why: `the store has ${free} wood and no site needs more` };
    pool = open;
  }
  if (!pool.length) return { e: null, why: 'no mature tree may be felled here (too close to buildings, or taken)' };
  if (budget.left <= 0) return { e: null, why: 'busy' };
  const grid = homesteadNav(world, h);
  const res = findNearest(world, grid, v, pool.map((e) => ({ ...treeGoal(e), id: e.id })), { maxExpansions: Math.min(budget.left, 15_000) });
  budget.left -= res.expanded;
  if (!res.ok) return { e: null, why: res.code === 'budget' ? 'busy' : 'no mature tree can be reached' };
  return { e: world.entities.get(res.id)! };
}

/** One cut (the player's harvest rule) into the woodcutter's load: chop again, carry it off, or stop. */
function chop(world: World, h: HomesteadState, v: Villager, t: Task, ev: Events, leg?: Leg): 'again' | 'done' | 'fail' {
  const id = treeEntityId(t.target);
  const e = id ? world.entities.get(id) : undefined;
  if (v.carry && v.carry.item !== 'wood') return 'fail';
  const have = v.carry?.amount ?? 0;
  if (!id || !e || e.harvested) return have > 0 ? 'done' : 'fail';
  // STAB-002 S3 (v7): felling for an approved site stops once the load covers what the site still needs; the load is the site's.
  const forSite = isHerdHomestead(h) ? t.legs.find((l) => l.effect === 'deliver' && l.at)?.at : undefined;
  const st = forSite ? h.sites?.find((x) => x.id === forSite && x.state === 'approved') : undefined;
  let limit = WOOD_CARRY;
  if (forSite) {
    if (!st) return have > 0 ? 'done' : 'fail';
    const mine = v.carry?.site === st.id ? have : 0;
    const need = (SITE_RULES[st.kind].cost.wood ?? 0) - (st.delivered.wood ?? 0) - (st.reserved.wood ?? 0) - (carriedFor(h, st.id, 'wood') - mine);
    limit = Math.min(WOOD_CARRY, leg?.amount ?? WOOD_CARRY, Math.max(0, need));
    if (limit - have <= 0) return have > 0 ? 'done' : 'fail';
  }
  const stageBefore = isWoodlandHomestead(h) ? treeLife(world, e)?.stage : growthStage(e);
  // A cut is whole (3-5 wood): a load may end above what the site needs; the site takes its share and the rest goes to the store.
  const r = cutEntity(world, id, WOOD_CARRY - have);
  if (!r) return have > 0 ? 'done' : 'fail';
  v.carry = st ? { item: 'wood', amount: have + r.amount, site: st.id } : { item: 'wood', amount: have + r.amount };
  if (e.harvested) {
    felledTrees.set(world, (felledTrees.get(world) ?? 0) + 1);
    ev.log.push(`${v.name} felled a ${stageBefore === 'snag' ? 'dead' : stageBefore} ${isWoodlandHomestead(h) ? treeLife(world, e)?.species ?? '' : ''}${isWoodlandHomestead(h) ? ' ' : ''}tree (${v.carry.amount} wood in hand)`);
    return 'done';
  }
  const next = Math.min(e.yieldPerHarvest, e.remaining);
  if (forSite) return v.carry.amount < limit ? 'again' : 'done';
  return next <= WOOD_CARRY - v.carry.amount ? 'again' : 'done';
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

function plan(world: World, h: HomesteadState, v: Villager, tick: number, budget: { left: number } = { left: NAV_TICK_BUDGET }): Task | null {
  // STAB-002 S3: rules v7 plan by priority class, with shared jobs and batched trips.
  if (isHerdHomestead(h)) return planV7(world, h, v, tick, budget);
  const layout = homesteadLayout(h);
  const byId = new Map(layout.map((f) => [f.id, f]));
  const home = byId.get('farmhouse')!.use, well = byId.get('well')!.use;
  // v4: stock held for building sites is not there for anyone else.
  const s = freeView(world, h);
  const taken = claimed(h, v);
  // Jobs given up as unreachable are skipped until their time is up (v2).
  for (const a of v.avoid ?? []) if (a.until > tick) taken.add(a.target);
  const task = (kind: string, target: string, legs: Leg[]): Task => ({ kind, target, legs, leg: 0, progress: 0 });
  const nav = isNavHomestead(h);

  // Whatever is in hand goes to the store first (a harvest interrupted by night, a full store retried).
  const carryingSeed = v.carry?.item === 'seed' && v.role === 'farmer'
    && h.plots.some((p) => p.state === 'tilled' && !taken.has(p.id) && unitsOf(p) <= v.carry!.amount);
  const room = stock(world);
  if (v.hunger >= 70 && FOOD_PREFERENCE.some((f) => (s[f] ?? 0) + (h.overflow[f] ?? 0) > 0) && !taken.has(`eat:${v.id}`)) {
    return task('eat', `eat:${v.id}`, [walk(STOCK), work(STOCK, 3, 'eat')]);
  }
  if (isNight(tick) || v.energy <= 10) {
    // v2: through the door to the bed inside; a villager who cannot get home rests where it stands.
    const bed = nav ? (taken.has(`home:${v.id}`) ? { x: v.x, z: v.z } : bedSpot(h, v)) : home;
    return task('rest', `home:${v.id}`, [walk(bed), work(bed, 1, 'rest')]);
  }
  const space = Math.max(0, room.capacity - total(room.inventory)) + Math.max(0, OVERFLOW_CAPACITY - total(h.overflow));
  const carryingFeed = v.carry?.item === 'fiber' && v.role === 'herder' && !v.carry.site;
  // v4: a builder with a site's materials in hand takes them on to the site.
  if (v.role === 'builder' && v.carry?.site) {
    const st = h.sites?.find((x) => x.id === v.carry!.site && x.state === 'approved');
    if (st && !taken.has(st.id)) { const at = siteSpot(st); return task('haul', st.id, [walk(at), work(at, 1, 'deliver')]); }
  }
  // v5: a sapling in hand is planted by a woodcutter; anyone else (reassigned) sets it down: saplings are never stored.
  const carryingSapling = !!v.carry?.item.startsWith('sapling:');
  if (carryingSapling && v.role !== 'woodcutter') v.carry = null;
  if (v.carry && v.carry.item !== 'water' && !carryingSeed && !carryingFeed && !carryingSapling && !taken.has(`carry:${v.id}`)) {
    // v6: timber goes to the nearest woodshed or log store with room (or the store when that is nearer).
    const drop = v.carry.item === 'wood' && !v.carry.site ? woodDropOff(h, v.x, v.z) : null;
    if (drop?.effect === 'stow') return task('store', `carry:${v.id}`, [walk(drop), work(drop, 1, 'stow')]);
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
    // Crops closest to withering first, then the driest.
    const thirsty = plots.filter((p) => p.state === 'growing' && p.moisture <= 4 && free(p))
      .sort((a, b) => b.dry - a.dry || a.moisture - b.moisture || a.id.localeCompare(b.id))[0];
    if (thirsty) {
      // v6: the nearest well to the field (a well the owner built, or the farm well).
      const w = wellFor(h, at(thirsty));
      const legs = v.carry?.item === 'water' ? [] : [walk(w), work(w, 2, 'draw')];
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
  } else if (v.role === 'woodcutter' && isWoodlandHomestead(h)) {
    // v5: plant what felling left to replant, then fell what the woodland policy and its sustainable quota allow.
    const r = planWoodcutter(world, h, v, taken, budget);
    if (r === 'busy') return null;
    if (typeof r !== 'string') return r;
  } else if (v.role === 'woodcutter') {
    // v4: fell a mature tree, carry the timber to the store (the store leg), repeat.
    const pick = chooseTree(world, h, v, taken, budget);
    if (pick.e) {
      const g = treeGoal(pick.e);
      return task('chop', treeTarget(pick.e.id)!, [walk(g), work(g, CHOP_TICKS, 'chop'), walk(STOCK), work(STOCK, 1, 'store')]);
    }
    if (pick.why === 'busy') return null;
  } else if (v.role === 'builder') {
    // v4: carry reserved materials from the store to the first approved site, then build as far as they allow.
    const sorted = [...(h.sites ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    // v6: first carry back what lies on cancelled sites (then it goes to the store or a timber store as any load does).
    for (const st of sorted) {
      if (st.state !== 'cancelled' || taken.has(st.id)) continue;
      const item = Object.keys(st.delivered).sort().find((k) => (st.delivered[k] ?? 0) > 0);
      if (!item) continue;
      const at = siteSpot(st);
      return task('reclaim', st.id, [walk(at), work(at, 1, 'reclaim', item, Math.min(st.delivered[item], BUILDER_CARRY))]);
    }
    for (const st of sorted) {
      if (st.state !== 'approved' || taken.has(st.id)) continue;
      const at = siteSpot(st);
      const item = Object.keys(st.reserved).sort().find((k) => (st.reserved[k] ?? 0) > 0);
      if (item) {
        const amount = Math.min(st.reserved[item], BUILDER_CARRY);
        // v6: from the store (founder store, woodshed or log store) nearest the site that holds some.
        const src = isBuildHomestead(h) ? fetchSource(world, h, st, item) : { x: STOCK.x, z: STOCK.z, have: amount };
        const n = Math.max(1, Math.min(amount, src.have));
        return task('haul', st.id, [walk(src), work(src, 1, 'fetch', item, n), walk(at), work(at, 1, 'deliver')]);
      }
      if (siteWorkAllowed(st) > st.work) return task('build', st.id, [walk(at), work(at, BUILD_STINT, 'build')]);
    }
  } else {
    const encl = [...h.enclosures].sort((a, b) => a.id.localeCompare(b.id));
    // v3: strays first. While their gate is closed the herder drives them back through it
    // (an open gate is the owner's choice and a locked one keeps everyone out).
    if (isLivingHomestead(h)) {
      for (const e of encl) {
        if (taken.has(`stray:${e.id}`) || gateStateOf(h, `gate:${e.id}`) !== 'closed') continue;
        const out = straysOf(h, e.id);
        if (!out.length) continue;
        const g = penGate(h, e.id), hold = { x: g.hold[0] * DM + 5, z: g.hold[1] * DM + 5 };
        const loose = out.find((a) => a.go !== 'home');
        const fetch = loose ? [walk({ x: loose.x, z: loose.z }), work({ x: loose.x, z: loose.z }, 1, 'herd')] : [];
        return task('round_up', `stray:${e.id}`, [...fetch, walk(hold), work(hold, HOLD_GATE_TICKS, 'hold_gate')]);
      }
    }
    const occupied = (e: Enclosure) => h.animals.some((a) => SPECIES_RULES[a.species].enclosure === e.id);
    // Top troughs up well before they run dry: the herd drinks through the night.
    const thirsty = encl.filter((e) => occupied(e) && e.water <= 14 && !taken.has(`water:${e.id}`)).sort((a, b) => a.water - b.water)[0];
    if (thirsty) {
      const t = byId.get(thirsty.id)!.trough!;
      const w = wellFor(h, t);
      const legs = v.carry?.item === 'water' ? [] : [walk(w), work(w, 2, 'draw')];
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
      // v2: the nest box is inside the coop fence, behind the hen house.
      const c = nav ? nestSpot(h) : byId.get('coop')!.use;
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

// ---------- STAB-002 S3: work priority, shared jobs and batched trips (settlement rules v7) ----------

/**
 * Priority classes under rules v7, lowest first: safety (eat, sleep, a load in
 * hand); critical upkeep (a crop about to wither, a trough nearly dry); the
 * next unit of an owner order the villager is already working on; overdue
 * upkeep or routine work of the villager's own role; owner orders (approved
 * sites, fields the owner marked until they are sown, the owner's priority
 * list); overdue work of other roles (overdue for anyone at twice the age); urgent upkeep
 * (thirsty or hungry animals, strays, a crop drying out); routine work; idle.
 */
export const PRIORITY = { safety: 0, critical: 0.25, onJob: 0.4, overdue: 0.5, order: 1, lateOther: 1.5, urgent: 2, routine: 3, idle: 4 } as const;
/** Routine work waiting this many daytime ticks counts as urgent upkeep. */
export const AGE_URGENT = 45;
/** Waiting work of the same class is taken oldest first in steps of this many daytime ticks (nearest first within a step). */
export const AGE_STEP = 30;
/** Any upkeep or routine work waiting this many daytime ticks (75) is overdue: ahead of owner orders, and anyone may do it. */
export const AGE_OVERDUE = 75;
/**
 * STAB-002 S4 (rules v8): any upkeep or routine work waiting this many daytime ticks (85) is critical, for anyone: it
 * comes ahead of the next unit of an owner order a villager is standing at and of owner orders, so a chain of
 * order units (a farm of newly marked fields) cannot hold chores past the 120-tick bound.
 */
export const AGE_CRITICAL = 85;
/** A sprouted crop this many ticks dry, or a trough this low, is overdue at once (the crop withers at WITHER_TICKS). */
export const CROP_CRITICAL_DRY = 15;
export const TROUGH_CRITICAL = 6;
/** v7: a villager this hungry eats before bed (from DUSK_TICKS before nightfall). */
export const BED_HUNGER = 40;
export const DUSK_TICKS = 25;
/** v7: while asleep, hunger rises by 1 every this many ticks (awake: every 2). */
export const SLEEP_HUNGER_EVERY = 6;
/** v7: legs a batched task may have. */
export const MAX_LEGS_V7 = 12;
/** v7: villagers that may share a large job (an approved site; digging or sowing a field of 3 units or more). */
export const JOB_WORKERS = 2;
/** v7: the most seed one sower takes for a field: half the field, at least this. */
export const SOW_CHUNK = 4;
export const MAX_DUE = 160;
export const MAX_PRIORITY = 16;

/** Daytime ticks in [0, t): night ticks are not counted (nobody works at night). */
export function daylight(t: number): number {
  const r = t % DAY_TICKS;
  return Math.floor(t / DAY_TICKS) * (DAY_TICKS - (NIGHT_END - NIGHT_START)) + Math.min(r, NIGHT_START) + Math.max(0, r - NIGHT_END);
}
/** Daytime ticks between two ticks: the age of waiting work. */
export const daylightAge = (since: number, tick: number) => Math.max(0, daylight(tick) - daylight(since));

/** Upkeep and routine work that is due now (rules v7 ages it; the evidence harness measures its wait under any rules). */
export interface DueJob {
  key: string; kind: 'water' | 'harvest' | 'sow' | 'till' | 'stray' | 'trough' | 'feed' | 'eggs' | 'product' | 'restock';
  /** The field, enclosure, animal or 'store' it is for. */
  target: string;
  /** The role it belongs to (null: anyone's). */
  role: Role | null; base: 2 | 3; critical: boolean;
  /** The field or enclosure an owner priority on which makes it an order. */
  place: string;
}
export function dueWork(world: World, h: HomesteadState): DueJob[] {
  const out: DueJob[] = [];
  const s = freeView(world, h);
  const room = stock(world);
  const space = Math.max(0, room.capacity - total(room.inventory)) + Math.max(0, OVERFLOW_CAPACITY - total(h.overflow));
  const seed = (s.seed ?? 0) + (h.overflow.seed ?? 0), fiber = (s.fiber ?? 0) + (h.overflow.fiber ?? 0);
  for (const p of [...h.plots].sort((a, b) => a.id.localeCompare(b.id))) {
    const one = (kind: DueJob['kind'], base: 2 | 3, critical = false) => out.push({ key: `${kind}:${p.id}`, kind, target: p.id, role: 'farmer', base, critical, place: p.id });
    if (p.state === 'growing' && p.moisture <= 4) {
      const drying = p.moisture === 0 && p.growth > 0;
      one('water', drying ? 2 : 3, drying && p.dry >= CROP_CRITICAL_DRY);
    } else if (p.state === 'ripe' && space >= Object.values(CROP_RULES[p.crop].yield).reduce((n, a) => n + a, 0) * unitsOf(p)) one('harvest', 3);
    else if (p.state === 'tilled' && p.order === undefined && (seed > 0 || fiber >= RECIPES.seed.input.fiber!)) one('sow', 3);
    else if (p.state === 'wild' && p.order === undefined) one('till', 3);
  }
  const occupied = (id: EnclosureId) => h.animals.some((a) => SPECIES_RULES[a.species].enclosure === id);
  const straw = fiber;
  for (const e of [...h.enclosures].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!occupied(e.id)) continue;
    const one = (kind: DueJob['kind'], key: string, base: 2 | 3, critical = false) => out.push({ key, kind, target: e.id, role: 'herder', base, critical, place: e.id });
    if (gateStateOf(h, `gate:${e.id}`) === 'closed' && straysOf(h, e.id).length) one('stray', `stray:${e.id}`, 2);
    if (e.water <= 14) one('trough', `trough:${e.id}`, 2, e.water <= TROUGH_CRITICAL);
    const needsTrough = h.animals.some((a) => SPECIES_RULES[a.species].enclosure === e.id && e.grass < SPECIES_RULES[a.species].graze * 3);
    if (needsTrough && e.feed <= 8 && straw > 0) one('feed', `feed:${e.id}`, 2);
  }
  const coop = h.enclosures.find((e) => e.id === 'coop');
  if (coop && coop.eggs >= 3 && space >= coop.eggs) out.push({ key: 'eggs:coop', kind: 'eggs', target: 'coop', role: 'herder', base: 3, critical: false, place: 'coop' });
  for (const a of [...h.animals].sort((x, y) => x.id.localeCompare(y.id))) {
    const p = SPECIES_RULES[a.species].product;
    if (p && p.resource !== 'eggs' && a.product >= p.every && space >= p.amount) {
      out.push({ key: `product:${a.id}`, kind: 'product', target: a.id, role: 'herder', base: 3, critical: false, place: SPECIES_RULES[a.species].enclosure });
    }
  }
  if (Object.keys(h.overflow).length && total(room.inventory) < room.capacity) out.push({ key: 'restock:store', kind: 'restock', target: 'store', role: null, base: 3, critical: false, place: 'store' });
  return out;
}

/** v7, once a tick before anyone acts: keep the tick each piece of due work became due; drop priorities that no longer apply. */
function updateDue(world: World, h: HomesteadState, tick: number): void {
  const next: Record<string, number> = {};
  for (const j of dueWork(world, h).slice(0, MAX_DUE)) next[j.key] = h.due?.[j.key] ?? tick;
  h.due = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  if (h.priority) {
    const keep = h.priority.filter((t) => priorityTargetValid(h, t));
    if (keep.length) h.priority = keep; else delete h.priority;
  }
}
function priorityTargetValid(h: HomesteadState, target: string): boolean {
  if (h.plots.some((p) => p.id === target)) return true;
  if (h.enclosures.some((e) => e.id === target)) return true;
  const st = h.sites?.find((x) => x.id === target);
  return !!st && (st.state === 'planned' || st.state === 'approved');
}

/** Does a task (still) work on this target: its own target, or a remaining leg's? */
export function touches(t: Task, target: string): boolean {
  if (t.target === target) return true;
  for (let i = t.leg; i < t.legs.length; i++) if (t.legs[i].at === target) return true;
  return false;
}
/** v7 claims: how many other villagers hold each job key (a felling for a site is `fell:<site>`); give-ups count as full. */
function claimsV7(h: HomesteadState, self: Villager, tick: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of h.villagers) {
    if (v === self || !v.task) continue;
    const t = v.task;
    // Waiting beside a field with seed in hand takes no worker's place.
    if (t.kind === 'sow' && t.legs.slice(t.leg).every((l) => l.op === 'walk' || l.effect === 'none') && v.carry) continue;
    const keys = new Set<string>([t.target]);
    for (let i = t.leg; i < t.legs.length; i++) {
      const at = t.legs[i].at;
      if (at) keys.add(t.kind === 'chop' && t.legs[i].effect === 'deliver' ? `fell:${at}` : at);
    }
    for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1);
  }
  for (const a of self.avoid ?? []) if (a.until > tick) out.set(a.target, 99);
  // A job someone gave up because the way is blocked (a fence, a tree) is blocked for everyone: nobody else walks into it too.
  for (const v of h.villagers) if (v !== self) for (const a of v.avoid ?? []) if (a.until > tick && a.by !== PLAYER_ID) out.set(a.target, 99);
  return out;
}
/** Sum over other villagers' remaining legs (amount, or work ticks when `ticks`). */
function pending(h: HomesteadState, self: Villager, pick: (t: Task, l: Leg) => boolean, ticks = false): number {
  let n = 0;
  for (const v of h.villagers) {
    if (v === self || !v.task) continue;
    const t = v.task;
    for (let i = t.leg; i < t.legs.length; i++) if (pick(t, t.legs[i])) n += ticks ? t.legs[i].ticks : t.legs[i].amount ?? 0;
  }
  return n;
}
const legAt = (t: Task, l: Leg) => l.at ?? t.target;
/** Seed other villagers hold or are fetching for a field. */
function seedGoing(h: HomesteadState, self: Villager, p: Plot): number {
  let n = 0;
  const r = fieldRect(p);
  for (const v of h.villagers) {
    if (v === self) continue;
    // Seed in the hands of someone between tasks inside the field is for it too.
    if (!v.task) { if (v.carry?.item === 'seed' && insideRect(r, v.x, v.z)) n += v.carry.amount; continue; }
    if (!touches(v.task, p.id)) continue;
    if (v.carry?.item === 'seed') n += v.carry.amount;
    const t = v.task;
    for (let i = t.leg; i < t.legs.length; i++) if (t.legs[i].effect === 'take' && t.legs[i].item === 'seed') n += t.legs[i].amount ?? 0;
  }
  return n;
}
/** Where the k-th worker of a field stands: one cell per unit, spread over the field. */
export function fieldSpot(p: Pick<Plot, 'x' | 'z' | 'w' | 'd'>, k: number): { x: number; z: number } {
  const cells = p.w * p.d, units = fieldUnits(p.w, p.d);
  const i = Math.min(cells - 1, Math.floor((((k % units) + units) % units + 0.5) * cells / units));
  return { x: (p.x + (i % p.w)) * DM + 5, z: (p.z + Math.floor(i / p.w)) * DM + 5 };
}
/** v7: units of a field that may be sown now: all once dug, else the units dug so far. */
export const sowable = (p: Plot) => (p.state === 'tilled' ? unitsOf(p) : p.state === 'wild' ? Math.floor(p.tilled / TILL_PER_UNIT) : 0);
/** Where a helper waits at a field without standing on a worker's spot: its corner cell. */
const fieldCorner = (p: Pick<Plot, 'x' | 'z'>) => ({ x: p.x * DM + 5, z: p.z * DM + 5 });
/** Rough length of a task (ticks): straight-line walks with a detour allowance, plus the work. */
function taskTicks(v: Villager, t: Task, speed: number): number {
  let x = v.x, z = v.z, n = 0;
  for (const l of t.legs) {
    if (l.op === 'walk') { n += Math.ceil((len2(l.x - x, l.z - z) * 1.4) / speed); x = l.x; z = l.z; } else n += l.ticks;
  }
  return n;
}
/**
 * The class of due work for a villager of `role`: an owner priority makes it an order; critical, critical; 75
 * daytime ticks old, overdue for its own role (for the others it comes just after owner orders, until it is
 * twice that old); routine work 45 old, urgent.
 */
export function dueClass(h: HomesteadState, j: DueJob, tick: number, role: Role): number {
  if (h.priority?.includes(j.place)) return PRIORITY.order;
  const age = daylightAge(h.due?.[j.key] ?? tick, tick);
  if (j.critical) return PRIORITY.critical;
  if (isPaceHomestead(h) && age >= AGE_CRITICAL) return PRIORITY.critical;
  if (age >= AGE_OVERDUE) return j.role === null || j.role === role || age >= 2 * AGE_OVERDUE ? PRIORITY.overdue : PRIORITY.lateOther;
  return j.base === 3 && age < AGE_URGENT ? PRIORITY.routine : PRIORITY.urgent;
}
/** The class of the work a routine task is doing (for pre-emption: only strictly more important work interrupts it). */
function taskClass(world: World, h: HomesteadState, t: Task, tick: number, role: Role): number {
  const plot = h.plots.find((p) => p.id === t.target);
  if (plot && (plot.order !== undefined || h.priority?.includes(plot.id))) return PRIORITY.order;
  const key = t.kind === 'collect' ? 'eggs:coop' : t.kind === 'milk' || t.kind === 'shear' ? `product:${t.target}` : t.kind === 'restock' ? 'restock:store'
    : plot ? `${t.kind}:${plot.id}` : null;
  const j = key ? dueWork(world, h).find((x) => x.key === key) : undefined;
  return j ? dueClass(h, j, tick, role) : PRIORITY.routine;
}
/** Task kinds that are routine work: one still on its first walk with empty hands may give way to safety or overdue work. */
const ROUTINE_KINDS = new Set(['collect', 'milk', 'shear', 'harvest', 'water', 'restock', 'thresh', 'sow', 'till', 'plant']);

interface Job { cls: number; own: boolean; since: number; d: number; key: string; make: () => Task | 'busy' | null }

/**
 * v7 planning. Safety first (a load in hand is taken where it goes, eating,
 * sleep), then the best job by class, own role, age (oldest first), distance
 * and key. With `below`, only a job of a class below it is returned (a
 * pre-emption probe: no state changes).
 */
function planV7(world: World, h: HomesteadState, v: Villager, tick: number, budget: { left: number }, below = Infinity as number): Task | null {
  const layout = homesteadLayout(h);
  const byId = new Map(layout.map((f) => [f.id, f]));
  const home = byId.get('farmhouse')!.use;
  const s = freeView(world, h);
  const taken = claimsV7(h, v, tick);
  const free = (k: string, cap = 1) => (taken.get(k) ?? 0) < cap;
  const keySet = () => new Set([...taken.keys()]);
  const task = (kind: string, target: string, legs: Leg[]): Task => ({ kind, target, legs, leg: 0, progress: 0 });
  const atLeg = (l: Leg, at: string): Leg => ({ ...l, at });
  const room = stock(world);
  const space = Math.max(0, room.capacity - total(room.inventory)) + Math.max(0, OVERFLOW_CAPACITY - total(h.overflow));
  const fits = (n: number) => space >= n;
  const night = isNight(tick), dayT = tick % DAY_TICKS;
  const dusk = !night && dayT >= NIGHT_START - DUSK_TICKS;
  const probe = below !== Infinity;
  const plots = [...h.plots].sort((a, b) => a.id.localeCompare(b.id));
  const sites = [...(h.sites ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const prio = new Set(h.priority ?? []);
  const isOrder = (p: Plot) => p.order !== undefined || prio.has(p.id);
  // STAB-002 S4 (v8): seed other villagers will still take from the store is not free; nor, for a field that is not
  // an owner order, the seed the owner's fields still need (orders outrank routine sowing for the seed too).
  // v7 (S3) counts all seed in the store as free for every field.
  const pace = isPaceHomestead(h);
  const seedStore = (s.seed ?? 0) + (h.overflow.seed ?? 0) - (pace ? pending(h, v, (_t, l) => l.effect === 'take' && l.item === 'seed') : 0);
  const fiberFree = (s.fiber ?? 0) + (h.overflow.fiber ?? 0);
  const units = (p: Plot) => unitsOf(p);
  const cap = (p: Plot) => (units(p) >= 3 ? JOB_WORKERS : 1);
  const tillLeft = (p: Plot) => TILL_PER_UNIT * units(p) - p.tilled - pending(h, v, (t, l) => l.effect === 'till' && legAt(t, l) === p.id, true);
  const sowLeft = (p: Plot) => units(p) - (p.sown ?? 0) - seedGoing(h, v, p);
  const orderSeed = pace ? plots.filter((p) => isOrder(p) && (p.state === 'wild' || p.state === 'tilled')).reduce((n, p) => n + Math.max(0, sowLeft(p)), 0) : 0;
  const seedFor = (p: Plot) => Math.max(0, seedStore - (isOrder(p) ? 0 : orderSeed));
  const tillTask = (p: Plot): Task | null => {
    const left = tillLeft(p);
    if (left <= 0) return null;
    const spot = fieldSpot(p, Math.floor((TILL_PER_UNIT * units(p) - left) / TILL_PER_UNIT));
    return task('till', p.id, [walk(spot), atLeg(work(spot, Math.min(TILL_PER_UNIT, left), 'till'), p.id)]);
  };
  const food = FOOD_PREFERENCE.some((f) => (s[f] ?? 0) + (h.overflow[f] ?? 0) > 0) && free(`eat:${v.id}`);
  const eat = () => task('eat', `eat:${v.id}`, [walk(STOCK), work(STOCK, 3, 'eat')]);

  // ---- P0 safety ----
  if (v.hunger >= 100 && food) return eat();
  if (!probe && v.carry) {
    const t = carryTaskV7(world, h, v, tick, budget, free, cap, sowLeft, tillLeft, tillTask, isOrder, plots, sites, byId);
    if (t === 'busy') return null;
    if (t) return t;
  }
  if (food && (v.hunger >= 70 || (v.hunger >= BED_HUNGER && (dusk || night)))) return eat();
  if (night || v.energy <= 10) {
    const bed = free(`home:${v.id}`) ? bedSpot(h, v) : { x: v.x, z: v.z };
    return task('rest', `home:${v.id}`, [walk(bed), work(bed, 1, 'rest')]);
  }
  if (v.carry) return null; // a load nobody can take anywhere (a probe never gets here with one)

  const jobs: Job[] = [];
  const d = (p: { x: number; z: number }) => d2(v, p);
  const push = (j: Job) => { if (j.cls < below) jobs.push(j); };

  // ---- P1 owner orders: approved and cancelled sites, fellings for sites short of wood ----
  for (const st of sites) {
    // Sites in id order (the order reservations serve them); a site on the priority list first.
    const spot = siteSpot(st), since = prio.has(st.id) ? -1 : Number(st.id.slice(5)), own = v.role === 'builder';
    // The next load or stint of a site the villager stands at keeps it there (ahead of overdue routine work).
    const order = d2(v, spot) <= 20 * 20 ? PRIORITY.onJob : PRIORITY.order;
    if (st.state === 'cancelled') {
      const item = Object.keys(st.delivered).sort().find((k) => (st.delivered[k] ?? 0) > 0);
      if (item && free(st.id)) push({ cls: order, own, since, d: d(spot), key: st.id,
        make: () => task('reclaim', st.id, [walk(spot), atLeg(work(spot, 1, 'reclaim', item, Math.min(st.delivered[item], BUILDER_CARRY)), st.id)]) });
      continue;
    }
    if (st.state !== 'approved') continue;
    if (free(st.id, JOB_WORKERS)) {
      const avail = (b: BuildSite, k: string) => (b.reserved[k] ?? 0) - pending(h, v, (t, l) => l.effect === 'fetch' && l.item === k && legAt(t, l) === b.id);
      const item = Object.keys(st.reserved).sort().find((k) => avail(st, k) > 0);
      if (item) {
        push({ cls: order, own, since, d: d(spot), key: st.id, make: () => {
          const src = fetchSource(world, h, st, item);
          const a = Math.max(1, Math.min(avail(st, item), BUILDER_CARRY, src.have));
          const legs: Leg[] = [walk(src), atLeg(work(src, 1, 'fetch', item, a), st.id)];
          const tail: Leg[] = [walk(spot), atLeg(work(spot, 1, 'deliver'), st.id)];
          // One trip for two sites: the rest of the load is taken for a second site that needs the same item from the same store.
          if (a < BUILDER_CARRY && src.have > a) {
            for (const b of sites) {
              if (b === st || b.state !== 'approved' || !free(b.id, JOB_WORKERS) || avail(b, item) <= 0) continue;
              const sb = fetchSource(world, h, b, item);
              if (sb.x !== src.x || sb.z !== src.z) continue;
              const n = Math.min(avail(b, item), BUILDER_CARRY - a, src.have - a);
              if (n <= 0) continue;
              legs.push(atLeg(work(src, 1, 'fetch', item, n), b.id));
              tail.push(walk(siteSpot(b)), atLeg(work(siteSpot(b), 1, 'deliver'), b.id));
              break;
            }
          }
          return task('haul', st.id, [...legs, ...tail]);
        } });
      } else if (siteWorkAllowed(st) - st.work - pending(h, v, (t, l) => l.effect === 'build' && legAt(t, l) === st.id, true) > 0) {
        push({ cls: order, own, since, d: d(spot), key: st.id, make: () => task('build', st.id, [walk(spot), atLeg(work(spot, BUILD_STINT, 'build'), st.id)]) });
      }
    }
    const short = (siteShortfall(h, st).wood ?? 0) - pending(h, v, (t, l) => t.kind === 'chop' && l.effect === 'chop'
      && t.legs.some((x) => x.effect === 'deliver' && x.at === st.id) && !h.villagers.some((o) => o.task === t && o.carry?.site === st.id));
    if (short > 0 && isWoodlandHomestead(h)) {
      push({ cls: order, own: v.role === 'woodcutter', since, d: d(spot), key: `fell:${st.id}`, make: () => {
        const r = planFelling(world, h, v, keySet(), budget, { id: st.id, x: spot.x, z: spot.z }, Math.min(WOOD_CARRY, short), short);
        return r === 'busy' ? 'busy' : typeof r === 'string' ? null : r;
      } });
    }
  }
  // ---- P1 owner orders: fields the owner marked (until sown) or put on the priority list ----
  const sowJob = (p: Plot, cls: number, since: number, key: string) => {
    const left = sowLeft(p), seedFree = seedFor(p);
    if (left <= 0 || !free(p.id, cap(p))) return;
    if (seedFree > 0) {
      push({ cls, own: v.role === 'farmer', since, d: d(STOCK), key, make: () => {
        const n = Math.min(left, seedFree, Math.max(SOW_CHUNK, Math.ceil(units(p) / 2)));
        const spot = fieldSpot(p, units(p) - left);
        return task('sow', p.id, [walk(STOCK), work(STOCK, 1, 'take', 'seed', n), walk(spot), atLeg(work(spot, 1 + n, 'sow', undefined, n), p.id)]);
      } });
    } else if (fiberFree >= RECIPES.seed.input.fiber! && free('thresh:store')) {
      push({ cls, own: v.role === 'farmer', since, d: d(STOCK), key: 'thresh:store', make: () => task('thresh', 'thresh:store', [walk(STOCK), work(STOCK, 4, 'thresh')]) });
    }
  };
  const waterJob = (p: Plot, cls: number, since: number, key: string, own: boolean) => {
    if (!free(p.id)) return;
    push({ cls, own, since, d: d(fieldCentre(p)), key, make: () => {
      const at = fieldCentre(p), w = wellFor(h, at);
      const legs: Leg[] = [walk(w), work(w, 2, 'draw', undefined, CAN_WATERINGS), walk(at), atLeg(work(at, 1, 'water_plot'), p.id)];
      // A can holds 3 waterings: what this field leaves goes on the next thirsty field.
      const used = Math.ceil(((MOISTURE_MAX - p.moisture) * units(p)) / MOISTURE_MAX);
      if (used < CAN_WATERINGS) {
        const next = plots.filter((q) => q !== p && q.state === 'growing' && q.moisture < MOISTURE_MAX - 3 && free(q.id))
          .sort((a, b) => a.moisture - b.moisture || d2(at, fieldCentre(a)) - d2(at, fieldCentre(b)) || a.id.localeCompare(b.id))[0];
        if (next) legs.push(walk(fieldCentre(next)), atLeg(work(fieldCentre(next), 1, 'water_plot'), next.id));
      }
      return task('water', p.id, legs);
    } });
  };
  const harvestJob = (p: Plot, cls: number, since: number, key: string, own: boolean) => {
    if (!free(p.id)) return;
    const at = fieldCentre(p);
    push({ cls, own, since, d: d(at), key, make: () => task('harvest', p.id, [walk(at), atLeg(work(at, 1 + 2 * units(p), 'reap'), p.id), walk(STOCK), work(STOCK, 1, 'store')]) });
  };
  for (const p of plots) {
    if (!isOrder(p)) continue;
    const since = p.order ?? -1, own = v.role === 'farmer';
    // The next unit of a field the villager stands in keeps it there (ahead of overdue routine work).
    const order = insideRect(fieldRect(p), v.x, v.z) ? PRIORITY.onJob : PRIORITY.order;
    if (p.state === 'wild') {
      if (tillLeft(p) <= 0 || !free(p.id, cap(p))) continue;
      const need = sowLeft(p);
      if ((taken.get(p.id) ?? 0) > 0 && need > 0 && seedFor(p) > 0) {
        // The second worker brings the seed while the first digs, then digs or sows with it.
        push({ cls: order, own, since, d: d(STOCK), key: p.id, make: () => {
          const n = Math.min(need, seedFor(p)), spot = fieldCorner(p);
          return task('sow', p.id, [walk(STOCK), work(STOCK, 1, 'take', 'seed', n), walk(spot), atLeg(work(spot, 1, 'none'), p.id)]);
        } });
      } else push({ cls: order, own, since, d: d(fieldCentre(p)), key: p.id, make: () => tillTask(p) });
    } else if (p.state === 'tilled') sowJob(p, order, since, p.id);
    else if (p.state === 'growing' && p.moisture < MOISTURE_MAX - 3) waterJob(p, order, since, p.id, own);
    else if (p.state === 'ripe' && fits(Object.values(CROP_RULES[p.crop].yield).reduce((n, a) => n + a, 0) * units(p))) harvestJob(p, order, since, p.id, own);
  }

  // ---- P2/P3 upkeep and routine work, aged ----
  for (const j of dueWork(world, h)) {
    // Age in steps of AGE_STEP daytime ticks, so that among work of about the same age the nearest goes first.
    const since = Math.floor(daylight(h.due?.[j.key] ?? tick) / AGE_STEP), cls = dueClass(h, j, tick, v.role);
    const own = j.role === null || j.role === v.role;
    if (cls === PRIORITY.routine && !own) continue;
    const p = j.kind === 'water' || j.kind === 'harvest' || j.kind === 'sow' || j.kind === 'till' ? plots.find((q) => q.id === j.target)! : null;
    if (j.kind === 'water') waterJob(p!, cls, since, j.key, own);
    else if (j.kind === 'harvest') harvestJob(p!, cls, since, j.key, own);
    else if (j.kind === 'sow') sowJob(p!, cls, since, j.key);
    else if (j.kind === 'till') { if (free(p!.id, cap(p!))) push({ cls, own, since, d: d(fieldCentre(p!)), key: j.key, make: () => tillTask(p!) }); }
    else if (j.kind === 'stray') {
      const id = j.target as EnclosureId;
      if (!free(`stray:${id}`)) continue;
      const g = penGate(h, id), hold = { x: g.hold[0] * DM + 5, z: g.hold[1] * DM + 5 };
      push({ cls, own, since, d: d(hold), key: j.key, make: () => {
        const loose = straysOf(h, id).find((a) => a.go !== 'home');
        const fetch = loose ? [walk({ x: loose.x, z: loose.z }), work({ x: loose.x, z: loose.z }, 1, 'herd')] : [];
        return task('round_up', `stray:${id}`, [...fetch, walk(hold), work(hold, HOLD_GATE_TICKS, 'hold_gate')]);
      } });
    } else if (j.kind === 'trough') {
      const id = j.target as EnclosureId;
      if (!free(`water:${id}`)) continue;
      const t = byId.get(id)!.trough!;
      push({ cls, own, since, d: d(t), key: j.key, make: () => {
        // A bucket for each trough on the way that can take one (up to three); the coop's goes last so the eggs come along on the way back.
        const others = h.enclosures.filter((e) => e.id !== id && e.water <= TROUGH_MAX - BUCKET && free(`water:${e.id}`)
          && h.animals.some((a) => SPECIES_RULES[a.species].enclosure === e.id))
          .sort((a, b) => a.water - b.water || d2(t, byId.get(a.id)!.trough!) - d2(t, byId.get(b.id)!.trough!) || a.id.localeCompare(b.id)).slice(0, 2);
        const stops = [id, ...others.map((e) => e.id)].sort((a, b) => Number(a === 'coop') - Number(b === 'coop'));
        const w = wellFor(h, t);
        const legs: Leg[] = [walk(w), work(w, 2, 'draw', undefined, stops.length)];
        for (const e of stops) { const p2 = byId.get(e)!.trough!; legs.push(walk(p2), atLeg(work(p2, 1, 'water_trough'), `water:${e}`)); }
        const coop = h.enclosures.find((e) => e.id === 'coop')!;
        if (stops.includes('coop') && coop.eggs > 0 && free('eggs:coop') && fits(coop.eggs)) {
          const c = nestSpot(h);
          legs.push(walk(c), atLeg(work(c, 2, 'gather_eggs'), 'eggs:coop'), walk(STOCK), work(STOCK, 1, 'store'));
        }
        return task('water_trough', `water:${id}`, legs);
      } });
    } else if (j.kind === 'feed') {
      const id = j.target as EnclosureId, e = h.enclosures.find((x) => x.id === id)!;
      if (!free(`feed:${id}`)) continue;
      const t = byId.get(id)!.trough!;
      const amount = Math.min(6, fiberFree, TROUGH_MAX - e.feed);
      if (amount > 0) push({ cls, own, since, d: d(STOCK), key: j.key, make: () => task('feed', `feed:${id}`, [walk(STOCK), work(STOCK, 1, 'take', 'fiber', amount), walk(t), work(t, 2, 'fill_feed')]) });
    } else if (j.kind === 'eggs') {
      if (!free('eggs:coop')) continue;
      const c = nestSpot(h);
      push({ cls, own, since, d: d(c), key: j.key, make: () => task('collect', 'eggs:coop', [walk(c), work(c, 2, 'gather_eggs'), walk(STOCK), work(STOCK, 1, 'store')]) });
    } else if (j.kind === 'product') {
      const a = h.animals.find((x) => x.id === j.target)!;
      if (!free(a.id)) continue;
      const pr = SPECIES_RULES[a.species].product!;
      push({ cls, own, since, d: d(a), key: j.key, make: () => {
        const eff: Effect = pr.resource === 'wool' ? 'shear' : 'milk', ticks = pr.resource === 'wool' ? 4 : 3;
        const legs: Leg[] = [walk({ x: a.x, z: a.z }), atLeg(work({ x: a.x, z: a.z }, ticks, eff), a.id)];
        // Up to three animals ready with the same product nearby: one trip, one load.
        const more = [...h.animals].filter((b) => b !== a && free(b.id) && SPECIES_RULES[b.species].product?.resource === pr.resource
          && b.product >= SPECIES_RULES[b.species].product!.every && len2(b.x - a.x, b.z - a.z) <= 150)
          .sort((x, y) => d2(a, x) - d2(a, y) || x.id.localeCompare(y.id)).slice(0, 2);
        let carried = pr.amount;
        for (const b of more) {
          if (!fits(carried + SPECIES_RULES[b.species].product!.amount)) break;
          legs.push(walk({ x: b.x, z: b.z }), atLeg(work({ x: b.x, z: b.z }, ticks, eff), b.id));
          carried += SPECIES_RULES[b.species].product!.amount;
        }
        return task(eff, a.id, [...legs, walk(STOCK), work(STOCK, 1, 'store')]);
      } });
    } else if (j.kind === 'restock') {
      if (!free('overflow:store')) continue;
      const loose = Object.keys(h.overflow).sort()[0];
      const n = Math.min(h.overflow[loose], room.capacity - total(room.inventory), 10);
      push({ cls, own, since, d: d(STOCK), key: j.key, make: () => task('restock', 'overflow:store', [walk(STOCK), work(STOCK, 2, 'restock', loose, n)]) });
    }
  }
  // ---- P3 the woodcutter's own work: replanting, then felling for stock ----
  if (v.role === 'woodcutter' && isWoodlandHomestead(h)) {
    push({ cls: PRIORITY.routine, own: true, since: tick, d: 0, key: 'woodcutter', make: () => {
      const r = planWoodcutter(world, h, v, keySet(), budget);
      return r === 'busy' ? 'busy' : typeof r === 'string' ? null : r;
    } });
  }

  jobs.sort((a, b) => a.cls - b.cls || Number(b.own) - Number(a.own) || a.since - b.since || a.d - b.d || a.key.localeCompare(b.key));
  for (const j of jobs) {
    const t = j.make();
    if (t === 'busy') return null;
    if (!t) continue;
    // Near dusk, routine work that would run into the night waits for the morning.
    if (j.cls >= PRIORITY.routine && dayT + taskTicks(v, t, villagerSpeed(h)) > NIGHT_START) continue;
    return t;
  }
  if (probe) return null;
  // Nothing to do: idle near home for a while (any job that comes up interrupts it).
  const ox = Math.floor(rnd(h) * 60) - 30, oz = Math.floor(rnd(h) * 40) - 20;
  return task('idle', `idle:${v.id}`, [walk({ x: home.x + ox, z: home.z + oz + 30 }), work({ x: home.x + ox, z: home.z + oz + 30 }, 8, 'none')]);
}

/** v7 safety: a load in hand goes where it is for before anything else (a site load to its site, seed into a field, water on a crop or trough). */
function carryTaskV7(world: World, h: HomesteadState, v: Villager, tick: number, budget: { left: number }, free: (k: string, cap?: number) => boolean,
  cap: (p: Plot) => number, sowLeft: (p: Plot) => number, tillLeft: (p: Plot) => number, tillTask: (p: Plot) => Task | null,
  isOrder: (p: Plot) => boolean, plots: Plot[], sites: BuildSite[], byId: Map<string, Facility>): Task | 'busy' | null {
  const task = (kind: string, target: string, legs: Leg[]): Task => ({ kind, target, legs, leg: 0, progress: 0 });
  const c = v.carry!;
  if (c.site) {
    const st = sites.find((x) => x.id === c.site && x.state === 'approved');
    if (st) {
      const legs: Leg[] = [walk(siteSpot(st)), { ...work(siteSpot(st), 1, 'deliver'), at: st.id }];
      const b = c.also && sites.find((x) => x.id === c.also!.site && x.state === 'approved');
      if (b) legs.push(walk(siteSpot(b)), { ...work(siteSpot(b), 1, 'deliver'), at: b.id });
      return task('haul', st.id, legs);
    }
    v.carry = { item: c.item, amount: c.amount };
  }
  const load = v.carry!;
  if (load.item === 'water') {
    const dry = plots.filter((p) => p.state === 'growing' && p.moisture < MOISTURE_MAX - 3 && free(p.id))
      .sort((a, b) => a.moisture - b.moisture || a.id.localeCompare(b.id))[0];
    if (dry) return task('water', dry.id, [walk(fieldCentre(dry)), { ...work(fieldCentre(dry), 1, 'water_plot'), at: dry.id }]);
    const tr = [...h.enclosures].filter((e) => e.water <= TROUGH_MAX - BUCKET && free(`water:${e.id}`) && h.animals.some((a) => SPECIES_RULES[a.species].enclosure === e.id))
      .sort((a, b) => a.water - b.water || a.id.localeCompare(b.id))[0];
    if (tr) { const t = byId.get(tr.id)!.trough!; return task('water_trough', `water:${tr.id}`, [walk(t), { ...work(t, 1, 'water_trough'), at: `water:${tr.id}` }]); }
    v.carry = null; // the well is endless: what is left is poured out
    return null;
  }
  if (load.item === 'seed') {
    // Owner orders first: sow a dug one, or dig one still being dug with the seed in hand (or wait a moment beside the digger); then any dug field.
    // (Waiting with seed beside a field takes no worker's place, so a full field still counts.)
    const ranked = plots.filter((p) => (p.state === 'tilled' ? sowLeft(p) > 0 && free(p.id, cap(p)) : p.state === 'wild' && isOrder(p) && free(p.id, 99)))
      .sort((a, b) => Number(!isOrder(a)) - Number(!isOrder(b)) || d2(v, fieldCentre(a)) - d2(v, fieldCentre(b)) || a.id.localeCompare(b.id));
    for (const p of ranked) {
      if (p.state === 'tilled') {
        const n = Math.min(load.amount, sowLeft(p)), spot = fieldSpot(p, unitsOf(p) - sowLeft(p));
        return task('sow', p.id, [walk(spot), { ...work(spot, 1 + n, 'sow', undefined, n), at: p.id }]);
      }
      // Sow the units already dug, then dig, then wait.
      const ready = Math.min(load.amount, sowable(p) - (p.sown ?? 0) - pending(h, v, (tk, l) => l.effect === 'sow' && legAt(tk, l) === p.id));
      if (ready > 0) {
        const spot = fieldSpot(p, p.sown ?? 0);
        return task('sow', p.id, [walk(spot), { ...work(spot, 1 + ready, 'sow', undefined, ready), at: p.id }]);
      }
      const t = free(p.id, cap(p)) ? tillTask(p) : null;
      if (t) return t;
      if (h.villagers.some((o) => o !== v && o.task && touches(o.task, p.id) && o.task.legs.some((l) => l.effect === 'till'))) {
        const spot = fieldCorner(p);
        return task('sow', p.id, [walk(spot), { ...work(spot, 2, 'none'), at: p.id }]);
      }
    }
  }
  if (load.item === 'fiber' && !load.site) {
    const hungry = [...h.enclosures].filter((e) => e.feed <= 8 && free(`feed:${e.id}`)
      && h.animals.some((a) => SPECIES_RULES[a.species].enclosure === e.id && e.grass < SPECIES_RULES[a.species].graze * 3))
      .sort((a, b) => a.feed - b.feed || a.id.localeCompare(b.id))[0];
    if (hungry) { const t = byId.get(hungry.id)!.trough!; return task('feed', `feed:${hungry.id}`, [walk(t), work(t, 2, 'fill_feed')]); }
  }
  if (load.item.startsWith('sapling:')) {
    if (v.role !== 'woodcutter') { v.carry = null; return null; }
    const r = planWoodcutter(world, h, v, new Set([...h.villagers].filter((o) => o !== v && o.task).map((o) => o.task!.target)), budget);
    return r === 'busy' ? 'busy' : typeof r === 'string' ? null : r;
  }
  // Wood in hand goes to an approved site that is still short of it (the shortfall counts what is reserved and carried, so nothing is counted twice).
  if (load.item === 'wood') {
    const st = sites.find((x) => x.state === 'approved' && (siteShortfall(h, x).wood ?? 0) > 0);
    if (st) {
      v.carry = { item: 'wood', amount: load.amount, site: st.id };
      return task('haul', st.id, [walk(siteSpot(st)), { ...work(siteSpot(st), 1, 'deliver'), at: st.id }]);
    }
  }
  if (!free(`carry:${v.id}`)) return null;
  const drop = load.item === 'wood' ? woodDropOff(h, v.x, v.z) : null;
  if (drop?.effect === 'stow') return task('store', `carry:${v.id}`, [walk(drop), work(drop, 1, 'stow')]);
  return task('store', `carry:${v.id}`, [walk(STOCK), work(STOCK, 1, 'store')]);
}

// ---------- applying effects ----------

interface Events { log: string[] }
/** Effects that put something into empty hands. */
const PICKUP = new Set<Effect>(['take', 'draw', 'reap', 'gather_eggs', 'shear', 'milk', 'fetch', 'lift', 'reclaim']);

function applyEffect(world: World, h: HomesteadState, v: Villager, leg: Leg, task: Task, ev: Events): boolean {
  const s = stock(world);
  // v7: a batched leg names what it works on; otherwise it is the task's target.
  const target = leg.at ?? task.target;
  const v7 = isHerdHomestead(h);
  // One load at a time: nothing is ever dropped to make room for another (v7: a second site's share, or more of the same product, joins the load).
  if (PICKUP.has(leg.effect) && v.carry && !(leg.effect === 'draw' && v.carry.item === 'water') && !(v7 && stacks(v.carry, leg, target))) return false;
  if (v7) { const r = applyEffectV7(world, h, v, leg, target, ev); if (r !== undefined) return r; }
  switch (leg.effect) {
    case 'none': return true;
    case 'take': {
      // The loose pile beside the store is used first, then the store itself.
      let got = takeFrom(h.overflow, leg.item!, leg.amount!);
      // v4: never stock reserved for a building site.
      got += takeFrom(s.inventory, leg.item!, Math.min(leg.amount! - got, freeInStore(world, leg.item!)));
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
      const got = fromPile + takeFrom(s.inventory, 'fiber', Math.min(need - fromPile, freeInStore(world, 'fiber')));
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
    case 'herd': {
      // Every stray of this pen within reach turns for home (through the gate the herder is about to hold).
      const id = task.target.slice(6) as EnclosureId;
      const r = facility(h, id)!.rect;
      for (const a of straysOf(h, id)) {
        if (a.go === 'home' || len2(a.x - v.x, a.z - v.z) > HERD_REACH) continue;
        const p = isHerdHomestead(h) ? penPoint(world, h, homesteadNav(world, h), id) : randomPointIn(h, r);
        a.go = 'home'; a.tx = p.x; a.tz = p.z;
        if (isHerdHomestead(h)) { a.act = 'wander'; a.until = lifeState(world).tick; }
        ev.log.push(`${v.name} is driving ${a.id} back to the ${id}`);
      }
      return true;
    }
    case 'fetch': {
      // v4: the builder takes the site's own reserved stock out of the store (nobody else's, never free stock).
      const st = h.sites?.find((x) => x.id === task.target);
      const item = leg.item!;
      if (!st || st.state !== 'approved') return false;
      // v6: the leg stands at the founder store or at a timber store's door; the stock comes from that one.
      const src = storeAt(h, leg.x, leg.z);
      const bag = src ? src.stock! : s.inventory;
      const n = Math.min(leg.amount ?? 0, st.reserved[item] ?? 0, bag[item] ?? 0);
      if (n <= 0) return false;
      st.reserved[item] -= n;
      if (st.reserved[item] === 0) delete st.reserved[item];
      takeFrom(bag, item, n);
      v.carry = { item, amount: n, site: st.id };
      ev.log.push(`${v.name} took ${n} reserved ${item} for the ${SITE_RULES[st.kind].label.toLowerCase()}`);
      world.revision++;
      return true;
    }
    case 'deliver': {
      const st = h.sites?.find((x) => x.id === task.target);
      if (!st || st.state !== 'approved' || !v.carry || v.carry.site !== st.id) return false;
      st.delivered[v.carry.item] = (st.delivered[v.carry.item] ?? 0) + v.carry.amount;
      st.delivered = Object.fromEntries(Object.entries(st.delivered).sort(([a], [b]) => a.localeCompare(b)));
      ev.log.push(`${v.name} delivered ${v.carry.amount} ${v.carry.item} to the ${SITE_RULES[st.kind].label.toLowerCase()}`);
      v.carry = null;
      world.revision++;
      return true;
    }
    case 'build': {
      const st = h.sites?.find((x) => x.id === task.target);
      if (!st || st.state !== 'approved') return false;
      const rule = SITE_RULES[st.kind];
      const add = Math.min(leg.ticks, siteWorkAllowed(st) - st.work);
      if (add <= 0) return false;
      st.work += add;
      if (st.work >= rule.work && Object.entries(rule.cost).every(([k, n]) => (st.delivered[k] ?? 0) >= n)) {
        st.state = 'done';
        st.reserved = {};
        if (isBuildHomestead(h) && rule.store) st.stock = {};
        ev.log.push(`${v.name} finished the ${rule.label.toLowerCase()}`);
      }
      world.revision++;
      return true;
    }
    case 'stow': {
      // v6: stack the load in the timber store at this door, as much as fits (the rest is taken on to another store).
      const st = storeAt(h, leg.x, leg.z);
      const rule = st ? SITE_RULES[st.kind].store : undefined;
      if (!st || !rule || !v.carry || v.carry.site || v.carry.item !== rule.item) return false;
      const n = Math.min(v.carry.amount, storeRoom(st));
      if (n <= 0) return false;
      st.stock![rule.item] = (st.stock![rule.item] ?? 0) + n;
      v.carry = v.carry.amount > n ? { item: v.carry.item, amount: v.carry.amount - n } : null;
      ev.log.push(`${v.name} stacked ${n} ${rule.item} in the ${rule === SITE_RULES.woodshed.store ? 'woodshed' : SITE_RULES[st.kind].label.toLowerCase()}`);
      return true;
    }
    case 'reclaim': {
      // v6: carry materials back off a cancelled site; the site goes when it is empty.
      const st = h.sites?.find((x) => x.id === task.target);
      const item = leg.item!;
      if (!st || st.state !== 'cancelled') return false;
      const n = Math.min(leg.amount ?? 0, st.delivered[item] ?? 0);
      if (n <= 0) return false;
      st.delivered[item] -= n;
      if (st.delivered[item] === 0) delete st.delivered[item];
      v.carry = { item, amount: n };
      ev.log.push(`${v.name} picked up ${n} ${item} from the cancelled ${SITE_RULES[st.kind].label.toLowerCase()}`);
      if (!bagTotal(st.delivered)) h.sites = h.sites!.filter((x) => x.id !== st.id);
      world.revision++;
      return true;
    }
    case 'lift': return isWoodlandHomestead(h) && liftSapling(world, h, v, leg, ev.log);
    case 'plant': return isWoodlandHomestead(h) && plantSapling(world, h, v, task, ev.log);
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

/** v7: may this pickup join the load in hand? A second site's share of the same item, or more of the same animal product. */
function stacks(c: NonNullable<Carry>, leg: Leg, target: string): boolean {
  if (leg.effect === 'fetch') return !!c.site && !c.also && c.item === leg.item && c.site !== target;
  if (leg.effect === 'milk' || leg.effect === 'shear') return !c.site && c.item === (leg.effect === 'milk' ? 'milk' : 'wool');
  return false;
}

/** v7 effects that differ from earlier rules (undefined: the shared code applies). */
function applyEffectV7(world: World, h: HomesteadState, v: Villager, leg: Leg, target: string, ev: Events): boolean | undefined {
  const s = stock(world);
  switch (leg.effect) {
    case 'draw': {
      // A farmer's can holds 3 waterings; a bucket trip for troughs carries one bucket per trough on the way.
      const n = leg.amount ?? (v.role === 'farmer' ? CAN_WATERINGS : 1);
      v.carry = { item: 'water', amount: Math.max(n, v.carry?.item === 'water' ? v.carry.amount : 0) };
      return true;
    }
    case 'till': {
      // One unit at a time (the work leg's ticks), so priorities, night and a second digger take effect between units.
      const p = h.plots.find((x) => x.id === target);
      if (!p || p.state !== 'wild') return false;
      const need = TILL_PER_UNIT * unitsOf(p);
      p.tilled = Math.min(need, p.tilled + leg.ticks);
      if (p.tilled >= need) {
        p.state = 'tilled'; p.tilled = 0;
        ev.log.push(`${v.name} dug over the ${CROP_RULES[p.crop].label.toLowerCase()} field`);
      }
      return true;
    }
    case 'sow': {
      // As much as the seed in hand and the leg allow; the field grows once every unit is sown.
      // Units already dug of a field still being dug may be sown too.
      const p = h.plots.find((x) => x.id === target);
      if (!p || (p.state !== 'tilled' && p.state !== 'wild') || v.carry?.item !== 'seed') return false;
      const units = unitsOf(p), done = p.sown ?? 0;
      const n = Math.min(v.carry.amount, sowable(p) - done, leg.amount ?? units);
      if (n <= 0) return false;
      v.carry = v.carry.amount > n ? { item: 'seed', amount: v.carry.amount - n } : null;
      if (done + n >= units && p.state === 'tilled') {
        delete p.sown; delete p.order;
        Object.assign(p, { state: 'growing', growth: 0, moisture: 0, dry: 0 });
        ev.log.push(`${v.name} sowed ${CROP_RULES[p.crop].label.toLowerCase()} (${units} seed)`);
      } else {
        p.sown = done + n;
        ev.log.push(`${v.name} sowed ${p.sown} of ${units} units of ${CROP_RULES[p.crop].label.toLowerCase()}`);
      }
      return true;
    }
    case 'water_plot': {
      const p = h.plots.find((x) => x.id === target);
      if (!p || v.carry?.item !== 'water' || (p.state !== 'growing' && p.state !== 'tilled')) return false;
      const used = Math.min(v.carry.amount, Math.ceil(((MOISTURE_MAX - p.moisture) * unitsOf(p)) / MOISTURE_MAX));
      if (used <= 0) return true;
      v.carry = v.carry.amount > used ? { item: 'water', amount: v.carry.amount - used } : null;
      p.moisture = Math.min(MOISTURE_MAX, p.moisture + Math.ceil((used * MOISTURE_MAX) / unitsOf(p))); p.dry = 0;
      return true;
    }
    case 'reap': {
      const p = h.plots.find((x) => x.id === target);
      if (!p || p.state !== 'ripe') return false;
      v.carry = { item: `harvest:${p.crop}`, amount: unitsOf(p) };
      Object.assign(p, { state: 'tilled', growth: 0, moisture: Math.max(0, p.moisture - 4), dry: 0 });
      ev.log.push(`${v.name} harvested the ${CROP_RULES[p.crop].label.toLowerCase()}`);
      return true;
    }
    case 'water_trough': {
      // One bucket per trough.
      const e = h.enclosures.find((x) => `water:${x.id}` === target);
      if (!e || v.carry?.item !== 'water') return false;
      v.carry = v.carry.amount > 1 ? { item: 'water', amount: v.carry.amount - 1 } : null;
      e.water = Math.min(TROUGH_MAX, e.water + BUCKET);
      return true;
    }
    case 'fetch': {
      const st = h.sites?.find((x) => x.id === target);
      const item = leg.item!;
      if (!st || st.state !== 'approved') return false;
      const src = storeAt(h, leg.x, leg.z);
      const bag = src ? src.stock! : s.inventory;
      const n = Math.min(leg.amount ?? 0, st.reserved[item] ?? 0, bag[item] ?? 0);
      if (n <= 0) return v.carry !== null; // a second site's share that is gone: the first site's load goes on
      st.reserved[item] -= n;
      if (st.reserved[item] === 0) delete st.reserved[item];
      takeFrom(bag, item, n);
      v.carry = v.carry ? { item, amount: v.carry.amount + n, site: v.carry.site, also: { site: st.id, amount: n } } : { item, amount: n, site: st.id };
      ev.log.push(`${v.name} took ${n} reserved ${item} for the ${SITE_RULES[st.kind].label.toLowerCase()}`);
      world.revision++;
      return true;
    }
    case 'deliver': {
      // The site's share of the load (never more than it still needs); a second site's share stays in hand for it.
      const st = h.sites?.find((x) => x.id === target);
      const c = v.carry;
      if (!st || st.state !== 'approved' || !c || c.site !== st.id) return false;
      const forNext = c.also?.amount ?? 0;
      const want = (SITE_RULES[st.kind].cost[c.item] ?? 0) - (st.delivered[c.item] ?? 0);
      const n = Math.max(0, Math.min(c.amount - forNext, want));
      if (n > 0) {
        st.delivered[c.item] = (st.delivered[c.item] ?? 0) + n;
        st.delivered = Object.fromEntries(Object.entries(st.delivered).sort(([a], [b]) => a.localeCompare(b)));
        ev.log.push(`${v.name} delivered ${n} ${c.item} to the ${SITE_RULES[st.kind].label.toLowerCase()}`);
      }
      const left = c.amount - n;
      v.carry = left <= 0 ? null : c.also ? { item: c.item, amount: left, site: c.also.site } : { item: c.item, amount: left };
      world.revision++;
      return true;
    }
    case 'build': {
      const st = h.sites?.find((x) => x.id === target);
      if (!st || st.state !== 'approved') return false;
      const rule = SITE_RULES[st.kind];
      const add = Math.min(leg.ticks, siteWorkAllowed(st) - st.work);
      if (add <= 0) return false;
      st.work += add;
      if (st.work >= rule.work && Object.entries(rule.cost).every(([k, n]) => (st.delivered[k] ?? 0) >= n)) {
        st.state = 'done';
        st.reserved = {};
        if (rule.store) st.stock = {};
        ev.log.push(`${v.name} finished the ${rule.label.toLowerCase()}`);
      }
      world.revision++;
      return true;
    }
    case 'reclaim': {
      const st = h.sites?.find((x) => x.id === target);
      const item = leg.item!;
      if (!st || st.state !== 'cancelled') return false;
      const n = Math.min(leg.amount ?? 0, st.delivered[item] ?? 0);
      if (n <= 0) return false;
      st.delivered[item] -= n;
      if (st.delivered[item] === 0) delete st.delivered[item];
      v.carry = { item, amount: n };
      ev.log.push(`${v.name} picked up ${n} ${item} from the cancelled ${SITE_RULES[st.kind].label.toLowerCase()}`);
      if (!bagTotal(st.delivered)) h.sites = h.sites!.filter((x) => x.id !== st.id);
      world.revision++;
      return true;
    }
    case 'shear': case 'milk': {
      const a = h.animals.find((x) => x.id === target);
      const p = a && SPECIES_RULES[a.species].product;
      if (!a || !p || a.product < p.every) return v.carry !== null; // the second animal was milked already: the load goes on
      v.carry = { item: p.resource, amount: (v.carry?.amount ?? 0) + p.amount };
      a.product = 0;
      ev.log.push(`${v.name} ${leg.effect === 'shear' ? 'sheared' : 'milked'} ${a.id}`);
      return true;
    }
  }
  return undefined;
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

/** What a walk leg is for decides how close the villager must get (dm), and whether the spot moves. */
function goalFor(world: World, h: HomesteadState, t: Task, legIndex: number): NavGoal {
  const leg = t.legs[legIndex], next = t.legs[legIndex + 1];
  if (t.kind === 'idle') return { x: leg.x, z: leg.z, reach: 30 };
  if (next?.effect === 'chop') {
    // Beside the trunk, outside its footprint.
    const e = world.entities.get(treeEntityId(t.target) ?? '');
    if (e) return treeGoal(e);
  }
  // v5: beside a seed parent's trunk to lift a wildling, and beside the planting cell.
  if (next?.effect === 'lift') { const e = treeAt(world, h, leg.x, leg.z); return e ? lifeGoal(world, e) : { x: leg.x, z: leg.z, reach: 25 }; }
  if (next?.effect === 'plant') return { x: leg.x, z: leg.z, reach: 15 };
  // A building site: any cell next to its front.
  if (next?.effect === 'deliver' || next?.effect === 'build' || next?.effect === 'stow' || next?.effect === 'reclaim') return { x: leg.x, z: leg.z, reach: 15 };
  if (next?.effect === 'water_trough' || next?.effect === 'fill_feed') return { x: leg.x, z: leg.z, reach: 15 };
  if (next?.effect === 'herd') {
    // Walk to the stray itself, following it as it grazes.
    const a = straysOf(h, t.target.slice(6) as EnclosureId).find((x) => x.go !== 'home');
    if (a) return { x: a.x, z: a.z, reach: 15, drift: 20 };
  }
  if (next?.effect === 'shear' || next?.effect === 'milk') {
    // Walk to the animal itself, following it as it grazes.
    const a = h.animals.find((x) => x.id === t.target);
    if (a) return { x: a.x, z: a.z, reach: 12, drift: 20 };
  }
  return { x: leg.x, z: leg.z, reach: 8 };
}

/** The window tree whose trunk stands nearest a leg point (dm), within 1 m. */
function treeAt(world: World, h: HomesteadState, x: number, z: number): Entity | null {
  const ids = world.entityChunks.get(chunkKey(worldToChunkX(Math.floor(x / DM)), worldToChunkZ(Math.floor(z / DM)))) ?? [];
  let best: Entity | null = null, bd = 100;
  for (const id of ids) {
    const e = world.entities.get(id);
    if (!e || !e.kind.startsWith('styl_tree_')) continue;
    const d = (e.x * DM - x) ** 2 + (e.z * DM - z) ** 2;
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}
const TASK_WORDS: Record<string, string> = {
  plant: 'the planting spot',
  eat: 'the store to eat', rest: 'home', store: 'the store', restock: 'the store', thresh: 'the store', harvest: 'the field',
  sow: 'the field', water: 'the field', till: 'the field', water_trough: 'the trough', feed: 'the trough', collect: 'the nest box',
  shear: 'the sheep', milk: 'the animal', round_up: 'the stray', chop: 'the tree', haul: 'the building site', build: 'the building site', reclaim: 'the cancelled site',
};

/** v2 walk leg: follow a route over the real ground; arrive, wait, or report the obstruction. */
function navWalk(world: World, h: HomesteadState, v: Villager, t: Task, tick: number, speed: number, ev: Events, budget: { left: number }, occupied?: Map<number, string>): void {
  const grid = homesteadNav(world, h);
  const goal = goalFor(world, h, t, t.leg);
  const r = navStep({
    world, grid, tick, budget,
    gate: (id) => h.gates?.find((g) => g.id === id)?.state ?? 'locked',
    setGate: (id, state) => { const g = h.gates?.find((x) => x.id === id); if (g) g.state = state; },
    canOperate: () => true,
    // STAB-002 S4: under v8 a tick's step never exceeds the walking speed (part steps round toward zero).
    ...(isPaceHomestead(h) ? { exact: true } : {}),
    ...(occupied ? {
      occupied, self: v.id,
      // STAB-002 S2: a founder walking toward this villager counts as waiting on it (a head-on meeting in a
      // doorway): the villager, the later id, steps aside as it does for another villager.
      waitingOn: (id: string) => id === PLAYER_ID
        ? (contact && (contact.p.mx * (v.x - contact.p.x) + contact.p.mz * (v.z - contact.p.z)) > 0 ? v.id : undefined)
        : h.villagers.find((x) => x.id === id)?.nav?.wait?.by,
      nameOf: (id: string) => id === PLAYER_ID ? 'you' : h.villagers.find((x) => x.id === id)?.name ?? id,
    } : {}),
    ...(contact ? {
      clip: (ax: number, az: number, bx: number, bz: number) => clipApproach(ax, az, bx, bz, contact!.p.x, contact!.p.z, VILLAGER_KEEP_DM),
      clipBy: PLAYER_ID,
      keepOpen: (id: string) => gateHasPlayer(grid, id),
    } : {}),
  }, v, goal, speed, t.target);
  // STAB-002 S2: waiting for the player gives up after NAV_GIVE_UP ticks, openly, as a blocked route does.
  const wait = v.nav?.wait;
  if (r.status === 'waiting' && wait?.by === PLAYER_ID && tick - wait.since >= NAV_GIVE_UP) {
    const where = TASK_WORDS[t.kind] ?? t.target;
    if (t.kind !== 'idle') {
      v.avoid = [...(v.avoid ?? []).filter((a) => a.target !== t.target), { target: t.target, until: tick + NAV_AVOID, reason: wait.reason, by: PLAYER_ID }]
        .sort((a, b) => a.target.localeCompare(b.target)).slice(-MAX_AVOID);
      ev.log.push(`${v.name} gave up on ${where} after ${tick - wait.since} ticks: ${wait.reason}`);
    }
    delete v.nav!.wait;
    v.task = null;
    return;
  }
  if (r.status === 'arrived') {
    // A moving animal: work where the villager actually stands, next to it.
    const next = t.legs[t.leg + 1];
    if (next && (next.effect === 'shear' || next.effect === 'milk')) { next.x = v.x; next.z = v.z; }
    t.leg++;
    return;
  }
  if (r.status !== 'blocked') return;
  if (t.kind === 'idle') { t.leg++; return; } // a stroll that cannot go anywhere stays put; no job is lost
  const where = TASK_WORDS[t.kind] ?? t.target;
  if (r.fresh) ev.log.push(`${v.name} cannot reach ${where}: ${r.reason}`);
  const since = v.nav?.blocked?.since ?? tick;
  if (tick - since >= NAV_GIVE_UP) {
    // Give the job up openly: the reason stays on the villager, the load stays in hand, the job is skipped for a while.
    v.avoid = [...(v.avoid ?? []).filter((a) => a.target !== t.target), { target: t.target, until: tick + NAV_AVOID, reason: r.reason, by: r.by }]
      .sort((a, b) => a.target.localeCompare(b.target)).slice(-MAX_AVOID);
    ev.log.push(`${v.name} gave up on ${where} after ${tick - since} ticks: ${r.reason}`);
    v.task = null;
  }
}
const MAX_AVOID = 8;

// ---------- STAB-002 S2: the player's presence (rules v7) ----------

/** The player's id in the shared occupancy map. */
export const PLAYER_ID = 'player';
/** This tick's presence: the point (dm) and the cells the player's disc covers. Set only for the duration of one `stepHomestead`. */
interface Contact { p: Presence; cells: Set<number>; grid: NavGrid }
let contact: Contact | null = null;
function contactOf(world: World, h: HomesteadState, p: Presence): Contact | null {
  const g = homesteadNav(world, h);
  const cells = new Set<number>();
  for (const [x, z] of presenceCells(p)) if (g.inside(x, z)) cells.add(g.index(x, z));
  // Outside the settlement grid nobody here can meet the player.
  return cells.size ? { p, cells, grid: g } : null;
}
/** Does the player stand in one of a gate's two cells? */
function gateHasPlayer(g: NavGrid, gateId: string): boolean {
  const c = g.gateCells.get(gateId);
  if (!contact || !c) return false;
  return contact.cells.has(g.index(c[0], c[1])) || contact.cells.has(g.index(c[2], c[3]));
}
/**
 * STAB-002 S2: the presence the app sends with a tick, from the founder's
 * state: only under rules v7, while walking (alive, not swimming) on the
 * settlement grid with the feet within 1.5 m of its ground (not on a roof).
 * Otherwise null, and the tick carries none.
 */
export function playerPresence(world: World, ch: { x: number; y: number; z: number; vx: number; vz: number; dead: boolean; mode: string } | null,
  intent?: { x: number; z: number }): Presence | null {
  const h = world.homestead;
  if (!ch || ch.dead || ch.mode === 'swim' || !h || !isHerdHomestead(h)) return null;
  const g = homesteadNav(world, h);
  const cx = Math.floor(ch.x), cz = Math.floor(ch.z);
  if (!g.inside(cx, cz) || Math.abs(ch.y - g.ground[g.index(cx, cz)]) > 1.5) return null;
  // The motion is what the founder is trying to do (the stick or keys), else its velocity: pressing against
  // someone in a doorway still says which way they want to go.
  const i = intent && Math.hypot(intent.x, intent.z) > 0.1 ? { x: intent.x * 4, z: intent.z * 4 } : { x: ch.vx, z: ch.vz };
  return quantisePresence(ch.x, ch.z, i.x, i.z);
}
/**
 * STAB-002 S2: a villager standing idle within 1.5 m of a founder walking
 * toward it steps to the free neighbour cell that is farthest from the
 * founder and off their line (not through a gate or door, not into anyone's
 * cell), so an idle villager never blocks a doorway the founder is using.
 */
function villagerYield(world: World, h: HomesteadState, v: Villager, occupied: Map<number, string>): boolean {
  const c = contact!;
  const d0 = len2(v.x - c.p.x, v.z - c.p.z);
  if (d0 >= 15 || (c.p.mx * (v.x - c.p.x) + c.p.mz * (v.z - c.p.z)) <= 0) return false;
  const g = homesteadNav(world, h);
  const cx = Math.floor(v.x / DM), cz = Math.floor(v.z / DM);
  if (!g.inside(cx, cz)) return false;
  const ml = len2(c.p.mx, c.p.mz);
  let best: { x: number; z: number } | null = null, bestScore = -Infinity;
  for (const [dx, dz] of DIRS8) {
    const nx = cx + dx, nz = cz + dz;
    if (!g.inside(nx, nz)) continue;
    const j = g.index(nx, nz), who = occupied.get(j);
    if (g.block[j] !== BLOCK.none || (who !== undefined && who !== v.id) || !canMove(g, cx, cz, nx, nz) || g.gateBetween(cx, cz, nx, nz)) continue;
    const t = cellCentre(g, j);
    if (clipApproach(v.x, v.z, t.x, t.z, c.p.x, c.p.z, VILLAGER_KEEP_DM) < 1) continue;
    const d1 = len2(t.x - c.p.x, t.z - c.p.z);
    if (d1 <= d0) continue;
    const score = d1 + Math.abs((t.x - c.p.x) * c.p.mz - (t.z - c.p.z) * c.p.mx) / ml;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (!best) return false;
  v.x = best.x; v.z = best.z;
  if (v.nav) { v.nav.path = []; v.nav.plan = ''; delete v.nav.wait; }
  return true;
}
const presenceDist = (x: number, z: number) => contact ? len2(x - contact.p.x, z - contact.p.z) : Infinity;

/** v3 round-up: how long (ticks) the herder holds a gate open for driven strays, and how near (dm) a stray must be to be driven. */
export const HOLD_GATE_TICKS = 30;
export const HERD_REACH = 30;

/**
 * The herder stands beside the pen gate: opens it (if it was closed), waits
 * while the driven strays walk in, then closes it again. Strays still out at
 * the end wait at the gate for the next round-up.
 */
function holdGate(h: HomesteadState, v: Villager, t: Task, leg: Leg, ev: Events): void {
  const id = t.target.slice(6) as EnclosureId, gateId = `gate:${id}`;
  const g = h.gates?.find((x) => x.id === gateId);
  if (!g) { v.task = null; return; }
  if (t.progress === 0) {
    if (g.state === 'locked') { ev.log.push(`${v.name} cannot let the strays in: the ${gateLabel(gateId)} is locked`); v.task = null; return; }
    if (g.state === 'closed') { g.state = 'open'; leg.amount = 1; }
  }
  t.progress += 2;
  const waiting = straysOf(h, id).filter((a) => a.go === 'home');
  if (waiting.length && t.progress < leg.ticks * 2) return;
  if (contact && leg.amount === 1 && g.state === 'open' && gateHasPlayer(contact.grid, gateId)) {
    // STAB-002 S2: never shut the gate onto the player: hold it a while longer, then leave it open and say so.
    if (t.progress < (leg.ticks + NAV_GIVE_UP) * 2) return;
    ev.log.push(`${v.name} left the ${gateLabel(gateId)} open: you are standing in it`);
    leg.amount = 0;
  }
  if (leg.amount === 1 && g.state === 'open') g.state = 'closed';
  if (!waiting.length) ev.log.push(`${v.name} brought the strays back into the ${id} and shut the gate`);
  t.progress = 0;
  t.leg++;
  if (t.leg >= t.legs.length) v.task = null;
}

const gateStateOf = (h: HomesteadState, id: string): GateState => h.gates?.find((g) => g.id === id)?.state ?? 'closed';
const insideRect = (r: Rect, x: number, z: number) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
/** Animals of a pen standing outside its fence (v3), in id order. */
export function straysOf(h: HomesteadState, id: EnclosureId): Animal[] {
  const r = facility(h, id)!.rect;
  return [...h.animals].filter((a) => SPECIES_RULES[a.species].enclosure === id && !insideRect(r, a.x, a.z)).sort((a, b) => a.id.localeCompare(b.id));
}
/** Is a villager holding this gate open (walking through it, or letting strays in)? Animals do not slip out then. */
function gateHeld(h: HomesteadState, id: string): boolean {
  return h.villagers.some((v) => v.nav?.opened === id || v.nav?.opening === id
    || (v.task?.legs[v.task.leg]?.effect === 'hold_gate' && `gate:${v.task.target.slice(6)}` === id));
}

/** The cells a villager holds this tick: where it stands and, mid-step, the cell it is stepping into (v3). */
function footprint(g: NavGrid, v: Villager): number[] {
  const cx = Math.floor(v.x / DM), cz = Math.floor(v.z / DM);
  if (!g.inside(cx, cz)) return [];
  const out = [g.index(cx, cz)];
  const walking = v.task?.legs[v.task.leg]?.op === 'walk';
  if (walking && v.nav?.path.length && (v.x !== cx * DM + 5 || v.z !== cz * DM + 5)) {
    // Between two centres it is heading for the first route cell; when that is its own cell it is only re-centring.
    const cells = expandPath(v.nav.path, cx, cz);
    if (cells.length && (cells[0] !== cx || cells[1] !== cz) && g.inside(cells[0], cells[1])) out.push(g.index(cells[0], cells[1]));
  }
  return out;
}

function stepVillager(world: World, h: HomesteadState, v: Villager, tick: number, ev: Events, budget: { left: number }, occupied?: Map<number, string>, again = false): void {
  // STAB-002 S3 (v7): hunger rises a third as fast while asleep.
  const asleep = isHerdHomestead(h) && v.task?.kind === 'rest' && v.task.legs[v.task.leg]?.op === 'work';
  if (tick % (asleep ? SLEEP_HUNGER_EVERY : 2) === 0 && !again) v.hunger = Math.min(100, v.hunger + 1);
  const starving = v.hunger >= 100;
  if (v.avoid) { v.avoid = v.avoid.filter((a) => a.until > tick); if (!v.avoid.length) delete v.avoid; }
  // STAB-002 S3 (v7): idling, or routine work not yet begun, gives way to more important work, only with empty hands.
  if (v.task && isHerdHomestead(h) && !again) preempt(world, h, v, tick, budget);
  if (!v.task) v.task = plan(world, h, v, tick, budget);
  const t = v.task;
  // STAB-002 S2: a villager with nothing to do, or only strolling, steps out of the founder's way.
  if (contact && occupied && (!t || t.kind === 'idle') && villagerYield(world, h, v, occupied)) return;
  if (!t) return;
  // v4: a woodcutter still on the way to a tree at nightfall turns for home (nothing in hand is lost; the tree is free again).
  if (isWorkHomestead(h) && (t.kind === 'chop' || (t.kind === 'plant' && isWoodlandHomestead(h) && t.legs.length > 2)) && t.leg === 0 && isNight(tick)) { v.task = plan(world, h, v, tick, budget); if (!v.task) return; return stepVillager(world, h, v, tick, ev, budget, occupied, true); }
  const leg = t.legs[t.leg];
  if (leg.op !== 'walk' && v.nav?.wait) delete v.nav.wait;
  if (leg.op === 'walk' && isNavHomestead(h)) {
    navWalk(world, h, v, t, tick, starving ? villagerSpeed(h) / 2 : villagerSpeed(h), ev, budget, occupied);
    if (v.task && t.leg >= t.legs.length) v.task = null;
    return;
  }
  if (leg.effect === 'hold_gate') { holdGate(h, v, t, leg, ev); return; }
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
      if (leg.effect === 'chop') {
        // v4: one cut per stint, until the load is full or the tree is down.
        const r = chop(world, h, v, t, ev, leg);
        t.progress = 0;
        // Nightfall ends the felling: the load in hand goes to the store, then home to bed.
        if (r === 'again' && !isNight(tick)) return;
        if (r === 'fail') { v.task = null; return; }
        t.leg++;
        if (t.leg >= t.legs.length) v.task = null;
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

/**
 * v7 pre-emption: an idle villager takes any job that comes up; one still on
 * the first walk of a routine task takes safety or overdue work. Never with
 * something in hand, never while opening or holding a gate.
 */
function preempt(world: World, h: HomesteadState, v: Villager, tick: number, budget: { left: number }): void {
  const t = v.task!;
  if (v.carry || v.nav?.opening !== undefined || v.nav?.opened !== undefined) return;
  let below = 0;
  if (t.kind === 'idle') below = PRIORITY.idle;
  else if (ROUTINE_KINDS.has(t.kind) && t.leg === 0 && t.legs[0].op === 'walk' && t.progress === 0) below = taskClass(world, h, t, tick, v.role);
  if (below <= PRIORITY.order) return;
  const next = planV7(world, h, v, tick, budget, below);
  if (next) v.task = next;
}

// ---------- animals ----------

function stepAnimals(world: World, h: HomesteadState, tick: number): void {
  const living: AnimalNav | null = isLivingHomestead(h) ? { grid: homesteadNav(world, h), budget: { left: ANIMAL_TICK_BUDGET }, tick } : null;
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
    if (living && isHerdHomestead(h)) herdAnimal(world, h, a, fac, encl, living, tick);
    else if (living) liveAnimal(world, h, a, fac, encl, living);
    else {
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
        const at = living && isHerdHomestead(h) ? birthSpot(world, h, living.grid, a) : { x: a.x, z: a.z };
        births.push({ id: `animal:${String(h.nextId++).padStart(3, '0')}`, species: a.species, sex: rnd(h) < 0.5 ? 'f' : 'm',
          born: tick, x: at.x, z: at.z, tx: at.x, tz: at.z, hunger: 20, starving: 0, product: 0, pregnantUntil: 0,
          ...(isHerdHomestead(h) ? { act: 'wander' as AnimalAct, until: tick } : {}) });
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

// ---------- animals under settlement rules v3 ----------

/** Chance, when an animal picks a new spot and its gate stands open (nobody holding it), that it heads out. */
export const ESCAPE_CHANCE = 0.35;
/** Chance, when a stray picks a new spot and its gate stands open, that it goes back in. */
export const RETURN_CHANCE = 0.25;
/** A stray grazes within this many metres (Chebyshev) of the cell outside its gate. */
export const STRAY_RANGE = 12;
/** Driven home (dm per tick): a trot. */
export const DRIVEN_SPEED = 12;
/** Search expansions per animal move and per tick for all animals (deterministic counts, not time). */
export const ANIMAL_SEARCH = 1500;
export const ANIMAL_TICK_BUDGET = 20_000;
interface AnimalNav { grid: NavGrid; budget: { left: number }; tick: number }

/**
 * One v3 animal tick: needs as before, but every move follows the walking
 * grid (fences, closed gates, buildings, shelters, troughs, trees, deep
 * water); a gate is a passage only while it is open. Inside, an animal with
 * its gate open may wander out; outside it grazes the wild grass near the
 * gate, may wander back in while the gate is open, or is driven home by the
 * herder. Deterministic: integer positions, `rnd` only, bounded searches.
 */
function liveAnimal(world: World, h: HomesteadState, a: Animal, fac: Facility, encl: Enclosure, nav: AnimalNav): void {
  const rule = SPECIES_RULES[a.species];
  const inside = insideRect(fac.rect, a.x, a.z);
  const gate = penGate(h, rule.enclosure);
  const st = gateStateOf(h, gate.id);
  if (a.go === 'out' && (!inside || st !== 'open')) { delete a.go; a.tx = a.x; a.tz = a.z; }
  if (a.go === 'home' && inside) { delete a.go; a.tx = a.x; a.tz = a.z; }
  const centre = (c: readonly [number, number]) => ({ x: c[0] * DM + 5, z: c[1] * DM + 5 });
  let goal: NavGoal | null = null, speed = ANIMAL_SPEED;
  if (a.hunger >= HUNGER_MEAL && !inside) {
    // A stray grazes the wild grass where it stands (no pen pasture or trough is used).
    a.hunger = Math.max(0, a.hunger - HUNGER_MEAL);
    return;
  }
  if (a.go === 'home') {
    speed = DRIVEN_SPEED;
    // Through the gate while it is open; otherwise wait just outside it.
    goal = st === 'open' ? { x: a.tx, z: a.tz, reach: 8 } : { ...centre(gate.outside), reach: 8 };
  } else if (a.hunger >= HUNGER_MEAL) {
    const grazing = rule.graze > 0 && encl.grass >= rule.graze;
    if (encl.water > 0 && (grazing || encl.feed >= rule.feed)) {
      const trough = fac.trough!;
      const target = grazing ? { x: a.x, z: a.z } : trough;
      if (len2(a.x - target.x, a.z - target.z) <= 12) {
        if (grazing) encl.grass -= rule.graze; else encl.feed -= rule.feed;
        encl.water -= 1;
        a.hunger = Math.max(0, a.hunger - HUNGER_MEAL);
        a.tx = a.x; a.tz = a.z;
        return;
      }
      a.tx = trough.x; a.tz = trough.z;
      goal = { x: trough.x, z: trough.z, reach: 12 };
    }
  } else if (!a.go && len2(a.tx - a.x, a.tz - a.z) < ANIMAL_SPEED && rnd(h) < 0.06) {
    let p: { x: number; z: number };
    if (inside) {
      if (st === 'open' && !gateHeld(h, gate.id) && rnd(h) < ESCAPE_CHANCE) {
        a.go = 'out';
        p = strayCell(h, nav.grid, gate.outside[0] + Math.floor(rnd(h) * 7) - 3, gate.outside[1] - Math.floor(rnd(h) * 4), gate.outside) ?? centre(gate.outside);
      } else p = randomPointIn(h, fac.rect);
    } else if (st === 'open' && rnd(h) < RETURN_CHANCE) {
      a.go = 'home';
      p = randomPointIn(h, fac.rect);
    } else {
      const cx = Math.floor(a.x / DM), cz = Math.floor(a.z / DM);
      p = strayCell(h, nav.grid, cx + Math.floor(rnd(h) * 7) - 3, cz + Math.floor(rnd(h) * 7) - 3, gate.outside) ?? { x: a.x, z: a.z };
    }
    a.tx = p.x; a.tz = p.z;
  }
  if (!goal && (a.tx !== a.x || a.tz !== a.z)) goal = { x: a.tx, z: a.tz, reach: 8 };
  if (goal && !walkAnimal(world, nav, a, goal, speed) && a.go !== 'home') {
    // No way there (a shelter in the way, a gate just shut): stand, and choose again later.
    if (a.go === 'out') delete a.go;
    a.tx = a.x; a.tz = a.z;
  }
}

// ---------- animals under settlement rules v7 ----------

/** v7 behaviour timing (ticks of 2 s). Grazing bouts and drinks hold the head down; rests lie down. */
export const HERD_RULES = {
  /** Chance per idle tick by day: walk to a new spot, start a casual grazing bout, lie down for a short rest. */
  dayWander: 0.25, dayGraze: 0.08, dayRest: 0.03,
  /** By night most idle ticks end in a long rest; a few in a short walk. */
  nightRest: 0.45, nightWander: 0.1,
  graze: [6, 14] as const, drink: [2, 4] as const, dayRestTicks: [10, 25] as const, nightRestTicks: [60, 110] as const,
  /**
   * An animal goes for a meal from this hunger on (a meal still takes 60):
   * walking to the grass and grazing take time, so it sets off a little
   * before v3's instant meal at 60 and eats about as often.
   */
  hungry: HUNGER_MEAL - 10,
  /** A resting animal gets up to eat once its hunger reaches this. */
  wake: HUNGER_MEAL + 10,
};
/** v7: one arrival radius for spot targets, the search's goal reach (cell centres, so only the target cell counts). */
export const ANIMAL_REACH = ANIMAL_SPEED;
/** v7: the trough's reach (a trough cell is blocked: the animal drinks from a neighbouring cell). */
export const TROUGH_REACH = 12;
const span = (h: HomesteadState, [lo, hi]: readonly [number, number]) => lo + Math.floor(rnd(h) * (hi - lo + 1));

/** v7: where a newborn starts: its mother's spot if that cell is a free cell of the main area, else the nearest such cell (fixed ring order). */
function birthSpot(world: World, h: HomesteadState, g: NavGrid, mother: Animal): { x: number; z: number } {
  const id = SPECIES_RULES[mother.species].enclosure;
  const fac = facility(h, id)!;
  const cx = Math.floor(mother.x / DM), cz = Math.floor(mother.z / DM);
  if (!g.inside(cx, cz)) return { x: mother.x, z: mother.z };
  const here = g.index(cx, cz);
  if (insideRect(fac.rect, mother.x, mother.z)) {
    const pen = penCells(world, h, g, id);
    if (pen.main.has(here) || !pen.list.length) return { x: mother.x, z: mother.z };
    const i = nearestCell(g, mother.x, mother.z, (c) => pen.main.has(c));
    return i === null ? { x: mother.x, z: mother.z } : cellCentre(g, i);
  }
  if (g.block[here] === BLOCK.none) return { x: mother.x, z: mother.z };
  const i = nearestCell(g, mother.x, mother.z, (c) => g.block[c] === BLOCK.none);
  return i === null ? { x: mother.x, z: mother.z } : cellCentre(g, i);
}

/**
 * v7: an animal whose cell is blocked, or cut off from its enclosure's main
 * area, walks out. The route is a breadth-first search from its cell (fixed
 * neighbour order) to the nearest cell it should be on, by the animals' own
 * moves (fences and closed gates always hold). If no such route exists, the
 * minimal correction is applied, in this order, until one does: (1) cells of
 * the footprint the animal stands in and of its enclosure's shelters and
 * trough count as walkable (an animal can walk out from under a shelter roof);
 * (2) any blocked cell inside its own enclosure counts as walkable. The animal
 * then steps along that route at walking speed, one neighbour cell centre at
 * a time. Returns the route's cells, or null when there is nothing to escape
 * or no route at all.
 */
export function escapeRoute(world: World, h: HomesteadState, g: NavGrid, a: Animal): number[] | null {
  const id = SPECIES_RULES[a.species].enclosure;
  const fac = facility(h, id)!;
  const cx = Math.floor(a.x / DM), cz = Math.floor(a.z / DM);
  if (!g.inside(cx, cz)) return null;
  const start = g.index(cx, cz);
  const inside = insideRect(fac.rect, a.x, a.z);
  const pen = inside ? penCells(world, h, g, id) : null;
  if (pen ? pen.main.has(start) || !pen.list.length : g.block[start] === BLOCK.none) return null;
  const target = (i: number) => pen ? pen.main.has(i) : g.block[i] === BLOCK.none;
  const within = (i: number) => pen ? pen.all.has(i) : Math.max(Math.abs(g.cellX(i) - cx), Math.abs(g.cellZ(i) - cz)) <= 8;
  const own = g.blockId.get(start);
  const furniture = (i: number) => g.block[i] !== BLOCK.none && (g.blockId.get(i) === own
    || !!pen && pen.all.has(i) && /^(?:shelter|trough):/.test(g.blockId.get(i) ?? ''));
  const tiers: Array<SearchOptions> = [ANIMAL_MOVE, { ...ANIMAL_MOVE, pass: furniture }];
  if (pen) tiers.push({ ...ANIMAL_MOVE, pass: (i) => pen.all.has(i) && g.block[i] !== BLOCK.deep_water && g.block[i] !== BLOCK.outside });
  for (const o of tiers) {
    const parent = new Map<number, number>([[start, -1]]);
    const queue = [start];
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k], x = g.cellX(i), z = g.cellZ(i);
      if (i !== start && target(i)) {
        const path: number[] = [];
        for (let c = i; c !== start; c = parent.get(c)!) path.push(c);
        return path.reverse();
      }
      for (const [dx, dz] of DIRS8) {
        if (!g.inside(x + dx, z + dz)) continue;
        const j = g.index(x + dx, z + dz);
        if (parent.has(j) || !within(j) || !canMove(g, x, z, x + dx, z + dz, o)) continue;
        parent.set(j, i); queue.push(j);
      }
    }
  }
  return null;
}

/** v7: walk up to `speed` dm along cells (centres in turn). */
function stepAlong(g: NavGrid, a: Animal, cells: readonly number[], speed: number, sp: Space | null): void {
  advance(a, cells.map((i) => { const c = cellCentre(g, i); return [c.x, c.z] as [number, number]; }), speed, sp ? roomOf(a, sp).clip : 0);
}

/**
 * v7: move up to `speed` dm through the points in turn. With the player's
 * presence (STAB-002 S2) a move that would bring the animal closer than
 * `clip` dm to the player stops short (0: no presence). Returns whether the animal moved.
 */
function advance(a: Animal, pts: ReadonlyArray<readonly [number, number]>, speed: number, clip: number): boolean {
  const x0 = a.x, z0 = a.z;
  let budget = speed;
  for (const [tx, tz] of pts) {
    const d = len2(tx - a.x, tz - a.z);
    if (clip > 0 && contact && d > 0) {
      const reach = Math.min(d, budget);
      const t = clipApproach(a.x, a.z, a.x + ((tx - a.x) / d) * reach, a.z + ((tz - a.z) / d) * reach, contact.p.x, contact.p.z, clip);
      if (t < 1) {
        const k = Math.floor(t * reach);
        if (k > 0) { a.x += Math.trunc(((tx - a.x) / d) * k); a.z += Math.trunc(((tz - a.z) / d) * k); }
        break;
      }
    }
    if (d <= budget) { a.x = tx; a.z = tz; budget -= d; continue; }
    a.x += Math.round(((tx - a.x) / d) * budget); a.z += Math.round(((tz - a.z) / d) * budget);
    break;
  }
  return a.x !== x0 || a.z !== z0;
}

/**
 * STAB-002 S2: an animal's distances from the player (dm), by species and
 * age: `keep` covers its whole body at any heading, `side` only its width
 * (an animal walking past alongside), `ring` is where it steps aside and
 * which its routes keep out of, `clear` how far its new targets must be.
 */
interface Space { keep: number; side: number; pass: number; ring: number; clear: number }
function spaceOf(a: Animal, tick: number): Space | null {
  if (!contact) return null;
  const young = tick - a.born < SPECIES_RULES[a.species].adultAge;
  return { keep: keepDm(a.species, young), side: sideDm(a.species, young), pass: passDm(a.species, young), ring: ringDm(a.species, young), clear: targetClearDm(a.species, young) };
}
/**
 * STAB-002 S2: how close its route (`avoid`, dm) and its steps (`clip`, dm)
 * may come to the player. Normally routes keep out of the ring and steps
 * stop at `keep`. An animal already inside its ring had no step taking it
 * farther (cornered); while the player stands still it may then walk past
 * them alongside, at `pass` (`passDm`), so nobody is pinned in a corner.
 */
function roomOf(a: Animal, sp: Space): { avoid: number; clip: number } {
  // Only past a player standing still (their presence is where they are), with 2 dm to spare; past a moving
  // player the presence is up to a tick old, so the animal keeps its full distance and waits.
  const still = contact!.p.mx === 0 && contact!.p.mz === 0;
  return presenceDist(a.x, a.z) < sp.ring && still ? { avoid: sp.pass, clip: sp.pass } : { avoid: sp.ring, clip: sp.keep };
}
/** STAB-002 S2: cells an animal does not route through: the player's, and those whose centre is within `room` dm of the player. */
function avoidPlayer(g: NavGrid, room: number): (i: number) => boolean {
  const c = contact!;
  return (i) => c.cells.has(i) || len2(g.cellX(i) * DM + 5 - c.p.x, g.cellZ(i) * DM + 5 - c.p.z) < room;
}
/** STAB-002 S2: retry a target choice (at most 3 more draws) while it lies within `clear` of the player; null if it still does. */
function awayFromPlayer<T extends { x: number; z: number } | null>(sp: Space | null, pick: () => T): T | null {
  let p = pick();
  if (!sp) return p;
  for (let k = 0; k < 3 && p && presenceDist(p.x, p.z) < sp.clear; k++) p = pick();
  return p && presenceDist(p.x, p.z) < sp.clear ? null : p;
}
/** Step-aside preference (dm) for a step that also brings the animal nearer its own target. */
const ONWARD_BONUS = 15;
/** Step-aside speed (dm per tick): a startled step, never more than one cell. */
export const YIELD_SPEED = 10;
/**
 * STAB-002 S2 (rules v7 with presence): an animal within its ring of the
 * player steps to the neighbour cell that takes it farthest from the player
 * and off the player's line of travel. The cell must be free, reachable by
 * the animal's own moves, not through a gate, on the same side of its
 * enclosure fence and, inside, in the enclosure's main area; the step must
 * end farther from the player than it started (so standing next to a still
 * player gives one retreat, never a back-and-forth). 'held' when no such cell
 * exists (cornered: it stands, and the player's own contact keeps them apart).
 */
function yieldStep(world: World, h: HomesteadState, g: NavGrid, a: Animal, fac: Facility, sp: Space): 'none' | 'moved' | 'held' {
  const c = contact!;
  const d0 = presenceDist(a.x, a.z);
  if (d0 >= sp.ring) return 'none';
  const cx = Math.floor(a.x / DM), cz = Math.floor(a.z / DM);
  if (!g.inside(cx, cz)) return 'none';
  const inside = insideRect(fac.rect, a.x, a.z);
  const pen = inside ? penCells(world, h, g, SPECIES_RULES[a.species].enclosure) : null;
  const ml = len2(c.p.mx, c.p.mz);
  const going = a.tx !== a.x || a.tz !== a.z;
  let best: { x: number; z: number } | null = null, bestScore = -Infinity;
  for (const [dx, dz] of DIRS8) {
    const nx = cx + dx, nz = cz + dz;
    if (!g.inside(nx, nz)) continue;
    const j = g.index(nx, nz);
    if (g.block[j] !== BLOCK.none || c.cells.has(j)) continue;
    if (!canMove(g, cx, cz, nx, nz, ANIMAL_MOVE) || g.gateBetween(cx, cz, nx, nz)) continue;
    const t = cellCentre(g, j);
    if (insideRect(fac.rect, t.x, t.z) !== inside) continue;
    if (pen && pen.list.length && !pen.main.has(j)) continue;
    const dd = len2(t.x - a.x, t.z - a.z);
    const ex = dd <= YIELD_SPEED ? t.x : a.x + Math.round(((t.x - a.x) / dd) * YIELD_SPEED);
    const ez = dd <= YIELD_SPEED ? t.z : a.z + Math.round(((t.z - a.z) / dd) * YIELD_SPEED);
    const d1 = presenceDist(ex, ez);
    if (d1 <= d0) continue;
    // An animal on its way somewhere never steps back from its target: that would undo the walk it takes next tick.
    if (going && len2(ex - a.tx, ez - a.tz) > len2(a.x - a.tx, a.z - a.tz)) continue;
    // Off the player's line of travel: the distance of the cell from that line (0 for a player standing still).
    const off = ml ? Math.abs((t.x - c.p.x) * c.p.mz - (t.z - c.p.z) * c.p.mx) / ml : 0;
    // Among the steps away, one that also gets it nearer its own target goes on past the player.
    const onward = going && len2(ex - a.tx, ez - a.tz) < len2(a.x - a.tx, a.z - a.tz) ? ONWARD_BONUS : 0;
    const score = d1 + off + onward;
    if (score > bestScore) { bestScore = score; best = { x: ex, z: ez }; }
  }
  if (!best) return 'held';
  a.x = best.x; a.z = best.z;
  return 'moved';
}

/**
 * v7: walk toward a goal. 'arrived' when the route is empty (the cell the
 * animal stands in satisfies the goal's reach; it then steps onto the goal
 * point if that lies in its cell): the one arrival rule. 'walking' after a
 * step, 'wait' when this tick's search budget is spent, 'fail' without a route.
 */
function walkTo(world: World, nav: AnimalNav, a: Animal, goal: NavGoal, speed: number): 'arrived' | 'walking' | 'wait' | 'fail' {
  const g = nav.grid;
  const cx = Math.floor(a.x / DM), cz = Math.floor(a.z / DM);
  if (!g.inside(cx, cz)) return 'fail';
  // STAB-002 S2: a goal at the player is no goal now; routes go round the player's ring, never through it.
  const sp = spaceOf(a, nav.tick);
  const room = sp ? roomOf(a, sp) : null;
  if (room && presenceDist(goal.x, goal.z) < room.avoid) return 'fail';
  // A spot goal whose only cell is avoided (the player's cell) cannot be reached either: no search for it.
  if (room && goal.reach <= ANIMAL_REACH && g.inside(Math.floor(goal.x / DM), Math.floor(goal.z / DM))
    && avoidPlayer(g, room.avoid)(g.index(Math.floor(goal.x / DM), Math.floor(goal.z / DM)))) return 'fail';
  if (nav.budget.left <= 0) return 'wait';
  const res = findPath(world, g, a, goal, { openGatesOnly: true, maxExpansions: Math.min(ANIMAL_SEARCH, nav.budget.left), ...(room ? { avoid: avoidPlayer(g, room.avoid) } : {}) });
  nav.budget.left -= res.expanded;
  // With the player's ring in the way a search that runs out is a goal cut off by the player, not a busy tick: choose again.
  if (!res.ok) return res.code === 'budget' && !room ? 'wait' : 'fail';
  if (!res.cells.length) {
    if (Math.floor(goal.x / DM) === cx && Math.floor(goal.z / DM) === cz) advance(a, [[goal.x, goal.z]], speed, room?.clip ?? 0);
    return 'arrived';
  }
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < res.cells.length; k += 2) pts.push([res.cells[k] * DM + 5, res.cells[k + 1] * DM + 5]);
  const [lx, lz] = [res.cells[res.cells.length - 2], res.cells[res.cells.length - 1]];
  if (Math.floor(goal.x / DM) === lx && Math.floor(goal.z / DM) === lz) pts[pts.length - 1] = [goal.x, goal.z];
  // Stopped short of the player without a step: no way past now (the animal chooses again).
  if (!advance(a, pts, speed, room?.clip ?? 0) && room) return 'fail';
  return 'walking';
}

/**
 * One v7 animal tick. Order: (1) an animal standing on a blocked or cut-off
 * cell walks out (`escapeRoute`); (2) a gate run or a drive home as under v3;
 * (3) the current state carries on: rest until it gets up, walk to and then
 * graze or drink for the bout, or walk to a wander spot; (4) an idle animal
 * chooses: a meal when hungry (graze the pasture, then drink at the trough;
 * or eat and drink at the trough when the pasture is bare), else by day a
 * walk, a casual grazing bout or a short rest, by night mostly a long rest.
 * Needs and supplies are those of v3: a meal is 60 hunger, `graze` grass or
 * `feed` feed, and one water. Deterministic: integers and `rnd` only.
 */
function herdAnimal(world: World, h: HomesteadState, a: Animal, fac: Facility, encl: Enclosure, nav: AnimalNav, tick: number): void {
  const rule = SPECIES_RULES[a.species];
  const g = nav.grid;
  const inside = insideRect(fac.rect, a.x, a.z);
  const gate = penGate(h, rule.enclosure);
  const st = gateStateOf(h, gate.id);
  const idle = () => { a.act = 'wander'; a.until = tick; a.tx = a.x; a.tz = a.z; };
  if (!a.act) idle();
  // (1) Walk out of a blocked or cut-off cell.
  const sp = spaceOf(a, tick);
  const out = escapeRoute(world, h, g, a);
  if (out && out.length) {
    stepAlong(g, a, out, a.go === 'home' ? DRIVEN_SPEED : ANIMAL_SPEED, sp);
    if (a.act !== 'wander') { a.act = 'wander'; a.until = tick; }
    if (!a.go) { a.tx = a.x; a.tz = a.z; }
    return;
  }
  // (1b) STAB-002 S2: the player is close: step aside. One on its way somewhere keeps its target and walks on
  // next tick; one standing, grazing or resting gets up. Cornered ('held'), it carries on: its route may then pass
  // the player alongside, and its steps stop short of the player.
  if (sp) {
    const going = a.tx !== a.x || a.tz !== a.z;
    if (yieldStep(world, h, g, a, fac, sp) === 'moved') {
      if (!going) { a.act = 'wander'; a.until = tick; a.tx = a.x; a.tz = a.z; }
      return;
    }
  }
  // (2) Gate runs and drives home, as under v3.
  if (a.go === 'out' && (!inside || st !== 'open')) { delete a.go; idle(); }
  if (a.go === 'home' && inside) { delete a.go; idle(); }
  const centre = (c: readonly [number, number]) => ({ x: c[0] * DM + 5, z: c[1] * DM + 5 });
  if (a.go === 'home') {
    a.act = 'wander';
    const goal = st === 'open' ? { x: a.tx, z: a.tz, reach: ANIMAL_REACH } : { ...centre(gate.outside), reach: ANIMAL_REACH };
    // STAB-002 S2: a home spot at the player is swapped for another one away from them (it waits outside meanwhile).
    if (walkTo(world, nav, a, goal, DRIVEN_SPEED) === 'fail' && sp && st === 'open' && presenceDist(a.tx, a.tz) < sp.clear) {
      const p = awayFromPlayer(sp, () => penPoint(world, h, g, rule.enclosure));
      if (p) { a.tx = p.x; a.tz = p.z; }
    }
    return;
  }
  if (a.go === 'out') {
    if (walkTo(world, nav, a, { x: a.tx, z: a.tz, reach: ANIMAL_REACH }, ANIMAL_SPEED) === 'fail' || (a.x === a.tx && a.z === a.tz)) { if (inside) delete a.go; idle(); }
    return;
  }
  const trough = fac.trough!;
  const hungry = a.hunger >= HERD_RULES.hungry;
  const pasture = inside && rule.graze > 0 && encl.grass >= rule.graze;
  // (2b) Rules v8: a young animal keeps to its mother (`follow`); otherwise it lives as an adult does.
  if (isPaceHomestead(h) && follow(world, h, a, fac, nav, tick, inside, hungry, sp)) return;
  // (3) Carry on with the current state.
  if (a.act === 'rest') {
    // Up at the rest's end, or earlier when hunger wakes it.
    if (tick < a.until! && a.hunger < HERD_RULES.wake) return;
    idle();
  } else if (a.act === 'graze' || a.act === 'drink') {
    const drink = a.act === 'drink';
    if (a.until! > 0) {
      if (tick < a.until!) return;
      // The bout is over: the meal it was for, if any.
      if (drink) {
        if (encl.water > 0) {
          encl.water -= 1;
          if (hungry && encl.feed >= rule.feed) { encl.feed -= rule.feed; a.hunger = Math.max(0, a.hunger - HUNGER_MEAL); }
        }
        idle();
      } else if (hungry && (!inside || pasture)) {
        if (inside) encl.grass -= rule.graze;
        a.hunger = Math.max(0, a.hunger - HUNGER_MEAL);
        if (inside && encl.water > 0) { a.act = 'drink'; a.until = 0; a.tx = trough.x; a.tz = trough.z; }
        else idle();
      } else idle();
      if ((a.act as AnimalAct) === 'wander') return;
    }
    const goal = a.act === 'drink' ? { x: trough.x, z: trough.z, reach: TROUGH_REACH } : { x: a.tx, z: a.tz, reach: ANIMAL_REACH };
    const r = walkTo(world, nav, a, goal, ANIMAL_SPEED);
    if (r === 'fail') { idle(); return; }
    if (r === 'arrived') a.until = tick + span(h, a.act === 'drink' ? HERD_RULES.drink : HERD_RULES.graze);
    return;
  } else if (a.tx !== a.x || a.tz !== a.z) {
    const r = walkTo(world, nav, a, { x: a.tx, z: a.tz, reach: ANIMAL_REACH }, ANIMAL_SPEED);
    if (r === 'arrived' || r === 'fail') idle();
    return;
  }
  // (4) Idle: choose what to do next.
  if (hungry && (!inside || encl.water > 0 && (pasture || encl.feed >= rule.feed))) {
    if (!inside) { a.act = 'graze'; a.until = tick + span(h, HERD_RULES.graze); return; } // a stray grazes the wild grass where it stands
    if (pasture) {
      const p = awayFromPlayer(sp, () => penPoint(world, h, g, rule.enclosure, true));
      if (!p) return; // every grass spot drawn was at the player: stand this tick
      a.act = 'graze'; a.until = 0; a.tx = p.x; a.tz = p.z;
    } else { a.act = 'drink'; a.until = 0; a.tx = trough.x; a.tz = trough.z; }
    return;
  }
  const night = isNight(tick);
  const roll = rnd(h);
  const R = HERD_RULES;
  if (night ? roll < R.nightRest : roll >= R.dayWander + R.dayGraze && roll < R.dayWander + R.dayGraze + R.dayRest) {
    // A night rest ends by dawn at the latest.
    const dawn = tick - (tick % DAY_TICKS) + NIGHT_END;
    a.act = 'rest'; a.until = night ? Math.min(dawn, tick + span(h, R.nightRestTicks)) : tick + span(h, R.dayRestTicks);
    return;
  }
  if (!night && roll >= R.dayWander && roll < R.dayWander + R.dayGraze) {
    // A casual grazing bout (no meal unless hungry when it ends): at a grass cell inside, where it stands outside.
    if (inside) {
      const p = awayFromPlayer(sp, () => penPoint(world, h, g, rule.enclosure, true));
      if (!p) return;
      a.act = 'graze'; a.until = 0; a.tx = p.x; a.tz = p.z;
    } else { a.act = 'graze'; a.until = tick + span(h, R.graze); }
    return;
  }
  if (night ? roll >= R.nightRest + R.nightWander : roll >= R.dayWander) return; // stands a moment
  // A walk: inside to a free cell of the main area (or out through an open gate), outside near its gate (or home).
  let p: { x: number; z: number } | null;
  if (inside) {
    if (st === 'open' && !gateHeld(h, gate.id) && rnd(h) < ESCAPE_CHANCE) {
      a.go = 'out';
      p = awayFromPlayer(sp, () => strayCell(h, g, gate.outside[0] + Math.floor(rnd(h) * 7) - 3, gate.outside[1] - Math.floor(rnd(h) * 4), gate.outside) ?? centre(gate.outside));
    } else p = awayFromPlayer(sp, () => penPoint(world, h, g, rule.enclosure));
  } else if (st === 'open' && rnd(h) < RETURN_CHANCE) {
    a.go = 'home';
    p = awayFromPlayer(sp, () => penPoint(world, h, g, rule.enclosure));
  } else {
    const cx = Math.floor(a.x / DM), cz = Math.floor(a.z / DM);
    p = awayFromPlayer(sp, () => strayCell(h, g, cx + Math.floor(rnd(h) * 7) - 3, cz + Math.floor(rnd(h) * 7) - 3, gate.outside)) ?? { x: a.x, z: a.z };
  }
  // STAB-002 S2: no walk target near the player (it stands this tick instead).
  if (!p) { delete a.go; return; }
  a.act = 'wander'; a.until = tick; a.tx = p.x; a.tz = p.z;
  // Start walking this tick.
  const r = walkTo(world, nav, a, { x: a.tx, z: a.tz, reach: ANIMAL_REACH }, a.go === 'home' ? DRIVEN_SPEED : ANIMAL_SPEED);
  if (r === 'fail' || (r === 'arrived' && !a.go)) { if (a.go === 'out') delete a.go; a.tx = a.x; a.tz = a.z; }
}

/** Rules v8: a young animal walks to its mother once she is farther than this (dm). */
export const FOLLOW_DM = 15;
/**
 * Rules v8 (STAB-002 S1 strict wording): the mother of a young animal (one not
 * yet of `adultAge`): the nearest adult female of its species inside the same
 * enclosure (ties by id). No state is stored: it is derived each tick.
 */
export function motherOf(h: HomesteadState, a: Animal, tick: number): Animal | null {
  const rule = SPECIES_RULES[a.species];
  if (tick - a.born >= rule.adultAge) return null;
  const r = facility(h, rule.enclosure)!.rect;
  let best: Animal | null = null, bd = Infinity;
  for (const m of h.animals) {
    if (m === a || m.species !== a.species || m.sex !== 'f' || tick - m.born < rule.adultAge || m.go || !insideRect(r, m.x, m.z)) continue;
    const d = len2(m.x - a.x, m.z - a.z);
    if (d < bd || d === bd && best && m.id < best.id) { best = m; bd = d; }
  }
  return best;
}
/**
 * Rules v8: a young animal inside its enclosure that is not eating or hungry
 * follows its mother: farther than FOLLOW_DM it gets up and walks to her cell
 * (round the player's ring like any walk); beside her it lies down when she
 * rests and gets up when she does. A newborn therefore moves whenever its
 * mother moves, also on its first night. True when the tick is spent.
 */
function follow(world: World, h: HomesteadState, a: Animal, fac: Facility, nav: AnimalNav, tick: number, inside: boolean, hungry: boolean, sp: Space | null): boolean {
  if (!inside || hungry || a.go || a.act === 'graze' || a.act === 'drink') return false;
  const m = motherOf(h, a, tick);
  if (!m) return false;
  const g = nav.grid;
  if (len2(m.x - a.x, m.z - a.z) > FOLLOW_DM) {
    const cx = Math.floor(m.x / DM), cz = Math.floor(m.z / DM);
    if (!g.inside(cx, cz) || !penCells(world, h, g, SPECIES_RULES[a.species].enclosure).main.has(g.index(cx, cz))) return false;
    const to = { x: cx * DM + 5, z: cz * DM + 5 };
    if (sp && presenceDist(to.x, to.z) < sp.clear) return false;
    a.act = 'wander'; a.until = tick; a.tx = to.x; a.tz = to.z;
    const r = walkTo(world, nav, a, { ...to, reach: ANIMAL_REACH }, ANIMAL_SPEED);
    if (r === 'fail' || r === 'arrived') { a.tx = a.x; a.tz = a.z; }
    return r !== 'fail';
  }
  if (m.act === 'rest' && a.act !== 'rest') { a.act = 'rest'; a.until = Math.max(tick, m.until ?? tick); a.tx = a.x; a.tz = a.z; return true; }
  if (m.act !== 'rest' && a.act === 'rest') { a.act = 'wander'; a.until = tick; a.tx = a.x; a.tz = a.z; }
  return false;
}

/** A free cell centre (dm) for a stray near (x, z), kept within range of its gate and outside every pen; null if none. */
function strayCell(h: HomesteadState, g: NavGrid, x: number, z: number, gateOut: [number, number]): { x: number; z: number } | null {
  const cx = Math.max(gateOut[0] - STRAY_RANGE, Math.min(gateOut[0] + STRAY_RANGE, x));
  const cz = Math.max(gateOut[1] - STRAY_RANGE, Math.min(gateOut[1] + STRAY_RANGE, z));
  if (!g.inside(cx, cz) || g.block[g.index(cx, cz)] !== 0) return null;
  const p = { x: cx * DM + 5, z: cz * DM + 5 };
  if (homesteadLayout(h).some((f) => f.kind !== 'farmhouse' && f.kind !== 'well' && insideRect(f.rect, p.x, p.z))) return null;
  return p;
}

/**
 * Move an animal up to `speed` dm along the shortest route to the goal on the
 * walking grid (gates passable only while open). Returns false when there is
 * no route within the search budget. Every segment runs between a point in
 * one cell and the centre of a neighbour the route allows, so an animal never
 * crosses a fence, a closed gate or a blocked corner.
 */
function walkAnimal(world: World, nav: AnimalNav, a: Animal, goal: NavGoal, speed: number): boolean {
  const g = nav.grid;
  const cx = Math.floor(a.x / DM), cz = Math.floor(a.z / DM);
  if (!g.inside(cx, cz)) return false;
  if (nav.budget.left <= 0) return true; // out of searches this tick: wait (not a failure)
  const res = findPath(world, g, a, goal, { openGatesOnly: true, maxExpansions: Math.min(ANIMAL_SEARCH, nav.budget.left) });
  nav.budget.left -= res.expanded;
  if (!res.ok) return false;
  // Waypoints: the centre of each route cell; the exact goal point when it lies in the last cell.
  const cells = res.cells.length ? res.cells : [cx, cz];
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < cells.length; k += 2) pts.push([cells[k] * DM + 5, cells[k + 1] * DM + 5]);
  const [lx, lz] = [cells[cells.length - 2], cells[cells.length - 1]];
  if (Math.floor(goal.x / DM) === lx && Math.floor(goal.z / DM) === lz) pts[pts.length - 1] = [goal.x, goal.z];
  let budget = speed;
  for (const [tx, tz] of pts) {
    const d = len2(tx - a.x, tz - a.z);
    if (d <= budget) { a.x = tx; a.z = tz; budget -= d; continue; }
    a.x += Math.round(((tx - a.x) / d) * budget); a.z += Math.round(((tz - a.z) / d) * budget);
    break;
  }
  return true;
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
    } else if (p.growth === 0) {
      // Seed in dry soil lies dormant until it is watered; only sprouted crops wither.
      continue;
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
export function stepHomestead(world: World, tick: number, presence?: Presence): string[] {
  const h = world.homestead;
  if (!h) return [];
  // STAB-002 S2: the player's presence counts only under rules v7 (older rules never see it, so their journals replay unchanged).
  contact = presence && isHerdHomestead(h) ? contactOf(world, h, presence) : null;
  try { return stepHomesteadTick(world, h, tick); } finally { contact = null; }
}

function stepHomesteadTick(world: World, h: HomesteadState, tick: number): string[] {
  const ev: Events = { log: [] };
  // v5: the woodland's scheduled lifecycle events, quota and a slice of natural seeding, before anyone acts.
  if (isWoodlandHomestead(h)) stepWoodland(world, h, tick, ev.log);
  // v4: approved sites take free stock that arrived since the last tick (oldest site first).
  if (isWorkHomestead(h)) reserveSites(world, h);
  spoil(world, h, tick);
  stepPlots(h, tick, ev);
  stepAnimals(world, h, tick);
  // STAB-002 S3 (v7): when each piece of upkeep and routine work became due (its age raises its priority).
  if (isHerdHomestead(h)) updateDue(world, h, tick);
  const t0 = isNavHomestead(h) ? performance.now() : 0;
  const budget = { left: NAV_TICK_BUDGET };
  const order = [...h.villagers].sort((a, b) => a.id.localeCompare(b.id));
  if (isLivingHomestead(h)) {
    // v3: cells held by villagers, in a fixed id order; each villager's own cells are released while it moves.
    const occupied = new Map<number, string>();
    let g = homesteadNav(world, h);
    // STAB-002 S2: the player's cells first, under the id 'player' (the same map, the same queue and give-up rules).
    if (contact) for (const c of contact.cells) occupied.set(c, PLAYER_ID);
    // Where each stands first (in id order), then the cells being stepped into that nobody stands on.
    for (const k of [0, 1]) for (const v of order) { const c = footprint(g, v)[k]; if (c !== undefined && !occupied.has(c)) occupied.set(c, v.id); }
    for (const v of order) {
      for (const [c, id] of [...occupied]) if (id === v.id) occupied.delete(c);
      stepVillager(world, h, v, tick, ev, budget, occupied);
      g = homesteadNav(world, h);
      for (const c of footprint(g, v)) if (!occupied.has(c)) occupied.set(c, v.id);
    }
  } else for (const v of order) stepVillager(world, h, v, tick, ev, budget);
  if (isNavHomestead(h)) {
    // Presentation-only timing (never saved): villager stepping including navigation, per tick.
    const st = navStats(world), ms = performance.now() - t0;
    st.ticks++; st.tickMs += ms; st.lastTickMs = ms; st.maxTickMs = Math.max(st.maxTickMs, ms);
  }
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
  const busy = h.villagers.some((v) => v.task && (touches(v.task, target) || touches(v.task, `water:${target}`) || touches(v.task, `feed:${target}`)));
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
      // v7: what villagers sowed already is not sown twice.
      const n = unitsOf(plot) - (plot.sown ?? 0);
      if (!spend('seed', n)) return fail('insufficient_resources', `this field needs ${n} seed (1 per 9 m²); you have ${bag.seed ?? 0}`);
      Object.assign(plot, { state: 'growing', growth: 0, moisture: 0, dry: 0 });
      delete plot.sown; delete plot.order;
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
/** v5: a tree in an empty spot of its lifecycle (a natural gap) is not in the way; stumps are grubbed out by fields and sites. */
function standing(world: World, h: HomesteadState, e: Entity): boolean {
  if (!isWoodlandHomestead(h) || !e.kind.startsWith('styl_tree_')) return true;
  return !!treeLife(world, e)?.present;
}
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
    if (e.harvested || world.entityRemovals.has(e.id) || e.kind === 'marker' || !standing(world, h, e)) continue;
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
  // v4: wood reserved for a building site is not the steward's to spend.
  const have = payFrom === 'bag' ? bag.wood ?? 0 : freeInStore(world, 'wood');
  if (have < wood) return fail('insufficient_resources', `the fence needs ${wood} wood (${payFrom === 'bag' ? 'you have' : 'the store has free'} ${have})`);
  // v6: the store's free wood includes the timber stores; the founder store is used first.
  if (payFrom === 'store' && isBuildHomestead(h)) takeStoreStock(world, h, 'wood', wood);
  else takeFrom(bag, 'wood', wood);
  const id = `field:${h.nextId++}`;
  h.plots.push({ id, x: spec.x, z: spec.z, w: spec.w, d: spec.d, crop: spec.crop, state: 'wild', growth: 0, moisture: 0, dry: 0, tilled: 0,
    // v7: a field the owner marks is an owner order until it is sown.
    ...(isHerdHomestead(h) && payFrom === 'bag' ? { order: lifeState(world).tick } : {}) });
  h.plots.sort((a, b) => a.id.localeCompare(b.id));
  // v5: the field's ground is cleared of stumps, and empty spots in it stay empty.
  if (isWoodlandHomestead(h)) clearGround(world, h, spec.x - 1, spec.z - 1, spec.x + spec.w + 1, spec.z + spec.d + 1);
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
  if (h.villagers.some((v) => v.task && touches(v.task, fieldId))) return fail('busy', 'a villager is working this field');
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

export function assignRole(world: World, villagerId: string, role: Role, actor: Actor = 'player'): LifeResult<{ villagerId: string; role: Role }> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  const v = h.villagers.find((x) => x.id === villagerId);
  if (!v) return fail('invalid_target', 'unknown villager');
  if (v.role === role) return fail('unchanged', `${v.name} is already a ${role}`);
  if (WORK_ROLES.includes(role) && !isWorkHomestead(h)) return fail('needs_rules', `${role}s need settlement rules v4`);
  v.role = role;
  // The current errand is dropped (its claim released); whatever is carried is kept and stored next.
  // v7: a villager with a load in hand finishes that delivery first (any role may carry it).
  if (v.task && v.task.kind !== 'rest' && !(isHerdHomestead(h) && v.carry)) v.task = null;
  // v7: the steward's cooldown is world state (saved and hashed), so a reload never changes what it does next.
  if (isHerdHomestead(h) && actor === 'steward') h.steward.lastAssign = lifeState(world).tick;
  world.revision++;
  return { ok: true, value: { villagerId, role } };
}

/**
 * STAB-002 S3 (rules v7): the owner puts a field, an enclosure or a building
 * site on the priority list (or takes it off). All its work then counts as an
 * owner order: ahead of upkeep and routine work, and anyone may do it.
 */
export function setPriority(world: World, target: string, on: boolean): LifeResult<{ target: string; on: boolean }> {
  const h = world.homestead;
  if (!h) return fail('no_homestead', 'found the homestead first');
  if (!isHerdHomestead(h)) return fail('needs_rules', 'work priorities need settlement rules v7');
  if (!PRIORITY_TARGET.test(target) || !priorityTargetValid(h, target)) return fail('invalid_target', 'prioritize a field, an enclosure or a building site that is not finished');
  const list = h.priority ?? [];
  if (list.includes(target) === on) return fail('unchanged', on ? 'this is already a priority' : 'this is not a priority');
  if (on && list.length >= MAX_PRIORITY) return fail('limit', `at most ${MAX_PRIORITY} priorities`);
  const next = on ? [...list, target].sort() : list.filter((t) => t !== target);
  if (next.length) h.priority = next; else delete h.priority;
  world.revision++;
  return { ok: true, value: { target, on } };
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
  if (role && WORK_ROLES.includes(role) && !isWorkHomestead(h)) return fail('needs_rules', `${role}s need settlement rules v4`);
  if (h.steward.proposals.some((p) => p.action === action && p.villagerId === villagerId && p.role === role)) {
    return fail('duplicate', 'the steward already asked for this');
  }
  if (h.steward.proposals.length >= MAX_PROPOSALS) return fail('limit', 'too many open requests');
  const proposal: Proposal = {
    id: `proposal:${h.steward.nextProposal++}`, action, reason, tick: lifeState(world).tick,
    ...(villagerId ? { villagerId } : {}), ...(role ? { role } : {}),
  };
  h.steward.proposals.push(proposal);
  if (isHerdHomestead(h) && action === 'assign_role') h.steward.lastAssign = proposal.tick;
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
      carry: v.carry ? { item: v.carry.item, amount: v.carry.amount, ...(v.carry.site !== undefined ? { site: v.carry.site } : {}),
        ...(v.carry.also !== undefined ? { also: { site: v.carry.also.site, amount: v.carry.also.amount } } : {}) } : null,
      task: v.task ? { kind: v.task.kind, target: v.task.target, leg: v.task.leg, progress: v.task.progress,
        legs: v.task.legs.map((l) => ({ op: l.op, x: l.x, z: l.z, ticks: l.ticks, effect: l.effect,
          ...(l.item !== undefined ? { item: l.item } : {}), ...(l.amount !== undefined ? { amount: l.amount } : {}),
          ...(l.at !== undefined ? { at: l.at } : {}) })) } : null,
      ...(v.nav ? { nav: navSnapshot(v.nav) } : {}),
      ...(v.avoid?.length ? { avoid: v.avoid.map((a) => ({ target: a.target, until: a.until, reason: a.reason, by: a.by })) } : {}),
    })),
    plots: [...h.plots].sort((a, b) => a.id.localeCompare(b.id)).map((p) => ({ id: p.id, x: p.x, z: p.z, w: p.w, d: p.d, crop: p.crop,
      state: p.state, growth: p.growth, moisture: p.moisture, dry: p.dry, tilled: p.tilled,
      ...(p.sown !== undefined ? { sown: p.sown } : {}), ...(p.order !== undefined ? { order: p.order } : {}) })),
    enclosures: [...h.enclosures].sort((a, b) => a.id.localeCompare(b.id)).map((e) => ({ id: e.id, grass: e.grass, feed: e.feed, water: e.water, eggs: e.eggs })),
    animals: [...h.animals].sort((a, b) => a.id.localeCompare(b.id)).map((a) => ({
      id: a.id, species: a.species, sex: a.sex, born: a.born, x: a.x, z: a.z, tx: a.tx, tz: a.tz,
      hunger: a.hunger, starving: a.starving, product: a.product, pregnantUntil: a.pregnantUntil,
      ...(a.go ? { go: a.go } : {}),
      ...(a.act ? { act: a.act, until: a.until ?? 0 } : {}),
    })),
    overflow: Object.fromEntries(Object.entries(h.overflow).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b))),
    steward: {
      enabled: h.steward.enabled,
      policy: { assign_role: h.steward.policy.assign_role, expand_field: h.steward.policy.expand_field },
      proposals: h.steward.proposals.map((p) => ({ id: p.id, action: p.action,
        ...(p.villagerId !== undefined ? { villagerId: p.villagerId } : {}), ...(p.role !== undefined ? { role: p.role } : {}),
        reason: p.reason, tick: p.tick })),
      nextProposal: h.steward.nextProposal,
      ...(h.steward.lastAssign !== undefined ? { lastAssign: h.steward.lastAssign } : {}),
    },
    ...(h.gates ? { gates: [...h.gates].sort((a, b) => a.id.localeCompare(b.id)).map((g) => ({ id: g.id, state: g.state })) } : {}),
    ...(h.sites ? { sites: [...h.sites].sort((a, b) => a.id.localeCompare(b.id)).map((st) => ({ id: st.id, kind: st.kind, x: st.x, z: st.z, state: st.state,
      reserved: sortedPositive(st.reserved), delivered: sortedPositive(st.delivered), work: st.work,
      // v6 only (absent from v4/v5 snapshots, so their bytes and hashes are unchanged).
      ...(st.rot !== undefined ? { rot: st.rot } : {}), ...(st.stock !== undefined ? { stock: sortedPositive(st.stock) } : {}) })) } : {}),
    ...(h.woodland ? { woodland: woodlandSnapshot(h.woodland) } : {}),
    // v7 only (absent below v7, so older snapshots keep their bytes and hashes).
    ...(h.due ? { due: Object.fromEntries(Object.entries(h.due).sort(([a], [b]) => a.localeCompare(b))) } : {}),
    ...(h.priority ? { priority: [...h.priority].sort() } : {}),
  };
}
const sortedPositive = (b: Record<string, number>) => Object.fromEntries(Object.entries(b).filter(([, n]) => n > 0).sort(([a], [c]) => a.localeCompare(c)));

function navSnapshot(n: NavState): NavState {
  return {
    path: [...n.path], plan: n.plan, dest: [n.dest[0], n.dest[1], n.dest[2]],
    ...(n.opening !== undefined ? { opening: n.opening } : {}),
    ...(n.opened !== undefined ? { opened: n.opened } : {}),
    ...(n.far !== undefined ? { far: [n.far[0], n.far[1]] as [number, number] } : {}),
    ...(n.blocked !== undefined ? { blocked: { reason: n.blocked.reason, by: n.blocked.by, target: n.blocked.target, since: n.blocked.since } } : {}),
    ...(n.wait !== undefined ? { wait: { by: n.wait.by, reason: n.wait.reason, since: n.wait.since } } : {}),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
const str = (v: unknown, re: RegExp): v is string => typeof v === 'string' && v.length <= 64 && re.test(v);
const POS = 20_000; // |dm| bound (±2 km)
// 'thresh' was missing here before M010, so a save taken while a farmer threshed seed was rejected on load.
const EFFECTS = new Set<Effect>(['take', 'store', 'till', 'sow', 'reap', 'water_plot', 'draw', 'water_trough', 'fill_feed', 'gather_eggs', 'shear', 'milk', 'eat', 'rest', 'restock', 'thresh', 'herd', 'hold_gate', 'chop', 'fetch', 'deliver', 'build', 'lift', 'plant', 'stow', 'reclaim', 'none']);
const V5_EFFECTS = new Set<Effect>(['lift', 'plant']);
const V6_EFFECTS = new Set<Effect>(['stow', 'reclaim']);
const GATE_ID_SET = new Set<string>(GATE_IDS);
const TARGET = /^[a-z_]+:[a-z0-9:]{1,24}$/;
const DUE_KEY = /^[a-z_]+:[a-z0-9:]{1,32}$/;
export const PRIORITY_TARGET = /^(?:field:\d{1,6}|site:\d{1,6}|coop|paddock|pen|sty)$/;
const BY = /^[A-Za-z0-9_:,.-]{1,96}$/;
const text160 = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 160 && /^[\x20-\x7e]+$/.test(v);

function validateNav(raw: unknown, tick: number, version: number): NavState {
  if (!isObj(raw) || !Array.isArray(raw.path) || raw.path.length % 2 !== 0 || raw.path.length > 512
    || !raw.path.every((c) => int(c, -1024, 1023)) || typeof raw.plan !== 'string' || !/^(?:[0-9a-f]{16})?$/.test(raw.plan)
    || !Array.isArray(raw.dest) || raw.dest.length !== 3 || !int(raw.dest[0], -POS, POS) || !int(raw.dest[1], -POS, POS) || !int(raw.dest[2], 0, 100)
    || raw.opening !== undefined && !GATE_ID_SET.has(String(raw.opening))
    || raw.opened !== undefined && !GATE_ID_SET.has(String(raw.opened))
    || raw.far !== undefined && (!Array.isArray(raw.far) || raw.far.length !== 2 || !int(raw.far[0], -1024, 1023) || !int(raw.far[1], -1024, 1023))) {
    throw new Error('invalid villager route');
  }
  let blocked: NavState['blocked'];
  if (raw.blocked !== undefined) {
    const b = raw.blocked;
    if (!isObj(b) || !text160(b.reason) || !str(b.by, BY) || !str(b.target, TARGET) || !int(b.since, 0, tick)) throw new Error('invalid villager obstruction');
    blocked = { reason: b.reason, by: b.by, target: b.target, since: b.since };
  }
  let wait: NavState['wait'];
  if (raw.wait !== undefined) {
    const w = raw.wait;
    // STAB-002 S2: under rules v7 a villager may wait for the player.
    if (version < HOMESTEAD_LIVING_VERSION || !isObj(w) || !str(w.by, version >= HOMESTEAD_HERD_VERSION ? /^(?:villager:\d{1,3}|player)$/ : /^villager:\d{1,3}$/) || !text160(w.reason) || !int(w.since, 0, tick)) throw new Error('invalid villager wait');
    wait = { by: w.by, reason: w.reason, since: w.since };
  }
  return navSnapshot({ path: raw.path as number[], plan: raw.plan, dest: raw.dest as [number, number, number],
    ...(raw.opening !== undefined ? { opening: raw.opening as string } : {}), ...(raw.opened !== undefined ? { opened: raw.opened as string } : {}),
    ...(raw.far !== undefined ? { far: raw.far as [number, number] } : {}), ...(blocked ? { blocked } : {}), ...(wait ? { wait } : {}) });
}
const ITEMS = /^(?:water|seed|fiber|eggs|wool|milk|harvest:(?:wheat|potato|flax)|food|rations|ore|stone|wood|sapling:(?:oak|birch|beech|spruce|pine|cherry))$/;
/** v5 only: a wildling sapling in a forester's hands (never stored). */
const isSapling = (item: unknown) => typeof item === 'string' && item.startsWith('sapling:');

/** Strict validation: unknown fields, ranges and references are rejected. */
export function validateHomestead(raw: unknown, tick: number): HomesteadState {
  const v7 = isObj(raw) && (raw.version as number) >= HOMESTEAD_HERD_VERSION;
  if (!isObj(raw) || !HOMESTEAD_VERSIONS.includes(raw.version as HomesteadVersion) || !int(raw.anchorX, -1000, 1000) || !int(raw.anchorZ, -1000, 1000)
    || !int(raw.rng, 1, 0xffffffff) || !int(raw.nextId, 0, 1_000_000)
    || !Array.isArray(raw.villagers) || raw.villagers.length > MAX_VILLAGERS
    || !Array.isArray(raw.plots) || raw.plots.length > MAX_FIELDS
    || !Array.isArray(raw.enclosures) || raw.enclosures.length !== 4
    || !Array.isArray(raw.animals) || raw.animals.length > MAX_ANIMALS) throw new Error('snapshot has an invalid homestead');
  const villagers: Villager[] = raw.villagers.map((v: unknown) => {
    if (!isObj(v) || !str(v.id, /^villager:\d{1,3}$/) || !str(v.name, /^[A-Za-z][A-Za-z '-]{0,23}$/)
      || !ROLES.includes(v.role as Role) || WORK_ROLES.includes(v.role as Role) && (raw.version as number) < HOMESTEAD_WORK_VERSION
      || !int(v.x, -POS, POS) || !int(v.z, -POS, POS)
      || !int(v.energy, 0, 100) || !int(v.hunger, 0, 100)) throw new Error('snapshot has an invalid villager');
    let carry: Carry = null;
    if (v.carry !== null) {
      if (!isObj(v.carry) || !str(v.carry.item, ITEMS) || !int(v.carry.amount, 1, 100)
        || isSapling(v.carry.item) && ((raw.version as number) < HOMESTEAD_WOODLAND_VERSION || v.carry.amount !== 1)
        || v.carry.site !== undefined && ((raw.version as number) < HOMESTEAD_WORK_VERSION || !str(v.carry.site, /^site:\d{1,6}$/))
        // v7: a second site's share of a site load.
        || v.carry.also !== undefined && (!v7 || v.carry.site === undefined || !isObj(v.carry.also) || Object.keys(v.carry.also).join() !== 'site,amount'
          || !str(v.carry.also.site, /^site:\d{1,6}$/) || v.carry.also.site === v.carry.site || !int(v.carry.also.amount, 1, v.carry.amount - 1))) throw new Error('invalid villager load');
      const also = isObj(v.carry.also) ? { site: v.carry.also.site as string, amount: v.carry.also.amount as number } : undefined;
      carry = { item: v.carry.item, amount: v.carry.amount, ...(v.carry.site !== undefined ? { site: v.carry.site as string } : {}), ...(also ? { also } : {}) };
    }
    let task: Task | null = null;
    if (v.task !== null) {
      const t = v.task;
      if (!isObj(t) || !str(t.kind, /^[a-z_]{1,16}$/) || !str(t.target, /^[a-z_]+:[a-z0-9:]{1,24}$/)
        || !Array.isArray(t.legs) || t.legs.length < 1 || t.legs.length > (v7 ? MAX_LEGS_V7 : 8) || !int(t.leg, 0, t.legs.length - 1) || !int(t.progress, 0, 10_000)) {
        throw new Error('invalid villager task');
      }
      const legs: Leg[] = t.legs.map((l: unknown) => {
        if (!isObj(l) || (l.op !== 'walk' && l.op !== 'work') || !int(l.x, -POS, POS) || !int(l.z, -POS, POS)
          || !int(l.ticks, 0, 1000) || !EFFECTS.has(l.effect as Effect) || V5_EFFECTS.has(l.effect as Effect) && (raw.version as number) < HOMESTEAD_WOODLAND_VERSION
          || V6_EFFECTS.has(l.effect as Effect) && (raw.version as number) < HOMESTEAD_BUILD_VERSION
          || isSapling(l.item) && (raw.version as number) < HOMESTEAD_WOODLAND_VERSION
          || l.item !== undefined && !str(l.item, ITEMS) || l.amount !== undefined && !int(l.amount, 1, 100)
          || l.at !== undefined && (!v7 || !str(l.at, TARGET))) throw new Error('invalid task leg');
        return { op: l.op, x: l.x, z: l.z, ticks: l.ticks, effect: l.effect as Effect,
          ...(l.item !== undefined ? { item: l.item as string } : {}), ...(l.amount !== undefined ? { amount: l.amount as number } : {}),
          ...(l.at !== undefined ? { at: l.at as string } : {}) };
      });
      task = { kind: t.kind, target: t.target, legs, leg: t.leg, progress: t.progress };
    }
    // Routes and give-ups exist only under settlement rules v2.
    if ((v.nav !== undefined || v.avoid !== undefined) && raw.version === HOMESTEAD_VERSION) throw new Error('legacy villager has a route');
    const nav = v.nav === undefined ? undefined : validateNav(v.nav, tick, raw.version as number);
    let avoid: Avoided[] | undefined;
    if (v.avoid !== undefined) {
      if (!Array.isArray(v.avoid) || v.avoid.length < 1 || v.avoid.length > MAX_AVOID) throw new Error('invalid villager give-ups');
      avoid = v.avoid.map((a: unknown) => {
        if (!isObj(a) || !str(a.target, TARGET) || !int(a.until, 0, Number.MAX_SAFE_INTEGER) || !text160(a.reason) || !str(a.by, BY)) throw new Error('invalid villager give-up');
        return { target: a.target, until: a.until, reason: a.reason, by: a.by };
      });
    }
    return { id: v.id, name: v.name, role: v.role as Role, x: v.x, z: v.z, energy: v.energy, hunger: v.hunger, carry, task,
      ...(nav ? { nav } : {}), ...(avoid ? { avoid } : {}) };
  });
  const fieldIds = new Set<string>();
  const plots: Plot[] = raw.plots.map((p: unknown) => {
    if (!isObj(p) || !str(p.id, /^field:\d{1,6}$/) || fieldIds.has(p.id) || !CROPS.includes(p.crop as CropKind)
      || !int(p.x, -1000, 1000) || !int(p.z, -1000, 1000) || !int(p.w, FIELD_MIN, FIELD_MAX) || !int(p.d, FIELD_MIN, FIELD_MAX)
      || !['wild', 'tilled', 'growing', 'ripe'].includes(String(p.state))
      || !int(p.growth, 0, CROP_RULES[p.crop as CropKind].growTicks) || !int(p.moisture, 0, MOISTURE_MAX)
      || !int(p.dry, 0, WITHER_TICKS) || !int(p.tilled, 0, TILL_PER_UNIT * fieldUnits(p.w, p.d))
      // v7: units sown so far (only while dug and not yet growing), and the owner's order tick.
      || p.sown !== undefined && (!v7 || !int(p.sown, 1, fieldUnits(p.w as number, p.d as number) - 1)
        || (p.state !== 'tilled' && (p.state !== 'wild' || (p.sown as number) > Math.floor((p.tilled as number) / TILL_PER_UNIT))))
      || p.order !== undefined && (!v7 || (p.state !== 'wild' && p.state !== 'tilled') || !int(p.order, 0, tick))) {
      throw new Error('snapshot has an invalid field');
    }
    fieldIds.add(p.id);
    return { id: p.id, x: p.x, z: p.z, w: p.w, d: p.d, crop: p.crop as CropKind, state: p.state as PlotState,
      growth: p.growth, moisture: p.moisture, dry: p.dry, tilled: p.tilled,
      ...(p.sown !== undefined ? { sown: p.sown as number } : {}), ...(p.order !== undefined ? { order: p.order as number } : {}) };
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
      || !int(a.product, 0, 1000) || !int(a.pregnantUntil, 0, Number.MAX_SAFE_INTEGER)
      || a.go !== undefined && ((raw.version as number) < HOMESTEAD_LIVING_VERSION || (a.go !== 'out' && a.go !== 'home'))
      // v7 only: the behaviour state and its tick (always together).
      || (a.act !== undefined || a.until !== undefined) && ((raw.version as number) < HOMESTEAD_HERD_VERSION
        || !ANIMAL_ACTS.includes(a.act as AnimalAct) || !int(a.until, 0, Number.MAX_SAFE_INTEGER))) throw new Error('snapshot has an invalid animal');
    ids.add(a.id);
    return { id: a.id, species: a.species as Species, sex: a.sex, born: a.born, x: a.x, z: a.z, tx: a.tx, tz: a.tz,
      hunger: a.hunger, starving: a.starving, product: a.product, pregnantUntil: a.pregnantUntil, ...(a.go ? { go: a.go as 'out' | 'home' } : {}),
      ...(a.act !== undefined ? { act: a.act as AnimalAct, until: a.until as number } : {}) };
  });
  if (!isObj(raw.overflow)) throw new Error('snapshot has an invalid overflow pile');
  const overflow: Record<string, number> = {};
  for (const k of Object.keys(raw.overflow)) {
    const n = raw.overflow[k];
    if (!str(k, ITEMS) || k.startsWith('harvest') || k === 'water' || isSapling(k) || !int(n, 1, OVERFLOW_CAPACITY)) throw new Error('snapshot has an invalid overflow pile');
    overflow[k] = n;
  }
  if (total(overflow) > OVERFLOW_CAPACITY) throw new Error('overflow pile exceeds capacity');
  const st = raw.steward;
  const policies = new Set(['auto', 'approve', 'off']);
  if (!isObj(st) || typeof st.enabled !== 'boolean' || !isObj(st.policy) || !policies.has(String(st.policy.assign_role))
    || !policies.has(String(st.policy.expand_field)) || !Array.isArray(st.proposals) || st.proposals.length > MAX_PROPOSALS
    || !int(st.nextProposal, 0, 1_000_000)
    || st.lastAssign !== undefined && (!v7 || !int(st.lastAssign, 0, tick))) throw new Error('snapshot has an invalid steward');
  const proposals: Proposal[] = st.proposals.map((p: unknown) => {
    if (!isObj(p) || !str(p.id, /^proposal:\d{1,6}$/) || !STEWARD_ACTIONS.includes(p.action as StewardAction)
      || p.villagerId !== undefined && !str(p.villagerId, /^villager:\d{1,3}$/) || p.role !== undefined && !ROLES.includes(p.role as Role)
      || typeof p.reason !== 'string' || p.reason.length > 160 || !int(p.tick, 0, tick)) throw new Error('snapshot has an invalid proposal');
    return { id: p.id, action: p.action as StewardAction, ...(p.villagerId !== undefined ? { villagerId: p.villagerId as string } : {}),
      ...(p.role !== undefined ? { role: p.role as Role } : {}), reason: p.reason, tick: p.tick };
  });
  const steward: Steward = { enabled: st.enabled, policy: { assign_role: st.policy.assign_role as Policy, expand_field: st.policy.expand_field as Policy },
    proposals, nextProposal: st.nextProposal, ...(st.lastAssign !== undefined ? { lastAssign: st.lastAssign as number } : {}) };
  let gates: GateRecord[] | undefined;
  if (raw.version !== HOMESTEAD_VERSION) {
    if (!Array.isArray(raw.gates) || raw.gates.length !== GATE_IDS.length) throw new Error('snapshot has invalid gates');
    gates = raw.gates.map((g: unknown, i: number) => {
      if (!isObj(g) || g.id !== GATE_IDS[i] || !GATE_STATES.includes(g.state as GateState)) throw new Error('snapshot has an invalid gate');
      return { id: GATE_IDS[i] as string, state: g.state as GateState };
    });
  } else if (raw.gates !== undefined) throw new Error('legacy homestead has gates');
  let sites: BuildSite[] | undefined;
  const v6 = (raw.version as number) >= HOMESTEAD_BUILD_VERSION;
  if ((raw.version as number) >= HOMESTEAD_WORK_VERSION) {
    if (!Array.isArray(raw.sites) || raw.sites.length > (v6 ? MAX_SITES_V6 : MAX_SITES)) throw new Error('snapshot has invalid building sites');
    const seen = new Set<string>();
    const bag = (b: unknown, max: Record<string, number>) => {
      if (!isObj(b)) throw new Error('snapshot has an invalid building site');
      for (const [k, n] of Object.entries(b)) if (max[k] === undefined || !int(n, 1, max[k])) throw new Error('snapshot has an invalid building site');
      return b as Record<string, number>;
    };
    sites = raw.sites.map((st: unknown) => {
      if (!isObj(st) || !str(st.id, /^site:\d{1,6}$/) || seen.has(st.id) || !(v6 ? BUILD_KINDS : SITE_KINDS).includes(st.kind as SiteKind)
        || !int(st.x, -1000, 1000) || !int(st.z, -1000, 1000) || !(v6 ? ['planned', 'approved', 'done', 'cancelled'] : ['planned', 'approved', 'done']).includes(String(st.state))
        || !int(st.work, 0, SITE_RULES[st.kind as SiteKind].work)
        || (v6 ? !int(st.rot, 0, 3) : st.rot !== undefined)) throw new Error('snapshot has an invalid building site');
      seen.add(st.id);
      const rule = SITE_RULES[st.kind as SiteKind];
      const site: BuildSite = { id: st.id, kind: st.kind as SiteKind, x: st.x, z: st.z, state: st.state as SiteState,
        reserved: bag(st.reserved, rule.cost), delivered: bag(st.delivered, rule.cost), work: st.work };
      if (v6) site.rot = st.rot as number;
      if (site.state !== 'approved' && Object.keys(site.reserved).length) throw new Error('only an approved site holds stock');
      if (site.state === 'planned' && (Object.keys(site.delivered).length || site.work)) throw new Error('a planned site has no materials or work');
      if (site.state === 'cancelled' && (!Object.keys(site.delivered).length || site.work)) throw new Error('a cancelled site holds only materials to carry back');
      // v6: a finished timber store holds its timber (never more than it takes); nothing else has a stock.
      if (v6 && site.state === 'done' && rule.store) {
        if (!isObj(st.stock)) throw new Error('a timber store has no stock');
        const stockBag = bag(st.stock, { [rule.store.item]: rule.store.capacity });
        site.stock = stockBag;
      } else if (st.stock !== undefined) throw new Error('only a finished timber store holds stock');
      return site;
    });
    // Reservations never exceed the stock they hold (checked against the store with the world).
  } else if (raw.sites !== undefined) throw new Error('only settlement rules v4 have building sites');
  for (const v of villagers) if (v.carry?.site && !sites?.some((st) => st.id === v.carry!.site)) throw new Error('a villager carries for an unknown site');
  let woodland: WoodlandState | undefined;
  if ((raw.version as number) >= HOMESTEAD_WOODLAND_VERSION) woodland = validateWoodland(raw.woodland, tick);
  else if (raw.woodland !== undefined) throw new Error('only settlement rules v5 have a woodland');
  // v7: due work (key -> tick it became due) and the owner's priority list.
  let due: Record<string, number> | undefined;
  if (raw.due !== undefined) {
    if (!v7 || !isObj(raw.due) || Object.keys(raw.due).length > MAX_DUE) throw new Error('snapshot has invalid due work');
    due = {};
    for (const [k, n] of Object.entries(raw.due)) { if (!str(k, DUE_KEY) || !int(n, 0, tick)) throw new Error('snapshot has invalid due work'); due[k] = n; }
  }
  let priority: string[] | undefined;
  if (raw.priority !== undefined) {
    if (!v7 || !Array.isArray(raw.priority) || raw.priority.length < 1 || raw.priority.length > MAX_PRIORITY
      || !raw.priority.every((t) => str(t, PRIORITY_TARGET)) || new Set(raw.priority).size !== raw.priority.length) throw new Error('snapshot has an invalid priority list');
    priority = raw.priority as string[];
  }
  for (const v of villagers) if (v.carry?.also && !sites?.some((st) => st.id === v.carry!.also!.site)) throw new Error('a villager carries for an unknown site');
  const h: HomesteadState = { version: raw.version as HomesteadVersion, anchorX: raw.anchorX, anchorZ: raw.anchorZ, rng: raw.rng, nextId: raw.nextId,
    villagers, plots, enclosures, animals, overflow, steward, ...(gates ? { gates } : {}), ...(sites ? { sites } : {}), ...(woodland ? { woodland } : {}),
    ...(due ? { due } : {}), ...(priority ? { priority } : {}) };
  const canonical = homesteadSnapshot(h);
  if (JSON.stringify(canonical) !== JSON.stringify(raw)) throw new Error('snapshot homestead is not canonical');
  return canonical;
}

export function cloneHomestead(h: HomesteadState): HomesteadState {
  return JSON.parse(JSON.stringify(homesteadSnapshot(h))) as HomesteadState;
}
