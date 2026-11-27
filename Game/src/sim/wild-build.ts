// W4: build anywhere in the wilderness (wilderness content v4).
//
// The player picks a building from the catalogue (sim/catalogue.ts) and marks
// it out anywhere the terrain and placement rules allow, within reach of where
// they stand. Placing is the player's approval: there is one actor, who is
// both owner and builder.
//
// Reservations (the shared ledger in sim/reservation.ts, as M014 uses it):
// placing reserves everything the building needs, in full, from free
// materials in the bag ('bag'), in dropped piles within RESERVE_REACH of the
// footprint ('d:N') and in finished storage buildings within RESERVE_REACH
// ('b:N'), in that order. If the free materials do not cover the whole
// building, placement is refused and says what is missing; no site is ever
// created underfunded. Reserved items stay where they are and keep their
// identity, count and place; only the site may use them. Crafting, eating,
// fuelling, cooking, dropping, storing, other sites, plain pickups from a
// pile and plain withdrawals from storage see only free = held - reserved.
// Reserved items move only on purpose and keep their reservation: a pickup
// or a withdrawal "for" the site moves it into the bag; a death moves the
// bag's reserved items into the piles dropped where the character died.
//
// Delivery (`deliver_site`) moves reserved items from a source to the site:
// from the bag, or from a pile or storage within SITE_REACH of the site; from
// further away the player carries them (pick up / take "for" the site).
// Content v5 (owner phone report 1, a campfire stuck with its branches
// reserved in three piles while the bag held eight free ones): a delivery
// from the bag may name `swap`; then free units of the same item in the bag
// are delivered in place of the site's reservations elsewhere, and those
// reservations are released where the items lie (farthest from the site
// first). The outcome records what was released, per source. Nothing moves
// but the delivered units, from the bag to the site. The
// player then does the work personally (`build_work`, one journaled swing at a
// time, rate-limited with the axe swings, by hand or with the tool the
// catalogue names). A stage's work needs that stage's materials delivered; when
// the stage completes they are consumed (built in). So at every moment
// reserved + delivered + consumed = the building's materials, and a finished
// building has consumed exactly its materials (snapshot validation checks it).
// Cancelling an unfinished site releases its reservations (nothing moves) and
// puts its delivered, unconsumed materials on the ground at the site as piles;
// consumed materials are gone with the stage they were built into.
//
// Finished buildings work in the simulation:
//  - lean-to: a shelter the player can claim (`claim_shelter`): the claimed
//    lean-to is home (the Home return goes there) and the respawn point;
//  - campfire: burns fuel over time (`fuel_fire`); while lit it cooks raw
//    mushrooms into cooked ones (`cook`). It has no warmth effect: there is no
//    temperature, weather or cold exposure yet;
//  - workbench: a crafting station (station recipes in sim/gathering.ts);
//  - log store and storage shed: hold items (`store_items`, `take_items`)
//    up to a weight capacity; logs put in record LOGS_DELIVERED.
//
// Death and respawn: the character is player-local physics, so a death is
// reported as a journaled `died` (cause, and where the character last stood
// on dry ground) that the simulation checks against the world (dry ground
// with water within DROWN_REACH) and the state before it (no death already
// pending). It records the death, and every carried item drops there as piles
// (recoverable; reservations follow them); tools stay in hand; hunger is
// unchanged; nothing is restored. While a death is pending only `respawn` (and
// time) is accepted. `respawn` names where to wake: the claimed lean-to, which
// must be the claimed home, finished and intact (door step dry and clear), or
// the spawn banner's spot. A refused lean-to respawn is answered by a
// `respawn` to the spawn; the outcome records the landing point exactly.
//
// Integer and fixed-decimal state; no randomness; no three.js.
import type { Entity, World } from './world';
import { HALF, chunkKey, ensureChunk, surfaceAt, waterDepthAt, worldToChunkX, worldToChunkZ } from './world';
import type { NavGrid } from './nav';
import { distanceField, emptyFeatures, navGrid } from './nav';
import { CHARACTER_RADIUS } from './character';
import {
  BUILD_CATALOGUE, BuildingDef, MATERIAL_LABEL, SMELT_RECIPES, SolidBox, buildingDef, materialUnavailable, smeltRecipe,
} from './catalogue';
import { DEPOSIT_LABEL, typedDepositsNear } from './deposits';
import {
  PlacementCheck, checkEntranceOpen, checkFences, checkGround, checkNatural, checkTrees, clearGrowth, entranceRoutes,
  footprintCells, footprintEntrance, footprintSize, inZoneOf,
} from './placement';
import type { At, WildItem, WildResult, WildState } from './gathering';
import { ITEM_LABEL, ITEM_WEIGHT, MAX_PILES, carriedWeight, carryCapacity, pickupsNear } from './gathering';
import type { FellEvent } from './felling';
import { DIRS16, SWINGS_PER_TICK, noteEvent, trunkDistance } from './felling';
import type { Bag, ReservationPlan, ReservationSource } from './reservation';
import { addToBag, freeOf, planReservation, reservedTotal, reservedTotals, sortedBag } from './reservation';
import { wildernessSpawn } from './wilderness';

const DIR = (i: number) => DIRS16[i];

/** Reach (m) from the player to the nearest point of a footprint when placing it. */
export const PLACE_REACH = 8;
/** Reach (m) from the player to the nearest point of a footprint to deliver, work, claim, cook or store. */
export const SITE_REACH = 3.5;
export const MAX_WILD_SITES = 32;
/** Campfire fuel cap (ticks; 2 s each: 30 min). */
export const MAX_FUEL = 900;
/** Piles and storage within this distance (m) of a footprint can fund it at placement. */
export const RESERVE_REACH = 24;
/** A drowning is recorded only where water lies within this distance (m) of the last dry spot. */
export const DROWN_REACH = 6;
/** What the campfire cooks. */
/** What the campfire cooks (W8: raw meat, which exists only from wilderness content v9). */
export const COOKS: Partial<Record<WildItem, WildItem>> = { mushroom: 'cooked_mushroom', raw_meat: 'cooked_meat' };
export const SITE_ID = /^b:\d{1,7}$/;
/** Reservation sources: the bag, a dropped pile, a finished storage building. */
export const SOURCE_ID = /^(bag|d:\d{1,7}|b:\d{1,7})$/;

export type SiteState = 'planned' | 'building' | 'done';
export interface WildSite {
  id: string; kind: string; x: number; z: number; rot: number;
  /** Floor level: the highest ground in the footprint at placement (m). */
  y: number;
  state: SiteState;
  /** Materials held for this site, by source ('bag', 'd:N', 'b:N'), still in the source. */
  reserved: Record<string, Bag>;
  /** Materials at the site, not yet built in. */
  delivered: Bag;
  /** Materials built into finished stages. */
  consumed: Bag;
  /** Index of the stage being worked (stages.length when done) and swings into it. */
  stage: number; work: number;
  placed: number; done?: number;
  /** Campfire: ticks of burning left. */
  fuel?: number;
  /** Storage: what it holds. */
  stock?: Bag;
  /** W6 smelter: the batch in it (its charge was taken from the bag when it started), if any. */
  job?: SmeltJob;
}
/** A smelting batch: the recipe, the tick it started and the tick it is done, and the inputs it holds (consumed by it). */
export interface SmeltJob { recipe: string; start: number; end: number; charge: Bag }
/** A recorded death not yet woken from. `x`, `z`: where the character last stood on dry ground (dm). */
export interface DeathRecord { cause: 'drowned'; x: number; z: number; tick: number }
export interface BuildState {
  sites: Map<string, WildSite>;
  /** The claimed lean-to (home and respawn point), if any. */
  home: string | null;
  /** A death waiting for its respawn. */
  death: DeathRecord | null;
}

export function createBuild(): BuildState { return { sites: new Map(), home: null, death: null }; }

const fail = (code: string, reason: string): { ok: false; code: string; reasons: string[] } => ({ ok: false, code, reasons: [reason] });
const tickOf = (world: World) => world.life?.tick ?? 0;
const label = (k: string) => MATERIAL_LABEL[k] ?? ITEM_LABEL[k as WildItem] ?? k;
const sortBag = sortedBag;
const bagText = (b: Record<string, number>) => Object.entries(b).map(([k, n]) => `${n} ${label(k)}`).join(', ');
const sortSources = (r: Record<string, Bag>): Record<string, Bag> =>
  Object.fromEntries(Object.entries(r).map(([k, b]) => [k, sortBag(b)] as const).filter(([, b]) => Object.keys(b).length).sort(([a], [b]) => a.localeCompare(b)));

// ---------- geometry ----------

export function siteCellsOf(s: Pick<WildSite, 'kind' | 'x' | 'z' | 'rot'>): { x0: number; z0: number; x1: number; z1: number } {
  const d = buildingDef(s.kind)!;
  return footprintCells(d.footprint.w, d.footprint.d, s.x, s.z, s.rot);
}
export function siteEntranceOf(s: Pick<WildSite, 'kind' | 'x' | 'z' | 'rot'>): { x: number; z: number } {
  const d = buildingDef(s.kind)!;
  return footprintEntrance(d.footprint.w, d.footprint.d, s.x, s.z, s.rot);
}
export function siteSizeOf(kind: string, rot: number): { w: number; d: number } {
  const d = buildingDef(kind)!;
  return footprintSize(d.footprint.w, d.footprint.d, rot);
}
/** Distance (m) from (px, pz) to the nearest point of a rect of cells. */
export function rectDistance(c: { x0: number; z0: number; x1: number; z1: number }, px: number, pz: number): number {
  const dx = Math.max(c.x0 - px, 0, px - c.x1), dz = Math.max(c.z0 - pz, 0, pz - c.z1);
  return Math.hypot(dx, dz);
}
/** Footprint-local box (door at +z, rot 0) to world metres for a site. */
export function solidRect(s: Pick<WildSite, 'x' | 'z' | 'rot' | 'kind'>, b: SolidBox): { x0: number; z0: number; x1: number; z1: number } {
  const d = buildingDef(s.kind)!;
  const W = d.footprint.w, D = d.footprint.d;
  // Rotation k turns the door from +z to +x (1), -z (2), -x (3).
  let r: { x0: number; z0: number; x1: number; z1: number };
  switch (s.rot) {
    case 1: r = { x0: b.z0, x1: b.z1, z0: W - b.x1, z1: W - b.x0 }; break;
    case 2: r = { x0: W - b.x1, x1: W - b.x0, z0: D - b.z1, z1: D - b.z0 }; break;
    case 3: r = { x0: D - b.z1, x1: D - b.z0, z0: b.x0, z1: b.x1 }; break;
    default: r = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
  }
  return { x0: s.x + r.x0, x1: s.x + r.x1, z0: s.z + r.z0, z1: s.z + r.z1 };
}

