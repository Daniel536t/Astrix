// W2: gathering, inventory and hand crafting in the wilderness scenario.
//
// Loose natural pickups (branches, loose stones, fibre plants, grass tufts,
// berry bushes, mushrooms) are authoritative records with an id, a location,
// a quantity and collection rules. They are generated per chunk as a pure
// function of (seed, generator, chunk) from their own random stream
// (seed + 7717), on their own id namespace (`p:<cx>,<cz>:<i>`), so the
// natural-entity generator (`generateEntityChunk`), its random sequence and
// its entity ids are untouched. Placement reads only base terrain: height,
// top material, slope, water and the existing forest and rock fields.
//
// Only a world with wilderness content v2 (`world.wild`) has pickups. A
// settlement world, and a W1 wilderness world until it is upgraded by the
// journaled `upgrade_wilderness` command, never sees them.
//
// What changes is saved: taken pickups (tombstones), partly taken ones, piles
// the player dropped, the carried items and tools, the equipped tool and
// hunger. Pickups do not replenish in W2. No three.js.
import {
  CHUNK_SIZE, CHUNKS_PER_SIDE, HALF, MAT, SEA_LEVEL, World, baseHeightAt, baseTopMaterialFor, baseWaterLevelAt,
  chunkOriginX, chunkOriginZ, forestScore, rockScore, surfaceAt, worldToChunkX, worldToChunkZ,
} from './world';
import { hash2i, mulberry32 } from './noise';
import { FellSnapshot, FellState, WILD_CONTENT_V3, createFell, fellFromSnapshot, fellSnapshot, stepFelling, validateFell } from './felling';
import { BuildSnapshot, BuildState, bagRefusal, buildFromSnapshot, buildSnapshot, createBuild, notePileTaken, pileTakeable, stepBuild, validateBuild } from './wild-build';

/**
 * Wilderness content versions. v1 (W1): no pickups, items or crafting. v2 (W2): this file. v3 (W3): physical
 * tree felling (sim/felling.ts). v4 (W4): build anywhere (sim/catalogue.ts, sim/wild-build.ts), planks, chests,
 * cooked food, the pickaxe, hammer and knife, and workbench recipes.
 */
export const WILD_CONTENT_V1 = 1 as const;
export const WILD_CONTENT_V2 = 2 as const;
export { WILD_CONTENT_V3 };
export const WILD_CONTENT_V4 = 4 as const;
export const LATEST_WILD_CONTENT = 4 as const;
export type WildContent = typeof WILD_CONTENT_V2 | typeof WILD_CONTENT_V3 | typeof WILD_CONTENT_V4;
export const isWildContent = (v: unknown): v is WildContent => v === WILD_CONTENT_V2 || v === 3 || v === 4;

export const PICKUP_KINDS = ['branch', 'loose_stone', 'fiber_plant', 'grass_tuft', 'berry_bush', 'mushroom'] as const;
export type PickupKind = (typeof PICKUP_KINDS)[number];
/** Carried count items. */
export const WILD_ITEMS = ['berries', 'branch', 'chest', 'cooked_mushroom', 'cord', 'fiber', 'grass', 'log', 'mushroom', 'plank', 'stone'] as const;
export type WildItem = (typeof WILD_ITEMS)[number];
/** W4 (content v4) items: made at the workbench and the campfire. */
export const V4_ITEMS: readonly WildItem[] = ['chest', 'cooked_mushroom', 'plank'];
export const TOOL_KINDS = ['hammer', 'knife', 'stone_axe', 'stone_pickaxe'] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];
/** W4 (content v4) tools: made at the workbench. */
export const V4_TOOLS: readonly ToolKind[] = ['hammer', 'knife', 'stone_pickaxe'];
/** A new tool's durability (uses): felling and cutting wear the axe, construction work the hammer or axe, workbench recipes the tool they name. */
export const TOOL_DURABILITY: Record<ToolKind, number> = { hammer: 80, knife: 40, stone_axe: 60, stone_pickaxe: 60 };

