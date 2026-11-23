// Character movement rules — pure TypeScript, no three.js (D-005).
//
// A character is a vertical box (radius 0.3 m, height 1.7 m) moving through
// the authoritative voxel volume, natural entities and structure modules.
// Stepping is a deterministic fixed-step function of (state, input, world):
// presentation (meshes, animation, camera) only *reads* the resulting state.
//
// Movement never generates terrain. Every query goes through the resident-only
// voxel accessors; an unloaded column is treated as a wall, so a character
// cannot outrun streaming or cause unbounded chunk generation.
//
// Movement is local presentation-tier state for now (the local founder). When
// positions start to gate gameplay (reach checks, NPC work, multiplayer), the
// same step function becomes the authoritative rule, driven by journaled input.
import {
  World, MAT, isSolid, residentVoxelAt, chunkKey, worldToChunkX, worldToChunkZ,
  isRetiredStoneKind, Y_MIN,
} from './world';
import type { ActiveEntityKind } from './world';
import { OBSTRUCTION_RADIUS } from './terrain';

export const CHARACTER_RADIUS = 0.3;
export const CHARACTER_HEIGHT = 1.7;
export const FIXED_STEP = 1 / 30;
export const WALK_SPEED = 4.2;
export const RUN_SPEED = 7.5;
export const WADE_SPEED = 2.4;
export const SWIM_SPEED = 2.0;
export const JUMP_SPEED = 6.6;
export const GRAVITY = 22;
/** Highest ledge climbed without jumping (one voxel plus tolerance). */
export const STEP_HEIGHT = 1.05;
/** Water deeper than this at the feet makes the character swim. */
export const SWIM_DEPTH = 1.25;

export interface CharacterState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Facing angle (radians, 0 = +z), turns toward motion. */
  heading: number;
  grounded: boolean;
  /** 'ground' | 'wade' | 'swim' | 'air' — the locomotion regime this step. */
  mode: 'ground' | 'wade' | 'swim' | 'air';
  /** Horizontal speed actually achieved this step (m/s), for animation. */
  speed: number;
}

export interface CharacterInput {
  /** World-space desired direction (need not be normalised; length <= 1 scales speed). */
  moveX: number;
  moveZ: number;
  run: boolean;
  jump: boolean;
}

export function createCharacter(x: number, y: number, z: number, heading = 0): CharacterState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, heading, grounded: false, mode: 'air', speed: 0 };
}

/** Solid for movement: voxels, missing (unloaded) terrain, or the world floor. */
function blocked(world: World, x: number, y: number, z: number): boolean {
  if (y < Y_MIN) return true;
  const m = residentVoxelAt(world, x, y, z);
  return m === null || isSolid(m);
}

function water(world: World, x: number, y: number, z: number): boolean {
  return residentVoxelAt(world, x, y, z) === MAT.WATER;
}

/** True when the character's box at (x, y, z) overlaps solid voxels. */
export function overlapsTerrain(world: World, x: number, y: number, z: number): boolean {
  const r = CHARACTER_RADIUS - 1e-4;
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
  const y0 = Math.floor(y + 1e-3), y1 = Math.floor(y + CHARACTER_HEIGHT - 1e-3);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (blocked(world, cx, cy, cz)) return true;
      }
    }
  }
  return false;
}

/** Structure modules are boxes (x/z centre, y bottom); optional yaw rotation. */
function overlapsStructures(world: World, x: number, y: number, z: number): boolean {
  for (const s of world.structures.values()) {
    for (const m of s.modules) {
      if (m.kind === 'crop_row') continue;
      let px = x - m.x, pz = z - m.z;
      if (m.rot) {
        const c = Math.cos(-m.rot), sn = Math.sin(-m.rot);
        const rx = px * c - pz * sn, rz = px * sn + pz * c;
        px = rx; pz = rz;
      }
      if (Math.abs(px) < m.w / 2 + CHARACTER_RADIUS && Math.abs(pz) < m.d / 2 + CHARACTER_RADIUS
        && y + 0.02 < m.y + m.h && y + CHARACTER_HEIGHT > m.y + 0.02) return true;
    }
  }
  return false;
}

