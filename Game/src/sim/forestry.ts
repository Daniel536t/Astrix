// M013 woodland management under settlement rules v5: policies and
// protection, the sustainable felling quota, the forester's replanting,
// natural seeding, scheduled lifecycle events, the owner's woodland commands
// and the read-only query API M014's placement preview builds on
// (`woodlandStats`).
//
// The managed woodland is the homestead's walking window (120 m square). The
// simulation generates every chunk of that window itself, so everything here
// that looks at neighbouring trees is independent of what a renderer loaded.
// Integer state only; randomness comes from the woodland's own xorshift
// stream (sim/woodland.ts), never the homestead's, so v1-v4 rolls are
// untouched and v5 adds no draws to the homestead stream outside the
// woodcutter's own choices.
import type { Entity, World } from './world';
import {
  MAT, SEA_LEVEL, addSimEntity, chunkKey, editVersion, ensureChunk, natureVersion, surfaceAt, topMaterialAtWorld,
  touchNature, waterDepthAt, worldToChunkX, worldToChunkZ,
} from './world';
import type { TreeSpecies } from './vegetation';
import { TREE_SPECIES } from './vegetation';
import type { HomesteadState, Leg, Rect, Task, Villager } from './homestead';
import {
  DM, FOOTPRINT, RESERVED_SITES, STORE_SPOT, WOOD_STOCK_TARGET, fieldRect, freeInStore, homesteadLayout, homesteadNav,
  homesteadNavRegion, siteCells, treeTarget, woodWanted, woodDropOff, storeCapacity,
} from './homestead';
import { FOUNDER_STOCKPILE } from './economy';
import { BLOCK, NavGoal, NavGrid, distanceField, findNearest } from './nav';
import {
  CYCLE, DEFAULT_POLICY, GROWTH, LIFE_FOOTPRINT, LifeStage, MAX_ORDERS, MAX_PROTECTED, MAX_ZONES, POLICY_LIMITS, PlantOrder,
  QUOTA_TREE, SPECIES_KIND, TIMBER, TreeLife, TreeOrigin, TreeStage, WOOD_DAY, WOODLAND_VERSION, WoodPolicy, WoodlandState,
  addRecord, createWoodland, dropRecord, fallAge, gapTicks, naturalBorn, noteTreeChange, recordOf, stageEnds, stageLabel,
  timberOf, treeLife, woodRnd, woodlandOf, HARVEST_MODES,
} from './woodland';

type Result<T> = { ok: true; value: T } | { ok: false; code: string; reasons: string[] };
const fail = (code: string, reason: string) => ({ ok: false as const, code, reasons: [reason] });
const len2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
const days = (d: number) => Math.max(1, Math.round(d * WOOD_DAY));

export const isWoodlandHomestead = (h: Pick<HomesteadState, 'version' | 'woodland'>) => h.version >= WOODLAND_VERSION && !!h.woodland;

/** Ticks of lifting a wildling sapling, and of planting it. */
export const LIFT_TICKS = 3;
export const PLANT_TICKS = 4;
/** A planted or seeded tree needs a seed parent (mature or older) this close (m). */
export const PLANT_SOURCE_RANGE = 20;
/** Seed parents examined per tick (a rotating slice; bounded work). */
export const SEED_PARENTS_PER_TICK = 2;
/** Lifecycle events (falls, resprouts, regrowth) processed per tick at most; the rest wait a tick. */
export const EVENTS_PER_TICK = 16;
/** No natural seeding once the managed woodland holds this many trees. */
export const MAX_WOODLAND_TREES = 500;
/** Within this many trees (m), the canopy is too dense for a seedling. */
export const SHADE_RADIUS = 4.5;
export const SHADE_TREES = 3;

/** 16 compass directions as fixed decimals (the hashed sim uses no trigonometry). */
const DIRS16: ReadonlyArray<[number, number]> = [
  [1, 0], [0.9239, 0.3827], [0.7071, 0.7071], [0.3827, 0.9239], [0, 1], [-0.3827, 0.9239], [-0.7071, 0.7071], [-0.9239, 0.3827],
  [-1, 0], [-0.9239, -0.3827], [-0.7071, -0.7071], [-0.3827, -0.9239], [0, -1], [0.3827, -0.9239], [0.7071, -0.7071], [0.9239, -0.3827],
];

// ---------- the managed window ----------

const windowCache = new WeakMap<World, { key: string; trees: Entity[] }>();
/** Every tree entity in the managed window (id order). Generates the window's chunks first. */
export function windowTrees(world: World, h: HomesteadState): Entity[] {
  const reg = homesteadNavRegion(h);
  const key = `${reg.ox},${reg.oz}|${world.revision}|${natureVersion(world)}|${world.entities.size}|${world.entityRemovals.size}`;
  const c = windowCache.get(world);
  if (c && c.key === key) return c.trees;
  const ids: string[] = [];
  for (let cz = worldToChunkZ(reg.oz); cz <= worldToChunkZ(reg.oz + reg.h - 1); cz++) {
    for (let cx = worldToChunkX(reg.ox); cx <= worldToChunkX(reg.ox + reg.w - 1); cx++) {
      ensureChunk(world, cx, cz);
      ids.push(...(world.entityChunks.get(chunkKey(cx, cz)) ?? []));
    }
  }
  ids.sort();
  const trees: Entity[] = [];
  for (const id of ids) {
    const e = world.entities.get(id);
    if (!e || !e.kind.startsWith('styl_tree_') || world.entityRemovals.has(id)) continue;
    if (e.x < reg.ox || e.z < reg.oz || e.x >= reg.ox + reg.w || e.z >= reg.oz + reg.h) continue;
    trees.push(e);
  }
  windowCache.set(world, { key, trees });
  return trees;
}

export function insideWindow(h: HomesteadState, x: number, z: number): boolean {
  const reg = homesteadNavRegion(h);
  return x >= reg.ox && z >= reg.oz && x < reg.ox + reg.w && z < reg.oz + reg.h;
}

