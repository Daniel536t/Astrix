// Hydrology — the deterministic water network of a world (pure TypeScript, D-005).
//
// This is derived *simulation data*, not presentation: it is a pure function of
// (seed, generator version) and is what terrain carving, water filling, flow
// direction and future fishing/irrigation/flooding rules read. It is never
// journaled because it can always be regenerated exactly.
//
// Network (both generator versions):
//   lake  — the valley lake basin, located from the actual generated terrain.
//   lower — the lowland river from the lake to the southern sea, traced from
//           the actual carved channel (the v1 channel is carved on *warped*
//           coordinates, so `riverCenterX` alone is up to ~135 m off).
// Generator v2 adds:
//   upper — a mountain river from a highland tarn down to the lake, with a
//           water-surface level that never rises downstream, cascades and falls.
//
// Flow always points downstream: upper → lake → lower → sea.
import { clamp, fbm2, mulberry32, smoothstep } from './noise';

export type HeightSampler = (x: number, z: number) => number;

export interface RiverPoint {
  x: number;
  z: number;
  /** Arc length from the downstream end of this reach (metres). */
  s: number;
  /** Water-surface elevation (metres, may be fractional). */
  level: number;
  /** Channel half-width (metres). */
  width: number;
}

export interface ReachHit {
  /** Horizontal distance from the centreline. */
  d: number;
  /** Interpolated water level at the nearest centreline point. */
  level: number;
  width: number;
  /** Unit downstream direction. */
  tx: number;
  tz: number;
  /** Water-surface drop per metre along the channel (>= 0). */
  gradient: number;
  /** Arc length of the nearest point from the downstream end. */
  s: number;
}

/**
 * A polyline reach stored downstream-first. Nearest-segment queries use a
 * uniform grid whose cells list every segment within `reach` metres.
 */
export class RiverReach {
  readonly points: RiverPoint[];
  private readonly cell = 32;
  private readonly grid = new Map<number, number[]>();