/** Where the player stands to use a site, and where they wake at a claimed lean-to (m): the middle of the door step. */
export function siteSpotOf(s: Pick<WildSite, 'kind' | 'x' | 'z' | 'rot'>): { x: number; z: number } {
  const e = siteEntranceOf(s);
  return { x: e.x + 0.5, z: e.z + 0.5 };
}

// ---------- catalogue state ----------

/** Why a building cannot be chosen yet (empty: it can). Materials the player lacks are not a lock: they are delivered later. */
export function lockReasons(world: World, d: BuildingDef): string[] {
  const w = world.wild, b = w?.build;
  const out: string[] = [];
  const content = w?.content ?? 0;
  if (!d.implemented) out.push(`arrives with a later milestone (${d.milestone ?? 'later'})`);
  if (d.minContent && content < d.minContent) out.push(`arrives with wilderness content v${d.minContent} (W6 mining): this world has not been upgraded yet`);
  for (const k of Object.keys(d.materials)) { const why = materialUnavailable(k, content); if (why) out.push(`needs ${label(k)} (not obtainable yet: ${why})`); }
  for (const p of d.prerequisites.buildings) {
    if (![...(b?.sites.values() ?? [])].some((s) => s.kind === p && s.state === 'done')) out.push(`needs a finished ${buildingDef(p)?.label.toLowerCase() ?? p}`);
  }
  for (const t of d.prerequisites.tools) {
    if (!w?.tools.some((x) => x.kind === t)) out.push(`needs a ${label(t).replace('_', ' ')} (craft it at a workbench)`);
  }
  return out;
}

// ---------- the reservation ledger (sim/reservation.ts) ----------

/** Sites whose reservations are live (unfinished ones; a finished site holds nothing). */
function liveSites(world: World): WildSite[] {
  return [...(world.wild?.build?.sites.values() ?? [])].filter((s) => s.state !== 'done').sort((a, b) => a.id.localeCompare(b.id));
}
/** What a source holds of an item now (bag, pile or storage). */
export function heldIn(world: World, source: string, item: string): number {
  const w = world.wild;
  if (!w) return 0;
  if (source === 'bag') return w.items[item] ?? 0;
  if (source.startsWith('d:')) { const p = w.piles.get(source); return p && p.item === item ? p.qty : 0; }
  const st = w.build?.sites.get(source);
  return st && st.state === 'done' ? st.stock?.[item] ?? 0 : 0;
}
/** Reserved in a source for live sites (optionally leaving one site out). */
export function reservedIn(world: World, source: string, item: string, exceptSite?: string): number {
  return reservedTotal(liveSites(world).filter((s) => s.id !== exceptSite).map((s) => s.reserved[source] ?? {}), item);
}
/** What anyone but the reserving sites may use from a source. */
export function freeIn(world: World, source: string, item: string): number {
  return freeOf(heldIn(world, source, item), reservedIn(world, source, item));
}
/** Free units of an item in the bag: carried minus reserved for sites. */
export function freeInBag(world: World, item: string): number { return freeIn(world, 'bag', item); }
/** Everything reserved, by item (for the HUD and the bag panel). */
export function reservedTotalsIn(world: World, source?: string): Bag {
  return reservedTotals(liveSites(world).flatMap((s) => Object.entries(s.reserved).filter(([k]) => !source || k === source).map(([, b]) => b)));
}
/** Which sites hold reservations in a source (ids, sorted), and how much of an item. */
export function reservationsInSource(world: World, source: string): Array<{ siteId: string; kind: string; bag: Bag }> {
  return liveSites(world).filter((s) => s.reserved[source]).map((s) => ({ siteId: s.id, kind: s.kind, bag: { ...s.reserved[source] } }));
}
/** Why `n` of an item cannot leave the bag for another use, or null when they are free. */
export function bagRefusal(world: World, item: string, n: number, use: string): { code: string; reasons: string[] } | null {
  const held = heldIn(world, 'bag', item), free = freeInBag(world, item);
  if (held < n) return { code: 'missing', reasons: [`you carry ${held} ${label(item)}`] };
  if (free < n) {
    const who = reservationsInSource(world, 'bag').filter((r) => r.bag[item]).map((r) => buildingDef(r.kind)!.label.toLowerCase());
    return { code: 'reserved', reasons: [`${held - free} of your ${held} ${label(item)} are reserved for your ${[...new Set(who)].join(' and ')} site: they cannot be used to ${use} (cancel the site to release them)`] };
  }
  return null;
}

/** The sources that can fund a footprint, in the order they are used: the bag, piles near it, storage near it. */
export function fundingSources(world: World, cells: { x0: number; z0: number; x1: number; z1: number }): ReservationSource[] {
  const w = world.wild;
  if (!w) return [];
  const out: ReservationSource[] = [{ id: 'bag', free: (k) => freeIn(world, 'bag', k) }];
  const piles = [...w.piles.values()].map((p) => ({ id: p.id, d: rectDistance(cells, p.x, p.z) })).filter((p) => p.d <= RESERVE_REACH)
    .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
  for (const p of piles) out.push({ id: p.id, free: (k) => freeIn(world, p.id, k) });
  const stores = [...(w.build?.sites.values() ?? [])].filter((s) => s.state === 'done' && buildingDef(s.kind)!.function.kind === 'storage')
    .map((s) => ({ id: s.id, d: rectDistance(cells, (siteCellsOf(s).x0 + siteCellsOf(s).x1) / 2, (siteCellsOf(s).z0 + siteCellsOf(s).z1) / 2) }))
    .filter((s) => s.d <= RESERVE_REACH).sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
  for (const st of stores) out.push({ id: st.id, free: (k) => freeIn(world, st.id, k) });
  return out;
}
/** Can the building's whole material list be reserved for this footprint now? */
export function fundingFor(world: World, d: BuildingDef, cells: { x0: number; z0: number; x1: number; z1: number }): ReservationPlan & { ok: boolean } {
  const plan = planReservation(d.materials, fundingSources(world, cells));
  return { ...plan, ok: Object.keys(plan.short).length === 0 };
}

/** Free materials the player could reserve now against what the building needs (for the menu; piles and storage near the player count). */
export function affordability(world: World, d: BuildingDef, near?: { x: number; z: number }): { need: Record<string, number>; have: Record<string, number>; enough: boolean } {
  const have: Record<string, number> = {};
  const p = near ?? null;
  const sources = p ? fundingSources(world, { x0: p.x, z0: p.z, x1: p.x, z1: p.z }) : [{ id: 'bag', free: (k: string) => freeInBag(world, k) }];
  for (const k of Object.keys(d.materials)) have[k] = sources.reduce((n, s) => n + s.free(k), 0);
  return { need: { ...d.materials }, have, enough: Object.entries(d.materials).every(([k, n]) => (have[k] ?? 0) >= n) };
}

// ---------- the placement validator (preview and command) ----------

export interface WildCheck extends PlacementCheck {
  locked: string[];
  /** Walking distance (m) from the entrance to where the player stands, or null. */
  routeToPlayer: number | null;
  /** What placing would reserve, per source, or what is missing (null: not checked). */
  funding: (ReservationPlan & { ok: boolean }) | null;
  /** The footprint would cover the player or cut them off (refused). */
  traps: boolean;
}

const WINDOW = 16;
/** The local walking window around a footprint: snapped so nearby previews share one cached grid. */
export function siteWindow(cells: { x0: number; z0: number; x1: number; z1: number }): { ox: number; oz: number; w: number; h: number } {
  const cx = Math.floor((cells.x0 + cells.x1) / 2), cz = Math.floor((cells.z0 + cells.z1) / 2);
  const ox = Math.max(-HALF, Math.floor(cx / WINDOW) * WINDOW - 24), oz = Math.max(-HALF, Math.floor(cz / WINDOW) * WINDOW - 24);
  return { ox, oz, w: Math.min(64, HALF - ox), h: Math.min(64, HALF - oz) };
}