/** Built ground (dm rects): buildings, pens, fields, sites, the store and barn. */
function builtRects(h: HomesteadState): Rect[] {
  const r = (x: number, z: number, w: number, d: number): Rect => ({ x0: Math.round(x * DM), z0: Math.round(z * DM), x1: Math.round((x + w) * DM), z1: Math.round((z + d) * DM) });
  return [...homesteadLayout(h).map((f) => f.rect), ...h.plots.map((p) => fieldRect(p)),
    ...(h.sites ?? []).map((st) => { const c = siteCells(st); return r(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0); }),
    r(FOUNDER_STOCKPILE.x - 2, FOUNDER_STOCKPILE.z - 2, 8, 3)];
}
function rectDistance(rects: Rect[], x: number, z: number): number {
  let best = Infinity;
  for (const r of rects) {
    const cx = Math.max(r.x0, Math.min(x * DM, r.x1)), cz = Math.max(r.z0, Math.min(z * DM, r.z1));
    best = Math.min(best, len2(x * DM - cx, z * DM - cz) / DM);
  }
  return best;
}
/** The farmyard (metres): no tree is planted or seeds itself here, so the yard never closes up. */
function yardRects(h: HomesteadState): Array<{ x0: number; z0: number; x1: number; z1: number }> {
  const ax = h.anchorX, az = h.anchorZ, sx = FOUNDER_STOCKPILE.x, sz = FOUNDER_STOCKPILE.z;
  return [
    { x0: ax + FOOTPRINT.x0 - 3, z0: az + FOOTPRINT.z0 - 3, x1: ax + FOOTPRINT.x1 + 3, z1: az + FOOTPRINT.z1 + 3 },
    { x0: sx - 6, z0: sz - 6, x1: sx + 10, z1: sz + 6 },
    ...RESERVED_SITES.map((q) => ({ x0: q.x0 - 2, z0: q.z0 - 2, x1: q.x1 + 2, z1: q.z1 + 2 })),
  ];
}

const waterCache = new WeakMap<Entity, { key: string; near: boolean }>();
function nearWater(world: World, e: Entity, r: number): boolean {
  if (r <= 0) return false;
  const key = `${editVersion(world)}:${r}`;
  const c = waterCache.get(e);
  if (c && c.key === key) return c.near;
  const ex = Math.floor(e.x), ez = Math.floor(e.z);
  let near = false;
  for (let z = ez - r; z <= ez + r && !near; z++) for (let x = ex - r; x <= ex + r && !near; x++) {
    if ((x + 0.5 - e.x) ** 2 + (z + 0.5 - e.z) ** 2 > r * r) continue;
    if (waterDepthAt(world, x, z) > 0) near = true;
  }
  waterCache.set(e, { key, near });
  return near;
}

/**
 * Why a tree is protected by the owner's policy or its place (null: it is
 * not). Stage rules (too young, a veteran, a kept snag) are separate.
 */
export function placeProtection(world: World, h: HomesteadState, w: WoodlandState, e: Entity): string | null {
  if (e.authored) return 'the founders\' grove is kept';
  if (w.protect.includes(e.id)) return 'marked protected by the owner';
  for (const z of w.zones) if ((e.x - z.x) ** 2 + (e.z - z.z) ** 2 <= z.r * z.r) return `inside protected area ${z.id.slice(5)} (${z.r} m)`;
  if (w.policy.buffer > 0 && rectDistance(builtRects(h), e.x, e.z) < w.policy.buffer) return `within ${w.policy.buffer} m of buildings, fields or the store`;
  if (nearWater(world, e, w.policy.waterBuffer)) return `within ${w.policy.waterBuffer} m of water`;
  return null;
}

/** Stages the policy lets the woodcutter fell. */
export function fellingStages(p: WoodPolicy): Set<LifeStage> {
  const s = new Set<LifeStage>(p.minStage === 'old' ? ['old', 'dying', 'snag'] : ['mature', 'old', 'dying', 'snag']);
  if (p.keepVeterans) { s.delete('old'); s.delete('dying'); }
  if (p.snags === 'keep') s.delete('snag');
  return s;
}

export interface ManagedTree {
  e: Entity; life: TreeLife;
  /** May be felled now (policy and stage), whatever the quota. */
  eligible: boolean;
  /** Why not: protected (place or policy), or not ready (stage). */
  why: string | null;
  protectedWhy: string | null;
}
export interface ManagedWoodland {
  all: ManagedTree[];
  /** Eligible trees (id order). */
  trees: Entity[];
  /** Mature, old and dying trees standing in the window (the canopy kept by `minStanding`). */
  standing: number;
  protected: number;
  /** Saplings, young trees, stumps that will resprout, gaps that will regrow, and planting orders. */
  regrowing: number;
}

const lotCache = new WeakMap<World, { key: string; lot: ManagedWoodland }>();
export function managedWoodland(world: World, h: HomesteadState): ManagedWoodland {
  const w = h.woodland!;
  const key = `${world.revision}|${world.life?.tick ?? 0}|${natureVersion(world)}|${world.entities.size}|${JSON.stringify(w.policy)}|${w.protect.length}|${w.zones.length}|${w.orders.length}`;
  const c = lotCache.get(world);
  if (c && c.key === key) return c.lot;
  const stages = fellingStages(w.policy);
  const all: ManagedTree[] = [];
  const trees: Entity[] = [];
  let standing = 0, prot = 0, regrowing = w.orders.length;
  for (const e of windowTrees(world, h)) {
    const life = treeLife(world, e)!;
    if (life.present && (life.stage === 'mature' || life.stage === 'old' || life.stage === 'dying')) standing++;
    if (life.stage === 'sapling' || life.stage === 'young' || (life.stage === 'stump' && life.record?.sprout)
      || (life.stage === 'gap' && life.nextIn !== null)) regrowing++;
    const pw = placeProtection(world, h, w, e);
    let why: string | null = pw;
    if (!why && !treeTarget(e.id)) why = 'not a woodland tree';
    if (!why && !life.present) why = 'nothing stands here';
    if (!why && life.stage === 'stump') why = life.record?.sprout ? 'a stump that will resprout' : 'a stump';
    if (!why && !stages.has(life.stage)) {
      why = life.stage === 'sapling' || life.stage === 'young' || (life.stage === 'mature' && w.policy.minStage === 'old') ? `too young (${stageLabel(life.stage)})`
        : life.stage === 'snag' ? 'a dead snag kept for wildlife' : 'a veteran tree (old trees are kept)';
    }
    if (pw || why === 'a veteran tree (old trees are kept)' || why === 'a dead snag kept for wildlife') prot++;
    const eligible = why === null;
    if (eligible) trees.push(e);
    all.push({ e, life, eligible, why, protectedWhy: pw ?? (why === 'a veteran tree (old trees are kept)' || why === 'a dead snag kept for wildlife' ? why : null) });
  }
  const lot = { all, trees, standing, protected: prot, regrowing };
  lotCache.set(world, { key, lot });
  return lot;
}

