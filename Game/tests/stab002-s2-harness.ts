// STAB-002 S2 shared harness (not a test file): a founded v7 farm, resident
// terrain, the founder walking at 60 fps or with the game's fixed 1/30 s steps
// against capsules derived from sim state, and journaled ticks every 2 s
// carrying the founder's quantised presence, as main.ts does.
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2, World, ensureChunk, residentSurfaceAt, surfaceAt, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import { DM, SPECIES_RULES, facility, homesteadNav, playerPresence } from '../src/sim/homestead';
import type { Animal, EnclosureId, HomesteadState, Species } from '../src/sim/homestead';
import {
  CHARACTER_RADIUS, CharacterInput, CharacterState, FIXED_STEP, canStandAt, createCharacter, findStandingY, stepCharacter,
} from '../src/sim/character';
import { DynamicBody, HomesteadBodies, penetration } from '../src/sim/bodies';
import type { Presence } from '../src/sim/bodies';

export type Session = GameSession;
let seq = 0;
export const send = (s: Session, c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `s2:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
export const ok = (s: Session, c: Record<string, unknown>) => { const r = send(s, c); assert.ok(r.ok, `${String(c.type)}: ${JSON.stringify(r)}`); return r; };
export const tick = (s: Session, presence?: Presence | null) => ok(s, { type: 'tick', ticks: 1, ...(presence ? { presence } : {}) });

export function resident(world: World, x: number, z: number, r = 2): void {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) ensureChunk(world, worldToChunkX(x) + dx, worldToChunkZ(z) + dz);
}
/** A founded farm (rules v7 unless given) with the terrain around it resident, as in the game. */
export function farm(rules = 7, seed = 1337): Session {
  const s = GameSession.genesis(seed, GENERATOR_V2);
  ok(s, { type: 'found_homestead', rules });
  const h = s.world.homestead!;
  resident(s.world, h.anchorX / DM, h.anchorZ / DM, 3);
  homesteadNav(s.world, h);
  return s;
}
export const ground = (world: World) => (x: number, z: number) => {
  const fx = Math.floor(x), fz = Math.floor(z);
  return residentSurfaceAt(world, fx, fz) ?? surfaceAt(world, fx, fz);
};
const adultAge = (sp: Species) => SPECIES_RULES[sp].adultAge;

/**
 * A straight, flat, clear walk of `len` m inside an enclosure: start point
 * and unit direction. The founder can stand all along it.
 */
export function stretchIn(s: Session, id: EnclosureId, len: number): { x: number; z: number; y: number; dx: number; dz: number } {
  const world = s.world, h = s.world.homestead!;
  const r = facility(h, id)!.rect;
  const x0 = r.x0 / DM + 0.8, x1 = r.x1 / DM - 0.8, z0 = r.z0 / DM + 0.8, z1 = r.z1 / DM - 0.8;
  for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    for (let z = z0; z <= z1; z += 0.5) for (let x = x0; x <= x1; x += 0.5) {
      const ex = x + dx * len, ez = z + dz * len;
      if (ex < x0 || ex > x1 || ez < z0 || ez > z1) continue;
      const y = findStandingY(world, x, z, 80);
      if (y === null) continue;
      let good = true;
      for (let k = 0; k <= len && good; k += 0.25) {
        const px = x + dx * k, pz = z + dz * k, yy = findStandingY(world, px, pz, 80);
        if (yy === null || yy !== y || !canStandAt(world, px, yy, pz)) good = false;
      }
      if (good) return { x, z, y, dx, dz };
    }
  }
  throw new Error(`no ${len} m stretch in the ${id}`);
}

export interface Sample { t: number; px: number; pz: number; gap: number; id: string; overlap: number }

/**
 * The founder walking in real time. Each frame: capsules from sim state
 * (`HomesteadBodies`, as main.ts builds them), the character steps (one step
 * of 1/60 s per frame, or the game's fixed 1/30 s steps), then a journaled
 * tick with the founder's presence when 2 s have passed.
 */
export class Walk {
  t = 0;
  ch: CharacterState;
  readonly bodies = new HomesteadBodies(2);
  private acc = 0;
  private simAcc = 0;
  readonly samples: Sample[] = [];
  minGap = Infinity;
  minGapId = '';
  ticks = 0;
  extra: DynamicBody[] = [];
  intent = { x: 0, z: 0 };
  constructor(readonly s: Session, x: number, z: number, readonly mode: '60fps' | 'fixed' = '60fps', readonly presence = true) {
    this.ch = createCharacter(x, findStandingY(s.world, x, z, 80)!, z);
    for (let i = 0; i < 10; i++) this.ch = stepCharacter(s.world, this.ch, { moveX: 0, moveZ: 0, run: false, jump: false });
  }
  current(): DynamicBody[] {
    const h = this.s.world.homestead!, tick = this.s.world.life!.tick, now = this.t * 1000;
    const out: DynamicBody[] = [];
    this.bodies.observe(h, tick, now);
    this.bodies.collect(h, tick, now, this.ch.x, this.ch.z, 8, ground(this.s.world), adultAge, out, CHARACTER_RADIUS);
    return [...out, ...this.extra];
  }
  frame(input: Partial<CharacterInput>, dt = 1 / 60): void {
    const inp: CharacterInput = { moveX: 0, moveZ: 0, run: false, jump: false, ...input };
    this.intent = { x: inp.moveX, z: inp.moveZ };
    const bodies = this.current();
    if (this.mode === '60fps') this.ch = stepCharacter(this.s.world, this.ch, inp, dt, bodies);
    else {
      this.acc += dt;
      while (this.acc >= FIXED_STEP) { this.ch = stepCharacter(this.s.world, this.ch, inp, FIXED_STEP, bodies); this.acc -= FIXED_STEP; }
    }
    this.t += dt;
    // Contact measured against the same capsules after the step.
    for (const b of bodies) {
      const gap = -penetration(b, this.ch.x, this.ch.z, CHARACTER_RADIUS);
      if (gap < this.minGap) { this.minGap = gap; this.minGapId = b.id; }
    }
    this.simAcc += dt;
    if (this.simAcc >= 2) {
      this.simAcc -= 2;
      tick(this.s, this.presence ? playerPresence(this.s.world, this.ch, this.intent) : null);
      this.ticks++;
    }
  }
  /** Walk toward a point for up to `seconds` (stops within 0.2 m). */
  walkTo(x: number, z: number, seconds: number, run = false, each?: () => void): void {
    for (let f = 0; f < seconds * 60; f++) {
      const dx = x - this.ch.x, dz = z - this.ch.z, d = Math.hypot(dx, dz);
      this.frame(d > 0.2 ? { moveX: dx / d, moveZ: dz / d, run } : {});
      each?.();
    }
  }
  stand(seconds: number, each?: () => void): void { for (let f = 0; f < seconds * 60; f++) { this.frame({}); each?.(); } }
}

/** Gap (m) between the founder's disc and an animal's capsule from the drawn-equivalent sim blend. */
export function animalBody(w: Walk, a: Animal): DynamicBody | undefined {
  return w.current().find((b) => b.id === a.id);
}
export const animalsOf = (h: HomesteadState, sp: Species) => h.animals.filter((a) => a.species === sp).sort((a, b) => a.id.localeCompare(b.id));
export { CHARACTER_RADIUS };
