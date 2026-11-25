// Fauna — species, habitat, deterministic spawning and behaviour (pure TS, D-005).
//
// One architecture for every creature tier:
//   'ambient'       — living scenery. Spawned deterministically per chunk from
//                     (seed, generator, chunk); not saved, re-created when a
//                     chunk loads. This is the tier implemented today.
//   'authoritative' — a creature the economy cares about (hunted, caught,
//                     tamed, bred, traded). Same record shape, but stored in the
//                     world snapshot and changed only by journaled commands.
// Promotion keeps the record id, species and position, so a hunted deer is the
// same deer the player watched graze. Nothing here imports three.js.
//
// Behaviour uses resident-only terrain queries, so creatures never generate
// chunks; they turn back at the edge of the loaded world.
import {
  World, MAT, residentSurfaceAt, residentVoxelAt, chunkKey, chunkOriginX, chunkOriginZ,
  CHUNK_SIZE, hydrologyFor, isRetiredStoneKind,
} from './world';
import { hash2i, mulberry32 } from './noise';
import { PLAYER_R, WILD_BODIES, WildId, bodyReach } from './bodies';

export type Habitat = 'meadow' | 'forest_edge' | 'water';
export type CreatureTier = 'ambient' | 'authoritative';
export type Behaviour = 'idle' | 'graze' | 'wander' | 'flee' | 'rest' | 'sleep' | 'swim' | 'scatter' | 'stalk' | 'chase' | 'follow';

export interface SpeciesDef {
  id: 'deer' | 'rabbit' | 'trout' | 'fox' | 'wolf';
  /** Species this one flees from when they come close. */
  fearsSpecies?: ReadonlyArray<SpeciesDef['id']>;
  label: string;
  habitat: Habitat;
  /** Body length (m), used by rendering and collision. */
  length: number;
  walkSpeed: number;
  fleeSpeed: number;
  /** Distance at which the species notices a person and flees. */
  wariness: number;
  groupMin: number;
  groupMax: number;
  /** Home range radius around the spawn point (m). */
  range: number;
  /** Resource and amount a future hunting/fishing command would yield. */
  yields: Partial<Record<'food' | 'hide' | 'fiber', number>>;
  diurnal: boolean;
}

export const SPECIES: Record<SpeciesDef['id'], SpeciesDef> = {
  deer: {
    id: 'deer', label: 'Red deer', habitat: 'forest_edge', length: 1.7, walkSpeed: 1.2, fleeSpeed: 8.5,
    wariness: 14, groupMin: 2, groupMax: 4, range: 28, yields: { food: 12, hide: 2 }, diurnal: true,
  },
  rabbit: {
    id: 'rabbit', label: 'Hare', habitat: 'meadow', length: 0.45, walkSpeed: 0.9, fleeSpeed: 6.5,
    wariness: 6, groupMin: 1, groupMax: 3, range: 14, yields: { food: 2, hide: 1 }, diurnal: true,
  },
  trout: {
    id: 'trout', label: 'Brown trout', habitat: 'water', length: 0.4, walkSpeed: 0.6, fleeSpeed: 3.5,
    wariness: 3.5, groupMin: 4, groupMax: 7, range: 10, yields: { food: 2 }, diurnal: false,
  },
  fox: {
    id: 'fox', label: 'Red fox', habitat: 'forest_edge', length: 0.95, walkSpeed: 1.5, fleeSpeed: 7,
    wariness: 11, groupMin: 1, groupMax: 1, range: 30, yields: { food: 3, hide: 1 }, diurnal: false,
    fearsSpecies: ['wolf'],
  },
  wolf: {
    id: 'wolf', label: 'Grey wolf', habitat: 'forest_edge', length: 1.3, walkSpeed: 1.8, fleeSpeed: 8,
    wariness: 20, groupMin: 2, groupMax: 4, range: 40, yields: { food: 8, hide: 2 }, diurnal: false,
  },
};
/** Who flees whom (wildlife only; livestock enclosures are not part of this ambient tier). */
const FEARS: Partial<Record<SpeciesDef['id'], ReadonlyArray<SpeciesDef['id']>>> = {
  rabbit: ['fox', 'wolf'], deer: ['wolf'], fox: ['wolf'],
};
/** How close a predator must be before its prey bolts (metres). */
const PREDATOR_ALARM = 9;