// ---------- sustainable yield ----------

/** Days from felling until a spot of this species is ready to fell again under the policy. */
export function rotationDays(sp: TreeSpecies, p: WoodPolicy): number {
  const g = GROWTH[sp];
  const regen = g.coppice * g.resprout + (1 - g.coppice) * (p.replant > 0 ? 0.5 : g.rot + 4);
  return regen + g.days[0] + g.days[1] + (p.minStage === 'old' ? g.days[2] : 0);
}

/**
 * The sustainable yield of the managed woodland: every spot that may be
 * felled (not protected by place) gives one tree per rotation. Spots are the
 * trees in the window, including saplings, stumps and gaps that regrow.
 */
export function sustainableYield(world: World, h: HomesteadState, filter?: (e: Entity) => boolean): { spots: number; treesPerDay: number; woodPerDay: number; rotation: number } {
  const w = h.woodland!;
  let spots = 0, trees = 0, wood = 0;
  for (const e of windowTrees(world, h)) {
    if (filter && !filter(e)) continue;
    const life = treeLife(world, e)!;
    if (!life.present && life.nextIn === null && e.harvested) continue;
    if (placeProtection(world, h, w, e)) continue;
    const rot = rotationDays(life.species, w.policy);
    spots++; trees += 1 / rot;
    wood += TIMBER[life.species][w.policy.minStage].total / rot;
  }
  return { spots, treesPerDay: trees, woodPerDay: wood, rotation: trees > 0 ? spots / trees : 0 };
}

function updateRate(world: World, h: HomesteadState): void {
  const w = h.woodland!;
  w.rate = Math.round(sustainableYield(world, h).treesPerDay * QUOTA_TREE / WOOD_DAY);
}
const quotaCap = (w: WoodlandState) => Math.max(2 * QUOTA_TREE, w.rate * WOOD_DAY);

// ---------- where a tree may grow ----------

export interface PlantCheck { ignore?: string; spacing?: number; grid?: NavGrid; orders?: boolean; yard?: boolean }

/** Reasons a tree of `sp` may not grow at cell (x, z) (empty: it may). Shared by seeding, the forester, the owner and M014 previews. */
export function plantable(world: World, h: HomesteadState, x: number, z: number, sp: TreeSpecies, o: PlantCheck = {}): string[] {
  const reasons: string[] = [];
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) return ['trees are planted on whole metres'];
  if (!insideWindow(h, x + 0.5, z + 0.5)) return ['outside the managed woodland (the homestead\'s 120 m square)'];
  const top = topMaterialAtWorld(world, x, z);
  if (waterDepthAt(world, x, z) > 0) reasons.push('there is water here');
  else if (top !== MAT.GRASS && top !== MAT.SOIL && top !== MAT.MOSS) reasons.push('trees need grass or soil');
  const y = surfaceAt(world, x, z);
  if (y <= SEA_LEVEL + 1) reasons.push('too low, by the water line');
  let steep = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) steep = Math.max(steep, Math.abs(surfaceAt(world, x + dx, z + dz) - y));
  if (steep > 1) reasons.push(`the ground is too steep (${steep} m step)`);
  if (o.yard !== false && yardRects(h).some((r) => x + 0.5 >= r.x0 && x + 0.5 < r.x1 && z + 0.5 >= r.z0 && z + 0.5 < r.z1)) reasons.push('this is the farmyard, kept clear');
  if (rectDistance(builtRects(h), x + 0.5, z + 0.5) < 1.5) reasons.push('too close to a building, pen, field or the store');
  for (const s of world.structures.values()) {
    if (s.modules.some((m) => Math.abs(m.x - (x + 0.5)) < m.w / 2 + 1.5 && Math.abs(m.z - (z + 0.5)) < m.d / 2 + 1.5)) { reasons.push('a built structure is here'); break; }
  }
  const g = o.grid ?? homesteadNav(world, h);
  if (g.inside(x, z)) {
    const i = g.index(x, z), b = g.block[i];
    if (b !== BLOCK.none && b !== BLOCK.tree) reasons.push(`the ground is taken (${g.reason(x, z).replace('_', ' ')})`);
    // A fence or gate on any side of the cell.
    const wallE = g.walls[i] & 5, wallS = g.walls[i] & 10;
    const west = g.inside(x - 1, z) ? g.walls[g.index(x - 1, z)] & 5 : 0, north = g.inside(x, z - 1) ? g.walls[g.index(x, z - 1)] & 10 : 0;
    if (wallE || wallS || west || north) reasons.push('a fence runs here');
  }
  const spacing = o.spacing ?? GROWTH[sp].spacing;
  let shade = 0, close: string | null = null;
  for (const e of windowTrees(world, h)) {
    if (e.id === o.ignore) continue;
    const d2 = (e.x - (x + 0.5)) ** 2 + (e.z - (z + 0.5)) ** 2;
    if (d2 > SHADE_RADIUS * SHADE_RADIUS && d2 > spacing * spacing) continue;
    const life = treeLife(world, e)!;
    if (!life.present) continue;
    if (d2 < spacing * spacing && !close) close = `too close to another tree (${sp} needs ${spacing} m)`;
    if (d2 <= SHADE_RADIUS * SHADE_RADIUS && (life.stage === 'mature' || life.stage === 'old' || life.stage === 'dying')) shade++;
  }
  if (close) reasons.push(close);
  if (shade >= SHADE_TREES) reasons.push(`too shaded: ${shade} big trees within ${SHADE_RADIUS} m`);
  if (o.orders !== false && h.woodland?.orders.some((q) => q.x === x && q.z === z)) reasons.push('a sapling is already planned here');
  return reasons;
}

/** Nearest plantable cell to (x, z) within `range` m, in a fixed ring order (deterministic), or null. */
export function findPlantSpot(world: World, h: HomesteadState, x: number, z: number, sp: TreeSpecies, range = 6, minDist = 2): { x: number; z: number } | null {
  const g = homesteadNav(world, h);
  const cx = Math.floor(x), cz = Math.floor(z);
  for (let r = minDist; r <= range; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (plantable(world, h, cx + dx, cz + dz, sp, { grid: g }).length === 0) return { x: cx + dx, z: cz + dz };
    }
  }
  return null;
}