/** What one unit of a pickup gives. */
export const PICKUP_ITEM: Record<PickupKind, WildItem> = {
  branch: 'branch', loose_stone: 'stone', fiber_plant: 'fiber', grass_tuft: 'grass', berry_bush: 'berries', mushroom: 'mushroom',
};
export const ITEM_LABEL: Record<WildItem | ToolKind, string> = {
  berries: 'berries', branch: 'branch', cord: 'cord', fiber: 'plant fibre', grass: 'grass', log: 'log', mushroom: 'mushroom', stone: 'stone', stone_axe: 'stone axe',
  chest: 'wooden chest', cooked_mushroom: 'cooked mushroom', plank: 'plank', hammer: 'hammer', knife: 'knife', stone_pickaxe: 'stone pickaxe',
};
export const PICKUP_LABEL: Record<PickupKind, string> = {
  branch: 'branch', loose_stone: 'stone', fiber_plant: 'fibre plant', grass_tuft: 'grass', berry_bush: 'berries', mushroom: 'mushroom',
};

/** Carry weight per unit; the bag holds CARRY_CAPACITY in total (tools included). W3: a log weighs 9, so 1 to 3 at a time. */
export const ITEM_WEIGHT: Record<WildItem | ToolKind, number> = {
  berries: 1, branch: 2, cord: 1, fiber: 1, grass: 1, log: 9, mushroom: 1, stone: 2, stone_axe: 3,
  chest: 8, cooked_mushroom: 1, plank: 3, hammer: 3, knife: 1, stone_pickaxe: 4,
};
export const CARRY_CAPACITY = 30;
/** Reach from the player's reported position to a pickup (metres). */
export const PICKUP_REACH = 3.5;
/** A new stone axe's durability (uses). W2 has no use that wears it; W3 felling will. */
export const STONE_AXE_DURABILITY = 60;
/** Hunger: 0 is fed, 100 starving. Rises by 1 every HUNGER_TICKS (one tick = 2 s), so 1 per 30 s. No effect yet in W2. */
export const HUNGER_START = 25;
export const HUNGER_TICKS = 15;
export const FOOD_VALUE: Partial<Record<WildItem, number>> = { berries: 6, mushroom: 10, cooked_mushroom: 24 };
export const MAX_PILES = 512;

export type WildStation = 'hand' | 'workbench';
export interface WildRecipe {
  id: string;
  label: string;
  station: WildStation;
  input: Partial<Record<WildItem, number>>;
  /** W4: a tool that must be in the bag; it loses 1 durability per craft. */
  tool?: ToolKind;
  /** Count items made, or one tool. */
  output: { items?: Partial<Record<WildItem, number>>; tool?: ToolKind };
  /** W4: what the result is for, honestly (shown with the recipe). */
  note?: string;
}
/** Data-driven recipe catalogue. W4 adds the workbench station (content v4; craft within reach of a finished workbench). */
export const WILD_RECIPES: readonly WildRecipe[] = [
  { id: 'stone_axe', label: 'Stone axe', station: 'hand', input: { branch: 1, stone: 1, fiber: 2 }, output: { tool: 'stone_axe' } },
  { id: 'stone_axe_cord', label: 'Stone axe (cord binding)', station: 'hand', input: { branch: 1, stone: 1, cord: 1 }, output: { tool: 'stone_axe' } },
  { id: 'cord', label: 'Cord (twisted fibre)', station: 'hand', input: { fiber: 2 }, output: { items: { cord: 1 } } },
  { id: 'grass_cord', label: 'Cord (braided grass)', station: 'hand', input: { grass: 3 }, output: { items: { cord: 1 } } },
  { id: 'planks', label: 'Planks (split a log)', station: 'workbench', input: { log: 1 }, tool: 'stone_axe', output: { items: { plank: 2 } } },
  { id: 'stone_pickaxe', label: 'Stone pickaxe', station: 'workbench', input: { branch: 1, stone: 2, cord: 1 }, output: { tool: 'stone_pickaxe' },
    note: 'Needed for later buildings; breaking rock and mining arrive with W6.' },
  { id: 'hammer', label: 'Hammer', station: 'workbench', input: { branch: 1, stone: 1, cord: 1 }, output: { tool: 'hammer' } },
  { id: 'knife', label: 'Stone knife', station: 'workbench', input: { stone: 1, branch: 1, fiber: 1 }, output: { tool: 'knife' },
    note: 'A tool for later: it has no use yet. Butchering arrives with hunting (W8).' },
  { id: 'wooden_chest', label: 'Wooden chest', station: 'workbench', input: { plank: 4, cord: 1 }, tool: 'hammer', output: { items: { chest: 1 } } },
];
export const recipeById = (id: string): WildRecipe | undefined => WILD_RECIPES.find((r) => r.id === id);