export interface Creature {
  /** Stable, deterministic id: fauna:<species>:<chunk>:<index>. */
  id: string;
  species: SpeciesDef['id'];
  tier: CreatureTier;
  chunk: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  homeX: number;
  homeZ: number;
  behaviour: Behaviour;
  /** Seconds left in the current behaviour. */
  timer: number;
  goalX: number;
  goalZ: number;
  /** Fish only: preferred depth fraction (0 = surface, 1 = bed). */
  depthPref: number;
  speed: number;
  /** Deterministic per-creature random stream state. */
  rng: number;
  /** Pack members follow this creature (wolves). */
  leader?: string;
}

export interface FaunaContext {
  /** Positions of people (player character, later villagers). */
  threats: ReadonlyArray<{ x: number; z: number; inWater?: boolean }>;
  night: boolean;
  /** Every predator in the loaded area, for prey to flee from. */
  predators?: ReadonlyArray<{ species: SpeciesDef['id']; x: number; z: number }>;
  /** Hares in the loaded area, for foxes to stalk. */
  prey?: ReadonlyArray<{ x: number; z: number }>;
  /** Pack leaders by id, for wolves to follow. */
  leaders?: ReadonlyMap<string, Creature>;
}

export const FAUNA_STEP = 0.1;

function rand(c: Creature): number {
  c.rng = (c.rng + 0x6d2b79f5) >>> 0;
  let t = c.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Top of standing water on a resident column, or null if dry or unloaded. */
export function residentWaterAt(world: World, x: number, z: number): { bed: number; top: number } | null {
  const bed = residentSurfaceAt(world, x, z);
  if (bed === null) return null;
  let y = bed;
  while (y < bed + 24 && residentVoxelAt(world, x, y, z) === MAT.WATER) y++;
  return y > bed ? { bed, top: y } : null;
}

function landOk(world: World, x: number, z: number, maxSlope = 1): number | null {
  const fx = Math.floor(x), fz = Math.floor(z);
  const h = residentSurfaceAt(world, fx, fz);
  if (h === null) return null;
  const top = residentVoxelAt(world, fx, h - 1, fz);
  if (top !== MAT.GRASS && top !== MAT.SOIL && top !== MAT.MOSS) return null;
  if (residentVoxelAt(world, fx, h, fz) !== MAT.AIR) return null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = residentSurfaceAt(world, fx + dx, fz + dz);
    if (n === null || Math.abs(n - h) > maxSlope) return null;
  }
  return h;
}

/**
 * Deterministic ambient spawn for one resident chunk. Pure function of the
 * world's seed, generator and the chunk's generated terrain and trees.
 */