/** The nearest seed parent (present mature, old or dying tree; of `sp` when given) within `range` m of (x, z), or null. */
export function seedParent(world: World, h: HomesteadState, x: number, z: number, sp: TreeSpecies | null, range = PLANT_SOURCE_RANGE): Entity | null {
  let best: Entity | null = null, bd = range * range;
  for (const e of windowTrees(world, h)) {
    const life = treeLife(world, e)!;
    if (!life.present || (life.stage !== 'mature' && life.stage !== 'old' && life.stage !== 'dying') || (sp && life.species !== sp)) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bd || (d === bd && best && e.id < best.id)) { bd = d; best = e; }
  }
  return best;
}

/** Add a tree the simulation grows (seeded, planted): a real entity in a changed chunk plus its record. */
export function addTree(world: World, h: HomesteadState, sp: TreeSpecies, x: number, z: number, from: TreeOrigin): Entity {
  const w = h.woodland!;
  const tick = world.life?.tick ?? 0;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z), key = chunkKey(cx, cz);
  ensureChunk(world, cx, cz);
  const id = `e:${key}:${1000 + w.nextId++}`;
  const kind = SPECIES_KIND[sp];
  const variants = kind === 'styl_tree_blossom' ? 2 : kind === 'styl_tree_cluster' ? 3 : 4;
  const e: Entity = {
    id, kind, chunk: key, x: x + 0.5, y: surfaceAt(world, x, z) - 1, z: z + 0.5,
    rot: Math.floor(woodRnd(w) * 24) * (Math.PI / 12), scale: 0.9 + Math.floor(woodRnd(w) * 20) / 100,
    variant: Math.floor(woodRnd(w) * variants), resource: 'wood', remaining: 12, yieldPerHarvest: 4,
    harvested: false, provisional: true, authored: false,
  };
  addSimEntity(world, e);
  addRecord(w, { id, sp, st: 'live', born: tick, at: tick, next: tick + fallAge(sp, id), from });
  noteTreeChange(world, id);
  return e;
}

/** A felled, fallen or rotted tree's entity standing again as a sapling (same id, record reset). */
function regrow(world: World, w: WoodlandState, e: Entity, from: TreeOrigin, tick: number): void {
  const rec = recordOf(w, e.id)!;
  e.harvested = false;
  delete e.harvestedOnce;
  e.remaining = 12; e.yieldPerHarvest = 4;
  if (!e.authored) world.entityChanges.add(e.chunk);
  rec.st = 'live'; rec.born = tick; rec.at = tick; rec.next = tick + fallAge(rec.sp, e.id); rec.from = from;
  delete rec.sprout;
  touchNature(world);
  noteTreeChange(world, e.id);
}

// ---------- the tick ----------

/** One woodland step inside the journaled tick (rules v5): scheduled events, the quota, then a slice of natural seeding. */
export function stepWoodland(world: World, h: HomesteadState, tick: number, log: string[]): void {
  const w = h.woodland;
  if (!w) return;
  // 1. Lifecycle events that are due, oldest first, bounded per tick.
  const due = w.trees.filter((t) => t.next >= 0 && t.next <= tick).sort((a, b) => a.next - b.next || a.id.localeCompare(b.id)).slice(0, EVENTS_PER_TICK);
  for (const t of due) {
    const e = world.entities.get(t.id);
    if (!e) { t.next = -1; continue; }
    const inWin = insideWindow(h, e.x, e.z);
    if (t.st === 'live') {
      // The snag falls: the spot is empty until it regrows.
      t.st = 'gap'; t.at = tick; t.next = tick + gapTicks(t.sp, t.id);
      e.harvested = true;
      if (!e.authored) world.entityChanges.add(e.chunk);
      touchNature(world); noteTreeChange(world, e.id);
      if (inWin) log.push(`a dead ${t.sp} fell`);
    } else if (t.st === 'stump' && t.sprout) {
      regrow(world, w, e, 'sprout', tick);
      w.sprouted++;
      if (inWin) log.push(`a ${t.sp} stump put up new shoots`);
    } else if (t.st === 'stump') {
      // The stump rots away; the spot is free for seedlings and planting.
      t.st = 'gap'; t.at = tick; t.next = -1;
      touchNature(world); noteTreeChange(world, e.id);
    } else {
      const ok = !inWin || plantable(world, h, Math.floor(e.x), Math.floor(e.z), t.sp, { ignore: e.id, spacing: 1.5, orders: false, yard: false }).length === 0;
      if (ok) regrow(world, w, e, 'regrow', tick);
      else t.next = -1;
    }
    if (t.st === 'gap' && t.next < 0 && e.harvested) dropRecord(w, t.id);
  }
  // 2. The sustainable allowance: re-measured each dawn, accrued every tick.
  if (tick % WOOD_DAY === 0) updateRate(world, h);
  if (w.policy.harvest === 'sustainable') w.quota = Math.min(quotaCap(w), w.quota + w.rate);
  // 3. Natural seeding from mature parents, a rotating slice of them per tick.
  const trees = windowTrees(world, h);
  const parents: Array<{ e: Entity; sp: TreeSpecies }> = [];
  let presentCount = 0;
  for (const e of trees) {
    const life = treeLife(world, e)!;
    if (life.present) presentCount++;
    if (life.present && (life.stage === 'mature' || life.stage === 'old')) parents.push({ e, sp: life.species });
  }
  if (!parents.length || presentCount >= MAX_WOODLAND_TREES) return;
  const n = parents.length;
  const visits = Math.min(SEED_PARENTS_PER_TICK, n);
  const interval = n / visits;
  let grid: NavGrid | null = null;
  for (let k = 0; k < visits; k++) {
    const p = parents[w.scan % n];
    w.scan++;
    const g = GROWTH[p.sp];
    if (woodRnd(w) >= g.seedPerDay * interval / WOOD_DAY) continue;
    const dir = DIRS16[Math.floor(woodRnd(w) * 16)];
    const dist = 1.5 + woodRnd(w) * (g.seedRange - 1.5);
    const x = Math.floor(p.e.x + dir[0] * dist), z = Math.floor(p.e.z + dir[1] * dist);
    grid ??= homesteadNav(world, h);
    if (plantable(world, h, x, z, p.sp, { grid }).length) continue;
    addTree(world, h, p.sp, x, z, 'seed');
    w.seeded++;
  }
}