/** The window's walking grid, with the player's existing sites as building blocks. Generates the window's chunks first (replay does too). */
export function windowGrid(world: World, region: { ox: number; oz: number; w: number; h: number }, ignoreId?: string): NavGrid {
  for (let cz = worldToChunkZ(region.oz); cz <= worldToChunkZ(region.oz + region.h - 1); cz++) {
    for (let cx = worldToChunkX(region.ox); cx <= worldToChunkX(region.ox + region.w - 1); cx++) ensureChunk(world, cx, cz);
  }
  const f = emptyFeatures();
  for (const s of [...(world.wild?.build?.sites.values() ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    if (s.id === ignoreId) continue;
    const c = siteCellsOf(s);
    if (c.x1 < region.ox || c.x0 > region.ox + region.w || c.z1 < region.oz || c.z0 > region.oz + region.h) continue;
    f.blocks.push({ ...c, reason: 'building', id: s.id });
  }
  f.key = `wild:${f.blocks.map((b) => `${b.id}@${b.x0},${b.z0},${b.x1},${b.z1}`).join(';')}`;
  return navGrid(world, region, f);
}

/** Trees whose trunk lies in or next to the footprint (sorted ids). */
function treesAround(world: World, cells: { x0: number; z0: number; x1: number; z1: number }): Entity[] {
  const out: Entity[] = [];
  for (let cz = worldToChunkZ(cells.z0 - 3); cz <= worldToChunkZ(cells.z1 + 3); cz++) {
    for (let cx = worldToChunkX(cells.x0 - 3); cx <= worldToChunkX(cells.x1 + 3); cx++) {
      for (const id of world.entityChunks.get(chunkKey(cx, cz)) ?? []) {
        const e = world.entities.get(id);
        if (e && e.kind.startsWith('styl_tree_') && !world.entityRemovals.has(id)) out.push(e);
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const overlap = (a: { x0: number; z0: number; x1: number; z1: number }, b: { x0: number; z0: number; x1: number; z1: number }, gap = 0) =>
  a.x0 < b.x1 + gap && a.x1 + gap > b.x0 && a.z0 < b.z1 + gap && a.z1 + gap > b.z0;

/**
 * Can a building of this kind go here, turned `rot` quarter turns, footprint
 * min corner (x, z), placed by a player standing at `at` (dm)? The preview
 * and `place_site` both call this.
 */
export function checkWildSite(world: World, kind: string, x: number, z: number, rot: number, at: At | null, ignoreId?: string,
  opts: { funding?: boolean } = {}): WildCheck {
  const out: WildCheck = { ok: false, reasons: [], kind, x, z, rot, cells: { x0: x, z0: z, x1: x, z1: z }, entrance: { x, z },
    clears: [], clearText: '', blockers: [], ground: { lo: 0, hi: 0 }, locked: [], routeToPlayer: null, funding: null, traps: false };
  const reasons = out.reasons;
  const w = world.wild, b = w?.build;
  if (!w || !b || !w.fell) { reasons.push('this world predates building (wilderness content v4)'); return out; }
  const d = buildingDef(kind);
  if (!d) { reasons.push('unknown building'); return out; }
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) { reasons.push('buildings are placed on whole metres'); return out; }
  if (!Number.isSafeInteger(rot) || rot < 0 || rot > 3) { reasons.push('a building turns in quarter turns (0-3)'); return out; }
  out.cells = footprintCells(d.footprint.w, d.footprint.d, x, z, rot);
  out.entrance = footprintEntrance(d.footprint.w, d.footprint.d, x, z, rot);
  const cells = out.cells, entrance = out.entrance;
  out.locked = lockReasons(world, d);
  if (out.locked.length) { reasons.push(...out.locked); return out; }
  const lim = HALF - 4;
  if (cells.x0 < -lim || cells.z0 < -lim || cells.x1 > lim || cells.z1 > lim || Math.abs(entrance.x) > lim || Math.abs(entrance.z) > lim) { reasons.push('too close to the edge of the world'); return out; }
  // Wilderness predicates: within reach of the player; clear of what the player made and left on the ground.
  if (!at) { reasons.push('walk to where you want to build'); return out; }
  const px = at.x / 10, pz = at.z / 10;
  const far = rectDistance(cells, px, pz);
  if (far > PLACE_REACH) reasons.push(`too far away: walk within ${PLACE_REACH} m (${Math.round(far)} m now)`);
  // Never on the player: the footprint (and so its walls) may not overlap the character's body.
  if (px + CHARACTER_RADIUS > cells.x0 && px - CHARACTER_RADIUS < cells.x1 && pz + CHARACTER_RADIUS > cells.z0 && pz - CHARACTER_RADIUS < cells.z1) {
    out.traps = true;
    reasons.push('you are standing where it would go: step out of the footprint');
  }
  const others = [...b.sites.values()].filter((s) => s.id !== ignoreId);
  if (!ignoreId && others.length >= MAX_WILD_SITES) reasons.push(`you already have ${MAX_WILD_SITES} buildings and sites`);
  const ent = { x0: entrance.x, z0: entrance.z, x1: entrance.x + 1, z1: entrance.z + 1 };
  if (others.some((s) => { const c = siteCellsOf(s), e = siteEntranceOf(s);
    return overlap(cells, c, d.placement.gap) || overlap(ent, c) || overlap(cells, { x0: e.x, z0: e.z, x1: e.x + 1, z1: e.z + 1 }); })) reasons.push('too close to another building or site');
  for (const s of [...w.fell.stockpiles.values()].sort((a, c) => a.id.localeCompare(c.id))) {
    if (overlap(cells, { x0: s.x - 1.5, z0: s.z - 1.5, x1: s.x + 1.5, z1: s.z + 1.5 })) { reasons.push('a log stockpile is marked here'); break; }
  }
  const zone = inZoneOf(out);
  for (const t of [...w.fell.trunks.values()].sort((a, c) => a.id.localeCompare(c.id))) {
    const r = t.r / 100 + 0.2;
    const grown = { x0: cells.x0 - r, z0: cells.z0 - r, x1: cells.x1 + r, z1: cells.z1 + r };
    const near = trunkDistance(t, (cells.x0 + cells.x1) / 2, (cells.z0 + cells.z1) / 2);
    if (near.d > Math.hypot(cells.x1 - cells.x0, cells.z1 - cells.z0) + r + 1) continue;
    let hit = false;
    const len = t.len / 10 * t.left / t.logs;
    for (let k = 0; k <= Math.ceil(len * 4) && !hit; k++) {
      const s = Math.min(len, k / 4);
      const qx = t.x + DIR(t.dir)[0] * s, qz = t.z + DIR(t.dir)[1] * s;
      if (qx >= grown.x0 && qx <= grown.x1 && qz >= grown.z0 && qz <= grown.z1) hit = true;
      if (zone({ x: qx, z: qz })) hit = true;
    }
    if (hit) { reasons.push('a fallen trunk lies here (cut it into logs first)'); break; }
  }
  const cx = (cells.x0 + cells.x1) / 2, cz = (cells.z0 + cells.z1) / 2;
  const loose = pickupsNear(world, cx, cz, Math.hypot(cells.x1 - cells.x0, cells.z1 - cells.z0) / 2 + 2).find((p) => zone(p));
  if (loose) reasons.push(`${loose.kind === 'pile' ? `your ${label(loose.item)} pile` : `a ${label(loose.item)}`} lies here (pick it up first)`);
  // W6 (content v7): a deposit is part of the ground; no building is put over one (worked out or not).
  if (w.content >= 7) {
    const dep = typedDepositsNear(world, cx, cz, Math.hypot(cells.x1 - cells.x0, cells.z1 - cells.z0) / 2 + 1.5)
      .find((p) => p.x > cells.x0 - 0.8 && p.x < cells.x1 + 0.8 && p.z > cells.z0 - 0.8 && p.z < cells.z1 + 0.8);
    if (dep) reasons.push(`a ${DEPOSIT_LABEL[dep.type]} deposit is here: build beside it`);
  }
  // The scenario-neutral rules.
  const region = siteWindow(cells);
  const g = windowGrid(world, region, ignoreId);
  checkGround(world, out, d.placement.maxStep);
  if (!d.placement.dry) { const i = reasons.indexOf('there is water here'); if (i >= 0) reasons.splice(i, 1); }
  checkFences(g, out);
  checkTrees(world, g, out, treesAround(world, cells), w.fell.woodland, () => null);
  checkNatural(world, out);
  checkEntranceOpen(g, out);
  // Reachability: the entrance reaches where the player stands (or a cell beside it) on the walking grid.
  if (!reasons.length) {
    const route = entranceRoutes(g, out, 8000);
    let best = -1;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const v = route({ x: at.x + dx * 10, z: at.z + dz * 10 });
      if (v >= 0 && (best < 0 || v < best)) best = v;
    }
    out.routeToPlayer = best >= 0 ? best / 10 : null;
    if (best < 0) reasons.push('the entrance cannot be reached on foot from where you stand');
    else if (trapsPlayer(g, cells, at)) { out.traps = true; reasons.push('it would shut you in: leave yourself a way out'); }
  }
  // Materials: the whole building is reserved at placement, or it is not placed.
  if (opts.funding !== false && !out.locked.length) {
    out.funding = fundingFor(world, d, cells);
    if (!out.funding.ok) reasons.push(`not enough free materials to reserve: ${bagText(out.funding.short)} more needed (your bag, piles within ${RESERVE_REACH} m and storage within ${RESERVE_REACH} m count; items reserved for other sites do not)`);
  }
  out.ok = reasons.length === 0;
  return out;
}

/**
 * Would this footprint cut the player off? A flood fill over the local walking
 * grid from where the player stands, with the footprint solid: the player must
 * still reach the edge of the window (a way out of the local area). Where the
 * terrain alone already closes the player in (a shore or cliff pocket), the
 * footprint may not cut off anything the player could reach without it.
 */
export function trapsPlayer(g: NavGrid, cells: { x0: number; z0: number; x1: number; z1: number }, at: At): boolean {
  const inside = (i: number) => { const cx = g.cellX(i), cz = g.cellZ(i); return cx >= cells.x0 && cx < cells.x1 && cz >= cells.z0 && cz < cells.z1; };
  const fill = (avoid?: (i: number) => boolean) => {
    // Start from the player's cell, or the first open neighbour (a player may stand at a trunk's edge).
    let field: Int32Array | null = null;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const f = distanceField(g, { x: at.x + dx * 10, z: at.z + dz * 10 }, g.w * g.h + 1, avoid);
      let n = 0;
      for (let i = 0; i < f.length; i++) if (f[i] >= 0) n++;
      if (n > 1) { field = f; break; }
      field ??= f;
    }
    let reached = 0, edge = false;
    for (let i = 0; i < field!.length; i++) {
      if (field![i] < 0) continue;
      reached++;
      const cx = g.cellX(i) - g.ox, cz = g.cellZ(i) - g.oz;
      if (cx === 0 || cz === 0 || cx === g.w - 1 || cz === g.h - 1) edge = true;
    }
    return { reached, edge, field: field! };
  };
  const withIt = fill(inside);
  if (withIt.edge) return false;
  const without = fill();
  if (without.edge) return true;
  // Closed in by the terrain already: nothing reachable before may be lost, beyond the footprint's own cells.
  for (let i = 0; i < without.field.length; i++) if (without.field[i] >= 0 && !inside(i) && withIt.field[i] < 0) return true;
  return false;
}


// ---------- commands ----------

function siteOf(world: World, id: string): WildSite | null { return world.wild?.build?.sites.get(id) ?? null; }
function reach(s: WildSite, at: At): string | null {
  const d = rectDistance(siteCellsOf(s), at.x / 10, at.z / 10);
  return d > SITE_REACH ? `out of reach: walk up to the ${buildingDef(s.kind)!.label.toLowerCase()} (${SITE_REACH} m)` : null;
}
function takeItem(w: WildState, item: string, n: number): void {
  w.items[item] -= n;
  if (w.items[item] === 0) delete w.items[item];
}
const siteLabel = (s: WildSite) => buildingDef(s.kind)!.label.toLowerCase();
const sourceLabel = (world: World, source: string) => source === 'bag' ? 'your bag'
  : source.startsWith('d:') ? `a ${label(world.wild?.piles.get(source)?.item ?? 'item')} pile` : `your ${buildingDef(world.wild?.build?.sites.get(source)?.kind ?? '')?.label.toLowerCase() ?? 'store'}`;
/** Move `n` of a site's reservation of `item` from one source to another (the items moved with it). */
function moveReservation(s: WildSite, from: string, to: string, item: string, n: number): void {
  if (n <= 0) return;
  const src = s.reserved[from] ?? {};
  addToBag(src, item, -n);
  if (Object.keys(src).length) s.reserved[from] = src; else delete s.reserved[from];
  const dst = s.reserved[to] ?? {};
  addToBag(dst, item, n);
  s.reserved[to] = dst;
  s.reserved = sortSources(s.reserved);
}

export function placeWildSite(world: World, kind: string, x: number, z: number, rot: number, at: At): WildResult<{ siteId: string; cleared: number; reserved: Record<string, Bag>; events: FellEvent[] }> {
  const c = checkWildSite(world, kind, x, z, rot, at);
  if (!c.ok) {
    const code = c.locked.length ? 'locked' : c.traps ? 'traps_player' : c.funding && !c.funding.ok && c.reasons.length === 1 ? 'unfunded' : 'invalid_site';
    return { ok: false, code, reasons: c.reasons };
  }
  const w = world.wild!, b = w.build!;
  const id = `b:${w.nextId++}`;
  const reserved = sortSources(c.funding!.take);
  b.sites.set(id, { id, kind, x, z, rot, y: c.ground.hi, state: 'planned', reserved, delivered: {}, consumed: {}, stage: 0, work: 0, placed: tickOf(world) });
  clearGrowth(world, w.fell!.woodland, c.clears);
  world.revision++;
  return { ok: true, value: { siteId: id, cleared: c.clears.length, reserved: clone2(reserved), events: [noteEvent(world, 'SITE_PLACED', id)] } };
}
const clone2 = (r: Record<string, Bag>): Record<string, Bag> => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v }]));