export function spawnChunkFauna(world: World, cx: number, cz: number): Creature[] {
  const key = chunkKey(cx, cz);
  if (!world.chunks.has(key)) return [];
  const seed = world.seed;
  const rnd = mulberry32((hash2i(cx, cz, seed + 7771) * 4294967296) >>> 0);
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  const out: Creature[] = [];
  let index = 0;

  let trees = 0;
  for (const id of world.entityChunks.get(key) ?? []) {
    const e = world.entities.get(id);
    if (e && !e.harvested && !isRetiredStoneKind(e.kind) && e.kind.startsWith('styl_tree_')) trees++;
  }
  let water = 0, wx = 0, wz = 0;
  const grass: Array<{ x: number; z: number }> = [];
  for (let lz = 2; lz < CHUNK_SIZE; lz += 4) {
    for (let lx = 2; lx < CHUNK_SIZE; lx += 4) {
      const x = ox + lx, z = oz + lz;
      const w = residentWaterAt(world, x, z);
      if (w && w.top - w.bed >= 1.2) { water++; wx += x; wz += z; }
      else if (landOk(world, x, z) !== null) grass.push({ x, z });
    }
  }

  const make = (species: SpeciesDef['id'], x: number, z: number, y: number): Creature => {
    const c: Creature = {
      id: `fauna:${species}:${key}:${index++}`, species, tier: 'ambient', chunk: key,
      x, y, z, heading: rnd() * Math.PI * 2, homeX: x, homeZ: z,
      behaviour: species === 'trout' ? 'swim' : 'graze', timer: 1 + rnd() * 4,
      goalX: x, goalZ: z, depthPref: 0.3 + rnd() * 0.5, speed: 0,
      rng: (rnd() * 4294967296) >>> 0,
    };
    return c;
  };

  // Fish schools in deep enough water.
  if (water >= 8 && rnd() < 0.7) {
    const cxw = wx / water, czw = wz / water;
    const n = SPECIES.trout.groupMin + Math.floor(rnd() * (SPECIES.trout.groupMax - SPECIES.trout.groupMin + 1));
    for (let i = 0; i < n; i++) {
      const x = cxw + (rnd() - 0.5) * 4, z = czw + (rnd() - 0.5) * 4;
      const w = residentWaterAt(world, Math.floor(x), Math.floor(z));
      if (!w || w.top - w.bed < 1) continue;
      out.push(make('trout', x, z, w.bed + (w.top - w.bed) * 0.5));
    }
  }
  // Deer at forest edges, hares in open meadow.
  if (grass.length >= 6) {
    const species: SpeciesDef['id'] | null = trees >= 3 && rnd() < 0.42 ? 'deer'
      : trees <= 2 && rnd() < 0.45 ? 'rabbit' : null;
    if (species) {
      const def = SPECIES[species];
      const at = grass[Math.floor(rnd() * grass.length)];
      const n = def.groupMin + Math.floor(rnd() * (def.groupMax - def.groupMin + 1));
      for (let i = 0; i < n; i++) {
        const x = at.x + 0.5 + (rnd() - 0.5) * 6, z = at.z + 0.5 + (rnd() - 0.5) * 6;
        const h = landOk(world, x, z);
        if (h !== null) out.push(make(species, x, z, h));
      }
    }
  }
  // Predators use their own random stream, so adding them never moves the
  // existing deer, hares and fish.
  if (grass.length >= 4) {
    const r2 = mulberry32((hash2i(cx, cz, seed + 7772) * 4294967296) >>> 0);
    const kind: 'wolf' | 'fox' | null = trees >= 6 && r2() < 0.16 ? 'wolf' : trees >= 2 && trees <= 5 && r2() < 0.26 ? 'fox' : null;
    if (kind) {
      const def = SPECIES[kind];
      const at = grass[Math.floor(r2() * grass.length)];
      const n = def.groupMin + Math.floor(r2() * (def.groupMax - def.groupMin + 1));
      let leader: string | undefined;
      for (let i = 0; i < n; i++) {
        const x = at.x + 0.5 + (r2() - 0.5) * 4, z = at.z + 0.5 + (r2() - 0.5) * 4;
        const h = landOk(world, x, z);
        if (h === null) continue;
        const c: Creature = {
          id: `fauna:${kind}:${key}:${index++}`, species: kind, tier: 'ambient', chunk: key,
          x, y: h, z, heading: r2() * Math.PI * 2, homeX: x, homeZ: z, behaviour: 'rest', timer: 2 + r2() * 5,
          goalX: x, goalZ: z, depthPref: 0, speed: 0, rng: (r2() * 4294967296) >>> 0,
        };
        if (kind === 'wolf') { if (leader) c.leader = leader; else leader = c.id; }
        out.push(c);
      }
    }
  }
  return out;
}

function nearestThreat(c: Creature, ctx: FaunaContext): { d: number; x: number; z: number; predator?: boolean } | null {
  let best: { d: number; x: number; z: number; predator?: boolean } | null = null;
  for (const t of ctx.threats) {
    const d = Math.hypot(t.x - c.x, t.z - c.z);
    if (!best || d < best.d) best = { d, x: t.x, z: t.z };
  }
  // Prey bolt from the predators that hunt them, at their own (shorter) alarm distance.
  const fears = FEARS[c.species];
  if (fears && ctx.predators) {
    for (const p of ctx.predators) {
      if (!fears.includes(p.species)) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      // Scale so the caller's `d < wariness` test fires at PREDATOR_ALARM.
      const scaled = d * (SPECIES[c.species].wariness / PREDATOR_ALARM);
      if (d < PREDATOR_ALARM && (!best || scaled < best.d)) best = { d: scaled, x: p.x, z: p.z, predator: true };
    }
  }
  return best;
}