/**
 * Called by `cutEntity` for every cut of a tree under rules v5. The tree gets
 * a record (its age carries on); the first cut of a managed tree uses one
 * tree of the sustainable allowance; a felled tree becomes a stump that
 * resprouts (broadleaf coppice, by a roll on the woodland stream) or rots,
 * and the forester gets replanting orders.
 */
export function woodlandCut(world: World, e: Entity, life: TreeLife, first: boolean): void {
  const h = world.homestead!;
  const w = woodlandOf(world)!;
  const tick = world.life?.tick ?? 0;
  let rec = recordOf(w, e.id);
  if (!rec) {
    const born = e.authored ? tick - Math.floor(stageEnds(life.species, e.id)[1] * 1.2) : naturalBorn(world, e, w, life.species);
    rec = addRecord(w, { id: e.id, sp: life.species, st: 'live', born, at: tick, next: born + fallAge(life.species, e.id), from: 'wild' });
  }
  const managed = insideWindow(h, e.x, e.z) && !e.authored;
  if (first && managed) w.quota = Math.max(-3 * QUOTA_TREE, w.quota - QUOTA_TREE);
  if (!e.harvested) return;
  const dead = life.stage === 'dying' || life.stage === 'snag';
  const g = GROWTH[rec.sp];
  const sprout = !dead && woodRnd(w) < g.coppice;
  rec.st = 'stump'; rec.at = tick; rec.next = tick + days(sprout ? g.resprout : g.rot);
  if (sprout) rec.sprout = true; else delete rec.sprout;
  if (!managed) return;
  w.felled++;
  for (let k = 0; k < w.policy.replant && w.orders.length < MAX_ORDERS; k++) {
    const spot = findPlantSpot(world, h, e.x, e.z, rec.sp, 7, 2);
    if (!spot) break;
    w.orders.push({ id: `plant:${w.nextId++}`, x: spot.x, z: spot.z, sp: rec.sp });
  }
}

// ---------- founding and upgrading ----------

/**
 * Start the woodland clock (founding or upgrading to rules v5). Untouched
 * trees need nothing: at this tick each is in the stage it is drawn in.
 * Trees felled before the upgrade become gaps that regrow; partly cut trees
 * get records so their cut timber stays exact.
 */
export function startWoodland(world: World, h: HomesteadState): WoodlandState {
  const tick = world.life?.tick ?? 0;
  const w = createWoodland(world.seed, tick);
  h.woodland = w;
  const list = [...world.entities.values()].filter((e) => e.kind.startsWith('styl_tree_') && !world.entityRemovals.has(e.id) && (e.harvested || e.harvestedOnce))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const e of list) {
    const life = treeLife(world, e)!;
    if (e.harvested) addRecord(w, { id: e.id, sp: life.species, st: 'gap', born: tick, at: tick, next: tick + gapTicks(life.species, e.id), from: 'wild' });
    else {
      const born = e.authored ? tick - Math.floor(stageEnds(life.species, e.id)[1] * 1.2) : naturalBorn(world, e, w, life.species);
      addRecord(w, { id: e.id, sp: life.species, st: 'live', born, at: tick, next: born + fallAge(life.species, e.id), from: 'wild' });
    }
  }
  updateRate(world, h);
  return w;
}

/** Fields and sites clear the ground they cover: stumps are grubbed out and empty spots stay empty. */
export function clearGround(world: World, h: HomesteadState, x0: number, z0: number, x1: number, z1: number): void {
  const w = h.woodland;
  if (!w) return;
  for (const e of windowTrees(world, h)) {
    if (e.x < x0 - 0.5 || e.x >= x1 + 0.5 || e.z < z0 - 0.5 || e.z >= z1 + 0.5) continue;
    const life = treeLife(world, e)!;
    if (life.stage !== 'stump' && life.stage !== 'gap') continue;
    e.harvested = true;
    if (!e.authored) world.entityChanges.add(e.chunk);
    dropRecord(w, e.id);
    touchNature(world); noteTreeChange(world, e.id);
  }
}

// ---------- the woodcutter and forester (rules v5) ----------

const walkLeg = (x: number, z: number): Leg => ({ op: 'walk', x, z, ticks: 0, effect: 'none' });
const workLeg = (x: number, z: number, ticks: number, effect: Leg['effect'], item?: string): Leg => ({ op: 'work', x, z, ticks, effect, ...(item ? { item } : {}) });
const mkTask = (kind: string, target: string, legs: Leg[]): Task => ({ kind, target, legs, leg: 0, progress: 0 });

/** Where a woodcutter stands to fell or lift from a tree: within reach of the trunk, outside its footprint. */
export function lifeGoal(world: World, e: Entity): NavGoal {
  const life = treeLife(world, e);
  const r = life && life.present && life.stage !== 'gap' ? LIFE_FOOTPRINT[life.stage as TreeStage] : 1;
  return { x: Math.round(e.x * DM), z: Math.round(e.z * DM), reach: Math.round((r + 1.2) * DM) };
}

/** Why the woodcutter would not start a new tree now (null: it may), from the policy, the canopy minimum, the quota and demand. */
export function fellingHold(world: World, h: HomesteadState, lot: ManagedWoodland, starting: number): string | null {
  const w = h.woodland!;
  if (w.policy.harvest === 'paused') return 'felling is paused by the woodland policy';
  if (lot.standing - 1 < w.policy.minStanding) return `only ${lot.standing} mature trees stand in the woodland (the policy keeps ${w.policy.minStanding})`;
  if (w.policy.harvest === 'sustainable' && w.quota - starting * QUOTA_TREE < QUOTA_TREE) {
    const perDay = w.rate * WOOD_DAY / QUOTA_TREE;
    const wait = w.rate > 0 ? Math.ceil((QUOTA_TREE * (starting + 1) - w.quota) / w.rate) : null;
    return `sustainable quota reached: the woodland regrows about ${perDay.toFixed(1)} trees a day${wait !== null ? `; next tree in about ${wait} ticks` : ''}`;
  }
  const free = freeInStore(world, 'wood') + (h.overflow.wood ?? 0);
  // v6: the timber stores' room is part of the stock the woodcutter keeps up.
  const room = storeCapacity(h);
  if (free >= WOOD_STOCK_TARGET + room && !woodWanted(h)) return room ? `the store and timber stores hold ${free} wood and no site needs more` : `the store has ${free} wood and no site needs more`;
  return null;
}

