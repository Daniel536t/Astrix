// tests/m002.remediation.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// src/sim/stone-compat.ts
var states = /* @__PURE__ */ new WeakMap();
function replayStoneState(world) {
  let state = states.get(world);
  if (!state) {
    state = { active: false, historicalHash: false, migrated: false };
    states.set(world, state);
  }
  return state;
}
function isStoneReplay(world) {
  return states.get(world)?.active ?? false;
}
function isHistoricalStoneHash(world) {
  return states.get(world)?.historicalHash ?? false;
}
function finishStoneReplay(world) {
  const state = replayStoneState(world);
  state.active = false;
  state.historicalHash = false;
  state.migrated = true;
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
      const m2 = (fbm2(s / 60, 3.1, seed + 801, 2) - 0.5) * 14;
      resampled.push({ x: dense[i].x + m2, z: dense[i].z, s });
      acc = 0;
    }
  }
  const total2 = resampled[resampled.length - 1].s;
  const levelAt = (sv) => {
    let level = sv * UPPER_GRADIENT;
    for (const [frac, drop] of FALLS) {
      level += drop * smoothstep(total2 * frac - 5, total2 * frac + 5, sv);
    }
    return sv < 40 ? 0 : level - 40 * UPPER_GRADIENT;
  };
  const points = resampled.map((p) => ({
    x: p.x,
    z: p.z,
    s: p.s,
    level: Math.max(0, levelAt(p.s)),
    width: 3.2 + 2.2 * fbm2(p.s / 70, 9.7, seed + 802, 2) + (1 - p.s / total2) * 1.5
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
var isSolid = (m2) => m2 !== MAT.AIR && m2 !== MAT.WATER;
var MAX_MAT_ID = 10;

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
        let m2;
        if (y === Y_MIN) m2 = MAT.BEDROCK;
        else if (depth === 0) m2 = top;
        else if (depth <= 2) m2 = sub;
        else m2 = MAT.STONE;
        if (m2 === MAT.STONE && depth > 4 && orePotential && oreAt(seed, wx, y, wz)) {
          m2 = MAT.ORE;
        }
        if (depth <= 2 && slope >= 2 && overhangAt(seed, wx, y, wz)) {
          m2 = MAT.AIR;
        }
        if (m2 !== MAT.AIR && depth > 7 && depth < 24 && caveAt(seed, wx, y, wz)) {
          m2 = MAT.AIR;
        }
        if (m2 !== MAT.AIR) {
          data[localIndex(lx, yToIndex(y), lz)] = m2;
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
        const m2 = data[localIndex(lx, yToIndex(y), lz)];
        if (isSolid(m2)) {
          topSolid = y;
          topMat = m2;
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
    for (const [idx, m2] of edits) {
      chunk.data[idx] = m2;
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
function evictChunk(world, key) {
  if (!world.chunks.has(key)) return false;
  world.chunks.delete(key);
  world.stats.chunksEvicted++;
  return true;
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
function setVoxel(world, x, y, z, m2) {
  if (y < Y_MIN || y >= Y_MAX) return false;
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return false;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const idx = localIndex(worldToLocalX(x), yToIndex(y), worldToLocalZ(z));
  const previousEdit = world.edits.get(chunkKey(cx, cz))?.get(idx);
  if (previousEdit === m2) return false;
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return false;
  let edits = world.edits.get(chunk.key);
  if (!edits) {
    edits = /* @__PURE__ */ new Map();
    world.edits.set(chunk.key, edits);
  }
  if (chunk.data[idx] === m2) {
    if (!edits.has(idx)) edits.set(idx, m2);
    return false;
  }
  chunk.data[idx] = m2;
  edits.set(idx, m2);
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
    const m2 = chunk.data[localIndex(lx, yToIndex(topSolid), lz)];
    if (m2 !== MAT.WATER) chunk.topMaterials[lz * CHUNK_SIZE + lx] = m2;
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
function removeEntity(world, id) {
  const e = world.entities.get(id);
  if (!e || isRetiredStoneKind(e.kind) && !isStoneReplay(world)) return false;
  world.entities.delete(id);
  const list = world.entityChunks.get(e.chunk);
  if (list) {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) world.entityChunks.set(e.chunk, []);
  }
  world.entityChanges.add(e.chunk);
  if (!e.authored) world.entityRemovals.add(id);
  if (e.kind.startsWith("styl_tree")) world.stats.trees = Math.max(0, world.stats.trees - 1);
  if (e.kind === "styl_tree_blossom") world.stats.pinkTrees = Math.max(0, world.stats.pinkTrees - 1);
  world.stats.entities = world.entities.size;
  world.revision++;
  return true;
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
function fnv1a(text2) {
  let h = 2166136261;
  for (let i = 0; i < text2.length; i++) {
    h ^= text2.charCodeAt(i);
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

// src/sim/terrain.ts
function normalizeRect(rect) {
  return {
    x0: Math.min(rect.x0, rect.x1),
    z0: Math.min(rect.z0, rect.z1),
    x1: Math.max(rect.x0, rect.x1),
    z1: Math.max(rect.z0, rect.z1)
  };
}
function rectColumns(rect) {
  const r = normalizeRect(rect);
  return (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
}
function expandRect(rect, amount) {
  return {
    x0: rect.x0 - amount,
    z0: rect.z0 - amount,
    x1: rect.x1 + amount,
    z1: rect.z1 + amount
  };
}
function envelopeContains(rects, x, y, z) {
  for (const r of rects) {
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && z >= r.z0 && z <= r.z1) return true;
  }
  return false;
}
var CLEARANCE_PROBE = 8;
function surfaceAtSafe(world, x, z, fallback) {
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return fallback;
  return surfaceAt(world, x, z);
}
function waterDepthAtColumn(world, x, z) {
  const surface = surfaceAt(world, x, z);
  if (surface >= SEA_LEVEL) return 0;
  if (getVoxel(world, x, SEA_LEVEL - 1, z) !== MAT.WATER) return 0;
  return SEA_LEVEL - surface;
}
function columnAt(world, x, z) {
  const cx = Math.floor(x), cz = Math.floor(z);
  const surfaceY = surfaceAt(world, cx, cz);
  const topMaterial = topMaterialAtWorld(world, cx, cz);
  const solid = surfaceY > Y_MIN && isSolid(topMaterial);
  const waterDepth = waterDepthAtColumn(world, cx, cz);
  const slope = Math.max(
    Math.abs(surfaceY - surfaceAtSafe(world, cx - 1, cz, surfaceY)),
    Math.abs(surfaceY - surfaceAtSafe(world, cx + 1, cz, surfaceY)),
    Math.abs(surfaceY - surfaceAtSafe(world, cx, cz - 1, surfaceY)),
    Math.abs(surfaceY - surfaceAtSafe(world, cx, cz + 1, surfaceY))
  );
  let clearance = 0;
  while (clearance < CLEARANCE_PROBE && getVoxel(world, cx, surfaceY + clearance, cz) === MAT.AIR) {
    clearance++;
  }
  return {
    x: cx,
    z: cz,
    surfaceY,
    topSolidY: surfaceY - 1,
    topMaterial,
    solid,
    waterDepth,
    underwater: waterDepth > 0,
    slope,
    clearance
  };
}
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
function entityChunksForRect(world, rect) {
  const r = normalizeRect(rect);
  const radius = Math.max(...Object.values(OBSTRUCTION_RADIUS), 1.5);
  const minCellX = Math.floor(r.x0 + 0.5 - radius);
  const maxCellX = Math.ceil(r.x1 + 0.5 + radius) - 1;
  const minCellZ = Math.floor(r.z0 + 0.5 - radius);
  const maxCellZ = Math.ceil(r.z1 + 0.5 + radius) - 1;
  const keys = [];
  const cx0 = Math.max(0, worldToChunkX(minCellX)), cx1 = worldToChunkX(maxCellX);
  const cz0 = Math.max(0, worldToChunkZ(minCellZ)), cz1 = worldToChunkZ(maxCellZ);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) keys.push(chunkKey(cx, cz));
  }
  return keys;
}
function obstructionsIn(world, rect) {
  const r = normalizeRect(rect);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const key of entityChunksForRect(world, r)) {
    const ids = world.entityChunks.get(key);
    if (!ids) continue;
    for (const id of ids) {
      if (seen.has(id)) continue;
      const e = world.entities.get(id);
      if (!e || isRetiredStoneKind(e.kind) && !isStoneReplay(world) || world.entityRemovals.has(e.id)) continue;
      seen.add(id);
      const radius = isRetiredStoneKind(e.kind) ? e.kind === "styl_rock_small" ? 0.6 : e.kind === "styl_rock_medium" ? 1.1 : 1.5 : OBSTRUCTION_RADIUS[e.kind];
      let cells = 0;
      const ex0 = Math.max(r.x0, Math.floor(e.x - radius - 0.5));
      const ex1 = Math.min(r.x1, Math.ceil(e.x + radius - 0.5));
      const ez0 = Math.max(r.z0, Math.floor(e.z - radius - 0.5));
      const ez1 = Math.min(r.z1, Math.ceil(e.z + radius - 0.5));
      for (let z = ez0; z <= ez1; z++) {
        for (let x = ex0; x <= ex1; x++) {
          if (Math.hypot(e.x - (x + 0.5), e.z - (z + 0.5)) <= radius) cells++;
        }
      }
      if (cells > 0) {
        out.push({ entityId: e.id, kind: e.kind, x: e.x, z: e.z, radius, cells });
      }
    }
  }
  out.sort((a, b) => a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0);
  return out;
}
var TerrainQuery = class {
  constructor(world) {
    this.world = world;
    this.revision = world.revision;
  }
  world;
  cache = /* @__PURE__ */ new Map();
  obstructionCache = /* @__PURE__ */ new Map();
  revision;
  sync() {
    if (this.revision !== this.world.revision) {
      this.cache.clear();
      this.obstructionCache.clear();
      this.revision = this.world.revision;
    }
  }
  /** Cached entity obstructions for one footprint. */
  obstructionsFor(rect) {
    this.sync();
    const r = normalizeRect(rect);
    const key = `${r.x0},${r.z0},${r.x1},${r.z1}`;
    let list = this.obstructionCache.get(key);
    if (!list) {
      list = obstructionsIn(this.world, r);
      this.obstructionCache.set(key, list);
    }
    return list;
  }
  column(x, z) {
    this.sync();
    const cx = Math.floor(x), cz = Math.floor(z);
    const key = `${cx},${cz}`;
    let col = this.cache.get(key);
    if (!col) {
      col = columnAt(this.world, cx, cz);
      this.cache.set(key, col);
    }
    return col;
  }
  area(rect, floorY) {
    this.sync();
    const r = normalizeRect(rect);
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let maxStep = 0;
    let waterColumns = 0;
    let stoneColumns = 0;
    let cutVolume = 0;
    let fillVolume = 0;
    let maxCut = 0;
    let maxFill = 0;
    const materials = {};
    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const col = this.column(x, z);
        minY = Math.min(minY, col.surfaceY);
        maxY = Math.max(maxY, col.surfaceY);
        sum += col.surfaceY;
        maxStep = Math.max(maxStep, col.slope);
        if (col.waterDepth > 0) waterColumns++;
        if (col.topMaterial === MAT.STONE) stoneColumns++;
        materials[col.topMaterial] = (materials[col.topMaterial] ?? 0) + 1;
        if (floorY !== void 0) {
          const dy = col.surfaceY - floorY;
          if (dy > 0) {
            cutVolume += dy;
            maxCut = Math.max(maxCut, dy);
          } else if (dy < 0) {
            fillVolume += -dy;
            maxFill = Math.max(maxFill, -dy);
          }
        }
      }
    }
    const obstructions = this.obstructionsFor(r);
    const obstructed = /* @__PURE__ */ new Set();
    for (const o of obstructions) {
      const radius = o.radius;
      const ex0 = Math.max(r.x0, Math.floor(o.x - radius - 0.5));
      const ex1 = Math.min(r.x1, Math.ceil(o.x + radius - 0.5));
      const ez0 = Math.max(r.z0, Math.floor(o.z - radius - 0.5));
      const ez1 = Math.min(r.z1, Math.ceil(o.z + radius - 0.5));
      for (let z = ez0; z <= ez1; z++) {
        for (let x = ex0; x <= ex1; x++) {
          if (Math.hypot(o.x - (x + 0.5), o.z - (z + 0.5)) <= radius) obstructed.add(`${x},${z}`);
        }
      }
    }
    const columns = (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
    return {
      rect: r,
      columns,
      minY,
      maxY,
      meanY: Math.round(sum / columns * 1e3) / 1e3,
      relief: maxY - minY,
      maxStep,
      waterColumns,
      stoneColumns,
      materials,
      obstructions,
      obstructedColumns: obstructed.size,
      floorY: floorY ?? null,
      cutVolume,
      fillVolume,
      maxCut,
      maxFill
    };
  }
  /**
   * Evaluate a complete building footprint. `floorY` is the prepared walking
   * floor: terrain above it is cut, terrain below it is filled. The result is
   * raw site data; construction rules live in construction.ts.
   */
  footprint(rect, floorY) {
    const stats = this.area(rect, floorY);
    const r = normalizeRect(rect);
    const support = {
      total: stats.columns,
      level: 0,
      cut: 0,
      fill: 0,
      water: 0,
      deepFill: 0,
      maxCut: 0,
      maxFill: 0,
      cutVolume: 0,
      fillVolume: 0
    };
    const overhangCells = [];
    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const col = this.column(x, z);
        const dy = col.surfaceY - floorY;
        if (dy > 0) {
          support.cut++;
          support.cutVolume += dy;
          support.maxCut = Math.max(support.maxCut, dy);
        } else if (dy < 0) {
          support.fill++;
          support.fillVolume += -dy;
          support.maxFill = Math.max(support.maxFill, -dy);
          if (-dy > 8) support.deepFill++;
        } else {
          support.level++;
        }
        if (col.waterDepth > 0) support.water++;
        const start = Math.max(floorY, col.surfaceY);
        for (let y = start; y < start + 4; y++) {
          const m2 = getVoxel(this.world, x, y, z);
          if (m2 !== MAT.AIR) overhangCells.push({ x, y, z, material: m2 });
        }
      }
    }
    return { rect: r, floorY, stats, support, obstructions: stats.obstructions, overhangCells };
  }
};

// src/sim/construction.ts
var HOUSE_RULES = {
  id: "house-8x6",
  width: 8,
  depth: 6,
  wallHeight: 3,
  clearance: 3,
  maxReliefNoPrep: 1.2,
  maxReliefPrepared: 4,
  maxStep: 1,
  maxCut: 2,
  maxFill: 2,
  maxCutVolume: 48,
  maxFillVolume: 48,
  maxObstructions: 0,
  requiresDry: true,
  foundation: "graded_pad"
};
var FARM_RULES = {
  id: "farm-12x8",
  width: 12,
  depth: 8,
  wallHeight: 0,
  clearance: 1,
  maxReliefNoPrep: 1.2,
  maxReliefPrepared: 6,
  maxStep: 1,
  maxCut: 2,
  maxFill: 2,
  maxCutVolume: 96,
  maxFillVolume: 96,
  maxObstructions: 4,
  requiresDry: true,
  foundation: "stepped_plinth"
};
var PATH_RULES = {
  id: "path-9x3",
  width: 9,
  depth: 3,
  wallHeight: 0,
  clearance: 1,
  maxReliefNoPrep: 2,
  maxReliefPrepared: 4,
  maxStep: 1,
  maxCut: 1,
  maxFill: 1,
  maxCutVolume: 32,
  maxFillVolume: 32,
  maxObstructions: 2,
  requiresDry: true,
  foundation: "deck"
};
function error(code, message, value, limit) {
  return { code, severity: "error", message, value, limit };
}
function prep(code, message, value, limit) {
  return { code, severity: "preparation", message, value, limit };
}
function validateSite(world, proposal, query = new TerrainQuery(world), footprint) {
  const rect = normalizeRect(proposal.rect);
  const rules = proposal.rules;
  const reasons = [];
  const fp = footprint ?? query.footprint(rect, proposal.floorY);
  const stats = fp.stats;
  if (rect.x0 < -HALF || rect.z0 < -HALF || rect.x1 >= HALF || rect.z1 >= HALF) {
    reasons.push(error("out_of_bounds", `footprint ${rect.x0},${rect.z0}..${rect.x1},${rect.z1} is outside the world`));
  }
  if (rect.x1 - rect.x0 + 1 !== rules.width || rect.z1 - rect.z0 + 1 !== rules.depth) {
    reasons.push(error(
      "footprint_mismatch",
      `footprint is ${rect.x1 - rect.x0 + 1} x ${rect.z1 - rect.z0 + 1} m, ${rules.width} x ${rules.depth} m required`
    ));
  }
  if (stats.relief > rules.maxReliefPrepared) {
    reasons.push(error(
      "slope_exceeded",
      `relief ${stats.relief} m exceeds the ${rules.maxReliefPrepared} m prepared limit`,
      stats.relief,
      rules.maxReliefPrepared
    ));
  }
  if (stats.maxStep > rules.maxStep) {
    reasons.push(error(
      "step_exceeded",
      `surface step ${stats.maxStep} m exceeds ${rules.maxStep} m`,
      stats.maxStep,
      rules.maxStep
    ));
  }
  if (stats.maxCut > rules.maxCut) {
    reasons.push(error(
      "cut_exceeded",
      `cut ${stats.maxCut} m exceeds ${rules.maxCut} m`,
      stats.maxCut,
      rules.maxCut
    ));
  }
  if (stats.maxFill > rules.maxFill) {
    reasons.push(error(
      "fill_exceeded",
      `fill ${stats.maxFill} m exceeds ${rules.maxFill} m`,
      stats.maxFill,
      rules.maxFill
    ));
  }
  if (stats.cutVolume > rules.maxCutVolume) {
    reasons.push(error(
      "cut_volume_exceeded",
      `cut volume ${stats.cutVolume} m\xB3 exceeds ${rules.maxCutVolume} m\xB3`,
      stats.cutVolume,
      rules.maxCutVolume
    ));
  }
  if (stats.fillVolume > rules.maxFillVolume) {
    reasons.push(error(
      "fill_volume_exceeded",
      `fill volume ${stats.fillVolume} m\xB3 exceeds ${rules.maxFillVolume} m\xB3`,
      stats.fillVolume,
      rules.maxFillVolume
    ));
  }
  if (rules.requiresDry && stats.waterColumns > 0) {
    reasons.push(error(
      "water",
      `${stats.waterColumns} footprint columns are underwater`,
      stats.waterColumns,
      0
    ));
  }
  if (stats.obstructions.length > rules.maxObstructions) {
    reasons.push(error(
      "footprint_obstructed",
      `${stats.obstructions.length} obstructions exceed the ${rules.maxObstructions} allowance`,
      stats.obstructions.length,
      rules.maxObstructions
    ));
  }
  if (fp.overhangCells.length > 0) {
    reasons.push(error(
      "overhang",
      `${fp.overhangCells.length} cells above the floor are blocked`,
      fp.overhangCells.length,
      0
    ));
  }
  const needsGrading = stats.relief > rules.maxReliefNoPrep || stats.cutVolume > 0 || stats.fillVolume > 0;
  const needsClearing = stats.obstructions.length > 0 && stats.obstructions.length <= rules.maxObstructions;
  if (needsGrading) {
    reasons.push(prep(
      "needs_grading",
      `grading required: ${stats.cutVolume} m\xB3 cut, ${stats.fillVolume} m\xB3 fill`,
      stats.cutVolume + stats.fillVolume
    ));
  }
  if (needsClearing) {
    reasons.push(prep(
      "needs_clearing",
      `${stats.obstructions.length} obstructions to clear`,
      stats.obstructions.length,
      rules.maxObstructions
    ));
  }
  const hasError = reasons.some((r) => r.severity === "error");
  const hasPrep = reasons.some((r) => r.severity === "preparation");
  const state = hasError ? "invalid" : hasPrep ? "valid_with_preparation" : "valid";
  return {
    siteId: proposal.siteId,
    state,
    reasons,
    query: fp,
    preparation: {
      needsGrading,
      needsClearing,
      cutVolume: stats.cutVolume,
      fillVolume: stats.fillVolume,
      maxCut: stats.maxCut,
      maxFill: stats.maxFill,
      obstructionIds: stats.obstructions.map((o) => o.entityId),
      foundation: rules.foundation
    }
  };
}

// src/sim/preparation.ts
var LOCAL_AUTHORITY = "local-stub";
var LOCAL_ENFORCEMENT = "local-simulation-only";
function digest(input) {
  let a = 2166136261;
  let b = 2654435769;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c + 158, 2246822507);
    b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
function planDigest(plan) {
  const lines = [
    "m002:prep-plan:v1",
    plan.siteId,
    `${plan.rect.x0},${plan.rect.z0},${plan.rect.x1},${plan.rect.z1}`,
    String(plan.floorY),
    plan.rules.id,
    String(plan.targets.length),
    plan.surfaceMaterial === null ? "surface:keep" : `surface:${plan.surfaceMaterial}`
  ];
  for (const t of plan.targets) lines.push(`t:${t.x},${t.z},${t.y}`);
  const clears = [...plan.clearEntityIds].sort();
  lines.push(`c:${clears.length}`);
  for (const id of clears) lines.push(`c:${id}`);
  for (const e of normalizeEnvelope(plan.envelope)) {
    lines.push(`e:${e.x0},${e.z0},${e.y0},${e.x1},${e.z1},${e.y1}`);
  }
  const x = plan.expected;
  lines.push(`x:${x.cutVolume},${x.fillVolume},${x.maxCut},${x.maxFill},${x.obstructions},${x.surfaceEdits},${x.totalEdits}`);
  return digest(lines.join("\n"));
}
function defaultTargets(world, rect, floorY) {
  const out = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) out.push({ x, z, y: floorY });
  }
  return out;
}
function sortedTargets(targets) {
  return [...targets].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
}
function targetStats(world, targets) {
  let cutVolume = 0, fillVolume = 0, maxCut = 0, maxFill = 0;
  let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const t of targets) {
    const surface = surfaceAt(world, t.x, t.z);
    minY = Math.min(minY, surface, t.y);
    maxY = Math.max(maxY, surface, t.y);
    if (surface > t.y) {
      const d = surface - t.y;
      cutVolume += d;
      maxCut = Math.max(maxCut, d);
    } else if (surface < t.y) {
      const d = t.y - surface;
      fillVolume += d;
      maxFill = Math.max(maxFill, d);
    }
  }
  return { cutVolume, fillVolume, maxCut, maxFill, relief: maxY - minY };
}
function targetRuleReasons(stats, rules) {
  const reasons = [];
  if (stats.relief > rules.maxReliefPrepared) {
    reasons.push(`relief ${stats.relief} m exceeds the ${rules.maxReliefPrepared} m prepared limit`);
  }
  if (stats.maxCut > rules.maxCut) {
    reasons.push(`cut ${stats.maxCut} m exceeds ${rules.maxCut} m`);
  }
  if (stats.maxFill > rules.maxFill) {
    reasons.push(`fill ${stats.maxFill} m exceeds ${rules.maxFill} m`);
  }
  if (stats.cutVolume > rules.maxCutVolume) {
    reasons.push(`cut volume ${stats.cutVolume} m\xB3 exceeds ${rules.maxCutVolume} m\xB3`);
  }
  if (stats.fillVolume > rules.maxFillVolume) {
    reasons.push(`fill volume ${stats.fillVolume} m\xB3 exceeds ${rules.maxFillVolume} m\xB3`);
  }
  return reasons;
}
function planPreparation(world, proposal, options = {}) {
  const rect = normalizeRect(proposal.rect);
  const validation = validateSite(world, proposal);
  if (validation.state === "invalid") {
    return {
      ok: false,
      stage: "plan",
      code: "site_invalid",
      reasons: validation.reasons.map((r) => `${r.code}: ${r.message}`),
      validation
    };
  }
  const targets = sortedTargets(options.targets ?? defaultTargets(world, rect, proposal.floorY));
  const columns = rectColumns(rect);
  if (targets.length !== columns) {
    return {
      ok: false,
      stage: "plan",
      code: "target_count",
      reasons: [`plan has ${targets.length} targets for ${columns} columns`],
      validation
    };
  }
  const seen = /* @__PURE__ */ new Set();
  for (const t of targets) {
    const key = `${t.x},${t.z}`;
    if (seen.has(key)) {
      return {
        ok: false,
        stage: "plan",
        code: "duplicate_target",
        reasons: [`duplicate target at ${key}`],
        validation
      };
    }
    seen.add(key);
    if (t.x < rect.x0 || t.x > rect.x1 || t.z < rect.z0 || t.z > rect.z1) {
      return {
        ok: false,
        stage: "plan",
        code: "target_outside_footprint",
        reasons: [`target ${key} is outside ${rect.x0},${rect.z0}..${rect.x1},${rect.z1}`],
        validation
      };
    }
    if (!Number.isInteger(t.y) || t.y < Y_MIN || t.y >= Y_MAX) {
      return {
        ok: false,
        stage: "plan",
        code: "target_height",
        reasons: [`target ${key} has invalid height ${t.y}`],
        validation
      };
    }
  }
  const obstructions = validation.preparation.obstructionIds;
  const clear = options.clear ?? "obstructions";
  if (clear === "none" && obstructions.length > 0) {
    return {
      ok: false,
      stage: "plan",
      code: "uncleared_obstructions",
      reasons: [`${obstructions.length} obstructions would remain`],
      validation
    };
  }
  const clearEntityIds = clear === "none" ? [] : [...new Set(obstructions)].sort();
  const surfaceMaterial = options.surfaceMaterial ?? null;
  const customTargets = options.targets !== void 0;
  const stats = customTargets ? targetStats(world, targets) : {
    cutVolume: validation.preparation.cutVolume,
    fillVolume: validation.preparation.fillVolume,
    maxCut: validation.preparation.maxCut,
    maxFill: validation.preparation.maxFill,
    relief: validation.query.stats.relief
  };
  if (customTargets) {
    const reasons = targetRuleReasons(stats, proposal.rules);
    if (reasons.length > 0) {
      return {
        ok: false,
        stage: "plan",
        code: "target_rules",
        reasons,
        validation
      };
    }
  }
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const t of targets) {
    const surface = surfaceAt(world, t.x, t.z);
    lo = Math.min(lo, surface, t.y);
    hi = Math.max(hi, surface - 1, t.y - 1);
  }
  const buffered = expandRect(rect, 1);
  const derived = {
    x0: Math.max(-HALF, buffered.x0),
    z0: Math.max(-HALF, buffered.z0),
    x1: Math.min(HALF - 1, buffered.x1),
    z1: Math.min(HALF - 1, buffered.z1),
    y0: Math.max(Y_MIN, lo - 1),
    y1: Math.min(Y_MAX - 1, hi + 1)
  };
  const envelope = normalizeEnvelope(options.envelope ?? [derived]);
  const surfaceEdits = surfaceMaterial === null ? 0 : targets.length;
  const plan = {
    id: "",
    siteId: proposal.siteId,
    rect,
    floorY: proposal.floorY,
    rules: proposal.rules,
    targets,
    clearEntityIds,
    surfaceMaterial,
    envelope,
    expected: {
      cutVolume: stats.cutVolume,
      fillVolume: stats.fillVolume,
      maxCut: stats.maxCut,
      maxFill: stats.maxFill,
      obstructions: clearEntityIds.length,
      surfaceEdits,
      totalEdits: stats.cutVolume + stats.fillVolume + surfaceEdits
    }
  };
  plan.id = `prep:${planDigest(plan)}`;
  return { ok: true, plan, validation };
}
var DEFAULT_LIMITS = {
  maxCutVolume: 256,
  maxFillVolume: 256,
  maxVoxelEdits: 1024,
  maxEntityRemovals: 16,
  maxTargets: 512
};
function regionContained(region, policy) {
  return policy.some((p) => region.x0 >= p.x0 && region.x1 <= p.x1 && region.z0 >= p.z0 && region.z1 <= p.z1 && region.y0 >= p.y0 && region.y1 <= p.y1);
}
var LocalAuthorizer = class {
  constructor(policy) {
    this.policy = policy;
    this.limits = { ...DEFAULT_LIMITS, ...policy.limits ?? {} };
  }
  policy;
  authority = LOCAL_AUTHORITY;
  enforcement = LOCAL_ENFORCEMENT;
  limits;
  authorize(world, plan) {
    const reasons = [];
    const rect = normalizeRect(plan.rect);
    if (plan.targets.length !== rectColumns(rect)) {
      reasons.push(`plan has ${plan.targets.length} targets for ${rectColumns(rect)} columns`);
    }
    if (plan.targets.length > this.limits.maxTargets) {
      reasons.push(`${plan.targets.length} targets exceed limit ${this.limits.maxTargets}`);
    }
    if (plan.expected.cutVolume > this.limits.maxCutVolume) {
      reasons.push(`cut ${plan.expected.cutVolume} exceeds limit ${this.limits.maxCutVolume}`);
    }
    if (plan.expected.fillVolume > this.limits.maxFillVolume) {
      reasons.push(`fill ${plan.expected.fillVolume} exceeds limit ${this.limits.maxFillVolume}`);
    }
    if (plan.expected.totalEdits > this.limits.maxVoxelEdits) {
      reasons.push(`planned edits exceed limit ${this.limits.maxVoxelEdits}`);
    }
    if (plan.clearEntityIds.length > this.limits.maxEntityRemovals) {
      reasons.push(`${plan.clearEntityIds.length} removals exceed limit ${this.limits.maxEntityRemovals}`);
    }
    if (new Set(plan.clearEntityIds).size !== plan.clearEntityIds.length) {
      reasons.push("duplicate entity removal ids");
    }
    if (plan.envelope.length === 0) {
      reasons.push("plan has no work envelope");
    }
    for (const region of plan.envelope) {
      if (!regionContained(region, this.policy.envelope)) {
        reasons.push(`envelope ${region.x0},${region.z0},${region.y0}..${region.x1},${region.z1},${region.y1} is outside the local policy`);
      }
    }
    for (const t of plan.targets) {
      if (!envelopeContains(plan.envelope, t.x, t.y, t.z) || t.y > Y_MIN && !envelopeContains(plan.envelope, t.x, t.y - 1, t.z)) {
        reasons.push(`target ${t.x},${t.z},${t.y} is not covered by the work envelope`);
      }
    }
    const current = obstructionsIn(world, rect).map((o) => o.entityId).sort();
    const planned = [...plan.clearEntityIds].sort();
    if (current.length !== planned.length || current.some((id, i) => id !== planned[i])) {
      reasons.push(`plan removals [${planned.join(",")}] do not match footprint obstructions [${current.join(",")}]`);
    }
    if (reasons.length > 0) return { ok: false, authorization: null, reasons };
    const token = {
      id: `local-stub:${planDigest(plan)}`,
      authority: LOCAL_AUTHORITY,
      enforcement: LOCAL_ENFORCEMENT,
      planDigest: planDigest(plan),
      envelope: normalizeEnvelope(plan.envelope),
      baseRevision: world.revision,
      limits: { ...this.limits }
    };
    return { ok: true, authorization: token, reasons: [] };
  }
};
var MATERIAL_NAMES = {
  [MAT.GRASS]: "grass",
  [MAT.SOIL]: "soil",
  [MAT.SAND]: "sand",
  [MAT.GRAVEL]: "gravel",
  [MAT.STONE]: "stone",
  [MAT.ORE]: "ore",
  [MAT.WATER]: "water",
  [MAT.BEDROCK]: "bedrock",
  [MAT.MOSS]: "moss"
};
function materialName(m2) {
  return MATERIAL_NAMES[m2] ?? `mat_${m2}`;
}
function fillMaterial(y, target) {
  return y === target - 1 ? MAT.GRASS : MAT.SOIL;
}
function fail(stage, code, reasons) {
  return { ok: false, stage, code, reasons };
}
function executePreparation(world, plan, authorization) {
  if (authorization.authority !== LOCAL_AUTHORITY || authorization.enforcement !== LOCAL_ENFORCEMENT) {
    return fail("execute", "unsupported_authority", [
      `authority ${authorization.authority}/${authorization.enforcement} is not the local stub`
    ]);
  }
  if (authorization.planDigest !== planDigest(plan)) {
    return fail("execute", "digest_mismatch", ["authorization does not match this plan"]);
  }
  if (authorization.baseRevision !== world.revision) {
    return fail("execute", "stale_authorization", [
      `authorization was issued at revision ${authorization.baseRevision}, world is at ${world.revision}`
    ]);
  }
  if (plan.envelope.some((r) => !regionContained(r, authorization.envelope))) {
    return fail("execute", "envelope_mismatch", ["plan envelope is wider than the authorization"]);
  }
  const rect = normalizeRect(plan.rect);
  const edits = [];
  for (const t of plan.targets) {
    const surface = surfaceAt(world, t.x, t.z);
    if (t.y < surface) {
      for (let y = t.y; y < surface; y++) {
        const before = getVoxel(world, t.x, y, t.z);
        if (isSolid(before)) edits.push({ x: t.x, y, z: t.z, before, after: MAT.AIR });
      }
    } else if (t.y > surface) {
      for (let y = surface; y < t.y; y++) {
        const before = getVoxel(world, t.x, y, t.z);
        if (!isSolid(before)) {
          const after = plan.surfaceMaterial !== null && y === t.y - 1 ? plan.surfaceMaterial : fillMaterial(y, t.y);
          edits.push({ x: t.x, y, z: t.z, before, after });
        }
      }
    }
    if (plan.surfaceMaterial !== null) {
      const topY = t.y - 1;
      const before = getVoxel(world, t.x, topY, t.z);
      if (isSolid(before) && before !== plan.surfaceMaterial) {
        edits.push({
          x: t.x,
          y: topY,
          z: t.z,
          before,
          after: plan.surfaceMaterial,
          surface: true
        });
      }
    }
  }
  const reasons = [];
  for (const e of edits) {
    if (e.x < rect.x0 || e.x > rect.x1 || e.z < rect.z0 || e.z > rect.z1) {
      reasons.push(`edit ${e.x},${e.y},${e.z} is outside the footprint`);
    }
    if (!envelopeContains(authorization.envelope, e.x, e.y, e.z)) {
      reasons.push(`edit ${e.x},${e.y},${e.z} is outside the authorized envelope`);
    }
  }
  const cutVolume = edits.filter((e) => e.after === MAT.AIR && isSolid(e.before)).length;
  const fillVolume = edits.filter((e) => e.after !== MAT.AIR && !isSolid(e.before)).length;
  if (cutVolume > authorization.limits.maxCutVolume) {
    reasons.push(`cut ${cutVolume} exceeds limit ${authorization.limits.maxCutVolume}`);
  }
  if (fillVolume > authorization.limits.maxFillVolume) {
    reasons.push(`fill ${fillVolume} exceeds limit ${authorization.limits.maxFillVolume}`);
  }
  if (edits.length > authorization.limits.maxVoxelEdits) {
    reasons.push(`${edits.length} edits exceed limit ${authorization.limits.maxVoxelEdits}`);
  }
  const current = obstructionsIn(world, rect).map((o) => o.entityId).sort();
  const planned = [...plan.clearEntityIds].sort();
  if (current.length !== planned.length || current.some((id, i) => id !== planned[i])) {
    reasons.push("footprint obstructions changed after authorization");
  }
  if (plan.clearEntityIds.length > authorization.limits.maxEntityRemovals) {
    reasons.push(`${plan.clearEntityIds.length} removals exceed limit ${authorization.limits.maxEntityRemovals}`);
  }
  for (const id of plan.clearEntityIds) {
    if (!world.entities.has(id)) reasons.push(`entity ${id} no longer exists`);
  }
  if (world.life) {
    let recovered = 0;
    for (const id of plan.clearEntityIds) {
      const entity = world.entities.get(id);
      if (entity?.resource && entity.remaining > 0) recovered += entity.remaining;
    }
    if (Object.values(world.inventory).reduce((sum, amount) => sum + amount, 0) + recovered > 120) {
      reasons.push("resources recovered during site clearing would exceed carried capacity 120");
    }
  }
  if (reasons.length > 0) return fail("execute", "unauthorized_edits", reasons);
  const inventoryBefore = inventorySnapshot(world);
  const revisionBefore = world.revision;
  const chunkDeltas = /* @__PURE__ */ new Map();
  const cutByMaterial = {};
  const fillByMaterial = {};
  let applied = 0;
  let surfaceEdits = 0;
  for (const e of edits) {
    if (!setVoxel(world, e.x, e.y, e.z, e.after)) continue;
    applied++;
    if (e.surface) surfaceEdits++;
    const key = chunkKey(worldToChunkX(e.x), worldToChunkZ(e.z));
    let delta = chunkDeltas.get(key);
    if (!delta) {
      delta = { chunk: key, changed: 0, added: 0, removed: 0 };
      chunkDeltas.set(key, delta);
    }
    delta.changed++;
    const wasSolid = isSolid(e.before);
    const isNowSolid = isSolid(e.after);
    if (!wasSolid && isNowSolid) delta.added++;
    if (wasSolid && !isNowSolid) delta.removed++;
    const name = materialName(e.before);
    if (wasSolid && !isNowSolid) cutByMaterial[name] = (cutByMaterial[name] ?? 0) + 1;
    if (!wasSolid && isNowSolid) fillByMaterial[materialName(e.after)] = (fillByMaterial[materialName(e.after)] ?? 0) + 1;
  }
  const entitiesCleared = [];
  const resourcesGained = {};
  for (const id of [...plan.clearEntityIds].sort()) {
    const e = world.entities.get(id);
    if (!e) continue;
    const amount = e.resource && e.remaining > 0 ? e.remaining : 0;
    if (e.resource && amount > 0) {
      world.inventory[e.resource] = (world.inventory[e.resource] ?? 0) + amount;
      resourcesGained[e.resource] = (resourcesGained[e.resource] ?? 0) + amount;
    }
    removeEntity(world, id);
    entitiesCleared.push({
      entityId: id,
      kind: e.kind,
      resource: e.resource,
      amount,
      x: e.x,
      y: e.y,
      z: e.z
    });
  }
  const cut = applied > 0 ? Object.values(cutByMaterial).reduce((a, b) => a + b, 0) : 0;
  const fill = applied > 0 ? Object.values(fillByMaterial).reduce((a, b) => a + b, 0) : 0;
  const ledger = {
    authority: LOCAL_AUTHORITY,
    enforcement: LOCAL_ENFORCEMENT,
    authorizationId: authorization.id,
    planDigest: authorization.planDigest,
    siteId: plan.siteId,
    rect,
    floorY: plan.floorY,
    cutVolume: cut,
    fillVolume: fill,
    netSpoil: cut - fill,
    borrowedFill: Math.max(0, fill - cut),
    cutByMaterial,
    fillByMaterial,
    voxelEdits: applied,
    surfaceEdits,
    entitiesCleared,
    resourcesGained,
    inventoryBefore,
    inventoryAfter: inventorySnapshot(world),
    chunkDeltas: [...chunkDeltas.values()].sort((a, b) => a.chunk.localeCompare(b.chunk)),
    revisionBefore,
    revisionAfter: world.revision
  };
  return { ok: true, plan, authorization, ledger };
}
function prepareSite(world, authorizer, proposal, options = {}) {
  const planned = planPreparation(world, proposal, options);
  if (!planned.ok) return planned;
  const decision = authorizer.authorize(world, planned.plan);
  if (!decision.ok || !decision.authorization) {
    return fail("authorize", "not_authorized", decision.reasons);
  }
  return executePreparation(world, planned.plan, decision.authorization);
}

// src/sim/structures.ts
var FOUNDER_DESIGN_VERSION = 2;
var HOUSE_COST = { wood: 10, stone: 18 };
var TERRACE_COST = { wood: 6, stone: 12 };
function pathCost(width) {
  return { stone: width };
}
function digest2(input) {
  let a = 2166136261;
  let b = 2654435769;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c + 158, 2246822507);
    b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
function structureDigest(plan) {
  const lines = [
    "m002:structure-plan:v1",
    plan.kind,
    plan.siteId,
    `${plan.rect.x0},${plan.rect.z0},${plan.rect.x1},${plan.rect.z1}`,
    String(plan.floorY),
    `${plan.origin.x},${plan.origin.y},${plan.origin.z}`,
    String(plan.rot),
    ...plan.designVersion === FOUNDER_DESIGN_VERSION ? ["design:2"] : [],
    `m:${plan.modules.length}`
  ];
  for (const m2 of plan.modules) {
    lines.push(`m:${m2.kind},${m2.x},${m2.y},${m2.z},${m2.w},${m2.h},${m2.d},${m2.rot ?? 0},${m2.tone ?? ""}`);
  }
  const costKeys = Object.keys(plan.cost).sort();
  lines.push(`cost:${costKeys.length}`);
  for (const key of costKeys) lines.push(`cost:${key},${plan.cost[key] ?? 0}`);
  for (const s of plan.surface) lines.push(`s:${s.x},${s.z},${s.y}`);
  for (const t of plan.terraces ?? []) lines.push(`t:${t.z0},${t.z1},${t.y}`);
  return digest2(lines.join("\n"));
}
function fail2(stage, code, reasons) {
  return { ok: false, stage, code, reasons };
}
function surfaceMismatches(world, samples) {
  const out = [];
  for (const s of samples) {
    const actual = surfaceAt(world, s.x, s.z);
    if (actual !== s.y) out.push({ x: s.x, z: s.z, expected: s.y, actual });
  }
  return out;
}
function footprintSurface(world, rect, y) {
  const out = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) out.push({ x, z, y });
  }
  return out;
}
function footprintEnvelope(rect, y0, y1, margin = 1) {
  const r = expandRect(rect, margin);
  return [{ ...r, y0, y1 }];
}
function moduleBounds(m2) {
  const r = Math.hypot(m2.w, m2.d) / 2;
  const halfW = (m2.rot ?? 0) === 0 ? m2.w / 2 : r;
  const halfD = (m2.rot ?? 0) === 0 ? m2.d / 2 : r;
  return {
    x0: m2.x - halfW,
    x1: m2.x + halfW,
    y0: m2.y,
    y1: m2.y + m2.h,
    z0: m2.z - halfD,
    z1: m2.z + halfD
  };
}
function moduleInsideEnvelope(m2, envelope) {
  const b = moduleBounds(m2);
  return envelope.some((e) => b.x0 >= e.x0 - 1e-6 && b.x1 <= e.x1 + 1 + 1e-6 && b.y0 >= e.y0 - 1e-6 && b.y1 <= e.y1 + 1 + 1e-6 && b.z0 >= e.z0 - 1e-6 && b.z1 <= e.z1 + 1 + 1e-6);
}
function costTotal(cost) {
  return Object.values(cost).reduce((a, b) => a + (b ?? 0), 0);
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function planHouse(world, proposal) {
  const rect = normalizeRect(proposal.rect);
  const width = rect.x1 - rect.x0 + 1;
  const depth = rect.z1 - rect.z0 + 1;
  if (width !== 8 || depth !== 6) {
    return fail2("plan", "footprint_mismatch", [`house needs 8 x 6 m, got ${width} x ${depth} m`]);
  }
  if (!proposal.door) {
    return fail2("plan", "missing_door", ["house plan needs a door column"]);
  }
  if (proposal.door.z < rect.z0 || proposal.door.z > rect.z1) {
    return fail2("plan", "door_outside", [`door z ${proposal.door.z} is outside ${rect.z0}..${rect.z1}`]);
  }
  const surface = footprintSurface(world, rect, proposal.floorY);
  const mismatches = surfaceMismatches(world, surface);
  if (mismatches.length > 0) {
    return fail2("plan", "site_not_prepared", mismatches.slice(0, 4).map(
      (m2) => `column ${m2.x},${m2.z} is at ${m2.actual}, expected ${m2.expected}`
    ));
  }
  const obstructions = obstructionsIn(world, rect);
  if (obstructions.length > 0) {
    return fail2("plan", "site_obstructed", obstructions.map((o) => o.entityId));
  }
  const floorY = proposal.floorY;
  const x0 = rect.x0, x1 = rect.x1 + 1;
  const z0 = rect.z0, z1 = rect.z1 + 1;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const doorZ = proposal.door.z + 0.5;
  const doorHalf = 0.6;
  const wallH = 3;
  const wallT = 0.5;
  const doorH = 2.2;
  const modules = [];
  modules.push({ kind: "floor", x: cx, y: floorY, z: cz, w: 8, h: 0.3, d: 6, tone: "stone_b" });
  modules.push({ kind: "roof", x: cx, y: floorY + wallH, z: cz, w: 8.4, h: 0.3, d: 6.4, tone: "stone" });
  modules.push({ kind: "wall", x: cx, y: floorY, z: z0 + wallT / 2, w: 8, h: wallH, d: wallT, tone: "stone" });
  modules.push({ kind: "wall", x: cx, y: floorY, z: z1 - wallT / 2, w: 8, h: wallH, d: wallT, tone: "stone" });
  modules.push({ kind: "wall", x: x0 + wallT / 2, y: floorY, z: cz, w: wallT, h: wallH, d: 6, tone: "stone" });
  const eastX = x1 - wallT / 2;
  const gap0 = doorZ - doorHalf;
  const gap1 = doorZ + doorHalf;
  const leftLen = gap0 - z0;
  const rightLen = z1 - gap1;
  if (leftLen > 0.05) {
    modules.push({
      kind: "wall",
      x: eastX,
      y: floorY,
      z: z0 + leftLen / 2,
      w: wallT,
      h: wallH,
      d: leftLen,
      tone: "stone"
    });
  }
  if (rightLen > 0.05) {
    modules.push({
      kind: "wall",
      x: eastX,
      y: floorY,
      z: gap1 + rightLen / 2,
      w: wallT,
      h: wallH,
      d: rightLen,
      tone: "stone"
    });
  }
  modules.push({
    kind: "lintel",
    x: eastX,
    y: floorY + doorH,
    z: doorZ,
    w: wallT,
    h: wallH - doorH,
    d: doorHalf * 2,
    tone: "stone_b"
  });
  modules.push({
    kind: "door",
    x: eastX,
    y: floorY,
    z: gap0,
    w: 0.18,
    h: doorH,
    d: 0.16,
    tone: "timber"
  });
  modules.push({
    kind: "door",
    x: eastX,
    y: floorY,
    z: gap1,
    w: 0.18,
    h: doorH,
    d: 0.16,
    tone: "timber"
  });
  modules.push({
    kind: "threshold",
    x: x1 + 0.35,
    y: floorY,
    z: doorZ,
    w: 0.9,
    h: 0.16,
    d: 1.3,
    tone: "ochre"
  });
  for (const wx of [cx - 2.2, cx + 2.2]) {
    modules.push({
      kind: "window",
      x: wx,
      y: floorY + 1.45,
      z: z1 - 0.02,
      w: 1,
      h: 1,
      d: 0.08,
      tone: "accent"
    });
  }
  modules.push({ kind: "parapet", x: cx, y: floorY + wallH + 0.3, z: cz - 3.05, w: 8.4, h: 0.4, d: 0.3, tone: "stone_b" });
  modules.push({ kind: "parapet", x: cx, y: floorY + wallH + 0.3, z: cz + 3.05, w: 8.4, h: 0.4, d: 0.3, tone: "stone_b" });
  modules.push({ kind: "parapet", x: cx - 4.05, y: floorY + wallH + 0.3, z: cz, w: 0.3, h: 0.4, d: 6.4, tone: "stone_b" });
  modules.push({ kind: "parapet", x: cx + 4.05, y: floorY + wallH + 0.3, z: cz, w: 0.3, h: 0.4, d: 6.4, tone: "stone_b" });
  const plan = {
    id: "",
    kind: "house",
    siteId: proposal.siteId,
    rect,
    floorY,
    origin: { x: cx, y: floorY, z: cz },
    rot: 0,
    modules,
    cost: { ...HOUSE_COST },
    envelope: footprintEnvelope(rect, floorY, floorY + 4, 2),
    surface
  };
  plan.id = `structure:${structureDigest(plan)}`;
  return { ok: true, plan };
}
function planPath(world, proposal) {
  const rect = normalizeRect(proposal.rect);
  const width = rect.x1 - rect.x0 + 1;
  const depth = rect.z1 - rect.z0 + 1;
  if (depth !== 3 || width < 3) {
    return fail2("plan", "footprint_mismatch", [`path needs a 3 m wide corridor, got ${width} x ${depth} m`]);
  }
  const centerZ = rect.z0 + 1;
  const surface = [];
  const heights = [];
  for (let x = rect.x0; x <= rect.x1; x++) {
    const y = surfaceAt(world, x, centerZ);
    heights.push(y);
    for (let z = rect.z0; z <= rect.z1; z++) surface.push({ x, z, y });
  }
  const mismatches = surfaceMismatches(world, surface);
  if (mismatches.length > 0) {
    return fail2("plan", "path_not_prepared", mismatches.slice(0, 4).map(
      (m2) => `column ${m2.x},${m2.z} is at ${m2.actual}, expected ${m2.expected}`
    ));
  }
  for (let i = 1; i < heights.length; i++) {
    const step = heights[i] - heights[i - 1];
    if (Math.abs(step) > 1) {
      return fail2("plan", "path_step", [`step ${step} m at x=${rect.x0 + i}`]);
    }
  }
  for (const s of surface) {
    const top = getVoxel(world, s.x, s.y - 1, s.z);
    if (top === MAT.WATER) {
      return fail2("plan", "path_wet", [`column ${s.x},${s.z} is wet`]);
    }
    if (top !== MAT.GRAVEL) {
      return fail2("plan", "path_surface", [
        `column ${s.x},${s.z} top is ${top}, expected gravel`
      ]);
    }
  }
  const obstructions = obstructionsIn(world, rect);
  if (obstructions.length > 0) {
    return fail2("plan", "path_obstructed", obstructions.map((o) => o.entityId));
  }
  const cz = centerZ + 0.5;
  const modules = [];
  for (let x = rect.x0; x <= rect.x1; x++) {
    const y = surfaceAt(world, x, centerZ);
    const mx = x + 0.5;
    modules.push({ kind: "path", x: mx, y, z: cz, w: 1, h: 0.12, d: 3, tone: "gravel" });
    modules.push({ kind: "curb", x: mx, y, z: rect.z0 + 0.075, w: 1, h: 0.22, d: 0.15, tone: "stone_b" });
    modules.push({ kind: "curb", x: mx, y, z: rect.z1 + 1 - 0.075, w: 1, h: 0.22, d: 0.15, tone: "stone_b" });
  }
  const minY = Math.min(...heights);
  const maxY = Math.max(...heights);
  const plan = {
    id: "",
    kind: "path",
    siteId: proposal.siteId,
    rect,
    floorY: proposal.floorY,
    origin: { x: (rect.x0 + rect.x1 + 1) / 2, y: minY, z: cz },
    rot: 0,
    modules,
    cost: pathCost(width),
    envelope: footprintEnvelope(rect, minY - 1, maxY + 2, 0),
    surface
  };
  plan.id = `structure:${structureDigest(plan)}`;
  return { ok: true, plan };
}
function planTerraces(world, proposal) {
  const rect = normalizeRect(proposal.rect);
  const width = rect.x1 - rect.x0 + 1;
  const depth = rect.z1 - rect.z0 + 1;
  const count = proposal.terraces ?? 3;
  if (width !== 12 || depth !== 8) {
    return fail2("plan", "footprint_mismatch", [`terraces need 12 x 8 m, got ${width} x ${depth} m`]);
  }
  if (count < 2 || count > 4) {
    return fail2("plan", "terrace_count", [`${count} terraces is outside 2..4`]);
  }
  const base = Math.floor(depth / count);
  const extra = depth % count;
  const bands = [];
  let z = rect.z0;
  const medians = [];
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    const z0 = z, z1 = z + size - 1;
    const values = [];
    for (let bz = z0; bz <= z1; bz++) {
      for (let x = rect.x0; x <= rect.x1; x++) values.push(surfaceAt(world, x, bz));
    }
    medians.push(median(values));
    bands.push({ z0, z1, y: 0 });
    z = z1 + 1;
  }
  for (let i = 0; i < bands.length; i++) {
    bands[i].y = i === 0 ? medians[0] : Math.min(medians[i], bands[i - 1].y - 1);
  }
  let maxCut = 0, maxFill = 0, cutVolume = 0, fillVolume = 0;
  const surface = [];
  for (const b of bands) {
    for (let bz = b.z0; bz <= b.z1; bz++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const s = surfaceAt(world, x, bz);
        surface.push({ x, z: bz, y: b.y });
        const d = s - b.y;
        if (d > 0) {
          cutVolume += d;
          maxCut = Math.max(maxCut, d);
        }
        if (d < 0) {
          fillVolume += -d;
          maxFill = Math.max(maxFill, -d);
        }
      }
    }
  }
  if (maxCut > FARM_RULES.maxCut || maxFill > FARM_RULES.maxFill || cutVolume > FARM_RULES.maxCutVolume || fillVolume > FARM_RULES.maxFillVolume) {
    return fail2("plan", "terrace_earthwork", [
      `cut ${cutVolume} m\xB3 / fill ${fillVolume} m\xB3, max ${maxCut}/${maxFill} m`
    ]);
  }
  const mismatches = surfaceMismatches(world, surface);
  if (mismatches.length > 0) {
    return fail2("plan", "site_not_prepared", mismatches.slice(0, 4).map(
      (m2) => `column ${m2.x},${m2.z} is at ${m2.actual}, expected ${m2.expected}`
    ));
  }
  const obstructions = obstructionsIn(world, rect);
  if (obstructions.length > 0) {
    return fail2("plan", "site_obstructed", obstructions.map((o) => o.entityId));
  }
  for (const s of surface) {
    const top = getVoxel(world, s.x, s.y - 1, s.z);
    if (top !== MAT.SOIL) {
      return fail2("plan", "terrace_surface", [
        `column ${s.x},${s.z} top is ${top}, expected soil`
      ]);
    }
  }
  const cx = (rect.x0 + rect.x1 + 1) / 2;
  const modules = [];
  for (const b of bands) {
    const bz = (b.z0 + b.z1 + 1) / 2;
    modules.push({
      kind: "soil_bed",
      x: cx,
      y: b.y,
      z: bz,
      w: width,
      h: 0.18,
      d: b.z1 - b.z0 + 1,
      tone: "soil"
    });
    const rowDepth = b.z1 - b.z0 + 1;
    for (let r = 0; r < 3; r++) {
      const t = (r + 1) / 4;
      modules.push({
        kind: "crop_row",
        x: cx,
        y: b.y + 0.18,
        z: b.z0 + rowDepth * t,
        w: width - 1.2,
        h: 0.28,
        d: 0.36,
        tone: "crop"
      });
    }
  }
  for (let i = 1; i < bands.length; i++) {
    const upper = bands[i - 1];
    const lower = bands[i];
    modules.push({
      kind: "retaining_wall",
      x: cx,
      y: lower.y,
      z: upper.z1 + 0.5,
      w: width,
      h: upper.y - lower.y,
      d: 0.4,
      tone: "stone_b"
    });
  }
  const minY = Math.min(...bands.map((b) => b.y));
  const maxY = Math.max(...bands.map((b) => b.y));
  const plan = {
    id: "",
    kind: "terrace",
    siteId: proposal.siteId,
    rect,
    floorY: proposal.floorY,
    origin: { x: cx, y: minY, z: (rect.z0 + rect.z1 + 1) / 2 },
    rot: 0,
    modules,
    cost: { ...TERRACE_COST },
    envelope: footprintEnvelope(rect, minY - 1, maxY + 2, 1),
    surface,
    terraces: bands
  };
  plan.id = `structure:${structureDigest(plan)}`;
  return { ok: true, plan };
}
function planStructure(world, proposal) {
  if (proposal.designVersion === FOUNDER_DESIGN_VERSION) return planFounderDesign(world, proposal);
  if (proposal.designVersion !== void 0) {
    return fail2("plan", "unsupported_design", [`unsupported structure design ${String(proposal.designVersion)}`]);
  }
  if (proposal.kind === "house") return planHouse(world, proposal);
  if (proposal.kind === "path") return planPath(world, proposal);
  return planTerraces(world, proposal);
}
function planFounderDesign(world, proposal) {
  if (proposal.kind === "path") return planFounderPath(world, proposal);
  const planned = proposal.kind === "house" ? planHouse(world, proposal) : planTerraces(world, proposal);
  if (!planned.ok) return planned;
  if (proposal.kind === "terrace") {
    planned.plan.designVersion = FOUNDER_DESIGN_VERSION;
    planned.plan.id = `structure:${structureDigest(planned.plan)}`;
    return planned;
  }
  const rect = normalizeRect(proposal.rect);
  const x0 = rect.x0, x1 = rect.x1 + 1;
  const z0 = rect.z0, z1 = rect.z1 + 1;
  const y = proposal.floorY, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const t = 0.6, h = 3.2;
  const modules = [];
  const wall = (x, bottom, z, w, height, d, kind = "wall") => {
    modules.push({ kind, x, y: bottom, z, w, h: height, d, tone: "stone" });
  };
  wall(cx, y - 0.4, cz, 8, 0.4, 6, "floor");
  wall(cx, y, z0 + t / 2, 8, h, t);
  const innerZ0 = z0 + t, innerZ1 = z1 - t;
  wall(x0 + t / 2, y, (innerZ0 + innerZ1) / 2, t, h, innerZ1 - innerZ0);
  const doorZ = (proposal.door?.z ?? rect.z0) + 0.5;
  const door0 = doorZ - 0.6, door1 = doorZ + 0.6;
  const eastX = x1 - t / 2;
  wall(eastX, y, (innerZ0 + door0) / 2, t, h, door0 - innerZ0);
  wall(eastX, y, (door1 + innerZ1) / 2, t, h, innerZ1 - door1);
  wall(eastX, y + 2.2, doorZ, t, 0.4, 1.2, "lintel");
  wall(eastX, y + 2.6, doorZ, t, 0.6, 1.2);
  const southZ = z1 - t / 2;
  for (const [a, b] of [[x0 + t, cx - 2.6], [cx - 1.4, cx + 1.4], [cx + 2.6, x1 - t]]) {
    wall((a + b) / 2, y, southZ, b - a, h, t);
  }
  for (const wx of [cx - 2, cx + 2]) {
    wall(wx, y, southZ, 1.2, 1, t);
    wall(wx, y + 2.4, southZ, 1.2, 0.8, t, "lintel");
  }
  wall(cx, y + h, cz, 8, 0.4, 6, "roof");
  wall(cx, y + h + 0.4, z0 + 0.15, 8, 0.3, 0.3, "parapet");
  wall(cx, y + h + 0.4, z1 - 0.15, 8, 0.3, 0.3, "parapet");
  wall(cx - 3.85, y + h + 0.4, cz, 0.3, 0.3, 5.4, "parapet");
  wall(cx + 3.85, y + h + 0.4, cz, 0.3, 0.3, 5.4, "parapet");
  planned.plan.modules = modules;
  planned.plan.designVersion = FOUNDER_DESIGN_VERSION;
  planned.plan.envelope = footprintEnvelope(rect, y - 1, y + 4, 2);
  planned.plan.id = `structure:${structureDigest(planned.plan)}`;
  return planned;
}
function planFounderPath(world, proposal) {
  const planned = planPath(world, proposal);
  if (!planned.ok) return planned;
  const modules = [];
  const heights = planned.plan.modules.filter((m2) => m2.kind === "path").map((m2) => m2.y);
  const z0 = planned.plan.rect.z0, z1 = planned.plan.rect.z1 + 1;
  let start = 0;
  for (let end = 1; end <= heights.length; end++) {
    if (end < heights.length && heights[end] === heights[start]) continue;
    const x = planned.plan.rect.x0 + start, width = end - start;
    const cx = x + width / 2, y = heights[start];
    modules.push({ kind: "path", x: cx, y, z: (z0 + z1) / 2, w: width, h: 0.12, d: 3, tone: "gravel" });
    for (const z of [z0 + 0.075, z1 - 0.075]) {
      modules.push({ kind: "curb", x: cx, y, z, w: width, h: 0.22, d: 0.15, tone: "stone" });
    }
    start = end;
  }
  planned.plan.modules = modules;
  planned.plan.designVersion = FOUNDER_DESIGN_VERSION;
  planned.plan.id = `structure:${structureDigest(planned.plan)}`;
  return planned;
}
var DEFAULT_STRUCTURE_LIMITS = {
  maxModules: 64,
  maxCost: 128
};
var LocalStructureAuthorizer = class {
  constructor(policy, limits = {}) {
    this.policy = policy;
    this.limits = { ...DEFAULT_STRUCTURE_LIMITS, ...limits };
  }
  policy;
  authority = LOCAL_AUTHORITY;
  enforcement = LOCAL_ENFORCEMENT;
  limits;
  authorize(world, plan) {
    const reasons = [];
    if (plan.modules.length === 0) reasons.push("plan has no modules");
    if (plan.modules.length > this.limits.maxModules) {
      reasons.push(`${plan.modules.length} modules exceed limit ${this.limits.maxModules}`);
    }
    if (costTotal(plan.cost) > this.limits.maxCost) {
      reasons.push(`cost ${costTotal(plan.cost)} exceeds limit ${this.limits.maxCost}`);
    }
    for (const [resource, amount] of Object.entries(plan.cost)) {
      if (!Number.isInteger(amount) || (amount ?? 0) < 0) {
        reasons.push(`cost ${resource}=${amount} is not a non-negative integer`);
      }
    }
    if (plan.envelope.length === 0) reasons.push("plan has no work envelope");
    for (const region of plan.envelope) {
      if (!this.policy.envelope.some((p) => region.x0 >= p.x0 && region.x1 <= p.x1 && region.z0 >= p.z0 && region.z1 <= p.z1 && region.y0 >= p.y0 && region.y1 <= p.y1)) {
        reasons.push(`envelope ${region.x0},${region.z0},${region.y0}..${region.x1},${region.z1},${region.y1} is outside the local policy`);
      }
    }
    for (const m2 of plan.modules) {
      if (!moduleInsideEnvelope(m2, plan.envelope)) {
        reasons.push(`module ${m2.kind} at ${m2.x},${m2.y},${m2.z} is outside the plan envelope`);
      }
    }
    if (plan.surface.length === 0) reasons.push("plan has no surface samples");
    for (const s of plan.surface) {
      if (!envelopeContains(plan.envelope, s.x, s.y, s.z)) {
        reasons.push(`surface ${s.x},${s.z},${s.y} is outside the plan envelope`);
      }
    }
    if (reasons.length > 0) return { ok: false, authorization: null, reasons };
    const token = {
      id: `local-stub:structure:${structureDigest(plan)}`,
      authority: LOCAL_AUTHORITY,
      enforcement: LOCAL_ENFORCEMENT,
      planDigest: structureDigest(plan),
      envelope: plan.envelope.map((e) => ({ ...e })),
      baseRevision: world.revision,
      limits: { ...this.limits }
    };
    return { ok: true, authorization: token, reasons: [] };
  }
};
function executeStructure(world, plan, authorization) {
  if (authorization.authority !== LOCAL_AUTHORITY || authorization.enforcement !== LOCAL_ENFORCEMENT) {
    return fail2("execute", "unsupported_authority", [
      `authority ${authorization.authority}/${authorization.enforcement} is not the local stub`
    ]);
  }
  if (authorization.planDigest !== structureDigest(plan)) {
    return fail2("execute", "digest_mismatch", ["authorization does not match this structure plan"]);
  }
  if (authorization.baseRevision !== world.revision) {
    return fail2("execute", "stale_authorization", [
      `authorization was issued at revision ${authorization.baseRevision}, world is at ${world.revision}`
    ]);
  }
  if (plan.envelope.some((r) => !authorization.envelope.some((a) => r.x0 >= a.x0 && r.x1 <= a.x1 && r.z0 >= a.z0 && r.z1 <= a.z1 && r.y0 >= a.y0 && r.y1 <= a.y1))) {
    return fail2("execute", "envelope_mismatch", ["plan envelope is wider than the authorization"]);
  }
  const reasons = [];
  for (const m2 of plan.modules) {
    if (!moduleInsideEnvelope(m2, authorization.envelope)) {
      reasons.push(`module ${m2.kind} at ${m2.x},${m2.y},${m2.z} is outside the authorized envelope`);
    }
  }
  const mismatches = surfaceMismatches(world, plan.surface);
  if (mismatches.length > 0) {
    reasons.push(...mismatches.slice(0, 4).map(
      (m2) => `column ${m2.x},${m2.z} is at ${m2.actual}, expected ${m2.expected}`
    ));
  }
  const obstructions = obstructionsIn(world, plan.rect);
  if (obstructions.length > 0) {
    reasons.push(`footprint has ${obstructions.length} obstructions`);
  }
  if (world.structures.has(plan.id)) {
    reasons.push(`structure ${plan.id} already exists`);
  }
  for (const [resource, amount] of Object.entries(plan.cost)) {
    const have = world.inventory[resource] ?? 0;
    if (have < (amount ?? 0)) {
      reasons.push(`need ${amount} ${resource}, have ${have}`);
    }
  }
  if (reasons.length > 0) return fail2("execute", "unauthorized_structure", reasons);
  const inventoryBefore = inventorySnapshot(world);
  const revisionBefore = world.revision;
  for (const [resource, amount] of Object.entries(plan.cost)) {
    const left = (world.inventory[resource] ?? 0) - (amount ?? 0);
    if (left > 0) world.inventory[resource] = left;
    else delete world.inventory[resource];
  }
  world.revision++;
  const structure = {
    id: plan.id,
    kind: plan.kind,
    siteId: plan.siteId,
    x: plan.origin.x,
    y: plan.origin.y,
    z: plan.origin.z,
    rot: plan.rot,
    modules: plan.modules.map((m2) => ({ ...m2 })),
    cost: { ...plan.cost },
    builtRevision: world.revision,
    ...plan.designVersion === FOUNDER_DESIGN_VERSION ? { designVersion: FOUNDER_DESIGN_VERSION } : {},
    provisional: true
  };
  world.structures.set(structure.id, structure);
  const ledger = {
    authority: LOCAL_AUTHORITY,
    enforcement: LOCAL_ENFORCEMENT,
    authorizationId: authorization.id,
    planDigest: authorization.planDigest,
    structureId: structure.id,
    siteId: plan.siteId,
    kind: plan.kind,
    moduleCount: structure.modules.length,
    costPaid: { ...plan.cost },
    inventoryBefore,
    inventoryAfter: inventorySnapshot(world),
    revisionBefore,
    revisionAfter: world.revision
  };
  return { ok: true, plan, authorization, ledger };
}
function buildStructure(world, authorizer, proposal) {
  const planned = planStructure(world, proposal);
  if (!planned.ok) return planned;
  const decision = authorizer.authorize(world, planned.plan);
  if (!decision.ok || !decision.authorization) {
    return fail2("authorize", "not_authorized", decision.reasons);
  }
  return executeStructure(world, planned.plan, decision.authorization);
}

// src/sim/canonical.ts
var Hasher = class {
  a = 2166136261;
  b = 2654435769;
  byte(v) {
    const x = v & 255;
    this.a = Math.imul(this.a ^ x, 16777619);
    this.b = Math.imul(this.b ^ x + 158, 2246822507);
    this.b ^= this.b >>> 13;
  }
  u32(v) {
    let n = v >>> 0;
    for (let i = 0; i < 4; i++) {
      this.byte(n);
      n >>>= 8;
    }
  }
  string(s) {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  hex() {
    return (this.a >>> 0).toString(16).padStart(8, "0") + (this.b >>> 0).toString(16).padStart(8, "0");
  }
};
function clampRegion(region) {
  const r = {
    x0: Math.max(-HALF, Math.floor(region.x0)),
    z0: Math.max(-HALF, Math.floor(region.z0)),
    x1: Math.min(HALF - 1, Math.floor(region.x1)),
    z1: Math.min(HALF - 1, Math.floor(region.z1)),
    y0: Math.max(Y_MIN, Math.floor(region.y0)),
    y1: Math.min(Y_MAX - 1, Math.floor(region.y1))
  };
  if (r.x0 > r.x1 || r.z0 > r.z1 || r.y0 > r.y1) {
    throw new Error(`empty voxel region ${JSON.stringify(region)}`);
  }
  return r;
}
function normalizeEnvelope(rects) {
  return rects.map((r) => ({
    x0: Math.floor(r.x0),
    z0: Math.floor(r.z0),
    x1: Math.floor(r.x1),
    z1: Math.floor(r.z1),
    y0: Math.floor(r.y0),
    y1: Math.floor(r.y1)
  })).sort((a, b) => a.x0 - b.x0 || a.z0 - b.z0 || a.y0 - b.y0 || a.x1 - b.x1 || a.z1 - b.z1 || a.y1 - b.y1);
}
function ensureRegionChunks(world, region) {
  const r = clampRegion(region);
  const keys = [];
  const cx0 = worldToChunkX(r.x0), cx1 = worldToChunkX(r.x1);
  const cz0 = worldToChunkZ(r.z0), cz1 = worldToChunkZ(r.z1);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const chunk = ensureChunk(world, cx, cz);
      if (!chunk) throw new Error(`chunk ${cx},${cz} is outside the world`);
      keys.push(chunkKey(cx, cz));
    }
  }
  keys.sort();
  return keys;
}
function canonicalRegionHash(world, region, exclude = []) {
  const r = clampRegion(region);
  const envelope = normalizeEnvelope(exclude);
  const keys = ensureRegionChunks(world, r);
  const h = new Hasher();
  h.string("m002:voxel-state:v1");
  h.u32(r.x0);
  h.u32(r.z0);
  h.u32(r.x1);
  h.u32(r.z1);
  h.u32(r.y0);
  h.u32(r.y1);
  h.u32(envelope.length);
  for (const e of envelope) {
    h.u32(e.x0);
    h.u32(e.z0);
    h.u32(e.x1);
    h.u32(e.z1);
    h.u32(e.y0);
    h.u32(e.y1);
  }
  let cells = 0;
  let excludedCells = 0;
  const yi0 = r.y0 - Y_MIN;
  const yi1 = r.y1 - Y_MIN;
  for (const key of keys) {
    const chunk = world.chunks.get(key);
    if (!chunk) throw new Error(`chunk ${key} was not generated`);
    const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
    const lx0 = Math.max(0, r.x0 - ox), lx1 = Math.min(CHUNK_SIZE - 1, r.x1 - ox);
    const lz0 = Math.max(0, r.z0 - oz), lz1 = Math.min(CHUNK_SIZE - 1, r.z1 - oz);
    h.string("chunk");
    h.u32(chunk.cx);
    h.u32(chunk.cz);
    for (let yi = yi0; yi <= yi1; yi++) {
      const y = Y_MIN + yi;
      for (let lz = lz0; lz <= lz1; lz++) {
        const z = oz + lz;
        for (let lx = lx0; lx <= lx1; lx++) {
          const x = ox + lx;
          if (envelope.length > 0 && envelopeContains(envelope, x, y, z)) {
            excludedCells++;
            continue;
          }
          h.byte(chunk.data[localIndex(lx, yi, lz)]);
          cells++;
        }
      }
    }
  }
  return { hash: h.hex(), cells, excludedCells, chunks: keys.length, region: r };
}
function canonicalInventoryHash(world) {
  const h = new Hasher();
  h.string("m002:inventory:v1");
  const keys = Object.keys(world.inventory).sort();
  h.u32(keys.length);
  for (const key of keys) {
    h.string(key);
    h.u32(world.inventory[key]);
  }
  return h.hex();
}
function inventorySnapshot(world) {
  const out = {};
  for (const key of Object.keys(world.inventory).sort()) out[key] = world.inventory[key];
  return out;
}
function hashEntity(h, e) {
  h.string(e.id);
  h.string(e.kind);
  h.string(e.chunk);
  h.u32(Math.round(e.x * 1e3));
  h.u32(Math.round(e.y * 1e3));
  h.u32(Math.round(e.z * 1e3));
  h.u32(Math.round(e.rot * 1e4));
  h.u32(Math.round(e.scale * 1e3));
  h.u32(e.variant);
  h.string(e.resource ?? "");
  h.u32(e.remaining);
  h.u32(e.harvested ? 1 : 0);
  h.u32(e.harvestedOnce ? 1 : 0);
}
function canonicalEntityHash(world, region) {
  let entities;
  if (region) {
    const r = clampRegion(region);
    ensureRegionChunks(world, r);
    entities = [...world.entities.values()].filter(
      (e) => e.x >= r.x0 && e.x < r.x1 + 1 && e.z >= r.z0 && e.z < r.z1 + 1
    );
  } else {
    entities = [...world.entities.values()];
  }
  entities.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const h = new Hasher();
  h.string("m002:entity-state:v1");
  h.u32(entities.length);
  for (const e of entities) hashEntity(h, e);
  return h.hex();
}
function canonicalStructureHash(world) {
  const structures = [...world.structures.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const h = new Hasher();
  h.string("m002:structure-state:v1");
  h.u32(structures.length);
  for (const s of structures) {
    h.string(s.id);
    h.string(s.kind);
    h.string(s.siteId);
    h.u32(Math.round(s.x * 1e3));
    h.u32(Math.round(s.y * 1e3));
    h.u32(Math.round(s.z * 1e3));
    h.u32(Math.round(s.rot * 1e4));
    if (s.designVersion === FOUNDER_DESIGN_VERSION) h.string("design:2");
    h.u32(s.modules.length);
    for (const m2 of s.modules) {
      h.string(m2.kind);
      h.u32(Math.round(m2.x * 1e3));
      h.u32(Math.round(m2.y * 1e3));
      h.u32(Math.round(m2.z * 1e3));
      h.u32(Math.round(m2.w * 1e3));
      h.u32(Math.round(m2.h * 1e3));
      h.u32(Math.round(m2.d * 1e3));
      h.u32(Math.round((m2.rot ?? 0) * 1e4));
      h.string(m2.tone ?? "");
    }
    const costKeys = Object.keys(s.cost).sort();
    h.u32(costKeys.length);
    for (const key of costKeys) {
      h.string(key);
      h.u32(s.cost[key] ?? 0);
    }
    h.u32(s.builtRevision);
  }
  return h.hex();
}
function chunkKeys(world) {
  return [...world.chunks.keys()].sort();
}

// src/sim/m002.ts
var M002_SEED = 1337;
var M002_PATH_SITE_ID = "path-house-farm";
var M002_PATH_PROFILE = [11, 11, 11, 12, 12, 12, 12, 13, 13];
var M002_TERRACE_BANDS = [
  { z0: -42, z1: -40, y: 16 },
  { z0: -39, z1: -37, y: 15 },
  { z0: -36, z1: -35, y: 14 }
];
var FIXTURE_CHUNKS = { cx0: 28, cz0: 29, cx1: 32, cz1: 32 };
var M002_LAYOUT = {
  seed: M002_SEED,
  rejected: {
    id: "site-a-rejected",
    rect: { x0: -74, z0: -66, x1: -67, z1: -61 },
    // A naive low-side floor: the uphill corner would need 5 m of excavation.
    floorY: 3,
    door: { x: -67, z: -63 },
    approach: { x: -60, z: -63 }
  },
  house: {
    id: "site-b-house",
    rect: { x0: -60, z0: -46, x1: -53, z1: -41 },
    floorY: 11,
    door: { x: -53, z: -43 },
    approach: { x: -45, z: -43 }
  },
  farm: {
    id: "field-c",
    rect: { x0: -38, z0: -42, x1: -27, z1: -35 },
    terraces: 3
  },
  searchArea: { x0: -76, z0: -68, x1: -40, z1: -40 },
  workZone: { x0: -76, z0: -68, x1: -23, z1: -31 },
  fixtureChunks: FIXTURE_CHUNKS,
  protectedRegion: {
    x0: chunkOriginX(FIXTURE_CHUNKS.cx0),
    z0: chunkOriginZ(FIXTURE_CHUNKS.cz0),
    x1: chunkOriginX(FIXTURE_CHUNKS.cx1) + 31,
    z1: chunkOriginZ(FIXTURE_CHUNKS.cz1) + 31,
    y0: Y_MIN,
    y1: Y_MAX - 1
  },
  envelope: [
    // House footprint plus a 2 m preparation buffer.
    { x0: -62, z0: -48, x1: -51, z1: -39, y0: 8, y1: 16 },
    // Door-to-approach path corridor plus a 1 m buffer.
    { x0: -54, z0: -44, x1: -44, z1: -42, y0: 9, y1: 15 },
    // Farm footprint plus a 2 m preparation buffer.
    { x0: -40, z0: -44, x1: -25, z1: -33, y0: 10, y1: 20 }
  ]
};
function createM002Fixture(seed = M002_SEED) {
  const world = createWorld(seed);
  const { cx0, cz0, cx1, cz1 } = M002_LAYOUT.fixtureChunks;
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) generateChunk(world, cx, cz);
  }
  placeAuthoredSites(world);
  return { world, layout: M002_LAYOUT, chunkKeys: chunkKeys(world) };
}

// src/sim/scenario.ts
var M002_STARTER_INVENTORY = {
  wood: 24,
  stone: 48
};
function m002PathRect() {
  const door = M002_LAYOUT.house.door;
  const approach = M002_LAYOUT.house.approach;
  return {
    x0: door.x,
    z0: door.z - 1,
    x1: approach.x,
    z1: door.z + 1
  };
}
function m002PathTargets() {
  const rect = m002PathRect();
  const targets = [];
  for (let i = 0; i < M002_PATH_PROFILE.length; i++) {
    for (let z = rect.z0; z <= rect.z1; z++) {
      targets.push({ x: rect.x0 + i, z, y: M002_PATH_PROFILE[i] });
    }
  }
  return targets;
}
function m002FarmTargets() {
  const rect = M002_LAYOUT.farm.rect;
  const targets = [];
  for (const band of M002_TERRACE_BANDS) {
    for (let z = band.z0; z <= band.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        targets.push({ x, z, y: band.y });
      }
    }
  }
  return targets;
}

// src/sim/nav.ts
var GATE_STATES = ["closed", "locked", "open"];
var BLOCK = {
  none: 0,
  outside: 1,
  deep_water: 2,
  building: 3,
  occupied: 4,
  tree: 5,
  rock: 6,
  landmark: 7,
  structure: 8
};
var REASON_NAMES = Object.keys(BLOCK);

// src/sim/economy.ts
var LIFE_RESOURCES = ["eggs", "fiber", "food", "milk", "ore", "rations", "seed", "stone", "water", "wood", "wool"];
var CARRIED_CAPACITY = 120;
var STOCKPILE_CAPACITY = 200;
var MAX_PRODUCTION_JOBS = 16;
var MAX_TICKS_PER_COMMAND = 64;
var CROP_GROWTH_TICKS = 4;
var CROP_YIELD = { food: 6, fiber: 1 };
var CROP_YIELD_LABEL = `${CROP_YIELD.food} food + ${CROP_YIELD.fiber} fiber`;
var FOUNDER_STOCKPILE_ID = "stockpile:founder";
var FOUNDER_STOCKPILE = { id: FOUNDER_STOCKPILE_ID, x: -50, z: -32, capacity: STOCKPILE_CAPACITY };
var RECIPES = {
  seed: { input: { fiber: 2 }, output: { seed: 3 }, ticks: 1 },
  rations: { input: { food: 2 }, output: { rations: 3 }, ticks: 2 }
};
var CROP_PLOT_IDS = Array.from({ length: 9 }, (_, i) => `crop:${i}`);
function createLifeState() {
  return {
    stockpiles: /* @__PURE__ */ new Map([[FOUNDER_STOCKPILE_ID, {
      id: FOUNDER_STOCKPILE_ID,
      x: FOUNDER_STOCKPILE.x,
      z: FOUNDER_STOCKPILE.z,
      capacity: STOCKPILE_CAPACITY,
      inventory: {}
    }]]),
    jobs: /* @__PURE__ */ new Map(),
    crops: /* @__PURE__ */ new Map(),
    tick: 0
  };
}
function total(bag) {
  return Object.values(bag).reduce((sum, amount) => sum + amount, 0);
}

// src/sim/homestead.ts
var HOMESTEAD_VERSION = 1;
var HOMESTEAD_NAV_VERSION = 2;
var DM = 10;
var MAX_VILLAGERS = 8;
var MAX_ANIMALS = 60;
var CROPS = ["flax", "potato", "wheat"];
var CROP_RULES = {
  wheat: {
    label: "Wheat",
    growTicks: 60,
    drainEvery: 4,
    yield: { food: 3, seed: 2, fiber: 2 },
    purpose: "grain for food, straw for the animals, and seed"
  },
  potato: {
    label: "Potatoes",
    growTicks: 90,
    drainEvery: 6,
    yield: { food: 6, seed: 1 },
    purpose: "the most food per field; slow, but needs less water"
  },
  flax: {
    label: "Flax",
    growTicks: 70,
    drainEvery: 4,
    yield: { fiber: 5, seed: 2 },
    purpose: "fibre: straw for the troughs and, later, linen"
  }
};
var UNIT_M2 = 9;
var FIELD_MIN = 2;
var FIELD_MAX = 10;
var MAX_FIELDS = 12;
var fieldUnits = (w, d) => Math.ceil(w * d / UNIT_M2);
var MOISTURE_MAX = 12;
var WITHER_TICKS = 45;
var TILL_PER_UNIT = 4;
var SPECIES = ["cattle", "chicken", "goat", "horse", "pig", "sheep"];
var STARVING_DEATH_TICKS = 240;
var GRASS_MAX = 100;
var TROUGH_MAX = 30;
var EGG_BOX_MAX = 12;
var ROLES = ["farmer", "herder"];
var STEWARD_ACTIONS = ["assign_role", "expand_field"];
var MAX_PROPOSALS = 8;
var OVERFLOW_CAPACITY = 300;
var m = (v) => Math.round(v * DM);
var STOCK = { x: m(FOUNDER_STOCKPILE.x), z: m(FOUNDER_STOCKPILE.z + 1.6) };
var GATE_IDS = ["door:farmhouse", "gate:coop", "gate:paddock", "gate:pen", "gate:sty"];
var MAX_AVOID = 8;
function homesteadSnapshot(h) {
  return {
    version: h.version,
    anchorX: h.anchorX,
    anchorZ: h.anchorZ,
    rng: h.rng,
    nextId: h.nextId,
    villagers: [...h.villagers].sort((a, b) => a.id.localeCompare(b.id)).map((v) => ({
      id: v.id,
      name: v.name,
      role: v.role,
      x: v.x,
      z: v.z,
      energy: v.energy,
      hunger: v.hunger,
      carry: v.carry ? { item: v.carry.item, amount: v.carry.amount } : null,
      task: v.task ? {
        kind: v.task.kind,
        target: v.task.target,
        leg: v.task.leg,
        progress: v.task.progress,
        legs: v.task.legs.map((l) => ({
          op: l.op,
          x: l.x,
          z: l.z,
          ticks: l.ticks,
          effect: l.effect,
          ...l.item !== void 0 ? { item: l.item } : {},
          ...l.amount !== void 0 ? { amount: l.amount } : {}
        }))
      } : null,
      ...v.nav ? { nav: navSnapshot(v.nav) } : {},
      ...v.avoid?.length ? { avoid: v.avoid.map((a) => ({ target: a.target, until: a.until, reason: a.reason, by: a.by })) } : {}
    })),
    plots: [...h.plots].sort((a, b) => a.id.localeCompare(b.id)).map((p) => ({
      id: p.id,
      x: p.x,
      z: p.z,
      w: p.w,
      d: p.d,
      crop: p.crop,
      state: p.state,
      growth: p.growth,
      moisture: p.moisture,
      dry: p.dry,
      tilled: p.tilled
    })),
    enclosures: [...h.enclosures].sort((a, b) => a.id.localeCompare(b.id)).map((e) => ({ id: e.id, grass: e.grass, feed: e.feed, water: e.water, eggs: e.eggs })),
    animals: [...h.animals].sort((a, b) => a.id.localeCompare(b.id)).map((a) => ({
      id: a.id,
      species: a.species,
      sex: a.sex,
      born: a.born,
      x: a.x,
      z: a.z,
      tx: a.tx,
      tz: a.tz,
      hunger: a.hunger,
      starving: a.starving,
      product: a.product,
      pregnantUntil: a.pregnantUntil
    })),
    overflow: Object.fromEntries(Object.entries(h.overflow).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b))),
    steward: {
      enabled: h.steward.enabled,
      policy: { assign_role: h.steward.policy.assign_role, expand_field: h.steward.policy.expand_field },
      proposals: h.steward.proposals.map((p) => ({
        id: p.id,
        action: p.action,
        ...p.villagerId !== void 0 ? { villagerId: p.villagerId } : {},
        ...p.role !== void 0 ? { role: p.role } : {},
        reason: p.reason,
        tick: p.tick
      })),
      nextProposal: h.steward.nextProposal
    },
    ...h.gates ? { gates: [...h.gates].sort((a, b) => a.id.localeCompare(b.id)).map((g) => ({ id: g.id, state: g.state })) } : {}
  };
}
function navSnapshot(n) {
  return {
    path: [...n.path],
    plan: n.plan,
    dest: [n.dest[0], n.dest[1], n.dest[2]],
    ...n.opening !== void 0 ? { opening: n.opening } : {},
    ...n.opened !== void 0 ? { opened: n.opened } : {},
    ...n.far !== void 0 ? { far: [n.far[0], n.far[1]] } : {},
    ...n.blocked !== void 0 ? { blocked: { reason: n.blocked.reason, by: n.blocked.by, target: n.blocked.target, since: n.blocked.since } } : {}
  };
}
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var int = (v, lo, hi) => typeof v === "number" && Number.isSafeInteger(v) && v >= lo && v <= hi;
var str = (v, re) => typeof v === "string" && v.length <= 64 && re.test(v);
var POS = 2e4;
var EFFECTS = /* @__PURE__ */ new Set(["take", "store", "till", "sow", "reap", "water_plot", "draw", "water_trough", "fill_feed", "gather_eggs", "shear", "milk", "eat", "rest", "restock", "thresh", "none"]);
var GATE_ID_SET = new Set(GATE_IDS);
var TARGET = /^[a-z_]+:[a-z0-9:]{1,24}$/;
var BY = /^[A-Za-z0-9_:,.-]{1,96}$/;
var text160 = (v) => typeof v === "string" && v.length > 0 && v.length <= 160 && /^[\x20-\x7e]+$/.test(v);
function validateNav(raw, tick) {
  if (!isObj(raw) || !Array.isArray(raw.path) || raw.path.length % 2 !== 0 || raw.path.length > 512 || !raw.path.every((c) => int(c, -1024, 1023)) || typeof raw.plan !== "string" || !/^(?:[0-9a-f]{16})?$/.test(raw.plan) || !Array.isArray(raw.dest) || raw.dest.length !== 3 || !int(raw.dest[0], -POS, POS) || !int(raw.dest[1], -POS, POS) || !int(raw.dest[2], 0, 100) || raw.opening !== void 0 && !GATE_ID_SET.has(String(raw.opening)) || raw.opened !== void 0 && !GATE_ID_SET.has(String(raw.opened)) || raw.far !== void 0 && (!Array.isArray(raw.far) || raw.far.length !== 2 || !int(raw.far[0], -1024, 1023) || !int(raw.far[1], -1024, 1023))) {
    throw new Error("invalid villager route");
  }
  let blocked;
  if (raw.blocked !== void 0) {
    const b = raw.blocked;
    if (!isObj(b) || !text160(b.reason) || !str(b.by, BY) || !str(b.target, TARGET) || !int(b.since, 0, tick)) throw new Error("invalid villager obstruction");
    blocked = { reason: b.reason, by: b.by, target: b.target, since: b.since };
  }
  return navSnapshot({
    path: raw.path,
    plan: raw.plan,
    dest: raw.dest,
    ...raw.opening !== void 0 ? { opening: raw.opening } : {},
    ...raw.opened !== void 0 ? { opened: raw.opened } : {},
    ...raw.far !== void 0 ? { far: raw.far } : {},
    ...blocked ? { blocked } : {}
  });
}
var ITEMS = /^(?:water|seed|fiber|eggs|wool|milk|harvest:(?:wheat|potato|flax)|food|rations|ore|stone|wood)$/;
function validateHomestead(raw, tick) {
  if (!isObj(raw) || raw.version !== HOMESTEAD_VERSION && raw.version !== HOMESTEAD_NAV_VERSION || !int(raw.anchorX, -1e3, 1e3) || !int(raw.anchorZ, -1e3, 1e3) || !int(raw.rng, 1, 4294967295) || !int(raw.nextId, 0, 1e6) || !Array.isArray(raw.villagers) || raw.villagers.length > MAX_VILLAGERS || !Array.isArray(raw.plots) || raw.plots.length > MAX_FIELDS || !Array.isArray(raw.enclosures) || raw.enclosures.length !== 4 || !Array.isArray(raw.animals) || raw.animals.length > MAX_ANIMALS) throw new Error("snapshot has an invalid homestead");
  const villagers = raw.villagers.map((v) => {
    if (!isObj(v) || !str(v.id, /^villager:\d{1,3}$/) || !str(v.name, /^[A-Za-z][A-Za-z '-]{0,23}$/) || !ROLES.includes(v.role) || !int(v.x, -POS, POS) || !int(v.z, -POS, POS) || !int(v.energy, 0, 100) || !int(v.hunger, 0, 100)) throw new Error("snapshot has an invalid villager");
    let carry = null;
    if (v.carry !== null) {
      if (!isObj(v.carry) || !str(v.carry.item, ITEMS) || !int(v.carry.amount, 1, 100)) throw new Error("invalid villager load");
      carry = { item: v.carry.item, amount: v.carry.amount };
    }
    let task = null;
    if (v.task !== null) {
      const t = v.task;
      if (!isObj(t) || !str(t.kind, /^[a-z_]{1,16}$/) || !str(t.target, /^[a-z_]+:[a-z0-9:]{1,24}$/) || !Array.isArray(t.legs) || t.legs.length < 1 || t.legs.length > 8 || !int(t.leg, 0, t.legs.length - 1) || !int(t.progress, 0, 1e4)) {
        throw new Error("invalid villager task");
      }
      const legs = t.legs.map((l) => {
        if (!isObj(l) || l.op !== "walk" && l.op !== "work" || !int(l.x, -POS, POS) || !int(l.z, -POS, POS) || !int(l.ticks, 0, 1e3) || !EFFECTS.has(l.effect) || l.item !== void 0 && !str(l.item, ITEMS) || l.amount !== void 0 && !int(l.amount, 1, 100)) throw new Error("invalid task leg");
        return {
          op: l.op,
          x: l.x,
          z: l.z,
          ticks: l.ticks,
          effect: l.effect,
          ...l.item !== void 0 ? { item: l.item } : {},
          ...l.amount !== void 0 ? { amount: l.amount } : {}
        };
      });
      task = { kind: t.kind, target: t.target, legs, leg: t.leg, progress: t.progress };
    }
    if ((v.nav !== void 0 || v.avoid !== void 0) && raw.version !== HOMESTEAD_NAV_VERSION) throw new Error("legacy villager has a route");
    const nav = v.nav === void 0 ? void 0 : validateNav(v.nav, tick);
    let avoid;
    if (v.avoid !== void 0) {
      if (!Array.isArray(v.avoid) || v.avoid.length < 1 || v.avoid.length > MAX_AVOID) throw new Error("invalid villager give-ups");
      avoid = v.avoid.map((a) => {
        if (!isObj(a) || !str(a.target, TARGET) || !int(a.until, 0, Number.MAX_SAFE_INTEGER) || !text160(a.reason) || !str(a.by, BY)) throw new Error("invalid villager give-up");
        return { target: a.target, until: a.until, reason: a.reason, by: a.by };
      });
    }
    return {
      id: v.id,
      name: v.name,
      role: v.role,
      x: v.x,
      z: v.z,
      energy: v.energy,
      hunger: v.hunger,
      carry,
      task,
      ...nav ? { nav } : {},
      ...avoid ? { avoid } : {}
    };
  });
  const fieldIds = /* @__PURE__ */ new Set();
  const plots = raw.plots.map((p) => {
    if (!isObj(p) || !str(p.id, /^field:\d{1,6}$/) || fieldIds.has(p.id) || !CROPS.includes(p.crop) || !int(p.x, -1e3, 1e3) || !int(p.z, -1e3, 1e3) || !int(p.w, FIELD_MIN, FIELD_MAX) || !int(p.d, FIELD_MIN, FIELD_MAX) || !["wild", "tilled", "growing", "ripe"].includes(String(p.state)) || !int(p.growth, 0, CROP_RULES[p.crop].growTicks) || !int(p.moisture, 0, MOISTURE_MAX) || !int(p.dry, 0, WITHER_TICKS) || !int(p.tilled, 0, TILL_PER_UNIT * fieldUnits(p.w, p.d))) {
      throw new Error("snapshot has an invalid field");
    }
    fieldIds.add(p.id);
    return {
      id: p.id,
      x: p.x,
      z: p.z,
      w: p.w,
      d: p.d,
      crop: p.crop,
      state: p.state,
      growth: p.growth,
      moisture: p.moisture,
      dry: p.dry,
      tilled: p.tilled
    };
  });
  const enclosureIds = ["coop", "paddock", "pen", "sty"];
  const enclosures = raw.enclosures.map((e, i) => {
    if (!isObj(e) || e.id !== enclosureIds[i] || !int(e.grass, 0, GRASS_MAX) || !int(e.feed, 0, TROUGH_MAX) || !int(e.water, 0, TROUGH_MAX) || !int(e.eggs, 0, EGG_BOX_MAX)) throw new Error("snapshot has an invalid enclosure");
    return { id: e.id, grass: e.grass, feed: e.feed, water: e.water, eggs: e.eggs };
  });
  const ids = /* @__PURE__ */ new Set();
  const animals = raw.animals.map((a) => {
    if (!isObj(a) || !str(a.id, /^animal:\d{3,6}$/) || ids.has(a.id) || !SPECIES.includes(a.species) || a.sex !== "f" && a.sex !== "m" || !int(a.born, -1e4, tick) || !int(a.x, -POS, POS) || !int(a.z, -POS, POS) || !int(a.tx, -POS, POS) || !int(a.tz, -POS, POS) || !int(a.hunger, 0, 100) || !int(a.starving, 0, STARVING_DEATH_TICKS) || !int(a.product, 0, 1e3) || !int(a.pregnantUntil, 0, Number.MAX_SAFE_INTEGER)) throw new Error("snapshot has an invalid animal");
    ids.add(a.id);
    return {
      id: a.id,
      species: a.species,
      sex: a.sex,
      born: a.born,
      x: a.x,
      z: a.z,
      tx: a.tx,
      tz: a.tz,
      hunger: a.hunger,
      starving: a.starving,
      product: a.product,
      pregnantUntil: a.pregnantUntil
    };
  });
  if (!isObj(raw.overflow)) throw new Error("snapshot has an invalid overflow pile");
  const overflow = {};
  for (const k of Object.keys(raw.overflow)) {
    const n = raw.overflow[k];
    if (!str(k, ITEMS) || k.startsWith("harvest") || k === "water" || !int(n, 1, OVERFLOW_CAPACITY)) throw new Error("snapshot has an invalid overflow pile");
    overflow[k] = n;
  }
  if (total(overflow) > OVERFLOW_CAPACITY) throw new Error("overflow pile exceeds capacity");
  const st = raw.steward;
  const policies = /* @__PURE__ */ new Set(["auto", "approve", "off"]);
  if (!isObj(st) || typeof st.enabled !== "boolean" || !isObj(st.policy) || !policies.has(String(st.policy.assign_role)) || !policies.has(String(st.policy.expand_field)) || !Array.isArray(st.proposals) || st.proposals.length > MAX_PROPOSALS || !int(st.nextProposal, 0, 1e6)) throw new Error("snapshot has an invalid steward");
  const proposals = st.proposals.map((p) => {
    if (!isObj(p) || !str(p.id, /^proposal:\d{1,6}$/) || !STEWARD_ACTIONS.includes(p.action) || p.villagerId !== void 0 && !str(p.villagerId, /^villager:\d{1,3}$/) || p.role !== void 0 && !ROLES.includes(p.role) || typeof p.reason !== "string" || p.reason.length > 160 || !int(p.tick, 0, tick)) throw new Error("snapshot has an invalid proposal");
    return {
      id: p.id,
      action: p.action,
      ...p.villagerId !== void 0 ? { villagerId: p.villagerId } : {},
      ...p.role !== void 0 ? { role: p.role } : {},
      reason: p.reason,
      tick: p.tick
    };
  });
  const steward = {
    enabled: st.enabled,
    policy: { assign_role: st.policy.assign_role, expand_field: st.policy.expand_field },
    proposals,
    nextProposal: st.nextProposal
  };
  let gates;
  if (raw.version === HOMESTEAD_NAV_VERSION) {
    if (!Array.isArray(raw.gates) || raw.gates.length !== GATE_IDS.length) throw new Error("snapshot has invalid gates");
    gates = raw.gates.map((g, i) => {
      if (!isObj(g) || g.id !== GATE_IDS[i] || !GATE_STATES.includes(g.state)) throw new Error("snapshot has an invalid gate");
      return { id: GATE_IDS[i], state: g.state };
    });
  } else if (raw.gates !== void 0) throw new Error("legacy homestead has gates");
  const h = {
    version: raw.version,
    anchorX: raw.anchorX,
    anchorZ: raw.anchorZ,
    rng: raw.rng,
    nextId: raw.nextId,
    villagers,
    plots,
    enclosures,
    animals,
    overflow,
    steward,
    ...gates ? { gates } : {}
  };
  const canonical = homesteadSnapshot(h);
  if (JSON.stringify(canonical) !== JSON.stringify(raw)) throw new Error("snapshot homestead is not canonical");
  return canonical;
}
function cloneHomestead(h) {
  return JSON.parse(JSON.stringify(homesteadSnapshot(h)));
}

// src/sim/snapshot.ts
var SNAPSHOT_SCHEMA = 1;
var DESIGN_SNAPSHOT_SCHEMA = 2;
var CURRENT_SNAPSHOT_SCHEMA = 3;
var MAX_SNAPSHOT_JSON_BYTES = 25e6;
var MAX_SNAPSHOT_EDITS = 1e6;
var MAX_SNAPSHOT_ENTITIES = 5e5;
function cloneEntity(e) {
  return {
    id: e.id,
    kind: e.kind,
    chunk: e.chunk,
    x: e.x,
    y: e.y,
    z: e.z,
    rot: e.rot,
    scale: e.scale,
    variant: e.variant,
    resource: e.resource,
    remaining: e.remaining,
    yieldPerHarvest: e.yieldPerHarvest,
    harvested: e.harvested,
    ...e.harvestedOnce === void 0 ? {} : { harvestedOnce: e.harvestedOnce },
    provisional: e.provisional,
    authored: e.authored
  };
}
function cloneStructure(s) {
  return {
    ...s,
    modules: s.modules.map((m2) => ({ ...m2 })),
    cost: Object.fromEntries(Object.entries(s.cost).filter(([, amount]) => (amount ?? 0) > 0).sort(([a], [b]) => a.localeCompare(b)))
  };
}
function createWorldSnapshot(world, nextSequence = 0, schema = world.life ? CURRENT_SNAPSHOT_SCHEMA : [...world.structures.values()].some((s) => s.designVersion === FOUNDER_DESIGN_VERSION) ? DESIGN_SNAPSHOT_SCHEMA : SNAPSHOT_SCHEMA) {
  if (schema !== CURRENT_SNAPSHOT_SCHEMA && (world.life || [...world.structures.values()].some(
    (s) => schema === SNAPSHOT_SCHEMA && s.designVersion !== void 0
  ))) throw new Error("legacy snapshots cannot contain newer authoritative state");
  const base = {
    schema,
    manifest: worldManifest(world),
    revision: world.revision,
    edits: [...world.edits.entries()].sort(([a], [b]) => a.localeCompare(b)).map(
      ([chunk, cells]) => ({
        chunk,
        cells: [...cells.entries()].sort(([a], [b]) => a - b).map(([i, m2]) => ({ i, m: m2 }))
      })
    ),
    entities: [...world.entities.values()].filter((e) => (isHistoricalStoneHash(world) || !isRetiredStoneKind(e.kind)) && (e.authored || world.entityChanges.has(e.chunk))).sort((a, b) => a.id.localeCompare(b.id)).map(cloneEntity),
    entityChunks: [...world.entityChanges].sort((a, b) => a.localeCompare(b)),
    entityRemovals: [...world.entityRemovals].sort((a, b) => a.localeCompare(b)),
    inventory: Object.fromEntries(Object.entries(world.inventory).filter(([, amount]) => amount > 0).sort(([a], [b]) => a.localeCompare(b))),
    structures: [...world.structures.values()].sort((a, b) => a.id.localeCompare(b.id)).map(cloneStructure),
    authoredPlaced: world.authoredPlaced,
    nextSequence
  };
  if (schema !== CURRENT_SNAPSHOT_SCHEMA) return { ...base, schema };
  if (!world.life) throw new Error("schema-3 snapshot requires life state");
  return {
    ...base,
    schema,
    tick: world.life.tick,
    stockpiles: [...world.life.stockpiles.values()].sort((a, b) => a.id.localeCompare(b.id)).map((s) => ({
      id: s.id,
      x: s.x,
      z: s.z,
      capacity: s.capacity,
      inventory: Object.fromEntries(Object.entries(s.inventory).filter(([, amount]) => amount > 0).sort(([a], [b]) => a.localeCompare(b)))
    })),
    jobs: [...world.life.jobs.values()].sort((a, b) => a.id.localeCompare(b.id)).map((j) => ({ ...j })),
    crops: [...world.life.crops.values()].sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({ ...c })),
    ...world.homestead ? { homestead: homesteadSnapshot(world.homestead) } : {}
  };
}
function canonicalHash(text2) {
  let a = 2166136261, b = 2654435769;
  for (let i = 0; i < text2.length; i++) {
    const c = text2.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c + 158, 2246822507);
    b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
function canonicalWorldHash(world, nextSequence = 0, schema = DESIGN_SNAPSHOT_SCHEMA) {
  return canonicalHash(JSON.stringify(createWorldSnapshot(world, nextSequence, schema)));
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function uint(value, maximum) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value, maximum = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}
function validChunk(key) {
  if (typeof key !== "string" || !/^-?\d+,-?\d+$/.test(key)) return false;
  const [cx, cz] = key.split(",").map(Number);
  return Number.isInteger(cx) && Number.isInteger(cz) && cx >= 0 && cz >= 0 && cx < CHUNKS_PER_SIDE && cz < CHUNKS_PER_SIDE;
}
var ENTITY_KINDS = /* @__PURE__ */ new Set([
  "styl_tree_spire",
  "styl_tree_table",
  "styl_tree_cluster",
  "styl_tree_blossom",
  "styl_shrub",
  "styl_rock_small",
  "styl_rock_medium",
  "styl_rock_large",
  "styl_ore",
  "styl_cairn",
  "waystone",
  "marker"
]);
var RESOURCES = /* @__PURE__ */ new Set(["wood", "stone", "ore", "fiber"]);
var RECORD_RESOURCES = new Set(LIFE_RESOURCES);
var STRUCTURE_KINDS = /* @__PURE__ */ new Set(["house", "path", "terrace"]);
var MODULE_KINDS = /* @__PURE__ */ new Set([
  "floor",
  "wall",
  "post",
  "lintel",
  "roof",
  "parapet",
  "window",
  "door",
  "threshold",
  "path",
  "curb",
  "soil_bed",
  "retaining_wall",
  "crop_row"
]);
var MODULE_TONES = /* @__PURE__ */ new Set(["stone", "stone_b", "ochre", "timber", "accent", "soil", "crop", "gravel"]);
function validateEntity(value, ids) {
  if (!isObject(value) || !text(value.id) || ids.has(value.id) || !text(value.kind) || !ENTITY_KINDS.has(value.kind) || !validChunk(value.chunk) || !finite(value.x) || !finite(value.y) || !finite(value.z) || value.x < -HALF || value.x >= HALF || value.z < -HALF || value.z >= HALF || !finite(value.rot) || !finite(value.scale) || !uint(value.variant, 1e3) || value.resource !== null && !(typeof value.resource === "string" && RESOURCES.has(value.resource)) || !uint(value.remaining, 1e6) || !uint(value.yieldPerHarvest, 1e6) || typeof value.harvested !== "boolean" || typeof value.provisional !== "boolean" || typeof value.authored !== "boolean" || value.harvestedOnce !== void 0 && typeof value.harvestedOnce !== "boolean") {
    throw new Error("snapshot contains an invalid or duplicate entity");
  }
  ids.add(value.id);
  return {
    id: value.id,
    kind: value.kind,
    chunk: value.chunk,
    x: value.x,
    y: value.y,
    z: value.z,
    rot: value.rot,
    scale: value.scale,
    variant: value.variant,
    resource: value.resource,
    remaining: value.remaining,
    yieldPerHarvest: value.yieldPerHarvest,
    harvested: value.harvested,
    ...value.harvestedOnce === void 0 ? {} : { harvestedOnce: value.harvestedOnce },
    provisional: value.provisional,
    authored: value.authored
  };
}
function validateInventory(value) {
  if (!isObject(value)) throw new Error("snapshot inventory is invalid");
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (!RECORD_RESOURCES.has(key) || !uint(value[key], 1e9)) {
      throw new Error(`snapshot has invalid inventory resource ${key}`);
    }
    if (value[key] > 0) out[key] = value[key];
  }
  return out;
}
function stockTotal(value) {
  return Object.values(value).reduce((sum, amount) => sum + amount, 0);
}
function validateLifeFields(value) {
  if (!uint(value.tick, Number.MAX_SAFE_INTEGER) || !Array.isArray(value.stockpiles) || value.stockpiles.length !== 1 || !Array.isArray(value.jobs) || value.jobs.length > MAX_PRODUCTION_JOBS || !Array.isArray(value.crops) || value.crops.length > CROP_PLOT_IDS.length) {
    throw new Error("snapshot has invalid life-loop fields");
  }
  const stockpiles = [];
  for (const raw of value.stockpiles) {
    if (!isObject(raw) || raw.id !== FOUNDER_STOCKPILE_ID || raw.x !== FOUNDER_STOCKPILE.x || raw.z !== FOUNDER_STOCKPILE.z || raw.capacity !== FOUNDER_STOCKPILE.capacity) {
      throw new Error("snapshot has an unsupported stockpile");
    }
    const inventory = validateInventory(raw.inventory);
    if (stockTotal(inventory) > STOCKPILE_CAPACITY) throw new Error("stockpile exceeds capacity");
    stockpiles.push({
      id: FOUNDER_STOCKPILE_ID,
      x: raw.x,
      z: raw.z,
      capacity: STOCKPILE_CAPACITY,
      inventory
    });
  }
  let reserved = stockTotal(stockpiles[0].inventory);
  const ids = /* @__PURE__ */ new Set();
  const jobs = [];
  for (const raw of value.jobs) {
    if (!isObject(raw) || !text(raw.id, 128) || !/^[A-Za-z0-9][A-Za-z0-9._:%-]*$/.test(raw.id) || ids.has(raw.id) || raw.stockpileId !== FOUNDER_STOCKPILE_ID || raw.recipe !== "seed" && raw.recipe !== "rations" || !uint(raw.remainingTicks, MAX_TICKS_PER_COMMAND) || raw.remainingTicks < 1 || raw.remainingTicks > RECIPES[raw.recipe].ticks) throw new Error("snapshot has an invalid production job");
    reserved += stockTotal(RECIPES[raw.recipe].output);
    ids.add(raw.id);
    jobs.push({ id: raw.id, stockpileId: FOUNDER_STOCKPILE_ID, recipe: raw.recipe, remainingTicks: raw.remainingTicks });
  }
  if (reserved > STOCKPILE_CAPACITY) throw new Error("stockpile reserved output exceeds capacity");
  ids.clear();
  const crops = [];
  for (const raw of value.crops) {
    if (!isObject(raw) || !CROP_PLOT_IDS.includes(String(raw.id)) || ids.has(String(raw.id)) || !uint(raw.plantedTick, value.tick) || raw.growthTicks !== CROP_GROWTH_TICKS) {
      throw new Error("snapshot has an invalid crop plot");
    }
    const plotId = String(raw.id);
    ids.add(plotId);
    crops.push({ id: plotId, plantedTick: raw.plantedTick, growthTicks: CROP_GROWTH_TICKS });
  }
  stockpiles.sort((a, b) => a.id.localeCompare(b.id));
  jobs.sort((a, b) => a.id.localeCompare(b.id));
  crops.sort((a, b) => a.id.localeCompare(b.id));
  const homestead = value.homestead === void 0 ? void 0 : validateHomestead(value.homestead, value.tick);
  return { tick: value.tick, stockpiles, jobs, crops, ...homestead ? { homestead } : {} };
}
function validateCost(value) {
  const out = validateInventory(value);
  return out;
}
function validateStructure(value, ids, schema) {
  if (!isObject(value) || !text(value.id) || ids.has(value.id) || !text(value.kind) || !STRUCTURE_KINDS.has(value.kind) || !text(value.siteId) || !finite(value.x) || !finite(value.y) || !finite(value.z) || !finite(value.rot) || !Array.isArray(value.modules) || value.modules.length > 64 || !uint(value.builtRevision, Number.MAX_SAFE_INTEGER) || value.provisional !== true || schema === SNAPSHOT_SCHEMA && value.designVersion !== void 0 || schema !== SNAPSHOT_SCHEMA && value.designVersion !== void 0 && value.designVersion !== FOUNDER_DESIGN_VERSION) {
    throw new Error("snapshot contains an invalid or duplicate structure");
  }
  const modules = [];
  const moduleIds = /* @__PURE__ */ new Set();
  for (const raw of value.modules) {
    if (!isObject(raw) || !text(raw.kind) || !MODULE_KINDS.has(raw.kind) || !finite(raw.x) || !finite(raw.y) || !finite(raw.z) || !finite(raw.w) || raw.w <= 0 || !finite(raw.h) || raw.h <= 0 || !finite(raw.d) || raw.d <= 0 || raw.rot !== void 0 && !finite(raw.rot) || raw.tone !== void 0 && (typeof raw.tone !== "string" || !MODULE_TONES.has(raw.tone))) {
      throw new Error(`structure ${value.id} contains an invalid module`);
    }
    const signature = JSON.stringify(raw);
    if (moduleIds.has(signature)) throw new Error(`structure ${value.id} contains duplicate modules`);
    moduleIds.add(signature);
    modules.push({
      kind: raw.kind,
      x: raw.x,
      y: raw.y,
      z: raw.z,
      w: raw.w,
      h: raw.h,
      d: raw.d,
      ...raw.rot === void 0 ? {} : { rot: raw.rot },
      ...raw.tone === void 0 ? {} : { tone: raw.tone }
    });
  }
  ids.add(value.id);
  return {
    id: value.id,
    kind: value.kind,
    siteId: value.siteId,
    x: value.x,
    y: value.y,
    z: value.z,
    rot: value.rot,
    modules,
    cost: validateCost(value.cost),
    builtRevision: value.builtRevision,
    ...value.designVersion === void 0 ? {} : { designVersion: FOUNDER_DESIGN_VERSION },
    provisional: true
  };
}
function validateWorldSnapshot(value) {
  if (!isObject(value) || value.schema !== SNAPSHOT_SCHEMA && value.schema !== DESIGN_SNAPSHOT_SCHEMA && value.schema !== CURRENT_SNAPSHOT_SCHEMA || !isObject(value.manifest)) {
    throw new Error("unsupported or malformed world snapshot");
  }
  const schema = value.schema;
  const m2 = value.manifest;
  const params = {
    size: 2048,
    chunkSize: CHUNK_SIZE,
    yMin: -16,
    yMax: 112,
    seaLevel: 0,
    generatorVersion: isSupportedGenerator(m2.generatorVersion) ? m2.generatorVersion : GENERATOR_VERSION
  };
  if (m2.schema !== 1 || !uint(m2.seed, 4294967295) || !isSupportedGenerator(m2.generatorVersion) || m2.size !== params.size || m2.chunkSize !== params.chunkSize || m2.yMin !== params.yMin || m2.yMax !== params.yMax || m2.seaLevel !== params.seaLevel || !/^[0-9a-f]{8}$/.test(String(m2.paramsHash))) {
    throw new Error("snapshot generator configuration is unsupported or incompatible");
  }
  if (!uint(value.revision, Number.MAX_SAFE_INTEGER) || !uint(value.nextSequence, 1e7) || typeof value.authoredPlaced !== "boolean" || !Array.isArray(value.edits) || !Array.isArray(value.entities) || !Array.isArray(value.entityRemovals) || value.entities.length > MAX_SNAPSHOT_ENTITIES || !Array.isArray(value.entityChunks) || !Array.isArray(value.structures)) {
    throw new Error("snapshot has invalid authoritative-state fields");
  }
  const world = createWorld(m2.seed, params.generatorVersion);
  if (worldManifest(world).paramsHash !== m2.paramsHash) throw new Error("snapshot manifest hash mismatch");
  const edits = [];
  let editCount = 0;
  const chunkIds = /* @__PURE__ */ new Set();
  for (const raw of value.edits) {
    if (!isObject(raw) || !validChunk(raw.chunk) || chunkIds.has(raw.chunk) || !Array.isArray(raw.cells) || raw.cells.length > CHUNK_VOLUME) {
      throw new Error("snapshot contains invalid chunk edits");
    }
    const cellIds = /* @__PURE__ */ new Set();
    const cells = [];
    for (const cell of raw.cells) {
      if (!isObject(cell) || !uint(cell.i, CHUNK_VOLUME - 1) || cellIds.has(cell.i) || !uint(cell.m, MAX_MAT_ID)) throw new Error("snapshot contains an invalid voxel edit");
      cellIds.add(cell.i);
      cells.push({ i: cell.i, m: cell.m });
    }
    cellIds.clear();
    cells.sort((a, b) => a.i - b.i);
    editCount += cells.length;
    if (editCount > MAX_SNAPSHOT_EDITS) throw new Error("snapshot exceeds the bounded edit limit");
    chunkIds.add(raw.chunk);
    edits.push({ chunk: raw.chunk, cells });
  }
  edits.sort((a, b) => a.chunk.localeCompare(b.chunk));
  const entityIds = /* @__PURE__ */ new Set();
  const entities = value.entities.map((e) => validateEntity(e, entityIds));
  const entityChunks = [];
  const generated = /* @__PURE__ */ new Set();
  for (const key of value.entityChunks) {
    if (!validChunk(key) || generated.has(key)) throw new Error("snapshot generated-chunk index is invalid");
    generated.add(key);
    entityChunks.push(key);
  }
  for (const entity of entities) {
    if (!entity.authored && !generated.has(entity.chunk)) throw new Error(`entity ${entity.id} belongs to an unmarked chunk`);
  }
  entityChunks.sort((a, b) => a.localeCompare(b));
  const removals = /* @__PURE__ */ new Set();
  for (const id of value.entityRemovals) {
    if (!text(id) || removals.has(id) || entityIds.has(id) || !/^e:\d+,\d+:\d+$/.test(id)) {
      throw new Error("snapshot entity tombstone is invalid");
    }
    removals.add(id);
  }
  const entityRemovals = [...removals].sort((a, b) => a.localeCompare(b));
  const structureIds = /* @__PURE__ */ new Set();
  const structures = value.structures.map((s) => validateStructure(s, structureIds, schema)).sort((a, b) => a.id.localeCompare(b.id));
  const carried = validateInventory(value.inventory);
  if (schema === CURRENT_SNAPSHOT_SCHEMA && stockTotal(carried) > CARRIED_CAPACITY) throw new Error("carried inventory exceeds capacity");
  const snapshot = {
    schema,
    manifest: {
      schema: 1,
      seed: m2.seed,
      generatorVersion: params.generatorVersion,
      size: params.size,
      chunkSize: params.chunkSize,
      yMin: params.yMin,
      yMax: params.yMax,
      seaLevel: params.seaLevel,
      paramsHash: m2.paramsHash
    },
    revision: value.revision,
    edits,
    entities,
    entityChunks,
    entityRemovals,
    inventory: carried,
    structures,
    authoredPlaced: value.authoredPlaced,
    nextSequence: value.nextSequence
  };
  const result = schema === CURRENT_SNAPSHOT_SCHEMA ? { ...snapshot, schema: CURRENT_SNAPSHOT_SCHEMA, ...validateLifeFields(value) } : { ...snapshot, schema };
  if (JSON.stringify(result) !== JSON.stringify(value)) {
    throw new Error("snapshot contains unknown, non-canonical or ambiguous fields");
  }
  return result;
}
function decodeWorldSnapshot(json) {
  if (json.length > MAX_SNAPSHOT_JSON_BYTES) throw new Error("snapshot exceeds the JSON size limit");
  return validateWorldSnapshot(JSON.parse(json));
}
function restoreWorldSnapshot(world, input) {
  finishStoneReplay(world);
  restoreWorldSnapshotExact(world, input);
}
function restoreWorldSnapshotExact(world, input) {
  const snapshot = validateWorldSnapshot(input);
  if (snapshot.manifest.seed !== world.seed) throw new Error("snapshot seed does not match the world");
  world.params = {
    size: snapshot.manifest.size,
    chunkSize: snapshot.manifest.chunkSize,
    yMin: snapshot.manifest.yMin,
    yMax: snapshot.manifest.yMax,
    seaLevel: snapshot.manifest.seaLevel,
    generatorVersion: snapshot.manifest.generatorVersion
  };
  world.chunks.clear();
  world.entities.clear();
  world.entityChunks.clear();
  world.entityChanges.clear();
  world.entityRemovals.clear();
  world.structures.clear();
  world.edits.clear();
  world.inventory = { ...snapshot.inventory };
  world.life = snapshot.schema === CURRENT_SNAPSHOT_SCHEMA ? createLifeState() : void 0;
  if (world.life && snapshot.schema === CURRENT_SNAPSHOT_SCHEMA) {
    world.life.tick = snapshot.tick;
    for (const s of snapshot.stockpiles) world.life.stockpiles.set(s.id, { ...s, inventory: { ...s.inventory } });
    for (const j of snapshot.jobs) world.life.jobs.set(j.id, { ...j });
    for (const c of snapshot.crops) world.life.crops.set(c.id, { ...c });
  }
  world.homestead = snapshot.schema === CURRENT_SNAPSHOT_SCHEMA && snapshot.homestead ? cloneHomestead(snapshot.homestead) : void 0;
  world.dirty.clear();
  world.sites = [];
  world.stats = {
    chunksGenerated: 0,
    chunksEvicted: 0,
    voxelsFilled: 0,
    generationMs: 0,
    entities: snapshot.entities.length,
    trees: 0,
    pinkTrees: 0,
    pinkOverflow: 0
  };
  world.revision = snapshot.revision;
  world.authoredPlaced = snapshot.authoredPlaced;
  for (const key of snapshot.entityChunks) world.entityChanges.add(key);
  for (const delta of snapshot.edits) {
    world.edits.set(delta.chunk, new Map(delta.cells.map((e) => [e.i, e.m])));
  }
  markEditsChanged(world);
  if (world.authoredPlaced) {
    world.authoredPlaced = false;
    placeAuthoredSites(world);
    world.authoredPlaced = true;
  }
  world.revision = snapshot.revision;
  for (const id of snapshot.entityRemovals) world.entityRemovals.add(id);
  world.entities.clear();
  world.entityChunks.clear();
  for (const key of snapshot.entityChunks) {
    const [cx, cz] = key.split(",").map(Number);
    const chunk = ensureChunk(world, cx, cz);
    if (!chunk) throw new Error(`snapshot references unavailable chunk ${key}`);
    const saved = new Set(snapshot.entities.filter((e) => e.chunk === key).map((e) => e.id));
    const ids = (world.entityChunks.get(key) ?? []).filter((id) => {
      const entity = world.entities.get(id);
      return !id.startsWith("e:") && !!entity && (!isRetiredStoneKind(entity.kind) || isStoneReplay(world));
    });
    for (const id of [...world.entities.keys()]) {
      const entity = world.entities.get(id);
      if (entity?.chunk === key && !entity.authored && !saved.has(id)) world.entities.delete(id);
    }
    for (const id of saved) if (!ids.includes(id)) ids.push(id);
    world.entityChunks.set(key, ids);
  }
  for (const e of snapshot.entities) {
    world.entities.set(e.id, cloneEntity(e));
  }
  for (const key of snapshot.entityChunks) world.entityChanges.add(key);
  world.stats.entities = world.entities.size;
  for (const e of world.entities.values()) {
    if (e.kind.startsWith("styl_tree")) world.stats.trees++;
    if (e.kind === "styl_tree_blossom") world.stats.pinkTrees++;
  }
  for (const s of snapshot.structures) world.structures.set(s.id, cloneStructure(s));
}
function worldFromSnapshot(snapshot) {
  const valid = validateWorldSnapshot(snapshot);
  const world = createWorld(valid.manifest.seed, valid.manifest.generatorVersion);
  restoreWorldSnapshot(world, valid);
  return world;
}

// src/app/projects.ts
var pathRect = m002PathRect();
var pathTargets = m002PathTargets();
var farmTargets = m002FarmTargets();
var M2_PROJECTS = [
  {
    id: "house",
    name: "Founder's house",
    subtitle: "8 x 6 m \xB7 flat stone shelf",
    description: "The 19-module founder candidate uses a flat stone foundation, a 3.2 m storey, a real east doorway and two open south windows. Structural wall voids require more primitives than the provisional asset-volume target; this design remains subject to art review.",
    siteId: M002_LAYOUT.house.id,
    kind: "house",
    rect: M002_LAYOUT.house.rect,
    floorY: M002_LAYOUT.house.floorY,
    rules: HOUSE_RULES,
    cost: { ...HOUSE_COST },
    door: M002_LAYOUT.house.door,
    approach: M002_LAYOUT.house.approach,
    prep: {}
  },
  {
    id: "path",
    name: "Door path",
    subtitle: "9 x 3 m \xB7 stepped gravel",
    description: "A nine-metre corridor from the house door to the approach. Each column is cut to a pinned profile so the rise stays walkable.",
    siteId: M002_PATH_SITE_ID,
    kind: "path",
    rect: pathRect,
    floorY: 12,
    rules: PATH_RULES,
    cost: pathCost(pathRect.x1 - pathRect.x0 + 1),
    prep: {
      targets: pathTargets,
      surfaceMaterial: MAT.GRAVEL,
      envelope: [M002_LAYOUT.envelope[1]]
    }
  },
  {
    id: "farm",
    name: "Terraced field",
    subtitle: "12 x 8 m \xB7 three bands",
    description: "Three soil terraces stepping down the slope, held by stone retaining walls. The blossom tree on the field is cleared during preparation.",
    siteId: M002_LAYOUT.farm.id,
    kind: "terrace",
    rect: M002_LAYOUT.farm.rect,
    floorY: 15,
    rules: FARM_RULES,
    cost: { ...TERRACE_COST },
    terraces: M002_LAYOUT.farm.terraces,
    prep: {
      targets: farmTargets,
      surfaceMaterial: MAT.SOIL,
      envelope: [M002_LAYOUT.envelope[2]]
    },
    ghostBands: M002_TERRACE_BANDS
  }
];
function projectSiteProposal(project) {
  return {
    siteId: project.siteId,
    rect: project.rect,
    floorY: project.floorY,
    rules: project.rules
  };
}
function projectStructureProposal(project, designVersion) {
  return {
    siteId: project.siteId,
    kind: project.kind,
    rect: project.rect,
    floorY: project.floorY,
    door: project.door,
    approach: project.approach,
    terraces: project.terraces,
    ...designVersion === void 0 ? {} : { designVersion }
  };
}
function isProjectBuilt(world, project) {
  for (const structure of world.structures.values()) {
    if (structure.siteId === project.siteId && structure.kind === project.kind) return true;
  }
  return false;
}
function missingResources(world, project) {
  const missing = [];
  for (const [resource, amount] of Object.entries(project.cost)) {
    const need = amount ?? 0;
    const have = world.inventory[resource] ?? 0;
    if (have < need) missing.push({ resource, need, have });
  }
  return missing;
}
function buildProject(world, prepAuthorizer, structureAuthorizer, project, designVersion) {
  if (isProjectBuilt(world, project)) {
    return {
      ok: false,
      project,
      stage: "precheck",
      code: "already_built",
      reasons: [`${project.name} is already built`],
      structureFailureRetained: false,
      retryable: true
    };
  }
  const missing = missingResources(world, project);
  if (missing.length > 0) {
    return {
      ok: false,
      project,
      stage: "precheck",
      code: "insufficient_resources",
      reasons: missing.map((m2) => `need ${m2.need} ${m2.resource}, have ${m2.have}`),
      structureFailureRetained: false,
      retryable: true
    };
  }
  const before = createWorldSnapshot(world, 0);
  const prepared = prepareSite(world, prepAuthorizer, projectSiteProposal(project), project.prep);
  if (!prepared.ok) {
    restoreWorldSnapshot(world, before);
    return {
      ok: false,
      project,
      stage: "prepare",
      code: prepared.code,
      reasons: [...prepared.reasons, "No preparation, resource or entity changes were retained."],
      structureFailureRetained: false,
      retryable: true
    };
  }
  const built = buildStructure(world, structureAuthorizer, projectStructureProposal(project, designVersion));
  if (!built.ok) {
    restoreWorldSnapshot(world, before);
    return {
      ok: false,
      project,
      stage: "structure",
      code: built.code,
      reasons: [
        ...built.reasons,
        "All preparation, resource and entity changes were rolled back; the build can be retried."
      ],
      structureFailureRetained: false,
      retryable: true
    };
  }
  const record = world.structures.get(built.ledger.structureId);
  if (!record) {
    restoreWorldSnapshot(world, before);
    return {
      ok: false,
      project,
      stage: "structure",
      code: "missing_record",
      reasons: [
        "structure ledger was written but the world has no record",
        "All preparation, resource and entity changes were rolled back; the build can be retried."
      ],
      structureFailureRetained: false,
      retryable: true
    };
  }
  return {
    ok: true,
    project,
    preparation: prepared.ledger,
    structure: built.ledger,
    record
  };
}

// tests/m002.remediation.test.ts
function hash(world) {
  return canonicalWorldHash(world);
}
function chunkEntity(id, x, z) {
  return {
    id,
    kind: "styl_tree_cluster",
    chunk: chunkKey(worldToChunkX(x), worldToChunkZ(z)),
    x,
    y: 12,
    z,
    rot: 0,
    scale: 1,
    variant: 0,
    resource: "wood",
    remaining: 4,
    yieldPerHarvest: 2,
    harvested: false,
    provisional: true,
    authored: false
  };
}
for (const [label, x, z, rect] of [
  ["x", -1.25, -32.5, { x0: 0, x1: 0, z0: -33, z1: -33 }],
  ["z", -32.5, -1.25, { x0: -33, x1: -33, z0: 0, z1: 0 }]
]) {
  test(`an entity rooted in the adjacent ${label} chunk obstructs the footprint`, () => {
    const world = createM002Fixture().world;
    const [cx, cz] = [worldToChunkX(x), worldToChunkZ(z)];
    if (label === "x") assert.notEqual(cx, worldToChunkX(rect.x0));
    if (label === "z") assert.notEqual(cz, worldToChunkZ(rect.z0));
    generateChunk(world, cx, cz);
    const e = chunkEntity(`edge:${label}`, x, z);
    world.entities.set(e.id, e);
    world.entityChunks.get(e.chunk)?.push(e.id);
    assert.deepEqual(obstructionsIn(world, rect).filter((o) => o.entityId === e.id).map((o) => o.entityId), [e.id]);
  });
}
test("a disjoint adjacent-chunk entity does not obstruct and a boundary root invalidates a token", () => {
  const world = createM002Fixture().world;
  const far = chunkEntity("edge:disjoint", -32.5 - 4, -32.5);
  world.entities.set(far.id, far);
  world.entityChunks.get(far.chunk)?.push(far.id);
  const rect = { x0: -32, x1: -32, z0: -33, z1: -33 };
  assert.equal(obstructionsIn(world, rect).length, 0);
  const project = M2_PROJECTS[0];
  const planned = planPreparation(world, projectSiteProposal(project), project.prep);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const token = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }).authorize(world, planned.plan);
  assert.equal(token.ok, true);
  const near = chunkEntity("edge:new", M002_LAYOUT.house.rect.x0 - 1.4, M002_LAYOUT.house.rect.z0 + 0.5);
  world.entities.set(near.id, near);
  world.entityChunks.get(near.chunk)?.push(near.id);
  const decision = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }).authorize(world, planned.plan);
  assert.equal(decision.ok, false);
  assert.ok(decision.reasons.some((r) => r.includes("do not match footprint obstructions")));
});
test("a structure authorization fault rolls back preparation, resources and entities", () => {
  const world = createM002Fixture().world;
  world.inventory = { ...M002_STARTER_INVENTORY };
  const before = hash(world);
  const result = buildProject(
    world,
    new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }),
    new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope }, { maxModules: 1 }),
    M2_PROJECTS[0]
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.structureFailureRetained, false);
  assert.equal(hash(world), before);
});
test("an obstruction introduced between preparation and structure execution rolls all work back", () => {
  const world = createM002Fixture().world;
  world.inventory = { ...M002_STARTER_INVENTORY };
  const before = hash(world);
  const injectedAuthorizer = new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
  const originalAuthorize = injectedAuthorizer.authorize.bind(injectedAuthorizer);
  injectedAuthorizer.authorize = (currentWorld, plan) => {
    const decision = originalAuthorize(currentWorld, plan);
    const e = chunkEntity("late-obstruction", M002_LAYOUT.house.rect.x0 - 1.4, -43.5);
    currentWorld.entities.set(e.id, e);
    const ids = currentWorld.entityChunks.get(e.chunk);
    if (!ids) throw new Error("fault injection target chunk was not preloaded");
    ids.push(e.id);
    currentWorld.revision++;
    return decision;
  };
  const result = buildProject(
    world,
    new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }),
    injectedAuthorizer,
    M2_PROJECTS[0]
  );
  assert.equal(result.ok, false, "fault injection must reach the structure stage");
  assert.equal(hash(world), before);
});
test("full snapshot round trip, eviction and derived regeneration preserve every authoritative field", () => {
  const world = createM002Fixture().world;
  world.inventory = { ...M002_STARTER_INVENTORY };
  const prep2 = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
  const structures = new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
  for (const project of M2_PROJECTS) assert.equal(buildProject(world, prep2, structures, project).ok, true);
  const before = hash(world);
  const snapshot = decodeWorldSnapshot(JSON.stringify(createWorldSnapshot(world)));
  const restored = worldFromSnapshot(snapshot);
  assert.equal(hash(restored), before);
  assert.equal(world.revision, restored.revision);
  assert.deepEqual([...world.edits], [...restored.edits]);
  assert.deepEqual(
    [...world.structures.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [...restored.structures.entries()].sort(([a], [b]) => a.localeCompare(b))
  );
  assert.equal(
    canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    canonicalRegionHash(restored, M002_LAYOUT.protectedRegion).hash
  );
  assert.equal(canonicalEntityHash(restored), canonicalEntityHash(world));
  assert.equal(canonicalInventoryHash(restored), canonicalInventoryHash(world));
  assert.equal(canonicalStructureHash(restored), canonicalStructureHash(world));
  for (const key of restored.edits.keys()) {
    assert.equal(evictChunk(restored, key), true);
    const [cx, cz] = key.split(",").map(Number);
    const regenerated = generateChunk(restored, cx, cz);
    const original = world.chunks.get(key);
    assert.deepEqual(regenerated.data, original.data, `edited chunk ${key} must regenerate byte-for-byte`);
    assert.deepEqual(regenerated.heights, original.heights, `height cache ${key} must be derived again`);
    assert.deepEqual(regenerated.topMaterials, original.topMaterials, `material cache ${key} must be derived again`);
  }
  assert.equal(
    canonicalRegionHash(restored, M002_LAYOUT.protectedRegion).hash,
    canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash
  );
  assert.equal(hash(restored), before);
});
test("chunk eviction retains generated entities and all harvest state", () => {
  const world = createM002Fixture().world;
  const key = [...world.entityChunks.keys()][0];
  const ids = world.entityChunks.get(key);
  assert.ok(ids.length > 0);
  const before = canonicalEntityHash(world);
  assert.equal(evictChunk(world, key), true);
  assert.equal(canonicalEntityHash(world), before);
  const [cx, cz] = key.split(",").map(Number);
  assert.equal(generateChunk(world, cx, cz)?.key, key);
  assert.equal(canonicalEntityHash(world), before);
});
test("corrupt, incompatible and duplicate snapshot fields are rejected without mutation", () => {
  const world = createM002Fixture().world;
  const snapshot = createWorldSnapshot(world);
  const cases = [
    { ...snapshot, schema: 999 },
    { ...snapshot, edits: [{ chunk: snapshot.edits[0]?.chunk ?? "30,30", cells: [{ i: 0, m: 99 }] }] },
    { ...snapshot, entities: [snapshot.entities[0], snapshot.entities[0]] },
    { ...snapshot, manifest: { ...snapshot.manifest, generatorVersion: 99 } }
  ];
  for (const corrupt of cases) assert.throws(() => worldFromSnapshot(corrupt));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMi5yZW1lZGlhdGlvbi50ZXN0LnRzIiwgIi4uLy4uL3NyYy9zaW0vc3RvbmUtY29tcGF0LnRzIiwgIi4uLy4uL3NyYy9zaW0vbm9pc2UudHMiLCAiLi4vLi4vc3JjL3NpbS9oeWRyb2xvZ3kudHMiLCAiLi4vLi4vc3JjL3NpbS9tYXRlcmlhbHMudHMiLCAiLi4vLi4vc3JjL3NpbS90ZXJyYWluLXYyLnRzIiwgIi4uLy4uL3NyYy9zaW0vd29ybGQudHMiLCAiLi4vLi4vc3JjL3NpbS90ZXJyYWluLnRzIiwgIi4uLy4uL3NyYy9zaW0vY29uc3RydWN0aW9uLnRzIiwgIi4uLy4uL3NyYy9zaW0vcHJlcGFyYXRpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9zdHJ1Y3R1cmVzLnRzIiwgIi4uLy4uL3NyYy9zaW0vY2Fub25pY2FsLnRzIiwgIi4uLy4uL3NyYy9zaW0vbTAwMi50cyIsICIuLi8uLi9zcmMvc2ltL3NjZW5hcmlvLnRzIiwgIi4uLy4uL3NyYy9zaW0vbmF2LnRzIiwgIi4uLy4uL3NyYy9zaW0vZWNvbm9teS50cyIsICIuLi8uLi9zcmMvc2ltL2hvbWVzdGVhZC50cyIsICIuLi8uLi9zcmMvc2ltL3NuYXBzaG90LnRzIiwgIi4uLy4uL3NyYy9hcHAvcHJvamVjdHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB0ZXN0IGZyb20gJ25vZGU6dGVzdCc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQgeyBjcmVhdGVNMDAyRml4dHVyZSwgTTAwMl9MQVlPVVQgfSBmcm9tICcuLi9zcmMvc2ltL20wMDInO1xuaW1wb3J0IHsgTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSB9IGZyb20gJy4uL3NyYy9zaW0vc2NlbmFyaW8nO1xuaW1wb3J0IHsgTG9jYWxBdXRob3JpemVyLCBwbGFuUHJlcGFyYXRpb24gfSBmcm9tICcuLi9zcmMvc2ltL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7IExvY2FsU3RydWN0dXJlQXV0aG9yaXplciB9IGZyb20gJy4uL3NyYy9zaW0vc3RydWN0dXJlcyc7XG5pbXBvcnQgeyBvYnN0cnVjdGlvbnNJbiB9IGZyb20gJy4uL3NyYy9zaW0vdGVycmFpbic7XG5pbXBvcnQgeyBjYW5vbmljYWxFbnRpdHlIYXNoLCBjYW5vbmljYWxSZWdpb25IYXNoLCBjYW5vbmljYWxJbnZlbnRvcnlIYXNoLCBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoIH0gZnJvbSAnLi4vc3JjL3NpbS9jYW5vbmljYWwnO1xuaW1wb3J0IHsgYnVpbGRQcm9qZWN0LCBNMl9QUk9KRUNUUywgcHJvamVjdFNpdGVQcm9wb3NhbCB9IGZyb20gJy4uL3NyYy9hcHAvcHJvamVjdHMnO1xuaW1wb3J0IHsgRW50aXR5LCBldmljdENodW5rLCBnZW5lcmF0ZUNodW5rLCBjaHVua0tleSwgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiB9IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHsgY2Fub25pY2FsV29ybGRIYXNoLCBjcmVhdGVXb3JsZFNuYXBzaG90LCBkZWNvZGVXb3JsZFNuYXBzaG90LCB3b3JsZEZyb21TbmFwc2hvdCB9IGZyb20gJy4uL3NyYy9zaW0vc25hcHNob3QnO1xuXG5mdW5jdGlvbiBmaXh0dXJlKCkge1xuICBjb25zdCBtID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgbS53b3JsZC5pbnZlbnRvcnkgPSB7IC4uLk0wMDJfU1RBUlRFUl9JTlZFTlRPUlkgfTtcbiAgcmV0dXJuIG07XG59XG5cbmZ1bmN0aW9uIGhhc2god29ybGQ6IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZU0wMDJGaXh0dXJlPlsnd29ybGQnXSkge1xuICByZXR1cm4gY2Fub25pY2FsV29ybGRIYXNoKHdvcmxkKTtcbn1cblxuZnVuY3Rpb24gY2h1bmtFbnRpdHkoaWQ6IHN0cmluZywgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBFbnRpdHkge1xuICByZXR1cm4ge1xuICAgIGlkLCBraW5kOiAnc3R5bF90cmVlX2NsdXN0ZXInLCBjaHVuazogY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSksXG4gICAgeCwgeTogMTIsIHosIHJvdDogMCwgc2NhbGU6IDEsIHZhcmlhbnQ6IDAsIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogNCxcbiAgICB5aWVsZFBlckhhcnZlc3Q6IDIsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gIH07XG59XG5cbmZvciAoY29uc3QgW2xhYmVsLCB4LCB6LCByZWN0XSBvZiBbXG4gIFsneCcsIC0xLjI1LCAtMzIuNSwgeyB4MDogMCwgeDE6IDAsIHowOiAtMzMsIHoxOiAtMzMgfV0sXG4gIFsneicsIC0zMi41LCAtMS4yNSwgeyB4MDogLTMzLCB4MTogLTMzLCB6MDogMCwgejE6IDAgfV0sXG5dIGFzIGNvbnN0KSB7XG4gIHRlc3QoYGFuIGVudGl0eSByb290ZWQgaW4gdGhlIGFkamFjZW50ICR7bGFiZWx9IGNodW5rIG9ic3RydWN0cyB0aGUgZm9vdHByaW50YCwgKCkgPT4ge1xuICAgIGNvbnN0IHdvcmxkID0gY3JlYXRlTTAwMkZpeHR1cmUoKS53b3JsZDtcbiAgICBjb25zdCBbY3gsIGN6XSA9IFt3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopXTtcbiAgICBpZiAobGFiZWwgPT09ICd4JykgYXNzZXJ0Lm5vdEVxdWFsKGN4LCB3b3JsZFRvQ2h1bmtYKHJlY3QueDApKTtcbiAgICBpZiAobGFiZWwgPT09ICd6JykgYXNzZXJ0Lm5vdEVxdWFsKGN6LCB3b3JsZFRvQ2h1bmtaKHJlY3QuejApKTtcbiAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIGNvbnN0IGUgPSBjaHVua0VudGl0eShgZWRnZToke2xhYmVsfWAsIHgsIHopO1xuICAgIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgICB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspPy5wdXNoKGUuaWQpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwob2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLmZpbHRlcigobykgPT4gby5lbnRpdHlJZCA9PT0gZS5pZCkubWFwKChvKSA9PiBvLmVudGl0eUlkKSwgW2UuaWRdKTtcbiAgfSk7XG59XG5cbnRlc3QoJ2EgZGlzam9pbnQgYWRqYWNlbnQtY2h1bmsgZW50aXR5IGRvZXMgbm90IG9ic3RydWN0IGFuZCBhIGJvdW5kYXJ5IHJvb3QgaW52YWxpZGF0ZXMgYSB0b2tlbicsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVNMDAyRml4dHVyZSgpLndvcmxkO1xuICBjb25zdCBmYXIgPSBjaHVua0VudGl0eSgnZWRnZTpkaXNqb2ludCcsIC0zMi41IC0gNCwgLTMyLjUpO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZmFyLmlkLCBmYXIpO1xuICB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGZhci5jaHVuayk/LnB1c2goZmFyLmlkKTtcbiAgY29uc3QgcmVjdCA9IHsgeDA6IC0zMiwgeDE6IC0zMiwgejA6IC0zMywgejE6IC0zMyB9O1xuICBhc3NlcnQuZXF1YWwob2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLmxlbmd0aCwgMCk7XG4gIGNvbnN0IHByb2plY3QgPSBNMl9QUk9KRUNUU1swXTtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvamVjdFNpdGVQcm9wb3NhbChwcm9qZWN0KSwgcHJvamVjdC5wcmVwKTtcbiAgYXNzZXJ0LmVxdWFsKHBsYW5uZWQub2ssIHRydWUpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybjtcbiAgY29uc3QgdG9rZW4gPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKHRva2VuLm9rLCB0cnVlKTtcbiAgY29uc3QgbmVhciA9IGNodW5rRW50aXR5KCdlZGdlOm5ldycsIE0wMDJfTEFZT1VULmhvdXNlLnJlY3QueDAgLSAxLjQsIE0wMDJfTEFZT1VULmhvdXNlLnJlY3QuejAgKyAwLjUpO1xuICB3b3JsZC5lbnRpdGllcy5zZXQobmVhci5pZCwgbmVhcik7XG4gIHdvcmxkLmVudGl0eUNodW5rcy5nZXQobmVhci5jaHVuayk/LnB1c2gobmVhci5pZCk7XG4gIGNvbnN0IGRlY2lzaW9uID0gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9KS5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGFzc2VydC5lcXVhbChkZWNpc2lvbi5vaywgZmFsc2UpO1xuICBhc3NlcnQub2soZGVjaXNpb24ucmVhc29ucy5zb21lKChyKSA9PiByLmluY2x1ZGVzKCdkbyBub3QgbWF0Y2ggZm9vdHByaW50IG9ic3RydWN0aW9ucycpKSk7XG59KTtcblxudGVzdCgnYSBzdHJ1Y3R1cmUgYXV0aG9yaXphdGlvbiBmYXVsdCByb2xscyBiYWNrIHByZXBhcmF0aW9uLCByZXNvdXJjZXMgYW5kIGVudGl0aWVzJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZU0wMDJGaXh0dXJlKCkud29ybGQ7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSB9O1xuICBjb25zdCBiZWZvcmUgPSBoYXNoKHdvcmxkKTtcbiAgY29uc3QgcmVzdWx0ID0gYnVpbGRQcm9qZWN0KFxuICAgIHdvcmxkLCBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pLFxuICAgIG5ldyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIoeyBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUgfSwgeyBtYXhNb2R1bGVzOiAxIH0pLFxuICAgIE0yX1BST0pFQ1RTWzBdLFxuICApO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCBmYWxzZSk7XG4gIGlmICghcmVzdWx0Lm9rKSBhc3NlcnQuZXF1YWwocmVzdWx0LnN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZCwgZmFsc2UpO1xuICBhc3NlcnQuZXF1YWwoaGFzaCh3b3JsZCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgnYW4gb2JzdHJ1Y3Rpb24gaW50cm9kdWNlZCBiZXR3ZWVuIHByZXBhcmF0aW9uIGFuZCBzdHJ1Y3R1cmUgZXhlY3V0aW9uIHJvbGxzIGFsbCB3b3JrIGJhY2snLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlTTAwMkZpeHR1cmUoKS53b3JsZDtcbiAgd29ybGQuaW52ZW50b3J5ID0geyAuLi5NMDAyX1NUQVJURVJfSU5WRU5UT1JZIH07XG4gIGNvbnN0IGJlZm9yZSA9IGhhc2god29ybGQpO1xuICBjb25zdCBpbmplY3RlZEF1dGhvcml6ZXIgPSBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xuICBjb25zdCBvcmlnaW5hbEF1dGhvcml6ZSA9IGluamVjdGVkQXV0aG9yaXplci5hdXRob3JpemUuYmluZChpbmplY3RlZEF1dGhvcml6ZXIpO1xuICBpbmplY3RlZEF1dGhvcml6ZXIuYXV0aG9yaXplID0gKGN1cnJlbnRXb3JsZCwgcGxhbikgPT4ge1xuICAgIGNvbnN0IGRlY2lzaW9uID0gb3JpZ2luYWxBdXRob3JpemUoY3VycmVudFdvcmxkLCBwbGFuKTtcbiAgICBjb25zdCBlID0gY2h1bmtFbnRpdHkoJ2xhdGUtb2JzdHJ1Y3Rpb24nLCBNMDAyX0xBWU9VVC5ob3VzZS5yZWN0LngwIC0gMS40LCAtNDMuNSk7XG4gICAgY3VycmVudFdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgICBjb25zdCBpZHMgPSBjdXJyZW50V29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgICBpZiAoIWlkcykgdGhyb3cgbmV3IEVycm9yKCdmYXVsdCBpbmplY3Rpb24gdGFyZ2V0IGNodW5rIHdhcyBub3QgcHJlbG9hZGVkJyk7XG4gICAgaWRzLnB1c2goZS5pZCk7XG4gICAgY3VycmVudFdvcmxkLnJldmlzaW9uKys7XG4gICAgcmV0dXJuIGRlY2lzaW9uO1xuICB9O1xuICBjb25zdCByZXN1bHQgPSBidWlsZFByb2plY3QoXG4gICAgd29ybGQsIG5ldyBMb2NhbEF1dGhvcml6ZXIoeyBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUgfSksXG4gICAgaW5qZWN0ZWRBdXRob3JpemVyLCBNMl9QUk9KRUNUU1swXSxcbiAgKTtcbiAgYXNzZXJ0LmVxdWFsKHJlc3VsdC5vaywgZmFsc2UsICdmYXVsdCBpbmplY3Rpb24gbXVzdCByZWFjaCB0aGUgc3RydWN0dXJlIHN0YWdlJyk7XG4gIGFzc2VydC5lcXVhbChoYXNoKHdvcmxkKSwgYmVmb3JlKTtcbn0pO1xuXG50ZXN0KCdmdWxsIHNuYXBzaG90IHJvdW5kIHRyaXAsIGV2aWN0aW9uIGFuZCBkZXJpdmVkIHJlZ2VuZXJhdGlvbiBwcmVzZXJ2ZSBldmVyeSBhdXRob3JpdGF0aXZlIGZpZWxkJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZU0wMDJGaXh0dXJlKCkud29ybGQ7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSB9O1xuICBjb25zdCBwcmVwID0gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9KTtcbiAgY29uc3Qgc3RydWN0dXJlcyA9IG5ldyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIoeyBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUgfSk7XG4gIGZvciAoY29uc3QgcHJvamVjdCBvZiBNMl9QUk9KRUNUUykgYXNzZXJ0LmVxdWFsKGJ1aWxkUHJvamVjdCh3b3JsZCwgcHJlcCwgc3RydWN0dXJlcywgcHJvamVjdCkub2ssIHRydWUpO1xuICBjb25zdCBiZWZvcmUgPSBoYXNoKHdvcmxkKTtcbiAgY29uc3Qgc25hcHNob3QgPSBkZWNvZGVXb3JsZFNuYXBzaG90KEpTT04uc3RyaW5naWZ5KGNyZWF0ZVdvcmxkU25hcHNob3Qod29ybGQpKSk7XG4gIGNvbnN0IHJlc3RvcmVkID0gd29ybGRGcm9tU25hcHNob3Qoc25hcHNob3QpO1xuICBhc3NlcnQuZXF1YWwoaGFzaChyZXN0b3JlZCksIGJlZm9yZSk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5yZXZpc2lvbiwgcmVzdG9yZWQucmV2aXNpb24pO1xuICBhc3NlcnQuZGVlcEVxdWFsKFsuLi53b3JsZC5lZGl0c10sIFsuLi5yZXN0b3JlZC5lZGl0c10pO1xuICBhc3NlcnQuZGVlcEVxdWFsKFsuLi53b3JsZC5zdHJ1Y3R1cmVzLmVudHJpZXMoKV0uc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgWy4uLnJlc3RvcmVkLnN0cnVjdHVyZXMuZW50cmllcygpXS5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSk7XG4gIGFzc2VydC5lcXVhbChjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBNMDAyX0xBWU9VVC5wcm90ZWN0ZWRSZWdpb24pLmhhc2gsXG4gICAgY2Fub25pY2FsUmVnaW9uSGFzaChyZXN0b3JlZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uKS5oYXNoKTtcbiAgYXNzZXJ0LmVxdWFsKGNhbm9uaWNhbEVudGl0eUhhc2gocmVzdG9yZWQpLCBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkKSk7XG4gIGFzc2VydC5lcXVhbChjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHJlc3RvcmVkKSwgY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZCkpO1xuICBhc3NlcnQuZXF1YWwoY2Fub25pY2FsU3RydWN0dXJlSGFzaChyZXN0b3JlZCksIGNhbm9uaWNhbFN0cnVjdHVyZUhhc2god29ybGQpKTtcbiAgZm9yIChjb25zdCBrZXkgb2YgcmVzdG9yZWQuZWRpdHMua2V5cygpKSB7XG4gICAgYXNzZXJ0LmVxdWFsKGV2aWN0Q2h1bmsocmVzdG9yZWQsIGtleSksIHRydWUpO1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3QgcmVnZW5lcmF0ZWQgPSBnZW5lcmF0ZUNodW5rKHJlc3RvcmVkLCBjeCwgY3opITtcbiAgICBjb25zdCBvcmlnaW5hbCA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KSE7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChyZWdlbmVyYXRlZC5kYXRhLCBvcmlnaW5hbC5kYXRhLCBgZWRpdGVkIGNodW5rICR7a2V5fSBtdXN0IHJlZ2VuZXJhdGUgYnl0ZS1mb3ItYnl0ZWApO1xuICAgIGFzc2VydC5kZWVwRXF1YWwocmVnZW5lcmF0ZWQuaGVpZ2h0cywgb3JpZ2luYWwuaGVpZ2h0cywgYGhlaWdodCBjYWNoZSAke2tleX0gbXVzdCBiZSBkZXJpdmVkIGFnYWluYCk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChyZWdlbmVyYXRlZC50b3BNYXRlcmlhbHMsIG9yaWdpbmFsLnRvcE1hdGVyaWFscywgYG1hdGVyaWFsIGNhY2hlICR7a2V5fSBtdXN0IGJlIGRlcml2ZWQgYWdhaW5gKTtcbiAgfVxuICBhc3NlcnQuZXF1YWwoY2Fub25pY2FsUmVnaW9uSGFzaChyZXN0b3JlZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uKS5oYXNoLFxuICAgIGNhbm9uaWNhbFJlZ2lvbkhhc2god29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbikuaGFzaCk7XG4gIGFzc2VydC5lcXVhbChoYXNoKHJlc3RvcmVkKSwgYmVmb3JlKTtcbn0pO1xuXG50ZXN0KCdjaHVuayBldmljdGlvbiByZXRhaW5zIGdlbmVyYXRlZCBlbnRpdGllcyBhbmQgYWxsIGhhcnZlc3Qgc3RhdGUnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlTTAwMkZpeHR1cmUoKS53b3JsZDtcbiAgY29uc3Qga2V5ID0gWy4uLndvcmxkLmVudGl0eUNodW5rcy5rZXlzKCldWzBdO1xuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkhO1xuICBhc3NlcnQub2soaWRzLmxlbmd0aCA+IDApO1xuICBjb25zdCBiZWZvcmUgPSBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkKTtcbiAgYXNzZXJ0LmVxdWFsKGV2aWN0Q2h1bmsod29ybGQsIGtleSksIHRydWUpO1xuICBhc3NlcnQuZXF1YWwoY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZCksIGJlZm9yZSk7XG4gIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGFzc2VydC5lcXVhbChnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opPy5rZXksIGtleSk7XG4gIGFzc2VydC5lcXVhbChjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkKSwgYmVmb3JlKTtcbn0pO1xuXG50ZXN0KCdjb3JydXB0LCBpbmNvbXBhdGlibGUgYW5kIGR1cGxpY2F0ZSBzbmFwc2hvdCBmaWVsZHMgYXJlIHJlamVjdGVkIHdpdGhvdXQgbXV0YXRpb24nLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlTTAwMkZpeHR1cmUoKS53b3JsZDtcbiAgY29uc3Qgc25hcHNob3QgPSBjcmVhdGVXb3JsZFNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgY2FzZXM6IHVua25vd25bXSA9IFtcbiAgICB7IC4uLnNuYXBzaG90LCBzY2hlbWE6IDk5OSB9LFxuICAgIHsgLi4uc25hcHNob3QsIGVkaXRzOiBbeyBjaHVuazogc25hcHNob3QuZWRpdHNbMF0/LmNodW5rID8/ICczMCwzMCcsIGNlbGxzOiBbeyBpOiAwLCBtOiA5OSB9XSB9XSB9LFxuICAgIHsgLi4uc25hcHNob3QsIGVudGl0aWVzOiBbc25hcHNob3QuZW50aXRpZXNbMF0sIHNuYXBzaG90LmVudGl0aWVzWzBdXSB9LFxuICAgIHsgLi4uc25hcHNob3QsIG1hbmlmZXN0OiB7IC4uLnNuYXBzaG90Lm1hbmlmZXN0LCBnZW5lcmF0b3JWZXJzaW9uOiA5OSB9IH0sXG4gIF07XG4gIGZvciAoY29uc3QgY29ycnVwdCBvZiBjYXNlcykgYXNzZXJ0LnRocm93cygoKSA9PiB3b3JsZEZyb21TbmFwc2hvdChjb3JydXB0IGFzIG5ldmVyKSk7XG59KTtcbiIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gRGV0ZXJtaW5pc3RpYyBoYXNoLCBub2lzZSBhbmQgbWF0aCBoZWxwZXJzIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllci5cbi8vIFB1cmUgVHlwZVNjcmlwdCAoRC0wMDUpLiBFeHRyYWN0ZWQgZnJvbSB3b3JsZC50cyB1bmNoYW5nZWQgc28gdGVycmFpblxuLy8gZ2VuZXJhdG9ycyBvZiBldmVyeSB2ZXJzaW9uIHVzZSBpZGVudGljYWwgcHJpbWl0aXZlcy5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5leHBvcnQgY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4iLCAiLy8gSHlkcm9sb2d5IFx1MjAxNCB0aGUgZGV0ZXJtaW5pc3RpYyB3YXRlciBuZXR3b3JrIG9mIGEgd29ybGQgKHB1cmUgVHlwZVNjcmlwdCwgRC0wMDUpLlxuLy9cbi8vIFRoaXMgaXMgZGVyaXZlZCAqc2ltdWxhdGlvbiBkYXRhKiwgbm90IHByZXNlbnRhdGlvbjogaXQgaXMgYSBwdXJlIGZ1bmN0aW9uIG9mXG4vLyAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pIGFuZCBpcyB3aGF0IHRlcnJhaW4gY2FydmluZywgd2F0ZXIgZmlsbGluZywgZmxvd1xuLy8gZGlyZWN0aW9uIGFuZCBmdXR1cmUgZmlzaGluZy9pcnJpZ2F0aW9uL2Zsb29kaW5nIHJ1bGVzIHJlYWQuIEl0IGlzIG5ldmVyXG4vLyBqb3VybmFsZWQgYmVjYXVzZSBpdCBjYW4gYWx3YXlzIGJlIHJlZ2VuZXJhdGVkIGV4YWN0bHkuXG4vL1xuLy8gTmV0d29yayAoYm90aCBnZW5lcmF0b3IgdmVyc2lvbnMpOlxuLy8gICBsYWtlICBcdTIwMTQgdGhlIHZhbGxleSBsYWtlIGJhc2luLCBsb2NhdGVkIGZyb20gdGhlIGFjdHVhbCBnZW5lcmF0ZWQgdGVycmFpbi5cbi8vICAgbG93ZXIgXHUyMDE0IHRoZSBsb3dsYW5kIHJpdmVyIGZyb20gdGhlIGxha2UgdG8gdGhlIHNvdXRoZXJuIHNlYSwgdHJhY2VkIGZyb21cbi8vICAgICAgICAgICB0aGUgYWN0dWFsIGNhcnZlZCBjaGFubmVsICh0aGUgdjEgY2hhbm5lbCBpcyBjYXJ2ZWQgb24gKndhcnBlZCpcbi8vICAgICAgICAgICBjb29yZGluYXRlcywgc28gYHJpdmVyQ2VudGVyWGAgYWxvbmUgaXMgdXAgdG8gfjEzNSBtIG9mZikuXG4vLyBHZW5lcmF0b3IgdjIgYWRkczpcbi8vICAgdXBwZXIgXHUyMDE0IGEgbW91bnRhaW4gcml2ZXIgZnJvbSBhIGhpZ2hsYW5kIHRhcm4gZG93biB0byB0aGUgbGFrZSwgd2l0aCBhXG4vLyAgICAgICAgICAgd2F0ZXItc3VyZmFjZSBsZXZlbCB0aGF0IG5ldmVyIHJpc2VzIGRvd25zdHJlYW0sIGNhc2NhZGVzIGFuZCBmYWxscy5cbi8vXG4vLyBGbG93IGFsd2F5cyBwb2ludHMgZG93bnN0cmVhbTogdXBwZXIgXHUyMTkyIGxha2UgXHUyMTkyIGxvd2VyIFx1MjE5MiBzZWEuXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbXVsYmVycnkzMiwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuXG5leHBvcnQgdHlwZSBIZWlnaHRTYW1wbGVyID0gKHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUml2ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZCBvZiB0aGlzIHJlYWNoIChtZXRyZXMpLiAqL1xuICBzOiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGVsZXZhdGlvbiAobWV0cmVzLCBtYXkgYmUgZnJhY3Rpb25hbCkuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBDaGFubmVsIGhhbGYtd2lkdGggKG1ldHJlcykuICovXG4gIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY2hIaXQge1xuICAvKiogSG9yaXpvbnRhbCBkaXN0YW5jZSBmcm9tIHRoZSBjZW50cmVsaW5lLiAqL1xuICBkOiBudW1iZXI7XG4gIC8qKiBJbnRlcnBvbGF0ZWQgd2F0ZXIgbGV2ZWwgYXQgdGhlIG5lYXJlc3QgY2VudHJlbGluZSBwb2ludC4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgd2lkdGg6IG51bWJlcjtcbiAgLyoqIFVuaXQgZG93bnN0cmVhbSBkaXJlY3Rpb24uICovXG4gIHR4OiBudW1iZXI7XG4gIHR6OiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGRyb3AgcGVyIG1ldHJlIGFsb25nIHRoZSBjaGFubmVsICg+PSAwKS4gKi9cbiAgZ3JhZGllbnQ6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggb2YgdGhlIG5lYXJlc3QgcG9pbnQgZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQuICovXG4gIHM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvbHlsaW5lIHJlYWNoIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LiBOZWFyZXN0LXNlZ21lbnQgcXVlcmllcyB1c2UgYVxuICogdW5pZm9ybSBncmlkIHdob3NlIGNlbGxzIGxpc3QgZXZlcnkgc2VnbWVudCB3aXRoaW4gYHJlYWNoYCBtZXRyZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSaXZlclJlYWNoIHtcbiAgcmVhZG9ubHkgcG9pbnRzOiBSaXZlclBvaW50W107XG4gIHByaXZhdGUgcmVhZG9ubHkgY2VsbCA9IDMyO1xuICBwcml2YXRlIHJlYWRvbmx5IGdyaWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cbiAgY29uc3RydWN0b3IocG9pbnRzOiBSaXZlclBvaW50W10sIHJlYWRvbmx5IHJlYWNoOiBudW1iZXIpIHtcbiAgICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgICBmb3IgKGxldCBpID0gMDsgaSArIDEgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBwb2ludHNbaV0sIGIgPSBwb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgeDAgPSBNYXRoLm1pbihhLngsIGIueCkgLSByZWFjaCwgeDEgPSBNYXRoLm1heChhLngsIGIueCkgKyByZWFjaDtcbiAgICAgIGNvbnN0IHowID0gTWF0aC5taW4oYS56LCBiLnopIC0gcmVhY2gsIHoxID0gTWF0aC5tYXgoYS56LCBiLnopICsgcmVhY2g7XG4gICAgICBmb3IgKGxldCBjeiA9IE1hdGguZmxvb3IoejAgLyB0aGlzLmNlbGwpOyBjeiA8PSBNYXRoLmZsb29yKHoxIC8gdGhpcy5jZWxsKTsgY3orKykge1xuICAgICAgICBmb3IgKGxldCBjeCA9IE1hdGguZmxvb3IoeDAgLyB0aGlzLmNlbGwpOyBjeCA8PSBNYXRoLmZsb29yKHgxIC8gdGhpcy5jZWxsKTsgY3grKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGNlbGxLZXkoY3gsIGN6KTtcbiAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoa2V5KTtcbiAgICAgICAgICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB0aGlzLmdyaWQuc2V0KGtleSwgbGlzdCk7IH1cbiAgICAgICAgICBsaXN0LnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBvaW50c1t0aGlzLnBvaW50cy5sZW5ndGggLSAxXT8ucyA/PyAwOyB9XG5cbiAgLyoqIE5lYXJlc3QgY2VudHJlbGluZSBwb2ludCB3aXRoaW4gYHJlYWNoYCwgb3IgbnVsbC4gKi9cbiAgbmVhcmVzdCh4OiBudW1iZXIsIHo6IG51bWJlcik6IFJlYWNoSGl0IHwgbnVsbCB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoY2VsbEtleShNYXRoLmZsb29yKHggLyB0aGlzLmNlbGwpLCBNYXRoLmZsb29yKHogLyB0aGlzLmNlbGwpKSk7XG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBiaSA9IC0xLCBidCA9IDA7XG4gICAgZm9yIChjb25zdCBpIG9mIGxpc3QpIHtcbiAgICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tpXSwgYiA9IHRoaXMucG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IGR4ID0gYi54IC0gYS54LCBkeiA9IGIueiAtIGEuejtcbiAgICAgIGNvbnN0IGxlbjIgPSBkeCAqIGR4ICsgZHogKiBkeiB8fCAxO1xuICAgICAgY29uc3QgdCA9IGNsYW1wKCgoeCAtIGEueCkgKiBkeCArICh6IC0gYS56KSAqIGR6KSAvIGxlbjIsIDAsIDEpO1xuICAgICAgY29uc3QgcHggPSBhLnggKyBkeCAqIHQsIHB6ID0gYS56ICsgZHogKiB0O1xuICAgICAgY29uc3QgZDIgPSAoeCAtIHB4KSAqKiAyICsgKHogLSBweikgKiogMjtcbiAgICAgIGlmIChkMiA8IGJlc3QpIHsgYmVzdCA9IGQyOyBiaSA9IGk7IGJ0ID0gdDsgfVxuICAgIH1cbiAgICBpZiAoYmkgPCAwIHx8IGJlc3QgPiB0aGlzLnJlYWNoICogdGhpcy5yZWFjaCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2JpXSwgYiA9IHRoaXMucG9pbnRzW2JpICsgMV07XG4gICAgY29uc3Qgc2VnTGVuID0gTWF0aC5tYXgoMWUtNiwgYi5zIC0gYS5zKTtcbiAgICAvLyBQb2ludHMgYXJlIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LCBzbyBkb3duc3RyZWFtIGlzIGEgPC0gYi5cbiAgICBjb25zdCB0eCA9IChhLnggLSBiLngpIC8gc2VnTGVuLCB0eiA9IChhLnogLSBiLnopIC8gc2VnTGVuO1xuICAgIHJldHVybiB7XG4gICAgICBkOiBNYXRoLnNxcnQoYmVzdCksXG4gICAgICBsZXZlbDogYS5sZXZlbCArIChiLmxldmVsIC0gYS5sZXZlbCkgKiBidCxcbiAgICAgIHdpZHRoOiBhLndpZHRoICsgKGIud2lkdGggLSBhLndpZHRoKSAqIGJ0LFxuICAgICAgdHgsIHR6LFxuICAgICAgZ3JhZGllbnQ6IE1hdGgubWF4KDAsIChiLmxldmVsIC0gYS5sZXZlbCkgLyBzZWdMZW4pLFxuICAgICAgczogYS5zICsgKGIucyAtIGEucykgKiBidCxcbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGNlbGxLZXkoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoY3ggKyA0MDk2KSAqIDgxOTIgKyAoY3ogKyA0MDk2KTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0ZXJCb2R5ID0gJ3JpdmVyJyB8ICdsYWtlJyB8ICdzZWEnIHwgJ25vbmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTYW1wbGUge1xuICBib2R5OiBXYXRlckJvZHk7XG4gIC8qKiBVbml0IGZsb3cgZGlyZWN0aW9uICh6ZXJvIGZvciBzdGlsbCB3YXRlcikuICovXG4gIGR4OiBudW1iZXI7XG4gIGR6OiBudW1iZXI7XG4gIC8qKiBTdXJmYWNlIGN1cnJlbnQgc3BlZWQgaW4gbS9zLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEh5ZHJvbG9neU9wdGlvbnMge1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKiBHZW5lcmF0b3IgdmVyc2lvbiB0aGUgbmV0d29yayBiZWxvbmdzIHRvLiAqL1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIC8qKiBCYXNlIGhlaWdodCBvZiB0aGUgKnVubW9kaWZpZWQgdjEgc2hhcGUqICh1c2VkIHRvIGxvY2F0ZSBsYWtlL2NoYW5uZWwpLiAqL1xuICB2MUhlaWdodDogSGVpZ2h0U2FtcGxlcjtcbn1cblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2dpY2FsIG5ldHdvcmsgZm9yIG9uZSAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pLiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJvbG9neSB7XG4gIHJlYWRvbmx5IHNlZWQ6IG51bWJlcjtcbiAgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuICByZWFkb25seSBsYWtlOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByeDogbnVtYmVyOyByejogbnVtYmVyIH07XG4gIHJlYWRvbmx5IGxvd2VyOiBSaXZlclJlYWNoO1xuICByZWFkb25seSB1cHBlcjogUml2ZXJSZWFjaCB8IG51bGw7XG4gIC8qKiBVcHBlci1yaXZlciBzb3VyY2UgdGFybiAodjIgb25seSkuICovXG4gIHJlYWRvbmx5IHRhcm46IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlcjsgbGV2ZWw6IG51bWJlciB9IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihvcHRzOiBIeWRyb2xvZ3lPcHRpb25zKSB7XG4gICAgdGhpcy5zZWVkID0gb3B0cy5zZWVkO1xuICAgIHRoaXMudmVyc2lvbiA9IG9wdHMudmVyc2lvbjtcbiAgICB0aGlzLmxha2UgPSBsb2NhdGVMYWtlKG9wdHMudjFIZWlnaHQpO1xuICAgIHRoaXMubG93ZXIgPSB0cmFjZUxvd2VyUml2ZXIob3B0cy52MUhlaWdodCwgdGhpcy5sYWtlKTtcbiAgICBpZiAob3B0cy52ZXJzaW9uID49IDIpIHtcbiAgICAgIGNvbnN0IHVwcGVyID0gYXV0aG9yVXBwZXJSaXZlcihvcHRzLnNlZWQsIHRoaXMubGFrZSk7XG4gICAgICB0aGlzLnVwcGVyID0gdXBwZXIucmVhY2g7XG4gICAgICB0aGlzLnRhcm4gPSB1cHBlci50YXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwcGVyID0gbnVsbDtcbiAgICAgIHRoaXMudGFybiA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1cmZhY2UgY3VycmVudCBmb3IgYSB3YXRlciBjb2x1bW4uIGBsZXZlbGAgaXMgdGhlIGNvbHVtbidzIHdhdGVyIHN1cmZhY2UsXG4gICAqIHVzZWQgdG8gdGVsbCBzZWEtbGV2ZWwgd2F0ZXIgKGxha2UsIGxvd2VyIHJpdmVyLCBzZWEpIGZyb20gdGhlIHVwcGVyIHJpdmVyLlxuICAgKi9cbiAgZmxvd0F0KHg6IG51bWJlciwgejogbnVtYmVyLCBsZXZlbDogbnVtYmVyKTogRmxvd1NhbXBsZSB7XG4gICAgaWYgKHRoaXMudXBwZXIgJiYgbGV2ZWwgPiAwLjUpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMudXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPD0gaGl0LndpZHRoICsgMikge1xuICAgICAgICBjb25zdCBzcGVlZCA9IGNsYW1wKDAuNTUgKyBoaXQuZ3JhZGllbnQgKiA5LCAwLjQsIDQuNSk7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBoaXQudHgsIGR6OiBoaXQudHosIHNwZWVkIH07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50YXJuICYmIE1hdGguaHlwb3QoeCAtIHRoaXMudGFybi54LCB6IC0gdGhpcy50YXJuLnopIDwgdGhpcy50YXJuLnIgKyA0KSB7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4udG93YXJkcyh4LCB6LCB0aGlzLnVwcGVyU291cmNlKCksIDAuMDYpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxvdyA9IHRoaXMubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDw9IGxvdy53aWR0aCArIDYpIHtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBsb3cudHgsIGR6OiBsb3cudHosIHNwZWVkOiAwLjM1ICsgMC4yNSAqIHNtb290aHN0ZXAobG93LndpZHRoICsgNiwgMCwgbG93LmQpIH07XG4gICAgfVxuICAgIGNvbnN0IGxkID0gTWF0aC5oeXBvdCgoeCAtIHRoaXMubGFrZS54KSAvIHRoaXMubGFrZS5yeCwgKHogLSB0aGlzLmxha2UueikgLyB0aGlzLmxha2UucnopO1xuICAgIGlmIChsZCA8IDEuMzUpIHtcbiAgICAgIC8vIFNsb3cgZHJpZnQgZnJvbSB0aGUgaW5mbG93IHRvd2FyZCB0aGUgb3V0ZmxvdyBhdCB0aGUgaGVhZCBvZiB0aGUgbG93ZXIgcml2ZXIuXG4gICAgICBjb25zdCBoZWFkID0gdGhpcy5sb3dlci5wb2ludHNbdGhpcy5sb3dlci5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBkcmlmdCA9IHRvd2FyZHMoeCwgeiwgaGVhZCwgMC4wOCk7XG4gICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLmRyaWZ0IH07XG4gICAgfVxuICAgIHJldHVybiB7IGJvZHk6ICdzZWEnLCBkeDogMCwgZHo6IDAsIHNwZWVkOiAwIH07XG4gIH1cblxuICBwcml2YXRlIHVwcGVyU291cmNlKCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcHRzID0gdGhpcy51cHBlciEucG9pbnRzO1xuICAgIHJldHVybiBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvd2FyZHMoeDogbnVtYmVyLCB6OiBudW1iZXIsIHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgc3BlZWQ6IG51bWJlcikge1xuICBjb25zdCBkeCA9IHAueCAtIHgsIGR6ID0gcC56IC0gejtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gIHJldHVybiB7IGR4OiBkeCAvIGxlbiwgZHo6IGR6IC8gbGVuLCBzcGVlZCB9O1xufVxuXG4vKiogRmluZCB0aGUgdmFsbGV5IGxha2UgZnJvbSB0aGUgdGVycmFpbiBpdHNlbGY6IHRoZSBkZWVwIGJhc2luIE5XIG9mIHRoZSBmb3VuZGVyIHZhbGxleS4gKi9cbmZ1bmN0aW9uIGxvY2F0ZUxha2UoaDogSGVpZ2h0U2FtcGxlcik6IEh5ZHJvbG9neVsnbGFrZSddIHtcbiAgbGV0IHN4ID0gMCwgc3ogPSAwLCBuID0gMCwgbWluWCA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtaW5aID0gSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gIGZvciAobGV0IHogPSAtNDYwOyB6IDw9IC0xMjA7IHogKz0gNCkge1xuICAgIGZvciAobGV0IHggPSAtNDgwOyB4IDw9IC00MDsgeCArPSA0KSB7XG4gICAgICBpZiAoaCh4LCB6KSA+IC00KSBjb250aW51ZTtcbiAgICAgIHN4ICs9IHg7IHN6ICs9IHo7IG4rKztcbiAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCB4KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHgpO1xuICAgICAgbWluWiA9IE1hdGgubWluKG1pblosIHopOyBtYXhaID0gTWF0aC5tYXgobWF4Wiwgeik7XG4gICAgfVxuICB9XG4gIGlmIChuID09PSAwKSByZXR1cm4geyB4OiAtMjYwLCB6OiAtMjMwLCByeDogMTIwLCByejogOTUgfTtcbiAgcmV0dXJuIHtcbiAgICB4OiBzeCAvIG4sIHo6IHN6IC8gbixcbiAgICByeDogTWF0aC5tYXgoMzAsIChtYXhYIC0gbWluWCkgLyAyICsgMTApLCByejogTWF0aC5tYXgoMzAsIChtYXhaIC0gbWluWikgLyAyICsgMTApLFxuICB9O1xufVxuXG4vKipcbiAqIFRyYWNlIHRoZSBjYXJ2ZWQgbG93bGFuZCBjaGFubmVsIGZyb20gdGhlIGxha2Ugb3V0ZmxvdyBzb3V0aCB0byB0aGUgc2VhLiBGb3JcbiAqIGVhY2ggNCBtIHJvdyB0aGUgY2hhbm5lbCBpcyB0aGUgbG93ZXN0IGNvbHVtbiBuZWFyIHRoZSBwcmV2aW91cyBjZW50cmU7IHRoZVxuICogdHJhY2UgaXMgc21vb3RoZWQgc28gdGhlIGZsb3cgZmllbGQgZG9lcyBub3Qgaml0dGVyIHdpdGggdGhlIDEgbSB2b3hlbHMuXG4gKi9cbmZ1bmN0aW9uIHRyYWNlTG93ZXJSaXZlcihoOiBIZWlnaHRTYW1wbGVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IFJpdmVyUmVhY2gge1xuICBjb25zdCByYXc6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgbGV0IGN4ID0gbGFrZS54ICsgbGFrZS5yeCAqIDAuNTU7XG4gIGxldCB6ID0gTWF0aC5yb3VuZChsYWtlLnogKyBsYWtlLnJ6ICogMC42KTtcbiAgLy8gU3RhcnQgYXQgdGhlIGxha2UncyBzb3V0aC1lYXN0IG91dGZsb3cgYW5kIGZvbGxvdyB0aGUgY2hhbm5lbCBkb3duc3RyZWFtLlxuICBmb3IgKDsgeiA8PSA5MDA7IHogKz0gNCkge1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJ4ID0gY3g7XG4gICAgZm9yIChsZXQgeCA9IE1hdGgucm91bmQoY3ggLSA0MCk7IHggPD0gY3ggKyA0MDsgeCArPSAyKSB7XG4gICAgICBjb25zdCB2ID0gaCh4LCB6KSArIE1hdGguYWJzKHggLSBjeCkgKiAwLjAyO1xuICAgICAgaWYgKHYgPCBiZXN0KSB7IGJlc3QgPSB2OyBieCA9IHg7IH1cbiAgICB9XG4gICAgY3ggPSBieDtcbiAgICByYXcucHVzaCh7IHg6IGJ4LCB6IH0pO1xuICAgIC8vIFRoZSB0cmFjZSBlbmRzIG9uY2UgaXQgcmVhY2hlcyBvcGVuIHNlYSBmb3IgYSBzdXN0YWluZWQgc3RyZXRjaC5cbiAgICBpZiAoYmVzdCA8IC02ICYmIHJhdy5sZW5ndGggPiAyMCAmJiBoKGJ4LCB6ICsgOCkgPCAtNiAmJiBoKGJ4LCB6ICsgMTYpIDwgLTYpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHNtb290aCA9IHJhdy5tYXAoKHAsIGkpID0+IHtcbiAgICBsZXQgc3ggPSAwLCBuID0gMDtcbiAgICBmb3IgKGxldCBrID0gTWF0aC5tYXgoMCwgaSAtIDQpOyBrIDw9IE1hdGgubWluKHJhdy5sZW5ndGggLSAxLCBpICsgNCk7IGsrKykgeyBzeCArPSByYXdba10ueDsgbisrOyB9XG4gICAgcmV0dXJuIHsgeDogc3ggLyBuLCB6OiBwLnogfTtcbiAgfSk7XG4gIC8vIFN0b3JlIGRvd25zdHJlYW0tZmlyc3Q6IGluZGV4IDAgaXMgdGhlIHNlYSBtb3V0aC5cbiAgc21vb3RoLnJldmVyc2UoKTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSBbXTtcbiAgbGV0IHMgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNtb290aC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChpID4gMCkgcyArPSBNYXRoLmh5cG90KHNtb290aFtpXS54IC0gc21vb3RoW2kgLSAxXS54LCBzbW9vdGhbaV0ueiAtIHNtb290aFtpIC0gMV0ueik7XG4gICAgcG9pbnRzLnB1c2goeyB4OiBzbW9vdGhbaV0ueCwgejogc21vb3RoW2ldLnosIHMsIGxldmVsOiAwLCB3aWR0aDogNiB9KTtcbiAgfVxuICByZXR1cm4gbmV3IFJpdmVyUmVhY2gocG9pbnRzLCA0MCk7XG59XG5cbi8qKiBXYXRlci1zdXJmYWNlIGRyb3BzIGFsb25nIHRoZSB1cHBlciByaXZlciwgYXMgKGZyYWN0aW9uIG9mIGxlbmd0aCwgbWV0cmVzKS4gKi9cbmNvbnN0IEZBTExTOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0+ID0gW1swLjIsIDddLCBbMC40OCwgMTFdLCBbMC43NCwgMTNdXTtcbmNvbnN0IFVQUEVSX0dSQURJRU5UID0gMC4wMztcblxuLyoqXG4gKiBBdXRob3IgdGhlIHYyIG1vdW50YWluIHJpdmVyOiBhIHNlZWRlZCBtZWFuZGVyaW5nIGNlbnRyZWxpbmUgZnJvbSB0aGUgbGFrZSdzXG4gKiBub3J0aCBzaG9yZSB0byBhIGhpZ2hsYW5kIHRhcm4sIHdpdGggYSBsZXZlbCBwcm9maWxlIHRoYXQgb25seSByaXNlc1xuICogdXBzdHJlYW0gKGdlbnRsZSBncmFkaWVudCBwbHVzIHRocmVlIGNhc2NhZGVzKS5cbiAqL1xuZnVuY3Rpb24gYXV0aG9yVXBwZXJSaXZlcihzZWVkOiBudW1iZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKToge1xuICByZWFjaDogUml2ZXJSZWFjaDsgdGFybjogTm9uTnVsbGFibGU8SHlkcm9sb2d5Wyd0YXJuJ10+O1xufSB7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKHNlZWQgXiAweDVlZWQyKSA+Pj4gMCk7XG4gIGNvbnN0IGogPSAoYTogbnVtYmVyKSA9PiAocm5kKCkgLSAwLjUpICogMiAqIGE7XG4gIGNvbnN0IG1vdXRoID0geyB4OiBsYWtlLnggKyBsYWtlLnJ4ICogMC4xLCB6OiBsYWtlLnogLSBsYWtlLnJ6ICogMC41NSB9O1xuICBjb25zdCBjb250cm9scyA9IFtcbiAgICBtb3V0aCxcbiAgICB7IHg6IGxha2UueCArIDIwICsgaigyMCksIHo6IC00MTAgKyBqKDE1KSB9LFxuICAgIHsgeDogLTE5MCArIGooMzUpLCB6OiAtNTIwICsgaigyMCkgfSxcbiAgICB7IHg6IC0yMTUgKyBqKDM1KSwgejogLTY0MCArIGooMjApIH0sXG4gICAgeyB4OiAtMTY1ICsgaigzMCksIHo6IC03NzAgKyBqKDE1KSB9LFxuICBdO1xuICAvLyBDYXRtdWxsLVJvbSB0aHJvdWdoIHRoZSBjb250cm9scywgdGhlbiByZXNhbXBsZSBhdCB+OCBtIHNwYWNpbmcgd2l0aCBhXG4gIC8vIHNtYWxsIHNlZWRlZCBtZWFuZGVyIHNvIHRoZSBjaGFubmVsIGlzIG5vdCBhIHNtb290aCBzcGxpbmUuXG4gIGNvbnN0IGRlbnNlOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29udHJvbHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgY29uc3QgcDAgPSBjb250cm9sc1tNYXRoLm1heCgwLCBpIC0gMSldLCBwMSA9IGNvbnRyb2xzW2ldO1xuICAgIGNvbnN0IHAyID0gY29udHJvbHNbaSArIDFdLCBwMyA9IGNvbnRyb2xzW01hdGgubWluKGNvbnRyb2xzLmxlbmd0aCAtIDEsIGkgKyAyKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCAyNDsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gayAvIDI0LCB0MiA9IHQgKiB0LCB0MyA9IHQyICogdDtcbiAgICAgIGRlbnNlLnB1c2goe1xuICAgICAgICB4OiAwLjUgKiAoMiAqIHAxLnggKyAoLXAwLnggKyBwMi54KSAqIHQgKyAoMiAqIHAwLnggLSA1ICogcDEueCArIDQgKiBwMi54IC0gcDMueCkgKiB0MlxuICAgICAgICAgICsgKC1wMC54ICsgMyAqIHAxLnggLSAzICogcDIueCArIHAzLngpICogdDMpLFxuICAgICAgICB6OiAwLjUgKiAoMiAqIHAxLnogKyAoLXAwLnogKyBwMi56KSAqIHQgKyAoMiAqIHAwLnogLSA1ICogcDEueiArIDQgKiBwMi56IC0gcDMueikgKiB0MlxuICAgICAgICAgICsgKC1wMC56ICsgMyAqIHAxLnogLSAzICogcDIueiArIHAzLnopICogdDMpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGRlbnNlLnB1c2goY29udHJvbHNbY29udHJvbHMubGVuZ3RoIC0gMV0pO1xuICBjb25zdCByZXNhbXBsZWQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHM6IG51bWJlciB9PiA9IFt7IC4uLmRlbnNlWzBdLCBzOiAwIH1dO1xuICBsZXQgYWNjID0gMCwgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgZGVuc2UubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5oeXBvdChkZW5zZVtpXS54IC0gZGVuc2VbaSAtIDFdLngsIGRlbnNlW2ldLnogLSBkZW5zZVtpIC0gMV0ueik7XG4gICAgYWNjICs9IHN0ZXA7IHMgKz0gc3RlcDtcbiAgICBpZiAoYWNjID49IDggfHwgaSA9PT0gZGVuc2UubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbSA9IChmYm0yKHMgLyA2MCwgMy4xLCBzZWVkICsgODAxLCAyKSAtIDAuNSkgKiAxNDtcbiAgICAgIHJlc2FtcGxlZC5wdXNoKHsgeDogZGVuc2VbaV0ueCArIG0sIHo6IGRlbnNlW2ldLnosIHMgfSk7XG4gICAgICBhY2MgPSAwO1xuICAgIH1cbiAgfVxuICBjb25zdCB0b3RhbCA9IHJlc2FtcGxlZFtyZXNhbXBsZWQubGVuZ3RoIC0gMV0ucztcbiAgY29uc3QgbGV2ZWxBdCA9IChzdjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGV2ZWwgPSBzdiAqIFVQUEVSX0dSQURJRU5UO1xuICAgIGZvciAoY29uc3QgW2ZyYWMsIGRyb3BdIG9mIEZBTExTKSB7XG4gICAgICAvLyBFYWNoIGZhbGwgaXMgYSBzaG9ydCBjYXNjYWRlIG92ZXIgfjEwIG0gb2YgY2hhbm5lbC5cbiAgICAgIGxldmVsICs9IGRyb3AgKiBzbW9vdGhzdGVwKHRvdGFsICogZnJhYyAtIDUsIHRvdGFsICogZnJhYyArIDUsIHN2KTtcbiAgICB9XG4gICAgLy8gVGhlIGZpcnN0IDQwIG0gaW50byB0aGUgbGFrZSBzdGF5cyBhdCBsYWtlIGxldmVsLlxuICAgIHJldHVybiBzdiA8IDQwID8gMCA6IGxldmVsIC0gNDAgKiBVUFBFUl9HUkFESUVOVDtcbiAgfTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSByZXNhbXBsZWQubWFwKChwKSA9PiAoe1xuICAgIHg6IHAueCwgejogcC56LCBzOiBwLnMsIGxldmVsOiBNYXRoLm1heCgwLCBsZXZlbEF0KHAucykpLFxuICAgIHdpZHRoOiAzLjIgKyAyLjIgKiBmYm0yKHAucyAvIDcwLCA5LjcsIHNlZWQgKyA4MDIsIDIpICsgKDEgLSBwLnMgLyB0b3RhbCkgKiAxLjUsXG4gIH0pKTtcbiAgY29uc3Qgc291cmNlID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHtcbiAgICByZWFjaDogbmV3IFJpdmVyUmVhY2gocG9pbnRzLCAxMTApLFxuICAgIHRhcm46IHsgeDogc291cmNlLngsIHo6IHNvdXJjZS56LCByOiAxOCwgbGV2ZWw6IHNvdXJjZS5sZXZlbCB9LFxuICB9O1xufVxuIiwgIi8vIFZveGVsIG1hdGVyaWFsIGlkcy4gUHVyZSBkYXRhIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllciAoRC0wMDUpLlxuLy8gSWRzIGFyZSBwZXJzaXN0ZWQgaW4gc25hcHNob3QgZWRpdHMsIHNvIGV4aXN0aW5nIHZhbHVlcyBtdXN0IG5ldmVyIGNoYW5nZS5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG4gIC8qKiBHZW5lcmF0b3IgdjIgaGlnaGxhbmRzLiBOZXZlciBwcm9kdWNlZCBieSBnZW5lcmF0b3IgdjEuICovXG4gIFNOT1c6IDEwLFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuLyoqIEhpZ2hlc3QgbWF0ZXJpYWwgaWQgdGhhdCBtYXkgYXBwZWFyIGluIGEgdm94ZWwgZWRpdC4gKi9cbmV4cG9ydCBjb25zdCBNQVhfTUFUX0lEID0gMTA7XG4iLCAiLy8gVGVycmFpbiBnZW5lcmF0b3IgdjIgXHUyMDE0IHRoZSB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IChwdXJlIFRTLCBELTAwNSkuXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBjb250cmFjdDogaW5zaWRlIHRoZSBmb3VuZGVyIGNvcnJpZG9yICh0aGUgc2V0dGxlbWVudCB2YWxsZXksXG4vLyB0aGUgbGFrZSBhbmQgdGhlIGxvd2xhbmQgcml2ZXIpIHYyIGhlaWdodHMgZXF1YWwgdjEgZXhhY3RseSwgc28gdGhlIHBpbm5lZFxuLy8gZm91bmRlciBwcm9qZWN0cywgdGhlaXIgcHJlcGFyYXRpb24gdGFyZ2V0cyBhbmQgbmF0dXJhbCBlbnRpdGllcyB0aGVyZSBhcmVcbi8vIHVuY2hhbmdlZC4gT3V0c2lkZSBpdCB2MiBhZGRzOlxuLy8gICAtIGEgbm9ydGhlcm4gbWFzc2lmIG9uIGFuIGV4dGVuZGVkIGlzbGFuZCwgd2l0aCBzbm93IGFib3ZlIHRoZSBzbm93bGluZTtcbi8vICAgLSBmbGFua2luZyByYW5nZXMgd2VzdCBhbmQgZWFzdCBvZiB0aGUgdmFsbGV5LCB0ZXJyYWNlZCBpbnRvIGNsaWZmIGJhbmRzO1xuLy8gICAtIGEgbW91bnRhaW4gcml2ZXIgY2FydmVkIGludG8gdGhlIG1hc3NpZiBmcm9tIGEgdGFybiBkb3duIHRvIHRoZSBsYWtlLFxuLy8gICAgIHdob3NlIHdhdGVyIHN1cmZhY2UgY29tZXMgZnJvbSBIeWRyb2xvZ3kgYW5kIG5ldmVyIHJpc2VzIGRvd25zdHJlYW07XG4vLyAgIC0gYSBjb250aW51b3VzIGxvd2xhbmQgY2hhbm5lbCAodjEgaGFzIGEgZHJ5IGZvcmQgc291dGggb2YgdGhlIHNoZWxmKS5cbi8vIEhlaWdodHMgYXJlIGludGVnZXJzIGluIFstMTQsIDEwNF0uXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbGVycCwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHsgTUFULCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcblxuZXhwb3J0IGNvbnN0IFYyX1NOT1dMSU5FID0gNzQ7XG5leHBvcnQgY29uc3QgVjJfTUFYX0hFSUdIVCA9IDEwNDtcblxuZXhwb3J0IHR5cGUgVjFIZWlnaHQgPSAoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFYyQ29sdW1uIHtcbiAgLyoqIFRvcCBzb2xpZCB5ICsgMSAoc2FtZSBjb252ZW50aW9uIGFzIHN1cmZhY2VIZWlnaHRBdCkuICovXG4gIGg6IG51bWJlcjtcbiAgLyoqIFdhdGVyIHN1cmZhY2UgZm9yIHRoaXMgY29sdW1uOiBjZWxscyBbaCwgbGV2ZWwpIGhvbGQgd2F0ZXIuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBjb2x1bW4gaXMgcGFydCBvZiB0aGUgY2FydmVkIG1vdW50YWluLXJpdmVyIGNoYW5uZWwuICovXG4gIGNoYW5uZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJyYWluVjIge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBzZWVkOiBudW1iZXIsXG4gICAgcHJpdmF0ZSByZWFkb25seSB2MTogVjFIZWlnaHQsXG4gICAgcmVhZG9ubHkgaHlkcm9sb2d5OiBIeWRyb2xvZ3ksXG4gICkge31cblxuICAvKiogMCA9IGV4YWN0bHkgdjEgKGZvdW5kZXIgY29ycmlkb3IpOyAxID0gZnVsbCB2MiByZWxpZWYuICovXG4gIHJlbGllZk1hc2soeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtMzkwLCAtNDcwLCB6KTtcbiAgICAvLyBUaGUgd2VzdCByYW5nZSBrZWVwcyBjbGVhciBvZiB0aGUgbGFrZSBiYXNpbiB1bnRpbCB0aGUgbGFrZSBpcyBwYXNzZWQuXG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlLCB3ZXN0RWRnZSAtIDkwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyMzAsIDMzMCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIC8qKiAwIGF0IHRoZSByYW5nZSBmcm9udCwgMSBkZWVwIGluc2lkZTogZm9vdGhpbGxzIGZpcnN0LCBwZWFrcyBiZWhpbmQuICovXG4gIHJhbmdlRGVwdGgoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtNDIwLCAtNzAwLCB6KTtcbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UgLSA0MCwgd2VzdEVkZ2UgLSAzMDAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDI3MCwgNTYwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVjJDb2x1bW4ge1xuICAgIGNvbnN0IHNlZWQgPSB0aGlzLnNlZWQ7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMudjEoc2VlZCwgeCwgeik7XG4gICAgY29uc3QgbWFzayA9IHRoaXMucmVsaWVmTWFzayh4LCB6KTtcbiAgICBsZXQgaCA9IGJhc2U7XG5cbiAgICBpZiAobWFzayA+IDApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgaXNsYW5kIG5vcnRoIHNvIHRoZSBtYXNzaWYgaGFzIHJvb20gKHYxIGNvYXN0IGlzIH56IC02MDApLlxuICAgICAgY29uc3Qgbm9ydGhMYW5kID0gc21vb3Roc3RlcCgtNDIwLCAtNTIwLCB6KTtcbiAgICAgIGNvbnN0IHNob3JlID0gMSAtIE1hdGguaHlwb3QoKHggKyAxNTApIC8gNTYwLCAoeiArIDY5MCkgLyAzMDApXG4gICAgICAgICsgKGZibTIoeCAvIDE2MCwgeiAvIDE2MCwgc2VlZCArIDcwMSwgMykgLSAwLjUpICogMC4zO1xuICAgICAgY29uc3QgbGFuZE4gPSBzbW9vdGhzdGVwKDAuMCwgMC4xNCwgc2hvcmUpICogbm9ydGhMYW5kO1xuICAgICAgY29uc3QgZ3JvdW5kID0gbGVycChiYXNlLCBNYXRoLm1heChiYXNlLCA1ICsgNSAqIGZibTIoeCAvIDkwLCB6IC8gOTAsIHNlZWQgKyA3MDIsIDIpKSwgbGFuZE4pO1xuXG4gICAgICAvLyBSaWRnZWQgbWFzc2lmIHdpdGggdGVycmFjZWQgY2xpZmYgYmFuZHMuXG4gICAgICBjb25zdCB3eCA9IHggKyAoZmJtMih4IC8gMjYwLCB6IC8gMjYwLCBzZWVkICsgNzAzLCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCB3eiA9IHogKyAoZmJtMih4IC8gMjYwICsgNS4xLCB6IC8gMjYwIC0gMi43LCBzZWVkICsgNzA0LCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCByMSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIxMCwgd3ogLyAyMTAsIHNlZWQgKyA3MDUsIDQpIC0gMSk7XG4gICAgICBjb25zdCByMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDgwLCB3eiAvIDgwLCBzZWVkICsgNzA2LCAzKSAtIDEpO1xuICAgICAgY29uc3QgbHVtcCA9IGZibTIod3ggLyAxMjAsIHd6IC8gMTIwLCBzZWVkICsgNzA3LCAzKTtcbiAgICAgIGNvbnN0IGRlcHRoID0gdGhpcy5yYW5nZURlcHRoKHgsIHopO1xuICAgICAgbGV0IG1vdW50YWluID0gMTYgKyAoOCArIDgwICogZGVwdGgpICogKDAuNTUgKiByMSAqIHIxICsgMC4yOCAqIHIyICsgMC4xNyAqIGx1bXApXG4gICAgICAgICsgMTggKiBkZXB0aCAqIHNtb290aHN0ZXAoMC41NSwgMC45LCByMSk7XG4gICAgICBjb25zdCBiYW5kID0gNiArIDIgKiBmYm0yKHggLyAxNDAsIHogLyAxNDAsIHNlZWQgKyA3MDgsIDIpO1xuICAgICAgY29uc3QgdCA9IE1hdGguZmxvb3IobW91bnRhaW4gLyBiYW5kKTtcbiAgICAgIGNvbnN0IGZyYWMgPSBtb3VudGFpbiAvIGJhbmQgLSB0O1xuICAgICAgbW91bnRhaW4gPSAodCArIHNtb290aHN0ZXAoMC41LCAwLjgsIGZyYWMpKSAqIGJhbmQ7XG5cbiAgICAgIC8vIE9ubHkgbGFuZCByaXNlczsgdGhlIHNlYSBzdGF5cyBzZWEsIHNvIHJhbmdlcyBlbmQgaW4gY29hc3RhbCBjbGlmZnMuXG4gICAgICBjb25zdCBsYW5kRmFjdG9yID0gc21vb3Roc3RlcCgtMiwgOCwgZ3JvdW5kKTtcbiAgICAgIGggPSBsZXJwKGdyb3VuZCwgTWF0aC5tYXgoZ3JvdW5kLCBtb3VudGFpbiksIG1hc2sgKiBsYW5kRmFjdG9yKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSBoIDwgMCA/IDAgOiAtSW5maW5pdHk7XG4gICAgbGV0IGNoYW5uZWwgPSBmYWxzZTtcblxuICAgIC8vIE1vdW50YWluIHJpdmVyOiB2YWxsZXkgZmxvb3IsIGJhbmtzIGFuZCBjaGFubmVsIGZvbGxvdyB0aGUgd2F0ZXIgbGV2ZWwuXG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIGNvbnN0IHJhaXNlZCA9IGhpdC5sZXZlbCA+IDAuMjU7XG4gICAgICAgIGNvbnN0IHZ3ID0gNTUgKyAyOCAqIGZibTIoaGl0LnMgLyA5MCwgMS43LCBzZWVkICsgNzA5LCAyKTtcbiAgICAgICAgY29uc3QgZmxvb3IgPSBoaXQubGV2ZWwgKyAxLjUgKyAyLjIgKiBmYm0yKHggLyA0MCwgeiAvIDQwLCBzZWVkICsgNzEwLCAyKSArIGhpdC5kICogMC4wNjtcbiAgICAgICAgY29uc3QgdCA9IHNtb290aHN0ZXAodncgKiAwLjMsIHZ3LCBoaXQuZCk7XG4gICAgICAgIGggPSBNYXRoLm1pbihoLCBsZXJwKGZsb29yLCBoLCB0KSk7XG4gICAgICAgIGNvbnN0IHcgPSBoaXQud2lkdGg7XG4gICAgICAgIGlmIChyYWlzZWQgJiYgaGl0LmQgPCB3ICsgMykge1xuICAgICAgICAgIC8vIEJhbmtzIGhvbGQgYSByYWlzZWQgcml2ZXI6IG5ldmVyIGJlbG93IGl0cyB3YXRlciBzdXJmYWNlLiBBdCBsYWtlXG4gICAgICAgICAgLy8gbGV2ZWwgdGhlIHNlYS1sZXZlbCBmaWxsIGFscmVhZHkgY29udGFpbnMgdGhlIHdhdGVyLlxuICAgICAgICAgIGggPSBNYXRoLm1heChoLCBNYXRoLmNlaWwoaGl0LmxldmVsKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoaXQuZCA8IHcpIHtcbiAgICAgICAgICBjb25zdCBiZWQgPSBoaXQubGV2ZWwgLSAoMS4yICsgMS4zICogKDEgLSBoaXQuZCAvIHcpKTtcbiAgICAgICAgICBoID0gTWF0aC5taW4oaCwgYmVkKTtcbiAgICAgICAgICBpZiAocmFpc2VkKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKGhpdC5sZXZlbCkpO1xuICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCB0YXJuID0gdGhpcy5oeWRyb2xvZ3kudGFybjtcbiAgICAgIGlmICh0YXJuKSB7XG4gICAgICAgIGNvbnN0IHRkID0gTWF0aC5oeXBvdCh4IC0gdGFybi54LCB6IC0gdGFybi56KVxuICAgICAgICAgICogKDEgKyAwLjIgKiAoZmJtMih4IC8gMzAsIHogLyAzMCwgc2VlZCArIDcxMSwgMikgLSAwLjUpKTtcbiAgICAgICAgaWYgKHRkIDwgdGFybi5yICsgNikge1xuICAgICAgICAgIGNvbnN0IHJpbSA9IE1hdGguY2VpbCh0YXJuLmxldmVsKSArIDE7XG4gICAgICAgICAgaWYgKHRkID49IHRhcm4ucikgaCA9IE1hdGgubWF4KGgsIHJpbSk7XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoID0gTWF0aC5taW4oTWF0aC5tYXgoaCwgcmltKSwgdGFybi5sZXZlbCAtIDEgLSAzICogc21vb3Roc3RlcCh0YXJuLnIsIDAsIHRkKSk7XG4gICAgICAgICAgICBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKHRhcm4ubGV2ZWwpKTtcbiAgICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvd2xhbmQgY2hhbm5lbCBjb250aW51aXR5OiB2MSBsZWF2ZXMgYSBkcnkgZm9yZCB3aGVyZSB0aGUgc2hlbGYgbWVldHMgdGhlIHJpdmVyLlxuICAgIGNvbnN0IGxvdyA9IHRoaXMuaHlkcm9sb2d5Lmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8IDIuNSAmJiBoID49IDAgJiYgYmFzZSA8IDQpIGggPSAtMTtcblxuICAgIGggPSBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgVjJfTUFYX0hFSUdIVCkpO1xuICAgIGlmIChoIDwgMCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgMCk7XG4gICAgcmV0dXJuIHsgaCwgbGV2ZWw6IGxldmVsID09PSAtSW5maW5pdHkgPyBoIDogbGV2ZWwsIGNoYW5uZWwgfTtcbiAgfVxuXG4gIGhlaWdodCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1uKHgsIHopLmg7XG4gIH1cblxuICAvKiogdjIgdG9wIG1hdGVyaWFsLiBGYWxscyBiYWNrIHRvIHRoZSB2MSBydWxlcyBmb3IgdGhlIHVuY2hhbmdlZCBjb3JyaWRvci4gKi9cbiAgdG9wTWF0ZXJpYWwoXG4gICAgeDogbnVtYmVyLCB6OiBudW1iZXIsIGNvbDogVjJDb2x1bW4sIHNsb3BlOiBudW1iZXIsXG4gICAgdjFUb3A6IChoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIpID0+IE1hdElkLFxuICApOiBNYXRJZCB7XG4gICAgY29uc3QgaCA9IGNvbC5oO1xuICAgIGlmIChjb2wuY2hhbm5lbCAmJiBjb2wubGV2ZWwgPiBoKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlciAmJiBoID4gMSkge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPCBoaXQud2lkdGggKyAyLjUgJiYgaGl0LmxldmVsID4gMC4yNSkge1xuICAgICAgICByZXR1cm4gZmJtMih4IC8gNiwgeiAvIDYsIHRoaXMuc2VlZCArIDcxMiwgMSkgPiAwLjUgPyBNQVQuR1JBVkVMIDogTUFULlNBTkQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNub3dsaW5lID0gVjJfU05PV0xJTkUgKyAoZmJtMih4IC8gNzAsIHogLyA3MCwgdGhpcy5zZWVkICsgNzEzLCAzKSAtIDAuNSkgKiAxNjtcbiAgICBpZiAoaCA+PSBzbm93bGluZSAmJiBzbG9wZSA8PSAzKSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgLSA2ICYmIHNsb3BlIDw9IDEgJiYgZmJtMih4IC8gMjAsIHogLyAyMCwgdGhpcy5zZWVkICsgNzE0LCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAodGhpcy5yZWxpZWZNYXNrKHgsIHopID4gMC41ICYmIGggPiAzMCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICAgIHJldHVybiB2MVRvcChoLCBzbG9wZSk7XG4gIH1cbn1cbiIsICIvLyBTaW11bGF0aW9uIGxheWVyIFx1MjAxNCBwdXJlIFR5cGVTY3JpcHQsIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAxIHdvcmxkIGZvdW5kYXRpb246IGEgY2h1bmtlZCwgZ2VudWluZWx5IHRocmVlLWRpbWVuc2lvbmFsIHZveGVsIHdvcmxkLlxuLy8gVGhlIHN0b3JlZCBzdGF0ZSBpcyBvbmUgbWF0ZXJpYWwgYnl0ZSBwZXIgY2VsbCAoMCA9IGFpcik7IG9jY3VwYW5jeSBpc1xuLy8gaW1wbGljaXQuIFN1cmZhY2UgaGVpZ2h0IGlzIGEgZGVyaXZlZCBxdWVyeSwgbm90IHRoZSBzdG9yYWdlLiBUaGlzIHJlcGxhY2VzXG4vLyB0aGUgZm9ybWVyIDI1NiB4IDI1NiBoZWlnaHRmaWVsZCAoc2VlIElSLTAwNSkuXG4vL1xuLy8gV29ybGQgbWV0cmVzOiB4L3ogaW4gWy0xMDI0LCAxMDI0KSwgeSBpbiBbLTE2LCAxMTIpLCBzZWEgbGV2ZWwgMC5cbi8vIEEgY2h1bmsgaXMgMzIgeCAzMiB4IDEyOCBjZWxscy4gR2VuZXJhdGlvbiBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQsXG4vLyBnZW5lcmF0b3IgdmVyc2lvbiwgcGFyYW1ldGVycyBhbmQgY2h1bmsgY29vcmRpbmF0ZXM7IGVkaXRzIGFyZSByZWNvcmRlZFxuLy8gc2VwYXJhdGVseSBhbmQgcmUtYXBwbGllZCB3aGVuIGEgY2h1bmsgaXMgcmVnZW5lcmF0ZWQuXG5pbXBvcnQgdHlwZSB7IFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IExpZmVTdGF0ZSB9IGZyb20gJy4vZWNvbm9teSc7XG5pbXBvcnQgdHlwZSB7IEhvbWVzdGVhZFN0YXRlIH0gZnJvbSAnLi9ob21lc3RlYWQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuaW1wb3J0IHsgdHJlZVRpbWJlciB9IGZyb20gJy4vdmVnZXRhdGlvbic7XG5cbmV4cG9ydCBjb25zdCBXT1JMRF9TSVpFID0gMjA0ODtcbmV4cG9ydCBjb25zdCBIQUxGID0gV09STERfU0laRSAvIDI7XG5leHBvcnQgY29uc3QgQ0hVTktfU0laRSA9IDMyO1xuZXhwb3J0IGNvbnN0IENIVU5LU19QRVJfU0lERSA9IFdPUkxEX1NJWkUgLyBDSFVOS19TSVpFO1xuZXhwb3J0IGNvbnN0IFlfTUlOID0gLTE2O1xuZXhwb3J0IGNvbnN0IFlfTUFYID0gMTEyO1xuZXhwb3J0IGNvbnN0IFdPUkxEX0hFSUdIVCA9IFlfTUFYIC0gWV9NSU47XG5leHBvcnQgY29uc3QgU0VBX0xFVkVMID0gMDtcbmV4cG9ydCBjb25zdCBXQVRFUiA9IFNFQV9MRVZFTDtcbi8qKiBHZW5lcmF0b3IgdjE6IHRoZSBvcmlnaW5hbCAyMDQ4IG0gaXNsYW5kLiBEZWZhdWx0IGZvciBjcmVhdGVXb3JsZCBhbmQgYWxsIGxlZ2FjeSBzYXZlcy4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVkVSU0lPTiA9IDE7XG4vKiogR2VuZXJhdG9yIHYyOiB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IHdpdGggYSBtb3VudGFpbiByaXZlciAoc2VlIHRlcnJhaW4tdjIudHMpLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WMiA9IDI7XG4vKiogVGhlIGdlbmVyYXRvciBuZXcgYnJvd3NlciB3b3JsZHMgdXNlIGJ5IGRlZmF1bHQuICovXG5leHBvcnQgY29uc3QgTEFURVNUX0dFTkVSQVRPUl9WRVJTSU9OID0gR0VORVJBVE9SX1YyO1xuZXhwb3J0IGNvbnN0IFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlM6IHJlYWRvbmx5IG51bWJlcltdID0gW0dFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjJdO1xuZXhwb3J0IGNvbnN0IGlzU3VwcG9ydGVkR2VuZXJhdG9yID0gKHY6IHVua25vd24pOiB2IGlzIG51bWJlciA9PlxuICB0eXBlb2YgdiA9PT0gJ251bWJlcicgJiYgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUy5pbmNsdWRlcyh2KTtcbmV4cG9ydCBjb25zdCBDSFVOS19WT0xVTUUgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRSAqIFdPUkxEX0hFSUdIVDtcbmV4cG9ydCBjb25zdCBDSFVOS19BUkVBID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkU7XG5cbmV4cG9ydCB7IE1BVCwgaXNTb2xpZCwgaXNPcGFxdWUsIE1BWF9NQVRfSUQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5leHBvcnQgdHlwZSB7IE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgTUFULCBpc1NvbGlkLCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcblxuZXhwb3J0IHtcbiAgY2xhbXAsIGxlcnAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCBmYm0yLFxufSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBzbW9vdGhzdGVwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgdmFsdWVOb2lzZTMsIGZibTIsIGZibTMsXG59IGZyb20gJy4vbm9pc2UnO1xuXG4vLyAtLS0tLS0tLS0tIHdvcmxkIHR5cGVzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRQYXJhbXMge1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9QQVJBTVM6IFdvcmxkUGFyYW1zID0ge1xuICBzaXplOiBXT1JMRF9TSVpFLFxuICBjaHVua1NpemU6IENIVU5LX1NJWkUsXG4gIHlNaW46IFlfTUlOLFxuICB5TWF4OiBZX01BWCxcbiAgc2VhTGV2ZWw6IFNFQV9MRVZFTCxcbiAgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1ZFUlNJT04sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBrZXk6IHN0cmluZztcbiAgLyoqIHggKyB6KjMyICsgKHktWV9NSU4pKjEwMjQgKi9cbiAgZGF0YTogVWludDhBcnJheTtcbiAgLyoqIHRvcCBzb2xpZCB5LCBlbmNvZGVkIGFzICh5IC0gWV9NSU4pLCAwLi4xMjc7IDAgbWVhbnMgbm8gc29saWQuICovXG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3AgbWF0ZXJpYWwgcGVyIGNvbHVtbi4gKi9cbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbiAgZGlydHk6IGJvb2xlYW47XG4gIGdlbmVyYXRlZEF0OiBudW1iZXI7XG59XG5cbi8vIE5hdHVyYWwgYXNzZXRzIGFyZSB0aGUgcHJvamVjdCdzIFN0eWwgKGBuYXRfYCkgcGlwZWxpbmUgKEFTLTAwMSB2MiksIG5vdFxuLy8gTm94ZWwgYXJjaGl0ZWN0dXJlLiBOb3hlbCByZW1haW5zIHRoZSBodW1hbi1tYWRlIGtpdC93YXlzdG9uZS9tYXJrZXIgc3lzdGVtLlxuLy8gUmV0aXJlZCBvbmx5IGFzIHdvcmxkIGNvbnRlbnQuIFRoZSBuYW1lcyByZW1haW4gaW4gdGhlIHNlcmlhbGl6ZWQgdHlwZSBzb1xuLy8gb2xkIHNuYXBzaG90cyBhbmQgYWNjZXB0ZWQgaGFydmVzdCBqb3VybmFscyBjYW4gYmUgbWlncmF0ZWQgd2l0aG91dCByZWplY3Rpbmdcbi8vIG90aGVyd2lzZSB2YWxpZCBzYXZlcy4gR2VuZXJhdGlvbiwgY29sbGlzaW9uIGFuZCBpbnNwZWN0aW9uIG5ldmVyIHVzZSB0aGVtLlxuZXhwb3J0IGNvbnN0IFJFVElSRURfU1RPTkVfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG5dKTtcbmV4cG9ydCBjb25zdCBpc1JldGlyZWRTdG9uZUtpbmQgPSAoa2luZDogRW50aXR5S2luZCk6IGJvb2xlYW4gPT4gUkVUSVJFRF9TVE9ORV9LSU5EUy5oYXMoa2luZCk7XG5leHBvcnQgdHlwZSBBY3RpdmVFbnRpdHlLaW5kID0gRXhjbHVkZTxFbnRpdHlLaW5kLFxuICAnc3R5bF9yb2NrX3NtYWxsJyB8ICdzdHlsX3JvY2tfbWVkaXVtJyB8ICdzdHlsX3JvY2tfbGFyZ2UnPjtcblxuZnVuY3Rpb24gbGl2ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgcmV0dXJuICFlbnRpdHkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhpZCkgPyBudWxsIDogZW50aXR5O1xufVxuXG5leHBvcnQgdHlwZSBFbnRpdHlLaW5kID1cbiAgfCAnc3R5bF90cmVlX3NwaXJlJ1xuICB8ICdzdHlsX3RyZWVfdGFibGUnXG4gIHwgJ3N0eWxfdHJlZV9jbHVzdGVyJ1xuICB8ICdzdHlsX3RyZWVfYmxvc3NvbSdcbiAgfCAnc3R5bF9zaHJ1YidcbiAgfCAnc3R5bF9yb2NrX3NtYWxsJ1xuICB8ICdzdHlsX3JvY2tfbWVkaXVtJ1xuICB8ICdzdHlsX3JvY2tfbGFyZ2UnXG4gIHwgJ3N0eWxfb3JlJ1xuICB8ICdzdHlsX2NhaXJuJ1xuICB8ICd3YXlzdG9uZSdcbiAgfCAnbWFya2VyJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VUeXBlID0gJ3dvb2QnIHwgJ3N0b25lJyB8ICdvcmUnIHwgJ2ZpYmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRpdHkge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmFyaWFudDogbnVtYmVyO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgcmVtYWluaW5nOiBudW1iZXI7XG4gIHlpZWxkUGVySGFydmVzdDogbnVtYmVyO1xuICAvKiogVHJ1ZSBvbmNlIHRoZSBlbnRpdHkgaXMgZnVsbHkgZGVwbGV0ZWQuICovXG4gIGhhcnZlc3RlZDogYm9vbGVhbjtcbiAgLyoqIFRydWUgYWZ0ZXIgdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgaGFydmVzdCwgZXZlbiBpZiB5aWVsZCByZW1haW5zLiAqL1xuICBoYXJ2ZXN0ZWRPbmNlPzogYm9vbGVhbjtcbiAgcHJvdmlzaW9uYWw6IGJvb2xlYW47XG4gIGF1dGhvcmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5veGVsU2l0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2lvbkluZm8ge1xuICBpZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICB0eXBlOiAncGxhaW4nIHwgJ2ZvcmVzdCcgfCAnaGlsbHMnIHwgJ2hpZ2hsYW5kJyB8ICd3YXRlcicgfCAncmlkZ2UnO1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICByeDogbnVtYmVyO1xuICByejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkU3RhdHMge1xuICBjaHVua3NHZW5lcmF0ZWQ6IG51bWJlcjtcbiAgY2h1bmtzRXZpY3RlZDogbnVtYmVyO1xuICB2b3hlbHNGaWxsZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGlvbk1zOiBudW1iZXI7XG4gIGVudGl0aWVzOiBudW1iZXI7XG4gIHRyZWVzOiBudW1iZXI7XG4gIHBpbmtUcmVlczogbnVtYmVyO1xuICBwaW5rT3ZlcmZsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcGFyYW1zOiBXb3JsZFBhcmFtcztcbiAgY2h1bmtzOiBNYXA8c3RyaW5nLCBWb3hlbENodW5rPjtcbiAgZW50aXRpZXM6IE1hcDxzdHJpbmcsIEVudGl0eT47XG4gIGVudGl0eUNodW5rczogTWFwPHN0cmluZywgc3RyaW5nW10+O1xuICAvKiogQ2h1bmtzIHdob3NlIGRldGVybWluaXN0aWMgbmF0dXJhbC1lbnRpdHkgc3RhdGUgaGFzIGJlZW4gY2hhbmdlZC4gKi9cbiAgZW50aXR5Q2hhbmdlczogU2V0PHN0cmluZz47XG4gIC8qKiBUb21ic3RvbmVzIGZvciByZW1vdmVkIGRldGVybWluaXN0aWMgbmF0dXJhbCBlbnRpdGllcy4gKi9cbiAgZW50aXR5UmVtb3ZhbHM6IFNldDxzdHJpbmc+O1xuICAvKiogQXV0aG9yaXRhdGl2ZSBidWlsdCBzdHJ1Y3R1cmVzIChob3VzZSwgcGF0aCwgdGVycmFjZXMsIGNyb3BzKS4gKi9cbiAgc3RydWN0dXJlczogTWFwPHN0cmluZywgU3RydWN0dXJlPjtcbiAgc2l0ZXM6IE5veGVsU2l0ZVtdO1xuICByZWdpb25zOiBSZWdpb25JbmZvW107XG4gIC8qKiBjaHVuayBrZXkgLT4gbG9jYWwgdm94ZWwgaW5kZXggLT4gbWF0ZXJpYWwuIER1cmFibGUsIGNvbXBhY3QgZWRpdHMuICovXG4gIGVkaXRzOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCBudW1iZXI+PjtcbiAgLyoqIEdsb2JhbCBsb2NhbC1wbGF5ZXIgY2FycmllZCBiYWc7IGJvdW5kZWQgaW4gc2NoZW1hIDMsIGxlZ2FjeSBpbiAxLzIuICovXG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgLyoqIFByZXNlbnQgb25seSBhZnRlciBzY2hlbWEtMyBnZW5lc2lzL3Jlc3RvcmF0aW9uLiAqL1xuICBsaWZlPzogTGlmZVN0YXRlO1xuICAvKiogTTAwNiBsaXZpbmcgaG9tZXN0ZWFkOyBwcmVzZW50IG9uY2UgZm91bmRlZCAoc2NoZW1hIDMgb25seSkuICovXG4gIGhvbWVzdGVhZD86IEhvbWVzdGVhZFN0YXRlO1xuICBkaXJ0eTogU2V0PHN0cmluZz47XG4gIHN0YXRzOiBXb3JsZFN0YXRzO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqXG4gICAqIE1vbm90b25pYyByZXZpc2lvbiBvZiBhdXRob3JpdGF0aXZlIHN0YXRlICh2b3hlbHMgYW5kIGVudGl0aWVzKS4gRGVyaXZlZFxuICAgKiBjYWNoZXMga2V5ZWQgb24gdGhpcyB2YWx1ZSBhcmUgZGlzY2FyZGVkIGFmdGVyIGFuIGVkaXQ7IG1lc2gvbmF2aWdhdGlvblxuICAgKiByZXZpc2lvbnMgYXJlIHNlcGFyYXRlIGJlY2F1c2UgdGhleSBhcmUgZGVyaXZlZCwgbm90IHdvcmxkIHN0YXRlLlxuICAgKi9cbiAgcmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGNodW5rS2V5ID0gKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpID0+IGAke2N4fSwke2N6fWA7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5YID0gKGN4OiBudW1iZXIpID0+IGN4ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5aID0gKGN6OiBudW1iZXIpID0+IGN6ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgbG9jYWxJbmRleCA9IChseDogbnVtYmVyLCB5SW5kZXg6IG51bWJlciwgbHo6IG51bWJlcikgPT5cbiAgbHggKyBseiAqIENIVU5LX1NJWkUgKyB5SW5kZXggKiBDSFVOS19BUkVBO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ggPSAoeDogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtaID0gKHo6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWCA9ICh4OiBudW1iZXIpID0+IHggLSAod29ybGRUb0NodW5rWCh4KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxaID0gKHo6IG51bWJlcikgPT4geiAtICh3b3JsZFRvQ2h1bmtaKHopICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHlUb0luZGV4ID0gKHk6IG51bWJlcikgPT4geSAtIFlfTUlOO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGQoc2VlZCA9IDEzMzcsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgaWYgKCFpc1N1cHBvcnRlZEdlbmVyYXRvcihnZW5lcmF0b3JWZXJzaW9uKSkgdGhyb3cgbmV3IEVycm9yKGB1bnN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbiAke2dlbmVyYXRvclZlcnNpb259YCk7XG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwYXJhbXM6IHsgLi4uREVGQVVMVF9QQVJBTVMsIGdlbmVyYXRvclZlcnNpb24gfSxcbiAgICBjaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdGllczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNoYW5nZXM6IG5ldyBTZXQoKSxcbiAgICBlbnRpdHlSZW1vdmFsczogbmV3IFNldCgpLFxuICAgIHN0cnVjdHVyZXM6IG5ldyBNYXAoKSxcbiAgICBzaXRlczogW10sXG4gICAgcmVnaW9uczogUkVHSU9OUyxcbiAgICBlZGl0czogbmV3IE1hcCgpLFxuICAgIGludmVudG9yeToge30sXG4gICAgZGlydHk6IG5ldyBTZXQoKSxcbiAgICBzdGF0czoge1xuICAgICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICAgIGVudGl0aWVzOiAwLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gICAgfSxcbiAgICBhdXRob3JlZFBsYWNlZDogZmFsc2UsXG4gICAgcmV2aXNpb246IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBpbml0aWFsUmFkaXVzID0gMCwgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQsIGdlbmVyYXRvclZlcnNpb24pO1xuICBjb25zdCBjZW50cmUgPSBNYXRoLmZsb29yKENIVU5LU19QRVJfU0lERSAvIDIpO1xuICBmb3IgKGxldCBjeiA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN6IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN4IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN4KyspIHtcbiAgICAgIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgfVxuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLy8gLS0tLS0tLS0tLSBnZW9ncmFwaHkgLS0tLS0tLS0tLVxuZXhwb3J0IGNvbnN0IFJFR0lPTlM6IFJlZ2lvbkluZm9bXSA9IFtcbiAgeyBpZDogJ2ZvdW5kZXInLCBsYWJlbDogJ0ZvdW5kZXIgdmFsbGV5JywgdHlwZTogJ3BsYWluJywgY3g6IDAsIGN6OiAwLCByeDogMTEwLCByejogODUgfSxcbiAgeyBpZDogJ2Vhc3R3b29kJywgbGFiZWw6ICdFYXN0d29vZCcsIHR5cGU6ICdmb3Jlc3QnLCBjeDogMjIwLCBjejogLTExMCwgcng6IDI2MCwgcno6IDIyMCB9LFxuICB7IGlkOiAnY3Jvd24nLCBsYWJlbDogJ0Nyb3duIGhpZ2hsYW5kcycsIHR5cGU6ICdoaWdobGFuZCcsIGN4OiAtMzYwLCBjejogLTMwMCwgcng6IDM4MCwgcno6IDMwMCB9LFxuICB7IGlkOiAnbGFrZScsIGxhYmVsOiAnTWlycm9yIGxha2UnLCB0eXBlOiAnd2F0ZXInLCBjeDogLTI2MCwgY3o6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9LFxuICB7IGlkOiAnc291dGhkb3ducycsIGxhYmVsOiAnU291dGggZG93bnMnLCB0eXBlOiAnaGlsbHMnLCBjeDogMTIwLCBjejogMzMwLCByeDogMjYwLCByejogMTkwIH0sXG4gIHsgaWQ6ICd3ZXN0cmlzZScsIGxhYmVsOiAnV2VzdCByaXNlJywgdHlwZTogJ2hpbGxzJywgY3g6IC0zNjAsIGN6OiAxMjAsIHJ4OiAyMjAsIHJ6OiAyMTAgfSxcbiAgeyBpZDogJ2NvYXN0JywgbGFiZWw6ICdCcm9rZW4gY29hc3QnLCB0eXBlOiAncmlkZ2UnLCBjeDogMCwgY3o6IDAsIHJ4OiA3ODAsIHJ6OiA2NjAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckNlbnRlclgoejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVGhlIHJpdmVyIHJ1bnMgbm9ydGhcdTIwMTNzb3V0aCBhYm91dCA3MFx1MjAxMzExMCBtIHdlc3Qgb2YgdGhlIGZvdW5kZXIgc2hlbGYsIHNvXG4gIC8vIHRoZSBkZWZhdWx0IG5vcnRoLXdlc3QgdmlldyBoYXMgd2F0ZXIsIGEgbmVhciBiYW5rIGFuZCBhIGZhciBiYW5rLlxuICByZXR1cm4gLTkwICsgNTUgKiBNYXRoLnNpbigoeiArIDEwMCkgLyAyNDApICsgMTggKiBNYXRoLnNpbigoeiAtIDIwKSAvIDgwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5hYnMoeCAtIHJpdmVyQ2VudGVyWCh6KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWtlRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5zcXJ0KCgoeCArIDI2MCkgLyAxMjApICoqIDIgKyAoKHogKyAyMzApIC8gOTUpICoqIDIpO1xufVxuXG4vKipcbiAqIEludGVnZXIgdG9wIHNvbGlkIHkgb2YgdGhlIGJhc2UgZ2VuZXJhdGVkIHN1cmZhY2UgKG5vIGVkaXRzL292ZXJoYW5ncykuXG4gKlxuICogVGhpcyBpcyB0aGUgKnNoYXBlKiB0aGUgdm94ZWwgdm9sdW1lIGlzIGZpbGxlZCBmcm9tLCBub3QgdGhlIHN0b3JlZCB3b3JsZC5cbiAqIFRoZSBpbXBvcnRhbnQgY29ycmVjdGlvbiBvdmVyIHRoZSBmaXJzdCBNMDAxIHBhc3MgaXMgdGhhdCB0aGUgbGFuZHNjYXBlIGlzXG4gKiBub3Qgb25lIHNtb290aCByYWRpYWwgYm93bDogaXQgaXMgYSB3YXJwZWQgbXVsdGktc2NhbGUgc3VyZmFjZSB3aXRoIGEgYnJvYWRcbiAqIHJpdmVyIHZhbGxleSwgYSBzbWFsbCBidWlsZGFibGUgc2hlbGYsIGFuZCByaWRnZWQgaGlnaGxhbmRzLiBBIHNoYWxsb3dcbiAqIHNtb290aCBzdXJmYWNlIHF1YW50aXNlZCB0byAxIG0gdm94ZWxzIGlzIHdoYXQgcHJvZHVjZWQgdGhlIGNvbmNlbnRyaWNcbiAqIGNvbnRvdXIgcmluZ3M7IHZhcmllZCByZWxpZWYgYW5kIGEgcml2ZXIgdmFsbGV5IGJyZWFrIHRoZW0gbmF0dXJhbGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUd28tc2NhbGUgZG9tYWluIHdhcnAuIFRoZSBicm9hZCB3YXJwIG1vdmVzIGNvYXN0bGluZXMgYW5kIGhpbGxzOyB0aGVcbiAgLy8gc21hbGwgd2FycCBrZWVwcyB0aGUgMSBtIHF1YW50aXNhdGlvbiBmcm9tIGZvbGxvd2luZyBjbGVhbiBjb250b3Vycy5cbiAgY29uc3Qgd3ggPSB4XG4gICAgKyAoZmJtMih4IC8gNDIwLCB6IC8gNDIwLCBzZWVkICsgMTAxLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSwgeiAvIDk1LCBzZWVkICsgMTAyLCAyKSAtIDAuNSkgKiAzMDtcbiAgY29uc3Qgd3ogPSB6XG4gICAgKyAoZmJtMih4IC8gNDIwICsgNy4zLCB6IC8gNDIwIC0gMy4xLCBzZWVkICsgMTAzLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSArIDMuNywgeiAvIDk1IC0gOC4xLCBzZWVkICsgMTA0LCAyKSAtIDAuNSkgKiAzMDtcblxuICBjb25zdCByYWRpYWwgPSBNYXRoLnNxcnQoKHd4IC8gNzgwKSAqKiAyICsgKHd6IC8gNjYwKSAqKiAyKTtcbiAgY29uc3QgY29hc3ROb2lzZSA9IChmYm0yKHd4IC8gMzAwLCB3eiAvIDMwMCwgc2VlZCArIDEwNSwgNCkgLSAwLjUpICogMC4zNFxuICAgICsgKGZibTIod3ggLyA5NSwgd3ogLyA5NSwgc2VlZCArIDEwNiwgMikgLSAwLjUpICogMC4xMDtcbiAgY29uc3QgbGFuZG5lc3MgPSAxLjAgLSByYWRpYWwgKyBjb2FzdE5vaXNlO1xuICBjb25zdCBpbmxhbmQgPSBzbW9vdGhzdGVwKC0wLjAzLCAwLjEyLCBsYW5kbmVzcyk7XG5cbiAgY29uc3Qgb2NlYW5GbG9vciA9IC0xMyArIDYgKiBmYm0yKHd4IC8gMTcwLCB3eiAvIDE3MCwgc2VlZCArIDEwNywgMyk7XG5cbiAgLy8gUm9sbGluZyBsYW5kIGF0IHRocmVlIHNjYWxlcy4gVGhlIDQwIG0gYW5kIDE1IG0gY29tcG9uZW50cyBhcmUgcmVhbFxuICAvLyBzdXJmYWNlIGhlaWdodCwgbm90IGEgcmVuZGVyIGRlY29yYXRpb24sIHNvIHRoZSBtYWNybyBzYW1wbGVyIGFncmVlcy5cbiAgY29uc3Qgc3dlbGwgPSA0ICsgMTEgKiBmYm0yKHd4IC8gMzQwLCB3eiAvIDM0MCwgc2VlZCArIDEwOCwgNCk7XG4gIGNvbnN0IGhpbGxzID0gOCAqIGZibTIod3ggLyAxMTUsIHd6IC8gMTE1LCBzZWVkICsgMTA5LCAzKTtcbiAgY29uc3QgYnVtcHMgPSAyLjIgKiBmYm0yKHggLyA0MiwgeiAvIDQyLCBzZWVkICsgMTEwLCAyKVxuICAgICsgMC45ICogZmJtMih4IC8gMTUsIHogLyAxNSwgc2VlZCArIDExMSwgMik7XG5cbiAgLy8gUmlkZ2VkIGhpZ2hsYW5kcy4gVGhlIG1hc3NpZiBtYXNrIGlzIHJlZ2lvbmFsIGFuZCBiaWFzZWQgdG8gdGhlXG4gIC8vIG5vcnRoLXdlc3Q7IHdpdGhvdXQgdGhlIHJlZ2lvbmFsIGdhdGUgdGhlIGZpcnN0IE0wMDEgcGFzcyByYWlzZWQgYSA0OCBtXG4gIC8vIG1vdW50YWluIGRpcmVjdGx5IHVuZGVyIHRoZSBmb3VuZGVyIHNoZWxmLlxuICBjb25zdCBtYXNzaWZOb2lzZSA9IGZibTIod3ggLyA0ODAgKyAxMSwgd3ogLyA0ODAgLSA3LCBzZWVkICsgMTEyLCA0KTtcbiAgY29uc3QgbWFzc2lmTWFzayA9IHNtb290aHN0ZXAoMC42MCwgMC43OCwgbWFzc2lmTm9pc2UpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIzMCwgd3ogLyAyMzAsIHNlZWQgKyAxMTMsIDQpIC0gMSk7XG4gIGNvbnN0IHJpZGdlMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE0LCAzKSAtIDEpO1xuICBjb25zdCBud0JpYXMgPSBNYXRoLmV4cCgtKCgod3ggKyAzNjApIC8gMzgwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAzMjApICoqIDIpKTtcbiAgY29uc3QgbW91bnQgPSBNYXRoLm1pbigxLCBtYXNzaWZNYXNrICogKDAuMzAgKyAwLjcwICogbndCaWFzKSArIDAuMjIgKiBud0JpYXMpO1xuXG4gIGxldCBoID0gc3dlbGwgKyBoaWxscyArIGJ1bXBzXG4gICAgKyBtb3VudCAqICgyMCArIDQwICogcmlkZ2UgKiByaWRnZSArIDEyICogcmlkZ2UyKTtcblxuICAvLyBTcHVycyBhbmQgZ3VsbGllcyBhdCAzMFx1MjAxMzkwIG0uIFdpdGhvdXQgdGhlc2UsIGEgc21vb3RoIGhpbGwgcXVhbnRpc2VkIHRvXG4gIC8vIDEgbSB2b3hlbHMgcmVhZHMgYXMgY29uY2VudHJpYyBjb250b3VyIHJpbmdzOyB3aXRoIHRoZW0sIHRoZSBzYW1lIGhpbGxcbiAgLy8gYnJlYWtzIGludG8gcmlkZ2VzLCBzaWRlIHZhbGxleXMgYW5kIHJvY2sgZmFjZXMuXG4gIGNvbnN0IHNwdXIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4NSwgd3ogLyA4NSwgc2VlZCArIDEyMCwgMykgLSAxKTtcbiAgY29uc3QgZ3VsbHkgPSBNYXRoLnBvdygxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA1MiArIDEzLCB3eiAvIDUyIC0gNSwgc2VlZCArIDEyMSwgMykgLSAxKSwgMik7XG4gIGggKz0gKHNwdXIgLSAwLjU1KSAqIDUuMCAtIGd1bGx5ICogMy4yO1xuXG4gIGggPSBvY2VhbkZsb29yICsgKGggLSBvY2VhbkZsb29yKSAqIGlubGFuZDtcbiAgaCArPSAxLjYgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuXG4gIC8vIEJyb2FkIHJpdmVyIHZhbGxleSwgdGhlbiB0aGUgY2hhbm5lbCBpdHNlbGYuIFRoZSB2YWxsZXkgbWFzayBpcyBnYXRlZCBieVxuICAvLyBsYW5kbmVzczogd2l0aG91dCB0aGUgZ2F0ZSBpdCBwdWxsZWQgdGhlIG9jZWFuIGZsb29yIHVwIHRvIHRoZSB2YWxsZXlcbiAgLy8gZmxvb3Igb3V0c2lkZSB0aGUgaXNsYW5kLCB3aGljaCB0aGUgbWFwIHZpZXcgc2hvd2VkIGFzIHBhbGUgcml2ZXItc2hhcGVkXG4gIC8vIGJhcnMgcnVubmluZyB0byB0aGUgaG9yaXpvbi5cbiAgY29uc3QgcmQgPSByaXZlckRpc3RhbmNlKHd4LCB3eik7XG4gIGNvbnN0IHZhbGxleSA9IHNtb290aHN0ZXAoOTUsIDEwLCByZCkgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuICBjb25zdCB2YWxsZXlGbG9vciA9IDIuNSArIDEuMCAqIGZibTIod3ggLyA2MCwgd3ogLyA2MCwgc2VlZCArIDExNSwgMik7XG4gIGggPSBsZXJwKGgsIHZhbGxleUZsb29yLCB2YWxsZXkgKiAwLjc1KTtcbiAgY29uc3Qgcml2ZXJXID0gNS4wICsgMy4wICogZmJtMih3eCAvIDQ1LCB3eiAvIDQ1LCBzZWVkICsgMTE2LCAyKTtcbiAgLy8gQSB3aWRlLCBzaGFsbG93IGNoYW5uZWwgcHJvZmlsZS4gVGhlIGZpcnN0IHBhc3MgY2FydmVkIGEgMTIgbSBzbG90IHdpdGhcbiAgLy8gbmVhci12ZXJ0aWNhbCBiYW5rcywgd2hpY2ggcmVhZCBhcyBhIGJyaWdodCBzdG9uZSBxdWFycnkgcmF0aGVyIHRoYW4gYVxuICAvLyByaXZlci4gVGhlIG91dGVyIGVkZ2UgaXMgbm93IH4yNSBtIGZyb20gdGhlIGNlbnRyZWxpbmUsIGFuZCB0aGUgYmVkIGlzXG4gIC8vIG9ubHkgMiBtIGJlbG93IHNlYSBsZXZlbC5cbiAgY29uc3QgY2hhbm5lbCA9IHNtb290aHN0ZXAocml2ZXJXICsgMTgsIHJpdmVyVyAqIDAuNCwgcmQpO1xuICBpZiAobGFuZG5lc3MgPiAwLjApIGggPSBsZXJwKGgsIC0yLjAsIGNoYW5uZWwgKiAwLjk1KTtcblxuICAvLyBMYWtlIGJhc2luIGF0IHRoZSBmb290IG9mIHRoZSBub3J0aC13ZXN0IGhpZ2hsYW5kcy5cbiAgY29uc3QgbGFrZUQgPSBsYWtlRGlzdGFuY2Uod3gsIHd6KVxuICAgICogKDEgKyAwLjE4ICogKGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNywgMikgLSAwLjUpICogMik7XG4gIGlmIChsYWtlRCA8IDEuMTUpIHtcbiAgICBjb25zdCBsYWtlTWFzayA9IHNtb290aHN0ZXAoMS4xNSwgMC41NSwgbGFrZUQpO1xuICAgIGggPSBsZXJwKGgsIC02LjUsIGxha2VNYXNrICogMC45NSk7XG4gIH1cblxuICAvLyBGb3VuZGVyIHNoZWxmOiBhIHNtYWxsLCBpcnJlZ3VsYXIgYnVpbGRhYmxlIHRlcnJhY2Ugb24gdGhlIGVhc3QgYmFuay5cbiAgLy8gRGVsaWJlcmF0ZWx5IG5vdCBhIDI2MCBtIHJhZGlhbCBmbGF0dGVuOyB0aGUgcHJldmlvdXMgcGFzcyBzaG93ZWQgdGhhdCBhXG4gIC8vIGxhcmdlIGZsYXR0ZW4tdG8tY29uc3RhbnQgYmVjb21lcyBhIHZpc2libGUgYm93bCBvZiBjb250b3VyIHJpbmdzLlxuICBjb25zdCBzaGVsZkQgPSBNYXRoLnNxcnQoKCh4ICsgOCkgLyA2MikgKiogMiArICgoeiAtIDQpIC8gNDgpICoqIDIpXG4gICAgKyAoZmJtMih4IC8gNDUsIHogLyA0NSwgc2VlZCArIDExOCwgMikgLSAwLjUpICogMC41NTtcbiAgY29uc3Qgc2hlbGYgPSBzbW9vdGhzdGVwKDEuMDUsIDAuNTUsIHNoZWxmRCk7XG4gIGlmIChzaGVsZiA+IDApIHtcbiAgICBjb25zdCB0YXJnZXQgPSAxMy4wICsgMS4yICogZmJtMih4IC8gMzYsIHogLyAzNiwgc2VlZCArIDExOSwgMikgKyB4ICogMC4wMTtcbiAgICBoID0gbGVycChoLCB0YXJnZXQsIHNoZWxmICogMC43OCk7XG4gIH1cblxuICByZXR1cm4gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIDkyKSk7XG59XG5cbmZ1bmN0aW9uIHNsb3BlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4pOiBNYXRJZCB7XG4gIC8vIFJpdmVyIGJlZCBpcyBncmF2ZWw7IHRoZSBiZWFjaCBpcyBhIG5hcnJvdyBzYW5kIGJhbmQsIG5vdCB0aGUgd2hvbGVcbiAgLy8gdmFsbGV5IGZsb29yLiBUaGUgZmlyc3QgcGFzcyBtYXJrZWQgZXZlcnkgY2VsbCB3aXRoaW4gNCBtIG9mIHNlYSBsZXZlbFxuICAvLyBhcyBzYW5kLCB3aGljaCBwcm9kdWNlZCBhIGNvbnNwaWN1b3VzIHBhbGUgc3RyaXAgYWxvbmcgdGhlIHJpdmVyLlxuICBpZiAocml2ZXJEaXN0YW5jZSh4LCB6KSA8IDEyICYmIGggPCBTRUFfTEVWRUwgKyAxKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgaWYgKGggPD0gU0VBX0xFVkVMICsgMC41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChuZWFyV2F0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgIG5lYXJXYXRlciA9XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMykgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDMpIDwgU0VBX0xFVkVMICsgMTtcbiAgfVxuICBpZiAobmVhcldhdGVyICYmIGggPD0gU0VBX0xFVkVMICsgMS41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChzbG9wZSA+PSAzKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDU4ICYmIGZibTIoeCAvIDE4LCB6IC8gMTgsIHNlZWQgKyAxMjAsIDIpID4gMC40NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0OCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQwICYmIHNsb3BlID49IDIgJiYgZmJtMih4IC8gMTIsIHogLyAxMiwgc2VlZCArIDEyMSwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNUT05FO1xuICByZXR1cm4gTUFULkdSQVNTO1xuXG59XG5cbi8qKiBQdWJsaWMgYmFzZS1tYXRlcmlhbCBzZWxlY3RvciBmb3IgbWFjcm8gTE9EIGFuZCB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWwoXG4gIHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyOiBib29sZWFuLFxuKTogTWF0SWQge1xuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZnVuY3Rpb24gc3Vic29pbEZvcih0b3A6IE1hdElkKTogTWF0SWQge1xuICBpZiAodG9wID09PSBNQVQuR1JBU1MgfHwgdG9wID09PSBNQVQuTU9TUykgcmV0dXJuIE1BVC5TT0lMO1xuICBpZiAodG9wID09PSBNQVQuU05PVykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIHJldHVybiBNQVQuU1RPTkU7XG59XG5cbmZ1bmN0aW9uIG9yZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBjbHVzdGVyID0gZmJtMih4IC8gNTUsIHogLyA1NSwgc2VlZCArIDEzMCwgMik7XG4gIGlmIChjbHVzdGVyIDwgMC41NykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBuID0gdmFsdWVOb2lzZTMoeCAqIDAuMDksIHkgKiAwLjEzLCB6ICogMC4wOSwgc2VlZCArIDEzMSk7XG4gIGNvbnN0IG4yID0gdmFsdWVOb2lzZTMoeCAqIDAuMjIgKyA1LCB5ICogMC4zMSwgeiAqIDAuMjIgLSAzLCBzZWVkICsgMTMyKTtcbiAgcmV0dXJuIG4gPiAwLjcwICYmIG4yID4gMC41MDtcbn1cblxuZnVuY3Rpb24gY2F2ZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gZmJtMyh4ICogMC4wNzUsIHkgKiAwLjExLCB6ICogMC4wNzUsIHNlZWQgKyAxNDAsIDIpID4gMC43Mjtcbn1cblxuZnVuY3Rpb24gb3ZlcmhhbmdBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHZhbHVlTm9pc2UzKHggKiAwLjE4LCB5ICogMC4yMiwgeiAqIDAuMTgsIHNlZWQgKyAxNDEpID4gMC42Mjtcbn1cblxuLy8gLS0tLS0tLS0tLSB2ZXJzaW9uZWQgZ2VuZXJhdG9yIGRpc3BhdGNoIC0tLS0tLS0tLS1cbmNvbnN0IHYyQ2FjaGUgPSBuZXcgTWFwPG51bWJlciwgVGVycmFpblYyPigpO1xuY29uc3QgaHlkcm9DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBIeWRyb2xvZ3k+KCk7XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9neSBuZXR3b3JrIGZvciBhIHNlZWQgYW5kIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGh5ZHJvbG9neUZvcihzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlcik6IEh5ZHJvbG9neSB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5oeWRyb2xvZ3k7XG4gIGNvbnN0IGtleSA9IGAke3NlZWR9OiR7dmVyc2lvbn1gO1xuICBsZXQgaHlkcm8gPSBoeWRyb0NhY2hlLmdldChrZXkpO1xuICBpZiAoIWh5ZHJvKSB7XG4gICAgaHlkcm8gPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgaHlkcm9DYWNoZS5zZXQoa2V5LCBoeWRybyk7XG4gIH1cbiAgcmV0dXJuIGh5ZHJvO1xufVxuXG4vKiogQGludGVybmFsIFRoZSB2MiBnZW5lcmF0b3IgZm9yIGEgc2VlZCAoY2FjaGVkOyBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZXJyYWluVjIoc2VlZDogbnVtYmVyKTogVGVycmFpblYyIHtcbiAgbGV0IGdlbiA9IHYyQ2FjaGUuZ2V0KHNlZWQpO1xuICBpZiAoIWdlbikge1xuICAgIGNvbnN0IGh5ZHJvbG9neSA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uOiBHRU5FUkFUT1JfVjIsIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGdlbiA9IG5ldyBUZXJyYWluVjIoc2VlZCwgc3VyZmFjZUhlaWdodEF0LCBoeWRyb2xvZ3kpO1xuICAgIHYyQ2FjaGUuc2V0KHNlZWQsIGdlbik7XG4gIH1cbiAgcmV0dXJuIGdlbjtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIGhlaWdodCAodG9wIHNvbGlkICsgMSkgZm9yIGFueSBzdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKS5oZWlnaHQoeCwgeikgOiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCB3YXRlciBzdXJmYWNlOiB3YXRlciBmaWxscyBjZWxscyBbaGVpZ2h0LCBsZXZlbCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVdhdGVyTGV2ZWxBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuY29sdW1uKHgsIHopLmxldmVsO1xuICBjb25zdCBoID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCA6IGg7XG59XG5cbmZ1bmN0aW9uIHZlcnNpb25lZFNsb3BlKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuLyoqIEJhc2UgdG9wIG1hdGVyaWFsIGZvciBhbnkgZ2VuZXJhdG9yIHZlcnNpb24gKG1hY3JvIExPRCwgZW50aXR5IHBsYWNlbWVudCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsRm9yKFxuICBzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgZ2VuID0gdGVycmFpblYyKHNlZWQpO1xuICAgIHJldHVybiBnZW4udG9wTWF0ZXJpYWwoeCwgeiwgZ2VuLmNvbHVtbih4LCB6KSwgc2xvcGUsXG4gICAgICAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGhoLCBzcywgbmVhcldhdGVyKSk7XG4gIH1cbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHk6IG51bWJlcjtcbiAgdG9wOiBNYXRJZDtcbiAgc2xvcGU6IG51bWJlcjtcbn1cblxuLyoqIEJhc2Ugc3VyZmFjZSBzYW1wbGUgZm9yIG1hY3JvIExPRC4gRG9lcyBub3QgaW5jbHVkZSB2b3hlbCBlZGl0cy9vdmVyaGFuZ3MuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtcGxlU3VyZmFjZShzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogU3VyZmFjZVNhbXBsZSB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIGNvbnN0IHNsb3BlID0gc2xvcGVBdChzZWVkLCB4LCB6LCB5KTtcbiAgcmV0dXJuIHsgeSwgdG9wOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIHksIHNsb3BlKSwgc2xvcGUgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjaHVuayBnZW5lcmF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIHJldHVybiBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBiYXNlID0gZ2VuZXJhdGVCYXNlQ2h1bmsod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGN4LCBjeik7XG4gIHJldHVybiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkLCBiYXNlLCBwZXJmb3JtYW5jZS5ub3coKSAtIHQwKTtcbn1cblxuLyoqXG4gKiBCYXNlIGdlbmVyYXRlZCBjb250ZW50cyBvZiBhIGNodW5rIGJlZm9yZSBkdXJhYmxlIGVkaXRzLiBBIHB1cmUgZnVuY3Rpb24gb2ZcbiAqIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbiwgY3gsIGN6KTogc2FmZSB0byBjb21wdXRlIGluIGEgV2ViIFdvcmtlciwgYW5kIHRoZVxuICogYnl0ZXMgYXJlIGlkZW50aWNhbCB3aGVyZXZlciBpdCBydW5zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHNlZWQ6IG51bWJlcjtcbiAgdmVyc2lvbjogbnVtYmVyO1xuICBkYXRhOiBVaW50OEFycmF5O1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVCYXNlQ2h1bmsoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ2h1bmsge1xuICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfVk9MVU1FKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCB0b3BNYXRlcmlhbHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IHYyID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkgOiBudWxsO1xuXG4gIC8vIFBhZGRlZCBoZWlnaHQgY2FjaGU6IGEgdGhyZWUtY2VsbCBib3JkZXIgY292ZXJzIHNsb3BlLCBiZWFjaCBhbmQgbGVkZ2VzLlxuICBjb25zdCBQID0gMztcbiAgY29uc3QgUFcgPSBDSFVOS19TSVpFICsgUCAqIDI7XG4gIGNvbnN0IGJhc2VIID0gbmV3IEludDE2QXJyYXkoUFcgKiBQVyk7XG4gIGNvbnN0IHYyQ29sczogVjJDb2x1bW5bXSB8IG51bGwgPSB2MiA/IG5ldyBBcnJheShDSFVOS19BUkVBKSA6IG51bGw7XG4gIGZvciAobGV0IHB6ID0gMDsgcHogPCBQVzsgcHorKykge1xuICAgIGZvciAobGV0IHB4ID0gMDsgcHggPCBQVzsgcHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIHB4IC0gUCwgd3ogPSBveiArIHB6IC0gUDtcbiAgICAgIGlmICh2Mikge1xuICAgICAgICBjb25zdCBjb2wgPSB2Mi5jb2x1bW4od3gsIHd6KTtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IGNvbC5oO1xuICAgICAgICBjb25zdCBseCA9IHB4IC0gUCwgbHogPSBweiAtIFA7XG4gICAgICAgIGlmIChseCA+PSAwICYmIGx6ID49IDAgJiYgbHggPCBDSFVOS19TSVpFICYmIGx6IDwgQ0hVTktfU0laRSkgdjJDb2xzIVtseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjb2w7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHd4LCB3eik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbGV0IG5vbkFpciA9IDA7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5lYXJXYXRlciA9XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCAtIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgKyAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMTtcbiAgICAgIGNvbnN0IHYyQ29sID0gdjJDb2xzID8gdjJDb2xzW2x6ICogQ0hVTktfU0laRSArIGx4XSA6IG51bGw7XG4gICAgICBjb25zdCB0b3AgPSB2MiAmJiB2MkNvbFxuICAgICAgICA/IHYyLnRvcE1hdGVyaWFsKHd4LCB3eiwgdjJDb2wsIHNsb3BlLCAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaGgsIHNzLCBuZWFyV2F0ZXIpKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICAgIGNvbnN0IHN1YiA9IHN1YnNvaWxGb3IodG9wKTtcbiAgICAgIGNvbnN0IG9yZVBvdGVudGlhbCA9IGZibTIod3ggLyA1NSwgd3ogLyA1NSwgc2VlZCArIDEzMCwgMikgPiAwLjU3O1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG5cbiAgICAgIGNvbnN0IHN0YXJ0ID0gWV9NSU47XG4gICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihZX01BWCAtIDEsIGggLSAxKTtcbiAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8PSBlbmQ7IHkrKykge1xuICAgICAgICBjb25zdCBkZXB0aCA9IGggLSAxIC0geTtcbiAgICAgICAgbGV0IG06IE1hdElkO1xuICAgICAgICBpZiAoeSA9PT0gWV9NSU4pIG0gPSBNQVQuQkVEUk9DSztcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPT09IDApIG0gPSB0b3A7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIG0gPSBzdWI7XG4gICAgICAgIGVsc2UgbSA9IE1BVC5TVE9ORTtcblxuICAgICAgICBpZiAobSA9PT0gTUFULlNUT05FICYmIGRlcHRoID4gNCAmJiBvcmVQb3RlbnRpYWwgJiYgb3JlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuT1JFO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BhcnNlIDNEIG92ZXJoYW5ncy91bmRlcmN1dHMgYXQgc3RlZXAgZmFjZXMuIFRoaXMgaXMgYSByZWFsXG4gICAgICAgIC8vIG9jY3VwYW5jeSBjaGFuZ2UsIG5vdCBhIGRlY29yYXRpb24gb24gdG9wIG9mIGEgaGVpZ2h0ZmllbGQuXG4gICAgICAgIGlmIChkZXB0aCA8PSAyICYmIHNsb3BlID49IDIgJiYgb3ZlcmhhbmdBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVlcCBjYXZlcywga2VwdCBhd2F5IGZyb20gdGhlIHN1cmZhY2Ugc28gdGhleSBkbyBub3QgY3JlYXRlIGhvbGVzLlxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUiAmJiBkZXB0aCA+IDcgJiYgZGVwdGggPCAyNCAmJiBjYXZlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID0gbTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXYXRlciB2b2x1bWU6IGV2ZXJ5dGhpbmcgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UgdXAgdG8gdGhlIGNvbHVtbidzXG4gICAgICAvLyB3YXRlciBsZXZlbCAoc2VhIGxldmVsIGluIHYxOyB0aGUgaHlkcm9sb2dpY2FsIGxldmVsIGluIHYyKS5cbiAgICAgIGNvbnN0IHdhdGVyTGV2ZWwgPSB2MkNvbCA/IE1hdGgubWluKFlfTUFYLCB2MkNvbC5sZXZlbCkgOiBTRUFfTEVWRUw7XG4gICAgICBpZiAoaCA8IHdhdGVyTGV2ZWwpIHtcbiAgICAgICAgZm9yIChsZXQgeSA9IE1hdGgubWF4KFlfTUlOLCBoKTsgeSA8IHdhdGVyTGV2ZWw7IHkrKykge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseik7XG4gICAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgICAgZGF0YVtpZHhdID0gTUFULldBVEVSO1xuICAgICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvcFNvbGlkID0gTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLm1heChZX01JTiwgaCAtIDEpKTtcbiAgICAgIGhlaWdodHNbY29sXSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2NvbF0gPSB0b3A7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvdHJ1ZGluZyBsZWRnZXM6IG9uZSBvciB0d28gc3RvbmUgYmxvY2tzIGV4dGVuZCBmcm9tIGEgaGlnaCBjb2x1bW4gb3ZlclxuICAvLyBhIGxvd2VyIG5laWdoYm91ci4gVGhleSBjcmVhdGUgcmVhZGFibGUgb3ZlcmhhbmdzIHdpdGhvdXQgYSBmdWxsIGNhdmUgcGFzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGlmIChzbG9wZSA8IDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGlyczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IG54ID0gbHggKyBkeCwgbnogPSBseiArIGR6O1xuICAgICAgICBpZiAobnggPCAwIHx8IG56IDwgMCB8fCBueCA+PSBDSFVOS19TSVpFIHx8IG56ID49IENIVU5LX1NJWkUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBuaCA9IGJhc2VIWyhueiArIFApICogUFcgKyAobnggKyBQKV07XG4gICAgICAgIGlmIChoIC0gbmggPCAyKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhhc2gzaShseCwgbHosIGR4ICogMyArIGR6ICogNywgc2VlZCArIDE1MCkgPCAwLjU1KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgeSA9IGggLSAyO1xuICAgICAgICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gaCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobngsIHlUb0luZGV4KHkpLCBueik7XG4gICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuU1RPTkU7XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWNvbXB1dGUgdGhlIGNvbHVtbiBjYWNoZSBhZnRlciBsZWRnZXMvY2F2ZXMuIFRoZSBleHBvc2VkIHRvcCBtYXRlcmlhbFxuICAvLyBtdXN0IGNvbWUgZnJvbSB0aGUgYWN0dWFsIHRvcCBzb2xpZCB2b3hlbCwgbm90IHRoZSBwcmUtY2FydmUgZ3Vlc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgbGV0IHRvcE1hdDogbnVtYmVyID0gdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICBjb25zdCBtID0gZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgfVxuICAgICAgaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0b3BNYXQ7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgY3gsIGN6LCBzZWVkLCB2ZXJzaW9uLCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9O1xufVxuXG4vKipcbiAqIEluc3RhbGwgYmFzZSBjb250ZW50cyBhcyBhIHJlc2lkZW50IGNodW5rOiBhcHBseSBkdXJhYmxlIGVkaXRzLCB1cGRhdGVcbiAqIHN0YXRzLCBhbmQgcnVuIGRldGVybWluaXN0aWMgZW50aXR5IGdlbmVyYXRpb24uIE1haW4tdGhyZWFkIG9ubHk7IHRoaXMgaXNcbiAqIHRoZSBzaW5nbGUgd3JpdGVyIG9mIFdvcmxkLiBSZXR1cm5zIHRoZSBhbHJlYWR5LXJlc2lkZW50IGNodW5rIGlmIG9uZSBleGlzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkOiBXb3JsZCwgYmFzZTogQmFzZUNodW5rLCBnZW5lcmF0aW9uTXMgPSAwKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoYmFzZS5zZWVkICE9PSB3b3JsZC5zZWVkIHx8IGJhc2UudmVyc2lvbiAhPT0gd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2Jhc2UgY2h1bmsgYmVsb25ncyB0byBhIGRpZmZlcmVudCB3b3JsZCBjb25maWd1cmF0aW9uJyk7XG4gIH1cbiAgY29uc3QgeyBjeCwgY3osIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyIH0gPSBiYXNlO1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCBjaHVuazogVm94ZWxDaHVuayA9IHtcbiAgICBjeCwgY3osIGtleSwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIsXG4gICAgZGlydHk6IHRydWUsXG4gICAgZ2VuZXJhdGVkQXQ6IHBlcmZvcm1hbmNlLm5vdygpLFxuICB9O1xuXG4gIC8vIEFwcGx5IGR1cmFibGUgZWRpdHMgYWZ0ZXIgYmFzZSBnZW5lcmF0aW9uLlxuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICBpZiAoZWRpdHMpIHtcbiAgICBmb3IgKGNvbnN0IFtpZHgsIG1dIG9mIGVkaXRzKSB7XG4gICAgICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICAgIH1cbiAgICAvLyBSZWNvbXB1dGUgdGhlIGNhY2hlIGZvciBlZGl0ZWQgY2h1bmtzLlxuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIGx4LCBseik7XG4gICAgfVxuICB9XG4gIC8vIE5vbi1haXIgY291bnRzIGFyZSBkZXJpdmVkIHJlbmRlcmVyIHN0YXRpc3RpY3MsIG5vdCBkdXJhYmxlIHdvcmxkIHN0YXRlLlxuICAvLyBFZGl0ZWQgYmFzZSBhaXIgbWF5IGJlY29tZSBzb2xpZCAoYW5kIHZpY2UgdmVyc2EpIGR1cmluZyByZXN0b3JhdGlvbi5cbiAgbGV0IGVkaXRlZE5vbkFpciA9IDA7XG4gIGZvciAoY29uc3QgbWF0ZXJpYWwgb2YgY2h1bmsuZGF0YSkgaWYgKG1hdGVyaWFsICE9PSBNQVQuQUlSKSBlZGl0ZWROb25BaXIrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IGVkaXRlZE5vbkFpciAtIG5vbkFpcjtcblxuICB3b3JsZC5jaHVua3Muc2V0KGtleSwgY2h1bmspO1xuICB3b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IG5vbkFpcjtcbiAgd29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zICs9IGdlbmVyYXRpb25NcztcbiAgd29ybGQuZGlydHkuYWRkKGtleSk7XG5cbiAgZ2VuZXJhdGVFbnRpdGllcyh3b3JsZCwgY2h1bmspO1xuICByZXR1cm4gY2h1bms7XG59XG5cbi8qKiBBIGJhc2UtdGVycmFpbiBjYWNoZSBzaGFyZWQgYnkgZWRpdGVkIGFuZCB1bmVkaXRlZCByZWdlbmVyYXRpb24uIE5hdHVyYWxcbiAqIHNjZW5lcnkgbmV2ZXIgZGVwZW5kcyBvbiBsYXRlciB2b3hlbCBlZGl0czsgdGhpcyBhbHNvIGxldHMgYSBzbmFwc2hvdCByZXN0b3JlXG4gKiBhIGhhcnZlc3RlZCBjaHVuayB3aXRob3V0IG1hdGVyaWFsaXppbmcgdW5yZWxhdGVkIG5laWdoYm91cmluZyBjaHVua3MuICovXG5jb25zdCBiYXNlQ29sdW1uQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFwPHN0cmluZywgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfT4+KCk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUNvbHVtbnMgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7IH1cblxuLyoqIEJhc2UgKHByZS1jYXJ2ZSwgcHJlLWVkaXQpIGNvbHVtbiBoZWlnaHRzL21hdGVyaWFscyB1c2VkIGZvciBlbnRpdHkgcGxhY2VtZW50LiBQdXJlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVCYXNlQ29sdW1ucyhzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IEJhc2VDb2x1bW5zIHtcbiAgY29uc3QgY29sdW1ucyA9IHsgaGVpZ2h0czogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSksIHRvcE1hdGVyaWFsczogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSkgfTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseCwgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeik7XG4gICAgICBjb25zdCBzbG9wZSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gdmVyc2lvbmVkU2xvcGUoc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCkgOiBzbG9wZUF0KHNlZWQsIHgsIHosIGgpO1xuICAgICAgY29uc3QgaW5kZXggPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbHVtbnMuaGVpZ2h0c1tpbmRleF0gPSBjbGFtcChoIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgY29sdW1ucy50b3BNYXRlcmlhbHNbaW5kZXhdID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyBiYXNlVG9wTWF0ZXJpYWxGb3Ioc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCwgc2xvcGUpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vKiogUHJvdmlkZSBwcmVjb21wdXRlZCBiYXNlIGNvbHVtbnMgKGZvciBleGFtcGxlIGZyb20gYSB3b3JrZXIpIGJlZm9yZSBpbnN0YWxsaW5nIGEgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gc2VlZEJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcsIGNvbHVtbnM6IEJhc2VDb2x1bW5zKTogdm9pZCB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgaWYgKCFjYWNoZS5oYXMoa2V5KSkgY2FjaGUuc2V0KGtleSwgY29sdW1ucyk7XG59XG5cbmZ1bmN0aW9uIGJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBCYXNlQ29sdW1ucyB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgY29uc3QgY2FjaGVkID0gY2FjaGUuZ2V0KGNodW5rLmtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IGNvbHVtbnMgPSBjb21wdXRlQmFzZUNvbHVtbnMod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGNodW5rLmN4LCBjaHVuay5jeik7XG4gIGNhY2hlLnNldChjaHVuay5rZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucztcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXJpdmVkIGNoYW5nZSB0cmFja2luZyAobm90IGF1dGhvcml0YXRpdmUgc3RhdGUpIC0tLS0tLS0tLS1cbi8vIFJlbmRlcmVycyBuZWVkIHRvIGtub3cgd2hlbiB0aGUgZWRpdCBvdmVybGF5IGNoYW5nZWQgd2l0aG91dCB3YWxraW5nIGV2ZXJ5XG4vLyBlZGl0IGVhY2ggZnJhbWUuIFRoZSBjb3VudGVyIGxpdmVzIG91dHNpZGUgV29ybGQgc28gaXQgbmV2ZXIgZW50ZXJzIGFcbi8vIHNuYXBzaG90IG9yIGNhbm9uaWNhbCBoYXNoLlxuY29uc3QgZWRpdFZlcnNpb25zID0gbmV3IFdlYWtNYXA8V29ybGQsIG51bWJlcj4oKTtcblxuLyoqIE1vbm90b25pYyBjb3VudCBvZiBlZGl0LW92ZXJsYXkgY2hhbmdlcyBmb3IgdGhpcyBXb3JsZCBvYmplY3QuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdFZlcnNpb24od29ybGQ6IFdvcmxkKTogbnVtYmVyIHtcbiAgcmV0dXJuIGVkaXRWZXJzaW9ucy5nZXQod29ybGQpID8/IDA7XG59XG5cbi8qKiBDYWxsIGFmdGVyIHJlcGxhY2luZyBvciBidWxrLWNoYW5naW5nIGB3b3JsZC5lZGl0c2Agb3V0c2lkZSBzZXRWb3hlbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBlZGl0VmVyc2lvbnMuc2V0KHdvcmxkLCBlZGl0VmVyc2lvbih3b3JsZCkgKyAxKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBub24tZ2VuZXJhdGluZyBxdWVyaWVzIC0tLS0tLS0tLS1cbi8vIE1vdmluZyBwcmVzZW50YXRpb24gKGNoYXJhY3RlcnMsIGFuaW1hbHMsIGNhbWVyYSkgbXVzdCBuZXZlciB0cmlnZ2VyIGNodW5rXG4vLyBnZW5lcmF0aW9uIGFzIGEgc2lkZSBlZmZlY3Qgb2YgYXNraW5nIGFib3V0IHRlcnJhaW4uIFRoZXNlIHJldHVybiBudWxsIHdoZW5cbi8vIHRoZSBjb2x1bW4ncyBjaHVuayBpcyBub3QgcmVzaWRlbnQuXG5cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudENodW5rQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpKSA/PyBudWxsO1xufVxuXG4vKiogTGlrZSBzdXJmYWNlQXQsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB8IG51bGwge1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG4vKiogTGlrZSBnZXRWb3hlbCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFZveGVsQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQgfCBudWxsIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV2aWN0Q2h1bmsod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5jaHVua3MuZGVsZXRlKGtleSk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0V2aWN0ZWQrKztcbiAgLy8gQ2h1bmsgYnl0ZXMgYW5kIGNvbHVtbiBjYWNoZXMgYXJlIHJlZ2VuZXJhdGVkIG9uIGRlbWFuZC4gRW50aXRpZXMgcmVtYWluXG4gIC8vIGF1dGhvcml0YXRpdmU6IGV2aWN0aW9uIG11c3Qgbm90IGZvcmdldCB0aGVpciBwZXJzaXN0ZW50IHN0YXRlLlxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBxdWVyaWVzIC8gZWRpdHMgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGdldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbTogTWF0SWQpOiBib29sZWFuIHtcbiAgaWYgKHkgPCBZX01JTiB8fCB5ID49IFlfTUFYKSByZXR1cm4gZmFsc2U7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpO1xuICBjb25zdCBwcmV2aW91c0VkaXQgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk/LmdldChpZHgpO1xuICAvLyBBIGNodW5rIGV2aWN0ZWQgYWZ0ZXIgYW4gZWFybGllciBlZGl0IGNhbiByZWdlbmVyYXRlIHdpdGggdGhhdCBkdXJhYmxlXG4gIC8vIG1hdGVyaWFsIGFscmVhZHkgYXBwbGllZC4gRHJvcHBpbmcgdGhlIGVkaXQgaGVyZSB3b3VsZCBtYWtlIGl0IGRpc2FwcGVhclxuICAvLyBvbiB0aGUgbmV4dCBldmljdGlvbi9yZXN0b3JhdGlvbiwgZXZlbiB0aG91Z2ggdGhlIGN1cnJlbnQgd3JpdGUgbm8tb3BzLlxuICBpZiAocHJldmlvdXNFZGl0ID09PSBtKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBmYWxzZTtcbiAgbGV0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rLmtleSk7XG4gIGlmICghZWRpdHMpIHsgZWRpdHMgPSBuZXcgTWFwKCk7IHdvcmxkLmVkaXRzLnNldChjaHVuay5rZXksIGVkaXRzKTsgfVxuICAvLyBBbiBpZGVtcG90ZW50IHdyaXRlIG11c3Qgc3RpbGwgcmVzdG9yZSBhIGR1cmFibGUgZGVsdGEgZGlzY2FyZGVkIGJ5IGFuXG4gIC8vIG9sZGVyIHNuYXBzaG90IG9yIGRlbHRhIGRlY29kZXIuIEl0IGlzIG5vdCBhIG5ldyBhdXRob3JpdGF0aXZlIHJldmlzaW9uLlxuICBpZiAoY2h1bmsuZGF0YVtpZHhdID09PSBtKSB7XG4gICAgaWYgKCFlZGl0cy5oYXMoaWR4KSkgZWRpdHMuc2V0KGlkeCwgbSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gIGVkaXRzLnNldChpZHgsIG0pO1xuICBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkKTtcbiAgY2h1bmsuZGlydHkgPSB0cnVlO1xuICB3b3JsZC5kaXJ0eS5hZGQoY2h1bmsua2V5KTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIHdvcmxkVG9Mb2NhbFgoeCksIHdvcmxkVG9Mb2NhbFooeikpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bms6IFZveGVsQ2h1bmssIGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgIGlmIChpc1NvbGlkKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0pKSB7IHRvcFNvbGlkID0geTsgYnJlYWs7IH1cbiAgfVxuICBjaHVuay5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICBjb25zdCB0bSA9IGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gIGlmICh0b3BTb2xpZCA+PSBZX01JTikge1xuICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHRvcFNvbGlkKSwgbHopXTtcbiAgICBpZiAobSAhPT0gTUFULldBVEVSKSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gbTtcbiAgfSBlbHNlIHtcbiAgICBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG07XG4gIH1cbn1cblxuLyoqXG4gKiBUaGUgeSBjb29yZGluYXRlIG9mIHRoZSBleHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW4gYXQgeC96LlxuICogQSBzb2xpZCB2b3hlbCBhdCB5IG9jY3VwaWVzIFt5LCB5KzEpLCBzbyB0aGUgd2Fsa2FibGUgc3VyZmFjZSBpcyB0b3BTb2xpZCsxLlxuICogVGhpcyBpcyBhIGRlcml2ZWQgcXVlcnk7IHRoZSBhdXRob3JpdGF0aXZlIHN0YXRlIHJlbWFpbnMgdGhlIHZveGVsIHZvbHVtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIFlfTUlOO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIFlfTUlOO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay50b3BNYXRlcmlhbHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlaWdodEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uIDwgR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgaCA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gICAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgLSBoIDogMDtcbiAgfVxuICByZXR1cm4gd2F0ZXJTdXJmYWNlQXQod29ybGQsIHgsIHopIC0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqXG4gKiBUb3Agb2YgdGhlIHdhdGVyIGNvbHVtbiBzdGFuZGluZyBvbiB0aGUgc29saWQgc3VyZmFjZSAoZXF1YWwgdG8gdGhlIHN1cmZhY2VcbiAqIHdoZW4gZHJ5KS4gUmVhZHMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWxzLCBzbyBlZGl0cyBhbmQgZHVnIHBpdHMgYXJlIGV4YWN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgd2hpbGUgKHkgPCBZX01BWCAmJiBnZXRWb3hlbCh3b3JsZCwgeCwgeSwgeikgPT09IE1BVC5XQVRFUikgeSsrO1xuICByZXR1cm4geTtcbn1cblxuLy8gLS0tLS0tLS0tLSBlbnRpdGllcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBhZGRFbnRpdHkod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLmhhcyhlLmlkKSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgcmV0dXJuO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgZSk7XG4gIGxldCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBsaXN0KTsgfVxuICBsaXN0LnB1c2goZS5pZCk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgLy8gR2VuZXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFuZCBhZHZhbmNlcyBubyBwbGF5ZXItY29tbWFuZCBwcmVjb25kaXRpb24uXG4gIC8vIEF1dGhvcmVkIHNjYWZmb2xkaW5nIG1heSB0cmFuc2llbnRseSBjaGFuZ2UgaXQ7IHRoZSBzbmFwc2hvdCByZXN0b3JlcyB0aGVcbiAgLy8gc2F2ZWQgcmV2aXNpb24gYWZ0ZXIgcGxhY2luZyB0aGF0IHNjYWZmb2xkaW5nLlxufVxuXG4vKipcbiAqIFJlbW92ZSBhbiBlbnRpdHkgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3b3JsZC4gVXNlZCB3aGVuIGEgc2l0ZSBpcyBjbGVhcmVkOlxuICogdGhlIHJlc291cmNlIHlpZWxkIGlzIGFjY291bnRlZCBmb3IgYnkgdGhlIGNhbGxlciwgYW5kIHRoZSBlbnRpdHkgbXVzdCBzdG9wXG4gKiBleGlzdGluZyBmb3IgY29sbGlzaW9uLCBvYnN0cnVjdGlvbiBhbmQgcGVyc2lzdGVuY2UsIG5vdCBqdXN0IGJlIGhpZGRlbiBieVxuICogdGhlIHJlbmRlcmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gIGNvbnN0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAobGlzdCkge1xuICAgIGNvbnN0IGkgPSBsaXN0LmluZGV4T2YoaWQpO1xuICAgIGlmIChpID49IDApIGxpc3Quc3BsaWNlKGksIDEpO1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZW50aXR5SWQoY2h1bms6IHN0cmluZywgaTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBlOiR7Y2h1bmt9OiR7aX1gO1xufVxuXG4vKipcbiAqIFB1cmUgZm9yZXN0LWRlbnNpdHkgZmllbGQgdXNlZCBieSBlbnRpdHkgZ2VuZXJhdGlvbi4gRXhwb3J0ZWQgcmVhZC1vbmx5IGZvclxuICogcmVuZGVyIGRlY29yYXRpb24gKHJlbmRlci9ncm91bmQtY292ZXIudHMpOyBjaGFuZ2luZyBpdCBjaGFuZ2VzIHdvcmxkcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG4vKiogUHVyZSByb2NraW5lc3MgZmllbGQgdXNlZCBieSBlbnRpdHkgZ2VuZXJhdGlvbiAoc2FtZSBjb250cmFjdCBhcyBmb3Jlc3RTY29yZSkuICovXG5leHBvcnQgZnVuY3Rpb24gcm9ja1Njb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG1vdW50YWluID0gZmJtMih3eCAvIDMzMCwgd3ogLyAzMzAsIHNlZWQgKyAyMDIsIDMpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDE0MCwgd3ogLyAxNDAsIHNlZWQgKyAyMDMsIDMpIC0gMSk7XG4gIHJldHVybiBtb3VudGFpbiAqIDAuNTUgKyByaWRnZSAqIDAuNDU7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRW50aXRpZXMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHZvaWQge1xuICBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkLCBjaHVuay5jeCwgY2h1bmsuY3opO1xufVxuXG4vKiogQGludGVybmFsIFJlcGxheXMgZGV0ZXJtaW5pc3RpYyBnZW5lcmF0aW9uIGZvciBzbmFwc2hvdCBlbnRpdHkgZGVsdGFzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICh3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGtleSkpIHJldHVybjtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuO1xuXG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjaHVuay5jeCwgY2h1bmsuY3osIHdvcmxkLnNlZWQgKyA5MDApICogNDI5NDk2NzI5NikgPj4+IDApO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgY29sdW1ucyA9IGJhc2VDb2x1bW5zKHdvcmxkLCBjaHVuayk7XG4gIGxldCBuID0gMDtcbiAgbGV0IG5hdHVyYWxUcmVlcyA9IDA7XG4gIGxldCBuYXR1cmFsUGlua1RyZWVzID0gMDtcblxuICBjb25zdCBsb2NhbFN1cmZhY2UgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gKyBZX01JTjtcbiAgfTtcbiAgY29uc3QgbG9jYWxUb3AgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IE1hdElkID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIGFzIE1hdElkO1xuICB9O1xuICBjb25zdCBsb2NhbFNsb3BlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICByZXR1cm4gTWF0aC5tYXgoXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICk7XG4gIH07XG5cbiAgLy8gQSBqaXR0ZXJlZCA4IG0gbGF0dGljZSBnaXZlcyBjb2hlcmVudCBtYXNzZXMgYW5kIGF2b2lkcyBwZXItZnJhbWUgc2NhdHRlci5cbiAgZm9yIChsZXQgZ3ogPSAwOyBneiA8IENIVU5LX1NJWkU7IGd6ICs9IDgpIHtcbiAgICBmb3IgKGxldCBneCA9IDA7IGd4IDwgQ0hVTktfU0laRTsgZ3ggKz0gOCkge1xuICAgICAgY29uc3QgbHggPSBjbGFtcChNYXRoLmZsb29yKGd4ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3QgbHogPSBjbGFtcChNYXRoLmZsb29yKGd6ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAxKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHNsb3BlID0gbG9jYWxTbG9wZShseCwgbHopO1xuICAgICAgY29uc3QgdG9wID0gbG9jYWxUb3AobHgsIGx6KTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikgY29udGludWU7XG4gICAgICBjb25zdCBmb3Jlc3QgPSBmb3Jlc3RTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9ja3kgPSByb2NrU2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvbGwgPSBybmQoKTtcblxuICAgICAgY29uc3QgdHJlZUNoYW5jZSA9IGZvcmVzdCA+IDAuNTAgPyAwLjcyIDogZm9yZXN0ID4gMC4zMCA/IDAuMjUgOiAwLjA1O1xuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDIgJiYgcm9sbCA8IHRyZWVDaGFuY2UpIHtcbiAgICAgICAgLy8gVGhlIGNhcCBpcyBhIGRldGVybWluaXN0aWMgbmF0dXJhbC1nZW5lcmF0aW9uIHByb3BlcnR5LiBJdCBjYW5ub3RcbiAgICAgICAgLy8gZGVwZW5kIG9uIHdoaWNoIGNodW5rcyBhIHJlbmRlcmVyIGxvYWRlZCBiZWZvcmUgdGhpcyBvbmUuXG4gICAgICAgIGxldCBraW5kOiBFbnRpdHlLaW5kO1xuICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICBjb25zdCBzcGVjaWVzUm9sbCA9IHJuZCgpO1xuICAgICAgICBpZiAoc3BlY2llc1JvbGwgPCAwLjEyKSB7XG4gICAgICAgICAgaWYgKChuYXR1cmFsUGlua1RyZWVzICsgMSkgPiAwLjI1ICogKG5hdHVyYWxUcmVlcyArIDEpKSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rT3ZlcmZsb3crKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfYmxvc3NvbSc7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDIpO1xuICAgICAgICAgICAgbmF0dXJhbFBpbmtUcmVlcysrO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC40MCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3NwaXJlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC43NCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3RhYmxlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgIH1cbiAgICAgICAgbmF0dXJhbFRyZWVzKys7XG4gICAgICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjg4ICsgcm5kKCkgKiAwLjI0LCB2YXJpYW50LFxuICAgICAgICAgIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogMTIsIHlpZWxkUGVySGFydmVzdDogNCxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgcm9ja3kgPiAwLjQ2ICYmIHJvbGwgPCAwLjM4KSB7XG4gICAgICAgIC8vIENvbnN1bWUgdGhlIHJldGlyZWQgc3RvbmUgZm9ybSdzIHJhbmRvbSBkcmF3cyBhbmQgYWxsb2NhdGUgaXRzIG9sZFxuICAgICAgICAvLyBzZXF1ZW5jZSBJRCwgYnV0IGRvIG5vdCBpbnNlcnQgYW4gZW50aXR5LiBMYXRlciBuYXR1cmFsIHBsYWNlbWVudHNcbiAgICAgICAgLy8gdGhlcmVmb3JlIHJlbWFpbiBieXRlLWZvci1ieXRlIGNvbXBhdGlibGUgd2l0aCByZWNvcmRlZCBzYXZlcy5cbiAgICAgICAgY29uc3Qgc2l6ZVJvbGwgPSBybmQoKTtcbiAgICAgICAgY29uc3Qga2luZDogRW50aXR5S2luZCA9IHNpemVSb2xsIDwgMC41NSA/ICdzdHlsX3JvY2tfc21hbGwnXG4gICAgICAgICAgOiBzaXplUm9sbCA8IDAuOTAgPyAnc3R5bF9yb2NrX21lZGl1bScgOiAnc3R5bF9yb2NrX2xhcmdlJztcbiAgICAgICAgY29uc3QgaWQgPSBlbnRpdHlJZChjaHVuay5rZXksIG4rKyk7XG4gICAgICAgIGNvbnN0IHJlY29yZCA9IHtcbiAgICAgICAgICBpZCwga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJlc291cmNlOiAnc3RvbmUnIGFzIGNvbnN0LFxuICAgICAgICAgIHJlbWFpbmluZzoga2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyA0IDoga2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gOCA6IDEyLFxuICAgICAgICAgIHlpZWxkUGVySGFydmVzdDogMywgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gT25seSBlbnRpdGllcyB0aGF0IGV4aXN0ZWQgaW4gYW4gYWNjZXB0ZWQgb2xkIHNhdmUgZ2V0IHRvbWJzdG9uZXMsXG4gICAgICAgIC8vIGR1cmluZyBleHBsaWNpdCBtaWdyYXRpb24uIE9yZGluYXJ5IGdlbmVyYXRpb24gbXVzdCByZXN0b3JlIGV4YWN0bHkuXG4gICAgICAgIGlmIChpc1N0b25lUmVwbGF5KHdvcmxkKSkgYWRkRW50aXR5KHdvcmxkLCByZWNvcmQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSAmJiByb2NreSA+IDAuNTggJiYgcm9sbCA8IDAuMTgpIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9vcmUnLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMiksXG4gICAgICAgICAgcmVzb3VyY2U6ICdvcmUnLCByZW1haW5pbmc6IDgsIHlpZWxkUGVySGFydmVzdDogMixcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMSAmJiByb2xsIDwgMC4zMCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX3NocnViJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjggKyBybmQoKSAqIDAuNCwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICAgIHJlc291cmNlOiAnZmliZXInLCByZW1haW5pbmc6IDQsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQXV0aG9yZWRFbnRpdHkod29ybGQ6IFdvcmxkLCBraW5kOiBFbnRpdHlLaW5kLCB4OiBudW1iZXIsIHo6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCByb3Q6IG51bWJlciwgc2NhbGU6IG51bWJlciwgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGwsIHJlbWFpbmluZzogbnVtYmVyLCB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHkgPD0gU0VBX0xFVkVMKSByZXR1cm47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAvLyBBIGhlcm8gYXNzZXQgb3ducyBpdHMgc3BvdDogY2xlYXIgYW55IGdlbmVyYXRlZCBlbnRpdHkgdGhhdCB3b3VsZCBvdmVybGFwXG4gIC8vIGl0LCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZyB0aGUgYXV0aG9yZWQgY29tcG9zaXRpb24uXG4gIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXTtcbiAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChraW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHJldHVybjtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoZSAmJiBNYXRoLmh5cG90KGUueCAtIHgsIGUueiAtIHopIDwgMi42KSB7XG4gICAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gICAgfVxuICB9XG4gIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSkpO1xuICAvLyBBdXRob3JlZCBjb21wb3NpdGlvbiBpcyBkdXJhYmxlIHN0YXRlOiBpdCBjYW4gY2xlYXIgb3ZlcmxhcHBpbmcgbmF0dXJhbFxuICAvLyBlbnRpdGllcywgc28gc2F2ZSB0aGUgY29tcGxldGUgYWZmZWN0ZWQgY2h1bmsgcmF0aGVyIHRoYW4gb25seSBpdHMgaGVyb2VzLlxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuXG4gIGNvbnN0IGlkID0gYGhlcm86JHtraW5kfToke01hdGgucm91bmQoeCl9OiR7TWF0aC5yb3VuZCh6KX1gO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBjb25zdCBlbnRpdHk6IEVudGl0eSA9IHtcbiAgICBpZCwga2luZCwgY2h1bms6IGtleSwgeDogeCArIDAuNSwgeSwgejogeiArIDAuNSxcbiAgICByb3QsIHNjYWxlLCB2YXJpYW50LCByZXNvdXJjZSwgcmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiB0cnVlLFxuICB9O1xuICBhZGRFbnRpdHkod29ybGQsIGVudGl0eSk7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5zaXplID4gYmVmb3JlICYmIGtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHtcbiAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHJldHVybjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuXG4gIGNvbnN0IHNpdGVzOiBBcnJheTx7IGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJzsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJvdDogbnVtYmVyIH0+ID0gW1xuICAgIHsga2luZDogJ3dheXN0b25lJywgeDogLTEwLCB6OiAtMTQsIHJvdDogMCB9LFxuICAgIHsga2luZDogJ21hcmtlcicsIHg6IC0zMiwgejogLTgsIHJvdDogTWF0aC5QSSAvIDIgfSxcbiAgXTtcbiAgZm9yIChjb25zdCBzIG9mIHNpdGVzKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmICh5IDw9IFNFQV9MRVZFTCkgY29udGludWU7XG4gICAgd29ybGQuc2l0ZXMucHVzaCh7XG4gICAgICBpZDogYHNpdGU6JHtzLmtpbmR9YCxcbiAgICAgIGtpbmQ6IHMua2luZCxcbiAgICAgIHg6IHMueCArIDAuNSwgeSwgejogcy56ICsgMC41LFxuICAgICAgcm90OiBzLnJvdCxcbiAgICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQSBoZXJvIGdyb3ZlIGNvbXBvc2VkIGluIHRoZSBkZWZhdWx0IGNhbWVyYSdzIHZpZXcgZGlyZWN0aW9uLiBUaGVzZSBhcmVcbiAgLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyAoQVMtMDAxIHYyKSwgbm90IE5veGVsIGFyY2hpdGVjdHVyZTsgdGhlIE5veGVsXG4gIC8vIHdheXN0b25lL21hcmtlciBhYm92ZSByZW1haW4gdGhlIGh1bWFuLW1hZGUgbGFuZG1hcmtzLlxuICBjb25zdCBncm92ZTogQXJyYXk8W0VudGl0eUtpbmQsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXT4gPSBbXG4gICAgWydzdHlsX3RyZWVfc3BpcmUnLCAtMjIsIC0yNiwgMCwgMS4wMCwgMF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtMzQsIC0xOCwgMSwgMC45NSwgTWF0aC5QSSAvIDEyXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTE2LCAtMzQsIDIsIDEuMDAsIE1hdGguUEkgLyA2XSxcbiAgICBbJ3N0eWxfdHJlZV9ibG9zc29tJywgLTI4LCAtMzgsIDAsIDAuOTAsIE1hdGguUEkgLyA0XSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC00MCwgLTMwLCAyLCAxLjA1LCBNYXRoLlBJIC8gM10sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xMiwgLTI0LCAwLCAwLjkwLCBNYXRoLlBJIC8gMi40XSxcbiAgXTtcbiAgZm9yIChjb25zdCBba2luZCwgeCwgeiwgdmFyaWFudCwgc2NhbGUsIHJvdF0gb2YgZ3JvdmUpIHtcbiAgICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwga2luZCwgeCwgeiwgdmFyaWFudCwgcm90LCBzY2FsZSwgJ3dvb2QnLCAxMiwgNCk7XG4gIH1cbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3JvY2tfbWVkaXVtJywgLTYsIC0xMCwgMCwgMCwgMS4wLCAnc3RvbmUnLCA4LCAzKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3NocnViJywgLTE0LCAtOCwgMSwgTWF0aC5QSSAvIDEyLCAxLjEsICdmaWJlcicsIDQsIDEpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfY2Fpcm4nLCAtMjAsIC02LCAwLCAwLCAxLjAsICdzdG9uZScsIDYsIDIpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfb3JlJywgLTM4LCAtNDIsIDAsIE1hdGguUEkgLyA0LCAxLjEsICdvcmUnLCA4LCAyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5lYXJlc3RIYXJ2ZXN0YWJsZShcbiAgd29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgcmFkaXVzOiBudW1iZXIsIHJlc291cmNlPzogUmVzb3VyY2VUeXBlLFxuKTogRW50aXR5IHwgbnVsbCB7XG4gIGxldCBiZXN0OiBFbnRpdHkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGJlc3REID0gcmFkaXVzICogcmFkaXVzO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpXG4gICAgICB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcbiAgICBpZiAocmVzb3VyY2UgJiYgZS5yZXNvdXJjZSAhPT0gcmVzb3VyY2UpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSAoZS54IC0geCkgKiogMiArIChlLnogLSB6KSAqKiAyO1xuICAgIGlmIChkIDwgYmVzdEQpIHsgYmVzdEQgPSBkOyBiZXN0ID0gZTsgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RSZXN1bHQgeyBlbnRpdHk6IEVudGl0eTsgcmVzb3VyY2U6IFJlc291cmNlVHlwZTsgYW1vdW50OiBudW1iZXI7IH1cblxuLyoqXG4gKiBTZXR0bGVtZW50IHJ1bGVzIHYyIChNMDEwKTogZ3Jvd3RoIHN0YWdlIHNldHMgdHJlZSB5aWVsZCBhbmQgZm9vdHByaW50LCBhbmRcbiAqIHZpbGxhZ2VycyBuYXZpZ2F0ZS4gQWN0aXZlIG9uY2UgdGhlIHdvcmxkJ3MgaG9tZXN0ZWFkIGlzIHZlcnNpb24gMiAoZm91bmRlZFxuICogb3IgdXBncmFkZWQgYnkgYSBqb3VybmFsZWQgY29tbWFuZCk7IGVhcmxpZXIgd29ybGRzIGtlZXAgbGVnYWN5IHJ1bGVzLCBzb1xuICogdGhlaXIgcmVwbGF5cyBhbmQgaGFzaGVzIGFyZSB1bmNoYW5nZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGFnZVJ1bGVzQWN0aXZlKHdvcmxkOiBXb3JsZCk6IGJvb2xlYW4ge1xuICByZXR1cm4gKHdvcmxkLmhvbWVzdGVhZD8udmVyc2lvbiA/PyAwKSA+PSAyO1xufVxuXG4vKipcbiAqIFVuZGVyIHN0YWdlIHJ1bGVzIGEgdHJlZSdzIGZpcnN0IGN1dCBzZXRzIGl0cyByZWNvcmQgdG8gdGhlIHN0YWdlJ3MgdGltYmVyXG4gKiAoYSBzYXBsaW5nIGhvbGRzIDIgd29vZCwgYW4gb2xkIHRyZWUgMTYpLiBJZGVtcG90ZW50IGFmdGVyIHRoZSBmaXJzdCBjdXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseVN0YWdlVGltYmVyKHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICghc3RhZ2VSdWxlc0FjdGl2ZSh3b3JsZCkgfHwgZS5oYXJ2ZXN0ZWRPbmNlKSByZXR1cm47XG4gIGNvbnN0IHQgPSB0cmVlVGltYmVyKGUpO1xuICBpZiAoIXQpIHJldHVybjtcbiAgZS5yZW1haW5pbmcgPSB0LnRvdGFsO1xuICBlLnlpZWxkUGVySGFydmVzdCA9IHQuY3V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgLy8gQ2FwYWNpdHkgaXMgY2hlY2tlZCBhZ2FpbnN0IHRoZSBzdGFnZSB5aWVsZCwgdGhlbiB0aGUgcmVjb3JkIGNoYW5nZXMuXG4gIGlmIChzdGFnZVJ1bGVzQWN0aXZlKHdvcmxkKSAmJiAhZS5oYXJ2ZXN0ZWRPbmNlICYmIHRyZWVUaW1iZXIoZSkpIHtcbiAgICBjb25zdCB0ID0gdHJlZVRpbWJlcihlKSE7XG4gICAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIE1hdGgubWluKHQuY3V0LCB0LnRvdGFsKSA+IDEyMCkgcmV0dXJuIG51bGw7XG4gICAgYXBwbHlTdGFnZVRpbWJlcih3b3JsZCwgZSk7XG4gIH1cbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gVGVycmFpbiBxdWVyeSBsYXllciBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMiBTeXN0ZW0gMTogb25lIHNoYXJlZCwgY2FjaGVkIGNvbnRyYWN0IGZvciBjb25zdHJ1Y3Rpb24sIGZhcm1pbmcsXG4vLyBtb3ZlbWVudCwgbmF2aWdhdGlvbiBhbmQgdGhlIEFJIGFnZW50LiBUaGVzZSBxdWVyaWVzIGRlc2NyaWJlIHRoZVxuLy8gYXV0aG9yaXRhdGl2ZSB2b3hlbCB2b2x1bWU7IHRoZXkgbmV2ZXIgbXV0YXRlIGl0IGFuZCBuZXZlciBjcmVhdGUgYSBzZWNvbmRcbi8vIHRlcnJhaW4gcmVwcmVzZW50YXRpb24uXG4vL1xuLy8gQ29udmVudGlvbnM6XG4vLyAgICogeC96IGFyZSBpbnRlZ2VyIGNvbHVtbiBjb29yZGluYXRlcyBpbiBbLTEwMjQsIDEwMjQpLlxuLy8gICAqIHkgaXMgYW4gaW50ZWdlciB2b3hlbCBjb29yZGluYXRlIGluIFstMTYsIDExMikuXG4vLyAgICogc3VyZmFjZVkgaXMgdGhlIGV4cG9zZWQgdG9wIGZhY2UgKHRvcFNvbGlkICsgMSksIG1hdGNoaW5nIE0wMDEuXG4vLyAgICogQSByZWN0IGlzIGluY2x1c2l2ZSBvbiBhbGwgZm91ciBlZGdlcy5cbmltcG9ydCB7XG4gIFdvcmxkLCBNYXRJZCwgTUFULCBTRUFfTEVWRUwsIFlfTUlOLCBZX01BWCwgSEFMRixcbiAgc3VyZmFjZUF0LCB0b3BNYXRlcmlhbEF0V29ybGQsIGdldFZveGVsLCBpc1NvbGlkLFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgQWN0aXZlRW50aXR5S2luZCwgRW50aXR5S2luZCwgaXNSZXRpcmVkU3RvbmVLaW5kLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVjdCB7XG4gIHgwOiBudW1iZXI7XG4gIHowOiBudW1iZXI7XG4gIHgxOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxSZWdpb24gZXh0ZW5kcyBSZWN0IHtcbiAgeTA6IG51bWJlcjtcbiAgeTE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVJlY3QocmVjdDogUmVjdCk6IFJlY3Qge1xuICByZXR1cm4ge1xuICAgIHgwOiBNYXRoLm1pbihyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MDogTWF0aC5taW4ocmVjdC56MCwgcmVjdC56MSksXG4gICAgeDE6IE1hdGgubWF4KHJlY3QueDAsIHJlY3QueDEpLFxuICAgIHoxOiBNYXRoLm1heChyZWN0LnowLCByZWN0LnoxKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RDb2x1bW5zKHJlY3Q6IFJlY3QpOiBudW1iZXIge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgcmV0dXJuIChyLngxIC0gci54MCArIDEpICogKHIuejEgLSByLnowICsgMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29udGFpbnMocmVjdDogUmVjdCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHggPj0gcmVjdC54MCAmJiB4IDw9IHJlY3QueDEgJiYgeiA+PSByZWN0LnowICYmIHogPD0gcmVjdC56MTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cGFuZFJlY3QocmVjdDogUmVjdCwgYW1vdW50OiBudW1iZXIpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogcmVjdC54MCAtIGFtb3VudCxcbiAgICB6MDogcmVjdC56MCAtIGFtb3VudCxcbiAgICB4MTogcmVjdC54MSArIGFtb3VudCxcbiAgICB6MTogcmVjdC56MSArIGFtb3VudCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RUb1JlZ2lvbihyZWN0OiBSZWN0LCB5MCA9IFlfTUlOLCB5MSA9IFlfTUFYIC0gMSk6IFZveGVsUmVnaW9uIHtcbiAgcmV0dXJuIHsgLi4ubm9ybWFsaXplUmVjdChyZWN0KSwgeTAsIHkxIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpb25zT3ZlcmxhcChhOiBWb3hlbFJlZ2lvbiwgYjogVm94ZWxSZWdpb24pOiBib29sZWFuIHtcbiAgcmV0dXJuIGEueDAgPD0gYi54MSAmJiBhLngxID49IGIueDAgJiYgYS56MCA8PSBiLnoxICYmIGEuejEgPj0gYi56MFxuICAgICYmIGEueTAgPD0gYi55MSAmJiBhLnkxID49IGIueTA7XG59XG5cbi8qKiBJbmNsdXNpdmUgY29udGFpbm1lbnQgb2YgYSB2b3hlbCBpbiBhIHdvcmsgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gZW52ZWxvcGVDb250YWlucyhyZWN0czogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBmb3IgKGNvbnN0IHIgb2YgcmVjdHMpIHtcbiAgICBpZiAoeCA+PSByLngwICYmIHggPD0gci54MSAmJiB5ID49IHIueTAgJiYgeSA8PSByLnkxICYmIHogPj0gci56MCAmJiB6IDw9IHIuejEpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWluQ29sdW1uIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIC8qKiBFeHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW47IHRoZSBmaXJzdCBhaXIgY2VsbCBhYm92ZSBpdC4gKi9cbiAgc3VyZmFjZVk6IG51bWJlcjtcbiAgLyoqIFRoZSBoaWdoZXN0IHNvbGlkIHZveGVsLCBvciBZX01JTiAtIDEgaWYgdGhlIGNvbHVtbiBoYXMgbm8gc29saWQuICovXG4gIHRvcFNvbGlkWTogbnVtYmVyO1xuICB0b3BNYXRlcmlhbDogTWF0SWQ7XG4gIHNvbGlkOiBib29sZWFuO1xuICAvKiogV2F0ZXIgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UsIHVwIHRvIHNlYSBsZXZlbC4gMCBvbiBkcnkgbGFuZC4gKi9cbiAgd2F0ZXJEZXB0aDogbnVtYmVyO1xuICB1bmRlcndhdGVyOiBib29sZWFuO1xuICAvKiogTGFyZ2VzdCA0LW5laWdoYm91ciBzdXJmYWNlIHN0ZXAgaW4gbWV0cmVzICgxID0gYSBzaW5nbGUgdm94ZWwgcmlzZXIpLiAqL1xuICBzbG9wZTogbnVtYmVyO1xuICAvKiogRnJlZSBhaXIgY2VsbHMgYWJvdmUgdGhlIHN1cmZhY2UsIGNhcHBlZCBhdCBDTEVBUkFOQ0VfUFJPQkUuICovXG4gIGNsZWFyYW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgQ0xFQVJBTkNFX1BST0JFID0gODtcblxuZnVuY3Rpb24gc3VyZmFjZUF0U2FmZSh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBmYWxsYmFjazogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbGxiYWNrO1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqIFdhdGVyIGRlcHRoIHRoYXQgcmVzcGVjdHMgYSBkcnkgcGl0IGJlbG93IHNlYSBsZXZlbCAodW5saWtlIGhlaWdodCBhbG9uZSkuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0Q29sdW1uKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHN1cmZhY2UgPj0gU0VBX0xFVkVMKSByZXR1cm4gMDtcbiAgaWYgKGdldFZveGVsKHdvcmxkLCB4LCBTRUFfTEVWRUwgLSAxLCB6KSAhPT0gTUFULldBVEVSKSByZXR1cm4gMDtcbiAgcmV0dXJuIFNFQV9MRVZFTCAtIHN1cmZhY2U7XG59XG5cbi8qKiBUcnVlIHdoZW4gYGhlaWdodGAgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlIGFyZSBmcmVlIG9mIHNvbGlkIG9yIHdhdGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyYW5jZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGhlaWdodDsgaSsrKSB7XG4gICAgaWYgKGdldFZveGVsKHdvcmxkLCB4LCBzdXJmYWNlICsgaSwgeikgIT09IE1BVC5BSVIpIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbHVtbkF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBUZXJyYWluQ29sdW1uIHtcbiAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHN1cmZhY2VZID0gc3VyZmFjZUF0KHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCB0b3BNYXRlcmlhbCA9IHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc29saWQgPSBzdXJmYWNlWSA+IFlfTUlOICYmIGlzU29saWQodG9wTWF0ZXJpYWwpO1xuICBjb25zdCB3YXRlckRlcHRoID0gd2F0ZXJEZXB0aEF0Q29sdW1uKHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3ggLSAxLCBjeiwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4ICsgMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCwgY3ogLSAxLCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6ICsgMSwgc3VyZmFjZVkpKSxcbiAgKTtcbiAgbGV0IGNsZWFyYW5jZSA9IDA7XG4gIHdoaWxlIChjbGVhcmFuY2UgPCBDTEVBUkFOQ0VfUFJPQkUgJiYgZ2V0Vm94ZWwod29ybGQsIGN4LCBzdXJmYWNlWSArIGNsZWFyYW5jZSwgY3opID09PSBNQVQuQUlSKSB7XG4gICAgY2xlYXJhbmNlKys7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICB4OiBjeCwgejogY3osIHN1cmZhY2VZLCB0b3BTb2xpZFk6IHN1cmZhY2VZIC0gMSwgdG9wTWF0ZXJpYWwsXG4gICAgc29saWQsIHdhdGVyRGVwdGgsIHVuZGVyd2F0ZXI6IHdhdGVyRGVwdGggPiAwLCBzbG9wZSwgY2xlYXJhbmNlLFxuICB9O1xufVxuXG4vLyBFbnRpdHkgZm9vdHByaW50cyBhcmUgZGVsaWJlcmF0ZWx5IGV4cGxpY2l0LiBBIHRyZWUgb2NjdXBpZXMgbW9yZSBzaXRlIHRoYW5cbi8vIGl0cyB0cnVuazsgYSBwZWJibGUgb2NjdXBpZXMgbGVzcyB0aGFuIGEgYm91bGRlci4gVGhlc2UgYXJlIHNpbXVsYXRpb25cbi8vIGNsZWFyYW5jZSByYWRpaSwgbm90IHJlbmRlciBib3VuZHMuXG5leHBvcnQgY29uc3QgT0JTVFJVQ1RJT05fUkFESVVTOiBSZWNvcmQ8QWN0aXZlRW50aXR5S2luZCwgbnVtYmVyPiA9IHtcbiAgc3R5bF90cmVlX3NwaXJlOiAxLjUsXG4gIHN0eWxfdHJlZV90YWJsZTogMS44LFxuICBzdHlsX3RyZWVfY2x1c3RlcjogMS45LFxuICBzdHlsX3RyZWVfYmxvc3NvbTogMS42LFxuICBzdHlsX3NocnViOiAwLjYsXG4gIHN0eWxfb3JlOiAwLjksXG4gIHN0eWxfY2Fpcm46IDAuOCxcbiAgd2F5c3RvbmU6IDEuNCxcbiAgbWFya2VyOiAwLjUsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIE9ic3RydWN0aW9uIHtcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJhZGl1czogbnVtYmVyO1xuICAvKiogRm9vdHByaW50IGNlbGxzIG92ZXJsYXBwZWQgYnkgdGhpcyBlbnRpdHkuICovXG4gIGNlbGxzOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0KTogc3RyaW5nW10ge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgLy8gQSByZWN0IG93bnMgd2hvbGUgdm94ZWwgY2VsbHMuIEluY2x1ZGUgZXZlcnkgY2h1bmsgd2hvc2Ugcm9vdCBjb3VsZCBvdmVybGFwXG4gIC8vIHRob3NlIGNlbGxzLCB3aXRob3V0IHNjYW5uaW5nIHRoZSBlbnRpcmUgMjA0OCBtIHdvcmxkLlxuICBjb25zdCByYWRpdXMgPSBNYXRoLm1heCguLi5PYmplY3QudmFsdWVzKE9CU1RSVUNUSU9OX1JBRElVUyksIDEuNSk7XG4gIGNvbnN0IG1pbkNlbGxYID0gTWF0aC5mbG9vcihyLngwICsgMC41IC0gcmFkaXVzKTtcbiAgY29uc3QgbWF4Q2VsbFggPSBNYXRoLmNlaWwoci54MSArIDAuNSArIHJhZGl1cykgLSAxO1xuICBjb25zdCBtaW5DZWxsWiA9IE1hdGguZmxvb3Ioci56MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxaID0gTWF0aC5jZWlsKHIuejEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY3gwID0gTWF0aC5tYXgoMCwgd29ybGRUb0NodW5rWChtaW5DZWxsWCkpLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKG1heENlbGxYKTtcbiAgY29uc3QgY3owID0gTWF0aC5tYXgoMCwgd29ybGRUb0NodW5rWihtaW5DZWxsWikpLCBjejEgPSB3b3JsZFRvQ2h1bmtaKG1heENlbGxaKTtcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIGtleXMucHVzaChjaHVua0tleShjeCwgY3opKTtcbiAgfVxuICByZXR1cm4ga2V5cztcbn1cblxuLyoqIEVudGl0aWVzIHdob3NlIHNpbXVsYXRpb24gZm9vdHByaW50IG92ZXJsYXBzIHRoZSByZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9ic3RydWN0aW9uc0luKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IE9ic3RydWN0aW9uW10ge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBvdXQ6IE9ic3RydWN0aW9uW10gPSBbXTtcbiAgZm9yIChjb25zdCBrZXkgb2YgZW50aXR5Q2h1bmtzRm9yUmVjdCh3b3JsZCwgcikpIHtcbiAgICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFpZHMpIGNvbnRpbnVlO1xuICAgIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgICBpZiAoc2Vlbi5oYXMoaWQpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgY29udGludWU7XG4gICAgICBzZWVuLmFkZChpZCk7XG4gICAgICBjb25zdCByYWRpdXMgPSBpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKVxuICAgICAgICA/IGUua2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyAwLjYgOiBlLmtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDEuMSA6IDEuNVxuICAgICAgICA6IE9CU1RSVUNUSU9OX1JBRElVU1tlLmtpbmQgYXMgQWN0aXZlRW50aXR5S2luZF07XG4gICAgICBsZXQgY2VsbHMgPSAwO1xuICAgICAgY29uc3QgZXgwID0gTWF0aC5tYXgoci54MCwgTWF0aC5mbG9vcihlLnggLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV4MSA9IE1hdGgubWluKHIueDEsIE1hdGguY2VpbChlLnggKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MCA9IE1hdGgubWF4KHIuejAsIE1hdGguZmxvb3IoZS56IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejEgPSBNYXRoLm1pbihyLnoxLCBNYXRoLmNlaWwoZS56ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBmb3IgKGxldCB6ID0gZXowOyB6IDw9IGV6MTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBleDA7IHggPD0gZXgxOyB4KyspIHtcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChlLnggLSAoeCArIDAuNSksIGUueiAtICh6ICsgMC41KSkgPD0gcmFkaXVzKSBjZWxscysrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY2VsbHMgPiAwKSB7XG4gICAgICAgIG91dC5wdXNoKHsgZW50aXR5SWQ6IGUuaWQsIGtpbmQ6IGUua2luZCwgeDogZS54LCB6OiBlLnosIHJhZGl1cywgY2VsbHMgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiAoYS5lbnRpdHlJZCA8IGIuZW50aXR5SWQgPyAtMSA6IGEuZW50aXR5SWQgPiBiLmVudGl0eUlkID8gMSA6IDApKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcmVhU3RhdHMge1xuICByZWN0OiBSZWN0O1xuICBjb2x1bW5zOiBudW1iZXI7XG4gIG1pblk6IG51bWJlcjtcbiAgbWF4WTogbnVtYmVyO1xuICBtZWFuWTogbnVtYmVyO1xuICByZWxpZWY6IG51bWJlcjtcbiAgbWF4U3RlcDogbnVtYmVyO1xuICB3YXRlckNvbHVtbnM6IG51bWJlcjtcbiAgc3RvbmVDb2x1bW5zOiBudW1iZXI7XG4gIG1hdGVyaWFsczogUmVjb3JkPG51bWJlciwgbnVtYmVyPjtcbiAgb2JzdHJ1Y3Rpb25zOiBPYnN0cnVjdGlvbltdO1xuICBvYnN0cnVjdGVkQ29sdW1uczogbnVtYmVyO1xuICAvKiogQ3V0L2ZpbGwgcmVsYXRpdmUgdG8gZmxvb3JZIHdoZW4gc3VwcGxpZWQsIG90aGVyd2lzZSAwLiAqL1xuICBmbG9vclk6IG51bWJlciB8IG51bGw7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VwcG9ydFN1bW1hcnkge1xuICB0b3RhbDogbnVtYmVyO1xuICBsZXZlbDogbnVtYmVyO1xuICBjdXQ6IG51bWJlcjtcbiAgZmlsbDogbnVtYmVyO1xuICB3YXRlcjogbnVtYmVyO1xuICAvKiogRmlsbCBkZWVwZXIgdGhhbiA4IG07IGEgdmFsaWRhdG9yIG1heSByZWplY3QgdGhlc2UgYXMgdW5zdXBwb3J0ZWQuICovXG4gIGRlZXBGaWxsOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRm9vdHByaW50UXVlcnkge1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgc3RhdHM6IEFyZWFTdGF0cztcbiAgc3VwcG9ydDogU3VwcG9ydFN1bW1hcnk7XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgLyoqIENlbGxzIGluIHRoZSBidWlsZGluZyB2b2x1bWUgYWJvdmUgdGhlIHByZXBhcmVkIGZsb29yIHRoYXQgYXJlIG5vdCBhaXIuICovXG4gIG92ZXJoYW5nQ2VsbHM6IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgbWF0ZXJpYWw6IE1hdElkIH0+O1xufVxuXG4vKipcbiAqIENhY2hlZCBxdWVyeSBjb250ZXh0LiBDYWNoZXMgYXJlIGtleWVkIG9uIHdvcmxkLnJldmlzaW9uOiBhIHZveGVsIG9yIGVudGl0eVxuICogZWRpdCBpbnZhbGlkYXRlcyB0aGVtLCB3aGlsZSBtZXNoL25hdiByZWJ1aWxkcyBkbyBub3QuIFVzZSBvbmUgY29udGV4dCBmb3IgYVxuICogc2l0ZSBzZWFyY2ggb3IgYSBmb290cHJpbnQgZXZhbHVhdGlvbiwgdGhlbiBkaXNjYXJkIGl0LlxuICovXG5leHBvcnQgY2xhc3MgVGVycmFpblF1ZXJ5IHtcbiAgcHJpdmF0ZSBjYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBUZXJyYWluQ29sdW1uPigpO1xuICBwcml2YXRlIG9ic3RydWN0aW9uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzdHJ1Y3Rpb25bXT4oKTtcbiAgcHJpdmF0ZSByZXZpc2lvbjogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSB3b3JsZDogV29ybGQpIHtcbiAgICB0aGlzLnJldmlzaW9uID0gd29ybGQucmV2aXNpb247XG4gIH1cblxuICBwcml2YXRlIHN5bmMoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucmV2aXNpb24gIT09IHRoaXMud29ybGQucmV2aXNpb24pIHtcbiAgICAgIHRoaXMuY2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5jbGVhcigpO1xuICAgICAgdGhpcy5yZXZpc2lvbiA9IHRoaXMud29ybGQucmV2aXNpb247XG4gICAgfVxuICB9XG5cbiAgLyoqIENhY2hlZCBlbnRpdHkgb2JzdHJ1Y3Rpb25zIGZvciBvbmUgZm9vdHByaW50LiAqL1xuICBvYnN0cnVjdGlvbnNGb3IocmVjdDogUmVjdCk6IE9ic3RydWN0aW9uW10ge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGNvbnN0IGtleSA9IGAke3IueDB9LCR7ci56MH0sJHtyLngxfSwke3IuejF9YDtcbiAgICBsZXQgbGlzdCA9IHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWxpc3QpIHtcbiAgICAgIGxpc3QgPSBvYnN0cnVjdGlvbnNJbih0aGlzLndvcmxkLCByKTtcbiAgICAgIHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5zZXQoa2V5LCBsaXN0KTtcbiAgICB9XG4gICAgcmV0dXJuIGxpc3Q7XG4gIH1cblxuICBjb2x1bW4oeDogbnVtYmVyLCB6OiBudW1iZXIpOiBUZXJyYWluQ29sdW1uIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCBjeCA9IE1hdGguZmxvb3IoeCksIGN6ID0gTWF0aC5mbG9vcih6KTtcbiAgICBjb25zdCBrZXkgPSBgJHtjeH0sJHtjen1gO1xuICAgIGxldCBjb2wgPSB0aGlzLmNhY2hlLmdldChrZXkpO1xuICAgIGlmICghY29sKSB7XG4gICAgICBjb2wgPSBjb2x1bW5BdCh0aGlzLndvcmxkLCBjeCwgY3opO1xuICAgICAgdGhpcy5jYWNoZS5zZXQoa2V5LCBjb2wpO1xuICAgIH1cbiAgICByZXR1cm4gY29sO1xuICB9XG5cbiAgYXJlYShyZWN0OiBSZWN0LCBmbG9vclk/OiBudW1iZXIpOiBBcmVhU3RhdHMge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGxldCBtaW5ZID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICAgIGxldCBtYXhZID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICAgIGxldCBzdW0gPSAwO1xuICAgIGxldCBtYXhTdGVwID0gMDtcbiAgICBsZXQgd2F0ZXJDb2x1bW5zID0gMDtcbiAgICBsZXQgc3RvbmVDb2x1bW5zID0gMDtcbiAgICBsZXQgY3V0Vm9sdW1lID0gMDtcbiAgICBsZXQgZmlsbFZvbHVtZSA9IDA7XG4gICAgbGV0IG1heEN1dCA9IDA7XG4gICAgbGV0IG1heEZpbGwgPSAwO1xuICAgIGNvbnN0IG1hdGVyaWFsczogUmVjb3JkPG51bWJlciwgbnVtYmVyPiA9IHt9O1xuXG4gICAgZm9yIChsZXQgeiA9IHIuejA7IHogPD0gci56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gci54MDsgeCA8PSByLngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gdGhpcy5jb2x1bW4oeCwgeik7XG4gICAgICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgc3VtICs9IGNvbC5zdXJmYWNlWTtcbiAgICAgICAgbWF4U3RlcCA9IE1hdGgubWF4KG1heFN0ZXAsIGNvbC5zbG9wZSk7XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHdhdGVyQ29sdW1ucysrO1xuICAgICAgICBpZiAoY29sLnRvcE1hdGVyaWFsID09PSBNQVQuU1RPTkUpIHN0b25lQ29sdW1ucysrO1xuICAgICAgICBtYXRlcmlhbHNbY29sLnRvcE1hdGVyaWFsXSA9IChtYXRlcmlhbHNbY29sLnRvcE1hdGVyaWFsXSA/PyAwKSArIDE7XG4gICAgICAgIGlmIChmbG9vclkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGNvbnN0IGR5ID0gY29sLnN1cmZhY2VZIC0gZmxvb3JZO1xuICAgICAgICAgIGlmIChkeSA+IDApIHtcbiAgICAgICAgICAgIGN1dFZvbHVtZSArPSBkeTtcbiAgICAgICAgICAgIG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZHkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZHkgPCAwKSB7XG4gICAgICAgICAgICBmaWxsVm9sdW1lICs9IC1keTtcbiAgICAgICAgICAgIG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG9ic3RydWN0aW9ucyA9IHRoaXMub2JzdHJ1Y3Rpb25zRm9yKHIpO1xuICAgIGNvbnN0IG9ic3RydWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IG8gb2Ygb2JzdHJ1Y3Rpb25zKSB7XG4gICAgICBjb25zdCByYWRpdXMgPSBvLnJhZGl1cztcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3Ioby54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoby54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKG8ueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKG8ueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3Qoby54IC0gKHggKyAwLjUpLCBvLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgb2JzdHJ1Y3RlZC5hZGQoYCR7eH0sJHt6fWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgY29sdW1ucyA9IChyLngxIC0gci54MCArIDEpICogKHIuejEgLSByLnowICsgMSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlY3Q6IHIsXG4gICAgICBjb2x1bW5zLFxuICAgICAgbWluWSwgbWF4WSxcbiAgICAgIG1lYW5ZOiBNYXRoLnJvdW5kKChzdW0gLyBjb2x1bW5zKSAqIDEwMDApIC8gMTAwMCxcbiAgICAgIHJlbGllZjogbWF4WSAtIG1pblksXG4gICAgICBtYXhTdGVwLFxuICAgICAgd2F0ZXJDb2x1bW5zLFxuICAgICAgc3RvbmVDb2x1bW5zLFxuICAgICAgbWF0ZXJpYWxzLFxuICAgICAgb2JzdHJ1Y3Rpb25zLFxuICAgICAgb2JzdHJ1Y3RlZENvbHVtbnM6IG9ic3RydWN0ZWQuc2l6ZSxcbiAgICAgIGZsb29yWTogZmxvb3JZID8/IG51bGwsXG4gICAgICBjdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0LFxuICAgICAgbWF4RmlsbCxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEV2YWx1YXRlIGEgY29tcGxldGUgYnVpbGRpbmcgZm9vdHByaW50LiBgZmxvb3JZYCBpcyB0aGUgcHJlcGFyZWQgd2Fsa2luZ1xuICAgKiBmbG9vcjogdGVycmFpbiBhYm92ZSBpdCBpcyBjdXQsIHRlcnJhaW4gYmVsb3cgaXQgaXMgZmlsbGVkLiBUaGUgcmVzdWx0IGlzXG4gICAqIHJhdyBzaXRlIGRhdGE7IGNvbnN0cnVjdGlvbiBydWxlcyBsaXZlIGluIGNvbnN0cnVjdGlvbi50cy5cbiAgICovXG4gIGZvb3RwcmludChyZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IEZvb3RwcmludFF1ZXJ5IHtcbiAgICBjb25zdCBzdGF0cyA9IHRoaXMuYXJlYShyZWN0LCBmbG9vclkpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGNvbnN0IHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5ID0ge1xuICAgICAgdG90YWw6IHN0YXRzLmNvbHVtbnMsIGxldmVsOiAwLCBjdXQ6IDAsIGZpbGw6IDAsIHdhdGVyOiAwLCBkZWVwRmlsbDogMCxcbiAgICAgIG1heEN1dDogMCwgbWF4RmlsbDogMCwgY3V0Vm9sdW1lOiAwLCBmaWxsVm9sdW1lOiAwLFxuICAgIH07XG4gICAgY29uc3Qgb3ZlcmhhbmdDZWxsczogRm9vdHByaW50UXVlcnlbJ292ZXJoYW5nQ2VsbHMnXSA9IFtdO1xuXG4gICAgZm9yIChsZXQgeiA9IHIuejA7IHogPD0gci56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gci54MDsgeCA8PSByLngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gdGhpcy5jb2x1bW4oeCwgeik7XG4gICAgICAgIGNvbnN0IGR5ID0gY29sLnN1cmZhY2VZIC0gZmxvb3JZO1xuICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgc3VwcG9ydC5jdXQrKztcbiAgICAgICAgICBzdXBwb3J0LmN1dFZvbHVtZSArPSBkeTtcbiAgICAgICAgICBzdXBwb3J0Lm1heEN1dCA9IE1hdGgubWF4KHN1cHBvcnQubWF4Q3V0LCBkeSk7XG4gICAgICAgIH0gZWxzZSBpZiAoZHkgPCAwKSB7XG4gICAgICAgICAgc3VwcG9ydC5maWxsKys7XG4gICAgICAgICAgc3VwcG9ydC5maWxsVm9sdW1lICs9IC1keTtcbiAgICAgICAgICBzdXBwb3J0Lm1heEZpbGwgPSBNYXRoLm1heChzdXBwb3J0Lm1heEZpbGwsIC1keSk7XG4gICAgICAgICAgaWYgKC1keSA+IDgpIHN1cHBvcnQuZGVlcEZpbGwrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdXBwb3J0LmxldmVsKys7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbC53YXRlckRlcHRoID4gMCkgc3VwcG9ydC53YXRlcisrO1xuXG4gICAgICAgIC8vIEFuIG92ZXJoYW5nIGlzIHRlcnJhaW4gYWJvdmUgdGhlIGZsb29yIHRoYXQgc3Vydml2ZXMgdGhlIGN1dCBwbGFuZS5cbiAgICAgICAgLy8gRm9yIGEgY29sdW1uIGJlbG93IHRoZSBmbG9vciwgaXRzIHNvbGlkIGJvZHkgaXMgZmlsbCwgbm90IG92ZXJoYW5nLlxuICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KGZsb29yWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDwgc3RhcnQgKyA0OyB5KyspIHtcbiAgICAgICAgICBjb25zdCBtID0gZ2V0Vm94ZWwodGhpcy53b3JsZCwgeCwgeSwgeikgYXMgTWF0SWQ7XG4gICAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIG92ZXJoYW5nQ2VsbHMucHVzaCh7IHgsIHksIHosIG1hdGVyaWFsOiBtIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVjdDogciwgZmxvb3JZLCBzdGF0cywgc3VwcG9ydCwgb2JzdHJ1Y3Rpb25zOiBzdGF0cy5vYnN0cnVjdGlvbnMsIG92ZXJoYW5nQ2VsbHMgfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIG1vdmVtZW50IGNvbnRyYWN0IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV2Fsa1BhcmFtcyB7XG4gIG1heFN0ZXBVcDogbnVtYmVyO1xuICBtYXhTdGVwRG93bjogbnVtYmVyO1xuICBtYXhXYXRlckRlcHRoOiBudW1iZXI7XG4gIC8qKiBNYXhpbXVtIGFkamFjZW50IHN1cmZhY2Ugc3RlcDsgMS4wIGlzIGEgNDUgZGVncmVlIHZveGVsIHJpc2VyLiAqL1xuICBtYXhTbG9wZTogbnVtYmVyO1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfV0FMSzogV2Fsa1BhcmFtcyA9IHtcbiAgbWF4U3RlcFVwOiAxLjAsXG4gIG1heFN0ZXBEb3duOiAxLjUsXG4gIG1heFdhdGVyRGVwdGg6IDAuNCxcbiAgbWF4U2xvcGU6IDEuMCxcbiAgY2xlYXJhbmNlOiAyLjAsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtSZXN1bHQge1xuICBvazogYm9vbGVhbjtcbiAgcmVhc29uOiAnb2snIHwgJ25vdF9hZGphY2VudCcgfCAnc3RlcF91cCcgfCAnZmFsbCcgfCAnd2F0ZXInIHwgJ3Nsb3BlJyB8ICdjbGVhcmFuY2UnO1xuICBzdGVwOiBudW1iZXI7XG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbn1cblxuLyoqIEV2YWx1YXRlIG9uZSBncmlkIHN0ZXAuIFBhdGhzIGFyZSB2YWxpZGF0ZWQgd2l0aCB0aGUgc2FtZSBjb250cmFjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YWxrU3RlcChcbiAgd29ybGQ6IFdvcmxkLCBmcm9tWDogbnVtYmVyLCBmcm9tWjogbnVtYmVyLCB0b1g6IG51bWJlciwgdG9aOiBudW1iZXIsXG4gIHBhcmFtczogV2Fsa1BhcmFtcyA9IERFRkFVTFRfV0FMSyxcbik6IFdhbGtSZXN1bHQge1xuICBjb25zdCBkeCA9IE1hdGguYWJzKE1hdGguZmxvb3IodG9YKSAtIE1hdGguZmxvb3IoZnJvbVgpKTtcbiAgY29uc3QgZHogPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWikgLSBNYXRoLmZsb29yKGZyb21aKSk7XG4gIGlmIChkeCArIGR6ICE9PSAxKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdub3RfYWRqYWNlbnQnLCBzdGVwOiAwLCB3YXRlckRlcHRoOiAwIH07XG4gIH1cbiAgY29uc3QgZnJvbSA9IGNvbHVtbkF0KHdvcmxkLCBmcm9tWCwgZnJvbVopO1xuICBjb25zdCB0byA9IGNvbHVtbkF0KHdvcmxkLCB0b1gsIHRvWik7XG4gIGNvbnN0IHN0ZXAgPSB0by5zdXJmYWNlWSAtIGZyb20uc3VyZmFjZVk7XG4gIGlmIChzdGVwID4gcGFyYW1zLm1heFN0ZXBVcCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGVwX3VwJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAoLXN0ZXAgPiBwYXJhbXMubWF4U3RlcERvd24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnZmFsbCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKHRvLndhdGVyRGVwdGggPiBwYXJhbXMubWF4V2F0ZXJEZXB0aCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd3YXRlcicsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKHRvLnNsb3BlID4gcGFyYW1zLm1heFNsb3BlKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Nsb3BlJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAoIWNsZWFyYW5jZUF0KHdvcmxkLCB0b1gsIHRvWiwgcGFyYW1zLmNsZWFyYW5jZSkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2NsZWFyYW5jZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgcmVhc29uOiAnb2snLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG59XG5cbi8qKiBFZmZlY3RpdmUgZ3JhZGUgb2YgYSBzdHJhaWdodCBwYXRoIHNlZ21lbnQsIHVzZWQgYnkgcGF0aCB2YWxpZGF0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdGl2ZUdyYWRlKHdvcmxkOiBXb3JsZCwgeDA6IG51bWJlciwgejA6IG51bWJlciwgeDE6IG51bWJlciwgejE6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGEgPSBjb2x1bW5BdCh3b3JsZCwgeDAsIHowKTtcbiAgY29uc3QgYiA9IGNvbHVtbkF0KHdvcmxkLCB4MSwgejEpO1xuICBjb25zdCBydW4gPSBNYXRoLmh5cG90KHgxIC0geDAsIHoxIC0gejApO1xuICBpZiAocnVuID09PSAwKSByZXR1cm4gTWF0aC5hYnMoYi5zdXJmYWNlWSAtIGEuc3VyZmFjZVkpO1xuICByZXR1cm4gTWF0aC5hYnMoYi5zdXJmYWNlWSAtIGEuc3VyZmFjZVkpIC8gcnVuO1xufVxuIiwgIi8vIE0wMDIgc2l0ZSB2YWxpZGF0aW9uLCBjYW5kaWRhdGUgc2VhcmNoIGFuZCBwcmV2aWV3IFx1MjAxNCBwdXJlIHNpbXVsYXRpb24uXG4vL1xuLy8gVGhpcyBpcyB0aGUgc2hhcmVkIGdhdGUgZm9yIHRoZSBwbGF5ZXIgYW5kIHRoZSBBSSBhZ2VudC4gTmVpdGhlciBtYXkgcGxhY2UgYVxuLy8gc3RydWN0dXJlIGJ5IGFueSBvdGhlciBwYXRoOiBib3RoIHN1Ym1pdCBhIFNpdGVQcm9wb3NhbCwgYm90aCByZWNlaXZlIHRoZVxuLy8gc2FtZSBTaXRlVmFsaWRhdGlvbiwgYW5kIGJvdGggbXVzdCBwYXNzIHRoZSBBdXRob3JpemVyIGJlZm9yZSBleGVjdXRpb24uXG4vL1xuLy8gVGhlIHZhbGlkYXRvciBkZXNjcmliZXMgdGhlIHNpdGUgYXMgaXQgaXMuIEl0IGRvZXMgbm90IGVkaXQgdm94ZWxzLCByZW1vdmVcbi8vIGVudGl0aWVzIG9yIHNwZW5kIHJlc291cmNlcy4gUHJlcGFyYXRpb24gaXMgYSBzZXBhcmF0ZSwgYXV0aG9yaXplZCBzdGVwLlxuaW1wb3J0IHsgV29ybGQsIEhBTEYsIFlfTUlOLCBZX01BWCwgc3VyZmFjZUF0IH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgRm9vdHByaW50UXVlcnksIFRlcnJhaW5RdWVyeSwgQXJlYVN0YXRzLFxuICBub3JtYWxpemVSZWN0LCBleHBhbmRSZWN0LCByZWN0Q29sdW1ucywgZWZmZWN0aXZlR3JhZGUsIHdhbGtTdGVwLCBXYWxrUGFyYW1zLFxuICBERUZBVUxUX1dBTEssIGNvbHVtbkF0LFxufSBmcm9tICcuL3RlcnJhaW4nO1xuXG5leHBvcnQgdHlwZSBTaXRlU3RhdGUgPSAndmFsaWQnIHwgJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nIHwgJ2ludmFsaWQnO1xuXG5leHBvcnQgdHlwZSBWYWxpZGF0aW9uQ29kZSA9XG4gIHwgJ291dF9vZl9ib3VuZHMnXG4gIHwgJ2Zvb3RwcmludF9taXNtYXRjaCdcbiAgfCAnc2xvcGVfZXhjZWVkZWQnXG4gIHwgJ3N0ZXBfZXhjZWVkZWQnXG4gIHwgJ2N1dF9leGNlZWRlZCdcbiAgfCAnZmlsbF9leGNlZWRlZCdcbiAgfCAnY3V0X3ZvbHVtZV9leGNlZWRlZCdcbiAgfCAnZmlsbF92b2x1bWVfZXhjZWVkZWQnXG4gIHwgJ2Zvb3RwcmludF9vYnN0cnVjdGVkJ1xuICB8ICd3YXRlcidcbiAgfCAnb3ZlcmhhbmcnXG4gIHwgJ25lZWRzX2dyYWRpbmcnXG4gIHwgJ25lZWRzX2NsZWFyaW5nJztcblxuZXhwb3J0IGludGVyZmFjZSBWYWxpZGF0aW9uUmVhc29uIHtcbiAgY29kZTogVmFsaWRhdGlvbkNvZGU7XG4gIHNldmVyaXR5OiAnZXJyb3InIHwgJ3ByZXBhcmF0aW9uJztcbiAgbWVzc2FnZTogc3RyaW5nO1xuICB2YWx1ZT86IG51bWJlcjtcbiAgbGltaXQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIEZvdW5kYXRpb25UeXBlID0gJ2dyYWRlZF9wYWQnIHwgJ3N0ZXBwZWRfcGxpbnRoJyB8ICdkZWNrJztcblxuZXhwb3J0IGludGVyZmFjZSBCdWlsZGluZ1J1bGVzIHtcbiAgaWQ6IHN0cmluZztcbiAgd2lkdGg6IG51bWJlcjtcbiAgZGVwdGg6IG51bWJlcjtcbiAgd2FsbEhlaWdodDogbnVtYmVyO1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhdCBvciBiZWxvdyB0aGlzIG5lZWRzIG5vIGdyYWRpbmcgdG8gYmUgY2FsbGVkIHZhbGlkLiAqL1xuICBtYXhSZWxpZWZOb1ByZXA6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhYm92ZSB0aGlzIGNhbm5vdCBiZSBwcmVwYXJlZCBieSB0aGlzIGJ1aWxkaW5nIHR5cGUuICovXG4gIG1heFJlbGllZlByZXBhcmVkOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0Vm9sdW1lOiBudW1iZXI7XG4gIG1heEZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4T2JzdHJ1Y3Rpb25zOiBudW1iZXI7XG4gIHJlcXVpcmVzRHJ5OiBib29sZWFuO1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGNvbnN0IEhPVVNFX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ2hvdXNlLTh4NicsXG4gIHdpZHRoOiA4LFxuICBkZXB0aDogNixcbiAgd2FsbEhlaWdodDogMyxcbiAgY2xlYXJhbmNlOiAzLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDQuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDQ4LFxuICBtYXhGaWxsVm9sdW1lOiA0OCxcbiAgbWF4T2JzdHJ1Y3Rpb25zOiAwLFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ2dyYWRlZF9wYWQnLFxufTtcblxuZXhwb3J0IGNvbnN0IEZBUk1fUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAnZmFybS0xMng4JyxcbiAgd2lkdGg6IDEyLFxuICBkZXB0aDogOCxcbiAgd2FsbEhlaWdodDogMCxcbiAgY2xlYXJhbmNlOiAxLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDYuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDk2LFxuICBtYXhGaWxsVm9sdW1lOiA5NixcbiAgbWF4T2JzdHJ1Y3Rpb25zOiA0LFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ3N0ZXBwZWRfcGxpbnRoJyxcbn07XG5cbmV4cG9ydCBjb25zdCBQQVRIX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ3BhdGgtOXgzJyxcbiAgd2lkdGg6IDksXG4gIGRlcHRoOiAzLFxuICB3YWxsSGVpZ2h0OiAwLFxuICBjbGVhcmFuY2U6IDEsXG4gIG1heFJlbGllZk5vUHJlcDogMi4wLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNC4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDEsXG4gIG1heEZpbGw6IDEsXG4gIG1heEN1dFZvbHVtZTogMzIsXG4gIG1heEZpbGxWb2x1bWU6IDMyLFxuICBtYXhPYnN0cnVjdGlvbnM6IDIsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnZGVjaycsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVQcm9wb3NhbCB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdW1tYXJ5IHtcbiAgbmVlZHNHcmFkaW5nOiBib29sZWFuO1xuICBuZWVkc0NsZWFyaW5nOiBib29sZWFuO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbklkczogc3RyaW5nW107XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25UeXBlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVWYWxpZGF0aW9uIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgcXVlcnk6IEZvb3RwcmludFF1ZXJ5O1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25TdW1tYXJ5O1xufVxuXG5mdW5jdGlvbiBlcnJvcihjb2RlOiBWYWxpZGF0aW9uQ29kZSwgbWVzc2FnZTogc3RyaW5nLCB2YWx1ZT86IG51bWJlciwgbGltaXQ/OiBudW1iZXIpOiBWYWxpZGF0aW9uUmVhc29uIHtcbiAgcmV0dXJuIHsgY29kZSwgc2V2ZXJpdHk6ICdlcnJvcicsIG1lc3NhZ2UsIHZhbHVlLCBsaW1pdCB9O1xufVxuXG5mdW5jdGlvbiBwcmVwKGNvZGU6IFZhbGlkYXRpb25Db2RlLCBtZXNzYWdlOiBzdHJpbmcsIHZhbHVlPzogbnVtYmVyLCBsaW1pdD86IG51bWJlcik6IFZhbGlkYXRpb25SZWFzb24ge1xuICByZXR1cm4geyBjb2RlLCBzZXZlcml0eTogJ3ByZXBhcmF0aW9uJywgbWVzc2FnZSwgdmFsdWUsIGxpbWl0IH07XG59XG5cbi8qKlxuICogVmFsaWRhdGUgYSBwcm9wb3NlZCBzaXRlIGFnYWluc3QgaXRzIGJ1aWxkaW5nIHJ1bGVzLiBQdXJlOiBubyB2b3hlbHMsXG4gKiBlbnRpdGllcyBvciByZXNvdXJjZXMgY2hhbmdlLiBgcXVlcnlgIG1heSBiZSBzdXBwbGllZCBieSBhIHNlYXJjaCB0byByZXVzZVxuICogdGhlIGNhY2hlZCBjb2x1bW5zLCBhbmQgYGZvb3RwcmludGAgbWF5IGJlIHN1cHBsaWVkIHdoZW4gdGhlIGNhbGxlciBhbHJlYWR5XG4gKiBldmFsdWF0ZWQgdGhlIHNhbWUgcmVjdC9mbG9vciBwYWlyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVTaXRlKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCksXG4gIGZvb3RwcmludD86IEZvb3RwcmludFF1ZXJ5LFxuKTogU2l0ZVZhbGlkYXRpb24ge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgcnVsZXMgPSBwcm9wb3NhbC5ydWxlcztcbiAgY29uc3QgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdID0gW107XG4gIGNvbnN0IGZwID0gZm9vdHByaW50ID8/IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBwcm9wb3NhbC5mbG9vclkpO1xuICBjb25zdCBzdGF0cyA9IGZwLnN0YXRzO1xuXG4gIGlmIChyZWN0LngwIDwgLUhBTEYgfHwgcmVjdC56MCA8IC1IQUxGIHx8IHJlY3QueDEgPj0gSEFMRiB8fCByZWN0LnoxID49IEhBTEYpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoJ291dF9vZl9ib3VuZHMnLCBgZm9vdHByaW50ICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9IGlzIG91dHNpZGUgdGhlIHdvcmxkYCkpO1xuICB9XG4gIGlmIChyZWN0LngxIC0gcmVjdC54MCArIDEgIT09IHJ1bGVzLndpZHRoIHx8IHJlY3QuejEgLSByZWN0LnowICsgMSAhPT0gcnVsZXMuZGVwdGgpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZm9vdHByaW50X21pc21hdGNoJyxcbiAgICAgIGBmb290cHJpbnQgaXMgJHtyZWN0LngxIC0gcmVjdC54MCArIDF9IHggJHtyZWN0LnoxIC0gcmVjdC56MCArIDF9IG0sICR7cnVsZXMud2lkdGh9IHggJHtydWxlcy5kZXB0aH0gbSByZXF1aXJlZGAsXG4gICAgKSk7XG4gIH1cblxuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnc2xvcGVfZXhjZWVkZWQnLFxuICAgICAgYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCxcbiAgICAgIHN0YXRzLnJlbGllZiwgcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heFN0ZXAgPiBydWxlcy5tYXhTdGVwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3N0ZXBfZXhjZWVkZWQnLFxuICAgICAgYHN1cmZhY2Ugc3RlcCAke3N0YXRzLm1heFN0ZXB9IG0gZXhjZWVkcyAke3J1bGVzLm1heFN0ZXB9IG1gLFxuICAgICAgc3RhdHMubWF4U3RlcCwgcnVsZXMubWF4U3RlcCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4Q3V0ID4gcnVsZXMubWF4Q3V0KSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2N1dF9leGNlZWRlZCcsXG4gICAgICBgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gLFxuICAgICAgc3RhdHMubWF4Q3V0LCBydWxlcy5tYXhDdXQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEZpbGwgPiBydWxlcy5tYXhGaWxsKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfZXhjZWVkZWQnLFxuICAgICAgYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCxcbiAgICAgIHN0YXRzLm1heEZpbGwsIHJ1bGVzLm1heEZpbGwsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdjdXRfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBjdXQgdm9sdW1lICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXRWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuY3V0Vm9sdW1lLCBydWxlcy5tYXhDdXRWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuZmlsbFZvbHVtZSwgcnVsZXMubWF4RmlsbFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAocnVsZXMucmVxdWlyZXNEcnkgJiYgc3RhdHMud2F0ZXJDb2x1bW5zID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICd3YXRlcicsXG4gICAgICBgJHtzdGF0cy53YXRlckNvbHVtbnN9IGZvb3RwcmludCBjb2x1bW5zIGFyZSB1bmRlcndhdGVyYCxcbiAgICAgIHN0YXRzLndhdGVyQ29sdW1ucywgMCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IHJ1bGVzLm1heE9ic3RydWN0aW9ucykge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmb290cHJpbnRfb2JzdHJ1Y3RlZCcsXG4gICAgICBgJHtzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgZXhjZWVkIHRoZSAke3J1bGVzLm1heE9ic3RydWN0aW9uc30gYWxsb3dhbmNlYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuICBpZiAoZnAub3ZlcmhhbmdDZWxscy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ292ZXJoYW5nJyxcbiAgICAgIGAke2ZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RofSBjZWxscyBhYm92ZSB0aGUgZmxvb3IgYXJlIGJsb2NrZWRgLFxuICAgICAgZnAub3ZlcmhhbmdDZWxscy5sZW5ndGgsIDAsXG4gICAgKSk7XG4gIH1cblxuICBjb25zdCBuZWVkc0dyYWRpbmcgPSBzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZOb1ByZXBcbiAgICB8fCBzdGF0cy5jdXRWb2x1bWUgPiAwIHx8IHN0YXRzLmZpbGxWb2x1bWUgPiAwO1xuICBjb25zdCBuZWVkc0NsZWFyaW5nID0gc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDBcbiAgICAmJiBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoIDw9IHJ1bGVzLm1heE9ic3RydWN0aW9ucztcblxuICBpZiAobmVlZHNHcmFkaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfZ3JhZGluZycsXG4gICAgICBgZ3JhZGluZyByZXF1aXJlZDogJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgY3V0LCAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZmlsbGAsXG4gICAgICBzdGF0cy5jdXRWb2x1bWUgKyBzdGF0cy5maWxsVm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChuZWVkc0NsZWFyaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfY2xlYXJpbmcnLFxuICAgICAgYCR7c3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHRvIGNsZWFyYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuXG4gIGNvbnN0IGhhc0Vycm9yID0gcmVhc29ucy5zb21lKChyKSA9PiByLnNldmVyaXR5ID09PSAnZXJyb3InKTtcbiAgY29uc3QgaGFzUHJlcCA9IHJlYXNvbnMuc29tZSgocikgPT4gci5zZXZlcml0eSA9PT0gJ3ByZXBhcmF0aW9uJyk7XG4gIGNvbnN0IHN0YXRlOiBTaXRlU3RhdGUgPSBoYXNFcnJvciA/ICdpbnZhbGlkJyA6IGhhc1ByZXAgPyAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicgOiAndmFsaWQnO1xuXG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgc3RhdGUsXG4gICAgcmVhc29ucyxcbiAgICBxdWVyeTogZnAsXG4gICAgcHJlcGFyYXRpb246IHtcbiAgICAgIG5lZWRzR3JhZGluZyxcbiAgICAgIG5lZWRzQ2xlYXJpbmcsXG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgICBvYnN0cnVjdGlvbklkczogc3RhdHMub2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCksXG4gICAgICBmb3VuZGF0aW9uOiBydWxlcy5mb3VuZGF0aW9uLFxuICAgIH0sXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2FuZGlkYXRlIHNlYXJjaCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFNlYXJjaE9wdGlvbnMge1xuICAvKiogQ2FuZGlkYXRlIGdyaWQgc3RlcCBpbiBtZXRyZXMuIERlZmF1bHQgMi4gKi9cbiAgc3RlcD86IG51bWJlcjtcbiAgbWF4UmVzdWx0cz86IG51bWJlcjtcbiAgYW5jaG9yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBtYXhEaXN0YW5jZT86IG51bWJlcjtcbiAgLyoqIEhhcmQgY29uc3RyYWludDogY2FuZGlkYXRlIGNlbnRyZSBtdXN0IGxpZSB3aXRoaW4gdGhpcyByYWRpdXMgb2YgYSBwb2ludC4gKi9cbiAgbmVhcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IG1heERpc3RhbmNlOiBudW1iZXIgfTtcbiAgLyoqIERvIG5vdCByZXR1cm4gdHdvIGNhbmRpZGF0ZXMgd2hvc2UgZm9vdHByaW50cyBvdmVybGFwLiBEZWZhdWx0IHRydWUuICovXG4gIGRpc3RpbmN0PzogYm9vbGVhbjtcbiAgLyoqIFdhbGwtY2xvY2sgYnVkZ2V0IGZvciB0aGUgc2Nhbi4gRGVmYXVsdCAxMDAgbXMuICovXG4gIGJ1ZGdldE1zPzogbnVtYmVyO1xuICB3YWxrPzogV2Fsa1BhcmFtcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlQ2FuZGlkYXRlIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0ZTogJ3ZhbGlkJyB8ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJztcbiAgdmFsaWRhdGlvbjogU2l0ZVZhbGlkYXRpb247XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uQ291bnQ6IG51bWJlcjtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgc2NvcmU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY2FuZGlkYXRlczogU2l0ZUNhbmRpZGF0ZVtdO1xuICBldmFsdWF0ZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IG51bWJlcjtcbiAgZWxhcHNlZE1zOiBudW1iZXI7XG4gIGJ1ZGdldE1zOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhlIHdhbGwtY2xvY2sgYnVkZ2V0IHN0b3BwZWQgdGhlIHNjYW4gYmVmb3JlIHRoZSBhcmVhIHdhcyBleGhhdXN0ZWQuICovXG4gIHRydW5jYXRlZDogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZmxvb3JDYW5kaWRhdGVzKHN0YXRzOiBBcmVhU3RhdHMpOiBudW1iZXJbXSB7XG4gIGNvbnN0IG1lYW4gPSBNYXRoLnJvdW5kKHN0YXRzLm1lYW5ZKTtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGZvciAobGV0IGQgPSAtMTsgZCA8PSAxOyBkKyspIHNldC5hZGQobWVhbiArIGQpO1xuICBzZXQuYWRkKHN0YXRzLm1pblkpO1xuICBzZXQuYWRkKHN0YXRzLm1heFkpO1xuICByZXR1cm4gWy4uLnNldF0uZmlsdGVyKCh5KSA9PiB5ID49IFlfTUlOICYmIHkgPCBZX01BWCkuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xufVxuXG5mdW5jdGlvbiBvdmVybGFwcyhhOiBSZWN0LCBiOiBSZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejA7XG59XG5cbmZ1bmN0aW9uIGNhbmRpZGF0ZVNjb3JlKHY6IFNpdGVWYWxpZGF0aW9uLCBkaXN0YW5jZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgcHJlcFBlbmFsdHkgPSB2LnN0YXRlID09PSAndmFsaWQnID8gMCA6IDI1O1xuICBjb25zdCBncmFkaW5nID0gdi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUgKyB2LnByZXBhcmF0aW9uLmZpbGxWb2x1bWU7XG4gIGNvbnN0IGNsZWFyaW5nID0gdi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcy5sZW5ndGggKiA0O1xuICByZXR1cm4gcHJlcFBlbmFsdHkgKyBncmFkaW5nICsgY2xlYXJpbmcgKyBkaXN0YW5jZSAqIDAuMjU7XG59XG5cbi8qKlxuICogU2VhcmNoIGEgYm91bmRlZCBhcmVhIGZvciB2aWFibGUgZm9vdHByaW50cy4gVGhlIHNhbWUgdmFsaWRhdG9yIGFuZCB0aGUgc2FtZVxuICogZmxvb3Itc2VsZWN0aW9uIHBvbGljeSBhcmUgdXNlZCBieSB0aGUgQUkgYWdlbnQgYW5kIHRoZSBwbGF5ZXIncyBidWlsZFxuICogcHJldmlldy4gU2VhcmNoIGlzIHJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlYXJjaFNpdGVzKFxuICB3b3JsZDogV29ybGQsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzLCBhcmVhOiBSZWN0LCBvcHRpb25zOiBTZWFyY2hPcHRpb25zID0ge30sXG4pOiBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3Qgc3RlcCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3Iob3B0aW9ucy5zdGVwID8/IDIpKTtcbiAgY29uc3QgbWF4UmVzdWx0cyA9IE1hdGgubWF4KDEsIG9wdGlvbnMubWF4UmVzdWx0cyA/PyA4KTtcbiAgY29uc3QgZGlzdGluY3QgPSBvcHRpb25zLmRpc3RpbmN0ICE9PSBmYWxzZTtcbiAgY29uc3QgbWF4RGlzdGFuY2UgPSBvcHRpb25zLm1heERpc3RhbmNlID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgY29uc3QgYnVkZ2V0TXMgPSBvcHRpb25zLmJ1ZGdldE1zID8/IDEwMDtcbiAgY29uc3QgYW5jaG9yID0gb3B0aW9ucy5hbmNob3IgPz8geyB4OiAoYXJlYS54MCArIGFyZWEueDEpIC8gMiwgejogKGFyZWEuejAgKyBhcmVhLnoxKSAvIDIgfTtcbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgYWxsOiBTaXRlQ2FuZGlkYXRlW10gPSBbXTtcbiAgbGV0IGV2YWx1YXRlZCA9IDA7XG4gIGxldCByZWplY3RlZCA9IDA7XG4gIGxldCB0cnVuY2F0ZWQgPSBmYWxzZTtcblxuICBjb25zdCB4MU1heCA9IGFyZWEueDEgLSBydWxlcy53aWR0aCArIDE7XG4gIGNvbnN0IHoxTWF4ID0gYXJlYS56MSAtIHJ1bGVzLmRlcHRoICsgMTtcbiAgc2NhbjogZm9yIChsZXQgeiA9IGFyZWEuejA7IHogPD0gejFNYXg7IHogKz0gc3RlcCkge1xuICAgIGZvciAobGV0IHggPSBhcmVhLngwOyB4IDw9IHgxTWF4OyB4ICs9IHN0ZXApIHtcbiAgICAgIGNvbnN0IHJlY3QgPSB7IHgwOiB4LCB6MDogeiwgeDE6IHggKyBydWxlcy53aWR0aCAtIDEsIHoxOiB6ICsgcnVsZXMuZGVwdGggLSAxIH07XG4gICAgICBjb25zdCBjeCA9IChyZWN0LngwICsgcmVjdC54MSkgLyAyO1xuICAgICAgY29uc3QgY3ogPSAocmVjdC56MCArIHJlY3QuejEpIC8gMjtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIGFuY2hvci54LCBjeiAtIGFuY2hvci56KTtcbiAgICAgIGlmIChkaXN0YW5jZSA+IG1heERpc3RhbmNlKSBjb250aW51ZTtcbiAgICAgIGlmIChvcHRpb25zLm5lYXIpIHtcbiAgICAgICAgY29uc3QgbmVhckRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIG9wdGlvbnMubmVhci54LCBjeiAtIG9wdGlvbnMubmVhci56KTtcbiAgICAgICAgaWYgKG5lYXJEaXN0YW5jZSA+IG9wdGlvbnMubmVhci5tYXhEaXN0YW5jZSkgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0YXRzID0gcXVlcnkuYXJlYShyZWN0KTtcbiAgICAgIGxldCBiZXN0OiBTaXRlQ2FuZGlkYXRlIHwgbnVsbCA9IG51bGw7XG4gICAgICBmb3IgKGNvbnN0IGZsb29yWSBvZiBmbG9vckNhbmRpZGF0ZXMoc3RhdHMpKSB7XG4gICAgICAgIGV2YWx1YXRlZCsrO1xuICAgICAgICBjb25zdCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsID0ge1xuICAgICAgICAgIHNpdGVJZDogYCR7cnVsZXMuaWR9OiR7eH0sJHt6fSwke2Zsb29yWX1gLFxuICAgICAgICAgIHJlY3QsIGZsb29yWSwgcnVsZXMsXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGZvb3RwcmludCA9IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBmbG9vclkpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnksIGZvb3RwcmludCk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICAgICAgICByZWplY3RlZCsrO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNjb3JlID0gY2FuZGlkYXRlU2NvcmUodmFsaWRhdGlvbiwgZGlzdGFuY2UpO1xuICAgICAgICBjb25zdCBjYW5kaWRhdGU6IFNpdGVDYW5kaWRhdGUgPSB7XG4gICAgICAgICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgICAgICAgcmVjdCxcbiAgICAgICAgICBmbG9vclksXG4gICAgICAgICAgc3RhdGU6IHZhbGlkYXRpb24uc3RhdGUsXG4gICAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgICAgICBjdXRWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLFxuICAgICAgICAgIGZpbGxWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSxcbiAgICAgICAgICBvYnN0cnVjdGlvbkNvdW50OiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzLmxlbmd0aCxcbiAgICAgICAgICBkaXN0YW5jZSxcbiAgICAgICAgICBzY29yZSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFiZXN0XG4gICAgICAgICAgfHwgKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gJ3ZhbGlkJyAmJiBiZXN0LnN0YXRlICE9PSAndmFsaWQnKVxuICAgICAgICAgIHx8IChjYW5kaWRhdGUuc3RhdGUgPT09IGJlc3Quc3RhdGUgJiYgY2FuZGlkYXRlLnNjb3JlIDwgYmVzdC5zY29yZSkpIHtcbiAgICAgICAgICBiZXN0ID0gY2FuZGlkYXRlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYmVzdCkgYWxsLnB1c2goYmVzdCk7XG4gICAgfVxuICAgIGlmIChwZXJmb3JtYW5jZS5ub3coKSAtIHQwID4gYnVkZ2V0TXMpIHtcbiAgICAgIHRydW5jYXRlZCA9IHRydWU7XG4gICAgICBicmVhayBzY2FuO1xuICAgIH1cbiAgfVxuXG4gIGFsbC5zb3J0KChhLCBiKSA9PiBhLnNjb3JlIC0gYi5zY29yZSB8fCBhLmRpc3RhbmNlIC0gYi5kaXN0YW5jZVxuICAgIHx8IGEucmVjdC54MCAtIGIucmVjdC54MCB8fCBhLnJlY3QuejAgLSBiLnJlY3QuejApO1xuICBjb25zdCBzZWxlY3RlZDogU2l0ZUNhbmRpZGF0ZVtdID0gW107XG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGFsbCkge1xuICAgIGlmIChkaXN0aW5jdCAmJiBzZWxlY3RlZC5zb21lKChzKSA9PiBvdmVybGFwcyhzLnJlY3QsIGNhbmRpZGF0ZS5yZWN0KSkpIGNvbnRpbnVlO1xuICAgIHNlbGVjdGVkLnB1c2goY2FuZGlkYXRlKTtcbiAgICBpZiAoc2VsZWN0ZWQubGVuZ3RoID49IG1heFJlc3VsdHMpIGJyZWFrO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5kaWRhdGVzOiBzZWxlY3RlZCxcbiAgICBldmFsdWF0ZWQsXG4gICAgcmVqZWN0ZWQsXG4gICAgZWxhcHNlZE1zOiBNYXRoLnJvdW5kKChwZXJmb3JtYW5jZS5ub3coKSAtIHQwKSAqIDEwMCkgLyAxMDAsXG4gICAgYnVkZ2V0TXMsXG4gICAgdHJ1bmNhdGVkLFxuICB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHByZXZpZXcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBGb3VuZGF0aW9uUHJldmlldyB7XG4gIHR5cGU6IEZvdW5kYXRpb25UeXBlO1xuICAvKiogU3RvbmUgZmxvb3Igc2xhYiBwbHVzIGZpbGwgdW5kZXIgdGhlIHByZXBhcmVkIGZsb29yLiAqL1xuICBwbGludGhDZWxsczogbnVtYmVyO1xuICAvKiogUGVyaW1ldGVyIGNlbGxzIHRoYXQgbmVlZCBhIHJldGFpbmluZyBmYWNlIGJlY2F1c2Ugb2YgY3V0IG9yIGZpbGwuICovXG4gIHJldGFpbmluZ1dhbGxDZWxsczogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFjY2Vzc1ByZXZpZXcge1xuICBkb29yOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGRpc3RhbmNlOiBudW1iZXI7XG4gIGdyYWRlOiBudW1iZXI7XG4gIHdhbGthYmxlOiBib29sZWFuO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlUHJldmlldyB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgdGVycmFpbjoge1xuICAgIG1pblk6IG51bWJlcjtcbiAgICBtYXhZOiBudW1iZXI7XG4gICAgbWVhblk6IG51bWJlcjtcbiAgICByZWxpZWY6IG51bWJlcjtcbiAgICBtYXhTdGVwOiBudW1iZXI7XG4gICAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gICAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICAgIG1heEN1dDogbnVtYmVyO1xuICAgIG1heEZpbGw6IG51bWJlcjtcbiAgfTtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblByZXZpZXc7XG4gIG9ic3RydWN0aW9uczogQXJyYXk8e1xuICAgIGVudGl0eUlkOiBzdHJpbmc7XG4gICAga2luZDogc3RyaW5nO1xuICAgIHg6IG51bWJlcjtcbiAgICB6OiBudW1iZXI7XG4gICAgYWN0aW9uOiAnY2xlYXInIHwgJ2Jsb2NrZWQnO1xuICB9PjtcbiAgYWNjZXNzOiBBY2Nlc3NQcmV2aWV3IHwgbnVsbDtcbiAgLyoqIENvbXBsZXRlIHdvcmsgZW52ZWxvcGUgdGhpcyBwcmV2aWV3IHdvdWxkIGF1dGhvcml6ZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJldmlld09wdGlvbnMge1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgd2Fsaz86IFdhbGtQYXJhbXM7XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIHRocmVlLXN0YXRlIHByZXZpZXcuIEl0IGlzIGRlbGliZXJhdGVseSBkYXRhLW9ubHk6IHRoZSByZW5kZXJlclxuICogY2FuIGRyYXcgaXQsIGJ1dCBpdCBuZXZlciBlZGl0cyB0ZXJyYWluIG9yIHNwZW5kcyByZXNvdXJjZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmV2aWV3U2l0ZShcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmV2aWV3T3B0aW9ucyA9IHt9LFxuKTogU2l0ZVByZXZpZXcge1xuICBjb25zdCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpO1xuICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnkpO1xuICBjb25zdCBmcCA9IHZhbGlkYXRpb24ucXVlcnk7XG4gIGNvbnN0IHN0YXRzID0gZnAuc3RhdHM7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCBydWxlcyA9IHByb3Bvc2FsLnJ1bGVzO1xuXG4gIGxldCBwZXJpbWV0ZXIgPSAwO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgIGlmICh4ICE9PSByZWN0LngwICYmIHggIT09IHJlY3QueDEgJiYgeiAhPT0gcmVjdC56MCAmJiB6ICE9PSByZWN0LnoxKSBjb250aW51ZTtcbiAgICAgIGlmIChjb2x1bW5BdCh3b3JsZCwgeCwgeikuc3VyZmFjZVkgIT09IHByb3Bvc2FsLmZsb29yWSkgcGVyaW1ldGVyKys7XG4gICAgfVxuICB9XG4gIGNvbnN0IGZvdW5kYXRpb246IEZvdW5kYXRpb25QcmV2aWV3ID0ge1xuICAgIHR5cGU6IHJ1bGVzLmZvdW5kYXRpb24sXG4gICAgcGxpbnRoQ2VsbHM6IHJlY3RDb2x1bW5zKHJlY3QpICsgc3RhdHMuZmlsbFZvbHVtZSxcbiAgICByZXRhaW5pbmdXYWxsQ2VsbHM6IHBlcmltZXRlcixcbiAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICB9O1xuXG4gIGxldCBhY2Nlc3M6IEFjY2Vzc1ByZXZpZXcgfCBudWxsID0gbnVsbDtcbiAgaWYgKG9wdGlvbnMuZG9vciAmJiBvcHRpb25zLmFwcHJvYWNoKSB7XG4gICAgY29uc3QgZG9vciA9IG9wdGlvbnMuZG9vcjtcbiAgICBjb25zdCBhcHByb2FjaCA9IG9wdGlvbnMuYXBwcm9hY2g7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguaHlwb3QoZG9vci54IC0gYXBwcm9hY2gueCwgZG9vci56IC0gYXBwcm9hY2gueik7XG4gICAgY29uc3Qgc3RlcHMgPSBNYXRoLm1heCgxLCBNYXRoLmNlaWwoZGlzdGFuY2UpKTtcbiAgICBsZXQgcHJldlggPSBhcHByb2FjaC54LCBwcmV2WiA9IGFwcHJvYWNoLno7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gc3RlcHM7IGkrKykge1xuICAgICAgY29uc3QgdCA9IGkgLyBzdGVwcztcbiAgICAgIGNvbnN0IHggPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnggKyAoZG9vci54IC0gYXBwcm9hY2gueCkgKiB0KTtcbiAgICAgIGNvbnN0IHogPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnogKyAoZG9vci56IC0gYXBwcm9hY2gueikgKiB0KTtcbiAgICAgIGlmICh4ID09PSBwcmV2WCAmJiB6ID09PSBwcmV2WikgY29udGludWU7XG4gICAgICBjb25zdCByZXN1bHQgPSB3YWxrU3RlcCh3b3JsZCwgcHJldlgsIHByZXZaLCB4LCB6LCBvcHRpb25zLndhbGsgPz8gREVGQVVMVF9XQUxLKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZWFzb25zLnB1c2goYCR7cmVzdWx0LnJlYXNvbn0gYXQgJHt4fSwke3p9YCk7XG4gICAgICBwcmV2WCA9IHg7IHByZXZaID0gejtcbiAgICB9XG4gICAgYWNjZXNzID0ge1xuICAgICAgZG9vciwgYXBwcm9hY2gsIGRpc3RhbmNlLFxuICAgICAgZ3JhZGU6IGVmZmVjdGl2ZUdyYWRlKHdvcmxkLCBhcHByb2FjaC54LCBhcHByb2FjaC56LCBkb29yLngsIGRvb3IueiksXG4gICAgICB3YWxrYWJsZTogcmVhc29ucy5sZW5ndGggPT09IDAsXG4gICAgICByZWFzb25zLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB5MCA9IHByb3Bvc2FsLmZsb29yWSAtIE1hdGgubWF4KDEsIHN0YXRzLm1heEN1dCkgLSAxO1xuICBjb25zdCB5MSA9IHByb3Bvc2FsLmZsb29yWSArIE1hdGgubWF4KHJ1bGVzLndhbGxIZWlnaHQsIDEpICsgMTtcbiAgY29uc3QgZW52ZWxvcGU6IFZveGVsUmVnaW9uW10gPSBbXG4gICAge1xuICAgICAgLi4uZXhwYW5kUmVjdChyZWN0LCAyKSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgeTApLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgeTEpLFxuICAgIH0sXG4gIF07XG4gIGlmIChhY2Nlc3MpIHtcbiAgICBjb25zdCBheDAgPSBNYXRoLm1pbihhY2Nlc3MuZG9vci54LCBhY2Nlc3MuYXBwcm9hY2gueCkgLSAxO1xuICAgIGNvbnN0IGF4MSA9IE1hdGgubWF4KGFjY2Vzcy5kb29yLngsIGFjY2Vzcy5hcHByb2FjaC54KSArIDE7XG4gICAgY29uc3QgYXowID0gTWF0aC5taW4oYWNjZXNzLmRvb3IueiwgYWNjZXNzLmFwcHJvYWNoLnopIC0gMTtcbiAgICBjb25zdCBhejEgPSBNYXRoLm1heChhY2Nlc3MuZG9vci56LCBhY2Nlc3MuYXBwcm9hY2gueikgKyAxO1xuICAgIGNvbnN0IGFNaW4gPSBNYXRoLm1pbihzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGNvbnN0IGFNYXggPSBNYXRoLm1heChzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGVudmVsb3BlLnB1c2goe1xuICAgICAgeDA6IGF4MCwgeDE6IGF4MSwgejA6IGF6MCwgejE6IGF6MSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgYU1pbiAtIDIpLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgYU1heCArIDIpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICBzdGF0ZTogdmFsaWRhdGlvbi5zdGF0ZSxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIHJ1bGVzLFxuICAgIHJlYXNvbnM6IHZhbGlkYXRpb24ucmVhc29ucyxcbiAgICB0ZXJyYWluOiB7XG4gICAgICBtaW5ZOiBzdGF0cy5taW5ZLFxuICAgICAgbWF4WTogc3RhdHMubWF4WSxcbiAgICAgIG1lYW5ZOiBzdGF0cy5tZWFuWSxcbiAgICAgIHJlbGllZjogc3RhdHMucmVsaWVmLFxuICAgICAgbWF4U3RlcDogc3RhdHMubWF4U3RlcCxcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICB9LFxuICAgIGZvdW5kYXRpb24sXG4gICAgb2JzdHJ1Y3Rpb25zOiBzdGF0cy5vYnN0cnVjdGlvbnMubWFwKChvKSA9PiAoe1xuICAgICAgZW50aXR5SWQ6IG8uZW50aXR5SWQsXG4gICAgICBraW5kOiBvLmtpbmQsXG4gICAgICB4OiBvLngsXG4gICAgICB6OiBvLnosXG4gICAgICBhY3Rpb246IHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJyA/ICdibG9ja2VkJyA6ICdjbGVhcicsXG4gICAgfSkpLFxuICAgIGFjY2VzcyxcbiAgICBlbnZlbG9wZSxcbiAgfTtcbn1cblxuIiwgIi8vIE0wMDIgc3RhZ2UgMzogYm91bmRlZCwgYXV0aG9yaXplZCB0ZXJyYWluIHByZXBhcmF0aW9uLlxuLy9cbi8vIFRoZSBwaXBlbGluZSBpcyBkZWxpYmVyYXRlbHkgb25lLXdheSBhbmQgc2hhcmVkIGJ5IHRoZSBwbGF5ZXIgYW5kIHRoZSBBSTpcbi8vXG4vLyAgIHByb3Bvc2FsIC0+IHZhbGlkYXRlU2l0ZSAtPiBwbGFuUHJlcGFyYXRpb24gLT4gQXV0aG9yaXplciAtPiBleGVjdXRlXG4vL1xuLy8gYGV4ZWN1dGVQcmVwYXJhdGlvbmAgaXMgdGhlIG9ubHkgZnVuY3Rpb24gaW4gTTAwMiB0aGF0IGVkaXRzIHRlcnJhaW4gZm9yXG4vLyBjb25zdHJ1Y3Rpb24uIEl0IHJlZnVzZXMgdG8gcnVuIHdpdGhvdXQgYW4gYXV0aG9yaXphdGlvbiB0b2tlbiB3aG9zZSBkaWdlc3Rcbi8vIG1hdGNoZXMgdGhlIHBsYW4sIHdob3NlIGVudmVsb3BlIGNvdmVycyBldmVyeSB2b3hlbCBpdCB3b3VsZCB0b3VjaCwgYW5kIHdob3NlXG4vLyBiYXNlIHJldmlzaW9uIHN0aWxsIG1hdGNoZXMgdGhlIHdvcmxkLiBBbGwgZWRpdHMgYXJlIGNvbXB1dGVkIGFuZCBjaGVja2VkXG4vLyBiZWZvcmUgdGhlIGZpcnN0IGJ5dGUgaXMgd3JpdHRlbiwgc28gYSByZWplY3RlZCBwbGFuIGNhbm5vdCBsZWF2ZSBhIHBhcnRpYWxcbi8vIHBhZCBiZWhpbmQuXG4vL1xuLy8gVGhlIGF1dGhvcml6ZXIgaW4gdGhpcyBmaWxlIGlzIGEgbG9jYWwgcG9saWN5IHN0dWIuIEl0IHByb3ZlcyB0aGF0IHRoZVxuLy8gcGlwZWxpbmUgYW5kIHRoZSBlbnZlbG9wZSBjaGVja3MgZXhpc3Q7IGl0IGlzIE5PVCBNYWdpY0Jsb2NrIGVuZm9yY2VtZW50LlxuLy8gTm8gY2hhaW4gcHJvZ3JhbSwgU0RLIGNhbGwsIHNldHRsZW1lbnQgb3Igcm9sbGJhY2sgZ3VhcmFudGVlIGlzIHByZXNlbnQuXG5pbXBvcnQge1xuICBXb3JsZCwgTUFULCBNYXRJZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBpc1NvbGlkLFxuICBnZXRWb3hlbCwgc2V0Vm94ZWwsIHJlbW92ZUVudGl0eSwgc3VyZmFjZUF0LFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgRW50aXR5S2luZCwgUmVzb3VyY2VUeXBlLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBub3JtYWxpemVSZWN0LCByZWN0Q29sdW1ucywgZXhwYW5kUmVjdCxcbiAgZW52ZWxvcGVDb250YWlucywgb2JzdHJ1Y3Rpb25zSW4sXG59IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQge1xuICBTaXRlUHJvcG9zYWwsIFNpdGVWYWxpZGF0aW9uLCBCdWlsZGluZ1J1bGVzLCB2YWxpZGF0ZVNpdGUsXG59IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIGludmVudG9yeVNuYXBzaG90LCBub3JtYWxpemVFbnZlbG9wZSxcbn0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTE9DQUxfQVVUSE9SSVRZID0gJ2xvY2FsLXN0dWInIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IExPQ0FMX0VORk9SQ0VNRU5UID0gJ2xvY2FsLXNpbXVsYXRpb24tb25seScgYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29sdW1uVGFyZ2V0IHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQbGFuRXhwZWN0YXRpb24ge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbnM6IG51bWJlcjtcbiAgc3VyZmFjZUVkaXRzOiBudW1iZXI7XG4gIHRvdGFsRWRpdHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblBsYW4ge1xuICBpZDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICAvKiogRXhhY3RseSBvbmUgdGFyZ2V0IHdhbGtpbmcgaGVpZ2h0IHBlciBmb290cHJpbnQgY29sdW1uLCBzb3J0ZWQgYnkgeiwgeC4gKi9cbiAgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBBdXRob3JpdGF0aXZlIGVudGl0eSBpZHMgdGhpcyBwbGFuIG1heSByZW1vdmUuICovXG4gIGNsZWFyRW50aXR5SWRzOiBzdHJpbmdbXTtcbiAgLyoqIE1hdGVyaWFsIGZvciB0aGUgdG9wIHNvbGlkIHZveGVsIGFmdGVyIGdyYWRpbmcsIG9yIG51bGwgdG8ga2VlcCBpdC4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsOiBNYXRJZCB8IG51bGw7XG4gIC8qKiBUaWdodCBlbnZlbG9wZSBjb3ZlcmluZyBldmVyeSBwbGFubmVkIHZveGVsIGNoYW5nZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGV4cGVjdGVkOiBQbGFuRXhwZWN0YXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25PcHRpb25zIHtcbiAgLyoqIFBlci1jb2x1bW4gdGFyZ2V0cyBmb3IgdGVycmFjZXMgb3Igc3RlcHBlZCBwYXRocy4gRGVmYXVsdHMgdG8gZmxvb3JZLiAqL1xuICB0YXJnZXRzPzogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBgbm9uZWAgaXMgb25seSBsZWdhbCB3aGVuIHRoZSBzaXRlIGhhcyBubyBvYnN0cnVjdGlvbnMuICovXG4gIGNsZWFyPzogJ29ic3RydWN0aW9ucycgfCAnbm9uZSc7XG4gIC8qKiBTZXQgdGhlIHRvcCBzb2xpZCB2b3hlbCBvZiBldmVyeSB0YXJnZXQgY29sdW1uIChwYXRocywgZmllbGRzKS4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsPzogTWF0SWQ7XG4gIC8qKiBFeHBsaWNpdCB3b3JrIGVudmVsb3BlLiBEZWZhdWx0cyB0byBhIHRpZ2h0IGVudmVsb3BlIGFyb3VuZCB0aGUgZWRpdHMuICovXG4gIGVudmVsb3BlPzogVm94ZWxSZWdpb25bXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBzdGFibGUgZGlnZXN0IC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRpZ2VzdChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1O1xuICBsZXQgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5wdXQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gaW5wdXQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuLyoqIERpZ2VzdCBvZiBldmVyeXRoaW5nIHRoYXQgY2hhbmdlcyB0aGUgc2V0IG9mIGVkaXRzIG9yIHJlbW92YWxzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5EaWdlc3QocGxhbjogUHJlcGFyYXRpb25QbGFuKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgICdtMDAyOnByZXAtcGxhbjp2MScsXG4gICAgcGxhbi5zaXRlSWQsXG4gICAgYCR7cGxhbi5yZWN0LngwfSwke3BsYW4ucmVjdC56MH0sJHtwbGFuLnJlY3QueDF9LCR7cGxhbi5yZWN0LnoxfWAsXG4gICAgU3RyaW5nKHBsYW4uZmxvb3JZKSxcbiAgICBwbGFuLnJ1bGVzLmlkLFxuICAgIFN0cmluZyhwbGFuLnRhcmdldHMubGVuZ3RoKSxcbiAgICBwbGFuLnN1cmZhY2VNYXRlcmlhbCA9PT0gbnVsbCA/ICdzdXJmYWNlOmtlZXAnIDogYHN1cmZhY2U6JHtwbGFuLnN1cmZhY2VNYXRlcmlhbH1gLFxuICBdO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSBsaW5lcy5wdXNoKGB0OiR7dC54fSwke3Quen0sJHt0Lnl9YCk7XG4gIGNvbnN0IGNsZWFycyA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGxpbmVzLnB1c2goYGM6JHtjbGVhcnMubGVuZ3RofWApO1xuICBmb3IgKGNvbnN0IGlkIG9mIGNsZWFycykgbGluZXMucHVzaChgYzoke2lkfWApO1xuICBmb3IgKGNvbnN0IGUgb2Ygbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSkpIHtcbiAgICBsaW5lcy5wdXNoKGBlOiR7ZS54MH0sJHtlLnowfSwke2UueTB9LCR7ZS54MX0sJHtlLnoxfSwke2UueTF9YCk7XG4gIH1cbiAgY29uc3QgeCA9IHBsYW4uZXhwZWN0ZWQ7XG4gIGxpbmVzLnB1c2goYHg6JHt4LmN1dFZvbHVtZX0sJHt4LmZpbGxWb2x1bWV9LCR7eC5tYXhDdXR9LCR7eC5tYXhGaWxsfSwke3gub2JzdHJ1Y3Rpb25zfSwke3guc3VyZmFjZUVkaXRzfSwke3gudG90YWxFZGl0c31gKTtcbiAgcmV0dXJuIGRpZ2VzdChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGxhbm5pbmcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBQbGFuU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBQcmVwYXJhdGlvblBsYW47XG4gIHZhbGlkYXRpb246IFNpdGVWYWxpZGF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgc3RhZ2U6ICdwbGFuJyB8ICdhdXRob3JpemUnIHwgJ2V4ZWN1dGUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xuICB2YWxpZGF0aW9uPzogU2l0ZVZhbGlkYXRpb247XG59XG5cbmV4cG9ydCB0eXBlIFBsYW5SZXN1bHQgPSBQbGFuU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldHMod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3Qgb3V0OiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIG91dC5wdXNoKHsgeCwgeiwgeTogZmxvb3JZIH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHNvcnRlZFRhcmdldHModGFyZ2V0czogcmVhZG9ubHkgQ29sdW1uVGFyZ2V0W10pOiBDb2x1bW5UYXJnZXRbXSB7XG4gIHJldHVybiBbLi4udGFyZ2V0c10uc29ydCgoYSwgYikgPT4gYS56IC0gYi56IHx8IGEueCAtIGIueCB8fCBhLnkgLSBiLnkpO1xufVxuXG5pbnRlcmZhY2UgVGFyZ2V0U3RhdHMge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICByZWxpZWY6IG51bWJlcjtcbn1cblxuLyoqIEN1dC9maWxsIGltcGxpZWQgYnkgZXhwbGljaXQgdGFyZ2V0cywgaW5kZXBlbmRlbnQgb2YgdGhlIGZsYXQgZmxvb3JZLiAqL1xuZnVuY3Rpb24gdGFyZ2V0U3RhdHMod29ybGQ6IFdvcmxkLCB0YXJnZXRzOiByZWFkb25seSBDb2x1bW5UYXJnZXRbXSk6IFRhcmdldFN0YXRzIHtcbiAgbGV0IGN1dFZvbHVtZSA9IDAsIGZpbGxWb2x1bWUgPSAwLCBtYXhDdXQgPSAwLCBtYXhGaWxsID0gMDtcbiAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBzdXJmYWNlLCB0LnkpO1xuICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBzdXJmYWNlLCB0LnkpO1xuICAgIGlmIChzdXJmYWNlID4gdC55KSB7XG4gICAgICBjb25zdCBkID0gc3VyZmFjZSAtIHQueTtcbiAgICAgIGN1dFZvbHVtZSArPSBkO1xuICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkKTtcbiAgICB9IGVsc2UgaWYgKHN1cmZhY2UgPCB0LnkpIHtcbiAgICAgIGNvbnN0IGQgPSB0LnkgLSBzdXJmYWNlO1xuICAgICAgZmlsbFZvbHVtZSArPSBkO1xuICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIGQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4geyBjdXRWb2x1bWUsIGZpbGxWb2x1bWUsIG1heEN1dCwgbWF4RmlsbCwgcmVsaWVmOiBtYXhZIC0gbWluWSB9O1xufVxuXG5mdW5jdGlvbiB0YXJnZXRSdWxlUmVhc29ucyhzdGF0czogVGFyZ2V0U3RhdHMsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzKTogc3RyaW5nW10ge1xuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEN1dCA+IHJ1bGVzLm1heEN1dCkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4RmlsbCA+IHJ1bGVzLm1heEZpbGwpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0IHZvbHVtZSAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4Q3V0Vm9sdW1lfSBtXHUwMEIzYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgKTtcbiAgfVxuICByZXR1cm4gcmVhc29ucztcbn1cblxuLyoqXG4gKiBUdXJuIGEgcHJvcG9zYWwgaW50byBhbiBleHBsaWNpdCwgY2hlY2thYmxlIHBsYW4uIFJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5QcmVwYXJhdGlvbihcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwpO1xuXG4gIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICdzaXRlX2ludmFsaWQnLFxuICAgICAgcmVhc29uczogdmFsaWRhdGlvbi5yZWFzb25zLm1hcCgocikgPT4gYCR7ci5jb2RlfTogJHtyLm1lc3NhZ2V9YCksXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB0YXJnZXRzID0gc29ydGVkVGFyZ2V0cyhvcHRpb25zLnRhcmdldHMgPz8gZGVmYXVsdFRhcmdldHMod29ybGQsIHJlY3QsIHByb3Bvc2FsLmZsb29yWSkpO1xuICBjb25zdCBjb2x1bW5zID0gcmVjdENvbHVtbnMocmVjdCk7XG4gIGlmICh0YXJnZXRzLmxlbmd0aCAhPT0gY29sdW1ucykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3RhcmdldF9jb3VudCcsXG4gICAgICByZWFzb25zOiBbYHBsYW4gaGFzICR7dGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZm9yICR7Y29sdW1uc30gY29sdW1uc2BdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG5cbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IGtleSA9IGAke3QueH0sJHt0Lnp9YDtcbiAgICBpZiAoc2Vlbi5oYXMoa2V5KSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAnZHVwbGljYXRlX3RhcmdldCcsXG4gICAgICAgIHJlYXNvbnM6IFtgZHVwbGljYXRlIHRhcmdldCBhdCAke2tleX1gXSwgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICAgIHNlZW4uYWRkKGtleSk7XG4gICAgaWYgKHQueCA8IHJlY3QueDAgfHwgdC54ID4gcmVjdC54MSB8fCB0LnogPCByZWN0LnowIHx8IHQueiA+IHJlY3QuejEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9vdXRzaWRlX2Zvb3RwcmludCcsXG4gICAgICAgIHJlYXNvbnM6IFtgdGFyZ2V0ICR7a2V5fSBpcyBvdXRzaWRlICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9YF0sXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIodC55KSB8fCB0LnkgPCBZX01JTiB8fCB0LnkgPj0gWV9NQVgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9oZWlnaHQnLFxuICAgICAgICByZWFzb25zOiBbYHRhcmdldCAke2tleX0gaGFzIGludmFsaWQgaGVpZ2h0ICR7dC55fWBdLCB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzO1xuICBjb25zdCBjbGVhciA9IG9wdGlvbnMuY2xlYXIgPz8gJ29ic3RydWN0aW9ucyc7XG4gIGlmIChjbGVhciA9PT0gJ25vbmUnICYmIG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAndW5jbGVhcmVkX29ic3RydWN0aW9ucycsXG4gICAgICByZWFzb25zOiBbYCR7b2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHdvdWxkIHJlbWFpbmBdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG4gIGNvbnN0IGNsZWFyRW50aXR5SWRzID0gY2xlYXIgPT09ICdub25lJyA/IFtdIDogWy4uLm5ldyBTZXQob2JzdHJ1Y3Rpb25zKV0uc29ydCgpO1xuICBjb25zdCBzdXJmYWNlTWF0ZXJpYWwgPSBvcHRpb25zLnN1cmZhY2VNYXRlcmlhbCA/PyBudWxsO1xuXG4gIGNvbnN0IGN1c3RvbVRhcmdldHMgPSBvcHRpb25zLnRhcmdldHMgIT09IHVuZGVmaW5lZDtcbiAgY29uc3Qgc3RhdHMgPSBjdXN0b21UYXJnZXRzXG4gICAgPyB0YXJnZXRTdGF0cyh3b3JsZCwgdGFyZ2V0cylcbiAgICA6IHtcbiAgICAgIGN1dFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhGaWxsLFxuICAgICAgcmVsaWVmOiB2YWxpZGF0aW9uLnF1ZXJ5LnN0YXRzLnJlbGllZixcbiAgICB9O1xuICBpZiAoY3VzdG9tVGFyZ2V0cykge1xuICAgIGNvbnN0IHJlYXNvbnMgPSB0YXJnZXRSdWxlUmVhc29ucyhzdGF0cywgcHJvcG9zYWwucnVsZXMpO1xuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgICAgY29kZTogJ3RhcmdldF9ydWxlcycsXG4gICAgICAgIHJlYXNvbnMsXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGxldCBsbyA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgbGV0IGhpID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBsbyA9IE1hdGgubWluKGxvLCBzdXJmYWNlLCB0LnkpO1xuICAgIGhpID0gTWF0aC5tYXgoaGksIHN1cmZhY2UgLSAxLCB0LnkgLSAxKTtcbiAgfVxuICBjb25zdCBidWZmZXJlZCA9IGV4cGFuZFJlY3QocmVjdCwgMSk7XG4gIGNvbnN0IGRlcml2ZWQ6IFZveGVsUmVnaW9uID0ge1xuICAgIHgwOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQueDApLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQuejApLFxuICAgIHgxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQueDEpLFxuICAgIHoxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQuejEpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgbG8gLSAxKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBoaSArIDEpLFxuICB9O1xuICAvLyBBbiBleHBsaWNpdCBlbnZlbG9wZSByZXBsYWNlcyB0aGUgZGVyaXZlZCBvbmUuIENhbGxlcnMgdGhhdCBwaW4gYW4gZXhhY3RcbiAgLy8gd29yayBlbnZlbG9wZSAocGF0aCBwcmVwYXJhdGlvbikgbXVzdCBub3Qgc2lsZW50bHkgd2lkZW4gaXQgd2l0aCB0aGVcbiAgLy8gZGVmYXVsdCAxIG0gYnVmZmVyLlxuICBjb25zdCBlbnZlbG9wZSA9IG5vcm1hbGl6ZUVudmVsb3BlKG9wdGlvbnMuZW52ZWxvcGUgPz8gW2Rlcml2ZWRdKTtcbiAgY29uc3Qgc3VyZmFjZUVkaXRzID0gc3VyZmFjZU1hdGVyaWFsID09PSBudWxsID8gMCA6IHRhcmdldHMubGVuZ3RoO1xuXG4gIGNvbnN0IHBsYW46IFByZXBhcmF0aW9uUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBydWxlczogcHJvcG9zYWwucnVsZXMsXG4gICAgdGFyZ2V0cyxcbiAgICBjbGVhckVudGl0eUlkcyxcbiAgICBzdXJmYWNlTWF0ZXJpYWwsXG4gICAgZW52ZWxvcGUsXG4gICAgZXhwZWN0ZWQ6IHtcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICAgIG9ic3RydWN0aW9uczogY2xlYXJFbnRpdHlJZHMubGVuZ3RoLFxuICAgICAgc3VyZmFjZUVkaXRzLFxuICAgICAgdG90YWxFZGl0czogc3RhdHMuY3V0Vm9sdW1lICsgc3RhdHMuZmlsbFZvbHVtZSArIHN1cmZhY2VFZGl0cyxcbiAgICB9LFxuICB9O1xuICBwbGFuLmlkID0gYHByZXA6JHtwbGFuRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCB2YWxpZGF0aW9uIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gYXV0aG9yaXphdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25MaW1pdHMge1xuICBtYXhDdXRWb2x1bWU6IG51bWJlcjtcbiAgbWF4RmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhWb3hlbEVkaXRzOiBudW1iZXI7XG4gIG1heEVudGl0eVJlbW92YWxzOiBudW1iZXI7XG4gIG1heFRhcmdldHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTElNSVRTOiBBdXRob3JpemF0aW9uTGltaXRzID0ge1xuICBtYXhDdXRWb2x1bWU6IDI1NixcbiAgbWF4RmlsbFZvbHVtZTogMjU2LFxuICBtYXhWb3hlbEVkaXRzOiAxMDI0LFxuICBtYXhFbnRpdHlSZW1vdmFsczogMTYsXG4gIG1heFRhcmdldHM6IDUxMixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ya0F1dGhvcml6YXRpb24ge1xuICBpZDogc3RyaW5nO1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGJhc2VSZXZpc2lvbjogbnVtYmVyO1xuICBsaW1pdHM6IEF1dGhvcml6YXRpb25MaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgb2s6IGJvb2xlYW47XG4gIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uIHwgbnVsbDtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvblBvbGljeSB7XG4gIC8qKiBUaGUgb25seSByZWdpb25zIHRoaXMgZ292ZXJub3IgcGVybWl0cyBmb3IgdGhlIGZpcnN0IHNsaWNlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgbGltaXRzPzogUGFydGlhbDxBdXRob3JpemF0aW9uTGltaXRzPjtcbn1cblxuZnVuY3Rpb24gcmVnaW9uQ29udGFpbmVkKHJlZ2lvbjogVm94ZWxSZWdpb24sIHBvbGljeTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IGJvb2xlYW4ge1xuICByZXR1cm4gcG9saWN5LnNvbWUoKHApID0+IHJlZ2lvbi54MCA+PSBwLngwICYmIHJlZ2lvbi54MSA8PSBwLngxXG4gICAgJiYgcmVnaW9uLnowID49IHAuejAgJiYgcmVnaW9uLnoxIDw9IHAuejFcbiAgICAmJiByZWdpb24ueTAgPj0gcC55MCAmJiByZWdpb24ueTEgPD0gcC55MSk7XG59XG5cbi8qKlxuICogTG9jYWwgZ292ZXJub3Igc3R1Yi4gSXQgZW5mb3JjZXMgYSBmaXhlZCBlbnZlbG9wZSBhbmQgaGFyZCB2b2x1bWUgbGltaXRzLFxuICogYmluZHMgYSB0b2tlbiB0byB0aGUgZXhhY3QgcGxhbiBkaWdlc3QgYW5kIHdvcmxkIHJldmlzaW9uLCBhbmQgcmVmdXNlcyB0b1xuICogcHJldGVuZCBpdCBpcyBhbiBvbi1jaGFpbiBhdXRob3JpdHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2NhbEF1dGhvcml6ZXIge1xuICByZWFkb25seSBhdXRob3JpdHkgPSBMT0NBTF9BVVRIT1JJVFk7XG4gIHJlYWRvbmx5IGVuZm9yY2VtZW50ID0gTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHJlYWRvbmx5IGxpbWl0czogQXV0aG9yaXphdGlvbkxpbWl0cztcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBwb2xpY3k6IEF1dGhvcml6YXRpb25Qb2xpY3kpIHtcbiAgICB0aGlzLmxpbWl0cyA9IHsgLi4uREVGQVVMVF9MSU1JVFMsIC4uLihwb2xpY3kubGltaXRzID8/IHt9KSB9O1xuICB9XG5cbiAgYXV0aG9yaXplKHdvcmxkOiBXb3JsZCwgcGxhbjogUHJlcGFyYXRpb25QbGFuKTogQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHBsYW4ucmVjdCk7XG5cbiAgICBpZiAocGxhbi50YXJnZXRzLmxlbmd0aCAhPT0gcmVjdENvbHVtbnMocmVjdCkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbiBoYXMgJHtwbGFuLnRhcmdldHMubGVuZ3RofSB0YXJnZXRzIGZvciAke3JlY3RDb2x1bW5zKHJlY3QpfSBjb2x1bW5zYCk7XG4gICAgfVxuICAgIGlmIChwbGFuLnRhcmdldHMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4VGFyZ2V0cykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4udGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4VGFyZ2V0c31gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lID4gdGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgICByZWFzb25zLnB1c2goYGN1dCAke3BsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC5maWxsVm9sdW1lID4gdGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBmaWxsICR7cGxhbi5leHBlY3RlZC5maWxsVm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZX1gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQudG90YWxFZGl0cyA+IHRoaXMubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbm5lZCBlZGl0cyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFscykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgICB9XG4gICAgaWYgKG5ldyBTZXQocGxhbi5jbGVhckVudGl0eUlkcykuc2l6ZSAhPT0gcGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGgpIHtcbiAgICAgIHJlYXNvbnMucHVzaCgnZHVwbGljYXRlIGVudGl0eSByZW1vdmFsIGlkcycpO1xuICAgIH1cblxuICAgIGlmIChwbGFuLmVudmVsb3BlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyB3b3JrIGVudmVsb3BlJyk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcmVnaW9uIG9mIHBsYW4uZW52ZWxvcGUpIHtcbiAgICAgIGlmICghcmVnaW9uQ29udGFpbmVkKHJlZ2lvbiwgdGhpcy5wb2xpY3kuZW52ZWxvcGUpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgZW52ZWxvcGUgJHtyZWdpb24ueDB9LCR7cmVnaW9uLnowfSwke3JlZ2lvbi55MH0uLiR7cmVnaW9uLngxfSwke3JlZ2lvbi56MX0sJHtyZWdpb24ueTF9IGlzIG91dHNpZGUgdGhlIGxvY2FsIHBvbGljeWApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSB7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgdC54LCB0LnksIHQueilcbiAgICAgICAgfHwgKHQueSA+IFlfTUlOICYmICFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHQueCwgdC55IC0gMSwgdC56KSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGB0YXJnZXQgJHt0Lnh9LCR7dC56fSwke3QueX0gaXMgbm90IGNvdmVyZWQgYnkgdGhlIHdvcmsgZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFdmVyeSBvYnN0cnVjdGlvbiBjdXJyZW50bHkgb24gdGhlIGZvb3RwcmludCBtdXN0IGJlIGluIHRoZSBwbGFuLCBhbmRcbiAgICAvLyB0aGUgcGxhbiBtYXkgbm90IHJlbW92ZSBhbnl0aGluZyB0aGF0IGlzIG5vdCBhbiBvYnN0cnVjdGlvbiB0aGVyZS5cbiAgICBjb25zdCBjdXJyZW50ID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLm1hcCgobykgPT4gby5lbnRpdHlJZCkuc29ydCgpO1xuICAgIGNvbnN0IHBsYW5uZWQgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICAgIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW4gcmVtb3ZhbHMgWyR7cGxhbm5lZC5qb2luKCcsJyl9XSBkbyBub3QgbWF0Y2ggZm9vdHByaW50IG9ic3RydWN0aW9ucyBbJHtjdXJyZW50LmpvaW4oJywnKX1dYCk7XG4gICAgfVxuXG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBhdXRob3JpemF0aW9uOiBudWxsLCByZWFzb25zIH07XG5cbiAgICBjb25zdCB0b2tlbjogV29ya0F1dGhvcml6YXRpb24gPSB7XG4gICAgICBpZDogYGxvY2FsLXN0dWI6JHtwbGFuRGlnZXN0KHBsYW4pfWAsXG4gICAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICAgIHBsYW5EaWdlc3Q6IHBsYW5EaWdlc3QocGxhbiksXG4gICAgICBlbnZlbG9wZTogbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSksXG4gICAgICBiYXNlUmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgICAgbGltaXRzOiB7IC4uLnRoaXMubGltaXRzIH0sXG4gICAgfTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgYXV0aG9yaXphdGlvbjogdG9rZW4sIHJlYXNvbnM6IFtdIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBleGVjdXRpb24gLS0tLS0tLS0tLVxuaW50ZXJmYWNlIFBlbmRpbmdFZGl0IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgYmVmb3JlOiBNYXRJZDtcbiAgYWZ0ZXI6IE1hdElkO1xuICAvKiogVHJ1ZSBmb3IgYSBtYXRlcmlhbC1vbmx5IHRvcC1zdXJmYWNlIGNoYW5nZS4gKi9cbiAgc3VyZmFjZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGNoYW5nZWQ6IG51bWJlcjtcbiAgYWRkZWQ6IG51bWJlcjtcbiAgcmVtb3ZlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsZWFyZWRFbnRpdHkge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgYW1vdW50OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25MZWRnZXIge1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIGF1dGhvcml6YXRpb25JZDogc3RyaW5nO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbmV0U3BvaWw6IG51bWJlcjtcbiAgYm9ycm93ZWRGaWxsOiBudW1iZXI7XG4gIGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGZpbGxCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB2b3hlbEVkaXRzOiBudW1iZXI7XG4gIHN1cmZhY2VFZGl0czogbnVtYmVyO1xuICBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXTtcbiAgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBjaHVua0RlbHRhczogQ2h1bmtEZWx0YVtdO1xuICByZXZpc2lvbkJlZm9yZTogbnVtYmVyO1xuICByZXZpc2lvbkFmdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFByZXBhcmF0aW9uUGxhbjtcbiAgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb247XG4gIGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXI7XG59XG5cbmV4cG9ydCB0eXBlIFByZXBhcmF0aW9uT3V0Y29tZSA9IFByZXBhcmF0aW9uU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuY29uc3QgTUFURVJJQUxfTkFNRVM6IFJlY29yZDxudW1iZXIsIHN0cmluZz4gPSB7XG4gIFtNQVQuR1JBU1NdOiAnZ3Jhc3MnLFxuICBbTUFULlNPSUxdOiAnc29pbCcsXG4gIFtNQVQuU0FORF06ICdzYW5kJyxcbiAgW01BVC5HUkFWRUxdOiAnZ3JhdmVsJyxcbiAgW01BVC5TVE9ORV06ICdzdG9uZScsXG4gIFtNQVQuT1JFXTogJ29yZScsXG4gIFtNQVQuV0FURVJdOiAnd2F0ZXInLFxuICBbTUFULkJFRFJPQ0tdOiAnYmVkcm9jaycsXG4gIFtNQVQuTU9TU106ICdtb3NzJyxcbn07XG5cbmZ1bmN0aW9uIG1hdGVyaWFsTmFtZShtOiBNYXRJZCk6IHN0cmluZyB7XG4gIHJldHVybiBNQVRFUklBTF9OQU1FU1ttXSA/PyBgbWF0XyR7bX1gO1xufVxuXG5mdW5jdGlvbiBmaWxsTWF0ZXJpYWwoeTogbnVtYmVyLCB0YXJnZXQ6IG51bWJlcik6IE1hdElkIHtcbiAgcmV0dXJuIHkgPT09IHRhcmdldCAtIDEgPyBNQVQuR1JBU1MgOiBNQVQuU09JTDtcbn1cblxuZnVuY3Rpb24gZmFpbChzdGFnZTogUHJlcGFyYXRpb25GYWlsdXJlWydzdGFnZSddLCBjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogUHJlcGFyYXRpb25GYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGFnZSwgY29kZSwgcmVhc29ucyB9O1xufVxuXG4vKipcbiAqIEFwcGx5IGFuIGF1dGhvcml6ZWQgcGxhbi4gTm8gdm94ZWwgaXMgd3JpdHRlbiB1bnRpbCBldmVyeSBlZGl0IGFuZCByZW1vdmFsXG4gKiBoYXMgYmVlbiBjaGVja2VkIGFnYWluc3QgdGhlIHRva2VuLCB0aGUgcGxhbiBlbnZlbG9wZSBhbmQgdGhlIGhhcmQgbGltaXRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZVByZXBhcmF0aW9uKFxuICB3b3JsZDogV29ybGQsIHBsYW46IFByZXBhcmF0aW9uUGxhbiwgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb24sXG4pOiBQcmVwYXJhdGlvbk91dGNvbWUge1xuICBpZiAoYXV0aG9yaXphdGlvbi5hdXRob3JpdHkgIT09IExPQ0FMX0FVVEhPUklUWVxuICAgIHx8IGF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQgIT09IExPQ0FMX0VORk9SQ0VNRU5UKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5zdXBwb3J0ZWRfYXV0aG9yaXR5JywgW1xuICAgICAgYGF1dGhvcml0eSAke2F1dGhvcml6YXRpb24uYXV0aG9yaXR5fS8ke2F1dGhvcml6YXRpb24uZW5mb3JjZW1lbnR9IGlzIG5vdCB0aGUgbG9jYWwgc3R1YmAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCAhPT0gcGxhbkRpZ2VzdChwbGFuKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2RpZ2VzdF9taXNtYXRjaCcsIFsnYXV0aG9yaXphdGlvbiBkb2VzIG5vdCBtYXRjaCB0aGlzIHBsYW4nXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24uYmFzZVJldmlzaW9uICE9PSB3b3JsZC5yZXZpc2lvbikge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3N0YWxlX2F1dGhvcml6YXRpb24nLCBbXG4gICAgICBgYXV0aG9yaXphdGlvbiB3YXMgaXNzdWVkIGF0IHJldmlzaW9uICR7YXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb259LCB3b3JsZCBpcyBhdCAke3dvcmxkLnJldmlzaW9ufWAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKHBsYW4uZW52ZWxvcGUuc29tZSgocikgPT4gIXJlZ2lvbkNvbnRhaW5lZChyLCBhdXRob3JpemF0aW9uLmVudmVsb3BlKSkpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdlbnZlbG9wZV9taXNtYXRjaCcsIFsncGxhbiBlbnZlbG9wZSBpcyB3aWRlciB0aGFuIHRoZSBhdXRob3JpemF0aW9uJ10pO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocGxhbi5yZWN0KTtcbiAgY29uc3QgZWRpdHM6IFBlbmRpbmdFZGl0W10gPSBbXTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBpZiAodC55IDwgc3VyZmFjZSkge1xuICAgICAgZm9yIChsZXQgeSA9IHQueTsgeSA8IHN1cmZhY2U7IHkrKykge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB5LCB0LnopO1xuICAgICAgICBpZiAoaXNTb2xpZChiZWZvcmUpKSBlZGl0cy5wdXNoKHsgeDogdC54LCB5LCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXI6IE1BVC5BSVIgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0LnkgPiBzdXJmYWNlKSB7XG4gICAgICBmb3IgKGxldCB5ID0gc3VyZmFjZTsgeSA8IHQueTsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHksIHQueik7XG4gICAgICAgIGlmICghaXNTb2xpZChiZWZvcmUpKSB7XG4gICAgICAgICAgY29uc3QgYWZ0ZXIgPSBwbGFuLnN1cmZhY2VNYXRlcmlhbCAhPT0gbnVsbCAmJiB5ID09PSB0LnkgLSAxXG4gICAgICAgICAgICA/IHBsYW4uc3VyZmFjZU1hdGVyaWFsXG4gICAgICAgICAgICA6IGZpbGxNYXRlcmlhbCh5LCB0LnkpO1xuICAgICAgICAgIGVkaXRzLnB1c2goeyB4OiB0LngsIHksIHo6IHQueiwgYmVmb3JlLCBhZnRlciB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyBNYXRlcmlhbC1vbmx5IHN1cmZhY2UgY2hhbmdlIGZvciBjdXQgb3IgYWxyZWFkeS1sZXZlbCBjb2x1bW5zLiBGaWxsXG4gICAgLy8gY29sdW1ucyBhbHJlYWR5IHJlY2VpdmUgdGhlIHN1cmZhY2UgbWF0ZXJpYWwgaW4gdGhlIGZpbGwgbG9vcCBhYm92ZS5cbiAgICBpZiAocGxhbi5zdXJmYWNlTWF0ZXJpYWwgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHRvcFkgPSB0LnkgLSAxO1xuICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgdG9wWSwgdC56KTtcbiAgICAgIGlmIChpc1NvbGlkKGJlZm9yZSkgJiYgYmVmb3JlICE9PSBwbGFuLnN1cmZhY2VNYXRlcmlhbCkge1xuICAgICAgICBlZGl0cy5wdXNoKHtcbiAgICAgICAgICB4OiB0LngsIHk6IHRvcFksIHo6IHQueiwgYmVmb3JlLCBhZnRlcjogcGxhbi5zdXJmYWNlTWF0ZXJpYWwsIHN1cmZhY2U6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGV2ZXJ5IGVkaXQgYmVmb3JlIG11dGF0aW5nIGFueXRoaW5nLlxuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoZS54IDwgcmVjdC54MCB8fCBlLnggPiByZWN0LngxIHx8IGUueiA8IHJlY3QuejAgfHwgZS56ID4gcmVjdC56MSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBlZGl0ICR7ZS54fSwke2UueX0sJHtlLnp9IGlzIG91dHNpZGUgdGhlIGZvb3RwcmludGApO1xuICAgIH1cbiAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMoYXV0aG9yaXphdGlvbi5lbnZlbG9wZSwgZS54LCBlLnksIGUueikpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZWRpdCAke2UueH0sJHtlLnl9LCR7ZS56fSBpcyBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGN1dFZvbHVtZSA9IGVkaXRzLmZpbHRlcigoZSkgPT4gZS5hZnRlciA9PT0gTUFULkFJUiAmJiBpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBjb25zdCBmaWxsVm9sdW1lID0gZWRpdHMuZmlsdGVyKChlKSA9PiBlLmFmdGVyICE9PSBNQVQuQUlSICYmICFpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBpZiAoY3V0Vm9sdW1lID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgJHtjdXRWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhDdXRWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGZpbGxWb2x1bWUgPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsICR7ZmlsbFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEZpbGxWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGVkaXRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICByZWFzb25zLnB1c2goYCR7ZWRpdHMubGVuZ3RofSBlZGl0cyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICB9XG5cbiAgY29uc3QgY3VycmVudCA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KS5tYXAoKG8pID0+IG8uZW50aXR5SWQpLnNvcnQoKTtcbiAgY29uc3QgcGxhbm5lZCA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgcmVhc29ucy5wdXNoKCdmb290cHJpbnQgb2JzdHJ1Y3Rpb25zIGNoYW5nZWQgYWZ0ZXIgYXV0aG9yaXphdGlvbicpO1xuICB9XG4gIGlmIChwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEVudGl0eVJlbW92YWxzKSB7XG4gICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgfVxuICBmb3IgKGNvbnN0IGlkIG9mIHBsYW4uY2xlYXJFbnRpdHlJZHMpIHtcbiAgICBpZiAoIXdvcmxkLmVudGl0aWVzLmhhcyhpZCkpIHJlYXNvbnMucHVzaChgZW50aXR5ICR7aWR9IG5vIGxvbmdlciBleGlzdHNgKTtcbiAgfVxuICBpZiAod29ybGQubGlmZSkge1xuICAgIGxldCByZWNvdmVyZWQgPSAwO1xuICAgIGZvciAoY29uc3QgaWQgb2YgcGxhbi5jbGVhckVudGl0eUlkcykge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmIChlbnRpdHk/LnJlc291cmNlICYmIGVudGl0eS5yZW1haW5pbmcgPiAwKSByZWNvdmVyZWQgKz0gZW50aXR5LnJlbWFpbmluZztcbiAgICB9XG4gICAgLy8gQ2hlY2sgYmVmb3JlIGFueSB2b3hlbCBvciBlbnRpdHkgY2hhbmdlcywgcHJlc2VydmluZyBsZWdhY3kgdW5ib3VuZGVkXG4gICAgLy8gY29uc3RydWN0aW9uIGJlaGF2aW9yIGFuZCBzY2hlbWEtMyBjYXJyaWVkLWNhcGFjaXR5IGNvbnNlcnZhdGlvbi5cbiAgICBpZiAoT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBhbW91bnQpID0+IHN1bSArIGFtb3VudCwgMCkgKyByZWNvdmVyZWQgPiAxMjApIHtcbiAgICAgIHJlYXNvbnMucHVzaCgncmVzb3VyY2VzIHJlY292ZXJlZCBkdXJpbmcgc2l0ZSBjbGVhcmluZyB3b3VsZCBleGNlZWQgY2FycmllZCBjYXBhY2l0eSAxMjAnKTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5hdXRob3JpemVkX2VkaXRzJywgcmVhc29ucyk7XG5cbiAgY29uc3QgaW52ZW50b3J5QmVmb3JlID0gaW52ZW50b3J5U25hcHNob3Qod29ybGQpO1xuICBjb25zdCByZXZpc2lvbkJlZm9yZSA9IHdvcmxkLnJldmlzaW9uO1xuICBjb25zdCBjaHVua0RlbHRhcyA9IG5ldyBNYXA8c3RyaW5nLCBDaHVua0RlbHRhPigpO1xuICBjb25zdCBjdXRCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGNvbnN0IGZpbGxCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGxldCBhcHBsaWVkID0gMDtcbiAgbGV0IHN1cmZhY2VFZGl0cyA9IDA7XG5cbiAgZm9yIChjb25zdCBlIG9mIGVkaXRzKSB7XG4gICAgaWYgKCFzZXRWb3hlbCh3b3JsZCwgZS54LCBlLnksIGUueiwgZS5hZnRlcikpIGNvbnRpbnVlO1xuICAgIGFwcGxpZWQrKztcbiAgICBpZiAoZS5zdXJmYWNlKSBzdXJmYWNlRWRpdHMrKztcbiAgICBjb25zdCBrZXkgPSBjaHVua0tleSh3b3JsZFRvQ2h1bmtYKGUueCksIHdvcmxkVG9DaHVua1ooZS56KSk7XG4gICAgbGV0IGRlbHRhID0gY2h1bmtEZWx0YXMuZ2V0KGtleSk7XG4gICAgaWYgKCFkZWx0YSkge1xuICAgICAgZGVsdGEgPSB7IGNodW5rOiBrZXksIGNoYW5nZWQ6IDAsIGFkZGVkOiAwLCByZW1vdmVkOiAwIH07XG4gICAgICBjaHVua0RlbHRhcy5zZXQoa2V5LCBkZWx0YSk7XG4gICAgfVxuICAgIGRlbHRhLmNoYW5nZWQrKztcbiAgICBjb25zdCB3YXNTb2xpZCA9IGlzU29saWQoZS5iZWZvcmUpO1xuICAgIGNvbnN0IGlzTm93U29saWQgPSBpc1NvbGlkKGUuYWZ0ZXIpO1xuICAgIGlmICghd2FzU29saWQgJiYgaXNOb3dTb2xpZCkgZGVsdGEuYWRkZWQrKztcbiAgICBpZiAod2FzU29saWQgJiYgIWlzTm93U29saWQpIGRlbHRhLnJlbW92ZWQrKztcbiAgICBjb25zdCBuYW1lID0gbWF0ZXJpYWxOYW1lKGUuYmVmb3JlKTtcbiAgICBpZiAod2FzU29saWQgJiYgIWlzTm93U29saWQpIGN1dEJ5TWF0ZXJpYWxbbmFtZV0gPSAoY3V0QnlNYXRlcmlhbFtuYW1lXSA/PyAwKSArIDE7XG4gICAgaWYgKCF3YXNTb2xpZCAmJiBpc05vd1NvbGlkKSBmaWxsQnlNYXRlcmlhbFttYXRlcmlhbE5hbWUoZS5hZnRlcildID0gKGZpbGxCeU1hdGVyaWFsW21hdGVyaWFsTmFtZShlLmFmdGVyKV0gPz8gMCkgKyAxO1xuICB9XG5cbiAgY29uc3QgZW50aXRpZXNDbGVhcmVkOiBDbGVhcmVkRW50aXR5W10gPSBbXTtcbiAgY29uc3QgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0ge307XG4gIGZvciAoY29uc3QgaWQgb2YgWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKSkge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmICghZSkgY29udGludWU7XG4gICAgY29uc3QgYW1vdW50ID0gZS5yZXNvdXJjZSAmJiBlLnJlbWFpbmluZyA+IDAgPyBlLnJlbWFpbmluZyA6IDA7XG4gICAgaWYgKGUucmVzb3VyY2UgJiYgYW1vdW50ID4gMCkge1xuICAgICAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICAgIHJlc291cmNlc0dhaW5lZFtlLnJlc291cmNlXSA9IChyZXNvdXJjZXNHYWluZWRbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gICAgfVxuICAgIHJlbW92ZUVudGl0eSh3b3JsZCwgaWQpO1xuICAgIGVudGl0aWVzQ2xlYXJlZC5wdXNoKHtcbiAgICAgIGVudGl0eUlkOiBpZCwga2luZDogZS5raW5kLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50LCB4OiBlLngsIHk6IGUueSwgejogZS56LFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgY3V0ID0gYXBwbGllZCA+IDAgPyBPYmplY3QudmFsdWVzKGN1dEJ5TWF0ZXJpYWwpLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIDogMDtcbiAgY29uc3QgZmlsbCA9IGFwcGxpZWQgPiAwID8gT2JqZWN0LnZhbHVlcyhmaWxsQnlNYXRlcmlhbCkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgOiAwO1xuICBjb25zdCBsZWRnZXI6IFByZXBhcmF0aW9uTGVkZ2VyID0ge1xuICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICBhdXRob3JpemF0aW9uSWQ6IGF1dGhvcml6YXRpb24uaWQsXG4gICAgcGxhbkRpZ2VzdDogYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0LFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHBsYW4uZmxvb3JZLFxuICAgIGN1dFZvbHVtZTogY3V0LFxuICAgIGZpbGxWb2x1bWU6IGZpbGwsXG4gICAgbmV0U3BvaWw6IGN1dCAtIGZpbGwsXG4gICAgYm9ycm93ZWRGaWxsOiBNYXRoLm1heCgwLCBmaWxsIC0gY3V0KSxcbiAgICBjdXRCeU1hdGVyaWFsLFxuICAgIGZpbGxCeU1hdGVyaWFsLFxuICAgIHZveGVsRWRpdHM6IGFwcGxpZWQsXG4gICAgc3VyZmFjZUVkaXRzLFxuICAgIGVudGl0aWVzQ2xlYXJlZCxcbiAgICByZXNvdXJjZXNHYWluZWQsXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgY2h1bmtEZWx0YXM6IFsuLi5jaHVua0RlbHRhcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspKSxcbiAgICByZXZpc2lvbkJlZm9yZSxcbiAgICByZXZpc2lvbkFmdGVyOiB3b3JsZC5yZXZpc2lvbixcbiAgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIGF1dGhvcml6YXRpb24sIGxlZGdlciB9O1xufVxuXG4vKipcbiAqIFRoZSBzaGFyZWQgcGxheWVyL0FJIGVudHJ5IHBvaW50LiBUaGVyZSBpcyBubyBvdGhlciBjb25zdHJ1Y3Rpb24gcGF0aC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVTaXRlKFxuICB3b3JsZDogV29ybGQsXG4gIGF1dGhvcml6ZXI6IExvY2FsQXV0aG9yaXplcixcbiAgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCxcbiAgb3B0aW9uczogUHJlcGFyYXRpb25PcHRpb25zID0ge30sXG4pOiBQcmVwYXJhdGlvbk91dGNvbWUge1xuICBjb25zdCBwbGFubmVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbCwgb3B0aW9ucyk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IGRlY2lzaW9uID0gYXV0aG9yaXplci5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGlmICghZGVjaXNpb24ub2sgfHwgIWRlY2lzaW9uLmF1dGhvcml6YXRpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnYXV0aG9yaXplJywgJ25vdF9hdXRob3JpemVkJywgZGVjaXNpb24ucmVhc29ucyk7XG4gIH1cbiAgcmV0dXJuIGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbn1cbiIsICIvLyBNMDAyIHN0YWdlIDQ6IGF1dGhvcml0YXRpdmUgaG91c2UsIHBhdGggYW5kIHRlcnJhY2Ugc3RydWN0dXJlcy5cbi8vXG4vLyBTdHJ1Y3R1cmVzIGFyZSBzaW11bGF0aW9uIHJlY29yZHMsIG5vdCByZW5kZXJlci1vbmx5IG1lc2hlcy4gQSBzdHJ1Y3R1cmUgaXNcbi8vIHBsYW5uZWQgZnJvbSB0aGUgcHJlcGFyZWQgdGVycmFpbiwgYXV0aG9yaXplZCBhZ2FpbnN0IHRoZSBzYW1lIGxvY2FsIHBvbGljeVxuLy8gZW52ZWxvcGUgYXMgdGVycmFpbiBwcmVwYXJhdGlvbiwgcGFpZCBmb3IgZnJvbSBpbnZlbnRvcnksIGFuZCB0aGVuIHN0b3JlZCBpblxuLy8gV29ybGQuc3RydWN0dXJlcy4gVGhlIHJlbmRlcmVyIHJlYWRzIHRob3NlIHJlY29yZHM7IGl0IG5ldmVyIGludmVudHMgYVxuLy8gYnVpbGRpbmcgdGhhdCB0aGUgc2ltdWxhdGlvbiBkb2VzIG5vdCBvd24uXG5pbXBvcnQge1xuICBXb3JsZCwgUmVzb3VyY2VUeXBlLCBNQVQsIHN1cmZhY2VBdCwgZ2V0Vm94ZWwsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIG5vcm1hbGl6ZVJlY3QsIGV4cGFuZFJlY3QsXG4gIGVudmVsb3BlQ29udGFpbnMsIG9ic3RydWN0aW9uc0luLFxufSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgQXV0aG9yaXphdGlvblBvbGljeSwgTE9DQUxfQVVUSE9SSVRZLCBMT0NBTF9FTkZPUkNFTUVOVCxcbn0gZnJvbSAnLi9wcmVwYXJhdGlvbic7XG5pbXBvcnQgeyBGQVJNX1JVTEVTIH0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHsgaW52ZW50b3J5U25hcHNob3QgfSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZUtpbmQgPSAnaG91c2UnIHwgJ3BhdGgnIHwgJ3RlcnJhY2UnO1xuLyoqIE0wMDIgZGVzaWduIDEgaXMgaW1tdXRhYmxlIHJlcGxheSBjb250ZW50OyBkZXNpZ24gMiBpcyB0aGUgZm91bmRlciBjYW5kaWRhdGUuICovXG5leHBvcnQgY29uc3QgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA9IDIgYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uID0gdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG5cbmV4cG9ydCB0eXBlIE1vZHVsZUtpbmQgPVxuICB8ICdmbG9vcidcbiAgfCAnd2FsbCdcbiAgfCAncG9zdCdcbiAgfCAnbGludGVsJ1xuICB8ICdyb29mJ1xuICB8ICdwYXJhcGV0J1xuICB8ICd3aW5kb3cnXG4gIHwgJ2Rvb3InXG4gIHwgJ3RocmVzaG9sZCdcbiAgfCAncGF0aCdcbiAgfCAnY3VyYidcbiAgfCAnc29pbF9iZWQnXG4gIHwgJ3JldGFpbmluZ193YWxsJ1xuICB8ICdjcm9wX3Jvdyc7XG5cbmV4cG9ydCB0eXBlIE1vZHVsZVRvbmUgPVxuICB8ICdzdG9uZSdcbiAgfCAnc3RvbmVfYidcbiAgfCAnb2NocmUnXG4gIHwgJ3RpbWJlcidcbiAgfCAnYWNjZW50J1xuICB8ICdzb2lsJ1xuICB8ICdjcm9wJ1xuICB8ICdncmF2ZWwnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZU1vZHVsZSB7XG4gIGtpbmQ6IE1vZHVsZUtpbmQ7XG4gIC8qKiBDZW50cmUgaW4gd29ybGQgeC96LCBib3R0b20gaW4gd29ybGQgeS4gKi9cbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgdzogbnVtYmVyO1xuICBoOiBudW1iZXI7XG4gIGQ6IG51bWJlcjtcbiAgcm90PzogbnVtYmVyO1xuICB0b25lPzogTW9kdWxlVG9uZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgLyoqIE9yaWdpbjogY2VudHJlIG9mIHRoZSBwcmVwYXJlZCBmb290cHJpbnQgYXQgZmxvb3IgaGVpZ2h0LiAqL1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW107XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGJ1aWx0UmV2aXNpb246IG51bWJlcjtcbiAgLyoqIEFic2VudCBtZWFucyBsZWdhY3kgTTAwMiBkZXNpZ24gMTsgbmV2ZXIgaW5mZXIgaXQgZnJvbSB0aGUgcmVuZGVyZXIuICovXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWNlQmFuZCB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQcm9wb3NhbCB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgLyoqIFJlcXVpcmVkIGZvciBob3VzZXM6IHZveGVsIGNvbHVtbiBvZiB0aGUgZG9vciBvbiB0aGUgZWFzdCB3YWxsLiAqL1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICAvKiogT3B0aW9uYWwgcGF0aCBtZXRhZGF0YTsgdGhlIHBhdGggaXMgbGFpZCBhbG9uZyB0aGUgcmVjdCBjZW50cmVsaW5lLiAqL1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgdGVycmFjZXM/OiBudW1iZXI7XG4gIC8qKiBEZWxpYmVyYXRlIGNvbnRlbnQgc2VsZWN0aW9uIGNhcnJpZWQgYnkgc2NoZW1hLTIgY29tbWFuZHMuICovXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xufVxuXG4vKipcbiAqIFNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIHN0cnVjdHVyZSBjb3N0cy4gVGhlIHBsYW5uZXJzIGFuZCB0aGUgYnVpbGQgVUlcbiAqIGJvdGggcmVhZCB0aGVzZTsgYSBidWlsZGluZyBjYW5ub3QgYWR2ZXJ0aXNlIG9uZSBwcmljZSBhbmQgY2hhcmdlIGFub3RoZXIuXG4gKi9cbmV4cG9ydCBjb25zdCBIT1VTRV9DT1NUOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0geyB3b29kOiAxMCwgc3RvbmU6IDE4IH07XG5leHBvcnQgY29uc3QgVEVSUkFDRV9DT1NUOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0geyB3b29kOiA2LCBzdG9uZTogMTIgfTtcblxuLyoqIEEgcGF0aCBwYXlzIG9uZSBzdG9uZSBwZXIgbWV0cmUgb2YgY29ycmlkb3Igd2lkdGguICovXG5leHBvcnQgZnVuY3Rpb24gcGF0aENvc3Qod2lkdGg6IG51bWJlcik6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICByZXR1cm4geyBzdG9uZTogd2lkdGggfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQbGFuIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBvcmlnaW46IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICByb3Q6IG51bWJlcjtcbiAgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW107XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICAvKiogRXhwZWN0ZWQgcHJlcGFyZWQgc3VyZmFjZSwgY2hlY2tlZCBhZ2FpbiBhdCBleGVjdXRpb24gdGltZS4gKi9cbiAgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdO1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbiAgdGVycmFjZXM/OiBUZXJyYWNlQmFuZFtdO1xufVxuXG4vLyAtLS0tLS0tLS0tIHN0YWJsZSBkaWdlc3QgLS0tLS0tLS0tLVxuZnVuY3Rpb24gZGlnZXN0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzU7XG4gIGxldCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSBpbnB1dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RydWN0dXJlRGlnZXN0KHBsYW46IFN0cnVjdHVyZVBsYW4pOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgJ20wMDI6c3RydWN0dXJlLXBsYW46djEnLFxuICAgIHBsYW4ua2luZCxcbiAgICBwbGFuLnNpdGVJZCxcbiAgICBgJHtwbGFuLnJlY3QueDB9LCR7cGxhbi5yZWN0LnowfSwke3BsYW4ucmVjdC54MX0sJHtwbGFuLnJlY3QuejF9YCxcbiAgICBTdHJpbmcocGxhbi5mbG9vclkpLFxuICAgIGAke3BsYW4ub3JpZ2luLnh9LCR7cGxhbi5vcmlnaW4ueX0sJHtwbGFuLm9yaWdpbi56fWAsXG4gICAgU3RyaW5nKHBsYW4ucm90KSxcbiAgICAuLi4ocGxhbi5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID8gWydkZXNpZ246MiddIDogW10pLFxuICAgIGBtOiR7cGxhbi5tb2R1bGVzLmxlbmd0aH1gLFxuICBdO1xuICBmb3IgKGNvbnN0IG0gb2YgcGxhbi5tb2R1bGVzKSB7XG4gICAgbGluZXMucHVzaChgbToke20ua2luZH0sJHttLnh9LCR7bS55fSwke20uen0sJHttLnd9LCR7bS5ofSwke20uZH0sJHttLnJvdCA/PyAwfSwke20udG9uZSA/PyAnJ31gKTtcbiAgfVxuICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHBsYW4uY29zdCkuc29ydCgpO1xuICBsaW5lcy5wdXNoKGBjb3N0OiR7Y29zdEtleXMubGVuZ3RofWApO1xuICBmb3IgKGNvbnN0IGtleSBvZiBjb3N0S2V5cykgbGluZXMucHVzaChgY29zdDoke2tleX0sJHtwbGFuLmNvc3Rba2V5IGFzIFJlc291cmNlVHlwZV0gPz8gMH1gKTtcbiAgZm9yIChjb25zdCBzIG9mIHBsYW4uc3VyZmFjZSkgbGluZXMucHVzaChgczoke3MueH0sJHtzLnp9LCR7cy55fWApO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50ZXJyYWNlcyA/PyBbXSkgbGluZXMucHVzaChgdDoke3QuejB9LCR7dC56MX0sJHt0Lnl9YCk7XG4gIHJldHVybiBkaWdlc3QobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBsYW5uaW5nIGhlbHBlcnMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVGYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBzdGFnZTogJ3BsYW4nIHwgJ2F1dGhvcml6ZScgfCAnZXhlY3V0ZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUGxhblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogU3RydWN0dXJlUGxhbjtcbn1cblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlUGxhblJlc3VsdCA9IFN0cnVjdHVyZVBsYW5TdWNjZXNzIHwgU3RydWN0dXJlRmFpbHVyZTtcblxuZnVuY3Rpb24gZmFpbChzdGFnZTogU3RydWN0dXJlRmFpbHVyZVsnc3RhZ2UnXSwgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IFN0cnVjdHVyZUZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIHN0YWdlLCBjb2RlLCByZWFzb25zIH07XG59XG5cbmZ1bmN0aW9uIHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkOiBXb3JsZCwgc2FtcGxlczogcmVhZG9ubHkgU3VyZmFjZVNhbXBsZVtdKSB7XG4gIGNvbnN0IG91dDogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlcjsgZXhwZWN0ZWQ6IG51bWJlcjsgYWN0dWFsOiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChjb25zdCBzIG9mIHNhbXBsZXMpIHtcbiAgICBjb25zdCBhY3R1YWwgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoYWN0dWFsICE9PSBzLnkpIG91dC5wdXNoKHsgeDogcy54LCB6OiBzLnosIGV4cGVjdGVkOiBzLnksIGFjdHVhbCB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBmb290cHJpbnRTdXJmYWNlKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCwgeTogbnVtYmVyKTogU3VyZmFjZVNhbXBsZVtdIHtcbiAgY29uc3Qgb3V0OiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSBvdXQucHVzaCh7IHgsIHosIHkgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gZm9vdHByaW50RW52ZWxvcGUocmVjdDogUmVjdCwgeTA6IG51bWJlciwgeTE6IG51bWJlciwgbWFyZ2luID0gMSk6IFZveGVsUmVnaW9uW10ge1xuICBjb25zdCByID0gZXhwYW5kUmVjdChyZWN0LCBtYXJnaW4pO1xuICByZXR1cm4gW3sgLi4uciwgeTAsIHkxIH1dO1xufVxuXG5mdW5jdGlvbiBtb2R1bGVCb3VuZHMobTogU3RydWN0dXJlTW9kdWxlKTogeyB4MDogbnVtYmVyOyB4MTogbnVtYmVyOyB5MDogbnVtYmVyOyB5MTogbnVtYmVyOyB6MDogbnVtYmVyOyB6MTogbnVtYmVyIH0ge1xuICBjb25zdCByID0gTWF0aC5oeXBvdChtLncsIG0uZCkgLyAyO1xuICBjb25zdCBoYWxmVyA9IChtLnJvdCA/PyAwKSA9PT0gMCA/IG0udyAvIDIgOiByO1xuICBjb25zdCBoYWxmRCA9IChtLnJvdCA/PyAwKSA9PT0gMCA/IG0uZCAvIDIgOiByO1xuICByZXR1cm4ge1xuICAgIHgwOiBtLnggLSBoYWxmVywgeDE6IG0ueCArIGhhbGZXLFxuICAgIHkwOiBtLnksIHkxOiBtLnkgKyBtLmgsXG4gICAgejA6IG0ueiAtIGhhbGZELCB6MTogbS56ICsgaGFsZkQsXG4gIH07XG59XG5cbmZ1bmN0aW9uIG1vZHVsZUluc2lkZUVudmVsb3BlKG06IFN0cnVjdHVyZU1vZHVsZSwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBib29sZWFuIHtcbiAgY29uc3QgYiA9IG1vZHVsZUJvdW5kcyhtKTtcbiAgcmV0dXJuIGVudmVsb3BlLnNvbWUoKGUpID0+IGIueDAgPj0gZS54MCAtIDFlLTYgJiYgYi54MSA8PSBlLngxICsgMSArIDFlLTZcbiAgICAmJiBiLnkwID49IGUueTAgLSAxZS02ICYmIGIueTEgPD0gZS55MSArIDEgKyAxZS02XG4gICAgJiYgYi56MCA+PSBlLnowIC0gMWUtNiAmJiBiLnoxIDw9IGUuejEgKyAxICsgMWUtNik7XG59XG5cbmZ1bmN0aW9uIGNvc3RUb3RhbChjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+KTogbnVtYmVyIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMoY29zdCkucmVkdWNlKChhLCBiKSA9PiBhICsgKGIgPz8gMCksIDApO1xufVxuXG5mdW5jdGlvbiBtZWRpYW4odmFsdWVzOiBudW1iZXJbXSk6IG51bWJlciB7XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi52YWx1ZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgcmV0dXJuIHNvcnRlZFtNYXRoLmZsb29yKHNvcnRlZC5sZW5ndGggLyAyKV07XG59XG5cbi8vIC0tLS0tLS0tLS0gaG91c2UgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhbkhvdXNlKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGlmICh3aWR0aCAhPT0gOCB8fCBkZXB0aCAhPT0gNikge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgaG91c2UgbmVlZHMgOCB4IDYgbSwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuICBpZiAoIXByb3Bvc2FsLmRvb3IpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdtaXNzaW5nX2Rvb3InLCBbJ2hvdXNlIHBsYW4gbmVlZHMgYSBkb29yIGNvbHVtbiddKTtcbiAgfVxuICBpZiAocHJvcG9zYWwuZG9vci56IDwgcmVjdC56MCB8fCBwcm9wb3NhbC5kb29yLnogPiByZWN0LnoxKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZG9vcl9vdXRzaWRlJywgW2Bkb29yIHogJHtwcm9wb3NhbC5kb29yLnp9IGlzIG91dHNpZGUgJHtyZWN0LnowfS4uJHtyZWN0LnoxfWBdKTtcbiAgfVxuXG4gIGNvbnN0IHN1cmZhY2UgPSBmb290cHJpbnRTdXJmYWNlKHdvcmxkLCByZWN0LCBwcm9wb3NhbC5mbG9vclkpO1xuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG5cbiAgY29uc3QgZmxvb3JZID0gcHJvcG9zYWwuZmxvb3JZO1xuICBjb25zdCB4MCA9IHJlY3QueDAsIHgxID0gcmVjdC54MSArIDE7XG4gIGNvbnN0IHowID0gcmVjdC56MCwgejEgPSByZWN0LnoxICsgMTtcbiAgY29uc3QgY3ggPSAoeDAgKyB4MSkgLyAyO1xuICBjb25zdCBjeiA9ICh6MCArIHoxKSAvIDI7XG4gIGNvbnN0IGRvb3JaID0gcHJvcG9zYWwuZG9vci56ICsgMC41O1xuICBjb25zdCBkb29ySGFsZiA9IDAuNjtcbiAgY29uc3Qgd2FsbEggPSAzLjA7XG4gIGNvbnN0IHdhbGxUID0gMC41O1xuICBjb25zdCBkb29ySCA9IDIuMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcblxuICAvLyBGbG9vciBzbGFiIGFuZCByb29mIHBsYXRlLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnZmxvb3InLCB4OiBjeCwgeTogZmxvb3JZLCB6OiBjeiwgdzogOC4wLCBoOiAwLjMsIGQ6IDYuMCwgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncm9vZicsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCwgejogY3osIHc6IDguNCwgaDogMC4zLCBkOiA2LjQsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gTm9ydGggYW5kIHNvdXRoIHdhbGxzLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IGN4LCB5OiBmbG9vclksIHo6IHowICsgd2FsbFQgLyAyLCB3OiA4LjAsIGg6IHdhbGxILCBkOiB3YWxsVCwgdG9uZTogJ3N0b25lJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiBjeCwgeTogZmxvb3JZLCB6OiB6MSAtIHdhbGxUIC8gMiwgdzogOC4wLCBoOiB3YWxsSCwgZDogd2FsbFQsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gV2VzdCB3YWxsLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IHgwICsgd2FsbFQgLyAyLCB5OiBmbG9vclksIHo6IGN6LCB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IDYuMCwgdG9uZTogJ3N0b25lJyB9KTtcblxuICAvLyBFYXN0IHdhbGwgd2l0aCBhIHJlYWwgZG9vcndheSBnYXAuXG4gIGNvbnN0IGVhc3RYID0geDEgLSB3YWxsVCAvIDI7XG4gIGNvbnN0IGdhcDAgPSBkb29yWiAtIGRvb3JIYWxmO1xuICBjb25zdCBnYXAxID0gZG9vclogKyBkb29ySGFsZjtcbiAgY29uc3QgbGVmdExlbiA9IGdhcDAgLSB6MDtcbiAgY29uc3QgcmlnaHRMZW4gPSB6MSAtIGdhcDE7XG4gIGlmIChsZWZ0TGVuID4gMC4wNSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2FsbCcsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IHowICsgbGVmdExlbiAvIDIsXG4gICAgICB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IGxlZnRMZW4sIHRvbmU6ICdzdG9uZScsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHJpZ2h0TGVuID4gMC4wNSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2FsbCcsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDEgKyByaWdodExlbiAvIDIsXG4gICAgICB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IHJpZ2h0TGVuLCB0b25lOiAnc3RvbmUnLFxuICAgIH0pO1xuICB9XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2xpbnRlbCcsIHg6IGVhc3RYLCB5OiBmbG9vclkgKyBkb29ySCwgejogZG9vclosXG4gICAgdzogd2FsbFQsIGg6IHdhbGxIIC0gZG9vckgsIGQ6IGRvb3JIYWxmICogMiwgdG9uZTogJ3N0b25lX2InLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnZG9vcicsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDAsXG4gICAgdzogMC4xOCwgaDogZG9vckgsIGQ6IDAuMTYsIHRvbmU6ICd0aW1iZXInLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnZG9vcicsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDEsXG4gICAgdzogMC4xOCwgaDogZG9vckgsIGQ6IDAuMTYsIHRvbmU6ICd0aW1iZXInLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAndGhyZXNob2xkJywgeDogeDEgKyAwLjM1LCB5OiBmbG9vclksIHo6IGRvb3JaLFxuICAgIHc6IDAuOSwgaDogMC4xNiwgZDogMS4zLCB0b25lOiAnb2NocmUnLFxuICB9KTtcblxuICAvLyBUd28gd2luZG93cyBvbiB0aGUgc291dGggd2FsbCwgc2xpZ2h0bHkgcHJvdWQgb2YgdGhlIG91dGVyIGZhY2UuXG4gIGZvciAoY29uc3Qgd3ggb2YgW2N4IC0gMi4yLCBjeCArIDIuMl0pIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dpbmRvdycsIHg6IHd4LCB5OiBmbG9vclkgKyAxLjQ1LCB6OiB6MSAtIDAuMDIsXG4gICAgICB3OiAxLjAsIGg6IDEuMCwgZDogMC4wOCwgdG9uZTogJ2FjY2VudCcsXG4gICAgfSk7XG4gIH1cblxuICAvLyBQYXJhcGV0IGFyb3VuZCB0aGUgZmxhdCBOb3hlbCByb29mLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3ogLSAzLjA1LCB3OiA4LjQsIGg6IDAuNCwgZDogMC4zLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3gsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiArIDMuMDUsIHc6IDguNCwgaDogMC40LCBkOiAwLjMsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCAtIDQuMDUsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiwgdzogMC4zLCBoOiAwLjQsIGQ6IDYuNCwgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4ICsgNC4wNSwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6LCB3OiAwLjMsIGg6IDAuNCwgZDogNi40LCB0b25lOiAnc3RvbmVfYicgfSk7XG5cbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ2hvdXNlJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogY3gsIHk6IGZsb29yWSwgejogY3ogfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiB7IC4uLkhPVVNFX0NPU1QgfSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgZmxvb3JZLCBmbG9vclkgKyA0LCAyKSxcbiAgICBzdXJmYWNlLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHBhdGggLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhblBhdGgod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHdpZHRoID0gcmVjdC54MSAtIHJlY3QueDAgKyAxO1xuICBjb25zdCBkZXB0aCA9IHJlY3QuejEgLSByZWN0LnowICsgMTtcbiAgaWYgKGRlcHRoICE9PSAzIHx8IHdpZHRoIDwgMykge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgcGF0aCBuZWVkcyBhIDMgbSB3aWRlIGNvcnJpZG9yLCBnb3QgJHt3aWR0aH0geCAke2RlcHRofSBtYF0pO1xuICB9XG5cbiAgY29uc3QgY2VudGVyWiA9IHJlY3QuejAgKyAxO1xuICBjb25zdCBzdXJmYWNlOiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgY29uc3QgaGVpZ2h0czogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgY2VudGVyWik7XG4gICAgaGVpZ2h0cy5wdXNoKHkpO1xuICAgIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykgc3VyZmFjZS5wdXNoKHsgeCwgeiwgeSB9KTtcbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgaGVpZ2h0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHN0ZXAgPSBoZWlnaHRzW2ldIC0gaGVpZ2h0c1tpIC0gMV07XG4gICAgaWYgKE1hdGguYWJzKHN0ZXApID4gMSkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9zdGVwJywgW2BzdGVwICR7c3RlcH0gbSBhdCB4PSR7cmVjdC54MCArIGl9YF0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygc3VyZmFjZSkge1xuICAgIGNvbnN0IHRvcCA9IGdldFZveGVsKHdvcmxkLCBzLngsIHMueSAtIDEsIHMueik7XG4gICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3dldCcsIFtgY29sdW1uICR7cy54fSwke3Muen0gaXMgd2V0YF0pO1xuICAgIH1cbiAgICBpZiAodG9wICE9PSBNQVQuR1JBVkVMKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3N1cmZhY2UnLCBbXG4gICAgICAgIGBjb2x1bW4gJHtzLnh9LCR7cy56fSB0b3AgaXMgJHt0b3B9LCBleHBlY3RlZCBncmF2ZWxgLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG5cbiAgY29uc3QgY3ogPSBjZW50ZXJaICsgMC41O1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBjZW50ZXJaKTtcbiAgICBjb25zdCBteCA9IHggKyAwLjU7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhdGgnLCB4OiBteCwgeSwgejogY3osIHc6IDEuMCwgaDogMC4xMiwgZDogMy4wLCB0b25lOiAnZ3JhdmVsJyB9KTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IG14LCB5LCB6OiByZWN0LnowICsgMC4wNzUsIHc6IDEuMCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lX2InIH0pO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdjdXJiJywgeDogbXgsIHksIHo6IHJlY3QuejEgKyAxIC0gMC4wNzUsIHc6IDEuMCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lX2InIH0pO1xuICB9XG5cbiAgY29uc3QgbWluWSA9IE1hdGgubWluKC4uLmhlaWdodHMpO1xuICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4uaGVpZ2h0cyk7XG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICdwYXRoJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIG9yaWdpbjogeyB4OiAocmVjdC54MCArIHJlY3QueDEgKyAxKSAvIDIsIHk6IG1pblksIHo6IGN6IH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogcGF0aENvc3Qod2lkdGgpLFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBtaW5ZIC0gMSwgbWF4WSArIDIsIDApLFxuICAgIHN1cmZhY2UsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gdGVycmFjZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhblRlcnJhY2VzKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGNvbnN0IGNvdW50ID0gcHJvcG9zYWwudGVycmFjZXMgPz8gMztcbiAgaWYgKHdpZHRoICE9PSAxMiB8fCBkZXB0aCAhPT0gOCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgdGVycmFjZXMgbmVlZCAxMiB4IDggbSwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuICBpZiAoY291bnQgPCAyIHx8IGNvdW50ID4gNCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3RlcnJhY2VfY291bnQnLCBbYCR7Y291bnR9IHRlcnJhY2VzIGlzIG91dHNpZGUgMi4uNGBdKTtcbiAgfVxuXG4gIC8vIFNwbGl0IGRlcHRoIGludG8gbmVhci1lcXVhbCBiYW5kcywgaGlnaCBzaWRlIGZpcnN0LlxuICBjb25zdCBiYXNlID0gTWF0aC5mbG9vcihkZXB0aCAvIGNvdW50KTtcbiAgY29uc3QgZXh0cmEgPSBkZXB0aCAlIGNvdW50O1xuICBjb25zdCBiYW5kczogVGVycmFjZUJhbmRbXSA9IFtdO1xuICBsZXQgeiA9IHJlY3QuejA7XG4gIGNvbnN0IG1lZGlhbnM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgIGNvbnN0IHNpemUgPSBiYXNlICsgKGkgPCBleHRyYSA/IDEgOiAwKTtcbiAgICBjb25zdCB6MCA9IHosIHoxID0geiArIHNpemUgLSAxO1xuICAgIGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcbiAgICBmb3IgKGxldCBieiA9IHowOyBieiA8PSB6MTsgYnorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB2YWx1ZXMucHVzaChzdXJmYWNlQXQod29ybGQsIHgsIGJ6KSk7XG4gICAgfVxuICAgIG1lZGlhbnMucHVzaChtZWRpYW4odmFsdWVzKSk7XG4gICAgYmFuZHMucHVzaCh7IHowLCB6MSwgeTogMCB9KTtcbiAgICB6ID0gejEgKyAxO1xuICB9XG4gIC8vIEVhY2ggdGVycmFjZSBzaXRzIGV4YWN0bHkgb25lIG1ldHJlIGJlbG93IHRoZSBwcmV2aW91cyBvbmUuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYmFuZHMubGVuZ3RoOyBpKyspIHtcbiAgICBiYW5kc1tpXS55ID0gaSA9PT0gMCA/IG1lZGlhbnNbMF0gOiBNYXRoLm1pbihtZWRpYW5zW2ldLCBiYW5kc1tpIC0gMV0ueSAtIDEpO1xuICB9XG5cbiAgbGV0IG1heEN1dCA9IDAsIG1heEZpbGwgPSAwLCBjdXRWb2x1bWUgPSAwLCBmaWxsVm9sdW1lID0gMDtcbiAgY29uc3Qgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGZvciAoY29uc3QgYiBvZiBiYW5kcykge1xuICAgIGZvciAobGV0IGJ6ID0gYi56MDsgYnogPD0gYi56MTsgYnorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzdXJmYWNlQXQod29ybGQsIHgsIGJ6KTtcbiAgICAgICAgc3VyZmFjZS5wdXNoKHsgeCwgejogYnosIHk6IGIueSB9KTtcbiAgICAgICAgY29uc3QgZCA9IHMgLSBiLnk7XG4gICAgICAgIGlmIChkID4gMCkgeyBjdXRWb2x1bWUgKz0gZDsgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkKTsgfVxuICAgICAgICBpZiAoZCA8IDApIHsgZmlsbFZvbHVtZSArPSAtZDsgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIC1kKTsgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAobWF4Q3V0ID4gRkFSTV9SVUxFUy5tYXhDdXQgfHwgbWF4RmlsbCA+IEZBUk1fUlVMRVMubWF4RmlsbFxuICAgIHx8IGN1dFZvbHVtZSA+IEZBUk1fUlVMRVMubWF4Q3V0Vm9sdW1lIHx8IGZpbGxWb2x1bWUgPiBGQVJNX1JVTEVTLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX2VhcnRod29yaycsIFtcbiAgICAgIGBjdXQgJHtjdXRWb2x1bWV9IG1cdTAwQjMgLyBmaWxsICR7ZmlsbFZvbHVtZX0gbVx1MDBCMywgbWF4ICR7bWF4Q3V0fS8ke21heEZpbGx9IG1gLFxuICAgIF0pO1xuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX25vdF9wcmVwYXJlZCcsIG1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX29ic3RydWN0ZWQnLCBvYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSk7XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHN1cmZhY2UpIHtcbiAgICBjb25zdCB0b3AgPSBnZXRWb3hlbCh3b3JsZCwgcy54LCBzLnkgLSAxLCBzLnopO1xuICAgIGlmICh0b3AgIT09IE1BVC5TT0lMKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX3N1cmZhY2UnLCBbXG4gICAgICAgIGBjb2x1bW4gJHtzLnh9LCR7cy56fSB0b3AgaXMgJHt0b3B9LCBleHBlY3RlZCBzb2lsYCxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGN4ID0gKHJlY3QueDAgKyByZWN0LngxICsgMSkgLyAyO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGIgb2YgYmFuZHMpIHtcbiAgICBjb25zdCBieiA9IChiLnowICsgYi56MSArIDEpIC8gMjtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3NvaWxfYmVkJywgeDogY3gsIHk6IGIueSwgejogYnosXG4gICAgICB3OiB3aWR0aCwgaDogMC4xOCwgZDogYi56MSAtIGIuejAgKyAxLCB0b25lOiAnc29pbCcsXG4gICAgfSk7XG4gICAgLy8gVGhyZWUgY3JvcCByb3dzIHBlciB0ZXJyYWNlLCBpbnNldCBmcm9tIHRoZSByZXRhaW5pbmcgd2FsbHMuXG4gICAgY29uc3Qgcm93RGVwdGggPSBiLnoxIC0gYi56MCArIDE7XG4gICAgZm9yIChsZXQgciA9IDA7IHIgPCAzOyByKyspIHtcbiAgICAgIGNvbnN0IHQgPSAociArIDEpIC8gNDtcbiAgICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICAgIGtpbmQ6ICdjcm9wX3JvdycsIHg6IGN4LCB5OiBiLnkgKyAwLjE4LCB6OiBiLnowICsgcm93RGVwdGggKiB0LFxuICAgICAgICB3OiB3aWR0aCAtIDEuMiwgaDogMC4yOCwgZDogMC4zNiwgdG9uZTogJ2Nyb3AnLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgYmFuZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB1cHBlciA9IGJhbmRzW2kgLSAxXTtcbiAgICBjb25zdCBsb3dlciA9IGJhbmRzW2ldO1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAncmV0YWluaW5nX3dhbGwnLCB4OiBjeCwgeTogbG93ZXIueSwgejogdXBwZXIuejEgKyAwLjUsXG4gICAgICB3OiB3aWR0aCwgaDogdXBwZXIueSAtIGxvd2VyLnksIGQ6IDAuNCwgdG9uZTogJ3N0b25lX2InLFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgbWluWSA9IE1hdGgubWluKC4uLmJhbmRzLm1hcCgoYikgPT4gYi55KSk7XG4gIGNvbnN0IG1heFkgPSBNYXRoLm1heCguLi5iYW5kcy5tYXAoKGIpID0+IGIueSkpO1xuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAndGVycmFjZScsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogY3gsIHk6IG1pblksIHo6IChyZWN0LnowICsgcmVjdC56MSArIDEpIC8gMiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHsgLi4uVEVSUkFDRV9DT1NUIH0sXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIG1pblkgLSAxLCBtYXhZICsgMiwgMSksXG4gICAgc3VyZmFjZSxcbiAgICB0ZXJyYWNlczogYmFuZHMsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFuU3RydWN0dXJlKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGlmIChwcm9wb3NhbC5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSByZXR1cm4gcGxhbkZvdW5kZXJEZXNpZ24od29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKHByb3Bvc2FsLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3Vuc3VwcG9ydGVkX2Rlc2lnbicsIFtgdW5zdXBwb3J0ZWQgc3RydWN0dXJlIGRlc2lnbiAke1N0cmluZyhwcm9wb3NhbC5kZXNpZ25WZXJzaW9uKX1gXSk7XG4gIH1cbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdob3VzZScpIHJldHVybiBwbGFuSG91c2Uod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdwYXRoJykgcmV0dXJuIHBsYW5QYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIHJldHVybiBwbGFuVGVycmFjZXMod29ybGQsIHByb3Bvc2FsKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXNpZ24gMjogYm91bmRlZCBmb3VuZGVyIGNhbmRpZGF0ZSAtLS0tLS0tLS0tXG4vLyBUaGlzIGRlbGliZXJhdGVseSBsZWF2ZXMgZXZlcnkgbGVnYWN5IHBsYW5uZXIgYWJvdmUgdW50b3VjaGVkLiBUaGUgZXh0cmEgd2FsbFxuLy8gcHJpbWl0aXZlcyByZXByZXNlbnQgdm9pZHMsIG5vdCBkZWNvcmF0aXZlIHdpbmRvd3M7IHRoZWlyIGFzc2V0LWxldmVsIHZvbHVtZVxuLy8gaW50ZXJwcmV0YXRpb24gcmVtYWlucyBSZXZpZXcgUmVxdWlyZWQgKHRoZSBmb3VuZGVyIDRcdTIwMTM5IHZvbHVtZSB0YXJnZXQpLlxuZnVuY3Rpb24gcGxhbkZvdW5kZXJEZXNpZ24od29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdwYXRoJykgcmV0dXJuIHBsYW5Gb3VuZGVyUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICBjb25zdCBwbGFubmVkID0gcHJvcG9zYWwua2luZCA9PT0gJ2hvdXNlJyA/IHBsYW5Ib3VzZSh3b3JsZCwgcHJvcG9zYWwpIDogcGxhblRlcnJhY2VzKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAndGVycmFjZScpIHtcbiAgICAvLyBDcm9wIHJvd3Mgc3RheSBjb21wYWN0IGF1dGhvcml0YXRpdmUgYWdncmVnYXRlcy4gVGhlaXIgZmFjZXRlZCBmb2xpYWdlIGlzXG4gICAgLy8gZGVyaXZlZCBwcmVzZW50YXRpb24gb25seTsgbm8gcGxhbnQtbGV2ZWwgZXhpc3RlbmNlIG9yIHlpZWxkIGlzIGludmVudGVkLlxuICAgIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgICByZXR1cm4gcGxhbm5lZDtcbiAgfVxuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgeDAgPSByZWN0LngwLCB4MSA9IHJlY3QueDEgKyAxO1xuICBjb25zdCB6MCA9IHJlY3QuejAsIHoxID0gcmVjdC56MSArIDE7XG4gIGNvbnN0IHkgPSBwcm9wb3NhbC5mbG9vclksIGN4ID0gKHgwICsgeDEpIC8gMiwgY3ogPSAoejAgKyB6MSkgLyAyO1xuICBjb25zdCB0ID0gMC42LCBoID0gMy4yO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICAvLyBPbmUgc3RydWN0dXJhbCBzdG9uZSBmYW1pbHk6IGxpZ2h0aW5nLCBub3QgcGFpbnRlZCBmYWNlIHZhcmlhdGlvbiwgc2hhZGVzIGl0LlxuICBjb25zdCB3YWxsID0gKHg6IG51bWJlciwgYm90dG9tOiBudW1iZXIsIHo6IG51bWJlciwgdzogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZDogbnVtYmVyLCBraW5kOiBTdHJ1Y3R1cmVNb2R1bGVbJ2tpbmQnXSA9ICd3YWxsJykgPT4ge1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQsIHgsIHk6IGJvdHRvbSwgeiwgdywgaDogaGVpZ2h0LCBkLCB0b25lOiAnc3RvbmUnIH0pO1xuICB9O1xuICB3YWxsKGN4LCB5IC0gMC40LCBjeiwgOCwgMC40LCA2LCAnZmxvb3InKTtcbiAgd2FsbChjeCwgeSwgejAgKyB0IC8gMiwgOCwgaCwgdCk7XG4gIGNvbnN0IGlubmVyWjAgPSB6MCArIHQsIGlubmVyWjEgPSB6MSAtIHQ7XG4gIHdhbGwoeDAgKyB0IC8gMiwgeSwgKGlubmVyWjAgKyBpbm5lcloxKSAvIDIsIHQsIGgsIGlubmVyWjEgLSBpbm5lclowKTtcbiAgY29uc3QgZG9vclogPSAocHJvcG9zYWwuZG9vcj8ueiA/PyByZWN0LnowKSArIDAuNTtcbiAgY29uc3QgZG9vcjAgPSBkb29yWiAtIDAuNiwgZG9vcjEgPSBkb29yWiArIDAuNjtcbiAgY29uc3QgZWFzdFggPSB4MSAtIHQgLyAyO1xuICB3YWxsKGVhc3RYLCB5LCAoaW5uZXJaMCArIGRvb3IwKSAvIDIsIHQsIGgsIGRvb3IwIC0gaW5uZXJaMCk7XG4gIHdhbGwoZWFzdFgsIHksIChkb29yMSArIGlubmVyWjEpIC8gMiwgdCwgaCwgaW5uZXJaMSAtIGRvb3IxKTtcbiAgd2FsbChlYXN0WCwgeSArIDIuMiwgZG9vclosIHQsIDAuNCwgMS4yLCAnbGludGVsJyk7XG4gIHdhbGwoZWFzdFgsIHkgKyAyLjYsIGRvb3JaLCB0LCAwLjYsIDEuMik7XG4gIGNvbnN0IHNvdXRoWiA9IHoxIC0gdCAvIDI7XG4gIGZvciAoY29uc3QgW2EsIGJdIG9mIFtbeDAgKyB0LCBjeCAtIDIuNl0sIFtjeCAtIDEuNCwgY3ggKyAxLjRdLCBbY3ggKyAyLjYsIHgxIC0gdF1dKSB7XG4gICAgd2FsbCgoYSArIGIpIC8gMiwgeSwgc291dGhaLCBiIC0gYSwgaCwgdCk7XG4gIH1cbiAgZm9yIChjb25zdCB3eCBvZiBbY3ggLSAyLCBjeCArIDJdKSB7XG4gICAgd2FsbCh3eCwgeSwgc291dGhaLCAxLjIsIDEsIHQpO1xuICAgIHdhbGwod3gsIHkgKyAyLjQsIHNvdXRoWiwgMS4yLCAwLjgsIHQsICdsaW50ZWwnKTtcbiAgfVxuICB3YWxsKGN4LCB5ICsgaCwgY3osIDgsIDAuNCwgNiwgJ3Jvb2YnKTtcbiAgd2FsbChjeCwgeSArIGggKyAwLjQsIHowICsgMC4xNSwgOCwgMC4zLCAwLjMsICdwYXJhcGV0Jyk7XG4gIHdhbGwoY3gsIHkgKyBoICsgMC40LCB6MSAtIDAuMTUsIDgsIDAuMywgMC4zLCAncGFyYXBldCcpO1xuICB3YWxsKGN4IC0gMy44NSwgeSArIGggKyAwLjQsIGN6LCAwLjMsIDAuMywgNS40LCAncGFyYXBldCcpO1xuICB3YWxsKGN4ICsgMy44NSwgeSArIGggKyAwLjQsIGN6LCAwLjMsIDAuMywgNS40LCAncGFyYXBldCcpO1xuICBwbGFubmVkLnBsYW4ubW9kdWxlcyA9IG1vZHVsZXM7XG4gIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgcGxhbm5lZC5wbGFuLmVudmVsb3BlID0gZm9vdHByaW50RW52ZWxvcGUocmVjdCwgeSAtIDEsIHkgKyA0LCAyKTtcbiAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gIHJldHVybiBwbGFubmVkO1xufVxuXG5mdW5jdGlvbiBwbGFuRm91bmRlclBhdGgod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIGNvbnN0IGhlaWdodHMgPSBwbGFubmVkLnBsYW4ubW9kdWxlcy5maWx0ZXIoKG0pID0+IG0ua2luZCA9PT0gJ3BhdGgnKS5tYXAoKG0pID0+IG0ueSk7XG4gIGNvbnN0IHowID0gcGxhbm5lZC5wbGFuLnJlY3QuejAsIHoxID0gcGxhbm5lZC5wbGFuLnJlY3QuejEgKyAxO1xuICBsZXQgc3RhcnQgPSAwO1xuICBmb3IgKGxldCBlbmQgPSAxOyBlbmQgPD0gaGVpZ2h0cy5sZW5ndGg7IGVuZCsrKSB7XG4gICAgaWYgKGVuZCA8IGhlaWdodHMubGVuZ3RoICYmIGhlaWdodHNbZW5kXSA9PT0gaGVpZ2h0c1tzdGFydF0pIGNvbnRpbnVlO1xuICAgIGNvbnN0IHggPSBwbGFubmVkLnBsYW4ucmVjdC54MCArIHN0YXJ0LCB3aWR0aCA9IGVuZCAtIHN0YXJ0O1xuICAgIGNvbnN0IGN4ID0geCArIHdpZHRoIC8gMiwgeSA9IGhlaWdodHNbc3RhcnRdO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXRoJywgeDogY3gsIHksIHo6ICh6MCArIHoxKSAvIDIsIHc6IHdpZHRoLCBoOiAwLjEyLCBkOiAzLCB0b25lOiAnZ3JhdmVsJyB9KTtcbiAgICBmb3IgKGNvbnN0IHogb2YgW3owICsgMC4wNzUsIHoxIC0gMC4wNzVdKSB7XG4gICAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IGN4LCB5LCB6LCB3OiB3aWR0aCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lJyB9KTtcbiAgICB9XG4gICAgc3RhcnQgPSBlbmQ7XG4gIH1cbiAgcGxhbm5lZC5wbGFuLm1vZHVsZXMgPSBtb2R1bGVzO1xuICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICByZXR1cm4gcGxhbm5lZDtcbn1cblxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcml6YXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVMaW1pdHMge1xuICBtYXhNb2R1bGVzOiBudW1iZXI7XG4gIG1heENvc3Q6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU1RSVUNUVVJFX0xJTUlUUzogU3RydWN0dXJlTGltaXRzID0ge1xuICBtYXhNb2R1bGVzOiA2NCxcbiAgbWF4Q29zdDogMTI4LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBiYXNlUmV2aXNpb246IG51bWJlcjtcbiAgbGltaXRzOiBTdHJ1Y3R1cmVMaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlRGVjaXNpb24ge1xuICBvazogYm9vbGVhbjtcbiAgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbiB8IG51bGw7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyIHtcbiAgcmVhZG9ubHkgYXV0aG9yaXR5ID0gTE9DQUxfQVVUSE9SSVRZO1xuICByZWFkb25seSBlbmZvcmNlbWVudCA9IExPQ0FMX0VORk9SQ0VNRU5UO1xuICByZWFkb25seSBsaW1pdHM6IFN0cnVjdHVyZUxpbWl0cztcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBwb2xpY3k6IEF1dGhvcml6YXRpb25Qb2xpY3ksIGxpbWl0czogUGFydGlhbDxTdHJ1Y3R1cmVMaW1pdHM+ID0ge30pIHtcbiAgICB0aGlzLmxpbWl0cyA9IHsgLi4uREVGQVVMVF9TVFJVQ1RVUkVfTElNSVRTLCAuLi5saW1pdHMgfTtcbiAgfVxuXG4gIGF1dGhvcml6ZSh3b3JsZDogV29ybGQsIHBsYW46IFN0cnVjdHVyZVBsYW4pOiBTdHJ1Y3R1cmVEZWNpc2lvbiB7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAocGxhbi5tb2R1bGVzLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyBtb2R1bGVzJyk7XG4gICAgaWYgKHBsYW4ubW9kdWxlcy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhNb2R1bGVzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi5tb2R1bGVzLmxlbmd0aH0gbW9kdWxlcyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhNb2R1bGVzfWApO1xuICAgIH1cbiAgICBpZiAoY29zdFRvdGFsKHBsYW4uY29zdCkgPiB0aGlzLmxpbWl0cy5tYXhDb3N0KSB7XG4gICAgICByZWFzb25zLnB1c2goYGNvc3QgJHtjb3N0VG90YWwocGxhbi5jb3N0KX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heENvc3R9YCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcihhbW91bnQpIHx8IChhbW91bnQgPz8gMCkgPCAwKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgY29zdCAke3Jlc291cmNlfT0ke2Ftb3VudH0gaXMgbm90IGEgbm9uLW5lZ2F0aXZlIGludGVnZXJgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBsYW4uZW52ZWxvcGUubGVuZ3RoID09PSAwKSByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHdvcmsgZW52ZWxvcGUnKTtcbiAgICBmb3IgKGNvbnN0IHJlZ2lvbiBvZiBwbGFuLmVudmVsb3BlKSB7XG4gICAgICBpZiAoIXRoaXMucG9saWN5LmVudmVsb3BlLnNvbWUoKHApID0+IHJlZ2lvbi54MCA+PSBwLngwICYmIHJlZ2lvbi54MSA8PSBwLngxXG4gICAgICAgICYmIHJlZ2lvbi56MCA+PSBwLnowICYmIHJlZ2lvbi56MSA8PSBwLnoxXG4gICAgICAgICYmIHJlZ2lvbi55MCA+PSBwLnkwICYmIHJlZ2lvbi55MSA8PSBwLnkxKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYGVudmVsb3BlICR7cmVnaW9uLngwfSwke3JlZ2lvbi56MH0sJHtyZWdpb24ueTB9Li4ke3JlZ2lvbi54MX0sJHtyZWdpb24uejF9LCR7cmVnaW9uLnkxfSBpcyBvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3lgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgICAgaWYgKCFtb2R1bGVJbnNpZGVFbnZlbG9wZShtLCBwbGFuLmVudmVsb3BlKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYG1vZHVsZSAke20ua2luZH0gYXQgJHttLnh9LCR7bS55fSwke20uen0gaXMgb3V0c2lkZSB0aGUgcGxhbiBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocGxhbi5zdXJmYWNlLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyBzdXJmYWNlIHNhbXBsZXMnKTtcbiAgICBmb3IgKGNvbnN0IHMgb2YgcGxhbi5zdXJmYWNlKSB7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgcy54LCBzLnksIHMueikpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBzdXJmYWNlICR7cy54fSwke3Muen0sJHtzLnl9IGlzIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBhdXRob3JpemF0aW9uOiBudWxsLCByZWFzb25zIH07XG5cbiAgICBjb25zdCB0b2tlbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbiA9IHtcbiAgICAgIGlkOiBgbG9jYWwtc3R1YjpzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YCxcbiAgICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgICAgcGxhbkRpZ2VzdDogc3RydWN0dXJlRGlnZXN0KHBsYW4pLFxuICAgICAgZW52ZWxvcGU6IHBsYW4uZW52ZWxvcGUubWFwKChlKSA9PiAoeyAuLi5lIH0pKSxcbiAgICAgIGJhc2VSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgICBsaW1pdHM6IHsgLi4udGhpcy5saW1pdHMgfSxcbiAgICB9O1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBhdXRob3JpemF0aW9uOiB0b2tlbiwgcmVhc29uczogW10gfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIGV4ZWN1dGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUxlZGdlciB7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgYXV0aG9yaXphdGlvbklkOiBzdHJpbmc7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgc3RydWN0dXJlSWQ6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIG1vZHVsZUNvdW50OiBudW1iZXI7XG4gIGNvc3RQYWlkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICByZXZpc2lvbkJlZm9yZTogbnVtYmVyO1xuICByZXZpc2lvbkFmdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBTdHJ1Y3R1cmVQbGFuO1xuICBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uO1xuICBsZWRnZXI6IFN0cnVjdHVyZUxlZGdlcjtcbn1cblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlT3V0Y29tZSA9IFN0cnVjdHVyZVN1Y2Nlc3MgfCBTdHJ1Y3R1cmVGYWlsdXJlO1xuXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZVN0cnVjdHVyZShcbiAgd29ybGQ6IFdvcmxkLCBwbGFuOiBTdHJ1Y3R1cmVQbGFuLCBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uLFxuKTogU3RydWN0dXJlT3V0Y29tZSB7XG4gIGlmIChhdXRob3JpemF0aW9uLmF1dGhvcml0eSAhPT0gTE9DQUxfQVVUSE9SSVRZXG4gICAgfHwgYXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudCAhPT0gTE9DQUxfRU5GT1JDRU1FTlQpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknLCBbXG4gICAgICBgYXV0aG9yaXR5ICR7YXV0aG9yaXphdGlvbi5hdXRob3JpdHl9LyR7YXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudH0gaXMgbm90IHRoZSBsb2NhbCBzdHViYCxcbiAgICBdKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0ICE9PSBzdHJ1Y3R1cmVEaWdlc3QocGxhbikpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdkaWdlc3RfbWlzbWF0Y2gnLCBbJ2F1dGhvcml6YXRpb24gZG9lcyBub3QgbWF0Y2ggdGhpcyBzdHJ1Y3R1cmUgcGxhbiddKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb24gIT09IHdvcmxkLnJldmlzaW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnc3RhbGVfYXV0aG9yaXphdGlvbicsIFtcbiAgICAgIGBhdXRob3JpemF0aW9uIHdhcyBpc3N1ZWQgYXQgcmV2aXNpb24gJHthdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbn0sIHdvcmxkIGlzIGF0ICR7d29ybGQucmV2aXNpb259YCxcbiAgICBdKTtcbiAgfVxuICBpZiAocGxhbi5lbnZlbG9wZS5zb21lKChyKSA9PiAhYXV0aG9yaXphdGlvbi5lbnZlbG9wZS5zb21lKChhKSA9PiByLngwID49IGEueDBcbiAgICAmJiByLngxIDw9IGEueDEgJiYgci56MCA+PSBhLnowICYmIHIuejEgPD0gYS56MSAmJiByLnkwID49IGEueTAgJiYgci55MSA8PSBhLnkxKSkpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdlbnZlbG9wZV9taXNtYXRjaCcsIFsncGxhbiBlbnZlbG9wZSBpcyB3aWRlciB0aGFuIHRoZSBhdXRob3JpemF0aW9uJ10pO1xuICB9XG5cbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgIGlmICghbW9kdWxlSW5zaWRlRW52ZWxvcGUobSwgYXV0aG9yaXphdGlvbi5lbnZlbG9wZSkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgbW9kdWxlICR7bS5raW5kfSBhdCAke20ueH0sJHttLnl9LCR7bS56fSBpcyBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgcGxhbi5zdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaCguLi5taXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCBwbGFuLnJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goYGZvb3RwcmludCBoYXMgJHtvYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnNgKTtcbiAgfVxuICBpZiAod29ybGQuc3RydWN0dXJlcy5oYXMocGxhbi5pZCkpIHtcbiAgICByZWFzb25zLnB1c2goYHN0cnVjdHVyZSAke3BsYW4uaWR9IGFscmVhZHkgZXhpc3RzYCk7XG4gIH1cbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgIGNvbnN0IGhhdmUgPSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDA7XG4gICAgaWYgKGhhdmUgPCAoYW1vdW50ID8/IDApKSB7XG4gICAgICByZWFzb25zLnB1c2goYG5lZWQgJHthbW91bnR9ICR7cmVzb3VyY2V9LCBoYXZlICR7aGF2ZX1gKTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5hdXRob3JpemVkX3N0cnVjdHVyZScsIHJlYXNvbnMpO1xuXG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgcmV2aXNpb25CZWZvcmUgPSB3b3JsZC5yZXZpc2lvbjtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgIGNvbnN0IGxlZnQgPSAod29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSAtIChhbW91bnQgPz8gMCk7XG4gICAgaWYgKGxlZnQgPiAwKSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID0gbGVmdDtcbiAgICBlbHNlIGRlbGV0ZSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdO1xuICB9XG5cbiAgd29ybGQucmV2aXNpb24rKztcbiAgY29uc3Qgc3RydWN0dXJlOiBTdHJ1Y3R1cmUgPSB7XG4gICAgaWQ6IHBsYW4uaWQsXG4gICAga2luZDogcGxhbi5raW5kLFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAgeDogcGxhbi5vcmlnaW4ueCxcbiAgICB5OiBwbGFuLm9yaWdpbi55LFxuICAgIHo6IHBsYW4ub3JpZ2luLnosXG4gICAgcm90OiBwbGFuLnJvdCxcbiAgICBtb2R1bGVzOiBwbGFuLm1vZHVsZXMubWFwKChtKSA9PiAoeyAuLi5tIH0pKSxcbiAgICBjb3N0OiB7IC4uLnBsYW4uY29zdCB9LFxuICAgIGJ1aWx0UmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIC4uLihwbGFuLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPyB7IGRlc2lnblZlcnNpb246IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSA6IHt9KSxcbiAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgfTtcbiAgd29ybGQuc3RydWN0dXJlcy5zZXQoc3RydWN0dXJlLmlkLCBzdHJ1Y3R1cmUpO1xuXG4gIGNvbnN0IGxlZGdlcjogU3RydWN0dXJlTGVkZ2VyID0ge1xuICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICBhdXRob3JpemF0aW9uSWQ6IGF1dGhvcml6YXRpb24uaWQsXG4gICAgcGxhbkRpZ2VzdDogYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0LFxuICAgIHN0cnVjdHVyZUlkOiBzdHJ1Y3R1cmUuaWQsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICBraW5kOiBwbGFuLmtpbmQsXG4gICAgbW9kdWxlQ291bnQ6IHN0cnVjdHVyZS5tb2R1bGVzLmxlbmd0aCxcbiAgICBjb3N0UGFpZDogeyAuLi5wbGFuLmNvc3QgfSxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICByZXZpc2lvbkJlZm9yZSxcbiAgICByZXZpc2lvbkFmdGVyOiB3b3JsZC5yZXZpc2lvbixcbiAgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIGF1dGhvcml6YXRpb24sIGxlZGdlciB9O1xufVxuXG4vKipcbiAqIFRoZSBzaGFyZWQgcGxheWVyL0FJIHN0cnVjdHVyZSBlbnRyeSBwb2ludC4gVGVycmFpbiBtdXN0IGFscmVhZHkgYmUgcHJlcGFyZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN0cnVjdHVyZShcbiAgd29ybGQ6IFdvcmxkLFxuICBhdXRob3JpemVyOiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsXG4gIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCxcbik6IFN0cnVjdHVyZU91dGNvbWUge1xuICBjb25zdCBwbGFubmVkID0gcGxhblN0cnVjdHVyZSh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBkZWNpc2lvbiA9IGF1dGhvcml6ZXIuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2F1dGhvcml6ZScsICdub3RfYXV0aG9yaXplZCcsIGRlY2lzaW9uLnJlYXNvbnMpO1xuICB9XG4gIHJldHVybiBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24pO1xufVxuIiwgIi8vIENhbm9uaWNhbCBzdGF0ZSBoYXNoaW5nIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMuXG4vL1xuLy8gVGhlIG5vLWZsYXR0ZW4gcHJvb2YgY29tcGFyZXMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lIG91dHNpZGUgdGhlXG4vLyBjb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuIEl0IGRlbGliZXJhdGVseSBkb2VzIG5vdCBoYXNoIGNodW5rXG4vLyBoZWlnaHRzL3RvcE1hdGVyaWFscyAoZGVyaXZlZCBjYWNoZXMpLCBtZXNoIGdlb21ldHJ5LCBzdHJlYW1pbmcgc3RhdGUgb3Jcbi8vIG5hdmlnYXRpb24gZGF0YS4gVGhvc2UgYXJlIGNoZWNrZWQgc2VwYXJhdGVseSBhcyBkZXJpdmVkIHN0YXRlLCBzbyBhIGNhY2hlXG4vLyBvciBtZXNoIHJlYnVpbGQgY2FuIG5ldmVyIGJlIG1pc3Rha2VuIGZvciBhIHRlcnJhaW4gbXV0YXRpb24uXG5pbXBvcnQge1xuICBXb3JsZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBDSFVOS19TSVpFLCBDSFVOS19BUkVBLFxuICBlbnN1cmVDaHVuaywgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgaXNTb2xpZCxcbiAgRW50aXR5LFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFZveGVsUmVnaW9uLCBlbnZlbG9wZUNvbnRhaW5zIH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0YXRlSGFzaCB7XG4gIC8qKiAxNiBoZXggY2hhcmFjdGVyczogdHdvIGluZGVwZW5kZW50IDMyLWJpdCBsYW5lcy4gKi9cbiAgaGFzaDogc3RyaW5nO1xuICBjZWxsczogbnVtYmVyO1xuICBleGNsdWRlZENlbGxzOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xuICByZWdpb246IFZveGVsUmVnaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlTWlzbWF0Y2gge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgZmllbGQ6ICdoZWlnaHQnIHwgJ21hdGVyaWFsJztcbiAgZXhwZWN0ZWQ6IG51bWJlcjtcbiAgYWN0dWFsOiBudW1iZXI7XG59XG5cbmNsYXNzIEhhc2hlciB7XG4gIHByaXZhdGUgYSA9IDB4ODExYzlkYzU7XG4gIHByaXZhdGUgYiA9IDB4OWUzNzc5Yjk7XG5cbiAgYnl0ZSh2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCB4ID0gdiAmIDB4ZmY7XG4gICAgdGhpcy5hID0gTWF0aC5pbXVsKHRoaXMuYSBeIHgsIDB4MDEwMDAxOTMpO1xuICAgIHRoaXMuYiA9IE1hdGguaW11bCh0aGlzLmIgXiAoeCArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICB0aGlzLmIgXj0gdGhpcy5iID4+PiAxMztcbiAgfVxuXG4gIHUzMih2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBsZXQgbiA9IHYgPj4+IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcbiAgICAgIHRoaXMuYnl0ZShuKTtcbiAgICAgIG4gPj4+PSA4O1xuICAgIH1cbiAgfVxuXG4gIHN0cmluZyhzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnUzMihzLmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB0aGlzLmJ5dGUocy5jaGFyQ29kZUF0KGkpKTtcbiAgfVxuXG4gIGhleCgpOiBzdHJpbmcge1xuICAgIHJldHVybiAodGhpcy5hID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICAgKyAodGhpcy5iID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXBSZWdpb24ocmVnaW9uOiBWb3hlbFJlZ2lvbik6IFZveGVsUmVnaW9uIHtcbiAgY29uc3QgcjogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBNYXRoLmZsb29yKHJlZ2lvbi54MCkpLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24uejApKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIE1hdGguZmxvb3IocmVnaW9uLngxKSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi56MSkpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgTWF0aC5mbG9vcihyZWdpb24ueTApKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi55MSkpLFxuICB9O1xuICBpZiAoci54MCA+IHIueDEgfHwgci56MCA+IHIuejEgfHwgci55MCA+IHIueTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGVtcHR5IHZveGVsIHJlZ2lvbiAke0pTT04uc3RyaW5naWZ5KHJlZ2lvbil9YCk7XG4gIH1cbiAgcmV0dXJuIHI7XG59XG5cbi8qKiBTb3J0IGFuIGVudmVsb3BlIHNvIGl0cyBoYXNoIGlzIGluZGVwZW5kZW50IG9mIHJlY3Qgb3JkZXIuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplRW52ZWxvcGUocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBWb3hlbFJlZ2lvbltdIHtcbiAgcmV0dXJuIHJlY3RzXG4gICAgLm1hcCgocikgPT4gKHtcbiAgICAgIHgwOiBNYXRoLmZsb29yKHIueDApLCB6MDogTWF0aC5mbG9vcihyLnowKSwgeDE6IE1hdGguZmxvb3Ioci54MSksIHoxOiBNYXRoLmZsb29yKHIuejEpLFxuICAgICAgeTA6IE1hdGguZmxvb3Ioci55MCksIHkxOiBNYXRoLmZsb29yKHIueTEpLFxuICAgIH0pKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLngwIC0gYi54MCB8fCBhLnowIC0gYi56MCB8fCBhLnkwIC0gYi55MFxuICAgICAgfHwgYS54MSAtIGIueDEgfHwgYS56MSAtIGIuejEgfHwgYS55MSAtIGIueTEpO1xufVxuXG4vKiogTWF0ZXJpYWxpc2UgZXZlcnkgY2h1bmsgdGhhdCBvdmVybGFwcyB0aGUgcmVnaW9uIGFuZCByZXR1cm4gc29ydGVkIGtleXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IHdvcmxkVG9DaHVua1goci54MCksIGN4MSA9IHdvcmxkVG9DaHVua1goci54MSk7XG4gIGNvbnN0IGN6MCA9IHdvcmxkVG9DaHVua1ooci56MCksIGN6MSA9IHdvcmxkVG9DaHVua1ooci56MSk7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2N4fSwke2N6fSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApO1xuICAgICAga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICAgIH1cbiAgfVxuICBrZXlzLnNvcnQoKTtcbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKlxuICogSGFzaCB0aGUgYXV0aG9yaXRhdGl2ZSBtYXRlcmlhbCBieXRlIG9mIGV2ZXJ5IHZveGVsIGluIGByZWdpb25gLCBleGNsdWRpbmdcbiAqIGV2ZXJ5IHZveGVsIGluc2lkZSBgZXhjbHVkZWAuIFR3byBjYWxscyB3aXRoIHRoZSBzYW1lIHJlZ2lvbiBhbmQgZW52ZWxvcGVcbiAqIGFyZSBkaXJlY3RseSBjb21wYXJhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsUmVnaW9uSGFzaChcbiAgd29ybGQ6IFdvcmxkLFxuICByZWdpb246IFZveGVsUmVnaW9uLFxuICBleGNsdWRlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdID0gW10sXG4pOiBTdGF0ZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShleGNsdWRlKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnZveGVsLXN0YXRlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpOyBoLnUzMihyLnkwKTsgaC51MzIoci55MSk7XG4gIGgudTMyKGVudmVsb3BlLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnZlbG9wZSkge1xuICAgIGgudTMyKGUueDApOyBoLnUzMihlLnowKTsgaC51MzIoZS54MSk7IGgudTMyKGUuejEpOyBoLnUzMihlLnkwKTsgaC51MzIoZS55MSk7XG4gIH1cblxuICBsZXQgY2VsbHMgPSAwO1xuICBsZXQgZXhjbHVkZWRDZWxscyA9IDA7XG4gIGNvbnN0IHlpMCA9IHIueTAgLSBZX01JTjtcbiAgY29uc3QgeWkxID0gci55MSAtIFlfTUlOO1xuXG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IHlpID0geWkwOyB5aSA8PSB5aTE7IHlpKyspIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHlpO1xuICAgICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgICBjb25zdCB6ID0gb3ogKyBsejtcbiAgICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICAgIGNvbnN0IHggPSBveCArIGx4O1xuICAgICAgICAgIGlmIChlbnZlbG9wZS5sZW5ndGggPiAwICYmIGVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgICAgICBleGNsdWRlZENlbGxzKys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaC5ieXRlKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeWksIGx6KV0pO1xuICAgICAgICAgIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjZWxscywgZXhjbHVkZWRDZWxscywgY2h1bmtzOiBrZXlzLmxlbmd0aCwgcmVnaW9uOiByIH07XG59XG5cbi8qKiBDYW5vbmljYWwgaW52ZW50b3J5IGhhc2g7IGtleSBvcmRlciBjYW5ub3QgYWZmZWN0IHRoZSByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjppbnZlbnRvcnk6djEnKTtcbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpO1xuICBoLnUzMihrZXlzLmxlbmd0aCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBoLnN0cmluZyhrZXkpO1xuICAgIGgudTMyKHdvcmxkLmludmVudG9yeVtrZXldKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGludmVudG9yeVNuYXBzaG90KHdvcmxkOiBXb3JsZCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMod29ybGQuaW52ZW50b3J5KS5zb3J0KCkpIG91dFtrZXldID0gd29ybGQuaW52ZW50b3J5W2tleV07XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGhhc2hFbnRpdHkoaDogSGFzaGVyLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaC5zdHJpbmcoZS5pZCk7XG4gIGguc3RyaW5nKGUua2luZCk7XG4gIGguc3RyaW5nKGUuY2h1bmspO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueCAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnkgKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS56ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUucm90ICogMTAwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnNjYWxlICogMTAwMCkpO1xuICBoLnUzMihlLnZhcmlhbnQpO1xuICBoLnN0cmluZyhlLnJlc291cmNlID8/ICcnKTtcbiAgaC51MzIoZS5yZW1haW5pbmcpO1xuICBoLnUzMihlLmhhcnZlc3RlZCA/IDEgOiAwKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWRPbmNlID8gMSA6IDApO1xufVxuXG4vKiogSGFzaCBlbnRpdHkgc3RhdGU7IHdpdGggYSByZWdpb24sIG9ubHkgZW50aXRpZXMgcm9vdGVkIGluc2lkZSBpdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uPzogVm94ZWxSZWdpb24pOiBzdHJpbmcge1xuICBsZXQgZW50aXRpZXM6IEVudGl0eVtdO1xuICBpZiAocmVnaW9uKSB7XG4gICAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gICAgZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgICBlbnRpdGllcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKFxuICAgICAgKGUpID0+IGUueCA+PSByLngwICYmIGUueCA8IHIueDEgKyAxICYmIGUueiA+PSByLnowICYmIGUueiA8IHIuejEgKyAxLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldO1xuICB9XG4gIGVudGl0aWVzLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjplbnRpdHktc3RhdGU6djEnKTtcbiAgaC51MzIoZW50aXRpZXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBlIG9mIGVudGl0aWVzKSBoYXNoRW50aXR5KGgsIGUpO1xuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuLyoqXG4gKiBDYW5vbmljYWwgaGFzaCBvZiBidWlsdCBzdHJ1Y3R1cmVzLiBMYXlvdXQgbW9kdWxlcyBhbmQgcGFpZCBjb3N0cyBhcmVcbiAqIGF1dGhvcml0YXRpdmUgc2ltdWxhdGlvbiBzdGF0ZTsgcmVuZGVyZXIgbWVzaGVzIGFyZSBub3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IHN0cnVjdHVyZXMgPSBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV1cbiAgICAuc29ydCgoYSwgYikgPT4gKGEuaWQgPCBiLmlkID8gLTEgOiBhLmlkID4gYi5pZCA/IDEgOiAwKSk7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnN0cnVjdHVyZS1zdGF0ZTp2MScpO1xuICBoLnUzMihzdHJ1Y3R1cmVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdHJ1Y3R1cmVzKSB7XG4gICAgaC5zdHJpbmcocy5pZCk7XG4gICAgaC5zdHJpbmcocy5raW5kKTtcbiAgICBoLnN0cmluZyhzLnNpdGVJZCk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnggKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnkgKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnogKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnJvdCAqIDEwMDAwKSk7XG4gICAgLy8gTGVnYWN5IGhhc2ggaW5wdXQgaXMgYnl0ZS1pZGVudGljYWwuIERlc2lnbiAyIGFkZHMgYW4gZXhwbGljaXQgdGFnLlxuICAgIGlmIChzLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIGguc3RyaW5nKCdkZXNpZ246MicpO1xuICAgIGgudTMyKHMubW9kdWxlcy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzLm1vZHVsZXMpIHtcbiAgICAgIGguc3RyaW5nKG0ua2luZCk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS55ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnogKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0udyAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5oICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLmQgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKChtLnJvdCA/PyAwKSAqIDEwMDAwKSk7XG4gICAgICBoLnN0cmluZyhtLnRvbmUgPz8gJycpO1xuICAgIH1cbiAgICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHMuY29zdCkuc29ydCgpO1xuICAgIGgudTMyKGNvc3RLZXlzLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIHtcbiAgICAgIGguc3RyaW5nKGtleSk7XG4gICAgICBoLnUzMihzLmNvc3Rba2V5IGFzIGtleW9mIHR5cGVvZiBzLmNvc3RdID8/IDApO1xuICAgIH1cbiAgICBoLnUzMihzLmJ1aWx0UmV2aXNpb24pO1xuICB9XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlSGFzaCB7XG4gIGhhc2g6IHN0cmluZztcbiAgY29sdW1uczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbn1cblxuLyoqIERlcml2ZWQgY29sdW1uLWNhY2hlIGhhc2guIE5vdCBhdXRob3JpdGF0aXZlIHRlcnJhaW4gc3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlZENhY2hlSGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBDYWNoZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmRlcml2ZWQtY29sdW1uLWNhY2hlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpO1xuICBsZXQgY29sdW1ucyA9IDA7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGgudTMyKGNodW5rLmhlaWdodHNbY29sXSk7XG4gICAgICAgIGgudTMyKGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdKTtcbiAgICAgICAgY29sdW1ucysrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjb2x1bW5zLCBjaHVua3M6IGtleXMubGVuZ3RoIH07XG59XG5cbi8qKlxuICogUmVjb21wdXRlIGV2ZXJ5IGNvbHVtbiBjYWNoZSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIGRhdGEgYW5kIHJlcG9ydFxuICogbWlzbWF0Y2hlcy4gVGhpcyBwcm92ZXMgaGVpZ2h0cy90b3BNYXRlcmlhbHMgYXJlIGRlcml2ZWQsIG5vdCBhIHNlY29uZFxuICogdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRGVyaXZlZENhY2hlcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24sIGxpbWl0ID0gNjQpOiBDYWNoZU1pc21hdGNoW10ge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IG91dDogQ2FjaGVNaXNtYXRjaFtdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgICAgbGV0IHRvcE1hdCA9IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdO1xuICAgICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXhwZWN0ZWRIZWlnaHQgPSB0b3BTb2xpZCAtIFlfTUlOO1xuICAgICAgICBpZiAoY2h1bmsuaGVpZ2h0c1tjb2xdICE9PSBleHBlY3RlZEhlaWdodCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdoZWlnaHQnLCBleHBlY3RlZDogZXhwZWN0ZWRIZWlnaHQsIGFjdHVhbDogY2h1bmsuaGVpZ2h0c1tjb2xdIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjaHVuay50b3BNYXRlcmlhbHNbY29sXSAhPT0gdG9wTWF0KSB7XG4gICAgICAgICAgb3V0LnB1c2goeyB4OiBveCArIGx4LCB6OiBveiArIGx6LCBmaWVsZDogJ21hdGVyaWFsJywgZXhwZWN0ZWQ6IHRvcE1hdCwgYWN0dWFsOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3V0Lmxlbmd0aCA+PSBsaW1pdCkgcmV0dXJuIG91dDtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFZGl0T3V0c2lkZSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGluZGV4OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIG1hdGVyaWFsOiBudW1iZXI7XG59XG5cbi8qKiBFdmVyeSByZWNvcmRlZCB2b3hlbCBlZGl0IG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0c091dHNpZGVFbnZlbG9wZSh3b3JsZDogV29ybGQsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogRWRpdE91dHNpZGVbXSB7XG4gIGNvbnN0IG91dDogRWRpdE91dHNpZGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgY29uc3QgbHggPSBpbmRleCAlIENIVU5LX1NJWkU7XG4gICAgICBjb25zdCBseiA9IE1hdGguZmxvb3IoKGluZGV4ICUgQ0hVTktfQVJFQSkgLyBDSFVOS19TSVpFKTtcbiAgICAgIGNvbnN0IHlpID0gTWF0aC5mbG9vcihpbmRleCAvIENIVU5LX0FSRUEpO1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6LCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhlbnZlbG9wZSwgeCwgeSwgeikpIHtcbiAgICAgICAgb3V0LnB1c2goeyBjaHVuazoga2V5LCBpbmRleCwgeCwgeSwgeiwgbWF0ZXJpYWwgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykgfHwgYS5pbmRleCAtIGIuaW5kZXgpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKiogTmV3IGNodW5rcyBnZW5lcmF0ZWQgc2luY2UgdGhlIGJhc2VsaW5lIHRoYXQgZG8gbm90IG92ZXJsYXAgdGhlIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5ld0NodW5rc091dHNpZGVFbnZlbG9wZShcbiAgd29ybGQ6IFdvcmxkLCBiYXNlbGluZUtleXM6IEl0ZXJhYmxlPHN0cmluZz4sIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLFxuKTogc3RyaW5nW10ge1xuICBjb25zdCBiYXNlbGluZSA9IG5ldyBTZXQoYmFzZWxpbmVLZXlzKTtcbiAgY29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGNodW5rXSBvZiB3b3JsZC5jaHVua3MpIHtcbiAgICBpZiAoYmFzZWxpbmUuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IG92ZXJsYXBzID0gZW52ZWxvcGUuc29tZShcbiAgICAgIChyKSA9PiBveCA8PSByLngxICYmIG94ICsgQ0hVTktfU0laRSAtIDEgPj0gci54MCAmJiBveiA8PSByLnoxICYmIG96ICsgQ0hVTktfU0laRSAtIDEgPj0gci56MCxcbiAgICApO1xuICAgIGlmICghb3ZlcmxhcHMpIG91dC5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIG91dC5zb3J0KCk7XG59XG5cbi8qKiBBbGwgY2h1bmsga2V5cyBjdXJyZW50bHkgbWF0ZXJpYWxpc2VkLCBzb3J0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gY2h1bmtLZXlzKHdvcmxkOiBXb3JsZCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIFsuLi53b3JsZC5jaHVua3Mua2V5cygpXS5zb3J0KCk7XG59XG5cbi8qKiBCb3VuZGluZyB2b3hlbCByZWdpb24gY292ZXJpbmcgZXZlcnkgbWF0ZXJpYWxpc2VkIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkQ2h1bmtSZWdpb24od29ybGQ6IFdvcmxkKTogVm94ZWxSZWdpb24ge1xuICBpZiAod29ybGQuY2h1bmtzLnNpemUgPT09IDApIHRocm93IG5ldyBFcnJvcignd29ybGQgaGFzIG5vIGNodW5rcycpO1xuICBsZXQgbWluQ3ggPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN4ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBsZXQgbWluQ3ogPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN6ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IGNodW5rIG9mIHdvcmxkLmNodW5rcy52YWx1ZXMoKSkge1xuICAgIG1pbkN4ID0gTWF0aC5taW4obWluQ3gsIGNodW5rLmN4KTsgbWF4Q3ggPSBNYXRoLm1heChtYXhDeCwgY2h1bmsuY3gpO1xuICAgIG1pbkN6ID0gTWF0aC5taW4obWluQ3osIGNodW5rLmN6KTsgbWF4Q3ogPSBNYXRoLm1heChtYXhDeiwgY2h1bmsuY3opO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChtaW5DeCksXG4gICAgejA6IGNodW5rT3JpZ2luWihtaW5DeiksXG4gICAgeDE6IGNodW5rT3JpZ2luWChtYXhDeCkgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKG1heEN6KSArIENIVU5LX1NJWkUgLSAxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9O1xufVxuIiwgIi8vIE0wMDIgZGV0ZXJtaW5pc3RpYyBmaXh0dXJlIGFuZCBsaXZlLXdvcmxkIGxheW91dC5cbi8vXG4vLyBUaGUgZml4dHVyZSBpcyBhIGJvdW5kZWQgc2xpY2Ugb2YgdGhlIHJlYWwgMjA0OCBtIHdvcmxkIChzZWVkIDEzMzcpLCBub3QgYVxuLy8gc3ludGhldGljIGhlaWdodGZpZWxkLiBJdCBjb250YWluczpcbi8vICAgKiBhIHJlamVjdGVkIGhvdXNlIHNpdGUgb24gYSA3IG0gcml2ZXItYmFuayBzbG9wZTtcbi8vICAgKiBhIHZpYWJsZSBob3VzZSBzaGVsZiAyMCBtIGF3YXkgd2l0aCAyIG0gcmVsaWVmIGFuZCBubyBjbGVhcmluZyBuZWVkZWQ7XG4vLyAgICogYSAzIG0gZmFybSBzbG9wZSAyNyBtIGZyb20gdGhlIGhvdXNlIHdpdGggYSBuYXR1cmFsIGJsb3Nzb20gdHJlZSBhbmQgb3JlLlxuLy9cbi8vIFRoZSBzYW1lIGNvb3JkaW5hdGVzLCBxdWVyaWVzIGFuZCB2YWxpZGF0b3JzIGFyZSB1c2VkIGJ5IHRoZSBsaXZlLXdvcmxkXG4vLyBhY2NlcHRhbmNlIHRlc3QuIFRoZSBvbmx5IGRpZmZlcmVuY2UgaXMgaG93IG1hbnkgY2h1bmtzIGFyZSBtYXRlcmlhbGlzZWQuXG5pbXBvcnQge1xuICBXb3JsZCwgY3JlYXRlV29ybGQsIGdlbmVyYXRlV29ybGQsIGdlbmVyYXRlQ2h1bmssIHBsYWNlQXV0aG9yZWRTaXRlcyxcbiAgWV9NSU4sIFlfTUFYLCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWixcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBSZWN0LCBWb3hlbFJlZ2lvbiB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBjaHVua0tleXMgfSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBNMDAyX1NFRUQgPSAxMzM3O1xuXG4vKiogUGlubmVkIHBhdGggc2l0ZSBpZCBmb3IgdGhlIGRvb3ItdG8tYXBwcm9hY2ggY29ycmlkb3IuICovXG5leHBvcnQgY29uc3QgTTAwMl9QQVRIX1NJVEVfSUQgPSAncGF0aC1ob3VzZS1mYXJtJztcblxuLyoqXG4gKiBQaW5uZWQgc3RlcHBlZCBwcm9maWxlIGZvciB0aGUgOSBtIHBhdGggZnJvbSB0aGUgaG91c2UgZG9vciAoeCA9IC01MykgdG8gdGhlXG4gKiBhcHByb2FjaCAoeCA9IC00NSkuIFRoZSByaXNlIGlzIDIgbSBvdmVyIDggbTsgZXZlcnkgc3RlcCBpcyBhdCBtb3N0IDEgbS5cbiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9QUk9GSUxFID0gWzExLCAxMSwgMTEsIDEyLCAxMiwgMTIsIDEyLCAxMywgMTNdIGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhY2VCYW5kU3BlYyB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuLyoqIFBpbm5lZCBmYXJtIHRlcnJhY2VzLCBoaWdoIHNpZGUgZmlyc3QuICovXG5leHBvcnQgY29uc3QgTTAwMl9URVJSQUNFX0JBTkRTOiByZWFkb25seSBUZXJyYWNlQmFuZFNwZWNbXSA9IFtcbiAgeyB6MDogLTQyLCB6MTogLTQwLCB5OiAxNiB9LFxuICB7IHowOiAtMzksIHoxOiAtMzcsIHk6IDE1IH0sXG4gIHsgejA6IC0zNiwgejE6IC0zNSwgeTogMTQgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNwZWMge1xuICBpZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgZG9vcjogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZhcm1TcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgdGVycmFjZXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyTGF5b3V0IHtcbiAgc2VlZDogbnVtYmVyO1xuICByZWplY3RlZDogU2l0ZVNwZWM7XG4gIGhvdXNlOiBTaXRlU3BlYztcbiAgZmFybTogRmFybVNwZWM7XG4gIHNlYXJjaEFyZWE6IFJlY3Q7XG4gIHdvcmtab25lOiBSZWN0O1xuICBmaXh0dXJlQ2h1bmtzOiB7IGN4MDogbnVtYmVyOyBjejA6IG51bWJlcjsgY3gxOiBudW1iZXI7IGN6MTogbnVtYmVyIH07XG4gIHByb3RlY3RlZFJlZ2lvbjogVm94ZWxSZWdpb247XG4gIC8qKiBDb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUgZm9yIHRoZSBmaXJzdCBzbGljZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmNvbnN0IEZJWFRVUkVfQ0hVTktTID0geyBjeDA6IDI4LCBjejA6IDI5LCBjeDE6IDMyLCBjejE6IDMyIH0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBNMDAyX0xBWU9VVDogTTAwMkxheW91dCA9IHtcbiAgc2VlZDogTTAwMl9TRUVELFxuICByZWplY3RlZDoge1xuICAgIGlkOiAnc2l0ZS1hLXJlamVjdGVkJyxcbiAgICByZWN0OiB7IHgwOiAtNzQsIHowOiAtNjYsIHgxOiAtNjcsIHoxOiAtNjEgfSxcbiAgICAvLyBBIG5haXZlIGxvdy1zaWRlIGZsb29yOiB0aGUgdXBoaWxsIGNvcm5lciB3b3VsZCBuZWVkIDUgbSBvZiBleGNhdmF0aW9uLlxuICAgIGZsb29yWTogMyxcbiAgICBkb29yOiB7IHg6IC02NywgejogLTYzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTYwLCB6OiAtNjMgfSxcbiAgfSxcbiAgaG91c2U6IHtcbiAgICBpZDogJ3NpdGUtYi1ob3VzZScsXG4gICAgcmVjdDogeyB4MDogLTYwLCB6MDogLTQ2LCB4MTogLTUzLCB6MTogLTQxIH0sXG4gICAgZmxvb3JZOiAxMSxcbiAgICBkb29yOiB7IHg6IC01MywgejogLTQzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTQ1LCB6OiAtNDMgfSxcbiAgfSxcbiAgZmFybToge1xuICAgIGlkOiAnZmllbGQtYycsXG4gICAgcmVjdDogeyB4MDogLTM4LCB6MDogLTQyLCB4MTogLTI3LCB6MTogLTM1IH0sXG4gICAgdGVycmFjZXM6IDMsXG4gIH0sXG4gIHNlYXJjaEFyZWE6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC00MCwgejE6IC00MCB9LFxuICB3b3JrWm9uZTogeyB4MDogLTc2LCB6MDogLTY4LCB4MTogLTIzLCB6MTogLTMxIH0sXG4gIGZpeHR1cmVDaHVua3M6IEZJWFRVUkVfQ0hVTktTLFxuICBwcm90ZWN0ZWRSZWdpb246IHtcbiAgICB4MDogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MCksXG4gICAgejA6IGNodW5rT3JpZ2luWihGSVhUVVJFX0NIVU5LUy5jejApLFxuICAgIHgxOiBjaHVua09yaWdpblgoRklYVFVSRV9DSFVOS1MuY3gxKSArIDMxLFxuICAgIHoxOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3oxKSArIDMxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9LFxuICBlbnZlbG9wZTogW1xuICAgIC8vIEhvdXNlIGZvb3RwcmludCBwbHVzIGEgMiBtIHByZXBhcmF0aW9uIGJ1ZmZlci5cbiAgICB7IHgwOiAtNjIsIHowOiAtNDgsIHgxOiAtNTEsIHoxOiAtMzksIHkwOiA4LCB5MTogMTYgfSxcbiAgICAvLyBEb29yLXRvLWFwcHJvYWNoIHBhdGggY29ycmlkb3IgcGx1cyBhIDEgbSBidWZmZXIuXG4gICAgeyB4MDogLTU0LCB6MDogLTQ0LCB4MTogLTQ0LCB6MTogLTQyLCB5MDogOSwgeTE6IDE1IH0sXG4gICAgLy8gRmFybSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTQwLCB6MDogLTQ0LCB4MTogLTI1LCB6MTogLTMzLCB5MDogMTAsIHkxOiAyMCB9LFxuICBdLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBNMDAyV29ybGQge1xuICB3b3JsZDogV29ybGQ7XG4gIGxheW91dDogTTAwMkxheW91dDtcbiAgLyoqIFNvcnRlZCBjaHVuayBrZXlzIG1hdGVyaWFsaXNlZCBhdCBmaXh0dXJlIGNyZWF0aW9uLiAqL1xuICBjaHVua0tleXM6IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIFNtYWxsIGRldGVybWluaXN0aWMgZml4dHVyZTogdGhlIDIwIGNodW5rcyBjb3ZlcmluZyB0aGUgd29yayB6b25lIGFuZCBpdHNcbiAqIHByb3RlY3RlZCBzdXJyb3VuZGluZ3MuIEZhc3QgZW5vdWdoIGZvciB0aGUgZnVsbCB0ZXN0IHN1aXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkZpeHR1cmUoc2VlZCA9IE0wMDJfU0VFRCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCk7XG4gIGNvbnN0IHsgY3gwLCBjejAsIGN4MSwgY3oxIH0gPSBNMDAyX0xBWU9VVC5maXh0dXJlQ2h1bmtzO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG5cbi8qKlxuICogTGl2ZS13b3JsZCBpbnRlZ3JhdGlvbiB0YXJnZXQ6IHRoZSBzYW1lIHNlZWQgYW5kIHNpdGVzIHdpdGggYSA5IHggOSBjaHVua1xuICogbmVpZ2hib3VyaG9vZCAoODEgY2h1bmtzKSBhcm91bmQgdGhlIGZvdW5kZXIgdmFsbGV5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkxpdmUoc2VlZCA9IE0wMDJfU0VFRCwgcmFkaXVzID0gNCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gZ2VuZXJhdGVXb3JsZChzZWVkLCByYWRpdXMpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG4iLCAiLy8gTTAwMiBzdGFnZSA3IHNjZW5hcmlvIHdpcmluZzogdGhlIHBpbm5lZCBmaXJzdCBzbGljZSwgcnVuIHRocm91Z2ggdGhlIHNhbWVcbi8vIHB1YmxpYyBzaW11bGF0aW9uIHBpcGVsaW5lIHVzZWQgYnkgdGhlIHBsYXllciwgdGhlIEFJIGFuZCB0aGUgdGVzdHMuXG4vL1xuLy8gVGhlIHNjZW5hcmlvIGlzIGRlbGliZXJhdGVseSBwbGFpbiBkYXRhIGluIC8gZGF0YSBvdXQuIEl0IGRvZXMgbm90IHRvdWNoIHRoZVxuLy8gcmVuZGVyZXIsIGFuZCBldmVyeSB0ZXJyYWluIGVkaXQgc3RpbGwgZ29lcyB0aHJvdWdoIHByZXBhcmVTaXRlIC0+XG4vLyBMb2NhbEF1dGhvcml6ZXIgLT4gZXhlY3V0ZVByZXBhcmF0aW9uLiBTdHJ1Y3R1cmVzIHN0aWxsIGdvIHRocm91Z2hcbi8vIGJ1aWxkU3RydWN0dXJlIC0+IExvY2FsU3RydWN0dXJlQXV0aG9yaXplciAtPiBleGVjdXRlU3RydWN0dXJlLlxuaW1wb3J0IHsgTUFULCBSZXNvdXJjZVR5cGUgfSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIE0wMDJXb3JsZCwgTTAwMl9MQVlPVVQsIE0wMDJfUEFUSF9QUk9GSUxFLCBNMDAyX1BBVEhfU0lURV9JRCxcbiAgTTAwMl9URVJSQUNFX0JBTkRTLFxufSBmcm9tICcuL20wMDInO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBIT1VTRV9SVUxFUywgUEFUSF9SVUxFUywgRkFSTV9SVUxFUyB9IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIENvbHVtblRhcmdldCwgTG9jYWxBdXRob3JpemVyLCBwcmVwYXJlU2l0ZSwgUHJlcGFyYXRpb25MZWRnZXIsXG59IGZyb20gJy4vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHtcbiAgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLCBidWlsZFN0cnVjdHVyZSwgU3RydWN0dXJlTGVkZ2VyLFxufSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHtcbiAgY2Fub25pY2FsRW50aXR5SGFzaCwgY2Fub25pY2FsSW52ZW50b3J5SGFzaCwgY2Fub25pY2FsUmVnaW9uSGFzaCxcbiAgY2Fub25pY2FsU3RydWN0dXJlSGFzaCwgaW52ZW50b3J5U25hcHNob3QsXG59IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlk6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIG51bWJlcj4+ID0ge1xuICB3b29kOiAyNCxcbiAgc3RvbmU6IDQ4LFxufTtcblxuLyoqIFRoZSA5IHggMyBtIGNvcnJpZG9yIGZyb20gdGhlIGhvdXNlIGRvb3IgdG8gdGhlIGFwcHJvYWNoLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJQYXRoUmVjdCgpOiBSZWN0IHtcbiAgY29uc3QgZG9vciA9IE0wMDJfTEFZT1VULmhvdXNlLmRvb3I7XG4gIGNvbnN0IGFwcHJvYWNoID0gTTAwMl9MQVlPVVQuaG91c2UuYXBwcm9hY2g7XG4gIHJldHVybiB7XG4gICAgeDA6IGRvb3IueCxcbiAgICB6MDogZG9vci56IC0gMSxcbiAgICB4MTogYXBwcm9hY2gueCxcbiAgICB6MTogZG9vci56ICsgMSxcbiAgfTtcbn1cblxuLyoqIE9uZSB0YXJnZXQgcGVyIHBhdGggY29sdW1uLCB1c2luZyB0aGUgcGlubmVkIHN0ZXBwZWQgcHJvZmlsZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyUGF0aFRhcmdldHMoKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCByZWN0ID0gbTAwMlBhdGhSZWN0KCk7XG4gIGNvbnN0IHRhcmdldHM6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgTTAwMl9QQVRIX1BST0ZJTEUubGVuZ3RoOyBpKyspIHtcbiAgICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICAgIHRhcmdldHMucHVzaCh7IHg6IHJlY3QueDAgKyBpLCB6LCB5OiBNMDAyX1BBVEhfUFJPRklMRVtpXSB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRhcmdldHM7XG59XG5cbi8qKiBPbmUgdGFyZ2V0IHBlciBmYXJtIGNvbHVtbiwgdXNpbmcgdGhlIHBpbm5lZCB0ZXJyYWNlIGJhbmRzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJGYXJtVGFyZ2V0cygpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IHJlY3QgPSBNMDAyX0xBWU9VVC5mYXJtLnJlY3Q7XG4gIGNvbnN0IHRhcmdldHM6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAoY29uc3QgYmFuZCBvZiBNMDAyX1RFUlJBQ0VfQkFORFMpIHtcbiAgICBmb3IgKGxldCB6ID0gYmFuZC56MDsgeiA8PSBiYW5kLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgICB0YXJnZXRzLnB1c2goeyB4LCB6LCB5OiBiYW5kLnkgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB0YXJnZXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb09wdGlvbnMge1xuICAvKiogU3RhcnRlciByZXNvdXJjZXMgYmVmb3JlIHRoZSBzbGljZSBydW5zLiBEZWZhdWx0cyB0byB3b29kIDI0IC8gc3RvbmUgNDguICovXG4gIGludmVudG9yeT86IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvU2l0ZSB7XG4gIHByZXBhcmF0aW9uOiBQcmVwYXJhdGlvbkxlZGdlciB8IG51bGw7XG4gIHN0cnVjdHVyZTogU3RydWN0dXJlTGVkZ2VyIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9SZXN1bHQge1xuICBvazogYm9vbGVhbjtcbiAgZXJyb3JzOiBzdHJpbmdbXTtcbiAgaG91c2U6IE0wMDJTY2VuYXJpb1NpdGU7XG4gIHBhdGg6IE0wMDJTY2VuYXJpb1NpdGU7XG4gIGZhcm06IE0wMDJTY2VuYXJpb1NpdGU7XG4gIGludmVudG9yeUJlZm9yZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaW52ZW50b3J5QWZ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGhhc2hlczoge1xuICAgIHZveGVsczogc3RyaW5nO1xuICAgIHN0cnVjdHVyZXM6IHN0cmluZztcbiAgICBpbnZlbnRvcnk6IHN0cmluZztcbiAgICBlbnRpdGllczogc3RyaW5nO1xuICB9O1xufVxuXG5mdW5jdGlvbiBlbXB0eVNpdGUoKTogTTAwMlNjZW5hcmlvU2l0ZSB7XG4gIHJldHVybiB7IHByZXBhcmF0aW9uOiBudWxsLCBzdHJ1Y3R1cmU6IG51bGwgfTtcbn1cblxuZnVuY3Rpb24gZGVzY3JpYmVGYWlsdXJlKHJlc3VsdDogeyBjb2RlOiBzdHJpbmc7IHJlYXNvbnM6IHN0cmluZ1tdIH0pOiBzdHJpbmcge1xuICByZXR1cm4gYCR7cmVzdWx0LmNvZGV9OiAke3Jlc3VsdC5yZWFzb25zLmpvaW4oJzsgJyl9YDtcbn1cblxuLyoqXG4gKiBSdW4gaG91c2UsIHBhdGggYW5kIHRlcnJhY2VkIGZhcm0gaW4gdGhlaXIgcGlubmVkIG9yZGVyLiBBIGZhaWxlZCBzdGVwIGlzXG4gKiByZWNvcmRlZCBhbmQgbGF0ZXIgaW5kZXBlbmRlbnQgc3RlcHMgc3RpbGwgcnVuOyBhIHN0cnVjdHVyZSBpcyBuZXZlciBidWlsdFxuICogdW5sZXNzIGl0cyBvd24gdGVycmFpbiBwcmVwYXJhdGlvbiBzdWNjZWVkZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBydW5NMDAyU2NlbmFyaW8oXG4gIG0wMDI6IE0wMDJXb3JsZCwgb3B0aW9uczogTTAwMlNjZW5hcmlvT3B0aW9ucyA9IHt9LFxuKTogTTAwMlNjZW5hcmlvUmVzdWx0IHtcbiAgY29uc3QgeyB3b3JsZCwgbGF5b3V0IH0gPSBtMDAyO1xuICBjb25zdCBzdGFydGVyID0gb3B0aW9ucy5pbnZlbnRvcnkgPz8gTTAwMl9TVEFSVEVSX0lOVkVOVE9SWTtcbiAgd29ybGQuaW52ZW50b3J5ID0ge307XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHN0YXJ0ZXIpKSB7XG4gICAgaWYgKChhbW91bnQgPz8gMCkgPiAwKSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID0gYW1vdW50IGFzIG51bWJlcjtcbiAgfVxuXG4gIGNvbnN0IHByZXBBdXRob3JpemVyID0gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBsYXlvdXQuZW52ZWxvcGUgfSk7XG4gIGNvbnN0IHN0cnVjdHVyZUF1dGhvcml6ZXIgPSBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKHsgZW52ZWxvcGU6IGxheW91dC5lbnZlbG9wZSB9KTtcbiAgY29uc3QgaW52ZW50b3J5QmVmb3JlID0gaW52ZW50b3J5U25hcHNob3Qod29ybGQpO1xuICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGhvdXNlID0gZW1wdHlTaXRlKCk7XG4gIGNvbnN0IHBhdGggPSBlbXB0eVNpdGUoKTtcbiAgY29uc3QgZmFybSA9IGVtcHR5U2l0ZSgpO1xuXG4gIGNvbnN0IGhvdXNlUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogbGF5b3V0LmhvdXNlLmlkLFxuICAgIHJlY3Q6IGxheW91dC5ob3VzZS5yZWN0LFxuICAgIGZsb29yWTogbGF5b3V0LmhvdXNlLmZsb29yWSxcbiAgICBydWxlczogSE9VU0VfUlVMRVMsXG4gIH0pO1xuICBpZiAoIWhvdXNlUHJlcC5vaykge1xuICAgIGVycm9ycy5wdXNoKGBob3VzZSBwcmVwYXJhdGlvbjogJHtkZXNjcmliZUZhaWx1cmUoaG91c2VQcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBob3VzZS5wcmVwYXJhdGlvbiA9IGhvdXNlUHJlcC5sZWRnZXI7XG4gICAgY29uc3QgaG91c2VCdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IGxheW91dC5ob3VzZS5pZCxcbiAgICAgIGtpbmQ6ICdob3VzZScsXG4gICAgICByZWN0OiBsYXlvdXQuaG91c2UucmVjdCxcbiAgICAgIGZsb29yWTogbGF5b3V0LmhvdXNlLmZsb29yWSxcbiAgICAgIGRvb3I6IGxheW91dC5ob3VzZS5kb29yLFxuICAgIH0pO1xuICAgIGlmICghaG91c2VCdWlsZC5vaykge1xuICAgICAgZXJyb3JzLnB1c2goYGhvdXNlIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUoaG91c2VCdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhvdXNlLnN0cnVjdHVyZSA9IGhvdXNlQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBhdGhSZWN0ID0gbTAwMlBhdGhSZWN0KCk7XG4gIGNvbnN0IHBhdGhQcmVwID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICByZWN0OiBwYXRoUmVjdCxcbiAgICBmbG9vclk6IDEyLFxuICAgIHJ1bGVzOiBQQVRIX1JVTEVTLFxuICB9LCB7XG4gICAgdGFyZ2V0czogbTAwMlBhdGhUYXJnZXRzKCksXG4gICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuR1JBVkVMLFxuICAgIGVudmVsb3BlOiBbbGF5b3V0LmVudmVsb3BlWzFdXSxcbiAgfSk7XG4gIGlmICghcGF0aFByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgcGF0aCBwcmVwYXJhdGlvbjogJHtkZXNjcmliZUZhaWx1cmUocGF0aFByZXApfWApO1xuICB9IGVsc2Uge1xuICAgIHBhdGgucHJlcGFyYXRpb24gPSBwYXRoUHJlcC5sZWRnZXI7XG4gICAgY29uc3QgcGF0aEJ1aWxkID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHtcbiAgICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAgICBraW5kOiAncGF0aCcsXG4gICAgICByZWN0OiBwYXRoUmVjdCxcbiAgICAgIGZsb29yWTogMTIsXG4gICAgfSk7XG4gICAgaWYgKCFwYXRoQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBwYXRoIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUocGF0aEJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGF0aC5zdHJ1Y3R1cmUgPSBwYXRoQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZhcm1QcmVwID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBsYXlvdXQuZmFybS5pZCxcbiAgICByZWN0OiBsYXlvdXQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyRmFybVRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5TT0lMLFxuICAgIGVudmVsb3BlOiBbbGF5b3V0LmVudmVsb3BlWzJdXSxcbiAgfSk7XG4gIGlmICghZmFybVByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgZmFybSBwcmVwYXJhdGlvbjogJHtkZXNjcmliZUZhaWx1cmUoZmFybVByZXApfWApO1xuICB9IGVsc2Uge1xuICAgIGZhcm0ucHJlcGFyYXRpb24gPSBmYXJtUHJlcC5sZWRnZXI7XG4gICAgY29uc3QgZmFybUJ1aWxkID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHtcbiAgICAgIHNpdGVJZDogbGF5b3V0LmZhcm0uaWQsXG4gICAgICBraW5kOiAndGVycmFjZScsXG4gICAgICByZWN0OiBsYXlvdXQuZmFybS5yZWN0LFxuICAgICAgZmxvb3JZOiAxNSxcbiAgICAgIHRlcnJhY2VzOiBsYXlvdXQuZmFybS50ZXJyYWNlcyxcbiAgICB9KTtcbiAgICBpZiAoIWZhcm1CdWlsZC5vaykge1xuICAgICAgZXJyb3JzLnB1c2goYGZhcm0gc3RydWN0dXJlOiAke2Rlc2NyaWJlRmFpbHVyZShmYXJtQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBmYXJtLnN0cnVjdHVyZSA9IGZhcm1CdWlsZC5sZWRnZXI7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogZXJyb3JzLmxlbmd0aCA9PT0gMCxcbiAgICBlcnJvcnMsXG4gICAgaG91c2UsXG4gICAgcGF0aCxcbiAgICBmYXJtLFxuICAgIGludmVudG9yeUJlZm9yZSxcbiAgICBpbnZlbnRvcnlBZnRlcjogaW52ZW50b3J5U25hcHNob3Qod29ybGQpLFxuICAgIGhhc2hlczoge1xuICAgICAgdm94ZWxzOiBjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uKS5oYXNoLFxuICAgICAgc3RydWN0dXJlczogY2Fub25pY2FsU3RydWN0dXJlSGFzaCh3b3JsZCksXG4gICAgICBpbnZlbnRvcnk6IGNhbm9uaWNhbEludmVudG9yeUhhc2god29ybGQpLFxuICAgICAgZW50aXRpZXM6IGNhbm9uaWNhbEVudGl0eUhhc2god29ybGQsIGxheW91dC5wcm90ZWN0ZWRSZWdpb24pLFxuICAgIH0sXG4gIH07XG59XG5cbi8qKiBUb3RhbCByZXNvdXJjZXMgcGFpZCB0byBzdHJ1Y3R1cmVzIGluIGEgc2NlbmFyaW8gcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJTdHJ1Y3R1cmVDb3N0cyhyZXN1bHQ6IE0wMDJTY2VuYXJpb1Jlc3VsdCk6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICBjb25zdCB0b3RhbDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHt9O1xuICBmb3IgKGNvbnN0IHNpdGUgb2YgW3Jlc3VsdC5ob3VzZSwgcmVzdWx0LnBhdGgsIHJlc3VsdC5mYXJtXSkge1xuICAgIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHNpdGUuc3RydWN0dXJlPy5jb3N0UGFpZCA/PyB7fSkpIHtcbiAgICAgIHRvdGFsW3Jlc291cmNlIGFzIFJlc291cmNlVHlwZV0gPSAodG90YWxbcmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlXSA/PyAwKSArIChhbW91bnQgPz8gMCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0b3RhbDtcbn1cbiIsICIvLyBNMDEwIG5hdmlnYXRpb246IGEgcmV1c2FibGUsIGRldGVybWluaXN0aWMgd2Fsa2luZyBsYXllciBvdmVyIHRoZVxuLy8gYXV0aG9yaXRhdGl2ZSB3b3JsZCwgZm9yIHZpbGxhZ2VycyB0b2RheSBhbmQgYW55IGxhdGVyIHByb2Zlc3Npb24uXG4vL1xuLy8gTGF5ZXJzIChhbGwgZGVyaXZlZCwgbmV2ZXIgc2F2ZWQ7IHJlYnVpbHQgb25seSB3aGVuIHRoZWlyIGlucHV0cyBjaGFuZ2UpOlxuLy8gIC0gdGVycmFpbjogd2Fsa2luZyBoZWlnaHQgYW5kIHdhdGVyIGRlcHRoIG9mIGV2ZXJ5IDEgbSBjb2x1bW4gaW4gYSB3aW5kb3dcbi8vICAgIGFyb3VuZCB0aGUgc2V0dGxlbWVudCwgcmVhZCBmcm9tIHRoZSB2b3hlbHMgKGtleWVkIG9uIHRoZSBlZGl0IG92ZXJsYXkpO1xuLy8gIC0gbmF0dXJlIGFuZCBzdHJ1Y3R1cmVzOiB0cmVlcyBieSBncm93dGggc3RhZ2UsIGJ1c2hlcywgb3JlLCBsYW5kbWFya3MgYW5kXG4vLyAgICBidWlsdCBtb2R1bGVzIChrZXllZCBvbiB0aGUgd29ybGQgcmV2aXNpb24pO1xuLy8gIC0gZmVhdHVyZXMgc3VwcGxpZWQgYnkgdGhlIGNhbGxlciAodGhlIGhvbWVzdGVhZCk6IGJ1aWxkaW5ncyB3aXRoIGRvb3JzLFxuLy8gICAgZmVuY2VzIG9uIGNlbGwgZWRnZXMgd2l0aCBvcGVuaW5ncyBhbmQgZ2F0ZXMsIG9jY3VwaWVkIGNlbGxzLCBjcm9wIGNvc3RzLlxuLy9cbi8vIFJ1bGVzOiBuZWlnaGJvdXJpbmcgY29sdW1ucyBtYXkgZGlmZmVyIGJ5IGF0IG1vc3QgTUFYX1NURVAgbWV0cmUgKGEgc3RlcCk7XG4vLyBtb3JlIGlzIGEgY2xpZmYuIFdhdGVyIGRlZXBlciB0aGFuIFdBREVfTUFYIGlzIGRhbmdlcm91cyBhbmQgaW1wYXNzYWJsZTtcbi8vIHNoYWxsb3dlciB3YXRlciBpcyBhIGZvcmQgd2l0aCBhIGNvc3QuIEEgYnJpZGdlIChvciBhbnkgZGVjaykgc3VwcGxpZXMgYVxuLy8gd2Fsa2luZyBoZWlnaHQgdGhhdCBvdmVycmlkZXMgdGhlIHdhdGVyLiBGZW5jZXMgYmxvY2sgdGhlIGNlbGwgZWRnZSB0aGV5XG4vLyBzdGFuZCBvbjsgYSBnYXRlIG9yIGRvb3IgaXMgYW4gZWRnZSB0aGF0IGlzIHBhc3NhYmxlIHVubGVzcyBsb2NrZWQsIGFuZCB0aGVcbi8vIHdhbGtlciBoYXMgdG8gc3RvcCBhbmQgb3BlbiBpdCB3aGVuIGNsb3NlZC4gRGlhZ29uYWwgbW92ZXMgbmV2ZXIgY3V0IGFcbi8vIGJsb2NrZWQgY29ybmVyLCBhIGZlbmNlIG9yIGEgZ2F0ZSwgc28gZXZlcnkgZ2F0ZSBjcm9zc2luZyBpcyBvcnRob2dvbmFsLlxuLy9cbi8vIFNlYXJjaCBpcyBBKiB3aXRoIGludGVnZXIgY29zdHMsIGFuIGFkbWlzc2libGUgb2N0aWxlIGhldXJpc3RpYyBhbmQgYSB0b3RhbFxuLy8gb3JkZXIgb24gdGhlIG9wZW4gbGlzdCAoZiwgdGhlbiBoLCB0aGVuIGNlbGwgaW5kZXgpLCBzbyBlcXVhbCBpbnB1dHMgZ2l2ZVxuLy8gZXF1YWwgcGF0aHMgZXZlcnl3aGVyZS4gRXZlcnkgc2VhcmNoIGlzIGJvdW5kZWQgYnkgYW4gZXhwYW5zaW9uIGJ1ZGdldCB0aGVcbi8vIGNhbGxlciBwYXNzZXMgaW4uIEEgd2Fsa2VyIHN0b3JlcyBpdHMgcm91dGUgKGNvcm5lciBjZWxscyksIHRoZSBncmlkIGhhc2ggaXRcbi8vIHdhcyBwbGFubmVkIG9uIGFuZCBpdHMgZGVzdGluYXRpb247IGFueSBncmlkIGNoYW5nZSAoYSBnYXRlIGxvY2tlZCwgYSB0cmVlXG4vLyBmZWxsZWQsIGEgZmllbGQgbWFya2VkLCBhIHZveGVsIGVkaXQpIGNoYW5nZXMgdGhlIGhhc2ggYW5kIHRoZSB3YWxrZXJcbi8vIHJlcGxhbnMgZnJvbSB3aGVyZSBpdCBzdGFuZHMuIEFsbCBvZiB0aGF0IGlzIHBsYWluIGludGVnZXIvc3RyaW5nIHN0YXRlLCBzb1xuLy8gYSByZXN0b3JlZCBzbmFwc2hvdCBjb250aW51ZXMgZXhhY3RseSBhcyB0aGUgbGl2ZSBydW4gZGlkLlxuaW1wb3J0IHR5cGUgeyBXb3JsZCB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgQ0hVTktfU0laRSwgSEFMRiwgY2h1bmtLZXksIGVkaXRWZXJzaW9uLCBpc1JldGlyZWRTdG9uZUtpbmQsIHN1cmZhY2VBdCwgd2F0ZXJEZXB0aEF0LFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFNUQUdFX0ZPT1RQUklOVCwgZ3Jvd3RoU3RhZ2UgfSBmcm9tICcuL3ZlZ2V0YXRpb24nO1xuXG5leHBvcnQgdHlwZSBHYXRlU3RhdGUgPSAnb3BlbicgfCAnY2xvc2VkJyB8ICdsb2NrZWQnO1xuZXhwb3J0IGNvbnN0IEdBVEVfU1RBVEVTOiByZWFkb25seSBHYXRlU3RhdGVbXSA9IFsnY2xvc2VkJywgJ2xvY2tlZCcsICdvcGVuJ107XG5cbi8qKiBXaHkgYSBjZWxsIGNhbm5vdCBiZSBzdG9vZCBvbiAoMCA9IGl0IGNhbikuICovXG5leHBvcnQgY29uc3QgQkxPQ0sgPSB7XG4gIG5vbmU6IDAsIG91dHNpZGU6IDEsIGRlZXBfd2F0ZXI6IDIsIGJ1aWxkaW5nOiAzLCBvY2N1cGllZDogNCwgdHJlZTogNSwgcm9jazogNiwgbGFuZG1hcms6IDcsIHN0cnVjdHVyZTogOCxcbn0gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBCbG9ja1JlYXNvbiA9IGtleW9mIHR5cGVvZiBCTE9DSztcbmNvbnN0IFJFQVNPTl9OQU1FUyA9IE9iamVjdC5rZXlzKEJMT0NLKSBhcyBCbG9ja1JlYXNvbltdO1xuZXhwb3J0IGNvbnN0IFJFQVNPTl9URVhUOiBSZWNvcmQ8QmxvY2tSZWFzb24sIHN0cmluZz4gPSB7XG4gIG5vbmU6ICdvcGVuIGdyb3VuZCcsIG91dHNpZGU6ICdvdXRzaWRlIHRoZSBzZXR0bGVtZW50JywgZGVlcF93YXRlcjogJ2RlZXAgd2F0ZXInLCBidWlsZGluZzogJ2EgYnVpbGRpbmcnLFxuICBvY2N1cGllZDogJ2FuIG9jY3VwaWVkIHNwYWNlJywgdHJlZTogJ2EgdHJlZScsIHJvY2s6ICdhIHJvY2snLCBsYW5kbWFyazogJ2EgbGFuZG1hcmsnLCBzdHJ1Y3R1cmU6ICdhIGJ1aWx0IHdhbGwnLFxufTtcblxuLy8gQ29zdHMgYXJlIHRlbnRocyBvZiBhIG1ldHJlIHdhbGtlZCwgc28gdGhlIG9jdGlsZSBoZXVyaXN0aWMgaXMgYWRtaXNzaWJsZS5cbmV4cG9ydCBjb25zdCBDT1NUX1NUUkFJR0hUID0gMTA7XG5leHBvcnQgY29uc3QgQ09TVF9ESUFHT05BTCA9IDE0O1xuLyoqIEV4dHJhIGZvciBhIG9uZS1tZXRyZSBzdGVwIHVwIG9yIGRvd24uICovXG5leHBvcnQgY29uc3QgQ09TVF9TVEVQID0gNjtcbi8qKiBFeHRyYSBmb3Igd2FkaW5nIGEgc2hhbGxvdyBmb3JkLiAqL1xuZXhwb3J0IGNvbnN0IENPU1RfRk9SRCA9IDIwO1xuLyoqIEV4dHJhIGZvciBjcm9zc2luZyBhIGdhdGUgb3IgZG9vciAob3BlbmluZyBhbmQgY2xvc2luZyBpdCkuICovXG5leHBvcnQgY29uc3QgQ09TVF9HQVRFID0gNDtcbi8qKiBFeHRyYSBmb3IgcHVzaGluZyB0aHJvdWdoIGEgYnVzaC4gKi9cbmV4cG9ydCBjb25zdCBDT1NUX0JVU0ggPSA4O1xuLyoqIEhpZ2hlc3QgaGVpZ2h0IGRpZmZlcmVuY2UgKG0pIGJldHdlZW4gbmVpZ2hib3VyaW5nIGNvbHVtbnMgYSB3YWxrZXIgY2FuIHN0ZXAuICovXG5leHBvcnQgY29uc3QgTUFYX1NURVAgPSAxO1xuLyoqIERlZXBlc3Qgd2F0ZXIgKG0pIGEgd2Fsa2VyIG1heSBmb3JkLiBEZWVwZXIgaXMgZGFuZ2Vyb3VzIGFuZCBhdm9pZGVkLiAqL1xuZXhwb3J0IGNvbnN0IFdBREVfTUFYID0gMTtcblxuY29uc3QgV0FMTF9FID0gMSwgV0FMTF9TID0gMiwgR0FURV9FID0gNCwgR0FURV9TID0gODtcblxuZXhwb3J0IGludGVyZmFjZSBDZWxsUmVjdCB7IHgwOiBudW1iZXI7IHowOiBudW1iZXI7IHgxOiBudW1iZXI7IHoxOiBudW1iZXIgfSAvLyB3b3JsZCBtZXRyZXMsIFt4MCwgeDEpIGNlbGxzXG5leHBvcnQgdHlwZSBTaWRlID0gJ24nIHwgJ3MnIHwgJ2UnIHwgJ3cnO1xuLyoqIEEgZ2F0ZSBvciBkb29yIG9uIHRoZSBlZGdlIGJldHdlZW4gY2VsbCAoeCwgeikgYW5kIGl0cyBuZWlnaGJvdXIgb24gYHNpZGVgLiAqL1xuZXhwb3J0IGludGVyZmFjZSBOYXZHYXRlIHsgaWQ6IHN0cmluZzsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHNpZGU6IFNpZGUgfVxuZXhwb3J0IGludGVyZmFjZSBOYXZGZWF0dXJlcyB7XG4gIC8qKiBTdGFibGUgdGV4dCBvZiBldmVyeXRoaW5nIGJlbG93ICh0aGUgY2FjaGUga2V5KS4gKi9cbiAga2V5OiBzdHJpbmc7XG4gIC8qKiBXYWxraW5nIGhlaWdodCBvdmVyIHdhdGVyIChicmlkZ2VzLCBqZXR0aWVzKTsgYXBwbGllZCBiZWZvcmUgZXZlcnl0aGluZyBlbHNlLiAqL1xuICBkZWNrczogQXJyYXk8Q2VsbFJlY3QgJiB7IHk6IG51bWJlciB9PjtcbiAgY29zdHM6IEFycmF5PENlbGxSZWN0ICYgeyBleHRyYTogbnVtYmVyIH0+O1xuICBibG9ja3M6IEFycmF5PENlbGxSZWN0ICYgeyByZWFzb246IEJsb2NrUmVhc29uOyBpZDogc3RyaW5nIH0+O1xuICAvKiogQ2VsbHMgaW5zaWRlIGEgYmxvY2sgdGhhdCBzdGF5IHdhbGthYmxlIChhIGRvb3J3YXksIGEgdGhyZXNob2xkKS4gKi9cbiAgY2xlYXI6IENlbGxSZWN0W107XG4gIC8qKiBGZW5jZXMgb24gdGhlIHJlY3QncyBvdXRsaW5lOyBgZ2Fwc2AgYXJlIGNlbGwgZWRnZXMgbGVmdCBvcGVuIChubyBnYXRlKS4gKi9cbiAgZmVuY2VzOiBBcnJheTxDZWxsUmVjdCAmIHsgaWQ6IHN0cmluZzsgZ2FwczogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlcjsgc2lkZTogU2lkZSB9PiB9PjtcbiAgZ2F0ZXM6IE5hdkdhdGVbXTtcbiAgZ2F0ZVN0YXRlczogUmVjb3JkPHN0cmluZywgR2F0ZVN0YXRlPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVtcHR5RmVhdHVyZXMoa2V5ID0gJycpOiBOYXZGZWF0dXJlcyB7XG4gIHJldHVybiB7IGtleSwgZGVja3M6IFtdLCBjb3N0czogW10sIGJsb2NrczogW10sIGNsZWFyOiBbXSwgZmVuY2VzOiBbXSwgZ2F0ZXM6IFtdLCBnYXRlU3RhdGVzOiB7fSB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5hdlJlZ2lvbiB7IG94OiBudW1iZXI7IG96OiBudW1iZXI7IHc6IG51bWJlcjsgaDogbnVtYmVyIH1cblxuaW50ZXJmYWNlIFRlcnJhaW5MYXllciB7IGtleTogc3RyaW5nOyBncm91bmQ6IEludDE2QXJyYXk7IHdhdGVyOiBVaW50OEFycmF5OyBibG9jazogVWludDhBcnJheSB9XG5cbmV4cG9ydCBjbGFzcyBOYXZHcmlkIHtcbiAgcmVhZG9ubHkgZ3JvdW5kOiBJbnQxNkFycmF5O1xuICByZWFkb25seSBibG9jazogVWludDhBcnJheTtcbiAgcmVhZG9ubHkgZXh0cmE6IFVpbnQxNkFycmF5O1xuICByZWFkb25seSB3YWxsczogVWludDhBcnJheTtcbiAgLyoqIFNtYWxsZXN0IGJsb2NraW5nIGlkIHBlciBibG9ja2VkIGNlbGwgKGRldGVybWluaXN0aWMgd2hhdGV2ZXIgdGhlIGlucHV0IG9yZGVyKS4gKi9cbiAgcmVhZG9ubHkgYmxvY2tJZCA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG4gIHJlYWRvbmx5IGdhdGVBdCA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7IC8vIGNlbGwgaW5kZXggKiAyICsgKDAgPSBlYXN0IGVkZ2UsIDEgPSBzb3V0aCBlZGdlKVxuICByZWFkb25seSBnYXRlQ2VsbHMgPSBuZXcgTWFwPHN0cmluZywgW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+KCk7XG4gIHJlYWRvbmx5IGdhdGVTdGF0ZSA9IG5ldyBNYXA8c3RyaW5nLCBHYXRlU3RhdGU+KCk7XG4gIGhhc2ggPSAnJztcbiAgLy8gUmV1c2VkIHNlYXJjaCBidWZmZXJzLlxuICBnOiBJbnQzMkFycmF5OyBwYXJlbnQ6IEludDMyQXJyYXk7IGNsb3NlZDogVWludDhBcnJheTtcbiAgY29uc3RydWN0b3IocmVhZG9ubHkgb3g6IG51bWJlciwgcmVhZG9ubHkgb3o6IG51bWJlciwgcmVhZG9ubHkgdzogbnVtYmVyLCByZWFkb25seSBoOiBudW1iZXIpIHtcbiAgICBjb25zdCBuID0gdyAqIGg7XG4gICAgdGhpcy5ncm91bmQgPSBuZXcgSW50MTZBcnJheShuKTsgdGhpcy5ibG9jayA9IG5ldyBVaW50OEFycmF5KG4pOyB0aGlzLmV4dHJhID0gbmV3IFVpbnQxNkFycmF5KG4pOyB0aGlzLndhbGxzID0gbmV3IFVpbnQ4QXJyYXkobik7XG4gICAgdGhpcy5nID0gbmV3IEludDMyQXJyYXkobik7IHRoaXMucGFyZW50ID0gbmV3IEludDMyQXJyYXkobik7IHRoaXMuY2xvc2VkID0gbmV3IFVpbnQ4QXJyYXkobik7XG4gIH1cbiAgaW5zaWRlKHg6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7IHJldHVybiB4ID49IHRoaXMub3ggJiYgeiA+PSB0aGlzLm96ICYmIHggPCB0aGlzLm94ICsgdGhpcy53ICYmIHogPCB0aGlzLm96ICsgdGhpcy5oOyB9XG4gIGluZGV4KHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHsgcmV0dXJuICh6IC0gdGhpcy5veikgKiB0aGlzLncgKyAoeCAtIHRoaXMub3gpOyB9XG4gIGNlbGxYKGk6IG51bWJlcik6IG51bWJlciB7IHJldHVybiB0aGlzLm94ICsgKGkgJSB0aGlzLncpOyB9XG4gIGNlbGxaKGk6IG51bWJlcik6IG51bWJlciB7IHJldHVybiB0aGlzLm96ICsgTWF0aC5mbG9vcihpIC8gdGhpcy53KTsgfVxuICByZWFzb24oeDogbnVtYmVyLCB6OiBudW1iZXIpOiBCbG9ja1JlYXNvbiB7IHJldHVybiB0aGlzLmluc2lkZSh4LCB6KSA/IFJFQVNPTl9OQU1FU1t0aGlzLmJsb2NrW3RoaXMuaW5kZXgoeCwgeildXSA6ICdvdXRzaWRlJzsgfVxuICAvKiogVGhlIGdhdGUgb24gdGhlIGVkZ2UgYmV0d2VlbiB0d28gb3J0aG9nb25hbCBuZWlnaGJvdXJzLCBvciBudWxsLiAqL1xuICBnYXRlQmV0d2VlbihheDogbnVtYmVyLCBhejogbnVtYmVyLCBieDogbnVtYmVyLCBiejogbnVtYmVyKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgY29uc3QgZSA9IGVkZ2UodGhpcywgYXgsIGF6LCBieCwgYnopO1xuICAgIHJldHVybiBlIDwgMCA/IG51bGwgOiB0aGlzLmdhdGVBdC5nZXQoZSkgPz8gbnVsbDtcbiAgfVxufVxuXG4vKiogRWRnZSBrZXkgb2YgdHdvIG9ydGhvZ29uYWwgbmVpZ2hib3VycyAoYm90aCBpbnNpZGUpLCBvciAtMS4gKi9cbmZ1bmN0aW9uIGVkZ2UoZzogTmF2R3JpZCwgYXg6IG51bWJlciwgYXo6IG51bWJlciwgYng6IG51bWJlciwgYno6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGR4ID0gYnggLSBheCwgZHogPSBieiAtIGF6O1xuICBpZiAoTWF0aC5hYnMoZHgpICsgTWF0aC5hYnMoZHopICE9PSAxIHx8ICFnLmluc2lkZShheCwgYXopIHx8ICFnLmluc2lkZShieCwgYnopKSByZXR1cm4gLTE7XG4gIGlmIChkeCA9PT0gMSkgcmV0dXJuIGcuaW5kZXgoYXgsIGF6KSAqIDI7XG4gIGlmIChkeCA9PT0gLTEpIHJldHVybiBnLmluZGV4KGJ4LCBieikgKiAyO1xuICBpZiAoZHogPT09IDEpIHJldHVybiBnLmluZGV4KGF4LCBheikgKiAyICsgMTtcbiAgcmV0dXJuIGcuaW5kZXgoYngsIGJ6KSAqIDIgKyAxO1xufVxuXG4vLyAtLS0tLS0tLS0tIGJ1aWxkaW5nIHRoZSBncmlkIC0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIE5hdkNhY2hlIHsgcmVnaW9uOiBzdHJpbmc7IHRlcnJhaW4/OiBUZXJyYWluTGF5ZXI7IHdvcmxkS2V5Pzogc3RyaW5nOyBmZWF0dXJlS2V5Pzogc3RyaW5nOyBncmlkPzogTmF2R3JpZDsgYnVpbGRzOiBudW1iZXI7IG1zOiBudW1iZXIgfVxuY29uc3QgY2FjaGVzID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIE5hdkNhY2hlPj4oKTtcblxuZXhwb3J0IGludGVyZmFjZSBOYXZTdGF0cyB7XG4gIC8qKiBPYnN0YWNsZS1sYXllciByZWJ1aWxkcywgYW5kIGhvdyBtYW55IG9mIHRoZW0gY2hhbmdlZCB0aGUgZ3JpZCAobmV3IGhhc2gpLiAqL1xuICBncmlkQnVpbGRzOiBudW1iZXI7IGdyaWRDaGFuZ2VzOiBudW1iZXI7IGdyaWRNczogbnVtYmVyOyB0ZXJyYWluQnVpbGRzOiBudW1iZXI7IHRlcnJhaW5NczogbnVtYmVyO1xuICBzZWFyY2hlczogbnVtYmVyOyBleHBhbmRlZDogbnVtYmVyOyBzZWFyY2hNczogbnVtYmVyOyB0aWNrczogbnVtYmVyOyB0aWNrTXM6IG51bWJlcjsgbWF4VGlja01zOiBudW1iZXI7IGxhc3RUaWNrTXM6IG51bWJlcjtcbn1cbmNvbnN0IHN0YXRzID0gbmV3IFdlYWtNYXA8V29ybGQsIE5hdlN0YXRzPigpO1xuLyoqIFByZXNlbnRhdGlvbi1vbmx5IHRpbWluZyBjb3VudGVycyAobmV2ZXIgc2F2ZWQgb3IgaGFzaGVkKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBuYXZTdGF0cyh3b3JsZDogV29ybGQpOiBOYXZTdGF0cyB7XG4gIGxldCBzID0gc3RhdHMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzKSB7XG4gICAgcyA9IHsgZ3JpZEJ1aWxkczogMCwgZ3JpZENoYW5nZXM6IDAsIGdyaWRNczogMCwgdGVycmFpbkJ1aWxkczogMCwgdGVycmFpbk1zOiAwLCBzZWFyY2hlczogMCwgZXhwYW5kZWQ6IDAsIHNlYXJjaE1zOiAwLCB0aWNrczogMCwgdGlja01zOiAwLCBtYXhUaWNrTXM6IDAsIGxhc3RUaWNrTXM6IDAgfTtcbiAgICBzdGF0cy5zZXQod29ybGQsIHMpO1xuICB9XG4gIHJldHVybiBzO1xufVxuXG5mdW5jdGlvbiB0ZXJyYWluTGF5ZXIod29ybGQ6IFdvcmxkLCByOiBOYXZSZWdpb24pOiBUZXJyYWluTGF5ZXIge1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBuID0gci53ICogci5oO1xuICBjb25zdCBncm91bmQgPSBuZXcgSW50MTZBcnJheShuKSwgd2F0ZXIgPSBuZXcgVWludDhBcnJheShuKSwgYmxvY2sgPSBuZXcgVWludDhBcnJheShuKTtcbiAgZm9yIChsZXQgeiA9IDA7IHogPCByLmg7IHorKykge1xuICAgIGZvciAobGV0IHggPSAwOyB4IDwgci53OyB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gci5veCArIHgsIHd6ID0gci5veiArIHosIGkgPSB6ICogci53ICsgeDtcbiAgICAgIGlmICh3eCA8IC1IQUxGIHx8IHd6IDwgLUhBTEYgfHwgd3ggPj0gSEFMRiB8fCB3eiA+PSBIQUxGKSB7IGJsb2NrW2ldID0gQkxPQ0sub3V0c2lkZTsgY29udGludWU7IH1cbiAgICAgIC8vIHN1cmZhY2VBdCBnZW5lcmF0ZXMgYSBtaXNzaW5nIGNodW5rIChhbmQgaXRzIG5hdHVyYWwgZW50aXRpZXMpOiB0aGVcbiAgICAgIC8vIGdyaWQgaXMgdGhlIHNhbWUgd2hpY2hldmVyIGNodW5rcyBhIHJlbmRlcmVyIGhhcHBlbmVkIHRvIGxvYWQuXG4gICAgICBncm91bmRbaV0gPSBzdXJmYWNlQXQod29ybGQsIHd4LCB3eik7XG4gICAgICBjb25zdCBkID0gTWF0aC5tYXgoMCwgd2F0ZXJEZXB0aEF0KHdvcmxkLCB3eCwgd3opKTtcbiAgICAgIHdhdGVyW2ldID0gTWF0aC5taW4oMjU1LCBkKTtcbiAgICAgIGlmIChkID4gV0FERV9NQVgpIGJsb2NrW2ldID0gQkxPQ0suZGVlcF93YXRlcjtcbiAgICB9XG4gIH1cbiAgY29uc3QgcyA9IG5hdlN0YXRzKHdvcmxkKTtcbiAgcy50ZXJyYWluQnVpbGRzKys7IHMudGVycmFpbk1zICs9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gIHJldHVybiB7IGtleTogJycsIGdyb3VuZCwgd2F0ZXIsIGJsb2NrIH07XG59XG5cbmZ1bmN0aW9uIGZvclJlY3QoZzogTmF2R3JpZCwgcjogQ2VsbFJlY3QsIGY6IChpOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKSA9PiB2b2lkKTogdm9pZCB7XG4gIGNvbnN0IHgwID0gTWF0aC5tYXgoci54MCwgZy5veCksIHgxID0gTWF0aC5taW4oci54MSwgZy5veCArIGcudyksIHowID0gTWF0aC5tYXgoci56MCwgZy5veiksIHoxID0gTWF0aC5taW4oci56MSwgZy5veiArIGcuaCk7XG4gIGZvciAobGV0IHogPSB6MDsgeiA8IHoxOyB6KyspIGZvciAobGV0IHggPSB4MDsgeCA8IHgxOyB4KyspIGYoZy5pbmRleCh4LCB6KSwgeCwgeik7XG59XG5cbi8qKiBCbG9jayBhIGNlbGw7IHdoZW4gc2V2ZXJhbCB0aGluZ3MgY2xhaW0gaXQsIHRoZSBzbWFsbGVzdCBpZCB3aW5zIChvcmRlci1pbmRlcGVuZGVudCkuICovXG5mdW5jdGlvbiBzZXRCbG9jayhnOiBOYXZHcmlkLCBpOiBudW1iZXIsIHJlYXNvbjogQmxvY2tSZWFzb24sIGlkOiBzdHJpbmcpOiB2b2lkIHtcbiAgY29uc3QgY3VyID0gZy5ibG9ja1tpXTtcbiAgaWYgKGN1ciA9PT0gQkxPQ0sub3V0c2lkZSB8fCBjdXIgPT09IEJMT0NLLmRlZXBfd2F0ZXIpIHJldHVybjtcbiAgaWYgKGN1ciAhPT0gQkxPQ0subm9uZSkgeyBjb25zdCBwcmV2ID0gZy5ibG9ja0lkLmdldChpKTsgaWYgKHByZXYgIT09IHVuZGVmaW5lZCAmJiBwcmV2IDw9IGlkKSByZXR1cm47IH1cbiAgZy5ibG9ja1tpXSA9IEJMT0NLW3JlYXNvbl07XG4gIGcuYmxvY2tJZC5zZXQoaSwgaWQpO1xufVxuXG4vKiogV2FsbCBiaXQgZm9yIHRoZSBlZGdlIG9uIGBzaWRlYCBvZiBjZWxsICh4LCB6KS4gKi9cbmZ1bmN0aW9uIG1hcmtFZGdlKGc6IE5hdkdyaWQsIHg6IG51bWJlciwgejogbnVtYmVyLCBzaWRlOiBTaWRlLCBiaXRzOiAnd2FsbCcgfCAnZ2F0ZScsIGlkPzogc3RyaW5nKTogdm9pZCB7XG4gIGxldCBjeCA9IHgsIGN6ID0geiwgc291dGggPSBmYWxzZTtcbiAgaWYgKHNpZGUgPT09ICdlJykgeyAvKiBvd24gZWFzdCBlZGdlICovIH0gZWxzZSBpZiAoc2lkZSA9PT0gJ3cnKSBjeCA9IHggLSAxO1xuICBlbHNlIGlmIChzaWRlID09PSAncycpIHNvdXRoID0gdHJ1ZTsgZWxzZSB7IGN6ID0geiAtIDE7IHNvdXRoID0gdHJ1ZTsgfVxuICBpZiAoIWcuaW5zaWRlKGN4LCBjeikpIHJldHVybjtcbiAgLy8gRWRnZXMgb24gdGhlIGZhciBib3JkZXIgb2YgdGhlIHdpbmRvdyBiZWxvbmcgdG8gbm8gaW4tZ3JpZCBuZWlnaGJvdXIuXG4gIGlmICghc291dGggJiYgIWcuaW5zaWRlKGN4ICsgMSwgY3opKSByZXR1cm47XG4gIGlmIChzb3V0aCAmJiAhZy5pbnNpZGUoY3gsIGN6ICsgMSkpIHJldHVybjtcbiAgY29uc3QgaSA9IGcuaW5kZXgoY3gsIGN6KTtcbiAgaWYgKGJpdHMgPT09ICd3YWxsJykgeyBnLndhbGxzW2ldIHw9IHNvdXRoID8gV0FMTF9TIDogV0FMTF9FOyByZXR1cm47IH1cbiAgZy53YWxsc1tpXSAmPSBzb3V0aCA/IH5XQUxMX1MgOiB+V0FMTF9FO1xuICBnLndhbGxzW2ldIHw9IHNvdXRoID8gR0FURV9TIDogR0FURV9FO1xuICBnLmdhdGVBdC5zZXQoaSAqIDIgKyAoc291dGggPyAxIDogMCksIGlkISk7XG4gIGcuZ2F0ZUNlbGxzLnNldChpZCEsIHNvdXRoID8gW2N4LCBjeiwgY3gsIGN6ICsgMV0gOiBbY3gsIGN6LCBjeCArIDEsIGN6XSk7XG59XG5cbmNvbnN0IHNpZGVPZiA9ICh4OiBudW1iZXIsIHo6IG51bWJlciwgc2lkZTogU2lkZSkgPT4gYCR7eH0sJHt6fSwke3NpZGV9YDtcbi8qKiBUaGUgc2FtZSBlZGdlIG5hbWVkIGZyb20gZWl0aGVyIHNpZGUsIG5vcm1hbGlzZWQgdG8gYW4gZWFzdCBvciBzb3V0aCBlZGdlLiAqL1xuZnVuY3Rpb24gbm9ybUVkZ2UoeDogbnVtYmVyLCB6OiBudW1iZXIsIHNpZGU6IFNpZGUpOiBzdHJpbmcge1xuICBpZiAoc2lkZSA9PT0gJ3cnKSByZXR1cm4gc2lkZU9mKHggLSAxLCB6LCAnZScpO1xuICBpZiAoc2lkZSA9PT0gJ24nKSByZXR1cm4gc2lkZU9mKHgsIHogLSAxLCAncycpO1xuICByZXR1cm4gc2lkZU9mKHgsIHosIHNpZGUpO1xufVxuXG5mdW5jdGlvbiBhcHBseUZlYXR1cmVzKGc6IE5hdkdyaWQsIGY6IE5hdkZlYXR1cmVzKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZCBvZiBmLmRlY2tzKSBmb3JSZWN0KGcsIGQsIChpKSA9PiB7IGcuZ3JvdW5kW2ldID0gZC55OyBpZiAoZy5ibG9ja1tpXSA9PT0gQkxPQ0suZGVlcF93YXRlcikgZy5ibG9ja1tpXSA9IEJMT0NLLm5vbmU7IH0pO1xuICBmb3IgKGNvbnN0IGMgb2YgZi5jb3N0cykgZm9yUmVjdChnLCBjLCAoaSkgPT4geyBnLmV4dHJhW2ldICs9IGMuZXh0cmE7IH0pO1xuICBmb3IgKGNvbnN0IGIgb2YgZi5ibG9ja3MpIGZvclJlY3QoZywgYiwgKGkpID0+IHNldEJsb2NrKGcsIGksIGIucmVhc29uLCBiLmlkKSk7XG4gIGZvciAoY29uc3QgYyBvZiBmLmNsZWFyKSBmb3JSZWN0KGcsIGMsIChpKSA9PiB7IGlmIChnLmJsb2NrW2ldICE9PSBCTE9DSy5kZWVwX3dhdGVyICYmIGcuYmxvY2tbaV0gIT09IEJMT0NLLm91dHNpZGUpIHsgZy5ibG9ja1tpXSA9IEJMT0NLLm5vbmU7IGcuYmxvY2tJZC5kZWxldGUoaSk7IH0gfSk7XG4gIGNvbnN0IG9wZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBmZSBvZiBmLmZlbmNlcykgZm9yIChjb25zdCBnYXAgb2YgZmUuZ2Fwcykgb3Blbi5hZGQobm9ybUVkZ2UoZ2FwLngsIGdhcC56LCBnYXAuc2lkZSkpO1xuICBmb3IgKGNvbnN0IGd0IG9mIGYuZ2F0ZXMpIG9wZW4uYWRkKG5vcm1FZGdlKGd0LngsIGd0LnosIGd0LnNpZGUpKTtcbiAgZm9yIChjb25zdCBmZSBvZiBmLmZlbmNlcykge1xuICAgIGZvciAobGV0IHggPSBmZS54MDsgeCA8IGZlLngxOyB4KyspIHtcbiAgICAgIGlmICghb3Blbi5oYXMobm9ybUVkZ2UoeCwgZmUuejAsICduJykpKSBtYXJrRWRnZShnLCB4LCBmZS56MCwgJ24nLCAnd2FsbCcpO1xuICAgICAgaWYgKCFvcGVuLmhhcyhub3JtRWRnZSh4LCBmZS56MSAtIDEsICdzJykpKSBtYXJrRWRnZShnLCB4LCBmZS56MSAtIDEsICdzJywgJ3dhbGwnKTtcbiAgICB9XG4gICAgZm9yIChsZXQgeiA9IGZlLnowOyB6IDwgZmUuejE7IHorKykge1xuICAgICAgaWYgKCFvcGVuLmhhcyhub3JtRWRnZShmZS54MCwgeiwgJ3cnKSkpIG1hcmtFZGdlKGcsIGZlLngwLCB6LCAndycsICd3YWxsJyk7XG4gICAgICBpZiAoIW9wZW4uaGFzKG5vcm1FZGdlKGZlLngxIC0gMSwgeiwgJ2UnKSkpIG1hcmtFZGdlKGcsIGZlLngxIC0gMSwgeiwgJ2UnLCAnd2FsbCcpO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IGd0IG9mIFsuLi5mLmdhdGVzXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpKSB7XG4gICAgbWFya0VkZ2UoZywgZ3QueCwgZ3QueiwgZ3Quc2lkZSwgJ2dhdGUnLCBndC5pZCk7XG4gICAgY29uc3Qgc3QgPSBmLmdhdGVTdGF0ZXNbZ3QuaWRdID8/ICdjbG9zZWQnO1xuICAgIGcuZ2F0ZVN0YXRlLnNldChndC5pZCwgc3QpO1xuICAgIC8vIEEgbG9ja2VkIGdhdGUgaXMgYSB3YWxsIGZvciBldmVyeW9uZSAoaXRzIGdhdGUgYml0IHN0YXlzLCBmb3IgcmVwb3J0cykuXG4gICAgaWYgKHN0ID09PSAnbG9ja2VkJykge1xuICAgICAgY29uc3QgY2VsbHMgPSBnLmdhdGVDZWxscy5nZXQoZ3QuaWQpO1xuICAgICAgaWYgKGNlbGxzKSB7IGNvbnN0IGkgPSBnLmluZGV4KGNlbGxzWzBdLCBjZWxsc1sxXSk7IGcud2FsbHNbaV0gfD0gY2VsbHNbMl0gIT09IGNlbGxzWzBdID8gV0FMTF9FIDogV0FMTF9TOyB9XG4gICAgfVxuICB9XG59XG5cbi8qKiBUcmVlcyBieSBncm93dGggc3RhZ2UsIGJ1c2hlcywgb3JlLCBsYW5kbWFya3MgYW5kIGJ1aWx0IG1vZHVsZXMgaW5zaWRlIHRoZSB3aW5kb3cuICovXG5mdW5jdGlvbiBhcHBseVdvcmxkKHdvcmxkOiBXb3JsZCwgZzogTmF2R3JpZCk6IHZvaWQge1xuICBjb25zdCBjeDAgPSB3b3JsZFRvQ2h1bmtYKE1hdGgubWF4KC1IQUxGLCBnLm94IC0gMikpLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKE1hdGgubWluKEhBTEYgLSAxLCBnLm94ICsgZy53ICsgMSkpO1xuICBjb25zdCBjejAgPSB3b3JsZFRvQ2h1bmtaKE1hdGgubWF4KC1IQUxGLCBnLm96IC0gMikpLCBjejEgPSB3b3JsZFRvQ2h1bmtaKE1hdGgubWluKEhBTEYgLSAxLCBnLm96ICsgZy5oICsgMSkpO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykge1xuICAgICAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChjaHVua0tleShjeCwgY3opKTtcbiAgICAgIGlmICghaWRzKSBjb250aW51ZTtcbiAgICAgIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgICBpZiAoIWUgfHwgZS5oYXJ2ZXN0ZWQgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGlkKSB8fCBpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGV4ID0gTWF0aC5mbG9vcihlLngpLCBleiA9IE1hdGguZmxvb3IoZS56KTtcbiAgICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfc2hydWInKSB7XG4gICAgICAgICAgaWYgKGcuaW5zaWRlKGV4LCBleikpIGcuZXh0cmFbZy5pbmRleChleCwgZXopXSArPSBDT1NUX0JVU0g7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWVfJykpIHtcbiAgICAgICAgICBjb25zdCByID0gU1RBR0VfRk9PVFBSSU5UW2dyb3d0aFN0YWdlKGUpID8/ICdtYXR1cmUnXTtcbiAgICAgICAgICBjb25zdCByZWFjaCA9IE1hdGguY2VpbChyKTtcbiAgICAgICAgICBmb3IgKGxldCB6ID0gZXogLSByZWFjaDsgeiA8PSBleiArIHJlYWNoOyB6KyspIHtcbiAgICAgICAgICAgIGZvciAobGV0IHggPSBleCAtIHJlYWNoOyB4IDw9IGV4ICsgcmVhY2g7IHgrKykge1xuICAgICAgICAgICAgICBjb25zdCBkeCA9IHggKyAwLjUgLSBlLngsIGR6ID0geiArIDAuNSAtIGUuejtcbiAgICAgICAgICAgICAgaWYgKGR4ICogZHggKyBkeiAqIGR6IDw9IHIgKiByICsgMWUtOSAmJiBnLmluc2lkZSh4LCB6KSkgc2V0QmxvY2soZywgZy5pbmRleCh4LCB6KSwgJ3RyZWUnLCBlLmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGcuaW5zaWRlKGV4LCBleikpIHNldEJsb2NrKGcsIGcuaW5kZXgoZXgsIGV6KSwgZS5raW5kID09PSAnc3R5bF9vcmUnIHx8IGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3JvY2snKSA/ICdyb2NrJyA6ICdsYW5kbWFyaycsIGUuaWQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygd29ybGQuc2l0ZXMpIHtcbiAgICBjb25zdCB4ID0gTWF0aC5mbG9vcihzLngpLCB6ID0gTWF0aC5mbG9vcihzLnopO1xuICAgIGlmIChnLmluc2lkZSh4LCB6KSkgc2V0QmxvY2soZywgZy5pbmRleCh4LCB6KSwgJ2xhbmRtYXJrJywgcy5pZCk7XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpKSB7XG4gICAgZm9yIChjb25zdCBtIG9mIHMubW9kdWxlcykge1xuICAgICAgaWYgKG0ua2luZCA9PT0gJ2Nyb3Bfcm93JyB8fCBtLmtpbmQgPT09ICdkb29yJyB8fCBtLmtpbmQgPT09ICd0aHJlc2hvbGQnKSBjb250aW51ZTtcbiAgICAgIC8vIEEgcm90YXRlZCBtb2R1bGUgaXMgYm91bmRlZCBieSBpdHMgaGFsZi1kaWFnb25hbCAobm8gdHJpZ29ub21ldHJ5IGluIHRoZSBoYXNoZWQgc2ltKS5cbiAgICAgIGNvbnN0IGh3ID0gbS5yb3QgPyBNYXRoLnNxcnQobS53ICogbS53ICsgbS5kICogbS5kKSAvIDIgOiBtLncgLyAyO1xuICAgICAgY29uc3QgaGQgPSBtLnJvdCA/IGh3IDogbS5kIC8gMjtcbiAgICAgIGZvciAobGV0IHogPSBNYXRoLmZsb29yKG0ueiAtIGhkKTsgeiA8PSBNYXRoLmZsb29yKG0ueiArIGhkKTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBNYXRoLmZsb29yKG0ueCAtIGh3KTsgeCA8PSBNYXRoLmZsb29yKG0ueCArIGh3KTsgeCsrKSB7XG4gICAgICAgICAgaWYgKCFnLmluc2lkZSh4LCB6KSB8fCBNYXRoLmFicyh4ICsgMC41IC0gbS54KSA+PSBodyB8fCBNYXRoLmFicyh6ICsgMC41IC0gbS56KSA+PSBoZCkgY29udGludWU7XG4gICAgICAgICAgY29uc3QgaSA9IGcuaW5kZXgoeCwgeiksIGZsb29yID0gZy5ncm91bmRbaV07XG4gICAgICAgICAgLy8gVGFsbGVyIHRoYW4gYSBzdGVwIGFuZCBsb3cgZW5vdWdoIHRvIHdhbGsgaW50bzogYSB3YWxsLiBMb3dlcjogYSBmbG9vciBvciBhIHN0ZXAuXG4gICAgICAgICAgaWYgKG0ueSArIG0uaCA+IGZsb29yICsgMS4wNSAmJiBtLnkgPCBmbG9vciArIDEuNykgc2V0QmxvY2soZywgaSwgJ3N0cnVjdHVyZScsIHMuaWQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGhhc2hHcmlkKGc6IE5hdkdyaWQpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzUsIGIgPSAweDllMzc3OWI5O1xuICBjb25zdCBtaXggPSAodjogbnVtYmVyKSA9PiB7XG4gICAgYSA9IE1hdGguaW11bChhIF4gKHYgJiAweGZmZmYpLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoKHYgJiAweGZmZmYpICsgMHg5ZSksIDB4ODVlYmNhNmIpOyBiIF49IGIgPj4+IDEzO1xuICB9O1xuICBtaXgoZy5veCk7IG1peChnLm96KTsgbWl4KGcudyk7IG1peChnLmgpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGcuZ3JvdW5kLmxlbmd0aDsgaSsrKSB7XG4gICAgbWl4KGcuZ3JvdW5kW2ldKTsgbWl4KGcuYmxvY2tbaV0gPT09IDAgPyAwIDogMSk7IG1peChnLmV4dHJhW2ldKTsgbWl4KGcud2FsbHNbaV0pO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJykgKyAoYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbi8qKlxuICogVGhlIG5hdmlnYXRpb24gZ3JpZCBvZiBhIHdpbmRvdywgY3VycmVudCB3aXRoIHRoZSB3b3JsZCBhbmQgdGhlIGNhbGxlcidzXG4gKiBmZWF0dXJlcy4gQ2hlYXAgd2hlbiBub3RoaW5nIGNoYW5nZWQgKHRocmVlIHN0cmluZyBjb21wYXJlcyk7IGEgcmVidWlsZCBpc1xuICogYm91bmRlZCBieSB0aGUgd2luZG93IHNpemUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBuYXZHcmlkKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBOYXZSZWdpb24sIGZlYXR1cmVzOiBOYXZGZWF0dXJlcyk6IE5hdkdyaWQge1xuICBsZXQgYnlSZWdpb24gPSBjYWNoZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFieVJlZ2lvbikgeyBieVJlZ2lvbiA9IG5ldyBNYXAoKTsgY2FjaGVzLnNldCh3b3JsZCwgYnlSZWdpb24pOyB9XG4gIGNvbnN0IHJrID0gYCR7cmVnaW9uLm94fSwke3JlZ2lvbi5ven0sJHtyZWdpb24ud30sJHtyZWdpb24uaH1gO1xuICBsZXQgYyA9IGJ5UmVnaW9uLmdldChyayk7XG4gIGlmICghYykgeyBjID0geyByZWdpb246IHJrLCBidWlsZHM6IDAsIG1zOiAwIH07IGJ5UmVnaW9uLnNldChyaywgYyk7IH1cbiAgY29uc3QgdEtleSA9IGAke3dvcmxkLnNlZWR9OiR7d29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb259OiR7ZWRpdFZlcnNpb24od29ybGQpfWA7XG4gIGlmICghYy50ZXJyYWluIHx8IGMudGVycmFpbi5rZXkgIT09IHRLZXkpIHtcbiAgICBjLnRlcnJhaW4gPSB0ZXJyYWluTGF5ZXIod29ybGQsIHJlZ2lvbik7XG4gICAgYy50ZXJyYWluLmtleSA9IHRLZXk7XG4gICAgYy5ncmlkID0gdW5kZWZpbmVkO1xuICB9XG4gIGNvbnN0IHdLZXkgPSBgJHt3b3JsZC5yZXZpc2lvbn06JHt3b3JsZC5lbnRpdHlSZW1vdmFscy5zaXplfToke3dvcmxkLnN0cnVjdHVyZXMuc2l6ZX1gO1xuICBpZiAoYy5ncmlkICYmIGMud29ybGRLZXkgPT09IHdLZXkgJiYgYy5mZWF0dXJlS2V5ID09PSBmZWF0dXJlcy5rZXkpIHJldHVybiBjLmdyaWQ7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IGcgPSBuZXcgTmF2R3JpZChyZWdpb24ub3gsIHJlZ2lvbi5veiwgcmVnaW9uLncsIHJlZ2lvbi5oKTtcbiAgZy5ncm91bmQuc2V0KGMudGVycmFpbi5ncm91bmQpO1xuICBnLmJsb2NrLnNldChjLnRlcnJhaW4uYmxvY2spO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGcuZXh0cmEubGVuZ3RoOyBpKyspIGlmIChjLnRlcnJhaW4ud2F0ZXJbaV0gPiAwICYmIGcuYmxvY2tbaV0gPT09IDApIGcuZXh0cmFbaV0gPSBDT1NUX0ZPUkQ7XG4gIGFwcGx5V29ybGQod29ybGQsIGcpO1xuICBhcHBseUZlYXR1cmVzKGcsIGZlYXR1cmVzKTtcbiAgZy5oYXNoID0gaGFzaEdyaWQoZyk7XG4gIGNvbnN0IHMgPSBuYXZTdGF0cyh3b3JsZCk7XG4gIHMuZ3JpZEJ1aWxkcysrOyBzLmdyaWRNcyArPSBwZXJmb3JtYW5jZS5ub3coKSAtIHQwO1xuICAvLyBLZWVwIHRoZSBvbGQgb2JqZWN0IHdoZW4gbm90aGluZyB0aGF0IG1hdHRlcnMgY2hhbmdlZCAoc2VhcmNoIGJ1ZmZlcnMgc3RheSB3YXJtKS5cbiAgaWYgKGMuZ3JpZCAmJiBjLmdyaWQuaGFzaCA9PT0gZy5oYXNoICYmIHNhbWVHYXRlcyhjLmdyaWQsIGcpKSB7IGMud29ybGRLZXkgPSB3S2V5OyBjLmZlYXR1cmVLZXkgPSBmZWF0dXJlcy5rZXk7IGZvciAoY29uc3QgW2ssIHZdIG9mIGcuZ2F0ZVN0YXRlKSBjLmdyaWQuZ2F0ZVN0YXRlLnNldChrLCB2KTsgcmV0dXJuIGMuZ3JpZDsgfVxuICBjLmdyaWQgPSBnOyBjLndvcmxkS2V5ID0gd0tleTsgYy5mZWF0dXJlS2V5ID0gZmVhdHVyZXMua2V5O1xuICBzLmdyaWRDaGFuZ2VzKys7XG4gIHJldHVybiBnO1xufVxuXG5mdW5jdGlvbiBzYW1lR2F0ZXMoYTogTmF2R3JpZCwgYjogTmF2R3JpZCk6IGJvb2xlYW4ge1xuICBpZiAoYS5nYXRlQXQuc2l6ZSAhPT0gYi5nYXRlQXQuc2l6ZSkgcmV0dXJuIGZhbHNlO1xuICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBhLmdhdGVBdCkgaWYgKGIuZ2F0ZUF0LmdldChrKSAhPT0gdikgcmV0dXJuIGZhbHNlO1xuICBpZiAoYS5ibG9ja0lkLnNpemUgIT09IGIuYmxvY2tJZC5zaXplKSByZXR1cm4gZmFsc2U7XG4gIGZvciAoY29uc3QgW2ssIHZdIG9mIGEuYmxvY2tJZCkgaWYgKGIuYmxvY2tJZC5nZXQoaykgIT09IHYpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbi8qKiBEcm9wIGNhY2hlZCBncmlkcyAodGVzdHMgYW5kIHRvb2xzKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNldE5hdkNhY2hlKHdvcmxkOiBXb3JsZCk6IHZvaWQgeyBjYWNoZXMuZGVsZXRlKHdvcmxkKTsgfVxuXG4vLyAtLS0tLS0tLS0tIG1vdmluZyBiZXR3ZWVuIGNlbGxzIC0tLS0tLS0tLS1cblxuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hPcHRpb25zIHtcbiAgLyoqIFRyZWF0IGxvY2tlZCBnYXRlcyBhcyBwYXNzYWJsZSAodXNlZCBvbmx5IHRvIGV4cGxhaW4gYSBmYWlsdXJlKS4gKi9cbiAgaWdub3JlTG9ja2VkPzogYm9vbGVhbjtcbiAgLyoqIFRyZWF0IHRyZWVzLCBidXNoZXMgYW5kIHJvY2tzIGFzIHBhc3NhYmxlICh1c2VkIG9ubHkgdG8gZXhwbGFpbiBhIGZhaWx1cmUpLiAqL1xuICBpZ25vcmVOYXR1cmU/OiBib29sZWFuO1xuICBtYXhFeHBhbnNpb25zOiBudW1iZXI7XG59XG5cbmNvbnN0IG5hdHVyZUJsb2NrID0gKGI6IG51bWJlcikgPT4gYiA9PT0gQkxPQ0sudHJlZSB8fCBiID09PSBCTE9DSy5yb2NrO1xuXG5mdW5jdGlvbiBmcmVlKGc6IE5hdkdyaWQsIGk6IG51bWJlciwgbzogU2VhcmNoT3B0aW9ucyk6IGJvb2xlYW4ge1xuICBjb25zdCBiID0gZy5ibG9ja1tpXTtcbiAgcmV0dXJuIGIgPT09IEJMT0NLLm5vbmUgfHwgKCEhby5pZ25vcmVOYXR1cmUgJiYgbmF0dXJlQmxvY2soYikpO1xufVxuXG4vKiogV2FsbCBzdGF0ZSBvZiBhbiBvcnRob2dvbmFsIGVkZ2U6IDAgb3BlbiwgMSBnYXRlIChwYXNzYWJsZSksIDIgYmxvY2tlZC4gKi9cbmZ1bmN0aW9uIGVkZ2VTdGF0ZShnOiBOYXZHcmlkLCBheDogbnVtYmVyLCBhejogbnVtYmVyLCBieDogbnVtYmVyLCBiejogbnVtYmVyLCBvOiBTZWFyY2hPcHRpb25zKTogMCB8IDEgfCAyIHtcbiAgY29uc3QgZSA9IGVkZ2UoZywgYXgsIGF6LCBieCwgYnopO1xuICBpZiAoZSA8IDApIHJldHVybiAyO1xuICBjb25zdCBiaXRzID0gZy53YWxsc1tlID4+IDFdLCBzb3V0aCA9IChlICYgMSkgPT09IDE7XG4gIGNvbnN0IHdhbGwgPSBiaXRzICYgKHNvdXRoID8gV0FMTF9TIDogV0FMTF9FKSwgZ2F0ZSA9IGJpdHMgJiAoc291dGggPyBHQVRFX1MgOiBHQVRFX0UpO1xuICBpZiAoZ2F0ZSkgcmV0dXJuIHdhbGwgJiYgIW8uaWdub3JlTG9ja2VkID8gMiA6IDE7XG4gIHJldHVybiB3YWxsID8gMiA6IDA7XG59XG5cbi8qKiBDb3N0IG9mIG1vdmluZyBmcm9tIGNlbGwgYSB0byB0aGUgbmVpZ2hib3VyIGIgKGR4LCBkeiBpbiAtMS4uMSksIG9yIC0xIHdoZW4gaW1wb3NzaWJsZS4gKi9cbmZ1bmN0aW9uIG1vdmVDb3N0KGc6IE5hdkdyaWQsIGF4OiBudW1iZXIsIGF6OiBudW1iZXIsIGR4OiBudW1iZXIsIGR6OiBudW1iZXIsIG86IFNlYXJjaE9wdGlvbnMpOiBudW1iZXIge1xuICBjb25zdCBieCA9IGF4ICsgZHgsIGJ6ID0gYXogKyBkejtcbiAgaWYgKCFnLmluc2lkZShieCwgYnopKSByZXR1cm4gLTE7XG4gIGNvbnN0IGlhID0gZy5pbmRleChheCwgYXopLCBpYiA9IGcuaW5kZXgoYngsIGJ6KTtcbiAgaWYgKCFmcmVlKGcsIGliLCBvKSkgcmV0dXJuIC0xO1xuICBjb25zdCBkaCA9IGcuZ3JvdW5kW2liXSAtIGcuZ3JvdW5kW2lhXTtcbiAgaWYgKGRoID4gTUFYX1NURVAgfHwgZGggPCAtTUFYX1NURVApIHJldHVybiAtMTtcbiAgbGV0IGNvc3QgPSAoZHggIT09IDAgJiYgZHogIT09IDAgPyBDT1NUX0RJQUdPTkFMIDogQ09TVF9TVFJBSUdIVCkgKyBnLmV4dHJhW2liXSArIChkaCAhPT0gMCA/IENPU1RfU1RFUCA6IDApO1xuICBpZiAoZHggPT09IDAgfHwgZHogPT09IDApIHtcbiAgICBjb25zdCBzID0gZWRnZVN0YXRlKGcsIGF4LCBheiwgYngsIGJ6LCBvKTtcbiAgICBpZiAocyA9PT0gMikgcmV0dXJuIC0xO1xuICAgIGlmIChzID09PSAxKSBjb3N0ICs9IENPU1RfR0FURTtcbiAgICByZXR1cm4gY29zdDtcbiAgfVxuICAvLyBEaWFnb25hbDogYm90aCBjb3JuZXIgY2VsbHMgd2Fsa2FibGUgYW5kIGxldmVsIGVub3VnaCwgYW5kIG5vIHdhbGwgb3IgZ2F0ZSBvbiBhbnkgb2YgdGhlIGZvdXIgZWRnZXMuXG4gIGNvbnN0IGMxID0gZy5pbmRleChieCwgYXopLCBjMiA9IGcuaW5kZXgoYXgsIGJ6KTtcbiAgaWYgKCFmcmVlKGcsIGMxLCBvKSB8fCAhZnJlZShnLCBjMiwgbykpIHJldHVybiAtMTtcbiAgZm9yIChjb25zdCBjIG9mIFtjMSwgYzJdKSB7XG4gICAgaWYgKE1hdGguYWJzKGcuZ3JvdW5kW2NdIC0gZy5ncm91bmRbaWFdKSA+IE1BWF9TVEVQIHx8IE1hdGguYWJzKGcuZ3JvdW5kW2liXSAtIGcuZ3JvdW5kW2NdKSA+IE1BWF9TVEVQKSByZXR1cm4gLTE7XG4gIH1cbiAgaWYgKGVkZ2VTdGF0ZShnLCBheCwgYXosIGJ4LCBheiwgbykgIT09IDAgfHwgZWRnZVN0YXRlKGcsIGJ4LCBheiwgYngsIGJ6LCBvKSAhPT0gMFxuICAgIHx8IGVkZ2VTdGF0ZShnLCBheCwgYXosIGF4LCBieiwgbykgIT09IDAgfHwgZWRnZVN0YXRlKGcsIGF4LCBieiwgYngsIGJ6LCBvKSAhPT0gMCkgcmV0dXJuIC0xO1xuICByZXR1cm4gY29zdDtcbn1cblxuLyoqIFRydWUgd2hlbiBhIHdhbGtlciBjYW4gbW92ZSBmcm9tIGNlbGwgYSB0byBuZWlnaGJvdXIgYiByaWdodCBub3cgKGdhdGVzIGNvdW50IGFzIHBhc3NhYmxlIHVubGVzcyBsb2NrZWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbk1vdmUoZzogTmF2R3JpZCwgYXg6IG51bWJlciwgYXo6IG51bWJlciwgYng6IG51bWJlciwgYno6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBkeCA9IGJ4IC0gYXgsIGR6ID0gYnogLSBhejtcbiAgaWYgKE1hdGguYWJzKGR4KSA+IDEgfHwgTWF0aC5hYnMoZHopID4gMSB8fCAoZHggPT09IDAgJiYgZHogPT09IDApIHx8ICFnLmluc2lkZShheCwgYXopKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBtb3ZlQ29zdChnLCBheCwgYXosIGR4LCBkeiwgeyBtYXhFeHBhbnNpb25zOiAwIH0pID49IDA7XG59XG5cbi8vIC0tLS0tLS0tLS0gc2VhcmNoIC0tLS0tLS0tLS1cblxuLyoqXG4gKiBBIGRlc3RpbmF0aW9uOiBhIHBvaW50IGluIGRlY2ltZXRyZXMsIGhvdyBjbG9zZSAoZG0pIHRoZSB3YWxrZXIgbXVzdCBnZXQsXG4gKiBhbmQgaG93IGZhciAoZG0pIHRoZSBwb2ludCBtYXkgbW92ZSBiZWZvcmUgdGhlIHJvdXRlIGlzIHJlcGxhbm5lZCAoYVxuICogd2Fsa2luZyBhbmltYWwpOyBmaXhlZCBkZXN0aW5hdGlvbnMgdXNlIDAuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTmF2R29hbCB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByZWFjaDogbnVtYmVyOyBkcmlmdD86IG51bWJlciB9XG5leHBvcnQgdHlwZSBQYXRoUmVzdWx0ID1cbiAgfCB7IG9rOiB0cnVlOyBjZWxsczogbnVtYmVyW107IGNvc3Q6IG51bWJlcjsgZXhwYW5kZWQ6IG51bWJlciB9XG4gIHwgeyBvazogZmFsc2U7IGNvZGU6ICdub19yb3V0ZScgfCAnYnVkZ2V0JyB8ICdvdXRzaWRlJzsgZXhwYW5kZWQ6IG51bWJlciB9O1xuXG5jb25zdCBjZWxsT2ZEbSA9ICh2OiBudW1iZXIpID0+IE1hdGguZmxvb3IodiAvIDEwKTtcbmNvbnN0IGNlbnRyZURtID0gKGM6IG51bWJlcikgPT4gYyAqIDEwICsgNTtcbmNvbnN0IERJUlM6IFJlYWRvbmx5QXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWzEsIDBdLCBbLTEsIDBdLCBbMCwgMV0sIFswLCAtMV0sIFsxLCAxXSwgWy0xLCAxXSwgWzEsIC0xXSwgWy0xLCAtMV1dO1xuXG5mdW5jdGlvbiBvY3RpbGUoYXg6IG51bWJlciwgYXo6IG51bWJlciwgYng6IG51bWJlciwgYno6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGR4ID0gTWF0aC5hYnMoYXggLSBieCksIGR6ID0gTWF0aC5hYnMoYXogLSBieik7XG4gIHJldHVybiBDT1NUX1NUUkFJR0hUICogTWF0aC5tYXgoZHgsIGR6KSArIChDT1NUX0RJQUdPTkFMIC0gQ09TVF9TVFJBSUdIVCkgKiBNYXRoLm1pbihkeCwgZHopO1xufVxuXG4vKiogTWluLWhlYXAgb3JkZXJlZCBieSAoZiwgaCwgY2VsbCBpbmRleCk6IGEgdG90YWwgb3JkZXIsIHNvIHRpZXMgbmV2ZXIgZGVwZW5kIG9uIGluc2VydGlvbi4gKi9cbmNsYXNzIEhlYXAge1xuICBwcml2YXRlIGY6IG51bWJlcltdID0gW107IHByaXZhdGUgaDogbnVtYmVyW10gPSBbXTsgcHJpdmF0ZSBpOiBudW1iZXJbXSA9IFtdO1xuICBnZXQgc2l6ZSgpIHsgcmV0dXJuIHRoaXMuaS5sZW5ndGg7IH1cbiAgcHJpdmF0ZSBsZXNzKGE6IG51bWJlciwgYjogbnVtYmVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZlthXSA8IHRoaXMuZltiXSB8fCAodGhpcy5mW2FdID09PSB0aGlzLmZbYl0gJiYgKHRoaXMuaFthXSA8IHRoaXMuaFtiXSB8fCAodGhpcy5oW2FdID09PSB0aGlzLmhbYl0gJiYgdGhpcy5pW2FdIDwgdGhpcy5pW2JdKSkpO1xuICB9XG4gIHByaXZhdGUgc3dhcChhOiBudW1iZXIsIGI6IG51bWJlcikge1xuICAgIFt0aGlzLmZbYV0sIHRoaXMuZltiXV0gPSBbdGhpcy5mW2JdLCB0aGlzLmZbYV1dOyBbdGhpcy5oW2FdLCB0aGlzLmhbYl1dID0gW3RoaXMuaFtiXSwgdGhpcy5oW2FdXTsgW3RoaXMuaVthXSwgdGhpcy5pW2JdXSA9IFt0aGlzLmlbYl0sIHRoaXMuaVthXV07XG4gIH1cbiAgcHVzaChmOiBudW1iZXIsIGg6IG51bWJlciwgaTogbnVtYmVyKSB7XG4gICAgdGhpcy5mLnB1c2goZik7IHRoaXMuaC5wdXNoKGgpOyB0aGlzLmkucHVzaChpKTtcbiAgICBsZXQgayA9IHRoaXMuaS5sZW5ndGggLSAxO1xuICAgIHdoaWxlIChrID4gMCkgeyBjb25zdCBwID0gKGsgLSAxKSA+PiAxOyBpZiAoIXRoaXMubGVzcyhrLCBwKSkgYnJlYWs7IHRoaXMuc3dhcChrLCBwKTsgayA9IHA7IH1cbiAgfVxuICBwb3AoKTogbnVtYmVyIHtcbiAgICBjb25zdCB0b3AgPSB0aGlzLmlbMF0sIGxhc3QgPSB0aGlzLmkubGVuZ3RoIC0gMTtcbiAgICB0aGlzLnN3YXAoMCwgbGFzdCk7IHRoaXMuZi5wb3AoKTsgdGhpcy5oLnBvcCgpOyB0aGlzLmkucG9wKCk7XG4gICAgbGV0IGsgPSAwO1xuICAgIGZvciAoOzspIHtcbiAgICAgIGNvbnN0IGwgPSAyICogayArIDEsIHIgPSBsICsgMTtcbiAgICAgIGxldCBtID0gaztcbiAgICAgIGlmIChsIDwgdGhpcy5pLmxlbmd0aCAmJiB0aGlzLmxlc3MobCwgbSkpIG0gPSBsO1xuICAgICAgaWYgKHIgPCB0aGlzLmkubGVuZ3RoICYmIHRoaXMubGVzcyhyLCBtKSkgbSA9IHI7XG4gICAgICBpZiAobSA9PT0gaykgYnJlYWs7XG4gICAgICB0aGlzLnN3YXAoaywgbSk7IGsgPSBtO1xuICAgIH1cbiAgICByZXR1cm4gdG9wO1xuICB9XG59XG5cbi8qKiBDZWxscyAod29ybGQgbWV0cmVzKSB3aG9zZSBjZW50cmUgaXMgd2l0aGluIGByZWFjaGAgb2YgdGhlIGdvYWwgcG9pbnQuICovXG5mdW5jdGlvbiBpc0dvYWwoeDogbnVtYmVyLCB6OiBudW1iZXIsIGdvYWw6IE5hdkdvYWwpOiBib29sZWFuIHtcbiAgY29uc3QgZHggPSBjZW50cmVEbSh4KSAtIGdvYWwueCwgZHogPSBjZW50cmVEbSh6KSAtIGdvYWwuejtcbiAgcmV0dXJuIGR4ICogZHggKyBkeiAqIGR6IDw9IGdvYWwucmVhY2ggKiBnb2FsLnJlYWNoO1xufVxuXG4vKipcbiAqIFNob3J0ZXN0IHJvdXRlIGZyb20gYSBwb2ludCAoZG0pIHRvIGEgZ29hbC4gVGhlIHN0YXJ0IGNlbGwgbWF5IGl0c2VsZiBiZVxuICogYmxvY2tlZCAoYSB3YWxrZXIgc3RhbmRpbmcgd2hlcmUgYSBnYXRlIGp1c3QgbG9ja2VkIGNhbiBzdGlsbCBzdGVwIG91dCkuXG4gKiBSZXR1cm5zIHRoZSBjZWxscyBhZnRlciB0aGUgc3RhcnQgY2VsbCwgYXMgZmxhdCBbeDAsIHowLCB4MSwgejEsIC4uLl0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kUGF0aCh3b3JsZDogV29ybGQsIGc6IE5hdkdyaWQsIGZyb206IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgZ29hbDogTmF2R29hbCwgbzogU2VhcmNoT3B0aW9ucyk6IFBhdGhSZXN1bHQge1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBzID0gbmF2U3RhdHMod29ybGQpO1xuICBzLnNlYXJjaGVzKys7XG4gIGNvbnN0IHJlcyA9IHNlYXJjaChnLCBmcm9tLCBnb2FsLCBvKTtcbiAgcy5leHBhbmRlZCArPSByZXMuZXhwYW5kZWQ7IHMuc2VhcmNoTXMgKz0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgcmV0dXJuIHJlcztcbn1cblxuZnVuY3Rpb24gc2VhcmNoKGc6IE5hdkdyaWQsIGZyb206IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgZ29hbDogTmF2R29hbCwgbzogU2VhcmNoT3B0aW9ucyk6IFBhdGhSZXN1bHQge1xuICBjb25zdCBzeCA9IGNlbGxPZkRtKGZyb20ueCksIHN6ID0gY2VsbE9mRG0oZnJvbS56KTtcbiAgY29uc3QgdHggPSBjZWxsT2ZEbShnb2FsLngpLCB0eiA9IGNlbGxPZkRtKGdvYWwueik7XG4gIGlmICghZy5pbnNpZGUoc3gsIHN6KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBjb2RlOiAnb3V0c2lkZScsIGV4cGFuZGVkOiAwIH07XG4gIGcuZy5maWxsKC0xKTsgZy5jbG9zZWQuZmlsbCgwKTtcbiAgY29uc3Qgc3RhcnQgPSBnLmluZGV4KHN4LCBzeik7XG4gIGNvbnN0IGhlYXAgPSBuZXcgSGVhcCgpO1xuICBjb25zdCBoT2YgPSAoeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IE1hdGgubWF4KDAsIG9jdGlsZSh4LCB6LCB0eCwgdHopIC0gZ29hbC5yZWFjaCk7XG4gIGcuZ1tzdGFydF0gPSAwOyBnLnBhcmVudFtzdGFydF0gPSAtMTtcbiAgaGVhcC5wdXNoKGhPZihzeCwgc3opLCBoT2Yoc3gsIHN6KSwgc3RhcnQpO1xuICBsZXQgZXhwYW5kZWQgPSAwO1xuICB3aGlsZSAoaGVhcC5zaXplKSB7XG4gICAgY29uc3QgaSA9IGhlYXAucG9wKCk7XG4gICAgaWYgKGcuY2xvc2VkW2ldKSBjb250aW51ZTtcbiAgICBnLmNsb3NlZFtpXSA9IDE7XG4gICAgY29uc3QgeCA9IGcuY2VsbFgoaSksIHogPSBnLmNlbGxaKGkpO1xuICAgIGlmICgoaSAhPT0gc3RhcnQgfHwgZy5ibG9ja1tpXSA9PT0gQkxPQ0subm9uZSB8fCAoby5pZ25vcmVOYXR1cmUgJiYgbmF0dXJlQmxvY2soZy5ibG9ja1tpXSkpKSAmJiBpc0dvYWwoeCwgeiwgZ29hbCkpIHtcbiAgICAgIGNvbnN0IGNlbGxzOiBudW1iZXJbXSA9IFtdO1xuICAgICAgZm9yIChsZXQgayA9IGk7IGsgIT09IHN0YXJ0OyBrID0gZy5wYXJlbnRba10pIGNlbGxzLnB1c2goZy5jZWxsWihrKSwgZy5jZWxsWChrKSk7XG4gICAgICBjZWxscy5yZXZlcnNlKCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgY2VsbHMsIGNvc3Q6IGcuZ1tpXSwgZXhwYW5kZWQgfTtcbiAgICB9XG4gICAgaWYgKCsrZXhwYW5kZWQgPiBvLm1heEV4cGFuc2lvbnMpIHJldHVybiB7IG9rOiBmYWxzZSwgY29kZTogJ2J1ZGdldCcsIGV4cGFuZGVkIH07XG4gICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBESVJTKSB7XG4gICAgICBjb25zdCBjID0gbW92ZUNvc3QoZywgeCwgeiwgZHgsIGR6LCBvKTtcbiAgICAgIGlmIChjIDwgMCkgY29udGludWU7XG4gICAgICBjb25zdCBqID0gZy5pbmRleCh4ICsgZHgsIHogKyBkeik7XG4gICAgICBpZiAoZy5jbG9zZWRbal0pIGNvbnRpbnVlO1xuICAgICAgY29uc3QgbmcgPSBnLmdbaV0gKyBjO1xuICAgICAgaWYgKGcuZ1tqXSA+PSAwICYmIGcuZ1tqXSA8PSBuZykgY29udGludWU7XG4gICAgICBnLmdbal0gPSBuZzsgZy5wYXJlbnRbal0gPSBpO1xuICAgICAgY29uc3QgaCA9IGhPZih4ICsgZHgsIHogKyBkeik7XG4gICAgICBoZWFwLnB1c2gobmcgKyBoLCBoLCBqKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBjb2RlOiAnbm9fcm91dGUnLCBleHBhbmRlZCB9O1xufVxuXG4vKiogV2hhdCBzdG9wcyBhIHdhbGtlciByZWFjaGluZyBhIGdvYWw6IHRoZSBmaXJzdCBsb2NrZWQgZ2F0ZSwgdHJlZSBvciByb2NrIG9uIHRoZSBiZXN0IHJvdXRlIGFyb3VuZCBpdCwgb3IgdGhlIGRlc3RpbmF0aW9uIGl0c2VsZi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHBsYWluTm9Sb3V0ZSh3b3JsZDogV29ybGQsIGc6IE5hdkdyaWQsIGZyb206IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgZ29hbDogTmF2R29hbCwgYnVkZ2V0OiBudW1iZXIpOiB7IHJlYXNvbjogc3RyaW5nOyBieTogc3RyaW5nOyBleHBhbmRlZDogbnVtYmVyIH0ge1xuICBsZXQgZXhwYW5kZWQgPSAwO1xuICBjb25zdCB0eCA9IGNlbGxPZkRtKGdvYWwueCksIHR6ID0gY2VsbE9mRG0oZ29hbC56KTtcbiAgaWYgKCFnLmluc2lkZShjZWxsT2ZEbShmcm9tLngpLCBjZWxsT2ZEbShmcm9tLnopKSB8fCAhZy5pbnNpZGUodHgsIHR6KSkgcmV0dXJuIHsgcmVhc29uOiAndGhlIGRlc3RpbmF0aW9uIGlzIG91dHNpZGUgdGhlIHNldHRsZW1lbnQnLCBieTogJ291dHNpZGUnLCBleHBhbmRlZCB9O1xuICBjb25zdCB3aXRoR2F0ZXMgPSBmaW5kUGF0aCh3b3JsZCwgZywgZnJvbSwgZ29hbCwgeyBpZ25vcmVMb2NrZWQ6IHRydWUsIG1heEV4cGFuc2lvbnM6IGJ1ZGdldCB9KTtcbiAgZXhwYW5kZWQgKz0gd2l0aEdhdGVzLmV4cGFuZGVkO1xuICBpZiAod2l0aEdhdGVzLm9rKSB7XG4gICAgbGV0IHB4ID0gY2VsbE9mRG0oZnJvbS54KSwgcHogPSBjZWxsT2ZEbShmcm9tLnopO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgd2l0aEdhdGVzLmNlbGxzLmxlbmd0aDsgayArPSAyKSB7XG4gICAgICBjb25zdCBnYXRlID0gZy5nYXRlQmV0d2VlbihweCwgcHosIHdpdGhHYXRlcy5jZWxsc1trXSwgd2l0aEdhdGVzLmNlbGxzW2sgKyAxXSk7XG4gICAgICBpZiAoZ2F0ZSAmJiBnLmdhdGVTdGF0ZS5nZXQoZ2F0ZSkgPT09ICdsb2NrZWQnKSByZXR1cm4geyByZWFzb246IGB0aGUgJHtnYXRlTGFiZWwoZ2F0ZSl9IGlzIGxvY2tlZGAsIGJ5OiBnYXRlLCBleHBhbmRlZCB9O1xuICAgICAgcHggPSB3aXRoR2F0ZXMuY2VsbHNba107IHB6ID0gd2l0aEdhdGVzLmNlbGxzW2sgKyAxXTtcbiAgICB9XG4gIH1cbiAgY29uc3QgdGhyb3VnaCA9IGZpbmRQYXRoKHdvcmxkLCBnLCBmcm9tLCBnb2FsLCB7IGlnbm9yZUxvY2tlZDogdHJ1ZSwgaWdub3JlTmF0dXJlOiB0cnVlLCBtYXhFeHBhbnNpb25zOiBidWRnZXQgfSk7XG4gIGV4cGFuZGVkICs9IHRocm91Z2guZXhwYW5kZWQ7XG4gIGlmICh0aHJvdWdoLm9rKSB7XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCB0aHJvdWdoLmNlbGxzLmxlbmd0aDsgayArPSAyKSB7XG4gICAgICBjb25zdCBpID0gZy5pbmRleCh0aHJvdWdoLmNlbGxzW2tdLCB0aHJvdWdoLmNlbGxzW2sgKyAxXSk7XG4gICAgICBpZiAobmF0dXJlQmxvY2soZy5ibG9ja1tpXSkpIHJldHVybiB7IHJlYXNvbjogYCR7UkVBU09OX1RFWFRbUkVBU09OX05BTUVTW2cuYmxvY2tbaV1dXX0gYmxvY2tzIHRoZSB3YXlgLCBieTogZy5ibG9ja0lkLmdldChpKSA/PyBSRUFTT05fTkFNRVNbZy5ibG9ja1tpXV0sIGV4cGFuZGVkIH07XG4gICAgfVxuICB9XG4gIC8vIE5vdGhpbmcgcGFzc2FibGUgbmVhciB0aGUgZGVzdGluYXRpb24gaXRzZWxmP1xuICBsZXQgc3RhbmRhYmxlID0gZmFsc2UsIHdvcnN0OiBCbG9ja1JlYXNvbiA9ICdub25lJywgd29yc3RJZCA9ICcnO1xuICBjb25zdCByID0gTWF0aC5jZWlsKGdvYWwucmVhY2ggLyAxMCkgKyAxO1xuICBmb3IgKGxldCB6ID0gdHogLSByOyB6IDw9IHR6ICsgcjsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHR4IC0gcjsgeCA8PSB0eCArIHI7IHgrKykge1xuICAgICAgaWYgKCFnLmluc2lkZSh4LCB6KSB8fCAhaXNHb2FsKHgsIHosIGdvYWwpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGkgPSBnLmluZGV4KHgsIHopO1xuICAgICAgaWYgKGcuYmxvY2tbaV0gPT09IEJMT0NLLm5vbmUpIHN0YW5kYWJsZSA9IHRydWU7XG4gICAgICBlbHNlIGlmICh3b3JzdCA9PT0gJ25vbmUnKSB7IHdvcnN0ID0gUkVBU09OX05BTUVTW2cuYmxvY2tbaV1dOyB3b3JzdElkID0gZy5ibG9ja0lkLmdldChpKSA/PyB3b3JzdDsgfVxuICAgIH1cbiAgfVxuICBpZiAoIXN0YW5kYWJsZSkgcmV0dXJuIHsgcmVhc29uOiBgdGhlIGRlc3RpbmF0aW9uIGlzICR7d29yc3QgPT09ICdub25lJyA/ICdub3Qgd2Fsa2FibGUnIDogYHRha2VuIGJ5ICR7UkVBU09OX1RFWFRbd29yc3RdfWB9YCwgYnk6IHdvcnN0SWQgfHwgd29yc3QsIGV4cGFuZGVkIH07XG4gIHJldHVybiB7IHJlYXNvbjogJ25vIHdhbGthYmxlIHJvdXRlOiBjbGlmZnMsIGRlZXAgd2F0ZXIgb3IgZmVuY2VzIGN1dCBpdCBvZmYnLCBieTogJ3RlcnJhaW4nLCBleHBhbmRlZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2F0ZUxhYmVsKGlkOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBba2luZCwgbmFtZV0gPSBpZC5zcGxpdCgnOicpO1xuICByZXR1cm4ga2luZCA9PT0gJ2Rvb3InID8gYCR7bmFtZX0gZG9vcmAgOiBgJHtuYW1lfSBnYXRlYDtcbn1cblxuLy8gLS0tLS0tLS0tLSByb3V0ZXMgYXMgc3RhdGUgLS0tLS0tLS0tLVxuXG4vKiogS2VlcCBvbmx5IHRoZSBjZWxscyB3aGVyZSB0aGUgZGlyZWN0aW9uIGNoYW5nZXMgKGFuZCB0aGUgbGFzdCkuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHJlc3NQYXRoKGNlbGxzOiBudW1iZXJbXSwgc3RhcnRYOiBudW1iZXIsIHN0YXJ0WjogbnVtYmVyKTogbnVtYmVyW10ge1xuICBjb25zdCBvdXQ6IG51bWJlcltdID0gW107XG4gIGxldCBweCA9IHN0YXJ0WCwgcHogPSBzdGFydFosIGR4ID0gTmFOLCBkeiA9IE5hTjtcbiAgZm9yIChsZXQgayA9IDA7IGsgPCBjZWxscy5sZW5ndGg7IGsgKz0gMikge1xuICAgIGNvbnN0IHggPSBjZWxsc1trXSwgeiA9IGNlbGxzW2sgKyAxXSwgbmR4ID0geCAtIHB4LCBuZHogPSB6IC0gcHo7XG4gICAgaWYgKG91dC5sZW5ndGggJiYgbmR4ID09PSBkeCAmJiBuZHogPT09IGR6KSB7IG91dFtvdXQubGVuZ3RoIC0gMl0gPSB4OyBvdXRbb3V0Lmxlbmd0aCAtIDFdID0gejsgfVxuICAgIGVsc2Ugb3V0LnB1c2goeCwgeik7XG4gICAgZHggPSBuZHg7IGR6ID0gbmR6OyBweCA9IHg7IHB6ID0gejtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG4vKiogRXZlcnkgY2VsbCBvZiBhIGNvbXByZXNzZWQgcm91dGUsIHdhbGtpbmcgZnJvbSAoc3RhcnRYLCBzdGFydFopLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4cGFuZFBhdGgoY29ybmVyczogbnVtYmVyW10sIHN0YXJ0WDogbnVtYmVyLCBzdGFydFo6IG51bWJlcik6IG51bWJlcltdIHtcbiAgY29uc3Qgb3V0OiBudW1iZXJbXSA9IFtdO1xuICBsZXQgeCA9IHN0YXJ0WCwgeiA9IHN0YXJ0WjtcbiAgZm9yIChsZXQgayA9IDA7IGsgPCBjb3JuZXJzLmxlbmd0aDsgayArPSAyKSB7XG4gICAgY29uc3QgdHggPSBjb3JuZXJzW2tdLCB0eiA9IGNvcm5lcnNbayArIDFdO1xuICAgIGlmICh4ID09PSB0eCAmJiB6ID09PSB0eiAmJiBvdXQubGVuZ3RoID09PSAwKSB7IG91dC5wdXNoKHgsIHopOyBjb250aW51ZTsgfVxuICAgIGxldCBndWFyZCA9IDA7XG4gICAgd2hpbGUgKCh4ICE9PSB0eCB8fCB6ICE9PSB0eikgJiYgZ3VhcmQrKyA8IDUxMikgeyB4ICs9IE1hdGguc2lnbih0eCAtIHgpOyB6ICs9IE1hdGguc2lnbih0eiAtIHopOyBvdXQucHVzaCh4LCB6KTsgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbi8qKiBBIHdhbGtlcidzIHJvdXRlIHN0YXRlIChzYXZlZCB3aXRoIHRoZSB3YWxrZXI7IGludGVnZXJzIGFuZCBzdHJpbmdzIG9ubHkpLiAqL1xuZXhwb3J0IGludGVyZmFjZSBOYXZTdGF0ZSB7XG4gIC8qKiBDb3JuZXIgY2VsbHMgc3RpbGwgdG8gd2FsayAod29ybGQgbWV0cmVzLCBmbGF0IHgsIHogcGFpcnMpLiAqL1xuICBwYXRoOiBudW1iZXJbXTtcbiAgLyoqIEdyaWQgaGFzaCB0aGUgcm91dGUgd2FzIHBsYW5uZWQgb247IGFueSBjaGFuZ2UgdHJpZ2dlcnMgYSByZXBsYW4uICovXG4gIHBsYW46IHN0cmluZztcbiAgLyoqIERlc3RpbmF0aW9uIHBvaW50IChkbSkgYW5kIHJlYWNoIChkbSkgdGhlIHJvdXRlIHNlcnZlcy4gKi9cbiAgZGVzdDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuICAvKiogQSBjbG9zZWQgZ2F0ZSB0aGUgd2Fsa2VyIHN0b3BwZWQgYXQ7IGl0IG9wZW5zIGl0IG9uIGl0cyBuZXh0IHRpY2suICovXG4gIG9wZW5pbmc/OiBzdHJpbmc7XG4gIC8qKiBBIGdhdGUgdGhpcyB3YWxrZXIgb3BlbmVkIGFuZCBtdXN0IGNsb3NlIGJlaGluZCBpdHNlbGYsIGFuZCB0aGUgZmFyIGNlbGwuICovXG4gIG9wZW5lZD86IHN0cmluZztcbiAgZmFyPzogW251bWJlciwgbnVtYmVyXTtcbiAgYmxvY2tlZD86IE5hdkJsb2NrZWQ7XG59XG5leHBvcnQgaW50ZXJmYWNlIE5hdkJsb2NrZWQgeyByZWFzb246IHN0cmluZzsgYnk6IHN0cmluZzsgdGFyZ2V0OiBzdHJpbmc7IHNpbmNlOiBudW1iZXIgfVxuXG5leHBvcnQgaW50ZXJmYWNlIE5hdkNvbnRleHQge1xuICB3b3JsZDogV29ybGQ7XG4gIGdyaWQ6IE5hdkdyaWQ7XG4gIHRpY2s6IG51bWJlcjtcbiAgLyoqIFNoYXJlZCBzZWFyY2ggYnVkZ2V0IGZvciB0aGlzIHRpY2sgKGV4cGFuc2lvbnMpLCBkZWNyZW1lbnRlZCBieSBldmVyeSBzZWFyY2guICovXG4gIGJ1ZGdldDogeyBsZWZ0OiBudW1iZXIgfTtcbiAgZ2F0ZShpZDogc3RyaW5nKTogR2F0ZVN0YXRlO1xuICBzZXRHYXRlKGlkOiBzdHJpbmcsIHN0YXRlOiBHYXRlU3RhdGUpOiB2b2lkO1xuICAvKiogTWF5IHRoaXMgd2Fsa2VyIG9wZW4gYW5kIGNsb3NlIHRoZSBnYXRlIChpdCBpcyBuZXZlciBhc2tlZCBmb3IgYSBsb2NrZWQgb25lKS4gKi9cbiAgY2FuT3BlcmF0ZShpZDogc3RyaW5nKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgTmF2U3RlcCA9XG4gIHwgeyBzdGF0dXM6ICdhcnJpdmVkJyB9XG4gIHwgeyBzdGF0dXM6ICdtb3ZpbmcnIH1cbiAgfCB7IHN0YXR1czogJ3dhaXRpbmcnIH1cbiAgfCB7IHN0YXR1czogJ2Jsb2NrZWQnOyByZWFzb246IHN0cmluZzsgYnk6IHN0cmluZzsgZnJlc2g6IGJvb2xlYW4gfTtcblxuY29uc3QgZGlzdCA9IChheDogbnVtYmVyLCBhejogbnVtYmVyLCBieDogbnVtYmVyLCBiejogbnVtYmVyKSA9PiB7IGNvbnN0IGR4ID0gYnggLSBheCwgZHogPSBieiAtIGF6OyByZXR1cm4gTWF0aC5zcXJ0KGR4ICogZHggKyBkeiAqIGR6KTsgfTtcblxuLyoqXG4gKiBXYWxrIG9uZSB0aWNrIHRvd2FyZCBhIGdvYWw6IHJlcGxhbiB3aGVuIHRoZSBncmlkIG9yIGdvYWwgY2hhbmdlZCwgc3RvcCB0b1xuICogb3BlbiBjbG9zZWQgZ2F0ZXMsIGNsb3NlIHRoZW0gYmVoaW5kLCBhbmQgcmVwb3J0IGEgcmVhbCBvYnN0cnVjdGlvbiB3aGVuXG4gKiBubyByb3V0ZSBleGlzdHMuIFRoZSB3YWxrZXIgb25seSBldmVyIG1vdmVzIGFsb25nIGEgdmFsaWQgcm91dGU6IHRoZXJlIGlzXG4gKiBubyB0ZWxlcG9ydCBhbmQgbm8gc3RyYWlnaHQtbGluZSBmYWxsYmFjay5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5hdlN0ZXAoY3R4OiBOYXZDb250ZXh0LCB3OiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyBuYXY/OiBOYXZTdGF0ZSB9LCBnb2FsOiBOYXZHb2FsLCBzcGVlZDogbnVtYmVyLCB0YXJnZXQ6IHN0cmluZyk6IE5hdlN0ZXAge1xuICBjb25zdCBnID0gY3R4LmdyaWQ7XG4gIGxldCBuYXYgPSB3Lm5hdjtcbiAgLy8gT3BlbiB0aGUgZ2F0ZSBpdCBzdG9wcGVkIGF0IChvbmUgdGljayBvZiB3b3JrKSwgdW5sZXNzIGl0IHdhcyBsb2NrZWQgbWVhbndoaWxlLlxuICBpZiAobmF2Py5vcGVuaW5nKSB7XG4gICAgY29uc3QgaWQgPSBuYXYub3BlbmluZztcbiAgICBkZWxldGUgbmF2Lm9wZW5pbmc7XG4gICAgY29uc3Qgc3QgPSBjdHguZ2F0ZShpZCk7XG4gICAgaWYgKHN0ID09PSAnY2xvc2VkJyAmJiBjdHguY2FuT3BlcmF0ZShpZCkpIHtcbiAgICAgIGN0eC5zZXRHYXRlKGlkLCAnb3BlbicpO1xuICAgICAgbmF2Lm9wZW5lZCA9IGlkO1xuICAgICAgcmV0dXJuIHsgc3RhdHVzOiAnbW92aW5nJyB9O1xuICAgIH1cbiAgICBpZiAoc3QgPT09ICdsb2NrZWQnKSBuYXYucGxhbiA9ICcnO1xuICB9XG4gIGNvbnN0IGhlcmUgPSAoKTogW251bWJlciwgbnVtYmVyXSA9PiBbY2VsbE9mRG0ody54KSwgY2VsbE9mRG0ody56KV07XG4gIGNvbnN0IGZpbmFsUG9pbnQgPSAoY3g6IG51bWJlciwgY3o6IG51bWJlciwgbGFzdDogYm9vbGVhbiwgZGVzdDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdKTogW251bWJlciwgbnVtYmVyXSA9PlxuICAgIGxhc3QgJiYgY2VsbE9mRG0oZGVzdFswXSkgPT09IGN4ICYmIGNlbGxPZkRtKGRlc3RbMV0pID09PSBjeiA/IFtkZXN0WzBdLCBkZXN0WzFdXSA6IFtjZW50cmVEbShjeCksIGNlbnRyZURtKGN6KV07XG4gIGNvbnN0IGF0RmluYWwgPSAobjogTmF2U3RhdGUpID0+IHtcbiAgICBpZiAobi5wYXRoLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IFtjeCwgY3pdID0gaGVyZSgpO1xuICAgIGlmICghaXNHb2FsKGN4LCBjeiwgeyB4OiBuLmRlc3RbMF0sIHo6IG4uZGVzdFsxXSwgcmVhY2g6IG4uZGVzdFsyXSB9KSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IFtmeCwgZnpdID0gZmluYWxQb2ludChjeCwgY3osIHRydWUsIG4uZGVzdCk7XG4gICAgcmV0dXJuIHcueCA9PT0gZnggJiYgdy56ID09PSBmejtcbiAgfTtcbiAgY29uc3QgZHJpZnQgPSBnb2FsLmRyaWZ0ID8/IDA7XG4gIGNvbnN0IGdvYWxNb3ZlZCA9ICFuYXYgfHwgbmF2LmRlc3RbMl0gIT09IGdvYWwucmVhY2hcbiAgICB8fCBNYXRoLmFicyhuYXYuZGVzdFswXSAtIGdvYWwueCkgPiBkcmlmdCB8fCBNYXRoLmFicyhuYXYuZGVzdFsxXSAtIGdvYWwueikgPiBkcmlmdDtcbiAgLy8gQmxvY2tlZCB3aXRoIG5vdGhpbmcgY2hhbmdlZDogdGhlIGFuc3dlciB3b3VsZCBiZSB0aGUgc2FtZSwgc28gZG8gbm90IHNlYXJjaCBhZ2Fpbi5cbiAgaWYgKG5hdj8uYmxvY2tlZCAmJiAhZ29hbE1vdmVkICYmIG5hdi5wbGFuID09PSBnLmhhc2ggJiYgIW5hdi5wYXRoLmxlbmd0aCAmJiBuYXYuYmxvY2tlZC50YXJnZXQgPT09IHRhcmdldCkge1xuICAgIGNsb3NlQmVoaW5kKGN0eCwgdywgbmF2KTtcbiAgICByZXR1cm4geyBzdGF0dXM6ICdibG9ja2VkJywgcmVhc29uOiBuYXYuYmxvY2tlZC5yZWFzb24sIGJ5OiBuYXYuYmxvY2tlZC5ieSwgZnJlc2g6IGZhbHNlIH07XG4gIH1cbiAgaWYgKCFuYXYgfHwgZ29hbE1vdmVkIHx8IG5hdi5wbGFuICE9PSBnLmhhc2ggfHwgKCFuYXYucGF0aC5sZW5ndGggJiYgIWF0RmluYWwobmF2KSkpIHtcbiAgICBpZiAoY3R4LmJ1ZGdldC5sZWZ0IDw9IDApIHJldHVybiB7IHN0YXR1czogJ3dhaXRpbmcnIH07XG4gICAgY29uc3QgW3N4LCBzel0gPSBoZXJlKCk7XG4gICAgY29uc3QgcmVzID0gZmluZFBhdGgoY3R4LndvcmxkLCBnLCB3LCBnb2FsLCB7IG1heEV4cGFuc2lvbnM6IGN0eC5idWRnZXQubGVmdCB9KTtcbiAgICBjdHguYnVkZ2V0LmxlZnQgLT0gcmVzLmV4cGFuZGVkO1xuICAgIGlmICghcmVzLm9rICYmIHJlcy5jb2RlID09PSAnYnVkZ2V0JykgcmV0dXJuIHsgc3RhdHVzOiAnd2FpdGluZycgfTtcbiAgICBjb25zdCBrZWVwOiBQYXJ0aWFsPE5hdlN0YXRlPiA9IG5hdiA/IHsgLi4uKG5hdi5vcGVuZWQgPyB7IG9wZW5lZDogbmF2Lm9wZW5lZCB9IDoge30pLCAuLi4obmF2LmZhciA/IHsgZmFyOiBuYXYuZmFyIH0gOiB7fSkgfSA6IHt9O1xuICAgIGlmICghcmVzLm9rKSB7XG4gICAgICBjb25zdCB3aHkgPSByZXMuY29kZSA9PT0gJ291dHNpZGUnID8geyByZWFzb246ICdpdCBpcyBvdXRzaWRlIHRoZSBzZXR0bGVtZW50IGdyaWQnLCBieTogJ291dHNpZGUnLCBleHBhbmRlZDogMCB9XG4gICAgICAgIDogZXhwbGFpbk5vUm91dGUoY3R4LndvcmxkLCBnLCB3LCBnb2FsLCBNYXRoLm1heCgwLCBjdHguYnVkZ2V0LmxlZnQpKTtcbiAgICAgIGN0eC5idWRnZXQubGVmdCAtPSB3aHkuZXhwYW5kZWQ7XG4gICAgICBjb25zdCBwcmV2ID0gbmF2Py5ibG9ja2VkO1xuICAgICAgY29uc3QgZnJlc2ggPSAhcHJldiB8fCBwcmV2LnRhcmdldCAhPT0gdGFyZ2V0IHx8IHByZXYucmVhc29uICE9PSB3aHkucmVhc29uO1xuICAgICAgbmF2ID0geyBwYXRoOiBbXSwgcGxhbjogZy5oYXNoLCBkZXN0OiBbZ29hbC54LCBnb2FsLnosIGdvYWwucmVhY2hdLCAuLi5rZWVwLFxuICAgICAgICBibG9ja2VkOiB7IHJlYXNvbjogd2h5LnJlYXNvbiwgYnk6IHdoeS5ieSwgdGFyZ2V0LCBzaW5jZTogZnJlc2ggPyBjdHgudGljayA6IHByZXYhLnNpbmNlIH0gfTtcbiAgICAgIHcubmF2ID0gbmF2O1xuICAgICAgY2xvc2VCZWhpbmQoY3R4LCB3LCBuYXYpO1xuICAgICAgcmV0dXJuIHsgc3RhdHVzOiAnYmxvY2tlZCcsIHJlYXNvbjogd2h5LnJlYXNvbiwgYnk6IHdoeS5ieSwgZnJlc2ggfTtcbiAgICB9XG4gICAgLy8gQW4gb2ZmLWNlbnRyZSBzdGFydCB3YWxrcyB0byBpdHMgb3duIGNlbGwgY2VudHJlIGZpcnN0LCBzbyBldmVyeSBnYXRlIGNoZWNrIGhhcHBlbnMgYXQgYSBjZW50cmUuXG4gICAgLy8gQWxyZWFkeSBpbiBhIGdvYWwgY2VsbDogdGhlIHJvdXRlIGlzIHRoYXQgY2VsbCAodG8gdGhlIGV4YWN0IHNwb3Qgd2hlbiBpdCBsaWVzIGluc2lkZSBpdCkuXG4gICAgY29uc3QgY2VsbHMgPSAhcmVzLmNlbGxzLmxlbmd0aCA/IFtzeCwgc3pdXG4gICAgICA6IHcueCAhPT0gY2VudHJlRG0oc3gpIHx8IHcueiAhPT0gY2VudHJlRG0oc3opID8gW3N4LCBzeiwgLi4ucmVzLmNlbGxzXSA6IHJlcy5jZWxscztcbiAgICBuYXYgPSB7IHBhdGg6IGNvbXByZXNzUGF0aChjZWxscywgc3gsIHN6KSwgcGxhbjogZy5oYXNoLCBkZXN0OiBbZ29hbC54LCBnb2FsLnosIGdvYWwucmVhY2hdLCAuLi5rZWVwIH07XG4gICAgdy5uYXYgPSBuYXY7XG4gIH1cbiAgLy8gV2FsayBhbG9uZyB0aGUgcm91dGUuXG4gIGxldCBidWRnZXQgPSBzcGVlZDtcbiAgY29uc3QgW3N4MCwgc3owXSA9IGhlcmUoKTtcbiAgY29uc3QgY2VsbHMgPSBleHBhbmRQYXRoKG5hdi5wYXRoLCBzeDAsIHN6MCk7XG4gIGxldCBtb3ZlZCA9IGZhbHNlO1xuICB3aGlsZSAoYnVkZ2V0ID4gMCAmJiBjZWxscy5sZW5ndGgpIHtcbiAgICBjb25zdCBueCA9IGNlbGxzWzBdLCBueiA9IGNlbGxzWzFdO1xuICAgIGNvbnN0IFtjeCwgY3pdID0gaGVyZSgpO1xuICAgIGlmICh3LnggPT09IGNlbnRyZURtKGN4KSAmJiB3LnogPT09IGNlbnRyZURtKGN6KSAmJiAobnggIT09IGN4IHx8IG56ICE9PSBjeikpIHtcbiAgICAgIC8vIEFib3V0IHRvIGxlYXZlIGEgY2VudHJlIGZvciB0aGUgbmV4dCBjZWxsOiBpcyB0aGUgZWRnZSBzdGlsbCBwYXNzYWJsZT9cbiAgICAgIGlmICghY2FuTW92ZShnLCBjeCwgY3osIG54LCBueikpIHsgbmF2LnBsYW4gPSAnJzsgYnJlYWs7IH1cbiAgICAgIGNvbnN0IGdhdGUgPSBnLmdhdGVCZXR3ZWVuKGN4LCBjeiwgbngsIG56KTtcbiAgICAgIGlmIChnYXRlKSB7XG4gICAgICAgIGNvbnN0IHN0ID0gY3R4LmdhdGUoZ2F0ZSk7XG4gICAgICAgIGlmIChzdCA9PT0gJ2xvY2tlZCcgfHwgKHN0ID09PSAnY2xvc2VkJyAmJiAhY3R4LmNhbk9wZXJhdGUoZ2F0ZSkpKSB7IG5hdi5wbGFuID0gJyc7IGJyZWFrOyB9XG4gICAgICAgIGlmIChzdCA9PT0gJ2Nsb3NlZCcpIHsgbmF2Lm9wZW5pbmcgPSBnYXRlOyBicmVhazsgfVxuICAgICAgICBpZiAobmF2Lm9wZW5lZCA9PT0gZ2F0ZSkgbmF2LmZhciA9IFtueCwgbnpdO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBbdHgsIHR6XSA9IGZpbmFsUG9pbnQobngsIG56LCBjZWxscy5sZW5ndGggPT09IDIsIG5hdi5kZXN0KTtcbiAgICBjb25zdCBkID0gZGlzdCh3LngsIHcueiwgdHgsIHR6KTtcbiAgICBpZiAoZCA8PSBidWRnZXQpIHtcbiAgICAgIHcueCA9IHR4OyB3LnogPSB0ejsgYnVkZ2V0IC09IGQ7IGNlbGxzLnNwbGljZSgwLCAyKTsgbW92ZWQgPSB0cnVlO1xuICAgICAgaWYgKG5hdi5vcGVuZWQgJiYgbmF2LmZhciAmJiBuYXYuZmFyWzBdID09PSBueCAmJiBuYXYuZmFyWzFdID09PSBueikgY2xvc2VCZWhpbmQoY3R4LCB3LCBuYXYsIHRydWUpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHcueCArPSBNYXRoLnJvdW5kKCgodHggLSB3LngpIC8gZCkgKiBidWRnZXQpOyB3LnogKz0gTWF0aC5yb3VuZCgoKHR6IC0gdy56KSAvIGQpICogYnVkZ2V0KTtcbiAgICBtb3ZlZCA9IHRydWU7XG4gICAgYnJlYWs7XG4gIH1cbiAgY29uc3QgW2V4LCBlel0gPSBoZXJlKCk7XG4gIG5hdi5wYXRoID0gY29tcHJlc3NQYXRoKGNlbGxzLCBleCwgZXopO1xuICBjbG9zZUJlaGluZChjdHgsIHcsIG5hdik7XG4gIGlmIChuYXYuYmxvY2tlZCkgZGVsZXRlIG5hdi5ibG9ja2VkO1xuICBpZiAoIWNlbGxzLmxlbmd0aCAmJiBhdEZpbmFsKG5hdikpIHJldHVybiB7IHN0YXR1czogJ2Fycml2ZWQnIH07XG4gIHJldHVybiBtb3ZlZCB8fCBuYXYub3BlbmluZyA/IHsgc3RhdHVzOiAnbW92aW5nJyB9IDogeyBzdGF0dXM6ICd3YWl0aW5nJyB9O1xufVxuXG4vKiogQ2xvc2UgYSBnYXRlIHRoaXMgd2Fsa2VyIG9wZW5lZCBvbmNlIGl0IGlzIHRocm91Z2ggKG9yIGhhcyBsZWZ0IGl0IGJlaGluZCkuICovXG5mdW5jdGlvbiBjbG9zZUJlaGluZChjdHg6IE5hdkNvbnRleHQsIHc6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgbmF2OiBOYXZTdGF0ZSwgdGhyb3VnaCA9IGZhbHNlKTogdm9pZCB7XG4gIGlmICghbmF2Lm9wZW5lZCkgcmV0dXJuO1xuICBjb25zdCBjZWxscyA9IGN0eC5ncmlkLmdhdGVDZWxscy5nZXQobmF2Lm9wZW5lZCk7XG4gIGNvbnN0IGN4ID0gY2VsbE9mRG0ody54KSwgY3ogPSBjZWxsT2ZEbSh3LnopO1xuICBjb25zdCBvbkdhdGUgPSAhIWNlbGxzICYmICgoY2VsbHNbMF0gPT09IGN4ICYmIGNlbGxzWzFdID09PSBjeikgfHwgKGNlbGxzWzJdID09PSBjeCAmJiBjZWxsc1szXSA9PT0gY3opKTtcbiAgaWYgKCF0aHJvdWdoICYmIG9uR2F0ZSkgcmV0dXJuO1xuICBpZiAoY3R4LmdhdGUobmF2Lm9wZW5lZCkgPT09ICdvcGVuJykgY3R4LnNldEdhdGUobmF2Lm9wZW5lZCwgJ2Nsb3NlZCcpO1xuICBkZWxldGUgbmF2Lm9wZW5lZDtcbiAgZGVsZXRlIG5hdi5mYXI7XG59XG5cbi8qKiBEZWNpbWV0cmUgaGVscGVycyBmb3IgY2FsbGVycy4gKi9cbmV4cG9ydCBjb25zdCBuYXZDZWxsID0gY2VsbE9mRG07XG5leHBvcnQgY29uc3QgbmF2Q2VudHJlID0gY2VudHJlRG07XG5leHBvcnQgeyBDSFVOS19TSVpFIGFzIE5BVl9DSFVOSyB9O1xuIiwgIi8vIFNjaGVtYS0zIGxpZmUgbG9vcC4gQWxsIHF1YW50aXRpZXMgYXJlIGludGVnZXJzIGFuZCBhbGwgbXV0YXRpb25zIGFyZSBkcml2ZW5cbi8vIGJ5IGFjY2VwdGVkIGNvbW1hbmRzOyB3YWxsLWNsb2NrIHRpbWUgYW5kIHJlbmRlcmluZyBuZXZlciBhZHZhbmNlIHRoaXMgc3RhdGUuXG5pbXBvcnQgdHlwZSB7IFdvcmxkIH0gZnJvbSAnLi93b3JsZCc7XG5cbi8qKiBFdmVyeSByZXNvdXJjZSBhIGJhZyBvciBzdG9yZSBtYXkgaG9sZC4gTTAwNiBhZGRzIGFuaW1hbCBwcm9kdWN0cyBhbmQgY2FycmllZCB3YXRlciBidWNrZXRzLiAqL1xuZXhwb3J0IGNvbnN0IExJRkVfUkVTT1VSQ0VTID0gWydlZ2dzJywgJ2ZpYmVyJywgJ2Zvb2QnLCAnbWlsaycsICdvcmUnLCAncmF0aW9ucycsICdzZWVkJywgJ3N0b25lJywgJ3dhdGVyJywgJ3dvb2QnLCAnd29vbCddIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTGlmZVJlc291cmNlID0gKHR5cGVvZiBMSUZFX1JFU09VUkNFUylbbnVtYmVyXTtcbmV4cG9ydCBjb25zdCBDQVJSSUVEX0NBUEFDSVRZID0gMTIwO1xuZXhwb3J0IGNvbnN0IFNUT0NLUElMRV9DQVBBQ0lUWSA9IDIwMDtcbmV4cG9ydCBjb25zdCBNQVhfUFJPRFVDVElPTl9KT0JTID0gMTY7XG5leHBvcnQgY29uc3QgTUFYX1RJQ0tTX1BFUl9DT01NQU5EID0gNjQ7XG5leHBvcnQgY29uc3QgQ1JPUF9HUk9XVEhfVElDS1MgPSA0O1xuLyoqIEZpeGVkIGhhcnZlc3QgZnJvbSBvbmUgcmVhZHkgY3JvcCBwbG90LiBKb3VybmFsIG91dGNvbWVzIG11c3QgbWF0Y2ggaXQgZXhhY3RseS4gKi9cbmV4cG9ydCBjb25zdCBDUk9QX1lJRUxEID0geyBmb29kOiA2LCBmaWJlcjogMSB9IGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IENST1BfWUlFTERfTEFCRUwgPSBgJHtDUk9QX1lJRUxELmZvb2R9IGZvb2QgKyAke0NST1BfWUlFTEQuZmliZXJ9IGZpYmVyYDtcbmV4cG9ydCBjb25zdCBGT1VOREVSX1NUT0NLUElMRV9JRCA9ICdzdG9ja3BpbGU6Zm91bmRlcic7XG5leHBvcnQgY29uc3QgRk9VTkRFUl9TVE9DS1BJTEUgPSB7IGlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgeDogLTUwLCB6OiAtMzIsIGNhcGFjaXR5OiBTVE9DS1BJTEVfQ0FQQUNJVFkgfSBhcyBjb25zdDtcblxuZXhwb3J0IHR5cGUgTGlmZVJlc291cmNlQmFnID0gUGFydGlhbDxSZWNvcmQ8TGlmZVJlc291cmNlLCBudW1iZXI+PjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9ja3BpbGUge1xuICBpZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgY2FwYWNpdHk6IHR5cGVvZiBTVE9DS1BJTEVfQ0FQQUNJVFk7XG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbn1cblxuZXhwb3J0IHR5cGUgUmVjaXBlSWQgPSAnc2VlZCcgfCAncmF0aW9ucyc7XG5leHBvcnQgY29uc3QgUkVDSVBFUzogUmVjb3JkPFJlY2lwZUlkLCB7IGlucHV0OiBMaWZlUmVzb3VyY2VCYWc7IG91dHB1dDogTGlmZVJlc291cmNlQmFnOyB0aWNrczogbnVtYmVyIH0+ID0ge1xuICBzZWVkOiB7IGlucHV0OiB7IGZpYmVyOiAyIH0sIG91dHB1dDogeyBzZWVkOiAzIH0sIHRpY2tzOiAxIH0sXG4gIHJhdGlvbnM6IHsgaW5wdXQ6IHsgZm9vZDogMiB9LCBvdXRwdXQ6IHsgcmF0aW9uczogMyB9LCB0aWNrczogMiB9LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBQcm9kdWN0aW9uSm9iIHtcbiAgaWQ6IHN0cmluZztcbiAgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVjaXBlOiBSZWNpcGVJZDtcbiAgcmVtYWluaW5nVGlja3M6IG51bWJlcjtcbn1cblxuLyoqIEZpeGVkIHBsb3RzIGNvcnJlc3BvbmQgdG8gdGhlIG5pbmUgYXV0aG9yaXRhdGl2ZSB0ZXJyYWNlIGNyb3Atcm93IHZvbHVtZXMuICovXG5leHBvcnQgY29uc3QgQ1JPUF9QTE9UX0lEUyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDkgfSwgKF8sIGkpID0+IGBjcm9wOiR7aX1gKTtcbmV4cG9ydCBpbnRlcmZhY2UgQ3JvcFBsb3Qge1xuICBpZDogc3RyaW5nO1xuICBwbGFudGVkVGljazogbnVtYmVyO1xuICBncm93dGhUaWNrczogdHlwZW9mIENST1BfR1JPV1RIX1RJQ0tTO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExpZmVTdGF0ZSB7XG4gIHN0b2NrcGlsZXM6IE1hcDxzdHJpbmcsIFN0b2NrcGlsZT47XG4gIGpvYnM6IE1hcDxzdHJpbmcsIFByb2R1Y3Rpb25Kb2I+O1xuICBjcm9wczogTWFwPHN0cmluZywgQ3JvcFBsb3Q+O1xuICB0aWNrOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMaWZlU3RhdGUoKTogTGlmZVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBzdG9ja3BpbGVzOiBuZXcgTWFwKFtbRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHtcbiAgICAgIGlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgeDogRk9VTkRFUl9TVE9DS1BJTEUueCwgejogRk9VTkRFUl9TVE9DS1BJTEUueixcbiAgICAgIGNhcGFjaXR5OiBTVE9DS1BJTEVfQ0FQQUNJVFksIGludmVudG9yeToge30sXG4gICAgfV1dKSwgam9iczogbmV3IE1hcCgpLCBjcm9wczogbmV3IE1hcCgpLCB0aWNrOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG90YWwoYmFnOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTogbnVtYmVyIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMoYmFnKS5yZWR1Y2UoKHN1bSwgYW1vdW50KSA9PiBzdW0gKyBhbW91bnQsIDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVCYWcoYmFnOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIHJldHVybiBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMoYmFnKS5maWx0ZXIoKFssIGFtb3VudF0pID0+IGFtb3VudCA+IDApXG4gICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxpZmVTdGF0ZSh3b3JsZDogV29ybGQpOiBMaWZlU3RhdGUge1xuICBpZiAoIXdvcmxkLmxpZmUpIHRocm93IG5ldyBFcnJvcignbGlmZS1sb29wIGNvbW1hbmRzIHJlcXVpcmUgYSBzY2hlbWEtMyB3b3JsZCcpO1xuICByZXR1cm4gd29ybGQubGlmZTtcbn1cblxuZXhwb3J0IHR5cGUgTGlmZUZhaWx1cmUgPSB7IG9rOiBmYWxzZTsgY29kZTogc3RyaW5nOyByZWFzb25zOiBzdHJpbmdbXSB9O1xuZXhwb3J0IHR5cGUgTGlmZVN1Y2Nlc3M8VD4gPSB7IG9rOiB0cnVlOyB2YWx1ZTogVCB9O1xuZXhwb3J0IHR5cGUgTGlmZVJlc3VsdDxUPiA9IExpZmVTdWNjZXNzPFQ+IHwgTGlmZUZhaWx1cmU7XG5mdW5jdGlvbiByZWplY3RMaWZlKGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBMaWZlRmFpbHVyZSB7XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgY29kZSwgcmVhc29ucyB9O1xufVxudHlwZSBQYXJzZWRBbW91bnQgPSB7IG9rOiB0cnVlOyByZXNvdXJjZTogTGlmZVJlc291cmNlOyBhbW91bnQ6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IHJlYXNvbnM6IHN0cmluZ1tdIH07XG5mdW5jdGlvbiByZXF1aXJlQW1vdW50KGJhZzogTGlmZVJlc291cmNlQmFnKTogUGFyc2VkQW1vdW50IHtcbiAgY29uc3QgZW50cmllcyA9IE9iamVjdC5lbnRyaWVzKGJhZyk7XG4gIGlmIChlbnRyaWVzLmxlbmd0aCAhPT0gMSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb25zOiBbJ3RyYW5zZmVyIGV4YWN0bHkgb25lIHJlc291cmNlIGF0IGEgdGltZSddIH07XG4gIGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSA9IGVudHJpZXNbMF07XG4gIGlmICghTElGRV9SRVNPVVJDRVMuaW5jbHVkZXMocmVzb3VyY2UgYXMgTGlmZVJlc291cmNlKSB8fCAhTnVtYmVyLmlzU2FmZUludGVnZXIoYW1vdW50KSB8fCAoYW1vdW50ID8/IDApIDw9IDApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbnM6IFsncmVzb3VyY2UgYW1vdW50IG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyJ10gfTtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgcmVzb3VyY2U6IHJlc291cmNlIGFzIExpZmVSZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbmZ1bmN0aW9uIG1vdmUod29ybGQ6IFdvcmxkLCBmcm9tOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+LCB0bzogUmVjb3JkPHN0cmluZywgbnVtYmVyPixcbiAgcmVxdWVzdGVkOiBMaWZlUmVzb3VyY2VCYWcsIHRvQ2FwYWNpdHk6IG51bWJlcik6IExpZmVSZXN1bHQ8TGlmZVJlc291cmNlQmFnPiB7XG4gIGNvbnN0IGNoZWNrZWQgPSByZXF1aXJlQW1vdW50KHJlcXVlc3RlZCk7XG4gIGlmICghY2hlY2tlZC5vaykgcmV0dXJuIHJlamVjdExpZmUoJ2ludmFsaWRfdHJhbnNmZXInLCBbY2hlY2tlZC5yZWFzb25zWzBdXSk7XG4gIGNvbnN0IHsgcmVzb3VyY2UsIGFtb3VudCB9ID0gY2hlY2tlZDtcbiAgaWYgKChmcm9tW3Jlc291cmNlXSA/PyAwKSA8IGFtb3VudCkgcmV0dXJuIHJlamVjdExpZmUoJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLCBbYG5lZWQgJHthbW91bnR9ICR7U3RyaW5nKHJlc291cmNlKX0sIGhhdmUgJHtmcm9tW3Jlc291cmNlXSA/PyAwfWBdKTtcbiAgaWYgKHRvdGFsKHRvKSArIGFtb3VudCA+IHRvQ2FwYWNpdHkpIHJldHVybiByZWplY3RMaWZlKCdjYXBhY2l0eV9leGNlZWRlZCcsIFtgZGVzdGluYXRpb24gY2FwYWNpdHkgJHt0b0NhcGFjaXR5fSB3b3VsZCBiZSBleGNlZWRlZGBdKTtcbiAgZnJvbVtyZXNvdXJjZV0gPSAoZnJvbVtyZXNvdXJjZV0gPz8gMCkgLSBhbW91bnQ7XG4gIGlmIChmcm9tW3Jlc291cmNlXSA9PT0gMCkgZGVsZXRlIGZyb21bcmVzb3VyY2VdO1xuICB0b1tyZXNvdXJjZV0gPSAodG9bcmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgW3Jlc291cmNlXTogYW1vdW50IH0gfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyYW5zZmVyKHdvcmxkOiBXb3JsZCwga2luZDogJ2RlcG9zaXQnIHwgJ3dpdGhkcmF3JywgYmFnOiBMaWZlUmVzb3VyY2VCYWcpOiBMaWZlUmVzdWx0PExpZmVSZXNvdXJjZUJhZz4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgaWYgKCFzdG9jaykgcmV0dXJuIHJlamVjdExpZmUoJ21pc3Npbmdfc3RvY2twaWxlJywgWydmb3VuZGVyIHN0b2NrcGlsZSBpcyBhYnNlbnQnXSk7XG4gIHJldHVybiBraW5kID09PSAnZGVwb3NpdCdcbiAgICA/IG1vdmUod29ybGQsIHdvcmxkLmludmVudG9yeSwgc3RvY2suaW52ZW50b3J5LCBiYWcsIHN0b2NrLmNhcGFjaXR5KVxuICAgIDogbW92ZSh3b3JsZCwgc3RvY2suaW52ZW50b3J5LCB3b3JsZC5pbnZlbnRvcnksIGJhZywgQ0FSUklFRF9DQVBBQ0lUWSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdGFydFByb2R1Y3Rpb24od29ybGQ6IFdvcmxkLCByZWNpcGVJZDogUmVjaXBlSWQsIGpvYklkOiBzdHJpbmcpOiBMaWZlUmVzdWx0PFByb2R1Y3Rpb25Kb2I+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChGT1VOREVSX1NUT0NLUElMRV9JRCk7XG4gIGlmICghc3RvY2spIHJldHVybiByZWplY3RMaWZlKCdtaXNzaW5nX3N0b2NrcGlsZScsIFsnZm91bmRlciBzdG9ja3BpbGUgaXMgYWJzZW50J10pO1xuICBpZiAobGlmZS5qb2JzLmhhcyhqb2JJZCkpIHJldHVybiByZWplY3RMaWZlKCdkdXBsaWNhdGVfam9iJywgWydwcm9kdWN0aW9uIGpvYiBhbHJlYWR5IGV4aXN0cyddKTtcbiAgaWYgKGxpZmUuam9icy5zaXplID49IE1BWF9QUk9EVUNUSU9OX0pPQlMpIHJldHVybiByZWplY3RMaWZlKCdqb2JfbGltaXQnLCBbYGF0IG1vc3QgJHtNQVhfUFJPRFVDVElPTl9KT0JTfSBqb2JzIG1heSBiZSBhY3RpdmVgXSk7XG4gIGNvbnN0IHJlY2lwZSA9IFJFQ0lQRVNbcmVjaXBlSWRdO1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhyZWNpcGUuaW5wdXQpKSB7XG4gICAgaWYgKChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApIDwgKGFtb3VudCA/PyAwKSkge1xuICAgICAgcmV0dXJuIHJlamVjdExpZmUoJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLCBbYG5lZWQgJHthbW91bnR9ICR7U3RyaW5nKHJlc291cmNlKX0sIGhhdmUgJHtzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDB9YF0pO1xuICAgIH1cbiAgfVxuICBjb25zdCByZXNlcnZlZE91dHB1dCA9IFsuLi5saWZlLmpvYnMudmFsdWVzKCldLmZpbHRlcigoaikgPT4gai5zdG9ja3BpbGVJZCA9PT0gc3RvY2suaWQpXG4gICAgLnJlZHVjZSgoc3VtLCBqb2IpID0+IHN1bSArIHRvdGFsKGNsb25lQmFnKFJFQ0lQRVNbam9iLnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pKSwgMCk7XG4gIGlmICh0b3RhbChzdG9jay5pbnZlbnRvcnkpIC0gdG90YWwoY2xvbmVCYWcocmVjaXBlLmlucHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pKVxuICAgICsgcmVzZXJ2ZWRPdXRwdXQgKyB0b3RhbChjbG9uZUJhZyhyZWNpcGUub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pKSA+IHN0b2NrLmNhcGFjaXR5KSB7XG4gICAgcmV0dXJuIHJlamVjdExpZmUoJ2NhcGFjaXR5X2V4Y2VlZGVkJywgWydyZXNlcnZlZCBwcm9kdWN0aW9uIG91dHB1dCB3b3VsZCBleGNlZWQgc3RvY2twaWxlIGNhcGFjaXR5J10pO1xuICB9XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHJlY2lwZS5pbnB1dCkpIHtcbiAgICBzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID0gKHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgLSAoYW1vdW50ID8/IDApO1xuICAgIGlmIChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID09PSAwKSBkZWxldGUgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXTtcbiAgfVxuICBjb25zdCBqb2I6IFByb2R1Y3Rpb25Kb2IgPSB7IGlkOiBqb2JJZCwgc3RvY2twaWxlSWQ6IHN0b2NrLmlkLCByZWNpcGU6IHJlY2lwZUlkLCByZW1haW5pbmdUaWNrczogcmVjaXBlLnRpY2tzIH07XG4gIGxpZmUuam9icy5zZXQoam9iLmlkLCBqb2IpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgLi4uam9iIH0gfTtcbn1cblxuLyoqIFBsYW50IGludG8gYW4gZW1wdHkgZml4ZWQgdGVycmFjZSBwbG90LiBUaGUgZm91bmRlciBmYXJtIG11c3QgYWxyZWFkeSBleGlzdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFudENyb3Aod29ybGQ6IFdvcmxkLCBwbG90SWQ6IHN0cmluZyk6IExpZmVSZXN1bHQ8Q3JvcFBsb3Q+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGlmICghQ1JPUF9QTE9UX0lEUy5pbmNsdWRlcyhwbG90SWQpKSByZXR1cm4gcmVqZWN0TGlmZSgnaW52YWxpZF9wbG90JywgWyd1bmtub3duIGNyb3AgcGxvdCddKTtcbiAgaWYgKCFbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29tZSgocykgPT4gcy5raW5kID09PSAndGVycmFjZScpKSB7XG4gICAgcmV0dXJuIHJlamVjdExpZmUoJ2Zhcm1fcmVxdWlyZWQnLCBbJ2J1aWxkIHRoZSBmb3VuZGVyIHRlcnJhY2VkIGZhcm0gYmVmb3JlIHBsYW50aW5nJ10pO1xuICB9XG4gIGlmIChsaWZlLmNyb3BzLmhhcyhwbG90SWQpKSByZXR1cm4gcmVqZWN0TGlmZSgncGxvdF9vY2N1cGllZCcsIFsnY3JvcCBwbG90IGlzIGFscmVhZHkgcGxhbnRlZCddKTtcbiAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgaWYgKCFzdG9jayB8fCAoc3RvY2suaW52ZW50b3J5LnNlZWQgPz8gMCkgPCAxKSByZXR1cm4gcmVqZWN0TGlmZSgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsIFsnbmVlZCAxIHNlZWQgaW4gdGhlIGZvdW5kZXIgc3RvY2twaWxlJ10pO1xuICBzdG9jay5pbnZlbnRvcnkuc2VlZCEtLTtcbiAgaWYgKHN0b2NrLmludmVudG9yeS5zZWVkID09PSAwKSBkZWxldGUgc3RvY2suaW52ZW50b3J5LnNlZWQ7XG4gIGNvbnN0IGNyb3A6IENyb3BQbG90ID0geyBpZDogcGxvdElkLCBwbGFudGVkVGljazogbGlmZS50aWNrLCBncm93dGhUaWNrczogQ1JPUF9HUk9XVEhfVElDS1MgfTtcbiAgbGlmZS5jcm9wcy5zZXQocGxvdElkLCBjcm9wKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IC4uLmNyb3AgfSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JvcFJlYWR5KGNyb3A6IENyb3BQbG90LCB0aWNrOiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHRpY2sgLSBjcm9wLnBsYW50ZWRUaWNrID49IGNyb3AuZ3Jvd3RoVGlja3M7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0Q3JvcCh3b3JsZDogV29ybGQsIHBsb3RJZDogc3RyaW5nKTogTGlmZVJlc3VsdDx7IGZvb2Q6IG51bWJlcjsgZmliZXI6IG51bWJlciB9PiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBjb25zdCBjcm9wID0gbGlmZS5jcm9wcy5nZXQocGxvdElkKTtcbiAgaWYgKCFjcm9wKSByZXR1cm4gcmVqZWN0TGlmZSgnbm90X3BsYW50ZWQnLCBbJ2Nyb3AgcGxvdCBpcyBlbXB0eSddKTtcbiAgaWYgKCFjcm9wUmVhZHkoY3JvcCwgbGlmZS50aWNrKSkgcmV0dXJuIHJlamVjdExpZmUoJ2Nyb3Bfbm90X3JlYWR5JywgW2Bjcm9wIG5lZWRzICR7Y3JvcC5ncm93dGhUaWNrcyAtIChsaWZlLnRpY2sgLSBjcm9wLnBsYW50ZWRUaWNrKX0gbW9yZSB0aWNrc2BdKTtcbiAgLy8gUGxhbnQgZ3Jvd3RoIGlzIHRoZSBleHBsaWNpdCBiaW9sb2dpY2FsIHNvdXJjZTsgZXZlcnkgb3RoZXIgbGlmZS1sb29wXG4gIC8vIHRyYW5zZm9ybWF0aW9uIGNvbnNlcnZlcyBpdHMgZGVjbGFyZWQgaW5wdXRzIGFuZCBvdXRwdXRzLlxuICBjb25zdCB5aWVsZEJhZyA9IHsgZm9vZDogQ1JPUF9ZSUVMRC5mb29kLCBmaWJlcjogQ1JPUF9ZSUVMRC5maWJlciB9O1xuICBpZiAodG90YWwod29ybGQuaW52ZW50b3J5KSArIHlpZWxkQmFnLmZvb2QgKyB5aWVsZEJhZy5maWJlciA+IENBUlJJRURfQ0FQQUNJVFkpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnY2FwYWNpdHlfZXhjZWVkZWQnLCBbYGNhcnJpZWQgY2FwYWNpdHkgJHtDQVJSSUVEX0NBUEFDSVRZfSB3b3VsZCBiZSBleGNlZWRlZGBdKTtcbiAgfVxuICB3b3JsZC5pbnZlbnRvcnkuZm9vZCA9ICh3b3JsZC5pbnZlbnRvcnkuZm9vZCA/PyAwKSArIHlpZWxkQmFnLmZvb2Q7XG4gIHdvcmxkLmludmVudG9yeS5maWJlciA9ICh3b3JsZC5pbnZlbnRvcnkuZmliZXIgPz8gMCkgKyB5aWVsZEJhZy5maWJlcjtcbiAgbGlmZS5jcm9wcy5kZWxldGUocGxvdElkKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB5aWVsZEJhZyB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRpY2tPdXRjb21lIHtcbiAgZnJvbVRpY2s6IG51bWJlcjtcbiAgdG9UaWNrOiBudW1iZXI7XG4gIGNvbXBsZXRlZEpvYnM6IEFycmF5PHsgaWQ6IHN0cmluZzsgcmVjaXBlOiBSZWNpcGVJZDsgb3V0cHV0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IH0+O1xuICByZWFkeUNyb3BzOiBzdHJpbmdbXTtcbn1cblxuLyoqIGBvblN0ZXBgIHJ1bnMgYWZ0ZXIgcHJvZHVjdGlvbiBqb2JzIG9uIGV2ZXJ5IHRpY2sgKHRoZSBob21lc3RlYWQgc2ltdWxhdGlvbikuICovXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpY2tzKHdvcmxkOiBXb3JsZCwgY291bnQ6IG51bWJlciwgb25TdGVwPzogKHRpY2s6IG51bWJlcikgPT4gdm9pZCk6IExpZmVSZXN1bHQ8VGlja091dGNvbWU+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGlmICghTnVtYmVyLmlzU2FmZUludGVnZXIoY291bnQpIHx8IGNvdW50IDwgMSB8fCBjb3VudCA+IE1BWF9USUNLU19QRVJfQ09NTUFORCkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3RpY2tfY291bnQnLCBbYHRpY2tzIG11c3QgYmUgYW4gaW50ZWdlciBmcm9tIDEgdG8gJHtNQVhfVElDS1NfUEVSX0NPTU1BTkR9YF0pO1xuICB9XG4gIGNvbnN0IGNvbXBsZXRlZDogVGlja091dGNvbWVbJ2NvbXBsZXRlZEpvYnMnXSA9IFtdO1xuICBjb25zdCBmcm9tVGljayA9IGxpZmUudGljaztcbiAgLy8gSm9icyBhcmUgcHJvY2Vzc2VkIGluIHN0YWJsZSBpZCBvcmRlciBhdCBlYWNoIHRpY2ssIG5ldmVyIG1hcCBpbnNlcnRpb24sXG4gIC8vIHdhbGwgdGltZSwgZnJhbWUgZGVsdGEsIG9yIGFzeW5jaHJvbm91cyBjb21wbGV0aW9uIG9yZGVyLlxuICBmb3IgKGxldCBzdGVwID0gMDsgc3RlcCA8IGNvdW50OyBzdGVwKyspIHtcbiAgICBsaWZlLnRpY2srKztcbiAgICBmb3IgKGNvbnN0IGpvYiBvZiBbLi4ubGlmZS5qb2JzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpKSB7XG4gICAgICBqb2IucmVtYWluaW5nVGlja3MtLTtcbiAgICAgIGlmIChqb2IucmVtYWluaW5nVGlja3MgPiAwKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChqb2Iuc3RvY2twaWxlSWQpO1xuICAgICAgaWYgKCFzdG9jaykgdGhyb3cgbmV3IEVycm9yKCdhY3RpdmUgcHJvZHVjdGlvbiByZWZlcmVuY2VzIGEgbWlzc2luZyBzdG9ja3BpbGUnKTtcbiAgICAgIGNvbnN0IG91dHB1dCA9IGNsb25lQmFnKFJFQ0lQRVNbam9iLnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pO1xuICAgICAgaWYgKHRvdGFsKHN0b2NrLmludmVudG9yeSkgKyB0b3RhbChvdXRwdXQpID4gc3RvY2suY2FwYWNpdHkpIHRocm93IG5ldyBFcnJvcigncmVzZXJ2ZWQgcHJvZHVjdGlvbiBvdXRwdXQgZXhjZWVkcyBjYXBhY2l0eScpO1xuICAgICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMob3V0cHV0KSkgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9IChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgbGlmZS5qb2JzLmRlbGV0ZShqb2IuaWQpO1xuICAgICAgY29tcGxldGVkLnB1c2goeyBpZDogam9iLmlkLCByZWNpcGU6IGpvYi5yZWNpcGUsIG91dHB1dCB9KTtcbiAgICB9XG4gICAgb25TdGVwPy4obGlmZS50aWNrKTtcbiAgfVxuICBjb25zdCByZWFkeUNyb3BzID0gWy4uLmxpZmUuY3JvcHMudmFsdWVzKCldLmZpbHRlcigoY3JvcCkgPT4gY3JvcFJlYWR5KGNyb3AsIGxpZmUudGljaylcbiAgICAmJiBjcm9wLnBsYW50ZWRUaWNrICsgY3JvcC5ncm93dGhUaWNrcyA+IGZyb21UaWNrKS5tYXAoKGNyb3ApID0+IGNyb3AuaWQpLnNvcnQoKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IGZyb21UaWNrLCB0b1RpY2s6IGxpZmUudGljaywgY29tcGxldGVkSm9iczogY29tcGxldGVkLCByZWFkeUNyb3BzIH0gfTtcbn1cbiIsICIvLyBNMDA2IGxpdmluZyBob21lc3RlYWQ6IHZpbGxhZ2VycyB3aXRoIGpvYnMsIGEgd2F0ZXJlZCBmYXJtLCBsaXZlc3RvY2sgd2l0aFxuLy8gbmVlZHMsIHByb2R1Y3RzIGFuZCByZXByb2R1Y3Rpb24sIGFsbCBhcyBhdXRob3JpdGF0aXZlIHNjaGVtYS0zIHN0YXRlLlxuLy9cbi8vIFJ1bGVzIG9mIHRoaXMgbW9kdWxlIChzYW1lIGFzIHRoZSByZXN0IG9mIHRoZSBsaWZlIGxvb3ApOlxuLy8gIC0gZXZlcnkgbXV0YXRpb24gaGFwcGVucyBpbnNpZGUgYW4gYWNjZXB0ZWQgY29tbWFuZCAoZm91bmQsIGFjdCwgYXNzaWduKSBvclxuLy8gICAgaW5zaWRlIHRoZSBqb3VybmFsZWQgYHRpY2tgOyByZW5kZXJpbmcgbmV2ZXIgd3JpdGVzIGhlcmU7XG4vLyAgLSBpbnRlZ2VycyBvbmx5OiBwb3NpdGlvbnMgYXJlIGRlY2ltZXRyZXMsIG5lZWRzIGFyZSAwLi4xMDAgY291bnRlcnM7XG4vLyAgLSBpdGVyYXRpb24gaXMgaW4gc29ydGVkIGlkIG9yZGVyOyByYW5kb21uZXNzIGNvbWVzIGZyb20gYHJuZ2AsIGEgc2VlZGVkXG4vLyAgICB4b3JzaGlmdCBzdGF0ZSBzdG9yZWQgaW4gdGhlIHNuYXBzaG90LCBuZXZlciBmcm9tIE1hdGgucmFuZG9tO1xuLy8gIC0gcmVzb3VyY2VzIG1vdmUgYmV0d2VlbiByZWFsIGludmVudG9yaWVzICh0aGUgZm91bmRlciBzdG9ja3BpbGUsIHRoZVxuLy8gICAgcGxheWVyJ3MgY2FycmllZCBiYWcsIHRyb3VnaHMsIHRoZSBjb29wJ3MgZWdnIGJveCk6IG5vdGhpbmcgaXMgaW52ZW50ZWRcbi8vICAgIGV4Y2VwdCBieSBhbiBleHBsaWNpdCBiaW9sb2dpY2FsIHNvdXJjZSAoY3JvcCBncm93dGgsIGFuaW1hbCBwcm9kdWN0cyxcbi8vICAgIGJpcnRocyksIGFuZCB0aG9zZSBhcmUgcnVsZS1kcml2ZW4sIG5vdCBwcmVzZW50YXRpb24uXG5pbXBvcnQgdHlwZSB7IFdvcmxkIH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBNQVQsIGdldFZveGVsLCByZW1vdmVFbnRpdHksIHN1cmZhY2VBdCwgd2F0ZXJEZXB0aEF0IH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyB0cmVlVGltYmVyIH0gZnJvbSAnLi92ZWdldGF0aW9uJztcbmltcG9ydCB7XG4gIEdBVEVfU1RBVEVTLCBHYXRlU3RhdGUsIE5hdkZlYXR1cmVzLCBOYXZHYXRlLCBOYXZHb2FsLCBOYXZHcmlkLCBOYXZSZWdpb24sIE5hdlN0YXRlLCBlbXB0eUZlYXR1cmVzLCBnYXRlTGFiZWwsIG5hdkdyaWQsIG5hdlN0YXRzLCBuYXZTdGVwLFxufSBmcm9tICcuL25hdic7XG5pbXBvcnQge1xuICBDQVJSSUVEX0NBUEFDSVRZLCBGT1VOREVSX1NUT0NLUElMRSwgRk9VTkRFUl9TVE9DS1BJTEVfSUQsIExpZmVSZXN1bHQsIFJFQ0lQRVMsIHRvdGFsLCBsaWZlU3RhdGUsXG59IGZyb20gJy4vZWNvbm9teSc7XG5cbi8qKiBMZWdhY3kgaG9tZXN0ZWFkIHJ1bGVzIChNMDA2XHUyMDEzTTAwOSk6IHZpbGxhZ2VycyB3YWxrIHN0cmFpZ2h0IGxpbmVzLCBub3RoaW5nIGNvbGxpZGVzLiAqL1xuZXhwb3J0IGNvbnN0IEhPTUVTVEVBRF9WRVJTSU9OID0gMSBhcyBjb25zdDtcbi8qKlxuICogU2V0dGxlbWVudCBydWxlcyB2MiAoTTAxMCk6IHZpbGxhZ2VycyBuYXZpZ2F0ZSB0aGUgcmVhbCB0ZXJyYWluLCBmZW5jZXMsXG4gKiBnYXRlcywgZG9vcnMgYW5kIHRyZWVzOyBncm93dGggc3RhZ2Ugc2V0cyB0cmVlIHlpZWxkIGFuZCBmb290cHJpbnQuIE5ld1xuICogaG9tZXN0ZWFkcyBhcmUgZm91bmRlZCB3aXRoIGl0OyBhIGxlZ2FjeSBob21lc3RlYWQgc3dpdGNoZXMgYnkgdGhlXG4gKiBqb3VybmFsZWQgYHVwZ3JhZGVfaG9tZXN0ZWFkYCBjb21tYW5kLCBzbyBldmVyeSBvbGQgam91cm5hbCByZXBsYXlzIGV4YWN0bHkuXG4gKi9cbmV4cG9ydCBjb25zdCBIT01FU1RFQURfTkFWX1ZFUlNJT04gPSAyIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgSG9tZXN0ZWFkVmVyc2lvbiA9IHR5cGVvZiBIT01FU1RFQURfVkVSU0lPTiB8IHR5cGVvZiBIT01FU1RFQURfTkFWX1ZFUlNJT047XG4vKiogRGVjaW1ldHJlcyBwZXIgbWV0cmU6IHNpbSBwb3NpdGlvbnMgYXJlIGludGVnZXIgZGVjaW1ldHJlcy4gKi9cbmV4cG9ydCBjb25zdCBETSA9IDEwO1xuLyoqIE9uZSBpbi1nYW1lIGRheTogMzAwIHRpY2tzIG9mIDIgcyA9IDEwIG1pbnV0ZXMsIG1hdGNoaW5nIHRoZSBza3kncyBkYXkgbGVuZ3RoLiAqL1xuZXhwb3J0IGNvbnN0IERBWV9USUNLUyA9IDMwMDtcbi8qKiBOaWdodCBpbnNpZGUgYSBkYXkgKHRpY2tzKSwgd2hlbiB2aWxsYWdlcnMgZ28gaG9tZSBhbmQgcmVzdC4gKi9cbmV4cG9ydCBjb25zdCBOSUdIVF9TVEFSVCA9IDE3MTtcbmV4cG9ydCBjb25zdCBOSUdIVF9FTkQgPSAyOTE7XG5leHBvcnQgY29uc3QgVklMTEFHRVJfU1BFRUQgPSAyNjsgLy8gZG0gcGVyIHRpY2sgKDEuMyBtL3MpXG5leHBvcnQgY29uc3QgQU5JTUFMX1NQRUVEID0gNztcbmV4cG9ydCBjb25zdCBNQVhfVklMTEFHRVJTID0gODtcbmV4cG9ydCBjb25zdCBNQVhfQU5JTUFMUyA9IDYwO1xuXG4vLyAtLS0tIGZhcm1pbmc6IHRoZSBwbGF5ZXIgZGVjaWRlcyB3aGVyZSBmaWVsZHMgZ28sIGhvdyBiaWcgdGhleSBhcmUgYW5kIHdoYXQgZ3Jvd3MgLS0tLVxuZXhwb3J0IHR5cGUgQ3JvcEtpbmQgPSAnd2hlYXQnIHwgJ3BvdGF0bycgfCAnZmxheCc7XG5leHBvcnQgY29uc3QgQ1JPUFM6IHJlYWRvbmx5IENyb3BLaW5kW10gPSBbJ2ZsYXgnLCAncG90YXRvJywgJ3doZWF0J107XG5leHBvcnQgaW50ZXJmYWNlIENyb3BSdWxlIHtcbiAgbGFiZWw6IHN0cmluZztcbiAgZ3Jvd1RpY2tzOiBudW1iZXI7XG4gIC8qKiBNb2lzdHVyZSBsb3N0IGV2ZXJ5IHRoaXMgbWFueSBncm93aW5nIHRpY2tzOiBsb3dlciBtZWFucyB0aGlyc3RpZXIuICovXG4gIGRyYWluRXZlcnk6IG51bWJlcjtcbiAgLyoqIEhhcnZlc3QgcGVyIGZpZWxkIHVuaXQgKDkgbVx1MDBCMikuIFNlZWQgcmV0dXJuZWQga2VlcHMgdGhlIGN5Y2xlIGdvaW5nLiAqL1xuICB5aWVsZDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgcHVycG9zZTogc3RyaW5nO1xufVxuZXhwb3J0IGNvbnN0IENST1BfUlVMRVM6IFJlY29yZDxDcm9wS2luZCwgQ3JvcFJ1bGU+ID0ge1xuICB3aGVhdDogeyBsYWJlbDogJ1doZWF0JywgZ3Jvd1RpY2tzOiA2MCwgZHJhaW5FdmVyeTogNCwgeWllbGQ6IHsgZm9vZDogMywgc2VlZDogMiwgZmliZXI6IDIgfSxcbiAgICBwdXJwb3NlOiAnZ3JhaW4gZm9yIGZvb2QsIHN0cmF3IGZvciB0aGUgYW5pbWFscywgYW5kIHNlZWQnIH0sXG4gIHBvdGF0bzogeyBsYWJlbDogJ1BvdGF0b2VzJywgZ3Jvd1RpY2tzOiA5MCwgZHJhaW5FdmVyeTogNiwgeWllbGQ6IHsgZm9vZDogNiwgc2VlZDogMSB9LFxuICAgIHB1cnBvc2U6ICd0aGUgbW9zdCBmb29kIHBlciBmaWVsZDsgc2xvdywgYnV0IG5lZWRzIGxlc3Mgd2F0ZXInIH0sXG4gIGZsYXg6IHsgbGFiZWw6ICdGbGF4JywgZ3Jvd1RpY2tzOiA3MCwgZHJhaW5FdmVyeTogNCwgeWllbGQ6IHsgZmliZXI6IDUsIHNlZWQ6IDIgfSxcbiAgICBwdXJwb3NlOiAnZmlicmU6IHN0cmF3IGZvciB0aGUgdHJvdWdocyBhbmQsIGxhdGVyLCBsaW5lbicgfSxcbn07XG4vKiogQSBmaWVsZCB1bml0IGlzIDMgeCAzIG06IHNlZWQsIHdvcmssIHdhdGVyIGFuZCBoYXJ2ZXN0IGFsbCBzY2FsZSB3aXRoIHVuaXRzLiAqL1xuZXhwb3J0IGNvbnN0IFVOSVRfTTIgPSA5O1xuZXhwb3J0IGNvbnN0IEZJRUxEX01JTiA9IDI7XG5leHBvcnQgY29uc3QgRklFTERfTUFYID0gMTA7XG5leHBvcnQgY29uc3QgTUFYX0ZJRUxEUyA9IDEyO1xuZXhwb3J0IGNvbnN0IE1BWF9GSUVMRF9BUkVBID0gNDAwO1xuLyoqIEZpZWxkcyBtdXN0IGxpZSB3aXRoaW4gdGhpcyBkaXN0YW5jZSAobWV0cmVzKSBvZiB0aGUgZmFybWhvdXNlLiAqL1xuZXhwb3J0IGNvbnN0IEZJRUxEX1JBTkdFID0gNDU7XG4vKiogV29vZCBmb3IgdGhlIGZlbmNlOiBvbmUgcGVyIDQgbSBvZiBwZXJpbWV0ZXIuICovXG5leHBvcnQgY29uc3QgZmVuY2VDb3N0ID0gKHc6IG51bWJlciwgZDogbnVtYmVyKSA9PiBNYXRoLmNlaWwoKDIgKiAodyArIGQpKSAvIDQpO1xuZXhwb3J0IGNvbnN0IGZpZWxkVW5pdHMgPSAodzogbnVtYmVyLCBkOiBudW1iZXIpID0+IE1hdGguY2VpbCgodyAqIGQpIC8gVU5JVF9NMik7XG5leHBvcnQgY29uc3QgTU9JU1RVUkVfTUFYID0gMTI7XG4vKiogQSBjcm9wIGRyeSBmb3IgdGhpcyBsb25nIHdpdGhlcnMgYW5kIHRoZSBzZWVkIGlzIGxvc3QuICovXG5leHBvcnQgY29uc3QgV0lUSEVSX1RJQ0tTID0gNDU7XG4vKiogRGlnZ2luZyB3b3JrIHBlciBmaWVsZCB1bml0ICh0aWNrcyBvZiB2aWxsYWdlciB3b3JrOyB0aGUgcGxheWVyIGRvZXMgMyBwZXIgYWN0aW9uKS4gKi9cbmV4cG9ydCBjb25zdCBUSUxMX1BFUl9VTklUID0gNDtcblxuLy8gLS0tLSBsaXZlc3RvY2sgLS0tLVxuZXhwb3J0IHR5cGUgU3BlY2llcyA9ICdjaGlja2VuJyB8ICdzaGVlcCcgfCAnZ29hdCcgfCAncGlnJyB8ICdjYXR0bGUnIHwgJ2hvcnNlJztcbmV4cG9ydCBjb25zdCBTUEVDSUVTOiByZWFkb25seSBTcGVjaWVzW10gPSBbJ2NhdHRsZScsICdjaGlja2VuJywgJ2dvYXQnLCAnaG9yc2UnLCAncGlnJywgJ3NoZWVwJ107XG5leHBvcnQgdHlwZSBFbmNsb3N1cmVJZCA9ICdjb29wJyB8ICdwZW4nIHwgJ3N0eScgfCAncGFkZG9jayc7XG5leHBvcnQgaW50ZXJmYWNlIFNwZWNpZXNSdWxlIHtcbiAgbGFiZWw6IHN0cmluZztcbiAgZW5jbG9zdXJlOiBFbmNsb3N1cmVJZDtcbiAgLyoqIFBhc3R1cmUgZWF0ZW4gcGVyIG1lYWwgKGdyYXNzLCByb290cywgaW5zZWN0cyk7IHdoZW4gdGhlIHBhc3R1cmUgaXMgYmFyZSBpdCBlYXRzIHRyb3VnaCBmZWVkLiAqL1xuICBncmF6ZTogbnVtYmVyO1xuICAvKiogVHJvdWdoIGZlZWQgKGZpYmVyOiBzdHJhdyBhbmQgZ3JhaW4pIHBlciBtZWFsIHdoZW4gbm90IGdyYXppbmcuICovXG4gIGZlZWQ6IG51bWJlcjtcbiAgYWR1bHRBZ2U6IG51bWJlcjtcbiAgZ2VzdGF0aW9uOiBudW1iZXI7XG4gIGxpdHRlcjogbnVtYmVyO1xuICAvKiogUHJvZHVjdCB0aGF0IGFjY3VtdWxhdGVzIHdoaWxlIGZlZDsgY29sbGVjdGVkIGJ5IGEgaGVyZGVyIG9yIHRoZSBwbGF5ZXIuICovXG4gIHByb2R1Y3Q6IG51bGwgfCB7IHJlc291cmNlOiAnZWdncycgfCAnd29vbCcgfCAnbWlsayc7IGV2ZXJ5OiBudW1iZXI7IGFtb3VudDogbnVtYmVyOyBmZW1hbGVzOiBib29sZWFuIH07XG4gIHB1cnBvc2U6IHN0cmluZztcbn1cbmV4cG9ydCBjb25zdCBTUEVDSUVTX1JVTEVTOiBSZWNvcmQ8U3BlY2llcywgU3BlY2llc1J1bGU+ID0ge1xuICBjaGlja2VuOiB7IGxhYmVsOiAnQ2hpY2tlbicsIGVuY2xvc3VyZTogJ2Nvb3AnLCBncmF6ZTogMiwgZmVlZDogMSwgYWR1bHRBZ2U6IDE1MCwgZ2VzdGF0aW9uOiA5MCwgbGl0dGVyOiAxLFxuICAgIHByb2R1Y3Q6IHsgcmVzb3VyY2U6ICdlZ2dzJywgZXZlcnk6IDEyMCwgYW1vdW50OiAxLCBmZW1hbGVzOiB0cnVlIH0sIHB1cnBvc2U6ICdsYXlzIGVnZ3MnIH0sXG4gIHNoZWVwOiB7IGxhYmVsOiAnU2hlZXAnLCBlbmNsb3N1cmU6ICdwZW4nLCBncmF6ZTogOCwgZmVlZDogMSwgYWR1bHRBZ2U6IDMwMCwgZ2VzdGF0aW9uOiAyMjAsIGxpdHRlcjogMSxcbiAgICBwcm9kdWN0OiB7IHJlc291cmNlOiAnd29vbCcsIGV2ZXJ5OiAzMDAsIGFtb3VudDogMiwgZmVtYWxlczogZmFsc2UgfSwgcHVycG9zZTogJ2dyb3dzIHdvb2wnIH0sXG4gIGdvYXQ6IHsgbGFiZWw6ICdHb2F0JywgZW5jbG9zdXJlOiAncGVuJywgZ3JhemU6IDYsIGZlZWQ6IDEsIGFkdWx0QWdlOiAzMDAsIGdlc3RhdGlvbjogMjAwLCBsaXR0ZXI6IDEsXG4gICAgcHJvZHVjdDogeyByZXNvdXJjZTogJ21pbGsnLCBldmVyeTogMTUwLCBhbW91bnQ6IDEsIGZlbWFsZXM6IHRydWUgfSwgcHVycG9zZTogJ2dpdmVzIG1pbGsnIH0sXG4gIHBpZzogeyBsYWJlbDogJ1BpZycsIGVuY2xvc3VyZTogJ3N0eScsIGdyYXplOiA1LCBmZWVkOiAxLCBhZHVsdEFnZTogMjUwLCBnZXN0YXRpb246IDE1MCwgbGl0dGVyOiAyLFxuICAgIHByb2R1Y3Q6IG51bGwsIHB1cnBvc2U6ICdicmVlZHMgcXVpY2tseSAobWVhdCBhbmQgbGVhdGhlciBjb21lIHdpdGggdGhlIGJ1dGNoZXIpJyB9LFxuICBjYXR0bGU6IHsgbGFiZWw6ICdDYXR0bGUnLCBlbmNsb3N1cmU6ICdwYWRkb2NrJywgZ3JhemU6IDEyLCBmZWVkOiAyLCBhZHVsdEFnZTogNTAwLCBnZXN0YXRpb246IDMwMCwgbGl0dGVyOiAxLFxuICAgIHByb2R1Y3Q6IHsgcmVzb3VyY2U6ICdtaWxrJywgZXZlcnk6IDE1MCwgYW1vdW50OiAyLCBmZW1hbGVzOiB0cnVlIH0sIHB1cnBvc2U6ICdnaXZlcyBtaWxrIChkcmF1Z2h0IHdvcmsgY29tZXMgd2l0aCBwbG91Z2hzKScgfSxcbiAgaG9yc2U6IHsgbGFiZWw6ICdIb3JzZScsIGVuY2xvc3VyZTogJ3BhZGRvY2snLCBncmF6ZTogMTIsIGZlZWQ6IDIsIGFkdWx0QWdlOiA2MDAsIGdlc3RhdGlvbjogNDAwLCBsaXR0ZXI6IDEsXG4gICAgcHJvZHVjdDogbnVsbCwgcHVycG9zZTogJ2tlcHQgZm9yIHJpZGluZyBhbmQgY2FydHMgKHRyYW5zcG9ydCBjb21lcyB3aXRoIHJvYWRzKScgfSxcbn07XG5leHBvcnQgY29uc3QgSFVOR0VSX01FQUwgPSA2MDtcbmV4cG9ydCBjb25zdCBTVEFSVklOR19ERUFUSF9USUNLUyA9IDI0MDtcbmV4cG9ydCBjb25zdCBHUkFTU19NQVggPSAxMDA7XG5leHBvcnQgY29uc3QgVFJPVUdIX01BWCA9IDMwO1xuZXhwb3J0IGNvbnN0IEVHR19CT1hfTUFYID0gMTI7XG5leHBvcnQgY29uc3QgQlVDS0VUID0gMTA7IC8vIHRyb3VnaCB3YXRlciBmcm9tIG9uZSBidWNrZXRcbi8qKiBBIGZhcm1lcidzIHdhdGVyaW5nIGNhbiBob2xkcyB0aGlzIG1hbnkgd2F0ZXJpbmdzLiAqL1xuZXhwb3J0IGNvbnN0IENBTl9XQVRFUklOR1MgPSAzO1xuXG4vLyAtLS0tIHZpbGxhZ2VycyAtLS0tXG5leHBvcnQgdHlwZSBSb2xlID0gJ2Zhcm1lcicgfCAnaGVyZGVyJztcbmV4cG9ydCBjb25zdCBST0xFUzogcmVhZG9ubHkgUm9sZVtdID0gWydmYXJtZXInLCAnaGVyZGVyJ107XG5leHBvcnQgY29uc3QgRk9PRF9QUkVGRVJFTkNFID0gWydyYXRpb25zJywgJ2VnZ3MnLCAnbWlsaycsICdmb29kJ10gYXMgY29uc3Q7XG4vKiogUmVzb3VyY2VzIGEgdmlsbGFnZXIgY2FuIGNhcnJ5IGluIG9uZSBsb2FkIChvbmUgc3RhY2sgYXQgYSB0aW1lKS4gKi9cbmV4cG9ydCB0eXBlIENhcnJ5ID0geyBpdGVtOiBzdHJpbmc7IGFtb3VudDogbnVtYmVyIH0gfCBudWxsO1xuZXhwb3J0IHR5cGUgRWZmZWN0ID1cbiAgfCAndGFrZScgfCAnc3RvcmUnIHwgJ3RpbGwnIHwgJ3NvdycgfCAncmVhcCcgfCAnd2F0ZXJfcGxvdCcgfCAnZHJhdycgfCAnd2F0ZXJfdHJvdWdoJyB8ICdmaWxsX2ZlZWQnXG4gIHwgJ2dhdGhlcl9lZ2dzJyB8ICdzaGVhcicgfCAnbWlsaycgfCAnZWF0JyB8ICdyZXN0JyB8ICdyZXN0b2NrJyB8ICd0aHJlc2gnIHwgJ25vbmUnO1xuZXhwb3J0IGludGVyZmFjZSBMZWcgeyBvcDogJ3dhbGsnIHwgJ3dvcmsnOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgdGlja3M6IG51bWJlcjsgZWZmZWN0OiBFZmZlY3Q7IGl0ZW0/OiBzdHJpbmc7IGFtb3VudD86IG51bWJlciB9XG5leHBvcnQgaW50ZXJmYWNlIFRhc2sgeyBraW5kOiBzdHJpbmc7IHRhcmdldDogc3RyaW5nOyBsZWdzOiBMZWdbXTsgbGVnOiBudW1iZXI7IHByb2dyZXNzOiBudW1iZXIgfVxuZXhwb3J0IGludGVyZmFjZSBWaWxsYWdlciB7XG4gIGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgcm9sZTogUm9sZTsgeDogbnVtYmVyOyB6OiBudW1iZXI7XG4gIGVuZXJneTogbnVtYmVyOyBodW5nZXI6IG51bWJlcjsgY2Fycnk6IENhcnJ5OyB0YXNrOiBUYXNrIHwgbnVsbDtcbiAgLyoqIHYyOiB0aGUgcm91dGUgYmVpbmcgd2Fsa2VkLCBnYXRlcyBpbiBoYW5kIGFuZCB0aGUgY3VycmVudCBvYnN0cnVjdGlvbiAoc2VlIHNpbS9uYXYudHMpLiAqL1xuICBuYXY/OiBOYXZTdGF0ZTtcbiAgLyoqIHYyOiBqb2JzIGdpdmVuIHVwIGJlY2F1c2UgdGhlaXIgZGVzdGluYXRpb24gY291bGQgbm90IGJlIHJlYWNoZWQsIHdpdGggdGhlIHJlYXNvbiwgdW50aWwgYSB0aWNrLiAqL1xuICBhdm9pZD86IEF2b2lkZWRbXTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQXZvaWRlZCB7IHRhcmdldDogc3RyaW5nOyB1bnRpbDogbnVtYmVyOyByZWFzb246IHN0cmluZzsgYnk6IHN0cmluZyB9XG4vKiogQSBnYXRlIG9yIGRvb3IgYW5kIHdoZXRoZXIgdmlsbGFnZXJzIG1heSBwYXNzIChvcGVuLCBvciBjbG9zZWQgYnV0IHRoZWlycyB0byBvcGVuKSBvciBub3QgKGxvY2tlZCkuICovXG5leHBvcnQgaW50ZXJmYWNlIEdhdGVSZWNvcmQgeyBpZDogc3RyaW5nOyBzdGF0ZTogR2F0ZVN0YXRlIH1cbmV4cG9ydCB0eXBlIFBsb3RTdGF0ZSA9ICd3aWxkJyB8ICd0aWxsZWQnIHwgJ2dyb3dpbmcnIHwgJ3JpcGUnO1xuLyoqIEEgZmllbGQgdGhlIHBsYXllciBtYXJrZWQgb3V0OiB3b3JsZCBwb3NpdGlvbiAobWV0cmVzLCBtaW4gY29ybmVyKSwgc2l6ZSBhbmQgY3JvcC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUGxvdCB7XG4gIGlkOiBzdHJpbmc7IHg6IG51bWJlcjsgejogbnVtYmVyOyB3OiBudW1iZXI7IGQ6IG51bWJlcjsgY3JvcDogQ3JvcEtpbmQ7XG4gIHN0YXRlOiBQbG90U3RhdGU7IGdyb3d0aDogbnVtYmVyOyBtb2lzdHVyZTogbnVtYmVyOyBkcnk6IG51bWJlcjsgdGlsbGVkOiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIEVuY2xvc3VyZSB7IGlkOiBFbmNsb3N1cmVJZDsgZ3Jhc3M6IG51bWJlcjsgZmVlZDogbnVtYmVyOyB3YXRlcjogbnVtYmVyOyBlZ2dzOiBudW1iZXIgfVxuZXhwb3J0IGludGVyZmFjZSBBbmltYWwge1xuICBpZDogc3RyaW5nOyBzcGVjaWVzOiBTcGVjaWVzOyBzZXg6ICdmJyB8ICdtJzsgYm9ybjogbnVtYmVyOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgdHg6IG51bWJlcjsgdHo6IG51bWJlcjtcbiAgaHVuZ2VyOiBudW1iZXI7IHN0YXJ2aW5nOiBudW1iZXI7IHByb2R1Y3Q6IG51bWJlcjsgcHJlZ25hbnRVbnRpbDogbnVtYmVyO1xufVxuLy8gLS0tLSBnb3Zlcm5hbmNlOiB0aGUgc3Rld2FyZCAoQUkgYWdlbnQpIGFjdHMgb25seSB0aHJvdWdoIHRoZXNlIHBlcm1pc3Npb25zIC0tLS1cbmV4cG9ydCB0eXBlIFBvbGljeSA9ICdhdXRvJyB8ICdhcHByb3ZlJyB8ICdvZmYnO1xuZXhwb3J0IHR5cGUgU3Rld2FyZEFjdGlvbiA9ICdhc3NpZ25fcm9sZScgfCAnZXhwYW5kX2ZpZWxkJztcbmV4cG9ydCBjb25zdCBTVEVXQVJEX0FDVElPTlM6IHJlYWRvbmx5IFN0ZXdhcmRBY3Rpb25bXSA9IFsnYXNzaWduX3JvbGUnLCAnZXhwYW5kX2ZpZWxkJ107XG5leHBvcnQgaW50ZXJmYWNlIFByb3Bvc2FsIHtcbiAgaWQ6IHN0cmluZzsgYWN0aW9uOiBTdGV3YXJkQWN0aW9uOyB2aWxsYWdlcklkPzogc3RyaW5nOyByb2xlPzogUm9sZTsgcmVhc29uOiBzdHJpbmc7IHRpY2s6IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgU3Rld2FyZCB7XG4gIGVuYWJsZWQ6IGJvb2xlYW47XG4gIC8qKiBQZXIgYWN0aW9uOiBhY3QgZGlyZWN0bHksIGFzayB0aGUgb3duZXIgZmlyc3QsIG9yIG5ldmVyLiAqL1xuICBwb2xpY3k6IFJlY29yZDxTdGV3YXJkQWN0aW9uLCBQb2xpY3k+O1xuICBwcm9wb3NhbHM6IFByb3Bvc2FsW107XG4gIG5leHRQcm9wb3NhbDogbnVtYmVyO1xufVxuZXhwb3J0IGNvbnN0IE1BWF9QUk9QT1NBTFMgPSA4O1xuXG5leHBvcnQgaW50ZXJmYWNlIEhvbWVzdGVhZFN0YXRlIHtcbiAgdmVyc2lvbjogSG9tZXN0ZWFkVmVyc2lvbjtcbiAgYW5jaG9yWDogbnVtYmVyOyBhbmNob3JaOiBudW1iZXI7XG4gIHJuZzogbnVtYmVyOyBuZXh0SWQ6IG51bWJlcjtcbiAgdmlsbGFnZXJzOiBWaWxsYWdlcltdOyBwbG90czogUGxvdFtdOyBlbmNsb3N1cmVzOiBFbmNsb3N1cmVbXTsgYW5pbWFsczogQW5pbWFsW107XG4gIC8qKiBUaGUgYmFybiBiZXNpZGUgdGhlIGZvdW5kZXIgc3RvcmU6IGdvb2RzIGdvIGhlcmUgd2hlbiB0aGUgc3RvcmUgaXMgZnVsbC4gKi9cbiAgb3ZlcmZsb3c6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHN0ZXdhcmQ6IFN0ZXdhcmQ7XG4gIC8qKiB2MiBvbmx5OiBnYXRlIGFuZCBkb29yIHN0YXRlcy4gKi9cbiAgZ2F0ZXM/OiBHYXRlUmVjb3JkW107XG59XG4vKiogQmFybiBjYXBhY2l0eSAoaW4gYWRkaXRpb24gdG8gdGhlIDIwMCBvZiB0aGUgZm91bmRlciBzdG9yZSkuICovXG5leHBvcnQgY29uc3QgT1ZFUkZMT1dfQ0FQQUNJVFkgPSAzMDA7XG5cbi8vIC0tLS0tLS0tLS0gbGF5b3V0IChkZXJpdmVkIGZyb20gdGhlIGFuY2hvcjsgbmV2ZXIgc3RvcmVkIHR3aWNlKSAtLS0tLS0tLS0tXG5cbmV4cG9ydCB0eXBlIEZhY2lsaXR5S2luZCA9ICdmYXJtaG91c2UnIHwgJ3dlbGwnIHwgJ2ZpZWxkJyB8IEVuY2xvc3VyZUlkO1xuZXhwb3J0IGludGVyZmFjZSBSZWN0IHsgeDA6IG51bWJlcjsgejA6IG51bWJlcjsgeDE6IG51bWJlcjsgejE6IG51bWJlciB9IC8vIGRtLCBpbmNsdXNpdmUtZXhjbHVzaXZlXG5leHBvcnQgaW50ZXJmYWNlIEZhY2lsaXR5IHtcbiAgaWQ6IHN0cmluZzsga2luZDogRmFjaWxpdHlLaW5kOyBsYWJlbDogc3RyaW5nOyByZWN0OiBSZWN0O1xuICAvKiogV2hlcmUgdmlsbGFnZXJzIHN0YW5kIHRvIHVzZSBpdCAoZG0pLiAqL1xuICB1c2U6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgLyoqIFRyb3VnaCBwb3NpdGlvbiBmb3IgZW5jbG9zdXJlcyAoZG0pLiAqL1xuICB0cm91Z2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGNhcGFjaXR5PzogbnVtYmVyO1xuICBzcGVjaWVzPzogU3BlY2llc1tdO1xuICBmdW5jdGlvbjogc3RyaW5nO1xufVxuXG5jb25zdCBtID0gKHY6IG51bWJlcikgPT4gTWF0aC5yb3VuZCh2ICogRE0pO1xuLyoqIEV1Y2xpZGVhbiBsZW5ndGggdmlhIElFRUUgc3FydCAoY29ycmVjdGx5IHJvdW5kZWQgZXZlcnl3aGVyZSksIHVubGlrZSBNYXRoLmh5cG90LiAqL1xuY29uc3QgbGVuMiA9IChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gTWF0aC5zcXJ0KGEgKiBhICsgYiAqIGIpO1xuY29uc3QgcmVjdCA9ICh4OiBudW1iZXIsIHo6IG51bWJlciwgdzogbnVtYmVyLCBkOiBudW1iZXIpOiBSZWN0ID0+ICh7IHgwOiBtKHgpLCB6MDogbSh6KSwgeDE6IG0oeCArIHcpLCB6MTogbSh6ICsgZCkgfSk7XG5cbi8qKiBUaGUgaG9tZXN0ZWFkIHBsYW4sIHJlbGF0aXZlIHRvIGl0cyBhbmNob3IgKG1ldHJlcykuIEJ1aWxkaW5nIG1vZGVscyBpbiB0aGUgcmVuZGVyZXIgcmVhZCB0aGVzZSByZWN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBob21lc3RlYWRMYXlvdXQoaDogUGljazxIb21lc3RlYWRTdGF0ZSwgJ2FuY2hvclgnIHwgJ2FuY2hvclonPik6IEZhY2lsaXR5W10ge1xuICBjb25zdCBheCA9IGguYW5jaG9yWCwgYXogPSBoLmFuY2hvclo7XG4gIGNvbnN0IHIgPSAoeDogbnVtYmVyLCB6OiBudW1iZXIsIHc6IG51bWJlciwgZDogbnVtYmVyKSA9PiByZWN0KGF4ICsgeCwgYXogKyB6LCB3LCBkKTtcbiAgY29uc3QgYXQgPSAoeDogbnVtYmVyLCB6OiBudW1iZXIpID0+ICh7IHg6IG0oYXggKyB4KSwgejogbShheiArIHopIH0pO1xuICBjb25zdCBsaXN0OiBGYWNpbGl0eVtdID0gW1xuICAgIHsgaWQ6ICdmYXJtaG91c2UnLCBraW5kOiAnZmFybWhvdXNlJywgbGFiZWw6ICdGYXJtaG91c2UnLCByZWN0OiByKC0xMywgLTEyLCA3LCA1KSwgdXNlOiBhdCgtOS41LCAtNi40KSxcbiAgICAgIGZ1bmN0aW9uOiAnaG9tZTogdmlsbGFnZXJzIHNsZWVwIGhlcmUgYXQgbmlnaHQgYW5kIHJlY292ZXIgZW5lcmd5JyB9LFxuICAgIHsgaWQ6ICd3ZWxsJywga2luZDogJ3dlbGwnLCBsYWJlbDogJ1dlbGwnLCByZWN0OiByKC0yLCAtOSwgMiwgMiksIHVzZTogYXQoLTEsIC02LjgpLFxuICAgICAgZnVuY3Rpb246ICd3YXRlciBzb3VyY2U6IGJ1Y2tldHMgZm9yIGNyb3BzIGFuZCB0cm91Z2hzJyB9LFxuICAgIHsgaWQ6ICdjb29wJywga2luZDogJ2Nvb3AnLCBsYWJlbDogJ0NoaWNrZW4gY29vcCcsIHJlY3Q6IHIoLTE0LCAwLCA2LCA1KSwgdXNlOiBhdCgtMTEsIC0wLjYpLCB0cm91Z2g6IGF0KC05LjIsIDMuNiksXG4gICAgICBjYXBhY2l0eTogMTAsIHNwZWNpZXM6IFsnY2hpY2tlbiddLCBmdW5jdGlvbjogJ2hvdXNlcyBjaGlja2VuczsgZWdncyBjb2xsZWN0IGluIHRoZSBuZXN0IGJveCcgfSxcbiAgICB7IGlkOiAncGVuJywga2luZDogJ3BlbicsIGxhYmVsOiAnU2hlZXAgYW5kIGdvYXQgcGVuJywgcmVjdDogcigtNiwgMCwgOCwgNyksIHVzZTogYXQoLTIsIC0wLjYpLCB0cm91Z2g6IGF0KDAuOCwgMS4yKSxcbiAgICAgIGNhcGFjaXR5OiAxMCwgc3BlY2llczogWydzaGVlcCcsICdnb2F0J10sIGZ1bmN0aW9uOiAncGFzdHVyZSBmb3Igc2hlZXAgYW5kIGdvYXRzOyB0cm91Z2ggZm9yIHdhdGVyIGFuZCBmZWVkJyB9LFxuICAgIHsgaWQ6ICdzdHknLCBraW5kOiAnc3R5JywgbGFiZWw6ICdQaWcgc3R5JywgcmVjdDogcig0LCAwLCA2LCA1KSwgdXNlOiBhdCg3LCAtMC42KSwgdHJvdWdoOiBhdCg4LjgsIDEuMiksXG4gICAgICBjYXBhY2l0eTogNiwgc3BlY2llczogWydwaWcnXSwgZnVuY3Rpb246ICdob3VzZXMgcGlnczsgdGhleSBlYXQgZnJvbSB0aGUgdHJvdWdoJyB9LFxuICAgIHsgaWQ6ICdwYWRkb2NrJywga2luZDogJ3BhZGRvY2snLCBsYWJlbDogJ1BhZGRvY2snLCByZWN0OiByKC02LCA5LCAxNiwgOCksIHVzZTogYXQoMiwgOC40KSwgdHJvdWdoOiBhdCg4LjYsIDEwLjIpLFxuICAgICAgY2FwYWNpdHk6IDgsIHNwZWNpZXM6IFsnY2F0dGxlJywgJ2hvcnNlJ10sIGZ1bmN0aW9uOiAncGFzdHVyZSBhbmQgc2hlbHRlciBmb3IgY2F0dGxlIGFuZCBob3JzZXMnIH0sXG4gIF07XG4gIHJldHVybiBsaXN0O1xufVxuXG4vKiogQSBmaWVsZCdzIGZvb3RwcmludCAoZG0pIGFuZCB0aGUgc3BvdCBhIHdvcmtlciBzdGFuZHMgb24gKGl0cyBjZW50cmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpZWxkUmVjdChwOiBQaWNrPFBsb3QsICd4JyB8ICd6JyB8ICd3JyB8ICdkJz4pOiBSZWN0IHsgcmV0dXJuIHJlY3QocC54LCBwLnosIHAudywgcC5kKTsgfVxuZXhwb3J0IGZ1bmN0aW9uIGZpZWxkQ2VudHJlKHA6IFBpY2s8UGxvdCwgJ3gnIHwgJ3onIHwgJ3cnIHwgJ2QnPik6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gIHJldHVybiB7IHg6IG0ocC54ICsgcC53IC8gMiksIHo6IG0ocC56ICsgcC5kIC8gMikgfTtcbn1cbmV4cG9ydCBjb25zdCB1bml0c09mID0gKHA6IFBpY2s8UGxvdCwgJ3cnIHwgJ2QnPikgPT4gZmllbGRVbml0cyhwLncsIHAuZCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBmYWNpbGl0eShoOiBIb21lc3RlYWRTdGF0ZSwgaWQ6IHN0cmluZyk6IEZhY2lsaXR5IHwgdW5kZWZpbmVkIHtcbiAgcmV0dXJuIGhvbWVzdGVhZExheW91dChoKS5maW5kKChmKSA9PiBmLmlkID09PSBpZCk7XG59XG5cbmNvbnN0IFNUT0NLID0geyB4OiBtKEZPVU5ERVJfU1RPQ0tQSUxFLngpLCB6OiBtKEZPVU5ERVJfU1RPQ0tQSUxFLnogKyAxLjYpIH07XG5cbi8vIC0tLS0tLS0tLS0gbmF2aWdhdGlvbiAoc2V0dGxlbWVudCBydWxlcyB2MikgLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgaXNOYXZIb21lc3RlYWQgPSAoaDogUGljazxIb21lc3RlYWRTdGF0ZSwgJ3ZlcnNpb24nPikgPT4gaC52ZXJzaW9uID49IEhPTUVTVEVBRF9OQVZfVkVSU0lPTjtcbi8qKiBHYXRlcyBhbmQgZG9vcnMsIHNvcnRlZCBieSBpZC4gKi9cbmV4cG9ydCBjb25zdCBHQVRFX0lEUyA9IFsnZG9vcjpmYXJtaG91c2UnLCAnZ2F0ZTpjb29wJywgJ2dhdGU6cGFkZG9jaycsICdnYXRlOnBlbicsICdnYXRlOnN0eSddIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgR2F0ZUlkID0gdHlwZW9mIEdBVEVfSURTW251bWJlcl07XG4vKiogSGFsZi1zaXplIChtKSBvZiB0aGUgc3F1YXJlIG5hdmlnYXRpb24gd2luZG93IGFyb3VuZCB0aGUgZmFybWhvdXNlOiBldmVyeSBmaWVsZCwgcGVuIGFuZCB0aGUgc3RvcmUgZml0IGluc2lkZS4gKi9cbmV4cG9ydCBjb25zdCBOQVZfSEFMRiA9IDYwO1xuLyoqIFNlYXJjaCBleHBhbnNpb25zIHNoYXJlZCBieSBhbGwgdmlsbGFnZXJzIGluIG9uZSB0aWNrIChhIGZ1bGwgc2VhcmNoIG9mIHRoZSB3aW5kb3cgaXMgMTQgNDAwKS4gKi9cbmV4cG9ydCBjb25zdCBOQVZfVElDS19CVURHRVQgPSA0MF8wMDA7XG4vKiogQSBqb2Igd2hvc2UgZGVzdGluYXRpb24gc3RheXMgdW5yZWFjaGFibGUgdGhpcyBtYW55IHRpY2tzIGlzIGdpdmVuIHVwLCB3aXRoIHRoZSByZWFzb24ga2VwdC4gKi9cbmV4cG9ydCBjb25zdCBOQVZfR0lWRV9VUCA9IDE1O1xuLyoqIC4uLmFuZCBub3QgdHJpZWQgYWdhaW4gZm9yIHRoaXMgbWFueSB0aWNrcy4gKi9cbmV4cG9ydCBjb25zdCBOQVZfQVZPSUQgPSAxNTA7XG5cbi8qKlxuICogV2hlcmUgZWFjaCBnYXRlIGFuZCBkb29yIGlzIChtZXRyZXMpOiB0aGUgY2VsbCBpbnNpZGUgdGhlIGZlbmNlIG9yIGJ1aWxkaW5nXG4gKiBhbmQgdGhlIGVkZ2Ugc2lkZSBpdCBvcGVucyBvbnRvLiBHYXRlcyBmYWNlIHRoZSB5YXJkICh0aGUgLXogc2lkZSksIG5leHQgdG9cbiAqIHdoZXJlIHRoZSB5YXJkIHBhdGggbWVldHMgZWFjaCBlbmNsb3N1cmU7IHRoZSBmYXJtaG91c2UgZG9vciBpcyB0aGUgbWlkZGxlXG4gKiBvZiB0aGUgZnJvbnQgKCt6KSB3YWxsLCBhcyB0aGUgY290dGFnZSBtb2RlbCBkcmF3cyBpdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhvbWVzdGVhZEdhdGVzKGg6IFBpY2s8SG9tZXN0ZWFkU3RhdGUsICdhbmNob3JYJyB8ICdhbmNob3JaJz4pOiBBcnJheTxOYXZHYXRlICYgeyBsYWJlbDogc3RyaW5nIH0+IHtcbiAgY29uc3QgYXggPSBoLmFuY2hvclgsIGF6ID0gaC5hbmNob3JaO1xuICByZXR1cm4gW1xuICAgIHsgaWQ6ICdkb29yOmZhcm1ob3VzZScsIHg6IGF4IC0gMTAsIHo6IGF6IC0gOCwgc2lkZTogJ3MnLCBsYWJlbDogJ0Zhcm1ob3VzZSBkb29yJyB9LFxuICAgIHsgaWQ6ICdnYXRlOmNvb3AnLCB4OiBheCAtIDEwLCB6OiBheiwgc2lkZTogJ24nLCBsYWJlbDogJ0Nvb3AgZ2F0ZScgfSxcbiAgICB7IGlkOiAnZ2F0ZTpwYWRkb2NrJywgeDogYXggKyAyLCB6OiBheiArIDksIHNpZGU6ICduJywgbGFiZWw6ICdQYWRkb2NrIGdhdGUnIH0sXG4gICAgeyBpZDogJ2dhdGU6cGVuJywgeDogYXggLSAyLCB6OiBheiwgc2lkZTogJ24nLCBsYWJlbDogJ1BlbiBnYXRlJyB9LFxuICAgIHsgaWQ6ICdnYXRlOnN0eScsIHg6IGF4ICsgOSwgejogYXosIHNpZGU6ICduJywgbGFiZWw6ICdTdHkgZ2F0ZScgfSxcbiAgXTtcbn1cblxuLyoqIFdoZXJlIGEgZmllbGQncyBmZW5jZSBsZWF2ZXMgYSB3YWxrLWluIGdhcDogdGhlIG1pZGRsZSBvZiBpdHMgK3ogc2lkZSAodGhlIHJlbmRlcmVyIGRyYXdzIHRoZSBzYW1lIGdhcCkuICovXG5leHBvcnQgZnVuY3Rpb24gZmllbGRPcGVuaW5nKHA6IFBpY2s8UGxvdCwgJ3gnIHwgJ3onIHwgJ3cnIHwgJ2QnPik6IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHNpZGU6ICdzJyB9IHtcbiAgcmV0dXJuIHsgeDogcC54ICsgTWF0aC5mbG9vcihwLncgLyAyKSwgejogcC56ICsgcC5kIC0gMSwgc2lkZTogJ3MnIH07XG59XG5cbi8qKiBUaGUgbmF2aWdhdGlvbiB3aW5kb3c6IGEgc3F1YXJlIGFyb3VuZCB0aGUgZmFybWhvdXNlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhvbWVzdGVhZE5hdlJlZ2lvbihoOiBQaWNrPEhvbWVzdGVhZFN0YXRlLCAnYW5jaG9yWCcgfCAnYW5jaG9yWic+KTogTmF2UmVnaW9uIHtcbiAgY29uc3QgY3ggPSBoLmFuY2hvclggLSAxMCwgY3ogPSBoLmFuY2hvclogLSAxMDtcbiAgcmV0dXJuIHsgb3g6IGN4IC0gTkFWX0hBTEYsIG96OiBjeiAtIE5BVl9IQUxGLCB3OiBOQVZfSEFMRiAqIDIsIGg6IE5BVl9IQUxGICogMiB9O1xufVxuXG4vKiogVGhlIGZhcm0ncyBvd24gb2JzdGFjbGVzIGFuZCBvcGVuaW5ncywgaW4gd2hvbGUtbWV0cmUgY2VsbHMgZGVyaXZlZCBmcm9tIHRoZSBsYXlvdXQuICovXG5leHBvcnQgZnVuY3Rpb24gaG9tZXN0ZWFkTmF2RmVhdHVyZXMoaDogSG9tZXN0ZWFkU3RhdGUpOiBOYXZGZWF0dXJlcyB7XG4gIGNvbnN0IGF4ID0gaC5hbmNob3JYLCBheiA9IGguYW5jaG9yWjtcbiAgY29uc3QgY2VsbHMgPSAoeDogbnVtYmVyLCB6OiBudW1iZXIsIHc6IG51bWJlciwgZDogbnVtYmVyKSA9PiAoeyB4MDogYXggKyB4LCB6MDogYXogKyB6LCB4MTogYXggKyB4ICsgdywgejE6IGF6ICsgeiArIGQgfSk7XG4gIGNvbnN0IGYgPSBlbXB0eUZlYXR1cmVzKCk7XG4gIGNvbnN0IGxheW91dCA9IGhvbWVzdGVhZExheW91dChoKTtcbiAgY29uc3QgdG9DZWxscyA9IChyOiBSZWN0KSA9PiAoeyB4MDogTWF0aC5mbG9vcihyLngwIC8gRE0pLCB6MDogTWF0aC5mbG9vcihyLnowIC8gRE0pLCB4MTogTWF0aC5jZWlsKHIueDEgLyBETSksIHoxOiBNYXRoLmNlaWwoci56MSAvIERNKSB9KTtcbiAgZm9yIChjb25zdCBmYWMgb2YgbGF5b3V0KSB7XG4gICAgaWYgKGZhYy5raW5kID09PSAnZmFybWhvdXNlJyB8fCBmYWMua2luZCA9PT0gJ3dlbGwnKSBmLmJsb2Nrcy5wdXNoKHsgLi4udG9DZWxscyhmYWMucmVjdCksIHJlYXNvbjogJ2J1aWxkaW5nJywgaWQ6IGZhYy5pZCB9KTtcbiAgICBlbHNlIGYuZmVuY2VzLnB1c2goeyAuLi50b0NlbGxzKGZhYy5yZWN0KSwgaWQ6IGZhYy5pZCwgZ2FwczogW10gfSk7XG4gICAgaWYgKGZhYy50cm91Z2gpIGYuYmxvY2tzLnB1c2goeyB4MDogTWF0aC5mbG9vcihmYWMudHJvdWdoLnggLyBETSksIHowOiBNYXRoLmZsb29yKGZhYy50cm91Z2gueiAvIERNKSwgeDE6IE1hdGguZmxvb3IoZmFjLnRyb3VnaC54IC8gRE0pICsgMSwgejE6IE1hdGguZmxvb3IoZmFjLnRyb3VnaC56IC8gRE0pICsgMSwgcmVhc29uOiAnb2NjdXBpZWQnLCBpZDogYHRyb3VnaDoke2ZhYy5pZH1gIH0pO1xuICB9XG4gIC8vIFNoZWx0ZXJzIGFuZCB0aGUgc3RvcmUgdGFrZSByZWFsIGdyb3VuZCAodGhlIG1vZGVscyBpbiByZW5kZXIvaG9tZXN0ZWFkLnRzIGFuZCByZW5kZXIvbGlmZS50cykuXG4gIGYuYmxvY2tzLnB1c2goeyAuLi5jZWxscygtMTQsIDAsIDQsIDMpLCByZWFzb246ICdvY2N1cGllZCcsIGlkOiAnc2hlbHRlcjpjb29wJyB9KTtcbiAgZi5ibG9ja3MucHVzaCh7IC4uLmNlbGxzKDQsIDAsIDQsIDMpLCByZWFzb246ICdvY2N1cGllZCcsIGlkOiAnc2hlbHRlcjpzdHknIH0pO1xuICBmLmJsb2Nrcy5wdXNoKHsgLi4uY2VsbHMoLTYsIDksIDQsIDMpLCByZWFzb246ICdvY2N1cGllZCcsIGlkOiAnc2hlbHRlcjpwYWRkb2NrJyB9KTtcbiAgY29uc3Qgc3ggPSBGT1VOREVSX1NUT0NLUElMRS54LCBzeiA9IEZPVU5ERVJfU1RPQ0tQSUxFLno7XG4gIGYuYmxvY2tzLnB1c2goeyB4MDogc3ggLSAyLCB6MDogc3ogLSAyLCB4MTogc3ggKyAyLCB6MTogc3ogKyAxLCByZWFzb246ICdvY2N1cGllZCcsIGlkOiAnc3RvcmUnIH0pO1xuICBmLmJsb2Nrcy5wdXNoKHsgeDA6IHN4ICsgMiwgejA6IHN6IC0gMiwgeDE6IHN4ICsgNiwgejE6IHN6ICsgMSwgcmVhc29uOiAnb2NjdXBpZWQnLCBpZDogJ2Jhcm4nIH0pO1xuICAvLyBUaGUgZmFybWhvdXNlIHRocmVzaG9sZCBqdXN0IGluc2lkZSB0aGUgZG9vciBpcyB3aGVyZSB2aWxsYWdlcnMgc2xlZXAuXG4gIGYuY2xlYXIucHVzaChjZWxscygtMTAsIC04LCAxLCAxKSk7XG4gIGZvciAoY29uc3QgcCBvZiBoLnBsb3RzKSB7XG4gICAgY29uc3QgciA9IHsgeDA6IHAueCwgejA6IHAueiwgeDE6IHAueCArIHAudywgejE6IHAueiArIHAuZCB9O1xuICAgIGYuY29zdHMucHVzaCh7IC4uLnIsIGV4dHJhOiAzIH0pO1xuICAgIGYuZmVuY2VzLnB1c2goeyAuLi5yLCBpZDogcC5pZCwgZ2FwczogW2ZpZWxkT3BlbmluZyhwKV0gfSk7XG4gIH1cbiAgZi5nYXRlcyA9IGhvbWVzdGVhZEdhdGVzKGgpLm1hcCgoeyBpZCwgeCwgeiwgc2lkZSB9KSA9PiAoeyBpZCwgeCwgeiwgc2lkZSB9KSk7XG4gIGZvciAoY29uc3QgZyBvZiBoLmdhdGVzID8/IFtdKSBmLmdhdGVTdGF0ZXNbZy5pZF0gPSBnLnN0YXRlO1xuICBmLmtleSA9IGAke2F4fSwke2F6fXwke2gucGxvdHMubWFwKChwKSA9PiBgJHtwLmlkfToke3AueH0sJHtwLnp9LCR7cC53fSwke3AuZH1gKS5qb2luKCc7Jyl9fCR7KGguZ2F0ZXMgPz8gW10pLm1hcCgoZykgPT4gZy5zdGF0ZSkuam9pbignLCcpfWA7XG4gIHJldHVybiBmO1xufVxuXG4vKiogVGhlIGN1cnJlbnQgbmF2aWdhdGlvbiBncmlkIG9mIGEgdjIgaG9tZXN0ZWFkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhvbWVzdGVhZE5hdih3b3JsZDogV29ybGQsIGg6IEhvbWVzdGVhZFN0YXRlKTogTmF2R3JpZCB7XG4gIHJldHVybiBuYXZHcmlkKHdvcmxkLCBob21lc3RlYWROYXZSZWdpb24oaCksIGhvbWVzdGVhZE5hdkZlYXR1cmVzKGgpKTtcbn1cblxuLyoqIFdoZXJlIGEgdmlsbGFnZXIgc2xlZXBzIHVuZGVyIHYyIHJ1bGVzOiBqdXN0IGluc2lkZSB0aGUgZmFybWhvdXNlIGRvb3IgKGRtKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiZWRTcG90KGg6IFBpY2s8SG9tZXN0ZWFkU3RhdGUsICdhbmNob3JYJyB8ICdhbmNob3JaJz4pOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0ge1xuICByZXR1cm4geyB4OiAoaC5hbmNob3JYIC0gMTApICogRE0gKyA1LCB6OiAoaC5hbmNob3JaIC0gOCkgKiBETSArIDUgfTtcbn1cbi8qKiBUaGUgY29vcCdzIG5lc3QgYm94LCBpbnNpZGUgdGhlIGZlbmNlIGJlaGluZCB0aGUgaGVuIGhvdXNlIChkbSkuICovXG5leHBvcnQgZnVuY3Rpb24gbmVzdFNwb3QoaDogUGljazxIb21lc3RlYWRTdGF0ZSwgJ2FuY2hvclgnIHwgJ2FuY2hvclonPik6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gIHJldHVybiB7IHg6IG0oaC5hbmNob3JYIC0gMTIuNCksIHo6IG0oaC5hbmNob3JaICsgMy40KSB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGZvdW5kaW5nIC0tLS0tLS0tLS1cblxuLyoqIEhvbWVzdGVhZCB5YXJkIGFuZCBidWlsZGluZ3MgcmVsYXRpdmUgdG8gaXRzIGFuY2hvciAobWV0cmVzKTsgZmllbGRzIGdvIHdoZXJldmVyIHRoZSBwbGF5ZXIgd2FudHMuICovXG5jb25zdCBGT09UUFJJTlQgPSB7IHgwOiAtMTQsIHowOiAtMTMsIHgxOiAxMiwgejE6IDE3IH07XG4vKiogVGhlIGZvdW5kZXIgaG91c2UgYW5kIHRlcnJhY2VkIGZhcm0gc2l0ZXMgKE0wMDIpIHRoYXQgdGhlIGhvbWVzdGVhZCBtdXN0IG5vdCBjb3Zlci4gKi9cbmNvbnN0IFJFU0VSVkVEX1NJVEVTID0gW3sgeDA6IC02MiwgejA6IC00OCwgeDE6IC01MSwgejE6IC0zOSB9LCB7IHgwOiAtNTQsIHowOiAtNDQsIHgxOiAtNDQsIHoxOiAtNDIgfSwgeyB4MDogLTQwLCB6MDogLTQ0LCB4MTogLTI1LCB6MTogLTMzIH1dO1xuXG4vKipcbiAqIERldGVybWluaXN0aWMgc2l0ZSBzZWFyY2g6IGEgZHJ5LCBnZW50bGUgYXJlYSB3aG9zZSB5YXJkIGVkZ2UgaXMgbmV4dCB0b1xuICogdGhlIGZvdW5kZXIgc3RvY2twaWxlICh0aGUgaG9tZXN0ZWFkIHN0b3JlKSwgY2xlYXIgb2YgdGhlIGZvdW5kZXIgc2l0ZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kSG9tZXN0ZWFkQW5jaG9yKHdvcmxkOiBXb3JsZCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gIGxldCBiZXN0ID0geyB4OiAtMzYsIHo6IC0xNCwgc2NvcmU6IEluZmluaXR5IH07XG4gIC8vIEdlbmVyYXRlIHRoZSBzZWFyY2ggYXJlYSBmaXJzdCBzbyBpdHMgbmF0dXJhbCBmZWF0dXJlcyBleGlzdCwgdGhlbiBsaXN0IHRoZW0gb25jZS5cbiAgZm9yIChsZXQgeiA9IC00MDsgeiA8PSA1MDsgeiArPSAxNikgZm9yIChsZXQgeCA9IC02NDsgeCA8PSA0OyB4ICs9IDE2KSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBjb25zdCBmZWF0dXJlcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKChlKSA9PiAhZS5oYXJ2ZXN0ZWQgJiYgIXdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICYmIGUueCA+IC04MCAmJiBlLnggPCAyMCAmJiBlLnogPiAtNTAgJiYgZS56IDwgNjApO1xuICBjb25zdCBzaXRlcyA9IHdvcmxkLnNpdGVzLm1hcCgoc3QpID0+ICh7IHg6IChzdCBhcyB7IHg/OiBudW1iZXIgfSkueCA/PyAwLCB6OiAoc3QgYXMgeyB6PzogbnVtYmVyIH0pLnogPz8gMCB9KSk7XG4gIGZvciAobGV0IGN6ID0gLTI0OyBjeiA8PSAyMDsgY3ogKz0gMikge1xuICAgIGZvciAobGV0IGN4ID0gLTQ0OyBjeCA8PSAtMjA7IGN4ICs9IDIpIHtcbiAgICAgIGNvbnN0IGZ4MCA9IGN4ICsgRk9PVFBSSU5ULngwLCBmejAgPSBjeiArIEZPT1RQUklOVC56MCwgZngxID0gY3ggKyBGT09UUFJJTlQueDEsIGZ6MSA9IGN6ICsgRk9PVFBSSU5ULnoxO1xuICAgICAgaWYgKFJFU0VSVkVEX1NJVEVTLnNvbWUoKHIpID0+IGZ4MCA8IHIueDEgJiYgZngxID4gci54MCAmJiBmejAgPCByLnoxICYmIGZ6MSA+IHIuejApKSBjb250aW51ZTtcbiAgICAgIC8vIE5ldmVyIGJ1aWxkIG92ZXIgYSBsYW5kbWFyayAod2F5c3RvbmUsIG1hcmtlciwgY2Fpcm4pOyBhdm9pZCBmZWxsaW5nIHRoZSB3b29kcy5cbiAgICAgIGNvbnN0IHJlY3RzID0gaG9tZXN0ZWFkTGF5b3V0KHsgYW5jaG9yWDogY3gsIGFuY2hvclo6IGN6IH0pLm1hcCgoZikgPT4gZi5yZWN0KTtcbiAgICAgIGNvbnN0IGhpdCA9ICh4OiBudW1iZXIsIHo6IG51bWJlciwgcGFkOiBudW1iZXIpID0+IHJlY3RzLnNvbWUoKHIpID0+IHggKiBETSA+PSByLngwIC0gcGFkICogRE0gJiYgeCAqIERNIDw9IHIueDEgKyBwYWQgKiBETSAmJiB6ICogRE0gPj0gci56MCAtIHBhZCAqIERNICYmIHogKiBETSA8PSByLnoxICsgcGFkICogRE0pO1xuICAgICAgY29uc3QgaW5zaWRlID0gZmVhdHVyZXMuZmlsdGVyKChlKSA9PiBoaXQoZS54LCBlLnosIDEpKTtcbiAgICAgIGlmIChpbnNpZGUuc29tZSgoZSkgPT4gZS5raW5kID09PSAnd2F5c3RvbmUnIHx8IGUua2luZCA9PT0gJ21hcmtlcicgfHwgZS5raW5kID09PSAnc3R5bF9jYWlybicpKSBjb250aW51ZTtcbiAgICAgIGlmIChzaXRlcy5zb21lKChxKSA9PiBoaXQocS54LCBxLnosIDMpKSkgY29udGludWU7XG4gICAgICAvLyBUaGUgYXV0aG9yZWQgaGVybyBncm92ZSBpcyBwYXJ0IG9mIHRoZSBmb3VuZGVyIHNjZW5lOiBrZWVwIHRoZSBidWlsZGluZ3Mgb2ZmIGl0LlxuICAgICAgY29uc3QgaGVyb2VzID0gaW5zaWRlLmZpbHRlcigoZSkgPT4gZS5hdXRob3JlZCkubGVuZ3RoO1xuICAgICAgY29uc3QgdHJlZXMgPSBpbnNpZGUuZmlsdGVyKChlKSA9PiBlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykgfHwgZS5raW5kID09PSAnc3R5bF9vcmUnKS5sZW5ndGg7XG4gICAgICBsZXQgbG8gPSBJbmZpbml0eSwgaGkgPSAtSW5maW5pdHksIHdldCA9IDA7XG4gICAgICBmb3IgKGxldCB6ID0gZnowOyB6IDw9IGZ6MTsgeiArPSAzKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBmeDA7IHggPD0gZngxOyB4ICs9IDMpIHtcbiAgICAgICAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgICAgICAgICBsbyA9IE1hdGgubWluKGxvLCB5KTsgaGkgPSBNYXRoLm1heChoaSwgeSk7XG4gICAgICAgICAgaWYgKHdhdGVyRGVwdGhBdCh3b3JsZCwgeCwgeikgPiAwKSB3ZXQrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gRGlzdGFuY2UgZnJvbSB0aGUgZmFybWhvdXNlIHlhcmQgdG8gdGhlIHN0b3JlIGlzIHdhbGtpbmcgdGltZSBmb3IgZXZlcnkgZGVsaXZlcnkuXG4gICAgICBjb25zdCB0b1N0b3JlID0gbGVuMihjeCAtIDkgLSBGT1VOREVSX1NUT0NLUElMRS54LCBjeiAtIDYgLSBGT1VOREVSX1NUT0NLUElMRS56KTtcbiAgICAgIGNvbnN0IHNjb3JlID0gKGhpIC0gbG8pICogMiArIHdldCAqIDI1ICsgdG9TdG9yZSAqIDEuNSArIHRyZWVzICogMTIgKyBoZXJvZXMgKiA2MDtcbiAgICAgIGlmIChzY29yZSA8IGJlc3Quc2NvcmUpIGJlc3QgPSB7IHg6IGN4LCB6OiBjeiwgc2NvcmUgfTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgeDogYmVzdC54LCB6OiBiZXN0LnogfTtcbn1cblxuZnVuY3Rpb24gc2VlZFJuZyh3b3JsZDogV29ybGQpOiBudW1iZXIge1xuICBsZXQgaCA9ICh3b3JsZC5zZWVkIF4gMHg5ZTM3NzliOSkgPj4+IDA7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxNiksIDB4ODVlYmNhNmIpID4+PiAwO1xuICByZXR1cm4gaCA9PT0gMCA/IDB4NmQyYjc5ZjUgOiBoO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcm5kKGg6IEhvbWVzdGVhZFN0YXRlKTogbnVtYmVyIHtcbiAgbGV0IHggPSBoLnJuZztcbiAgeCBePSB4IDw8IDEzOyB4ID4+Pj0gMDtcbiAgeCBePSB4ID4+PiAxNztcbiAgeCBePSB4IDw8IDU7IHggPj4+PSAwO1xuICBoLnJuZyA9IHggPT09IDAgPyAweDZkMmI3OWY1IDogeDtcbiAgcmV0dXJuIGgucm5nIC8gNDI5NDk2NzI5Njtcbn1cblxuLyoqIFN1cHBsaWVzIGRlbGl2ZXJlZCBpbnRvIHRoZSBmb3VuZGVyIHN0b2NrcGlsZSB3aGVuIHRoZSBob21lc3RlYWQgaXMgZm91bmRlZC4gKi9cbmV4cG9ydCBjb25zdCBGT1VORElOR19TVVBQTElFUyA9IHsgZmliZXI6IDIwLCBmb29kOiAxMCwgc2VlZDogNiB9IGFzIGNvbnN0O1xuXG5jb25zdCBTVEFSVEVSX0hFUkQ6IEFycmF5PFtTcGVjaWVzLCAnZicgfCAnbSddPiA9IFtcbiAgWydjaGlja2VuJywgJ2YnXSwgWydjaGlja2VuJywgJ2YnXSwgWydjaGlja2VuJywgJ2YnXSwgWydjaGlja2VuJywgJ20nXSxcbiAgWydzaGVlcCcsICdmJ10sIFsnc2hlZXAnLCAnZiddLCBbJ3NoZWVwJywgJ20nXSwgWydnb2F0JywgJ2YnXSwgWydnb2F0JywgJ20nXSxcbiAgWydwaWcnLCAnZiddLCBbJ3BpZycsICdtJ10sIFsnY2F0dGxlJywgJ2YnXSwgWydjYXR0bGUnLCAnbSddLCBbJ2hvcnNlJywgJ2YnXSwgWydob3JzZScsICdtJ10sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gZm91bmRIb21lc3RlYWQod29ybGQ6IFdvcmxkLCB2ZXJzaW9uOiBIb21lc3RlYWRWZXJzaW9uID0gSE9NRVNURUFEX1ZFUlNJT04pOiBMaWZlUmVzdWx0PHsgYW5jaG9yOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0gfT4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgaWYgKHdvcmxkLmhvbWVzdGVhZCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBjb2RlOiAnYWxyZWFkeV9mb3VuZGVkJywgcmVhc29uczogWyd0aGlzIHdvcmxkIGFscmVhZHkgaGFzIGEgaG9tZXN0ZWFkJ10gfTtcbiAgY29uc3QgYW5jaG9yID0gZmluZEhvbWVzdGVhZEFuY2hvcih3b3JsZCk7XG4gIGNvbnN0IGg6IEhvbWVzdGVhZFN0YXRlID0ge1xuICAgIHZlcnNpb24sIGFuY2hvclg6IGFuY2hvci54LCBhbmNob3JaOiBhbmNob3Iueiwgcm5nOiBzZWVkUm5nKHdvcmxkKSwgbmV4dElkOiAwLFxuICAgIHZpbGxhZ2VyczogW10sIHBsb3RzOiBbXSwgZW5jbG9zdXJlczogW10sIGFuaW1hbHM6IFtdLCBvdmVyZmxvdzoge30sXG4gICAgc3Rld2FyZDogeyBlbmFibGVkOiB0cnVlLCBwb2xpY3k6IHsgYXNzaWduX3JvbGU6ICdhdXRvJywgZXhwYW5kX2ZpZWxkOiAnYXBwcm92ZScgfSwgcHJvcG9zYWxzOiBbXSwgbmV4dFByb3Bvc2FsOiAwIH0sXG4gICAgLi4uKHZlcnNpb24gPj0gSE9NRVNURUFEX05BVl9WRVJTSU9OID8geyBnYXRlczogR0FURV9JRFMubWFwKChpZCkgPT4gKHsgaWQsIHN0YXRlOiAnY2xvc2VkJyBhcyBHYXRlU3RhdGUgfSkpIH0gOiB7fSksXG4gIH07XG4gIGNvbnN0IGxheW91dCA9IGhvbWVzdGVhZExheW91dChoKTtcbiAgY29uc3QgaG9tZSA9IGxheW91dC5maW5kKChmKSA9PiBmLmlkID09PSAnZmFybWhvdXNlJykhLnVzZTtcbiAgaC52aWxsYWdlcnMucHVzaChcbiAgICB7IGlkOiAndmlsbGFnZXI6MCcsIG5hbWU6ICdBZGEnLCByb2xlOiAnZmFybWVyJywgeDogaG9tZS54ICsgOCwgejogaG9tZS56LCBlbmVyZ3k6IDEwMCwgaHVuZ2VyOiAyMCwgY2Fycnk6IG51bGwsIHRhc2s6IG51bGwgfSxcbiAgICB7IGlkOiAndmlsbGFnZXI6MScsIG5hbWU6ICdCcmFtJywgcm9sZTogJ2hlcmRlcicsIHg6IGhvbWUueCAtIDgsIHo6IGhvbWUueiwgZW5lcmd5OiAxMDAsIGh1bmdlcjogMzAsIGNhcnJ5OiBudWxsLCB0YXNrOiBudWxsIH0sXG4gICk7XG4gIGZvciAoY29uc3QgaWQgb2YgWydjb29wJywgJ3BhZGRvY2snLCAncGVuJywgJ3N0eSddIGFzIEVuY2xvc3VyZUlkW10pIHtcbiAgICBoLmVuY2xvc3VyZXMucHVzaCh7IGlkLCBncmFzczogR1JBU1NfTUFYLCBmZWVkOiBpZCA9PT0gJ2Nvb3AnIHx8IGlkID09PSAnc3R5JyA/IDEwIDogMCwgd2F0ZXI6IFRST1VHSF9NQVgsIGVnZ3M6IDAgfSk7XG4gIH1cbiAgZm9yIChjb25zdCBbc3BlY2llcywgc2V4XSBvZiBTVEFSVEVSX0hFUkQpIHtcbiAgICBjb25zdCBwb3MgPSByYW5kb21Qb2ludEluKGgsIGVuY2xvc3VyZVJlY3QoaCwgU1BFQ0lFU19SVUxFU1tzcGVjaWVzXS5lbmNsb3N1cmUpKTtcbiAgICBoLmFuaW1hbHMucHVzaCh7XG4gICAgICBpZDogYGFuaW1hbDoke1N0cmluZyhoLm5leHRJZCsrKS5wYWRTdGFydCgzLCAnMCcpfWAsIHNwZWNpZXMsIHNleCxcbiAgICAgIGJvcm46IGxpZmUudGljayAtIFNQRUNJRVNfUlVMRVNbc3BlY2llc10uYWR1bHRBZ2UsIHg6IHBvcy54LCB6OiBwb3MueiwgdHg6IHBvcy54LCB0ejogcG9zLnosXG4gICAgICBodW5nZXI6IE1hdGguZmxvb3Iocm5kKGgpICogNDApLCBzdGFydmluZzogMCwgcHJvZHVjdDogTWF0aC5mbG9vcihybmQoaCkgKiA2MCksIHByZWduYW50VW50aWw6IDAsXG4gICAgfSk7XG4gIH1cbiAgLy8gVGhlIHNldHRsZXJzIGNsZWFyIHRoZSBidWlsZGluZyBwbG90czsgdGhlIGZlbGxlZCB0aW1iZXIgYW5kIGJydXNoIGdvIGludG8gdGhlIHN0b3JlLlxuICBjb25zdCBzID0gc3RvY2sod29ybGQpO1xuICBjb25zdCBjbGVhcmVkOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3QgZiBvZiBsYXlvdXQpIHtcbiAgICBjb25zdCByID0gZi5yZWN0O1xuICAgIGZvciAoY29uc3QgZSBvZiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkpIHtcbiAgICAgIGlmIChlLmF1dGhvcmVkIHx8IGUuaGFydmVzdGVkIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgY29udGludWU7XG4gICAgICBpZiAoZS54ICogRE0gPCByLngwIC0gMTAgfHwgZS54ICogRE0gPiByLngxICsgMTAgfHwgZS56ICogRE0gPCByLnowIC0gMTAgfHwgZS56ICogRE0gPiByLnoxICsgMTApIGNvbnRpbnVlO1xuICAgICAgLy8gVW5kZXIgdjIgcnVsZXMgYSBmZWxsZWQgdHJlZSB5aWVsZHMgd2hhdCBpdHMgZ3Jvd3RoIHN0YWdlIGhvbGRzLlxuICAgICAgY29uc3QgdGltYmVyID0gdmVyc2lvbiA+PSBIT01FU1RFQURfTkFWX1ZFUlNJT04gJiYgIWUuaGFydmVzdGVkT25jZSA/IHRyZWVUaW1iZXIoZSkgOiBudWxsO1xuICAgICAgY29uc3QgbGVmdCA9IHRpbWJlciA/IHRpbWJlci50b3RhbCA6IGUucmVtYWluaW5nO1xuICAgICAgaWYgKGUucmVzb3VyY2UgJiYgbGVmdCA+IDApIGNsZWFyZWRbZS5yZXNvdXJjZV0gPSAoY2xlYXJlZFtlLnJlc291cmNlXSA/PyAwKSArIGxlZnQ7XG4gICAgICByZW1vdmVFbnRpdHkod29ybGQsIGUuaWQpO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IFtpdGVtLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKGNsZWFyZWQpLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSB7XG4gICAgcHV0SW50byhzLmludmVudG9yeSwgaXRlbSwgTWF0aC5taW4oYW1vdW50LCBNYXRoLm1heCgwLCBzLmNhcGFjaXR5IC0gdG90YWwocy5pbnZlbnRvcnkpIC0gNDApKSwgcy5jYXBhY2l0eSk7XG4gIH1cbiAgLy8gVGhlIHNldHRsZXJzIGFycml2ZSB3aXRoIHNlZWQsIHN0cmF3IGZvciB0aGUgdHJvdWdocyBhbmQgYSBsaXR0bGUgZm9vZC5cbiAgZm9yIChjb25zdCBbaXRlbSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhGT1VORElOR19TVVBQTElFUykpIHtcbiAgICBpZiAoIXB1dEludG8ocy5pbnZlbnRvcnksIGl0ZW0sIGFtb3VudCwgcy5jYXBhY2l0eSkpIHJldHVybiB7IG9rOiBmYWxzZSwgY29kZTogJ2NhcGFjaXR5X2V4Y2VlZGVkJywgcmVhc29uczogWyd0aGUgZm91bmRlciBzdG9ja3BpbGUgaXMgdG9vIGZ1bGwgdG8gcmVjZWl2ZSB0aGUgc2V0dGxlcnNcXCcgc3VwcGxpZXMnXSB9O1xuICB9XG4gIHdvcmxkLmhvbWVzdGVhZCA9IGg7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyBhbmNob3IgfSB9O1xufVxuXG4vKiogU3dpdGNoIGEgbGVnYWN5IGhvbWVzdGVhZCB0byBzZXR0bGVtZW50IHJ1bGVzIHYyIChhIGpvdXJuYWxlZCBjb21tYW5kOyBnYXRlcyBzdGFydCBjbG9zZWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVwZ3JhZGVIb21lc3RlYWQod29ybGQ6IFdvcmxkKTogTGlmZVJlc3VsdDx7IHZlcnNpb246IHR5cGVvZiBIT01FU1RFQURfTkFWX1ZFUlNJT04gfT4ge1xuICBjb25zdCBoID0gd29ybGQuaG9tZXN0ZWFkO1xuICBpZiAoIWgpIHJldHVybiBmYWlsKCdub19ob21lc3RlYWQnLCAnZm91bmQgdGhlIGhvbWVzdGVhZCBmaXJzdCcpO1xuICBpZiAoaXNOYXZIb21lc3RlYWQoaCkpIHJldHVybiBmYWlsKCd1bmNoYW5nZWQnLCAndGhlIGhvbWVzdGVhZCBhbHJlYWR5IHVzZXMgc2V0dGxlbWVudCBydWxlcyB2MicpO1xuICBoLnZlcnNpb24gPSBIT01FU1RFQURfTkFWX1ZFUlNJT047XG4gIGguZ2F0ZXMgPSBHQVRFX0lEUy5tYXAoKGlkKSA9PiAoeyBpZCwgc3RhdGU6ICdjbG9zZWQnIGFzIEdhdGVTdGF0ZSB9KSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyB2ZXJzaW9uOiBIT01FU1RFQURfTkFWX1ZFUlNJT04gfSB9O1xufVxuXG4vKiogVGhlIG93bmVyIG9wZW5zLCBjbG9zZXMgb3IgbG9ja3MgYSBnYXRlIG9yIGRvb3IuIExvY2tlZCBrZWVwcyB0aGUgdmlsbGFnZXJzIG91dCB0b28uICovXG5leHBvcnQgZnVuY3Rpb24gc2V0R2F0ZSh3b3JsZDogV29ybGQsIGdhdGVJZDogc3RyaW5nLCBzdGF0ZTogR2F0ZVN0YXRlKTogTGlmZVJlc3VsdDx7IGdhdGVJZDogc3RyaW5nOyBzdGF0ZTogR2F0ZVN0YXRlIH0+IHtcbiAgY29uc3QgaCA9IHdvcmxkLmhvbWVzdGVhZDtcbiAgaWYgKCFoKSByZXR1cm4gZmFpbCgnbm9faG9tZXN0ZWFkJywgJ2ZvdW5kIHRoZSBob21lc3RlYWQgZmlyc3QnKTtcbiAgY29uc3QgZyA9IGguZ2F0ZXM/LmZpbmQoKHgpID0+IHguaWQgPT09IGdhdGVJZCk7XG4gIGlmICghZykgcmV0dXJuIGZhaWwoJ2ludmFsaWRfdGFyZ2V0JywgaXNOYXZIb21lc3RlYWQoaCkgPyAnbm8gc3VjaCBnYXRlJyA6ICd0aGlzIGhvbWVzdGVhZCBoYXMgbm8gZ2F0ZXMgeWV0IChzZXR0bGVtZW50IHJ1bGVzIHYyKScpO1xuICBpZiAoIUdBVEVfU1RBVEVTLmluY2x1ZGVzKHN0YXRlKSkgcmV0dXJuIGZhaWwoJ2ludmFsaWRfc3RhdGUnLCAnZ2F0ZXMgYXJlIG9wZW4sIGNsb3NlZCBvciBsb2NrZWQnKTtcbiAgaWYgKGcuc3RhdGUgPT09IHN0YXRlKSByZXR1cm4gZmFpbCgndW5jaGFuZ2VkJywgYHRoZSAke2dhdGVMYWJlbChnYXRlSWQpfSBpcyBhbHJlYWR5ICR7c3RhdGV9YCk7XG4gIGcuc3RhdGUgPSBzdGF0ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IGdhdGVJZCwgc3RhdGUgfSB9O1xufVxuXG5mdW5jdGlvbiBlbmNsb3N1cmVSZWN0KGg6IEhvbWVzdGVhZFN0YXRlLCBpZDogRW5jbG9zdXJlSWQpOiBSZWN0IHtcbiAgcmV0dXJuIGZhY2lsaXR5KGgsIGlkKSEucmVjdDtcbn1cblxuZnVuY3Rpb24gcmFuZG9tUG9pbnRJbihoOiBIb21lc3RlYWRTdGF0ZSwgcjogUmVjdCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gIGNvbnN0IHBhZCA9IDY7XG4gIHJldHVybiB7XG4gICAgeDogci54MCArIHBhZCArIE1hdGguZmxvb3Iocm5kKGgpICogTWF0aC5tYXgoMSwgci54MSAtIHIueDAgLSBwYWQgKiAyKSksXG4gICAgejogci56MCArIHBhZCArIE1hdGguZmxvb3Iocm5kKGgpICogTWF0aC5tYXgoMSwgci56MSAtIHIuejAgLSBwYWQgKiAyKSksXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gc3RvY2twaWxlIGhlbHBlcnMgLS0tLS0tLS0tLVxuXG4vKiogVGhlIGZvdW5kZXIgc3RvY2twaWxlLCB3aXRoIGNhcGFjaXR5IHJlZHVjZWQgYnkgb3V0cHV0IHJlc2VydmVkIGZvciBydW5uaW5nIHByb2R1Y3Rpb24gam9icy4gKi9cbmZ1bmN0aW9uIHN0b2NrKHdvcmxkOiBXb3JsZCkge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgY29uc3QgcyA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXMpIHRocm93IG5ldyBFcnJvcignZm91bmRlciBzdG9ja3BpbGUgbWlzc2luZycpO1xuICBjb25zdCByZXNlcnZlZCA9IFsuLi5saWZlLmpvYnMudmFsdWVzKCldLnJlZHVjZSgobiwgaikgPT4gbiArIHRvdGFsKFJFQ0lQRVNbai5yZWNpcGVdLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSwgMCk7XG4gIHJldHVybiB7IGludmVudG9yeTogcy5pbnZlbnRvcnksIGNhcGFjaXR5OiBzLmNhcGFjaXR5IC0gcmVzZXJ2ZWQgfTtcbn1cbmZ1bmN0aW9uIHRha2VGcm9tKGJhZzogUmVjb3JkPHN0cmluZywgbnVtYmVyPiwgaXRlbTogc3RyaW5nLCBhbW91bnQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGdvdCA9IE1hdGgubWluKGFtb3VudCwgYmFnW2l0ZW1dID8/IDApO1xuICBpZiAoZ290IDw9IDApIHJldHVybiAwO1xuICBiYWdbaXRlbV0gLT0gZ290O1xuICBpZiAoYmFnW2l0ZW1dID09PSAwKSBkZWxldGUgYmFnW2l0ZW1dO1xuICByZXR1cm4gZ290O1xufVxuZnVuY3Rpb24gcHV0SW50byhiYWc6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sIGl0ZW06IHN0cmluZywgYW1vdW50OiBudW1iZXIsIGNhcGFjaXR5OiBudW1iZXIpOiBib29sZWFuIHtcbiAgaWYgKHRvdGFsKGJhZykgKyBhbW91bnQgPiBjYXBhY2l0eSkgcmV0dXJuIGZhbHNlO1xuICBiYWdbaXRlbV0gPSAoYmFnW2l0ZW1dID8/IDApICsgYW1vdW50O1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuLyoqIFNlZWQga2VwdCBiYWNrIGZvciByZXBsYW50aW5nOiBlbm91Z2ggdG8gc293IGV2ZXJ5IGZpZWxkIHRoYXQgaXMgd2FpdGluZyBmb3Igc2VlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWVkUmVzZXJ2ZShoOiBIb21lc3RlYWRTdGF0ZSk6IG51bWJlciB7XG4gIHJldHVybiBoLnBsb3RzLmZpbHRlcigocCkgPT4gcC5zdGF0ZSA9PT0gJ3RpbGxlZCcgfHwgcC5zdGF0ZSA9PT0gJ3dpbGQnKS5yZWR1Y2UoKG4sIHApID0+IG4gKyB1bml0c09mKHApLCAwKTtcbn1cblxuLy8gLS0tLS0tLS0tLSB2aWxsYWdlciB0YXNrIHBsYW5uaW5nIC0tLS0tLS0tLS1cblxuY29uc3QgaXNOaWdodCA9ICh0aWNrOiBudW1iZXIpID0+IHsgY29uc3QgdCA9IHRpY2sgJSBEQVlfVElDS1M7IHJldHVybiB0ID49IE5JR0hUX1NUQVJUICYmIHQgPCBOSUdIVF9FTkQ7IH07XG5leHBvcnQgZnVuY3Rpb24gZGF5VGltZSh0aWNrOiBudW1iZXIpOiB7IGRheTogbnVtYmVyOyBwaGFzZTogbnVtYmVyOyBuaWdodDogYm9vbGVhbiB9IHtcbiAgcmV0dXJuIHsgZGF5OiBNYXRoLmZsb29yKHRpY2sgLyBEQVlfVElDS1MpLCBwaGFzZTogKHRpY2sgJSBEQVlfVElDS1MpIC8gREFZX1RJQ0tTLCBuaWdodDogaXNOaWdodCh0aWNrKSB9O1xufVxuXG5mdW5jdGlvbiB3YWxrKHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSk6IExlZyB7IHJldHVybiB7IG9wOiAnd2FsaycsIHg6IHAueCwgejogcC56LCB0aWNrczogMCwgZWZmZWN0OiAnbm9uZScgfTsgfVxuZnVuY3Rpb24gd29yayhwOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0sIHRpY2tzOiBudW1iZXIsIGVmZmVjdDogRWZmZWN0LCBpdGVtPzogc3RyaW5nLCBhbW91bnQ/OiBudW1iZXIpOiBMZWcge1xuICByZXR1cm4geyBvcDogJ3dvcmsnLCB4OiBwLngsIHo6IHAueiwgdGlja3MsIGVmZmVjdCwgLi4uKGl0ZW0gPyB7IGl0ZW0gfSA6IHt9KSwgLi4uKGFtb3VudCA/IHsgYW1vdW50IH0gOiB7fSkgfTtcbn1cblxuZnVuY3Rpb24gY2xhaW1lZChoOiBIb21lc3RlYWRTdGF0ZSwgc2VsZjogVmlsbGFnZXIpOiBTZXQ8c3RyaW5nPiB7XG4gIHJldHVybiBuZXcgU2V0KGgudmlsbGFnZXJzLmZpbHRlcigodikgPT4gdiAhPT0gc2VsZiAmJiB2LnRhc2spLm1hcCgodikgPT4gdi50YXNrIS50YXJnZXQpKTtcbn1cblxuZnVuY3Rpb24gcGxhbih3b3JsZDogV29ybGQsIGg6IEhvbWVzdGVhZFN0YXRlLCB2OiBWaWxsYWdlciwgdGljazogbnVtYmVyKTogVGFzayB8IG51bGwge1xuICBjb25zdCBsYXlvdXQgPSBob21lc3RlYWRMYXlvdXQoaCk7XG4gIGNvbnN0IGJ5SWQgPSBuZXcgTWFwKGxheW91dC5tYXAoKGYpID0+IFtmLmlkLCBmXSkpO1xuICBjb25zdCBob21lID0gYnlJZC5nZXQoJ2Zhcm1ob3VzZScpIS51c2UsIHdlbGwgPSBieUlkLmdldCgnd2VsbCcpIS51c2U7XG4gIGNvbnN0IHMgPSBzdG9jayh3b3JsZCkuaW52ZW50b3J5O1xuICBjb25zdCB0YWtlbiA9IGNsYWltZWQoaCwgdik7XG4gIC8vIEpvYnMgZ2l2ZW4gdXAgYXMgdW5yZWFjaGFibGUgYXJlIHNraXBwZWQgdW50aWwgdGhlaXIgdGltZSBpcyB1cCAodjIpLlxuICBmb3IgKGNvbnN0IGEgb2Ygdi5hdm9pZCA/PyBbXSkgaWYgKGEudW50aWwgPiB0aWNrKSB0YWtlbi5hZGQoYS50YXJnZXQpO1xuICBjb25zdCB0YXNrID0gKGtpbmQ6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIGxlZ3M6IExlZ1tdKTogVGFzayA9PiAoeyBraW5kLCB0YXJnZXQsIGxlZ3MsIGxlZzogMCwgcHJvZ3Jlc3M6IDAgfSk7XG4gIGNvbnN0IG5hdiA9IGlzTmF2SG9tZXN0ZWFkKGgpO1xuXG4gIC8vIFdoYXRldmVyIGlzIGluIGhhbmQgZ29lcyB0byB0aGUgc3RvcmUgZmlyc3QgKGEgaGFydmVzdCBpbnRlcnJ1cHRlZCBieSBuaWdodCwgYSBmdWxsIHN0b3JlIHJldHJpZWQpLlxuICBjb25zdCBjYXJyeWluZ1NlZWQgPSB2LmNhcnJ5Py5pdGVtID09PSAnc2VlZCcgJiYgdi5yb2xlID09PSAnZmFybWVyJ1xuICAgICYmIGgucGxvdHMuc29tZSgocCkgPT4gcC5zdGF0ZSA9PT0gJ3RpbGxlZCcgJiYgIXRha2VuLmhhcyhwLmlkKSAmJiB1bml0c09mKHApIDw9IHYuY2FycnkhLmFtb3VudCk7XG4gIGNvbnN0IHJvb20gPSBzdG9jayh3b3JsZCk7XG4gIGlmICh2Lmh1bmdlciA+PSA3MCAmJiBGT09EX1BSRUZFUkVOQ0Uuc29tZSgoZikgPT4gKHNbZl0gPz8gMCkgKyAoaC5vdmVyZmxvd1tmXSA/PyAwKSA+IDApICYmICF0YWtlbi5oYXMoYGVhdDoke3YuaWR9YCkpIHtcbiAgICByZXR1cm4gdGFzaygnZWF0JywgYGVhdDoke3YuaWR9YCwgW3dhbGsoU1RPQ0spLCB3b3JrKFNUT0NLLCAzLCAnZWF0JyldKTtcbiAgfVxuICBpZiAoaXNOaWdodCh0aWNrKSB8fCB2LmVuZXJneSA8PSAxMCkge1xuICAgIC8vIHYyOiB0aHJvdWdoIHRoZSBkb29yIHRvIHRoZSBiZWQgaW5zaWRlOyBhIHZpbGxhZ2VyIHdobyBjYW5ub3QgZ2V0IGhvbWUgcmVzdHMgd2hlcmUgaXQgc3RhbmRzLlxuICAgIGNvbnN0IGJlZCA9IG5hdiA/ICh0YWtlbi5oYXMoYGhvbWU6JHt2LmlkfWApID8geyB4OiB2LngsIHo6IHYueiB9IDogYmVkU3BvdChoKSkgOiBob21lO1xuICAgIHJldHVybiB0YXNrKCdyZXN0JywgYGhvbWU6JHt2LmlkfWAsIFt3YWxrKGJlZCksIHdvcmsoYmVkLCAxLCAncmVzdCcpXSk7XG4gIH1cbiAgY29uc3Qgc3BhY2UgPSBNYXRoLm1heCgwLCByb29tLmNhcGFjaXR5IC0gdG90YWwocm9vbS5pbnZlbnRvcnkpKSArIE1hdGgubWF4KDAsIE9WRVJGTE9XX0NBUEFDSVRZIC0gdG90YWwoaC5vdmVyZmxvdykpO1xuICBjb25zdCBjYXJyeWluZ0ZlZWQgPSB2LmNhcnJ5Py5pdGVtID09PSAnZmliZXInICYmIHYucm9sZSA9PT0gJ2hlcmRlcic7XG4gIGlmICh2LmNhcnJ5ICYmIHYuY2FycnkuaXRlbSAhPT0gJ3dhdGVyJyAmJiAhY2FycnlpbmdTZWVkICYmICFjYXJyeWluZ0ZlZWQgJiYgIXRha2VuLmhhcyhgY2Fycnk6JHt2LmlkfWApKSB7XG4gICAgcmV0dXJuIHRhc2soJ3N0b3JlJywgYGNhcnJ5OiR7di5pZH1gLCBbd2FsayhTVE9DSyksIHdvcmsoU1RPQ0ssIDEsICdzdG9yZScpXSk7XG4gIH1cbiAgLy8gU2VlZCBpbiBoYW5kIGlzIHNvd24gYmVmb3JlIGFueXRoaW5nIGVsc2UsIHNvIGl0IGlzIG5ldmVyIHNldCBhc2lkZSBvciBsb3N0LlxuICBpZiAoY2FycnlpbmdTZWVkKSB7XG4gICAgY29uc3QgcCA9IFsuLi5oLnBsb3RzXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLmZpbmQoKHEpID0+IHEuc3RhdGUgPT09ICd0aWxsZWQnICYmICF0YWtlbi5oYXMocS5pZCkgJiYgdW5pdHNPZihxKSA8PSB2LmNhcnJ5IS5hbW91bnQpITtcbiAgICBjb25zdCBhdCA9IGZpZWxkQ2VudHJlKHApO1xuICAgIHJldHVybiB0YXNrKCdzb3cnLCBwLmlkLCBbd2FsayhhdCksIHdvcmsoYXQsIDEgKyB1bml0c09mKHApLCAnc293JyldKTtcbiAgfVxuICAvKiogT25seSBzdGFydCB3b3JrIHdob3NlIG91dHB1dCBoYXMgc29tZXdoZXJlIHRvIGdvLiAqL1xuICBjb25zdCBmaXRzID0gKG46IG51bWJlcikgPT4gc3BhY2UgPj0gbjtcbiAgLy8gTW92ZSBnb29kcyBmcm9tIHRoZSBvdmVyZmxvdyBwaWxlIGludG8gdGhlIHN0b3JlIG9uY2UgdGhlcmUgaXMgcm9vbS5cbiAgY29uc3QgbG9vc2UgPSBPYmplY3Qua2V5cyhoLm92ZXJmbG93KS5zb3J0KClbMF07XG4gIGlmIChsb29zZSAmJiB0b3RhbChyb29tLmludmVudG9yeSkgPCByb29tLmNhcGFjaXR5ICYmICF0YWtlbi5oYXMoJ292ZXJmbG93OnN0b3JlJykpIHtcbiAgICBjb25zdCBuID0gTWF0aC5taW4oaC5vdmVyZmxvd1tsb29zZV0sIHJvb20uY2FwYWNpdHkgLSB0b3RhbChyb29tLmludmVudG9yeSksIDEwKTtcbiAgICByZXR1cm4gdGFzaygncmVzdG9jaycsICdvdmVyZmxvdzpzdG9yZScsIFt3YWxrKFNUT0NLKSwgd29yayhTVE9DSywgMiwgJ3Jlc3RvY2snLCBsb29zZSwgbildKTtcbiAgfVxuICBpZiAodi5yb2xlID09PSAnZmFybWVyJykge1xuICAgIGNvbnN0IHBsb3RzID0gWy4uLmgucGxvdHNdLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gICAgY29uc3QgZnJlZSA9IChwOiBQbG90KSA9PiAhdGFrZW4uaGFzKHAuaWQpO1xuICAgIGNvbnN0IGF0ID0gKHA6IFBsb3QpID0+IGZpZWxkQ2VudHJlKHApO1xuICAgIGNvbnN0IGhhcnZlc3RTaXplID0gKHA6IFBsb3QpID0+IE9iamVjdC52YWx1ZXMoQ1JPUF9SVUxFU1twLmNyb3BdLnlpZWxkKS5yZWR1Y2UoKG4sIGEpID0+IG4gKyBhLCAwKSAqIHVuaXRzT2YocCk7XG4gICAgLy8gQSBjYW4gc3RpbGwgaG9sZGluZyB3YXRlciBpcyB1c2VkIG9uIHRoZSBkcmllc3QgY3JvcCwgb3IgZW1wdGllZCwgYmVmb3JlIHdvcmsgdGhhdCBuZWVkcyBmcmVlIGhhbmRzLlxuICAgIGlmICh2LmNhcnJ5Py5pdGVtID09PSAnd2F0ZXInKSB7XG4gICAgICBjb25zdCBkcnkgPSBwbG90cy5maWx0ZXIoKHApID0+IHAuc3RhdGUgPT09ICdncm93aW5nJyAmJiBwLm1vaXN0dXJlIDwgTU9JU1RVUkVfTUFYIC0gMyAmJiBmcmVlKHApKS5zb3J0KChhLCBiKSA9PiBhLm1vaXN0dXJlIC0gYi5tb2lzdHVyZSlbMF07XG4gICAgICBpZiAoZHJ5KSByZXR1cm4gdGFzaygnd2F0ZXInLCBkcnkuaWQsIFt3YWxrKGF0KGRyeSkpLCB3b3JrKGF0KGRyeSksIDEsICd3YXRlcl9wbG90JyldKTtcbiAgICAgIHYuY2FycnkgPSBudWxsO1xuICAgIH1cbiAgICBjb25zdCByaXBlID0gcGxvdHMuZmluZCgocCkgPT4gcC5zdGF0ZSA9PT0gJ3JpcGUnICYmIGZyZWUocCkpO1xuICAgIGlmIChyaXBlICYmIGZpdHMoaGFydmVzdFNpemUocmlwZSkpKSB7XG4gICAgICByZXR1cm4gdGFzaygnaGFydmVzdCcsIHJpcGUuaWQsIFt3YWxrKGF0KHJpcGUpKSwgd29yayhhdChyaXBlKSwgMSArIDIgKiB1bml0c09mKHJpcGUpLCAncmVhcCcpLCB3YWxrKFNUT0NLKSwgd29yayhTVE9DSywgMSwgJ3N0b3JlJyldKTtcbiAgICB9XG4gICAgLy8gQ3JvcHMgY2xvc2VzdCB0byB3aXRoZXJpbmcgZmlyc3QsIHRoZW4gdGhlIGRyaWVzdC5cbiAgICBjb25zdCB0aGlyc3R5ID0gcGxvdHMuZmlsdGVyKChwKSA9PiBwLnN0YXRlID09PSAnZ3Jvd2luZycgJiYgcC5tb2lzdHVyZSA8PSA0ICYmIGZyZWUocCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5kcnkgLSBhLmRyeSB8fCBhLm1vaXN0dXJlIC0gYi5tb2lzdHVyZSB8fCBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpWzBdO1xuICAgIGlmICh0aGlyc3R5KSB7XG4gICAgICBjb25zdCBsZWdzID0gdi5jYXJyeT8uaXRlbSA9PT0gJ3dhdGVyJyA/IFtdIDogW3dhbGsod2VsbCksIHdvcmsod2VsbCwgMiwgJ2RyYXcnKV07XG4gICAgICByZXR1cm4gdGFzaygnd2F0ZXInLCB0aGlyc3R5LmlkLCBbLi4ubGVncywgd2FsayhhdCh0aGlyc3R5KSksIHdvcmsoYXQodGhpcnN0eSksIDEsICd3YXRlcl9wbG90JyldKTtcbiAgICB9XG4gICAgY29uc3Qgc2VlZEF2YWlsYWJsZSA9IChzLnNlZWQgPz8gMCkgKyAoaC5vdmVyZmxvdy5zZWVkID8/IDApO1xuICAgIC8vIFNvdyB0aGUgZmlyc3Qgd2FpdGluZyBmaWVsZCB0aGVyZSBpcyBlbm91Z2ggc2VlZCBmb3IgKG9uZSBzZWVkIHBlciB1bml0KS5cbiAgICBjb25zdCB0aWxsZWQgPSBwbG90cy5maW5kKChwKSA9PiBwLnN0YXRlID09PSAndGlsbGVkJyAmJiBmcmVlKHApICYmIHVuaXRzT2YocCkgPD0gc2VlZEF2YWlsYWJsZSk7XG4gICAgaWYgKHRpbGxlZCkge1xuICAgICAgcmV0dXJuIHRhc2soJ3NvdycsIHRpbGxlZC5pZCwgW3dhbGsoU1RPQ0spLCB3b3JrKFNUT0NLLCAxLCAndGFrZScsICdzZWVkJywgdW5pdHNPZih0aWxsZWQpKSwgd2FsayhhdCh0aWxsZWQpKSwgd29yayhhdCh0aWxsZWQpLCAxICsgdW5pdHNPZih0aWxsZWQpLCAnc293JyldKTtcbiAgICB9XG4gICAgLy8gU2hvcnQgb2Ygc2VlZCB3aXRoIGEgZmllbGQgd2FpdGluZzogdGhyZXNoIHN0cmF3IGludG8gc2VlZCBhdCB0aGUgc3RvcmUgKHRoZSBzZWVkIHJlY2lwZSkuXG4gICAgY29uc3Qgd2FpdGluZyA9IHBsb3RzLmZpbmQoKHApID0+IHAuc3RhdGUgPT09ICd0aWxsZWQnICYmIGZyZWUocCkpO1xuICAgIGNvbnN0IGZpYmVyQXZhaWxhYmxlID0gKHMuZmliZXIgPz8gMCkgKyAoaC5vdmVyZmxvdy5maWJlciA/PyAwKTtcbiAgICBpZiAod2FpdGluZyAmJiBmaWJlckF2YWlsYWJsZSA+PSBSRUNJUEVTLnNlZWQuaW5wdXQuZmliZXIhICYmICF0YWtlbi5oYXMoJ3RocmVzaDpzdG9yZScpKSB7XG4gICAgICByZXR1cm4gdGFzaygndGhyZXNoJywgJ3RocmVzaDpzdG9yZScsIFt3YWxrKFNUT0NLKSwgd29yayhTVE9DSywgNCwgJ3RocmVzaCcpXSk7XG4gICAgfVxuICAgIGNvbnN0IHdpbGQgPSBwbG90cy5maW5kKChwKSA9PiBwLnN0YXRlID09PSAnd2lsZCcgJiYgZnJlZShwKSk7XG4gICAgaWYgKHdpbGQpIHJldHVybiB0YXNrKCd0aWxsJywgd2lsZC5pZCwgW3dhbGsoYXQod2lsZCkpLCB3b3JrKGF0KHdpbGQpLCBUSUxMX1BFUl9VTklUICogdW5pdHNPZih3aWxkKSAtIHdpbGQudGlsbGVkLCAndGlsbCcpXSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgZW5jbCA9IFsuLi5oLmVuY2xvc3VyZXNdLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gICAgY29uc3Qgb2NjdXBpZWQgPSAoZTogRW5jbG9zdXJlKSA9PiBoLmFuaW1hbHMuc29tZSgoYSkgPT4gU1BFQ0lFU19SVUxFU1thLnNwZWNpZXNdLmVuY2xvc3VyZSA9PT0gZS5pZCk7XG4gICAgLy8gVG9wIHRyb3VnaHMgdXAgd2VsbCBiZWZvcmUgdGhleSBydW4gZHJ5OiB0aGUgaGVyZCBkcmlua3MgdGhyb3VnaCB0aGUgbmlnaHQuXG4gICAgY29uc3QgdGhpcnN0eSA9IGVuY2wuZmlsdGVyKChlKSA9PiBvY2N1cGllZChlKSAmJiBlLndhdGVyIDw9IDE0ICYmICF0YWtlbi5oYXMoYHdhdGVyOiR7ZS5pZH1gKSkuc29ydCgoYSwgYikgPT4gYS53YXRlciAtIGIud2F0ZXIpWzBdO1xuICAgIGlmICh0aGlyc3R5KSB7XG4gICAgICBjb25zdCB0ID0gYnlJZC5nZXQodGhpcnN0eS5pZCkhLnRyb3VnaCE7XG4gICAgICBjb25zdCBsZWdzID0gdi5jYXJyeT8uaXRlbSA9PT0gJ3dhdGVyJyA/IFtdIDogW3dhbGsod2VsbCksIHdvcmsod2VsbCwgMiwgJ2RyYXcnKV07XG4gICAgICByZXR1cm4gdGFzaygnd2F0ZXJfdHJvdWdoJywgYHdhdGVyOiR7dGhpcnN0eS5pZH1gLCBbLi4ubGVncywgd2Fsayh0KSwgd29yayh0LCAxLCAnd2F0ZXJfdHJvdWdoJyldKTtcbiAgICB9XG4gICAgY29uc3Qgc3RyYXcgPSAocy5maWJlciA/PyAwKSArIChoLm92ZXJmbG93LmZpYmVyID8/IDApICsgKHYuY2Fycnk/Lml0ZW0gPT09ICdmaWJlcicgPyB2LmNhcnJ5LmFtb3VudCA6IDApO1xuICAgIGNvbnN0IGh1bmdyeSA9IGVuY2wuZmlsdGVyKChlKSA9PiB7XG4gICAgICBpZiAoIW9jY3VwaWVkKGUpIHx8IHRha2VuLmhhcyhgZmVlZDoke2UuaWR9YCkpIHJldHVybiBmYWxzZTtcbiAgICAgIGNvbnN0IG5lZWRzVHJvdWdoID0gaC5hbmltYWxzLnNvbWUoKGEpID0+IFNQRUNJRVNfUlVMRVNbYS5zcGVjaWVzXS5lbmNsb3N1cmUgPT09IGUuaWQgJiYgZS5ncmFzcyA8IFNQRUNJRVNfUlVMRVNbYS5zcGVjaWVzXS5ncmF6ZSAqIDMpO1xuICAgICAgcmV0dXJuIG5lZWRzVHJvdWdoICYmIGUuZmVlZCA8PSA4O1xuICAgIH0pLnNvcnQoKGEsIGIpID0+IGEuZmVlZCAtIGIuZmVlZClbMF07XG4gICAgaWYgKGh1bmdyeSAmJiBzdHJhdyA+IDApIHtcbiAgICAgIGNvbnN0IHQgPSBieUlkLmdldChodW5ncnkuaWQpIS50cm91Z2ghO1xuICAgICAgaWYgKHYuY2Fycnk/Lml0ZW0gPT09ICdmaWJlcicpIHJldHVybiB0YXNrKCdmZWVkJywgYGZlZWQ6JHtodW5ncnkuaWR9YCwgW3dhbGsodCksIHdvcmsodCwgMiwgJ2ZpbGxfZmVlZCcpXSk7XG4gICAgICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbig2LCBzdHJhdywgVFJPVUdIX01BWCAtIGh1bmdyeS5mZWVkKTtcbiAgICAgIGlmIChhbW91bnQgPiAwKSB7XG4gICAgICAgIHJldHVybiB0YXNrKCdmZWVkJywgYGZlZWQ6JHtodW5ncnkuaWR9YCwgW3dhbGsoU1RPQ0spLCB3b3JrKFNUT0NLLCAxLCAndGFrZScsICdmaWJlcicsIGFtb3VudCksIHdhbGsodCksIHdvcmsodCwgMiwgJ2ZpbGxfZmVlZCcpXSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIFN0cmF3IGxlZnQgb3ZlciBhZnRlciBmZWVkaW5nIGdvZXMgYmFjayB0byB0aGUgc3RvcmUuXG4gICAgaWYgKHYuY2Fycnk/Lml0ZW0gPT09ICdmaWJlcicpIHJldHVybiB0YXNrKCdzdG9yZScsIGBjYXJyeToke3YuaWR9YCwgW3dhbGsoU1RPQ0spLCB3b3JrKFNUT0NLLCAxLCAnc3RvcmUnKV0pO1xuICAgIGNvbnN0IGNvb3AgPSBoLmVuY2xvc3VyZXMuZmluZCgoZSkgPT4gZS5pZCA9PT0gJ2Nvb3AnKTtcbiAgICBpZiAoY29vcCAmJiBjb29wLmVnZ3MgPj0gMyAmJiAhdGFrZW4uaGFzKCdlZ2dzOmNvb3AnKSAmJiBmaXRzKGNvb3AuZWdncykpIHtcbiAgICAgIC8vIHYyOiB0aGUgbmVzdCBib3ggaXMgaW5zaWRlIHRoZSBjb29wIGZlbmNlLCBiZWhpbmQgdGhlIGhlbiBob3VzZS5cbiAgICAgIGNvbnN0IGMgPSBuYXYgPyBuZXN0U3BvdChoKSA6IGJ5SWQuZ2V0KCdjb29wJykhLnVzZTtcbiAgICAgIHJldHVybiB0YXNrKCdjb2xsZWN0JywgJ2VnZ3M6Y29vcCcsIFt3YWxrKGMpLCB3b3JrKGMsIDIsICdnYXRoZXJfZWdncycpLCB3YWxrKFNUT0NLKSwgd29yayhTVE9DSywgMSwgJ3N0b3JlJyldKTtcbiAgICB9XG4gICAgY29uc3QgcmVhZHkgPSBbLi4uaC5hbmltYWxzXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLmZpbmQoKGEpID0+IHtcbiAgICAgIGNvbnN0IHAgPSBTUEVDSUVTX1JVTEVTW2Euc3BlY2llc10ucHJvZHVjdDtcbiAgICAgIHJldHVybiBwICYmIHAucmVzb3VyY2UgIT09ICdlZ2dzJyAmJiBhLnByb2R1Y3QgPj0gcC5ldmVyeSAmJiAhdGFrZW4uaGFzKGEuaWQpICYmIGZpdHMocC5hbW91bnQpO1xuICAgIH0pO1xuICAgIGlmIChyZWFkeSkge1xuICAgICAgY29uc3QgcCA9IFNQRUNJRVNfUlVMRVNbcmVhZHkuc3BlY2llc10ucHJvZHVjdCE7XG4gICAgICBjb25zdCBzcG90ID0geyB4OiByZWFkeS54LCB6OiByZWFkeS56IH07XG4gICAgICByZXR1cm4gdGFzayhwLnJlc291cmNlID09PSAnd29vbCcgPyAnc2hlYXInIDogJ21pbGsnLCByZWFkeS5pZCxcbiAgICAgICAgW3dhbGsoc3BvdCksIHdvcmsoc3BvdCwgcC5yZXNvdXJjZSA9PT0gJ3dvb2wnID8gNCA6IDMsIHAucmVzb3VyY2UgPT09ICd3b29sJyA/ICdzaGVhcicgOiAnbWlsaycpLCB3YWxrKFNUT0NLKSwgd29yayhTVE9DSywgMSwgJ3N0b3JlJyldKTtcbiAgICB9XG4gIH1cbiAgLy8gTGVmdG92ZXIgd2F0ZXIgaXMgcG91cmVkIG91dCAodGhlIHdlbGwgaXMgZW5kbGVzcyk7IHRoZW4gcmVzdCBuZWFyIGhvbWUuXG4gIGlmICh2LmNhcnJ5Py5pdGVtID09PSAnd2F0ZXInKSB2LmNhcnJ5ID0gbnVsbDtcbiAgLy8gTm90aGluZyB0byBkbzogaWRsZSBuZWFyIGhvbWUgZm9yIGEgd2hpbGUuXG4gIGNvbnN0IG94ID0gTWF0aC5mbG9vcihybmQoaCkgKiA2MCkgLSAzMCwgb3ogPSBNYXRoLmZsb29yKHJuZChoKSAqIDQwKSAtIDIwO1xuICByZXR1cm4gdGFzaygnaWRsZScsIGBpZGxlOiR7di5pZH1gLCBbd2Fsayh7IHg6IGhvbWUueCArIG94LCB6OiBob21lLnogKyBveiArIDMwIH0pLCB3b3JrKHsgeDogaG9tZS54ICsgb3gsIHo6IGhvbWUueiArIG96ICsgMzAgfSwgOCwgJ25vbmUnKV0pO1xufVxuXG4vLyAtLS0tLS0tLS0tIGFwcGx5aW5nIGVmZmVjdHMgLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgRXZlbnRzIHsgbG9nOiBzdHJpbmdbXSB9XG4vKiogRWZmZWN0cyB0aGF0IHB1dCBzb21ldGhpbmcgaW50byBlbXB0eSBoYW5kcy4gKi9cbmNvbnN0IFBJQ0tVUCA9IG5ldyBTZXQ8RWZmZWN0PihbJ3Rha2UnLCAnZHJhdycsICdyZWFwJywgJ2dhdGhlcl9lZ2dzJywgJ3NoZWFyJywgJ21pbGsnXSk7XG5cbmZ1bmN0aW9uIGFwcGx5RWZmZWN0KHdvcmxkOiBXb3JsZCwgaDogSG9tZXN0ZWFkU3RhdGUsIHY6IFZpbGxhZ2VyLCBsZWc6IExlZywgdGFzazogVGFzaywgZXY6IEV2ZW50cyk6IGJvb2xlYW4ge1xuICBjb25zdCBzID0gc3RvY2sod29ybGQpO1xuICAvLyBPbmUgbG9hZCBhdCBhIHRpbWU6IG5vdGhpbmcgaXMgZXZlciBkcm9wcGVkIHRvIG1ha2Ugcm9vbSBmb3IgYW5vdGhlci5cbiAgaWYgKFBJQ0tVUC5oYXMobGVnLmVmZmVjdCkgJiYgdi5jYXJyeSAmJiAhKGxlZy5lZmZlY3QgPT09ICdkcmF3JyAmJiB2LmNhcnJ5Lml0ZW0gPT09ICd3YXRlcicpKSByZXR1cm4gZmFsc2U7XG4gIHN3aXRjaCAobGVnLmVmZmVjdCkge1xuICAgIGNhc2UgJ25vbmUnOiByZXR1cm4gdHJ1ZTtcbiAgICBjYXNlICd0YWtlJzoge1xuICAgICAgLy8gVGhlIGxvb3NlIHBpbGUgYmVzaWRlIHRoZSBzdG9yZSBpcyB1c2VkIGZpcnN0LCB0aGVuIHRoZSBzdG9yZSBpdHNlbGYuXG4gICAgICBsZXQgZ290ID0gdGFrZUZyb20oaC5vdmVyZmxvdywgbGVnLml0ZW0hLCBsZWcuYW1vdW50ISk7XG4gICAgICBnb3QgKz0gdGFrZUZyb20ocy5pbnZlbnRvcnksIGxlZy5pdGVtISwgbGVnLmFtb3VudCEgLSBnb3QpO1xuICAgICAgaWYgKGdvdCA8PSAwKSByZXR1cm4gZmFsc2U7XG4gICAgICB2LmNhcnJ5ID0geyBpdGVtOiBsZWcuaXRlbSEsIGFtb3VudDogZ290IH07XG4gICAgICB3b3JsZC5yZXZpc2lvbisrO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNhc2UgJ3N0b3JlJzoge1xuICAgICAgaWYgKCF2LmNhcnJ5KSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmICghcHV0SW50byhzLmludmVudG9yeSwgdi5jYXJyeS5pdGVtLCB2LmNhcnJ5LmFtb3VudCwgcy5jYXBhY2l0eSkpIHJldHVybiBmYWxzZTtcbiAgICAgIGV2LmxvZy5wdXNoKGAke3YubmFtZX0gc3RvcmVkICR7di5jYXJyeS5hbW91bnR9ICR7di5jYXJyeS5pdGVtfWApO1xuICAgICAgdi5jYXJyeSA9IG51bGw7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY2FzZSAnZWF0Jzoge1xuICAgICAgY29uc3QgbG9vc2UgPSBGT09EX1BSRUZFUkVOQ0UuZmluZCgoZikgPT4gKGgub3ZlcmZsb3dbZl0gPz8gMCkgPiAwKTtcbiAgICAgIGNvbnN0IGZvb2QgPSBsb29zZSA/PyBGT09EX1BSRUZFUkVOQ0UuZmluZCgoZikgPT4gKHMuaW52ZW50b3J5W2ZdID8/IDApID4gMCk7XG4gICAgICBpZiAoIWZvb2QpIHJldHVybiBmYWxzZTtcbiAgICAgIHRha2VGcm9tKGxvb3NlID8gaC5vdmVyZmxvdyA6IHMuaW52ZW50b3J5LCBmb29kLCAxKTtcbiAgICAgIHYuaHVuZ2VyID0gTWF0aC5tYXgoMCwgdi5odW5nZXIgLSA3MCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY2FzZSAncmVzdCc6IHtcbiAgICAgIC8vIFRoZSB3b3JrIGxlZyByZXBlYXRzIHVudGlsIG1vcm5pbmcgYW5kIHRoZSB2aWxsYWdlciBpcyByZXN0ZWQuXG4gICAgICB2LmVuZXJneSA9IE1hdGgubWluKDEwMCwgdi5lbmVyZ3kgKyAyKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjYXNlICdkcmF3Jzogdi5jYXJyeSA9IHsgaXRlbTogJ3dhdGVyJywgYW1vdW50OiB2LnJvbGUgPT09ICdmYXJtZXInID8gQ0FOX1dBVEVSSU5HUyA6IDEgfTsgcmV0dXJuIHRydWU7XG4gICAgY2FzZSAndGhyZXNoJzoge1xuICAgICAgY29uc3QgbmVlZCA9IFJFQ0lQRVMuc2VlZC5pbnB1dC5maWJlciEsIG91dCA9IFJFQ0lQRVMuc2VlZC5vdXRwdXQuc2VlZCE7XG4gICAgICBjb25zdCBmcm9tUGlsZSA9IHRha2VGcm9tKGgub3ZlcmZsb3csICdmaWJlcicsIG5lZWQpO1xuICAgICAgY29uc3QgZ290ID0gZnJvbVBpbGUgKyB0YWtlRnJvbShzLmludmVudG9yeSwgJ2ZpYmVyJywgbmVlZCAtIGZyb21QaWxlKTtcbiAgICAgIGlmIChnb3QgPCBuZWVkKSB7IGlmIChnb3QpIGgub3ZlcmZsb3cuZmliZXIgPSAoaC5vdmVyZmxvdy5maWJlciA/PyAwKSArIGdvdDsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICBzLmludmVudG9yeS5zZWVkID0gKHMuaW52ZW50b3J5LnNlZWQgPz8gMCkgKyBvdXQ7XG4gICAgICBldi5sb2cucHVzaChgJHt2Lm5hbWV9IHRocmVzaGVkIHN0cmF3IGludG8gJHtvdXR9IHNlZWRgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjYXNlICdyZXN0b2NrJzoge1xuICAgICAgY29uc3QgbiA9IE1hdGgubWluKGxlZy5hbW91bnQgPz8gMCwgaC5vdmVyZmxvd1tsZWcuaXRlbSFdID8/IDAsIHMuY2FwYWNpdHkgLSB0b3RhbChzLmludmVudG9yeSkpO1xuICAgICAgaWYgKG4gPD0gMCkgcmV0dXJuIGZhbHNlO1xuICAgICAgdGFrZUZyb20oaC5vdmVyZmxvdywgbGVnLml0ZW0hLCBuKTtcbiAgICAgIHMuaW52ZW50b3J5W2xlZy5pdGVtIV0gPSAocy5pbnZlbnRvcnlbbGVnLml0ZW0hXSA/PyAwKSArIG47XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY2FzZSAndGlsbCc6IHtcbiAgICAgIGNvbnN0IHAgPSBoLnBsb3RzLmZpbmQoKHgpID0+IHguaWQgPT09IHRhc2sudGFyZ2V0KTtcbiAgICAgIGlmICghcCB8fCBwLnN0YXRlICE9PSAnd2lsZCcpIHJldHVybiBmYWxzZTtcbiAgICAgIHAuc3RhdGUgPSAndGlsbGVkJzsgcC50aWxsZWQgPSAwO1xuICAgICAgZXYubG9nLnB1c2goYCR7di5uYW1lfSBkdWcgb3ZlciB0aGUgJHtDUk9QX1JVTEVTW3AuY3JvcF0ubGFiZWwudG9Mb3dlckNhc2UoKX0gZmllbGRgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjYXNlICdzb3cnOiB7XG4gICAgICBjb25zdCBwID0gaC5wbG90cy5maW5kKCh4KSA9PiB4LmlkID09PSB0YXNrLnRhcmdldCk7XG4gICAgICBjb25zdCBuZWVkID0gcCA/IHVuaXRzT2YocCkgOiAwO1xuICAgICAgaWYgKCFwIHx8IHAuc3RhdGUgIT09ICd0aWxsZWQnIHx8IHYuY2Fycnk/Lml0ZW0gIT09ICdzZWVkJyB8fCB2LmNhcnJ5LmFtb3VudCA8IG5lZWQpIHJldHVybiBmYWxzZTtcbiAgICAgIHYuY2FycnkgPSB2LmNhcnJ5LmFtb3VudCA+IG5lZWQgPyB7IGl0ZW06ICdzZWVkJywgYW1vdW50OiB2LmNhcnJ5LmFtb3VudCAtIG5lZWQgfSA6IG51bGw7XG4gICAgICBPYmplY3QuYXNzaWduKHAsIHsgc3RhdGU6ICdncm93aW5nJywgZ3Jvd3RoOiAwLCBtb2lzdHVyZTogMCwgZHJ5OiAwIH0pO1xuICAgICAgZXYubG9nLnB1c2goYCR7di5uYW1lfSBzb3dlZCAke0NST1BfUlVMRVNbcC5jcm9wXS5sYWJlbC50b0xvd2VyQ2FzZSgpfSAoJHtuZWVkfSBzZWVkKWApO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNhc2UgJ3dhdGVyX3Bsb3QnOiB7XG4gICAgICBjb25zdCBwID0gaC5wbG90cy5maW5kKCh4KSA9PiB4LmlkID09PSB0YXNrLnRhcmdldCk7XG4gICAgICBpZiAoIXAgfHwgdi5jYXJyeT8uaXRlbSAhPT0gJ3dhdGVyJyB8fCAocC5zdGF0ZSAhPT0gJ2dyb3dpbmcnICYmIHAuc3RhdGUgIT09ICd0aWxsZWQnKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgLy8gRWFjaCBjYW4tZnVsbCB3YXRlcnMgb25lIHVuaXQgKDkgbVx1MDBCMik7IGEgYmlnIGZpZWxkIHRha2VzIHNldmVyYWwgdHJpcHMuXG4gICAgICBjb25zdCB1c2VkID0gTWF0aC5taW4odi5jYXJyeS5hbW91bnQsIE1hdGguY2VpbCgoKE1PSVNUVVJFX01BWCAtIHAubW9pc3R1cmUpICogdW5pdHNPZihwKSkgLyBNT0lTVFVSRV9NQVgpKTtcbiAgICAgIGlmICh1c2VkIDw9IDApIHJldHVybiB0cnVlO1xuICAgICAgdi5jYXJyeSA9IHYuY2FycnkuYW1vdW50ID4gdXNlZCA/IHsgaXRlbTogJ3dhdGVyJywgYW1vdW50OiB2LmNhcnJ5LmFtb3VudCAtIHVzZWQgfSA6IG51bGw7XG4gICAgICBwLm1vaXN0dXJlID0gTWF0aC5taW4oTU9JU1RVUkVfTUFYLCBwLm1vaXN0dXJlICsgTWF0aC5jZWlsKCh1c2VkICogTU9JU1RVUkVfTUFYKSAvIHVuaXRzT2YocCkpKTsgcC5kcnkgPSAwO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNhc2UgJ3JlYXAnOiB7XG4gICAgICBjb25zdCBwID0gaC5wbG90cy5maW5kKCh4KSA9PiB4LmlkID09PSB0YXNrLnRhcmdldCk7XG4gICAgICBpZiAoIXAgfHwgcC5zdGF0ZSAhPT0gJ3JpcGUnKSByZXR1cm4gZmFsc2U7XG4gICAgICAvLyBDYXJyaWVkIGFzIG9uZSBtaXhlZCBsb2FkIChjcm9wIGFuZCB1bml0cyk6IHRoZSBzdG9yZSBsZWcgZGVwb3NpdHMgZWFjaCBwYXJ0LlxuICAgICAgdi5jYXJyeSA9IHsgaXRlbTogYGhhcnZlc3Q6JHtwLmNyb3B9YCwgYW1vdW50OiB1bml0c09mKHApIH07XG4gICAgICBPYmplY3QuYXNzaWduKHAsIHsgc3RhdGU6ICd0aWxsZWQnLCBncm93dGg6IDAsIG1vaXN0dXJlOiBNYXRoLm1heCgwLCBwLm1vaXN0dXJlIC0gNCksIGRyeTogMCB9KTtcbiAgICAgIGV2LmxvZy5wdXNoKGAke3YubmFtZX0gaGFydmVzdGVkIHRoZSAke0NST1BfUlVMRVNbcC5jcm9wXS5sYWJlbC50b0xvd2VyQ2FzZSgpfWApO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNhc2UgJ3dhdGVyX3Ryb3VnaCc6IHtcbiAgICAgIGNvbnN0IGUgPSBoLmVuY2xvc3VyZXMuZmluZCgoeCkgPT4gYHdhdGVyOiR7eC5pZH1gID09PSB0YXNrLnRhcmdldCk7XG4gICAgICBpZiAoIWUgfHwgdi5jYXJyeT8uaXRlbSAhPT0gJ3dhdGVyJykgcmV0dXJuIGZhbHNlO1xuICAgICAgdi5jYXJyeSA9IG51bGw7XG4gICAgICBlLndhdGVyID0gTWF0aC5taW4oVFJPVUdIX01BWCwgZS53YXRlciArIEJVQ0tFVCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY2FzZSAnZmlsbF9mZWVkJzoge1xuICAgICAgY29uc3QgZSA9IGguZW5jbG9zdXJlcy5maW5kKCh4KSA9PiBgZmVlZDoke3guaWR9YCA9PT0gdGFzay50YXJnZXQpO1xuICAgICAgaWYgKCFlIHx8IHYuY2Fycnk/Lml0ZW0gIT09ICdmaWJlcicpIHJldHVybiBmYWxzZTtcbiAgICAgIGNvbnN0IHJvb20gPSBUUk9VR0hfTUFYIC0gZS5mZWVkLCB1c2VkID0gTWF0aC5taW4ocm9vbSwgdi5jYXJyeS5hbW91bnQpO1xuICAgICAgZS5mZWVkICs9IHVzZWQ7XG4gICAgICB2LmNhcnJ5ID0gdi5jYXJyeS5hbW91bnQgLSB1c2VkID4gMCA/IHsgaXRlbTogJ2ZpYmVyJywgYW1vdW50OiB2LmNhcnJ5LmFtb3VudCAtIHVzZWQgfSA6IG51bGw7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY2FzZSAnZ2F0aGVyX2VnZ3MnOiB7XG4gICAgICBjb25zdCBlID0gaC5lbmNsb3N1cmVzLmZpbmQoKHgpID0+IHguaWQgPT09ICdjb29wJyk7XG4gICAgICBpZiAoIWUgfHwgZS5lZ2dzIDw9IDApIHJldHVybiBmYWxzZTtcbiAgICAgIHYuY2FycnkgPSB7IGl0ZW06ICdlZ2dzJywgYW1vdW50OiBlLmVnZ3MgfTtcbiAgICAgIGUuZWdncyA9IDA7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY2FzZSAnc2hlYXInOiBjYXNlICdtaWxrJzoge1xuICAgICAgY29uc3QgYSA9IGguYW5pbWFscy5maW5kKCh4KSA9PiB4LmlkID09PSB0YXNrLnRhcmdldCk7XG4gICAgICBjb25zdCBwID0gYSAmJiBTUEVDSUVTX1JVTEVTW2Euc3BlY2llc10ucHJvZHVjdDtcbiAgICAgIGlmICghYSB8fCAhcCB8fCBhLnByb2R1Y3QgPCBwLmV2ZXJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICB2LmNhcnJ5ID0geyBpdGVtOiBwLnJlc291cmNlLCBhbW91bnQ6IHAuYW1vdW50IH07XG4gICAgICBhLnByb2R1Y3QgPSAwO1xuICAgICAgZXYubG9nLnB1c2goYCR7di5uYW1lfSAke2xlZy5lZmZlY3QgPT09ICdzaGVhcicgPyAnc2hlYXJlZCcgOiAnbWlsa2VkJ30gJHthLmlkfWApO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG4vKipcbiAqIFN0b3JlIGEgY2FycmllZCBsb2FkIChhIGhhcnZlc3QgbG9hZCBleHBhbmRzIGludG8gaXRzIHJlYWwgcGFydHMpLiBXaGF0IGRvZXNcbiAqIG5vdCBmaXQgaW5zaWRlIGlzIHNldCBkb3duIG9uIHRoZSBvdmVyZmxvdyBwaWxlIGJlc2lkZSB0aGUgc3RvcmUuXG4gKi9cbmZ1bmN0aW9uIHN0b3JlQ2Fycnkod29ybGQ6IFdvcmxkLCBoOiBIb21lc3RlYWRTdGF0ZSwgdjogVmlsbGFnZXIpOiBib29sZWFuIHtcbiAgaWYgKCF2LmNhcnJ5KSByZXR1cm4gdHJ1ZTtcbiAgY29uc3QgcyA9IHN0b2NrKHdvcmxkKTtcbiAgY29uc3QgY3JvcCA9IHYuY2FycnkuaXRlbS5zdGFydHNXaXRoKCdoYXJ2ZXN0OicpID8gdi5jYXJyeS5pdGVtLnNsaWNlKDgpIGFzIENyb3BLaW5kIDogbnVsbDtcbiAgY29uc3QgcGFydHM6IEFycmF5PFtzdHJpbmcsIG51bWJlcl0+ID0gY3JvcCA/IE9iamVjdC5lbnRyaWVzKENST1BfUlVMRVNbY3JvcF0ueWllbGQpLm1hcCgoW2ssIG5dKSA9PiBbaywgbiAqIHYuY2FycnkhLmFtb3VudF0pXG4gICAgOiBbW3YuY2FycnkuaXRlbSwgdi5jYXJyeS5hbW91bnRdXTtcbiAgY29uc3QgbmVlZCA9IHBhcnRzLnJlZHVjZSgobiwgWywgYV0pID0+IG4gKyBhLCAwKTtcbiAgY29uc3QgaW5zaWRlID0gTWF0aC5tYXgoMCwgcy5jYXBhY2l0eSAtIHRvdGFsKHMuaW52ZW50b3J5KSk7XG4gIGNvbnN0IG91dHNpZGUgPSBNYXRoLm1heCgwLCBPVkVSRkxPV19DQVBBQ0lUWSAtIHRvdGFsKGgub3ZlcmZsb3cpKTtcbiAgaWYgKGluc2lkZSArIG91dHNpZGUgPCBuZWVkKSByZXR1cm4gZmFsc2U7XG4gIGxldCBmcmVlID0gaW5zaWRlO1xuICBmb3IgKGNvbnN0IFtpdGVtLCBhbW91bnRdIG9mIHBhcnRzKSB7XG4gICAgY29uc3QgYSA9IE1hdGgubWluKGFtb3VudCwgZnJlZSk7XG4gICAgaWYgKGEgPiAwKSB7IHMuaW52ZW50b3J5W2l0ZW1dID0gKHMuaW52ZW50b3J5W2l0ZW1dID8/IDApICsgYTsgZnJlZSAtPSBhOyB9XG4gICAgaWYgKGFtb3VudCAtIGEgPiAwKSBoLm92ZXJmbG93W2l0ZW1dID0gKGgub3ZlcmZsb3dbaXRlbV0gPz8gMCkgKyBhbW91bnQgLSBhO1xuICB9XG4gIHYuY2FycnkgPSBudWxsO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuLyoqIEF0IGRhd24sIGhhbGYgdGhlIHN0b3JlZCBtaWxrIGFuZCBhIHF1YXJ0ZXIgb2YgdGhlIGVnZ3MgaGF2ZSBzcG9pbGVkLiAqL1xuZnVuY3Rpb24gc3BvaWwod29ybGQ6IFdvcmxkLCBoOiBIb21lc3RlYWRTdGF0ZSwgdGljazogbnVtYmVyKTogdm9pZCB7XG4gIGlmICh0aWNrICUgREFZX1RJQ0tTICE9PSBOSUdIVF9FTkQpIHJldHVybjtcbiAgY29uc3QgcyA9IHN0b2NrKHdvcmxkKTtcbiAgZm9yIChjb25zdCBiYWcgb2YgW3MuaW52ZW50b3J5LCBoLm92ZXJmbG93XSkge1xuICAgIGlmIChiYWcubWlsaykgdGFrZUZyb20oYmFnLCAnbWlsaycsIE1hdGguY2VpbChiYWcubWlsayAvIDIpKTtcbiAgICBpZiAoYmFnLmVnZ3MpIHRha2VGcm9tKGJhZywgJ2VnZ3MnLCBNYXRoLmZsb29yKGJhZy5lZ2dzIC8gNCkpO1xuICB9XG59XG5cbi8qKiBXaGF0IGEgd2FsayBsZWcgaXMgZm9yIGRlY2lkZXMgaG93IGNsb3NlIHRoZSB2aWxsYWdlciBtdXN0IGdldCAoZG0pLCBhbmQgd2hldGhlciB0aGUgc3BvdCBtb3Zlcy4gKi9cbmZ1bmN0aW9uIGdvYWxGb3IoaDogSG9tZXN0ZWFkU3RhdGUsIHQ6IFRhc2ssIGxlZ0luZGV4OiBudW1iZXIpOiBOYXZHb2FsIHtcbiAgY29uc3QgbGVnID0gdC5sZWdzW2xlZ0luZGV4XSwgbmV4dCA9IHQubGVnc1tsZWdJbmRleCArIDFdO1xuICBpZiAodC5raW5kID09PSAnaWRsZScpIHJldHVybiB7IHg6IGxlZy54LCB6OiBsZWcueiwgcmVhY2g6IDMwIH07XG4gIGlmIChuZXh0Py5lZmZlY3QgPT09ICd3YXRlcl90cm91Z2gnIHx8IG5leHQ/LmVmZmVjdCA9PT0gJ2ZpbGxfZmVlZCcpIHJldHVybiB7IHg6IGxlZy54LCB6OiBsZWcueiwgcmVhY2g6IDE1IH07XG4gIGlmIChuZXh0Py5lZmZlY3QgPT09ICdzaGVhcicgfHwgbmV4dD8uZWZmZWN0ID09PSAnbWlsaycpIHtcbiAgICAvLyBXYWxrIHRvIHRoZSBhbmltYWwgaXRzZWxmLCBmb2xsb3dpbmcgaXQgYXMgaXQgZ3JhemVzLlxuICAgIGNvbnN0IGEgPSBoLmFuaW1hbHMuZmluZCgoeCkgPT4geC5pZCA9PT0gdC50YXJnZXQpO1xuICAgIGlmIChhKSByZXR1cm4geyB4OiBhLngsIHo6IGEueiwgcmVhY2g6IDEyLCBkcmlmdDogMjAgfTtcbiAgfVxuICByZXR1cm4geyB4OiBsZWcueCwgejogbGVnLnosIHJlYWNoOiA4IH07XG59XG5cbmNvbnN0IFRBU0tfV09SRFM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGVhdDogJ3RoZSBzdG9yZSB0byBlYXQnLCByZXN0OiAnaG9tZScsIHN0b3JlOiAndGhlIHN0b3JlJywgcmVzdG9jazogJ3RoZSBzdG9yZScsIHRocmVzaDogJ3RoZSBzdG9yZScsIGhhcnZlc3Q6ICd0aGUgZmllbGQnLFxuICBzb3c6ICd0aGUgZmllbGQnLCB3YXRlcjogJ3RoZSBmaWVsZCcsIHRpbGw6ICd0aGUgZmllbGQnLCB3YXRlcl90cm91Z2g6ICd0aGUgdHJvdWdoJywgZmVlZDogJ3RoZSB0cm91Z2gnLCBjb2xsZWN0OiAndGhlIG5lc3QgYm94JyxcbiAgc2hlYXI6ICd0aGUgc2hlZXAnLCBtaWxrOiAndGhlIGFuaW1hbCcsXG59O1xuXG4vKiogdjIgd2FsayBsZWc6IGZvbGxvdyBhIHJvdXRlIG92ZXIgdGhlIHJlYWwgZ3JvdW5kOyBhcnJpdmUsIHdhaXQsIG9yIHJlcG9ydCB0aGUgb2JzdHJ1Y3Rpb24uICovXG5mdW5jdGlvbiBuYXZXYWxrKHdvcmxkOiBXb3JsZCwgaDogSG9tZXN0ZWFkU3RhdGUsIHY6IFZpbGxhZ2VyLCB0OiBUYXNrLCB0aWNrOiBudW1iZXIsIHNwZWVkOiBudW1iZXIsIGV2OiBFdmVudHMsIGJ1ZGdldDogeyBsZWZ0OiBudW1iZXIgfSk6IHZvaWQge1xuICBjb25zdCBncmlkID0gaG9tZXN0ZWFkTmF2KHdvcmxkLCBoKTtcbiAgY29uc3QgZ29hbCA9IGdvYWxGb3IoaCwgdCwgdC5sZWcpO1xuICBjb25zdCByID0gbmF2U3RlcCh7XG4gICAgd29ybGQsIGdyaWQsIHRpY2ssIGJ1ZGdldCxcbiAgICBnYXRlOiAoaWQpID0+IGguZ2F0ZXM/LmZpbmQoKGcpID0+IGcuaWQgPT09IGlkKT8uc3RhdGUgPz8gJ2xvY2tlZCcsXG4gICAgc2V0R2F0ZTogKGlkLCBzdGF0ZSkgPT4geyBjb25zdCBnID0gaC5nYXRlcz8uZmluZCgoeCkgPT4geC5pZCA9PT0gaWQpOyBpZiAoZykgZy5zdGF0ZSA9IHN0YXRlOyB9LFxuICAgIGNhbk9wZXJhdGU6ICgpID0+IHRydWUsXG4gIH0sIHYsIGdvYWwsIHNwZWVkLCB0LnRhcmdldCk7XG4gIGlmIChyLnN0YXR1cyA9PT0gJ2Fycml2ZWQnKSB7XG4gICAgLy8gQSBtb3ZpbmcgYW5pbWFsOiB3b3JrIHdoZXJlIHRoZSB2aWxsYWdlciBhY3R1YWxseSBzdGFuZHMsIG5leHQgdG8gaXQuXG4gICAgY29uc3QgbmV4dCA9IHQubGVnc1t0LmxlZyArIDFdO1xuICAgIGlmIChuZXh0ICYmIChuZXh0LmVmZmVjdCA9PT0gJ3NoZWFyJyB8fCBuZXh0LmVmZmVjdCA9PT0gJ21pbGsnKSkgeyBuZXh0LnggPSB2Lng7IG5leHQueiA9IHYuejsgfVxuICAgIHQubGVnKys7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyLnN0YXR1cyAhPT0gJ2Jsb2NrZWQnKSByZXR1cm47XG4gIGlmICh0LmtpbmQgPT09ICdpZGxlJykgeyB0LmxlZysrOyByZXR1cm47IH0gLy8gYSBzdHJvbGwgdGhhdCBjYW5ub3QgZ28gYW55d2hlcmUgc3RheXMgcHV0OyBubyBqb2IgaXMgbG9zdFxuICBjb25zdCB3aGVyZSA9IFRBU0tfV09SRFNbdC5raW5kXSA/PyB0LnRhcmdldDtcbiAgaWYgKHIuZnJlc2gpIGV2LmxvZy5wdXNoKGAke3YubmFtZX0gY2Fubm90IHJlYWNoICR7d2hlcmV9OiAke3IucmVhc29ufWApO1xuICBjb25zdCBzaW5jZSA9IHYubmF2Py5ibG9ja2VkPy5zaW5jZSA/PyB0aWNrO1xuICBpZiAodGljayAtIHNpbmNlID49IE5BVl9HSVZFX1VQKSB7XG4gICAgLy8gR2l2ZSB0aGUgam9iIHVwIG9wZW5seTogdGhlIHJlYXNvbiBzdGF5cyBvbiB0aGUgdmlsbGFnZXIsIHRoZSBsb2FkIHN0YXlzIGluIGhhbmQsIHRoZSBqb2IgaXMgc2tpcHBlZCBmb3IgYSB3aGlsZS5cbiAgICB2LmF2b2lkID0gWy4uLih2LmF2b2lkID8/IFtdKS5maWx0ZXIoKGEpID0+IGEudGFyZ2V0ICE9PSB0LnRhcmdldCksIHsgdGFyZ2V0OiB0LnRhcmdldCwgdW50aWw6IHRpY2sgKyBOQVZfQVZPSUQsIHJlYXNvbjogci5yZWFzb24sIGJ5OiByLmJ5IH1dXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS50YXJnZXQubG9jYWxlQ29tcGFyZShiLnRhcmdldCkpLnNsaWNlKC1NQVhfQVZPSUQpO1xuICAgIGV2LmxvZy5wdXNoKGAke3YubmFtZX0gZ2F2ZSB1cCBvbiAke3doZXJlfSBhZnRlciAke3RpY2sgLSBzaW5jZX0gdGlja3M6ICR7ci5yZWFzb259YCk7XG4gICAgdi50YXNrID0gbnVsbDtcbiAgfVxufVxuY29uc3QgTUFYX0FWT0lEID0gODtcblxuZnVuY3Rpb24gc3RlcFZpbGxhZ2VyKHdvcmxkOiBXb3JsZCwgaDogSG9tZXN0ZWFkU3RhdGUsIHY6IFZpbGxhZ2VyLCB0aWNrOiBudW1iZXIsIGV2OiBFdmVudHMsIGJ1ZGdldDogeyBsZWZ0OiBudW1iZXIgfSk6IHZvaWQge1xuICBpZiAodGljayAlIDIgPT09IDApIHYuaHVuZ2VyID0gTWF0aC5taW4oMTAwLCB2Lmh1bmdlciArIDEpO1xuICBjb25zdCBzdGFydmluZyA9IHYuaHVuZ2VyID49IDEwMDtcbiAgaWYgKHYuYXZvaWQpIHsgdi5hdm9pZCA9IHYuYXZvaWQuZmlsdGVyKChhKSA9PiBhLnVudGlsID4gdGljayk7IGlmICghdi5hdm9pZC5sZW5ndGgpIGRlbGV0ZSB2LmF2b2lkOyB9XG4gIGlmICghdi50YXNrKSB2LnRhc2sgPSBwbGFuKHdvcmxkLCBoLCB2LCB0aWNrKTtcbiAgY29uc3QgdCA9IHYudGFzaztcbiAgaWYgKCF0KSByZXR1cm47XG4gIGNvbnN0IGxlZyA9IHQubGVnc1t0LmxlZ107XG4gIGlmIChsZWcub3AgPT09ICd3YWxrJyAmJiBpc05hdkhvbWVzdGVhZChoKSkge1xuICAgIG5hdldhbGsod29ybGQsIGgsIHYsIHQsIHRpY2ssIHN0YXJ2aW5nID8gVklMTEFHRVJfU1BFRUQgLyAyIDogVklMTEFHRVJfU1BFRUQsIGV2LCBidWRnZXQpO1xuICAgIGlmICh2LnRhc2sgJiYgdC5sZWcgPj0gdC5sZWdzLmxlbmd0aCkgdi50YXNrID0gbnVsbDtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGxlZy5vcCA9PT0gJ3dhbGsnKSB7XG4gICAgY29uc3QgZHggPSBsZWcueCAtIHYueCwgZHogPSBsZWcueiAtIHYueiwgZCA9IGxlbjIoZHgsIGR6KTtcbiAgICBjb25zdCBzcGVlZCA9IHN0YXJ2aW5nID8gVklMTEFHRVJfU1BFRUQgLyAyIDogVklMTEFHRVJfU1BFRUQ7XG4gICAgaWYgKGQgPD0gc3BlZWQpIHsgdi54ID0gbGVnLng7IHYueiA9IGxlZy56OyB0LmxlZysrOyB9XG4gICAgZWxzZSB7IHYueCArPSBNYXRoLnJvdW5kKChkeCAvIGQpICogc3BlZWQpOyB2LnogKz0gTWF0aC5yb3VuZCgoZHogLyBkKSAqIHNwZWVkKTsgfVxuICB9IGVsc2Uge1xuICAgIGlmIChsZWcuZWZmZWN0ICE9PSAncmVzdCcgJiYgdGljayAlIDMgPT09IDApIHYuZW5lcmd5ID0gTWF0aC5tYXgoMCwgdi5lbmVyZ3kgLSAxKTtcbiAgICB0LnByb2dyZXNzICs9IHN0YXJ2aW5nID8gMSA6IDI7XG4gICAgaWYgKHQucHJvZ3Jlc3MgPj0gbGVnLnRpY2tzICogMikge1xuICAgICAgaWYgKGxlZy5lZmZlY3QgPT09ICdyZXN0JyAmJiAoaXNOaWdodCh0aWNrKSB8fCB2LmVuZXJneSA8IDkwKSkge1xuICAgICAgICB2LmVuZXJneSA9IE1hdGgubWluKDEwMCwgdi5lbmVyZ3kgKyAyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3Qgb2sgPSBsZWcuZWZmZWN0ID09PSAnc3RvcmUnID8gc3RvcmVDYXJyeSh3b3JsZCwgaCwgdikgOiBhcHBseUVmZmVjdCh3b3JsZCwgaCwgdiwgbGVnLCB0LCBldik7XG4gICAgICB0LnByb2dyZXNzID0gMDtcbiAgICAgIGlmICghb2sgJiYgbGVnLmVmZmVjdCA9PT0gJ3N0b3JlJyAmJiB2LmNhcnJ5KSB7XG4gICAgICAgIC8vIFRoZSBzdG9yZSBmaWxsZWQgdXAgb24gdGhlIHdheTogdGhlIGxvYWQgaXMgbGVmdCB0byBzcG9pbCByYXRoZXIgdGhhblxuICAgICAgICAvLyBzdG9wcGluZyBhbGwgb3RoZXIgd29yayAoYW5pbWFsIGNhcmUgbXVzdCBuZXZlciB3YWl0IG9uIHN0b3JhZ2UpLlxuICAgICAgICBldi5sb2cucHVzaChgJHt2Lm5hbWV9IGZvdW5kIHRoZSBzdG9yZSBmdWxsOyAke3YuY2FycnkuaXRlbS5zdGFydHNXaXRoKCdoYXJ2ZXN0JykgPyAndGhlIGhhcnZlc3QnIDogYCR7di5jYXJyeS5hbW91bnR9ICR7di5jYXJyeS5pdGVtfWB9IHNwb2lsZWRgKTtcbiAgICAgICAgdi5jYXJyeSA9IG51bGw7XG4gICAgICB9XG4gICAgICBpZiAoIW9rKSB7IHYudGFzayA9IG51bGw7IHJldHVybjsgfVxuICAgICAgaWYgKGxlZy5lZmZlY3QgPT09ICdzdG9yZScgJiYgdC5raW5kICE9PSAnc3RvcmUnKSBldi5sb2cucHVzaChgJHt2Lm5hbWV9IGRlbGl2ZXJlZCB0byB0aGUgc3RvcmVgKTtcbiAgICAgIHQubGVnKys7XG4gICAgfVxuICB9XG4gIGlmICh0LmxlZyA+PSB0LmxlZ3MubGVuZ3RoKSB2LnRhc2sgPSBudWxsO1xufVxuXG4vLyAtLS0tLS0tLS0tIGFuaW1hbHMgLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBzdGVwQW5pbWFscyhoOiBIb21lc3RlYWRTdGF0ZSwgdGljazogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGJ5RW5jbG9zdXJlID0gbmV3IE1hcDxFbmNsb3N1cmVJZCwgQW5pbWFsW10+KCk7XG4gIGZvciAoY29uc3QgYSBvZiBoLmFuaW1hbHMpIHtcbiAgICBjb25zdCBpZCA9IFNQRUNJRVNfUlVMRVNbYS5zcGVjaWVzXS5lbmNsb3N1cmU7XG4gICAgYnlFbmNsb3N1cmUuc2V0KGlkLCBbLi4uKGJ5RW5jbG9zdXJlLmdldChpZCkgPz8gW10pLCBhXSk7XG4gIH1cbiAgY29uc3QgYmlydGhzOiBBbmltYWxbXSA9IFtdO1xuICBjb25zdCBkZWFkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgYSBvZiBbLi4uaC5hbmltYWxzXS5zb3J0KCh4LCB5KSA9PiB4LmlkLmxvY2FsZUNvbXBhcmUoeS5pZCkpKSB7XG4gICAgY29uc3QgcnVsZSA9IFNQRUNJRVNfUlVMRVNbYS5zcGVjaWVzXTtcbiAgICBjb25zdCBmYWMgPSBmYWNpbGl0eShoLCBydWxlLmVuY2xvc3VyZSkhO1xuICAgIGNvbnN0IGVuY2wgPSBoLmVuY2xvc3VyZXMuZmluZCgoZSkgPT4gZS5pZCA9PT0gcnVsZS5lbmNsb3N1cmUpITtcbiAgICBjb25zdCBhZHVsdCA9IHRpY2sgLSBhLmJvcm4gPj0gcnVsZS5hZHVsdEFnZTtcbiAgICAvLyBBbmltYWxzIGdldCBodW5ncnkgZXZlcnkgb3RoZXIgdGljayBieSBkYXkgYW5kIGV2ZXJ5IGZvdXJ0aCB0aWNrIHdoaWxlIHRoZXkgc2xlZXAuXG4gICAgaWYgKHRpY2sgJSAoaXNOaWdodCh0aWNrKSA/IDQgOiAyKSA9PT0gMCkgYS5odW5nZXIgPSBNYXRoLm1pbigxMDAsIGEuaHVuZ2VyICsgMSk7XG4gICAgLy8gRWF0OiBncmF6ZSB0aGUgcGFzdHVyZSBpZiB0aGVyZSBpcyBncmFzcywgZWxzZSB0aGUgdHJvdWdoOyB3YXRlciBpcyBhbHdheXMgZnJvbSB0aGUgdHJvdWdoLlxuICAgIGxldCB0YXJnZXQgPSB7IHg6IGEudHgsIHo6IGEudHogfTtcbiAgICBpZiAoYS5odW5nZXIgPj0gSFVOR0VSX01FQUwpIHtcbiAgICAgIGNvbnN0IGdyYXppbmcgPSBydWxlLmdyYXplID4gMCAmJiBlbmNsLmdyYXNzID49IHJ1bGUuZ3JhemU7XG4gICAgICBjb25zdCBjYW5FYXQgPSBlbmNsLndhdGVyID4gMCAmJiAoZ3JhemluZyB8fCBlbmNsLmZlZWQgPj0gcnVsZS5mZWVkKTtcbiAgICAgIGlmIChjYW5FYXQpIHtcbiAgICAgICAgY29uc3QgdHJvdWdoID0gZmFjLnRyb3VnaCE7XG4gICAgICAgIHRhcmdldCA9IGdyYXppbmcgPyB7IHg6IGEueCwgejogYS56IH0gOiB0cm91Z2g7XG4gICAgICAgIGNvbnN0IG5lYXIgPSBsZW4yKGEueCAtIHRhcmdldC54LCBhLnogLSB0YXJnZXQueikgPD0gMTI7XG4gICAgICAgIGlmIChuZWFyKSB7XG4gICAgICAgICAgaWYgKGdyYXppbmcpIGVuY2wuZ3Jhc3MgLT0gcnVsZS5ncmF6ZTsgZWxzZSBlbmNsLmZlZWQgLT0gcnVsZS5mZWVkO1xuICAgICAgICAgIGVuY2wud2F0ZXIgLT0gMTtcbiAgICAgICAgICBhLmh1bmdlciA9IE1hdGgubWF4KDAsIGEuaHVuZ2VyIC0gSFVOR0VSX01FQUwpO1xuICAgICAgICAgIGEudHggPSBhLng7IGEudHogPSBhLno7XG4gICAgICAgIH0gZWxzZSB7IGEudHggPSB0YXJnZXQueDsgYS50eiA9IHRhcmdldC56OyB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChsZW4yKGEudHggLSBhLngsIGEudHogLSBhLnopIDwgQU5JTUFMX1NQRUVEICYmIHJuZChoKSA8IDAuMDYpIHtcbiAgICAgIGNvbnN0IHAgPSByYW5kb21Qb2ludEluKGgsIGZhYy5yZWN0KTtcbiAgICAgIGEudHggPSBwLng7IGEudHogPSBwLno7XG4gICAgfVxuICAgIGNvbnN0IGR4ID0gYS50eCAtIGEueCwgZHogPSBhLnR6IC0gYS56LCBkID0gbGVuMihkeCwgZHopO1xuICAgIGlmIChkID4gMCkge1xuICAgICAgY29uc3Qgc3RlcCA9IE1hdGgubWluKGQsIEFOSU1BTF9TUEVFRCk7XG4gICAgICBhLnggKz0gTWF0aC5yb3VuZCgoZHggLyBkKSAqIHN0ZXApOyBhLnogKz0gTWF0aC5yb3VuZCgoZHogLyBkKSAqIHN0ZXApO1xuICAgIH1cbiAgICAvLyBTdGFydmF0aW9uIGlzIGEgcmVhbCBjb25zZXF1ZW5jZS5cbiAgICBpZiAoYS5odW5nZXIgPj0gMTAwKSB7IGEuc3RhcnZpbmcrKzsgaWYgKGEuc3RhcnZpbmcgPj0gU1RBUlZJTkdfREVBVEhfVElDS1MpIGRlYWQuYWRkKGEuaWQpOyBjb250aW51ZTsgfVxuICAgIGEuc3RhcnZpbmcgPSAwO1xuICAgIC8vIFByb2R1Y3RzIGFjY3VtdWxhdGUgb25seSB3aGlsZSB0aGUgYW5pbWFsIGlzIGZlZC5cbiAgICBjb25zdCBwID0gcnVsZS5wcm9kdWN0O1xuICAgIGlmIChwICYmIGFkdWx0ICYmIGEuaHVuZ2VyIDwgODAgJiYgKCFwLmZlbWFsZXMgfHwgYS5zZXggPT09ICdmJykgJiYgYS5wcm9kdWN0IDwgcC5ldmVyeSkge1xuICAgICAgYS5wcm9kdWN0Kys7XG4gICAgICBpZiAocC5yZXNvdXJjZSA9PT0gJ2VnZ3MnICYmIGEucHJvZHVjdCA+PSBwLmV2ZXJ5KSB7XG4gICAgICAgIGlmIChlbmNsLmVnZ3MgPCBFR0dfQk9YX01BWCkgeyBlbmNsLmVnZ3MgKz0gcC5hbW91bnQ7IH1cbiAgICAgICAgYS5wcm9kdWN0ID0gMDtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gUmVwcm9kdWN0aW9uOiBmZWQgYWR1bHQgZmVtYWxlLCBhbiBhZHVsdCBtYWxlIGluIHRoZSBzYW1lIGVuY2xvc3VyZSwgcm9vbSB0byBzcGFyZS5cbiAgICBjb25zdCBoZXJkID0gYnlFbmNsb3N1cmUuZ2V0KHJ1bGUuZW5jbG9zdXJlKSA/PyBbXTtcbiAgICBpZiAoYS5wcmVnbmFudFVudGlsID4gMCAmJiB0aWNrID49IGEucHJlZ25hbnRVbnRpbCkge1xuICAgICAgYS5wcmVnbmFudFVudGlsID0gMDtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcnVsZS5saXR0ZXI7IGkrKykge1xuICAgICAgICBpZiAoaGVyZC5sZW5ndGggKyBiaXJ0aHMubGVuZ3RoID49IChmYWMuY2FwYWNpdHkgPz8gMCkgfHwgaC5hbmltYWxzLmxlbmd0aCArIGJpcnRocy5sZW5ndGggPj0gTUFYX0FOSU1BTFMpIGJyZWFrO1xuICAgICAgICBiaXJ0aHMucHVzaCh7IGlkOiBgYW5pbWFsOiR7U3RyaW5nKGgubmV4dElkKyspLnBhZFN0YXJ0KDMsICcwJyl9YCwgc3BlY2llczogYS5zcGVjaWVzLCBzZXg6IHJuZChoKSA8IDAuNSA/ICdmJyA6ICdtJyxcbiAgICAgICAgICBib3JuOiB0aWNrLCB4OiBhLngsIHo6IGEueiwgdHg6IGEueCwgdHo6IGEueiwgaHVuZ2VyOiAyMCwgc3RhcnZpbmc6IDAsIHByb2R1Y3Q6IDAsIHByZWduYW50VW50aWw6IDAgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChhLnNleCA9PT0gJ2YnICYmIGFkdWx0ICYmIGEucHJlZ25hbnRVbnRpbCA9PT0gMCAmJiBhLmh1bmdlciA8IDUwXG4gICAgICAmJiBoZXJkLmxlbmd0aCA8IChmYWMuY2FwYWNpdHkgPz8gMClcbiAgICAgICYmIGhlcmQuc29tZSgobykgPT4gby5zcGVjaWVzID09PSBhLnNwZWNpZXMgJiYgby5zZXggPT09ICdtJyAmJiB0aWNrIC0gby5ib3JuID49IHJ1bGUuYWR1bHRBZ2UpXG4gICAgICAmJiBybmQoaCkgPCAxIC8gNDAwKSB7XG4gICAgICBhLnByZWduYW50VW50aWwgPSB0aWNrICsgcnVsZS5nZXN0YXRpb247XG4gICAgfVxuICB9XG4gIGlmIChkZWFkLnNpemUpIGguYW5pbWFscyA9IGguYW5pbWFscy5maWx0ZXIoKGEpID0+ICFkZWFkLmhhcyhhLmlkKSk7XG4gIGlmIChiaXJ0aHMubGVuZ3RoKSBoLmFuaW1hbHMgPSBbLi4uaC5hbmltYWxzLCAuLi5iaXJ0aHNdLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIC8vIFBhc3R1cmUgcmVncm93czsgaXQgbmV2ZXIgZXhjZWVkcyBpdHMgbWF4aW11bS5cbiAgLy8gUGFzdHVyZSByZWdyb3dzIGluIHByb3BvcnRpb24gdG8gaXRzIGFyZWEgKG9uZSB1bml0IHBlciA0MCBtXHUwMEIyIHBlciB0aWNrKS5cbiAgZm9yIChjb25zdCBlIG9mIGguZW5jbG9zdXJlcykge1xuICAgIGNvbnN0IHIgPSBmYWNpbGl0eShoLCBlLmlkKSEucmVjdDtcbiAgICBjb25zdCByZWdyb3cgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKCgoci54MSAtIHIueDApICogKHIuejEgLSByLnowKSkgLyAoNDAgKiBETSAqIERNKSkpO1xuICAgIGUuZ3Jhc3MgPSBNYXRoLm1pbihHUkFTU19NQVgsIGUuZ3Jhc3MgKyByZWdyb3cpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gY3JvcHMgLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBzdGVwUGxvdHMoaDogSG9tZXN0ZWFkU3RhdGUsIHRpY2s6IG51bWJlciwgZXY6IEV2ZW50cyk6IHZvaWQge1xuICAvLyBDcm9wcyBuZWl0aGVyIGdyb3cgbm9yIGRyeSBvdXQgb3Zlcm5pZ2h0LlxuICBpZiAoaXNOaWdodCh0aWNrKSkgcmV0dXJuO1xuICBmb3IgKGNvbnN0IHAgb2YgaC5wbG90cykge1xuICAgIGlmIChwLnN0YXRlICE9PSAnZ3Jvd2luZycpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHJ1bGUgPSBDUk9QX1JVTEVTW3AuY3JvcF07XG4gICAgaWYgKHAubW9pc3R1cmUgPiAwKSB7XG4gICAgICBwLmdyb3d0aCsrO1xuICAgICAgcC5kcnkgPSAwO1xuICAgICAgaWYgKHRpY2sgJSBydWxlLmRyYWluRXZlcnkgPT09IDApIHAubW9pc3R1cmUtLTtcbiAgICAgIGlmIChwLmdyb3d0aCA+PSBydWxlLmdyb3dUaWNrcykgcC5zdGF0ZSA9ICdyaXBlJztcbiAgICB9IGVsc2UgaWYgKHAuZ3Jvd3RoID09PSAwKSB7XG4gICAgICAvLyBTZWVkIGluIGRyeSBzb2lsIGxpZXMgZG9ybWFudCB1bnRpbCBpdCBpcyB3YXRlcmVkOyBvbmx5IHNwcm91dGVkIGNyb3BzIHdpdGhlci5cbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAoKytwLmRyeSA+PSBXSVRIRVJfVElDS1MpIHtcbiAgICAgIC8vIEEgY3JvcCBsZWZ0IGRyeSB3aXRoZXJzOiB0aGUgc2VlZCBpcyBsb3N0IGFuZCB0aGUgcGxvdCBtdXN0IGJlIHNvd24gYWdhaW4uXG4gICAgICBPYmplY3QuYXNzaWduKHAsIHsgc3RhdGU6ICd0aWxsZWQnLCBncm93dGg6IDAsIGRyeTogMCB9KTtcbiAgICAgIGV2LmxvZy5wdXNoKGB0aGUgJHtydWxlLmxhYmVsLnRvTG93ZXJDYXNlKCl9IHdpdGhlcmVkIGZvciBsYWNrIG9mIHdhdGVyYCk7XG4gICAgfVxuICB9XG59XG5cbi8qKiBNZXNzYWdlcyBmcm9tIHRoZSBsYXRlc3QgdGlja3MgZm9yIHRoZSBIVUQuIFByZXNlbnRhdGlvbiBvbmx5OiBuZXZlciBzYXZlZCBvciBoYXNoZWQuICovXG5leHBvcnQgY29uc3QgcmVjZW50SG9tZXN0ZWFkRXZlbnRzID0gbmV3IFdlYWtNYXA8V29ybGQsIHN0cmluZ1tdPigpO1xuXG4vKiogT25lIGhvbWVzdGVhZCB0aWNrLiBDYWxsZWQgYnkgdGhlIGpvdXJuYWxlZCBgdGlja2AgY29tbWFuZCBhZnRlciBqb2JzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0ZXBIb21lc3RlYWQod29ybGQ6IFdvcmxkLCB0aWNrOiBudW1iZXIpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGggPSB3b3JsZC5ob21lc3RlYWQ7XG4gIGlmICghaCkgcmV0dXJuIFtdO1xuICBjb25zdCBldjogRXZlbnRzID0geyBsb2c6IFtdIH07XG4gIHNwb2lsKHdvcmxkLCBoLCB0aWNrKTtcbiAgc3RlcFBsb3RzKGgsIHRpY2ssIGV2KTtcbiAgc3RlcEFuaW1hbHMoaCwgdGljayk7XG4gIGNvbnN0IHQwID0gaXNOYXZIb21lc3RlYWQoaCkgPyBwZXJmb3JtYW5jZS5ub3coKSA6IDA7XG4gIGNvbnN0IGJ1ZGdldCA9IHsgbGVmdDogTkFWX1RJQ0tfQlVER0VUIH07XG4gIGZvciAoY29uc3QgdiBvZiBbLi4uaC52aWxsYWdlcnNdLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkpIHN0ZXBWaWxsYWdlcih3b3JsZCwgaCwgdiwgdGljaywgZXYsIGJ1ZGdldCk7XG4gIGlmIChpc05hdkhvbWVzdGVhZChoKSkge1xuICAgIC8vIFByZXNlbnRhdGlvbi1vbmx5IHRpbWluZyAobmV2ZXIgc2F2ZWQpOiB2aWxsYWdlciBzdGVwcGluZyBpbmNsdWRpbmcgbmF2aWdhdGlvbiwgcGVyIHRpY2suXG4gICAgY29uc3Qgc3QgPSBuYXZTdGF0cyh3b3JsZCksIG1zID0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgICBzdC50aWNrcysrOyBzdC50aWNrTXMgKz0gbXM7IHN0Lmxhc3RUaWNrTXMgPSBtczsgc3QubWF4VGlja01zID0gTWF0aC5tYXgoc3QubWF4VGlja01zLCBtcyk7XG4gIH1cbiAgaWYgKGV2LmxvZy5sZW5ndGgpIHJlY2VudEhvbWVzdGVhZEV2ZW50cy5zZXQod29ybGQsIFsuLi4ocmVjZW50SG9tZXN0ZWFkRXZlbnRzLmdldCh3b3JsZCkgPz8gW10pLCAuLi5ldi5sb2ddLnNsaWNlKC04KSk7XG4gIHJldHVybiBldi5sb2c7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcm9wU3RhZ2UocDogUGxvdCk6IDAgfCAxIHwgMiB8IDMgfCA0IHtcbiAgaWYgKHAuc3RhdGUgPT09ICdyaXBlJykgcmV0dXJuIDQ7XG4gIGlmIChwLnN0YXRlICE9PSAnZ3Jvd2luZycpIHJldHVybiAwO1xuICByZXR1cm4gTWF0aC5taW4oMywgMSArIE1hdGguZmxvb3IoKHAuZ3Jvd3RoIC8gQ1JPUF9SVUxFU1twLmNyb3BdLmdyb3dUaWNrcykgKiAzKSkgYXMgMSB8IDIgfCAzO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBsYXllciBhY3Rpb25zIC0tLS0tLS0tLS1cblxuZXhwb3J0IHR5cGUgSG9tZXN0ZWFkQWN0aW9uID1cbiAgfCAnZHJhd193YXRlcicgfCAndGlsbCcgfCAnc293JyB8ICd3YXRlcicgfCAncmVhcCcgfCAnZmVlZCcgfCAnd2F0ZXJfdHJvdWdoJyB8ICdjb2xsZWN0X2VnZ3MnIHwgJ3NoZWFyJyB8ICdtaWxrJztcbmV4cG9ydCBjb25zdCBIT01FU1RFQURfQUNUSU9OUzogcmVhZG9ubHkgSG9tZXN0ZWFkQWN0aW9uW10gPSBbXG4gICdjb2xsZWN0X2VnZ3MnLCAnZHJhd193YXRlcicsICdmZWVkJywgJ21pbGsnLCAncmVhcCcsICdzaGVhcicsICdzb3cnLCAndGlsbCcsICd3YXRlcicsICd3YXRlcl90cm91Z2gnLFxuXTtcbmV4cG9ydCBpbnRlcmZhY2UgQWN0UmVzdWx0IHsgYWN0aW9uOiBIb21lc3RlYWRBY3Rpb247IHRhcmdldDogc3RyaW5nOyBzcGVudDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjsgZ2FpbmVkOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IH1cblxuY29uc3QgZmFpbCA9IChjb2RlOiBzdHJpbmcsIHJlYXNvbjogc3RyaW5nKSA9PiAoeyBvazogZmFsc2UgYXMgY29uc3QsIGNvZGUsIHJlYXNvbnM6IFtyZWFzb25dIH0pO1xuXG4vKipcbiAqIFRoZSBwbGF5ZXIgd29ya3MgdGhlIGhvbWVzdGVhZCBkaXJlY3RseSB3aXRoIHRoZWlyIG93biBjYXJyaWVkIGJhZy4gRWFjaFxuICogYWN0aW9uIGRvZXMgb25lIHVuaXQgb2Ygd29yayBpbW1lZGlhdGVseTsgdmlsbGFnZXJzIGRvIHRoZSBzYW1lIHdvcmsgb3ZlclxuICogc2V2ZXJhbCB0aWNrcy4gUmVxdWlyZW1lbnRzIGFuZCByZXNvdXJjZSBmbG93cyBhcmUgaWRlbnRpY2FsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaG9tZXN0ZWFkQWN0KHdvcmxkOiBXb3JsZCwgYWN0aW9uOiBIb21lc3RlYWRBY3Rpb24sIHRhcmdldDogc3RyaW5nKTogTGlmZVJlc3VsdDxBY3RSZXN1bHQ+IHtcbiAgY29uc3QgaCA9IHdvcmxkLmhvbWVzdGVhZDtcbiAgaWYgKCFoKSByZXR1cm4gZmFpbCgnbm9faG9tZXN0ZWFkJywgJ2ZvdW5kIHRoZSBob21lc3RlYWQgZmlyc3QnKTtcbiAgY29uc3QgYmFnID0gd29ybGQuaW52ZW50b3J5O1xuICBjb25zdCBzcGVudDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9LCBnYWluZWQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgY29uc3QgZ2FpbiA9IChpdGVtOiBzdHJpbmcsIGFtb3VudDogbnVtYmVyKSA9PiB7XG4gICAgaWYgKHRvdGFsKGJhZykgKyBhbW91bnQgPiBDQVJSSUVEX0NBUEFDSVRZKSByZXR1cm4gZmFsc2U7XG4gICAgYmFnW2l0ZW1dID0gKGJhZ1tpdGVtXSA/PyAwKSArIGFtb3VudDsgZ2FpbmVkW2l0ZW1dID0gKGdhaW5lZFtpdGVtXSA/PyAwKSArIGFtb3VudDsgcmV0dXJuIHRydWU7XG4gIH07XG4gIGNvbnN0IHNwZW5kID0gKGl0ZW06IHN0cmluZywgYW1vdW50OiBudW1iZXIpID0+IHtcbiAgICBpZiAoKGJhZ1tpdGVtXSA/PyAwKSA8IGFtb3VudCkgcmV0dXJuIGZhbHNlO1xuICAgIGJhZ1tpdGVtXSAtPSBhbW91bnQ7IGlmIChiYWdbaXRlbV0gPT09IDApIGRlbGV0ZSBiYWdbaXRlbV07IHNwZW50W2l0ZW1dID0gKHNwZW50W2l0ZW1dID8/IDApICsgYW1vdW50OyByZXR1cm4gdHJ1ZTtcbiAgfTtcbiAgY29uc3QgcGxvdCA9IGgucGxvdHMuZmluZCgocCkgPT4gcC5pZCA9PT0gdGFyZ2V0KTtcbiAgY29uc3QgZW5jbCA9IGguZW5jbG9zdXJlcy5maW5kKChlKSA9PiBlLmlkID09PSB0YXJnZXQpO1xuICBjb25zdCBhbmltYWwgPSBoLmFuaW1hbHMuZmluZCgoYSkgPT4gYS5pZCA9PT0gdGFyZ2V0KTtcbiAgY29uc3QgYnVzeSA9IGgudmlsbGFnZXJzLnNvbWUoKHYpID0+IHYudGFzaz8udGFyZ2V0ID09PSB0YXJnZXQgfHwgdi50YXNrPy50YXJnZXQgPT09IGB3YXRlcjoke3RhcmdldH1gIHx8IHYudGFzaz8udGFyZ2V0ID09PSBgZmVlZDoke3RhcmdldH1gKTtcbiAgaWYgKGJ1c3kgJiYgYWN0aW9uICE9PSAnZHJhd193YXRlcicpIHJldHVybiBmYWlsKCdidXN5JywgJ2EgdmlsbGFnZXIgaXMgYWxyZWFkeSB3b3JraW5nIG9uIHRoYXQnKTtcbiAgc3dpdGNoIChhY3Rpb24pIHtcbiAgICBjYXNlICdkcmF3X3dhdGVyJzpcbiAgICAgIGlmICh0YXJnZXQgIT09ICd3ZWxsJykgcmV0dXJuIGZhaWwoJ2ludmFsaWRfdGFyZ2V0JywgJ2RyYXcgd2F0ZXIgYXQgdGhlIHdlbGwnKTtcbiAgICAgIGlmICgoYmFnLndhdGVyID8/IDApID49IDMpIHJldHVybiBmYWlsKCdmdWxsJywgJ3lvdSBjYW4gY2FycnkgYXQgbW9zdCAzIGJ1Y2tldHMnKTtcbiAgICAgIGlmICghZ2Fpbignd2F0ZXInLCAxKSkgcmV0dXJuIGZhaWwoJ2NhcGFjaXR5X2V4Y2VlZGVkJywgJ3lvdXIgYmFnIGlzIGZ1bGwnKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RpbGwnOiB7XG4gICAgICBpZiAoIXBsb3QgfHwgcGxvdC5zdGF0ZSAhPT0gJ3dpbGQnKSByZXR1cm4gZmFpbCgnaW52YWxpZF90YXJnZXQnLCAnb25seSBhbiB1bmR1ZyBmaWVsZCBjYW4gYmUgZHVnIG92ZXInKTtcbiAgICAgIGNvbnN0IG5lZWQgPSBUSUxMX1BFUl9VTklUICogdW5pdHNPZihwbG90KTtcbiAgICAgIHBsb3QudGlsbGVkID0gTWF0aC5taW4obmVlZCwgcGxvdC50aWxsZWQgKyAzKTtcbiAgICAgIGlmIChwbG90LnRpbGxlZCA+PSBuZWVkKSB7IHBsb3Quc3RhdGUgPSAndGlsbGVkJzsgcGxvdC50aWxsZWQgPSAwOyB9XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnc293Jzoge1xuICAgICAgaWYgKCFwbG90IHx8IHBsb3Quc3RhdGUgIT09ICd0aWxsZWQnKSByZXR1cm4gZmFpbCgnaW52YWxpZF90YXJnZXQnLCAnc293IGludG8gYSBkdWcgZmllbGQnKTtcbiAgICAgIGNvbnN0IG4gPSB1bml0c09mKHBsb3QpO1xuICAgICAgaWYgKCFzcGVuZCgnc2VlZCcsIG4pKSByZXR1cm4gZmFpbCgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsIGB0aGlzIGZpZWxkIG5lZWRzICR7bn0gc2VlZCAoMSBwZXIgOSBtXHUwMEIyKTsgeW91IGhhdmUgJHtiYWcuc2VlZCA/PyAwfWApO1xuICAgICAgT2JqZWN0LmFzc2lnbihwbG90LCB7IHN0YXRlOiAnZ3Jvd2luZycsIGdyb3d0aDogMCwgbW9pc3R1cmU6IDAsIGRyeTogMCB9KTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICd3YXRlcic6XG4gICAgICBpZiAoIXBsb3QgfHwgKHBsb3Quc3RhdGUgIT09ICdncm93aW5nJyAmJiBwbG90LnN0YXRlICE9PSAndGlsbGVkJykpIHJldHVybiBmYWlsKCdpbnZhbGlkX3RhcmdldCcsICd3YXRlciBhIGR1ZyBvciBncm93aW5nIGZpZWxkJyk7XG4gICAgICBpZiAocGxvdC5tb2lzdHVyZSA+PSBNT0lTVFVSRV9NQVgpIHJldHVybiBmYWlsKCdmdWxsJywgJ3RoZSBzb2lsIGlzIGFscmVhZHkgd2V0Jyk7XG4gICAgICBpZiAoIXNwZW5kKCd3YXRlcicsIDEpKSByZXR1cm4gZmFpbCgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsICdkcmF3IGEgYnVja2V0IGF0IHRoZSB3ZWxsIGZpcnN0Jyk7XG4gICAgICAvLyBBIGJ1Y2tldCBzb2FrcyBvbmUgOSBtXHUwMEIyIHVuaXQ6IGEgYmlnIGZpZWxkIHRha2VzIHNldmVyYWwuXG4gICAgICBwbG90Lm1vaXN0dXJlID0gTWF0aC5taW4oTU9JU1RVUkVfTUFYLCBwbG90Lm1vaXN0dXJlICsgTWF0aC5jZWlsKE1PSVNUVVJFX01BWCAvIHVuaXRzT2YocGxvdCkpKTsgcGxvdC5kcnkgPSAwO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAncmVhcCc6IHtcbiAgICAgIGlmICghcGxvdCB8fCBwbG90LnN0YXRlICE9PSAncmlwZScpIHJldHVybiBmYWlsKCdpbnZhbGlkX3RhcmdldCcsICd0aGUgY3JvcCBpcyBub3QgcmlwZScpO1xuICAgICAgY29uc3QgcGFydHMgPSBPYmplY3QuZW50cmllcyhDUk9QX1JVTEVTW3Bsb3QuY3JvcF0ueWllbGQpLm1hcCgoW2ssIG5dKSA9PiBbaywgbiAqIHVuaXRzT2YocGxvdCldIGFzIGNvbnN0KTtcbiAgICAgIGlmICh0b3RhbChiYWcpICsgcGFydHMucmVkdWNlKChuLCBbLCBhXSkgPT4gbiArIGEsIDApID4gQ0FSUklFRF9DQVBBQ0lUWSkgcmV0dXJuIGZhaWwoJ2NhcGFjaXR5X2V4Y2VlZGVkJywgJ3lvdXIgYmFnIGlzIHRvbyBmdWxsIGZvciB0aGlzIGhhcnZlc3QnKTtcbiAgICAgIGZvciAoY29uc3QgW2l0ZW0sIGFtb3VudF0gb2YgcGFydHMpIGdhaW4oaXRlbSwgYW1vdW50KTtcbiAgICAgIE9iamVjdC5hc3NpZ24ocGxvdCwgeyBzdGF0ZTogJ3RpbGxlZCcsIGdyb3d0aDogMCwgbW9pc3R1cmU6IE1hdGgubWF4KDAsIHBsb3QubW9pc3R1cmUgLSA0KSwgZHJ5OiAwIH0pO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ2ZlZWQnOiB7XG4gICAgICBpZiAoIWVuY2wpIHJldHVybiBmYWlsKCdpbnZhbGlkX3RhcmdldCcsICdmZWVkIGEgdHJvdWdoJyk7XG4gICAgICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihiYWcuZmliZXIgPz8gMCwgNiwgVFJPVUdIX01BWCAtIGVuY2wuZmVlZCk7XG4gICAgICBpZiAoYW1vdW50IDw9IDApIHJldHVybiBmYWlsKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgKGJhZy5maWJlciA/PyAwKSA8PSAwID8gJ3lvdSBuZWVkIGZpYmVyIChzdHJhdykgaW4geW91ciBiYWcnIDogJ3RoZSB0cm91Z2ggaXMgZnVsbCcpO1xuICAgICAgc3BlbmQoJ2ZpYmVyJywgYW1vdW50KTsgZW5jbC5mZWVkICs9IGFtb3VudDtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICd3YXRlcl90cm91Z2gnOlxuICAgICAgaWYgKCFlbmNsKSByZXR1cm4gZmFpbCgnaW52YWxpZF90YXJnZXQnLCAnd2F0ZXIgYSB0cm91Z2gnKTtcbiAgICAgIGlmIChlbmNsLndhdGVyID49IFRST1VHSF9NQVgpIHJldHVybiBmYWlsKCdmdWxsJywgJ3RoZSB0cm91Z2ggaXMgZnVsbCcpO1xuICAgICAgaWYgKCFzcGVuZCgnd2F0ZXInLCAxKSkgcmV0dXJuIGZhaWwoJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLCAnZHJhdyBhIGJ1Y2tldCBhdCB0aGUgd2VsbCBmaXJzdCcpO1xuICAgICAgZW5jbC53YXRlciA9IE1hdGgubWluKFRST1VHSF9NQVgsIGVuY2wud2F0ZXIgKyBCVUNLRVQpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnY29sbGVjdF9lZ2dzJzoge1xuICAgICAgY29uc3QgY29vcCA9IGguZW5jbG9zdXJlcy5maW5kKChlKSA9PiBlLmlkID09PSAnY29vcCcpO1xuICAgICAgaWYgKHRhcmdldCAhPT0gJ2Nvb3AnIHx8ICFjb29wIHx8IGNvb3AuZWdncyA8PSAwKSByZXR1cm4gZmFpbCgnaW52YWxpZF90YXJnZXQnLCAndGhlcmUgYXJlIG5vIGVnZ3MgaW4gdGhlIGNvb3AnKTtcbiAgICAgIGlmICghZ2FpbignZWdncycsIGNvb3AuZWdncykpIHJldHVybiBmYWlsKCdjYXBhY2l0eV9leGNlZWRlZCcsICd5b3VyIGJhZyBpcyBmdWxsJyk7XG4gICAgICBjb29wLmVnZ3MgPSAwO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ3NoZWFyJzogY2FzZSAnbWlsayc6IHtcbiAgICAgIGNvbnN0IHAgPSBhbmltYWwgJiYgU1BFQ0lFU19SVUxFU1thbmltYWwuc3BlY2llc10ucHJvZHVjdDtcbiAgICAgIGlmICghYW5pbWFsIHx8ICFwIHx8IChhY3Rpb24gPT09ICdzaGVhcicpICE9PSAocC5yZXNvdXJjZSA9PT0gJ3dvb2wnKSB8fCBwLnJlc291cmNlID09PSAnZWdncycgfHwgYW5pbWFsLnByb2R1Y3QgPCBwLmV2ZXJ5KSB7XG4gICAgICAgIHJldHVybiBmYWlsKCdpbnZhbGlkX3RhcmdldCcsIGFjdGlvbiA9PT0gJ3NoZWFyJyA/ICdubyBzaGVlcCBpcyByZWFkeSB0byBzaGVhcicgOiAnbm8gYW5pbWFsIGlzIHJlYWR5IHRvIG1pbGsnKTtcbiAgICAgIH1cbiAgICAgIGlmICghZ2FpbihwLnJlc291cmNlLCBwLmFtb3VudCkpIHJldHVybiBmYWlsKCdjYXBhY2l0eV9leGNlZWRlZCcsICd5b3VyIGJhZyBpcyBmdWxsJyk7XG4gICAgICBhbmltYWwucHJvZHVjdCA9IDA7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IGFjdGlvbiwgdGFyZ2V0LCBzcGVudCwgZ2FpbmVkIH0gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBmaWVsZHMgdGhlIHBsYXllciBkZXNpZ25zIC0tLS0tLS0tLS1cblxuZXhwb3J0IGludGVyZmFjZSBGaWVsZFNwZWMgeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgdzogbnVtYmVyOyBkOiBudW1iZXI7IGNyb3A6IENyb3BLaW5kIH1cbmNvbnN0IG92ZXJsYXBzID0gKGE6IFJlY3QsIGI6IFJlY3QsIGdhcCA9IDApID0+IGEueDAgPCBiLngxICsgZ2FwICYmIGEueDEgKyBnYXAgPiBiLngwICYmIGEuejAgPCBiLnoxICsgZ2FwICYmIGEuejEgKyBnYXAgPiBiLnowO1xuXG4vKipcbiAqIENhbiBhIGZpZWxkIGdvIGhlcmU/IFJldHVybnMgZXZlcnkgcmVhc29uIGl0IGNhbm5vdCwgc28gdGhlIHBsYWNlbWVudFxuICogcHJldmlldyBjYW4gZXhwbGFpbiBpdHNlbGYuIERldGVybWluaXN0aWM6IHJlYWRzIG9ubHkgYXV0aG9yaXRhdGl2ZSBzdGF0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRmllbGQod29ybGQ6IFdvcmxkLCBzcGVjOiBGaWVsZFNwZWMsIGlnbm9yZUlkPzogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBoID0gd29ybGQuaG9tZXN0ZWFkO1xuICBpZiAoIWgpIHJldHVybiBbJ2ZvdW5kIHRoZSBob21lc3RlYWQgZmlyc3QnXTtcbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgeyB4LCB6LCB3LCBkIH0gPSBzcGVjO1xuICBpZiAoIVt4LCB6LCB3LCBkXS5ldmVyeShOdW1iZXIuaXNTYWZlSW50ZWdlcikpIHJldHVybiBbJ2ZpZWxkIGNvb3JkaW5hdGVzIG11c3QgYmUgd2hvbGUgbWV0cmVzJ107XG4gIGlmICh3IDwgRklFTERfTUlOIHx8IGQgPCBGSUVMRF9NSU4gfHwgdyA+IEZJRUxEX01BWCB8fCBkID4gRklFTERfTUFYKSByZXR1cm4gW2BmaWVsZHMgYXJlICR7RklFTERfTUlOfVx1MjAxMyR7RklFTERfTUFYfSBtIG9uIGVhY2ggc2lkZWBdO1xuICBpZiAoIUNST1BTLmluY2x1ZGVzKHNwZWMuY3JvcCkpIHJldHVybiBbJ3Vua25vd24gY3JvcCddO1xuICBjb25zdCBvdGhlcnMgPSBoLnBsb3RzLmZpbHRlcigocCkgPT4gcC5pZCAhPT0gaWdub3JlSWQpO1xuICBpZiAoIWlnbm9yZUlkICYmIG90aGVycy5sZW5ndGggPj0gTUFYX0ZJRUxEUykgcmVhc29ucy5wdXNoKGB0aGUgZmFybSBhbHJlYWR5IGhhcyAke01BWF9GSUVMRFN9IGZpZWxkc2ApO1xuICBpZiAob3RoZXJzLnJlZHVjZSgobiwgcCkgPT4gbiArIHAudyAqIHAuZCwgMCkgKyB3ICogZCA+IE1BWF9GSUVMRF9BUkVBKSByZWFzb25zLnB1c2goYHRvdGFsIGZpZWxkIGFyZWEgaXMgbGltaXRlZCB0byAke01BWF9GSUVMRF9BUkVBfSBtXHUwMEIyYCk7XG4gIGNvbnN0IGhvbWUgPSBmYWNpbGl0eShoLCAnZmFybWhvdXNlJykhLnVzZTtcbiAgaWYgKGxlbjIobSh4ICsgdyAvIDIpIC0gaG9tZS54LCBtKHogKyBkIC8gMikgLSBob21lLnopID4gRklFTERfUkFOR0UgKiBETSkgcmVhc29ucy5wdXNoKGB0b28gZmFyIGZyb20gdGhlIGZhcm1ob3VzZSAobWF4ICR7RklFTERfUkFOR0V9IG0pYCk7XG4gIGNvbnN0IHIgPSBmaWVsZFJlY3Qoc3BlYyk7XG4gIGlmIChob21lc3RlYWRMYXlvdXQoaCkuc29tZSgoZikgPT4gb3ZlcmxhcHMociwgZi5yZWN0LCBETSkpKSByZWFzb25zLnB1c2goJ3RvbyBjbG9zZSB0byBhIGJ1aWxkaW5nIG9yIHBlbicpO1xuICBpZiAob3RoZXJzLnNvbWUoKHApID0+IG92ZXJsYXBzKHIsIGZpZWxkUmVjdChwKSkpKSByZWFzb25zLnB1c2goJ292ZXJsYXBzIGFub3RoZXIgZmllbGQnKTtcbiAgaWYgKFJFU0VSVkVEX1NJVEVTLnNvbWUoKHEpID0+IG92ZXJsYXBzKHIsIHJlY3QocS54MCwgcS56MCwgcS54MSAtIHEueDAsIHEuejEgLSBxLnowKSkpKSByZWFzb25zLnB1c2goJ3RoZSBmb3VuZGVyIGhvdXNlIGFuZCB0ZXJyYWNlcyBhcmUgaGVyZScpO1xuICBjb25zdCBzeCA9IG0oRk9VTkRFUl9TVE9DS1BJTEUueCksIHN6ID0gbShGT1VOREVSX1NUT0NLUElMRS56KTtcbiAgaWYgKG92ZXJsYXBzKHIsIHsgeDA6IHN4IC0gMjUsIHowOiBzeiAtIDIwLCB4MTogc3ggKyAyNSwgejE6IHN6ICsgMzAgfSkpIHJlYXNvbnMucHVzaCgndGhlIHN0b3JlIGlzIGhlcmUnKTtcbiAgbGV0IGxvID0gSW5maW5pdHksIGhpID0gLUluZmluaXR5LCB3ZXQgPSBmYWxzZSwgcm9jayA9IGZhbHNlO1xuICBmb3IgKGxldCBjeiA9IHo7IGN6IDwgeiArIGQ7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IHg7IGN4IDwgeCArIHc7IGN4KyspIHtcbiAgICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIGN4LCBjeik7XG4gICAgICBsbyA9IE1hdGgubWluKGxvLCB5KTsgaGkgPSBNYXRoLm1heChoaSwgeSk7XG4gICAgICBpZiAod2F0ZXJEZXB0aEF0KHdvcmxkLCBjeCwgY3opID4gMCkgd2V0ID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHRvcCA9IGdldFZveGVsKHdvcmxkLCBjeCwgeSAtIDEsIGN6KTtcbiAgICAgIGlmICh0b3AgIT09IE1BVC5HUkFTUyAmJiB0b3AgIT09IE1BVC5TT0lMICYmIHRvcCAhPT0gTUFULk1PU1MpIHJvY2sgPSB0cnVlO1xuICAgIH1cbiAgfVxuICBpZiAod2V0KSByZWFzb25zLnB1c2goJ3RoZXJlIGlzIHdhdGVyIGhlcmUnKTtcbiAgaWYgKHJvY2spIHJlYXNvbnMucHVzaCgnY3JvcHMgbmVlZCBzb2lsLCBub3Qgc3RvbmUgb3Igc2FuZCcpO1xuICBpZiAoaGkgLSBsbyA+IDEpIHJlYXNvbnMucHVzaChgdGhlIGdyb3VuZCBpcyB0b28gc3RlZXAgKCR7aGkgLSBsb30gbSBvZiBzbG9wZTsgYXQgbW9zdCAxIG0pYCk7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChlLmhhcnZlc3RlZCB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkgfHwgZS5raW5kID09PSAnbWFya2VyJykgY29udGludWU7XG4gICAgaWYgKGUueCA+PSB4IC0gMC40ICYmIGUueCA8IHggKyB3ICsgMC40ICYmIGUueiA+PSB6IC0gMC40ICYmIGUueiA8IHogKyBkICsgMC40KSB7XG4gICAgICByZWFzb25zLnB1c2goZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpID8gJ2NsZWFyIHRoZSB0cmVlcyBmaXJzdCAoZ2F0aGVyIHRoZW0gZm9yIHdvb2QpJyA6ICdjbGVhciB0aGUgYnVzaGVzIGFuZCByb2NrcyBmaXJzdCAoZ2F0aGVyIHRoZW0pJyk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlYXNvbnM7XG59XG5cbi8qKiBNYXJrIG91dCBhIG5ldyBmaWVsZC4gVGhlIGZlbmNlIGlzIHBhaWQgaW4gd29vZDogZnJvbSB0aGUgcGxheWVyJ3MgYmFnLCBvciB0aGUgc3RvcmUgZm9yIHRoZSBzdGV3YXJkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtGaWVsZCh3b3JsZDogV29ybGQsIHNwZWM6IEZpZWxkU3BlYywgcGF5RnJvbTogJ2JhZycgfCAnc3RvcmUnKTogTGlmZVJlc3VsdDx7IGZpZWxkSWQ6IHN0cmluZzsgdW5pdHM6IG51bWJlcjsgd29vZDogbnVtYmVyIH0+IHtcbiAgY29uc3QgaCA9IHdvcmxkLmhvbWVzdGVhZDtcbiAgaWYgKCFoKSByZXR1cm4gZmFpbCgnbm9faG9tZXN0ZWFkJywgJ2ZvdW5kIHRoZSBob21lc3RlYWQgZmlyc3QnKTtcbiAgY29uc3QgcmVhc29ucyA9IGNoZWNrRmllbGQod29ybGQsIHNwZWMpO1xuICBpZiAocmVhc29ucy5sZW5ndGgpIHJldHVybiB7IG9rOiBmYWxzZSwgY29kZTogJ2ludmFsaWRfc2l0ZScsIHJlYXNvbnMgfTtcbiAgY29uc3Qgd29vZCA9IGZlbmNlQ29zdChzcGVjLncsIHNwZWMuZCk7XG4gIGNvbnN0IGJhZyA9IHBheUZyb20gPT09ICdiYWcnID8gd29ybGQuaW52ZW50b3J5IDogc3RvY2sod29ybGQpLmludmVudG9yeTtcbiAgaWYgKChiYWcud29vZCA/PyAwKSA8IHdvb2QpIHJldHVybiBmYWlsKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgYHRoZSBmZW5jZSBuZWVkcyAke3dvb2R9IHdvb2QgKHlvdSBoYXZlICR7YmFnLndvb2QgPz8gMH0pYCk7XG4gIHRha2VGcm9tKGJhZywgJ3dvb2QnLCB3b29kKTtcbiAgY29uc3QgaWQgPSBgZmllbGQ6JHtoLm5leHRJZCsrfWA7XG4gIGgucGxvdHMucHVzaCh7IGlkLCB4OiBzcGVjLngsIHo6IHNwZWMueiwgdzogc3BlYy53LCBkOiBzcGVjLmQsIGNyb3A6IHNwZWMuY3JvcCwgc3RhdGU6ICd3aWxkJywgZ3Jvd3RoOiAwLCBtb2lzdHVyZTogMCwgZHJ5OiAwLCB0aWxsZWQ6IDAgfSk7XG4gIGgucGxvdHMuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IGZpZWxkSWQ6IGlkLCB1bml0czogZmllbGRVbml0cyhzcGVjLncsIHNwZWMuZCksIHdvb2QgfSB9O1xufVxuXG4vKiogQ2hhbmdlIHdoYXQgYSBmaWVsZCB3aWxsIGdyb3cgbmV4dC4gQSBjcm9wIGFscmVhZHkgaW4gdGhlIGdyb3VuZCBpcyBrZXB0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldEZpZWxkQ3JvcCh3b3JsZDogV29ybGQsIGZpZWxkSWQ6IHN0cmluZywgY3JvcDogQ3JvcEtpbmQpOiBMaWZlUmVzdWx0PHsgZmllbGRJZDogc3RyaW5nOyBjcm9wOiBDcm9wS2luZCB9PiB7XG4gIGNvbnN0IGggPSB3b3JsZC5ob21lc3RlYWQ7XG4gIGNvbnN0IHAgPSBoPy5wbG90cy5maW5kKChxKSA9PiBxLmlkID09PSBmaWVsZElkKTtcbiAgaWYgKCFoIHx8ICFwKSByZXR1cm4gZmFpbCgnaW52YWxpZF90YXJnZXQnLCAnbm8gc3VjaCBmaWVsZCcpO1xuICBpZiAoIUNST1BTLmluY2x1ZGVzKGNyb3ApKSByZXR1cm4gZmFpbCgnaW52YWxpZF9jcm9wJywgJ3Vua25vd24gY3JvcCcpO1xuICBpZiAocC5zdGF0ZSA9PT0gJ2dyb3dpbmcnIHx8IHAuc3RhdGUgPT09ICdyaXBlJykgcmV0dXJuIGZhaWwoJ2J1c3knLCAnaGFydmVzdCB0aGUgY3VycmVudCBjcm9wIGZpcnN0Jyk7XG4gIGlmIChwLmNyb3AgPT09IGNyb3ApIHJldHVybiBmYWlsKCd1bmNoYW5nZWQnLCBgdGhlIGZpZWxkIGlzIGFscmVhZHkgc2V0IHRvICR7Q1JPUF9SVUxFU1tjcm9wXS5sYWJlbC50b0xvd2VyQ2FzZSgpfWApO1xuICBwLmNyb3AgPSBjcm9wO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgZmllbGRJZCwgY3JvcCB9IH07XG59XG5cbi8qKiBUYWtlIGEgZmllbGQgb3V0IG9mIHVzZTsgYW55dGhpbmcgZ3Jvd2luZyBpbiBpdCBpcyBsb3N0IGFuZCB0aGUgZmVuY2UgaXMgbm90IHJlZnVuZGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZpZWxkKHdvcmxkOiBXb3JsZCwgZmllbGRJZDogc3RyaW5nKTogTGlmZVJlc3VsdDx7IGZpZWxkSWQ6IHN0cmluZyB9PiB7XG4gIGNvbnN0IGggPSB3b3JsZC5ob21lc3RlYWQ7XG4gIGlmICghaCB8fCAhaC5wbG90cy5zb21lKChxKSA9PiBxLmlkID09PSBmaWVsZElkKSkgcmV0dXJuIGZhaWwoJ2ludmFsaWRfdGFyZ2V0JywgJ25vIHN1Y2ggZmllbGQnKTtcbiAgaWYgKGgudmlsbGFnZXJzLnNvbWUoKHYpID0+IHYudGFzaz8udGFyZ2V0ID09PSBmaWVsZElkKSkgcmV0dXJuIGZhaWwoJ2J1c3knLCAnYSB2aWxsYWdlciBpcyB3b3JraW5nIHRoaXMgZmllbGQnKTtcbiAgaC5wbG90cyA9IGgucGxvdHMuZmlsdGVyKChxKSA9PiBxLmlkICE9PSBmaWVsZElkKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IGZpZWxkSWQgfSB9O1xufVxuXG4vKiogRGV0ZXJtaW5pc3RpYyBzZWFyY2ggZm9yIGEgZ29vZCBzcG90LCB1c2VkIGJ5IHRoZSBzdGV3YXJkIHdoZW4gaXQgcHJvcG9zZXMgYSBmaWVsZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kRmllbGRTcG90KHdvcmxkOiBXb3JsZCwgdyA9IDQsIGQgPSA0LCBjcm9wOiBDcm9wS2luZCA9ICd3aGVhdCcpOiBGaWVsZFNwZWMgfCBudWxsIHtcbiAgY29uc3QgaCA9IHdvcmxkLmhvbWVzdGVhZDtcbiAgaWYgKCFoKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgaG9tZSA9IGZhY2lsaXR5KGgsICdmYXJtaG91c2UnKSEudXNlO1xuICBjb25zdCBoeCA9IE1hdGgucm91bmQoaG9tZS54IC8gRE0pLCBoeiA9IE1hdGgucm91bmQoaG9tZS56IC8gRE0pO1xuICBmb3IgKGxldCByID0gNDsgciA8PSBGSUVMRF9SQU5HRSAtIDQ7IHIgKz0gMikge1xuICAgIGZvciAobGV0IGEgPSAwOyBhIDwgMTY7IGErKykge1xuICAgICAgY29uc3QgYW5nID0gKGEgLyAxNikgKiBNYXRoLlBJICogMjtcbiAgICAgIGNvbnN0IHNwZWMgPSB7IHg6IGh4ICsgTWF0aC5yb3VuZChNYXRoLmNvcyhhbmcpICogcikgLSBNYXRoLmZsb29yKHcgLyAyKSwgejogaHogKyBNYXRoLnJvdW5kKE1hdGguc2luKGFuZykgKiByKSAtIE1hdGguZmxvb3IoZCAvIDIpLCB3LCBkLCBjcm9wIH07XG4gICAgICBpZiAoY2hlY2tGaWVsZCh3b3JsZCwgc3BlYykubGVuZ3RoID09PSAwKSByZXR1cm4gc3BlYztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8qKiBUaGUgc3Rld2FyZCdzIHZlcnNpb24gb2YgYSBuZXcgZmllbGQ6IGEgNCB4IDQgd2hlYXQgZmllbGQgYXQgdGhlIGZpcnN0IGdvb2Qgc3BvdCwgZmVuY2VkIGZyb20gdGhlIHN0b3JlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4cGFuZEZpZWxkKHdvcmxkOiBXb3JsZCk6IExpZmVSZXN1bHQ8eyBwbG90SWQ6IHN0cmluZzsgd29vZDogbnVtYmVyIH0+IHtcbiAgY29uc3Qgc3BvdCA9IGZpbmRGaWVsZFNwb3Qod29ybGQpO1xuICBpZiAoIXNwb3QpIHJldHVybiBmYWlsKCdub19zaXRlJywgJ3RoZXJlIGlzIG5vIHN1aXRhYmxlIG9wZW4gZ3JvdW5kIG5lYXIgdGhlIGZhcm1ob3VzZScpO1xuICBjb25zdCByID0gbWFya0ZpZWxkKHdvcmxkLCBzcG90LCAnc3RvcmUnKTtcbiAgcmV0dXJuIHIub2sgPyB7IG9rOiB0cnVlLCB2YWx1ZTogeyBwbG90SWQ6IHIudmFsdWUuZmllbGRJZCwgd29vZDogci52YWx1ZS53b29kIH0gfSA6IHI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhc3NpZ25Sb2xlKHdvcmxkOiBXb3JsZCwgdmlsbGFnZXJJZDogc3RyaW5nLCByb2xlOiBSb2xlKTogTGlmZVJlc3VsdDx7IHZpbGxhZ2VySWQ6IHN0cmluZzsgcm9sZTogUm9sZSB9PiB7XG4gIGNvbnN0IGggPSB3b3JsZC5ob21lc3RlYWQ7XG4gIGlmICghaCkgcmV0dXJuIGZhaWwoJ25vX2hvbWVzdGVhZCcsICdmb3VuZCB0aGUgaG9tZXN0ZWFkIGZpcnN0Jyk7XG4gIGNvbnN0IHYgPSBoLnZpbGxhZ2Vycy5maW5kKCh4KSA9PiB4LmlkID09PSB2aWxsYWdlcklkKTtcbiAgaWYgKCF2KSByZXR1cm4gZmFpbCgnaW52YWxpZF90YXJnZXQnLCAndW5rbm93biB2aWxsYWdlcicpO1xuICBpZiAodi5yb2xlID09PSByb2xlKSByZXR1cm4gZmFpbCgndW5jaGFuZ2VkJywgYCR7di5uYW1lfSBpcyBhbHJlYWR5IGEgJHtyb2xlfWApO1xuICB2LnJvbGUgPSByb2xlO1xuICAvLyBUaGUgY3VycmVudCBlcnJhbmQgaXMgZHJvcHBlZCAoaXRzIGNsYWltIHJlbGVhc2VkKTsgd2hhdGV2ZXIgaXMgY2FycmllZCBpcyBrZXB0IGFuZCBzdG9yZWQgbmV4dC5cbiAgaWYgKHYudGFzayAmJiB2LnRhc2sua2luZCAhPT0gJ3Jlc3QnKSB2LnRhc2sgPSBudWxsO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgdmlsbGFnZXJJZCwgcm9sZSB9IH07XG59XG5cbi8qKiBBY3Rpb25zIHRoZSBwbGF5ZXIgY291bGQgdGFrZSBuZWFyICh4LCB6KSBtZXRyZXMsIG5lYXJlc3QgZmlyc3QuIFByZXNlbnRhdGlvbiBoZWxwZXI7IHRoZSBjb21tYW5kIHZhbGlkYXRlcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBuZWFyYnlBY3Rpb25zKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJlYWNoID0gMy4yKTogQXJyYXk8eyBhY3Rpb246IEhvbWVzdGVhZEFjdGlvbjsgdGFyZ2V0OiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGQ6IG51bWJlciB9PiB7XG4gIGNvbnN0IGggPSB3b3JsZC5ob21lc3RlYWQ7XG4gIGlmICghaCkgcmV0dXJuIFtdO1xuICBjb25zdCBiYWcgPSB3b3JsZC5pbnZlbnRvcnk7XG4gIGNvbnN0IG91dDogQXJyYXk8eyBhY3Rpb246IEhvbWVzdGVhZEFjdGlvbjsgdGFyZ2V0OiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGQ6IG51bWJlciB9PiA9IFtdO1xuICBjb25zdCBkaXN0ID0gKHI6IFJlY3QpID0+IHtcbiAgICBjb25zdCBjeCA9IE1hdGgubWF4KHIueDAsIE1hdGgubWluKHggKiBETSwgci54MSkpLCBjeiA9IE1hdGgubWF4KHIuejAsIE1hdGgubWluKHogKiBETSwgci56MSkpO1xuICAgIHJldHVybiBsZW4yKHggKiBETSAtIGN4LCB6ICogRE0gLSBjeikgLyBETTtcbiAgfTtcbiAgZm9yIChjb25zdCBwIG9mIGgucGxvdHMpIHtcbiAgICBjb25zdCByID0gZmllbGRSZWN0KHApLCBkID0gZGlzdChyKTtcbiAgICBpZiAoZCA+IHJlYWNoKSBjb250aW51ZTtcbiAgICBjb25zdCBjcm9wID0gQ1JPUF9SVUxFU1twLmNyb3BdLmxhYmVsLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHAuc3RhdGUgPT09ICd3aWxkJykgb3V0LnB1c2goeyBhY3Rpb246ICd0aWxsJywgdGFyZ2V0OiBwLmlkLCBsYWJlbDogYERpZyB0aGUgJHtjcm9wfSBmaWVsZGAsIGQgfSk7XG4gICAgZWxzZSBpZiAocC5zdGF0ZSA9PT0gJ3RpbGxlZCcgJiYgKGJhZy5zZWVkID8/IDApID49IHVuaXRzT2YocCkpIG91dC5wdXNoKHsgYWN0aW9uOiAnc293JywgdGFyZ2V0OiBwLmlkLCBsYWJlbDogYFNvdyAke2Nyb3B9ICgke3VuaXRzT2YocCl9IHNlZWQpYCwgZCB9KTtcbiAgICBlbHNlIGlmIChwLnN0YXRlID09PSAncmlwZScpIG91dC5wdXNoKHsgYWN0aW9uOiAncmVhcCcsIHRhcmdldDogcC5pZCwgbGFiZWw6IGBIYXJ2ZXN0ICR7Y3JvcH1gLCBkIH0pO1xuICAgIGlmICgocC5zdGF0ZSA9PT0gJ2dyb3dpbmcnIHx8IHAuc3RhdGUgPT09ICd0aWxsZWQnKSAmJiBwLm1vaXN0dXJlIDwgTU9JU1RVUkVfTUFYIC0gMiAmJiAoYmFnLndhdGVyID8/IDApID4gMCkge1xuICAgICAgb3V0LnB1c2goeyBhY3Rpb246ICd3YXRlcicsIHRhcmdldDogcC5pZCwgbGFiZWw6IGBXYXRlciB0aGUgJHtjcm9wfWAsIGQ6IGQgKyAwLjAxIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IGYgb2YgaG9tZXN0ZWFkTGF5b3V0KGgpKSB7XG4gICAgY29uc3QgZCA9IGYua2luZCA9PT0gJ3dlbGwnID8gZGlzdChmLnJlY3QpIDogZi50cm91Z2ggPyBsZW4yKHggKiBETSAtIGYudHJvdWdoLngsIHogKiBETSAtIGYudHJvdWdoLnopIC8gRE0gLSAwLjggOiBkaXN0KGYucmVjdCk7XG4gICAgaWYgKGYua2luZCA9PT0gJ3dlbGwnICYmIGQgPD0gcmVhY2ggJiYgKGJhZy53YXRlciA/PyAwKSA8IDMpIG91dC5wdXNoKHsgYWN0aW9uOiAnZHJhd193YXRlcicsIHRhcmdldDogJ3dlbGwnLCBsYWJlbDogJ0RyYXcgd2F0ZXInLCBkIH0pO1xuICAgIGNvbnN0IGUgPSBoLmVuY2xvc3VyZXMuZmluZCgocSkgPT4gcS5pZCA9PT0gZi5pZCk7XG4gICAgaWYgKGUgJiYgZi50cm91Z2ggJiYgZCA8PSByZWFjaCkge1xuICAgICAgaWYgKChiYWcud2F0ZXIgPz8gMCkgPiAwICYmIGUud2F0ZXIgPCBUUk9VR0hfTUFYKSBvdXQucHVzaCh7IGFjdGlvbjogJ3dhdGVyX3Ryb3VnaCcsIHRhcmdldDogZS5pZCwgbGFiZWw6ICdGaWxsIHdhdGVyJywgZCB9KTtcbiAgICAgIGlmICgoYmFnLmZpYmVyID8/IDApID4gMCAmJiBlLmZlZWQgPCBUUk9VR0hfTUFYKSBvdXQucHVzaCh7IGFjdGlvbjogJ2ZlZWQnLCB0YXJnZXQ6IGUuaWQsIGxhYmVsOiAnQWRkIGZlZWQnLCBkOiBkICsgMC4wMSB9KTtcbiAgICB9XG4gICAgaWYgKGUgJiYgZS5pZCA9PT0gJ2Nvb3AnICYmIGUuZWdncyA+IDAgJiYgZGlzdChmLnJlY3QpIDw9IHJlYWNoKSBvdXQucHVzaCh7IGFjdGlvbjogJ2NvbGxlY3RfZWdncycsIHRhcmdldDogJ2Nvb3AnLCBsYWJlbDogYENvbGxlY3QgJHtlLmVnZ3N9IGVnZ3NgLCBkOiBkaXN0KGYucmVjdCkgfSk7XG4gIH1cbiAgZm9yIChjb25zdCBhIG9mIGguYW5pbWFscykge1xuICAgIGNvbnN0IHAgPSBTUEVDSUVTX1JVTEVTW2Euc3BlY2llc10ucHJvZHVjdDtcbiAgICBpZiAoIXAgfHwgcC5yZXNvdXJjZSA9PT0gJ2VnZ3MnIHx8IGEucHJvZHVjdCA8IHAuZXZlcnkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSBsZW4yKHggKiBETSAtIGEueCwgeiAqIERNIC0gYS56KSAvIERNO1xuICAgIGlmIChkIDw9IHJlYWNoKSBvdXQucHVzaCh7IGFjdGlvbjogcC5yZXNvdXJjZSA9PT0gJ3dvb2wnID8gJ3NoZWFyJyA6ICdtaWxrJywgdGFyZ2V0OiBhLmlkLCBsYWJlbDogcC5yZXNvdXJjZSA9PT0gJ3dvb2wnID8gJ1NoZWFyIHNoZWVwJyA6IGBNaWxrICR7U1BFQ0lFU19SVUxFU1thLnNwZWNpZXNdLmxhYmVsLnRvTG93ZXJDYXNlKCl9YCwgZCB9KTtcbiAgfVxuICByZXR1cm4gb3V0LnNvcnQoKGEsIGIpID0+IGEuZCAtIGIuZCB8fCBhLmFjdGlvbi5sb2NhbGVDb21wYXJlKGIuYWN0aW9uKSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gc3Rld2FyZCBnb3Zlcm5hbmNlIC0tLS0tLS0tLS1cblxuZXhwb3J0IHR5cGUgQWN0b3IgPSAncGxheWVyJyB8ICdzdGV3YXJkJztcblxuLyoqIEdhdGUgZm9yIGFjdGlvbnMgdGhhdCB0aGUgc3Rld2FyZCBtYXkgdGFrZS4gVGhlIHBsYXllciAob3duZXIpIGlzIGFsd2F5cyBhbGxvd2VkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBlcm1pdHRlZChoOiBIb21lc3RlYWRTdGF0ZSwgYWN0b3I6IEFjdG9yLCBhY3Rpb246IFN0ZXdhcmRBY3Rpb24pOiBMaWZlUmVzdWx0PHRydWU+IHtcbiAgaWYgKGFjdG9yID09PSAncGxheWVyJykgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB0cnVlIH07XG4gIGlmICghaC5zdGV3YXJkLmVuYWJsZWQpIHJldHVybiBmYWlsKCdzdGV3YXJkX2Rpc2FibGVkJywgJ3RoZSBzdGV3YXJkIGlzIHN3aXRjaGVkIG9mZicpO1xuICBjb25zdCBwID0gaC5zdGV3YXJkLnBvbGljeVthY3Rpb25dO1xuICBpZiAocCA9PT0gJ29mZicpIHJldHVybiBmYWlsKCdub3RfcGVybWl0dGVkJywgYHRoZSBzdGV3YXJkIG1heSBub3QgJHthY3Rpb24ucmVwbGFjZSgnXycsICcgJyl9YCk7XG4gIGlmIChwID09PSAnYXBwcm92ZScpIHJldHVybiBmYWlsKCdhcHByb3ZhbF9yZXF1aXJlZCcsIGB0aGUgc3Rld2FyZCBtdXN0IGFzayBiZWZvcmUgaXQgbWF5ICR7YWN0aW9uLnJlcGxhY2UoJ18nLCAnICcpfWApO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHRydWUgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFN0ZXdhcmRQb2xpY3kod29ybGQ6IFdvcmxkLCBlbmFibGVkOiBib29sZWFuLCBwb2xpY3k6IFJlY29yZDxTdGV3YXJkQWN0aW9uLCBQb2xpY3k+KTogTGlmZVJlc3VsdDxTdGV3YXJkPiB7XG4gIGNvbnN0IGggPSB3b3JsZC5ob21lc3RlYWQ7XG4gIGlmICghaCkgcmV0dXJuIGZhaWwoJ25vX2hvbWVzdGVhZCcsICdmb3VuZCB0aGUgaG9tZXN0ZWFkIGZpcnN0Jyk7XG4gIGguc3Rld2FyZC5lbmFibGVkID0gZW5hYmxlZDtcbiAgaC5zdGV3YXJkLnBvbGljeSA9IHsgYXNzaWduX3JvbGU6IHBvbGljeS5hc3NpZ25fcm9sZSwgZXhwYW5kX2ZpZWxkOiBwb2xpY3kuZXhwYW5kX2ZpZWxkIH07XG4gIC8vIFN3aXRjaGluZyBhbiBhY3Rpb24gb2ZmIHdpdGhkcmF3cyBpdHMgb3BlbiByZXF1ZXN0cy5cbiAgaC5zdGV3YXJkLnByb3Bvc2FscyA9IGguc3Rld2FyZC5wcm9wb3NhbHMuZmlsdGVyKChwKSA9PiBlbmFibGVkICYmIGguc3Rld2FyZC5wb2xpY3lbcC5hY3Rpb25dID09PSAnYXBwcm92ZScpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgLi4uaC5zdGV3YXJkLCBwcm9wb3NhbHM6IFsuLi5oLnN0ZXdhcmQucHJvcG9zYWxzXSB9IH07XG59XG5cbi8qKiBUaGUgc3Rld2FyZCBhc2tzIHRoZSBvd25lciBmb3IgYW4gYWN0aW9uIGl0cyBwb2xpY3kgcmVzZXJ2ZXMgZm9yIGFwcHJvdmFsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb3Bvc2Uod29ybGQ6IFdvcmxkLCBhY3Rpb246IFN0ZXdhcmRBY3Rpb24sIHJlYXNvbjogc3RyaW5nLCB2aWxsYWdlcklkPzogc3RyaW5nLCByb2xlPzogUm9sZSk6IExpZmVSZXN1bHQ8UHJvcG9zYWw+IHtcbiAgY29uc3QgaCA9IHdvcmxkLmhvbWVzdGVhZDtcbiAgaWYgKCFoKSByZXR1cm4gZmFpbCgnbm9faG9tZXN0ZWFkJywgJ2ZvdW5kIHRoZSBob21lc3RlYWQgZmlyc3QnKTtcbiAgaWYgKCFoLnN0ZXdhcmQuZW5hYmxlZCkgcmV0dXJuIGZhaWwoJ3N0ZXdhcmRfZGlzYWJsZWQnLCAndGhlIHN0ZXdhcmQgaXMgc3dpdGNoZWQgb2ZmJyk7XG4gIGlmIChoLnN0ZXdhcmQucG9saWN5W2FjdGlvbl0gIT09ICdhcHByb3ZlJykgcmV0dXJuIGZhaWwoJ25vdF9wZXJtaXR0ZWQnLCAndGhpcyBhY3Rpb24gZG9lcyBub3QgbmVlZCBhIHJlcXVlc3QnKTtcbiAgaWYgKGguc3Rld2FyZC5wcm9wb3NhbHMuc29tZSgocCkgPT4gcC5hY3Rpb24gPT09IGFjdGlvbiAmJiBwLnZpbGxhZ2VySWQgPT09IHZpbGxhZ2VySWQgJiYgcC5yb2xlID09PSByb2xlKSkge1xuICAgIHJldHVybiBmYWlsKCdkdXBsaWNhdGUnLCAndGhlIHN0ZXdhcmQgYWxyZWFkeSBhc2tlZCBmb3IgdGhpcycpO1xuICB9XG4gIGlmIChoLnN0ZXdhcmQucHJvcG9zYWxzLmxlbmd0aCA+PSBNQVhfUFJPUE9TQUxTKSByZXR1cm4gZmFpbCgnbGltaXQnLCAndG9vIG1hbnkgb3BlbiByZXF1ZXN0cycpO1xuICBjb25zdCBwcm9wb3NhbDogUHJvcG9zYWwgPSB7XG4gICAgaWQ6IGBwcm9wb3NhbDoke2guc3Rld2FyZC5uZXh0UHJvcG9zYWwrK31gLCBhY3Rpb24sIHJlYXNvbiwgdGljazogbGlmZVN0YXRlKHdvcmxkKS50aWNrLFxuICAgIC4uLih2aWxsYWdlcklkID8geyB2aWxsYWdlcklkIH0gOiB7fSksIC4uLihyb2xlID8geyByb2xlIH0gOiB7fSksXG4gIH07XG4gIGguc3Rld2FyZC5wcm9wb3NhbHMucHVzaChwcm9wb3NhbCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogcHJvcG9zYWwgfTtcbn1cblxuLyoqIFRoZSBvd25lciBhcHByb3ZlcyAodGhlIGFjdGlvbiBydW5zIG5vdywgYXMgdGhlIG93bmVyJ3MgZGVjaXNpb24pIG9yIGRlY2xpbmVzIGEgcmVxdWVzdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlUHJvcG9zYWwod29ybGQ6IFdvcmxkLCBwcm9wb3NhbElkOiBzdHJpbmcsIGFwcHJvdmU6IGJvb2xlYW4pOiBMaWZlUmVzdWx0PHsgcHJvcG9zYWw6IFByb3Bvc2FsOyBhcHByb3ZlZDogYm9vbGVhbjsgcmVzdWx0OiBzdHJpbmcgfT4ge1xuICBjb25zdCBoID0gd29ybGQuaG9tZXN0ZWFkO1xuICBpZiAoIWgpIHJldHVybiBmYWlsKCdub19ob21lc3RlYWQnLCAnZm91bmQgdGhlIGhvbWVzdGVhZCBmaXJzdCcpO1xuICBjb25zdCBwcm9wb3NhbCA9IGguc3Rld2FyZC5wcm9wb3NhbHMuZmluZCgocCkgPT4gcC5pZCA9PT0gcHJvcG9zYWxJZCk7XG4gIGlmICghcHJvcG9zYWwpIHJldHVybiBmYWlsKCdpbnZhbGlkX3RhcmdldCcsICdubyBzdWNoIHJlcXVlc3QnKTtcbiAgbGV0IHJlc3VsdCA9ICdkZWNsaW5lZCc7XG4gIGlmIChhcHByb3ZlKSB7XG4gICAgY29uc3QgciA9IHByb3Bvc2FsLmFjdGlvbiA9PT0gJ2V4cGFuZF9maWVsZCcgPyBleHBhbmRGaWVsZCh3b3JsZClcbiAgICAgIDogYXNzaWduUm9sZSh3b3JsZCwgcHJvcG9zYWwudmlsbGFnZXJJZCA/PyAnJywgcHJvcG9zYWwucm9sZSA/PyAnZmFybWVyJyk7XG4gICAgaWYgKCFyLm9rKSByZXR1cm4gcjtcbiAgICByZXN1bHQgPSBwcm9wb3NhbC5hY3Rpb24gPT09ICdleHBhbmRfZmllbGQnID8gYGFkZGVkICR7KHIudmFsdWUgYXMgeyBwbG90SWQ6IHN0cmluZyB9KS5wbG90SWR9YCA6IGBhc3NpZ25lZCAke3Byb3Bvc2FsLnZpbGxhZ2VySWR9IGFzICR7cHJvcG9zYWwucm9sZX1gO1xuICB9XG4gIGguc3Rld2FyZC5wcm9wb3NhbHMgPSBoLnN0ZXdhcmQucHJvcG9zYWxzLmZpbHRlcigocCkgPT4gcC5pZCAhPT0gcHJvcG9zYWxJZCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyBwcm9wb3NhbCwgYXBwcm92ZWQ6IGFwcHJvdmUsIHJlc3VsdCB9IH07XG59XG5cbi8vIC0tLS0tLS0tLS0gc25hcHNob3QgLS0tLS0tLS0tLVxuXG4vKiogQ2Fub25pY2FsIEpTT04gZm9ybSAoc29ydGVkLCBpbnRlZ2VyLCBleHBsaWNpdCkgdXNlZCBieSBzbmFwc2hvdHMgYW5kIHRoZSBoYXNoLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhvbWVzdGVhZFNuYXBzaG90KGg6IEhvbWVzdGVhZFN0YXRlKTogSG9tZXN0ZWFkU3RhdGUge1xuICByZXR1cm4ge1xuICAgIHZlcnNpb246IGgudmVyc2lvbiwgYW5jaG9yWDogaC5hbmNob3JYLCBhbmNob3JaOiBoLmFuY2hvclosIHJuZzogaC5ybmcsIG5leHRJZDogaC5uZXh0SWQsXG4gICAgdmlsbGFnZXJzOiBbLi4uaC52aWxsYWdlcnNdLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKCh2KSA9PiAoe1xuICAgICAgaWQ6IHYuaWQsIG5hbWU6IHYubmFtZSwgcm9sZTogdi5yb2xlLCB4OiB2LngsIHo6IHYueiwgZW5lcmd5OiB2LmVuZXJneSwgaHVuZ2VyOiB2Lmh1bmdlcixcbiAgICAgIGNhcnJ5OiB2LmNhcnJ5ID8geyBpdGVtOiB2LmNhcnJ5Lml0ZW0sIGFtb3VudDogdi5jYXJyeS5hbW91bnQgfSA6IG51bGwsXG4gICAgICB0YXNrOiB2LnRhc2sgPyB7IGtpbmQ6IHYudGFzay5raW5kLCB0YXJnZXQ6IHYudGFzay50YXJnZXQsIGxlZzogdi50YXNrLmxlZywgcHJvZ3Jlc3M6IHYudGFzay5wcm9ncmVzcyxcbiAgICAgICAgbGVnczogdi50YXNrLmxlZ3MubWFwKChsKSA9PiAoeyBvcDogbC5vcCwgeDogbC54LCB6OiBsLnosIHRpY2tzOiBsLnRpY2tzLCBlZmZlY3Q6IGwuZWZmZWN0LFxuICAgICAgICAgIC4uLihsLml0ZW0gIT09IHVuZGVmaW5lZCA/IHsgaXRlbTogbC5pdGVtIH0gOiB7fSksIC4uLihsLmFtb3VudCAhPT0gdW5kZWZpbmVkID8geyBhbW91bnQ6IGwuYW1vdW50IH0gOiB7fSkgfSkpIH0gOiBudWxsLFxuICAgICAgLi4uKHYubmF2ID8geyBuYXY6IG5hdlNuYXBzaG90KHYubmF2KSB9IDoge30pLFxuICAgICAgLi4uKHYuYXZvaWQ/Lmxlbmd0aCA/IHsgYXZvaWQ6IHYuYXZvaWQubWFwKChhKSA9PiAoeyB0YXJnZXQ6IGEudGFyZ2V0LCB1bnRpbDogYS51bnRpbCwgcmVhc29uOiBhLnJlYXNvbiwgYnk6IGEuYnkgfSkpIH0gOiB7fSksXG4gICAgfSkpLFxuICAgIHBsb3RzOiBbLi4uaC5wbG90c10uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoKHApID0+ICh7IGlkOiBwLmlkLCB4OiBwLngsIHo6IHAueiwgdzogcC53LCBkOiBwLmQsIGNyb3A6IHAuY3JvcCxcbiAgICAgIHN0YXRlOiBwLnN0YXRlLCBncm93dGg6IHAuZ3Jvd3RoLCBtb2lzdHVyZTogcC5tb2lzdHVyZSwgZHJ5OiBwLmRyeSwgdGlsbGVkOiBwLnRpbGxlZCB9KSksXG4gICAgZW5jbG9zdXJlczogWy4uLmguZW5jbG9zdXJlc10uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoKGUpID0+ICh7IGlkOiBlLmlkLCBncmFzczogZS5ncmFzcywgZmVlZDogZS5mZWVkLCB3YXRlcjogZS53YXRlciwgZWdnczogZS5lZ2dzIH0pKSxcbiAgICBhbmltYWxzOiBbLi4uaC5hbmltYWxzXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgoYSkgPT4gKHtcbiAgICAgIGlkOiBhLmlkLCBzcGVjaWVzOiBhLnNwZWNpZXMsIHNleDogYS5zZXgsIGJvcm46IGEuYm9ybiwgeDogYS54LCB6OiBhLnosIHR4OiBhLnR4LCB0ejogYS50eixcbiAgICAgIGh1bmdlcjogYS5odW5nZXIsIHN0YXJ2aW5nOiBhLnN0YXJ2aW5nLCBwcm9kdWN0OiBhLnByb2R1Y3QsIHByZWduYW50VW50aWw6IGEucHJlZ25hbnRVbnRpbCxcbiAgICB9KSksXG4gICAgb3ZlcmZsb3c6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhoLm92ZXJmbG93KS5maWx0ZXIoKFssIG5dKSA9PiBuID4gMCkuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICAgIHN0ZXdhcmQ6IHtcbiAgICAgIGVuYWJsZWQ6IGguc3Rld2FyZC5lbmFibGVkLFxuICAgICAgcG9saWN5OiB7IGFzc2lnbl9yb2xlOiBoLnN0ZXdhcmQucG9saWN5LmFzc2lnbl9yb2xlLCBleHBhbmRfZmllbGQ6IGguc3Rld2FyZC5wb2xpY3kuZXhwYW5kX2ZpZWxkIH0sXG4gICAgICBwcm9wb3NhbHM6IGguc3Rld2FyZC5wcm9wb3NhbHMubWFwKChwKSA9PiAoeyBpZDogcC5pZCwgYWN0aW9uOiBwLmFjdGlvbixcbiAgICAgICAgLi4uKHAudmlsbGFnZXJJZCAhPT0gdW5kZWZpbmVkID8geyB2aWxsYWdlcklkOiBwLnZpbGxhZ2VySWQgfSA6IHt9KSwgLi4uKHAucm9sZSAhPT0gdW5kZWZpbmVkID8geyByb2xlOiBwLnJvbGUgfSA6IHt9KSxcbiAgICAgICAgcmVhc29uOiBwLnJlYXNvbiwgdGljazogcC50aWNrIH0pKSxcbiAgICAgIG5leHRQcm9wb3NhbDogaC5zdGV3YXJkLm5leHRQcm9wb3NhbCxcbiAgICB9LFxuICAgIC4uLihoLmdhdGVzID8geyBnYXRlczogWy4uLmguZ2F0ZXNdLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChnKSA9PiAoeyBpZDogZy5pZCwgc3RhdGU6IGcuc3RhdGUgfSkpIH0gOiB7fSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIG5hdlNuYXBzaG90KG46IE5hdlN0YXRlKTogTmF2U3RhdGUge1xuICByZXR1cm4ge1xuICAgIHBhdGg6IFsuLi5uLnBhdGhdLCBwbGFuOiBuLnBsYW4sIGRlc3Q6IFtuLmRlc3RbMF0sIG4uZGVzdFsxXSwgbi5kZXN0WzJdXSxcbiAgICAuLi4obi5vcGVuaW5nICE9PSB1bmRlZmluZWQgPyB7IG9wZW5pbmc6IG4ub3BlbmluZyB9IDoge30pLFxuICAgIC4uLihuLm9wZW5lZCAhPT0gdW5kZWZpbmVkID8geyBvcGVuZWQ6IG4ub3BlbmVkIH0gOiB7fSksXG4gICAgLi4uKG4uZmFyICE9PSB1bmRlZmluZWQgPyB7IGZhcjogW24uZmFyWzBdLCBuLmZhclsxXV0gYXMgW251bWJlciwgbnVtYmVyXSB9IDoge30pLFxuICAgIC4uLihuLmJsb2NrZWQgIT09IHVuZGVmaW5lZCA/IHsgYmxvY2tlZDogeyByZWFzb246IG4uYmxvY2tlZC5yZWFzb24sIGJ5OiBuLmJsb2NrZWQuYnksIHRhcmdldDogbi5ibG9ja2VkLnRhcmdldCwgc2luY2U6IG4uYmxvY2tlZC5zaW5jZSB9IH0gOiB7fSksXG4gIH07XG59XG5cbmNvbnN0IGlzT2JqID0gKHY6IHVua25vd24pOiB2IGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0+IHR5cGVvZiB2ID09PSAnb2JqZWN0JyAmJiB2ICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KHYpO1xuY29uc3QgaW50ID0gKHY6IHVua25vd24sIGxvOiBudW1iZXIsIGhpOiBudW1iZXIpOiB2IGlzIG51bWJlciA9PiB0eXBlb2YgdiA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIodikgJiYgdiA+PSBsbyAmJiB2IDw9IGhpO1xuY29uc3Qgc3RyID0gKHY6IHVua25vd24sIHJlOiBSZWdFeHApOiB2IGlzIHN0cmluZyA9PiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgJiYgdi5sZW5ndGggPD0gNjQgJiYgcmUudGVzdCh2KTtcbmNvbnN0IFBPUyA9IDIwXzAwMDsgLy8gfGRtfCBib3VuZCAoXHUwMEIxMiBrbSlcbi8vICd0aHJlc2gnIHdhcyBtaXNzaW5nIGhlcmUgYmVmb3JlIE0wMTAsIHNvIGEgc2F2ZSB0YWtlbiB3aGlsZSBhIGZhcm1lciB0aHJlc2hlZCBzZWVkIHdhcyByZWplY3RlZCBvbiBsb2FkLlxuY29uc3QgRUZGRUNUUyA9IG5ldyBTZXQ8RWZmZWN0PihbJ3Rha2UnLCAnc3RvcmUnLCAndGlsbCcsICdzb3cnLCAncmVhcCcsICd3YXRlcl9wbG90JywgJ2RyYXcnLCAnd2F0ZXJfdHJvdWdoJywgJ2ZpbGxfZmVlZCcsICdnYXRoZXJfZWdncycsICdzaGVhcicsICdtaWxrJywgJ2VhdCcsICdyZXN0JywgJ3Jlc3RvY2snLCAndGhyZXNoJywgJ25vbmUnXSk7XG5jb25zdCBHQVRFX0lEX1NFVCA9IG5ldyBTZXQ8c3RyaW5nPihHQVRFX0lEUyk7XG5jb25zdCBUQVJHRVQgPSAvXlthLXpfXSs6W2EtejAtOTpdezEsMjR9JC87XG5jb25zdCBCWSA9IC9eW0EtWmEtejAtOV86LC4tXXsxLDk2fSQvO1xuY29uc3QgdGV4dDE2MCA9ICh2OiB1bmtub3duKTogdiBpcyBzdHJpbmcgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnICYmIHYubGVuZ3RoID4gMCAmJiB2Lmxlbmd0aCA8PSAxNjAgJiYgL15bXFx4MjAtXFx4N2VdKyQvLnRlc3Qodik7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlTmF2KHJhdzogdW5rbm93biwgdGljazogbnVtYmVyKTogTmF2U3RhdGUge1xuICBpZiAoIWlzT2JqKHJhdykgfHwgIUFycmF5LmlzQXJyYXkocmF3LnBhdGgpIHx8IHJhdy5wYXRoLmxlbmd0aCAlIDIgIT09IDAgfHwgcmF3LnBhdGgubGVuZ3RoID4gNTEyXG4gICAgfHwgIXJhdy5wYXRoLmV2ZXJ5KChjKSA9PiBpbnQoYywgLTEwMjQsIDEwMjMpKSB8fCB0eXBlb2YgcmF3LnBsYW4gIT09ICdzdHJpbmcnIHx8ICEvXig/OlswLTlhLWZdezE2fSk/JC8udGVzdChyYXcucGxhbilcbiAgICB8fCAhQXJyYXkuaXNBcnJheShyYXcuZGVzdCkgfHwgcmF3LmRlc3QubGVuZ3RoICE9PSAzIHx8ICFpbnQocmF3LmRlc3RbMF0sIC1QT1MsIFBPUykgfHwgIWludChyYXcuZGVzdFsxXSwgLVBPUywgUE9TKSB8fCAhaW50KHJhdy5kZXN0WzJdLCAwLCAxMDApXG4gICAgfHwgcmF3Lm9wZW5pbmcgIT09IHVuZGVmaW5lZCAmJiAhR0FURV9JRF9TRVQuaGFzKFN0cmluZyhyYXcub3BlbmluZykpXG4gICAgfHwgcmF3Lm9wZW5lZCAhPT0gdW5kZWZpbmVkICYmICFHQVRFX0lEX1NFVC5oYXMoU3RyaW5nKHJhdy5vcGVuZWQpKVxuICAgIHx8IHJhdy5mYXIgIT09IHVuZGVmaW5lZCAmJiAoIUFycmF5LmlzQXJyYXkocmF3LmZhcikgfHwgcmF3LmZhci5sZW5ndGggIT09IDIgfHwgIWludChyYXcuZmFyWzBdLCAtMTAyNCwgMTAyMykgfHwgIWludChyYXcuZmFyWzFdLCAtMTAyNCwgMTAyMykpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHZpbGxhZ2VyIHJvdXRlJyk7XG4gIH1cbiAgbGV0IGJsb2NrZWQ6IE5hdlN0YXRlWydibG9ja2VkJ107XG4gIGlmIChyYXcuYmxvY2tlZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgYiA9IHJhdy5ibG9ja2VkO1xuICAgIGlmICghaXNPYmooYikgfHwgIXRleHQxNjAoYi5yZWFzb24pIHx8ICFzdHIoYi5ieSwgQlkpIHx8ICFzdHIoYi50YXJnZXQsIFRBUkdFVCkgfHwgIWludChiLnNpbmNlLCAwLCB0aWNrKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHZpbGxhZ2VyIG9ic3RydWN0aW9uJyk7XG4gICAgYmxvY2tlZCA9IHsgcmVhc29uOiBiLnJlYXNvbiwgYnk6IGIuYnksIHRhcmdldDogYi50YXJnZXQsIHNpbmNlOiBiLnNpbmNlIH07XG4gIH1cbiAgcmV0dXJuIG5hdlNuYXBzaG90KHsgcGF0aDogcmF3LnBhdGggYXMgbnVtYmVyW10sIHBsYW46IHJhdy5wbGFuLCBkZXN0OiByYXcuZGVzdCBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG4gICAgLi4uKHJhdy5vcGVuaW5nICE9PSB1bmRlZmluZWQgPyB7IG9wZW5pbmc6IHJhdy5vcGVuaW5nIGFzIHN0cmluZyB9IDoge30pLCAuLi4ocmF3Lm9wZW5lZCAhPT0gdW5kZWZpbmVkID8geyBvcGVuZWQ6IHJhdy5vcGVuZWQgYXMgc3RyaW5nIH0gOiB7fSksXG4gICAgLi4uKHJhdy5mYXIgIT09IHVuZGVmaW5lZCA/IHsgZmFyOiByYXcuZmFyIGFzIFtudW1iZXIsIG51bWJlcl0gfSA6IHt9KSwgLi4uKGJsb2NrZWQgPyB7IGJsb2NrZWQgfSA6IHt9KSB9KTtcbn1cbmNvbnN0IElURU1TID0gL14oPzp3YXRlcnxzZWVkfGZpYmVyfGVnZ3N8d29vbHxtaWxrfGhhcnZlc3Q6KD86d2hlYXR8cG90YXRvfGZsYXgpfGZvb2R8cmF0aW9uc3xvcmV8c3RvbmV8d29vZCkkLztcblxuLyoqIFN0cmljdCB2YWxpZGF0aW9uOiB1bmtub3duIGZpZWxkcywgcmFuZ2VzIGFuZCByZWZlcmVuY2VzIGFyZSByZWplY3RlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUhvbWVzdGVhZChyYXc6IHVua25vd24sIHRpY2s6IG51bWJlcik6IEhvbWVzdGVhZFN0YXRlIHtcbiAgaWYgKCFpc09iaihyYXcpIHx8IChyYXcudmVyc2lvbiAhPT0gSE9NRVNURUFEX1ZFUlNJT04gJiYgcmF3LnZlcnNpb24gIT09IEhPTUVTVEVBRF9OQVZfVkVSU0lPTikgfHwgIWludChyYXcuYW5jaG9yWCwgLTEwMDAsIDEwMDApIHx8ICFpbnQocmF3LmFuY2hvclosIC0xMDAwLCAxMDAwKVxuICAgIHx8ICFpbnQocmF3LnJuZywgMSwgMHhmZmZmZmZmZikgfHwgIWludChyYXcubmV4dElkLCAwLCAxXzAwMF8wMDApXG4gICAgfHwgIUFycmF5LmlzQXJyYXkocmF3LnZpbGxhZ2VycykgfHwgcmF3LnZpbGxhZ2Vycy5sZW5ndGggPiBNQVhfVklMTEFHRVJTXG4gICAgfHwgIUFycmF5LmlzQXJyYXkocmF3LnBsb3RzKSB8fCByYXcucGxvdHMubGVuZ3RoID4gTUFYX0ZJRUxEU1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHJhdy5lbmNsb3N1cmVzKSB8fCByYXcuZW5jbG9zdXJlcy5sZW5ndGggIT09IDRcbiAgICB8fCAhQXJyYXkuaXNBcnJheShyYXcuYW5pbWFscykgfHwgcmF3LmFuaW1hbHMubGVuZ3RoID4gTUFYX0FOSU1BTFMpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIGludmFsaWQgaG9tZXN0ZWFkJyk7XG4gIGNvbnN0IHZpbGxhZ2VyczogVmlsbGFnZXJbXSA9IHJhdy52aWxsYWdlcnMubWFwKCh2OiB1bmtub3duKSA9PiB7XG4gICAgaWYgKCFpc09iaih2KSB8fCAhc3RyKHYuaWQsIC9edmlsbGFnZXI6XFxkezEsM30kLykgfHwgIXN0cih2Lm5hbWUsIC9eW0EtWmEtel1bQS1aYS16ICctXXswLDIzfSQvKVxuICAgICAgfHwgIVJPTEVTLmluY2x1ZGVzKHYucm9sZSBhcyBSb2xlKSB8fCAhaW50KHYueCwgLVBPUywgUE9TKSB8fCAhaW50KHYueiwgLVBPUywgUE9TKVxuICAgICAgfHwgIWludCh2LmVuZXJneSwgMCwgMTAwKSB8fCAhaW50KHYuaHVuZ2VyLCAwLCAxMDApKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiBpbnZhbGlkIHZpbGxhZ2VyJyk7XG4gICAgbGV0IGNhcnJ5OiBDYXJyeSA9IG51bGw7XG4gICAgaWYgKHYuY2FycnkgIT09IG51bGwpIHtcbiAgICAgIGlmICghaXNPYmoodi5jYXJyeSkgfHwgIXN0cih2LmNhcnJ5Lml0ZW0sIElURU1TKSB8fCAhaW50KHYuY2FycnkuYW1vdW50LCAxLCAxMDApKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgdmlsbGFnZXIgbG9hZCcpO1xuICAgICAgY2FycnkgPSB7IGl0ZW06IHYuY2FycnkuaXRlbSwgYW1vdW50OiB2LmNhcnJ5LmFtb3VudCB9O1xuICAgIH1cbiAgICBsZXQgdGFzazogVGFzayB8IG51bGwgPSBudWxsO1xuICAgIGlmICh2LnRhc2sgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHQgPSB2LnRhc2s7XG4gICAgICBpZiAoIWlzT2JqKHQpIHx8ICFzdHIodC5raW5kLCAvXlthLXpfXXsxLDE2fSQvKSB8fCAhc3RyKHQudGFyZ2V0LCAvXlthLXpfXSs6W2EtejAtOTpdezEsMjR9JC8pXG4gICAgICAgIHx8ICFBcnJheS5pc0FycmF5KHQubGVncykgfHwgdC5sZWdzLmxlbmd0aCA8IDEgfHwgdC5sZWdzLmxlbmd0aCA+IDggfHwgIWludCh0LmxlZywgMCwgdC5sZWdzLmxlbmd0aCAtIDEpIHx8ICFpbnQodC5wcm9ncmVzcywgMCwgMTBfMDAwKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgdmlsbGFnZXIgdGFzaycpO1xuICAgICAgfVxuICAgICAgY29uc3QgbGVnczogTGVnW10gPSB0LmxlZ3MubWFwKChsOiB1bmtub3duKSA9PiB7XG4gICAgICAgIGlmICghaXNPYmoobCkgfHwgKGwub3AgIT09ICd3YWxrJyAmJiBsLm9wICE9PSAnd29yaycpIHx8ICFpbnQobC54LCAtUE9TLCBQT1MpIHx8ICFpbnQobC56LCAtUE9TLCBQT1MpXG4gICAgICAgICAgfHwgIWludChsLnRpY2tzLCAwLCAxMDAwKSB8fCAhRUZGRUNUUy5oYXMobC5lZmZlY3QgYXMgRWZmZWN0KVxuICAgICAgICAgIHx8IGwuaXRlbSAhPT0gdW5kZWZpbmVkICYmICFzdHIobC5pdGVtLCBJVEVNUykgfHwgbC5hbW91bnQgIT09IHVuZGVmaW5lZCAmJiAhaW50KGwuYW1vdW50LCAxLCAxMDApKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgdGFzayBsZWcnKTtcbiAgICAgICAgcmV0dXJuIHsgb3A6IGwub3AsIHg6IGwueCwgejogbC56LCB0aWNrczogbC50aWNrcywgZWZmZWN0OiBsLmVmZmVjdCBhcyBFZmZlY3QsXG4gICAgICAgICAgLi4uKGwuaXRlbSAhPT0gdW5kZWZpbmVkID8geyBpdGVtOiBsLml0ZW0gYXMgc3RyaW5nIH0gOiB7fSksIC4uLihsLmFtb3VudCAhPT0gdW5kZWZpbmVkID8geyBhbW91bnQ6IGwuYW1vdW50IGFzIG51bWJlciB9IDoge30pIH07XG4gICAgICB9KTtcbiAgICAgIHRhc2sgPSB7IGtpbmQ6IHQua2luZCwgdGFyZ2V0OiB0LnRhcmdldCwgbGVncywgbGVnOiB0LmxlZywgcHJvZ3Jlc3M6IHQucHJvZ3Jlc3MgfTtcbiAgICB9XG4gICAgLy8gUm91dGVzIGFuZCBnaXZlLXVwcyBleGlzdCBvbmx5IHVuZGVyIHNldHRsZW1lbnQgcnVsZXMgdjIuXG4gICAgaWYgKCh2Lm5hdiAhPT0gdW5kZWZpbmVkIHx8IHYuYXZvaWQgIT09IHVuZGVmaW5lZCkgJiYgcmF3LnZlcnNpb24gIT09IEhPTUVTVEVBRF9OQVZfVkVSU0lPTikgdGhyb3cgbmV3IEVycm9yKCdsZWdhY3kgdmlsbGFnZXIgaGFzIGEgcm91dGUnKTtcbiAgICBjb25zdCBuYXYgPSB2Lm5hdiA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogdmFsaWRhdGVOYXYodi5uYXYsIHRpY2spO1xuICAgIGxldCBhdm9pZDogQXZvaWRlZFtdIHwgdW5kZWZpbmVkO1xuICAgIGlmICh2LmF2b2lkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheSh2LmF2b2lkKSB8fCB2LmF2b2lkLmxlbmd0aCA8IDEgfHwgdi5hdm9pZC5sZW5ndGggPiBNQVhfQVZPSUQpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCB2aWxsYWdlciBnaXZlLXVwcycpO1xuICAgICAgYXZvaWQgPSB2LmF2b2lkLm1hcCgoYTogdW5rbm93bikgPT4ge1xuICAgICAgICBpZiAoIWlzT2JqKGEpIHx8ICFzdHIoYS50YXJnZXQsIFRBUkdFVCkgfHwgIWludChhLnVudGlsLCAwLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikgfHwgIXRleHQxNjAoYS5yZWFzb24pIHx8ICFzdHIoYS5ieSwgQlkpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgdmlsbGFnZXIgZ2l2ZS11cCcpO1xuICAgICAgICByZXR1cm4geyB0YXJnZXQ6IGEudGFyZ2V0LCB1bnRpbDogYS51bnRpbCwgcmVhc29uOiBhLnJlYXNvbiwgYnk6IGEuYnkgfTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4geyBpZDogdi5pZCwgbmFtZTogdi5uYW1lLCByb2xlOiB2LnJvbGUgYXMgUm9sZSwgeDogdi54LCB6OiB2LnosIGVuZXJneTogdi5lbmVyZ3ksIGh1bmdlcjogdi5odW5nZXIsIGNhcnJ5LCB0YXNrLFxuICAgICAgLi4uKG5hdiA/IHsgbmF2IH0gOiB7fSksIC4uLihhdm9pZCA/IHsgYXZvaWQgfSA6IHt9KSB9O1xuICB9KTtcbiAgY29uc3QgZmllbGRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3QgcGxvdHM6IFBsb3RbXSA9IHJhdy5wbG90cy5tYXAoKHA6IHVua25vd24pID0+IHtcbiAgICBpZiAoIWlzT2JqKHApIHx8ICFzdHIocC5pZCwgL15maWVsZDpcXGR7MSw2fSQvKSB8fCBmaWVsZElkcy5oYXMocC5pZCkgfHwgIUNST1BTLmluY2x1ZGVzKHAuY3JvcCBhcyBDcm9wS2luZClcbiAgICAgIHx8ICFpbnQocC54LCAtMTAwMCwgMTAwMCkgfHwgIWludChwLnosIC0xMDAwLCAxMDAwKSB8fCAhaW50KHAudywgRklFTERfTUlOLCBGSUVMRF9NQVgpIHx8ICFpbnQocC5kLCBGSUVMRF9NSU4sIEZJRUxEX01BWClcbiAgICAgIHx8ICFbJ3dpbGQnLCAndGlsbGVkJywgJ2dyb3dpbmcnLCAncmlwZSddLmluY2x1ZGVzKFN0cmluZyhwLnN0YXRlKSlcbiAgICAgIHx8ICFpbnQocC5ncm93dGgsIDAsIENST1BfUlVMRVNbcC5jcm9wIGFzIENyb3BLaW5kXS5ncm93VGlja3MpIHx8ICFpbnQocC5tb2lzdHVyZSwgMCwgTU9JU1RVUkVfTUFYKVxuICAgICAgfHwgIWludChwLmRyeSwgMCwgV0lUSEVSX1RJQ0tTKSB8fCAhaW50KHAudGlsbGVkLCAwLCBUSUxMX1BFUl9VTklUICogZmllbGRVbml0cyhwLncsIHAuZCkpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiBpbnZhbGlkIGZpZWxkJyk7XG4gICAgfVxuICAgIGZpZWxkSWRzLmFkZChwLmlkKTtcbiAgICByZXR1cm4geyBpZDogcC5pZCwgeDogcC54LCB6OiBwLnosIHc6IHAudywgZDogcC5kLCBjcm9wOiBwLmNyb3AgYXMgQ3JvcEtpbmQsIHN0YXRlOiBwLnN0YXRlIGFzIFBsb3RTdGF0ZSxcbiAgICAgIGdyb3d0aDogcC5ncm93dGgsIG1vaXN0dXJlOiBwLm1vaXN0dXJlLCBkcnk6IHAuZHJ5LCB0aWxsZWQ6IHAudGlsbGVkIH07XG4gIH0pO1xuICBjb25zdCBlbmNsb3N1cmVJZHM6IEVuY2xvc3VyZUlkW10gPSBbJ2Nvb3AnLCAncGFkZG9jaycsICdwZW4nLCAnc3R5J107XG4gIGNvbnN0IGVuY2xvc3VyZXM6IEVuY2xvc3VyZVtdID0gcmF3LmVuY2xvc3VyZXMubWFwKChlOiB1bmtub3duLCBpOiBudW1iZXIpID0+IHtcbiAgICBpZiAoIWlzT2JqKGUpIHx8IGUuaWQgIT09IGVuY2xvc3VyZUlkc1tpXSB8fCAhaW50KGUuZ3Jhc3MsIDAsIEdSQVNTX01BWCkgfHwgIWludChlLmZlZWQsIDAsIFRST1VHSF9NQVgpXG4gICAgICB8fCAhaW50KGUud2F0ZXIsIDAsIFRST1VHSF9NQVgpIHx8ICFpbnQoZS5lZ2dzLCAwLCBFR0dfQk9YX01BWCkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIGludmFsaWQgZW5jbG9zdXJlJyk7XG4gICAgcmV0dXJuIHsgaWQ6IGUuaWQgYXMgRW5jbG9zdXJlSWQsIGdyYXNzOiBlLmdyYXNzLCBmZWVkOiBlLmZlZWQsIHdhdGVyOiBlLndhdGVyLCBlZ2dzOiBlLmVnZ3MgfTtcbiAgfSk7XG4gIGNvbnN0IGlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBhbmltYWxzOiBBbmltYWxbXSA9IHJhdy5hbmltYWxzLm1hcCgoYTogdW5rbm93bikgPT4ge1xuICAgIGlmICghaXNPYmooYSkgfHwgIXN0cihhLmlkLCAvXmFuaW1hbDpcXGR7Myw2fSQvKSB8fCBpZHMuaGFzKGEuaWQpIHx8ICFTUEVDSUVTLmluY2x1ZGVzKGEuc3BlY2llcyBhcyBTcGVjaWVzKVxuICAgICAgfHwgKGEuc2V4ICE9PSAnZicgJiYgYS5zZXggIT09ICdtJykgfHwgIWludChhLmJvcm4sIC0xMF8wMDAsIHRpY2spIHx8ICFpbnQoYS54LCAtUE9TLCBQT1MpIHx8ICFpbnQoYS56LCAtUE9TLCBQT1MpXG4gICAgICB8fCAhaW50KGEudHgsIC1QT1MsIFBPUykgfHwgIWludChhLnR6LCAtUE9TLCBQT1MpIHx8ICFpbnQoYS5odW5nZXIsIDAsIDEwMCkgfHwgIWludChhLnN0YXJ2aW5nLCAwLCBTVEFSVklOR19ERUFUSF9USUNLUylcbiAgICAgIHx8ICFpbnQoYS5wcm9kdWN0LCAwLCAxMDAwKSB8fCAhaW50KGEucHJlZ25hbnRVbnRpbCwgMCwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiBpbnZhbGlkIGFuaW1hbCcpO1xuICAgIGlkcy5hZGQoYS5pZCk7XG4gICAgcmV0dXJuIHsgaWQ6IGEuaWQsIHNwZWNpZXM6IGEuc3BlY2llcyBhcyBTcGVjaWVzLCBzZXg6IGEuc2V4LCBib3JuOiBhLmJvcm4sIHg6IGEueCwgejogYS56LCB0eDogYS50eCwgdHo6IGEudHosXG4gICAgICBodW5nZXI6IGEuaHVuZ2VyLCBzdGFydmluZzogYS5zdGFydmluZywgcHJvZHVjdDogYS5wcm9kdWN0LCBwcmVnbmFudFVudGlsOiBhLnByZWduYW50VW50aWwgfTtcbiAgfSk7XG4gIGlmICghaXNPYmoocmF3Lm92ZXJmbG93KSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gaW52YWxpZCBvdmVyZmxvdyBwaWxlJyk7XG4gIGNvbnN0IG92ZXJmbG93OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3QgayBvZiBPYmplY3Qua2V5cyhyYXcub3ZlcmZsb3cpKSB7XG4gICAgY29uc3QgbiA9IHJhdy5vdmVyZmxvd1trXTtcbiAgICBpZiAoIXN0cihrLCBJVEVNUykgfHwgay5zdGFydHNXaXRoKCdoYXJ2ZXN0JykgfHwgayA9PT0gJ3dhdGVyJyB8fCAhaW50KG4sIDEsIE9WRVJGTE9XX0NBUEFDSVRZKSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gaW52YWxpZCBvdmVyZmxvdyBwaWxlJyk7XG4gICAgb3ZlcmZsb3dba10gPSBuO1xuICB9XG4gIGlmICh0b3RhbChvdmVyZmxvdykgPiBPVkVSRkxPV19DQVBBQ0lUWSkgdGhyb3cgbmV3IEVycm9yKCdvdmVyZmxvdyBwaWxlIGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgY29uc3Qgc3QgPSByYXcuc3Rld2FyZDtcbiAgY29uc3QgcG9saWNpZXMgPSBuZXcgU2V0KFsnYXV0bycsICdhcHByb3ZlJywgJ29mZiddKTtcbiAgaWYgKCFpc09iaihzdCkgfHwgdHlwZW9mIHN0LmVuYWJsZWQgIT09ICdib29sZWFuJyB8fCAhaXNPYmooc3QucG9saWN5KSB8fCAhcG9saWNpZXMuaGFzKFN0cmluZyhzdC5wb2xpY3kuYXNzaWduX3JvbGUpKVxuICAgIHx8ICFwb2xpY2llcy5oYXMoU3RyaW5nKHN0LnBvbGljeS5leHBhbmRfZmllbGQpKSB8fCAhQXJyYXkuaXNBcnJheShzdC5wcm9wb3NhbHMpIHx8IHN0LnByb3Bvc2Fscy5sZW5ndGggPiBNQVhfUFJPUE9TQUxTXG4gICAgfHwgIWludChzdC5uZXh0UHJvcG9zYWwsIDAsIDFfMDAwXzAwMCkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIGludmFsaWQgc3Rld2FyZCcpO1xuICBjb25zdCBwcm9wb3NhbHM6IFByb3Bvc2FsW10gPSBzdC5wcm9wb3NhbHMubWFwKChwOiB1bmtub3duKSA9PiB7XG4gICAgaWYgKCFpc09iaihwKSB8fCAhc3RyKHAuaWQsIC9ecHJvcG9zYWw6XFxkezEsNn0kLykgfHwgIVNURVdBUkRfQUNUSU9OUy5pbmNsdWRlcyhwLmFjdGlvbiBhcyBTdGV3YXJkQWN0aW9uKVxuICAgICAgfHwgcC52aWxsYWdlcklkICE9PSB1bmRlZmluZWQgJiYgIXN0cihwLnZpbGxhZ2VySWQsIC9edmlsbGFnZXI6XFxkezEsM30kLykgfHwgcC5yb2xlICE9PSB1bmRlZmluZWQgJiYgIVJPTEVTLmluY2x1ZGVzKHAucm9sZSBhcyBSb2xlKVxuICAgICAgfHwgdHlwZW9mIHAucmVhc29uICE9PSAnc3RyaW5nJyB8fCBwLnJlYXNvbi5sZW5ndGggPiAxNjAgfHwgIWludChwLnRpY2ssIDAsIHRpY2spKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiBpbnZhbGlkIHByb3Bvc2FsJyk7XG4gICAgcmV0dXJuIHsgaWQ6IHAuaWQsIGFjdGlvbjogcC5hY3Rpb24gYXMgU3Rld2FyZEFjdGlvbiwgLi4uKHAudmlsbGFnZXJJZCAhPT0gdW5kZWZpbmVkID8geyB2aWxsYWdlcklkOiBwLnZpbGxhZ2VySWQgYXMgc3RyaW5nIH0gOiB7fSksXG4gICAgICAuLi4ocC5yb2xlICE9PSB1bmRlZmluZWQgPyB7IHJvbGU6IHAucm9sZSBhcyBSb2xlIH0gOiB7fSksIHJlYXNvbjogcC5yZWFzb24sIHRpY2s6IHAudGljayB9O1xuICB9KTtcbiAgY29uc3Qgc3Rld2FyZDogU3Rld2FyZCA9IHsgZW5hYmxlZDogc3QuZW5hYmxlZCwgcG9saWN5OiB7IGFzc2lnbl9yb2xlOiBzdC5wb2xpY3kuYXNzaWduX3JvbGUgYXMgUG9saWN5LCBleHBhbmRfZmllbGQ6IHN0LnBvbGljeS5leHBhbmRfZmllbGQgYXMgUG9saWN5IH0sXG4gICAgcHJvcG9zYWxzLCBuZXh0UHJvcG9zYWw6IHN0Lm5leHRQcm9wb3NhbCB9O1xuICBsZXQgZ2F0ZXM6IEdhdGVSZWNvcmRbXSB8IHVuZGVmaW5lZDtcbiAgaWYgKHJhdy52ZXJzaW9uID09PSBIT01FU1RFQURfTkFWX1ZFUlNJT04pIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocmF3LmdhdGVzKSB8fCByYXcuZ2F0ZXMubGVuZ3RoICE9PSBHQVRFX0lEUy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGludmFsaWQgZ2F0ZXMnKTtcbiAgICBnYXRlcyA9IHJhdy5nYXRlcy5tYXAoKGc6IHVua25vd24sIGk6IG51bWJlcikgPT4ge1xuICAgICAgaWYgKCFpc09iaihnKSB8fCBnLmlkICE9PSBHQVRFX0lEU1tpXSB8fCAhR0FURV9TVEFURVMuaW5jbHVkZXMoZy5zdGF0ZSBhcyBHYXRlU3RhdGUpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiBpbnZhbGlkIGdhdGUnKTtcbiAgICAgIHJldHVybiB7IGlkOiBHQVRFX0lEU1tpXSBhcyBzdHJpbmcsIHN0YXRlOiBnLnN0YXRlIGFzIEdhdGVTdGF0ZSB9O1xuICAgIH0pO1xuICB9IGVsc2UgaWYgKHJhdy5nYXRlcyAhPT0gdW5kZWZpbmVkKSB0aHJvdyBuZXcgRXJyb3IoJ2xlZ2FjeSBob21lc3RlYWQgaGFzIGdhdGVzJyk7XG4gIGNvbnN0IGg6IEhvbWVzdGVhZFN0YXRlID0geyB2ZXJzaW9uOiByYXcudmVyc2lvbiBhcyBIb21lc3RlYWRWZXJzaW9uLCBhbmNob3JYOiByYXcuYW5jaG9yWCwgYW5jaG9yWjogcmF3LmFuY2hvclosIHJuZzogcmF3LnJuZywgbmV4dElkOiByYXcubmV4dElkLFxuICAgIHZpbGxhZ2VycywgcGxvdHMsIGVuY2xvc3VyZXMsIGFuaW1hbHMsIG92ZXJmbG93LCBzdGV3YXJkLCAuLi4oZ2F0ZXMgPyB7IGdhdGVzIH0gOiB7fSkgfTtcbiAgY29uc3QgY2Fub25pY2FsID0gaG9tZXN0ZWFkU25hcHNob3QoaCk7XG4gIGlmIChKU09OLnN0cmluZ2lmeShjYW5vbmljYWwpICE9PSBKU09OLnN0cmluZ2lmeShyYXcpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhvbWVzdGVhZCBpcyBub3QgY2Fub25pY2FsJyk7XG4gIHJldHVybiBjYW5vbmljYWw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZUhvbWVzdGVhZChoOiBIb21lc3RlYWRTdGF0ZSk6IEhvbWVzdGVhZFN0YXRlIHtcbiAgcmV0dXJuIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoaG9tZXN0ZWFkU25hcHNob3QoaCkpKSBhcyBIb21lc3RlYWRTdGF0ZTtcbn1cbiIsICIvLyBWZXJzaW9uZWQsIEpTT04tc2FmZSBzbmFwc2hvdHMgb2YgY29tcGxldGUgYXV0aG9yaXRhdGl2ZSBNMDAyIHN0YXRlLlxuLy8gQ2h1bmsgYnl0ZXMsIGhlaWdodC9tYXRlcmlhbCBjYWNoZXMsIHJlbmRlcmVyIGRhdGEgYW5kIHRpbWluZyBjb3VudGVycyBhcmVcbi8vIHJlZ2VuZXJhdGVkIGZyb20gdGhlIG1hbmlmZXN0IGFuZCBkdXJhYmxlIGVkaXRzOyB0aGV5IGFyZSBub3QgYSBzZWNvbmQgc2F2ZS5cbmltcG9ydCB7XG4gIENIVU5LX1NJWkUsIENIVU5LX1ZPTFVNRSwgQ0hVTktTX1BFUl9TSURFLCBFbnRpdHksIEVudGl0eUtpbmQsXG4gIEdFTkVSQVRPUl9WRVJTSU9OLCBIQUxGLCBNYXRJZCwgUmVzb3VyY2VUeXBlLCBXb3JsZCwgV29ybGRNYW5pZmVzdCxcbiAgY3JlYXRlV29ybGQsIHBsYWNlQXV0aG9yZWRTaXRlcywgd29ybGRNYW5pZmVzdCwgZW5zdXJlQ2h1bmssIGlzUmV0aXJlZFN0b25lS2luZCxcbiAgbWFya0VkaXRzQ2hhbmdlZCwgaXNTdXBwb3J0ZWRHZW5lcmF0b3IsIE1BWF9NQVRfSUQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiwgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7XG4gIGVuYWJsZVN0b25lUmVwbGF5LCBmaW5pc2hTdG9uZVJlcGxheSwgaXNIaXN0b3JpY2FsU3RvbmVIYXNoLCBpc1N0b25lUmVwbGF5LFxufSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBIb21lc3RlYWRTdGF0ZSwgaG9tZXN0ZWFkU25hcHNob3QsIHZhbGlkYXRlSG9tZXN0ZWFkLCBjbG9uZUhvbWVzdGVhZCB9IGZyb20gJy4vaG9tZXN0ZWFkJztcbmltcG9ydCB7XG4gIENBUlJJRURfQ0FQQUNJVFksIENST1BfR1JPV1RIX1RJQ0tTLCBDUk9QX1BMT1RfSURTLCBGT1VOREVSX1NUT0NLUElMRSxcbiAgRk9VTkRFUl9TVE9DS1BJTEVfSUQsIExJRkVfUkVTT1VSQ0VTLCBNQVhfUFJPRFVDVElPTl9KT0JTLCBNQVhfVElDS1NfUEVSX0NPTU1BTkQsXG4gIFJFQ0lQRVMsIFNUT0NLUElMRV9DQVBBQ0lUWSwgY3JlYXRlTGlmZVN0YXRlLFxufSBmcm9tICcuL2Vjb25vbXknO1xuXG5leHBvcnQgY29uc3QgU05BUFNIT1RfU0NIRU1BID0gMSBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBERVNJR05fU05BUFNIT1RfU0NIRU1BID0gMiBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSA9IDMgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgTUFYX1NOQVBTSE9UX0pTT05fQllURVMgPSAyNV8wMDBfMDAwO1xuZXhwb3J0IGNvbnN0IE1BWF9TTkFQU0hPVF9FRElUUyA9IDFfMDAwXzAwMDtcbmV4cG9ydCBjb25zdCBNQVhfU05BUFNIT1RfRU5USVRJRVMgPSA1MDBfMDAwO1xuXG5pbnRlcmZhY2UgQmFzZVdvcmxkU25hcHNob3Qge1xuICBzY2hlbWE6IHR5cGVvZiBTTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQTtcbiAgbWFuaWZlc3Q6IFdvcmxkTWFuaWZlc3Q7XG4gIHJldmlzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBBcnJheTx7IGNodW5rOiBzdHJpbmc7IGNlbGxzOiBBcnJheTx7IGk6IG51bWJlcjsgbTogbnVtYmVyIH0+IH0+O1xuICBlbnRpdGllczogRW50aXR5W107XG4gIC8qKiBDaHVua3Mgd2l0aCBkdXJhYmxlIGdlbmVyYXRlZC1lbnRpdHkgY2hhbmdlczsgcHVyZSBxdWVyaWVzIGFyZSBleGNsdWRlZC4gKi9cbiAgZW50aXR5Q2h1bmtzOiBzdHJpbmdbXTtcbiAgZW50aXR5UmVtb3ZhbHM6IHN0cmluZ1tdO1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHN0cnVjdHVyZXM6IFN0cnVjdHVyZVtdO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqIE5leHQgYWNjZXB0ZWQgam91cm5hbCBzZXF1ZW5jZSBhdCB0aGlzIHNuYXBzaG90IGJvdW5kYXJ5LiAqL1xuICBuZXh0U2VxdWVuY2U6IG51bWJlcjtcbn1cbmV4cG9ydCB0eXBlIFdvcmxkU25hcHNob3QgPSBCYXNlV29ybGRTbmFwc2hvdCAmICh7XG4gIHNjaGVtYTogdHlwZW9mIFNOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fU05BUFNIT1RfU0NIRU1BO1xufSB8IHtcbiAgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUE7XG4gIHRpY2s6IG51bWJlcjtcbiAgc3RvY2twaWxlczogQXJyYXk8e1xuICAgIGlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7IHg6IG51bWJlcjsgejogbnVtYmVyO1xuICAgIGNhcGFjaXR5OiB0eXBlb2YgU1RPQ0tQSUxFX0NBUEFDSVRZOyBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIH0+O1xuICBqb2JzOiBBcnJheTx7XG4gICAgaWQ6IHN0cmluZzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgICByZWNpcGU6ICdzZWVkJyB8ICdyYXRpb25zJzsgcmVtYWluaW5nVGlja3M6IG51bWJlcjtcbiAgfT47XG4gIGNyb3BzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHBsYW50ZWRUaWNrOiBudW1iZXI7IGdyb3d0aFRpY2tzOiB0eXBlb2YgQ1JPUF9HUk9XVEhfVElDS1MgfT47XG4gIC8qKiBNMDA2OiBhYnNlbnQgdW50aWwgZm91bmRlZCwgc28gb2xkZXIgc2F2ZXMga2VlcCB0aGVpciBleGFjdCBieXRlcyBhbmQgaGFzaGVzLiAqL1xuICBob21lc3RlYWQ/OiBIb21lc3RlYWRTdGF0ZTtcbn0pO1xudHlwZSBMaWZlU25hcHNob3QgPSBFeHRyYWN0PFdvcmxkU25hcHNob3QsIHsgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgfT47XG5cbmZ1bmN0aW9uIGNsb25lRW50aXR5KGU6IEVudGl0eSk6IEVudGl0eSB7XG4gIHJldHVybiB7XG4gICAgaWQ6IGUuaWQsIGtpbmQ6IGUua2luZCwgY2h1bms6IGUuY2h1bmssIHg6IGUueCwgeTogZS55LCB6OiBlLnosXG4gICAgcm90OiBlLnJvdCwgc2NhbGU6IGUuc2NhbGUsIHZhcmlhbnQ6IGUudmFyaWFudCwgcmVzb3VyY2U6IGUucmVzb3VyY2UsXG4gICAgcmVtYWluaW5nOiBlLnJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0OiBlLnlpZWxkUGVySGFydmVzdCwgaGFydmVzdGVkOiBlLmhhcnZlc3RlZCxcbiAgICAuLi4oZS5oYXJ2ZXN0ZWRPbmNlID09PSB1bmRlZmluZWQgPyB7fSA6IHsgaGFydmVzdGVkT25jZTogZS5oYXJ2ZXN0ZWRPbmNlIH0pLFxuICAgIHByb3Zpc2lvbmFsOiBlLnByb3Zpc2lvbmFsLCBhdXRob3JlZDogZS5hdXRob3JlZCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gY2xvbmVTdHJ1Y3R1cmUoczogU3RydWN0dXJlKTogU3RydWN0dXJlIHtcbiAgcmV0dXJuIHtcbiAgICAuLi5zLFxuICAgIG1vZHVsZXM6IHMubW9kdWxlcy5tYXAoKG0pID0+ICh7IC4uLm0gfSkpLFxuICAgIGNvc3Q6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhzLmNvc3QpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gKGFtb3VudCA/PyAwKSA+IDApXG4gICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGRTbmFwc2hvdChcbiAgd29ybGQ6IFdvcmxkLCBuZXh0U2VxdWVuY2UgPSAwLFxuICBzY2hlbWE6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddID0gd29ybGQubGlmZSA/IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BXG4gICAgOiBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29tZSgocykgPT4gcy5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKVxuICAgICAgPyBERVNJR05fU05BUFNIT1RfU0NIRU1BIDogU05BUFNIT1RfU0NIRU1BLFxuKTogV29ybGRTbmFwc2hvdCB7XG4gIGlmIChzY2hlbWEgIT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BICYmICh3b3JsZC5saWZlIHx8IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb21lKFxuICAgIChzKSA9PiBzY2hlbWEgPT09IFNOQVBTSE9UX1NDSEVNQSAmJiBzLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZCxcbiAgKSkpIHRocm93IG5ldyBFcnJvcignbGVnYWN5IHNuYXBzaG90cyBjYW5ub3QgY29udGFpbiBuZXdlciBhdXRob3JpdGF0aXZlIHN0YXRlJyk7XG4gIGNvbnN0IGJhc2U6IEJhc2VXb3JsZFNuYXBzaG90ID0ge1xuICAgIHNjaGVtYSxcbiAgICBtYW5pZmVzdDogd29ybGRNYW5pZmVzdCh3b3JsZCksXG4gICAgcmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIGVkaXRzOiBbLi4ud29ybGQuZWRpdHMuZW50cmllcygpXS5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKS5tYXAoXG4gICAgICAoW2NodW5rLCBjZWxsc10pID0+ICh7XG4gICAgICAgIGNodW5rLFxuICAgICAgICBjZWxsczogWy4uLmNlbGxzLmVudHJpZXMoKV0uc29ydCgoW2FdLCBbYl0pID0+IGEgLSBiKS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSksXG4gICAgICB9KSxcbiAgICApLFxuICAgIGVudGl0aWVzOiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLmZpbHRlcigoZSkgPT4gKGlzSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZCkgfHwgIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKVxuICAgICAgJiYgKGUuYXV0aG9yZWQgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoZS5jaHVuaykpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKGNsb25lRW50aXR5KSxcbiAgICBlbnRpdHlDaHVua3M6IFsuLi53b3JsZC5lbnRpdHlDaGFuZ2VzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICAgIGVudGl0eVJlbW92YWxzOiBbLi4ud29ybGQuZW50aXR5UmVtb3ZhbHNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgaW52ZW50b3J5OiBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMod29ybGQuaW52ZW50b3J5KS5maWx0ZXIoKFssIGFtb3VudF0pID0+IGFtb3VudCA+IDApXG4gICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICAgIHN0cnVjdHVyZXM6IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcChjbG9uZVN0cnVjdHVyZSksXG4gICAgYXV0aG9yZWRQbGFjZWQ6IHdvcmxkLmF1dGhvcmVkUGxhY2VkLFxuICAgIG5leHRTZXF1ZW5jZSxcbiAgfTtcbiAgaWYgKHNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEpIHJldHVybiB7IC4uLmJhc2UsIHNjaGVtYSB9IGFzIFdvcmxkU25hcHNob3Q7XG4gIGlmICghd29ybGQubGlmZSkgdGhyb3cgbmV3IEVycm9yKCdzY2hlbWEtMyBzbmFwc2hvdCByZXF1aXJlcyBsaWZlIHN0YXRlJyk7XG4gIHJldHVybiB7XG4gICAgLi4uYmFzZSwgc2NoZW1hLFxuICAgIHRpY2s6IHdvcmxkLmxpZmUudGljayxcbiAgICBzdG9ja3BpbGVzOiBbLi4ud29ybGQubGlmZS5zdG9ja3BpbGVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgocykgPT4gKHtcbiAgICAgIGlkOiBzLmlkLCB4OiBzLngsIHo6IHMueiwgY2FwYWNpdHk6IHMuY2FwYWNpdHksXG4gICAgICBpbnZlbnRvcnk6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhzLmludmVudG9yeSkuZmlsdGVyKChbLCBhbW91bnRdKSA9PiBhbW91bnQgPiAwKVxuICAgICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICAgIH0pKSxcbiAgICBqb2JzOiBbLi4ud29ybGQubGlmZS5qb2JzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgoaikgPT4gKHsgLi4uaiB9KSksXG4gICAgY3JvcHM6IFsuLi53b3JsZC5saWZlLmNyb3BzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgoYykgPT4gKHsgLi4uYyB9KSksXG4gICAgLi4uKHdvcmxkLmhvbWVzdGVhZCA/IHsgaG9tZXN0ZWFkOiBob21lc3RlYWRTbmFwc2hvdCh3b3JsZC5ob21lc3RlYWQpIH0gOiB7fSksXG4gIH07XG59XG5cbi8qKiBUd28gbGFuZXMsIHdpdGggbGVuZ3RoIGluY2x1ZGVkOyBub3QgYSBjcnlwdG9ncmFwaGljIGludGVncml0eSBzaWduYXR1cmUuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSGFzaCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzUsIGIgPSAweDllMzc3OWI5O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKSArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbFdvcmxkSGFzaChcbiAgd29ybGQ6IFdvcmxkLCBuZXh0U2VxdWVuY2UgPSAwLCBzY2hlbWE6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddID0gREVTSUdOX1NOQVBTSE9UX1NDSEVNQSxcbik6IHN0cmluZyB7XG4gIHJldHVybiBjYW5vbmljYWxIYXNoKEpTT04uc3RyaW5naWZ5KGNyZWF0ZVdvcmxkU25hcHNob3Qod29ybGQsIG5leHRTZXF1ZW5jZSwgc2NoZW1hKSkpO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB1aW50KHZhbHVlOiB1bmtub3duLCBtYXhpbXVtOiBudW1iZXIpOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNTYWZlSW50ZWdlcih2YWx1ZSkgJiYgdmFsdWUgPj0gMCAmJiB2YWx1ZSA8PSBtYXhpbXVtO1xufVxuXG5mdW5jdGlvbiBmaW5pdGUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB0ZXh0KHZhbHVlOiB1bmtub3duLCBtYXhpbXVtID0gMjU2KTogdmFsdWUgaXMgc3RyaW5nIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubGVuZ3RoID4gMCAmJiB2YWx1ZS5sZW5ndGggPD0gbWF4aW11bTtcbn1cblxuZnVuY3Rpb24gdmFsaWRDaHVuayhrZXk6IHVua25vd24pOiBrZXkgaXMgc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBrZXkgIT09ICdzdHJpbmcnIHx8ICEvXi0/XFxkKywtP1xcZCskLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIoY3gpICYmIE51bWJlci5pc0ludGVnZXIoY3opXG4gICAgJiYgY3ggPj0gMCAmJiBjeiA+PSAwICYmIGN4IDwgQ0hVTktTX1BFUl9TSURFICYmIGN6IDwgQ0hVTktTX1BFUl9TSURFO1xufVxuXG4vKiogQSBzdHJpY3QgbGVnYWN5IHNuYXBzaG90IGlzIGFscmVhZHkgY2Fub25pY2FsIGNyZWF0ZVdvcmxkU25hcHNob3Qgb3V0cHV0LlxuICogVmVyaWZ5IGl0cyByZWNvcmRlZCBib3VuZGFyeSBiZWZvcmUgZmlsdGVyaW5nIHRoZSB0aHJlZSByZXRpcmVkIHN0b25lIGZvcm1zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IHN0cmluZyB7XG4gIHJldHVybiBjYW5vbmljYWxIYXNoKEpTT04uc3RyaW5naWZ5KHNuYXBzaG90KSk7XG59XG5cbi8qKiBNaWdyYXRpb24gb25seTogbm8gaW52ZW50b3J5LCBzdHJ1Y3R1cmUsIGxpZmUsIGVkaXQgb3IgY29tbWFuZCBkYXRhIGNoYW5nZXMuICovXG4vKiogQGludGVybmFsIFJldGlyZSBvbmx5IGFmdGVyIHJlY29uc3RydWN0aW5nIHRoZSBvbGQgc3RhdGUgaW4gcmVwbGF5IG1vZGUuICovXG5leHBvcnQgZnVuY3Rpb24gbWlncmF0ZVN0b25lU25hcHNob3Qoc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBXb3JsZFNuYXBzaG90IHtcbiAgY29uc3QgcmVtb3ZhbHMgPSBuZXcgU2V0KHNuYXBzaG90LmVudGl0eVJlbW92YWxzKTtcbiAgZm9yIChjb25zdCBlbnRpdHkgb2Ygc25hcHNob3QuZW50aXRpZXMpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhZW50aXR5LmF1dGhvcmVkKSByZW1vdmFscy5hZGQoZW50aXR5LmlkKTtcbiAgfVxuICBjb25zdCBlbnRpdHlDaHVua3MgPSBuZXcgU2V0KHNuYXBzaG90LmVudGl0eUNodW5rcyk7XG4gIGZvciAoY29uc3QgZW50aXR5IG9mIHNuYXBzaG90LmVudGl0aWVzKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpIHtcbiAgICAgIGVudGl0eUNodW5rcy5hZGQoZW50aXR5LmNodW5rKTtcbiAgICAgIGlmICghZW50aXR5LmF1dGhvcmVkKSByZW1vdmFscy5hZGQoZW50aXR5LmlkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtcbiAgICAuLi5zbmFwc2hvdCxcbiAgICBlbnRpdGllczogc25hcHNob3QuZW50aXRpZXMuZmlsdGVyKChlbnRpdHkpID0+ICFpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSxcbiAgICBlbnRpdHlDaHVua3M6IFsuLi5lbnRpdHlDaHVua3NdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgZW50aXR5UmVtb3ZhbHM6IFsuLi5yZW1vdmFsc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgfTtcbn1cbmNvbnN0IEVOVElUWV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF90cmVlX3NwaXJlJywgJ3N0eWxfdHJlZV90YWJsZScsICdzdHlsX3RyZWVfY2x1c3RlcicsICdzdHlsX3RyZWVfYmxvc3NvbScsXG4gICdzdHlsX3NocnViJywgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG4gICdzdHlsX29yZScsICdzdHlsX2NhaXJuJywgJ3dheXN0b25lJywgJ21hcmtlcicsXG5dKTtcbmNvbnN0IFJFU09VUkNFUyA9IG5ldyBTZXQ8UmVzb3VyY2VUeXBlPihbJ3dvb2QnLCAnc3RvbmUnLCAnb3JlJywgJ2ZpYmVyJ10pO1xuY29uc3QgUkVDT1JEX1JFU09VUkNFUyA9IG5ldyBTZXQ8c3RyaW5nPihMSUZFX1JFU09VUkNFUyk7XG5jb25zdCBTVFJVQ1RVUkVfS0lORFMgPSBuZXcgU2V0KFsnaG91c2UnLCAncGF0aCcsICd0ZXJyYWNlJ10pO1xuY29uc3QgTU9EVUxFX0tJTkRTID0gbmV3IFNldChbXG4gICdmbG9vcicsICd3YWxsJywgJ3Bvc3QnLCAnbGludGVsJywgJ3Jvb2YnLCAncGFyYXBldCcsICd3aW5kb3cnLCAnZG9vcicsXG4gICd0aHJlc2hvbGQnLCAncGF0aCcsICdjdXJiJywgJ3NvaWxfYmVkJywgJ3JldGFpbmluZ193YWxsJywgJ2Nyb3Bfcm93Jyxcbl0pO1xuY29uc3QgTU9EVUxFX1RPTkVTID0gbmV3IFNldChbJ3N0b25lJywgJ3N0b25lX2InLCAnb2NocmUnLCAndGltYmVyJywgJ2FjY2VudCcsICdzb2lsJywgJ2Nyb3AnLCAnZ3JhdmVsJ10pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZUVudGl0eSh2YWx1ZTogdW5rbm93biwgaWRzOiBTZXQ8c3RyaW5nPik6IEVudGl0eSB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpIHx8ICF0ZXh0KHZhbHVlLmlkKSB8fCBpZHMuaGFzKHZhbHVlLmlkKVxuICAgIHx8ICF0ZXh0KHZhbHVlLmtpbmQpIHx8ICFFTlRJVFlfS0lORFMuaGFzKHZhbHVlLmtpbmQgYXMgRW50aXR5S2luZClcbiAgICB8fCAhdmFsaWRDaHVuayh2YWx1ZS5jaHVuaylcbiAgICB8fCAhZmluaXRlKHZhbHVlLngpIHx8ICFmaW5pdGUodmFsdWUueSkgfHwgIWZpbml0ZSh2YWx1ZS56KVxuICAgIHx8IHZhbHVlLnggPCAtSEFMRiB8fCB2YWx1ZS54ID49IEhBTEYgfHwgdmFsdWUueiA8IC1IQUxGIHx8IHZhbHVlLnogPj0gSEFMRlxuICAgIHx8ICFmaW5pdGUodmFsdWUucm90KSB8fCAhZmluaXRlKHZhbHVlLnNjYWxlKSB8fCAhdWludCh2YWx1ZS52YXJpYW50LCAxMDAwKVxuICAgIHx8IHZhbHVlLnJlc291cmNlICE9PSBudWxsICYmICEodHlwZW9mIHZhbHVlLnJlc291cmNlID09PSAnc3RyaW5nJyAmJiBSRVNPVVJDRVMuaGFzKHZhbHVlLnJlc291cmNlIGFzIFJlc291cmNlVHlwZSkpXG4gICAgfHwgIXVpbnQodmFsdWUucmVtYWluaW5nLCAxXzAwMF8wMDApIHx8ICF1aW50KHZhbHVlLnlpZWxkUGVySGFydmVzdCwgMV8wMDBfMDAwKVxuICAgIHx8IHR5cGVvZiB2YWx1ZS5oYXJ2ZXN0ZWQgIT09ICdib29sZWFuJyB8fCB0eXBlb2YgdmFsdWUucHJvdmlzaW9uYWwgIT09ICdib29sZWFuJ1xuICAgIHx8IHR5cGVvZiB2YWx1ZS5hdXRob3JlZCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgdmFsdWUuaGFydmVzdGVkT25jZSAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiB2YWx1ZS5oYXJ2ZXN0ZWRPbmNlICE9PSAnYm9vbGVhbicpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGFuIGludmFsaWQgb3IgZHVwbGljYXRlIGVudGl0eScpO1xuICB9XG4gIGlkcy5hZGQodmFsdWUuaWQpO1xuICByZXR1cm4ge1xuICAgIGlkOiB2YWx1ZS5pZCwga2luZDogdmFsdWUua2luZCBhcyBFbnRpdHlLaW5kLCBjaHVuazogdmFsdWUuY2h1bmssXG4gICAgeDogdmFsdWUueCwgeTogdmFsdWUueSwgejogdmFsdWUueiwgcm90OiB2YWx1ZS5yb3QsIHNjYWxlOiB2YWx1ZS5zY2FsZSxcbiAgICB2YXJpYW50OiB2YWx1ZS52YXJpYW50LCByZXNvdXJjZTogdmFsdWUucmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlIHwgbnVsbCxcbiAgICByZW1haW5pbmc6IHZhbHVlLnJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0OiB2YWx1ZS55aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiB2YWx1ZS5oYXJ2ZXN0ZWQsXG4gICAgLi4uKHZhbHVlLmhhcnZlc3RlZE9uY2UgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBoYXJ2ZXN0ZWRPbmNlOiB2YWx1ZS5oYXJ2ZXN0ZWRPbmNlIH0pLFxuICAgIHByb3Zpc2lvbmFsOiB2YWx1ZS5wcm92aXNpb25hbCwgYXV0aG9yZWQ6IHZhbHVlLmF1dGhvcmVkLFxuICB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBpbnZlbnRvcnkgaXMgaW52YWxpZCcpO1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKSkge1xuICAgIGlmICghUkVDT1JEX1JFU09VUkNFUy5oYXMoa2V5KSB8fCAhdWludCh2YWx1ZVtrZXldLCAxXzAwMF8wMDBfMDAwKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBzbmFwc2hvdCBoYXMgaW52YWxpZCBpbnZlbnRvcnkgcmVzb3VyY2UgJHtrZXl9YCk7XG4gICAgfVxuICAgIGlmICh2YWx1ZVtrZXldID4gMCkgb3V0W2tleV0gPSB2YWx1ZVtrZXldO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHN0b2NrVG90YWwodmFsdWU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pOiBudW1iZXIge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyh2YWx1ZSkucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVMaWZlRmllbGRzKHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFBpY2s8TGlmZVNuYXBzaG90LCAndGljaycgfCAnc3RvY2twaWxlcycgfCAnam9icycgfCAnY3JvcHMnIHwgJ2hvbWVzdGVhZCc+IHtcbiAgaWYgKCF1aW50KHZhbHVlLnRpY2ssIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLnN0b2NrcGlsZXMpIHx8IHZhbHVlLnN0b2NrcGlsZXMubGVuZ3RoICE9PSAxXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuam9icykgfHwgdmFsdWUuam9icy5sZW5ndGggPiBNQVhfUFJPRFVDVElPTl9KT0JTXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuY3JvcHMpIHx8IHZhbHVlLmNyb3BzLmxlbmd0aCA+IENST1BfUExPVF9JRFMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgaW52YWxpZCBsaWZlLWxvb3AgZmllbGRzJyk7XG4gIH1cbiAgY29uc3Qgc3RvY2twaWxlczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90WydzdG9ja3BpbGVzJ10+ID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLnN0b2NrcGlsZXMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgcmF3LmlkICE9PSBGT1VOREVSX1NUT0NLUElMRV9JRCB8fCByYXcueCAhPT0gRk9VTkRFUl9TVE9DS1BJTEUueFxuICAgICAgfHwgcmF3LnogIT09IEZPVU5ERVJfU1RPQ0tQSUxFLnogfHwgcmF3LmNhcGFjaXR5ICE9PSBGT1VOREVSX1NUT0NLUElMRS5jYXBhY2l0eSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gdW5zdXBwb3J0ZWQgc3RvY2twaWxlJyk7XG4gICAgfVxuICAgIGNvbnN0IGludmVudG9yeSA9IHZhbGlkYXRlSW52ZW50b3J5KHJhdy5pbnZlbnRvcnkpO1xuICAgIGlmIChzdG9ja1RvdGFsKGludmVudG9yeSkgPiBTVE9DS1BJTEVfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignc3RvY2twaWxlIGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgICBzdG9ja3BpbGVzLnB1c2goeyBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IHJhdy54LCB6OiByYXcueixcbiAgICAgIGNhcGFjaXR5OiBTVE9DS1BJTEVfQ0FQQUNJVFksIGludmVudG9yeSB9KTtcbiAgfVxuICBsZXQgcmVzZXJ2ZWQgPSBzdG9ja1RvdGFsKHN0b2NrcGlsZXNbMF0uaW52ZW50b3J5KTtcbiAgY29uc3QgaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IGpvYnM6IE5vbk51bGxhYmxlPExpZmVTbmFwc2hvdFsnam9icyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5qb2JzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF0ZXh0KHJhdy5pZCwgMTI4KSB8fCAhL15bQS1aYS16MC05XVtBLVphLXowLTkuXzolLV0qJC8udGVzdChyYXcuaWQpXG4gICAgICB8fCBpZHMuaGFzKHJhdy5pZCkgfHwgcmF3LnN0b2NrcGlsZUlkICE9PSBGT1VOREVSX1NUT0NLUElMRV9JRFxuICAgICAgfHwgcmF3LnJlY2lwZSAhPT0gJ3NlZWQnICYmIHJhdy5yZWNpcGUgIT09ICdyYXRpb25zJ1xuICAgICAgfHwgIXVpbnQocmF3LnJlbWFpbmluZ1RpY2tzLCBNQVhfVElDS1NfUEVSX0NPTU1BTkQpIHx8IHJhdy5yZW1haW5pbmdUaWNrcyA8IDFcbiAgICAgIHx8IHJhdy5yZW1haW5pbmdUaWNrcyA+IFJFQ0lQRVNbcmF3LnJlY2lwZV0udGlja3MpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIGludmFsaWQgcHJvZHVjdGlvbiBqb2InKTtcbiAgICByZXNlcnZlZCArPSBzdG9ja1RvdGFsKFJFQ0lQRVNbcmF3LnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pO1xuICAgIGlkcy5hZGQocmF3LmlkKTtcbiAgICBqb2JzLnB1c2goeyBpZDogcmF3LmlkLCBzdG9ja3BpbGVJZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHJlY2lwZTogcmF3LnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHJhdy5yZW1haW5pbmdUaWNrcyB9KTtcbiAgfVxuICBpZiAocmVzZXJ2ZWQgPiBTVE9DS1BJTEVfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignc3RvY2twaWxlIHJlc2VydmVkIG91dHB1dCBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gIGlkcy5jbGVhcigpO1xuICBjb25zdCBjcm9wczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90Wydjcm9wcyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5jcm9wcykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhQ1JPUF9QTE9UX0lEUy5pbmNsdWRlcyhTdHJpbmcocmF3LmlkKSkgfHwgaWRzLmhhcyhTdHJpbmcocmF3LmlkKSlcbiAgICAgIHx8ICF1aW50KHJhdy5wbGFudGVkVGljaywgdmFsdWUudGljaykgfHwgcmF3Lmdyb3d0aFRpY2tzICE9PSBDUk9QX0dST1dUSF9USUNLUykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gaW52YWxpZCBjcm9wIHBsb3QnKTtcbiAgICB9XG4gICAgY29uc3QgcGxvdElkID0gU3RyaW5nKHJhdy5pZCk7XG4gICAgaWRzLmFkZChwbG90SWQpO1xuICAgIGNyb3BzLnB1c2goeyBpZDogcGxvdElkLCBwbGFudGVkVGljazogcmF3LnBsYW50ZWRUaWNrLCBncm93dGhUaWNrczogQ1JPUF9HUk9XVEhfVElDS1MgfSk7XG4gIH1cbiAgc3RvY2twaWxlcy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBqb2JzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGNyb3BzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGNvbnN0IGhvbWVzdGVhZCA9IHZhbHVlLmhvbWVzdGVhZCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogdmFsaWRhdGVIb21lc3RlYWQodmFsdWUuaG9tZXN0ZWFkLCB2YWx1ZS50aWNrKTtcbiAgcmV0dXJuIHsgdGljazogdmFsdWUudGljaywgc3RvY2twaWxlcywgam9icywgY3JvcHMsIC4uLihob21lc3RlYWQgPyB7IGhvbWVzdGVhZCB9IDoge30pIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ29zdCh2YWx1ZTogdW5rbm93bik6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICBjb25zdCBvdXQgPSB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU3RydWN0dXJlKFxuICB2YWx1ZTogdW5rbm93biwgaWRzOiBTZXQ8c3RyaW5nPiwgc2NoZW1hOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSxcbik6IFN0cnVjdHVyZSB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpIHx8ICF0ZXh0KHZhbHVlLmlkKSB8fCBpZHMuaGFzKHZhbHVlLmlkKVxuICAgIHx8ICF0ZXh0KHZhbHVlLmtpbmQpIHx8ICFTVFJVQ1RVUkVfS0lORFMuaGFzKHZhbHVlLmtpbmQpXG4gICAgfHwgIXRleHQodmFsdWUuc2l0ZUlkKVxuICAgIHx8ICFmaW5pdGUodmFsdWUueCkgfHwgIWZpbml0ZSh2YWx1ZS55KSB8fCAhZmluaXRlKHZhbHVlLnopIHx8ICFmaW5pdGUodmFsdWUucm90KVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLm1vZHVsZXMpIHx8IHZhbHVlLm1vZHVsZXMubGVuZ3RoID4gNjRcbiAgICB8fCAhdWludCh2YWx1ZS5idWlsdFJldmlzaW9uLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikgfHwgdmFsdWUucHJvdmlzaW9uYWwgIT09IHRydWVcbiAgICB8fCBzY2hlbWEgPT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWRcbiAgICB8fCBzY2hlbWEgIT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWRcbiAgICAgICYmIHZhbHVlLmRlc2lnblZlcnNpb24gIT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGFuIGludmFsaWQgb3IgZHVwbGljYXRlIHN0cnVjdHVyZScpO1xuICB9XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZVsnbW9kdWxlcyddID0gW107XG4gIGNvbnN0IG1vZHVsZUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5tb2R1bGVzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF0ZXh0KHJhdy5raW5kKSB8fCAhTU9EVUxFX0tJTkRTLmhhcyhyYXcua2luZClcbiAgICAgIHx8ICFmaW5pdGUocmF3LngpIHx8ICFmaW5pdGUocmF3LnkpIHx8ICFmaW5pdGUocmF3LnopXG4gICAgICB8fCAhZmluaXRlKHJhdy53KSB8fCByYXcudyA8PSAwIHx8ICFmaW5pdGUocmF3LmgpIHx8IHJhdy5oIDw9IDAgfHwgIWZpbml0ZShyYXcuZCkgfHwgcmF3LmQgPD0gMFxuICAgICAgfHwgcmF3LnJvdCAhPT0gdW5kZWZpbmVkICYmICFmaW5pdGUocmF3LnJvdClcbiAgICAgIHx8IHJhdy50b25lICE9PSB1bmRlZmluZWQgJiYgKHR5cGVvZiByYXcudG9uZSAhPT0gJ3N0cmluZycgfHwgIU1PRFVMRV9UT05FUy5oYXMocmF3LnRvbmUpKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBzdHJ1Y3R1cmUgJHt2YWx1ZS5pZH0gY29udGFpbnMgYW4gaW52YWxpZCBtb2R1bGVgKTtcbiAgICB9XG4gICAgY29uc3Qgc2lnbmF0dXJlID0gSlNPTi5zdHJpbmdpZnkocmF3KTtcbiAgICBpZiAobW9kdWxlSWRzLmhhcyhzaWduYXR1cmUpKSB0aHJvdyBuZXcgRXJyb3IoYHN0cnVjdHVyZSAke3ZhbHVlLmlkfSBjb250YWlucyBkdXBsaWNhdGUgbW9kdWxlc2ApO1xuICAgIG1vZHVsZUlkcy5hZGQoc2lnbmF0dXJlKTtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogcmF3LmtpbmQgYXMgU3RydWN0dXJlWydtb2R1bGVzJ11bbnVtYmVyXVsna2luZCddLFxuICAgICAgeDogcmF3LngsIHk6IHJhdy55LCB6OiByYXcueiwgdzogcmF3LncsIGg6IHJhdy5oLCBkOiByYXcuZCxcbiAgICAgIC4uLihyYXcucm90ID09PSB1bmRlZmluZWQgPyB7fSA6IHsgcm90OiByYXcucm90IH0pLFxuICAgICAgLi4uKHJhdy50b25lID09PSB1bmRlZmluZWQgPyB7fSA6IHsgdG9uZTogcmF3LnRvbmUgYXMgU3RydWN0dXJlWydtb2R1bGVzJ11bbnVtYmVyXVsndG9uZSddIH0pLFxuICAgIH0pO1xuICB9XG4gIGlkcy5hZGQodmFsdWUuaWQpO1xuICByZXR1cm4ge1xuICAgIGlkOiB2YWx1ZS5pZCwga2luZDogdmFsdWUua2luZCBhcyBTdHJ1Y3R1cmVbJ2tpbmQnXSwgc2l0ZUlkOiB2YWx1ZS5zaXRlSWQsXG4gICAgeDogdmFsdWUueCwgeTogdmFsdWUueSwgejogdmFsdWUueiwgcm90OiB2YWx1ZS5yb3QsXG4gICAgbW9kdWxlcywgY29zdDogdmFsaWRhdGVDb3N0KHZhbHVlLmNvc3QpLCBidWlsdFJldmlzaW9uOiB2YWx1ZS5idWlsdFJldmlzaW9uLFxuICAgIC4uLih2YWx1ZS5kZXNpZ25WZXJzaW9uID09PSB1bmRlZmluZWQgPyB7fSA6IHsgZGVzaWduVmVyc2lvbjogRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9KSxcbiAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgfTtcbn1cblxuLyoqIFN0cmljdCBydW50aW1lIHZhbGlkYXRpb247IEpTT04ncyBUeXBlU2NyaXB0IGNhc3RzIGFyZSBuZXZlciB0cnVzdGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlV29ybGRTbmFwc2hvdCh2YWx1ZTogdW5rbm93bik6IFdvcmxkU25hcHNob3Qge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKVxuICAgIHx8IHZhbHVlLnNjaGVtYSAhPT0gU05BUFNIT1RfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gREVTSUdOX1NOQVBTSE9UX1NDSEVNQVxuICAgICYmIHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICB8fCAhaXNPYmplY3QodmFsdWUubWFuaWZlc3QpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBvciBtYWxmb3JtZWQgd29ybGQgc25hcHNob3QnKTtcbiAgfVxuICBjb25zdCBzY2hlbWEgPSB2YWx1ZS5zY2hlbWE7XG4gIGNvbnN0IG0gPSB2YWx1ZS5tYW5pZmVzdDtcbiAgLy8gRXZlcnkgc3VwcG9ydGVkIGdlbmVyYXRvciByZXN0b3JlcyB3aXRoIGl0cyBvd24gdmVyc2lvbjsgdjEgc2F2ZXMga2VlcFxuICAvLyBHRU5FUkFUT1JfVkVSU0lPTiBleGFjdGx5LCBzbyB0aGVpciBtYW5pZmVzdHMgYW5kIGhhc2hlcyBhcmUgdW5jaGFuZ2VkLlxuICBjb25zdCBwYXJhbXMgPSB7XG4gICAgc2l6ZTogMjA0OCwgY2h1bmtTaXplOiBDSFVOS19TSVpFLCB5TWluOiAtMTYsIHlNYXg6IDExMixcbiAgICBzZWFMZXZlbDogMCwgZ2VuZXJhdG9yVmVyc2lvbjogaXNTdXBwb3J0ZWRHZW5lcmF0b3IobS5nZW5lcmF0b3JWZXJzaW9uKSA/IG0uZ2VuZXJhdG9yVmVyc2lvbiA6IEdFTkVSQVRPUl9WRVJTSU9OLFxuICB9O1xuICBpZiAobS5zY2hlbWEgIT09IDEgfHwgIXVpbnQobS5zZWVkLCAweGZmZmZmZmZmKVxuICAgIHx8ICFpc1N1cHBvcnRlZEdlbmVyYXRvcihtLmdlbmVyYXRvclZlcnNpb24pXG4gICAgfHwgbS5zaXplICE9PSBwYXJhbXMuc2l6ZSB8fCBtLmNodW5rU2l6ZSAhPT0gcGFyYW1zLmNodW5rU2l6ZVxuICAgIHx8IG0ueU1pbiAhPT0gcGFyYW1zLnlNaW4gfHwgbS55TWF4ICE9PSBwYXJhbXMueU1heCB8fCBtLnNlYUxldmVsICE9PSBwYXJhbXMuc2VhTGV2ZWxcbiAgICB8fCAhL15bMC05YS1mXXs4fSQvLnRlc3QoU3RyaW5nKG0ucGFyYW1zSGFzaCkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBnZW5lcmF0b3IgY29uZmlndXJhdGlvbiBpcyB1bnN1cHBvcnRlZCBvciBpbmNvbXBhdGlibGUnKTtcbiAgfVxuICBpZiAoIXVpbnQodmFsdWUucmV2aXNpb24sIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKVxuICAgIHx8ICF1aW50KHZhbHVlLm5leHRTZXF1ZW5jZSwgMTBfMDAwXzAwMClcbiAgICB8fCB0eXBlb2YgdmFsdWUuYXV0aG9yZWRQbGFjZWQgIT09ICdib29sZWFuJ1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVkaXRzKSB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRpdGllcylcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRpdHlSZW1vdmFscylcbiAgICB8fCB2YWx1ZS5lbnRpdGllcy5sZW5ndGggPiBNQVhfU05BUFNIT1RfRU5USVRJRVNcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRpdHlDaHVua3MpIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLnN0cnVjdHVyZXMpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgaW52YWxpZCBhdXRob3JpdGF0aXZlLXN0YXRlIGZpZWxkcycpO1xuICB9XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQobS5zZWVkLCBwYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbik7XG4gIC8vIFRoZSBtYW5pZmVzdCBoYXNoIGlzIGNoZWNrZWQgYWdhaW5zdCB0aGUgYWN0dWFsIHJlc3RvcmVkIGNvbmZpZ3VyYXRpb24uXG4gIGlmICh3b3JsZE1hbmlmZXN0KHdvcmxkKS5wYXJhbXNIYXNoICE9PSBtLnBhcmFtc0hhc2gpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgbWFuaWZlc3QgaGFzaCBtaXNtYXRjaCcpO1xuXG4gIGNvbnN0IGVkaXRzOiBXb3JsZFNuYXBzaG90WydlZGl0cyddID0gW107XG4gIGxldCBlZGl0Q291bnQgPSAwO1xuICBjb25zdCBjaHVua0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5lZGl0cykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhdmFsaWRDaHVuayhyYXcuY2h1bmspIHx8IGNodW5rSWRzLmhhcyhyYXcuY2h1bmspXG4gICAgICB8fCAhQXJyYXkuaXNBcnJheShyYXcuY2VsbHMpIHx8IHJhdy5jZWxscy5sZW5ndGggPiBDSFVOS19WT0xVTUUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgaW52YWxpZCBjaHVuayBlZGl0cycpO1xuICAgIH1cbiAgICBjb25zdCBjZWxsSWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgY29uc3QgY2VsbHM6IEFycmF5PHsgaTogbnVtYmVyOyBtOiBudW1iZXIgfT4gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNlbGwgb2YgcmF3LmNlbGxzKSB7XG4gICAgICBpZiAoIWlzT2JqZWN0KGNlbGwpIHx8ICF1aW50KGNlbGwuaSwgQ0hVTktfVk9MVU1FIC0gMSkgfHwgY2VsbElkcy5oYXMoY2VsbC5pKVxuICAgICAgICB8fCAhdWludChjZWxsLm0sIE1BWF9NQVRfSUQpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGFuIGludmFsaWQgdm94ZWwgZWRpdCcpO1xuICAgICAgY2VsbElkcy5hZGQoY2VsbC5pKTtcbiAgICAgIGNlbGxzLnB1c2goeyBpOiBjZWxsLmksIG06IGNlbGwubSB9KTtcbiAgICB9XG4gICAgY2VsbElkcy5jbGVhcigpO1xuICAgIGNlbGxzLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSk7XG4gICAgZWRpdENvdW50ICs9IGNlbGxzLmxlbmd0aDtcbiAgICBpZiAoZWRpdENvdW50ID4gTUFYX1NOQVBTSE9UX0VESVRTKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGV4Y2VlZHMgdGhlIGJvdW5kZWQgZWRpdCBsaW1pdCcpO1xuICAgIGNodW5rSWRzLmFkZChyYXcuY2h1bmspO1xuICAgIGVkaXRzLnB1c2goeyBjaHVuazogcmF3LmNodW5rLCBjZWxscyB9KTtcbiAgfVxuICBlZGl0cy5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykpO1xuXG4gIGNvbnN0IGVudGl0eUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBlbnRpdGllcyA9IHZhbHVlLmVudGl0aWVzLm1hcCgoZSkgPT4gdmFsaWRhdGVFbnRpdHkoZSwgZW50aXR5SWRzKSk7XG4gIGNvbnN0IGVudGl0eUNodW5rczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgZ2VuZXJhdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIHZhbHVlLmVudGl0eUNodW5rcykge1xuICAgIGlmICghdmFsaWRDaHVuayhrZXkpIHx8IGdlbmVyYXRlZC5oYXMoa2V5KSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBnZW5lcmF0ZWQtY2h1bmsgaW5kZXggaXMgaW52YWxpZCcpO1xuICAgIGdlbmVyYXRlZC5hZGQoa2V5KTtcbiAgICBlbnRpdHlDaHVua3MucHVzaChrZXkpO1xuICB9XG4gIGZvciAoY29uc3QgZW50aXR5IG9mIGVudGl0aWVzKSB7XG4gICAgaWYgKCFlbnRpdHkuYXV0aG9yZWQgJiYgIWdlbmVyYXRlZC5oYXMoZW50aXR5LmNodW5rKSkgdGhyb3cgbmV3IEVycm9yKGBlbnRpdHkgJHtlbnRpdHkuaWR9IGJlbG9uZ3MgdG8gYW4gdW5tYXJrZWQgY2h1bmtgKTtcbiAgfVxuICBlbnRpdHlDaHVua3Muc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcbiAgY29uc3QgcmVtb3ZhbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBpZCBvZiB2YWx1ZS5lbnRpdHlSZW1vdmFscykge1xuICAgIGlmICghdGV4dChpZCkgfHwgcmVtb3ZhbHMuaGFzKGlkKSB8fCBlbnRpdHlJZHMuaGFzKGlkKSB8fCAhL15lOlxcZCssXFxkKzpcXGQrJC8udGVzdChpZCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZW50aXR5IHRvbWJzdG9uZSBpcyBpbnZhbGlkJyk7XG4gICAgfVxuICAgIHJlbW92YWxzLmFkZChpZCk7XG4gIH1cbiAgY29uc3QgZW50aXR5UmVtb3ZhbHMgPSBbLi4ucmVtb3ZhbHNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cbiAgY29uc3Qgc3RydWN0dXJlSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IHN0cnVjdHVyZXMgPSB2YWx1ZS5zdHJ1Y3R1cmVzLm1hcCgocykgPT4gdmFsaWRhdGVTdHJ1Y3R1cmUocywgc3RydWN0dXJlSWRzLCBzY2hlbWEpKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBjb25zdCBjYXJyaWVkID0gdmFsaWRhdGVJbnZlbnRvcnkodmFsdWUuaW52ZW50b3J5KTtcbiAgaWYgKHNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgJiYgc3RvY2tUb3RhbChjYXJyaWVkKSA+IENBUlJJRURfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignY2FycmllZCBpbnZlbnRvcnkgZXhjZWVkcyBjYXBhY2l0eScpO1xuICBjb25zdCBzbmFwc2hvdDogQmFzZVdvcmxkU25hcHNob3QgPSB7XG4gICAgc2NoZW1hLFxuICAgIG1hbmlmZXN0OiB7XG4gICAgICBzY2hlbWE6IDEsIHNlZWQ6IG0uc2VlZCwgZ2VuZXJhdG9yVmVyc2lvbjogcGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgICBzaXplOiBwYXJhbXMuc2l6ZSwgY2h1bmtTaXplOiBwYXJhbXMuY2h1bmtTaXplLCB5TWluOiBwYXJhbXMueU1pbixcbiAgICAgIHlNYXg6IHBhcmFtcy55TWF4LCBzZWFMZXZlbDogcGFyYW1zLnNlYUxldmVsLCBwYXJhbXNIYXNoOiBtLnBhcmFtc0hhc2gsXG4gICAgfSxcbiAgICByZXZpc2lvbjogdmFsdWUucmV2aXNpb24sXG4gICAgZWRpdHMsXG4gICAgZW50aXRpZXMsXG4gICAgZW50aXR5Q2h1bmtzLFxuICAgIGVudGl0eVJlbW92YWxzLFxuICAgIGludmVudG9yeTogY2FycmllZCxcbiAgICBzdHJ1Y3R1cmVzLFxuICAgIGF1dGhvcmVkUGxhY2VkOiB2YWx1ZS5hdXRob3JlZFBsYWNlZCxcbiAgICBuZXh0U2VxdWVuY2U6IHZhbHVlLm5leHRTZXF1ZW5jZSxcbiAgfTtcbiAgY29uc3QgcmVzdWx0OiBXb3JsZFNuYXBzaG90ID0gc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQVxuICAgID8geyAuLi5zbmFwc2hvdCwgc2NoZW1hOiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSwgLi4udmFsaWRhdGVMaWZlRmllbGRzKHZhbHVlKSB9XG4gICAgOiB7IC4uLnNuYXBzaG90LCBzY2hlbWE6IHNjaGVtYSBhcyB0eXBlb2YgU05BUFNIT1RfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgfTtcbiAgaWYgKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgdW5rbm93biwgbm9uLWNhbm9uaWNhbCBvciBhbWJpZ3VvdXMgZmllbGRzJyk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZVdvcmxkU25hcHNob3QoanNvbjogc3RyaW5nKTogV29ybGRTbmFwc2hvdCB7XG4gIGlmIChqc29uLmxlbmd0aCA+IE1BWF9TTkFQU0hPVF9KU09OX0JZVEVTKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGV4Y2VlZHMgdGhlIEpTT04gc2l6ZSBsaW1pdCcpO1xuICByZXR1cm4gdmFsaWRhdGVXb3JsZFNuYXBzaG90KEpTT04ucGFyc2UoanNvbikpO1xufVxuXG4vKiogUmVzdG9yZSBpbiBwbGFjZSBzbyBjb250cm9sbGVycyByZXRhaW4gdGhlIHNhbWUgV29ybGQgcmVmZXJlbmNlLiBBbGxcbiAqIHZhbGlkYXRpb24gaGFwcGVucyBiZWZvcmUgbXV0YXRpb24sIHNvIGEgcmVqZWN0ZWQgc2F2ZSBjYW5ub3QgZXJhc2Ugd29yay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZDogV29ybGQsIGlucHV0OiBXb3JsZFNuYXBzaG90KTogdm9pZCB7XG4gIC8vIE9yZGluYXJ5IHNuYXBzaG90cyBhbmQgdHJhbnNhY3Rpb25hbCByb2xsYmFja3MgcmVzdG9yZSB0aGVpciBleGFjdCByZWNvcmRlZFxuICAvLyBzdGF0ZS4gUmV0aXJlZCBoaXN0b3JpY2FsIGVudGl0aWVzIGFyZSByZW1vdmVkIG9ubHkgYWZ0ZXIgR2FtZVNlc3Npb24gaGFzXG4gIC8vIGF1dGhlbnRpY2F0ZWQgdGhlIG9yaWdpbmFsIGpvdXJuYWwgYW5kIGV4cGxpY2l0bHkgbWlncmF0ZWQgdGhhdCBzYXZlLlxuICBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZCk7XG4gIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3Qod29ybGQsIGlucHV0KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBIaXN0b3JpY2FsIHJlY29uc3RydWN0aW9uIG9yIGV4YWN0IG5ldy1zbmFwc2hvdCByZXN0b3JhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0KHdvcmxkOiBXb3JsZCwgaW5wdXQ6IFdvcmxkU25hcHNob3QpOiB2b2lkIHtcbiAgY29uc3Qgc25hcHNob3QgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3QoaW5wdXQpO1xuICBpZiAoc25hcHNob3QubWFuaWZlc3Quc2VlZCAhPT0gd29ybGQuc2VlZCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBzZWVkIGRvZXMgbm90IG1hdGNoIHRoZSB3b3JsZCcpO1xuICB3b3JsZC5wYXJhbXMgPSB7XG4gICAgc2l6ZTogc25hcHNob3QubWFuaWZlc3Quc2l6ZSxcbiAgICBjaHVua1NpemU6IHNuYXBzaG90Lm1hbmlmZXN0LmNodW5rU2l6ZSxcbiAgICB5TWluOiBzbmFwc2hvdC5tYW5pZmVzdC55TWluLFxuICAgIHlNYXg6IHNuYXBzaG90Lm1hbmlmZXN0LnlNYXgsXG4gICAgc2VhTGV2ZWw6IHNuYXBzaG90Lm1hbmlmZXN0LnNlYUxldmVsLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHNuYXBzaG90Lm1hbmlmZXN0LmdlbmVyYXRvclZlcnNpb24sXG4gIH07XG4gIHdvcmxkLmNodW5rcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdGllcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdHlDaHVua3MuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdHlSZW1vdmFscy5jbGVhcigpO1xuICB3b3JsZC5zdHJ1Y3R1cmVzLmNsZWFyKCk7XG4gIHdvcmxkLmVkaXRzLmNsZWFyKCk7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uc25hcHNob3QuaW52ZW50b3J5IH07XG4gIHdvcmxkLmxpZmUgPSBzbmFwc2hvdC5zY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BID8gY3JlYXRlTGlmZVN0YXRlKCkgOiB1bmRlZmluZWQ7XG4gIGlmICh3b3JsZC5saWZlICYmIHNuYXBzaG90LnNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEpIHtcbiAgICB3b3JsZC5saWZlLnRpY2sgPSBzbmFwc2hvdC50aWNrO1xuICAgIGZvciAoY29uc3QgcyBvZiBzbmFwc2hvdC5zdG9ja3BpbGVzKSB3b3JsZC5saWZlLnN0b2NrcGlsZXMuc2V0KHMuaWQsIHsgLi4ucywgaW52ZW50b3J5OiB7IC4uLnMuaW52ZW50b3J5IH0gfSk7XG4gICAgZm9yIChjb25zdCBqIG9mIHNuYXBzaG90LmpvYnMpIHdvcmxkLmxpZmUuam9icy5zZXQoai5pZCwgeyAuLi5qIH0pO1xuICAgIGZvciAoY29uc3QgYyBvZiBzbmFwc2hvdC5jcm9wcykgd29ybGQubGlmZS5jcm9wcy5zZXQoYy5pZCwgeyAuLi5jIH0pO1xuICB9XG4gIHdvcmxkLmhvbWVzdGVhZCA9IHNuYXBzaG90LnNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgJiYgc25hcHNob3QuaG9tZXN0ZWFkID8gY2xvbmVIb21lc3RlYWQoc25hcHNob3QuaG9tZXN0ZWFkKSA6IHVuZGVmaW5lZDtcbiAgd29ybGQuZGlydHkuY2xlYXIoKTtcbiAgd29ybGQuc2l0ZXMgPSBbXTtcbiAgd29ybGQuc3RhdHMgPSB7XG4gICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICBlbnRpdGllczogc25hcHNob3QuZW50aXRpZXMubGVuZ3RoLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gIH07XG4gIHdvcmxkLnJldmlzaW9uID0gc25hcHNob3QucmV2aXNpb247XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gc25hcHNob3QuYXV0aG9yZWRQbGFjZWQ7XG4gIGZvciAoY29uc3Qga2V5IG9mIHNuYXBzaG90LmVudGl0eUNodW5rcykgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcbiAgLy8gQXBwbHkgZHVyYWJsZSB2b3hlbCBlZGl0cyBiZWZvcmUgYW55IGF1dGhvcmVkLXNpdGUgcXVlcnkgY2FuIGdlbmVyYXRlIGFcbiAgLy8gY2h1bmsuIE90aGVyd2lzZSB0aG9zZSBjaHVua3MgY2FjaGUgdGhlIHVuZWRpdGVkIGJhc2UgdGVycmFpbiBwZXJtYW5lbnRseS5cbiAgZm9yIChjb25zdCBkZWx0YSBvZiBzbmFwc2hvdC5lZGl0cykge1xuICAgIHdvcmxkLmVkaXRzLnNldChkZWx0YS5jaHVuaywgbmV3IE1hcChkZWx0YS5jZWxscy5tYXAoKGUpID0+IFtlLmksIGUubSBhcyBNYXRJZF0pKSk7XG4gIH1cbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIC8vIFJlY3JlYXRlIGF1dGhvcmVkIHNpdGUgcmVjb3Jkcy4gU3VwcHJlc3MgdGhlaXIgZW50aXR5IHBsYWNlbWVudCBzbyB0aGVcbiAgLy8gZXhhY3Qgc2F2ZWQgZW50aXR5IHJlY29yZHMgYmVsb3cgY2Fubm90IGJlIGFmZmVjdGVkIGJ5IGEgbW9kaWZpZWQgY2h1bmsuXG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkge1xuICAgIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gZmFsc2U7XG4gICAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG4gIH1cbiAgLy8gQXV0aG9yZWQgcGxhY2VtZW50IGRlcml2ZXMgc2l0ZS9lbnRpdHkgc2NhZmZvbGRpbmcgYW5kIG1heSBhZHZhbmNlIHRoZVxuICAvLyByZXZpc2lvbi4gVGhlIHNhdmVkIHJldmlzaW9uIGlzIHJlc3RvcmVkIG9ubHkgYWZ0ZXIgdGhhdCBkZXJpdmVkIHdvcmsuXG4gIHdvcmxkLnJldmlzaW9uID0gc25hcHNob3QucmV2aXNpb247XG4gIC8vIFRvbWJzdG9uZXMgbXVzdCBleGlzdCBiZWZvcmUgYW55IGNoYW5nZWQgY2h1bmsgcmVnZW5lcmF0ZXMgaXRzIGVudGl0aWVzLlxuICBmb3IgKGNvbnN0IGlkIG9mIHNuYXBzaG90LmVudGl0eVJlbW92YWxzKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICAvLyBSZXBsYWNlIGdlbmVyYXRlZCBlbnRpdGllcyB3aXRoIHRoZSBleGFjdCBzYXZlZCByZWNvcmRzLCBpbmNsdWRpbmdcbiAgLy8gaGFydmVzdGVkL3JlbW92ZWQgb25lcy5cbiAgd29ybGQuZW50aXRpZXMuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5Q2h1bmtzLmNsZWFyKCk7XG4gIC8vIEluc3RhbGwgcGVyc2lzdGVkIGVudGl0eSBkZWx0YXMgZGlyZWN0bHkuIFRoaXMgaXMgcmVjb25zdHJ1Y3Rpb24sIG5vdCBhXG4gIC8vIGNvbW1hbmQ6IHJlbW92ZUVudGl0eSB3b3VsZCBjcmVhdGUgZnJlc2ggdG9tYnN0b25lcyBhbmQgYWR2YW5jZSByZXZpc2lvbi5cbiAgZm9yIChjb25zdCBrZXkgb2Ygc25hcHNob3QuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgc25hcHNob3QgcmVmZXJlbmNlcyB1bmF2YWlsYWJsZSBjaHVuayAke2tleX1gKTtcbiAgICBjb25zdCBzYXZlZCA9IG5ldyBTZXQoc25hcHNob3QuZW50aXRpZXMuZmlsdGVyKChlKSA9PiBlLmNodW5rID09PSBrZXkpLm1hcCgoZSkgPT4gZS5pZCkpO1xuICAgIC8vIEF1dGhvcmVkIGVudGl0aWVzIGZvciB0aGUgc2FtZSBjaHVuayBzdXJ2aXZlIGFsb25nc2lkZSBuYXR1cmFsIGRlbHRhcy5cbiAgICBjb25zdCBpZHMgPSAod29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdKS5maWx0ZXIoKGlkKSA9PiB7XG4gICAgICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgcmV0dXJuICFpZC5zdGFydHNXaXRoKCdlOicpICYmICEhZW50aXR5XG4gICAgICAgICYmICghaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSB8fCBpc1N0b25lUmVwbGF5KHdvcmxkKSk7XG4gICAgfSk7XG4gICAgZm9yIChjb25zdCBpZCBvZiBbLi4ud29ybGQuZW50aXRpZXMua2V5cygpXSkge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmIChlbnRpdHk/LmNodW5rID09PSBrZXkgJiYgIWVudGl0eS5hdXRob3JlZCAmJiAhc2F2ZWQuaGFzKGlkKSkgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBpZCBvZiBzYXZlZCkgaWYgKCFpZHMuaW5jbHVkZXMoaWQpKSBpZHMucHVzaChpZCk7XG4gICAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcyk7XG4gIH1cbiAgZm9yIChjb25zdCBlIG9mIHNuYXBzaG90LmVudGl0aWVzKSB7XG4gICAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGNsb25lRW50aXR5KGUpKTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBvZiBzbmFwc2hvdC5lbnRpdHlDaHVua3MpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygc25hcHNob3Quc3RydWN0dXJlcykgd29ybGQuc3RydWN0dXJlcy5zZXQocy5pZCwgY2xvbmVTdHJ1Y3R1cmUocykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRGcm9tU25hcHNob3Qoc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBXb3JsZCB7XG4gIGNvbnN0IHZhbGlkID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHNuYXBzaG90KTtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCh2YWxpZC5tYW5pZmVzdC5zZWVkLCB2YWxpZC5tYW5pZmVzdC5nZW5lcmF0b3JWZXJzaW9uKTtcbiAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIHZhbGlkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG4vKiogUmF3IG9sZCBzdGF0ZSBpcyB1c2VkIG9ubHkgd2hpbGUgdmFsaWRhdGluZyBhIHJlY29yZGVkIGFjY2VwdGVkIGpvdXJuYWwuICovXG5leHBvcnQgZnVuY3Rpb24gaGlzdG9yaWNhbFdvcmxkRnJvbVNuYXBzaG90KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogV29ybGQge1xuICBjb25zdCB2YWxpZCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChzbmFwc2hvdCk7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQodmFsaWQubWFuaWZlc3Quc2VlZCk7XG4gIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkKTtcbiAgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh3b3JsZCwgdmFsaWQpO1xuICByZXR1cm4gd29ybGQ7XG59XG4iLCAiLy8gTTAwMiBwbGF5YWJsZSBmaXJzdCBzbGljZSBcdTIwMTQgdGhlIHRocmVlIGF1dGhvcmVkIHByb2plY3RzIGFzIHBsYWluIGRhdGEuXG4vL1xuLy8gVGhpcyBtb2R1bGUgaXMgZGVsaWJlcmF0ZWx5IERPTS1mcmVlLiBUaGUgYnVpbGQgc2lkZWJhciwgdGhlIGdob3N0IHByZXZpZXdcbi8vIGFuZCB0aGUgdGVzdHMgYWxsIHJlYWQgdGhlIHNhbWUgZGVmaW5pdGlvbnMgYW5kIGNhbGwgdGhlIHNhbWUgc2ltdWxhdGlvblxuLy8gZW50cnkgcG9pbnRzOyBhIHByb2plY3QgY2Fubm90IGFkdmVydGlzZSBvbmUgZm9vdHByaW50LCBwcmljZSBvciBwcmVwYXJhdGlvblxuLy8gc3RlcCBhbmQgdGhlbiBleGVjdXRlIGFub3RoZXIuXG5pbXBvcnQgeyBNQVQsIFdvcmxkLCBSZXNvdXJjZVR5cGUgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4uL3NpbS90ZXJyYWluJztcbmltcG9ydCB7XG4gIEJ1aWxkaW5nUnVsZXMsIEhPVVNFX1JVTEVTLCBQQVRIX1JVTEVTLCBGQVJNX1JVTEVTLFxuICBTaXRlUHJvcG9zYWwsIFNpdGVQcmV2aWV3LCBTaXRlU3RhdGUsIFZhbGlkYXRpb25SZWFzb24sIHByZXZpZXdTaXRlLFxufSBmcm9tICcuLi9zaW0vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIE0wMDJfTEFZT1VULCBNMDAyX1BBVEhfU0lURV9JRCwgTTAwMl9URVJSQUNFX0JBTkRTLFxufSBmcm9tICcuLi9zaW0vbTAwMic7XG5pbXBvcnQge1xuICBtMDAyRmFybVRhcmdldHMsIG0wMDJQYXRoUmVjdCwgbTAwMlBhdGhUYXJnZXRzLFxufSBmcm9tICcuLi9zaW0vc2NlbmFyaW8nO1xuaW1wb3J0IHtcbiAgQ29sdW1uVGFyZ2V0LCBMb2NhbEF1dGhvcml6ZXIsIFByZXBhcmF0aW9uTGVkZ2VyLCBQcmVwYXJhdGlvbk9wdGlvbnMsXG4gIFBsYW5SZXN1bHQsIHBsYW5QcmVwYXJhdGlvbiwgcHJlcGFyZVNpdGUsXG59IGZyb20gJy4uL3NpbS9wcmVwYXJhdGlvbic7XG5pbXBvcnQgeyBjcmVhdGVXb3JsZFNuYXBzaG90LCByZXN0b3JlV29ybGRTbmFwc2hvdCB9IGZyb20gJy4uL3NpbS9zbmFwc2hvdCc7XG5cbmltcG9ydCB7XG4gIEhPVVNFX0NPU1QsIFRFUlJBQ0VfQ09TVCwgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLCBTdHJ1Y3R1cmUsXG4gIFN0cnVjdHVyZUtpbmQsIFN0cnVjdHVyZUxlZGdlciwgU3RydWN0dXJlUHJvcG9zYWwsIFN0cnVjdHVyZURlc2lnblZlcnNpb24sXG4gIGJ1aWxkU3RydWN0dXJlLCBwYXRoQ29zdCxcbn0gZnJvbSAnLi4vc2ltL3N0cnVjdHVyZXMnO1xuXG5leHBvcnQgdHlwZSBNMlByb2plY3RJZCA9ICdob3VzZScgfCAncGF0aCcgfCAnZmFybSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTJHaG9zdEJhbmQge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTJQcm9qZWN0IHtcbiAgaWQ6IE0yUHJvamVjdElkO1xuICBuYW1lOiBzdHJpbmc7XG4gIHN1YnRpdGxlOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB0ZXJyYWNlcz86IG51bWJlcjtcbiAgcHJlcDogUHJlcGFyYXRpb25PcHRpb25zO1xuICBnaG9zdEJhbmRzPzogcmVhZG9ubHkgTTJHaG9zdEJhbmRbXTtcbn1cblxuY29uc3QgcGF0aFJlY3QgPSBtMDAyUGF0aFJlY3QoKTtcbmNvbnN0IHBhdGhUYXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IG0wMDJQYXRoVGFyZ2V0cygpO1xuY29uc3QgZmFybVRhcmdldHM6IENvbHVtblRhcmdldFtdID0gbTAwMkZhcm1UYXJnZXRzKCk7XG5cbi8qKlxuICogVGhlIGZpcnN0IHBsYXlhYmxlIHNsaWNlIGluIHRoZSBwaW5uZWQgb3JkZXI6IGEgaG91c2Ugb24gdGhlIHByZXBhcmVkIHNoZWxmLFxuICogYSBzdGVwcGVkIHBhdGggZnJvbSBpdHMgZG9vciwgYW5kIGEgdGVycmFjZWQgZmllbGQgb24gdGhlIHNsb3BlIGJlbG93LlxuICovXG5leHBvcnQgY29uc3QgTTJfUFJPSkVDVFM6IHJlYWRvbmx5IE0yUHJvamVjdFtdID0gW1xuICB7XG4gICAgaWQ6ICdob3VzZScsXG4gICAgbmFtZTogXCJGb3VuZGVyJ3MgaG91c2VcIixcbiAgICBzdWJ0aXRsZTogJzggeCA2IG0gXHUwMEI3IGZsYXQgc3RvbmUgc2hlbGYnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSAxOS1tb2R1bGUgZm91bmRlciBjYW5kaWRhdGUgdXNlcyBhIGZsYXQgc3RvbmUgZm91bmRhdGlvbiwgYSAzLjIgbSBzdG9yZXksIGEgcmVhbCBlYXN0IGRvb3J3YXkgJ1xuICAgICAgKyAnYW5kIHR3byBvcGVuIHNvdXRoIHdpbmRvd3MuIFN0cnVjdHVyYWwgd2FsbCB2b2lkcyByZXF1aXJlIG1vcmUgcHJpbWl0aXZlcyB0aGFuIHRoZSBwcm92aXNpb25hbCAnXG4gICAgICArICdhc3NldC12b2x1bWUgdGFyZ2V0OyB0aGlzIGRlc2lnbiByZW1haW5zIHN1YmplY3QgdG8gYXJ0IHJldmlldy4nLFxuICAgIHNpdGVJZDogTTAwMl9MQVlPVVQuaG91c2UuaWQsXG4gICAga2luZDogJ2hvdXNlJyxcbiAgICByZWN0OiBNMDAyX0xBWU9VVC5ob3VzZS5yZWN0LFxuICAgIGZsb29yWTogTTAwMl9MQVlPVVQuaG91c2UuZmxvb3JZLFxuICAgIHJ1bGVzOiBIT1VTRV9SVUxFUyxcbiAgICBjb3N0OiB7IC4uLkhPVVNFX0NPU1QgfSxcbiAgICBkb29yOiBNMDAyX0xBWU9VVC5ob3VzZS5kb29yLFxuICAgIGFwcHJvYWNoOiBNMDAyX0xBWU9VVC5ob3VzZS5hcHByb2FjaCxcbiAgICBwcmVwOiB7fSxcbiAgfSxcbiAge1xuICAgIGlkOiAncGF0aCcsXG4gICAgbmFtZTogJ0Rvb3IgcGF0aCcsXG4gICAgc3VidGl0bGU6ICc5IHggMyBtIFx1MDBCNyBzdGVwcGVkIGdyYXZlbCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnQSBuaW5lLW1ldHJlIGNvcnJpZG9yIGZyb20gdGhlIGhvdXNlIGRvb3IgdG8gdGhlIGFwcHJvYWNoLiAnXG4gICAgICArICdFYWNoIGNvbHVtbiBpcyBjdXQgdG8gYSBwaW5uZWQgcHJvZmlsZSBzbyB0aGUgcmlzZSBzdGF5cyB3YWxrYWJsZS4nLFxuICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAga2luZDogJ3BhdGgnLFxuICAgIHJlY3Q6IHBhdGhSZWN0LFxuICAgIGZsb29yWTogMTIsXG4gICAgcnVsZXM6IFBBVEhfUlVMRVMsXG4gICAgY29zdDogcGF0aENvc3QocGF0aFJlY3QueDEgLSBwYXRoUmVjdC54MCArIDEpLFxuICAgIHByZXA6IHtcbiAgICAgIHRhcmdldHM6IHBhdGhUYXJnZXRzLFxuICAgICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuR1JBVkVMLFxuICAgICAgZW52ZWxvcGU6IFtNMDAyX0xBWU9VVC5lbnZlbG9wZVsxXV0sXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIGlkOiAnZmFybScsXG4gICAgbmFtZTogJ1RlcnJhY2VkIGZpZWxkJyxcbiAgICBzdWJ0aXRsZTogJzEyIHggOCBtIFx1MDBCNyB0aHJlZSBiYW5kcycsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhyZWUgc29pbCB0ZXJyYWNlcyBzdGVwcGluZyBkb3duIHRoZSBzbG9wZSwgaGVsZCBieSBzdG9uZSByZXRhaW5pbmcgd2FsbHMuICdcbiAgICAgICsgJ1RoZSBibG9zc29tIHRyZWUgb24gdGhlIGZpZWxkIGlzIGNsZWFyZWQgZHVyaW5nIHByZXBhcmF0aW9uLicsXG4gICAgc2l0ZUlkOiBNMDAyX0xBWU9VVC5mYXJtLmlkLFxuICAgIGtpbmQ6ICd0ZXJyYWNlJyxcbiAgICByZWN0OiBNMDAyX0xBWU9VVC5mYXJtLnJlY3QsXG4gICAgZmxvb3JZOiAxNSxcbiAgICBydWxlczogRkFSTV9SVUxFUyxcbiAgICBjb3N0OiB7IC4uLlRFUlJBQ0VfQ09TVCB9LFxuICAgIHRlcnJhY2VzOiBNMDAyX0xBWU9VVC5mYXJtLnRlcnJhY2VzLFxuICAgIHByZXA6IHtcbiAgICAgIHRhcmdldHM6IGZhcm1UYXJnZXRzLFxuICAgICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuU09JTCxcbiAgICAgIGVudmVsb3BlOiBbTTAwMl9MQVlPVVQuZW52ZWxvcGVbMl1dLFxuICAgIH0sXG4gICAgZ2hvc3RCYW5kczogTTAwMl9URVJSQUNFX0JBTkRTLFxuICB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RCeUlkKGlkOiBNMlByb2plY3RJZCk6IE0yUHJvamVjdCB7XG4gIGNvbnN0IHByb2plY3QgPSBNMl9QUk9KRUNUUy5maW5kKChwKSA9PiBwLmlkID09PSBpZCk7XG4gIGlmICghcHJvamVjdCkgdGhyb3cgbmV3IEVycm9yKGB1bmtub3duIE0wMDIgcHJvamVjdDogJHtpZH1gKTtcbiAgcmV0dXJuIHByb2plY3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0U2l0ZVByb3Bvc2FsKHByb2plY3Q6IE0yUHJvamVjdCk6IFNpdGVQcm9wb3NhbCB7XG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9qZWN0LnNpdGVJZCxcbiAgICByZWN0OiBwcm9qZWN0LnJlY3QsXG4gICAgZmxvb3JZOiBwcm9qZWN0LmZsb29yWSxcbiAgICBydWxlczogcHJvamVjdC5ydWxlcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RTdHJ1Y3R1cmVQcm9wb3NhbChcbiAgcHJvamVjdDogTTJQcm9qZWN0LCBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbixcbik6IFN0cnVjdHVyZVByb3Bvc2FsIHtcbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb2plY3Quc2l0ZUlkLFxuICAgIGtpbmQ6IHByb2plY3Qua2luZCxcbiAgICByZWN0OiBwcm9qZWN0LnJlY3QsXG4gICAgZmxvb3JZOiBwcm9qZWN0LmZsb29yWSxcbiAgICBkb29yOiBwcm9qZWN0LmRvb3IsXG4gICAgYXBwcm9hY2g6IHByb2plY3QuYXBwcm9hY2gsXG4gICAgdGVycmFjZXM6IHByb2plY3QudGVycmFjZXMsXG4gICAgLi4uKGRlc2lnblZlcnNpb24gPT09IHVuZGVmaW5lZCA/IHt9IDogeyBkZXNpZ25WZXJzaW9uIH0pLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQcm9qZWN0QnVpbHQod29ybGQ6IFdvcmxkLCBwcm9qZWN0OiBNMlByb2plY3QpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCBzdHJ1Y3R1cmUgb2Ygd29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKSkge1xuICAgIGlmIChzdHJ1Y3R1cmUuc2l0ZUlkID09PSBwcm9qZWN0LnNpdGVJZCAmJiBzdHJ1Y3R1cmUua2luZCA9PT0gcHJvamVjdC5raW5kKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2luZ1Jlc291cmNlIHtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZTtcbiAgbmVlZDogbnVtYmVyO1xuICBoYXZlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtaXNzaW5nUmVzb3VyY2VzKHdvcmxkOiBXb3JsZCwgcHJvamVjdDogTTJQcm9qZWN0KTogTWlzc2luZ1Jlc291cmNlW10ge1xuICBjb25zdCBtaXNzaW5nOiBNaXNzaW5nUmVzb3VyY2VbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwcm9qZWN0LmNvc3QpKSB7XG4gICAgY29uc3QgbmVlZCA9IGFtb3VudCA/PyAwO1xuICAgIGNvbnN0IGhhdmUgPSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDA7XG4gICAgaWYgKGhhdmUgPCBuZWVkKSBtaXNzaW5nLnB1c2goeyByZXNvdXJjZTogcmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlLCBuZWVkLCBoYXZlIH0pO1xuICB9XG4gIHJldHVybiBtaXNzaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3RJbnNwZWN0aW9uIHtcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgYnVpbHQ6IGJvb2xlYW47XG4gIGFmZm9yZGFibGU6IGJvb2xlYW47XG4gIG1pc3Npbmc6IE1pc3NpbmdSZXNvdXJjZVtdO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHByZXZpZXc6IFNpdGVQcmV2aWV3O1xuICBwbGFuOiBQbGFuUmVzdWx0O1xuICBjYW5CdWlsZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZWFkLW9ubHkgaW5zcGVjdGlvbiBmb3IgdGhlIGdob3N0IGFuZCBzaWRlYmFyLiBJdCBydW5zIHRoZSBzYW1lIHZhbGlkYXRvclxuICogYW5kIHRoZSBzYW1lIHByZXBhcmF0aW9uIHBsYW5uZXIgdGhlIGJ1aWxkIGJ1dHRvbiB3aWxsIHJ1bi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3BlY3RQcm9qZWN0KHdvcmxkOiBXb3JsZCwgcHJvamVjdDogTTJQcm9qZWN0KTogUHJvamVjdEluc3BlY3Rpb24ge1xuICBjb25zdCBwcm9wb3NhbCA9IHByb2plY3RTaXRlUHJvcG9zYWwocHJvamVjdCk7XG4gIGNvbnN0IHByZXZpZXcgPSBwcmV2aWV3U2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHtcbiAgICBkb29yOiBwcm9qZWN0LmRvb3IsXG4gICAgYXBwcm9hY2g6IHByb2plY3QuYXBwcm9hY2gsXG4gIH0pO1xuICBjb25zdCBwbGFuID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbCwgcHJvamVjdC5wcmVwKTtcbiAgY29uc3QgYnVpbHQgPSBpc1Byb2plY3RCdWlsdCh3b3JsZCwgcHJvamVjdCk7XG4gIGNvbnN0IG1pc3NpbmcgPSBtaXNzaW5nUmVzb3VyY2VzKHdvcmxkLCBwcm9qZWN0KTtcbiAgY29uc3Qgc3RhdGUgPSBwbGFuLm9rID8gcGxhbi52YWxpZGF0aW9uLnN0YXRlIDogcHJldmlldy5zdGF0ZTtcbiAgY29uc3QgcmVhc29ucyA9IHBsYW4ub2sgPyBwbGFuLnZhbGlkYXRpb24ucmVhc29ucyA6IHByZXZpZXcucmVhc29ucztcblxuICByZXR1cm4ge1xuICAgIHByb2plY3RJZDogcHJvamVjdC5pZCxcbiAgICBidWlsdCxcbiAgICBhZmZvcmRhYmxlOiBtaXNzaW5nLmxlbmd0aCA9PT0gMCxcbiAgICBtaXNzaW5nLFxuICAgIHN0YXRlLFxuICAgIHJlYXNvbnMsXG4gICAgcHJldmlldyxcbiAgICBwbGFuLFxuICAgIGNhbkJ1aWxkOiAhYnVpbHQgJiYgbWlzc2luZy5sZW5ndGggPT09IDAgJiYgcGxhbi5vayAmJiBzdGF0ZSAhPT0gJ2ludmFsaWQnLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3RCdWlsZFN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcHJvamVjdDogTTJQcm9qZWN0O1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25MZWRnZXI7XG4gIHN0cnVjdHVyZTogU3RydWN0dXJlTGVkZ2VyO1xuICByZWNvcmQ6IFN0cnVjdHVyZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0QnVpbGRGYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBwcm9qZWN0OiBNMlByb2plY3Q7XG4gIHN0YWdlOiAncHJlY2hlY2snIHwgJ3ByZXBhcmUnIHwgJ3N0cnVjdHVyZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG4gIHByZXBhcmF0aW9uPzogUHJlcGFyYXRpb25MZWRnZXI7XG4gIC8qKiBGYWlsZWQgYnVpbGRzIHJvbGwgYmFjayB0aGUgZW50aXJlIGF1dGhvcml0YXRpdmUgcHJlLWJ1aWxkIHNuYXBzaG90LiAqL1xuICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlO1xuICByZXRyeWFibGU6IHRydWU7XG59XG5cbmV4cG9ydCB0eXBlIFByb2plY3RCdWlsZFJlc3VsdCA9IFByb2plY3RCdWlsZFN1Y2Nlc3MgfCBQcm9qZWN0QnVpbGRGYWlsdXJlO1xuXG4vKipcbiAqIFByZXBhcmUgdGhlIHNpdGUgYW5kIGNvbnN0cnVjdCB0aGUgcHJvamVjdCB0aHJvdWdoIHRoZSBhdXRob3JpemVkIHBpcGVsaW5lLlxuICogVGhlIHJlc291cmNlIGNoZWNrIGhhcHBlbnMgYmVmb3JlIGFueSB0ZXJyYWluIGVkaXQsIHNvIGFuIHVuYWZmb3JkYWJsZSBidWlsZFxuICogY2Fubm90IGxlYXZlIGEgZ3JhZGVkIHBhZCBiZWhpbmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFByb2plY3QoXG4gIHdvcmxkOiBXb3JsZCxcbiAgcHJlcEF1dGhvcml6ZXI6IExvY2FsQXV0aG9yaXplcixcbiAgc3RydWN0dXJlQXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLFxuICBwcm9qZWN0OiBNMlByb2plY3QsXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uLFxuKTogUHJvamVjdEJ1aWxkUmVzdWx0IHtcbiAgaWYgKGlzUHJvamVjdEJ1aWx0KHdvcmxkLCBwcm9qZWN0KSkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAncHJlY2hlY2snLCBjb2RlOiAnYWxyZWFkeV9idWlsdCcsXG4gICAgICByZWFzb25zOiBbYCR7cHJvamVjdC5uYW1lfSBpcyBhbHJlYWR5IGJ1aWx0YF0sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuICBjb25zdCBtaXNzaW5nID0gbWlzc2luZ1Jlc291cmNlcyh3b3JsZCwgcHJvamVjdCk7XG4gIGlmIChtaXNzaW5nLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3ByZWNoZWNrJywgY29kZTogJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLFxuICAgICAgcmVhc29uczogbWlzc2luZy5tYXAoKG0pID0+IGBuZWVkICR7bS5uZWVkfSAke20ucmVzb3VyY2V9LCBoYXZlICR7bS5oYXZlfWApLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBiZWZvcmUgPSBjcmVhdGVXb3JsZFNuYXBzaG90KHdvcmxkLCAwKTtcbiAgY29uc3QgcHJlcGFyZWQgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHByb2plY3RTaXRlUHJvcG9zYWwocHJvamVjdCksIHByb2plY3QucHJlcCk7XG4gIGlmICghcHJlcGFyZWQub2spIHtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgYmVmb3JlKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3ByZXBhcmUnLCBjb2RlOiBwcmVwYXJlZC5jb2RlLFxuICAgICAgcmVhc29uczogWy4uLnByZXBhcmVkLnJlYXNvbnMsICdObyBwcmVwYXJhdGlvbiwgcmVzb3VyY2Ugb3IgZW50aXR5IGNoYW5nZXMgd2VyZSByZXRhaW5lZC4nXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgYnVpbHQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwgcHJvamVjdFN0cnVjdHVyZVByb3Bvc2FsKHByb2plY3QsIGRlc2lnblZlcnNpb24pKTtcbiAgaWYgKCFidWlsdC5vaykge1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCBiZWZvcmUpO1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAnc3RydWN0dXJlJywgY29kZTogYnVpbHQuY29kZSxcbiAgICAgIHJlYXNvbnM6IFsuLi5idWlsdC5yZWFzb25zLFxuICAgICAgICAnQWxsIHByZXBhcmF0aW9uLCByZXNvdXJjZSBhbmQgZW50aXR5IGNoYW5nZXMgd2VyZSByb2xsZWQgYmFjazsgdGhlIGJ1aWxkIGNhbiBiZSByZXRyaWVkLiddLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBjb25zdCByZWNvcmQgPSB3b3JsZC5zdHJ1Y3R1cmVzLmdldChidWlsdC5sZWRnZXIuc3RydWN0dXJlSWQpO1xuICBpZiAoIXJlY29yZCkge1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCBiZWZvcmUpO1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAnc3RydWN0dXJlJywgY29kZTogJ21pc3NpbmdfcmVjb3JkJyxcbiAgICAgIHJlYXNvbnM6IFsnc3RydWN0dXJlIGxlZGdlciB3YXMgd3JpdHRlbiBidXQgdGhlIHdvcmxkIGhhcyBubyByZWNvcmQnLFxuICAgICAgICAnQWxsIHByZXBhcmF0aW9uLCByZXNvdXJjZSBhbmQgZW50aXR5IGNoYW5nZXMgd2VyZSByb2xsZWQgYmFjazsgdGhlIGJ1aWxkIGNhbiBiZSByZXRyaWVkLiddLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIHByb2plY3QsXG4gICAgcHJlcGFyYXRpb246IHByZXBhcmVkLmxlZGdlcixcbiAgICBzdHJ1Y3R1cmU6IGJ1aWx0LmxlZGdlcixcbiAgICByZWNvcmQsXG4gIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTs7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QUFRLEVBQUUsTUFBTSxFQUFFLE1BQU0sTUFBTSxRQUFRLEVBQUUsTUFBTSxPQUFPLElBQUk7QUFBQSxNQUNsRSxNQUFNLEVBQUUsT0FBTztBQUFBLFFBQUUsTUFBTSxFQUFFLEtBQUs7QUFBQSxRQUFNLFFBQVEsRUFBRSxLQUFLO0FBQUEsUUFBUSxLQUFLLEVBQUUsS0FBSztBQUFBLFFBQUssVUFBVSxFQUFFLEtBQUs7QUFBQSxRQUMzRixNQUFNLEVBQUUsS0FBSyxLQUFLLElBQUksQ0FBQyxPQUFPO0FBQUEsVUFBRSxJQUFJLEVBQUU7QUFBQSxVQUFJLEdBQUcsRUFBRTtBQUFBLFVBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRyxPQUFPLEVBQUU7QUFBQSxVQUFPLFFBQVEsRUFBRTtBQUFBLFVBQ2xGLEdBQUksRUFBRSxTQUFTLFNBQVksRUFBRSxNQUFNLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxVQUFJLEdBQUksRUFBRSxXQUFXLFNBQVksRUFBRSxRQUFRLEVBQUUsT0FBTyxJQUFJLENBQUM7QUFBQSxRQUFHLEVBQUU7QUFBQSxNQUFFLElBQUk7QUFBQSxNQUN2SCxHQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssWUFBWSxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUM7QUFBQSxNQUMzQyxHQUFJLEVBQUUsT0FBTyxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sSUFBSSxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxPQUFPLEVBQUUsT0FBTyxRQUFRLEVBQUUsUUFBUSxJQUFJLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxDQUFDO0FBQUEsSUFDN0gsRUFBRTtBQUFBLElBQ0YsT0FBTyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEdBQUcsY0FBYyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPO0FBQUEsTUFBRSxJQUFJLEVBQUU7QUFBQSxNQUFJLEdBQUcsRUFBRTtBQUFBLE1BQUcsR0FBRyxFQUFFO0FBQUEsTUFBRyxHQUFHLEVBQUU7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QUFFRCxLQUFLLG1FQUFtRSxNQUFNO0FBQzVFLFFBQU0sUUFBUSxrQkFBa0IsRUFBRTtBQUNsQyxRQUFNLE1BQU0sQ0FBQyxHQUFHLE1BQU0sYUFBYSxLQUFLLENBQUMsRUFBRSxDQUFDO0FBQzVDLFFBQU0sTUFBTSxNQUFNLGFBQWEsSUFBSSxHQUFHO0FBQ3RDLFNBQU8sR0FBRyxJQUFJLFNBQVMsQ0FBQztBQUN4QixRQUFNLFNBQVMsb0JBQW9CLEtBQUs7QUFDeEMsU0FBTyxNQUFNLFdBQVcsT0FBTyxHQUFHLEdBQUcsSUFBSTtBQUN6QyxTQUFPLE1BQU0sb0JBQW9CLEtBQUssR0FBRyxNQUFNO0FBQy9DLFFBQU0sQ0FBQyxJQUFJLEVBQUUsSUFBSSxJQUFJLE1BQU0sR0FBRyxFQUFFLElBQUksTUFBTTtBQUMxQyxTQUFPLE1BQU0sY0FBYyxPQUFPLElBQUksRUFBRSxHQUFHLEtBQUssR0FBRztBQUNuRCxTQUFPLE1BQU0sb0JBQW9CLEtBQUssR0FBRyxNQUFNO0FBQ2pELENBQUM7QUFFRCxLQUFLLHFGQUFxRixNQUFNO0FBQzlGLFFBQU0sUUFBUSxrQkFBa0IsRUFBRTtBQUNsQyxRQUFNLFdBQVcsb0JBQW9CLEtBQUs7QUFDMUMsUUFBTSxRQUFtQjtBQUFBLElBQ3ZCLEVBQUUsR0FBRyxVQUFVLFFBQVEsSUFBSTtBQUFBLElBQzNCLEVBQUUsR0FBRyxVQUFVLE9BQU8sQ0FBQyxFQUFFLE9BQU8sU0FBUyxNQUFNLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxDQUFDLEVBQUUsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFO0FBQUEsSUFDakcsRUFBRSxHQUFHLFVBQVUsVUFBVSxDQUFDLFNBQVMsU0FBUyxDQUFDLEdBQUcsU0FBUyxTQUFTLENBQUMsQ0FBQyxFQUFFO0FBQUEsSUFDdEUsRUFBRSxHQUFHLFVBQVUsVUFBVSxFQUFFLEdBQUcsU0FBUyxVQUFVLGtCQUFrQixHQUFHLEVBQUU7QUFBQSxFQUMxRTtBQUNBLGFBQVcsV0FBVyxNQUFPLFFBQU8sT0FBTyxNQUFNLGtCQUFrQixPQUFnQixDQUFDO0FBQ3RGLENBQUM7IiwKICAibmFtZXMiOiBbImEiLCAiYiIsICJzbW9vdGgiLCAibSIsICJ0b3RhbCIsICJtIiwgIm0iLCAibSIsICJpZCIsICJ0ZXh0IiwgIm0iLCAibSIsICJkaWdlc3QiLCAibSIsICJmYWlsIiwgIm0iLCAibSIsICJ0ZXh0IiwgIm0iLCAibSIsICJwcmVwIl0KfQo=