/** Highest structure top under the character's footprint at or below `y + STEP_HEIGHT`. */
function structureFloor(world: World, x: number, y: number, z: number): number {
  let floor = -Infinity;
  for (const s of world.structures.values()) {
    for (const m of s.modules) {
      if (m.kind === 'crop_row') continue;
      let px = x - m.x, pz = z - m.z;
      if (m.rot) {
        const c = Math.cos(-m.rot), sn = Math.sin(-m.rot);
        const rx = px * c - pz * sn, rz = px * sn + pz * c;
        px = rx; pz = rz;
      }
      if (Math.abs(px) < m.w / 2 + CHARACTER_RADIUS * 0.6 && Math.abs(pz) < m.d / 2 + CHARACTER_RADIUS * 0.6) {
        const top = m.y + m.h;
        if (top <= y + 0.05 && top > floor) floor = top;
      }
    }
  }
  return floor;
}

function overlaps(world: World, x: number, y: number, z: number): boolean {
  return overlapsTerrain(world, x, y, z) || overlapsStructures(world, x, y, z);
}

/** Push the character out of tree trunks, ore and other natural obstructions. */
function resolveEntities(world: World, s: CharacterState): void {
  const cx = worldToChunkX(Math.floor(s.x)), cz = worldToChunkZ(Math.floor(s.z));
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ids = world.entityChunks.get(chunkKey(cx + dx, cz + dz));
      if (!ids) continue;
      for (const id of ids) {
        const e = world.entities.get(id);
        if (!e || e.harvested || isRetiredStoneKind(e.kind) || world.entityRemovals.has(id)) continue;
        // Collide with the trunk or body, not the canopy footprint used for clearance.
        const body = e.kind.startsWith('styl_tree_') ? 0.45 * e.scale
          : (OBSTRUCTION_RADIUS[e.kind as ActiveEntityKind] ?? 0.5) * 0.75 * e.scale;
        if (e.kind === 'styl_shrub') continue;
        if (s.y > e.y + 3 || s.y + CHARACTER_HEIGHT < e.y) continue;
        const ox = s.x - e.x, oz = s.z - e.z;
        const d = Math.hypot(ox, oz);
        const min = body + CHARACTER_RADIUS;
        if (d >= min || d < 1e-6) continue;
        const push = min - d;
        const nx = s.x + (ox / d) * push, nz = s.z + (oz / d) * push;
        if (!overlaps(world, nx, s.y, nz)) { s.x = nx; s.z = nz; }
      }
    }
  }
}

/** Depth of water standing at the character's feet column. */
function feetWaterDepth(world: World, x: number, y: number, z: number): number {
  const fx = Math.floor(x), fz = Math.floor(z);
  let top = Math.floor(y + 0.05);
  if (!water(world, fx, top, fz)) return 0;
  while (water(world, fx, top + 1, fz) && top < y + 4) top++;
  return top + 1 - y;
}

/**
 * Advance one fixed step. Deterministic: the same world, state and input give
 * the same result on every machine.
 */