/** Other woodcutters walking to a tree nobody has cut yet (each will use one tree of the quota). */
function startingFellings(world: World, h: HomesteadState, self: Villager): number {
  return h.villagers.filter((v) => v !== self && v.task?.kind === 'chop').filter((v) => {
    const id = /^tree:(\d+):(\d+):(\d+)$/.exec(v.task!.target);
    const e = id ? world.entities.get(`e:${id[1]},${id[2]}:${id[3]}`) : undefined;
    return e && !e.harvestedOnce;
  }).length;
}

/** The forester's next replanting: an order nobody holds, and a seed parent to lift a wildling from. */
function nextPlanting(world: World, h: HomesteadState, taken: Set<string>): { order: PlantOrder; source: Entity } | null {
  for (const order of [...h.woodland!.orders].sort((a, b) => a.id.localeCompare(b.id))) {
    if (taken.has(order.id)) continue;
    const source = seedParent(world, h, order.x + 0.5, order.z + 0.5, order.sp, 40) ?? seedParent(world, h, order.x + 0.5, order.z + 0.5, null, 40);
    if (source) return { order, source };
  }
  return null;
}

/**
 * Plan for a v5 woodcutter. Order of work: plant a sapling in hand; replant
 * the orders felling left; then fell, only trees the policy allows, only
 * while the canopy minimum, the sustainable quota and demand allow.
 * Returns a task, 'busy' (search budget spent this tick), or the reason
 * nothing is to be done (the caller idles).
 */
export function planWoodcutter(world: World, h: HomesteadState, v: Villager, taken: Set<string>, budget: { left: number }): Task | 'busy' | string {
  const w = h.woodland!;
  if (v.carry?.item.startsWith('sapling:')) {
    const sp = v.carry.item.slice(8) as TreeSpecies;
    let order = [...w.orders].sort((a, b) => a.id.localeCompare(b.id)).find((o) => !taken.has(o.id));
    if (!order && w.orders.length < MAX_ORDERS) {
      const spot = findPlantSpot(world, h, v.x / DM, v.z / DM, sp, 8, 1);
      if (spot) { order = { id: `plant:${w.nextId++}`, x: spot.x, z: spot.z, sp }; w.orders.push(order); }
    }
    if (!order) { v.carry = null; return 'no ground to plant the sapling in hand; it was set down'; }
    const at = { x: order.x * DM + 5, z: order.z * DM + 5 };
    return mkTask('plant', order.id, [walkLeg(at.x, at.z), workLeg(at.x, at.z, PLANT_TICKS, 'plant')]);
  }
  if (v.carry) return 'carrying';
  const next = nextPlanting(world, h, taken);
  if (next) {
    const g = lifeGoal(world, next.source), sp = treeLife(world, next.source)!.species;
    const at = { x: next.order.x * DM + 5, z: next.order.z * DM + 5 };
    return mkTask('plant', next.order.id, [walkLeg(g.x, g.z), workLeg(g.x, g.z, LIFT_TICKS, 'lift', `sapling:${sp}`), walkLeg(at.x, at.z), workLeg(at.x, at.z, PLANT_TICKS, 'plant')]);
  }
  const lot = managedWoodland(world, h);
  const open = lot.trees.filter((e) => !taken.has(treeTarget(e.id)!));
  let pool = open.filter((e) => e.harvestedOnce);
  if (!pool.length) {
    const hold = fellingHold(world, h, lot, startingFellings(world, h, v));
    if (hold) return hold;
    pool = open;
  }
  if (!pool.length) return 'no tree may be felled here: the rest are protected, too young or taken';
  if (budget.left <= 0) return 'busy';
  const grid = homesteadNav(world, h);
  const res = findNearest(world, grid, v, pool.map((e) => ({ ...lifeGoal(world, e), id: e.id })), { maxExpansions: Math.min(budget.left, 15_000) });
  budget.left -= res.expanded;
  if (!res.ok) return res.code === 'budget' ? 'busy' : 'no fellable tree can be reached';
  const e = world.entities.get(res.id)!;
  const g = lifeGoal(world, e);
  // v6: the load goes to the nearest woodshed or log store with room, or the store when that is nearer (below v6 always the store).
  const drop = woodDropOff(h, Math.round(e.x * DM), Math.round(e.z * DM));
  return mkTask('chop', treeTarget(e.id)!, [walkLeg(g.x, g.z), workLeg(g.x, g.z, 4, 'chop'), walkLeg(drop.x, drop.z), workLeg(drop.x, drop.z, 1, drop.effect)]);
}

/** What an idle v5 woodcutter is waiting for (for the Farm panel; derived, never saved). */
export function woodcutterStatus(world: World, h: HomesteadState, v: Villager): string | null {
  if (!isWoodlandHomestead(h) || v.role !== 'woodcutter') return null;
  if (v.task && v.task.kind !== 'idle') return null;
  const lot = managedWoodland(world, h);
  if (h.woodland!.orders.length) return null;
  if (!lot.trees.length) return 'no tree may be felled here: the rest are protected, too young or taken';
  return fellingHold(world, h, lot, startingFellings(world, h, v));
}

/** 'lift': take a wildling from under a living seed parent near the leg (hands must be empty). */
export function liftSapling(world: World, h: HomesteadState, v: Villager, leg: Leg, log: string[]): boolean {
  const sp = (leg.item ?? '').slice(8) as TreeSpecies;
  if (!TREE_SPECIES.includes(sp) || v.carry) return false;
  const src = seedParent(world, h, leg.x / DM, leg.z / DM, sp, 3);
  if (!src) return false;
  v.carry = { item: `sapling:${sp}`, amount: 1 };
  log.push(`${v.name} lifted a ${sp} sapling`);
  return true;
}

/** 'plant': set the sapling in hand into the order's cell (or the nearest good cell beside it). */
export function plantSapling(world: World, h: HomesteadState, v: Villager, task: Task, log: string[]): boolean {
  const w = h.woodland!;
  const order = w.orders.find((o) => o.id === task.target);
  if (!v.carry?.item.startsWith('sapling:')) { if (order) w.orders = w.orders.filter((o) => o !== order); return false; }
  const sp = v.carry.item.slice(8) as TreeSpecies;
  w.orders = w.orders.filter((o) => o !== order);
  const at = order ?? { x: Math.floor(v.x / DM), z: Math.floor(v.z / DM) };
  const spot = plantable(world, h, at.x, at.z, sp, { orders: false }).length === 0 ? at : findPlantSpot(world, h, at.x + 0.5, at.z + 0.5, sp, 4, 1);
  v.carry = null;
  if (!spot) { log.push(`${v.name} found no ground for the ${sp} sapling`); return true; }
  addTree(world, h, sp, spot.x, spot.z, 'plant');
  w.planted++;
  log.push(`${v.name} planted a ${sp} sapling`);
  return true;
}

