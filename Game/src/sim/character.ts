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
  isRetiredStoneKind, Y_MIN, hydrologyFor,
} from './world';
import type { ActiveEntityKind } from './world';
import { OBSTRUCTION_RADIUS } from './terrain';
// M010: a sapling's trunk is thinner than a mature tree's (the stage the renderer draws).
import { STAGE_TRUNK, growthStage } from './vegetation';

export const CHARACTER_RADIUS = 0.3;
export const CHARACTER_HEIGHT = 1.7;
export const FIXED_STEP = 1 / 30;
export const WALK_SPEED = 4.2;
export const RUN_SPEED = 7.5;
/** Wading speed at knee depth; deeper water slows the walk further. */
export const WADE_SPEED = 3.4;
/** Swimming at the surface, underwater, and when exhausted (m/s). */
export const SWIM_SPEED = 2.4;
export const DIVE_SPEED = 1.9;
export const EXHAUSTED_SWIM_SPEED = 1.0;
export const JUMP_SPEED = 6.6;
/** A second tap while airborne launches again at this speed (a higher total jump, enough to leave a two-voxel hole). */
export const DOUBLE_JUMP_SPEED = 8.4;
/**
 * Water drags a jump from a wading bed (was 0.7, a 0.49 m hop whose whole
 * descent fell inside the landing buffer; 0.85 gives about 0.72 m, leaving a
 * usable window for the second tap).
 */
export const WADE_JUMP_FACTOR = 0.85;
/** A tap this close to the ground (m) while falling is buffered as a ground jump. */
const JUMP_BUFFER_REACH = 0.6;
const JUMP_BUFFER_TIME = 0.15;
export const GRAVITY = 22;
/** Highest ledge climbed without jumping (one voxel plus tolerance). */
export const STEP_HEIGHT = 1.05;
/** Water deeper than this at the feet makes the character swim (chest deep). */
export const SWIM_DEPTH = 1.35;
/** Eye height above the feet; the head is underwater when the surface is above it. */
export const EYE_HEIGHT = 1.5;
/**
 * Buoyancy (M011): a swimmer at rest floats with the feet this far below the
 * surface, so the water line sits at the upper chest and the eyes are
 * EYE_HEIGHT - FLOAT_DEPTH = 0.2 m clear. (Before M011 the float line put the
 * eyes only 0.08 m clear and the drawn figure's head 0.3 m under the drawn
 * water.)
 */
export const FLOAT_DEPTH = 1.3;
/** An exhausted swimmer still floats, lower: water at the chin, eyes just clear. */
export const EXHAUSTED_FLOAT_DEPTH = 1.42;
/** Holding Jump at the surface lifts the head this much higher (a kick up to look or reach a bank). */
export const SURFACE_LIFT = 0.18;
/** Vertical swimming speeds (m/s): dive down, swim up (Jump held), passive buoyant rise. */
export const DIVE_DOWN_SPEED = 2.0;
export const SWIM_UP_SPEED = 2.6;
export const BUOYANT_RISE_SPEED = 1.1;
/** Highest bank a swimmer at the surface can haul out onto. */
export const SWIM_CLIMB = 2.2;

// ---- vitals (Minecraft-like timings, in seconds) ----
export const MAX_HEALTH = 100;
/** Breath lasts this long with the head underwater, then drowning starts. */
export const BREATH_SECONDS = 15;
/** Seconds to refill breath from empty once the head is above water. */
export const BREATH_REFILL_SECONDS = 2.5;
/** Health lost per second while drowning (10 s from full health to death). */
export const DROWN_DAMAGE_PER_S = 10;
/**
 * Stamina: active swimming (strokes, diving, swimming up) lasts 40 s; floating
 * at rest with the head out recovers it in FLOAT_RECOVER_SECONDS; 8 s on land.
 * (Before M011 treading water at rest drained it in 60 s and an exhausted
 * swimmer sank and drowned, which is what drained the owner's life at the
 * surface.)
 */