export interface Pickup {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  z: number;
  /** Units when untouched. */
  qty: number;
  rot: number;
  variant: number;
}
/** A pile the player dropped: real items put back on the ground. */
export interface Pile { id: string; item: WildItem; qty: number; x: number; y: number; z: number }
export interface WildTool { id: string; kind: ToolKind; durability: number }

export interface WildState {
  content: WildContent;
  hunger: number;
  items: Record<string, number>;
  tools: WildTool[];
  equipped: string | null;
  /** Tombstones: generated pickups fully taken. */
  taken: Set<string>;
  /** Generated pickups partly taken: units left. */
  left: Map<string, number>;
  piles: Map<string, Pile>;
  /** Next id for tools, piles, trunks and stockpiles. */
  nextId: number;
  /** W3 (content v3): felling, trunks, stockpiles, events and the wilderness woodland. */
  fell?: FellState;
  /** W4 (content v4): building sites, finished buildings and the claimed home. */
  build?: BuildState;
}

export function createWildState(content: WildContent = WILD_CONTENT_V2, seed = 0, tick = 0): WildState {
  return { content, hunger: HUNGER_START, items: {}, tools: [], equipped: null,
    taken: new Set(), left: new Map(), piles: new Map(), nextId: 1,
    ...(content >= WILD_CONTENT_V3 ? { fell: createFell(seed, tick) } : {}), ...(content >= WILD_CONTENT_V4 ? { build: createBuild() } : {}) };
}

/** A content-v2 state gains W3 felling (v3), a v3 state W4 building (v4), through journaled `upgrade_wilderness`. */
export function upgradeWildState(w: WildState, seed: number, tick: number, to: WildContent = WILD_CONTENT_V3): void {
  if (!w.fell && to >= WILD_CONTENT_V3) w.fell = createFell(seed, tick);
  if (!w.build && to >= WILD_CONTENT_V4) w.build = createBuild();
  w.content = to;
}

export const PICKUP_ID = /^p:(\d{1,2}),(\d{1,2}):(\d{1,3})$/;
export const PILE_ID = /^d:\d{1,7}$/;
export const TOOL_ID = /^tool:\d{1,7}$/;

// ---------- generation (pure) ----------
const LATTICE = 4;
const chunkCache = new Map<string, Pickup[]>();
const CACHE_LIMIT = 2048;

/**
 * The generated pickups of a chunk: pure in (seed, generator, cx, cz). A 4 m
 * jittered lattice; every cell draws exactly five random numbers whatever it
 * places, so a cell's result never depends on its neighbours or load order.
 */
export function pickupsInChunk(seed: number, generatorVersion: number, cx: number, cz: number): Pickup[] {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) return [];
  const key = `${seed}:${generatorVersion}:${cx},${cz}`;
  const hit = chunkCache.get(key);
  if (hit) return hit;
  const rnd = mulberry32((hash2i(cx, cz, seed + 7717) * 4294967296) >>> 0);
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  const out: Pickup[] = [];
  const height = (x: number, z: number) => baseHeightAt(seed, generatorVersion, x, z);
  const wet = (x: number, z: number) => baseWaterLevelAt(seed, generatorVersion, x, z) > height(x, z);
  for (let gz = 0; gz < CHUNK_SIZE; gz += LATTICE) {
    for (let gx = 0; gx < CHUNK_SIZE; gx += LATTICE) {
      const jx = rnd(), jz = rnd(), roll = rnd(), qtyRoll = rnd(), rotRoll = rnd();
      const fx = Math.round((ox + gx + 0.5 + jx * (LATTICE - 1)) * 100) / 100, fz = Math.round((oz + gz + 0.5 + jz * (LATTICE - 1)) * 100) / 100;
      const x = Math.floor(fx), z = Math.floor(fz);
      const h = height(x, z);
      if (h <= SEA_LEVEL || wet(x, z)) continue;
      const slope = Math.max(Math.abs(h - height(x + 1, z)), Math.abs(h - height(x - 1, z)),
        Math.abs(h - height(x, z + 1)), Math.abs(h - height(x, z - 1)));
      const top = baseTopMaterialFor(seed, generatorVersion, x, z, h, slope);
      const nearWater = wet(x + 3, z) || wet(x - 3, z) || wet(x, z + 3) || wet(x, z - 3);
      const kind = chooseKind(top, slope, nearWater, forestScore(x, z, seed), rockScore(x, z, seed), roll);
      if (!kind) continue;
      out.push({
        id: `p:${cx},${cz}:${out.length}`, kind,
        x: fx, y: h, z: fz,
        qty: quantityOf(kind, qtyRoll), rot: Math.round(rotRoll * 628) / 100, variant: Math.floor(qtyRoll * 3) % 3,
      });
    }
  }
  if (chunkCache.size >= CACHE_LIMIT) chunkCache.delete(chunkCache.keys().next().value!);
  chunkCache.set(key, out);
  return out;
}

