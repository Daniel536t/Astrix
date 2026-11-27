// W9 (wilderness content v10): persistent wild horses, taming, tack and riding.
// Pure TypeScript simulation rules — zero Three.js imports (D-005).
import { World, HALF, baseHeightAt, baseWaterLevelAt, surfaceAt, waterDepthAt } from './world';
import { wildernessSpawn } from './wilderness';

export const WILD_CONTENT_V10 = 10 as const;

export const HORSE_COATS = ['paint', 'brown', 'white', 'black'] as const;
export type HorseCoat = (typeof HORSE_COATS)[number];

export const HORSE_TEMPERAMENTS = ['calm', 'spirited', 'shy'] as const;
export type HorseTemperament = (typeof HORSE_TEMPERAMENTS)[number];

export const HORSE_BEHAVIORS = ['idle', 'graze', 'walk', 'flee', 'approach', 'rest', 'mounted'] as const;
export type HorseBehavior = (typeof HORSE_BEHAVIORS)[number];

export const HORSE_GAITS = ['walk', 'trot', 'gallop'] as const;
export type HorseGait = (typeof HORSE_GAITS)[number];

export const HORSE_REACH = 4.5;
export const FEED_COOLDOWN_TICKS = 2;
export const HORSE_MAX_TRUST = 100;
export const HORSE_MAX_STAMINA = 100;
export const HORSE_GALLOP_MIN_STAMINA = 15;
export const HORSE_ID = /^h:\d{1,3}$/;

export const HORSE_FEED_ITEMS = ['berries', 'grass'] as const;
export type HorseFeedItem = (typeof HORSE_FEED_ITEMS)[number];

/** Riding speed multipliers (m/s) read by the exploration controller. */
export const HORSE_GAIT_SPEED: Record<HorseGait, number> = {
  walk: 4.8,
  trot: 8.6,
  gallop: 13.2,
};

export interface HorseRecord {
  id: string;
  coat: HorseCoat;
  temperament: HorseTemperament;
  /** Position in decimetres (dm, integer). */
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
  /** Facing angle in milliradians (integer). */
  yaw: number;
  state: HorseBehavior;
  /** 0..100; reaching 100 tames the horse. */
  trust: number;
  tamed: boolean;
  saddled: boolean;
  bridled: boolean;
  /** 0..100; drains on trot/gallop, recovers on walk/idle/graze. */
  stamina: number;
  lastFedTick: number;
  feeds: number;
}

export interface HorsesState {
  horses: Map<string, HorseRecord>;
  mountedId: string | null;
  gait: HorseGait;
  seeded: boolean;
}

export interface HorsesSnapshot {
  gait: HorseGait;
  horses: HorseRecord[];
  mountedId?: string;
  seeded: boolean;
}

export function createHorses(): HorsesState {
  return { horses: new Map(), mountedId: null, gait: 'walk', seeded: false };
}

