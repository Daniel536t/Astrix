// Terrain generator v2 — the valley-with-mountains geography (pure TS, D-005).
//
// Compatibility contract: inside the founder corridor (the settlement valley,
// the lake and the lowland river) v2 heights equal v1 exactly, so the pinned
// founder projects, their preparation targets and natural entities there are
// unchanged. Outside it v2 adds:
//   - a northern massif on an extended island, with snow above the snowline;
//   - flanking ranges west and east of the valley, terraced into cliff bands;
//   - a mountain river carved into the massif from a tarn down to the lake,
//     whose water surface comes from Hydrology and never rises downstream;
//   - a continuous lowland channel (v1 has a dry ford south of the shelf).
// Heights are integers in [-14, 104].
import { clamp, fbm2, lerp, smoothstep } from './noise';
import { MAT, MatId } from './materials';
import { Hydrology } from './hydrology';

export const V2_SNOWLINE = 74;
export const V2_MAX_HEIGHT = 104;

export type V1Height = (seed: number, x: number, z: number) => number;

export interface V2Column {
  /** Top solid y + 1 (same convention as surfaceHeightAt). */
  h: number;
  /** Water surface for this column: cells [h, level) hold water. */
  level: number;
  /** True when this column is part of the carved mountain-river channel. */
  channel: boolean;
}

export class TerrainV2 {
  constructor(
    readonly seed: number,
    private readonly v1: V1Height,
    readonly hydrology: Hydrology,
  ) {}

  /** 0 = exactly v1 (founder corridor); 1 = full v2 relief. */
  reliefMask(x: number, z: number): number {
    const north = smoothstep(-390, -470, z);
    // The west range keeps clear of the lake basin until the lake is passed.
    const westEdge = lerp(-450, -320, smoothstep(-220, -140, z));
    const west = smoothstep(westEdge, westEdge - 90, x);
    const east = smoothstep(230, 330, x);
    return Math.max(north, west, east);
  }

  /** 0 at the range front, 1 deep inside: foothills first, peaks behind. */
  rangeDepth(x: number, z: number): number {
    const north = smoothstep(-420, -700, z);
    const westEdge = lerp(-450, -320, smoothstep(-220, -140, z));
    const west = smoothstep(westEdge - 40, westEdge - 300, x);
    const east = smoothstep(270, 560, x);
    return Math.max(north, west, east);
  }