/** Materials of the stages before the current one (what a site must have consumed). */
export function consumedBy(kind: string, stage: number): Bag {
  const d = buildingDef(kind)!;
  const out: Bag = {};
  for (let i = 0; i < Math.min(stage, d.stages.length); i++) for (const [k, n] of Object.entries(d.stages[i].materials)) addToBag(out, k, n);
  return sortBag(out);
}
/** Materials still to deliver to a site (what it holds reserved). */
export function siteNeeds(s: WildSite): Record<string, number> {
  const d = buildingDef(s.kind)!;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(d.materials)) {
    const left = n - (s.delivered[k] ?? 0) - (s.consumed[k] ?? 0);
    if (left > 0) out[k] = left;
  }
  return out;
}
/** Materials the current stage still lacks at the site. */
export function stageNeeds(s: WildSite): Record<string, number> {
  const d = buildingDef(s.kind)!;
  if (s.stage >= d.stages.length) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(d.stages[s.stage].materials)) if ((s.delivered[k] ?? 0) < n) out[k] = n - (s.delivered[k] ?? 0);
  return sortBag(out);
}
/** Work swings done so far and in total. */
export function siteProgress(s: WildSite): { done: number; total: number; stage: string } {
  const d = buildingDef(s.kind)!;
  let done = s.work;
  for (let i = 0; i < Math.min(s.stage, d.stages.length); i++) done += d.stages[i].work;
  return { done, total: d.work, stage: s.stage >= d.stages.length ? 'finished' : d.stages[s.stage].label };
}

/** Where a source sits (m), for the reach of a delivery; null for the bag. */
function sourceSpot(world: World, source: string): { x: number; z: number } | null {
  if (source === 'bag') return null;
  if (source.startsWith('d:')) { const p = world.wild?.piles.get(source); return p ? { x: p.x, z: p.z } : null; }
  const st = world.wild?.build?.sites.get(source);
  return st ? siteSpotOf(st) : null;
}

/** Content v5: the bag may stand in for a site's reservations elsewhere (`deliver_site` with `swap`). */
export const canSwap = (world: World): boolean => (world.wild?.content ?? 0) >= 5;

/** Where a site's reservations outside the bag lie: per source and item, with the distance (m) from the site and from `at` (dm). */
export function remoteReservations(world: World, s: WildSite, at: At | null): Array<{ from: string; item: string; n: number; x: number; z: number; toSite: number; toPlayer: number | null; inReach: boolean }> {
  const out: Array<{ from: string; item: string; n: number; x: number; z: number; toSite: number; toPlayer: number | null; inReach: boolean }> = [];
  for (const [from, bag] of Object.entries(s.reserved)) {
    if (from === 'bag') continue;
    const p = sourceSpot(world, from);
    if (!p) continue;
    const toSite = rectDistance(siteCellsOf(s), p.x, p.z);
    for (const [item, n] of Object.entries(bag)) {
      out.push({ from, item, n, x: p.x, z: p.z, toSite, toPlayer: at ? Math.hypot(p.x - at.x / 10, p.z - at.z / 10) : null, inReach: toSite <= SITE_REACH });
    }
  }
  return out.sort((a, b) => b.toSite - a.toSite || a.from.localeCompare(b.from) || a.item.localeCompare(b.item));
}

/**
 * What can be delivered to a site now, standing at `at`: its reservations in
 * the bag and in piles or storage within reach of it. Content v5: also free
 * units of the same item in the bag in place of reservations too far from the
 * site to deliver directly (`swap`: how many of `n` replace them).
 */
export function deliverable(world: World, s: WildSite, at: At | null): Array<{ from: string; item: string; n: number; swap?: number }> {
  const out: Array<{ from: string; item: string; n: number; swap?: number }> = [];
  if (s.state === 'done' || !at || reach(s, at)) return out;
  for (const [from, bag] of Object.entries(s.reserved)) {
    if (from !== 'bag') {
      const p = sourceSpot(world, from);
      if (!p || rectDistance(siteCellsOf(s), p.x, p.z) > SITE_REACH) continue;
    }
    for (const [item, n] of Object.entries(bag)) out.push({ from, item, n: Math.min(n, heldIn(world, from, item)) });
  }
  if (canSwap(world)) {
    const far: Record<string, number> = {};
    for (const r of remoteReservations(world, s, at)) if (!r.inReach) far[r.item] = (far[r.item] ?? 0) + r.n;
    for (const [item, n] of Object.entries(far).sort(([a], [b]) => a.localeCompare(b))) {
      const k = Math.min(n, freeInBag(world, item));
      if (k <= 0) continue;
      const mine = out.find((d) => d.from === 'bag' && d.item === item);
      if (mine) { mine.n += k; mine.swap = k; } else out.push({ from: 'bag', item, n: k, swap: k });
    }
  }
  // The bag first: what it carries goes in before anything else.
  return out.filter((d) => d.n > 0).sort((a, b) => (a.from === 'bag' ? 0 : 1) - (b.from === 'bag' ? 0 : 1) || a.from.localeCompare(b.from) || a.item.localeCompare(b.item));
}

/**
 * Deliver `n` of an item to a site from a source. Content v5, from the bag
 * with `swap`: units beyond the site's bag reservation come from the bag's
 * free units, and as many of the site's reservations of that item elsewhere
 * are released (farthest from the site first; `swapped` says which).
 */