// ---------- the owner's woodland commands ----------

function woodlandHome(world: World): { h: HomesteadState; w: WoodlandState } | { h: null; w: null } {
  const h = world.homestead;
  return h && isWoodlandHomestead(h) ? { h, w: h.woodland! } : { h: null, w: null };
}
const needsV5 = () => fail('needs_rules', 'the woodland needs settlement rules v5');

/** The owner lifts a wildling from a seed parent within 20 m and plants it at cell (x, z). */
export function plantTree(world: World, x: number, z: number, species?: TreeSpecies): Result<{ entityId: string; species: TreeSpecies; x: number; z: number }> {
  const { h } = woodlandHome(world);
  if (!h) return needsV5();
  const parent = seedParent(world, h, x + 0.5, z + 0.5, species ?? null);
  if (!parent) return fail('no_seed', species ? `no mature ${species} within ${PLANT_SOURCE_RANGE} m to lift a sapling from` : `no mature tree within ${PLANT_SOURCE_RANGE} m to lift a sapling from`);
  const sp = treeLife(world, parent)!.species;
  const reasons = plantable(world, h, x, z, sp);
  if (reasons.length) return { ok: false, code: 'unsuitable', reasons };
  const e = addTree(world, h, sp, x, z, 'plant');
  h.woodland!.planted++;
  world.revision++;
  return { ok: true, value: { entityId: e.id, species: sp, x, z } };
}

export function protectTree(world: World, entityId: string, on: boolean): Result<{ entityId: string; protect: boolean }> {
  const { h, w } = woodlandHome(world);
  if (!h) return needsV5();
  const e = world.entities.get(entityId);
  if (!e || !e.kind.startsWith('styl_tree_') || world.entityRemovals.has(entityId)) return fail('invalid_target', 'no such tree');
  const has = w.protect.includes(entityId);
  if (has === on) return fail('unchanged', on ? 'this tree is already protected' : 'this tree is not marked protected');
  if (on && w.protect.length >= MAX_PROTECTED) return fail('limit', `at most ${MAX_PROTECTED} trees can be marked`);
  w.protect = on ? [...w.protect, entityId].sort() : w.protect.filter((id) => id !== entityId);
  world.revision++;
  return { ok: true, value: { entityId, protect: on } };
}

export function protectZone(world: World, x: number, z: number, r: number): Result<{ zoneId: string; x: number; z: number; r: number }> {
  const { h, w } = woodlandHome(world);
  if (!h) return needsV5();
  if (![x, z, r].every(Number.isSafeInteger) || r < 2 || r > 40) return fail('invalid_zone', 'protected areas are 2 to 40 m across (whole metres)');
  if (w.zones.length >= MAX_ZONES) return fail('limit', `at most ${MAX_ZONES} protected areas`);
  const zoneId = `zone:${w.nextId++}`;
  w.zones = [...w.zones, { id: zoneId, x, z, r }];
  world.revision++;
  return { ok: true, value: { zoneId, x, z, r } };
}

export function removeZone(world: World, zoneId: string): Result<{ zoneId: string }> {
  const { h, w } = woodlandHome(world);
  if (!h) return needsV5();
  if (!w.zones.some((z) => z.id === zoneId)) return fail('invalid_target', 'no such protected area');
  w.zones = w.zones.filter((z) => z.id !== zoneId);
  world.revision++;
  return { ok: true, value: { zoneId } };
}

export function setWoodlandPolicy(world: World, p: WoodPolicy): Result<WoodPolicy> {
  const { h, w } = woodlandHome(world);
  if (!h) return needsV5();
  if (!HARVEST_MODES.includes(p.harvest)) return fail('invalid_policy', 'unknown harvest mode');
  for (const [k, [lo, hi]] of Object.entries(POLICY_LIMITS)) {
    const v = p[k as keyof typeof POLICY_LIMITS];
    if (!Number.isSafeInteger(v) || v < lo || v > hi) return fail('invalid_policy', `${k} must be ${lo}–${hi}`);
  }
  if (JSON.stringify(p) === JSON.stringify(w.policy)) return fail('unchanged', 'the woodland policy is unchanged');
  w.policy = { ...p };
  updateRate(world, h);
  if (p.harvest === 'sustainable') w.quota = Math.min(w.quota, quotaCap(w));
  world.revision++;
  return { ok: true, value: { ...w.policy } };
}
export { DEFAULT_POLICY };

// ---------- the query API (read-only; M014 placement previews) ----------

export interface WoodlandQuery {
  /** Centre (metres) and radius (m) of the area asked about. */
  x: number; z: number; radius: number;
  /** Where timber would be stored (metres); default the founder store. A woodshed preview passes its own door. */
  store?: { x: number; z: number };
  /** Wood per day the planned use needs; the answer says how many managed trees that takes. */
  demandPerDay?: number;
  /** M014: a planned building (dm rect): trees within the policy's building buffer of it count as protected. */
  footprint?: Rect;
  /** M014: trees its construction clears (left out of the answer). */
  clears?: string[];
}
export interface WoodlandStats {
  centre: { x: number; z: number }; radius: number;
  /** Where the route lengths are measured to. */
  store: { x: number; z: number };
  trees: number;
  byStage: Record<LifeStage, number>;
  bySpecies: Record<TreeSpecies, number>;
  /** May be felled now under the policy (ignoring the quota and demand). */
  harvestable: number;
  harvestableIds: string[];
  /** Kept by protection (owner marks, areas, buffers, veterans, kept snags, the grove). */
  protected: number;
  protectedIds: string[];
  /** Saplings, young trees, resprouting stumps, regrowing gaps and planting orders inside the area. */
  regrowing: number;
  standingTimber: number;
  harvestableTimber: number;
  /** Mean and longest walking route (m) from the harvestable trees to the store, over the real walking grid; null when none is reachable. */
  meanPathToStore: number | null;
  maxPathToStore: number | null;
  unreachable: number;
  /** Sustainable felling of the area's managed spots under the current policy. */
  sustainableTreesPerDay: number;
  sustainableWoodPerDay: number;
  /** Mean days from felling to fellable again. */
  rotationDays: number;
  /** Managed spots (trees and regrowing places not protected by place) the demand needs, and how many more than the area has. */
  spotsForDemand: number | null;
  regenerationShortfall: number | null;
  /** The felling allowance now (trees) and per day. */
  quotaTrees: number;
  policy: WoodPolicy;
  /** M014: trees that the planned building would put under the building buffer (and so protect). */
  newlyProtected: number;
}