export const SWIM_STAMINA_SECONDS = 40;
export const FLOAT_RECOVER_SECONDS = 30;
export const STAMINA_RECOVER_SECONDS = 8;
/** Health regenerates after this long without damage, at HEALTH_REGEN_PER_S. */
export const HEALTH_REGEN_DELAY = 4;
export const HEALTH_REGEN_PER_S = 3;
/** River currents push swimmers at this fraction of the surface flow (waders less). */
export const SWIM_CURRENT_FACTOR = 0.5;
export const WADE_CURRENT_FACTOR = 0.2;

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
  /** 0..MAX_HEALTH. Reaching 0 sets `dead`. */
  health: number;
  /** 0..1 air left while the head is underwater. */
  breath: number;
  /** 0..1 strength for staying afloat; at 0 the swimmer sinks. */
  stamina: number;
  /** Eyes below the water surface this step. */
  headUnderwater: boolean;
  /** Water surface over the feet column (feet y when dry). */
  waterSurface: number;
  /** Seconds since the last damage (gates health regeneration). */
  calm: number;
  /** Damage taken this step, for presentation (flash, sound). */
  hurt: number;
  dead: boolean;
  /** What killed the character, if dead. */
  cause: 'drowned' | null;
  /** True once the mid-air second jump has been spent; cleared on landing or in water. */
  airJumpUsed: boolean;
  /** True while airborne after a real ground jump (the air jump needs this, so stepping off a ledge gives none). */
  jumped: boolean;
  /** Seconds left on a Jump tap made just before landing; it fires as a normal ground jump on touchdown. */
  jumpBuffer: number;
  /** Last dry standing position: where a dead character respawns. */
  safe: { x: number; y: number; z: number };
}

export interface CharacterInput {
  /** World-space desired direction (need not be normalised; length <= 1 scales speed). */
  moveX: number;
  moveZ: number;
  run: boolean;
  /** Jump pressed this step (one-shot). */
  jump: boolean;
  /** Jump held: swim upward. */
  rise?: boolean;
  /** Dive held: swim downward. */
  dive?: boolean;
}

export function createCharacter(x: number, y: number, z: number, heading = 0): CharacterState {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, heading, grounded: false, mode: 'air', speed: 0,
    health: MAX_HEALTH, breath: 1, stamina: 1, headUnderwater: false, waterSurface: y,
    calm: HEALTH_REGEN_DELAY, hurt: 0, dead: false, cause: null, airJumpUsed: false, jumped: false, jumpBuffer: 0, safe: { x, y, z },
  };
}