export function deliverToSite(world: World, siteId: string, item: string, n: number, at: At, from = 'bag', swap = false): WildResult<{ events: FellEvent[]; swapped?: Record<string, number> }> {
  const w = world.wild!;
  const s = siteOf(world, siteId);
  if (!s) return fail('not_found', 'there is no building site there');
  if (s.state === 'done') return fail('done', 'it is already built');
  if (swap && !canSwap(world)) return fail('not_supported', 'this world predates delivering free materials in place of reserved ones (wilderness content v5)');
  if (swap && from !== 'bag') return fail('not_supported', 'only materials in your bag can stand in for reserved ones');
  const far = reach(s, at);
  if (far) return fail('out_of_reach', far);
  const need = siteNeeds(s)[item] ?? 0;
  if (need <= 0) return fail('not_needed', `the site needs no ${label(item)}`);
  const held = s.reserved[from]?.[item] ?? 0;
  if (swap) {
    if (n > need) return fail('too_many', `the site needs ${need} more ${label(item)}`);
    const extra = n - Math.min(n, held);
    const free = freeInBag(world, item);
    if (extra > free) return fail('missing', `you carry ${free} free ${label(item)} (${held} more reserved for this site in your bag)`);
    const remote = remoteReservations(world, s, null).filter((x) => x.item === item);
    if (remote.reduce((a, r) => a + r.n, 0) < extra) return fail('not_reserved', 'nothing more is reserved for this site to replace');
    const swapped: Record<string, number> = {};
    let left = extra;
    for (const r of remote) {
      if (left <= 0) break;
      const k = Math.min(left, r.n);
      const src = s.reserved[r.from]!;
      addToBag(src, item, -k);
      if (!Object.keys(src).length) delete s.reserved[r.from];
      swapped[r.from] = k;
      left -= k;
    }
    // Free units join the site's bag reservation, then all n leave the bag together.
    if (extra > 0) { const b = s.reserved.bag ?? {}; addToBag(b, item, extra); s.reserved.bag = b; }
    s.reserved = sortSources(s.reserved);
    const r = deliverToSite(world, siteId, item, n, at, 'bag');
    if (!r.ok) throw new Error(`swap delivery failed: ${r.reasons.join('; ')}`);
    return { ok: true, value: { events: r.value.events, ...(extra > 0 ? { swapped: Object.fromEntries(Object.entries(swapped).sort(([a], [b]) => a.localeCompare(b))) } : {}) } };
  }
  if (held <= 0) {
    const where = Object.entries(s.reserved).filter(([, b]) => b[item]).map(([k]) => sourceLabel(world, k));
    return fail('not_reserved', `the ${label(item)} reserved for this site ${where.length ? `are in ${where.join(' and ')}` : 'are not there'}: ${from === 'bag' ? `carry them here (pick them up or take them for this site)${canSwap(world) ? ', or deliver free ones from your bag in their place' : ''}` : 'deliver them from there'}`);
  }
  if (n > held) return fail('too_many', `only ${held} ${label(item)} are reserved for this site in ${sourceLabel(world, from)}${from === 'bag' && canSwap(world) ? ': deliver free ones in place of the others (swap)' : ''}`);
  if (heldIn(world, from, item) < n) return fail('missing', `${sourceLabel(world, from)} holds ${heldIn(world, from, item)} ${label(item)}`);
  if (from !== 'bag') {
    const p = sourceSpot(world, from);
    if (!p || rectDistance(siteCellsOf(s), p.x, p.z) > SITE_REACH) return fail('source_out_of_reach', `${sourceLabel(world, from)} is too far from the site: carry the ${label(item)} here (pick up / take for this site)`);
  }
  // The reserved units leave their source and arrive at the site.
  if (from === 'bag') takeItem(w, item, n);
  else if (from.startsWith('d:')) { const p = w.piles.get(from)!; p.qty -= n; if (p.qty === 0) w.piles.delete(from); }
  else { const st = w.build!.sites.get(from)!; st.stock = sortBag({ ...st.stock, [item]: (st.stock?.[item] ?? 0) - n }); }
  const src = s.reserved[from]!;
  addToBag(src, item, -n);
  if (!Object.keys(src).length) delete s.reserved[from];
  s.reserved = sortSources(s.reserved);
  s.delivered = sortBag({ ...s.delivered, [item]: (s.delivered[item] ?? 0) + n });
  if (s.state === 'planned') s.state = 'building';
  return { ok: true, value: { events: [noteEvent(world, 'MATERIALS_DELIVERED', siteId, n)] } };
}

export function workOnSite(world: World, siteId: string, at: At): WildResult<{ stage: number; work: number; durability?: number; events: FellEvent[] }> {
  const w = world.wild!, f = w.fell!;
  const s = siteOf(world, siteId);
  if (!s) return fail('not_found', 'there is no building site there');
  if (s.state === 'done') return fail('done', 'it is already built');
  const far = reach(s, at);
  if (far) return fail('out_of_reach', far);
  const d = buildingDef(s.kind)!;
  let tool: { durability: number } | null = null;
  if (d.tool !== 'hands') {
    const t = w.tools.filter((x) => x.kind === d.tool).sort((a, b) => b.durability - a.durability)[0];
    if (!t) return fail('no_tool', `building a ${d.label.toLowerCase()} needs a ${label(d.tool).replace('_', ' ')} in your bag`);
    if (t.durability <= 0) return fail('broken_tool', `your ${label(d.tool).replace('_', ' ')} is broken`);
    tool = t;
  }
  const missing = stageNeeds(s);
  if (Object.keys(missing).length) return fail('materials', `${d.stages[s.stage].label}: deliver ${bagText(missing)} first`);
  const tick = tickOf(world);
  if (f.swing.tick === tick && f.swing.n >= SWINGS_PER_TICK) return fail('too_fast', `too fast: at most ${SWINGS_PER_TICK} swings every 2 s`);
  if (f.swing.tick !== tick) f.swing = { tick, n: 0 };
  f.swing.n++;
  if (tool) tool.durability -= 1;
  s.state = 'building';
  s.work++;
  const events: FellEvent[] = [];
  if (s.work >= d.stages[s.stage].work) {
    // The stage is finished: its materials are built in (consumed).
    for (const [k, n] of Object.entries(d.stages[s.stage].materials)) { addToBag(s.delivered, k, -n); addToBag(s.consumed, k, n); }
    s.delivered = sortBag(s.delivered); s.consumed = sortBag(s.consumed);
    s.stage++; s.work = 0;
  }
  events.push(noteEvent(world, 'CONSTRUCTION_PROGRESS', siteId, siteProgress(s).done));
  if (s.stage >= d.stages.length) {
    s.state = 'done'; s.done = tick;
    if (d.function.kind === 'fire') s.fuel = 0;
    if (d.function.kind === 'storage') s.stock = {};
    world.revision++;
    events.push(noteEvent(world, 'BUILDING_COMPLETED', siteId));
  }
  return { ok: true, value: { stage: s.stage, work: s.work, ...(tool ? { durability: tool.durability } : {}), events } };
}

/** Piles (one per item) at a spot (m); returns their ids in item order. */
function pilesAround(world: World, sp: { x: number; z: number }, bag: Record<string, number>, step: number): Map<string, string> {
  const w = world.wild!;
  const ids = new Map<string, string>();
  let k = 0;
  for (const [item, n] of Object.entries(sortBag(bag))) {
    const x = Math.round((sp.x + (k % 3 - 1) * step) * 100) / 100, z = Math.round((sp.z + Math.floor(k / 3) * step) * 100) / 100;
    const id = `d:${w.nextId++}`;
    w.piles.set(id, { id, item: item as WildItem, qty: n, x, y: surfaceAt(world, Math.floor(x), Math.floor(z)), z });
    ids.set(item, id); k++;
  }
  return ids;
}

export function cancelWildSite(world: World, siteId: string, at: At): WildResult<{ piles: string[]; released: Bag; events: FellEvent[] }> {
  const w = world.wild!, b = w.build!;
  const s = siteOf(world, siteId);
  if (!s) return fail('not_found', 'there is no building site there');
  if (s.state === 'done') return fail('done', 'a finished building is not cancelled');
  const far = reach(s, at);
  if (far) return fail('out_of_reach', far);
  if (w.piles.size + Object.keys(s.delivered).length > MAX_PILES) return fail('too_many_piles', 'too many piles on the ground in this world');
  // Reservations are released where the items lie; delivered, unconsumed materials go on the ground at the site.
  const released = reservedTotals(Object.values(s.reserved));
  const piles = [...pilesAround(world, siteSpotOf(s), s.delivered, 0.6).values()];
  b.sites.delete(siteId);
  world.revision++;
  return { ok: true, value: { piles, released, events: [noteEvent(world, 'SITE_CANCELLED', siteId)] } };
}

function doneOf(world: World, siteId: string, at: At, fn: BuildingDef['function']['kind']): { ok: true; s: WildSite; d: BuildingDef } | { ok: false; code: string; reasons: string[] } {
  const s = siteOf(world, siteId);
  if (!s) return fail('not_found', 'there is no building there');
  const d = buildingDef(s.kind)!;
  if (d.function.kind !== fn) return fail('wrong_building', `a ${d.label.toLowerCase()} cannot do that`);
  if (s.state !== 'done') return fail('unfinished', `the ${d.label.toLowerCase()} is not finished yet`);
  const far = reach(s, at);
  if (far) return fail('out_of_reach', far);
  return { ok: true, s, d };
}

export function claimShelter(world: World, siteId: string, at: At): WildResult<{ events: FellEvent[] }> {
  const r = doneOf(world, siteId, at, 'shelter');
  if (!r.ok) return r;
  const b = world.wild!.build!;
  if (b.home === siteId) return fail('already_claimed', 'this lean-to is already your home');
  b.home = siteId;
  return { ok: true, value: { events: [noteEvent(world, 'SHELTER_CLAIMED', siteId)] } };
}

export function fuelFire(world: World, siteId: string, item: string, n: number, at: At): WildResult<{ fuel: number; events: FellEvent[] }> {
  const r = doneOf(world, siteId, at, 'fire');
  if (!r.ok) return r;
  const fn = r.d.function as Extract<BuildingDef['function'], { kind: 'fire' }>;
  const per = fn.fuel[item];
  if (!per) return fail('not_fuel', `${label(item)} does not burn here: add branches or logs`);
  const w = world.wild!;
  const no = bagRefusal(world, item, n, 'fuel the fire');
  if (no) return { ok: false, ...no };
  if ((r.s.fuel ?? 0) + per * n > MAX_FUEL + per) return fail('full', 'the fire has plenty of fuel');
  takeItem(w, item, n);
  r.s.fuel = Math.min(MAX_FUEL, (r.s.fuel ?? 0) + per * n);
  return { ok: true, value: { fuel: r.s.fuel, events: [noteEvent(world, 'FIRE_FUELED', siteId, r.s.fuel)] } };
}