export function stepCharacter(world: World, prev: CharacterState, input: CharacterInput, dt = FIXED_STEP): CharacterState {
  const s: CharacterState = { ...prev };
  const depth = feetWaterDepth(world, s.x, s.y, s.z);
  const swimming = depth >= SWIM_DEPTH;
  const wading = !swimming && depth > 0.2;

  let mx = input.moveX, mz = input.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const target = swimming ? SWIM_SPEED : wading ? WADE_SPEED : input.run ? RUN_SPEED : WALK_SPEED;
  const accel = s.grounded || swimming ? 14 : 4;
  s.vx += (mx * target - s.vx) * Math.min(1, accel * dt);
  s.vz += (mz * target - s.vz) * Math.min(1, accel * dt);

  if (swimming) {
    // Float with the head above the surface; a jump press strokes upward.
    const surface = s.y + depth;
    const goal = surface - 1.25;
    s.vy += ((goal - s.y) * 6 - s.vy) * Math.min(1, 5 * dt);
    if (input.jump) s.vy = Math.max(s.vy, 2.5);
  } else {
    if (input.jump && s.grounded) { s.vy = wading ? JUMP_SPEED * 0.7 : JUMP_SPEED; s.grounded = false; }
    s.vy -= GRAVITY * dt;
    if (s.vy < -40) s.vy = -40;
  }

  // Horizontal: axis-separated with automatic step-up onto ledges.
  const wasGrounded = s.grounded;
  for (const axis of ['x', 'z'] as const) {
    const delta = (axis === 'x' ? s.vx : s.vz) * dt;
    if (delta === 0) continue;
    const nx = axis === 'x' ? s.x + delta : s.x;
    const nz = axis === 'z' ? s.z + delta : s.z;
    if (!overlaps(world, nx, s.y, nz)) { s.x = nx; s.z = nz; continue; }
    if (wasGrounded || swimming || wading) {
      const stepY = Math.floor(s.y + 1e-3) + 1;
      if (stepY - s.y <= STEP_HEIGHT && !overlaps(world, nx, stepY, nz)) {
        s.x = nx; s.z = nz; s.y = stepY; continue;
      }
      // Structure tops (slabs, terraces) are not on the voxel grid.
      const top = structureFloor(world, nx, s.y + STEP_HEIGHT, nz);
      if (top > s.y && top - s.y <= STEP_HEIGHT && !overlaps(world, nx, top, nz)) {
        s.x = nx; s.z = nz; s.y = top; continue;
      }
    }
    if (axis === 'x') s.vx = 0; else s.vz = 0;
  }

  // Vertical.
  const ny = s.y + s.vy * dt;
  if (!overlaps(world, s.x, ny, s.z)) {
    s.y = ny;
    s.grounded = false;
  } else if (s.vy <= 0) {
    // Land on the highest support between ny and the current feet.
    let floor = Math.floor(s.y + 1e-3);
    while (floor > ny - 1 && overlaps(world, s.x, floor, s.z)) floor++;
    const structTop = structureFloor(world, s.x, s.y + 0.05, s.z);
    s.y = Math.max(floor, structTop > ny - 0.05 ? structTop : -Infinity);
    if (overlaps(world, s.x, s.y, s.z)) s.y = prev.y;
    s.vy = 0;
    s.grounded = true;
  } else {
    s.vy = 0;
  }
  // Supported by a structure top just below (path slabs, floors).
  if (!s.grounded && s.vy <= 0) {
    const top = structureFloor(world, s.x, s.y + 0.02, s.z);
    if (top > -Infinity && s.y - top < 0.06) { s.y = top; s.vy = 0; s.grounded = true; }
  }

  resolveEntities(world, s);

  const moved = Math.hypot(s.x - prev.x, s.z - prev.z) / dt;
  s.speed = moved;
  if (Math.hypot(mx, mz) > 0.1) {
    const want = Math.atan2(mx, mz);
    let d = want - s.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    s.heading += d * Math.min(1, 12 * dt);
  }
  const depthAfter = feetWaterDepth(world, s.x, s.y, s.z);
  s.mode = depthAfter >= SWIM_DEPTH ? 'swim' : !s.grounded ? 'air' : depthAfter > 0.2 ? 'wade' : 'ground';
  if (s.mode === 'swim') s.grounded = false;
  return s;
}

/** Highest standable feet position in a column near `yHint`, or null if not resident. */
export function findStandingY(world: World, x: number, z: number, yHint = 120): number | null {
  for (let y = Math.min(110, Math.floor(yHint)); y > Y_MIN; y--) {
    const m = residentVoxelAt(world, Math.floor(x), y - 1, Math.floor(z));
    if (m === null) return null;
    if (isSolid(m) && !overlapsTerrain(world, x, y, z)) return y;
  }
  return null;
}
