// tests/sim.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
  const smooth2 = raw.map((p, i) => {
    let sx = 0, n = 0;
    for (let k = Math.max(0, i - 4); k <= Math.min(raw.length - 1, i + 4); k++) {
      sx += raw[k].x;
      n++;
    }
    return { x: sx / n, z: p.z };
  });
  smooth2.reverse();
  const points = [];
  let s = 0;
  for (let i = 0; i < smooth2.length; i++) {
    if (i > 0) s += Math.hypot(smooth2[i].x - smooth2[i - 1].x, smooth2[i].z - smooth2[i - 1].z);
    points.push({ x: smooth2[i].x, z: smooth2[i].z, s, level: 0, width: 6 });
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
function liveEntity(world, id) {
  const entity = world.entities.get(id);
  return !entity || isRetiredStoneKind(entity.kind) && !isStoneReplay(world) || world.entityRemovals.has(id) ? null : entity;
}
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
function generateWorld(seed = 1337, initialRadius = 0, generatorVersion = GENERATOR_VERSION) {
  const world = createWorld(seed, generatorVersion);
  const centre = Math.floor(CHUNKS_PER_SIDE / 2);
  for (let cz = centre - initialRadius; cz <= centre + initialRadius; cz++) {
    for (let cx = centre - initialRadius; cx <= centre + initialRadius; cx++) {
      generateChunk(world, cx, cz);
    }
  }
  placeAuthoredSites(world);
  return world;
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
  for (const material of chunk.data) if (material !== MAT.AIR) editedNonAir++;
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
function topMaterialAtWorld(world, x, z) {
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return MAT.AIR;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return MAT.AIR;
  return chunk.topMaterials[worldToLocalZ(z) * CHUNK_SIZE + worldToLocalX(x)];
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
function addAuthoredEntity(world, kind, x, z, variant, rot, scale, resource, remaining, yieldPerHarvest) {
  const y = surfaceAt(world, x, z);
  if (y <= SEA_LEVEL) return;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const key = chunkKey(cx, cz);
  const ids = world.entityChunks.get(key) ?? [];
  if (isRetiredStoneKind(kind) && !isStoneReplay(world)) return;
  for (const id2 of ids) {
    const e = world.entities.get(id2);
    if (e && Math.hypot(e.x - x, e.z - z) < 2.6) {
      world.entities.delete(id2);
      if (e.kind.startsWith("styl_tree")) world.stats.trees = Math.max(0, world.stats.trees - 1);
      if (e.kind === "styl_tree_blossom") world.stats.pinkTrees = Math.max(0, world.stats.pinkTrees - 1);
    }
  }
  world.entityChunks.set(key, ids.filter((id2) => world.entities.has(id2)));
  world.entityChanges.add(key);
  const id = `hero:${kind}:${Math.round(x)}:${Math.round(z)}`;
  const before = world.entities.size;
  const entity = {
    id,
    kind,
    chunk: key,
    x: x + 0.5,
    y,
    z: z + 0.5,
    rot,
    scale,
    variant,
    resource,
    remaining,
    yieldPerHarvest,
    harvested: false,
    provisional: true,
    authored: true
  };
  addEntity(world, entity);
  if (world.entities.size > before && kind.startsWith("styl_tree")) {
    world.stats.trees++;
    if (kind === "styl_tree_blossom") world.stats.pinkTrees++;
  }
}
function placeAuthoredSites(world) {
  if (world.authoredPlaced) return;
  world.authoredPlaced = true;
  const sites = [
    { kind: "waystone", x: -10, z: -14, rot: 0 },
    { kind: "marker", x: -32, z: -8, rot: Math.PI / 2 }
  ];
  for (const s of sites) {
    const y = surfaceAt(world, s.x, s.z);
    if (y <= SEA_LEVEL) continue;
    world.sites.push({
      id: `site:${s.kind}`,
      kind: s.kind,
      x: s.x + 0.5,
      y,
      z: s.z + 0.5,
      rot: s.rot,
      provisional: true
    });
  }
  const grove = [
    ["styl_tree_spire", -22, -26, 0, 1, 0],
    ["styl_tree_table", -34, -18, 1, 0.95, Math.PI / 12],
    ["styl_tree_cluster", -16, -34, 2, 1, Math.PI / 6],
    ["styl_tree_blossom", -28, -38, 0, 0.9, Math.PI / 4],
    ["styl_tree_table", -40, -30, 2, 1.05, Math.PI / 3],
    ["styl_tree_cluster", -12, -24, 0, 0.9, Math.PI / 2.4]
  ];
  for (const [kind, x, z, variant, scale, rot] of grove) {
    addAuthoredEntity(world, kind, x, z, variant, rot, scale, "wood", 12, 4);
  }
  addAuthoredEntity(world, "styl_rock_medium", -6, -10, 0, 0, 1, "stone", 8, 3);
  addAuthoredEntity(world, "styl_shrub", -14, -8, 1, Math.PI / 12, 1.1, "fiber", 4, 1);
  addAuthoredEntity(world, "styl_cairn", -20, -6, 0, 0, 1, "stone", 6, 2);
  addAuthoredEntity(world, "styl_ore", -38, -42, 0, Math.PI / 4, 1.1, "ore", 8, 2);
}
function nearestHarvestable(world, x, z, radius, resource) {
  let best = null;
  let bestD = radius * radius;
  for (const e of world.entities.values()) {
    if (isRetiredStoneKind(e.kind) || world.entityRemovals.has(e.id) || e.harvested || !e.resource || e.remaining <= 0) continue;
    if (resource && e.resource !== resource) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
function harvestEntity(world, id) {
  const e = liveEntity(world, id);
  if (!e || e.harvested || !e.resource || e.remaining <= 0) return null;
  const amount = Math.min(e.yieldPerHarvest, e.remaining);
  if (world.life && Object.values(world.inventory).reduce((sum, n) => sum + n, 0) + amount > 120) return null;
  e.remaining -= amount;
  if (!e.authored) world.entityChanges.add(e.chunk);
  e.harvestedOnce = true;
  if (e.remaining <= 0) e.harvested = true;
  world.inventory[e.resource] = (world.inventory[e.resource] ?? 0) + amount;
  world.revision++;
  return { entity: e, resource: e.resource, amount };
}
function fnv1a(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function worldManifest(world) {
  const p = world.params;
  return {
    schema: 1,
    seed: world.seed,
    generatorVersion: p.generatorVersion,
    size: p.size,
    chunkSize: p.chunkSize,
    yMin: p.yMin,
    yMax: p.yMax,
    seaLevel: p.seaLevel,
    paramsHash: fnv1a(JSON.stringify(p))
  };
}
function exportChunkDelta(world, key) {
  const edits = world.edits.get(key);
  return {
    schema: 1,
    key,
    baseVersion: world.params.generatorVersion,
    edits: edits ? [...edits.entries()].map(([i, m]) => ({ i, m })).sort((a, b) => a.i - b.i) : []
  };
}
function applyChunkDelta(world, delta) {
  const [cx, cz] = delta.key.split(",").map(Number);
  for (const e of delta.edits) {
    const yIndex = Math.floor(e.i / CHUNK_AREA);
    const rem = e.i % CHUNK_AREA;
    const lz = Math.floor(rem / CHUNK_SIZE);
    const lx = rem % CHUNK_SIZE;
    const x = chunkOriginX(cx) + lx;
    const y = Y_MIN + yIndex;
    const z = chunkOriginZ(cz) + lz;
    setVoxel(world, x, y, z, e.m);
  }
}

// tests/sim.test.ts
function checksum(chunk) {
  let h = 2166136261;
  for (let i = 0; i < chunk.data.length; i++) {
    h ^= chunk.data[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function findLandColumn(world) {
  for (let z = -40; z <= 40; z++) {
    for (let x = -40; x <= 40; x++) {
      const y = surfaceAt(world, x, z);
      if (y <= SEA_LEVEL + 2) continue;
      const top = topMaterialAtWorld(world, x, z);
      if (top !== MAT.GRASS && top !== MAT.MOSS) continue;
      let solidBelow = 0;
      for (let d = 1; d <= 5; d++) if (isSolid(getVoxel(world, x, y - d, z))) solidBelow++;
      if (solidBelow === 5) return { x, z, y };
    }
  }
  throw new Error("no suitable land column found");
}
function findWaterColumn(world) {
  for (let z = -90; z <= 90; z += 3) {
    for (let x = -90; x <= 90; x += 3) {
      if (surfaceAt(world, x, z) < SEA_LEVEL && getVoxel(world, x, SEA_LEVEL - 1, z) === MAT.WATER) {
        return { x, z };
      }
    }
  }
  throw new Error("no water column found");
}
test("deterministic generation: same seed, same chunks, entities and sites", () => {
  const a = generateWorld(1337, 0);
  const b = generateWorld(1337, 0);
  assert.deepEqual([...a.chunks.keys()].sort(), [...b.chunks.keys()].sort());
  for (const [key, chunk] of a.chunks) {
    const other = b.chunks.get(key);
    assert.ok(other, `missing chunk ${key}`);
    assert.equal(checksum(chunk), checksum(other), `chunk ${key} differs`);
    assert.deepEqual([...chunk.heights], [...other.heights], `heights ${key} differ`);
  }
  assert.deepEqual([...a.entities.keys()].sort(), [...b.entities.keys()].sort());
  for (const [id, e] of a.entities) {
    const other = b.entities.get(id);
    assert.deepEqual([e.x, e.y, e.z, e.kind, e.variant], [other.x, other.y, other.z, other.kind, other.variant]);
  }
  assert.deepEqual(a.sites, b.sites);
  assert.equal(a.stats.trees, b.stats.trees);
  assert.equal(a.stats.pinkTrees, b.stats.pinkTrees);
});
test("different seed changes the terrain", () => {
  const a = generateWorld(1337, 0);
  const b = generateWorld(1338, 0);
  const key = [...a.chunks.keys()][0];
  assert.notEqual(checksum(a.chunks.get(key)), checksum(b.chunks.get(key)));
});
test("chunk generation is independent of generation order", () => {
  const orderA = [[32, 32], [31, 32], [32, 31], [31, 31]];
  const orderB = [[31, 31], [32, 31], [31, 32], [32, 32]];
  const a = createWorld(1337);
  const b = createWorld(1337);
  for (const [cx, cz] of orderA) generateChunk(a, cx, cz);
  for (const [cx, cz] of orderB) generateChunk(b, cx, cz);
  for (const [key, chunk] of a.chunks) {
    assert.equal(checksum(chunk), checksum(b.chunks.get(key)), `chunk ${key} depends on order`);
  }
  assert.deepEqual([...a.entities.keys()].sort(), [...b.entities.keys()].sort());
});
test("surfaceAt is the exposed top face, not the height model", () => {
  const world = generateWorld(1337, 3);
  const land = findLandColumn(world);
  assert.ok(isSolid(getVoxel(world, land.x, land.y - 1, land.z)));
  assert.ok(!isSolid(getVoxel(world, land.x, land.y, land.z)));
  assert.equal(surfaceAt(world, land.x, land.z), surfaceHeightAt(world.seed, land.x, land.z));
  assert.equal(getVoxel(world, 0, Y_MIN - 1, 0), MAT.BEDROCK);
  assert.equal(getVoxel(world, 0, Y_MAX, 0), MAT.AIR);
  assert.equal(getVoxel(world, WORLD_SIZE, 0, 0), MAT.AIR);
  assert.equal(setVoxel(world, WORLD_SIZE, 0, 0, MAT.STONE), false);
});
test("material layers: grass top over soil and stone, with no air pocket below", () => {
  const world = generateWorld(1337, 3);
  const c = findLandColumn(world);
  assert.equal(topMaterialAtWorld(world, c.x, c.z), getVoxel(world, c.x, c.y - 1, c.z));
  assert.ok([MAT.GRASS, MAT.MOSS].includes(topMaterialAtWorld(world, c.x, c.z)));
  const below = getVoxel(world, c.x, c.y - 2, c.z);
  assert.ok([MAT.SOIL, MAT.STONE, MAT.GRAVEL].includes(below), `unexpected subsoil ${below}`);
  for (let d = 1; d <= 5; d++) assert.ok(isSolid(getVoxel(world, c.x, c.y - d, c.z)));
  assert.ok(isSolid(getVoxel(world, c.x, Y_MIN, c.z)), "world floor must be solid");
});
test("water columns hold water at sea level and report depth", () => {
  const world = generateWorld(1337, 3);
  const w = findWaterColumn(world);
  assert.equal(getVoxel(world, w.x, SEA_LEVEL - 1, w.z), MAT.WATER);
  assert.ok(waterDepthAt(world, w.x, w.z) > 0);
  const land = findLandColumn(world);
  assert.equal(waterDepthAt(world, land.x, land.z), 0);
});
test("voxel edits are authoritative, recorded as deltas and reversible", () => {
  const world = generateWorld(1337, 3);
  const c = findLandColumn(world);
  const key = chunkKey(worldToChunkX(c.x), worldToChunkZ(c.z));
  const original = getVoxel(world, c.x, c.y - 1, c.z);
  assert.equal(setVoxel(world, c.x, c.y - 1, c.z, MAT.AIR), true);
  assert.equal(getVoxel(world, c.x, c.y - 1, c.z), MAT.AIR);
  assert.equal(world.edits.get(key)?.size, 1);
  assert.ok(world.dirty.has(key));
  assert.ok(surfaceAt(world, c.x, c.z) <= c.y - 1);
  assert.equal(setVoxel(world, c.x, c.y - 1, c.z, MAT.AIR), false, "no-op edits must not be recorded");
  const delta = exportChunkDelta(world, key);
  assert.equal(delta.schema, 1);
  assert.equal(delta.baseVersion, GENERATOR_VERSION);
  assert.equal(delta.edits.length, 1);
  const restored = generateWorld(1337, 3);
  applyChunkDelta(restored, delta);
  assert.equal(getVoxel(restored, c.x, c.y - 1, c.z), MAT.AIR);
  assert.equal(restored.edits.get(key)?.size, 1);
  setVoxel(world, c.x, c.y - 1, c.z, original);
  assert.equal(getVoxel(world, c.x, c.y - 1, c.z), original);
  assert.equal(surfaceAt(world, c.x, c.z), c.y);
});
test("entities sit on the exposed surface, not one metre below it", () => {
  const world = generateWorld(1337, 3);
  assert.ok(world.entities.size > 20);
  for (const e of world.entities.values()) {
    const y = surfaceAt(world, Math.floor(e.x), Math.floor(e.z));
    assert.equal(e.y, y, `${e.id} is not on the surface`);
    assert.equal(e.chunk, chunkKey(worldToChunkX(Math.floor(e.x)), worldToChunkZ(Math.floor(e.z))));
    if (!e.kind.startsWith("styl_") && e.kind !== "waystone" && e.kind !== "marker") {
      assert.fail(`unexpected entity kind ${e.kind}`);
    }
  }
  assert.ok(world.sites.some((s) => s.kind === "waystone"));
  assert.ok(world.sites.some((s) => s.kind === "marker"));
});
test("harvesting is owned by the simulation and depletes the entity", () => {
  const world = generateWorld(1337, 3);
  const tree = [...world.entities.values()].find((e) => e.kind.startsWith("styl_tree") && !e.harvested);
  assert.ok(tree);
  const before = world.inventory.wood ?? 0;
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const result = harvestEntity(world, tree.id);
    assert.ok(result);
    total += result.amount;
    if (i === 0) {
      assert.equal(tree.harvestedOnce, true);
      assert.equal(tree.harvested, false, "one harvest must not deplete a 12-yield tree");
    }
  }
  assert.equal(world.inventory.wood, before + total);
  assert.equal(tree.harvested, true);
  assert.equal(harvestEntity(world, tree.id), null);
  assert.notEqual(nearestHarvestable(world, tree.x, tree.z, 0.1, "wood")?.id, tree.id);
});
test("world manifest pins generator parameters", () => {
  const world = generateWorld(1337, 0);
  const manifest = worldManifest(world);
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.seed, 1337);
  assert.equal(manifest.generatorVersion, GENERATOR_VERSION);
  assert.equal(manifest.size, WORLD_SIZE);
  assert.equal(manifest.chunkSize, CHUNK_SIZE);
  assert.equal(manifest.yMin, Y_MIN);
  assert.equal(manifest.yMax, Y_MAX);
  assert.equal(manifest.seaLevel, SEA_LEVEL);
  assert.match(manifest.paramsHash, /^[0-9a-f]{8}$/);
});
test("simulation layer does not import the renderer or three.js", () => {
  const dir = resolve(process.cwd(), "src/sim");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length > 0);
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    assert.ok(!/from\s+['"]three['"]/.test(text), `${f} imports three`);
    assert.ok(!/from\s+['"][^'"]*\/render\//.test(text), `${f} imports the renderer`);
  }
});
test("chunk-local indexing matches world coordinates", () => {
  const world = generateWorld(1337, 0);
  const chunk = world.chunks.get("32,32");
  for (let lz = 0; lz < CHUNK_SIZE; lz += 7) {
    for (let lx = 0; lx < CHUNK_SIZE; lx += 7) {
      const x = chunkOriginX(32) + lx;
      const z = chunkOriginZ(32) + lz;
      const y = surfaceAt(world, x, z) - 1;
      const idx = localIndex(lx, y - Y_MIN, lz);
      assert.equal(chunk.data[idx], getVoxel(world, x, y, z));
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc2ltLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7IHJlYWRkaXJTeW5jLCByZWFkRmlsZVN5bmMgfSBmcm9tICdub2RlOmZzJztcbmltcG9ydCB7IGpvaW4sIHJlc29sdmUgfSBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHtcbiAgTUFULCBTRUFfTEVWRUwsIFlfTUlOLCBZX01BWCwgV09STERfU0laRSwgQ0hVTktfU0laRSwgR0VORVJBVE9SX1ZFUlNJT04sXG4gIFdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBjcmVhdGVXb3JsZCwgZ2VuZXJhdGVDaHVuaywgZW5zdXJlQ2h1bmssIGdldFZveGVsLCBzZXRWb3hlbCxcbiAgc3VyZmFjZUF0LCBzdXJmYWNlSGVpZ2h0QXQsIHRvcE1hdGVyaWFsQXRXb3JsZCwgd2F0ZXJEZXB0aEF0LCBpc1NvbGlkLFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSwgbmVhcmVzdEhhcnZlc3RhYmxlLCBoYXJ2ZXN0RW50aXR5LFxuICBleHBvcnRDaHVua0RlbHRhLCBhcHBseUNodW5rRGVsdGEsIHdvcmxkTWFuaWZlc3QsIGxvY2FsSW5kZXgsIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLFxufSBmcm9tICcuLi9zcmMvc2ltL3dvcmxkJztcblxuZnVuY3Rpb24gY2hlY2tzdW0oY2h1bms6IHsgZGF0YTogVWludDhBcnJheSB9KTogbnVtYmVyIHtcbiAgbGV0IGggPSAyMTY2MTM2MjYxO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNodW5rLmRhdGEubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IGNodW5rLmRhdGFbaV07XG4gICAgaCA9IE1hdGguaW11bChoLCAxNjc3NzYxOSk7XG4gIH1cbiAgcmV0dXJuIGggPj4+IDA7XG59XG5cbmZ1bmN0aW9uIGZpbmRMYW5kQ29sdW1uKHdvcmxkOiBXb3JsZCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgZm9yIChsZXQgeiA9IC00MDsgeiA8PSA0MDsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IC00MDsgeCA8PSA0MDsgeCsrKSB7XG4gICAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgICAgIGlmICh5IDw9IFNFQV9MRVZFTCArIDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgdG9wID0gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkLCB4LCB6KTtcbiAgICAgIGlmICh0b3AgIT09IE1BVC5HUkFTUyAmJiB0b3AgIT09IE1BVC5NT1NTKSBjb250aW51ZTtcbiAgICAgIGxldCBzb2xpZEJlbG93ID0gMDtcbiAgICAgIGZvciAobGV0IGQgPSAxOyBkIDw9IDU7IGQrKykgaWYgKGlzU29saWQoZ2V0Vm94ZWwod29ybGQsIHgsIHkgLSBkLCB6KSkpIHNvbGlkQmVsb3crKztcbiAgICAgIGlmIChzb2xpZEJlbG93ID09PSA1KSByZXR1cm4geyB4LCB6LCB5IH07XG4gICAgfVxuICB9XG4gIHRocm93IG5ldyBFcnJvcignbm8gc3VpdGFibGUgbGFuZCBjb2x1bW4gZm91bmQnKTtcbn1cblxuZnVuY3Rpb24gZmluZFdhdGVyQ29sdW1uKHdvcmxkOiBXb3JsZCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gIGZvciAobGV0IHogPSAtOTA7IHogPD0gOTA7IHogKz0gMykge1xuICAgIGZvciAobGV0IHggPSAtOTA7IHggPD0gOTA7IHggKz0gMykge1xuICAgICAgaWYgKHN1cmZhY2VBdCh3b3JsZCwgeCwgeikgPCBTRUFfTEVWRUwgJiYgZ2V0Vm94ZWwod29ybGQsIHgsIFNFQV9MRVZFTCAtIDEsIHopID09PSBNQVQuV0FURVIpIHtcbiAgICAgICAgcmV0dXJuIHsgeCwgeiB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoJ25vIHdhdGVyIGNvbHVtbiBmb3VuZCcpO1xufVxuXG50ZXN0KCdkZXRlcm1pbmlzdGljIGdlbmVyYXRpb246IHNhbWUgc2VlZCwgc2FtZSBjaHVua3MsIGVudGl0aWVzIGFuZCBzaXRlcycsICgpID0+IHtcbiAgY29uc3QgYSA9IGdlbmVyYXRlV29ybGQoMTMzNywgMCk7XG4gIGNvbnN0IGIgPSBnZW5lcmF0ZVdvcmxkKDEzMzcsIDApO1xuICBhc3NlcnQuZGVlcEVxdWFsKFsuLi5hLmNodW5rcy5rZXlzKCldLnNvcnQoKSwgWy4uLmIuY2h1bmtzLmtleXMoKV0uc29ydCgpKTtcbiAgZm9yIChjb25zdCBba2V5LCBjaHVua10gb2YgYS5jaHVua3MpIHtcbiAgICBjb25zdCBvdGhlciA9IGIuY2h1bmtzLmdldChrZXkpO1xuICAgIGFzc2VydC5vayhvdGhlciwgYG1pc3NpbmcgY2h1bmsgJHtrZXl9YCk7XG4gICAgYXNzZXJ0LmVxdWFsKGNoZWNrc3VtKGNodW5rKSwgY2hlY2tzdW0ob3RoZXIpLCBgY2h1bmsgJHtrZXl9IGRpZmZlcnNgKTtcbiAgICBhc3NlcnQuZGVlcEVxdWFsKFsuLi5jaHVuay5oZWlnaHRzXSwgWy4uLm90aGVyLmhlaWdodHNdLCBgaGVpZ2h0cyAke2tleX0gZGlmZmVyYCk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChbLi4uYS5lbnRpdGllcy5rZXlzKCldLnNvcnQoKSwgWy4uLmIuZW50aXRpZXMua2V5cygpXS5zb3J0KCkpO1xuICBmb3IgKGNvbnN0IFtpZCwgZV0gb2YgYS5lbnRpdGllcykge1xuICAgIGNvbnN0IG90aGVyID0gYi5lbnRpdGllcy5nZXQoaWQpITtcbiAgICBhc3NlcnQuZGVlcEVxdWFsKFtlLngsIGUueSwgZS56LCBlLmtpbmQsIGUudmFyaWFudF0sIFtvdGhlci54LCBvdGhlci55LCBvdGhlci56LCBvdGhlci5raW5kLCBvdGhlci52YXJpYW50XSk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChhLnNpdGVzLCBiLnNpdGVzKTtcbiAgYXNzZXJ0LmVxdWFsKGEuc3RhdHMudHJlZXMsIGIuc3RhdHMudHJlZXMpO1xuICBhc3NlcnQuZXF1YWwoYS5zdGF0cy5waW5rVHJlZXMsIGIuc3RhdHMucGlua1RyZWVzKTtcbn0pO1xuXG50ZXN0KCdkaWZmZXJlbnQgc2VlZCBjaGFuZ2VzIHRoZSB0ZXJyYWluJywgKCkgPT4ge1xuICBjb25zdCBhID0gZ2VuZXJhdGVXb3JsZCgxMzM3LCAwKTtcbiAgY29uc3QgYiA9IGdlbmVyYXRlV29ybGQoMTMzOCwgMCk7XG4gIGNvbnN0IGtleSA9IFsuLi5hLmNodW5rcy5rZXlzKCldWzBdO1xuICBhc3NlcnQubm90RXF1YWwoY2hlY2tzdW0oYS5jaHVua3MuZ2V0KGtleSkhKSwgY2hlY2tzdW0oYi5jaHVua3MuZ2V0KGtleSkhKSk7XG59KTtcblxudGVzdCgnY2h1bmsgZ2VuZXJhdGlvbiBpcyBpbmRlcGVuZGVudCBvZiBnZW5lcmF0aW9uIG9yZGVyJywgKCkgPT4ge1xuICBjb25zdCBvcmRlckE6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1szMiwgMzJdLCBbMzEsIDMyXSwgWzMyLCAzMV0sIFszMSwgMzFdXTtcbiAgY29uc3Qgb3JkZXJCOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbMzEsIDMxXSwgWzMyLCAzMV0sIFszMSwgMzJdLCBbMzIsIDMyXV07XG4gIGNvbnN0IGEgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgYiA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBmb3IgKGNvbnN0IFtjeCwgY3pdIG9mIG9yZGVyQSkgZ2VuZXJhdGVDaHVuayhhLCBjeCwgY3opO1xuICBmb3IgKGNvbnN0IFtjeCwgY3pdIG9mIG9yZGVyQikgZ2VuZXJhdGVDaHVuayhiLCBjeCwgY3opO1xuICBmb3IgKGNvbnN0IFtrZXksIGNodW5rXSBvZiBhLmNodW5rcykge1xuICAgIGFzc2VydC5lcXVhbChjaGVja3N1bShjaHVuayksIGNoZWNrc3VtKGIuY2h1bmtzLmdldChrZXkpISksIGBjaHVuayAke2tleX0gZGVwZW5kcyBvbiBvcmRlcmApO1xuICB9XG4gIGFzc2VydC5kZWVwRXF1YWwoWy4uLmEuZW50aXRpZXMua2V5cygpXS5zb3J0KCksIFsuLi5iLmVudGl0aWVzLmtleXMoKV0uc29ydCgpKTtcbn0pO1xuXG50ZXN0KCdzdXJmYWNlQXQgaXMgdGhlIGV4cG9zZWQgdG9wIGZhY2UsIG5vdCB0aGUgaGVpZ2h0IG1vZGVsJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoMTMzNywgMyk7XG4gIGNvbnN0IGxhbmQgPSBmaW5kTGFuZENvbHVtbih3b3JsZCk7XG4gIGFzc2VydC5vayhpc1NvbGlkKGdldFZveGVsKHdvcmxkLCBsYW5kLngsIGxhbmQueSAtIDEsIGxhbmQueikpKTtcbiAgYXNzZXJ0Lm9rKCFpc1NvbGlkKGdldFZveGVsKHdvcmxkLCBsYW5kLngsIGxhbmQueSwgbGFuZC56KSkpO1xuICAvLyBBbiBpbnRhY3QgY29sdW1uIG1hdGNoZXMgdGhlIGhlaWdodCBtb2RlbC4gQ2FydmVkIG92ZXJoYW5ncyBhbmQgYWRkZWRcbiAgLy8gbGVkZ2VzIGludGVudGlvbmFsbHkgbWFrZSBvdGhlciBjb2x1bW5zIGRpZmZlcjsgc3VyZmFjZUF0IG11c3QgZm9sbG93IHRoZVxuICAvLyBhY3R1YWwgdm94ZWwgdm9sdW1lLCB3aGljaCBpcyB3aHkgaXQgaXMgbm90IGRlZmluZWQgYXMgc3VyZmFjZUhlaWdodEF0LlxuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KHdvcmxkLCBsYW5kLngsIGxhbmQueiksIHN1cmZhY2VIZWlnaHRBdCh3b3JsZC5zZWVkLCBsYW5kLngsIGxhbmQueikpO1xuICBhc3NlcnQuZXF1YWwoZ2V0Vm94ZWwod29ybGQsIDAsIFlfTUlOIC0gMSwgMCksIE1BVC5CRURST0NLKTtcbiAgYXNzZXJ0LmVxdWFsKGdldFZveGVsKHdvcmxkLCAwLCBZX01BWCwgMCksIE1BVC5BSVIpO1xuICBhc3NlcnQuZXF1YWwoZ2V0Vm94ZWwod29ybGQsIFdPUkxEX1NJWkUsIDAsIDApLCBNQVQuQUlSKTtcbiAgYXNzZXJ0LmVxdWFsKHNldFZveGVsKHdvcmxkLCBXT1JMRF9TSVpFLCAwLCAwLCBNQVQuU1RPTkUpLCBmYWxzZSk7XG59KTtcblxudGVzdCgnbWF0ZXJpYWwgbGF5ZXJzOiBncmFzcyB0b3Agb3ZlciBzb2lsIGFuZCBzdG9uZSwgd2l0aCBubyBhaXIgcG9ja2V0IGJlbG93JywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoMTMzNywgMyk7XG4gIGNvbnN0IGMgPSBmaW5kTGFuZENvbHVtbih3b3JsZCk7XG4gIGFzc2VydC5lcXVhbCh0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIGMueCwgYy56KSwgZ2V0Vm94ZWwod29ybGQsIGMueCwgYy55IC0gMSwgYy56KSk7XG4gIGFzc2VydC5vayhbTUFULkdSQVNTLCBNQVQuTU9TU10uaW5jbHVkZXModG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkLCBjLngsIGMueikpKTtcbiAgY29uc3QgYmVsb3cgPSBnZXRWb3hlbCh3b3JsZCwgYy54LCBjLnkgLSAyLCBjLnopO1xuICBhc3NlcnQub2soW01BVC5TT0lMLCBNQVQuU1RPTkUsIE1BVC5HUkFWRUxdLmluY2x1ZGVzKGJlbG93KSwgYHVuZXhwZWN0ZWQgc3Vic29pbCAke2JlbG93fWApO1xuICBmb3IgKGxldCBkID0gMTsgZCA8PSA1OyBkKyspIGFzc2VydC5vayhpc1NvbGlkKGdldFZveGVsKHdvcmxkLCBjLngsIGMueSAtIGQsIGMueikpKTtcbiAgYXNzZXJ0Lm9rKGlzU29saWQoZ2V0Vm94ZWwod29ybGQsIGMueCwgWV9NSU4sIGMueikpLCAnd29ybGQgZmxvb3IgbXVzdCBiZSBzb2xpZCcpO1xufSk7XG5cbnRlc3QoJ3dhdGVyIGNvbHVtbnMgaG9sZCB3YXRlciBhdCBzZWEgbGV2ZWwgYW5kIHJlcG9ydCBkZXB0aCcsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBnZW5lcmF0ZVdvcmxkKDEzMzcsIDMpO1xuICBjb25zdCB3ID0gZmluZFdhdGVyQ29sdW1uKHdvcmxkKTtcbiAgYXNzZXJ0LmVxdWFsKGdldFZveGVsKHdvcmxkLCB3LngsIFNFQV9MRVZFTCAtIDEsIHcueiksIE1BVC5XQVRFUik7XG4gIGFzc2VydC5vayh3YXRlckRlcHRoQXQod29ybGQsIHcueCwgdy56KSA+IDApO1xuICBjb25zdCBsYW5kID0gZmluZExhbmRDb2x1bW4od29ybGQpO1xuICBhc3NlcnQuZXF1YWwod2F0ZXJEZXB0aEF0KHdvcmxkLCBsYW5kLngsIGxhbmQueiksIDApO1xufSk7XG5cbnRlc3QoJ3ZveGVsIGVkaXRzIGFyZSBhdXRob3JpdGF0aXZlLCByZWNvcmRlZCBhcyBkZWx0YXMgYW5kIHJldmVyc2libGUnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gZ2VuZXJhdGVXb3JsZCgxMzM3LCAzKTtcbiAgY29uc3QgYyA9IGZpbmRMYW5kQ29sdW1uKHdvcmxkKTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWChjLngpLCB3b3JsZFRvQ2h1bmtaKGMueikpO1xuICBjb25zdCBvcmlnaW5hbCA9IGdldFZveGVsKHdvcmxkLCBjLngsIGMueSAtIDEsIGMueik7XG4gIGFzc2VydC5lcXVhbChzZXRWb3hlbCh3b3JsZCwgYy54LCBjLnkgLSAxLCBjLnosIE1BVC5BSVIpLCB0cnVlKTtcbiAgYXNzZXJ0LmVxdWFsKGdldFZveGVsKHdvcmxkLCBjLngsIGMueSAtIDEsIGMueiksIE1BVC5BSVIpO1xuICBhc3NlcnQuZXF1YWwod29ybGQuZWRpdHMuZ2V0KGtleSk/LnNpemUsIDEpO1xuICBhc3NlcnQub2sod29ybGQuZGlydHkuaGFzKGtleSkpO1xuICBhc3NlcnQub2soc3VyZmFjZUF0KHdvcmxkLCBjLngsIGMueikgPD0gYy55IC0gMSk7XG4gIGFzc2VydC5lcXVhbChzZXRWb3hlbCh3b3JsZCwgYy54LCBjLnkgLSAxLCBjLnosIE1BVC5BSVIpLCBmYWxzZSwgJ25vLW9wIGVkaXRzIG11c3Qgbm90IGJlIHJlY29yZGVkJyk7XG5cbiAgY29uc3QgZGVsdGEgPSBleHBvcnRDaHVua0RlbHRhKHdvcmxkLCBrZXkpO1xuICBhc3NlcnQuZXF1YWwoZGVsdGEuc2NoZW1hLCAxKTtcbiAgYXNzZXJ0LmVxdWFsKGRlbHRhLmJhc2VWZXJzaW9uLCBHRU5FUkFUT1JfVkVSU0lPTik7XG4gIGFzc2VydC5lcXVhbChkZWx0YS5lZGl0cy5sZW5ndGgsIDEpO1xuXG4gIGNvbnN0IHJlc3RvcmVkID0gZ2VuZXJhdGVXb3JsZCgxMzM3LCAzKTtcbiAgYXBwbHlDaHVua0RlbHRhKHJlc3RvcmVkLCBkZWx0YSk7XG4gIGFzc2VydC5lcXVhbChnZXRWb3hlbChyZXN0b3JlZCwgYy54LCBjLnkgLSAxLCBjLnopLCBNQVQuQUlSKTtcbiAgYXNzZXJ0LmVxdWFsKHJlc3RvcmVkLmVkaXRzLmdldChrZXkpPy5zaXplLCAxKTtcblxuICBzZXRWb3hlbCh3b3JsZCwgYy54LCBjLnkgLSAxLCBjLnosIG9yaWdpbmFsKTtcbiAgYXNzZXJ0LmVxdWFsKGdldFZveGVsKHdvcmxkLCBjLngsIGMueSAtIDEsIGMueiksIG9yaWdpbmFsKTtcbiAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VBdCh3b3JsZCwgYy54LCBjLnopLCBjLnkpO1xufSk7XG5cbnRlc3QoJ2VudGl0aWVzIHNpdCBvbiB0aGUgZXhwb3NlZCBzdXJmYWNlLCBub3Qgb25lIG1ldHJlIGJlbG93IGl0JywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoMTMzNywgMyk7XG4gIGFzc2VydC5vayh3b3JsZC5lbnRpdGllcy5zaXplID4gMjApO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBNYXRoLmZsb29yKGUueCksIE1hdGguZmxvb3IoZS56KSk7XG4gICAgYXNzZXJ0LmVxdWFsKGUueSwgeSwgYCR7ZS5pZH0gaXMgbm90IG9uIHRoZSBzdXJmYWNlYCk7XG4gICAgYXNzZXJ0LmVxdWFsKGUuY2h1bmssIGNodW5rS2V5KHdvcmxkVG9DaHVua1goTWF0aC5mbG9vcihlLngpKSwgd29ybGRUb0NodW5rWihNYXRoLmZsb29yKGUueikpKSk7XG4gICAgaWYgKCFlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF8nKSAmJiBlLmtpbmQgIT09ICd3YXlzdG9uZScgJiYgZS5raW5kICE9PSAnbWFya2VyJykge1xuICAgICAgYXNzZXJ0LmZhaWwoYHVuZXhwZWN0ZWQgZW50aXR5IGtpbmQgJHtlLmtpbmR9YCk7XG4gICAgfVxuICB9XG4gIGFzc2VydC5vayh3b3JsZC5zaXRlcy5zb21lKChzKSA9PiBzLmtpbmQgPT09ICd3YXlzdG9uZScpKTtcbiAgYXNzZXJ0Lm9rKHdvcmxkLnNpdGVzLnNvbWUoKHMpID0+IHMua2luZCA9PT0gJ21hcmtlcicpKTtcbn0pO1xuXG50ZXN0KCdoYXJ2ZXN0aW5nIGlzIG93bmVkIGJ5IHRoZSBzaW11bGF0aW9uIGFuZCBkZXBsZXRlcyB0aGUgZW50aXR5JywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoMTMzNywgMyk7XG4gIGNvbnN0IHRyZWUgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLmZpbmQoKGUpID0+IGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSAmJiAhZS5oYXJ2ZXN0ZWQpO1xuICBhc3NlcnQub2sodHJlZSk7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmludmVudG9yeS53b29kID8/IDA7XG4gIGxldCB0b3RhbCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gaGFydmVzdEVudGl0eSh3b3JsZCwgdHJlZSEuaWQpO1xuICAgIGFzc2VydC5vayhyZXN1bHQpO1xuICAgIHRvdGFsICs9IHJlc3VsdC5hbW91bnQ7XG4gICAgaWYgKGkgPT09IDApIHtcbiAgICAgIGFzc2VydC5lcXVhbCh0cmVlIS5oYXJ2ZXN0ZWRPbmNlLCB0cnVlKTtcbiAgICAgIGFzc2VydC5lcXVhbCh0cmVlIS5oYXJ2ZXN0ZWQsIGZhbHNlLCAnb25lIGhhcnZlc3QgbXVzdCBub3QgZGVwbGV0ZSBhIDEyLXlpZWxkIHRyZWUnKTtcbiAgICB9XG4gIH1cbiAgYXNzZXJ0LmVxdWFsKHdvcmxkLmludmVudG9yeS53b29kLCBiZWZvcmUgKyB0b3RhbCk7XG4gIGFzc2VydC5lcXVhbCh0cmVlIS5oYXJ2ZXN0ZWQsIHRydWUpO1xuICBhc3NlcnQuZXF1YWwoaGFydmVzdEVudGl0eSh3b3JsZCwgdHJlZSEuaWQpLCBudWxsKTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKG5lYXJlc3RIYXJ2ZXN0YWJsZSh3b3JsZCwgdHJlZSEueCwgdHJlZSEueiwgMC4xLCAnd29vZCcpPy5pZCwgdHJlZSEuaWQpO1xufSk7XG5cbnRlc3QoJ3dvcmxkIG1hbmlmZXN0IHBpbnMgZ2VuZXJhdG9yIHBhcmFtZXRlcnMnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gZ2VuZXJhdGVXb3JsZCgxMzM3LCAwKTtcbiAgY29uc3QgbWFuaWZlc3QgPSB3b3JsZE1hbmlmZXN0KHdvcmxkKTtcbiAgYXNzZXJ0LmVxdWFsKG1hbmlmZXN0LnNjaGVtYSwgMSk7XG4gIGFzc2VydC5lcXVhbChtYW5pZmVzdC5zZWVkLCAxMzM3KTtcbiAgYXNzZXJ0LmVxdWFsKG1hbmlmZXN0LmdlbmVyYXRvclZlcnNpb24sIEdFTkVSQVRPUl9WRVJTSU9OKTtcbiAgYXNzZXJ0LmVxdWFsKG1hbmlmZXN0LnNpemUsIFdPUkxEX1NJWkUpO1xuICBhc3NlcnQuZXF1YWwobWFuaWZlc3QuY2h1bmtTaXplLCBDSFVOS19TSVpFKTtcbiAgYXNzZXJ0LmVxdWFsKG1hbmlmZXN0LnlNaW4sIFlfTUlOKTtcbiAgYXNzZXJ0LmVxdWFsKG1hbmlmZXN0LnlNYXgsIFlfTUFYKTtcbiAgYXNzZXJ0LmVxdWFsKG1hbmlmZXN0LnNlYUxldmVsLCBTRUFfTEVWRUwpO1xuICBhc3NlcnQubWF0Y2gobWFuaWZlc3QucGFyYW1zSGFzaCwgL15bMC05YS1mXXs4fSQvKTtcbn0pO1xuXG50ZXN0KCdzaW11bGF0aW9uIGxheWVyIGRvZXMgbm90IGltcG9ydCB0aGUgcmVuZGVyZXIgb3IgdGhyZWUuanMnLCAoKSA9PiB7XG4gIGNvbnN0IGRpciA9IHJlc29sdmUocHJvY2Vzcy5jd2QoKSwgJ3NyYy9zaW0nKTtcbiAgY29uc3QgZmlsZXMgPSByZWFkZGlyU3luYyhkaXIpLmZpbHRlcigoZikgPT4gZi5lbmRzV2l0aCgnLnRzJykpO1xuICBhc3NlcnQub2soZmlsZXMubGVuZ3RoID4gMCk7XG4gIGZvciAoY29uc3QgZiBvZiBmaWxlcykge1xuICAgIGNvbnN0IHRleHQgPSByZWFkRmlsZVN5bmMoam9pbihkaXIsIGYpLCAndXRmOCcpO1xuICAgIGFzc2VydC5vayghL2Zyb21cXHMrWydcIl10aHJlZVsnXCJdLy50ZXN0KHRleHQpLCBgJHtmfSBpbXBvcnRzIHRocmVlYCk7XG4gICAgYXNzZXJ0Lm9rKCEvZnJvbVxccytbJ1wiXVteJ1wiXSpcXC9yZW5kZXJcXC8vLnRlc3QodGV4dCksIGAke2Z9IGltcG9ydHMgdGhlIHJlbmRlcmVyYCk7XG4gIH1cbn0pO1xuXG50ZXN0KCdjaHVuay1sb2NhbCBpbmRleGluZyBtYXRjaGVzIHdvcmxkIGNvb3JkaW5hdGVzJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoMTMzNywgMCk7XG4gIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldCgnMzIsMzInKSE7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseiArPSA3KSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4ICs9IDcpIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoMzIpICsgbHg7XG4gICAgICBjb25zdCB6ID0gY2h1bmtPcmlnaW5aKDMyKSArIGx6O1xuICAgICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeikgLSAxO1xuICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChseCwgeSAtIFlfTUlOLCBseik7XG4gICAgICBhc3NlcnQuZXF1YWwoY2h1bmsuZGF0YVtpZHhdLCBnZXRWb3hlbCh3b3JsZCwgeCwgeSwgeikpO1xuICAgIH1cbiAgfVxufSk7XG4iLCAiLy8gUHJpdmF0ZSBtaWdyYXRpb24gcmVwbGF5IG9ubHkuIFJldGlyZWQgZW50aXRpZXMgbGl2ZSBpbiB0aGlzIFdvcmxkIHdoaWxlIGFuXG4vLyBhY2NlcHRlZCBoaXN0b3JpY2FsIGpvdXJuYWwgaXMgY2hlY2tlZDsgbm8gcHVibGljIGNvbW1hbmQgZW5hYmxlcyB0aGlzIG1vZGUuXG5pbnRlcmZhY2UgUmVwbGF5U3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIGhpc3RvcmljYWxIYXNoOiBib29sZWFuO1xuICBtaWdyYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGVzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBSZXBsYXlTdGF0ZT4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheVN0b25lU3RhdGUod29ybGQ6IG9iamVjdCk6IFJlcGxheVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gc3RhdGVzLmdldCh3b3JsZCk7XG4gIGlmICghc3RhdGUpIHsgc3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIGhpc3RvcmljYWxIYXNoOiBmYWxzZSwgbWlncmF0ZWQ6IGZhbHNlIH07IHN0YXRlcy5zZXQod29ybGQsIHN0YXRlKTsgfVxuICByZXR1cm4gc3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbiAgc3RhdGUubWlncmF0ZWQgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/LmFjdGl2ZSA/PyBmYWxzZTtcbn1cblxuLyoqIFNuYXBzaG90IGhhc2hlcyBiZWZvcmUgYW5kIGR1cmluZyB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheSBpbmNsdWRlIHN0b25lcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5oaXN0b3JpY2FsSGFzaCA/PyBmYWxzZTtcbn1cblxuLyoqIEEgbWlncmF0ZWQgc25hcHNob3QgYWxyZWFkeSBoYXMgcmV0aXJlbWVudCB0b21ic3RvbmVzIGluIGdlbmVyYXRlZCBjaHVua3MuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5taWdyYXRlZCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lm1pZ3JhdGVkID8/IGZhbHNlO1xufVxuXG4vKiogRXhpdCBoaXN0b3JpY2FsIG1vZGUgYWZ0ZXIgYWxsIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBoYXNoZXMgaGF2ZSBwYXNzZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluaXNoU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSBmYWxzZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSBmYWxzZTtcbiAgc3RhdGUubWlncmF0ZWQgPSB0cnVlO1xufVxuIiwgIi8vIERldGVybWluaXN0aWMgaGFzaCwgbm9pc2UgYW5kIG1hdGggaGVscGVycyBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIuXG4vLyBQdXJlIFR5cGVTY3JpcHQgKEQtMDA1KS4gRXh0cmFjdGVkIGZyb20gd29ybGQudHMgdW5jaGFuZ2VkIHNvIHRlcnJhaW5cbi8vIGdlbmVyYXRvcnMgb2YgZXZlcnkgdmVyc2lvbiB1c2UgaWRlbnRpY2FsIHByaW1pdGl2ZXMuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuZXhwb3J0IGNvbnN0IHNtb290aHN0ZXAgPSAoZTA6IG51bWJlciwgZTE6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IHQgPSBjbGFtcCgoeCAtIGUwKSAvIChlMSAtIGUwKSwgMCwgMSk7XG4gIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xufTtcblxuLy8gLS0tLS0tLS0tLSBkZXRlcm1pbmlzdGljIGhhc2ggLyBub2lzZSAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gaGFzaDJpKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoM2koeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKSBeIE1hdGguaW11bCh6LCAyMjQ2ODIyNTE5KTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsYmVycnkzMihzZWVkOiBudW1iZXIpOiAoKSA9PiBudW1iZXIge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgYSA9IChhICsgMHg2ZDJiNzlmNSkgPj4+IDA7XG4gICAgbGV0IHQgPSBhO1xuICAgIHQgPSBNYXRoLmltdWwodCBeICh0ID4+PiAxNSksIHQgfCAxKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IHNtb290aCA9ICh0OiBudW1iZXIpID0+IHQgKiB0ICogKDMgLSAyICogdCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KSwgemkgPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpLCB6ZiA9IHNtb290aCh6IC0gemkpO1xuICBjb25zdCBjMDAwID0gaGFzaDNpKHhpLCB5aSwgemksIHNlZWQpLCBjMTAwID0gaGFzaDNpKHhpICsgMSwgeWksIHppLCBzZWVkKTtcbiAgY29uc3QgYzAxMCA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSwgc2VlZCksIGMxMTAgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppLCBzZWVkKTtcbiAgY29uc3QgYzAwMSA9IGhhc2gzaSh4aSwgeWksIHppICsgMSwgc2VlZCksIGMxMDEgPSBoYXNoM2koeGkgKyAxLCB5aSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgYzAxMSA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpLCBjMTExID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCB4MDAgPSBjMDAwICsgKGMxMDAgLSBjMDAwKSAqIHhmO1xuICBjb25zdCB4MTAgPSBjMDEwICsgKGMxMTAgLSBjMDEwKSAqIHhmO1xuICBjb25zdCB4MDEgPSBjMDAxICsgKGMxMDEgLSBjMDAxKSAqIHhmO1xuICBjb25zdCB4MTEgPSBjMDExICsgKGMxMTEgLSBjMDExKSAqIHhmO1xuICBjb25zdCB5MCA9IHgwMCArICh4MTAgLSB4MDApICogeWY7XG4gIGNvbnN0IHkxID0geDAxICsgKHgxMSAtIHgwMSkgKiB5ZjtcbiAgcmV0dXJuIHkwICsgKHkxIC0geTApICogemY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0zKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTMoeCAqIGZyZXEsIHkgKiBmcmVxLCB6ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuIiwgIi8vIEh5ZHJvbG9neSBcdTIwMTQgdGhlIGRldGVybWluaXN0aWMgd2F0ZXIgbmV0d29yayBvZiBhIHdvcmxkIChwdXJlIFR5cGVTY3JpcHQsIEQtMDA1KS5cbi8vXG4vLyBUaGlzIGlzIGRlcml2ZWQgKnNpbXVsYXRpb24gZGF0YSosIG5vdCBwcmVzZW50YXRpb246IGl0IGlzIGEgcHVyZSBmdW5jdGlvbiBvZlxuLy8gKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKSBhbmQgaXMgd2hhdCB0ZXJyYWluIGNhcnZpbmcsIHdhdGVyIGZpbGxpbmcsIGZsb3dcbi8vIGRpcmVjdGlvbiBhbmQgZnV0dXJlIGZpc2hpbmcvaXJyaWdhdGlvbi9mbG9vZGluZyBydWxlcyByZWFkLiBJdCBpcyBuZXZlclxuLy8gam91cm5hbGVkIGJlY2F1c2UgaXQgY2FuIGFsd2F5cyBiZSByZWdlbmVyYXRlZCBleGFjdGx5LlxuLy9cbi8vIE5ldHdvcmsgKGJvdGggZ2VuZXJhdG9yIHZlcnNpb25zKTpcbi8vICAgbGFrZSAgXHUyMDE0IHRoZSB2YWxsZXkgbGFrZSBiYXNpbiwgbG9jYXRlZCBmcm9tIHRoZSBhY3R1YWwgZ2VuZXJhdGVkIHRlcnJhaW4uXG4vLyAgIGxvd2VyIFx1MjAxNCB0aGUgbG93bGFuZCByaXZlciBmcm9tIHRoZSBsYWtlIHRvIHRoZSBzb3V0aGVybiBzZWEsIHRyYWNlZCBmcm9tXG4vLyAgICAgICAgICAgdGhlIGFjdHVhbCBjYXJ2ZWQgY2hhbm5lbCAodGhlIHYxIGNoYW5uZWwgaXMgY2FydmVkIG9uICp3YXJwZWQqXG4vLyAgICAgICAgICAgY29vcmRpbmF0ZXMsIHNvIGByaXZlckNlbnRlclhgIGFsb25lIGlzIHVwIHRvIH4xMzUgbSBvZmYpLlxuLy8gR2VuZXJhdG9yIHYyIGFkZHM6XG4vLyAgIHVwcGVyIFx1MjAxNCBhIG1vdW50YWluIHJpdmVyIGZyb20gYSBoaWdobGFuZCB0YXJuIGRvd24gdG8gdGhlIGxha2UsIHdpdGggYVxuLy8gICAgICAgICAgIHdhdGVyLXN1cmZhY2UgbGV2ZWwgdGhhdCBuZXZlciByaXNlcyBkb3duc3RyZWFtLCBjYXNjYWRlcyBhbmQgZmFsbHMuXG4vL1xuLy8gRmxvdyBhbHdheXMgcG9pbnRzIGRvd25zdHJlYW06IHVwcGVyIFx1MjE5MiBsYWtlIFx1MjE5MiBsb3dlciBcdTIxOTIgc2VhLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIG11bGJlcnJ5MzIsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcblxuZXhwb3J0IHR5cGUgSGVpZ2h0U2FtcGxlciA9ICh4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJpdmVyUG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQgb2YgdGhpcyByZWFjaCAobWV0cmVzKS4gKi9cbiAgczogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBlbGV2YXRpb24gKG1ldHJlcywgbWF5IGJlIGZyYWN0aW9uYWwpLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogQ2hhbm5lbCBoYWxmLXdpZHRoIChtZXRyZXMpLiAqL1xuICB3aWR0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWNoSGl0IHtcbiAgLyoqIEhvcml6b250YWwgZGlzdGFuY2UgZnJvbSB0aGUgY2VudHJlbGluZS4gKi9cbiAgZDogbnVtYmVyO1xuICAvKiogSW50ZXJwb2xhdGVkIHdhdGVyIGxldmVsIGF0IHRoZSBuZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIHdpZHRoOiBudW1iZXI7XG4gIC8qKiBVbml0IGRvd25zdHJlYW0gZGlyZWN0aW9uLiAqL1xuICB0eDogbnVtYmVyO1xuICB0ejogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBkcm9wIHBlciBtZXRyZSBhbG9uZyB0aGUgY2hhbm5lbCAoPj0gMCkuICovXG4gIGdyYWRpZW50OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIG9mIHRoZSBuZWFyZXN0IHBvaW50IGZyb20gdGhlIGRvd25zdHJlYW0gZW5kLiAqL1xuICBzOiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBwb2x5bGluZSByZWFjaCBzdG9yZWQgZG93bnN0cmVhbS1maXJzdC4gTmVhcmVzdC1zZWdtZW50IHF1ZXJpZXMgdXNlIGFcbiAqIHVuaWZvcm0gZ3JpZCB3aG9zZSBjZWxscyBsaXN0IGV2ZXJ5IHNlZ21lbnQgd2l0aGluIGByZWFjaGAgbWV0cmVzLlxuICovXG5leHBvcnQgY2xhc3MgUml2ZXJSZWFjaCB7XG4gIHJlYWRvbmx5IHBvaW50czogUml2ZXJQb2ludFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IGNlbGwgPSAzMjtcbiAgcHJpdmF0ZSByZWFkb25seSBncmlkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXG4gIGNvbnN0cnVjdG9yKHBvaW50czogUml2ZXJQb2ludFtdLCByZWFkb25seSByZWFjaDogbnVtYmVyKSB7XG4gICAgdGhpcy5wb2ludHMgPSBwb2ludHM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgKyAxIDwgcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhID0gcG9pbnRzW2ldLCBiID0gcG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IHgwID0gTWF0aC5taW4oYS54LCBiLngpIC0gcmVhY2gsIHgxID0gTWF0aC5tYXgoYS54LCBiLngpICsgcmVhY2g7XG4gICAgICBjb25zdCB6MCA9IE1hdGgubWluKGEueiwgYi56KSAtIHJlYWNoLCB6MSA9IE1hdGgubWF4KGEueiwgYi56KSArIHJlYWNoO1xuICAgICAgZm9yIChsZXQgY3ogPSBNYXRoLmZsb29yKHowIC8gdGhpcy5jZWxsKTsgY3ogPD0gTWF0aC5mbG9vcih6MSAvIHRoaXMuY2VsbCk7IGN6KyspIHtcbiAgICAgICAgZm9yIChsZXQgY3ggPSBNYXRoLmZsb29yKHgwIC8gdGhpcy5jZWxsKTsgY3ggPD0gTWF0aC5mbG9vcih4MSAvIHRoaXMuY2VsbCk7IGN4KyspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBjZWxsS2V5KGN4LCBjeik7XG4gICAgICAgICAgbGV0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGtleSk7XG4gICAgICAgICAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgdGhpcy5ncmlkLnNldChrZXksIGxpc3QpOyB9XG4gICAgICAgICAgbGlzdC5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wb2ludHNbdGhpcy5wb2ludHMubGVuZ3RoIC0gMV0/LnMgPz8gMDsgfVxuXG4gIC8qKiBOZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQgd2l0aGluIGByZWFjaGAsIG9yIG51bGwuICovXG4gIG5lYXJlc3QoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBSZWFjaEhpdCB8IG51bGwge1xuICAgIGNvbnN0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGNlbGxLZXkoTWF0aC5mbG9vcih4IC8gdGhpcy5jZWxsKSwgTWF0aC5mbG9vcih6IC8gdGhpcy5jZWxsKSkpO1xuICAgIGlmICghbGlzdCkgcmV0dXJuIG51bGw7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYmkgPSAtMSwgYnQgPSAwO1xuICAgIGZvciAoY29uc3QgaSBvZiBsaXN0KSB7XG4gICAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbaV0sIGIgPSB0aGlzLnBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCBkeCA9IGIueCAtIGEueCwgZHogPSBiLnogLSBhLno7XG4gICAgICBjb25zdCBsZW4yID0gZHggKiBkeCArIGR6ICogZHogfHwgMTtcbiAgICAgIGNvbnN0IHQgPSBjbGFtcCgoKHggLSBhLngpICogZHggKyAoeiAtIGEueikgKiBkeikgLyBsZW4yLCAwLCAxKTtcbiAgICAgIGNvbnN0IHB4ID0gYS54ICsgZHggKiB0LCBweiA9IGEueiArIGR6ICogdDtcbiAgICAgIGNvbnN0IGQyID0gKHggLSBweCkgKiogMiArICh6IC0gcHopICoqIDI7XG4gICAgICBpZiAoZDIgPCBiZXN0KSB7IGJlc3QgPSBkMjsgYmkgPSBpOyBidCA9IHQ7IH1cbiAgICB9XG4gICAgaWYgKGJpIDwgMCB8fCBiZXN0ID4gdGhpcy5yZWFjaCAqIHRoaXMucmVhY2gpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tiaV0sIGIgPSB0aGlzLnBvaW50c1tiaSArIDFdO1xuICAgIGNvbnN0IHNlZ0xlbiA9IE1hdGgubWF4KDFlLTYsIGIucyAtIGEucyk7XG4gICAgLy8gUG9pbnRzIGFyZSBzdG9yZWQgZG93bnN0cmVhbS1maXJzdCwgc28gZG93bnN0cmVhbSBpcyBhIDwtIGIuXG4gICAgY29uc3QgdHggPSAoYS54IC0gYi54KSAvIHNlZ0xlbiwgdHogPSAoYS56IC0gYi56KSAvIHNlZ0xlbjtcbiAgICByZXR1cm4ge1xuICAgICAgZDogTWF0aC5zcXJ0KGJlc3QpLFxuICAgICAgbGV2ZWw6IGEubGV2ZWwgKyAoYi5sZXZlbCAtIGEubGV2ZWwpICogYnQsXG4gICAgICB3aWR0aDogYS53aWR0aCArIChiLndpZHRoIC0gYS53aWR0aCkgKiBidCxcbiAgICAgIHR4LCB0eixcbiAgICAgIGdyYWRpZW50OiBNYXRoLm1heCgwLCAoYi5sZXZlbCAtIGEubGV2ZWwpIC8gc2VnTGVuKSxcbiAgICAgIHM6IGEucyArIChiLnMgLSBhLnMpICogYnQsXG4gICAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjZWxsS2V5KGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKGN4ICsgNDA5NikgKiA4MTkyICsgKGN6ICsgNDA5Nik7XG59XG5cbmV4cG9ydCB0eXBlIFdhdGVyQm9keSA9ICdyaXZlcicgfCAnbGFrZScgfCAnc2VhJyB8ICdub25lJztcblxuZXhwb3J0IGludGVyZmFjZSBGbG93U2FtcGxlIHtcbiAgYm9keTogV2F0ZXJCb2R5O1xuICAvKiogVW5pdCBmbG93IGRpcmVjdGlvbiAoemVybyBmb3Igc3RpbGwgd2F0ZXIpLiAqL1xuICBkeDogbnVtYmVyO1xuICBkejogbnVtYmVyO1xuICAvKiogU3VyZmFjZSBjdXJyZW50IHNwZWVkIGluIG0vcy4gKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIeWRyb2xvZ3lPcHRpb25zIHtcbiAgc2VlZDogbnVtYmVyO1xuICAvKiogR2VuZXJhdG9yIHZlcnNpb24gdGhlIG5ldHdvcmsgYmVsb25ncyB0by4gKi9cbiAgdmVyc2lvbjogbnVtYmVyO1xuICAvKiogQmFzZSBoZWlnaHQgb2YgdGhlICp1bm1vZGlmaWVkIHYxIHNoYXBlKiAodXNlZCB0byBsb2NhdGUgbGFrZS9jaGFubmVsKS4gKi9cbiAgdjFIZWlnaHQ6IEhlaWdodFNhbXBsZXI7XG59XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9naWNhbCBuZXR3b3JrIGZvciBvbmUgKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKS4gKi9cbmV4cG9ydCBjbGFzcyBIeWRyb2xvZ3kge1xuICByZWFkb25seSBzZWVkOiBudW1iZXI7XG4gIHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcbiAgcmVhZG9ubHkgbGFrZTogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcng6IG51bWJlcjsgcno6IG51bWJlciB9O1xuICByZWFkb25seSBsb3dlcjogUml2ZXJSZWFjaDtcbiAgcmVhZG9ubHkgdXBwZXI6IFJpdmVyUmVhY2ggfCBudWxsO1xuICAvKiogVXBwZXItcml2ZXIgc291cmNlIHRhcm4gKHYyIG9ubHkpLiAqL1xuICByZWFkb25seSB0YXJuOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByOiBudW1iZXI7IGxldmVsOiBudW1iZXIgfSB8IG51bGw7XG5cbiAgY29uc3RydWN0b3Iob3B0czogSHlkcm9sb2d5T3B0aW9ucykge1xuICAgIHRoaXMuc2VlZCA9IG9wdHMuc2VlZDtcbiAgICB0aGlzLnZlcnNpb24gPSBvcHRzLnZlcnNpb247XG4gICAgdGhpcy5sYWtlID0gbG9jYXRlTGFrZShvcHRzLnYxSGVpZ2h0KTtcbiAgICB0aGlzLmxvd2VyID0gdHJhY2VMb3dlclJpdmVyKG9wdHMudjFIZWlnaHQsIHRoaXMubGFrZSk7XG4gICAgaWYgKG9wdHMudmVyc2lvbiA+PSAyKSB7XG4gICAgICBjb25zdCB1cHBlciA9IGF1dGhvclVwcGVyUml2ZXIob3B0cy5zZWVkLCB0aGlzLmxha2UpO1xuICAgICAgdGhpcy51cHBlciA9IHVwcGVyLnJlYWNoO1xuICAgICAgdGhpcy50YXJuID0gdXBwZXIudGFybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51cHBlciA9IG51bGw7XG4gICAgICB0aGlzLnRhcm4gPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdXJmYWNlIGN1cnJlbnQgZm9yIGEgd2F0ZXIgY29sdW1uLiBgbGV2ZWxgIGlzIHRoZSBjb2x1bW4ncyB3YXRlciBzdXJmYWNlLFxuICAgKiB1c2VkIHRvIHRlbGwgc2VhLWxldmVsIHdhdGVyIChsYWtlLCBsb3dlciByaXZlciwgc2VhKSBmcm9tIHRoZSB1cHBlciByaXZlci5cbiAgICovXG4gIGZsb3dBdCh4OiBudW1iZXIsIHo6IG51bWJlciwgbGV2ZWw6IG51bWJlcik6IEZsb3dTYW1wbGUge1xuICAgIGlmICh0aGlzLnVwcGVyICYmIGxldmVsID4gMC41KSB7XG4gICAgICBjb25zdCBoaXQgPSB0aGlzLnVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDw9IGhpdC53aWR0aCArIDIpIHtcbiAgICAgICAgY29uc3Qgc3BlZWQgPSBjbGFtcCgwLjU1ICsgaGl0LmdyYWRpZW50ICogOSwgMC40LCA0LjUpO1xuICAgICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogaGl0LnR4LCBkejogaGl0LnR6LCBzcGVlZCB9O1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMudGFybiAmJiBNYXRoLmh5cG90KHggLSB0aGlzLnRhcm4ueCwgeiAtIHRoaXMudGFybi56KSA8IHRoaXMudGFybi5yICsgNCkge1xuICAgICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLnRvd2FyZHMoeCwgeiwgdGhpcy51cHBlclNvdXJjZSgpLCAwLjA2KSB9O1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBsb3cgPSB0aGlzLmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8PSBsb3cud2lkdGggKyA2KSB7XG4gICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogbG93LnR4LCBkejogbG93LnR6LCBzcGVlZDogMC4zNSArIDAuMjUgKiBzbW9vdGhzdGVwKGxvdy53aWR0aCArIDYsIDAsIGxvdy5kKSB9O1xuICAgIH1cbiAgICBjb25zdCBsZCA9IE1hdGguaHlwb3QoKHggLSB0aGlzLmxha2UueCkgLyB0aGlzLmxha2UucngsICh6IC0gdGhpcy5sYWtlLnopIC8gdGhpcy5sYWtlLnJ6KTtcbiAgICBpZiAobGQgPCAxLjM1KSB7XG4gICAgICAvLyBTbG93IGRyaWZ0IGZyb20gdGhlIGluZmxvdyB0b3dhcmQgdGhlIG91dGZsb3cgYXQgdGhlIGhlYWQgb2YgdGhlIGxvd2VyIHJpdmVyLlxuICAgICAgY29uc3QgaGVhZCA9IHRoaXMubG93ZXIucG9pbnRzW3RoaXMubG93ZXIucG9pbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZHJpZnQgPSB0b3dhcmRzKHgsIHosIGhlYWQsIDAuMDgpO1xuICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi5kcmlmdCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBib2R5OiAnc2VhJywgZHg6IDAsIGR6OiAwLCBzcGVlZDogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSB1cHBlclNvdXJjZSgpOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHB0cyA9IHRoaXMudXBwZXIhLnBvaW50cztcbiAgICByZXR1cm4gcHRzW3B0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b3dhcmRzKHg6IG51bWJlciwgejogbnVtYmVyLCBwOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0sIHNwZWVkOiBudW1iZXIpIHtcbiAgY29uc3QgZHggPSBwLnggLSB4LCBkeiA9IHAueiAtIHo7XG4gIGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICByZXR1cm4geyBkeDogZHggLyBsZW4sIGR6OiBkeiAvIGxlbiwgc3BlZWQgfTtcbn1cblxuLyoqIEZpbmQgdGhlIHZhbGxleSBsYWtlIGZyb20gdGhlIHRlcnJhaW4gaXRzZWxmOiB0aGUgZGVlcCBiYXNpbiBOVyBvZiB0aGUgZm91bmRlciB2YWxsZXkuICovXG5mdW5jdGlvbiBsb2NhdGVMYWtlKGg6IEhlaWdodFNhbXBsZXIpOiBIeWRyb2xvZ3lbJ2xha2UnXSB7XG4gIGxldCBzeCA9IDAsIHN6ID0gMCwgbiA9IDAsIG1pblggPSBJbmZpbml0eSwgbWF4WCA9IC1JbmZpbml0eSwgbWluWiA9IEluZmluaXR5LCBtYXhaID0gLUluZmluaXR5O1xuICBmb3IgKGxldCB6ID0gLTQ2MDsgeiA8PSAtMTIwOyB6ICs9IDQpIHtcbiAgICBmb3IgKGxldCB4ID0gLTQ4MDsgeCA8PSAtNDA7IHggKz0gNCkge1xuICAgICAgaWYgKGgoeCwgeikgPiAtNCkgY29udGludWU7XG4gICAgICBzeCArPSB4OyBzeiArPSB6OyBuKys7XG4gICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgeCk7IG1heFggPSBNYXRoLm1heChtYXhYLCB4KTtcbiAgICAgIG1pblogPSBNYXRoLm1pbihtaW5aLCB6KTsgbWF4WiA9IE1hdGgubWF4KG1heFosIHopO1xuICAgIH1cbiAgfVxuICBpZiAobiA9PT0gMCkgcmV0dXJuIHsgeDogLTI2MCwgejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH07XG4gIHJldHVybiB7XG4gICAgeDogc3ggLyBuLCB6OiBzeiAvIG4sXG4gICAgcng6IE1hdGgubWF4KDMwLCAobWF4WCAtIG1pblgpIC8gMiArIDEwKSwgcno6IE1hdGgubWF4KDMwLCAobWF4WiAtIG1pblopIC8gMiArIDEwKSxcbiAgfTtcbn1cblxuLyoqXG4gKiBUcmFjZSB0aGUgY2FydmVkIGxvd2xhbmQgY2hhbm5lbCBmcm9tIHRoZSBsYWtlIG91dGZsb3cgc291dGggdG8gdGhlIHNlYS4gRm9yXG4gKiBlYWNoIDQgbSByb3cgdGhlIGNoYW5uZWwgaXMgdGhlIGxvd2VzdCBjb2x1bW4gbmVhciB0aGUgcHJldmlvdXMgY2VudHJlOyB0aGVcbiAqIHRyYWNlIGlzIHNtb290aGVkIHNvIHRoZSBmbG93IGZpZWxkIGRvZXMgbm90IGppdHRlciB3aXRoIHRoZSAxIG0gdm94ZWxzLlxuICovXG5mdW5jdGlvbiB0cmFjZUxvd2VyUml2ZXIoaDogSGVpZ2h0U2FtcGxlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiBSaXZlclJlYWNoIHtcbiAgY29uc3QgcmF3OiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGxldCBjeCA9IGxha2UueCArIGxha2UucnggKiAwLjU1O1xuICBsZXQgeiA9IE1hdGgucm91bmQobGFrZS56ICsgbGFrZS5yeiAqIDAuNik7XG4gIC8vIFN0YXJ0IGF0IHRoZSBsYWtlJ3Mgc291dGgtZWFzdCBvdXRmbG93IGFuZCBmb2xsb3cgdGhlIGNoYW5uZWwgZG93bnN0cmVhbS5cbiAgZm9yICg7IHogPD0gOTAwOyB6ICs9IDQpIHtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBieCA9IGN4O1xuICAgIGZvciAobGV0IHggPSBNYXRoLnJvdW5kKGN4IC0gNDApOyB4IDw9IGN4ICsgNDA7IHggKz0gMikge1xuICAgICAgY29uc3QgdiA9IGgoeCwgeikgKyBNYXRoLmFicyh4IC0gY3gpICogMC4wMjtcbiAgICAgIGlmICh2IDwgYmVzdCkgeyBiZXN0ID0gdjsgYnggPSB4OyB9XG4gICAgfVxuICAgIGN4ID0gYng7XG4gICAgcmF3LnB1c2goeyB4OiBieCwgeiB9KTtcbiAgICAvLyBUaGUgdHJhY2UgZW5kcyBvbmNlIGl0IHJlYWNoZXMgb3BlbiBzZWEgZm9yIGEgc3VzdGFpbmVkIHN0cmV0Y2guXG4gICAgaWYgKGJlc3QgPCAtNiAmJiByYXcubGVuZ3RoID4gMjAgJiYgaChieCwgeiArIDgpIDwgLTYgJiYgaChieCwgeiArIDE2KSA8IC02KSBicmVhaztcbiAgfVxuICBjb25zdCBzbW9vdGggPSByYXcubWFwKChwLCBpKSA9PiB7XG4gICAgbGV0IHN4ID0gMCwgbiA9IDA7XG4gICAgZm9yIChsZXQgayA9IE1hdGgubWF4KDAsIGkgLSA0KTsgayA8PSBNYXRoLm1pbihyYXcubGVuZ3RoIC0gMSwgaSArIDQpOyBrKyspIHsgc3ggKz0gcmF3W2tdLng7IG4rKzsgfVxuICAgIHJldHVybiB7IHg6IHN4IC8gbiwgejogcC56IH07XG4gIH0pO1xuICAvLyBTdG9yZSBkb3duc3RyZWFtLWZpcnN0OiBpbmRleCAwIGlzIHRoZSBzZWEgbW91dGguXG4gIHNtb290aC5yZXZlcnNlKCk7XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gW107XG4gIGxldCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzbW9vdGgubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaSA+IDApIHMgKz0gTWF0aC5oeXBvdChzbW9vdGhbaV0ueCAtIHNtb290aFtpIC0gMV0ueCwgc21vb3RoW2ldLnogLSBzbW9vdGhbaSAtIDFdLnopO1xuICAgIHBvaW50cy5wdXNoKHsgeDogc21vb3RoW2ldLngsIHo6IHNtb290aFtpXS56LCBzLCBsZXZlbDogMCwgd2lkdGg6IDYgfSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBSaXZlclJlYWNoKHBvaW50cywgNDApO1xufVxuXG4vKiogV2F0ZXItc3VyZmFjZSBkcm9wcyBhbG9uZyB0aGUgdXBwZXIgcml2ZXIsIGFzIChmcmFjdGlvbiBvZiBsZW5ndGgsIG1ldHJlcykuICovXG5jb25zdCBGQUxMUzogUmVhZG9ubHlBcnJheTxyZWFkb25seSBbbnVtYmVyLCBudW1iZXJdPiA9IFtbMC4yLCA3XSwgWzAuNDgsIDExXSwgWzAuNzQsIDEzXV07XG5jb25zdCBVUFBFUl9HUkFESUVOVCA9IDAuMDM7XG5cbi8qKlxuICogQXV0aG9yIHRoZSB2MiBtb3VudGFpbiByaXZlcjogYSBzZWVkZWQgbWVhbmRlcmluZyBjZW50cmVsaW5lIGZyb20gdGhlIGxha2Unc1xuICogbm9ydGggc2hvcmUgdG8gYSBoaWdobGFuZCB0YXJuLCB3aXRoIGEgbGV2ZWwgcHJvZmlsZSB0aGF0IG9ubHkgcmlzZXNcbiAqIHVwc3RyZWFtIChnZW50bGUgZ3JhZGllbnQgcGx1cyB0aHJlZSBjYXNjYWRlcykuXG4gKi9cbmZ1bmN0aW9uIGF1dGhvclVwcGVyUml2ZXIoc2VlZDogbnVtYmVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IHtcbiAgcmVhY2g6IFJpdmVyUmVhY2g7IHRhcm46IE5vbk51bGxhYmxlPEh5ZHJvbG9neVsndGFybiddPjtcbn0ge1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChzZWVkIF4gMHg1ZWVkMikgPj4+IDApO1xuICBjb25zdCBqID0gKGE6IG51bWJlcikgPT4gKHJuZCgpIC0gMC41KSAqIDIgKiBhO1xuICBjb25zdCBtb3V0aCA9IHsgeDogbGFrZS54ICsgbGFrZS5yeCAqIDAuMSwgejogbGFrZS56IC0gbGFrZS5yeiAqIDAuNTUgfTtcbiAgY29uc3QgY29udHJvbHMgPSBbXG4gICAgbW91dGgsXG4gICAgeyB4OiBsYWtlLnggKyAyMCArIGooMjApLCB6OiAtNDEwICsgaigxNSkgfSxcbiAgICB7IHg6IC0xOTAgKyBqKDM1KSwgejogLTUyMCArIGooMjApIH0sXG4gICAgeyB4OiAtMjE1ICsgaigzNSksIHo6IC02NDAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTE2NSArIGooMzApLCB6OiAtNzcwICsgaigxNSkgfSxcbiAgXTtcbiAgLy8gQ2F0bXVsbC1Sb20gdGhyb3VnaCB0aGUgY29udHJvbHMsIHRoZW4gcmVzYW1wbGUgYXQgfjggbSBzcGFjaW5nIHdpdGggYVxuICAvLyBzbWFsbCBzZWVkZWQgbWVhbmRlciBzbyB0aGUgY2hhbm5lbCBpcyBub3QgYSBzbW9vdGggc3BsaW5lLlxuICBjb25zdCBkZW5zZTogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbnRyb2xzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGNvbnN0IHAwID0gY29udHJvbHNbTWF0aC5tYXgoMCwgaSAtIDEpXSwgcDEgPSBjb250cm9sc1tpXTtcbiAgICBjb25zdCBwMiA9IGNvbnRyb2xzW2kgKyAxXSwgcDMgPSBjb250cm9sc1tNYXRoLm1pbihjb250cm9scy5sZW5ndGggLSAxLCBpICsgMildO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgMjQ7IGsrKykge1xuICAgICAgY29uc3QgdCA9IGsgLyAyNCwgdDIgPSB0ICogdCwgdDMgPSB0MiAqIHQ7XG4gICAgICBkZW5zZS5wdXNoKHtcbiAgICAgICAgeDogMC41ICogKDIgKiBwMS54ICsgKC1wMC54ICsgcDIueCkgKiB0ICsgKDIgKiBwMC54IC0gNSAqIHAxLnggKyA0ICogcDIueCAtIHAzLngpICogdDJcbiAgICAgICAgICArICgtcDAueCArIDMgKiBwMS54IC0gMyAqIHAyLnggKyBwMy54KSAqIHQzKSxcbiAgICAgICAgejogMC41ICogKDIgKiBwMS56ICsgKC1wMC56ICsgcDIueikgKiB0ICsgKDIgKiBwMC56IC0gNSAqIHAxLnogKyA0ICogcDIueiAtIHAzLnopICogdDJcbiAgICAgICAgICArICgtcDAueiArIDMgKiBwMS56IC0gMyAqIHAyLnogKyBwMy56KSAqIHQzKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBkZW5zZS5wdXNoKGNvbnRyb2xzW2NvbnRyb2xzLmxlbmd0aCAtIDFdKTtcbiAgY29uc3QgcmVzYW1wbGVkOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBzOiBudW1iZXIgfT4gPSBbeyAuLi5kZW5zZVswXSwgczogMCB9XTtcbiAgbGV0IGFjYyA9IDAsIHMgPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGRlbnNlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc3RlcCA9IE1hdGguaHlwb3QoZGVuc2VbaV0ueCAtIGRlbnNlW2kgLSAxXS54LCBkZW5zZVtpXS56IC0gZGVuc2VbaSAtIDFdLnopO1xuICAgIGFjYyArPSBzdGVwOyBzICs9IHN0ZXA7XG4gICAgaWYgKGFjYyA+PSA4IHx8IGkgPT09IGRlbnNlLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnN0IG0gPSAoZmJtMihzIC8gNjAsIDMuMSwgc2VlZCArIDgwMSwgMikgLSAwLjUpICogMTQ7XG4gICAgICByZXNhbXBsZWQucHVzaCh7IHg6IGRlbnNlW2ldLnggKyBtLCB6OiBkZW5zZVtpXS56LCBzIH0pO1xuICAgICAgYWNjID0gMDtcbiAgICB9XG4gIH1cbiAgY29uc3QgdG90YWwgPSByZXNhbXBsZWRbcmVzYW1wbGVkLmxlbmd0aCAtIDFdLnM7XG4gIGNvbnN0IGxldmVsQXQgPSAoc3Y6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgbGV0IGxldmVsID0gc3YgKiBVUFBFUl9HUkFESUVOVDtcbiAgICBmb3IgKGNvbnN0IFtmcmFjLCBkcm9wXSBvZiBGQUxMUykge1xuICAgICAgLy8gRWFjaCBmYWxsIGlzIGEgc2hvcnQgY2FzY2FkZSBvdmVyIH4xMCBtIG9mIGNoYW5uZWwuXG4gICAgICBsZXZlbCArPSBkcm9wICogc21vb3Roc3RlcCh0b3RhbCAqIGZyYWMgLSA1LCB0b3RhbCAqIGZyYWMgKyA1LCBzdik7XG4gICAgfVxuICAgIC8vIFRoZSBmaXJzdCA0MCBtIGludG8gdGhlIGxha2Ugc3RheXMgYXQgbGFrZSBsZXZlbC5cbiAgICByZXR1cm4gc3YgPCA0MCA/IDAgOiBsZXZlbCAtIDQwICogVVBQRVJfR1JBRElFTlQ7XG4gIH07XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gcmVzYW1wbGVkLm1hcCgocCkgPT4gKHtcbiAgICB4OiBwLngsIHo6IHAueiwgczogcC5zLCBsZXZlbDogTWF0aC5tYXgoMCwgbGV2ZWxBdChwLnMpKSxcbiAgICB3aWR0aDogMy4yICsgMi4yICogZmJtMihwLnMgLyA3MCwgOS43LCBzZWVkICsgODAyLCAyKSArICgxIC0gcC5zIC8gdG90YWwpICogMS41LFxuICB9KSk7XG4gIGNvbnN0IHNvdXJjZSA9IHBvaW50c1twb2ludHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiB7XG4gICAgcmVhY2g6IG5ldyBSaXZlclJlYWNoKHBvaW50cywgMTEwKSxcbiAgICB0YXJuOiB7IHg6IHNvdXJjZS54LCB6OiBzb3VyY2UueiwgcjogMTgsIGxldmVsOiBzb3VyY2UubGV2ZWwgfSxcbiAgfTtcbn1cbiIsICIvLyBWb3hlbCBtYXRlcmlhbCBpZHMuIFB1cmUgZGF0YSBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIgKEQtMDA1KS5cbi8vIElkcyBhcmUgcGVyc2lzdGVkIGluIHNuYXBzaG90IGVkaXRzLCBzbyBleGlzdGluZyB2YWx1ZXMgbXVzdCBuZXZlciBjaGFuZ2UuXG5leHBvcnQgY29uc3QgTUFUID0ge1xuICBBSVI6IDAsXG4gIEdSQVNTOiAxLFxuICBTT0lMOiAyLFxuICBTQU5EOiAzLFxuICBHUkFWRUw6IDQsXG4gIFNUT05FOiA1LFxuICBPUkU6IDYsXG4gIFdBVEVSOiA3LFxuICBCRURST0NLOiA4LFxuICBNT1NTOiA5LFxuICAvKiogR2VuZXJhdG9yIHYyIGhpZ2hsYW5kcy4gTmV2ZXIgcHJvZHVjZWQgYnkgZ2VuZXJhdG9yIHYxLiAqL1xuICBTTk9XOiAxMCxcbn0gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBNYXRJZCA9ICh0eXBlb2YgTUFUKVtrZXlvZiB0eXBlb2YgTUFUXTtcblxuZXhwb3J0IGNvbnN0IGlzU29saWQgPSAobTogbnVtYmVyKTogYm9vbGVhbiA9PiBtICE9PSBNQVQuQUlSICYmIG0gIT09IE1BVC5XQVRFUjtcbmV4cG9ydCBjb25zdCBpc09wYXF1ZSA9IGlzU29saWQ7XG5cbi8qKiBIaWdoZXN0IG1hdGVyaWFsIGlkIHRoYXQgbWF5IGFwcGVhciBpbiBhIHZveGVsIGVkaXQuICovXG5leHBvcnQgY29uc3QgTUFYX01BVF9JRCA9IDEwO1xuIiwgIi8vIFRlcnJhaW4gZ2VuZXJhdG9yIHYyIFx1MjAxNCB0aGUgdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSAocHVyZSBUUywgRC0wMDUpLlxuLy9cbi8vIENvbXBhdGliaWxpdHkgY29udHJhY3Q6IGluc2lkZSB0aGUgZm91bmRlciBjb3JyaWRvciAodGhlIHNldHRsZW1lbnQgdmFsbGV5LFxuLy8gdGhlIGxha2UgYW5kIHRoZSBsb3dsYW5kIHJpdmVyKSB2MiBoZWlnaHRzIGVxdWFsIHYxIGV4YWN0bHksIHNvIHRoZSBwaW5uZWRcbi8vIGZvdW5kZXIgcHJvamVjdHMsIHRoZWlyIHByZXBhcmF0aW9uIHRhcmdldHMgYW5kIG5hdHVyYWwgZW50aXRpZXMgdGhlcmUgYXJlXG4vLyB1bmNoYW5nZWQuIE91dHNpZGUgaXQgdjIgYWRkczpcbi8vICAgLSBhIG5vcnRoZXJuIG1hc3NpZiBvbiBhbiBleHRlbmRlZCBpc2xhbmQsIHdpdGggc25vdyBhYm92ZSB0aGUgc25vd2xpbmU7XG4vLyAgIC0gZmxhbmtpbmcgcmFuZ2VzIHdlc3QgYW5kIGVhc3Qgb2YgdGhlIHZhbGxleSwgdGVycmFjZWQgaW50byBjbGlmZiBiYW5kcztcbi8vICAgLSBhIG1vdW50YWluIHJpdmVyIGNhcnZlZCBpbnRvIHRoZSBtYXNzaWYgZnJvbSBhIHRhcm4gZG93biB0byB0aGUgbGFrZSxcbi8vICAgICB3aG9zZSB3YXRlciBzdXJmYWNlIGNvbWVzIGZyb20gSHlkcm9sb2d5IGFuZCBuZXZlciByaXNlcyBkb3duc3RyZWFtO1xuLy8gICAtIGEgY29udGludW91cyBsb3dsYW5kIGNoYW5uZWwgKHYxIGhhcyBhIGRyeSBmb3JkIHNvdXRoIG9mIHRoZSBzaGVsZikuXG4vLyBIZWlnaHRzIGFyZSBpbnRlZ2VycyBpbiBbLTE0LCAxMDRdLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIGxlcnAsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7IE1BVCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5cbmV4cG9ydCBjb25zdCBWMl9TTk9XTElORSA9IDc0O1xuZXhwb3J0IGNvbnN0IFYyX01BWF9IRUlHSFQgPSAxMDQ7XG5cbmV4cG9ydCB0eXBlIFYxSGVpZ2h0ID0gKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBWMkNvbHVtbiB7XG4gIC8qKiBUb3Agc29saWQgeSArIDEgKHNhbWUgY29udmVudGlvbiBhcyBzdXJmYWNlSGVpZ2h0QXQpLiAqL1xuICBoOiBudW1iZXI7XG4gIC8qKiBXYXRlciBzdXJmYWNlIGZvciB0aGlzIGNvbHVtbjogY2VsbHMgW2gsIGxldmVsKSBob2xkIHdhdGVyLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoaXMgY29sdW1uIGlzIHBhcnQgb2YgdGhlIGNhcnZlZCBtb3VudGFpbi1yaXZlciBjaGFubmVsLiAqL1xuICBjaGFubmVsOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVGVycmFpblYyIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcmVhZG9ubHkgc2VlZDogbnVtYmVyLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgdjE6IFYxSGVpZ2h0LFxuICAgIHJlYWRvbmx5IGh5ZHJvbG9neTogSHlkcm9sb2d5LFxuICApIHt9XG5cbiAgLyoqIDAgPSBleGFjdGx5IHYxIChmb3VuZGVyIGNvcnJpZG9yKTsgMSA9IGZ1bGwgdjIgcmVsaWVmLiAqL1xuICByZWxpZWZNYXNrKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTM5MCwgLTQ3MCwgeik7XG4gICAgLy8gVGhlIHdlc3QgcmFuZ2Uga2VlcHMgY2xlYXIgb2YgdGhlIGxha2UgYmFzaW4gdW50aWwgdGhlIGxha2UgaXMgcGFzc2VkLlxuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSwgd2VzdEVkZ2UgLSA5MCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjMwLCAzMzAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICAvKiogMCBhdCB0aGUgcmFuZ2UgZnJvbnQsIDEgZGVlcCBpbnNpZGU6IGZvb3RoaWxscyBmaXJzdCwgcGVha3MgYmVoaW5kLiAqL1xuICByYW5nZURlcHRoKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTQyMCwgLTcwMCwgeik7XG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlIC0gNDAsIHdlc3RFZGdlIC0gMzAwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyNzAsIDU2MCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFYyQ29sdW1uIHtcbiAgICBjb25zdCBzZWVkID0gdGhpcy5zZWVkO1xuICAgIGNvbnN0IGJhc2UgPSB0aGlzLnYxKHNlZWQsIHgsIHopO1xuICAgIGNvbnN0IG1hc2sgPSB0aGlzLnJlbGllZk1hc2soeCwgeik7XG4gICAgbGV0IGggPSBiYXNlO1xuXG4gICAgaWYgKG1hc2sgPiAwKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGlzbGFuZCBub3J0aCBzbyB0aGUgbWFzc2lmIGhhcyByb29tICh2MSBjb2FzdCBpcyB+eiAtNjAwKS5cbiAgICAgIGNvbnN0IG5vcnRoTGFuZCA9IHNtb290aHN0ZXAoLTQyMCwgLTUyMCwgeik7XG4gICAgICBjb25zdCBzaG9yZSA9IDEgLSBNYXRoLmh5cG90KCh4ICsgMTUwKSAvIDU2MCwgKHogKyA2OTApIC8gMzAwKVxuICAgICAgICArIChmYm0yKHggLyAxNjAsIHogLyAxNjAsIHNlZWQgKyA3MDEsIDMpIC0gMC41KSAqIDAuMztcbiAgICAgIGNvbnN0IGxhbmROID0gc21vb3Roc3RlcCgwLjAsIDAuMTQsIHNob3JlKSAqIG5vcnRoTGFuZDtcbiAgICAgIGNvbnN0IGdyb3VuZCA9IGxlcnAoYmFzZSwgTWF0aC5tYXgoYmFzZSwgNSArIDUgKiBmYm0yKHggLyA5MCwgeiAvIDkwLCBzZWVkICsgNzAyLCAyKSksIGxhbmROKTtcblxuICAgICAgLy8gUmlkZ2VkIG1hc3NpZiB3aXRoIHRlcnJhY2VkIGNsaWZmIGJhbmRzLlxuICAgICAgY29uc3Qgd3ggPSB4ICsgKGZibTIoeCAvIDI2MCwgeiAvIDI2MCwgc2VlZCArIDcwMywgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3Qgd3ogPSB6ICsgKGZibTIoeCAvIDI2MCArIDUuMSwgeiAvIDI2MCAtIDIuNywgc2VlZCArIDcwNCwgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3QgcjEgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMTAsIHd6IC8gMjEwLCBzZWVkICsgNzA1LCA0KSAtIDEpO1xuICAgICAgY29uc3QgcjIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4MCwgd3ogLyA4MCwgc2VlZCArIDcwNiwgMykgLSAxKTtcbiAgICAgIGNvbnN0IGx1bXAgPSBmYm0yKHd4IC8gMTIwLCB3eiAvIDEyMCwgc2VlZCArIDcwNywgMyk7XG4gICAgICBjb25zdCBkZXB0aCA9IHRoaXMucmFuZ2VEZXB0aCh4LCB6KTtcbiAgICAgIGxldCBtb3VudGFpbiA9IDE2ICsgKDggKyA4MCAqIGRlcHRoKSAqICgwLjU1ICogcjEgKiByMSArIDAuMjggKiByMiArIDAuMTcgKiBsdW1wKVxuICAgICAgICArIDE4ICogZGVwdGggKiBzbW9vdGhzdGVwKDAuNTUsIDAuOSwgcjEpO1xuICAgICAgY29uc3QgYmFuZCA9IDYgKyAyICogZmJtMih4IC8gMTQwLCB6IC8gMTQwLCBzZWVkICsgNzA4LCAyKTtcbiAgICAgIGNvbnN0IHQgPSBNYXRoLmZsb29yKG1vdW50YWluIC8gYmFuZCk7XG4gICAgICBjb25zdCBmcmFjID0gbW91bnRhaW4gLyBiYW5kIC0gdDtcbiAgICAgIG1vdW50YWluID0gKHQgKyBzbW9vdGhzdGVwKDAuNSwgMC44LCBmcmFjKSkgKiBiYW5kO1xuXG4gICAgICAvLyBPbmx5IGxhbmQgcmlzZXM7IHRoZSBzZWEgc3RheXMgc2VhLCBzbyByYW5nZXMgZW5kIGluIGNvYXN0YWwgY2xpZmZzLlxuICAgICAgY29uc3QgbGFuZEZhY3RvciA9IHNtb290aHN0ZXAoLTIsIDgsIGdyb3VuZCk7XG4gICAgICBoID0gbGVycChncm91bmQsIE1hdGgubWF4KGdyb3VuZCwgbW91bnRhaW4pLCBtYXNrICogbGFuZEZhY3Rvcik7XG4gICAgfVxuXG4gICAgbGV0IGxldmVsID0gaCA8IDAgPyAwIDogLUluZmluaXR5O1xuICAgIGxldCBjaGFubmVsID0gZmFsc2U7XG5cbiAgICAvLyBNb3VudGFpbiByaXZlcjogdmFsbGV5IGZsb29yLCBiYW5rcyBhbmQgY2hhbm5lbCBmb2xsb3cgdGhlIHdhdGVyIGxldmVsLlxuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCByYWlzZWQgPSBoaXQubGV2ZWwgPiAwLjI1O1xuICAgICAgICBjb25zdCB2dyA9IDU1ICsgMjggKiBmYm0yKGhpdC5zIC8gOTAsIDEuNywgc2VlZCArIDcwOSwgMik7XG4gICAgICAgIGNvbnN0IGZsb29yID0gaGl0LmxldmVsICsgMS41ICsgMi4yICogZmJtMih4IC8gNDAsIHogLyA0MCwgc2VlZCArIDcxMCwgMikgKyBoaXQuZCAqIDAuMDY7XG4gICAgICAgIGNvbnN0IHQgPSBzbW9vdGhzdGVwKHZ3ICogMC4zLCB2dywgaGl0LmQpO1xuICAgICAgICBoID0gTWF0aC5taW4oaCwgbGVycChmbG9vciwgaCwgdCkpO1xuICAgICAgICBjb25zdCB3ID0gaGl0LndpZHRoO1xuICAgICAgICBpZiAocmFpc2VkICYmIGhpdC5kIDwgdyArIDMpIHtcbiAgICAgICAgICAvLyBCYW5rcyBob2xkIGEgcmFpc2VkIHJpdmVyOiBuZXZlciBiZWxvdyBpdHMgd2F0ZXIgc3VyZmFjZS4gQXQgbGFrZVxuICAgICAgICAgIC8vIGxldmVsIHRoZSBzZWEtbGV2ZWwgZmlsbCBhbHJlYWR5IGNvbnRhaW5zIHRoZSB3YXRlci5cbiAgICAgICAgICBoID0gTWF0aC5tYXgoaCwgTWF0aC5jZWlsKGhpdC5sZXZlbCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaGl0LmQgPCB3KSB7XG4gICAgICAgICAgY29uc3QgYmVkID0gaGl0LmxldmVsIC0gKDEuMiArIDEuMyAqICgxIC0gaGl0LmQgLyB3KSk7XG4gICAgICAgICAgaCA9IE1hdGgubWluKGgsIGJlZCk7XG4gICAgICAgICAgaWYgKHJhaXNlZCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZChoaXQubGV2ZWwpKTtcbiAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgdGFybiA9IHRoaXMuaHlkcm9sb2d5LnRhcm47XG4gICAgICBpZiAodGFybikge1xuICAgICAgICBjb25zdCB0ZCA9IE1hdGguaHlwb3QoeCAtIHRhcm4ueCwgeiAtIHRhcm4ueilcbiAgICAgICAgICAqICgxICsgMC4yICogKGZibTIoeCAvIDMwLCB6IC8gMzAsIHNlZWQgKyA3MTEsIDIpIC0gMC41KSk7XG4gICAgICAgIGlmICh0ZCA8IHRhcm4uciArIDYpIHtcbiAgICAgICAgICBjb25zdCByaW0gPSBNYXRoLmNlaWwodGFybi5sZXZlbCkgKyAxO1xuICAgICAgICAgIGlmICh0ZCA+PSB0YXJuLnIpIGggPSBNYXRoLm1heChoLCByaW0pO1xuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaCA9IE1hdGgubWluKE1hdGgubWF4KGgsIHJpbSksIHRhcm4ubGV2ZWwgLSAxIC0gMyAqIHNtb290aHN0ZXAodGFybi5yLCAwLCB0ZCkpO1xuICAgICAgICAgICAgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZCh0YXJuLmxldmVsKSk7XG4gICAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMb3dsYW5kIGNoYW5uZWwgY29udGludWl0eTogdjEgbGVhdmVzIGEgZHJ5IGZvcmQgd2hlcmUgdGhlIHNoZWxmIG1lZXRzIHRoZSByaXZlci5cbiAgICBjb25zdCBsb3cgPSB0aGlzLmh5ZHJvbG9neS5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPCAyLjUgJiYgaCA+PSAwICYmIGJhc2UgPCA0KSBoID0gLTE7XG5cbiAgICBoID0gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIFYyX01BWF9IRUlHSFQpKTtcbiAgICBpZiAoaCA8IDApIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIDApO1xuICAgIHJldHVybiB7IGgsIGxldmVsOiBsZXZlbCA9PT0gLUluZmluaXR5ID8gaCA6IGxldmVsLCBjaGFubmVsIH07XG4gIH1cblxuICBoZWlnaHQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmNvbHVtbih4LCB6KS5oO1xuICB9XG5cbiAgLyoqIHYyIHRvcCBtYXRlcmlhbC4gRmFsbHMgYmFjayB0byB0aGUgdjEgcnVsZXMgZm9yIHRoZSB1bmNoYW5nZWQgY29ycmlkb3IuICovXG4gIHRvcE1hdGVyaWFsKFxuICAgIHg6IG51bWJlciwgejogbnVtYmVyLCBjb2w6IFYyQ29sdW1uLCBzbG9wZTogbnVtYmVyLFxuICAgIHYxVG9wOiAoaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyKSA9PiBNYXRJZCxcbiAgKTogTWF0SWQge1xuICAgIGNvbnN0IGggPSBjb2wuaDtcbiAgICBpZiAoY29sLmNoYW5uZWwgJiYgY29sLmxldmVsID4gaCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIgJiYgaCA+IDEpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDwgaGl0LndpZHRoICsgMi41ICYmIGhpdC5sZXZlbCA+IDAuMjUpIHtcbiAgICAgICAgcmV0dXJuIGZibTIoeCAvIDYsIHogLyA2LCB0aGlzLnNlZWQgKyA3MTIsIDEpID4gMC41ID8gTUFULkdSQVZFTCA6IE1BVC5TQU5EO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzbm93bGluZSA9IFYyX1NOT1dMSU5FICsgKGZibTIoeCAvIDcwLCB6IC8gNzAsIHRoaXMuc2VlZCArIDcxMywgMykgLSAwLjUpICogMTY7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgJiYgc2xvcGUgPD0gMykgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmIChoID49IHNub3dsaW5lIC0gNiAmJiBzbG9wZSA8PSAxICYmIGZibTIoeCAvIDIwLCB6IC8gMjAsIHRoaXMuc2VlZCArIDcxNCwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKHRoaXMucmVsaWVmTWFzayh4LCB6KSA+IDAuNSAmJiBoID4gMzAgJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgICByZXR1cm4gdjFUb3AoaCwgc2xvcGUpO1xuICB9XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG4vKiogR2VuZXJhdG9yIHYxOiB0aGUgb3JpZ2luYWwgMjA0OCBtIGlzbGFuZC4gRGVmYXVsdCBmb3IgY3JlYXRlV29ybGQgYW5kIGFsbCBsZWdhY3kgc2F2ZXMuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuLyoqIEdlbmVyYXRvciB2MjogdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSB3aXRoIGEgbW91bnRhaW4gcml2ZXIgKHNlZSB0ZXJyYWluLXYyLnRzKS4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVjIgPSAyO1xuLyoqIFRoZSBnZW5lcmF0b3IgbmV3IGJyb3dzZXIgd29ybGRzIHVzZSBieSBkZWZhdWx0LiAqL1xuZXhwb3J0IGNvbnN0IExBVEVTVF9HRU5FUkFUT1JfVkVSU0lPTiA9IEdFTkVSQVRPUl9WMjtcbmV4cG9ydCBjb25zdCBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TOiByZWFkb25seSBudW1iZXJbXSA9IFtHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyXTtcbmV4cG9ydCBjb25zdCBpc1N1cHBvcnRlZEdlbmVyYXRvciA9ICh2OiB1bmtub3duKTogdiBpcyBudW1iZXIgPT5cbiAgdHlwZW9mIHYgPT09ICdudW1iZXInICYmIFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlMuaW5jbHVkZXModik7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgeyBNQVQsIGlzU29saWQsIGlzT3BhcXVlLCBNQVhfTUFUX0lEIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuZXhwb3J0IHR5cGUgeyBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IE1BVCwgaXNTb2xpZCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5cbmV4cG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgZmJtMixcbn0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQge1xuICBjbGFtcCwgbGVycCwgc21vb3Roc3RlcCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIHZhbHVlTm9pc2UzLCBmYm0yLCBmYm0zLFxufSBmcm9tICcuL25vaXNlJztcblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGlmICghaXNTdXBwb3J0ZWRHZW5lcmF0b3IoZ2VuZXJhdG9yVmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24gJHtnZW5lcmF0b3JWZXJzaW9ufWApO1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TLCBnZW5lcmF0b3JWZXJzaW9uIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDAsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbi8vIC0tLS0tLS0tLS0gdmVyc2lvbmVkIGdlbmVyYXRvciBkaXNwYXRjaCAtLS0tLS0tLS0tXG5jb25zdCB2MkNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRlcnJhaW5WMj4oKTtcbmNvbnN0IGh5ZHJvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSHlkcm9sb2d5PigpO1xuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kgbmV0d29yayBmb3IgYSBzZWVkIGFuZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyb2xvZ3lGb3Ioc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBIeWRyb2xvZ3kge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuaHlkcm9sb2d5O1xuICBjb25zdCBrZXkgPSBgJHtzZWVkfToke3ZlcnNpb259YDtcbiAgbGV0IGh5ZHJvID0gaHlkcm9DYWNoZS5nZXQoa2V5KTtcbiAgaWYgKCFoeWRybykge1xuICAgIGh5ZHJvID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb24sIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGh5ZHJvQ2FjaGUuc2V0KGtleSwgaHlkcm8pO1xuICB9XG4gIHJldHVybiBoeWRybztcbn1cblxuLyoqIEBpbnRlcm5hbCBUaGUgdjIgZ2VuZXJhdG9yIGZvciBhIHNlZWQgKGNhY2hlZDsgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCkuICovXG5leHBvcnQgZnVuY3Rpb24gdGVycmFpblYyKHNlZWQ6IG51bWJlcik6IFRlcnJhaW5WMiB7XG4gIGxldCBnZW4gPSB2MkNhY2hlLmdldChzZWVkKTtcbiAgaWYgKCFnZW4pIHtcbiAgICBjb25zdCBoeWRyb2xvZ3kgPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbjogR0VORVJBVE9SX1YyLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBnZW4gPSBuZXcgVGVycmFpblYyKHNlZWQsIHN1cmZhY2VIZWlnaHRBdCwgaHlkcm9sb2d5KTtcbiAgICB2MkNhY2hlLnNldChzZWVkLCBnZW4pO1xuICB9XG4gIHJldHVybiBnZW47XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCBoZWlnaHQgKHRvcCBzb2xpZCArIDEpIGZvciBhbnkgc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkuaGVpZ2h0KHgsIHopIDogc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgd2F0ZXIgc3VyZmFjZTogd2F0ZXIgZmlsbHMgY2VsbHMgW2hlaWdodCwgbGV2ZWwpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VXYXRlckxldmVsQXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmNvbHVtbih4LCB6KS5sZXZlbDtcbiAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgOiBoO1xufVxuXG5mdW5jdGlvbiB2ZXJzaW9uZWRTbG9wZShzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogKyAxKSksXG4gICk7XG59XG5cbi8qKiBCYXNlIHRvcCBtYXRlcmlhbCBmb3IgYW55IGdlbmVyYXRvciB2ZXJzaW9uIChtYWNybyBMT0QsIGVudGl0eSBwbGFjZW1lbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbEZvcihcbiAgc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGdlbiA9IHRlcnJhaW5WMihzZWVkKTtcbiAgICByZXR1cm4gZ2VuLnRvcE1hdGVyaWFsKHgsIHosIGdlbi5jb2x1bW4oeCwgeiksIHNsb3BlLFxuICAgICAgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoaCwgc3MsIG5lYXJXYXRlcikpO1xuICB9XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KGN4LCBjeikpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjeCwgY3opO1xuICByZXR1cm4gaW5zdGFsbEJhc2VDaHVuayh3b3JsZCwgYmFzZSwgcGVyZm9ybWFuY2Uubm93KCkgLSB0MCk7XG59XG5cbi8qKlxuICogQmFzZSBnZW5lcmF0ZWQgY29udGVudHMgb2YgYSBjaHVuayBiZWZvcmUgZHVyYWJsZSBlZGl0cy4gQSBwdXJlIGZ1bmN0aW9uIG9mXG4gKiAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24sIGN4LCBjeik6IHNhZmUgdG8gY29tcHV0ZSBpbiBhIFdlYiBXb3JrZXIsIGFuZCB0aGVcbiAqIGJ5dGVzIGFyZSBpZGVudGljYWwgd2hlcmV2ZXIgaXQgcnVucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCYXNlQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBzZWVkOiBudW1iZXI7XG4gIHZlcnNpb246IG51bWJlcjtcbiAgZGF0YTogVWludDhBcnJheTtcbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQmFzZUNodW5rKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNodW5rIHtcbiAgY29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KENIVU5LX1ZPTFVNRSk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3QgdG9wTWF0ZXJpYWxzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCB2MiA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpIDogbnVsbDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBjb25zdCB2MkNvbHM6IFYyQ29sdW1uW10gfCBudWxsID0gdjIgPyBuZXcgQXJyYXkoQ0hVTktfQVJFQSkgOiBudWxsO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBweCAtIFAsIHd6ID0gb3ogKyBweiAtIFA7XG4gICAgICBpZiAodjIpIHtcbiAgICAgICAgY29uc3QgY29sID0gdjIuY29sdW1uKHd4LCB3eik7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBjb2wuaDtcbiAgICAgICAgY29uc3QgbHggPSBweCAtIFAsIGx6ID0gcHogLSBQO1xuICAgICAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHYyQ29scyFbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY29sO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB3eCwgd3opO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB2MkNvbCA9IHYyQ29scyA/IHYyQ29sc1tseiAqIENIVU5LX1NJWkUgKyBseF0gOiBudWxsO1xuICAgICAgY29uc3QgdG9wID0gdjIgJiYgdjJDb2xcbiAgICAgICAgPyB2Mi50b3BNYXRlcmlhbCh3eCwgd3osIHYyQ29sLCBzbG9wZSwgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGhoLCBzcywgbmVhcldhdGVyKSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHRoZSBjb2x1bW4nc1xuICAgICAgLy8gd2F0ZXIgbGV2ZWwgKHNlYSBsZXZlbCBpbiB2MTsgdGhlIGh5ZHJvbG9naWNhbCBsZXZlbCBpbiB2MikuXG4gICAgICBjb25zdCB3YXRlckxldmVsID0gdjJDb2wgPyBNYXRoLm1pbihZX01BWCwgdjJDb2wubGV2ZWwpIDogU0VBX0xFVkVMO1xuICAgICAgaWYgKGggPCB3YXRlckxldmVsKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCB3YXRlckxldmVsOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGN4LCBjeiwgc2VlZCwgdmVyc2lvbiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfTtcbn1cblxuLyoqXG4gKiBJbnN0YWxsIGJhc2UgY29udGVudHMgYXMgYSByZXNpZGVudCBjaHVuazogYXBwbHkgZHVyYWJsZSBlZGl0cywgdXBkYXRlXG4gKiBzdGF0cywgYW5kIHJ1biBkZXRlcm1pbmlzdGljIGVudGl0eSBnZW5lcmF0aW9uLiBNYWluLXRocmVhZCBvbmx5OyB0aGlzIGlzXG4gKiB0aGUgc2luZ2xlIHdyaXRlciBvZiBXb3JsZC4gUmV0dXJucyB0aGUgYWxyZWFkeS1yZXNpZGVudCBjaHVuayBpZiBvbmUgZXhpc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEJhc2VDaHVuayh3b3JsZDogV29ybGQsIGJhc2U6IEJhc2VDaHVuaywgZ2VuZXJhdGlvbk1zID0gMCk6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGJhc2Uuc2VlZCAhPT0gd29ybGQuc2VlZCB8fCBiYXNlLnZlcnNpb24gIT09IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdiYXNlIGNodW5rIGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgd29ybGQgY29uZmlndXJhdGlvbicpO1xuICB9XG4gIGNvbnN0IHsgY3gsIGN6LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9ID0gYmFzZTtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBnZW5lcmF0aW9uTXM7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDb2x1bW5zIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5OyB9XG5cbi8qKiBCYXNlIChwcmUtY2FydmUsIHByZS1lZGl0KSBjb2x1bW4gaGVpZ2h0cy9tYXRlcmlhbHMgdXNlZCBmb3IgZW50aXR5IHBsYWNlbWVudC4gUHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlQmFzZUNvbHVtbnMoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ29sdW1ucyB7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IHZlcnNpb25lZFNsb3BlKHNlZWQsIHZlcnNpb24sIHgsIHosIGgpIDogc2xvcGVBdChzZWVkLCB4LCB6LCBoKTtcbiAgICAgIGNvbnN0IGluZGV4ID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLmhlaWdodHNbaW5kZXhdID0gY2xhbXAoaCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2luZGV4XSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gYmFzZVRvcE1hdGVyaWFsRm9yKHNlZWQsIHZlcnNpb24sIHgsIHosIGgsIHNsb3BlKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29sdW1ucztcbn1cblxuLyoqIFByb3ZpZGUgcHJlY29tcHV0ZWQgYmFzZSBjb2x1bW5zIChmb3IgZXhhbXBsZSBmcm9tIGEgd29ya2VyKSBiZWZvcmUgaW5zdGFsbGluZyBhIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlZWRCYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nLCBjb2x1bW5zOiBCYXNlQ29sdW1ucyk6IHZvaWQge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGlmICghY2FjaGUuaGFzKGtleSkpIGNhY2hlLnNldChrZXksIGNvbHVtbnMpO1xufVxuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogQmFzZUNvbHVtbnMge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0gY29tcHV0ZUJhc2VDb2x1bW5zKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjaHVuay5jeCwgY2h1bmsuY3opO1xuICBjYWNoZS5zZXQoY2h1bmsua2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVyaXZlZCBjaGFuZ2UgdHJhY2tpbmcgKG5vdCBhdXRob3JpdGF0aXZlIHN0YXRlKSAtLS0tLS0tLS0tXG4vLyBSZW5kZXJlcnMgbmVlZCB0byBrbm93IHdoZW4gdGhlIGVkaXQgb3ZlcmxheSBjaGFuZ2VkIHdpdGhvdXQgd2Fsa2luZyBldmVyeVxuLy8gZWRpdCBlYWNoIGZyYW1lLiBUaGUgY291bnRlciBsaXZlcyBvdXRzaWRlIFdvcmxkIHNvIGl0IG5ldmVyIGVudGVycyBhXG4vLyBzbmFwc2hvdCBvciBjYW5vbmljYWwgaGFzaC5cbmNvbnN0IGVkaXRWZXJzaW9ucyA9IG5ldyBXZWFrTWFwPFdvcmxkLCBudW1iZXI+KCk7XG5cbi8qKiBNb25vdG9uaWMgY291bnQgb2YgZWRpdC1vdmVybGF5IGNoYW5nZXMgZm9yIHRoaXMgV29ybGQgb2JqZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRWZXJzaW9uKHdvcmxkOiBXb3JsZCk6IG51bWJlciB7XG4gIHJldHVybiBlZGl0VmVyc2lvbnMuZ2V0KHdvcmxkKSA/PyAwO1xufVxuXG4vKiogQ2FsbCBhZnRlciByZXBsYWNpbmcgb3IgYnVsay1jaGFuZ2luZyBgd29ybGQuZWRpdHNgIG91dHNpZGUgc2V0Vm94ZWwuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya0VkaXRzQ2hhbmdlZCh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZWRpdFZlcnNpb25zLnNldCh3b3JsZCwgZWRpdFZlcnNpb24od29ybGQpICsgMSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gbm9uLWdlbmVyYXRpbmcgcXVlcmllcyAtLS0tLS0tLS0tXG4vLyBNb3ZpbmcgcHJlc2VudGF0aW9uIChjaGFyYWN0ZXJzLCBhbmltYWxzLCBjYW1lcmEpIG11c3QgbmV2ZXIgdHJpZ2dlciBjaHVua1xuLy8gZ2VuZXJhdGlvbiBhcyBhIHNpZGUgZWZmZWN0IG9mIGFza2luZyBhYm91dCB0ZXJyYWluLiBUaGVzZSByZXR1cm4gbnVsbCB3aGVuXG4vLyB0aGUgY29sdW1uJ3MgY2h1bmsgaXMgbm90IHJlc2lkZW50LlxuXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRDaHVua0F0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBudWxsO1xuICByZXR1cm4gd29ybGQuY2h1bmtzLmdldChjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKSkgPz8gbnVsbDtcbn1cblxuLyoqIExpa2Ugc3VyZmFjZUF0LCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuLyoqIExpa2UgZ2V0Vm94ZWwsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRWb3hlbEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHwgbnVsbCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIC8vIENodW5rIGJ5dGVzIGFuZCBjb2x1bW4gY2FjaGVzIGFyZSByZWdlbmVyYXRlZCBvbiBkZW1hbmQuIEVudGl0aWVzIHJlbWFpblxuICAvLyBhdXRob3JpdGF0aXZlOiBldmljdGlvbiBtdXN0IG5vdCBmb3JnZXQgdGhlaXIgcGVyc2lzdGVudCBzdGF0ZS5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcXVlcmllcyAvIGVkaXRzIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG06IE1hdElkKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBZX01BWCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgY29uc3QgcHJldmlvdXNFZGl0ID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rS2V5KGN4LCBjeikpPy5nZXQoaWR4KTtcbiAgLy8gQSBjaHVuayBldmljdGVkIGFmdGVyIGFuIGVhcmxpZXIgZWRpdCBjYW4gcmVnZW5lcmF0ZSB3aXRoIHRoYXQgZHVyYWJsZVxuICAvLyBtYXRlcmlhbCBhbHJlYWR5IGFwcGxpZWQuIERyb3BwaW5nIHRoZSBlZGl0IGhlcmUgd291bGQgbWFrZSBpdCBkaXNhcHBlYXJcbiAgLy8gb24gdGhlIG5leHQgZXZpY3Rpb24vcmVzdG9yYXRpb24sIGV2ZW4gdGhvdWdoIHRoZSBjdXJyZW50IHdyaXRlIG5vLW9wcy5cbiAgaWYgKHByZXZpb3VzRWRpdCA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gZmFsc2U7XG4gIGxldCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChjaHVuay5rZXkpO1xuICBpZiAoIWVkaXRzKSB7IGVkaXRzID0gbmV3IE1hcCgpOyB3b3JsZC5lZGl0cy5zZXQoY2h1bmsua2V5LCBlZGl0cyk7IH1cbiAgLy8gQW4gaWRlbXBvdGVudCB3cml0ZSBtdXN0IHN0aWxsIHJlc3RvcmUgYSBkdXJhYmxlIGRlbHRhIGRpc2NhcmRlZCBieSBhblxuICAvLyBvbGRlciBzbmFwc2hvdCBvciBkZWx0YSBkZWNvZGVyLiBJdCBpcyBub3QgYSBuZXcgYXV0aG9yaXRhdGl2ZSByZXZpc2lvbi5cbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkge1xuICAgIGlmICghZWRpdHMuaGFzKGlkeCkpIGVkaXRzLnNldChpZHgsIG0pO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiA8IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICAgIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIC0gaCA6IDA7XG4gIH1cbiAgcmV0dXJuIHdhdGVyU3VyZmFjZUF0KHdvcmxkLCB4LCB6KSAtIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKlxuICogVG9wIG9mIHRoZSB3YXRlciBjb2x1bW4gc3RhbmRpbmcgb24gdGhlIHNvbGlkIHN1cmZhY2UgKGVxdWFsIHRvIHRoZSBzdXJmYWNlXG4gKiB3aGVuIGRyeSkuIFJlYWRzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVscywgc28gZWRpdHMgYW5kIGR1ZyBwaXRzIGFyZSBleGFjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyU3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIHdoaWxlICh5IDwgWV9NQVggJiYgZ2V0Vm94ZWwod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZW50aXRpZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gYWRkRW50aXR5KHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5oYXMoZS5pZCkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIHJldHVybjtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGUpO1xuICBsZXQgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgbGlzdCk7IH1cbiAgbGlzdC5wdXNoKGUuaWQpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIC8vIEdlbmVyYXRpb24gaXMgZGV0ZXJtaW5pc3RpYyBhbmQgYWR2YW5jZXMgbm8gcGxheWVyLWNvbW1hbmQgcHJlY29uZGl0aW9uLlxuICAvLyBBdXRob3JlZCBzY2FmZm9sZGluZyBtYXkgdHJhbnNpZW50bHkgY2hhbmdlIGl0OyB0aGUgc25hcHNob3QgcmVzdG9yZXMgdGhlXG4gIC8vIHNhdmVkIHJldmlzaW9uIGFmdGVyIHBsYWNpbmcgdGhhdCBzY2FmZm9sZGluZy5cbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUlkKGNodW5rOiBzdHJpbmcsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBgZToke2NodW5rfToke2l9YDtcbn1cblxuZnVuY3Rpb24gZm9yZXN0U2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgZWFzdCA9IE1hdGguZXhwKC0oKCh3eCAtIDIyMCkgLyAyNjApICoqIDIgKyAoKHd6ICsgMTEwKSAvIDIyMCkgKiogMikpO1xuICBjb25zdCBub3J0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDIwKSAvIDMwMCkgKiogMiArICgod3ogKyAzMDApIC8gMTkwKSAqKiAyKSk7XG4gIGNvbnN0IHdlc3QgPSBNYXRoLmV4cCgtKCgod3ggKyAzNDApIC8gMjAwKSAqKiAyICsgKCh3eiAtIDEyMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3Qgc291dGggPSBNYXRoLmV4cCgtKCgod3ggLSAxMjApIC8gMjQwKSAqKiAyICsgKCh3eiAtIDMzMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3QgbW9pc3R1cmUgPSBmYm0yKHd4IC8gMjYwLCB3eiAvIDI2MCwgc2VlZCArIDIwMSwgNCk7XG4gIGNvbnN0IHZhbGxleSA9IE1hdGguZXhwKC0oKHd4IC8gMTQwKSAqKiAyICsgKHd6IC8gMTA1KSAqKiAyKSk7XG4gIHJldHVybiBNYXRoLm1heChlYXN0LCBub3J0aCAqIDAuOTIsIHdlc3QgKiAwLjgwLCBzb3V0aCAqIDAuNzgpICogMC44MlxuICAgICsgbW9pc3R1cmUgKiAwLjM4IC0gMC4yMiAtIHZhbGxleSAqIDAuMzQ7XG59XG5cbmZ1bmN0aW9uIHJvY2tTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBtb3VudGFpbiA9IGZibTIod3ggLyAzMzAsIHd6IC8gMzMwLCBzZWVkICsgMjAyLCAzKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAxNDAsIHd6IC8gMTQwLCBzZWVkICsgMjAzLCAzKSAtIDEpO1xuICByZXR1cm4gbW91bnRhaW4gKiAwLjU1ICsgcmlkZ2UgKiAwLjQ1O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB2b2lkIHtcbiAgZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZCwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBSZXBsYXlzIGRldGVybWluaXN0aWMgZ2VuZXJhdGlvbiBmb3Igc25hcHNob3QgZW50aXR5IGRlbHRhcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhrZXkpKSByZXR1cm47XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybjtcblxuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY2h1bmsuY3gsIGNodW5rLmN6LCB3b3JsZC5zZWVkICsgOTAwKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGNvbHVtbnMgPSBiYXNlQ29sdW1ucyh3b3JsZCwgY2h1bmspO1xuICBsZXQgbiA9IDA7XG4gIGxldCBuYXR1cmFsVHJlZXMgPSAwO1xuICBsZXQgbmF0dXJhbFBpbmtUcmVlcyA9IDA7XG5cbiAgY29uc3QgbG9jYWxTdXJmYWNlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdICsgWV9NSU47XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSBhcyBNYXRJZDtcbiAgfTtcbiAgY29uc3QgbG9jYWxTbG9wZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggKyAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogKyAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICApO1xuICB9O1xuXG4gIC8vIEEgaml0dGVyZWQgOCBtIGxhdHRpY2UgZ2l2ZXMgY29oZXJlbnQgbWFzc2VzIGFuZCBhdm9pZHMgcGVyLWZyYW1lIHNjYXR0ZXIuXG4gIGZvciAobGV0IGd6ID0gMDsgZ3ogPCBDSFVOS19TSVpFOyBneiArPSA4KSB7XG4gICAgZm9yIChsZXQgZ3ggPSAwOyBneCA8IENIVU5LX1NJWkU7IGd4ICs9IDgpIHtcbiAgICAgIGNvbnN0IGx4ID0gY2xhbXAoTWF0aC5mbG9vcihneCArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IGx6ID0gY2xhbXAoTWF0aC5mbG9vcihneiArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgICAgaWYgKGggPD0gU0VBX0xFVkVMICsgMSkgY29udGludWU7XG4gICAgICBjb25zdCBzbG9wZSA9IGxvY2FsU2xvcGUobHgsIGx6KTtcbiAgICAgIGNvbnN0IHRvcCA9IGxvY2FsVG9wKGx4LCBseik7XG4gICAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9yZXN0ID0gZm9yZXN0U2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvY2t5ID0gcm9ja1Njb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2xsID0gcm5kKCk7XG5cbiAgICAgIGNvbnN0IHRyZWVDaGFuY2UgPSBmb3Jlc3QgPiAwLjUwID8gMC43MiA6IGZvcmVzdCA+IDAuMzAgPyAwLjI1IDogMC4wNTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAyICYmIHJvbGwgPCB0cmVlQ2hhbmNlKSB7XG4gICAgICAgIC8vIFRoZSBjYXAgaXMgYSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZ2VuZXJhdGlvbiBwcm9wZXJ0eS4gSXQgY2Fubm90XG4gICAgICAgIC8vIGRlcGVuZCBvbiB3aGljaCBjaHVua3MgYSByZW5kZXJlciBsb2FkZWQgYmVmb3JlIHRoaXMgb25lLlxuICAgICAgICBsZXQga2luZDogRW50aXR5S2luZDtcbiAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgY29uc3Qgc3BlY2llc1JvbGwgPSBybmQoKTtcbiAgICAgICAgaWYgKHNwZWNpZXNSb2xsIDwgMC4xMikge1xuICAgICAgICAgIGlmICgobmF0dXJhbFBpbmtUcmVlcyArIDEpID4gMC4yNSAqIChuYXR1cmFsVHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIG5hdHVyYWxQaW5rVHJlZXMrKztcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIG5hdHVyYWxUcmVlcysrO1xuICAgICAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44OCArIHJuZCgpICogMC4yNCwgdmFyaWFudCxcbiAgICAgICAgICByZXNvdXJjZTogJ3dvb2QnLCByZW1haW5pbmc6IDEyLCB5aWVsZFBlckhhcnZlc3Q6IDQsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHJvY2t5ID4gMC40NiAmJiByb2xsIDwgMC4zOCkge1xuICAgICAgICAvLyBDb25zdW1lIHRoZSByZXRpcmVkIHN0b25lIGZvcm0ncyByYW5kb20gZHJhd3MgYW5kIGFsbG9jYXRlIGl0cyBvbGRcbiAgICAgICAgLy8gc2VxdWVuY2UgSUQsIGJ1dCBkbyBub3QgaW5zZXJ0IGFuIGVudGl0eS4gTGF0ZXIgbmF0dXJhbCBwbGFjZW1lbnRzXG4gICAgICAgIC8vIHRoZXJlZm9yZSByZW1haW4gYnl0ZS1mb3ItYnl0ZSBjb21wYXRpYmxlIHdpdGggcmVjb3JkZWQgc2F2ZXMuXG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IGlkID0gZW50aXR5SWQoY2h1bmsua2V5LCBuKyspO1xuICAgICAgICBjb25zdCByZWNvcmQgPSB7XG4gICAgICAgICAgaWQsIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByZXNvdXJjZTogJ3N0b25lJyBhcyBjb25zdCxcbiAgICAgICAgICByZW1haW5pbmc6IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMixcbiAgICAgICAgICB5aWVsZFBlckhhcnZlc3Q6IDMsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgIH07XG4gICAgICAgIC8vIE9ubHkgZW50aXRpZXMgdGhhdCBleGlzdGVkIGluIGFuIGFjY2VwdGVkIG9sZCBzYXZlIGdldCB0b21ic3RvbmVzLFxuICAgICAgICAvLyBkdXJpbmcgZXhwbGljaXQgbWlncmF0aW9uLiBPcmRpbmFyeSBnZW5lcmF0aW9uIG11c3QgcmVzdG9yZSBleGFjdGx5LlxuICAgICAgICBpZiAoaXNTdG9uZVJlcGxheSh3b3JsZCkpIGFkZEVudGl0eSh3b3JsZCwgcmVjb3JkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuU1RPTkUgJiYgcm9ja3kgPiAwLjU4ICYmIHJvbGwgPCAwLjE4KSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfb3JlJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDIpLFxuICAgICAgICAgIHJlc291cmNlOiAnb3JlJywgcmVtYWluaW5nOiA4LCB5aWVsZFBlckhhcnZlc3Q6IDIsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDEgJiYgcm9sbCA8IDAuMzApIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9zaHJ1YicsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44ICsgcm5kKCkgKiAwLjQsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgICByZXNvdXJjZTogJ2ZpYmVyJywgcmVtYWluaW5nOiA0LCB5aWVsZFBlckhhcnZlc3Q6IDEsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkOiBXb3JsZCwga2luZDogRW50aXR5S2luZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgcm90OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsLCByZW1haW5pbmc6IG51bWJlciwgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmICh5IDw9IFNFQV9MRVZFTCkgcmV0dXJuO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgLy8gQSBoZXJvIGFzc2V0IG93bnMgaXRzIHNwb3Q6IGNsZWFyIGFueSBnZW5lcmF0ZWQgZW50aXR5IHRoYXQgd291bGQgb3ZlcmxhcFxuICAvLyBpdCwgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcgdGhlIGF1dGhvcmVkIGNvbXBvc2l0aW9uLlxuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW107XG4gIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSByZXR1cm47XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgTWF0aC5oeXBvdChlLnggLSB4LCBlLnogLSB6KSA8IDIuNikge1xuICAgICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICAgIH1cbiAgfVxuICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpKTtcbiAgLy8gQXV0aG9yZWQgY29tcG9zaXRpb24gaXMgZHVyYWJsZSBzdGF0ZTogaXQgY2FuIGNsZWFyIG92ZXJsYXBwaW5nIG5hdHVyYWxcbiAgLy8gZW50aXRpZXMsIHNvIHNhdmUgdGhlIGNvbXBsZXRlIGFmZmVjdGVkIGNodW5rIHJhdGhlciB0aGFuIG9ubHkgaXRzIGhlcm9lcy5cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcblxuICBjb25zdCBpZCA9IGBoZXJvOiR7a2luZH06JHtNYXRoLnJvdW5kKHgpfToke01hdGgucm91bmQoeil9YDtcbiAgY29uc3QgYmVmb3JlID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgY29uc3QgZW50aXR5OiBFbnRpdHkgPSB7XG4gICAgaWQsIGtpbmQsIGNodW5rOiBrZXksIHg6IHggKyAwLjUsIHksIHo6IHogKyAwLjUsXG4gICAgcm90LCBzY2FsZSwgdmFyaWFudCwgcmVzb3VyY2UsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogdHJ1ZSxcbiAgfTtcbiAgYWRkRW50aXR5KHdvcmxkLCBlbnRpdHkpO1xuICBpZiAod29ybGQuZW50aXRpZXMuc2l6ZSA+IGJlZm9yZSAmJiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB7XG4gICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSByZXR1cm47XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcblxuICBjb25zdCBzaXRlczogQXJyYXk8eyBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7IHg6IG51bWJlcjsgejogbnVtYmVyOyByb3Q6IG51bWJlciB9PiA9IFtcbiAgICB7IGtpbmQ6ICd3YXlzdG9uZScsIHg6IC0xMCwgejogLTE0LCByb3Q6IDAgfSxcbiAgICB7IGtpbmQ6ICdtYXJrZXInLCB4OiAtMzIsIHo6IC04LCByb3Q6IE1hdGguUEkgLyAyIH0sXG4gIF07XG4gIGZvciAoY29uc3QgcyBvZiBzaXRlcykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoeSA8PSBTRUFfTEVWRUwpIGNvbnRpbnVlO1xuICAgIHdvcmxkLnNpdGVzLnB1c2goe1xuICAgICAgaWQ6IGBzaXRlOiR7cy5raW5kfWAsXG4gICAgICBraW5kOiBzLmtpbmQsXG4gICAgICB4OiBzLnggKyAwLjUsIHksIHo6IHMueiArIDAuNSxcbiAgICAgIHJvdDogcy5yb3QsXG4gICAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgaGVybyBncm92ZSBjb21wb3NlZCBpbiB0aGUgZGVmYXVsdCBjYW1lcmEncyB2aWV3IGRpcmVjdGlvbi4gVGhlc2UgYXJlXG4gIC8vIFN0eWwgbmF0dXJhbCBhc3NldHMgKEFTLTAwMSB2MiksIG5vdCBOb3hlbCBhcmNoaXRlY3R1cmU7IHRoZSBOb3hlbFxuICAvLyB3YXlzdG9uZS9tYXJrZXIgYWJvdmUgcmVtYWluIHRoZSBodW1hbi1tYWRlIGxhbmRtYXJrcy5cbiAgY29uc3QgZ3JvdmU6IEFycmF5PFtFbnRpdHlLaW5kLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+ID0gW1xuICAgIFsnc3R5bF90cmVlX3NwaXJlJywgLTIyLCAtMjYsIDAsIDEuMDAsIDBdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTM0LCAtMTgsIDEsIDAuOTUsIE1hdGguUEkgLyAxMl0sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xNiwgLTM0LCAyLCAxLjAwLCBNYXRoLlBJIC8gNl0sXG4gICAgWydzdHlsX3RyZWVfYmxvc3NvbScsIC0yOCwgLTM4LCAwLCAwLjkwLCBNYXRoLlBJIC8gNF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtNDAsIC0zMCwgMiwgMS4wNSwgTWF0aC5QSSAvIDNdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTIsIC0yNCwgMCwgMC45MCwgTWF0aC5QSSAvIDIuNF0sXG4gIF07XG4gIGZvciAoY29uc3QgW2tpbmQsIHgsIHosIHZhcmlhbnQsIHNjYWxlLCByb3RdIG9mIGdyb3ZlKSB7XG4gICAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsIGtpbmQsIHgsIHosIHZhcmlhbnQsIHJvdCwgc2NhbGUsICd3b29kJywgMTIsIDQpO1xuICB9XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9yb2NrX21lZGl1bScsIC02LCAtMTAsIDAsIDAsIDEuMCwgJ3N0b25lJywgOCwgMyk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9zaHJ1YicsIC0xNCwgLTgsIDEsIE1hdGguUEkgLyAxMiwgMS4xLCAnZmliZXInLCA0LCAxKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX2NhaXJuJywgLTIwLCAtNiwgMCwgMCwgMS4wLCAnc3RvbmUnLCA2LCAyKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX29yZScsIC0zOCwgLTQyLCAwLCBNYXRoLlBJIC8gNCwgMS4xLCAnb3JlJywgOCwgMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZWFyZXN0SGFydmVzdGFibGUoXG4gIHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCByZXNvdXJjZT86IFJlc291cmNlVHlwZSxcbik6IEVudGl0eSB8IG51bGwge1xuICBsZXQgYmVzdDogRW50aXR5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0RCA9IHJhZGl1cyAqIHJhZGl1cztcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICAgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgY29udGludWU7XG4gICAgaWYgKHJlc291cmNlICYmIGUucmVzb3VyY2UgIT09IHJlc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBkID0gKGUueCAtIHgpICoqIDIgKyAoZS56IC0geikgKiogMjtcbiAgICBpZiAoZCA8IGJlc3REKSB7IGJlc3REID0gZDsgYmVzdCA9IGU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0UmVzdWx0IHsgZW50aXR5OiBFbnRpdHk7IHJlc291cmNlOiBSZXNvdXJjZVR5cGU7IGFtb3VudDogbnVtYmVyOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0RW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEhhcnZlc3RSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QgZSA9IGxpdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpO1xuICBpZiAod29ybGQubGlmZSAmJiBPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIG4pID0+IHN1bSArIG4sIDApICsgYW1vdW50ID4gMTIwKSByZXR1cm4gbnVsbDtcbiAgZS5yZW1haW5pbmcgLT0gYW1vdW50O1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBlLmhhcnZlc3RlZE9uY2UgPSB0cnVlO1xuICBpZiAoZS5yZW1haW5pbmcgPD0gMCkgZS5oYXJ2ZXN0ZWQgPSB0cnVlO1xuICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBlbnRpdHk6IGUsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuLyoqIFJlbW92ZSBldmVyeSByZXRpcmVkIHNvdXJjZSBhZnRlciB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheS4gVGhpcyBtaWdyYXRpb25cbiAqIGNyZWF0ZXMgZGV0ZXJtaW5pc3RpYyB0b21ic3RvbmVzIGJ1dCBpcyBub3QgYSBwbGF5ZXIgY29tbWFuZCBvciByZXZpc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXRpcmVTdG9uZUVudGl0aWVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IGUgb2YgWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXSkge1xuICAgIGlmICghaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpIGNvbnRpbnVlO1xuICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShlLmlkKTtcbiAgICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChlLmlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgICBpZiAoIXdvcmxkLmVudGl0eUNodW5rcy5oYXMoZS5jaHVuaykpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIGZvciAoY29uc3QgW2tleSwgaWRzXSBvZiB3b3JsZC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBhY3RpdmUgPSBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSk7XG4gICAgaWYgKGFjdGl2ZS5sZW5ndGggPiAwIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGtleSkpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBhY3RpdmUpO1xuICAgIGVsc2Ugd29ybGQuZW50aXR5Q2h1bmtzLmRlbGV0ZShrZXkpO1xuICB9XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwZXJzaXN0ZW5jZSAvIGF1dGhvcml0eSBib3VuZGFyeSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWFuaWZlc3Qge1xuICBzY2hlbWE6IDE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgcGFyYW1zSGFzaDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBmbnYxYSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaCA9IDB4ODExYzlkYzU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGggXj0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGggPSBNYXRoLmltdWwoaCwgMHgwMTAwMDE5Myk7XG4gIH1cbiAgcmV0dXJuIChoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkTWFuaWZlc3Qod29ybGQ6IFdvcmxkKTogV29ybGRNYW5pZmVzdCB7XG4gIGNvbnN0IHAgPSB3b3JsZC5wYXJhbXM7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIHNlZWQ6IHdvcmxkLnNlZWQsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogcC5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIHNpemU6IHAuc2l6ZSxcbiAgICBjaHVua1NpemU6IHAuY2h1bmtTaXplLFxuICAgIHlNaW46IHAueU1pbixcbiAgICB5TWF4OiBwLnlNYXgsXG4gICAgc2VhTGV2ZWw6IHAuc2VhTGV2ZWwsXG4gICAgcGFyYW1zSGFzaDogZm52MWEoSlNPTi5zdHJpbmdpZnkocCkpLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsRWRpdCB7IGk6IG51bWJlcjsgbTogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBzY2hlbWE6IDE7XG4gIGtleTogc3RyaW5nO1xuICBiYXNlVmVyc2lvbjogbnVtYmVyO1xuICBlZGl0czogVm94ZWxFZGl0W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBDaHVua0RlbHRhIHtcbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAga2V5LFxuICAgIGJhc2VWZXJzaW9uOiB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBlZGl0czogZWRpdHMgPyBbLi4uZWRpdHMuZW50cmllcygpXS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSkuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKSA6IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwgZGVsdGE6IENodW5rRGVsdGEpOiB2b2lkIHtcbiAgY29uc3QgW2N4LCBjel0gPSBkZWx0YS5rZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgZm9yIChjb25zdCBlIG9mIGRlbHRhLmVkaXRzKSB7XG4gICAgY29uc3QgeUluZGV4ID0gTWF0aC5mbG9vcihlLmkgLyBDSFVOS19BUkVBKTtcbiAgICBjb25zdCByZW0gPSBlLmkgJSBDSFVOS19BUkVBO1xuICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcihyZW0gLyBDSFVOS19TSVpFKTtcbiAgICBjb25zdCBseCA9IHJlbSAlIENIVU5LX1NJWkU7XG4gICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseDtcbiAgICBjb25zdCB5ID0gWV9NSU4gKyB5SW5kZXg7XG4gICAgY29uc3QgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICBzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgZS5tIGFzIE1hdElkKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIHRpbWUgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBUaW1lU3RhdGUgeyB0OiBudW1iZXI7IGRheUxlbmd0aFNlYzogbnVtYmVyOyBwYXVzZWQ6IGJvb2xlYW47IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaW1lKHM6IFRpbWVTdGF0ZSwgZHQ6IG51bWJlcik6IHZvaWQge1xuICBpZiAocy5wYXVzZWQpIHJldHVybjtcbiAgcy50ID0gKHMudCArIGR0IC8gcy5kYXlMZW5ndGhTZWMpICUgMTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxPQUFPLFVBQVU7QUFDakIsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYSxvQkFBb0I7QUFDMUMsU0FBUyxNQUFNLGVBQWU7OztBQ0s5QixJQUFNLFNBQVMsb0JBQUksUUFBNkI7QUFlekMsU0FBUyxjQUFjLE9BQXdCO0FBQ3BELFNBQU8sT0FBTyxJQUFJLEtBQUssR0FBRyxVQUFVO0FBQ3RDOzs7QUN0Qk8sSUFBTSxRQUFRLENBQUMsR0FBVyxHQUFXLE1BQWUsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUk7QUFDNUUsSUFBTSxPQUFPLENBQUMsR0FBVyxHQUFXLE1BQWMsS0FBSyxJQUFJLEtBQUs7QUFDaEUsSUFBTSxhQUFhLENBQUMsSUFBWSxJQUFZLE1BQWM7QUFDL0QsUUFBTSxJQUFJLE9BQU8sSUFBSSxPQUFPLEtB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QUNqRCxTQUFPLFNBQVMsbUJBQW1CLE9BQU8sS0FBTSxHQUFHLEtBQU0sR0FBRyxLQUFLLE1BQU0sR0FBRyxJQUFJLEtBQU0sRUFBRTtBQUN4RixDQUFDO0FBRUQsS0FBSyw0Q0FBNEMsTUFBTTtBQUNyRCxRQUFNLFFBQVEsY0FBYyxNQUFNLENBQUM7QUFDbkMsUUFBTSxXQUFXLGNBQWMsS0FBSztBQUNwQyxTQUFPLE1BQU0sU0FBUyxRQUFRLENBQUM7QUFDL0IsU0FBTyxNQUFNLFNBQVMsTUFBTSxJQUFJO0FBQ2hDLFNBQU8sTUFBTSxTQUFTLGtCQUFrQixpQkFBaUI7QUFDekQsU0FBTyxNQUFNLFNBQVMsTUFBTSxVQUFVO0FBQ3RDLFNBQU8sTUFBTSxTQUFTLFdBQVcsVUFBVTtBQUMzQyxTQUFPLE1BQU0sU0FBUyxNQUFNLEtBQUs7QUFDakMsU0FBTyxNQUFNLFNBQVMsTUFBTSxLQUFLO0FBQ2pDLFNBQU8sTUFBTSxTQUFTLFVBQVUsU0FBUztBQUN6QyxTQUFPLE1BQU0sU0FBUyxZQUFZLGVBQWU7QUFDbkQsQ0FBQztBQUVELEtBQUssNkRBQTZELE1BQU07QUFDdEUsUUFBTSxNQUFNLFFBQVEsUUFBUSxJQUFJLEdBQUcsU0FBUztBQUM1QyxRQUFNLFFBQVEsWUFBWSxHQUFHLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLEtBQUssQ0FBQztBQUM5RCxTQUFPLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFDMUIsYUFBVyxLQUFLLE9BQU87QUFDckIsVUFBTSxPQUFPLGFBQWEsS0FBSyxLQUFLLENBQUMsR0FBRyxNQUFNO0FBQzlDLFdBQU8sR0FBRyxDQUFDLHVCQUF1QixLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsZ0JBQWdCO0FBQ2xFLFdBQU8sR0FBRyxDQUFDLDhCQUE4QixLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsdUJBQXVCO0FBQUEsRUFDbEY7QUFDRixDQUFDO0FBRUQsS0FBSyxrREFBa0QsTUFBTTtBQUMzRCxRQUFNLFFBQVEsY0FBYyxNQUFNLENBQUM7QUFDbkMsUUFBTSxRQUFRLE1BQU0sT0FBTyxJQUFJLE9BQU87QUFDdEMsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU0sR0FBRztBQUN6QyxhQUFTLEtBQUssR0FBRyxLQUFLLFlBQVksTUFBTSxHQUFHO0FBQ3pDLFlBQU0sSUFBSSxhQUFhLEVBQUUsSUFBSTtBQUM3QixZQUFNLElBQUksYUFBYSxFQUFFLElBQUk7QUFDN0IsWUFBTSxJQUFJLFVBQVUsT0FBTyxHQUFHLENBQUMsSUFBSTtBQUNuQyxZQUFNLE1BQU0sV0FBVyxJQUFJLElBQUksT0FBTyxFQUFFO0FBQ3hDLGFBQU8sTUFBTSxNQUFNLEtBQUssR0FBRyxHQUFHLFNBQVMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDeEQ7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiYSIsICJiIiwgInNtb290aCIsICJpZCJdCn0K