export function cookAtFire(world: World, siteId: string, item: string, at: At): WildResult<{ made: WildItem; fuel: number; events: FellEvent[] }> {
  const r = doneOf(world, siteId, at, 'fire');
  if (!r.ok) return r;
  const fn = r.d.function as Extract<BuildingDef['function'], { kind: 'fire' }>;
  const made = COOKS[item as WildItem];
  if (!made) return fail('not_cookable', `${label(item)} cannot be cooked`);
  const w = world.wild!;
  if ((w.items[item] ?? 0) < 1) return fail('missing', `you have no ${label(item)}`);
  const no = bagRefusal(world, item, 1, 'cook');
  if (no) return { ok: false, ...no };
  if ((r.s.fuel ?? 0) < fn.cookFuel) return fail('not_lit', (r.s.fuel ?? 0) > 0 ? 'the fire is too low to cook: add fuel' : 'the fire is out: add branches or logs');
  if (carriedWeight(w) - ITEM_WEIGHT[item as WildItem] + ITEM_WEIGHT[made] > carryCapacity(w)) return fail('capacity', 'your bag cannot hold the result');
  takeItem(w, item, 1);
  w.items[made] = (w.items[made] ?? 0) + 1;
  r.s.fuel = (r.s.fuel ?? 0) - fn.cookFuel;
  return { ok: true, value: { made, fuel: r.s.fuel, events: [noteEvent(world, 'FOOD_COOKED', siteId, 1)] } };
}

/**
 * W6: start a smelting batch at a finished clay smelter. Its inputs (ore and
 * coal) must be free in the bag (not reserved for a site): they leave the bag
 * into the smelter's charge at once, so nothing else can use them. The
 * ingots come out at the smelter's door when the batch is done (`stepBuild`).
 */
export function smeltAt(world: World, siteId: string, recipeId: string, at: At): WildResult<{ spent: Bag; end: number; events: FellEvent[] }> {
  const r = doneOf(world, siteId, at, 'smelter');
  if (!r.ok) return r;
  const recipe = smeltRecipe(recipeId);
  if (!recipe) return fail('unknown_recipe', `the smelter has no recipe ${recipeId}`);
  const tick = tickOf(world);
  if (r.s.job) {
    const left = Math.max(0, r.s.job.end - tick) * 2;
    return fail('busy', `the smelter is already smelting ${label(Object.keys(smeltRecipe(r.s.job.recipe)?.output ?? {})[0] ?? 'a batch')} (${left} s left): one batch at a time`);
  }
  const w = world.wild!;
  const missing = Object.entries(recipe.input).filter(([k, n]) => (w.items[k] ?? 0) < n).map(([k, n]) => `${n - (w.items[k] ?? 0)} ${label(k)}`);
  if (missing.length) return fail('missing', `${recipe.label} needs ${bagText(recipe.input)} in your bag: missing ${missing.join(', ')}`);
  for (const [k, n] of Object.entries(recipe.input)) {
    const no = bagRefusal(world, k, n, 'smelt them');
    if (no) return { ok: false, ...no };
  }
  for (const [k, n] of Object.entries(recipe.input)) takeItem(w, k, n);
  r.s.job = { recipe: recipe.id, start: tick, end: tick + recipe.ticks, charge: sortBag({ ...recipe.input }) };
  return { ok: true, value: { spent: sortBag({ ...recipe.input }), end: r.s.job.end, events: [noteEvent(world, 'SMELT_STARTED', siteId, recipe.ticks)] } };
}

/** Where a smelter puts its ingots (m): its door step. */
export const smelterOutSpot = (s: WildSite): { x: number; z: number } => { const p = siteSpotOf(s); return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 }; };

/** A finished batch: its charge is consumed and the ingots lie at the door (joining a pile of the same item there). False when no pile can be made. */
function finishSmelt(world: World, s: WildSite): boolean {
  const w = world.wild!;
  const recipe = smeltRecipe(s.job!.recipe)!;
  const sp = smelterOutSpot(s);
  for (const [item, n] of Object.entries(recipe.output)) {
    const pile = [...w.piles.values()].find((p) => p.item === item && p.x === sp.x && p.z === sp.z);
    if (!pile && w.piles.size >= MAX_PILES) return false;
  }
  let made = 0;
  for (const [item, n] of Object.entries(sortBag(recipe.output))) {
    const pile = [...w.piles.values()].find((p) => p.item === item && p.x === sp.x && p.z === sp.z);
    if (pile) pile.qty += n;
    else {
      const id = `d:${w.nextId++}`;
      w.piles.set(id, { id, item: item as WildItem, qty: n, x: sp.x, y: surfaceAt(world, Math.floor(sp.x), Math.floor(sp.z)), z: sp.z });
    }
    made += n;
  }
  delete s.job;
  noteEvent(world, 'SMELT_DONE', s.id, made);
  return true;
}

export function stockWeight(stock: Record<string, number> | undefined): number {
  let n = 0;
  for (const [k, v] of Object.entries(stock ?? {})) n += (ITEM_WEIGHT[k as WildItem] ?? 0) * v;
  return n;
}

export function storeItems(world: World, siteId: string, item: string, n: number, at: At): WildResult<{ events: FellEvent[] }> {
  const r = doneOf(world, siteId, at, 'storage');
  if (!r.ok) return r;
  const w = world.wild!;
  const fn = r.d.function as Extract<BuildingDef['function'], { kind: 'storage' }>;
  const no = bagRefusal(world, item, n, 'store them');
  if (no) return { ok: false, ...no };
  const room = fn.capacity - stockWeight(r.s.stock);
  if (ITEM_WEIGHT[item as WildItem] * n > room) return fail('full', `the ${r.d.label.toLowerCase()} is full (${stockWeight(r.s.stock)}/${fn.capacity})`);
  takeItem(w, item, n);
  r.s.stock = sortBag({ ...r.s.stock, [item]: (r.s.stock?.[item] ?? 0) + n });
  const events = [noteEvent(world, 'ITEMS_STORED', siteId, n)];
  if (item === 'log') events.push(noteEvent(world, 'LOGS_DELIVERED', siteId, n));
  return { ok: true, value: { events } };
}

/**
 * Take items out of storage. Plain: free stock only. `forSite`: that site's
 * reserved stock here, which stays reserved for it, now in the bag.
 */
export function takeItems(world: World, siteId: string, item: string, n: number, at: At, forSite?: string): WildResult<{ events: FellEvent[] }> {
  const r = doneOf(world, siteId, at, 'storage');
  if (!r.ok) return r;
  const w = world.wild!;
  if ((r.s.stock?.[item] ?? 0) < n) return fail('missing', `the ${r.d.label.toLowerCase()} holds ${r.s.stock?.[item] ?? 0} ${label(item)}`);
  let target: WildSite | null = null;
  if (forSite !== undefined) {
    target = siteOf(world, forSite);
    if (!target || target.state === 'done') return fail('not_found', 'there is no building site to take them for');
    const mine = target.reserved[siteId]?.[item] ?? 0;
    if (mine < n) return fail('not_reserved', `only ${mine} ${label(item)} here are reserved for the ${siteLabel(target)}`);
  } else if (freeIn(world, siteId, item) < n) {
    return fail('reserved', `only ${freeIn(world, siteId, item)} ${label(item)} here are free; the rest are reserved for your building sites (take them for the site, or cancel it)`);
  }
  if (carriedWeight(w) + ITEM_WEIGHT[item as WildItem] * n > carryCapacity(w)) return fail('capacity', `your bag is full (${carriedWeight(w)}/${carryCapacity(w)})`);
  r.s.stock = sortBag({ ...r.s.stock, [item]: r.s.stock![item] - n });
  w.items[item] = (w.items[item] ?? 0) + n;
  if (target) moveReservation(target, siteId, 'bag', item, n);
  return { ok: true, value: { events: [noteEvent(world, 'ITEMS_TAKEN', siteId, n)] } };
}

/**
 * How much of a pile a pickup may take: plain, its free units; `forSite`, the
 * units reserved for that site (they stay reserved, now in the bag).
 */
export function pileTakeable(world: World, pileId: string, forSite?: string): { ok: true; n: number } | { ok: false; code: string; reasons: string[] } {
  const p = world.wild?.piles.get(pileId);
  if (!p) return { ok: true, n: 0 };
  if (forSite === undefined) {
    const free = freeIn(world, pileId, p.item);
    if (free <= 0 && reservedIn(world, pileId, p.item) > 0) {
      const who = reservationsInSource(world, pileId).map((r) => `${buildingDef(r.kind)!.label.toLowerCase()} (${r.siteId})`);
      return fail('reserved', `this ${label(p.item)} pile is reserved for your ${who.join(' and ')}: pick it up for that site`);
    }
    return { ok: true, n: free };
  }
  const s = siteOf(world, forSite);
  if (!s || s.state === 'done') return fail('not_found', 'there is no building site to pick it up for');
  const mine = s.reserved[pileId]?.[p.item] ?? 0;
  if (mine <= 0) return fail('not_reserved', `nothing in this pile is reserved for the ${siteLabel(s)}`);
  return { ok: true, n: mine };
}
/** After a pickup of `n` reserved units for a site: the reservation follows them into the bag. */
export function notePileTaken(world: World, pileId: string, item: string, n: number, forSite?: string): void {
  if (forSite === undefined) return;
  const s = siteOf(world, forSite);
  if (s) moveReservation(s, pileId, 'bag', item, n);
}

