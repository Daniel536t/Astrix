// M014 player-directed construction (settlement rules v6).
//
// One validator, `checkBuilding`, decides both the placement preview the
// owner sees and the authoritative `place_site` command: the same function,
// over the same simulation state, so a green ghost is exactly a placement the
// simulation accepts. It reads only authoritative state (terrain, water, the
// walking grid, the woodland's tree stages, fields, pens, sites) and uses
// integer cells, so it is deterministic in replay.
//
// Rules for a footprint (whole-metre cells, turned by `rot` quarter turns):
//  - inside the homestead's walking window and within BUILD_RANGE of the farmhouse;
//  - clear of the farmhouse, well, pens, fields (1 m), other sites (1 m), the
//    founder house and terraces, the store and barn, and built structures;
//  - no fence edge inside it; dry ground (footprint and entrance); the ground
//    spans at most the kind's `maxStep` (1 m); the door step at most 1 m;
//  - trees: young growth (saplings, young trees), stumps and empty tree spots
//    inside it are cleared as part of the construction; mature, old, dying
//    trees and snags block (fell them first); trees the owner protected and
//    the founders' grove always block; bushes and rocks block (gather them);
//  - the entrance cell is walkable and reaches the store and the farmhouse on
//    the walking grid with the new footprint treated as solid.
import type { Entity, World } from './world';
import type { BuildSite, HomesteadState, Rect, SiteKind } from './homestead';
import {
  BUILD_KINDS, DM, MAX_SITES_V6, RESERVED_SITES, SITE_RULES, STORE_SPOT, facility, fieldRect, homesteadLayout, homesteadNav,
  homesteadNavRegion, isBuildHomestead, siteCells, siteEntrance, siteSize, siteSpot,
} from './homestead';
import { FOUNDER_STOCKPILE, LifeResult } from './economy';
import { WoodlandStats, windowTrees, woodlandStats } from './forestry';
import {
  PlacementCheck, checkEntranceOpen, checkFences, checkGround, checkNatural, checkTrees, clearGrowth, entranceRoutes,
} from './placement';

/** A building's centre must lie within this distance (m) of the farmhouse. */
export const BUILD_RANGE = 55;
/** Rotations: the door faces +z (0), +x (1), -z (2), -x (3). */
export const ROTATIONS = [0, 1, 2, 3] as const;
export const DOOR_FACING = ['south', 'east', 'north', 'west'] as const;

const len2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
const rectDm = (c: { x0: number; z0: number; x1: number; z1: number }): Rect => ({ x0: c.x0 * DM, z0: c.z0 * DM, x1: c.x1 * DM, z1: c.z1 * DM });
const overlaps = (a: Rect, b: Rect, gap = 0) => a.x0 < b.x1 + gap && a.x1 + gap > b.x0 && a.z0 < b.z1 + gap && a.z1 + gap > b.z0;

export interface BuildCheck extends PlacementCheck {
  kind: SiteKind;
  /** Walking route (m) from the entrance to the store and to the farmhouse door; null when unreachable or not measured. */
  routeToStore: number | null;
  routeToHome: number | null;
}

/** Is a tree protected by the owner (marked, or in a protected area), or the founders' grove? */
function ownerProtected(h: HomesteadState, e: Entity): string | null {
  if (e.authored) return 'the founders\' grove is kept';
  const w = h.woodland;
  if (!w) return null;
  if (w.protect.includes(e.id)) return 'a tree you protected';
  for (const z of w.zones) if ((e.x - z.x) ** 2 + (e.z - z.z) ** 2 <= z.r * z.r) return `inside protected area ${z.id.slice(5)}`;
  return null;
}

/**
 * Can a building of this kind go here, turned `rot` quarter turns, with its
 * footprint's min corner at (x, z) whole metres? The preview and the command
 * both call this. `ignoreId` skips one existing site (re-checks).
 */
