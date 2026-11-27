// W4: the scenario-neutral core of building placement, split out of the M014
// validator (sim/buildings.ts `checkBuilding`). The settlement adds its own
// homestead-bound predicates (walking window, farmhouse range, yard, fields,
// founder sites, store, protected trees, routes to the store and farmhouse);
// the wilderness adds its own (reach from the player, trunks, piles, other
// player buildings, stockpile markers). Both then run these shared rules in
// the same order, over the same authoritative state, on whole-metre cells:
//  - ground: dry (footprint and door step), the footprint spans at most the
//    kind's `maxStep`, the door step at most 1 m;
//  - no fence edge inside the footprint (walking grid walls);
//  - trees: young growth, stumps and empty tree spots are cleared by the
//    construction; mature, old, dying trees and snags block (fell them first);
//    a caller predicate may protect others (the homestead's protected trees);
//  - bushes, rocks and other natural features in the footprint block;
//  - the entrance cell is open ground, and a distance field from it over the
//    walking grid (the footprint treated as solid) answers reachability.
// Moving these lines did not change a settlement verdict or hash (the M014 and
// STAB-002 pins and the v6/v7 fixtures still pass unchanged).
import type { Entity, World } from './world';
import { chunkKey, surfaceAt, touchNature, waterDepthAt, worldToChunkX, worldToChunkZ } from './world';
import type { NavGrid } from './nav';
import { BLOCK, distanceField } from './nav';
import type { WoodlandState } from './woodland';
import { dropRecord, noteTreeChange, recordOf, stageLabel, treeLife } from './woodland';

export interface Cells { x0: number; z0: number; x1: number; z1: number }
export const MATURE_STAGES = new Set(['mature', 'old', 'dying', 'snag']);

/** What every placement verdict carries (the ghost and panels read these fields). */
export interface PlacementCheck {
  ok: boolean;
  /** Every reason the building cannot go here (empty: it can). */
  reasons: string[];
  kind: string; x: number; z: number; rot: number;
  /** Footprint cells (whole metres, [x0, x1)) and the cell in front of the door. */
  cells: Cells;
  entrance: { x: number; z: number };
  /** Young growth, stumps and empty tree spots the construction clears (entity ids, sorted). */
  clears: string[];
  /** What is cleared, in words ("2 saplings, 1 stump"). */
  clearText: string;
  /** Trees that stop it (entity id and why). */
  blockers: Array<{ id: string; why: string }>;
  /** Lowest and highest ground in the footprint. */
  ground: { lo: number; hi: number };
}

/** Footprint size after `rot` quarter turns (odd turns swap the sides). */
export function footprintSize(w: number, d: number, rot = 0): { w: number; d: number } {
  return rot % 2 ? { w: d, d: w } : { w, d };
}
/** Footprint cells for a min corner (x, z). */
export function footprintCells(w: number, d: number, x: number, z: number, rot = 0): Cells {
  const s = footprintSize(w, d, rot);
  return { x0: x, z0: z, x1: x + s.w, z1: z + s.d };
}
/** The cell in front of the door: rotation 0 faces +z, 1 +x, 2 -z, 3 -x (the M014 rule). */
export function footprintEntrance(w: number, d: number, x: number, z: number, rot = 0): { x: number; z: number } {
  const dc = Math.floor(w / 2);
  if (rot === 1) return { x: x + d, z: z + w - dc - 1 };
  if (rot === 2) return { x: x + w - dc - 1, z: z - 1 };
  if (rot === 3) return { x: x - 1, z: z + dc };
  return { x: x + dc, z: z + d };
}

/** Is (e.x, e.z) on the footprint (with a 0.3 m margin) or on the door step? */
export function inZoneOf(c: PlacementCheck): (e: { x: number; z: number }) => boolean {
  const cells = c.cells, entrance = c.entrance;
  return (e) => (e.x >= cells.x0 - 0.3 && e.x < cells.x1 + 0.3 && e.z >= cells.z0 - 0.3 && e.z < cells.z1 + 0.3)
    || (e.x >= entrance.x && e.x < entrance.x + 1 && e.z >= entrance.z && e.z < entrance.z + 1);
}

