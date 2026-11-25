// tests/m011.swimming.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE3 from "three";

// src/sim/stone-compat.ts
var states = /* @__PURE__ */ new WeakMap();
function isStoneReplay(world) {
  return states.get(world)?.active ?? false;
}

// src/sim/noise.ts
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var lerp = (a, b, t) => a + (b - a) * t;
var smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
function hash2i(x, y, seed) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function hash3i(x, y, z, seed) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var smooth = (t) => t * t * (3 - 2 * t);
function valueNoise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2i(xi, yi, seed), b = hash2i(xi + 1, yi, seed);
  const c = hash2i(xi, yi + 1, seed), d = hash2i(xi + 1, yi + 1, seed);
  const top = a + (b - a) * xf;
  const bottom = c + (d - c) * xf;
  return top + (bottom - top) * yf;
}
function fbm2(x, y, seed, octaves) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
function valueNoise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const c000 = hash3i(xi, yi, zi, seed), c100 = hash3i(xi + 1, yi, zi, seed);
  const c010 = hash3i(xi, yi + 1, zi, seed), c110 = hash3i(xi + 1, yi + 1, zi, seed);
  const c001 = hash3i(xi, yi, zi + 1, seed), c101 = hash3i(xi + 1, yi, zi + 1, seed);
  const c011 = hash3i(xi, yi + 1, zi + 1, seed), c111 = hash3i(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * xf;
  const x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf;
  const x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf;
  const y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}
function fbm3(x, y, z, seed, octaves) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// src/sim/hydrology.ts
var RiverReach = class {
  constructor(points, reach) {
    this.reach = reach;
    this.points = points;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1];
      const x0 = Math.min(a.x, b.x) - reach, x1 = Math.max(a.x, b.x) + reach;
      const z0 = Math.min(a.z, b.z) - reach, z1 = Math.max(a.z, b.z) + reach;
      for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
        for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
          const key = cellKey(cx, cz);
          let list = this.grid.get(key);
          if (!list) {
            list = [];
            this.grid.set(key, list);
          }
          list.push(i);
        }
      }
    }
  }
  reach;
  points;
  cell = 32;
  grid = /* @__PURE__ */ new Map();
  get length() {
    return this.points[this.points.length - 1]?.s ?? 0;
  }
  /** Nearest centreline point within `reach`, or null. */
  nearest(x, z) {
    const list = this.grid.get(cellKey(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!list) return null;
    let best = Infinity, bi = -1, bt = 0;
    for (const i of list) {
      const a2 = this.points[i], b2 = this.points[i + 1];
      const dx = b2.x - a2.x, dz = b2.z - a2.z;
      const len2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a2.x) * dx + (z - a2.z) * dz) / len2, 0, 1);
      const px = a2.x + dx * t, pz = a2.z + dz * t;
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < best) {
        best = d2;
        bi = i;
        bt = t;
      }
    }
    if (bi < 0 || best > this.reach * this.reach) return null;
    const a = this.points[bi], b = this.points[bi + 1];
    const segLen = Math.max(1e-6, b.s - a.s);
    const tx = (a.x - b.x) / segLen, tz = (a.z - b.z) / segLen;
    return {
      d: Math.sqrt(best),
      level: a.level + (b.level - a.level) * bt,
      width: a.width + (b.width - a.width) * bt,
      tx,
      tz,
      gradient: Math.max(0, (b.level - a.level) / segLen),
      s: a.s + (b.s - a.s) * bt
    };
  }
};
function cellKey(cx, cz) {
  return (cx + 4096) * 8192 + (cz + 4096);
}
var Hydrology = class {
  seed;
  version;
  lake;
  lower;
  upper;
  /** Upper-river source tarn (v2 only). */
  tarn;
  constructor(opts) {
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
  flowAt(x, z, level) {
    if (this.upper && level > 0.5) {
      const hit = this.upper.nearest(x, z);
      if (hit && hit.d <= hit.width + 2) {
        const speed = clamp(0.55 + hit.gradient * 9, 0.4, 4.5);
        return { body: "river", dx: hit.tx, dz: hit.tz, speed };
      }
      if (this.tarn && Math.hypot(x - this.tarn.x, z - this.tarn.z) < this.tarn.r + 4) {
        return { body: "lake", ...towards(x, z, this.upperSource(), 0.06) };
      }
    }
    const low = this.lower.nearest(x, z);
    if (low && low.d <= low.width + 6) {
      return { body: "river", dx: low.tx, dz: low.tz, speed: 0.35 + 0.25 * smoothstep(low.width + 6, 0, low.d) };
    }
    const ld = Math.hypot((x - this.lake.x) / this.lake.rx, (z - this.lake.z) / this.lake.rz);
    if (ld < 1.35) {
      const head = this.lower.points[this.lower.points.length - 1];
      const drift = towards(x, z, head, 0.08);
      return { body: "lake", ...drift };
    }
    return { body: "sea", dx: 0, dz: 0, speed: 0 };
  }
  upperSource() {
    const pts = this.upper.points;
    return pts[pts.length - 1];
  }
};
function towards(x, z, p, speed) {
  const dx = p.x - x, dz = p.z - z;
  const len = Math.hypot(dx, dz) || 1;
  return { dx: dx / len, dz: dz / len, speed };
}
function locateLake(h) {
  let sx = 0, sz = 0, n = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let z = -460; z <= -120; z += 4) {
    for (let x = -480; x <= -40; x += 4) {
      if (h(x, z) > -4) continue;
      sx += x;
      sz += z;
      n++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  if (n === 0) return { x: -260, z: -230, rx: 120, rz: 95 };
  return {
    x: sx / n,
    z: sz / n,
    rx: Math.max(30, (maxX - minX) / 2 + 10),
    rz: Math.max(30, (maxZ - minZ) / 2 + 10)
  };
}
function traceLowerRiver(h, lake) {
  const raw = [];
  let cx = lake.x + lake.rx * 0.55;
  let z = Math.round(lake.z + lake.rz * 0.6);
  for (; z <= 900; z += 4) {
    let best = Infinity, bx = cx;
    for (let x = Math.round(cx - 40); x <= cx + 40; x += 2) {
      const v = h(x, z) + Math.abs(x - cx) * 0.02;
      if (v < best) {
        best = v;
        bx = x;
      }
    }
    cx = bx;
    raw.push({ x: bx, z });
    if (best < -6 && raw.length > 20 && h(bx, z + 8) < -6 && h(bx, z + 16) < -6) break;
  }
  const smooth3 = raw.map((p, i) => {
    let sx = 0, n = 0;
    for (let k = Math.max(0, i - 4); k <= Math.min(raw.length - 1, i + 4); k++) {
      sx += raw[k].x;
      n++;
    }
    return { x: sx / n, z: p.z };
  });
  smooth3.reverse();
  const points = [];
  let s = 0;
  for (let i = 0; i < smooth3.length; i++) {
    if (i > 0) s += Math.hypot(smooth3[i].x - smooth3[i - 1].x, smooth3[i].z - smooth3[i - 1].z);
    points.push({ x: smooth3[i].x, z: smooth3[i].z, s, level: 0, width: 6 });
  }
  return new RiverReach(points, 40);
}
var FALLS = [[0.2, 7], [0.48, 11], [0.74, 13]];
var UPPER_GRADIENT = 0.03;
function authorUpperRiver(seed, lake) {
  const rnd = mulberry32((seed ^ 388818) >>> 0);
  const j = (a) => (rnd() - 0.5) * 2 * a;
  const mouth = { x: lake.x + lake.rx * 0.1, z: lake.z - lake.rz * 0.55 };
  const controls = [
    mouth,
    { x: lake.x + 20 + j(20), z: -410 + j(15) },
    { x: -190 + j(35), z: -520 + j(20) },
    { x: -215 + j(35), z: -640 + j(20) },
    { x: -165 + j(30), z: -770 + j(15) }
  ];
  const dense = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)], p1 = controls[i];
    const p2 = controls[i + 1], p3 = controls[Math.min(controls.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      dense.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
      });
    }
  }
  dense.push(controls[controls.length - 1]);
  const resampled = [{ ...dense[0], s: 0 }];
  let acc = 0, s = 0;
  for (let i = 1; i < dense.length; i++) {
    const step = Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
    acc += step;
    s += step;
    if (acc >= 8 || i === dense.length - 1) {
      const m = (fbm2(s / 60, 3.1, seed + 801, 2) - 0.5) * 14;
      resampled.push({ x: dense[i].x + m, z: dense[i].z, s });
      acc = 0;
    }
  }
  const total = resampled[resampled.length - 1].s;
  const levelAt = (sv) => {
    let level = sv * UPPER_GRADIENT;
    for (const [frac, drop] of FALLS) {
      level += drop * smoothstep(total * frac - 5, total * frac + 5, sv);
    }
    return sv < 40 ? 0 : level - 40 * UPPER_GRADIENT;
  };
  const points = resampled.map((p) => ({
    x: p.x,
    z: p.z,
    s: p.s,
    level: Math.max(0, levelAt(p.s)),
    width: 3.2 + 2.2 * fbm2(p.s / 70, 9.7, seed + 802, 2) + (1 - p.s / total) * 1.5
  }));
  const source = points[points.length - 1];
  return {
    reach: new RiverReach(points, 110),
    tarn: { x: source.x, z: source.z, r: 18, level: source.level }
  };
}

// src/sim/materials.ts
var MAT = {
  AIR: 0,
  GRASS: 1,
  SOIL: 2,
  SAND: 3,
  GRAVEL: 4,
  STONE: 5,
  ORE: 6,
  WATER: 7,
  BEDROCK: 8,
  MOSS: 9,
  /** Generator v2 highlands. Never produced by generator v1. */
  SNOW: 10
};
var isSolid = (m) => m !== MAT.AIR && m !== MAT.WATER;

// src/sim/terrain-v2.ts
var V2_SNOWLINE = 74;
var V2_MAX_HEIGHT = 104;
var TerrainV2 = class {
  constructor(seed, v1, hydrology) {
    this.seed = seed;
    this.v1 = v1;
    this.hydrology = hydrology;
  }
  seed;
  v1;
  hydrology;
  /** 0 = exactly v1 (founder corridor); 1 = full v2 relief. */
  reliefMask(x, z) {
    const north = smoothstep(-390, -470, z);
    const westEdge = lerp(-450, -320, smoothstep(-220, -140, z));
    const west = smoothstep(westEdge, westEdge - 90, x);
    const east = smoothstep(230, 330, x);
    return Math.max(north, west, east);
  }
  /** 0 at the range front, 1 deep inside: foothills first, peaks behind. */
  rangeDepth(x, z) {
    const north = smoothstep(-420, -700, z);
    const westEdge = lerp(-450, -320, smoothstep(-220, -140, z));
    const west = smoothstep(westEdge - 40, westEdge - 300, x);
    const east = smoothstep(270, 560, x);
    return Math.max(north, west, east);
  }
  column(x, z) {
    const seed = this.seed;
    const base = this.v1(seed, x, z);
    const mask = this.reliefMask(x, z);
    let h = base;
    if (mask > 0) {
      const northLand = smoothstep(-420, -520, z);
      const shore = 1 - Math.hypot((x + 150) / 560, (z + 690) / 300) + (fbm2(x / 160, z / 160, seed + 701, 3) - 0.5) * 0.3;
      const landN = smoothstep(0, 0.14, shore) * northLand;
      const ground = lerp(base, Math.max(base, 5 + 5 * fbm2(x / 90, z / 90, seed + 702, 2)), landN);
      const wx = x + (fbm2(x / 260, z / 260, seed + 703, 3) - 0.5) * 120;
      const wz = z + (fbm2(x / 260 + 5.1, z / 260 - 2.7, seed + 704, 3) - 0.5) * 120;
      const r1 = 1 - Math.abs(2 * fbm2(wx / 210, wz / 210, seed + 705, 4) - 1);
      const r2 = 1 - Math.abs(2 * fbm2(wx / 80, wz / 80, seed + 706, 3) - 1);
      const lump = fbm2(wx / 120, wz / 120, seed + 707, 3);
      const depth = this.rangeDepth(x, z);
      let mountain = 16 + (8 + 80 * depth) * (0.55 * r1 * r1 + 0.28 * r2 + 0.17 * lump) + 18 * depth * smoothstep(0.55, 0.9, r1);
      const band = 6 + 2 * fbm2(x / 140, z / 140, seed + 708, 2);
      const t = Math.floor(mountain / band);
      const frac = mountain / band - t;
      mountain = (t + smoothstep(0.5, 0.8, frac)) * band;
      const landFactor = smoothstep(-2, 8, ground);
      h = lerp(ground, Math.max(ground, mountain), mask * landFactor);
    }
    let level = h < 0 ? 0 : -Infinity;
    let channel = false;
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
        const td = Math.hypot(x - tarn.x, z - tarn.z) * (1 + 0.2 * (fbm2(x / 30, z / 30, seed + 711, 2) - 0.5));
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
    const low = this.hydrology.lower.nearest(x, z);
    if (low && low.d < 2.5 && h >= 0 && base < 4) h = -1;
    h = Math.round(clamp(h, -14, V2_MAX_HEIGHT));
    if (h < 0) level = Math.max(level, 0);
    return { h, level: level === -Infinity ? h : level, channel };
  }
  height(x, z) {
    return this.column(x, z).h;
  }
  /** v2 top material. Falls back to the v1 rules for the unchanged corridor. */
  topMaterial(x, z, col, slope, v1Top) {
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
};

// src/sim/vegetation.ts
function idHash(id, seed) {
  let h = 2166136261 ^ (seed | 0);
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = Math.imul(h ^ h >>> 15, 739982445);
  h = Math.imul(h ^ h >>> 12, 695872825);
  return ((h ^ h >>> 15) >>> 0) / 4294967296;
}
function isVegetationKind(kind) {
  return kind.startsWith("styl_tree_") || kind === "styl_shrub";
}
function growthStage(entity) {
  if (!isVegetationKind(entity.kind)) return null;
  const h = idHash(entity.id, 24301);
  if (entity.id.startsWith("hero:")) return h < 0.4 ? "old" : "mature";
  const [lo, span] = entity.kind === "styl_shrub" ? [0.8, 0.4] : [0.88, 0.24];
  const s = Math.min(1, Math.max(0, (entity.scale - lo) / span));
  const u = 0.7 * h + 0.3 * s;
  return u < 0.17 ? "sapling" : u < 0.36 ? "young" : u < 0.78 ? "mature" : "old";
}
var STAGE_TRUNK = { sapling: 0.15, young: 0.3, mature: 0.45, old: 0.45 };

// src/sim/world.ts
var WORLD_SIZE = 2048;
var HALF = WORLD_SIZE / 2;
var CHUNK_SIZE = 32;
var CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE;
var Y_MIN = -16;
var Y_MAX = 112;
var WORLD_HEIGHT = Y_MAX - Y_MIN;
var SEA_LEVEL = 0;
var GENERATOR_VERSION = 1;
var GENERATOR_V2 = 2;
var LATEST_GENERATOR_VERSION = GENERATOR_V2;
var SUPPORTED_GENERATOR_VERSIONS = [GENERATOR_VERSION, GENERATOR_V2];
var isSupportedGenerator = (v) => typeof v === "number" && SUPPORTED_GENERATOR_VERSIONS.includes(v);
var CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
var CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
var DEFAULT_PARAMS = {
  size: WORLD_SIZE,
  chunkSize: CHUNK_SIZE,
  yMin: Y_MIN,
  yMax: Y_MAX,
  seaLevel: SEA_LEVEL,
  generatorVersion: GENERATOR_VERSION
};
var RETIRED_STONE_KINDS = /* @__PURE__ */ new Set([
  "styl_rock_small",
  "styl_rock_medium",
  "styl_rock_large"
]);
var isRetiredStoneKind = (kind) => RETIRED_STONE_KINDS.has(kind);
var chunkKey = (cx, cz) => `${cx},${cz}`;
var chunkOriginX = (cx) => cx * CHUNK_SIZE - HALF;
var chunkOriginZ = (cz) => cz * CHUNK_SIZE - HALF;
var localIndex = (lx, yIndex, lz) => lx + lz * CHUNK_SIZE + yIndex * CHUNK_AREA;
var worldToChunkX = (x) => Math.floor((x + HALF) / CHUNK_SIZE);
var worldToChunkZ = (z) => Math.floor((z + HALF) / CHUNK_SIZE);
var worldToLocalX = (x) => x - (worldToChunkX(x) * CHUNK_SIZE - HALF);
var worldToLocalZ = (z) => z - (worldToChunkZ(z) * CHUNK_SIZE - HALF);
var yToIndex = (y) => y - Y_MIN;
function createWorld(seed = 1337, generatorVersion = GENERATOR_VERSION) {
  if (!isSupportedGenerator(generatorVersion)) throw new Error(`unsupported generator version ${generatorVersion}`);
  return {
    seed,
    params: { ...DEFAULT_PARAMS, generatorVersion },
    chunks: /* @__PURE__ */ new Map(),
    entities: /* @__PURE__ */ new Map(),
    entityChunks: /* @__PURE__ */ new Map(),
    entityChanges: /* @__PURE__ */ new Set(),
    entityRemovals: /* @__PURE__ */ new Set(),
    structures: /* @__PURE__ */ new Map(),
    sites: [],
    regions: REGIONS,
    edits: /* @__PURE__ */ new Map(),
    inventory: {},
    dirty: /* @__PURE__ */ new Set(),
    stats: {
      chunksGenerated: 0,
      chunksEvicted: 0,
      voxelsFilled: 0,
      generationMs: 0,
      entities: 0,
      trees: 0,
      pinkTrees: 0,
      pinkOverflow: 0
    },
    authoredPlaced: false,
    revision: 0
  };
}
var REGIONS = [
  { id: "founder", label: "Founder valley", type: "plain", cx: 0, cz: 0, rx: 110, rz: 85 },
  { id: "eastwood", label: "Eastwood", type: "forest", cx: 220, cz: -110, rx: 260, rz: 220 },
  { id: "crown", label: "Crown highlands", type: "highland", cx: -360, cz: -300, rx: 380, rz: 300 },
  { id: "lake", label: "Mirror lake", type: "water", cx: -260, cz: -230, rx: 120, rz: 95 },
  { id: "southdowns", label: "South downs", type: "hills", cx: 120, cz: 330, rx: 260, rz: 190 },
  { id: "westrise", label: "West rise", type: "hills", cx: -360, cz: 120, rx: 220, rz: 210 },
  { id: "coast", label: "Broken coast", type: "ridge", cx: 0, cz: 0, rx: 780, rz: 660 }
];
function riverCenterX(z) {
  return -90 + 55 * Math.sin((z + 100) / 240) + 18 * Math.sin((z - 20) / 80);
}
function riverDistance(x, z) {
  return Math.abs(x - riverCenterX(z));
}
function lakeDistance(x, z) {
  return Math.sqrt(((x + 260) / 120) ** 2 + ((z + 230) / 95) ** 2);
}
function surfaceHeightAt(seed, x, z) {
  const wx = x + (fbm2(x / 420, z / 420, seed + 101, 3) - 0.5) * 240 + (fbm2(x / 95, z / 95, seed + 102, 2) - 0.5) * 30;
  const wz = z + (fbm2(x / 420 + 7.3, z / 420 - 3.1, seed + 103, 3) - 0.5) * 240 + (fbm2(x / 95 + 3.7, z / 95 - 8.1, seed + 104, 2) - 0.5) * 30;
  const radial = Math.sqrt((wx / 780) ** 2 + (wz / 660) ** 2);
  const coastNoise = (fbm2(wx / 300, wz / 300, seed + 105, 4) - 0.5) * 0.34 + (fbm2(wx / 95, wz / 95, seed + 106, 2) - 0.5) * 0.1;
  const landness = 1 - radial + coastNoise;
  const inland = smoothstep(-0.03, 0.12, landness);
  const oceanFloor = -13 + 6 * fbm2(wx / 170, wz / 170, seed + 107, 3);
  const swell = 4 + 11 * fbm2(wx / 340, wz / 340, seed + 108, 4);
  const hills = 8 * fbm2(wx / 115, wz / 115, seed + 109, 3);
  const bumps = 2.2 * fbm2(x / 42, z / 42, seed + 110, 2) + 0.9 * fbm2(x / 15, z / 15, seed + 111, 2);
  const massifNoise = fbm2(wx / 480 + 11, wz / 480 - 7, seed + 112, 4);
  const massifMask = smoothstep(0.6, 0.78, massifNoise);
  const ridge = 1 - Math.abs(2 * fbm2(wx / 230, wz / 230, seed + 113, 4) - 1);
  const ridge2 = 1 - Math.abs(2 * fbm2(wx / 90, wz / 90, seed + 114, 3) - 1);
  const nwBias = Math.exp(-(((wx + 360) / 380) ** 2 + ((wz + 300) / 320) ** 2));
  const mount = Math.min(1, massifMask * (0.3 + 0.7 * nwBias) + 0.22 * nwBias);
  let h = swell + hills + bumps + mount * (20 + 40 * ridge * ridge + 12 * ridge2);
  const spur = 1 - Math.abs(2 * fbm2(wx / 85, wz / 85, seed + 120, 3) - 1);
  const gully = Math.pow(1 - Math.abs(2 * fbm2(wx / 52 + 13, wz / 52 - 5, seed + 121, 3) - 1), 2);
  h += (spur - 0.55) * 5 - gully * 3.2;
  h = oceanFloor + (h - oceanFloor) * inland;
  h += 1.6 * smoothstep(0, 0.1, landness);
  const rd = riverDistance(wx, wz);
  const valley = smoothstep(95, 10, rd) * smoothstep(0, 0.1, landness);
  const valleyFloor = 2.5 + 1 * fbm2(wx / 60, wz / 60, seed + 115, 2);
  h = lerp(h, valleyFloor, valley * 0.75);
  const riverW = 5 + 3 * fbm2(wx / 45, wz / 45, seed + 116, 2);
  const channel = smoothstep(riverW + 18, riverW * 0.4, rd);
  if (landness > 0) h = lerp(h, -2, channel * 0.95);
  const lakeD = lakeDistance(wx, wz) * (1 + 0.18 * (fbm2(wx / 90, wz / 90, seed + 117, 2) - 0.5) * 2);
  if (lakeD < 1.15) {
    const lakeMask = smoothstep(1.15, 0.55, lakeD);
    h = lerp(h, -6.5, lakeMask * 0.95);
  }
  const shelfD = Math.sqrt(((x + 8) / 62) ** 2 + ((z - 4) / 48) ** 2) + (fbm2(x / 45, z / 45, seed + 118, 2) - 0.5) * 0.55;
  const shelf = smoothstep(1.05, 0.55, shelfD);
  if (shelf > 0) {
    const target = 13 + 1.2 * fbm2(x / 36, z / 36, seed + 119, 2) + x * 0.01;
    h = lerp(h, target, shelf * 0.78);
  }
  return Math.round(clamp(h, -14, 92));
}
function slopeAt(seed, x, z, h) {
  return Math.max(
    Math.abs(h - surfaceHeightAt(seed, x - 1, z)),
    Math.abs(h - surfaceHeightAt(seed, x + 1, z)),
    Math.abs(h - surfaceHeightAt(seed, x, z - 1)),
    Math.abs(h - surfaceHeightAt(seed, x, z + 1))
  );
}
function topMaterialAt(seed, x, z, h, slope, nearWater) {
  if (riverDistance(x, z) < 12 && h < SEA_LEVEL + 1) return MAT.GRAVEL;
  if (h <= SEA_LEVEL + 0.5) return MAT.SAND;
  if (nearWater === void 0) {
    nearWater = surfaceHeightAt(seed, x - 3, z) < SEA_LEVEL + 1 || surfaceHeightAt(seed, x + 3, z) < SEA_LEVEL + 1 || surfaceHeightAt(seed, x, z - 3) < SEA_LEVEL + 1 || surfaceHeightAt(seed, x, z + 3) < SEA_LEVEL + 1;
  }
  if (nearWater && h <= SEA_LEVEL + 1.5) return MAT.SAND;
  if (slope >= 3) return MAT.STONE;
  if (h > 58 && fbm2(x / 18, z / 18, seed + 120, 2) > 0.45) return MAT.STONE;
  if (h > 48 && slope >= 2) return MAT.STONE;
  if (h > 40 && slope >= 2 && fbm2(x / 12, z / 12, seed + 121, 2) > 0.55) return MAT.STONE;
  return MAT.GRASS;
}
function subsoilFor(top) {
  if (top === MAT.GRASS || top === MAT.MOSS) return MAT.SOIL;
  if (top === MAT.SNOW) return MAT.STONE;
  if (top === MAT.SAND) return MAT.SAND;
  if (top === MAT.GRAVEL) return MAT.GRAVEL;
  return MAT.STONE;
}
function oreAt(seed, x, y, z) {
  const cluster = fbm2(x / 55, z / 55, seed + 130, 2);
  if (cluster < 0.57) return false;
  const n = valueNoise3(x * 0.09, y * 0.13, z * 0.09, seed + 131);
  const n2 = valueNoise3(x * 0.22 + 5, y * 0.31, z * 0.22 - 3, seed + 132);
  return n > 0.7 && n2 > 0.5;
}
function caveAt(seed, x, y, z) {
  return fbm3(x * 0.075, y * 0.11, z * 0.075, seed + 140, 2) > 0.72;
}
function overhangAt(seed, x, y, z) {
  return valueNoise3(x * 0.18, y * 0.22, z * 0.18, seed + 141) > 0.62;
}
var v2Cache = /* @__PURE__ */ new Map();
var hydroCache = /* @__PURE__ */ new Map();
function hydrologyFor(seed, version) {
  if (version >= GENERATOR_V2) return terrainV2(seed).hydrology;
  const key = `${seed}:${version}`;
  let hydro = hydroCache.get(key);
  if (!hydro) {
    hydro = new Hydrology({ seed, version, v1Height: (x, z) => surfaceHeightAt(seed, x, z) });
    hydroCache.set(key, hydro);
  }
  return hydro;
}
function terrainV2(seed) {
  let gen = v2Cache.get(seed);
  if (!gen) {
    const hydrology = new Hydrology({ seed, version: GENERATOR_V2, v1Height: (x, z) => surfaceHeightAt(seed, x, z) });
    gen = new TerrainV2(seed, surfaceHeightAt, hydrology);
    v2Cache.set(seed, gen);
  }
  return gen;
}
function baseHeightAt(seed, version, x, z) {
  return version >= GENERATOR_V2 ? terrainV2(seed).height(x, z) : surfaceHeightAt(seed, x, z);
}
function versionedSlope(seed, version, x, z, h) {
  return Math.max(
    Math.abs(h - baseHeightAt(seed, version, x - 1, z)),
    Math.abs(h - baseHeightAt(seed, version, x + 1, z)),
    Math.abs(h - baseHeightAt(seed, version, x, z - 1)),
    Math.abs(h - baseHeightAt(seed, version, x, z + 1))
  );
}
function baseTopMaterialFor(seed, version, x, z, h, slope, nearWater) {
  if (version >= GENERATOR_V2) {
    const gen = terrainV2(seed);
    return gen.topMaterial(
      x,
      z,
      gen.column(x, z),
      slope,
      (hh, ss) => topMaterialAt(seed, x, z, hh, ss, nearWater)
    );
  }
  return topMaterialAt(seed, x, z, h, slope, nearWater);
}
function ensureChunk(world, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) return null;
  const key = chunkKey(cx, cz);
  const existing = world.chunks.get(key);
  if (existing) return existing;
  return generateChunk(world, cx, cz);
}
function generateChunk(world, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) return null;
  const existing = world.chunks.get(chunkKey(cx, cz));
  if (existing) return existing;
  const t0 = performance.now();
  const base = generateBaseChunk(world.seed, world.params.generatorVersion, cx, cz);
  return installBaseChunk(world, base, performance.now() - t0);
}
function generateBaseChunk(seed, version, cx, cz) {
  const data = new Uint8Array(CHUNK_VOLUME);
  const heights = new Uint8Array(CHUNK_AREA);
  const topMaterials = new Uint8Array(CHUNK_AREA);
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  const v2 = version >= GENERATOR_V2 ? terrainV2(seed) : null;
  const P = 3;
  const PW = CHUNK_SIZE + P * 2;
  const baseH = new Int16Array(PW * PW);
  const v2Cols = v2 ? new Array(CHUNK_AREA) : null;
  for (let pz = 0; pz < PW; pz++) {
    for (let px = 0; px < PW; px++) {
      const wx = ox + px - P, wz = oz + pz - P;
      if (v2) {
        const col = v2.column(wx, wz);
        baseH[pz * PW + px] = col.h;
        const lx = px - P, lz = pz - P;
        if (lx >= 0 && lz >= 0 && lx < CHUNK_SIZE && lz < CHUNK_SIZE) v2Cols[lz * CHUNK_SIZE + lx] = col;
      } else {
        baseH[pz * PW + px] = surfaceHeightAt(seed, wx, wz);
      }
    }
  }
  let nonAir = 0;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = ox + lx, wz = oz + lz;
      const h = baseH[(lz + P) * PW + (lx + P)];
      const slope = Math.max(
        Math.abs(h - baseH[(lz + P) * PW + (lx + P - 1)]),
        Math.abs(h - baseH[(lz + P) * PW + (lx + P + 1)]),
        Math.abs(h - baseH[(lz + P - 1) * PW + (lx + P)]),
        Math.abs(h - baseH[(lz + P + 1) * PW + (lx + P)])
      );
      const nearWater = baseH[(lz + P) * PW + (lx + P - 3)] < SEA_LEVEL + 1 || baseH[(lz + P) * PW + (lx + P + 3)] < SEA_LEVEL + 1 || baseH[(lz + P - 3) * PW + (lx + P)] < SEA_LEVEL + 1 || baseH[(lz + P + 3) * PW + (lx + P)] < SEA_LEVEL + 1;
      const v2Col = v2Cols ? v2Cols[lz * CHUNK_SIZE + lx] : null;
      const top = v2 && v2Col ? v2.topMaterial(wx, wz, v2Col, slope, (hh, ss) => topMaterialAt(seed, wx, wz, hh, ss, nearWater)) : topMaterialAt(seed, wx, wz, h, slope, nearWater);
      const sub = subsoilFor(top);
      const orePotential = fbm2(wx / 55, wz / 55, seed + 130, 2) > 0.57;
      const col = lz * CHUNK_SIZE + lx;
      const start = Y_MIN;
      const end = Math.min(Y_MAX - 1, h - 1);
      for (let y = start; y <= end; y++) {
        const depth = h - 1 - y;
        let m;
        if (y === Y_MIN) m = MAT.BEDROCK;
        else if (depth === 0) m = top;
        else if (depth <= 2) m = sub;
        else m = MAT.STONE;
        if (m === MAT.STONE && depth > 4 && orePotential && oreAt(seed, wx, y, wz)) {
          m = MAT.ORE;
        }
        if (depth <= 2 && slope >= 2 && overhangAt(seed, wx, y, wz)) {
          m = MAT.AIR;
        }
        if (m !== MAT.AIR && depth > 7 && depth < 24 && caveAt(seed, wx, y, wz)) {
          m = MAT.AIR;
        }
        if (m !== MAT.AIR) {
          data[localIndex(lx, yToIndex(y), lz)] = m;
          nonAir++;
        }
      }
      const waterLevel = v2Col ? Math.min(Y_MAX, v2Col.level) : SEA_LEVEL;
      if (h < waterLevel) {
        for (let y = Math.max(Y_MIN, h); y < waterLevel; y++) {
          const idx = localIndex(lx, yToIndex(y), lz);
          if (data[idx] === MAT.AIR) {
            data[idx] = MAT.WATER;
            nonAir++;
          }
        }
      }
      const topSolid = Math.min(Y_MAX - 1, Math.max(Y_MIN, h - 1));
      heights[col] = clamp(topSolid - Y_MIN, 0, WORLD_HEIGHT - 1);
      topMaterials[col] = top;
    }
  }
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const h = baseH[(lz + P) * PW + (lx + P)];
      const slope = Math.max(
        Math.abs(h - baseH[(lz + P) * PW + (lx + P - 1)]),
        Math.abs(h - baseH[(lz + P) * PW + (lx + P + 1)]),
        Math.abs(h - baseH[(lz + P - 1) * PW + (lx + P)]),
        Math.abs(h - baseH[(lz + P + 1) * PW + (lx + P)])
      );
      if (slope < 2) continue;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dz] of dirs) {
        const nx = lx + dx, nz = lz + dz;
        if (nx < 0 || nz < 0 || nx >= CHUNK_SIZE || nz >= CHUNK_SIZE) continue;
        const nh = baseH[(nz + P) * PW + (nx + P)];
        if (h - nh < 2) continue;
        if (hash3i(lx, lz, dx * 3 + dz * 7, seed + 150) < 0.55) continue;
        const y = h - 2;
        if (y < Y_MIN || y >= h) continue;
        const idx = localIndex(nx, yToIndex(y), nz);
        if (data[idx] === MAT.AIR) {
          data[idx] = MAT.STONE;
          nonAir++;
        }
      }
    }
  }
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      let topSolid = Y_MIN;
      let topMat = topMaterials[lz * CHUNK_SIZE + lx];
      for (let y = Y_MAX - 1; y >= Y_MIN; y--) {
        const m = data[localIndex(lx, yToIndex(y), lz)];
        if (isSolid(m)) {
          topSolid = y;
          topMat = m;
          break;
        }
      }
      heights[lz * CHUNK_SIZE + lx] = clamp(topSolid - Y_MIN, 0, WORLD_HEIGHT - 1);
      topMaterials[lz * CHUNK_SIZE + lx] = topMat;
    }
  }
  return { cx, cz, seed, version, data, heights, topMaterials, nonAir };
}
function installBaseChunk(world, base, generationMs = 0) {
  if (base.seed !== world.seed || base.version !== world.params.generatorVersion) {
    throw new Error("base chunk belongs to a different world configuration");
  }
  const { cx, cz, data, heights, topMaterials, nonAir } = base;
  if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) return null;
  const key = chunkKey(cx, cz);
  const existing = world.chunks.get(key);
  if (existing) return existing;
  const chunk = {
    cx,
    cz,
    key,
    data,
    heights,
    topMaterials,
    nonAir,
    dirty: true,
    generatedAt: performance.now()
  };
  const edits = world.edits.get(key);
  if (edits) {
    for (const [idx, m] of edits) {
      chunk.data[idx] = m;
    }
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) updateColumnCache(chunk, lx, lz);
    }
  }
  let editedNonAir = 0;
  for (const material2 of chunk.data) if (material2 !== MAT.AIR) editedNonAir++;
  world.stats.voxelsFilled += editedNonAir - nonAir;
  world.chunks.set(key, chunk);
  world.stats.chunksGenerated++;
  world.stats.voxelsFilled += nonAir;
  world.stats.generationMs += generationMs;
  world.dirty.add(key);
  generateEntities(world, chunk);
  return chunk;
}
var baseColumnCache = /* @__PURE__ */ new WeakMap();
function computeBaseColumns(seed, version, cx, cz) {
  const columns = { heights: new Uint8Array(CHUNK_AREA), topMaterials: new Uint8Array(CHUNK_AREA) };
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = chunkOriginX(cx) + lx, z = chunkOriginZ(cz) + lz;
      const h = baseHeightAt(seed, version, x, z);
      const slope = version >= GENERATOR_V2 ? versionedSlope(seed, version, x, z, h) : slopeAt(seed, x, z, h);
      const index = lz * CHUNK_SIZE + lx;
      columns.heights[index] = clamp(h - Y_MIN, 0, WORLD_HEIGHT - 1);
      columns.topMaterials[index] = version >= GENERATOR_V2 ? baseTopMaterialFor(seed, version, x, z, h, slope) : topMaterialAt(seed, x, z, h, slope);
    }
  }
  return columns;
}
function baseColumns(world, chunk) {
  let cache = baseColumnCache.get(world);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    baseColumnCache.set(world, cache);
  }
  const cached = cache.get(chunk.key);
  if (cached) return cached;
  const columns = computeBaseColumns(world.seed, world.params.generatorVersion, chunk.cx, chunk.cz);
  cache.set(chunk.key, columns);
  return columns;
}
var editVersions = /* @__PURE__ */ new WeakMap();
function editVersion(world) {
  return editVersions.get(world) ?? 0;
}
function markEditsChanged(world) {
  editVersions.set(world, editVersion(world) + 1);
}
function residentChunkAt(world, x, z) {
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return null;
  return world.chunks.get(chunkKey(worldToChunkX(x), worldToChunkZ(z))) ?? null;
}
function residentVoxelAt(world, x, y, z) {
  if (y < Y_MIN) return MAT.BEDROCK;
  if (y >= Y_MAX) return MAT.AIR;
  const chunk = residentChunkAt(world, x, z);
  if (!chunk) return null;
  return chunk.data[localIndex(worldToLocalX(x), yToIndex(y), worldToLocalZ(z))];
}
function getVoxel(world, x, y, z) {
  if (y < Y_MIN) return MAT.BEDROCK;
  if (y >= Y_MAX) return MAT.AIR;
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return MAT.AIR;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return MAT.AIR;
  return chunk.data[localIndex(worldToLocalX(x), yToIndex(y), worldToLocalZ(z))];
}
function setVoxel(world, x, y, z, m) {
  if (y < Y_MIN || y >= Y_MAX) return false;
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return false;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const idx = localIndex(worldToLocalX(x), yToIndex(y), worldToLocalZ(z));
  const previousEdit = world.edits.get(chunkKey(cx, cz))?.get(idx);
  if (previousEdit === m) return false;
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return false;
  let edits = world.edits.get(chunk.key);
  if (!edits) {
    edits = /* @__PURE__ */ new Map();
    world.edits.set(chunk.key, edits);
  }
  if (chunk.data[idx] === m) {
    if (!edits.has(idx)) edits.set(idx, m);
    return false;
  }
  chunk.data[idx] = m;
  edits.set(idx, m);
  markEditsChanged(world);
  chunk.dirty = true;
  world.dirty.add(chunk.key);
  world.revision++;
  updateColumnCache(chunk, worldToLocalX(x), worldToLocalZ(z));
  return true;
}
function updateColumnCache(chunk, lx, lz) {
  let topSolid = Y_MIN;
  for (let y = Y_MAX - 1; y >= Y_MIN; y--) {
    if (isSolid(chunk.data[localIndex(lx, yToIndex(y), lz)])) {
      topSolid = y;
      break;
    }
  }
  chunk.heights[lz * CHUNK_SIZE + lx] = clamp(topSolid - Y_MIN, 0, WORLD_HEIGHT - 1);
  const tm = chunk.topMaterials[lz * CHUNK_SIZE + lx];
  if (topSolid >= Y_MIN) {
    const m = chunk.data[localIndex(lx, yToIndex(topSolid), lz)];
    if (m !== MAT.WATER) chunk.topMaterials[lz * CHUNK_SIZE + lx] = m;
  } else {
    chunk.topMaterials[lz * CHUNK_SIZE + lx] = tm;
  }
}
function surfaceAt(world, x, z) {
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return Y_MIN;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return Y_MIN;
  return chunk.heights[worldToLocalZ(z) * CHUNK_SIZE + worldToLocalX(x)] + Y_MIN + 1;
}
function waterDepthAt(world, x, z) {
  if (world.params.generatorVersion < GENERATOR_V2) {
    const h = surfaceAt(world, x, z);
    return h < SEA_LEVEL ? SEA_LEVEL - h : 0;
  }
  return waterSurfaceAt(world, x, z) - surfaceAt(world, x, z);
}
function waterSurfaceAt(world, x, z) {
  let y = surfaceAt(world, x, z);
  while (y < Y_MAX && getVoxel(world, x, y, z) === MAT.WATER) y++;
  return y;
}
function addEntity(world, e) {
  if (world.entities.has(e.id) || isRetiredStoneKind(e.kind) && !isStoneReplay(world) || world.entityRemovals.has(e.id)) return;
  world.entities.set(e.id, e);
  let list = world.entityChunks.get(e.chunk);
  if (!list) {
    list = [];
    world.entityChunks.set(e.chunk, list);
  }
  list.push(e.id);
  world.stats.entities = world.entities.size;
}
function entityId(chunk, i) {
  return `e:${chunk}:${i}`;
}
function forestScore(wx, wz, seed) {
  const east = Math.exp(-(((wx - 220) / 260) ** 2 + ((wz + 110) / 220) ** 2));
  const north = Math.exp(-(((wx - 20) / 300) ** 2 + ((wz + 300) / 190) ** 2));
  const west = Math.exp(-(((wx + 340) / 200) ** 2 + ((wz - 120) / 180) ** 2));
  const south = Math.exp(-(((wx - 120) / 240) ** 2 + ((wz - 330) / 180) ** 2));
  const moisture = fbm2(wx / 260, wz / 260, seed + 201, 4);
  const valley = Math.exp(-((wx / 140) ** 2 + (wz / 105) ** 2));
  return Math.max(east, north * 0.92, west * 0.8, south * 0.78) * 0.82 + moisture * 0.38 - 0.22 - valley * 0.34;
}
function rockScore(wx, wz, seed) {
  const mountain = fbm2(wx / 330, wz / 330, seed + 202, 3);
  const ridge = 1 - Math.abs(2 * fbm2(wx / 140, wz / 140, seed + 203, 3) - 1);
  return mountain * 0.55 + ridge * 0.45;
}
function generateEntities(world, chunk) {
  generateEntityChunk(world, chunk.cx, chunk.cz);
}
function generateEntityChunk(world, cx, cz) {
  const key = chunkKey(cx, cz);
  if (world.entityChunks.has(key)) return;
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return;
  const rnd = mulberry32(hash2i(chunk.cx, chunk.cz, world.seed + 900) * 4294967296 >>> 0);
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  const columns = baseColumns(world, chunk);
  let n = 0;
  let naturalTrees = 0;
  let naturalPinkTrees = 0;
  const localSurface = (lx, lz) => {
    return columns.heights[lz * CHUNK_SIZE + lx] + Y_MIN;
  };
  const localTop = (lx, lz) => {
    return columns.topMaterials[lz * CHUNK_SIZE + lx];
  };
  const localSlope = (lx, lz) => {
    const h = localSurface(lx, lz);
    return Math.max(
      Math.abs(h - localSurface(clamp(lx - 1, 0, CHUNK_SIZE - 1), lz)),
      Math.abs(h - localSurface(clamp(lx + 1, 0, CHUNK_SIZE - 1), lz)),
      Math.abs(h - localSurface(lx, clamp(lz - 1, 0, CHUNK_SIZE - 1))),
      Math.abs(h - localSurface(lx, clamp(lz + 1, 0, CHUNK_SIZE - 1)))
    );
  };
  for (let gz = 0; gz < CHUNK_SIZE; gz += 8) {
    for (let gx = 0; gx < CHUNK_SIZE; gx += 8) {
      const lx = clamp(Math.floor(gx + 2 + (rnd() - 0.5) * 5), 1, CHUNK_SIZE - 2);
      const lz = clamp(Math.floor(gz + 2 + (rnd() - 0.5) * 5), 1, CHUNK_SIZE - 2);
      const wx = ox + lx, wz = oz + lz;
      const h = localSurface(lx, lz);
      if (h <= SEA_LEVEL + 1) continue;
      const slope = localSlope(lx, lz);
      const top = localTop(lx, lz);
      if (top === MAT.WATER) continue;
      const forest = forestScore(wx, wz, world.seed);
      const rocky = rockScore(wx, wz, world.seed);
      const roll = rnd();
      const treeChance = forest > 0.5 ? 0.72 : forest > 0.3 ? 0.25 : 0.05;
      if (top === MAT.GRASS && slope <= 2 && roll < treeChance) {
        let kind;
        let variant;
        const speciesRoll = rnd();
        if (speciesRoll < 0.12) {
          if (naturalPinkTrees + 1 > 0.25 * (naturalTrees + 1)) {
            kind = "styl_tree_cluster";
            variant = Math.floor(rnd() * 3);
            world.stats.pinkOverflow++;
          } else {
            kind = "styl_tree_blossom";
            variant = Math.floor(rnd() * 2);
            naturalPinkTrees++;
            world.stats.pinkTrees++;
          }
        } else if (speciesRoll < 0.4) {
          kind = "styl_tree_spire";
          variant = Math.floor(rnd() * 4);
        } else if (speciesRoll < 0.74) {
          kind = "styl_tree_table";
          variant = Math.floor(rnd() * 4);
        } else {
          kind = "styl_tree_cluster";
          variant = Math.floor(rnd() * 3);
        }
        naturalTrees++;
        world.stats.trees++;
        addEntity(world, {
          id: entityId(chunk.key, n++),
          kind,
          chunk: chunk.key,
          x: wx + 0.5,
          y: h,
          z: wz + 0.5,
          rot: Math.floor(rnd() * 24) * (Math.PI / 12),
          scale: 0.88 + rnd() * 0.24,
          variant,
          resource: "wood",
          remaining: 12,
          yieldPerHarvest: 4,
          harvested: false,
          provisional: true,
          authored: false
        });
        continue;
      }
      if (top === MAT.GRASS && rocky > 0.46 && roll < 0.38) {
        const sizeRoll = rnd();
        const kind = sizeRoll < 0.55 ? "styl_rock_small" : sizeRoll < 0.9 ? "styl_rock_medium" : "styl_rock_large";
        const id = entityId(chunk.key, n++);
        const record = {
          id,
          kind,
          chunk: chunk.key,
          x: wx + 0.5,
          y: h,
          z: wz + 0.5,
          resource: "stone",
          remaining: kind === "styl_rock_small" ? 4 : kind === "styl_rock_medium" ? 8 : 12,
          yieldPerHarvest: 3,
          harvested: false,
          provisional: true,
          authored: false,
          rot: Math.floor(rnd() * 24) * (Math.PI / 12),
          scale: 0.9 + rnd() * 0.2,
          variant: Math.floor(rnd() * 3)
        };
        if (isStoneReplay(world)) addEntity(world, record);
        continue;
      }
      if (top === MAT.STONE && rocky > 0.58 && roll < 0.18) {
        addEntity(world, {
          id: entityId(chunk.key, n++),
          kind: "styl_ore",
          chunk: chunk.key,
          x: wx + 0.5,
          y: h,
          z: wz + 0.5,
          rot: Math.floor(rnd() * 24) * (Math.PI / 12),
          scale: 0.9 + rnd() * 0.2,
          variant: Math.floor(rnd() * 2),
          resource: "ore",
          remaining: 8,
          yieldPerHarvest: 2,
          harvested: false,
          provisional: true,
          authored: false
        });
        continue;
      }
      if (top === MAT.GRASS && slope <= 1 && roll < 0.3) {
        addEntity(world, {
          id: entityId(chunk.key, n++),
          kind: "styl_shrub",
          chunk: chunk.key,
          x: wx + 0.5,
          y: h,
          z: wz + 0.5,
          rot: Math.floor(rnd() * 24) * (Math.PI / 12),
          scale: 0.8 + rnd() * 0.4,
          variant: Math.floor(rnd() * 3),
          resource: "fiber",
          remaining: 4,
          yieldPerHarvest: 1,
          harvested: false,
          provisional: true,
          authored: false
        });
      }
    }
  }
}

// src/sim/terrain.ts
var OBSTRUCTION_RADIUS = {
  styl_tree_spire: 1.5,
  styl_tree_table: 1.8,
  styl_tree_cluster: 1.9,
  styl_tree_blossom: 1.6,
  styl_shrub: 0.6,
  styl_ore: 0.9,
  styl_cairn: 0.8,
  waystone: 1.4,
  marker: 0.5
};

// src/sim/character.ts
var CHARACTER_RADIUS = 0.3;
var CHARACTER_HEIGHT = 1.7;
var FIXED_STEP = 1 / 30;
var WALK_SPEED = 4.2;
var RUN_SPEED = 7.5;
var WADE_SPEED = 3.4;
var SWIM_SPEED = 2.4;
var DIVE_SPEED = 1.9;
var EXHAUSTED_SWIM_SPEED = 1;
var JUMP_SPEED = 6.6;
var DOUBLE_JUMP_SPEED = 8.4;
var WADE_JUMP_FACTOR = 0.85;
var JUMP_BUFFER_REACH = 0.6;
var JUMP_BUFFER_TIME = 0.15;
var GRAVITY = 22;
var STEP_HEIGHT = 1.05;
var SWIM_DEPTH = 1.35;
var EYE_HEIGHT = 1.5;
var FLOAT_DEPTH = 1.3;
var EXHAUSTED_FLOAT_DEPTH = 1.42;
var SURFACE_LIFT = 0.18;
var DIVE_DOWN_SPEED = 2;
var SWIM_UP_SPEED = 2.6;
var BUOYANT_RISE_SPEED = 1.1;
var SWIM_CLIMB = 2.2;
var MAX_HEALTH = 100;
var BREATH_SECONDS = 15;
var BREATH_REFILL_SECONDS = 2.5;
var DROWN_DAMAGE_PER_S = 10;
var SWIM_STAMINA_SECONDS = 40;
var FLOAT_RECOVER_SECONDS = 30;
var STAMINA_RECOVER_SECONDS = 8;
var HEALTH_REGEN_DELAY = 4;
var HEALTH_REGEN_PER_S = 3;
var SWIM_CURRENT_FACTOR = 0.5;
var WADE_CURRENT_FACTOR = 0.2;
function createCharacter(x, y, z, heading = 0) {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading,
    grounded: false,
    mode: "air",
    speed: 0,
    health: MAX_HEALTH,
    breath: 1,
    stamina: 1,
    headUnderwater: false,
    waterSurface: y,
    calm: HEALTH_REGEN_DELAY,
    hurt: 0,
    dead: false,
    cause: null,
    airJumpUsed: false,
    jumped: false,
    jumpBuffer: 0,
    safe: { x, y, z }
  };
}
function blocked(world, x, y, z) {
  if (y < Y_MIN) return true;
  const m = residentVoxelAt(world, x, y, z);
  return m === null || isSolid(m);
}
function water(world, x, y, z) {
  return residentVoxelAt(world, x, y, z) === MAT.WATER;
}
function overlapsTerrain(world, x, y, z) {
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
function overlapsStructures(world, x, y, z) {
  for (const s of world.structures.values()) {
    for (const m of s.modules) {
      if (m.kind === "crop_row") continue;
      let px = x - m.x, pz = z - m.z;
      if (m.rot) {
        const c = Math.cos(-m.rot), sn = Math.sin(-m.rot);
        const rx = px * c - pz * sn, rz = px * sn + pz * c;
        px = rx;
        pz = rz;
      }
      if (Math.abs(px) < m.w / 2 + CHARACTER_RADIUS && Math.abs(pz) < m.d / 2 + CHARACTER_RADIUS && y + 0.02 < m.y + m.h && y + CHARACTER_HEIGHT > m.y + 0.02) return true;
    }
  }
  return false;
}
function structureFloor(world, x, y, z) {
  let floor = -Infinity;
  for (const s of world.structures.values()) {
    for (const m of s.modules) {
      if (m.kind === "crop_row") continue;
      let px = x - m.x, pz = z - m.z;
      if (m.rot) {
        const c = Math.cos(-m.rot), sn = Math.sin(-m.rot);
        const rx = px * c - pz * sn, rz = px * sn + pz * c;
        px = rx;
        pz = rz;
      }
      if (Math.abs(px) < m.w / 2 + CHARACTER_RADIUS * 0.6 && Math.abs(pz) < m.d / 2 + CHARACTER_RADIUS * 0.6) {
        const top = m.y + m.h;
        if (top <= y + 0.05 && top > floor) floor = top;
      }
    }
  }
  return floor;
}
function overlaps(world, x, y, z) {
  return overlapsTerrain(world, x, y, z) || overlapsStructures(world, x, y, z);
}
function resolveEntities(world, s) {
  const cx = worldToChunkX(Math.floor(s.x)), cz = worldToChunkZ(Math.floor(s.z));
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ids = world.entityChunks.get(chunkKey(cx + dx, cz + dz));
      if (!ids) continue;
      for (const id of ids) {
        const e = world.entities.get(id);
        if (!e || e.harvested || isRetiredStoneKind(e.kind) || world.entityRemovals.has(id)) continue;
        const body = e.kind.startsWith("styl_tree_") ? STAGE_TRUNK[growthStage(e) ?? "mature"] * e.scale : (OBSTRUCTION_RADIUS[e.kind] ?? 0.5) * 0.75 * e.scale;
        if (e.kind === "styl_shrub") continue;
        if (s.y > e.y + 3 || s.y + CHARACTER_HEIGHT < e.y) continue;
        const ox = s.x - e.x, oz = s.z - e.z;
        const d = Math.hypot(ox, oz);
        const min = body + CHARACTER_RADIUS;
        if (d >= min || d < 1e-6) continue;
        const push = min - d;
        const nx = s.x + ox / d * push, nz = s.z + oz / d * push;
        if (!overlaps(world, nx, s.y, nz)) {
          s.x = nx;
          s.z = nz;
        }
      }
    }
  }
}
function feetWaterDepth(world, x, y, z) {
  const fx = Math.floor(x), fz = Math.floor(z);
  let top = Math.floor(y + 0.05);
  if (!water(world, fx, top, fz)) return 0;
  while (water(world, fx, top + 1, fz) && top < y + 48) top++;
  return top + 1 - y;
}
var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function currentAt(world, x, z, surface) {
  const f = hydrologyFor(world.seed, world.params.generatorVersion).flowAt(x, z, surface);
  return { dx: f.dx, dz: f.dz, speed: f.speed };
}
function stepCharacter(world, prev, input2, dt = FIXED_STEP) {
  const s = { ...prev, hurt: 0 };
  if (s.dead) {
    s.vx = 0;
    s.vz = 0;
    s.speed = 0;
    return s;
  }
  const depth = feetWaterDepth(world, s.x, s.y, s.z);
  const surface = s.y + depth;
  const swimming = depth >= SWIM_DEPTH || depth > 0.9 && !s.grounded && prev.mode === "swim";
  const wading = !swimming && depth > 0.2;
  const exhausted = s.stamina <= 0;
  const floatY = surface - (exhausted ? EXHAUSTED_FLOAT_DEPTH : FLOAT_DEPTH);
  const atSurface = swimming && s.y >= floatY - 0.35;
  let mx = input2.moveX, mz = input2.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const target = swimming ? exhausted ? EXHAUSTED_SWIM_SPEED : atSurface ? SWIM_SPEED : DIVE_SPEED : wading ? WADE_SPEED * (1 - 0.45 * clamp01((depth - 0.2) / (SWIM_DEPTH - 0.2))) : input2.run ? RUN_SPEED : WALK_SPEED;
  let driftX = 0, driftZ = 0;
  if (swimming || wading) {
    const c = currentAt(world, s.x, s.z, surface);
    const k = swimming ? SWIM_CURRENT_FACTOR : WADE_CURRENT_FACTOR * clamp01(depth / SWIM_DEPTH);
    driftX = c.dx * c.speed * k;
    driftZ = c.dz * c.speed * k;
  }
  const accel = s.grounded || swimming ? swimming ? 5 : 14 : 4;
  s.vx += (mx * target + driftX - s.vx) * Math.min(1, accel * dt);
  s.vz += (mz * target + driftZ - s.vz) * Math.min(1, accel * dt);
  if (swimming) {
    let wantVy;
    if (input2.dive && !exhausted) wantVy = -DIVE_DOWN_SPEED;
    else if ((input2.rise || input2.jump) && !exhausted) {
      wantVy = Math.max(-1, Math.min(SWIM_UP_SPEED, (floatY + SURFACE_LIFT - s.y) * 2.5));
    } else wantVy = Math.max(-1.4, Math.min(BUOYANT_RISE_SPEED, (floatY - s.y) * 2.5));
    s.vy += (wantVy - s.vy) * Math.min(1, 3.5 * dt);
  } else {
    const wantJump = input2.jump || s.jumpBuffer > 0;
    if (wantJump && s.grounded) {
      s.vy = wading ? JUMP_SPEED * WADE_JUMP_FACTOR : JUMP_SPEED;
      s.grounded = false;
      s.jumped = true;
      s.jumpBuffer = 0;
    } else if (input2.jump) {
      if (s.vy <= 0 && (overlaps(world, s.x, s.y - JUMP_BUFFER_REACH, s.z) || structureFloor(world, s.x, s.y + 0.02, s.z) > s.y - JUMP_BUFFER_REACH)) {
        s.jumpBuffer = JUMP_BUFFER_TIME;
      } else if (s.jumped && !s.airJumpUsed) {
        s.vy = DOUBLE_JUMP_SPEED;
        s.airJumpUsed = true;
      }
    }
    s.vy -= GRAVITY * dt;
    if (s.vy < -40) s.vy = -40;
  }
  const wasGrounded = s.grounded;
  for (const axis of ["x", "z"]) {
    const delta = (axis === "x" ? s.vx : s.vz) * dt;
    if (delta === 0) continue;
    const nx = axis === "x" ? s.x + delta : s.x;
    const nz = axis === "z" ? s.z + delta : s.z;
    if (!overlaps(world, nx, s.y, nz)) {
      s.x = nx;
      s.z = nz;
      continue;
    }
    if (wasGrounded || swimming || wading) {
      const stepY = Math.floor(s.y + 1e-3) + 1;
      if (stepY - s.y <= STEP_HEIGHT && !overlaps(world, nx, stepY, nz)) {
        s.x = nx;
        s.z = nz;
        s.y = stepY;
        continue;
      }
      if (atSurface && !exhausted) {
        let climbed = false;
        for (let cy = stepY + 1; cy - s.y <= SWIM_CLIMB; cy++) {
          if (!overlaps(world, nx, cy, nz) && overlaps(world, nx, cy - 1, nz)) {
            s.x = nx;
            s.z = nz;
            s.y = cy;
            s.vy = 0;
            climbed = true;
            break;
          }
        }
        if (climbed) continue;
      }
      const top = structureFloor(world, nx, s.y + STEP_HEIGHT, nz);
      if (top > s.y && top - s.y <= STEP_HEIGHT && !overlaps(world, nx, top, nz)) {
        s.x = nx;
        s.z = nz;
        s.y = top;
        continue;
      }
    }
    if (axis === "x") s.vx = 0;
    else s.vz = 0;
  }
  const ny = s.y + s.vy * dt;
  if (!overlaps(world, s.x, ny, s.z)) {
    s.y = ny;
    s.grounded = false;
  } else if (s.vy <= 0) {
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
  if (!s.grounded && s.vy <= 0) {
    const top = structureFloor(world, s.x, s.y + 0.02, s.z);
    if (top > -Infinity && s.y - top < 0.06) {
      s.y = top;
      s.vy = 0;
      s.grounded = true;
    }
  }
  resolveEntities(world, s);
  if (s.grounded || swimming) {
    s.airJumpUsed = false;
    s.jumped = false;
  }
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
  const afloat = depthAfter >= SWIM_DEPTH || swimming && depthAfter > 0.9;
  s.mode = afloat ? "swim" : !s.grounded ? "air" : depthAfter > 0.2 ? "wade" : "ground";
  if (s.mode === "swim") s.grounded = false;
  s.waterSurface = s.y + depthAfter;
  const working = Math.hypot(mx, mz) > 0.1 || !exhausted && (!!input2.dive || !!input2.rise || input2.jump);
  updateVitals(s, depthAfter, working, dt);
  return s;
}
function updateVitals(s, depth, working, dt) {
  s.headUnderwater = depth > EYE_HEIGHT;
  s.breath = s.headUnderwater ? Math.max(0, s.breath - dt / BREATH_SECONDS) : Math.min(1, s.breath + dt / BREATH_REFILL_SECONDS);
  if (s.mode === "swim") {
    if (working) s.stamina = Math.max(0, s.stamina - dt / SWIM_STAMINA_SECONDS);
    else if (!s.headUnderwater) s.stamina = Math.min(1, s.stamina + dt / FLOAT_RECOVER_SECONDS);
  } else if (s.mode === "ground") s.stamina = Math.min(1, s.stamina + dt / STAMINA_RECOVER_SECONDS);
  let damage = 0;
  if (s.headUnderwater && s.breath <= 0) damage += DROWN_DAMAGE_PER_S * dt;
  if (damage > 0) {
    s.health = Math.max(0, s.health - damage);
    s.hurt = damage;
    s.calm = 0;
    if (s.health <= 0) {
      s.dead = true;
      s.cause = "drowned";
      s.vx = 0;
      s.vz = 0;
    }
  } else {
    s.calm += dt;
    if (s.calm >= HEALTH_REGEN_DELAY && !s.headUnderwater) s.health = Math.min(MAX_HEALTH, s.health + HEALTH_REGEN_PER_S * dt);
  }
  if (s.mode === "ground" && s.grounded && depth === 0) s.safe = { x: s.x, y: s.y, z: s.z };
}
function findStandingY(world, x, z, yHint = 120) {
  for (let y = Math.min(110, Math.floor(yHint)); y > Y_MIN; y--) {
    const m = residentVoxelAt(world, Math.floor(x), y - 1, Math.floor(z));
    if (m === null) return null;
    if (isSolid(m) && !overlapsTerrain(world, x, y, z)) return y;
  }
  return null;
}

// src/render/characters.ts
import * as THREE2 from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// src/data/palette.json
var palette_default = {
  schema: "palette_v2",
  date: "2026-10-22",
  status: "proposed",
  source: "REF-002 (hybrid world reference), values sampled by eye; numeric verification pending",
  note: "One material palette. Time of day is expressed by the lighting presets below, not by repainting materials.",
  materials: {
    grass_top: {
      hex: "#79B94C",
      role: "terrain top, low elevation"
    },
    grass_high: {
      hex: "#8FC95E",
      role: "terrain top, mid elevation"
    },
    grass_peak: {
      hex: "#9AD06A",
      role: "terrain top, high elevation"
    },
    grass_cap: {
      hex: "#5E9440",
      role: "side band 0.0-0.4 m below top"
    },
    strata_ochre: {
      hex: "#C99A5F",
      role: "side band 0.4-0.62 m below top"
    },
    strata_rust: {
      hex: "#B4633C",
      role: "side band 0.62-0.80 m below top"
    },
    stone_top: {
      hex: "#E6DFCC",
      role: "bare stone top surface"
    },
    stone_body_a: {
      hex: "#DCD3BE",
      role: "side body, even 4.5 m band"
    },
    stone_body_b: {
      hex: "#D1C7AF",
      role: "side body, odd 4.5 m band"
    },
    stone_shade: {
      hex: "#B9AE96",
      role: "crevice / recessed stone accent"
    },
    sand: {
      hex: "#E3D3A6",
      role: "shore cells"
    },
    snow: {
      hex: "#EEF1F5",
      role: "generator v2 snowfields above the snowline (added 2026-11-23, review required)"
    },
    char_skin: {
      hex: "#D9A77E",
      role: "character skin (added 2026-11-23, review required)"
    },
    char_tunic: {
      hex: "#B34A3C",
      role: "founder tunic, warm red accent (added 2026-11-23, review required)"
    },
    char_tunic_alt: {
      hex: "#2E8C86",
      role: "villager tunic, teal accent (added 2026-11-23, review required)"
    },
    char_trousers: {
      hex: "#5B4636",
      role: "character trousers (added 2026-11-23, review required)"
    },
    char_hair: {
      hex: "#4A3324",
      role: "character hair (added 2026-11-23, review required)"
    },
    char_boots: {
      hex: "#33281F",
      role: "character boots and belt (added 2026-11-23, review required)"
    },
    fauna_deer: {
      hex: "#8C5B3A",
      role: "red deer coat (added 2026-11-23, review required)"
    },
    fauna_light: {
      hex: "#DCC7A4",
      role: "deer belly, hare tail, antler (added 2026-11-23, review required)"
    },
    fauna_hare: {
      hex: "#9A8670",
      role: "hare coat (added 2026-11-23, review required)"
    },
    fauna_trout: {
      hex: "#6F7F5E",
      role: "trout back (added 2026-11-23, review required)"
    },
    fauna_trout_belly: {
      hex: "#D8C9A3",
      role: "trout belly (added 2026-11-23, review required)"
    },
    arch_plaster: {
      hex: "#E8DDC6",
      role: "village wall plaster (added 2026-11-23, review required)"
    },
    arch_timber: {
      hex: "#6A4530",
      role: "village timber frame (added 2026-11-23, review required)"
    },
    arch_timber_light: {
      hex: "#8A6142",
      role: "village planks and doors (added 2026-11-23, review required)"
    },
    arch_thatch: {
      hex: "#C7A257",
      role: "thatch roof (added 2026-11-23, review required)"
    },
    arch_thatch_dark: {
      hex: "#9C7B3C",
      role: "thatch roof shade course (added 2026-11-23, review required)"
    },
    arch_stone: {
      hex: "#9B9A91",
      role: "village masonry (added 2026-11-23, review required)"
    },
    arch_stone_dark: {
      hex: "#74736C",
      role: "village masonry joints and plinth (added 2026-11-23, review required)"
    },
    prop_iron: {
      hex: "#3A3A3F",
      role: "iron fittings (added 2026-11-23, review required)"
    },
    prop_glow: {
      hex: "#FFD27F",
      role: "lantern light (emissive, effect only) (added 2026-11-23, review required)"
    },
    water_shallow: {
      hex: "#67CFD8",
      role: "water depth <= 0.5 m"
    },
    water_mid: {
      hex: "#3AAFC4",
      role: "water depth ~1.5 m"
    },
    water_deep: {
      hex: "#2A8FA8",
      role: "water depth >= 4.0 m"
    },
    water_rim: {
      hex: "#BFEAF0",
      role: "shoreline rim / foam tint"
    },
    canopy_green_a: {
      hex: "#5FA83F",
      role: "green canopy, shade mass"
    },
    canopy_green_b: {
      hex: "#6FB84A",
      role: "green canopy, main mass"
    },
    canopy_green_c: {
      hex: "#7FC356",
      role: "green canopy, highlight mass"
    },
    canopy_pink: {
      hex: "#F2A6C4",
      role: "blossom accent species only"
    },
    canopy_pink_b: {
      hex: "#E88FB2",
      role: "blossom shade mass"
    },
    trunk: {
      hex: "#6B4A33",
      role: "tree trunks"
    },
    bark_dark: {
      hex: "#4E3626",
      role: "trunk shade, stumps"
    },
    conifer_pine: {
      hex: "#4C8A4A",
      role: "pine needles, main mass"
    },
    conifer_pine_b: {
      hex: "#5C9C53",
      role: "pine needles, highlight"
    },
    conifer_spruce: {
      hex: "#2F6B48",
      role: "spruce needles, main mass"
    },
    conifer_spruce_b: {
      hex: "#3E7F56",
      role: "spruce needles, highlight"
    },
    birch_bark: {
      hex: "#E6E1D3",
      role: "pale birch trunk"
    },
    birch_mark: {
      hex: "#3A3530",
      role: "dark birch bark band"
    },
    birch_leaf: {
      hex: "#9CC95A",
      role: "birch canopy, main mass"
    },
    birch_leaf_b: {
      hex: "#B3D76B",
      role: "birch canopy, highlight"
    },
    beech_bark: {
      hex: "#8E897D",
      role: "smooth grey beech trunk"
    },
    beech_leaf: {
      hex: "#558F3A",
      role: "beech canopy, shade mass"
    },
    beech_leaf_b: {
      hex: "#67A445",
      role: "beech canopy, main mass"
    },
    bush_dark: {
      hex: "#467F37",
      role: "berry bush leaves"
    },
    berry_red: {
      hex: "#C8394A",
      role: "berries"
    },
    fern_green: {
      hex: "#86BE55",
      role: "fern fronds, main"
    },
    fern_green_b: {
      hex: "#6FA746",
      role: "fern fronds, shade"
    },
    flower_yellow: {
      hex: "#F2CF4A",
      role: "ground cover: meadow flower heads"
    },
    flower_white: {
      hex: "#F4F1E4",
      role: "ground cover: daisy flower heads"
    },
    flower_violet: {
      hex: "#9C7BD6",
      role: "ground cover: violet flower heads"
    },
    mushroom_cap: {
      hex: "#B8483A",
      role: "ground cover: forest mushroom cap"
    },
    mushroom_stem: {
      hex: "#EDE3CC",
      role: "ground cover: mushroom stem"
    },
    moss_green: {
      hex: "#5C8C3A",
      role: "ground cover: moss on fallen logs"
    },
    ore_crystal: {
      hex: "#7B5AD6",
      role: "ore deposit accent (proposed, replaces teal)"
    },
    ore_crystal_b: {
      hex: "#9B7BE8",
      role: "ore highlight facet"
    },
    noxel_stone: {
      hex: "#E6DFCC",
      role: "Noxel architecture main stone"
    },
    noxel_stone_b: {
      hex: "#D3C9B4",
      role: "Noxel secondary stone / recess"
    },
    accent_blue: {
      hex: "#3E7FB8",
      role: "banner / cloth accent"
    },
    accent_teal: {
      hex: "#2FA6A0",
      role: "secondary accent"
    },
    emissive_fire: {
      hex: "#FF9E4A",
      role: "campfire / warm emissive (effects only)"
    },
    emissive_magic: {
      hex: "#D24BFF",
      role: "reserved: magic effects only, never materials"
    }
  },
  lighting: {
    dawn: {
      sunElevationDeg: 12,
      sunAzimuthDeg: 105,
      sunColor: "#FFC79A",
      sunIntensity: 2.2,
      hemiSky: "#8FA6C8",
      hemiGround: "#4E5F6E",
      hemiIntensity: 0.6,
      sky: "#A8BED6",
      fog: "#A8BED6",
      fogDensity: 5e-3,
      exposure: 1.1
    },
    noon: {
      sunElevationDeg: 38,
      sunAzimuthDeg: 50,
      sunColor: "#FFF4DC",
      sunIntensity: 2.75,
      hemiSky: "#BFD9F2",
      hemiGround: "#7A8F55",
      hemiIntensity: 0.55,
      sky: "#9ED2EE",
      fog: "#DCEFF8",
      fogDensity: 28e-4,
      exposure: 1.05
    },
    dusk: {
      sunElevationDeg: 9,
      sunAzimuthDeg: 250,
      sunColor: "#FFB27A",
      sunIntensity: 3.2,
      hemiSky: "#8E7C9E",
      hemiGround: "#5A4A50",
      hemiIntensity: 1.1,
      sky: "#C98E86",
      fog: "#C0908A",
      fogDensity: 36e-4,
      exposure: 1.32
    },
    night: {
      sunElevationDeg: 40,
      sunAzimuthDeg: 220,
      sunColor: "#AFC8FF",
      sunIntensity: 1,
      hemiSky: "#3A4C7A",
      hemiGround: "#1C2540",
      hemiIntensity: 1.05,
      sky: "#101736",
      fog: "#151C3C",
      fogDensity: 45e-4,
      exposure: 1.5
    }
  }
};

// src/render/water.ts
import * as THREE from "three";
var M = palette_default.materials;
var H = (k) => new THREE.Color(M[k].hex);
var WATER_DRAW_DROP = 0.1;
var waterTime = { value: 0 };
function makeWaterMaterial() {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.uniforms.uShallow = { value: H("water_shallow") };
    shader.uniforms.uMid = { value: H("water_mid") };
    shader.uniforms.uDeep = { value: H("water_deep") };
    shader.uniforms.uRim = { value: H("water_rim") };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
attribute vec2 aFlow;
attribute float aDepth;
attribute float aFoam;
attribute float aSheet;
varying vec2 vFlow;
varying float vDepth;
varying float vFoam;
varying float vSheet;
varying vec3 vWorldPosW;`).replace("#include <begin_vertex>", `#include <begin_vertex>
vFlow = aFlow; vDepth = aDepth; vFoam = aFoam; vSheet = aSheet;
vWorldPosW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
uniform float uTime;
uniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uDeep; uniform vec3 uRim;
varying vec2 vFlow;
varying float vDepth;
varying float vFoam;
varying float vSheet;
varying vec3 vWorldPosW;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
}`).replace("vec4 diffuseColor = vec4( diffuse, opacity );", `
float speed = length(vFlow);
// Advect the pattern downstream. Quantised to 0.25 m cells so ripples read as
// block-built facets rather than smooth gradients.
vec2 p = vWorldPosW.xz;
vec2 adv = p - vFlow * uTime;
vec2 cell = floor(adv * 4.0) / 4.0;
float n1 = wNoise(cell * 0.55);
float n2 = wNoise(cell * 1.7 + vec2(uTime * 0.07, -uTime * 0.05));
float ripple = n1 * 0.6 + n2 * 0.4;
// Still water (sea, lake) gets a slow swell instead of a current.
float swell = 0.5 + 0.5 * sin(dot(p, vec2(0.11, 0.07)) + uTime * 0.6);
ripple = mix(mix(ripple, swell, 0.5), ripple, clamp(speed * 2.0, 0.0, 1.0));
float d = clamp(vDepth / 4.0, 0.0, 1.0);
vec3 water = mix(uShallow, uMid, smoothstep(0.0, 0.5, d));
water = mix(water, uDeep, smoothstep(0.5, 1.0, d));
water *= 0.9 + 0.2 * ripple;
// Streaks along fast current, foam at shores and cascades.
float streak = step(0.78 - clamp(speed * 0.06, 0.0, 0.2), n2) * clamp(speed * 0.5, 0.0, 1.0);
float foamNoise = step(0.45, wNoise(cell * 2.3 + uTime * 0.3));
float foam = clamp(vFoam * foamNoise + streak * 0.6, 0.0, 1.0);
// Falling sheets: fast vertical streaks.
if (vSheet > 0.5) {
  float fall = wNoise(vec2(floor(vWorldPosW.x * 4.0 + vWorldPosW.z * 4.0), floor((vWorldPosW.y + uTime * 3.5) * 3.0)));
  foam = max(foam, step(0.35, fall));
}
vec3 col = mix(water, uRim * 1.08, foam);
float alpha = mix(0.55, 0.9, smoothstep(0.4, 3.0, vDepth));
alpha = max(alpha, foam * 0.95);
if (vSheet > 0.5) alpha = max(alpha, 0.82);
vec4 diffuseColor = vec4( diffuse * col, alpha * opacity );`);
  };
  return mat;
}
var nearWaterMaterial = makeWaterMaterial();

// src/render/characters.ts
var M2 = palette_default.materials;
var C = (k) => new THREE2.Color(k.startsWith("#") ? k : M2[k].hex);
var material = new THREE2.MeshLambertMaterial({ vertexColors: true, flatShading: true });
function part(boxes) {
  const geos = boxes.map((b) => {
    const g = new THREE2.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    g.translate(b.x ?? 0, (b.y ?? 0) + b.h / 2, b.z ?? 0);
    g.deleteAttribute("uv");
    const col = C(b.c);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    const normals = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const ny = normals.getY(i);
      const k = ny > 0.5 ? 1 : ny < -0.5 ? 0.78 : 0.9;
      colors[i * 3] = col.r * k;
      colors[i * 3 + 1] = col.g * k;
      colors[i * 3 + 2] = col.b * k;
    }
    g.setAttribute("color", new THREE2.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  return merged;
}
var FOUNDER_STYLE = { tunic: "char_tunic", trousers: "char_trousers", hair: "char_hair" };
function joint(parts, name, geo, x, y, z) {
  const g = new THREE2.Group();
  g.name = name;
  g.position.set(x, y, z);
  parts.push({ joint: g, geo });
  return g;
}
function skinFigure(root, parts) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE2.Matrix4().copy(root.matrixWorld).invert();
  const bones = [];
  const geos = parts.map(({ joint: j, geo }, index) => {
    const bone = new THREE2.Bone();
    bone.name = `${j.name}_bone`;
    j.add(bone);
    bones.push(bone);
    const g = geo.clone().applyMatrix4(new THREE2.Matrix4().multiplyMatrices(toRoot, j.matrixWorld));
    const n = g.attributes.position.count;
    const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      skinIndex[i * 4] = index;
      skinWeight[i * 4] = 1;
    }
    g.setAttribute("skinIndex", new THREE2.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute("skinWeight", new THREE2.Float32BufferAttribute(skinWeight, 4));
    return g;
  });
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  for (const g of new Set(parts.map((p) => p.geo))) g.dispose();
  const mesh = new THREE2.SkinnedMesh(merged, material);
  mesh.name = "character_body";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE2.Skeleton(bones));
  mesh.boundingSphere = new THREE2.Sphere(new THREE2.Vector3(0, 0.9, 0), 1.5);
  mesh.boundingBox = new THREE2.Box3(new THREE2.Vector3(-1.5, -0.6, -1.5), new THREE2.Vector3(1.5, 2.4, 1.5));
  return mesh;
}
function buildFigure(style = FOUNDER_STYLE) {
  const root = new THREE2.Group();
  root.name = "character";
  const s = style.scale ?? 1;
  root.scale.setScalar(s);
  const parts = [];
  const legGeo = part([
    { w: 0.17, h: 0.72, d: 0.19, y: -0.72, c: style.trousers },
    { w: 0.19, h: 0.12, d: 0.27, y: -0.82, z: 0.035, c: "char_boots" }
  ]);
  const hips = new THREE2.Group();
  hips.name = "hips";
  hips.position.y = 0.82;
  const legL = joint(parts, "legL", legGeo, 0.1, 0, 0);
  const legR = joint(parts, "legR", legGeo, -0.1, 0, 0);
  hips.add(legL, legR);
  const torsoGeo = part([
    { w: 0.4, h: 0.16, d: 0.24, y: -0.02, c: style.trousers },
    { w: 0.42, h: 0.06, d: 0.26, y: 0.12, c: "char_boots" },
    { w: 0.4, h: 0.28, d: 0.24, y: 0.18, c: style.tunic },
    { w: 0.46, h: 0.2, d: 0.26, y: 0.42, c: style.tunic },
    { w: 0.22, h: 0.05, d: 0.18, y: 0.62, c: style.tunic },
    ...style.apron ? [{ w: 0.36, h: 0.46, d: 0.03, y: -0.06, z: 0.135, c: style.apron }] : []
  ]);
  const torso = joint(parts, "torso", torsoGeo, 0, 0, 0);
  hips.add(torso);
  const headGeo = part([
    { w: 0.1, h: 0.06, d: 0.1, y: 0, c: "char_skin" },
    { w: 0.24, h: 0.24, d: 0.24, y: 0.05, c: "char_skin" },
    { w: 0.26, h: 0.09, d: 0.26, y: 0.24, c: style.hair },
    { w: 0.26, h: 0.12, d: 0.06, y: 0.16, z: -0.11, c: style.hair },
    { w: 0.05, h: 0.04, d: 0.03, x: 0.055, y: 0.15, z: 0.12, c: "char_boots" },
    { w: 0.05, h: 0.04, d: 0.03, x: -0.055, y: 0.15, z: 0.12, c: "char_boots" },
    ...style.hat?.kind === "straw" ? [
      { w: 0.52, h: 0.03, d: 0.52, y: 0.3, c: style.hat.color },
      { w: 0.27, h: 0.1, d: 0.27, y: 0.32, c: style.hat.color }
    ] : style.hat?.kind === "cap" ? [
      { w: 0.28, h: 0.08, d: 0.28, y: 0.3, c: style.hat.color },
      { w: 0.22, h: 0.02, d: 0.12, y: 0.3, z: 0.17, c: style.hat.color }
    ] : []
  ]);
  const head = joint(parts, "head", headGeo, 0, 0.66, 0);
  torso.add(head);
  const armGeo = part([
    { w: 0.13, h: 0.3, d: 0.14, y: -0.3, c: style.tunic },
    { w: 0.11, h: 0.24, d: 0.12, y: -0.53, c: "char_skin" }
  ]);
  const armL = joint(parts, "armL", armGeo, 0.29, 0.6, 0);
  const armR = joint(parts, "armR", armGeo, -0.29, 0.6, 0);
  torso.add(armL, armR);
  root.add(hips);
  const foam = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2, r = i % 2 ? 0.5 : 0.42;
    const w = i % 2 ? 0.09 : 0.14;
    foam.push({ w, h: 0.03, d: w * 0.7, x: Math.sin(a) * r, y: -0.015, z: Math.cos(a) * r, c: i % 3 ? "#E6F2F5" : "#C9E3EA" });
  }
  const ripple = joint(parts, "ripple", part(foam), 0, 1.2, 0);
  root.add(ripple);
  skinFigure(root, parts);
  ripple.scale.setScalar(0);
  return {
    root,
    hips,
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    ripple,
    phase: 0,
    swimPhase: 0,
    time: 0,
    blend: { ground: 1, air: 0, surface: 0, under: 0 },
    divePitch: 0.3,
    stroke: 0
  };
}
var KEYS = ["hipsY", "hipsZ", "hipsPitch", "torsoPitch", "headPitch", "armLx", "armLz", "armRx", "armRz", "legLx", "legLz", "legRx", "legRz"];
var NECK = 0.66;
var NECK_CLEAR = 0.07;
var REACH = -2.8;
var smooth2 = (u) => u * u * (3 - 2 * u);
var lerp2 = (a, b, t) => a + (b - a) * t;
var clamp2 = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
var seg = (u, a, b) => smooth2(clamp2((u - a) / (b - a), 0, 1));
function whipKick(u, recover, kick, end) {
  if (u < recover) return { x: 0.06, z: 0.03 };
  if (u < kick) {
    const k = seg(u, recover, kick);
    return { x: lerp2(0.06, -0.95, k), z: lerp2(0.03, 0.32, k) };
  }
  if (u < end) {
    const k = seg(u, kick, end);
    return { x: lerp2(-0.95, 0.16, k), z: lerp2(0.32, 0.03, k) + 0.22 * Math.sin(Math.PI * k) };
  }
  return { x: lerp2(0.16, 0.06, seg(u, end, 1)), z: 0.03 };
}
function groundPose(f, state) {
  const speed = state.speed;
  const sw = Math.min(1, speed / 7.5);
  let legSwing = Math.sin(f.phase) * (0.35 + 0.45 * sw) * Math.min(1, speed * 1.5);
  let armSwing = -legSwing * 0.8;
  let lean = 0.1 * sw;
  let bob = Math.abs(Math.sin(f.phase)) * 0.05 * Math.min(1, speed);
  if (speed < 0.1) {
    lean = 0;
    bob = Math.sin(f.time * 1.11) * 6e-3;
    armSwing = 0;
    legSwing = 0;
  }
  return {
    hipsY: 0.82 + bob,
    hipsZ: 0,
    hipsPitch: 0,
    torsoPitch: lean,
    headPitch: -lean * 0.6,
    armLx: armSwing,
    armLz: 0.06,
    armRx: -armSwing,
    armRz: -0.06,
    legLx: legSwing,
    legLz: 0,
    legRx: -legSwing,
    legRz: 0
  };
}
var AIR_POSE = {
  hipsY: 0.82,
  hipsZ: 0,
  hipsPitch: 0,
  torsoPitch: 0.05,
  headPitch: 0,
  armLx: -0.9,
  armLz: 0.25,
  armRx: -0.9,
  armRz: -0.25,
  legLx: -0.45,
  legLz: 0,
  legRx: 0.25,
  legRz: 0
};
function surfacePose(f, waterLine) {
  const m = f.stroke;
  const phi = f.swimPhase;
  const u = (phi / (Math.PI * 2) % 1 + 1) % 1;
  const sc = Math.sin(phi);
  const tread = {
    hipsY: 0,
    hipsZ: 0,
    hipsPitch: 0.16 + 0.03 * Math.sin(phi * 0.5),
    torsoPitch: 0,
    headPitch: -0.1,
    armLx: -0.6 + 0.38 * sc,
    armLz: 0.95 + 0.12 * Math.cos(phi),
    armRx: -0.6 + 0.38 * sc,
    armRz: -0.95 - 0.12 * Math.cos(phi),
    legLx: -0.32 + 0.3 * Math.sin(phi),
    legLz: 0.14,
    legRx: -0.32 - 0.3 * Math.sin(phi),
    legRz: -0.14
  };
  let ax, az;
  if (u < 0.4) {
    const k = seg(u, 0, 0.4);
    ax = lerp2(REACH, -0.95, k);
    az = 0.12 + 0.85 * Math.sin(Math.PI * k);
  } else if (u < 0.58) {
    const k = seg(u, 0.4, 0.58);
    ax = lerp2(-0.95, REACH, k);
    az = lerp2(0.12, 0.04, k);
  } else {
    ax = REACH;
    az = 0.04;
  }
  const kick = whipKick(u, 0.42, 0.56, 0.74);
  const lift = u < 0.4 ? Math.sin(Math.PI * u / 0.4) : 0;
  const stroke = {
    hipsY: 0.05 * lift,
    hipsZ: 0,
    hipsPitch: 0.95 - 0.18 * lift,
    torsoPitch: 0,
    headPitch: 0,
    armLx: ax,
    armLz: az,
    armRx: ax,
    armRz: -az,
    legLx: kick.x,
    legLz: kick.z,
    legRx: kick.x,
    legRz: -kick.z
  };
  const p = {};
  for (const k of KEYS) p[k] = lerp2(tread[k], stroke[k], m);
  p.headPitch -= p.hipsPitch * 0.85;
  const bob = 0.022 * Math.sin(f.time * 1.7);
  p.hipsY = clamp2(waterLine + NECK_CLEAR - NECK * Math.cos(p.hipsPitch) + p.hipsY + bob, 0.15, 1.4);
  p.hipsZ = -0.35 * Math.sin(p.hipsPitch);
  return p;
}
function underPose(f) {
  const phi = f.swimPhase;
  const u = (phi / (Math.PI * 2) % 1 + 1) % 1;
  let ax, az;
  if (u < 0.35) {
    const k = seg(u, 0, 0.35);
    ax = lerp2(REACH - 0.1, 0.12, k);
    az = 0.18 + 0.75 * Math.sin(Math.PI * k);
  } else if (u < 0.5) {
    ax = 0.12;
    az = 0.12;
  } else if (u < 0.7) {
    const k = seg(u, 0.5, 0.7);
    ax = lerp2(0.12, REACH - 0.1, k);
    az = lerp2(0.12, 0.06, k);
  } else {
    ax = REACH - 0.1;
    az = 0.06;
  }
  const kick = whipKick(u, 0.55, 0.68, 0.85);
  return {
    hipsY: 0.85,
    hipsZ: 0,
    hipsPitch: f.divePitch,
    torsoPitch: 0,
    headPitch: -clamp2(f.divePitch - 0.3, 0, 0.6) * 0.6,
    armLx: ax,
    armLz: az,
    armRx: ax,
    armRz: -az,
    legLx: kick.x,
    legLz: kick.z,
    legRx: kick.x,
    legRz: -kick.z
  };
}
function animateFigure(f, state, dt, feetY = state.y) {
  f.time += dt;
  const speed = state.speed;
  const stride = state.mode === "wade" ? 1.6 : 2.4;
  f.phase += speed / stride * Math.PI * 2 * dt;
  const swim = state.mode === "swim";
  const surfaceY = Number.isFinite(state.waterSurface) ? state.waterSurface : feetY;
  const under = swim && (state.headUnderwater || state.y < surfaceY - 1.75);
  const target = {
    ground: !swim && state.mode !== "air" ? 1 : 0,
    air: state.mode === "air" ? 1 : 0,
    surface: swim && !under ? 1 : 0,
    under: under ? 1 : 0
  };
  const kb = 1 - Math.exp(-dt * (state.mode === "air" || f.blend.air > 0.01 ? 12 : 7));
  const b = f.blend;
  b.ground += (target.ground - b.ground) * kb;
  b.air += (target.air - b.air) * kb;
  b.surface += (target.surface - b.surface) * kb;
  b.under += (target.under - b.under) * kb;
  const sum = b.ground + b.air + b.surface + b.under || 1;
  const vy = Number.isFinite(state.vy) ? state.vy : 0;
  const swimSpeed = Math.hypot(speed, vy);
  f.stroke += (clamp2(speed / 1.8, 0, 1) - f.stroke) * (1 - Math.exp(-dt * 4));
  const hz = under ? 0.4 + 0.2 * Math.min(swimSpeed, 2.6) : lerp2(0.55, 0.5 + 0.25 * speed, f.stroke);
  if (b.surface + b.under > 1e-3) f.swimPhase += Math.PI * 2 * hz * dt;
  const wantPitch = !under ? f.hips.rotation.x : swimSpeed < 0.35 ? 1.35 : clamp2(Math.atan2(speed, vy), 0.15, 2.9);
  const turn = (wantPitch - f.divePitch) * (1 - Math.exp(-dt * 5));
  f.divePitch += clamp2(turn, -4 * dt, 4 * dt);
  const parts = [];
  if (b.ground > 1e-3) parts.push([b.ground / sum, groundPose(f, state)]);
  if (b.air > 1e-3) parts.push([b.air / sum, AIR_POSE]);
  if (b.surface > 1e-3) parts.push([b.surface / sum, surfacePose(f, surfaceY - WATER_DRAW_DROP - feetY)]);
  if (b.under > 1e-3) parts.push([b.under / sum, underPose(f)]);
  const p = {};
  for (const k of KEYS) {
    let v = 0;
    for (const [w, q] of parts) v += w * q[k];
    p[k] = v;
  }
  f.hips.position.set(0, p.hipsY, p.hipsZ);
  f.hips.rotation.x = p.hipsPitch;
  f.torso.rotation.x = p.torsoPitch;
  f.head.rotation.x = p.headPitch;
  f.armL.rotation.x = p.armLx;
  f.armL.rotation.z = p.armLz;
  f.armR.rotation.x = p.armRx;
  f.armR.rotation.z = p.armRz;
  f.legL.rotation.x = p.legLx;
  f.legL.rotation.z = p.legLz;
  f.legR.rotation.x = p.legRx;
  f.legR.rotation.z = p.legRz;
  const wet = swim ? b.surface / sum : state.mode === "wade" ? 0.6 * (b.ground / sum) : 0;
  if (wet > 0.02 && Number.isFinite(state.waterSurface)) {
    const k = wet * (0.85 + 0.15 * Math.sin(f.swimPhase * 2 + 0.6) + 0.1 * clamp2(speed / 2.4, 0, 1));
    f.ripple.scale.set(k * (1 + 0.05 * clamp2(speed, 0, 2)), 1, k * (1 + 0.12 * clamp2(speed, 0, 2)));
    f.ripple.position.set(0, surfaceY - WATER_DRAW_DROP + 0.01 - feetY, p.hipsZ * 0.6);
    f.ripple.rotation.y = f.time * 0.4;
  } else {
    f.ripple.scale.setScalar(0);
  }
}
function placeFigure(f, x, y, z, heading) {
  f.root.position.set(x, y, z);
  f.root.rotation.y = heading;
}

// tests/m011.swimming.test.ts
var SURFACE = 35;
var HZ = Math.round(1 / FIXED_STEP);
function pool() {
  const world = createWorld(1337);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ensureChunk(world, worldToChunkX(0) + dx, worldToChunkZ(0) + dz);
  for (let z = -14; z <= 14; z++) for (let x = -14; x <= 14; x++) {
    for (let y = surfaceAt(world, x, z); y <= 45; y++) setVoxel(world, x, y, z, MAT.AIR);
    setVoxel(world, x, 30, z, MAT.STONE);
    const inPool = Math.abs(x) <= 6 && Math.abs(z) <= 6;
    for (let y = 31; y < SURFACE; y++) setVoxel(world, x, y, z, inPool ? MAT.WATER : MAT.STONE);
  }
  return world;
}
var input = (i = {}) => ({ moveX: 0, moveZ: 0, run: false, jump: false, ...i });
function run(world, s, steps, i = {}, each) {
  for (let k = 0; k < steps; k++) {
    s = stepCharacter(world, s, input(i));
    each?.(s);
  }
  return s;
}
var floating = (world) => run(world, createCharacter(0.5, 31, 0.5), 4 * HZ);
test("floating at rest keeps the head above water; breath never drops and refills", () => {
  const world = pool();
  let s = floating(world);
  assert.equal(s.mode, "swim");
  s = { ...s, breath: 0.4 };
  let last = s.breath, minEye = Infinity, maxEye = -Infinity;
  s = run(world, s, 30 * HZ, {}, (q) => {
    assert.equal(q.headUnderwater, false);
    assert.ok(q.breath >= last, "breath never drops at the surface");
    last = q.breath;
    const eye = q.y + EYE_HEIGHT - q.waterSurface;
    minEye = Math.min(minEye, eye);
    maxEye = Math.max(maxEye, eye);
  });
  assert.equal(s.breath, 1, "refilled");
  assert.equal(s.health, MAX_HEALTH);
  assert.equal(s.stamina, 1);
  assert.ok(minEye > 0.15 && maxEye < 0.3, `eye clearance ${minEye}..${maxEye}`);
  assert.ok(Math.abs(SURFACE - s.y - FLOAT_DEPTH) < 0.03);
});
test("falling in, the swimmer sinks a little, then buoyancy bobs it up to the float line", () => {
  const world = pool();
  let s = run(world, createCharacter(0.5, SURFACE + 2, 0.5), 1);
  let lowest = Infinity;
  s = run(world, s, 6 * HZ, {}, (q) => {
    lowest = Math.min(lowest, q.y);
  });
  assert.ok(lowest < SURFACE - FLOAT_DEPTH - 0.2, `plunged to ${lowest}`);
  assert.equal(s.mode, "swim");
  assert.equal(s.headUnderwater, false);
  assert.ok(Math.abs(SURFACE - s.y - FLOAT_DEPTH) < 0.03, `settled ${SURFACE - s.y}`);
});
test("holding Dive submerges and breath drops; releasing lets buoyancy surface the swimmer", () => {
  const world = pool();
  let s = floating(world);
  s = run(world, s, Math.round(1.5 * HZ), { dive: true });
  assert.equal(s.headUnderwater, true);
  assert.ok(s.y < SURFACE - EYE_HEIGHT - 0.5, `feet ${s.y}`);
  s = run(world, s, 3 * HZ, { dive: true });
  assert.ok(s.breath < 0.8 && s.breath > 0.6, `breath ${s.breath}`);
  const down = s.breath;
  let t = 0;
  while (s.headUnderwater && t++ < 6 * HZ) s = run(world, s, 1);
  assert.equal(s.headUnderwater, false);
  assert.ok(t < 4 * HZ, `surfaced in ${t / HZ} s`);
  assert.ok(s.breath > 0 && s.breath <= down, "still holding breath on the way up");
  s = run(world, s, 4 * HZ);
  assert.ok(Math.abs(SURFACE - s.y - FLOAT_DEPTH) < 0.05, "back at the float line");
  assert.equal(s.breath, 1);
});
test("holding Jump swims up faster than buoyancy alone", () => {
  const world = pool();
  const bottom = run(world, floating(world), 3 * HZ, { dive: true });
  assert.equal(bottom.y, 31, "on the pool floor");
  const timeUp = (i) => {
    let s2 = bottom, t = 0;
    while (s2.headUnderwater && t++ < 10 * HZ) s2 = run(world, s2, 1, i);
    return t;
  };
  const buoyant = timeUp({}), kick = timeUp({ rise: true });
  assert.ok(kick < buoyant * 0.75, `jump ${kick} steps vs buoyancy ${buoyant}`);
  let s = run(world, floating(world), 3 * HZ, { rise: true }, (q) => assert.equal(q.mode, "swim"));
  assert.ok(s.y > SURFACE - FLOAT_DEPTH + 0.1, `lifted ${s.y}`);
  s = run(world, s, 3 * HZ);
  assert.ok(Math.abs(SURFACE - s.y - FLOAT_DEPTH) < 0.05);
});
test("kept under, the swimmer still drowns when breath runs out", () => {
  const world = pool();
  let s = floating(world);
  let t = 0;
  while (!s.dead && t++ < 40 * HZ) s = run(world, s, 1, { dive: true });
  assert.equal(s.dead, true);
  assert.equal(s.cause, "drowned");
  assert.ok(t / HZ > 24 && t / HZ < 28, `drowned after ${t / HZ} s`);
});
test("a floating swimmer still climbs out onto the bank", () => {
  const world = pool();
  let s = floating(world);
  s = run(world, s, 3 * HZ, { moveX: 1 });
  assert.equal(s.mode, "ground");
  assert.equal(s.y, SURFACE);
  assert.ok(s.x > 7);
});
test("swimming over a submerged ledge glides across without dipping the head under", () => {
  const world = pool();
  for (let z = -6; z <= 6; z++) for (let x = 0; x <= 1; x++) for (let y = 31; y <= 33; y++) setVoxel(world, x, y, z, MAT.STONE);
  let s = run(world, createCharacter(-4.5, 31, 0.5), 4 * HZ);
  let lowest = Infinity;
  s = run(world, s, Math.round(3.5 * HZ), { moveX: 1 }, (q) => {
    assert.equal(q.headUnderwater, false, `x ${q.x} y ${q.y}`);
    assert.equal(q.mode, "swim");
    lowest = Math.min(lowest, q.y);
  });
  assert.ok(s.x > 3, `crossed (x ${s.x})`);
  assert.ok(lowest > SURFACE - FLOAT_DEPTH - 0.15, `lowest ${lowest}`);
  assert.equal(s.breath, 1);
});
test("in the river near the spawn the founder floats at rest for 90 s without losing breath or health", () => {
  const world = createWorld(1337, LATEST_GENERATOR_VERSION);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ensureChunk(world, worldToChunkX(-60) + dx, worldToChunkZ(4) + dz);
  assert.ok(waterDepthAt(world, -60, 4) >= 2, "deep river column");
  let s = createCharacter(-59.5, findStandingY(world, -59.5, 4.5, 110), 4.5);
  s = run(world, s, 90 * HZ);
  assert.equal(s.mode, "swim");
  assert.equal(s.dead, false);
  assert.equal(s.headUnderwater, false);
  assert.equal(s.breath, 1);
  assert.equal(s.health, MAX_HEALTH);
});
var world3 = new THREE3.Vector3();
var headY = (f) => {
  f.root.updateMatrixWorld(true);
  return f.head.getWorldPosition(world3).y;
};
function animate(world, s, seconds, i, f, each) {
  for (let k = 0; k < seconds * HZ; k++) {
    s = stepCharacter(world, s, input(i));
    placeFigure(f, s.x, s.y, s.z, s.heading);
    animateFigure(f, s, FIXED_STEP);
    each?.(s);
  }
  return s;
}
test("swimming at the surface strokes: arm and leg joints cycle with speed, neck above the drawn water", () => {
  const world = pool();
  const f = buildFigure();
  let s = animate(world, createCharacter(-4.5, 31, 0.5), 3, {}, f);
  const armX = [], legX = [];
  s = animate(world, s, 3, { moveX: 1 }, f, (q) => {
    armX.push(f.armL.rotation.x);
    legX.push(f.legL.rotation.x);
    assert.ok(headY(f) > q.waterSurface - WATER_DRAW_DROP, "neck above the drawn water line");
  });
  assert.equal(s.mode, "swim");
  const span = (v) => Math.max(...v) - Math.min(...v);
  assert.ok(span(armX.slice(-60)) > 1.4, `arm sweep ${span(armX)}`);
  assert.ok(span(legX.slice(-60)) > 0.7, `leg kick ${span(legX)}`);
  assert.ok(f.hips.rotation.x > 0.6, `body pitch ${f.hips.rotation.x}`);
  assert.ok(f.ripple.scale.x > 0.5, "foam ring at the water line");
});
test("floating idle treads water: arms scull out to the sides, legs kick gently, body upright", () => {
  const world = pool();
  const f = buildFigure();
  let s = animate(world, createCharacter(0.5, 31, 0.5), 4, {}, f);
  const zs = [], xs = [], legs = [];
  s = animate(world, s, 2, {}, f, (q) => {
    zs.push(f.armL.rotation.z);
    xs.push(f.armL.rotation.x);
    legs.push(f.legL.rotation.x - f.legR.rotation.x);
    assert.ok(headY(f) > q.waterSurface - WATER_DRAW_DROP + 0.03, "neck clear of the water");
  });
  assert.ok(Math.min(...zs) > 0.7, "arms out to the sides");
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.5, "sculling forward and back");
  assert.ok(Math.max(...legs) - Math.min(...legs) > 0.6, "legs kick alternately");
  assert.ok(f.hips.rotation.x < 0.3, "upright");
  const hy = [];
  animate(world, s, 4, {}, f, () => hy.push(f.hips.position.y));
  const bob = Math.max(...hy) - Math.min(...hy);
  assert.ok(bob > 0.02 && bob < 0.12, `bob ${bob}`);
});
test("underwater the body pitches toward the swim direction and strokes; transitions are smooth", () => {
  const world = pool();
  const f = buildFigure();
  let s = animate(world, createCharacter(0.5, 31, 0.5), 4, {}, f);
  let prev = { arm: f.armL.rotation.x, pitch: f.hips.rotation.x, y: f.hips.position.y };
  let jump = 0;
  const track = () => {
    jump = Math.max(jump, Math.abs(f.hips.rotation.x - prev.pitch), Math.abs(f.hips.position.y - prev.y));
    prev = { arm: f.armL.rotation.x, pitch: f.hips.rotation.x, y: f.hips.position.y };
  };
  s = animate(world, s, 1.2, { dive: true }, f, track);
  assert.equal(s.headUnderwater, true);
  assert.ok(f.hips.rotation.x > 2.2, `head-down dive pitch ${f.hips.rotation.x}`);
  const arms = [];
  s = animate(world, s, 2, { dive: true, moveX: 1 }, f, (q) => {
    track();
    arms.push(f.armL.rotation.x);
  });
  s = animate(world, s, 1.5, { moveX: -1 }, f, track);
  assert.ok(Math.max(...arms) - Math.min(...arms) > 2, "long underwater pull");
  s = animate(world, s, 5, {}, f, track);
  assert.equal(s.headUnderwater, false);
  assert.ok(f.hips.rotation.x < 0.3, `upright again ${f.hips.rotation.x}`);
  assert.ok(jump < 0.25, `no pose snaps between frames (largest step ${jump})`);
  s = { ...s, x: 5.5 };
  s = animate(world, s, 1.6, { moveX: 1 }, f);
  assert.equal(s.mode, "ground");
  assert.ok(f.hips.rotation.x < 0.01 && Math.abs(f.hips.position.y - 0.82) < 0.06, "walking pose");
  assert.equal(f.ripple.scale.x, 0, "no foam on land");
});
test("the figure is still one skinned mesh (one draw call per pass) with the foam ring included", () => {
  const f = buildFigure();
  let meshes = 0, tris = 0;
  f.root.traverse((n) => {
    const m = n;
    if (m.isMesh) {
      meshes++;
      tris += m.geometry.attributes.position.count / 3;
    }
  });
  assert.equal(meshes, 1);
  assert.ok(tris < 400, `triangles ${tris}`);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAxMS5zd2ltbWluZy50ZXN0LnRzIiwgIi4uLy4uL3NyYy9zaW0vc3RvbmUtY29tcGF0LnRzIiwgIi4uLy4uL3NyYy9zaW0vbm9pc2UudHMiLCAiLi4vLi4vc3JjL3NpbS9oeWRyb2xvZ3kudHMiLCAiLi4vLi4vc3JjL3NpbS9tYXRlcmlhbHMudHMiLCAiLi4vLi4vc3JjL3NpbS90ZXJyYWluLXYyLnRzIiwgIi4uLy4uL3NyYy9zaW0vdmVnZXRhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3dvcmxkLnRzIiwgIi4uLy4uL3NyYy9zaW0vdGVycmFpbi50cyIsICIuLi8uLi9zcmMvc2ltL2NoYXJhY3Rlci50cyIsICIuLi8uLi9zcmMvcmVuZGVyL2NoYXJhY3RlcnMudHMiLCAiLi4vLi4vc3JjL2RhdGEvcGFsZXR0ZS5qc29uIiwgIi4uLy4uL3NyYy9yZW5kZXIvd2F0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIE0wMTE6IHJlYWxpc3RpYyBzd2ltbWluZy4gQnVveWFudCBmbG9hdGluZyBhdCB0aGUgc3VyZmFjZSB3aXRoIGhlYWQgYW5kXG4vLyBzaG91bGRlcnMgb3V0IChicmVhdGggbmV2ZXIgZHJvcHMgdGhlcmUpLCBkaXZpbmcgYXMgYSBjaG9pY2UsIGJ1b3lhbmN5XG4vLyBicmluZ2luZyB0aGUgc3dpbW1lciBiYWNrIHVwLCBhIHN0cm9rZSAvIHRyZWFkaW5nIC8gdW5kZXJ3YXRlciBhbmltYXRpb24uXG5pbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnO1xuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHtcbiAgTEFURVNUX0dFTkVSQVRPUl9WRVJTSU9OLCBNQVQsIFdvcmxkLCBjcmVhdGVXb3JsZCwgZW5zdXJlQ2h1bmssIHNldFZveGVsLCBzdXJmYWNlQXQsIHdhdGVyRGVwdGhBdCwgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWixcbn0gZnJvbSAnLi4vc3JjL3NpbS93b3JsZCc7XG5pbXBvcnQge1xuICBDaGFyYWN0ZXJJbnB1dCwgQ2hhcmFjdGVyU3RhdGUsIEVZRV9IRUlHSFQsIEZJWEVEX1NURVAsIEZMT0FUX0RFUFRILCBNQVhfSEVBTFRILCBjcmVhdGVDaGFyYWN0ZXIsIGZpbmRTdGFuZGluZ1ksIHN0ZXBDaGFyYWN0ZXIsXG59IGZyb20gJy4uL3NyYy9zaW0vY2hhcmFjdGVyJztcbmltcG9ydCB7IGFuaW1hdGVGaWd1cmUsIGJ1aWxkRmlndXJlLCBwbGFjZUZpZ3VyZSB9IGZyb20gJy4uL3NyYy9yZW5kZXIvY2hhcmFjdGVycyc7XG5pbXBvcnQgeyBXQVRFUl9EUkFXX0RST1AgfSBmcm9tICcuLi9zcmMvcmVuZGVyL3dhdGVyJztcblxuY29uc3QgU1VSRkFDRSA9IDM1OyAvLyB3YXRlciBjZWxscyAzMS4uMzQgb3ZlciBhIHN0b25lIGZsb29yIGF0IDMwOyBiYW5rcyBsZXZlbCB3aXRoIHRoZSB3YXRlclxuY29uc3QgSFogPSBNYXRoLnJvdW5kKDEgLyBGSVhFRF9TVEVQKTtcblxuZnVuY3Rpb24gcG9vbCgpOiBXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNyk7XG4gIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIGVuc3VyZUNodW5rKHdvcmxkLCB3b3JsZFRvQ2h1bmtYKDApICsgZHgsIHdvcmxkVG9DaHVua1ooMCkgKyBkeik7XG4gIGZvciAobGV0IHogPSAtMTQ7IHogPD0gMTQ7IHorKykgZm9yIChsZXQgeCA9IC0xNDsgeCA8PSAxNDsgeCsrKSB7XG4gICAgZm9yIChsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7IHkgPD0gNDU7IHkrKykgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIE1BVC5BSVIpO1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCAzMCwgeiwgTUFULlNUT05FKTtcbiAgICBjb25zdCBpblBvb2wgPSBNYXRoLmFicyh4KSA8PSA2ICYmIE1hdGguYWJzKHopIDw9IDY7XG4gICAgZm9yIChsZXQgeSA9IDMxOyB5IDwgU1VSRkFDRTsgeSsrKSBzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgaW5Qb29sID8gTUFULldBVEVSIDogTUFULlNUT05FKTtcbiAgfVxuICByZXR1cm4gd29ybGQ7XG59XG5cbmNvbnN0IGlucHV0ID0gKGk6IFBhcnRpYWw8Q2hhcmFjdGVySW5wdXQ+ID0ge30pOiBDaGFyYWN0ZXJJbnB1dCA9PiAoeyBtb3ZlWDogMCwgbW92ZVo6IDAsIHJ1bjogZmFsc2UsIGp1bXA6IGZhbHNlLCAuLi5pIH0pO1xuZnVuY3Rpb24gcnVuKHdvcmxkOiBXb3JsZCwgczogQ2hhcmFjdGVyU3RhdGUsIHN0ZXBzOiBudW1iZXIsIGk6IFBhcnRpYWw8Q2hhcmFjdGVySW5wdXQ+ID0ge30sIGVhY2g/OiAoczogQ2hhcmFjdGVyU3RhdGUpID0+IHZvaWQpIHtcbiAgZm9yIChsZXQgayA9IDA7IGsgPCBzdGVwczsgaysrKSB7IHMgPSBzdGVwQ2hhcmFjdGVyKHdvcmxkLCBzLCBpbnB1dChpKSk7IGVhY2g/LihzKTsgfVxuICByZXR1cm4gcztcbn1cbi8qKiBBIHN3aW1tZXIgc2V0dGxlZCBhdCB0aGUgc3VyZmFjZSBvZiB0aGUgcG9vbC4gKi9cbmNvbnN0IGZsb2F0aW5nID0gKHdvcmxkOiBXb3JsZCkgPT4gcnVuKHdvcmxkLCBjcmVhdGVDaGFyYWN0ZXIoMC41LCAzMSwgMC41KSwgNCAqIEhaKTtcblxudGVzdCgnZmxvYXRpbmcgYXQgcmVzdCBrZWVwcyB0aGUgaGVhZCBhYm92ZSB3YXRlcjsgYnJlYXRoIG5ldmVyIGRyb3BzIGFuZCByZWZpbGxzJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IHBvb2woKTtcbiAgbGV0IHMgPSBmbG9hdGluZyh3b3JsZCk7XG4gIGFzc2VydC5lcXVhbChzLm1vZGUsICdzd2ltJyk7XG4gIHMgPSB7IC4uLnMsIGJyZWF0aDogMC40IH07XG4gIGxldCBsYXN0ID0gcy5icmVhdGgsIG1pbkV5ZSA9IEluZmluaXR5LCBtYXhFeWUgPSAtSW5maW5pdHk7XG4gIHMgPSBydW4od29ybGQsIHMsIDMwICogSFosIHt9LCAocSkgPT4ge1xuICAgIGFzc2VydC5lcXVhbChxLmhlYWRVbmRlcndhdGVyLCBmYWxzZSk7XG4gICAgYXNzZXJ0Lm9rKHEuYnJlYXRoID49IGxhc3QsICdicmVhdGggbmV2ZXIgZHJvcHMgYXQgdGhlIHN1cmZhY2UnKTtcbiAgICBsYXN0ID0gcS5icmVhdGg7XG4gICAgY29uc3QgZXllID0gcS55ICsgRVlFX0hFSUdIVCAtIHEud2F0ZXJTdXJmYWNlO1xuICAgIG1pbkV5ZSA9IE1hdGgubWluKG1pbkV5ZSwgZXllKTsgbWF4RXllID0gTWF0aC5tYXgobWF4RXllLCBleWUpO1xuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKHMuYnJlYXRoLCAxLCAncmVmaWxsZWQnKTtcbiAgYXNzZXJ0LmVxdWFsKHMuaGVhbHRoLCBNQVhfSEVBTFRIKTtcbiAgYXNzZXJ0LmVxdWFsKHMuc3RhbWluYSwgMSk7XG4gIC8vIFRoZSB3YXRlciBsaW5lIGlzIGF0IHRoZSBjaGVzdDogZmVldCBGTE9BVF9ERVBUSCBiZWxvdyB0aGUgc3VyZmFjZSwgZXllcyAwLjIgbSBjbGVhci5cbiAgYXNzZXJ0Lm9rKG1pbkV5ZSA+IDAuMTUgJiYgbWF4RXllIDwgMC4zLCBgZXllIGNsZWFyYW5jZSAke21pbkV5ZX0uLiR7bWF4RXllfWApO1xuICBhc3NlcnQub2soTWF0aC5hYnMoU1VSRkFDRSAtIHMueSAtIEZMT0FUX0RFUFRIKSA8IDAuMDMpO1xufSk7XG5cbnRlc3QoJ2ZhbGxpbmcgaW4sIHRoZSBzd2ltbWVyIHNpbmtzIGEgbGl0dGxlLCB0aGVuIGJ1b3lhbmN5IGJvYnMgaXQgdXAgdG8gdGhlIGZsb2F0IGxpbmUnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gcG9vbCgpO1xuICBsZXQgcyA9IHJ1bih3b3JsZCwgY3JlYXRlQ2hhcmFjdGVyKDAuNSwgU1VSRkFDRSArIDIsIDAuNSksIDEpO1xuICBsZXQgbG93ZXN0ID0gSW5maW5pdHk7XG4gIHMgPSBydW4od29ybGQsIHMsIDYgKiBIWiwge30sIChxKSA9PiB7IGxvd2VzdCA9IE1hdGgubWluKGxvd2VzdCwgcS55KTsgfSk7XG4gIGFzc2VydC5vayhsb3dlc3QgPCBTVVJGQUNFIC0gRkxPQVRfREVQVEggLSAwLjIsIGBwbHVuZ2VkIHRvICR7bG93ZXN0fWApO1xuICBhc3NlcnQuZXF1YWwocy5tb2RlLCAnc3dpbScpO1xuICBhc3NlcnQuZXF1YWwocy5oZWFkVW5kZXJ3YXRlciwgZmFsc2UpO1xuICBhc3NlcnQub2soTWF0aC5hYnMoU1VSRkFDRSAtIHMueSAtIEZMT0FUX0RFUFRIKSA8IDAuMDMsIGBzZXR0bGVkICR7U1VSRkFDRSAtIHMueX1gKTtcbn0pO1xuXG50ZXN0KCdob2xkaW5nIERpdmUgc3VibWVyZ2VzIGFuZCBicmVhdGggZHJvcHM7IHJlbGVhc2luZyBsZXRzIGJ1b3lhbmN5IHN1cmZhY2UgdGhlIHN3aW1tZXInLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gcG9vbCgpO1xuICBsZXQgcyA9IGZsb2F0aW5nKHdvcmxkKTtcbiAgcyA9IHJ1bih3b3JsZCwgcywgTWF0aC5yb3VuZCgxLjUgKiBIWiksIHsgZGl2ZTogdHJ1ZSB9KTtcbiAgYXNzZXJ0LmVxdWFsKHMuaGVhZFVuZGVyd2F0ZXIsIHRydWUpO1xuICBhc3NlcnQub2socy55IDwgU1VSRkFDRSAtIEVZRV9IRUlHSFQgLSAwLjUsIGBmZWV0ICR7cy55fWApO1xuICBzID0gcnVuKHdvcmxkLCBzLCAzICogSFosIHsgZGl2ZTogdHJ1ZSB9KTtcbiAgYXNzZXJ0Lm9rKHMuYnJlYXRoIDwgMC44ICYmIHMuYnJlYXRoID4gMC42LCBgYnJlYXRoICR7cy5icmVhdGh9YCk7XG4gIGNvbnN0IGRvd24gPSBzLmJyZWF0aDtcbiAgLy8gUmVsZWFzZTogYnVveWFuY3kgYWxvbmUgYnJpbmdzIHRoZSBoZWFkIG91dCB3aXRoaW4gYSBmZXcgc2Vjb25kcy5cbiAgbGV0IHQgPSAwO1xuICB3aGlsZSAocy5oZWFkVW5kZXJ3YXRlciAmJiB0KysgPCA2ICogSFopIHMgPSBydW4od29ybGQsIHMsIDEpO1xuICBhc3NlcnQuZXF1YWwocy5oZWFkVW5kZXJ3YXRlciwgZmFsc2UpO1xuICBhc3NlcnQub2sodCA8IDQgKiBIWiwgYHN1cmZhY2VkIGluICR7dCAvIEhafSBzYCk7XG4gIGFzc2VydC5vayhzLmJyZWF0aCA+IDAgJiYgcy5icmVhdGggPD0gZG93biwgJ3N0aWxsIGhvbGRpbmcgYnJlYXRoIG9uIHRoZSB3YXkgdXAnKTtcbiAgcyA9IHJ1bih3b3JsZCwgcywgNCAqIEhaKTtcbiAgYXNzZXJ0Lm9rKE1hdGguYWJzKFNVUkZBQ0UgLSBzLnkgLSBGTE9BVF9ERVBUSCkgPCAwLjA1LCAnYmFjayBhdCB0aGUgZmxvYXQgbGluZScpO1xuICBhc3NlcnQuZXF1YWwocy5icmVhdGgsIDEpO1xufSk7XG5cbnRlc3QoJ2hvbGRpbmcgSnVtcCBzd2ltcyB1cCBmYXN0ZXIgdGhhbiBidW95YW5jeSBhbG9uZScsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBwb29sKCk7XG4gIGNvbnN0IGJvdHRvbSA9IHJ1bih3b3JsZCwgZmxvYXRpbmcod29ybGQpLCAzICogSFosIHsgZGl2ZTogdHJ1ZSB9KTtcbiAgYXNzZXJ0LmVxdWFsKGJvdHRvbS55LCAzMSwgJ29uIHRoZSBwb29sIGZsb29yJyk7XG4gIGNvbnN0IHRpbWVVcCA9IChpOiBQYXJ0aWFsPENoYXJhY3RlcklucHV0PikgPT4ge1xuICAgIGxldCBzID0gYm90dG9tLCB0ID0gMDtcbiAgICB3aGlsZSAocy5oZWFkVW5kZXJ3YXRlciAmJiB0KysgPCAxMCAqIEhaKSBzID0gcnVuKHdvcmxkLCBzLCAxLCBpKTtcbiAgICByZXR1cm4gdDtcbiAgfTtcbiAgY29uc3QgYnVveWFudCA9IHRpbWVVcCh7fSksIGtpY2sgPSB0aW1lVXAoeyByaXNlOiB0cnVlIH0pO1xuICBhc3NlcnQub2soa2ljayA8IGJ1b3lhbnQgKiAwLjc1LCBganVtcCAke2tpY2t9IHN0ZXBzIHZzIGJ1b3lhbmN5ICR7YnVveWFudH1gKTtcbiAgLy8gSG9sZGluZyBKdW1wIGF0IHRoZSBzdXJmYWNlIGxpZnRzIHRoZSBoZWFkIGEgbGl0dGxlIGhpZ2hlciwgd2l0aG91dCBsZWF2aW5nIHRoZSB3YXRlci5cbiAgbGV0IHMgPSBydW4od29ybGQsIGZsb2F0aW5nKHdvcmxkKSwgMyAqIEhaLCB7IHJpc2U6IHRydWUgfSwgKHEpID0+IGFzc2VydC5lcXVhbChxLm1vZGUsICdzd2ltJykpO1xuICBhc3NlcnQub2socy55ID4gU1VSRkFDRSAtIEZMT0FUX0RFUFRIICsgMC4xLCBgbGlmdGVkICR7cy55fWApO1xuICBzID0gcnVuKHdvcmxkLCBzLCAzICogSFopO1xuICBhc3NlcnQub2soTWF0aC5hYnMoU1VSRkFDRSAtIHMueSAtIEZMT0FUX0RFUFRIKSA8IDAuMDUpO1xufSk7XG5cbnRlc3QoJ2tlcHQgdW5kZXIsIHRoZSBzd2ltbWVyIHN0aWxsIGRyb3ducyB3aGVuIGJyZWF0aCBydW5zIG91dCcsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBwb29sKCk7XG4gIGxldCBzID0gZmxvYXRpbmcod29ybGQpO1xuICBsZXQgdCA9IDA7XG4gIHdoaWxlICghcy5kZWFkICYmIHQrKyA8IDQwICogSFopIHMgPSBydW4od29ybGQsIHMsIDEsIHsgZGl2ZTogdHJ1ZSB9KTtcbiAgYXNzZXJ0LmVxdWFsKHMuZGVhZCwgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChzLmNhdXNlLCAnZHJvd25lZCcpO1xuICAvLyAxNSBzIG9mIGJyZWF0aCBwbHVzIDEwIHMgb2YgZGFtYWdlLCBmcm9tIHRoZSBzdXJmYWNlLlxuICBhc3NlcnQub2sodCAvIEhaID4gMjQgJiYgdCAvIEhaIDwgMjgsIGBkcm93bmVkIGFmdGVyICR7dCAvIEhafSBzYCk7XG59KTtcblxudGVzdCgnYSBmbG9hdGluZyBzd2ltbWVyIHN0aWxsIGNsaW1icyBvdXQgb250byB0aGUgYmFuaycsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBwb29sKCk7XG4gIGxldCBzID0gZmxvYXRpbmcod29ybGQpO1xuICBzID0gcnVuKHdvcmxkLCBzLCAzICogSFosIHsgbW92ZVg6IDEgfSk7XG4gIGFzc2VydC5lcXVhbChzLm1vZGUsICdncm91bmQnKTtcbiAgYXNzZXJ0LmVxdWFsKHMueSwgU1VSRkFDRSk7XG4gIGFzc2VydC5vayhzLnggPiA3KTtcbn0pO1xuXG50ZXN0KCdzd2ltbWluZyBvdmVyIGEgc3VibWVyZ2VkIGxlZGdlIGdsaWRlcyBhY3Jvc3Mgd2l0aG91dCBkaXBwaW5nIHRoZSBoZWFkIHVuZGVyJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IHBvb2woKTtcbiAgLy8gQSAyIG0gd2lkZSBsZWRnZSwgaXRzIHRvcCAxIG0gYmVsb3cgdGhlIHN1cmZhY2UsIGFjcm9zcyB0aGUgcG9vbC5cbiAgZm9yIChsZXQgeiA9IC02OyB6IDw9IDY7IHorKykgZm9yIChsZXQgeCA9IDA7IHggPD0gMTsgeCsrKSBmb3IgKGxldCB5ID0gMzE7IHkgPD0gMzM7IHkrKykgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIE1BVC5TVE9ORSk7XG4gIGxldCBzID0gcnVuKHdvcmxkLCBjcmVhdGVDaGFyYWN0ZXIoLTQuNSwgMzEsIDAuNSksIDQgKiBIWik7XG4gIGxldCBsb3dlc3QgPSBJbmZpbml0eTtcbiAgcyA9IHJ1bih3b3JsZCwgcywgTWF0aC5yb3VuZCgzLjUgKiBIWiksIHsgbW92ZVg6IDEgfSwgKHEpID0+IHtcbiAgICBhc3NlcnQuZXF1YWwocS5oZWFkVW5kZXJ3YXRlciwgZmFsc2UsIGB4ICR7cS54fSB5ICR7cS55fWApO1xuICAgIGFzc2VydC5lcXVhbChxLm1vZGUsICdzd2ltJyk7XG4gICAgbG93ZXN0ID0gTWF0aC5taW4obG93ZXN0LCBxLnkpO1xuICB9KTtcbiAgYXNzZXJ0Lm9rKHMueCA+IDMsIGBjcm9zc2VkICh4ICR7cy54fSlgKTtcbiAgYXNzZXJ0Lm9rKGxvd2VzdCA+IFNVUkZBQ0UgLSBGTE9BVF9ERVBUSCAtIDAuMTUsIGBsb3dlc3QgJHtsb3dlc3R9YCk7XG4gIGFzc2VydC5lcXVhbChzLmJyZWF0aCwgMSk7XG59KTtcblxudGVzdCgnaW4gdGhlIHJpdmVyIG5lYXIgdGhlIHNwYXduIHRoZSBmb3VuZGVyIGZsb2F0cyBhdCByZXN0IGZvciA5MCBzIHdpdGhvdXQgbG9zaW5nIGJyZWF0aCBvciBoZWFsdGgnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNywgTEFURVNUX0dFTkVSQVRPUl9WRVJTSU9OKTtcbiAgZm9yIChsZXQgZHogPSAtMTsgZHogPD0gMTsgZHorKykgZm9yIChsZXQgZHggPSAtMTsgZHggPD0gMTsgZHgrKykgZW5zdXJlQ2h1bmsod29ybGQsIHdvcmxkVG9DaHVua1goLTYwKSArIGR4LCB3b3JsZFRvQ2h1bmtaKDQpICsgZHopO1xuICBhc3NlcnQub2sod2F0ZXJEZXB0aEF0KHdvcmxkLCAtNjAsIDQpID49IDIsICdkZWVwIHJpdmVyIGNvbHVtbicpO1xuICBsZXQgcyA9IGNyZWF0ZUNoYXJhY3RlcigtNTkuNSwgZmluZFN0YW5kaW5nWSh3b3JsZCwgLTU5LjUsIDQuNSwgMTEwKSEsIDQuNSk7XG4gIHMgPSBydW4od29ybGQsIHMsIDkwICogSFopO1xuICBhc3NlcnQuZXF1YWwocy5tb2RlLCAnc3dpbScpO1xuICBhc3NlcnQuZXF1YWwocy5kZWFkLCBmYWxzZSk7XG4gIGFzc2VydC5lcXVhbChzLmhlYWRVbmRlcndhdGVyLCBmYWxzZSk7XG4gIGFzc2VydC5lcXVhbChzLmJyZWF0aCwgMSk7XG4gIGFzc2VydC5lcXVhbChzLmhlYWx0aCwgTUFYX0hFQUxUSCk7XG59KTtcblxuLy8gLS0tLSBhbmltYXRpb24gLS0tLVxuXG5jb25zdCB3b3JsZDMgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuY29uc3QgaGVhZFkgPSAoZjogUmV0dXJuVHlwZTx0eXBlb2YgYnVpbGRGaWd1cmU+KSA9PiB7IGYucm9vdC51cGRhdGVNYXRyaXhXb3JsZCh0cnVlKTsgcmV0dXJuIGYuaGVhZC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkMykueTsgfTtcblxuLyoqIFN0ZXAgdGhlIHNpbSBhbmQgYW5pbWF0ZSBhIGZpZ3VyZSBhdCAzMCBmcHM7IGBlYWNoYCBzZWVzIHRoZSBmaWd1cmUgYWZ0ZXIgZWFjaCBmcmFtZS4gKi9cbmZ1bmN0aW9uIGFuaW1hdGUod29ybGQ6IFdvcmxkLCBzOiBDaGFyYWN0ZXJTdGF0ZSwgc2Vjb25kczogbnVtYmVyLCBpOiBQYXJ0aWFsPENoYXJhY3RlcklucHV0PiwgZjogUmV0dXJuVHlwZTx0eXBlb2YgYnVpbGRGaWd1cmU+LCBlYWNoPzogKHM6IENoYXJhY3RlclN0YXRlKSA9PiB2b2lkKSB7XG4gIGZvciAobGV0IGsgPSAwOyBrIDwgc2Vjb25kcyAqIEhaOyBrKyspIHtcbiAgICBzID0gc3RlcENoYXJhY3Rlcih3b3JsZCwgcywgaW5wdXQoaSkpO1xuICAgIHBsYWNlRmlndXJlKGYsIHMueCwgcy55LCBzLnosIHMuaGVhZGluZyk7XG4gICAgYW5pbWF0ZUZpZ3VyZShmLCBzLCBGSVhFRF9TVEVQKTtcbiAgICBlYWNoPy4ocyk7XG4gIH1cbiAgcmV0dXJuIHM7XG59XG5cbnRlc3QoJ3N3aW1taW5nIGF0IHRoZSBzdXJmYWNlIHN0cm9rZXM6IGFybSBhbmQgbGVnIGpvaW50cyBjeWNsZSB3aXRoIHNwZWVkLCBuZWNrIGFib3ZlIHRoZSBkcmF3biB3YXRlcicsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBwb29sKCk7XG4gIGNvbnN0IGYgPSBidWlsZEZpZ3VyZSgpO1xuICBsZXQgcyA9IGFuaW1hdGUod29ybGQsIGNyZWF0ZUNoYXJhY3RlcigtNC41LCAzMSwgMC41KSwgMywge30sIGYpO1xuICBjb25zdCBhcm1YOiBudW1iZXJbXSA9IFtdLCBsZWdYOiBudW1iZXJbXSA9IFtdO1xuICBzID0gYW5pbWF0ZSh3b3JsZCwgcywgMywgeyBtb3ZlWDogMSB9LCBmLCAocSkgPT4ge1xuICAgIGFybVgucHVzaChmLmFybUwucm90YXRpb24ueCk7IGxlZ1gucHVzaChmLmxlZ0wucm90YXRpb24ueCk7XG4gICAgYXNzZXJ0Lm9rKGhlYWRZKGYpID4gcS53YXRlclN1cmZhY2UgLSBXQVRFUl9EUkFXX0RST1AsICduZWNrIGFib3ZlIHRoZSBkcmF3biB3YXRlciBsaW5lJyk7XG4gIH0pO1xuICBhc3NlcnQuZXF1YWwocy5tb2RlLCAnc3dpbScpO1xuICBjb25zdCBzcGFuID0gKHY6IG51bWJlcltdKSA9PiBNYXRoLm1heCguLi52KSAtIE1hdGgubWluKC4uLnYpO1xuICBhc3NlcnQub2soc3Bhbihhcm1YLnNsaWNlKC02MCkpID4gMS40LCBgYXJtIHN3ZWVwICR7c3Bhbihhcm1YKX1gKTtcbiAgYXNzZXJ0Lm9rKHNwYW4obGVnWC5zbGljZSgtNjApKSA+IDAuNywgYGxlZyBraWNrICR7c3BhbihsZWdYKX1gKTtcbiAgLy8gVGhlIGJvZHkgbGVhbnMgaW50byB0aGUgc3Ryb2tlOyB0aGUgaGVhZCBzdGF5cyB1cC5cbiAgYXNzZXJ0Lm9rKGYuaGlwcy5yb3RhdGlvbi54ID4gMC42LCBgYm9keSBwaXRjaCAke2YuaGlwcy5yb3RhdGlvbi54fWApO1xuICBhc3NlcnQub2soZi5yaXBwbGUuc2NhbGUueCA+IDAuNSwgJ2ZvYW0gcmluZyBhdCB0aGUgd2F0ZXIgbGluZScpO1xufSk7XG5cbnRlc3QoJ2Zsb2F0aW5nIGlkbGUgdHJlYWRzIHdhdGVyOiBhcm1zIHNjdWxsIG91dCB0byB0aGUgc2lkZXMsIGxlZ3Mga2ljayBnZW50bHksIGJvZHkgdXByaWdodCcsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBwb29sKCk7XG4gIGNvbnN0IGYgPSBidWlsZEZpZ3VyZSgpO1xuICBsZXQgcyA9IGFuaW1hdGUod29ybGQsIGNyZWF0ZUNoYXJhY3RlcigwLjUsIDMxLCAwLjUpLCA0LCB7fSwgZik7XG4gIGNvbnN0IHpzOiBudW1iZXJbXSA9IFtdLCB4czogbnVtYmVyW10gPSBbXSwgbGVnczogbnVtYmVyW10gPSBbXTtcbiAgcyA9IGFuaW1hdGUod29ybGQsIHMsIDIsIHt9LCBmLCAocSkgPT4ge1xuICAgIHpzLnB1c2goZi5hcm1MLnJvdGF0aW9uLnopOyB4cy5wdXNoKGYuYXJtTC5yb3RhdGlvbi54KTsgbGVncy5wdXNoKGYubGVnTC5yb3RhdGlvbi54IC0gZi5sZWdSLnJvdGF0aW9uLngpO1xuICAgIGFzc2VydC5vayhoZWFkWShmKSA+IHEud2F0ZXJTdXJmYWNlIC0gV0FURVJfRFJBV19EUk9QICsgMC4wMywgJ25lY2sgY2xlYXIgb2YgdGhlIHdhdGVyJyk7XG4gIH0pO1xuICBhc3NlcnQub2soTWF0aC5taW4oLi4uenMpID4gMC43LCAnYXJtcyBvdXQgdG8gdGhlIHNpZGVzJyk7XG4gIGFzc2VydC5vayhNYXRoLm1heCguLi54cykgLSBNYXRoLm1pbiguLi54cykgPiAwLjUsICdzY3VsbGluZyBmb3J3YXJkIGFuZCBiYWNrJyk7XG4gIGFzc2VydC5vayhNYXRoLm1heCguLi5sZWdzKSAtIE1hdGgubWluKC4uLmxlZ3MpID4gMC42LCAnbGVncyBraWNrIGFsdGVybmF0ZWx5Jyk7XG4gIGFzc2VydC5vayhmLmhpcHMucm90YXRpb24ueCA8IDAuMywgJ3VwcmlnaHQnKTtcbiAgLy8gVGhlIGZpZ3VyZSBib2JzOiBoaXBzIGhlaWdodCBjaGFuZ2VzIGEgbGl0dGxlIG92ZXIgdGltZS5cbiAgY29uc3QgaHk6IG51bWJlcltdID0gW107XG4gIGFuaW1hdGUod29ybGQsIHMsIDQsIHt9LCBmLCAoKSA9PiBoeS5wdXNoKGYuaGlwcy5wb3NpdGlvbi55KSk7XG4gIGNvbnN0IGJvYiA9IE1hdGgubWF4KC4uLmh5KSAtIE1hdGgubWluKC4uLmh5KTtcbiAgYXNzZXJ0Lm9rKGJvYiA+IDAuMDIgJiYgYm9iIDwgMC4xMiwgYGJvYiAke2JvYn1gKTtcbn0pO1xuXG50ZXN0KCd1bmRlcndhdGVyIHRoZSBib2R5IHBpdGNoZXMgdG93YXJkIHRoZSBzd2ltIGRpcmVjdGlvbiBhbmQgc3Ryb2tlczsgdHJhbnNpdGlvbnMgYXJlIHNtb290aCcsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBwb29sKCk7XG4gIGNvbnN0IGYgPSBidWlsZEZpZ3VyZSgpO1xuICBsZXQgcyA9IGFuaW1hdGUod29ybGQsIGNyZWF0ZUNoYXJhY3RlcigwLjUsIDMxLCAwLjUpLCA0LCB7fSwgZik7XG4gIGxldCBwcmV2ID0geyBhcm06IGYuYXJtTC5yb3RhdGlvbi54LCBwaXRjaDogZi5oaXBzLnJvdGF0aW9uLngsIHk6IGYuaGlwcy5wb3NpdGlvbi55IH07XG4gIGxldCBqdW1wID0gMDtcbiAgY29uc3QgdHJhY2sgPSAoKSA9PiB7XG4gICAganVtcCA9IE1hdGgubWF4KGp1bXAsIE1hdGguYWJzKGYuaGlwcy5yb3RhdGlvbi54IC0gcHJldi5waXRjaCksIE1hdGguYWJzKGYuaGlwcy5wb3NpdGlvbi55IC0gcHJldi55KSk7XG4gICAgcHJldiA9IHsgYXJtOiBmLmFybUwucm90YXRpb24ueCwgcGl0Y2g6IGYuaGlwcy5yb3RhdGlvbi54LCB5OiBmLmhpcHMucG9zaXRpb24ueSB9O1xuICB9O1xuICAvLyBTdHJhaWdodCBkb3duOiBoZWFkIGZpcnN0LlxuICBzID0gYW5pbWF0ZSh3b3JsZCwgcywgMS4yLCB7IGRpdmU6IHRydWUgfSwgZiwgdHJhY2spO1xuICBhc3NlcnQuZXF1YWwocy5oZWFkVW5kZXJ3YXRlciwgdHJ1ZSk7XG4gIGFzc2VydC5vayhmLmhpcHMucm90YXRpb24ueCA+IDIuMiwgYGhlYWQtZG93biBkaXZlIHBpdGNoICR7Zi5oaXBzLnJvdGF0aW9uLnh9YCk7XG4gIC8vIEFsb25nIHRoZSBmbG9vcjogYWJvdXQgbGV2ZWwuXG4gIGNvbnN0IGFybXM6IG51bWJlcltdID0gW107XG4gIHMgPSBhbmltYXRlKHdvcmxkLCBzLCAyLCB7IGRpdmU6IHRydWUsIG1vdmVYOiAxIH0sIGYsIChxKSA9PiB7IHRyYWNrKCk7IGFybXMucHVzaChmLmFybUwucm90YXRpb24ueCk7IH0pO1xuICBzID0gYW5pbWF0ZSh3b3JsZCwgcywgMS41LCB7IG1vdmVYOiAtMSB9LCBmLCB0cmFjayk7XG4gIGFzc2VydC5vayhNYXRoLm1heCguLi5hcm1zKSAtIE1hdGgubWluKC4uLmFybXMpID4gMiwgJ2xvbmcgdW5kZXJ3YXRlciBwdWxsJyk7XG4gIC8vIFJlbGVhc2luZzogcmlzaW5nIHVwcmlnaHQsIHRoZW4gYmFjayB0byB0cmVhZGluZyBhdCB0aGUgc3VyZmFjZS5cbiAgcyA9IGFuaW1hdGUod29ybGQsIHMsIDUsIHt9LCBmLCB0cmFjayk7XG4gIGFzc2VydC5lcXVhbChzLmhlYWRVbmRlcndhdGVyLCBmYWxzZSk7XG4gIGFzc2VydC5vayhmLmhpcHMucm90YXRpb24ueCA8IDAuMywgYHVwcmlnaHQgYWdhaW4gJHtmLmhpcHMucm90YXRpb24ueH1gKTtcbiAgYXNzZXJ0Lm9rKGp1bXAgPCAwLjI1LCBgbm8gcG9zZSBzbmFwcyBiZXR3ZWVuIGZyYW1lcyAobGFyZ2VzdCBzdGVwICR7anVtcH0pYCk7XG4gIC8vIENsaW1iIG91dDogdGhlIGZpZ3VyZSBnb2VzIGJhY2sgdG8gdGhlIHdhbGtpbmcgcG9zZS5cbiAgcyA9IHsgLi4ucywgeDogNS41IH07XG4gIHMgPSBhbmltYXRlKHdvcmxkLCBzLCAxLjYsIHsgbW92ZVg6IDEgfSwgZik7XG4gIGFzc2VydC5lcXVhbChzLm1vZGUsICdncm91bmQnKTtcbiAgYXNzZXJ0Lm9rKGYuaGlwcy5yb3RhdGlvbi54IDwgMC4wMSAmJiBNYXRoLmFicyhmLmhpcHMucG9zaXRpb24ueSAtIDAuODIpIDwgMC4wNiwgJ3dhbGtpbmcgcG9zZScpO1xuICBhc3NlcnQuZXF1YWwoZi5yaXBwbGUuc2NhbGUueCwgMCwgJ25vIGZvYW0gb24gbGFuZCcpO1xufSk7XG5cbnRlc3QoJ3RoZSBmaWd1cmUgaXMgc3RpbGwgb25lIHNraW5uZWQgbWVzaCAob25lIGRyYXcgY2FsbCBwZXIgcGFzcykgd2l0aCB0aGUgZm9hbSByaW5nIGluY2x1ZGVkJywgKCkgPT4ge1xuICBjb25zdCBmID0gYnVpbGRGaWd1cmUoKTtcbiAgbGV0IG1lc2hlcyA9IDAsIHRyaXMgPSAwO1xuICBmLnJvb3QudHJhdmVyc2UoKG4pID0+IHsgY29uc3QgbSA9IG4gYXMgVEhSRUUuTWVzaDsgaWYgKG0uaXNNZXNoKSB7IG1lc2hlcysrOyB0cmlzICs9IG0uZ2VvbWV0cnkuYXR0cmlidXRlcy5wb3NpdGlvbi5jb3VudCAvIDM7IH0gfSk7XG4gIGFzc2VydC5lcXVhbChtZXNoZXMsIDEpO1xuICBhc3NlcnQub2sodHJpcyA8IDQwMCwgYHRyaWFuZ2xlcyAke3RyaXN9YCk7XG59KTtcbiIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gRGV0ZXJtaW5pc3RpYyBoYXNoLCBub2lzZSBhbmQgbWF0aCBoZWxwZXJzIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllci5cbi8vIFB1cmUgVHlwZVNjcmlwdCAoRC0wMDUpLiBFeHRyYWN0ZWQgZnJvbSB3b3JsZC50cyB1bmNoYW5nZWQgc28gdGVycmFpblxuLy8gZ2VuZXJhdG9ycyBvZiBldmVyeSB2ZXJzaW9uIHVzZSBpZGVudGljYWwgcHJpbWl0aXZlcy5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5leHBvcnQgY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4iLCAiLy8gSHlkcm9sb2d5IFx1MjAxNCB0aGUgZGV0ZXJtaW5pc3RpYyB3YXRlciBuZXR3b3JrIG9mIGEgd29ybGQgKHB1cmUgVHlwZVNjcmlwdCwgRC0wMDUpLlxuLy9cbi8vIFRoaXMgaXMgZGVyaXZlZCAqc2ltdWxhdGlvbiBkYXRhKiwgbm90IHByZXNlbnRhdGlvbjogaXQgaXMgYSBwdXJlIGZ1bmN0aW9uIG9mXG4vLyAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pIGFuZCBpcyB3aGF0IHRlcnJhaW4gY2FydmluZywgd2F0ZXIgZmlsbGluZywgZmxvd1xuLy8gZGlyZWN0aW9uIGFuZCBmdXR1cmUgZmlzaGluZy9pcnJpZ2F0aW9uL2Zsb29kaW5nIHJ1bGVzIHJlYWQuIEl0IGlzIG5ldmVyXG4vLyBqb3VybmFsZWQgYmVjYXVzZSBpdCBjYW4gYWx3YXlzIGJlIHJlZ2VuZXJhdGVkIGV4YWN0bHkuXG4vL1xuLy8gTmV0d29yayAoYm90aCBnZW5lcmF0b3IgdmVyc2lvbnMpOlxuLy8gICBsYWtlICBcdTIwMTQgdGhlIHZhbGxleSBsYWtlIGJhc2luLCBsb2NhdGVkIGZyb20gdGhlIGFjdHVhbCBnZW5lcmF0ZWQgdGVycmFpbi5cbi8vICAgbG93ZXIgXHUyMDE0IHRoZSBsb3dsYW5kIHJpdmVyIGZyb20gdGhlIGxha2UgdG8gdGhlIHNvdXRoZXJuIHNlYSwgdHJhY2VkIGZyb21cbi8vICAgICAgICAgICB0aGUgYWN0dWFsIGNhcnZlZCBjaGFubmVsICh0aGUgdjEgY2hhbm5lbCBpcyBjYXJ2ZWQgb24gKndhcnBlZCpcbi8vICAgICAgICAgICBjb29yZGluYXRlcywgc28gYHJpdmVyQ2VudGVyWGAgYWxvbmUgaXMgdXAgdG8gfjEzNSBtIG9mZikuXG4vLyBHZW5lcmF0b3IgdjIgYWRkczpcbi8vICAgdXBwZXIgXHUyMDE0IGEgbW91bnRhaW4gcml2ZXIgZnJvbSBhIGhpZ2hsYW5kIHRhcm4gZG93biB0byB0aGUgbGFrZSwgd2l0aCBhXG4vLyAgICAgICAgICAgd2F0ZXItc3VyZmFjZSBsZXZlbCB0aGF0IG5ldmVyIHJpc2VzIGRvd25zdHJlYW0sIGNhc2NhZGVzIGFuZCBmYWxscy5cbi8vXG4vLyBGbG93IGFsd2F5cyBwb2ludHMgZG93bnN0cmVhbTogdXBwZXIgXHUyMTkyIGxha2UgXHUyMTkyIGxvd2VyIFx1MjE5MiBzZWEuXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbXVsYmVycnkzMiwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuXG5leHBvcnQgdHlwZSBIZWlnaHRTYW1wbGVyID0gKHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUml2ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZCBvZiB0aGlzIHJlYWNoIChtZXRyZXMpLiAqL1xuICBzOiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGVsZXZhdGlvbiAobWV0cmVzLCBtYXkgYmUgZnJhY3Rpb25hbCkuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBDaGFubmVsIGhhbGYtd2lkdGggKG1ldHJlcykuICovXG4gIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY2hIaXQge1xuICAvKiogSG9yaXpvbnRhbCBkaXN0YW5jZSBmcm9tIHRoZSBjZW50cmVsaW5lLiAqL1xuICBkOiBudW1iZXI7XG4gIC8qKiBJbnRlcnBvbGF0ZWQgd2F0ZXIgbGV2ZWwgYXQgdGhlIG5lYXJlc3QgY2VudHJlbGluZSBwb2ludC4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgd2lkdGg6IG51bWJlcjtcbiAgLyoqIFVuaXQgZG93bnN0cmVhbSBkaXJlY3Rpb24uICovXG4gIHR4OiBudW1iZXI7XG4gIHR6OiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGRyb3AgcGVyIG1ldHJlIGFsb25nIHRoZSBjaGFubmVsICg+PSAwKS4gKi9cbiAgZ3JhZGllbnQ6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggb2YgdGhlIG5lYXJlc3QgcG9pbnQgZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQuICovXG4gIHM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvbHlsaW5lIHJlYWNoIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LiBOZWFyZXN0LXNlZ21lbnQgcXVlcmllcyB1c2UgYVxuICogdW5pZm9ybSBncmlkIHdob3NlIGNlbGxzIGxpc3QgZXZlcnkgc2VnbWVudCB3aXRoaW4gYHJlYWNoYCBtZXRyZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSaXZlclJlYWNoIHtcbiAgcmVhZG9ubHkgcG9pbnRzOiBSaXZlclBvaW50W107XG4gIHByaXZhdGUgcmVhZG9ubHkgY2VsbCA9IDMyO1xuICBwcml2YXRlIHJlYWRvbmx5IGdyaWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cbiAgY29uc3RydWN0b3IocG9pbnRzOiBSaXZlclBvaW50W10sIHJlYWRvbmx5IHJlYWNoOiBudW1iZXIpIHtcbiAgICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgICBmb3IgKGxldCBpID0gMDsgaSArIDEgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBwb2ludHNbaV0sIGIgPSBwb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgeDAgPSBNYXRoLm1pbihhLngsIGIueCkgLSByZWFjaCwgeDEgPSBNYXRoLm1heChhLngsIGIueCkgKyByZWFjaDtcbiAgICAgIGNvbnN0IHowID0gTWF0aC5taW4oYS56LCBiLnopIC0gcmVhY2gsIHoxID0gTWF0aC5tYXgoYS56LCBiLnopICsgcmVhY2g7XG4gICAgICBmb3IgKGxldCBjeiA9IE1hdGguZmxvb3IoejAgLyB0aGlzLmNlbGwpOyBjeiA8PSBNYXRoLmZsb29yKHoxIC8gdGhpcy5jZWxsKTsgY3orKykge1xuICAgICAgICBmb3IgKGxldCBjeCA9IE1hdGguZmxvb3IoeDAgLyB0aGlzLmNlbGwpOyBjeCA8PSBNYXRoLmZsb29yKHgxIC8gdGhpcy5jZWxsKTsgY3grKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGNlbGxLZXkoY3gsIGN6KTtcbiAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoa2V5KTtcbiAgICAgICAgICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB0aGlzLmdyaWQuc2V0KGtleSwgbGlzdCk7IH1cbiAgICAgICAgICBsaXN0LnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBvaW50c1t0aGlzLnBvaW50cy5sZW5ndGggLSAxXT8ucyA/PyAwOyB9XG5cbiAgLyoqIE5lYXJlc3QgY2VudHJlbGluZSBwb2ludCB3aXRoaW4gYHJlYWNoYCwgb3IgbnVsbC4gKi9cbiAgbmVhcmVzdCh4OiBudW1iZXIsIHo6IG51bWJlcik6IFJlYWNoSGl0IHwgbnVsbCB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoY2VsbEtleShNYXRoLmZsb29yKHggLyB0aGlzLmNlbGwpLCBNYXRoLmZsb29yKHogLyB0aGlzLmNlbGwpKSk7XG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBiaSA9IC0xLCBidCA9IDA7XG4gICAgZm9yIChjb25zdCBpIG9mIGxpc3QpIHtcbiAgICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tpXSwgYiA9IHRoaXMucG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IGR4ID0gYi54IC0gYS54LCBkeiA9IGIueiAtIGEuejtcbiAgICAgIGNvbnN0IGxlbjIgPSBkeCAqIGR4ICsgZHogKiBkeiB8fCAxO1xuICAgICAgY29uc3QgdCA9IGNsYW1wKCgoeCAtIGEueCkgKiBkeCArICh6IC0gYS56KSAqIGR6KSAvIGxlbjIsIDAsIDEpO1xuICAgICAgY29uc3QgcHggPSBhLnggKyBkeCAqIHQsIHB6ID0gYS56ICsgZHogKiB0O1xuICAgICAgY29uc3QgZDIgPSAoeCAtIHB4KSAqKiAyICsgKHogLSBweikgKiogMjtcbiAgICAgIGlmIChkMiA8IGJlc3QpIHsgYmVzdCA9IGQyOyBiaSA9IGk7IGJ0ID0gdDsgfVxuICAgIH1cbiAgICBpZiAoYmkgPCAwIHx8IGJlc3QgPiB0aGlzLnJlYWNoICogdGhpcy5yZWFjaCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2JpXSwgYiA9IHRoaXMucG9pbnRzW2JpICsgMV07XG4gICAgY29uc3Qgc2VnTGVuID0gTWF0aC5tYXgoMWUtNiwgYi5zIC0gYS5zKTtcbiAgICAvLyBQb2ludHMgYXJlIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LCBzbyBkb3duc3RyZWFtIGlzIGEgPC0gYi5cbiAgICBjb25zdCB0eCA9IChhLnggLSBiLngpIC8gc2VnTGVuLCB0eiA9IChhLnogLSBiLnopIC8gc2VnTGVuO1xuICAgIHJldHVybiB7XG4gICAgICBkOiBNYXRoLnNxcnQoYmVzdCksXG4gICAgICBsZXZlbDogYS5sZXZlbCArIChiLmxldmVsIC0gYS5sZXZlbCkgKiBidCxcbiAgICAgIHdpZHRoOiBhLndpZHRoICsgKGIud2lkdGggLSBhLndpZHRoKSAqIGJ0LFxuICAgICAgdHgsIHR6LFxuICAgICAgZ3JhZGllbnQ6IE1hdGgubWF4KDAsIChiLmxldmVsIC0gYS5sZXZlbCkgLyBzZWdMZW4pLFxuICAgICAgczogYS5zICsgKGIucyAtIGEucykgKiBidCxcbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGNlbGxLZXkoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoY3ggKyA0MDk2KSAqIDgxOTIgKyAoY3ogKyA0MDk2KTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0ZXJCb2R5ID0gJ3JpdmVyJyB8ICdsYWtlJyB8ICdzZWEnIHwgJ25vbmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTYW1wbGUge1xuICBib2R5OiBXYXRlckJvZHk7XG4gIC8qKiBVbml0IGZsb3cgZGlyZWN0aW9uICh6ZXJvIGZvciBzdGlsbCB3YXRlcikuICovXG4gIGR4OiBudW1iZXI7XG4gIGR6OiBudW1iZXI7XG4gIC8qKiBTdXJmYWNlIGN1cnJlbnQgc3BlZWQgaW4gbS9zLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEh5ZHJvbG9neU9wdGlvbnMge1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKiBHZW5lcmF0b3IgdmVyc2lvbiB0aGUgbmV0d29yayBiZWxvbmdzIHRvLiAqL1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIC8qKiBCYXNlIGhlaWdodCBvZiB0aGUgKnVubW9kaWZpZWQgdjEgc2hhcGUqICh1c2VkIHRvIGxvY2F0ZSBsYWtlL2NoYW5uZWwpLiAqL1xuICB2MUhlaWdodDogSGVpZ2h0U2FtcGxlcjtcbn1cblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2dpY2FsIG5ldHdvcmsgZm9yIG9uZSAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pLiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJvbG9neSB7XG4gIHJlYWRvbmx5IHNlZWQ6IG51bWJlcjtcbiAgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuICByZWFkb25seSBsYWtlOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByeDogbnVtYmVyOyByejogbnVtYmVyIH07XG4gIHJlYWRvbmx5IGxvd2VyOiBSaXZlclJlYWNoO1xuICByZWFkb25seSB1cHBlcjogUml2ZXJSZWFjaCB8IG51bGw7XG4gIC8qKiBVcHBlci1yaXZlciBzb3VyY2UgdGFybiAodjIgb25seSkuICovXG4gIHJlYWRvbmx5IHRhcm46IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlcjsgbGV2ZWw6IG51bWJlciB9IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihvcHRzOiBIeWRyb2xvZ3lPcHRpb25zKSB7XG4gICAgdGhpcy5zZWVkID0gb3B0cy5zZWVkO1xuICAgIHRoaXMudmVyc2lvbiA9IG9wdHMudmVyc2lvbjtcbiAgICB0aGlzLmxha2UgPSBsb2NhdGVMYWtlKG9wdHMudjFIZWlnaHQpO1xuICAgIHRoaXMubG93ZXIgPSB0cmFjZUxvd2VyUml2ZXIob3B0cy52MUhlaWdodCwgdGhpcy5sYWtlKTtcbiAgICBpZiAob3B0cy52ZXJzaW9uID49IDIpIHtcbiAgICAgIGNvbnN0IHVwcGVyID0gYXV0aG9yVXBwZXJSaXZlcihvcHRzLnNlZWQsIHRoaXMubGFrZSk7XG4gICAgICB0aGlzLnVwcGVyID0gdXBwZXIucmVhY2g7XG4gICAgICB0aGlzLnRhcm4gPSB1cHBlci50YXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwcGVyID0gbnVsbDtcbiAgICAgIHRoaXMudGFybiA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1cmZhY2UgY3VycmVudCBmb3IgYSB3YXRlciBjb2x1bW4uIGBsZXZlbGAgaXMgdGhlIGNvbHVtbidzIHdhdGVyIHN1cmZhY2UsXG4gICAqIHVzZWQgdG8gdGVsbCBzZWEtbGV2ZWwgd2F0ZXIgKGxha2UsIGxvd2VyIHJpdmVyLCBzZWEpIGZyb20gdGhlIHVwcGVyIHJpdmVyLlxuICAgKi9cbiAgZmxvd0F0KHg6IG51bWJlciwgejogbnVtYmVyLCBsZXZlbDogbnVtYmVyKTogRmxvd1NhbXBsZSB7XG4gICAgaWYgKHRoaXMudXBwZXIgJiYgbGV2ZWwgPiAwLjUpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMudXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPD0gaGl0LndpZHRoICsgMikge1xuICAgICAgICBjb25zdCBzcGVlZCA9IGNsYW1wKDAuNTUgKyBoaXQuZ3JhZGllbnQgKiA5LCAwLjQsIDQuNSk7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBoaXQudHgsIGR6OiBoaXQudHosIHNwZWVkIH07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50YXJuICYmIE1hdGguaHlwb3QoeCAtIHRoaXMudGFybi54LCB6IC0gdGhpcy50YXJuLnopIDwgdGhpcy50YXJuLnIgKyA0KSB7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4udG93YXJkcyh4LCB6LCB0aGlzLnVwcGVyU291cmNlKCksIDAuMDYpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxvdyA9IHRoaXMubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDw9IGxvdy53aWR0aCArIDYpIHtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBsb3cudHgsIGR6OiBsb3cudHosIHNwZWVkOiAwLjM1ICsgMC4yNSAqIHNtb290aHN0ZXAobG93LndpZHRoICsgNiwgMCwgbG93LmQpIH07XG4gICAgfVxuICAgIGNvbnN0IGxkID0gTWF0aC5oeXBvdCgoeCAtIHRoaXMubGFrZS54KSAvIHRoaXMubGFrZS5yeCwgKHogLSB0aGlzLmxha2UueikgLyB0aGlzLmxha2UucnopO1xuICAgIGlmIChsZCA8IDEuMzUpIHtcbiAgICAgIC8vIFNsb3cgZHJpZnQgZnJvbSB0aGUgaW5mbG93IHRvd2FyZCB0aGUgb3V0ZmxvdyBhdCB0aGUgaGVhZCBvZiB0aGUgbG93ZXIgcml2ZXIuXG4gICAgICBjb25zdCBoZWFkID0gdGhpcy5sb3dlci5wb2ludHNbdGhpcy5sb3dlci5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBkcmlmdCA9IHRvd2FyZHMoeCwgeiwgaGVhZCwgMC4wOCk7XG4gICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLmRyaWZ0IH07XG4gICAgfVxuICAgIHJldHVybiB7IGJvZHk6ICdzZWEnLCBkeDogMCwgZHo6IDAsIHNwZWVkOiAwIH07XG4gIH1cblxuICBwcml2YXRlIHVwcGVyU291cmNlKCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcHRzID0gdGhpcy51cHBlciEucG9pbnRzO1xuICAgIHJldHVybiBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvd2FyZHMoeDogbnVtYmVyLCB6OiBudW1iZXIsIHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgc3BlZWQ6IG51bWJlcikge1xuICBjb25zdCBkeCA9IHAueCAtIHgsIGR6ID0gcC56IC0gejtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gIHJldHVybiB7IGR4OiBkeCAvIGxlbiwgZHo6IGR6IC8gbGVuLCBzcGVlZCB9O1xufVxuXG4vKiogRmluZCB0aGUgdmFsbGV5IGxha2UgZnJvbSB0aGUgdGVycmFpbiBpdHNlbGY6IHRoZSBkZWVwIGJhc2luIE5XIG9mIHRoZSBmb3VuZGVyIHZhbGxleS4gKi9cbmZ1bmN0aW9uIGxvY2F0ZUxha2UoaDogSGVpZ2h0U2FtcGxlcik6IEh5ZHJvbG9neVsnbGFrZSddIHtcbiAgbGV0IHN4ID0gMCwgc3ogPSAwLCBuID0gMCwgbWluWCA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtaW5aID0gSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gIGZvciAobGV0IHogPSAtNDYwOyB6IDw9IC0xMjA7IHogKz0gNCkge1xuICAgIGZvciAobGV0IHggPSAtNDgwOyB4IDw9IC00MDsgeCArPSA0KSB7XG4gICAgICBpZiAoaCh4LCB6KSA+IC00KSBjb250aW51ZTtcbiAgICAgIHN4ICs9IHg7IHN6ICs9IHo7IG4rKztcbiAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCB4KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHgpO1xuICAgICAgbWluWiA9IE1hdGgubWluKG1pblosIHopOyBtYXhaID0gTWF0aC5tYXgobWF4Wiwgeik7XG4gICAgfVxuICB9XG4gIGlmIChuID09PSAwKSByZXR1cm4geyB4OiAtMjYwLCB6OiAtMjMwLCByeDogMTIwLCByejogOTUgfTtcbiAgcmV0dXJuIHtcbiAgICB4OiBzeCAvIG4sIHo6IHN6IC8gbixcbiAgICByeDogTWF0aC5tYXgoMzAsIChtYXhYIC0gbWluWCkgLyAyICsgMTApLCByejogTWF0aC5tYXgoMzAsIChtYXhaIC0gbWluWikgLyAyICsgMTApLFxuICB9O1xufVxuXG4vKipcbiAqIFRyYWNlIHRoZSBjYXJ2ZWQgbG93bGFuZCBjaGFubmVsIGZyb20gdGhlIGxha2Ugb3V0ZmxvdyBzb3V0aCB0byB0aGUgc2VhLiBGb3JcbiAqIGVhY2ggNCBtIHJvdyB0aGUgY2hhbm5lbCBpcyB0aGUgbG93ZXN0IGNvbHVtbiBuZWFyIHRoZSBwcmV2aW91cyBjZW50cmU7IHRoZVxuICogdHJhY2UgaXMgc21vb3RoZWQgc28gdGhlIGZsb3cgZmllbGQgZG9lcyBub3Qgaml0dGVyIHdpdGggdGhlIDEgbSB2b3hlbHMuXG4gKi9cbmZ1bmN0aW9uIHRyYWNlTG93ZXJSaXZlcihoOiBIZWlnaHRTYW1wbGVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IFJpdmVyUmVhY2gge1xuICBjb25zdCByYXc6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgbGV0IGN4ID0gbGFrZS54ICsgbGFrZS5yeCAqIDAuNTU7XG4gIGxldCB6ID0gTWF0aC5yb3VuZChsYWtlLnogKyBsYWtlLnJ6ICogMC42KTtcbiAgLy8gU3RhcnQgYXQgdGhlIGxha2UncyBzb3V0aC1lYXN0IG91dGZsb3cgYW5kIGZvbGxvdyB0aGUgY2hhbm5lbCBkb3duc3RyZWFtLlxuICBmb3IgKDsgeiA8PSA5MDA7IHogKz0gNCkge1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJ4ID0gY3g7XG4gICAgZm9yIChsZXQgeCA9IE1hdGgucm91bmQoY3ggLSA0MCk7IHggPD0gY3ggKyA0MDsgeCArPSAyKSB7XG4gICAgICBjb25zdCB2ID0gaCh4LCB6KSArIE1hdGguYWJzKHggLSBjeCkgKiAwLjAyO1xuICAgICAgaWYgKHYgPCBiZXN0KSB7IGJlc3QgPSB2OyBieCA9IHg7IH1cbiAgICB9XG4gICAgY3ggPSBieDtcbiAgICByYXcucHVzaCh7IHg6IGJ4LCB6IH0pO1xuICAgIC8vIFRoZSB0cmFjZSBlbmRzIG9uY2UgaXQgcmVhY2hlcyBvcGVuIHNlYSBmb3IgYSBzdXN0YWluZWQgc3RyZXRjaC5cbiAgICBpZiAoYmVzdCA8IC02ICYmIHJhdy5sZW5ndGggPiAyMCAmJiBoKGJ4LCB6ICsgOCkgPCAtNiAmJiBoKGJ4LCB6ICsgMTYpIDwgLTYpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHNtb290aCA9IHJhdy5tYXAoKHAsIGkpID0+IHtcbiAgICBsZXQgc3ggPSAwLCBuID0gMDtcbiAgICBmb3IgKGxldCBrID0gTWF0aC5tYXgoMCwgaSAtIDQpOyBrIDw9IE1hdGgubWluKHJhdy5sZW5ndGggLSAxLCBpICsgNCk7IGsrKykgeyBzeCArPSByYXdba10ueDsgbisrOyB9XG4gICAgcmV0dXJuIHsgeDogc3ggLyBuLCB6OiBwLnogfTtcbiAgfSk7XG4gIC8vIFN0b3JlIGRvd25zdHJlYW0tZmlyc3Q6IGluZGV4IDAgaXMgdGhlIHNlYSBtb3V0aC5cbiAgc21vb3RoLnJldmVyc2UoKTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSBbXTtcbiAgbGV0IHMgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNtb290aC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChpID4gMCkgcyArPSBNYXRoLmh5cG90KHNtb290aFtpXS54IC0gc21vb3RoW2kgLSAxXS54LCBzbW9vdGhbaV0ueiAtIHNtb290aFtpIC0gMV0ueik7XG4gICAgcG9pbnRzLnB1c2goeyB4OiBzbW9vdGhbaV0ueCwgejogc21vb3RoW2ldLnosIHMsIGxldmVsOiAwLCB3aWR0aDogNiB9KTtcbiAgfVxuICByZXR1cm4gbmV3IFJpdmVyUmVhY2gocG9pbnRzLCA0MCk7XG59XG5cbi8qKiBXYXRlci1zdXJmYWNlIGRyb3BzIGFsb25nIHRoZSB1cHBlciByaXZlciwgYXMgKGZyYWN0aW9uIG9mIGxlbmd0aCwgbWV0cmVzKS4gKi9cbmNvbnN0IEZBTExTOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0+ID0gW1swLjIsIDddLCBbMC40OCwgMTFdLCBbMC43NCwgMTNdXTtcbmNvbnN0IFVQUEVSX0dSQURJRU5UID0gMC4wMztcblxuLyoqXG4gKiBBdXRob3IgdGhlIHYyIG1vdW50YWluIHJpdmVyOiBhIHNlZWRlZCBtZWFuZGVyaW5nIGNlbnRyZWxpbmUgZnJvbSB0aGUgbGFrZSdzXG4gKiBub3J0aCBzaG9yZSB0byBhIGhpZ2hsYW5kIHRhcm4sIHdpdGggYSBsZXZlbCBwcm9maWxlIHRoYXQgb25seSByaXNlc1xuICogdXBzdHJlYW0gKGdlbnRsZSBncmFkaWVudCBwbHVzIHRocmVlIGNhc2NhZGVzKS5cbiAqL1xuZnVuY3Rpb24gYXV0aG9yVXBwZXJSaXZlcihzZWVkOiBudW1iZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKToge1xuICByZWFjaDogUml2ZXJSZWFjaDsgdGFybjogTm9uTnVsbGFibGU8SHlkcm9sb2d5Wyd0YXJuJ10+O1xufSB7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKHNlZWQgXiAweDVlZWQyKSA+Pj4gMCk7XG4gIGNvbnN0IGogPSAoYTogbnVtYmVyKSA9PiAocm5kKCkgLSAwLjUpICogMiAqIGE7XG4gIGNvbnN0IG1vdXRoID0geyB4OiBsYWtlLnggKyBsYWtlLnJ4ICogMC4xLCB6OiBsYWtlLnogLSBsYWtlLnJ6ICogMC41NSB9O1xuICBjb25zdCBjb250cm9scyA9IFtcbiAgICBtb3V0aCxcbiAgICB7IHg6IGxha2UueCArIDIwICsgaigyMCksIHo6IC00MTAgKyBqKDE1KSB9LFxuICAgIHsgeDogLTE5MCArIGooMzUpLCB6OiAtNTIwICsgaigyMCkgfSxcbiAgICB7IHg6IC0yMTUgKyBqKDM1KSwgejogLTY0MCArIGooMjApIH0sXG4gICAgeyB4OiAtMTY1ICsgaigzMCksIHo6IC03NzAgKyBqKDE1KSB9LFxuICBdO1xuICAvLyBDYXRtdWxsLVJvbSB0aHJvdWdoIHRoZSBjb250cm9scywgdGhlbiByZXNhbXBsZSBhdCB+OCBtIHNwYWNpbmcgd2l0aCBhXG4gIC8vIHNtYWxsIHNlZWRlZCBtZWFuZGVyIHNvIHRoZSBjaGFubmVsIGlzIG5vdCBhIHNtb290aCBzcGxpbmUuXG4gIGNvbnN0IGRlbnNlOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29udHJvbHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgY29uc3QgcDAgPSBjb250cm9sc1tNYXRoLm1heCgwLCBpIC0gMSldLCBwMSA9IGNvbnRyb2xzW2ldO1xuICAgIGNvbnN0IHAyID0gY29udHJvbHNbaSArIDFdLCBwMyA9IGNvbnRyb2xzW01hdGgubWluKGNvbnRyb2xzLmxlbmd0aCAtIDEsIGkgKyAyKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCAyNDsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gayAvIDI0LCB0MiA9IHQgKiB0LCB0MyA9IHQyICogdDtcbiAgICAgIGRlbnNlLnB1c2goe1xuICAgICAgICB4OiAwLjUgKiAoMiAqIHAxLnggKyAoLXAwLnggKyBwMi54KSAqIHQgKyAoMiAqIHAwLnggLSA1ICogcDEueCArIDQgKiBwMi54IC0gcDMueCkgKiB0MlxuICAgICAgICAgICsgKC1wMC54ICsgMyAqIHAxLnggLSAzICogcDIueCArIHAzLngpICogdDMpLFxuICAgICAgICB6OiAwLjUgKiAoMiAqIHAxLnogKyAoLXAwLnogKyBwMi56KSAqIHQgKyAoMiAqIHAwLnogLSA1ICogcDEueiArIDQgKiBwMi56IC0gcDMueikgKiB0MlxuICAgICAgICAgICsgKC1wMC56ICsgMyAqIHAxLnogLSAzICogcDIueiArIHAzLnopICogdDMpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGRlbnNlLnB1c2goY29udHJvbHNbY29udHJvbHMubGVuZ3RoIC0gMV0pO1xuICBjb25zdCByZXNhbXBsZWQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHM6IG51bWJlciB9PiA9IFt7IC4uLmRlbnNlWzBdLCBzOiAwIH1dO1xuICBsZXQgYWNjID0gMCwgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgZGVuc2UubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5oeXBvdChkZW5zZVtpXS54IC0gZGVuc2VbaSAtIDFdLngsIGRlbnNlW2ldLnogLSBkZW5zZVtpIC0gMV0ueik7XG4gICAgYWNjICs9IHN0ZXA7IHMgKz0gc3RlcDtcbiAgICBpZiAoYWNjID49IDggfHwgaSA9PT0gZGVuc2UubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbSA9IChmYm0yKHMgLyA2MCwgMy4xLCBzZWVkICsgODAxLCAyKSAtIDAuNSkgKiAxNDtcbiAgICAgIHJlc2FtcGxlZC5wdXNoKHsgeDogZGVuc2VbaV0ueCArIG0sIHo6IGRlbnNlW2ldLnosIHMgfSk7XG4gICAgICBhY2MgPSAwO1xuICAgIH1cbiAgfVxuICBjb25zdCB0b3RhbCA9IHJlc2FtcGxlZFtyZXNhbXBsZWQubGVuZ3RoIC0gMV0ucztcbiAgY29uc3QgbGV2ZWxBdCA9IChzdjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGV2ZWwgPSBzdiAqIFVQUEVSX0dSQURJRU5UO1xuICAgIGZvciAoY29uc3QgW2ZyYWMsIGRyb3BdIG9mIEZBTExTKSB7XG4gICAgICAvLyBFYWNoIGZhbGwgaXMgYSBzaG9ydCBjYXNjYWRlIG92ZXIgfjEwIG0gb2YgY2hhbm5lbC5cbiAgICAgIGxldmVsICs9IGRyb3AgKiBzbW9vdGhzdGVwKHRvdGFsICogZnJhYyAtIDUsIHRvdGFsICogZnJhYyArIDUsIHN2KTtcbiAgICB9XG4gICAgLy8gVGhlIGZpcnN0IDQwIG0gaW50byB0aGUgbGFrZSBzdGF5cyBhdCBsYWtlIGxldmVsLlxuICAgIHJldHVybiBzdiA8IDQwID8gMCA6IGxldmVsIC0gNDAgKiBVUFBFUl9HUkFESUVOVDtcbiAgfTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSByZXNhbXBsZWQubWFwKChwKSA9PiAoe1xuICAgIHg6IHAueCwgejogcC56LCBzOiBwLnMsIGxldmVsOiBNYXRoLm1heCgwLCBsZXZlbEF0KHAucykpLFxuICAgIHdpZHRoOiAzLjIgKyAyLjIgKiBmYm0yKHAucyAvIDcwLCA5LjcsIHNlZWQgKyA4MDIsIDIpICsgKDEgLSBwLnMgLyB0b3RhbCkgKiAxLjUsXG4gIH0pKTtcbiAgY29uc3Qgc291cmNlID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHtcbiAgICByZWFjaDogbmV3IFJpdmVyUmVhY2gocG9pbnRzLCAxMTApLFxuICAgIHRhcm46IHsgeDogc291cmNlLngsIHo6IHNvdXJjZS56LCByOiAxOCwgbGV2ZWw6IHNvdXJjZS5sZXZlbCB9LFxuICB9O1xufVxuIiwgIi8vIFZveGVsIG1hdGVyaWFsIGlkcy4gUHVyZSBkYXRhIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllciAoRC0wMDUpLlxuLy8gSWRzIGFyZSBwZXJzaXN0ZWQgaW4gc25hcHNob3QgZWRpdHMsIHNvIGV4aXN0aW5nIHZhbHVlcyBtdXN0IG5ldmVyIGNoYW5nZS5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG4gIC8qKiBHZW5lcmF0b3IgdjIgaGlnaGxhbmRzLiBOZXZlciBwcm9kdWNlZCBieSBnZW5lcmF0b3IgdjEuICovXG4gIFNOT1c6IDEwLFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuLyoqIEhpZ2hlc3QgbWF0ZXJpYWwgaWQgdGhhdCBtYXkgYXBwZWFyIGluIGEgdm94ZWwgZWRpdC4gKi9cbmV4cG9ydCBjb25zdCBNQVhfTUFUX0lEID0gMTA7XG4iLCAiLy8gVGVycmFpbiBnZW5lcmF0b3IgdjIgXHUyMDE0IHRoZSB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IChwdXJlIFRTLCBELTAwNSkuXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBjb250cmFjdDogaW5zaWRlIHRoZSBmb3VuZGVyIGNvcnJpZG9yICh0aGUgc2V0dGxlbWVudCB2YWxsZXksXG4vLyB0aGUgbGFrZSBhbmQgdGhlIGxvd2xhbmQgcml2ZXIpIHYyIGhlaWdodHMgZXF1YWwgdjEgZXhhY3RseSwgc28gdGhlIHBpbm5lZFxuLy8gZm91bmRlciBwcm9qZWN0cywgdGhlaXIgcHJlcGFyYXRpb24gdGFyZ2V0cyBhbmQgbmF0dXJhbCBlbnRpdGllcyB0aGVyZSBhcmVcbi8vIHVuY2hhbmdlZC4gT3V0c2lkZSBpdCB2MiBhZGRzOlxuLy8gICAtIGEgbm9ydGhlcm4gbWFzc2lmIG9uIGFuIGV4dGVuZGVkIGlzbGFuZCwgd2l0aCBzbm93IGFib3ZlIHRoZSBzbm93bGluZTtcbi8vICAgLSBmbGFua2luZyByYW5nZXMgd2VzdCBhbmQgZWFzdCBvZiB0aGUgdmFsbGV5LCB0ZXJyYWNlZCBpbnRvIGNsaWZmIGJhbmRzO1xuLy8gICAtIGEgbW91bnRhaW4gcml2ZXIgY2FydmVkIGludG8gdGhlIG1hc3NpZiBmcm9tIGEgdGFybiBkb3duIHRvIHRoZSBsYWtlLFxuLy8gICAgIHdob3NlIHdhdGVyIHN1cmZhY2UgY29tZXMgZnJvbSBIeWRyb2xvZ3kgYW5kIG5ldmVyIHJpc2VzIGRvd25zdHJlYW07XG4vLyAgIC0gYSBjb250aW51b3VzIGxvd2xhbmQgY2hhbm5lbCAodjEgaGFzIGEgZHJ5IGZvcmQgc291dGggb2YgdGhlIHNoZWxmKS5cbi8vIEhlaWdodHMgYXJlIGludGVnZXJzIGluIFstMTQsIDEwNF0uXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbGVycCwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHsgTUFULCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcblxuZXhwb3J0IGNvbnN0IFYyX1NOT1dMSU5FID0gNzQ7XG5leHBvcnQgY29uc3QgVjJfTUFYX0hFSUdIVCA9IDEwNDtcblxuZXhwb3J0IHR5cGUgVjFIZWlnaHQgPSAoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFYyQ29sdW1uIHtcbiAgLyoqIFRvcCBzb2xpZCB5ICsgMSAoc2FtZSBjb252ZW50aW9uIGFzIHN1cmZhY2VIZWlnaHRBdCkuICovXG4gIGg6IG51bWJlcjtcbiAgLyoqIFdhdGVyIHN1cmZhY2UgZm9yIHRoaXMgY29sdW1uOiBjZWxscyBbaCwgbGV2ZWwpIGhvbGQgd2F0ZXIuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBjb2x1bW4gaXMgcGFydCBvZiB0aGUgY2FydmVkIG1vdW50YWluLXJpdmVyIGNoYW5uZWwuICovXG4gIGNoYW5uZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJyYWluVjIge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBzZWVkOiBudW1iZXIsXG4gICAgcHJpdmF0ZSByZWFkb25seSB2MTogVjFIZWlnaHQsXG4gICAgcmVhZG9ubHkgaHlkcm9sb2d5OiBIeWRyb2xvZ3ksXG4gICkge31cblxuICAvKiogMCA9IGV4YWN0bHkgdjEgKGZvdW5kZXIgY29ycmlkb3IpOyAxID0gZnVsbCB2MiByZWxpZWYuICovXG4gIHJlbGllZk1hc2soeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtMzkwLCAtNDcwLCB6KTtcbiAgICAvLyBUaGUgd2VzdCByYW5nZSBrZWVwcyBjbGVhciBvZiB0aGUgbGFrZSBiYXNpbiB1bnRpbCB0aGUgbGFrZSBpcyBwYXNzZWQuXG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlLCB3ZXN0RWRnZSAtIDkwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyMzAsIDMzMCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIC8qKiAwIGF0IHRoZSByYW5nZSBmcm9udCwgMSBkZWVwIGluc2lkZTogZm9vdGhpbGxzIGZpcnN0LCBwZWFrcyBiZWhpbmQuICovXG4gIHJhbmdlRGVwdGgoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtNDIwLCAtNzAwLCB6KTtcbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UgLSA0MCwgd2VzdEVkZ2UgLSAzMDAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDI3MCwgNTYwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVjJDb2x1bW4ge1xuICAgIGNvbnN0IHNlZWQgPSB0aGlzLnNlZWQ7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMudjEoc2VlZCwgeCwgeik7XG4gICAgY29uc3QgbWFzayA9IHRoaXMucmVsaWVmTWFzayh4LCB6KTtcbiAgICBsZXQgaCA9IGJhc2U7XG5cbiAgICBpZiAobWFzayA+IDApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgaXNsYW5kIG5vcnRoIHNvIHRoZSBtYXNzaWYgaGFzIHJvb20gKHYxIGNvYXN0IGlzIH56IC02MDApLlxuICAgICAgY29uc3Qgbm9ydGhMYW5kID0gc21vb3Roc3RlcCgtNDIwLCAtNTIwLCB6KTtcbiAgICAgIGNvbnN0IHNob3JlID0gMSAtIE1hdGguaHlwb3QoKHggKyAxNTApIC8gNTYwLCAoeiArIDY5MCkgLyAzMDApXG4gICAgICAgICsgKGZibTIoeCAvIDE2MCwgeiAvIDE2MCwgc2VlZCArIDcwMSwgMykgLSAwLjUpICogMC4zO1xuICAgICAgY29uc3QgbGFuZE4gPSBzbW9vdGhzdGVwKDAuMCwgMC4xNCwgc2hvcmUpICogbm9ydGhMYW5kO1xuICAgICAgY29uc3QgZ3JvdW5kID0gbGVycChiYXNlLCBNYXRoLm1heChiYXNlLCA1ICsgNSAqIGZibTIoeCAvIDkwLCB6IC8gOTAsIHNlZWQgKyA3MDIsIDIpKSwgbGFuZE4pO1xuXG4gICAgICAvLyBSaWRnZWQgbWFzc2lmIHdpdGggdGVycmFjZWQgY2xpZmYgYmFuZHMuXG4gICAgICBjb25zdCB3eCA9IHggKyAoZmJtMih4IC8gMjYwLCB6IC8gMjYwLCBzZWVkICsgNzAzLCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCB3eiA9IHogKyAoZmJtMih4IC8gMjYwICsgNS4xLCB6IC8gMjYwIC0gMi43LCBzZWVkICsgNzA0LCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCByMSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIxMCwgd3ogLyAyMTAsIHNlZWQgKyA3MDUsIDQpIC0gMSk7XG4gICAgICBjb25zdCByMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDgwLCB3eiAvIDgwLCBzZWVkICsgNzA2LCAzKSAtIDEpO1xuICAgICAgY29uc3QgbHVtcCA9IGZibTIod3ggLyAxMjAsIHd6IC8gMTIwLCBzZWVkICsgNzA3LCAzKTtcbiAgICAgIGNvbnN0IGRlcHRoID0gdGhpcy5yYW5nZURlcHRoKHgsIHopO1xuICAgICAgbGV0IG1vdW50YWluID0gMTYgKyAoOCArIDgwICogZGVwdGgpICogKDAuNTUgKiByMSAqIHIxICsgMC4yOCAqIHIyICsgMC4xNyAqIGx1bXApXG4gICAgICAgICsgMTggKiBkZXB0aCAqIHNtb290aHN0ZXAoMC41NSwgMC45LCByMSk7XG4gICAgICBjb25zdCBiYW5kID0gNiArIDIgKiBmYm0yKHggLyAxNDAsIHogLyAxNDAsIHNlZWQgKyA3MDgsIDIpO1xuICAgICAgY29uc3QgdCA9IE1hdGguZmxvb3IobW91bnRhaW4gLyBiYW5kKTtcbiAgICAgIGNvbnN0IGZyYWMgPSBtb3VudGFpbiAvIGJhbmQgLSB0O1xuICAgICAgbW91bnRhaW4gPSAodCArIHNtb290aHN0ZXAoMC41LCAwLjgsIGZyYWMpKSAqIGJhbmQ7XG5cbiAgICAgIC8vIE9ubHkgbGFuZCByaXNlczsgdGhlIHNlYSBzdGF5cyBzZWEsIHNvIHJhbmdlcyBlbmQgaW4gY29hc3RhbCBjbGlmZnMuXG4gICAgICBjb25zdCBsYW5kRmFjdG9yID0gc21vb3Roc3RlcCgtMiwgOCwgZ3JvdW5kKTtcbiAgICAgIGggPSBsZXJwKGdyb3VuZCwgTWF0aC5tYXgoZ3JvdW5kLCBtb3VudGFpbiksIG1hc2sgKiBsYW5kRmFjdG9yKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSBoIDwgMCA/IDAgOiAtSW5maW5pdHk7XG4gICAgbGV0IGNoYW5uZWwgPSBmYWxzZTtcblxuICAgIC8vIE1vdW50YWluIHJpdmVyOiB2YWxsZXkgZmxvb3IsIGJhbmtzIGFuZCBjaGFubmVsIGZvbGxvdyB0aGUgd2F0ZXIgbGV2ZWwuXG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIGNvbnN0IHJhaXNlZCA9IGhpdC5sZXZlbCA+IDAuMjU7XG4gICAgICAgIGNvbnN0IHZ3ID0gNTUgKyAyOCAqIGZibTIoaGl0LnMgLyA5MCwgMS43LCBzZWVkICsgNzA5LCAyKTtcbiAgICAgICAgY29uc3QgZmxvb3IgPSBoaXQubGV2ZWwgKyAxLjUgKyAyLjIgKiBmYm0yKHggLyA0MCwgeiAvIDQwLCBzZWVkICsgNzEwLCAyKSArIGhpdC5kICogMC4wNjtcbiAgICAgICAgY29uc3QgdCA9IHNtb290aHN0ZXAodncgKiAwLjMsIHZ3LCBoaXQuZCk7XG4gICAgICAgIGggPSBNYXRoLm1pbihoLCBsZXJwKGZsb29yLCBoLCB0KSk7XG4gICAgICAgIGNvbnN0IHcgPSBoaXQud2lkdGg7XG4gICAgICAgIGlmIChyYWlzZWQgJiYgaGl0LmQgPCB3ICsgMykge1xuICAgICAgICAgIC8vIEJhbmtzIGhvbGQgYSByYWlzZWQgcml2ZXI6IG5ldmVyIGJlbG93IGl0cyB3YXRlciBzdXJmYWNlLiBBdCBsYWtlXG4gICAgICAgICAgLy8gbGV2ZWwgdGhlIHNlYS1sZXZlbCBmaWxsIGFscmVhZHkgY29udGFpbnMgdGhlIHdhdGVyLlxuICAgICAgICAgIGggPSBNYXRoLm1heChoLCBNYXRoLmNlaWwoaGl0LmxldmVsKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoaXQuZCA8IHcpIHtcbiAgICAgICAgICBjb25zdCBiZWQgPSBoaXQubGV2ZWwgLSAoMS4yICsgMS4zICogKDEgLSBoaXQuZCAvIHcpKTtcbiAgICAgICAgICBoID0gTWF0aC5taW4oaCwgYmVkKTtcbiAgICAgICAgICBpZiAocmFpc2VkKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKGhpdC5sZXZlbCkpO1xuICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCB0YXJuID0gdGhpcy5oeWRyb2xvZ3kudGFybjtcbiAgICAgIGlmICh0YXJuKSB7XG4gICAgICAgIGNvbnN0IHRkID0gTWF0aC5oeXBvdCh4IC0gdGFybi54LCB6IC0gdGFybi56KVxuICAgICAgICAgICogKDEgKyAwLjIgKiAoZmJtMih4IC8gMzAsIHogLyAzMCwgc2VlZCArIDcxMSwgMikgLSAwLjUpKTtcbiAgICAgICAgaWYgKHRkIDwgdGFybi5yICsgNikge1xuICAgICAgICAgIGNvbnN0IHJpbSA9IE1hdGguY2VpbCh0YXJuLmxldmVsKSArIDE7XG4gICAgICAgICAgaWYgKHRkID49IHRhcm4ucikgaCA9IE1hdGgubWF4KGgsIHJpbSk7XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoID0gTWF0aC5taW4oTWF0aC5tYXgoaCwgcmltKSwgdGFybi5sZXZlbCAtIDEgLSAzICogc21vb3Roc3RlcCh0YXJuLnIsIDAsIHRkKSk7XG4gICAgICAgICAgICBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKHRhcm4ubGV2ZWwpKTtcbiAgICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvd2xhbmQgY2hhbm5lbCBjb250aW51aXR5OiB2MSBsZWF2ZXMgYSBkcnkgZm9yZCB3aGVyZSB0aGUgc2hlbGYgbWVldHMgdGhlIHJpdmVyLlxuICAgIGNvbnN0IGxvdyA9IHRoaXMuaHlkcm9sb2d5Lmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8IDIuNSAmJiBoID49IDAgJiYgYmFzZSA8IDQpIGggPSAtMTtcblxuICAgIGggPSBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgVjJfTUFYX0hFSUdIVCkpO1xuICAgIGlmIChoIDwgMCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgMCk7XG4gICAgcmV0dXJuIHsgaCwgbGV2ZWw6IGxldmVsID09PSAtSW5maW5pdHkgPyBoIDogbGV2ZWwsIGNoYW5uZWwgfTtcbiAgfVxuXG4gIGhlaWdodCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1uKHgsIHopLmg7XG4gIH1cblxuICAvKiogdjIgdG9wIG1hdGVyaWFsLiBGYWxscyBiYWNrIHRvIHRoZSB2MSBydWxlcyBmb3IgdGhlIHVuY2hhbmdlZCBjb3JyaWRvci4gKi9cbiAgdG9wTWF0ZXJpYWwoXG4gICAgeDogbnVtYmVyLCB6OiBudW1iZXIsIGNvbDogVjJDb2x1bW4sIHNsb3BlOiBudW1iZXIsXG4gICAgdjFUb3A6IChoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIpID0+IE1hdElkLFxuICApOiBNYXRJZCB7XG4gICAgY29uc3QgaCA9IGNvbC5oO1xuICAgIGlmIChjb2wuY2hhbm5lbCAmJiBjb2wubGV2ZWwgPiBoKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlciAmJiBoID4gMSkge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPCBoaXQud2lkdGggKyAyLjUgJiYgaGl0LmxldmVsID4gMC4yNSkge1xuICAgICAgICByZXR1cm4gZmJtMih4IC8gNiwgeiAvIDYsIHRoaXMuc2VlZCArIDcxMiwgMSkgPiAwLjUgPyBNQVQuR1JBVkVMIDogTUFULlNBTkQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNub3dsaW5lID0gVjJfU05PV0xJTkUgKyAoZmJtMih4IC8gNzAsIHogLyA3MCwgdGhpcy5zZWVkICsgNzEzLCAzKSAtIDAuNSkgKiAxNjtcbiAgICBpZiAoaCA+PSBzbm93bGluZSAmJiBzbG9wZSA8PSAzKSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgLSA2ICYmIHNsb3BlIDw9IDEgJiYgZmJtMih4IC8gMjAsIHogLyAyMCwgdGhpcy5zZWVkICsgNzE0LCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAodGhpcy5yZWxpZWZNYXNrKHgsIHopID4gMC41ICYmIGggPiAzMCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICAgIHJldHVybiB2MVRvcChoLCBzbG9wZSk7XG4gIH1cbn1cbiIsICIvLyBWZWdldGF0aW9uIHNwZWNpZXMgYW5kIGdyb3d0aCBzdGFnZXM6IHB1cmUgZnVuY3Rpb25zIG9mIGV4aXN0aW5nIGVudGl0eSBkYXRhLlxuLy9cbi8vIE5vdGhpbmcgaGVyZSBpcyBzdG9yZWQsIGpvdXJuYWxlZCBvciBkcmF3biBmcm9tIHRoZSBjaHVuayBSTkcgc3RyZWFtLiBTcGVjaWVzXG4vLyBhbmQgc3RhZ2UgYXJlIGRlcml2ZWQgZnJvbSBmaWVsZHMgZXZlcnkgZW50aXR5IGFscmVhZHkgaGFzIChraW5kLCB2YXJpYW50LFxuLy8gc2NhbGUsIGlkLCBwb3NpdGlvbikgcGx1cyB0aGUgd29ybGQgc2VlZCwgdXNpbmcgcG9zaXRpb24vaWQgaGFzaGVzIG9ubHkuXG4vLyBFbnRpdHkgZ2VuZXJhdGlvbiwgZW50aXR5IElEcywgeWllbGRzIGFuZCBvYnN0cnVjdGlvbiByYWRpaSBhcmUgdGhlcmVmb3JlXG4vLyB1bmNoYW5nZWQsIGFuZCBzbyBhcmUgc2F2ZXMgYW5kIHN0YXRlIGhhc2hlcy5cbi8vXG4vLyBHcm93dGggc3RhZ2UgY2hvb3NlcyB0aGUgYmxvY2stYnVpbHQgbW9kZWwgYW5kIHRoZSBpbnNwZWN0b3IgbGFiZWwuIFVuZGVyXG4vLyBzZXR0bGVtZW50IHJ1bGVzIHYyIChNMDEwKSBpdCBhbHNvIHNldHMgdGhlIHRpbWJlciB5aWVsZCBhbmQgdGhlIHBoeXNpY2FsXG4vLyBmb290cHJpbnQgKHNlZSB0aGUgc3RhZ2UgdGFibGVzIGJlbG93KTsgbGVnYWN5IHdvcmxkcyBrZWVwIHRoZSBlbnRpdHlcbi8vIHJlY29yZCdzIHlpZWxkIGV4YWN0bHkuXG5pbXBvcnQgdHlwZSB7IEVudGl0eSwgRW50aXR5S2luZCB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgaGFzaDJpIH0gZnJvbSAnLi9ub2lzZSc7XG5cbmV4cG9ydCB0eXBlIFRyZWVTcGVjaWVzID0gJ3BpbmUnIHwgJ3NwcnVjZScgfCAnb2FrJyB8ICdiaXJjaCcgfCAnYmVlY2gnIHwgJ2NoZXJyeSc7XG5leHBvcnQgdHlwZSBCdXNoU3BlY2llcyA9ICdsZWFmeV9idXNoJyB8ICdiZXJyeV9idXNoJyB8ICdmZXJuX2NsdW1wJztcbmV4cG9ydCB0eXBlIFZlZ2V0YXRpb25TcGVjaWVzID0gVHJlZVNwZWNpZXMgfCBCdXNoU3BlY2llcztcbmV4cG9ydCB0eXBlIEdyb3d0aFN0YWdlID0gJ3NhcGxpbmcnIHwgJ3lvdW5nJyB8ICdtYXR1cmUnIHwgJ29sZCc7XG5cbmV4cG9ydCBjb25zdCBUUkVFX1NQRUNJRVM6IHJlYWRvbmx5IFRyZWVTcGVjaWVzW10gPSBbJ3BpbmUnLCAnc3BydWNlJywgJ29haycsICdiaXJjaCcsICdiZWVjaCcsICdjaGVycnknXTtcbmV4cG9ydCBjb25zdCBCVVNIX1NQRUNJRVM6IHJlYWRvbmx5IEJ1c2hTcGVjaWVzW10gPSBbJ2xlYWZ5X2J1c2gnLCAnYmVycnlfYnVzaCcsICdmZXJuX2NsdW1wJ107XG5leHBvcnQgY29uc3QgR1JPV1RIX1NUQUdFUzogcmVhZG9ubHkgR3Jvd3RoU3RhZ2VbXSA9IFsnc2FwbGluZycsICd5b3VuZycsICdtYXR1cmUnLCAnb2xkJ107XG5cbmV4cG9ydCBjb25zdCBTUEVDSUVTX0lORk86IFJlY29yZDxWZWdldGF0aW9uU3BlY2llcywgeyBsYWJlbDogc3RyaW5nOyBibHVyYjogc3RyaW5nIH0+ID0ge1xuICBwaW5lOiB7IGxhYmVsOiAncGluZScsIGJsdXJiOiAnQSB0YWxsIGNvbmlmZXIgd2l0aCBhIGJhcmUgdHJ1bmsgYW5kIGZsYXQsIGxheWVyZWQgY3Jvd25zIG5lYXIgdGhlIHRvcC4nIH0sXG4gIHNwcnVjZTogeyBsYWJlbDogJ3NwcnVjZScsIGJsdXJiOiAnQSBkYXJrLCBzdGVwcGVkIGNvbmlmZXIgb2YgdGhlIGNvb2xlciBhbmQgaGlnaGVyIGdyb3VuZC4nIH0sXG4gIG9hazogeyBsYWJlbDogJ29haycsIGJsdXJiOiAnQSBicm9hZCwgc3ByZWFkaW5nIGJyb2FkbGVhZiB3aXRoIGEgdGhpY2sgdHJ1bmsgYW5kIGhlYXZ5IGJyYW5jaGVzLicgfSxcbiAgYmlyY2g6IHsgbGFiZWw6ICdiaXJjaCcsIGJsdXJiOiAnQSBzbGVuZGVyIGJyb2FkbGVhZiB3aXRoIHBhbGUgYmFyayBhbmQgYSBsaWdodCwgbmFycm93IGNyb3duLicgfSxcbiAgYmVlY2g6IHsgbGFiZWw6ICdiZWVjaCcsIGJsdXJiOiAnQSByb3VuZGVkIGJyb2FkbGVhZiB3aXRoIHNtb290aCBncmV5IGJhcmsgYW5kIGEgZGVuc2UgY3Jvd24uJyB9LFxuICBjaGVycnk6IHsgbGFiZWw6ICdjaGVycnknLCBibHVyYjogJ0EgcGluay1mbG93ZXJpbmcgY2hlcnJ5IHdpdGggYSB3aWRlLCBsYXllcmVkIGJsb3Nzb20gY3Jvd24uJyB9LFxuICBsZWFmeV9idXNoOiB7IGxhYmVsOiAnbGVhZnkgYnVzaCcsIGJsdXJiOiAnQSBsb3csIHJvdW5kZWQgbGVhZnkgcGxhbnQuJyB9LFxuICBiZXJyeV9idXNoOiB7IGxhYmVsOiAnYmVycnkgYnVzaCcsIGJsdXJiOiAnQSBkYXJrLWxlYXZlZCBidXNoIGRvdHRlZCB3aXRoIHJlZCBiZXJyaWVzLicgfSxcbiAgZmVybl9jbHVtcDogeyBsYWJlbDogJ2Zlcm4gY2x1bXAnLCBibHVyYjogJ0EgbG93IHNwcmF5IG9mIGZlcm4gZnJvbmRzLicgfSxcbn07XG5cbi8qKiBGTlYtMWEgc3RyaW5nIGhhc2ggbWl4ZWQgd2l0aCBhIHNlZWQsIG1hcHBlZCB0byBbMCwgMSkuICovXG5leHBvcnQgZnVuY3Rpb24gaWRIYXNoKGlkOiBzdHJpbmcsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gMHg4MTFjOWRjNSBeIChzZWVkIHwgMCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaWQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IGlkLmNoYXJDb2RlQXQoaSk7XG4gICAgaCA9IE1hdGguaW11bChoLCAweDAxMDAwMTkzKTtcbiAgfVxuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTUpLCAweDJjMWIzYzZkKTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEyKSwgMHgyOTdhMmQzOSk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTUpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG50eXBlIFNwZWNpZXNJbnB1dCA9IFBpY2s8RW50aXR5LCAnaWQnIHwgJ2tpbmQnIHwgJ3gnIHwgJ3knIHwgJ3onIHwgJ3ZhcmlhbnQnPjtcbnR5cGUgU3RhZ2VJbnB1dCA9IFBpY2s8RW50aXR5LCAnaWQnIHwgJ2tpbmQnIHwgJ3NjYWxlJz47XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1ZlZ2V0YXRpb25LaW5kKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuIHtcbiAgcmV0dXJuIGtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlXycpIHx8IGtpbmQgPT09ICdzdHlsX3NocnViJztcbn1cblxuLyoqXG4gKiBTcGVjaWVzIG9mIGEgdHJlZSBvciBidXNoIGVudGl0eSwgb3IgbnVsbCBmb3Igb3RoZXIga2luZHMuIENvbmlmZXJzIHNwbGl0XG4gKiBpbnRvIHNwcnVjZSBzdGFuZHMgb24gaGlnaCBvciBub3J0aGVybiBncm91bmQgYW5kIHBpbmUgZWxzZXdoZXJlOyBjbHVzdGVyXG4gKiB0cmVlcyBzcGxpdCBpbnRvIGJpcmNoIGFuZCBiZWVjaCB3b29kcy4gU3RhbmRzIGZvbGxvdyA0OCBtIHBvc2l0aW9uIGNlbGxzIHNvXG4gKiBuZWlnaGJvdXJzIHRlbmQgdG8gbWF0Y2gsIGxpa2UgcmVhbCB3b29kcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyZWVTcGVjaWVzKGVudGl0eTogU3BlY2llc0lucHV0LCBzZWVkOiBudW1iZXIpOiBWZWdldGF0aW9uU3BlY2llcyB8IG51bGwge1xuICBjb25zdCBjZWxsWCA9IE1hdGguZmxvb3IoZW50aXR5LnggLyA0OCksIGNlbGxaID0gTWF0aC5mbG9vcihlbnRpdHkueiAvIDQ4KTtcbiAgc3dpdGNoIChlbnRpdHkua2luZCkge1xuICAgIGNhc2UgJ3N0eWxfdHJlZV9zcGlyZSc6IHtcbiAgICAgIGNvbnN0IGNvbGQgPSBoYXNoMmkoY2VsbFgsIGNlbGxaLCBzZWVkICsgOTEwKSArIChlbnRpdHkueSAtIDIwKSAqIDAuMDMgKyAoZW50aXR5LnogPCAtMTUwID8gMC4yNSA6IDApO1xuICAgICAgcmV0dXJuIGNvbGQgPiAwLjU1ID8gJ3NwcnVjZScgOiAncGluZSc7XG4gICAgfVxuICAgIGNhc2UgJ3N0eWxfdHJlZV90YWJsZSc6IHJldHVybiAnb2FrJztcbiAgICBjYXNlICdzdHlsX3RyZWVfY2x1c3Rlcic6IHJldHVybiBoYXNoMmkoY2VsbFgsIGNlbGxaLCBzZWVkICsgOTExKSA8IDAuNSA/ICdiaXJjaCcgOiAnYmVlY2gnO1xuICAgIGNhc2UgJ3N0eWxfdHJlZV9ibG9zc29tJzogcmV0dXJuICdjaGVycnknO1xuICAgIGNhc2UgJ3N0eWxfc2hydWInOiByZXR1cm4gQlVTSF9TUEVDSUVTWygoZW50aXR5LnZhcmlhbnQgJSAzKSArIDMpICUgM107XG4gICAgZGVmYXVsdDogcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBHcm93dGggc3RhZ2Ugb2YgYSB0cmVlIG9yIGJ1c2gsIG9yIG51bGwgZm9yIG90aGVyIGtpbmRzLiBEZXJpdmVkIGZyb20gdGhlXG4gKiBlbnRpdHkncyBzY2FsZSBiYW5kIGFuZCBhbiBpZCBoYXNoLCBzbyBtYXR1cmUgaXMgdGhlIG1vc3QgY29tbW9uIHN0YWdlLlxuICogQXV0aG9yZWQgaGVybyBlbnRpdGllcyAoaWQgcHJlZml4IFwiaGVybzpcIikgYXJlIGFsd2F5cyBtYXR1cmUgb3Igb2xkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ3Jvd3RoU3RhZ2UoZW50aXR5OiBTdGFnZUlucHV0KTogR3Jvd3RoU3RhZ2UgfCBudWxsIHtcbiAgaWYgKCFpc1ZlZ2V0YXRpb25LaW5kKGVudGl0eS5raW5kKSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGggPSBpZEhhc2goZW50aXR5LmlkLCAweDVlZWQpO1xuICBpZiAoZW50aXR5LmlkLnN0YXJ0c1dpdGgoJ2hlcm86JykpIHJldHVybiBoIDwgMC40ID8gJ29sZCcgOiAnbWF0dXJlJztcbiAgLy8gTmF0dXJhbCB0cmVlcyB1c2Ugc2NhbGUgMC44OC4uMS4xMiwgc2hydWJzIDAuOC4uMS4yOiBub3JtYWxpc2UgdG8gMC4uMS5cbiAgY29uc3QgW2xvLCBzcGFuXSA9IGVudGl0eS5raW5kID09PSAnc3R5bF9zaHJ1YicgPyBbMC44LCAwLjRdIDogWzAuODgsIDAuMjRdO1xuICBjb25zdCBzID0gTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgKGVudGl0eS5zY2FsZSAtIGxvKSAvIHNwYW4pKTtcbiAgY29uc3QgdSA9IDAuNyAqIGggKyAwLjMgKiBzO1xuICByZXR1cm4gdSA8IDAuMTcgPyAnc2FwbGluZycgOiB1IDwgMC4zNiA/ICd5b3VuZycgOiB1IDwgMC43OCA/ICdtYXR1cmUnIDogJ29sZCc7XG59XG5cbi8vIC0tLS0gTTAxMDogZ3Jvd3RoIHN0YWdlIGFzIGEgc2ltdWxhdGlvbiBydWxlIC0tLS1cbi8vXG4vLyBUaGUgc3RhZ2UgYWJvdmUgaXMgdGhlIHNpbmdsZSBzb3VyY2UgZm9yIGJvdGggdGhlIG1vZGVsIHRoZSByZW5kZXJlciBkcmF3c1xuLy8gYW5kIHRoZSBydWxlcyBiZWxvdywgc28gdGhlIHNhcGxpbmcgeW91IHNlZSBpcyB0aGUgc2FwbGluZyB0aGUgc2ltIHVzZXMuXG4vLyBXb3JsZHMga2VlcCB0aGVpciBsZWdhY3kgcnVsZXMgKDEyIHdvb2QgZnJvbSBhbnkgdHJlZSwgb25lIHRydW5rIHJhZGl1cylcbi8vIHVudGlsIHRoZXkgcnVuIHNldHRsZW1lbnQgcnVsZXMgdjIgKGEgaG9tZXN0ZWFkIGZvdW5kZWQgb3IgdXBncmFkZWQgdW5kZXJcbi8vIE0wMTApOyBzZWUgYHN0YWdlUnVsZXNBY3RpdmVgIGluIHdvcmxkLnRzLiBHZW5lcmF0aW9uIG5ldmVyIGNoYW5nZXMsIHNvXG4vLyBnZW5lc2lzIGhhc2hlcyBhbmQgb2xkIHNhdmVzIGFyZSB1bnRvdWNoZWQuXG5cbi8qKiBOYXZpZ2F0aW9uIGZvb3RwcmludCAobWV0cmVzIGZyb20gdGhlIHRydW5rKTogYSBjZWxsIGlzIGJsb2NrZWQgd2hlbiBpdHMgY2VudHJlIGlzIHRoaXMgY2xvc2UuICovXG5leHBvcnQgY29uc3QgU1RBR0VfRk9PVFBSSU5UOiBSZWNvcmQ8R3Jvd3RoU3RhZ2UsIG51bWJlcj4gPSB7IHNhcGxpbmc6IDAuMywgeW91bmc6IDAuNiwgbWF0dXJlOiAxLjAsIG9sZDogMS41IH07XG4vKiogVHJ1bmsgY29sbGlzaW9uIHJhZGl1cyBmb3IgdGhlIHdhbGtpbmcgY2hhcmFjdGVyIChtZXRyZXMsIGJlZm9yZSBlbnRpdHkgc2NhbGUpLiAqL1xuZXhwb3J0IGNvbnN0IFNUQUdFX1RSVU5LOiBSZWNvcmQ8R3Jvd3RoU3RhZ2UsIG51bWJlcj4gPSB7IHNhcGxpbmc6IDAuMTUsIHlvdW5nOiAwLjMsIG1hdHVyZTogMC40NSwgb2xkOiAwLjQ1IH07XG4vKiogVG90YWwgdGltYmVyIGEgdHJlZSBvZiB0aGlzIHN0YWdlIHlpZWxkcywgYW5kIHRoZSBhbW91bnQgb25lIGN1dCB0YWtlcy4gKi9cbmV4cG9ydCBjb25zdCBTVEFHRV9XT09EOiBSZWNvcmQ8R3Jvd3RoU3RhZ2UsIHsgdG90YWw6IG51bWJlcjsgY3V0OiBudW1iZXIgfT4gPSB7XG4gIHNhcGxpbmc6IHsgdG90YWw6IDIsIGN1dDogMiB9LCB5b3VuZzogeyB0b3RhbDogNiwgY3V0OiAzIH0sIG1hdHVyZTogeyB0b3RhbDogMTIsIGN1dDogNCB9LCBvbGQ6IHsgdG90YWw6IDE2LCBjdXQ6IDQgfSxcbn07XG5cbi8qKiBUaW1iZXIgb2YgYSB0cmVlIHVuZGVyIHN0YWdlIHJ1bGVzLCBvciBudWxsIHdoZW4gdGhlIGVudGl0eSBpcyBub3QgYSB0cmVlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyZWVUaW1iZXIoZW50aXR5OiBTdGFnZUlucHV0KTogeyB0b3RhbDogbnVtYmVyOyBjdXQ6IG51bWJlciB9IHwgbnVsbCB7XG4gIGlmICghZW50aXR5LmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlXycpKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgc3RhZ2UgPSBncm93dGhTdGFnZShlbnRpdHkpO1xuICByZXR1cm4gc3RhZ2UgPyBTVEFHRV9XT09EW3N0YWdlXSA6IG51bGw7XG59XG5cbi8qKiBQcmVzZW50YXRpb24gdmFyaWFudCAoMC4uMikgc28gdHJlZXMgb2Ygb25lIHNwZWNpZXMgYW5kIHN0YWdlIGRpZmZlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2ZWdldGF0aW9uVmFyaWFudChlbnRpdHk6IFBpY2s8RW50aXR5LCAnaWQnIHwgJ3ZhcmlhbnQnPik6IG51bWJlciB7XG4gIHJldHVybiAoTWF0aC5hYnMoZW50aXR5LnZhcmlhbnQpICsgTWF0aC5mbG9vcihpZEhhc2goZW50aXR5LmlkLCAweDdhMTEpICogMykpICUgMztcbn1cblxuLyoqIEluc3BlY3RvciBsYWJlbCBzdWNoIGFzIFwiWW91bmcgYmlyY2hcIi4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2ZWdldGF0aW9uTGFiZWwoZW50aXR5OiBTcGVjaWVzSW5wdXQgJiBTdGFnZUlucHV0LCBzZWVkOiBudW1iZXIpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3Qgc3BlY2llcyA9IHRyZWVTcGVjaWVzKGVudGl0eSwgc2VlZCk7XG4gIGNvbnN0IHN0YWdlID0gZ3Jvd3RoU3RhZ2UoZW50aXR5KTtcbiAgaWYgKCFzcGVjaWVzIHx8ICFzdGFnZSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiBgJHtzdGFnZVswXS50b1VwcGVyQ2FzZSgpfSR7c3RhZ2Uuc2xpY2UoMSl9ICR7U1BFQ0lFU19JTkZPW3NwZWNpZXNdLmxhYmVsfWA7XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHR5cGUgeyBIb21lc3RlYWRTdGF0ZSB9IGZyb20gJy4vaG9tZXN0ZWFkJztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5pbXBvcnQgeyBUZXJyYWluVjIsIFYyQ29sdW1uIH0gZnJvbSAnLi90ZXJyYWluLXYyJztcbmltcG9ydCB7IHRyZWVUaW1iZXIgfSBmcm9tICcuL3ZlZ2V0YXRpb24nO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG4vKiogR2VuZXJhdG9yIHYxOiB0aGUgb3JpZ2luYWwgMjA0OCBtIGlzbGFuZC4gRGVmYXVsdCBmb3IgY3JlYXRlV29ybGQgYW5kIGFsbCBsZWdhY3kgc2F2ZXMuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuLyoqIEdlbmVyYXRvciB2MjogdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSB3aXRoIGEgbW91bnRhaW4gcml2ZXIgKHNlZSB0ZXJyYWluLXYyLnRzKS4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVjIgPSAyO1xuLyoqIFRoZSBnZW5lcmF0b3IgbmV3IGJyb3dzZXIgd29ybGRzIHVzZSBieSBkZWZhdWx0LiAqL1xuZXhwb3J0IGNvbnN0IExBVEVTVF9HRU5FUkFUT1JfVkVSU0lPTiA9IEdFTkVSQVRPUl9WMjtcbmV4cG9ydCBjb25zdCBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TOiByZWFkb25seSBudW1iZXJbXSA9IFtHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyXTtcbmV4cG9ydCBjb25zdCBpc1N1cHBvcnRlZEdlbmVyYXRvciA9ICh2OiB1bmtub3duKTogdiBpcyBudW1iZXIgPT5cbiAgdHlwZW9mIHYgPT09ICdudW1iZXInICYmIFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlMuaW5jbHVkZXModik7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgeyBNQVQsIGlzU29saWQsIGlzT3BhcXVlLCBNQVhfTUFUX0lEIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuZXhwb3J0IHR5cGUgeyBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IE1BVCwgaXNTb2xpZCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5cbmV4cG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgZmJtMixcbn0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQge1xuICBjbGFtcCwgbGVycCwgc21vb3Roc3RlcCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIHZhbHVlTm9pc2UzLCBmYm0yLCBmYm0zLFxufSBmcm9tICcuL25vaXNlJztcblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgLyoqIE0wMDYgbGl2aW5nIGhvbWVzdGVhZDsgcHJlc2VudCBvbmNlIGZvdW5kZWQgKHNjaGVtYSAzIG9ubHkpLiAqL1xuICBob21lc3RlYWQ/OiBIb21lc3RlYWRTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGlmICghaXNTdXBwb3J0ZWRHZW5lcmF0b3IoZ2VuZXJhdG9yVmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24gJHtnZW5lcmF0b3JWZXJzaW9ufWApO1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TLCBnZW5lcmF0b3JWZXJzaW9uIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDAsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbi8vIC0tLS0tLS0tLS0gdmVyc2lvbmVkIGdlbmVyYXRvciBkaXNwYXRjaCAtLS0tLS0tLS0tXG5jb25zdCB2MkNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRlcnJhaW5WMj4oKTtcbmNvbnN0IGh5ZHJvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSHlkcm9sb2d5PigpO1xuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kgbmV0d29yayBmb3IgYSBzZWVkIGFuZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyb2xvZ3lGb3Ioc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBIeWRyb2xvZ3kge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuaHlkcm9sb2d5O1xuICBjb25zdCBrZXkgPSBgJHtzZWVkfToke3ZlcnNpb259YDtcbiAgbGV0IGh5ZHJvID0gaHlkcm9DYWNoZS5nZXQoa2V5KTtcbiAgaWYgKCFoeWRybykge1xuICAgIGh5ZHJvID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb24sIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGh5ZHJvQ2FjaGUuc2V0KGtleSwgaHlkcm8pO1xuICB9XG4gIHJldHVybiBoeWRybztcbn1cblxuLyoqIEBpbnRlcm5hbCBUaGUgdjIgZ2VuZXJhdG9yIGZvciBhIHNlZWQgKGNhY2hlZDsgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCkuICovXG5leHBvcnQgZnVuY3Rpb24gdGVycmFpblYyKHNlZWQ6IG51bWJlcik6IFRlcnJhaW5WMiB7XG4gIGxldCBnZW4gPSB2MkNhY2hlLmdldChzZWVkKTtcbiAgaWYgKCFnZW4pIHtcbiAgICBjb25zdCBoeWRyb2xvZ3kgPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbjogR0VORVJBVE9SX1YyLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBnZW4gPSBuZXcgVGVycmFpblYyKHNlZWQsIHN1cmZhY2VIZWlnaHRBdCwgaHlkcm9sb2d5KTtcbiAgICB2MkNhY2hlLnNldChzZWVkLCBnZW4pO1xuICB9XG4gIHJldHVybiBnZW47XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCBoZWlnaHQgKHRvcCBzb2xpZCArIDEpIGZvciBhbnkgc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkuaGVpZ2h0KHgsIHopIDogc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgd2F0ZXIgc3VyZmFjZTogd2F0ZXIgZmlsbHMgY2VsbHMgW2hlaWdodCwgbGV2ZWwpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VXYXRlckxldmVsQXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmNvbHVtbih4LCB6KS5sZXZlbDtcbiAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgOiBoO1xufVxuXG5mdW5jdGlvbiB2ZXJzaW9uZWRTbG9wZShzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogKyAxKSksXG4gICk7XG59XG5cbi8qKiBCYXNlIHRvcCBtYXRlcmlhbCBmb3IgYW55IGdlbmVyYXRvciB2ZXJzaW9uIChtYWNybyBMT0QsIGVudGl0eSBwbGFjZW1lbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbEZvcihcbiAgc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGdlbiA9IHRlcnJhaW5WMihzZWVkKTtcbiAgICByZXR1cm4gZ2VuLnRvcE1hdGVyaWFsKHgsIHosIGdlbi5jb2x1bW4oeCwgeiksIHNsb3BlLFxuICAgICAgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoaCwgc3MsIG5lYXJXYXRlcikpO1xuICB9XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KGN4LCBjeikpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjeCwgY3opO1xuICByZXR1cm4gaW5zdGFsbEJhc2VDaHVuayh3b3JsZCwgYmFzZSwgcGVyZm9ybWFuY2Uubm93KCkgLSB0MCk7XG59XG5cbi8qKlxuICogQmFzZSBnZW5lcmF0ZWQgY29udGVudHMgb2YgYSBjaHVuayBiZWZvcmUgZHVyYWJsZSBlZGl0cy4gQSBwdXJlIGZ1bmN0aW9uIG9mXG4gKiAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24sIGN4LCBjeik6IHNhZmUgdG8gY29tcHV0ZSBpbiBhIFdlYiBXb3JrZXIsIGFuZCB0aGVcbiAqIGJ5dGVzIGFyZSBpZGVudGljYWwgd2hlcmV2ZXIgaXQgcnVucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCYXNlQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBzZWVkOiBudW1iZXI7XG4gIHZlcnNpb246IG51bWJlcjtcbiAgZGF0YTogVWludDhBcnJheTtcbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQmFzZUNodW5rKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNodW5rIHtcbiAgY29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KENIVU5LX1ZPTFVNRSk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3QgdG9wTWF0ZXJpYWxzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCB2MiA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpIDogbnVsbDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBjb25zdCB2MkNvbHM6IFYyQ29sdW1uW10gfCBudWxsID0gdjIgPyBuZXcgQXJyYXkoQ0hVTktfQVJFQSkgOiBudWxsO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBweCAtIFAsIHd6ID0gb3ogKyBweiAtIFA7XG4gICAgICBpZiAodjIpIHtcbiAgICAgICAgY29uc3QgY29sID0gdjIuY29sdW1uKHd4LCB3eik7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBjb2wuaDtcbiAgICAgICAgY29uc3QgbHggPSBweCAtIFAsIGx6ID0gcHogLSBQO1xuICAgICAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHYyQ29scyFbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY29sO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB3eCwgd3opO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB2MkNvbCA9IHYyQ29scyA/IHYyQ29sc1tseiAqIENIVU5LX1NJWkUgKyBseF0gOiBudWxsO1xuICAgICAgY29uc3QgdG9wID0gdjIgJiYgdjJDb2xcbiAgICAgICAgPyB2Mi50b3BNYXRlcmlhbCh3eCwgd3osIHYyQ29sLCBzbG9wZSwgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGhoLCBzcywgbmVhcldhdGVyKSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHRoZSBjb2x1bW4nc1xuICAgICAgLy8gd2F0ZXIgbGV2ZWwgKHNlYSBsZXZlbCBpbiB2MTsgdGhlIGh5ZHJvbG9naWNhbCBsZXZlbCBpbiB2MikuXG4gICAgICBjb25zdCB3YXRlckxldmVsID0gdjJDb2wgPyBNYXRoLm1pbihZX01BWCwgdjJDb2wubGV2ZWwpIDogU0VBX0xFVkVMO1xuICAgICAgaWYgKGggPCB3YXRlckxldmVsKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCB3YXRlckxldmVsOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGN4LCBjeiwgc2VlZCwgdmVyc2lvbiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfTtcbn1cblxuLyoqXG4gKiBJbnN0YWxsIGJhc2UgY29udGVudHMgYXMgYSByZXNpZGVudCBjaHVuazogYXBwbHkgZHVyYWJsZSBlZGl0cywgdXBkYXRlXG4gKiBzdGF0cywgYW5kIHJ1biBkZXRlcm1pbmlzdGljIGVudGl0eSBnZW5lcmF0aW9uLiBNYWluLXRocmVhZCBvbmx5OyB0aGlzIGlzXG4gKiB0aGUgc2luZ2xlIHdyaXRlciBvZiBXb3JsZC4gUmV0dXJucyB0aGUgYWxyZWFkeS1yZXNpZGVudCBjaHVuayBpZiBvbmUgZXhpc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEJhc2VDaHVuayh3b3JsZDogV29ybGQsIGJhc2U6IEJhc2VDaHVuaywgZ2VuZXJhdGlvbk1zID0gMCk6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGJhc2Uuc2VlZCAhPT0gd29ybGQuc2VlZCB8fCBiYXNlLnZlcnNpb24gIT09IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdiYXNlIGNodW5rIGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgd29ybGQgY29uZmlndXJhdGlvbicpO1xuICB9XG4gIGNvbnN0IHsgY3gsIGN6LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9ID0gYmFzZTtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBnZW5lcmF0aW9uTXM7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDb2x1bW5zIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5OyB9XG5cbi8qKiBCYXNlIChwcmUtY2FydmUsIHByZS1lZGl0KSBjb2x1bW4gaGVpZ2h0cy9tYXRlcmlhbHMgdXNlZCBmb3IgZW50aXR5IHBsYWNlbWVudC4gUHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlQmFzZUNvbHVtbnMoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ29sdW1ucyB7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IHZlcnNpb25lZFNsb3BlKHNlZWQsIHZlcnNpb24sIHgsIHosIGgpIDogc2xvcGVBdChzZWVkLCB4LCB6LCBoKTtcbiAgICAgIGNvbnN0IGluZGV4ID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLmhlaWdodHNbaW5kZXhdID0gY2xhbXAoaCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2luZGV4XSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gYmFzZVRvcE1hdGVyaWFsRm9yKHNlZWQsIHZlcnNpb24sIHgsIHosIGgsIHNsb3BlKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29sdW1ucztcbn1cblxuLyoqIFByb3ZpZGUgcHJlY29tcHV0ZWQgYmFzZSBjb2x1bW5zIChmb3IgZXhhbXBsZSBmcm9tIGEgd29ya2VyKSBiZWZvcmUgaW5zdGFsbGluZyBhIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlZWRCYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nLCBjb2x1bW5zOiBCYXNlQ29sdW1ucyk6IHZvaWQge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGlmICghY2FjaGUuaGFzKGtleSkpIGNhY2hlLnNldChrZXksIGNvbHVtbnMpO1xufVxuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogQmFzZUNvbHVtbnMge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0gY29tcHV0ZUJhc2VDb2x1bW5zKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjaHVuay5jeCwgY2h1bmsuY3opO1xuICBjYWNoZS5zZXQoY2h1bmsua2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVyaXZlZCBjaGFuZ2UgdHJhY2tpbmcgKG5vdCBhdXRob3JpdGF0aXZlIHN0YXRlKSAtLS0tLS0tLS0tXG4vLyBSZW5kZXJlcnMgbmVlZCB0byBrbm93IHdoZW4gdGhlIGVkaXQgb3ZlcmxheSBjaGFuZ2VkIHdpdGhvdXQgd2Fsa2luZyBldmVyeVxuLy8gZWRpdCBlYWNoIGZyYW1lLiBUaGUgY291bnRlciBsaXZlcyBvdXRzaWRlIFdvcmxkIHNvIGl0IG5ldmVyIGVudGVycyBhXG4vLyBzbmFwc2hvdCBvciBjYW5vbmljYWwgaGFzaC5cbmNvbnN0IGVkaXRWZXJzaW9ucyA9IG5ldyBXZWFrTWFwPFdvcmxkLCBudW1iZXI+KCk7XG5cbi8qKiBNb25vdG9uaWMgY291bnQgb2YgZWRpdC1vdmVybGF5IGNoYW5nZXMgZm9yIHRoaXMgV29ybGQgb2JqZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRWZXJzaW9uKHdvcmxkOiBXb3JsZCk6IG51bWJlciB7XG4gIHJldHVybiBlZGl0VmVyc2lvbnMuZ2V0KHdvcmxkKSA/PyAwO1xufVxuXG4vKiogQ2FsbCBhZnRlciByZXBsYWNpbmcgb3IgYnVsay1jaGFuZ2luZyBgd29ybGQuZWRpdHNgIG91dHNpZGUgc2V0Vm94ZWwuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya0VkaXRzQ2hhbmdlZCh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZWRpdFZlcnNpb25zLnNldCh3b3JsZCwgZWRpdFZlcnNpb24od29ybGQpICsgMSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gbm9uLWdlbmVyYXRpbmcgcXVlcmllcyAtLS0tLS0tLS0tXG4vLyBNb3ZpbmcgcHJlc2VudGF0aW9uIChjaGFyYWN0ZXJzLCBhbmltYWxzLCBjYW1lcmEpIG11c3QgbmV2ZXIgdHJpZ2dlciBjaHVua1xuLy8gZ2VuZXJhdGlvbiBhcyBhIHNpZGUgZWZmZWN0IG9mIGFza2luZyBhYm91dCB0ZXJyYWluLiBUaGVzZSByZXR1cm4gbnVsbCB3aGVuXG4vLyB0aGUgY29sdW1uJ3MgY2h1bmsgaXMgbm90IHJlc2lkZW50LlxuXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRDaHVua0F0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBudWxsO1xuICByZXR1cm4gd29ybGQuY2h1bmtzLmdldChjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKSkgPz8gbnVsbDtcbn1cblxuLyoqIExpa2Ugc3VyZmFjZUF0LCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuLyoqIExpa2UgZ2V0Vm94ZWwsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRWb3hlbEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHwgbnVsbCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIC8vIENodW5rIGJ5dGVzIGFuZCBjb2x1bW4gY2FjaGVzIGFyZSByZWdlbmVyYXRlZCBvbiBkZW1hbmQuIEVudGl0aWVzIHJlbWFpblxuICAvLyBhdXRob3JpdGF0aXZlOiBldmljdGlvbiBtdXN0IG5vdCBmb3JnZXQgdGhlaXIgcGVyc2lzdGVudCBzdGF0ZS5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcXVlcmllcyAvIGVkaXRzIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG06IE1hdElkKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBZX01BWCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgY29uc3QgcHJldmlvdXNFZGl0ID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rS2V5KGN4LCBjeikpPy5nZXQoaWR4KTtcbiAgLy8gQSBjaHVuayBldmljdGVkIGFmdGVyIGFuIGVhcmxpZXIgZWRpdCBjYW4gcmVnZW5lcmF0ZSB3aXRoIHRoYXQgZHVyYWJsZVxuICAvLyBtYXRlcmlhbCBhbHJlYWR5IGFwcGxpZWQuIERyb3BwaW5nIHRoZSBlZGl0IGhlcmUgd291bGQgbWFrZSBpdCBkaXNhcHBlYXJcbiAgLy8gb24gdGhlIG5leHQgZXZpY3Rpb24vcmVzdG9yYXRpb24sIGV2ZW4gdGhvdWdoIHRoZSBjdXJyZW50IHdyaXRlIG5vLW9wcy5cbiAgaWYgKHByZXZpb3VzRWRpdCA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gZmFsc2U7XG4gIGxldCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChjaHVuay5rZXkpO1xuICBpZiAoIWVkaXRzKSB7IGVkaXRzID0gbmV3IE1hcCgpOyB3b3JsZC5lZGl0cy5zZXQoY2h1bmsua2V5LCBlZGl0cyk7IH1cbiAgLy8gQW4gaWRlbXBvdGVudCB3cml0ZSBtdXN0IHN0aWxsIHJlc3RvcmUgYSBkdXJhYmxlIGRlbHRhIGRpc2NhcmRlZCBieSBhblxuICAvLyBvbGRlciBzbmFwc2hvdCBvciBkZWx0YSBkZWNvZGVyLiBJdCBpcyBub3QgYSBuZXcgYXV0aG9yaXRhdGl2ZSByZXZpc2lvbi5cbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkge1xuICAgIGlmICghZWRpdHMuaGFzKGlkeCkpIGVkaXRzLnNldChpZHgsIG0pO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiA8IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICAgIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIC0gaCA6IDA7XG4gIH1cbiAgcmV0dXJuIHdhdGVyU3VyZmFjZUF0KHdvcmxkLCB4LCB6KSAtIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKlxuICogVG9wIG9mIHRoZSB3YXRlciBjb2x1bW4gc3RhbmRpbmcgb24gdGhlIHNvbGlkIHN1cmZhY2UgKGVxdWFsIHRvIHRoZSBzdXJmYWNlXG4gKiB3aGVuIGRyeSkuIFJlYWRzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVscywgc28gZWRpdHMgYW5kIGR1ZyBwaXRzIGFyZSBleGFjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyU3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIHdoaWxlICh5IDwgWV9NQVggJiYgZ2V0Vm94ZWwod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZW50aXRpZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gYWRkRW50aXR5KHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5oYXMoZS5pZCkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIHJldHVybjtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGUpO1xuICBsZXQgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgbGlzdCk7IH1cbiAgbGlzdC5wdXNoKGUuaWQpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIC8vIEdlbmVyYXRpb24gaXMgZGV0ZXJtaW5pc3RpYyBhbmQgYWR2YW5jZXMgbm8gcGxheWVyLWNvbW1hbmQgcHJlY29uZGl0aW9uLlxuICAvLyBBdXRob3JlZCBzY2FmZm9sZGluZyBtYXkgdHJhbnNpZW50bHkgY2hhbmdlIGl0OyB0aGUgc25hcHNob3QgcmVzdG9yZXMgdGhlXG4gIC8vIHNhdmVkIHJldmlzaW9uIGFmdGVyIHBsYWNpbmcgdGhhdCBzY2FmZm9sZGluZy5cbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUlkKGNodW5rOiBzdHJpbmcsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBgZToke2NodW5rfToke2l9YDtcbn1cblxuLyoqXG4gKiBQdXJlIGZvcmVzdC1kZW5zaXR5IGZpZWxkIHVzZWQgYnkgZW50aXR5IGdlbmVyYXRpb24uIEV4cG9ydGVkIHJlYWQtb25seSBmb3JcbiAqIHJlbmRlciBkZWNvcmF0aW9uIChyZW5kZXIvZ3JvdW5kLWNvdmVyLnRzKTsgY2hhbmdpbmcgaXQgY2hhbmdlcyB3b3JsZHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3Jlc3RTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBlYXN0ID0gTWF0aC5leHAoLSgoKHd4IC0gMjIwKSAvIDI2MCkgKiogMiArICgod3ogKyAxMTApIC8gMjIwKSAqKiAyKSk7XG4gIGNvbnN0IG5vcnRoID0gTWF0aC5leHAoLSgoKHd4IC0gMjApIC8gMzAwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAxOTApICoqIDIpKTtcbiAgY29uc3Qgd2VzdCA9IE1hdGguZXhwKC0oKCh3eCArIDM0MCkgLyAyMDApICoqIDIgKyAoKHd6IC0gMTIwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBzb3V0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDEyMCkgLyAyNDApICoqIDIgKyAoKHd6IC0gMzMwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBtb2lzdHVyZSA9IGZibTIod3ggLyAyNjAsIHd6IC8gMjYwLCBzZWVkICsgMjAxLCA0KTtcbiAgY29uc3QgdmFsbGV5ID0gTWF0aC5leHAoLSgod3ggLyAxNDApICoqIDIgKyAod3ogLyAxMDUpICoqIDIpKTtcbiAgcmV0dXJuIE1hdGgubWF4KGVhc3QsIG5vcnRoICogMC45Miwgd2VzdCAqIDAuODAsIHNvdXRoICogMC43OCkgKiAwLjgyXG4gICAgKyBtb2lzdHVyZSAqIDAuMzggLSAwLjIyIC0gdmFsbGV5ICogMC4zNDtcbn1cblxuLyoqIFB1cmUgcm9ja2luZXNzIGZpZWxkIHVzZWQgYnkgZW50aXR5IGdlbmVyYXRpb24gKHNhbWUgY29udHJhY3QgYXMgZm9yZXN0U2NvcmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJvY2tTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBtb3VudGFpbiA9IGZibTIod3ggLyAzMzAsIHd6IC8gMzMwLCBzZWVkICsgMjAyLCAzKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAxNDAsIHd6IC8gMTQwLCBzZWVkICsgMjAzLCAzKSAtIDEpO1xuICByZXR1cm4gbW91bnRhaW4gKiAwLjU1ICsgcmlkZ2UgKiAwLjQ1O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB2b2lkIHtcbiAgZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZCwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBSZXBsYXlzIGRldGVybWluaXN0aWMgZ2VuZXJhdGlvbiBmb3Igc25hcHNob3QgZW50aXR5IGRlbHRhcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhrZXkpKSByZXR1cm47XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybjtcblxuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY2h1bmsuY3gsIGNodW5rLmN6LCB3b3JsZC5zZWVkICsgOTAwKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGNvbHVtbnMgPSBiYXNlQ29sdW1ucyh3b3JsZCwgY2h1bmspO1xuICBsZXQgbiA9IDA7XG4gIGxldCBuYXR1cmFsVHJlZXMgPSAwO1xuICBsZXQgbmF0dXJhbFBpbmtUcmVlcyA9IDA7XG5cbiAgY29uc3QgbG9jYWxTdXJmYWNlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdICsgWV9NSU47XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSBhcyBNYXRJZDtcbiAgfTtcbiAgY29uc3QgbG9jYWxTbG9wZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggKyAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogKyAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICApO1xuICB9O1xuXG4gIC8vIEEgaml0dGVyZWQgOCBtIGxhdHRpY2UgZ2l2ZXMgY29oZXJlbnQgbWFzc2VzIGFuZCBhdm9pZHMgcGVyLWZyYW1lIHNjYXR0ZXIuXG4gIGZvciAobGV0IGd6ID0gMDsgZ3ogPCBDSFVOS19TSVpFOyBneiArPSA4KSB7XG4gICAgZm9yIChsZXQgZ3ggPSAwOyBneCA8IENIVU5LX1NJWkU7IGd4ICs9IDgpIHtcbiAgICAgIGNvbnN0IGx4ID0gY2xhbXAoTWF0aC5mbG9vcihneCArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IGx6ID0gY2xhbXAoTWF0aC5mbG9vcihneiArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgICAgaWYgKGggPD0gU0VBX0xFVkVMICsgMSkgY29udGludWU7XG4gICAgICBjb25zdCBzbG9wZSA9IGxvY2FsU2xvcGUobHgsIGx6KTtcbiAgICAgIGNvbnN0IHRvcCA9IGxvY2FsVG9wKGx4LCBseik7XG4gICAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9yZXN0ID0gZm9yZXN0U2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvY2t5ID0gcm9ja1Njb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2xsID0gcm5kKCk7XG5cbiAgICAgIGNvbnN0IHRyZWVDaGFuY2UgPSBmb3Jlc3QgPiAwLjUwID8gMC43MiA6IGZvcmVzdCA+IDAuMzAgPyAwLjI1IDogMC4wNTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAyICYmIHJvbGwgPCB0cmVlQ2hhbmNlKSB7XG4gICAgICAgIC8vIFRoZSBjYXAgaXMgYSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZ2VuZXJhdGlvbiBwcm9wZXJ0eS4gSXQgY2Fubm90XG4gICAgICAgIC8vIGRlcGVuZCBvbiB3aGljaCBjaHVua3MgYSByZW5kZXJlciBsb2FkZWQgYmVmb3JlIHRoaXMgb25lLlxuICAgICAgICBsZXQga2luZDogRW50aXR5S2luZDtcbiAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgY29uc3Qgc3BlY2llc1JvbGwgPSBybmQoKTtcbiAgICAgICAgaWYgKHNwZWNpZXNSb2xsIDwgMC4xMikge1xuICAgICAgICAgIGlmICgobmF0dXJhbFBpbmtUcmVlcyArIDEpID4gMC4yNSAqIChuYXR1cmFsVHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIG5hdHVyYWxQaW5rVHJlZXMrKztcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIG5hdHVyYWxUcmVlcysrO1xuICAgICAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44OCArIHJuZCgpICogMC4yNCwgdmFyaWFudCxcbiAgICAgICAgICByZXNvdXJjZTogJ3dvb2QnLCByZW1haW5pbmc6IDEyLCB5aWVsZFBlckhhcnZlc3Q6IDQsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHJvY2t5ID4gMC40NiAmJiByb2xsIDwgMC4zOCkge1xuICAgICAgICAvLyBDb25zdW1lIHRoZSByZXRpcmVkIHN0b25lIGZvcm0ncyByYW5kb20gZHJhd3MgYW5kIGFsbG9jYXRlIGl0cyBvbGRcbiAgICAgICAgLy8gc2VxdWVuY2UgSUQsIGJ1dCBkbyBub3QgaW5zZXJ0IGFuIGVudGl0eS4gTGF0ZXIgbmF0dXJhbCBwbGFjZW1lbnRzXG4gICAgICAgIC8vIHRoZXJlZm9yZSByZW1haW4gYnl0ZS1mb3ItYnl0ZSBjb21wYXRpYmxlIHdpdGggcmVjb3JkZWQgc2F2ZXMuXG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IGlkID0gZW50aXR5SWQoY2h1bmsua2V5LCBuKyspO1xuICAgICAgICBjb25zdCByZWNvcmQgPSB7XG4gICAgICAgICAgaWQsIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByZXNvdXJjZTogJ3N0b25lJyBhcyBjb25zdCxcbiAgICAgICAgICByZW1haW5pbmc6IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMixcbiAgICAgICAgICB5aWVsZFBlckhhcnZlc3Q6IDMsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgIH07XG4gICAgICAgIC8vIE9ubHkgZW50aXRpZXMgdGhhdCBleGlzdGVkIGluIGFuIGFjY2VwdGVkIG9sZCBzYXZlIGdldCB0b21ic3RvbmVzLFxuICAgICAgICAvLyBkdXJpbmcgZXhwbGljaXQgbWlncmF0aW9uLiBPcmRpbmFyeSBnZW5lcmF0aW9uIG11c3QgcmVzdG9yZSBleGFjdGx5LlxuICAgICAgICBpZiAoaXNTdG9uZVJlcGxheSh3b3JsZCkpIGFkZEVudGl0eSh3b3JsZCwgcmVjb3JkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuU1RPTkUgJiYgcm9ja3kgPiAwLjU4ICYmIHJvbGwgPCAwLjE4KSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfb3JlJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDIpLFxuICAgICAgICAgIHJlc291cmNlOiAnb3JlJywgcmVtYWluaW5nOiA4LCB5aWVsZFBlckhhcnZlc3Q6IDIsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDEgJiYgcm9sbCA8IDAuMzApIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9zaHJ1YicsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44ICsgcm5kKCkgKiAwLjQsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgICByZXNvdXJjZTogJ2ZpYmVyJywgcmVtYWluaW5nOiA0LCB5aWVsZFBlckhhcnZlc3Q6IDEsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkOiBXb3JsZCwga2luZDogRW50aXR5S2luZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgcm90OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsLCByZW1haW5pbmc6IG51bWJlciwgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmICh5IDw9IFNFQV9MRVZFTCkgcmV0dXJuO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgLy8gQSBoZXJvIGFzc2V0IG93bnMgaXRzIHNwb3Q6IGNsZWFyIGFueSBnZW5lcmF0ZWQgZW50aXR5IHRoYXQgd291bGQgb3ZlcmxhcFxuICAvLyBpdCwgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcgdGhlIGF1dGhvcmVkIGNvbXBvc2l0aW9uLlxuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW107XG4gIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSByZXR1cm47XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgTWF0aC5oeXBvdChlLnggLSB4LCBlLnogLSB6KSA8IDIuNikge1xuICAgICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICAgIH1cbiAgfVxuICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpKTtcbiAgLy8gQXV0aG9yZWQgY29tcG9zaXRpb24gaXMgZHVyYWJsZSBzdGF0ZTogaXQgY2FuIGNsZWFyIG92ZXJsYXBwaW5nIG5hdHVyYWxcbiAgLy8gZW50aXRpZXMsIHNvIHNhdmUgdGhlIGNvbXBsZXRlIGFmZmVjdGVkIGNodW5rIHJhdGhlciB0aGFuIG9ubHkgaXRzIGhlcm9lcy5cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcblxuICBjb25zdCBpZCA9IGBoZXJvOiR7a2luZH06JHtNYXRoLnJvdW5kKHgpfToke01hdGgucm91bmQoeil9YDtcbiAgY29uc3QgYmVmb3JlID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgY29uc3QgZW50aXR5OiBFbnRpdHkgPSB7XG4gICAgaWQsIGtpbmQsIGNodW5rOiBrZXksIHg6IHggKyAwLjUsIHksIHo6IHogKyAwLjUsXG4gICAgcm90LCBzY2FsZSwgdmFyaWFudCwgcmVzb3VyY2UsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogdHJ1ZSxcbiAgfTtcbiAgYWRkRW50aXR5KHdvcmxkLCBlbnRpdHkpO1xuICBpZiAod29ybGQuZW50aXRpZXMuc2l6ZSA+IGJlZm9yZSAmJiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB7XG4gICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSByZXR1cm47XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcblxuICBjb25zdCBzaXRlczogQXJyYXk8eyBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7IHg6IG51bWJlcjsgejogbnVtYmVyOyByb3Q6IG51bWJlciB9PiA9IFtcbiAgICB7IGtpbmQ6ICd3YXlzdG9uZScsIHg6IC0xMCwgejogLTE0LCByb3Q6IDAgfSxcbiAgICB7IGtpbmQ6ICdtYXJrZXInLCB4OiAtMzIsIHo6IC04LCByb3Q6IE1hdGguUEkgLyAyIH0sXG4gIF07XG4gIGZvciAoY29uc3QgcyBvZiBzaXRlcykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoeSA8PSBTRUFfTEVWRUwpIGNvbnRpbnVlO1xuICAgIHdvcmxkLnNpdGVzLnB1c2goe1xuICAgICAgaWQ6IGBzaXRlOiR7cy5raW5kfWAsXG4gICAgICBraW5kOiBzLmtpbmQsXG4gICAgICB4OiBzLnggKyAwLjUsIHksIHo6IHMueiArIDAuNSxcbiAgICAgIHJvdDogcy5yb3QsXG4gICAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgaGVybyBncm92ZSBjb21wb3NlZCBpbiB0aGUgZGVmYXVsdCBjYW1lcmEncyB2aWV3IGRpcmVjdGlvbi4gVGhlc2UgYXJlXG4gIC8vIFN0eWwgbmF0dXJhbCBhc3NldHMgKEFTLTAwMSB2MiksIG5vdCBOb3hlbCBhcmNoaXRlY3R1cmU7IHRoZSBOb3hlbFxuICAvLyB3YXlzdG9uZS9tYXJrZXIgYWJvdmUgcmVtYWluIHRoZSBodW1hbi1tYWRlIGxhbmRtYXJrcy5cbiAgY29uc3QgZ3JvdmU6IEFycmF5PFtFbnRpdHlLaW5kLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+ID0gW1xuICAgIFsnc3R5bF90cmVlX3NwaXJlJywgLTIyLCAtMjYsIDAsIDEuMDAsIDBdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTM0LCAtMTgsIDEsIDAuOTUsIE1hdGguUEkgLyAxMl0sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xNiwgLTM0LCAyLCAxLjAwLCBNYXRoLlBJIC8gNl0sXG4gICAgWydzdHlsX3RyZWVfYmxvc3NvbScsIC0yOCwgLTM4LCAwLCAwLjkwLCBNYXRoLlBJIC8gNF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtNDAsIC0zMCwgMiwgMS4wNSwgTWF0aC5QSSAvIDNdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTIsIC0yNCwgMCwgMC45MCwgTWF0aC5QSSAvIDIuNF0sXG4gIF07XG4gIGZvciAoY29uc3QgW2tpbmQsIHgsIHosIHZhcmlhbnQsIHNjYWxlLCByb3RdIG9mIGdyb3ZlKSB7XG4gICAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsIGtpbmQsIHgsIHosIHZhcmlhbnQsIHJvdCwgc2NhbGUsICd3b29kJywgMTIsIDQpO1xuICB9XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9yb2NrX21lZGl1bScsIC02LCAtMTAsIDAsIDAsIDEuMCwgJ3N0b25lJywgOCwgMyk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9zaHJ1YicsIC0xNCwgLTgsIDEsIE1hdGguUEkgLyAxMiwgMS4xLCAnZmliZXInLCA0LCAxKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX2NhaXJuJywgLTIwLCAtNiwgMCwgMCwgMS4wLCAnc3RvbmUnLCA2LCAyKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX29yZScsIC0zOCwgLTQyLCAwLCBNYXRoLlBJIC8gNCwgMS4xLCAnb3JlJywgOCwgMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZWFyZXN0SGFydmVzdGFibGUoXG4gIHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCByZXNvdXJjZT86IFJlc291cmNlVHlwZSxcbik6IEVudGl0eSB8IG51bGwge1xuICBsZXQgYmVzdDogRW50aXR5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0RCA9IHJhZGl1cyAqIHJhZGl1cztcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICAgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgY29udGludWU7XG4gICAgaWYgKHJlc291cmNlICYmIGUucmVzb3VyY2UgIT09IHJlc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBkID0gKGUueCAtIHgpICoqIDIgKyAoZS56IC0geikgKiogMjtcbiAgICBpZiAoZCA8IGJlc3REKSB7IGJlc3REID0gZDsgYmVzdCA9IGU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0UmVzdWx0IHsgZW50aXR5OiBFbnRpdHk7IHJlc291cmNlOiBSZXNvdXJjZVR5cGU7IGFtb3VudDogbnVtYmVyOyB9XG5cbi8qKlxuICogU2V0dGxlbWVudCBydWxlcyB2MiAoTTAxMCk6IGdyb3d0aCBzdGFnZSBzZXRzIHRyZWUgeWllbGQgYW5kIGZvb3RwcmludCwgYW5kXG4gKiB2aWxsYWdlcnMgbmF2aWdhdGUuIEFjdGl2ZSBvbmNlIHRoZSB3b3JsZCdzIGhvbWVzdGVhZCBpcyB2ZXJzaW9uIDIgKGZvdW5kZWRcbiAqIG9yIHVwZ3JhZGVkIGJ5IGEgam91cm5hbGVkIGNvbW1hbmQpOyBlYXJsaWVyIHdvcmxkcyBrZWVwIGxlZ2FjeSBydWxlcywgc29cbiAqIHRoZWlyIHJlcGxheXMgYW5kIGhhc2hlcyBhcmUgdW5jaGFuZ2VkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RhZ2VSdWxlc0FjdGl2ZSh3b3JsZDogV29ybGQpOiBib29sZWFuIHtcbiAgcmV0dXJuICh3b3JsZC5ob21lc3RlYWQ/LnZlcnNpb24gPz8gMCkgPj0gMjtcbn1cblxuLyoqXG4gKiBVbmRlciBzdGFnZSBydWxlcyBhIHRyZWUncyBmaXJzdCBjdXQgc2V0cyBpdHMgcmVjb3JkIHRvIHRoZSBzdGFnZSdzIHRpbWJlclxuICogKGEgc2FwbGluZyBob2xkcyAyIHdvb2QsIGFuIG9sZCB0cmVlIDE2KS4gSWRlbXBvdGVudCBhZnRlciB0aGUgZmlyc3QgY3V0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlTdGFnZVRpbWJlcih3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAoIXN0YWdlUnVsZXNBY3RpdmUod29ybGQpIHx8IGUuaGFydmVzdGVkT25jZSkgcmV0dXJuO1xuICBjb25zdCB0ID0gdHJlZVRpbWJlcihlKTtcbiAgaWYgKCF0KSByZXR1cm47XG4gIGUucmVtYWluaW5nID0gdC50b3RhbDtcbiAgZS55aWVsZFBlckhhcnZlc3QgPSB0LmN1dDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogSGFydmVzdFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBlID0gbGl2ZUVudGl0eSh3b3JsZCwgaWQpO1xuICBpZiAoIWUgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgcmV0dXJuIG51bGw7XG4gIC8vIENhcGFjaXR5IGlzIGNoZWNrZWQgYWdhaW5zdCB0aGUgc3RhZ2UgeWllbGQsIHRoZW4gdGhlIHJlY29yZCBjaGFuZ2VzLlxuICBpZiAoc3RhZ2VSdWxlc0FjdGl2ZSh3b3JsZCkgJiYgIWUuaGFydmVzdGVkT25jZSAmJiB0cmVlVGltYmVyKGUpKSB7XG4gICAgY29uc3QgdCA9IHRyZWVUaW1iZXIoZSkhO1xuICAgIGlmICh3b3JsZC5saWZlICYmIE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCkgKyBNYXRoLm1pbih0LmN1dCwgdC50b3RhbCkgPiAxMjApIHJldHVybiBudWxsO1xuICAgIGFwcGx5U3RhZ2VUaW1iZXIod29ybGQsIGUpO1xuICB9XG4gIGNvbnN0IGFtb3VudCA9IE1hdGgubWluKGUueWllbGRQZXJIYXJ2ZXN0LCBlLnJlbWFpbmluZyk7XG4gIGlmICh3b3JsZC5saWZlICYmIE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCkgKyBhbW91bnQgPiAxMjApIHJldHVybiBudWxsO1xuICBlLnJlbWFpbmluZyAtPSBhbW91bnQ7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGUuaGFydmVzdGVkT25jZSA9IHRydWU7XG4gIGlmIChlLnJlbWFpbmluZyA8PSAwKSBlLmhhcnZlc3RlZCA9IHRydWU7XG4gIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IGVudGl0eTogZSwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG4vKiogUmVtb3ZlIGV2ZXJ5IHJldGlyZWQgc291cmNlIGFmdGVyIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5LiBUaGlzIG1pZ3JhdGlvblxuICogY3JlYXRlcyBkZXRlcm1pbmlzdGljIHRvbWJzdG9uZXMgYnV0IGlzIG5vdCBhIHBsYXllciBjb21tYW5kIG9yIHJldmlzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJldGlyZVN0b25lRW50aXRpZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZSBvZiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldKSB7XG4gICAgaWYgKCFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSkgY29udGludWU7XG4gICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGUuaWQpO1xuICAgIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGUuaWQpO1xuICAgIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICAgIGlmICghd29ybGQuZW50aXR5Q2h1bmtzLmhhcyhlLmNodW5rKSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgZm9yIChjb25zdCBba2V5LCBpZHNdIG9mIHdvcmxkLmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IGFjdGl2ZSA9IGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKTtcbiAgICBpZiAoYWN0aXZlLmxlbmd0aCA+IDAgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoa2V5KSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGFjdGl2ZSk7XG4gICAgZWxzZSB3b3JsZC5lbnRpdHlDaHVua3MuZGVsZXRlKGtleSk7XG4gIH1cbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBlcnNpc3RlbmNlIC8gYXV0aG9yaXR5IGJvdW5kYXJ5IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNYW5pZmVzdCB7XG4gIHNjaGVtYTogMTtcbiAgc2VlZDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBwYXJhbXNIYXNoOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGZudjFhKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoID0gMHg4MTFjOWRjNTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgaCBePSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgaCA9IE1hdGguaW11bChoLCAweDAxMDAwMTkzKTtcbiAgfVxuICByZXR1cm4gKGggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRNYW5pZmVzdCh3b3JsZDogV29ybGQpOiBXb3JsZE1hbmlmZXN0IHtcbiAgY29uc3QgcCA9IHdvcmxkLnBhcmFtcztcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAgc2VlZDogd29ybGQuc2VlZCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBwLmdlbmVyYXRvclZlcnNpb24sXG4gICAgc2l6ZTogcC5zaXplLFxuICAgIGNodW5rU2l6ZTogcC5jaHVua1NpemUsXG4gICAgeU1pbjogcC55TWluLFxuICAgIHlNYXg6IHAueU1heCxcbiAgICBzZWFMZXZlbDogcC5zZWFMZXZlbCxcbiAgICBwYXJhbXNIYXNoOiBmbnYxYShKU09OLnN0cmluZ2lmeShwKSksXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxFZGl0IHsgaTogbnVtYmVyOyBtOiBudW1iZXI7IH1cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIHNjaGVtYTogMTtcbiAga2V5OiBzdHJpbmc7XG4gIGJhc2VWZXJzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBWb3hlbEVkaXRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydENodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IENodW5rRGVsdGEge1xuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBrZXksXG4gICAgYmFzZVZlcnNpb246IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIGVkaXRzOiBlZGl0cyA/IFsuLi5lZGl0cy5lbnRyaWVzKCldLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKS5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpIDogW10sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBkZWx0YTogQ2h1bmtEZWx0YSk6IHZvaWQge1xuICBjb25zdCBbY3gsIGN6XSA9IGRlbHRhLmtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBmb3IgKGNvbnN0IGUgb2YgZGVsdGEuZWRpdHMpIHtcbiAgICBjb25zdCB5SW5kZXggPSBNYXRoLmZsb29yKGUuaSAvIENIVU5LX0FSRUEpO1xuICAgIGNvbnN0IHJlbSA9IGUuaSAlIENIVU5LX0FSRUE7XG4gICAgY29uc3QgbHogPSBNYXRoLmZsb29yKHJlbSAvIENIVU5LX1NJWkUpO1xuICAgIGNvbnN0IGx4ID0gcmVtICUgQ0hVTktfU0laRTtcbiAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4O1xuICAgIGNvbnN0IHkgPSBZX01JTiArIHlJbmRleDtcbiAgICBjb25zdCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBlLm0gYXMgTWF0SWQpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gdGltZSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFRpbWVTdGF0ZSB7IHQ6IG51bWJlcjsgZGF5TGVuZ3RoU2VjOiBudW1iZXI7IHBhdXNlZDogYm9vbGVhbjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpbWUoczogVGltZVN0YXRlLCBkdDogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzLnBhdXNlZCkgcmV0dXJuO1xuICBzLnQgPSAocy50ICsgZHQgLyBzLmRheUxlbmd0aFNlYykgJSAxO1xufVxuIiwgIi8vIFRlcnJhaW4gcXVlcnkgbGF5ZXIgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDIgU3lzdGVtIDE6IG9uZSBzaGFyZWQsIGNhY2hlZCBjb250cmFjdCBmb3IgY29uc3RydWN0aW9uLCBmYXJtaW5nLFxuLy8gbW92ZW1lbnQsIG5hdmlnYXRpb24gYW5kIHRoZSBBSSBhZ2VudC4gVGhlc2UgcXVlcmllcyBkZXNjcmliZSB0aGVcbi8vIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lOyB0aGV5IG5ldmVyIG11dGF0ZSBpdCBhbmQgbmV2ZXIgY3JlYXRlIGEgc2Vjb25kXG4vLyB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuLy9cbi8vIENvbnZlbnRpb25zOlxuLy8gICAqIHgveiBhcmUgaW50ZWdlciBjb2x1bW4gY29vcmRpbmF0ZXMgaW4gWy0xMDI0LCAxMDI0KS5cbi8vICAgKiB5IGlzIGFuIGludGVnZXIgdm94ZWwgY29vcmRpbmF0ZSBpbiBbLTE2LCAxMTIpLlxuLy8gICAqIHN1cmZhY2VZIGlzIHRoZSBleHBvc2VkIHRvcCBmYWNlICh0b3BTb2xpZCArIDEpLCBtYXRjaGluZyBNMDAxLlxuLy8gICAqIEEgcmVjdCBpcyBpbmNsdXNpdmUgb24gYWxsIGZvdXIgZWRnZXMuXG5pbXBvcnQge1xuICBXb3JsZCwgTWF0SWQsIE1BVCwgU0VBX0xFVkVMLCBZX01JTiwgWV9NQVgsIEhBTEYsXG4gIHN1cmZhY2VBdCwgdG9wTWF0ZXJpYWxBdFdvcmxkLCBnZXRWb3hlbCwgaXNTb2xpZCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEFjdGl2ZUVudGl0eUtpbmQsIEVudGl0eUtpbmQsIGlzUmV0aXJlZFN0b25lS2luZCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlY3Qge1xuICB4MDogbnVtYmVyO1xuICB6MDogbnVtYmVyO1xuICB4MTogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsUmVnaW9uIGV4dGVuZHMgUmVjdCB7XG4gIHkwOiBudW1iZXI7XG4gIHkxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVSZWN0KHJlY3Q6IFJlY3QpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogTWF0aC5taW4ocmVjdC54MCwgcmVjdC54MSksXG4gICAgejA6IE1hdGgubWluKHJlY3QuejAsIHJlY3QuejEpLFxuICAgIHgxOiBNYXRoLm1heChyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MTogTWF0aC5tYXgocmVjdC56MCwgcmVjdC56MSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29sdW1ucyhyZWN0OiBSZWN0KTogbnVtYmVyIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIHJldHVybiAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbnRhaW5zKHJlY3Q6IFJlY3QsIHg6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB4ID49IHJlY3QueDAgJiYgeCA8PSByZWN0LngxICYmIHogPj0gcmVjdC56MCAmJiB6IDw9IHJlY3QuejE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBhbmRSZWN0KHJlY3Q6IFJlY3QsIGFtb3VudDogbnVtYmVyKTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IHJlY3QueDAgLSBhbW91bnQsXG4gICAgejA6IHJlY3QuejAgLSBhbW91bnQsXG4gICAgeDE6IHJlY3QueDEgKyBhbW91bnQsXG4gICAgejE6IHJlY3QuejEgKyBhbW91bnQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0VG9SZWdpb24ocmVjdDogUmVjdCwgeTAgPSBZX01JTiwgeTEgPSBZX01BWCAtIDEpOiBWb3hlbFJlZ2lvbiB7XG4gIHJldHVybiB7IC4uLm5vcm1hbGl6ZVJlY3QocmVjdCksIHkwLCB5MSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaW9uc092ZXJsYXAoYTogVm94ZWxSZWdpb24sIGI6IFZveGVsUmVnaW9uKTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejBcbiAgICAmJiBhLnkwIDw9IGIueTEgJiYgYS55MSA+PSBiLnkwO1xufVxuXG4vKiogSW5jbHVzaXZlIGNvbnRhaW5tZW50IG9mIGEgdm94ZWwgaW4gYSB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudmVsb3BlQ29udGFpbnMocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCByIG9mIHJlY3RzKSB7XG4gICAgaWYgKHggPj0gci54MCAmJiB4IDw9IHIueDEgJiYgeSA+PSByLnkwICYmIHkgPD0gci55MSAmJiB6ID49IHIuejAgJiYgeiA8PSByLnoxKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFpbkNvbHVtbiB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogRXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uOyB0aGUgZmlyc3QgYWlyIGNlbGwgYWJvdmUgaXQuICovXG4gIHN1cmZhY2VZOiBudW1iZXI7XG4gIC8qKiBUaGUgaGlnaGVzdCBzb2xpZCB2b3hlbCwgb3IgWV9NSU4gLSAxIGlmIHRoZSBjb2x1bW4gaGFzIG5vIHNvbGlkLiAqL1xuICB0b3BTb2xpZFk6IG51bWJlcjtcbiAgdG9wTWF0ZXJpYWw6IE1hdElkO1xuICBzb2xpZDogYm9vbGVhbjtcbiAgLyoqIFdhdGVyIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlLCB1cCB0byBzZWEgbGV2ZWwuIDAgb24gZHJ5IGxhbmQuICovXG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbiAgdW5kZXJ3YXRlcjogYm9vbGVhbjtcbiAgLyoqIExhcmdlc3QgNC1uZWlnaGJvdXIgc3VyZmFjZSBzdGVwIGluIG1ldHJlcyAoMSA9IGEgc2luZ2xlIHZveGVsIHJpc2VyKS4gKi9cbiAgc2xvcGU6IG51bWJlcjtcbiAgLyoqIEZyZWUgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlLCBjYXBwZWQgYXQgQ0xFQVJBTkNFX1BST0JFLiAqL1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IENMRUFSQU5DRV9QUk9CRSA9IDg7XG5cbmZ1bmN0aW9uIHN1cmZhY2VBdFNhZmUod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxsYmFjaztcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKiBXYXRlciBkZXB0aCB0aGF0IHJlc3BlY3RzIGEgZHJ5IHBpdCBiZWxvdyBzZWEgbGV2ZWwgKHVubGlrZSBoZWlnaHQgYWxvbmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmIChzdXJmYWNlID49IFNFQV9MRVZFTCkgcmV0dXJuIDA7XG4gIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgU0VBX0xFVkVMIC0gMSwgeikgIT09IE1BVC5XQVRFUikgcmV0dXJuIDA7XG4gIHJldHVybiBTRUFfTEVWRUwgLSBzdXJmYWNlO1xufVxuXG4vKiogVHJ1ZSB3aGVuIGBoZWlnaHRgIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSBhcmUgZnJlZSBvZiBzb2xpZCBvciB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhcmFuY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoZWlnaHQ7IGkrKykge1xuICAgIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgc3VyZmFjZSArIGksIHopICE9PSBNQVQuQUlSKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2x1bW5BdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCBzdXJmYWNlWSA9IHN1cmZhY2VBdCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3QgdG9wTWF0ZXJpYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNvbGlkID0gc3VyZmFjZVkgPiBZX01JTiAmJiBpc1NvbGlkKHRvcE1hdGVyaWFsKTtcbiAgY29uc3Qgd2F0ZXJEZXB0aCA9IHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4IC0gMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCArIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6IC0gMSwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiArIDEsIHN1cmZhY2VZKSksXG4gICk7XG4gIGxldCBjbGVhcmFuY2UgPSAwO1xuICB3aGlsZSAoY2xlYXJhbmNlIDwgQ0xFQVJBTkNFX1BST0JFICYmIGdldFZveGVsKHdvcmxkLCBjeCwgc3VyZmFjZVkgKyBjbGVhcmFuY2UsIGN6KSA9PT0gTUFULkFJUikge1xuICAgIGNsZWFyYW5jZSsrO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDogY3gsIHo6IGN6LCBzdXJmYWNlWSwgdG9wU29saWRZOiBzdXJmYWNlWSAtIDEsIHRvcE1hdGVyaWFsLFxuICAgIHNvbGlkLCB3YXRlckRlcHRoLCB1bmRlcndhdGVyOiB3YXRlckRlcHRoID4gMCwgc2xvcGUsIGNsZWFyYW5jZSxcbiAgfTtcbn1cblxuLy8gRW50aXR5IGZvb3RwcmludHMgYXJlIGRlbGliZXJhdGVseSBleHBsaWNpdC4gQSB0cmVlIG9jY3VwaWVzIG1vcmUgc2l0ZSB0aGFuXG4vLyBpdHMgdHJ1bms7IGEgcGViYmxlIG9jY3VwaWVzIGxlc3MgdGhhbiBhIGJvdWxkZXIuIFRoZXNlIGFyZSBzaW11bGF0aW9uXG4vLyBjbGVhcmFuY2UgcmFkaWksIG5vdCByZW5kZXIgYm91bmRzLlxuZXhwb3J0IGNvbnN0IE9CU1RSVUNUSU9OX1JBRElVUzogUmVjb3JkPEFjdGl2ZUVudGl0eUtpbmQsIG51bWJlcj4gPSB7XG4gIHN0eWxfdHJlZV9zcGlyZTogMS41LFxuICBzdHlsX3RyZWVfdGFibGU6IDEuOCxcbiAgc3R5bF90cmVlX2NsdXN0ZXI6IDEuOSxcbiAgc3R5bF90cmVlX2Jsb3Nzb206IDEuNixcbiAgc3R5bF9zaHJ1YjogMC42LFxuICBzdHlsX29yZTogMC45LFxuICBzdHlsX2NhaXJuOiAwLjgsXG4gIHdheXN0b25lOiAxLjQsXG4gIG1hcmtlcjogMC41LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBPYnN0cnVjdGlvbiB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbiAgLyoqIEZvb3RwcmludCBjZWxscyBvdmVybGFwcGVkIGJ5IHRoaXMgZW50aXR5LiAqL1xuICBjZWxsczogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIC8vIEEgcmVjdCBvd25zIHdob2xlIHZveGVsIGNlbGxzLiBJbmNsdWRlIGV2ZXJ5IGNodW5rIHdob3NlIHJvb3QgY291bGQgb3ZlcmxhcFxuICAvLyB0aG9zZSBjZWxscywgd2l0aG91dCBzY2FubmluZyB0aGUgZW50aXJlIDIwNDggbSB3b3JsZC5cbiAgY29uc3QgcmFkaXVzID0gTWF0aC5tYXgoLi4uT2JqZWN0LnZhbHVlcyhPQlNUUlVDVElPTl9SQURJVVMpLCAxLjUpO1xuICBjb25zdCBtaW5DZWxsWCA9IE1hdGguZmxvb3Ioci54MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxYID0gTWF0aC5jZWlsKHIueDEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3QgbWluQ2VsbFogPSBNYXRoLmZsb29yKHIuejAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWiA9IE1hdGguY2VpbChyLnoxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1gobWluQ2VsbFgpKSwgY3gxID0gd29ybGRUb0NodW5rWChtYXhDZWxsWCk7XG4gIGNvbnN0IGN6MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1oobWluQ2VsbFopKSwgY3oxID0gd29ybGRUb0NodW5rWihtYXhDZWxsWik7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSBrZXlzLnB1c2goY2h1bmtLZXkoY3gsIGN6KSk7XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKiBFbnRpdGllcyB3aG9zZSBzaW11bGF0aW9uIGZvb3RwcmludCBvdmVybGFwcyB0aGUgcmVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvYnN0cnVjdGlvbnNJbih3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgb3V0OiBPYnN0cnVjdGlvbltdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQsIHIpKSB7XG4gICAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghaWRzKSBjb250aW51ZTtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgICAgaWYgKHNlZW4uaGFzKGlkKSkgY29udGludWU7XG4gICAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIGNvbnRpbnVlO1xuICAgICAgc2Vlbi5hZGQoaWQpO1xuICAgICAgY29uc3QgcmFkaXVzID0gaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZClcbiAgICAgICAgPyBlLmtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gMC42IDogZS5raW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyAxLjEgOiAxLjVcbiAgICAgICAgOiBPQlNUUlVDVElPTl9SQURJVVNbZS5raW5kIGFzIEFjdGl2ZUVudGl0eUtpbmRdO1xuICAgICAgbGV0IGNlbGxzID0gMDtcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3IoZS54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoZS54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKGUueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKGUueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3QoZS54IC0gKHggKyAwLjUpLCBlLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgY2VsbHMrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGNlbGxzID4gMCkge1xuICAgICAgICBvdXQucHVzaCh7IGVudGl0eUlkOiBlLmlkLCBraW5kOiBlLmtpbmQsIHg6IGUueCwgejogZS56LCByYWRpdXMsIGNlbGxzIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gKGEuZW50aXR5SWQgPCBiLmVudGl0eUlkID8gLTEgOiBhLmVudGl0eUlkID4gYi5lbnRpdHlJZCA/IDEgOiAwKSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXJlYVN0YXRzIHtcbiAgcmVjdDogUmVjdDtcbiAgY29sdW1uczogbnVtYmVyO1xuICBtaW5ZOiBudW1iZXI7XG4gIG1heFk6IG51bWJlcjtcbiAgbWVhblk6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJDb2x1bW5zOiBudW1iZXI7XG4gIHN0b25lQ29sdW1uczogbnVtYmVyO1xuICBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj47XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgb2JzdHJ1Y3RlZENvbHVtbnM6IG51bWJlcjtcbiAgLyoqIEN1dC9maWxsIHJlbGF0aXZlIHRvIGZsb29yWSB3aGVuIHN1cHBsaWVkLCBvdGhlcndpc2UgMC4gKi9cbiAgZmxvb3JZOiBudW1iZXIgfCBudWxsO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cHBvcnRTdW1tYXJ5IHtcbiAgdG90YWw6IG51bWJlcjtcbiAgbGV2ZWw6IG51bWJlcjtcbiAgY3V0OiBudW1iZXI7XG4gIGZpbGw6IG51bWJlcjtcbiAgd2F0ZXI6IG51bWJlcjtcbiAgLyoqIEZpbGwgZGVlcGVyIHRoYW4gOCBtOyBhIHZhbGlkYXRvciBtYXkgcmVqZWN0IHRoZXNlIGFzIHVuc3VwcG9ydGVkLiAqL1xuICBkZWVwRmlsbDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZvb3RwcmludFF1ZXJ5IHtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRzOiBBcmVhU3RhdHM7XG4gIHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIC8qKiBDZWxscyBpbiB0aGUgYnVpbGRpbmcgdm9sdW1lIGFib3ZlIHRoZSBwcmVwYXJlZCBmbG9vciB0aGF0IGFyZSBub3QgYWlyLiAqL1xuICBvdmVyaGFuZ0NlbGxzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IG1hdGVyaWFsOiBNYXRJZCB9Pjtcbn1cblxuLyoqXG4gKiBDYWNoZWQgcXVlcnkgY29udGV4dC4gQ2FjaGVzIGFyZSBrZXllZCBvbiB3b3JsZC5yZXZpc2lvbjogYSB2b3hlbCBvciBlbnRpdHlcbiAqIGVkaXQgaW52YWxpZGF0ZXMgdGhlbSwgd2hpbGUgbWVzaC9uYXYgcmVidWlsZHMgZG8gbm90LiBVc2Ugb25lIGNvbnRleHQgZm9yIGFcbiAqIHNpdGUgc2VhcmNoIG9yIGEgZm9vdHByaW50IGV2YWx1YXRpb24sIHRoZW4gZGlzY2FyZCBpdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlcnJhaW5RdWVyeSB7XG4gIHByaXZhdGUgY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgVGVycmFpbkNvbHVtbj4oKTtcbiAgcHJpdmF0ZSBvYnN0cnVjdGlvbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9ic3RydWN0aW9uW10+KCk7XG4gIHByaXZhdGUgcmV2aXNpb246IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgd29ybGQ6IFdvcmxkKSB7XG4gICAgdGhpcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xuICB9XG5cbiAgcHJpdmF0ZSBzeW5jKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnJldmlzaW9uICE9PSB0aGlzLndvcmxkLnJldmlzaW9uKSB7XG4gICAgICB0aGlzLmNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMucmV2aXNpb24gPSB0aGlzLndvcmxkLnJldmlzaW9uO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBDYWNoZWQgZW50aXR5IG9ic3RydWN0aW9ucyBmb3Igb25lIGZvb3RwcmludC4gKi9cbiAgb2JzdHJ1Y3Rpb25zRm9yKHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBrZXkgPSBgJHtyLngwfSwke3IuejB9LCR7ci54MX0sJHtyLnoxfWA7XG4gICAgbGV0IGxpc3QgPSB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFsaXN0KSB7XG4gICAgICBsaXN0ID0gb2JzdHJ1Y3Rpb25zSW4odGhpcy53b3JsZCwgcik7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuc2V0KGtleSwgbGlzdCk7XG4gICAgfVxuICAgIHJldHVybiBsaXN0O1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gICAgY29uc3Qga2V5ID0gYCR7Y3h9LCR7Y3p9YDtcbiAgICBsZXQgY29sID0gdGhpcy5jYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWNvbCkge1xuICAgICAgY29sID0gY29sdW1uQXQodGhpcy53b3JsZCwgY3gsIGN6KTtcbiAgICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgY29sKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbDtcbiAgfVxuXG4gIGFyZWEocmVjdDogUmVjdCwgZmxvb3JZPzogbnVtYmVyKTogQXJlYVN0YXRzIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgICBsZXQgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgICBsZXQgc3VtID0gMDtcbiAgICBsZXQgbWF4U3RlcCA9IDA7XG4gICAgbGV0IHdhdGVyQ29sdW1ucyA9IDA7XG4gICAgbGV0IHN0b25lQ29sdW1ucyA9IDA7XG4gICAgbGV0IGN1dFZvbHVtZSA9IDA7XG4gICAgbGV0IGZpbGxWb2x1bWUgPSAwO1xuICAgIGxldCBtYXhDdXQgPSAwO1xuICAgIGxldCBtYXhGaWxsID0gMDtcbiAgICBjb25zdCBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj4gPSB7fTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgbWF4WSA9IE1hdGgubWF4KG1heFksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIHN1bSArPSBjb2wuc3VyZmFjZVk7XG4gICAgICAgIG1heFN0ZXAgPSBNYXRoLm1heChtYXhTdGVwLCBjb2wuc2xvcGUpO1xuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSB3YXRlckNvbHVtbnMrKztcbiAgICAgICAgaWYgKGNvbC50b3BNYXRlcmlhbCA9PT0gTUFULlNUT05FKSBzdG9uZUNvbHVtbnMrKztcbiAgICAgICAgbWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPSAobWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPz8gMCkgKyAxO1xuICAgICAgICBpZiAoZmxvb3JZICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgICBjdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGR5KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgICAgZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBvYnN0cnVjdGlvbnMgPSB0aGlzLm9ic3RydWN0aW9uc0ZvcihyKTtcbiAgICBjb25zdCBvYnN0cnVjdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBvIG9mIG9ic3RydWN0aW9ucykge1xuICAgICAgY29uc3QgcmFkaXVzID0gby5yYWRpdXM7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKG8ueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKG8ueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihvLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChvLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KG8ueCAtICh4ICsgMC41KSwgby56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIG9ic3RydWN0ZWQuYWRkKGAke3h9LCR7en1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbHVtbnMgPSAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xuICAgIHJldHVybiB7XG4gICAgICByZWN0OiByLFxuICAgICAgY29sdW1ucyxcbiAgICAgIG1pblksIG1heFksXG4gICAgICBtZWFuWTogTWF0aC5yb3VuZCgoc3VtIC8gY29sdW1ucykgKiAxMDAwKSAvIDEwMDAsXG4gICAgICByZWxpZWY6IG1heFkgLSBtaW5ZLFxuICAgICAgbWF4U3RlcCxcbiAgICAgIHdhdGVyQ29sdW1ucyxcbiAgICAgIHN0b25lQ29sdW1ucyxcbiAgICAgIG1hdGVyaWFscyxcbiAgICAgIG9ic3RydWN0aW9ucyxcbiAgICAgIG9ic3RydWN0ZWRDb2x1bW5zOiBvYnN0cnVjdGVkLnNpemUsXG4gICAgICBmbG9vclk6IGZsb29yWSA/PyBudWxsLFxuICAgICAgY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dCxcbiAgICAgIG1heEZpbGwsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFdmFsdWF0ZSBhIGNvbXBsZXRlIGJ1aWxkaW5nIGZvb3RwcmludC4gYGZsb29yWWAgaXMgdGhlIHByZXBhcmVkIHdhbGtpbmdcbiAgICogZmxvb3I6IHRlcnJhaW4gYWJvdmUgaXQgaXMgY3V0LCB0ZXJyYWluIGJlbG93IGl0IGlzIGZpbGxlZC4gVGhlIHJlc3VsdCBpc1xuICAgKiByYXcgc2l0ZSBkYXRhOyBjb25zdHJ1Y3Rpb24gcnVsZXMgbGl2ZSBpbiBjb25zdHJ1Y3Rpb24udHMuXG4gICAqL1xuICBmb290cHJpbnQocmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBGb290cHJpbnRRdWVyeSB7XG4gICAgY29uc3Qgc3RhdHMgPSB0aGlzLmFyZWEocmVjdCwgZmxvb3JZKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeSA9IHtcbiAgICAgIHRvdGFsOiBzdGF0cy5jb2x1bW5zLCBsZXZlbDogMCwgY3V0OiAwLCBmaWxsOiAwLCB3YXRlcjogMCwgZGVlcEZpbGw6IDAsXG4gICAgICBtYXhDdXQ6IDAsIG1heEZpbGw6IDAsIGN1dFZvbHVtZTogMCwgZmlsbFZvbHVtZTogMCxcbiAgICB9O1xuICAgIGNvbnN0IG92ZXJoYW5nQ2VsbHM6IEZvb3RwcmludFF1ZXJ5WydvdmVyaGFuZ0NlbGxzJ10gPSBbXTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgIHN1cHBvcnQuY3V0Kys7XG4gICAgICAgICAgc3VwcG9ydC5jdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhDdXQgPSBNYXRoLm1heChzdXBwb3J0Lm1heEN1dCwgZHkpO1xuICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgIHN1cHBvcnQuZmlsbCsrO1xuICAgICAgICAgIHN1cHBvcnQuZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhGaWxsID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIGlmICgtZHkgPiA4KSBzdXBwb3J0LmRlZXBGaWxsKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VwcG9ydC5sZXZlbCsrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHN1cHBvcnQud2F0ZXIrKztcblxuICAgICAgICAvLyBBbiBvdmVyaGFuZyBpcyB0ZXJyYWluIGFib3ZlIHRoZSBmbG9vciB0aGF0IHN1cnZpdmVzIHRoZSBjdXQgcGxhbmUuXG4gICAgICAgIC8vIEZvciBhIGNvbHVtbiBiZWxvdyB0aGUgZmxvb3IsIGl0cyBzb2xpZCBib2R5IGlzIGZpbGwsIG5vdCBvdmVyaGFuZy5cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBNYXRoLm1heChmbG9vclksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8IHN0YXJ0ICsgNDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGdldFZveGVsKHRoaXMud29ybGQsIHgsIHksIHopIGFzIE1hdElkO1xuICAgICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSBvdmVyaGFuZ0NlbGxzLnB1c2goeyB4LCB5LCB6LCBtYXRlcmlhbDogbSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IHJlY3Q6IHIsIGZsb29yWSwgc3RhdHMsIHN1cHBvcnQsIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLCBvdmVyaGFuZ0NlbGxzIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBtb3ZlbWVudCBjb250cmFjdCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtQYXJhbXMge1xuICBtYXhTdGVwVXA6IG51bWJlcjtcbiAgbWF4U3RlcERvd246IG51bWJlcjtcbiAgbWF4V2F0ZXJEZXB0aDogbnVtYmVyO1xuICAvKiogTWF4aW11bSBhZGphY2VudCBzdXJmYWNlIHN0ZXA7IDEuMCBpcyBhIDQ1IGRlZ3JlZSB2b3hlbCByaXNlci4gKi9cbiAgbWF4U2xvcGU6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1dBTEs6IFdhbGtQYXJhbXMgPSB7XG4gIG1heFN0ZXBVcDogMS4wLFxuICBtYXhTdGVwRG93bjogMS41LFxuICBtYXhXYXRlckRlcHRoOiAwLjQsXG4gIG1heFNsb3BlOiAxLjAsXG4gIGNsZWFyYW5jZTogMi4wLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXYWxrUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIHJlYXNvbjogJ29rJyB8ICdub3RfYWRqYWNlbnQnIHwgJ3N0ZXBfdXAnIHwgJ2ZhbGwnIHwgJ3dhdGVyJyB8ICdzbG9wZScgfCAnY2xlYXJhbmNlJztcbiAgc3RlcDogbnVtYmVyO1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG59XG5cbi8qKiBFdmFsdWF0ZSBvbmUgZ3JpZCBzdGVwLiBQYXRocyBhcmUgdmFsaWRhdGVkIHdpdGggdGhlIHNhbWUgY29udHJhY3QuICovXG5leHBvcnQgZnVuY3Rpb24gd2Fsa1N0ZXAoXG4gIHdvcmxkOiBXb3JsZCwgZnJvbVg6IG51bWJlciwgZnJvbVo6IG51bWJlciwgdG9YOiBudW1iZXIsIHRvWjogbnVtYmVyLFxuICBwYXJhbXM6IFdhbGtQYXJhbXMgPSBERUZBVUxUX1dBTEssXG4pOiBXYWxrUmVzdWx0IHtcbiAgY29uc3QgZHggPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWCkgLSBNYXRoLmZsb29yKGZyb21YKSk7XG4gIGNvbnN0IGR6ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1opIC0gTWF0aC5mbG9vcihmcm9tWikpO1xuICBpZiAoZHggKyBkeiAhPT0gMSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnbm90X2FkamFjZW50Jywgc3RlcDogMCwgd2F0ZXJEZXB0aDogMCB9O1xuICB9XG4gIGNvbnN0IGZyb20gPSBjb2x1bW5BdCh3b3JsZCwgZnJvbVgsIGZyb21aKTtcbiAgY29uc3QgdG8gPSBjb2x1bW5BdCh3b3JsZCwgdG9YLCB0b1opO1xuICBjb25zdCBzdGVwID0gdG8uc3VyZmFjZVkgLSBmcm9tLnN1cmZhY2VZO1xuICBpZiAoc3RlcCA+IHBhcmFtcy5tYXhTdGVwVXApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RlcF91cCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKC1zdGVwID4gcGFyYW1zLm1heFN0ZXBEb3duKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2ZhbGwnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by53YXRlckRlcHRoID4gcGFyYW1zLm1heFdhdGVyRGVwdGgpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnd2F0ZXInLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by5zbG9wZSA+IHBhcmFtcy5tYXhTbG9wZSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzbG9wZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKCFjbGVhcmFuY2VBdCh3b3JsZCwgdG9YLCB0b1osIHBhcmFtcy5jbGVhcmFuY2UpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdjbGVhcmFuY2UnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHJlYXNvbjogJ29rJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xufVxuXG4vKiogRWZmZWN0aXZlIGdyYWRlIG9mIGEgc3RyYWlnaHQgcGF0aCBzZWdtZW50LCB1c2VkIGJ5IHBhdGggdmFsaWRhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZmZlY3RpdmVHcmFkZSh3b3JsZDogV29ybGQsIHgwOiBudW1iZXIsIHowOiBudW1iZXIsIHgxOiBudW1iZXIsIHoxOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBhID0gY29sdW1uQXQod29ybGQsIHgwLCB6MCk7XG4gIGNvbnN0IGIgPSBjb2x1bW5BdCh3b3JsZCwgeDEsIHoxKTtcbiAgY29uc3QgcnVuID0gTWF0aC5oeXBvdCh4MSAtIHgwLCB6MSAtIHowKTtcbiAgaWYgKHJ1biA9PT0gMCkgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKTtcbiAgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKSAvIHJ1bjtcbn1cbiIsICIvLyBDaGFyYWN0ZXIgbW92ZW1lbnQgcnVsZXMgXHUyMDE0IHB1cmUgVHlwZVNjcmlwdCwgbm8gdGhyZWUuanMgKEQtMDA1KS5cbi8vXG4vLyBBIGNoYXJhY3RlciBpcyBhIHZlcnRpY2FsIGJveCAocmFkaXVzIDAuMyBtLCBoZWlnaHQgMS43IG0pIG1vdmluZyB0aHJvdWdoXG4vLyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbCB2b2x1bWUsIG5hdHVyYWwgZW50aXRpZXMgYW5kIHN0cnVjdHVyZSBtb2R1bGVzLlxuLy8gU3RlcHBpbmcgaXMgYSBkZXRlcm1pbmlzdGljIGZpeGVkLXN0ZXAgZnVuY3Rpb24gb2YgKHN0YXRlLCBpbnB1dCwgd29ybGQpOlxuLy8gcHJlc2VudGF0aW9uIChtZXNoZXMsIGFuaW1hdGlvbiwgY2FtZXJhKSBvbmx5ICpyZWFkcyogdGhlIHJlc3VsdGluZyBzdGF0ZS5cbi8vXG4vLyBNb3ZlbWVudCBuZXZlciBnZW5lcmF0ZXMgdGVycmFpbi4gRXZlcnkgcXVlcnkgZ29lcyB0aHJvdWdoIHRoZSByZXNpZGVudC1vbmx5XG4vLyB2b3hlbCBhY2Nlc3NvcnM7IGFuIHVubG9hZGVkIGNvbHVtbiBpcyB0cmVhdGVkIGFzIGEgd2FsbCwgc28gYSBjaGFyYWN0ZXJcbi8vIGNhbm5vdCBvdXRydW4gc3RyZWFtaW5nIG9yIGNhdXNlIHVuYm91bmRlZCBjaHVuayBnZW5lcmF0aW9uLlxuLy9cbi8vIE1vdmVtZW50IGlzIGxvY2FsIHByZXNlbnRhdGlvbi10aWVyIHN0YXRlIGZvciBub3cgKHRoZSBsb2NhbCBmb3VuZGVyKS4gV2hlblxuLy8gcG9zaXRpb25zIHN0YXJ0IHRvIGdhdGUgZ2FtZXBsYXkgKHJlYWNoIGNoZWNrcywgTlBDIHdvcmssIG11bHRpcGxheWVyKSwgdGhlXG4vLyBzYW1lIHN0ZXAgZnVuY3Rpb24gYmVjb21lcyB0aGUgYXV0aG9yaXRhdGl2ZSBydWxlLCBkcml2ZW4gYnkgam91cm5hbGVkIGlucHV0LlxuaW1wb3J0IHtcbiAgV29ybGQsIE1BVCwgaXNTb2xpZCwgcmVzaWRlbnRWb3hlbEF0LCBjaHVua0tleSwgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWixcbiAgaXNSZXRpcmVkU3RvbmVLaW5kLCBZX01JTiwgaHlkcm9sb2d5Rm9yLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB0eXBlIHsgQWN0aXZlRW50aXR5S2luZCB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgT0JTVFJVQ1RJT05fUkFESVVTIH0gZnJvbSAnLi90ZXJyYWluJztcbi8vIE0wMTA6IGEgc2FwbGluZydzIHRydW5rIGlzIHRoaW5uZXIgdGhhbiBhIG1hdHVyZSB0cmVlJ3MgKHRoZSBzdGFnZSB0aGUgcmVuZGVyZXIgZHJhd3MpLlxuaW1wb3J0IHsgU1RBR0VfVFJVTkssIGdyb3d0aFN0YWdlIH0gZnJvbSAnLi92ZWdldGF0aW9uJztcblxuZXhwb3J0IGNvbnN0IENIQVJBQ1RFUl9SQURJVVMgPSAwLjM7XG5leHBvcnQgY29uc3QgQ0hBUkFDVEVSX0hFSUdIVCA9IDEuNztcbmV4cG9ydCBjb25zdCBGSVhFRF9TVEVQID0gMSAvIDMwO1xuZXhwb3J0IGNvbnN0IFdBTEtfU1BFRUQgPSA0LjI7XG5leHBvcnQgY29uc3QgUlVOX1NQRUVEID0gNy41O1xuLyoqIFdhZGluZyBzcGVlZCBhdCBrbmVlIGRlcHRoOyBkZWVwZXIgd2F0ZXIgc2xvd3MgdGhlIHdhbGsgZnVydGhlci4gKi9cbmV4cG9ydCBjb25zdCBXQURFX1NQRUVEID0gMy40O1xuLyoqIFN3aW1taW5nIGF0IHRoZSBzdXJmYWNlLCB1bmRlcndhdGVyLCBhbmQgd2hlbiBleGhhdXN0ZWQgKG0vcykuICovXG5leHBvcnQgY29uc3QgU1dJTV9TUEVFRCA9IDIuNDtcbmV4cG9ydCBjb25zdCBESVZFX1NQRUVEID0gMS45O1xuZXhwb3J0IGNvbnN0IEVYSEFVU1RFRF9TV0lNX1NQRUVEID0gMS4wO1xuZXhwb3J0IGNvbnN0IEpVTVBfU1BFRUQgPSA2LjY7XG4vKiogQSBzZWNvbmQgdGFwIHdoaWxlIGFpcmJvcm5lIGxhdW5jaGVzIGFnYWluIGF0IHRoaXMgc3BlZWQgKGEgaGlnaGVyIHRvdGFsIGp1bXAsIGVub3VnaCB0byBsZWF2ZSBhIHR3by12b3hlbCBob2xlKS4gKi9cbmV4cG9ydCBjb25zdCBET1VCTEVfSlVNUF9TUEVFRCA9IDguNDtcbi8qKlxuICogV2F0ZXIgZHJhZ3MgYSBqdW1wIGZyb20gYSB3YWRpbmcgYmVkICh3YXMgMC43LCBhIDAuNDkgbSBob3Agd2hvc2Ugd2hvbGVcbiAqIGRlc2NlbnQgZmVsbCBpbnNpZGUgdGhlIGxhbmRpbmcgYnVmZmVyOyAwLjg1IGdpdmVzIGFib3V0IDAuNzIgbSwgbGVhdmluZyBhXG4gKiB1c2FibGUgd2luZG93IGZvciB0aGUgc2Vjb25kIHRhcCkuXG4gKi9cbmV4cG9ydCBjb25zdCBXQURFX0pVTVBfRkFDVE9SID0gMC44NTtcbi8qKiBBIHRhcCB0aGlzIGNsb3NlIHRvIHRoZSBncm91bmQgKG0pIHdoaWxlIGZhbGxpbmcgaXMgYnVmZmVyZWQgYXMgYSBncm91bmQganVtcC4gKi9cbmNvbnN0IEpVTVBfQlVGRkVSX1JFQUNIID0gMC42O1xuY29uc3QgSlVNUF9CVUZGRVJfVElNRSA9IDAuMTU7XG5leHBvcnQgY29uc3QgR1JBVklUWSA9IDIyO1xuLyoqIEhpZ2hlc3QgbGVkZ2UgY2xpbWJlZCB3aXRob3V0IGp1bXBpbmcgKG9uZSB2b3hlbCBwbHVzIHRvbGVyYW5jZSkuICovXG5leHBvcnQgY29uc3QgU1RFUF9IRUlHSFQgPSAxLjA1O1xuLyoqIFdhdGVyIGRlZXBlciB0aGFuIHRoaXMgYXQgdGhlIGZlZXQgbWFrZXMgdGhlIGNoYXJhY3RlciBzd2ltIChjaGVzdCBkZWVwKS4gKi9cbmV4cG9ydCBjb25zdCBTV0lNX0RFUFRIID0gMS4zNTtcbi8qKiBFeWUgaGVpZ2h0IGFib3ZlIHRoZSBmZWV0OyB0aGUgaGVhZCBpcyB1bmRlcndhdGVyIHdoZW4gdGhlIHN1cmZhY2UgaXMgYWJvdmUgaXQuICovXG5leHBvcnQgY29uc3QgRVlFX0hFSUdIVCA9IDEuNTtcbi8qKlxuICogQnVveWFuY3kgKE0wMTEpOiBhIHN3aW1tZXIgYXQgcmVzdCBmbG9hdHMgd2l0aCB0aGUgZmVldCB0aGlzIGZhciBiZWxvdyB0aGVcbiAqIHN1cmZhY2UsIHNvIHRoZSB3YXRlciBsaW5lIHNpdHMgYXQgdGhlIHVwcGVyIGNoZXN0IGFuZCB0aGUgZXllcyBhcmVcbiAqIEVZRV9IRUlHSFQgLSBGTE9BVF9ERVBUSCA9IDAuMiBtIGNsZWFyLiAoQmVmb3JlIE0wMTEgdGhlIGZsb2F0IGxpbmUgcHV0IHRoZVxuICogZXllcyBvbmx5IDAuMDggbSBjbGVhciBhbmQgdGhlIGRyYXduIGZpZ3VyZSdzIGhlYWQgMC4zIG0gdW5kZXIgdGhlIGRyYXduXG4gKiB3YXRlci4pXG4gKi9cbmV4cG9ydCBjb25zdCBGTE9BVF9ERVBUSCA9IDEuMztcbi8qKiBBbiBleGhhdXN0ZWQgc3dpbW1lciBzdGlsbCBmbG9hdHMsIGxvd2VyOiB3YXRlciBhdCB0aGUgY2hpbiwgZXllcyBqdXN0IGNsZWFyLiAqL1xuZXhwb3J0IGNvbnN0IEVYSEFVU1RFRF9GTE9BVF9ERVBUSCA9IDEuNDI7XG4vKiogSG9sZGluZyBKdW1wIGF0IHRoZSBzdXJmYWNlIGxpZnRzIHRoZSBoZWFkIHRoaXMgbXVjaCBoaWdoZXIgKGEga2ljayB1cCB0byBsb29rIG9yIHJlYWNoIGEgYmFuaykuICovXG5leHBvcnQgY29uc3QgU1VSRkFDRV9MSUZUID0gMC4xODtcbi8qKiBWZXJ0aWNhbCBzd2ltbWluZyBzcGVlZHMgKG0vcyk6IGRpdmUgZG93biwgc3dpbSB1cCAoSnVtcCBoZWxkKSwgcGFzc2l2ZSBidW95YW50IHJpc2UuICovXG5leHBvcnQgY29uc3QgRElWRV9ET1dOX1NQRUVEID0gMi4wO1xuZXhwb3J0IGNvbnN0IFNXSU1fVVBfU1BFRUQgPSAyLjY7XG5leHBvcnQgY29uc3QgQlVPWUFOVF9SSVNFX1NQRUVEID0gMS4xO1xuLyoqIEhpZ2hlc3QgYmFuayBhIHN3aW1tZXIgYXQgdGhlIHN1cmZhY2UgY2FuIGhhdWwgb3V0IG9udG8uICovXG5leHBvcnQgY29uc3QgU1dJTV9DTElNQiA9IDIuMjtcblxuLy8gLS0tLSB2aXRhbHMgKE1pbmVjcmFmdC1saWtlIHRpbWluZ3MsIGluIHNlY29uZHMpIC0tLS1cbmV4cG9ydCBjb25zdCBNQVhfSEVBTFRIID0gMTAwO1xuLyoqIEJyZWF0aCBsYXN0cyB0aGlzIGxvbmcgd2l0aCB0aGUgaGVhZCB1bmRlcndhdGVyLCB0aGVuIGRyb3duaW5nIHN0YXJ0cy4gKi9cbmV4cG9ydCBjb25zdCBCUkVBVEhfU0VDT05EUyA9IDE1O1xuLyoqIFNlY29uZHMgdG8gcmVmaWxsIGJyZWF0aCBmcm9tIGVtcHR5IG9uY2UgdGhlIGhlYWQgaXMgYWJvdmUgd2F0ZXIuICovXG5leHBvcnQgY29uc3QgQlJFQVRIX1JFRklMTF9TRUNPTkRTID0gMi41O1xuLyoqIEhlYWx0aCBsb3N0IHBlciBzZWNvbmQgd2hpbGUgZHJvd25pbmcgKDEwIHMgZnJvbSBmdWxsIGhlYWx0aCB0byBkZWF0aCkuICovXG5leHBvcnQgY29uc3QgRFJPV05fREFNQUdFX1BFUl9TID0gMTA7XG4vKipcbiAqIFN0YW1pbmE6IGFjdGl2ZSBzd2ltbWluZyAoc3Ryb2tlcywgZGl2aW5nLCBzd2ltbWluZyB1cCkgbGFzdHMgNDAgczsgZmxvYXRpbmdcbiAqIGF0IHJlc3Qgd2l0aCB0aGUgaGVhZCBvdXQgcmVjb3ZlcnMgaXQgaW4gRkxPQVRfUkVDT1ZFUl9TRUNPTkRTOyA4IHMgb24gbGFuZC5cbiAqIChCZWZvcmUgTTAxMSB0cmVhZGluZyB3YXRlciBhdCByZXN0IGRyYWluZWQgaXQgaW4gNjAgcyBhbmQgYW4gZXhoYXVzdGVkXG4gKiBzd2ltbWVyIHNhbmsgYW5kIGRyb3duZWQsIHdoaWNoIGlzIHdoYXQgZHJhaW5lZCB0aGUgb3duZXIncyBsaWZlIGF0IHRoZVxuICogc3VyZmFjZS4pXG4gKi9cbmV4cG9ydCBjb25zdCBTV0lNX1NUQU1JTkFfU0VDT05EUyA9IDQwO1xuZXhwb3J0IGNvbnN0IEZMT0FUX1JFQ09WRVJfU0VDT05EUyA9IDMwO1xuZXhwb3J0IGNvbnN0IFNUQU1JTkFfUkVDT1ZFUl9TRUNPTkRTID0gODtcbi8qKiBIZWFsdGggcmVnZW5lcmF0ZXMgYWZ0ZXIgdGhpcyBsb25nIHdpdGhvdXQgZGFtYWdlLCBhdCBIRUFMVEhfUkVHRU5fUEVSX1MuICovXG5leHBvcnQgY29uc3QgSEVBTFRIX1JFR0VOX0RFTEFZID0gNDtcbmV4cG9ydCBjb25zdCBIRUFMVEhfUkVHRU5fUEVSX1MgPSAzO1xuLyoqIFJpdmVyIGN1cnJlbnRzIHB1c2ggc3dpbW1lcnMgYXQgdGhpcyBmcmFjdGlvbiBvZiB0aGUgc3VyZmFjZSBmbG93ICh3YWRlcnMgbGVzcykuICovXG5leHBvcnQgY29uc3QgU1dJTV9DVVJSRU5UX0ZBQ1RPUiA9IDAuNTtcbmV4cG9ydCBjb25zdCBXQURFX0NVUlJFTlRfRkFDVE9SID0gMC4yO1xuXG5leHBvcnQgaW50ZXJmYWNlIENoYXJhY3RlclN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgdno6IG51bWJlcjtcbiAgLyoqIEZhY2luZyBhbmdsZSAocmFkaWFucywgMCA9ICt6KSwgdHVybnMgdG93YXJkIG1vdGlvbi4gKi9cbiAgaGVhZGluZzogbnVtYmVyO1xuICBncm91bmRlZDogYm9vbGVhbjtcbiAgLyoqICdncm91bmQnIHwgJ3dhZGUnIHwgJ3N3aW0nIHwgJ2FpcicgXHUyMDE0IHRoZSBsb2NvbW90aW9uIHJlZ2ltZSB0aGlzIHN0ZXAuICovXG4gIG1vZGU6ICdncm91bmQnIHwgJ3dhZGUnIHwgJ3N3aW0nIHwgJ2Fpcic7XG4gIC8qKiBIb3Jpem9udGFsIHNwZWVkIGFjdHVhbGx5IGFjaGlldmVkIHRoaXMgc3RlcCAobS9zKSwgZm9yIGFuaW1hdGlvbi4gKi9cbiAgc3BlZWQ6IG51bWJlcjtcbiAgLyoqIDAuLk1BWF9IRUFMVEguIFJlYWNoaW5nIDAgc2V0cyBgZGVhZGAuICovXG4gIGhlYWx0aDogbnVtYmVyO1xuICAvKiogMC4uMSBhaXIgbGVmdCB3aGlsZSB0aGUgaGVhZCBpcyB1bmRlcndhdGVyLiAqL1xuICBicmVhdGg6IG51bWJlcjtcbiAgLyoqIDAuLjEgc3RyZW5ndGggZm9yIHN0YXlpbmcgYWZsb2F0OyBhdCAwIHRoZSBzd2ltbWVyIHNpbmtzLiAqL1xuICBzdGFtaW5hOiBudW1iZXI7XG4gIC8qKiBFeWVzIGJlbG93IHRoZSB3YXRlciBzdXJmYWNlIHRoaXMgc3RlcC4gKi9cbiAgaGVhZFVuZGVyd2F0ZXI6IGJvb2xlYW47XG4gIC8qKiBXYXRlciBzdXJmYWNlIG92ZXIgdGhlIGZlZXQgY29sdW1uIChmZWV0IHkgd2hlbiBkcnkpLiAqL1xuICB3YXRlclN1cmZhY2U6IG51bWJlcjtcbiAgLyoqIFNlY29uZHMgc2luY2UgdGhlIGxhc3QgZGFtYWdlIChnYXRlcyBoZWFsdGggcmVnZW5lcmF0aW9uKS4gKi9cbiAgY2FsbTogbnVtYmVyO1xuICAvKiogRGFtYWdlIHRha2VuIHRoaXMgc3RlcCwgZm9yIHByZXNlbnRhdGlvbiAoZmxhc2gsIHNvdW5kKS4gKi9cbiAgaHVydDogbnVtYmVyO1xuICBkZWFkOiBib29sZWFuO1xuICAvKiogV2hhdCBraWxsZWQgdGhlIGNoYXJhY3RlciwgaWYgZGVhZC4gKi9cbiAgY2F1c2U6ICdkcm93bmVkJyB8IG51bGw7XG4gIC8qKiBUcnVlIG9uY2UgdGhlIG1pZC1haXIgc2Vjb25kIGp1bXAgaGFzIGJlZW4gc3BlbnQ7IGNsZWFyZWQgb24gbGFuZGluZyBvciBpbiB3YXRlci4gKi9cbiAgYWlySnVtcFVzZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIHdoaWxlIGFpcmJvcm5lIGFmdGVyIGEgcmVhbCBncm91bmQganVtcCAodGhlIGFpciBqdW1wIG5lZWRzIHRoaXMsIHNvIHN0ZXBwaW5nIG9mZiBhIGxlZGdlIGdpdmVzIG5vbmUpLiAqL1xuICBqdW1wZWQ6IGJvb2xlYW47XG4gIC8qKiBTZWNvbmRzIGxlZnQgb24gYSBKdW1wIHRhcCBtYWRlIGp1c3QgYmVmb3JlIGxhbmRpbmc7IGl0IGZpcmVzIGFzIGEgbm9ybWFsIGdyb3VuZCBqdW1wIG9uIHRvdWNoZG93bi4gKi9cbiAganVtcEJ1ZmZlcjogbnVtYmVyO1xuICAvKiogTGFzdCBkcnkgc3RhbmRpbmcgcG9zaXRpb246IHdoZXJlIGEgZGVhZCBjaGFyYWN0ZXIgcmVzcGF3bnMuICovXG4gIHNhZmU6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENoYXJhY3RlcklucHV0IHtcbiAgLyoqIFdvcmxkLXNwYWNlIGRlc2lyZWQgZGlyZWN0aW9uIChuZWVkIG5vdCBiZSBub3JtYWxpc2VkOyBsZW5ndGggPD0gMSBzY2FsZXMgc3BlZWQpLiAqL1xuICBtb3ZlWDogbnVtYmVyO1xuICBtb3ZlWjogbnVtYmVyO1xuICBydW46IGJvb2xlYW47XG4gIC8qKiBKdW1wIHByZXNzZWQgdGhpcyBzdGVwIChvbmUtc2hvdCkuICovXG4gIGp1bXA6IGJvb2xlYW47XG4gIC8qKiBKdW1wIGhlbGQ6IHN3aW0gdXB3YXJkLiAqL1xuICByaXNlPzogYm9vbGVhbjtcbiAgLyoqIERpdmUgaGVsZDogc3dpbSBkb3dud2FyZC4gKi9cbiAgZGl2ZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDaGFyYWN0ZXIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgaGVhZGluZyA9IDApOiBDaGFyYWN0ZXJTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgeCwgeSwgeiwgdng6IDAsIHZ5OiAwLCB2ejogMCwgaGVhZGluZywgZ3JvdW5kZWQ6IGZhbHNlLCBtb2RlOiAnYWlyJywgc3BlZWQ6IDAsXG4gICAgaGVhbHRoOiBNQVhfSEVBTFRILCBicmVhdGg6IDEsIHN0YW1pbmE6IDEsIGhlYWRVbmRlcndhdGVyOiBmYWxzZSwgd2F0ZXJTdXJmYWNlOiB5LFxuICAgIGNhbG06IEhFQUxUSF9SRUdFTl9ERUxBWSwgaHVydDogMCwgZGVhZDogZmFsc2UsIGNhdXNlOiBudWxsLCBhaXJKdW1wVXNlZDogZmFsc2UsIGp1bXBlZDogZmFsc2UsIGp1bXBCdWZmZXI6IDAsIHNhZmU6IHsgeCwgeSwgeiB9LFxuICB9O1xufVxuXG4vKiogQSBmcmVzaCBjaGFyYWN0ZXIgYXQgaXRzIGxhc3Qgc2FmZSBzcG90IHdpdGggZnVsbCB2aXRhbHMuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzcGF3bkNoYXJhY3Rlcih3b3JsZDogV29ybGQsIGRlYWQ6IENoYXJhY3RlclN0YXRlKTogQ2hhcmFjdGVyU3RhdGUge1xuICBjb25zdCB7IHgsIHogfSA9IGRlYWQuc2FmZTtcbiAgY29uc3QgeSA9IGZpbmRTdGFuZGluZ1kod29ybGQsIHgsIHosIGRlYWQuc2FmZS55ICsgMikgPz8gZGVhZC5zYWZlLnk7XG4gIHJldHVybiBjcmVhdGVDaGFyYWN0ZXIoeCwgeSwgeiwgZGVhZC5oZWFkaW5nKTtcbn1cblxuLyoqIFNvbGlkIGZvciBtb3ZlbWVudDogdm94ZWxzLCBtaXNzaW5nICh1bmxvYWRlZCkgdGVycmFpbiwgb3IgdGhlIHdvcmxkIGZsb29yLiAqL1xuZnVuY3Rpb24gYmxvY2tlZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIHRydWU7XG4gIGNvbnN0IG0gPSByZXNpZGVudFZveGVsQXQod29ybGQsIHgsIHksIHopO1xuICByZXR1cm4gbSA9PT0gbnVsbCB8fCBpc1NvbGlkKG0pO1xufVxuXG5mdW5jdGlvbiB3YXRlcih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHJlc2lkZW50Vm94ZWxBdCh3b3JsZCwgeCwgeSwgeikgPT09IE1BVC5XQVRFUjtcbn1cblxuLyoqIFRydWUgd2hlbiB0aGUgY2hhcmFjdGVyJ3MgYm94IGF0ICh4LCB5LCB6KSBvdmVybGFwcyBzb2xpZCB2b3hlbHMuICovXG5leHBvcnQgZnVuY3Rpb24gb3ZlcmxhcHNUZXJyYWluKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCByID0gQ0hBUkFDVEVSX1JBRElVUyAtIDFlLTQ7XG4gIGNvbnN0IHgwID0gTWF0aC5mbG9vcih4IC0gciksIHgxID0gTWF0aC5mbG9vcih4ICsgcik7XG4gIGNvbnN0IHowID0gTWF0aC5mbG9vcih6IC0gciksIHoxID0gTWF0aC5mbG9vcih6ICsgcik7XG4gIGNvbnN0IHkwID0gTWF0aC5mbG9vcih5ICsgMWUtMyksIHkxID0gTWF0aC5mbG9vcih5ICsgQ0hBUkFDVEVSX0hFSUdIVCAtIDFlLTMpO1xuICBmb3IgKGxldCBjeSA9IHkwOyBjeSA8PSB5MTsgY3krKykge1xuICAgIGZvciAobGV0IGN6ID0gejA7IGN6IDw9IHoxOyBjeisrKSB7XG4gICAgICBmb3IgKGxldCBjeCA9IHgwOyBjeCA8PSB4MTsgY3grKykge1xuICAgICAgICBpZiAoYmxvY2tlZCh3b3JsZCwgY3gsIGN5LCBjeikpIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKiBTdHJ1Y3R1cmUgbW9kdWxlcyBhcmUgYm94ZXMgKHgveiBjZW50cmUsIHkgYm90dG9tKTsgb3B0aW9uYWwgeWF3IHJvdGF0aW9uLiAqL1xuZnVuY3Rpb24gb3ZlcmxhcHNTdHJ1Y3R1cmVzKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBmb3IgKGNvbnN0IHMgb2Ygd29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKSkge1xuICAgIGZvciAoY29uc3QgbSBvZiBzLm1vZHVsZXMpIHtcbiAgICAgIGlmIChtLmtpbmQgPT09ICdjcm9wX3JvdycpIGNvbnRpbnVlO1xuICAgICAgbGV0IHB4ID0geCAtIG0ueCwgcHogPSB6IC0gbS56O1xuICAgICAgaWYgKG0ucm90KSB7XG4gICAgICAgIGNvbnN0IGMgPSBNYXRoLmNvcygtbS5yb3QpLCBzbiA9IE1hdGguc2luKC1tLnJvdCk7XG4gICAgICAgIGNvbnN0IHJ4ID0gcHggKiBjIC0gcHogKiBzbiwgcnogPSBweCAqIHNuICsgcHogKiBjO1xuICAgICAgICBweCA9IHJ4OyBweiA9IHJ6O1xuICAgICAgfVxuICAgICAgaWYgKE1hdGguYWJzKHB4KSA8IG0udyAvIDIgKyBDSEFSQUNURVJfUkFESVVTICYmIE1hdGguYWJzKHB6KSA8IG0uZCAvIDIgKyBDSEFSQUNURVJfUkFESVVTXG4gICAgICAgICYmIHkgKyAwLjAyIDwgbS55ICsgbS5oICYmIHkgKyBDSEFSQUNURVJfSEVJR0hUID4gbS55ICsgMC4wMikgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqIEhpZ2hlc3Qgc3RydWN0dXJlIHRvcCB1bmRlciB0aGUgY2hhcmFjdGVyJ3MgZm9vdHByaW50IGF0IG9yIGJlbG93IGB5ICsgU1RFUF9IRUlHSFRgLiAqL1xuZnVuY3Rpb24gc3RydWN0dXJlRmxvb3Iod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGZsb29yID0gLUluZmluaXR5O1xuICBmb3IgKGNvbnN0IHMgb2Ygd29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKSkge1xuICAgIGZvciAoY29uc3QgbSBvZiBzLm1vZHVsZXMpIHtcbiAgICAgIGlmIChtLmtpbmQgPT09ICdjcm9wX3JvdycpIGNvbnRpbnVlO1xuICAgICAgbGV0IHB4ID0geCAtIG0ueCwgcHogPSB6IC0gbS56O1xuICAgICAgaWYgKG0ucm90KSB7XG4gICAgICAgIGNvbnN0IGMgPSBNYXRoLmNvcygtbS5yb3QpLCBzbiA9IE1hdGguc2luKC1tLnJvdCk7XG4gICAgICAgIGNvbnN0IHJ4ID0gcHggKiBjIC0gcHogKiBzbiwgcnogPSBweCAqIHNuICsgcHogKiBjO1xuICAgICAgICBweCA9IHJ4OyBweiA9IHJ6O1xuICAgICAgfVxuICAgICAgaWYgKE1hdGguYWJzKHB4KSA8IG0udyAvIDIgKyBDSEFSQUNURVJfUkFESVVTICogMC42ICYmIE1hdGguYWJzKHB6KSA8IG0uZCAvIDIgKyBDSEFSQUNURVJfUkFESVVTICogMC42KSB7XG4gICAgICAgIGNvbnN0IHRvcCA9IG0ueSArIG0uaDtcbiAgICAgICAgaWYgKHRvcCA8PSB5ICsgMC4wNSAmJiB0b3AgPiBmbG9vcikgZmxvb3IgPSB0b3A7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBmbG9vcjtcbn1cblxuZnVuY3Rpb24gb3ZlcmxhcHMod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBvdmVybGFwc1RlcnJhaW4od29ybGQsIHgsIHksIHopIHx8IG92ZXJsYXBzU3RydWN0dXJlcyh3b3JsZCwgeCwgeSwgeik7XG59XG5cbi8qKiBQdXNoIHRoZSBjaGFyYWN0ZXIgb3V0IG9mIHRyZWUgdHJ1bmtzLCBvcmUgYW5kIG90aGVyIG5hdHVyYWwgb2JzdHJ1Y3Rpb25zLiAqL1xuZnVuY3Rpb24gcmVzb2x2ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgczogQ2hhcmFjdGVyU3RhdGUpOiB2b2lkIHtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGguZmxvb3Iocy54KSksIGN6ID0gd29ybGRUb0NodW5rWihNYXRoLmZsb29yKHMueikpO1xuICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgZm9yIChsZXQgZHggPSAtMTsgZHggPD0gMTsgZHgrKykge1xuICAgICAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChjaHVua0tleShjeCArIGR4LCBjeiArIGR6KSk7XG4gICAgICBpZiAoIWlkcykgY29udGludWU7XG4gICAgICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgICAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgICAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8IGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhpZCkpIGNvbnRpbnVlO1xuICAgICAgICAvLyBDb2xsaWRlIHdpdGggdGhlIHRydW5rIG9yIGJvZHksIG5vdCB0aGUgY2Fub3B5IGZvb3RwcmludCB1c2VkIGZvciBjbGVhcmFuY2UuXG4gICAgICAgIGNvbnN0IGJvZHkgPSBlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlXycpID8gU1RBR0VfVFJVTktbZ3Jvd3RoU3RhZ2UoZSkgPz8gJ21hdHVyZSddICogZS5zY2FsZVxuICAgICAgICAgIDogKE9CU1RSVUNUSU9OX1JBRElVU1tlLmtpbmQgYXMgQWN0aXZlRW50aXR5S2luZF0gPz8gMC41KSAqIDAuNzUgKiBlLnNjYWxlO1xuICAgICAgICBpZiAoZS5raW5kID09PSAnc3R5bF9zaHJ1YicpIGNvbnRpbnVlO1xuICAgICAgICBpZiAocy55ID4gZS55ICsgMyB8fCBzLnkgKyBDSEFSQUNURVJfSEVJR0hUIDwgZS55KSBjb250aW51ZTtcbiAgICAgICAgY29uc3Qgb3ggPSBzLnggLSBlLngsIG96ID0gcy56IC0gZS56O1xuICAgICAgICBjb25zdCBkID0gTWF0aC5oeXBvdChveCwgb3opO1xuICAgICAgICBjb25zdCBtaW4gPSBib2R5ICsgQ0hBUkFDVEVSX1JBRElVUztcbiAgICAgICAgaWYgKGQgPj0gbWluIHx8IGQgPCAxZS02KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgcHVzaCA9IG1pbiAtIGQ7XG4gICAgICAgIGNvbnN0IG54ID0gcy54ICsgKG94IC8gZCkgKiBwdXNoLCBueiA9IHMueiArIChveiAvIGQpICogcHVzaDtcbiAgICAgICAgaWYgKCFvdmVybGFwcyh3b3JsZCwgbngsIHMueSwgbnopKSB7IHMueCA9IG54OyBzLnogPSBuejsgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIERlcHRoIG9mIHdhdGVyIG92ZXIgdGhlIGZlZXQ6IHRoZSB3YXRlciBzdXJmYWNlICh0b3Agb2YgdGhlIHdhdGVyIGNlbGxzIGluXG4gKiB0aGUgZmVldCBjb2x1bW4pIG1pbnVzIHRoZSBmZWV0IGhlaWdodC4gMCB3aGVuIHRoZSBmZWV0IGFyZSBkcnkuIFNlYXJjaGVzIGFcbiAqIGZldyBjZWxscyB1cCBzbyBhIGZ1bGx5IHN1Ym1lcmdlZCBkaXZlciBzdGlsbCBmaW5kcyB0aGUgc3VyZmFjZS5cbiAqL1xuZnVuY3Rpb24gZmVldFdhdGVyRGVwdGgod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgZnggPSBNYXRoLmZsb29yKHgpLCBmeiA9IE1hdGguZmxvb3Ioeik7XG4gIGxldCB0b3AgPSBNYXRoLmZsb29yKHkgKyAwLjA1KTtcbiAgaWYgKCF3YXRlcih3b3JsZCwgZngsIHRvcCwgZnopKSByZXR1cm4gMDtcbiAgd2hpbGUgKHdhdGVyKHdvcmxkLCBmeCwgdG9wICsgMSwgZnopICYmIHRvcCA8IHkgKyA0OCkgdG9wKys7XG4gIHJldHVybiB0b3AgKyAxIC0geTtcbn1cblxuY29uc3QgY2xhbXAwMSA9ICh2OiBudW1iZXIpID0+ICh2IDwgMCA/IDAgOiB2ID4gMSA/IDEgOiB2KTtcblxuLyoqIFN1cmZhY2UgY3VycmVudCBhdCBhIHdhdGVyIGNvbHVtbiAobS9zKSwgZnJvbSB0aGUgZGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kuICovXG5mdW5jdGlvbiBjdXJyZW50QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgc3VyZmFjZTogbnVtYmVyKTogeyBkeDogbnVtYmVyOyBkejogbnVtYmVyOyBzcGVlZDogbnVtYmVyIH0ge1xuICBjb25zdCBmID0gaHlkcm9sb2d5Rm9yKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKS5mbG93QXQoeCwgeiwgc3VyZmFjZSk7XG4gIHJldHVybiB7IGR4OiBmLmR4LCBkejogZi5keiwgc3BlZWQ6IGYuc3BlZWQgfTtcbn1cblxuLyoqXG4gKiBBZHZhbmNlIG9uZSBmaXhlZCBzdGVwLiBEZXRlcm1pbmlzdGljOiB0aGUgc2FtZSB3b3JsZCwgc3RhdGUgYW5kIGlucHV0IGdpdmVcbiAqIHRoZSBzYW1lIHJlc3VsdCBvbiBldmVyeSBtYWNoaW5lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RlcENoYXJhY3Rlcih3b3JsZDogV29ybGQsIHByZXY6IENoYXJhY3RlclN0YXRlLCBpbnB1dDogQ2hhcmFjdGVySW5wdXQsIGR0ID0gRklYRURfU1RFUCk6IENoYXJhY3RlclN0YXRlIHtcbiAgY29uc3QgczogQ2hhcmFjdGVyU3RhdGUgPSB7IC4uLnByZXYsIGh1cnQ6IDAgfTtcbiAgaWYgKHMuZGVhZCkge1xuICAgIC8vIEEgZGVhZCBjaGFyYWN0ZXIgZHJpZnRzIHRvIHJlc3Q7IHRoZSBjb250cm9sbGVyIGRlY2lkZXMgd2hlbiB0byByZXNwYXduLlxuICAgIHMudnggPSAwOyBzLnZ6ID0gMDsgcy5zcGVlZCA9IDA7XG4gICAgcmV0dXJuIHM7XG4gIH1cbiAgY29uc3QgZGVwdGggPSBmZWV0V2F0ZXJEZXB0aCh3b3JsZCwgcy54LCBzLnksIHMueik7XG4gIGNvbnN0IHN1cmZhY2UgPSBzLnkgKyBkZXB0aDtcbiAgLy8gU3dpbSB3aGVuIHRoZSB3YXRlciBpcyBjaGVzdCBkZWVwLCBvciB3aGVuIGFscmVhZHkgYWZsb2F0IGluIGRlZXAtaXNoIHdhdGVyLlxuICBjb25zdCBzd2ltbWluZyA9IGRlcHRoID49IFNXSU1fREVQVEggfHwgKGRlcHRoID4gMC45ICYmICFzLmdyb3VuZGVkICYmIHByZXYubW9kZSA9PT0gJ3N3aW0nKTtcbiAgY29uc3Qgd2FkaW5nID0gIXN3aW1taW5nICYmIGRlcHRoID4gMC4yO1xuICBjb25zdCBleGhhdXN0ZWQgPSBzLnN0YW1pbmEgPD0gMDtcbiAgY29uc3QgZmxvYXRZID0gc3VyZmFjZSAtIChleGhhdXN0ZWQgPyBFWEhBVVNURURfRkxPQVRfREVQVEggOiBGTE9BVF9ERVBUSCk7XG4gIGNvbnN0IGF0U3VyZmFjZSA9IHN3aW1taW5nICYmIHMueSA+PSBmbG9hdFkgLSAwLjM1O1xuXG4gIGxldCBteCA9IGlucHV0Lm1vdmVYLCBteiA9IGlucHV0Lm1vdmVaO1xuICBjb25zdCBsZW4gPSBNYXRoLmh5cG90KG14LCBteik7XG4gIGlmIChsZW4gPiAxKSB7IG14IC89IGxlbjsgbXogLz0gbGVuOyB9XG4gIGNvbnN0IHRhcmdldCA9IHN3aW1taW5nID8gKGV4aGF1c3RlZCA/IEVYSEFVU1RFRF9TV0lNX1NQRUVEIDogYXRTdXJmYWNlID8gU1dJTV9TUEVFRCA6IERJVkVfU1BFRUQpXG4gICAgOiB3YWRpbmcgPyBXQURFX1NQRUVEICogKDEgLSAwLjQ1ICogY2xhbXAwMSgoZGVwdGggLSAwLjIpIC8gKFNXSU1fREVQVEggLSAwLjIpKSlcbiAgICAgIDogaW5wdXQucnVuID8gUlVOX1NQRUVEIDogV0FMS19TUEVFRDtcbiAgbGV0IGRyaWZ0WCA9IDAsIGRyaWZ0WiA9IDA7XG4gIGlmIChzd2ltbWluZyB8fCB3YWRpbmcpIHtcbiAgICAvLyBSaXZlcnMgY2Fycnkgc3dpbW1lcnMgZG93bnN0cmVhbTsgd2FkZXJzIGZlZWwgaXQgaW4gcHJvcG9ydGlvbiB0byBkZXB0aC5cbiAgICBjb25zdCBjID0gY3VycmVudEF0KHdvcmxkLCBzLngsIHMueiwgc3VyZmFjZSk7XG4gICAgY29uc3QgayA9IHN3aW1taW5nID8gU1dJTV9DVVJSRU5UX0ZBQ1RPUiA6IFdBREVfQ1VSUkVOVF9GQUNUT1IgKiBjbGFtcDAxKGRlcHRoIC8gU1dJTV9ERVBUSCk7XG4gICAgZHJpZnRYID0gYy5keCAqIGMuc3BlZWQgKiBrOyBkcmlmdFogPSBjLmR6ICogYy5zcGVlZCAqIGs7XG4gIH1cbiAgY29uc3QgYWNjZWwgPSBzLmdyb3VuZGVkIHx8IHN3aW1taW5nID8gKHN3aW1taW5nID8gNSA6IDE0KSA6IDQ7XG4gIHMudnggKz0gKG14ICogdGFyZ2V0ICsgZHJpZnRYIC0gcy52eCkgKiBNYXRoLm1pbigxLCBhY2NlbCAqIGR0KTtcbiAgcy52eiArPSAobXogKiB0YXJnZXQgKyBkcmlmdFogLSBzLnZ6KSAqIE1hdGgubWluKDEsIGFjY2VsICogZHQpO1xuXG4gIGlmIChzd2ltbWluZykge1xuICAgIC8vIEJ1b3lhbmN5IHB1bGxzIHRoZSBib2R5IHRvd2FyZCBpdHMgZmxvYXQgbGluZSAod2F0ZXIgYXQgdGhlIGNoZXN0KTtcbiAgICAvLyB0aGUgcmVzcG9uc2UgaXMgc2xpZ2h0bHkgdW5kZXJkYW1wZWQsIHNvIGEgc3dpbW1lciBib2JzIGdlbnRseSBpbnRvXG4gICAgLy8gcGxhY2UuIEhvbGRpbmcgRGl2ZSBzdHJva2VzIGRvd24sIGhvbGRpbmcgSnVtcCBzdHJva2VzIHVwIChmYXN0ZXIgdGhhblxuICAgIC8vIGJ1b3lhbmN5IGFsb25lLCBhbmQgYSBsaXR0bGUgaGlnaGVyIGF0IHRoZSBzdXJmYWNlKS4gQW4gZXhoYXVzdGVkXG4gICAgLy8gc3dpbW1lciBjYW5ub3QgZGl2ZSBvciBraWNrIHVwIGJ1dCBzdGlsbCBmbG9hdHMsIGxvd2VyIGluIHRoZSB3YXRlci5cbiAgICBsZXQgd2FudFZ5OiBudW1iZXI7XG4gICAgaWYgKGlucHV0LmRpdmUgJiYgIWV4aGF1c3RlZCkgd2FudFZ5ID0gLURJVkVfRE9XTl9TUEVFRDtcbiAgICBlbHNlIGlmICgoaW5wdXQucmlzZSB8fCBpbnB1dC5qdW1wKSAmJiAhZXhoYXVzdGVkKSB7XG4gICAgICAvLyBGdWxsIHNwZWVkIGZyb20gZGVwdGgsIGVhc2luZyBvZmYgbmVhciB0aGUgdG9wIHNvIHRoZSBraWNrIGRvZXMgbm90IG92ZXJzaG9vdCBvdXQgb2YgdGhlIHdhdGVyLlxuICAgICAgd2FudFZ5ID0gTWF0aC5tYXgoLTEsIE1hdGgubWluKFNXSU1fVVBfU1BFRUQsIChmbG9hdFkgKyBTVVJGQUNFX0xJRlQgLSBzLnkpICogMi41KSk7XG4gICAgfSBlbHNlIHdhbnRWeSA9IE1hdGgubWF4KC0xLjQsIE1hdGgubWluKEJVT1lBTlRfUklTRV9TUEVFRCwgKGZsb2F0WSAtIHMueSkgKiAyLjUpKTtcbiAgICBzLnZ5ICs9ICh3YW50VnkgLSBzLnZ5KSAqIE1hdGgubWluKDEsIDMuNSAqIGR0KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCB3YW50SnVtcCA9IGlucHV0Lmp1bXAgfHwgcy5qdW1wQnVmZmVyID4gMDtcbiAgICBpZiAod2FudEp1bXAgJiYgcy5ncm91bmRlZCkge1xuICAgICAgcy52eSA9IHdhZGluZyA/IEpVTVBfU1BFRUQgKiBXQURFX0pVTVBfRkFDVE9SIDogSlVNUF9TUEVFRDsgcy5ncm91bmRlZCA9IGZhbHNlOyBzLmp1bXBlZCA9IHRydWU7IHMuanVtcEJ1ZmZlciA9IDA7XG4gICAgfSBlbHNlIGlmIChpbnB1dC5qdW1wKSB7XG4gICAgICBpZiAocy52eSA8PSAwICYmIChvdmVybGFwcyh3b3JsZCwgcy54LCBzLnkgLSBKVU1QX0JVRkZFUl9SRUFDSCwgcy56KSB8fCBzdHJ1Y3R1cmVGbG9vcih3b3JsZCwgcy54LCBzLnkgKyAwLjAyLCBzLnopID4gcy55IC0gSlVNUF9CVUZGRVJfUkVBQ0gpKSB7XG4gICAgICAgIC8vIEFib3V0IHRvIGxhbmQ6IHJlbWVtYmVyIHRoZSB0YXAgc28gaXQgYmVjb21lcyBhIG5vcm1hbCBncm91bmQganVtcC5cbiAgICAgICAgcy5qdW1wQnVmZmVyID0gSlVNUF9CVUZGRVJfVElNRTtcbiAgICAgIH0gZWxzZSBpZiAocy5qdW1wZWQgJiYgIXMuYWlySnVtcFVzZWQpIHtcbiAgICAgICAgLy8gQWxzbyBmcm9tIGEgd2FkaW5nIGp1bXAgKE0wMDkpOiBrbmVlLXRvLXdhaXN0IHdhdGVyIGluIGEgdHdvLXZveGVsXG4gICAgICAgIC8vIGhvbGUgdXNlZCB0byBiZSBhIHRyYXAsIGJlY2F1c2UgdGhlIGZlZXQgd2VyZSBzdGlsbCB3ZXQgd2hlbiB0aGVcbiAgICAgICAgLy8gc2Vjb25kIHRhcCBjYW1lIGFuZCB0aGUganVtcCBmbGFnIHdhcyBjbGVhcmVkIGV2ZXJ5IHdldCBzdGVwLlxuICAgICAgICAvLyBTZWNvbmQgdGFwIGluIHRoZSBhaXIgYWZ0ZXIgYSByZWFsIGp1bXA6IGEgc3Ryb25nZXIgbGF1bmNoLCBvbmNlIHBlciBqdW1wLlxuICAgICAgICBzLnZ5ID0gRE9VQkxFX0pVTVBfU1BFRUQ7IHMuYWlySnVtcFVzZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBzLnZ5IC09IEdSQVZJVFkgKiBkdDtcbiAgICBpZiAocy52eSA8IC00MCkgcy52eSA9IC00MDtcbiAgfVxuXG4gIC8vIEhvcml6b250YWw6IGF4aXMtc2VwYXJhdGVkIHdpdGggYXV0b21hdGljIHN0ZXAtdXAgb250byBsZWRnZXMuXG4gIGNvbnN0IHdhc0dyb3VuZGVkID0gcy5ncm91bmRlZDtcbiAgZm9yIChjb25zdCBheGlzIG9mIFsneCcsICd6J10gYXMgY29uc3QpIHtcbiAgICBjb25zdCBkZWx0YSA9IChheGlzID09PSAneCcgPyBzLnZ4IDogcy52eikgKiBkdDtcbiAgICBpZiAoZGVsdGEgPT09IDApIGNvbnRpbnVlO1xuICAgIGNvbnN0IG54ID0gYXhpcyA9PT0gJ3gnID8gcy54ICsgZGVsdGEgOiBzLng7XG4gICAgY29uc3QgbnogPSBheGlzID09PSAneicgPyBzLnogKyBkZWx0YSA6IHMuejtcbiAgICBpZiAoIW92ZXJsYXBzKHdvcmxkLCBueCwgcy55LCBueikpIHsgcy54ID0gbng7IHMueiA9IG56OyBjb250aW51ZTsgfVxuICAgIGlmICh3YXNHcm91bmRlZCB8fCBzd2ltbWluZyB8fCB3YWRpbmcpIHtcbiAgICAgIGNvbnN0IHN0ZXBZID0gTWF0aC5mbG9vcihzLnkgKyAxZS0zKSArIDE7XG4gICAgICBpZiAoc3RlcFkgLSBzLnkgPD0gU1RFUF9IRUlHSFQgJiYgIW92ZXJsYXBzKHdvcmxkLCBueCwgc3RlcFksIG56KSkge1xuICAgICAgICBzLnggPSBueDsgcy56ID0gbno7IHMueSA9IHN0ZXBZOyBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIC8vIEEgc3dpbW1lciBhdCB0aGUgc3VyZmFjZSBoYXVscyBvdXQgb250byBhIGJhbmsgdXAgdG8gU1dJTV9DTElNQiBhYm92ZSB0aGUgZmVldC5cbiAgICAgIGlmIChhdFN1cmZhY2UgJiYgIWV4aGF1c3RlZCkge1xuICAgICAgICBsZXQgY2xpbWJlZCA9IGZhbHNlO1xuICAgICAgICBmb3IgKGxldCBjeSA9IHN0ZXBZICsgMTsgY3kgLSBzLnkgPD0gU1dJTV9DTElNQjsgY3krKykge1xuICAgICAgICAgIGlmICghb3ZlcmxhcHMod29ybGQsIG54LCBjeSwgbnopICYmIG92ZXJsYXBzKHdvcmxkLCBueCwgY3kgLSAxLCBueikpIHtcbiAgICAgICAgICAgIHMueCA9IG54OyBzLnogPSBuejsgcy55ID0gY3k7IHMudnkgPSAwOyBjbGltYmVkID0gdHJ1ZTsgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjbGltYmVkKSBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIC8vIFN0cnVjdHVyZSB0b3BzIChzbGFicywgdGVycmFjZXMpIGFyZSBub3Qgb24gdGhlIHZveGVsIGdyaWQuXG4gICAgICBjb25zdCB0b3AgPSBzdHJ1Y3R1cmVGbG9vcih3b3JsZCwgbngsIHMueSArIFNURVBfSEVJR0hULCBueik7XG4gICAgICBpZiAodG9wID4gcy55ICYmIHRvcCAtIHMueSA8PSBTVEVQX0hFSUdIVCAmJiAhb3ZlcmxhcHMod29ybGQsIG54LCB0b3AsIG56KSkge1xuICAgICAgICBzLnggPSBueDsgcy56ID0gbno7IHMueSA9IHRvcDsgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChheGlzID09PSAneCcpIHMudnggPSAwOyBlbHNlIHMudnogPSAwO1xuICB9XG5cbiAgLy8gVmVydGljYWwuXG4gIGNvbnN0IG55ID0gcy55ICsgcy52eSAqIGR0O1xuICBpZiAoIW92ZXJsYXBzKHdvcmxkLCBzLngsIG55LCBzLnopKSB7XG4gICAgcy55ID0gbnk7XG4gICAgcy5ncm91bmRlZCA9IGZhbHNlO1xuICB9IGVsc2UgaWYgKHMudnkgPD0gMCkge1xuICAgIC8vIExhbmQgb24gdGhlIGhpZ2hlc3Qgc3VwcG9ydCBiZXR3ZWVuIG55IGFuZCB0aGUgY3VycmVudCBmZWV0LlxuICAgIGxldCBmbG9vciA9IE1hdGguZmxvb3Iocy55ICsgMWUtMyk7XG4gICAgd2hpbGUgKGZsb29yID4gbnkgLSAxICYmIG92ZXJsYXBzKHdvcmxkLCBzLngsIGZsb29yLCBzLnopKSBmbG9vcisrO1xuICAgIGNvbnN0IHN0cnVjdFRvcCA9IHN0cnVjdHVyZUZsb29yKHdvcmxkLCBzLngsIHMueSArIDAuMDUsIHMueik7XG4gICAgcy55ID0gTWF0aC5tYXgoZmxvb3IsIHN0cnVjdFRvcCA+IG55IC0gMC4wNSA/IHN0cnVjdFRvcCA6IC1JbmZpbml0eSk7XG4gICAgaWYgKG92ZXJsYXBzKHdvcmxkLCBzLngsIHMueSwgcy56KSkgcy55ID0gcHJldi55O1xuICAgIHMudnkgPSAwO1xuICAgIHMuZ3JvdW5kZWQgPSB0cnVlO1xuICB9IGVsc2Uge1xuICAgIHMudnkgPSAwO1xuICB9XG4gIC8vIFN1cHBvcnRlZCBieSBhIHN0cnVjdHVyZSB0b3AganVzdCBiZWxvdyAocGF0aCBzbGFicywgZmxvb3JzKS5cbiAgaWYgKCFzLmdyb3VuZGVkICYmIHMudnkgPD0gMCkge1xuICAgIGNvbnN0IHRvcCA9IHN0cnVjdHVyZUZsb29yKHdvcmxkLCBzLngsIHMueSArIDAuMDIsIHMueik7XG4gICAgaWYgKHRvcCA+IC1JbmZpbml0eSAmJiBzLnkgLSB0b3AgPCAwLjA2KSB7IHMueSA9IHRvcDsgcy52eSA9IDA7IHMuZ3JvdW5kZWQgPSB0cnVlOyB9XG4gIH1cblxuICByZXNvbHZlRW50aXRpZXMod29ybGQsIHMpO1xuICAvLyBMYW5kaW5nIChhbHNvIG9uIGEgd2FkaW5nIGJlZCkgb3Igc3dpbW1pbmcgcmUtYXJtcyB0aGUganVtcHM7IHdldCBmZWV0IGluIG1pZC1haXIgZG8gbm90LlxuICBpZiAocy5ncm91bmRlZCB8fCBzd2ltbWluZykgeyBzLmFpckp1bXBVc2VkID0gZmFsc2U7IHMuanVtcGVkID0gZmFsc2U7IH1cbiAgaWYgKHMuanVtcEJ1ZmZlciA+IDApIHMuanVtcEJ1ZmZlciA9IE1hdGgubWF4KDAsIHMuanVtcEJ1ZmZlciAtIGR0KTtcblxuICBjb25zdCBtb3ZlZCA9IE1hdGguaHlwb3Qocy54IC0gcHJldi54LCBzLnogLSBwcmV2LnopIC8gZHQ7XG4gIHMuc3BlZWQgPSBtb3ZlZDtcbiAgaWYgKE1hdGguaHlwb3QobXgsIG16KSA+IDAuMSkge1xuICAgIGNvbnN0IHdhbnQgPSBNYXRoLmF0YW4yKG14LCBteik7XG4gICAgbGV0IGQgPSB3YW50IC0gcy5oZWFkaW5nO1xuICAgIHdoaWxlIChkID4gTWF0aC5QSSkgZCAtPSBNYXRoLlBJICogMjtcbiAgICB3aGlsZSAoZCA8IC1NYXRoLlBJKSBkICs9IE1hdGguUEkgKiAyO1xuICAgIHMuaGVhZGluZyArPSBkICogTWF0aC5taW4oMSwgMTIgKiBkdCk7XG4gIH1cbiAgY29uc3QgZGVwdGhBZnRlciA9IGZlZXRXYXRlckRlcHRoKHdvcmxkLCBzLngsIHMueSwgcy56KTtcbiAgLy8gQSBzd2ltbWVyIHdob3NlIGZlZXQgYnJ1c2ggYSBzdWJtZXJnZWQgbGVkZ2Uga2VlcHMgc3dpbW1pbmcgb3ZlciBpdCAoTTAxMSk6XG4gIC8vIGxhbmRpbmcgb24gaXQgdXNlZCB0byBzd2l0Y2ggdG8gd2FkaW5nLCBhbmQgc3RlcHBpbmcgb2ZmIHRoZSBsZWRnZSB0aGVuXG4gIC8vIGRyb3BwZWQgdGhlIGZvdW5kZXIgdW5kZXIgdGhlIHN1cmZhY2Ugd2l0aCBmdWxsIGdyYXZpdHkuXG4gIGNvbnN0IGFmbG9hdCA9IGRlcHRoQWZ0ZXIgPj0gU1dJTV9ERVBUSCB8fCAoc3dpbW1pbmcgJiYgZGVwdGhBZnRlciA+IDAuOSk7XG4gIHMubW9kZSA9IGFmbG9hdCA/ICdzd2ltJyA6ICFzLmdyb3VuZGVkID8gJ2FpcicgOiBkZXB0aEFmdGVyID4gMC4yID8gJ3dhZGUnIDogJ2dyb3VuZCc7XG4gIGlmIChzLm1vZGUgPT09ICdzd2ltJykgcy5ncm91bmRlZCA9IGZhbHNlO1xuICBzLndhdGVyU3VyZmFjZSA9IHMueSArIGRlcHRoQWZ0ZXI7XG4gIGNvbnN0IHdvcmtpbmcgPSBNYXRoLmh5cG90KG14LCBteikgPiAwLjEgfHwgKCFleGhhdXN0ZWQgJiYgKCEhaW5wdXQuZGl2ZSB8fCAhIWlucHV0LnJpc2UgfHwgaW5wdXQuanVtcCkpO1xuICB1cGRhdGVWaXRhbHMocywgZGVwdGhBZnRlciwgd29ya2luZywgZHQpO1xuICByZXR1cm4gcztcbn1cblxuLyoqIEJyZWF0aCwgc3RhbWluYSBhbmQgaGVhbHRoIGZvciBvbmUgc3RlcC4gUHVyZSBhbmQgZGV0ZXJtaW5pc3RpYy4gKi9cbmZ1bmN0aW9uIHVwZGF0ZVZpdGFscyhzOiBDaGFyYWN0ZXJTdGF0ZSwgZGVwdGg6IG51bWJlciwgd29ya2luZzogYm9vbGVhbiwgZHQ6IG51bWJlcik6IHZvaWQge1xuICAvLyBCcmVhdGggaXMgbG9zdCBvbmx5IHdoaWxlIHRoZSBleWVzIGFyZSBiZWxvdyB0aGUgc3VyZmFjZS5cbiAgcy5oZWFkVW5kZXJ3YXRlciA9IGRlcHRoID4gRVlFX0hFSUdIVDtcbiAgcy5icmVhdGggPSBzLmhlYWRVbmRlcndhdGVyID8gTWF0aC5tYXgoMCwgcy5icmVhdGggLSBkdCAvIEJSRUFUSF9TRUNPTkRTKVxuICAgIDogTWF0aC5taW4oMSwgcy5icmVhdGggKyBkdCAvIEJSRUFUSF9SRUZJTExfU0VDT05EUyk7XG4gIGlmIChzLm1vZGUgPT09ICdzd2ltJykge1xuICAgIGlmICh3b3JraW5nKSBzLnN0YW1pbmEgPSBNYXRoLm1heCgwLCBzLnN0YW1pbmEgLSBkdCAvIFNXSU1fU1RBTUlOQV9TRUNPTkRTKTtcbiAgICBlbHNlIGlmICghcy5oZWFkVW5kZXJ3YXRlcikgcy5zdGFtaW5hID0gTWF0aC5taW4oMSwgcy5zdGFtaW5hICsgZHQgLyBGTE9BVF9SRUNPVkVSX1NFQ09ORFMpO1xuICB9IGVsc2UgaWYgKHMubW9kZSA9PT0gJ2dyb3VuZCcpIHMuc3RhbWluYSA9IE1hdGgubWluKDEsIHMuc3RhbWluYSArIGR0IC8gU1RBTUlOQV9SRUNPVkVSX1NFQ09ORFMpO1xuXG4gIGxldCBkYW1hZ2UgPSAwO1xuICBpZiAocy5oZWFkVW5kZXJ3YXRlciAmJiBzLmJyZWF0aCA8PSAwKSBkYW1hZ2UgKz0gRFJPV05fREFNQUdFX1BFUl9TICogZHQ7XG4gIGlmIChkYW1hZ2UgPiAwKSB7XG4gICAgcy5oZWFsdGggPSBNYXRoLm1heCgwLCBzLmhlYWx0aCAtIGRhbWFnZSk7XG4gICAgcy5odXJ0ID0gZGFtYWdlO1xuICAgIHMuY2FsbSA9IDA7XG4gICAgaWYgKHMuaGVhbHRoIDw9IDApIHsgcy5kZWFkID0gdHJ1ZTsgcy5jYXVzZSA9ICdkcm93bmVkJzsgcy52eCA9IDA7IHMudnogPSAwOyB9XG4gIH0gZWxzZSB7XG4gICAgcy5jYWxtICs9IGR0O1xuICAgIGlmIChzLmNhbG0gPj0gSEVBTFRIX1JFR0VOX0RFTEFZICYmICFzLmhlYWRVbmRlcndhdGVyKSBzLmhlYWx0aCA9IE1hdGgubWluKE1BWF9IRUFMVEgsIHMuaGVhbHRoICsgSEVBTFRIX1JFR0VOX1BFUl9TICogZHQpO1xuICB9XG4gIC8vIFJlbWVtYmVyIGRyeSBmb290aW5nIGFzIHRoZSByZXNwYXduIHBvaW50LlxuICBpZiAocy5tb2RlID09PSAnZ3JvdW5kJyAmJiBzLmdyb3VuZGVkICYmIGRlcHRoID09PSAwKSBzLnNhZmUgPSB7IHg6IHMueCwgeTogcy55LCB6OiBzLnogfTtcbn1cblxuLyoqXG4gKiBUcnVlIHdoZW4gYSBjaGFyYWN0ZXIgY291bGQgc3RhbmQgc3RpbGwgYXQgKHgsIHksIHopOiByZXNpZGVudCBzb2xpZCBncm91bmRcbiAqIHVuZGVyIHRoZSBmZWV0LCB0aGUgYm94IGNsZWFyIG9mIHZveGVscywgc3RydWN0dXJlcyBhbmQgdHJlZSB0cnVua3MgLyByb2NrcyxcbiAqIGFuZCBkcnkgZmVldCAobm8gd2F0ZXIgaW4gdGhlIGZlZXQgb3IgaGVhZCBjZWxscykuIFVzZWQgdG8gcGxhY2UgYSByZXR1cm5pbmdcbiAqIGNoYXJhY3RlciBuZXh0IHRvIGEgYmFubmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2FuU3RhbmRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgZnggPSBNYXRoLmZsb29yKHgpLCBmeiA9IE1hdGguZmxvb3IoeiksIGZ5ID0gTWF0aC5mbG9vcih5ICsgMWUtMyk7XG4gIGNvbnN0IGJlbG93ID0gcmVzaWRlbnRWb3hlbEF0KHdvcmxkLCBmeCwgZnkgLSAxLCBmeik7XG4gIGlmIChiZWxvdyA9PT0gbnVsbCB8fCAhaXNTb2xpZChiZWxvdykpIHJldHVybiBmYWxzZTtcbiAgaWYgKG92ZXJsYXBzKHdvcmxkLCB4LCB5LCB6KSkgcmV0dXJuIGZhbHNlO1xuICBmb3IgKGxldCBjeSA9IGZ5OyBjeSA8PSBNYXRoLmZsb29yKHkgKyBDSEFSQUNURVJfSEVJR0hUIC0gMWUtMyk7IGN5KyspIGlmICh3YXRlcih3b3JsZCwgZngsIGN5LCBmeikpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKGZ4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKGZ6KTtcbiAgZm9yIChsZXQgZHogPSAtMTsgZHogPD0gMTsgZHorKykge1xuICAgIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIHtcbiAgICAgIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoY2h1bmtLZXkoY3ggKyBkeCwgY3ogKyBkeikpO1xuICAgICAgaWYgKCFpZHMpIGNvbnRpbnVlO1xuICAgICAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICAgICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICAgIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCBpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpIHx8IGUua2luZCA9PT0gJ3N0eWxfc2hydWInKSBjb250aW51ZTtcbiAgICAgICAgaWYgKHkgPiBlLnkgKyAzIHx8IHkgKyBDSEFSQUNURVJfSEVJR0hUIDwgZS55KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgYm9keSA9IGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWVfJykgPyBTVEFHRV9UUlVOS1tncm93dGhTdGFnZShlKSA/PyAnbWF0dXJlJ10gKiBlLnNjYWxlXG4gICAgICAgICAgOiAoT0JTVFJVQ1RJT05fUkFESVVTW2Uua2luZCBhcyBBY3RpdmVFbnRpdHlLaW5kXSA/PyAwLjUpICogMC43NSAqIGUuc2NhbGU7XG4gICAgICAgIGlmIChNYXRoLmh5cG90KHggLSBlLngsIHogLSBlLnopIDwgYm9keSArIENIQVJBQ1RFUl9SQURJVVMgKyAwLjEpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8qKiBIaWdoZXN0IHN0YW5kYWJsZSBmZWV0IHBvc2l0aW9uIGluIGEgY29sdW1uIG5lYXIgYHlIaW50YCwgb3IgbnVsbCBpZiBub3QgcmVzaWRlbnQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluZFN0YW5kaW5nWSh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCB5SGludCA9IDEyMCk6IG51bWJlciB8IG51bGwge1xuICBmb3IgKGxldCB5ID0gTWF0aC5taW4oMTEwLCBNYXRoLmZsb29yKHlIaW50KSk7IHkgPiBZX01JTjsgeS0tKSB7XG4gICAgY29uc3QgbSA9IHJlc2lkZW50Vm94ZWxBdCh3b3JsZCwgTWF0aC5mbG9vcih4KSwgeSAtIDEsIE1hdGguZmxvb3IoeikpO1xuICAgIGlmIChtID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgICBpZiAoaXNTb2xpZChtKSAmJiAhb3ZlcmxhcHNUZXJyYWluKHdvcmxkLCB4LCB5LCB6KSkgcmV0dXJuIHk7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG4iLCAiLy8gUmVuZGVyIGxheWVyIFx1MjAxNCBhcnRpY3VsYXRlZCwgYmxvY2stYnVpbHQgY2hhcmFjdGVycyAocHJlc2VudGF0aW9uIG9ubHkpLlxuLy9cbi8vIEEgZmlndXJlIGlzIGEgaGllcmFyY2h5IG9mIHJpZ2lkIHBhcnRzIChoaXBzIFx1MjE5MiB0b3JzbyBcdTIxOTIgaGVhZC9hcm1zLCBoaXBzIFx1MjE5MlxuLy8gbGVncykgYnVpbHQgZnJvbSBib3hlcyBvZiBkZWxpYmVyYXRlbHkgdmFyaWVkIHByb3BvcnRpb246IGEgdGFwZXJlZCB0b3Jzbyxcbi8vIGJlbHQsIGNvbGxhciwgaGFpciBjYXAsIGhhbmRzIGFuZCBib290cywgc28gdGhlIHNpbGhvdWV0dGUgcmVhZHMgYXMgYSBwZXJzb25cbi8vIGF0IGdhbWVwbGF5IGRpc3RhbmNlIHdpdGhvdXQgYmVjb21pbmcgYSBwaWxlIG9mIGlkZW50aWNhbCBjdWJlcy5cbi8vIEFuaW1hdGlvbiByb3RhdGVzIHRoZSByaWdpZCBwYXJ0cy4gVGhlIHBhcnRzIGFyZSBkcmF3biBhcyBvbmUgc2tpbm5lZCBtZXNoXG4vLyAob25lIHJpZ2lkIGJvbmUgcGVyIHBhcnQpLCBzbyBhIGZpZ3VyZSBjb3N0cyBvbmUgZHJhdyBjYWxsIHBlciBwYXNzLlxuLy9cbi8vIFNjYWxlOiAxIHVuaXQgPSAxIG0uIFRoZSBmb3VuZGVyIGlzIDEuNyBtIHRhbGwgKEFEQiBcdTAwQTc1IGh1bWFuIHJ1bGVyKS5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IG1lcmdlR2VvbWV0cmllcyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS91dGlscy9CdWZmZXJHZW9tZXRyeVV0aWxzLmpzJztcbmltcG9ydCBwYWxldHRlIGZyb20gJy4uL2RhdGEvcGFsZXR0ZS5qc29uJztcbmltcG9ydCB0eXBlIHsgQ2hhcmFjdGVyU3RhdGUgfSBmcm9tICcuLi9zaW0vY2hhcmFjdGVyJztcbmltcG9ydCB7IFdBVEVSX0RSQVdfRFJPUCB9IGZyb20gJy4vd2F0ZXInO1xuXG5jb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9Pjtcbi8qKiBQYWxldHRlIGtleSwgb3IgYSBsaXRlcmFsICcjcnJnZ2JiJyBmb3Igcm9sZSBjb2xvdXJzIG91dHNpZGUgdGhlIHBhbGV0dGUuICovXG5jb25zdCBDID0gKGs6IHN0cmluZykgPT4gbmV3IFRIUkVFLkNvbG9yKGsuc3RhcnRzV2l0aCgnIycpID8gayA6IE1ba10uaGV4KTtcblxuY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IHZlcnRleENvbG9yczogdHJ1ZSwgZmxhdFNoYWRpbmc6IHRydWUgfSk7XG5cbmludGVyZmFjZSBCb3ggeyB3OiBudW1iZXI7IGg6IG51bWJlcjsgZDogbnVtYmVyOyB4PzogbnVtYmVyOyB5PzogbnVtYmVyOyB6PzogbnVtYmVyOyBjOiBzdHJpbmc7IH1cblxuLyoqIE1lcmdlIGJveGVzICh5ID0gYm90dG9tKSBpbnRvIG9uZSB2ZXJ0ZXgtY29sb3VyZWQgZ2VvbWV0cnkuICovXG5mdW5jdGlvbiBwYXJ0KGJveGVzOiBCb3hbXSk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgZ2VvcyA9IGJveGVzLm1hcCgoYikgPT4ge1xuICAgIGNvbnN0IGcgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoYi53LCBiLmgsIGIuZCkudG9Ob25JbmRleGVkKCk7XG4gICAgZy50cmFuc2xhdGUoYi54ID8/IDAsIChiLnkgPz8gMCkgKyBiLmggLyAyLCBiLnogPz8gMCk7XG4gICAgZy5kZWxldGVBdHRyaWJ1dGUoJ3V2Jyk7XG4gICAgY29uc3QgY29sID0gQyhiLmMpO1xuICAgIGNvbnN0IG4gPSBnLmF0dHJpYnV0ZXMucG9zaXRpb24uY291bnQ7XG4gICAgY29uc3QgY29sb3JzID0gbmV3IEZsb2F0MzJBcnJheShuICogMyk7XG4gICAgY29uc3Qgbm9ybWFscyA9IGcuYXR0cmlidXRlcy5ub3JtYWw7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgIC8vIFNsaWdodGx5IGRhcmtlciB1bmRlcnNpZGVzIGFuZCBzaWRlczogc2hhZGUgc3RheXMgaW4gdGhlIGxpZ2h0IHJpZyxcbiAgICAgIC8vIHRoaXMgb25seSBzZXBhcmF0ZXMgZmFjZXMgb2YgdGhlIHNhbWUgZmxhdCBjb2xvdXIuXG4gICAgICBjb25zdCBueSA9IG5vcm1hbHMuZ2V0WShpKTtcbiAgICAgIGNvbnN0IGsgPSBueSA+IDAuNSA/IDEuMCA6IG55IDwgLTAuNSA/IDAuNzggOiAwLjk7XG4gICAgICBjb2xvcnNbaSAqIDNdID0gY29sLnIgKiBrOyBjb2xvcnNbaSAqIDMgKyAxXSA9IGNvbC5nICogazsgY29sb3JzW2kgKiAzICsgMl0gPSBjb2wuYiAqIGs7XG4gICAgfVxuICAgIGcuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoY29sb3JzLCAzKSk7XG4gICAgcmV0dXJuIGc7XG4gIH0pO1xuICBjb25zdCBtZXJnZWQgPSBtZXJnZUdlb21ldHJpZXMoZ2VvcykhO1xuICBmb3IgKGNvbnN0IGcgb2YgZ2VvcykgZy5kaXNwb3NlKCk7XG4gIHJldHVybiBtZXJnZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmlndXJlU3R5bGUge1xuICB0dW5pYzogc3RyaW5nO1xuICB0cm91c2Vyczogc3RyaW5nO1xuICBoYWlyOiBzdHJpbmc7XG4gIC8qKiBIZWlnaHQgc2NhbGUgcmVsYXRpdmUgdG8gdGhlIDEuNyBtIGZvdW5kZXIuICovXG4gIHNjYWxlPzogbnVtYmVyO1xuICAvKiogV29yayBpZGVudGl0eTogYSB3aWRlIHN0cmF3IGhhdCAoZmFybWVyKSwgYSBmZWx0IGNhcCAoaGVyZGVyKS4gKi9cbiAgaGF0PzogeyBraW5kOiAnc3RyYXcnIHwgJ2NhcCc7IGNvbG9yOiBzdHJpbmcgfTtcbiAgLyoqIEEgd29yayBhcHJvbiBvdmVyIHRoZSB0dW5pYy4gKi9cbiAgYXByb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBGT1VOREVSX1NUWUxFOiBGaWd1cmVTdHlsZSA9IHsgdHVuaWM6ICdjaGFyX3R1bmljJywgdHJvdXNlcnM6ICdjaGFyX3Ryb3VzZXJzJywgaGFpcjogJ2NoYXJfaGFpcicgfTtcbmV4cG9ydCBjb25zdCBWSUxMQUdFUl9TVFlMRTogRmlndXJlU3R5bGUgPSB7IHR1bmljOiAnY2hhcl90dW5pY19hbHQnLCB0cm91c2VyczogJ2NoYXJfdHJvdXNlcnMnLCBoYWlyOiAnY2hhcl9oYWlyJyB9O1xuLyoqIFJvbGUgbG9va3MgZm9yIGhvbWVzdGVhZCB2aWxsYWdlcnMgKGlkZW50aXR5IHBlciByb2xlLCBzbWFsbCBwZXItcGVyc29uIHZhcmlhdGlvbiB2aWEgYGhhaXJgKS4gKi9cbmV4cG9ydCBjb25zdCBGQVJNRVJfU1RZTEU6IEZpZ3VyZVN0eWxlID0geyB0dW5pYzogJyM2RThGM0EnLCB0cm91c2VyczogJyM1QjQ2MzInLCBoYWlyOiAnIzNCMkExRScsIGhhdDogeyBraW5kOiAnc3RyYXcnLCBjb2xvcjogJyNEOUI2NUEnIH0sIGFwcm9uOiAnI0I4OUI2QScgfTtcbmV4cG9ydCBjb25zdCBIRVJERVJfU1RZTEU6IEZpZ3VyZVN0eWxlID0geyB0dW5pYzogJyMzRjZFOEMnLCB0cm91c2VyczogJyM0QTQwMzgnLCBoYWlyOiAnIzdBNEEyQScsIGhhdDogeyBraW5kOiAnY2FwJywgY29sb3I6ICcjN0EyRTJFJyB9IH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmlndXJlIHtcbiAgcm9vdDogVEhSRUUuR3JvdXA7XG4gIGhpcHM6IFRIUkVFLkdyb3VwO1xuICB0b3JzbzogVEhSRUUuR3JvdXA7XG4gIGhlYWQ6IFRIUkVFLkdyb3VwO1xuICBhcm1MOiBUSFJFRS5Hcm91cDtcbiAgYXJtUjogVEhSRUUuR3JvdXA7XG4gIGxlZ0w6IFRIUkVFLkdyb3VwO1xuICBsZWdSOiBUSFJFRS5Hcm91cDtcbiAgLyoqIFJpbmcgb2YgZm9hbSBibG9ja3MgYXQgdGhlIHdhdGVyIGxpbmUgKHNjYWxlZCB0byAwIG91dCBvZiB0aGUgd2F0ZXIpLiAqL1xuICByaXBwbGU6IFRIUkVFLkdyb3VwO1xuICAvKiogQWNjdW11bGF0ZWQgZ2FpdCBwaGFzZSAocmFkaWFucykuICovXG4gIHBoYXNlOiBudW1iZXI7XG4gIC8qKiBBY2N1bXVsYXRlZCBzd2ltIHN0cm9rZSBwaGFzZSAocmFkaWFucykuICovXG4gIHN3aW1QaGFzZTogbnVtYmVyO1xuICAvKiogU2Vjb25kcyBhbmltYXRlZCAoaWRsZSBicmVhdGhpbmcsIGJvYmJpbmcpLiAqL1xuICB0aW1lOiBudW1iZXI7XG4gIC8qKiBTbW9vdGhlZCBibGVuZCB3ZWlnaHRzIG9mIHRoZSBwb3NlIGZhbWlsaWVzIChzdW0gdG8gMSkuICovXG4gIGJsZW5kOiB7IGdyb3VuZDogbnVtYmVyOyBhaXI6IG51bWJlcjsgc3VyZmFjZTogbnVtYmVyOyB1bmRlcjogbnVtYmVyIH07XG4gIC8qKiBTbW9vdGhlZCB1bmRlcndhdGVyIGJvZHkgcGl0Y2ggKHJhZGlhbnMgZnJvbSB1cHJpZ2h0LCB0b3dhcmQgdGhlIHN3aW0gZGlyZWN0aW9uKS4gKi9cbiAgZGl2ZVBpdGNoOiBudW1iZXI7XG4gIC8qKiBTbW9vdGhlZCBzdXJmYWNlIHN0cm9rZSBhbW91bnQgKDAgdHJlYWRpbmcgLi4gMSBmdWxsIHN0cm9rZSkuICovXG4gIHN0cm9rZTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUGFydCB7IGpvaW50OiBUSFJFRS5Hcm91cDsgZ2VvOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB9XG5cbmZ1bmN0aW9uIGpvaW50KHBhcnRzOiBQYXJ0W10sIG5hbWU6IHN0cmluZywgZ2VvOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IFRIUkVFLkdyb3VwIHtcbiAgY29uc3QgZyA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBnLm5hbWUgPSBuYW1lO1xuICBnLnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcbiAgcGFydHMucHVzaCh7IGpvaW50OiBnLCBnZW8gfSk7XG4gIHJldHVybiBnO1xufVxuXG4vKipcbiAqIE9uZSBza2lubmVkIG1lc2ggZm9yIHRoZSB3aG9sZSBmaWd1cmUuIEVhY2ggcmlnaWQgcGFydCBpcyBib3VuZCB3aXRoXG4gKiB3ZWlnaHQgMSB0byBhIGJvbmUgdGhhdCBzaXRzIGF0IGl0cyBqb2ludCwgc28gcm90YXRpbmcgdGhlIGpvaW50IGdyb3Vwc1xuICogcG9zZXMgdGhlIGZpZ3VyZSBleGFjdGx5IGFzIHRoZSBvbGQgb25lLW1lc2gtcGVyLXBhcnQgaGllcmFyY2h5IGRpZCwgYXRcbiAqIG9uZSBkcmF3IGNhbGwgcGVyIHBhc3MgaW5zdGVhZCBvZiBzaXguXG4gKi9cbmZ1bmN0aW9uIHNraW5GaWd1cmUocm9vdDogVEhSRUUuR3JvdXAsIHBhcnRzOiBQYXJ0W10pOiBUSFJFRS5Ta2lubmVkTWVzaCB7XG4gIHJvb3QudXBkYXRlTWF0cml4V29ybGQodHJ1ZSk7XG4gIGNvbnN0IHRvUm9vdCA9IG5ldyBUSFJFRS5NYXRyaXg0KCkuY29weShyb290Lm1hdHJpeFdvcmxkKS5pbnZlcnQoKTtcbiAgY29uc3QgYm9uZXM6IFRIUkVFLkJvbmVbXSA9IFtdO1xuICBjb25zdCBnZW9zID0gcGFydHMubWFwKCh7IGpvaW50OiBqLCBnZW8gfSwgaW5kZXgpID0+IHtcbiAgICBjb25zdCBib25lID0gbmV3IFRIUkVFLkJvbmUoKTtcbiAgICBib25lLm5hbWUgPSBgJHtqLm5hbWV9X2JvbmVgO1xuICAgIGouYWRkKGJvbmUpO1xuICAgIGJvbmVzLnB1c2goYm9uZSk7XG4gICAgY29uc3QgZyA9IGdlby5jbG9uZSgpLmFwcGx5TWF0cml4NChuZXcgVEhSRUUuTWF0cml4NCgpLm11bHRpcGx5TWF0cmljZXModG9Sb290LCBqLm1hdHJpeFdvcmxkKSk7XG4gICAgY29uc3QgbiA9IGcuYXR0cmlidXRlcy5wb3NpdGlvbi5jb3VudDtcbiAgICBjb25zdCBza2luSW5kZXggPSBuZXcgVWludDE2QXJyYXkobiAqIDQpLCBza2luV2VpZ2h0ID0gbmV3IEZsb2F0MzJBcnJheShuICogNCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHsgc2tpbkluZGV4W2kgKiA0XSA9IGluZGV4OyBza2luV2VpZ2h0W2kgKiA0XSA9IDE7IH1cbiAgICBnLnNldEF0dHJpYnV0ZSgnc2tpbkluZGV4JywgbmV3IFRIUkVFLlVpbnQxNkJ1ZmZlckF0dHJpYnV0ZShza2luSW5kZXgsIDQpKTtcbiAgICBnLnNldEF0dHJpYnV0ZSgnc2tpbldlaWdodCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHNraW5XZWlnaHQsIDQpKTtcbiAgICByZXR1cm4gZztcbiAgfSk7XG4gIGNvbnN0IG1lcmdlZCA9IG1lcmdlR2VvbWV0cmllcyhnZW9zKSE7XG4gIGZvciAoY29uc3QgZyBvZiBnZW9zKSBnLmRpc3Bvc2UoKTtcbiAgZm9yIChjb25zdCBnIG9mIG5ldyBTZXQocGFydHMubWFwKChwKSA9PiBwLmdlbykpKSBnLmRpc3Bvc2UoKTtcbiAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5Ta2lubmVkTWVzaChtZXJnZWQsIG1hdGVyaWFsKTtcbiAgbWVzaC5uYW1lID0gJ2NoYXJhY3Rlcl9ib2R5JztcbiAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgcm9vdC5hZGQobWVzaCk7XG4gIHJvb3QudXBkYXRlTWF0cml4V29ybGQodHJ1ZSk7XG4gIG1lc2guYmluZChuZXcgVEhSRUUuU2tlbGV0b24oYm9uZXMpKTtcbiAgLy8gRml4ZWQgYm91bmRzIGluIHRoZSBmaWd1cmUncyBvd24gc3BhY2UgKGNvdmVycyByYWlzZWQgYXJtcyBhbmQgdGhlIHN3aW1cbiAgLy8gcG9zZSksIHNvIGN1bGxpbmcgbmV2ZXIgZGVwZW5kcyBvbiB0aGUgcG9zZSBzZWVuIGF0IHRoZSBmaXJzdCBmcmFtZS5cbiAgbWVzaC5ib3VuZGluZ1NwaGVyZSA9IG5ldyBUSFJFRS5TcGhlcmUobmV3IFRIUkVFLlZlY3RvcjMoMCwgMC45LCAwKSwgMS41KTtcbiAgbWVzaC5ib3VuZGluZ0JveCA9IG5ldyBUSFJFRS5Cb3gzKG5ldyBUSFJFRS5WZWN0b3IzKC0xLjUsIC0wLjYsIC0xLjUpLCBuZXcgVEhSRUUuVmVjdG9yMygxLjUsIDIuNCwgMS41KSk7XG4gIHJldHVybiBtZXNoO1xufVxuXG4vKiogQnVpbGQgYSAxLjcgbSBhcnRpY3VsYXRlZCBmaWd1cmUuIEZlZXQgYXQgeSA9IDAsIGZhY2luZyArei4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEZpZ3VyZShzdHlsZTogRmlndXJlU3R5bGUgPSBGT1VOREVSX1NUWUxFKTogRmlndXJlIHtcbiAgY29uc3Qgcm9vdCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICByb290Lm5hbWUgPSAnY2hhcmFjdGVyJztcbiAgY29uc3QgcyA9IHN0eWxlLnNjYWxlID8/IDE7XG4gIHJvb3Quc2NhbGUuc2V0U2NhbGFyKHMpO1xuICBjb25zdCBwYXJ0czogUGFydFtdID0gW107XG5cbiAgLy8gTGVncyBoYW5nIGZyb20gdGhlIGhpcCBqb2ludCBhdCB5ID0gMC44Mi5cbiAgY29uc3QgbGVnR2VvID0gcGFydChbXG4gICAgeyB3OiAwLjE3LCBoOiAwLjcyLCBkOiAwLjE5LCB5OiAtMC43MiwgYzogc3R5bGUudHJvdXNlcnMgfSxcbiAgICB7IHc6IDAuMTksIGg6IDAuMTIsIGQ6IDAuMjcsIHk6IC0wLjgyLCB6OiAwLjAzNSwgYzogJ2NoYXJfYm9vdHMnIH0sXG4gIF0pO1xuICBjb25zdCBoaXBzID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIGhpcHMubmFtZSA9ICdoaXBzJztcbiAgaGlwcy5wb3NpdGlvbi55ID0gMC44MjtcbiAgY29uc3QgbGVnTCA9IGpvaW50KHBhcnRzLCAnbGVnTCcsIGxlZ0dlbywgMC4xLCAwLCAwKTtcbiAgY29uc3QgbGVnUiA9IGpvaW50KHBhcnRzLCAnbGVnUicsIGxlZ0dlbywgLTAuMSwgMCwgMCk7XG4gIGhpcHMuYWRkKGxlZ0wsIGxlZ1IpO1xuXG4gIC8vIFRvcnNvOiBoaXBzIGJsb2NrLCBiZWx0LCB0YXBlcmVkIGNoZXN0LCBjb2xsYXIuXG4gIGNvbnN0IHRvcnNvR2VvID0gcGFydChbXG4gICAgeyB3OiAwLjQwLCBoOiAwLjE2LCBkOiAwLjI0LCB5OiAtMC4wMiwgYzogc3R5bGUudHJvdXNlcnMgfSxcbiAgICB7IHc6IDAuNDIsIGg6IDAuMDYsIGQ6IDAuMjYsIHk6IDAuMTIsIGM6ICdjaGFyX2Jvb3RzJyB9LFxuICAgIHsgdzogMC40MCwgaDogMC4yOCwgZDogMC4yNCwgeTogMC4xOCwgYzogc3R5bGUudHVuaWMgfSxcbiAgICB7IHc6IDAuNDYsIGg6IDAuMjAsIGQ6IDAuMjYsIHk6IDAuNDIsIGM6IHN0eWxlLnR1bmljIH0sXG4gICAgeyB3OiAwLjIyLCBoOiAwLjA1LCBkOiAwLjE4LCB5OiAwLjYyLCBjOiBzdHlsZS50dW5pYyB9LFxuICAgIC4uLihzdHlsZS5hcHJvbiA/IFt7IHc6IDAuMzYsIGg6IDAuNDYsIGQ6IDAuMDMsIHk6IC0wLjA2LCB6OiAwLjEzNSwgYzogc3R5bGUuYXByb24gfV0gOiBbXSksXG4gIF0pO1xuICBjb25zdCB0b3JzbyA9IGpvaW50KHBhcnRzLCAndG9yc28nLCB0b3Jzb0dlbywgMCwgMCwgMCk7XG4gIGhpcHMuYWRkKHRvcnNvKTtcblxuICBjb25zdCBoZWFkR2VvID0gcGFydChbXG4gICAgeyB3OiAwLjEwLCBoOiAwLjA2LCBkOiAwLjEwLCB5OiAwLCBjOiAnY2hhcl9za2luJyB9LFxuICAgIHsgdzogMC4yNCwgaDogMC4yNCwgZDogMC4yNCwgeTogMC4wNSwgYzogJ2NoYXJfc2tpbicgfSxcbiAgICB7IHc6IDAuMjYsIGg6IDAuMDksIGQ6IDAuMjYsIHk6IDAuMjQsIGM6IHN0eWxlLmhhaXIgfSxcbiAgICB7IHc6IDAuMjYsIGg6IDAuMTIsIGQ6IDAuMDYsIHk6IDAuMTYsIHo6IC0wLjExLCBjOiBzdHlsZS5oYWlyIH0sXG4gICAgeyB3OiAwLjA1LCBoOiAwLjA0LCBkOiAwLjAzLCB4OiAwLjA1NSwgeTogMC4xNSwgejogMC4xMiwgYzogJ2NoYXJfYm9vdHMnIH0sXG4gICAgeyB3OiAwLjA1LCBoOiAwLjA0LCBkOiAwLjAzLCB4OiAtMC4wNTUsIHk6IDAuMTUsIHo6IDAuMTIsIGM6ICdjaGFyX2Jvb3RzJyB9LFxuICAgIC4uLihzdHlsZS5oYXQ/LmtpbmQgPT09ICdzdHJhdycgPyBbXG4gICAgICB7IHc6IDAuNTIsIGg6IDAuMDMsIGQ6IDAuNTIsIHk6IDAuMzAsIGM6IHN0eWxlLmhhdC5jb2xvciB9LFxuICAgICAgeyB3OiAwLjI3LCBoOiAwLjEwLCBkOiAwLjI3LCB5OiAwLjMyLCBjOiBzdHlsZS5oYXQuY29sb3IgfSxcbiAgICBdIDogc3R5bGUuaGF0Py5raW5kID09PSAnY2FwJyA/IFtcbiAgICAgIHsgdzogMC4yOCwgaDogMC4wOCwgZDogMC4yOCwgeTogMC4zMCwgYzogc3R5bGUuaGF0LmNvbG9yIH0sXG4gICAgICB7IHc6IDAuMjIsIGg6IDAuMDIsIGQ6IDAuMTIsIHk6IDAuMzAsIHo6IDAuMTcsIGM6IHN0eWxlLmhhdC5jb2xvciB9LFxuICAgIF0gOiBbXSksXG4gIF0pO1xuICBjb25zdCBoZWFkID0gam9pbnQocGFydHMsICdoZWFkJywgaGVhZEdlbywgMCwgMC42NiwgMCk7XG4gIHRvcnNvLmFkZChoZWFkKTtcblxuICAvLyBBcm1zIGhhbmcgZnJvbSB0aGUgc2hvdWxkZXIgYXQgeSA9IDAuNjAgb24gdGhlIHRvcnNvLlxuICBjb25zdCBhcm1HZW8gPSBwYXJ0KFtcbiAgICB7IHc6IDAuMTMsIGg6IDAuMzAsIGQ6IDAuMTQsIHk6IC0wLjMwLCBjOiBzdHlsZS50dW5pYyB9LFxuICAgIHsgdzogMC4xMSwgaDogMC4yNCwgZDogMC4xMiwgeTogLTAuNTMsIGM6ICdjaGFyX3NraW4nIH0sXG4gIF0pO1xuICBjb25zdCBhcm1MID0gam9pbnQocGFydHMsICdhcm1MJywgYXJtR2VvLCAwLjI5LCAwLjYwLCAwKTtcbiAgY29uc3QgYXJtUiA9IGpvaW50KHBhcnRzLCAnYXJtUicsIGFybUdlbywgLTAuMjksIDAuNjAsIDApO1xuICB0b3Jzby5hZGQoYXJtTCwgYXJtUik7XG5cbiAgcm9vdC5hZGQoaGlwcyk7XG5cbiAgLy8gRm9hbSBibG9ja3MgcmluZ2luZyB0aGUgYm9keSBhdCB0aGUgd2F0ZXIgbGluZSAoTTAxMSkuIFBhcnQgb2YgdGhlIHNhbWVcbiAgLy8gc2tpbm5lZCBtZXNoLCBzbyB0aGV5IGNvc3Qgbm8gZHJhdyBjYWxsOyBzY2FsZWQgdG8gemVybyB3aGVuIGRyeS5cbiAgY29uc3QgZm9hbTogQm94W10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCA4OyBpKyspIHtcbiAgICBjb25zdCBhID0gKGkgLyA4KSAqIE1hdGguUEkgKiAyICsgMC4yLCByID0gaSAlIDIgPyAwLjUgOiAwLjQyO1xuICAgIGNvbnN0IHcgPSBpICUgMiA/IDAuMDkgOiAwLjE0O1xuICAgIGZvYW0ucHVzaCh7IHcsIGg6IDAuMDMsIGQ6IHcgKiAwLjcsIHg6IE1hdGguc2luKGEpICogciwgeTogLTAuMDE1LCB6OiBNYXRoLmNvcyhhKSAqIHIsIGM6IGkgJSAzID8gJyNFNkYyRjUnIDogJyNDOUUzRUEnIH0pO1xuICB9XG4gIGNvbnN0IHJpcHBsZSA9IGpvaW50KHBhcnRzLCAncmlwcGxlJywgcGFydChmb2FtKSwgMCwgMS4yLCAwKTtcbiAgcm9vdC5hZGQocmlwcGxlKTtcblxuICBza2luRmlndXJlKHJvb3QsIHBhcnRzKTtcbiAgLy8gSGlkZGVuIHVudGlsIHRoZSBmaWd1cmUgaXMgaW4gd2F0ZXIgKGFmdGVyIGJpbmRpbmc6IGEgemVybyBzY2FsZSBhdCBiaW5kIHRpbWUgd291bGQgbWFrZSB0aGUgYm9uZSBpbnZlcnNlIHNpbmd1bGFyKS5cbiAgcmlwcGxlLnNjYWxlLnNldFNjYWxhcigwKTtcbiAgcmV0dXJuIHtcbiAgICByb290LCBoaXBzLCB0b3JzbywgaGVhZCwgYXJtTCwgYXJtUiwgbGVnTCwgbGVnUiwgcmlwcGxlLCBwaGFzZTogMCwgc3dpbVBoYXNlOiAwLCB0aW1lOiAwLFxuICAgIGJsZW5kOiB7IGdyb3VuZDogMSwgYWlyOiAwLCBzdXJmYWNlOiAwLCB1bmRlcjogMCB9LCBkaXZlUGl0Y2g6IDAuMywgc3Ryb2tlOiAwLFxuICB9O1xufVxuXG4vKiogSm9pbnQgYW5nbGVzIGFuZCBvZmZzZXRzIG9mIG9uZSBwb3NlOyBwb3NlcyBvZiBkaWZmZXJlbnQgcmVnaW1lcyBhcmUgYmxlbmRlZCBsaW5lYXJseS4gKi9cbmludGVyZmFjZSBQb3NlIHtcbiAgaGlwc1k6IG51bWJlcjsgaGlwc1o6IG51bWJlcjsgaGlwc1BpdGNoOiBudW1iZXI7IHRvcnNvUGl0Y2g6IG51bWJlcjsgaGVhZFBpdGNoOiBudW1iZXI7XG4gIGFybUx4OiBudW1iZXI7IGFybUx6OiBudW1iZXI7IGFybVJ4OiBudW1iZXI7IGFybVJ6OiBudW1iZXI7XG4gIGxlZ0x4OiBudW1iZXI7IGxlZ0x6OiBudW1iZXI7IGxlZ1J4OiBudW1iZXI7IGxlZ1J6OiBudW1iZXI7XG59XG5jb25zdCBLRVlTOiBBcnJheTxrZXlvZiBQb3NlPiA9IFsnaGlwc1knLCAnaGlwc1onLCAnaGlwc1BpdGNoJywgJ3RvcnNvUGl0Y2gnLCAnaGVhZFBpdGNoJywgJ2FybUx4JywgJ2FybUx6JywgJ2FybVJ4JywgJ2FybVJ6JywgJ2xlZ0x4JywgJ2xlZ0x6JywgJ2xlZ1J4JywgJ2xlZ1J6J107XG5cbi8qKiBUb3JzbyBsZW5ndGggZnJvbSB0aGUgaGlwIGpvaW50IHRvIHRoZSBuZWNrIChoZWFkIGpvaW50KS4gKi9cbmNvbnN0IE5FQ0sgPSAwLjY2O1xuLyoqIFRoZSBuZWNrIHNpdHMgdGhpcyBmYXIgYWJvdmUgdGhlIGRyYXduIHdhdGVyIGxpbmUgd2hlbiBmbG9hdGluZyAoc2hvdWxkZXJzIGF0IHRoZSB3YXRlciBsaW5lKS4gKi9cbmNvbnN0IE5FQ0tfQ0xFQVIgPSAwLjA3O1xuLyoqIEFybXMgZXh0ZW5kZWQgYWhlYWQgYWxvbmcgdGhlIGJvZHkgKGJvZHkgZnJhbWU7IC1QSSBwb2ludHMgc3RyYWlnaHQgdXAgYWxvbmcgdGhlIHNwaW5lKS4gKi9cbmNvbnN0IFJFQUNIID0gLTIuODtcblxuY29uc3Qgc21vb3RoID0gKHU6IG51bWJlcikgPT4gdSAqIHUgKiAoMyAtIDIgKiB1KTtcbmNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBsbzogbnVtYmVyLCBoaTogbnVtYmVyKSA9PiAodiA8IGxvID8gbG8gOiB2ID4gaGkgPyBoaSA6IHYpO1xuLyoqIFByb2dyZXNzIG9mIGB1YCB0aHJvdWdoIFthLCBiKSwgZWFzZWQsIGNsYW1wZWQgdG8gMC4uMS4gKi9cbmNvbnN0IHNlZyA9ICh1OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBzbW9vdGgoY2xhbXAoKHUgLSBhKSAvIChiIC0gYSksIDAsIDEpKTtcblxuLyoqIFdoaXAga2ljayBvZiBhIGJyZWFzdHN0cm9rZSAobGVncyB0b2dldGhlciwgZHJhdyB1cCwgc3dlZXAgb3V0IGFuZCBzbmFwIHRvZ2V0aGVyKS4gKi9cbmZ1bmN0aW9uIHdoaXBLaWNrKHU6IG51bWJlciwgcmVjb3ZlcjogbnVtYmVyLCBraWNrOiBudW1iZXIsIGVuZDogbnVtYmVyKTogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9IHtcbiAgaWYgKHUgPCByZWNvdmVyKSByZXR1cm4geyB4OiAwLjA2LCB6OiAwLjAzIH07XG4gIGlmICh1IDwga2ljaykgeyBjb25zdCBrID0gc2VnKHUsIHJlY292ZXIsIGtpY2spOyByZXR1cm4geyB4OiBsZXJwKDAuMDYsIC0wLjk1LCBrKSwgejogbGVycCgwLjAzLCAwLjMyLCBrKSB9OyB9XG4gIGlmICh1IDwgZW5kKSB7IGNvbnN0IGsgPSBzZWcodSwga2ljaywgZW5kKTsgcmV0dXJuIHsgeDogbGVycCgtMC45NSwgMC4xNiwgayksIHo6IGxlcnAoMC4zMiwgMC4wMywgaykgKyAwLjIyICogTWF0aC5zaW4oTWF0aC5QSSAqIGspIH07IH1cbiAgcmV0dXJuIHsgeDogbGVycCgwLjE2LCAwLjA2LCBzZWcodSwgZW5kLCAxKSksIHo6IDAuMDMgfTtcbn1cblxuZnVuY3Rpb24gZ3JvdW5kUG9zZShmOiBGaWd1cmUsIHN0YXRlOiBDaGFyYWN0ZXJTdGF0ZSk6IFBvc2Uge1xuICBjb25zdCBzcGVlZCA9IHN0YXRlLnNwZWVkO1xuICBjb25zdCBzdyA9IE1hdGgubWluKDEsIHNwZWVkIC8gNy41KTtcbiAgbGV0IGxlZ1N3aW5nID0gTWF0aC5zaW4oZi5waGFzZSkgKiAoMC4zNSArIDAuNDUgKiBzdykgKiBNYXRoLm1pbigxLCBzcGVlZCAqIDEuNSk7XG4gIGxldCBhcm1Td2luZyA9IC1sZWdTd2luZyAqIDAuODtcbiAgbGV0IGxlYW4gPSAwLjEwICogc3c7XG4gIGxldCBib2IgPSBNYXRoLmFicyhNYXRoLnNpbihmLnBoYXNlKSkgKiAwLjA1ICogTWF0aC5taW4oMSwgc3BlZWQpO1xuICBpZiAoc3BlZWQgPCAwLjEpIHtcbiAgICAvLyBJZGxlIGJyZWF0aGluZyB3aGVuIHN0YW5kaW5nLlxuICAgIGxlYW4gPSAwOyBib2IgPSBNYXRoLnNpbihmLnRpbWUgKiAxLjExKSAqIDAuMDA2O1xuICAgIGFybVN3aW5nID0gMDsgbGVnU3dpbmcgPSAwO1xuICB9XG4gIHJldHVybiB7XG4gICAgaGlwc1k6IDAuODIgKyBib2IsIGhpcHNaOiAwLCBoaXBzUGl0Y2g6IDAsIHRvcnNvUGl0Y2g6IGxlYW4sIGhlYWRQaXRjaDogLWxlYW4gKiAwLjYsXG4gICAgYXJtTHg6IGFybVN3aW5nLCBhcm1MejogMC4wNiwgYXJtUng6IC1hcm1Td2luZywgYXJtUno6IC0wLjA2LFxuICAgIGxlZ0x4OiBsZWdTd2luZywgbGVnTHo6IDAsIGxlZ1J4OiAtbGVnU3dpbmcsIGxlZ1J6OiAwLFxuICB9O1xufVxuXG5jb25zdCBBSVJfUE9TRTogUG9zZSA9IHtcbiAgaGlwc1k6IDAuODIsIGhpcHNaOiAwLCBoaXBzUGl0Y2g6IDAsIHRvcnNvUGl0Y2g6IDAuMDUsIGhlYWRQaXRjaDogMCxcbiAgYXJtTHg6IC0wLjksIGFybUx6OiAwLjI1LCBhcm1SeDogLTAuOSwgYXJtUno6IC0wLjI1LCBsZWdMeDogLTAuNDUsIGxlZ0x6OiAwLCBsZWdSeDogMC4yNSwgbGVnUno6IDAsXG59O1xuXG4vKipcbiAqIEF0IHRoZSBzdXJmYWNlOiB0cmVhZGluZyB3YXRlciB3aGVuIHN0aWxsICh1cHJpZ2h0LCBhcm1zIHNjdWxsaW5nIG91dCB0b1xuICogdGhlIHNpZGVzLCBsZWdzIGtpY2tpbmcgZ2VudGx5KSBibGVuZGluZyBpbnRvIGEgaGVhZC11cCBicmVhc3RzdHJva2UgYXMgdGhlXG4gKiBzd2ltbWVyIG1vdmVzIChib2R5IHBpdGNoZWQgZm9yd2FyZCwgYXJtcyBwdWxsIG91dCBhbmQgcm91bmQsIHRoZW4gc2hvb3RcbiAqIGFoZWFkOyB3aGlwIGtpY2s7IGdsaWRlKS4gVGhlIGJvZHkgaXMgcGxhY2VkIHNvIHRoZSBuZWNrIHN0YXlzIGp1c3QgYWJvdmVcbiAqIHRoZSBkcmF3biB3YXRlciBsaW5lOiBoZWFkIGFuZCBzaG91bGRlcnMgb3V0IG9mIHRoZSB3YXRlci5cbiAqL1xuZnVuY3Rpb24gc3VyZmFjZVBvc2UoZjogRmlndXJlLCB3YXRlckxpbmU6IG51bWJlcik6IFBvc2Uge1xuICBjb25zdCBtID0gZi5zdHJva2U7XG4gIGNvbnN0IHBoaSA9IGYuc3dpbVBoYXNlO1xuICBjb25zdCB1ID0gKChwaGkgLyAoTWF0aC5QSSAqIDIpKSAlIDEgKyAxKSAlIDE7XG4gIC8vIFRyZWFkaW5nIHdhdGVyLlxuICBjb25zdCBzYyA9IE1hdGguc2luKHBoaSk7XG4gIGNvbnN0IHRyZWFkOiBQb3NlID0ge1xuICAgIGhpcHNZOiAwLCBoaXBzWjogMCwgaGlwc1BpdGNoOiAwLjE2ICsgMC4wMyAqIE1hdGguc2luKHBoaSAqIDAuNSksIHRvcnNvUGl0Y2g6IDAsIGhlYWRQaXRjaDogLTAuMSxcbiAgICBhcm1MeDogLTAuNiArIDAuMzggKiBzYywgYXJtTHo6IDAuOTUgKyAwLjEyICogTWF0aC5jb3MocGhpKSwgYXJtUng6IC0wLjYgKyAwLjM4ICogc2MsIGFybVJ6OiAtMC45NSAtIDAuMTIgKiBNYXRoLmNvcyhwaGkpLFxuICAgIGxlZ0x4OiAtMC4zMiArIDAuMyAqIE1hdGguc2luKHBoaSksIGxlZ0x6OiAwLjE0LCBsZWdSeDogLTAuMzIgLSAwLjMgKiBNYXRoLnNpbihwaGkpLCBsZWdSejogLTAuMTQsXG4gIH07XG4gIC8vIEJyZWFzdHN0cm9rZTogcHVsbCAwLi4wLjQsIGFybSByZWNvdmVyeSAwLjQuLjAuNTgsIGtpY2sgMC41Li4wLjc1LCBnbGlkZS5cbiAgbGV0IGF4OiBudW1iZXIsIGF6OiBudW1iZXI7XG4gIGlmICh1IDwgMC40KSB7IGNvbnN0IGsgPSBzZWcodSwgMCwgMC40KTsgYXggPSBsZXJwKFJFQUNILCAtMC45NSwgayk7IGF6ID0gMC4xMiArIDAuODUgKiBNYXRoLnNpbihNYXRoLlBJICogayk7IH1cbiAgZWxzZSBpZiAodSA8IDAuNTgpIHsgY29uc3QgayA9IHNlZyh1LCAwLjQsIDAuNTgpOyBheCA9IGxlcnAoLTAuOTUsIFJFQUNILCBrKTsgYXogPSBsZXJwKDAuMTIsIDAuMDQsIGspOyB9XG4gIGVsc2UgeyBheCA9IFJFQUNIOyBheiA9IDAuMDQ7IH1cbiAgY29uc3Qga2ljayA9IHdoaXBLaWNrKHUsIDAuNDIsIDAuNTYsIDAuNzQpO1xuICBjb25zdCBsaWZ0ID0gdSA8IDAuNCA/IE1hdGguc2luKE1hdGguUEkgKiB1IC8gMC40KSA6IDA7IC8vIHRoZSBoZWFkIGxpZnRzIHRvIGJyZWF0aGUgZHVyaW5nIHRoZSBwdWxsXG4gIGNvbnN0IHN0cm9rZTogUG9zZSA9IHtcbiAgICBoaXBzWTogMC4wNSAqIGxpZnQsIGhpcHNaOiAwLCBoaXBzUGl0Y2g6IDAuOTUgLSAwLjE4ICogbGlmdCwgdG9yc29QaXRjaDogMCwgaGVhZFBpdGNoOiAwLFxuICAgIGFybUx4OiBheCwgYXJtTHo6IGF6LCBhcm1SeDogYXgsIGFybVJ6OiAtYXosXG4gICAgbGVnTHg6IGtpY2sueCwgbGVnTHo6IGtpY2sueiwgbGVnUng6IGtpY2sueCwgbGVnUno6IC1raWNrLnosXG4gIH07XG4gIGNvbnN0IHAgPSB7fSBhcyBQb3NlO1xuICBmb3IgKGNvbnN0IGsgb2YgS0VZUykgcFtrXSA9IGxlcnAodHJlYWRba10sIHN0cm9rZVtrXSwgbSk7XG4gIC8vIEtlZXAgdGhlIGZhY2UgZm9yd2FyZCBhbmQgdGhlIG5lY2sgYWJvdmUgdGhlIHdhdGVyIGxpbmUuXG4gIHAuaGVhZFBpdGNoIC09IHAuaGlwc1BpdGNoICogMC44NTtcbiAgY29uc3QgYm9iID0gMC4wMjIgKiBNYXRoLnNpbihmLnRpbWUgKiAxLjcpO1xuICBwLmhpcHNZID0gY2xhbXAod2F0ZXJMaW5lICsgTkVDS19DTEVBUiAtIE5FQ0sgKiBNYXRoLmNvcyhwLmhpcHNQaXRjaCkgKyBwLmhpcHNZICsgYm9iLCAwLjE1LCAxLjQpO1xuICBwLmhpcHNaID0gLTAuMzUgKiBNYXRoLnNpbihwLmhpcHNQaXRjaCk7XG4gIHJldHVybiBwO1xufVxuXG4vKipcbiAqIFVuZGVyd2F0ZXI6IGFuIHVuZGVyd2F0ZXIgYnJlYXN0c3Ryb2tlIChsb25nIHB1bGwgdG8gdGhlIHRoaWdocywgZ2xpZGUgd2l0aFxuICogdGhlIGFybXMgYmFjaywgcmVjb3ZlciBhbmQgcmVhY2gpLCB3aGlwIGtpY2ssIHRoZSB3aG9sZSBib2R5IHBpdGNoZWQgYWxvbmdcbiAqIHRoZSBzd2ltIGRpcmVjdGlvbiAoaGVhZCBkb3duIHdoZW4gZGl2aW5nLCBsZXZlbCB3aGVuIHN3aW1taW5nIGFsb25nKS5cbiAqL1xuZnVuY3Rpb24gdW5kZXJQb3NlKGY6IEZpZ3VyZSk6IFBvc2Uge1xuICBjb25zdCBwaGkgPSBmLnN3aW1QaGFzZTtcbiAgY29uc3QgdSA9ICgocGhpIC8gKE1hdGguUEkgKiAyKSkgJSAxICsgMSkgJSAxO1xuICBsZXQgYXg6IG51bWJlciwgYXo6IG51bWJlcjtcbiAgaWYgKHUgPCAwLjM1KSB7IGNvbnN0IGsgPSBzZWcodSwgMCwgMC4zNSk7IGF4ID0gbGVycChSRUFDSCAtIDAuMSwgMC4xMiwgayk7IGF6ID0gMC4xOCArIDAuNzUgKiBNYXRoLnNpbihNYXRoLlBJICogayk7IH1cbiAgZWxzZSBpZiAodSA8IDAuNSkgeyBheCA9IDAuMTI7IGF6ID0gMC4xMjsgfVxuICBlbHNlIGlmICh1IDwgMC43KSB7IGNvbnN0IGsgPSBzZWcodSwgMC41LCAwLjcpOyBheCA9IGxlcnAoMC4xMiwgUkVBQ0ggLSAwLjEsIGspOyBheiA9IGxlcnAoMC4xMiwgMC4wNiwgayk7IH1cbiAgZWxzZSB7IGF4ID0gUkVBQ0ggLSAwLjE7IGF6ID0gMC4wNjsgfVxuICBjb25zdCBraWNrID0gd2hpcEtpY2sodSwgMC41NSwgMC42OCwgMC44NSk7XG4gIHJldHVybiB7XG4gICAgaGlwc1k6IDAuODUsIGhpcHNaOiAwLCBoaXBzUGl0Y2g6IGYuZGl2ZVBpdGNoLCB0b3Jzb1BpdGNoOiAwLCBoZWFkUGl0Y2g6IC1jbGFtcChmLmRpdmVQaXRjaCAtIDAuMywgMCwgMC42KSAqIDAuNixcbiAgICBhcm1MeDogYXgsIGFybUx6OiBheiwgYXJtUng6IGF4LCBhcm1SejogLWF6LFxuICAgIGxlZ0x4OiBraWNrLngsIGxlZ0x6OiBraWNrLnosIGxlZ1J4OiBraWNrLngsIGxlZ1J6OiAta2ljay56LFxuICB9O1xufVxuXG4vKipcbiAqIFBvc2UgYSBmaWd1cmUgZnJvbSBpdHMgc2ltdWxhdGlvbiBzdGF0ZS4gV2Fsa2luZyBhbmQgcnVubmluZyBzd2luZyBsaW1icyBpblxuICogb3Bwb3NpdGlvbiB3aXRoIHN0cmlkZSBsZW5ndGggdGllZCB0byBhY3R1YWwgZ3JvdW5kIHNwZWVkOyBhaXJib3JuZSBwb3Nlc1xuICogdHVjayB0aGUgbGVnczsgd2FkaW5nIHNob3J0ZW5zIHRoZSBzdHJpZGUuIEluIGRlZXAgd2F0ZXIgKE0wMTEpIHRoZSBmaWd1cmVcbiAqIHRyZWFkcyB3YXRlciBvciBzd2ltcyBhIGJyZWFzdHN0cm9rZSBhdCB0aGUgc3VyZmFjZSwgaGVhZCBhbmQgc2hvdWxkZXJzIG91dCxcbiAqIGFuZCBzd2ltcyBhbiB1bmRlcndhdGVyIGJyZWFzdHN0cm9rZSBwaXRjaGVkIHRvd2FyZCBpdHMgZGlyZWN0aW9uIHdoZW5cbiAqIHN1Ym1lcmdlZC4gUmVnaW1lcyBjcm9zcy1mYWRlIG92ZXIgYSBmZXcgdGVudGhzIG9mIGEgc2Vjb25kLlxuICpcbiAqIGBmZWV0WWAgaXMgdGhlIGRyYXduIGZlZXQgaGVpZ2h0ICh0aGUgaW50ZXJwb2xhdGVkIHBvc2l0aW9uIHRoZSBmaWd1cmUgaXNcbiAqIHBsYWNlZCBhdCk7IGl0IGRlZmF1bHRzIHRvIGBzdGF0ZS55YC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFuaW1hdGVGaWd1cmUoZjogRmlndXJlLCBzdGF0ZTogQ2hhcmFjdGVyU3RhdGUsIGR0OiBudW1iZXIsIGZlZXRZID0gc3RhdGUueSk6IHZvaWQge1xuICBmLnRpbWUgKz0gZHQ7XG4gIGNvbnN0IHNwZWVkID0gc3RhdGUuc3BlZWQ7XG4gIGNvbnN0IHN0cmlkZSA9IHN0YXRlLm1vZGUgPT09ICd3YWRlJyA/IDEuNiA6IDIuNDtcbiAgZi5waGFzZSArPSAoc3BlZWQgLyBzdHJpZGUpICogTWF0aC5QSSAqIDIgKiBkdDtcblxuICAvLyBXaGljaCByZWdpbWU6IHVuZGVyd2F0ZXIgb25jZSB0aGUgaGVhZCBpcyB1bmRlciAob3IgdGhlIGZlZXQgYXJlIHdlbGwgYmVsb3cgdGhlIGZsb2F0IGxpbmUpLlxuICBjb25zdCBzd2ltID0gc3RhdGUubW9kZSA9PT0gJ3N3aW0nO1xuICBjb25zdCBzdXJmYWNlWSA9IE51bWJlci5pc0Zpbml0ZShzdGF0ZS53YXRlclN1cmZhY2UpID8gc3RhdGUud2F0ZXJTdXJmYWNlIDogZmVldFk7XG4gIGNvbnN0IHVuZGVyID0gc3dpbSAmJiAoc3RhdGUuaGVhZFVuZGVyd2F0ZXIgfHwgc3RhdGUueSA8IHN1cmZhY2VZIC0gMS43NSk7XG4gIGNvbnN0IHRhcmdldCA9IHtcbiAgICBncm91bmQ6ICFzd2ltICYmIHN0YXRlLm1vZGUgIT09ICdhaXInID8gMSA6IDAsXG4gICAgYWlyOiBzdGF0ZS5tb2RlID09PSAnYWlyJyA/IDEgOiAwLFxuICAgIHN1cmZhY2U6IHN3aW0gJiYgIXVuZGVyID8gMSA6IDAsXG4gICAgdW5kZXI6IHVuZGVyID8gMSA6IDAsXG4gIH07XG4gIGNvbnN0IGtiID0gMSAtIE1hdGguZXhwKC1kdCAqIChzdGF0ZS5tb2RlID09PSAnYWlyJyB8fCBmLmJsZW5kLmFpciA+IDAuMDEgPyAxMiA6IDcpKTtcbiAgY29uc3QgYiA9IGYuYmxlbmQ7XG4gIGIuZ3JvdW5kICs9ICh0YXJnZXQuZ3JvdW5kIC0gYi5ncm91bmQpICoga2I7XG4gIGIuYWlyICs9ICh0YXJnZXQuYWlyIC0gYi5haXIpICoga2I7XG4gIGIuc3VyZmFjZSArPSAodGFyZ2V0LnN1cmZhY2UgLSBiLnN1cmZhY2UpICoga2I7XG4gIGIudW5kZXIgKz0gKHRhcmdldC51bmRlciAtIGIudW5kZXIpICoga2I7XG4gIGNvbnN0IHN1bSA9IGIuZ3JvdW5kICsgYi5haXIgKyBiLnN1cmZhY2UgKyBiLnVuZGVyIHx8IDE7XG5cbiAgLy8gU3Ryb2tlIHJoeXRobSB0aWVkIHRvIHRoZSBzd2ltIHNwZWVkOiB0cmVhZGluZyB+MC41NSBIeiwgZnVsbCBicmVhc3RzdHJva2UgfjEuMSBIei5cbiAgY29uc3QgdnkgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUudnkpID8gc3RhdGUudnkgOiAwO1xuICBjb25zdCBzd2ltU3BlZWQgPSBNYXRoLmh5cG90KHNwZWVkLCB2eSk7XG4gIGYuc3Ryb2tlICs9IChjbGFtcChzcGVlZCAvIDEuOCwgMCwgMSkgLSBmLnN0cm9rZSkgKiAoMSAtIE1hdGguZXhwKC1kdCAqIDQpKTtcbiAgY29uc3QgaHogPSB1bmRlciA/IDAuNCArIDAuMiAqIE1hdGgubWluKHN3aW1TcGVlZCwgMi42KSA6IGxlcnAoMC41NSwgMC41ICsgMC4yNSAqIHNwZWVkLCBmLnN0cm9rZSk7XG4gIGlmIChiLnN1cmZhY2UgKyBiLnVuZGVyID4gMC4wMDEpIGYuc3dpbVBoYXNlICs9IE1hdGguUEkgKiAyICogaHogKiBkdDtcbiAgLy8gVW5kZXJ3YXRlciB0aGUgYm9keSBwb2ludHMgYWxvbmcgdGhlIHN3aW0gZGlyZWN0aW9uICgwID0gdXByaWdodCByaXNpbmcsIFBJID0gaGVhZCBkb3duKS5cbiAgLy8gT3V0IG9mIHRoZSBkaXZlIGl0IGZvbGxvd3MgdGhlIGRyYXduIGJvZHkgcGl0Y2gsIHNvIGEgZGl2ZSBzdGFydHMgZnJvbSB0aGUgY3VycmVudCBwb3NlO1xuICAvLyB0aGUgdHVybiByYXRlIGlzIGxpbWl0ZWQgKGEgZHVjayBkaXZlIHRha2VzIGFib3V0IGhhbGYgYSBzZWNvbmQpLlxuICAvLyBIb3ZlcmluZyBzdGlsbCB1bmRlcndhdGVyIChvciBoZWxkIG9uIHRoZSBiZWQgYnkgRGl2ZSksIHRoZSBib2R5IGxpZXMgcHJvbmUuXG4gIGNvbnN0IHdhbnRQaXRjaCA9ICF1bmRlciA/IGYuaGlwcy5yb3RhdGlvbi54IDogc3dpbVNwZWVkIDwgMC4zNSA/IDEuMzUgOiBjbGFtcChNYXRoLmF0YW4yKHNwZWVkLCB2eSksIDAuMTUsIDIuOSk7XG4gIGNvbnN0IHR1cm4gPSAod2FudFBpdGNoIC0gZi5kaXZlUGl0Y2gpICogKDEgLSBNYXRoLmV4cCgtZHQgKiA1KSk7XG4gIGYuZGl2ZVBpdGNoICs9IGNsYW1wKHR1cm4sIC00ICogZHQsIDQgKiBkdCk7XG5cbiAgY29uc3QgcGFydHM6IEFycmF5PFtudW1iZXIsIFBvc2VdPiA9IFtdO1xuICBpZiAoYi5ncm91bmQgPiAwLjAwMSkgcGFydHMucHVzaChbYi5ncm91bmQgLyBzdW0sIGdyb3VuZFBvc2UoZiwgc3RhdGUpXSk7XG4gIGlmIChiLmFpciA+IDAuMDAxKSBwYXJ0cy5wdXNoKFtiLmFpciAvIHN1bSwgQUlSX1BPU0VdKTtcbiAgaWYgKGIuc3VyZmFjZSA+IDAuMDAxKSBwYXJ0cy5wdXNoKFtiLnN1cmZhY2UgLyBzdW0sIHN1cmZhY2VQb3NlKGYsIHN1cmZhY2VZIC0gV0FURVJfRFJBV19EUk9QIC0gZmVldFkpXSk7XG4gIGlmIChiLnVuZGVyID4gMC4wMDEpIHBhcnRzLnB1c2goW2IudW5kZXIgLyBzdW0sIHVuZGVyUG9zZShmKV0pO1xuICBjb25zdCBwID0ge30gYXMgUG9zZTtcbiAgZm9yIChjb25zdCBrIG9mIEtFWVMpIHsgbGV0IHYgPSAwOyBmb3IgKGNvbnN0IFt3LCBxXSBvZiBwYXJ0cykgdiArPSB3ICogcVtrXTsgcFtrXSA9IHY7IH1cblxuICBmLmhpcHMucG9zaXRpb24uc2V0KDAsIHAuaGlwc1ksIHAuaGlwc1opO1xuICBmLmhpcHMucm90YXRpb24ueCA9IHAuaGlwc1BpdGNoO1xuICBmLnRvcnNvLnJvdGF0aW9uLnggPSBwLnRvcnNvUGl0Y2g7XG4gIGYuaGVhZC5yb3RhdGlvbi54ID0gcC5oZWFkUGl0Y2g7XG4gIGYuYXJtTC5yb3RhdGlvbi54ID0gcC5hcm1MeDsgZi5hcm1MLnJvdGF0aW9uLnogPSBwLmFybUx6O1xuICBmLmFybVIucm90YXRpb24ueCA9IHAuYXJtUng7IGYuYXJtUi5yb3RhdGlvbi56ID0gcC5hcm1SejtcbiAgZi5sZWdMLnJvdGF0aW9uLnggPSBwLmxlZ0x4OyBmLmxlZ0wucm90YXRpb24ueiA9IHAubGVnTHo7XG4gIGYubGVnUi5yb3RhdGlvbi54ID0gcC5sZWdSeDsgZi5sZWdSLnJvdGF0aW9uLnogPSBwLmxlZ1J6O1xuXG4gIC8vIEZvYW0gcmluZyBhdCB0aGUgd2F0ZXIgbGluZSB3aGlsZSBzd2ltbWluZyBhdCB0aGUgc3VyZmFjZSAob3Igd2FkaW5nKTpcbiAgLy8gcHVsc2VzIHdpdGggdGhlIHN0cm9rZSBhbmQgd2lkZW5zIHdpdGggc3BlZWQuXG4gIGNvbnN0IHdldCA9IHN3aW0gPyBiLnN1cmZhY2UgLyBzdW0gOiBzdGF0ZS5tb2RlID09PSAnd2FkZScgPyAwLjYgKiAoYi5ncm91bmQgLyBzdW0pIDogMDtcbiAgaWYgKHdldCA+IDAuMDIgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXRlLndhdGVyU3VyZmFjZSkpIHtcbiAgICBjb25zdCBrID0gd2V0ICogKDAuODUgKyAwLjE1ICogTWF0aC5zaW4oZi5zd2ltUGhhc2UgKiAyICsgMC42KSArIDAuMSAqIGNsYW1wKHNwZWVkIC8gMi40LCAwLCAxKSk7XG4gICAgZi5yaXBwbGUuc2NhbGUuc2V0KGsgKiAoMSArIDAuMDUgKiBjbGFtcChzcGVlZCwgMCwgMikpLCAxLCBrICogKDEgKyAwLjEyICogY2xhbXAoc3BlZWQsIDAsIDIpKSk7XG4gICAgZi5yaXBwbGUucG9zaXRpb24uc2V0KDAsIHN1cmZhY2VZIC0gV0FURVJfRFJBV19EUk9QICsgMC4wMSAtIGZlZXRZLCBwLmhpcHNaICogMC42KTtcbiAgICBmLnJpcHBsZS5yb3RhdGlvbi55ID0gZi50aW1lICogMC40O1xuICB9IGVsc2Uge1xuICAgIGYucmlwcGxlLnNjYWxlLnNldFNjYWxhcigwKTtcbiAgfVxufVxuXG4vKiogUGxhY2UgdGhlIGZpZ3VyZSBhdCB0aGUgY2hhcmFjdGVyIHN0YXRlIChmZWV0IHBvc2l0aW9uLCBoZWFkaW5nKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUZpZ3VyZShmOiBGaWd1cmUsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIGhlYWRpbmc6IG51bWJlcik6IHZvaWQge1xuICBmLnJvb3QucG9zaXRpb24uc2V0KHgsIHksIHopO1xuICBmLnJvb3Qucm90YXRpb24ueSA9IGhlYWRpbmc7XG59XG4iLCAie1xuICBcInNjaGVtYVwiOiBcInBhbGV0dGVfdjJcIixcbiAgXCJkYXRlXCI6IFwiMjAyNi0xMC0yMlwiLFxuICBcInN0YXR1c1wiOiBcInByb3Bvc2VkXCIsXG4gIFwic291cmNlXCI6IFwiUkVGLTAwMiAoaHlicmlkIHdvcmxkIHJlZmVyZW5jZSksIHZhbHVlcyBzYW1wbGVkIGJ5IGV5ZTsgbnVtZXJpYyB2ZXJpZmljYXRpb24gcGVuZGluZ1wiLFxuICBcIm5vdGVcIjogXCJPbmUgbWF0ZXJpYWwgcGFsZXR0ZS4gVGltZSBvZiBkYXkgaXMgZXhwcmVzc2VkIGJ5IHRoZSBsaWdodGluZyBwcmVzZXRzIGJlbG93LCBub3QgYnkgcmVwYWludGluZyBtYXRlcmlhbHMuXCIsXG4gIFwibWF0ZXJpYWxzXCI6IHtcbiAgICBcImdyYXNzX3RvcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM3OUI5NENcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBsb3cgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfaGlnaFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4RkM5NUVcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBtaWQgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfcGVha1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QUQwNkFcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBoaWdoIGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX2NhcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RTk0NDBcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjAtMC40IG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX29jaHJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M5OUE1RlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuNC0wLjYyIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX3J1c3RcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjQ2MzNDXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC42Mi0wLjgwIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RvbmVfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiYmFyZSBzdG9uZSB0b3Agc3VyZmFjZVwiXG4gICAgfSxcbiAgICBcInN0b25lX2JvZHlfYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEQ0QzQkVcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYm9keSwgZXZlbiA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QxQzdBRlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBvZGQgNC41IG0gYmFuZFwiXG4gICAgfSxcbiAgICBcInN0b25lX3NoYWRlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I5QUU5NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY3JldmljZSAvIHJlY2Vzc2VkIHN0b25lIGFjY2VudFwiXG4gICAgfSxcbiAgICBcInNhbmRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTNEM0E2XCIsXG4gICAgICBcInJvbGVcIjogXCJzaG9yZSBjZWxsc1wiXG4gICAgfSxcbiAgICBcInNub3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRUVGMUY1XCIsXG4gICAgICBcInJvbGVcIjogXCJnZW5lcmF0b3IgdjIgc25vd2ZpZWxkcyBhYm92ZSB0aGUgc25vd2xpbmUgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3NraW5cIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDlBNzdFXCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgc2tpbiAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHVuaWNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjM0QTNDXCIsXG4gICAgICBcInJvbGVcIjogXCJmb3VuZGVyIHR1bmljLCB3YXJtIHJlZCBhY2NlbnQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3R1bmljX2FsdFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRThDODZcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2VyIHR1bmljLCB0ZWFsIGFjY2VudCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHJvdXNlcnNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUI0NjM2XCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgdHJvdXNlcnMgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX2hhaXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEEzMzI0XCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgaGFpciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfYm9vdHNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMzMyODFGXCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgYm9vdHMgYW5kIGJlbHQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9kZWVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhDNUIzQVwiLFxuICAgICAgXCJyb2xlXCI6IFwicmVkIGRlZXIgY29hdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2xpZ2h0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0RDQzdBNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiZGVlciBiZWxseSwgaGFyZSB0YWlsLCBhbnRsZXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9oYXJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlBODY3MFwiLFxuICAgICAgXCJyb2xlXCI6IFwiaGFyZSBjb2F0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfdHJvdXRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkY3RjVFXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cm91dCBiYWNrIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfdHJvdXRfYmVsbHlcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDhDOUEzXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cm91dCBiZWxseSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfcGxhc3RlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFOEREQzZcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2Ugd2FsbCBwbGFzdGVyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aW1iZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkE0NTMwXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHRpbWJlciBmcmFtZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGltYmVyX2xpZ2h0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhBNjE0MlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSBwbGFua3MgYW5kIGRvb3JzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aGF0Y2hcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzdBMjU3XCIsXG4gICAgICBcInJvbGVcIjogXCJ0aGF0Y2ggcm9vZiAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGhhdGNoX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUM3QjNDXCIsXG4gICAgICBcInJvbGVcIjogXCJ0aGF0Y2ggcm9vZiBzaGFkZSBjb3Vyc2UgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3N0b25lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlCOUE5MVwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSBtYXNvbnJ5IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9zdG9uZV9kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzc0NzM2Q1wiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSBtYXNvbnJ5IGpvaW50cyBhbmQgcGxpbnRoIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwicHJvcF9pcm9uXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBM0EzRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiaXJvbiBmaXR0aW5ncyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcInByb3BfZ2xvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGRkQyN0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImxhbnRlcm4gbGlnaHQgKGVtaXNzaXZlLCBlZmZlY3Qgb25seSkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9zaGFsbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzY3Q0ZEOFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggPD0gMC41IG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9taWRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0FBRkM0XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCB+MS41IG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9kZWVwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJBOEZBOFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggPj0gNC4wIG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9yaW1cIjoge1xuICAgICAgXCJoZXhcIjogXCIjQkZFQUYwXCIsXG4gICAgICBcInJvbGVcIjogXCJzaG9yZWxpbmUgcmltIC8gZm9hbSB0aW50XCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2FcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUZBODNGXCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RkI4NEFcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2NcIjoge1xuICAgICAgXCJoZXhcIjogXCIjN0ZDMzU2XCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIGhpZ2hsaWdodCBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X3BpbmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRjJBNkM0XCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIGFjY2VudCBzcGVjaWVzIG9ubHlcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua19iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U4OEZCMlwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmxvc3NvbSBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwidHJ1bmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkI0QTMzXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cmVlIHRydW5rc1wiXG4gICAgfSxcbiAgICBcImJhcmtfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM0RTM2MjZcIixcbiAgICAgIFwicm9sZVwiOiBcInRydW5rIHNoYWRlLCBzdHVtcHNcIlxuICAgIH0sXG4gICAgXCJjb25pZmVyX3BpbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEM4QTRBXCIsXG4gICAgICBcInJvbGVcIjogXCJwaW5lIG5lZWRsZXMsIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImNvbmlmZXJfcGluZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVDOUM1M1wiLFxuICAgICAgXCJyb2xlXCI6IFwicGluZSBuZWVkbGVzLCBoaWdobGlnaHRcIlxuICAgIH0sXG4gICAgXCJjb25pZmVyX3NwcnVjZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRjZCNDhcIixcbiAgICAgIFwicm9sZVwiOiBcInNwcnVjZSBuZWVkbGVzLCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjb25pZmVyX3NwcnVjZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNFN0Y1NlwiLFxuICAgICAgXCJyb2xlXCI6IFwic3BydWNlIG5lZWRsZXMsIGhpZ2hsaWdodFwiXG4gICAgfSxcbiAgICBcImJpcmNoX2JhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZFMUQzXCIsXG4gICAgICBcInJvbGVcIjogXCJwYWxlIGJpcmNoIHRydW5rXCJcbiAgICB9LFxuICAgIFwiYmlyY2hfbWFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQTM1MzBcIixcbiAgICAgIFwicm9sZVwiOiBcImRhcmsgYmlyY2ggYmFyayBiYW5kXCJcbiAgICB9LFxuICAgIFwiYmlyY2hfbGVhZlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5Q0M5NUFcIixcbiAgICAgIFwicm9sZVwiOiBcImJpcmNoIGNhbm9weSwgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiYmlyY2hfbGVhZl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0IzRDc2QlwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmlyY2ggY2Fub3B5LCBoaWdobGlnaHRcIlxuICAgIH0sXG4gICAgXCJiZWVjaF9iYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhFODk3RFwiLFxuICAgICAgXCJyb2xlXCI6IFwic21vb3RoIGdyZXkgYmVlY2ggdHJ1bmtcIlxuICAgIH0sXG4gICAgXCJiZWVjaF9sZWFmXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzU1OEYzQVwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmVlY2ggY2Fub3B5LCBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwiYmVlY2hfbGVhZl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzY3QTQ0NVwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmVlY2ggY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJidXNoX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNDY3RjM3XCIsXG4gICAgICBcInJvbGVcIjogXCJiZXJyeSBidXNoIGxlYXZlc1wiXG4gICAgfSxcbiAgICBcImJlcnJ5X3JlZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDODM5NEFcIixcbiAgICAgIFwicm9sZVwiOiBcImJlcnJpZXNcIlxuICAgIH0sXG4gICAgXCJmZXJuX2dyZWVuXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzg2QkU1NVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZmVybiBmcm9uZHMsIG1haW5cIlxuICAgIH0sXG4gICAgXCJmZXJuX2dyZWVuX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkZBNzQ2XCIsXG4gICAgICBcInJvbGVcIjogXCJmZXJuIGZyb25kcywgc2hhZGVcIlxuICAgIH0sXG4gICAgXCJmbG93ZXJfeWVsbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0YyQ0Y0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBtZWFkb3cgZmxvd2VyIGhlYWRzXCJcbiAgICB9LFxuICAgIFwiZmxvd2VyX3doaXRlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Y0RjFFNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBkYWlzeSBmbG93ZXIgaGVhZHNcIlxuICAgIH0sXG4gICAgXCJmbG93ZXJfdmlvbGV0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlDN0JENlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiB2aW9sZXQgZmxvd2VyIGhlYWRzXCJcbiAgICB9LFxuICAgIFwibXVzaHJvb21fY2FwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I4NDgzQVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBmb3Jlc3QgbXVzaHJvb20gY2FwXCJcbiAgICB9LFxuICAgIFwibXVzaHJvb21fc3RlbVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFREUzQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogbXVzaHJvb20gc3RlbVwiXG4gICAgfSxcbiAgICBcIm1vc3NfZ3JlZW5cIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUM4QzNBXCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IG1vc3Mgb24gZmFsbGVuIGxvZ3NcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM3QjVBRDZcIixcbiAgICAgIFwicm9sZVwiOiBcIm9yZSBkZXBvc2l0IGFjY2VudCAocHJvcG9zZWQsIHJlcGxhY2VzIHRlYWwpXCJcbiAgICB9LFxuICAgIFwib3JlX2NyeXN0YWxfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QjdCRThcIixcbiAgICAgIFwicm9sZVwiOiBcIm9yZSBoaWdobGlnaHQgZmFjZXRcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkRGQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcIk5veGVsIGFyY2hpdGVjdHVyZSBtYWluIHN0b25lXCJcbiAgICB9LFxuICAgIFwibm94ZWxfc3RvbmVfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEM0M5QjRcIixcbiAgICAgIFwicm9sZVwiOiBcIk5veGVsIHNlY29uZGFyeSBzdG9uZSAvIHJlY2Vzc1wiXG4gICAgfSxcbiAgICBcImFjY2VudF9ibHVlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNFN0ZCOFwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmFubmVyIC8gY2xvdGggYWNjZW50XCJcbiAgICB9LFxuICAgIFwiYWNjZW50X3RlYWxcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkZBNkEwXCIsXG4gICAgICBcInJvbGVcIjogXCJzZWNvbmRhcnkgYWNjZW50XCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfZmlyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNGRjlFNEFcIixcbiAgICAgIFwicm9sZVwiOiBcImNhbXBmaXJlIC8gd2FybSBlbWlzc2l2ZSAoZWZmZWN0cyBvbmx5KVwiXG4gICAgfSxcbiAgICBcImVtaXNzaXZlX21hZ2ljXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QyNEJGRlwiLFxuICAgICAgXCJyb2xlXCI6IFwicmVzZXJ2ZWQ6IG1hZ2ljIGVmZmVjdHMgb25seSwgbmV2ZXIgbWF0ZXJpYWxzXCJcbiAgICB9XG4gIH0sXG4gIFwibGlnaHRpbmdcIjoge1xuICAgIFwiZGF3blwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiAxMixcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAxMDUsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGQzc5QVwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi4yLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzhGQTZDOFwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzRFNUY2RVwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDAuNixcbiAgICAgIFwic2t5XCI6IFwiI0E4QkVENlwiLFxuICAgICAgXCJmb2dcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMVxuICAgIH0sXG4gICAgXCJub29uXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDM4LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDUwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkY0RENcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDIuNzUsXG4gICAgICBcImhlbWlTa3lcIjogXCIjQkZEOUYyXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjN0E4RjU1XCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC41NSxcbiAgICAgIFwic2t5XCI6IFwiIzlFRDJFRVwiLFxuICAgICAgXCJmb2dcIjogXCIjRENFRkY4XCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDI4LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjA1XG4gICAgfSxcbiAgICBcImR1c2tcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogOSxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAyNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGQjI3QVwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMy4yLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzhFN0M5RVwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzVBNEE1MFwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDEuMSxcbiAgICAgIFwic2t5XCI6IFwiI0M5OEU4NlwiLFxuICAgICAgXCJmb2dcIjogXCIjQzA5MDhBXCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDM2LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjMyXG4gICAgfSxcbiAgICBcIm5pZ2h0XCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDQwLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDIyMCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjQUZDOEZGXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAxLjAsXG4gICAgICBcImhlbWlTa3lcIjogXCIjM0E0QzdBXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjMUMyNTQwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4wNSxcbiAgICAgIFwic2t5XCI6IFwiIzEwMTczNlwiLFxuICAgICAgXCJmb2dcIjogXCIjMTUxQzNDXCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDQ1LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjVcbiAgICB9XG4gIH1cbn0iLCAiLy8gUmVuZGVyIGxheWVyIFx1MjAxNCBuZWFyIHdhdGVyIHN1cmZhY2VzIGJ1aWx0IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd2F0ZXIgdm94ZWxzLlxuLy9cbi8vIEdlb21ldHJ5IGNvbWVzIGZyb20gdGhlIHZveGVsIHZvbHVtZSAoc28gZWRpdHMsIGR1ZyBwaXRzIGFuZCB0aGUgdjIgbW91bnRhaW5cbi8vIHJpdmVyIGFyZSBleGFjdCkuIEVhY2ggd2F0ZXIgY29sdW1uJ3MgdG9wIGdldHMgYSBxdWFkIGNhcnJ5aW5nOlxuLy8gICBhRmxvdyAgXHUyMDE0IHN1cmZhY2UgY3VycmVudCAoZGlyZWN0aW9uICogc3BlZWQsIG0vcykgZnJvbSBzaW0gSHlkcm9sb2d5LFxuLy8gICBhRGVwdGggXHUyMDE0IHdhdGVyIGRlcHRoIHRvIHRoZSBiZWQgKG1ldHJlcyksXG4vLyAgIGFGb2FtICBcdTIwMTQgc2hvcmUgLyBjYXNjYWRlIGZvYW0gd2VpZ2h0LlxuLy8gV2hlcmUgYSB3YXRlciBzdXJmYWNlIHN0YW5kcyBhYm92ZSBhIGxvd2VyIG5laWdoYm91ciAoYSBjYXNjYWRlIG9yIGZhbGwpLCBhXG4vLyB2ZXJ0aWNhbCBzaGVldCBpcyBlbWl0dGVkIGRvd24gdG8gdGhlIG5laWdoYm91cidzIHN1cmZhY2UuXG4vL1xuLy8gSHlkcm9sb2d5IGlzIHNpbXVsYXRpb24gZGF0YTsgcmlwcGxlcywgZm9hbSBhbmQgdHJhbnNwYXJlbmN5IGhlcmUgYXJlXG4vLyBwcmVzZW50YXRpb24gb25seSBhbmQgbmV2ZXIgZmVlZCBiYWNrIGludG8gc3RhdGUuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQge1xuICBXb3JsZCwgVm94ZWxDaHVuaywgTUFULCBDSFVOS19TSVpFLCBZX01JTiwgWV9NQVgsIGlzU29saWQsXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgZ2V0Vm94ZWwsIGh5ZHJvbG9neUZvcixcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcblxuY29uc3QgTSA9IHBhbGV0dGUubWF0ZXJpYWxzIGFzIFJlY29yZDxzdHJpbmcsIHsgaGV4OiBzdHJpbmcgfT47XG5jb25zdCBIID0gKGs6IHN0cmluZykgPT4gbmV3IFRIUkVFLkNvbG9yKE1ba10uaGV4KTtcblxuLyoqIFRoZSBkcmF3biB3YXRlciBzdXJmYWNlIHNpdHMgdGhpcyBmYXIgYmVsb3cgdGhlIHRvcCBvZiB0aGUgd2F0ZXIgdm94ZWxzICh0aGUgc2ltIHN1cmZhY2UpLiAqL1xuZXhwb3J0IGNvbnN0IFdBVEVSX0RSQVdfRFJPUCA9IDAuMTtcblxuLyoqIFNoYXJlZCB0aW1lIHVuaWZvcm0gZm9yIGV2ZXJ5IHdhdGVyIG1hdGVyaWFsLiAqL1xuZXhwb3J0IGNvbnN0IHdhdGVyVGltZSA9IHsgdmFsdWU6IDAgfTtcblxuZnVuY3Rpb24gbWFrZVdhdGVyTWF0ZXJpYWwoKTogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB7XG4gIGNvbnN0IG1hdCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsIHRyYW5zcGFyZW50OiB0cnVlLCBkZXB0aFdyaXRlOiBmYWxzZSwgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgfSk7XG4gIG1hdC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVUaW1lID0gd2F0ZXJUaW1lO1xuICAgIHNoYWRlci51bmlmb3Jtcy51U2hhbGxvdyA9IHsgdmFsdWU6IEgoJ3dhdGVyX3NoYWxsb3cnKSB9O1xuICAgIHNoYWRlci51bmlmb3Jtcy51TWlkID0geyB2YWx1ZTogSCgnd2F0ZXJfbWlkJykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudURlZXAgPSB7IHZhbHVlOiBIKCd3YXRlcl9kZWVwJykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudVJpbSA9IHsgdmFsdWU6IEgoJ3dhdGVyX3JpbScpIH07XG4gICAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxuYXR0cmlidXRlIHZlYzIgYUZsb3c7XG5hdHRyaWJ1dGUgZmxvYXQgYURlcHRoO1xuYXR0cmlidXRlIGZsb2F0IGFGb2FtO1xuYXR0cmlidXRlIGZsb2F0IGFTaGVldDtcbnZhcnlpbmcgdmVjMiB2RmxvdztcbnZhcnlpbmcgZmxvYXQgdkRlcHRoO1xudmFyeWluZyBmbG9hdCB2Rm9hbTtcbnZhcnlpbmcgZmxvYXQgdlNoZWV0O1xudmFyeWluZyB2ZWMzIHZXb3JsZFBvc1c7YClcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsIGAjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxudkZsb3cgPSBhRmxvdzsgdkRlcHRoID0gYURlcHRoOyB2Rm9hbSA9IGFGb2FtOyB2U2hlZXQgPSBhU2hlZXQ7XG52V29ybGRQb3NXID0gKG1vZGVsTWF0cml4ICogdmVjNCh0cmFuc2Zvcm1lZCwgMS4wKSkueHl6O2ApO1xuICAgIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XG51bmlmb3JtIGZsb2F0IHVUaW1lO1xudW5pZm9ybSB2ZWMzIHVTaGFsbG93OyB1bmlmb3JtIHZlYzMgdU1pZDsgdW5pZm9ybSB2ZWMzIHVEZWVwOyB1bmlmb3JtIHZlYzMgdVJpbTtcbnZhcnlpbmcgdmVjMiB2RmxvdztcbnZhcnlpbmcgZmxvYXQgdkRlcHRoO1xudmFyeWluZyBmbG9hdCB2Rm9hbTtcbnZhcnlpbmcgZmxvYXQgdlNoZWV0O1xudmFyeWluZyB2ZWMzIHZXb3JsZFBvc1c7XG5mbG9hdCB3SGFzaCh2ZWMyIHApIHsgcmV0dXJuIGZyYWN0KHNpbihkb3QocCwgdmVjMigxMjcuMSwgMzExLjcpKSkgKiA0Mzc1OC41NDUzKTsgfVxuZmxvYXQgd05vaXNlKHZlYzIgcCkge1xuICB2ZWMyIGkgPSBmbG9vcihwKSwgZiA9IGZyYWN0KHApO1xuICBmID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gIHJldHVybiBtaXgobWl4KHdIYXNoKGkpLCB3SGFzaChpICsgdmVjMigxLCAwKSksIGYueCksIG1peCh3SGFzaChpICsgdmVjMigwLCAxKSksIHdIYXNoKGkgKyB2ZWMyKDEsIDEpKSwgZi54KSwgZi55KTtcbn1gKVxuICAgICAgLnJlcGxhY2UoJ3ZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSwgb3BhY2l0eSApOycsIGBcbmZsb2F0IHNwZWVkID0gbGVuZ3RoKHZGbG93KTtcbi8vIEFkdmVjdCB0aGUgcGF0dGVybiBkb3duc3RyZWFtLiBRdWFudGlzZWQgdG8gMC4yNSBtIGNlbGxzIHNvIHJpcHBsZXMgcmVhZCBhc1xuLy8gYmxvY2stYnVpbHQgZmFjZXRzIHJhdGhlciB0aGFuIHNtb290aCBncmFkaWVudHMuXG52ZWMyIHAgPSB2V29ybGRQb3NXLnh6O1xudmVjMiBhZHYgPSBwIC0gdkZsb3cgKiB1VGltZTtcbnZlYzIgY2VsbCA9IGZsb29yKGFkdiAqIDQuMCkgLyA0LjA7XG5mbG9hdCBuMSA9IHdOb2lzZShjZWxsICogMC41NSk7XG5mbG9hdCBuMiA9IHdOb2lzZShjZWxsICogMS43ICsgdmVjMih1VGltZSAqIDAuMDcsIC11VGltZSAqIDAuMDUpKTtcbmZsb2F0IHJpcHBsZSA9IG4xICogMC42ICsgbjIgKiAwLjQ7XG4vLyBTdGlsbCB3YXRlciAoc2VhLCBsYWtlKSBnZXRzIGEgc2xvdyBzd2VsbCBpbnN0ZWFkIG9mIGEgY3VycmVudC5cbmZsb2F0IHN3ZWxsID0gMC41ICsgMC41ICogc2luKGRvdChwLCB2ZWMyKDAuMTEsIDAuMDcpKSArIHVUaW1lICogMC42KTtcbnJpcHBsZSA9IG1peChtaXgocmlwcGxlLCBzd2VsbCwgMC41KSwgcmlwcGxlLCBjbGFtcChzcGVlZCAqIDIuMCwgMC4wLCAxLjApKTtcbmZsb2F0IGQgPSBjbGFtcCh2RGVwdGggLyA0LjAsIDAuMCwgMS4wKTtcbnZlYzMgd2F0ZXIgPSBtaXgodVNoYWxsb3csIHVNaWQsIHNtb290aHN0ZXAoMC4wLCAwLjUsIGQpKTtcbndhdGVyID0gbWl4KHdhdGVyLCB1RGVlcCwgc21vb3Roc3RlcCgwLjUsIDEuMCwgZCkpO1xud2F0ZXIgKj0gMC45ICsgMC4yICogcmlwcGxlO1xuLy8gU3RyZWFrcyBhbG9uZyBmYXN0IGN1cnJlbnQsIGZvYW0gYXQgc2hvcmVzIGFuZCBjYXNjYWRlcy5cbmZsb2F0IHN0cmVhayA9IHN0ZXAoMC43OCAtIGNsYW1wKHNwZWVkICogMC4wNiwgMC4wLCAwLjIpLCBuMikgKiBjbGFtcChzcGVlZCAqIDAuNSwgMC4wLCAxLjApO1xuZmxvYXQgZm9hbU5vaXNlID0gc3RlcCgwLjQ1LCB3Tm9pc2UoY2VsbCAqIDIuMyArIHVUaW1lICogMC4zKSk7XG5mbG9hdCBmb2FtID0gY2xhbXAodkZvYW0gKiBmb2FtTm9pc2UgKyBzdHJlYWsgKiAwLjYsIDAuMCwgMS4wKTtcbi8vIEZhbGxpbmcgc2hlZXRzOiBmYXN0IHZlcnRpY2FsIHN0cmVha3MuXG5pZiAodlNoZWV0ID4gMC41KSB7XG4gIGZsb2F0IGZhbGwgPSB3Tm9pc2UodmVjMihmbG9vcih2V29ybGRQb3NXLnggKiA0LjAgKyB2V29ybGRQb3NXLnogKiA0LjApLCBmbG9vcigodldvcmxkUG9zVy55ICsgdVRpbWUgKiAzLjUpICogMy4wKSkpO1xuICBmb2FtID0gbWF4KGZvYW0sIHN0ZXAoMC4zNSwgZmFsbCkpO1xufVxudmVjMyBjb2wgPSBtaXgod2F0ZXIsIHVSaW0gKiAxLjA4LCBmb2FtKTtcbmZsb2F0IGFscGhhID0gbWl4KDAuNTUsIDAuOSwgc21vb3Roc3RlcCgwLjQsIDMuMCwgdkRlcHRoKSk7XG5hbHBoYSA9IG1heChhbHBoYSwgZm9hbSAqIDAuOTUpO1xuaWYgKHZTaGVldCA+IDAuNSkgYWxwaGEgPSBtYXgoYWxwaGEsIDAuODIpO1xudmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlICogY29sLCBhbHBoYSAqIG9wYWNpdHkgKTtgKTtcbiAgfTtcbiAgcmV0dXJuIG1hdDtcbn1cblxuZXhwb3J0IGNvbnN0IG5lYXJXYXRlck1hdGVyaWFsID0gbWFrZVdhdGVyTWF0ZXJpYWwoKTtcblxuLyoqIE1lc2ggdGhlIHdhdGVyIHN1cmZhY2VzIG9mIG9uZSBjaHVuazsgbnVsbCB3aGVuIHRoZSBjaHVuayBob2xkcyBubyB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNoQ2h1bmtXYXRlcih3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogVEhSRUUuTWVzaCB8IG51bGwge1xuICBjb25zdCBoeWRybyA9IGh5ZHJvbG9neUZvcih3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBsZXZlbHMgPSBuZXcgSW50MTZBcnJheShDSFVOS19TSVpFICogQ0hVTktfU0laRSkuZmlsbCgtOTk5OSk7XG4gIGNvbnN0IGJlZHMgPSBuZXcgSW50MTZBcnJheShDSFVOS19TSVpFICogQ0hVTktfU0laRSk7XG5cbiAgLy8gV2F0ZXIgc3VyZmFjZSBwZXIgY29sdW1uOiB0aGUgZmlyc3Qgbm9uLXdhdGVyIGNlbGwgYWJvdmUgdGhlIHdhdGVyIHRoYXRcbiAgLy8gc3RhbmRzIG9uIHRoaXMgY29sdW1uJ3Mgc29saWQgc3VyZmFjZS5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb25zdCBiZWQgPSBjaHVuay5oZWlnaHRzW2NvbF0gKyBZX01JTiArIDE7XG4gICAgICBsZXQgeSA9IGJlZDtcbiAgICAgIHdoaWxlICh5IDwgWV9NQVggJiYgY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9PT0gTUFULldBVEVSKSB5Kys7XG4gICAgICBpZiAoeSA+IGJlZCkgeyBsZXZlbHNbY29sXSA9IHk7IGJlZHNbY29sXSA9IGJlZDsgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBvczogbnVtYmVyW10gPSBbXSwgbnJtOiBudW1iZXJbXSA9IFtdLCBjbHI6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGZsb3c6IG51bWJlcltdID0gW10sIGRlcHRoOiBudW1iZXJbXSA9IFtdLCBmb2FtOiBudW1iZXJbXSA9IFtdLCBzaGVldDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgaWR4OiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBwdXNoID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG54OiBudW1iZXIsIG55OiBudW1iZXIsIG56OiBudW1iZXIsXG4gICAgZng6IG51bWJlciwgZno6IG51bWJlciwgZGVwOiBudW1iZXIsIGZvOiBudW1iZXIsIHNoOiBudW1iZXIpID0+IHtcbiAgICBwb3MucHVzaCh4LCB5LCB6KTsgbnJtLnB1c2gobngsIG55LCBueik7IGNsci5wdXNoKDEsIDEsIDEpO1xuICAgIGZsb3cucHVzaChmeCwgZnopOyBkZXB0aC5wdXNoKGRlcCk7IGZvYW0ucHVzaChmbyk7IHNoZWV0LnB1c2goc2gpO1xuICB9O1xuICBjb25zdCBxdWFkID0gKGJhc2U6IG51bWJlcikgPT4geyBpZHgucHVzaChiYXNlLCBiYXNlICsgMSwgYmFzZSArIDIsIGJhc2UsIGJhc2UgKyAyLCBiYXNlICsgMyk7IH07XG5cbiAgY29uc3QgbGV2ZWxBdCA9ICh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHJldHVybiBsZXZlbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgIC8vIE5laWdoYm91ciBjaHVuazogcmVhZCB0aGUgdm94ZWxzIChjaHVua3MgYXJlIGdlbmVyYXRlZCBpbiAzeDMgcmluZ3MgZm9yIG1lc2hpbmcpLlxuICAgIGxldCB5ID0gWV9NQVggLSAxO1xuICAgIHdoaWxlICh5ID4gWV9NSU4gJiYgIWlzU29saWQoZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikpICYmIGdldFZveGVsKHdvcmxkLCB3eCwgeSwgd3opICE9PSBNQVQuV0FURVIpIHktLTtcbiAgICByZXR1cm4gZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikgPT09IE1BVC5XQVRFUiA/IHkgKyAxIDogLTk5OTk7XG4gIH07XG5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb25zdCBsZXZlbCA9IGxldmVsc1tjb2xdO1xuICAgICAgaWYgKGxldmVsID09PSAtOTk5OSkgY29udGludWU7XG4gICAgICBjb25zdCB4ID0gb3ggKyBseCwgeiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBmID0gaHlkcm8uZmxvd0F0KHggKyAwLjUsIHogKyAwLjUsIGxldmVsKTtcbiAgICAgIGNvbnN0IGZ4ID0gZi5keCAqIGYuc3BlZWQsIGZ6ID0gZi5keiAqIGYuc3BlZWQ7XG4gICAgICBjb25zdCBkZXAgPSBsZXZlbCAtIGJlZHNbY29sXTtcbiAgICAgIGxldCBzaG9yZSA9IDA7XG4gICAgICBjb25zdCBzaWRlczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWzEsIDBdLCBbLTEsIDBdLCBbMCwgMV0sIFswLCAtMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBzaWRlcykge1xuICAgICAgICBjb25zdCBtID0gZ2V0Vm94ZWwod29ybGQsIHggKyBkeCwgbGV2ZWwgLSAxLCB6ICsgZHopO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgc2hvcmUgPSAxO1xuICAgICAgfVxuICAgICAgY29uc3QgeSA9IGxldmVsIC0gV0FURVJfRFJBV19EUk9QO1xuICAgICAgY29uc3QgYmFzZSA9IHBvcy5sZW5ndGggLyAzO1xuICAgICAgY29uc3QgZm8gPSBNYXRoLm1heChzaG9yZSAqIDAuNjUsIE1hdGgubWluKDEsIGYuc3BlZWQgLyAzLjUpKTtcbiAgICAgIHB1c2goeCwgeSwgeiwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCwgeSwgeiArIDEsIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBwdXNoKHggKyAxLCB5LCB6ICsgMSwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCArIDEsIHksIHosIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBxdWFkKGJhc2UpO1xuXG4gICAgICAvLyBDYXNjYWRlIHNoZWV0cyB0b3dhcmQgbG93ZXIgd2F0ZXIgKG9yIG9wZW4gYWlyKSBvbiBhbnkgc2lkZS5cbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2Ygc2lkZXMpIHtcbiAgICAgICAgY29uc3QgbkxldmVsID0gbGV2ZWxBdCh4ICsgZHgsIHogKyBkeiwgbHggKyBkeCwgbHogKyBkeik7XG4gICAgICAgIGlmIChuTGV2ZWwgPT09IC05OTk5IHx8IG5MZXZlbCA+PSBsZXZlbCkgY29udGludWU7XG4gICAgICAgIGlmIChpc1NvbGlkKGdldFZveGVsKHdvcmxkLCB4ICsgZHgsIGxldmVsIC0gMSwgeiArIGR6KSkpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB0b3AgPSBsZXZlbCAtIFdBVEVSX0RSQVdfRFJPUCwgYm90dG9tID0gbkxldmVsIC0gV0FURVJfRFJBV19EUk9QO1xuICAgICAgICBjb25zdCBiID0gcG9zLmxlbmd0aCAvIDM7XG4gICAgICAgIC8vIEZhY2Ugb24gdGhlIHNoYXJlZCBlZGdlLCBvcmllbnRlZCB0b3dhcmQgdGhlIGxvd2VyIG5laWdoYm91ci5cbiAgICAgICAgY29uc3QgZXggPSBkeCA+IDAgPyB4ICsgMSA6IGR4IDwgMCA/IHggOiB4LCBleiA9IGR6ID4gMCA/IHogKyAxIDogZHogPCAwID8geiA6IHo7XG4gICAgICAgIGlmIChkeCAhPT0gMCkge1xuICAgICAgICAgIHB1c2goZXgsIHRvcCwgeiwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goZXgsIHRvcCwgeiArIDEsIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKGV4LCBib3R0b20sIHogKyAxLCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaChleCwgYm90dG9tLCB6LCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHVzaCh4LCB0b3AsIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaCh4ICsgMSwgdG9wLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goeCArIDEsIGJvdHRvbSwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKHgsIGJvdHRvbSwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgfVxuICAgICAgICBxdWFkKGIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAoaWR4Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUocG9zLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShucm0sIDMpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoY2xyLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRmxvdycsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGZsb3csIDIpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FEZXB0aCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGRlcHRoLCAxKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRm9hbScsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGZvYW0sIDEpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FTaGVldCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHNoZWV0LCAxKSk7XG4gIGcuc2V0SW5kZXgoaWR4KTtcbiAgZy5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGcsIG5lYXJXYXRlck1hdGVyaWFsKTtcbiAgbWVzaC5uYW1lID0gYHdhdGVyX2NodW5rXyR7Y2h1bmsuY3h9XyR7Y2h1bmsuY3p9YDtcbiAgbWVzaC5yZW5kZXJPcmRlciA9IDI7XG4gIG1lc2gudXNlckRhdGEud2F0ZXJUcmlhbmdsZXMgPSBpZHgubGVuZ3RoIC8gMztcbiAgcmV0dXJuIG1lc2g7XG59XG5cbi8qKlxuICogQ3V0IGEgcmVjdGFuZ3VsYXIgaG9sZSBpbiB0aGUgZmFyIChvcGFxdWUpIHNlYSBwbGFuZSB3aGVyZSBuZWFyIGNodW5rcyBkcmF3XG4gKiB0aGVpciBvd24gdHJhbnNwYXJlbnQgd2F0ZXIsIHNvIHNoYWxsb3dzIHNob3cgdGhlIHJlYWwgYmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEZhcldhdGVySG9sZShtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpOiB7IHZhbHVlOiBUSFJFRS5WZWN0b3I0IH0ge1xuICBjb25zdCBob2xlID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjQoMCwgMCwgMCwgMCkgfTtcbiAgbWF0ZXJpYWwub25CZWZvcmVDb21waWxlID0gKHNoYWRlcikgPT4ge1xuICAgIHNoYWRlci51bmlmb3Jtcy51SG9sZSA9IGhvbGU7XG4gICAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsICcjaW5jbHVkZSA8Y29tbW9uPlxcbnZhcnlpbmcgdmVjMiB2RmFyWFo7JylcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsICcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbnZGYXJYWiA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh6OycpO1xuICAgIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxudW5pZm9ybSB2ZWM0IHVIb2xlO1xcbnZhcnlpbmcgdmVjMiB2RmFyWFo7JylcbiAgICAgIC5yZXBsYWNlKCd2ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnLFxuICAgICAgICAnaWYgKHZGYXJYWi54ID4gdUhvbGUueCAmJiB2RmFyWFoueCA8IHVIb2xlLnogJiYgdkZhclhaLnkgPiB1SG9sZS55ICYmIHZGYXJYWi55IDwgdUhvbGUudykgZGlzY2FyZDtcXG52ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnKTtcbiAgfTtcbiAgcmV0dXJuIGhvbGU7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBR0EsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTtBQUNuQixZQUFZQSxZQUFXOzs7QUNHdkIsSUFBTSxTQUFTLG9CQUFJLFFBQTZCO0FBZXpDLFNBQVMsY0FBYyxPQUF3QjtBQUNwRCxTQUFPLE9BQU8sSUFBSSxLQUFLLEdBQUcsVUFBVTtBQUN0Qzs7O0FDdEJPLElBQU0sUUFBUSxDQUFDLEdBQVcsR0FBVyxNQUFlLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJO0FBQzVFLElBQU0sT0FBTyxDQUFDLEdBQVcsR0FBVyxNQUFjLEtBQUssSUFBSSxLQUFLO0FBQ2hFLElBQU0sYUFBYSxDQUFDLElBQVksSUFBWSxNQUFjO0FBQy9ELFFBQU0sSUFBSSxPQUFPLElBQUksT0FBTyxLQUFLLEtBQUssR0FBRyxDQUFDO0FBQzFDLFNBQU8sSUFBSSxLQUFLLElBQUksSUFBSTtBQUMxQjtBQUdPLFNBQVMsT0FBTyxHQUFXLEdBQVcsTUFBc0I7QUFDakUsTUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsU0FBUyxJQUFJLEtBQUssS0FBSyxHQUFHLFNBQVM7QUFDL0QsTUFBSSxLQUFLLEtBQUssSUFBSyxNQUFNLElBQUssVUFBVTtBQUN4QyxXQUFTLElBQUssTUFBTSxRQUFTLEtBQUs7QUFDcEM7QUFFTyxTQUFTLE9BQU8sR0FBVyxHQUFXLEdBQVcsTUFBc0I7QUFDNUUsTUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsU0FBUyxJQUFJLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxVQUFVO0FBQzFGLE1BQUksS0FBSyxLQUFLLElBQUssTUFBTSxJQUFLLFVBQVU7QUFDeEMsV0FBUyxJQUFLLE1BQU0sUUFBUyxLQUFLO0FBQ3BDO0FBRU8sU0FBUyxXQUFXLE1BQTRCO0FBQ3JELE1BQUksSUFBSSxTQUFTO0FBQ2pCLFNBQU8sTUFBTTtBQUNYLFFBQUssSUFBSSxlQUFnQjtBQUN6QixRQUFJLElBQUk7QUFDUixRQUFJLEtBQUssS0FBSyxJQUFLLE1BQU0sSUFBSyxJQUFJLENBQUM7QUFDbkMsU0FBSyxJQUFJLEtBQUssS0FBSyxJQUFLLE1BQU0sR0FBSSxJQUFJLEVBQUU7QUFDeEMsYUFBUyxJQUFLLE1BQU0sUUFBUyxLQUFLO0FBQUEsRUFDcEM7QUFDRjtBQUVPLElBQU0sU0FBUyxDQUFDLE1BQWMsSUFBSSxLQUFLLElBQUksSUFBSTtBQUUvQyxTQUFTLFlBQVksR0FBVyxHQUFXLE1BQXNCO0FBQ3RFLFFBQU0sS0FBSyxLQUFLLE1BQU0sQ0FBQyxHQUFHLEtBQUssS0FBSyxNQUFNLENBQUM7QUFDM0MsUUFBTSxLQUFLLE9BQU8sSUFBSSxFQUFFLEdBQUcsS0FBSyxPQUFPLElBQUksRUFBRTtBQUM3QyxRQUFNLElBQUksT0FBTyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksT0FBTyxLQUFLLEdBQUcsSUFBSSxJQUFJO0FBQzNELFFBQU0sSUFBSSxPQUFPLElBQUksS0FBSyxHQUFHLElBQUksR0FBRyxJQUFJLE9BQU8sS0FBSyxHQUFHLEtBQUssR0FBRyxJQUFJO0FBQ25FLFFBQU0sTUFBTSxLQUFLLElBQUksS0FBSztBQUMxQixRQUFNLFNBQVMsS0FBSyxJQUFJLEtBQUs7QUFDN0IsU0FBTyxPQUFPLFNBQVMsT0FBTztBQUNoQztBQUVPLFNBQVMsS0FBSyxHQUFXLEdBQVcsTUFBYyxTQUF5QjtBQUNoRixNQUFJLE1BQU0sR0FBRyxNQUFNLEdBQUcsT0FBTyxHQUFHLE9BQU87QUFDdkMsV0FBUyxJQUFJLEdBQUcsSUFBSSxTQUFTLEtBQUs7QUFDaEMsV0FBTyxNQUFNLFlBQVksSUFBSSxNQUFNLElBQUksTUFBTSxPQUFPLElBQUksR0FBRztBQUMzRCxZQUFRO0FBQ1IsV0FBTztBQUFLLFlBQVE7QUFBQSxFQUN0QjtBQUNBLFNBQU8sTUFBTTtBQUNmO0FBRU8sU0FBUyxZQUFZLEdBQVcsR0FBVyxHQUFXLE1BQXNCO0FBQ2pGLFFBQU0sS0FBSyxLQUFLLE1BQU0sQ0FBQyxHQUFHLEtBQUssS0FBSyxNQUFNLENBQUMsR0FBRyxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQy9ELFFBQU0sS0FBSyxPQUFPLElBQUksRUFBRSxHQUFHLEtBQUssT0FBTyxJQUFJLEVBQUUsR0FBRyxLQUFLLE9BQU8sSUFBSSxFQUFFO0FBQ2xFLFFBQU0sT0FBTyxPQUFPLElBQUksSUFBSSxJQUFJLElBQUksR0FBRyxPQUFPLE9BQU8sS0FBSyxHQUFHLElBQUksSUFBSSxJQUFJO0FBQ3pFLFFBQU0sT0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLElBQUksSUFBSSxHQUFHLE9BQU8sT0FBTyxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUksSUFBSTtBQUNqRixRQUFNLE9BQU8sT0FBTyxJQUFJLElBQUksS0FBSyxHQUFHLElBQUksR0FBRyxPQUFPLE9BQU8sS0FBSyxHQUFHLElBQUksS0FBSyxHQUFHLElBQUk7QUFDakYsUUFBTSxPQUFPLE9BQU8sSUFBSSxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUksR0FBRyxPQUFPLE9BQU8sS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsSUFBSTtBQUN6RixRQUFNLE1BQU0sUUFBUSxPQUFPLFFBQVE7QUFDbkMsUUFBTSxNQUFNLFFBQVEsT0FBTyxRQUFRO0FBQ25DLFFBQU0sTUFBTSxRQUFRLE9BQU8sUUFBUTtBQUNuQyxRQUFNLE1BQU0sUUFBUSxPQUFPLFFBQVE7QUFDbkMsUUFBTSxLQUFLLE9BQU8sTUFBTSxPQUFPO0FBQy9CLFFBQU0sS0FBSyxPQUFPLE1BQU0sT0FBTztBQUMvQixTQUFPLE1BQU0sS0FBSyxNQUFNO0FBQzFCO0FBRU8sU0FBUyxLQUFLLEdBQVcsR0FBVyxHQUFXLE1BQWMsU0FBeUI7QUFDM0YsTUFBSSxNQUFNLEdBQUcsTUFBTSxHQUFHLE9BQU8sR0FBRyxPQUFPO0FBQ3ZDLFdBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxLQUFLO0FBQ2hDLFdBQU8sTUFBTSxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQ3JFLFlBQVE7QUFDUixXQUFPO0FBQUssWUFBUTtBQUFBLEVBQ3RCO0FBQ0EsU0FBTyxNQUFNO0FBQ2Y7OztBQzdCTyxJQUFNLGFBQU4sTUFBaUI7QUFBQSxFQUt0QixZQUFZLFFBQStCLE9BQWU7QUFBZjtBQUN6QyxTQUFLLFNBQVM7QUFDZCxhQUFTLElBQUksR0FBRyxJQUFJLElBQUksT0FBTyxRQUFRLEtBQUs7QUFDMUMsWUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLElBQUksT0FBTyxJQUFJLENBQUM7QUFDckMsWUFBTSxLQUFLLEtBQUssSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksT0FBTyxLQUFLLEtBQUssSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUk7QUFDakUsWUFBTSxLQUFLLEtBQUssSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksT0FBTyxLQUFLLEtBQUssSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUk7QUFDakUsZUFBUyxLQUFLLEtBQUssTUFBTSxLQUFLLEtBQUssSUFBSSxHQUFHLE1BQU0sS0FBSyxNQUFNLEtBQUssS0FBSyxJQUFJLEdBQUcsTUFBTTtBQUNoRixpQkFBUyxLQUFLLEtBQUssTUFBTSxLQUFLLEtBQUssSUFBSSxHQUFHLE1BQU0sS0FBSyxNQUFNLEtBQUssS0FBSyxJQUFJLEdBQUcsTUFBTTtBQUNoRixnQkFBTSxNQUFNLFFBQVEsSUFBSSxFQUFFO0FBQzFCLGNBQUksT0FBTyxLQUFLLEtBQUssSUFBSSxHQUFHO0FBQzVCLGNBQUksQ0FBQyxNQUFNO0FBQUUsbUJBQU8sQ0FBQztBQUFHLGlCQUFLLEtBQUssSUFBSSxLQUFLLElBQUk7QUFBQSxVQUFHO0FBQ2xELGVBQUssS0FBSyxDQUFDO0FBQUEsUUFDYjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBZjJDO0FBQUEsRUFKbEM7QUFBQSxFQUNRLE9BQU87QUFBQSxFQUNQLE9BQU8sb0JBQUksSUFBc0I7QUFBQSxFQW1CbEQsSUFBSSxTQUFpQjtBQUFFLFdBQU8sS0FBSyxPQUFPLEtBQUssT0FBTyxTQUFTLENBQUMsR0FBRyxLQUFLO0FBQUEsRUFBRztBQUFBO0FBQUEsRUFHM0UsUUFBUSxHQUFXLEdBQTRCO0FBQzdDLFVBQU0sT0FBTyxLQUFLLEtBQUssSUFBSSxRQUFRLEtBQUssTUFBTSxJQUFJLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7QUFDeEYsUUFBSSxDQUFDLEtBQU0sUUFBTztBQUNsQixRQUFJLE9BQU8sVUFBVSxLQUFLLElBQUksS0FBSztBQUNuQyxlQUFXLEtBQUssTUFBTTtBQUNwQixZQUFNQyxLQUFJLEtBQUssT0FBTyxDQUFDLEdBQUdDLEtBQUksS0FBSyxPQUFPLElBQUksQ0FBQztBQUMvQyxZQUFNLEtBQUtBLEdBQUUsSUFBSUQsR0FBRSxHQUFHLEtBQUtDLEdBQUUsSUFBSUQsR0FBRTtBQUNuQyxZQUFNLE9BQU8sS0FBSyxLQUFLLEtBQUssTUFBTTtBQUNsQyxZQUFNLElBQUksUUFBUSxJQUFJQSxHQUFFLEtBQUssTUFBTSxJQUFJQSxHQUFFLEtBQUssTUFBTSxNQUFNLEdBQUcsQ0FBQztBQUM5RCxZQUFNLEtBQUtBLEdBQUUsSUFBSSxLQUFLLEdBQUcsS0FBS0EsR0FBRSxJQUFJLEtBQUs7QUFDekMsWUFBTSxNQUFNLElBQUksT0FBTyxLQUFLLElBQUksT0FBTztBQUN2QyxVQUFJLEtBQUssTUFBTTtBQUFFLGVBQU87QUFBSSxhQUFLO0FBQUcsYUFBSztBQUFBLE1BQUc7QUFBQSxJQUM5QztBQUNBLFFBQUksS0FBSyxLQUFLLE9BQU8sS0FBSyxRQUFRLEtBQUssTUFBTyxRQUFPO0FBQ3JELFVBQU0sSUFBSSxLQUFLLE9BQU8sRUFBRSxHQUFHLElBQUksS0FBSyxPQUFPLEtBQUssQ0FBQztBQUNqRCxVQUFNLFNBQVMsS0FBSyxJQUFJLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQztBQUV2QyxVQUFNLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxRQUFRLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSztBQUNwRCxXQUFPO0FBQUEsTUFDTCxHQUFHLEtBQUssS0FBSyxJQUFJO0FBQUEsTUFDakIsT0FBTyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUztBQUFBLE1BQ3ZDLE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFNBQVM7QUFBQSxNQUN2QztBQUFBLE1BQUk7QUFBQSxNQUNKLFVBQVUsS0FBSyxJQUFJLElBQUksRUFBRSxRQUFRLEVBQUUsU0FBUyxNQUFNO0FBQUEsTUFDbEQsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRjtBQUNGO0FBRUEsU0FBUyxRQUFRLElBQVksSUFBb0I7QUFDL0MsVUFBUSxLQUFLLFFBQVEsUUFBUSxLQUFLO0FBQ3BDO0FBc0JPLElBQU0sWUFBTixNQUFnQjtBQUFBLEVBQ1o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUE7QUFBQSxFQUVBO0FBQUEsRUFFVCxZQUFZLE1BQXdCO0FBQ2xDLFNBQUssT0FBTyxLQUFLO0FBQ2pCLFNBQUssVUFBVSxLQUFLO0FBQ3BCLFNBQUssT0FBTyxXQUFXLEtBQUssUUFBUTtBQUNwQyxTQUFLLFFBQVEsZ0JBQWdCLEtBQUssVUFBVSxLQUFLLElBQUk7QUFDckQsUUFBSSxLQUFLLFdBQVcsR0FBRztBQUNyQixZQUFNLFFBQVEsaUJBQWlCLEtBQUssTUFBTSxLQUFLLElBQUk7QUFDbkQsV0FBSyxRQUFRLE1BQU07QUFDbkIsV0FBSyxPQUFPLE1BQU07QUFBQSxJQUNwQixPQUFPO0FBQ0wsV0FBSyxRQUFRO0FBQ2IsV0FBSyxPQUFPO0FBQUEsSUFDZDtBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsT0FBTyxHQUFXLEdBQVcsT0FBMkI7QUFDdEQsUUFBSSxLQUFLLFNBQVMsUUFBUSxLQUFLO0FBQzdCLFlBQU0sTUFBTSxLQUFLLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDbkMsVUFBSSxPQUFPLElBQUksS0FBSyxJQUFJLFFBQVEsR0FBRztBQUNqQyxjQUFNLFFBQVEsTUFBTSxPQUFPLElBQUksV0FBVyxHQUFHLEtBQUssR0FBRztBQUNyRCxlQUFPLEVBQUUsTUFBTSxTQUFTLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLE1BQU07QUFBQSxNQUN4RDtBQUNBLFVBQUksS0FBSyxRQUFRLEtBQUssTUFBTSxJQUFJLEtBQUssS0FBSyxHQUFHLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxLQUFLLEtBQUssSUFBSSxHQUFHO0FBQy9FLGVBQU8sRUFBRSxNQUFNLFFBQVEsR0FBRyxRQUFRLEdBQUcsR0FBRyxLQUFLLFlBQVksR0FBRyxJQUFJLEVBQUU7QUFBQSxNQUNwRTtBQUFBLElBQ0Y7QUFDQSxVQUFNLE1BQU0sS0FBSyxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQ25DLFFBQUksT0FBTyxJQUFJLEtBQUssSUFBSSxRQUFRLEdBQUc7QUFDakMsYUFBTyxFQUFFLE1BQU0sU0FBUyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLE9BQU8sT0FBTyxXQUFXLElBQUksUUFBUSxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUU7QUFBQSxJQUMzRztBQUNBLFVBQU0sS0FBSyxLQUFLLE9BQU8sSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxFQUFFO0FBQ3hGLFFBQUksS0FBSyxNQUFNO0FBRWIsWUFBTSxPQUFPLEtBQUssTUFBTSxPQUFPLEtBQUssTUFBTSxPQUFPLFNBQVMsQ0FBQztBQUMzRCxZQUFNLFFBQVEsUUFBUSxHQUFHLEdBQUcsTUFBTSxJQUFJO0FBQ3RDLGFBQU8sRUFBRSxNQUFNLFFBQVEsR0FBRyxNQUFNO0FBQUEsSUFDbEM7QUFDQSxXQUFPLEVBQUUsTUFBTSxPQUFPLElBQUksR0FBRyxJQUFJLEdBQUcsT0FBTyxFQUFFO0FBQUEsRUFDL0M7QUFBQSxFQUVRLGNBQXdDO0FBQzlDLFVBQU0sTUFBTSxLQUFLLE1BQU87QUFDeEIsV0FBTyxJQUFJLElBQUksU0FBUyxDQUFDO0FBQUEsRUFDM0I7QUFDRjtBQUVBLFNBQVMsUUFBUSxHQUFXLEdBQVcsR0FBNkIsT0FBZTtBQUNqRixRQUFNLEtBQUssRUFBRSxJQUFJLEdBQUcsS0FBSyxFQUFFLElBQUk7QUFDL0IsUUFBTSxNQUFNLEtBQUssTUFBTSxJQUFJLEVBQUUsS0FBSztBQUNsQyxTQUFPLEVBQUUsSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTTtBQUM3QztBQUdBLFNBQVMsV0FBVyxHQUFxQztBQUN2RCxNQUFJLEtBQUssR0FBRyxLQUFLLEdBQUcsSUFBSSxHQUFHLE9BQU8sVUFBVSxPQUFPLFdBQVcsT0FBTyxVQUFVLE9BQU87QUFDdEYsV0FBUyxJQUFJLE1BQU0sS0FBSyxNQUFNLEtBQUssR0FBRztBQUNwQyxhQUFTLElBQUksTUFBTSxLQUFLLEtBQUssS0FBSyxHQUFHO0FBQ25DLFVBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFJO0FBQ2xCLFlBQU07QUFBRyxZQUFNO0FBQUc7QUFDbEIsYUFBTyxLQUFLLElBQUksTUFBTSxDQUFDO0FBQUcsYUFBTyxLQUFLLElBQUksTUFBTSxDQUFDO0FBQ2pELGFBQU8sS0FBSyxJQUFJLE1BQU0sQ0FBQztBQUFHLGFBQU8sS0FBSyxJQUFJLE1BQU0sQ0FBQztBQUFBLElBQ25EO0FBQUEsRUFDRjtBQUNBLE1BQUksTUFBTSxFQUFHLFFBQU8sRUFBRSxHQUFHLE1BQU0sR0FBRyxNQUFNLElBQUksS0FBSyxJQUFJLEdBQUc7QUFDeEQsU0FBTztBQUFBLElBQ0wsR0FBRyxLQUFLO0FBQUEsSUFBRyxHQUFHLEtBQUs7QUFBQSxJQUNuQixJQUFJLEtBQUssSUFBSSxLQUFLLE9BQU8sUUFBUSxJQUFJLEVBQUU7QUFBQSxJQUFHLElBQUksS0FBSyxJQUFJLEtBQUssT0FBTyxRQUFRLElBQUksRUFBRTtBQUFBLEVBQ25GO0FBQ0Y7QUFPQSxTQUFTLGdCQUFnQixHQUFrQixNQUFxQztBQUM5RSxRQUFNLE1BQXVDLENBQUM7QUFDOUMsTUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUs7QUFDNUIsTUFBSSxJQUFJLEtBQUssTUFBTSxLQUFLLElBQUksS0FBSyxLQUFLLEdBQUc7QUFFekMsU0FBTyxLQUFLLEtBQUssS0FBSyxHQUFHO0FBQ3ZCLFFBQUksT0FBTyxVQUFVLEtBQUs7QUFDMUIsYUFBUyxJQUFJLEtBQUssTUFBTSxLQUFLLEVBQUUsR0FBRyxLQUFLLEtBQUssSUFBSSxLQUFLLEdBQUc7QUFDdEQsWUFBTSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksS0FBSyxJQUFJLElBQUksRUFBRSxJQUFJO0FBQ3ZDLFVBQUksSUFBSSxNQUFNO0FBQUUsZUFBTztBQUFHLGFBQUs7QUFBQSxNQUFHO0FBQUEsSUFDcEM7QUFDQSxTQUFLO0FBQ0wsUUFBSSxLQUFLLEVBQUUsR0FBRyxJQUFJLEVBQUUsQ0FBQztBQUVyQixRQUFJLE9BQU8sTUFBTSxJQUFJLFNBQVMsTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLElBQUksTUFBTSxFQUFFLElBQUksSUFBSSxFQUFFLElBQUksR0FBSTtBQUFBLEVBQy9FO0FBQ0EsUUFBTUUsVUFBUyxJQUFJLElBQUksQ0FBQyxHQUFHLE1BQU07QUFDL0IsUUFBSSxLQUFLLEdBQUcsSUFBSTtBQUNoQixhQUFTLElBQUksS0FBSyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsS0FBSyxLQUFLLElBQUksSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsS0FBSztBQUFFLFlBQU0sSUFBSSxDQUFDLEVBQUU7QUFBRztBQUFBLElBQUs7QUFDbkcsV0FBTyxFQUFFLEdBQUcsS0FBSyxHQUFHLEdBQUcsRUFBRSxFQUFFO0FBQUEsRUFDN0IsQ0FBQztBQUVELEVBQUFBLFFBQU8sUUFBUTtBQUNmLFFBQU0sU0FBdUIsQ0FBQztBQUM5QixNQUFJLElBQUk7QUFDUixXQUFTLElBQUksR0FBRyxJQUFJQSxRQUFPLFFBQVEsS0FBSztBQUN0QyxRQUFJLElBQUksRUFBRyxNQUFLLEtBQUssTUFBTUEsUUFBTyxDQUFDLEVBQUUsSUFBSUEsUUFBTyxJQUFJLENBQUMsRUFBRSxHQUFHQSxRQUFPLENBQUMsRUFBRSxJQUFJQSxRQUFPLElBQUksQ0FBQyxFQUFFLENBQUM7QUFDdkYsV0FBTyxLQUFLLEVBQUUsR0FBR0EsUUFBTyxDQUFDLEVBQUUsR0FBRyxHQUFHQSxRQUFPLENBQUMsRUFBRSxHQUFHLEdBQUcsT0FBTyxHQUFHLE9BQU8sRUFBRSxDQUFDO0FBQUEsRUFDdkU7QUFDQSxTQUFPLElBQUksV0FBVyxRQUFRLEVBQUU7QUFDbEM7QUFHQSxJQUFNLFFBQWtELENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7QUFDekYsSUFBTSxpQkFBaUI7QUFPdkIsU0FBUyxpQkFBaUIsTUFBYyxNQUV0QztBQUNBLFFBQU0sTUFBTSxZQUFZLE9BQU8sWUFBYSxDQUFDO0FBQzdDLFFBQU0sSUFBSSxDQUFDLE9BQWUsSUFBSSxJQUFJLE9BQU8sSUFBSTtBQUM3QyxRQUFNLFFBQVEsRUFBRSxHQUFHLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxHQUFHLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSztBQUN0RSxRQUFNLFdBQVc7QUFBQSxJQUNmO0FBQUEsSUFDQSxFQUFFLEdBQUcsS0FBSyxJQUFJLEtBQUssRUFBRSxFQUFFLEdBQUcsR0FBRyxPQUFPLEVBQUUsRUFBRSxFQUFFO0FBQUEsSUFDMUMsRUFBRSxHQUFHLE9BQU8sRUFBRSxFQUFFLEdBQUcsR0FBRyxPQUFPLEVBQUUsRUFBRSxFQUFFO0FBQUEsSUFDbkMsRUFBRSxHQUFHLE9BQU8sRUFBRSxFQUFFLEdBQUcsR0FBRyxPQUFPLEVBQUUsRUFBRSxFQUFFO0FBQUEsSUFDbkMsRUFBRSxHQUFHLE9BQU8sRUFBRSxFQUFFLEdBQUcsR0FBRyxPQUFPLEVBQUUsRUFBRSxFQUFFO0FBQUEsRUFDckM7QUFHQSxRQUFNLFFBQXlDLENBQUM7QUFDaEQsV0FBUyxJQUFJLEdBQUcsSUFBSSxTQUFTLFNBQVMsR0FBRyxLQUFLO0FBQzVDLFVBQU0sS0FBSyxTQUFTLEtBQUssSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxTQUFTLENBQUM7QUFDeEQsVUFBTSxLQUFLLFNBQVMsSUFBSSxDQUFDLEdBQUcsS0FBSyxTQUFTLEtBQUssSUFBSSxTQUFTLFNBQVMsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUM5RSxhQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSztBQUMzQixZQUFNLElBQUksSUFBSSxJQUFJLEtBQUssSUFBSSxHQUFHLEtBQUssS0FBSztBQUN4QyxZQUFNLEtBQUs7QUFBQSxRQUNULEdBQUcsT0FBTyxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsSUFBSSxHQUFHLEtBQUssS0FBSyxJQUFJLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUssTUFDL0UsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQUEsUUFDM0MsR0FBRyxPQUFPLElBQUksR0FBRyxLQUFLLENBQUMsR0FBRyxJQUFJLEdBQUcsS0FBSyxLQUFLLElBQUksR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSyxNQUMvRSxDQUFDLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFBQSxNQUM3QyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Y7QUFDQSxRQUFNLEtBQUssU0FBUyxTQUFTLFNBQVMsQ0FBQyxDQUFDO0FBQ3hDLFFBQU0sWUFBd0QsQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFDcEYsTUFBSSxNQUFNLEdBQUcsSUFBSTtBQUNqQixXQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3JDLFVBQU0sT0FBTyxLQUFLLE1BQU0sTUFBTSxDQUFDLEVBQUUsSUFBSSxNQUFNLElBQUksQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLEVBQUUsSUFBSSxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUM7QUFDaEYsV0FBTztBQUFNLFNBQUs7QUFDbEIsUUFBSSxPQUFPLEtBQUssTUFBTSxNQUFNLFNBQVMsR0FBRztBQUN0QyxZQUFNLEtBQUssS0FBSyxJQUFJLElBQUksS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU87QUFDckQsZ0JBQVUsS0FBSyxFQUFFLEdBQUcsTUFBTSxDQUFDLEVBQUUsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDdEQsWUFBTTtBQUFBLElBQ1I7QUFBQSxFQUNGO0FBQ0EsUUFBTSxRQUFRLFVBQVUsVUFBVSxTQUFTLENBQUMsRUFBRTtBQUM5QyxRQUFNLFVBQVUsQ0FBQyxPQUF1QjtBQUN0QyxRQUFJLFFBQVEsS0FBSztBQUNqQixlQUFXLENBQUMsTUFBTSxJQUFJLEtBQUssT0FBTztBQUVoQyxlQUFTLE9BQU8sV0FBVyxRQUFRLE9BQU8sR0FBRyxRQUFRLE9BQU8sR0FBRyxFQUFFO0FBQUEsSUFDbkU7QUFFQSxXQUFPLEtBQUssS0FBSyxJQUFJLFFBQVEsS0FBSztBQUFBLEVBQ3BDO0FBQ0EsUUFBTSxTQUF1QixVQUFVLElBQUksQ0FBQyxPQUFPO0FBQUEsSUFDakQsR0FBRyxFQUFFO0FBQUEsSUFBRyxHQUFHLEVBQUU7QUFBQSxJQUFHLEdBQUcsRUFBRTtBQUFBLElBQUcsT0FBTyxLQUFLLElBQUksR0FBRyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBQUEsSUFDdkQsT0FBTyxNQUFNLE1BQU0sS0FBSyxFQUFFLElBQUksSUFBSSxLQUFLLE9BQU8sS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFLElBQUksU0FBUztBQUFBLEVBQzlFLEVBQUU7QUFDRixRQUFNLFNBQVMsT0FBTyxPQUFPLFNBQVMsQ0FBQztBQUN2QyxTQUFPO0FBQUEsSUFDTCxPQUFPLElBQUksV0FBVyxRQUFRLEdBQUc7QUFBQSxJQUNqQyxNQUFNLEVBQUUsR0FBRyxPQUFPLEdBQUcsR0FBRyxPQUFPLEdBQUcsR0FBRyxJQUFJLE9BQU8sT0FBTyxNQUFNO0FBQUEsRUFDL0Q7QUFDRjs7O0FDNVRPLElBQU0sTUFBTTtBQUFBLEVBQ2pCLEtBQUs7QUFBQSxFQUNMLE9BQU87QUFBQSxFQUNQLE1BQU07QUFBQSxFQUNOLE1BQU07QUFBQSxFQUNOLFFBQVE7QUFBQSxFQUNSLE9BQU87QUFBQSxFQUNQLEtBQUs7QUFBQSxFQUNMLE9BQU87QUFBQSxFQUNQLFNBQVM7QUFBQSxFQUNULE1BQU07QUFBQTtBQUFBLEVBRU4sTUFBTTtBQUNSO0FBR08sSUFBTSxVQUFVLENBQUMsTUFBdUIsTUFBTSxJQUFJLE9BQU8sTUFBTSxJQUFJOzs7QUNGbkUsSUFBTSxjQUFjO0FBQ3BCLElBQU0sZ0JBQWdCO0FBYXRCLElBQU0sWUFBTixNQUFnQjtBQUFBLEVBQ3JCLFlBQ1csTUFDUSxJQUNSLFdBQ1Q7QUFIUztBQUNRO0FBQ1I7QUFBQSxFQUNSO0FBQUEsRUFIUTtBQUFBLEVBQ1E7QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUlYLFdBQVcsR0FBVyxHQUFtQjtBQUN2QyxVQUFNLFFBQVEsV0FBVyxNQUFNLE1BQU0sQ0FBQztBQUV0QyxVQUFNLFdBQVcsS0FBSyxNQUFNLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxDQUFDO0FBQzNELFVBQU0sT0FBTyxXQUFXLFVBQVUsV0FBVyxJQUFJLENBQUM7QUFDbEQsVUFBTSxPQUFPLFdBQVcsS0FBSyxLQUFLLENBQUM7QUFDbkMsV0FBTyxLQUFLLElBQUksT0FBTyxNQUFNLElBQUk7QUFBQSxFQUNuQztBQUFBO0FBQUEsRUFHQSxXQUFXLEdBQVcsR0FBbUI7QUFDdkMsVUFBTSxRQUFRLFdBQVcsTUFBTSxNQUFNLENBQUM7QUFDdEMsVUFBTSxXQUFXLEtBQUssTUFBTSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUMzRCxVQUFNLE9BQU8sV0FBVyxXQUFXLElBQUksV0FBVyxLQUFLLENBQUM7QUFDeEQsVUFBTSxPQUFPLFdBQVcsS0FBSyxLQUFLLENBQUM7QUFDbkMsV0FBTyxLQUFLLElBQUksT0FBTyxNQUFNLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRUEsT0FBTyxHQUFXLEdBQXFCO0FBQ3JDLFVBQU0sT0FBTyxLQUFLO0FBQ2xCLFVBQU0sT0FBTyxLQUFLLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDL0IsVUFBTSxPQUFPLEtBQUssV0FBVyxHQUFHLENBQUM7QUFDakMsUUFBSSxJQUFJO0FBRVIsUUFBSSxPQUFPLEdBQUc7QUFFWixZQUFNLFlBQVksV0FBVyxNQUFNLE1BQU0sQ0FBQztBQUMxQyxZQUFNLFFBQVEsSUFBSSxLQUFLLE9BQU8sSUFBSSxPQUFPLE1BQU0sSUFBSSxPQUFPLEdBQUcsS0FDeEQsS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksT0FBTztBQUNwRCxZQUFNLFFBQVEsV0FBVyxHQUFLLE1BQU0sS0FBSyxJQUFJO0FBQzdDLFlBQU0sU0FBUyxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sSUFBSSxJQUFJLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxDQUFDLEdBQUcsS0FBSztBQUc1RixZQUFNLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQy9ELFlBQU0sS0FBSyxLQUFLLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQzNFLFlBQU0sS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUM7QUFDdkUsWUFBTSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUksS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQztBQUNyRSxZQUFNLE9BQU8sS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQ25ELFlBQU0sUUFBUSxLQUFLLFdBQVcsR0FBRyxDQUFDO0FBQ2xDLFVBQUksV0FBVyxNQUFNLElBQUksS0FBSyxVQUFVLE9BQU8sS0FBSyxLQUFLLE9BQU8sS0FBSyxPQUFPLFFBQ3hFLEtBQUssUUFBUSxXQUFXLE1BQU0sS0FBSyxFQUFFO0FBQ3pDLFlBQU0sT0FBTyxJQUFJLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQ3pELFlBQU0sSUFBSSxLQUFLLE1BQU0sV0FBVyxJQUFJO0FBQ3BDLFlBQU0sT0FBTyxXQUFXLE9BQU87QUFDL0Isa0JBQVksSUFBSSxXQUFXLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFHOUMsWUFBTSxhQUFhLFdBQVcsSUFBSSxHQUFHLE1BQU07QUFDM0MsVUFBSSxLQUFLLFFBQVEsS0FBSyxJQUFJLFFBQVEsUUFBUSxHQUFHLE9BQU8sVUFBVTtBQUFBLElBQ2hFO0FBRUEsUUFBSSxRQUFRLElBQUksSUFBSSxJQUFJO0FBQ3hCLFFBQUksVUFBVTtBQUdkLFVBQU0sUUFBUSxLQUFLLFVBQVU7QUFDN0IsUUFBSSxPQUFPO0FBQ1QsWUFBTSxNQUFNLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDOUIsVUFBSSxLQUFLO0FBQ1AsY0FBTSxTQUFTLElBQUksUUFBUTtBQUMzQixjQUFNLEtBQUssS0FBSyxLQUFLLEtBQUssSUFBSSxJQUFJLElBQUksS0FBSyxPQUFPLEtBQUssQ0FBQztBQUN4RCxjQUFNLFFBQVEsSUFBSSxRQUFRLE1BQU0sTUFBTSxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxJQUFJLElBQUk7QUFDcEYsY0FBTSxJQUFJLFdBQVcsS0FBSyxLQUFLLElBQUksSUFBSSxDQUFDO0FBQ3hDLFlBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyxPQUFPLEdBQUcsQ0FBQyxDQUFDO0FBQ2pDLGNBQU0sSUFBSSxJQUFJO0FBQ2QsWUFBSSxVQUFVLElBQUksSUFBSSxJQUFJLEdBQUc7QUFHM0IsY0FBSSxLQUFLLElBQUksR0FBRyxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksQ0FBQztBQUFBLFFBQzFDO0FBQ0EsWUFBSSxJQUFJLElBQUksR0FBRztBQUNiLGdCQUFNLE1BQU0sSUFBSSxTQUFTLE1BQU0sT0FBTyxJQUFJLElBQUksSUFBSTtBQUNsRCxjQUFJLEtBQUssSUFBSSxHQUFHLEdBQUc7QUFDbkIsY0FBSSxPQUFRLFNBQVEsS0FBSyxJQUFJLE9BQU8sS0FBSyxNQUFNLElBQUksS0FBSyxDQUFDO0FBQ3pELG9CQUFVO0FBQUEsUUFDWjtBQUFBLE1BQ0Y7QUFDQSxZQUFNLE9BQU8sS0FBSyxVQUFVO0FBQzVCLFVBQUksTUFBTTtBQUNSLGNBQU0sS0FBSyxLQUFLLE1BQU0sSUFBSSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FDdkMsSUFBSSxPQUFPLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJO0FBQ3RELFlBQUksS0FBSyxLQUFLLElBQUksR0FBRztBQUNuQixnQkFBTSxNQUFNLEtBQUssS0FBSyxLQUFLLEtBQUssSUFBSTtBQUNwQyxjQUFJLE1BQU0sS0FBSyxFQUFHLEtBQUksS0FBSyxJQUFJLEdBQUcsR0FBRztBQUFBLGVBQ2hDO0FBQ0gsZ0JBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxHQUFHLEdBQUcsR0FBRyxLQUFLLFFBQVEsSUFBSSxJQUFJLFdBQVcsS0FBSyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQzdFLG9CQUFRLEtBQUssSUFBSSxPQUFPLEtBQUssTUFBTSxLQUFLLEtBQUssQ0FBQztBQUM5QyxzQkFBVTtBQUFBLFVBQ1o7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFHQSxVQUFNLE1BQU0sS0FBSyxVQUFVLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDN0MsUUFBSSxPQUFPLElBQUksSUFBSSxPQUFPLEtBQUssS0FBSyxPQUFPLEVBQUcsS0FBSTtBQUVsRCxRQUFJLEtBQUssTUFBTSxNQUFNLEdBQUcsS0FBSyxhQUFhLENBQUM7QUFDM0MsUUFBSSxJQUFJLEVBQUcsU0FBUSxLQUFLLElBQUksT0FBTyxDQUFDO0FBQ3BDLFdBQU8sRUFBRSxHQUFHLE9BQU8sVUFBVSxZQUFZLElBQUksT0FBTyxRQUFRO0FBQUEsRUFDOUQ7QUFBQSxFQUVBLE9BQU8sR0FBVyxHQUFtQjtBQUNuQyxXQUFPLEtBQUssT0FBTyxHQUFHLENBQUMsRUFBRTtBQUFBLEVBQzNCO0FBQUE7QUFBQSxFQUdBLFlBQ0UsR0FBVyxHQUFXLEtBQWUsT0FDckMsT0FDTztBQUNQLFVBQU0sSUFBSSxJQUFJO0FBQ2QsUUFBSSxJQUFJLFdBQVcsSUFBSSxRQUFRLEVBQUcsUUFBTyxJQUFJO0FBQzdDLFVBQU0sUUFBUSxLQUFLLFVBQVU7QUFDN0IsUUFBSSxTQUFTLElBQUksR0FBRztBQUNsQixZQUFNLE1BQU0sTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUM5QixVQUFJLE9BQU8sSUFBSSxJQUFJLElBQUksUUFBUSxPQUFPLElBQUksUUFBUSxNQUFNO0FBQ3RELGVBQU8sS0FBSyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxNQUFNLElBQUksU0FBUyxJQUFJO0FBQUEsTUFDekU7QUFBQSxJQUNGO0FBQ0EsVUFBTSxXQUFXLGVBQWUsS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ2xGLFFBQUksS0FBSyxZQUFZLFNBQVMsRUFBRyxRQUFPLElBQUk7QUFDNUMsUUFBSSxLQUFLLFdBQVcsS0FBSyxTQUFTLEtBQUssS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxLQUFNLFFBQU8sSUFBSTtBQUNuRyxRQUFJLEtBQUssV0FBVyxHQUFHLENBQUMsSUFBSSxPQUFPLElBQUksTUFBTSxTQUFTLEVBQUcsUUFBTyxJQUFJO0FBQ3BFLFdBQU8sTUFBTSxHQUFHLEtBQUs7QUFBQSxFQUN2QjtBQUNGOzs7QUMvSE8sU0FBUyxPQUFPLElBQVksTUFBc0I7QUFDdkQsTUFBSSxJQUFJLGNBQWMsT0FBTztBQUM3QixXQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsUUFBUSxLQUFLO0FBQ2xDLFNBQUssR0FBRyxXQUFXLENBQUM7QUFDcEIsUUFBSSxLQUFLLEtBQUssR0FBRyxRQUFVO0FBQUEsRUFDN0I7QUFDQSxNQUFJLEtBQUssS0FBSyxJQUFLLE1BQU0sSUFBSyxTQUFVO0FBQ3hDLE1BQUksS0FBSyxLQUFLLElBQUssTUFBTSxJQUFLLFNBQVU7QUFDeEMsV0FBUyxJQUFLLE1BQU0sUUFBUyxLQUFLO0FBQ3BDO0FBS08sU0FBUyxpQkFBaUIsTUFBMkI7QUFDMUQsU0FBTyxLQUFLLFdBQVcsWUFBWSxLQUFLLFNBQVM7QUFDbkQ7QUE0Qk8sU0FBUyxZQUFZLFFBQXdDO0FBQ2xFLE1BQUksQ0FBQyxpQkFBaUIsT0FBTyxJQUFJLEVBQUcsUUFBTztBQUMzQyxRQUFNLElBQUksT0FBTyxPQUFPLElBQUksS0FBTTtBQUNsQyxNQUFJLE9BQU8sR0FBRyxXQUFXLE9BQU8sRUFBRyxRQUFPLElBQUksTUFBTSxRQUFRO0FBRTVELFFBQU0sQ0FBQyxJQUFJLElBQUksSUFBSSxPQUFPLFNBQVMsZUFBZSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxJQUFJO0FBQzFFLFFBQU0sSUFBSSxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksSUFBSSxPQUFPLFFBQVEsTUFBTSxJQUFJLENBQUM7QUFDN0QsUUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNO0FBQzFCLFNBQU8sSUFBSSxPQUFPLFlBQVksSUFBSSxPQUFPLFVBQVUsSUFBSSxPQUFPLFdBQVc7QUFDM0U7QUFjTyxJQUFNLGNBQTJDLEVBQUUsU0FBUyxNQUFNLE9BQU8sS0FBSyxRQUFRLE1BQU0sS0FBSyxLQUFLOzs7QUNyRnRHLElBQU0sYUFBYTtBQUNuQixJQUFNLE9BQU8sYUFBYTtBQUMxQixJQUFNLGFBQWE7QUFDbkIsSUFBTSxrQkFBa0IsYUFBYTtBQUNyQyxJQUFNLFFBQVE7QUFDZCxJQUFNLFFBQVE7QUFDZCxJQUFNLGVBQWUsUUFBUTtBQUM3QixJQUFNLFlBQVk7QUFHbEIsSUFBTSxvQkFBb0I7QUFFMUIsSUFBTSxlQUFlO0FBRXJCLElBQU0sMkJBQTJCO0FBQ2pDLElBQU0sK0JBQWtELENBQUMsbUJBQW1CLFlBQVk7QUFDeEYsSUFBTSx1QkFBdUIsQ0FBQyxNQUNuQyxPQUFPLE1BQU0sWUFBWSw2QkFBNkIsU0FBUyxDQUFDO0FBQzNELElBQU0sZUFBZSxhQUFhLGFBQWE7QUFDL0MsSUFBTSxhQUFhLGFBQWE7QUF1QmhDLElBQU0saUJBQThCO0FBQUEsRUFDekMsTUFBTTtBQUFBLEVBQ04sV0FBVztBQUFBLEVBQ1gsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLEVBQ04sVUFBVTtBQUFBLEVBQ1Ysa0JBQWtCO0FBQ3BCO0FBc0JPLElBQU0sc0JBQXNCLG9CQUFJLElBQWdCO0FBQUEsRUFDckQ7QUFBQSxFQUFtQjtBQUFBLEVBQW9CO0FBQ3pDLENBQUM7QUFDTSxJQUFNLHFCQUFxQixDQUFDLFNBQThCLG9CQUFvQixJQUFJLElBQUk7QUErR3RGLElBQU0sV0FBVyxDQUFDLElBQVksT0FBZSxHQUFHLEVBQUUsSUFBSSxFQUFFO0FBQ3hELElBQU0sZUFBZSxDQUFDLE9BQWUsS0FBSyxhQUFhO0FBQ3ZELElBQU0sZUFBZSxDQUFDLE9BQWUsS0FBSyxhQUFhO0FBQ3ZELElBQU0sYUFBYSxDQUFDLElBQVksUUFBZ0IsT0FDckQsS0FBSyxLQUFLLGFBQWEsU0FBUztBQUMzQixJQUFNLGdCQUFnQixDQUFDLE1BQWMsS0FBSyxPQUFPLElBQUksUUFBUSxVQUFVO0FBQ3ZFLElBQU0sZ0JBQWdCLENBQUMsTUFBYyxLQUFLLE9BQU8sSUFBSSxRQUFRLFVBQVU7QUFDdkUsSUFBTSxnQkFBZ0IsQ0FBQyxNQUFjLEtBQUssY0FBYyxDQUFDLElBQUksYUFBYTtBQUMxRSxJQUFNLGdCQUFnQixDQUFDLE1BQWMsS0FBSyxjQUFjLENBQUMsSUFBSSxhQUFhO0FBQzFFLElBQU0sV0FBVyxDQUFDLE1BQWMsSUFBSTtBQUVwQyxTQUFTLFlBQVksT0FBTyxNQUFNLG1CQUFtQixtQkFBMEI7QUFDcEYsTUFBSSxDQUFDLHFCQUFxQixnQkFBZ0IsRUFBRyxPQUFNLElBQUksTUFBTSxpQ0FBaUMsZ0JBQWdCLEVBQUU7QUFDaEgsU0FBTztBQUFBLElBQ0w7QUFBQSxJQUNBLFFBQVEsRUFBRSxHQUFHLGdCQUFnQixpQkFBaUI7QUFBQSxJQUM5QyxRQUFRLG9CQUFJLElBQUk7QUFBQSxJQUNoQixVQUFVLG9CQUFJLElBQUk7QUFBQSxJQUNsQixjQUFjLG9CQUFJLElBQUk7QUFBQSxJQUN0QixlQUFlLG9CQUFJLElBQUk7QUFBQSxJQUN2QixnQkFBZ0Isb0JBQUksSUFBSTtBQUFBLElBQ3hCLFlBQVksb0JBQUksSUFBSTtBQUFBLElBQ3BCLE9BQU8sQ0FBQztBQUFBLElBQ1IsU0FBUztBQUFBLElBQ1QsT0FBTyxvQkFBSSxJQUFJO0FBQUEsSUFDZixXQUFXLENBQUM7QUFBQSxJQUNaLE9BQU8sb0JBQUksSUFBSTtBQUFBLElBQ2YsT0FBTztBQUFBLE1BQ0wsaUJBQWlCO0FBQUEsTUFBRyxlQUFlO0FBQUEsTUFBRyxjQUFjO0FBQUEsTUFBRyxjQUFjO0FBQUEsTUFDckUsVUFBVTtBQUFBLE1BQUcsT0FBTztBQUFBLE1BQUcsV0FBVztBQUFBLE1BQUcsY0FBYztBQUFBLElBQ3JEO0FBQUEsSUFDQSxnQkFBZ0I7QUFBQSxJQUNoQixVQUFVO0FBQUEsRUFDWjtBQUNGO0FBZU8sSUFBTSxVQUF3QjtBQUFBLEVBQ25DLEVBQUUsSUFBSSxXQUFXLE9BQU8sa0JBQWtCLE1BQU0sU0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksS0FBSyxJQUFJLEdBQUc7QUFBQSxFQUN2RixFQUFFLElBQUksWUFBWSxPQUFPLFlBQVksTUFBTSxVQUFVLElBQUksS0FBSyxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksSUFBSTtBQUFBLEVBQ3pGLEVBQUUsSUFBSSxTQUFTLE9BQU8sbUJBQW1CLE1BQU0sWUFBWSxJQUFJLE1BQU0sSUFBSSxNQUFNLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQSxFQUNoRyxFQUFFLElBQUksUUFBUSxPQUFPLGVBQWUsTUFBTSxTQUFTLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksR0FBRztBQUFBLEVBQ3ZGLEVBQUUsSUFBSSxjQUFjLE9BQU8sZUFBZSxNQUFNLFNBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQUEsRUFDNUYsRUFBRSxJQUFJLFlBQVksT0FBTyxhQUFhLE1BQU0sU0FBUyxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQSxFQUN6RixFQUFFLElBQUksU0FBUyxPQUFPLGdCQUFnQixNQUFNLFNBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQ3RGO0FBRU8sU0FBUyxhQUFhLEdBQW1CO0FBRzlDLFNBQU8sTUFBTSxLQUFLLEtBQUssS0FBSyxJQUFJLE9BQU8sR0FBRyxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUksTUFBTSxFQUFFO0FBQzNFO0FBRU8sU0FBUyxjQUFjLEdBQVcsR0FBbUI7QUFDMUQsU0FBTyxLQUFLLElBQUksSUFBSSxhQUFhLENBQUMsQ0FBQztBQUNyQztBQUVPLFNBQVMsYUFBYSxHQUFXLEdBQW1CO0FBQ3pELFNBQU8sS0FBSyxPQUFPLElBQUksT0FBTyxRQUFRLE1BQU0sSUFBSSxPQUFPLE9BQU8sQ0FBQztBQUNqRTtBQVlPLFNBQVMsZ0JBQWdCLE1BQWMsR0FBVyxHQUFtQjtBQUcxRSxRQUFNLEtBQUssS0FDTixLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPLE9BQy9DLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU87QUFDbEQsUUFBTSxLQUFLLEtBQ04sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU8sT0FDM0QsS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU87QUFFOUQsUUFBTSxTQUFTLEtBQUssTUFBTSxLQUFLLFFBQVEsS0FBSyxLQUFLLFFBQVEsQ0FBQztBQUMxRCxRQUFNLGNBQWMsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksT0FBTyxRQUNoRSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ3BELFFBQU0sV0FBVyxJQUFNLFNBQVM7QUFDaEMsUUFBTSxTQUFTLFdBQVcsT0FBTyxNQUFNLFFBQVE7QUFFL0MsUUFBTSxhQUFhLE1BQU0sSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUM7QUFJbkUsUUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUM7QUFDN0QsUUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQ3hELFFBQU0sUUFBUSxNQUFNLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUNsRCxNQUFNLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQztBQUs1QyxRQUFNLGNBQWMsS0FBSyxLQUFLLE1BQU0sSUFBSSxLQUFLLE1BQU0sR0FBRyxPQUFPLEtBQUssQ0FBQztBQUNuRSxRQUFNLGFBQWEsV0FBVyxLQUFNLE1BQU0sV0FBVztBQUNyRCxRQUFNLFFBQVEsSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQzFFLFFBQU0sU0FBUyxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUM7QUFDekUsUUFBTSxTQUFTLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTyxRQUFRLE1BQU0sS0FBSyxPQUFPLFFBQVEsRUFBRTtBQUM1RSxRQUFNLFFBQVEsS0FBSyxJQUFJLEdBQUcsY0FBYyxNQUFPLE1BQU8sVUFBVSxPQUFPLE1BQU07QUFFN0UsTUFBSSxJQUFJLFFBQVEsUUFBUSxRQUNwQixTQUFTLEtBQUssS0FBSyxRQUFRLFFBQVEsS0FBSztBQUs1QyxRQUFNLE9BQU8sSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQ3ZFLFFBQU0sUUFBUSxLQUFLLElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxHQUFHLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7QUFDOUYsUUFBTSxPQUFPLFFBQVEsSUFBTSxRQUFRO0FBRW5DLE1BQUksY0FBYyxJQUFJLGNBQWM7QUFDcEMsT0FBSyxNQUFNLFdBQVcsR0FBSyxLQUFNLFFBQVE7QUFNekMsUUFBTSxLQUFLLGNBQWMsSUFBSSxFQUFFO0FBQy9CLFFBQU0sU0FBUyxXQUFXLElBQUksSUFBSSxFQUFFLElBQUksV0FBVyxHQUFLLEtBQU0sUUFBUTtBQUN0RSxRQUFNLGNBQWMsTUFBTSxJQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQztBQUNwRSxNQUFJLEtBQUssR0FBRyxhQUFhLFNBQVMsSUFBSTtBQUN0QyxRQUFNLFNBQVMsSUFBTSxJQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQztBQUsvRCxRQUFNLFVBQVUsV0FBVyxTQUFTLElBQUksU0FBUyxLQUFLLEVBQUU7QUFDeEQsTUFBSSxXQUFXLEVBQUssS0FBSSxLQUFLLEdBQUcsSUFBTSxVQUFVLElBQUk7QUFHcEQsUUFBTSxRQUFRLGFBQWEsSUFBSSxFQUFFLEtBQzVCLElBQUksUUFBUSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ2hFLE1BQUksUUFBUSxNQUFNO0FBQ2hCLFVBQU0sV0FBVyxXQUFXLE1BQU0sTUFBTSxLQUFLO0FBQzdDLFFBQUksS0FBSyxHQUFHLE1BQU0sV0FBVyxJQUFJO0FBQUEsRUFDbkM7QUFLQSxRQUFNLFNBQVMsS0FBSyxPQUFPLElBQUksS0FBSyxPQUFPLE1BQU0sSUFBSSxLQUFLLE9BQU8sQ0FBQyxLQUM3RCxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ2xELFFBQU0sUUFBUSxXQUFXLE1BQU0sTUFBTSxNQUFNO0FBQzNDLE1BQUksUUFBUSxHQUFHO0FBQ2IsVUFBTSxTQUFTLEtBQU8sTUFBTSxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxJQUFJO0FBQ3RFLFFBQUksS0FBSyxHQUFHLFFBQVEsUUFBUSxJQUFJO0FBQUEsRUFDbEM7QUFFQSxTQUFPLEtBQUssTUFBTSxNQUFNLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDckM7QUFFQSxTQUFTLFFBQVEsTUFBYyxHQUFXLEdBQVcsR0FBbUI7QUFDdEUsU0FBTyxLQUFLO0FBQUEsSUFDVixLQUFLLElBQUksSUFBSSxnQkFBZ0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDNUMsS0FBSyxJQUFJLElBQUksZ0JBQWdCLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzVDLEtBQUssSUFBSSxJQUFJLGdCQUFnQixNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUM1QyxLQUFLLElBQUksSUFBSSxnQkFBZ0IsTUFBTSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQUEsRUFDOUM7QUFDRjtBQUVBLFNBQVMsY0FBYyxNQUFjLEdBQVcsR0FBVyxHQUFXLE9BQWUsV0FBNEI7QUFJL0csTUFBSSxjQUFjLEdBQUcsQ0FBQyxJQUFJLE1BQU0sSUFBSSxZQUFZLEVBQUcsUUFBTyxJQUFJO0FBQzlELE1BQUksS0FBSyxZQUFZLElBQUssUUFBTyxJQUFJO0FBQ3JDLE1BQUksY0FBYyxRQUFXO0FBQzNCLGdCQUNFLGdCQUFnQixNQUFNLElBQUksR0FBRyxDQUFDLElBQUksWUFBWSxLQUM5QyxnQkFBZ0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFlBQVksS0FDOUMsZ0JBQWdCLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxZQUFZLEtBQzlDLGdCQUFnQixNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksWUFBWTtBQUFBLEVBQ2xEO0FBQ0EsTUFBSSxhQUFhLEtBQUssWUFBWSxJQUFLLFFBQU8sSUFBSTtBQUNsRCxNQUFJLFNBQVMsRUFBRyxRQUFPLElBQUk7QUFDM0IsTUFBSSxJQUFJLE1BQU0sS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBTSxRQUFPLElBQUk7QUFDckUsTUFBSSxJQUFJLE1BQU0sU0FBUyxFQUFHLFFBQU8sSUFBSTtBQUNyQyxNQUFJLElBQUksTUFBTSxTQUFTLEtBQUssS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBTSxRQUFPLElBQUk7QUFDbkYsU0FBTyxJQUFJO0FBRWI7QUFTQSxTQUFTLFdBQVcsS0FBbUI7QUFDckMsTUFBSSxRQUFRLElBQUksU0FBUyxRQUFRLElBQUksS0FBTSxRQUFPLElBQUk7QUFDdEQsTUFBSSxRQUFRLElBQUksS0FBTSxRQUFPLElBQUk7QUFDakMsTUFBSSxRQUFRLElBQUksS0FBTSxRQUFPLElBQUk7QUFDakMsTUFBSSxRQUFRLElBQUksT0FBUSxRQUFPLElBQUk7QUFDbkMsU0FBTyxJQUFJO0FBQ2I7QUFFQSxTQUFTLE1BQU0sTUFBYyxHQUFXLEdBQVcsR0FBb0I7QUFDckUsUUFBTSxVQUFVLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQztBQUNsRCxNQUFJLFVBQVUsS0FBTSxRQUFPO0FBQzNCLFFBQU0sSUFBSSxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLE9BQU8sR0FBRztBQUM5RCxRQUFNLEtBQUssWUFBWSxJQUFJLE9BQU8sR0FBRyxJQUFJLE1BQU0sSUFBSSxPQUFPLEdBQUcsT0FBTyxHQUFHO0FBQ3ZFLFNBQU8sSUFBSSxPQUFRLEtBQUs7QUFDMUI7QUFFQSxTQUFTLE9BQU8sTUFBYyxHQUFXLEdBQVcsR0FBb0I7QUFDdEUsU0FBTyxLQUFLLElBQUksT0FBTyxJQUFJLE1BQU0sSUFBSSxPQUFPLE9BQU8sS0FBSyxDQUFDLElBQUk7QUFDL0Q7QUFFQSxTQUFTLFdBQVcsTUFBYyxHQUFXLEdBQVcsR0FBb0I7QUFDMUUsU0FBTyxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLE9BQU8sR0FBRyxJQUFJO0FBQ2pFO0FBR0EsSUFBTSxVQUFVLG9CQUFJLElBQXVCO0FBQzNDLElBQU0sYUFBYSxvQkFBSSxJQUF1QjtBQUd2QyxTQUFTLGFBQWEsTUFBYyxTQUE0QjtBQUNyRSxNQUFJLFdBQVcsYUFBYyxRQUFPLFVBQVUsSUFBSSxFQUFFO0FBQ3BELFFBQU0sTUFBTSxHQUFHLElBQUksSUFBSSxPQUFPO0FBQzlCLE1BQUksUUFBUSxXQUFXLElBQUksR0FBRztBQUM5QixNQUFJLENBQUMsT0FBTztBQUNWLFlBQVEsSUFBSSxVQUFVLEVBQUUsTUFBTSxTQUFTLFVBQVUsQ0FBQyxHQUFHLE1BQU0sZ0JBQWdCLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUN4RixlQUFXLElBQUksS0FBSyxLQUFLO0FBQUEsRUFDM0I7QUFDQSxTQUFPO0FBQ1Q7QUFHTyxTQUFTLFVBQVUsTUFBeUI7QUFDakQsTUFBSSxNQUFNLFFBQVEsSUFBSSxJQUFJO0FBQzFCLE1BQUksQ0FBQyxLQUFLO0FBQ1IsVUFBTSxZQUFZLElBQUksVUFBVSxFQUFFLE1BQU0sU0FBUyxjQUFjLFVBQVUsQ0FBQyxHQUFHLE1BQU0sZ0JBQWdCLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUNoSCxVQUFNLElBQUksVUFBVSxNQUFNLGlCQUFpQixTQUFTO0FBQ3BELFlBQVEsSUFBSSxNQUFNLEdBQUc7QUFBQSxFQUN2QjtBQUNBLFNBQU87QUFDVDtBQUdPLFNBQVMsYUFBYSxNQUFjLFNBQWlCLEdBQVcsR0FBbUI7QUFDeEYsU0FBTyxXQUFXLGVBQWUsVUFBVSxJQUFJLEVBQUUsT0FBTyxHQUFHLENBQUMsSUFBSSxnQkFBZ0IsTUFBTSxHQUFHLENBQUM7QUFDNUY7QUFTQSxTQUFTLGVBQWUsTUFBYyxTQUFpQixHQUFXLEdBQVcsR0FBbUI7QUFDOUYsU0FBTyxLQUFLO0FBQUEsSUFDVixLQUFLLElBQUksSUFBSSxhQUFhLE1BQU0sU0FBUyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsS0FBSyxJQUFJLElBQUksYUFBYSxNQUFNLFNBQVMsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELEtBQUssSUFBSSxJQUFJLGFBQWEsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUNsRCxLQUFLLElBQUksSUFBSSxhQUFhLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQUEsRUFDcEQ7QUFDRjtBQUdPLFNBQVMsbUJBQ2QsTUFBYyxTQUFpQixHQUFXLEdBQVcsR0FBVyxPQUFlLFdBQ3hFO0FBQ1AsTUFBSSxXQUFXLGNBQWM7QUFDM0IsVUFBTSxNQUFNLFVBQVUsSUFBSTtBQUMxQixXQUFPLElBQUk7QUFBQSxNQUFZO0FBQUEsTUFBRztBQUFBLE1BQUcsSUFBSSxPQUFPLEdBQUcsQ0FBQztBQUFBLE1BQUc7QUFBQSxNQUM3QyxDQUFDLElBQUksT0FBTyxjQUFjLE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxTQUFTO0FBQUEsSUFBQztBQUFBLEVBQzVEO0FBQ0EsU0FBTyxjQUFjLE1BQU0sR0FBRyxHQUFHLEdBQUcsT0FBTyxTQUFTO0FBQ3REO0FBZ0JPLFNBQVMsWUFBWSxPQUFjLElBQVksSUFBK0I7QUFDbkYsTUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLE1BQU0sbUJBQW1CLE1BQU0sZ0JBQWlCLFFBQU87QUFDL0UsUUFBTSxNQUFNLFNBQVMsSUFBSSxFQUFFO0FBQzNCLFFBQU0sV0FBVyxNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQ3JDLE1BQUksU0FBVSxRQUFPO0FBQ3JCLFNBQU8sY0FBYyxPQUFPLElBQUksRUFBRTtBQUNwQztBQUVPLFNBQVMsY0FBYyxPQUFjLElBQVksSUFBK0I7QUFDckYsTUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLE1BQU0sbUJBQW1CLE1BQU0sZ0JBQWlCLFFBQU87QUFDL0UsUUFBTSxXQUFXLE1BQU0sT0FBTyxJQUFJLFNBQVMsSUFBSSxFQUFFLENBQUM7QUFDbEQsTUFBSSxTQUFVLFFBQU87QUFDckIsUUFBTSxLQUFLLFlBQVksSUFBSTtBQUMzQixRQUFNLE9BQU8sa0JBQWtCLE1BQU0sTUFBTSxNQUFNLE9BQU8sa0JBQWtCLElBQUksRUFBRTtBQUNoRixTQUFPLGlCQUFpQixPQUFPLE1BQU0sWUFBWSxJQUFJLElBQUksRUFBRTtBQUM3RDtBQWtCTyxTQUFTLGtCQUFrQixNQUFjLFNBQWlCLElBQVksSUFBdUI7QUFDbEcsUUFBTSxPQUFPLElBQUksV0FBVyxZQUFZO0FBQ3hDLFFBQU0sVUFBVSxJQUFJLFdBQVcsVUFBVTtBQUN6QyxRQUFNLGVBQWUsSUFBSSxXQUFXLFVBQVU7QUFDOUMsUUFBTSxLQUFLLGFBQWEsRUFBRSxHQUFHLEtBQUssYUFBYSxFQUFFO0FBQ2pELFFBQU0sS0FBSyxXQUFXLGVBQWUsVUFBVSxJQUFJLElBQUk7QUFHdkQsUUFBTSxJQUFJO0FBQ1YsUUFBTSxLQUFLLGFBQWEsSUFBSTtBQUM1QixRQUFNLFFBQVEsSUFBSSxXQUFXLEtBQUssRUFBRTtBQUNwQyxRQUFNLFNBQTRCLEtBQUssSUFBSSxNQUFNLFVBQVUsSUFBSTtBQUMvRCxXQUFTLEtBQUssR0FBRyxLQUFLLElBQUksTUFBTTtBQUM5QixhQUFTLEtBQUssR0FBRyxLQUFLLElBQUksTUFBTTtBQUM5QixZQUFNLEtBQUssS0FBSyxLQUFLLEdBQUcsS0FBSyxLQUFLLEtBQUs7QUFDdkMsVUFBSSxJQUFJO0FBQ04sY0FBTSxNQUFNLEdBQUcsT0FBTyxJQUFJLEVBQUU7QUFDNUIsY0FBTSxLQUFLLEtBQUssRUFBRSxJQUFJLElBQUk7QUFDMUIsY0FBTSxLQUFLLEtBQUssR0FBRyxLQUFLLEtBQUs7QUFDN0IsWUFBSSxNQUFNLEtBQUssTUFBTSxLQUFLLEtBQUssY0FBYyxLQUFLLFdBQVksUUFBUSxLQUFLLGFBQWEsRUFBRSxJQUFJO0FBQUEsTUFDaEcsT0FBTztBQUNMLGNBQU0sS0FBSyxLQUFLLEVBQUUsSUFBSSxnQkFBZ0IsTUFBTSxJQUFJLEVBQUU7QUFBQSxNQUNwRDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBRUEsTUFBSSxTQUFTO0FBQ2IsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsWUFBTSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUs7QUFDOUIsWUFBTSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxFQUFFO0FBQ3hDLFlBQU0sUUFBUSxLQUFLO0FBQUEsUUFDakIsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO0FBQUEsUUFDaEQsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO0FBQUEsUUFDaEQsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxDQUFDO0FBQUEsUUFDaEQsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxDQUFDO0FBQUEsTUFDbEQ7QUFDQSxZQUFNLFlBQ0osT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxJQUFJLFlBQVksS0FDbEQsT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxJQUFJLFlBQVksS0FDbEQsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxJQUFJLFlBQVksS0FDbEQsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxJQUFJLFlBQVk7QUFDcEQsWUFBTSxRQUFRLFNBQVMsT0FBTyxLQUFLLGFBQWEsRUFBRSxJQUFJO0FBQ3RELFlBQU0sTUFBTSxNQUFNLFFBQ2QsR0FBRyxZQUFZLElBQUksSUFBSSxPQUFPLE9BQU8sQ0FBQyxJQUFJLE9BQU8sY0FBYyxNQUFNLElBQUksSUFBSSxJQUFJLElBQUksU0FBUyxDQUFDLElBQy9GLGNBQWMsTUFBTSxJQUFJLElBQUksR0FBRyxPQUFPLFNBQVM7QUFDbkQsWUFBTSxNQUFNLFdBQVcsR0FBRztBQUMxQixZQUFNLGVBQWUsS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUk7QUFDN0QsWUFBTSxNQUFNLEtBQUssYUFBYTtBQUU5QixZQUFNLFFBQVE7QUFDZCxZQUFNLE1BQU0sS0FBSyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7QUFDckMsZUFBUyxJQUFJLE9BQU8sS0FBSyxLQUFLLEtBQUs7QUFDakMsY0FBTSxRQUFRLElBQUksSUFBSTtBQUN0QixZQUFJO0FBQ0osWUFBSSxNQUFNLE1BQU8sS0FBSSxJQUFJO0FBQUEsaUJBQ2hCLFVBQVUsRUFBRyxLQUFJO0FBQUEsaUJBQ2pCLFNBQVMsRUFBRyxLQUFJO0FBQUEsWUFDcEIsS0FBSSxJQUFJO0FBRWIsWUFBSSxNQUFNLElBQUksU0FBUyxRQUFRLEtBQUssZ0JBQWdCLE1BQU0sTUFBTSxJQUFJLEdBQUcsRUFBRSxHQUFHO0FBQzFFLGNBQUksSUFBSTtBQUFBLFFBQ1Y7QUFJQSxZQUFJLFNBQVMsS0FBSyxTQUFTLEtBQUssV0FBVyxNQUFNLElBQUksR0FBRyxFQUFFLEdBQUc7QUFDM0QsY0FBSSxJQUFJO0FBQUEsUUFDVjtBQUVBLFlBQUksTUFBTSxJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVEsTUFBTSxPQUFPLE1BQU0sSUFBSSxHQUFHLEVBQUUsR0FBRztBQUN2RSxjQUFJLElBQUk7QUFBQSxRQUNWO0FBRUEsWUFBSSxNQUFNLElBQUksS0FBSztBQUNqQixlQUFLLFdBQVcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSTtBQUN4QztBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBSUEsWUFBTSxhQUFhLFFBQVEsS0FBSyxJQUFJLE9BQU8sTUFBTSxLQUFLLElBQUk7QUFDMUQsVUFBSSxJQUFJLFlBQVk7QUFDbEIsaUJBQVMsSUFBSSxLQUFLLElBQUksT0FBTyxDQUFDLEdBQUcsSUFBSSxZQUFZLEtBQUs7QUFDcEQsZ0JBQU0sTUFBTSxXQUFXLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRTtBQUMxQyxjQUFJLEtBQUssR0FBRyxNQUFNLElBQUksS0FBSztBQUN6QixpQkFBSyxHQUFHLElBQUksSUFBSTtBQUNoQjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUVBLFlBQU0sV0FBVyxLQUFLLElBQUksUUFBUSxHQUFHLEtBQUssSUFBSSxPQUFPLElBQUksQ0FBQyxDQUFDO0FBQzNELGNBQVEsR0FBRyxJQUFJLE1BQU0sV0FBVyxPQUFPLEdBQUcsZUFBZSxDQUFDO0FBQzFELG1CQUFhLEdBQUcsSUFBSTtBQUFBLElBQ3RCO0FBQUEsRUFDRjtBQUlBLFdBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLGFBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLFlBQU0sSUFBSSxPQUFPLEtBQUssS0FBSyxNQUFNLEtBQUssRUFBRTtBQUN4QyxZQUFNLFFBQVEsS0FBSztBQUFBLFFBQ2pCLEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUFBLFFBQ2hELEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUFBLFFBQ2hELEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLEVBQUUsQ0FBQztBQUFBLFFBQ2hELEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLEVBQUUsQ0FBQztBQUFBLE1BQ2xEO0FBQ0EsVUFBSSxRQUFRLEVBQUc7QUFDZixZQUFNLE9BQWdDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN2RSxpQkFBVyxDQUFDLElBQUksRUFBRSxLQUFLLE1BQU07QUFDM0IsY0FBTSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUs7QUFDOUIsWUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLE1BQU0sY0FBYyxNQUFNLFdBQVk7QUFDOUQsY0FBTSxLQUFLLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxFQUFFO0FBQ3pDLFlBQUksSUFBSSxLQUFLLEVBQUc7QUFDaEIsWUFBSSxPQUFPLElBQUksSUFBSSxLQUFLLElBQUksS0FBSyxHQUFHLE9BQU8sR0FBRyxJQUFJLEtBQU07QUFDeEQsY0FBTSxJQUFJLElBQUk7QUFDZCxZQUFJLElBQUksU0FBUyxLQUFLLEVBQUc7QUFDekIsY0FBTSxNQUFNLFdBQVcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFO0FBQzFDLFlBQUksS0FBSyxHQUFHLE1BQU0sSUFBSSxLQUFLO0FBQ3pCLGVBQUssR0FBRyxJQUFJLElBQUk7QUFDaEI7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBSUEsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsVUFBSSxXQUFXO0FBQ2YsVUFBSSxTQUFpQixhQUFhLEtBQUssYUFBYSxFQUFFO0FBQ3RELGVBQVMsSUFBSSxRQUFRLEdBQUcsS0FBSyxPQUFPLEtBQUs7QUFDdkMsY0FBTSxJQUFJLEtBQUssV0FBVyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUM5QyxZQUFJLFFBQVEsQ0FBQyxHQUFHO0FBQUUscUJBQVc7QUFBRyxtQkFBUztBQUFHO0FBQUEsUUFBTztBQUFBLE1BQ3JEO0FBQ0EsY0FBUSxLQUFLLGFBQWEsRUFBRSxJQUFJLE1BQU0sV0FBVyxPQUFPLEdBQUcsZUFBZSxDQUFDO0FBQzNFLG1CQUFhLEtBQUssYUFBYSxFQUFFLElBQUk7QUFBQSxJQUN2QztBQUFBLEVBQ0Y7QUFFQSxTQUFPLEVBQUUsSUFBSSxJQUFJLE1BQU0sU0FBUyxNQUFNLFNBQVMsY0FBYyxPQUFPO0FBQ3RFO0FBT08sU0FBUyxpQkFBaUIsT0FBYyxNQUFpQixlQUFlLEdBQXNCO0FBQ25HLE1BQUksS0FBSyxTQUFTLE1BQU0sUUFBUSxLQUFLLFlBQVksTUFBTSxPQUFPLGtCQUFrQjtBQUM5RSxVQUFNLElBQUksTUFBTSx1REFBdUQ7QUFBQSxFQUN6RTtBQUNBLFFBQU0sRUFBRSxJQUFJLElBQUksTUFBTSxTQUFTLGNBQWMsT0FBTyxJQUFJO0FBQ3hELE1BQUksS0FBSyxLQUFLLEtBQUssS0FBSyxNQUFNLG1CQUFtQixNQUFNLGdCQUFpQixRQUFPO0FBQy9FLFFBQU0sTUFBTSxTQUFTLElBQUksRUFBRTtBQUMzQixRQUFNLFdBQVcsTUFBTSxPQUFPLElBQUksR0FBRztBQUNyQyxNQUFJLFNBQVUsUUFBTztBQUNyQixRQUFNLFFBQW9CO0FBQUEsSUFDeEI7QUFBQSxJQUFJO0FBQUEsSUFBSTtBQUFBLElBQUs7QUFBQSxJQUFNO0FBQUEsSUFBUztBQUFBLElBQWM7QUFBQSxJQUMxQyxPQUFPO0FBQUEsSUFDUCxhQUFhLFlBQVksSUFBSTtBQUFBLEVBQy9CO0FBR0EsUUFBTSxRQUFRLE1BQU0sTUFBTSxJQUFJLEdBQUc7QUFDakMsTUFBSSxPQUFPO0FBQ1QsZUFBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLE9BQU87QUFDNUIsWUFBTSxLQUFLLEdBQUcsSUFBSTtBQUFBLElBQ3BCO0FBRUEsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsZUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLEtBQU0sbUJBQWtCLE9BQU8sSUFBSSxFQUFFO0FBQUEsSUFDekU7QUFBQSxFQUNGO0FBR0EsTUFBSSxlQUFlO0FBQ25CLGFBQVdDLGFBQVksTUFBTSxLQUFNLEtBQUlBLGNBQWEsSUFBSSxJQUFLO0FBQzdELFFBQU0sTUFBTSxnQkFBZ0IsZUFBZTtBQUUzQyxRQUFNLE9BQU8sSUFBSSxLQUFLLEtBQUs7QUFDM0IsUUFBTSxNQUFNO0FBQ1osUUFBTSxNQUFNLGdCQUFnQjtBQUM1QixRQUFNLE1BQU0sZ0JBQWdCO0FBQzVCLFFBQU0sTUFBTSxJQUFJLEdBQUc7QUFFbkIsbUJBQWlCLE9BQU8sS0FBSztBQUM3QixTQUFPO0FBQ1Q7QUFLQSxJQUFNLGtCQUFrQixvQkFBSSxRQUErRTtBQUtwRyxTQUFTLG1CQUFtQixNQUFjLFNBQWlCLElBQVksSUFBeUI7QUFDckcsUUFBTSxVQUFVLEVBQUUsU0FBUyxJQUFJLFdBQVcsVUFBVSxHQUFHLGNBQWMsSUFBSSxXQUFXLFVBQVUsRUFBRTtBQUNoRyxXQUFTLEtBQUssR0FBRyxLQUFLLFlBQVksTUFBTTtBQUN0QyxhQUFTLEtBQUssR0FBRyxLQUFLLFlBQVksTUFBTTtBQUN0QyxZQUFNLElBQUksYUFBYSxFQUFFLElBQUksSUFBSSxJQUFJLGFBQWEsRUFBRSxJQUFJO0FBQ3hELFlBQU0sSUFBSSxhQUFhLE1BQU0sU0FBUyxHQUFHLENBQUM7QUFDMUMsWUFBTSxRQUFRLFdBQVcsZUFDckIsZUFBZSxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxRQUFRLE1BQU0sR0FBRyxHQUFHLENBQUM7QUFDbEUsWUFBTSxRQUFRLEtBQUssYUFBYTtBQUNoQyxjQUFRLFFBQVEsS0FBSyxJQUFJLE1BQU0sSUFBSSxPQUFPLEdBQUcsZUFBZSxDQUFDO0FBQzdELGNBQVEsYUFBYSxLQUFLLElBQUksV0FBVyxlQUNyQyxtQkFBbUIsTUFBTSxTQUFTLEdBQUcsR0FBRyxHQUFHLEtBQUssSUFDaEQsY0FBYyxNQUFNLEdBQUcsR0FBRyxHQUFHLEtBQUs7QUFBQSxJQUN4QztBQUFBLEVBQ0Y7QUFDQSxTQUFPO0FBQ1Q7QUFTQSxTQUFTLFlBQVksT0FBYyxPQUFnQztBQUNqRSxNQUFJLFFBQVEsZ0JBQWdCLElBQUksS0FBSztBQUNyQyxNQUFJLENBQUMsT0FBTztBQUFFLFlBQVEsb0JBQUksSUFBSTtBQUFHLG9CQUFnQixJQUFJLE9BQU8sS0FBSztBQUFBLEVBQUc7QUFDcEUsUUFBTSxTQUFTLE1BQU0sSUFBSSxNQUFNLEdBQUc7QUFDbEMsTUFBSSxPQUFRLFFBQU87QUFDbkIsUUFBTSxVQUFVLG1CQUFtQixNQUFNLE1BQU0sTUFBTSxPQUFPLGtCQUFrQixNQUFNLElBQUksTUFBTSxFQUFFO0FBQ2hHLFFBQU0sSUFBSSxNQUFNLEtBQUssT0FBTztBQUM1QixTQUFPO0FBQ1Q7QUFNQSxJQUFNLGVBQWUsb0JBQUksUUFBdUI7QUFHekMsU0FBUyxZQUFZLE9BQXNCO0FBQ2hELFNBQU8sYUFBYSxJQUFJLEtBQUssS0FBSztBQUNwQztBQUdPLFNBQVMsaUJBQWlCLE9BQW9CO0FBQ25ELGVBQWEsSUFBSSxPQUFPLFlBQVksS0FBSyxJQUFJLENBQUM7QUFDaEQ7QUFPTyxTQUFTLGdCQUFnQixPQUFjLEdBQVcsR0FBOEI7QUFDckYsTUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsS0FBSyxLQUFNLFFBQU87QUFDN0QsU0FBTyxNQUFNLE9BQU8sSUFBSSxTQUFTLGNBQWMsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUMsS0FBSztBQUMzRTtBQVVPLFNBQVMsZ0JBQWdCLE9BQWMsR0FBVyxHQUFXLEdBQXlCO0FBQzNGLE1BQUksSUFBSSxNQUFPLFFBQU8sSUFBSTtBQUMxQixNQUFJLEtBQUssTUFBTyxRQUFPLElBQUk7QUFDM0IsUUFBTSxRQUFRLGdCQUFnQixPQUFPLEdBQUcsQ0FBQztBQUN6QyxNQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLFNBQU8sTUFBTSxLQUFLLFdBQVcsY0FBYyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsY0FBYyxDQUFDLENBQUMsQ0FBQztBQUMvRTtBQVlPLFNBQVMsU0FBUyxPQUFjLEdBQVcsR0FBVyxHQUFrQjtBQUM3RSxNQUFJLElBQUksTUFBTyxRQUFPLElBQUk7QUFDMUIsTUFBSSxLQUFLLE1BQU8sUUFBTyxJQUFJO0FBQzNCLE1BQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLEtBQUssS0FBTSxRQUFPLElBQUk7QUFDakUsUUFBTSxLQUFLLGNBQWMsQ0FBQyxHQUFHLEtBQUssY0FBYyxDQUFDO0FBQ2pELFFBQU0sUUFBUSxZQUFZLE9BQU8sSUFBSSxFQUFFO0FBQ3ZDLE1BQUksQ0FBQyxNQUFPLFFBQU8sSUFBSTtBQUN2QixTQUFPLE1BQU0sS0FBSyxXQUFXLGNBQWMsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFDL0U7QUFFTyxTQUFTLFNBQVMsT0FBYyxHQUFXLEdBQVcsR0FBVyxHQUFtQjtBQUN6RixNQUFJLElBQUksU0FBUyxLQUFLLE1BQU8sUUFBTztBQUNwQyxNQUFJLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxLQUFLLEtBQU0sUUFBTztBQUM3RCxRQUFNLEtBQUssY0FBYyxDQUFDLEdBQUcsS0FBSyxjQUFjLENBQUM7QUFDakQsUUFBTSxNQUFNLFdBQVcsY0FBYyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsY0FBYyxDQUFDLENBQUM7QUFDdEUsUUFBTSxlQUFlLE1BQU0sTUFBTSxJQUFJLFNBQVMsSUFBSSxFQUFFLENBQUMsR0FBRyxJQUFJLEdBQUc7QUFJL0QsTUFBSSxpQkFBaUIsRUFBRyxRQUFPO0FBQy9CLFFBQU0sUUFBUSxZQUFZLE9BQU8sSUFBSSxFQUFFO0FBQ3ZDLE1BQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsTUFBSSxRQUFRLE1BQU0sTUFBTSxJQUFJLE1BQU0sR0FBRztBQUNyQyxNQUFJLENBQUMsT0FBTztBQUFFLFlBQVEsb0JBQUksSUFBSTtBQUFHLFVBQU0sTUFBTSxJQUFJLE1BQU0sS0FBSyxLQUFLO0FBQUEsRUFBRztBQUdwRSxNQUFJLE1BQU0sS0FBSyxHQUFHLE1BQU0sR0FBRztBQUN6QixRQUFJLENBQUMsTUFBTSxJQUFJLEdBQUcsRUFBRyxPQUFNLElBQUksS0FBSyxDQUFDO0FBQ3JDLFdBQU87QUFBQSxFQUNUO0FBQ0EsUUFBTSxLQUFLLEdBQUcsSUFBSTtBQUNsQixRQUFNLElBQUksS0FBSyxDQUFDO0FBQ2hCLG1CQUFpQixLQUFLO0FBQ3RCLFFBQU0sUUFBUTtBQUNkLFFBQU0sTUFBTSxJQUFJLE1BQU0sR0FBRztBQUN6QixRQUFNO0FBQ04sb0JBQWtCLE9BQU8sY0FBYyxDQUFDLEdBQUcsY0FBYyxDQUFDLENBQUM7QUFDM0QsU0FBTztBQUNUO0FBRUEsU0FBUyxrQkFBa0IsT0FBbUIsSUFBWSxJQUFrQjtBQUMxRSxNQUFJLFdBQVc7QUFDZixXQUFTLElBQUksUUFBUSxHQUFHLEtBQUssT0FBTyxLQUFLO0FBQ3ZDLFFBQUksUUFBUSxNQUFNLEtBQUssV0FBVyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUc7QUFBRSxpQkFBVztBQUFHO0FBQUEsSUFBTztBQUFBLEVBQ25GO0FBQ0EsUUFBTSxRQUFRLEtBQUssYUFBYSxFQUFFLElBQUksTUFBTSxXQUFXLE9BQU8sR0FBRyxlQUFlLENBQUM7QUFDakYsUUFBTSxLQUFLLE1BQU0sYUFBYSxLQUFLLGFBQWEsRUFBRTtBQUNsRCxNQUFJLFlBQVksT0FBTztBQUNyQixVQUFNLElBQUksTUFBTSxLQUFLLFdBQVcsSUFBSSxTQUFTLFFBQVEsR0FBRyxFQUFFLENBQUM7QUFDM0QsUUFBSSxNQUFNLElBQUksTUFBTyxPQUFNLGFBQWEsS0FBSyxhQUFhLEVBQUUsSUFBSTtBQUFBLEVBQ2xFLE9BQU87QUFDTCxVQUFNLGFBQWEsS0FBSyxhQUFhLEVBQUUsSUFBSTtBQUFBLEVBQzdDO0FBQ0Y7QUFPTyxTQUFTLFVBQVUsT0FBYyxHQUFXLEdBQW1CO0FBQ3BFLE1BQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLEtBQUssS0FBTSxRQUFPO0FBQzdELFFBQU0sS0FBSyxjQUFjLENBQUMsR0FBRyxLQUFLLGNBQWMsQ0FBQztBQUNqRCxRQUFNLFFBQVEsWUFBWSxPQUFPLElBQUksRUFBRTtBQUN2QyxNQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLFNBQU8sTUFBTSxRQUFRLGNBQWMsQ0FBQyxJQUFJLGFBQWEsY0FBYyxDQUFDLENBQUMsSUFBSSxRQUFRO0FBQ25GO0FBY08sU0FBUyxhQUFhLE9BQWMsR0FBVyxHQUFtQjtBQUN2RSxNQUFJLE1BQU0sT0FBTyxtQkFBbUIsY0FBYztBQUNoRCxVQUFNLElBQUksVUFBVSxPQUFPLEdBQUcsQ0FBQztBQUMvQixXQUFPLElBQUksWUFBWSxZQUFZLElBQUk7QUFBQSxFQUN6QztBQUNBLFNBQU8sZUFBZSxPQUFPLEdBQUcsQ0FBQyxJQUFJLFVBQVUsT0FBTyxHQUFHLENBQUM7QUFDNUQ7QUFNTyxTQUFTLGVBQWUsT0FBYyxHQUFXLEdBQW1CO0FBQ3pFLE1BQUksSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDO0FBQzdCLFNBQU8sSUFBSSxTQUFTLFNBQVMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxNQUFNLElBQUksTUFBTztBQUM1RCxTQUFPO0FBQ1Q7QUFHQSxTQUFTLFVBQVUsT0FBYyxHQUFpQjtBQUNoRCxNQUFJLE1BQU0sU0FBUyxJQUFJLEVBQUUsRUFBRSxLQUFNLG1CQUFtQixFQUFFLElBQUksS0FBSyxDQUFDLGNBQWMsS0FBSyxLQUM5RSxNQUFNLGVBQWUsSUFBSSxFQUFFLEVBQUUsRUFBRztBQUNyQyxRQUFNLFNBQVMsSUFBSSxFQUFFLElBQUksQ0FBQztBQUMxQixNQUFJLE9BQU8sTUFBTSxhQUFhLElBQUksRUFBRSxLQUFLO0FBQ3pDLE1BQUksQ0FBQyxNQUFNO0FBQUUsV0FBTyxDQUFDO0FBQUcsVUFBTSxhQUFhLElBQUksRUFBRSxPQUFPLElBQUk7QUFBQSxFQUFHO0FBQy9ELE9BQUssS0FBSyxFQUFFLEVBQUU7QUFDZCxRQUFNLE1BQU0sV0FBVyxNQUFNLFNBQVM7QUFJeEM7QUEyQkEsU0FBUyxTQUFTLE9BQWUsR0FBbUI7QUFDbEQsU0FBTyxLQUFLLEtBQUssSUFBSSxDQUFDO0FBQ3hCO0FBTU8sU0FBUyxZQUFZLElBQVksSUFBWSxNQUFzQjtBQUN4RSxRQUFNLE9BQU8sS0FBSyxJQUFJLElBQUksS0FBSyxPQUFPLFFBQVEsTUFBTSxLQUFLLE9BQU8sUUFBUSxFQUFFO0FBQzFFLFFBQU0sUUFBUSxLQUFLLElBQUksSUFBSSxLQUFLLE1BQU0sUUFBUSxNQUFNLEtBQUssT0FBTyxRQUFRLEVBQUU7QUFDMUUsUUFBTSxPQUFPLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTyxRQUFRLE1BQU0sS0FBSyxPQUFPLFFBQVEsRUFBRTtBQUMxRSxRQUFNLFFBQVEsS0FBSyxJQUFJLElBQUksS0FBSyxPQUFPLFFBQVEsTUFBTSxLQUFLLE9BQU8sUUFBUSxFQUFFO0FBQzNFLFFBQU0sV0FBVyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUM7QUFDdkQsUUFBTSxTQUFTLEtBQUssSUFBSSxHQUFHLEtBQUssUUFBUSxLQUFLLEtBQUssUUFBUSxFQUFFO0FBQzVELFNBQU8sS0FBSyxJQUFJLE1BQU0sUUFBUSxNQUFNLE9BQU8sS0FBTSxRQUFRLElBQUksSUFBSSxPQUM3RCxXQUFXLE9BQU8sT0FBTyxTQUFTO0FBQ3hDO0FBR08sU0FBUyxVQUFVLElBQVksSUFBWSxNQUFzQjtBQUN0RSxRQUFNLFdBQVcsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQ3ZELFFBQU0sUUFBUSxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUM7QUFDMUUsU0FBTyxXQUFXLE9BQU8sUUFBUTtBQUNuQztBQUVBLFNBQVMsaUJBQWlCLE9BQWMsT0FBeUI7QUFDL0Qsc0JBQW9CLE9BQU8sTUFBTSxJQUFJLE1BQU0sRUFBRTtBQUMvQztBQUdPLFNBQVMsb0JBQW9CLE9BQWMsSUFBWSxJQUFrQjtBQUM5RSxRQUFNLE1BQU0sU0FBUyxJQUFJLEVBQUU7QUFDM0IsTUFBSSxNQUFNLGFBQWEsSUFBSSxHQUFHLEVBQUc7QUFDakMsUUFBTSxRQUFRLFlBQVksT0FBTyxJQUFJLEVBQUU7QUFDdkMsTUFBSSxDQUFDLE1BQU87QUFFWixRQUFNLE1BQU0sV0FBWSxPQUFPLE1BQU0sSUFBSSxNQUFNLElBQUksTUFBTSxPQUFPLEdBQUcsSUFBSSxlQUFnQixDQUFDO0FBQ3hGLFFBQU0sS0FBSyxhQUFhLE1BQU0sRUFBRSxHQUFHLEtBQUssYUFBYSxNQUFNLEVBQUU7QUFDN0QsUUFBTSxVQUFVLFlBQVksT0FBTyxLQUFLO0FBQ3hDLE1BQUksSUFBSTtBQUNSLE1BQUksZUFBZTtBQUNuQixNQUFJLG1CQUFtQjtBQUV2QixRQUFNLGVBQWUsQ0FBQyxJQUFZLE9BQXVCO0FBQ3ZELFdBQU8sUUFBUSxRQUFRLEtBQUssYUFBYSxFQUFFLElBQUk7QUFBQSxFQUNqRDtBQUNBLFFBQU0sV0FBVyxDQUFDLElBQVksT0FBc0I7QUFDbEQsV0FBTyxRQUFRLGFBQWEsS0FBSyxhQUFhLEVBQUU7QUFBQSxFQUNsRDtBQUNBLFFBQU0sYUFBYSxDQUFDLElBQVksT0FBdUI7QUFDckQsVUFBTSxJQUFJLGFBQWEsSUFBSSxFQUFFO0FBQzdCLFdBQU8sS0FBSztBQUFBLE1BQ1YsS0FBSyxJQUFJLElBQUksYUFBYSxNQUFNLEtBQUssR0FBRyxHQUFHLGFBQWEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUFBLE1BQy9ELEtBQUssSUFBSSxJQUFJLGFBQWEsTUFBTSxLQUFLLEdBQUcsR0FBRyxhQUFhLENBQUMsR0FBRyxFQUFFLENBQUM7QUFBQSxNQUMvRCxLQUFLLElBQUksSUFBSSxhQUFhLElBQUksTUFBTSxLQUFLLEdBQUcsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDL0QsS0FBSyxJQUFJLElBQUksYUFBYSxJQUFJLE1BQU0sS0FBSyxHQUFHLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQztBQUFBLElBQ2pFO0FBQUEsRUFDRjtBQUdBLFdBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNLEdBQUc7QUFDekMsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU0sR0FBRztBQUN6QyxZQUFNLEtBQUssTUFBTSxLQUFLLE1BQU0sS0FBSyxLQUFLLElBQUksSUFBSSxPQUFPLENBQUMsR0FBRyxHQUFHLGFBQWEsQ0FBQztBQUMxRSxZQUFNLEtBQUssTUFBTSxLQUFLLE1BQU0sS0FBSyxLQUFLLElBQUksSUFBSSxPQUFPLENBQUMsR0FBRyxHQUFHLGFBQWEsQ0FBQztBQUMxRSxZQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSztBQUM5QixZQUFNLElBQUksYUFBYSxJQUFJLEVBQUU7QUFDN0IsVUFBSSxLQUFLLFlBQVksRUFBRztBQUN4QixZQUFNLFFBQVEsV0FBVyxJQUFJLEVBQUU7QUFDL0IsWUFBTSxNQUFNLFNBQVMsSUFBSSxFQUFFO0FBQzNCLFVBQUksUUFBUSxJQUFJLE1BQU87QUFDdkIsWUFBTSxTQUFTLFlBQVksSUFBSSxJQUFJLE1BQU0sSUFBSTtBQUM3QyxZQUFNLFFBQVEsVUFBVSxJQUFJLElBQUksTUFBTSxJQUFJO0FBQzFDLFlBQU0sT0FBTyxJQUFJO0FBRWpCLFlBQU0sYUFBYSxTQUFTLE1BQU8sT0FBTyxTQUFTLE1BQU8sT0FBTztBQUNqRSxVQUFJLFFBQVEsSUFBSSxTQUFTLFNBQVMsS0FBSyxPQUFPLFlBQVk7QUFHeEQsWUFBSTtBQUNKLFlBQUk7QUFDSixjQUFNLGNBQWMsSUFBSTtBQUN4QixZQUFJLGNBQWMsTUFBTTtBQUN0QixjQUFLLG1CQUFtQixJQUFLLFFBQVEsZUFBZSxJQUFJO0FBQ3RELG1CQUFPO0FBQ1Asc0JBQVUsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDO0FBQzlCLGtCQUFNLE1BQU07QUFBQSxVQUNkLE9BQU87QUFDTCxtQkFBTztBQUNQLHNCQUFVLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQztBQUM5QjtBQUNBLGtCQUFNLE1BQU07QUFBQSxVQUNkO0FBQUEsUUFDRixXQUFXLGNBQWMsS0FBTTtBQUM3QixpQkFBTztBQUNQLG9CQUFVLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQztBQUFBLFFBQ2hDLFdBQVcsY0FBYyxNQUFNO0FBQzdCLGlCQUFPO0FBQ1Asb0JBQVUsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDO0FBQUEsUUFDaEMsT0FBTztBQUNMLGlCQUFPO0FBQ1Asb0JBQVUsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDO0FBQUEsUUFDaEM7QUFDQTtBQUNBLGNBQU0sTUFBTTtBQUNaLGtCQUFVLE9BQU87QUFBQSxVQUNmLElBQUksU0FBUyxNQUFNLEtBQUssR0FBRztBQUFBLFVBQzNCO0FBQUEsVUFBTSxPQUFPLE1BQU07QUFBQSxVQUFLLEdBQUcsS0FBSztBQUFBLFVBQUssR0FBRztBQUFBLFVBQUcsR0FBRyxLQUFLO0FBQUEsVUFDbkQsS0FBSyxLQUFLLE1BQU0sSUFBSSxJQUFJLEVBQUUsS0FBSyxLQUFLLEtBQUs7QUFBQSxVQUN6QyxPQUFPLE9BQU8sSUFBSSxJQUFJO0FBQUEsVUFBTTtBQUFBLFVBQzVCLFVBQVU7QUFBQSxVQUFRLFdBQVc7QUFBQSxVQUFJLGlCQUFpQjtBQUFBLFVBQ2xELFdBQVc7QUFBQSxVQUFPLGFBQWE7QUFBQSxVQUFNLFVBQVU7QUFBQSxRQUNqRCxDQUFDO0FBQ0Q7QUFBQSxNQUNGO0FBQ0EsVUFBSSxRQUFRLElBQUksU0FBUyxRQUFRLFFBQVEsT0FBTyxNQUFNO0FBSXBELGNBQU0sV0FBVyxJQUFJO0FBQ3JCLGNBQU0sT0FBbUIsV0FBVyxPQUFPLG9CQUN2QyxXQUFXLE1BQU8scUJBQXFCO0FBQzNDLGNBQU0sS0FBSyxTQUFTLE1BQU0sS0FBSyxHQUFHO0FBQ2xDLGNBQU0sU0FBUztBQUFBLFVBQ2I7QUFBQSxVQUFJO0FBQUEsVUFBTSxPQUFPLE1BQU07QUFBQSxVQUFLLEdBQUcsS0FBSztBQUFBLFVBQUssR0FBRztBQUFBLFVBQUcsR0FBRyxLQUFLO0FBQUEsVUFDdkQsVUFBVTtBQUFBLFVBQ1YsV0FBVyxTQUFTLG9CQUFvQixJQUFJLFNBQVMscUJBQXFCLElBQUk7QUFBQSxVQUM5RSxpQkFBaUI7QUFBQSxVQUFHLFdBQVc7QUFBQSxVQUFPLGFBQWE7QUFBQSxVQUFNLFVBQVU7QUFBQSxVQUNuRSxLQUFLLEtBQUssTUFBTSxJQUFJLElBQUksRUFBRSxLQUFLLEtBQUssS0FBSztBQUFBLFVBQ3pDLE9BQU8sTUFBTSxJQUFJLElBQUk7QUFBQSxVQUFLLFNBQVMsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDO0FBQUEsUUFDekQ7QUFHQSxZQUFJLGNBQWMsS0FBSyxFQUFHLFdBQVUsT0FBTyxNQUFNO0FBQ2pEO0FBQUEsTUFDRjtBQUNBLFVBQUksUUFBUSxJQUFJLFNBQVMsUUFBUSxRQUFRLE9BQU8sTUFBTTtBQUNwRCxrQkFBVSxPQUFPO0FBQUEsVUFDZixJQUFJLFNBQVMsTUFBTSxLQUFLLEdBQUc7QUFBQSxVQUMzQixNQUFNO0FBQUEsVUFBWSxPQUFPLE1BQU07QUFBQSxVQUFLLEdBQUcsS0FBSztBQUFBLFVBQUssR0FBRztBQUFBLFVBQUcsR0FBRyxLQUFLO0FBQUEsVUFDL0QsS0FBSyxLQUFLLE1BQU0sSUFBSSxJQUFJLEVBQUUsS0FBSyxLQUFLLEtBQUs7QUFBQSxVQUN6QyxPQUFPLE1BQU0sSUFBSSxJQUFJO0FBQUEsVUFBSyxTQUFTLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQztBQUFBLFVBQ3ZELFVBQVU7QUFBQSxVQUFPLFdBQVc7QUFBQSxVQUFHLGlCQUFpQjtBQUFBLFVBQ2hELFdBQVc7QUFBQSxVQUFPLGFBQWE7QUFBQSxVQUFNLFVBQVU7QUFBQSxRQUNqRCxDQUFDO0FBQ0Q7QUFBQSxNQUNGO0FBQ0EsVUFBSSxRQUFRLElBQUksU0FBUyxTQUFTLEtBQUssT0FBTyxLQUFNO0FBQ2xELGtCQUFVLE9BQU87QUFBQSxVQUNmLElBQUksU0FBUyxNQUFNLEtBQUssR0FBRztBQUFBLFVBQzNCLE1BQU07QUFBQSxVQUFjLE9BQU8sTUFBTTtBQUFBLFVBQUssR0FBRyxLQUFLO0FBQUEsVUFBSyxHQUFHO0FBQUEsVUFBRyxHQUFHLEtBQUs7QUFBQSxVQUNqRSxLQUFLLEtBQUssTUFBTSxJQUFJLElBQUksRUFBRSxLQUFLLEtBQUssS0FBSztBQUFBLFVBQ3pDLE9BQU8sTUFBTSxJQUFJLElBQUk7QUFBQSxVQUFLLFNBQVMsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDO0FBQUEsVUFDdkQsVUFBVTtBQUFBLFVBQVMsV0FBVztBQUFBLFVBQUcsaUJBQWlCO0FBQUEsVUFDbEQsV0FBVztBQUFBLFVBQU8sYUFBYTtBQUFBLFVBQU0sVUFBVTtBQUFBLFFBQ2pELENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRjs7O0FDeDlCTyxJQUFNLHFCQUF1RDtBQUFBLEVBQ2xFLGlCQUFpQjtBQUFBLEVBQ2pCLGlCQUFpQjtBQUFBLEVBQ2pCLG1CQUFtQjtBQUFBLEVBQ25CLG1CQUFtQjtBQUFBLEVBQ25CLFlBQVk7QUFBQSxFQUNaLFVBQVU7QUFBQSxFQUNWLFlBQVk7QUFBQSxFQUNaLFVBQVU7QUFBQSxFQUNWLFFBQVE7QUFDVjs7O0FDbElPLElBQU0sbUJBQW1CO0FBQ3pCLElBQU0sbUJBQW1CO0FBQ3pCLElBQU0sYUFBYSxJQUFJO0FBQ3ZCLElBQU0sYUFBYTtBQUNuQixJQUFNLFlBQVk7QUFFbEIsSUFBTSxhQUFhO0FBRW5CLElBQU0sYUFBYTtBQUNuQixJQUFNLGFBQWE7QUFDbkIsSUFBTSx1QkFBdUI7QUFDN0IsSUFBTSxhQUFhO0FBRW5CLElBQU0sb0JBQW9CO0FBTTFCLElBQU0sbUJBQW1CO0FBRWhDLElBQU0sb0JBQW9CO0FBQzFCLElBQU0sbUJBQW1CO0FBQ2xCLElBQU0sVUFBVTtBQUVoQixJQUFNLGNBQWM7QUFFcEIsSUFBTSxhQUFhO0FBRW5CLElBQU0sYUFBYTtBQVFuQixJQUFNLGNBQWM7QUFFcEIsSUFBTSx3QkFBd0I7QUFFOUIsSUFBTSxlQUFlO0FBRXJCLElBQU0sa0JBQWtCO0FBQ3hCLElBQU0sZ0JBQWdCO0FBQ3RCLElBQU0scUJBQXFCO0FBRTNCLElBQU0sYUFBYTtBQUduQixJQUFNLGFBQWE7QUFFbkIsSUFBTSxpQkFBaUI7QUFFdkIsSUFBTSx3QkFBd0I7QUFFOUIsSUFBTSxxQkFBcUI7QUFRM0IsSUFBTSx1QkFBdUI7QUFDN0IsSUFBTSx3QkFBd0I7QUFDOUIsSUFBTSwwQkFBMEI7QUFFaEMsSUFBTSxxQkFBcUI7QUFDM0IsSUFBTSxxQkFBcUI7QUFFM0IsSUFBTSxzQkFBc0I7QUFDNUIsSUFBTSxzQkFBc0I7QUF3RDVCLFNBQVMsZ0JBQWdCLEdBQVcsR0FBVyxHQUFXLFVBQVUsR0FBbUI7QUFDNUYsU0FBTztBQUFBLElBQ0w7QUFBQSxJQUFHO0FBQUEsSUFBRztBQUFBLElBQUcsSUFBSTtBQUFBLElBQUcsSUFBSTtBQUFBLElBQUcsSUFBSTtBQUFBLElBQUc7QUFBQSxJQUFTLFVBQVU7QUFBQSxJQUFPLE1BQU07QUFBQSxJQUFPLE9BQU87QUFBQSxJQUM1RSxRQUFRO0FBQUEsSUFBWSxRQUFRO0FBQUEsSUFBRyxTQUFTO0FBQUEsSUFBRyxnQkFBZ0I7QUFBQSxJQUFPLGNBQWM7QUFBQSxJQUNoRixNQUFNO0FBQUEsSUFBb0IsTUFBTTtBQUFBLElBQUcsTUFBTTtBQUFBLElBQU8sT0FBTztBQUFBLElBQU0sYUFBYTtBQUFBLElBQU8sUUFBUTtBQUFBLElBQU8sWUFBWTtBQUFBLElBQUcsTUFBTSxFQUFFLEdBQUcsR0FBRyxFQUFFO0FBQUEsRUFDakk7QUFDRjtBQVVBLFNBQVMsUUFBUSxPQUFjLEdBQVcsR0FBVyxHQUFvQjtBQUN2RSxNQUFJLElBQUksTUFBTyxRQUFPO0FBQ3RCLFFBQU0sSUFBSSxnQkFBZ0IsT0FBTyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxTQUFPLE1BQU0sUUFBUSxRQUFRLENBQUM7QUFDaEM7QUFFQSxTQUFTLE1BQU0sT0FBYyxHQUFXLEdBQVcsR0FBb0I7QUFDckUsU0FBTyxnQkFBZ0IsT0FBTyxHQUFHLEdBQUcsQ0FBQyxNQUFNLElBQUk7QUFDakQ7QUFHTyxTQUFTLGdCQUFnQixPQUFjLEdBQVcsR0FBVyxHQUFvQjtBQUN0RixRQUFNLElBQUksbUJBQW1CO0FBQzdCLFFBQU0sS0FBSyxLQUFLLE1BQU0sSUFBSSxDQUFDLEdBQUcsS0FBSyxLQUFLLE1BQU0sSUFBSSxDQUFDO0FBQ25ELFFBQU0sS0FBSyxLQUFLLE1BQU0sSUFBSSxDQUFDLEdBQUcsS0FBSyxLQUFLLE1BQU0sSUFBSSxDQUFDO0FBQ25ELFFBQU0sS0FBSyxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsS0FBSyxLQUFLLE1BQU0sSUFBSSxtQkFBbUIsSUFBSTtBQUM1RSxXQUFTLEtBQUssSUFBSSxNQUFNLElBQUksTUFBTTtBQUNoQyxhQUFTLEtBQUssSUFBSSxNQUFNLElBQUksTUFBTTtBQUNoQyxlQUFTLEtBQUssSUFBSSxNQUFNLElBQUksTUFBTTtBQUNoQyxZQUFJLFFBQVEsT0FBTyxJQUFJLElBQUksRUFBRSxFQUFHLFFBQU87QUFBQSxNQUN6QztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0EsU0FBTztBQUNUO0FBR0EsU0FBUyxtQkFBbUIsT0FBYyxHQUFXLEdBQVcsR0FBb0I7QUFDbEYsYUFBVyxLQUFLLE1BQU0sV0FBVyxPQUFPLEdBQUc7QUFDekMsZUFBVyxLQUFLLEVBQUUsU0FBUztBQUN6QixVQUFJLEVBQUUsU0FBUyxXQUFZO0FBQzNCLFVBQUksS0FBSyxJQUFJLEVBQUUsR0FBRyxLQUFLLElBQUksRUFBRTtBQUM3QixVQUFJLEVBQUUsS0FBSztBQUNULGNBQU0sSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxLQUFLLEtBQUssSUFBSSxDQUFDLEVBQUUsR0FBRztBQUNoRCxjQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQ2pELGFBQUs7QUFBSSxhQUFLO0FBQUEsTUFDaEI7QUFDQSxVQUFJLEtBQUssSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLElBQUksb0JBQW9CLEtBQUssSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLElBQUksb0JBQ3JFLElBQUksT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLElBQUksbUJBQW1CLEVBQUUsSUFBSSxLQUFNLFFBQU87QUFBQSxJQUN6RTtBQUFBLEVBQ0Y7QUFDQSxTQUFPO0FBQ1Q7QUFHQSxTQUFTLGVBQWUsT0FBYyxHQUFXLEdBQVcsR0FBbUI7QUFDN0UsTUFBSSxRQUFRO0FBQ1osYUFBVyxLQUFLLE1BQU0sV0FBVyxPQUFPLEdBQUc7QUFDekMsZUFBVyxLQUFLLEVBQUUsU0FBUztBQUN6QixVQUFJLEVBQUUsU0FBUyxXQUFZO0FBQzNCLFVBQUksS0FBSyxJQUFJLEVBQUUsR0FBRyxLQUFLLElBQUksRUFBRTtBQUM3QixVQUFJLEVBQUUsS0FBSztBQUNULGNBQU0sSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxLQUFLLEtBQUssSUFBSSxDQUFDLEVBQUUsR0FBRztBQUNoRCxjQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQ2pELGFBQUs7QUFBSSxhQUFLO0FBQUEsTUFDaEI7QUFDQSxVQUFJLEtBQUssSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLElBQUksbUJBQW1CLE9BQU8sS0FBSyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksSUFBSSxtQkFBbUIsS0FBSztBQUN0RyxjQUFNLE1BQU0sRUFBRSxJQUFJLEVBQUU7QUFDcEIsWUFBSSxPQUFPLElBQUksUUFBUSxNQUFNLE1BQU8sU0FBUTtBQUFBLE1BQzlDO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDQSxTQUFPO0FBQ1Q7QUFFQSxTQUFTLFNBQVMsT0FBYyxHQUFXLEdBQVcsR0FBb0I7QUFDeEUsU0FBTyxnQkFBZ0IsT0FBTyxHQUFHLEdBQUcsQ0FBQyxLQUFLLG1CQUFtQixPQUFPLEdBQUcsR0FBRyxDQUFDO0FBQzdFO0FBR0EsU0FBUyxnQkFBZ0IsT0FBYyxHQUF5QjtBQUM5RCxRQUFNLEtBQUssY0FBYyxLQUFLLE1BQU0sRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLGNBQWMsS0FBSyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQzdFLFdBQVMsS0FBSyxJQUFJLE1BQU0sR0FBRyxNQUFNO0FBQy9CLGFBQVMsS0FBSyxJQUFJLE1BQU0sR0FBRyxNQUFNO0FBQy9CLFlBQU0sTUFBTSxNQUFNLGFBQWEsSUFBSSxTQUFTLEtBQUssSUFBSSxLQUFLLEVBQUUsQ0FBQztBQUM3RCxVQUFJLENBQUMsSUFBSztBQUNWLGlCQUFXLE1BQU0sS0FBSztBQUNwQixjQUFNLElBQUksTUFBTSxTQUFTLElBQUksRUFBRTtBQUMvQixZQUFJLENBQUMsS0FBSyxFQUFFLGFBQWEsbUJBQW1CLEVBQUUsSUFBSSxLQUFLLE1BQU0sZUFBZSxJQUFJLEVBQUUsRUFBRztBQUVyRixjQUFNLE9BQU8sRUFBRSxLQUFLLFdBQVcsWUFBWSxJQUFJLFlBQVksWUFBWSxDQUFDLEtBQUssUUFBUSxJQUFJLEVBQUUsU0FDdEYsbUJBQW1CLEVBQUUsSUFBd0IsS0FBSyxPQUFPLE9BQU8sRUFBRTtBQUN2RSxZQUFJLEVBQUUsU0FBUyxhQUFjO0FBQzdCLFlBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxLQUFLLEVBQUUsSUFBSSxtQkFBbUIsRUFBRSxFQUFHO0FBQ25ELGNBQU0sS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLEtBQUssRUFBRSxJQUFJLEVBQUU7QUFDbkMsY0FBTSxJQUFJLEtBQUssTUFBTSxJQUFJLEVBQUU7QUFDM0IsY0FBTSxNQUFNLE9BQU87QUFDbkIsWUFBSSxLQUFLLE9BQU8sSUFBSSxLQUFNO0FBQzFCLGNBQU0sT0FBTyxNQUFNO0FBQ25CLGNBQU0sS0FBSyxFQUFFLElBQUssS0FBSyxJQUFLLE1BQU0sS0FBSyxFQUFFLElBQUssS0FBSyxJQUFLO0FBQ3hELFlBQUksQ0FBQyxTQUFTLE9BQU8sSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHO0FBQUUsWUFBRSxJQUFJO0FBQUksWUFBRSxJQUFJO0FBQUEsUUFBSTtBQUFBLE1BQzNEO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRjtBQU9BLFNBQVMsZUFBZSxPQUFjLEdBQVcsR0FBVyxHQUFtQjtBQUM3RSxRQUFNLEtBQUssS0FBSyxNQUFNLENBQUMsR0FBRyxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQzNDLE1BQUksTUFBTSxLQUFLLE1BQU0sSUFBSSxJQUFJO0FBQzdCLE1BQUksQ0FBQyxNQUFNLE9BQU8sSUFBSSxLQUFLLEVBQUUsRUFBRyxRQUFPO0FBQ3ZDLFNBQU8sTUFBTSxPQUFPLElBQUksTUFBTSxHQUFHLEVBQUUsS0FBSyxNQUFNLElBQUksR0FBSTtBQUN0RCxTQUFPLE1BQU0sSUFBSTtBQUNuQjtBQUVBLElBQU0sVUFBVSxDQUFDLE1BQWUsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUk7QUFHeEQsU0FBUyxVQUFVLE9BQWMsR0FBVyxHQUFXLFNBQTREO0FBQ2pILFFBQU0sSUFBSSxhQUFhLE1BQU0sTUFBTSxNQUFNLE9BQU8sZ0JBQWdCLEVBQUUsT0FBTyxHQUFHLEdBQUcsT0FBTztBQUN0RixTQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksSUFBSSxFQUFFLElBQUksT0FBTyxFQUFFLE1BQU07QUFDOUM7QUFNTyxTQUFTLGNBQWMsT0FBYyxNQUFzQkMsUUFBdUIsS0FBSyxZQUE0QjtBQUN4SCxRQUFNLElBQW9CLEVBQUUsR0FBRyxNQUFNLE1BQU0sRUFBRTtBQUM3QyxNQUFJLEVBQUUsTUFBTTtBQUVWLE1BQUUsS0FBSztBQUFHLE1BQUUsS0FBSztBQUFHLE1BQUUsUUFBUTtBQUM5QixXQUFPO0FBQUEsRUFDVDtBQUNBLFFBQU0sUUFBUSxlQUFlLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDakQsUUFBTSxVQUFVLEVBQUUsSUFBSTtBQUV0QixRQUFNLFdBQVcsU0FBUyxjQUFlLFFBQVEsT0FBTyxDQUFDLEVBQUUsWUFBWSxLQUFLLFNBQVM7QUFDckYsUUFBTSxTQUFTLENBQUMsWUFBWSxRQUFRO0FBQ3BDLFFBQU0sWUFBWSxFQUFFLFdBQVc7QUFDL0IsUUFBTSxTQUFTLFdBQVcsWUFBWSx3QkFBd0I7QUFDOUQsUUFBTSxZQUFZLFlBQVksRUFBRSxLQUFLLFNBQVM7QUFFOUMsTUFBSSxLQUFLQSxPQUFNLE9BQU8sS0FBS0EsT0FBTTtBQUNqQyxRQUFNLE1BQU0sS0FBSyxNQUFNLElBQUksRUFBRTtBQUM3QixNQUFJLE1BQU0sR0FBRztBQUFFLFVBQU07QUFBSyxVQUFNO0FBQUEsRUFBSztBQUNyQyxRQUFNLFNBQVMsV0FBWSxZQUFZLHVCQUF1QixZQUFZLGFBQWEsYUFDbkYsU0FBUyxjQUFjLElBQUksT0FBTyxTQUFTLFFBQVEsUUFBUSxhQUFhLElBQUksS0FDMUVBLE9BQU0sTUFBTSxZQUFZO0FBQzlCLE1BQUksU0FBUyxHQUFHLFNBQVM7QUFDekIsTUFBSSxZQUFZLFFBQVE7QUFFdEIsVUFBTSxJQUFJLFVBQVUsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLE9BQU87QUFDNUMsVUFBTSxJQUFJLFdBQVcsc0JBQXNCLHNCQUFzQixRQUFRLFFBQVEsVUFBVTtBQUMzRixhQUFTLEVBQUUsS0FBSyxFQUFFLFFBQVE7QUFBRyxhQUFTLEVBQUUsS0FBSyxFQUFFLFFBQVE7QUFBQSxFQUN6RDtBQUNBLFFBQU0sUUFBUSxFQUFFLFlBQVksV0FBWSxXQUFXLElBQUksS0FBTTtBQUM3RCxJQUFFLE9BQU8sS0FBSyxTQUFTLFNBQVMsRUFBRSxNQUFNLEtBQUssSUFBSSxHQUFHLFFBQVEsRUFBRTtBQUM5RCxJQUFFLE9BQU8sS0FBSyxTQUFTLFNBQVMsRUFBRSxNQUFNLEtBQUssSUFBSSxHQUFHLFFBQVEsRUFBRTtBQUU5RCxNQUFJLFVBQVU7QUFNWixRQUFJO0FBQ0osUUFBSUEsT0FBTSxRQUFRLENBQUMsVUFBVyxVQUFTLENBQUM7QUFBQSxjQUM5QkEsT0FBTSxRQUFRQSxPQUFNLFNBQVMsQ0FBQyxXQUFXO0FBRWpELGVBQVMsS0FBSyxJQUFJLElBQUksS0FBSyxJQUFJLGdCQUFnQixTQUFTLGVBQWUsRUFBRSxLQUFLLEdBQUcsQ0FBQztBQUFBLElBQ3BGLE1BQU8sVUFBUyxLQUFLLElBQUksTUFBTSxLQUFLLElBQUkscUJBQXFCLFNBQVMsRUFBRSxLQUFLLEdBQUcsQ0FBQztBQUNqRixNQUFFLE9BQU8sU0FBUyxFQUFFLE1BQU0sS0FBSyxJQUFJLEdBQUcsTUFBTSxFQUFFO0FBQUEsRUFDaEQsT0FBTztBQUNMLFVBQU0sV0FBV0EsT0FBTSxRQUFRLEVBQUUsYUFBYTtBQUM5QyxRQUFJLFlBQVksRUFBRSxVQUFVO0FBQzFCLFFBQUUsS0FBSyxTQUFTLGFBQWEsbUJBQW1CO0FBQVksUUFBRSxXQUFXO0FBQU8sUUFBRSxTQUFTO0FBQU0sUUFBRSxhQUFhO0FBQUEsSUFDbEgsV0FBV0EsT0FBTSxNQUFNO0FBQ3JCLFVBQUksRUFBRSxNQUFNLE1BQU0sU0FBUyxPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksbUJBQW1CLEVBQUUsQ0FBQyxLQUFLLGVBQWUsT0FBTyxFQUFFLEdBQUcsRUFBRSxJQUFJLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLG9CQUFvQjtBQUU5SSxVQUFFLGFBQWE7QUFBQSxNQUNqQixXQUFXLEVBQUUsVUFBVSxDQUFDLEVBQUUsYUFBYTtBQUtyQyxVQUFFLEtBQUs7QUFBbUIsVUFBRSxjQUFjO0FBQUEsTUFDNUM7QUFBQSxJQUNGO0FBQ0EsTUFBRSxNQUFNLFVBQVU7QUFDbEIsUUFBSSxFQUFFLEtBQUssSUFBSyxHQUFFLEtBQUs7QUFBQSxFQUN6QjtBQUdBLFFBQU0sY0FBYyxFQUFFO0FBQ3RCLGFBQVcsUUFBUSxDQUFDLEtBQUssR0FBRyxHQUFZO0FBQ3RDLFVBQU0sU0FBUyxTQUFTLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTTtBQUM3QyxRQUFJLFVBQVUsRUFBRztBQUNqQixVQUFNLEtBQUssU0FBUyxNQUFNLEVBQUUsSUFBSSxRQUFRLEVBQUU7QUFDMUMsVUFBTSxLQUFLLFNBQVMsTUFBTSxFQUFFLElBQUksUUFBUSxFQUFFO0FBQzFDLFFBQUksQ0FBQyxTQUFTLE9BQU8sSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHO0FBQUUsUUFBRSxJQUFJO0FBQUksUUFBRSxJQUFJO0FBQUk7QUFBQSxJQUFVO0FBQ25FLFFBQUksZUFBZSxZQUFZLFFBQVE7QUFDckMsWUFBTSxRQUFRLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxJQUFJO0FBQ3ZDLFVBQUksUUFBUSxFQUFFLEtBQUssZUFBZSxDQUFDLFNBQVMsT0FBTyxJQUFJLE9BQU8sRUFBRSxHQUFHO0FBQ2pFLFVBQUUsSUFBSTtBQUFJLFVBQUUsSUFBSTtBQUFJLFVBQUUsSUFBSTtBQUFPO0FBQUEsTUFDbkM7QUFFQSxVQUFJLGFBQWEsQ0FBQyxXQUFXO0FBQzNCLFlBQUksVUFBVTtBQUNkLGlCQUFTLEtBQUssUUFBUSxHQUFHLEtBQUssRUFBRSxLQUFLLFlBQVksTUFBTTtBQUNyRCxjQUFJLENBQUMsU0FBUyxPQUFPLElBQUksSUFBSSxFQUFFLEtBQUssU0FBUyxPQUFPLElBQUksS0FBSyxHQUFHLEVBQUUsR0FBRztBQUNuRSxjQUFFLElBQUk7QUFBSSxjQUFFLElBQUk7QUFBSSxjQUFFLElBQUk7QUFBSSxjQUFFLEtBQUs7QUFBRyxzQkFBVTtBQUFNO0FBQUEsVUFDMUQ7QUFBQSxRQUNGO0FBQ0EsWUFBSSxRQUFTO0FBQUEsTUFDZjtBQUVBLFlBQU0sTUFBTSxlQUFlLE9BQU8sSUFBSSxFQUFFLElBQUksYUFBYSxFQUFFO0FBQzNELFVBQUksTUFBTSxFQUFFLEtBQUssTUFBTSxFQUFFLEtBQUssZUFBZSxDQUFDLFNBQVMsT0FBTyxJQUFJLEtBQUssRUFBRSxHQUFHO0FBQzFFLFVBQUUsSUFBSTtBQUFJLFVBQUUsSUFBSTtBQUFJLFVBQUUsSUFBSTtBQUFLO0FBQUEsTUFDakM7QUFBQSxJQUNGO0FBQ0EsUUFBSSxTQUFTLElBQUssR0FBRSxLQUFLO0FBQUEsUUFBUSxHQUFFLEtBQUs7QUFBQSxFQUMxQztBQUdBLFFBQU0sS0FBSyxFQUFFLElBQUksRUFBRSxLQUFLO0FBQ3hCLE1BQUksQ0FBQyxTQUFTLE9BQU8sRUFBRSxHQUFHLElBQUksRUFBRSxDQUFDLEdBQUc7QUFDbEMsTUFBRSxJQUFJO0FBQ04sTUFBRSxXQUFXO0FBQUEsRUFDZixXQUFXLEVBQUUsTUFBTSxHQUFHO0FBRXBCLFFBQUksUUFBUSxLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUk7QUFDakMsV0FBTyxRQUFRLEtBQUssS0FBSyxTQUFTLE9BQU8sRUFBRSxHQUFHLE9BQU8sRUFBRSxDQUFDLEVBQUc7QUFDM0QsVUFBTSxZQUFZLGVBQWUsT0FBTyxFQUFFLEdBQUcsRUFBRSxJQUFJLE1BQU0sRUFBRSxDQUFDO0FBQzVELE1BQUUsSUFBSSxLQUFLLElBQUksT0FBTyxZQUFZLEtBQUssT0FBTyxZQUFZLFNBQVM7QUFDbkUsUUFBSSxTQUFTLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRyxHQUFFLElBQUksS0FBSztBQUMvQyxNQUFFLEtBQUs7QUFDUCxNQUFFLFdBQVc7QUFBQSxFQUNmLE9BQU87QUFDTCxNQUFFLEtBQUs7QUFBQSxFQUNUO0FBRUEsTUFBSSxDQUFDLEVBQUUsWUFBWSxFQUFFLE1BQU0sR0FBRztBQUM1QixVQUFNLE1BQU0sZUFBZSxPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksTUFBTSxFQUFFLENBQUM7QUFDdEQsUUFBSSxNQUFNLGFBQWEsRUFBRSxJQUFJLE1BQU0sTUFBTTtBQUFFLFFBQUUsSUFBSTtBQUFLLFFBQUUsS0FBSztBQUFHLFFBQUUsV0FBVztBQUFBLElBQU07QUFBQSxFQUNyRjtBQUVBLGtCQUFnQixPQUFPLENBQUM7QUFFeEIsTUFBSSxFQUFFLFlBQVksVUFBVTtBQUFFLE1BQUUsY0FBYztBQUFPLE1BQUUsU0FBUztBQUFBLEVBQU87QUFDdkUsTUFBSSxFQUFFLGFBQWEsRUFBRyxHQUFFLGFBQWEsS0FBSyxJQUFJLEdBQUcsRUFBRSxhQUFhLEVBQUU7QUFFbEUsUUFBTSxRQUFRLEtBQUssTUFBTSxFQUFFLElBQUksS0FBSyxHQUFHLEVBQUUsSUFBSSxLQUFLLENBQUMsSUFBSTtBQUN2RCxJQUFFLFFBQVE7QUFDVixNQUFJLEtBQUssTUFBTSxJQUFJLEVBQUUsSUFBSSxLQUFLO0FBQzVCLFVBQU0sT0FBTyxLQUFLLE1BQU0sSUFBSSxFQUFFO0FBQzlCLFFBQUksSUFBSSxPQUFPLEVBQUU7QUFDakIsV0FBTyxJQUFJLEtBQUssR0FBSSxNQUFLLEtBQUssS0FBSztBQUNuQyxXQUFPLElBQUksQ0FBQyxLQUFLLEdBQUksTUFBSyxLQUFLLEtBQUs7QUFDcEMsTUFBRSxXQUFXLElBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyxFQUFFO0FBQUEsRUFDdEM7QUFDQSxRQUFNLGFBQWEsZUFBZSxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBSXRELFFBQU0sU0FBUyxjQUFjLGNBQWUsWUFBWSxhQUFhO0FBQ3JFLElBQUUsT0FBTyxTQUFTLFNBQVMsQ0FBQyxFQUFFLFdBQVcsUUFBUSxhQUFhLE1BQU0sU0FBUztBQUM3RSxNQUFJLEVBQUUsU0FBUyxPQUFRLEdBQUUsV0FBVztBQUNwQyxJQUFFLGVBQWUsRUFBRSxJQUFJO0FBQ3ZCLFFBQU0sVUFBVSxLQUFLLE1BQU0sSUFBSSxFQUFFLElBQUksT0FBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDQSxPQUFNLFFBQVEsQ0FBQyxDQUFDQSxPQUFNLFFBQVFBLE9BQU07QUFDbEcsZUFBYSxHQUFHLFlBQVksU0FBUyxFQUFFO0FBQ3ZDLFNBQU87QUFDVDtBQUdBLFNBQVMsYUFBYSxHQUFtQixPQUFlLFNBQWtCLElBQWtCO0FBRTFGLElBQUUsaUJBQWlCLFFBQVE7QUFDM0IsSUFBRSxTQUFTLEVBQUUsaUJBQWlCLEtBQUssSUFBSSxHQUFHLEVBQUUsU0FBUyxLQUFLLGNBQWMsSUFDcEUsS0FBSyxJQUFJLEdBQUcsRUFBRSxTQUFTLEtBQUsscUJBQXFCO0FBQ3JELE1BQUksRUFBRSxTQUFTLFFBQVE7QUFDckIsUUFBSSxRQUFTLEdBQUUsVUFBVSxLQUFLLElBQUksR0FBRyxFQUFFLFVBQVUsS0FBSyxvQkFBb0I7QUFBQSxhQUNqRSxDQUFDLEVBQUUsZUFBZ0IsR0FBRSxVQUFVLEtBQUssSUFBSSxHQUFHLEVBQUUsVUFBVSxLQUFLLHFCQUFxQjtBQUFBLEVBQzVGLFdBQVcsRUFBRSxTQUFTLFNBQVUsR0FBRSxVQUFVLEtBQUssSUFBSSxHQUFHLEVBQUUsVUFBVSxLQUFLLHVCQUF1QjtBQUVoRyxNQUFJLFNBQVM7QUFDYixNQUFJLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFHLFdBQVUscUJBQXFCO0FBQ3RFLE1BQUksU0FBUyxHQUFHO0FBQ2QsTUFBRSxTQUFTLEtBQUssSUFBSSxHQUFHLEVBQUUsU0FBUyxNQUFNO0FBQ3hDLE1BQUUsT0FBTztBQUNULE1BQUUsT0FBTztBQUNULFFBQUksRUFBRSxVQUFVLEdBQUc7QUFBRSxRQUFFLE9BQU87QUFBTSxRQUFFLFFBQVE7QUFBVyxRQUFFLEtBQUs7QUFBRyxRQUFFLEtBQUs7QUFBQSxJQUFHO0FBQUEsRUFDL0UsT0FBTztBQUNMLE1BQUUsUUFBUTtBQUNWLFFBQUksRUFBRSxRQUFRLHNCQUFzQixDQUFDLEVBQUUsZUFBZ0IsR0FBRSxTQUFTLEtBQUssSUFBSSxZQUFZLEVBQUUsU0FBUyxxQkFBcUIsRUFBRTtBQUFBLEVBQzNIO0FBRUEsTUFBSSxFQUFFLFNBQVMsWUFBWSxFQUFFLFlBQVksVUFBVSxFQUFHLEdBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLEdBQUcsRUFBRSxHQUFHLEdBQUcsRUFBRSxFQUFFO0FBQzFGO0FBaUNPLFNBQVMsY0FBYyxPQUFjLEdBQVcsR0FBVyxRQUFRLEtBQW9CO0FBQzVGLFdBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLE1BQU0sS0FBSyxDQUFDLEdBQUcsSUFBSSxPQUFPLEtBQUs7QUFDN0QsVUFBTSxJQUFJLGdCQUFnQixPQUFPLEtBQUssTUFBTSxDQUFDLEdBQUcsSUFBSSxHQUFHLEtBQUssTUFBTSxDQUFDLENBQUM7QUFDcEUsUUFBSSxNQUFNLEtBQU0sUUFBTztBQUN2QixRQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLE9BQU8sR0FBRyxHQUFHLENBQUMsRUFBRyxRQUFPO0FBQUEsRUFDN0Q7QUFDQSxTQUFPO0FBQ1Q7OztBQzFlQSxZQUFZQyxZQUFXO0FBQ3ZCLFNBQVMsdUJBQXVCOzs7QUNYaEM7QUFBQSxFQUNFLFFBQVU7QUFBQSxFQUNWLE1BQVE7QUFBQSxFQUNSLFFBQVU7QUFBQSxFQUNWLFFBQVU7QUFBQSxFQUNWLE1BQVE7QUFBQSxFQUNSLFdBQWE7QUFBQSxJQUNYLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsY0FBZ0I7QUFBQSxNQUNkLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxNQUFRO0FBQUEsTUFDTixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsTUFBUTtBQUFBLE1BQ04sS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZ0JBQWtCO0FBQUEsTUFDaEIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGVBQWlCO0FBQUEsTUFDZixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsbUJBQXFCO0FBQUEsTUFDbkIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGNBQWdCO0FBQUEsTUFDZCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLG1CQUFxQjtBQUFBLE1BQ25CLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0Esa0JBQW9CO0FBQUEsTUFDbEIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxpQkFBbUI7QUFBQSxNQUNqQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxlQUFpQjtBQUFBLE1BQ2YsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGdCQUFrQjtBQUFBLE1BQ2hCLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxnQkFBa0I7QUFBQSxNQUNoQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZ0JBQWtCO0FBQUEsTUFDaEIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxlQUFpQjtBQUFBLE1BQ2YsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLE9BQVM7QUFBQSxNQUNQLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsY0FBZ0I7QUFBQSxNQUNkLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxnQkFBa0I7QUFBQSxNQUNoQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZ0JBQWtCO0FBQUEsTUFDaEIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGtCQUFvQjtBQUFBLE1BQ2xCLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsY0FBZ0I7QUFBQSxNQUNkLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGVBQWlCO0FBQUEsTUFDZixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsY0FBZ0I7QUFBQSxNQUNkLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxlQUFpQjtBQUFBLE1BQ2YsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGNBQWdCO0FBQUEsTUFDZCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZUFBaUI7QUFBQSxNQUNmLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGVBQWlCO0FBQUEsTUFDZixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGVBQWlCO0FBQUEsTUFDZixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxlQUFpQjtBQUFBLE1BQ2YsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGdCQUFrQjtBQUFBLE1BQ2hCLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsRUFDRjtBQUFBLEVBQ0EsVUFBWTtBQUFBLElBQ1YsTUFBUTtBQUFBLE1BQ04saUJBQW1CO0FBQUEsTUFDbkIsZUFBaUI7QUFBQSxNQUNqQixVQUFZO0FBQUEsTUFDWixjQUFnQjtBQUFBLE1BQ2hCLFNBQVc7QUFBQSxNQUNYLFlBQWM7QUFBQSxNQUNkLGVBQWlCO0FBQUEsTUFDakIsS0FBTztBQUFBLE1BQ1AsS0FBTztBQUFBLE1BQ1AsWUFBYztBQUFBLE1BQ2QsVUFBWTtBQUFBLElBQ2Q7QUFBQSxJQUNBLE1BQVE7QUFBQSxNQUNOLGlCQUFtQjtBQUFBLE1BQ25CLGVBQWlCO0FBQUEsTUFDakIsVUFBWTtBQUFBLE1BQ1osY0FBZ0I7QUFBQSxNQUNoQixTQUFXO0FBQUEsTUFDWCxZQUFjO0FBQUEsTUFDZCxlQUFpQjtBQUFBLE1BQ2pCLEtBQU87QUFBQSxNQUNQLEtBQU87QUFBQSxNQUNQLFlBQWM7QUFBQSxNQUNkLFVBQVk7QUFBQSxJQUNkO0FBQUEsSUFDQSxNQUFRO0FBQUEsTUFDTixpQkFBbUI7QUFBQSxNQUNuQixlQUFpQjtBQUFBLE1BQ2pCLFVBQVk7QUFBQSxNQUNaLGNBQWdCO0FBQUEsTUFDaEIsU0FBVztBQUFBLE1BQ1gsWUFBYztBQUFBLE1BQ2QsZUFBaUI7QUFBQSxNQUNqQixLQUFPO0FBQUEsTUFDUCxLQUFPO0FBQUEsTUFDUCxZQUFjO0FBQUEsTUFDZCxVQUFZO0FBQUEsSUFDZDtBQUFBLElBQ0EsT0FBUztBQUFBLE1BQ1AsaUJBQW1CO0FBQUEsTUFDbkIsZUFBaUI7QUFBQSxNQUNqQixVQUFZO0FBQUEsTUFDWixjQUFnQjtBQUFBLE1BQ2hCLFNBQVc7QUFBQSxNQUNYLFlBQWM7QUFBQSxNQUNkLGVBQWlCO0FBQUEsTUFDakIsS0FBTztBQUFBLE1BQ1AsS0FBTztBQUFBLE1BQ1AsWUFBYztBQUFBLE1BQ2QsVUFBWTtBQUFBLElBQ2Q7QUFBQSxFQUNGO0FBQ0Y7OztBQ2xWQSxZQUFZLFdBQVc7QUFPdkIsSUFBTSxJQUFJLGdCQUFRO0FBQ2xCLElBQU0sSUFBSSxDQUFDLE1BQWMsSUFBVSxZQUFNLEVBQUUsQ0FBQyxFQUFFLEdBQUc7QUFHMUMsSUFBTSxrQkFBa0I7QUFHeEIsSUFBTSxZQUFZLEVBQUUsT0FBTyxFQUFFO0FBRXBDLFNBQVMsb0JBQStDO0FBQ3RELFFBQU0sTUFBTSxJQUFVLDBCQUFvQjtBQUFBLElBQ3hDLGNBQWM7QUFBQSxJQUFNLGFBQWE7QUFBQSxJQUFNLFlBQVk7QUFBQSxJQUFPLE1BQVk7QUFBQSxFQUN4RSxDQUFDO0FBQ0QsTUFBSSxrQkFBa0IsQ0FBQyxXQUFXO0FBQ2hDLFdBQU8sU0FBUyxRQUFRO0FBQ3hCLFdBQU8sU0FBUyxXQUFXLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRTtBQUN2RCxXQUFPLFNBQVMsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUU7QUFDL0MsV0FBTyxTQUFTLFFBQVEsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFO0FBQ2pELFdBQU8sU0FBUyxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRTtBQUMvQyxXQUFPLGVBQWUsT0FBTyxhQUMxQixRQUFRLHFCQUFxQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSx5QkFTWCxFQUNsQixRQUFRLDJCQUEyQjtBQUFBO0FBQUEseURBRWU7QUFDckQsV0FBTyxpQkFBaUIsT0FBTyxlQUM1QixRQUFRLHFCQUFxQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBYWxDLEVBQ0ssUUFBUSxpREFBaUQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsNERBOEJKO0FBQUEsRUFDMUQ7QUFDQSxTQUFPO0FBQ1Q7QUFFTyxJQUFNLG9CQUFvQixrQkFBa0I7OztBRnRGbkQsSUFBTUMsS0FBSSxnQkFBUTtBQUVsQixJQUFNLElBQUksQ0FBQyxNQUFjLElBQVUsYUFBTSxFQUFFLFdBQVcsR0FBRyxJQUFJLElBQUlBLEdBQUUsQ0FBQyxFQUFFLEdBQUc7QUFFekUsSUFBTSxXQUFXLElBQVUsMkJBQW9CLEVBQUUsY0FBYyxNQUFNLGFBQWEsS0FBSyxDQUFDO0FBS3hGLFNBQVMsS0FBSyxPQUFvQztBQUNoRCxRQUFNLE9BQU8sTUFBTSxJQUFJLENBQUMsTUFBTTtBQUM1QixVQUFNLElBQUksSUFBVSxtQkFBWSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLGFBQWE7QUFDNUQsTUFBRSxVQUFVLEVBQUUsS0FBSyxJQUFJLEVBQUUsS0FBSyxLQUFLLEVBQUUsSUFBSSxHQUFHLEVBQUUsS0FBSyxDQUFDO0FBQ3BELE1BQUUsZ0JBQWdCLElBQUk7QUFDdEIsVUFBTSxNQUFNLEVBQUUsRUFBRSxDQUFDO0FBQ2pCLFVBQU0sSUFBSSxFQUFFLFdBQVcsU0FBUztBQUNoQyxVQUFNLFNBQVMsSUFBSSxhQUFhLElBQUksQ0FBQztBQUNyQyxVQUFNLFVBQVUsRUFBRSxXQUFXO0FBQzdCLGFBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBRzFCLFlBQU0sS0FBSyxRQUFRLEtBQUssQ0FBQztBQUN6QixZQUFNLElBQUksS0FBSyxNQUFNLElBQU0sS0FBSyxPQUFPLE9BQU87QUFDOUMsYUFBTyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUk7QUFBRyxhQUFPLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJO0FBQUcsYUFBTyxJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSTtBQUFBLElBQ3hGO0FBQ0EsTUFBRSxhQUFhLFNBQVMsSUFBVSx1QkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFDNUQsV0FBTztBQUFBLEVBQ1QsQ0FBQztBQUNELFFBQU0sU0FBUyxnQkFBZ0IsSUFBSTtBQUNuQyxhQUFXLEtBQUssS0FBTSxHQUFFLFFBQVE7QUFDaEMsU0FBTztBQUNUO0FBY08sSUFBTSxnQkFBNkIsRUFBRSxPQUFPLGNBQWMsVUFBVSxpQkFBaUIsTUFBTSxZQUFZO0FBaUM5RyxTQUFTLE1BQU0sT0FBZSxNQUFjLEtBQTJCLEdBQVcsR0FBVyxHQUF3QjtBQUNuSCxRQUFNLElBQUksSUFBVSxhQUFNO0FBQzFCLElBQUUsT0FBTztBQUNULElBQUUsU0FBUyxJQUFJLEdBQUcsR0FBRyxDQUFDO0FBQ3RCLFFBQU0sS0FBSyxFQUFFLE9BQU8sR0FBRyxJQUFJLENBQUM7QUFDNUIsU0FBTztBQUNUO0FBUUEsU0FBUyxXQUFXLE1BQW1CLE9BQWtDO0FBQ3ZFLE9BQUssa0JBQWtCLElBQUk7QUFDM0IsUUFBTSxTQUFTLElBQVUsZUFBUSxFQUFFLEtBQUssS0FBSyxXQUFXLEVBQUUsT0FBTztBQUNqRSxRQUFNLFFBQXNCLENBQUM7QUFDN0IsUUFBTSxPQUFPLE1BQU0sSUFBSSxDQUFDLEVBQUUsT0FBTyxHQUFHLElBQUksR0FBRyxVQUFVO0FBQ25ELFVBQU0sT0FBTyxJQUFVLFlBQUs7QUFDNUIsU0FBSyxPQUFPLEdBQUcsRUFBRSxJQUFJO0FBQ3JCLE1BQUUsSUFBSSxJQUFJO0FBQ1YsVUFBTSxLQUFLLElBQUk7QUFDZixVQUFNLElBQUksSUFBSSxNQUFNLEVBQUUsYUFBYSxJQUFVLGVBQVEsRUFBRSxpQkFBaUIsUUFBUSxFQUFFLFdBQVcsQ0FBQztBQUM5RixVQUFNLElBQUksRUFBRSxXQUFXLFNBQVM7QUFDaEMsVUFBTSxZQUFZLElBQUksWUFBWSxJQUFJLENBQUMsR0FBRyxhQUFhLElBQUksYUFBYSxJQUFJLENBQUM7QUFDN0UsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFBRSxnQkFBVSxJQUFJLENBQUMsSUFBSTtBQUFPLGlCQUFXLElBQUksQ0FBQyxJQUFJO0FBQUEsSUFBRztBQUMvRSxNQUFFLGFBQWEsYUFBYSxJQUFVLDZCQUFzQixXQUFXLENBQUMsQ0FBQztBQUN6RSxNQUFFLGFBQWEsY0FBYyxJQUFVLDhCQUF1QixZQUFZLENBQUMsQ0FBQztBQUM1RSxXQUFPO0FBQUEsRUFDVCxDQUFDO0FBQ0QsUUFBTSxTQUFTLGdCQUFnQixJQUFJO0FBQ25DLGFBQVcsS0FBSyxLQUFNLEdBQUUsUUFBUTtBQUNoQyxhQUFXLEtBQUssSUFBSSxJQUFJLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRyxHQUFFLFFBQVE7QUFDNUQsUUFBTSxPQUFPLElBQVUsbUJBQVksUUFBUSxRQUFRO0FBQ25ELE9BQUssT0FBTztBQUNaLE9BQUssYUFBYTtBQUNsQixPQUFLLGdCQUFnQjtBQUNyQixPQUFLLElBQUksSUFBSTtBQUNiLE9BQUssa0JBQWtCLElBQUk7QUFDM0IsT0FBSyxLQUFLLElBQVUsZ0JBQVMsS0FBSyxDQUFDO0FBR25DLE9BQUssaUJBQWlCLElBQVUsY0FBTyxJQUFVLGVBQVEsR0FBRyxLQUFLLENBQUMsR0FBRyxHQUFHO0FBQ3hFLE9BQUssY0FBYyxJQUFVLFlBQUssSUFBVSxlQUFRLE1BQU0sTUFBTSxJQUFJLEdBQUcsSUFBVSxlQUFRLEtBQUssS0FBSyxHQUFHLENBQUM7QUFDdkcsU0FBTztBQUNUO0FBR08sU0FBUyxZQUFZLFFBQXFCLGVBQXVCO0FBQ3RFLFFBQU0sT0FBTyxJQUFVLGFBQU07QUFDN0IsT0FBSyxPQUFPO0FBQ1osUUFBTSxJQUFJLE1BQU0sU0FBUztBQUN6QixPQUFLLE1BQU0sVUFBVSxDQUFDO0FBQ3RCLFFBQU0sUUFBZ0IsQ0FBQztBQUd2QixRQUFNLFNBQVMsS0FBSztBQUFBLElBQ2xCLEVBQUUsR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxPQUFPLEdBQUcsTUFBTSxTQUFTO0FBQUEsSUFDekQsRUFBRSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE9BQU8sR0FBRyxPQUFPLEdBQUcsYUFBYTtBQUFBLEVBQ25FLENBQUM7QUFDRCxRQUFNLE9BQU8sSUFBVSxhQUFNO0FBQzdCLE9BQUssT0FBTztBQUNaLE9BQUssU0FBUyxJQUFJO0FBQ2xCLFFBQU0sT0FBTyxNQUFNLE9BQU8sUUFBUSxRQUFRLEtBQUssR0FBRyxDQUFDO0FBQ25ELFFBQU0sT0FBTyxNQUFNLE9BQU8sUUFBUSxRQUFRLE1BQU0sR0FBRyxDQUFDO0FBQ3BELE9BQUssSUFBSSxNQUFNLElBQUk7QUFHbkIsUUFBTSxXQUFXLEtBQUs7QUFBQSxJQUNwQixFQUFFLEdBQUcsS0FBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsT0FBTyxHQUFHLE1BQU0sU0FBUztBQUFBLElBQ3pELEVBQUUsR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsYUFBYTtBQUFBLElBQ3RELEVBQUUsR0FBRyxLQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsTUFBTSxNQUFNO0FBQUEsSUFDckQsRUFBRSxHQUFHLE1BQU0sR0FBRyxLQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLE1BQU07QUFBQSxJQUNyRCxFQUFFLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sTUFBTTtBQUFBLElBQ3JELEdBQUksTUFBTSxRQUFRLENBQUMsRUFBRSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE9BQU8sR0FBRyxPQUFPLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO0FBQUEsRUFDM0YsQ0FBQztBQUNELFFBQU0sUUFBUSxNQUFNLE9BQU8sU0FBUyxVQUFVLEdBQUcsR0FBRyxDQUFDO0FBQ3JELE9BQUssSUFBSSxLQUFLO0FBRWQsUUFBTSxVQUFVLEtBQUs7QUFBQSxJQUNuQixFQUFFLEdBQUcsS0FBTSxHQUFHLE1BQU0sR0FBRyxLQUFNLEdBQUcsR0FBRyxHQUFHLFlBQVk7QUFBQSxJQUNsRCxFQUFFLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLFlBQVk7QUFBQSxJQUNyRCxFQUFFLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sS0FBSztBQUFBLElBQ3BELEVBQUUsR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsT0FBTyxHQUFHLE1BQU0sS0FBSztBQUFBLElBQzlELEVBQUUsR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxPQUFPLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxhQUFhO0FBQUEsSUFDekUsRUFBRSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLFFBQVEsR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLGFBQWE7QUFBQSxJQUMxRSxHQUFJLE1BQU0sS0FBSyxTQUFTLFVBQVU7QUFBQSxNQUNoQyxFQUFFLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsS0FBTSxHQUFHLE1BQU0sSUFBSSxNQUFNO0FBQUEsTUFDekQsRUFBRSxHQUFHLE1BQU0sR0FBRyxLQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLElBQUksTUFBTTtBQUFBLElBQzNELElBQUksTUFBTSxLQUFLLFNBQVMsUUFBUTtBQUFBLE1BQzlCLEVBQUUsR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxLQUFNLEdBQUcsTUFBTSxJQUFJLE1BQU07QUFBQSxNQUN6RCxFQUFFLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsS0FBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLElBQUksTUFBTTtBQUFBLElBQ3BFLElBQUksQ0FBQztBQUFBLEVBQ1AsQ0FBQztBQUNELFFBQU0sT0FBTyxNQUFNLE9BQU8sUUFBUSxTQUFTLEdBQUcsTUFBTSxDQUFDO0FBQ3JELFFBQU0sSUFBSSxJQUFJO0FBR2QsUUFBTSxTQUFTLEtBQUs7QUFBQSxJQUNsQixFQUFFLEdBQUcsTUFBTSxHQUFHLEtBQU0sR0FBRyxNQUFNLEdBQUcsTUFBTyxHQUFHLE1BQU0sTUFBTTtBQUFBLElBQ3RELEVBQUUsR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxPQUFPLEdBQUcsWUFBWTtBQUFBLEVBQ3hELENBQUM7QUFDRCxRQUFNLE9BQU8sTUFBTSxPQUFPLFFBQVEsUUFBUSxNQUFNLEtBQU0sQ0FBQztBQUN2RCxRQUFNLE9BQU8sTUFBTSxPQUFPLFFBQVEsUUFBUSxPQUFPLEtBQU0sQ0FBQztBQUN4RCxRQUFNLElBQUksTUFBTSxJQUFJO0FBRXBCLE9BQUssSUFBSSxJQUFJO0FBSWIsUUFBTSxPQUFjLENBQUM7QUFDckIsV0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDMUIsVUFBTSxJQUFLLElBQUksSUFBSyxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksSUFBSSxJQUFJLE1BQU07QUFDekQsVUFBTSxJQUFJLElBQUksSUFBSSxPQUFPO0FBQ3pCLFNBQUssS0FBSyxFQUFFLEdBQUcsR0FBRyxNQUFNLEdBQUcsSUFBSSxLQUFLLEdBQUcsS0FBSyxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsUUFBUSxHQUFHLEtBQUssSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLElBQUksSUFBSSxZQUFZLFVBQVUsQ0FBQztBQUFBLEVBQzNIO0FBQ0EsUUFBTSxTQUFTLE1BQU0sT0FBTyxVQUFVLEtBQUssSUFBSSxHQUFHLEdBQUcsS0FBSyxDQUFDO0FBQzNELE9BQUssSUFBSSxNQUFNO0FBRWYsYUFBVyxNQUFNLEtBQUs7QUFFdEIsU0FBTyxNQUFNLFVBQVUsQ0FBQztBQUN4QixTQUFPO0FBQUEsSUFDTDtBQUFBLElBQU07QUFBQSxJQUFNO0FBQUEsSUFBTztBQUFBLElBQU07QUFBQSxJQUFNO0FBQUEsSUFBTTtBQUFBLElBQU07QUFBQSxJQUFNO0FBQUEsSUFBUSxPQUFPO0FBQUEsSUFBRyxXQUFXO0FBQUEsSUFBRyxNQUFNO0FBQUEsSUFDdkYsT0FBTyxFQUFFLFFBQVEsR0FBRyxLQUFLLEdBQUcsU0FBUyxHQUFHLE9BQU8sRUFBRTtBQUFBLElBQUcsV0FBVztBQUFBLElBQUssUUFBUTtBQUFBLEVBQzlFO0FBQ0Y7QUFRQSxJQUFNLE9BQTBCLENBQUMsU0FBUyxTQUFTLGFBQWEsY0FBYyxhQUFhLFNBQVMsU0FBUyxTQUFTLFNBQVMsU0FBUyxTQUFTLFNBQVMsT0FBTztBQUdqSyxJQUFNLE9BQU87QUFFYixJQUFNLGFBQWE7QUFFbkIsSUFBTSxRQUFRO0FBRWQsSUFBTUMsVUFBUyxDQUFDLE1BQWMsSUFBSSxLQUFLLElBQUksSUFBSTtBQUMvQyxJQUFNQyxRQUFPLENBQUMsR0FBVyxHQUFXLE1BQWMsS0FBSyxJQUFJLEtBQUs7QUFDaEUsSUFBTUMsU0FBUSxDQUFDLEdBQVcsSUFBWSxPQUFnQixJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSztBQUVsRixJQUFNLE1BQU0sQ0FBQyxHQUFXLEdBQVcsTUFBY0YsUUFBT0UsUUFBTyxJQUFJLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBR3RGLFNBQVMsU0FBUyxHQUFXLFNBQWlCLE1BQWMsS0FBdUM7QUFDakcsTUFBSSxJQUFJLFFBQVMsUUFBTyxFQUFFLEdBQUcsTUFBTSxHQUFHLEtBQUs7QUFDM0MsTUFBSSxJQUFJLE1BQU07QUFBRSxVQUFNLElBQUksSUFBSSxHQUFHLFNBQVMsSUFBSTtBQUFHLFdBQU8sRUFBRSxHQUFHRCxNQUFLLE1BQU0sT0FBTyxDQUFDLEdBQUcsR0FBR0EsTUFBSyxNQUFNLE1BQU0sQ0FBQyxFQUFFO0FBQUEsRUFBRztBQUM3RyxNQUFJLElBQUksS0FBSztBQUFFLFVBQU0sSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHO0FBQUcsV0FBTyxFQUFFLEdBQUdBLE1BQUssT0FBTyxNQUFNLENBQUMsR0FBRyxHQUFHQSxNQUFLLE1BQU0sTUFBTSxDQUFDLElBQUksT0FBTyxLQUFLLElBQUksS0FBSyxLQUFLLENBQUMsRUFBRTtBQUFBLEVBQUc7QUFDdkksU0FBTyxFQUFFLEdBQUdBLE1BQUssTUFBTSxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxHQUFHLEdBQUcsS0FBSztBQUN4RDtBQUVBLFNBQVMsV0FBVyxHQUFXLE9BQTZCO0FBQzFELFFBQU0sUUFBUSxNQUFNO0FBQ3BCLFFBQU0sS0FBSyxLQUFLLElBQUksR0FBRyxRQUFRLEdBQUc7QUFDbEMsTUFBSSxXQUFXLEtBQUssSUFBSSxFQUFFLEtBQUssS0FBSyxPQUFPLE9BQU8sTUFBTSxLQUFLLElBQUksR0FBRyxRQUFRLEdBQUc7QUFDL0UsTUFBSSxXQUFXLENBQUMsV0FBVztBQUMzQixNQUFJLE9BQU8sTUFBTztBQUNsQixNQUFJLE1BQU0sS0FBSyxJQUFJLEtBQUssSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLE9BQU8sS0FBSyxJQUFJLEdBQUcsS0FBSztBQUNoRSxNQUFJLFFBQVEsS0FBSztBQUVmLFdBQU87QUFBRyxVQUFNLEtBQUssSUFBSSxFQUFFLE9BQU8sSUFBSSxJQUFJO0FBQzFDLGVBQVc7QUFBRyxlQUFXO0FBQUEsRUFDM0I7QUFDQSxTQUFPO0FBQUEsSUFDTCxPQUFPLE9BQU87QUFBQSxJQUFLLE9BQU87QUFBQSxJQUFHLFdBQVc7QUFBQSxJQUFHLFlBQVk7QUFBQSxJQUFNLFdBQVcsQ0FBQyxPQUFPO0FBQUEsSUFDaEYsT0FBTztBQUFBLElBQVUsT0FBTztBQUFBLElBQU0sT0FBTyxDQUFDO0FBQUEsSUFBVSxPQUFPO0FBQUEsSUFDdkQsT0FBTztBQUFBLElBQVUsT0FBTztBQUFBLElBQUcsT0FBTyxDQUFDO0FBQUEsSUFBVSxPQUFPO0FBQUEsRUFDdEQ7QUFDRjtBQUVBLElBQU0sV0FBaUI7QUFBQSxFQUNyQixPQUFPO0FBQUEsRUFBTSxPQUFPO0FBQUEsRUFBRyxXQUFXO0FBQUEsRUFBRyxZQUFZO0FBQUEsRUFBTSxXQUFXO0FBQUEsRUFDbEUsT0FBTztBQUFBLEVBQU0sT0FBTztBQUFBLEVBQU0sT0FBTztBQUFBLEVBQU0sT0FBTztBQUFBLEVBQU8sT0FBTztBQUFBLEVBQU8sT0FBTztBQUFBLEVBQUcsT0FBTztBQUFBLEVBQU0sT0FBTztBQUNuRztBQVNBLFNBQVMsWUFBWSxHQUFXLFdBQXlCO0FBQ3ZELFFBQU0sSUFBSSxFQUFFO0FBQ1osUUFBTSxNQUFNLEVBQUU7QUFDZCxRQUFNLEtBQU0sT0FBTyxLQUFLLEtBQUssS0FBTSxJQUFJLEtBQUs7QUFFNUMsUUFBTSxLQUFLLEtBQUssSUFBSSxHQUFHO0FBQ3ZCLFFBQU0sUUFBYztBQUFBLElBQ2xCLE9BQU87QUFBQSxJQUFHLE9BQU87QUFBQSxJQUFHLFdBQVcsT0FBTyxPQUFPLEtBQUssSUFBSSxNQUFNLEdBQUc7QUFBQSxJQUFHLFlBQVk7QUFBQSxJQUFHLFdBQVc7QUFBQSxJQUM1RixPQUFPLE9BQU8sT0FBTztBQUFBLElBQUksT0FBTyxPQUFPLE9BQU8sS0FBSyxJQUFJLEdBQUc7QUFBQSxJQUFHLE9BQU8sT0FBTyxPQUFPO0FBQUEsSUFBSSxPQUFPLFFBQVEsT0FBTyxLQUFLLElBQUksR0FBRztBQUFBLElBQ3hILE9BQU8sUUFBUSxNQUFNLEtBQUssSUFBSSxHQUFHO0FBQUEsSUFBRyxPQUFPO0FBQUEsSUFBTSxPQUFPLFFBQVEsTUFBTSxLQUFLLElBQUksR0FBRztBQUFBLElBQUcsT0FBTztBQUFBLEVBQzlGO0FBRUEsTUFBSSxJQUFZO0FBQ2hCLE1BQUksSUFBSSxLQUFLO0FBQUUsVUFBTSxJQUFJLElBQUksR0FBRyxHQUFHLEdBQUc7QUFBRyxTQUFLQSxNQUFLLE9BQU8sT0FBTyxDQUFDO0FBQUcsU0FBSyxPQUFPLE9BQU8sS0FBSyxJQUFJLEtBQUssS0FBSyxDQUFDO0FBQUEsRUFBRyxXQUN0RyxJQUFJLE1BQU07QUFBRSxVQUFNLElBQUksSUFBSSxHQUFHLEtBQUssSUFBSTtBQUFHLFNBQUtBLE1BQUssT0FBTyxPQUFPLENBQUM7QUFBRyxTQUFLQSxNQUFLLE1BQU0sTUFBTSxDQUFDO0FBQUEsRUFBRyxPQUNuRztBQUFFLFNBQUs7QUFBTyxTQUFLO0FBQUEsRUFBTTtBQUM5QixRQUFNLE9BQU8sU0FBUyxHQUFHLE1BQU0sTUFBTSxJQUFJO0FBQ3pDLFFBQU0sT0FBTyxJQUFJLE1BQU0sS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEdBQUcsSUFBSTtBQUNyRCxRQUFNLFNBQWU7QUFBQSxJQUNuQixPQUFPLE9BQU87QUFBQSxJQUFNLE9BQU87QUFBQSxJQUFHLFdBQVcsT0FBTyxPQUFPO0FBQUEsSUFBTSxZQUFZO0FBQUEsSUFBRyxXQUFXO0FBQUEsSUFDdkYsT0FBTztBQUFBLElBQUksT0FBTztBQUFBLElBQUksT0FBTztBQUFBLElBQUksT0FBTyxDQUFDO0FBQUEsSUFDekMsT0FBTyxLQUFLO0FBQUEsSUFBRyxPQUFPLEtBQUs7QUFBQSxJQUFHLE9BQU8sS0FBSztBQUFBLElBQUcsT0FBTyxDQUFDLEtBQUs7QUFBQSxFQUM1RDtBQUNBLFFBQU0sSUFBSSxDQUFDO0FBQ1gsYUFBVyxLQUFLLEtBQU0sR0FBRSxDQUFDLElBQUlBLE1BQUssTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQztBQUV4RCxJQUFFLGFBQWEsRUFBRSxZQUFZO0FBQzdCLFFBQU0sTUFBTSxRQUFRLEtBQUssSUFBSSxFQUFFLE9BQU8sR0FBRztBQUN6QyxJQUFFLFFBQVFDLE9BQU0sWUFBWSxhQUFhLE9BQU8sS0FBSyxJQUFJLEVBQUUsU0FBUyxJQUFJLEVBQUUsUUFBUSxLQUFLLE1BQU0sR0FBRztBQUNoRyxJQUFFLFFBQVEsUUFBUSxLQUFLLElBQUksRUFBRSxTQUFTO0FBQ3RDLFNBQU87QUFDVDtBQU9BLFNBQVMsVUFBVSxHQUFpQjtBQUNsQyxRQUFNLE1BQU0sRUFBRTtBQUNkLFFBQU0sS0FBTSxPQUFPLEtBQUssS0FBSyxLQUFNLElBQUksS0FBSztBQUM1QyxNQUFJLElBQVk7QUFDaEIsTUFBSSxJQUFJLE1BQU07QUFBRSxVQUFNLElBQUksSUFBSSxHQUFHLEdBQUcsSUFBSTtBQUFHLFNBQUtELE1BQUssUUFBUSxLQUFLLE1BQU0sQ0FBQztBQUFHLFNBQUssT0FBTyxPQUFPLEtBQUssSUFBSSxLQUFLLEtBQUssQ0FBQztBQUFBLEVBQUcsV0FDN0csSUFBSSxLQUFLO0FBQUUsU0FBSztBQUFNLFNBQUs7QUFBQSxFQUFNLFdBQ2pDLElBQUksS0FBSztBQUFFLFVBQU0sSUFBSSxJQUFJLEdBQUcsS0FBSyxHQUFHO0FBQUcsU0FBS0EsTUFBSyxNQUFNLFFBQVEsS0FBSyxDQUFDO0FBQUcsU0FBS0EsTUFBSyxNQUFNLE1BQU0sQ0FBQztBQUFBLEVBQUcsT0FDdEc7QUFBRSxTQUFLLFFBQVE7QUFBSyxTQUFLO0FBQUEsRUFBTTtBQUNwQyxRQUFNLE9BQU8sU0FBUyxHQUFHLE1BQU0sTUFBTSxJQUFJO0FBQ3pDLFNBQU87QUFBQSxJQUNMLE9BQU87QUFBQSxJQUFNLE9BQU87QUFBQSxJQUFHLFdBQVcsRUFBRTtBQUFBLElBQVcsWUFBWTtBQUFBLElBQUcsV0FBVyxDQUFDQyxPQUFNLEVBQUUsWUFBWSxLQUFLLEdBQUcsR0FBRyxJQUFJO0FBQUEsSUFDN0csT0FBTztBQUFBLElBQUksT0FBTztBQUFBLElBQUksT0FBTztBQUFBLElBQUksT0FBTyxDQUFDO0FBQUEsSUFDekMsT0FBTyxLQUFLO0FBQUEsSUFBRyxPQUFPLEtBQUs7QUFBQSxJQUFHLE9BQU8sS0FBSztBQUFBLElBQUcsT0FBTyxDQUFDLEtBQUs7QUFBQSxFQUM1RDtBQUNGO0FBYU8sU0FBUyxjQUFjLEdBQVcsT0FBdUIsSUFBWSxRQUFRLE1BQU0sR0FBUztBQUNqRyxJQUFFLFFBQVE7QUFDVixRQUFNLFFBQVEsTUFBTTtBQUNwQixRQUFNLFNBQVMsTUFBTSxTQUFTLFNBQVMsTUFBTTtBQUM3QyxJQUFFLFNBQVUsUUFBUSxTQUFVLEtBQUssS0FBSyxJQUFJO0FBRzVDLFFBQU0sT0FBTyxNQUFNLFNBQVM7QUFDNUIsUUFBTSxXQUFXLE9BQU8sU0FBUyxNQUFNLFlBQVksSUFBSSxNQUFNLGVBQWU7QUFDNUUsUUFBTSxRQUFRLFNBQVMsTUFBTSxrQkFBa0IsTUFBTSxJQUFJLFdBQVc7QUFDcEUsUUFBTSxTQUFTO0FBQUEsSUFDYixRQUFRLENBQUMsUUFBUSxNQUFNLFNBQVMsUUFBUSxJQUFJO0FBQUEsSUFDNUMsS0FBSyxNQUFNLFNBQVMsUUFBUSxJQUFJO0FBQUEsSUFDaEMsU0FBUyxRQUFRLENBQUMsUUFBUSxJQUFJO0FBQUEsSUFDOUIsT0FBTyxRQUFRLElBQUk7QUFBQSxFQUNyQjtBQUNBLFFBQU0sS0FBSyxJQUFJLEtBQUssSUFBSSxDQUFDLE1BQU0sTUFBTSxTQUFTLFNBQVMsRUFBRSxNQUFNLE1BQU0sT0FBTyxLQUFLLEVBQUU7QUFDbkYsUUFBTSxJQUFJLEVBQUU7QUFDWixJQUFFLFdBQVcsT0FBTyxTQUFTLEVBQUUsVUFBVTtBQUN6QyxJQUFFLFFBQVEsT0FBTyxNQUFNLEVBQUUsT0FBTztBQUNoQyxJQUFFLFlBQVksT0FBTyxVQUFVLEVBQUUsV0FBVztBQUM1QyxJQUFFLFVBQVUsT0FBTyxRQUFRLEVBQUUsU0FBUztBQUN0QyxRQUFNLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxTQUFTO0FBR3RELFFBQU0sS0FBSyxPQUFPLFNBQVMsTUFBTSxFQUFFLElBQUksTUFBTSxLQUFLO0FBQ2xELFFBQU0sWUFBWSxLQUFLLE1BQU0sT0FBTyxFQUFFO0FBQ3RDLElBQUUsV0FBV0EsT0FBTSxRQUFRLEtBQUssR0FBRyxDQUFDLElBQUksRUFBRSxXQUFXLElBQUksS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDO0FBQ3pFLFFBQU0sS0FBSyxRQUFRLE1BQU0sTUFBTSxLQUFLLElBQUksV0FBVyxHQUFHLElBQUlELE1BQUssTUFBTSxNQUFNLE9BQU8sT0FBTyxFQUFFLE1BQU07QUFDakcsTUFBSSxFQUFFLFVBQVUsRUFBRSxRQUFRLEtBQU8sR0FBRSxhQUFhLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFLbkUsUUFBTSxZQUFZLENBQUMsUUFBUSxFQUFFLEtBQUssU0FBUyxJQUFJLFlBQVksT0FBTyxPQUFPQyxPQUFNLEtBQUssTUFBTSxPQUFPLEVBQUUsR0FBRyxNQUFNLEdBQUc7QUFDL0csUUFBTSxRQUFRLFlBQVksRUFBRSxjQUFjLElBQUksS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDO0FBQzlELElBQUUsYUFBYUEsT0FBTSxNQUFNLEtBQUssSUFBSSxJQUFJLEVBQUU7QUFFMUMsUUFBTSxRQUErQixDQUFDO0FBQ3RDLE1BQUksRUFBRSxTQUFTLEtBQU8sT0FBTSxLQUFLLENBQUMsRUFBRSxTQUFTLEtBQUssV0FBVyxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQ3ZFLE1BQUksRUFBRSxNQUFNLEtBQU8sT0FBTSxLQUFLLENBQUMsRUFBRSxNQUFNLEtBQUssUUFBUSxDQUFDO0FBQ3JELE1BQUksRUFBRSxVQUFVLEtBQU8sT0FBTSxLQUFLLENBQUMsRUFBRSxVQUFVLEtBQUssWUFBWSxHQUFHLFdBQVcsa0JBQWtCLEtBQUssQ0FBQyxDQUFDO0FBQ3ZHLE1BQUksRUFBRSxRQUFRLEtBQU8sT0FBTSxLQUFLLENBQUMsRUFBRSxRQUFRLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztBQUM3RCxRQUFNLElBQUksQ0FBQztBQUNYLGFBQVcsS0FBSyxNQUFNO0FBQUUsUUFBSSxJQUFJO0FBQUcsZUFBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLE1BQU8sTUFBSyxJQUFJLEVBQUUsQ0FBQztBQUFHLE1BQUUsQ0FBQyxJQUFJO0FBQUEsRUFBRztBQUV4RixJQUFFLEtBQUssU0FBUyxJQUFJLEdBQUcsRUFBRSxPQUFPLEVBQUUsS0FBSztBQUN2QyxJQUFFLEtBQUssU0FBUyxJQUFJLEVBQUU7QUFDdEIsSUFBRSxNQUFNLFNBQVMsSUFBSSxFQUFFO0FBQ3ZCLElBQUUsS0FBSyxTQUFTLElBQUksRUFBRTtBQUN0QixJQUFFLEtBQUssU0FBUyxJQUFJLEVBQUU7QUFBTyxJQUFFLEtBQUssU0FBUyxJQUFJLEVBQUU7QUFDbkQsSUFBRSxLQUFLLFNBQVMsSUFBSSxFQUFFO0FBQU8sSUFBRSxLQUFLLFNBQVMsSUFBSSxFQUFFO0FBQ25ELElBQUUsS0FBSyxTQUFTLElBQUksRUFBRTtBQUFPLElBQUUsS0FBSyxTQUFTLElBQUksRUFBRTtBQUNuRCxJQUFFLEtBQUssU0FBUyxJQUFJLEVBQUU7QUFBTyxJQUFFLEtBQUssU0FBUyxJQUFJLEVBQUU7QUFJbkQsUUFBTSxNQUFNLE9BQU8sRUFBRSxVQUFVLE1BQU0sTUFBTSxTQUFTLFNBQVMsT0FBTyxFQUFFLFNBQVMsT0FBTztBQUN0RixNQUFJLE1BQU0sUUFBUSxPQUFPLFNBQVMsTUFBTSxZQUFZLEdBQUc7QUFDckQsVUFBTSxJQUFJLE9BQU8sT0FBTyxPQUFPLEtBQUssSUFBSSxFQUFFLFlBQVksSUFBSSxHQUFHLElBQUksTUFBTUEsT0FBTSxRQUFRLEtBQUssR0FBRyxDQUFDO0FBQzlGLE1BQUUsT0FBTyxNQUFNLElBQUksS0FBSyxJQUFJLE9BQU9BLE9BQU0sT0FBTyxHQUFHLENBQUMsSUFBSSxHQUFHLEtBQUssSUFBSSxPQUFPQSxPQUFNLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFDOUYsTUFBRSxPQUFPLFNBQVMsSUFBSSxHQUFHLFdBQVcsa0JBQWtCLE9BQU8sT0FBTyxFQUFFLFFBQVEsR0FBRztBQUNqRixNQUFFLE9BQU8sU0FBUyxJQUFJLEVBQUUsT0FBTztBQUFBLEVBQ2pDLE9BQU87QUFDTCxNQUFFLE9BQU8sTUFBTSxVQUFVLENBQUM7QUFBQSxFQUM1QjtBQUNGO0FBR08sU0FBUyxZQUFZLEdBQVcsR0FBVyxHQUFXLEdBQVcsU0FBdUI7QUFDN0YsSUFBRSxLQUFLLFNBQVMsSUFBSSxHQUFHLEdBQUcsQ0FBQztBQUMzQixJQUFFLEtBQUssU0FBUyxJQUFJO0FBQ3RCOzs7QVZyWkEsSUFBTSxVQUFVO0FBQ2hCLElBQU0sS0FBSyxLQUFLLE1BQU0sSUFBSSxVQUFVO0FBRXBDLFNBQVMsT0FBYztBQUNyQixRQUFNLFFBQVEsWUFBWSxJQUFJO0FBQzlCLFdBQVMsS0FBSyxJQUFJLE1BQU0sR0FBRyxLQUFNLFVBQVMsS0FBSyxJQUFJLE1BQU0sR0FBRyxLQUFNLGFBQVksT0FBTyxjQUFjLENBQUMsSUFBSSxJQUFJLGNBQWMsQ0FBQyxJQUFJLEVBQUU7QUFDakksV0FBUyxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUssVUFBUyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFDOUQsYUFBUyxJQUFJLFVBQVUsT0FBTyxHQUFHLENBQUMsR0FBRyxLQUFLLElBQUksSUFBSyxVQUFTLE9BQU8sR0FBRyxHQUFHLEdBQUcsSUFBSSxHQUFHO0FBQ25GLGFBQVMsT0FBTyxHQUFHLElBQUksR0FBRyxJQUFJLEtBQUs7QUFDbkMsVUFBTSxTQUFTLEtBQUssSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLElBQUksQ0FBQyxLQUFLO0FBQ2xELGFBQVMsSUFBSSxJQUFJLElBQUksU0FBUyxJQUFLLFVBQVMsT0FBTyxHQUFHLEdBQUcsR0FBRyxTQUFTLElBQUksUUFBUSxJQUFJLEtBQUs7QUFBQSxFQUM1RjtBQUNBLFNBQU87QUFDVDtBQUVBLElBQU0sUUFBUSxDQUFDLElBQTZCLENBQUMsT0FBdUIsRUFBRSxPQUFPLEdBQUcsT0FBTyxHQUFHLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxFQUFFO0FBQ3hILFNBQVMsSUFBSSxPQUFjLEdBQW1CLE9BQWUsSUFBNkIsQ0FBQyxHQUFHLE1BQW9DO0FBQ2hJLFdBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxLQUFLO0FBQUUsUUFBSSxjQUFjLE9BQU8sR0FBRyxNQUFNLENBQUMsQ0FBQztBQUFHLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFDcEYsU0FBTztBQUNUO0FBRUEsSUFBTSxXQUFXLENBQUMsVUFBaUIsSUFBSSxPQUFPLGdCQUFnQixLQUFLLElBQUksR0FBRyxHQUFHLElBQUksRUFBRTtBQUVuRixLQUFLLCtFQUErRSxNQUFNO0FBQ3hGLFFBQU0sUUFBUSxLQUFLO0FBQ25CLE1BQUksSUFBSSxTQUFTLEtBQUs7QUFDdEIsU0FBTyxNQUFNLEVBQUUsTUFBTSxNQUFNO0FBQzNCLE1BQUksRUFBRSxHQUFHLEdBQUcsUUFBUSxJQUFJO0FBQ3hCLE1BQUksT0FBTyxFQUFFLFFBQVEsU0FBUyxVQUFVLFNBQVM7QUFDakQsTUFBSSxJQUFJLE9BQU8sR0FBRyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTTtBQUNwQyxXQUFPLE1BQU0sRUFBRSxnQkFBZ0IsS0FBSztBQUNwQyxXQUFPLEdBQUcsRUFBRSxVQUFVLE1BQU0sbUNBQW1DO0FBQy9ELFdBQU8sRUFBRTtBQUNULFVBQU0sTUFBTSxFQUFFLElBQUksYUFBYSxFQUFFO0FBQ2pDLGFBQVMsS0FBSyxJQUFJLFFBQVEsR0FBRztBQUFHLGFBQVMsS0FBSyxJQUFJLFFBQVEsR0FBRztBQUFBLEVBQy9ELENBQUM7QUFDRCxTQUFPLE1BQU0sRUFBRSxRQUFRLEdBQUcsVUFBVTtBQUNwQyxTQUFPLE1BQU0sRUFBRSxRQUFRLFVBQVU7QUFDakMsU0FBTyxNQUFNLEVBQUUsU0FBUyxDQUFDO0FBRXpCLFNBQU8sR0FBRyxTQUFTLFFBQVEsU0FBUyxLQUFLLGlCQUFpQixNQUFNLEtBQUssTUFBTSxFQUFFO0FBQzdFLFNBQU8sR0FBRyxLQUFLLElBQUksVUFBVSxFQUFFLElBQUksV0FBVyxJQUFJLElBQUk7QUFDeEQsQ0FBQztBQUVELEtBQUssc0ZBQXNGLE1BQU07QUFDL0YsUUFBTSxRQUFRLEtBQUs7QUFDbkIsTUFBSSxJQUFJLElBQUksT0FBTyxnQkFBZ0IsS0FBSyxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDNUQsTUFBSSxTQUFTO0FBQ2IsTUFBSSxJQUFJLE9BQU8sR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTTtBQUFFLGFBQVMsS0FBSyxJQUFJLFFBQVEsRUFBRSxDQUFDO0FBQUEsRUFBRyxDQUFDO0FBQ3hFLFNBQU8sR0FBRyxTQUFTLFVBQVUsY0FBYyxLQUFLLGNBQWMsTUFBTSxFQUFFO0FBQ3RFLFNBQU8sTUFBTSxFQUFFLE1BQU0sTUFBTTtBQUMzQixTQUFPLE1BQU0sRUFBRSxnQkFBZ0IsS0FBSztBQUNwQyxTQUFPLEdBQUcsS0FBSyxJQUFJLFVBQVUsRUFBRSxJQUFJLFdBQVcsSUFBSSxNQUFNLFdBQVcsVUFBVSxFQUFFLENBQUMsRUFBRTtBQUNwRixDQUFDO0FBRUQsS0FBSyx3RkFBd0YsTUFBTTtBQUNqRyxRQUFNLFFBQVEsS0FBSztBQUNuQixNQUFJLElBQUksU0FBUyxLQUFLO0FBQ3RCLE1BQUksSUFBSSxPQUFPLEdBQUcsS0FBSyxNQUFNLE1BQU0sRUFBRSxHQUFHLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFDdEQsU0FBTyxNQUFNLEVBQUUsZ0JBQWdCLElBQUk7QUFDbkMsU0FBTyxHQUFHLEVBQUUsSUFBSSxVQUFVLGFBQWEsS0FBSyxRQUFRLEVBQUUsQ0FBQyxFQUFFO0FBQ3pELE1BQUksSUFBSSxPQUFPLEdBQUcsSUFBSSxJQUFJLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFDeEMsU0FBTyxHQUFHLEVBQUUsU0FBUyxPQUFPLEVBQUUsU0FBUyxLQUFLLFVBQVUsRUFBRSxNQUFNLEVBQUU7QUFDaEUsUUFBTSxPQUFPLEVBQUU7QUFFZixNQUFJLElBQUk7QUFDUixTQUFPLEVBQUUsa0JBQWtCLE1BQU0sSUFBSSxHQUFJLEtBQUksSUFBSSxPQUFPLEdBQUcsQ0FBQztBQUM1RCxTQUFPLE1BQU0sRUFBRSxnQkFBZ0IsS0FBSztBQUNwQyxTQUFPLEdBQUcsSUFBSSxJQUFJLElBQUksZUFBZSxJQUFJLEVBQUUsSUFBSTtBQUMvQyxTQUFPLEdBQUcsRUFBRSxTQUFTLEtBQUssRUFBRSxVQUFVLE1BQU0sb0NBQW9DO0FBQ2hGLE1BQUksSUFBSSxPQUFPLEdBQUcsSUFBSSxFQUFFO0FBQ3hCLFNBQU8sR0FBRyxLQUFLLElBQUksVUFBVSxFQUFFLElBQUksV0FBVyxJQUFJLE1BQU0sd0JBQXdCO0FBQ2hGLFNBQU8sTUFBTSxFQUFFLFFBQVEsQ0FBQztBQUMxQixDQUFDO0FBRUQsS0FBSyxvREFBb0QsTUFBTTtBQUM3RCxRQUFNLFFBQVEsS0FBSztBQUNuQixRQUFNLFNBQVMsSUFBSSxPQUFPLFNBQVMsS0FBSyxHQUFHLElBQUksSUFBSSxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQ2pFLFNBQU8sTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUI7QUFDOUMsUUFBTSxTQUFTLENBQUMsTUFBK0I7QUFDN0MsUUFBSUMsS0FBSSxRQUFRLElBQUk7QUFDcEIsV0FBT0EsR0FBRSxrQkFBa0IsTUFBTSxLQUFLLEdBQUksQ0FBQUEsS0FBSSxJQUFJLE9BQU9BLElBQUcsR0FBRyxDQUFDO0FBQ2hFLFdBQU87QUFBQSxFQUNUO0FBQ0EsUUFBTSxVQUFVLE9BQU8sQ0FBQyxDQUFDLEdBQUcsT0FBTyxPQUFPLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFDeEQsU0FBTyxHQUFHLE9BQU8sVUFBVSxNQUFNLFFBQVEsSUFBSSxzQkFBc0IsT0FBTyxFQUFFO0FBRTVFLE1BQUksSUFBSSxJQUFJLE9BQU8sU0FBUyxLQUFLLEdBQUcsSUFBSSxJQUFJLEVBQUUsTUFBTSxLQUFLLEdBQUcsQ0FBQyxNQUFNLE9BQU8sTUFBTSxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBQy9GLFNBQU8sR0FBRyxFQUFFLElBQUksVUFBVSxjQUFjLEtBQUssVUFBVSxFQUFFLENBQUMsRUFBRTtBQUM1RCxNQUFJLElBQUksT0FBTyxHQUFHLElBQUksRUFBRTtBQUN4QixTQUFPLEdBQUcsS0FBSyxJQUFJLFVBQVUsRUFBRSxJQUFJLFdBQVcsSUFBSSxJQUFJO0FBQ3hELENBQUM7QUFFRCxLQUFLLDZEQUE2RCxNQUFNO0FBQ3RFLFFBQU0sUUFBUSxLQUFLO0FBQ25CLE1BQUksSUFBSSxTQUFTLEtBQUs7QUFDdEIsTUFBSSxJQUFJO0FBQ1IsU0FBTyxDQUFDLEVBQUUsUUFBUSxNQUFNLEtBQUssR0FBSSxLQUFJLElBQUksT0FBTyxHQUFHLEdBQUcsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUNwRSxTQUFPLE1BQU0sRUFBRSxNQUFNLElBQUk7QUFDekIsU0FBTyxNQUFNLEVBQUUsT0FBTyxTQUFTO0FBRS9CLFNBQU8sR0FBRyxJQUFJLEtBQUssTUFBTSxJQUFJLEtBQUssSUFBSSxpQkFBaUIsSUFBSSxFQUFFLElBQUk7QUFDbkUsQ0FBQztBQUVELEtBQUsscURBQXFELE1BQU07QUFDOUQsUUFBTSxRQUFRLEtBQUs7QUFDbkIsTUFBSSxJQUFJLFNBQVMsS0FBSztBQUN0QixNQUFJLElBQUksT0FBTyxHQUFHLElBQUksSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDO0FBQ3RDLFNBQU8sTUFBTSxFQUFFLE1BQU0sUUFBUTtBQUM3QixTQUFPLE1BQU0sRUFBRSxHQUFHLE9BQU87QUFDekIsU0FBTyxHQUFHLEVBQUUsSUFBSSxDQUFDO0FBQ25CLENBQUM7QUFFRCxLQUFLLGdGQUFnRixNQUFNO0FBQ3pGLFFBQU0sUUFBUSxLQUFLO0FBRW5CLFdBQVMsSUFBSSxJQUFJLEtBQUssR0FBRyxJQUFLLFVBQVMsSUFBSSxHQUFHLEtBQUssR0FBRyxJQUFLLFVBQVMsSUFBSSxJQUFJLEtBQUssSUFBSSxJQUFLLFVBQVMsT0FBTyxHQUFHLEdBQUcsR0FBRyxJQUFJLEtBQUs7QUFDNUgsTUFBSSxJQUFJLElBQUksT0FBTyxnQkFBZ0IsTUFBTSxJQUFJLEdBQUcsR0FBRyxJQUFJLEVBQUU7QUFDekQsTUFBSSxTQUFTO0FBQ2IsTUFBSSxJQUFJLE9BQU8sR0FBRyxLQUFLLE1BQU0sTUFBTSxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLE1BQU07QUFDM0QsV0FBTyxNQUFNLEVBQUUsZ0JBQWdCLE9BQU8sS0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRTtBQUN6RCxXQUFPLE1BQU0sRUFBRSxNQUFNLE1BQU07QUFDM0IsYUFBUyxLQUFLLElBQUksUUFBUSxFQUFFLENBQUM7QUFBQSxFQUMvQixDQUFDO0FBQ0QsU0FBTyxHQUFHLEVBQUUsSUFBSSxHQUFHLGNBQWMsRUFBRSxDQUFDLEdBQUc7QUFDdkMsU0FBTyxHQUFHLFNBQVMsVUFBVSxjQUFjLE1BQU0sVUFBVSxNQUFNLEVBQUU7QUFDbkUsU0FBTyxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQzFCLENBQUM7QUFFRCxLQUFLLG1HQUFtRyxNQUFNO0FBQzVHLFFBQU0sUUFBUSxZQUFZLE1BQU0sd0JBQXdCO0FBQ3hELFdBQVMsS0FBSyxJQUFJLE1BQU0sR0FBRyxLQUFNLFVBQVMsS0FBSyxJQUFJLE1BQU0sR0FBRyxLQUFNLGFBQVksT0FBTyxjQUFjLEdBQUcsSUFBSSxJQUFJLGNBQWMsQ0FBQyxJQUFJLEVBQUU7QUFDbkksU0FBTyxHQUFHLGFBQWEsT0FBTyxLQUFLLENBQUMsS0FBSyxHQUFHLG1CQUFtQjtBQUMvRCxNQUFJLElBQUksZ0JBQWdCLE9BQU8sY0FBYyxPQUFPLE9BQU8sS0FBSyxHQUFHLEdBQUksR0FBRztBQUMxRSxNQUFJLElBQUksT0FBTyxHQUFHLEtBQUssRUFBRTtBQUN6QixTQUFPLE1BQU0sRUFBRSxNQUFNLE1BQU07QUFDM0IsU0FBTyxNQUFNLEVBQUUsTUFBTSxLQUFLO0FBQzFCLFNBQU8sTUFBTSxFQUFFLGdCQUFnQixLQUFLO0FBQ3BDLFNBQU8sTUFBTSxFQUFFLFFBQVEsQ0FBQztBQUN4QixTQUFPLE1BQU0sRUFBRSxRQUFRLFVBQVU7QUFDbkMsQ0FBQztBQUlELElBQU0sU0FBUyxJQUFVLGVBQVE7QUFDakMsSUFBTSxRQUFRLENBQUMsTUFBc0M7QUFBRSxJQUFFLEtBQUssa0JBQWtCLElBQUk7QUFBRyxTQUFPLEVBQUUsS0FBSyxpQkFBaUIsTUFBTSxFQUFFO0FBQUc7QUFHakksU0FBUyxRQUFRLE9BQWMsR0FBbUIsU0FBaUIsR0FBNEIsR0FBbUMsTUFBb0M7QUFDcEssV0FBUyxJQUFJLEdBQUcsSUFBSSxVQUFVLElBQUksS0FBSztBQUNyQyxRQUFJLGNBQWMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxDQUFDO0FBQ3BDLGdCQUFZLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxPQUFPO0FBQ3ZDLGtCQUFjLEdBQUcsR0FBRyxVQUFVO0FBQzlCLFdBQU8sQ0FBQztBQUFBLEVBQ1Y7QUFDQSxTQUFPO0FBQ1Q7QUFFQSxLQUFLLG9HQUFvRyxNQUFNO0FBQzdHLFFBQU0sUUFBUSxLQUFLO0FBQ25CLFFBQU0sSUFBSSxZQUFZO0FBQ3RCLE1BQUksSUFBSSxRQUFRLE9BQU8sZ0JBQWdCLE1BQU0sSUFBSSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUMvRCxRQUFNLE9BQWlCLENBQUMsR0FBRyxPQUFpQixDQUFDO0FBQzdDLE1BQUksUUFBUSxPQUFPLEdBQUcsR0FBRyxFQUFFLE9BQU8sRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNO0FBQy9DLFNBQUssS0FBSyxFQUFFLEtBQUssU0FBUyxDQUFDO0FBQUcsU0FBSyxLQUFLLEVBQUUsS0FBSyxTQUFTLENBQUM7QUFDekQsV0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsZUFBZSxpQkFBaUIsaUNBQWlDO0FBQUEsRUFDMUYsQ0FBQztBQUNELFNBQU8sTUFBTSxFQUFFLE1BQU0sTUFBTTtBQUMzQixRQUFNLE9BQU8sQ0FBQyxNQUFnQixLQUFLLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxJQUFJLEdBQUcsQ0FBQztBQUM1RCxTQUFPLEdBQUcsS0FBSyxLQUFLLE1BQU0sR0FBRyxDQUFDLElBQUksS0FBSyxhQUFhLEtBQUssSUFBSSxDQUFDLEVBQUU7QUFDaEUsU0FBTyxHQUFHLEtBQUssS0FBSyxNQUFNLEdBQUcsQ0FBQyxJQUFJLEtBQUssWUFBWSxLQUFLLElBQUksQ0FBQyxFQUFFO0FBRS9ELFNBQU8sR0FBRyxFQUFFLEtBQUssU0FBUyxJQUFJLEtBQUssY0FBYyxFQUFFLEtBQUssU0FBUyxDQUFDLEVBQUU7QUFDcEUsU0FBTyxHQUFHLEVBQUUsT0FBTyxNQUFNLElBQUksS0FBSyw2QkFBNkI7QUFDakUsQ0FBQztBQUVELEtBQUssMkZBQTJGLE1BQU07QUFDcEcsUUFBTSxRQUFRLEtBQUs7QUFDbkIsUUFBTSxJQUFJLFlBQVk7QUFDdEIsTUFBSSxJQUFJLFFBQVEsT0FBTyxnQkFBZ0IsS0FBSyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQzlELFFBQU0sS0FBZSxDQUFDLEdBQUcsS0FBZSxDQUFDLEdBQUcsT0FBaUIsQ0FBQztBQUM5RCxNQUFJLFFBQVEsT0FBTyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNO0FBQ3JDLE9BQUcsS0FBSyxFQUFFLEtBQUssU0FBUyxDQUFDO0FBQUcsT0FBRyxLQUFLLEVBQUUsS0FBSyxTQUFTLENBQUM7QUFBRyxTQUFLLEtBQUssRUFBRSxLQUFLLFNBQVMsSUFBSSxFQUFFLEtBQUssU0FBUyxDQUFDO0FBQ3ZHLFdBQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLGVBQWUsa0JBQWtCLE1BQU0seUJBQXlCO0FBQUEsRUFDekYsQ0FBQztBQUNELFNBQU8sR0FBRyxLQUFLLElBQUksR0FBRyxFQUFFLElBQUksS0FBSyx1QkFBdUI7QUFDeEQsU0FBTyxHQUFHLEtBQUssSUFBSSxHQUFHLEVBQUUsSUFBSSxLQUFLLElBQUksR0FBRyxFQUFFLElBQUksS0FBSywyQkFBMkI7QUFDOUUsU0FBTyxHQUFHLEtBQUssSUFBSSxHQUFHLElBQUksSUFBSSxLQUFLLElBQUksR0FBRyxJQUFJLElBQUksS0FBSyx1QkFBdUI7QUFDOUUsU0FBTyxHQUFHLEVBQUUsS0FBSyxTQUFTLElBQUksS0FBSyxTQUFTO0FBRTVDLFFBQU0sS0FBZSxDQUFDO0FBQ3RCLFVBQVEsT0FBTyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsTUFBTSxHQUFHLEtBQUssRUFBRSxLQUFLLFNBQVMsQ0FBQyxDQUFDO0FBQzVELFFBQU0sTUFBTSxLQUFLLElBQUksR0FBRyxFQUFFLElBQUksS0FBSyxJQUFJLEdBQUcsRUFBRTtBQUM1QyxTQUFPLEdBQUcsTUFBTSxRQUFRLE1BQU0sTUFBTSxPQUFPLEdBQUcsRUFBRTtBQUNsRCxDQUFDO0FBRUQsS0FBSyw2RkFBNkYsTUFBTTtBQUN0RyxRQUFNLFFBQVEsS0FBSztBQUNuQixRQUFNLElBQUksWUFBWTtBQUN0QixNQUFJLElBQUksUUFBUSxPQUFPLGdCQUFnQixLQUFLLElBQUksR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFDOUQsTUFBSSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssU0FBUyxHQUFHLE9BQU8sRUFBRSxLQUFLLFNBQVMsR0FBRyxHQUFHLEVBQUUsS0FBSyxTQUFTLEVBQUU7QUFDcEYsTUFBSSxPQUFPO0FBQ1gsUUFBTSxRQUFRLE1BQU07QUFDbEIsV0FBTyxLQUFLLElBQUksTUFBTSxLQUFLLElBQUksRUFBRSxLQUFLLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxLQUFLLElBQUksRUFBRSxLQUFLLFNBQVMsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUNwRyxXQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssU0FBUyxHQUFHLE9BQU8sRUFBRSxLQUFLLFNBQVMsR0FBRyxHQUFHLEVBQUUsS0FBSyxTQUFTLEVBQUU7QUFBQSxFQUNsRjtBQUVBLE1BQUksUUFBUSxPQUFPLEdBQUcsS0FBSyxFQUFFLE1BQU0sS0FBSyxHQUFHLEdBQUcsS0FBSztBQUNuRCxTQUFPLE1BQU0sRUFBRSxnQkFBZ0IsSUFBSTtBQUNuQyxTQUFPLEdBQUcsRUFBRSxLQUFLLFNBQVMsSUFBSSxLQUFLLHdCQUF3QixFQUFFLEtBQUssU0FBUyxDQUFDLEVBQUU7QUFFOUUsUUFBTSxPQUFpQixDQUFDO0FBQ3hCLE1BQUksUUFBUSxPQUFPLEdBQUcsR0FBRyxFQUFFLE1BQU0sTUFBTSxPQUFPLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTTtBQUFFLFVBQU07QUFBRyxTQUFLLEtBQUssRUFBRSxLQUFLLFNBQVMsQ0FBQztBQUFBLEVBQUcsQ0FBQztBQUN2RyxNQUFJLFFBQVEsT0FBTyxHQUFHLEtBQUssRUFBRSxPQUFPLEdBQUcsR0FBRyxHQUFHLEtBQUs7QUFDbEQsU0FBTyxHQUFHLEtBQUssSUFBSSxHQUFHLElBQUksSUFBSSxLQUFLLElBQUksR0FBRyxJQUFJLElBQUksR0FBRyxzQkFBc0I7QUFFM0UsTUFBSSxRQUFRLE9BQU8sR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLEtBQUs7QUFDckMsU0FBTyxNQUFNLEVBQUUsZ0JBQWdCLEtBQUs7QUFDcEMsU0FBTyxHQUFHLEVBQUUsS0FBSyxTQUFTLElBQUksS0FBSyxpQkFBaUIsRUFBRSxLQUFLLFNBQVMsQ0FBQyxFQUFFO0FBQ3ZFLFNBQU8sR0FBRyxPQUFPLE1BQU0sOENBQThDLElBQUksR0FBRztBQUU1RSxNQUFJLEVBQUUsR0FBRyxHQUFHLEdBQUcsSUFBSTtBQUNuQixNQUFJLFFBQVEsT0FBTyxHQUFHLEtBQUssRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDO0FBQzFDLFNBQU8sTUFBTSxFQUFFLE1BQU0sUUFBUTtBQUM3QixTQUFPLEdBQUcsRUFBRSxLQUFLLFNBQVMsSUFBSSxRQUFRLEtBQUssSUFBSSxFQUFFLEtBQUssU0FBUyxJQUFJLElBQUksSUFBSSxNQUFNLGNBQWM7QUFDL0YsU0FBTyxNQUFNLEVBQUUsT0FBTyxNQUFNLEdBQUcsR0FBRyxpQkFBaUI7QUFDckQsQ0FBQztBQUVELEtBQUssNkZBQTZGLE1BQU07QUFDdEcsUUFBTSxJQUFJLFlBQVk7QUFDdEIsTUFBSSxTQUFTLEdBQUcsT0FBTztBQUN2QixJQUFFLEtBQUssU0FBUyxDQUFDLE1BQU07QUFBRSxVQUFNLElBQUk7QUFBaUIsUUFBSSxFQUFFLFFBQVE7QUFBRTtBQUFVLGNBQVEsRUFBRSxTQUFTLFdBQVcsU0FBUyxRQUFRO0FBQUEsSUFBRztBQUFBLEVBQUUsQ0FBQztBQUNuSSxTQUFPLE1BQU0sUUFBUSxDQUFDO0FBQ3RCLFNBQU8sR0FBRyxPQUFPLEtBQUssYUFBYSxJQUFJLEVBQUU7QUFDM0MsQ0FBQzsiLAogICJuYW1lcyI6IFsiVEhSRUUiLCAiYSIsICJiIiwgInNtb290aCIsICJtYXRlcmlhbCIsICJpbnB1dCIsICJUSFJFRSIsICJNIiwgInNtb290aCIsICJsZXJwIiwgImNsYW1wIiwgInMiXQp9Cg==