/** The claimed lean-to, if it still stands finished. */
export function homeShelter(world: World): WildSite | null {
  const b = world.wild?.build;
  const s = b?.home ? b.sites.get(b.home) : undefined;
  return s && s.state === 'done' ? s : null;
}
/** Why a lean-to cannot be woken at (null: it can): claimed, finished, its door step dry and clear of buildings. */
export function shelterUnavailable(world: World, siteId: string): { code: string; reasons: string[] } | null {
  const b = world.wild?.build;
  const s = b?.sites.get(siteId);
  if (!s || buildingDef(s.kind)!.function.kind !== 'shelter') return { code: 'no_shelter', reasons: ['there is no lean-to there'] };
  if (b!.home !== siteId) return { code: 'not_claimed', reasons: ['this lean-to is not your claimed home'] };
  if (s.state !== 'done') return { code: 'shelter_unfinished', reasons: ['your lean-to is not finished'] };
  const sp = siteSpotOf(s), e = siteEntranceOf(s);
  if (waterDepthAt(world, e.x, e.z) > 0) return { code: 'shelter_damaged', reasons: ['the ground at your lean-to is flooded'] };
  if (buildingHits(world, sp.x, surfaceAt(world, e.x, e.z), sp.z, CHARACTER_RADIUS, 1.7).length) return { code: 'shelter_damaged', reasons: ['the way into your lean-to is blocked'] };
  return null;
}

/** The spawn banner's spot (dm): where a new character first stands in this world. */
export function spawnPoint(world: World): At {
  const sp = wildernessSpawn(world.seed, world.params.generatorVersion);
  return { x: sp.x * 10 + 5, z: sp.z * 10 + 5 };
}

/**
 * Record a death (drowning). `at` (dm) is where the character last stood on
 * dry ground: it must be dry, inside the world, and within DROWN_REACH of
 * water, and no death may already be pending. Every carried item drops there
 * as piles (reservations follow them); tools stay; hunger is unchanged.
 */
export function recordDeath(world: World, cause: 'drowned', at: At): WildResult<{ dropped: Record<string, number>; piles: string[]; events: FellEvent[] }> {
  const w = world.wild!, b = w.build!;
  if (b.death) return fail('already_dead', 'a death is already recorded: respawn first');
  const x = at.x / 10, z = at.z / 10;
  if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) return fail('out_of_world', 'outside the world');
  const fx = Math.floor(x), fz = Math.floor(z);
  // The reported spot is the character's centre (rounded to dm), so its body may stand on the dry cell beside it.
  let dry = false;
  for (const cz of new Set([Math.floor(z - 0.5), Math.floor(z + 0.5)])) for (const cx of new Set([Math.floor(x - 0.5), Math.floor(x + 0.5)])) if (waterDepthAt(world, cx, cz) <= 0) dry = true;
  if (!dry) return fail('implausible', 'the last dry spot must be on dry ground');
  let water = false;
  for (let dz = -DROWN_REACH; dz <= DROWN_REACH && !water; dz++) for (let dx = -DROWN_REACH; dx <= DROWN_REACH && !water; dx++) {
    if (dx * dx + dz * dz <= DROWN_REACH * DROWN_REACH && waterDepthAt(world, fx + dx, fz + dz) > 0) water = true;
  }
  if (!water) return fail('implausible', `no water within ${DROWN_REACH} m: a drowning cannot be recorded there`);
  const dropped = sortBag(w.items);
  if (w.piles.size + Object.keys(dropped).length > MAX_PILES) return fail('too_many_piles', 'too many piles on the ground in this world');
  const ids = pilesAround(world, { x, z }, dropped, 0.5);
  // Reserved items in the bag stay reserved: the reservation follows them into the pile.
  for (const s of liveSites(world)) {
    for (const [item, n] of Object.entries(s.reserved.bag ?? {})) moveReservation(s, 'bag', ids.get(item)!, item, n);
  }
  w.items = {};
  b.death = { cause, x: at.x, z: at.z, tick: tickOf(world) };
  let count = 0;
  for (const n of Object.values(dropped)) count += n;
  return { ok: true, value: { dropped, piles: [...ids.values()], events: [noteEvent(world, 'DIED', 'death', count)] } };
}

/**
 * Wake from the recorded death: at the claimed, finished, intact lean-to
 * (`to` its id), or at the spawn banner's spot (`to` 'spawn'). The outcome
 * names the exact landing point (dm).
 */
export function respawnPlayer(world: World, to: string): WildResult<{ point: string; x: number; z: number; events: FellEvent[] }> {
  const b = world.wild!.build!;
  if (!b.death) return fail('no_death', 'there is no recorded death to wake from');
  let p: At;
  if (to === 'spawn') p = spawnPoint(world);
  else {
    const no = shelterUnavailable(world, to);
    if (no) return { ok: false, ...no };
    const sp = siteSpotOf(b.sites.get(to)!);
    p = { x: Math.round(sp.x * 10), z: Math.round(sp.z * 10) };
  }
  b.death = null;
  return { ok: true, value: { point: to, x: p.x, z: p.z, events: [noteEvent(world, 'RESPAWNED', to)] } };
}

/** One world tick: lit campfires burn their fuel; W6: smelting batches that are due finish (in id order). */
export function stepBuild(world: World, tick = world.life?.tick ?? 0): void {
  const b = world.wild?.build;
  if (!b) return;
  for (const s of b.sites.values()) if (s.fuel && s.fuel > 0) s.fuel--;
  for (const s of [...b.sites.values()].filter((x) => x.job && x.job.end <= tick).sort((a, c) => a.id.localeCompare(c.id))) finishSmelt(world, s);
}

// ---------- queries ----------

/** Finished buildings with this function within reach of (x, z) metres, nearest first. */
export function buildingsNear(world: World, x: number, z: number, r: number, fn?: BuildingDef['function']['kind']): Array<{ s: WildSite; d: number }> {
  const out: Array<{ s: WildSite; d: number }> = [];
  for (const s of world.wild?.build?.sites.values() ?? []) {
    if (fn && (s.state !== 'done' || buildingDef(s.kind)!.function.kind !== fn)) continue;
    const d = rectDistance(siteCellsOf(s), x, z);
    if (d <= r) out.push({ s, d });
  }
  return out.sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id));
}
/** Is a finished crafting station of this kind within reach of `at`? */
export function stationNear(world: World, station: string, at: At): boolean {
  return buildingsNear(world, at.x / 10, at.z / 10, SITE_REACH, 'station').some(({ s }) => {
    const f = buildingDef(s.kind)!.function;
    return f.kind === 'station' && f.station === station;
  });
}
// ---------- collision (player-local physics) ----------

export interface SolidAabb { id: string; x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }
const solidCache = new WeakMap<World, { key: string; list: SolidAabb[] }>();
/** Collision boxes of finished buildings. */
export function buildingSolids(world: World): SolidAabb[] {
  const b = world.wild?.build;
  if (!b || b.sites.size === 0) return [];
  const key = `${world.revision}:${b.sites.size}`;
  const c = solidCache.get(world);
  if (c && c.key === key) return c.list;
  const list: SolidAabb[] = [];
  for (const s of [...b.sites.values()].sort((a, c2) => a.id.localeCompare(c2.id))) {
    if (s.state !== 'done') continue;
    for (const box of buildingDef(s.kind)!.solids) list.push({ id: s.id, ...solidRect(s, box), y0: s.y, y1: s.y + box.h });
  }
  solidCache.set(world, { key, list });
  return list;
}
/** Buildings a character box (radius r, height h) at (x, y, z) overlaps. */
export function buildingHits(world: World, x: number, y: number, z: number, r: number, h: number): string[] {
  const list = buildingSolids(world);
  if (!list.length) return [];
  const out: string[] = [];
  for (const a of list) {
    if (x + r <= a.x0 || x - r >= a.x1 || z + r <= a.z0 || z - r >= a.z1 || y >= a.y1 - 0.05 || y + h <= a.y0) continue;
    if (!out.includes(a.id)) out.push(a.id);
  }
  return out;
}

// ---------- snapshot form ----------

export interface BuildSnapshot { death?: DeathRecord; home?: string; sites: WildSite[] }