const fieldCache = new WeakMap<NavGrid, Map<string, Int32Array>>();

/**
 * What the woodland around a point offers: which trees can be harvested and
 * which are protected, how far the woodcutter walks to the store, and how
 * much regeneration a planned demand needs. Pure query over sim state (no
 * writes), so the M014 placement preview can call it every frame.
 */
export function woodlandStats(world: World, q: WoodlandQuery): WoodlandStats | null {
  const h = world.homestead;
  if (!h || !isWoodlandHomestead(h)) return null;
  const w = h.woodland!;
  const r2 = q.radius * q.radius;
  const inArea = (e: Entity) => (e.x - q.x) ** 2 + (e.z - q.z) ** 2 <= r2;
  const lot = managedWoodland(world, h);
  const byStage = Object.fromEntries(CYCLE.concat(['stump']).map((s) => [s, 0])) as Record<LifeStage, number>;
  const bySpecies = Object.fromEntries(TREE_SPECIES.map((s) => [s, 0])) as Record<TreeSpecies, number>;
  let trees = 0, standingTimber = 0, harvestableTimber = 0, regrowing = 0;
  const harvestableIds: string[] = [], protectedIds: string[] = [];
  const store = q.store ?? { x: STORE_SPOT.x / DM, z: STORE_SPOT.z / DM };
  const cleared = new Set(q.clears ?? []);
  const fp = q.footprint;
  const nearNew = (e: Entity) => !!fp && w.policy.buffer > 0 && rectDistance([fp], e.x, e.z) < w.policy.buffer;
  let newlyProtected = 0;
  for (const m0 of lot.all) {
    if (!inArea(m0.e) || cleared.has(m0.e.id)) continue;
    // M014: a planned building's buffer protects the trees beside it, as the finished building will.
    const m = m0.eligible && nearNew(m0.e) ? { ...m0, eligible: false, protectedWhy: `within ${w.policy.buffer} m of the planned building` } : m0;
    if (m !== m0) newlyProtected++;
    const { life } = m;
    byStage[life.stage]++;
    if (life.present) { trees++; bySpecies[life.species]++; }
    const t = timberOf(life.species, life.stage);
    const left = m.e.harvestedOnce ? m.e.remaining : t?.total ?? 0;
    if (life.present) standingTimber += left;
    if (m.eligible) { harvestableIds.push(m.e.id); harvestableTimber += left; }
    if (m.protectedWhy) protectedIds.push(m.e.id);
    if (life.stage === 'sapling' || life.stage === 'young' || (life.stage === 'stump' && life.record?.sprout) || (life.stage === 'gap' && life.nextIn !== null)) regrowing++;
  }
  regrowing += w.orders.filter((o) => (o.x + 0.5 - q.x) ** 2 + (o.z + 0.5 - q.z) ** 2 <= r2).length;
  // Route lengths from the store over the walking grid (one flood fill, cached per grid and store cell).
  const grid = homesteadNav(world, h);
  let fields = fieldCache.get(grid);
  if (!fields) { fields = new Map(); fieldCache.set(grid, fields); }
  const fk = `${Math.floor(store.x)},${Math.floor(store.z)}`;
  let field = fields.get(fk);
  if (!field) { field = distanceField(grid, { x: Math.round(store.x * DM), z: Math.round(store.z * DM) }); fields.set(fk, field); }
  let sum = 0, n = 0, max = 0, unreachable = 0;
  for (const id of harvestableIds) {
    const e = world.entities.get(id)!;
    const goal = lifeGoal(world, e);
    let best = -1;
    const rc = Math.ceil(goal.reach / DM);
    for (let z = Math.floor(e.z) - rc; z <= Math.floor(e.z) + rc; z++) for (let x = Math.floor(e.x) - rc; x <= Math.floor(e.x) + rc; x++) {
      if (!grid.inside(x, z)) continue;
      const dx = x * DM + 5 - goal.x, dz = z * DM + 5 - goal.z;
      if (dx * dx + dz * dz > goal.reach * goal.reach) continue;
      const d = field[grid.index(x, z)];
      if (d >= 0 && (best < 0 || d < best)) best = d;
    }
    if (best < 0) { unreachable++; continue; }
    sum += best / 10; n++; max = Math.max(max, best / 10);
  }
  const yieldNow = sustainableYield(world, h, fp || cleared.size ? (e) => inArea(e) && !cleared.has(e.id) && !nearNew(e) : inArea);
  const meanTimber = yieldNow.treesPerDay > 0 ? yieldNow.woodPerDay / yieldNow.treesPerDay : TIMBER.spruce[w.policy.minStage].total;
  const rot = yieldNow.rotation || rotationDays('spruce', w.policy);
  const spotsForDemand = q.demandPerDay !== undefined ? Math.ceil(q.demandPerDay * rot / meanTimber) : null;
  return {
    centre: { x: q.x, z: q.z }, radius: q.radius, store, trees, byStage, bySpecies,
    harvestable: harvestableIds.length, harvestableIds, protected: protectedIds.length, protectedIds, regrowing,
    standingTimber, harvestableTimber,
    meanPathToStore: n ? Math.round((sum / n) * 10) / 10 : null, maxPathToStore: n ? max : null, unreachable,
    sustainableTreesPerDay: Math.round(yieldNow.treesPerDay * 100) / 100, sustainableWoodPerDay: Math.round(yieldNow.woodPerDay * 10) / 10,
    rotationDays: Math.round(rot * 10) / 10,
    spotsForDemand, regenerationShortfall: spotsForDemand !== null ? Math.max(0, spotsForDemand - yieldNow.spots) : null,
    quotaTrees: Math.floor(w.quota / QUOTA_TREE * 10) / 10, policy: { ...w.policy }, newlyProtected,
  };
}

export { createWoodland };