/** Geography: what lies loose on this ground, if anything. */
function chooseKind(top: number, slope: number, nearWater: boolean, forest: number, rocky: number, roll: number): PickupKind | null {
  if (top === MAT.STONE || top === MAT.GRAVEL) return roll < 0.30 ? 'loose_stone' : null;
  if (top === MAT.SAND) return roll < (nearWater ? 0.22 : 0.06) ? 'loose_stone' : null;
  if (top !== MAT.GRASS && top !== MAT.MOSS && top !== MAT.SOIL) return null;
  const woods = Math.min(1, Math.max(0, (forest - 0.25) / 0.4));
  const table: Array<[PickupKind, number]> = [
    // Fallen branches under and near trees.
    ['branch', forest > 0.25 ? 0.06 + 0.30 * woods : 0.012],
    // Loose stones on rocky ground, slopes and river banks.
    ['loose_stone', nearWater ? 0.10 : slope >= 2 ? 0.10 : rocky > 0.45 ? 0.07 : 0.025],
    // Fibre plants and grass tufts in open grass and meadow.
    ['fiber_plant', forest < 0.5 ? 0.09 : 0.02],
    ['grass_tuft', forest < 0.4 ? 0.08 : 0.02],
    // Berry bushes at the meadow and forest edge; mushrooms in the woods.
    ['berry_bush', forest > 0.15 && forest < 0.6 ? 0.035 : 0],
    ['mushroom', forest > 0.4 ? 0.03 : 0],
  ];
  let acc = 0;
  for (const [kind, p] of table) { acc += p; if (roll < acc) return kind; }
  return null;
}

function quantityOf(kind: PickupKind, r: number): number {
  switch (kind) {
    case 'branch': return r < 0.8 ? 1 : 2;
    case 'loose_stone': return 1;
    case 'fiber_plant': return r < 0.6 ? 2 : 3;
    case 'grass_tuft': return r < 0.5 ? 2 : 3;
    case 'berry_bush': return 2 + Math.floor(r * 3);
    case 'mushroom': return 1;
  }
}

/** The generated pickup with this id (whether or not it was taken). */
export function generatedPickup(seed: number, generatorVersion: number, id: string): Pickup | null {
  const m = PICKUP_ID.exec(id);
  if (!m) return null;
  return pickupsInChunk(seed, generatorVersion, Number(m[1]), Number(m[2]))[Number(m[3])] ?? null;
}

// ---------- live state ----------
export interface LivePickup { id: string; kind: PickupKind | 'pile'; item: WildItem; qty: number; x: number; y: number; z: number; rot: number; variant: number }

/** A pickup or pile that is still on the ground, with what is left of it. */
export function livePickup(world: World, id: string): LivePickup | null {
  const w = world.wild;
  if (!w) return null;
  const pile = w.piles.get(id);
  if (pile) return { id, kind: 'pile', item: pile.item, qty: pile.qty, x: pile.x, y: pile.y, z: pile.z, rot: 0, variant: 0 };
  if (w.taken.has(id)) return null;
  const p = generatedPickup(world.seed, world.params.generatorVersion, id);
  if (!p) return null;
  return { id, kind: p.kind, item: PICKUP_ITEM[p.kind], qty: w.left.get(id) ?? p.qty, x: p.x, y: p.y, z: p.z, rot: p.rot, variant: p.variant };
}