/** Advance one creature by FAUNA_STEP. Deterministic given (world, creature, context). */
export function stepCreature(world: World, c: Creature, ctx: FaunaContext): void {
  const def = SPECIES[c.species];
  const dt = FAUNA_STEP;
  const threat = nearestThreat(c, ctx);
  c.timer -= dt;

  if (def.habitat === 'water') { stepFish(world, c, def, ctx, threat); return; }

  // Foxes stalk hares and pounce; a miss ends in a rest.
  if (c.species === 'fox') foxHunt(c, def, ctx, threat);

  // Decide.
  if (threat && threat.d < def.wariness && c.behaviour !== 'flee') {
    c.behaviour = 'flee';
    c.timer = 2.5 + rand(c) * 2;
  } else if (c.behaviour === 'stalk' || c.behaviour === 'chase') {
    // handled by foxHunt
  } else if (c.leader && ctx.leaders?.has(c.leader)) {
    packFollow(c, def, ctx.leaders.get(c.leader)!);
  } else if (c.timer <= 0) {
    const sleepy = def.diurnal && ctx.night;
    const r = rand(c);
    if (sleepy) { c.behaviour = 'sleep'; c.timer = 8 + r * 10; }
    else if (r < 0.45) { c.behaviour = 'graze'; c.timer = 3 + rand(c) * 5; }
    else if (r < 0.62) { c.behaviour = 'rest'; c.timer = 4 + rand(c) * 6; }
    else {
      c.behaviour = 'wander';
      c.timer = 6;
      const a = rand(c) * Math.PI * 2, d = rand(c) * def.range;
      c.goalX = c.homeX + Math.cos(a) * d;
      c.goalZ = c.homeZ + Math.sin(a) * d;
    }
  }

  // Act.
  let tx = 0, tz = 0, speed = 0;
  if (c.behaviour === 'flee' && threat) {
    const dx = c.x - threat.x, dz = c.z - threat.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len; tz = dz / len; speed = def.fleeSpeed;
    if (c.timer <= 0) { c.behaviour = 'idle'; c.timer = 1; c.homeX = c.x; c.homeZ = c.z; }
  } else if (c.behaviour === 'stalk' || c.behaviour === 'chase') {
    const dx = c.goalX - c.x, dz = c.goalZ - c.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len; tz = dz / len;
    speed = c.behaviour === 'chase' ? def.fleeSpeed * 0.8 : def.walkSpeed * 0.7;
  } else if (c.behaviour === 'follow') {
    const dx = c.goalX - c.x, dz = c.goalZ - c.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len; tz = dz / len; speed = def.walkSpeed * 1.4;
  } else if (c.behaviour === 'wander') {
    const dx = c.goalX - c.x, dz = c.goalZ - c.z, len = Math.hypot(dx, dz);
    if (len < 0.5) { c.behaviour = 'graze'; c.timer = 2 + rand(c) * 3; }
    else { tx = dx / len; tz = dz / len; speed = def.walkSpeed; }
  } else if (c.behaviour === 'graze' && rand(c) < 0.04) {
    // Small shuffles while grazing.
    const a = c.heading + (rand(c) - 0.5);
    tx = Math.sin(a); tz = Math.cos(a); speed = def.walkSpeed * 0.4;
  }

  if (speed > 0) {
    // Steer around unsuitable ground by sampling a fan of headings.
    const base = Math.atan2(tx, tz);
    let moved = false;
    // STAB-002 S2: a step never ends inside a person (the player's body plus this creature's whole length, any heading).
    const keep = PLAYER_R + bodyReach(WILD_BODIES[c.species as WildId]);
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
      const a = base + off;
      const nx = c.x + Math.sin(a) * speed * dt, nz = c.z + Math.cos(a) * speed * dt;
      if (intrudes(ctx, c, nx, nz, keep)) continue;
      const h = landOk(world, nx, nz, 1);
      if (h === null) continue;
      c.x = nx; c.z = nz; c.y = h;
      c.heading = turn(c.heading, a, 8 * dt);
      moved = true;
      break;
    }
    if (!moved && c.behaviour === 'wander') { c.behaviour = 'idle'; c.timer = 1; }
    c.speed = moved ? speed : 0;
  } else {
    c.speed = 0;
  }
}

/** STAB-002 S2: would a step to (x, z) end within `keep` of a person while getting closer? (Moving away is always allowed.) */
function intrudes(ctx: FaunaContext, c: Creature, x: number, z: number, keep: number): boolean {
  for (const t of ctx.threats) {
    const d1 = Math.hypot(x - t.x, z - t.z);
    if (d1 < keep && d1 <= Math.hypot(c.x - t.x, c.z - t.z)) return true;
  }
  return false;
}