export function checkBuilding(world: World, kind: SiteKind, x: number, z: number, rot: number, ignoreId?: string): BuildCheck {
  const h = world.homestead;
  const empty = (reasons: string[]): BuildCheck => ({ ok: false, reasons, kind, x, z, rot, cells: { x0: x, z0: z, x1: x, z1: z }, entrance: { x, z },
    clears: [], clearText: '', blockers: [], routeToStore: null, routeToHome: null, ground: { lo: 0, hi: 0 } });
  if (!h) return empty(['found the homestead first']);
  if (!isBuildHomestead(h)) return empty(['choosing where to build needs settlement rules v6']);
  if (!BUILD_KINDS.includes(kind)) return empty(['unknown building']);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) return empty(['buildings are placed on whole metres']);
  if (!Number.isSafeInteger(rot) || rot < 0 || rot > 3) return empty(['a building turns in quarter turns (0-3)']);
  const rule = SITE_RULES[kind];
  const cells = siteCells({ kind, x, z, rot });
  const entrance = siteEntrance({ kind, x, z, rot });
  const out: BuildCheck = { ok: false, reasons: [], kind, x, z, rot, cells, entrance, clears: [], clearText: '', blockers: [], routeToStore: null, routeToHome: null, ground: { lo: 0, hi: 0 } };
  const reasons = out.reasons;
  const r = rectDm(cells);
  // Where: the walking window and the farmhouse range.
  const reg = homesteadNavRegion(h);
  const inWin = (cx: number, cz: number) => cx >= reg.ox + 1 && cz >= reg.oz + 1 && cx < reg.ox + reg.w - 1 && cz < reg.oz + reg.h - 1;
  if (!inWin(cells.x0, cells.z0) || !inWin(cells.x1 - 1, cells.z1 - 1) || !inWin(entrance.x, entrance.z)) {
    reasons.push('outside the homestead\'s walking area');
    return out;
  }
  const others = (h.sites ?? []).filter((st) => st.id !== ignoreId);
  if (!ignoreId && others.length >= MAX_SITES_V6) reasons.push(`the homestead already has ${MAX_SITES_V6} buildings and sites`);
  const home = facility(h, 'farmhouse')!.use;
  const size = siteSize(kind, rot);
  if (len2((x + size.w / 2) * DM - home.x, (z + size.d / 2) * DM - home.z) > BUILD_RANGE * DM) reasons.push(`too far from the farmhouse (max ${BUILD_RANGE} m)`);
  // What is already built or planned.
  const ent = rectDm({ x0: entrance.x, z0: entrance.z, x1: entrance.x + 1, z1: entrance.z + 1 });
  if (homesteadLayout(h).some((f) => overlaps(r, f.rect, DM) || overlaps(ent, f.rect))) reasons.push('too close to the farmhouse, the well or a pen');
  if (h.plots.some((p) => overlaps(r, fieldRect(p), DM) || overlaps(ent, fieldRect(p)))) reasons.push('too close to a field');
  if (others.some((st) => { const c = rectDm(siteCells(st)), e = siteEntrance(st);
    return overlaps(r, c, DM) || overlaps(ent, c) || overlaps(r, rectDm({ x0: e.x, z0: e.z, x1: e.x + 1, z1: e.z + 1 })); })) reasons.push('too close to another building or site');
  if (RESERVED_SITES.some((q) => overlaps(r, rectDm(q), DM))) reasons.push('the founder house and terraces are here');
  const sx = FOUNDER_STOCKPILE.x * DM, sz = FOUNDER_STOCKPILE.z * DM;
  if (overlaps(r, { x0: sx - 25, z0: sz - 20, x1: sx + 65, z1: sz + 30 }) || overlaps(ent, { x0: sx - 25, z0: sz - 20, x1: sx + 65, z1: sz + 30 })) reasons.push('the store and barn are here');
  for (const s of world.structures.values()) {
    if (s.modules.some((m) => m.x + m.w / 2 > cells.x0 && m.x - m.w / 2 < cells.x1 && m.z + m.d / 2 > cells.z0 && m.z - m.d / 2 < cells.z1)) { reasons.push('a built structure is here'); break; }
  }
  // The scenario-neutral rules (sim/placement.ts): ground, fences, trees, bushes and rocks, the entrance.
  checkGround(world, out, rule.maxStep);
  const g = homesteadNav(world, h);
  checkFences(g, out);
  checkTrees(world, g, out, h.woodland ? windowTrees(world, h) : [], h.woodland ?? null, (e) => ownerProtected(h, e));
  checkNatural(world, out);
  checkEntranceOpen(g, out);
  // Homestead-only: the entrance reaches the store and the farmhouse.
  if (!reasons.length) {
    const at = entranceRoutes(g, out);
    const ds = at(STORE_SPOT), dh = at(home);
    out.routeToStore = ds >= 0 ? ds / 10 : null;
    out.routeToHome = dh >= 0 ? dh / 10 : null;
    if (ds < 0) reasons.push('the entrance cannot be reached from the store on foot');
    else if (dh < 0) reasons.push('the entrance cannot be reached from the farmhouse on foot');
  }
  out.ok = reasons.length === 0;
  return out;
}