/** Ground: dry, level enough, a door step a walker can take. */
export function checkGround(world: World, out: PlacementCheck, maxStep: number): void {
  const { cells, entrance, reasons } = out;
  let lo = Infinity, hi = -Infinity, wet = false;
  for (let cz = cells.z0; cz < cells.z1; cz++) for (let cx = cells.x0; cx < cells.x1; cx++) {
    const y = surfaceAt(world, cx, cz);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
    if (waterDepthAt(world, cx, cz) > 0) wet = true;
  }
  out.ground = { lo, hi };
  if (wet) reasons.push('there is water here');
  if (hi - lo > maxStep) reasons.push(`the ground is too steep (${hi - lo} m of slope; at most ${maxStep} m)`);
  const ey = surfaceAt(world, entrance.x, entrance.z);
  if (waterDepthAt(world, entrance.x, entrance.z) > 0) reasons.push('the entrance would be in water');
  else if (ey - hi > 1 || lo - ey > 1) reasons.push(`the door step is too high (${Math.max(ey - hi, lo - ey)} m)`);
}

/** Fences on the walking grid. */
export function checkFences(g: NavGrid, out: PlacementCheck): void {
  const cells = out.cells;
  let fence = false;
  for (let cz = cells.z0; cz < cells.z1 && !fence; cz++) for (let cx = cells.x0; cx < cells.x1 && !fence; cx++) {
    if (!g.inside(cx, cz)) continue;
    const i = g.index(cx, cz);
    const west = g.inside(cx - 1, cz) ? g.walls[g.index(cx - 1, cz)] & 5 : 0, north = g.inside(cx, cz - 1) ? g.walls[g.index(cx, cz - 1)] & 10 : 0;
    if (g.walls[i] & 15 || west || north) fence = true;
  }
  if (fence) out.reasons.push('a fence runs here');
}

/**
 * Trees: young growth is cleared, mature trees (and trees `protect` names) block.
 * `trees` are the candidates in the window (sorted ids); `woodland` the lifecycle
 * records they belong to.
 */
