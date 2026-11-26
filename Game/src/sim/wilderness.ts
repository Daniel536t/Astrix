// W1: the wilderness scenario. A new world that begins with one player, bare
// hands and an empty bag, in untamed land: no homestead, founder stockpile,
// founder slice, villagers or livestock. Terrain, trees, rocks, ore, shrubs,
// water and wildlife are generated exactly as in every other world.
//
// Scenario rules live here, beside the simulation, so the session (journal,
// replay, validation) and the app read one definition. No three.js.
import {
  GENERATOR_VERSION, MAT, SEA_LEVEL, World, baseHeightAt, baseTopMaterialFor, baseWaterLevelAt,
  createWorld, forestScore, surfaceAt, WILDERNESS,
} from './world';
import { hash2i } from './noise';

/** A wilderness world starts with nothing carried. */
export const WILDERNESS_STARTER_INVENTORY: Readonly<Record<string, number>> = Object.freeze({});

/**
 * Commands a wilderness world accepts. W1: only time passes; there is no
 * settlement to found or upgrade, no founder stockpile, no founder slice to
 * build and no crop plot. W2 adds gathering loose pickups, dropping, hand
 * crafting, equipping and eating (wilderness content v2; a v1 world accepts
 * them only after `upgrade_wilderness`). `harvest` stays refused: felling
 * trees becomes physical felling in W3, and breaking rock needs a pickaxe.
 */
export const WILDERNESS_COMMANDS: readonly string[] = ['tick', 'pickup', 'drop', 'craft', 'equip', 'eat', 'upgrade_wilderness'];

export function wildernessAllows(type: string): boolean {
  return WILDERNESS_COMMANDS.includes(type);
}

export function wildernessRefusal(type: string): string {
  if (type === 'found_homestead' || type === 'upgrade_homestead') return 'a wilderness world has no settlement to found or upgrade';
  if (type === 'harvest') return 'trees are felled with an axe in W3 (physical felling); breaking rock needs a pickaxe';
  if (type === 'build') return 'a wilderness world has no founder slice to build';
  return `${type} needs a settlement, which a wilderness world does not have`;
}

/**
 * The old settlement ground: the founder slice, founder stockpile and every
 * place `findHomesteadAnchor` can put a homestead, with a wide margin.
 */
export const SETTLEMENT_ZONE = { x0: -130, z0: -110, x1: 70, z1: 110 } as const;

export interface WildernessSpawn {
  x: number;
  z: number;
  /** Ground height at the spawn (base terrain). */
  y: number;
  /** Nearest water column found (metres). */
  water: number;
  /** Natural trees within 30 m. */
  trees: number;
  /** Nearest natural tree (metres). */
  nearestTree: number;
}

const SEARCH_MIN = 150;
const SEARCH_MAX = 520;
const STEP = 6;
/** Candidates checked on the generated world before the best one so far is taken. */
const MAX_CHECKS = 40;

const spawnCache = new Map<string, WildernessSpawn>();

/**
 * The wilderness spawn: a deterministic natural spot from the seed and
 * generator. Dry, nearly flat grass outside the settlement zone, at a forest
 * edge (trees close by, none on the spot) and near water. Candidates are
 * visited in an order hashed from the seed; the first that passes every check
 * on the generated world is the spawn. Pure: it uses a scratch world.
 */
export function wildernessSpawn(seed: number, generatorVersion = GENERATOR_VERSION): WildernessSpawn {
  const key = `${seed}:${generatorVersion}`;
  const hit = spawnCache.get(key);
  if (hit) return { ...hit };
  const height = (x: number, z: number) => baseHeightAt(seed, generatorVersion, x, z);
  const wet = (x: number, z: number) => baseWaterLevelAt(seed, generatorVersion, x, z) > height(x, z);
  const candidates: Array<{ x: number; z: number; order: number }> = [];
  for (let z = -SEARCH_MAX; z <= SEARCH_MAX; z += STEP) {
    for (let x = -SEARCH_MAX; x <= SEARCH_MAX; x += STEP) {
      const r = Math.hypot(x, z);
      if (r < SEARCH_MIN || r > SEARCH_MAX) continue;
      if (x >= SETTLEMENT_ZONE.x0 && x <= SETTLEMENT_ZONE.x1 && z >= SETTLEMENT_ZONE.z0 && z <= SETTLEMENT_ZONE.z1) continue;
      candidates.push({ x, z, order: hash2i(x, z, seed + 4711) });
    }
  }
  candidates.sort((a, b) => a.order - b.order || a.x - b.x || a.z - b.z);
  let scratch: World | null = null;
  // A seed with no spot passing every check gets the checked spot with the most trees.
  let best: WildernessSpawn | null = null;
  let checked = 0;
  for (const c of candidates) {
    if (checked >= MAX_CHECKS) break;
    const { x, z } = c;
    const h = height(x, z);
    if (h <= SEA_LEVEL + 2 || wet(x, z)) continue;
    const slope = Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs(height(x + dx, z + dz) - h)));
    if (slope > 1) continue;
    if (baseTopMaterialFor(seed, generatorVersion, x, z, h, slope) !== MAT.GRASS) continue;
    // Forest edge: open where the player stands, forest within a short walk.
    if (forestScore(x, z, seed) > 0.32) continue;
    let forest = false;
    for (let a = 0; a < 12 && !forest; a++) {
      const ang = (a / 12) * Math.PI * 2;
      for (const d of [10, 20, 30, 40]) if (forestScore(x + Math.cos(ang) * d, z + Math.sin(ang) * d, seed) > 0.45) { forest = true; break; }
    }
    if (!forest) continue;
    // Water within 44 m, on a ring scan.
    let water = Infinity;
    for (const d of [8, 14, 20, 28, 36, 44]) {
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2;
        if (wet(Math.round(x + Math.cos(ang) * d), Math.round(z + Math.sin(ang) * d))) { water = d; break; }
      }
      if (water < Infinity) break;
    }
    if (water === Infinity) continue;
    // Check the generated world: trees near, none on the spot.
    scratch ??= createWorld(seed, generatorVersion, WILDERNESS);
    checked++;
    for (let dz = -32; dz <= 32; dz += 16) for (let dx = -32; dx <= 32; dx += 16) surfaceAt(scratch, x + dx, z + dz);
    let trees = 0, nearestTree = Infinity, blocked = false;
    for (const e of scratch.entities.values()) {
      const d = Math.hypot(e.x - (x + 0.5), e.z - (z + 0.5));
      if (d < 3) blocked = true;
      if (!e.kind.startsWith('styl_tree')) continue;
      nearestTree = Math.min(nearestTree, d);
      if (d <= 30) trees++;
    }
    if (blocked) continue;
    const spawn = { x, z, y: surfaceAt(scratch, x, z), water, trees, nearestTree: Math.round(nearestTree * 10) / 10 };
    if (trees >= 8 && nearestTree <= 12) { best = spawn; break; }
    if (!best || trees > best.trees) best = spawn;
  }
  if (!best) throw new Error(`no wilderness spawn found for seed ${seed}`);
  spawnCache.set(key, best);
  return { ...best };
}