/** v6 `place_site`: the owner marks out a building of the catalogue at a place and rotation the validator accepts. */
export function placeBuilding(world: World, kind: SiteKind, x: number, z: number, rot: number): LifeResult<{ siteId: string; kind: SiteKind; x: number; z: number; rot: number; cleared: number }> {
  const h = world.homestead;
  if (!h) return { ok: false, code: 'no_homestead', reasons: ['found the homestead first'] };
  const c = checkBuilding(world, kind, x, z, rot);
  if (!c.ok) return { ok: false, code: 'invalid_site', reasons: c.reasons };
  const id = `site:${h.nextId++}`;
  const site: BuildSite = { id, kind, x, z, state: 'planned', reserved: {}, delivered: {}, work: 0, rot };
  h.sites = [...(h.sites ?? []), site].sort((a, b) => a.id.localeCompare(b.id));
  clearGrowth(world, h.woodland, c.clears);
  // Replanting orders inside the footprint or on the door step are dropped (nothing is planted under a building).
  if (h.woodland) {
    const inside = (ox: number, oz: number) => (ox >= c.cells.x0 && ox < c.cells.x1 && oz >= c.cells.z0 && oz < c.cells.z1) || (ox === c.entrance.x && oz === c.entrance.z);
    h.woodland.orders = h.woodland.orders.filter((o) => !inside(o.x, o.z));
  }
  world.revision++;
  return { ok: true, value: { siteId: id, kind, x, z, rot, cleared: c.clears.length } };
}

/** A deterministic spot for a building near the yard (ring search from the farmhouse), or null. */
export function findBuildingSpot(world: World, kind: SiteKind, rot = 0, from?: { x: number; z: number }): { x: number; z: number } | null {
  const h = world.homestead;
  if (!h) return null;
  const home = facility(h, 'farmhouse')!.use;
  const hx = from ? from.x : Math.round(home.x / DM), hz = from ? from.z : Math.round(home.z / DM);
  const size = siteSize(kind, rot);
  for (let r = from ? 0 : 6; r <= BUILD_RANGE - 4; r += 2) {
    for (let a = 0; a < (r === 0 ? 1 : 16); a++) {
      const ang = (a / 16) * Math.PI * 2;
      const x = hx + Math.round(Math.cos(ang) * r) - Math.floor(size.w / 2), z = hz + Math.round(Math.sin(ang) * r) - Math.floor(size.d / 2);
      if (checkBuilding(world, kind, x, z, rot).ok) return { x, z };
    }
  }
  return null;
}

export interface BuildPreview {
  check: BuildCheck;
  /** Timber stores: the woodland around it as the woodcutter would work it from here (`woodlandStats` with this store). */
  woodland: WoodlandStats | null;
  /** The same trees measured to the founder store, for comparison. */
  viaStore: WoodlandStats | null;
}

/**
 * What the placement preview shows: the validator's verdict and, for a timber
 * store, the woodland in its work radius (harvestable, protected and
 * regrowing trees, the mean haul to this store against the haul to the
 * founder store, the sustainable yield and the regeneration its demand
 * needs). A pure query; the state hash does not change.
 */
export function buildingPreview(world: World, kind: SiteKind, x: number, z: number, rot: number): BuildPreview {
  const check = checkBuilding(world, kind, x, z, rot);
  const rule = SITE_RULES[kind];
  let woodland: WoodlandStats | null = null, viaStore: WoodlandStats | null = null;
  if (rule.store && rule.workRadius && world.homestead?.woodland) {
    const c = check.cells;
    const q = { x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, radius: rule.workRadius, demandPerDay: rule.demandPerDay,
      footprint: rectDm(c), clears: check.clears };
    woodland = woodlandStats(world, { ...q, store: { x: check.entrance.x + 0.5, z: check.entrance.z + 0.5 } });
    viaStore = woodlandStats(world, q);
  }
  return { check, woodland, viaStore };
}

/** A site's footprint and entrance (for renderers and panels). */
export function siteGeometry(st: BuildSite): { cells: { x0: number; z0: number; x1: number; z1: number }; entrance: { x: number; z: number }; spot: { x: number; z: number } } {
  return { cells: siteCells(st), entrance: siteEntrance(st), spot: siteSpot(st) };
}