/** Fox: notice a hare, creep up, pounce; give up (rest) when it escapes or the timer ends. */
function foxHunt(c: Creature, def: SpeciesDef, ctx: FaunaContext, threat: { d: number } | null): void {
  if (ctx.night === false && c.behaviour === 'sleep') return;
  if (c.behaviour === 'stalk' || c.behaviour === 'chase') {
    let best: { d: number; x: number; z: number } | null = null;
    for (const p of ctx.prey ?? []) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (!best || d < best.d) best = { d, x: p.x, z: p.z };
    }
    if (!best || best.d > 20 || c.timer <= 0 || (threat && threat.d < def.wariness * 0.5)) {
      c.behaviour = 'rest'; c.timer = 4 + rand(c) * 4; return;
    }
    c.goalX = best.x; c.goalZ = best.z;
    if (c.behaviour === 'stalk' && best.d < 3.5) { c.behaviour = 'chase'; c.timer = 2; }
    if (c.behaviour === 'chase' && best.d < 0.6) { c.behaviour = 'rest'; c.timer = 6; }   // a near miss: the hare is gone
    return;
  }
  if (c.timer <= 0 && ctx.prey && !(threat && threat.d < def.wariness)) {
    for (const p of ctx.prey) {
      if (Math.hypot(p.x - c.x, p.z - c.z) < 13 && rand(c) < 0.6) {
        c.behaviour = 'stalk'; c.timer = 12; c.goalX = p.x; c.goalZ = p.z; return;
      }
    }
  }
}

/** Pack member: stay with the leader; when the leader rests or grazes, so do they. */
function packFollow(c: Creature, def: SpeciesDef, leader: Creature): void {
  const d = Math.hypot(leader.x - c.x, leader.z - c.z);
  if (d > 5) {
    c.behaviour = 'follow';
    const a = rand(c) * Math.PI * 2;
    c.goalX = leader.x + Math.cos(a) * 3; c.goalZ = leader.z + Math.sin(a) * 3;
    c.timer = 1;
  } else if (c.behaviour === 'follow' || c.timer <= 0) {
    const calm = leader.behaviour === 'rest' || leader.behaviour === 'sleep' || leader.behaviour === 'graze' || leader.behaviour === 'idle';
    c.behaviour = calm ? (leader.behaviour === 'sleep' ? 'sleep' : 'rest') : 'wander';
    c.timer = 3 + rand(c) * 4;
    c.goalX = leader.x + (rand(c) - 0.5) * 8; c.goalZ = leader.z + (rand(c) - 0.5) * 8;
  }
  void def;
}

function stepFish(world: World, c: Creature, def: SpeciesDef, ctx: FaunaContext,
  threat: { d: number; x: number; z: number } | null): void {
  const dt = FAUNA_STEP;
  const hydro = hydrologyFor(world.seed, world.params.generatorVersion);
  if (threat && threat.d < def.wariness) { c.behaviour = 'scatter'; c.timer = 1.5 + rand(c); }
  else if (c.timer <= 0) {
    c.behaviour = 'swim';
    c.timer = 2 + rand(c) * 3;
    const a = rand(c) * Math.PI * 2, d = rand(c) * def.range;
    c.goalX = c.homeX + Math.cos(a) * d;
    c.goalZ = c.homeZ + Math.sin(a) * d;
    c.depthPref = 0.25 + rand(c) * 0.55;
  }
  let tx: number, tz: number, speed: number;
  if (c.behaviour === 'scatter' && threat) {
    const dx = c.x - threat.x, dz = c.z - threat.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len; tz = dz / len; speed = def.fleeSpeed;
  } else {
    const dx = c.goalX - c.x, dz = c.goalZ - c.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len; tz = dz / len; speed = len < 0.4 ? 0 : def.walkSpeed;
    // Trout hold position against the current: face upstream, drift slightly.
    const w = residentWaterAt(world, Math.floor(c.x), Math.floor(c.z));
    if (w) {
      const f = hydro.flowAt(c.x, c.z, w.top);
      if (f.speed > 0.2) { tx = tx * 0.5 - f.dx * 0.5; tz = tz * 0.5 - f.dz * 0.5; }
    }
  }
  const base = Math.atan2(tx, tz);
  let moved = false;
  for (const off of [0, 0.6, -0.6, 1.3, -1.3, 2.2, -2.2]) {
    const a = base + off;
    const nx = c.x + Math.sin(a) * speed * dt, nz = c.z + Math.cos(a) * speed * dt;
    const w = residentWaterAt(world, Math.floor(nx), Math.floor(nz));
    if (!w || w.top - w.bed < 0.8) continue;
    c.x = nx; c.z = nz;
    const goalY = w.top - 0.35 - (w.top - w.bed - 0.7) * c.depthPref;
    c.y += (goalY - c.y) * Math.min(1, 3 * dt);
    c.y = Math.min(w.top - 0.25, Math.max(w.bed + 0.2, c.y));
    c.heading = turn(c.heading, a, 6 * dt);
    moved = true;
    break;
  }
  c.speed = moved ? speed : 0;
  if (!moved) { c.goalX = c.homeX; c.goalZ = c.homeZ; }
  void ctx;
}

function turn(from: number, to: number, rate: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.min(1, rate);
}