/** Live pickups and piles within `r` metres of (x, z), nearest first. */
export function pickupsNear(world: World, x: number, z: number, r: number): LivePickup[] {
  const w = world.wild;
  if (!w) return [];
  const out: Array<LivePickup & { d: number }> = [];
  const c0x = worldToChunkX(Math.floor(x - r)), c1x = worldToChunkX(Math.floor(x + r));
  const c0z = worldToChunkZ(Math.floor(z - r)), c1z = worldToChunkZ(Math.floor(z + r));
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    for (const p of pickupsInChunk(world.seed, world.params.generatorVersion, cx, cz)) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > r || w.taken.has(p.id)) continue;
      out.push({ id: p.id, kind: p.kind, item: PICKUP_ITEM[p.kind], qty: w.left.get(p.id) ?? p.qty, x: p.x, y: p.y, z: p.z, rot: p.rot, variant: p.variant, d });
    }
  }
  for (const pile of w.piles.values()) {
    const d = Math.hypot(pile.x - x, pile.z - z);
    if (d <= r) out.push({ id: pile.id, kind: 'pile', item: pile.item, qty: pile.qty, x: pile.x, y: pile.y, z: pile.z, rot: 0, variant: 0, d });
  }
  out.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
  return out.map(({ d: _d, ...p }) => p);
}

export function carriedWeight(w: WildState): number {
  let n = 0;
  for (const [k, v] of Object.entries(w.items)) n += (ITEM_WEIGHT[k as WildItem] ?? 0) * v;
  for (const t of w.tools) n += ITEM_WEIGHT[t.kind];
  return n;
}

export function equippedTool(world: World): WildTool | null {
  const w = world.wild;
  return w && w.equipped ? w.tools.find((t) => t.id === w.equipped) ?? null : null;
}

// ---------- rules (called only by journaled commands) ----------
export type WildResult<T> = { ok: true; value: T } | { ok: false; code: string; reasons: string[] };
const fail = (code: string, reason: string): { ok: false; code: string; reasons: string[] } => ({ ok: false, code, reasons: [reason] });
/** Player position in the command: integer decimetres. */
export interface At { x: number; z: number }

function wildOf(world: World): WildState | null { return world.wild ?? null; }

/**
 * Pick up a generated pickup or a pile. W4: a pile's units reserved for a
 * building site are left alone, unless the pickup is `forSite` that site: then
 * only its reserved units are taken, and they stay reserved for it in the bag.
 */
export function pickUp(world: World, id: string, at: At, forSite?: string): WildResult<{ item: WildItem; amount: number }> {
  const w = wildOf(world);
  if (!w) return fail('no_wild_content', 'this world has no loose pickups');
  const p = livePickup(world, id);
  if (!p) return fail('not_found', 'nothing to pick up there (already taken, or never there)');
  if (Math.hypot(p.x - at.x / 10, p.z - at.z / 10) > PICKUP_REACH) return fail('out_of_reach', `out of reach (${PICKUP_REACH} m)`);
  let qty = p.qty;
  if (p.kind === 'pile' && w.build) {
    const t = pileTakeable(world, id, forSite);
    if (!t.ok) return t;
    qty = t.n;
  } else if (forSite !== undefined) return fail('not_reserved', 'only a pile can hold materials reserved for a site');
  const room = CARRY_CAPACITY - carriedWeight(w);
  const amount = Math.min(qty, Math.floor(room / ITEM_WEIGHT[p.item]));
  if (amount <= 0) return fail('capacity', `your bag is full (${carriedWeight(w)}/${CARRY_CAPACITY})`);
  w.items[p.item] = (w.items[p.item] ?? 0) + amount;
  const rest = p.qty - amount;
  if (p.kind === 'pile') {
    if (rest > 0) w.piles.get(id)!.qty = rest; else w.piles.delete(id);
    if (w.build) notePileTaken(world, id, p.item, amount, forSite);
  } else if (rest > 0) w.left.set(id, rest);
  else { w.left.delete(id); w.taken.add(id); }
  return { ok: true, value: { item: p.item, amount } };
}

