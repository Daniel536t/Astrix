// tests/m004.workers.test.ts
import test from "node:test";
import assert from "node:assert/strict";

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
  const c3 = hash2i(xi, yi + 1, seed), d = hash2i(xi + 1, yi + 1, seed);
  const top = a + (b - a) * xf;
  const bottom = c3 + (d - c3) * xf;
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
var isOpaque = isSolid;

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
function seedBaseColumns(world, key, columns) {
  let cache = baseColumnCache.get(world);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    baseColumnCache.set(world, cache);
  }
  if (!cache.has(key)) cache.set(key, columns);
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

// src/render/terrain.ts
import * as THREE3 from "three";

// src/render/water.ts
import * as THREE from "three";

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
var M = palette_default.materials;
var H = (k) => new THREE.Color(M[k].hex);
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

// src/render/voxel-colors.ts
import * as THREE2 from "three";
var M2 = palette_default.materials;
var H2 = (k) => M2[k].hex;
var colorCache = /* @__PURE__ */ new Map();
function c(hex) {
  let out = colorCache.get(hex);
  if (!out) {
    out = new THREE2.Color(hex);
    colorCache.set(hex, out);
  }
  return out;
}
var COL = {
  grassTop: [c(H2("grass_top")), c(H2("grass_high")), c(H2("grass_peak"))],
  grassCap: c(H2("grass_cap")),
  soil: c(H2("strata_ochre")).clone().multiplyScalar(0.78),
  ochre: c(H2("strata_ochre")),
  rust: c(H2("strata_rust")),
  stoneTop: c(H2("stone_top")),
  stoneA: c(H2("stone_body_a")),
  stoneB: c(H2("stone_body_b")),
  stoneShade: c(H2("stone_shade")),
  sand: c(H2("sand")),
  gravel: c(H2("stone_body_b")).clone().lerp(c(H2("sand")), 0.35),
  ore: c(H2("ore_crystal")),
  moss: c(H2("grass_cap")).clone().lerp(c(H2("stone_body_b")), 0.35),
  snow: c(H2("snow")),
  snowShade: c(H2("snow")).clone().lerp(c(H2("stone_shade")), 0.35),
  waterRim: c(H2("water_rim")),
  waterShallow: c(H2("water_shallow")),
  waterMid: c(H2("water_mid")),
  waterDeep: c(H2("water_deep"))
};
var SHADE = [0.9, 0.96, 1, 1.04];
function heightBand(y) {
  return y >= 45 ? 2 : y >= 18 ? 1 : 0;
}
function stoneTone(y) {
  return y + 64 >> 3 & 1;
}
function shadeAt(x, y, z, seed) {
  const sx = Math.floor(x / 2) + Math.floor(y / 3) * 17;
  const sz = Math.floor(z / 2);
  return Math.floor(hash2i(sx, sz, seed + 300) * 4);
}
function keyFor(mat, variant, shade, axis, dir) {
  return mat & 15 | (variant & 15) << 4 | (shade & 3) << 8 | (axis & 3) << 10 | (dir > 0 ? 1 : 0) << 12;
}
var faceColorCache = /* @__PURE__ */ new Map();
function colorForKey(key) {
  const cached = faceColorCache.get(key);
  if (cached) return cached;
  const mat = key & 15;
  const variant = key >> 4 & 15;
  const shade = key >> 8 & 3;
  const axis = key >> 10 & 3;
  const dir = key >> 12 & 1;
  let color;
  if (axis === 1 && dir === 1) {
    const hb = Math.min(2, variant & 3);
    if (mat === MAT.GRASS) color = COL.grassTop[hb];
    else if (mat === MAT.SAND) color = COL.sand;
    else if (mat === MAT.GRAVEL) color = COL.gravel;
    else if (mat === MAT.SOIL) color = COL.ochre;
    else if (mat === MAT.ORE) color = COL.ore;
    else if (mat === MAT.MOSS) color = COL.moss;
    else if (mat === MAT.SNOW) color = COL.snow;
    else color = COL.stoneTop;
  } else if (axis === 1 && dir === 0) {
    color = COL.stoneShade;
  } else {
    const depth = variant & 7;
    const tone = variant >> 3 & 1;
    const body = tone ? COL.stoneB : COL.stoneA;
    if (mat === MAT.GRASS || mat === MAT.MOSS) {
      if (depth === 0) color = mat === MAT.MOSS ? COL.moss : COL.grassCap;
      else if (depth <= 2) color = COL.soil;
      else if (depth === 3) color = COL.rust;
      else color = body;
    } else if (mat === MAT.SOIL) {
      color = depth <= 1 ? COL.soil : body;
    } else if (mat === MAT.SAND) {
      color = depth <= 1 ? COL.sand : depth === 2 ? COL.ochre : body;
    } else if (mat === MAT.GRAVEL) {
      color = depth <= 1 ? COL.gravel : body;
    } else if (mat === MAT.ORE) {
      color = COL.ore;
    } else if (mat === MAT.SNOW) {
      color = depth === 0 ? COL.snowShade : body;
    } else if (mat === MAT.BEDROCK) {
      color = COL.stoneShade;
    } else {
      color = body;
    }
  }
  const out = color.clone().multiplyScalar(SHADE[shade]);
  faceColorCache.set(key, out);
  return out;
}

// src/render/mesher.ts
var PAD = CHUNK_SIZE + 2;
var PADDED_VOLUME = PAD * PAD * WORLD_HEIGHT;
var paddedIndex = (x, y, z) => x + 1 + (z + 1) * PAD + y * PAD * PAD;
function buildPadded(data, neighbour) {
  const out = new Uint8Array(PADDED_VOLUME);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = -1; z <= CHUNK_SIZE; z++) {
      for (let x = -1; x <= CHUNK_SIZE; x++) {
        const inside = x >= 0 && z >= 0 && x < CHUNK_SIZE && z < CHUNK_SIZE;
        out[paddedIndex(x, y, z)] = inside ? data[localIndex(x, y, z)] : neighbour(x, y, z);
      }
    }
  }
  return out;
}
function posFrom(axis, slice, i, j, out) {
  if (axis === 0) {
    out[0] = slice;
    out[1] = i;
    out[2] = j;
  } else if (axis === 1) {
    out[0] = j;
    out[1] = slice;
    out[2] = i;
  } else {
    out[0] = i;
    out[1] = j;
    out[2] = slice;
  }
}
var Growable = class {
  buf;
  length = 0;
  constructor(n) {
    this.buf = new Float32Array(n);
  }
  push3(a, b, c3) {
    if (this.length + 3 > this.buf.length) this.grow();
    this.buf[this.length++] = a;
    this.buf[this.length++] = b;
    this.buf[this.length++] = c3;
  }
  push1(a) {
    if (this.length + 1 > this.buf.length) this.grow();
    this.buf[this.length++] = a;
  }
  grow() {
    const n = new Float32Array(this.buf.length * 2);
    n.set(this.buf);
    this.buf = n;
  }
  done() {
    return this.buf.slice(0, this.length);
  }
};
function meshPadded(padded, heights, ox, oz, seed) {
  const sample = (x, y, z) => {
    if (y < 0) return MAT.BEDROCK;
    if (y >= WORLD_HEIGHT) return MAT.AIR;
    return padded[paddedIndex(x, y, z)];
  };
  const positions = new Growable(1 << 15), normals = new Growable(1 << 15);
  const colors = new Growable(1 << 15), mats = new Growable(1 << 13);
  let indices = new Uint32Array(1 << 14);
  let indexCount = 0;
  let vertexCount = 0;
  const dims = [CHUNK_SIZE, WORLD_HEIGHT, CHUNK_SIZE];
  const pa = new Int32Array(3), pb = new Int32Array(3);
  const corners = new Float32Array(12);
  const emitQuad = (axis, dir, slice, i0, j0, w, h, key) => {
    const plane = slice + 1;
    const u0 = i0, u1 = i0 + w, v0 = j0, v1 = j0 + h;
    const set = (k, x, y, z) => {
      corners[k * 3] = x;
      corners[k * 3 + 1] = y;
      corners[k * 3 + 2] = z;
    };
    if (axis === 0) {
      const x = ox + plane, y0 = Y_MIN + u0, y1 = Y_MIN + u1, z0 = oz + v0, z1 = oz + v1;
      if (dir > 0) {
        set(0, x, y0, z0);
        set(1, x, y1, z0);
        set(2, x, y1, z1);
        set(3, x, y0, z1);
      } else {
        set(0, x, y0, z0);
        set(1, x, y0, z1);
        set(2, x, y1, z1);
        set(3, x, y1, z0);
      }
    } else if (axis === 1) {
      const y = Y_MIN + plane, z0 = oz + u0, z1 = oz + u1, x0 = ox + v0, x1 = ox + v1;
      if (dir > 0) {
        set(0, x0, y, z0);
        set(1, x0, y, z1);
        set(2, x1, y, z1);
        set(3, x1, y, z0);
      } else {
        set(0, x0, y, z0);
        set(1, x1, y, z0);
        set(2, x1, y, z1);
        set(3, x0, y, z1);
      }
    } else {
      const z = oz + plane, x0 = ox + u0, x1 = ox + u1, y0 = Y_MIN + v0, y1 = Y_MIN + v1;
      if (dir > 0) {
        set(0, x0, y0, z);
        set(1, x1, y0, z);
        set(2, x1, y1, z);
        set(3, x0, y1, z);
      } else {
        set(0, x0, y0, z);
        set(1, x0, y1, z);
        set(2, x1, y1, z);
        set(3, x1, y0, z);
      }
    }
    const color = colorForKey(key);
    const mat = key & 15;
    const nx = axis === 0 ? dir : 0, ny = axis === 1 ? dir : 0, nz = axis === 2 ? dir : 0;
    const base = vertexCount;
    for (let k = 0; k < 4; k++) {
      positions.push3(corners[k * 3], corners[k * 3 + 1], corners[k * 3 + 2]);
      normals.push3(nx, ny, nz);
      colors.push3(color.r, color.g, color.b);
      mats.push1(mat);
    }
    vertexCount += 4;
    if (indexCount + 6 > indices.length) {
      const n = new Uint32Array(indices.length * 2);
      n.set(indices);
      indices = n;
    }
    indices[indexCount++] = base;
    indices[indexCount++] = base + 1;
    indices[indexCount++] = base + 2;
    indices[indexCount++] = base;
    indices[indexCount++] = base + 2;
    indices[indexCount++] = base + 3;
  };
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const du = dims[u], dv = dims[v], dd = dims[axis];
    const mask = new Uint16Array(du * dv);
    for (let slice = -1; slice < dd; slice++) {
      mask.fill(0);
      let any = false;
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du; i++) {
          posFrom(axis, slice, i, j, pa);
          posFrom(axis, slice + 1, i, j, pb);
          const a = sample(pa[0], pa[1], pa[2]);
          const b = sample(pb[0], pb[1], pb[2]);
          const ao = isOpaque(a), bo = isOpaque(b);
          if (ao === bo) continue;
          const aInside = slice >= 0 && slice < dd;
          const bInside = slice + 1 >= 0 && slice + 1 < dd;
          let x, y, z, mat, dir;
          if (ao && !bo && aInside) {
            x = pa[0];
            y = pa[1];
            z = pa[2];
            mat = a;
            dir = 1;
          } else if (bo && !ao && bInside) {
            x = pb[0];
            y = pb[1];
            z = pb[2];
            mat = b;
            dir = -1;
          } else continue;
          const wy = Y_MIN + y;
          const surfaceY = heights[z * CHUNK_SIZE + x] + Y_MIN;
          const depth = surfaceY - (wy + 1);
          let variant;
          if (axis === 1 && dir > 0) variant = heightBand(wy);
          else if (axis === 1 && dir < 0) variant = 15;
          else variant = Math.max(0, Math.min(7, depth)) & 7 | stoneTone(wy) << 3;
          mask[j * du + i] = keyFor(mat, variant, shadeAt(ox + x, wy, oz + z, seed), axis, dir);
          any = true;
        }
      }
      if (!any) continue;
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du; ) {
          const key = mask[j * du + i];
          if (!key) {
            i++;
            continue;
          }
          let w = 1;
          while (i + w < du && mask[j * du + i + w] === key) w++;
          let h = 1;
          outer: while (j + h < dv) {
            for (let k = 0; k < w; k++) if (mask[(j + h) * du + i + k] !== key) break outer;
            h++;
          }
          for (let jj = 0; jj < h; jj++) for (let ii = 0; ii < w; ii++) mask[(j + jj) * du + i + ii] = 0;
          emitQuad(axis, key >> 12 & 1 ? 1 : -1, slice, i, j, w, h, key);
          i += w;
        }
      }
    }
  }
  return {
    positions: positions.done(),
    normals: normals.done(),
    colors: colors.done(),
    mats: mats.done(),
    indices: indices.slice(0, indexCount),
    triangles: indexCount / 3
  };
}

// src/render/terrain.ts
var terrainMaterial = new THREE3.MeshLambertMaterial({
  vertexColors: true,
  side: THREE3.FrontSide
});
terrainMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float aMat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nvarying float vMat;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);\nvMat = aMat;");
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
varying float vMat;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vn2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}`).replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 n = normalize(vWNrm);
  float vert = 1.0 - smoothstep(0.35, 0.70, abs(n.y));
  float isGrass = ((vMat > 0.5 && vMat < 1.5) || (vMat > 8.5 && vMat < 9.5)) ? 1.0 : 0.0;
  float isStone = ((vMat > 4.5 && vMat < 6.5) || (vMat > 7.5 && vMat < 8.5)) ? 1.0 : 0.0;

  float horiz = abs(n.x) > abs(n.z) ? vWPos.z : vWPos.x;
  float row = floor(vWPos.y);
  float col = floor(horiz);
  float h = h21(vec2(col, row));
  vec2 f = vec2(fract(horiz), fract(vWPos.y));
  float joint = smoothstep(0.0, 0.055, min(f.x, 1.0 - f.x))
              * smoothstep(0.0, 0.050, min(f.y, 1.0 - f.y));
  vec3 stone = mix(vec3(0.62, 0.62, 0.58), vec3(1.04, 1.02, 0.95), h);
  stone *= mix(0.90, 1.0, joint);
  stone *= mix(0.93, 1.0, smoothstep(0.0, 0.30, f.y));
  diffuseColor.rgb *= mix(vec3(1.0), stone, vert * isStone);

  float gy = smoothstep(0.45, 0.88, abs(n.y));
  float g1 = vn2(vWPos.xz * 1.35);
  float g2 = vn2(vWPos.xz * 0.11);
  vec3 grass = mix(vec3(0.82, 0.86, 0.72), vec3(1.06, 1.04, 0.98), g1 * 0.42 + g2 * 0.46 + vn2(vWPos.xz * 4.3) * 0.12);
  float cell = h21(floor(vWPos.xz) + 17.0);
  grass *= 0.95 + 0.10 * cell;
  diffuseColor.rgb *= mix(vec3(1.0), grass, gy * isGrass);
}`);
};
function geometryFromArrays(a) {
  const geometry = new THREE3.BufferGeometry();
  geometry.setAttribute("position", new THREE3.BufferAttribute(a.positions, 3));
  geometry.setAttribute("normal", new THREE3.BufferAttribute(a.normals, 3));
  geometry.setAttribute("color", new THREE3.BufferAttribute(a.colors, 3));
  geometry.setAttribute("aMat", new THREE3.BufferAttribute(a.mats, 1));
  geometry.setIndex(new THREE3.BufferAttribute(a.indices, 1));
  geometry.computeBoundingSphere();
  return { geometry, triangles: a.triangles };
}
function paddedFor(world, chunk) {
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  return buildPadded(chunk.data, (x, y, z) => getVoxel(world, ox + x, Y_MIN + y, oz + z));
}
function meshChunk(world, chunk) {
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  return geometryFromArrays(meshPadded(paddedFor(world, chunk), chunk.heights, ox, oz, world.seed));
}