/** Deterministic PRNG helper (Mulberry32 step). */
function hash32(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Deterministically populate wild horses on dry land around the wilderness spawn valley
 * the first time horses are stepped (or explicitly seeded). Never creates horses
 * in water or out of bounds, and uses pure base terrain queries (no chunk side effects).
 */
export function ensureWildHorses(world: World): void {
  const hs = world.wild?.horses;
  if (!hs || hs.seeded) return;
  hs.seeded = true;
  const gen = world.params.generatorVersion;
  const origin = wildernessSpawn(world.seed, gen);
  const count = 6;
  const baseAngles = [0.35, 1.4, 2.55, 3.65, 4.75, 5.65];
  for (let i = 0; i < count; i++) {
    const r0 = hash32(world.seed, 900 + i * 17);
    const r1 = hash32(world.seed, 901 + i * 17);
    const coat = HORSE_COATS[i < 4 ? i : r0 % HORSE_COATS.length];
    const temperament = HORSE_TEMPERAMENTS[i === 0 ? 0 : r1 % HORSE_TEMPERAMENTS.length];
    const baseAngle = baseAngles[i] + (((r0 & 0xff) / 255) - 0.5) * 0.35;
    // Place horse 1 near wilderness spawn (14-24 m) so the player can discover a wild horse naturally; others 24-60 m out.
    let placedX = Math.round(origin.x) * 10;
    let placedZ = Math.round(origin.z) * 10;
    let found = false;
    const minDist = i === 0 ? 14 : 24 + (i * 6);
    for (let attempt = 0; attempt < 24; attempt++) {
      const dist = minDist + attempt * 2.5;
      const ang = baseAngle + (attempt % 5) * 0.18;
      const wx = Math.round(origin.x + Math.cos(ang) * dist);
      const wz = Math.round(origin.z + Math.sin(ang) * dist);
      if (Math.abs(wx) >= HALF - 8 || Math.abs(wz) >= HALF - 8) continue;
      const y0 = baseHeightAt(world.seed, gen, wx, wz);
      if (baseWaterLevelAt(world.seed, gen, wx, wz) > y0) continue;
      const y1 = baseHeightAt(world.seed, gen, wx + 1, wz);
      const y2 = baseHeightAt(world.seed, gen, wx, wz + 1);
      if (Math.abs(y0 - y1) <= 2 && Math.abs(y0 - y2) <= 2) {
        placedX = wx * 10;
        placedZ = wz * 10;
        found = true;
        break;
      }
    }
    if (!found) {
      placedX = Math.round(origin.x + Math.cos(baseAngle) * 16) * 10;
      placedZ = Math.round(origin.z + Math.sin(baseAngle) * 16) * 10;
    }
    const id = `h:${i + 1}`;
    hs.horses.set(id, {
      id,
      coat,
      temperament,
      x: placedX,
      z: placedZ,
      homeX: placedX,
      homeZ: placedZ,
      yaw: Math.round(((r1 % 6283) - 3141)),
      state: i % 2 === 0 ? 'graze' : 'idle',
      trust: 0,
      tamed: false,
      saddled: false,
      bridled: false,
      stamina: HORSE_MAX_STAMINA,
      lastFedTick: -100,
      feeds: 0,
    });
  }
}

export function horsesNear(world: World, x: number, z: number, radius: number): { h: HorseRecord; d: number }[] {
  const hs = world.wild?.horses;
  if (!hs) return [];
  const out: { h: HorseRecord; d: number }[] = [];
  for (const h of hs.horses.values()) {
    const d = Math.hypot(h.x / 10 - x, h.z / 10 - z);
    if (d <= radius) out.push({ h, d });
  }
  return out.sort((a, b) => a.d - b.d || a.h.id.localeCompare(b.h.id));
}

export function mountedHorse(world: World): HorseRecord | null {
  const hs = world.wild?.horses;
  if (!hs || !hs.mountedId) return null;
  return hs.horses.get(hs.mountedId) ?? null;
}

/** Trust gain per legitimate feeding: always requires multiple feedings (3-6), never 1-click. */
export function feedTrustGain(temperament: HorseTemperament, item: HorseFeedItem): number {
  const base = temperament === 'calm' ? 25 : temperament === 'spirited' ? 20 : 18;
  return base + (item === 'berries' ? 5 : 0);
}

/** Step wild horse AI, fleeing/approach, grazing, and mounted stamina on each world tick. */
export function stepHorses(world: World, tick: number, presence?: { x: number; z: number }): void {
  const hs = world.wild?.horses;
  if (!hs) return;
  if (!hs.seeded) ensureWildHorses(world);

  for (const h of hs.horses.values()) {
    if (hs.mountedId === h.id) {
      h.state = 'mounted';
      if (presence) {
        const dx = presence.x - h.x;
        const dz = presence.z - h.z;
        if (dx !== 0 || dz !== 0) {
          h.yaw = Math.round(Math.atan2(dx, dz) * 1000);
          h.x = presence.x;
          h.z = presence.z;
        }
      }
      if (hs.gait === 'gallop') {
        h.stamina = Math.max(0, h.stamina - 6);
        if (h.stamina <= 5) hs.gait = 'trot';
      } else if (hs.gait === 'trot') {
        h.stamina = Math.max(0, h.stamina - 2);
        if (h.stamina === 0) hs.gait = 'walk';
      } else {
        h.stamina = Math.min(HORSE_MAX_STAMINA, h.stamina + 8);
      }
      continue;
    }

    // Unmounted horse recovers stamina
    h.stamina = Math.min(HORSE_MAX_STAMINA, h.stamina + 10);

    const hnum = Number(h.id.slice(2)) || 1;
    const rng = hash32(world.seed + tick * 31, hnum * 73);

    // React to player proximity if untamed
    if (presence && !h.tamed) {
      const dx = h.x - presence.x;
      const dz = h.z - presence.z;
      const distDm = Math.hypot(dx, dz);
      const spookRangeDm = h.temperament === 'shy' ? 36 : h.temperament === 'spirited' ? 28 : 0;
      if (spookRangeDm > 0 && distDm < spookRangeDm && h.trust < 40 && distDm > 1) {
        // Spook and trot/flee away from sudden proximity
        const stepDm = 28;
        const nx = Math.round(h.x + (dx / distDm) * stepDm);
        const nz = Math.round(h.z + (dz / distDm) * stepDm);
        const wx = Math.round(nx / 10), wz = Math.round(nz / 10);
        if (Math.abs(wx) < HALF - 4 && Math.abs(wz) < HALF - 4 && waterDepthAt(world, wx, wz) <= 0.05) {
          h.x = nx;
          h.z = nz;
          h.yaw = Math.round(Math.atan2(dx, dz) * 1000);
          h.state = 'flee';
          continue;
        }
      } else if (distDm < 120 && h.trust >= 40) {
        // Partially trusted horse faces player calmly
        h.yaw = Math.round(Math.atan2(-dx, -dz) * 1000);
        h.state = distDm > 40 ? 'approach' : 'idle';
        continue;
      }
    }

    // Tamed unmounted horse stays calm near where left
    if (h.tamed) {
      h.state = (rng % 5 === 0) ? 'graze' : 'idle';
      continue;
    }

    // Wild ambient cycle: graze / idle / gentle wander within 12 m of home meadow
    const phase = rng % 10;
    if (phase < 4) {
      h.state = 'graze';
    } else if (phase < 7) {
      h.state = 'idle';
    } else if (phase === 7) {
      h.state = 'rest';
    } else {
      const ang = ((rng >>> 8) % 628) / 100;
      const stepDm = 16;
      let tx = h.x + Math.round(Math.cos(ang) * stepDm);
      let tz = h.z + Math.round(Math.sin(ang) * stepDm);
      // Pull back toward home meadow if > 14 m away
      if (Math.hypot(tx - h.homeX, tz - h.homeZ) > 140) {
        tx = Math.round((h.x + h.homeX) / 2);
        tz = Math.round((h.z + h.homeZ) / 2);
      }
      const wx = Math.round(tx / 10), wz = Math.round(tz / 10);
      if (Math.abs(wx) < HALF - 4 && Math.abs(wz) < HALF - 4 && waterDepthAt(world, wx, wz) <= 0.05) {
        h.yaw = Math.round(Math.atan2(tx - h.x, tz - h.z) * 1000);
        h.x = tx;
        h.z = tz;
        h.state = 'walk';
      } else {
        h.state = 'idle';
      }
    }
  }
}

export function horseGroundY(world: World, h: HorseRecord): number {
  return surfaceAt(world, Math.round(h.x / 10), Math.round(h.z / 10));
}

// ---------- snapshot ----------
export function horsesSnapshot(hs: HorsesState): HorsesSnapshot {
  const horses = [...hs.horses.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((h) => ({ ...h }));
  return {
    gait: hs.gait,
    horses,
    ...(hs.mountedId ? { mountedId: hs.mountedId } : {}),
    seeded: hs.seeded,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const intRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

export function validateHorses(value: unknown): HorsesSnapshot {
  const bad = (what: string): never => { throw new Error(`snapshot horses: invalid ${what}`); };
  if (!isObj(value)) bad('object');
  const v = value as Record<string, unknown>;
  if (!HORSE_GAITS.includes(v.gait as HorseGait)) bad('gait');
  if (typeof v.seeded !== 'boolean') bad('seeded');
  if (!Array.isArray(v.horses) || v.horses.length > 64) bad('horses array');
  const seen = new Set<string>();
  const horses: HorseRecord[] = [];
  for (const raw of v.horses as unknown[]) {
    if (!isObj(raw)) bad('horse entry');
    const h = raw as Record<string, unknown>;
    if (typeof h.id !== 'string' || !HORSE_ID.test(h.id) || seen.has(h.id)) bad('horse id');
    if (!HORSE_COATS.includes(h.coat as HorseCoat)) bad('coat');
    if (!HORSE_TEMPERAMENTS.includes(h.temperament as HorseTemperament)) bad('temperament');
    if (!HORSE_BEHAVIORS.includes(h.state as HorseBehavior)) bad('state');
    const lim = HALF * 10;
    if (!intRange(h.x, -lim, lim) || !intRange(h.z, -lim, lim) || !intRange(h.homeX, -lim, lim) || !intRange(h.homeZ, -lim, lim)) bad('coords');
    if (!intRange(h.yaw, -10000, 10000)) bad('yaw');
    if (!intRange(h.trust, 0, HORSE_MAX_TRUST) || !intRange(h.stamina, 0, HORSE_MAX_STAMINA)) bad('stats');
    if (typeof h.tamed !== 'boolean' || typeof h.saddled !== 'boolean' || typeof h.bridled !== 'boolean') bad('flags');
    if (!intRange(h.lastFedTick, -1000, 10_000_000) || !intRange(h.feeds, 0, 100_000)) bad('feeds');
    const id = h.id as string;
    seen.add(id);
    horses.push({
      id,
      coat: h.coat as HorseCoat,
      temperament: h.temperament as HorseTemperament,
      x: h.x as number,
      z: h.z as number,
      homeX: h.homeX as number,
      homeZ: h.homeZ as number,
      yaw: h.yaw as number,
      state: h.state as HorseBehavior,
      trust: h.trust as number,
      tamed: h.tamed as boolean,
      saddled: h.saddled as boolean,
      bridled: h.bridled as boolean,
      stamina: h.stamina as number,
      lastFedTick: h.lastFedTick as number,
      feeds: h.feeds as number,
    });
  }
  if (v.mountedId !== undefined && (typeof v.mountedId !== 'string' || !seen.has(v.mountedId))) bad('mountedId');
  return {
    gait: v.gait as HorseGait,
    horses,
    ...(v.mountedId ? { mountedId: v.mountedId as string } : {}),
    seeded: v.seeded as boolean,
  };
}

export function restoreHorses(snap: HorsesSnapshot): HorsesState {
  const horses = new Map<string, HorseRecord>();
  for (const h of snap.horses) horses.set(h.id, { ...h });
  return {
    horses,
    mountedId: snap.mountedId ?? null,
    gait: snap.gait,
    seeded: snap.seeded,
  };
}