export function dropItems(world: World, item: WildItem, n: number, at: At): WildResult<{ pileId: string }> {
  const w = wildOf(world);
  if (!w) return fail('no_wild_content', 'this world has no items yet');
  if ((w.items[item] ?? 0) < n || n < 1) return fail('missing', `you carry ${w.items[item] ?? 0} ${ITEM_LABEL[item]}`);
  // W4: items reserved for a building site stay in the bag (cancel the site to release them).
  const held = w.build ? bagRefusal(world, item, n, 'drop them') : null;
  if (held) return { ok: false, ...held };
  if (w.piles.size >= MAX_PILES) return fail('too_many_piles', 'too many dropped piles in this world');
  if (Math.abs(at.x) > HALF * 10 - 10 || Math.abs(at.z) > HALF * 10 - 10) return fail('out_of_world', 'outside the world');
  w.items[item] -= n;
  if (w.items[item] === 0) delete w.items[item];
  const pileId = `d:${w.nextId++}`;
  const x = at.x / 10, z = at.z / 10;
  w.piles.set(pileId, { id: pileId, item, qty: n, x, y: surfaceAt(world, Math.floor(x), Math.floor(z)), z });
  return { ok: true, value: { pileId } };
}

export function craft(world: World, recipeId: string, atStation = false): WildResult<{ spent: Record<string, number>; made: Record<string, number>; toolId?: string }> {
  const w = wildOf(world);
  if (!w) return fail('no_wild_content', 'nothing to craft with in this world yet');
  const r = recipeById(recipeId);
  if (!r) return fail('unknown_recipe', `no recipe ${recipeId}`);
  if (r.station !== 'hand' && !atStation) return fail('station', `${r.label} is made at a ${r.station}: build one and stand by it`);
  const tool = r.tool ? w.tools.filter((t) => t.kind === r.tool && t.durability > 0).sort((a, b) => b.durability - a.durability)[0] : undefined;
  if (r.tool && !tool) return fail('no_tool', `${r.label} needs a ${ITEM_LABEL[r.tool]} in your bag`);
  const missing = Object.entries(r.input).filter(([k, n]) => (w.items[k] ?? 0) < (n ?? 0))
    .map(([k, n]) => `${(n ?? 0) - (w.items[k] ?? 0)} ${ITEM_LABEL[k as WildItem]}`);
  if (missing.length) return fail('missing', `missing ${missing.join(', ')}`);
  // W4: reserved materials belong to their building site.
  for (const [k, n] of Object.entries(r.input)) {
    const held = w.build ? bagRefusal(world, k, n ?? 0, `craft ${r.label.toLowerCase()}`) : null;
    if (held) return { ok: false, ...held };
  }
  let delta = 0;
  for (const [k, n] of Object.entries(r.input)) delta -= ITEM_WEIGHT[k as WildItem] * (n ?? 0);
  for (const [k, n] of Object.entries(r.output.items ?? {})) delta += ITEM_WEIGHT[k as WildItem] * (n ?? 0);
  if (r.output.tool) delta += ITEM_WEIGHT[r.output.tool];
  if (carriedWeight(w) + delta > CARRY_CAPACITY) return fail('capacity', 'your bag cannot hold the result');
  const spent: Record<string, number> = {};
  for (const [k, n] of Object.entries(r.input)) {
    w.items[k] -= n ?? 0;
    if (w.items[k] === 0) delete w.items[k];
    spent[k] = n ?? 0;
  }
  const made: Record<string, number> = {};
  for (const [k, n] of Object.entries(r.output.items ?? {})) { w.items[k] = (w.items[k] ?? 0) + (n ?? 0); made[k] = n ?? 0; }
  let toolId: string | undefined;
  if (r.output.tool) {
    toolId = `tool:${w.nextId++}`;
    w.tools.push({ id: toolId, kind: r.output.tool, durability: TOOL_DURABILITY[r.output.tool] });
    made[r.output.tool] = 1;
  }
  if (tool) tool.durability -= 1;
  return { ok: true, value: { spent: sortBag(spent), made: sortBag(made), ...(toolId ? { toolId } : {}) } };
}