/** A fresh character at its last safe spot with full vitals. */
export function respawnCharacter(world: World, dead: CharacterState): CharacterState {
  const { x, z } = dead.safe;
  const y = findStandingY(world, x, z, dead.safe.y + 2) ?? dead.safe.y;
  return createCharacter(x, y, z, dead.heading);
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
        const body = e.kind.startsWith('styl_tree_') ? STAGE_TRUNK[growthStage(e) ?? 'mature'] * e.scale
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

/**
 * Depth of water over the feet: the water surface (top of the water cells in
 * the feet column) minus the feet height. 0 when the feet are dry. Searches a
 * few cells up so a fully submerged diver still finds the surface.
 */
function feetWaterDepth(world: World, x: number, y: number, z: number): number {
  const fx = Math.floor(x), fz = Math.floor(z);
  let top = Math.floor(y + 0.05);
  if (!water(world, fx, top, fz)) return 0;
  while (water(world, fx, top + 1, fz) && top < y + 48) top++;
  return top + 1 - y;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Surface current at a water column (m/s), from the deterministic hydrology. */
function currentAt(world: World, x: number, z: number, surface: number): { dx: number; dz: number; speed: number } {
  const f = hydrologyFor(world.seed, world.params.generatorVersion).flowAt(x, z, surface);
  return { dx: f.dx, dz: f.dz, speed: f.speed };
}

/**
 * Advance one fixed step. Deterministic: the same world, state and input give
 * the same result on every machine.
 */
export function stepCharacter(world: World, prev: CharacterState, input: CharacterInput, dt = FIXED_STEP): CharacterState {
  const s: CharacterState = { ...prev, hurt: 0 };
  if (s.dead) {
    // A dead character drifts to rest; the controller decides when to respawn.
    s.vx = 0; s.vz = 0; s.speed = 0;
    return s;
  }
  const depth = feetWaterDepth(world, s.x, s.y, s.z);
  const surface = s.y + depth;
  // Swim when the water is chest deep, or when already afloat in deep-ish water.
  const swimming = depth >= SWIM_DEPTH || (depth > 0.9 && !s.grounded && prev.mode === 'swim');
  const wading = !swimming && depth > 0.2;
  const exhausted = s.stamina <= 0;
  const floatY = surface - (exhausted ? EXHAUSTED_FLOAT_DEPTH : FLOAT_DEPTH);
  const atSurface = swimming && s.y >= floatY - 0.35;

  let mx = input.moveX, mz = input.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const target = swimming ? (exhausted ? EXHAUSTED_SWIM_SPEED : atSurface ? SWIM_SPEED : DIVE_SPEED)
    : wading ? WADE_SPEED * (1 - 0.45 * clamp01((depth - 0.2) / (SWIM_DEPTH - 0.2)))
      : input.run ? RUN_SPEED : WALK_SPEED;
  let driftX = 0, driftZ = 0;
  if (swimming || wading) {
    // Rivers carry swimmers downstream; waders feel it in proportion to depth.
    const c = currentAt(world, s.x, s.z, surface);
    const k = swimming ? SWIM_CURRENT_FACTOR : WADE_CURRENT_FACTOR * clamp01(depth / SWIM_DEPTH);
    driftX = c.dx * c.speed * k; driftZ = c.dz * c.speed * k;
  }
  const accel = s.grounded || swimming ? (swimming ? 5 : 14) : 4;
  s.vx += (mx * target + driftX - s.vx) * Math.min(1, accel * dt);
  s.vz += (mz * target + driftZ - s.vz) * Math.min(1, accel * dt);

  if (swimming) {
    // Buoyancy pulls the body toward its float line (water at the chest);
    // the response is slightly underdamped, so a swimmer bobs gently into
    // place. Holding Dive strokes down, holding Jump strokes up (faster than
    // buoyancy alone, and a little higher at the surface). An exhausted
    // swimmer cannot dive or kick up but still floats, lower in the water.
    let wantVy: number;
    if (input.dive && !exhausted) wantVy = -DIVE_DOWN_SPEED;
    else if ((input.rise || input.jump) && !exhausted) {
      // Full speed from depth, easing off near the top so the kick does not overshoot out of the water.
      wantVy = Math.max(-1, Math.min(SWIM_UP_SPEED, (floatY + SURFACE_LIFT - s.y) * 2.5));
    } else wantVy = Math.max(-1.4, Math.min(BUOYANT_RISE_SPEED, (floatY - s.y) * 2.5));
    s.vy += (wantVy - s.vy) * Math.min(1, 3.5 * dt);
  } else {
    const wantJump = input.jump || s.jumpBuffer > 0;
    if (wantJump && s.grounded) {
      s.vy = wading ? JUMP_SPEED * WADE_JUMP_FACTOR : JUMP_SPEED; s.grounded = false; s.jumped = true; s.jumpBuffer = 0;
    } else if (input.jump) {
      if (s.vy <= 0 && (overlaps(world, s.x, s.y - JUMP_BUFFER_REACH, s.z) || structureFloor(world, s.x, s.y + 0.02, s.z) > s.y - JUMP_BUFFER_REACH)) {
        // About to land: remember the tap so it becomes a normal ground jump.
        s.jumpBuffer = JUMP_BUFFER_TIME;
      } else if (s.jumped && !s.airJumpUsed) {
        // Also from a wading jump (M009): knee-to-waist water in a two-voxel
        // hole used to be a trap, because the feet were still wet when the
        // second tap came and the jump flag was cleared every wet step.
        // Second tap in the air after a real jump: a stronger launch, once per jump.
        s.vy = DOUBLE_JUMP_SPEED; s.airJumpUsed = true;
      }
    }
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
      // A swimmer at the surface hauls out onto a bank up to SWIM_CLIMB above the feet.
      if (atSurface && !exhausted) {
        let climbed = false;
        for (let cy = stepY + 1; cy - s.y <= SWIM_CLIMB; cy++) {
          if (!overlaps(world, nx, cy, nz) && overlaps(world, nx, cy - 1, nz)) {
            s.x = nx; s.z = nz; s.y = cy; s.vy = 0; climbed = true; break;
          }
        }
        if (climbed) continue;
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
  // Landing (also on a wading bed) or swimming re-arms the jumps; wet feet in mid-air do not.
  if (s.grounded || swimming) { s.airJumpUsed = false; s.jumped = false; }
  if (s.jumpBuffer > 0) s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);

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
  // A swimmer whose feet brush a submerged ledge keeps swimming over it (M011):
  // landing on it used to switch to wading, and stepping off the ledge then
  // dropped the founder under the surface with full gravity.
  const afloat = depthAfter >= SWIM_DEPTH || (swimming && depthAfter > 0.9);
  s.mode = afloat ? 'swim' : !s.grounded ? 'air' : depthAfter > 0.2 ? 'wade' : 'ground';
  if (s.mode === 'swim') s.grounded = false;
  s.waterSurface = s.y + depthAfter;
  const working = Math.hypot(mx, mz) > 0.1 || (!exhausted && (!!input.dive || !!input.rise || input.jump));
  updateVitals(s, depthAfter, working, dt);
  return s;
}

/** Breath, stamina and health for one step. Pure and deterministic. */
function updateVitals(s: CharacterState, depth: number, working: boolean, dt: number): void {
  // Breath is lost only while the eyes are below the surface.
  s.headUnderwater = depth > EYE_HEIGHT;
  s.breath = s.headUnderwater ? Math.max(0, s.breath - dt / BREATH_SECONDS)
    : Math.min(1, s.breath + dt / BREATH_REFILL_SECONDS);
  if (s.mode === 'swim') {
    if (working) s.stamina = Math.max(0, s.stamina - dt / SWIM_STAMINA_SECONDS);
    else if (!s.headUnderwater) s.stamina = Math.min(1, s.stamina + dt / FLOAT_RECOVER_SECONDS);
  } else if (s.mode === 'ground') s.stamina = Math.min(1, s.stamina + dt / STAMINA_RECOVER_SECONDS);

  let damage = 0;
  if (s.headUnderwater && s.breath <= 0) damage += DROWN_DAMAGE_PER_S * dt;
  if (damage > 0) {
    s.health = Math.max(0, s.health - damage);
    s.hurt = damage;
    s.calm = 0;
    if (s.health <= 0) { s.dead = true; s.cause = 'drowned'; s.vx = 0; s.vz = 0; }
  } else {
    s.calm += dt;
    if (s.calm >= HEALTH_REGEN_DELAY && !s.headUnderwater) s.health = Math.min(MAX_HEALTH, s.health + HEALTH_REGEN_PER_S * dt);
  }
  // Remember dry footing as the respawn point.
  if (s.mode === 'ground' && s.grounded && depth === 0) s.safe = { x: s.x, y: s.y, z: s.z };
}

/**
 * True when a character could stand still at (x, y, z): resident solid ground
 * under the feet, the box clear of voxels, structures and tree trunks / rocks,
 * and dry feet (no water in the feet or head cells). Used to place a returning
 * character next to a banner.
 */
export function canStandAt(world: World, x: number, y: number, z: number): boolean {
  const fx = Math.floor(x), fz = Math.floor(z), fy = Math.floor(y + 1e-3);
  const below = residentVoxelAt(world, fx, fy - 1, fz);
  if (below === null || !isSolid(below)) return false;
  if (overlaps(world, x, y, z)) return false;
  for (let cy = fy; cy <= Math.floor(y + CHARACTER_HEIGHT - 1e-3); cy++) if (water(world, fx, cy, fz)) return false;
  const cx = worldToChunkX(fx), cz = worldToChunkZ(fz);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ids = world.entityChunks.get(chunkKey(cx + dx, cz + dz));
      if (!ids) continue;
      for (const id of ids) {
        const e = world.entities.get(id);
        if (!e || e.harvested || isRetiredStoneKind(e.kind) || world.entityRemovals.has(id) || e.kind === 'styl_shrub') continue;
        if (y > e.y + 3 || y + CHARACTER_HEIGHT < e.y) continue;
        const body = e.kind.startsWith('styl_tree_') ? STAGE_TRUNK[growthStage(e) ?? 'mature'] * e.scale
          : (OBSTRUCTION_RADIUS[e.kind as ActiveEntityKind] ?? 0.5) * 0.75 * e.scale;
        if (Math.hypot(x - e.x, z - e.z) < body + CHARACTER_RADIUS + 0.1) return false;
      }
    }
  }
  return true;
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