export function checkTrees(world: World, g: NavGrid, out: PlacementCheck, trees: readonly Entity[], woodland: WoodlandState | null,
  protect: (e: Entity) => string | null): void {
  const { cells, entrance, reasons } = out;
  const inZone = inZoneOf(out);
  const counts: Record<string, number> = {};
  const blockers = new Map<string, string>();
  for (const e of trees) {
    if (!inZone(e)) continue;
    const life = treeLife(world, e)!;
    const prot = protect(e);
    if (life.present && prot) { blockers.set(e.id, `${prot} (${stageLabel(life.stage)} ${life.species})`); continue; }
    if (life.present && MATURE_STAGES.has(life.stage)) { blockers.set(e.id, `a ${stageLabel(life.stage)} ${life.species} stands here (fell it first)`); continue; }
    if (e.harvested && !(woodland && recordOf(woodland, e.id)) && !life.present) continue; // nothing there, and nothing will regrow
    out.clears.push(e.id);
    const word = !life.present ? 'empty tree spot' : life.stage === 'stump' ? 'stump' : life.stage === 'sapling' ? 'sapling' : 'young tree';
    counts[word] = (counts[word] ?? 0) + 1;
  }
  // Trees just outside whose trunk zone (the walking grid's claim) reaches into the footprint or onto the door step:
  // big ones block, young growth is cleared with the rest.
  const claimed = (cx: number, cz: number) => {
    if (!g.inside(cx, cz)) return;
    const i = g.index(cx, cz);
    if (g.block[i] !== BLOCK.tree) return;
    const id = g.blockId.get(i)!;
    if (blockers.has(id) || out.clears.includes(id)) return;
    const e = world.entities.get(id);
    const life = e ? treeLife(world, e) : null;
    if (!e || !life || !life.present) return;
    const prot = protect(e);
    if (prot) blockers.set(id, `${prot} (${stageLabel(life.stage)} ${life.species})`);
    else if (MATURE_STAGES.has(life.stage)) blockers.set(id, `a ${stageLabel(life.stage)} ${life.species} stands too close (fell it first)`);
    else { out.clears.push(id); const word = life.stage === 'stump' ? 'stump' : life.stage === 'sapling' ? 'sapling' : 'young tree'; counts[word] = (counts[word] ?? 0) + 1; }
  };
  for (let cz = cells.z0; cz < cells.z1; cz++) for (let cx = cells.x0; cx < cells.x1; cx++) claimed(cx, cz);
  if (g.inside(entrance.x, entrance.z)) claimed(entrance.x, entrance.z);
  out.clears.sort();
  out.clearText = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`).join(', ');
  out.blockers = [...blockers].sort(([a], [b]) => a.localeCompare(b)).map(([id, why]) => ({ id, why }));
  for (const why of [...new Set(out.blockers.map((b) => b.why))].slice(0, 3)) reasons.push(why);
}

/** Bushes, rocks and other natural things in the footprint are gathered first. */
export function checkNatural(world: World, out: PlacementCheck): void {
  const cells = out.cells;
  const inZone = inZoneOf(out);
  const keys: string[] = [];
  for (let cz = worldToChunkZ(cells.z0); cz <= worldToChunkZ(cells.z1); cz++) for (let cx = worldToChunkX(cells.x0); cx <= worldToChunkX(cells.x1); cx++) keys.push(chunkKey(cx, cz));
  const stuff = keys.flatMap((k) => world.entityChunks.get(k) ?? []).sort();
  for (const id of stuff) {
    const e = world.entities.get(id);
    if (!e || e.kind.startsWith('styl_tree_') || e.kind === 'marker' || e.harvested || world.entityRemovals.has(id)) continue;
    if (inZone(e)) { out.reasons.push('bushes or rocks are in the way (gather them first)'); break; }
  }
}

/** The entrance: open ground once young growth is cleared. */
export function checkEntranceOpen(g: NavGrid, out: PlacementCheck): void {
  const entrance = out.entrance;
  if (!g.inside(entrance.x, entrance.z)) return;
  const i = g.index(entrance.x, entrance.z), b = g.block[i];
  const cleared = b === BLOCK.tree && out.clears.includes(g.blockId.get(i) ?? '');
  if (b !== BLOCK.none && !cleared) out.reasons.push(`the entrance is blocked (${g.reason(entrance.x, entrance.z).replace('_', ' ')})`);
}

/**
 * Walking distance (dm / 10 = m) from the entrance to a point (dm) with the
 * footprint treated as solid: -1 when unreachable or outside the grid.
 */
export function entranceRoutes(g: NavGrid, out: PlacementCheck, maxExpansions = 40_000): (p: { x: number; z: number }) => number {
  const { cells, entrance } = out;
  const inside = (i: number) => { const cx = g.cellX(i), cz = g.cellZ(i); return cx >= cells.x0 && cx < cells.x1 && cz >= cells.z0 && cz < cells.z1; };
  const field = distanceField(g, { x: entrance.x * 10 + 5, z: entrance.z * 10 + 5 }, maxExpansions, inside);
  return (p) => { const cx = Math.floor(p.x / 10), cz = Math.floor(p.z / 10); return g.inside(cx, cz) ? field[g.index(cx, cz)] : -1; };
}

/** The young growth a construction clears: grubbed out for good (no timber; it is brush). */
export function clearGrowth(world: World, woodland: WoodlandState | null | undefined, ids: readonly string[]): void {
  for (const id of ids) {
    const e = world.entities.get(id);
    if (!e) continue;
    e.harvested = true;
    if (!e.authored) world.entityChanges.add(e.chunk);
    if (woodland) dropRecord(woodland, id);
    noteTreeChange(world, id);
  }
  if (ids.length) touchNature(world);
}