export function equip(world: World, item: ToolKind | 'hands'): WildResult<{ toolId: string | null }> {
  const w = wildOf(world);
  if (!w) return fail('no_wild_content', 'no tools in this world yet');
  if (item === 'hands') { w.equipped = null; return { ok: true, value: { toolId: null } }; }
  // W4 (content v4): with several of a kind, the one with most durability left (a broken axe is not picked over a new one).
  const t = w.build ? w.tools.filter((x) => x.kind === item).sort((a, b) => b.durability - a.durability)[0] : w.tools.find((x) => x.kind === item);
  if (!t) return fail('missing', `you have no ${ITEM_LABEL[item]}`);
  w.equipped = t.id;
  return { ok: true, value: { toolId: t.id } };
}

export function eat(world: World, item: WildItem): WildResult<{ hunger: number }> {
  const w = wildOf(world);
  if (!w) return fail('no_wild_content', 'nothing to eat in this world yet');
  const value = FOOD_VALUE[item];
  if (!value) return fail('not_food', `${ITEM_LABEL[item]} is not food`);
  if ((w.items[item] ?? 0) < 1) return fail('missing', `you have no ${ITEM_LABEL[item]}`);
  const held = w.build ? bagRefusal(world, item, 1, 'eat them') : null;
  if (held) return { ok: false, ...held };
  w.items[item] -= 1;
  if (w.items[item] === 0) delete w.items[item];
  w.hunger = Math.max(0, w.hunger - value);
  return { ok: true, value: { hunger: w.hunger } };
}

/** One world tick of wilderness life (hunger; W3: the woodland's stumps and regrowth). */
export function stepWild(world: World, tick: number): void {
  const w = world.wild;
  if (w && tick % HUNGER_TICKS === 0) w.hunger = Math.min(100, w.hunger + 1);
  if (w?.fell) stepFelling(world, tick);
  if (w?.build) stepBuild(world);
}

function sortBag(bag: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(bag).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
}

// ---------- snapshot form ----------
export interface WildSnapshot {
  build?: BuildSnapshot;
  content: WildContent;
  equipped?: string;
  fell?: FellSnapshot;
  hunger: number;
  items: Record<string, number>;
  left: Record<string, number>;
  nextId: number;
  piles: Pile[];
  taken: string[];
  tools: WildTool[];
}