  constructor(points: RiverPoint[], readonly reach: number) {
    this.points = points;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1];
      const x0 = Math.min(a.x, b.x) - reach, x1 = Math.max(a.x, b.x) + reach;
      const z0 = Math.min(a.z, b.z) - reach, z1 = Math.max(a.z, b.z) + reach;
      for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
        for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
          const key = cellKey(cx, cz);
          let list = this.grid.get(key);
          if (!list) { list = []; this.grid.set(key, list); }
          list.push(i);
        }
      }
    }
  }

  get length(): number { return this.points[this.points.length - 1]?.s ?? 0; }

  /** Nearest centreline point within `reach`, or null. */
  nearest(x: number, z: number): ReachHit | null {
    const list = this.grid.get(cellKey(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!list) return null;
    let best = Infinity, bi = -1, bt = 0;
    for (const i of list) {
      const a = this.points[i], b = this.points[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    if (bi < 0 || best > this.reach * this.reach) return null;
    const a = this.points[bi], b = this.points[bi + 1];
    const segLen = Math.max(1e-6, b.s - a.s);
    // Points are stored downstream-first, so downstream is a <- b.
    const tx = (a.x - b.x) / segLen, tz = (a.z - b.z) / segLen;
    return {
      d: Math.sqrt(best),
      level: a.level + (b.level - a.level) * bt,
      width: a.width + (b.width - a.width) * bt,
      tx, tz,
      gradient: Math.max(0, (b.level - a.level) / segLen),
      s: a.s + (b.s - a.s) * bt,
    };
  }
}

function cellKey(cx: number, cz: number): number {
  return (cx + 4096) * 8192 + (cz + 4096);
}

export type WaterBody = 'river' | 'lake' | 'sea' | 'none';

export interface FlowSample {
  body: WaterBody;
  /** Unit flow direction (zero for still water). */
  dx: number;
  dz: number;
  /** Surface current speed in m/s. */
  speed: number;
}

export interface HydrologyOptions {
  seed: number;
  /** Generator version the network belongs to. */
  version: number;
  /** Base height of the *unmodified v1 shape* (used to locate lake/channel). */
  v1Height: HeightSampler;
}

/** Deterministic hydrological network for one (seed, generator version). */
export class Hydrology {
  readonly seed: number;
  readonly version: number;
  readonly lake: { x: number; z: number; rx: number; rz: number };
  readonly lower: RiverReach;
  readonly upper: RiverReach | null;
  /** Upper-river source tarn (v2 only). */
  readonly tarn: { x: number; z: number; r: number; level: number } | null;

  constructor(opts: HydrologyOptions) {
    this.seed = opts.seed;
    this.version = opts.version;
    this.lake = locateLake(opts.v1Height);
    this.lower = traceLowerRiver(opts.v1Height, this.lake);
    if (opts.version >= 2) {
      const upper = authorUpperRiver(opts.seed, this.lake);
      this.upper = upper.reach;
      this.tarn = upper.tarn;
    } else {
      this.upper = null;
      this.tarn = null;
    }
  }

  /**
   * Surface current for a water column. `level` is the column's water surface,
   * used to tell sea-level water (lake, lower river, sea) from the upper river.
   */
  flowAt(x: number, z: number, level: number): FlowSample {
    if (this.upper && level > 0.5) {
      const hit = this.upper.nearest(x, z);
      if (hit && hit.d <= hit.width + 2) {
        const speed = clamp(0.55 + hit.gradient * 9, 0.4, 4.5);
        return { body: 'river', dx: hit.tx, dz: hit.tz, speed };
      }
      if (this.tarn && Math.hypot(x - this.tarn.x, z - this.tarn.z) < this.tarn.r + 4) {
        return { body: 'lake', ...towards(x, z, this.upperSource(), 0.06) };
      }
    }
    const low = this.lower.nearest(x, z);
    if (low && low.d <= low.width + 6) {
      return { body: 'river', dx: low.tx, dz: low.tz, speed: 0.35 + 0.25 * smoothstep(low.width + 6, 0, low.d) };
    }
    const ld = Math.hypot((x - this.lake.x) / this.lake.rx, (z - this.lake.z) / this.lake.rz);
    if (ld < 1.35) {
      // Slow drift from the inflow toward the outflow at the head of the lower river.
      const head = this.lower.points[this.lower.points.length - 1];
      const drift = towards(x, z, head, 0.08);
      return { body: 'lake', ...drift };
    }
    return { body: 'sea', dx: 0, dz: 0, speed: 0 };
  }

  private upperSource(): { x: number; z: number } {
    const pts = this.upper!.points;
    return pts[pts.length - 1];
  }
}

function towards(x: number, z: number, p: { x: number; z: number }, speed: number) {
  const dx = p.x - x, dz = p.z - z;
  const len = Math.hypot(dx, dz) || 1;
  return { dx: dx / len, dz: dz / len, speed };
}

/** Find the valley lake from the terrain itself: the deep basin NW of the founder valley. */
function locateLake(h: HeightSampler): Hydrology['lake'] {
  let sx = 0, sz = 0, n = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let z = -460; z <= -120; z += 4) {
    for (let x = -480; x <= -40; x += 4) {
      if (h(x, z) > -4) continue;
      sx += x; sz += z; n++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  if (n === 0) return { x: -260, z: -230, rx: 120, rz: 95 };
  return {
    x: sx / n, z: sz / n,
    rx: Math.max(30, (maxX - minX) / 2 + 10), rz: Math.max(30, (maxZ - minZ) / 2 + 10),
  };
}

/**
 * Trace the carved lowland channel from the lake outflow south to the sea. For
 * each 4 m row the channel is the lowest column near the previous centre; the
 * trace is smoothed so the flow field does not jitter with the 1 m voxels.
 */
function traceLowerRiver(h: HeightSampler, lake: Hydrology['lake']): RiverReach {
  const raw: Array<{ x: number; z: number }> = [];
  let cx = lake.x + lake.rx * 0.55;
  let z = Math.round(lake.z + lake.rz * 0.6);
  // Start at the lake's south-east outflow and follow the channel downstream.
  for (; z <= 900; z += 4) {
    let best = Infinity, bx = cx;
    for (let x = Math.round(cx - 40); x <= cx + 40; x += 2) {
      const v = h(x, z) + Math.abs(x - cx) * 0.02;
      if (v < best) { best = v; bx = x; }
    }
    cx = bx;
    raw.push({ x: bx, z });
    // The trace ends once it reaches open sea for a sustained stretch.
    if (best < -6 && raw.length > 20 && h(bx, z + 8) < -6 && h(bx, z + 16) < -6) break;
  }
  const smooth = raw.map((p, i) => {
    let sx = 0, n = 0;
    for (let k = Math.max(0, i - 4); k <= Math.min(raw.length - 1, i + 4); k++) { sx += raw[k].x; n++; }
    return { x: sx / n, z: p.z };
  });
  // Store downstream-first: index 0 is the sea mouth.
  smooth.reverse();
  const points: RiverPoint[] = [];
  let s = 0;
  for (let i = 0; i < smooth.length; i++) {
    if (i > 0) s += Math.hypot(smooth[i].x - smooth[i - 1].x, smooth[i].z - smooth[i - 1].z);
    points.push({ x: smooth[i].x, z: smooth[i].z, s, level: 0, width: 6 });
  }
  return new RiverReach(points, 40);
}

/** Water-surface drops along the upper river, as (fraction of length, metres). */
const FALLS: ReadonlyArray<readonly [number, number]> = [[0.2, 7], [0.48, 11], [0.74, 13]];
const UPPER_GRADIENT = 0.03;

/**
 * Author the v2 mountain river: a seeded meandering centreline from the lake's
 * north shore to a highland tarn, with a level profile that only rises
 * upstream (gentle gradient plus three cascades).
 */
function authorUpperRiver(seed: number, lake: Hydrology['lake']): {
  reach: RiverReach; tarn: NonNullable<Hydrology['tarn']>;
} {
  const rnd = mulberry32((seed ^ 0x5eed2) >>> 0);
  const j = (a: number) => (rnd() - 0.5) * 2 * a;
  const mouth = { x: lake.x + lake.rx * 0.1, z: lake.z - lake.rz * 0.55 };
  const controls = [
    mouth,
    { x: lake.x + 20 + j(20), z: -410 + j(15) },
    { x: -190 + j(35), z: -520 + j(20) },
    { x: -215 + j(35), z: -640 + j(20) },
    { x: -165 + j(30), z: -770 + j(15) },
  ];
  // Catmull-Rom through the controls, then resample at ~8 m spacing with a
  // small seeded meander so the channel is not a smooth spline.
  const dense: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)], p1 = controls[i];
    const p2 = controls[i + 1], p3 = controls[Math.min(controls.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      dense.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
          + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2
          + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  dense.push(controls[controls.length - 1]);
  const resampled: Array<{ x: number; z: number; s: number }> = [{ ...dense[0], s: 0 }];
  let acc = 0, s = 0;
  for (let i = 1; i < dense.length; i++) {
    const step = Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
    acc += step; s += step;
    if (acc >= 8 || i === dense.length - 1) {
      const m = (fbm2(s / 60, 3.1, seed + 801, 2) - 0.5) * 14;
      resampled.push({ x: dense[i].x + m, z: dense[i].z, s });
      acc = 0;
    }
  }
  const total = resampled[resampled.length - 1].s;
  const levelAt = (sv: number): number => {
    let level = sv * UPPER_GRADIENT;
    for (const [frac, drop] of FALLS) {
      // Each fall is a short cascade over ~10 m of channel.
      level += drop * smoothstep(total * frac - 5, total * frac + 5, sv);
    }
    // The first 40 m into the lake stays at lake level.
    return sv < 40 ? 0 : level - 40 * UPPER_GRADIENT;
  };
  const points: RiverPoint[] = resampled.map((p) => ({
    x: p.x, z: p.z, s: p.s, level: Math.max(0, levelAt(p.s)),
    width: 3.2 + 2.2 * fbm2(p.s / 70, 9.7, seed + 802, 2) + (1 - p.s / total) * 1.5,
  }));
  const source = points[points.length - 1];
  return {
    reach: new RiverReach(points, 110),
    tarn: { x: source.x, z: source.z, r: 18, level: source.level },
  };
}