  column(x: number, z: number): V2Column {
    const seed = this.seed;
    const base = this.v1(seed, x, z);
    const mask = this.reliefMask(x, z);
    let h = base;

    if (mask > 0) {
      // Extend the island north so the massif has room (v1 coast is ~z -600).
      const northLand = smoothstep(-420, -520, z);
      const shore = 1 - Math.hypot((x + 150) / 560, (z + 690) / 300)
        + (fbm2(x / 160, z / 160, seed + 701, 3) - 0.5) * 0.3;
      const landN = smoothstep(0.0, 0.14, shore) * northLand;
      const ground = lerp(base, Math.max(base, 5 + 5 * fbm2(x / 90, z / 90, seed + 702, 2)), landN);

      // Ridged massif with terraced cliff bands.
      const wx = x + (fbm2(x / 260, z / 260, seed + 703, 3) - 0.5) * 120;
      const wz = z + (fbm2(x / 260 + 5.1, z / 260 - 2.7, seed + 704, 3) - 0.5) * 120;
      const r1 = 1 - Math.abs(2 * fbm2(wx / 210, wz / 210, seed + 705, 4) - 1);
      const r2 = 1 - Math.abs(2 * fbm2(wx / 80, wz / 80, seed + 706, 3) - 1);
      const lump = fbm2(wx / 120, wz / 120, seed + 707, 3);
      const depth = this.rangeDepth(x, z);
      let mountain = 16 + (8 + 80 * depth) * (0.55 * r1 * r1 + 0.28 * r2 + 0.17 * lump)
        + 18 * depth * smoothstep(0.55, 0.9, r1);
      const band = 6 + 2 * fbm2(x / 140, z / 140, seed + 708, 2);
      const t = Math.floor(mountain / band);
      const frac = mountain / band - t;
      mountain = (t + smoothstep(0.5, 0.8, frac)) * band;

      // Only land rises; the sea stays sea, so ranges end in coastal cliffs.
      const landFactor = smoothstep(-2, 8, ground);
      h = lerp(ground, Math.max(ground, mountain), mask * landFactor);
    }

    let level = h < 0 ? 0 : -Infinity;
    let channel = false;

    // Mountain river: valley floor, banks and channel follow the water level.
    const upper = this.hydrology.upper;
    if (upper) {
      const hit = upper.nearest(x, z);
      if (hit) {
        const raised = hit.level > 0.25;
        const vw = 55 + 28 * fbm2(hit.s / 90, 1.7, seed + 709, 2);
        const floor = hit.level + 1.5 + 2.2 * fbm2(x / 40, z / 40, seed + 710, 2) + hit.d * 0.06;
        const t = smoothstep(vw * 0.3, vw, hit.d);
        h = Math.min(h, lerp(floor, h, t));
        const w = hit.width;
        if (raised && hit.d < w + 3) {
          // Banks hold a raised river: never below its water surface. At lake
          // level the sea-level fill already contains the water.
          h = Math.max(h, Math.ceil(hit.level) + 1);
        }
        if (hit.d < w) {
          const bed = hit.level - (1.2 + 1.3 * (1 - hit.d / w));
          h = Math.min(h, bed);
          if (raised) level = Math.max(level, Math.round(hit.level));
          channel = true;
        }
      }
      const tarn = this.hydrology.tarn;
      if (tarn) {
        const td = Math.hypot(x - tarn.x, z - tarn.z)
          * (1 + 0.2 * (fbm2(x / 30, z / 30, seed + 711, 2) - 0.5));
        if (td < tarn.r + 6) {
          const rim = Math.ceil(tarn.level) + 1;
          if (td >= tarn.r) h = Math.max(h, rim);
          else {
            h = Math.min(Math.max(h, rim), tarn.level - 1 - 3 * smoothstep(tarn.r, 0, td));
            level = Math.max(level, Math.round(tarn.level));
            channel = true;
          }
        }
      }
    }

    // Lowland channel continuity: v1 leaves a dry ford where the shelf meets the river.
    const low = this.hydrology.lower.nearest(x, z);
    if (low && low.d < 2.5 && h >= 0 && base < 4) h = -1;

    h = Math.round(clamp(h, -14, V2_MAX_HEIGHT));
    if (h < 0) level = Math.max(level, 0);
    return { h, level: level === -Infinity ? h : level, channel };
  }

  height(x: number, z: number): number {
    return this.column(x, z).h;
  }

  /** v2 top material. Falls back to the v1 rules for the unchanged corridor. */
  topMaterial(
    x: number, z: number, col: V2Column, slope: number,
    v1Top: (h: number, slope: number) => MatId,
  ): MatId {
    const h = col.h;
    if (col.channel && col.level > h) return MAT.GRAVEL;
    const upper = this.hydrology.upper;
    if (upper && h > 1) {
      const hit = upper.nearest(x, z);
      if (hit && hit.d < hit.width + 2.5 && hit.level > 0.25) {
        return fbm2(x / 6, z / 6, this.seed + 712, 1) > 0.5 ? MAT.GRAVEL : MAT.SAND;
      }
    }
    const snowline = V2_SNOWLINE + (fbm2(x / 70, z / 70, this.seed + 713, 3) - 0.5) * 16;
    if (h >= snowline && slope <= 3) return MAT.SNOW;
    if (h >= snowline - 6 && slope <= 1 && fbm2(x / 20, z / 20, this.seed + 714, 2) > 0.55) return MAT.SNOW;
    if (this.reliefMask(x, z) > 0.5 && h > 30 && slope >= 2) return MAT.STONE;
    return v1Top(h, slope);
  }
}