export function buildSnapshot(b: BuildState): BuildSnapshot {
  return {
    ...(b.death ? { death: { cause: b.death.cause, x: b.death.x, z: b.death.z, tick: b.death.tick } } : {}),
    ...(b.home ? { home: b.home } : {}),
    sites: [...b.sites.values()].sort((a, c) => a.id.localeCompare(c.id)).map((s) => ({
      id: s.id, kind: s.kind, x: s.x, z: s.z, rot: s.rot, y: s.y, state: s.state,
      reserved: Object.fromEntries(Object.entries(sortSources(s.reserved))), delivered: sortBag(s.delivered), consumed: sortBag(s.consumed),
      stage: s.stage, work: s.work, placed: s.placed,
      ...(s.done !== undefined ? { done: s.done } : {}), ...(s.fuel !== undefined ? { fuel: s.fuel } : {}),
      ...(s.job !== undefined ? { job: { recipe: s.job.recipe, start: s.job.start, end: s.job.end, charge: sortBag(s.job.charge) } } : {}),
      ...(s.stock !== undefined ? { stock: sortBag(s.stock) } : {}),
    })),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const same = (a: Bag, b: Bag) => JSON.stringify(sortBag(a)) === JSON.stringify(sortBag(b));
/** The fewest ticks `swings` swings of work can take (SWINGS_PER_TICK a tick, the first tick included). */
const minTicks = (swings: number) => Math.max(0, Math.ceil(swings / SWINGS_PER_TICK) - 1);

/** What the rest of the wilderness snapshot holds (for the reservation sources). */
export interface BuildContext { items: Bag; piles: ReadonlyArray<{ id: string; item: string; qty: number }>; content?: number }

/**
 * Strict canonical form; throws otherwise. Beyond the shape, a site must have
 * a construction history its materials prove: reserved + delivered + consumed
 * equals the catalogue's materials; consumed equals the materials of the
 * stages before the current one; a stage with work in it has its materials
 * delivered; a finished building has consumed exactly its materials and holds
 * nothing reserved or delivered; the swings done fit the ticks since placing.
 * Every reservation names a source that exists and holds what all sites
 * reserve there. A claimed home is a finished lean-to; a recorded death is a
 * drowning before now.
 */
export function validateBuild(raw: unknown, tick: number, nextId: number, itemOk: (k: string) => boolean, ctx: BuildContext = { items: {}, piles: [] }): BuildSnapshot {
  const bad = (what: string): never => { throw new Error(`snapshot wilderness building: invalid ${what}`); };
  if (!isObj(raw) || !Array.isArray(raw.sites) || raw.sites.length > MAX_WILD_SITES) bad('fields');
  const v = raw as Record<string, unknown>;
  const bag = (b: unknown, max: number): Record<string, number> => {
    if (!isObj(b)) bad('bag');
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(b as Record<string, unknown>)) { if (!itemOk(k) || !int(n, 1, max)) bad('bag item'); out[k] = n as number; }
    return sortBag(out);
  };
  const ids = new Set<string>();
  const sites = (v.sites as unknown[]).map((r): WildSite => {
    if (!isObj(r) || typeof r.id !== 'string' || !SITE_ID.test(r.id) || ids.has(r.id) || Number(r.id.slice(2)) >= nextId) bad('site id');
    const s = r as Record<string, unknown>;
    const d = buildingDef(String(s.kind));
    if (!d || !d.implemented || (d.minContent ?? 0) > (ctx.content ?? 0) || !int(s.x, -HALF, HALF) || !int(s.z, -HALF, HALF) || !int(s.rot, 0, 3) || !fin(s.y)
      || !['planned', 'building', 'done'].includes(String(s.state)) || !int(s.stage, 0, d.stages.length) || !int(s.work, 0, 1000)
      || !int(s.placed, 0, tick)) bad('site');
    if (!isObj(s.reserved)) bad('reservations');
    const reserved: Record<string, Bag> = {};
    for (const [src, b] of Object.entries(s.reserved as Record<string, unknown>)) {
      if (!SOURCE_ID.test(src) || (src.startsWith('d:') || src.startsWith('b:')) && Number(src.slice(2)) >= nextId) bad('reservation source');
      reserved[src] = bag(b, 10_000);
      if (!Object.keys(reserved[src]).length) bad('reservation');
    }
    const delivered = bag(s.delivered, 10_000), consumed = bag(s.consumed, 10_000);
    const done = s.state === 'done';
    if (done !== (s.stage === d!.stages.length) || done !== (s.done !== undefined) || (s.done !== undefined && !int(s.done, s.placed as number, tick))) bad('site state');
    if (!done && s.work as number >= d!.stages[s.stage as number].work) bad('work');
    if (done && s.work !== 0) bad('work');
    // The construction history: what the materials prove.
    if (!same(consumed, consumedBy(d!.id, s.stage as number))) bad('construction history (consumed materials do not match the finished stages)');
    const accounted: Bag = {};
    for (const b of [...Object.values(reserved), delivered, consumed]) for (const [k, n] of Object.entries(b)) addToBag(accounted, k, n);
    if (!same(accounted, d!.materials)) bad('construction history (reserved, delivered and consumed materials do not add up to the building)');
    if (done && (Object.keys(reserved).length || Object.keys(delivered).length)) bad('construction history (a finished building holds materials)');
    if (!done && (s.work as number) > 0) {
      for (const [k, n] of Object.entries(d!.stages[s.stage as number].materials)) if ((delivered[k] ?? 0) < n) bad('construction history (work without the stage\'s materials)');
    }
    if (s.state === 'planned' && (Object.keys(delivered).length || Object.keys(consumed).length || s.work !== 0 || s.stage !== 0)) bad('site state');
    if (s.state === 'building' && !Object.keys(delivered).length && !Object.keys(consumed).length && s.work === 0) bad('site state');
    const swings = siteProgress({ kind: d!.id, stage: s.stage as number, work: s.work as number } as WildSite).done;
    if ((done ? (s.done as number) : tick) - (s.placed as number) < minTicks(swings)) bad('construction history (more work than the time since placing allows)');
    const fire = done && d!.function.kind === 'fire', store = done && d!.function.kind === 'storage';
    if (fire !== (s.fuel !== undefined) || (s.fuel !== undefined && !int(s.fuel, 0, MAX_FUEL))) bad('fuel');
    if (store !== (s.stock !== undefined)) bad('stock');
    const stock = s.stock !== undefined ? bag(s.stock, 10_000) : undefined;
    // W6: a smelter's batch: a known recipe, started after the smelter was finished and not in the future, its time and charge the recipe's.
    let job: SmeltJob | undefined;
    if (s.job !== undefined) {
      const j = s.job as Record<string, unknown>;
      const rec = isObj(j) ? smeltRecipe(String(j.recipe)) : undefined;
      if (!done || d!.function.kind !== 'smelter' || !rec || !int(j.start, s.done as number, tick) || j.end !== (j.start as number) + rec.ticks
        || !same(bag(j.charge, 10_000), rec.input)) bad('smelting batch');
      job = { recipe: rec!.id, start: j.start as number, end: j.end as number, charge: sortBag({ ...rec!.input }) };
    }
    if (stock && stockWeight(stock) > (d!.function as { capacity: number }).capacity) bad('stock weight');
    ids.add(s.id as string);
    return {
      id: s.id as string, kind: d!.id, x: s.x as number, z: s.z as number, rot: s.rot as number, y: s.y as number, state: s.state as SiteState,
      reserved, delivered, consumed, stage: s.stage as number, work: s.work as number, placed: s.placed as number,
      ...(s.done !== undefined ? { done: s.done as number } : {}), ...(s.fuel !== undefined ? { fuel: s.fuel as number } : {}), ...(job ? { job } : {}), ...(stock ? { stock } : {}),
    };
  });
  // Every reservation is backed: the source exists and holds what all live sites reserve in it.
  const totals = new Map<string, Bag>();
  for (const s of sites) for (const [src, b] of Object.entries(s.reserved)) { const t = totals.get(src) ?? {}; for (const [k, n] of Object.entries(b)) addToBag(t, k, n); totals.set(src, t); }
  for (const [src, t] of totals) {
    for (const [k, n] of Object.entries(t)) {
      let held = 0;
      if (src === 'bag') held = ctx.items[k] ?? 0;
      else if (src.startsWith('d:')) { const p = ctx.piles.find((q) => q.id === src); if (!p) bad('reservation source (no such pile)'); held = p!.item === k ? p!.qty : 0; }
      else {
        const st = sites.find((q) => q.id === src);
        if (!st || st.state !== 'done' || buildingDef(st.kind)!.function.kind !== 'storage') bad('reservation source (no such storage)');
        held = st!.stock?.[k] ?? 0;
      }
      if (held < n) bad('reservation (more reserved than the source holds)');
    }
  }
  if (v.home !== undefined) {
    const h = sites.find((s) => s.id === v.home);
    if (!h || h.state !== 'done' || buildingDef(h.kind)!.function.kind !== 'shelter') bad('home');
  }
  let death: DeathRecord | undefined;
  if (v.death !== undefined) {
    const e = v.death as Record<string, unknown>;
    if (!isObj(e) || e.cause !== 'drowned' || !int(e.x, -HALF * 10, HALF * 10) || !int(e.z, -HALF * 10, HALF * 10) || !int(e.tick, 0, tick)) bad('death');
    death = { cause: 'drowned', x: e.x as number, z: e.z as number, tick: e.tick as number };
  }
  const out: BuildSnapshot = { ...(death ? { death } : {}), ...(v.home !== undefined ? { home: v.home as string } : {}), sites };
  if (JSON.stringify(out) !== JSON.stringify(raw)) bad('canonical form');
  return out;
}

export function buildFromSnapshot(s: BuildSnapshot): BuildState {
  return {
    home: s.home ?? null, death: s.death ? { ...s.death } : null,
    sites: new Map(s.sites.map((x) => [x.id, { ...x, reserved: clone2(x.reserved), delivered: { ...x.delivered }, consumed: { ...x.consumed }, ...(x.stock ? { stock: { ...x.stock } } : {}),
      ...(x.job ? { job: { ...x.job, charge: { ...x.job.charge } } } : {}) }])),
  };
}

export { BUILD_CATALOGUE, SMELT_RECIPES };

/**
 * A spot near `from` (dm) where the player standing at `from` may place this
 * building as far as the ground and placement rules go (ring search,
 * deterministic), or null. Materials are not checked: placing there still
 * needs the whole building's materials free to reserve. Tests use it.
 */
export function findWildSpot(world: World, kind: string, rot: number, from: At, minR = 2): { x: number; z: number } | null {
  const d = buildingDef(kind);
  if (!d) return null;
  const size = footprintSize(d.footprint.w, d.footprint.d, rot);
  const fx = Math.round(from.x / 10), fz = Math.round(from.z / 10);
  for (let r = minR; r <= PLACE_REACH; r++) {
    for (let a = 0; a < 16; a++) {
      const [dx, dz] = DIRS16[a];
      const x = fx + Math.round(dx * r) - Math.floor(size.w / 2), z = fz + Math.round(dz * r) - Math.floor(size.d / 2);
      if (checkWildSite(world, kind, x, z, rot, from, undefined, { funding: false }).ok) return { x, z };
    }
  }
  return null;
}