// tests/m004.workers.test.ts
for (const version of [GENERATOR_VERSION, GENERATOR_V2]) {
  test(`worker-path generation is identical to synchronous generation (v${version})`, () => {
    const sync = createWorld(1337, version);
    const viaWorker = createWorld(1337, version);
    const cx = 29, cz = 29;
    for (const w of [sync, viaWorker]) {
      const probe = createWorld(1337, version);
      const y = surfaceAt(probe, chunkOriginX(cx) + 5, chunkOriginZ(cz) + 5);
      w.edits.set(chunkKey(cx, cz), /* @__PURE__ */ new Map());
      setVoxel(w, chunkOriginX(cx) + 5, y, chunkOriginZ(cz) + 5, MAT.STONE);
      w.chunks.clear();
      w.entities.clear();
      w.entityChunks.clear();
    }
    const a = ensureChunk(sync, cx, cz);
    const base = generateBaseChunk(1337, version, cx, cz);
    seedBaseColumns(viaWorker, chunkKey(cx, cz), computeBaseColumns(1337, version, cx, cz));
    const b = installBaseChunk(viaWorker, base);
    assert.deepEqual(b.data, a.data);
    assert.deepEqual(b.heights, a.heights);
    assert.deepEqual(b.topMaterials, a.topMaterials);
    assert.deepEqual([...viaWorker.entities.values()], [...sync.entities.values()]);
    assert.equal(installBaseChunk(viaWorker, base), b, "a second result for a resident chunk is ignored");
    assert.throws(() => installBaseChunk(createWorld(7, version), base), /different world/);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      ensureChunk(sync, cx + dx, cz + dz);
      ensureChunk(viaWorker, cx + dx, cz + dz);
    }
    const m1 = meshChunk(sync, a);
    const m2 = meshPadded(paddedFor(viaWorker, b), b.heights, chunkOriginX(cx), chunkOriginZ(cz), 1337);
    assert.deepEqual(Array.from(m2.positions), Array.from(m1.geometry.getAttribute("position").array));
    assert.deepEqual(Array.from(m2.indices), Array.from(m1.geometry.index.array));
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwNC53b3JrZXJzLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3JlbmRlci93YXRlci50cyIsICIuLi8uLi9zcmMvZGF0YS9wYWxldHRlLmpzb24iLCAiLi4vLi4vc3JjL3JlbmRlci92b3hlbC1jb2xvcnMudHMiLCAiLi4vLi4vc3JjL3JlbmRlci9tZXNoZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB0ZXN0IGZyb20gJ25vZGU6dGVzdCc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQge1xuICBHRU5FUkFUT1JfVjIsIEdFTkVSQVRPUl9WRVJTSU9OLCBNQVQsIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBjb21wdXRlQmFzZUNvbHVtbnMsIGNyZWF0ZVdvcmxkLCBlbnN1cmVDaHVuayxcbiAgZ2VuZXJhdGVCYXNlQ2h1bmssIGluc3RhbGxCYXNlQ2h1bmssIHNlZWRCYXNlQ29sdW1ucywgc2V0Vm94ZWwsIHN1cmZhY2VBdCwgY2h1bmtLZXksXG59IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHsgbWVzaENodW5rLCBwYWRkZWRGb3IgfSBmcm9tICcuLi9zcmMvcmVuZGVyL3RlcnJhaW4nO1xuaW1wb3J0IHsgbWVzaFBhZGRlZCB9IGZyb20gJy4uL3NyYy9yZW5kZXIvbWVzaGVyJztcblxuLy8gVGhlIHdvcmtlciBydW5zIGV4YWN0bHkgdGhlc2UgcHVyZSBmdW5jdGlvbnM7IHRoaXMgdGVzdCBwcm92ZXMgdGhhdCB0aGVcbi8vIG9mZi10aHJlYWQgcGF0aCBpbnN0YWxscyB0aGUgc2FtZSBjaHVuaywgZW50aXRpZXMgYW5kIG1lc2ggYXMgdGhlXG4vLyBzeW5jaHJvbm91cyBwYXRoLCBpbmNsdWRpbmcgZHVyYWJsZSBlZGl0cyBtYWRlIGJlZm9yZSB0aGUgcmVzdWx0IGFycml2ZXMuXG5mb3IgKGNvbnN0IHZlcnNpb24gb2YgW0dFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjJdKSB7XG4gIHRlc3QoYHdvcmtlci1wYXRoIGdlbmVyYXRpb24gaXMgaWRlbnRpY2FsIHRvIHN5bmNocm9ub3VzIGdlbmVyYXRpb24gKHYke3ZlcnNpb259KWAsICgpID0+IHtcbiAgICBjb25zdCBzeW5jID0gY3JlYXRlV29ybGQoMTMzNywgdmVyc2lvbik7XG4gICAgY29uc3QgdmlhV29ya2VyID0gY3JlYXRlV29ybGQoMTMzNywgdmVyc2lvbik7XG4gICAgY29uc3QgY3ggPSAyOSwgY3ogPSAyOTtcbiAgICAvLyBBIGR1cmFibGUgZWRpdCByZWNvcmRlZCBiZWZvcmUgdGhlIGNodW5rIGJlY29tZXMgcmVzaWRlbnQuXG4gICAgZm9yIChjb25zdCB3IG9mIFtzeW5jLCB2aWFXb3JrZXJdKSB7XG4gICAgICBjb25zdCBwcm9iZSA9IGNyZWF0ZVdvcmxkKDEzMzcsIHZlcnNpb24pO1xuICAgICAgY29uc3QgeSA9IHN1cmZhY2VBdChwcm9iZSwgY2h1bmtPcmlnaW5YKGN4KSArIDUsIGNodW5rT3JpZ2luWihjeikgKyA1KTtcbiAgICAgIHcuZWRpdHMuc2V0KGNodW5rS2V5KGN4LCBjeiksIG5ldyBNYXAoKSk7XG4gICAgICBzZXRWb3hlbCh3LCBjaHVua09yaWdpblgoY3gpICsgNSwgeSwgY2h1bmtPcmlnaW5aKGN6KSArIDUsIE1BVC5TVE9ORSk7XG4gICAgICB3LmNodW5rcy5jbGVhcigpO1xuICAgICAgdy5lbnRpdGllcy5jbGVhcigpOyB3LmVudGl0eUNodW5rcy5jbGVhcigpO1xuICAgIH1cbiAgICBjb25zdCBhID0gZW5zdXJlQ2h1bmsoc3luYywgY3gsIGN6KSE7XG4gICAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKDEzMzcsIHZlcnNpb24sIGN4LCBjeik7XG4gICAgc2VlZEJhc2VDb2x1bW5zKHZpYVdvcmtlciwgY2h1bmtLZXkoY3gsIGN6KSwgY29tcHV0ZUJhc2VDb2x1bW5zKDEzMzcsIHZlcnNpb24sIGN4LCBjeikpO1xuICAgIGNvbnN0IGIgPSBpbnN0YWxsQmFzZUNodW5rKHZpYVdvcmtlciwgYmFzZSkhO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoYi5kYXRhLCBhLmRhdGEpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoYi5oZWlnaHRzLCBhLmhlaWdodHMpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoYi50b3BNYXRlcmlhbHMsIGEudG9wTWF0ZXJpYWxzKTtcbiAgICBhc3NlcnQuZGVlcEVxdWFsKFsuLi52aWFXb3JrZXIuZW50aXRpZXMudmFsdWVzKCldLCBbLi4uc3luYy5lbnRpdGllcy52YWx1ZXMoKV0pO1xuICAgIGFzc2VydC5lcXVhbChpbnN0YWxsQmFzZUNodW5rKHZpYVdvcmtlciwgYmFzZSksIGIsICdhIHNlY29uZCByZXN1bHQgZm9yIGEgcmVzaWRlbnQgY2h1bmsgaXMgaWdub3JlZCcpO1xuICAgIGFzc2VydC50aHJvd3MoKCkgPT4gaW5zdGFsbEJhc2VDaHVuayhjcmVhdGVXb3JsZCg3LCB2ZXJzaW9uKSwgYmFzZSksIC9kaWZmZXJlbnQgd29ybGQvKTtcblxuICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIHsgZW5zdXJlQ2h1bmsoc3luYywgY3ggKyBkeCwgY3ogKyBkeik7IGVuc3VyZUNodW5rKHZpYVdvcmtlciwgY3ggKyBkeCwgY3ogKyBkeik7IH1cbiAgICBjb25zdCBtMSA9IG1lc2hDaHVuayhzeW5jLCBhKTtcbiAgICBjb25zdCBtMiA9IG1lc2hQYWRkZWQocGFkZGVkRm9yKHZpYVdvcmtlciwgYiksIGIuaGVpZ2h0cywgY2h1bmtPcmlnaW5YKGN4KSwgY2h1bmtPcmlnaW5aKGN6KSwgMTMzNyk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChBcnJheS5mcm9tKG0yLnBvc2l0aW9ucyksIEFycmF5LmZyb20obTEuZ2VvbWV0cnkuZ2V0QXR0cmlidXRlKCdwb3NpdGlvbicpLmFycmF5KSk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChBcnJheS5mcm9tKG0yLmluZGljZXMpLCBBcnJheS5mcm9tKG0xLmdlb21ldHJ5LmluZGV4IS5hcnJheSkpO1xuICB9KTtcbn1cbiIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gRGV0ZXJtaW5pc3RpYyBoYXNoLCBub2lzZSBhbmQgbWF0aCBoZWxwZXJzIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllci5cbi8vIFB1cmUgVHlwZVNjcmlwdCAoRC0wMDUpLiBFeHRyYWN0ZWQgZnJvbSB3b3JsZC50cyB1bmNoYW5nZWQgc28gdGVycmFpblxuLy8gZ2VuZXJhdG9ycyBvZiBldmVyeSB2ZXJzaW9uIHVzZSBpZGVudGljYWwgcHJpbWl0aXZlcy5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5leHBvcnQgY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4iLCAiLy8gSHlkcm9sb2d5IFx1MjAxNCB0aGUgZGV0ZXJtaW5pc3RpYyB3YXRlciBuZXR3b3JrIG9mIGEgd29ybGQgKHB1cmUgVHlwZVNjcmlwdCwgRC0wMDUpLlxuLy9cbi8vIFRoaXMgaXMgZGVyaXZlZCAqc2ltdWxhdGlvbiBkYXRhKiwgbm90IHByZXNlbnRhdGlvbjogaXQgaXMgYSBwdXJlIGZ1bmN0aW9uIG9mXG4vLyAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pIGFuZCBpcyB3aGF0IHRlcnJhaW4gY2FydmluZywgd2F0ZXIgZmlsbGluZywgZmxvd1xuLy8gZGlyZWN0aW9uIGFuZCBmdXR1cmUgZmlzaGluZy9pcnJpZ2F0aW9uL2Zsb29kaW5nIHJ1bGVzIHJlYWQuIEl0IGlzIG5ldmVyXG4vLyBqb3VybmFsZWQgYmVjYXVzZSBpdCBjYW4gYWx3YXlzIGJlIHJlZ2VuZXJhdGVkIGV4YWN0bHkuXG4vL1xuLy8gTmV0d29yayAoYm90aCBnZW5lcmF0b3IgdmVyc2lvbnMpOlxuLy8gICBsYWtlICBcdTIwMTQgdGhlIHZhbGxleSBsYWtlIGJhc2luLCBsb2NhdGVkIGZyb20gdGhlIGFjdHVhbCBnZW5lcmF0ZWQgdGVycmFpbi5cbi8vICAgbG93ZXIgXHUyMDE0IHRoZSBsb3dsYW5kIHJpdmVyIGZyb20gdGhlIGxha2UgdG8gdGhlIHNvdXRoZXJuIHNlYSwgdHJhY2VkIGZyb21cbi8vICAgICAgICAgICB0aGUgYWN0dWFsIGNhcnZlZCBjaGFubmVsICh0aGUgdjEgY2hhbm5lbCBpcyBjYXJ2ZWQgb24gKndhcnBlZCpcbi8vICAgICAgICAgICBjb29yZGluYXRlcywgc28gYHJpdmVyQ2VudGVyWGAgYWxvbmUgaXMgdXAgdG8gfjEzNSBtIG9mZikuXG4vLyBHZW5lcmF0b3IgdjIgYWRkczpcbi8vICAgdXBwZXIgXHUyMDE0IGEgbW91bnRhaW4gcml2ZXIgZnJvbSBhIGhpZ2hsYW5kIHRhcm4gZG93biB0byB0aGUgbGFrZSwgd2l0aCBhXG4vLyAgICAgICAgICAgd2F0ZXItc3VyZmFjZSBsZXZlbCB0aGF0IG5ldmVyIHJpc2VzIGRvd25zdHJlYW0sIGNhc2NhZGVzIGFuZCBmYWxscy5cbi8vXG4vLyBGbG93IGFsd2F5cyBwb2ludHMgZG93bnN0cmVhbTogdXBwZXIgXHUyMTkyIGxha2UgXHUyMTkyIGxvd2VyIFx1MjE5MiBzZWEuXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbXVsYmVycnkzMiwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuXG5leHBvcnQgdHlwZSBIZWlnaHRTYW1wbGVyID0gKHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUml2ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZCBvZiB0aGlzIHJlYWNoIChtZXRyZXMpLiAqL1xuICBzOiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGVsZXZhdGlvbiAobWV0cmVzLCBtYXkgYmUgZnJhY3Rpb25hbCkuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBDaGFubmVsIGhhbGYtd2lkdGggKG1ldHJlcykuICovXG4gIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY2hIaXQge1xuICAvKiogSG9yaXpvbnRhbCBkaXN0YW5jZSBmcm9tIHRoZSBjZW50cmVsaW5lLiAqL1xuICBkOiBudW1iZXI7XG4gIC8qKiBJbnRlcnBvbGF0ZWQgd2F0ZXIgbGV2ZWwgYXQgdGhlIG5lYXJlc3QgY2VudHJlbGluZSBwb2ludC4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgd2lkdGg6IG51bWJlcjtcbiAgLyoqIFVuaXQgZG93bnN0cmVhbSBkaXJlY3Rpb24uICovXG4gIHR4OiBudW1iZXI7XG4gIHR6OiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGRyb3AgcGVyIG1ldHJlIGFsb25nIHRoZSBjaGFubmVsICg+PSAwKS4gKi9cbiAgZ3JhZGllbnQ6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggb2YgdGhlIG5lYXJlc3QgcG9pbnQgZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQuICovXG4gIHM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvbHlsaW5lIHJlYWNoIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LiBOZWFyZXN0LXNlZ21lbnQgcXVlcmllcyB1c2UgYVxuICogdW5pZm9ybSBncmlkIHdob3NlIGNlbGxzIGxpc3QgZXZlcnkgc2VnbWVudCB3aXRoaW4gYHJlYWNoYCBtZXRyZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSaXZlclJlYWNoIHtcbiAgcmVhZG9ubHkgcG9pbnRzOiBSaXZlclBvaW50W107XG4gIHByaXZhdGUgcmVhZG9ubHkgY2VsbCA9IDMyO1xuICBwcml2YXRlIHJlYWRvbmx5IGdyaWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cbiAgY29uc3RydWN0b3IocG9pbnRzOiBSaXZlclBvaW50W10sIHJlYWRvbmx5IHJlYWNoOiBudW1iZXIpIHtcbiAgICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgICBmb3IgKGxldCBpID0gMDsgaSArIDEgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBwb2ludHNbaV0sIGIgPSBwb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgeDAgPSBNYXRoLm1pbihhLngsIGIueCkgLSByZWFjaCwgeDEgPSBNYXRoLm1heChhLngsIGIueCkgKyByZWFjaDtcbiAgICAgIGNvbnN0IHowID0gTWF0aC5taW4oYS56LCBiLnopIC0gcmVhY2gsIHoxID0gTWF0aC5tYXgoYS56LCBiLnopICsgcmVhY2g7XG4gICAgICBmb3IgKGxldCBjeiA9IE1hdGguZmxvb3IoejAgLyB0aGlzLmNlbGwpOyBjeiA8PSBNYXRoLmZsb29yKHoxIC8gdGhpcy5jZWxsKTsgY3orKykge1xuICAgICAgICBmb3IgKGxldCBjeCA9IE1hdGguZmxvb3IoeDAgLyB0aGlzLmNlbGwpOyBjeCA8PSBNYXRoLmZsb29yKHgxIC8gdGhpcy5jZWxsKTsgY3grKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGNlbGxLZXkoY3gsIGN6KTtcbiAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoa2V5KTtcbiAgICAgICAgICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB0aGlzLmdyaWQuc2V0KGtleSwgbGlzdCk7IH1cbiAgICAgICAgICBsaXN0LnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBvaW50c1t0aGlzLnBvaW50cy5sZW5ndGggLSAxXT8ucyA/PyAwOyB9XG5cbiAgLyoqIE5lYXJlc3QgY2VudHJlbGluZSBwb2ludCB3aXRoaW4gYHJlYWNoYCwgb3IgbnVsbC4gKi9cbiAgbmVhcmVzdCh4OiBudW1iZXIsIHo6IG51bWJlcik6IFJlYWNoSGl0IHwgbnVsbCB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoY2VsbEtleShNYXRoLmZsb29yKHggLyB0aGlzLmNlbGwpLCBNYXRoLmZsb29yKHogLyB0aGlzLmNlbGwpKSk7XG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBiaSA9IC0xLCBidCA9IDA7XG4gICAgZm9yIChjb25zdCBpIG9mIGxpc3QpIHtcbiAgICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tpXSwgYiA9IHRoaXMucG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IGR4ID0gYi54IC0gYS54LCBkeiA9IGIueiAtIGEuejtcbiAgICAgIGNvbnN0IGxlbjIgPSBkeCAqIGR4ICsgZHogKiBkeiB8fCAxO1xuICAgICAgY29uc3QgdCA9IGNsYW1wKCgoeCAtIGEueCkgKiBkeCArICh6IC0gYS56KSAqIGR6KSAvIGxlbjIsIDAsIDEpO1xuICAgICAgY29uc3QgcHggPSBhLnggKyBkeCAqIHQsIHB6ID0gYS56ICsgZHogKiB0O1xuICAgICAgY29uc3QgZDIgPSAoeCAtIHB4KSAqKiAyICsgKHogLSBweikgKiogMjtcbiAgICAgIGlmIChkMiA8IGJlc3QpIHsgYmVzdCA9IGQyOyBiaSA9IGk7IGJ0ID0gdDsgfVxuICAgIH1cbiAgICBpZiAoYmkgPCAwIHx8IGJlc3QgPiB0aGlzLnJlYWNoICogdGhpcy5yZWFjaCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2JpXSwgYiA9IHRoaXMucG9pbnRzW2JpICsgMV07XG4gICAgY29uc3Qgc2VnTGVuID0gTWF0aC5tYXgoMWUtNiwgYi5zIC0gYS5zKTtcbiAgICAvLyBQb2ludHMgYXJlIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LCBzbyBkb3duc3RyZWFtIGlzIGEgPC0gYi5cbiAgICBjb25zdCB0eCA9IChhLnggLSBiLngpIC8gc2VnTGVuLCB0eiA9IChhLnogLSBiLnopIC8gc2VnTGVuO1xuICAgIHJldHVybiB7XG4gICAgICBkOiBNYXRoLnNxcnQoYmVzdCksXG4gICAgICBsZXZlbDogYS5sZXZlbCArIChiLmxldmVsIC0gYS5sZXZlbCkgKiBidCxcbiAgICAgIHdpZHRoOiBhLndpZHRoICsgKGIud2lkdGggLSBhLndpZHRoKSAqIGJ0LFxuICAgICAgdHgsIHR6LFxuICAgICAgZ3JhZGllbnQ6IE1hdGgubWF4KDAsIChiLmxldmVsIC0gYS5sZXZlbCkgLyBzZWdMZW4pLFxuICAgICAgczogYS5zICsgKGIucyAtIGEucykgKiBidCxcbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGNlbGxLZXkoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoY3ggKyA0MDk2KSAqIDgxOTIgKyAoY3ogKyA0MDk2KTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0ZXJCb2R5ID0gJ3JpdmVyJyB8ICdsYWtlJyB8ICdzZWEnIHwgJ25vbmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTYW1wbGUge1xuICBib2R5OiBXYXRlckJvZHk7XG4gIC8qKiBVbml0IGZsb3cgZGlyZWN0aW9uICh6ZXJvIGZvciBzdGlsbCB3YXRlcikuICovXG4gIGR4OiBudW1iZXI7XG4gIGR6OiBudW1iZXI7XG4gIC8qKiBTdXJmYWNlIGN1cnJlbnQgc3BlZWQgaW4gbS9zLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEh5ZHJvbG9neU9wdGlvbnMge1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKiBHZW5lcmF0b3IgdmVyc2lvbiB0aGUgbmV0d29yayBiZWxvbmdzIHRvLiAqL1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIC8qKiBCYXNlIGhlaWdodCBvZiB0aGUgKnVubW9kaWZpZWQgdjEgc2hhcGUqICh1c2VkIHRvIGxvY2F0ZSBsYWtlL2NoYW5uZWwpLiAqL1xuICB2MUhlaWdodDogSGVpZ2h0U2FtcGxlcjtcbn1cblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2dpY2FsIG5ldHdvcmsgZm9yIG9uZSAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pLiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJvbG9neSB7XG4gIHJlYWRvbmx5IHNlZWQ6IG51bWJlcjtcbiAgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuICByZWFkb25seSBsYWtlOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByeDogbnVtYmVyOyByejogbnVtYmVyIH07XG4gIHJlYWRvbmx5IGxvd2VyOiBSaXZlclJlYWNoO1xuICByZWFkb25seSB1cHBlcjogUml2ZXJSZWFjaCB8IG51bGw7XG4gIC8qKiBVcHBlci1yaXZlciBzb3VyY2UgdGFybiAodjIgb25seSkuICovXG4gIHJlYWRvbmx5IHRhcm46IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlcjsgbGV2ZWw6IG51bWJlciB9IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihvcHRzOiBIeWRyb2xvZ3lPcHRpb25zKSB7XG4gICAgdGhpcy5zZWVkID0gb3B0cy5zZWVkO1xuICAgIHRoaXMudmVyc2lvbiA9IG9wdHMudmVyc2lvbjtcbiAgICB0aGlzLmxha2UgPSBsb2NhdGVMYWtlKG9wdHMudjFIZWlnaHQpO1xuICAgIHRoaXMubG93ZXIgPSB0cmFjZUxvd2VyUml2ZXIob3B0cy52MUhlaWdodCwgdGhpcy5sYWtlKTtcbiAgICBpZiAob3B0cy52ZXJzaW9uID49IDIpIHtcbiAgICAgIGNvbnN0IHVwcGVyID0gYXV0aG9yVXBwZXJSaXZlcihvcHRzLnNlZWQsIHRoaXMubGFrZSk7XG4gICAgICB0aGlzLnVwcGVyID0gdXBwZXIucmVhY2g7XG4gICAgICB0aGlzLnRhcm4gPSB1cHBlci50YXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwcGVyID0gbnVsbDtcbiAgICAgIHRoaXMudGFybiA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1cmZhY2UgY3VycmVudCBmb3IgYSB3YXRlciBjb2x1bW4uIGBsZXZlbGAgaXMgdGhlIGNvbHVtbidzIHdhdGVyIHN1cmZhY2UsXG4gICAqIHVzZWQgdG8gdGVsbCBzZWEtbGV2ZWwgd2F0ZXIgKGxha2UsIGxvd2VyIHJpdmVyLCBzZWEpIGZyb20gdGhlIHVwcGVyIHJpdmVyLlxuICAgKi9cbiAgZmxvd0F0KHg6IG51bWJlciwgejogbnVtYmVyLCBsZXZlbDogbnVtYmVyKTogRmxvd1NhbXBsZSB7XG4gICAgaWYgKHRoaXMudXBwZXIgJiYgbGV2ZWwgPiAwLjUpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMudXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPD0gaGl0LndpZHRoICsgMikge1xuICAgICAgICBjb25zdCBzcGVlZCA9IGNsYW1wKDAuNTUgKyBoaXQuZ3JhZGllbnQgKiA5LCAwLjQsIDQuNSk7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBoaXQudHgsIGR6OiBoaXQudHosIHNwZWVkIH07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50YXJuICYmIE1hdGguaHlwb3QoeCAtIHRoaXMudGFybi54LCB6IC0gdGhpcy50YXJuLnopIDwgdGhpcy50YXJuLnIgKyA0KSB7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4udG93YXJkcyh4LCB6LCB0aGlzLnVwcGVyU291cmNlKCksIDAuMDYpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxvdyA9IHRoaXMubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDw9IGxvdy53aWR0aCArIDYpIHtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBsb3cudHgsIGR6OiBsb3cudHosIHNwZWVkOiAwLjM1ICsgMC4yNSAqIHNtb290aHN0ZXAobG93LndpZHRoICsgNiwgMCwgbG93LmQpIH07XG4gICAgfVxuICAgIGNvbnN0IGxkID0gTWF0aC5oeXBvdCgoeCAtIHRoaXMubGFrZS54KSAvIHRoaXMubGFrZS5yeCwgKHogLSB0aGlzLmxha2UueikgLyB0aGlzLmxha2UucnopO1xuICAgIGlmIChsZCA8IDEuMzUpIHtcbiAgICAgIC8vIFNsb3cgZHJpZnQgZnJvbSB0aGUgaW5mbG93IHRvd2FyZCB0aGUgb3V0ZmxvdyBhdCB0aGUgaGVhZCBvZiB0aGUgbG93ZXIgcml2ZXIuXG4gICAgICBjb25zdCBoZWFkID0gdGhpcy5sb3dlci5wb2ludHNbdGhpcy5sb3dlci5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBkcmlmdCA9IHRvd2FyZHMoeCwgeiwgaGVhZCwgMC4wOCk7XG4gICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLmRyaWZ0IH07XG4gICAgfVxuICAgIHJldHVybiB7IGJvZHk6ICdzZWEnLCBkeDogMCwgZHo6IDAsIHNwZWVkOiAwIH07XG4gIH1cblxuICBwcml2YXRlIHVwcGVyU291cmNlKCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcHRzID0gdGhpcy51cHBlciEucG9pbnRzO1xuICAgIHJldHVybiBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvd2FyZHMoeDogbnVtYmVyLCB6OiBudW1iZXIsIHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgc3BlZWQ6IG51bWJlcikge1xuICBjb25zdCBkeCA9IHAueCAtIHgsIGR6ID0gcC56IC0gejtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gIHJldHVybiB7IGR4OiBkeCAvIGxlbiwgZHo6IGR6IC8gbGVuLCBzcGVlZCB9O1xufVxuXG4vKiogRmluZCB0aGUgdmFsbGV5IGxha2UgZnJvbSB0aGUgdGVycmFpbiBpdHNlbGY6IHRoZSBkZWVwIGJhc2luIE5XIG9mIHRoZSBmb3VuZGVyIHZhbGxleS4gKi9cbmZ1bmN0aW9uIGxvY2F0ZUxha2UoaDogSGVpZ2h0U2FtcGxlcik6IEh5ZHJvbG9neVsnbGFrZSddIHtcbiAgbGV0IHN4ID0gMCwgc3ogPSAwLCBuID0gMCwgbWluWCA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtaW5aID0gSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gIGZvciAobGV0IHogPSAtNDYwOyB6IDw9IC0xMjA7IHogKz0gNCkge1xuICAgIGZvciAobGV0IHggPSAtNDgwOyB4IDw9IC00MDsgeCArPSA0KSB7XG4gICAgICBpZiAoaCh4LCB6KSA+IC00KSBjb250aW51ZTtcbiAgICAgIHN4ICs9IHg7IHN6ICs9IHo7IG4rKztcbiAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCB4KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHgpO1xuICAgICAgbWluWiA9IE1hdGgubWluKG1pblosIHopOyBtYXhaID0gTWF0aC5tYXgobWF4Wiwgeik7XG4gICAgfVxuICB9XG4gIGlmIChuID09PSAwKSByZXR1cm4geyB4OiAtMjYwLCB6OiAtMjMwLCByeDogMTIwLCByejogOTUgfTtcbiAgcmV0dXJuIHtcbiAgICB4OiBzeCAvIG4sIHo6IHN6IC8gbixcbiAgICByeDogTWF0aC5tYXgoMzAsIChtYXhYIC0gbWluWCkgLyAyICsgMTApLCByejogTWF0aC5tYXgoMzAsIChtYXhaIC0gbWluWikgLyAyICsgMTApLFxuICB9O1xufVxuXG4vKipcbiAqIFRyYWNlIHRoZSBjYXJ2ZWQgbG93bGFuZCBjaGFubmVsIGZyb20gdGhlIGxha2Ugb3V0ZmxvdyBzb3V0aCB0byB0aGUgc2VhLiBGb3JcbiAqIGVhY2ggNCBtIHJvdyB0aGUgY2hhbm5lbCBpcyB0aGUgbG93ZXN0IGNvbHVtbiBuZWFyIHRoZSBwcmV2aW91cyBjZW50cmU7IHRoZVxuICogdHJhY2UgaXMgc21vb3RoZWQgc28gdGhlIGZsb3cgZmllbGQgZG9lcyBub3Qgaml0dGVyIHdpdGggdGhlIDEgbSB2b3hlbHMuXG4gKi9cbmZ1bmN0aW9uIHRyYWNlTG93ZXJSaXZlcihoOiBIZWlnaHRTYW1wbGVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IFJpdmVyUmVhY2gge1xuICBjb25zdCByYXc6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgbGV0IGN4ID0gbGFrZS54ICsgbGFrZS5yeCAqIDAuNTU7XG4gIGxldCB6ID0gTWF0aC5yb3VuZChsYWtlLnogKyBsYWtlLnJ6ICogMC42KTtcbiAgLy8gU3RhcnQgYXQgdGhlIGxha2UncyBzb3V0aC1lYXN0IG91dGZsb3cgYW5kIGZvbGxvdyB0aGUgY2hhbm5lbCBkb3duc3RyZWFtLlxuICBmb3IgKDsgeiA8PSA5MDA7IHogKz0gNCkge1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJ4ID0gY3g7XG4gICAgZm9yIChsZXQgeCA9IE1hdGgucm91bmQoY3ggLSA0MCk7IHggPD0gY3ggKyA0MDsgeCArPSAyKSB7XG4gICAgICBjb25zdCB2ID0gaCh4LCB6KSArIE1hdGguYWJzKHggLSBjeCkgKiAwLjAyO1xuICAgICAgaWYgKHYgPCBiZXN0KSB7IGJlc3QgPSB2OyBieCA9IHg7IH1cbiAgICB9XG4gICAgY3ggPSBieDtcbiAgICByYXcucHVzaCh7IHg6IGJ4LCB6IH0pO1xuICAgIC8vIFRoZSB0cmFjZSBlbmRzIG9uY2UgaXQgcmVhY2hlcyBvcGVuIHNlYSBmb3IgYSBzdXN0YWluZWQgc3RyZXRjaC5cbiAgICBpZiAoYmVzdCA8IC02ICYmIHJhdy5sZW5ndGggPiAyMCAmJiBoKGJ4LCB6ICsgOCkgPCAtNiAmJiBoKGJ4LCB6ICsgMTYpIDwgLTYpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHNtb290aCA9IHJhdy5tYXAoKHAsIGkpID0+IHtcbiAgICBsZXQgc3ggPSAwLCBuID0gMDtcbiAgICBmb3IgKGxldCBrID0gTWF0aC5tYXgoMCwgaSAtIDQpOyBrIDw9IE1hdGgubWluKHJhdy5sZW5ndGggLSAxLCBpICsgNCk7IGsrKykgeyBzeCArPSByYXdba10ueDsgbisrOyB9XG4gICAgcmV0dXJuIHsgeDogc3ggLyBuLCB6OiBwLnogfTtcbiAgfSk7XG4gIC8vIFN0b3JlIGRvd25zdHJlYW0tZmlyc3Q6IGluZGV4IDAgaXMgdGhlIHNlYSBtb3V0aC5cbiAgc21vb3RoLnJldmVyc2UoKTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSBbXTtcbiAgbGV0IHMgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNtb290aC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChpID4gMCkgcyArPSBNYXRoLmh5cG90KHNtb290aFtpXS54IC0gc21vb3RoW2kgLSAxXS54LCBzbW9vdGhbaV0ueiAtIHNtb290aFtpIC0gMV0ueik7XG4gICAgcG9pbnRzLnB1c2goeyB4OiBzbW9vdGhbaV0ueCwgejogc21vb3RoW2ldLnosIHMsIGxldmVsOiAwLCB3aWR0aDogNiB9KTtcbiAgfVxuICByZXR1cm4gbmV3IFJpdmVyUmVhY2gocG9pbnRzLCA0MCk7XG59XG5cbi8qKiBXYXRlci1zdXJmYWNlIGRyb3BzIGFsb25nIHRoZSB1cHBlciByaXZlciwgYXMgKGZyYWN0aW9uIG9mIGxlbmd0aCwgbWV0cmVzKS4gKi9cbmNvbnN0IEZBTExTOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0+ID0gW1swLjIsIDddLCBbMC40OCwgMTFdLCBbMC43NCwgMTNdXTtcbmNvbnN0IFVQUEVSX0dSQURJRU5UID0gMC4wMztcblxuLyoqXG4gKiBBdXRob3IgdGhlIHYyIG1vdW50YWluIHJpdmVyOiBhIHNlZWRlZCBtZWFuZGVyaW5nIGNlbnRyZWxpbmUgZnJvbSB0aGUgbGFrZSdzXG4gKiBub3J0aCBzaG9yZSB0byBhIGhpZ2hsYW5kIHRhcm4sIHdpdGggYSBsZXZlbCBwcm9maWxlIHRoYXQgb25seSByaXNlc1xuICogdXBzdHJlYW0gKGdlbnRsZSBncmFkaWVudCBwbHVzIHRocmVlIGNhc2NhZGVzKS5cbiAqL1xuZnVuY3Rpb24gYXV0aG9yVXBwZXJSaXZlcihzZWVkOiBudW1iZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKToge1xuICByZWFjaDogUml2ZXJSZWFjaDsgdGFybjogTm9uTnVsbGFibGU8SHlkcm9sb2d5Wyd0YXJuJ10+O1xufSB7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKHNlZWQgXiAweDVlZWQyKSA+Pj4gMCk7XG4gIGNvbnN0IGogPSAoYTogbnVtYmVyKSA9PiAocm5kKCkgLSAwLjUpICogMiAqIGE7XG4gIGNvbnN0IG1vdXRoID0geyB4OiBsYWtlLnggKyBsYWtlLnJ4ICogMC4xLCB6OiBsYWtlLnogLSBsYWtlLnJ6ICogMC41NSB9O1xuICBjb25zdCBjb250cm9scyA9IFtcbiAgICBtb3V0aCxcbiAgICB7IHg6IGxha2UueCArIDIwICsgaigyMCksIHo6IC00MTAgKyBqKDE1KSB9LFxuICAgIHsgeDogLTE5MCArIGooMzUpLCB6OiAtNTIwICsgaigyMCkgfSxcbiAgICB7IHg6IC0yMTUgKyBqKDM1KSwgejogLTY0MCArIGooMjApIH0sXG4gICAgeyB4OiAtMTY1ICsgaigzMCksIHo6IC03NzAgKyBqKDE1KSB9LFxuICBdO1xuICAvLyBDYXRtdWxsLVJvbSB0aHJvdWdoIHRoZSBjb250cm9scywgdGhlbiByZXNhbXBsZSBhdCB+OCBtIHNwYWNpbmcgd2l0aCBhXG4gIC8vIHNtYWxsIHNlZWRlZCBtZWFuZGVyIHNvIHRoZSBjaGFubmVsIGlzIG5vdCBhIHNtb290aCBzcGxpbmUuXG4gIGNvbnN0IGRlbnNlOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29udHJvbHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgY29uc3QgcDAgPSBjb250cm9sc1tNYXRoLm1heCgwLCBpIC0gMSldLCBwMSA9IGNvbnRyb2xzW2ldO1xuICAgIGNvbnN0IHAyID0gY29udHJvbHNbaSArIDFdLCBwMyA9IGNvbnRyb2xzW01hdGgubWluKGNvbnRyb2xzLmxlbmd0aCAtIDEsIGkgKyAyKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCAyNDsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gayAvIDI0LCB0MiA9IHQgKiB0LCB0MyA9IHQyICogdDtcbiAgICAgIGRlbnNlLnB1c2goe1xuICAgICAgICB4OiAwLjUgKiAoMiAqIHAxLnggKyAoLXAwLnggKyBwMi54KSAqIHQgKyAoMiAqIHAwLnggLSA1ICogcDEueCArIDQgKiBwMi54IC0gcDMueCkgKiB0MlxuICAgICAgICAgICsgKC1wMC54ICsgMyAqIHAxLnggLSAzICogcDIueCArIHAzLngpICogdDMpLFxuICAgICAgICB6OiAwLjUgKiAoMiAqIHAxLnogKyAoLXAwLnogKyBwMi56KSAqIHQgKyAoMiAqIHAwLnogLSA1ICogcDEueiArIDQgKiBwMi56IC0gcDMueikgKiB0MlxuICAgICAgICAgICsgKC1wMC56ICsgMyAqIHAxLnogLSAzICogcDIueiArIHAzLnopICogdDMpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGRlbnNlLnB1c2goY29udHJvbHNbY29udHJvbHMubGVuZ3RoIC0gMV0pO1xuICBjb25zdCByZXNhbXBsZWQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHM6IG51bWJlciB9PiA9IFt7IC4uLmRlbnNlWzBdLCBzOiAwIH1dO1xuICBsZXQgYWNjID0gMCwgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgZGVuc2UubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5oeXBvdChkZW5zZVtpXS54IC0gZGVuc2VbaSAtIDFdLngsIGRlbnNlW2ldLnogLSBkZW5zZVtpIC0gMV0ueik7XG4gICAgYWNjICs9IHN0ZXA7IHMgKz0gc3RlcDtcbiAgICBpZiAoYWNjID49IDggfHwgaSA9PT0gZGVuc2UubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbSA9IChmYm0yKHMgLyA2MCwgMy4xLCBzZWVkICsgODAxLCAyKSAtIDAuNSkgKiAxNDtcbiAgICAgIHJlc2FtcGxlZC5wdXNoKHsgeDogZGVuc2VbaV0ueCArIG0sIHo6IGRlbnNlW2ldLnosIHMgfSk7XG4gICAgICBhY2MgPSAwO1xuICAgIH1cbiAgfVxuICBjb25zdCB0b3RhbCA9IHJlc2FtcGxlZFtyZXNhbXBsZWQubGVuZ3RoIC0gMV0ucztcbiAgY29uc3QgbGV2ZWxBdCA9IChzdjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGV2ZWwgPSBzdiAqIFVQUEVSX0dSQURJRU5UO1xuICAgIGZvciAoY29uc3QgW2ZyYWMsIGRyb3BdIG9mIEZBTExTKSB7XG4gICAgICAvLyBFYWNoIGZhbGwgaXMgYSBzaG9ydCBjYXNjYWRlIG92ZXIgfjEwIG0gb2YgY2hhbm5lbC5cbiAgICAgIGxldmVsICs9IGRyb3AgKiBzbW9vdGhzdGVwKHRvdGFsICogZnJhYyAtIDUsIHRvdGFsICogZnJhYyArIDUsIHN2KTtcbiAgICB9XG4gICAgLy8gVGhlIGZpcnN0IDQwIG0gaW50byB0aGUgbGFrZSBzdGF5cyBhdCBsYWtlIGxldmVsLlxuICAgIHJldHVybiBzdiA8IDQwID8gMCA6IGxldmVsIC0gNDAgKiBVUFBFUl9HUkFESUVOVDtcbiAgfTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSByZXNhbXBsZWQubWFwKChwKSA9PiAoe1xuICAgIHg6IHAueCwgejogcC56LCBzOiBwLnMsIGxldmVsOiBNYXRoLm1heCgwLCBsZXZlbEF0KHAucykpLFxuICAgIHdpZHRoOiAzLjIgKyAyLjIgKiBmYm0yKHAucyAvIDcwLCA5LjcsIHNlZWQgKyA4MDIsIDIpICsgKDEgLSBwLnMgLyB0b3RhbCkgKiAxLjUsXG4gIH0pKTtcbiAgY29uc3Qgc291cmNlID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHtcbiAgICByZWFjaDogbmV3IFJpdmVyUmVhY2gocG9pbnRzLCAxMTApLFxuICAgIHRhcm46IHsgeDogc291cmNlLngsIHo6IHNvdXJjZS56LCByOiAxOCwgbGV2ZWw6IHNvdXJjZS5sZXZlbCB9LFxuICB9O1xufVxuIiwgIi8vIFZveGVsIG1hdGVyaWFsIGlkcy4gUHVyZSBkYXRhIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllciAoRC0wMDUpLlxuLy8gSWRzIGFyZSBwZXJzaXN0ZWQgaW4gc25hcHNob3QgZWRpdHMsIHNvIGV4aXN0aW5nIHZhbHVlcyBtdXN0IG5ldmVyIGNoYW5nZS5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG4gIC8qKiBHZW5lcmF0b3IgdjIgaGlnaGxhbmRzLiBOZXZlciBwcm9kdWNlZCBieSBnZW5lcmF0b3IgdjEuICovXG4gIFNOT1c6IDEwLFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuLyoqIEhpZ2hlc3QgbWF0ZXJpYWwgaWQgdGhhdCBtYXkgYXBwZWFyIGluIGEgdm94ZWwgZWRpdC4gKi9cbmV4cG9ydCBjb25zdCBNQVhfTUFUX0lEID0gMTA7XG4iLCAiLy8gVGVycmFpbiBnZW5lcmF0b3IgdjIgXHUyMDE0IHRoZSB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IChwdXJlIFRTLCBELTAwNSkuXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBjb250cmFjdDogaW5zaWRlIHRoZSBmb3VuZGVyIGNvcnJpZG9yICh0aGUgc2V0dGxlbWVudCB2YWxsZXksXG4vLyB0aGUgbGFrZSBhbmQgdGhlIGxvd2xhbmQgcml2ZXIpIHYyIGhlaWdodHMgZXF1YWwgdjEgZXhhY3RseSwgc28gdGhlIHBpbm5lZFxuLy8gZm91bmRlciBwcm9qZWN0cywgdGhlaXIgcHJlcGFyYXRpb24gdGFyZ2V0cyBhbmQgbmF0dXJhbCBlbnRpdGllcyB0aGVyZSBhcmVcbi8vIHVuY2hhbmdlZC4gT3V0c2lkZSBpdCB2MiBhZGRzOlxuLy8gICAtIGEgbm9ydGhlcm4gbWFzc2lmIG9uIGFuIGV4dGVuZGVkIGlzbGFuZCwgd2l0aCBzbm93IGFib3ZlIHRoZSBzbm93bGluZTtcbi8vICAgLSBmbGFua2luZyByYW5nZXMgd2VzdCBhbmQgZWFzdCBvZiB0aGUgdmFsbGV5LCB0ZXJyYWNlZCBpbnRvIGNsaWZmIGJhbmRzO1xuLy8gICAtIGEgbW91bnRhaW4gcml2ZXIgY2FydmVkIGludG8gdGhlIG1hc3NpZiBmcm9tIGEgdGFybiBkb3duIHRvIHRoZSBsYWtlLFxuLy8gICAgIHdob3NlIHdhdGVyIHN1cmZhY2UgY29tZXMgZnJvbSBIeWRyb2xvZ3kgYW5kIG5ldmVyIHJpc2VzIGRvd25zdHJlYW07XG4vLyAgIC0gYSBjb250aW51b3VzIGxvd2xhbmQgY2hhbm5lbCAodjEgaGFzIGEgZHJ5IGZvcmQgc291dGggb2YgdGhlIHNoZWxmKS5cbi8vIEhlaWdodHMgYXJlIGludGVnZXJzIGluIFstMTQsIDEwNF0uXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbGVycCwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHsgTUFULCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcblxuZXhwb3J0IGNvbnN0IFYyX1NOT1dMSU5FID0gNzQ7XG5leHBvcnQgY29uc3QgVjJfTUFYX0hFSUdIVCA9IDEwNDtcblxuZXhwb3J0IHR5cGUgVjFIZWlnaHQgPSAoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFYyQ29sdW1uIHtcbiAgLyoqIFRvcCBzb2xpZCB5ICsgMSAoc2FtZSBjb252ZW50aW9uIGFzIHN1cmZhY2VIZWlnaHRBdCkuICovXG4gIGg6IG51bWJlcjtcbiAgLyoqIFdhdGVyIHN1cmZhY2UgZm9yIHRoaXMgY29sdW1uOiBjZWxscyBbaCwgbGV2ZWwpIGhvbGQgd2F0ZXIuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBjb2x1bW4gaXMgcGFydCBvZiB0aGUgY2FydmVkIG1vdW50YWluLXJpdmVyIGNoYW5uZWwuICovXG4gIGNoYW5uZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJyYWluVjIge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBzZWVkOiBudW1iZXIsXG4gICAgcHJpdmF0ZSByZWFkb25seSB2MTogVjFIZWlnaHQsXG4gICAgcmVhZG9ubHkgaHlkcm9sb2d5OiBIeWRyb2xvZ3ksXG4gICkge31cblxuICAvKiogMCA9IGV4YWN0bHkgdjEgKGZvdW5kZXIgY29ycmlkb3IpOyAxID0gZnVsbCB2MiByZWxpZWYuICovXG4gIHJlbGllZk1hc2soeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtMzkwLCAtNDcwLCB6KTtcbiAgICAvLyBUaGUgd2VzdCByYW5nZSBrZWVwcyBjbGVhciBvZiB0aGUgbGFrZSBiYXNpbiB1bnRpbCB0aGUgbGFrZSBpcyBwYXNzZWQuXG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlLCB3ZXN0RWRnZSAtIDkwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyMzAsIDMzMCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIC8qKiAwIGF0IHRoZSByYW5nZSBmcm9udCwgMSBkZWVwIGluc2lkZTogZm9vdGhpbGxzIGZpcnN0LCBwZWFrcyBiZWhpbmQuICovXG4gIHJhbmdlRGVwdGgoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtNDIwLCAtNzAwLCB6KTtcbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UgLSA0MCwgd2VzdEVkZ2UgLSAzMDAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDI3MCwgNTYwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVjJDb2x1bW4ge1xuICAgIGNvbnN0IHNlZWQgPSB0aGlzLnNlZWQ7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMudjEoc2VlZCwgeCwgeik7XG4gICAgY29uc3QgbWFzayA9IHRoaXMucmVsaWVmTWFzayh4LCB6KTtcbiAgICBsZXQgaCA9IGJhc2U7XG5cbiAgICBpZiAobWFzayA+IDApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgaXNsYW5kIG5vcnRoIHNvIHRoZSBtYXNzaWYgaGFzIHJvb20gKHYxIGNvYXN0IGlzIH56IC02MDApLlxuICAgICAgY29uc3Qgbm9ydGhMYW5kID0gc21vb3Roc3RlcCgtNDIwLCAtNTIwLCB6KTtcbiAgICAgIGNvbnN0IHNob3JlID0gMSAtIE1hdGguaHlwb3QoKHggKyAxNTApIC8gNTYwLCAoeiArIDY5MCkgLyAzMDApXG4gICAgICAgICsgKGZibTIoeCAvIDE2MCwgeiAvIDE2MCwgc2VlZCArIDcwMSwgMykgLSAwLjUpICogMC4zO1xuICAgICAgY29uc3QgbGFuZE4gPSBzbW9vdGhzdGVwKDAuMCwgMC4xNCwgc2hvcmUpICogbm9ydGhMYW5kO1xuICAgICAgY29uc3QgZ3JvdW5kID0gbGVycChiYXNlLCBNYXRoLm1heChiYXNlLCA1ICsgNSAqIGZibTIoeCAvIDkwLCB6IC8gOTAsIHNlZWQgKyA3MDIsIDIpKSwgbGFuZE4pO1xuXG4gICAgICAvLyBSaWRnZWQgbWFzc2lmIHdpdGggdGVycmFjZWQgY2xpZmYgYmFuZHMuXG4gICAgICBjb25zdCB3eCA9IHggKyAoZmJtMih4IC8gMjYwLCB6IC8gMjYwLCBzZWVkICsgNzAzLCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCB3eiA9IHogKyAoZmJtMih4IC8gMjYwICsgNS4xLCB6IC8gMjYwIC0gMi43LCBzZWVkICsgNzA0LCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCByMSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIxMCwgd3ogLyAyMTAsIHNlZWQgKyA3MDUsIDQpIC0gMSk7XG4gICAgICBjb25zdCByMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDgwLCB3eiAvIDgwLCBzZWVkICsgNzA2LCAzKSAtIDEpO1xuICAgICAgY29uc3QgbHVtcCA9IGZibTIod3ggLyAxMjAsIHd6IC8gMTIwLCBzZWVkICsgNzA3LCAzKTtcbiAgICAgIGNvbnN0IGRlcHRoID0gdGhpcy5yYW5nZURlcHRoKHgsIHopO1xuICAgICAgbGV0IG1vdW50YWluID0gMTYgKyAoOCArIDgwICogZGVwdGgpICogKDAuNTUgKiByMSAqIHIxICsgMC4yOCAqIHIyICsgMC4xNyAqIGx1bXApXG4gICAgICAgICsgMTggKiBkZXB0aCAqIHNtb290aHN0ZXAoMC41NSwgMC45LCByMSk7XG4gICAgICBjb25zdCBiYW5kID0gNiArIDIgKiBmYm0yKHggLyAxNDAsIHogLyAxNDAsIHNlZWQgKyA3MDgsIDIpO1xuICAgICAgY29uc3QgdCA9IE1hdGguZmxvb3IobW91bnRhaW4gLyBiYW5kKTtcbiAgICAgIGNvbnN0IGZyYWMgPSBtb3VudGFpbiAvIGJhbmQgLSB0O1xuICAgICAgbW91bnRhaW4gPSAodCArIHNtb290aHN0ZXAoMC41LCAwLjgsIGZyYWMpKSAqIGJhbmQ7XG5cbiAgICAgIC8vIE9ubHkgbGFuZCByaXNlczsgdGhlIHNlYSBzdGF5cyBzZWEsIHNvIHJhbmdlcyBlbmQgaW4gY29hc3RhbCBjbGlmZnMuXG4gICAgICBjb25zdCBsYW5kRmFjdG9yID0gc21vb3Roc3RlcCgtMiwgOCwgZ3JvdW5kKTtcbiAgICAgIGggPSBsZXJwKGdyb3VuZCwgTWF0aC5tYXgoZ3JvdW5kLCBtb3VudGFpbiksIG1hc2sgKiBsYW5kRmFjdG9yKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSBoIDwgMCA/IDAgOiAtSW5maW5pdHk7XG4gICAgbGV0IGNoYW5uZWwgPSBmYWxzZTtcblxuICAgIC8vIE1vdW50YWluIHJpdmVyOiB2YWxsZXkgZmxvb3IsIGJhbmtzIGFuZCBjaGFubmVsIGZvbGxvdyB0aGUgd2F0ZXIgbGV2ZWwuXG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIGNvbnN0IHJhaXNlZCA9IGhpdC5sZXZlbCA+IDAuMjU7XG4gICAgICAgIGNvbnN0IHZ3ID0gNTUgKyAyOCAqIGZibTIoaGl0LnMgLyA5MCwgMS43LCBzZWVkICsgNzA5LCAyKTtcbiAgICAgICAgY29uc3QgZmxvb3IgPSBoaXQubGV2ZWwgKyAxLjUgKyAyLjIgKiBmYm0yKHggLyA0MCwgeiAvIDQwLCBzZWVkICsgNzEwLCAyKSArIGhpdC5kICogMC4wNjtcbiAgICAgICAgY29uc3QgdCA9IHNtb290aHN0ZXAodncgKiAwLjMsIHZ3LCBoaXQuZCk7XG4gICAgICAgIGggPSBNYXRoLm1pbihoLCBsZXJwKGZsb29yLCBoLCB0KSk7XG4gICAgICAgIGNvbnN0IHcgPSBoaXQud2lkdGg7XG4gICAgICAgIGlmIChyYWlzZWQgJiYgaGl0LmQgPCB3ICsgMykge1xuICAgICAgICAgIC8vIEJhbmtzIGhvbGQgYSByYWlzZWQgcml2ZXI6IG5ldmVyIGJlbG93IGl0cyB3YXRlciBzdXJmYWNlLiBBdCBsYWtlXG4gICAgICAgICAgLy8gbGV2ZWwgdGhlIHNlYS1sZXZlbCBmaWxsIGFscmVhZHkgY29udGFpbnMgdGhlIHdhdGVyLlxuICAgICAgICAgIGggPSBNYXRoLm1heChoLCBNYXRoLmNlaWwoaGl0LmxldmVsKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoaXQuZCA8IHcpIHtcbiAgICAgICAgICBjb25zdCBiZWQgPSBoaXQubGV2ZWwgLSAoMS4yICsgMS4zICogKDEgLSBoaXQuZCAvIHcpKTtcbiAgICAgICAgICBoID0gTWF0aC5taW4oaCwgYmVkKTtcbiAgICAgICAgICBpZiAocmFpc2VkKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKGhpdC5sZXZlbCkpO1xuICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCB0YXJuID0gdGhpcy5oeWRyb2xvZ3kudGFybjtcbiAgICAgIGlmICh0YXJuKSB7XG4gICAgICAgIGNvbnN0IHRkID0gTWF0aC5oeXBvdCh4IC0gdGFybi54LCB6IC0gdGFybi56KVxuICAgICAgICAgICogKDEgKyAwLjIgKiAoZmJtMih4IC8gMzAsIHogLyAzMCwgc2VlZCArIDcxMSwgMikgLSAwLjUpKTtcbiAgICAgICAgaWYgKHRkIDwgdGFybi5yICsgNikge1xuICAgICAgICAgIGNvbnN0IHJpbSA9IE1hdGguY2VpbCh0YXJuLmxldmVsKSArIDE7XG4gICAgICAgICAgaWYgKHRkID49IHRhcm4ucikgaCA9IE1hdGgubWF4KGgsIHJpbSk7XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoID0gTWF0aC5taW4oTWF0aC5tYXgoaCwgcmltKSwgdGFybi5sZXZlbCAtIDEgLSAzICogc21vb3Roc3RlcCh0YXJuLnIsIDAsIHRkKSk7XG4gICAgICAgICAgICBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKHRhcm4ubGV2ZWwpKTtcbiAgICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvd2xhbmQgY2hhbm5lbCBjb250aW51aXR5OiB2MSBsZWF2ZXMgYSBkcnkgZm9yZCB3aGVyZSB0aGUgc2hlbGYgbWVldHMgdGhlIHJpdmVyLlxuICAgIGNvbnN0IGxvdyA9IHRoaXMuaHlkcm9sb2d5Lmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8IDIuNSAmJiBoID49IDAgJiYgYmFzZSA8IDQpIGggPSAtMTtcblxuICAgIGggPSBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgVjJfTUFYX0hFSUdIVCkpO1xuICAgIGlmIChoIDwgMCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgMCk7XG4gICAgcmV0dXJuIHsgaCwgbGV2ZWw6IGxldmVsID09PSAtSW5maW5pdHkgPyBoIDogbGV2ZWwsIGNoYW5uZWwgfTtcbiAgfVxuXG4gIGhlaWdodCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1uKHgsIHopLmg7XG4gIH1cblxuICAvKiogdjIgdG9wIG1hdGVyaWFsLiBGYWxscyBiYWNrIHRvIHRoZSB2MSBydWxlcyBmb3IgdGhlIHVuY2hhbmdlZCBjb3JyaWRvci4gKi9cbiAgdG9wTWF0ZXJpYWwoXG4gICAgeDogbnVtYmVyLCB6OiBudW1iZXIsIGNvbDogVjJDb2x1bW4sIHNsb3BlOiBudW1iZXIsXG4gICAgdjFUb3A6IChoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIpID0+IE1hdElkLFxuICApOiBNYXRJZCB7XG4gICAgY29uc3QgaCA9IGNvbC5oO1xuICAgIGlmIChjb2wuY2hhbm5lbCAmJiBjb2wubGV2ZWwgPiBoKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlciAmJiBoID4gMSkge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPCBoaXQud2lkdGggKyAyLjUgJiYgaGl0LmxldmVsID4gMC4yNSkge1xuICAgICAgICByZXR1cm4gZmJtMih4IC8gNiwgeiAvIDYsIHRoaXMuc2VlZCArIDcxMiwgMSkgPiAwLjUgPyBNQVQuR1JBVkVMIDogTUFULlNBTkQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNub3dsaW5lID0gVjJfU05PV0xJTkUgKyAoZmJtMih4IC8gNzAsIHogLyA3MCwgdGhpcy5zZWVkICsgNzEzLCAzKSAtIDAuNSkgKiAxNjtcbiAgICBpZiAoaCA+PSBzbm93bGluZSAmJiBzbG9wZSA8PSAzKSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgLSA2ICYmIHNsb3BlIDw9IDEgJiYgZmJtMih4IC8gMjAsIHogLyAyMCwgdGhpcy5zZWVkICsgNzE0LCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAodGhpcy5yZWxpZWZNYXNrKHgsIHopID4gMC41ICYmIGggPiAzMCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICAgIHJldHVybiB2MVRvcChoLCBzbG9wZSk7XG4gIH1cbn1cbiIsICIvLyBTaW11bGF0aW9uIGxheWVyIFx1MjAxNCBwdXJlIFR5cGVTY3JpcHQsIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAxIHdvcmxkIGZvdW5kYXRpb246IGEgY2h1bmtlZCwgZ2VudWluZWx5IHRocmVlLWRpbWVuc2lvbmFsIHZveGVsIHdvcmxkLlxuLy8gVGhlIHN0b3JlZCBzdGF0ZSBpcyBvbmUgbWF0ZXJpYWwgYnl0ZSBwZXIgY2VsbCAoMCA9IGFpcik7IG9jY3VwYW5jeSBpc1xuLy8gaW1wbGljaXQuIFN1cmZhY2UgaGVpZ2h0IGlzIGEgZGVyaXZlZCBxdWVyeSwgbm90IHRoZSBzdG9yYWdlLiBUaGlzIHJlcGxhY2VzXG4vLyB0aGUgZm9ybWVyIDI1NiB4IDI1NiBoZWlnaHRmaWVsZCAoc2VlIElSLTAwNSkuXG4vL1xuLy8gV29ybGQgbWV0cmVzOiB4L3ogaW4gWy0xMDI0LCAxMDI0KSwgeSBpbiBbLTE2LCAxMTIpLCBzZWEgbGV2ZWwgMC5cbi8vIEEgY2h1bmsgaXMgMzIgeCAzMiB4IDEyOCBjZWxscy4gR2VuZXJhdGlvbiBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQsXG4vLyBnZW5lcmF0b3IgdmVyc2lvbiwgcGFyYW1ldGVycyBhbmQgY2h1bmsgY29vcmRpbmF0ZXM7IGVkaXRzIGFyZSByZWNvcmRlZFxuLy8gc2VwYXJhdGVseSBhbmQgcmUtYXBwbGllZCB3aGVuIGEgY2h1bmsgaXMgcmVnZW5lcmF0ZWQuXG5pbXBvcnQgdHlwZSB7IFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IExpZmVTdGF0ZSB9IGZyb20gJy4vZWNvbm9teSc7XG5pbXBvcnQgdHlwZSB7IEhvbWVzdGVhZFN0YXRlIH0gZnJvbSAnLi9ob21lc3RlYWQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG4vKiogR2VuZXJhdG9yIHYxOiB0aGUgb3JpZ2luYWwgMjA0OCBtIGlzbGFuZC4gRGVmYXVsdCBmb3IgY3JlYXRlV29ybGQgYW5kIGFsbCBsZWdhY3kgc2F2ZXMuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuLyoqIEdlbmVyYXRvciB2MjogdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSB3aXRoIGEgbW91bnRhaW4gcml2ZXIgKHNlZSB0ZXJyYWluLXYyLnRzKS4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVjIgPSAyO1xuLyoqIFRoZSBnZW5lcmF0b3IgbmV3IGJyb3dzZXIgd29ybGRzIHVzZSBieSBkZWZhdWx0LiAqL1xuZXhwb3J0IGNvbnN0IExBVEVTVF9HRU5FUkFUT1JfVkVSU0lPTiA9IEdFTkVSQVRPUl9WMjtcbmV4cG9ydCBjb25zdCBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TOiByZWFkb25seSBudW1iZXJbXSA9IFtHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyXTtcbmV4cG9ydCBjb25zdCBpc1N1cHBvcnRlZEdlbmVyYXRvciA9ICh2OiB1bmtub3duKTogdiBpcyBudW1iZXIgPT5cbiAgdHlwZW9mIHYgPT09ICdudW1iZXInICYmIFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlMuaW5jbHVkZXModik7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgeyBNQVQsIGlzU29saWQsIGlzT3BhcXVlLCBNQVhfTUFUX0lEIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuZXhwb3J0IHR5cGUgeyBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IE1BVCwgaXNTb2xpZCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5cbmV4cG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgZmJtMixcbn0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQge1xuICBjbGFtcCwgbGVycCwgc21vb3Roc3RlcCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIHZhbHVlTm9pc2UzLCBmYm0yLCBmYm0zLFxufSBmcm9tICcuL25vaXNlJztcblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgLyoqIE0wMDYgbGl2aW5nIGhvbWVzdGVhZDsgcHJlc2VudCBvbmNlIGZvdW5kZWQgKHNjaGVtYSAzIG9ubHkpLiAqL1xuICBob21lc3RlYWQ/OiBIb21lc3RlYWRTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGlmICghaXNTdXBwb3J0ZWRHZW5lcmF0b3IoZ2VuZXJhdG9yVmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24gJHtnZW5lcmF0b3JWZXJzaW9ufWApO1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TLCBnZW5lcmF0b3JWZXJzaW9uIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDAsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbi8vIC0tLS0tLS0tLS0gdmVyc2lvbmVkIGdlbmVyYXRvciBkaXNwYXRjaCAtLS0tLS0tLS0tXG5jb25zdCB2MkNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRlcnJhaW5WMj4oKTtcbmNvbnN0IGh5ZHJvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSHlkcm9sb2d5PigpO1xuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kgbmV0d29yayBmb3IgYSBzZWVkIGFuZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyb2xvZ3lGb3Ioc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBIeWRyb2xvZ3kge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuaHlkcm9sb2d5O1xuICBjb25zdCBrZXkgPSBgJHtzZWVkfToke3ZlcnNpb259YDtcbiAgbGV0IGh5ZHJvID0gaHlkcm9DYWNoZS5nZXQoa2V5KTtcbiAgaWYgKCFoeWRybykge1xuICAgIGh5ZHJvID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb24sIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGh5ZHJvQ2FjaGUuc2V0KGtleSwgaHlkcm8pO1xuICB9XG4gIHJldHVybiBoeWRybztcbn1cblxuLyoqIEBpbnRlcm5hbCBUaGUgdjIgZ2VuZXJhdG9yIGZvciBhIHNlZWQgKGNhY2hlZDsgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCkuICovXG5leHBvcnQgZnVuY3Rpb24gdGVycmFpblYyKHNlZWQ6IG51bWJlcik6IFRlcnJhaW5WMiB7XG4gIGxldCBnZW4gPSB2MkNhY2hlLmdldChzZWVkKTtcbiAgaWYgKCFnZW4pIHtcbiAgICBjb25zdCBoeWRyb2xvZ3kgPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbjogR0VORVJBVE9SX1YyLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBnZW4gPSBuZXcgVGVycmFpblYyKHNlZWQsIHN1cmZhY2VIZWlnaHRBdCwgaHlkcm9sb2d5KTtcbiAgICB2MkNhY2hlLnNldChzZWVkLCBnZW4pO1xuICB9XG4gIHJldHVybiBnZW47XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCBoZWlnaHQgKHRvcCBzb2xpZCArIDEpIGZvciBhbnkgc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkuaGVpZ2h0KHgsIHopIDogc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgd2F0ZXIgc3VyZmFjZTogd2F0ZXIgZmlsbHMgY2VsbHMgW2hlaWdodCwgbGV2ZWwpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VXYXRlckxldmVsQXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmNvbHVtbih4LCB6KS5sZXZlbDtcbiAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgOiBoO1xufVxuXG5mdW5jdGlvbiB2ZXJzaW9uZWRTbG9wZShzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogKyAxKSksXG4gICk7XG59XG5cbi8qKiBCYXNlIHRvcCBtYXRlcmlhbCBmb3IgYW55IGdlbmVyYXRvciB2ZXJzaW9uIChtYWNybyBMT0QsIGVudGl0eSBwbGFjZW1lbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbEZvcihcbiAgc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGdlbiA9IHRlcnJhaW5WMihzZWVkKTtcbiAgICByZXR1cm4gZ2VuLnRvcE1hdGVyaWFsKHgsIHosIGdlbi5jb2x1bW4oeCwgeiksIHNsb3BlLFxuICAgICAgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoaCwgc3MsIG5lYXJXYXRlcikpO1xuICB9XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KGN4LCBjeikpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjeCwgY3opO1xuICByZXR1cm4gaW5zdGFsbEJhc2VDaHVuayh3b3JsZCwgYmFzZSwgcGVyZm9ybWFuY2Uubm93KCkgLSB0MCk7XG59XG5cbi8qKlxuICogQmFzZSBnZW5lcmF0ZWQgY29udGVudHMgb2YgYSBjaHVuayBiZWZvcmUgZHVyYWJsZSBlZGl0cy4gQSBwdXJlIGZ1bmN0aW9uIG9mXG4gKiAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24sIGN4LCBjeik6IHNhZmUgdG8gY29tcHV0ZSBpbiBhIFdlYiBXb3JrZXIsIGFuZCB0aGVcbiAqIGJ5dGVzIGFyZSBpZGVudGljYWwgd2hlcmV2ZXIgaXQgcnVucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCYXNlQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBzZWVkOiBudW1iZXI7XG4gIHZlcnNpb246IG51bWJlcjtcbiAgZGF0YTogVWludDhBcnJheTtcbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQmFzZUNodW5rKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNodW5rIHtcbiAgY29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KENIVU5LX1ZPTFVNRSk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3QgdG9wTWF0ZXJpYWxzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCB2MiA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpIDogbnVsbDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBjb25zdCB2MkNvbHM6IFYyQ29sdW1uW10gfCBudWxsID0gdjIgPyBuZXcgQXJyYXkoQ0hVTktfQVJFQSkgOiBudWxsO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBweCAtIFAsIHd6ID0gb3ogKyBweiAtIFA7XG4gICAgICBpZiAodjIpIHtcbiAgICAgICAgY29uc3QgY29sID0gdjIuY29sdW1uKHd4LCB3eik7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBjb2wuaDtcbiAgICAgICAgY29uc3QgbHggPSBweCAtIFAsIGx6ID0gcHogLSBQO1xuICAgICAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHYyQ29scyFbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY29sO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB3eCwgd3opO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB2MkNvbCA9IHYyQ29scyA/IHYyQ29sc1tseiAqIENIVU5LX1NJWkUgKyBseF0gOiBudWxsO1xuICAgICAgY29uc3QgdG9wID0gdjIgJiYgdjJDb2xcbiAgICAgICAgPyB2Mi50b3BNYXRlcmlhbCh3eCwgd3osIHYyQ29sLCBzbG9wZSwgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGhoLCBzcywgbmVhcldhdGVyKSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHRoZSBjb2x1bW4nc1xuICAgICAgLy8gd2F0ZXIgbGV2ZWwgKHNlYSBsZXZlbCBpbiB2MTsgdGhlIGh5ZHJvbG9naWNhbCBsZXZlbCBpbiB2MikuXG4gICAgICBjb25zdCB3YXRlckxldmVsID0gdjJDb2wgPyBNYXRoLm1pbihZX01BWCwgdjJDb2wubGV2ZWwpIDogU0VBX0xFVkVMO1xuICAgICAgaWYgKGggPCB3YXRlckxldmVsKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCB3YXRlckxldmVsOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGN4LCBjeiwgc2VlZCwgdmVyc2lvbiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfTtcbn1cblxuLyoqXG4gKiBJbnN0YWxsIGJhc2UgY29udGVudHMgYXMgYSByZXNpZGVudCBjaHVuazogYXBwbHkgZHVyYWJsZSBlZGl0cywgdXBkYXRlXG4gKiBzdGF0cywgYW5kIHJ1biBkZXRlcm1pbmlzdGljIGVudGl0eSBnZW5lcmF0aW9uLiBNYWluLXRocmVhZCBvbmx5OyB0aGlzIGlzXG4gKiB0aGUgc2luZ2xlIHdyaXRlciBvZiBXb3JsZC4gUmV0dXJucyB0aGUgYWxyZWFkeS1yZXNpZGVudCBjaHVuayBpZiBvbmUgZXhpc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEJhc2VDaHVuayh3b3JsZDogV29ybGQsIGJhc2U6IEJhc2VDaHVuaywgZ2VuZXJhdGlvbk1zID0gMCk6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGJhc2Uuc2VlZCAhPT0gd29ybGQuc2VlZCB8fCBiYXNlLnZlcnNpb24gIT09IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdiYXNlIGNodW5rIGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgd29ybGQgY29uZmlndXJhdGlvbicpO1xuICB9XG4gIGNvbnN0IHsgY3gsIGN6LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9ID0gYmFzZTtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBnZW5lcmF0aW9uTXM7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDb2x1bW5zIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5OyB9XG5cbi8qKiBCYXNlIChwcmUtY2FydmUsIHByZS1lZGl0KSBjb2x1bW4gaGVpZ2h0cy9tYXRlcmlhbHMgdXNlZCBmb3IgZW50aXR5IHBsYWNlbWVudC4gUHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlQmFzZUNvbHVtbnMoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ29sdW1ucyB7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IHZlcnNpb25lZFNsb3BlKHNlZWQsIHZlcnNpb24sIHgsIHosIGgpIDogc2xvcGVBdChzZWVkLCB4LCB6LCBoKTtcbiAgICAgIGNvbnN0IGluZGV4ID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLmhlaWdodHNbaW5kZXhdID0gY2xhbXAoaCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2luZGV4XSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gYmFzZVRvcE1hdGVyaWFsRm9yKHNlZWQsIHZlcnNpb24sIHgsIHosIGgsIHNsb3BlKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29sdW1ucztcbn1cblxuLyoqIFByb3ZpZGUgcHJlY29tcHV0ZWQgYmFzZSBjb2x1bW5zIChmb3IgZXhhbXBsZSBmcm9tIGEgd29ya2VyKSBiZWZvcmUgaW5zdGFsbGluZyBhIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlZWRCYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nLCBjb2x1bW5zOiBCYXNlQ29sdW1ucyk6IHZvaWQge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGlmICghY2FjaGUuaGFzKGtleSkpIGNhY2hlLnNldChrZXksIGNvbHVtbnMpO1xufVxuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogQmFzZUNvbHVtbnMge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0gY29tcHV0ZUJhc2VDb2x1bW5zKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjaHVuay5jeCwgY2h1bmsuY3opO1xuICBjYWNoZS5zZXQoY2h1bmsua2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVyaXZlZCBjaGFuZ2UgdHJhY2tpbmcgKG5vdCBhdXRob3JpdGF0aXZlIHN0YXRlKSAtLS0tLS0tLS0tXG4vLyBSZW5kZXJlcnMgbmVlZCB0byBrbm93IHdoZW4gdGhlIGVkaXQgb3ZlcmxheSBjaGFuZ2VkIHdpdGhvdXQgd2Fsa2luZyBldmVyeVxuLy8gZWRpdCBlYWNoIGZyYW1lLiBUaGUgY291bnRlciBsaXZlcyBvdXRzaWRlIFdvcmxkIHNvIGl0IG5ldmVyIGVudGVycyBhXG4vLyBzbmFwc2hvdCBvciBjYW5vbmljYWwgaGFzaC5cbmNvbnN0IGVkaXRWZXJzaW9ucyA9IG5ldyBXZWFrTWFwPFdvcmxkLCBudW1iZXI+KCk7XG5cbi8qKiBNb25vdG9uaWMgY291bnQgb2YgZWRpdC1vdmVybGF5IGNoYW5nZXMgZm9yIHRoaXMgV29ybGQgb2JqZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRWZXJzaW9uKHdvcmxkOiBXb3JsZCk6IG51bWJlciB7XG4gIHJldHVybiBlZGl0VmVyc2lvbnMuZ2V0KHdvcmxkKSA/PyAwO1xufVxuXG4vKiogQ2FsbCBhZnRlciByZXBsYWNpbmcgb3IgYnVsay1jaGFuZ2luZyBgd29ybGQuZWRpdHNgIG91dHNpZGUgc2V0Vm94ZWwuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya0VkaXRzQ2hhbmdlZCh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZWRpdFZlcnNpb25zLnNldCh3b3JsZCwgZWRpdFZlcnNpb24od29ybGQpICsgMSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gbm9uLWdlbmVyYXRpbmcgcXVlcmllcyAtLS0tLS0tLS0tXG4vLyBNb3ZpbmcgcHJlc2VudGF0aW9uIChjaGFyYWN0ZXJzLCBhbmltYWxzLCBjYW1lcmEpIG11c3QgbmV2ZXIgdHJpZ2dlciBjaHVua1xuLy8gZ2VuZXJhdGlvbiBhcyBhIHNpZGUgZWZmZWN0IG9mIGFza2luZyBhYm91dCB0ZXJyYWluLiBUaGVzZSByZXR1cm4gbnVsbCB3aGVuXG4vLyB0aGUgY29sdW1uJ3MgY2h1bmsgaXMgbm90IHJlc2lkZW50LlxuXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRDaHVua0F0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBudWxsO1xuICByZXR1cm4gd29ybGQuY2h1bmtzLmdldChjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKSkgPz8gbnVsbDtcbn1cblxuLyoqIExpa2Ugc3VyZmFjZUF0LCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuLyoqIExpa2UgZ2V0Vm94ZWwsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRWb3hlbEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHwgbnVsbCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIC8vIENodW5rIGJ5dGVzIGFuZCBjb2x1bW4gY2FjaGVzIGFyZSByZWdlbmVyYXRlZCBvbiBkZW1hbmQuIEVudGl0aWVzIHJlbWFpblxuICAvLyBhdXRob3JpdGF0aXZlOiBldmljdGlvbiBtdXN0IG5vdCBmb3JnZXQgdGhlaXIgcGVyc2lzdGVudCBzdGF0ZS5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcXVlcmllcyAvIGVkaXRzIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG06IE1hdElkKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBZX01BWCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgY29uc3QgcHJldmlvdXNFZGl0ID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rS2V5KGN4LCBjeikpPy5nZXQoaWR4KTtcbiAgLy8gQSBjaHVuayBldmljdGVkIGFmdGVyIGFuIGVhcmxpZXIgZWRpdCBjYW4gcmVnZW5lcmF0ZSB3aXRoIHRoYXQgZHVyYWJsZVxuICAvLyBtYXRlcmlhbCBhbHJlYWR5IGFwcGxpZWQuIERyb3BwaW5nIHRoZSBlZGl0IGhlcmUgd291bGQgbWFrZSBpdCBkaXNhcHBlYXJcbiAgLy8gb24gdGhlIG5leHQgZXZpY3Rpb24vcmVzdG9yYXRpb24sIGV2ZW4gdGhvdWdoIHRoZSBjdXJyZW50IHdyaXRlIG5vLW9wcy5cbiAgaWYgKHByZXZpb3VzRWRpdCA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gZmFsc2U7XG4gIGxldCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChjaHVuay5rZXkpO1xuICBpZiAoIWVkaXRzKSB7IGVkaXRzID0gbmV3IE1hcCgpOyB3b3JsZC5lZGl0cy5zZXQoY2h1bmsua2V5LCBlZGl0cyk7IH1cbiAgLy8gQW4gaWRlbXBvdGVudCB3cml0ZSBtdXN0IHN0aWxsIHJlc3RvcmUgYSBkdXJhYmxlIGRlbHRhIGRpc2NhcmRlZCBieSBhblxuICAvLyBvbGRlciBzbmFwc2hvdCBvciBkZWx0YSBkZWNvZGVyLiBJdCBpcyBub3QgYSBuZXcgYXV0aG9yaXRhdGl2ZSByZXZpc2lvbi5cbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkge1xuICAgIGlmICghZWRpdHMuaGFzKGlkeCkpIGVkaXRzLnNldChpZHgsIG0pO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiA8IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICAgIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIC0gaCA6IDA7XG4gIH1cbiAgcmV0dXJuIHdhdGVyU3VyZmFjZUF0KHdvcmxkLCB4LCB6KSAtIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKlxuICogVG9wIG9mIHRoZSB3YXRlciBjb2x1bW4gc3RhbmRpbmcgb24gdGhlIHNvbGlkIHN1cmZhY2UgKGVxdWFsIHRvIHRoZSBzdXJmYWNlXG4gKiB3aGVuIGRyeSkuIFJlYWRzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVscywgc28gZWRpdHMgYW5kIGR1ZyBwaXRzIGFyZSBleGFjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyU3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIHdoaWxlICh5IDwgWV9NQVggJiYgZ2V0Vm94ZWwod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZW50aXRpZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gYWRkRW50aXR5KHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5oYXMoZS5pZCkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIHJldHVybjtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGUpO1xuICBsZXQgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgbGlzdCk7IH1cbiAgbGlzdC5wdXNoKGUuaWQpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIC8vIEdlbmVyYXRpb24gaXMgZGV0ZXJtaW5pc3RpYyBhbmQgYWR2YW5jZXMgbm8gcGxheWVyLWNvbW1hbmQgcHJlY29uZGl0aW9uLlxuICAvLyBBdXRob3JlZCBzY2FmZm9sZGluZyBtYXkgdHJhbnNpZW50bHkgY2hhbmdlIGl0OyB0aGUgc25hcHNob3QgcmVzdG9yZXMgdGhlXG4gIC8vIHNhdmVkIHJldmlzaW9uIGFmdGVyIHBsYWNpbmcgdGhhdCBzY2FmZm9sZGluZy5cbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUlkKGNodW5rOiBzdHJpbmcsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBgZToke2NodW5rfToke2l9YDtcbn1cblxuZnVuY3Rpb24gZm9yZXN0U2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgZWFzdCA9IE1hdGguZXhwKC0oKCh3eCAtIDIyMCkgLyAyNjApICoqIDIgKyAoKHd6ICsgMTEwKSAvIDIyMCkgKiogMikpO1xuICBjb25zdCBub3J0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDIwKSAvIDMwMCkgKiogMiArICgod3ogKyAzMDApIC8gMTkwKSAqKiAyKSk7XG4gIGNvbnN0IHdlc3QgPSBNYXRoLmV4cCgtKCgod3ggKyAzNDApIC8gMjAwKSAqKiAyICsgKCh3eiAtIDEyMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3Qgc291dGggPSBNYXRoLmV4cCgtKCgod3ggLSAxMjApIC8gMjQwKSAqKiAyICsgKCh3eiAtIDMzMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3QgbW9pc3R1cmUgPSBmYm0yKHd4IC8gMjYwLCB3eiAvIDI2MCwgc2VlZCArIDIwMSwgNCk7XG4gIGNvbnN0IHZhbGxleSA9IE1hdGguZXhwKC0oKHd4IC8gMTQwKSAqKiAyICsgKHd6IC8gMTA1KSAqKiAyKSk7XG4gIHJldHVybiBNYXRoLm1heChlYXN0LCBub3J0aCAqIDAuOTIsIHdlc3QgKiAwLjgwLCBzb3V0aCAqIDAuNzgpICogMC44MlxuICAgICsgbW9pc3R1cmUgKiAwLjM4IC0gMC4yMiAtIHZhbGxleSAqIDAuMzQ7XG59XG5cbmZ1bmN0aW9uIHJvY2tTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBtb3VudGFpbiA9IGZibTIod3ggLyAzMzAsIHd6IC8gMzMwLCBzZWVkICsgMjAyLCAzKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAxNDAsIHd6IC8gMTQwLCBzZWVkICsgMjAzLCAzKSAtIDEpO1xuICByZXR1cm4gbW91bnRhaW4gKiAwLjU1ICsgcmlkZ2UgKiAwLjQ1O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB2b2lkIHtcbiAgZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZCwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBSZXBsYXlzIGRldGVybWluaXN0aWMgZ2VuZXJhdGlvbiBmb3Igc25hcHNob3QgZW50aXR5IGRlbHRhcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhrZXkpKSByZXR1cm47XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybjtcblxuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY2h1bmsuY3gsIGNodW5rLmN6LCB3b3JsZC5zZWVkICsgOTAwKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGNvbHVtbnMgPSBiYXNlQ29sdW1ucyh3b3JsZCwgY2h1bmspO1xuICBsZXQgbiA9IDA7XG4gIGxldCBuYXR1cmFsVHJlZXMgPSAwO1xuICBsZXQgbmF0dXJhbFBpbmtUcmVlcyA9IDA7XG5cbiAgY29uc3QgbG9jYWxTdXJmYWNlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdICsgWV9NSU47XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSBhcyBNYXRJZDtcbiAgfTtcbiAgY29uc3QgbG9jYWxTbG9wZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggKyAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogKyAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICApO1xuICB9O1xuXG4gIC8vIEEgaml0dGVyZWQgOCBtIGxhdHRpY2UgZ2l2ZXMgY29oZXJlbnQgbWFzc2VzIGFuZCBhdm9pZHMgcGVyLWZyYW1lIHNjYXR0ZXIuXG4gIGZvciAobGV0IGd6ID0gMDsgZ3ogPCBDSFVOS19TSVpFOyBneiArPSA4KSB7XG4gICAgZm9yIChsZXQgZ3ggPSAwOyBneCA8IENIVU5LX1NJWkU7IGd4ICs9IDgpIHtcbiAgICAgIGNvbnN0IGx4ID0gY2xhbXAoTWF0aC5mbG9vcihneCArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IGx6ID0gY2xhbXAoTWF0aC5mbG9vcihneiArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgICAgaWYgKGggPD0gU0VBX0xFVkVMICsgMSkgY29udGludWU7XG4gICAgICBjb25zdCBzbG9wZSA9IGxvY2FsU2xvcGUobHgsIGx6KTtcbiAgICAgIGNvbnN0IHRvcCA9IGxvY2FsVG9wKGx4LCBseik7XG4gICAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9yZXN0ID0gZm9yZXN0U2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvY2t5ID0gcm9ja1Njb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2xsID0gcm5kKCk7XG5cbiAgICAgIGNvbnN0IHRyZWVDaGFuY2UgPSBmb3Jlc3QgPiAwLjUwID8gMC43MiA6IGZvcmVzdCA+IDAuMzAgPyAwLjI1IDogMC4wNTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAyICYmIHJvbGwgPCB0cmVlQ2hhbmNlKSB7XG4gICAgICAgIC8vIFRoZSBjYXAgaXMgYSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZ2VuZXJhdGlvbiBwcm9wZXJ0eS4gSXQgY2Fubm90XG4gICAgICAgIC8vIGRlcGVuZCBvbiB3aGljaCBjaHVua3MgYSByZW5kZXJlciBsb2FkZWQgYmVmb3JlIHRoaXMgb25lLlxuICAgICAgICBsZXQga2luZDogRW50aXR5S2luZDtcbiAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgY29uc3Qgc3BlY2llc1JvbGwgPSBybmQoKTtcbiAgICAgICAgaWYgKHNwZWNpZXNSb2xsIDwgMC4xMikge1xuICAgICAgICAgIGlmICgobmF0dXJhbFBpbmtUcmVlcyArIDEpID4gMC4yNSAqIChuYXR1cmFsVHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIG5hdHVyYWxQaW5rVHJlZXMrKztcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIG5hdHVyYWxUcmVlcysrO1xuICAgICAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44OCArIHJuZCgpICogMC4yNCwgdmFyaWFudCxcbiAgICAgICAgICByZXNvdXJjZTogJ3dvb2QnLCByZW1haW5pbmc6IDEyLCB5aWVsZFBlckhhcnZlc3Q6IDQsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHJvY2t5ID4gMC40NiAmJiByb2xsIDwgMC4zOCkge1xuICAgICAgICAvLyBDb25zdW1lIHRoZSByZXRpcmVkIHN0b25lIGZvcm0ncyByYW5kb20gZHJhd3MgYW5kIGFsbG9jYXRlIGl0cyBvbGRcbiAgICAgICAgLy8gc2VxdWVuY2UgSUQsIGJ1dCBkbyBub3QgaW5zZXJ0IGFuIGVudGl0eS4gTGF0ZXIgbmF0dXJhbCBwbGFjZW1lbnRzXG4gICAgICAgIC8vIHRoZXJlZm9yZSByZW1haW4gYnl0ZS1mb3ItYnl0ZSBjb21wYXRpYmxlIHdpdGggcmVjb3JkZWQgc2F2ZXMuXG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IGlkID0gZW50aXR5SWQoY2h1bmsua2V5LCBuKyspO1xuICAgICAgICBjb25zdCByZWNvcmQgPSB7XG4gICAgICAgICAgaWQsIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByZXNvdXJjZTogJ3N0b25lJyBhcyBjb25zdCxcbiAgICAgICAgICByZW1haW5pbmc6IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMixcbiAgICAgICAgICB5aWVsZFBlckhhcnZlc3Q6IDMsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgIH07XG4gICAgICAgIC8vIE9ubHkgZW50aXRpZXMgdGhhdCBleGlzdGVkIGluIGFuIGFjY2VwdGVkIG9sZCBzYXZlIGdldCB0b21ic3RvbmVzLFxuICAgICAgICAvLyBkdXJpbmcgZXhwbGljaXQgbWlncmF0aW9uLiBPcmRpbmFyeSBnZW5lcmF0aW9uIG11c3QgcmVzdG9yZSBleGFjdGx5LlxuICAgICAgICBpZiAoaXNTdG9uZVJlcGxheSh3b3JsZCkpIGFkZEVudGl0eSh3b3JsZCwgcmVjb3JkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuU1RPTkUgJiYgcm9ja3kgPiAwLjU4ICYmIHJvbGwgPCAwLjE4KSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfb3JlJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDIpLFxuICAgICAgICAgIHJlc291cmNlOiAnb3JlJywgcmVtYWluaW5nOiA4LCB5aWVsZFBlckhhcnZlc3Q6IDIsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDEgJiYgcm9sbCA8IDAuMzApIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9zaHJ1YicsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44ICsgcm5kKCkgKiAwLjQsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgICByZXNvdXJjZTogJ2ZpYmVyJywgcmVtYWluaW5nOiA0LCB5aWVsZFBlckhhcnZlc3Q6IDEsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkOiBXb3JsZCwga2luZDogRW50aXR5S2luZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgcm90OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsLCByZW1haW5pbmc6IG51bWJlciwgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmICh5IDw9IFNFQV9MRVZFTCkgcmV0dXJuO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgLy8gQSBoZXJvIGFzc2V0IG93bnMgaXRzIHNwb3Q6IGNsZWFyIGFueSBnZW5lcmF0ZWQgZW50aXR5IHRoYXQgd291bGQgb3ZlcmxhcFxuICAvLyBpdCwgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcgdGhlIGF1dGhvcmVkIGNvbXBvc2l0aW9uLlxuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW107XG4gIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSByZXR1cm47XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgTWF0aC5oeXBvdChlLnggLSB4LCBlLnogLSB6KSA8IDIuNikge1xuICAgICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICAgIH1cbiAgfVxuICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpKTtcbiAgLy8gQXV0aG9yZWQgY29tcG9zaXRpb24gaXMgZHVyYWJsZSBzdGF0ZTogaXQgY2FuIGNsZWFyIG92ZXJsYXBwaW5nIG5hdHVyYWxcbiAgLy8gZW50aXRpZXMsIHNvIHNhdmUgdGhlIGNvbXBsZXRlIGFmZmVjdGVkIGNodW5rIHJhdGhlciB0aGFuIG9ubHkgaXRzIGhlcm9lcy5cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcblxuICBjb25zdCBpZCA9IGBoZXJvOiR7a2luZH06JHtNYXRoLnJvdW5kKHgpfToke01hdGgucm91bmQoeil9YDtcbiAgY29uc3QgYmVmb3JlID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgY29uc3QgZW50aXR5OiBFbnRpdHkgPSB7XG4gICAgaWQsIGtpbmQsIGNodW5rOiBrZXksIHg6IHggKyAwLjUsIHksIHo6IHogKyAwLjUsXG4gICAgcm90LCBzY2FsZSwgdmFyaWFudCwgcmVzb3VyY2UsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogdHJ1ZSxcbiAgfTtcbiAgYWRkRW50aXR5KHdvcmxkLCBlbnRpdHkpO1xuICBpZiAod29ybGQuZW50aXRpZXMuc2l6ZSA+IGJlZm9yZSAmJiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB7XG4gICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSByZXR1cm47XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcblxuICBjb25zdCBzaXRlczogQXJyYXk8eyBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7IHg6IG51bWJlcjsgejogbnVtYmVyOyByb3Q6IG51bWJlciB9PiA9IFtcbiAgICB7IGtpbmQ6ICd3YXlzdG9uZScsIHg6IC0xMCwgejogLTE0LCByb3Q6IDAgfSxcbiAgICB7IGtpbmQ6ICdtYXJrZXInLCB4OiAtMzIsIHo6IC04LCByb3Q6IE1hdGguUEkgLyAyIH0sXG4gIF07XG4gIGZvciAoY29uc3QgcyBvZiBzaXRlcykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoeSA8PSBTRUFfTEVWRUwpIGNvbnRpbnVlO1xuICAgIHdvcmxkLnNpdGVzLnB1c2goe1xuICAgICAgaWQ6IGBzaXRlOiR7cy5raW5kfWAsXG4gICAgICBraW5kOiBzLmtpbmQsXG4gICAgICB4OiBzLnggKyAwLjUsIHksIHo6IHMueiArIDAuNSxcbiAgICAgIHJvdDogcy5yb3QsXG4gICAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgaGVybyBncm92ZSBjb21wb3NlZCBpbiB0aGUgZGVmYXVsdCBjYW1lcmEncyB2aWV3IGRpcmVjdGlvbi4gVGhlc2UgYXJlXG4gIC8vIFN0eWwgbmF0dXJhbCBhc3NldHMgKEFTLTAwMSB2MiksIG5vdCBOb3hlbCBhcmNoaXRlY3R1cmU7IHRoZSBOb3hlbFxuICAvLyB3YXlzdG9uZS9tYXJrZXIgYWJvdmUgcmVtYWluIHRoZSBodW1hbi1tYWRlIGxhbmRtYXJrcy5cbiAgY29uc3QgZ3JvdmU6IEFycmF5PFtFbnRpdHlLaW5kLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+ID0gW1xuICAgIFsnc3R5bF90cmVlX3NwaXJlJywgLTIyLCAtMjYsIDAsIDEuMDAsIDBdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTM0LCAtMTgsIDEsIDAuOTUsIE1hdGguUEkgLyAxMl0sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xNiwgLTM0LCAyLCAxLjAwLCBNYXRoLlBJIC8gNl0sXG4gICAgWydzdHlsX3RyZWVfYmxvc3NvbScsIC0yOCwgLTM4LCAwLCAwLjkwLCBNYXRoLlBJIC8gNF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtNDAsIC0zMCwgMiwgMS4wNSwgTWF0aC5QSSAvIDNdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTIsIC0yNCwgMCwgMC45MCwgTWF0aC5QSSAvIDIuNF0sXG4gIF07XG4gIGZvciAoY29uc3QgW2tpbmQsIHgsIHosIHZhcmlhbnQsIHNjYWxlLCByb3RdIG9mIGdyb3ZlKSB7XG4gICAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsIGtpbmQsIHgsIHosIHZhcmlhbnQsIHJvdCwgc2NhbGUsICd3b29kJywgMTIsIDQpO1xuICB9XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9yb2NrX21lZGl1bScsIC02LCAtMTAsIDAsIDAsIDEuMCwgJ3N0b25lJywgOCwgMyk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9zaHJ1YicsIC0xNCwgLTgsIDEsIE1hdGguUEkgLyAxMiwgMS4xLCAnZmliZXInLCA0LCAxKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX2NhaXJuJywgLTIwLCAtNiwgMCwgMCwgMS4wLCAnc3RvbmUnLCA2LCAyKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX29yZScsIC0zOCwgLTQyLCAwLCBNYXRoLlBJIC8gNCwgMS4xLCAnb3JlJywgOCwgMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZWFyZXN0SGFydmVzdGFibGUoXG4gIHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCByZXNvdXJjZT86IFJlc291cmNlVHlwZSxcbik6IEVudGl0eSB8IG51bGwge1xuICBsZXQgYmVzdDogRW50aXR5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0RCA9IHJhZGl1cyAqIHJhZGl1cztcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICAgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgY29udGludWU7XG4gICAgaWYgKHJlc291cmNlICYmIGUucmVzb3VyY2UgIT09IHJlc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBkID0gKGUueCAtIHgpICoqIDIgKyAoZS56IC0geikgKiogMjtcbiAgICBpZiAoZCA8IGJlc3REKSB7IGJlc3REID0gZDsgYmVzdCA9IGU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0UmVzdWx0IHsgZW50aXR5OiBFbnRpdHk7IHJlc291cmNlOiBSZXNvdXJjZVR5cGU7IGFtb3VudDogbnVtYmVyOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0RW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEhhcnZlc3RSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QgZSA9IGxpdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpO1xuICBpZiAod29ybGQubGlmZSAmJiBPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIG4pID0+IHN1bSArIG4sIDApICsgYW1vdW50ID4gMTIwKSByZXR1cm4gbnVsbDtcbiAgZS5yZW1haW5pbmcgLT0gYW1vdW50O1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBlLmhhcnZlc3RlZE9uY2UgPSB0cnVlO1xuICBpZiAoZS5yZW1haW5pbmcgPD0gMCkgZS5oYXJ2ZXN0ZWQgPSB0cnVlO1xuICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBlbnRpdHk6IGUsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuLyoqIFJlbW92ZSBldmVyeSByZXRpcmVkIHNvdXJjZSBhZnRlciB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheS4gVGhpcyBtaWdyYXRpb25cbiAqIGNyZWF0ZXMgZGV0ZXJtaW5pc3RpYyB0b21ic3RvbmVzIGJ1dCBpcyBub3QgYSBwbGF5ZXIgY29tbWFuZCBvciByZXZpc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXRpcmVTdG9uZUVudGl0aWVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IGUgb2YgWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXSkge1xuICAgIGlmICghaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpIGNvbnRpbnVlO1xuICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShlLmlkKTtcbiAgICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChlLmlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgICBpZiAoIXdvcmxkLmVudGl0eUNodW5rcy5oYXMoZS5jaHVuaykpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIGZvciAoY29uc3QgW2tleSwgaWRzXSBvZiB3b3JsZC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBhY3RpdmUgPSBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSk7XG4gICAgaWYgKGFjdGl2ZS5sZW5ndGggPiAwIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGtleSkpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBhY3RpdmUpO1xuICAgIGVsc2Ugd29ybGQuZW50aXR5Q2h1bmtzLmRlbGV0ZShrZXkpO1xuICB9XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwZXJzaXN0ZW5jZSAvIGF1dGhvcml0eSBib3VuZGFyeSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWFuaWZlc3Qge1xuICBzY2hlbWE6IDE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgcGFyYW1zSGFzaDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBmbnYxYSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaCA9IDB4ODExYzlkYzU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGggXj0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGggPSBNYXRoLmltdWwoaCwgMHgwMTAwMDE5Myk7XG4gIH1cbiAgcmV0dXJuIChoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkTWFuaWZlc3Qod29ybGQ6IFdvcmxkKTogV29ybGRNYW5pZmVzdCB7XG4gIGNvbnN0IHAgPSB3b3JsZC5wYXJhbXM7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIHNlZWQ6IHdvcmxkLnNlZWQsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogcC5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIHNpemU6IHAuc2l6ZSxcbiAgICBjaHVua1NpemU6IHAuY2h1bmtTaXplLFxuICAgIHlNaW46IHAueU1pbixcbiAgICB5TWF4OiBwLnlNYXgsXG4gICAgc2VhTGV2ZWw6IHAuc2VhTGV2ZWwsXG4gICAgcGFyYW1zSGFzaDogZm52MWEoSlNPTi5zdHJpbmdpZnkocCkpLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsRWRpdCB7IGk6IG51bWJlcjsgbTogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBzY2hlbWE6IDE7XG4gIGtleTogc3RyaW5nO1xuICBiYXNlVmVyc2lvbjogbnVtYmVyO1xuICBlZGl0czogVm94ZWxFZGl0W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBDaHVua0RlbHRhIHtcbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAga2V5LFxuICAgIGJhc2VWZXJzaW9uOiB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBlZGl0czogZWRpdHMgPyBbLi4uZWRpdHMuZW50cmllcygpXS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSkuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKSA6IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwgZGVsdGE6IENodW5rRGVsdGEpOiB2b2lkIHtcbiAgY29uc3QgW2N4LCBjel0gPSBkZWx0YS5rZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgZm9yIChjb25zdCBlIG9mIGRlbHRhLmVkaXRzKSB7XG4gICAgY29uc3QgeUluZGV4ID0gTWF0aC5mbG9vcihlLmkgLyBDSFVOS19BUkVBKTtcbiAgICBjb25zdCByZW0gPSBlLmkgJSBDSFVOS19BUkVBO1xuICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcihyZW0gLyBDSFVOS19TSVpFKTtcbiAgICBjb25zdCBseCA9IHJlbSAlIENIVU5LX1NJWkU7XG4gICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseDtcbiAgICBjb25zdCB5ID0gWV9NSU4gKyB5SW5kZXg7XG4gICAgY29uc3QgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICBzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgZS5tIGFzIE1hdElkKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIHRpbWUgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBUaW1lU3RhdGUgeyB0OiBudW1iZXI7IGRheUxlbmd0aFNlYzogbnVtYmVyOyBwYXVzZWQ6IGJvb2xlYW47IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaW1lKHM6IFRpbWVTdGF0ZSwgZHQ6IG51bWJlcik6IHZvaWQge1xuICBpZiAocy5wYXVzZWQpIHJldHVybjtcbiAgcy50ID0gKHMudCArIGR0IC8gcy5kYXlMZW5ndGhTZWMpICUgMTtcbn1cbiIsICIvLyBSZW5kZXIgbGF5ZXIgXHUyMDE0IGNodW5rZWQgM0Qgdm94ZWwgbWVzaGVyICsgc3RyZWFtaW5nICsgbWFjcm8gTE9ELlxuLy9cbi8vIFRoZSB2aXNpYmxlIHN1cmZhY2UgaXMgZGVyaXZlZCBmcm9tIHRoZSBzaW0ncyBvY2N1cGFuY3kvbWF0ZXJpYWwgdm9sdW1lLlxuLy8gTmVhciBjaHVua3MgYXJlIG1lc2hlZCBhdCAxIG0gd2l0aCBncmVlZHkgZmFjZSBtZXJnaW5nOyB0aGUgZmFyIGxhbmRzY2FwZSBpc1xuLy8gYW4gOCBtICh3b3JsZCkgLyA4IG0gKG1hcCkgbWFjcm8gTE9EIHNhbXBsZWQgZnJvbSB0aGUgc2FtZSBkZXRlcm1pbmlzdGljXG4vLyBnZW5lcmF0b3IuIFdhdGVyIGlzIGEgc2luZ2xlIHNlYS1sZXZlbCBzdXJmYWNlIGRlcml2ZWQgZnJvbSB0aGUgc2VhYmVkIGRlcHRoLlxuLy9cbi8vIE5vIGFwcm9uLCBob3Jpem9uIHJpbmcgb3IgZm91bmRhdGlvbiBza2lydDogdGhlIHdvcmxkIGVkZ2UgaXMgb2NlYW4sIGFuZCB0aGVcbi8vIG9jZWFuIHN1cmZhY2UgZXh0ZW5kcyBmYXIgYmV5b25kIHRoZSAyMDQ4IG0gcGxheWFibGUgaXNsYW5kLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuaW1wb3J0IHsgbWVzaENodW5rV2F0ZXIsIGluc3RhbGxGYXJXYXRlckhvbGUsIHdhdGVyVGltZSB9IGZyb20gJy4vd2F0ZXInO1xuaW1wb3J0IHsgTWVzaEFycmF5cywgYnVpbGRQYWRkZWQsIG1lc2hQYWRkZWQgfSBmcm9tICcuL21lc2hlcic7XG5pbXBvcnQgdHlwZSB7IENodW5rV29ya2VyUG9vbCB9IGZyb20gJy4vY2h1bmstcG9vbCc7XG5pbXBvcnQge1xuICBXb3JsZCwgVm94ZWxDaHVuaywgTWF0SWQsIFN1cmZhY2VTYW1wbGUsIEdFTkVSQVRPUl9WRVJTSU9OLFxuICBXT1JMRF9TSVpFLCBIQUxGLCBDSFVOS19TSVpFLCBDSFVOS1NfUEVSX1NJREUsIENIVU5LX0FSRUEsIFdPUkxEX0hFSUdIVCxcbiAgWV9NSU4sIFlfTUFYLCBTRUFfTEVWRUwsIE1BVCwgaXNPcGFxdWUsXG4gIGNodW5rS2V5LCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWiwgbG9jYWxJbmRleCwgeVRvSW5kZXgsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIHdvcmxkVG9Mb2NhbFgsIHdvcmxkVG9Mb2NhbFosXG4gIGdldFZveGVsLCBlbnN1cmVDaHVuaywgZXZpY3RDaHVuaywgaGFzaDJpLCBmYm0yLFxuICBlZGl0VmVyc2lvbiwgYmFzZUhlaWdodEF0LCBiYXNlVG9wTWF0ZXJpYWxGb3IsIGluc3RhbGxCYXNlQ2h1bmssIHNlZWRCYXNlQ29sdW1ucyxcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcblxuaW1wb3J0IHtcbiAgTSwgSCwgY29sb3JDYWNoZSwgYywgQ09MLCBTSEFERSwgTUFYX1BFUkZfU0FNUExFUywgcmVjb3JkU2FtcGxlLCBwZXJjZW50aWxlLCBoZWlnaHRCYW5kLCBzdG9uZVRvbmUsIHNoYWRlQXQsIGtleUZvciwgZmFjZUNvbG9yQ2FjaGUsIGNvbG9yRm9yS2V5LFxufSBmcm9tICcuL3ZveGVsLWNvbG9ycyc7XG5cbmNvbnN0IHRlcnJhaW5NYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgdmVydGV4Q29sb3JzOiB0cnVlLFxuICBzaWRlOiBUSFJFRS5Gcm9udFNpZGUsXG59KTtcbnRlcnJhaW5NYXRlcmlhbC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gIHNoYWRlci52ZXJ0ZXhTaGFkZXIgPSBzaGFkZXIudmVydGV4U2hhZGVyXG4gICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxuYXR0cmlidXRlIGZsb2F0IGFNYXQ7XFxudmFyeWluZyB2ZWMzIHZXUG9zO1xcbnZhcnlpbmcgdmVjMyB2V05ybTtcXG52YXJ5aW5nIGZsb2F0IHZNYXQ7JylcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD4nLCAnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cXG52V1BvcyA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh5ejtcXG52V05ybSA9IG5vcm1hbGl6ZShtYXQzKG1vZGVsTWF0cml4KSAqIG9iamVjdE5vcm1hbCk7XFxudk1hdCA9IGFNYXQ7Jyk7XG4gIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxudmFyeWluZyB2ZWMzIHZXUG9zO1xudmFyeWluZyB2ZWMzIHZXTnJtO1xudmFyeWluZyBmbG9hdCB2TWF0O1xuZmxvYXQgaDIxKHZlYzIgcCkgeyByZXR1cm4gZnJhY3Qoc2luKGRvdChwLCB2ZWMyKDEyNy4xLCAzMTEuNykpKSAqIDQzNzU4LjU0NTMxMjMpOyB9XG5mbG9hdCB2bjIodmVjMiBwKSB7XG4gIHZlYzIgaSA9IGZsb29yKHApOyB2ZWMyIGYgPSBmcmFjdChwKTsgZiA9IGYgKiBmICogKDMuMCAtIDIuMCAqIGYpO1xuICByZXR1cm4gbWl4KG1peChoMjEoaSksIGgyMShpICsgdmVjMigxLjAsIDAuMCkpLCBmLngpLFxuICAgICAgICAgICAgIG1peChoMjEoaSArIHZlYzIoMC4wLCAxLjApKSwgaDIxKGkgKyB2ZWMyKDEuMCwgMS4wKSksIGYueCksIGYueSk7XG59YClcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbG9yX2ZyYWdtZW50PicsIGAjaW5jbHVkZSA8Y29sb3JfZnJhZ21lbnQ+XG57XG4gIHZlYzMgbiA9IG5vcm1hbGl6ZSh2V05ybSk7XG4gIGZsb2F0IHZlcnQgPSAxLjAgLSBzbW9vdGhzdGVwKDAuMzUsIDAuNzAsIGFicyhuLnkpKTtcbiAgZmxvYXQgaXNHcmFzcyA9ICgodk1hdCA+IDAuNSAmJiB2TWF0IDwgMS41KSB8fCAodk1hdCA+IDguNSAmJiB2TWF0IDwgOS41KSkgPyAxLjAgOiAwLjA7XG4gIGZsb2F0IGlzU3RvbmUgPSAoKHZNYXQgPiA0LjUgJiYgdk1hdCA8IDYuNSkgfHwgKHZNYXQgPiA3LjUgJiYgdk1hdCA8IDguNSkpID8gMS4wIDogMC4wO1xuXG4gIGZsb2F0IGhvcml6ID0gYWJzKG4ueCkgPiBhYnMobi56KSA/IHZXUG9zLnogOiB2V1Bvcy54O1xuICBmbG9hdCByb3cgPSBmbG9vcih2V1Bvcy55KTtcbiAgZmxvYXQgY29sID0gZmxvb3IoaG9yaXopO1xuICBmbG9hdCBoID0gaDIxKHZlYzIoY29sLCByb3cpKTtcbiAgdmVjMiBmID0gdmVjMihmcmFjdChob3JpeiksIGZyYWN0KHZXUG9zLnkpKTtcbiAgZmxvYXQgam9pbnQgPSBzbW9vdGhzdGVwKDAuMCwgMC4wNTUsIG1pbihmLngsIDEuMCAtIGYueCkpXG4gICAgICAgICAgICAgICogc21vb3Roc3RlcCgwLjAsIDAuMDUwLCBtaW4oZi55LCAxLjAgLSBmLnkpKTtcbiAgdmVjMyBzdG9uZSA9IG1peCh2ZWMzKDAuNjIsIDAuNjIsIDAuNTgpLCB2ZWMzKDEuMDQsIDEuMDIsIDAuOTUpLCBoKTtcbiAgc3RvbmUgKj0gbWl4KDAuOTAsIDEuMCwgam9pbnQpO1xuICBzdG9uZSAqPSBtaXgoMC45MywgMS4wLCBzbW9vdGhzdGVwKDAuMCwgMC4zMCwgZi55KSk7XG4gIGRpZmZ1c2VDb2xvci5yZ2IgKj0gbWl4KHZlYzMoMS4wKSwgc3RvbmUsIHZlcnQgKiBpc1N0b25lKTtcblxuICBmbG9hdCBneSA9IHNtb290aHN0ZXAoMC40NSwgMC44OCwgYWJzKG4ueSkpO1xuICBmbG9hdCBnMSA9IHZuMih2V1Bvcy54eiAqIDEuMzUpO1xuICBmbG9hdCBnMiA9IHZuMih2V1Bvcy54eiAqIDAuMTEpO1xuICB2ZWMzIGdyYXNzID0gbWl4KHZlYzMoMC44MiwgMC44NiwgMC43MiksIHZlYzMoMS4wNiwgMS4wNCwgMC45OCksIGcxICogMC40MiArIGcyICogMC40NiArIHZuMih2V1Bvcy54eiAqIDQuMykgKiAwLjEyKTtcbiAgZmxvYXQgY2VsbCA9IGgyMShmbG9vcih2V1Bvcy54eikgKyAxNy4wKTtcbiAgZ3Jhc3MgKj0gMC45NSArIDAuMTAgKiBjZWxsO1xuICBkaWZmdXNlQ29sb3IucmdiICo9IG1peCh2ZWMzKDEuMCksIGdyYXNzLCBneSAqIGlzR3Jhc3MpO1xufWApO1xufTtcblxuaW50ZXJmYWNlIE1lc2hSZXN1bHQgeyBnZW9tZXRyeTogVEhSRUUuQnVmZmVyR2VvbWV0cnk7IHRyaWFuZ2xlczogbnVtYmVyOyB9XG5cbi8qKiBCdWlsZCBhIEJ1ZmZlckdlb21ldHJ5IGZyb20gbWVzaGVyIG91dHB1dCAobWFpbiB0aHJlYWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlb21ldHJ5RnJvbUFycmF5cyhhOiBNZXNoQXJyYXlzKTogTWVzaFJlc3VsdCB7XG4gIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEucG9zaXRpb25zLCAzKSk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLm5vcm1hbHMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYS5jb2xvcnMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdhTWF0JywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLm1hdHMsIDEpKTtcbiAgZ2VvbWV0cnkuc2V0SW5kZXgobmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLmluZGljZXMsIDEpKTtcbiAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIHJldHVybiB7IGdlb21ldHJ5LCB0cmlhbmdsZXM6IGEudHJpYW5nbGVzIH07XG59XG5cbi8qKiBQYWRkZWQgdm9sdW1lIGZvciBhIHJlc2lkZW50IGNodW5rOyBuZWlnaGJvdXJzIGNvbWUgZnJvbSB0aGUgd29ybGQgKDN4MyBtdXN0IGJlIHJlc2lkZW50KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYWRkZWRGb3Iod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgcmV0dXJuIGJ1aWxkUGFkZGVkKGNodW5rLmRhdGEsICh4LCB5LCB6KSA9PiBnZXRWb3hlbCh3b3JsZCwgb3ggKyB4LCBZX01JTiArIHksIG96ICsgeikpO1xufVxuXG4vKipcbiAqIEdyZWVkeSAzRCBmYWNlIG1lc2hlciAoc3luY2hyb25vdXMgcGF0aCkuIEEgZmFjZSBpcyBlbWl0dGVkIHdoZW4gYW4gb3BhcXVlXG4gKiB2b3hlbCB0b3VjaGVzIGEgbm9uLW9wYXF1ZSBjZWxsIChhaXIgb3Igd2F0ZXIpOyB3YXRlciBzdXJmYWNlcyBhcmUgbWVzaGVkXG4gKiBzZXBhcmF0ZWx5IGluIHdhdGVyLnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWVzaENodW5rKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBNZXNoUmVzdWx0IHtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIHJldHVybiBnZW9tZXRyeUZyb21BcnJheXMobWVzaFBhZGRlZChwYWRkZWRGb3Iod29ybGQsIGNodW5rKSwgY2h1bmsuaGVpZ2h0cywgb3gsIG96LCB3b3JsZC5zZWVkKSk7XG59XG5cbi8qKiBPbmUgb3BhcXVlIHNlYS1sZXZlbCBzdXJmYWNlIGZvciB0aGUgd2hvbGUgdmlldy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFdhdGVyU3VyZmFjZSh3b3JsZDogV29ybGQsIHNpemUgPSAyMDAwMCwgc2VnbWVudHMgPSA5Nik6IFRIUkVFLk1lc2gge1xuICBjb25zdCBnZW8gPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeShzaXplLCBzaXplLCBzZWdtZW50cywgc2VnbWVudHMpO1xuICBnZW8ucm90YXRlWCgtTWF0aC5QSSAvIDIpO1xuICBjb25zdCBwb3MgPSBnZW8uYXR0cmlidXRlcy5wb3NpdGlvbjtcbiAgY29uc3QgY29sb3JzID0gbmV3IEZsb2F0MzJBcnJheShwb3MuY291bnQgKiAzKTtcbiAgY29uc3QgdG1wID0gbmV3IFRIUkVFLkNvbG9yKCk7XG4gIGNvbnN0IHNtb290aHN0ZXAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHg6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IHQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCAoeCAtIGEpIC8gKGIgLSBhKSkpO1xuICAgIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xuICB9O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHBvcy5jb3VudDsgaSsrKSB7XG4gICAgY29uc3QgeCA9IHBvcy5nZXRYKGkpLCB6ID0gcG9zLmdldFooaSk7XG4gICAgLy8gVGhlIHdhdGVyIHBsYW5lIHNhbXBsZXMgdGhlIHNlYWJlZCBvbmx5IGZvciBhIG5hcnJvdyBzaG9yZSByaW0uIEEgZGVwdGhcbiAgICAvLyByYW1wIG9uIGEgNDcgbSBncmlkIG1pc3NlZCB0aGUgMTAgbSByaXZlciBlbnRpcmVseSBhbmQgdHVybmVkIGl0IHdoaXRlO1xuICAgIC8vIHRoZSByaXZlciBhbmQgbGFrZSByZWFkIGJldHRlciBhcyB0aGUgc2FtZSBkZWVwIHdhdGVyIGFzIHRoZSBzZWEuXG4gICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgTWF0aC5yb3VuZCh4KSwgTWF0aC5yb3VuZCh6KSk7XG4gICAgY29uc3Qgc2hvcmUgPSBzbW9vdGhzdGVwKC0wLjksIC0wLjE1LCBoKSAqICgxIC0gc21vb3Roc3RlcCgtMC4xNSwgMC40LCBoKSk7XG4gICAgY29uc3QgbiA9IGhhc2gyaShNYXRoLmZsb29yKHggLyA0NSksIE1hdGguZmxvb3IoeiAvIDQ1KSwgd29ybGQuc2VlZCArIDUwMSk7XG4gICAgdG1wLmNvcHkoQ09MLndhdGVyTWlkKS5sZXJwKENPTC53YXRlckRlZXAsIDAuMzUgKyAwLjM1ICogbik7XG4gICAgLy8gQSB3ZWFrIHNob3JlIHRpbnQuIEEgc3Ryb25nIG9uZSwgc2FtcGxlZCBvbiBhIGNvYXJzZSBwbGFuZSwgcHJvZHVjZWRcbiAgICAvLyBwYWxlIHJlY3RhbmdsZXMgb3ZlciBvZmZzaG9yZSBzZWFtb3VudHMgaW4gdGhlIG1hcCB2aWV3LlxuICAgIHRtcC5sZXJwKENPTC53YXRlclJpbSwgc2hvcmUgKiAwLjE1KTtcbiAgICBjb2xvcnNbaSAqIDNdID0gdG1wLnI7IGNvbG9yc1tpICogMyArIDFdID0gdG1wLmc7IGNvbG9yc1tpICogMyArIDJdID0gdG1wLmI7XG4gIH1cbiAgZ2VvLnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGNvbG9ycywgMykpO1xuICAvLyBPcGFxdWU6IHRoZSBzZWEtbGV2ZWwgc3VyZmFjZSBpcyB0aGUgd2F0ZXIgcmVhZC4gQSB0cmFuc2x1Y2VudCBwbGFuZSBsZXRcbiAgLy8gdGhlIG1hY3JvIHNlYWJlZCBzaG93IHRocm91Z2gsIHdoaWNoIG1hZGUgdGhlIGZpbml0ZSAyMDQ4IG0gd29ybGQgZWRnZVxuICAvLyB2aXNpYmxlIGFzIGEgc3F1YXJlIGluIHRoZSBmaXJzdCBNMDAxIG1hcCBjYXB0dXJlLlxuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XG4gICAgdmVydGV4Q29sb3JzOiB0cnVlLFxuICB9KSk7XG4gIG1lc2gucG9zaXRpb24ueSA9IC0wLjA2O1xuICBtZXNoLnJlbmRlck9yZGVyID0gMTtcbiAgbWVzaC5uYW1lID0gJ3dhdGVyX3N1cmZhY2UnO1xuICBtZXNoLnJlY2VpdmVTaGFkb3cgPSBmYWxzZTtcbiAgcmV0dXJuIG1lc2g7XG59XG5cbmludGVyZmFjZSBNYWNyb0hvbGUgeyBtaW5YOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWluWjogbnVtYmVyOyBtYXhaOiBudW1iZXI7IH1cbmludGVyZmFjZSBNYWNyb09wdGlvbnMge1xuICBzdGVwOiBudW1iZXI7XG4gIC8qKiBSZWN0YW5ndWxhciBob2xlIGNvdmVyZWQgYnkgdGhlIG5lYXIgMSBtIGNodW5rIHJpbmcuICovXG4gIGhvbGU/OiBNYWNyb0hvbGU7XG59XG5cbmludGVyZmFjZSBNYWNyb1Jlc3VsdCB7XG4gIG1lc2g6IFRIUkVFLk1lc2g7XG4gIHRyaWFuZ2xlczogbnVtYmVyO1xuICBzYW1wbGVNczogbnVtYmVyO1xuICB0b3RhbE1zOiBudW1iZXI7XG4gIHNhbXBsZUNhY2hlZDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIE1hY3JvU2FtcGxlQ2FjaGUge1xuICBOOiBudW1iZXI7XG4gIGhlaWdodHM6IEludDE2QXJyYXk7XG4gIHRvcHM6IFVpbnQ4QXJyYXk7XG4gIHVuZGVyd2F0ZXI6IFVpbnQ4QXJyYXk7XG4gIHNhbXBsZU1zOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWFjcm9UZXJyYWluU2FtcGxlIHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkOyB1bmRlcndhdGVyOiBib29sZWFuOyB9XG5cbi8vIENhY2hlIHRoZSBkZXRlcm1pbmlzdGljIGJhc2UgZ3JpZCBhbmQgdGhlIGF1dGhvcml0YXRpdmUgZWRpdGVkIGdyaWQgc2VwYXJhdGVseS5cbi8vIEJhc2UgZW50cmllcyBuZXZlciBuZWVkIGludmFsaWRhdGlvbi4gRWRpdGVkIGVudHJpZXMgYXJlIHNjb3BlZCBieSBXb3JsZCBpZGVudGl0eVxuLy8gKHR3byBzYW1lLXNlZWQgd29ybGRzIGNhbiBoYXZlIGRpZmZlcmVudCBlZGl0cykgYW5kIGJ5IGJvdGggdGhlIGNvYXJzZSBlZGl0XG4vLyByZXZpc2lvbiBhbmQgY2h1bmsgc3RyZWFtaW5nLCBzaW5jZSBldmljdGluZy9yZWdlbmVyYXRpbmcgZGF0YSBhbmQgc25hcHNob3Rcbi8vIHJlc3RvcmF0aW9uIGRvIG5vdCBuZWNlc3NhcmlseSBwcm9kdWNlIGEgbmV3IGNvYXJzZSByZXZpc2lvbi4gT25seSBjaHVua3Mgd2l0aFxuLy8gZHVyYWJsZSB2b3hlbCBkZWx0YXMgYXJlIG1hdGVyaWFsaXplZDsgdGhlIG90aGVyIDY0eDY0IGNlbGxzIHJlbWFpbiBiYXNlIHNhbXBsZXMuXG5pbnRlcmZhY2UgTWFjcm9Xb3JsZENhY2hlcyB7XG4gIGJhc2U6IE1hcDxudW1iZXIsIE1hY3JvU2FtcGxlQ2FjaGU+O1xuICBlZGl0ZWQ6IE1hcDxzdHJpbmcsIE1hY3JvU2FtcGxlQ2FjaGU+O1xuICAvKiogU3BhcnNlIGF1dGhvcml0YXRpdmUgY29sdW1ucywgaW5kZXBlbmRlbnQgb2YgdGhlIG1lc2ggc2FtcGxpbmcgcmVzb2x1dGlvbi4gKi9cbiAgY29sdW1uczogTWFwPHN0cmluZywgTWFwPG51bWJlciwgeyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBNYXRJZCB9Pj47XG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5jb25zdCBtYWNyb1NhbXBsZUNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hY3JvV29ybGRDYWNoZXM+KCk7XG5cbmZ1bmN0aW9uIHN5bmNNYWNyb0NvbHVtbnMod29ybGQ6IFdvcmxkLCBjYWNoZXM6IE1hY3JvV29ybGRDYWNoZXMpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLnJldmlzaW9uID09PSBjYWNoZXMucmV2aXNpb24pIHJldHVybjtcbiAgLy8gU25hcHNob3QgcmVzdG9yZSByZXBsYWNlcyBlZGl0cyBhbmQgY2h1bmtzIGJlZm9yZSBhc3NpZ25pbmcgaXRzIHNhdmVkXG4gIC8vIHJldmlzaW9uLiBOZXZlciBtaXggcmVtZW1iZXJlZCBjb2x1bW5zIGZyb20gdGhhdCBwcmV2aW91cyB3b3JsZCBzdGF0ZS5cbiAgY2FjaGVzLmNvbHVtbnMuY2xlYXIoKTtcbiAgLy8gQSBub3JtYWwgZWRpdCBoYXMgYWxyZWFkeSB1cGRhdGVkIHRoZSBsb2FkZWQgY2h1bmssIHNvIGl0IGNvc3RzIG9ubHkgdGhlXG4gIC8vIGVkaXRlZCBjaHVua3MuIFJlc3RvcmVkL2V2aWN0ZWQgZWRpdGVkIGNodW5rcyBhcmUgZ2VuZXJhdGVkIG9uIGRlbWFuZC5cbiAgZm9yIChjb25zdCBba2V5LCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBpZiAoIWVkaXRzLnNpemUgfHwgIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgY29udGludWU7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSkhO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBuZXcgTWFwPG51bWJlciwgeyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBNYXRJZCB9PigpO1xuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgY29sdW1ucy5zZXQoKG94ICsgbHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyBveiArIGx6ICsgSEFMRiwge1xuICAgICAgICAgIGhlaWdodDogY2h1bmsuaGVpZ2h0c1tjb2xdICsgWV9NSU4gKyAxLFxuICAgICAgICAgIHRvcDogY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gYXMgTWF0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBjYWNoZXMuY29sdW1ucy5zZXQoa2V5LCBjb2x1bW5zKTtcbiAgfVxuICBjYWNoZXMuZWRpdGVkLmNsZWFyKCk7XG4gIGNhY2hlcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xufVxuXG5mdW5jdGlvbiBtYWNyb0NvbHVtbih3b3JsZDogV29ybGQsIGNhY2hlczogTWFjcm9Xb3JsZENhY2hlcywga2V5OiBzdHJpbmcsIGluZGV4OiBudW1iZXIpIHtcbiAgbGV0IGNvbHVtbnMgPSBjYWNoZXMuY29sdW1ucy5nZXQoa2V5KTtcbiAgaWYgKGNvbHVtbnMpIHJldHVybiBjb2x1bW5zLmdldChpbmRleCk7XG4gIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGlmICghZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeikpIHJldHVybiB1bmRlZmluZWQ7XG4gIC8vIENhcHR1cmUgb25jZSBhZnRlciBsb2FkaW5nLiBMb2FkZWQgY2h1bmtzIGFyZSBjaGVhcCBhbmQgZG8gbm90IHJlcXVpcmVcbiAgLy8gd2Fsa2luZyBldmVyeSB2b3hlbDsgdGhpcyByZW1haW5zIE8oMzJ4MzIpIHBlciBlZGl0ZWQgY2h1bmsuXG4gIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpITtcbiAgY29sdW1ucyA9IG5ldyBNYXAoKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5zZXQoKG94ICsgbHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyBveiArIGx6ICsgSEFMRiwge1xuICAgICAgICBoZWlnaHQ6IGNodW5rLmhlaWdodHNbY29sXSArIFlfTUlOICsgMSxcbiAgICAgICAgdG9wOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSBhcyBNYXRJZCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBjYWNoZXMuY29sdW1ucy5zZXQoa2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnMuZ2V0KGluZGV4KTtcbn1cblxuY29uc3QgbWFjcm9FZGl0S2V5TWVtbyA9IG5ldyBXZWFrTWFwPFdvcmxkLCB7IHZlcnNpb246IG51bWJlcjsga2V5OiBzdHJpbmcgfT4oKTtcblxuLyoqIE1lbW9pemVkIGJ5IHRoZSB3b3JsZCdzIGVkaXQgdmVyc2lvbjogTygxKSBwZXIgZnJhbWUgdW5sZXNzIGVkaXRzIGNoYW5nZWQuICovXG5mdW5jdGlvbiBtYWNyb0VkaXRLZXkod29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3QgdmVyc2lvbiA9IGVkaXRWZXJzaW9uKHdvcmxkKTtcbiAgY29uc3QgbWVtbyA9IG1hY3JvRWRpdEtleU1lbW8uZ2V0KHdvcmxkKTtcbiAgaWYgKG1lbW8gJiYgbWVtby52ZXJzaW9uID09PSB2ZXJzaW9uKSByZXR1cm4gbWVtby5rZXk7XG4gIGNvbnN0IGtleSA9IGNvbXB1dGVNYWNyb0VkaXRLZXkod29ybGQpO1xuICBtYWNyb0VkaXRLZXlNZW1vLnNldCh3b3JsZCwgeyB2ZXJzaW9uLCBrZXkgfSk7XG4gIHJldHVybiBrZXk7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVNYWNyb0VkaXRLZXkod29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgLy8gSW5jbHVkZSBhIGNvbW11dGF0aXZlIGNvbnRlbnQgZmluZ2VycHJpbnQgYXMgd2VsbCBhcyBjb3VudDogZXZpY3Rpb24gYW5kXG4gIC8vIHNuYXBzaG90IHJlc3RvcmUgYnlwYXNzIHRoZSBjb2Fyc2UgV29ybGQucmV2aXNpb24gcGF0aCwgYW5kIGEgcmVzdG9yZWRcbiAgLy8gZGVsdGEgY2FuIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGNlbGxzIHdpdGggZGlmZmVyZW50IGluZGljZXMvbWF0ZXJpYWxzLlxuICByZXR1cm4gWy4uLndvcmxkLmVkaXRzLmVudHJpZXMoKV1cbiAgICAuZmlsdGVyKChbLCBlZGl0c10pID0+IGVkaXRzLnNpemUgPiAwKVxuICAgIC5tYXAoKFtrZXksIGVkaXRzXSkgPT4ge1xuICAgICAgbGV0IHN1bSA9IDA7XG4gICAgICBsZXQgbWl4ZWQgPSAwO1xuICAgICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IE1hdGguaW11bChpbmRleCArIDEsIDMxKSArIG1hdGVyaWFsO1xuICAgICAgICBzdW0gPSAoc3VtICsgdmFsdWUpIHwgMDtcbiAgICAgICAgbWl4ZWQgPSAobWl4ZWQgXiBNYXRoLmltdWwodmFsdWUsIDB4NDVkOWYzYikpIHwgMDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtrZXl9OiR7ZWRpdHMuc2l6ZX06JHtzdW19OiR7bWl4ZWR9YDtcbiAgICB9KVxuICAgIC5zb3J0KClcbiAgICAuam9pbignfCcpO1xufVxuXG5mdW5jdGlvbiBlZGl0ZWRNYWNyb1NhbXBsZXMod29ybGQ6IFdvcmxkLCBzdGVwOiBudW1iZXIsIGNhY2hlOiBNYWNyb1NhbXBsZUNhY2hlKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGNvbnN0IGNhY2hlcyA9IG1hY3JvU2FtcGxlQ2FjaGUuZ2V0KHdvcmxkKSE7XG4gIGNvbnN0IGtleSA9IGAke3N0ZXB9OiR7bWFjcm9FZGl0S2V5KHdvcmxkKX1gO1xuICBjb25zdCBjYWNoZWQgPSBjYWNoZXMuZWRpdGVkLmdldChrZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuXG4gIGZvciAoY29uc3QgW2NodW5rLCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBpZiAoZWRpdHMuc2l6ZSAmJiAhY2FjaGVzLmNvbHVtbnMuaGFzKGNodW5rKSkgbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssIDApO1xuICB9XG5cbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgeyBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyIH0gPSBjYWNoZTtcbiAgY29uc3Qgc2FtcGxlID0ge1xuICAgIE4sXG4gICAgaGVpZ2h0czogbmV3IEludDE2QXJyYXkoaGVpZ2h0cyksXG4gICAgdG9wczogbmV3IFVpbnQ4QXJyYXkodG9wcyksXG4gICAgdW5kZXJ3YXRlcjogbmV3IFVpbnQ4QXJyYXkodW5kZXJ3YXRlciksXG4gICAgc2FtcGxlTXM6IGNhY2hlLnNhbXBsZU1zLFxuICB9O1xuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZCgtSEFMRiArIChpICsgMC41KSAqIHN0ZXApO1xuICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwKTtcbiAgICAgIGNvbnN0IGNodW5rID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG4gICAgICBpZiAoIXdvcmxkLmVkaXRzLmdldChjaHVuayk/LnNpemUpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgY29uc3QgZWRpdGVkID0gbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssICh4ICsgSEFMRikgKiBXT1JMRF9TSVpFICsgeiArIEhBTEYpO1xuICAgICAgaWYgKCFlZGl0ZWQpIGNvbnRpbnVlO1xuICAgICAgc2FtcGxlLmhlaWdodHNbaWR4XSA9IGVkaXRlZC5oZWlnaHQ7XG4gICAgICBzYW1wbGUudG9wc1tpZHhdID0gZWRpdGVkLnRvcDtcbiAgICAgIHNhbXBsZS51bmRlcndhdGVyW2lkeF0gPSBzYW1wbGUuaGVpZ2h0c1tpZHhdIDwgU0VBX0xFVkVMID8gMSA6IDA7XG4gICAgfVxuICB9XG4gIHNhbXBsZS5zYW1wbGVNcyA9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gIGNhY2hlcy5lZGl0ZWQuc2V0KGtleSwgc2FtcGxlKTtcbiAgcmV0dXJuIHNhbXBsZTtcbn1cblxuZnVuY3Rpb24gbWFjcm9TYW1wbGVzKHdvcmxkOiBXb3JsZCwgc3RlcDogbnVtYmVyKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGxldCBjYWNoZXMgPSBtYWNyb1NhbXBsZUNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGVzKSB7XG4gICAgY2FjaGVzID0geyBiYXNlOiBuZXcgTWFwKCksIGVkaXRlZDogbmV3IE1hcCgpLCBjb2x1bW5zOiBuZXcgTWFwKCksIHJldmlzaW9uOiAtMSB9O1xuICAgIG1hY3JvU2FtcGxlQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZXMpO1xuICB9XG4gIHN5bmNNYWNyb0NvbHVtbnMod29ybGQsIGNhY2hlcyk7XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlcy5iYXNlLmdldChzdGVwKTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGVkaXRlZE1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCwgY2FjaGVkKTtcblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBOID0gTWF0aC5jZWlsKFdPUkxEX1NJWkUgLyBzdGVwKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBJbnQxNkFycmF5KE4gKiBOKTtcbiAgY29uc3QgdG9wcyA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgdW5kZXJ3YXRlciA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgY2VsbFggPSAoaTogbnVtYmVyKSA9PiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXA7XG4gIGNvbnN0IGNlbGxaID0gKGo6IG51bWJlcikgPT4gLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwO1xuXG4gIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgTWF0aC5yb3VuZCh4KSwgTWF0aC5yb3VuZCh6KSk7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBoZWlnaHRzW2lkeF0gPSBoO1xuICAgICAgaWYgKGggPCBTRUFfTEVWRUwpIHVuZGVyd2F0ZXJbaWR4XSA9IDE7XG4gICAgfVxuICB9XG5cbiAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgaWYgKHVuZGVyd2F0ZXJbaWR4XSkgY29udGludWU7XG4gICAgICBjb25zdCBoID0gaGVpZ2h0c1tpZHhdO1xuICAgICAgY29uc3QgeCA9IGNlbGxYKGkpLCB6ID0gY2VsbFooaik7XG4gICAgICBsZXQgc2xvcGUgPSAwO1xuICAgICAgbGV0IG5lYXJXYXRlciA9IGZhbHNlO1xuICAgICAgY29uc3QgbnMgPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBucykge1xuICAgICAgICBjb25zdCBueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKE4gLSAxLCBpICsgZHgpKTtcbiAgICAgICAgY29uc3QgbnogPSBNYXRoLm1heCgwLCBNYXRoLm1pbihOIC0gMSwgaiArIGR6KSk7XG4gICAgICAgIGNvbnN0IG5oID0gaGVpZ2h0c1tueiAqIE4gKyBueF07XG4gICAgICAgIHNsb3BlID0gTWF0aC5tYXgoc2xvcGUsIE1hdGguYWJzKGggLSBuaCkpO1xuICAgICAgICBpZiAobmggPCBTRUFfTEVWRUwgKyAxKSBuZWFyV2F0ZXIgPSB0cnVlO1xuICAgICAgfVxuICAgICAgdG9wc1tpZHhdID0gYmFzZVRvcE1hdGVyaWFsRm9yKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgICAgICBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopLCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjYWNoZTogTWFjcm9TYW1wbGVDYWNoZSA9IHtcbiAgICBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyLFxuICAgIHNhbXBsZU1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHQwLFxuICB9O1xuICBjYWNoZXMuYmFzZS5zZXQoc3RlcCwgY2FjaGUpO1xuICByZXR1cm4gZWRpdGVkTWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwLCBjYWNoZSk7XG59XG5cbi8qKiBBdXRob3JpdGF0aXZlIG1hY3JvLWdyaWQgdmFsdWUgYXQgYSB3b3JsZCBjb2x1bW4gKHN0ZXAgZGVmYXVsdHMgdG8gOCBtKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgc3RlcCA9IDgpOiBNYWNyb1RlcnJhaW5TYW1wbGUge1xuICBjb25zdCBjYWNoZSA9IG1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCk7XG4gIGNvbnN0IGkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjYWNoZS5OIC0gMSwgTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gc3RlcCkpKTtcbiAgY29uc3QgaiA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNhY2hlLk4gLSAxLCBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBzdGVwKSkpO1xuICBjb25zdCBpZHggPSBqICogY2FjaGUuTiArIGk7XG4gIHJldHVybiB7XG4gICAgeDogLUhBTEYgKyAoaSArIDAuNSkgKiBzdGVwLFxuICAgIHo6IC1IQUxGICsgKGogKyAwLjUpICogc3RlcCxcbiAgICBoZWlnaHQ6IGNhY2hlLmhlaWdodHNbaWR4XSwgdG9wOiBjYWNoZS50b3BzW2lkeF0gYXMgTWF0SWQsXG4gICAgdW5kZXJ3YXRlcjogY2FjaGUudW5kZXJ3YXRlcltpZHhdICE9PSAwLFxuICB9O1xufVxuXG4vKipcbiAqIEZhciBsYW5kc2NhcGUgTE9EIGRlcml2ZWQgZnJvbSB0aGUgc2FtZSBkZXRlcm1pbmlzdGljIHN1cmZhY2Ugc2FtcGxlci5cbiAqIENlbGxzIGJlbG93IHNlYSBsZXZlbCBhcmUgb21pdHRlZDogdGhlIG9wYXF1ZSB3YXRlciBzdXJmYWNlIGlzIHRoZSBvbmx5XG4gKiB3YXRlciByZWFkLCBzbyB0aGUgZmluaXRlIDIwNDggbSB3b3JsZCBjYW5ub3QgYXBwZWFyIGFzIGEgc3F1YXJlIHNlYWJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWFjcm9NZXNoKHdvcmxkOiBXb3JsZCwgb3B0czogTWFjcm9PcHRpb25zKTogTWFjcm9SZXN1bHQge1xuICBjb25zdCB0b3RhbFQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IHsgc3RlcCwgaG9sZSB9ID0gb3B0cztcbiAgY29uc3QgY2FjaGVLZXkgPSBgJHtzdGVwfToke21hY3JvRWRpdEtleSh3b3JsZCl9YDtcbiAgY29uc3Qgc2FtcGxlQ2FjaGVkID0gbWFjcm9TYW1wbGVDYWNoZS5nZXQod29ybGQpPy5lZGl0ZWQuaGFzKGNhY2hlS2V5KSA/PyBmYWxzZTtcbiAgY29uc3QgY2FjaGUgPSBtYWNyb1NhbXBsZXMod29ybGQsIHN0ZXApO1xuICBjb25zdCB7IE4sIGhlaWdodHMsIHRvcHMsIHVuZGVyd2F0ZXIgfSA9IGNhY2hlO1xuICBjb25zdCBob2xlQ2VsbCA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgY2VsbFggPSAoaTogbnVtYmVyKSA9PiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXA7XG4gIGNvbnN0IGNlbGxaID0gKGo6IG51bWJlcikgPT4gLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwO1xuXG4gIGlmIChob2xlKSB7XG4gICAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgICBpZiAoeCA+IGhvbGUubWluWCAmJiB4IDwgaG9sZS5tYXhYICYmIHogPiBob2xlLm1pblogJiYgeiA8IGhvbGUubWF4Wikge1xuICAgICAgICAgIGhvbGVDZWxsW2ogKiBOICsgaV0gPSAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgc2FtcGxlTXMgPSBzYW1wbGVDYWNoZWQgPyAwIDogY2FjaGUuc2FtcGxlTXM7XG4gIGNvbnN0IHBvc2l0aW9uczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3Qgbm9ybWFsczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgY29sb3JzOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBpbmRpY2VzOiBudW1iZXJbXSA9IFtdO1xuXG4gIGNvbnN0IHB1c2hRdWFkID0gKHA6IG51bWJlcltdW10sIG46IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgY29sb3I6IFRIUkVFLkNvbG9yKSA9PiB7XG4gICAgY29uc3QgYmFzZSA9IHBvc2l0aW9ucy5sZW5ndGggLyAzO1xuICAgIGZvciAoY29uc3QgdiBvZiBwKSB7XG4gICAgICBwb3NpdGlvbnMucHVzaCh2WzBdLCB2WzFdLCB2WzJdKTtcbiAgICAgIG5vcm1hbHMucHVzaChuWzBdLCBuWzFdLCBuWzJdKTtcbiAgICAgIGNvbG9ycy5wdXNoKGNvbG9yLnIsIGNvbG9yLmcsIGNvbG9yLmIpO1xuICAgIH1cbiAgICBpbmRpY2VzLnB1c2goYmFzZSwgYmFzZSArIDEsIGJhc2UgKyAyLCBiYXNlLCBiYXNlICsgMiwgYmFzZSArIDMpO1xuICB9O1xuXG4gIGNvbnN0IGNlbGxTaGFkZSA9IChpOiBudW1iZXIsIGo6IG51bWJlcikgPT4gMC45NCArIDAuMTIgKiBoYXNoMmkoaSwgaiwgd29ybGQuc2VlZCArIDQwMSk7XG5cbiAgY29uc3QgdG9wQ29sb3IgPSAodG9wOiBNYXRJZCwgaDogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFRIUkVFLkNvbG9yID0+IHtcbiAgICBjb25zdCBzaGFkZSA9IGNlbGxTaGFkZShpLCBqKTtcbiAgICBjb25zdCBtb2lzdCA9IGZibTIoY2VsbFgoaSkgLyAxMzAsIGNlbGxaKGopIC8gMTMwLCB3b3JsZC5zZWVkICsgNjAxLCAzKTtcbiAgICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIENPTC5zYW5kLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUgKiAwLjkwKTtcbiAgICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gQ09MLmdyYXZlbC5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgICBpZiAodG9wID09PSBNQVQuU1RPTkUpIHtcbiAgICAgIHJldHVybiBDT0wuc3RvbmVTaGFkZS5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgMC4zNSArIDAuMjUgKiBzaGFkZSkubXVsdGlwbHlTY2FsYXIoXG4gICAgICAgICgwLjgyICsgMC4xNCAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChoICsgOCkgLyA3MCkpKSAqICgwLjkyICsgMC4wOCAqIHNoYWRlKSxcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICh0b3AgPT09IE1BVC5PUkUpIHJldHVybiBDT0wub3JlLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TTk9XKSByZXR1cm4gQ09MLnNub3cuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigwLjk0ICsgMC4wOCAqIHNoYWRlKTtcbiAgICAvLyBGb3Jlc3QtZmxvb3IgcGF0Y2hlcyBicmVhayB1cCB0aGUgdW5pZm9ybSBncmVlbiBvZiB0aGUgZmFyIExPRC4gVGhleVxuICAgIC8vIGFyZSBhIGNvbG91ciBhcHByb3hpbWF0aW9uLCBub3QgZXh0cmEgZ2VvbWV0cnk7IHRoZSBuZWFyIHJpbmcgaGFzIHJlYWxcbiAgICAvLyBTdHlsIHRyZWVzLlxuICAgIHJldHVybiBDT0wuZ3Jhc3NUb3BbaGVpZ2h0QmFuZChoKV0uY2xvbmUoKVxuICAgICAgLmxlcnAoQ09MLmdyYXNzQ2FwLCAwLjEyICsgMC4zNCAqIG1vaXN0KVxuICAgICAgLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICBjb25zdCBzaWRlQ29sb3IgPSAodG9wOiBNYXRJZCwgaDogbnVtYmVyLCBuaDogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFRIUkVFLkNvbG9yID0+IHtcbiAgICBjb25zdCBkcm9wID0gaCAtIG5oO1xuICAgIGNvbnN0IHNoYWRlID0gMC45MCArIDAuMTAgKiBoYXNoMmkoaSwgaiwgd29ybGQuc2VlZCArIDQwMik7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBDT0wuc2FuZC5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgZHJvcCA+IDUgPyAwLjU1IDogMC4yKS5tdWx0aXBseVNjYWxhcihzaGFkZSAqIDAuOTIpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSkge1xuICAgICAgcmV0dXJuIENPTC5zdG9uZVNoYWRlLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoXG4gICAgICAgICgwLjgwICsgMC4xNiAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChoICsgOCkgLyA3MCkpKSAqIHNoYWRlLFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gQSBncmFzcy10b3BwZWQgYmFuayBpcyBub3QgYSBzdG9uZSBjbGlmZiwgaG93ZXZlciB0YWxsIHRoZSA4IG0gbWFjcm9cbiAgICAvLyBjZWxsIG1ha2VzIGl0IGxvb2suIEtlZXBpbmcgdGhlIHNpZGUgaW4gdGhlIHNvaWwgcmFuZ2UgcmVtb3ZlZCB0aGVcbiAgICAvLyBicmlnaHQgd2hpdGUgcXVhcnJ5IHdhbGxzIGFyb3VuZCB0aGUgcml2ZXIgYW5kIGxha2UgaW4gdGhlIHdpZGUgdmlldy5cbiAgICBpZiAoZHJvcCA+IDQpIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5vY2hyZSwgMC41NSkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5zdG9uZUIsIDAuMjIpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBpZiAoaG9sZUNlbGxbaWR4XSB8fCB1bmRlcndhdGVyW2lkeF0pIGNvbnRpbnVlO1xuICAgICAgY29uc3QgaCA9IGhlaWdodHNbaWR4XTtcbiAgICAgIGNvbnN0IHRvcCA9IHRvcHNbaWR4XSBhcyBNYXRJZDtcbiAgICAgIGNvbnN0IHgwID0gLUhBTEYgKyBpICogc3RlcCwgeDEgPSB4MCArIHN0ZXA7XG4gICAgICBjb25zdCB6MCA9IC1IQUxGICsgaiAqIHN0ZXAsIHoxID0gejAgKyBzdGVwO1xuXG4gICAgICBwdXNoUXVhZChcbiAgICAgICAgW1t4MCwgaCwgejBdLCBbeDAsIGgsIHoxXSwgW3gxLCBoLCB6MV0sIFt4MSwgaCwgejBdXSxcbiAgICAgICAgWzAsIDEsIDBdLFxuICAgICAgICB0b3BDb2xvcih0b3AsIGgsIGksIGopLFxuICAgICAgKTtcblxuICAgICAgY29uc3QgY2hlY2sgPSAoZGk6IG51bWJlciwgZGo6IG51bWJlcikgPT4ge1xuICAgICAgICBjb25zdCBuaSA9IGkgKyBkaSwgbmogPSBqICsgZGo7XG4gICAgICAgIGxldCBuaDogbnVtYmVyO1xuICAgICAgICBpZiAobmkgPCAwIHx8IG5qIDwgMCB8fCBuaSA+PSBOIHx8IG5qID49IE4pIHtcbiAgICAgICAgICAvLyBUaGUgd29ybGQgZWRnZSBpcyBvY2Vhbi4gRG8gbm90IGRyYXcgYSBzaWRlIGZhY2UgZG93biB0byB0aGVcbiAgICAgICAgICAvLyB3YXRlciBoZXJlOyB0aGUgb3BhcXVlIHdhdGVyIHBsYW5lIGFscmVhZHkgY292ZXJzIHRoZSBib3VuZGFyeS5cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgbmlkeCA9IG5qICogTiArIG5pO1xuICAgICAgICAgIGlmIChob2xlQ2VsbFtuaWR4XSkgcmV0dXJuO1xuICAgICAgICAgIG5oID0gdW5kZXJ3YXRlcltuaWR4XSA/IE1hdGgubWF4KFNFQV9MRVZFTCAtIDAuNSwgaGVpZ2h0c1tuaWR4XSkgOiBoZWlnaHRzW25pZHhdO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoIDw9IG5oKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGNvbCA9IHNpZGVDb2xvcih0b3AsIGgsIG5oLCBpLCBqKTtcbiAgICAgICAgaWYgKGRpID09PSAxKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MSwgbmgsIHowXSwgW3gxLCBoLCB6MF0sIFt4MSwgaCwgejFdLCBbeDEsIG5oLCB6MV1dLCBbMSwgMCwgMF0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZGkgPT09IC0xKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHowXSwgW3gwLCBuaCwgejFdLCBbeDAsIGgsIHoxXSwgW3gwLCBoLCB6MF1dLCBbLTEsIDAsIDBdLCBjb2wpO1xuICAgICAgICB9IGVsc2UgaWYgKGRqID09PSAxKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHoxXSwgW3gxLCBuaCwgejFdLCBbeDEsIGgsIHoxXSwgW3gwLCBoLCB6MV1dLCBbMCwgMCwgMV0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZGogPT09IC0xKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHowXSwgW3gwLCBoLCB6MF0sIFt4MSwgaCwgejBdLCBbeDEsIG5oLCB6MF1dLCBbMCwgMCwgLTFdLCBjb2wpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgY2hlY2soMSwgMCk7IGNoZWNrKC0xLCAwKTsgY2hlY2soMCwgMSk7IGNoZWNrKDAsIC0xKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUocG9zaXRpb25zLCAzKSk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobm9ybWFscywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoY29sb3JzLCAzKSk7XG4gIGdlb21ldHJ5LnNldEluZGV4KGluZGljZXMpO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcblxuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsIGZsYXRTaGFkaW5nOiB0cnVlLFxuICB9KSk7XG4gIG1lc2gubmFtZSA9ICdtYWNyb19sb2QnO1xuICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgbWVzaC5yZWNlaXZlU2hhZG93ID0gZmFsc2U7XG4gIHJldHVybiB7XG4gICAgbWVzaCxcbiAgICB0cmlhbmdsZXM6IGluZGljZXMubGVuZ3RoIC8gMyxcbiAgICBzYW1wbGVNcyxcbiAgICB0b3RhbE1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHRvdGFsVDAsXG4gICAgc2FtcGxlQ2FjaGVkLFxuICB9O1xufVxuXG5leHBvcnQgdHlwZSBWaWV3TW9kZSA9ICd3b3JsZCcgfCAnbWFwJyB8ICdraXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsVGVycmFpblZpZXdPcHRpb25zIHtcbiAgbmVhclJhZGl1cz86IG51bWJlcjtcbiAgd29ybGRNYWNyb1N0ZXA/OiBudW1iZXI7XG4gIG1hcE1hY3JvU3RlcD86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENodW5rVmlldyB7IG1lc2g6IFRIUkVFLk1lc2g7IHdhdGVyOiBUSFJFRS5NZXNoIHwgbnVsbDsgdHJpYW5nbGVzOiBudW1iZXI7IH1cblxuLyoqXG4gKiBPd25zIHRoZSBuZWFyIGNodW5rIG1lc2hlcywgbWFjcm8gTE9EIGFuZCB3YXRlciBzdXJmYWNlLiBJdCByZWFkcyB3b3JsZFxuICogc3RhdGUgYW5kIG5ldmVyIG11dGF0ZXMgZ2VuZXJhdGlvbiBydWxlczsgZXZpY3Rpb24gb25seSBmcmVlcyBkZXJpdmVkIGRhdGEuXG4gKi9cbmV4cG9ydCBjbGFzcyBWb3hlbFRlcnJhaW5WaWV3IHtcbiAgcmVhZG9ubHkgZ3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBuZWFyR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBtYWNyb0dyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgd2F0ZXI6IFRIUkVFLk1lc2g7XG4gIHByaXZhdGUgd29ybGQ6IFdvcmxkO1xuICBwcml2YXRlIG5lYXJSYWRpdXM6IG51bWJlcjtcbiAgcHJpdmF0ZSB3b3JsZE1hY3JvU3RlcDogbnVtYmVyO1xuICBwcml2YXRlIG1hcE1hY3JvU3RlcDogbnVtYmVyO1xuICBwcml2YXRlIGNodW5rcyA9IG5ldyBNYXA8c3RyaW5nLCBDaHVua1ZpZXc+KCk7XG4gIHByaXZhdGUgbG9hZGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbW9kZTogVmlld01vZGUgPSAnd29ybGQnO1xuICBwcml2YXRlIG1hY3JvOiBUSFJFRS5NZXNoIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbWFjcm9UcmlhbmdsZXMgPSAwO1xuICBwcml2YXRlIG1hY3JvRm9jdXMgPSBuZXcgVEhSRUUuVmVjdG9yMygxZTksIDAsIDFlOSk7XG4gIHByaXZhdGUgbWFjcm9Nb2RlOiBWaWV3TW9kZSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGNodW5rR2VuU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBjaHVua01lc2hTYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb1NhbXBsZVNhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgbWFjcm9DYWNoZUhpdHMgPSAwO1xuICBwcml2YXRlIG1hY3JvRWRpdEtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIC8qKiBNYWluLXRocmVhZCBtaWxsaXNlY29uZHMgcGVyIGZyYW1lIGZvciBzdHJlYW1pbmcgYW5kIGRpcnR5IHJlLW1lc2hpbmcuICovXG4gIGZyYW1lQnVkZ2V0TXMgPSA2O1xuICBwcml2YXRlIHBlbmRpbmdDaHVua3MgPSAwO1xuICBwcml2YXRlIHN3ZWVwQ291bnRlciA9IDA7XG4gIHByaXZhdGUgc3dlcHRDaHVua3MgPSAwO1xuICBwcml2YXRlIHBpbm5lZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHBvb2w6IENodW5rV29ya2VyUG9vbCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGdlbmVyYXRpbmcgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgLyoqIExhdGVzdCBtZXNoIHJlcXVlc3QgcGVyIGNodW5rOyBvbGRlciByZXN1bHRzIGFyZSBkaXNjYXJkZWQuICovXG4gIHByaXZhdGUgbWVzaFN0YW1wID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSBzdGFtcENvdW50ZXIgPSAwO1xuICBwcml2YXRlIHdvcmtlclN0YXRzID0geyBnZW5lcmF0ZWQ6IDAsIG1lc2hlZDogMCwgZGlzY2FyZGVkOiAwLCBnZW5NczogMCwgbWVzaE1zOiAwIH07XG4gIHByaXZhdGUgd2F0ZXJHcm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBwcml2YXRlIGZhcldhdGVySG9sZTogeyB2YWx1ZTogVEhSRUUuVmVjdG9yNCB9O1xuICBvbkNodW5rc0NoYW5nZWQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKHdvcmxkOiBXb3JsZCwgc2NlbmU6IFRIUkVFLlNjZW5lLCBvcHRzOiBWb3hlbFRlcnJhaW5WaWV3T3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy53b3JsZCA9IHdvcmxkO1xuICAgIHRoaXMubmVhclJhZGl1cyA9IE1hdGgubWF4KDEsIG9wdHMubmVhclJhZGl1cyA/PyAzKTtcbiAgICB0aGlzLndvcmxkTWFjcm9TdGVwID0gTWF0aC5tYXgoNCwgb3B0cy53b3JsZE1hY3JvU3RlcCA/PyA4KTtcbiAgICB0aGlzLm1hcE1hY3JvU3RlcCA9IE1hdGgubWF4KDQsIG9wdHMubWFwTWFjcm9TdGVwID8/IDgpO1xuICAgIHRoaXMuZ3JvdXAubmFtZSA9ICd2b3hlbF93b3JsZCc7XG4gICAgdGhpcy5uZWFyR3JvdXAubmFtZSA9ICd2b3hlbF9jaHVua3MnO1xuICAgIHRoaXMubWFjcm9Hcm91cC5uYW1lID0gJ21hY3JvX2xvZCc7XG4gICAgdGhpcy5ncm91cC5hZGQodGhpcy5uZWFyR3JvdXAsIHRoaXMubWFjcm9Hcm91cCk7XG4gICAgdGhpcy53YXRlciA9IGJ1aWxkV2F0ZXJTdXJmYWNlKHdvcmxkKTtcbiAgICB0aGlzLmZhcldhdGVySG9sZSA9IGluc3RhbGxGYXJXYXRlckhvbGUodGhpcy53YXRlci5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCk7XG4gICAgdGhpcy5ncm91cC5hZGQodGhpcy53YXRlcik7XG4gICAgdGhpcy53YXRlckdyb3VwLm5hbWUgPSAnbmVhcl93YXRlcic7XG4gICAgdGhpcy5ncm91cC5hZGQodGhpcy53YXRlckdyb3VwKTtcbiAgICBzY2VuZS5hZGQodGhpcy5ncm91cCk7XG4gIH1cblxuICBwcmVsb2FkKGZvY3VzOiBUSFJFRS5WZWN0b3IzKTogdm9pZCB7XG4gICAgdGhpcy5tb2RlID0gJ3dvcmxkJztcbiAgICB0aGlzLmVuc3VyZUNodW5rcyhmb2N1cywgdHJ1ZSk7XG4gICAgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsICd3b3JsZCcsIHRydWUpO1xuICB9XG5cbiAgLyoqIEFkdmFuY2UgcHJlc2VudGF0aW9uLW9ubHkgd2F0ZXIgYW5pbWF0aW9uIChzZWNvbmRzKS4gKi9cbiAgc2V0V2F0ZXJUaW1lKHNlY29uZHM6IG51bWJlcik6IHZvaWQgeyB3YXRlclRpbWUudmFsdWUgPSBzZWNvbmRzOyB9XG5cbiAgdXBkYXRlKGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBtb2RlOiBWaWV3TW9kZSA9ICd3b3JsZCcpOiB2b2lkIHtcbiAgICBpZiAobW9kZSAhPT0gdGhpcy5tb2RlKSB7XG4gICAgICB0aGlzLm1vZGUgPSBtb2RlO1xuICAgICAgdGhpcy5uZWFyR3JvdXAudmlzaWJsZSA9IG1vZGUgIT09ICdtYXAnO1xuICAgICAgdGhpcy53YXRlckdyb3VwLnZpc2libGUgPSBtb2RlICE9PSAnbWFwJztcbiAgICAgIGlmIChtb2RlID09PSAnbWFwJykgdGhpcy5mYXJXYXRlckhvbGUudmFsdWUuc2V0KDAsIDAsIDAsIDApO1xuICAgICAgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsIG1vZGUsIHRydWUpO1xuICAgIH1cblxuICAgIGlmIChtb2RlID09PSAnbWFwJykge1xuICAgICAgaWYgKG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKSAhPT0gdGhpcy5tYWNyb0VkaXRLZXkpIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCBtb2RlLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmcmFtZVN0YXJ0ID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgdGhpcy5lbnN1cmVDaHVua3MoZm9jdXMsIGZhbHNlLCBmcmFtZVN0YXJ0KTtcbiAgICB0aGlzLnJlYnVpbGREaXJ0eShmb2N1cywgZnJhbWVTdGFydCk7XG4gICAgaWYgKCsrdGhpcy5zd2VlcENvdW50ZXIgJSAzMCA9PT0gMCkgdGhpcy5zd2VlcFJlc2lkZW50KGZvY3VzKTtcblxuICAgIGNvbnN0IG1vdmVkID0gTWF0aC5oeXBvdChmb2N1cy54IC0gdGhpcy5tYWNyb0ZvY3VzLngsIGZvY3VzLnogLSB0aGlzLm1hY3JvRm9jdXMueik7XG4gICAgaWYgKHRoaXMubWFjcm9Nb2RlICE9PSBtb2RlIHx8IG1vdmVkID4gNDggfHwgbWFjcm9FZGl0S2V5KHRoaXMud29ybGQpICE9PSB0aGlzLm1hY3JvRWRpdEtleSkge1xuICAgICAgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsIG1vZGUsIGZhbHNlKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3RyZWFtIHRoZSBuZWFyIHJpbmcgbmVhcmVzdC1maXJzdCB3aXRoaW4gYSBwZXItZnJhbWUgdGltZSBidWRnZXQuIEF0IGxlYXN0XG4gICAqIG9uZSBjaHVuayBpcyBidWlsdCBwZXIgZnJhbWUgc28gc3RyZWFtaW5nIGFsd2F5cyBtYWtlcyBwcm9ncmVzcy5cbiAgICovXG4gIC8qKlxuICAgKiBNb3ZlIHN0cmVhbWluZyBnZW5lcmF0aW9uIGFuZCBtZXNoaW5nIHRvIHdvcmtlcnMuIEV4cGxpY2l0IHJlYnVpbGRzXG4gICAqIChjb25zdHJ1Y3Rpb24sIGVkaXRzIHZpYSByZWJ1aWxkQXJvdW5kKSBhbmQgcHJlbG9hZCBzdGF5IHN5bmNocm9ub3VzIHNvXG4gICAqIGF1dGhvcml0YXRpdmUgY2hhbmdlcyBhcmUgdmlzaWJsZSBpbW1lZGlhdGVseS5cbiAgICovXG4gIGVuYWJsZVdvcmtlcnMocG9vbDogQ2h1bmtXb3JrZXJQb29sKTogdm9pZCB7IHRoaXMucG9vbCA9IHBvb2w7IH1cblxuICBnZXQgd29ya2VyTWV0cmljcygpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHwgbnVsbCB7XG4gICAgaWYgKCF0aGlzLnBvb2wpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICB3b3JrZXJzOiB0aGlzLnBvb2wuc2l6ZSwgaW5GbGlnaHQ6IHRoaXMucG9vbC5pbkZsaWdodCwgLi4udGhpcy53b3JrZXJTdGF0cyxcbiAgICAgIGdlbk1zQXZnOiB0aGlzLndvcmtlclN0YXRzLmdlbmVyYXRlZCA/IE1hdGgucm91bmQodGhpcy53b3JrZXJTdGF0cy5nZW5NcyAvIHRoaXMud29ya2VyU3RhdHMuZ2VuZXJhdGVkICogMTApIC8gMTAgOiAwLFxuICAgICAgbWVzaE1zQXZnOiB0aGlzLndvcmtlclN0YXRzLm1lc2hlZCA/IE1hdGgucm91bmQodGhpcy53b3JrZXJTdGF0cy5tZXNoTXMgLyB0aGlzLndvcmtlclN0YXRzLm1lc2hlZCAqIDEwKSAvIDEwIDogMCxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSByZXF1ZXN0R2VuZXJhdGUoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gICAgaWYgKHRoaXMud29ybGQuY2h1bmtzLmhhcyhrZXkpIHx8IHRoaXMuZ2VuZXJhdGluZy5oYXMoa2V5KSB8fCAhdGhpcy5wb29sKSByZXR1cm47XG4gICAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuO1xuICAgIHRoaXMuZ2VuZXJhdGluZy5hZGQoa2V5KTtcbiAgICBjb25zdCB7IHNlZWQgfSA9IHRoaXMud29ybGQsIHZlcnNpb24gPSB0aGlzLndvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uO1xuICAgIHZvaWQgdGhpcy5wb29sLmdlbmVyYXRlKHNlZWQsIHZlcnNpb24sIGN4LCBjeikudGhlbigocikgPT4ge1xuICAgICAgdGhpcy5nZW5lcmF0aW5nLmRlbGV0ZShrZXkpO1xuICAgICAgLy8gVGhlIG1haW4gdGhyZWFkIGlzIHRoZSBvbmx5IFdvcmxkIHdyaXRlcjogaW5zdGFsbCBvbmx5IGlmIHN0aWxsIHdhbnRlZC5cbiAgICAgIGlmICh0aGlzLndvcmxkLnNlZWQgIT09IHNlZWQgfHwgdGhpcy53b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiAhPT0gdmVyc2lvblxuICAgICAgICB8fCB0aGlzLndvcmxkLmNodW5rcy5oYXMoa2V5KSkgeyB0aGlzLndvcmtlclN0YXRzLmRpc2NhcmRlZCsrOyByZXR1cm47IH1cbiAgICAgIHNlZWRCYXNlQ29sdW1ucyh0aGlzLndvcmxkLCBrZXksIHIuY29sdW1ucyk7XG4gICAgICBpbnN0YWxsQmFzZUNodW5rKHRoaXMud29ybGQsIHIuYmFzZSwgci5tcyk7XG4gICAgICB0aGlzLndvcmtlclN0YXRzLmdlbmVyYXRlZCsrO1xuICAgICAgdGhpcy53b3JrZXJTdGF0cy5nZW5NcyArPSByLm1zO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSByZXF1ZXN0TWVzaChrZXk6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IGNodW5rID0gdGhpcy53b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuayB8fCAhdGhpcy5wb29sKSByZXR1cm47XG4gICAgY29uc3Qgc3RhbXAgPSArK3RoaXMuc3RhbXBDb3VudGVyO1xuICAgIHRoaXMubWVzaFN0YW1wLnNldChrZXksIHN0YW1wKTtcbiAgICB0aGlzLndvcmxkLmRpcnR5LmRlbGV0ZShrZXkpO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IHBhZGRlZCA9IHBhZGRlZEZvcih0aGlzLndvcmxkLCBjaHVuayk7XG4gICAgdm9pZCB0aGlzLnBvb2wubWVzaChwYWRkZWQsIGNodW5rLmhlaWdodHMsIG94LCBveiwgdGhpcy53b3JsZC5zZWVkKS50aGVuKChyKSA9PiB7XG4gICAgICAvLyBTdXBlcnNlZGVkIChuZXdlciByZXF1ZXN0LCB1bmxvYWRlZCBvciBzeW5jaHJvbm91c2x5IHJlYnVpbHQpIHJlc3VsdHMgYXJlIGRyb3BwZWQuXG4gICAgICBpZiAodGhpcy5tZXNoU3RhbXAuZ2V0KGtleSkgIT09IHN0YW1wKSB7IHRoaXMud29ya2VyU3RhdHMuZGlzY2FyZGVkKys7IHJldHVybjsgfVxuICAgICAgdGhpcy5tZXNoU3RhbXAuZGVsZXRlKGtleSk7XG4gICAgICBjb25zdCBjdXJyZW50ID0gdGhpcy53b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgICBpZiAoIWN1cnJlbnQpIHsgdGhpcy53b3JrZXJTdGF0cy5kaXNjYXJkZWQrKzsgcmV0dXJuOyB9XG4gICAgICAvLyBBbiBlZGl0IHRvIHRoaXMgY2h1bmsgd2hpbGUgaW4gZmxpZ2h0IHJlLW1hcmtlZCBpdCBkaXJ0eTsgdGhlIHJlc3VsdCBpc1xuICAgICAgLy8gc3RpbGwgc2hvd24gbm93IGFuZCByZXBsYWNlZCBieSB0aGUgbmV4dCAoZnJlc2gpIHJlcXVlc3QuXG4gICAgICB0aGlzLmFkb3B0TWVzaChrZXksIGN1cnJlbnQsIGdlb21ldHJ5RnJvbUFycmF5cyhyLmFycmF5cykpO1xuICAgICAgdGhpcy53b3JrZXJTdGF0cy5tZXNoZWQrKztcbiAgICAgIHRoaXMud29ya2VyU3RhdHMubWVzaE1zICs9IHIubXM7XG4gICAgICB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGFkb3B0TWVzaChrZXk6IHN0cmluZywgY2h1bms6IFZveGVsQ2h1bmssIHJlc3VsdDogTWVzaFJlc3VsdCk6IHZvaWQge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB0aGlzLm5lYXJHcm91cC5yZW1vdmUoZXhpc3RpbmcubWVzaCk7XG4gICAgICBleGlzdGluZy5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgIGlmIChleGlzdGluZy53YXRlcikgeyB0aGlzLndhdGVyR3JvdXAucmVtb3ZlKGV4aXN0aW5nLndhdGVyKTsgZXhpc3Rpbmcud2F0ZXIuZ2VvbWV0cnkuZGlzcG9zZSgpOyB9XG4gICAgfVxuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChyZXN1bHQuZ2VvbWV0cnksIHRlcnJhaW5NYXRlcmlhbCk7XG4gICAgbWVzaC5uYW1lID0gYHZveGVsX2NodW5rXyR7Y2h1bmsuY3h9XyR7Y2h1bmsuY3p9YDtcbiAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xuICAgIG1lc2guY2FzdFNoYWRvdyA9IGZhbHNlO1xuICAgIHRoaXMubmVhckdyb3VwLmFkZChtZXNoKTtcbiAgICBjb25zdCB3YXRlciA9IG1lc2hDaHVua1dhdGVyKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICBpZiAod2F0ZXIpIHRoaXMud2F0ZXJHcm91cC5hZGQod2F0ZXIpO1xuICAgIHRoaXMuY2h1bmtzLnNldChrZXksIHsgbWVzaCwgd2F0ZXIsIHRyaWFuZ2xlczogcmVzdWx0LnRyaWFuZ2xlcyArICh3YXRlcj8udXNlckRhdGEud2F0ZXJUcmlhbmdsZXMgPz8gMCkgfSk7XG4gICAgdGhpcy5sb2FkZWQuYWRkKGtleSk7XG4gIH1cblxuICAvKiogV29ya2VyIHN0cmVhbWluZzogZ2VuZXJhdGUgdGhlIDN4MyBuZWlnaGJvdXJob29kLCB0aGVuIG1lc2gsIG5lYXJlc3QgZmlyc3QuICovXG4gIHByaXZhdGUgZW5zdXJlQ2h1bmtzQXN5bmMobWlzc2luZzogQXJyYXk8eyBjeDogbnVtYmVyOyBjejogbnVtYmVyOyBkOiBudW1iZXIgfT4pOiB2b2lkIHtcbiAgICBjb25zdCBwb29sID0gdGhpcy5wb29sITtcbiAgICBjb25zdCBtYXhJbkZsaWdodCA9IHBvb2wuc2l6ZSAqIDM7XG4gICAgZm9yIChjb25zdCBtIG9mIG1pc3NpbmcpIHtcbiAgICAgIGlmIChwb29sLmluRmxpZ2h0ID49IG1heEluRmxpZ2h0KSBicmVhaztcbiAgICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KG0uY3gsIG0uY3opO1xuICAgICAgaWYgKHRoaXMubWVzaFN0YW1wLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICAgIGxldCByZWFkeSA9IHRydWU7XG4gICAgICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgICAgIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIHtcbiAgICAgICAgICBjb25zdCBjeCA9IG0uY3ggKyBkeCwgY3ogPSBtLmN6ICsgZHo7XG4gICAgICAgICAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgY29udGludWU7XG4gICAgICAgICAgaWYgKCF0aGlzLndvcmxkLmNodW5rcy5oYXMoY2h1bmtLZXkoY3gsIGN6KSkpIHsgcmVhZHkgPSBmYWxzZTsgdGhpcy5yZXF1ZXN0R2VuZXJhdGUoY3gsIGN6KTsgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAocmVhZHkpIHRoaXMucmVxdWVzdE1lc2goa2V5KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGVuc3VyZUNodW5rcyhmb2N1czogVEhSRUUuVmVjdG9yMywgaW1tZWRpYXRlOiBib29sZWFuLCBmcmFtZVN0YXJ0ID0gcGVyZm9ybWFuY2Uubm93KCkpOiB2b2lkIHtcbiAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgIGNvbnN0IGNjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5yb3VuZChmb2N1cy56KSk7XG4gICAgbGV0IGNoYW5nZWQgPSBmYWxzZTtcblxuICAgIGNvbnN0IG1pc3Npbmc6IEFycmF5PHsgY3g6IG51bWJlcjsgY3o6IG51bWJlcjsgZDogbnVtYmVyIH0+ID0gW107XG4gICAgZm9yIChsZXQgZHogPSAtdGhpcy5uZWFyUmFkaXVzOyBkeiA8PSB0aGlzLm5lYXJSYWRpdXM7IGR6KyspIHtcbiAgICAgIGZvciAobGV0IGR4ID0gLXRoaXMubmVhclJhZGl1czsgZHggPD0gdGhpcy5uZWFyUmFkaXVzOyBkeCsrKSB7XG4gICAgICAgIGNvbnN0IGN4ID0gY2N4ICsgZHgsIGN6ID0gY2N6ICsgZHo7XG4gICAgICAgIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIGNvbnRpbnVlO1xuICAgICAgICBpZiAodGhpcy5sb2FkZWQuaGFzKGNodW5rS2V5KGN4LCBjeikpKSBjb250aW51ZTtcbiAgICAgICAgbWlzc2luZy5wdXNoKHsgY3gsIGN6LCBkOiBkeCAqIGR4ICsgZHogKiBkeiB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgbWlzc2luZy5zb3J0KChhLCBiKSA9PiBhLmQgLSBiLmQpO1xuICAgIGxldCBidWlsdCA9IDA7XG4gICAgaWYgKHRoaXMucG9vbCAmJiAhaW1tZWRpYXRlICYmICF0aGlzLnBvb2wuZmFpbGVkKSB7XG4gICAgICB0aGlzLmVuc3VyZUNodW5rc0FzeW5jKG1pc3NpbmcpO1xuICAgICAgbWlzc2luZy5sZW5ndGggPSAwO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IG0gb2YgbWlzc2luZykge1xuICAgICAgaWYgKCFpbW1lZGlhdGUgJiYgYnVpbHQgPiAwICYmIHBlcmZvcm1hbmNlLm5vdygpIC0gZnJhbWVTdGFydCA+PSB0aGlzLmZyYW1lQnVkZ2V0TXMpIGJyZWFrO1xuICAgICAgdGhpcy5idWlsZENodW5rKG0uY3gsIG0uY3opO1xuICAgICAgYnVpbHQrKztcbiAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgIH1cbiAgICB0aGlzLnBlbmRpbmdDaHVua3MgPSB0aGlzLnBvb2wgJiYgIWltbWVkaWF0ZSA/IHRoaXMubWVzaFN0YW1wLnNpemUgKyB0aGlzLmdlbmVyYXRpbmcuc2l6ZSA6IG1pc3NpbmcubGVuZ3RoIC0gYnVpbHQ7XG5cbiAgICBjb25zdCBtYXJnaW4gPSB0aGlzLm5lYXJSYWRpdXMgKyAxO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIFsuLi50aGlzLmxvYWRlZF0pIHtcbiAgICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgICBpZiAoTWF0aC5hYnMoY3ggLSBjY3gpID4gbWFyZ2luIHx8IE1hdGguYWJzKGN6IC0gY2N6KSA+IG1hcmdpbikge1xuICAgICAgICB0aGlzLmRpc3Bvc2VDaHVuayhrZXkpO1xuICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY2hhbmdlZCkgdGhpcy5vbkNodW5rc0NoYW5nZWQ/LigpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZENodW5rKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAgIGNvbnN0IGdlbkJlZm9yZSA9IHRoaXMud29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zO1xuICAgIGNvbnN0IGNodW5rc0JlZm9yZSA9IHRoaXMud29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkO1xuICAgIC8vIEVuc3VyZSB0aGUgM3gzIG5laWdoYm91cmhvb2QgZXhpc3RzIHNvIGJvdW5kYXJ5IGZhY2VzIHVzZSByZWFsIGRhdGEuXG4gICAgZm9yIChsZXQgZHogPSAtMTsgZHogPD0gMTsgZHorKykge1xuICAgICAgZm9yIChsZXQgZHggPSAtMTsgZHggPD0gMTsgZHgrKykgZW5zdXJlQ2h1bmsodGhpcy53b3JsZCwgY3ggKyBkeCwgY3ogKyBkeik7XG4gICAgfVxuICAgIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsodGhpcy53b3JsZCwgY3gsIGN6KTtcbiAgICBpZiAoIWNodW5rKSByZXR1cm47XG4gICAgY29uc3QgZ2VuZXJhdGVkID0gdGhpcy53b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQgLSBjaHVua3NCZWZvcmU7XG4gICAgaWYgKGdlbmVyYXRlZCA+IDApIHtcbiAgICAgIHJlY29yZFNhbXBsZSh0aGlzLmNodW5rR2VuU2FtcGxlcywgKHRoaXMud29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zIC0gZ2VuQmVmb3JlKSAvIGdlbmVyYXRlZCk7XG4gICAgfVxuXG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHRoaXMubmVhckdyb3VwLnJlbW92ZShleGlzdGluZy5tZXNoKTtcbiAgICAgIGV4aXN0aW5nLm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgICAgaWYgKGV4aXN0aW5nLndhdGVyKSB7IHRoaXMud2F0ZXJHcm91cC5yZW1vdmUoZXhpc3Rpbmcud2F0ZXIpOyBleGlzdGluZy53YXRlci5nZW9tZXRyeS5kaXNwb3NlKCk7IH1cbiAgICB9XG5cbiAgICBjb25zdCBtZXNoVDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICBjb25zdCB7IGdlb21ldHJ5LCB0cmlhbmdsZXMgfSA9IG1lc2hDaHVuayh0aGlzLndvcmxkLCBjaHVuayk7XG4gICAgcmVjb3JkU2FtcGxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgcGVyZm9ybWFuY2Uubm93KCkgLSBtZXNoVDApO1xuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgdGVycmFpbk1hdGVyaWFsKTtcbiAgICBtZXNoLm5hbWUgPSBgdm94ZWxfY2h1bmtfJHtjeH1fJHtjen1gO1xuICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gICAgbWVzaC5jYXN0U2hhZG93ID0gZmFsc2U7XG4gICAgdGhpcy5uZWFyR3JvdXAuYWRkKG1lc2gpO1xuICAgIGNvbnN0IHdhdGVyID0gbWVzaENodW5rV2F0ZXIodGhpcy53b3JsZCwgY2h1bmspO1xuICAgIGlmICh3YXRlcikgdGhpcy53YXRlckdyb3VwLmFkZCh3YXRlcik7XG4gICAgdGhpcy5jaHVua3Muc2V0KGtleSwgeyBtZXNoLCB3YXRlciwgdHJpYW5nbGVzOiB0cmlhbmdsZXMgKyAod2F0ZXI/LnVzZXJEYXRhLndhdGVyVHJpYW5nbGVzID8/IDApIH0pO1xuICAgIHRoaXMubG9hZGVkLmFkZChrZXkpO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gIH1cblxuICBwcml2YXRlIGRpc3Bvc2VDaHVuayhrZXk6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHZpZXcgPSB0aGlzLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAodmlldykge1xuICAgICAgdGhpcy5uZWFyR3JvdXAucmVtb3ZlKHZpZXcubWVzaCk7XG4gICAgICB2aWV3Lm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgICAgaWYgKHZpZXcud2F0ZXIpIHsgdGhpcy53YXRlckdyb3VwLnJlbW92ZSh2aWV3LndhdGVyKTsgdmlldy53YXRlci5nZW9tZXRyeS5kaXNwb3NlKCk7IH1cbiAgICAgIHRoaXMuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICAgIH1cbiAgICB0aGlzLmxvYWRlZC5kZWxldGUoa2V5KTtcbiAgICB0aGlzLm1lc2hTdGFtcC5kZWxldGUoa2V5KTtcbiAgICBpZiAodGhpcy5waW5uZWQuaGFzKGtleSkpIHJldHVybjtcbiAgICB0aGlzLndvcmxkLmRpcnR5LmRlbGV0ZShrZXkpO1xuICAgIGV2aWN0Q2h1bmsodGhpcy53b3JsZCwga2V5KTtcbiAgfVxuXG4gIHByaXZhdGUgcmVidWlsZENodW5rKGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICB0aGlzLmJ1aWxkQ2h1bmsoY3gsIGN6KTtcbiAgfVxuXG4gIC8qKiBSZS1tZXNoIGRpcnR5IGxvYWRlZCBjaHVua3MgbmVhcmVzdC1maXJzdCwgc2hhcmluZyB0aGUgZnJhbWUgYnVkZ2V0LiAqL1xuICBwcml2YXRlIHJlYnVpbGREaXJ0eShmb2N1czogVEhSRUUuVmVjdG9yMywgZnJhbWVTdGFydDogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgY2N4ID0gd29ybGRUb0NodW5rWChNYXRoLnJvdW5kKGZvY3VzLngpKTtcbiAgICBjb25zdCBjY3ogPSB3b3JsZFRvQ2h1bmtaKE1hdGgucm91bmQoZm9jdXMueikpO1xuICAgIGNvbnN0IGRpcnR5OiBBcnJheTx7IGtleTogc3RyaW5nOyBkOiBudW1iZXIgfT4gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiB0aGlzLmxvYWRlZCkge1xuICAgICAgaWYgKCF0aGlzLndvcmxkLmRpcnR5LmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgICBkaXJ0eS5wdXNoKHsga2V5LCBkOiAoY3ggLSBjY3gpICoqIDIgKyAoY3ogLSBjY3opICoqIDIgfSk7XG4gICAgfVxuICAgIGlmIChkaXJ0eS5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICBkaXJ0eS5zb3J0KChhLCBiKSA9PiBhLmQgLSBiLmQpO1xuICAgIGlmICh0aGlzLnBvb2wgJiYgIXRoaXMucG9vbC5mYWlsZWQpIHtcbiAgICAgIGZvciAoY29uc3QgeyBrZXkgfSBvZiBkaXJ0eSkgaWYgKCF0aGlzLm1lc2hTdGFtcC5oYXMoa2V5KSB8fCB0aGlzLndvcmxkLmRpcnR5LmhhcyhrZXkpKSB0aGlzLnJlcXVlc3RNZXNoKGtleSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCByZWJ1aWx0ID0gMDtcbiAgICBmb3IgKGNvbnN0IHsga2V5IH0gb2YgZGlydHkpIHtcbiAgICAgIGlmIChyZWJ1aWx0ID4gMCAmJiBwZXJmb3JtYW5jZS5ub3coKSAtIGZyYW1lU3RhcnQgPj0gdGhpcy5mcmFtZUJ1ZGdldE1zKSBicmVhaztcbiAgICAgIHRoaXMucmVidWlsZENodW5rKGtleSk7XG4gICAgICByZWJ1aWx0Kys7XG4gICAgfVxuICAgIGlmIChyZWJ1aWx0ID4gMCkgdGhpcy5vbkNodW5rc0NoYW5nZWQ/LigpO1xuICB9XG5cbiAgLyoqXG4gICAqIENodW5rIGxpZmV0aW1lIHBvbGljeS4gTWVzaGluZyBnZW5lcmF0ZXMgYSByaW5nIG9mIG5laWdoYm91ciBjaHVua3MsIGFuZFxuICAgKiBzaW11bGF0aW9uIHF1ZXJpZXMgY2FuIGdlbmVyYXRlIG1vcmU7IG5vbmUgb2YgdGhvc2Ugd2VyZSBldmVyIHJlbGVhc2VkLlxuICAgKiBSZXNpZGVudCBjaHVuayBieXRlcyBhcmUgZGVyaXZlZCAocmVnZW5lcmF0ZWQgZnJvbSBzZWVkICsgZHVyYWJsZSBlZGl0cyksXG4gICAqIHNvIGFueXRoaW5nIG91dHNpZGUgdGhlIGtlZXAgcmFkaXVzIHRoYXQgaXMgbm90IGxvYWRlZCBvciBwaW5uZWQgaXMgZnJlZWQuXG4gICAqL1xuICBwcml2YXRlIHN3ZWVwUmVzaWRlbnQoZm9jdXM6IFRIUkVFLlZlY3RvcjMpOiB2b2lkIHtcbiAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgIGNvbnN0IGNjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5yb3VuZChmb2N1cy56KSk7XG4gICAgY29uc3Qga2VlcCA9IHRoaXMubmVhclJhZGl1cyArIDI7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWy4uLnRoaXMud29ybGQuY2h1bmtzLmtleXMoKV0pIHtcbiAgICAgIGlmICh0aGlzLmxvYWRlZC5oYXMoa2V5KSB8fCB0aGlzLnBpbm5lZC5oYXMoa2V5KSB8fCB0aGlzLm1lc2hTdGFtcC5oYXMoa2V5KSkgY29udGludWU7XG4gICAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgICAgaWYgKE1hdGguYWJzKGN4IC0gY2N4KSA8PSBrZWVwICYmIE1hdGguYWJzKGN6IC0gY2N6KSA8PSBrZWVwKSBjb250aW51ZTtcbiAgICAgIGV2aWN0Q2h1bmsodGhpcy53b3JsZCwga2V5KTtcbiAgICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gICAgICB0aGlzLnN3ZXB0Q2h1bmtzKys7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEtlZXAgdGhlIGNodW5rcyB1bmRlciBhIHdvcmxkLXNwYWNlIHJlY3RhbmdsZSByZXNpZGVudCAoZm9yIGV4YW1wbGUgdGhlXG4gICAqIHNldHRsZW1lbnQgZW52ZWxvcGUgdGhhdCBjb25zdHJ1Y3Rpb24gcHJldmlld3MgcXVlcnkgc2V2ZXJhbCB0aW1lcyBhIHNlY29uZCkuXG4gICAqL1xuICBwaW5SZWN0KG1pblg6IG51bWJlciwgbWluWjogbnVtYmVyLCBtYXhYOiBudW1iZXIsIG1heFo6IG51bWJlcik6IHZvaWQge1xuICAgIGZvciAobGV0IGN6ID0gd29ybGRUb0NodW5rWihtaW5aKSAtIDE7IGN6IDw9IHdvcmxkVG9DaHVua1oobWF4WikgKyAxOyBjeisrKSB7XG4gICAgICBmb3IgKGxldCBjeCA9IHdvcmxkVG9DaHVua1gobWluWCkgLSAxOyBjeCA8PSB3b3JsZFRvQ2h1bmtYKG1heFgpICsgMTsgY3grKykge1xuICAgICAgICBpZiAoY3ggPj0gMCAmJiBjeiA+PSAwICYmIGN4IDwgQ0hVTktTX1BFUl9TSURFICYmIGN6IDwgQ0hVTktTX1BFUl9TSURFKSB0aGlzLnBpbm5lZC5hZGQoY2h1bmtLZXkoY3gsIGN6KSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IHJlc2lkZW50Q2h1bmtzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLndvcmxkLmNodW5rcy5zaXplOyB9XG4gIGdldCBwZW5kaW5nQ2h1bmtCdWlsZHMoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucGVuZGluZ0NodW5rczsgfVxuICBnZXQgZXZpY3RlZEJ5U3dlZXAoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuc3dlcHRDaHVua3M7IH1cblxuICByZWJ1aWxkQXJvdW5kKHg6IG51bWJlciwgejogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gICAgZm9yIChsZXQgZHogPSAtMTsgZHogPD0gMTsgZHorKykge1xuICAgICAgZm9yIChsZXQgZHggPSAtMTsgZHggPD0gMTsgZHgrKykge1xuICAgICAgICBjb25zdCBrZXkgPSBjaHVua0tleShjeCArIGR4LCBjeiArIGR6KTtcbiAgICAgICAgdGhpcy5tZXNoU3RhbXAuZGVsZXRlKGtleSk7XG4gICAgICAgIGlmICh0aGlzLmxvYWRlZC5oYXMoa2V5KSkgdGhpcy5yZWJ1aWxkQ2h1bmsoa2V5KTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5vbkNodW5rc0NoYW5nZWQ/LigpO1xuICAgIGlmICh0aGlzLm1hY3JvKSB0aGlzLnJlYnVpbGRNYWNybyh0aGlzLm1hY3JvRm9jdXMsIHRoaXMubW9kZSwgdHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIHJlYnVpbGRNYWNybyhmb2N1czogVEhSRUUuVmVjdG9yMywgbW9kZTogVmlld01vZGUsIGZvcmNlOiBib29sZWFuKTogdm9pZCB7XG4gICAgaWYgKCFmb3JjZSAmJiB0aGlzLm1hY3JvTW9kZSA9PT0gbW9kZSkge1xuICAgICAgY29uc3QgbW92ZWQgPSBNYXRoLmh5cG90KGZvY3VzLnggLSB0aGlzLm1hY3JvRm9jdXMueCwgZm9jdXMueiAtIHRoaXMubWFjcm9Gb2N1cy56KTtcbiAgICAgIGlmIChtb2RlID09PSAnbWFwJyB8fCBtb3ZlZCA8PSA0OCkgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBtYWNyb1QwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgaWYgKHRoaXMubWFjcm8pIHtcbiAgICAgIHRoaXMubWFjcm9Hcm91cC5yZW1vdmUodGhpcy5tYWNybyk7XG4gICAgICB0aGlzLm1hY3JvLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgIHRoaXMubWFjcm8gPSBudWxsO1xuICAgIH1cbiAgICBjb25zdCBzdGVwID0gbW9kZSA9PT0gJ21hcCcgPyB0aGlzLm1hcE1hY3JvU3RlcCA6IHRoaXMud29ybGRNYWNyb1N0ZXA7XG4gICAgbGV0IGhvbGU6IE1hY3JvSG9sZSB8IHVuZGVmaW5lZDtcbiAgICBpZiAobW9kZSAhPT0gJ21hcCcpIHtcbiAgICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgICBjb25zdCBjY3ogPSB3b3JsZFRvQ2h1bmtaKE1hdGgucm91bmQoZm9jdXMueikpO1xuICAgICAgaG9sZSA9IHtcbiAgICAgICAgbWluWDogY2h1bmtPcmlnaW5YKGNjeCAtIHRoaXMubmVhclJhZGl1cyksXG4gICAgICAgIG1heFg6IGNodW5rT3JpZ2luWChjY3ggKyB0aGlzLm5lYXJSYWRpdXMpICsgQ0hVTktfU0laRSxcbiAgICAgICAgbWluWjogY2h1bmtPcmlnaW5aKGNjeiAtIHRoaXMubmVhclJhZGl1cyksXG4gICAgICAgIG1heFo6IGNodW5rT3JpZ2luWihjY3ogKyB0aGlzLm5lYXJSYWRpdXMpICsgQ0hVTktfU0laRSxcbiAgICAgIH07XG4gICAgICB0aGlzLmZhcldhdGVySG9sZS52YWx1ZS5zZXQoaG9sZS5taW5YLCBob2xlLm1pblosIGhvbGUubWF4WCwgaG9sZS5tYXhaKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYnVpbGRNYWNyb01lc2godGhpcy53b3JsZCwgeyBzdGVwLCBob2xlIH0pO1xuICAgIHRoaXMubWFjcm8gPSByZXN1bHQubWVzaDtcbiAgICB0aGlzLm1hY3JvVHJpYW5nbGVzID0gcmVzdWx0LnRyaWFuZ2xlcztcbiAgICB0aGlzLm1hY3JvR3JvdXAuYWRkKHJlc3VsdC5tZXNoKTtcbiAgICB0aGlzLm1hY3JvRm9jdXMuY29weShmb2N1cyk7XG4gICAgdGhpcy5tYWNyb01vZGUgPSBtb2RlO1xuICAgIHRoaXMubWFjcm9FZGl0S2V5ID0gbWFjcm9FZGl0S2V5KHRoaXMud29ybGQpO1xuICAgIHJlY29yZFNhbXBsZSh0aGlzLm1hY3JvU2FtcGxlcywgcGVyZm9ybWFuY2Uubm93KCkgLSBtYWNyb1QwKTtcbiAgICBpZiAocmVzdWx0LnNhbXBsZUNhY2hlZCkgdGhpcy5tYWNyb0NhY2hlSGl0cysrO1xuICAgIGVsc2UgcmVjb3JkU2FtcGxlKHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLCByZXN1bHQuc2FtcGxlTXMpO1xuICB9XG5cbiAgZ2V0IGxvYWRlZENodW5rcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5sb2FkZWQuc2l6ZTsgfVxuICBnZXQgbG9hZGVkQ2h1bmtLZXlzKCk6IFJlYWRvbmx5U2V0PHN0cmluZz4geyByZXR1cm4gdGhpcy5sb2FkZWQ7IH1cbiAgZ2V0IG5lYXJUcmlhbmdsZXMoKTogbnVtYmVyIHtcbiAgICBsZXQgdCA9IDA7XG4gICAgZm9yIChjb25zdCB2IG9mIHRoaXMuY2h1bmtzLnZhbHVlcygpKSB0ICs9IHYudHJpYW5nbGVzO1xuICAgIHJldHVybiB0O1xuICB9XG4gIGdldCBtYWNyb1RyaWFuZ2xlQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubWFjcm9UcmlhbmdsZXM7IH1cbiAgZ2V0IGRyYXdDYWxscygpOiBudW1iZXIge1xuICAgIGxldCB3YXRlciA9IDA7XG4gICAgZm9yIChjb25zdCB2IG9mIHRoaXMuY2h1bmtzLnZhbHVlcygpKSBpZiAodi53YXRlcikgd2F0ZXIrKztcbiAgICByZXR1cm4gdGhpcy5sb2FkZWQuc2l6ZSArIHdhdGVyICsgKHRoaXMubWFjcm8gPyAxIDogMCkgKyAxO1xuICB9XG4gIGdldCBuZWFyUmFkaXVzQ2h1bmtzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5lYXJSYWRpdXM7IH1cbiAgLyoqIENsZWFyIHRoZSByb2xsaW5nIHRpbWluZyB3aW5kb3cgYmVmb3JlIGEgbWVhc3VyZW1lbnQgcnVuLiAqL1xuICByZXNldFBlcmYoKTogdm9pZCB7XG4gICAgdGhpcy5jaHVua0dlblNhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLmNodW5rTWVzaFNhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLm1hY3JvU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5tYWNyb0NhY2hlSGl0cyA9IDA7XG4gIH1cbiAgLyoqIFJvbGxpbmcgYnVpbGQgdGltaW5ncyBpbiBtaWxsaXNlY29uZHMsIGZvciB0aGUgcGVyZm9ybWFuY2UgZXZpZGVuY2UuICovXG4gIGdldCBzdHJlYW1QZXJmKCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICAgIHJldHVybiB7XG4gICAgICBjaHVua0dlblA1MDogcGVyY2VudGlsZSh0aGlzLmNodW5rR2VuU2FtcGxlcywgMC41KSxcbiAgICAgIGNodW5rR2VuUDk1OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAwLjk1KSxcbiAgICAgIGNodW5rR2VuTWF4OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAxKSxcbiAgICAgIGNodW5rTWVzaFA1MDogcGVyY2VudGlsZSh0aGlzLmNodW5rTWVzaFNhbXBsZXMsIDAuNSksXG4gICAgICBjaHVua01lc2hQOTU6IHBlcmNlbnRpbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCAwLjk1KSxcbiAgICAgIGNodW5rTWVzaE1heDogcGVyY2VudGlsZSh0aGlzLmNodW5rTWVzaFNhbXBsZXMsIDEpLFxuICAgICAgbWFjcm9QNTA6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZXMsIDAuNSksXG4gICAgICBtYWNyb01heDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlcywgMSksXG4gICAgICBtYWNyb1NhbXBsZVA1MDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcywgMC41KSxcbiAgICAgIG1hY3JvU2FtcGxlTWF4OiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLCAxKSxcbiAgICAgIG1hY3JvQ2FjaGVIaXRzOiB0aGlzLm1hY3JvQ2FjaGVIaXRzLFxuICAgICAgY2h1bmtTYW1wbGVzOiB0aGlzLmNodW5rR2VuU2FtcGxlcy5sZW5ndGgsXG4gICAgICBtYWNyb1NhbXBsZXM6IHRoaXMubWFjcm9TYW1wbGVzLmxlbmd0aCxcbiAgICB9O1xuICB9XG59XG4iLCAiLy8gUmVuZGVyIGxheWVyIFx1MjAxNCBuZWFyIHdhdGVyIHN1cmZhY2VzIGJ1aWx0IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd2F0ZXIgdm94ZWxzLlxuLy9cbi8vIEdlb21ldHJ5IGNvbWVzIGZyb20gdGhlIHZveGVsIHZvbHVtZSAoc28gZWRpdHMsIGR1ZyBwaXRzIGFuZCB0aGUgdjIgbW91bnRhaW5cbi8vIHJpdmVyIGFyZSBleGFjdCkuIEVhY2ggd2F0ZXIgY29sdW1uJ3MgdG9wIGdldHMgYSBxdWFkIGNhcnJ5aW5nOlxuLy8gICBhRmxvdyAgXHUyMDE0IHN1cmZhY2UgY3VycmVudCAoZGlyZWN0aW9uICogc3BlZWQsIG0vcykgZnJvbSBzaW0gSHlkcm9sb2d5LFxuLy8gICBhRGVwdGggXHUyMDE0IHdhdGVyIGRlcHRoIHRvIHRoZSBiZWQgKG1ldHJlcyksXG4vLyAgIGFGb2FtICBcdTIwMTQgc2hvcmUgLyBjYXNjYWRlIGZvYW0gd2VpZ2h0LlxuLy8gV2hlcmUgYSB3YXRlciBzdXJmYWNlIHN0YW5kcyBhYm92ZSBhIGxvd2VyIG5laWdoYm91ciAoYSBjYXNjYWRlIG9yIGZhbGwpLCBhXG4vLyB2ZXJ0aWNhbCBzaGVldCBpcyBlbWl0dGVkIGRvd24gdG8gdGhlIG5laWdoYm91cidzIHN1cmZhY2UuXG4vL1xuLy8gSHlkcm9sb2d5IGlzIHNpbXVsYXRpb24gZGF0YTsgcmlwcGxlcywgZm9hbSBhbmQgdHJhbnNwYXJlbmN5IGhlcmUgYXJlXG4vLyBwcmVzZW50YXRpb24gb25seSBhbmQgbmV2ZXIgZmVlZCBiYWNrIGludG8gc3RhdGUuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQge1xuICBXb3JsZCwgVm94ZWxDaHVuaywgTUFULCBDSFVOS19TSVpFLCBZX01JTiwgWV9NQVgsIGlzU29saWQsXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgZ2V0Vm94ZWwsIGh5ZHJvbG9neUZvcixcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcblxuY29uc3QgTSA9IHBhbGV0dGUubWF0ZXJpYWxzIGFzIFJlY29yZDxzdHJpbmcsIHsgaGV4OiBzdHJpbmcgfT47XG5jb25zdCBIID0gKGs6IHN0cmluZykgPT4gbmV3IFRIUkVFLkNvbG9yKE1ba10uaGV4KTtcblxuLyoqIFNoYXJlZCB0aW1lIHVuaWZvcm0gZm9yIGV2ZXJ5IHdhdGVyIG1hdGVyaWFsLiAqL1xuZXhwb3J0IGNvbnN0IHdhdGVyVGltZSA9IHsgdmFsdWU6IDAgfTtcblxuZnVuY3Rpb24gbWFrZVdhdGVyTWF0ZXJpYWwoKTogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB7XG4gIGNvbnN0IG1hdCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsIHRyYW5zcGFyZW50OiB0cnVlLCBkZXB0aFdyaXRlOiBmYWxzZSwgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgfSk7XG4gIG1hdC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVUaW1lID0gd2F0ZXJUaW1lO1xuICAgIHNoYWRlci51bmlmb3Jtcy51U2hhbGxvdyA9IHsgdmFsdWU6IEgoJ3dhdGVyX3NoYWxsb3cnKSB9O1xuICAgIHNoYWRlci51bmlmb3Jtcy51TWlkID0geyB2YWx1ZTogSCgnd2F0ZXJfbWlkJykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudURlZXAgPSB7IHZhbHVlOiBIKCd3YXRlcl9kZWVwJykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudVJpbSA9IHsgdmFsdWU6IEgoJ3dhdGVyX3JpbScpIH07XG4gICAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxuYXR0cmlidXRlIHZlYzIgYUZsb3c7XG5hdHRyaWJ1dGUgZmxvYXQgYURlcHRoO1xuYXR0cmlidXRlIGZsb2F0IGFGb2FtO1xuYXR0cmlidXRlIGZsb2F0IGFTaGVldDtcbnZhcnlpbmcgdmVjMiB2RmxvdztcbnZhcnlpbmcgZmxvYXQgdkRlcHRoO1xudmFyeWluZyBmbG9hdCB2Rm9hbTtcbnZhcnlpbmcgZmxvYXQgdlNoZWV0O1xudmFyeWluZyB2ZWMzIHZXb3JsZFBvc1c7YClcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsIGAjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxudkZsb3cgPSBhRmxvdzsgdkRlcHRoID0gYURlcHRoOyB2Rm9hbSA9IGFGb2FtOyB2U2hlZXQgPSBhU2hlZXQ7XG52V29ybGRQb3NXID0gKG1vZGVsTWF0cml4ICogdmVjNCh0cmFuc2Zvcm1lZCwgMS4wKSkueHl6O2ApO1xuICAgIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XG51bmlmb3JtIGZsb2F0IHVUaW1lO1xudW5pZm9ybSB2ZWMzIHVTaGFsbG93OyB1bmlmb3JtIHZlYzMgdU1pZDsgdW5pZm9ybSB2ZWMzIHVEZWVwOyB1bmlmb3JtIHZlYzMgdVJpbTtcbnZhcnlpbmcgdmVjMiB2RmxvdztcbnZhcnlpbmcgZmxvYXQgdkRlcHRoO1xudmFyeWluZyBmbG9hdCB2Rm9hbTtcbnZhcnlpbmcgZmxvYXQgdlNoZWV0O1xudmFyeWluZyB2ZWMzIHZXb3JsZFBvc1c7XG5mbG9hdCB3SGFzaCh2ZWMyIHApIHsgcmV0dXJuIGZyYWN0KHNpbihkb3QocCwgdmVjMigxMjcuMSwgMzExLjcpKSkgKiA0Mzc1OC41NDUzKTsgfVxuZmxvYXQgd05vaXNlKHZlYzIgcCkge1xuICB2ZWMyIGkgPSBmbG9vcihwKSwgZiA9IGZyYWN0KHApO1xuICBmID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gIHJldHVybiBtaXgobWl4KHdIYXNoKGkpLCB3SGFzaChpICsgdmVjMigxLCAwKSksIGYueCksIG1peCh3SGFzaChpICsgdmVjMigwLCAxKSksIHdIYXNoKGkgKyB2ZWMyKDEsIDEpKSwgZi54KSwgZi55KTtcbn1gKVxuICAgICAgLnJlcGxhY2UoJ3ZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSwgb3BhY2l0eSApOycsIGBcbmZsb2F0IHNwZWVkID0gbGVuZ3RoKHZGbG93KTtcbi8vIEFkdmVjdCB0aGUgcGF0dGVybiBkb3duc3RyZWFtLiBRdWFudGlzZWQgdG8gMC4yNSBtIGNlbGxzIHNvIHJpcHBsZXMgcmVhZCBhc1xuLy8gYmxvY2stYnVpbHQgZmFjZXRzIHJhdGhlciB0aGFuIHNtb290aCBncmFkaWVudHMuXG52ZWMyIHAgPSB2V29ybGRQb3NXLnh6O1xudmVjMiBhZHYgPSBwIC0gdkZsb3cgKiB1VGltZTtcbnZlYzIgY2VsbCA9IGZsb29yKGFkdiAqIDQuMCkgLyA0LjA7XG5mbG9hdCBuMSA9IHdOb2lzZShjZWxsICogMC41NSk7XG5mbG9hdCBuMiA9IHdOb2lzZShjZWxsICogMS43ICsgdmVjMih1VGltZSAqIDAuMDcsIC11VGltZSAqIDAuMDUpKTtcbmZsb2F0IHJpcHBsZSA9IG4xICogMC42ICsgbjIgKiAwLjQ7XG4vLyBTdGlsbCB3YXRlciAoc2VhLCBsYWtlKSBnZXRzIGEgc2xvdyBzd2VsbCBpbnN0ZWFkIG9mIGEgY3VycmVudC5cbmZsb2F0IHN3ZWxsID0gMC41ICsgMC41ICogc2luKGRvdChwLCB2ZWMyKDAuMTEsIDAuMDcpKSArIHVUaW1lICogMC42KTtcbnJpcHBsZSA9IG1peChtaXgocmlwcGxlLCBzd2VsbCwgMC41KSwgcmlwcGxlLCBjbGFtcChzcGVlZCAqIDIuMCwgMC4wLCAxLjApKTtcbmZsb2F0IGQgPSBjbGFtcCh2RGVwdGggLyA0LjAsIDAuMCwgMS4wKTtcbnZlYzMgd2F0ZXIgPSBtaXgodVNoYWxsb3csIHVNaWQsIHNtb290aHN0ZXAoMC4wLCAwLjUsIGQpKTtcbndhdGVyID0gbWl4KHdhdGVyLCB1RGVlcCwgc21vb3Roc3RlcCgwLjUsIDEuMCwgZCkpO1xud2F0ZXIgKj0gMC45ICsgMC4yICogcmlwcGxlO1xuLy8gU3RyZWFrcyBhbG9uZyBmYXN0IGN1cnJlbnQsIGZvYW0gYXQgc2hvcmVzIGFuZCBjYXNjYWRlcy5cbmZsb2F0IHN0cmVhayA9IHN0ZXAoMC43OCAtIGNsYW1wKHNwZWVkICogMC4wNiwgMC4wLCAwLjIpLCBuMikgKiBjbGFtcChzcGVlZCAqIDAuNSwgMC4wLCAxLjApO1xuZmxvYXQgZm9hbU5vaXNlID0gc3RlcCgwLjQ1LCB3Tm9pc2UoY2VsbCAqIDIuMyArIHVUaW1lICogMC4zKSk7XG5mbG9hdCBmb2FtID0gY2xhbXAodkZvYW0gKiBmb2FtTm9pc2UgKyBzdHJlYWsgKiAwLjYsIDAuMCwgMS4wKTtcbi8vIEZhbGxpbmcgc2hlZXRzOiBmYXN0IHZlcnRpY2FsIHN0cmVha3MuXG5pZiAodlNoZWV0ID4gMC41KSB7XG4gIGZsb2F0IGZhbGwgPSB3Tm9pc2UodmVjMihmbG9vcih2V29ybGRQb3NXLnggKiA0LjAgKyB2V29ybGRQb3NXLnogKiA0LjApLCBmbG9vcigodldvcmxkUG9zVy55ICsgdVRpbWUgKiAzLjUpICogMy4wKSkpO1xuICBmb2FtID0gbWF4KGZvYW0sIHN0ZXAoMC4zNSwgZmFsbCkpO1xufVxudmVjMyBjb2wgPSBtaXgod2F0ZXIsIHVSaW0gKiAxLjA4LCBmb2FtKTtcbmZsb2F0IGFscGhhID0gbWl4KDAuNTUsIDAuOSwgc21vb3Roc3RlcCgwLjQsIDMuMCwgdkRlcHRoKSk7XG5hbHBoYSA9IG1heChhbHBoYSwgZm9hbSAqIDAuOTUpO1xuaWYgKHZTaGVldCA+IDAuNSkgYWxwaGEgPSBtYXgoYWxwaGEsIDAuODIpO1xudmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlICogY29sLCBhbHBoYSAqIG9wYWNpdHkgKTtgKTtcbiAgfTtcbiAgcmV0dXJuIG1hdDtcbn1cblxuZXhwb3J0IGNvbnN0IG5lYXJXYXRlck1hdGVyaWFsID0gbWFrZVdhdGVyTWF0ZXJpYWwoKTtcblxuLyoqIE1lc2ggdGhlIHdhdGVyIHN1cmZhY2VzIG9mIG9uZSBjaHVuazsgbnVsbCB3aGVuIHRoZSBjaHVuayBob2xkcyBubyB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNoQ2h1bmtXYXRlcih3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogVEhSRUUuTWVzaCB8IG51bGwge1xuICBjb25zdCBoeWRybyA9IGh5ZHJvbG9neUZvcih3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBsZXZlbHMgPSBuZXcgSW50MTZBcnJheShDSFVOS19TSVpFICogQ0hVTktfU0laRSkuZmlsbCgtOTk5OSk7XG4gIGNvbnN0IGJlZHMgPSBuZXcgSW50MTZBcnJheShDSFVOS19TSVpFICogQ0hVTktfU0laRSk7XG5cbiAgLy8gV2F0ZXIgc3VyZmFjZSBwZXIgY29sdW1uOiB0aGUgZmlyc3Qgbm9uLXdhdGVyIGNlbGwgYWJvdmUgdGhlIHdhdGVyIHRoYXRcbiAgLy8gc3RhbmRzIG9uIHRoaXMgY29sdW1uJ3Mgc29saWQgc3VyZmFjZS5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb25zdCBiZWQgPSBjaHVuay5oZWlnaHRzW2NvbF0gKyBZX01JTiArIDE7XG4gICAgICBsZXQgeSA9IGJlZDtcbiAgICAgIHdoaWxlICh5IDwgWV9NQVggJiYgY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9PT0gTUFULldBVEVSKSB5Kys7XG4gICAgICBpZiAoeSA+IGJlZCkgeyBsZXZlbHNbY29sXSA9IHk7IGJlZHNbY29sXSA9IGJlZDsgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBvczogbnVtYmVyW10gPSBbXSwgbnJtOiBudW1iZXJbXSA9IFtdLCBjbHI6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGZsb3c6IG51bWJlcltdID0gW10sIGRlcHRoOiBudW1iZXJbXSA9IFtdLCBmb2FtOiBudW1iZXJbXSA9IFtdLCBzaGVldDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgaWR4OiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBwdXNoID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG54OiBudW1iZXIsIG55OiBudW1iZXIsIG56OiBudW1iZXIsXG4gICAgZng6IG51bWJlciwgZno6IG51bWJlciwgZGVwOiBudW1iZXIsIGZvOiBudW1iZXIsIHNoOiBudW1iZXIpID0+IHtcbiAgICBwb3MucHVzaCh4LCB5LCB6KTsgbnJtLnB1c2gobngsIG55LCBueik7IGNsci5wdXNoKDEsIDEsIDEpO1xuICAgIGZsb3cucHVzaChmeCwgZnopOyBkZXB0aC5wdXNoKGRlcCk7IGZvYW0ucHVzaChmbyk7IHNoZWV0LnB1c2goc2gpO1xuICB9O1xuICBjb25zdCBxdWFkID0gKGJhc2U6IG51bWJlcikgPT4geyBpZHgucHVzaChiYXNlLCBiYXNlICsgMSwgYmFzZSArIDIsIGJhc2UsIGJhc2UgKyAyLCBiYXNlICsgMyk7IH07XG5cbiAgY29uc3QgbGV2ZWxBdCA9ICh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHJldHVybiBsZXZlbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgIC8vIE5laWdoYm91ciBjaHVuazogcmVhZCB0aGUgdm94ZWxzIChjaHVua3MgYXJlIGdlbmVyYXRlZCBpbiAzeDMgcmluZ3MgZm9yIG1lc2hpbmcpLlxuICAgIGxldCB5ID0gWV9NQVggLSAxO1xuICAgIHdoaWxlICh5ID4gWV9NSU4gJiYgIWlzU29saWQoZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikpICYmIGdldFZveGVsKHdvcmxkLCB3eCwgeSwgd3opICE9PSBNQVQuV0FURVIpIHktLTtcbiAgICByZXR1cm4gZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikgPT09IE1BVC5XQVRFUiA/IHkgKyAxIDogLTk5OTk7XG4gIH07XG5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb25zdCBsZXZlbCA9IGxldmVsc1tjb2xdO1xuICAgICAgaWYgKGxldmVsID09PSAtOTk5OSkgY29udGludWU7XG4gICAgICBjb25zdCB4ID0gb3ggKyBseCwgeiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBmID0gaHlkcm8uZmxvd0F0KHggKyAwLjUsIHogKyAwLjUsIGxldmVsKTtcbiAgICAgIGNvbnN0IGZ4ID0gZi5keCAqIGYuc3BlZWQsIGZ6ID0gZi5keiAqIGYuc3BlZWQ7XG4gICAgICBjb25zdCBkZXAgPSBsZXZlbCAtIGJlZHNbY29sXTtcbiAgICAgIGxldCBzaG9yZSA9IDA7XG4gICAgICBjb25zdCBzaWRlczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWzEsIDBdLCBbLTEsIDBdLCBbMCwgMV0sIFswLCAtMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBzaWRlcykge1xuICAgICAgICBjb25zdCBtID0gZ2V0Vm94ZWwod29ybGQsIHggKyBkeCwgbGV2ZWwgLSAxLCB6ICsgZHopO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgc2hvcmUgPSAxO1xuICAgICAgfVxuICAgICAgY29uc3QgeSA9IGxldmVsIC0gMC4xO1xuICAgICAgY29uc3QgYmFzZSA9IHBvcy5sZW5ndGggLyAzO1xuICAgICAgY29uc3QgZm8gPSBNYXRoLm1heChzaG9yZSAqIDAuNjUsIE1hdGgubWluKDEsIGYuc3BlZWQgLyAzLjUpKTtcbiAgICAgIHB1c2goeCwgeSwgeiwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCwgeSwgeiArIDEsIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBwdXNoKHggKyAxLCB5LCB6ICsgMSwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCArIDEsIHksIHosIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBxdWFkKGJhc2UpO1xuXG4gICAgICAvLyBDYXNjYWRlIHNoZWV0cyB0b3dhcmQgbG93ZXIgd2F0ZXIgKG9yIG9wZW4gYWlyKSBvbiBhbnkgc2lkZS5cbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2Ygc2lkZXMpIHtcbiAgICAgICAgY29uc3QgbkxldmVsID0gbGV2ZWxBdCh4ICsgZHgsIHogKyBkeiwgbHggKyBkeCwgbHogKyBkeik7XG4gICAgICAgIGlmIChuTGV2ZWwgPT09IC05OTk5IHx8IG5MZXZlbCA+PSBsZXZlbCkgY29udGludWU7XG4gICAgICAgIGlmIChpc1NvbGlkKGdldFZveGVsKHdvcmxkLCB4ICsgZHgsIGxldmVsIC0gMSwgeiArIGR6KSkpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB0b3AgPSBsZXZlbCAtIDAuMSwgYm90dG9tID0gbkxldmVsIC0gMC4xO1xuICAgICAgICBjb25zdCBiID0gcG9zLmxlbmd0aCAvIDM7XG4gICAgICAgIC8vIEZhY2Ugb24gdGhlIHNoYXJlZCBlZGdlLCBvcmllbnRlZCB0b3dhcmQgdGhlIGxvd2VyIG5laWdoYm91ci5cbiAgICAgICAgY29uc3QgZXggPSBkeCA+IDAgPyB4ICsgMSA6IGR4IDwgMCA/IHggOiB4LCBleiA9IGR6ID4gMCA/IHogKyAxIDogZHogPCAwID8geiA6IHo7XG4gICAgICAgIGlmIChkeCAhPT0gMCkge1xuICAgICAgICAgIHB1c2goZXgsIHRvcCwgeiwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goZXgsIHRvcCwgeiArIDEsIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKGV4LCBib3R0b20sIHogKyAxLCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaChleCwgYm90dG9tLCB6LCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHVzaCh4LCB0b3AsIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaCh4ICsgMSwgdG9wLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goeCArIDEsIGJvdHRvbSwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKHgsIGJvdHRvbSwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgfVxuICAgICAgICBxdWFkKGIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAoaWR4Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUocG9zLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShucm0sIDMpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoY2xyLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRmxvdycsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGZsb3csIDIpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FEZXB0aCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGRlcHRoLCAxKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRm9hbScsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGZvYW0sIDEpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FTaGVldCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHNoZWV0LCAxKSk7XG4gIGcuc2V0SW5kZXgoaWR4KTtcbiAgZy5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGcsIG5lYXJXYXRlck1hdGVyaWFsKTtcbiAgbWVzaC5uYW1lID0gYHdhdGVyX2NodW5rXyR7Y2h1bmsuY3h9XyR7Y2h1bmsuY3p9YDtcbiAgbWVzaC5yZW5kZXJPcmRlciA9IDI7XG4gIG1lc2gudXNlckRhdGEud2F0ZXJUcmlhbmdsZXMgPSBpZHgubGVuZ3RoIC8gMztcbiAgcmV0dXJuIG1lc2g7XG59XG5cbi8qKlxuICogQ3V0IGEgcmVjdGFuZ3VsYXIgaG9sZSBpbiB0aGUgZmFyIChvcGFxdWUpIHNlYSBwbGFuZSB3aGVyZSBuZWFyIGNodW5rcyBkcmF3XG4gKiB0aGVpciBvd24gdHJhbnNwYXJlbnQgd2F0ZXIsIHNvIHNoYWxsb3dzIHNob3cgdGhlIHJlYWwgYmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEZhcldhdGVySG9sZShtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpOiB7IHZhbHVlOiBUSFJFRS5WZWN0b3I0IH0ge1xuICBjb25zdCBob2xlID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjQoMCwgMCwgMCwgMCkgfTtcbiAgbWF0ZXJpYWwub25CZWZvcmVDb21waWxlID0gKHNoYWRlcikgPT4ge1xuICAgIHNoYWRlci51bmlmb3Jtcy51SG9sZSA9IGhvbGU7XG4gICAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsICcjaW5jbHVkZSA8Y29tbW9uPlxcbnZhcnlpbmcgdmVjMiB2RmFyWFo7JylcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsICcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbnZGYXJYWiA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh6OycpO1xuICAgIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxudW5pZm9ybSB2ZWM0IHVIb2xlO1xcbnZhcnlpbmcgdmVjMiB2RmFyWFo7JylcbiAgICAgIC5yZXBsYWNlKCd2ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnLFxuICAgICAgICAnaWYgKHZGYXJYWi54ID4gdUhvbGUueCAmJiB2RmFyWFoueCA8IHVIb2xlLnogJiYgdkZhclhaLnkgPiB1SG9sZS55ICYmIHZGYXJYWi55IDwgdUhvbGUudykgZGlzY2FyZDtcXG52ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnKTtcbiAgfTtcbiAgcmV0dXJuIGhvbGU7XG59XG4iLCAie1xuICBcInNjaGVtYVwiOiBcInBhbGV0dGVfdjJcIixcbiAgXCJkYXRlXCI6IFwiMjAyNi0xMC0yMlwiLFxuICBcInN0YXR1c1wiOiBcInByb3Bvc2VkXCIsXG4gIFwic291cmNlXCI6IFwiUkVGLTAwMiAoaHlicmlkIHdvcmxkIHJlZmVyZW5jZSksIHZhbHVlcyBzYW1wbGVkIGJ5IGV5ZTsgbnVtZXJpYyB2ZXJpZmljYXRpb24gcGVuZGluZ1wiLFxuICBcIm5vdGVcIjogXCJPbmUgbWF0ZXJpYWwgcGFsZXR0ZS4gVGltZSBvZiBkYXkgaXMgZXhwcmVzc2VkIGJ5IHRoZSBsaWdodGluZyBwcmVzZXRzIGJlbG93LCBub3QgYnkgcmVwYWludGluZyBtYXRlcmlhbHMuXCIsXG4gIFwibWF0ZXJpYWxzXCI6IHtcbiAgICBcImdyYXNzX3RvcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM3OUI5NENcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBsb3cgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfaGlnaFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4RkM5NUVcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBtaWQgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfcGVha1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QUQwNkFcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBoaWdoIGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX2NhcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RTk0NDBcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjAtMC40IG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX29jaHJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M5OUE1RlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuNC0wLjYyIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX3J1c3RcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjQ2MzNDXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC42Mi0wLjgwIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RvbmVfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiYmFyZSBzdG9uZSB0b3Agc3VyZmFjZVwiXG4gICAgfSxcbiAgICBcInN0b25lX2JvZHlfYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEQ0QzQkVcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYm9keSwgZXZlbiA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QxQzdBRlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBvZGQgNC41IG0gYmFuZFwiXG4gICAgfSxcbiAgICBcInN0b25lX3NoYWRlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I5QUU5NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY3JldmljZSAvIHJlY2Vzc2VkIHN0b25lIGFjY2VudFwiXG4gICAgfSxcbiAgICBcInNhbmRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTNEM0E2XCIsXG4gICAgICBcInJvbGVcIjogXCJzaG9yZSBjZWxsc1wiXG4gICAgfSxcbiAgICBcInNub3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRUVGMUY1XCIsXG4gICAgICBcInJvbGVcIjogXCJnZW5lcmF0b3IgdjIgc25vd2ZpZWxkcyBhYm92ZSB0aGUgc25vd2xpbmUgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3NraW5cIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDlBNzdFXCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgc2tpbiAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHVuaWNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjM0QTNDXCIsXG4gICAgICBcInJvbGVcIjogXCJmb3VuZGVyIHR1bmljLCB3YXJtIHJlZCBhY2NlbnQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3R1bmljX2FsdFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRThDODZcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2VyIHR1bmljLCB0ZWFsIGFjY2VudCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHJvdXNlcnNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUI0NjM2XCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgdHJvdXNlcnMgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX2hhaXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEEzMzI0XCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgaGFpciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfYm9vdHNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMzMyODFGXCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgYm9vdHMgYW5kIGJlbHQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9kZWVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhDNUIzQVwiLFxuICAgICAgXCJyb2xlXCI6IFwicmVkIGRlZXIgY29hdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2xpZ2h0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0RDQzdBNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiZGVlciBiZWxseSwgaGFyZSB0YWlsLCBhbnRsZXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9oYXJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlBODY3MFwiLFxuICAgICAgXCJyb2xlXCI6IFwiaGFyZSBjb2F0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfdHJvdXRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkY3RjVFXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cm91dCBiYWNrIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfdHJvdXRfYmVsbHlcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDhDOUEzXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cm91dCBiZWxseSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfcGxhc3RlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFOEREQzZcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2Ugd2FsbCBwbGFzdGVyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aW1iZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkE0NTMwXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHRpbWJlciBmcmFtZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGltYmVyX2xpZ2h0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhBNjE0MlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSBwbGFua3MgYW5kIGRvb3JzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aGF0Y2hcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzdBMjU3XCIsXG4gICAgICBcInJvbGVcIjogXCJ0aGF0Y2ggcm9vZiAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGhhdGNoX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUM3QjNDXCIsXG4gICAgICBcInJvbGVcIjogXCJ0aGF0Y2ggcm9vZiBzaGFkZSBjb3Vyc2UgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3N0b25lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlCOUE5MVwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSBtYXNvbnJ5IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9zdG9uZV9kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzc0NzM2Q1wiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSBtYXNvbnJ5IGpvaW50cyBhbmQgcGxpbnRoIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwicHJvcF9pcm9uXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBM0EzRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiaXJvbiBmaXR0aW5ncyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcInByb3BfZ2xvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGRkQyN0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImxhbnRlcm4gbGlnaHQgKGVtaXNzaXZlLCBlZmZlY3Qgb25seSkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9zaGFsbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzY3Q0ZEOFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggPD0gMC41IG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9taWRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0FBRkM0XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCB+MS41IG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9kZWVwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJBOEZBOFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggPj0gNC4wIG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9yaW1cIjoge1xuICAgICAgXCJoZXhcIjogXCIjQkZFQUYwXCIsXG4gICAgICBcInJvbGVcIjogXCJzaG9yZWxpbmUgcmltIC8gZm9hbSB0aW50XCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2FcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUZBODNGXCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RkI4NEFcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2NcIjoge1xuICAgICAgXCJoZXhcIjogXCIjN0ZDMzU2XCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIGhpZ2hsaWdodCBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X3BpbmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRjJBNkM0XCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIGFjY2VudCBzcGVjaWVzIG9ubHlcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua19iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U4OEZCMlwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmxvc3NvbSBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwidHJ1bmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkI0QTMzXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cmVlIHRydW5rc1wiXG4gICAgfSxcbiAgICBcImJhcmtfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM0RTM2MjZcIixcbiAgICAgIFwicm9sZVwiOiBcInRydW5rIHNoYWRlLCBzdHVtcHNcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM3QjVBRDZcIixcbiAgICAgIFwicm9sZVwiOiBcIm9yZSBkZXBvc2l0IGFjY2VudCAocHJvcG9zZWQsIHJlcGxhY2VzIHRlYWwpXCJcbiAgICB9LFxuICAgIFwib3JlX2NyeXN0YWxfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QjdCRThcIixcbiAgICAgIFwicm9sZVwiOiBcIm9yZSBoaWdobGlnaHQgZmFjZXRcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkRGQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcIk5veGVsIGFyY2hpdGVjdHVyZSBtYWluIHN0b25lXCJcbiAgICB9LFxuICAgIFwibm94ZWxfc3RvbmVfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEM0M5QjRcIixcbiAgICAgIFwicm9sZVwiOiBcIk5veGVsIHNlY29uZGFyeSBzdG9uZSAvIHJlY2Vzc1wiXG4gICAgfSxcbiAgICBcImFjY2VudF9ibHVlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNFN0ZCOFwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmFubmVyIC8gY2xvdGggYWNjZW50XCJcbiAgICB9LFxuICAgIFwiYWNjZW50X3RlYWxcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkZBNkEwXCIsXG4gICAgICBcInJvbGVcIjogXCJzZWNvbmRhcnkgYWNjZW50XCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfZmlyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNGRjlFNEFcIixcbiAgICAgIFwicm9sZVwiOiBcImNhbXBmaXJlIC8gd2FybSBlbWlzc2l2ZSAoZWZmZWN0cyBvbmx5KVwiXG4gICAgfSxcbiAgICBcImVtaXNzaXZlX21hZ2ljXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QyNEJGRlwiLFxuICAgICAgXCJyb2xlXCI6IFwicmVzZXJ2ZWQ6IG1hZ2ljIGVmZmVjdHMgb25seSwgbmV2ZXIgbWF0ZXJpYWxzXCJcbiAgICB9XG4gIH0sXG4gIFwibGlnaHRpbmdcIjoge1xuICAgIFwiZGF3blwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiAxMixcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAxMDUsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGQzc5QVwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi4yLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzhGQTZDOFwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzRFNUY2RVwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDAuNixcbiAgICAgIFwic2t5XCI6IFwiI0E4QkVENlwiLFxuICAgICAgXCJmb2dcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMVxuICAgIH0sXG4gICAgXCJub29uXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDM4LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDUwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkY0RENcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDIuNzUsXG4gICAgICBcImhlbWlTa3lcIjogXCIjQkZEOUYyXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjN0E4RjU1XCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC41NSxcbiAgICAgIFwic2t5XCI6IFwiIzlFRDJFRVwiLFxuICAgICAgXCJmb2dcIjogXCIjRENFRkY4XCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDI4LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjA1XG4gICAgfSxcbiAgICBcImR1c2tcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogOSxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAyNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGQjI3QVwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMy4yLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzhFN0M5RVwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzVBNEE1MFwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDEuMSxcbiAgICAgIFwic2t5XCI6IFwiI0M5OEU4NlwiLFxuICAgICAgXCJmb2dcIjogXCIjQzA5MDhBXCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDM2LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjMyXG4gICAgfSxcbiAgICBcIm5pZ2h0XCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDQwLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDIyMCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjQUZDOEZGXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAxLjAsXG4gICAgICBcImhlbWlTa3lcIjogXCIjM0E0QzdBXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjMUMyNTQwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4wNSxcbiAgICAgIFwic2t5XCI6IFwiIzEwMTczNlwiLFxuICAgICAgXCJmb2dcIjogXCIjMTUxQzNDXCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDQ1LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjVcbiAgICB9XG4gIH1cbn0iLCAiLy8gVm94ZWwgZmFjZSBjb2xvdXJzIGFuZCBrZXlzIHNoYXJlZCBieSB0aGUgbWFpbi10aHJlYWQgdGVycmFpbiB2aWV3IGFuZCB0aGVcbi8vIGNodW5rIHdvcmtlci4gUHVyZSBkYXRhICsgVEhSRUUuQ29sb3IgbWF0aCAobm8gV2ViR0wgb2JqZWN0cykuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBNQVQsIGhhc2gyaSB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5cbmV4cG9ydCBjb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmV4cG9ydCBjb25zdCBIID0gKGs6IHN0cmluZykgPT4gTVtrXS5oZXg7XG5cbmV4cG9ydCBjb25zdCBjb2xvckNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRIUkVFLkNvbG9yPigpO1xuZXhwb3J0IGZ1bmN0aW9uIGMoaGV4OiBzdHJpbmcpOiBUSFJFRS5Db2xvciB7XG4gIGxldCBvdXQgPSBjb2xvckNhY2hlLmdldChoZXgpO1xuICBpZiAoIW91dCkgeyBvdXQgPSBuZXcgVEhSRUUuQ29sb3IoaGV4KTsgY29sb3JDYWNoZS5zZXQoaGV4LCBvdXQpOyB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBjb25zdCBDT0wgPSB7XG4gIGdyYXNzVG9wOiBbYyhIKCdncmFzc190b3AnKSksIGMoSCgnZ3Jhc3NfaGlnaCcpKSwgYyhIKCdncmFzc19wZWFrJykpXSxcbiAgZ3Jhc3NDYXA6IGMoSCgnZ3Jhc3NfY2FwJykpLFxuICBzb2lsOiBjKEgoJ3N0cmF0YV9vY2hyZScpKS5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDAuNzgpLFxuICBvY2hyZTogYyhIKCdzdHJhdGFfb2NocmUnKSksXG4gIHJ1c3Q6IGMoSCgnc3RyYXRhX3J1c3QnKSksXG4gIHN0b25lVG9wOiBjKEgoJ3N0b25lX3RvcCcpKSxcbiAgc3RvbmVBOiBjKEgoJ3N0b25lX2JvZHlfYScpKSxcbiAgc3RvbmVCOiBjKEgoJ3N0b25lX2JvZHlfYicpKSxcbiAgc3RvbmVTaGFkZTogYyhIKCdzdG9uZV9zaGFkZScpKSxcbiAgc2FuZDogYyhIKCdzYW5kJykpLFxuICBncmF2ZWw6IGMoSCgnc3RvbmVfYm9keV9iJykpLmNsb25lKCkubGVycChjKEgoJ3NhbmQnKSksIDAuMzUpLFxuICBvcmU6IGMoSCgnb3JlX2NyeXN0YWwnKSksXG4gIG1vc3M6IGMoSCgnZ3Jhc3NfY2FwJykpLmNsb25lKCkubGVycChjKEgoJ3N0b25lX2JvZHlfYicpKSwgMC4zNSksXG4gIHNub3c6IGMoSCgnc25vdycpKSxcbiAgc25vd1NoYWRlOiBjKEgoJ3Nub3cnKSkuY2xvbmUoKS5sZXJwKGMoSCgnc3RvbmVfc2hhZGUnKSksIDAuMzUpLFxuICB3YXRlclJpbTogYyhIKCd3YXRlcl9yaW0nKSksXG4gIHdhdGVyU2hhbGxvdzogYyhIKCd3YXRlcl9zaGFsbG93JykpLFxuICB3YXRlck1pZDogYyhIKCd3YXRlcl9taWQnKSksXG4gIHdhdGVyRGVlcDogYyhIKCd3YXRlcl9kZWVwJykpLFxufTtcblxuZXhwb3J0IGNvbnN0IFNIQURFID0gWzAuOTAsIDAuOTYsIDEuMCwgMS4wNF07XG5cbi8vIEtlZXAgYSBzbWFsbCByb2xsaW5nIHdpbmRvdyBvZiBidWlsZCB0aW1pbmdzIGZvciB0aGUgcGVyZm9ybWFuY2UgZXZpZGVuY2UuXG4vLyBUaGVzZSBhcmUgaW5zdHJ1bWVudGF0aW9uLCBub3Qgc2ltdWxhdGlvbiBzdGF0ZS5cbmV4cG9ydCBjb25zdCBNQVhfUEVSRl9TQU1QTEVTID0gMTI4O1xuZXhwb3J0IGZ1bmN0aW9uIHJlY29yZFNhbXBsZShzYW1wbGVzOiBudW1iZXJbXSwgbXM6IG51bWJlcik6IHZvaWQge1xuICBzYW1wbGVzLnB1c2gobXMpO1xuICBpZiAoc2FtcGxlcy5sZW5ndGggPiBNQVhfUEVSRl9TQU1QTEVTKSBzYW1wbGVzLnNoaWZ0KCk7XG59XG5leHBvcnQgZnVuY3Rpb24gcGVyY2VudGlsZShzYW1wbGVzOiBudW1iZXJbXSwgcDogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHNhbXBsZXMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcbiAgY29uc3Qgc29ydGVkID0gWy4uLnNhbXBsZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgY29uc3QgaSA9IE1hdGgubWluKHNvcnRlZC5sZW5ndGggLSAxLCBNYXRoLm1heCgwLCBNYXRoLmNlaWwocCAqIHNvcnRlZC5sZW5ndGgpIC0gMSkpO1xuICByZXR1cm4gTWF0aC5yb3VuZChzb3J0ZWRbaV0gKiAxMDApIC8gMTAwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QmFuZCh5OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4geSA+PSA0NSA/IDIgOiB5ID49IDE4ID8gMSA6IDA7XG59XG5leHBvcnQgZnVuY3Rpb24gc3RvbmVUb25lKHk6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoKHkgKyA2NCkgPj4gMykgJiAxO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHNoYWRlQXQoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3ggPSBNYXRoLmZsb29yKHggLyAyKSArIE1hdGguZmxvb3IoeSAvIDMpICogMTc7XG4gIGNvbnN0IHN6ID0gTWF0aC5mbG9vcih6IC8gMik7XG4gIHJldHVybiBNYXRoLmZsb29yKGhhc2gyaShzeCwgc3osIHNlZWQgKyAzMDApICogNCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBrZXlGb3IobWF0OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgc2hhZGU6IG51bWJlciwgYXhpczogbnVtYmVyLCBkaXI6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAobWF0ICYgMTUpIHwgKCh2YXJpYW50ICYgMTUpIDw8IDQpIHwgKChzaGFkZSAmIDMpIDw8IDgpIHwgKChheGlzICYgMykgPDwgMTApIHwgKChkaXIgPiAwID8gMSA6IDApIDw8IDEyKTtcbn1cblxuZXhwb3J0IGNvbnN0IGZhY2VDb2xvckNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRIUkVFLkNvbG9yPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gY29sb3JGb3JLZXkoa2V5OiBudW1iZXIpOiBUSFJFRS5Db2xvciB7XG4gIGNvbnN0IGNhY2hlZCA9IGZhY2VDb2xvckNhY2hlLmdldChrZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBtYXQgPSBrZXkgJiAxNTtcbiAgY29uc3QgdmFyaWFudCA9IChrZXkgPj4gNCkgJiAxNTtcbiAgY29uc3Qgc2hhZGUgPSAoa2V5ID4+IDgpICYgMztcbiAgY29uc3QgYXhpcyA9IChrZXkgPj4gMTApICYgMztcbiAgY29uc3QgZGlyID0gKGtleSA+PiAxMikgJiAxO1xuICBsZXQgY29sb3I6IFRIUkVFLkNvbG9yO1xuXG4gIGlmIChheGlzID09PSAxICYmIGRpciA9PT0gMSkge1xuICAgIGNvbnN0IGhiID0gTWF0aC5taW4oMiwgdmFyaWFudCAmIDMpO1xuICAgIGlmIChtYXQgPT09IE1BVC5HUkFTUykgY29sb3IgPSBDT0wuZ3Jhc3NUb3BbaGJdO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULlNBTkQpIGNvbG9yID0gQ09MLnNhbmQ7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuR1JBVkVMKSBjb2xvciA9IENPTC5ncmF2ZWw7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuU09JTCkgY29sb3IgPSBDT0wub2NocmU7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuT1JFKSBjb2xvciA9IENPTC5vcmU7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuTU9TUykgY29sb3IgPSBDT0wubW9zcztcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5TTk9XKSBjb2xvciA9IENPTC5zbm93O1xuICAgIGVsc2UgY29sb3IgPSBDT0wuc3RvbmVUb3A7XG4gIH0gZWxzZSBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPT09IDApIHtcbiAgICBjb2xvciA9IENPTC5zdG9uZVNoYWRlO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGRlcHRoID0gdmFyaWFudCAmIDc7XG4gICAgY29uc3QgdG9uZSA9ICh2YXJpYW50ID4+IDMpICYgMTtcbiAgICBjb25zdCBib2R5ID0gdG9uZSA/IENPTC5zdG9uZUIgOiBDT0wuc3RvbmVBO1xuICAgIGlmIChtYXQgPT09IE1BVC5HUkFTUyB8fCBtYXQgPT09IE1BVC5NT1NTKSB7XG4gICAgICBpZiAoZGVwdGggPT09IDApIGNvbG9yID0gbWF0ID09PSBNQVQuTU9TUyA/IENPTC5tb3NzIDogQ09MLmdyYXNzQ2FwO1xuICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgY29sb3IgPSBDT0wuc29pbDtcbiAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAzKSBjb2xvciA9IENPTC5ydXN0O1xuICAgICAgZWxzZSBjb2xvciA9IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TT0lMKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc29pbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TQU5EKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc2FuZCA6IGRlcHRoID09PSAyID8gQ09MLm9jaHJlIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkdSQVZFTCkge1xuICAgICAgY29sb3IgPSBkZXB0aCA8PSAxID8gQ09MLmdyYXZlbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5PUkUpIHtcbiAgICAgIGNvbG9yID0gQ09MLm9yZTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULlNOT1cpIHtcbiAgICAgIGNvbG9yID0gZGVwdGggPT09IDAgPyBDT0wuc25vd1NoYWRlIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkJFRFJPQ0spIHtcbiAgICAgIGNvbG9yID0gQ09MLnN0b25lU2hhZGU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbG9yID0gYm9keTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvdXQgPSBjb2xvci5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKFNIQURFW3NoYWRlXSk7XG4gIGZhY2VDb2xvckNhY2hlLnNldChrZXksIG91dCk7XG4gIHJldHVybiBvdXQ7XG59XG4iLCAiLy8gUHVyZSBncmVlZHkgdm94ZWwgbWVzaGVyIG92ZXIgYSBwYWRkZWQgY2h1bmsgdm9sdW1lLiBObyBXb3JsZCBhY2Nlc3MgYW5kIG5vXG4vLyBXZWJHTCBvYmplY3RzLCBzbyBpdCBydW5zIGlkZW50aWNhbGx5IG9uIHRoZSBtYWluIHRocmVhZCBhbmQgaW4gYSB3b3JrZXIuXG4vL1xuLy8gUGFkZGVkIGxheW91dDogeCBhbmQgeiBydW4gZnJvbSAtMSB0byBDSFVOS19TSVpFICgzNCBjZWxscykgc28gZmFjZXMgb24gY2h1bmtcbi8vIGJvcmRlcnMgY2FuIHNlZSB0aGVpciBuZWlnaGJvdXJzOyB5IHJ1bnMgb3ZlciB0aGUgZnVsbCB3b3JsZCBoZWlnaHQuIE91dCBvZlxuLy8gcmFuZ2UgeSBzYW1wbGVzIGFyZSBiZWRyb2NrIGJlbG93IGFuZCBhaXIgYWJvdmUsIGFzIGluIGdldFZveGVsLlxuaW1wb3J0IHtcbiAgQ0hVTktfU0laRSwgV09STERfSEVJR0hULCBZX01JTiwgTUFULCBpc09wYXF1ZSwgbG9jYWxJbmRleCxcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IGNvbG9yRm9yS2V5LCBoZWlnaHRCYW5kLCBrZXlGb3IsIHNoYWRlQXQsIHN0b25lVG9uZSB9IGZyb20gJy4vdm94ZWwtY29sb3JzJztcblxuZXhwb3J0IGNvbnN0IFBBRCA9IENIVU5LX1NJWkUgKyAyO1xuZXhwb3J0IGNvbnN0IFBBRERFRF9WT0xVTUUgPSBQQUQgKiBQQUQgKiBXT1JMRF9IRUlHSFQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVzaEFycmF5cyB7XG4gIHBvc2l0aW9uczogRmxvYXQzMkFycmF5O1xuICBub3JtYWxzOiBGbG9hdDMyQXJyYXk7XG4gIGNvbG9yczogRmxvYXQzMkFycmF5O1xuICBtYXRzOiBGbG9hdDMyQXJyYXk7XG4gIGluZGljZXM6IFVpbnQzMkFycmF5O1xuICB0cmlhbmdsZXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IHBhZGRlZEluZGV4ID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgPT5cbiAgKHggKyAxKSArICh6ICsgMSkgKiBQQUQgKyB5ICogUEFEICogUEFEO1xuXG4vKiogQ29weSBhIGNodW5rIGFuZCBpdHMgb25lLWNlbGwgYm9yZGVyIGludG8gYSBwYWRkZWQgdm9sdW1lLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUGFkZGVkKFxuICBkYXRhOiBVaW50OEFycmF5LFxuICBuZWlnaGJvdXI6IChseDogbnVtYmVyLCB5OiBudW1iZXIsIGx6OiBudW1iZXIpID0+IG51bWJlcixcbik6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBvdXQgPSBuZXcgVWludDhBcnJheShQQURERURfVk9MVU1FKTtcbiAgZm9yIChsZXQgeSA9IDA7IHkgPCBXT1JMRF9IRUlHSFQ7IHkrKykge1xuICAgIGZvciAobGV0IHogPSAtMTsgeiA8PSBDSFVOS19TSVpFOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSAtMTsgeCA8PSBDSFVOS19TSVpFOyB4KyspIHtcbiAgICAgICAgY29uc3QgaW5zaWRlID0geCA+PSAwICYmIHogPj0gMCAmJiB4IDwgQ0hVTktfU0laRSAmJiB6IDwgQ0hVTktfU0laRTtcbiAgICAgICAgb3V0W3BhZGRlZEluZGV4KHgsIHksIHopXSA9IGluc2lkZSA/IGRhdGFbbG9jYWxJbmRleCh4LCB5LCB6KV0gOiBuZWlnaGJvdXIoeCwgeSwgeik7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHBvc0Zyb20oYXhpczogbnVtYmVyLCBzbGljZTogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlciwgb3V0OiBJbnQzMkFycmF5KTogdm9pZCB7XG4gIGlmIChheGlzID09PSAwKSB7IG91dFswXSA9IHNsaWNlOyBvdXRbMV0gPSBpOyBvdXRbMl0gPSBqOyB9XG4gIGVsc2UgaWYgKGF4aXMgPT09IDEpIHsgb3V0WzBdID0gajsgb3V0WzFdID0gc2xpY2U7IG91dFsyXSA9IGk7IH1cbiAgZWxzZSB7IG91dFswXSA9IGk7IG91dFsxXSA9IGo7IG91dFsyXSA9IHNsaWNlOyB9XG59XG5cbmNsYXNzIEdyb3dhYmxlIHtcbiAgcHJpdmF0ZSBidWY6IEZsb2F0MzJBcnJheTtcbiAgbGVuZ3RoID0gMDtcbiAgY29uc3RydWN0b3IobjogbnVtYmVyKSB7IHRoaXMuYnVmID0gbmV3IEZsb2F0MzJBcnJheShuKTsgfVxuICBwdXNoMyhhOiBudW1iZXIsIGI6IG51bWJlciwgYzogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubGVuZ3RoICsgMyA+IHRoaXMuYnVmLmxlbmd0aCkgdGhpcy5ncm93KCk7XG4gICAgdGhpcy5idWZbdGhpcy5sZW5ndGgrK10gPSBhOyB0aGlzLmJ1Zlt0aGlzLmxlbmd0aCsrXSA9IGI7IHRoaXMuYnVmW3RoaXMubGVuZ3RoKytdID0gYztcbiAgfVxuICBwdXNoMShhOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5sZW5ndGggKyAxID4gdGhpcy5idWYubGVuZ3RoKSB0aGlzLmdyb3coKTtcbiAgICB0aGlzLmJ1Zlt0aGlzLmxlbmd0aCsrXSA9IGE7XG4gIH1cbiAgcHJpdmF0ZSBncm93KCk6IHZvaWQgeyBjb25zdCBuID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLmJ1Zi5sZW5ndGggKiAyKTsgbi5zZXQodGhpcy5idWYpOyB0aGlzLmJ1ZiA9IG47IH1cbiAgZG9uZSgpOiBGbG9hdDMyQXJyYXkgeyByZXR1cm4gdGhpcy5idWYuc2xpY2UoMCwgdGhpcy5sZW5ndGgpOyB9XG59XG5cbi8qKlxuICogR3JlZWR5IDNEIGZhY2UgbWVzaGVyLiBBIGZhY2UgaXMgZW1pdHRlZCB3aGVyZSBhbiBvcGFxdWUgdm94ZWwgdG91Y2hlcyBhXG4gKiBub24tb3BhcXVlIGNlbGwgKGFpciBvciB3YXRlcik7IG9ubHkgdGhlIGNodW5rIHRoYXQgb3ducyB0aGUgc29saWQgdm94ZWxcbiAqIGVtaXRzIGl0LiBPdXRwdXQgaXMgaWRlbnRpY2FsIHRvIHRoZSBmb3JtZXIgaW4tcGxhY2UgbWVzaGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWVzaFBhZGRlZChcbiAgcGFkZGVkOiBVaW50OEFycmF5LCBoZWlnaHRzOiBVaW50OEFycmF5LCBveDogbnVtYmVyLCBvejogbnVtYmVyLCBzZWVkOiBudW1iZXIsXG4pOiBNZXNoQXJyYXlzIHtcbiAgY29uc3Qgc2FtcGxlID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGlmICh5IDwgMCkgcmV0dXJuIE1BVC5CRURST0NLO1xuICAgIGlmICh5ID49IFdPUkxEX0hFSUdIVCkgcmV0dXJuIE1BVC5BSVI7XG4gICAgcmV0dXJuIHBhZGRlZFtwYWRkZWRJbmRleCh4LCB5LCB6KV07XG4gIH07XG4gIGNvbnN0IHBvc2l0aW9ucyA9IG5ldyBHcm93YWJsZSgxIDw8IDE1KSwgbm9ybWFscyA9IG5ldyBHcm93YWJsZSgxIDw8IDE1KTtcbiAgY29uc3QgY29sb3JzID0gbmV3IEdyb3dhYmxlKDEgPDwgMTUpLCBtYXRzID0gbmV3IEdyb3dhYmxlKDEgPDwgMTMpO1xuICBsZXQgaW5kaWNlcyA9IG5ldyBVaW50MzJBcnJheSgxIDw8IDE0KTtcbiAgbGV0IGluZGV4Q291bnQgPSAwO1xuICBsZXQgdmVydGV4Q291bnQgPSAwO1xuICBjb25zdCBkaW1zID0gW0NIVU5LX1NJWkUsIFdPUkxEX0hFSUdIVCwgQ0hVTktfU0laRV07XG4gIGNvbnN0IHBhID0gbmV3IEludDMyQXJyYXkoMyksIHBiID0gbmV3IEludDMyQXJyYXkoMyk7XG4gIGNvbnN0IGNvcm5lcnMgPSBuZXcgRmxvYXQzMkFycmF5KDEyKTtcblxuICBjb25zdCBlbWl0UXVhZCA9IChheGlzOiBudW1iZXIsIGRpcjogbnVtYmVyLCBzbGljZTogbnVtYmVyLFxuICAgIGkwOiBudW1iZXIsIGowOiBudW1iZXIsIHc6IG51bWJlciwgaDogbnVtYmVyLCBrZXk6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IHBsYW5lID0gc2xpY2UgKyAxO1xuICAgIGNvbnN0IHUwID0gaTAsIHUxID0gaTAgKyB3LCB2MCA9IGowLCB2MSA9IGowICsgaDtcbiAgICBjb25zdCBzZXQgPSAoazogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKSA9PiB7IGNvcm5lcnNbayAqIDNdID0geDsgY29ybmVyc1trICogMyArIDFdID0geTsgY29ybmVyc1trICogMyArIDJdID0gejsgfTtcbiAgICBpZiAoYXhpcyA9PT0gMCkge1xuICAgICAgY29uc3QgeCA9IG94ICsgcGxhbmUsIHkwID0gWV9NSU4gKyB1MCwgeTEgPSBZX01JTiArIHUxLCB6MCA9IG96ICsgdjAsIHoxID0gb3ogKyB2MTtcbiAgICAgIGlmIChkaXIgPiAwKSB7IHNldCgwLCB4LCB5MCwgejApOyBzZXQoMSwgeCwgeTEsIHowKTsgc2V0KDIsIHgsIHkxLCB6MSk7IHNldCgzLCB4LCB5MCwgejEpOyB9XG4gICAgICBlbHNlIHsgc2V0KDAsIHgsIHkwLCB6MCk7IHNldCgxLCB4LCB5MCwgejEpOyBzZXQoMiwgeCwgeTEsIHoxKTsgc2V0KDMsIHgsIHkxLCB6MCk7IH1cbiAgICB9IGVsc2UgaWYgKGF4aXMgPT09IDEpIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHBsYW5lLCB6MCA9IG96ICsgdTAsIHoxID0gb3ogKyB1MSwgeDAgPSBveCArIHYwLCB4MSA9IG94ICsgdjE7XG4gICAgICBpZiAoZGlyID4gMCkgeyBzZXQoMCwgeDAsIHksIHowKTsgc2V0KDEsIHgwLCB5LCB6MSk7IHNldCgyLCB4MSwgeSwgejEpOyBzZXQoMywgeDEsIHksIHowKTsgfVxuICAgICAgZWxzZSB7IHNldCgwLCB4MCwgeSwgejApOyBzZXQoMSwgeDEsIHksIHowKTsgc2V0KDIsIHgxLCB5LCB6MSk7IHNldCgzLCB4MCwgeSwgejEpOyB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHogPSBveiArIHBsYW5lLCB4MCA9IG94ICsgdTAsIHgxID0gb3ggKyB1MSwgeTAgPSBZX01JTiArIHYwLCB5MSA9IFlfTUlOICsgdjE7XG4gICAgICBpZiAoZGlyID4gMCkgeyBzZXQoMCwgeDAsIHkwLCB6KTsgc2V0KDEsIHgxLCB5MCwgeik7IHNldCgyLCB4MSwgeTEsIHopOyBzZXQoMywgeDAsIHkxLCB6KTsgfVxuICAgICAgZWxzZSB7IHNldCgwLCB4MCwgeTAsIHopOyBzZXQoMSwgeDAsIHkxLCB6KTsgc2V0KDIsIHgxLCB5MSwgeik7IHNldCgzLCB4MSwgeTAsIHopOyB9XG4gICAgfVxuICAgIGNvbnN0IGNvbG9yID0gY29sb3JGb3JLZXkoa2V5KTtcbiAgICBjb25zdCBtYXQgPSBrZXkgJiAxNTtcbiAgICBjb25zdCBueCA9IGF4aXMgPT09IDAgPyBkaXIgOiAwLCBueSA9IGF4aXMgPT09IDEgPyBkaXIgOiAwLCBueiA9IGF4aXMgPT09IDIgPyBkaXIgOiAwO1xuICAgIGNvbnN0IGJhc2UgPSB2ZXJ0ZXhDb3VudDtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IDQ7IGsrKykge1xuICAgICAgcG9zaXRpb25zLnB1c2gzKGNvcm5lcnNbayAqIDNdLCBjb3JuZXJzW2sgKiAzICsgMV0sIGNvcm5lcnNbayAqIDMgKyAyXSk7XG4gICAgICBub3JtYWxzLnB1c2gzKG54LCBueSwgbnopO1xuICAgICAgY29sb3JzLnB1c2gzKGNvbG9yLnIsIGNvbG9yLmcsIGNvbG9yLmIpO1xuICAgICAgbWF0cy5wdXNoMShtYXQpO1xuICAgIH1cbiAgICB2ZXJ0ZXhDb3VudCArPSA0O1xuICAgIGlmIChpbmRleENvdW50ICsgNiA+IGluZGljZXMubGVuZ3RoKSB7IGNvbnN0IG4gPSBuZXcgVWludDMyQXJyYXkoaW5kaWNlcy5sZW5ndGggKiAyKTsgbi5zZXQoaW5kaWNlcyk7IGluZGljZXMgPSBuOyB9XG4gICAgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZTsgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZSArIDE7IGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2UgKyAyO1xuICAgIGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2U7IGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2UgKyAyOyBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlICsgMztcbiAgfTtcblxuICBmb3IgKGxldCBheGlzID0gMDsgYXhpcyA8IDM7IGF4aXMrKykge1xuICAgIGNvbnN0IHUgPSAoYXhpcyArIDEpICUgMywgdiA9IChheGlzICsgMikgJSAzO1xuICAgIGNvbnN0IGR1ID0gZGltc1t1XSwgZHYgPSBkaW1zW3ZdLCBkZCA9IGRpbXNbYXhpc107XG4gICAgY29uc3QgbWFzayA9IG5ldyBVaW50MTZBcnJheShkdSAqIGR2KTtcbiAgICBmb3IgKGxldCBzbGljZSA9IC0xOyBzbGljZSA8IGRkOyBzbGljZSsrKSB7XG4gICAgICBtYXNrLmZpbGwoMCk7XG4gICAgICBsZXQgYW55ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGR2OyBqKyspIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkdTsgaSsrKSB7XG4gICAgICAgICAgcG9zRnJvbShheGlzLCBzbGljZSwgaSwgaiwgcGEpO1xuICAgICAgICAgIHBvc0Zyb20oYXhpcywgc2xpY2UgKyAxLCBpLCBqLCBwYik7XG4gICAgICAgICAgY29uc3QgYSA9IHNhbXBsZShwYVswXSwgcGFbMV0sIHBhWzJdKTtcbiAgICAgICAgICBjb25zdCBiID0gc2FtcGxlKHBiWzBdLCBwYlsxXSwgcGJbMl0pO1xuICAgICAgICAgIGNvbnN0IGFvID0gaXNPcGFxdWUoYSksIGJvID0gaXNPcGFxdWUoYik7XG4gICAgICAgICAgaWYgKGFvID09PSBibykgY29udGludWU7XG4gICAgICAgICAgY29uc3QgYUluc2lkZSA9IHNsaWNlID49IDAgJiYgc2xpY2UgPCBkZDtcbiAgICAgICAgICBjb25zdCBiSW5zaWRlID0gc2xpY2UgKyAxID49IDAgJiYgc2xpY2UgKyAxIDwgZGQ7XG4gICAgICAgICAgbGV0IHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG1hdDogbnVtYmVyLCBkaXI6IG51bWJlcjtcbiAgICAgICAgICBpZiAoYW8gJiYgIWJvICYmIGFJbnNpZGUpIHsgeCA9IHBhWzBdOyB5ID0gcGFbMV07IHogPSBwYVsyXTsgbWF0ID0gYTsgZGlyID0gMTsgfVxuICAgICAgICAgIGVsc2UgaWYgKGJvICYmICFhbyAmJiBiSW5zaWRlKSB7IHggPSBwYlswXTsgeSA9IHBiWzFdOyB6ID0gcGJbMl07IG1hdCA9IGI7IGRpciA9IC0xOyB9XG4gICAgICAgICAgZWxzZSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCB3eSA9IFlfTUlOICsgeTtcbiAgICAgICAgICBjb25zdCBzdXJmYWNlWSA9IGhlaWdodHNbeiAqIENIVU5LX1NJWkUgKyB4XSArIFlfTUlOO1xuICAgICAgICAgIGNvbnN0IGRlcHRoID0gc3VyZmFjZVkgLSAod3kgKyAxKTtcbiAgICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICAgIGlmIChheGlzID09PSAxICYmIGRpciA+IDApIHZhcmlhbnQgPSBoZWlnaHRCYW5kKHd5KTtcbiAgICAgICAgICBlbHNlIGlmIChheGlzID09PSAxICYmIGRpciA8IDApIHZhcmlhbnQgPSAxNTtcbiAgICAgICAgICBlbHNlIHZhcmlhbnQgPSAoTWF0aC5tYXgoMCwgTWF0aC5taW4oNywgZGVwdGgpKSAmIDcpIHwgKHN0b25lVG9uZSh3eSkgPDwgMyk7XG4gICAgICAgICAgbWFza1tqICogZHUgKyBpXSA9IGtleUZvcihtYXQsIHZhcmlhbnQsIHNoYWRlQXQob3ggKyB4LCB3eSwgb3ogKyB6LCBzZWVkKSwgYXhpcywgZGlyKTtcbiAgICAgICAgICBhbnkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIWFueSkgY29udGludWU7XG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGR2OyBqKyspIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkdTspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBtYXNrW2ogKiBkdSArIGldO1xuICAgICAgICAgIGlmICgha2V5KSB7IGkrKzsgY29udGludWU7IH1cbiAgICAgICAgICBsZXQgdyA9IDE7XG4gICAgICAgICAgd2hpbGUgKGkgKyB3IDwgZHUgJiYgbWFza1tqICogZHUgKyBpICsgd10gPT09IGtleSkgdysrO1xuICAgICAgICAgIGxldCBoID0gMTtcbiAgICAgICAgICBvdXRlcjogd2hpbGUgKGogKyBoIDwgZHYpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGsgPSAwOyBrIDwgdzsgaysrKSBpZiAobWFza1soaiArIGgpICogZHUgKyBpICsga10gIT09IGtleSkgYnJlYWsgb3V0ZXI7XG4gICAgICAgICAgICBoKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIGZvciAobGV0IGpqID0gMDsgamogPCBoOyBqaisrKSBmb3IgKGxldCBpaSA9IDA7IGlpIDwgdzsgaWkrKykgbWFza1soaiArIGpqKSAqIGR1ICsgaSArIGlpXSA9IDA7XG4gICAgICAgICAgZW1pdFF1YWQoYXhpcywgKGtleSA+PiAxMikgJiAxID8gMSA6IC0xLCBzbGljZSwgaSwgaiwgdywgaCwga2V5KTtcbiAgICAgICAgICBpICs9IHc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBwb3NpdGlvbnM6IHBvc2l0aW9ucy5kb25lKCksIG5vcm1hbHM6IG5vcm1hbHMuZG9uZSgpLCBjb2xvcnM6IGNvbG9ycy5kb25lKCksIG1hdHM6IG1hdHMuZG9uZSgpLFxuICAgIGluZGljZXM6IGluZGljZXMuc2xpY2UoMCwgaW5kZXhDb3VudCksIHRyaWFuZ2xlczogaW5kZXhDb3VudCAvIDMsXG4gIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTs7O0FDT25CLElBQU0sU0FBUyxvQkFBSSxRQUE2QjtBQWV6QyxTQUFTLGNBQWMsT0FBd0I7QUFDcEQsU0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLFVBQVU7QUFDdEM7OztBQ3RCTyxJQUFNLFFBQVEsQ0FBQyxHQUFXLEdBQVcsTUFBZSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSTtBQUM1RSxJQUFNLE9BQU8sQ0FBQyxHQUFXLEdBQVcsTUFBYyxLQUFLLElBQUksS0FBSztBQUNoRSxJQUFNLGFBQWEsQ0FBQyxJQUFZLElBQVksTUFBYztBQUMvRCxRQUFNLElBQUksT0FBTyxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsQ0FBQztBQUMxQyxTQUFPLElBQUksS0FBSyxJQUFJLElBQUk7QUFDMUI7QUFHTyxTQUFTLE9BQU8sR0FBVyxHQUFXLE1BQXNCO0FBQ2pFLE1BQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxTQUFTO0FBQy9ELE1BQUksS0FBSyxLQUFLLElBQUssTUFBTSxJQUFLLFVBQVU7QUFDeEMsV0FBUyxJQUFLLE1BQU0sUUFBUyxLQUFLO0FBQ3BDO0FBRU8sU0FBUyxPQUFPLEdBQVcsR0FBVyxHQUFXLE1BQXNCO0FBQzVFLE1BQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxTQUFTLElBQUksS0FBSyxLQUFLLEdBQUcsVUFBVTtBQUMxRixNQUFJLEtBQUssS0FBSyxJQUFLLE1BQU0sSUFBSyxVQUFVO0FBQ3hDLFdBQVMsSUFBSyxNQUFNLFFBQVMsS0FBSztBQUNwQztBQUVPLFNBQVMsV0FBVyxNQUE0QjtBQUNyRCxN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QUFPO0FBQ3JDLFdBQU8sVUFBVSxFQUFFLGNBQWMsRUFBRSxZQUFZO0FBQy9DLFdBQU8sVUFBVSxDQUFDLEdBQUcsVUFBVSxTQUFTLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLFNBQVMsT0FBTyxDQUFDLENBQUM7QUFDOUUsV0FBTyxNQUFNLGlCQUFpQixXQUFXLElBQUksR0FBRyxHQUFHLGlEQUFpRDtBQUNwRyxXQUFPLE9BQU8sTUFBTSxpQkFBaUIsWUFBWSxHQUFHLE9BQU8sR0FBRyxJQUFJLEdBQUcsaUJBQWlCO0FBRXRGLGFBQVMsS0FBSyxJQUFJLE1BQU0sR0FBRyxLQUFNLFVBQVMsS0FBSyxJQUFJLE1BQU0sR0FBRyxNQUFNO0FBQUUsa0JBQVksTUFBTSxLQUFLLElBQUksS0FBSyxFQUFFO0FBQUcsa0JBQVksV0FBVyxLQUFLLElBQUksS0FBSyxFQUFFO0FBQUEsSUFBRztBQUNuSixVQUFNLEtBQUssVUFBVSxNQUFNLENBQUM7QUFDNUIsVUFBTSxLQUFLLFdBQVcsVUFBVSxXQUFXLENBQUMsR0FBRyxFQUFFLFNBQVMsYUFBYSxFQUFFLEdBQUcsYUFBYSxFQUFFLEdBQUcsSUFBSTtBQUNsRyxXQUFPLFVBQVUsTUFBTSxLQUFLLEdBQUcsU0FBUyxHQUFHLE1BQU0sS0FBSyxHQUFHLFNBQVMsYUFBYSxVQUFVLEVBQUUsS0FBSyxDQUFDO0FBQ2pHLFdBQU8sVUFBVSxNQUFNLEtBQUssR0FBRyxPQUFPLEdBQUcsTUFBTSxLQUFLLEdBQUcsU0FBUyxNQUFPLEtBQUssQ0FBQztBQUFBLEVBQy9FLENBQUM7QUFDSDsiLAogICJuYW1lcyI6IFsiYyIsICJhIiwgImIiLCAic21vb3RoIiwgIlRIUkVFIiwgIlRIUkVFIiwgIk0iLCAiSCIsICJjIl0KfQo=