export function wildSnapshot(w: WildState): WildSnapshot {
  return {
    ...(w.build ? { build: buildSnapshot(w.build) } : {}),
    content: w.content,
    ...(w.equipped ? { equipped: w.equipped } : {}),
    ...(w.fell ? { fell: fellSnapshot(w.fell) } : {}),
    hunger: w.hunger,
    items: sortBag(w.items),
    left: Object.fromEntries([...w.left.entries()].sort(([a], [b]) => a.localeCompare(b))),
    nextId: w.nextId,
    piles: [...w.piles.values()].sort((a, b) => a.id.localeCompare(b.id)).map((p) => ({ id: p.id, item: p.item, qty: p.qty, x: p.x, y: p.y, z: p.z })),
    taken: [...w.taken].sort((a, b) => a.localeCompare(b)),
    tools: [...w.tools].map((t) => ({ id: t.id, kind: t.kind, durability: t.durability })),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const uintMax = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Strict: the canonical form only (the caller compares bytes). Throws on anything else. */
export function validateWildSnapshot(value: unknown, tick = 0): WildSnapshot {
  const bad = (what: string): never => { throw new Error(`snapshot wilderness state: invalid ${what}`); };
  if (!isObj(value) || !isWildContent(value.content)) bad('content');
  const v = value as Record<string, unknown>;
  const v3 = (v.content as number) >= WILD_CONTENT_V3, v4 = v.content === WILD_CONTENT_V4;
  if (v3 !== (v.fell !== undefined)) bad('felling block');
  if (v4 !== (v.build !== undefined)) bad('building block');
  // Logs exist only with felling (content v3); planks, chests and cooked food with building (v4).
  const itemOk = (k: unknown) => WILD_ITEMS.includes(k as WildItem) && (v3 || k !== 'log') && (v4 || !V4_ITEMS.includes(k as WildItem));
  if (!uintMax(v.hunger, 100) || !uintMax(v.nextId, 9_999_999) || v.nextId < 1) bad('counters');
  if (!isObj(v.items) || !isObj(v.left) || !Array.isArray(v.piles) || !Array.isArray(v.taken) || !Array.isArray(v.tools)) bad('fields');
  const items: Record<string, number> = {};
  for (const [k, n] of Object.entries(v.items as Record<string, unknown>)) {
    if (!itemOk(k) || !uintMax(n, 10_000) || n < 1) bad('item');
    items[k] = n as number;
  }
  const taken = v.taken as unknown[];
  if (taken.length > 500_000) bad('tombstones');
  const takenSet = new Set<string>();
  for (const id of taken) {
    if (typeof id !== 'string' || !PICKUP_ID.test(id) || takenSet.has(id)) bad('tombstone');
    takenSet.add(id as string);
  }
  const left: Record<string, number> = {};
  for (const [k, n] of Object.entries(v.left as Record<string, unknown>)) {
    if (!PICKUP_ID.test(k) || takenSet.has(k) || !uintMax(n, 100) || n < 1) bad('partial pickup');
    left[k] = n as number;
  }
  if ((v.piles as unknown[]).length > MAX_PILES) bad('piles');
  const piles: Pile[] = [];
  const pileIds = new Set<string>();
  for (const p of v.piles as unknown[]) {
    if (!isObj(p) || typeof p.id !== 'string' || !PILE_ID.test(p.id) || pileIds.has(p.id) || Number(p.id.slice(2)) >= (v.nextId as number)
      || !itemOk(p.item) || !uintMax(p.qty, 10_000) || p.qty < 1
      || !fin(p.x) || !fin(p.y) || !fin(p.z) || Math.abs(p.x) >= HALF || Math.abs(p.z) >= HALF) bad('pile');
    const q = p as unknown as Pile;
    pileIds.add(q.id);
    piles.push({ id: q.id, item: q.item, qty: q.qty, x: q.x, y: q.y, z: q.z });
  }
  const tools: WildTool[] = [];
  const toolIds = new Set<string>();
  for (const t of v.tools as unknown[]) {
    if (!isObj(t) || typeof t.id !== 'string' || !TOOL_ID.test(t.id) || toolIds.has(t.id) || Number(t.id.slice(5)) >= (v.nextId as number)
      || !TOOL_KINDS.includes(t.kind as ToolKind) || (!v4 && V4_TOOLS.includes(t.kind as ToolKind)) || !uintMax(t.durability, TOOL_DURABILITY[t.kind as ToolKind])) bad('tool');
    const q = t as unknown as WildTool;
    toolIds.add(q.id);
    tools.push({ id: q.id, kind: q.kind, durability: q.durability });
  }
  if (tools.length > 64) bad('tools');
  if (v.equipped !== undefined && (typeof v.equipped !== 'string' || !toolIds.has(v.equipped))) bad('equipped tool');
  const fell = v3 ? validateFell(v.fell, tick, v.nextId as number) : undefined;
  const build = v4 ? validateBuild(v.build, tick, v.nextId as number, (k) => itemOk(k), { items, piles }) : undefined;
  const s: WildSnapshot = {
    ...(build ? { build } : {}),
    content: v.content as WildContent,
    ...(v.equipped !== undefined ? { equipped: v.equipped as string } : {}),
    ...(fell ? { fell } : {}),
    hunger: v.hunger as number, items, left, nextId: v.nextId as number, piles, taken: taken as string[], tools,
  };
  const weight = carriedWeight(wildFromSnapshot(s));
  if (weight > CARRY_CAPACITY) bad('carried weight');
  return s;
}

export function wildFromSnapshot(s: WildSnapshot): WildState {
  return {
    content: s.content, ...(s.fell ? { fell: fellFromSnapshot(s.fell) } : {}), ...(s.build ? { build: buildFromSnapshot(s.build) } : {}), hunger: s.hunger, items: { ...s.items },
    tools: s.tools.map((t) => ({ ...t })), equipped: s.equipped ?? null,
    taken: new Set(s.taken), left: new Map(Object.entries(s.left)),
    piles: new Map(s.piles.map((p) => [p.id, { ...p }])), nextId: s.nextId,
  };
}
